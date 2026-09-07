import { expect, test } from '@playwright/test';

// Prime factorization (a /calculators/ form tool) pins the mainstream route:
// small-prime trial division + deterministic Miller–Rabin + Pollard's rho.
// The old every-integer trial division was ~3.4 s on a prime near 2^53; these
// must finish well inside the default 5 s timeout (they take ~ms), so the test
// doubles as a regression guard against someone reverting to brute force.

test('factorizes the default and a typed value', async ({ page }) => {
	await page.goto('/calculators/prime-factorization/');
	const results = page.locator('.t-results');

	// default 360 = 2^3 × 3^2 × 5, τ(360) = (3+1)(2+1)(1+1) = 24
	await expect(results).toContainText('2^3 × 3^2 × 5');
	await expect(results).toContainText('24');

	// 97 is prime → single factor, 2 divisors
	await page.fill('#t-f-number', '97');
	await expect(results).toContainText('97');
	await expect(results).toContainText('2');
});

test('handles the full 2^53 range fast — prime and semiprime', async ({ page }) => {
	await page.goto('/calculators/prime-factorization/');
	const results = page.locator('.t-results');

	// Prime just under 2^53: must report itself (divisors 2), not hang ~3 s.
	await page.fill('#t-f-number', '9007199254740881');
	await expect(results).toContainText('9007199254740881');

	// Semiprime with two ~9×10^7 factors: the real Pollard-rho workload.
	await page.fill('#t-f-number', '8099098200010019');
	await expect(results).toContainText('89989981 × 89999999');
	await expect(results).toContainText('4');
});

test('rejects non-integers and values below 2', async ({ page }) => {
	await page.goto('/calculators/prime-factorization/');
	const results = page.locator('.t-results');

	await page.fill('#t-f-number', '1');
	await expect(results).toContainText('enter a whole number ≥ 2');

	// a decimal is not a whole number
	await page.fill('#t-f-number', '12.5');
	await expect(results).toContainText('enter a whole number ≥ 2');
});
