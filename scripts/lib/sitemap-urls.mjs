// The URL list every push script sends is just the sitemap the build already
// wrote: astro:sitemap emits dist/sitemap-0.xml (indexed by sitemap-index.xml),
// so nothing here needs its own idea of which pages exist — a new tool or post
// shows up in the next push for free.
//
// Shared by scripts/indexnow.mjs (Bing/Yandex/Seznam) and scripts/baidu-push.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const HOST = 'qcsunny.org';
export const ORIGIN = `https://${HOST}`;

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// Enough to keep a push useful when it runs without a build next to it — the
// hubs, which is where a crawler finds everything else anyway.
const CORE_PATHS = [
	'/',
	'/blog/',
	'/tools/',
	'/calculators/',
	'/converters/',
	'/finance/',
	'/about/',
	'/privacy/',
];

/**
 * URLs from dist/sitemap-0.xml, deduped and in sitemap order.
 * Falls back to the core hub pages when there is no build in dist/.
 * @returns {{ urls: string[], source: 'sitemap' | 'fallback' }}
 */
export function readSitemapUrls() {
	const file = path.join(rootDir, 'dist', 'sitemap-0.xml');
	if (fs.existsSync(file)) {
		const xml = fs.readFileSync(file, 'utf8');
		const urls = [...xml.matchAll(/<loc>(https:\/\/qcsunny\.org\/[^<]*)<\/loc>/g)].map((m) => m[1]);
		if (urls.length) return { urls: [...new Set(urls)], source: 'sitemap' };
	}
	return { urls: CORE_PATHS.map((p) => ORIGIN + p), source: 'fallback' };
}

/** Split into batches of at most `size`, because every push API caps a request. */
export function chunk(items, size) {
	const out = [];
	for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
	return out;
}
