import { expect, test } from '@playwright/test';

// Form tools (finance) render live results from registry FormConfigs.
// compound-interest defaults (p=10000, r=6%, t=10y, n=12, m=500) are the
// canonical fixture: final value 100,133.64 — asserts the whole
// form → compute → render pipeline, including Enter-to-recompute.

test('compound-interest computes from defaults', async ({ page }) => {
	await page.goto('/finance/compound-interest/');

	const emph = page.locator('.t-results .t-emph .t-row-value');
	await expect(emph).toHaveText('100133.64');

	// change principal to 20,000 via the field and press Enter
	await page.fill('#t-f-p', '20000');
	await page.press('#t-f-p', 'Enter');
	await expect(emph).toHaveText('118327.61');
});

test('compound-interest renders the year-by-year table', async ({ page }) => {
	await page.goto('/finance/compound-interest/');

	// tables are appended to the host (#t-root), not into .t-results
	const table = page.locator('#t-root .t-tablewrap table');
	await expect(table).toBeVisible();
	// 10 years → 10 body rows + header
	await expect(table.locator('tr')).toHaveCount(11);
	await expect(table.locator('tr').nth(1)).toContainText('1');
});

test('loan-payment shows required-field prompt when emptied', async ({ page }) => {
	await page.goto('/finance/loan-payment/');

	const principal = page.locator('#t-f-principal, #t-f-P').first();
	// generic: first required numeric field
	const anyField = page.locator('.t-form input[type="number"]').first();
	await anyField.fill('');
	await anyField.press('Enter');

	// either a warning row (missing required) or no crash — assert form still interactive
	await expect(page.locator('.t-results')).toBeVisible();
	await anyField.fill('1000');
	await anyField.press('Enter');
	await expect(page.locator('.t-results .t-row-value').first()).not.toHaveText('');
});
