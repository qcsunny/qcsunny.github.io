// Converter page renderer: fixed single category, two-sided value conversion + live keyword search.
// Editing either side updates the other; swap exchanges units and values.
// Includes row-level keyword filtering and a live all-units reference grid with real-time search.

import { formatNumber } from '../calculator/engine';
import { bilingual, langAttr, langProp, onLang } from './i18n';
import { getCategory, type UnitCategory, type UnitDef } from '../../tools/units';
import type { ConverterConfig } from '../../tools/registry';

export function initConverter(host: HTMLElement, config: ConverterConfig): void {
	const cat = getCategory(config.categoryId);
	if (!cat) throw new Error(`converter: unknown category ${config.categoryId}`);

	const names = Object.keys(cat.units);

	const box = document.createElement('div');
	box.className = 't-conv';

	// Helper for matching unit by query (punctuation-insensitive, multi-token)
	function matchesUnit(name: string, u: UnitDef, query: string): boolean {
		const rawQ = query.trim().toLowerCase();
		if (!rawQ) return true;
		const cleanQ = rawQ.replace(/[\/·\s\-_]/g, '');
		const haystack = `${name} ${u.label} ${u.labelZh ?? ''} ${u.short ?? ''}`.toLowerCase();
		const cleanHaystack = haystack.replace(/[\/·\s\-_]/g, '');

		if (haystack.includes(rawQ) || (cleanQ && cleanHaystack.includes(cleanQ))) return true;

		const tokens = rawQ.split(/\s+/).filter(Boolean);
		return tokens.every((token) => {
			const cleanToken = token.replace(/[\/·\-_]/g, '');
			return haystack.includes(token) || (cleanToken && cleanHaystack.includes(cleanToken));
		});
	}

	function unitShort(c: UnitCategory, name: string): string {
		const u = c.units[name];
		if (u?.short) return u.short;
		const label = u?.label ?? name;
		const m = /\(([^)]+)\)\s*$/.exec(label);
		return m ? (m[1] as string) : label;
	}

	// <option> cannot hold a .i18n-en/.i18n-zh pair, and populate() rebuilds the
	// list on every keystroke, so one callback relabels whatever options exist
	// now — rather than one closure per option, which would pile up in the
	// language-change registry as the visitor types.
	function labelOptions(select: HTMLSelectElement, zh: boolean): void {
		for (const o of select.options) {
			if (o.dataset.nomatch) {
				o.textContent = zh ? '未找到匹配的单位' : 'No matching units';
				continue;
			}
			const u = cat.units[o.value];
			if (u) o.textContent = zh ? (u.labelZh ?? u.label) : u.label;
		}
	}

	// "1 kg = 2 jin" in the English view, "1 千克 = 2 市斤" in the Chinese one:
	// the traditional units have no Latin symbol, so short is romanised and
	// shortZh carries the character.
	function unitSymbol(name: string, zh: boolean): string {
		const u = cat.units[name];
		if (zh && u?.shortZh) return u.shortZh;
		return unitShort(cat, name);
	}

	// Create searchable unit picker: returns { picker, select, searchInput, clearBtn, populate }
	function createSearchablePicker(
		initialUnit: string,
		onUnitChange: (unitKey: string) => void,
	) {
		const picker = document.createElement('div');
		picker.className = 't-conv-picker';

		const searchBox = document.createElement('div');
		searchBox.className = 't-conv-search-box';

		const searchInput = document.createElement('input');
		searchInput.type = 'text';
		searchInput.className = 't-conv-search-input';
		langProp(searchInput, 'placeholder', '🔍 Search units (kg, pound, jin…)', '🔍 搜索单位 (如 kg, 磅, 斤)...');
		langAttr(searchInput, 'aria-label', 'Search units', '搜索单位');

		const clearBtn = document.createElement('button');
		clearBtn.type = 'button';
		clearBtn.className = 't-conv-search-clear';
		clearBtn.textContent = '×';
		langAttr(clearBtn, 'title', 'Clear search', '清除搜索');
		clearBtn.style.display = 'none';

		searchBox.append(searchInput, clearBtn);

		const select = document.createElement('select');
		select.className = 't-conv-select';
		langAttr(select, 'aria-label', 'Select unit', '选择单位');

		picker.append(searchBox, select);

		function populate(filterText: string = ''): void {
			const currentVal = select.value || initialUnit;
			const matched = names.filter((n) => matchesUnit(n, cat.units[n] as UnitDef, filterText));
			select.innerHTML = '';

			if (matched.length === 0) {
				const opt = document.createElement('option');
				opt.disabled = true;
				opt.selected = true;
				opt.dataset.nomatch = '1';
				select.append(opt);
			} else {
				for (const name of matched) {
					const opt = document.createElement('option');
					opt.value = name;
					select.append(opt);
				}
				if (matched.includes(currentVal)) {
					select.value = currentVal;
				} else {
					select.value = matched[0] as string;
					onUnitChange(select.value);
				}
			}
			clearBtn.style.display = filterText ? 'block' : 'none';
			labelOptions(select, document.documentElement.dataset.lang === 'zh');
		}

		searchInput.addEventListener('input', () => {
			populate(searchInput.value);
		});

		searchInput.addEventListener('keydown', (e) => {
			if (e.key === 'Escape') {
				searchInput.value = '';
				populate('');
			}
		});

		clearBtn.addEventListener('click', () => {
			searchInput.value = '';
			populate('');
			searchInput.focus();
		});

		select.addEventListener('change', () => {
			onUnitChange(select.value);
		});

		populate('');
		onLang((zh) => labelOptions(select, zh));
		return { picker, select, searchInput, clearBtn, populate };
	}

	const fromPicker = createSearchablePicker(names[0] as string, () => convert('from'));
	const toPicker = createSearchablePicker(names[1] ?? (names[0] as string), () => convert('from'));

	const fromInput = document.createElement('input');
	fromInput.type = 'number';
	fromInput.step = 'any';
	fromInput.inputMode = 'decimal';
	fromInput.value = '1';
	fromInput.className = 't-conv-val';
	fromInput.setAttribute('aria-label', 'Value to convert from');

	const toInput = document.createElement('input');
	toInput.type = 'number';
	toInput.step = 'any';
	toInput.inputMode = 'decimal';
	toInput.className = 't-conv-val';
	toInput.setAttribute('aria-label', 'Converted value');

	function row(labelType: 'from' | 'to', pickerEl: HTMLElement, input: HTMLInputElement): HTMLElement {
		const el = document.createElement('div');
		el.className = 't-conv-row';
		const l = document.createElement('label');
		if (labelType === 'from') {
			l.innerHTML = '<span class="i18n-en">From</span><span class="i18n-zh">原始单位</span>';
		} else {
			l.innerHTML = '<span class="i18n-en">To</span><span class="i18n-zh">转换为</span>';
		}
		el.append(l, input, pickerEl);
		return el;
	}

	const rowFrom = row('from', fromPicker.picker, fromInput);
	const rowTo = row('to', toPicker.picker, toInput);

	const swap = document.createElement('button');
	swap.type = 'button';
	swap.className = 't-btn t-conv-swap';
	swap.innerHTML = '<span class="i18n-en">⇅ Swap units</span><span class="i18n-zh">⇅ 交换单位</span>';
	langAttr(swap, 'title', 'Swap the two units', '交换两个单位');

	const note = document.createElement('p');
	note.className = 't-conv-note';

	box.append(rowFrom, swap, rowTo, note);
	host.append(box);

	// --- Live All-Units Conversion & Quick Search Table ---
	const liveWrap = document.createElement('div');
	liveWrap.className = 't-conv-live';

	const liveHeader = document.createElement('div');
	liveHeader.className = 't-conv-live-header';

	const liveTitle = document.createElement('div');
	liveTitle.className = 't-conv-live-title';
	liveTitle.innerHTML = '<span class="i18n-en">All Units Live Reference</span><span class="i18n-zh">全部单位即时换算对照表</span>';

	const liveSearchBox = document.createElement('div');
	liveSearchBox.className = 't-conv-live-searchbox';

	const liveFilter = document.createElement('input');
	liveFilter.type = 'text';
	liveFilter.className = 't-conv-live-filter';
	langProp(liveFilter, 'placeholder', '🔍 Filter every unit (jin, pound, oz, tonne…)', '🔍 搜索全部单位换算 (如: 斤, 磅, oz, 吨)...');
	langAttr(liveFilter, 'aria-label', 'Filter all unit conversions', '筛选全部单位换算');

	const liveClear = document.createElement('button');
	liveClear.type = 'button';
	liveClear.className = 't-conv-live-clear';
	liveClear.textContent = '×';
	langAttr(liveClear, 'title', 'Clear', '清除');
	liveClear.style.display = 'none';

	liveSearchBox.append(liveFilter, liveClear);
	liveHeader.append(liveTitle, liveSearchBox);

	const grid = document.createElement('div');
	grid.className = 't-conv-grid';

	const cardMap = new Map<
		string,
		{
			card: HTMLElement;
			valEl: HTMLElement;
			name: string;
			u: UnitDef;
		}
	>();

	for (const name of names) {
		const u = cat.units[name] as UnitDef;
		const card = document.createElement('div');
		card.className = 't-conv-card';
		card.dataset.unit = name;

		const cardHead = document.createElement('div');
		cardHead.className = 't-conv-card-header';

		const cardName = document.createElement('span');
		cardName.className = 't-conv-card-name';
		cardName.append(bilingual(u.label, u.labelZh));

		const cardShort = document.createElement('span');
		cardShort.className = 't-conv-card-short';
		cardShort.append(bilingual(u.short ?? name, u.shortZh));

		cardHead.append(cardName, cardShort);

		const valEl = document.createElement('div');
		valEl.className = 't-conv-card-val';
		valEl.textContent = '—';

		const actions = document.createElement('div');
		actions.className = 't-conv-card-actions';

		const toBtn = document.createElement('button');
		toBtn.type = 'button';
		toBtn.className = 't-conv-act-btn';
		toBtn.innerHTML = '<span class="i18n-en">Set as To</span><span class="i18n-zh">设为目标</span>';
		langAttr(toBtn, 'title', 'Set this unit as target', '设为目标单位');
		toBtn.addEventListener('click', () => {
			if (toPicker.searchInput.value) {
				toPicker.searchInput.value = '';
				toPicker.populate('');
			}
			toPicker.select.value = name;
			convert('from');
		});

		const fromBtn = document.createElement('button');
		fromBtn.type = 'button';
		fromBtn.className = 't-conv-act-btn';
		fromBtn.innerHTML = '<span class="i18n-en">Set as From</span><span class="i18n-zh">设为源单位</span>';
		langAttr(fromBtn, 'title', 'Set this unit as source', '设为原始单位');
		fromBtn.addEventListener('click', () => {
			if (fromPicker.searchInput.value) {
				fromPicker.searchInput.value = '';
				fromPicker.populate('');
			}
			fromPicker.select.value = name;
			convert('from');
		});

		actions.append(toBtn, fromBtn);
		card.append(cardHead, valEl, actions);
		grid.append(card);

		cardMap.set(name, { card, valEl, name, u });
	}

	liveWrap.append(liveHeader, grid);
	host.append(liveWrap);

	function filterLiveGrid(query: string): void {
		let visibleCount = 0;
		for (const [name, entry] of cardMap.entries()) {
			const visible = matchesUnit(name, entry.u, query);
			entry.card.style.display = visible ? '' : 'none';
			if (visible) visibleCount++;
		}
		liveClear.style.display = query ? 'block' : 'none';

		let emptyMsg = grid.querySelector<HTMLElement>('.t-conv-empty');
		if (visibleCount === 0) {
			if (!emptyMsg) {
				emptyMsg = document.createElement('div');
				emptyMsg.className = 't-conv-empty';
				emptyMsg.innerHTML = '<span class="i18n-en">No units found matching your search.</span><span class="i18n-zh">未检索到匹配的单位。</span>';
				grid.append(emptyMsg);
			}
		} else if (emptyMsg) {
			emptyMsg.remove();
		}
	}

	liveFilter.addEventListener('input', () => filterLiveGrid(liveFilter.value));
	liveClear.addEventListener('click', () => {
		liveFilter.value = '';
		filterLiveGrid('');
		liveFilter.focus();
	});

	// --- Conversion Logic ---
	let syncing = false;

	function convert(source: 'from' | 'to'): void {
		if (syncing) return;
		const fromUnitKey = fromPicker.select.value;
		const toUnitKey = toPicker.select.value;
		const from = cat.units[fromUnitKey];
		const to = cat.units[toUnitKey];
		if (!from || !to) return;

		const src = source === 'from' ? fromInput : toInput;
		const dst = source === 'from' ? toInput : fromInput;
		const raw = src.value.trim();

		// Update active highlights on grid cards
		for (const [name, entry] of cardMap.entries()) {
			entry.card.classList.toggle('is-active-from', name === fromUnitKey);
			entry.card.classList.toggle('is-active-to', name === toUnitKey);
		}

		if (raw === '' || !Number.isFinite(Number(raw))) {
			syncing = true;
			dst.value = '';
			syncing = false;
			note.textContent = '';
			for (const entry of cardMap.values()) {
				entry.valEl.textContent = '—';
			}
			return;
		}

		const v = Number(raw);
		const baseValue = source === 'from' ? from.toBase(v) : to.toBase(v);
		const out = source === 'from' ? to.fromBase(baseValue) : from.fromBase(baseValue);

		syncing = true;
		dst.value = formatNumber(out);
		syncing = false;

		const zh = document.documentElement.dataset.lang === 'zh';
		note.textContent = `1 ${unitSymbol(fromUnitKey, zh)} = ${formatNumber(
			to.fromBase(from.toBase(1)),
		)} ${unitSymbol(toUnitKey, zh)}`;

		// Update all cards in live grid based on baseValue
		for (const [name, entry] of cardMap.entries()) {
			const convertedVal = entry.u.fromBase(baseValue);
			entry.valEl.textContent = `${formatNumber(convertedVal)} ${unitSymbol(name, zh)}`;
		}
	}

	fromInput.addEventListener('input', () => convert('from'));
	toInput.addEventListener('input', () => convert('to'));

	swap.addEventListener('click', () => {
		const fromUnit = fromPicker.select.value;
		const toUnit = toPicker.select.value;

		if (fromPicker.searchInput.value) {
			fromPicker.searchInput.value = '';
			fromPicker.populate('');
		}
		if (toPicker.searchInput.value) {
			toPicker.searchInput.value = '';
			toPicker.populate('');
		}

		fromPicker.select.value = toUnit;
		toPicker.select.value = fromUnit;

		if (toInput.value) fromInput.value = toInput.value;
		convert('from');
	});

	convert('from');

	// The ratio note and the 30-odd card values are plain text carrying a unit
	// symbol, so they are rewritten rather than swapped by CSS: recompute once
	// per language change.
	onLang(() => convert('from'));
}

