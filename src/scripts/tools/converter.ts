// Converter page renderer: fixed single category, two-sided value conversion.
// Editing either side updates the other; swap exchanges units and values.

import { formatNumber } from '../calculator/engine';
import { getCategory, type UnitCategory } from '../../tools/units';
import type { ConverterConfig } from '../../tools/registry';

export function initConverter(host: HTMLElement, config: ConverterConfig): void {
	const cat = getCategory(config.categoryId);
	if (!cat) throw new Error(`converter: unknown category ${config.categoryId}`);

	const names = Object.keys(cat.units);

	const box = document.createElement('div');
	box.className = 't-conv';

	const fromSel = unitSelect(cat, names[0] as string);
	const toSel = unitSelect(cat, names[1] ?? names[0]);
	const fromInput = document.createElement('input');
	fromInput.type = 'number';
	fromInput.step = 'any';
	fromInput.inputMode = 'decimal';
	fromInput.value = '1';
	fromInput.setAttribute('aria-label', 'Value to convert from');
	const toInput = document.createElement('input');
	toInput.type = 'number';
	toInput.step = 'any';
	toInput.inputMode = 'decimal';
	toInput.setAttribute('aria-label', 'Converted value');

	const rowFrom = row('From', fromSel, fromInput);
	const rowTo = row('To', toSel, toInput);

	const swap = document.createElement('button');
	swap.type = 'button';
	swap.className = 't-btn t-conv-swap';
	swap.innerHTML = '<span class="i18n-en">⇅ Swap units</span><span class="i18n-zh">⇅ 交换单位</span>';
	swap.title = 'Swap the two units / 交换两个单位';

	const note = document.createElement('p');
	note.className = 't-conv-note';

	box.append(rowFrom, swap, rowTo, note);
	host.append(box);

	// true while writing the other side programmatically
	let syncing = false;

	function convert(source: 'from' | 'to'): void {
		if (syncing) return;
		const from = cat.units[fromSel.value];
		const to = cat.units[toSel.value];
		if (!from || !to) return;
		const src = source === 'from' ? fromInput : toInput;
		const dst = source === 'from' ? toInput : fromInput;
		const raw = src.value.trim();
		if (raw === '' || !Number.isFinite(Number(raw))) {
			syncing = true;
			dst.value = '';
			syncing = false;
			note.textContent = '';
			return;
		}
		const v = Number(raw);
		const out =
			source === 'from' ? to.fromBase(from.toBase(v)) : from.fromBase(to.toBase(v));
		syncing = true;
		dst.value = formatNumber(out);
		syncing = false;
		note.textContent = `1 ${unitShort(cat, fromSel.value)} = ${formatNumber(
			to.fromBase(from.toBase(1)),
		)} ${unitShort(cat, toSel.value)}`;
	}

	function unitSelect(c: UnitCategory, initial: string): HTMLSelectElement {
		const sel = document.createElement('select');
		sel.setAttribute('aria-label', 'Unit');
		for (const name of names) {
			const opt = document.createElement('option');
			opt.value = name;
			const u = c.units[name];
			if (u?.labelZh) {
				opt.textContent = `${u.label} · ${u.labelZh}`;
			} else {
				opt.textContent = u?.label ?? name;
			}
			sel.append(opt);
		}
		sel.value = initial;
		return sel;
	}

	function unitShort(c: UnitCategory, name: string): string {
		const u = c.units[name];
		if (u?.short) return u.short;
		const label = u?.label ?? name;
		const m = /\(([^)]+)\)\s*$/.exec(label);
		return m ? (m[1] as string) : label;
	}

	function row(label: string, sel: HTMLSelectElement, input: HTMLInputElement): HTMLElement {
		const el = document.createElement('div');
		el.className = 't-conv-row';
		const l = document.createElement('label');
		if (label === 'From') {
			l.innerHTML = '<span class="i18n-en">From</span><span class="i18n-zh">原始单位</span>';
		} else if (label === 'To') {
			l.innerHTML = '<span class="i18n-en">To</span><span class="i18n-zh">转换为</span>';
		} else {
			l.textContent = label;
		}
		el.append(l, sel, input);
		return el;
	}

	fromInput.addEventListener('input', () => convert('from'));
	toInput.addEventListener('input', () => convert('to'));
	fromSel.addEventListener('change', () => convert('from'));
	toSel.addEventListener('change', () => convert('from'));
	swap.addEventListener('click', () => {
		const fromUnit = fromSel.value;
		fromSel.value = toSel.value;
		toSel.value = fromUnit;
		// carry the converted value into the left side
		if (toInput.value) fromInput.value = toInput.value;
		convert('from');
	});

	convert('from');
}
