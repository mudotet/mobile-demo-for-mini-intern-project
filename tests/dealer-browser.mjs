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

function cameraYaw(camera) {
  return Math.atan2(camera[0], camera[2]);
}

async function screenshot(page, name) {
  await page.waitForTimeout(650);
  return page.screenshot({ path: `${artifacts}/${name}.png` });
}

try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, reducedMotion: 'no-preference' });
  const page = await context.newPage();
  let expectedContextLoss = false;
  let shopPurchaseRequests = 0;
  inspectErrors(page, () => expectedContextLoss);
  page.on('request', request => { if (request.url().endsWith('/api/003002')) shopPurchaseRequests += 1; });
  await page.goto(previewUrl);
  await page.getByRole('button', { name: 'ENTER THE SHOP', exact: true }).waitFor();
  const canvas = page.getByTestId('dealer-canvas').locator('canvas');
  await canvas.waitFor();
  const originalCanvas = await canvas.elementHandle();
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
  const greetingsAfterTap = (await metrics(page)).greetings;
  const yawBeforeDrag = cameraYaw((await metrics(page)).camera);
  const greetingArea = await page.getByRole('button', { name: 'Greet Orin', exact: true }).boundingBox();
  await page.mouse.move(greetingArea.x + greetingArea.width * 0.45, greetingArea.y + greetingArea.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(greetingArea.x + greetingArea.width * 0.8, greetingArea.y + greetingArea.height * 0.5, { steps: 15 });
  await page.waitForTimeout(1300);
  const mouseRightYaw = cameraYaw((await metrics(page)).camera);
  await page.screenshot({ path: `${artifacts}/dealer-orbit-right.png` });
  assert.ok(Math.abs(mouseRightYaw - yawBeforeDrag) >= 0.12,
    `Mouse drag must expose a different 3D viewpoint; observed yaw change ${Math.abs(mouseRightYaw - yawBeforeDrag).toFixed(3)} rad.`);
  await page.mouse.up();
  await page.waitForTimeout(1000);
  assert.ok(Math.abs(cameraYaw((await metrics(page)).camera) - mouseRightYaw) < 0.03, 'The viewpoint must stay available for inspection after release.');
  await page.mouse.move(greetingArea.x + greetingArea.width * 0.8, greetingArea.y + greetingArea.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(greetingArea.x + greetingArea.width * 0.2, greetingArea.y + greetingArea.height * 0.5, { steps: 18 });
  await page.waitForTimeout(1300);
  const mouseLeftYaw = cameraYaw((await metrics(page)).camera);
  assert.ok((mouseLeftYaw - yawBeforeDrag) * (mouseRightYaw - yawBeforeDrag) < 0
    && Math.abs(mouseLeftYaw - yawBeforeDrag) >= 0.12, 'An opposite mouse drag must expose the other side of the dealer.');
  await page.mouse.up();
  await page.waitForTimeout(650);
  assert.ok(Math.abs(cameraYaw((await metrics(page)).camera) - mouseLeftYaw) < 0.03);
  await page.screenshot({ path: `${artifacts}/dealer-orbit-left.png` });

  const touch = await context.newCDPSession(page);
  const touchX = greetingArea.x + greetingArea.width * 0.2;
  const touchY = greetingArea.y + greetingArea.height * 0.5;
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: touchX, y: touchY }] });
  for (let step = 1; step <= 10; step += 1) {
    await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: touchX + greetingArea.width * 0.065 * step, y: touchY }] });
  }
  await page.waitForTimeout(1300);
  const touchRightYaw = cameraYaw((await metrics(page)).camera);
  assert.ok(Math.abs(touchRightYaw - mouseLeftYaw) >= 0.12, 'Touch drag must meaningfully orbit the camera.');
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(1000);
  assert.ok(Math.abs(cameraYaw((await metrics(page)).camera) - touchRightYaw) < 0.03, 'Touch orbit must remain after release.');
  const oppositeTouchX = greetingArea.x + greetingArea.width * 0.85;
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: oppositeTouchX, y: touchY }] });
  for (let step = 1; step <= 10; step += 1) {
    await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: oppositeTouchX - greetingArea.width * 0.07 * step, y: touchY }] });
  }
  await page.waitForTimeout(1300);
  const touchLeftYaw = cameraYaw((await metrics(page)).camera);
  assert.ok((touchLeftYaw - yawBeforeDrag) * (touchRightYaw - yawBeforeDrag) < 0
    && Math.abs(touchLeftYaw - yawBeforeDrag) >= 0.12, 'An opposite touch drag must expose the other side.');
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(650);
  assert.ok(Math.abs(cameraYaw((await metrics(page)).camera) - touchLeftYaw) < 0.03);
  assert.equal((await metrics(page)).greetings, greetingsAfterTap, 'Orbit drags must not trigger greeting taps.');
  await page.getByRole('button', { name: 'Greet Orin', exact: true }).click();
  await page.waitForFunction(count => window.__dealerMetrics.greetings === count + 1, greetingsAfterTap);

  await page.setViewportSize({ width: 375, height: 568 });
  const verticalArea = await page.getByRole('button', { name: 'Greet Orin', exact: true }).boundingBox();
  const scrollBefore = await page.getByRole('button', { name: 'Greet Orin', exact: true }).evaluate(element => {
    let parent = element.parentElement;
    while (parent && !(parent.scrollHeight > parent.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(parent).overflowY))) parent = parent.parentElement;
    if (!parent) throw new Error('Short Home viewport must provide a scrollable area.');
    return parent.scrollTop;
  });
  const yawBeforeScroll = cameraYaw((await metrics(page)).camera);
  const verticalX = verticalArea.x + verticalArea.width / 2;
  const verticalY = verticalArea.y + verticalArea.height * 0.8;
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: verticalX, y: verticalY }] });
  for (let step = 1; step <= 10; step += 1) {
    await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: verticalX, y: verticalY - step * 10 }] });
  }
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(650);
  const scrollAfter = await page.getByRole('button', { name: 'Greet Orin', exact: true }).evaluate(element => {
    let parent = element.parentElement;
    while (parent && !(parent.scrollHeight > parent.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(parent).overflowY))) parent = parent.parentElement;
    return parent.scrollTop;
  });
  assert.ok(scrollAfter > scrollBefore + 5, 'Vertical touch drag over the dealer must retain normal Home scrolling.');
  assert.ok(Math.abs(cameraYaw((await metrics(page)).camera) - yawBeforeScroll) < 0.03, 'Vertical scrolling must not orbit the camera.');
  await page.setViewportSize({ width: 390, height: 844 });
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

  const stalledFrame = await page.evaluate(() => new Promise(resolveFrame => {
    requestAnimationFrame(() => {
      const before = { time: window.__dealerMetrics.animationTime, frames: window.__dealerMetrics.frames };
      const deadline = performance.now() + 350;
      while (performance.now() < deadline) {}
      requestAnimationFrame(() => resolveFrame({
        before,
        after: { time: window.__dealerMetrics.animationTime, frames: window.__dealerMetrics.frames },
      }));
    });
  }));
  const stalledAnimationAdvance = stalledFrame.after.time - stalledFrame.before.time;
  assert.ok(Number.isFinite(stalledFrame.after.frames) && stalledFrame.after.frames > stalledFrame.before.frames);
  assert.ok(Number.isFinite(stalledAnimationAdvance) && stalledAnimationAdvance >= 0.30,
    `A 350 ms stalled frame must advance animation by at least 0.30 s. Observed ${stalledAnimationAdvance.toFixed(3)} s.`);

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
  assert.equal(await page.getByTestId('purchase-celebration').isVisible(), false);
  releaseResponse();
  await page.getByText('Treasure received', { exact: true }).waitFor();
  await page.waitForFunction(count => window.__dealerMetrics.celebrations === count + 1, celebrationBefore);
  await page.getByText('A fair trade?', { exact: true }).waitFor({ state: 'hidden' });
  await page.getByTestId('purchase-celebration').waitFor();
  await page.waitForFunction(() => {
    const camera = window.__dealerMetrics.camera;
    return window.__dealerMetrics.mode === 'celebration' && Math.abs(camera[0]) < 0.2
      && Math.abs(camera[1] - 2.6) < 0.1 && Math.abs(camera[2] - 6.5) < 0.25;
  });
  const interfaceStyle = await page.getByTestId('game-interface').evaluate(element => ({
    opacity: getComputedStyle(element).opacity,
    pointerEvents: getComputedStyle(element).pointerEvents,
  }));
  assert.deepEqual(interfaceStyle, { opacity: '0', pointerEvents: 'none' });
  assert.equal(await page.getByRole('tab', { name: 'Shop', exact: true }).count(), 0, 'Hidden navigation must leave the accessible tree.');
  assert.equal(await page.getByRole('button', { name: /^Buy / }).count(), 0);
  assert.equal(await page.locator('canvas').count(), 1);
  assert.equal(await originalCanvas.evaluate(element => element.isConnected
    && element === document.querySelector('[data-testid="dealer-canvas"] canvas')), true);
  const stage = page.getByTestId('celebration-stage');
  assert.equal(await stage.evaluate(element => getComputedStyle(element).backgroundColor), 'rgba(0, 0, 0, 0)');
  assert.equal(await stage.evaluate(element => {
    const box = element.getBoundingClientRect();
    return element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
  }), true, 'The dealer stage must receive foreground input.');
  const confirmedPurchases = shopPurchaseRequests;
  const cheerBefore = (await metrics(page)).celebrations;
  await page.getByRole('button', { name: 'Celebrate with Orin', exact: true }).click();
  await page.waitForFunction(count => window.__dealerMetrics.celebrations === count + 1, cheerBefore);
  assert.equal(shopPurchaseRequests, confirmedPurchases, 'Cheering must not send another purchase request.');
  await screenshot(page, 'dealer-purchase');
  await page.setViewportSize({ width: 375, height: 667 });
  const smallStage = await stage.boundingBox();
  const smallCollect = await page.getByRole('button', { name: 'COLLECT', exact: true }).boundingBox();
  assert.ok(smallStage.height > 150 && smallStage.width > 250, 'The dealer must retain a usable transparent center stage.');
  assert.ok(smallCollect.y >= 0 && smallCollect.y + smallCollect.height <= 667, 'Collect must remain reachable on a small screen.');
  await screenshot(page, 'dealer-purchase-small');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForFunction(() => window.__dealerMetrics.reducedMotion === true);
  const reducedCheerBefore = (await metrics(page)).celebrations;
  await stage.click();
  await page.waitForFunction(count => window.__dealerMetrics.celebrations === count + 1, reducedCheerBefore);
  await page.waitForTimeout(200);
  const reducedCheerFrames = (await metrics(page)).frames;
  await page.waitForTimeout(500);
  assert.ok((await metrics(page)).frames <= reducedCheerFrames + 1, 'Reduced Motion cheer must settle without a continuous animation loop.');
  assert.equal(shopPurchaseRequests, confirmedPurchases);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'COLLECT', exact: true }).click();
  await page.getByText('Treasure received', { exact: true }).waitFor({ state: 'hidden' });
  await page.waitForFunction(() => window.__dealerMetrics.mode === 'shop');
  assert.equal(await page.getByRole('tab', { name: 'Shop', exact: true }).count(), 1);
  assert.equal(await originalCanvas.evaluate(element => element.isConnected), true);

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

  await page.getByRole('tab', { name: 'Home', exact: true }).click();
  await page.waitForFunction(() => window.__dealerMetrics.mode === 'home');
  const reducedYawBefore = cameraYaw((await metrics(page)).camera);
  const reducedArea = await page.getByRole('button', { name: 'Greet Orin', exact: true }).boundingBox();
  await page.mouse.move(reducedArea.x + reducedArea.width * 0.2, reducedArea.y + reducedArea.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(reducedArea.x + reducedArea.width * 0.8, reducedArea.y + reducedArea.height * 0.5, { steps: 15 });
  await page.waitForFunction(position => {
    const camera = window.__dealerMetrics.camera;
    return Math.abs(Math.atan2(camera[0], camera[2]) - position) >= 0.12;
  }, reducedYawBefore);
  await page.mouse.up();
  await page.waitForTimeout(200);
  const manualReduced = await metrics(page);
  await page.waitForTimeout(500);
  assert.ok((await metrics(page)).frames <= manualReduced.frames + 1, 'Manual orbit with Reduce Motion must settle without continuous animation.');
  assert.ok(Math.abs(cameraYaw((await metrics(page)).camera) - cameraYaw(manualReduced.camera)) < 0.01);
  await screenshot(page, 'dealer-reduced-motion-orbit');

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
  console.log(`Animation advanced ${stalledAnimationAdvance.toFixed(3)} s after a 350 ms main-thread stall.`);
  console.log(`Verified moving pixels, greeting, retained mouse/touch orbit, opposite viewpoints, normal vertical scrolling, camera transition, successful-purchase celebration, responsive layouts, visibility pause, reduced motion, context loss/retry, unsupported WebGL fallback with working purchase. Screenshots: ${artifacts}`);
} finally {
  await browser.close();
}
