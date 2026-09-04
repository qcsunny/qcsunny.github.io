// Generic form-tool renderer: builds the input grid from a FormConfig and
// recomputes results live on every input. All DOM is created with
// createElement/textContent (no HTML string building).

import type { FormConfig, FormField, FormResultRow, FormTable, FormValues } from '../../tools/registry';

export function initForm(host: HTMLElement, config: FormConfig): void {
	const getters = new Map<string, () => string | boolean>();
	const controls: Array<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement> = [];

	const form = document.createElement('div');
	form.className = 't-form';

	for (const field of config.fields) {
		form.append(fieldEl(field));
	}
	host.append(form);

	const results = document.createElement('div');
	results.className = 't-results';
	host.append(results);

	const values: FormValues = {
		num: (id) => Number(String(getters.get(id)?.() ?? '')),
		str: (id) => String(getters.get(id)?.() ?? '').trim(),
		bool: (id) => getters.get(id)?.() === true,
	};

	function makeBilingualSpan(en: string, zh?: string): Node {
		if (!zh) return document.createTextNode(en);
		const frag = document.createDocumentFragment();
		const enEl = document.createElement('span');
		enEl.className = 'i18n-en';
		enEl.textContent = en;
		const zhEl = document.createElement('span');
		zhEl.className = 'i18n-zh';
		zhEl.textContent = zh;
		frag.append(enEl, zhEl);
		return frag;
	}

	function fieldEl(field: FormField): HTMLElement {
		const wrap = document.createElement('div');
		wrap.className = field.wide ? 't-field t-wide' : 't-field';

		if (field.type === 'checkbox') {
			const row = document.createElement('label');
			row.className = 't-checkrow';
			const cb = document.createElement('input');
			cb.type = 'checkbox';
			cb.className = 't-check';
			cb.id = `t-f-${field.id}`;
			cb.checked = field.def === 'true';
			getters.set(field.id, () => cb.checked);
			controls.push(cb);
			const text = document.createElement('span');
			text.append(makeBilingualSpan(field.label, field.labelZh));
			row.append(cb, text);
			wrap.append(row);
			return wrap;
		}

		const label = document.createElement('label');
		label.htmlFor = `t-f-${field.id}`;
		label.append(makeBilingualSpan(field.label, field.labelZh));
		if (field.required) {
			const req = document.createElement('span');
			req.className = 't-req';
			req.title = 'Required / 必填项';
			req.textContent = ' *';
			label.append(req);
		}
		if (field.suffix) {
			const s = document.createElement('span');
			s.className = 't-suffix';
			s.append(makeBilingualSpan(` ${field.suffix}`, field.suffixZh ? ` ${field.suffixZh}` : undefined));
			label.append(s);
		}
		wrap.append(label);

		let control: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
		if (field.type === 'select') {
			const sel = document.createElement('select');
			for (const opt of field.options ?? []) {
				const o = document.createElement('option');
				o.value = opt.value;
				o.textContent = opt.labelZh ? `${opt.label} (${opt.labelZh})` : opt.label;
				sel.append(o);
			}
			if (field.def !== undefined) sel.value = field.def;
			getters.set(field.id, () => sel.value);
			control = sel;
		} else if (field.type === 'textarea') {
			const ta = document.createElement('textarea');
			ta.className = 't-textarea';
			ta.rows = 3;
			ta.value = field.def ?? '';
			ta.placeholder = field.placeholder ?? (field.required ? 'Required / 必填' : '');
			getters.set(field.id, () => ta.value);
			control = ta;
		} else {
			const input = document.createElement('input');
			input.type = field.type === 'number' ? 'number' : 'text';
			if (field.step) input.step = field.step;
			if (field.min) input.min = field.min;
			if (field.max) input.max = field.max;
			input.value = field.def ?? '';
			input.placeholder = field.placeholder ?? (field.required ? 'Required / 必填数值' : '');
			getters.set(field.id, () => input.value);
			control = input;
		}
		control.id = `t-f-${field.id}`;
		controls.push(control);
		wrap.append(control);

		if (field.required) {
			const tip = document.createElement('span');
			tip.className = 't-req-tip';
			tip.style.display = 'none';
			tip.append(makeBilingualSpan('This field is required', '此项为必填项，请输入数值'));
			wrap.append(tip);

			const checkValidity = () => {
				const raw = String(control.value ?? '').trim();
				const isBad = raw === '' || (field.type === 'number' && !Number.isFinite(Number(raw)));
				if (isBad) {
					control.classList.add('t-invalid');
					tip.style.display = 'block';
				} else {
					control.classList.remove('t-invalid');
					tip.style.display = 'none';
				}
			};
			control.addEventListener('input', checkValidity);
			control.addEventListener('blur', checkValidity);
		}

		if (field.hint) {
			const hint = document.createElement('span');
			hint.className = 't-hint';
			hint.append(makeBilingualSpan(field.hint, field.hintZh));
			wrap.append(hint);
		}
		return wrap;
	}

	function resultRow(row: FormResultRow): HTMLElement {
		const el = document.createElement('div');
		el.className = row.emphasis ? 't-row t-emph' : 't-row';
		const l = document.createElement('span');
		l.className = 't-row-label';
		l.append(makeBilingualSpan(row.label, row.labelZh));
		const v = document.createElement('span');
		v.className = 't-row-value';
		v.textContent = row.value;
		el.append(l, v);
		return el;
	}

	function tableEl(table: FormTable): HTMLElement {
		const wrap = document.createElement('div');
		wrap.className = 't-tablewrap';
		const t = document.createElement('table');
		t.className = 't-table';
		const thead = document.createElement('thead');
		const headRow = document.createElement('tr');
		table.columns.forEach((col, idx) => {
			const th = document.createElement('th');
			th.scope = 'col';
			const zhCol = table.columnsZh ? table.columnsZh[idx] : undefined;
			th.append(makeBilingualSpan(col, zhCol));
			headRow.append(th);
		});
		thead.append(headRow);
		const tbody = document.createElement('tbody');
		for (const cells of table.rows) {
			const tr = document.createElement('tr');
			for (const cell of cells) {
				const td = document.createElement('td');
				td.textContent = cell;
				tr.append(td);
			}
			tbody.append(tr);
		}
		t.append(thead, tbody);
		wrap.append(t);
		return wrap;
	}

	function update(): void {
		results.innerHTML = '';
		host.querySelectorAll('.t-tablewrap, .t-note, .t-chartwrap').forEach((el) => el.remove());

		let missingRequired = false;
		for (const f of config.fields) {
			if (f.required) {
				const raw = String(getters.get(f.id)?.() ?? '').trim();
				if (raw === '' || (f.type === 'number' && !Number.isFinite(Number(raw)))) {
					missingRequired = true;
					break;
				}
			}
		}

		if (missingRequired) {
			const promptRow = resultRow({
				label: 'Input prompt',
				labelZh: '输入提示',
				value: 'Please fill in all required fields marked with * / 请完整填写带 * 的必填项',
				emphasis: false,
			});
			results.append(promptRow);
			return;
		}

		try {
			const out = config.compute(values);
			for (const row of out.rows) results.append(resultRow(row));
			if (out.chartSvg) {
				const chartEl = document.createElement('div');
				chartEl.className = 't-chartwrap';
				chartEl.innerHTML = out.chartSvg;
				host.append(chartEl);
			}
			if (out.table) host.append(tableEl(out.table));
			if (out.note) {
				const note = document.createElement('p');
				note.className = 't-note';
				note.append(makeBilingualSpan(out.note, out.noteZh));
				host.append(note);
			}
		} catch (err) {
			const note = document.createElement('p');
			note.className = 't-note';
			note.textContent = err instanceof Error ? err.message : 'Invalid input.';
			host.append(note);
		}
	}

	controls.forEach((c) => {
		c.addEventListener('input', update);
		c.addEventListener('change', update);
	});
	update();
}
