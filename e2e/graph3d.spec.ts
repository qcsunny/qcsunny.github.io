import { expect, test, type Locator, type Page } from '@playwright/test';

// /calculators/graph3d — the 3D surface plotter. The renderer is a hand-rolled
// software rasteriser on canvas 2D, so these tests read the canvas back with
// getImageData rather than trusting that a call was made.

const canvasOf = (page: Page): Locator => page.locator('#g3-canvas');

/** Number of non-transparent pixels — a blank plot is the failure mode that
 *  matters (a thrown error inside render() leaves the canvas cleared). */
function paintedPixels(canvas: Locator): Promise<number> {
	return canvas.evaluate((el) => {
		const c = el as HTMLCanvasElement;
		const ctx = c.getContext('2d');
		if (!ctx) return 0;
		const { data } = ctx.getImageData(0, 0, c.width, c.height);
		let n = 0;
		for (let i = 3; i < data.length; i += 4) {
			if ((data[i] as number) > 0) n++;
		}
		return n;
	});
}

const snapshot = (canvas: Locator): Promise<string> =>
	canvas.evaluate((el) => (el as HTMLCanvasElement).toDataURL());

test('default surface renders with a readout and no error', async ({ page }) => {
	await page.goto('/calculators/graph3d/');

	const canvas = canvasOf(page);
	await expect(canvas).toBeVisible();
	await expect(page.locator('#g3-expr')).toHaveValue('sin(x) * cos(y)');

	expect(await paintedPixels(canvas)).toBeGreaterThan(5000);

	// sin(x)·cos(y) reaches ±1 on [-5, 5]²
	const readout = page.locator('#g3-readout');
	await expect(readout).toContainText('44 × 44');
	await expect(readout).toContainText('1');
	await expect(page.locator('#g3-error')).toBeHidden();
});

test('editing the formula resamples the surface', async ({ page }) => {
	await page.goto('/calculators/graph3d/');

	await page.locator('#g3-expr').fill('x^2 - y^2');

	// exact extremes of the saddle on [-5, 5]²
	const readout = page.locator('#g3-readout');
	await expect(readout).toContainText('25');
	await expect(readout).toContainText('-25');
	await expect(page.locator('#g3-error')).toBeHidden();
});

test('example chips load their formula', async ({ page }) => {
	await page.goto('/calculators/graph3d/');

	await page.locator('[data-g3-example="x * y"]').click();
	await expect(page.locator('#g3-expr')).toHaveValue('x * y');
	expect(await paintedPixels(canvasOf(page))).toBeGreaterThan(5000);
});

test('undefined regions become holes rather than fake values', async ({ page }) => {
	await page.goto('/calculators/graph3d/');

	// ln(x·y) exists only where x·y > 0 — two of the four quadrants
	await page.locator('#g3-expr').fill('ln(x * y)');
	await expect(page.locator('#g3-readout')).toContainText('undefined');
});

test('a pole reports the clipped height range', async ({ page }) => {
	await page.goto('/calculators/graph3d/');

	await page.locator('#g3-expr').fill('1 / (x^2 + y^2)');
	await expect(page.locator('#g3-readout')).toContainText('percentile');
});

test('an invalid formula shows an error and clears the plot', async ({ page }) => {
	await page.goto('/calculators/graph3d/');

	await page.locator('#g3-expr').fill('sin(');
	await expect(page.locator('#g3-error')).toBeVisible();
	expect(await paintedPixels(canvasOf(page))).toBe(0);

	// recovering from the typo redraws
	await page.locator('#g3-expr').fill('sin(x)');
	await expect(page.locator('#g3-error')).toBeHidden();
	expect(await paintedPixels(canvasOf(page))).toBeGreaterThan(5000);
});

test('dragging rotates the plot', async ({ page }) => {
	await page.goto('/calculators/graph3d/');

	const canvas = canvasOf(page);
	const before = await snapshot(canvas);
	const box = await canvas.boundingBox();
	expect(box).not.toBeNull();
	const { x, y, width, height } = box as { x: number; y: number; width: number; height: number };

	await page.mouse.move(x + width / 2, y + height / 2);
	await page.mouse.down();
	await page.mouse.move(x + width / 2 + 90, y + height / 2 + 30, { steps: 8 });
	await page.mouse.up();

	expect(await snapshot(canvas)).not.toBe(before);
});

test('arrow keys rotate and 0 resets the view', async ({ page }) => {
	await page.goto('/calculators/graph3d/');

	const canvas = canvasOf(page);
	await canvas.click({ position: { x: 4, y: 4 } });
	const start = await snapshot(canvas);

	await canvas.press('ArrowRight');
	await canvas.press('ArrowRight');
	const rotated = await snapshot(canvas);
	expect(rotated).not.toBe(start);

	await canvas.press('0');
	expect(await snapshot(canvas)).toBe(start);
});

test('detail and style controls take effect', async ({ page }) => {
	await page.goto('/calculators/graph3d/');

	const canvas = canvasOf(page);
	await page.locator('#g3-res').selectOption('28');
	await expect(page.locator('#g3-readout')).toContainText('28 × 28');

	const shaded = await snapshot(canvas);
	await page.locator('#g3-style').selectOption('wire');
	expect(await snapshot(canvas)).not.toBe(shaded);
});

test('domain inputs resample and reject an inverted range', async ({ page }) => {
	await page.goto('/calculators/graph3d/');

	await page.locator('#g3-expr').fill('x + y');
	// the boxes commit on change, i.e. on blur or Enter — fill() alone only
	// fires input, so each edit is followed by a blur here as a user's would be
	for (const [id, value] of [
		['#g3-xmin', '0'],
		['#g3-xmax', '3'],
		['#g3-ymin', '0'],
		['#g3-ymax', '3'],
	]) {
		await page.locator(id as string).fill(value as string);
		await page.locator(id as string).blur();
	}
	// x + y over [0, 3]² peaks at 6, in the far corner
	await expect(page.locator('#g3-readout')).toContainText('6 @ (3, 3)');

	await page.locator('#g3-xmax').fill('-9');
	await page.locator('#g3-xmax').blur();
	await expect(page.locator('#g3-error')).toContainText('max > min');
});

test('the readout follows the language switch', async ({ page }) => {
	await page.goto('/calculators/graph3d/');

	const readout = page.locator('#g3-readout');
	await expect(readout.locator('.i18n-en').first()).toBeVisible();
	await expect(readout.locator('.i18n-zh').first()).toBeHidden();

	await page.locator('.t-lang').first().click();
	await expect(page.locator('html')).toHaveAttribute('data-lang', 'zh');
	await expect(readout.locator('.i18n-zh').first()).toBeVisible();
	await expect(readout.locator('.i18n-en').first()).toBeHidden();
});
