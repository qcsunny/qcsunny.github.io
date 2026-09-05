import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

// Formulas used to be rendered in the browser: every post containing a `$`
// pulled katex.min.css, katex.min.js and auto-render.min.js from
// cdn.jsdelivr.net, then walked the DOM. That put a third party on the critical
// path for the maths on seven posts — a CDN outage, or a country blocking it,
// left the formulas as raw `$\frac{a}{b}$` source. They are now rendered by
// satteri-katex.mjs during the build, so the HTML ships finished and the only
// runtime assets are KaTeX's stylesheet and fonts, both self-hosted.
//
// The post with the most formulas (35), which is also the one that exercises
// the widest set of KaTeX fonts: fractions, \sum with a size-2 operator,
// subscripts, \bar and CJK inside \text{}.
const MATHY = '/blog/compound-interest-and-irr-guide/';
const NO_MATH = '/blog/glm-5-3-vs-hy4-preview/';

const DIST = fileURLToPath(new URL('../dist', import.meta.url));

// What the browser actually downloads on a maths page, measured. KaTeX ships 20
// font files; @font-face only fetches the faces a page's glyphs land in, and
// scripts/build-katex-css.py drops the woff/ttf branches so the woff2 is all
// there is to fetch. A regression that widened this — a formula reaching for a
// script or fraktur face, or the CSS being replaced by upstream's — shows up
// here rather than in someone's network tab.
const MAX_FONT_FILES = 4;
const MAX_FONT_BYTES = 60_000;

test('a formula renders with JavaScript disabled', async ({ browser }) => {
	// The whole point of build-time rendering: no script has to run for the
	// maths to be readable.
	const context = await browser.newContext({ javaScriptEnabled: false });
	const page = await context.newPage();
	await page.goto(MATHY);

	const katex = page.locator('.prose .katex');
	expect(await katex.count(), 'rendered formulas in static HTML').toBeGreaterThan(30);

	// Display maths needs `$$` on its own lines to parse as a block; written
	// inline as `$$x$$` it silently becomes inline maths, which the old runtime
	// auto-render happened to treat as display anyway. All 18 are blocks now.
	expect(await page.locator('.prose .katex-display').count(), 'display formulas').toBe(7);

	// The MathML tree beside the visual spans is what a screen reader reads, and
	// it carries the LaTeX source. querySelectorAll rather than a locator: these
	// are MathML-namespaced elements.
	const mathml = await page.evaluate(() => ({
		semantics: document.querySelectorAll('.prose .katex-mathml math semantics').length,
		annotations: document.querySelectorAll('.prose annotation').length,
	}));
	expect(mathml.semantics, 'MathML trees for screen readers').toBeGreaterThan(30);
	expect(mathml.annotations, 'x-tex annotations').toBe(mathml.semantics);

	// \sum became a real operator, not literal source text.
	await expect(page.locator('.prose .katex-html').first()).not.toContainText('\\sum');

	await context.close();
});

// KaTeX has no CJK glyph in any of its 20 faces, detects that itself, and wraps
// the character in `<span class="mord cjk_fallback">` — then ships no rule for
// the class. Unstyled, `\text{ 元}` renders in the browser default (a serif on
// Windows) next to sans-serif body text. The second half of this test is the
// reason the rule targets that hook and not `.mord`: `.mord` covers maths-mode
// symbols too, so a family set there would fight `.mord.mathnormal` at equal
// specificity and de-italicise every variable.
test('Chinese in a formula uses the site CJK stack, variables stay italic', async ({ page }) => {
	await page.goto(MATHY);

	const cjk = page.locator('.katex .cjk_fallback');
	expect(await cjk.count(), '\\text{ 元} must produce cjk_fallback spans').toBeGreaterThan(0);
	const family = await cjk.first().evaluate((el) => getComputedStyle(el).fontFamily);
	expect(family, 'CJK in maths must not fall through to the browser default').toContain(
		'PingFang SC',
	);

	const variable = page.locator('.katex .mathnormal').first();
	const styles = await variable.evaluate((el) => {
		const s = getComputedStyle(el);
		return { family: s.fontFamily, style: s.fontStyle };
	});
	expect(styles.family, 'maths variables keep KaTeX_Math').toContain('KaTeX_Math');
	expect(styles.style, 'maths variables stay italic').toBe('italic');
});

// A centred display formula wider than the 612px prose measure would push the
// page sideways on a phone — KaTeX gives .katex-display no overflow of its own,
// so global.css does (grep katex-display there).
test('a wide display formula scrolls itself instead of the page', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto(MATHY);

	const overflow = await page.evaluate(
		() => document.documentElement.scrollWidth - document.documentElement.clientWidth,
	);
	expect(overflow, 'page must not scroll horizontally').toBeLessThanOrEqual(0);
});

test('a maths page makes no third-party request', async ({ page }) => {
	// The Cloudflare Web Analytics beacon is deliberately configured (see
	// CF_ANALYTICS_TOKEN in consts.ts); nothing else may leave this origin.
	//
	// The beacon uses *two* hosts: the script is fetched from
	// static.cloudflareinsights.com, then it POSTs its payload to the apex
	// cloudflareinsights.com/cdn-cgi/rum. Whether that POST lands inside the test
	// window depends on the machine, so listing only the script host made this
	// assertion pass locally and fail in CI. Both hosts are the same deliberate
	// beacon; a real regression would show a *different* origin, which still fails.
	const ALLOWED = new Set([
		'localhost:4321',
		'static.cloudflareinsights.com',
		'cloudflareinsights.com',
	]);
	const external: string[] = [];
	page.on('request', (req) => {
		if (!ALLOWED.has(new URL(req.url()).host)) external.push(req.url());
	});

	await page.goto(MATHY);
	await page.evaluate(() => document.fonts.ready);

	expect(external, 'KaTeX and its fonts must be served from this origin').toEqual([]);
});

test('KaTeX fonts are self-hosted woff2, and few of them', async ({ page }) => {
	const fonts: { url: string; bytes: number }[] = [];
	page.on('response', async (res) => {
		if (!/\/_astro\/KaTeX_[^/]+$/.test(new URL(res.url()).pathname)) return;
		fonts.push({ url: res.url().split('/').pop()!, bytes: (await res.body()).length });
	});

	await page.goto(MATHY);
	await page.evaluate(() => document.fonts.ready);

	const total = fonts.reduce((n, f) => n + f.bytes, 0);
	console.log(
		`KaTeX fonts fetched: ${fonts.length} files, ${total} B\n` +
			fonts.map((f) => `  ${f.bytes} B  ${f.url}`).join('\n'),
	);

	expect(fonts.length, 'font files fetched').toBeLessThanOrEqual(MAX_FONT_FILES);
	expect(total, `${total} B of KaTeX fonts`).toBeLessThanOrEqual(MAX_FONT_BYTES);
	for (const f of fonts) {
		expect(f.url, 'woff2 only — build-katex-css.py drops woff/ttf').toMatch(/\.woff2$/);
	}

	// Every face KaTeX declares must be block, not swap: the fallback has no
	// glyph for ∑ or a size-4 brace, and KaTeX positions spans from the real
	// font's metrics, so swapping reflows the formula. See build-katex-css.py.
	const displays = await page.evaluate(() =>
		[...document.fonts].filter((f) => f.family.startsWith('KaTeX')).map((f) => f.display),
	);
	expect(displays.length, 'KaTeX faces declared').toBe(20);
	expect(new Set(displays), 'font-display on KaTeX faces').toEqual(new Set(['block']));
});

test('the stylesheet loads only on posts that have maths', async ({ page }) => {
	await page.goto(MATHY);
	await expect(
		page.locator('link[rel="stylesheet"][href*="katex"]'),
		'maths post must carry the KaTeX stylesheet',
	).toHaveCount(1);

	await page.goto(NO_MATH);
	await expect(
		page.locator('link[rel="stylesheet"][href*="katex"]'),
		'a post with no formulas must not pay 23 KB for KaTeX',
	).toHaveCount(0);
});

// The three checks below read dist/ directly rather than through a page: they
// are about every file the build produced, and a per-route test would miss the
// one post nobody thought to add.
function distHtml(): [string, string][] {
	return readdirSync(DIST, { recursive: true, encoding: 'utf-8' })
		.filter((p) => p.endsWith('.html'))
		.map((p) => [p, readFileSync(join(DIST, p), 'utf-8')]);
}

// Vite inlines assets under 4 KB as base64 data URIs, and one KaTeX face is
// 3,624 bytes — Size3, the third-largest delimiters. Inlined, it rode along
// inside katex.css as 4,840 bytes of base64 that every maths page downloaded
// before it could paint, whether or not a formula reached for a big brace; the
// stylesheet was 27,231 B instead of 22,418 B. @font-face already fetches on
// demand, so the file has to stay a file (see the vite block in astro.config.mjs).
test('no KaTeX font is inlined into the stylesheet', () => {
	const css = readdirSync(join(DIST, '_astro'))
		.filter((f) => /^katex\..*\.css$/.test(f))
		.map((f) => readFileSync(join(DIST, '_astro', f), 'utf-8'));
	expect(css.length, 'built KaTeX stylesheet').toBe(1);
	expect(css[0], 'a font was inlined as base64 — check assetsInlineLimit').not.toContain(
		'data:font',
	);
	// All 20 faces still declared, each pointing at a hashed file of its own.
	expect(css[0].match(/@font-face/g)?.length).toBe(20);
});

// Matched on URL attributes rather than on the hostname anywhere in the page: a
// post explaining why the CDN loader was removed names it in prose, and that is
// not a regression. What would be is a src= or href= pointing off-site.
test('no page loads KaTeX from a CDN any more', () => {
	const offenders = distHtml()
		.filter(([, html]) => /(?:src|href)="[^"]*(?:jsdelivr|unpkg|cdnjs)[^"]*"/i.test(html))
		.map(([path]) => path);
	expect(offenders, 'a CDN URL is being loaded by the build output').toEqual([]);
});

test('every formula in the build rendered', () => {
	const unrendered: string[] = [];
	const failed: string[] = [];
	for (const [path, html] of distHtml()) {
		// Sätteri's own output for maths it parsed but nothing rendered.
		if (html.includes('language-math')) unrendered.push(path);
		// satteri-katex.mjs's marker for a formula KaTeX rejected.
		if (html.includes('katex-failed')) failed.push(path);
	}
	expect(unrendered, 'maths left as <code class="language-math">').toEqual([]);
	expect(failed, 'formulas KaTeX could not parse — check the build log').toEqual([]);
});

// A `$` meant as a dollar sign, paired with another one on the same line, is
// silently valid maths: `AkashML $1.17 / $3.96` rendered "1.17 / " as a formula
// in a pricing table for as long as the runtime loader existed. What gives it
// away is the whitespace — an author writes `$x$`, never `$x $` — so the
// leading/trailing space that a stray dollar sign leaves behind is the signal.
// The fix in a post is to escape the currency as `\$`.
test('no stray dollar sign was rendered as a formula', () => {
	const suspects: string[] = [];
	for (const [path, html] of distHtml()) {
		for (const [, tex] of html.matchAll(
			/<annotation encoding="application\/x-tex">([^<]*)<\/annotation>/g,
		)) {
			const source = tex.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
			if (source !== source.trim()) suspects.push(`${path}: ${JSON.stringify(source)}`);
		}
	}
	expect(suspects, 'formulas padded with whitespace — probably currency, escape as \\$').toEqual(
		[],
	);
});
