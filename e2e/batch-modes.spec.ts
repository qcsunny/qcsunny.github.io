// Batch-mode regressions: the per-line modes of cidr / base64 / timestamp /
// cron. One bad line must be flagged ✗ without sinking the rest of the list —
// that isolation is the whole point of batch mode.

import { test, expect } from '@playwright/test';

test('cidr batch transform summarizes each line, invalid lines flagged', async ({ page }) => {
	await page.goto('/devtools/cidr-calculator/');
	await page.locator('textarea[data-role="input"]').fill('192.168.1.1/24\nnot-a-cidr\n10.0.0.0/8');
	await page.getByRole('button', { name: /Calculate each line|逐行批量计算/ }).click();
	const out = await page.locator('textarea[data-role="output"]').inputValue();
	expect(out).toContain('mask 255.255.255.0');
	expect(out).toContain('not-a-cidr → ✗');
	expect(out).toContain('10.0.0.0/8');
});

test('base64 batch decode isolates bad lines', async ({ page }) => {
	await page.goto('/devtools/base64/');
	await page.locator('textarea[data-role="input"]').fill('aGVsbG8=\n!!!\nd29ybGQ=');
	await page.getByRole('button', { name: /Decode each line|逐行解码/ }).click();
	const out = await page.locator('textarea[data-role="output"]').inputValue();
	expect(out).toContain('aGVsbG8= → hello');
	expect(out).toContain('!!! → ✗');
	expect(out).toContain('d29ybGQ= → world');
});

test('unix timestamp batch table renders one row per line', async ({ page }) => {
	await page.goto('/devtools/unix-timestamp/');
	await page.locator('#t-f-seconds').fill('0\n1760000000');
	await expect(page.locator('.t-table tbody tr')).toHaveCount(2);
	// Epoch row shows 1970 in both time columns (format is locale-dependent).
	const epochRow = page.locator('.t-table tbody tr').first();
	await expect(epochRow).toContainText('1970');
	await expect(epochRow).toContainText('January 1, 1970');
});

test('cron batch table lists every expression with its next fire', async ({ page }) => {
	await page.goto('/devtools/cron-expression-parser/');
	await page.locator('#t-f-expr').fill('0 12 * * *\n0 25 * * *\n30 2 * * 1');
	// The three-line input switches the compute into the batch table.
	await expect(page.locator('.t-table tbody tr')).toHaveCount(3);
	const badRow = page.locator('.t-table tbody tr').nth(1);
	await expect(badRow).toContainText('✗');
	// The valid rows carry a next-fire timestamp, not a dash.
	await expect(page.locator('.t-table tbody tr').first()).not.toContainText('✗');
});

test('number base batch table converts each line in the source base', async ({ page }) => {
	await page.goto('/devtools/number-base-converter/');
	await page.locator('#t-f-number').fill('ff\n10\nzz');
	await expect(page.locator('.t-table tbody tr')).toHaveCount(3);
	const first = page.locator('.t-table tbody tr').first();
	await expect(first).toContainText('11111111'); // ff → binary
	await expect(first).toContainText('255'); // ff → decimal
	await expect(page.locator('.t-table tbody tr').nth(2)).toContainText('✗'); // zz invalid in hex
});
