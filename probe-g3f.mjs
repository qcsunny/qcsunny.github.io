
import { chromium } from '@playwright/test';
import { writeFileSync } from 'fs';
const b = await chromium.launch({ executablePath: process.env.HOME + '/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome' });
const page = await b.newPage({ viewport: { width: 1200, height: 900 } });
await page.goto('http://localhost:4321/calculators/graph3d/');
await page.waitForSelector('#g3-expr');
await page.fill('#g3-expr', 'exp(-(x^2 + y^2) / 4)');
await page.keyboard.press('Enter');
await page.waitForTimeout(800);
await page.selectOption('#g3-engine', 'canvas2d');
await page.waitForTimeout(300);
await page.keyboard.press('Enter');
await page.waitForTimeout(900);
await page.click('[data-g3-view="top"]');
await page.waitForTimeout(700);
const stats = await page.evaluate(() => {
  const cs = [...document.querySelectorAll('canvas')];
  return cs.map((c, i) => {
    let ctx2d = null;
    try { ctx2d = c.getContext('2d'); } catch {}
    let nz = -1;
    if (ctx2d) {
      const d = ctx2d.getImageData(0, 0, c.width, c.height).data;
      nz = 0;
      for (let j = 0; j < d.length; j += 4) if (d[j] + d[j+1] + d[j+2] > 30) nz++;
    }
    return { i, w: c.width, h: c.height, visible: c.offsetParent !== null, has2d: !!ctx2d, nz };
  });
});
console.log(JSON.stringify(stats, null, 1));
const dataUrl = await page.evaluate(() => [...document.querySelectorAll('canvas')].filter(c => c.offsetParent !== null)[0].toDataURL('image/png'));
writeFileSync('/tmp/g3-c2d.b64', dataUrl.split(',')[1]);
await b.close();
