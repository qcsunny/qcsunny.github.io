// Interactive JSON Formatter & Validator workbench:
// - Format (2 & 4 spaces), Minify, Escape / Unescape, Load Sample, Clear
// - Real-time syntax error locator (line/col) & size / keys statistics
// - File upload (.json) and download formatted .json
// - One-click clipboard copy with feedback
// - 100% responsive bilingual support (pure English in EN mode, pure Chinese in ZH mode)
// - Runs 100% in-browser with zero tracking.

import { bilingual, langAttr, langProp } from './i18n';
import { formatBytes } from './workbench';

const SAMPLE_JSON = {
	project: 'QCSunny Lab',
	version: '1.0.0',
	description: 'Free browser-based tools and developer blog',
	privacy: {
		localExecution: true,
		tracking: false,
		dataUploaded: false
	},
	categories: ['calculators', 'converters', 'finance', 'tools'],
	toolsCount: 49,
	verified: true
};

function countKeys(obj: unknown): number {
	if (obj === null || typeof obj !== 'object') return 0;
	let count = 0;
	if (Array.isArray(obj)) {
		for (const item of obj) count += countKeys(item);
	} else {
		const keys = Object.keys(obj as Record<string, unknown>);
		count += keys.length;
		for (const k of keys) {
			count += countKeys((obj as Record<string, unknown>)[k]);
		}
	}
	return count;
}

function getErrorPosition(errorMsg: string, text: string): { line?: number; col?: number } {
	const posMatch = errorMsg.match(/position\s+(\d+)/i);
	if (posMatch) {
		const pos = parseInt(posMatch[1], 10);
		const lines = text.slice(0, pos).split('\n');
		return { line: lines.length, col: lines[lines.length - 1].length + 1 };
	}
	const lineColMatch = errorMsg.match(/line\s+(\d+)\s+column\s+(\d+)/i);
	if (lineColMatch) {
		return { line: parseInt(lineColMatch[1], 10), col: parseInt(lineColMatch[2], 10) };
	}
	return {};
}

export function initJson(host: HTMLElement): void {
	host.innerHTML = '';

	const wrap = document.createElement('div');
	wrap.className = 't-json-wrap';

	// --- 1. Toolbar ---
	const toolbar = document.createElement('div');
	toolbar.className = 't-json-toolbar';

	function createBtn(labelEn: string, labelZh: string, isPrimary = false, onClick?: () => void): HTMLButtonElement {
		const btn = document.createElement('button');
		btn.type = 'button';
		btn.className = isPrimary ? 't-btn t-primary' : 't-btn';
		btn.append(bilingual(labelEn, labelZh));
		if (onClick) btn.addEventListener('click', onClick);
		return btn;
	}

	const btnFormat2 = createBtn('Format (2 spaces)', '格式化 (2 空格)', true, () => doFormat(2));
	const btnFormat4 = createBtn('Format (4 spaces)', '格式化 (4 空格)', false, () => doFormat(4));
	const btnMinify = createBtn('Minify', '压缩 (Minify)', false, doMinify);
	const btnEscape = createBtn('Escape', '转义 (Escape)', false, doEscape);
	const btnUnescape = createBtn('Unescape', '去转义 (Unescape)', false, doUnescape);
	const btnSample = createBtn('Sample Data', '示例数据', false, loadSample);
	const btnClear = createBtn('Clear', '清空', false, doClear);

	const sep = document.createElement('span');
	sep.className = 't-sep';

	toolbar.append(btnFormat2, btnFormat4, btnMinify, btnEscape, btnUnescape, sep, btnSample, btnClear);

	// --- 2. Status Banner ---
	const status = document.createElement('div');
	status.className = 't-json-status';

	// --- 3. Split Panels ---
	const panels = document.createElement('div');
	panels.className = 't-json-panels';

	// Left: Input
	const leftPanel = document.createElement('div');
	leftPanel.className = 't-json-panel';

	const leftHead = document.createElement('div');
	leftHead.className = 't-json-panel-head';
	const leftTitle = document.createElement('strong');
	leftTitle.append(bilingual('Input JSON', '输入 JSON'));

	const fileInput = document.createElement('input');
	fileInput.type = 'file';
	fileInput.accept = '.json,.txt,application/json,text/plain';
	fileInput.style.display = 'none';
	fileInput.addEventListener('change', (e) => {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = () => {
			inputArea.value = reader.result as string;
			doFormat(2);
		};
		reader.readAsText(file);
	});

	const uploadBtn = createBtn('📂 Open File', '📂 读取文件', false, () => fileInput.click());
	uploadBtn.style.padding = '0.25em 0.6em';
	uploadBtn.style.fontSize = '0.8rem';
	leftHead.append(leftTitle, uploadBtn, fileInput);

	const inputArea = document.createElement('textarea');
	inputArea.className = 't-json-editor';
	inputArea.spellcheck = false;
	inputArea.dataset.role = 'input';
	langAttr(inputArea, 'aria-label', 'JSON input', 'JSON 输入');

	leftPanel.append(leftHead, inputArea);

	// Right: Output
	const rightPanel = document.createElement('div');
	rightPanel.className = 't-json-panel';

	const rightHead = document.createElement('div');
	rightHead.className = 't-json-panel-head';
	const rightTitle = document.createElement('strong');
	rightTitle.append(bilingual('Formatted Output', '格式化输出'));

	const rightActions = document.createElement('div');
	rightActions.style.display = 'flex';
	rightActions.style.gap = '0.4em';

	const copyBtn = createBtn('📋 Copy', '📋 复制', false, doCopy);
	copyBtn.style.padding = '0.25em 0.6em';
	copyBtn.style.fontSize = '0.8rem';

	const downloadBtn = createBtn('💾 Download .json', '💾 下载 .json', false, doDownload);
	downloadBtn.style.padding = '0.25em 0.6em';
	downloadBtn.style.fontSize = '0.8rem';

	rightActions.append(copyBtn, downloadBtn);
	rightHead.append(rightTitle, rightActions);

	const outputArea = document.createElement('textarea');
	outputArea.className = 't-json-editor';
	outputArea.readOnly = true;
	outputArea.spellcheck = false;
	outputArea.dataset.role = 'output';
	langAttr(outputArea, 'aria-label', 'JSON output', 'JSON 输出');

	rightPanel.append(rightHead, outputArea);

	panels.append(leftPanel, rightPanel);
	wrap.append(toolbar, status, panels);
	host.append(wrap);

	langProp(
		inputArea,
		'placeholder',
		'Paste raw JSON text here... e.g. {"name": "test"}',
		'在此粘贴原始 JSON 文本... 例如：{"name": "test"}',
	);
	langProp(
		outputArea,
		'placeholder',
		'Formatted output will appear here...',
		'格式化结果将显示在此处...',
	);

	// --- Logic implementations ---

	function updateStatus(type: 'idle' | 'valid' | 'error', msgEn: string, msgZh?: string) {
		status.className = 't-json-status';
		if (type === 'valid') status.classList.add('is-valid');
		if (type === 'error') status.classList.add('is-error');
		status.replaceChildren(bilingual(msgEn, msgZh || msgEn));
	}

	function doFormat(indent: number) {
		const raw = inputArea.value.trim();
		if (!raw) {
			outputArea.value = '';
			updateStatus(
				'idle',
				'Ready: Paste or type JSON to validate and format automatically.',
				'准备就绪：输入或粘贴 JSON 后将自动校验并格式化。'
			);
			return;
		}

		try {
			const parsed = JSON.parse(raw);
			const formatted = JSON.stringify(parsed, null, indent);
			outputArea.value = formatted;

			const keyCount = countKeys(parsed);
			const byteLen = new TextEncoder().encode(raw).length;
			const fmtLen = new TextEncoder().encode(formatted).length;
			updateStatus(
				'valid',
				`✓ Valid JSON · Keys: ${keyCount} · Raw size: ${formatBytes(byteLen)} · Formatted: ${formatBytes(fmtLen)}`,
				`✓ JSON 格式有效 · 键值数量: ${keyCount} · 原始大小: ${formatBytes(byteLen)} · 格式化后: ${formatBytes(fmtLen)}`
			);
		} catch (err) {
			// V8's own SyntaxError text ("Unexpected token } ... at position 42").
			// It is English in every locale and there is no structured form of it,
			// so both views quote it verbatim after a translated prefix.
			const msg = err instanceof Error ? err.message : 'JSON parse failed';
			const pos = getErrorPosition(msg, raw);
			const whereEn = pos.line ? ` [line ${pos.line}, col ${pos.col}]` : '';
			const whereZh = pos.line ? ` [第 ${pos.line} 行, 第 ${pos.col} 列]` : '';
			updateStatus(
				'error',
				`✗ Syntax error${whereEn}: ${msg}`,
				`✗ 语法错误${whereZh}: ${msg}`
			);
		}
	}

	function doMinify() {
		const raw = inputArea.value.trim();
		if (!raw) return;
		try {
			const parsed = JSON.parse(raw);
			const minified = JSON.stringify(parsed);
			outputArea.value = minified;
			const originalLen = new TextEncoder().encode(raw).length;
			const minLen = new TextEncoder().encode(minified).length;
			const saved = originalLen > 0 ? (((originalLen - minLen) / originalLen) * 100).toFixed(1) : '0';
			updateStatus(
				'valid',
				`✓ Minified to one line · Size reduced from ${formatBytes(originalLen)} to ${formatBytes(minLen)} (${saved}% saved)`,
				`✓ 已压缩为单行 · 体积从 ${formatBytes(originalLen)} 缩小至 ${formatBytes(minLen)} (节省 ${saved}%)`
			);
		} catch (err) {
			const msg = err instanceof Error ? err.message : 'Minification failed';
			updateStatus('error', `✗ Minification failed: ${msg}`, `✗ 压缩失败: ${msg}`);
		}
	}

	function doEscape() {
		const raw = inputArea.value;
		if (!raw) return;
		const escaped = JSON.stringify(raw);
		outputArea.value = escaped;
		updateStatus(
			'valid',
			'✓ Escaped to string literal (with escaped quotes and newlines)',
			'✓ 已转义为字符串字面量（包含转义引号与换行符）'
		);
	}

	function doUnescape() {
		const raw = inputArea.value.trim();
		if (!raw) return;
		try {
			if (raw.startsWith('"') && raw.endsWith('"')) {
				const unescaped = JSON.parse(raw);
				outputArea.value = typeof unescaped === 'string' ? unescaped : JSON.stringify(unescaped, null, 2);
				updateStatus('valid', '✓ Unescaped string literal and restored content', '✓ 已去除字符串转义符并还原内容');
			} else {
				const replaced = raw.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
				outputArea.value = replaced;
				updateStatus('valid', '✓ Unescaped \\" backslashes', '✓ 已去除 \\" 反斜杠转义');
			}
		} catch (err) {
			const msg = err instanceof Error ? err.message : 'Unescape failed';
			updateStatus('error', `✗ Unescape failed: ${msg}`, `✗ 去转义失败: ${msg}`);
		}
	}

	function loadSample() {
		inputArea.value = JSON.stringify(SAMPLE_JSON, null, 2);
		doFormat(2);
	}

	function doClear() {
		inputArea.value = '';
		outputArea.value = '';
		updateStatus('idle', 'Cleared', '已清空');
	}

	async function doCopy() {
		const text = outputArea.value || inputArea.value;
		if (!text) return;
		try {
			await navigator.clipboard.writeText(text);
			const oldChildren = Array.from(copyBtn.childNodes);
			copyBtn.replaceChildren(bilingual('✓ Copied!', '✓ 已复制!'));
			copyBtn.style.color = '#10b981';
			setTimeout(() => {
				copyBtn.replaceChildren(...oldChildren);
				copyBtn.style.color = '';
			}, 1500);
		} catch {
			outputArea.select();
			document.execCommand('copy');
		}
	}

	function doDownload() {
		const text = outputArea.value || inputArea.value;
		if (!text) return;
		const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `formatted-${Date.now()}.json`;
		a.click();
		URL.revokeObjectURL(url);
	}

	// Live debounced auto-validation on typing
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;
	inputArea.addEventListener('input', () => {
		if (debounceTimer) clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => {
			doFormat(2);
		}, 300);
	});

	// Default initialization
	updateStatus(
		'idle',
		'Ready: Paste or type JSON to validate and format automatically.',
		'准备就绪：输入或粘贴 JSON 后将自动校验并格式化。'
	);
}
