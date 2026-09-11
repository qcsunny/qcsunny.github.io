// CSS Grid + Flexbox visual generators. The DOM is the preview engine: the
// playground is a real CSS grid/flex container whose properties the controls
// edit, and the output pane prints the CSS that produces exactly what you see.
// Selects carry CSS keywords (row, space-between — identical in both
// languages), so only the surrounding labels need bilingual spans.

function span2(en: string, zh: string): Node {
	// Identical text ships as a bare node — the site convention (a lone
	// .i18n-en span renders blank in the Chinese view).
	if (en === zh) return document.createTextNode(en);
	const e = document.createElement('span');
	e.className = 'i18n-en';
	e.textContent = en;
	const z = document.createElement('span');
	z.className = 'i18n-zh';
	z.textContent = zh;
	const wrap = document.createElement('span');
	wrap.append(e, z);
	return wrap;
}

function mkBtn(en: string, zh: string, onClick: () => void): HTMLButtonElement {
	const b = document.createElement('button');
	b.type = 'button';
	b.className = 't-btn';
	b.append(span2(en, zh));
	b.addEventListener('click', onClick);
	return b;
}

/** A labeled control wrapper: <label class="t-metafield"><span>…</span>control</label> */
function field(label: Node, control: HTMLElement): HTMLElement {
	const wrap = document.createElement('label');
	wrap.className = 't-metafield t-csslayout-field';
	wrap.append(label, control);
	return wrap;
}

function codeBlock(): { pre: HTMLPreElement; set: (css: string) => void } {
	const pre = document.createElement('pre');
	pre.className = 't-csscode';
	return { pre, set: (css) => (pre.textContent = css) };
}

// --- CSS Grid generator ---------------------------------------------------------------------

interface GridItem {
	r1: number;
	r2: number; // 1-based, inclusive
	c1: number;
	c2: number;
	color: number;
}

export function initGridGen(host: HTMLElement): void {
	let cols = ['200px', '1fr', '1fr'];
	let rows = ['80px', 'auto'];
	let gap = 8;
	let items: GridItem[] = [];

	const controls = document.createElement('div');
	controls.className = 't-filerow t-csslayout-ctrl';

	const playground = document.createElement('div');
	playground.className = 't-gridgen-play';

	const { pre, set: setCode } = codeBlock();

	const renderTracks = (): void => {
		playground.style.display = 'grid';
		playground.style.gridTemplateColumns = cols.join(' ');
		playground.style.gridTemplateRows = rows.join(' ');
		playground.style.gap = `${gap}px`;
		playground.innerHTML = '';
		// one clickable cell per track intersection. Cells are placed
		// EXPLICITLY: auto-placed cells would be pushed around by the
		// explicitly-positioned items, detaching data-r/c from the visual
		// position and breaking every later drag.
		for (let r = 1; r <= rows.length; r++) {
			for (let c = 1; c <= cols.length; c++) {
				const cell = document.createElement('div');
				cell.className = 't-gridgen-cell';
				cell.dataset.r = String(r);
				cell.dataset.c = String(c);
				cell.style.gridColumn = String(c);
				cell.style.gridRow = String(r);
				playground.append(cell);
			}
		}
		// items live above the cells
		items.forEach((it, i) => {
			const el = document.createElement('div');
			el.className = 't-gridgen-item';
			el.textContent = String(i + 1);
			el.style.gridColumn = `${it.c1} / ${it.c2 + 1}`;
			el.style.gridRow = `${it.r1} / ${it.r2 + 1}`;
			el.style.setProperty('--item-color', `var(--item-${(it.color % 6) + 1})`);
			// a click (not a drag) on an item removes it
			el.addEventListener('click', (e) => {
				e.stopPropagation();
				items = items.filter((x) => x !== it);
				refresh(); // re-render AND re-emit the CSS
			});
			playground.append(el);
		});
	};

	const emit = (): string => {
		const lines = [
			'.grid-container {',
			'  display: grid;',
			`  grid-template-columns: ${cols.join(' ')};`,
			`  grid-template-rows: ${rows.join(' ')};`,
			`  gap: ${gap}px;`,
			'}',
		];
		items.forEach((it, i) => {
			const cw = it.c2 - it.c1 + 1;
			const rw = it.r2 - it.r1 + 1;
			const col = cw > 1 ? `${it.c1} / span ${cw}` : `${it.c1}`;
			const row = rw > 1 ? `${it.r1} / span ${rw}` : `${it.r1}`;
			lines.push(`.item-${i + 1} { grid-column: ${col}; grid-row: ${row}; }`);
		});
		return lines.join('\n');
	};

	const refresh = (): void => {
		renderTracks();
		setCode(emit());
	};

	// --- track editors ---
	const trackEditor = (
		tracks: () => string[],
		setTracks: (t: string[]) => void,
		labelEn: string,
		labelZh: string,
	): { box: HTMLElement; draw: () => void } => {
		const box = document.createElement('div');
		box.className = 't-trackeditor';
		const draw = (): void => {
			box.innerHTML = '';
			box.append(span2(labelEn, labelZh));
			tracks().forEach((t, i) => {
				const input = document.createElement('input');
				input.className = 't-trackinput';
				input.value = t;
				input.spellcheck = false;
				input.addEventListener('change', () => {
					const next = [...tracks()];
					next[i] = input.value.trim() || 'auto';
					setTracks(next);
					refresh();
				});
				box.append(input);
			});
			const add = mkBtn('+', '+', () => {
				setTracks([...tracks(), '1fr']);
				refresh();
				draw();
			});
			const remove = mkBtn('−', '−', () => {
				if (tracks().length > 1) {
					setTracks(tracks().slice(0, -1));
					// drop items that fell off the edge
					items = items.filter((it) => it.r2 <= rows.length && it.c2 <= cols.length);
					refresh();
					draw();
				}
			});
			box.append(add, remove);
		};
		draw();
		return { box, draw };
	};
	const colEditor = trackEditor(() => cols, (t) => (cols = t), 'Columns', '列');
	const rowEditor = trackEditor(() => rows, (t) => (rows = t), 'Rows', '行');
	controls.append(colEditor.box, rowEditor.box);

	const gapInput = document.createElement('input');
	gapInput.type = 'number';
	gapInput.value = '8';
	gapInput.min = '0';
	gapInput.className = 't-trackinput';
	gapInput.addEventListener('input', () => {
		gap = Math.max(0, Number(gapInput.value) || 0);
		refresh();
	});
	controls.append(field(span2('Gap', '间距'), gapInput));

	controls.append(
		mkBtn('Reset', '重置', () => {
			cols = ['200px', '1fr', '1fr'];
			rows = ['80px', 'auto'];
			gap = 8;
			gapInput.value = '8';
			items = [];
			colEditor.draw();
			rowEditor.draw();
			refresh();
		}),
		mkBtn('📋 Copy CSS', '📋 复制 CSS', () => {
			void navigator.clipboard.writeText(emit());
		}),
	);

	// --- drag on the empty cells creates a spanning item ---
	let dragStart: { r: number; c: number; startCell: HTMLElement } | null = null;
	let dragGhost: HTMLElement | null = null;
	// The ghost is absolutely positioned OVER the grid — an in-flow ghost with
	// explicit grid lines would re-run auto-placement and shove every cell out
	// of its labeled position mid-drag.
	const sizeGhost = (endCell: HTMLElement): void => {
		if (!dragGhost || !dragStart) return;
		const base = playground.getBoundingClientRect();
		const a = dragStart.startCell.getBoundingClientRect();
		const b = endCell.getBoundingClientRect();
		dragGhost.style.left = `${Math.min(a.left, b.left) - base.left}px`;
		dragGhost.style.top = `${Math.min(a.top, b.top) - base.top}px`;
		dragGhost.style.width = `${Math.max(a.right, b.right) - Math.min(a.left, b.left)}px`;
		dragGhost.style.height = `${Math.max(a.bottom, b.bottom) - Math.min(a.top, b.top)}px`;
	};
	playground.addEventListener('pointerdown', (e) => {
		const cell = (e.target as HTMLElement).closest('.t-gridgen-cell') as HTMLElement | null;
		if (!cell) return;
		dragStart = { r: Number(cell.dataset.r), c: Number(cell.dataset.c), startCell: cell };
		dragGhost = document.createElement('div');
		dragGhost.className = 't-gridgen-ghost';
		playground.append(dragGhost);
		sizeGhost(cell);
		e.preventDefault();
	});
	playground.addEventListener('pointermove', (e) => {
		if (!dragStart || !dragGhost) return;
		const cell = document.elementFromPoint(e.clientX, e.clientY)?.closest('.t-gridgen-cell') as HTMLElement | null;
		if (!cell) return;
		sizeGhost(cell);
	});
	const endDrag = (e: PointerEvent): void => {
		if (!dragStart) return;
		const cell = document.elementFromPoint(e.clientX, e.clientY)?.closest('.t-gridgen-cell') as HTMLElement | null;
		if (cell) {
			const r2 = Number(cell.dataset.r);
			const c2 = Number(cell.dataset.c);
			items.push({
				r1: Math.min(dragStart.r, r2),
				r2: Math.max(dragStart.r, r2),
				c1: Math.min(dragStart.c, c2),
				c2: Math.max(dragStart.c, c2),
				color: items.length,
			});
		}
		dragStart = null;
		dragGhost?.remove();
		dragGhost = null;
		refresh();
	};
	playground.addEventListener('pointerup', endDrag);
	playground.addEventListener('pointerleave', (e) => endDrag(e as PointerEvent));

	const hint = document.createElement('p');
	hint.className = 't-file-hint';
	hint.append(span2('Drag across cells to place an item · click an item to remove it', '拖拽跨格放置元素 · 点击元素删除'));

	host.append(controls, hint, playground, pre);
	refresh();
}

// --- Flexbox generator ------------------------------------------------------------------------

const FLEX_PROPS: { id: string; en: string; zh: string; values: string[] }[] = [
	{ id: 'flex-direction', en: 'Direction', zh: '方向', values: ['row', 'row-reverse', 'column', 'column-reverse'] },
	{ id: 'justify-content', en: 'Justify content', zh: '主轴对齐', values: ['flex-start', 'center', 'flex-end', 'space-between', 'space-around', 'space-evenly'] },
	{ id: 'align-items', en: 'Align items', zh: '交叉轴对齐', values: ['stretch', 'flex-start', 'center', 'flex-end', 'baseline'] },
	{ id: 'flex-wrap', en: 'Wrap', zh: '换行', values: ['nowrap', 'wrap', 'wrap-reverse'] },
];

export function initFlexGen(host: HTMLElement): void {
	const state: Record<string, string> = {
		'flex-direction': 'row',
		'justify-content': 'flex-start',
		'align-items': 'stretch',
		'flex-wrap': 'nowrap',
	};
	let gap = 8;
	let children = 3;
	const childSizes = [1, 1, 2, 1, 3, 1, 2, 1]; // flex-grow variety per index

	const controls = document.createElement('div');
	controls.className = 't-filerow t-csslayout-ctrl';

	const playground = document.createElement('div');
	playground.className = 't-flexgen-play';

	const { pre, set: setCode } = codeBlock();

	const refresh = (): void => {
		playground.style.display = 'flex';
		for (const [k, v] of Object.entries(state)) playground.style.setProperty(k, v);
		playground.style.gap = `${gap}px`;
		playground.innerHTML = '';
		for (let i = 0; i < children; i++) {
			const child = document.createElement('div');
			child.className = 't-flexgen-item';
			child.textContent = String(i + 1);
			child.style.flexGrow = String(childSizes[i % childSizes.length]);
			child.style.setProperty('--item-color', `var(--item-${(i % 6) + 1})`);
			playground.append(child);
		}
		const lines = [
			'.flex-container {',
			'  display: flex;',
			...Object.entries(state).map(([k, v]) => `  ${k}: ${v};`),
			`  gap: ${gap}px;`,
			'}',
			'',
			'/* children */',
			...Array.from({ length: Math.min(children, 3) }, (_, i) => `.item-${i + 1} { flex-grow: ${childSizes[i % childSizes.length]}; }`),
		];
		setCode(lines.join('\n'));
	};

	for (const prop of FLEX_PROPS) {
		const sel = document.createElement('select');
		for (const v of prop.values) {
			const o = document.createElement('option');
			o.value = v;
			o.textContent = v; // CSS keyword — identical in both languages
			sel.append(o);
		}
		sel.value = state[prop.id] as string;
		sel.addEventListener('change', () => {
			state[prop.id] = sel.value;
			refresh();
		});
		controls.append(field(span2(prop.en, prop.zh), sel));
	}

	const gapInput = document.createElement('input');
	gapInput.type = 'number';
	gapInput.value = '8';
	gapInput.min = '0';
	gapInput.className = 't-trackinput';
	gapInput.addEventListener('input', () => {
		gap = Math.max(0, Number(gapInput.value) || 0);
		refresh();
	});
	controls.append(field(span2('Gap', '间距'), gapInput));

	const countInput = document.createElement('input');
	countInput.type = 'number';
	countInput.value = '3';
	countInput.min = '1';
	countInput.max = '8';
	countInput.className = 't-trackinput';
	countInput.addEventListener('input', () => {
		children = Math.min(8, Math.max(1, Number(countInput.value) || 1));
		refresh();
	});
	controls.append(field(span2('Children', '子元素数'), countInput));

	controls.append(
		mkBtn('Reset', '重置', () => {
			state['flex-direction'] = 'row';
			state['justify-content'] = 'flex-start';
			state['align-items'] = 'stretch';
			state['flex-wrap'] = 'nowrap';
			gap = 8;
			children = 3;
			gapInput.value = '8';
			countInput.value = '3';
			for (const sel of controls.querySelectorAll('select')) sel.value = state[sel.dataset.prop ?? ''] ?? '';
			refresh();
		}),
		mkBtn('📋 Copy CSS', '📋 复制 CSS', () => {
			void navigator.clipboard.writeText(pre.textContent ?? '');
		}),
	);
	// remember which select maps to which property for the reset
	controls.querySelectorAll('select').forEach((sel, i) => (sel.dataset.prop = FLEX_PROPS[i]?.id ?? ''));

	host.append(controls, playground, pre);
	refresh();
}
