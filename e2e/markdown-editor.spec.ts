import { expect, test } from '@playwright/test';

const TOOL = '/text/markdown-preview/';

test('clicking H2 on a heading or line does not jump to text end', async ({ page }) => {
	await page.goto(TOOL);
	const editor = page.locator('.t-md-textarea');
	const h2Btn = page.getByRole('button', { name: 'H2' });

	// Initially editor should be at the top
	const initScroll = await editor.evaluate((el: HTMLTextAreaElement) => el.scrollTop);
	expect(initScroll).toBe(0);

	// Focus editor and set cursor at line 1 (start of document)
	await editor.evaluate((el: HTMLTextAreaElement) => {
		el.focus();
		el.setSelectionRange(0, 0);
	});

	// Click H2 button
	await h2Btn.click();

	// Cursor should still be near line 1, NOT at the end
	const posAfterH2 = await editor.evaluate((el: HTMLTextAreaElement) => ({
		start: el.selectionStart,
		end: el.selectionEnd,
		scroll: el.scrollTop,
		totalLen: el.value.length,
	}));

	expect(posAfterH2.start).toBeLessThan(100);
	expect(posAfterH2.scroll).toBe(0);

	// Position in middle of document
	await editor.evaluate((el: HTMLTextAreaElement) => {
		el.focus();
		const midPos = el.value.indexOf('### 2. 数学公式排版');
		if (midPos !== -1) {
			el.setSelectionRange(midPos, midPos);
		}
	});

	const midPosBefore = await editor.evaluate((el: HTMLTextAreaElement) => el.selectionStart);
	await h2Btn.click();

	const midPosAfter = await editor.evaluate((el: HTMLTextAreaElement) => ({
		start: el.selectionStart,
		totalLen: el.value.length,
	}));

	// Should not have jumped to the end of the 2000+ char document
	expect(midPosAfter.start).toBeLessThan(midPosBefore + 50);
	expect(midPosAfter.start).toBeGreaterThan(midPosBefore - 50);
});

test('clicking toolbar buttons preserves cursor on selection without jumping to end', async ({ page }) => {
	await page.goto(TOOL);
	const editor = page.locator('.t-md-textarea');
	const boldBtn = page.getByRole('button', { name: /B|粗体/ }).first();

	// Select a word near the top
	await editor.evaluate((el: HTMLTextAreaElement) => {
		el.focus();
		const idx = el.value.indexOf('Markdown');
		el.setSelectionRange(idx, idx + 8);
	});

	await boldBtn.click();

	const pos = await editor.evaluate((el: HTMLTextAreaElement) => ({
		start: el.selectionStart,
		end: el.selectionEnd,
		val: el.value.substring(el.selectionStart - 2, el.selectionEnd + 2),
		totalLen: el.value.length,
	}));

	expect(pos.val).toBe('**Markdown**');
	expect(pos.start).toBeLessThan(100);
});

test('exported HTML has clear code block contrast styles', async ({ page }) => {
	await page.goto(TOOL);
	const exportBtn = page.getByRole('button', { name: /Export HTML|导出 HTML/i });

	const [download] = await Promise.all([
		page.waitForEvent('download'),
		exportBtn.click(),
	]);

	const path = await download.path();
	expect(path).toBeTruthy();

	const { readFile } = await import('node:fs/promises');
	const html = await readFile(path!, 'utf-8');

	// Must style pre code with transparent background and light text
	expect(html).toContain('pre code { background: transparent !important; color: #f8fafc !important;');
	// Must style code box
	expect(html).toContain('.t-md-code-box { background: #0f172a;');
});
