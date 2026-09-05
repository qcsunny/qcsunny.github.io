import { expect, test } from '@playwright/test';

// Converter pages: two-sided live conversion, swap, and all-units grid.
// Length default (1 m) → known equivalents assert the unit data and the
// bidirectional recompute wiring.

test('length converter computes both directions', async ({ page }) => {
	await page.goto('/converters/length/');

	const from = page.locator('[aria-label="Value to convert from"]');
	const to = page.locator('[aria-label="Converted value"]');

	// defaults are the first unit in each dropdown; pin both ends explicitly
	await page.locator('select').first().selectOption('m');
	await page.locator('select').nth(1).selectOption('cm');
	await from.fill('1');
	await expect(to).toHaveValue('100');

	// edit the "to" side → "from" follows (reverse direction)
	await to.fill('250');
	await expect(from).toHaveValue('2.5');
});

test('converter swap exchanges units and values', async ({ page }) => {
	await page.goto('/converters/temperature/');

	const from = page.locator('[aria-label="Value to convert from"]');
	await from.fill('100');

	const fromSelect = page.locator('select').first();
	const toSelect = page.locator('select').nth(1);
	await fromSelect.selectOption('C');
	await toSelect.selectOption('F');
	// 100 °C = 212 °F
	await expect(page.locator('[aria-label="Converted value"]')).toHaveValue('212');

	await page.locator('.t-conv-swap').click();
	await expect(page.locator('[aria-label="Converted value"]')).toHaveValue('100');
});

test('all-units reference grid is searchable', async ({ page }) => {
	await page.goto('/converters/weight/');

	const filter = page.locator('[aria-label="Filter all unit conversions"]');
	await expect(filter).toBeVisible();
	await filter.fill('磅');
	// grid still renders rows (filtered), no crash
	await page.waitForTimeout(200);
	await expect(page.locator('.t-conv-grid, .t-conv-all')).toBeVisible();
});
