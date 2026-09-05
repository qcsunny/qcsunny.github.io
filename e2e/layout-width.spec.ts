import { expect, test } from '@playwright/test';

// Every page container derives its measure from one of the four --w-* custom
// properties in global.css. A typo in a var() name makes the whole declaration
// invalid, which silently falls back to a full-width (or default 720px)
// container rather than erroring — so pin both the variables and the widths
// they resolve to.

const WIDE = { width: 1440, height: 900 };
const CJK = /[㐀-䶿一-鿿]/;

test('the four page measures are defined on :root', async ({ page }) => {
	await page.goto('/');

	const vars = await page.evaluate(() => {
		const s = getComputedStyle(document.documentElement);
		return ['--w-page', '--w-prose', '--w-outer', '--w-wide', '--w-max'].map((n) => s.getPropertyValue(n).trim());
	});

	// --w-prose deliberately equals --w-page: /blog/ and the posts it links to
	// used to be 960 and 612, so the text frame jumped 150px inward on every
	// click into an article.
	expect(vars).toEqual(['720px', '720px', '768px', '960px', '1040px']);
});

// [route, container selector, expected border-box width at 1440px]
const MEASURES: [string, string, number][] = [
	['/tools/word-counter/', '.t-main', 720], // --w-page
	['/tools/sql-formatter/', '.t-main', 1040], // --w-max, workbench kinds
	['/about/', '.about-main', 720], // --w-prose, 40em at 18px
	['/privacy/', '.privacy-main', 720],
	['/blog/uuid-v4-vs-v7-database-guide/', '.prose', 768], // --w-outer grid; text column 720 inside
	['/calendar/', '.cal', 960], // --w-wide
	['/blog/', '.blog-container', 768], // the list shares the articles' page grid
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

// Prose is deliberately narrow (40em) for line length, so code blocks and
// tables break out to --w-wide instead — and they have to stay centred on the
// prose column while doing it. The rule is global.css-only (markdown output
// carries no Astro scope attribute) and gated at 1010px, so this asserts the
// symmetry rather than just the width: an outer edge that drifts means the
// negative margin and box-sizing disagree.
test('code blocks and tables break out of the prose measure, centred', async ({ page }) => {
	await page.setViewportSize(WIDE);
	await page.goto('/blog/uuid-v4-vs-v7-database-guide/');

	const prose = (await page.locator('.prose').first().boundingBox())!;
	expect(Math.round(prose.width)).toBe(768);
	// the text column inside the grid: .prose's horizontal padding is the
	// (outer − prose)/2 centring, so a paragraph shares the article's 720 measure
	const textCol = await page.evaluate(() => {
		const p = document.querySelector('.prose p') as HTMLElement;
		const r = p.getBoundingClientRect();
		return { x: r.x, w: r.width };
	});
	expect(Math.round(textCol.w)).toBe(720);
	expect(Math.round(textCol.x - prose.x)).toBe(24); // (768 − 720) / 2

	for (const selector of ['.prose pre', '.prose table']) {
		const box = await page.locator(selector).first().boundingBox();
		expect(box, `${selector} not found`).not.toBeNull();
		expect(Math.round(box!.width), `${selector} width`).toBe(960);
		// The prose box is centred in main's content box, and the breakout's
		// margin box is (by construction, margins -(w-wide − w-outer)/2) centred
		// on the prose box. Assert the centre rather than the edges: a margin or
		// box-sizing drift moves the centre, while sub-pixel rounding does not.
		const proseCentre = prose.x + prose.width / 2;
		const boxCentre = box!.x + box!.width / 2;
		expect(Math.abs(boxCentre - proseCentre), `${selector} is not centred on the prose column`).toBeLessThanOrEqual(1);
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

// --- navigation-bar geometry, invisible in built HTML -----------------------
//
// 1. Logo + wordmark vs the nav links. The brand box used flex baseline
//    alignment, and a flex container's baseline comes from its first item — the
//    24px <svg>, whose baseline is its bottom edge. That carried the wordmark
//    8px above the links (measured cy 26 vs 34 before). Centre alignment then
//    got it to 2px, because the h2 wrapper is a text line box and the 24px logo
//    rides the baseline with dead descender space below it — the h2 is a flex
//    row now. Hence asserting the *text* centre too, not just the box centre.
test('the brand and the nav links share one horizontal axis', async ({ page }) => {
	await page.setViewportSize(WIDE);
	await page.goto('/');

	const centers = await page.evaluate(() => {
		const brand = document.querySelector('.site-branding');
		const links = document.querySelector('.nav-links');
		const right = document.querySelector('.nav-right');
		const cy = (el: Element | null): number => {
			const r = (el as HTMLElement).getBoundingClientRect();
			return r.top + r.height / 2;
		};
		return { brand: cy(brand), links: cy(links), right: cy(right) };
	});
	expect(Math.abs(centers.brand - centers.links)).toBeLessThanOrEqual(1);
	expect(Math.abs(centers.brand - centers.right)).toBeLessThanOrEqual(1);
});

// 2. The toolbox top bar is sticky. It is the only navigation those 57 pages
//    have — they render ToolShell's header instead of Header.astro — so a static
//    bar meant scrolling took the navigation away. Assert the computed style
//    (invisible in HTML) and the geometry after scrolling, on a tool page and a
//    hub page, which go through the same component.
for (const route of ['/tools/json-formatter/', '/calculators/']) {
	test(`${route} — the tool top bar sticks to the top while scrolling`, async ({ page }) => {
		await page.setViewportSize({ width: 900, height: 600 });
		await page.goto(route);

		const bar = page.locator('.t-topbar');
		expect(await bar.evaluate((el) => getComputedStyle(el).position)).toBe('sticky');

		await page.evaluate(() => window.scrollTo(0, 800));
		const box = (await bar.boundingBox())!;
		expect(Math.round(box.y)).toBe(0);
	});
}

// 3. The top bar's inner row takes the same measure as the blog nav, which is
//    what lands the logo on the same left edge on both sides of the site. Before,
//    the bar *was* the flex row — full-bleed with 1em of padding, logo at x=16
//    against the page frame's x=200 at 1440px.
test('the tool top bar aligns with the blog nav frame', async ({ page }) => {
	await page.setViewportSize(WIDE);

	await page.goto('/');
	const blogNav = (await page.locator('nav').first().boundingBox())!;

	await page.goto('/tools/json-formatter/');
	const toolBar = (await page.locator('.t-topbar-inner').boundingBox())!;

	// the two pages may not agree to the sub-pixel, but not to a visible offset
	expect(Math.abs(toolBar.x - blogNav.x)).toBeLessThanOrEqual(1);
	expect(Math.abs(toolBar.width - blogNav.width)).toBeLessThanOrEqual(1);
});

// The three /calculators/ pages that predate the registry print an
// "Also available:" strip that was English-only in both views — the i18n sweeps
// cannot see it because the Chinese-view sweep only inspects .i18n-en halves,
// and untagged English has none. Read the strip's *visible* text per view.
for (const [route, en, zh] of [
	['/calculators/standard/', 'Also available:', '其他工具：'],
	['/calculators/graph/', 'Also available:', '其他工具：'],
	['/calculators/graph3d/', 'Also available:', '其他工具：'],
] as [string, string, string][]) {
	test(`${route} — the Also available strip follows the language switch`, async ({ browser }) => {
		const ctx = await browser.newContext();
		await ctx.addInitScript(`try { localStorage.setItem('site:lang', 'en'); } catch {}`);
		const page = await ctx.newPage();
		await page.goto(route);

		// Visible text, read leaf-by-leaf: the strip's links carry their own
		// span pairs, so textContent would mix both languages. A leaf is the
		// visible half of one pair (or a separator) — walk elements and keep
		// only those that are shown.
		const strip = page.locator('.t-related');
		// Visible leaf texts. An <a> holds a pair, so its textContent mixes both
		// languages — take only the pair halves that are displayed (checkVisibility
		// honours the same display:none the CSS applies), plus the pair-less
		// label span and the separators.
		const leaves = () =>
			strip.evaluate((el) => {
				const out: string[] = [];
				for (const node of [el, ...el.querySelectorAll<HTMLElement>('span.i18n-en, span.i18n-zh, span:not([class])')]) {
					if (node !== el && !node.checkVisibility({ visibilityProperty: true })) continue;
					const t = node === el ? '' : (node.textContent ?? '').trim();
					if (t) out.push(t);
				}
				return out;
			});
		// the label half is there and visible
		const english = await leaves();
		expect(english.some((t) => t === en), 'the English label half is visible').toBe(true);
		expect(english.join('|'), 'Chinese showing in the English view').not.toMatch(CJK);

		await page.locator('.t-lang').click();
		await expect(page.locator('html')).toHaveAttribute('data-lang', 'zh');
		const chinese = await leaves();
		expect(chinese.some((t) => t === zh), 'the Chinese label half is visible').toBe(true);
		expect(chinese.join('|'), 'an English link text is still showing').not.toMatch(/[A-Za-z]{3,}/);
		await ctx.close();
	});
}
