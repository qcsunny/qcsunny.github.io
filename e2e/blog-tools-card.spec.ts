import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { CALCULATOR_FEATURED, REGISTRY } from '../src/tools/registry';

// BlogPost.astro hardcodes a .blog-tools-card listing a fixed handful of tool
// chips, and every post renders it. That makes it the single strongest internal
// link source on the site — 17 posts × N chips — so one typo in an href silently
// 404s on 17 pages at once. Nothing else in the suite catches it: seo.spec walks
// the sitemap, not a post's outbound links, and a dead chip is invisible in the
// HTML too.
//
// It is also the one place where ordering is *not* the ranking. The related-tools
// strip and the search modal both read REGISTRY declaration order, so naming a
// tool here is the only way to hand it internal links without reshuffling a
// category. The list is kept in sync by hand; this file is what stops that hand
// from drifting.

const DIST = fileURLToPath(new URL('../dist', import.meta.url));
const CHIP_RE = /class="tool-chip" href="([^"]+)"/g;

const posts = readdirSync(join(DIST, 'blog'), { withFileTypes: true })
	.filter((d) => d.isDirectory())
	.map((d) => d.name);

const chipsOf = (html: string): string[] => [...html.matchAll(CHIP_RE)].map((m) => m[1]);

test('every post renders the card, and every card carries the same chip set', async () => {
	expect(posts, 'the build has blog posts').not.toHaveLength(0);

	const counts = new Set<number>();
	const sets = new Set<string>();
	const bad: string[] = [];
	for (const post of posts) {
		const html = readFileSync(join(DIST, 'blog', post, 'index.html'), 'utf-8');
		const chips = chipsOf(html);
		if (!html.includes('class="blog-tools-card"')) bad.push(`${post} (no card)`);
		else if (!chips.length) bad.push(`${post} (card without chips)`);
		else {
			counts.add(chips.length);
			sets.add(chips.join('\n'));
		}
	}

	expect(bad, 'every post shows the card').toEqual([]);
	expect(counts.size, 'no post renders a different number of chips').toBe(1);
	expect(
		sets.size,
		'no post renders a different chip set — the card is shared markup',
	).toBe(1);
});

test('every chip resolves to a built page and to a live registry entry', async () => {
	const chips = chipsOf(readFileSync(join(DIST, 'blog', posts[0], 'index.html'), 'utf-8'));
	expect(chips, 'the card links some tools').not.toHaveLength(0);

	// The same union ToolShell uses for its related pool: the featured calculators
	// (standard, graph, graph3d) live in their own array and are absent from REGISTRY.
	const known = [...CALCULATOR_FEATURED, ...REGISTRY];

	const bad: string[] = [];
	for (const href of chips) {
		if (!href.startsWith('/')) bad.push(`${href} (not site-relative)`);
		else if (!existsSync(join(DIST, href.slice(1), 'index.html')))
			bad.push(`${href} (404s on all ${posts.length} posts)`);
		else {
			const slug = href.split('/').filter(Boolean).pop();
			if (!known.some((e) => e.slug === slug))
				bad.push(`${href} (${slug} is no longer a registry slug)`);
		}
	}
	expect(bad, 'renaming a registry slug would otherwise break the chip silently').toEqual([]);
});
