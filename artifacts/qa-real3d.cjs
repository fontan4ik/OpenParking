const { chromium } = require('C:/Users/jilig/AppData/Roaming/npm/node_modules/playwright/index.js');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  const badResponses = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('response', (r) => { if (r.status() >= 400) badResponses.push({ status: r.status(), url: r.url() }); });
  await page.goto('http://127.0.0.1:3021/?theme=dark', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.car-3d[data-media-state="ready"]', { timeout: 30000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  const car = page.locator('.car-3d');
  const canvas = page.locator('.car-3d canvas');
  const cBounds = await canvas.boundingBox();
  const cSize = await canvas.evaluate((node) => ({ width: node.width, height: node.height }));
  const hash = (dataUrl) => {
    const [_, base] = dataUrl.split(',');
    return base.length;
  };
  const placeholder = await canvas.evaluate((node) => node.toDataURL('image/png').length);
  await page.mouse.move(cBounds.x + cBounds.width * 0.5, cBounds.y + cBounds.height * 0.5);
  await page.waitForTimeout(600);
  const center = await canvas.evaluate((node) => node.toDataURL('image/png').length);
  await page.mouse.move(cBounds.x + cBounds.width * 0.05, cBounds.y + cBounds.height * 0.85);
  await page.waitForTimeout(600);
  const leftY = await canvas.evaluate((node) => node.toDataURL('image/png').length);
  await page.mouse.move(cBounds.x + cBounds.width * 0.95, cBounds.y + cBounds.height * 0.2);
  await page.waitForTimeout(600);
  const rightX = await canvas.evaluate((node) => node.toDataURL('image/png').length);
  await page.screenshot({ path: 'artifacts/landing-after-fix-3q.png' });
  const dragStart = { x: cBounds.x + cBounds.width * 0.5, y: cBounds.y + cBounds.height * 0.5 };
  const dragEnd = { x: dragStart.x + 240, y: dragStart.y };
  await page.mouse.move(dragStart.x, dragStart.y);
  await page.mouse.down();
  await page.mouse.move(dragStart.x + 30, dragStart.y, { steps: 4 });
  await page.waitForTimeout(150);
  await page.mouse.move(dragEnd.x, dragEnd.y, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  const afterDrag = await canvas.evaluate((node) => node.toDataURL('image/png').length);
  await page.screenshot({ path: 'artifacts/landing-after-drag.png' });
  // Reset by reloading
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.car-3d[data-media-state="ready"]', { timeout: 30000 });
  await page.locator('.hero-editorial__actions a.landing-primary[href=\'/map\']').click();
  await page.waitForURL('**/map');
  await page.waitForSelector('.maplibregl-canvas', { timeout: 30000 });
  const mapSize = await page.locator('.maplibregl-canvas').evaluate((node) => ({ width: node.width, height: node.height }));
  await context.close();
  const reduced = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const r = await reduced.newPage();
  await r.goto('http://127.0.0.1:3021/?theme=light', { waitUntil: 'domcontentloaded' });
  await r.waitForSelector('.car-3d[data-media-state="ready"]', { state: 'attached', timeout: 30000 });
  const reducedState = await r.locator('.car-3d').getAttribute('data-media-state');
  await r.screenshot({ path: 'artifacts/landing-reduced-motion.png' });
  await reduced.close();
  await browser.close();
  const fsx = (p) => { try { return fs.statSync(p).size; } catch { return 0; } };
  console.log(JSON.stringify({
    cBounds, cSize, center, leftY, rightX, afterDrag, mapSize, reducedState,
    screenshots: {
      hero: fsx('artifacts/landing-after-fix-3q.png'),
      drag: fsx('artifacts/landing-after-drag.png'),
      reduced: fsx('artifacts/landing-reduced-motion.png'),
    },
    errors, badResponses,
  }, null, 2));
})().catch((error) => { console.error(error); process.exitCode = 1; });
