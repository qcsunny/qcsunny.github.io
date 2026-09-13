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

	await page.getByRole('button', { name: 'Look up', exact: true }).click();
	await expect(output).toHaveValue(/Redis/);
	await expect(output).toHaveValue(/3306|6379/); // number column

	await input.fill('mysql');
	await page.getByRole('button', { name: 'Look up', exact: true }).click();
	await expect(output).toHaveValue(/3306/);
});

test('timezone converter with world clock table', async ({ page }) => {
	await page.goto('/daily/timezone-converter/');
	const results = page.locator('.t-results');
	// 2026-09-11 14:30 Shanghai → New York is 02:30 the same day (EDT).
	await expect(results).toContainText('02:30');
	await expect(results).toContainText('-12');
	const table = await page.locator('.t-table').innerText();
	expect(table).toContain('Tokyo');
	expect(table).toContain('Sydney');
});


test('date calculator: Total weeks tracks Total days when inclEnd is ticked', async ({ page }) => {
	await page.goto('/daily/date-calculator/');
	const results = page.locator('.t-results');
	// 2026-09-01 → 2026-09-08 is a 7-day span. Without inclEnd: 7 days,
	// "1 weeks, 0 days". With inclEnd: 8 days, "1 weeks, 1 days". Before the
	// fix, weeks were derived from the raw span, so ticking inclEnd bumped
	// 'Total days' to 8 while 'Total weeks' stayed "1 weeks, 0 days".
	await page.locator('#t-f-from').fill('2026-09-01');
	await page.locator('#t-f-to').fill('2026-09-08');
	await expect(results.locator('.t-row', { hasText: 'Total days' })).toContainText('7');
	await expect(results.locator('.t-row', { hasText: 'Total weeks' })).toContainText('1 weeks, 0 days');
	await page.locator('#t-f-inclEnd').check();
	await expect(results.locator('.t-row', { hasText: 'Total days' })).toContainText('8');
	await expect(results.locator('.t-row', { hasText: 'Total weeks' })).toContainText('1 weeks, 1 days');
});

test('css clamp emits px and rem forms', async ({ page }) => {
	await page.goto('/color/css-clamp/');
	const results = page.locator('.t-results');
	// The generated CSS rides in the note (identical in both languages);
	// sample values live in the rows.
	await expect(page.locator('.t-note')).toContainText('clamp(16px');
	await expect(page.locator('.t-note')).toContainText('rem');
	await expect(results).toContainText('320px'); // sample value row
});

test('wcag contrast: 4.54 with pass and fail verdicts', async ({ page }) => {
	await page.goto('/color/wcag-contrast/');
	const results = page.locator('.t-results');
	await expect(results).toContainText('4.54'); // #767676 on #ffffff
	await expect(results).toContainText('✓'); // AA normal passes
	await expect(results).toContainText('✗'); // AAA normal fails
	// All five requirements, not three: the UI-components/focus row was added
	// last and would silently vanish.
	await expect(results).toContainText(/UI components & focus indicators|界面组件与焦点指示/);

	// The verdict compares the UNROUNDED ratio against 4.5, so the printed value
	// must not round across a threshold. #006ffb on white is 4.4999…:1 — before
	// the adaptive-precision fix the ratio cell read "4.50:1" and the AA row read
	// "4.5:1 < 4.5:1", a screen full of self-contradiction.
	await page.locator('#t-f-fg').fill('#006ffb');
	await expect(results).toContainText('4.4999:1');
	await expect(results).toContainText('4.4999:1 < 4.5:1');
	await expect(results).not.toContainText('4.50:1');
});

test('color-converter preview prints a ratio that agrees with its verdicts', async ({ page }) => {
	await page.goto('/color/color-converter/');
	// #006ffb on white is 4.4999…:1. At two decimals the preview read
	// "4.50:1" while the AA row read ✗ — the self-contradiction the
	// standalone checker had, one fewer place to keep fixed.
	await page.locator('#t-contrast-fg').fill('#006ffb');
	await page.locator('#t-contrast-bg').fill('#ffffff');
	await expect(page.locator('.t-contrast-ratio')).toHaveText('4.4999:1');
});

test('color palette renders swatches', async ({ page }) => {
	await page.goto('/color/color-palette/');
	const results = page.locator('.t-results');
	await expect(results).toContainText('#3b82f6'); // the base color echoes back
	expect(await page.locator('svg rect').count()).toBeGreaterThanOrEqual(5);
});

test('lossless checker: full-band WAV reads as true lossless', async ({ page }) => {
	await page.goto('/media/lossless-checker/');
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


test('lossless checker: a file shorter than one FFT window is not misreported silent', async ({ page }) => {
	await page.goto('/media/lossless-checker/');
	// A mono 16-bit WAV shorter than the 8192-sample FFT window. Before the
	// fix, the window loops collected zero candidates and the verdict fell
	// through to "appears to be silent" (empty output), even though the file
	// carries real audio. The fix zero-pads the whole short file into one
	// window so a cutoff is still computed.
	const sr = 44100;
	const n = 4096; // < N (8192): exercises the zero-pad short-file path
	const dataBytes = n * 2;
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
	dv.setUint16(22, 1, true); // mono
	dv.setUint32(24, sr, true);
	dv.setUint32(28, sr * 2, true);
	dv.setUint16(32, 2, true);
	dv.setUint16(34, 16, true);
	str(36, 'data');
	dv.setUint32(40, dataBytes, true);
	// sines 1–20 kHz: a real spectrum with a high cutoff, well above silence
	for (let i = 0; i < n; i++) {
		let v = 0;
		for (let f = 1000; f <= 20000; f += 1000) v += Math.sin((2 * Math.PI * f * i) / sr);
		dv.setInt16(44 + i * 2, Math.round((v / 20) * 30000), true);
	}
	const chooser = page.waitForEvent('filechooser');
	await page.locator('.t-file-btn').click();
	await (await chooser).setFiles({ name: 'short.wav', mimeType: 'audio/wav', buffer: Buffer.from(buf) });
	const output = page.locator('textarea[data-role="output"]');
	// the regression: a non-empty short file must compute a cutoff, not read
	// as silent (which left the output textarea empty before the fix)
	await expect(output).toHaveValue(/Hz/, { timeout: 10000 });
	await expect(output).toHaveValue(/Cutoff/);
});

test('browser info scans navigator, screen and codec support', async ({ page }) => {
	await page.goto('/security/browser-info/');
	await page.getByRole('button', { name: /Scan this browser|扫描本机浏览器/ }).click();
	const output = page.locator('textarea[data-role="output"]');
	await expect(output).toHaveValue(/CPU/);
	await expect(output).toHaveValue(/Screen/);
	await expect(output).toHaveValue(/H\.265/);
	await expect(output).toHaveValue(/本地生成/); // the privacy line
});
