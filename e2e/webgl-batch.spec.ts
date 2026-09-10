// The PR-6 WebGL batch: Mandelbrot/Julia explorer and the GPU convolution
// lab. Both render on canvas, so the assertions read pixels back through
// WebGL rather than trusting that "something drew".

import { test, expect } from '@playwright/test';

test('mandelbrot renders, zooms and switches to julia', async ({ browser }) => {
	const ctx = await browser.newContext();
	const page = await ctx.newPage();
	await page.setViewportSize({ width: 1200, height: 900 });
	await page.goto('/devtools/mandelbrot-explorer/');
	await page.waitForSelector('.t-fractal-canvas');
	await page.waitForTimeout(800);

	const read = (x: number, y: number, w: number, h: number): Promise<string> =>
		page.evaluate(([x0, y0, w0, h0]) => {
			const c = document.querySelector('.t-fractal-canvas') as HTMLCanvasElement;
			const gl = c.getContext('webgl') as WebGLRenderingContext;
			const px = new Uint8Array(4 * w0 * h0);
			gl.readPixels(x0, y0, w0, h0, gl.RGBA, gl.UNSIGNED_BYTE, px);
			return Array.from(px).join(',');
		}, [x, y, w, h]);

	// A row above the cardioid carries many colors — the escape-time bands.
	const row = await page.evaluate(() => {
		const c = document.querySelector('.t-fractal-canvas') as HTMLCanvasElement;
		const gl = c.getContext('webgl') as WebGLRenderingContext;
		const px = new Uint8Array(4 * 100);
		gl.readPixels(Math.floor(c.width / 2) - 50, Math.floor(c.height * 0.28), 100, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
		return new Set(Array.from({ length: 100 }, (_, i) => `${px[i * 4]},${px[i * 4 + 1]},${px[i * 4 + 2]}`)).size;
	});
	expect(row).toBeGreaterThan(5);

	const before = await read(10, 10, 1, 1);
	await page.mouse.move(600, 350);
	await page.mouse.wheel(0, -600);
	await page.waitForTimeout(400);
	const zoomed = await read(10, 10, 1, 1);
	expect(zoomed).not.toBe(before);

	await page.click('button:has-text("Julia")');
	await page.waitForTimeout(400);
	const julia = await read(10, 10, 1, 1);
	expect(julia).not.toBe(zoomed);
	await ctx.close();
});

test('image filter lab convolves live from an editable kernel', async ({ browser }) => {
	const ctx = await browser.newContext();
	const page = await ctx.newPage();
	await page.goto('/devtools/image-filter-lab/');
	await page.waitForSelector('.t-kernel-grid input');
	await page.waitForTimeout(800);

	// 9 kernel cells; the sample image is already on the texture.
	expect(await page.locator('.t-kernel-grid input').count()).toBe(9);

	const read = (): Promise<string> =>
		page.evaluate(() => {
			const c = document.querySelector('.t-fractal-canvas') as HTMLCanvasElement;
			const gl = c.getContext('webgl') as WebGLRenderingContext;
			const px = new Uint8Array(4 * 60);
			gl.readPixels(5, 5, 60, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
			return Array.from(px).join(',');
		});

	const identity = await read();
	await page.click('button:has-text("Blur")');
	await page.waitForTimeout(300);
	const blurred = await read();
	expect(blurred).not.toBe(identity);

	// Editing a cell by hand re-filters immediately (sharpen minus center
	// weight → all edges, visibly different from blur).
	const cells = page.locator('.t-kernel-grid input');
	await cells.nth(4).fill('-8');
	await page.waitForTimeout(300);
	const inverted = await read();
	expect(inverted).not.toBe(blurred);

	await expect(page.locator('.t-filter-ctrl .t-file-privacy')).toContainText(/上传|uploaded/);
	await ctx.close();
});
