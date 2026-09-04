// Interactive CSS Formatter & Minifier:
// - Format stylesheet rules with 2 or 4 spaces indentation
// - Semicolon and colon spacing normalization
// - Minify CSS to single line (strips comments, spaces, trailing semicolons)
// - 100% in-browser, zero dependencies, zero network transmission.

import { createWorkbench, formatBytes } from './workbench';

const SAMPLE_CSS = `/* Navigation Styles */
header.site-header { position: sticky; top: 0; z-index: 100; background: #ffffff; border-bottom: 1px solid #e5e7eb; }
.nav-container { max-width: 1200px; margin: 0 auto; display: flex; align-items: center; justify-content: space-between; padding: 1rem 1.5rem; }
.nav-links a { color: #4b5563; text-decoration: none; font-weight: 500; transition: color 0.2s ease; }
.nav-links a:hover { color: #2563eb; }
@media (max-width: 768px) {
.nav-container { flex-direction: column; gap: 0.5rem; }
.nav-links { display: none; }
}`;

function formatCss(css: string, indentSize = 2): string {
	const indentStr = ' '.repeat(indentSize);
	let clean = css
		.replace(/\/\*[\s\S]*?\*\//g, (m) => m + '\n') // keep comments on their own lines
		.replace(/\s+/g, ' ')
		.trim();

	let result = '';
	let indentLevel = 0;
	let inComment = false;

	for (let i = 0; i < clean.length; i++) {
		const c = clean[i];

		if (c === '/' && clean[i + 1] === '*') {
			inComment = true;
			result += '/*';
			i++;
			continue;
		}

		if (inComment) {
			result += c;
			if (c === '*' && clean[i + 1] === '/') {
				inComment = false;
				result += '/\n' + indentStr.repeat(indentLevel);
				i++;
			}
			continue;
		}

		if (c === '{') {
			result = result.trimEnd() + ' {\n';
			indentLevel++;
			result += indentStr.repeat(indentLevel);
			continue;
		}

		if (c === ';') {
			result += ';\n' + indentStr.repeat(indentLevel);
			continue;
		}

		if (c === '}') {
			indentLevel = Math.max(0, indentLevel - 1);
			result = result.trimEnd() + '\n' + indentStr.repeat(indentLevel) + '}\n\n';
			result += indentStr.repeat(indentLevel);
			continue;
		}

		if (c === ':') {
			result += ': ';
			// skip extra spaces after colon
			while (clean[i + 1] === ' ') i++;
			continue;
		}

		result += c;
	}

	return result.trim();
}

function minifyCss(css: string): string {
	return css
		.replace(/\/\*[\s\S]*?\*\//g, '') // remove comments
		.replace(/\s+/g, ' ') // collapse whitespaces
		.replace(/\s*([\{\}:;,])\s*/g, '$1') // remove spaces around punctuation
		.replace(/;}/g, '}') // remove trailing semicolon
		.trim();
}

export function initCss(host: HTMLElement): void {
	let wb: ReturnType<typeof createWorkbench>;

	function doFormat(indent: number) {
		const raw = wb.inputArea.value.trim();
		if (!raw) {
			wb.outputArea.value = '';
			wb.updateStatus('idle', '准备就绪：输入或粘贴 CSS 代码后将自动格式化。');
			return;
		}

		try {
			const formatted = formatCss(raw, indent);
			wb.outputArea.value = formatted;
			const origBytes = new TextEncoder().encode(raw).length;
			const fmtBytes = new TextEncoder().encode(formatted).length;
			const lineCount = formatted.split('\n').length;
			wb.updateStatus(
				'valid',
				`✓ CSS 格式化完成 · 共 ${lineCount} 行 · 原始大小: ${formatBytes(origBytes)} · 格式化后: ${formatBytes(fmtBytes)}`
			);
		} catch (err) {
			const msg = err instanceof Error ? err.message : 'CSS 格式化失败';
			wb.updateStatus('error', `✗ 格式化出错: ${msg}`);
		}
	}

	function doMinify() {
		const raw = wb.inputArea.value.trim();
		if (!raw) return;

		try {
			const minified = minifyCss(raw);
			wb.outputArea.value = minified;
			const orig = new TextEncoder().encode(raw).length;
			const mini = new TextEncoder().encode(minified).length;
			const saved = orig > 0 ? (((orig - mini) / orig) * 100).toFixed(1) : '0';
			wb.updateStatus(
				'valid',
				`✓ 已压缩为单行 CSS · 大小从 ${formatBytes(orig)} 压缩至 ${formatBytes(mini)} (减小 ${saved}%)`
			);
		} catch (err) {
			const msg = err instanceof Error ? err.message : 'CSS 压缩失败';
			wb.updateStatus('error', `✗ 压缩出错: ${msg}`);
		}
	}

	wb = createWorkbench({
		host,
		inputTitle: '输入 CSS 样式代码',
		outputTitle: '格式化 / 压缩结果',
		inputPlaceholder: '在此粘贴 CSS 样式代码...',
		outputPlaceholder: '美化后的 CSS 代码将显示在此处...',
		fileAccept: '.css,.txt,text/css',
		fileDefaultName: `style-${Date.now()}.css`,
		buttons: [
			{ label: '格式化 (2 空格)', primary: true, onClick: () => doFormat(2) },
			{ label: '格式化 (4 空格)', primary: false, onClick: () => doFormat(4) },
			{ label: '单行压缩 (Minify)', primary: false, onClick: doMinify }
		],
		onInput: () => doFormat(2),
		onSample: () => {
			wb.inputArea.value = SAMPLE_CSS;
			doFormat(2);
		},
		onClear: () => {
			wb.inputArea.value = '';
			wb.outputArea.value = '';
			wb.updateStatus('idle', '已清空');
		},
		initialStatus: '准备就绪：输入或粘贴 CSS 样式后将自动美化对齐并支持一键压缩。'
	});
}
