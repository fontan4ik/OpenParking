// Slice sprite images into individual tiles.
const { chromium } = require('C:/Users/jilig/AppData/Roaming/npm/node_modules/playwright/index.js');
const path = require('path');
const fs = require('fs');

const TASKS = [
  { src: 'C:/AI/ParkingUSA/ASSETS/Asset 16.png', out: 'C:/AI/ParkingUSA/apps/frontend/public/icons/icon-sprite', cols: 5, rows: 1, prefix: 'icon' },
  { src: 'C:/Users/jilig/Downloads/ChatGPT Image Aug 10, 2026, 09_48_23 PM.png', out: 'C:/AI/ParkingUSA/apps/frontend/public/media/cars', cols: 4, rows: 1, prefix: 'angle' },
  { src: 'C:/AI/ParkingUSA/ASSETS/ASSET 3.png', out: 'C:/AI/ParkingUSA/apps/frontend/public/icons/icon-asset3', cols: 1, rows: 1, prefix: 'a3' },
  { src: 'C:/AI/ParkingUSA/ASSETS/ASSET 4.png', out: 'C:/AI/ParkingUSA/apps/frontend/public/icons/icon-asset4', cols: 1, rows: 1, prefix: 'a4' },
  { src: 'C:/AI/ParkingUSA/ASSETS/ASSET 5.png', out: 'C:/AI/ParkingUSA/apps/frontend/public/icons/icon-asset5', cols: 1, rows: 1, prefix: 'a5' },
];

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:/Users/jilig/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe',
  });
  const page = await browser.newPage();
  for (const t of TASKS) {
    fs.mkdirSync(t.out, { recursive: true });
    const b64 = fs.readFileSync(t.src).toString('base64');
    const dataUrl = `data:image/png;base64,${b64}`;
    const html = `<!doctype html><html><body style="margin:0;background:#fff"><img id="src" src="${dataUrl}" style="display:block"/><canvas id="c"></canvas></body></html>`;
    await page.setContent(html);
    await page.waitForLoadState('domcontentloaded');
    const dims = await page.evaluate(() => {
      const img = document.getElementById('src');
      return { w: img.naturalWidth, h: img.naturalHeight };
    });
    const tileW = Math.floor(dims.w / t.cols);
    const tileH = Math.floor(dims.h / t.rows);
    for (let row = 0; row < t.rows; row += 1) {
      for (let col = 0; col < t.cols; col += 1) {
        const idx = row * t.cols + col + 1;
        const out = path.join(t.out, `${t.prefix}-${String(idx).padStart(2, '0')}.png`);
        const dataUrl2 = await page.evaluate(({ tx, ty, tw, th, fullW, fullH }) => {
          const img = document.getElementById('src');
          const c = document.getElementById('c');
          c.width = tw; c.height = th;
          const ctx = c.getContext('2d');
          ctx.drawImage(img, tx, ty, tw, th, 0, 0, tw, th);
          return c.toDataURL('image/png');
        }, { tx: col * tileW, ty: row * tileH, tw: tileW, th: tileH, fullW: dims.w, fullH: dims.h });
        const b = dataUrl2.replace(/^data:image\/png;base64,/, '');
        fs.writeFileSync(out, Buffer.from(b, 'base64'));
        console.log(`wrote ${out} (${tileW}x${tileH})`);
      }
    }
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });