import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { CALCULATOR_FEATURED, REGISTRY } from '../src/tools/registry';

// A handful of paths exist only to carry legacy traffic. Each one renders
// "has moved", a <meta http-equiv="refresh"> and a rel=canonical, all aimed at
// the page it has been folded into. That is right for a visitor who bookmarked
// the old URL — but such a page must never be a link *target* inside the site:
//   - an internal link at a non-canonical URL passes diluted equity, and a
//     reader who follows it pays for a full page load before being bounced;
//   - Astro has no sitemap filter, so these paths are still listed there — the
//     sitemap says "please index this" while the page's own canonical says "no,
//     over there". That half is a known wart and deliberately NOT asserted here,
//     because cementing it in a test would make the eventual filter harder to
//     write. This file guards the link half: the one with real cost and no guard.
//
// It has already earned its keep twice:
//   - src/pages/index.astro — two registry entries share the slug
//     `compound-interest` (the real /finance/ tool and a /calculators/ redirect
//     that points at it), and `find()` returned the redirect because REGISTRY
//     lists calculators before finance. So the homepage's featured card, on the
//     highest-weight page of the site, linked at a redirect.
//   - src/content/blog/compound-interest-and-irr-guide.md — a stale
//     /finance/investment-return/ link sat in the same sentence as a
//     /finance/compound-interest/ link: two links, one destination.
//
// Neither failure is visible in the rendered output: the redirect page loads
// fine, the label reads fine, and after the meta refresh a reader lands in the
// right place. Only a test that knows what a redirect path is can see it.

const DIST = fileURLToPath(new URL('../dist', import.meta.url));
const ORIGIN = 'https://qcsunny.org/';

// The same union ToolShell and the homepage use: the featured calculators live in
// their own array and are absent from REGISTRY.
const REDIRECTS = [...CALCULATOR_FEATURED, ...REGISTRY]
	.filter((e) => e.kind === 'redirect')
	.map((e) => `/${e.category}/${e.slug}/`);

const htmlFiles = (() => {
	const out: string[] = [];
	const walk = (dir: string) => {
		for (const d of readdirSync(dir, { withFileTypes: true })) {
			const p = join(dir, d.name);
			if (d.isDirectory()) walk(p);
			else if (d.name === 'index.html') out.push(p);
		}
	};
	walk(DIST);
	return out;
})();

// 'blog/foo/index.html' -> '/blog/foo/', and the root -> '/' (not '//').
const pathOf = (file: string) => {
	const rel = file.slice(DIST.length + 1).replace(/\\/g, '/').slice(0, -'/index.html'.length);
	return rel ? `/${rel}/` : '/';
};

test('every redirect path points at one real home, and three ways of saying it agree', () => {
	expect(REDIRECTS, 'the registry declares redirect pages').not.toHaveLength(0);

	const bad: string[] = [];
	for (const path of REDIRECTS) {
		const file = join(DIST, path.slice(1), 'index.html');
		if (!existsSync(file)) {
			bad.push(`${path} (not built)`);
			continue;
		}
		const html = readFileSync(file, 'utf-8');

		const canonical = /<link rel="canonical" href="[^"]*?([^"]+)"\s*\/?>/.exec(html)?.[1];
		const refresh = /<meta http-equiv="refresh"[^>]*content="[^>]*?url=([^"]+)"/.exec(html)?.[1];

		if (!canonical) {
			bad.push(`${path} (no rel=canonical — nothing tells a crawler where home is)`);
			continue;
		}
		const target = canonical.replace(ORIGIN, '/');

		if (target === path) bad.push(`${path} (canonicals at itself)`);
		if (REDIRECTS.includes(target))
			bad.push(`${path} (canonical targets another redirect: ${target})`);
		if (!existsSync(join(DIST, target.slice(1), 'index.html')))
			bad.push(`${path} (canonical 404s: ${target})`);
		if (refresh !== target)
			bad.push(`${path} (meta refresh points at ${refresh}, canonical at ${target})`);
		if (!html.includes(`href="${target}"`))
			bad.push(`${path} (the page never links its own target — nothing for a reader)`);
	}

	expect(bad, 'a redirect must agree with itself and land on a real page').toEqual([]);
});

test('no page on the site links at a redirect path', () => {
	const bad: string[] = [];
	for (const file of htmlFiles) {
		const from = pathOf(file);
		const html = readFileSync(file, 'utf-8');
		for (const href of [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1])) {
			// A page pointing at its own redirect is harmless; what we are out for
			// is a *reader* being handed a URL that has no business being linked.
			if (href !== from && REDIRECTS.includes(href)) bad.push(`${from} → ${href}`);
		}
	}

	expect(bad, 'every internal link must land on a real page, not a redirect').toEqual([]);
});
