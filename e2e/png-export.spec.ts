import { readFile } from 'node:fs/promises';
import { expect, test, type Locator, type Page } from '@playwright/test';

// The PNG export draws the results onto a canvas from the structured compute()
// output; the renderer is a separate chunk pulled in on first click. These
// specs guard both halves: that the click really produces a valid PNG, and
// that the button follows the language switch like the print button does.

const pngBtn = (page: Page): Locator => page.locator('.t-export-bar button').nth(1);

test('form results export as a PNG at 2x width', async ({ page }) => {
	await page.goto('/finance/compound-interest/');

	// defaults compute on load, which is what reveals the export bar
	await expect(page.locator('.t-export-bar')).toBeVisible();

	const [download] = await Promise.all([page.waitForEvent('download'), pngBtn(page).click()]);

	expect(download.suggestedFilename()).toMatch(/^compound-interest-\d{4}-\d{2}-\d{2}\.png$/);

	const file = await download.path();
	expect(file).toBeTruthy();
	const buf = await readFile(file!);

	// PNG magic, then IHDR width/height as big-endian uint32 at bytes 16 and 20.
	expect(buf.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
	expect(buf.readUInt32BE(16)).toBe(1920); // 960 CSS px at 2x
	// Inputs + results + the yearly table make this comfortably tall; a blank
	// or header-only card would come out far shorter.
	expect(buf.readUInt32BE(20)).toBeGreaterThan(600);
});

test('PNG export button is bilingual', async ({ page }) => {
	await page.goto('/finance/compound-interest/');

	await expect(pngBtn(page).locator('.i18n-en')).toBeVisible();
	await expect(pngBtn(page).locator('.i18n-zh')).toBeHidden();

	await page.locator('.t-lang, .lang-toggle').first().click();
	await expect(page.locator('html')).toHaveAttribute('data-lang', 'zh');

	await expect(pngBtn(page).locator('.i18n-zh')).toBeVisible();
	await expect(pngBtn(page).locator('.i18n-en')).toBeHidden();
});
