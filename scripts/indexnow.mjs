#!/usr/bin/env node
// IndexNow: One POST informs Bing, Yandex, Seznam, and Naver of created or updated URLs.
// The URL list defaults to the sitemap emitted by the build (dist/sitemap-0.xml),
// or can be passed as CLI arguments for single/targeted URL updates.
//
// Shared sitemap reader: ./lib/sitemap-urls.mjs (shared with scripts/baidu-push.mjs).
import { chunk, HOST, ORIGIN, readSitemapUrls } from './lib/sitemap-urls.mjs';

// The IndexNow key is public by design: verified by fetching https://<host>/<key>.txt
const KEY = '5a68d90471c64eb3be0953ef82bc5951';
const KEY_LOCATION = `https://${HOST}/${KEY}.txt`;

// IndexNow protocol endpoint list with fallback support.
// IndexNow shares submitted URLs across all participating engines (Bing, Yandex, Seznam, Naver),
// so a successful submission to any active gateway propagates across the entire network.
const ENDPOINTS = [
	{ name: 'Yandex', url: 'https://yandex.com/indexnow' },
	{ name: 'IndexNow API', url: 'https://api.indexnow.org/indexnow' },
	{ name: 'Bing', url: 'https://www.bing.com/indexnow' },
	{ name: 'Naver', url: 'https://searchadvisor.naver.com/indexnow' },
];

const PER_REQUEST = 10_000;

async function submitBatch(batch, endpoint) {
	const payload = {
		host: HOST,
		key: KEY,
		keyLocation: KEY_LOCATION,
		urlList: batch,
	};

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 10_000);

	try {
		const res = await fetch(endpoint.url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json; charset=utf-8',
			},
			body: JSON.stringify(payload),
			signal: controller.signal,
		});
		clearTimeout(timeout);

		const text = await res.text();
		if (res.status === 200 || res.status === 202) {
			return { ok: true, status: res.status, body: text };
		}
		return { ok: false, status: res.status, body: text };
	} catch (err) {
		clearTimeout(timeout);
		return { ok: false, status: 0, body: err.message };
	}
}

async function main() {
	const args = process.argv.slice(2).filter((a) => !a.startsWith('-'));

	let urls = [];
	if (args.length > 0) {
		urls = args.map((u) => (u.startsWith('http') ? u : `${ORIGIN}${u.startsWith('/') ? '' : '/'}${u}`));
		console.log(`[IndexNow] Targeted manual mode: submitting ${urls.length} specified URL(s)...`);
	} else {
		console.log(`[IndexNow] Automated sitemap mode: reading URLs for https://${HOST}...`);
		const sitemap = readSitemapUrls();
		urls = sitemap.urls;
		if (sitemap.source === 'fallback') {
			console.log('[IndexNow] Notice: dist/sitemap-0.xml not found. Using core hub URLs fallback.');
		}
	}

	console.log(`[IndexNow] Total URLs queued: ${urls.length}`);
	if (!urls.length) {
		console.log('[IndexNow] No URLs to submit. Exiting.');
		return;
	}

	const batches = chunk(urls, PER_REQUEST);
	let allSuccessful = true;

	for (let i = 0; i < batches.length; i++) {
		const batch = batches[i];
		console.log(`[IndexNow] Processing batch ${i + 1}/${batches.length} (${batch.length} URLs)...`);

		let batchAccepted = false;
		for (const ep of ENDPOINTS) {
			process.stdout.write(`[IndexNow]   -> Trying ${ep.name} (${ep.url})... `);
			const result = await submitBatch(batch, ep);

			if (result.ok) {
				console.log(`✓ Accepted (HTTP ${result.status})`);
				batchAccepted = true;
				break;
			} else {
				console.log(`✗ Failed (HTTP ${result.status}: ${result.body || 'No response body'})`);
			}
		}

		if (!batchAccepted) {
			console.error(`[IndexNow] ✗ Batch ${i + 1} could not be submitted to any IndexNow gateway.`);
			allSuccessful = false;
		}
	}

	if (allSuccessful) {
		console.log(`[IndexNow] ✓ Success: All URLs successfully broadcasted to the IndexNow search engine mesh.`);
	} else {
		console.warn(`[IndexNow] ⚠ Completed with warnings: Some batches could not be verified.`);
	}
}

main().catch((err) => {
	console.error('[IndexNow] Fatal unhandled error:', err);
	process.exit(1);
});
