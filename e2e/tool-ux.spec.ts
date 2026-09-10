// Regression tests for tool interactions that look "fine" in static HTML but
// broke silently in the past: the gamut slider's handle being yanked back
// mid-drag (the color round-trip rewrote the slider position), and the
// password generator's batch mode. Each is pinned by driving the real control.

import { test, expect } from '@playwright/test';

test('gamut slider keeps exactly the dragged value (no round-trip snap-back)', async ({ page }) => {
	await page.goto('/utilities/color-converter/');
	const slider = page.locator('#t-gamut-l');
	// Simulate a drag: several input events in sequence, each reading what the
	// handler chain left behind. The bug: update() rewrote slider.value from the
	// picked color's round-tripped L, drifting it away from the handle position.
	for (const v of ['0.3', '0.5', '0.8']) {
		await slider.evaluate((el, val) => {
			(el as HTMLInputElement).value = val;
			el.dispatchEvent(new Event('input', { bubbles: true }));
		}, v);
	}
	await expect(slider).toHaveValue('0.8');
	// The info line reports the slice at the slider's own L, not a drifted one.
	// (The WCAG card reuses .t-gamut-info — scope to the slice card itself.)
	await expect(page.locator('.t-gamut-card').first().locator('.t-gamut-info')).toContainText('L: 80.0%');
});

test('password generator batch mode emits exactly N lines, one per password', async ({ page }) => {
	await page.goto('/devtools/password-generator/');
	await page.locator('.t-countsel').selectOption('5');
	const multi = page.locator('.t-passmulti');
	await expect(multi).toBeVisible();
	const lines = (await multi.inputValue()).split('\n');
	expect(lines).toHaveLength(5);
	expect(lines.every((l) => l.length > 0)).toBe(true);
	// Count 1 returns to the single crisp line to copy-paste.
	await page.locator('.t-countsel').selectOption('1');
	await expect(page.locator('.t-passout')).toBeVisible();
	await expect(multi).toBeHidden();
});
