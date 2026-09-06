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
		return ['--w-prose', '--w-outer', '--w-wide', '--w-shell'].map((n) => s.getPropertyValue(n).trim());
	});

	// --w-shell is the one outer frame for the whole site — nav, home, /blog/,
	// every tool page and the post shell. It used to be split across 720
	// (--w-page), 832 (--w-outer on the list) and 1040 (--w-max), so the frame
	// jumped on every navigation; those three variables are gone.
	expect(vars).toEqual(['820px', '832px', '1000px', '1140px']);
});

// [route, container selector, expected border-box width at 1440px]
const MEASURES: [string, string, number][] = [
	['/tools/word-counter/', '.t-main', 1140], // --w-shell
	['/tools/sql-formatter/', '.t-main', 1140], // workbench kinds take the same frame
	['/about/', '.about-main', 1140], // frame; the reading column inside stays 820
	['/privacy/', '.privacy-main', 1140],
	['/blog/uuid-v4-vs-v7-database-guide/', '.prose', 832], // --w-outer grid; text column 820 inside
	['/calendar/', '.cal', 1000], // --w-wide
	['/blog/', '.blog-container', 1140],
	['/', '.home-container', 1140],
	['/', 'nav', 1140], // frame matches the widest page container
];

// The 1140 frame must not stretch long-form prose: about/privacy keep the
// 820px reading column inside it, hung on the frame's left edge like a blog
// post's text column. Pin one paragraph and the shared left edge.
for (const [route, sel] of [
	['/about/', '.about-main .i18n-en p'],
	['/privacy/', '.privacy-main .i18n-en p'],
] as [string, string][]) {
	test(`${route} — prose inside the 1140 frame keeps the 820 reading column`, async ({ page }) => {
		await page.setViewportSize(WIDE);
		await page.goto(route);

		const geo = await page.evaluate((pSel) => {
			const p = document.querySelector(pSel) as HTMLElement;
			const main = document.querySelector('main') as HTMLElement;
			const r = p.getBoundingClientRect();
			const m = main.getBoundingClientRect();
			return { textW: r.width, textX: r.x, frameX: m.x };
		}, sel);
		expect(Math.round(geo.textW)).toBe(820);
		expect(Math.abs(geo.textX - geo.frameX), 'prose hangs off the frame’s left edge').toBeLessThanOrEqual(1);
	});
}

// The 'tools' category's hub IS /tools/, which the first breadcrumb segment
// already links — the middle crumb used to point at /tools/ again and just
// reload the same page. It now anchors the category section; the categories
// with their own hub route keep it.
test('the category breadcrumb never duplicates the Tools crumb’s destination', async ({ page }) => {
	await page.goto('/tools/word-counter/');
	const crumbs = page.locator('.t-crumbs a');
	await expect(crumbs.nth(0)).toHaveAttribute('href', '/tools/');
	await expect(crumbs.nth(1)).toHaveAttribute('href', '/tools/#cat-tools');
	// and the anchor actually exists on the hub
	await page.goto('/tools/');
	await expect(page.locator('#cat-tools')).toHaveCount(1);

	await page.goto('/finance/mortgage/');
	await expect(page.locator('.t-crumbs a').nth(1)).toHaveAttribute('href', '/finance/');
});

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
// Code blocks fill the reading column, left-aligned with the text, like GitHub
// fills the container with a code block. Earlier drafts stretched every element
// to a fixed breakout measure and centred it on the article — but the TOC column
// pushes that article left of the page centre, so even a modest 4-column table
// was flung out of the reading frame to the left (this shipped, on
// /blog/china-income-tax-and-bonus-guide/). A column-filling box can never do
// that.
test('code blocks fill the reading column, left-aligned', async ({ page }) => {
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

	const box = await page.locator('.prose pre').first().boundingBox();
	expect(box, '.prose pre not found').not.toBeNull();
	// the block shares the reading column's frame and its left edge
	expect(Math.round(box!.width), 'width').toBe(820);
	expect(Math.abs(box!.x - textCol.x), 'left edge').toBeLessThanOrEqual(1);
	// and nothing it contains overflows it (wide content wraps, or scrolls
	// inside the box — either way the frame holds)
	const overflow = await page.locator('.prose pre').first().evaluate((el) => el.scrollWidth - el.clientWidth);
	expect(overflow, 'internal overflow').toBeLessThanOrEqual(1);

	// the whole page never grows a horizontal scrollbar
	const pageOverflow = await page.evaluate(
		() => document.documentElement.scrollWidth - document.documentElement.clientWidth,
	);
	expect(pageOverflow).toBeLessThanOrEqual(0);
});

// Tables centre in the reading column and shrink to their own content, so a
// modest 3-column table no longer stretches to the full 820px with the leftover
// space dumped in a gap to its right. A table whose natural width exceeds the
// column still fills it whole, and scrolls inside its own box if it truly
// cannot fit — neither case breaks the page frame. Probed across posts whose
// tables span 311px–820px.
test('tables centre in the reading column and never break the page frame', async ({ page }) => {
	await page.setViewportSize(WIDE);
	for (const route of [
		'/blog/qr-code-reed-solomon-encoder/',
		'/blog/static-site-byte-ledger/',
		'/blog/si-units-and-conversion-precision/',
	]) {
		await page.goto(route);
		const data = await page.evaluate(() => {
			const p = document.querySelector('.prose p') as HTMLElement;
			const r = p.getBoundingClientRect();
			return {
				center: r.x + r.width / 2,
				w: r.width,
				tables: [...document.querySelectorAll('.prose table')].map((t) => {
					const tr = t.getBoundingClientRect();
					return { x: tr.x, w: tr.width, ovf: t.scrollWidth - t.clientWidth };
				}),
				pageOvf: document.documentElement.scrollWidth - document.documentElement.clientWidth,
			};
		});
		expect(Math.round(data.w), 'text column').toBe(820);
		expect(data.tables.length, `${route} has tables`).toBeGreaterThan(0);
		for (const t of data.tables) {
			expect(t.w, 'fits the column').toBeLessThanOrEqual(data.w + 1);
			// centred on the column — a table filling it whole is also centred
			expect(Math.abs(t.x + t.w / 2 - data.center), 'centred').toBeLessThanOrEqual(1);
			expect(t.ovf, 'internal overflow').toBeLessThanOrEqual(1);
		}
		expect(data.pageOvf, 'no page scrollbar').toBeLessThanOrEqual(0);
	}
});

// The widest real table fills the reading column without escaping it — its
// content compresses to fit, or it scrolls inside its own box. Either way the
// page frame holds.
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

test('the space above the back-to-blog link is one padding, not a stack', async ({ page }) => {
	// A post carries no hero image by design (the OG card is the only place the
	// asset is used), so .hero-image renders as an empty box. main reserved 3em
	// of top padding and .prose reserved 2rem of its own to separate the text
	// from that image, and with nothing between the two the stack read as 88px
	// of dead space above a single back link. .prose's share is now 0 and main
	// owns the whole gap — this pins the total so the stack cannot come back.
	const gap = () =>
		page.evaluate(() => {
			const bottom = document.querySelector('header')!.getBoundingClientRect().bottom;
			const back = document.querySelector('.back-link')!.getBoundingClientRect();
			return {
				aboveBack: Math.round((back.top - bottom) * 10) / 10,
				heroHeight: Math.round(document.querySelector('.hero-image')!.getBoundingClientRect().height * 10) / 10,
				mainPadTop: getComputedStyle(document.querySelector('main')!).paddingTop,
				prosePadTop: getComputedStyle(document.querySelector('.prose')!).paddingTop,
				titleTop: Math.round(document.querySelector('.title')!.getBoundingClientRect().top * 10) / 10,
			};
		});

	for (const size of [WIDE, { width: 375, height: 740 }]) {
		await page.setViewportSize(size);
		if (size.width === 1440) await page.goto(POST);
		await page.waitForTimeout(150);

		const g = await gap();
		// neither of the two paddings is allowed back, and the empty hero image
		// is not allowed to hold a slot in the stack
		expect(g.prosePadTop, `${size.width} — .prose top padding`).toBe('0px');
		expect(g.heroHeight, `${size.width} — .hero-image height`).toBe(0);
		// the gap is main's padding plus a couple of px of line-box leading;
		// 88px is the regression this test exists to catch
		expect(g.aboveBack, `${size.width} — gap above the back link`).toBeGreaterThanOrEqual(35);
		expect(g.aboveBack, `${size.width} — gap above the back link`).toBeLessThanOrEqual(56);
		// tightening it did not push the article title below the fold
		expect(g.titleTop, `${size.width} — title`).toBeLessThan(240);
	}
});

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

test('below 1200px the TOC is a floating pill that folds out a panel', async ({ page }) => {
	await page.setViewportSize({ width: 900, height: 800 });
	await page.goto(POST);

	const geo = await page.evaluate(() => {
		const toc = document.querySelector('.toc')!;
		const toggle = toc.querySelector('.toc-toggle')!;
		const fold = toc.querySelector('.toc-fold')!;
		const list = toc.querySelector('.toc-list')!;
		const cs = (el: Element) => getComputedStyle(el);
		const box = (el: Element) => {
			const r = el.getBoundingClientRect();
			return {
				x: Math.round(r.x),
				y: Math.round(r.y),
				w: Math.round(r.width),
				h: Math.round(r.height),
			};
		};
		return {
			pos: cs(toc).position,
			toggleVisible: cs(toggle).display !== 'none',
			toggle: box(toggle),
			listHeight: Math.round(list.getBoundingClientRect().height),
			listVisible: cs(fold).visibility,
			proseY: Math.round(document.querySelector('.prose')!.getBoundingClientRect().y),
		};
	});
	// pinned to the viewport, not in the page flow
	expect(geo.pos).toBe('fixed');
	expect(geo.toggleVisible).toBe(true);
	expect(geo.toggle.x + geo.toggle.w).toBeLessThanOrEqual(900);
	expect(geo.toggle.y + geo.toggle.h).toBeLessThanOrEqual(800);
	// the panel starts folded — zero height, and its links are out of the tab
	// order via the visibility flip, not just clipped
	expect(geo.listHeight).toBe(0);
	expect(geo.listVisible).toBe('hidden');
	// the article is no longer pushed down by an in-flow disclosure
	expect(geo.proseY).toBeLessThan(400);

	// the pill survives scrolling far down the post and does not move — that was
	// the whole point of floating it off the page flow
	await page.evaluate(() => window.scrollTo(0, 4000));
	await page.waitForTimeout(200);
	const pill = (await page.locator('.toc-toggle').boundingBox())!;
	expect(Math.round(pill.y)).toBe(geo.toggle.y);
	expect(pill.x + pill.width).toBeLessThanOrEqual(900);

	// fold out: the panel opens above the pill and stays inside the viewport
	await page.locator('.toc-toggle').click();
	expect(await page.locator('.toc-toggle').getAttribute('aria-expanded')).toBe('true');
	await expect
		.poll(() => page.locator('.toc-list').evaluate((el) => el.getBoundingClientRect().height))
		.toBeGreaterThan(100);
	const open = await page.evaluate(() => {
		const fold = document.querySelector('.toc-fold')!;
		const list = fold.querySelector('.toc-list')!;
		return {
			foldTop: Math.round(fold.getBoundingClientRect().y),
			foldBottom: Math.round(fold.getBoundingClientRect().bottom),
			listScrollable: list.scrollHeight - list.clientHeight,
		};
	});
	expect(open.foldTop).toBeGreaterThanOrEqual(0);
	expect(open.foldBottom).toBeLessThanOrEqual(800);
	// every entry is reachable by scrolling the list, not clipped away
	expect(open.listScrollable).toBeGreaterThan(0);
	const lastReachable = await page.evaluate(() => {
		const list = document.querySelector('.toc-list')!;
		list.scrollTop = list.scrollHeight;
		const a = list.querySelector('.toc-item:last-child a')!;
		const l = list.getBoundingClientRect();
		const r = a.getBoundingClientRect();
		return r.top >= l.top - 1 && r.bottom <= l.bottom + 1;
	});
	expect(lastReachable).toBe(true);

	// a link jump folds the panel back behind the heading
	await page.evaluate(() => (document.querySelector('.toc-list') as HTMLElement).scrollTop = 0);
	await page.locator('.toc-list a').nth(2).click();
	await page.waitForTimeout(400);
	expect(await page.evaluate(() => decodeURIComponent(location.hash))).not.toBe('');
	expect(await page.locator('.toc-toggle').getAttribute('aria-expanded')).toBe('false');
	await expect
		.poll(() => page.locator('.toc-list').evaluate((el) => el.getBoundingClientRect().height))
		.toBeLessThan(1);

	// Escape and a tap outside the nav each close it
	await page.locator('.toc-toggle').click();
	await page.keyboard.press('Escape');
	expect(await page.locator('.toc-toggle').getAttribute('aria-expanded')).toBe('false');

	await page.locator('.toc-toggle').click();
	await page.evaluate(() =>
		document.body.dispatchEvent(new MouseEvent('click', { bubbles: true })),
	);
	expect(await page.locator('.toc-toggle').getAttribute('aria-expanded')).toBe('false');

	// the reading column itself at this width: 832 box
	const prose = (await page.locator('.prose').boundingBox())!;
	expect(Math.round(prose.width)).toBe(832);
});

// --- code blocks follow the site theme -------------------------------------
//
// Shiki used to ship a single github-dark theme: every <pre> carried an inline
// background-color:#24292e and inline token colours, so a code block was dark
// in BOTH light and dark site mode and the theme toggle did nothing to it. The
// fix is dual themes (github-light + github-dark) with defaultColor:false, so
// the blocks emit --shiki-light / --shiki-dark custom properties only, and
// global.css routes them through html[data-theme]. This locks the two palettes
// and the token colours that ride them.
test('code blocks follow the site theme — light palette in light, dark in dark', async ({ page }) => {
	await page.setViewportSize(WIDE);

	const measure = async (theme: 'light' | 'dark') => {
		// set the preference, then navigate so the head anti-flash script reads it
		await page.goto(POST);
		await page.evaluate((m) => localStorage.setItem('site:theme', m), theme);
		await page.goto(POST);

		return page.evaluate(() => {
			const pre = document.querySelector('pre.astro-code') as HTMLElement;
			const cs = getComputedStyle(pre);
			// a token whose light and dark colours genuinely differ (a keyword,
			// not the grey that both github themes share for comments)
			const token = [...pre.querySelectorAll('span[style]')].find((s) => {
				const l = s.style.getPropertyValue('--shiki-light');
				const d = s.style.getPropertyValue('--shiki-dark');
				return l && d && l.toLowerCase() !== d.toLowerCase();
			}) as HTMLElement | undefined;
			// hex → rgb, so a token's rendered colour can be compared to the
			// --shiki-* hex it is supposed to be reading
			const toRgb = (hex: string) => {
				const probe = document.createElement('span');
				probe.style.color = hex;
				document.body.appendChild(probe);
				const rgb = getComputedStyle(probe).color;
				probe.remove();
				return rgb;
			};
			return {
				dataTheme: document.documentElement.dataset.theme || '',
				bg: cs.backgroundColor,
				border: cs.borderStyle,
				tokenRendered: token ? getComputedStyle(token).color : '',
				lightRgb: token ? toRgb(token.style.getPropertyValue('--shiki-light')) : '',
				darkRgb: token ? toRgb(token.style.getPropertyValue('--shiki-dark')) : '',
			};
		});
	};

	const light = await measure('light');
	expect(light.dataTheme).toBe(''); // light = attribute absent → :root
	expect(light.bg).toBe('rgb(255, 255, 255)');
	// a white block needs a visible edge on the #fafafa page, so the border is
	// present in both modes; only its colour changes
	expect(light.border).not.toBe('none');
	// the token reads its --shiki-light variable in light mode
	expect(light.tokenRendered).toBe(light.lightRgb);

	const dark = await measure('dark');
	expect(dark.dataTheme).toBe('dark');
	expect(dark.bg).toBe('rgb(36, 41, 46)'); // github-dark #24292e
	expect(dark.border).not.toBe('none');
	// and its --shiki-dark variable in dark mode
	expect(dark.tokenRendered).toBe(dark.darkRgb);

	// the two modes are not the same palette — the regression this guards
	expect(dark.bg).not.toBe(light.bg);
	expect(dark.tokenRendered).not.toBe(light.tokenRendered);
});
