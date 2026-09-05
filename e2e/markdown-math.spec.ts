import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

// /tools/markdown-preview/ used to *say* it supported maths and then print the
// LaTeX source: `$$E = mc^2$$` came out as the characters `$$E = mc^2$$` inside a
// centred box. It now typesets with KaTeX, which is a local dependency (vendored
// stylesheet + woff2 under src/, nothing from a CDN) pulled in as its own chunk
// only once a document actually contains a formula.
//
// The parser leaves each formula as `.t-math[data-tex]` holding its source, and
// renderMathIn() replaces the contents and drops the attribute. So `[data-tex]`
// surviving is the signal that typesetting did not happen — which these specs
// use in both directions.

const TOOL = '/tools/markdown-preview/';

test('inline and display formulas typeset, CJK inside them included', async ({ page }) => {
	await page.goto(TOOL);
	const editor = page.locator('.t-md-textarea');
	const preview = page.locator('.t-md-preview-body');

	await editor.fill('Mass–energy: $E = mc^2$\n\n$$\\frac{a}{b} + \\text{元}$$\n');

	const inline = preview.locator('.t-math-inline');
	const display = preview.locator('.t-math-display');
	await expect(inline).toHaveCount(1);
	await expect(display).toHaveCount(1);

	// KaTeX's own wrappers, not our placeholder text.
	await expect(inline.locator('.katex')).toBeVisible();
	await expect(display.locator('.katex-display')).toBeVisible();
	// data-tex gone means renderMathIn() completed rather than gave up.
	await expect(preview.locator('.t-math[data-tex]')).toHaveCount(0);
	await expect(preview.locator('.t-math-error')).toHaveCount(0);

	// The stylesheet is injected next to the chunk; without it every formula is
	// unstyled inline text with a stray MathML copy after it.
	await expect(page.locator('link[data-katex]')).toHaveCount(1);

	// Variables keep KaTeX_Math italic, and the Chinese inside \text{} falls to
	// the site CJK stack rather than the browser's serif default — the same
	// .cjk_fallback rule global.css applies to blog posts.
	const styles = await display.locator('.cjk_fallback').first().evaluate((el) => {
		const s = getComputedStyle(el);
		return { family: s.fontFamily, mathFamily: getComputedStyle(el.closest('.katex')!).fontFamily };
	});
	expect(styles.family, 'CJK in a formula must not fall through to serif').toContain('PingFang SC');
	expect(styles.mathFamily, 'the formula itself stays in KaTeX faces').toContain('KaTeX_Main');
});

// A lone `$` as a currency symbol pairs with the next one on the same line, so a
// naive inline rule turns `costs $5 or $10` into a formula reading "5 or ". The
// parser treats padding whitespace as the tell that this is money — the same
// heuristic the blog-side scan uses.
test('dollar signs used as money stay text', async ({ page }) => {
	await page.goto(TOOL);
	const editor = page.locator('.t-md-textarea');
	const preview = page.locator('.t-md-preview-body');

	await editor.fill('Hosting costs $5 or $10 per month, and $x$ is still maths.\n');

	const para = preview.locator('p').first();
	await expect(para).toContainText('$5 or $10 per month');
	// Exactly one formula on the line: the deliberate `$x$`.
	await expect(preview.locator('.t-math-inline')).toHaveCount(1);
	await expect(preview.locator('.t-math-inline .katex')).toBeVisible();
});

test('a formula KaTeX cannot parse keeps its source visible', async ({ page }) => {
	await page.goto(TOOL);
	const editor = page.locator('.t-md-textarea');
	const preview = page.locator('.t-md-preview-body');

	await editor.fill('$$\\frac{a}{$$\n');

	const broken = preview.locator('.t-math-error');
	await expect(broken).toHaveCount(1);
	// Source still readable, and data-tex still set so a later edit retries.
	await expect(broken).toHaveText('\\frac{a}{');
	await expect(broken).toHaveAttribute('data-tex', '\\frac{a}{');
	// KaTeX's parse message is on the title, so hovering explains the failure.
	expect(await broken.getAttribute('title')).toContain('KaTeX');
});

// The exported file leaves this site, so it must not depend on it: no <link> to
// our stylesheet, no font URLs, no script. MathML gets that — browsers typeset
// it with their own maths font — which is why the export asks renderMathIn() for
// `mathml` while the preview uses KaTeX's HTML tree.
test('exported HTML carries formulas as self-contained MathML', async ({ page }) => {
	await page.goto(TOOL);
	await page.locator('.t-md-textarea').fill('# Doc\n\n$$\\frac{a}{b}$$\n\nand $E = mc^2$ inline.\n');
	// Wait for the preview pass, so the click is not the first KaTeX load.
	await expect(page.locator('.t-md-preview-body .t-math[data-tex]')).toHaveCount(0);

	const [download] = await Promise.all([
		page.waitForEvent('download'),
		page.getByRole('button', { name: /Export HTML|导出 HTML/ }).click(),
	]);
	const file = await download.path();
	expect(file).toBeTruthy();
	const html = await readFile(file!, 'utf8');

	expect(html, 'formulas must be typeset, not left as source').toContain('<math');
	expect(html).toContain('<mfrac');
	expect(html, 'no leftover LaTeX placeholder').not.toContain('data-tex=');
	// MathML only: the HTML tree would drag in KaTeX's stylesheet and 20 fonts.
	expect(html, 'KaTeX HTML spans would need our CSS').not.toContain('katex-html');
	expect(html, 'nothing may be fetched from this site').not.toMatch(/<link|_astro|\.woff2/);
	expect(html, 'and no script either').not.toContain('<script');
});

// The 259 KB of KaTeX must not be a cost every tool page pays. The document Astro
// serves references none of it; the chunk arrives from the client only when a
// formula shows up, and other tools never mention it.
test('KaTeX is not in any tool page as served', async ({ page }) => {
	const requested: string[] = [];
	page.on('request', (r) => {
		if (/katex/i.test(r.url())) requested.push(r.url());
	});

	// Static HTML for the maths tool itself: no stylesheet link, no module. Matched
	// on URLs rather than on the word, since the page's own FAQ mentions KaTeX.
	const served = await (await page.request.get(TOOL)).text();
	expect(served, 'the served page must not link or preload katex').not.toMatch(
		/(?:src|href)="[^"]*katex[^"]*"/i,
	);

	// A tool with no maths at all never fetches it, even after interacting.
	await page.goto('/tools/json-formatter/');
	await page.locator('.t-json-editor').first().click();
	await expect(page.locator('.t-json-editor').first()).toBeVisible();
	expect(requested, 'json-formatter pulled KaTeX').toEqual([]);

	// The maths tool does — its sample document opens with formulas in it.
	await page.goto(TOOL);
	await expect(page.locator('.t-md-preview-body .katex').first()).toBeVisible();
	expect(requested.some((u) => /katex\.[\w-]+\.js$/.test(u)), 'chunk not fetched').toBe(true);
});
