import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { REGISTRY } from '../src/tools/registry';

// The toolbox is bilingual by CSS: global.css:369 hides .i18n-zh unless
// html[data-lang='zh'], and .i18n-en when it is. Anything a template writes as a
// span pair is therefore right by construction. Four kinds of text cannot hold a
// span pair — an <option>'s content, a placeholder, an aria-label/title, and
// plain text a script drops into a <textarea> — and those are rewritten from
// JavaScript against html[data-lang]. None of it is visible in the built HTML, so
// only a rendered page can say whether the English view is actually English.
//
// Three failure classes this guards, all of which shipped:
//   - a script testing `lang !== 'en'` and so defaulting to Chinese, the opposite
//     of what the CSS paints (markdown.ts's getLang, plus three others);
//   - a report blob written into wb.outputArea.value in Chinese only (jwt.ts,
//     url.ts) — a <textarea> holds text, not markup, so nothing hides half of it;
//   - `${label} (${labelZh})` inside an <option>, printing both languages at once.
const DIST = fileURLToPath(new URL('../dist', import.meta.url));

// A fifth class the sweeps below cannot see at all: the rows a form prints
// *after* you press Calculate. They come from compute() as {label, labelZh,
// value, valueZh} and form.ts feeds each pair to bilingual(), which emits a span
// pair only when the Zh half exists — a missing valueZh silently prints the
// English string in the Chinese view. Six such rows shipped ("4462.58 / month"
// on /finance/mortgage/ under three of its loan types, and two more elsewhere).
// Reaching them through the browser would mean filling and submitting 46 forms
// in every branch, so this reads the registry directly instead: same data, same
// verdict, no navigation.
const CJK_ANY = /[㐀-鿿＀-￯]/;
const LATIN_WORD = /[A-Za-z]{3,}/;
const plain = (t: string): string => t.replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;/g, ' ');

// Every branch a single selector change can reach, from the field defaults. Not
// the full cartesian product — one override at a time already covers each
// `if (method === …)` arm, which is where the untranslated rows were hiding.
function branches(fields: { id: string; type?: string; def?: unknown; options?: { value: string }[] }[]) {
	const base: Record<string, string | boolean> = {};
	for (const f of fields) if (f.def !== undefined) base[f.id] = f.def as string | boolean;
	const out = [base];
	for (const f of fields) {
		if (f.type === 'select') for (const o of f.options ?? []) out.push({ ...base, [f.id]: o.value });
		if (f.type === 'checkbox') out.push({ ...base, [f.id]: !base[f.id] });
	}
	return out;
}

test('every computed result row exists in both languages', () => {
	const leaks: string[] = [];
	for (const tool of REGISTRY) {
		const cfg = tool.config as {
			fields?: Parameters<typeof branches>[0];
			compute?: (v: unknown) => Record<string, unknown>;
		};
		if (!cfg?.fields || !cfg.compute) continue;
		const seen = new Set<string>();
		for (const vals of branches(cfg.fields)) {
			let out: Record<string, unknown>;
			try {
				out = cfg.compute({
					num: (i: string) => Number(vals[i] ?? 0),
					str: (i: string) => String(vals[i] ?? ''),
					bool: (i: string) => vals[i] === true,
				});
			} catch {
				continue; // a branch the defaults cannot satisfy; the form guards it
			}
			const say = (msg: string): void => {
				const line = `${tool.category}/${tool.slug}: ${msg}`;
				if (seen.has(line)) return;
				seen.add(line);
				leaks.push(line);
			};
			for (const row of (out.rows ?? []) as Record<string, string>[]) {
				const en = plain(String(row.value ?? ''));
				const zh = row.valueZh === undefined ? null : plain(String(row.valueZh));
				if (CJK_ANY.test(en)) say(`English value is Chinese — ${JSON.stringify(en.slice(0, 60))}`);
				if (zh === null && LATIN_WORD.test(en))
					say(`no valueZh, so the Chinese view prints — ${JSON.stringify(en.slice(0, 60))}`);
				if (zh !== null && LATIN_WORD.test(zh))
					say(`valueZh carries English — ${JSON.stringify(zh.slice(0, 60))}`);
				if (row.label && CJK_ANY.test(row.label)) say(`English label is Chinese — ${row.label}`);
				if (row.label && row.labelZh === undefined) say(`no labelZh — ${row.label}`);
			}
			for (const key of ['note', 'planEvaluation']) {
				const en = out[key];
				if (typeof en !== 'string') continue;
				if (CJK_ANY.test(plain(en))) say(`English ${key} is Chinese`);
				if (out[`${key}Zh`] === undefined && LATIN_WORD.test(plain(en))) say(`no ${key}Zh`);
			}
		}
	}
	expect(leaks, 'compute() rows must carry both halves').toEqual([]);
});

// Alias pages redirect with a meta refresh; measuring them races the navigation
// and only re-measures the canonical tool anyway.
function toolRoutes(): string[] {
	const out = ['/calculators/', '/finance/', '/tools/', '/converters/'];
	for (const cat of ['calculators', 'finance', 'tools', 'converters']) {
		for (const d of readdirSync(join(DIST, cat), { withFileTypes: true })) {
			if (!d.isDirectory()) continue;
			const html = readFileSync(join(DIST, cat, d.name, 'index.html'), 'utf-8');
			if (html.includes('http-equiv="refresh"')) continue;
			out.push(`/${cat}/${d.name}/`);
		}
	}
	return out;
}

// 50 routes per sweep, so the budget is the route count rather than the 30s a
// single-interaction test needs.
const SWEEP_TIMEOUT = 180_000;

// The one exemption. Under .t-content — the About/FAQ prose — a Chinese unit or
// policy name in parentheses is the subject of the English sentence around it:
// "How many grams is 1 Chinese jin (市斤)?", "Equal Principal & Interest
// (等额本息)", '"中" is 3 bytes'. Fourteen of those are deliberate, so prose is
// judged by how much of it is Chinese rather than by whether any of it is. The
// widest real gloss is 15% of its sentence (finance/tax's 多发少得盲区); the
// narrowest real leak measured was 67% (sql.ts's idle status). Chrome — labels,
// options, buttons, statuses, placeholders — gets no tolerance at all: the
// <option> bug that started this was itself a parenthesised gloss, at 16%.
const PROSE_MAX_CJK_SHARE = 0.3;

async function chineseInEnglishView(page: Page, maxShare: number): Promise<string[]> {
	return page.evaluate((maxShare) => {
		const CJK = /[㐀-䶿一-鿿豈-﫿]/g;
		const out: string[] = [];
		const seen = new Set<string>();
		const push = (why: string, el: Element, text: string) => {
			const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/)[0] : '';
			const where = el.tagName.toLowerCase() + (el.id ? `#${el.id}` : cls ? `.${cls}` : '');
			const line = `${why} @ ${where}: ${JSON.stringify(text.replace(/\s+/g, ' ').slice(0, 80))}`;
			if (seen.has(line)) return;
			seen.add(line);
			out.push(line);
		};
		// A closed <details> hides the FAQ answers, which is where most of the
		// deliberate glosses live; open them so the sweep reads what a reader can.
		for (const d of document.querySelectorAll('details')) d.open = true;
		const share = (t: string): number => {
			const compact = t.replace(/\s+/g, '');
			return compact ? (compact.match(CJK) ?? []).length / compact.length : 0;
		};
		const visible = (el: Element): boolean =>
			el.checkVisibility({ contentVisibilityAuto: true, visibilityProperty: true });
		const judge = (el: Element, text: string, why: string) => {
			const s = share(text);
			if (!s) return;
			// The switch itself names both languages; that is the whole button.
			if (el.closest('.t-lang, .lang-toggle')) return;
			if (el.closest('.t-content')) {
				if (s >= maxShare) push(`prose is ${Math.round(s * 100)}% Chinese`, el, text);
			} else push(why, el, text);
		};

		const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
		for (let n = walk.nextNode(); n; n = walk.nextNode()) {
			const text = (n.nodeValue ?? '').replace(/\s+/g, ' ').trim();
			if (!text) continue;
			const el = n.parentElement;
			if (!el || el.closest('script,style,template,noscript')) continue;
			if (!visible(el)) continue;
			if (el.closest('.i18n-zh')) push('a hidden .i18n-zh span is showing', el, text);
			else judge(el, text, 'Chinese text');
		}
		// Text that cannot hold a span pair, so a script has to rewrite it.
		for (const c of document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
			'input,textarea',
		)) {
			if (!visible(c)) continue;
			if (c.placeholder) judge(c, c.placeholder, 'Chinese placeholder');
			if (c.type !== 'password' && typeof c.value === 'string')
				judge(c, c.value, 'Chinese in a control value');
		}
		// An <option> is never itself "visible"; its <select> is what shows.
		for (const sel of document.querySelectorAll('select')) {
			if (!visible(sel)) continue;
			for (const o of sel.options) judge(o, o.textContent ?? '', 'Chinese <option>');
		}
		for (const el of document.querySelectorAll('[aria-label],[title]')) {
			if (!visible(el)) continue;
			const aria = el.getAttribute('aria-label');
			const title = el.getAttribute('title');
			if (aria) judge(el, aria, 'Chinese aria-label');
			if (title) judge(el, title, 'Chinese title');
		}
		return out;
	}, maxShare);
}

test('the English view of every toolbox page is English', async ({ browser }) => {
	test.setTimeout(SWEEP_TIMEOUT);
	// BaseHead reads localStorage first and falls back to navigator.language, so
	// pin the stored preference rather than relying on the context locale.
	const ctx = await browser.newContext();
	await ctx.addInitScript(`try { localStorage.setItem('site:lang', 'en'); } catch {}`);
	const page = await ctx.newPage();
	const leaks: string[] = [];
	for (const route of toolRoutes()) {
		await page.goto(route);
		await expect(page.locator('html')).toHaveAttribute('data-lang', 'en');
		for (const l of await chineseInEnglishView(page, PROSE_MAX_CJK_SHARE))
			leaks.push(`${route} → ${l}`);
	}
	await ctx.close();
	expect(leaks, 'Chinese showing in the English view').toEqual([]);
});

// The mirror image is cheap to state exactly, so it needs no heuristic: in the
// Chinese view the English halves are hidden by CSS, and every tool has Chinese
// About/FAQ prose (so the .t-content-en fallback for a tool that has none must
// never fire).
test('the Chinese view hides every English half', async ({ browser }) => {
	test.setTimeout(SWEEP_TIMEOUT);
	const ctx = await browser.newContext();
	await ctx.addInitScript(`try { localStorage.setItem('site:lang', 'zh'); } catch {}`);
	const page = await ctx.newPage();
	const leaks: string[] = [];
	for (const route of toolRoutes()) {
		await page.goto(route);
		await expect(page.locator('html')).toHaveAttribute('data-lang', 'zh');
		const shown = await page.evaluate(() => {
			const out: string[] = [];
			for (const el of document.querySelectorAll('.i18n-en, .t-content-en')) {
				if (!el.checkVisibility({ contentVisibilityAuto: true, visibilityProperty: true })) continue;
				const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
				const cls = (el.getAttribute('class') ?? '').trim().split(/\s+/)[0];
				out.push(`${el.tagName.toLowerCase()}.${cls}: ${JSON.stringify(text)}`);
			}
			return out;
		});
		for (const s of shown) leaks.push(`${route} → ${s}`);
	}
	await ctx.close();
	expect(leaks, 'English showing in the Chinese view').toEqual([]);
});

// Text a script wrote cannot be hidden by CSS, so the only proof it follows the
// switch is that it changes when the switch is thrown. Each probe reads a string
// that exists only at runtime, clicks the page's own .t-lang button, and requires
// the string to come back different and Chinese.
const SAMPLE_JWT =
	'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
	'eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.' +
	'SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

// .first(): a converter page has two of these (the from and the to unit
// picker), and both carry the same option list.
const optionText = (page: Page, sel: string): Promise<string> =>
	page
		.locator(sel)
		.first()
		.evaluate((s: HTMLSelectElement) => [...s.options].map((o) => o.textContent).join('|'));

const PROBES: {
	route: string;
	what: string;
	prepare?: (page: Page) => Promise<void>;
	read: (page: Page) => Promise<string>;
}[] = [
	{
		route: '/tools/jwt-decoder/',
		what: 'the decoded report in the output <textarea>',
		prepare: async (page) => {
			await page.fill('textarea[data-role="input"]', SAMPLE_JWT);
			await expect
				.poll(() => page.inputValue('textarea[data-role="output"]'), { timeout: 5_000 })
				.toContain('PAYLOAD');
		},
		read: (page) => page.inputValue('textarea[data-role="output"]'),
	},
	{
		route: '/tools/url-parser/',
		what: 'the URL breakdown in the output <textarea>',
		prepare: async (page) => {
			await page.fill('textarea[data-role="input"]', 'https://example.com/a/b?utm_source=x&id=7#frag');
			await expect
				.poll(() => page.inputValue('textarea[data-role="output"]'), { timeout: 5_000 })
				.toContain('example.com');
		},
		read: (page) => page.inputValue('textarea[data-role="output"]'),
	},
	{
		route: '/tools/markdown-preview/',
		what: 'the untouched sample document in the editor',
		read: (page) => page.inputValue('textarea[data-role="input"]'),
	},
	{
		route: '/finance/loan-payment/',
		what: 'the <option> labels of the direction select',
		read: (page) => optionText(page, '#t-f-calcMode'),
	},
	{
		route: '/converters/weight/',
		what: 'the unit names in the converter select',
		read: (page) => optionText(page, '.t-conv-select'),
	},
	{
		// The three <option>s of the style picker used to read "Surface · 曲面" —
		// both languages at once. They now carry data-text-en/zh, swapped by
		// ToolShell's syncLangUI, which is the only writer for an <option>.
		route: '/calculators/graph3d/',
		what: 'the <option> labels of the surface style picker',
		read: (page) => optionText(page, '#g3-style'),
	},
	{
		// The theme button's tooltip printed "Auto theme (follows browser) / 跟随系统"
		// on all 53 shell pages. aria-label and title hold plain text, so a span
		// pair cannot help: the MutationObserver on data-lang re-runs syncThemeUI.
		route: '/tools/json-formatter/',
		what: 'the theme button tooltip (an attribute, so no span pair can hold it)',
		read: (page) => page.getAttribute('.t-theme', 'title').then((v) => v ?? ''),
	},
	{
		route: '/tools/word-counter/',
		what: "the input placeholder (TextConfig.placeholderZh, which nothing read until 2026-09)",
		read: (page) => page.getAttribute('textarea[data-role="input"]', 'placeholder').then((v) => v ?? ''),
	},
];

const CJK_ANYWHERE = /[㐀-䶿一-鿿]/;

// The mortgage comparison chart is the one place where the site's own span pair
// is impossible for a different reason: an SVG <text> holds text, not elements.
// It emits both languages as two <text> elements at the same coordinates and
// lets the global CSS hide one, so the invariant to pin is the pairing — a label
// added later without going through the t() helper would show in both views.
test('the mortgage chart labels its axes and legend in one language', async ({ page }) => {
	await page.goto('/finance/mortgage/');
	const chart = page.locator('.t-chartwrap svg');
	await expect(chart, 'the compare view renders a chart').toHaveCount(1);

	const shape = await chart.evaluate((svg) => {
		const all = [...svg.querySelectorAll('text')];
		return {
			total: all.length,
			unclassed: all.filter((t) => !t.classList.contains('i18n-en') && !t.classList.contains('i18n-zh')).length,
			en: all.filter((t) => t.classList.contains('i18n-en')).length,
			zh: all.filter((t) => t.classList.contains('i18n-zh')).length,
		};
	});
	expect(shape.unclassed, 'every <text> must come from the bilingual t() helper').toBe(0);
	expect(shape.en, 'one English half per Chinese half').toBe(shape.zh);
	expect(shape.total, 'the chart has labels at all').toBeGreaterThan(20);

	// display:none applies to SVG too, but only if the rules actually match — the
	// point of measuring rather than trusting the class.
	const painted = () =>
		chart.evaluate((svg) =>
			[...svg.querySelectorAll('text')]
				.filter((t) => t.checkVisibility({ contentVisibilityAuto: true, visibilityProperty: true }))
				.map((t) => t.textContent ?? '')
				.join('|'),
		);
	// Pairing alone is not readability. The English legend used to sit at four
	// hard-coded x offsets sized for the Chinese strings, so "★ Saves $87592.36"
	// ran off the right edge of the viewBox and through "Break-even (yr 12.6)"
	// beside it — every <text> correctly paired, half of one unreadable. Both
	// languages are now laid out from their own measured widths, which is what
	// these two checks pin.
	// Client rects, not getBBox(): getBBox() answers in the element's own user
	// space, so the badge's two lines — inside a <g transform="translate(…)"> —
	// came back at y≈15 and read as sitting on top of the title at y=26.
	const badGeometry = () =>
		chart.evaluate((svg) => {
			const frame = svg.getBoundingClientRect();
			const seen = [...svg.querySelectorAll('text')]
				.filter((t) => t.checkVisibility({ contentVisibilityAuto: true, visibilityProperty: true }))
				.map((t) => ({ label: t.textContent ?? '', r: t.getBoundingClientRect() }));
			const outside = seen
				.filter(({ r }) => r.left < frame.left - 1 || r.right > frame.right + 1)
				.map(({ label, r }) => `${JSON.stringify(label)} runs ${Math.round(frame.left - r.left)}px / ${Math.round(r.right - frame.right)}px past the edge`);
			// Two labels count as colliding only when they share real area, not when
			// their boxes graze: the axis pairs sit 14px apart by design.
			const overlaps: string[] = [];
			for (let i = 0; i < seen.length; i++)
				for (let j = i + 1; j < seen.length; j++) {
					const a = seen[i].r;
					const c = seen[j].r;
					if (Math.min(a.right, c.right) - Math.max(a.left, c.left) > 2 && Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top) > 2)
						overlaps.push(`${JSON.stringify(seen[i].label)} over ${JSON.stringify(seen[j].label)}`);
				}
			return { outside, overlaps };
		});

	const en = await painted();
	expect(en, 'the English view shows exactly the English half').not.toMatch(CJK_ANYWHERE);
	expect(en.split('|').length).toBe(shape.en);
	const enGeo = await badGeometry();
	expect(enGeo.outside, 'an English label is clipped by the viewBox').toEqual([]);
	expect(enGeo.overlaps, 'two English labels are painted on top of each other').toEqual([]);

	await page.locator('.t-lang').click();
	await expect(page.locator('html')).toHaveAttribute('data-lang', 'zh');
	const zh = await painted();
	expect(zh, 'the Chinese view shows the Chinese half').toMatch(CJK_ANYWHERE);
	expect(zh.split('|').length).toBe(shape.zh);
	const zhGeo = await badGeometry();
	expect(zhGeo.outside, 'a Chinese label is clipped by the viewBox').toEqual([]);
	expect(zhGeo.overlaps, 'two Chinese labels are painted on top of each other').toEqual([]);

	// ¥ in the Chinese view, $ in the English one — the form is labelled ($) / (¥).
	expect(en, 'English amounts are priced in $').toContain('$');
	expect(zh, 'Chinese amounts are priced in ¥').toContain('¥');
});

for (const probe of PROBES) {
	test(`${probe.route} — ${probe.what} follows the switch`, async ({ browser }) => {
		const ctx = await browser.newContext();
		await ctx.addInitScript(`try { localStorage.setItem('site:lang', 'en'); } catch {}`);
		const page = await ctx.newPage();
		await page.goto(probe.route);
		await probe.prepare?.(page);

		const en = await probe.read(page);
		expect(en, 'the probe read nothing — the selector is stale').not.toBe('');
		expect(en, 'the English view must not already be Chinese').not.toMatch(CJK_ANYWHERE);

		await page.locator('.t-lang').click();
		await expect(page.locator('html')).toHaveAttribute('data-lang', 'zh');
		await expect
			.poll(() => probe.read(page), { message: 'script-written text after the switch' })
			.not.toBe(en);
		expect(await probe.read(page), 'the Chinese view must actually be Chinese').toMatch(
			CJK_ANYWHERE,
		);
		await ctx.close();
	});
}
