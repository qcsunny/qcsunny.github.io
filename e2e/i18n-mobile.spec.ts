import { expect, test } from '@playwright/test';

// Site-wide i18n: ToolShell pages use their own topbar switch (.t-lang), home
// uses Header's .lang-toggle. Both flip html[data-lang]; CSS rules hide the
// opposite language's spans.

const langButton = page => page.locator('.t-lang, .lang-toggle').first();

test('language toggle switches card copy on calculators index', async ({ page }) => {
	await page.goto('/calculators/');

	const firstCard = page.locator('.t-card').first();

	// default: English visible, Chinese hidden
	await expect(firstCard.locator('.i18n-en')).toBeVisible();
	await expect(firstCard.locator('.i18n-zh')).toBeHidden();

	await langButton(page).click();
	await expect(page.locator('html')).toHaveAttribute('data-lang', 'zh');

	await expect(firstCard.locator('.i18n-zh')).toBeVisible();
	await expect(firstCard.locator('.i18n-en')).toBeHidden();

	// toggle back
	await langButton(page).click();
	await expect(page.locator('html')).toHaveAttribute('data-lang', 'en');
	await expect(firstCard.locator('.i18n-en')).toBeVisible();
});

test('form tool export button follows the language switch', async ({ page }) => {
	await page.goto('/finance/compound-interest/');

	await langButton(page).click();
	await expect(page.locator('html')).toHaveAttribute('data-lang', 'zh');

	// the print/export button carries i18n spans — Chinese should now show
	await expect(page.locator('.t-export-btn .i18n-zh')).toBeVisible();
	await expect(page.locator('.t-export-btn .i18n-en')).toBeHidden();
});

// Mobile smoke: no horizontal overflow (regression: global.css main{width:720px}
// + page container max-width overrides used to leave home/blog 393px wide);
// hamburger opens the mobile drawer.
test('mobile viewport: no overflow and hamburger drawer opens', async ({ page }) => {
	await page.setViewportSize({ width: 375, height: 667 });
	await page.goto('/');

	const overflow = await page.evaluate(
		() => document.documentElement.scrollWidth - document.documentElement.clientWidth,
	);
	expect(overflow).toBeLessThanOrEqual(0);

	const burger = page.locator('#mobile-menu-toggle');
	await expect(burger).toBeVisible();
	await burger.click();
	await expect(page.locator('#mobile-nav-panel')).toBeVisible();
});

test('mobile viewport: blog index has no horizontal overflow', async ({ page }) => {
	await page.setViewportSize({ width: 375, height: 667 });
	await page.goto('/blog/');

	const overflow = await page.evaluate(
		() => document.documentElement.scrollWidth - document.documentElement.clientWidth,
	);
	expect(overflow).toBeLessThanOrEqual(0);
});
