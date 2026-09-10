// The PR-3 JSON + math batch: schema generator/validator, structural JSON
// diff, calculus, polynomial regression, probability distributions. Form-kind
// tools recompute live (fill and read), the schema tool is a workbench
// (click Generate / Validate).

import { test, expect } from '@playwright/test';

test('json schema generates draft-07 and validates with typed errors', async ({ page }) => {
	await page.goto('/devtools/json-schema/');
	const input = page.locator('textarea[data-role="input"]');
	const output = page.locator('textarea[data-role="output"]');

	await input.fill('{"name": "example", "version": 2, "price": 9.99, "tags": ["a", 1]}');
	await page.getByRole('button', { name: /Generate Schema|生成 Schema/ }).click();
	const schema = await output.inputValue();
	expect(schema).toContain('"type": "object"');
	expect(schema).toContain('"type": "integer"'); // version: 2
	expect(schema).toContain('"type": "number"'); // price: 9.99
	expect(schema).toContain('"anyOf"'); // mixed array ["a", 1]
	// Generation preloads the schema box so Validate is one click away.
	await expect(page.locator('#t-jsonschema')).toHaveValue(/"type": "object"/);
	await page.getByRole('button', { name: /Validate|校验/ }).click();
	await expect(output).toHaveValue(/[Vv]alid|通过/);

	// Break three fields and drop one key: errors must carry the JSON paths,
	// including the missing-required one.
	await input.fill('{"name": 42, "version": "two", "price": "cheap"}');
	await page.getByRole('button', { name: /Validate|校验/ }).click();
	const report = await output.inputValue();
	expect(report).toContain('$.version');
	expect(report).toContain('$.price');
	expect(report).toContain('missing required property "tags"');
	expect(report).toContain('4');
});

test('json diff reports structural changes by path, not by formatting', async ({ page }) => {
	await page.goto('/devtools/json-diff/');
	const results = page.locator('.t-results');
	const table = page.locator('.t-table');

	// Defaults differ: 1 changed + 1 added + 1 array-append.
	await expect(results).toContainText('Changed');
	await expect(table).toContainText('$.price');
	await expect(table).toContainText('$.deprecated');
	await expect(table).toContainText('$.tags[2]');

	// Same document, different formatting and key order → identical.
	await page
		.locator('#t-f-right')
		.fill('{ "price": 9.99, "name": "example", "tags": [ "a", "b" ], "version": "1.0.0" }');
	await expect(results).toContainText(/Identical|完全一致/);
});

test('calculus: derivative, integral and limit against closed forms', async ({ page }) => {
	await page.goto('/calculators/calculus/');
	const results = page.locator('.t-results');

	// d/dx x²·sin(x) at 1 = 2·sin(1) + cos(1) ≈ 2.2232
	await expect(results).toContainText('2.223');

	// ∫₀^π x²·sin(x) dx = π² − 4 ≈ 5.8696
	await page.selectOption('#t-f-mode', 'integral');
	await expect(results).toContainText('5.86');

	// lim x→0 sin(x)/x = 1, both sides
	await page.selectOption('#t-f-mode', 'limit');
	await page.fill('#t-f-fx', 'sin(x)/x');
	await page.fill('#t-f-x0', '0');
	await expect(results).toContainText(/both sides approach 1|趋于 1/);
});

test('polynomial regression recovers a quadratic', async ({ page }) => {
	await page.goto('/calculators/polynomial-regression/');
	const results = page.locator('.t-results');

	// Defaults are ~x² data; a degree-2 fit should recover a₂ ≈ 1 and R² > 0.99.
	await expect(results).toContainText('ŷ =');
	await expect(results).toContainText('R²');
	await expect(results).toContainText(/0\.99/);
	const text = await results.innerText();
	expect(text).toMatch(/x\^2/);
});

test('probability distribution: binomial and poisson closed forms', async ({ page }) => {
	await page.goto('/calculators/probability-distribution/');
	const results = page.locator('.t-results');

	// B(20, 0.5), k=5: P(X=5) = 0.014786, P(X≤5) = 0.020694
	await expect(results).toContainText('0.0147');
	await expect(results).toContainText('0.0206');

	// Poisson(3), k=5: P(X=5) = 0.100819, P(X≤5) = 0.916082
	await page.selectOption('#t-f-dist', 'poisson');
	await expect(results).toContainText('0.1008');
	await expect(results).toContainText('0.916');
});
