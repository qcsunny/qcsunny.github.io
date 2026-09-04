import { expect, test } from '@playwright/test';

// Regression test: keypad buttons on /calculators/standard must insert into the
// display input. Broken in 97ca181 when BasicTab's #calc-panel-basic wrapper
// was removed but basic.ts kept binding to '#calc-panel-basic [data-ins]'.
test('keypad buttons type into the display', async ({ page }) => {
	await page.goto('/calculators/standard/');

	const display = page.locator('#calc-display');
	await expect(display).toBeVisible();

	// 2 + 3 = 5 via keypad only
	for (const key of ['2', '+', '3']) {
		await page.locator('.calc-keypad-standard button', { hasText: key }).first().click();
	}
	await expect(display).toHaveValue('2+3');

	await page.locator('.calc-keypad-standard button', { hasText: '=' }).click();
	await expect(page.locator('#calc-preview')).toHaveText('= 5');

	// display value is kept; = acts on it
	await expect(display).toHaveValue('2+3');
});

test('C and backspace actions work from the keypad', async ({ page }) => {
	await page.goto('/calculators/standard/');

	const display = page.locator('#calc-display');
	const keypad = page.locator('.calc-keypad-standard');

	for (const key of ['1', '2', '3']) {
		await keypad.locator('button', { hasText: '1' }).first().click();
	}
	await expect(display).toHaveValue('111');

	await keypad.locator('button', { hasText: '⌫' }).click();
	await expect(display).toHaveValue('11');

	await keypad.locator('button', { hasText: 'C' }).click();
	await expect(display).toHaveValue('');
	await expect(page.locator('#calc-preview')).toHaveText('');
});

test('Enter commits from the physical keyboard', async ({ page }) => {
	await page.goto('/calculators/standard/');

	const display = page.locator('#calc-display');
	await display.fill('6*7');
	await display.press('Enter');
	await expect(page.locator('#calc-preview')).toHaveText('= 42');
});

test('scientific keypad keys insert functions', async ({ page }) => {
	await page.goto('/calculators/standard/');

	await page.locator('#calc-mode-scientific').click();
	const sci = page.locator('.calc-keypad-sci');
	await expect(sci).toBeVisible();

	await sci.locator('button', { hasText: 'sin' }).click();
	await expect(page.locator('#calc-display')).toHaveValue('sin(');

	// default mode is radians (5207e45)
	await page.locator('#calc-display').fill('sin(pi/2)');
	await page.locator('#calc-display').press('Enter');
	await expect(page.locator('#calc-preview')).toHaveText('= 1');
});
