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

// A ceiling, not a target. The dispatcher chunk is shared by all registry
// tool pages and cached immutably, so it is paid once per visitor — but it is on
// the critical path to the first tool becoming interactive. History: the whole
// registry (every category's configs and compute functions) rode in main, which
// grew with every tool — 49.5 KB at 53 tools, 57.3 KB at 63, and 66 KB at 84,
// past the old 60 KB line. The catalog.ts refactor made main a thin dispatcher
// that lazily imports the current category's data module, landing it at ~12 KB;
// 20 KB keeps a margin that still catches a config accidentally imported into
// the shared chunk again.
test('the shared tool bundle stays inside its brotli budget', () => {
	const main = astroJs().filter(([f]) => /^main\..*\.js$/.test(f));
	expect(main.length, 'built tool dispatcher chunk').toBe(1);
	const size = brotli(main[0][1]);
	expect(size, `main chunk is ${size} B brotli`).toBeLessThan(20_000);
});

// Every page carrying the search modal inlines the index its button searches —
// the 63 tools (bilingual names plus search aliases) on most pages, the blog
// collection on the blog list and article pages — so the first keystroke has
// data and search keeps working offline. That is a deliberate trade: inline
// The search index used to be inlined into every page's HTML via define:vars
// — 17.2 KB brotli on the worst page at 84 tools, re-downloaded on every
// navigation since HTML cannot be content-hash cached. Since 2026-09-10 the
// two indexes are build-generated JSON files (search-index.mjs) that the
// search UIs fetch on open and warm during browser idle, long-cached in
// _headers: one download per visitor per deployment. These pins hold both
// halves of that bargain: no page carries the payload inline any more, and the
// external files stay small enough that the fetch beats a cached-page render.
test('the search index is external, and each file stays small', () => {
	// No page may inline the index any more — the old payload was identified
	// by its define:vars const; the same string must not reappear.
	for (const [, html] of distHtml()) {
		expect(html.includes('const searchData'), 'a page still inlines the search index').toBe(false);
	}

	const forIdx = (name: string) => {
		const buf = readFileSync(join(DIST, name));
		return [name, buf.length, brotli(buf)] as const;
	};
	const tools = forIdx('search-index.json');
	const blog = forIdx('search-blog.json');
	// Raw size (the file is on disk; the host compresses in flight — the brotli
	// numbers land ~13/9 KB, smaller than the old inline block ever was). The
	// tool ceiling was raised once, 2026-09-11, when the 40-tool gap batch
	// took the registry 84 → 118 tools: descriptions in the index are now
	// capped at 120 code points (search-index.mjs), which pins the per-tool
	// row at ~460 bytes, so 60 KB ≈ 130 tools of linear, predictable growth —
	// a runaway (untruncated descs, keyword stuffing) still trips the pin.
	expect(tools[1], `${tools[0]} raw size`).toBeLessThan(60_000);
	expect(blog[1], `${blog[0]} raw size`).toBeLessThan(45_000);
});

// Astro emits one hoisted entry chunk per page and puts the <script> in the
// body, so without help the browser learns what that chunk imports only after
// downloading and parsing it. On the 46 registry tool pages the chain was three
// deep and 27 bytes wide — entry chunk → main.js (123 KB) → engine.js — two of
// the three round trips spent reading the name of the next file.
// modulepreload.mjs names the static imports in <head> instead. Pinned per route
// by chunk-name prefix rather than recomputed from the bundles, so a chunk that
// starts importing something new has to be looked at.
//
// i18n (564 B brotli) became a chunk of its own in 2026-09, when /clock and
// /calendar started importing the same language helper the tool bundle uses —
// three entry points sharing a module is what makes Rollup hoist it. The
// alternative was a second copy of the switch logic in each standalone page,
// which is the thing src/scripts/tools/i18n.ts exists to prevent. It costs the
// tool pages one more request, and because it is named in <head> beside main and
// engine that request goes out in parallel rather than lengthening the chain.
const PRELOADS: [string, string[]][] = [
	['devtools/json-formatter/index.html', ['main', 'engine', 'i18n']],
	['finance/loan-payment/index.html', ['main', 'engine', 'i18n']],
	['converters/weight/index.html', ['main', 'engine', 'i18n']],
	['calculators/percentage/index.html', ['main', 'engine', 'i18n']],
	// graph3d and standard now also pull i18n (the bilingual error line and
	// the language-aware placeholder/titles).
	['calculators/graph3d/index.html', ['engine', 'i18n', 'vars']],
	['calculators/standard/index.html', ['engine', 'i18n', 'vars']],
	// The two pages outside the toolbox: no ToolShell, so the language helper is
	// the only thing their own controller shares with anything else.
	['clock/index.html', ['i18n']],
	['calendar/index.html', ['i18n']],
	// A prose page has no module script, so nothing to preload.
	['blog/canvas-2d-surface-plot/index.html', []],
];

const preloadsIn = (html: string): string[] =>
	[...html.slice(0, html.indexOf('</head>')).matchAll(/<link rel="modulepreload" href="\/_astro\/([^"]+)"/g)]
		.map((m) => m[1].split('.')[0]);

test('every page preloads what its entry chunk imports', () => {
	for (const [route, want] of PRELOADS) {
		const html = readFileSync(join(DIST, route), 'utf-8');
		// Sorted: the preload set is what matters — the links all sit in <head>
		// and fire in parallel, so emission order (which Rollup may change when
		// the chunk graph is reshuffled) is irrelevant.
		expect(
			preloadsIn(html).sort(),
			`modulepreload links on ${route}`,
		).toEqual([...want].sort());
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
