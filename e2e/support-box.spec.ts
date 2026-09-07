import { expect, test } from '@playwright/test';

// The support block ships on the About page and at the end of every post. Its
// sponsor chip is gated on consts.SPONSOR_URL, so it must stay absent while
// that is empty rather than linking somewhere that 404s.


test('support block is appended to blog posts', async ({ page }) => {
	await page.goto('/blog/uuid-v4-vs-v7-database-guide/');

	const box = page.locator('.support-box');
	await expect(box).toBeVisible();
	await expect(box.locator('.support-chip')).toHaveCount(3);
});
