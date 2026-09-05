import { expect, test } from '@playwright/test';

// The two Atkinson files were 46.6 KB of the home page's 72 KB first-visit
// budget — 65%, and the only part of it HTTP compression cannot shrink, since
// woff/woff2 are already internally compressed. Subsetting (see
// scripts/subset-fonts.py) cut that to 29 KB. Nothing in the build enforces it:
// pointing astro.config.mjs back at a full-charset file, or at woff instead of
// woff2, rebuilds cleanly and silently doubles the budget. So pin the bytes.
//
// Ceilings, not equalities — the subset tracks the site's own text, so adding
// characters to a post legitimately moves these by a few hundred bytes. They sit
// just under the full-charset figures (18.6 / 19.3 KB as woff2, 22.8 / 23.8 KB
// as woff) so a regression to an un-subsetted file still trips them.
const MAX_PER_FILE = 15_500;
const MAX_TOTAL = 30_000;

test('web fonts ship as subsetted woff2 within the byte budget', async ({ page }) => {
	await page.goto('/');

	const links = await page
		.locator('link[rel="preload"][as="font"]')
		.evaluateAll((els) =>
			els.map((el) => ({
				href: el.getAttribute('href') ?? '',
				type: el.getAttribute('type') ?? '',
				crossorigin: el.hasAttribute('crossorigin'),
			})),
		);

	expect(links, 'expected regular + bold to be preloaded').toHaveLength(2);

	let total = 0;
	for (const link of links) {
		expect(link.href, 'woff2 only — woff wastes ~20% for no benefit').toMatch(/\.woff2$/);
		// A wrong type makes the browser fetch the font twice: once for the
		// speculative preload, once for real.
		expect(link.type, `type on ${link.href}`).toBe('font/woff2');
		// Fonts are always CORS-fetched; a preload without it is a second fetch.
		expect(link.crossorigin, `crossorigin on ${link.href}`).toBe(true);

		const res = await page.request.get(link.href);
		expect(res.status(), `GET ${link.href}`).toBe(200);
		const bytes = (await res.body()).length;
		expect(bytes, `${link.href} is ${bytes} B`).toBeLessThanOrEqual(MAX_PER_FILE);
		total += bytes;
	}

	expect(total, `both fonts total ${total} B`).toBeLessThanOrEqual(MAX_TOTAL);
});

// `swap` is what keeps the fonts off the critical rendering path: text paints
// immediately in the fallback and re-renders when Atkinson arrives. `block` (or
// the `auto` default, which most engines treat as block) would hold the first
// paint for up to 3s on a slow connection — the one change here that could turn
// a bandwidth cost into a visible delay.
test('every real @font-face uses font-display: swap', async ({ page }) => {
	await page.goto('/');
	await page.evaluate(() => document.fonts.ready);

	const faces = await page.evaluate(() =>
		[...document.fonts].map((f) => ({ family: f.family, display: f.display, status: f.status })),
	);

	// Astro also emits `local()` fallback faces carrying metric overrides; those
	// legitimately sit unloaded when the local font is absent, so filter to the
	// downloaded ones.
	const real = faces.filter((f) => !f.family.includes('fallback'));
	expect(real.length, 'expected two downloaded faces').toBe(2);

	for (const face of real) {
		expect(face.display, `${face.family} font-display`).toBe('swap');
		expect(face.status, `${face.family} did not load`).toBe('loaded');
	}
});
