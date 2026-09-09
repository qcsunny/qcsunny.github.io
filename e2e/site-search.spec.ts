import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

// The Header's search button opens the same overlay everywhere, but what it
// searches depends on the page: the blog list and every article page hand in
// the blog collection, everything else keeps the tool registry. Two dead ends
// this pins: a config that leaks onto a non-blog page (49 tools where a reader
// meant 17 articles), and the reverse (the blog button still opening the tool
// index). Both look fine while typing.
//
// The overlay is the only article search left on the blog — the old inline
// filter bar was removed because the page would otherwise offer the same search
// twice.

const DIST = fileURLToPath(new URL('../dist', import.meta.url));
const POST_DIRS = readdirSync(join(DIST, 'blog'), { withFileTypes: true })
	.filter((d) => d.isDirectory())
	.map((d) => d.name);

const openModal = async (page: Page) => {
	await page.locator('#header-search-btn').click();
	await expect(page.locator('#site-search-modal')).toBeVisible();
	await expect(page.locator('#sm-input')).toBeFocused();
};

test('the blog list searches articles, and the button says so', async ({ browser }) => {
	const ctx = await browser.newContext();
	await ctx.addInitScript(`try { localStorage.setItem('site:lang', 'en'); } catch {}`);
	const page = await ctx.newPage();
	await page.goto('/blog/');
	await expect(page.locator('html')).toHaveAttribute('data-lang', 'en');

	const btn = page.locator('#header-search-btn');
	await expect(btn).toHaveAttribute('aria-label', 'Search articles (shortcut /)');
	await expect(btn).toHaveAttribute('title', 'Search articles (/ or Ctrl+K)');

	await openModal(page);

	// The index is the collection, not the 49-tool registry: the placeholder
	// counts articles and every result resolves to a /blog/ route.
	await expect(page.locator('#sm-input')).toHaveAttribute('placeholder', `Search ${POST_DIRS.length} articles (title, topic, category)...`);
	await expect(page.locator('#site-search-modal .sm-filter-pill').first()).toContainText(`(${POST_DIRS.length})`);
	await expect(page.locator('#sm-results-list .sm-item').first()).toHaveAttribute('href', /^\/blog\/[^/]+\/$/);

	// 17 articles, but 10 shown until a query narrows them.
	await expect(page.locator('#sm-results-list .sm-item')).toHaveCount(10);

	// A slug hits even though the title is Chinese. Two rows come back, not one:
	// the UUID post, plus the password-entropy post whose blurb mentions UUID.
	// searchItems ranks by field weight (slug > name > category > description),
	// so the guide is pinned first and the sidebar remark stays second — this
	// assertion is the contract that ordering keeps working.
	await page.locator('#sm-input').fill('uuid');
	await expect(page.locator('#sm-results-list .sm-item')).toHaveCount(2);
	await expect(
		page.locator('#sm-results-list .sm-item').first(),
	).toHaveAttribute('href', '/blog/uuid-v4-vs-v7-database-guide/');
	await expect(
		page.locator('#sm-results-list .sm-item').nth(1),
	).toHaveAttribute('href', '/blog/password-entropy-and-secure-random/');

	// Authored terms are searchable even when absent from title, slug and description.
	await page.locator('#sm-input').fill('B-tree');
	await expect(page.locator('#sm-results-list .sm-item').first()).toHaveAttribute(
		'href',
		'/blog/uuid-v4-vs-v7-database-guide/',
	);

	// A Chinese query hits from English mode too — the haystack is bilingual.
	await page.locator('#sm-input').fill('复利');
	await expect(page.locator('#sm-results-list .sm-item').first()).toBeVisible();

	// The category pill filters the pool, and every badge carries that label.
	await page.locator('#sm-input').fill('');
	await expect(page.locator('#sm-results-list .sm-item')).toHaveCount(10);
	await page.locator('#site-search-modal .sm-filter-pill[data-cat="finance"]').click();
	const financeBadges = page.locator('#sm-results-list .sm-item-badge');
	expect(await financeBadges.count()).toBeGreaterThan(0);
	for (const badge of await financeBadges.all()) {
		expect((await badge.textContent())?.trim()).toBe('Finance & Math');
	}

	// A non-match shows the empty state; a category with no hit at all does too.
	await page.locator('#sm-input').fill('zzzznomatch');
	await expect(page.locator('#sm-empty')).toBeVisible();
	await expect(page.locator('#sm-empty')).toContainText('No results matching');
	await expect(page.locator('#sm-results-list .sm-item')).toHaveCount(0);

	// The language switch re-renders the rows and the placeholder.
	await page.locator('#sm-input').fill('compound');
	await expect(page.locator('#sm-input')).toHaveAttribute('placeholder', /articles/);
	// The overlay sits above the header, so Playwright's hit-test declines the
	// click even though the toggle is still wired up. Calling it from the page
	// skips only that gate — the real Header listener runs, dispatches
	// site:lang-change, and the modal's onLang re-render reacts to it, so the
	// live switch is still exercised end to end. ({ force: true } would not work
	// here: it still sends the mouse to those coordinates, which the overlay owns.)
	await page.evaluate(() => document.querySelector<HTMLButtonElement>('.lang-toggle')?.click());
	await expect(page.locator('html')).toHaveAttribute('data-lang', 'zh');
	await expect(btn).toHaveAttribute('aria-label', '搜索文章 (快捷键 /)');
	await expect(page.locator('#sm-input')).toHaveAttribute('placeholder', /搜索文章/);
	expect((await page.locator('#sm-results-list .sm-item-badge').first().textContent())?.trim()).toBe('金融与数学');
	await page.locator('#sm-input').fill('qqqnomatch');
	await expect(page.locator('#sm-empty')).toContainText('未找到');

	// Enter opens the highlighted row. The finance pill is still selected from
	// the badge check above and the QR post is filed under web, so reset to All
	// first — otherwise this query is empty and the row never renders.
	await page.locator('#site-search-modal .sm-filter-pill[data-cat="all"]').click();
	await page.locator('#sm-input').fill('二维码');
	const firstHref = (await page.locator('#sm-results-list .sm-item').first().getAttribute('href')) ?? '';
	expect(firstHref).toMatch(/^\/blog\/[^/]+\/$/);
	await page.keyboard.press('Enter');
	await expect(page).toHaveURL(new RegExp(firstHref.replace(/\//g, '\\/') + '$'));

	await ctx.close();
});

test('blog category filter has a shareable URL and restores all cards', async ({ page }) => {
	await page.goto('/blog/?category=finance');
	const cards = page.locator('[data-blog-card]');
	const visible = cards.filter({ visible: true });
	expect(await visible.count()).toBeGreaterThan(0);
	for (const card of await visible.all()) await expect(card).toHaveAttribute('data-cat', 'finance');
	await expect(page.locator('[data-blog-category="finance"]')).toHaveAttribute('aria-pressed', 'true');

	await page.locator('[data-blog-category="all"]').click();
	await expect(page).toHaveURL(/\/blog\/$/);
	await expect(cards.filter({ visible: true })).toHaveCount(await cards.count());
});

test('an article page searches articles as well, and Esc closes it', async ({ browser }) => {
	const ctx = await browser.newContext();
	await ctx.addInitScript(`try { localStorage.setItem('site:lang', 'en'); } catch {}`);
	const page = await ctx.newPage();
	await page.goto(`/blog/${POST_DIRS[0]}/`);

	await expect(page.locator('#header-search-btn')).toHaveAttribute('aria-label', 'Search articles (shortcut /)');
	await openModal(page);
	await expect(page.locator('#sm-results-list .sm-item').first()).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(page.locator('#site-search-modal')).toBeHidden();

	// The "/" shortcut opens it without a click.
	await page.keyboard.press('/');
	await expect(page.locator('#site-search-modal')).toBeVisible();

	await ctx.close();
});

test('non-blog pages keep searching the tool registry', async ({ browser }) => {
	const ctx = await browser.newContext();
	await ctx.addInitScript(`try { localStorage.setItem('site:lang', 'en'); } catch {}`);
	const page = await ctx.newPage();
	for (const url of ['/', '/about/']) {
		await page.goto(url);
		const btn = page.locator('#header-search-btn');
		await expect(btn).toHaveAttribute('aria-label', 'Search tools (shortcut /)');
		await openModal(page);
		await expect(page.locator('#sm-input')).toHaveAttribute('placeholder', /^Search \d+ tools/);
		await expect(page.locator('#sm-results-list .sm-item').first()).not.toHaveAttribute('href', /^\/blog\//);

		// The Dev Tools pill filters the migrated /devtools/ tools. The registry
		// key is 'devtools'; a stale 'tools' key here matched nothing and left
		// every badge as the raw key, so assert both filter and badge text.
		await page.locator('#site-search-modal .sm-filter-pill[data-cat="devtools"]').click();
		await expect(page.locator('#sm-results-list .sm-item').first()).toBeVisible();
		const devBadges = page.locator('#sm-results-list .sm-item-badge');
		expect(await devBadges.count()).toBeGreaterThan(0);
		for (const badge of await devBadges.all()) {
			expect((await badge.textContent())?.trim()).toBe('Dev Tools');
		}
		await page.locator('#site-search-modal .sm-filter-pill[data-cat="utilities"]').click();
		await expect(page.locator('#sm-results-list .sm-item').first()).toBeVisible();
		const utilBadges = page.locator('#sm-results-list .sm-item-badge');
		expect(await utilBadges.count()).toBeGreaterThan(0);
		for (const badge of await utilBadges.all()) {
			expect((await badge.textContent())?.trim()).toBe('Utilities');
		}
		await page.locator('#site-search-modal .sm-filter-pill[data-cat="all"]').click();
		await page.keyboard.press('Escape');
		await expect(page.locator('#site-search-modal')).toBeHidden();
	}

	// ToolShell pages carry no Header at all, so there is no modal trigger to
	// assert on: /tools/ searches with the inline ToolSearchBar in its
	// t-hub-header, and "/" focuses that input rather than opening the overlay.
	// The overlay is still rendered there with the default tool config, so the
	// leak check below must hold on this page too.
	await page.goto('/tools/');
	await expect(page.locator('#header-search-btn')).toHaveCount(0);
	await expect(page.locator('.t-search-nav')).toHaveCount(1);
	await page.keyboard.press('/');
	await expect(page.locator('#tool-search-input')).toBeFocused();
	await expect(page.locator('#site-search-modal')).toBeHidden();

	// The article index must not leak onto a tool page. The variable keeps its
	// name in both modes, so this inspects the payload, not the identifier.
	expect(await page.content()).not.toContain('"href":"/blog/');

	await ctx.close();
});

// The category hubs use the inline ToolSearchBar rather than the Header overlay,
// and it filters one category's cards. When a query matches nothing on the page
// the bar instead offers cross-category suggestions — a block built from a string
// template, so it cannot carry .i18n-* spans and is rebuilt on every language
// switch.
//
// Its labels come from a map keyed by registry category, with a fallback that
// prints the raw slug as the badge text and a ⚡ icon. The 5-group refactor
// renamed dev tools out of 'tools' and added 'utilities' without updating the
// map, so both categories hit that fallback and rendered as bare slugs. It was
// invisible while typing and unguarded: nothing ever read a .t-cross-cat-badge.
// ToolSearchModal.astro keeps the sibling map and the overlay path is covered
// above; this pins the inline one.
test('the inline category bar labels cross-category matches, never raw slugs', async ({ browser }) => {
	const ctx = await browser.newContext();
	await ctx.addInitScript(`try { localStorage.setItem('site:lang', 'en'); } catch {}`);
	const page = await ctx.newPage();

	// A badge carrying a registry category key is the fallback printing the slug.
	// Compared case-sensitively on purpose: the fallback emits the raw key
	// (already lowercase) while the labels are title case, and folding case would
	// make the real 'Finance' / 'Utilities' labels look like their own keys.
	const CAT_KEYS = new Set(['finance', 'calculators', 'converters', 'devtools', 'utilities']);

	const checkAllBadges = async () => {
		const badges = page.locator('.t-cross-cat-badge');
		expect(await badges.count()).toBeGreaterThan(0);
		for (const badge of await badges.all()) {
			const text = (await badge.textContent())?.trim() ?? '';
			expect(CAT_KEYS.has(text)).toBe(false);
		}
	};

	// 'json' matches no finance card, so the cross-category block takes over and
	// surfaces /devtools/json-formatter/ — the case that used to read 'devtools'.
	await page.goto('/finance/');
	await expect(page.locator('html')).toHaveAttribute('data-lang', 'en');
	await page.locator('#tool-search-input').fill('json');
	await expect(page.locator('.t-cross-cat-item[href*="/json-formatter/"]')).toBeVisible();
	await expect(page.locator('.t-cross-cat-item[href*="/json-formatter/"] .t-cross-cat-badge')).toHaveText('Dev Tool');
	await checkAllBadges();

	// 'utilities' had no map entry at all, so it fell through the same way.
	// 'qr' matches no devtools card, so this page also shows only cross-category rows.
	await page.goto('/devtools/');
	await page.locator('#tool-search-input').fill('qr');
	await expect(page.locator('.t-cross-cat-item[href*="/qr-code-generator/"]')).toBeVisible();
	await expect(page.locator('.t-cross-cat-item[href*="/qr-code-generator/"] .t-cross-cat-badge')).toHaveText('Utilities');
	await checkAllBadges();

	// ToolShell pages render no Header, so the toggle is .t-lang. Because the list
	// is a rebuilt string, the switch has to re-render it rather than the CSS
	// hiding half of a span pair.
	await page.evaluate(() => document.querySelector<HTMLButtonElement>('.t-lang')?.click());
	await expect(page.locator('html')).toHaveAttribute('data-lang', 'zh');
	await expect(page.locator('.t-cross-cat-item[href*="/qr-code-generator/"] .t-cross-cat-badge')).toHaveText('实用工具');

	await ctx.close();
});
