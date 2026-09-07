import { expect, test } from '@playwright/test';

// Developer workbenches (registry kind json/jwt/markdown). These share the
// workbench textarea pattern. The aria-labels follow html[data-lang] now, so the
// selector is the language-independent data-role hook the workbench sets.

test('json formatter formats and reports validity', async ({ page }) => {
	await page.goto('/devtools/json-formatter/');

	const input = page.locator('[data-role="input"]');
	const output = page.locator('[data-role="output"]');

	await input.fill('{"b":2,"a":[1,2]}');
	await page.getByRole('button', { name: /Format \(2 spaces\)|格式化 \(2 空格\)/ }).click();

	await expect(output).toHaveValue(/"a": \[\s+1,/);
	await expect(page.locator('.t-json-status')).toContainText(/Valid JSON/i);
});

test('json formatter flags invalid JSON with error position', async ({ page }) => {
	await page.goto('/devtools/json-formatter/');

	await page.locator('[data-role="input"]').fill('{bad json}');
	await page.getByRole('button', { name: /Format \(2 spaces\)|格式化 \(2 空格\)/ }).click();

	await expect(page.locator('.t-json-status')).toContainText(/✗|error/i);
});

test('jwt decoder decodes header and payload', async ({ page }) => {
	await page.goto('/devtools/jwt-decoder/');

	// header {"alg":"HS256","typ":"JWT"} · payload {"sub":"1"} · dummy sig
	const token =
		'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIn0.abc';
	await page.locator('[data-role="input"]').fill(token);
	await page.getByRole('button', { name: /decode|解码/i }).click();

	const output = page.locator('[data-role="output"]');
	await expect(output).toHaveValue(/"alg":\s*"HS256"/);
	await expect(output).toHaveValue(/"sub":\s*"1"/);
});


// Every rule in parseInline() is a regex over the whole line and none of them can
// see structure, so inline code has to be lifted out before they run and put back
// after. With it left in place they reached inside it: the italic rule turned
// `snake_case_name` into snake<em>case</em>name, the bold rule ate the asterisks
// of `**literal**`, and the autolinker nested an <a> inside the <code>.

// The SQL tokenizer used to have no branch for a bare '-' or '/': the word scan
// stopped on them without advancing, so `a - b` spun forever and froze the tab.
// These three specs pin the fix and the two literal-safety properties that a
// regex-based formatter cannot give.
test('sql formatter handles bare operators without hanging', async ({ page }) => {
	await page.goto('/devtools/sql-formatter/');

	await page.locator('[data-role="input"]').fill('select price - discount as net, a/b from items where qty > -1');
	await page.getByRole('button', { name: /Format \(2 spaces\)|格式化 \(2 空格\)/ }).click();

	const output = page.locator('[data-role="output"]');
	await expect(output).toHaveValue(/price - discount AS net/);
	await expect(output).toHaveValue(/a\/b/);
	await expect(output).toHaveValue(/qty > -1/);
});


test('sql minify keeps literals and drops comments', async ({ page }) => {
	await page.goto('/devtools/sql-formatter/');

	await page.locator('[data-role="input"]').fill("select id -- keep me out\nfrom t where tag = 'a,b--c';");
	await page.getByRole('button', { name: /^(Minify|单行压缩)$/ }).click();

	const output = page.locator('[data-role="output"]');
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
	await page.goto('/devtools/random-number/');

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
	await page.goto('/devtools/random-number/');

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

// formatCss used to append a space after every ':', turning the pseudo-class in
// `a:hover` / `::before` into the invalid `a: hover` / `: : before`. The colon
// only takes a trailing space when it sits inside a declaration block.
test('css formatter leaves pseudo-class colons alone', async ({ page }) => {
	await page.goto('/devtools/css-formatter/');

	await page.locator('[data-role="input"]').fill('a:hover { color:red } .btn::before { content:"" }');
	await page.getByRole('button', { name: /Format \(2 spaces\)|格式化 \(2 空格\)/ }).click();

	const output = page.locator('[data-role="output"]');
	await expect(output).toHaveValue(/a:hover/);
	await expect(output).toHaveValue(/::before/);
	await expect(output).toHaveValue(/color: red/);
	await expect(output).not.toHaveValue(/a: hover/);
	await expect(output).not.toHaveValue(/: : before/);
});

// searchParams already percent-decodes each value, so a second decodeURIComponent
// throws on a literal '%' and would leave the breakdown stale.
test('url parser survives a literal percent in a query value', async ({ page }) => {
	await page.goto('/devtools/url-parser/');

	await page.locator('[data-role="input"]').fill('https://example.com/?q=100%25');
	await page.getByRole('button', { name: /Parse URL|结构化解析/ }).click();

	await expect(page.locator('[data-role="output"]')).toHaveValue(/q = 100%/);
	await expect(page.locator('.t-json-status')).toContainText(/Parsed successfully|解析完成/);
});

// json.ts built its own debounce and never cancelled it from the toolbar, so
// clicking Minify within 300ms of typing got overwritten by the auto-format.
test('json minify is not overwritten by the pending auto-format', async ({ page }) => {
	await page.goto('/devtools/json-formatter/');

	await page.locator('[data-role="input"]').fill('{"a":1,"b":[1,2,3]}');
	await page.getByRole('button', { name: /^Minify$/ }).click();
	// Give any lingering debounced auto-format a chance to fire and clobber.
	await page.waitForTimeout(450);

	await expect(page.locator('[data-role="output"]')).toHaveValue('{"a":1,"b":[1,2,3]}');
});

// Dropping a comment must still leave a gap between the tokens it used to
// separate, or `SELECT/*c*/1` collapses to the executable-but-different SELECT1.
test('sql minify does not glue tokens across a dropped comment', async ({ page }) => {
	await page.goto('/devtools/sql-formatter/');

	await page.locator('[data-role="input"]').fill('SELECT/*c*/1');
	await page.getByRole('button', { name: /^(Minify|单行压缩)$/ }).click();

	const output = page.locator('[data-role="output"]');
	await expect(output).not.toHaveValue(/SELECT1/);
	await expect(output).toHaveValue(/SELECT 1/);
});
