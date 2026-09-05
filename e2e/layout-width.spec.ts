import { expect, test } from '@playwright/test';

// Every page container derives its measure from one of the four --w-* custom
// properties in global.css. A typo in a var() name makes the whole declaration
// invalid, which silently falls back to a full-width (or default 720px)
// container rather than erroring — so pin both the variables and the widths
// they resolve to.

const WIDE = { width: 1440, height: 900 };

test('the four page measures are defined on :root', async ({ page }) => {
	await page.goto('/');

	const vars = await page.evaluate(() => {
		const s = getComputedStyle(document.documentElement);
		return ['--w-page', '--w-prose', '--w-wide', '--w-max'].map((n) => s.getPropertyValue(n).trim());
	});

	expect(vars).toEqual(['720px', '780px', '960px', '1040px']);
});

// [route, container selector, expected border-box width at 1440px]
const MEASURES: [string, string, number][] = [
	['/tools/word-counter/', '.t-main', 720], // --w-page
	['/tools/sql-formatter/', '.t-main', 1040], // --w-max, workbench kinds
	['/about/', '.about-main', 780], // --w-prose
	['/privacy/', '.privacy-main', 780],
	['/blog/uuid-v4-vs-v7-database-guide/', '.prose', 780],
	['/calendar/', '.cal', 960], // --w-wide
	['/blog/', '.blog-container', 960],
	['/', '.home-container', 1040],
];

for (const [route, selector, expected] of MEASURES) {
	test(`${route} — ${selector} measures ${expected}px`, async ({ page }) => {
		await page.setViewportSize(WIDE);
		await page.goto(route);

		const box = await page.locator(selector).first().boundingBox();
		expect(box, `${selector} not found on ${route}`).not.toBeNull();
		expect(Math.round(box!.width)).toBe(expected);
	});
}
