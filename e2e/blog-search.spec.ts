import { test, expect } from '@playwright/test';

// The blog list ships an is:inline filter (query + category pills) that is
// pure client-side. A dead selector would leave the page looking fine while
// nothing filters — the same silent failure that hid the standard
// calculator's dead keys for a week. This pins the live behaviour: query
// narrowing, the empty state, the clear button, category pills, and that
// the script-written strings (placeholder, count, empty message, pill label)
// all follow the language switch.

test('blog search filters by query and category and follows the language switch', async ({ browser }) => {
	const ctx = await browser.newContext();
	await ctx.addInitScript(`try { localStorage.setItem('site:lang', 'en'); } catch {}`);
	const page = await ctx.newPage();
	await page.goto('http://127.0.0.1:4321/blog/');
	await expect(page.locator('html')).toHaveAttribute('data-lang', 'en');

	const input = page.locator('#blog-search-input');
	await expect(input).toBeVisible();
	await expect(input).toHaveAttribute('placeholder', 'Search articles (title, topic)...');

	const cards = page.locator('.featured-card, .article-card');
	const total = await cards.count();
	expect(total).toBeGreaterThan(1);

	// A query narrows the list to the uuid article (title/slug both carry it).
	await input.fill('uuid');
	await expect(page.locator('[data-search*="uuid" i]').first()).toBeVisible();
	const uuidVisible = await cards.filter({ visible: true }).count();
	expect(uuidVisible).toBeLessThan(total);
	expect((await page.locator('#blog-search-count').textContent()) ?? '').toMatch(/\d/);

	// A non-match surfaces the empty state in English and hides every card.
	await input.fill('zzzznomatch');
	await expect(page.locator('#blog-search-empty')).toBeVisible();
	await expect(page.locator('#blog-search-empty')).toContainText('No articles matching');
	expect(await cards.filter({ visible: true }).count()).toBe(0);

	// The clear button restores the full list.
	await page.click('#blog-search-clear');
	await expect(input).toHaveValue('');
	expect(await cards.filter({ visible: true }).count()).toBe(total);

	// A category pill shows only that category's articles.
	await page.click('.blog-filter-pill[data-cat="finance"]');
	const finance = await page.locator('.article-card[data-cat="finance"]').filter({ visible: true }).count();
	const nonFinance = await page.locator('.article-card:not([data-cat="finance"])').filter({ visible: true }).count();
	expect(finance).toBeGreaterThan(0);
	expect(nonFinance).toBe(0);
	await page.click('.blog-filter-pill[data-cat="all"]');
	expect(await page.locator('.article-card').filter({ visible: true }).count()).toBeGreaterThan(0);

	// The language switch flips the script-written strings too — the one
	// guarantee CSS span-pairs cannot give.
	await page.locator('.lang-toggle').first().click();
	await expect(page.locator('html')).toHaveAttribute('data-lang', 'zh');
	await expect(input).toHaveAttribute('placeholder', '搜索文章（标题、主题）...');
	await expect(page.locator('.blog-filter-pill.blog-filter-active .i18n-zh')).toBeVisible();
	await input.fill('qqqnomatch');
	await expect(page.locator('#blog-search-empty')).toContainText('未找到');

	await ctx.close();
});
