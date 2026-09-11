import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { HIDDEN_TOOLS, REGISTRY } from '../src/tools/registry';

// A tool marked `disabled` is retired without deleting its code: the registry
// drops it at one point (see REGISTRY), so no page is built — its URL 404s,
// which the site's no-redirect policy requires — and every listing that
// derives from REGISTRY follows. The config stays in the category's lazy chunk
// because catalog.ts imports the data files, so re-enabling is a flag flip.
//
// Nobody is disabled today, so every assertion below is vacuous. The point is
// that the mechanism fails loudly the first time a disabled tool leaks past
// that single filter, instead of shipping a page nobody can reach or a search
// row pointing at a 404.

const DIST = fileURLToPath(new URL('../dist', import.meta.url));

/** Every route the build emitted, as its href ("/office/pdf-ocr/"). */
const builtPages = (() => {
	const pages = new Set<string>();
	const walk = (dir: string) => {
		for (const d of readdirSync(dir, { withFileTypes: true })) {
			const p = join(dir, d.name);
			if (d.isDirectory()) walk(p);
			else if (d.name === 'index.html') pages.add('/' + p.slice(DIST.length + 1).replace(/index\.html$/, ''));
		}
	};
	walk(DIST);
	return pages;
})();

const htmlOf = (path: string) => readFileSync(join(DIST, path), 'utf-8');
const searchRows = JSON.parse(readFileSync(join(DIST, 'search-index.json'), 'utf-8')).rows as [string, string, string, string, string, string, string, string][];
const llms = htmlOf('llms.txt');
const listedPages = [...builtPages].filter((p) => p !== '/404/');

// Runs unconditionally (the loop below has no tests until a tool is disabled):
// this is what pins the filter itself, so a tool that is declared disabled but
// still reaches REGISTRY fails here rather than shipping a page.
test('no disabled tool survives into the registry', () => {
	const hidden = new Set(HIDDEN_TOOLS.map((tool) => `${tool.category}/${tool.slug}`));
	expect(
		REGISTRY.filter((tool) => hidden.has(`${tool.category}/${tool.slug}`)).map((tool) => tool.slug),
	).toEqual([]);
});

for (const tool of HIDDEN_TOOLS) {
	const href = `/${tool.category}/${tool.slug}/`;
	const offenders: string[] = [];
	if (builtPages.has(href)) offenders.push('a built page at ' + href);
	if (searchRows.some((row) => row[0] === href)) offenders.push('a row in search-index.json');
	if (llms.includes(href)) offenders.push('a link in llms.txt');
	for (const page of listedPages) {
		if (htmlOf(page).includes(`href="${href}"`)) offenders.push(`a link from ${page}`);
	}
	test(`disabled tool stays off the site: ${tool.slug}`, () => {
		expect(offenders, offenders.join('; ')).toEqual([]);
	});
}
