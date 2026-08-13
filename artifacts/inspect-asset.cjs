// Inspect dimensions and detect grid for sprite images.
const { chromium } = require('C:/Users/jilig/AppData/Roaming/npm/node_modules/playwright/index.js');
const path = require('path');
const fs = require('fs');

const FILES = [
  'C:/AI/ParkingUSA/ASSETS/Asset 16.png',
  'C:/AI/ParkingUSA/ASSETS/ASSET 3.png',
  'C:/AI/ParkingUSA/ASSETS/ASSET 4.png',
  'C:/AI/ParkingUSA/ASSETS/ASSET 5.png',
  'C:/Users/jilig/Downloads/ChatGPT Image Aug 10, 2026, 09_48_23 PM.png',
];

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:/Users/jilig/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe',
  });
  const page = await browser.newPage();
  for (const file of FILES) {
    const b64 = fs.readFileSync(file).toString('base64');
    const url = `data:image/png;base64,${b64}`;
    const html = `<!doctype html><html><body style="margin:0;background:#222"><img src="${url}" style="display:block"/></body></html>`;
    await page.setContent(html);
    await page.waitForLoadState('domcontentloaded');
    const dims = await page.evaluate(() => {
      const img = document.querySelector('img');
      return { w: img.naturalWidth, h: img.naturalHeight };
    });
    console.log(`${path.basename(file)}: ${dims.w}x${dims.h}`);
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });