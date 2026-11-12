import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const previewUrl = process.env.GAME_PREVIEW_URL || 'http://127.0.0.1:8090';
const artifacts = resolve(import.meta.dirname, '../artifacts');
await mkdir(artifacts, { recursive: true });
let executablePath = process.env.CHROME_EXECUTABLE;
if (!executablePath) {
  for (const candidate of ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', `${homedir()}/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`]) {
    try { await access(candidate); executablePath = candidate; break; } catch {}
  }
}
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
const runtimeErrors = [];
const hash = data => createHash('sha256').update(data).digest('hex');

function inspectErrors(page, expectedGlFailure = () => false) {
  page.on('pageerror', error => runtimeErrors.push(error.message));
  page.on('console', message => {
    const text = message.text();
    if (expectedGlFailure() && /webgl|context|three\.webglrenderer/i.test(text)) return;
    if (message.type() === 'error' || /shader error|shader compilation|invalid_operation|invalid_enum/i.test(text)) runtimeErrors.push(text);
  });
}

async function metrics(page) {
  return page.evaluate(() => ({ ...window.__dealerMetrics }));
}

async function screenshot(page, name) {
  await page.waitForTimeout(650);
  return page.screenshot({ path: `${artifacts}/${name}.png` });
}

try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, reducedMotion: 'no-preference' });
  const page = await context.newPage();
  let expectedContextLoss = false;
  inspectErrors(page, () => expectedContextLoss);
  await page.goto(previewUrl);
  await page.getByRole('button', { name: 'ENTER THE SHOP', exact: true }).waitFor();
  const canvas = page.getByTestId('dealer-canvas').locator('canvas');
  await canvas.waitFor();
  await page.waitForFunction(() => window.__dealerMetrics?.frames > 5 && window.__dealerMetrics?.drawCalls > 0 && window.__dealerMetrics?.triangles > 0);
  const initial = await metrics(page);
  const firstFrame = await canvas.screenshot({ path: `${artifacts}/dealer-frame-a.png` });
  await page.waitForFunction(frames => window.__dealerMetrics.frames > frames + 15, initial.frames);
  const secondFrame = await canvas.screenshot({ path: `${artifacts}/dealer-frame-b.png` });
  assert.notEqual(hash(firstFrame), hash(secondFrame), 'Rendered dealer pixels must animate across frames.');
  await screenshot(page, 'dealer-home');

  const greetingBefore = (await metrics(page)).greetings;
  await page.getByRole('button', { name: 'Greet Orin', exact: true }).click();
  await page.waitForFunction(count => window.__dealerMetrics.greetings > count, greetingBefore);
  const cameraBeforeDrag = (await metrics(page)).camera[0];
  const greetingArea = await page.getByRole('button', { name: 'Greet Orin', exact: true }).boundingBox();
  await page.mouse.move(greetingArea.x + greetingArea.width * 0.45, greetingArea.y + greetingArea.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(greetingArea.x + greetingArea.width * 0.8, greetingArea.y + greetingArea.height * 0.6, { steps: 15 });
  await page.waitForFunction(position => Math.abs(window.__dealerMetrics.camera[0] - position) > 0.03, cameraBeforeDrag);
  await page.mouse.up();
  await page.waitForFunction(position => Math.abs(window.__dealerMetrics.camera[0] - position) < 0.02, cameraBeforeDrag);
  const touch = await context.newCDPSession(page);
  const touchX = greetingArea.x + greetingArea.width * 0.45;
  const touchY = greetingArea.y + greetingArea.height * 0.5;
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: touchX, y: touchY }] });
  for (let step = 1; step <= 10; step += 1) {
    await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: touchX + greetingArea.width * 0.035 * step, y: touchY }] });
  }
  await page.waitForFunction(position => Math.abs(window.__dealerMetrics.camera[0] - position) > 0.03, cameraBeforeDrag);
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForFunction(position => Math.abs(window.__dealerMetrics.camera[0] - position) < 0.02, cameraBeforeDrag);
  await touch.detach();

  const start = await metrics(page);
  const clockStart = performance.now();
  await page.waitForTimeout(1500);
  const finish = await metrics(page);
  const observedFps = (finish.frames - start.frames) / ((performance.now() - clockStart) / 1000);

  await page.getByRole('button', { name: 'ENTER THE SHOP', exact: true }).click();
  await page.waitForFunction(camera => window.__dealerMetrics.mode === 'shop' && window.__dealerMetrics.camera.length === 3 && Math.abs(window.__dealerMetrics.camera[2] - camera[2]) > 0.5, initial.camera);
  await page.getByText('DAILY OFFERS', { exact: true }).waitFor();
  await page.getByRole('button', { name: /^Buy / }).nth(8).waitFor();
  await screenshot(page, 'dealer-shop');

  let releaseResponse;
  let serverCommitted;
  let committedTimeout;
  const committed = new Promise((resolveCommit, reject) => {
    committedTimeout = setTimeout(() => reject(new Error('Purchase did not reach the real server within15seconds.')), 15000);
    serverCommitted = () => { clearTimeout(committedTimeout); resolveCommit(); };
  });
  const holdResponse = new Promise(resolveResponse => { releaseResponse = resolveResponse; });
  const celebrationBefore = (await metrics(page)).celebrations;
  await page.route('**/api/003002', async route => {
    const response = await route.fetch();
    assert.equal(response.status(), 200);
    serverCommitted();
    await holdResponse;
    await route.fulfill({ response });
  }, { times: 1 });
  await page.getByRole('button', { name: 'Buy Scholar’s Spark for 100 Gold', exact: true }).click();
  await page.getByText('A fair trade?', { exact: true }).waitFor();
  assert.equal((await metrics(page)).celebrations, celebrationBefore);
  await page.getByRole('button', { name: 'CONFIRM PURCHASE', exact: true }).click();
  await committed;
  assert.equal((await metrics(page)).celebrations, celebrationBefore, 'Celebration must wait until the app receives successful confirmation.');
  releaseResponse();
  await page.getByText('Treasure received', { exact: true }).waitFor();
  await page.waitForFunction(count => window.__dealerMetrics.celebrations === count + 1, celebrationBefore);
  await page.getByText('A fair trade?', { exact: true }).waitFor({ state: 'hidden' });
  await screenshot(page, 'dealer-purchase');
  await page.getByRole('button', { name: 'COLLECT', exact: true }).click();
  await page.getByText('Treasure received', { exact: true }).waitFor({ state: 'hidden' });

  await page.setViewportSize({ width: 375, height: 667 });
  await page.getByRole('tab', { name: 'Home', exact: true }).click();
  await screenshot(page, 'dealer-home-small');
  await page.getByRole('button', { name: 'ENTER THE SHOP', exact: true }).click();
  await screenshot(page, 'dealer-shop-small');

  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(150);
  const hiddenFrames = (await metrics(page)).frames;
  await page.waitForTimeout(500);
  assert.ok((await metrics(page)).frames <= hiddenFrames + 1, 'Scene should stop rendering while the document is hidden.');
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForFunction(frames => window.__dealerMetrics.frames > frames + 2, hiddenFrames);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForFunction(() => window.__dealerMetrics.reducedMotion === true);
  await page.waitForTimeout(200);
  const reducedFrames = (await metrics(page)).frames;
  await page.waitForTimeout(500);
  assert.ok((await metrics(page)).frames <= reducedFrames + 1, 'Reduced motion should avoid the continuous animation loop.');
  await screenshot(page, 'dealer-reduced-motion');

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.waitForFunction(() => window.__dealerMetrics.reducedMotion === false);
  expectedContextLoss = true;
  await canvas.evaluate(element => {
    const gl = element.getContext('webgl2') || element.getContext('webgl');
    const extension = gl.getExtension('WEBGL_lose_context');
    if (!extension) throw new Error('Context loss test requires WEBGL_lose_context.');
    extension.loseContext();
  });
  await page.getByRole('button', { name: 'Retry 3D scene', exact: true }).waitFor();
  assert.equal((await metrics(page)).contextLost, true);
  await page.getByRole('tab', { name: 'Home', exact: true }).click();
  await page.getByRole('button', { name: 'ENTER THE SHOP', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Retry 3D scene', exact: true }).click();
  await page.waitForFunction(() => window.__dealerMetrics.frames > 15 && window.__dealerMetrics.drawCalls > 0 && !window.__dealerMetrics.contextLost);
  expectedContextLoss = false;
  const summary = await metrics(page);
  await context.close();

  const unsupportedContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await unsupportedContext.addInitScript(() => {
    window.__testWebGlAllowed = false;
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (name, ...args) {
      if (name.startsWith('webgl') && !window.__testWebGlAllowed) return null;
      return original.call(this, name, ...args);
    };
  });
  const unsupportedPage = await unsupportedContext.newPage();
  inspectErrors(unsupportedPage);
  await unsupportedPage.goto(previewUrl);
  await unsupportedPage.getByRole('button', { name: 'Retry 3D scene', exact: true }).waitFor();
  await unsupportedPage.getByRole('button', { name: 'ENTER THE SHOP', exact: true }).waitFor();
  await screenshot(unsupportedPage, 'dealer-unavailable');
  await unsupportedPage.getByRole('button', { name: 'ENTER THE SHOP', exact: true }).click();
  await unsupportedPage.getByRole('button', { name: 'Buy Scholar’s Spark for 100 Gold', exact: true }).click();
  await unsupportedPage.getByRole('button', { name: 'CONFIRM PURCHASE', exact: true }).click();
  await unsupportedPage.getByText('Treasure received', { exact: true }).waitFor();
  await unsupportedPage.getByRole('button', { name: 'COLLECT', exact: true }).click();
  await unsupportedPage.getByText('Treasure received', { exact: true }).waitFor({ state: 'hidden' });
  assert.equal(await unsupportedPage.getByTestId('wallet-gold').innerText(), '900');
  await unsupportedPage.evaluate(() => { window.__testWebGlAllowed = true; });
  await unsupportedPage.getByRole('button', { name: 'Retry 3D scene', exact: true }).click();
  await unsupportedPage.waitForFunction(() => window.__dealerMetrics.frames > 15 && window.__dealerMetrics.drawCalls > 0);
  await unsupportedContext.close();
  assert.deepEqual(runtimeErrors, []);

  console.log(`Dealer rendered ${summary.drawCalls} draw calls and ${summary.triangles} triangles, approximately ${observedFps.toFixed(1)} frames/s in local headless Chrome.`);
  console.log(`Verified moving pixels, greeting, mouse/touch drag, camera transition, successful-purchase celebration, responsive layouts, visibility pause, reduced motion, context loss/retry, unsupported WebGL fallback with working purchase. Screenshots: ${artifacts}`);
} finally {
  await browser.close();
}
