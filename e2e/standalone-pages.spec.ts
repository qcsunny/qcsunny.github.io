import { expect, test, type Browser, type Page } from '@playwright/test';

// /clock and /calendar are the two pages outside the toolbox: no Header.astro, no
// ToolShell, and every word they show is written from JavaScript rather than sat
// in the markup as an .i18n-en/.i18n-zh pair. Until 2026-09 that meant they were
// English-only — BaseHead already set html[data-lang] on them and global.css
// shipped, but nothing read either — so a reader who picked 中文 anywhere else on
// the site landed here on an English page with no switch in sight.
//
// Two things need guarding, and the first is why this file exists at all: the
// clock's controller moved out of an is:inline <script> into src/scripts/clock.ts
// so it could import the language helper. That is exactly the edit that killed
// /calculators/standard/ for a week — a page whose script silently stops running
// looks completely normal. So each widget is exercised, not just inspected.

const CJK = /[㐀-鿿＀-￯]/;
const LATIN_WORD = /[A-Za-z]{3,}/;

// Everything a reader can actually read: visible text nodes, plus the labels and
// tooltips that live in attributes and so cannot hold a span pair.
async function visibleStrings(page: Page): Promise<{ where: string; text: string; skip: boolean }[]> {
	return page.evaluate(() => {
		const out: { where: string; text: string; skip: boolean }[] = [];
		const name = (el: Element): string => {
			const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).filter(Boolean) : [];
			return el.tagName.toLowerCase() + (el.id ? `#${el.id}` : '') + cls.map((c) => `.${c}`).join('');
		};
		// The switch itself names the other language — that is the whole button —
		// and "ISO 8601" is the name of a standard, not an untranslated label.
		const exempt = (el: Element): boolean => !!el.closest('.lang-toggle, [data-week-rule]');
		const visible = (el: Element): boolean =>
			el.checkVisibility({ contentVisibilityAuto: true, visibilityProperty: true });
		const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
		for (let n = walk.nextNode(); n; n = walk.nextNode()) {
			const text = (n.nodeValue ?? '').replace(/\s+/g, ' ').trim();
			const el = n.parentElement;
			if (!text || !el || el.closest('script,style,template,noscript')) continue;
			if (!visible(el)) continue;
			out.push({
				where: name(el) + (el.closest('.i18n-en') ? ' [.i18n-en]' : el.closest('.i18n-zh') ? ' [.i18n-zh]' : ''),
				text,
				skip: exempt(el),
			});
		}
		for (const el of document.querySelectorAll('[aria-label],[title]')) {
			if (!visible(el)) continue;
			for (const attr of ['aria-label', 'title']) {
				const v = el.getAttribute(attr);
				if (v) out.push({ where: `${name(el)}[${attr}]`, text: v, skip: exempt(el) });
			}
		}
		return out;
	});
}

async function pageIn(browser: Browser, lang: 'en' | 'zh', route: string): Promise<Page> {
	const ctx = await browser.newContext();
	await ctx.addInitScript(`try { localStorage.setItem('site:lang', '${lang}'); } catch {}`);
	const page = await ctx.newPage();
	await page.goto(route);
	await expect(page.locator('html')).toHaveAttribute('data-lang', lang);
	return page;
}

for (const route of ['/clock/', '/calendar/']) {
	test(`${route} — the English view is English`, async ({ browser }) => {
		const page = await pageIn(browser, 'en', route);
		const bad = (await visibleStrings(page)).filter(
			(s) => !s.skip && (CJK.test(s.text) || s.where.includes('[.i18n-zh]')),
		);
		expect(bad, 'Chinese showing in the English view').toEqual([]);
		await page.context().close();
	});

	test(`${route} — the Chinese view is Chinese`, async ({ browser }) => {
		const page = await pageIn(browser, 'zh', route);
		const bad = (await visibleStrings(page)).filter(
			(s) => !s.skip && (LATIN_WORD.test(s.text) || s.where.includes('[.i18n-en]')),
		);
		expect(bad, 'English showing in the Chinese view').toEqual([]);
		await page.context().close();
	});
}

test('/clock/ — weekday and date are written in the reader’s language and follow the switch', async ({
	browser,
}) => {
	const page = await pageIn(browser, 'en', '/clock/');
	// Intl, not a hand-kept table: "Sunday" / "September 6, 2026".
	await expect(page.locator('#clock-weekday')).toHaveText(/^[A-Za-z]+$/);
	await expect(page.locator('#clock-date')).toHaveText(/^[A-Za-z]+ \d{1,2}, \d{4}$/);
	await expect(page.locator('#clock-time')).toHaveText(/^\d{2}:\d{2}:\d{2}$/);

	await page.click('.lang-toggle');
	await expect(page.locator('html')).toHaveAttribute('data-lang', 'zh');
	// 星期日 / 2026年9月6日
	await expect(page.locator('#clock-weekday')).toHaveText(/^星期[一二三四五六日]$/);
	await expect(page.locator('#clock-date')).toHaveText(/^\d{4}年\d{1,2}月\d{1,2}日$/);
	// and the choice is the site's, not the page's
	expect(await page.evaluate(() => localStorage.getItem('site:lang'))).toBe('zh');
	await page.context().close();
});

test('/clock/ — the seconds toggle, the Pomodoro timer and the theme cycle all still run', async ({
	browser,
}) => {
	const page = await pageIn(browser, 'en', '/clock/');
	const time = page.locator('#clock-time');

	// seconds
	await expect(time).toHaveText(/^\d{2}:\d{2}:\d{2}$/);
	await page.click('.seconds-toggle');
	await expect(time).toHaveText(/^\d{2}:\d{2}$/);
	await expect(page.locator('.seconds-toggle')).toHaveAttribute('aria-pressed', 'false');
	await page.click('.seconds-toggle');
	await expect(time).toHaveText(/^\d{2}:\d{2}:\d{2}$/);

	// pomodoro: 🍅 → a 25-minute countdown, ✕ → back to the tomato
	const pomo = page.locator('.pomodoro-toggle');
	await expect(pomo).toHaveText('🍅');
	await expect(page.locator('#clock-pomodoro')).toBeHidden();
	await pomo.click();
	await expect(pomo).toHaveText(/^2[45]:\d{2}$/);
	await expect(page.locator('#clock-pomodoro')).toHaveText(/^Focus 2[45]:\d{2}$/);
	await pomo.click(); // pause
	await expect(page.locator('#clock-pomodoro')).toHaveText(/· paused$/);
	await page.click('.lang-toggle');
	await expect(page.locator('#clock-pomodoro')).toHaveText(/^专注 2[45]:\d{2} · 已暂停$/);
	await page.click('.pomodoro-reset');
	await expect(pomo).toHaveText('🍅');
	await expect(page.locator('#clock-pomodoro')).toBeHidden();

	// theme: auto → light → dark → auto, persisted under the page's own key
	const theme = page.locator('.theme-toggle');
	await expect(theme).toHaveText('◐');
	await page.click('.theme-toggle');
	await expect(theme).toHaveText('☀');
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
	expect(await page.evaluate(() => localStorage.getItem('clock:theme'))).toBe('light');
	await page.click('.theme-toggle');
	await expect(theme).toHaveText('☾');
	await page.click('.theme-toggle');
	await expect(theme).toHaveText('◐');
	await page.context().close();
});

test('/calendar/ — the month label, weekday heads and week line follow the switch', async ({
	browser,
}) => {
	const page = await pageIn(browser, 'en', '/calendar/');
	const now = new Date();
	const label = page.locator('#cal-label');
	// calendar.ts assembles this itself ("September 2026"), so compare against
	// what Intl says the month is called rather than against a copy of its table.
	await expect(label).toHaveText(now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }));
	const dow = page.locator('#cal-month .dow');
	expect((await dow.allTextContents()).slice(1)).toEqual(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
	await expect(page.locator('#cal-info')).toHaveText(/^[A-Z][a-z]{2}, [A-Za-z]+ \d{1,2}, \d{4} · Week \d{1,2}/);

	await page.click('.lang-toggle');
	await expect(page.locator('html')).toHaveAttribute('data-lang', 'zh');
	// 2026年9月, 日一二三四五六, 2026年9月6日 周日 · 第 36 周
	await expect(label).toHaveText(`${now.getFullYear()}年${now.getMonth() + 1}月`);
	expect((await dow.allTextContents()).slice(1)).toEqual(['日', '一', '二', '三', '四', '五', '六']);
	await expect(page.locator('#cal-info')).toHaveText(/^\d{4}年\d{1,2}月\d{1,2}日 周[一二三四五六日] · 第 \d{1,2} 周$/);
	// the week-number column's tooltip is an attribute, so only a rewrite reaches it
	await expect(page.locator('#cal-month .wnum').first()).toHaveAttribute('title', /^\d{4}年第 \d{1,2} 周$/);
	await page.context().close();
});

test('/calendar/ — month/year views, the arrows and both settings still work', async ({ browser }) => {
	const page = await pageIn(browser, 'en', '/calendar/');
	const label = page.locator('#cal-label');
	const first = await label.textContent();

	// six rows of seven days, one week number each, and a header row
	await expect(page.locator('#cal-month .day')).toHaveCount(42);
	await expect(page.locator('#cal-month .wnum')).toHaveCount(6);

	await page.click('#cal-next');
	expect(await label.textContent()).not.toBe(first);
	await page.click('#cal-prev');
	expect(await label.textContent()).toBe(first);

	// year view: twelve mini months, and the arrows now step by year
	await page.click('#cal-view-year');
	await expect(page.locator('#cal-year .mini')).toHaveCount(12);
	await expect(label).toHaveText(String(new Date().getFullYear()));
	await expect(page.locator('#cal-prev')).toHaveAttribute('aria-label', 'Previous year');
	await page.click('#cal-view-month');
	await expect(page.locator('#cal-prev')).toHaveAttribute('aria-label', 'Previous month');

	// week start: the first column head moves from Sunday to Monday
	await page.click('[data-week-start="1"]');
	expect((await page.locator('#cal-month .dow').allTextContents()).slice(1, 3)).toEqual(['Mon', 'Tue']);

	// week numbering rule: the two rules disagree about the turn of the year
	await page.fill('#cal-date-input', '2026-01-01');
	await page.click('#cal-go');
	await expect(label).toHaveText('January 2026');
	const full = await page.locator('#cal-info').textContent();
	await page.click('[data-week-rule="iso"]');
	expect(await page.locator('#cal-info').textContent()).not.toBe(full);
	await page.context().close();
});
