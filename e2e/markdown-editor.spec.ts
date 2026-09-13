import { expect, test } from '@playwright/test';

const TOOL = '/text/markdown-preview/';

test('clicking H2 on a heading or line does not jump to text end', async ({ page }) => {
	await page.goto(TOOL);
	const editor = page.locator('.t-md-textarea');
	const h2Btn = page.getByRole('button', { name: 'H2' });

	// Initially editor should be at the top
	const initScroll = await editor.evaluate((el: HTMLTextAreaElement) => el.scrollTop);
	expect(initScroll).toBe(0);

	// Focus editor and set cursor at line 1 (start of document)
	await editor.evaluate((el: HTMLTextAreaElement) => {
		el.focus();
		el.setSelectionRange(0, 0);
	});

	// Click H2 button
	await h2Btn.click();

	// Cursor should still be near line 1, NOT at the end
	const posAfterH2 = await editor.evaluate((el: HTMLTextAreaElement) => ({
		start: el.selectionStart,
		end: el.selectionEnd,
		scroll: el.scrollTop,
		totalLen: el.value.length,
	}));

	expect(posAfterH2.start).toBeLessThan(100);
	expect(posAfterH2.scroll).toBe(0);

	// Position in middle of document
	await editor.evaluate((el: HTMLTextAreaElement) => {
		el.focus();
		const midPos = el.value.indexOf('### 2. 数学公式排版');
		if (midPos !== -1) {
			el.setSelectionRange(midPos, midPos);
		}
	});

	const midPosBefore = await editor.evaluate((el: HTMLTextAreaElement) => el.selectionStart);
	await h2Btn.click();

	const midPosAfter = await editor.evaluate((el: HTMLTextAreaElement) => ({
		start: el.selectionStart,
		totalLen: el.value.length,
	}));

	// Should not have jumped to the end of the 2000+ char document
	expect(midPosAfter.start).toBeLessThan(midPosBefore + 50);
	expect(midPosAfter.start).toBeGreaterThan(midPosBefore - 50);
});

test('clicking toolbar buttons preserves cursor on selection without jumping to end', async ({ page }) => {
	await page.goto(TOOL);
	const editor = page.locator('.t-md-textarea');
	const boldBtn = page.getByRole('button', { name: /B|粗体/ }).first();

	// Select a word near the top
	await editor.evaluate((el: HTMLTextAreaElement) => {
		el.focus();
		const idx = el.value.indexOf('Markdown');
		el.setSelectionRange(idx, idx + 8);
	});

	await boldBtn.click();

	const pos = await editor.evaluate((el: HTMLTextAreaElement) => ({
		start: el.selectionStart,
		end: el.selectionEnd,
		val: el.value.substring(el.selectionStart - 2, el.selectionEnd + 2),
		totalLen: el.value.length,
	}));

	expect(pos.val).toBe('**Markdown**');
	expect(pos.start).toBeLessThan(100);
});

test('exported HTML has clear code block contrast styles', async ({ page }) => {
	await page.goto(TOOL);
	const exportBtn = page.getByRole('button', { name: /Export HTML|导出 HTML/i });

	const [download] = await Promise.all([
		page.waitForEvent('download'),
		exportBtn.click(),
	]);

	const path = await download.path();
	expect(path).toBeTruthy();

	const { readFile } = await import('node:fs/promises');
	const html = await readFile(path!, 'utf-8');

	// Must style pre code with transparent background and light text
	expect(html).toContain('pre code { background: transparent !important; color: #f8fafc !important;');
	// Must style code box
	expect(html).toContain('.t-md-code-box { background: #0f172a;');
});

test('renders complex tables with alignments, CJK and formatting correctly', async ({ page }) => {
	await page.goto(TOOL);
	const editor = page.locator('.t-md-textarea');
	const complexTable = `| ID | 模块名称 / Module | 架构分类 | 核心技术栈与特性 | 响应时延 | 运行状态 | 并发能力 |
|:---:|:---|:---:|:---|---:|:---:|---:|
| 101 | **API Gateway** | 微服务 | OAuth2.0、\`JWT\` 鉴权、*多活容灾* | 12ms | 🟢 Ready | 50,000 QPS |
| 102 | **Vector DB** | 向量库 | Milvus、HNSW 索引、混合检索 | 35ms | 🟢 Ready | 12,000 QPS |
| 103 | **Task Scheduler** | 批处理 | 分布式分片、~~旧单机调度~~、CRON | 1,250ms | 🟡 Degraded | 1,500 Jobs/m |
| 104 | **Document OCR** | 计算密集 | 纯 WebAssembly 离线识别、表格提取 | 480ms | 🟢 Ready | 800 Pages/m |
| 105 | **Event Bus** | 消息中间件 | Kafka 集群、\`ack=all\`、Exactly-Once | 5ms | 🟢 Ready | 120,000 QPS |
| 106 | **Cache Proxy** | 缓存层 | Redis 集群、\`get | set\` 批量操作、分片预热 | 2ms | 🟢 Ready | 200,000 QPS |
`;

	await editor.fill(complexTable);

	const preview = page.locator('.t-md-preview-body');
	const table = preview.locator('table');
	await expect(table).toBeVisible();

	const headers = await table.locator('th').allTextContents();
	expect(headers).toHaveLength(7);
	expect(headers[1]).toBe('模块名称 / Module');

	const rows = table.locator('tbody tr');
	await expect(rows).toHaveCount(6);

	// Check alignments
	const thAligns = await table.locator('th').evaluateAll((ths) => ths.map((th) => th.style.textAlign));
	expect(thAligns).toEqual(['center', 'left', 'center', 'left', 'right', 'center', 'right']);

	// Check cell formatting in row 6 (code pipe, bold, etc.)
	const row6Cells = rows.nth(5).locator('td');
	await expect(row6Cells).toHaveCount(7);
	await expect(row6Cells.nth(1).locator('strong')).toHaveText('Cache Proxy');
	await expect(row6Cells.nth(3).locator('code')).toHaveText('get | set');
	await expect(row6Cells.nth(4)).toHaveCSS('text-align', 'right');
	await expect(row6Cells.nth(5)).toHaveCSS('text-align', 'center');
});

