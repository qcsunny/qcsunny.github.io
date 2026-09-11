// Document OCR. The fixture is drawn in-browser (canvas with large print
// text) and dropped as a PNG — the full wasm pipeline (worker + core +
// eng language) runs for real, so the test pins the actual recognized text
// and the confidence-line format. Chinese is exercised by the language
// select presence only: engine quality on canvas-drawn CJK is font-bound
// and would make the test flaky.

import { test, expect } from '@playwright/test';

const dropCanvasPng = async (page: import('@playwright/test').Page, text: string): Promise<void> => {
	const b64 = await page.evaluate((t) => {
		const c = document.createElement('canvas');
		c.width = 800;
		c.height = 200;
		const ctx = c.getContext('2d')!;
		ctx.fillStyle = '#fff';
		ctx.fillRect(0, 0, 800, 200);
		ctx.fillStyle = '#000';
		ctx.font = '48px serif';
		ctx.fillText(t, 40, 120);
		return c.toDataURL('image/png').split(',')[1]!;
	}, text);
	await page.evaluate((b64) => {
		const bin = atob(b64);
		const bytes = new Uint8Array(bin.length);
		for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
		const dt = new DataTransfer();
		dt.items.add(new File([bytes], 'test.png', { type: 'image/png' }));
		document.querySelector('.t-ocr-drop')?.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
	}, b64);
};

test('document ocr recognizes clear print text through the wasm pipeline', async ({ page }) => {
	test.setTimeout(180_000); // wasm + language load on first run is the slow path
	await page.goto('/devtools/document-ocr/');
	await page.waitForSelector('.t-ocr-drop');

	await dropCanvasPng(page, 'Hello OCR World 12345');

	await expect(page.locator('.t-ocr-output')).toContainText('Hello OCR World', { timeout: 150_000 });
	const out = await page.locator('.t-ocr-output').innerText();
	// the header line carries source + confidence; a clean print sample
	// should sit well above the 70% flag threshold
	expect(out).toMatch(/── test\.png · \d{2,3}% ──/);
	expect(out).not.toContain('⚠');
});

test('document ocr language select offers english and chinese, page stays bilingual-clean', async ({ page }) => {
	await page.goto('/devtools/document-ocr/');
	await page.waitForSelector('.t-ocr-controls select');
	const opts = page.locator('.t-ocr-controls select option');
	expect(await opts.count()).toBe(2);
	expect(await opts.first().getAttribute('value')).toBe('eng');
	expect(await opts.nth(1).getAttribute('value')).toBe('chi_sim');

	// privacy line is present in both languages
	for (const lang of ['en', 'zh']) {
		await page.evaluate((l) => {
			document.documentElement.dataset.lang = l;
		}, lang);
		await page.waitForTimeout(120);
		const privacy = await page.locator('.t-file-privacy').innerText();
		expect(privacy).toContain('🔒');
	}
});
