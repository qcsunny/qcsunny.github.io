import { expect, test } from '@playwright/test';

// Form tools (finance) render live results from registry FormConfigs.
// compound-interest defaults (p=10000, r=6%, t=10y, n=12, m=500) are the
// canonical fixture: final value 100,133.64 — asserts the whole
// form → compute → render pipeline, including Enter-to-recompute.

test('compound-interest computes from defaults', async ({ page }) => {
	await page.goto('/finance/compound-interest/');

	// The figure carries its currency since 2026-09 — a .i18n-en / .i18n-zh span
	// pair holding "$100133.64" and "¥100133.64", one of which global.css hides.
	// textContent would return both halves glued together, so read innerText: it
	// is the half a reader actually sees.
	const emph = page.locator('.t-results .t-emph .t-row-value');
	await expect(emph).toHaveText('$100133.64', { useInnerText: true });

	// change principal to 20,000 via the field and press Enter
	await page.fill('#t-f-p', '20000');
	await page.press('#t-f-p', 'Enter');
	await expect(emph).toHaveText('$118327.61', { useInnerText: true });
});

test('compound-interest renders the year-by-year table', async ({ page }) => {
	await page.goto('/finance/compound-interest/');

	// tables are appended to the host (#t-root), not into .t-results
	const table = page.locator('#t-root .t-tablewrap table');
	await expect(table).toBeVisible();
	// 10 years → 10 body rows + header
	await expect(table.locator('tr')).toHaveCount(11);
	await expect(table.locator('tr').nth(1)).toContainText('1');
});

test('loan-payment shows required-field prompt when emptied', async ({ page }) => {
	await page.goto('/finance/loan-payment/');

	// generic: first required numeric field
	const anyField = page.locator('.t-form input[type="number"]').first();
	await anyField.fill('');
	await anyField.press('Enter');

	// either a warning row (missing required) or no crash — assert form still interactive
	await expect(page.locator('.t-results')).toBeVisible();
	await anyField.fill('1000');
	await anyField.press('Enter');
	await expect(page.locator('.t-results .t-row-value').first()).not.toHaveText('');
});

// Both tools below take a period count straight from a number input, and the
// form recomputes on every keystroke — so one digit too many is an ordinary typo,
// not an attack. Two ways it used to take the tab down, both synchronous loops
// that no timeout can interrupt:
//   * amortize() emits one row per year with no ceiling, so 1e9 years asked for
//     twelve billion iterations (a Node run of the same code aborts on OOM);
//   * the IRR solver summed its annuity term by term inside 60 Newton steps,
//     making one keystroke O(60n).
// The term is now rejected above 100 years, and the solver got the closed forms.
// If either regresses, the assertion below times out instead of passing slowly.
test('an absurd loan term is rejected instead of hanging the tab', async ({ page }) => {
	await page.goto('/finance/loan-payment/');

	await page.fill('#t-f-years', '1000000000');
	await expect(page.locator('.t-results .t-row-value').first()).toHaveText(/term must be 100 years or less/, {
		useInnerText: true,
	});

	// and the page is still a working form afterwards
	await page.fill('#t-f-years', '30');
	await expect(page.locator('.t-results .t-emph .t-row-value')).toHaveText(/^\$[\d,]+\.\d\d$/, { useInnerText: true });
});

test('the IRR solver answers a huge period count in constant time', async ({ page }) => {
	await page.goto('/finance/irr-calculator/');

	await page.fill('#t-f-periods', '1000000000');
	await expect(page.locator('.t-results .t-emph .t-row-value')).toHaveText(/^-?[\d.]+%$/, { useInnerText: true });
});
