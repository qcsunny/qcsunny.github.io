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
	// the expression moves to the preview line and the box takes the result
	await expect(page.locator('#calc-preview')).toHaveText('2+3 = 5');
	await expect(display).toHaveValue('5');
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
	await expect(page.locator('#calc-preview')).toHaveText('6*7 = 42');
	await expect(display).toHaveValue('42');
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
	await expect(page.locator('#calc-preview')).toHaveText('sin(pi/2) = 1');
});

// A pocket calculator chains: after `=`, an operator continues from the result
// and a digit starts over. This one used to leave the *expression* in the box and
// show the result only on the preview line, so 6−3= followed by ×6 evaluated
// 6−3×6 = −12 instead of 3×6 = 18.
test('= leaves the result in the box, and an operator chains from it', async ({ page }) => {
	await page.goto('/calculators/standard/');

	const display = page.locator('#calc-display');
	const keypad = page.locator('.calc-keypad-standard');
	const key = (label: string) => keypad.locator('button', { hasText: label }).first();

	for (const label of ['6', '−', '3']) await key(label).click();
	await key('=').click();
	await expect(display).toHaveValue('3');

	await key('×').click();
	await expect(display).toHaveValue('3*');
	await key('6').click();
	await key('=').click();
	await expect(display).toHaveValue('18');
	await expect(page.locator('#calc-preview')).toHaveText('3*6 = 18');
});

test('a digit after = starts a new expression instead of appending', async ({ page }) => {
	await page.goto('/calculators/standard/');

	const display = page.locator('#calc-display');
	const keypad = page.locator('.calc-keypad-standard');
	const key = (label: string) => keypad.locator('button', { hasText: label }).first();

	for (const label of ['6', '−', '3']) await key(label).click();
	await key('=').click();
	await key('7').click();
	await expect(display).toHaveValue('7');
});

// Typing has to chain exactly like the keypad, or the two ways of driving the
// calculator disagree about what the box holds.
test('typed keys chain from the result the same way', async ({ page }) => {
	await page.goto('/calculators/standard/');

	const display = page.locator('#calc-display');
	await display.fill('6-3');
	await display.press('Enter');
	await expect(display).toHaveValue('3');

	await display.press('*');
	await display.press('6');
	await display.press('Enter');
	await expect(display).toHaveValue('18');

	await display.press('7');
	await expect(display).toHaveValue('7');
});

// The error line is the only prose on this display, so it ships as a span pair
// like the rest of the site rather than an English-only string.
test('an engine error is shown in the reader language', async ({ page }) => {
	await page.goto('/calculators/standard/');

	const display = page.locator('#calc-display');
	const preview = page.locator('#calc-preview');

	await display.fill('2+');
	await display.press('Enter');
	await expect(preview).toHaveClass(/err/);
	await expect(preview).toHaveText('Unexpected end of expression', { useInnerText: true });

	await page.locator('.t-lang').click();
	await expect(preview).toHaveText('表达式意外结束', { useInnerText: true });
});
