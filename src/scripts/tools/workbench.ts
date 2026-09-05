// Reusable developer workbench UI builder for in-browser client-side tools:
// - Top toolbar with customizable primary/secondary actions, sample, clear
// - Real-time status indicator with valid / error / idle styling
// - Responsive side-by-side split panels (or stacked on mobile)
// - One-click clipboard copy, file upload (.ext), and formatted file download
// - 100% responsive bilingual support (pure English in EN mode, pure Chinese in ZH mode)
// - 100% in-browser, zero dependencies, zero network requests.

import { bilingual, langAttr, onLang } from './i18n';

export interface WorkbenchBtnConfig {
	label: string; // English / default label
	labelZh?: string; // Chinese label
	primary?: boolean;
	onClick: () => void;
}

export interface WorkbenchOptions {
	host: HTMLElement;
	inputTitle?: string;
	inputTitleZh?: string;
	outputTitle?: string;
	outputTitleZh?: string;
	inputPlaceholder?: string;
	inputPlaceholderZh?: string;
	outputPlaceholder?: string;
	outputPlaceholderZh?: string;
	fileAccept?: string;
	fileDefaultName?: string;
	downloadLabel?: string;
	downloadLabelZh?: string;
	buttons: WorkbenchBtnConfig[];
	onInput?: (raw: string) => void;
	onSample?: () => void;
	onClear?: () => void;
	initialStatus?: string;
	initialStatusZh?: string;
}

export interface WorkbenchHandle {
	inputArea: HTMLTextAreaElement;
	outputArea: HTMLTextAreaElement;
	statusEl: HTMLDivElement;
	updateStatus: (type: 'idle' | 'valid' | 'error', msgEn: string, msgZh?: string) => void;
	flashCopySuccess: (btn?: HTMLButtonElement) => void;
}

export function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function makeBilingualSpan(en: string, zh?: string): HTMLElement {
	const span = document.createElement('span');
	span.append(bilingual(en, zh));
	return span;
}

export function createWorkbench(options: WorkbenchOptions): WorkbenchHandle {
	const {
		host,
		inputTitle = 'Input',
		inputTitleZh = '输入',
		outputTitle = 'Output',
		outputTitleZh = '输出',
		inputPlaceholder = 'Type or paste code here...',
		inputPlaceholderZh = '在此输入或粘贴代码...',
		outputPlaceholder = 'Formatted output will appear here...',
		outputPlaceholderZh = '格式化结果将显示在此处...',
		fileAccept = '.txt',
		fileDefaultName = 'output.txt',
		downloadLabel = '💾 Download',
		downloadLabelZh = '💾 下载文件',
		buttons,
		onInput,
		onSample,
		onClear,
		initialStatus = 'Ready: Paste or enter content to process.',
		initialStatusZh = '准备就绪：输入或粘贴代码后将自动校验并处理。'
	} = options;

	host.innerHTML = '';

	// Typing schedules a debounced auto-run of onInput (see the listener near the
	// end of this function). Any explicit toolbar action has to cancel that timer
	// first, or a pending auto-format fires up to 300ms later and silently
	// overwrites the result the user just asked for — clicking "Minify" right
	// after pasting used to flash the minified SQL and then replace it with the
	// formatted version.
	let autoRunTimer: ReturnType<typeof setTimeout> | null = null;
	const cancelAutoRun = (): void => {
		if (autoRunTimer) {
			clearTimeout(autoRunTimer);
			autoRunTimer = null;
		}
	};

	const wrap = document.createElement('div');
	wrap.className = 't-json-wrap';

	// 1. Toolbar
	const toolbar = document.createElement('div');
	toolbar.className = 't-json-toolbar';

	function createBtn(labelEn: string, labelZh?: string, isPrimary = false, onClick?: () => void): HTMLButtonElement {
		const btn = document.createElement('button');
		btn.type = 'button';
		btn.className = isPrimary ? 't-btn t-primary' : 't-btn';
		btn.append(makeBilingualSpan(labelEn, labelZh));
		if (onClick)
			btn.addEventListener('click', () => {
				cancelAutoRun();
				onClick();
			});
		return btn;
	}

	for (const b of buttons) {
		toolbar.appendChild(createBtn(b.label, b.labelZh, b.primary, b.onClick));
	}

	if (onSample || onClear) {
		const sep = document.createElement('span');
		sep.className = 't-sep';
		toolbar.appendChild(sep);

		if (onSample) {
			toolbar.appendChild(createBtn('Sample Data', '示例数据', false, onSample));
		}
		if (onClear) {
			toolbar.appendChild(createBtn('Clear', '清空', false, onClear));
		}
	}

	// 2. Status banner
	const statusEl = document.createElement('div');
	statusEl.className = 't-json-status';
	statusEl.append(makeBilingualSpan(initialStatus, initialStatusZh));

	// 3. Panels
	const panels = document.createElement('div');
	panels.className = 't-json-panels';

	// Left: Input
	const leftPanel = document.createElement('div');
	leftPanel.className = 't-json-panel';

	const leftHead = document.createElement('div');
	leftHead.className = 't-json-panel-head';
	const leftTitle = document.createElement('strong');
	leftTitle.append(makeBilingualSpan(inputTitle, inputTitleZh));

	const fileInput = document.createElement('input');
	fileInput.type = 'file';
	fileInput.accept = fileAccept;
	fileInput.style.display = 'none';
	fileInput.addEventListener('change', (e) => {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = () => {
			inputArea.value = reader.result as string;
			cancelAutoRun();
			if (onInput) onInput(inputArea.value);
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
	// aria-label follows the language switch, so it cannot double as a selector.
	// data-role is what e2e/devtools.spec.ts holds on to.
	inputArea.dataset.role = 'input';
	langAttr(inputArea, 'aria-label', 'Input', '输入');

	leftPanel.append(leftHead, inputArea);

	// Right: Output
	const rightPanel = document.createElement('div');
	rightPanel.className = 't-json-panel';

	const rightHead = document.createElement('div');
	rightHead.className = 't-json-panel-head';
	const rightTitle = document.createElement('strong');
	rightTitle.append(makeBilingualSpan(outputTitle, outputTitleZh));

	const rightActions = document.createElement('div');
	rightActions.style.display = 'flex';
	rightActions.style.gap = '0.4em';

	const copyBtn = createBtn('📋 Copy', '📋 复制', false, async () => {
		const text = outputArea.value || inputArea.value;
		if (!text) return;
		try {
			await navigator.clipboard.writeText(text);
			flashCopySuccess(copyBtn);
		} catch {
			outputArea.select();
			document.execCommand('copy');
			flashCopySuccess(copyBtn);
		}
	});
	copyBtn.style.padding = '0.25em 0.6em';
	copyBtn.style.fontSize = '0.8rem';

	const downloadBtn = createBtn(downloadLabel, downloadLabelZh, false, () => {
		const text = outputArea.value || inputArea.value;
		if (!text) return;
		const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = fileDefaultName;
		a.click();
		URL.revokeObjectURL(url);
	});
	downloadBtn.style.padding = '0.25em 0.6em';
	downloadBtn.style.fontSize = '0.8rem';

	rightActions.append(copyBtn, downloadBtn);
	rightHead.append(rightTitle, rightActions);

	const outputArea = document.createElement('textarea');
	outputArea.className = 't-json-editor';
	outputArea.readOnly = true;
	outputArea.spellcheck = false;
	outputArea.dataset.role = 'output';
	langAttr(outputArea, 'aria-label', 'Output', '输出');

	rightPanel.append(rightHead, outputArea);

	panels.append(leftPanel, rightPanel);
	wrap.append(toolbar, statusEl, panels);
	host.append(wrap);

	onLang((zh) => {
		inputArea.placeholder = zh && inputPlaceholderZh ? inputPlaceholderZh : inputPlaceholder;
		outputArea.placeholder = zh && outputPlaceholderZh ? outputPlaceholderZh : outputPlaceholder;
	});

	function updateStatus(type: 'idle' | 'valid' | 'error', msgEn: string, msgZh?: string) {
		statusEl.className = 't-json-status';
		if (type === 'valid') statusEl.classList.add('is-valid');
		if (type === 'error') statusEl.classList.add('is-error');
		statusEl.replaceChildren(makeBilingualSpan(msgEn, msgZh || msgEn));
	}

	function flashCopySuccess(btn?: HTMLButtonElement) {
		const target = btn || copyBtn;
		const oldChildren = Array.from(target.childNodes);
		target.replaceChildren(makeBilingualSpan('✓ Copied!', '✓ 已复制!'));
		target.style.color = '#10b981';
		setTimeout(() => {
			target.replaceChildren(...oldChildren);
			target.style.color = '';
		}, 1500);
	}

	if (onInput) {
		inputArea.addEventListener('input', () => {
			cancelAutoRun();
			autoRunTimer = setTimeout(() => {
				autoRunTimer = null;
				onInput(inputArea.value);
			}, 300);
		});
	}

	return {
		inputArea,
		outputArea,
		statusEl,
		updateStatus,
		flashCopySuccess
	};
}
