import { expect, test } from '@playwright/test';

// Developer workbenches (registry kind json/jwt/markdown). These share the
// workbench textarea pattern: [aria-label="Input Area"] / [aria-label="Output Area"].

test('json formatter formats and reports validity', async ({ page }) => {
	await page.goto('/tools/json-formatter/');

	const input = page.locator('[aria-label="JSON Input"]');
	const output = page.locator('[aria-label="JSON Output"]');

	await input.fill('{"b":2,"a":[1,2]}');
	await page.getByRole('button', { name: /Format \(2 spaces\)|格式化 \(2 空格\)/ }).click();

	await expect(output).toHaveValue(/"a": \[\s+1,/);
	await expect(page.locator('.t-json-status')).toContainText(/Valid JSON/i);
});

test('json formatter flags invalid JSON with error position', async ({ page }) => {
	await page.goto('/tools/json-formatter/');

	await page.locator('[aria-label="JSON Input"]').fill('{bad json}');
	await page.getByRole('button', { name: /Format \(2 spaces\)|格式化 \(2 空格\)/ }).click();

	await expect(page.locator('.t-json-status')).toContainText(/✗|error/i);
});

test('jwt decoder decodes header and payload', async ({ page }) => {
	await page.goto('/tools/jwt-decoder/');

	// header {"alg":"HS256","typ":"JWT"} · payload {"sub":"1"} · dummy sig
	const token =
		'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIn0.abc';
	await page.locator('[aria-label="Input Area"]').fill(token);
	await page.getByRole('button', { name: /decode|解码/i }).click();

	const output = page.locator('[aria-label="Output Area"]');
	await expect(output).toHaveValue(/"alg":\s*"HS256"/);
	await expect(output).toHaveValue(/"sub":\s*"1"/);
});

test('markdown preview renders live HTML', async ({ page }) => {
	await page.goto('/tools/markdown-preview/');

	const editor = page.locator('.t-md-textarea');
	const preview = page.locator('.t-md-preview-body');

	await editor.fill('# Hello\n\n**bold** and `code`');
	await expect(preview.locator('h1')).toHaveText('Hello');
	await expect(preview.locator('strong')).toHaveText('bold');
	await expect(preview.locator('code')).toHaveText('code');
});
