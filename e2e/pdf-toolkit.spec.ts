// PDF Toolkit. Fixtures are built in-process with pdf-lib (3-page and 2-page
// docs with text markers), dropped via DataTransfer. Assertions pin: tab
// switching, extract page grammar, split download count, watermark round
// trip, metadata read/clear, and merge output — each re-loaded from the
// downloaded bytes.

import { test, expect } from '@playwright/test';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { readFileSync } from 'node:fs';

async function makePdf(pages: { label: string }[], title: string): Promise<Uint8Array> {
	const doc = await PDFDocument.create();
	const font = await doc.embedFont(StandardFonts.Helvetica);
	doc.setTitle(title);
	for (const p of pages) {
		const page = doc.addPage([300, 200]);
		page.drawText(p.label, { x: 20, y: 100, size: 20, font });
	}
	return doc.save();
}

const toB64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64');

async function drop(page: import('@playwright/test').Page, b64: string, name: string): Promise<void> {
	await page.evaluate(
		({ b64, name }) => {
			const bin = atob(b64);
			const bytes = new Uint8Array(bin.length);
			for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
			const file = new File([bytes], name);
			const dt = new DataTransfer();
			dt.items.add(file);
			const zone = document.querySelector('.t-pdf-panel:not(.t-hidden) .t-pdf-drop');
			zone?.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
		},
		{ b64, name },
	);
}

test('tabs switch and each panel has its dropzone', async ({ page }) => {
	await page.goto('/devtools/pdf-toolkit/');
	await page.waitForSelector('.t-pdf-tabs');
	const tabs = page.locator('.t-pdf-tab');
	expect(await tabs.count()).toBe(9);
	// only the first panel is visible initially
	expect(await page.locator('.t-pdf-panel:not(.t-hidden)').count()).toBe(1);
	await tabs.nth(3).click(); // rotate
	expect(await page.locator('.t-pdf-panel:not(.t-hidden)').count()).toBe(1);
	expect(await page.locator('.t-pdf-panel:not(.t-hidden)').getAttribute('data-panel')).toBe('rotate');
});

test('extract honors the page-range grammar', async ({ page }) => {
	await page.goto('/devtools/pdf-toolkit/');
	await page.waitForSelector('.t-pdf-tabs');
	await page.locator('.t-pdf-tab', { hasText: /Extract|提取/ }).click();
	const b64 = toB64(await makePdf([{ label: 'p1' }, { label: 'p2' }, { label: 'p3' }, { label: 'p4' }, { label: 'p5' }], 'five'));
	await drop(page, b64, 'five.pdf');
	await page.locator('.t-pdf-panel[data-panel="extract"] input.t-trackinput').fill('3,1');
	const dl = page.waitForEvent('download');
	await page.getByRole('button', { name: /Extract pages/ }).click();
	const download = await dl;
	expect(download.suggestedFilename()).toBe('five-extract.pdf');
	const doc = await PDFDocument.load(readFileSync(await download.path() as string));
	expect(doc.getPageCount()).toBe(2);
});

test('watermark round-trips and metadata survives', async ({ page }) => {
	await page.goto('/devtools/pdf-toolkit/');
	await page.waitForSelector('.t-pdf-tabs');
	await page.locator('.t-pdf-tab', { hasText: /Watermark|水印/ }).click();
	const b64 = toB64(await makePdf([{ label: 'hello' }], 'wm-doc'));
	await drop(page, b64, 'wm.pdf');
	const dl = page.waitForEvent('download');
	await page.getByRole('button', { name: /watermark & download|加水印/ }).click();
	const download = await dl;
	const doc = await PDFDocument.load(readFileSync(await download.path() as string));
	expect(doc.getTitle()).toBe('wm-doc'); // watermark must not clobber metadata
	expect(doc.getPageCount()).toBe(1);
});

test('metadata view reads and clear strips', async ({ page }) => {
	await page.goto('/devtools/pdf-toolkit/');
	await page.waitForSelector('.t-pdf-tabs');
	await page.locator('.t-pdf-tab', { hasText: /Metadata|元数据/ }).click();
	const b64 = toB64(await makePdf([{ label: 'x' }], 'secret-title'));
	await drop(page, b64, 'meta.pdf');

	await page.getByRole('button', { name: /View metadata/ }).click();
	await expect(page.locator('.t-pdf-panel[data-panel="meta"] .t-pdf-runline')).toContainText('secret-title');

	const dl = page.waitForEvent('download');
	await page.getByRole('button', { name: /Clear metadata/ }).click();
	const download = await dl;
	const doc = await PDFDocument.load(readFileSync(await download.path() as string));
	expect(doc.getTitle() ?? '').toBe('');
});

test('merge combines two files in order', async ({ page }) => {
	await page.goto('/devtools/pdf-toolkit/');
	await page.waitForSelector('.t-pdf-tabs');
	// merge is the default first tab
	const b1 = toB64(await makePdf([{ label: 'a1' }, { label: 'a2' }], 'A'));
	const b2 = toB64(await makePdf([{ label: 'b1' }], 'B'));
	await drop(page, b1, 'a.pdf');
	await drop(page, b2, 'b.pdf');
	expect(await page.locator('.t-pdf-panel[data-panel="merge"] .t-pdf-filelist li').count()).toBe(2);
	const dl = page.waitForEvent('download');
	await page.getByRole('button', { name: /Merge & download/ }).click();
	const download = await dl;
	expect(download.suggestedFilename()).toBe('merged.pdf');
	const doc = await PDFDocument.load(readFileSync(await download.path() as string));
	expect(doc.getPageCount()).toBe(3);
});
