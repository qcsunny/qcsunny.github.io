// Generic form-tool renderer: builds the input grid from a FormConfig and
// recomputes results live on every input. All DOM is created with
// createElement/textContent (no HTML string building).

import type { FormConfig, FormField, FormResult, FormResultRow, FormTable, FormValues } from '../../tools/registry';
// Type-only import: erased at build time, so it does not pull the PNG renderer
// into this bundle (the module itself is imported dynamically on click).
import type { PngExportData } from './pngExport';

export function initForm(host: HTMLElement, config: FormConfig): void {
	const getters = new Map<string, () => string | boolean>();
	const controls: Array<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement> = [];
	const fieldWraps = new Map<string, HTMLElement>();
	const reqStars = new Map<string, HTMLElement>();
	const controlsMap = new Map<string, HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>();
	const reqTips = new Map<string, HTMLElement>();
	const bilingualOptions: { el: HTMLOptionElement; en: string; zh: string }[] = [];

	// Slug used as localStorage key prefix (Feature 2)
	const slug = document.documentElement.dataset.toolSlug ?? '';

	const form = document.createElement('div');
	form.className = 't-form';

	for (const field of config.fields) {
		form.append(fieldEl(field));
	}
	host.append(form);

	const results = document.createElement('div');
	results.className = 't-results';

	// Feature 3: Export/Print button bar (created before host.append so update() can reference it)
	const exportBar = document.createElement('div');
	exportBar.className = 't-export-bar';
	exportBar.style.display = 'none';
	const exportBtn = document.createElement('button');
	exportBtn.className = 't-export-btn';
	const exportEnSpan = document.createElement('span');
	exportEnSpan.className = 'i18n-en';
	exportEnSpan.textContent = '🖨 Print / Save PDF';
	const exportZhSpan = document.createElement('span');
	exportZhSpan.className = 'i18n-zh';
	exportZhSpan.textContent = '🖨 打印 / 导出 PDF';
	exportBtn.append(exportEnSpan, exportZhSpan);
	exportBtn.addEventListener('click', () => window.print());

	// Second export path: a branded PNG of the same numbers, for pasting into
	// chat. The renderer is dynamically imported on first click so its layout
	// code stays out of the bundle every tool page already downloads.
	const pngBtn = document.createElement('button');
	pngBtn.className = 't-export-btn';
	pngBtn.append(makeBilingualSpan('🖼 Save as PNG', '🖼 导出 PNG 长图'));
	pngBtn.addEventListener('click', () => {
		const data = collectExportData();
		if (!data) return;
		pngBtn.disabled = true;
		void import('./pngExport')
			.then((m) => m.exportResultsPng(data))
			.finally(() => {
				pngBtn.disabled = false;
			});
	});

	exportBar.append(exportBtn, pngBtn);

	host.append(results);
	host.append(exportBar);

	const values: FormValues = {
		num: (id) => Number(String(getters.get(id)?.() ?? '')),
		str: (id) => String(getters.get(id)?.() ?? '').trim(),
		bool: (id) => getters.get(id)?.() === true,
	};

	// Last successful compute(), so the PNG export renders exactly what is on
	// screen instead of recomputing and risking a different (or throwing) run.
	let lastOut: FormResult | null = null;

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
		fieldWraps.set(field.id, wrap);

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
			controlsMap.set(field.id, cb);
			const text = document.createElement('span');
			text.append(makeBilingualSpan(field.label, field.labelZh));
			row.append(cb, text);
			wrap.append(row);
			return wrap;
		}

		const label = document.createElement('label');
		label.htmlFor = `t-f-${field.id}`;
		label.append(makeBilingualSpan(field.label, field.labelZh));

		const req = document.createElement('span');
		req.className = 't-req';
		req.title = 'Required / 必填项';
		req.textContent = ' *';
		req.style.display = 'none';
		reqStars.set(field.id, req);
		label.append(req);

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
				// An <option> cannot hold the pair of .i18n-en / .i18n-zh spans used
				// everywhere else, so the text is swapped on language change instead
				// (see applyOptionLang). It used to render `${label} (${labelZh})`,
				// which showed both languages at once in both languages — and since
				// several English labels carried the Chinese in parentheses already,
				// the Chinese appeared twice in one option.
				bilingualOptions.push({ el: o, en: opt.label, zh: opt.labelZh ?? opt.label });
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
			ta.placeholder = field.placeholder ?? 'Required / 必填';
			getters.set(field.id, () => ta.value);
			control = ta;
		} else {
			const input = document.createElement('input');
			input.type = field.type === 'number' ? 'number' : 'text';
			if (field.step) input.step = field.step;
			if (field.min) input.min = field.min;
			if (field.max) input.max = field.max;
			input.value = field.def ?? '';
			input.placeholder = field.placeholder ?? (field.type === 'number' ? 'Required / 必填数值' : 'Required / 必填');
			getters.set(field.id, () => input.value);
			control = input;
		}
		control.id = `t-f-${field.id}`;
		controls.push(control);
		controlsMap.set(field.id, control);
		wrap.append(control);

		// Validation tip and hint share one row of the field's subgrid (see the
		// .t-field rules in ToolShell.astro), so the wrapper is always created even
		// when there is no hint: it keeps every field at exactly three grid items,
		// which is what lets the inputs of a row line up regardless of how many
		// lines each label wraps to.
		const below = document.createElement('div');
		below.className = 't-below';

		const tip = document.createElement('span');
		tip.className = 't-req-tip';
		tip.style.display = 'none';
		const tipEn = field.type === 'number' ? 'This field is required (valid number)' : 'This field is required';
		const tipZh = field.type === 'number' ? '此项为必填项，请输入有效数值' : '此项为必填项，请填写内容';
		tip.append(makeBilingualSpan(tipEn, tipZh));
		below.append(tip);
		reqTips.set(field.id, tip);

		control.addEventListener('blur', update);

		if (field.hint) {
			const hint = document.createElement('span');
			hint.className = 't-hint';
			hint.append(makeBilingualSpan(field.hint, field.hintZh));
			below.append(hint);
		}
		wrap.append(below);
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

	/** Snapshot of what the results area currently shows, in the active
	 *  language, shaped for the PNG renderer. Null until a compute() succeeds. */
	function collectExportData(): PngExportData | null {
		if (!lastOut) return null;
		const zh = document.documentElement.dataset.lang === 'zh';
		const titleEl = document.querySelector(zh ? '.t-title .i18n-zh' : '.t-title .i18n-en');
		const title = (titleEl?.textContent ?? document.title).trim();

		const inputs: Array<{ label: string; value: string }> = [];
		for (const f of config.fields) {
			if (fieldWraps.get(f.id)?.style.display === 'none') continue;
			const raw = getters.get(f.id)?.();
			if (raw === undefined) continue;

			let value: string;
			if (typeof raw === 'boolean') {
				value = raw ? (zh ? '是' : 'Yes') : zh ? '否' : 'No';
			} else {
				const text = raw.trim();
				if (!text) continue;
				// A select's raw value is an option id; show the human label.
				const opt = f.type === 'select' ? f.options?.find((o) => o.value === text) : undefined;
				value = opt ? (zh ? opt.labelZh || opt.label : opt.label) : text;
			}
			const suffix = zh ? f.suffixZh || f.suffix : f.suffix;
			inputs.push({
				label: zh ? f.labelZh || f.label : f.label,
				value: suffix ? `${value} ${suffix}` : value,
			});
		}

		const t = lastOut.table;
		return {
			title,
			lang: zh ? 'zh' : 'en',
			inputs,
			results: lastOut.rows.map((r) => ({
				label: zh ? r.labelZh || r.label : r.label,
				value: r.value,
				emphasis: r.emphasis,
			})),
			table: t ? { columns: zh && t.columnsZh ? t.columnsZh : t.columns, rows: t.rows } : undefined,
			note: zh ? lastOut.noteZh || lastOut.note : lastOut.note,
			filename: `${slug || 'result'}-${new Date().toISOString().slice(0, 10)}`,
		};
	}

	function update(): void {
		results.innerHTML = '';
		host.querySelectorAll('.t-tablewrap, .t-note, .t-chartwrap').forEach((el) => el.remove());

		// 1. Evaluate field visibility (showIf)
		for (const f of config.fields) {
			const wrap = fieldWraps.get(f.id);
			if (!wrap) continue;
			let isVisible = true;
			if (f.showIf) {
				try {
					isVisible = Boolean(f.showIf(values));
				} catch {
					isVisible = true;
				}
			}
			wrap.style.display = isVisible ? '' : 'none';
		}

		// 2. Evaluate dynamic required fields and collect missing required fields
		const missingFields: FormField[] = [];
		for (const f of config.fields) {
			const wrap = fieldWraps.get(f.id);
			const isVisible = wrap ? wrap.style.display !== 'none' : true;
			const ctrl = controlsMap.get(f.id);
			const star = reqStars.get(f.id);
			const tip = reqTips.get(f.id);

			if (!isVisible) {
				if (star) star.style.display = 'none';
				ctrl?.classList.remove('t-invalid');
				if (tip) tip.style.display = 'none';
				continue;
			}

			let isReq = false;
			if (typeof f.required === 'function') {
				try {
					isReq = Boolean(f.required(values));
				} catch {
					isReq = false;
				}
			} else {
				isReq = Boolean(f.required);
			}

			if (star) star.style.display = isReq ? '' : 'none';

			if (isReq) {
				const raw = String(getters.get(f.id)?.() ?? '').trim();
				const isBad = raw === '' || (f.type === 'number' && !Number.isFinite(Number(raw)));
				if (isBad) {
					missingFields.push(f);
					ctrl?.classList.add('t-invalid');
					if (tip) tip.style.display = 'block';
				} else {
					ctrl?.classList.remove('t-invalid');
					if (tip) tip.style.display = 'none';
				}
			} else {
				ctrl?.classList.remove('t-invalid');
				if (tip) tip.style.display = 'none';
			}
		}

		// 3. Intelligent prompt if any required field is missing
		if (missingFields.length > 0) {
			lastOut = null;
			exportBar.style.display = 'none';
			const zhNames = missingFields.map((f) => f.labelZh || f.label).join('、');
			const enNames = missingFields.map((f) => f.label).join(', ');
			const promptRow = resultRow({
				label: `Required: ${enNames}`,
				labelZh: `请填写必填项：${zhNames}`,
				value: 'Please enter valid values in highlighted field(s) / 请在上方高亮标注框中输入有效数值',
				emphasis: false,
			});
			promptRow.classList.add('t-row-warn');
			results.append(promptRow);
			return;
		}

		// 4. Compute and render results
		try {
			const out = config.compute(values);
			lastOut = out;
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

			// Show export bar on successful render (Feature 3)
			exportBar.style.display = '';

			// Save draft to localStorage (Feature 2)
			if (slug) {
				try {
					const data: Record<string, string | boolean> = {};
					for (const f of config.fields) {
						const val = getters.get(f.id)?.();
						if (val !== undefined) data[f.id] = val;
					}
					localStorage.setItem(`tool-draft:${slug}`, JSON.stringify(data));
				} catch {
					// localStorage may be disabled; silently ignore
				}
			}
		} catch (err) {
			lastOut = null;
			exportBar.style.display = 'none';
			const note = document.createElement('p');
			note.className = 't-note';
			note.textContent = err instanceof Error ? err.message : 'Invalid input.';
			host.append(note);
		}
	}

	controls.forEach((c) => {
		c.addEventListener('input', update);
		c.addEventListener('change', update);

		// Feature 1: Enter / Esc key handling
		c.addEventListener('keydown', (e: Event) => {
			const ke = e as KeyboardEvent;
			const tag = c.tagName.toLowerCase();
			const isTextarea = tag === 'textarea';
			const isSelect = tag === 'select';

			if (ke.key === 'Enter') {
				if (!isTextarea) {
					ke.preventDefault();
					update();
				}
				// textarea: let Enter pass through for newline behavior
			} else if (ke.key === 'Escape') {
				// Only clear text/number/textarea inputs — never clear select
				if (!isSelect) {
					ke.preventDefault();
					(c as HTMLInputElement | HTMLTextAreaElement).value = '';
					update();
				}
			}
		});
	});

	// Feature 2: Restore draft from localStorage (before first update())
	if (slug) {
		try {
			const raw = localStorage.getItem(`tool-draft:${slug}`);
			if (raw) {
				const data = JSON.parse(raw) as Record<string, string | boolean>;
				for (const [id, val] of Object.entries(data)) {
					const ctrl = controlsMap.get(id);
					if (!ctrl) continue;
					if (ctrl instanceof HTMLInputElement && ctrl.type === 'checkbox') {
						ctrl.checked = Boolean(val);
					} else {
						(ctrl as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value = String(val);
					}
				}
			}
		} catch {
			// localStorage may be disabled or JSON malformed; silently ignore
		}
	}

	function applyOptionLang(): void {
		const zh = document.documentElement.dataset.lang === 'zh';
		for (const o of bilingualOptions) o.el.textContent = zh ? o.zh : o.en;
	}
	applyOptionLang();
	if (bilingualOptions.length) {
		new MutationObserver(applyOptionLang).observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['data-lang'],
		});
	}

	update();
}
