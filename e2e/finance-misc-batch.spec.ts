// The PR-5 finance + misc batch: net worth, lump-sum vs DCA, real return,
// port lookup, timezone converter + world clock, CSS clamp, WCAG contrast,
// color palette, fake-lossless detector, browser info. Form tools recompute
// live; the file tools (lossless) drop a synthesized file.

import { test, expect } from '@playwright/test';

test('net worth: assets minus liabilities with ratio', async ({ page }) => {
	await page.goto('/finance/net-worth/');
	const results = page.locator('.t-results');
	await expect(results).toContainText('53000'); // 275000 − 222000
	await expect(results).toContainText('275000');
	await expect(results).toContainText('80.73'); // debt-to-asset
});

test('lump sum vs DCA: same contributions, different timing', async ({ page }) => {
	await page.goto('/finance/lump-sum-vs-dca/');
	const results = page.locator('.t-results');
	// 12000 at 7% for 5 years = 16830.53; DCA (monthly 200) lands lower.
	await expect(results).toContainText('16830');
	const table = await page.locator('.t-table').innerText();
	expect(table).toContain('5'); // year rows
});

test('real return: Fisher, not naive subtraction', async ({ page }) => {
	await page.goto('/finance/real-return/');
	const results = page.locator('.t-results');
	await expect(results).toContainText('1.94'); // (1.05/1.03) − 1
	await expect(results).toContainText('2'); // the naive 5−3 also shown
});

test('port lookup by number and service', async ({ page }) => {
	await page.goto('/devtools/port-lookup/');
	const input = page.locator('textarea[data-role="input"]');
	const output = page.locator('textarea[data-role="output"]');

	await page.getByRole('button', { name: /Look up|查询/ }).click();
	await expect(output).toHaveValue(/Redis/);
	await expect(output).toHaveValue(/3306|6379/); // number column

	await input.fill('mysql');
	await page.getByRole('button', { name: /Look up|查询/ }).click();
	await expect(output).toHaveValue(/3306/);
});

test('timezone converter with world clock table', async ({ page }) => {
	await page.goto('/utilities/timezone-converter/');
	const results = page.locator('.t-results');
	// 2026-09-11 14:30 Shanghai → New York is 02:30 the same day (EDT).
	await expect(results).toContainText('02:30');
	await expect(results).toContainText('-12');
	const table = await page.locator('.t-table').innerText();
	expect(table).toContain('Tokyo');
	expect(table).toContain('Sydney');
});

test('css clamp emits px and rem forms', async ({ page }) => {
	await page.goto('/devtools/css-clamp/');
	const results = page.locator('.t-results');
	await expect(results).toContainText('clamp(16px');
	await expect(results).toContainText('rem');
	await expect(results).toContainText('1920px'); // sample value row
});

test('wcag contrast: 4.54 with pass and fail verdicts', async ({ page }) => {
	await page.goto('/devtools/wcag-contrast/');
	const results = page.locator('.t-results');
	await expect(results).toContainText('4.54'); // #767676 on #ffffff
	await expect(results).toContainText('✓'); // AA normal passes
	await expect(results).toContainText('✗'); // AAA normal fails
});

test('color palette renders swatches', async ({ page }) => {
	await page.goto('/devtools/color-palette/');
	const results = page.locator('.t-results');
	await expect(results).toContainText('#3b82f6'); // the base color echoes back
	expect(await page.locator('svg rect').count()).toBeGreaterThanOrEqual(5);
});

test('lossless checker: full-band WAV reads as true lossless', async ({ page }) => {
	await page.goto('/devtools/lossless-checker/');
	// A stereo 16-bit WAV whose samples carry sines 1–21 kHz: the cutoff
	// should reach the Nyquist limit and the verdict should say lossless.
	const sr = 44100;
	const dataBytes = sr * 2 * 2 * 3;
	const buf = new ArrayBuffer(44 + dataBytes);
	const dv = new DataView(buf);
	const str = (o: number, s: string) => {
		for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i));
	};
	str(0, 'RIFF');
	dv.setUint32(4, 36 + dataBytes, true);
	str(8, 'WAVE');
	str(12, 'fmt ');
	dv.setUint32(16, 16, true);
	dv.setUint16(20, 1, true);
	dv.setUint16(22, 2, true);
	dv.setUint32(24, sr, true);
	dv.setUint32(28, sr * 4, true);
	dv.setUint16(32, 4, true);
	dv.setUint16(34, 16, true);
	str(36, 'data');
	dv.setUint32(40, dataBytes, true);
	for (let i = 0; i < sr * 3 * 2; i++) {
		let v = 0;
		for (let f = 1000; f <= 21000; f += 1000) v += Math.sin((2 * Math.PI * f * Math.floor(i / 2)) / sr);
		dv.setInt16(44 + i * 2, Math.round((v / 21) * 30000), true);
	}
	const chooser = page.waitForEvent('filechooser');
	await page.locator('.t-file-btn').click();
	await (await chooser).setFiles({ name: 'lossless.wav', mimeType: 'audio/wav', buffer: Buffer.from(buf) });
	const output = page.locator('textarea[data-role="output"]');
	await expect(output).toHaveValue(/22\d\d\d Hz|22050 Hz/, { timeout: 8000 }); // cutoff near Nyquist
	await expect(output).toHaveValue(/true lossless|真无损/);
});

test('browser info scans navigator, screen and codec support', async ({ page }) => {
	await page.goto('/devtools/browser-info/');
	await page.getByRole('button', { name: /Scan this browser|扫描本机浏览器/ }).click();
	const output = page.locator('textarea[data-role="output"]');
	await expect(output).toHaveValue(/CPU/);
	await expect(output).toHaveValue(/Screen/);
	await expect(output).toHaveValue(/H\.265/);
	await expect(output).toHaveValue(/本地生成/); // the privacy line
});
