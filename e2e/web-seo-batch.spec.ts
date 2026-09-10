// The PR-4 Web/SEO batch: http status lookup, MIME lookup, UA parser,
// media-info (binary fileTransform), robots.txt and sitemap.xml
// generate/validate, and the meta/OG widget with share-card preview.

import { test, expect } from '@playwright/test';

test('http status lookup: by code and by keyword', async ({ page }) => {
	await page.goto('/devtools/http-status-lookup/');
	const input = page.locator('textarea[data-role="input"]');
	const output = page.locator('textarea[data-role="output"]');

	await input.fill('404');
	await page.getByRole('button', { name: /Look up|查询/ }).click();
	const out = await output.inputValue();
	expect(out).toContain('404 Not Found');
	expect(out).toContain('未找到');
	expect(out).toContain('Typical causes');

	await input.fill('redirect');
	await page.getByRole('button', { name: /Look up|查询/ }).click();
	const family = await output.inputValue();
	expect(family).toContain('301');
	expect(family).toContain('308');
});

test('mime lookup works in both directions', async ({ page }) => {
	await page.goto('/devtools/mime-type-lookup/');
	const input = page.locator('textarea[data-role="input"]');
	const output = page.locator('textarea[data-role="output"]');

	await input.fill('.woff2');
	await page.getByRole('button', { name: /Extension → MIME/ }).click();
	await expect(output).toHaveValue(/font\/woff2/);

	await input.fill('application/pdf');
	await page.getByRole('button', { name: /MIME → extensions/ }).click();
	await expect(output).toHaveValue(/pdf/);
});

test('user-agent parser: live stats, full report, bot detection', async ({ page }) => {
	await page.goto('/devtools/user-agent-parser/');
	// Default UA is desktop Chrome: stats are live before any click.
	await expect(page.locator('.t-results')).toContainText('Chrome');
	await expect(page.locator('.t-results')).toContainText('Windows');

	await page.getByRole('button', { name: /Full report|完整报告/ }).click();
	await expect(page.locator('textarea[data-role="output"]')).toHaveValue(/Blink/);

	await page
		.locator('textarea[data-role="input"]')
		.fill('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)');
	await expect(page.locator('.t-results')).toContainText('YES');
});

test('media-info parses a dropped WAV locally', async ({ page }) => {
	await page.goto('/devtools/media-info/');
	// A minimal 2-second stereo 44.1 kHz 16-bit WAV, synthesized in the test.
	const sr = 44100;
	const dataBytes = sr * 2 * 2 * 2;
	const buf = new ArrayBuffer(44 + dataBytes);
	const dv = new DataView(buf);
	const str = (o: number, s: string) => {
		for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i));
	};
	str(0, 'RIFF');
	dv.setUint32(4, 36 + dataBytes, true);
	str(8, 'WAVE');
	str(12, 'fmt ');
	dv.setUint32(16, 16, true);
	dv.setUint16(20, 1, true);
	dv.setUint16(22, 2, true);
	dv.setUint32(24, sr, true);
	dv.setUint32(28, sr * 4, true);
	dv.setUint16(32, 4, true);
	dv.setUint16(34, 16, true);
	str(36, 'data');
	dv.setUint32(40, dataBytes, true);

	const chooser = page.waitForEvent('filechooser');
	await page.locator('.t-file-btn').click();
	await (await chooser).setFiles({ name: 'probe.wav', mimeType: 'audio/wav', buffer: Buffer.from(buf) });
	const output = page.locator('textarea[data-role="output"]');
	await expect(output).toHaveValue(/WAV/);
	await expect(output).toHaveValue(/2 ch/);
	await expect(output).toHaveValue(/44100 Hz/);
	await expect(output).toHaveValue(/0:02\.000/);
	// The privacy note is part of the report.
	await expect(output).toHaveValue(/本地解析/);
});

test('robots.txt: generate from DSL, lint catches typos', async ({ page }) => {
	await page.goto('/devtools/robots-txt-generator/');
	const input = page.locator('textarea[data-role="input"]');
	const output = page.locator('textarea[data-role="output"]');

	await page.getByRole('button', { name: /Generate robots\.txt/ }).click();
	const generated = await output.inputValue();
	expect(generated).toContain('User-agent: *');
	expect(generated).toContain('Disallow: /admin');
	expect(generated).toContain('Sitemap: https://example.com/sitemap.xml');

	await input.fill('user-agent: *\ndisalow: /oops');
	await page.getByRole('button', { name: /Validate|校验/ }).click();
	await expect(output).toHaveValue(/disalow|Unknown directive/);
});

test('sitemap.xml: generate then round-trip validate', async ({ page }) => {
	await page.goto('/devtools/sitemap-xml-generator/');
	const input = page.locator('textarea[data-role="input"]');
	const output = page.locator('textarea[data-role="output"]');

	await page.getByRole('button', { name: /Generate sitemap\.xml/ }).click();
	const xml = await output.inputValue();
	expect(xml).toContain('<urlset');
	expect(xml).toContain('<loc>https://example.com/</loc>');
	expect(xml).toContain('<lastmod>2026-09-01</lastmod>');

	await input.fill(xml.split('\n').slice(2).join('\n'));
	await page.getByRole('button', { name: /Validate|校验/ }).click();
	await expect(output).toHaveValue(/3/);
});

test('meta tag generator: tags and share-card preview live together', async ({ page }) => {
	await page.goto('/devtools/meta-tag-generator/');
	const inputs = page.locator('.t-metafields input');
	await inputs.nth(0).fill('My Example Page');
	await inputs.nth(1).fill('A description of the page.');
	await inputs.nth(2).fill('https://example.com/page');
	await inputs.nth(3).fill('https://example.com/og.png');
	await inputs.nth(4).fill('Example Site');

	const output = page.locator('textarea[data-role="output"]');
	await expect(output).toHaveValue(/<title>My Example Page<\/title>/);
	await expect(output).toHaveValue(/og:title/);
	await expect(output).toHaveValue(/og:image/);
	await expect(output).toHaveValue(/twitter:card/);

	// The preview card mirrors the fields.
	const card = page.locator('.t-ogcard');
	await expect(card).toContainText('EXAMPLE.COM');
	await expect(card).toContainText('My Example Page');

	// summary card = square-thumb layout, summary_large_image = banner.
	await page.locator('.t-metafields select').nth(1).selectOption('summary');
	await expect(page.locator('.t-ogcard-small')).toHaveCount(1);
});
