// Add <link rel="modulepreload"> for the static imports of every page's module
// scripts. Wired in astro.config.mjs; runs in astro:build:done and rewrites the
// HTML in dist/.
//
// Why: Astro emits one hoisted entry chunk per page, and the browser can only
// discover what that chunk imports after it has downloaded and parsed it. The 46
// registry-driven tool pages made that chain three deep and 27 bytes wide:
//
//   HTML → _slug_….js (27 B, just `import"./main.js"`) → main.js (123 KB) → engine.js
//
// Three serial round trips before the code that runs the page has arrived, two
// of them spent learning the name of the next file. A preload link names those
// files in the HTML itself, so all three requests go out together. The same
// applies to /calculators/{standard,graph,graph3d}/, whose entry chunk imports
// engine.js and vars.js.
//
// Only *static* imports are preloaded. The workbench formatters (json, sql, jwt,
// markdown, …) are reached through `import()` and must stay lazy — preloading
// them would download eight tools nobody asked for. Dynamic specifiers are
// blanked out before the scan for exactly that reason.

import fs from 'node:fs';
import path from 'node:path';

const ASTRO = '_astro';

/** Relative specifiers imported statically by one emitted chunk.
 *
 *  Our own bundles only ever contain a relative `.js` string literal inside an
 *  import or export statement, so after the dynamic ones are removed every
 *  remaining literal is a static dependency. */
function staticDeps(code) {
	const flat = code.replace(/import\s*\(\s*(['"`])\.\/[^'"`]+\1\s*\)/g, 'import(0)');
	const out = new Set();
	for (const m of flat.matchAll(/['"`]\.\/([\w.$-]+\.js)['"`]/g)) out.add(m[1]);
	return [...out];
}

function walkHtml(dir, out = []) {
	for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
		const p = path.join(dir, e.name);
		if (e.isDirectory()) walkHtml(p, out);
		else if (e.name.endsWith('.html')) out.push(p);
	}
	return out;
}

export default function modulePreload() {
	return {
		name: 'modulepreload',
		hooks: {
			'astro:build:done': ({ logger, dir }) => {
				const root = dir.pathname;
				const astroDir = path.join(root, ASTRO);
				if (!fs.existsSync(astroDir)) return;

				const deps = new Map();
				for (const f of fs.readdirSync(astroDir)) {
					if (!f.endsWith('.js')) continue;
					deps.set(f, staticDeps(fs.readFileSync(path.join(astroDir, f), 'utf8')));
				}

				let pages = 0;
				let links = 0;
				for (const file of walkHtml(root)) {
					const html = fs.readFileSync(file, 'utf8');
					const entries = [
						...html.matchAll(new RegExp(`<script type="module" src="/${ASTRO}/([^"]+)"`, 'g')),
					].map((m) => m[1]);
					if (!entries.length) continue;

					// Breadth-first, so a page lists what its entry needs before what
					// that needs. Entries themselves are already in the HTML.
					const queue = [...entries];
					const seen = new Set(entries);
					const order = [];
					while (queue.length) {
						for (const d of deps.get(queue.shift()) ?? []) {
							if (seen.has(d)) continue;
							if (!deps.has(d)) {
								logger.warn(`skipping unknown import ${d}`);
								continue;
							}
							seen.add(d);
							order.push(d);
							queue.push(d);
						}
					}
					if (!order.length) continue;

					const tags = order
						.map((d) => `<link rel="modulepreload" href="/${ASTRO}/${d}">`)
						.join('');
					fs.writeFileSync(file, html.replace('</head>', `${tags}</head>`));
					pages++;
					links += order.length;
				}
				logger.info(`modulepreload added (${links} links across ${pages} pages)`);
			},
		},
	};
}
