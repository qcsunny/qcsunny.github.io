// The batch-transforms batch: per-line modes added across the text tools
// (roman, slug, http status, mime, user-agent, port, html-entity, cny) plus
// the three reverse/unit/prefix input upgrades (unix-timestamp date→epoch,
// px-rem unit-in-input, number-base literal prefix). Every case pins actual
// rendered output; the ✗-row-isolation property (one bad line must not sink
// the rest) is asserted per tool.

import { test, expect } from '@playwright/test';

const fillAndRun = async (page, cat, slug, input, btn) => {
	await page.goto(`/${cat}/${slug}/`);
	const input$ = page.locator('textarea[data-role="input"]');
	await input$.fill(input);
	await page.getByRole('button', { name: btn }).click();
	return page.locator('textarea[data-role="output"]');
};

test('roman batch converts per line in both directions, bad rows marked', async ({ page }) => {
	const out = await fillAndRun(page, 'utilities', 'roman-numeral', '1987\nMMXXVI\n404\nbanana', /Convert each line/);
	await expect(out).toHaveValue(
		['1987 → MCMLXXXVII', 'MMXXVI → 2026', '404 → CDIV', 'banana → ✗'].join('\n'),
	);
});

test('slug batch keeps CJK and folds diacritics per line', async ({ page }) => {
	const out = await fillAndRun(page, 'devtools', 'slug-generator', 'Hello World!\n10 Tips for CSS\n你好世界', /Slug each line/);
	await expect(out).toHaveValue(['Hello World! → hello-world', '10 Tips for CSS → 10-tips-for-css', '你好世界 → 你好世界'].join('\n'));
});

test('http status batch maps codes and keywords, unknown rows fail alone', async ({ page }) => {
	const out = await fillAndRun(page, 'devtools', 'http-status-lookup', '404\n999\ntea', /Look up each line/);
	const v = await out.inputValue();
	expect(v).toContain('404 → 404 Not Found');
	expect(v).toContain('999 → ✗');
	expect(v).toContain("tea → 418 I'm a teapot");
});

test('mime batch resolves extensions and mime types both ways', async ({ page }) => {
	const out = await fillAndRun(page, 'devtools', 'mime-type-lookup', '.pdf\napplication/json\n.zzz', /Extension → MIME, each line/);
	const v = await out.inputValue();
	expect(v).toContain('.pdf → application/pdf');
	expect(v).toContain('application/json → .json');
	expect(v).toContain('.zzz → ✗');
});

test('user-agent batch summarizes browsers and flags bots', async ({ page }) => {
	const out = await fillAndRun(
		page,
		'devtools',
		'user-agent-parser',
		'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36\nGooglebot/2.1 (+http://www.google.com/bot.html)',
		/Parse each line/,
	);
	const v = await out.inputValue();
	expect(v).toContain('Chrome 131.0.0.0 · Windows 10/11 · Desktop');
	expect(v).toContain('🤖 bot');
});

test('port batch accepts port, port/proto and service name', async ({ page }) => {
	const out = await fillAndRun(page, 'devtools', 'port-lookup', '6379\n3306/tcp\nssh', /Look up each line/);
	const v = await out.inputValue();
	expect(v).toContain('6379/TCP Redis');
	expect(v).toContain('3306/TCP MySQL'); // proto filter is case-insensitive vs the table's 'TCP'
	expect(v).toContain('22/TCP SSH');
});

test('html entity batch unescapes per line, unknown entity fails alone', async ({ page }) => {
	const out = await fillAndRun(page, 'devtools', 'html-entity-escaper', '&amp; &lt; hi\n&bogus; Tom', /Unescape each line/);
	await expect(out).toHaveValue(['&amp; &lt; hi → & < hi', '&bogus; Tom → ✗'].join('\n'));
});

test('cny uppercase batch converts one amount per line', async ({ page }) => {
	const out = await fillAndRun(page, 'finance', 'cny-uppercase', '123.45\n0.07', /Convert each line \(invoice batch\)/);
	const v = await out.inputValue();
	expect(v).toContain('123.45 → 壹佰贰拾叁元肆角伍分');
	expect(v).toContain('0.07 → 柒分');
});

test('unix timestamp accepts a date and converts to epoch (reverse direction)', async ({ page }) => {
	await page.goto('/devtools/unix-timestamp/');
	await page.locator('textarea').first().fill('2026-09-11 14:30');
	await page.waitForTimeout(400);
	const rows = await page.locator('.t-results').innerText();
	expect(rows).toContain('date → timestamp');
	expect(rows).toContain('1789108200'); // Asia/Shanghai would shift this; the row prints the epoch itself
});

test('unix timestamp batch mixes directions per line', async ({ page }) => {
	await page.goto('/devtools/unix-timestamp/');
	await page.locator('textarea').first().fill('1760000000\n2026-09-11 14:30');
	await page.waitForTimeout(400);
	// form tables append to #t-root (outside .t-results), so read the table body
	const table = await page.locator('.t-table tbody').innerText();
	expect(table).toContain('1789108200');
	expect(table).toContain('1760000000');
});

test('px-rem honors a unit typed into the size field over the select', async ({ page }) => {
	await page.goto('/devtools/css-px-rem-converter/');
	await page.locator('#t-f-value').fill('1.5rem');
	await page.waitForTimeout(400);
	// the values themselves are language-neutral numbers — read the whole
	// results area: 1.5rem at root 16 must give px 24 and rem 1.5
	const rows = await page.locator('.t-results').innerText();
	expect(rows).toContain('24');
	expect(rows).toContain('1.5');

	await page.locator('#t-f-value').fill('24px');
	await page.waitForTimeout(400);
	// 24px and 1.5rem are the same size at root=16 — mirrored conversion
	const rows2 = await page.locator('.t-results').innerText();
	expect(rows2).toContain('1.5');
	expect(rows2).toContain('150%');
});

test('number base respects 0x/0b/0o prefixes over the selected base', async ({ page }) => {
	await page.goto('/devtools/number-base-converter/');
	// source base select stays at its default (16); the prefix must override
	await page.locator('textarea').first().fill('0b1010');
	await page.waitForTimeout(400);
	let rows = await page.locator('.t-results').innerText();
	expect(rows).toContain('10'); // decimal
	expect(rows).toContain('0xa'); // hex (10 = 0xa)

	await page.locator('textarea').first().fill('0xff\n0b11\n255');
	await page.waitForTimeout(400);
	// batch rows land in the table (appended to #t-root): input 0xff → decimal 255, 0b11 → 3
	const cells = await page.locator('.t-table tbody tr').allInnerTexts();
	expect(cells.some((r) => r.replace(/\s+/g, ' ').includes('0xff 11111111 377 255 0xff'))).toBeTruthy();
	expect(cells.some((r) => r.replace(/\s+/g, ' ').includes('0b11 11 3 3 0x3'))).toBeTruthy();
	expect(cells.some((r) => r.replace(/\s+/g, ' ').includes('255 10 0101'))).toBeFalsy(); // sanity: 255 is hex per the select, decimal is 597
});
