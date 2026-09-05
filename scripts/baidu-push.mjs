#!/usr/bin/env node
// Baidu's push API ("普通收录 / API 推送"): hand it the sitemap's URLs so pages
// enter the index without waiting for a crawl. Same job as scripts/indexnow.mjs
// does for Bing, different protocol — Baidu wants newline-separated URLs as a
// text/plain body and answers with the day's remaining quota.
//
// Usage:
//   BAIDU_PUSH_TOKEN=xxxx node scripts/baidu-push.mjs      # push
//   node scripts/baidu-push.mjs --dry-run                  # show what would go
//
// The token is per-site and only visible in the Baidu console
// (https://ziyuan.baidu.com → 站点管理 → 普通收录 → API 提交 → 推送接口 token).
// It is a write credential for the site's index, so it lives in the environment
// (a GitHub Actions secret, say), never in this file. Without it the script says
// so and exits 0 — a missing token is "not configured yet", not a build failure.
import { chunk, ORIGIN, readSitemapUrls } from './lib/sitemap-urls.mjs';

// Baidu accepts at most 2000 URLs per request; the daily quota is far smaller
// than that for a new site, which is what `remain` in the response tracks.
const PER_REQUEST = 2000;

// The console prints this endpoint as http://. It answers over TLS too, and the
// token travels in the query string, so https is the only sane choice.
const endpoint = (token) =>
	`https://data.zz.baidu.com/urls?site=${encodeURIComponent(ORIGIN)}&token=${encodeURIComponent(token)}`;

async function main() {
	const dryRun = process.argv.includes('--dry-run');
	const token = process.env.BAIDU_PUSH_TOKEN;

	const { urls, source } = readSitemapUrls();
	console.log(
		`[Baidu] ${urls.length} URL(s) from ${source === 'sitemap' ? 'dist/sitemap-0.xml' : 'the core-page fallback (no build in dist/)'}.`,
	);

	if (dryRun) {
		for (const u of urls) console.log(`  ${u}`);
		console.log(`[Baidu] --dry-run: nothing was sent.`);
		return;
	}

	if (!token) {
		console.log(
			'[Baidu] Skipped: BAIDU_PUSH_TOKEN is not set. Get it from ziyuan.baidu.com → 站点管理 → 普通收录 → API 提交.',
		);
		return;
	}

	const batches = chunk(urls, PER_REQUEST);
	for (const [i, batch] of batches.entries()) {
		const label = batches.length > 1 ? ` (batch ${i + 1}/${batches.length})` : '';
		let res;
		try {
			res = await fetch(endpoint(token), {
				method: 'POST',
				headers: { 'Content-Type': 'text/plain' },
				body: batch.join('\n'),
			});
		} catch (err) {
			console.error(`[Baidu] Request failed${label}: ${err.message}`);
			return;
		}

		const text = await res.text();
		let body;
		try {
			body = JSON.parse(text);
		} catch {
			console.warn(`[Baidu] HTTP ${res.status}${label}, unparseable body: ${text.slice(0, 200)}`);
			return;
		}

		// Documented failures: 401 bad token, 400 site not verified / not matching
		// the `site` param, 404 unknown endpoint, 500 upstream. All of them mean the
		// next batch would fail the same way, so stop rather than burn the quota.
		if (body.error) {
			console.error(`[Baidu] ✗ error ${body.error}${label}: ${body.message ?? '(no message)'}`);
			return;
		}

		console.log(`[Baidu] ✓ accepted ${body.success ?? 0}/${batch.length} URL(s)${label}, quota remaining today: ${body.remain ?? '?'}`);
		// Baidu silently drops URLs that are not on the verified site or are
		// malformed; it reports them separately, and a typo in a route would
		// otherwise look like a successful push.
		for (const key of ['not_same_site', 'not_valid']) {
			if (Array.isArray(body[key]) && body[key].length) {
				console.warn(`[Baidu]   ${key}: ${body[key].join(', ')}`);
			}
		}
		if (body.remain === 0 && i + 1 < batches.length) {
			console.warn('[Baidu] Daily quota exhausted; remaining batches were not sent.');
			return;
		}
	}
}

main();
