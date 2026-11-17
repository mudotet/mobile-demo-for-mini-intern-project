import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { access } from 'node:fs/promises';
import { homedir } from 'node:os';
import { chromium } from 'playwright';

const url = process.env.GAME_PREVIEW_URL || 'http://127.0.0.1:8090';
let executablePath = process.env.CHROME_EXECUTABLE;
if (!executablePath) {
  for (const candidate of ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', `${homedir()}/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`]) {
    try { await access(candidate); executablePath = candidate; break; } catch {}
  }
}
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const runtimeErrors = [];
  page.on('pageerror', error => runtimeErrors.push(error.message));
  const logins = [];
  const devices = [];
  page.on('response', async response => {
    if (response.url().endsWith('/api/001002') && response.status() === 200) {
      devices.push(response.request().postDataJSON().device_id);
      logins.push(await response.json());
    }
  });
  const home = page.getByRole('button', { name: 'ENTER THE SHOP', exact: true });
  async function api(path, token, body = {}) {
    const response = await context.request.post(`${url}/api/${path}`, {
      headers: { Authorization: `Bearer ${token}`, 'X-Request-Id': randomUUID() }, data: body,
    });
    assert.equal(response.status(), 200);
    return response.json();
  }
  async function wallet(player) {
    for (const resource of player.resources) {
      await page.getByTestId(`wallet-${resource.resource_id}`).getByText(resource.quantity, { exact: true }).waitFor();
    }
  }
  await page.goto(url);
  await home.waitFor();
  assert.equal(logins.length, 1);
  const oldLogin = logins[0];
  const oldPlayer = await api('002007', oldLogin.access_token);
  await home.click();
  await page.getByRole('button', { name: 'Buy Scholar’s Spark for 100 Gold', exact: true }).click();
  const purchased = page.waitForResponse(response => response.url().endsWith('/api/003002'));
  await page.getByRole('button', { name: 'CONFIRM PURCHASE', exact: true }).click();
  const receipt = await (await purchased).json();
  assert.equal(receipt.resources.find(resource => resource.resource_id === 'gold').quantity, '900');
  await page.getByRole('button', { name: 'COLLECT', exact: true }).click();
  await wallet(receipt);
  await page.getByRole('button', { name: 'Connection settings', exact: true }).click();
  await page.getByRole('button', { name: 'CREATE NEW DEMO ACCOUNT', exact: true }).click();
  await home.waitFor();
  await page.getByText('Connection', { exact: true }).waitFor({ state: 'hidden' });
  assert.equal(logins.length, 2);
  const newLogin = logins[1];
  assert.notEqual(newLogin.player_id, oldPlayer.player_id);
  assert.equal(newLogin.new_account, true);
  const fresh = await api('002007', newLogin.access_token);
  assert.deepEqual(fresh.resources.map(resource => [resource.resource_id, resource.quantity]), [['gem', '100'], ['gold', '1000'], ['xp', '0']]);
  await wallet(fresh);
  assert.deepEqual((await api('002007', oldLogin.access_token)).resources, receipt.resources);
  await page.reload();
  await home.waitFor();
  await wallet(fresh);
  const saved = await page.evaluate(() => Object.entries(localStorage).find(([key]) => key.startsWith('fantasy-game:'))?.[1]);
  assert.ok(saved);
  const stored = JSON.parse(saved);
  assert.equal(stored.deviceId, devices[1]);
  assert.notEqual(devices[1], devices[0]);
  assert.equal(logins.at(-1).player_id, newLogin.player_id);
  assert.deepEqual(runtimeErrors, []);
  console.log('Demo account browser smoke passed: spent old account, switched to new identity and initial resources, retained old backend data, persisted reload.');
} finally {
  await browser.close();
}
