// Interactive HTML Formatter & Minifier:
// - Hierarchical indentation with 2 or 4 spaces
// - Awareness of HTML void/self-closing elements (meta, link, img, input, br, hr, etc.)
// - Minify HTML (strips comments, redundant whitespace between tags)
// - 100% in-browser, zero dependencies, zero network requests.

import { createWorkbench, formatBytes } from './workbench';

const VOID_ELEMENTS = new Set([
	'area',
	'base',
	'br',
	'col',
	'embed',
	'hr',
	'img',
	'input',
	'link',
	'meta',
	'param',
	'source',
	'track',
	'wbr'
]);

const SAMPLE_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>QCSunny Lab</title>
<link rel="stylesheet" href="/style.css">
</head>
<body>
<header>
<h1>欢迎使用在线工具集</h1>
<nav><a href="/">首页</a><a href="/tools/">工具</a></nav>
</header>
<main>
<p>所有工具均为纯浏览器本地渲染，<b>零数据上传</b>。</p>
</main>
</body>
</html>`;

function formatHtml(html: string, indentSize = 2): string {
	const indentStr = ' '.repeat(indentSize);
	const clean = html
		.replace(/(>)\s*(<)/g, '$1\n$2')
		.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/\n/g, ' '))
		.trim();

	const lines = clean.split('\n');
	let formatted = '';
	let pad = 0;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i].trim();
		if (!line) continue;

		// Closing tag </tag>
		if (line.match(/^<\/\w/)) {
			pad = Math.max(0, pad - 1);
		}

		formatted += indentStr.repeat(pad) + line + '\n';

		// Opening tag <tag>
		const tagMatch = line.match(/^<([a-zA-Z0-9\-]+)[^>]*>/);
		if (tagMatch) {
			const tagName = tagMatch[1].toLowerCase();
			const isSelfClosing = line.endsWith('/>') || VOID_ELEMENTS.has(tagName);
			const closesOnSameLine = line.includes(`</${tagName}>`);
			const isDoctypeOrComment = line.startsWith('<!') || line.startsWith('<?');

			if (!isSelfClosing && !closesOnSameLine && !isDoctypeOrComment) {
				pad++;
			}
		}
	}

	return formatted.trim();
}

function minifyHtml(html: string): string {
	return html
		.replace(/<!--[\s\S]*?-->/g, '') // remove comments
		.replace(/\s+/g, ' ') // collapse whitespaces
		.replace(/>\s+</g, '><') // remove spaces between tags
		.trim();
}

export function initHtml(host: HTMLElement): void {
	let wb: ReturnType<typeof createWorkbench>;

	function doFormat(indent: number) {
		const raw = wb.inputArea.value.trim();
		if (!raw) {
			wb.outputArea.value = '';
			wb.updateStatus('idle', '准备就绪：输入或粘贴 HTML 代码后将自动排版。');
			return;
		}

		try {
			const formatted = formatHtml(raw, indent);
			wb.outputArea.value = formatted;
			const origBytes = new TextEncoder().encode(raw).length;
			const fmtBytes = new TextEncoder().encode(formatted).length;
			const lineCount = formatted.split('\n').length;
			wb.updateStatus(
				'valid',
				`✓ HTML 格式化完成 · 共 ${lineCount} 行 · 原始大小: ${formatBytes(origBytes)} · 格式化后: ${formatBytes(fmtBytes)}`
			);
		} catch (err) {
			const msg = err instanceof Error ? err.message : 'HTML 格式化失败';
			wb.updateStatus('error', `✗ 格式化出错: ${msg}`);
		}
	}

	function doMinify() {
		const raw = wb.inputArea.value.trim();
		if (!raw) return;

		try {
			const minified = minifyHtml(raw);
			wb.outputArea.value = minified;
			const orig = new TextEncoder().encode(raw).length;
			const mini = new TextEncoder().encode(minified).length;
			const saved = orig > 0 ? (((orig - mini) / orig) * 100).toFixed(1) : '0';
			wb.updateStatus(
				'valid',
				`✓ Minified to single-line HTML · Compressed from ${formatBytes(orig)} to ${formatBytes(mini)} (${saved}% saved)`,
				`✓ 已压缩为单行 HTML · 大小从 ${formatBytes(orig)} 压缩至 ${formatBytes(mini)} (减小 ${saved}%)`
			);
		} catch (err) {
			const msg = err instanceof Error ? err.message : 'HTML minification failed';
			wb.updateStatus('error', `✗ Minify error: ${msg}`, `✗ 压缩出错: ${msg}`);
		}
	}

	wb = createWorkbench({
		host,
		inputTitle: 'Input HTML Code',
		inputTitleZh: '输入 HTML 代码',
		outputTitle: 'Formatted / Minified Output',
		outputTitleZh: '格式化 / 压缩结果',
		inputPlaceholder: 'Paste HTML code here...',
		inputPlaceholderZh: '在此粘贴 HTML 代码...',
		outputPlaceholder: 'Beautified HTML code will appear here...',
		outputPlaceholderZh: '美化后的 HTML 代码将显示在此处...',
		fileAccept: '.html,.htm,.txt,text/html',
		fileDefaultName: `index-${Date.now()}.html`,
		downloadLabel: '💾 Download .html',
		downloadLabelZh: '💾 下载 .html',
		buttons: [
			{ label: 'Format (2 spaces)', labelZh: '格式化 (2 空格)', primary: true, onClick: () => doFormat(2) },
			{ label: 'Format (4 spaces)', labelZh: '格式化 (4 空格)', primary: false, onClick: () => doFormat(4) },
			{ label: 'Minify', labelZh: '单行压缩', primary: false, onClick: doMinify }
		],
		onInput: () => doFormat(2),
		onSample: () => {
			wb.inputArea.value = SAMPLE_HTML;
			doFormat(2);
		},
		onClear: () => {
			wb.inputArea.value = '';
			wb.outputArea.value = '';
			wb.updateStatus('idle', 'Cleared', '已清空');
		},
		initialStatus: 'Ready: Paste HTML code to format tags and minify with one click.',
		initialStatusZh: '准备就绪：输入或粘贴 HTML 后将自动分层缩进并支持单行压缩。'
	});
}
