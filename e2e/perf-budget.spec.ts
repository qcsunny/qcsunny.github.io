import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, constants } from 'node:zlib';
import { expect, test } from '@playwright/test';

// Byte-budget guards. These read dist/ rather than a page, because what they are
// about is what the build produced for *every* route — the kind of regression a
// per-page test never sees, since the page still works, just heavier.
const DIST = fileURLToPath(new URL('../dist', import.meta.url));

const brotli = (buf: Buffer | string) =>
	brotliCompressSync(Buffer.from(buf), {
		params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
	}).length;

const distHtml = () =>
	readdirSync(DIST, { recursive: true, encoding: 'utf-8' })
		.filter((p) => p.endsWith('.html'))
		.map((p) => [p, readFileSync(join(DIST, p), 'utf-8')] as const);

const astroJs = () =>
	readdirSync(join(DIST, '_astro'))
		.filter((f) => f.endsWith('.js'))
		.map((f) => [f, readFileSync(join(DIST, '_astro', f), 'utf-8')] as const);

// The site's whole claim is that a page which only has words on it needs no
// JavaScript to show them. That is a property of how the pages are written, and
// it decays quietly: one `<script>` without `is:inline` in a shared component
// and every article starts shipping a module. Named routes rather than "all
// pages without a widget", so adding an interactive page doesn't silently widen
// the exemption.
const PROSE_ROUTES = [
	'index.html',
	'about/index.html',
	'privacy/index.html',
	'blog/index.html',
	'blog/si-units-and-conversion-precision/index.html',
	'blog/compound-interest-and-irr-guide/index.html',
];

test('prose pages ship no first-party JavaScript', () => {
	for (const route of PROSE_ROUTES) {
		const html = readFileSync(join(DIST, route), 'utf-8');
		const modules = [...html.matchAll(/<script[^>]+src="(\/_astro\/[^"]+)"/g)].map((m) => m[1]);
		expect(modules, `${route} loads a module script`).toEqual([]);
	}
});

// Editorial prose (about paragraphs, FAQ) is rendered into the HTML at build
// time and read by nobody in the browser — but src/scripts/tools/main.ts imports
// the registry to find one entry's config, so anything hanging off a ToolEntry
// object rides along into the chunk all 46 tool pages load. Rollup drops an
// unused top-level export (TOOL_KEYWORDS never appears in a bundle) and cannot
// drop an unused property, so the fix was structural: the prose lives in
// src/tools/content.ts, which only ToolShell imports. It was 76,008 B raw /
// 25,922 B brotli, i.e. 42% of that chunk, duplicating words already in the HTML.
const PROSE_SAMPLES: [string, string][] = [
	['calculators/percentage/index.html', 'Percent means'],
	['converters/weight/index.html', 'Comprehensive mass and weight converter'],
	['tools/json-formatter/index.html', '把杂乱的 JSON 排版成统一缩进'],
];

test('build-time prose stays out of the client bundle', () => {
	const bundles = astroJs();
	for (const [route, phrase] of PROSE_SAMPLES) {
		// Asserting both halves: absent from every bundle, and still on the page.
		// Deleting the prose would satisfy the first half on its own.
		expect(readFileSync(join(DIST, route), 'utf-8'), `${phrase} missing from ${route}`).toContain(
			phrase,
		);
		const offenders = bundles.filter(([, js]) => js.includes(phrase)).map(([f]) => f);
		expect(offenders, `"${phrase}" shipped as JavaScript`).toEqual([]);
	}
});

// A ceiling, not a target. The dispatcher chunk is shared by all 46 registry
// tool pages and cached immutably, so it is paid once per visitor — but it is on
// the critical path to the first tool becoming interactive, and it grows with
// every tool added. 45 KB leaves room for several more; if a real addition
// crosses it, re-measure and move it deliberately rather than nudging it.
test('the shared tool bundle stays inside its brotli budget', () => {
	const main = astroJs().filter(([f]) => /^main\..*\.js$/.test(f));
	expect(main.length, 'built tool dispatcher chunk').toBe(1);
	const size = brotli(main[0][1]);
	expect(size, `main chunk is ${size} B brotli`).toBeLessThan(45_000);
});

// Every page carrying the tool search modal inlines the same index (49 tools,
// bilingual names plus search aliases) so the first keystroke has data and search
// keeps working offline. That is a deliberate trade — inline bytes cannot be
// cached, so a multi-page visit pays for it again on each page — and the reason
// it is deliberate is that it is small. This pins the "small": if the index grows
// past ~12 KB brotli per page it stops being the cheap option and should move to
// a fetched, immutable file.
test('the inlined search index stays small enough to justify inlining', () => {
	const withIndex = distHtml().filter(([, html]) => html.includes('const toolsData'));
	expect(withIndex.length, 'pages carrying the search modal').toBeGreaterThan(50);

	const [, html] = withIndex[0];
	const block = html.match(/<script>\(function\(\)\{const toolsData[\s\S]*?<\/script>/);
	expect(block, 'inline search index block').not.toBeNull();
	const cost = brotli(html) - brotli(html.replace(block![0], ''));
	expect(cost, `search index costs ${cost} B brotli per page`).toBeLessThan(12_000);
});
