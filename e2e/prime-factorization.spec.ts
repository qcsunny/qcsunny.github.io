import { expect, test } from '@playwright/test';

// Prime factorization (a /calculators/ form tool) pins the mainstream route:
// small-prime trial division + deterministic Miller–Rabin + Pollard's rho, fed
// by a BigInt text field (an <input type=number> would round above 2^53). The
// allowed range is 2..2^64−1; these boundary inputs must finish well inside the
// default 5 s timeout (they take ~ms), so the test doubles as a regression
// guard against someone reverting to brute-force trial division.

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

test('stays exact across the whole 2^53..2^64−1 range', async ({ page }) => {
	await page.goto('/calculators/prime-factorization/');
	const results = page.locator('.t-results');

	// Prime just under 2^53: reports itself, must not hang ~3 s.
	await page.fill('#t-f-number', '9007199254740881');
	await expect(results).toContainText('9007199254740881');

	// A square of a ~2^32 prime just under 2^64: the exact-power case rho must
	// still split, exponent shown as ^2, τ = 2+1 = 3.
	await page.fill('#t-f-number', '18446744030759878681');
	await expect(results).toContainText('4294967291^2');
	await expect(results).toContainText('3');

	// Largest prime below 2^64 (20 digits): BigInt input must not round it.
	await page.fill('#t-f-number', '18446744073709551557');
	await expect(results).toContainText('18446744073709551557');
	await expect(results).toContainText('2');
});

test('rejects non-integers and out-of-range values', async ({ page }) => {
	await page.goto('/calculators/prime-factorization/');
	const results = page.locator('.t-results');

	// below the minimum → compute guard message
	await page.fill('#t-f-number', '1');
	await expect(results).toContainText('2 to 2^64−1');

	// 2^64 itself is out of range
	await page.fill('#t-f-number', '18446744073709551616');
	await expect(results).toContainText('2 to 2^64−1');

	// a decimal is not digits: the field's own validation flags it (bigint
	// fields accept only [0-9]*), so the generic required prompt shows
	await page.fill('#t-f-number', '12.5');
	await expect(results.locator('.t-row-warn')).toBeVisible();
});
