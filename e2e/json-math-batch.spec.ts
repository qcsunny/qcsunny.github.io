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
	await page.goto('/text/json-diff/');
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

test('pi calculator renders through the async compute path and guards out of range', async ({ page }) => {
	await page.goto('/calculators/pi/');
	const results = page.locator('.t-results');

	// pi-calculator is the registry's only async compute(): form.ts renders the
	// rows in a .then() off the main flow, so the result is written on a later
	// task. Every read here must auto-wait — a synchronous innerText() would hit
	// the same empty-window race the toml bases assertion did.
	await expect(results).toContainText('3.14159265358979323846264338327950288419716939937510');
	await expect(results).toContainText(/Calculation Time|计算耗时/);

	// The stale-compute guard: a superseded compute must not overwrite the row
	// the current input produced.
	await page.fill('#t-f-digits', '0');
	await expect(results).toContainText(/enter an integer between 1 and 1000000|请输入 1 到 1000000/);

	// Every advertised number on this page must agree with that guard. The field's
	// max attribute, the hint in BOTH languages and the top preset all say
	// 1,000,000, and nothing claims more. Before this the copy said "10,000,000+"
	// in fifteen places across calculators.ts and content.ts while the engine
	// rejected d > 1000000 and the presets stopped at 1,000,000, so typing
	// 5,000,000 threw an error against a field advertising ten million - and no
	// test asserted any of the fifteen, so it could never have been noticed.
	// Pin both halves of each bilingual span: toHaveText reads textContent, so the
	// display:none half is still checked and the assertion survives a lang flip.
	const digitsField = page.locator('.t-field', { has: page.locator('#t-f-digits') });
	await expect(page.locator('#t-f-digits')).toHaveAttribute('max', '1000000');
	await expect(digitsField.locator('.t-hint')).toHaveText(/1 to 1,000,000/);
	await expect(digitsField.locator('.t-hint')).toHaveText(/支持 1 到 1,000,000 位/);
	await expect(digitsField.locator('.t-presets')).toHaveText(/1,000,000 digits \(1M Extreme\)/);
	// The positive toContainText below also anchors this: a negative assertion
	// alone could pass on an empty body, so prove the copy is there first.
	await expect(page.locator('body')).toContainText(/1,000,000 decimal places/);
	await expect(page.locator('body')).not.toContainText(/10,000,000|1,000,000\+|超 100 万位/);
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
