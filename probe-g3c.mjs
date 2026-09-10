
import { chromium } from '@playwright/test';
import { writeFileSync } from 'fs';
const b = await chromium.launch({ executablePath: process.env.HOME + '/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome' });
const page = await b.newPage({ viewport: { width: 1200, height: 900 } });
await page.goto('http://localhost:4321/calculators/graph3d/');
await page.waitForSelector('#g3-expr');
await page.fill('#g3-expr', 'exp(-(x^2 + y^2) / 4)');
await page.keyboard.press('Enter');
await page.waitForTimeout(1000);
await page.click('[data-g3-view="top"]');
await page.waitForTimeout(800);
const dataUrl = await page.evaluate(() => document.querySelector('canvas').toDataURL('image/png'));
writeFileSync('/tmp/g3-top.b64', dataUrl.split(',')[1]);
console.log('saved');
await b.close();
