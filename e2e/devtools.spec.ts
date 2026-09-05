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

// Every rule in parseInline() is a regex over the whole line and none of them can
// see structure, so inline code has to be lifted out before they run and put back
// after. With it left in place they reached inside it: the italic rule turned
// `snake_case_name` into snake<em>case</em>name, the bold rule ate the asterisks
// of `**literal**`, and the autolinker nested an <a> inside the <code>.
test('inline code is opaque to the other inline rules', async ({ page }) => {
	await page.goto('/tools/markdown-preview/');

	const preview = page.locator('.t-md-preview-body');
	await page
		.locator('.t-md-textarea')
		.fill('`snake_case_name`, `**literal**`, `https://a.test`, `<b>tag</b>`\n');

	const codes = preview.locator('code.t-inline-code');
	await expect(codes).toHaveCount(4);
	await expect(codes.nth(0)).toHaveText('snake_case_name');
	await expect(codes.nth(1)).toHaveText('**literal**');
	await expect(codes.nth(2)).toHaveText('https://a.test');
	await expect(codes.nth(3)).toHaveText('<b>tag</b>');
	// Nothing was injected inside any of them.
	await expect(preview.locator('code em, code strong, code a')).toHaveCount(0);
});

// The SQL tokenizer used to have no branch for a bare '-' or '/': the word scan
// stopped on them without advancing, so `a - b` spun forever and froze the tab.
// These three specs pin the fix and the two literal-safety properties that a
// regex-based formatter cannot give.
test('sql formatter handles bare operators without hanging', async ({ page }) => {
	await page.goto('/tools/sql-formatter/');

	await page.locator('[aria-label="Input Area"]').fill('select price - discount as net, a/b from items where qty > -1');
	await page.getByRole('button', { name: /Format \(2 spaces\)|格式化 \(2 空格\)/ }).click();

	const output = page.locator('[aria-label="Output Area"]');
	await expect(output).toHaveValue(/price - discount AS net/);
	await expect(output).toHaveValue(/a\/b/);
	await expect(output).toHaveValue(/qty > -1/);
});

test('sql formatter leaves string literals untouched', async ({ page }) => {
	await page.goto('/tools/sql-formatter/');

	// 'a,b--c' contains both a comma and a line-comment marker: a formatter that
	// normalises spacing or strips comments by regex would corrupt it.
	await page.locator('[aria-label="Input Area"]').fill("select * from t where tag = 'a,b--c'");
	await page.getByRole('button', { name: /Format \(2 spaces\)|格式化 \(2 空格\)/ }).click();

	await expect(page.locator('[aria-label="Output Area"]')).toHaveValue(/'a,b--c'/);
});

test('sql minify keeps literals and drops comments', async ({ page }) => {
	await page.goto('/tools/sql-formatter/');

	await page.locator('[aria-label="Input Area"]').fill("select id -- keep me out\nfrom t where tag = 'a,b--c';");
	await page.getByRole('button', { name: /^(Minify|单行压缩)$/ }).click();

	const output = page.locator('[aria-label="Output Area"]');
	await expect(output).toHaveValue(/'a,b--c'/);
	await expect(output).not.toHaveValue(/keep me out/);
	await expect(output).not.toHaveValue(/\n/);
});

// The random-number generator takes an arbitrary max from a number input, so the
// draw width has to survive ranges the SQL freeze's sibling class would trip on:
// randInt's old `floor(2^32 / n) * n` collapses to 0 once n > 2^32, turning the
// rejection loop into `while (true)` and freezing the tab with no allocation to
// hint at it. `max 5000000000` is enough to hit it.
test('random generator does not freeze on a range wider than 2^32', async ({ page }) => {
	await page.goto('/tools/random-number/');

	await page.getByLabel('Maximum (inclusive)').fill('5000000000');
	// If the handler spins, this click never settles and the assertion below
	// times out — which is exactly the regression we are pinning.
	await page.getByRole('button', { name: /^(Generate|生成)$/ }).click();

	const out = page.locator('[aria-label="Random numbers"]');
	const values = (await out.inputValue()).trim().split('\n');
	expect(values).toHaveLength(6);
	for (const v of values) {
		const n = Number(v);
		expect(Number.isSafeInteger(n)).toBe(true);
		expect(n).toBeGreaterThanOrEqual(1);
		expect(n).toBeLessThanOrEqual(5000000000);
	}
});

// No-duplicates over a large range used to materialise the whole range as an
// array and shuffle it — a million-element allocation and a million crypto
// draws to keep six. The virtual partial Fisher–Yates must stay distinct.
test('random generator draws distinct values from a large range fast', async ({ page }) => {
	await page.goto('/tools/random-number/');

	await page.getByLabel('Maximum (inclusive)').fill('1000000');
	await page.getByLabel('How many').fill('50');
	await page.getByLabel('No duplicates').check();
	await page.getByRole('button', { name: /^(Generate|生成)$/ }).click();

	const values = (await page.locator('[aria-label="Random numbers"]').inputValue()).trim().split('\n');
	expect(values).toHaveLength(50);
	expect(new Set(values).size).toBe(50);
	for (const v of values) {
		const n = Number(v);
		expect(n).toBeGreaterThanOrEqual(1);
		expect(n).toBeLessThanOrEqual(1000000);
	}
});
