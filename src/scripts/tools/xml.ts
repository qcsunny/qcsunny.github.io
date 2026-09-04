// Interactive XML / SVG Formatter, Validator & Minifier:
// - Real-time XML syntax validation via native browser DOMParser
// - Exact line/column syntax error pinpointing
// - 2-space and 4-space hierarchical indentation
// - Minify XML (removes inter-tag whitespace, comments, redundant blanks)
// - 100% in-browser, zero dependencies, zero network requests.

import { createWorkbench, formatBytes } from './workbench';

const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<project name="QCSunny Lab" version="1.0">
<description>Free browser-based tools and developer blog</description>
<config>
<privacy localExecution="true" tracking="false"/>
<features>
<feature id="1">Instant Formatting</feature>
<feature id="2">Zero Data Upload</feature>
</features>
</config>
<author email="admin@qcsunny.org">QCSunny</author>
</project>`;

function validateXml(xml: string): { valid: boolean; error?: string } {
	const parser = new DOMParser();
	const doc = parser.parseFromString(xml, 'application/xml');
	const errorNode = doc.querySelector('parsererror');
	if (errorNode) {
		return { valid: false, error: errorNode.textContent || 'XML 语法解析错误' };
	}
	return { valid: true };
}

function formatXml(xml: string, indentSize = 2): string {
	const indentStr = ' '.repeat(indentSize);
	let formatted = '';
	let pad = 0;

	// Normalize spaces
	const clean = xml
		.replace(/(>)\s*(<)/g, '$1\n$2')
		.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/\n/g, ' '))
		.trim();

	const lines = clean.split('\n');

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i].trim();
		if (!line) continue;

		// Decrement indent for closing tags </tag>
		if (line.match(/^<\/\w/)) {
			pad = Math.max(0, pad - 1);
		}

		formatted += indentStr.repeat(pad) + line + '\n';

		// Increment indent for opening tags <tag> but NOT self-closing <tag/>, declarations <?xml?>, or comments <!-- -->
		if (
			line.match(/^<[\w:]+[^>]*[^\/]>/) &&
			!line.match(/^<\?/) &&
			!line.match(/^<!/) &&
			!line.match(/<\/[\w:]+>$/) // does not close on same line
		) {
			pad++;
		}
	}

	return formatted.trim();
}

function minifyXml(xml: string): string {
	return xml
		.replace(/<!--[\s\S]*?-->/g, '') // remove comments
		.replace(/\s+/g, ' ') // collapse whitespaces
		.replace(/>\s+</g, '><') // remove spaces between tags
		.trim();
}

export function initXml(host: HTMLElement): void {
	let wb: ReturnType<typeof createWorkbench>;

	function doFormat(indent: number) {
		const raw = wb.inputArea.value.trim();
		if (!raw) {
			wb.outputArea.value = '';
			wb.updateStatus('idle', '准备就绪：输入或粘贴 XML / SVG 报文后将自动校验并格式化。');
			return;
		}

		const validation = validateXml(raw);
		if (!validation.valid) {
			wb.updateStatus('error', `✗ XML 语法错误: ${validation.error}`);
			return;
		}

		try {
			const formatted = formatXml(raw, indent);
			wb.outputArea.value = formatted;
			const origBytes = new TextEncoder().encode(raw).length;
			const fmtBytes = new TextEncoder().encode(formatted).length;
			const lineCount = formatted.split('\n').length;
			wb.updateStatus(
				'valid',
				`✓ XML 校验通过 · 共 ${lineCount} 行 · 原始大小: ${formatBytes(origBytes)} · 格式化后: ${formatBytes(fmtBytes)}`
			);
		} catch (err) {
			const msg = err instanceof Error ? err.message : '格式化失败';
			wb.updateStatus('error', `✗ 格式化出错: ${msg}`);
		}
	}

	function doMinify() {
		const raw = wb.inputArea.value.trim();
		if (!raw) return;

		const validation = validateXml(raw);
		if (!validation.valid) {
			wb.updateStatus('error', `✗ XML 语法错误: ${validation.error}`);
			return;
		}

		try {
			const minified = minifyXml(raw);
			wb.outputArea.value = minified;
			const orig = new TextEncoder().encode(raw).length;
			const mini = new TextEncoder().encode(minified).length;
			const saved = orig > 0 ? (((orig - mini) / orig) * 100).toFixed(1) : '0';
			wb.updateStatus(
				'valid',
				`✓ 已压缩 XML · 大小从 ${formatBytes(orig)} 缩小至 ${formatBytes(mini)} (减小 ${saved}%)`
			);
		} catch (err) {
			const msg = err instanceof Error ? err.message : '压缩失败';
			wb.updateStatus('error', `✗ 压缩出错: ${msg}`);
		}
	}

	wb = createWorkbench({
		host,
		inputTitle: '输入 XML / SVG 报文',
		outputTitle: '格式化 / 压缩结果',
		inputPlaceholder: '在此粘贴 XML 或 SVG 代码...',
		outputPlaceholder: '美化后的 XML 将显示在此处...',
		fileAccept: '.xml,.svg,.rss,.txt,application/xml,text/xml',
		fileDefaultName: `formatted-${Date.now()}.xml`,
		buttons: [
			{ label: '格式化 (2 空格)', primary: true, onClick: () => doFormat(2) },
			{ label: '格式化 (4 空格)', primary: false, onClick: () => doFormat(4) },
			{ label: '压缩 (Minify)', primary: false, onClick: doMinify }
		],
		onInput: () => doFormat(2),
		onSample: () => {
			wb.inputArea.value = SAMPLE_XML;
			doFormat(2);
		},
		onClear: () => {
			wb.inputArea.value = '';
			wb.outputArea.value = '';
			wb.updateStatus('idle', '已清空');
		},
		initialStatus: '准备就绪：输入或粘贴 XML / SVG 报文后将自动通过 DOMParser 校验并排版。'
	});
}
