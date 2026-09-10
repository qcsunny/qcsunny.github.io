
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
// re-submit to force a redraw under the new engine
await page.keyboard.press('Enter');
await page.waitForTimeout(900);
await page.click('[data-g3-view="top"]');
await page.waitForTimeout(700);
const stats = await page.evaluate(() => {
  const c = document.querySelector('canvas');
  const ctx = c.getContext('2d');
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  let nz = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i] + d[i+1] + d[i+2] > 30) nz++;
  return { engine: document.querySelector('#g3-engine').value, nonzero: nz, total: d.length / 4 };
});
console.log(JSON.stringify(stats));
const dataUrl = await page.evaluate(() => document.querySelector('canvas').toDataURL('image/png'));
writeFileSync('/tmp/g3-c2d.b64', dataUrl.split(',')[1]);
await b.close();
