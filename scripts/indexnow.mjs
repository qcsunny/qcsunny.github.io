#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const distSitemap = path.join(rootDir, 'dist', 'sitemap-0.xml');

const HOST = 'qcsunny.org';
const KEY = '5a68d90471c64eb3be0953ef82bc5951';
const KEY_LOCATION = `https://${HOST}/${KEY}.txt`;

async function main() {
	console.log(`[IndexNow] Preparing URL submission for https://${HOST}...`);

	let urls = [];
	if (fs.existsSync(distSitemap)) {
		const xml = fs.readFileSync(distSitemap, 'utf8');
		const matches = xml.matchAll(/<loc>(https:\/\/qcsunny\.org\/[^<]*)<\/loc>/g);
		for (const m of matches) {
			urls.push(m[1]);
		}
	}

	if (urls.length === 0) {
		console.log('[IndexNow] dist/sitemap-0.xml not found or empty. Using core URLs fallback.');
		urls = [
			`https://${HOST}/`,
			`https://${HOST}/blog/`,
			`https://${HOST}/tools/`,
			`https://${HOST}/calculators/`,
			`https://${HOST}/converters/`,
			`https://${HOST}/finance/`,
			`https://${HOST}/about/`,
			`https://${HOST}/privacy/`,
		];
	}

	// Remove duplicates and limit to 10,000 per IndexNow specs
	urls = Array.from(new Set(urls)).slice(0, 10000);
	console.log(`[IndexNow] Found ${urls.length} URLs to submit.`);

	const payload = {
		host: HOST,
		key: KEY,
		keyLocation: KEY_LOCATION,
		urlList: urls,
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
			console.log(`[IndexNow] ✓ Success (HTTP 200): All ${urls.length} URLs successfully submitted to search engines.`);
		} else if (res.status === 202) {
			console.log(`[IndexNow] ✓ Accepted (HTTP 202): Request accepted and queued for indexing.`);
		} else {
			const body = await res.text();
			console.warn(`[IndexNow] Response status: ${res.status}, body: ${body}`);
		}
	} catch (err) {
		console.error('[IndexNow] Failed to submit to IndexNow API:', err.message);
	}
}

main();
