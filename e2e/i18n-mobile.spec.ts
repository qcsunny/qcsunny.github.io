import { expect, test, type Locator, type Page } from '@playwright/test';

// Site-wide i18n: ToolShell pages use their own topbar switch (.t-lang), home
// uses Header's .lang-toggle. Both flip html[data-lang]; CSS rules hide the
// opposite language's spans.

const langButton = (page: Page): Locator => page.locator('.t-lang, .lang-toggle').first();

// A card carries two span pairs — the tool name and its description — so a bare
// toBeVisible() on .i18n-en is a strict-mode violation. It used to hold one,
// back when the name was a single "Name · 名称" string; splitting that (the user
// asked for one language at a time) is what added the second pair.
const painted = (l: Locator): Promise<string[]> =>
	l.evaluateAll((els) =>
		els.filter((e) => e.checkVisibility()).map((e) => (e.textContent ?? '').trim()),
	);

async function onlyOneLanguage(card: Locator, lang: 'en' | 'zh'): Promise<void> {
	const en = card.locator('.i18n-en');
	const zh = card.locator('.i18n-zh');
	const [enShown, zhShown, enTotal, zhTotal] = await Promise.all([
		painted(en),
		painted(zh),
		en.count(),
		zh.count(),
	]);
	expect(enTotal, 'a card has a span pair for its name and one for its blurb').toBe(2);
	expect(zhTotal).toBe(2);
	expect(lang === 'en' ? enShown : zhShown, `${lang} halves must all show`).toHaveLength(2);
	expect(lang === 'en' ? zhShown : enShown, 'the other language must be hidden').toEqual([]);
}

test('language toggle switches card copy on calculators index', async ({ page }) => {
	await page.goto('/calculators/');

	const firstCard = page.locator('.t-card').first();

	await onlyOneLanguage(firstCard, 'en');

	await langButton(page).click();
	await expect(page.locator('html')).toHaveAttribute('data-lang', 'zh');
	await onlyOneLanguage(firstCard, 'zh');

	// toggle back
	await langButton(page).click();
	await expect(page.locator('html')).toHaveAttribute('data-lang', 'en');
	await onlyOneLanguage(firstCard, 'en');
});

test('form tool export buttons follow the language switch', async ({ page }) => {
	await page.goto('/finance/compound-interest/');

	await langButton(page).click();
	await expect(page.locator('html')).toHaveAttribute('data-lang', 'zh');

	// both export buttons (print/PDF and PNG) carry i18n spans, so assert on
	// every one of them rather than a single match
	const buttons = page.locator('.t-export-btn');
	await expect(buttons).not.toHaveCount(0);
	for (const btn of await buttons.all()) {
		await expect(btn.locator('.i18n-zh')).toBeVisible();
		await expect(btn.locator('.i18n-en')).toBeHidden();
	}
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

// The About page and post pages carry the widest fixed-width content (support
// chips, tool chips, code blocks), so they get the same 375px guard. /privacy/
// and a workbench tool page are here because their containers are the ones the
// --w-* refactor changed.
for (const route of [
	'/about/',
	'/privacy/',
	'/tools/sql-formatter/',
	'/blog/uuid-v4-vs-v7-database-guide/',
]) {
	test(`mobile viewport: ${route} has no horizontal overflow`, async ({ page }) => {
		await page.setViewportSize({ width: 375, height: 667 });
		await page.goto(route);

		const overflow = await page.evaluate(
			() => document.documentElement.scrollWidth - document.documentElement.clientWidth,
		);
		expect(overflow).toBeLessThanOrEqual(0);
	});
}
