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
		return ['--w-page', '--w-prose', '--w-outer', '--w-wide', '--w-max', '--w-shell'].map((n) => s.getPropertyValue(n).trim());
	});

	// --w-prose deliberately equals --w-page: /blog/ and the posts it links to
	// used to be 960 and 612, so the text frame jumped 150px inward on every
	// click into an article.
	expect(vars).toEqual(['720px', '820px', '832px', '1000px', '1040px', '1140px']);
});

// [route, container selector, expected border-box width at 1440px]
const MEASURES: [string, string, number][] = [
	['/tools/word-counter/', '.t-main', 720], // --w-page
	['/tools/sql-formatter/', '.t-main', 1040], // --w-max, workbench kinds
	['/about/', '.about-main', 820], // --w-prose
	['/privacy/', '.privacy-main', 820],
	['/blog/uuid-v4-vs-v7-database-guide/', '.prose', 832], // --w-outer grid; text column 820 inside
	['/calendar/', '.cal', 1000], // --w-wide
	['/blog/', '.blog-container', 832], // the list shares the articles' page grid
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
// Code blocks and tables fill the reading column, left-aligned with the text,
// like GitHub fills the container with a code block. Earlier drafts stretched
// every element to a fixed breakout measure and centred it on the article — but
// the TOC column pushes that article left of the page centre, so even a modest
// 4-column table was flung out of the reading frame to the left (this shipped,
// on /blog/china-income-tax-and-bonus-guide/). A column-filling box can never
// do that.
test('code blocks and tables fill the reading column, left-aligned', async ({ page }) => {
	await page.setViewportSize(WIDE);
	await page.goto('/blog/uuid-v4-vs-v7-database-guide/');

	const prose = (await page.locator('.prose').first().boundingBox())!;
	expect(Math.round(prose.width)).toBe(832);
	const textCol = await page.evaluate(() => {
		const p = document.querySelector('.prose p') as HTMLElement;
		const r = p.getBoundingClientRect();
		return { x: r.x, w: r.width };
	});
	expect(Math.round(textCol.w)).toBe(820);

	for (const selector of ['.prose pre', '.prose table']) {
		const box = await page.locator(selector).first().boundingBox();
		expect(box, `${selector} not found`).not.toBeNull();
		// the box shares the reading column's frame and its left edge
		expect(Math.round(box!.width), `${selector} width`).toBe(820);
		expect(Math.abs(box!.x - textCol.x), `${selector} left edge`).toBeLessThanOrEqual(1);
		// and nothing it contains overflows it (wide content wraps, or scrolls
		// inside the box — either way the frame holds)
		const overflow = await page.locator(selector).first().evaluate((el) => el.scrollWidth - el.clientWidth);
		expect(overflow, `${selector} internal overflow`).toBeLessThanOrEqual(1);
	}

	// the whole page never grows a horizontal scrollbar from a table
	const pageOverflow = await page.evaluate(
		() => document.documentElement.scrollWidth - document.documentElement.clientWidth,
	);
	expect(pageOverflow).toBeLessThanOrEqual(0);
});

// The widest real table (a 1440px-max-content FIRE table) still must not break
// the frame — it compresses into the column, or scrolls inside it.
test('even a very wide table never moves the page frame', async ({ page }) => {
	await page.setViewportSize(WIDE);
	await page.goto('/blog/fire-movement-and-4-percent-rule-guide/');

	const prose = (await page.locator('.prose').first().boundingBox())!;
	const table = (await page.locator('.prose table').first().boundingBox())!;
	expect(Math.abs(table.x - prose.x)).toBeLessThanOrEqual(8);

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

// --- the blog post reading layout (shell + TOC column) ----------------------
//
// The post page is a GitHub-code-page shape: a 1140px centred shell holding an
// 832px article grid and a 250px sticky TOC. All of this is invisible in the
// built HTML, and each piece has broken independently at least once — the
// collapsed TOC once rendered 9700px down the page (a grid row *after* the
// article) and its fold-out list once sat inside a display:none wrapper.
const POST = '/blog/canvas-2d-surface-plot/';

test('at 1440 the post page is a shell with a sticky TOC beside the reading column', async ({ page }) => {
	await page.setViewportSize(WIDE);
	await page.goto(POST);

	const geo = await page.evaluate(() => {
		const box = (sel: string) => {
			const r = document.querySelector(sel)!.getBoundingClientRect();
			return { x: Math.round(r.x), w: Math.round(r.width), y: Math.round(r.y) };
		};
		return {
			shell: box('main'),
			article: box('article'),
			text: box('.prose p'),
			toc: box('.toc'),
			tocPos: getComputedStyle(document.querySelector('.toc')!).position,
			tocLinks: document.querySelectorAll('.toc [data-toc-target]').length,
		};
	});
	expect(geo.shell.w).toBe(1140); // the requested total container
	expect(geo.article.w).toBe(832); // --w-outer grid
	expect(geo.text.w).toBe(820); // the requested 800–860 reading column
	expect(geo.tocPos).toBe('sticky'); // pinned while the article scrolls
	// 250px column + borders + a scrollbar when the list is long enough to
	// need one — the requested 240–260 band either way
	expect(geo.toc.w).toBeGreaterThanOrEqual(240);
	expect(geo.toc.w).toBeLessThanOrEqual(262);
	expect(geo.tocLinks).toBeGreaterThanOrEqual(3);
	// side by side, top-aligned, inside the shell
	expect(geo.toc.x).toBeGreaterThan(geo.article.x + geo.article.w);
	// the whole assembly fits in the shell with 5px to spare (the TOC's
	// scrollbar and borders ride on top of its column)
	expect(geo.toc.x + geo.toc.w - (geo.shell.x + geo.shell.w)).toBeLessThanOrEqual(6);
	expect(Math.abs(geo.toc.y - geo.article.y)).toBeLessThanOrEqual(1);
});

test('scrolling pins the TOC and moves the highlight', async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 800 });
	await page.goto(POST);

	await page.evaluate(() => window.scrollTo(0, 2000));
	await page.waitForTimeout(200);
	const active = page.locator('.toc a.toc-active');
	await expect(active).toHaveCount(1);
	const first = await active.evaluate((el) => el.textContent);

	await page.evaluate(() => window.scrollTo(0, 6000));
	await page.waitForTimeout(200);
	const second = await active.evaluate((el) => el.textContent);
	expect(second).not.toBe(first); // the spy follows the reading position

	// pinned: while 6000px in, the TOC sits at the CSS top value (~82px =
	// 4.5em + 1px) rather than anywhere down the page
	const tocY = (await page.locator('.toc').boundingBox())!.y;
	expect(tocY).toBeLessThan(120);
});

test('clicking a TOC entry lands the heading clear of the sticky header', async ({ page }) => {
	await page.setViewportSize(WIDE);
	await page.goto(POST);

	// pick a TOC link well down the page so the scroll actually moves
	const link = page.locator('.toc [data-toc-target]').nth(3);
	const id = await link.getAttribute('data-toc-target');
	expect(id).toBeTruthy();

	await link.click();
	await page.waitForTimeout(400); // native anchor jump + scroll settle

	const geo = await page.evaluate((targetId) => {
		const header = document.querySelector('header') as HTMLElement;
		const heading = document.getElementById(targetId!) as HTMLElement;
		return {
			headerBottom: Math.round(header.getBoundingClientRect().bottom),
			headingTop: Math.round(heading.getBoundingClientRect().top),
		};
	}, id);

	// the heading's top must sit at or below the sticky header's bottom edge —
	// not under it. Before scroll-margin-top the jump landed the heading at
	// y=0 and ~48px of it hid behind the nav. A 2px tolerance absorbs sub-pixel
	// rounding from the color-mix backdrop.
	expect(geo.headingTop).toBeGreaterThanOrEqual(geo.headerBottom - 2);
	// and it should be in the comfortable band just below the nav (5rem
	// scroll-margin ≈ 80px), not stranded half a viewport down
	expect(geo.headingTop).toBeLessThan(geo.headerBottom + 60);
});

test('below 1200px the TOC collapses into a fold-out above the article', async ({ page }) => {
	await page.setViewportSize({ width: 900, height: 800 });
	await page.goto(POST);

	const geo = await page.evaluate(() => {
		const toc = document.querySelector('.toc') as HTMLElement;
		const prose = document.querySelector('.prose') as HTMLElement;
		return {
			tocY: Math.round(toc.getBoundingClientRect().y),
			proseY: Math.round(prose.getBoundingClientRect().y),
			toggleVisible: getComputedStyle(toc.querySelector('.toc-toggle')!).display !== 'none',
			rows: getComputedStyle(toc.querySelector('.toc-list')!).gridTemplateRows,
		};
	});
	// the collapsed nav sits ABOVE the article, within the first screen
	expect(geo.toggleVisible).toBe(true);
	expect(geo.tocY).toBeLessThan(300);
	expect(geo.tocY).toBeLessThan(geo.proseY);

	// fold out, follow a link: the list opens and clicking an entry both
	// navigates and folds the list back up
	await page.locator('.toc-toggle').click();
	await expect
		.poll(() => page.locator('.toc-list').evaluate((el) => el.getBoundingClientRect().height))
		.toBeGreaterThan(100);
	await page.locator('.toc-list a').nth(2).click();
	await page.waitForTimeout(400);
	expect(await page.evaluate(() => decodeURIComponent(location.hash))).not.toBe('');
	await expect
		.poll(() => page.locator('.toc-list').evaluate((el) => el.getBoundingClientRect().height))
		.toBeLessThan(10);

	// the reading column itself at this width: 832 grid, 820 text
	const prose = (await page.locator('.prose').boundingBox())!;
	expect(Math.round(prose.width)).toBe(832);
});
