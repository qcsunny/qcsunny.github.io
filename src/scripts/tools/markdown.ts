// Interactive Markdown Live Editor & Previewer:
// - 100% in-browser, zero dependencies, zero network requests
// - Real-time GFM (GitHub Flavored Markdown) parsing:
//   * Headings with auto-generated IDs (# to ######)
//   * Tables with column alignments (:---, :---:, ---:)
//   * Task lists with interactive checkboxes (- [ ] / - [x])
//   * Fenced code blocks with language tags and copy button
//   * GitHub-style alert callouts (> [!NOTE], > [!TIP], > [!WARNING], > [!IMPORTANT], > [!CAUTION])
//   * Inline code, bold, italic, strikethrough, autolinks, images, blockquotes, horizontal rules
//   * Mathematical formula containers ($inline$ and $$display$$)
// - Toolbar with instant markdown syntax insertion and selection wrapping
// - View mode switcher: Split Screen (双栏) / Preview Only (仅预览) / Editor Only (仅编辑)
// - Word count, character count, CJK count, line count, and reading time estimate
// - Export to .md and standalone .html with styles
// - Proportional sync scrolling between editor and preview pane

import { formatBytes } from './workbench';

const SAMPLE_MARKDOWN = `# Markdown 实时渲染与编辑工具 (QCSunny Lab)

> [!TIP]
> 本工具完全基于**纯浏览器前端**运行，零第三方臃肿依赖，零服务器上传，**100% 保证文档隐私安全**。

欢迎使用高性能 Markdown 实时渲染器！左侧输入 Markdown 源码，右侧即时呈现专业排版效果。

---

## 1. 基础排版与文字修饰

你可以轻松书写 **加粗文本 (Bold)**、*斜体文字 (Italic)*、***粗斜体 (Bold Italic)***、~~删除线文本~~ 以及 \`inline code 行内代码\`。

甚至还能结合超链接与图片：
- 官方主页：[QCSunny Lab 首页](/)
- 工具库：[浏览 40+ 款实用工具](/tools/)

> **引用名言**：  
> “工欲善其事，必先利其器。”  
> 代码不仅是写给机器执行的，更是写给人阅读和维护的。

---

## 2. GitHub 风格提示框 (Alerts)

> [!NOTE]
> 这是一个普通信息提示框，适合记录背景上下文和额外说明。

> [!IMPORTANT]
> 核心重要规则：左侧编辑区支持按下 <kbd>Tab</kbd> 键自动缩进 2 个空格！

> [!WARNING]
> 离开页面前请记得通过下方按钮下载保存你的 \`.md\` 或 \`.html\` 文档。

---

## 3. GFM 数据表格展示

支持使用冒号精准控制列对齐（左对齐、居中、右对齐）：

| 工具类别 | 代表功能 | 运行环境 | 性能评价 |
| :--- | :---: | :---: | ---: |
| **金融计算** | 房贷对比 / IRR / 个税 | 纯浏览器端 | ⚡ 毫秒级 |
| **开发工具** | JSON / SQL / JWT / UUID | 本地运算 | 🚀 零网络延迟 |
| **单位换算** | 长度 / 重量 / 速度 / 温度 | 离线可用 | 🔒 100% 隐私 |
| **数学工具** | 科学计算 / 分数 / 函数图像 | Web API | 🎯 极简高效 |

---

## 4. 任务清单 (Task Lists)

- [x] 开发轻量高性能 Markdown 语法解析器
- [x] 支持 GitHub 风格 GFM 表格与警告块
- [x] 支持双栏分屏与双向同步滚动
- [x] 提供一键复制 HTML 与导出独立文件功能
- [ ] 享受沉浸式高效码字体验！

---

## 5. 代码块展示 (Code Blocks)

\`\`\`typescript
// TypeScript 快速示例
interface ToolItem {
  id: string;
  name: string;
  isClientSide: boolean;
}

const mdTool: ToolItem = {
  id: 'markdown-preview',
  name: 'Markdown Live Editor',
  isClientSide: true,
};

console.log(\`[Ready] \${mdTool.name} initialized safely!\`);
\`\`\`

---

## 6. 数学公式支持

支持单行与块级 LaTeX 风格数学公式表示：
$$E = mc^2$$
$$A = P \\left(1 + \\frac{r}{n}\\right)^{n \\cdot t}$$

祝你写作愉快！`;

// Escape HTML special characters
function escapeHtml(str: string): string {
	return str
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');
}

// Convert heading text to clean slug ID
function slugify(text: string): string {
	return text
		.toLowerCase()
		.replace(/<[^>]+>/g, '')
		.trim()
		.replace(/[^\w\u4e00-\u9fa5\-_]+/g, '-')
		.replace(/^-+|-+$/g, '') || 'heading';
}

// Core Markdown Parser (Zero-dependency GFM implementation)
export function parseMarkdownToHtml(markdown: string): string {
	const codeBlocks: string[] = [];
	const mathBlocks: string[] = [];

	let src = markdown.replace(/\r\n/g, '\n');

	// 1. Extract fenced code blocks
	src = src.replace(/```([a-zA-Z0-9_\-#+.]*)\n([\s\S]*?)```/g, (_, lang, code) => {
		const idx = codeBlocks.length;
		const safeLang = (lang || 'text').toLowerCase();
		const escapedCode = escapeHtml(code);
		codeBlocks.push(`
			<div class="t-md-code-box">
				<div class="t-md-code-bar">
					<span class="t-md-code-lang">${escapeHtml(safeLang)}</span>
					<button type="button" class="t-md-code-copy-btn" aria-label="Copy code">复制</button>
				</div>
				<pre><code class="language-${safeLang}">${escapedCode}</code></pre>
			</div>
		`);
		return `%%CODEBLOCK_${idx}%%`;
	});

	// 2. Extract block math $$ ... $$
	src = src.replace(/\$\$([\s\S]*?)\$\$/g, (_, math) => {
		const idx = mathBlocks.length;
		mathBlocks.push(`
			<div class="katex-display">
				<div class="formula-scroll">$$${escapeHtml(math.trim())}$$</div>
			</div>
		`);
		return `%%MATHBLOCK_${idx}%%`;
	});

	// Process line-by-line blocks
	const lines = src.split('\n');
	const output: string[] = [];

	let inList: 'ul' | 'ol' | null = null;
	let inTable = false;
	let tableHeaderDone = false;
	let tableAligns: Array<'left' | 'center' | 'right'> = [];
	let inBlockquote = false;
	let quoteBuffer: string[] = [];

	const flushList = () => {
		if (inList) {
			output.push(`</${inList}>`);
			inList = null;
		}
	};

	const flushTable = () => {
		if (inTable) {
			output.push('</tbody></table></div>');
			inTable = false;
			tableHeaderDone = false;
			tableAligns = [];
		}
	};

	const flushBlockquote = () => {
		if (inBlockquote) {
			const quoteContent = quoteBuffer.join('\n');
			quoteBuffer = [];
			inBlockquote = false;

			// Check GitHub alert syntax: [!NOTE], [!TIP], [!IMPORTANT], [!WARNING], [!CAUTION]
			const alertMatch = quoteContent.match(/^\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*(.*)$/im);
			if (alertMatch) {
				const alertType = alertMatch[1].toLowerCase();
				const restOfText = quoteContent.replace(/^\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*/i, '');
				const titles: Record<string, { icon: string; name: string }> = {
					note: { icon: 'ℹ️', name: 'Note' },
					tip: { icon: '💡', name: 'Tip' },
					important: { icon: '❗', name: 'Important' },
					warning: { icon: '⚠️', name: 'Warning' },
					caution: { icon: '🛑', name: 'Caution' }
				};
				const meta = titles[alertType] || { icon: 'ℹ️', name: 'Notice' };
				const innerHtml = parseInline(restOfText).replace(/\n/g, '<br>');
				output.push(`
					<div class="t-md-alert t-md-alert-${alertType}">
						<div class="t-md-alert-title"><span class="t-md-alert-icon">${meta.icon}</span> ${meta.name}</div>
						<div class="t-md-alert-body">${innerHtml}</div>
					</div>
				`);
			} else {
				const innerHtml = parseInline(quoteContent).replace(/\n/g, '<br>');
				output.push(`<blockquote><p>${innerHtml}</p></blockquote>`);
			}
		}
	};

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const trimmed = line.trim();

		// Horizontal rule: ---, ***, ___
		if (/^(\*{3,}|-{3,}|_{3,})$/.test(trimmed)) {
			flushList();
			flushTable();
			flushBlockquote();
			output.push('<hr>');
			continue;
		}

		// Headings: # to ######
		const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
		if (headingMatch) {
			flushList();
			flushTable();
			flushBlockquote();
			const level = headingMatch[1].length;
			const text = headingMatch[2].trim();
			const id = slugify(text);
			output.push(`<h${level} id="${id}">${parseInline(text)}</h${level}>`);
			continue;
		}

		// Blockquotes: > quote
		if (line.startsWith('>')) {
			flushList();
			flushTable();
			inBlockquote = true;
			quoteBuffer.push(line.replace(/^>\s?/, ''));
			continue;
		} else if (inBlockquote) {
			flushBlockquote();
		}

		// Table separator row: | :--- | :---: | ---: |
		const isTableSep = /^\|?\s*:?-+:?\s*(\|?\s*:?-+:?\s*)+\|?$/.test(trimmed);
		if (isTableSep && !tableHeaderDone && output.length > 0) {
			const prevLine = lines[i - 1]?.trim() || '';
			if (prevLine.includes('|')) {
				inTable = true;
				// Pop previous line as table header
				output.pop();
				const headerCells = prevLine.split('|').map((s) => s.trim()).filter((s, idx, arr) => {
					if (idx === 0 && prevLine.startsWith('|') && s === '') return false;
					if (idx === arr.length - 1 && prevLine.endsWith('|') && s === '') return false;
					return true;
				});

				tableAligns = trimmed.split('|').map((s) => s.trim()).filter((s, idx, arr) => {
					if (idx === 0 && trimmed.startsWith('|') && s === '') return false;
					if (idx === arr.length - 1 && trimmed.endsWith('|') && s === '') return false;
					return true;
				}).map((col) => {
					const left = col.startsWith(':');
					const right = col.endsWith(':');
					if (left && right) return 'center';
					if (right) return 'right';
					return 'left';
				});

				let headHtml = '<div class="t-md-table-wrap"><table><thead><tr>';
				headerCells.forEach((cell, idx) => {
					const align = tableAligns[idx] || 'left';
					headHtml += `<th style="text-align: ${align}">${parseInline(cell)}</th>`;
				});
				headHtml += '</tr></thead><tbody>';
				output.push(headHtml);
				tableHeaderDone = true;
				continue;
			}
		}

		// Table body rows
		if (inTable) {
			if (trimmed.includes('|')) {
				const cells = trimmed.split('|').map((s) => s.trim()).filter((s, idx, arr) => {
					if (idx === 0 && trimmed.startsWith('|') && s === '') return false;
					if (idx === arr.length - 1 && trimmed.endsWith('|') && s === '') return false;
					return true;
				});
				let rowHtml = '<tr>';
				cells.forEach((cell, idx) => {
					const align = tableAligns[idx] || 'left';
					rowHtml += `<td style="text-align: ${align}">${parseInline(cell)}</td>`;
				});
				rowHtml += '</tr>';
				output.push(rowHtml);
				continue;
			} else {
				flushTable();
			}
		}

		// Lists
		// Task lists: - [ ] or - [x]
		const taskMatch = line.match(/^(\s*)[-*+]\s+\[([ xX])\]\s+(.*)$/);
		if (taskMatch) {
			flushTable();
			flushBlockquote();
			if (inList !== 'ul') {
				flushList();
				inList = 'ul';
				output.push('<ul class="t-md-task-list">');
			}
			const checked = taskMatch[2].toLowerCase() === 'x';
			output.push(`
				<li class="t-md-task-item">
					<input type="checkbox" class="t-md-checkbox" ${checked ? 'checked' : ''} disabled />
					<span>${parseInline(taskMatch[3])}</span>
				</li>
			`);
			continue;
		}

		// Unordered list: - item or * item
		const ulMatch = line.match(/^(\s*)[-*+]\s+(.*)$/);
		if (ulMatch) {
			flushTable();
			flushBlockquote();
			if (inList !== 'ul') {
				flushList();
				inList = 'ul';
				output.push('<ul>');
			}
			output.push(`<li>${parseInline(ulMatch[2])}</li>`);
			continue;
		}

		// Ordered list: 1. item
		const olMatch = line.match(/^(\s*)\d+\.\s+(.*)$/);
		if (olMatch) {
			flushTable();
			flushBlockquote();
			if (inList !== 'ol') {
				flushList();
				inList = 'ol';
				output.push('<ol>');
			}
			output.push(`<li>${parseInline(olMatch[2])}</li>`);
			continue;
		}

		// Not a list item
		flushList();

		// Blank line
		if (!trimmed) {
			flushTable();
			flushBlockquote();
			continue;
		}

		// Placeholder blocks (code blocks, math blocks)
		if (trimmed.startsWith('%%CODEBLOCK_') || trimmed.startsWith('%%MATHBLOCK_')) {
			output.push(trimmed);
			continue;
		}

		// Regular paragraph
		output.push(`<p>${parseInline(line)}</p>`);
	}

	flushList();
	flushTable();
	flushBlockquote();

	let html = output.join('\n');

	// Restore code blocks
	html = html.replace(/%%CODEBLOCK_(\d+)%%/g, (_, idx) => codeBlocks[Number(idx)] || '');

	// Restore math blocks
	html = html.replace(/%%MATHBLOCK_(\d+)%%/g, (_, idx) => mathBlocks[Number(idx)] || '');

	return html;
}

// Inline formatting parser
function parseInline(text: string): string {
	let s = text;

	// Escape raw HTML inside inline text
	s = escapeHtml(s);

	// Inline code: `code`
	s = s.replace(/`([^`]+)`/g, '<code class="t-inline-code">$1</code>');

	// Inline math: $math$
	s = s.replace(/\$([^$]+)\$/g, '<code class="t-inline-math">$$$1$$</code>');

	// Images: ![alt](url "title")
	s = s.replace(/!\[([^\]]*)\]\(([^)]+?)(?:\s+"([^"]*)")?\)/g, (_, alt, url, title) => {
		const t = title ? ` title="${title}"` : '';
		return `<img src="${url}" alt="${alt}"${t} loading="lazy" class="t-md-img" />`;
	});

	// Links: [text](url "title")
	s = s.replace(/\[([^\]]+)\]\(([^)]+?)(?:\s+"([^"]*)")?\)/g, (_, label, url, title) => {
		const t = title ? ` title="${title}"` : '';
		return `<a href="${url}"${t} target="_blank" rel="noopener" class="t-md-link">${label}</a>`;
	});

	// Bold + Italic: ***text*** or ___text___
	s = s.replace(/(\*\*\*|___)(.*?)\1/g, '<strong><em>$2</em></strong>');

	// Bold: **text** or __text__
	s = s.replace(/(\*\*|__)(.*?)\1/g, '<strong>$2</strong>');

	// Italic: *text* or _text_
	s = s.replace(/(\*|_)(.*?)\1/g, '<em>$2</em>');

	// Strikethrough: ~~text~~
	s = s.replace(/~~(.*?)~~/g, '<del>$1</del>');

	// Autolinks: http:// or https://
	s = s.replace(/(^|[^"'])(https?:\/\/[^\s<]+)/g, '$1<a href="$2" target="_blank" rel="noopener" class="t-md-link">$2</a>');

	// Keyboard keys: <kbd>key</kbd>
	s = s.replace(/&lt;kbd&gt;(.*?)&lt;\/kbd&gt;/gi, '<kbd class="t-md-kbd">$1</kbd>');

	return s;
}

// Word count & reading statistics
export function calculateStats(text: string) {
	const totalChars = text.length;
	const lines = text ? text.split('\n').length : 0;
	const cjk = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
	const words = (text.match(/[a-zA-Z0-9_\-]+/g) || []).length;
	const totalWords = cjk + words;
	const readingMinutes = Math.max(1, Math.ceil(cjk / 350 + words / 200));
	const byteSize = new TextEncoder().encode(text).length;

	return {
		totalChars,
		cjk,
		words,
		totalWords,
		lines,
		readingMinutes,
		byteSize
	};
}

// Main Interactive Widget Initializer
export function initMarkdown(host: HTMLElement): void {
	host.innerHTML = '';

	const wrap = document.createElement('div');
	wrap.className = 't-md-container';

	// 1. Top Quick Action Toolbar
	const toolbar = document.createElement('div');
	toolbar.className = 't-md-toolbar';

	// Format Insertion Buttons
	const insertGroup = document.createElement('div');
	insertGroup.className = 't-md-tool-group';

	const actions = [
		{ label: 'B', title: '加粗 (Ctrl+B)', prefix: '**', suffix: '**', defaultText: '粗体文本' },
		{ label: 'I', title: '斜体 (Ctrl+I)', prefix: '*', suffix: '*', defaultText: '斜体文本' },
		{ label: 'S', title: '删除线', prefix: '~~', suffix: '~~', defaultText: '删除文本' },
		{ label: 'H1', title: '一级标题', prefix: '# ', suffix: '', defaultText: '标题' },
		{ label: 'H2', title: '二级标题', prefix: '## ', suffix: '', defaultText: '二级标题' },
		{ label: 'H3', title: '三级标题', prefix: '### ', suffix: '', defaultText: '三级标题' },
		{ label: '`代码`', title: '行内代码', prefix: '`', suffix: '`', defaultText: 'code' },
		{ label: '💻 代码块', title: '代码块', prefix: '```javascript\n', suffix: '\n```', defaultText: '// 粘贴或书写代码' },
		{ label: '🔗 链接', title: '插入链接', prefix: '[链接文字](', suffix: ')', defaultText: 'https://' },
		{ label: '🖼️ 图片', title: '插入图片', prefix: '![图片说明](', suffix: ')', defaultText: 'https://' },
		{ label: '📋 表格', title: '插入表格', prefix: '\n| 表头1 | 表头2 | 表头3 |\n| :--- | :---: | ---: |\n| 内容1 | 内容2 | 内容3 |\n', suffix: '', defaultText: '' },
		{ label: '☑️ 任务', title: '任务清单', prefix: '- [ ] ', suffix: '', defaultText: '待办任务' },
		{ label: '💡 提示框', title: 'GitHub 提示框', prefix: '> [!NOTE]\n> ', suffix: '', defaultText: '在此输入重要提示信息' },
		{ label: '📐 公式', title: '数学公式', prefix: '$$', suffix: '$$', defaultText: 'E = mc^2' },
		{ label: '➖ 分割线', title: '分割线', prefix: '\n---\n', suffix: '', defaultText: '' }
	];

	actions.forEach((act) => {
		const btn = document.createElement('button');
		btn.type = 'button';
		btn.className = 't-md-tool-btn';
		btn.textContent = act.label;
		btn.title = act.title;
		btn.addEventListener('click', () => {
			insertSyntax(act.prefix, act.suffix, act.defaultText);
		});
		insertGroup.appendChild(btn);
	});

	// View Modes
	const viewGroup = document.createElement('div');
	viewGroup.className = 't-md-tool-group t-md-view-group';

	const viewModes = [
		{ id: 'split', label: '🌓 双栏分屏', active: true },
		{ id: 'preview', label: '👁️ 仅预览', active: false },
		{ id: 'editor', label: '✏️ 仅编辑', active: false }
	];

	viewModes.forEach((mode) => {
		const btn = document.createElement('button');
		btn.type = 'button';
		btn.className = `t-md-tool-btn t-md-view-btn ${mode.active ? 'is-active' : ''}`;
		btn.dataset.view = mode.id;
		btn.textContent = mode.label;
		btn.addEventListener('click', () => {
			viewGroup.querySelectorAll('.t-md-view-btn').forEach((b) => b.classList.remove('is-active'));
			btn.classList.add('is-active');
			applyViewMode(mode.id);
		});
		viewGroup.appendChild(btn);
	});

	// Document Actions
	const docGroup = document.createElement('div');
	docGroup.className = 't-md-tool-group';

	const sampleBtn = document.createElement('button');
	sampleBtn.type = 'button';
	sampleBtn.className = 't-md-tool-btn';
	sampleBtn.textContent = '📄 示例文档';
	sampleBtn.addEventListener('click', () => {
		editor.value = SAMPLE_MARKDOWN;
		render();
	});

	const copyHtmlBtn = document.createElement('button');
	copyHtmlBtn.type = 'button';
	copyHtmlBtn.className = 't-md-tool-btn t-md-btn-primary';
	copyHtmlBtn.textContent = '📋 复制 HTML';
	copyHtmlBtn.addEventListener('click', () => {
		const html = parseMarkdownToHtml(editor.value);
		navigator.clipboard.writeText(html).then(() => {
			copyHtmlBtn.textContent = '✓ 已复制 HTML!';
			setTimeout(() => { copyHtmlBtn.textContent = '📋 复制 HTML'; }, 1800);
		});
	});

	const copyMdBtn = document.createElement('button');
	copyMdBtn.type = 'button';
	copyMdBtn.className = 't-md-tool-btn';
	copyMdBtn.textContent = '📋 复制 MD';
	copyMdBtn.addEventListener('click', () => {
		navigator.clipboard.writeText(editor.value).then(() => {
			copyMdBtn.textContent = '✓ 已复制 MD!';
			setTimeout(() => { copyMdBtn.textContent = '📋 复制 MD'; }, 1800);
		});
	});

	const exportHtmlBtn = document.createElement('button');
	exportHtmlBtn.type = 'button';
	exportHtmlBtn.className = 't-md-tool-btn';
	exportHtmlBtn.textContent = '⬇️ 导出 HTML';
	exportHtmlBtn.addEventListener('click', () => {
		const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Exported Markdown Document</title>
<style>
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 860px; margin: 40px auto; padding: 0 20px; line-height: 1.8; color: #1e293b; background: #ffffff; }
h1, h2, h3, h4 { color: #0f172a; margin-top: 1.6em; margin-bottom: 0.6em; }
code { background: #f1f5f9; padding: 0.2em 0.4em; border-radius: 4px; font-family: monospace; }
pre { background: #0f172a; color: #f8fafc; padding: 1.2em; border-radius: 8px; overflow-x: auto; }
blockquote { border-left: 4px solid #3b82f6; background: #f8fafc; padding: 0.8em 1.2em; margin: 1.2em 0; }
table { width: 100%; border-collapse: collapse; margin: 1.4em 0; }
th, td { border: 1px solid #cbd5e1; padding: 0.6em 0.8em; }
th { background: #f1f5f9; }
hr { border: none; border-top: 1px solid #e2e8f0; margin: 2em 0; }
img { max-width: 100%; border-radius: 8px; }
</style>
</head>
<body>
${parseMarkdownToHtml(editor.value)}
</body>
</html>`;
		downloadFile(html, `document-${Date.now()}.html`, 'text/html');
	});

	const exportMdBtn = document.createElement('button');
	exportMdBtn.type = 'button';
	exportMdBtn.className = 't-md-tool-btn';
	exportMdBtn.textContent = '⬇️ 导出 .md';
	exportMdBtn.addEventListener('click', () => {
		downloadFile(editor.value, `document-${Date.now()}.md`, 'text/markdown');
	});

	const clearBtn = document.createElement('button');
	clearBtn.type = 'button';
	clearBtn.className = 't-md-tool-btn';
	clearBtn.textContent = '🗑️ 清空';
	clearBtn.addEventListener('click', () => {
		editor.value = '';
		render();
		editor.focus();
	});

	docGroup.append(sampleBtn, copyHtmlBtn, copyMdBtn, exportHtmlBtn, exportMdBtn, clearBtn);
	toolbar.append(insertGroup, viewGroup, docGroup);

	// 2. Main Work Area (Split Panels)
	const workArea = document.createElement('div');
	workArea.className = 't-md-panels t-md-split';

	// Left: Editor Panel
	const editorPanel = document.createElement('div');
	editorPanel.className = 't-md-panel t-md-panel-editor';

	const editorHead = document.createElement('div');
	editorHead.className = 't-md-panel-head';
	editorHead.innerHTML = '<span>✏️ Markdown 源码</span><span class="t-md-head-hint">支持快捷键 / Tab缩进</span>';

	const editor = document.createElement('textarea');
	editor.className = 't-md-textarea';
	editor.placeholder = '在此输入或粘贴 Markdown 源码...';
	editor.spellcheck = false;
	editor.value = SAMPLE_MARKDOWN;

	editorPanel.append(editorHead, editor);

	// Right: Preview Panel
	const previewPanel = document.createElement('div');
	previewPanel.className = 't-md-panel t-md-panel-preview';

	const previewHead = document.createElement('div');
	previewHead.className = 't-md-panel-head';
	previewHead.innerHTML = '<span>👁️ 实时排版渲染效果</span><span class="t-md-head-hint">GitHub 风格排版</span>';

	const preview = document.createElement('div');
	preview.className = 't-md-preview-body';

	previewPanel.append(previewHead, preview);
	workArea.append(editorPanel, previewPanel);

	// 3. Bottom Status & Statistics Bar
	const statusBar = document.createElement('div');
	statusBar.className = 't-md-status-bar';

	const statsEl = document.createElement('div');
	statsEl.className = 't-md-stats';

	const engineInfo = document.createElement('div');
	engineInfo.className = 't-md-engine';
	engineInfo.innerHTML = '✓ 本地极速渲染 · 100% 浏览器隐私保护 · 零服务器上传';

	statusBar.append(statsEl, engineInfo);

	wrap.append(toolbar, workArea, statusBar);
	host.append(wrap);

	// Helpers
	function insertSyntax(prefix: string, suffix: string, defaultText: string) {
		const start = editor.selectionStart;
		const end = editor.selectionEnd;
		const val = editor.value;
		const selected = val.substring(start, end) || defaultText;
		const replacement = prefix + selected + suffix;

		editor.value = val.substring(0, start) + replacement + val.substring(end);
		editor.focus();
		editor.setSelectionRange(start + prefix.length, start + prefix.length + selected.length);
		render();
	}

	function applyViewMode(mode: string) {
		workArea.classList.remove('t-md-split', 't-md-preview-only', 't-md-editor-only');
		if (mode === 'preview') {
			workArea.classList.add('t-md-preview-only');
		} else if (mode === 'editor') {
			workArea.classList.add('t-md-editor-only');
		} else {
			workArea.classList.add('t-md-split');
		}
	}

	function downloadFile(content: string, filename: string, mime: string) {
		const blob = new Blob([content], { type: mime });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = filename;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	}

	function render() {
		const t0 = performance.now();
		const raw = editor.value;
		const html = parseMarkdownToHtml(raw);
		preview.innerHTML = html;
		const dt = (performance.now() - t0).toFixed(1);

		// Re-bind code copy buttons inside preview
		preview.querySelectorAll<HTMLButtonElement>('.t-md-code-copy-btn').forEach((btn) => {
			btn.addEventListener('click', () => {
				const codeEl = btn.closest('.t-md-code-box')?.querySelector('code');
				if (codeEl) {
					navigator.clipboard.writeText(codeEl.textContent || '').then(() => {
						btn.textContent = '✓ 已复制';
						setTimeout(() => { btn.textContent = '复制'; }, 1500);
					});
				}
			});
		});

		// Update Stats
		const stats = calculateStats(raw);
		statsEl.innerHTML = `
			<span>总字符数: <strong>${stats.totalChars.toLocaleString()}</strong></span>
			<span>汉字数: <strong>${stats.cjk.toLocaleString()}</strong></span>
			<span>单词数: <strong>${stats.words.toLocaleString()}</strong></span>
			<span>总行数: <strong>${stats.lines.toLocaleString()}</strong></span>
			<span>文件大小: <strong>${formatBytes(stats.byteSize)}</strong></span>
			<span>预估阅读: <strong>~${stats.readingMinutes} 分钟</strong></span>
		`;

		engineInfo.innerHTML = `✓ 渲染耗时: <strong>${dt}ms</strong> · 本地引擎 · 100% 浏览器隐私保护`;
	}

	// Tab key indentation support
	editor.addEventListener('keydown', (e) => {
		if (e.key === 'Tab') {
			e.preventDefault();
			const start = editor.selectionStart;
			const end = editor.selectionEnd;
			editor.value = editor.value.substring(0, start) + '  ' + editor.value.substring(end);
			editor.selectionStart = editor.selectionEnd = start + 2;
			render();
		} else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
			e.preventDefault();
			insertSyntax('**', '**', '粗体文本');
		} else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'i') {
			e.preventDefault();
			insertSyntax('*', '*', '斜体文本');
		}
	});

	// Proportional Synchronized Scroll
	let isEditorScrolling = false;
	let isPreviewScrolling = false;

	editor.addEventListener('scroll', () => {
		if (isPreviewScrolling) return;
		isEditorScrolling = true;
		const percentage = editor.scrollTop / (editor.scrollHeight - editor.clientHeight || 1);
		preview.scrollTop = percentage * (preview.scrollHeight - preview.clientHeight);
		setTimeout(() => { isEditorScrolling = false; }, 50);
	});

	preview.addEventListener('scroll', () => {
		if (isEditorScrolling) return;
		isPreviewScrolling = true;
		const percentage = preview.scrollTop / (preview.scrollHeight - preview.clientHeight || 1);
		editor.scrollTop = percentage * (editor.scrollHeight - editor.clientHeight);
		setTimeout(() => { isPreviewScrolling = false; }, 50);
	});

	editor.addEventListener('input', render);

	// Initial render
	render();
}
