// Text-tool renderer: a textarea with live statistics rows and optional
// button-triggered transforms (JSON formatting, Base64, …) writing into an
// output area. Backs word/character counters, JSON formatter, Base64, hash generator,
// and the average/statistics calculator.

import type { TextConfig, TextStat, TextTransform } from '../../tools/registry';
import { bilingual, langAttr, langProp, setBilingual } from './i18n';

/** Input size cap for every text tool. Live transforms run on every keystroke
 *  and several parses are O(n·lookahead) — a multi-megabyte paste would freeze
 *  the tab. Over the cap the tool REJECTS loudly instead of truncating: a
 *  silently truncated JSON/YAML parse produces a wrong-but-plausible answer,
 *  which is worse than a visible error. */
const MAX_INPUT_CHARS = 5 * 1024 * 1024;

export function initText(host: HTMLElement, config: TextConfig): void {
	let input = host.querySelector<HTMLTextAreaElement>('textarea[data-role="input"]');
	if (!input) {
		input = document.createElement('textarea');
		input.className = config.mono ? 't-textarea t-mono' : 't-textarea';
		input.rows = 6;
		input.spellcheck = false;
		input.dataset.role = 'input';
		host.append(input);
	}
	langProp(input, 'placeholder', config.placeholder ?? '', config.placeholderZh);
	langAttr(input, 'aria-label', 'Text input', '文本输入');
	// Sample content: prefilled only when the box is still empty, so a page
	// reload never clobbers what the visitor typed.
	if (config.def && !input.value) input.value = config.def;

	let statsHost = host.querySelector<HTMLElement>('.t-results');
	if (config.stats && !statsHost) {
		const label = document.createElement('span');
		label.className = 't-label t-stats-label';
		setBilingual(label, 'Statistics', '统计数据');
		statsHost = document.createElement('div');
		statsHost.className = 't-results';
		host.append(label, statsHost);
	}

	// --- optional secret input (HMAC keys and the like) -----------------------------
	let secretInput: HTMLInputElement | null = null;
	if (config.secretInput) {
		const wrap = document.createElement('div');
		wrap.className = 't-field t-secretfield';
		const label = document.createElement('label');
		label.htmlFor = 't-secret';
		label.append(bilingual(config.secretInput.label, config.secretInput.labelZh));
		secretInput = document.createElement('input');
		secretInput.type = 'password';
		secretInput.id = 't-secret';
		secretInput.autocomplete = 'off';
		secretInput.spellcheck = false;
		langProp(secretInput, 'placeholder', config.secretInput.placeholder ?? '', config.secretInput.placeholderZh);
		langAttr(secretInput, 'aria-label', config.secretInput.label, config.secretInput.labelZh);
		wrap.append(label, secretInput);
		host.insertBefore(wrap, input.nextSibling);
	}

	// --- optional file source (text drop-in, or binary via fileTransform) -----------
	const humanSize = (n: number): string => {
		if (n < 1024) return `${n} B`;
		if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
		if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
		return `${(n / 1024 ** 3).toFixed(2)} GB`;
	};
	async function readDroppedFile(file: File): Promise<void> {
		if (!input) return;
		try {
			if (config.fileTransform) {
				// Binary path: bytes straight to the tool (file hashing), the
				// textarea just records what was dropped.
				const buf = await file.arrayBuffer();
				const r = await config.fileTransform(buf, file.name, file.size, secretInput?.value ?? '');
				input.value = `📄 ${file.name} (${humanSize(file.size)})`;
				if (out) out.value = r.output;
				if (errEl) setBilingual(errEl, r.error ?? '', r.errorZh);
			} else {
				// Text path: the file IS the input; everything downstream
				// (live transforms, stats) just works.
				input.value = await file.text();
				update();
				input.dispatchEvent(new Event('input', { bubbles: true }));
			}
		} catch (err) {
			if (errEl) setBilingual(errEl, err instanceof Error ? err.message : 'Could not read the file.', err instanceof Error ? err.message : '无法读取该文件。');
		}
	}
	if (config.acceptFiles || config.fileTransform) {
		const fileRow = document.createElement('div');
		fileRow.className = 't-filerow';
		const pick = document.createElement('button');
		pick.type = 'button';
		pick.className = 't-btn t-file-btn';
		pick.append(bilingual('📄 Choose file', '📄 选择文件'));
		const hint = document.createElement('span');
		hint.className = 't-file-hint';
		hint.append(
			config.fileTransform
				? bilingual('— or drop a file onto the input box', '——或把文件拖到输入框')
				: bilingual(`— or drop a ${config.acceptFiles ?? ''} file onto the input box`, `——或把 ${config.acceptFiles ?? ''} 文件拖到输入框`),
		);
		const hidden = document.createElement('input');
		hidden.type = 'file';
		if (config.acceptFiles) hidden.accept = config.acceptFiles;
		hidden.hidden = true;
		// Stated up front on purpose: a file drop reads like "uploading" to
		// most people, and the whole point of this site is that it isn't.
		const privacy = document.createElement('span');
		privacy.className = 't-file-privacy';
		privacy.append(
			bilingual('🔒 Files never leave your device — processing is 100% local.', '🔒 文件不会上传 —— 全程本地离线运算。'),
		);
		hidden.addEventListener('change', () => {
			const f = hidden.files?.[0];
			if (f) void readDroppedFile(f);
			hidden.value = '';
		});
		pick.addEventListener('click', () => hidden.click());
		fileRow.append(pick, hint, privacy, hidden);
		// The drop targets: the textarea and the file row both accept a drop.
		for (const zone of [input, fileRow] as HTMLElement[]) {
			zone.addEventListener('dragover', (e: DragEvent) => {
				e.preventDefault();
				zone.classList.add('t-droptarget');
			});
			zone.addEventListener('dragleave', () => zone.classList.remove('t-droptarget'));
			zone.addEventListener('drop', (e: DragEvent) => {
				e.preventDefault();
				zone.classList.remove('t-droptarget');
				const f = e.dataTransfer?.files?.[0];
				if (f) void readDroppedFile(f);
			});
		}
		const secretOrInput = secretInput?.parentElement ?? input;
		host.insertBefore(fileRow, secretOrInput === input ? input.nextSibling : secretOrInput.nextSibling);
	}

	let out: HTMLTextAreaElement | null = null;
	let errEl: HTMLElement | null = null;

	if (config.transforms?.length) {
		let btnRow = host.querySelector<HTMLElement>('.t-btnrow');
		const isPreRenderedBtns = !!btnRow;
		if (!btnRow) {
			btnRow = document.createElement('div');
			btnRow.className = 't-btnrow';
			host.append(btnRow);
		}

		// Clear button: wipes input, output and error. Class t-clear also keeps it
		// OUT of the pre-rendered .t-btn sequence below — those are matched to
		// transforms by index, and the clearing button is no transform.
		const clearBtn = document.createElement('button');
		clearBtn.type = 'button';
		clearBtn.className = 't-btn t-clear';
		clearBtn.append(bilingual('✕ Clear', '✕ 清空'));
		clearBtn.addEventListener('click', () => {
			if (!input) return;
			input.value = '';
			if (out) out.value = '';
			if (errEl) errEl.textContent = '';
			update();
			input.focus();
		});
		btnRow.insertBefore(clearBtn, btnRow.firstChild);

		let outLabel = host.querySelector<HTMLElement>('.t-out-label');
		if (!outLabel) {
			outLabel = document.createElement('span');
			outLabel.className = 't-label t-out-label';
			setBilingual(outLabel, 'Output', '转换输出');
			host.append(outLabel);
		}

		out = host.querySelector<HTMLTextAreaElement>('textarea[data-role="output"]');
		if (!out) {
			out = document.createElement('textarea');
			out.className = 't-textarea t-mono t-out';
			out.rows = 8;
			out.readOnly = true;
			out.dataset.role = 'output';
			host.append(out);
		}
		langAttr(out, 'aria-label', 'Output', '输出');

		errEl = host.querySelector<HTMLElement>('.t-error');
		if (!errEl) {
			errEl = document.createElement('p');
			errEl.className = 't-error';
			host.append(errEl);
		}

		let runSeq = 0;
		const executeTransform = (t: TextTransform): void => {
			if (!out || !input) return;
			if (input.value.length > MAX_INPUT_CHARS) {
				out.value = '';
				if (errEl) setBilingual(errEl, `Input exceeds 5 MB — this tool does not process files that large.`, `输入超过 5 MB —— 本工具不处理这么大的文件。`);
				return;
			}
			const currentSeq = ++runSeq;
			const secret = secretInput?.value ?? '';
			try {
				const r = t.run(input.value, secret);
				if (r instanceof Promise) {
					r.then((res) => {
						if (currentSeq !== runSeq || !out) return;
						out.value = res.output;
						if (errEl) setBilingual(errEl, res.error ?? '', res.errorZh);
					}).catch((err) => {
						if (currentSeq !== runSeq || !out) return;
						out.value = '';
						if (errEl) setBilingual(errEl, err instanceof Error ? err.message : 'Error');
					});
				} else {
					out.value = r.output;
					if (errEl) setBilingual(errEl, r.error ?? '', r.errorZh);
				}
			} catch (err) {
				out.value = '';
				if (errEl) setBilingual(errEl, err instanceof Error ? err.message : 'Error');
			}
		};

		if (isPreRenderedBtns) {
			// :not(.t-clear) — the clear button above is no transform (see there).
			const btns = btnRow.querySelectorAll<HTMLButtonElement>('.t-btn:not(.t-clear)');
			(config.transforms ?? []).forEach((t, i) => {
				const btn = btns[i];
				if (btn) {
					btn.addEventListener('click', () => executeTransform(t));
				}
			});
		} else {
			for (const t of config.transforms ?? []) {
				const btn = document.createElement('button');
				btn.type = 'button';
				btn.className = 't-btn';
				btn.append(bilingual(t.label, t.labelZh));
				btn.addEventListener('click', () => executeTransform(t));
				btnRow.append(btn);
			}
		}

		if (config.live && config.transforms.length > 0) {
			let debounceTimer: ReturnType<typeof setTimeout> | null = null;
			input.addEventListener('input', () => {
				if (debounceTimer) clearTimeout(debounceTimer);
				debounceTimer = setTimeout(() => {
					executeTransform(config.transforms![0]);
				}, 40);
			});
			if (input.value) {
				executeTransform(config.transforms[0]);
			}
		}
	}

	// Stats-only tools (word counter, …) have no transform button row; give
	// them a slim one so clearing is just as easy.
	if (!config.transforms?.length) {
		const clearRow = document.createElement('div');
		clearRow.className = 't-btnrow t-clearrow';
		const clearBtn = document.createElement('button');
		clearBtn.type = 'button';
		clearBtn.className = 't-btn t-clear';
		clearBtn.append(bilingual('✕ Clear', '✕ 清空'));
		clearBtn.addEventListener('click', () => {
			if (!input) return;
			input.value = '';
			update();
			input.focus();
		});
		clearRow.append(clearBtn);
		// Above the statistics block (and its label) when there is one, else at the end.
		const statsAnchor = host.querySelector('.t-stats-label') ?? statsHost;
		if (statsAnchor && statsAnchor.parentElement === host) host.insertBefore(clearRow, statsAnchor);
		else host.append(clearRow);
	}

	function statRow(stat: TextStat): HTMLElement {
		const el = document.createElement('div');
		el.className = 't-row';
		const l = document.createElement('span');
		l.className = 't-row-label';
		l.append(bilingual(stat.label, stat.labelZh));
		const v = document.createElement('span');
		v.className = 't-row-value';
		v.textContent = stat.value;
		el.append(l, v);
		return el;
	}

	function update(): void {
		if (!config.stats || !statsHost || !input) return;
		statsHost.innerHTML = '';
		if (input.value.length > MAX_INPUT_CHARS) {
			const warn = document.createElement('div');
			warn.className = 't-row t-row-warn';
			warn.append(
				bilingual(
					`Input exceeds 5 MB — statistics are not computed for files this large.`,
					`输入超过 5 MB —— 过大的文件不再计算统计。`,
				),
			);
			statsHost.append(warn);
			return;
		}
		for (const stat of config.stats(input.value)) statsHost.append(statRow(stat));
	}

	input.addEventListener('input', update);
	update();
}
