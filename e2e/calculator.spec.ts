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


// Typing has to chain exactly like the keypad, or the two ways of driving the
// calculator disagree about what the box holds.

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
