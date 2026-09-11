// CSS Grid / Flexbox visual generators (csslayout.ts). The preview is a real
// grid/flex container, so the assertions read computed styles off the DOM —
// the drag case drives a pointer sweep across cells and expects a spanning
// item plus span-notation CSS to come out the other end.

import { test, expect } from '@playwright/test';

const GRID = '/devtools/css-grid-generator/';
const FLEX = '/devtools/flexbox-generator/';

test('grid generator renders tracks, cells and default CSS', async ({ page }) => {
	await page.goto(GRID);
	await page.waitForSelector('.t-gridgen-play');

	// 3 columns × 2 rows = 6 cells
	expect(await page.locator('.t-gridgen-cell').count()).toBe(6);
	const play = page.locator('.t-gridgen-play');
	expect(await play.evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length)).toBe(3);

	const code = await page.locator('.t-csscode').textContent();
	expect(code).toContain('.grid-container');
	expect(code).toContain('grid-template-columns: 200px 1fr 1fr');
	expect(code).toContain('gap: 8px');
});

test('grid drag across cells creates a spanning item with span-notation CSS', async ({ page }) => {
	await page.setViewportSize({ width: 1200, height: 900 });
	await page.goto(GRID);
	await page.waitForSelector('.t-gridgen-cell');

	const cell = (r: number, c: number) => page.locator(`.t-gridgen-cell[data-r="${r}"][data-c="${c}"]`);
	const from = await cell(1, 1).boundingBox();
	const to = await cell(2, 2).boundingBox();
	expect(from && to).toBeTruthy();
	if (!from || !to) return;

	await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
	await page.mouse.down();
	// two hops so pointermove has a chance to land on intermediate cells
	await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 });
	await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 4 });
	await page.mouse.up();

	// one item spanning 2×2
	await page.waitForSelector('.t-gridgen-item');
	const item = page.locator('.t-gridgen-item').first();
	expect(await item.evaluate((el) => getComputedStyle(el).gridColumnStart)).toBe('1');
	expect(await item.evaluate((el) => getComputedStyle(el).gridColumnEnd)).toBe('3');

	const code = await page.locator('.t-csscode').textContent();
	expect(code).toContain('grid-column: 1 / span 2');
	expect(code).toContain('grid-row: 1 / span 2');

	// clicking the item removes it again
	await item.click();
	expect(await page.locator('.t-gridgen-item').count()).toBe(0);
	expect(await page.locator('.t-csscode').textContent()).not.toContain('span');
});

test('grid track editors add, edit and remove tracks', async ({ page }) => {
	await page.goto(GRID);
	await page.waitForSelector('.t-trackeditor');

	// the first track editor is columns: 3 inputs, + adds a 4th
	const cols = page.locator('.t-trackeditor').first();
	expect(await cols.locator('.t-trackinput').count()).toBe(3);
	await cols.getByRole('button', { name: '+' }).click();
	expect(await cols.locator('.t-trackinput').count()).toBe(4);
	expect(await page.locator('.t-csscode').textContent()).toContain('grid-template-columns: 200px 1fr 1fr 1fr');

	// editing a track value rewrites the output
	const first = cols.locator('.t-trackinput').first();
	await first.fill('120px');
	await first.blur();
	expect(await page.locator('.t-csscode').textContent()).toContain('grid-template-columns: 120px 1fr 1fr 1fr');

	// removing a column shrinks the cell grid accordingly
	await cols.getByRole('button', { name: '−' }).click();
	expect(await page.locator('.t-gridgen-cell').count()).toBe(6); // 4−1 cols × 2 rows
});

test('flexbox generator reflects every property in preview and CSS', async ({ page }) => {
	await page.goto(FLEX);
	await page.waitForSelector('.t-flexgen-play');

	// 3 children by default
	expect(await page.locator('.t-flexgen-item').count()).toBe(3);
	let code = await page.locator('.t-csscode').textContent();
	expect(code).toContain('display: flex');
	expect(code).toContain('justify-content: flex-start');

	// changing a select rewrites both the live container and the CSS
	// (each select carries data-prop — 'center' exists in two selects)
	const pick = async (prop: string, value: string): Promise<void> => {
		await page.locator(`.t-csslayout-ctrl select[data-prop="${prop}"]`).selectOption(value);
		await expect(page.locator('.t-csscode')).toContainText(`${prop}: ${value}`);
	};
	await pick('justify-content', 'space-between');
	await pick('flex-direction', 'row-reverse');
	await pick('align-items', 'center');
	await pick('flex-wrap', 'wrap');

	const play = page.locator('.t-flexgen-play');
	expect(await play.evaluate((el) => getComputedStyle(el).justifyContent)).toBe('space-between');
	expect(await play.evaluate((el) => getComputedStyle(el).flexDirection)).toBe('row-reverse');
	expect(await play.evaluate((el) => getComputedStyle(el).alignItems)).toBe('center');
	expect(await play.evaluate((el) => getComputedStyle(el).flexWrap)).toBe('wrap');

	// children count follows the input
	const count = page.locator('.t-csslayout-ctrl input[type="number"]').last();
	await count.fill('6');
	await count.blur();
	expect(await page.locator('.t-flexgen-item').count()).toBe(6);
	code = await page.locator('.t-csscode').textContent();
	expect(code).toContain('flex-grow: 2'); // the third child carries grow 2
});
