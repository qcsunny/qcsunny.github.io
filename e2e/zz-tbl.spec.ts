import { test } from '@playwright/test';
test('diag: table widths in prose', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const slug of ['static-site-byte-ledger', 'web-calculator', 'fire-movement-and-4-percent-rule-guide', 'sql-tokenizer-and-code-formatter']) {
    await page.goto(`/blog/${slug}/`);
    const r = await page.evaluate(() => {
      const prose = document.querySelector('.prose')!.getBoundingClientRect();
      const out: any = { prose: Math.round(prose.width), tables: [] as any[] };
      document.querySelectorAll('.prose table').forEach((t) => {
        const b = t.getBoundingClientRect();
        // scrollWidth > clientWidth means the table content is wider than its box
        out.tables.push({
          w: Math.round(b.width),
          scrollW: t.scrollWidth,
          clientW: t.clientWidth,
          clipped: t.scrollWidth > t.clientWidth + 1,
          cells: t.querySelectorAll('td').length,
        });
      });
      return out;
    });
    console.log(slug, JSON.stringify(r));
  }
});
