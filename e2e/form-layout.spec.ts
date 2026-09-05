import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

// The 46 registry-driven tool pages build their inputs in the browser from a
// FormConfig (src/scripts/tools/form.ts), so nothing about the layout below is
// visible in the built HTML — only a rendered page can be measured.
//
// What is measured: a row of fields must put its inputs on one line, and no
// control may paint outside the column it was given. Both were broken. Each
// .t-field used to be a flex column, so a label that wrapped to two lines pushed
// its own input 19px below the ones beside it — visible on nine of the finance
// and calculator forms. And a <select> takes its automatic minimum size from its
// longest <option>, which on /finance/loan-payment/ was ~490px inside a 228px
// column: it painted underneath the two inputs to its right and showed through
// the column gap as a stray glyph.
const DIST = fileURLToPath(new URL('../dist', import.meta.url));

// /calculators/compound-interest/ and four others are alias pages that redirect
// to the canonical tool with a meta refresh; measuring them races the navigation
// and would only re-measure the target anyway.
function formRoutes(): string[] {
	const out: string[] = [];
	for (const cat of ['calculators', 'finance', 'tools', 'converters']) {
		for (const d of readdirSync(join(DIST, cat), { withFileTypes: true })) {
			if (!d.isDirectory()) continue;
			const html = readFileSync(join(DIST, cat, d.name, 'index.html'), 'utf-8');
			if (html.includes('http-equiv="refresh"')) continue;
			out.push(`/${cat}/${d.name}/`);
		}
	}
	return out.sort();
}

// Reads every field of the form on the current page. Returns null for the tool
// pages that are not forms (workbench tools, generators with bespoke widgets).
async function measure(page: import('@playwright/test').Page) {
	return page.evaluate(() => {
		const form = document.querySelector('.t-form');
		if (!form) return null;
		const rows = new Map<number, { id: string; top: number }[]>();
		const overflowing: string[] = [];
		for (const f of form.querySelectorAll<HTMLElement>('.t-field')) {
			const fr = f.getBoundingClientRect();
			if (!fr.height) continue; // showIf hid it
			const ctl = f.querySelector('input,select,textarea') as HTMLElement | null;
			if (!ctl) continue;
			const cr = ctl.getBoundingClientRect();
			const id = ctl.id.replace('t-f-', '');
			if (Math.round(cr.right) > Math.round(fr.right) + 1)
				overflowing.push(`${id} spills ${Math.round(cr.right - fr.right)}px past its column`);
			const band = Math.round(fr.top);
			if (!rows.has(band)) rows.set(band, []);
			rows.get(band)!.push({ id, top: Math.round(cr.top) });
		}
		const misaligned = [...rows.values()]
			.filter((band) => new Set(band.map((f) => f.top)).size > 1)
			.map((band) => band.map((f) => `${f.id}@${f.top}`).join(' / '));
		return { misaligned, overflowing };
	});
}

// Both sweeps below walk every form page in one test, so their budget is the
// number of pages, not the 30s a single-interaction test needs: 46 navigations
// plus two page.evaluate calls each. Standalone they take ~20s; sharing four
// workers with the other 89 cases pushed them past the default and they timed
// out mid-sweep in CI while passing on their own.
const SWEEP_TIMEOUT = 120_000;

test('every row of inputs lines up, no control leaves its column, no Chinese leaks', async ({
	page,
}) => {
	test.setTimeout(SWEEP_TIMEOUT);
	await page.setViewportSize({ width: 1280, height: 900 });
	const bad: string[] = [];
	const leaks: string[] = [];
	for (const route of formRoutes()) {
		await page.goto(route);
		const m = await measure(page);
		if (!m) continue;
		for (const b of m.misaligned) bad.push(`${route}: inputs on different lines — ${b}`);
		for (const o of m.overflowing) bad.push(`${route}: ${o}`);
		for (const f of await visibleChinese(page)) leaks.push(`${route} → ${f}`);
	}
	expect(bad, 'form field layout').toEqual([]);
	expect(leaks, 'Chinese showing in the English view').toEqual([]);
});

test('a single-column form still keeps its controls inside the page', async ({ page }) => {
	test.setTimeout(SWEEP_TIMEOUT);
	await page.setViewportSize({ width: 375, height: 812 });
	const bad: string[] = [];
	for (const route of formRoutes()) {
		await page.goto(route);
		const m = await measure(page);
		if (!m) continue;
		for (const o of m.overflowing) bad.push(`${route}: ${o}`);
		const spill = await page.evaluate(
			() => document.documentElement.scrollWidth - document.documentElement.clientWidth,
		);
		if (spill > 0) bad.push(`${route}: page scrolls ${spill}px sideways`);
	}
	expect(bad, 'form field layout at 375px').toEqual([]);
});

// An <option> cannot hold the .i18n-en / .i18n-zh span pair the rest of the site
// uses, so form.ts used to write `${label} (${labelZh})` into it — both languages
// at once, in both languages. Several English labels in finance.ts already
// carried their Chinese in parentheses, so those options printed the Chinese
// twice: "Forward: Loan Amount to Monthly Payment (正向：…) (正向：…)", 490px of it.
// The text is now swapped when Header.astro flips html[data-lang].
const CJK = /[一-鿿]/;

test('option text shows one language and follows the language switch', async ({ page }) => {
	await page.goto('/finance/loan-payment/');
	const sel = page.locator('#t-f-calcMode');
	const read = () => sel.evaluate((s: HTMLSelectElement) => [...s.options].map((o) => o.textContent ?? ''));

	const en = await read();
	expect(en.length).toBe(2);
	for (const t of en) expect(t, 'English options must not carry a Chinese gloss').not.toMatch(CJK);

	await page.evaluate(() => {
		document.documentElement.dataset.lang = 'zh';
	});
	await expect
		.poll(async () => (await read())[0], { message: 'options follow html[data-lang]' })
		.toMatch(CJK);
	const zh = await read();
	for (const t of zh) expect(t, 'Chinese options must not repeat the English').not.toMatch(/[A-Za-z]{4}/);
});

// The unit gloss is deliberately bilingual and identical in both views — "(years
// / 年)", "($ / ¥)" — so it is the one exception. Everything else in the English
// view of a form must be English: this pins the fourteen option labels, one
// result row and one hint in finance.ts whose English text used to embed its own
// translation in parentheses.
async function visibleChinese(page: import('@playwright/test').Page): Promise<string[]> {
	return page.evaluate(() => {
		const form = document.querySelector('.t-form');
		if (!form) return [];
		const out: string[] = [];
		const walk = document.createTreeWalker(form, NodeFilter.SHOW_TEXT);
		let n: Node | null;
		while ((n = walk.nextNode())) {
			const text = (n.nodeValue ?? '').trim();
			if (!/[一-鿿]/.test(text)) continue;
			const el = n.parentElement!;
			if (el.closest('.t-suffix')) continue; // bilingual unit gloss, by design
			const shown = el.tagName === 'OPTION' ? (el as HTMLOptionElement).selected : el.offsetParent !== null;
			if (shown) out.push(`${el.tagName}.${el.className || '-'}: ${text.slice(0, 40)}`);
		}
		return out;
	});
}
