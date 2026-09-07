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
