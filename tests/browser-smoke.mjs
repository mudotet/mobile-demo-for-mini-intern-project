import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { access, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const url = process.env.GAME_PREVIEW_URL || 'http://127.0.0.1:8090';
const artifacts = resolve(import.meta.dirname, '../artifacts');
await mkdir(artifacts, { recursive: true });
let executablePath = process.env.CHROME_EXECUTABLE;
if (!executablePath) {
  for (const candidate of ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', `${homedir()}/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`]) {
    try { await access(candidate); executablePath = candidate; break; } catch {}
  }
}
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
const packageNames = { xp_gold: 'Scholar’s Spark', xp_gem: 'Arcane Wisdom', gold_small: 'Merchant’s Purse', gold_large: 'Royal Treasury', gem_small: 'Crystal Shards', gem_large: 'Gemstone Cache' };
const currencyNames = { gold: 'Gold', gem: 'Gems', xp: 'XP' };
const runtimeErrors = [];
const unexpectedNetworkFailures = [];

try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  page.on('pageerror', error => runtimeErrors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) runtimeErrors.push(message.text());
  });
  page.on('requestfailed', request => {
    const failed = new URL(request.url());
    if (failed.port !== '1' && !['/api/003002', '/api/002007'].includes(failed.pathname)) unexpectedNetworkFailures.push(failed.pathname);
  });
  page.on('response', response => {
    const failed = new URL(response.url());
    if (response.status() >= 400 && !(failed.pathname === '/api/003002' && response.status() === 409)) {
      unexpectedNetworkFailures.push(`${failed.pathname} HTTP${response.status()}`);
    }
  });
  let token;
  const requests = [];
  page.on('request', request => {
    if (request.url().endsWith('/api/003002')) requests.push({ body: request.postDataJSON(), id: request.headers()['x-request-id'] });
    if (request.headers().authorization) token = request.headers().authorization;
  });

  async function api(path, body = {}, expected = 200) {
    const response = await context.request.post(`${url}/api/${path}`, {
      headers: { Authorization: token, 'X-Request-Id': randomUUID() },
      data: body,
    });
    assert.equal(response.status(), expected);
    return response.json();
  }

  async function wallet(expected) {
    for (const resource of expected.resources) {
      await page.getByTestId(`wallet-${resource.resource_id}`).getByText(resource.quantity, { exact: true }).waitFor();
    }
  }

  function buyButton(offer, daily = false) {
    const price = daily ? offer.final_price : offer.price;
    const [currency, amount] = Object.entries(price.currency)[0];
    return page.getByRole('button', { name: `Buy ${packageNames[offer.package_id]} for ${amount} ${currencyNames[currency]}`, exact: true });
  }

  async function purchase(offer, daily = false, capture = false) {
    await buyButton(offer, daily).click();
    await page.getByText('A fair trade?', { exact: true }).waitFor();
    const response = page.waitForResponse(response => response.url().endsWith('/api/003002'));
    await page.getByRole('button', { name: 'CONFIRM PURCHASE', exact: true }).click();
    const receiptResponse = await response;
    assert.equal(receiptResponse.status(), 200);
    const receipt = await receiptResponse.json();
    await page.getByText('Treasure received', { exact: true }).waitFor();
    await page.getByText('A fair trade?', { exact: true }).waitFor({ state: 'hidden' });
    if (capture) await page.screenshot({ path: `${artifacts}/purchase.png` });
    await page.getByRole('button', { name: 'COLLECT', exact: true }).click();
    await page.getByText('Treasure received', { exact: true }).waitFor({ state: 'hidden' });
    await wallet(receipt);
    return receipt;
  }

  await page.goto(url);
  await page.getByRole('button', { name: 'ENTER THE SHOP', exact: true }).waitFor();
  const initial = await api('002007');
  await wallet(initial);
  assert.deepEqual(initial.resources.map(resource => [resource.resource_id, resource.quantity]), [['gem', '100'], ['gold', '1000'], ['xp', '0']]);
  await page.screenshot({ path: `${artifacts}/home.png` });
  await page.setViewportSize({ width: 375, height: 667 });
  await page.getByRole('button', { name: 'ENTER THE SHOP', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${artifacts}/home-small.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'ENTER THE SHOP', exact: true }).click();
  await page.getByText('DAILY OFFERS', { exact: true }).waitFor();
  await page.getByRole('button', { name: /^Buy / }).nth(8).waitFor();
  assert.equal(await page.getByRole('button', { name: /^Buy / }).count(), 9);
  const daily = await api('003005');
  const staticShop = await api('003004');
  const staticOffer = staticShop.slots.find(slot => slot.offer.package_id === 'xp_gold').offer;
  await page.screenshot({ path: `${artifacts}/shop.png` });
  await page.setViewportSize({ width: 375, height: 667 });
  await page.screenshot({ path: `${artifacts}/shop-small.png` });
  await page.setViewportSize({ width: 390, height: 844 });

  const countBeforeCancel = requests.length;
  await buyButton(staticOffer).click();
  await page.getByText('A fair trade?', { exact: true }).waitFor();
  assert.equal(requests.length, countBeforeCancel);
  await page.getByRole('button', { name: 'BACK TO SHOP', exact: true }).click();
  await page.getByText('A fair trade?', { exact: true }).waitFor({ state: 'hidden' });
  assert.deepEqual(await api('002007'), initial);
  const firstReceipt = await purchase(staticOffer, false, true);
  assert.equal(firstReceipt.resources.find(resource => resource.resource_id === 'gold').quantity, '900');
  await page.reload();
  await page.getByRole('button', { name: 'ENTER THE SHOP', exact: true }).waitFor();
  const restored = await api('002007');
  assert.equal(restored.player_id, initial.player_id);
  assert.deepEqual(restored.resources, firstReceipt.resources);
  await wallet(restored);
  await page.getByRole('button', { name: 'ENTER THE SHOP', exact: true }).click();

  const dailyOffer = [...daily.slots].sort((a, b) => (a.offer.final_price.currency.gold || 0) - (b.offer.final_price.currency.gold || 0))[0].offer;
  for (let count = 0; count < 3; count += 1) await purchase(dailyOffer, true);
  assert.equal(await buyButton(dailyOffer, true).isDisabled(), true);
  assert.equal((await api('003005')).slots.find(slot => slot.offer.offer_id === dailyOffer.offer_id).offer.remaining, 0);

  let committed;
  await page.route('**/api/003002', async route => {
    const response = await route.fetch();
    assert.equal(response.status(), 200);
    committed = await response.json();
    await route.abort('failed');
  }, { times: 1 });
  await buyButton(staticOffer).click();
  await page.getByRole('button', { name: 'CONFIRM PURCHASE', exact: true }).click();
  await page.getByRole('button', { name: 'CHECK PURCHASE', exact: true }).first().waitFor();
  const lostRequest = requests.at(-1);
  assert.ok(committed);
  const afterLoss = await api('002007');
  assert.deepEqual(afterLoss.resources, committed.resources);
  const concurrentReceipt = await api('003002', { id: staticOffer.offer_id, amount: 1 });
  await page.reload();
  await page.getByRole('button', { name: 'CHECK PURCHASE', exact: true }).waitFor();
  await wallet(concurrentReceipt);
  const restoredPending = await page.evaluate(() => Object.entries(localStorage).find(([key]) => key.startsWith('fantasy-game:'))?.[1]);
  assert.ok(JSON.parse(restoredPending).purchase);

  // A lost response can be replayed after another caller changed the wallet.
  await page.route('**/api/002007', route => route.abort('failed'));
  await page.getByRole('button', { name: 'CHECK PURCHASE', exact: true }).click();
  await page.getByText('Treasure received', { exact: true }).waitFor();
  assert.deepEqual(requests.at(-1), lostRequest);
  await page.getByText('Purchase confirmed. Refresh to update your pouch and the latest offers.', { exact: true }).first().waitFor();
  await wallet(concurrentReceipt);
  await page.getByRole('button', { name: 'COLLECT', exact: true }).click();
  await page.unroute('**/api/002007');
  await page.getByRole('button', { name: 'Refresh game', exact: true }).click();
  await wallet(concurrentReceipt);
  assert.deepEqual((await api('002007')).resources, concurrentReceipt.resources);
  await page.getByRole('button', { name: 'ENTER THE SHOP', exact: true }).click();
  await buyButton(staticOffer).waitFor();

  let current = await api('002007');
  while (BigInt(current.resources.find(resource => resource.resource_id === 'gold').quantity) >= 100n) {
    await purchase(staticOffer);
    current = await api('002007');
  }
  await buyButton(staticOffer).click();
  const failure = page.waitForResponse(response => response.url().endsWith('/api/003002'));
  await page.getByRole('button', { name: 'CONFIRM PURCHASE', exact: true }).click();
  assert.equal((await failure).status(), 409);
  await page.getByText('Your pouch is a little light. You need more currency for this offer.', { exact: true }).first().waitFor();
  assert.deepEqual(await api('002007'), current);
  await page.getByRole('button', { name: 'BACK TO SHOP', exact: true }).click();
  await page.getByText('A fair trade?', { exact: true }).waitFor({ state: 'hidden' });

  await page.setViewportSize({ width: 375, height: 667 });
  await page.getByRole('tab', { name: 'Home', exact: true }).click();
  await page.getByRole('button', { name: 'ENTER THE SHOP', exact: true }).scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: 'ENTER THE SHOP', exact: true }).click();

  await page.getByRole('button', { name: 'Connection settings', exact: true }).click();
  await page.getByRole('textbox', { name: 'Server address', exact: true }).fill('http://127.0.0.1:1');
  await page.getByRole('button', { name: 'CONNECT', exact: true }).click();
  await page.getByText('Could not reach your game server. Check the address and connect your phone and Mac to the same Wi-Fi.', { exact: true }).first().waitFor();
  await page.getByRole('textbox', { name: 'Server address', exact: true }).fill(url);
  await page.getByRole('button', { name: 'CONNECT', exact: true }).click();
  await page.getByRole('button', { name: 'ENTER THE SHOP', exact: true }).waitFor();
  assert.equal((await api('002007')).player_id, initial.player_id);
  await wallet(current);
  assert.deepEqual(runtimeErrors, []);
  assert.deepEqual(unexpectedNetworkFailures, []);
  console.log('Browser smoke passed at390×844 and375×667 against real local backend.');
  console.log('Verified auto login, nine offers, cancel/confirm, wallet/reload, daily sold out, insufficient funds, lost-response retry across reload, historical receipt wallet, connection recovery.');
  console.log(`Screenshots saved to ${artifacts}`);
  await context.close();
} finally {
  await browser.close();
}
