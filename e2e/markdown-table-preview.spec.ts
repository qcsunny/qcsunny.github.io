import { expect, test } from '@playwright/test';

const TOOL = '/text/markdown-table-formatter/';

test('markdown table formatter renders live table preview on load and updates on input', async ({ page }) => {
	await page.goto(TOOL);

	const preview = page.locator('.t-preview-box[data-role="preview"]');
	await expect(preview).toBeVisible();

	// Check table rendered from default value
	const table = preview.locator('table');
	await expect(table).toBeVisible();

	const headers = await table.locator('th').allTextContents();
	expect(headers).toEqual(['Name', 'Role']);

	const rows = table.locator('tbody tr');
	await expect(rows).toHaveCount(2);

	const firstRowCells = await rows.first().locator('td').allTextContents();
	expect(firstRowCells).toEqual(['Alice', 'admin']);

	// Test clearing
	const clearBtn = page.getByRole('button', { name: /Clear|清空/i });
	await clearBtn.click();

	await expect(preview.locator('.t-table-empty')).toBeVisible();

	// Test entering a new table with alignment and formatting
	const input = page.locator('textarea[data-role="input"]');
	await input.fill(
		'| Item | Status | Price |\n|:---|:---:|---:|\n| **MacBook** | `Ready` | $1999 |\n| iPhone | Shipped | $999 |\n'
	);

	await expect(table).toBeVisible();
	const newHeaders = await table.locator('th').allTextContents();
	expect(newHeaders).toEqual(['Item', 'Status', 'Price']);

	// Check alignment styles
	const thAligns = await table.locator('th').evaluateAll((ths) => ths.map((th) => th.style.textAlign));
	expect(thAligns).toEqual(['left', 'center', 'right']);

	// Check bold and inline code in cells
	const boldCell = table.locator('strong');
	await expect(boldCell).toHaveText('MacBook');

	const codeCell = table.locator('code');
	await expect(codeCell).toHaveText('Ready');
});
