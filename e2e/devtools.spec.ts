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
	await page.goto('/utilities/random-number/');

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
	await page.goto('/utilities/random-number/');

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

test('hash generator computes all 8 algorithms live, HMAC with a secret', async ({ page }) => {
	await page.goto('/devtools/hash-generator/');

	const input = page.locator('textarea[data-role="input"]');
	const output = page.locator('textarea[data-role="output"]');

	// NIST vectors for "abc": every algorithm must appear with its digest.
	await input.fill('abc');
	await expect(output).toHaveValue(/MD5\s+900150983cd24fb0d6963f7d28e17f72/);
	await expect(output).toHaveValue(/SHA-256\s+ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad/);
	await expect(output).toHaveValue(/SHA-512\s+ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a/);
	// SHA-224/384/SHA-3 are the hand-rolled cores — pin them too.
	await expect(output).toHaveValue(/SHA-224\s+23097d223405d8228642a477bda255b32aadbce4bda0b3f7e36c9da7/);
	await expect(output).toHaveValue(/SHA3-256\s+3a985da74fe225b2045c172d6bd390bd855f086e3e9d525b46bfe24511431532/);
	// No secret -> no HMAC section.
	await expect(output).not.toHaveValue(/HMAC/);

	// Verify stats update live
	const stats = page.locator('.t-results');
	await expect(stats).toContainText('3');

	// Secret box appends HMAC rows (RFC 4231 case 2: key "key", "The quick brown fox …").
	await input.fill('The quick brown fox jumps over the lazy dog');
	await page.locator('#t-secret').fill('key');
	await expect(output).toHaveValue(/SHA-256\s+f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8/);

	// "HMAC only" button: just the three HMAC rows, and it errors without a secret.
	await page.locator('#t-secret').fill('');
	await page.getByRole('button', { name: /^(HMAC only|仅计算 HMAC)$/ }).click();
	await expect(page.locator('.t-error')).toContainText(/secret/i);
});


// --- cron expression parser ---------------------------------------------------------
// cron-expression-parser is a form-kind tool: it recomputes on every input event,
// so the interaction is fill + Enter (no Compute button). It expands each field
// of a Linux 5-field or Quartz 6/7-field expression and then runs the greedy
// bit-mask carry of nextFire() to list the next execution times.
//
// Two harness notes that shape the assertions:
//   * innerText, not textContent — bilingual() emits a .i18n-en/.i18n-zh span
//     pair that global.css hides one half of, so textContent glues both halves
//     into "Second秒0,30" and no readable substring matches.
//   * Next-fire timestamps depend on Date.now(), so every assertion pins
//     structure (row counts, column counts, month names) and never a year.

test('cron parser expands the default 5-field expression and lists next runs', async ({ page }) => {
	await page.goto('/devtools/cron-expression-parser/');

	const expr = page.locator('#t-f-expr');
	await expr.fill('0 12 * * *');
	await expr.press('Enter');

	// A lone minute+hour collapses into a clock phrase rather than a field list.
	await expect(page.locator('.t-results')).toHaveText(/at 12:00/, { useInnerText: true });

	const rows = page.locator('.t-table tbody tr');
	await expect(rows).toHaveCount(7);
	await expect(rows.first().locator('td').nth(0)).toHaveText('1', { useInnerText: true });
	// en-US formats the local column with a 4-digit year.
	await expect(rows.first().locator('td').nth(1)).toHaveText(/\d{4}/, { useInnerText: true });
});

test('cron parser accepts a 6-field second-level Quartz expression', async ({ page }) => {
	await page.goto('/devtools/cron-expression-parser/');

	await page.locator('#t-f-dialect').selectOption('spring-quartz');
	const expr = page.locator('#t-f-expr');
	await expr.fill('0/30 * * * * ?');
	await expr.press('Enter');

	// POSIX `a/n` means a-max/n, so 0/30 over 0-59 is 0 and 30.
	await expect(page.locator('.t-results')).toHaveText(/Second[\s\S]*?0,30/, { useInnerText: true });
	// The '?' day-of-month drops out of the expansion entirely.
	await expect(page.locator('.t-results')).toHaveText(/Day of month[\s\S]*?\?/, { useInnerText: true });
	await expect(page.locator('.t-table tbody tr')).toHaveCount(7);
});

test('cron parser handles a 7-field Quartz expression with a year', async ({ page }) => {
	await page.goto('/devtools/cron-expression-parser/');

	await page.locator('#t-f-dialect').selectOption('quartz-7');
	const expr = page.locator('#t-f-expr');
	await expr.fill('0 0 0 1 1 ? 2027');
	await expr.press('Enter');

	await expect(page.locator('.t-results')).toHaveText(/Year[\s\S]*?2027/, { useInnerText: true });
	// A pinned year with a fixed month and day fires exactly once, so the
	// run-count selector cannot pad the table — one row carrying 2027 is the
	// year field actually being honoured, not a parse that ignored it.
	const rows = page.locator('.t-table tbody tr');
	await expect(rows).toHaveCount(1);
	await expect(rows.first().locator('td').nth(1)).toHaveText(/2027/, { useInnerText: true });
});

test('cron parser rejects a Quartz expression whose day fields are both concrete', async ({ page }) => {
	await page.goto('/devtools/cron-expression-parser/');

	await page.locator('#t-f-dialect').selectOption('spring-quartz');
	const expr = page.locator('#t-f-expr');
	await expr.fill('0 0 0 1 1 1');
	await expr.press('Enter');

	await expect(page.locator('.t-results')).toHaveText(
		/one of day-of-month \/ day-of-week to be '\?'/,
		{ useInnerText: true },
	);
});

test('cron parser rejects a question mark in a 5-field expression', async ({ page }) => {
	await page.goto('/devtools/cron-expression-parser/');

	const expr = page.locator('#t-f-expr');
	await expr.fill('0 12 ? * *');
	await expr.press('Enter');

	await expect(page.locator('.t-results')).toHaveText(
		/'\?' is not valid in Linux 5-field cron/,
		{ useInnerText: true },
	);
});

test('cron parser honours the run-count selector', async ({ page }) => {
	await page.goto('/devtools/cron-expression-parser/');

	await page.locator('#t-f-count').selectOption('3');
	await expect(page.locator('.t-table tbody tr')).toHaveCount(3);
});

test('cron parser rolls a January-only expression into the next year', async ({ page }) => {
	await page.goto('/devtools/cron-expression-parser/');

	const expr = page.locator('#t-f-expr');
	await expr.fill('0 0 1 1 *');
	await expr.press('Enter');

	// stamp() formats the English local column with a long month name.
	await expect(page.locator('.t-table tbody tr').first().locator('td').nth(1)).toHaveText(/January/, {
		useInnerText: true,
	});
});

test('cron parser rejects the unsupported L/W/# modifiers', async ({ page }) => {
	await page.goto('/devtools/cron-expression-parser/');

	const expr = page.locator('#t-f-expr');
	await expr.fill('0 0 15W * *');
	await expr.press('Enter');

	// 'W' is not in the token grammar, so the field parser reports malformed
	// rather than a dedicated L/W/# message; the field hint is what tells the
	// user the extension syntax is out of scope.
	await expect(page.locator('.t-results')).toHaveText(/out of range or malformed/, { useInnerText: true });
});

test('cron parser drops the local column when the time zone is UTC', async ({ page }) => {
	await page.goto('/devtools/cron-expression-parser/');

	await page.locator('#t-f-tz').selectOption('UTC');
	await expect(page.locator('.t-table thead th')).toHaveCount(2);
});
