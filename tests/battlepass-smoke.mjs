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

try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const page = await context.newPage();
  const runtimeErrors = [];
  const unexpectedNetwork = [];
  const mutationRequests = [];
  let token;
  page.on('pageerror', error => runtimeErrors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) runtimeErrors.push(message.text());
  });
  page.on('response', response => {
    if (response.status() >= 400) unexpectedNetwork.push(`${new URL(response.url()).pathname} HTTP${response.status()}`);
  });
  page.on('requestfailed', request => {
    if (!request.url().endsWith('/api/004002')) unexpectedNetwork.push(new URL(request.url()).pathname);
  });
  page.on('request', request => {
    if (request.headers().authorization) token = request.headers().authorization;
    if (/\/api\/00400[234]$/.test(request.url())) {
      mutationRequests.push({ path: new URL(request.url()).pathname, body: request.postDataJSON(), id: request.headers()['x-request-id'] });
    }
  });

  async function api(path, body = {}) {
    const response = await context.request.post(`${url}/api/${path}`, {
      headers: { Authorization: token, 'X-Request-Id': randomUUID() },
      data: body,
    });
    assert.equal(response.status(), 200);
    return response.json();
  }

  async function wallet(player) {
    for (const resource of player.resources) {
      await page.getByTestId(`wallet-${resource.resource_id}`).getByText(resource.quantity, { exact: true }).waitFor();
    }
  }

  async function expbp(value) {
    await page.waitForFunction(expected => document.querySelector('[data-testid="pass-expbp"]')?.textContent === `${expected} / 600 EXPBP`, value);
  }

  async function openPass(section = 'Milestones') {
    await page.getByRole('tab', { name: 'Battle Pass', exact: true }).click();
    await page.getByRole('tab', { name: section, exact: true }).click();
  }

  function questCard(title) {
    return page.getByText(title, { exact: true }).locator('..').locator('..');
  }

  async function collect(title) {
    await page.getByText(title, { exact: true }).waitFor();
    await page.getByRole('button', { name: 'COLLECT', exact: true }).click();
    await page.getByText(title, { exact: true }).waitFor({ state: 'hidden' });
  }

  async function claimQuest(title, reward) {
    const response = page.waitForResponse(response => response.url().endsWith('/api/004004'));
    await questCard(title).getByRole('button', { name: `CLAIM +${reward} EXPBP`, exact: true }).click();
    const result = await response;
    assert.equal(result.status(), 200);
    const receipt = await result.json();
    await collect('Progress earned');
    await wallet(receipt);
    return receipt;
  }

  async function buyXp() {
    await page.getByRole('tab', { name: 'Shop', exact: true }).click();
    await page.getByRole('button', { name: 'Buy Scholar’s Spark for 100 Gold', exact: true }).click();
    const response = page.waitForResponse(response => response.url().endsWith('/api/003002'));
    await page.getByRole('button', { name: 'CONFIRM PURCHASE', exact: true }).click();
    const result = await response;
    assert.equal(result.status(), 200);
    const receipt = await result.json();
    await collect('Treasure received');
    await wallet(receipt);
    return receipt;
  }

  async function screenshot(name) {
    await page.getByTestId('pass-season-banner').scrollIntoViewIfNeeded();
    await page.waitForTimeout(350);
    await page.screenshot({ path: `${artifacts}/${name}.png` });
  }

  async function currentMilestone(step, centered = true) {
    await page.waitForFunction(({ step, centered }) => {
      const group = document.querySelector('[data-testid="pass-current-milestone"]');
      const ladder = document.querySelector('[data-testid="pass-ladder"]');
      if (!group || !ladder || !group.querySelector(`[data-testid="pass-node-premium_${step}"]`)
        || !group.querySelector(`[data-testid="pass-node-free_${step}"]`)) return false;
      const current = group.getBoundingClientRect();
      const viewport = ladder.getBoundingClientRect();
      return current.top < viewport.bottom && current.bottom > viewport.top
        && (!centered || Math.abs(current.y + current.height / 2 - viewport.y - viewport.height / 2) <= 24);
    }, { step, centered }, { timeout: 5000 });
  }

  async function verifyLadderLayout() {
    const expectedOrder = [6, 5, 4, 3, 2, 1].flatMap(step => [`premium_${step}`, `free_${step}`]);
    for (const viewport of [{ width: 390, height: 844 }, { width: 375, height: 667 }]) {
      await page.setViewportSize(viewport);
      // React Native commits its compact layout after the browser resize event.
      await page.waitForTimeout(250);
      const banner = page.getByTestId('pass-season-banner');
      const featured = page.getByTestId('pass-featured-panel');
      const ladder = page.getByTestId('pass-ladder');
      await ladder.waitFor();
      await currentMilestone(1, false);
      await page.screenshot({ path: `${artifacts}/pass-current-0-${viewport.width}.png` });
      await ladder.evaluate(element => { element.scrollTop = 0; });
      const [bannerBox, featuredBox, ladderBox, premiumBox, expBox] = await Promise.all([
        banner.boundingBox(), featured.boundingBox(), ladder.boundingBox(),
        page.getByRole('button', { name: 'Unlock Premium', exact: true }).boundingBox(),
        page.getByTestId('pass-expbp').boundingBox(),
      ]);
      const railBox = await page.getByTestId('pass-milestone-rail').boundingBox();
      assert.ok(railBox.width >= 8 && railBox.height >= ladderBox.height, 'The continuous milestone rail must remain at least8px wide through the ladder.');
      for (const box of [bannerBox, featuredBox, ladderBox, premiumBox, expBox]) {
        assert.ok(box && box.width > 0 && box.height > 0);
        assert.ok(box.x >= -1 && box.x + box.width <= viewport.width + 1, 'Battle Pass content must fit the viewport width.');
      }
      assert.ok(featuredBox.x + featuredBox.width <= ladderBox.x + 1, 'Featured reward and ladder must occupy separate left/right columns.');
      assert.ok(premiumBox.y >= featuredBox.y && premiumBox.y + premiumBox.height <= featuredBox.y + featuredBox.height + 1, 'Premium must stay reachable inside the featured panel.');
      assert.ok(premiumBox.height >= 44, 'Premium action must remain a usable mobile tap target.');
      assert.ok(expBox.y >= bannerBox.y && expBox.y + expBox.height <= bannerBox.y + bannerBox.height + 1, 'The season progress must fit inside its banner.');
      const nodes = await ladder.locator('[data-testid^="pass-node-"]').evaluateAll(elements => elements.map(element => {
        const box = element.getBoundingClientRect();
        return { id: element.getAttribute('data-testid').replace('pass-node-', ''), x: box.x, y: box.y, width: box.width, height: box.height };
      }));
      assert.deepEqual(nodes.map(node => node.id), expectedOrder);
      for (let index = 0; index < nodes.length; index += 1) {
        const node = nodes[index];
        assert.ok(node.x >= ladderBox.x - 1 && node.x + node.width <= ladderBox.x + ladderBox.width + 1, 'Reward cards must fit the ladder width.');
        assert.ok(Math.abs(node.x - nodes[0].x) <= 1, 'All twelve rewards must use one column.');
        if (index) assert.ok(node.y >= nodes[index - 1].y + nodes[index - 1].height, 'Descending reward cards must not overlap.');
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true);
      await page.mouse.move(ladderBox.x + ladderBox.width / 2, ladderBox.y + ladderBox.height / 2);
      await page.mouse.wheel(0, 600);
      await page.waitForFunction(() => document.querySelector('[data-testid="pass-ladder"]').scrollTop > 50);
      const afterScroll = await featured.boundingBox();
      assert.ok(Math.abs(afterScroll.x - featuredBox.x) <= 1 && Math.abs(afterScroll.y - featuredBox.y) <= 1,
        `Featured panel moved at ${viewport.width}×${viewport.height}: before ${JSON.stringify(featuredBox)}, after ${JSON.stringify(afterScroll)}.`);
      const movedNode = await ladder.getByTestId('pass-node-premium_6').boundingBox();
      assert.ok(movedNode.y < nodes[0].y - 50, 'The ladder must actually move independently.');
      await page.screenshot({ path: `${artifacts}/pass-ladder-scrolled-${viewport.width}.png` });
      await ladder.evaluate(element => { element.scrollTop = 0; });
      await page.screenshot({ path: `${artifacts}/pass-layout-${viewport.width}x${viewport.height}.png` });
    }
    await page.setViewportSize({ width: 390, height: 844 });
  }

  await page.goto(url);
  await page.getByRole('button', { name: 'ENTER THE SHOP', exact: true }).waitFor();
  const initialPlayer = await api('002007');
  await wallet(initialPlayer);
  assert.equal(initialPlayer.resources.find(item => item.resource_id === 'gem').quantity, '100');
  await openPass();
  const initialPass = await api('004001');
  assert.equal(initialPass.expbp, 0);
  assert.equal(initialPass.premium_owned, false);
  assert.equal(initialPass.milestones.length, 6);
  await expbp(0);
  assert.equal(await page.getByRole('button', { name: /^Locked Free milestone / }).count(), 6);
  assert.equal(await page.getByRole('button', { name: /^Unlock Premium for milestone / }).count(), 6);
  assert.equal(await page.getByTestId('pass-node-free_1').getByRole('button', { name: 'Locked Free milestone 1: 100 EXPBP required', exact: true }).isDisabled(), true);
  await currentMilestone(1, false);
  const initialLadderBox = await page.getByTestId('pass-ladder').boundingBox();
  const firstRewardBox = await page.getByTestId('pass-node-free_1').boundingBox();
  await page.screenshot({ path: `${artifacts}/pass-current-0.png` });
  assert.ok(firstRewardBox.y < initialLadderBox.y + initialLadderBox.height
    && firstRewardBox.y + firstRewardBox.height > initialLadderBox.y,
  `Opening a zero-EXPBP pass must show milestone1. Reward y=${firstRewardBox.y}, viewport bottom=${initialLadderBox.y + initialLadderBox.height}.`);
  await verifyLadderLayout();
  await screenshot('pass-milestones');

  const beforeCancel = mutationRequests.length;
  await page.getByRole('button', { name: 'Unlock Premium', exact: true }).click();
  await page.getByRole('button', { name: 'BACK TO PASS', exact: true }).click();
  await page.getByText('Unlock Premium', { exact: true }).waitFor({ state: 'hidden' });
  assert.equal(mutationRequests.length, beforeCancel);
  assert.deepEqual((await api('002007')).resources, initialPlayer.resources);
  await page.getByRole('tab', { name: 'Daily Quests', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: 'VISIT THE SHOP', exact: true }).count(), 3);
  await questCard('First Trade').getByText('0/1', { exact: true }).waitFor();
  await screenshot('pass-quests');

  await buyXp();
  await openPass('Daily Quests');
  await questCard('First Trade').getByText('1/1', { exact: true }).waitFor();
  await questCard('Arcane Studies').getByText('100/200', { exact: true }).waitFor();
  await expbp(0);
  const questReceipt = await claimQuest('First Trade', 100);
  assert.equal(questReceipt.pass.expbp, 100);
  assert.equal(questReceipt.resources.find(item => item.resource_id === 'xp').quantity, '100');
  await expbp(100);
  await page.getByRole('tab', { name: 'Milestones', exact: true }).click();
  await currentMilestone(1, false);
  await page.getByTestId('pass-node-free_1').getByRole('button', { name: 'Claim Free milestone 1: 100 Gold', exact: true }).click();
  await collect('Treasure received');
  assert.equal(await page.getByTestId('pass-node-free_1').getByRole('button', { name: 'Collected Free milestone 1: 100 Gold', exact: true }).isDisabled(), true);
  const afterFree = await api('002007');
  assert.equal(afterFree.resources.find(item => item.resource_id === 'gold').quantity, '1000');
  await wallet(afterFree);

  await page.waitForFunction(() => window.__dealerMetrics?.frames > 15);
  await page.getByTestId('pass-ladder').evaluate(element => { element.scrollTop = 0; });
  const celebrationsBeforePremium = await page.evaluate(() => window.__dealerMetrics.celebrations);
  let releasePremium;
  let committedPremium;
  const committed = new Promise((resolveCommit, reject) => {
    const timeout = setTimeout(() => reject(new Error('Premium purchase did not reach the server within15seconds.')), 15000);
    committedPremium = () => { clearTimeout(timeout); resolveCommit(); };
  });
  const held = new Promise(resolveResponse => { releasePremium = resolveResponse; });
  await page.route('**/api/004003', async route => {
    const response = await route.fetch();
    assert.equal(response.status(), 200);
    committedPremium();
    await held;
    await route.fulfill({ response });
  }, { times: 1 });
  await page.getByRole('button', { name: 'Unlock Premium', exact: true }).click();
  await page.getByRole('button', { name: 'CONFIRM PREMIUM', exact: true }).click();
  await committed;
  assert.equal(await page.evaluate(() => window.__dealerMetrics.celebrations), celebrationsBeforePremium);
  releasePremium();
  await collect('Premium unlocked');
  await currentMilestone(1, false);
  await page.getByText('PREMIUM ACTIVE', { exact: true }).waitFor();
  const premiumPlayer = await api('002007');
  assert.equal(premiumPlayer.resources.find(item => item.resource_id === 'gem').quantity, '50');
  assert.equal((await api('004001')).expbp, 100);
  await wallet(premiumPlayer);
  await page.waitForFunction(count => window.__dealerMetrics.celebrations === count + 1, celebrationsBeforePremium);
  await screenshot('pass-premium');

  const celebrationBeforeLost = await page.evaluate(() => window.__dealerMetrics.celebrations);
  let committedClaim;
  await page.route('**/api/004002', async route => {
    const response = await route.fetch();
    assert.equal(response.status(), 200);
    committedClaim = await response.json();
    await route.abort('failed');
  }, { times: 1 });
  await page.getByTestId('pass-node-premium_1').getByRole('button', { name: 'Claim Premium milestone 1: 10 Gems', exact: true }).click();
  await page.getByRole('button', { name: 'CHECK BATTLE PASS ACTION', exact: true }).waitFor();
  assert.ok(committedClaim);
  const lostRequest = mutationRequests.at(-1);
  assert.equal(committedClaim.resources.find(item => item.resource_id === 'gem').quantity, '60');
  assert.equal(await page.evaluate(() => window.__dealerMetrics.celebrations), celebrationBeforeLost);
  await page.setViewportSize({ width: 375, height: 667 });
  const pendingPanel = await page.getByTestId('pass-featured-panel').boundingBox();
  const pendingPremium = await page.getByText('PREMIUM ACTIVE', { exact: true }).boundingBox();
  assert.ok(pendingPanel.height > 0 && pendingPremium.y >= pendingPanel.y
    && pendingPremium.y + pendingPremium.height <= pendingPanel.y + pendingPanel.height + 1,
  'The featured Premium status must remain visible when pending/error notices reduce the available height.');
  await page.screenshot({ path: `${artifacts}/pass-pending-small.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('tab', { name: 'Shop', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: /^Buy / }).count(), 9);
  for (const button of await page.getByRole('button', { name: /^Buy / }).all()) assert.equal(await button.isDisabled(), true);
  await page.reload();
  await page.getByRole('button', { name: 'CHECK BATTLE PASS ACTION', exact: true }).waitFor();
  await wallet(committedClaim);
  const savedPending = await page.evaluate(() => JSON.parse(Object.entries(localStorage).find(([key]) => key.startsWith('fantasy-game:'))[1]).passOperation);
  assert.ok(savedPending);
  const beforeRetry = await page.evaluate(() => window.__dealerMetrics.celebrations);
  await page.getByRole('button', { name: 'CHECK BATTLE PASS ACTION', exact: true }).click();
  await collect('Treasure received');
  assert.deepEqual(mutationRequests.at(-1), lostRequest);
  assert.deepEqual((await api('002007')).resources, committedClaim.resources);
  await page.waitForFunction(count => window.__dealerMetrics.celebrations === count + 1, beforeRetry);
  await openPass();
  assert.equal(await page.getByTestId('pass-node-premium_1').getByRole('button', { name: 'Collected Premium milestone 1: 10 Gems', exact: true }).isDisabled(), true);
  assert.equal((await api('002007')).resources.find(item => item.resource_id === 'gem').quantity, '60');

  await buyXp();
  await buyXp();
  await openPass('Daily Quests');
  await questCard('Seasoned Trader').getByText('3/3', { exact: true }).waitFor();
  await questCard('Arcane Studies').getByText('200/200', { exact: true }).waitFor();
  await claimQuest('Seasoned Trader', 150);
  await claimQuest('Arcane Studies', 100);
  await expbp(350);
  await screenshot('pass-quests-complete');
  const completedPass = await api('004001');
  const completedPlayer = await api('002007');
  assert.equal(completedPass.expbp, 350);
  assert.equal(completedPass.premium_owned, true);
  assert.ok(completedPass.quests.every(quest => quest.claimed));
  await page.reload();
  await page.getByRole('button', { name: 'ENTER THE SHOP', exact: true }).waitFor();
  await openPass();
  await expbp(350);
  await currentMilestone(3);
  await page.getByText('PREMIUM ACTIVE', { exact: true }).waitFor();
  for (const id of ['free_1', 'premium_1']) assert.equal(await page.getByTestId(`pass-node-${id}`).getByRole('button', { name: /^Collected (Free|Premium) milestone / }).isDisabled(), true);
  for (const id of ['free_2', 'free_3', 'premium_2', 'premium_3']) assert.equal(await page.getByTestId(`pass-node-${id}`).getByRole('button', { name: /^Claim (Free|Premium) milestone / }).isDisabled(), false);
  const reloaded = await api('004001');
  assert.equal(reloaded.pass_id, completedPass.pass_id);
  assert.deepEqual(reloaded.milestones, completedPass.milestones);
  assert.deepEqual((await api('002007')).resources, completedPlayer.resources);
  await wallet(completedPlayer);
  for (let step = 1; step <= 6; step += 1) {
    for (const track of ['premium', 'free']) {
      const segment = page.getByTestId(`pass-rail-reached-${track}_${step}`);
      if (step <= 3) {
        const box = await segment.boundingBox();
        assert.ok(box.width >= 8 && box.height > 0, 'Reached milestones must retain a visible gold rail segment.');
      } else {
        assert.equal(await segment.count(), 0);
      }
    }
  }
  await page.getByRole('tab', { name: 'Shop', exact: true }).click();
  await openPass();
  await currentMilestone(3);
  await page.getByRole('tab', { name: 'Daily Quests', exact: true }).click();
  await page.getByRole('tab', { name: 'Milestones', exact: true }).click();
  await currentMilestone(3);
  const ladder = page.getByTestId('pass-ladder');
  const focusedScroll = await ladder.evaluate(element => element.scrollTop);
  const ladderBox = await ladder.boundingBox();
  await page.mouse.move(ladderBox.x + ladderBox.width / 2, ladderBox.y + ladderBox.height / 2);
  await page.mouse.wheel(0, -500);
  await page.waitForFunction(previous => Math.abs(document.querySelector('[data-testid="pass-ladder"]').scrollTop - previous) > 50, focusedScroll);
  const manualScroll = await ladder.evaluate(element => element.scrollTop);
  await page.waitForTimeout(1200);
  assert.ok(Math.abs(await ladder.evaluate(element => element.scrollTop) - manualScroll) <= 1, 'Ordinary timer updates must preserve manual ladder scrolling.');
  const refreshedPass = page.waitForResponse(response => response.url().endsWith('/api/004001'));
  await page.getByRole('button', { name: 'Refresh Battle Pass', exact: true }).click();
  assert.equal((await (await refreshedPass).json()).expbp, 350);
  await page.waitForFunction(() => {
    const button = document.querySelector('[aria-label="Refresh Battle Pass"]');
    return button && button.getAttribute('aria-disabled') !== 'true' && !button.disabled;
  });
  await page.waitForTimeout(1200);
  assert.ok(Math.abs(await ladder.evaluate(element => element.scrollTop) - manualScroll) <= 1, 'A same-EXPBP refresh must preserve manual ladder scrolling.');
  await page.getByRole('tab', { name: 'Shop', exact: true }).click();
  await openPass();
  await currentMilestone(3);
  await page.screenshot({ path: `${artifacts}/pass-current-350-390.png` });
  await page.screenshot({ path: `${artifacts}/pass-reached-rail.png` });
  await screenshot('pass-progress');
  await page.setViewportSize({ width: 375, height: 667 });
  await currentMilestone(3);
  await page.screenshot({ path: `${artifacts}/pass-current-350-375.png` });
  await screenshot('pass-milestones-small');
  await page.getByTestId('pass-node-free_1').getByRole('button', { name: 'Collected Free milestone 1: 100 Gold', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${artifacts}/pass-rewards-small.png` });
  await page.getByRole('tab', { name: 'Daily Quests', exact: true }).click();
  await screenshot('pass-quests-small');
  await questCard('First Trade').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${artifacts}/pass-quest-cards-small.png` });
  assert.deepEqual(runtimeErrors, []);
  assert.deepEqual(unexpectedNetwork, []);
  console.log('Battle Pass browser smoke passed against the real local backend at390×844 and375×667.');
  console.log('Verified manual quests/EXPBP, Free/Premium claims, cancel/no charge, confirmed celebration, lost-response retry across reload, shared pending lock, and persisted350EXPBP/Premium/claims.');
  console.log(`Screenshots saved to ${artifacts}`);
  await context.close();
} finally {
  await browser.close();
}
