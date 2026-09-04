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
		wrap.className = 't-field';

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
			ta.placeholder = field.placeholder ?? '';
			getters.set(field.id, () => ta.value);
			control = ta;
		} else {
			const input = document.createElement('input');
			input.type = field.type === 'number' ? 'number' : 'text';
			if (field.step) input.step = field.step;
			if (field.min) input.min = field.min;
			if (field.max) input.max = field.max;
			input.value = field.def ?? '';
			input.placeholder = field.placeholder ?? '';
			getters.set(field.id, () => input.value);
			control = input;
		}
		control.id = `t-f-${field.id}`;
		controls.push(control);
		wrap.append(control);

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
		host.querySelectorAll('.t-tablewrap, .t-note').forEach((el) => el.remove());
		try {
			const out = config.compute(values);
			for (const row of out.rows) results.append(resultRow(row));
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
