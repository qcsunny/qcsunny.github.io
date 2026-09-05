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

// The exact byte count is the whole point of a data-size converter — someone
// checking why a "1 TB" drive shows as 931 GiB, or setting a byte quota. 2^40 is
// exactly representable as a double, but formatNumber's 1e12 exponential cutoff
// used to render it `1.099512e+12`, discarding six digits it was holding
// perfectly. Exact safe integers must print in full.
test('data-size converter shows exact byte counts, not 6-digit exponentials', async ({ page }) => {
	await page.goto('/converters/data/');

	const from = page.locator('[aria-label="Value to convert from"]');
	const to = page.locator('[aria-label="Converted value"]');

	await page.locator('select').first().selectOption('TiB');
	await page.locator('select').nth(1).selectOption('B');
	await from.fill('1');
	await expect(to).toHaveValue('1099511627776');

	// 1 PiB = 2^50, still inside 2^53.
	await page.locator('select').first().selectOption('PiB');
	await expect(to).toHaveValue('1125899906842624');

	// 1 EiB = 2^60 is past the safe range, so exponential is the honest answer.
	await page.locator('select').first().selectOption('EiB');
	await expect(to).toHaveValue(/e\+18$/);
});
