// Reusable developer workbench UI builder for in-browser client-side tools:
// - Top toolbar with customizable primary/secondary actions, sample, clear
// - Real-time status indicator with valid / error / idle styling
// - Responsive side-by-side split panels (or stacked on mobile)
// - One-click clipboard copy, file upload (.ext), and formatted file download
// - 100% in-browser, zero dependencies, zero network requests.

export interface WorkbenchBtnConfig {
	label: string;
	primary?: boolean;
	onClick: () => void;
}

export interface WorkbenchOptions {
	host: HTMLElement;
	inputTitle?: string;
	outputTitle?: string;
	inputPlaceholder?: string;
	outputPlaceholder?: string;
	fileAccept?: string;
	fileDefaultName?: string;
	buttons: WorkbenchBtnConfig[];
	onInput?: (raw: string) => void;
	onSample?: () => void;
	onClear?: () => void;
	initialStatus?: string;
}

export interface WorkbenchHandle {
	inputArea: HTMLTextAreaElement;
	outputArea: HTMLTextAreaElement;
	statusEl: HTMLDivElement;
	updateStatus: (type: 'idle' | 'valid' | 'error', msg: string) => void;
	flashCopySuccess: (btn?: HTMLButtonElement) => void;
}

export function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function createWorkbench(options: WorkbenchOptions): WorkbenchHandle {
	const {
		host,
		inputTitle = '输入 (Input)',
		outputTitle = '输出 (Output)',
		inputPlaceholder = '在此输入或粘贴代码...',
		outputPlaceholder = '格式化结果将显示在此处...',
		fileAccept = '.txt',
		fileDefaultName = 'output.txt',
		buttons,
		onInput,
		onSample,
		onClear,
		initialStatus = '准备就绪：输入或粘贴代码后将自动校验并处理。'
	} = options;

	host.innerHTML = '';

	const wrap = document.createElement('div');
	wrap.className = 't-json-wrap';

	// 1. Toolbar
	const toolbar = document.createElement('div');
	toolbar.className = 't-json-toolbar';

	function createBtn(label: string, isPrimary = false, onClick: () => void): HTMLButtonElement {
		const btn = document.createElement('button');
		btn.type = 'button';
		btn.className = isPrimary ? 't-btn t-primary' : 't-btn';
		btn.textContent = label;
		btn.addEventListener('click', onClick);
		return btn;
	}

	for (const b of buttons) {
		toolbar.appendChild(createBtn(b.label, b.primary, b.onClick));
	}

	if (onSample || onClear) {
		const sep = document.createElement('span');
		sep.className = 't-sep';
		toolbar.appendChild(sep);

		if (onSample) {
			toolbar.appendChild(createBtn('示例数据', false, onSample));
		}
		if (onClear) {
			toolbar.appendChild(createBtn('清空', false, onClear));
		}
	}

	// 2. Status banner
	const statusEl = document.createElement('div');
	statusEl.className = 't-json-status';
	statusEl.textContent = initialStatus;

	// 3. Panels
	const panels = document.createElement('div');
	panels.className = 't-json-panels';

	// Left: Input
	const leftPanel = document.createElement('div');
	leftPanel.className = 't-json-panel';

	const leftHead = document.createElement('div');
	leftHead.className = 't-json-panel-head';
	const leftTitle = document.createElement('strong');
	leftTitle.textContent = inputTitle;

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
			if (onInput) onInput(inputArea.value);
		};
		reader.readAsText(file);
	});

	const uploadBtn = createBtn('📂 读取文件', false, () => fileInput.click());
	uploadBtn.style.padding = '0.25em 0.6em';
	uploadBtn.style.fontSize = '0.8rem';
	leftHead.append(leftTitle, uploadBtn, fileInput);

	const inputArea = document.createElement('textarea');
	inputArea.className = 't-json-editor';
	inputArea.placeholder = inputPlaceholder;
	inputArea.spellcheck = false;
	inputArea.setAttribute('aria-label', 'Input Area');

	leftPanel.append(leftHead, inputArea);

	// Right: Output
	const rightPanel = document.createElement('div');
	rightPanel.className = 't-json-panel';

	const rightHead = document.createElement('div');
	rightHead.className = 't-json-panel-head';
	const rightTitle = document.createElement('strong');
	rightTitle.textContent = outputTitle;

	const rightActions = document.createElement('div');
	rightActions.style.display = 'flex';
	rightActions.style.gap = '0.4em';

	const copyBtn = createBtn('📋 复制', false, async () => {
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

	const downloadBtn = createBtn('💾 下载文件', false, () => {
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
	outputArea.placeholder = outputPlaceholder;
	outputArea.readOnly = true;
	outputArea.spellcheck = false;
	outputArea.setAttribute('aria-label', 'Output Area');

	rightPanel.append(rightHead, outputArea);

	panels.append(leftPanel, rightPanel);
	wrap.append(toolbar, statusEl, panels);
	host.append(wrap);

	function updateStatus(type: 'idle' | 'valid' | 'error', msg: string) {
		statusEl.className = 't-json-status';
		if (type === 'valid') statusEl.classList.add('is-valid');
		if (type === 'error') statusEl.classList.add('is-error');
		statusEl.textContent = msg;
	}

	function flashCopySuccess(btn?: HTMLButtonElement) {
		const target = btn || copyBtn;
		const original = target.textContent;
		target.textContent = '✓ 已复制!';
		target.style.color = '#10b981';
		setTimeout(() => {
			target.textContent = original;
			target.style.color = '';
		}, 1500);
	}

	if (onInput) {
		let timer: ReturnType<typeof setTimeout> | null = null;
		inputArea.addEventListener('input', () => {
			if (timer) clearTimeout(timer);
			timer = setTimeout(() => {
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
