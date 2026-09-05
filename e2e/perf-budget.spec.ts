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

// Astro emits one hoisted entry chunk per page and puts the <script> in the
// body, so without help the browser learns what that chunk imports only after
// downloading and parsing it. On the 46 registry tool pages the chain was three
// deep and 27 bytes wide — entry chunk → main.js (123 KB) → engine.js — two of
// the three round trips spent reading the name of the next file.
// modulepreload.mjs names the static imports in <head> instead. Pinned per route
// by chunk-name prefix rather than recomputed from the bundles, so a chunk that
// starts importing something new has to be looked at.
const PRELOADS: [string, string[]][] = [
	['tools/json-formatter/index.html', ['main', 'engine']],
	['finance/loan-payment/index.html', ['main', 'engine']],
	['converters/weight/index.html', ['main', 'engine']],
	['calculators/percentage/index.html', ['main', 'engine']],
	['calculators/graph3d/index.html', ['engine', 'vars']],
	['calculators/standard/index.html', ['engine', 'vars']],
	// A prose page has no module script, so nothing to preload.
	['blog/canvas-2d-surface-plot/index.html', []],
];

const preloadsIn = (html: string): string[] =>
	[...html.slice(0, html.indexOf('</head>')).matchAll(/<link rel="modulepreload" href="\/_astro\/([^"]+)"/g)]
		.map((m) => m[1].split('.')[0]);

test('every page preloads what its entry chunk imports', () => {
	for (const [route, want] of PRELOADS) {
		const html = readFileSync(join(DIST, route), 'utf-8');
		expect(preloadsIn(html), `modulepreload links on ${route}`).toEqual(want);
	}
});

// The workbench formatters are reached through `import()` on demand. Preloading
// one would download a tool the visitor has not opened — eight of them on the
// pages that offer a picker — so the integration blanks dynamic specifiers
// before it scans. Derived from the bundles rather than listed here: a new lazy
// tool is covered without touching this test.
test('lazily imported chunks are never preloaded', () => {
	const lazy = new Set<string>();
	for (const [, js] of astroJs()) {
		for (const m of js.matchAll(/import\s*\(\s*['"`]\.\/([\w.$-]+\.js)['"`]\s*\)/g)) lazy.add(m[1]);
	}
	expect(lazy.size, 'dynamically imported chunks found in the bundles').toBeGreaterThan(5);

	const offenders: string[] = [];
	for (const [route, html] of distHtml()) {
		for (const m of html.matchAll(/<link rel="modulepreload" href="\/_astro\/([^"]+)"/g)) {
			if (lazy.has(m[1])) offenders.push(`${route} → ${m[1]}`);
		}
	}
	expect(offenders, 'a lazy chunk is being downloaded eagerly').toEqual([]);
});

// The behavioural half: the point of the link is that the shared chunk goes out
// with the document's other subresources instead of after the entry chunk has
// been parsed. Asserting request order rather than the tag's presence, because a
// tag with the wrong attributes would still be present and still be useless —
// and a preload the module loader cannot reuse shows up as a second request for
// the same file, which is worse than no preload at all.
test('the shared chunk is requested without waiting for the entry chunk', async ({ page }) => {
	const order: string[] = [];
	page.on('request', (req) => {
		const m = /\/_astro\/([^/?]+\.js)$/.exec(new URL(req.url()).pathname);
		if (m) order.push(m[1]);
	});
	await page.goto('/tools/json-formatter/');
	await page.waitForLoadState('load');

	const at = (prefix: string): number => order.findIndex((f) => f.startsWith(prefix));
	expect(at('main.'), 'main chunk never requested').toBeGreaterThanOrEqual(0);
	expect(at('engine.'), 'engine chunk never requested').toBeGreaterThanOrEqual(0);
	expect(at('_slug_'), 'entry chunk never requested').toBeGreaterThanOrEqual(0);
	expect(at('main.'), 'main.js waited for the entry chunk').toBeLessThan(at('_slug_'));
	for (const prefix of ['main.', 'engine.']) {
		const n = order.filter((f) => f.startsWith(prefix)).length;
		expect(n, `${prefix}js fetched ${n} times — the preload is not being reused`).toBe(1);
	}
});
