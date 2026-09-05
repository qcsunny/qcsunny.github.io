#!/usr/bin/env node
// IndexNow: one POST tells Bing, Yandex and Seznam that these URLs changed.
// The URL list comes from the sitemap the build just wrote — see
// ./lib/sitemap-urls.mjs, shared with scripts/baidu-push.mjs.
import { chunk, HOST, readSitemapUrls } from './lib/sitemap-urls.mjs';

// Unlike Baidu's token, the IndexNow key is public by design: it is verified by
// fetching https://<host>/<key>.txt, so it has to be served from public/.
const KEY = '5a68d90471c64eb3be0953ef82bc5951';
const KEY_LOCATION = `https://${HOST}/${KEY}.txt`;

// The spec's per-request ceiling.
const PER_REQUEST = 10_000;

async function main() {
	console.log(`[IndexNow] Preparing URL submission for https://${HOST}...`);

	const { urls, source } = readSitemapUrls();
	if (source === 'fallback') {
		console.log('[IndexNow] dist/sitemap-0.xml not found or empty. Using core URLs fallback.');
	}
	console.log(`[IndexNow] Found ${urls.length} URLs to submit.`);

	for (const batch of chunk(urls, PER_REQUEST)) {
		const payload = {
			host: HOST,
			key: KEY,
			keyLocation: KEY_LOCATION,
			urlList: batch,
		};

		try {
			const res = await fetch('https://api.indexnow.org/indexnow', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json; charset=utf-8',
				},
				body: JSON.stringify(payload),
			});

			if (res.status === 200) {
				console.log(`[IndexNow] ✓ Success (HTTP 200): All ${batch.length} URLs successfully submitted to search engines.`);
			} else if (res.status === 202) {
				console.log(`[IndexNow] ✓ Accepted (HTTP 202): Request accepted and queued for indexing.`);
			} else {
				const body = await res.text();
				console.warn(`[IndexNow] Response status: ${res.status}, body: ${body}`);
				// 403 UserForbiddedToAccessSite means the key is not (or no longer)
				// verified in Bing Webmaster Tools; retrying the next batch cannot fix
				// that, so stop instead of repeating the same rejection.
				return;
			}
		} catch (err) {
			console.error('[IndexNow] Failed to submit to IndexNow API:', err.message);
			return;
		}
	}
}

main();
