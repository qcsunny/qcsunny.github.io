// Text-tool renderer: a textarea with live statistics rows and optional
// button-triggered transforms (JSON formatting, Base64, …) writing into an
// output area. Backs word/character counters, JSON formatter, Base64, hash generator,
// and the average/statistics calculator.

import type { TextConfig, TextStat, TextTransform } from '../../tools/registry';
import { bilingual, langAttr, langProp, setBilingual } from './i18n';

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
			const currentSeq = ++runSeq;
			try {
				const r = t.run(input.value);
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
			const btns = btnRow.querySelectorAll<HTMLButtonElement>('.t-btn');
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
		for (const stat of config.stats(input.value)) statsHost.append(statRow(stat));
	}

	input.addEventListener('input', update);
	update();
}
