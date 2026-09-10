// The PR-2 text batch: line organizer, text extractor, slug generator. All
// three are TextConfig transforms, so each case is fill → click → pin the
// output — including the edge each tool exists for (natural sort, conservative
// URL matching, diacritic folding, CJK retention).

import { test, expect } from '@playwright/test';

test('line organizer cleans, dedupes and sorts naturally', async ({ page }) => {
	await page.goto('/devtools/line-organizer/');
	const input = page.locator('textarea[data-role="input"]');
	const output = page.locator('textarea[data-role="output"]');

	await input.fill('banana\napple\n  apple  \ncherry\n\nbanana');
	await page.getByRole('button', { name: /Clean \(trim|一键清理/ }).click();
	await expect(output).toHaveValue('banana\napple\ncherry');

	// Duplicate count is live before any click.
	await input.fill('a\na\nb');
	await expect(page.locator('.t-results')).toContainText('1');

	// Natural sort: v2 before v10, not string order.
	await input.fill('v10\nv2\nv1');
	await page.getByRole('button', { name: /Sort A → Z/ }).click();
	await expect(output).toHaveValue('v1\nv2\nv10');

	await page.getByRole('button', { name: /Sort by length|按长度排序/ }).click();
	await expect(output).toHaveValue('v1\nv2\nv10'.split('\n').sort((a, b) => a.length - b.length).join('\n'));
});

test('text extractor pulls urls and emails, bare domains excluded', async ({ page }) => {
	await page.goto('/devtools/text-extractor/');
	const input = page.locator('textarea[data-role="input"]');
	const output = page.locator('textarea[data-role="output"]');

	await input.fill('Mail alice@example.com. Docs: https://docs.example.com/guide#top and www.example.net/pricing\nbare example.com and utils-1.2.3.js are not links');
	await page.getByRole('button', { name: /Extract URLs|提取网址/ }).click();
	const urls = await output.inputValue();
	expect(urls).toContain('https://docs.example.com/guide#top');
	expect(urls).toContain('www.example.net/pricing');
	expect(urls).not.toContain('example.com\n'); // bare domain must stay out
	expect(urls).not.toContain('utils-1.2.3.js');

	await page.getByRole('button', { name: /Extract emails|提取邮箱/ }).click();
	await expect(output).toHaveValue('alice@example.com');

	await page.getByRole('button', { name: /Extract all|全部提取/ }).click();
	await expect(output).toHaveValue(/docs\.example\.com[\s\S]*alice@example\.com/);
});

test('slug generator folds diacritics and keeps CJK', async ({ page }) => {
	await page.goto('/devtools/slug-generator/');
	const input = page.locator('textarea[data-role="input"]');
	const output = page.locator('textarea[data-role="output"]');

	await input.fill('10 Tips for Writing Better CSS!');
	await page.getByRole('button', { name: /Slug \(kebab/ }).click();
	await expect(output).toHaveValue('10-tips-for-writing-better-css');

	await page.getByRole('button', { name: /Slug \(snake/ }).click();
	await expect(output).toHaveValue('10_tips_for_writing_better_css');

	await input.fill('Café über Niño — déjà vu!');
	await page.getByRole('button', { name: /Slug \(kebab/ }).click();
	await expect(output).toHaveValue('cafe-uber-nino-deja-vu');

	// A CJK title keeps its characters — stripping them would empty it.
	await input.fill('车贷背后的数字账');
	await page.getByRole('button', { name: /Slug \(kebab/ }).click();
	await expect(output).toHaveValue('车贷背后的数字账');
});
