import { expect, test } from '@playwright/test';

// Every fenced block on a post gets a copy button. BlogPost.astro's inline
// script builds both the button and the .code-block wrapper it sits in, so
// neither appears in the emitted HTML — the dist/ guards cannot see them, only
// a running page can.

const POST = '/blog/markdown-parser-and-katex-math/';

test.beforeEach(async ({ context }) => {
	await context.grantPermissions(['clipboard-read', 'clipboard-write']);
});

test('every fenced block gets a copy button as a sibling of the pre', async ({ page }) => {
	await page.goto(POST);

	const geo = await page.evaluate(() => {
		const pres = [...document.querySelectorAll('.prose pre')];
		return {
			pres: pres.length,
			wrapped: pres.filter((p) => p.parentElement?.classList.contains('code-block')).length,
			buttons: document.querySelectorAll('.prose .code-copy').length,
			// the button must be a sibling of the pre, never inside it: inside
			// overflow-x:auto's <pre> it would scroll away with the code, and its
			// label would end up in the copied text
			buttonsInsidePre: [...document.querySelectorAll('.code-copy')].filter((b) => b.closest('pre')).length,
		};
	});
	expect(geo.pres, 'the post has fenced blocks').toBeGreaterThan(0);
	expect(geo.wrapped, 'every pre wrapped').toBe(geo.pres);
	expect(geo.buttons, 'one button per block').toBe(geo.pres);
	expect(geo.buttonsInsidePre, 'no button inside a pre').toBe(0);
});

test('clicking copies the block verbatim, confirms, then reverts', async ({ page }) => {
	await page.goto(POST);

	const preText = await page.locator('.prose pre').first().evaluate((p) => (p as HTMLElement).innerText);
	const btn = page.locator('.code-copy').first();

	await btn.click();
	await expect(btn).toHaveClass(/is-copied/);
	// the confirmation replaces the label rather than appending to it
	await expect(btn.locator('.code-copy-label')).toBeHidden();
	await expect(btn.locator('.code-copy-done')).toBeVisible();

	const clipboard = await page.evaluate(() => navigator.clipboard.readText());
	expect(clipboard).toBe(preText);

	// and the label comes back after the confirmation window
	await expect(btn).not.toHaveClass(/is-copied/);
	await expect(btn.locator('.code-copy-label')).toBeVisible();
	await expect(btn.locator('.code-copy-done')).toBeHidden();
});

test('the button stays put while the code block scrolls horizontally', async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.goto(POST);

	const moved = await page.evaluate(() => {
		const pre = [...document.querySelectorAll('.prose pre')].find((p) => p.scrollWidth > p.clientWidth);
		if (!pre) return null;
		const btn = pre.parentElement!.querySelector('.code-copy')!;
		const before = btn.getBoundingClientRect();
		pre.scrollLeft = pre.scrollWidth;
		const after = btn.getBoundingClientRect();
		return { dx: Math.abs(after.x - before.x), dy: Math.abs(after.y - before.y) };
	});
	expect(moved, 'a wide block wide enough to scroll').not.toBeNull();
	expect(moved!.dx, 'button does not scroll with the code').toBeLessThanOrEqual(1);
	expect(moved!.dy).toBeLessThanOrEqual(1);
});

test('the button label follows the language switch', async ({ page }) => {
	await page.goto(POST);

	const btn = page.locator('.code-copy').first();
	// scope to the label span: the done span holds its own pair, so .i18n-en
	// alone would match twice and trip strict mode
	const label = btn.locator('.code-copy-label');
	await expect(label.locator('.i18n-en')).toBeVisible();
	await expect(label.locator('.i18n-zh')).toBeHidden();

	await page.locator('.lang-toggle').first().click();
	await expect(page.locator('html')).toHaveAttribute('data-lang', 'zh');
	await expect(label.locator('.i18n-en')).toBeHidden();
	await expect(label.locator('.i18n-zh')).toBeVisible();

	// the confirmation label follows too — the point of building both pairs at
	// runtime rather than looking the language up
	await btn.click();
	await expect(btn.locator('.code-copy-done .i18n-zh')).toHaveText('已复制 ✓');
});
