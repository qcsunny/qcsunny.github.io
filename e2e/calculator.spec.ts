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

test('evaluates built-in constants including phi, gamma, and c with unicode aliases', async ({ page }) => {
	await page.goto('/calculators/standard/');

	const display = page.locator('#calc-display');
	const preview = page.locator('#calc-preview');

	// Test phi (golden ratio: ~1.61803398875)
	await display.fill('φ');
	await display.press('Enter');
	await expect(preview).toHaveText(/φ = 1\.61803398875/);

	// Test gamma (Euler-Mascheroni: ~0.577215664902)
	await display.fill('γ');
	await display.press('Enter');
	await expect(preview).toHaveText(/γ = 0\.577215664902/);

	// Test c (speed of light: 299792458)
	await display.fill('c');
	await display.press('Enter');
	await expect(preview).toHaveText('c = 299792458');

	// Test implicit multiplication: 2phi
	await display.fill('2phi');
	await display.press('Enter');
	await expect(preview).toHaveText(/2phi = 3\.2360679775/);
});

test('evaluates nCr, nPr, gcd, and supports fraction display and a/b toggle', async ({ page }) => {
	await page.goto('/calculators/standard/');

	const display = page.locator('#calc-display');
	const preview = page.locator('#calc-preview');

	// Test nCr(5, 2) = 10
	await display.fill('nCr(5, 2)');
	await display.press('Enter');
	await expect(preview).toHaveText('nCr(5, 2) = 10');
	await expect(display).toHaveValue('10');

	// Test gcd(48, 180) = 12
	await display.fill('gcd(48, 180)');
	await display.press('Enter');
	await expect(preview).toHaveText('gcd(48, 180) = 12');

	// Test fraction display: 1/4 + 1/8 = 0.375 [3/8]
	await display.fill('1/4 + 1/8');
	await display.press('Enter');
	await expect(preview).toHaveText('1/4 + 1/8 = 0.375 [3/8]');
	await expect(display).toHaveValue('0.375');

	// Switch to scientific mode to access a/b button
	await page.locator('#calc-mode-scientific').click();
	const fracBtn = page.locator('.calc-keypad-sci button', { hasText: 'a/b' });
	await expect(fracBtn).toBeVisible();

	// Click a/b to convert 0.375 to 3/8 in display
	await fracBtn.click();
	await expect(display).toHaveValue('3/8');

	// Click a/b again to convert back to decimal
	await fracBtn.click();
	await expect(display).toHaveValue('0.375');
});

test('equation-solver computes limits (sin(x)/x -> 0), ODEs, and quadratic vertex', async ({ page }) => {
	await page.goto('/calculators/equation-solver/');
	const results = page.locator('.t-results');

	// 1. Check default quadratic solving: x^2 - 5x + 6 = 0 -> roots 3, 2, vertex
	await expect(results).toContainText('Root x₁');
	await expect(results).toContainText('3');
	await expect(results).toContainText('2');
	await expect(results).toContainText('Vertex (xv, yv)');

	// Test smart preset chip click: 2x + 3y = 8, 5x - y = 3
	const linearChip = page.locator('.t-preset-btn', { hasText: '2x + 3y = 8' });
	await expect(linearChip).toBeVisible();
	await linearChip.click();
	await expect(results).toContainText('2x2 Linear System');
	await expect(results).toContainText('Solution for x');
	await expect(results).toContainText('1');
	await expect(results).toContainText('Solution for y');
	await expect(results).toContainText('2');

	// Test custom linear equation: 4x - 8 = 0
	await page.locator('#t-f-eq').fill('4x - 8 = 0');
	await expect(results).toContainText('Linear Equation in x');
	await expect(results).toContainText('2');

	// 2. Select Limit calculation
	await page.locator('#t-f-type').selectOption('limit');

	// Verify defaults: sin(x)/x at x0 = 0 -> limit = 1
	await expect(results).toContainText('Two-sided Limit lim(x → 0) f(x)');
	await expect(results).toContainText('1');

	// Test one-sided limit: 1/x as x -> 0+
	await page.locator('#t-f-limExpr').fill('1/x');
	await page.locator('#t-f-limDir').selectOption('right');
	await expect(results).toContainText('Right-sided Limit lim(x → 0⁺) f(x)');

	// 3. Test ODE (Runge-Kutta 4th order)
	await page.locator('#t-f-type').selectOption('ode');
	await expect(results).toContainText('y(1)');
	await expect(results).toContainText('Numerical Solution');
});

test('matrix computes 2x2 eigenvalues and eigenvectors', async ({ page }) => {
	await page.goto('/calculators/matrix/');
	const results = page.locator('.t-results');

	// Matrix [[4, 1], [2, 3]] -> eigenvalues 5 and 2
	await page.locator('#t-f-matA').fill('4  1\n2  3');

	await expect(results).toContainText('Eigenvalues (λ₁, λ₂)');
	await expect(results).toContainText('5');
	await expect(results).toContainText('2');
	await expect(results).toContainText('Eigenvectors');
});

test('complex-number calculator computes rectangular, polar, and operations', async ({ page }) => {
	await page.goto('/calculators/complex-number/');
	const results = page.locator('.t-results');

	// Default 3 + 4i -> Modulus 5
	await expect(results).toContainText('Modulus |z₁|');
	await expect(results).toContainText('5');
	await expect(results).toContainText('Polar / Euler form');
	await expect(results).toContainText('Conjugate');
	await expect(results).toContainText('3 − 4i');

	// Sum with z2 = 2 + 1i -> 5 + 5i
	await page.locator('#t-f-a2').fill('2');
	await page.locator('#t-f-b2').fill('1');
	await expect(results).toContainText('Addition z₁ + z₂');
	await expect(results).toContainText('5 + 5i');
});

test('vector calculator computes dot and cross products in 3D', async ({ page }) => {
	await page.goto('/calculators/vector/');
	const results = page.locator('.t-results');

	// Default u = [1, 2, 3], v = [4, 5, 6]
	// Dot product = 1*4 + 2*5 + 3*6 = 32
	await expect(results).toContainText('Dot Product u · v');
	await expect(results).toContainText('32');
	// Cross product = (-3, 6, -3)
	await expect(results).toContainText('Cross Product u × v');
	await expect(results).toContainText('(-3, 6, -3)');
});

test('2D and 3D graphers have responsive fullscreen toggle buttons', async ({ page }) => {
	await page.goto('/calculators/graph/');
	const graphFs = page.locator('#graph-fs');
	await expect(graphFs).toBeVisible();
	await graphFs.click();
	await expect(page.locator('.graph-tab')).toHaveClass(/is-fullscreen/);
	await graphFs.click();
	await expect(page.locator('.graph-tab')).not.toHaveClass(/is-fullscreen/);

	await page.goto('/calculators/graph3d/');
	const g3Fs = page.locator('#g3-fs');
	await expect(g3Fs).toBeVisible();
	await g3Fs.click();
	await expect(page.locator('.g3')).toHaveClass(/is-fullscreen/);
	await g3Fs.click();
	await expect(page.locator('.g3')).not.toHaveClass(/is-fullscreen/);
});

test('2D grapher supports implicit curves, complex domain coloring, and vector field modes', async ({ page }) => {
	await page.goto('/calculators/graph/');
	const modeSelect = page.locator('#graph-mode');
	await expect(modeSelect).toBeVisible();

	// 1. Cartesian with implicit curve x^2 + y^2 = 25
	const input = page.locator('.graph-row input[type="text"]').first();
	await input.fill('x^2 + y^2 = 25');
	await page.waitForTimeout(200);
	await expect(page.locator('.row-error')).toBeEmpty();

	// 2. Switch to Complex Domain
	await modeSelect.selectOption('complex');
	await page.waitForTimeout(200);
	await expect(modeSelect).toHaveValue('complex');

	// 3. Switch to Vector Field
	await modeSelect.selectOption('vector');
	await page.waitForTimeout(200);
	await expect(modeSelect).toHaveValue('vector');
});

test('displays human-readable MathML formula preview in real-time', async ({ page }) => {
	await page.goto('/calculators/standard/');

	const display = page.locator('#calc-display');
	const formula = page.locator('#calc-formula');

	// Initially empty
	await expect(formula).toBeEmpty();

	// Typing fractions and radicals renders MathML elements
	await display.fill('(1 + sqrt(5)) / 2');
	await expect(formula.locator('math')).toBeVisible();
	await expect(formula.locator('mfrac')).toBeVisible();
	await expect(formula.locator('msqrt')).toBeVisible();

	// Clearing removes the formula preview
	await page.locator('.calc-keypad-standard button', { hasText: 'C' }).click();
	await expect(formula).toBeEmpty();
});

test('/ fraction button works on keypad and renders fraction preview', async ({ page }) => {
	await page.goto('/calculators/standard/');

	const display = page.locator('#calc-display');
	const key = (label: string) => page.locator('.calc-keypad-standard button', { hasText: label }).first();

	// Click 3 then / then 4
	await key('3').click();
	await key('/').click();
	await key('4').click();
	await expect(display).toHaveValue('3/4');

	// MathML formula preview renders fraction mfrac
	const formula = page.locator('#calc-formula');
	await expect(formula.locator('mfrac')).toBeVisible();

	await key('=').click();
	await expect(display).toHaveValue('0.75');
	await expect(page.locator('#calc-preview')).toHaveText(/3\/4 = 0\.75/);
});

