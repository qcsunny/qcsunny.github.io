// Blog list layout: the magazine top (hero + 2 minis + recent grid) and the
// per-year archive rows, plus the category filter's behaviour against the
// mixed-content containers (a year group hides only when its last visible
// card is filtered out).

import { test, expect } from '@playwright/test';

test('blog index: magazine top + per-year archive rows', async ({ page }) => {
	await page.goto('/blog/');
	// 1 hero + 2 minis + recent cards + archive rows
	await expect(page.locator('.featured-card')).toHaveCount(1);
	await expect(page.locator('.featured-mini')).toHaveCount(2);
	const recentCards = await page.locator('.article-card').count();
	const rows = await page.locator('.archive-row').count();
	const years = await page.locator('.archive-year').count();
	// 47 posts: 1 + 2 + recent + rows = total; years ≥ 1
	expect(recentCards).toBeGreaterThan(0);
	expect(rows).toBeGreaterThan(10);
	// All posts currently live in one year, so one group is correct today; the
	// grouping is forward-looking and splits automatically as years pass.
	expect(years).toBeGreaterThanOrEqual(1);
	// every card carries its category for the filter
	const noCat = await page.locator('[data-blog-card]:not([data-cat])').count();
	expect(noCat).toBe(0);
	// filter chips carry build-time counts
	const allChip = page.locator('[data-blog-category="all"] .count-badge');
	await expect(allChip).not.toBeEmpty();
});

test('filtering by a category hides empty year groups entirely', async ({ page }) => {
	await page.goto('/blog/');
	// pick a category chip, then every visible card matches and every visible
	// container holds a visible card
	const chip = page.locator('.blog-category-filter button[data-blog-category]:not([data-blog-category="all"])').first();
	const cat = await chip.getAttribute('data-blog-category');
	await chip.click();
	const visible = page.locator('[data-blog-card]').filter({ visible: true });
	expect(await visible.count()).toBeGreaterThan(0);
	for (const card of await visible.all()) await expect(card).toHaveAttribute('data-cat', cat as string);
	for (const c of await page.locator('[data-blog-card-container]').all()) {
		if (await c.isVisible()) {
			expect(await c.locator('[data-blog-card]:visible').count()).toBeGreaterThan(0);
		}
	}
	// back to all: nothing stays hidden
	await page.locator('[data-blog-category="all"]').click();
	const total = await page.locator('[data-blog-card]').count();
	expect(await page.locator('[data-blog-card]').filter({ visible: true }).count()).toBe(total);
});
