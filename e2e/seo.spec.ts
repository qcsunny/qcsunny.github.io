import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

// SEO / machine-readable asset checks. These run against the built site in CI,
// so a broken generator (llms-txt.mjs, og-images.mjs) or an unreachable sitemap
// entry blocks the deploy instead of shipping silently.

const pathOf = (loc: string) => new URL(loc).pathname;

test('robots.txt allows crawling and points at the sitemap index', async ({ request }) => {
	const res = await request.get('/robots.txt');
	expect(res.status()).toBe(200);

	const body = await res.text();
	expect(body).toMatch(/User-agent:\s*\*/);
	expect(body).toMatch(/Allow:\s*\//);
	expect(body).toContain('Sitemap: https://qcsunny.org/sitemap-index.xml');
});

test('every sitemap URL resolves and no noindex page leaks in', async ({ request }) => {
	const index = await request.get('/sitemap-index.xml');
	expect(index.status()).toBe(200);

	const childLocs = [...(await index.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
	expect(childLocs.length).toBeGreaterThan(0);

	const urls: string[] = [];
	for (const child of childLocs) {
		const res = await request.get(pathOf(child));
		expect(res.status()).toBe(200);
		urls.push(...[...(await res.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]));
	}

	// The whole public surface should be listed, and only real pages.
	expect(urls.length).toBeGreaterThan(60);
	for (const u of urls) {
		expect(u.startsWith('https://qcsunny.org/')).toBe(true);
		expect(u).not.toMatch(/\/404\/?$/);
	}

	// Fetch in batches so 70+ checks stay well inside the test timeout.
	for (let i = 0; i < urls.length; i += 12) {
		const batch = urls.slice(i, i + 12);
		const codes = await Promise.all(
			batch.map(async (u) => (await request.get(pathOf(u))).status()),
		);
		expect(codes, `broken sitemap entries near ${batch[0]}`).toEqual(batch.map(() => 200));
	}
});

test('llms.txt is generated and its stated tool count matches its listing', async ({ request }) => {
	const res = await request.get('/llms.txt');
	expect(res.status()).toBe(200);

	const body = await res.text();
	expect(body).toContain('# QCSunny Lab');
	expect(body).toContain('## Online Tools');
	expect(body).toContain('## Engineering Blog');

	const claimed = Number(body.match(/collection of (\d+) free/)?.[1]);
	const toolLinks = (body.match(/^- \[/gm) ?? []).length;
	const postLinks = (body.match(/\/blog\//g) ?? []).length;
	expect(claimed).toBe(toolLinks - postLinks);
	expect(postLinks).toBeGreaterThan(0);
});

test('blog posts get a generated 1200x630 OG card', async ({ page, request }) => {
	await page.goto('/blog/uuid-v4-vs-v7-database-guide/');

	const og = await page.locator('meta[property="og:image"]').getAttribute('content');
	expect(og).toBe('https://qcsunny.org/og/uuid-v4-vs-v7-database-guide.png');
	await expect(page.locator('meta[name="twitter:image"]')).toHaveAttribute('content', og!);

	const res = await request.get(pathOf(og!));
	expect(res.status()).toBe(200);
	expect(res.headers()['content-type']).toContain('image/png');

	// PNG IHDR carries width/height as big-endian uint32 at bytes 16 and 20.
	const png = await res.body();
	expect(png.readUInt32BE(16)).toBe(1200);
	expect(png.readUInt32BE(20)).toBe(630);
});

// Caching is a deploy-time concern (Cloudflare reads dist/_headers), so the
// preview server cannot show it — assert the shipped rules instead. Without
// them Workers falls back to `max-age=0, must-revalidate` on the hashed
// bundles and every navigation re-checks ~190KB over the network.
test('_headers ships immutable caching for content-hashed assets', async () => {
	const rules = await readFile(new URL('../dist/_headers', import.meta.url), 'utf8');

	expect(rules).toMatch(/^\/_astro\/\*$/m);
	expect(rules).toMatch(/max-age=31536000/);
	expect(rules).toMatch(/immutable/);

	// OG cards keep a stable URL across builds, so they must NOT be immutable.
	const ogBlock = rules.slice(rules.indexOf('/og/*'));
	expect(ogBlock).not.toContain('immutable');

	// HTML must keep revalidating or a deploy stays invisible.
	expect(rules).not.toMatch(/^\/\*$/m);
});
