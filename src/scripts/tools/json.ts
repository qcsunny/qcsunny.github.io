// Interactive JSON Formatter & Validator workbench:
// - Format (2 & 4 spaces), Minify, Escape / Unescape, Load Sample, Clear
// - Real-time syntax error locator (line/col) & size / keys statistics
// - File upload (.json) and download formatted .json
// - One-click clipboard copy with feedback
// - 100% responsive bilingual support (pure English in EN mode, pure Chinese in ZH mode)
// - Runs 100% in-browser with zero tracking.
// - Number precision is the JS engine's: the parser turns every number
//   into an IEEE 754 double, so the loss happens before formatting can
//   see it. Said so in the UI (.t-cap-note) rather than left to be found.

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
	features: ['format', 'minify', 'validate'],
	verified: true
};

function countKeys(obj: unknown): number {
	let count = 0;
	// Iterative: the recursive walk threw RangeError well past a few thousand
	// nesting levels, and it ran *after* the formatted output had already been
	// written - so a valid document came back labelled a syntax error.
	const stack: unknown[] = [obj];
	while (stack.length > 0) {
		const cur = stack.pop()!;
		if (cur === null || typeof cur !== 'object') continue;
		if (Array.isArray(cur)) {
			for (const item of cur) stack.push(item);
		} else {
			const keys = Object.keys(cur as Record<string, unknown>);
			count += keys.length;
			for (const k of keys) stack.push((cur as Record<string, unknown>)[k]);
		}
	}
	return count;
}

/** Map a parse error onto a line/column.
 *
 *  prefix is how many characters were trimmed off the front of the editor
 *  text before parsing: the engine reports an index into the *trimmed*
 *  string, so without it every line number after a leading blank line is
 *  off by one. `text` must be the full editor value for the line count
 *  itself to be right.
 */
function getErrorPosition(
	errorMsg: string,
	text: string,
	prefix = 0,
): { line?: number; col?: number } {
	const posMatch = errorMsg.match(/position\s+(\d+)/i);
	if (posMatch) {
		const at = prefix + parseInt(posMatch[1], 10);
		const lines = text.slice(0, at).split('\n');
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

	// Explicit toolbar actions must cancel the pending debounced auto-format (see
	// the listener at the bottom), or it fires up to 300ms later and silently
	// overwrites the result the user just asked for. json.ts builds its own
	// workbench instead of using createWorkbench, so it needs its own guard.
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;
	const cancelAutoRun = (): void => {
		if (debounceTimer) {
			clearTimeout(debounceTimer);
			debounceTimer = null;
		}
	};

	function createBtn(labelEn: string, labelZh: string, isPrimary = false, onClick?: () => void): HTMLButtonElement {
		const btn = document.createElement('button');
		btn.type = 'button';
		btn.className = isPrimary ? 't-btn t-primary' : 't-btn';
		btn.append(bilingual(labelEn, labelZh));
		if (onClick)
			btn.addEventListener('click', () => {
				cancelAutoRun();
				onClick();
			});
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

	// JSON numbers are IEEE 754 doubles, so three kinds of loss cannot be
	// undone here: -0 becomes 0, an integer outside the safe range can round
	// to a neighbouring value, and anything beyond ±1e308 becomes null. All
	// three happen at JSON.parse, before formatting can look at the digits, so
	// no fix on the formatting side could recover them - only a disclosure.
	// Number.MAX_SAFE_INTEGER is interpolated, never typed in: a 16-digit
	// literal here would be easy to get wrong and nothing would flag it.
	const capNote = document.createElement('span');
	capNote.className = 't-cap-note';
	capNote.append(
		Object.assign(document.createElement('span'), { className: 'i18n-en', textContent: `JSON numbers are IEEE 754 doubles: -0 becomes 0, integers beyond ${Number.MAX_SAFE_INTEGER} can round to a neighbouring value, and values outside ±1e308 become null. The digits are lost when the document is parsed, before formatting can see them.` }),
		Object.assign(document.createElement('span'), { className: 'i18n-zh', textContent: `JSON 数值均为 IEEE 754 双精度浮点：-0 变为 0，超过 ${Number.MAX_SAFE_INTEGER} 的整数可能取整到邻近值，超出 ±1e308 的数值变为 null。数字在解析阶段就已丢失，格式化无从恢复。` }),
	);
	leftPanel.append(leftHead, inputArea, capNote);

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

	// Stringify a parsed document. Indented output costs 2 x depth^2 bytes,
	// so a document nested thousands deep overflows the engine's number
	// formatting - a RangeError thrown out of a document that PARSED FINE,
	// which the caller used to report as a syntax error. Minified output
	// has no per-level cost and survives any depth, so it is the fallback
	// rather than a dead end. Null only for a real parse failure.
	function stringifyJson(
		parsed: unknown,
		indent: number,
	): { text: string; indented: boolean } | null {
		try {
			return { text: JSON.stringify(parsed, null, indent), indented: true };
		} catch {
			try {
				return { text: JSON.stringify(parsed), indented: false };
			} catch {
				return null;
			}
		}
	}

	function updateStatus(type: 'idle' | 'valid' | 'error', msgEn: string, msgZh?: string) {
		status.className = 't-json-status';
		if (type === 'valid') status.classList.add('is-valid');
		if (type === 'error') status.classList.add('is-error');
		status.replaceChildren(bilingual(msgEn, msgZh || msgEn));
	}

	function doFormat(indent: number) {
		// Kept untrimmed so the error position maps onto what the reader sees.
		const original = inputArea.value;
		const raw = original.trim();
		if (!raw) {
			outputArea.value = '';
			updateStatus(
				'idle',
				'Ready: Paste or type JSON to validate and format automatically.',
				'准备就绪：输入或粘贴 JSON 后将自动校验并格式化。'
			);
			return;
		}

		let parsed: unknown;
		try {
			parsed = JSON.parse(raw);
		} catch (err) {
			// V8's own SyntaxError text ("Unexpected token } ... at position 42").
			// It is English in every locale and there is no structured form of it,
			// so both views quote it verbatim after a translated prefix.
			const msg = err instanceof Error ? err.message : 'JSON parse failed';
			const pos = getErrorPosition(msg, original, original.length - raw.length);
			const whereEn = pos.line ? ` [line ${pos.line}, col ${pos.col}]` : '';
			const whereZh = pos.line ? ` [第 ${pos.line} 行, 第 ${pos.col} 列]` : '';
			updateStatus(
				'error',
				`✗ Syntax error${whereEn}: ${msg}`,
				`✗ 语法错误${whereZh}: ${msg}`
			);
			// Must stop here: falling out of this catch would reach the success
			// path with `parsed` still undefined, which formats as an empty
			// document and reports it valid - a syntax error read as success.
			// Load-bearing, not dead code.
			return;
		}

		const out = stringifyJson(parsed, indent);
		if (out === null) return;
		const formatted = out.text;
		outputArea.value = formatted;

		const keyCount = countKeys(parsed);
		const byteLen = new TextEncoder().encode(raw).length;
		const fmtLen = new TextEncoder().encode(formatted).length;
		// The indented path is the only one that can overflow, so name it.
		const depthTag = out.indented ? '' : ' · nested too deep to indent - shown minified';
		const depthTagZh = out.indented ? '' : ' · 嵌套过深无法缩进，已按单行输出';
		updateStatus(
			'valid',
			`✓ Valid JSON${depthTag} · Keys: ${keyCount} · Raw size: ${formatBytes(byteLen)} · Formatted: ${formatBytes(fmtLen)}`,
			`✓ JSON 格式有效${depthTagZh} · 键值数量: ${keyCount} · 原始大小: ${formatBytes(byteLen)} · 格式化后: ${formatBytes(fmtLen)}`
		);
	}

	function doMinify() {
		const original = inputArea.value;
		const raw = original.trim();
		if (!raw) return;
		try {
			const parsed = JSON.parse(raw);
			// No indent, so this cannot trip the depth limit the indented path can.
			const minified = stringifyJson(parsed, 0)!.text;
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
			const msg = err instanceof Error ? err.message : 'JSON parse failed';
			const pos = getErrorPosition(msg, original, original.length - raw.length);
			const whereEn = pos.line ? ` [line ${pos.line}, col ${pos.col}]` : '';
			const whereZh = pos.line ? ` [第 ${pos.line} 行, 第 ${pos.col} 列]` : '';
			updateStatus(
				'error',
				`✗ Syntax error${whereEn}: ${msg}`,
				`✗ 语法错误${whereZh}: ${msg}`
			);
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
		// The only unescaping this tool can do for certain is decode a JSON string
		// literal - the case where a document was copied as text inside quotes. A
		// blind replace of \" and \\ is the wrong tool: \n and \t are real
		// escapes the replace never decodes, while the quotes of a document that
		// is ALREADY valid JSON get stripped, turning it into something broken
		// and reporting success on top of it.
		const raw = inputArea.value.trim();
		if (!raw) return;
		let parsed: unknown;
		try {
			parsed = JSON.parse(raw);
		} catch (err) {
			const msg = err instanceof Error ? err.message : 'JSON parse failed';
			outputArea.value = '';
			updateStatus(
				'error',
				`✗ Not a JSON string literal: ${msg} · Wrap the text in double quotes and try again.`,
				`✗ 不是 JSON 字符串字面量: ${msg} · 请用双引号包裹文本后重试。`
			);
			// The same trap: falling through would hit the already-valid-JSON
			// branch with `parsed` undefined and print the word "undefined" as a
			// formatted result.
			return;
		}

		if (typeof parsed === 'string') {
			// A quoted literal always decodes to a string, so there is no other case.
			outputArea.value = parsed;
			updateStatus('valid', '✓ Unescaped string literal and restored content', '✓ 已去除字符串转义符并还原内容');
			return;
		}
		// Parses, but is not a literal - it was already valid JSON. Formatting it
		// says that plainly; deleting its quotes would have hidden the mistake.
		const formatted = stringifyJson(parsed, 2)?.text ?? JSON.stringify(parsed);
		outputArea.value = formatted;
		updateStatus(
			'valid',
			'✓ Already valid JSON - no string escaping to remove. Formatted instead.',
			'✓ 这已经是合法 JSON，无需去转义。已改为格式化。'
		);
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
			// fallback when the Clipboard API rejects (denied permission,
			// non-secure context); the cast bypasses the deprecation hint
			(document as any).execCommand('copy');
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
	inputArea.addEventListener('input', () => {
		cancelAutoRun();
		debounceTimer = setTimeout(() => {
			debounceTimer = null;
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
