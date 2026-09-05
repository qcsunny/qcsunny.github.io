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

	expect(vars).toEqual(['720px', '612px', '960px', '1040px']);
});

// [route, container selector, expected border-box width at 1440px]
const MEASURES: [string, string, number][] = [
	['/tools/word-counter/', '.t-main', 720], // --w-page
	['/tools/sql-formatter/', '.t-main', 1040], // --w-max, workbench kinds
	['/about/', '.about-main', 612], // --w-prose, 34em at 18px
	['/privacy/', '.privacy-main', 612],
	['/blog/uuid-v4-vs-v7-database-guide/', '.prose', 612],
	['/calendar/', '.cal', 960], // --w-wide
	['/blog/', '.blog-container', 960],
	['/', '.home-container', 1040],
	['/', 'nav', 1040], // frame matches the widest page container
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

// Prose is deliberately narrow (34em) for line length, so code blocks and
// tables break out to --w-wide instead — and they have to stay centred on the
// prose column while doing it. The rule is global.css-only (markdown output
// carries no Astro scope attribute) and gated at 1010px, so this asserts the
// symmetry rather than just the width: an outer edge that drifts means the
// negative margin and box-sizing disagree.
test('code blocks and tables break out of the prose measure, centred', async ({ page }) => {
	await page.setViewportSize(WIDE);
	await page.goto('/blog/uuid-v4-vs-v7-database-guide/');

	const prose = (await page.locator('.prose').first().boundingBox())!;
	expect(Math.round(prose.width)).toBe(612);

	for (const selector of ['.prose pre', '.prose table']) {
		const box = await page.locator(selector).first().boundingBox();
		expect(box, `${selector} not found`).not.toBeNull();
		expect(Math.round(box!.width), `${selector} width`).toBe(960);
		// same overhang on both sides
		const left = prose.x - box!.x;
		const right = box!.x + box!.width - (prose.x + prose.width);
		expect(Math.round(left), `${selector} left overhang`).toBe(174);
		expect(Math.round(right), `${selector} right overhang`).toBe(174);
	}
});

// Below the 1010px gate the breakout must be off entirely, or the negative
// margin pulls the block past the viewport edge.
test('below 1010px code blocks stay inside the prose measure', async ({ page }) => {
	await page.setViewportSize({ width: 900, height: 900 });
	await page.goto('/blog/uuid-v4-vs-v7-database-guide/');

	const prose = (await page.locator('.prose').first().boundingBox())!;
	const pre = (await page.locator('.prose pre').first().boundingBox())!;
	expect(pre.width).toBeLessThanOrEqual(prose.width + 1);

	const overflow = await page.evaluate(
		() => document.documentElement.scrollWidth - document.documentElement.clientWidth,
	);
	expect(overflow).toBeLessThanOrEqual(0);
});
