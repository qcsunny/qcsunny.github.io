import { expect, test } from '@playwright/test';

// The support block ships on the About page and at the end of every post. Its
// sponsor chip is gated on consts.SPONSOR_URL, so it must stay absent while
// that is empty rather than linking somewhere that 404s.

test('support block appears on About and follows the language switch', async ({ page }) => {
	await page.goto('/about/');

	const box = page.locator('.support-box');
	await expect(box).toBeVisible();
	await expect(box.locator('h3 .i18n-en')).toBeVisible();
	await expect(box.locator('h3 .i18n-zh')).toBeHidden();

	// Only links that always resolve: repo, issues, email.
	await expect(box.locator('a[href$="qcsunny.github.io"]')).toHaveCount(1);
	await expect(box.locator('a[href$="/issues"]')).toHaveCount(1);
	await expect(box.locator('a[href^="mailto:"]')).toHaveCount(1);
	await expect(box.locator('.support-chip.primary')).toHaveCount(0);

	await page.locator('.lang-toggle').first().click();
	await expect(page.locator('html')).toHaveAttribute('data-lang', 'zh');
	await expect(box.locator('h3 .i18n-zh')).toBeVisible();
	await expect(box.locator('h3 .i18n-en')).toBeHidden();
});

test('support block is appended to blog posts', async ({ page }) => {
	await page.goto('/blog/uuid-v4-vs-v7-database-guide/');

	const box = page.locator('.support-box');
	await expect(box).toBeVisible();
	await expect(box.locator('.support-chip')).toHaveCount(3);
});
