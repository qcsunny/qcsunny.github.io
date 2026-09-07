import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { CALCULATOR_FEATURED, REGISTRY } from '../src/tools/registry';

// Redirect pages are gone by design. Every tool that once lived at a legacy URL
// and meta-refreshed to its new home has been retired instead — the developer
// tools moved from /tools/<slug> to /devtools/<slug>, the calculator split pages
// and the folded finance/calculator tools 404 at their old addresses. The
// decision since 2026-09 is: no redirects at all. A stale URL 404s, the sitemap
// only ever lists real pages, and the site links only pages that exist.
//
// This file used to verify that the handful of redirect pages agreed with their
// canonical targets; with zero of them left, that invariant is vacuous and is
// replaced by the stronger one below: reintroducing a kind:'redirect' entry or
// a built meta-refresh page fails the build, so a legacy stub cannot quietly
// come back.

const DIST = fileURLToPath(new URL('../dist', import.meta.url));
const REDIRECTS = [...CALCULATOR_FEATURED, ...REGISTRY].filter((e) => e.kind === 'redirect');

test('the registry declares no redirect pages', () => {
	expect(REDIRECTS).toEqual([]);
});

test('no built page carries a meta-refresh redirect', () => {
	const offenders: string[] = [];
	const walk = (dir: string) => {
		for (const d of readdirSync(dir, { withFileTypes: true })) {
			const p = join(dir, d.name);
			if (d.isDirectory()) walk(p);
			else if (d.name === 'index.html' && readFileSync(p, 'utf-8').includes('http-equiv="refresh"'))
				offenders.push(p.slice(DIST.length + 1));
		}
	};
	walk(DIST);
	expect(offenders).toEqual([]);
});
