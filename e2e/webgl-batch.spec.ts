// The PR-6 WebGL batch: Mandelbrot/Julia explorer and the GPU convolution
// lab. Both render on canvas, so the assertions read pixels back through
// WebGL rather than trusting that "something drew".

import { test, expect } from '@playwright/test';

test('mandelbrot renders, zooms and switches to julia', async ({ browser }) => {
	const ctx = await browser.newContext();
	const page = await ctx.newPage();
	await page.setViewportSize({ width: 1200, height: 900 });
	await page.goto('/fun/mandelbrot-explorer/');
	await page.waitForSelector('.t-fractal-canvas');

	const read = (x: number, y: number, w: number, h: number): Promise<string> =>
		page.evaluate(([x0, y0, w0, h0]) => {
			const c = document.querySelector('.t-fractal-canvas') as HTMLCanvasElement;
			const gl = c.getContext('webgl') as WebGLRenderingContext;
			const px = new Uint8Array(4 * w0 * h0);
			gl.readPixels(x0, y0, w0, h0, gl.RGBA, gl.UNSIGNED_BYTE, px);
			return Array.from(px).join(',');
		}, [x, y, w, h]);

	// A row above the cardioid carries many colors — the escape-time bands.
	// The canvas is in the DOM the moment the script mounts it, but the first
	// frame only lands once the GL program has compiled and the fractal has
	// been drawn. Poll the pixels instead of sleeping: config sets retries: 0,
	// so a sleep that is too short reads the still-empty buffer and the test
	// fails as an isolated red with no clue why.
	await expect
		.poll(
			() =>
				page.evaluate(() => {
					const c = document.querySelector('.t-fractal-canvas') as HTMLCanvasElement;
					const gl = c.getContext('webgl') as WebGLRenderingContext;
					const px = new Uint8Array(4 * 100);
					gl.readPixels(Math.floor(c.width / 2) - 50, Math.floor(c.height * 0.28), 100, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
					return new Set(Array.from({ length: 100 }, (_, i) => `${px[i * 4]},${px[i * 4 + 1]},${px[i * 4 + 2]}`)).size;
				}),
			{ timeout: 15000 },
		)
		.toBeGreaterThan(5);

	const before = await read(10, 10, 1, 1);
	await page.mouse.move(600, 350);
	await page.mouse.wheel(0, -600);
	// Poll for the redraw, then sample the settled frame: a wheel zoom is a
	// one-shot draw, so the next read is what the viewer actually sees.
	await expect.poll(() => read(10, 10, 1, 1), { timeout: 15000 }).not.toBe(before);
	const zoomed = await read(10, 10, 1, 1);

	await page.click('button:has-text("Julia")');
	await expect.poll(() => read(10, 10, 1, 1), { timeout: 15000 }).not.toBe(zoomed);
	await ctx.close();
});

test('image filter lab convolves live from an editable kernel', async ({ browser }) => {
	const ctx = await browser.newContext();
	const page = await ctx.newPage();
	await page.goto('/media/image-filter-lab/');
	await page.waitForSelector('.t-kernel-grid input');

	// 9 kernel cells; the sample image is already on the texture.
	expect(await page.locator('.t-kernel-grid input').count()).toBe(9);

	const rowDiversity = (): Promise<number> =>
		page.evaluate(() => {
			const c = document.querySelector('.t-fractal-canvas') as HTMLCanvasElement;
			const gl = c.getContext('webgl') as WebGLRenderingContext;
			const px = new Uint8Array(4 * 60);
			gl.readPixels(5, 5, 60, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
			return new Set(Array.from(px)).size;
		});
	const read = (): Promise<string> =>
		page.evaluate(() => {
			const c = document.querySelector('.t-fractal-canvas') as HTMLCanvasElement;
			const gl = c.getContext('webgl') as WebGLRenderingContext;
			const px = new Uint8Array(4 * 60);
			gl.readPixels(5, 5, 60, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
			return Array.from(px).join(',');
		});

	// The kernel grid appears as soon as the control panel is built, but the
	// sample image is only on the texture once its upload has finished. A
	// uniform row (diversity <= 1) means the buffer is still empty, so poll
	// for the pixels rather than assuming 800ms was enough.
	await expect.poll(rowDiversity, { timeout: 15000 }).toBeGreaterThan(1);

	const identity = await read();
	await page.click('button:has-text("Blur")');
	await expect.poll(read, { timeout: 15000 }).not.toBe(identity);
	const blurred = await read();

	// Editing a cell by hand re-filters immediately (sharpen minus center
	// weight → all edges, visibly different from blur).
	const cells = page.locator('.t-kernel-grid input');
	await cells.nth(4).fill('-8');
	await expect.poll(read, { timeout: 15000 }).not.toBe(blurred);

	await expect(page.locator('.t-filter-ctrl .t-file-privacy')).toContainText(/上传|uploaded/);
	await ctx.close();
});
