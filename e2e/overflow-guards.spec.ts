import { expect, test } from '@playwright/test';

// Overflow / boundary guards (audit findings): a sample size of one must not
// show "NaN" for variance, and finance tools must reject rates/discounts that
// would invert their maths (inflation ≤ −100%, discount outside 0–100%).

test('descriptive-statistics: one value shows dash, never NaN', async ({ page }) => {
	await page.goto('/calculators/descriptive-statistics/');
	const results = page.locator('.t-results');

	// single value → sample variance is 0/0; must render the em dash, not NaN
	await page.fill('#t-f-y', '5');
	await expect(results).not.toContainText('NaN');
	await expect(results.locator('.t-row', { hasText: 'Sample variance' })).toContainText('—');
	await expect(results.locator('.t-row', { hasText: 'Sample std. deviation' })).toContainText('—');

	// two values → variance computes normally
	await page.fill('#t-f-y', '1, 3');
	await expect(results.locator('.t-row', { hasText: 'Sample variance' })).toContainText('2');
});

test('inflation: rate of −100% or below is rejected', async ({ page }) => {
	await page.goto('/finance/inflation/');
	const results = page.locator('.t-results');

	await page.fill('#t-f-rate', '-100');
	await expect(results).toContainText('rate must be > −100%');
});

test('discount: outside 0–100% is rejected, not negative prices', async ({ page }) => {
	await page.goto('/finance/discount/');
	const results = page.locator('.t-results');

	await page.fill('#t-f-pct', '150');
	await expect(results).toContainText('0–100%');

	await page.fill('#t-f-pct', '-10');
	await expect(results).toContainText('0–100%');
});
