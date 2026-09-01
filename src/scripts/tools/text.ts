// Text-tool renderer: a textarea with live statistics rows and optional
// button-triggered transforms (JSON formatting, Base64, …) writing into an
// output area. Backs word/character counters, JSON formatter, Base64 and the
// average/statistics calculator.

import type { TextConfig, TextStat } from '../../tools/registry';

export function initText(host: HTMLElement, config: TextConfig): void {
	const input = document.createElement('textarea');
	input.className = config.mono ? 't-textarea t-mono' : 't-textarea';
	input.rows = 6;
	input.spellcheck = false;
	input.placeholder = config.placeholder ?? '';
	input.setAttribute('aria-label', 'Text input');
	host.append(input);

	let statsHost: HTMLElement | null = null;
	if (config.stats) {
		const label = document.createElement('span');
		label.className = 't-label';
		label.textContent = 'Statistics';
		statsHost = document.createElement('div');
		statsHost.className = 't-results';
		host.append(label, statsHost);
	}

	let outLabel: HTMLElement | null = null;
	let out: HTMLTextAreaElement | null = null;
	let errEl: HTMLElement | null = null;
	if (config.transforms?.length) {
		const btnRow = document.createElement('div');
		btnRow.className = 't-btnrow';
		for (const t of config.transforms ?? []) {
			const btn = document.createElement('button');
			btn.type = 'button';
			btn.className = 't-btn';
			btn.textContent = t.label;
			btn.addEventListener('click', () => {
				if (!out) return;
				try {
					const r = t.run(input.value);
					out.value = r.output;
					if (errEl) errEl.textContent = r.error ?? '';
				} catch (err) {
					out.value = '';
					if (errEl) errEl.textContent = err instanceof Error ? err.message : 'Error';
				}
			});
			btnRow.append(btn);
		}
		host.append(btnRow);

		outLabel = document.createElement('span');
		outLabel.className = 't-label';
		outLabel.textContent = 'Output';
		out = document.createElement('textarea');
		out.className = 't-textarea t-mono t-out';
		out.rows = 8;
		out.readOnly = true;
		out.setAttribute('aria-label', 'Output');
		errEl = document.createElement('p');
		errEl.className = 't-error';
		host.append(outLabel, out, errEl);
	}

	function statRow(stat: TextStat): HTMLElement {
		const el = document.createElement('div');
		el.className = 't-row';
		const l = document.createElement('span');
		l.className = 't-row-label';
		l.textContent = stat.label;
		const v = document.createElement('span');
		v.className = 't-row-value';
		v.textContent = stat.value;
		el.append(l, v);
		return el;
	}

	function update(): void {
		if (!config.stats || !statsHost) return;
		statsHost.innerHTML = '';
		for (const stat of config.stats(input.value)) statsHost.append(statRow(stat));
	}

	input.addEventListener('input', update);
	update();
}
