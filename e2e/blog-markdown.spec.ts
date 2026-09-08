import { expect, test } from "@playwright/test";

const MARKDOWN_POST = "/blog/markdown-parser-and-katex-math/";

// The processor normalizes maths in headings before Sätteri creates heading
// metadata. Code spans must be opaque during that pass: their dollar signs,
// backslashes and tildes are source text, not formula or prose delimiters.
test("heading code spans survive normalization in the heading and TOC", async ({
  page,
}) => {
  await page.goto(MARKDOWN_POST);

  const heading = page
    .locator("h2")
    .filter({ hasText: "这个美元号是钱还是数学" });
  await expect(heading).toHaveCount(1);
  await expect(heading).toHaveText("5. $5 或 $10：这个美元号是钱还是数学");
  await expect(heading.locator("code")).toHaveText("$5 或 $10");
  await expect(heading.locator(".katex")).toHaveCount(0);

  const id = await heading.getAttribute("id");
  expect(id).toBeTruthy();
  await expect(page.locator(`.toc [data-toc-target="${id}"]`)).toHaveText(
    "5. $5 或 $10：这个美元号是钱还是数学",
  );
});

test("negated congruence uses the real text symbol", async ({ page }) => {
  await page.goto("/blog/prime-factorization-and-pollard-brent/");

  const paragraph = page.locator('.prose li').filter({
    hasText: '若随机选取底数',
  });
  await expect(paragraph).toContainText('≢');
  await expect(paragraph.locator('.katex svg')).toHaveCount(0);
  await expect(paragraph).not.toContainText('');
});

test("math heading fallbacks remain readable plain text", async ({ page }) => {
  await page.goto("/blog/prime-factorization-and-pollard-brent/");

  const complexity = page.locator("h3").filter({ hasText: "生日悖论与" });
  await expect(complexity).toContainText("O(n¹/⁴)");
  await expect(complexity.locator(".katex")).toHaveCount(0);

  const distinction = page.locator("h3").filter({ hasText: "知道至少有" });
  await expect(distinction).toContainText("≠");
  await expect(distinction.locator(".katex")).toHaveCount(0);
});

test("\\text macro in a heading unwraps to plain text, not LaTeX source", async ({ page }) => {
  // markdown-processor.mjs unwraps \text{…} in headings before the generic $…$
  // strip, so $101,325\text{ Pa}$ renders as "101,325 Pa" in both the heading
  // and the TOC — never as the raw \text{ Pa} source.
  await page.goto("/blog/engineering-pressure-units-gauge-vs-absolute/");

  const heading = page.locator("h2").filter({ hasText: "标准大气压" });
  await expect(heading).toHaveText("2. 国际标准大气压（101,325 Pa）与 760 mmHg 的定义微差");
  await expect(heading.locator(".katex")).toHaveCount(0);
  await expect(heading).not.toContainText("\\text");

  const id = await heading.getAttribute("id");
  expect(id).toBeTruthy();
  await expect(page.locator(`.toc [data-toc-target="${id}"]`)).toHaveText(
    "2. 国际标准大气压（101,325 Pa）与 760 mmHg 的定义微差",
  );
});
