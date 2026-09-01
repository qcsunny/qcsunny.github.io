import { CalcError, compile, formatNumber, type Scope } from './engine';

interface FnRow {
	expr: string;
	fn: ((scope: Scope) => number) | null;
	visible: boolean;
}

export interface GraphController {
	/** Re-render (user variables changed → sampled values change). */
	refresh(): void;
}

/** Slot colors, fixed order — CVD-safe on both themes, max 4 curves by design. */
const COLORS = ['#2337ff', '#eb6834', '#1baf7a', '#eda100'];
const MAX_FNS = 4;
const DEFAULT_VIEW = { xMin: -10, xMax: 10, yMin: -6, yMax: 6 };
const MIN_SPAN = 1e-9;
const MAX_SPAN = 1e9;

/** Canvas colors read from the page theme (ToolShell CSS variables). */
interface Palette {
	dim: string;
	grid: string;
	fg: string;
	dimFaint: string;
	boxFill: string;
}

function hexToRgba(hex: string, alpha: number): string {
	const h = hex.replace('#', '').slice(0, 6);
	const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h.padEnd(6, '0');
	const n = Number.parseInt(full, 16);
	if (!Number.isFinite(n)) return `rgba(128, 128, 128, ${alpha})`;
	return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function readPalette(): Palette {
	const cs = getComputedStyle(document.documentElement);
	const v = (name: string, fallback: string): string => cs.getPropertyValue(name).trim() || fallback;
	const dim = v('--dim', '#6b7280');
	const bg = v('--bg', '#ffffff');
	return {
		dim,
		grid: v('--gridline', '#e5e9f0'),
		fg: v('--fg', '#1a1f28'),
		dimFaint: hexToRgba(dim, 0.5),
		boxFill: hexToRgba(bg, 0.85),
	};
}

export function initGraph(scope: Scope): GraphController {
	const canvas = document.querySelector<HTMLCanvasElement>('#graph-canvas');
	const rowsHost = document.querySelector<HTMLElement>('#graph-rows');
	const addBtn = document.querySelector<HTMLButtonElement>('#graph-add');
	if (!canvas || !rowsHost || !addBtn) return { refresh: () => {} };
	const ctx = canvas.getContext('2d');
	if (!ctx) return { refresh: () => {} };

	let view = { ...DEFAULT_VIEW };
	let rows: FnRow[] = [{ expr: 'sin(x)', fn: null, visible: true }];
	let cssW = 0;
	let cssH = 0;
	let dpr = 1;
	let hoverPx: number | null = null;
	let palette = readPalette();

	// redraw with fresh colors when the theme (data-theme attribute) changes
	new MutationObserver(() => {
		palette = readPalette();
		render();
	}).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

	// --- coordinate transforms ---------------------------------------------
	const sx = (x: number): number => ((x - view.xMin) / (view.xMax - view.xMin)) * cssW;
	const sy = (y: number): number => cssH - ((y - view.yMin) / (view.yMax - view.yMin)) * cssH;
	const mx = (px: number): number => view.xMin + (px / cssW) * (view.xMax - view.xMin);
	const my = (py: number): number => view.yMin + ((cssH - py) / cssH) * (view.yMax - view.yMin);

	// --- sizing --------------------------------------------------------------
	function resize(): void {
		const rect = canvas!.getBoundingClientRect();
		cssW = rect.width;
		cssH = rect.height;
		if (cssW < 2 || cssH < 2) return; // hidden panel
		dpr = window.devicePixelRatio || 1;
		canvas!.width = Math.round(cssW * dpr);
		canvas!.height = Math.round(cssH * dpr);
		render();
	}
	new ResizeObserver(resize).observe(canvas);

	// --- rendering -----------------------------------------------------------
	function render(): void {
		if (cssW < 2 || cssH < 2) return;
		ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx!.clearRect(0, 0, cssW, cssH);
		drawGrid();
		rows.forEach((row, i) => {
			if (row.visible && row.fn) drawCurve(row.fn, COLORS[i] as string);
		});
		drawLegend();
		if (hoverPx !== null) drawCrosshair(hoverPx);
	}

	function niceStep(range: number, targetTicks = 8): number {
		const raw = range / targetTicks;
		const mag = 10 ** Math.floor(Math.log10(raw));
		const norm = raw / mag;
		const mult = norm < 1.5 ? 1 : norm < 3.5 ? 2 : norm < 7.5 ? 5 : 10;
		return mult * mag;
	}

	function formatTick(v: number, step: number): string {
		if (Math.abs(v) < step / 1e6) return '0';
		const decimals = Math.max(0, -Math.floor(Math.log10(step)) + 1);
		return v.toFixed(Math.min(decimals, 10));
	}

	function drawGrid(): void {
		const stepX = niceStep(view.xMax - view.xMin);
		const stepY = niceStep(view.yMax - view.yMin);
		ctx!.font = '11px ui-monospace, Consolas, monospace';
		ctx!.fillStyle = palette.dim;
		ctx!.strokeStyle = palette.grid;
		ctx!.lineWidth = 1;

		// vertical grid + x tick labels
		const yLabelY = clamp(sy(0), 14, cssH - 6); // labels near the x axis, clamped into view
		for (let x = Math.ceil(view.xMin / stepX) * stepX; x <= view.xMax; x += stepX) {
			const px = sx(x);
			line(px, 0, px, cssH);
			label(formatTick(x, stepX), px + 3, yLabelY);
		}
		// horizontal grid + y tick labels
		const xLabelX = clamp(sx(0), 4, cssW - 60);
		for (let y = Math.ceil(view.yMin / stepY) * stepY; y <= view.yMax; y += stepY) {
			const py = sy(y);
			line(0, py, cssW, py);
			label(formatTick(y, stepY), xLabelX, py - 4);
		}
		// axes on top of the grid
		ctx!.strokeStyle = palette.dim;
		ctx!.lineWidth = 1.5;
		if (view.xMin <= 0 && view.xMax >= 0) line(sx(0), 0, sx(0), cssH);
		if (view.yMin <= 0 && view.yMax >= 0) line(0, sy(0), cssW, sy(0));
	}

	function line(x1: number, y1: number, x2: number, y2: number): void {
		ctx!.beginPath();
		ctx!.moveTo(x1, y1);
		ctx!.lineTo(x2, y2);
		ctx!.stroke();
	}

	function label(text: string, x: number, y: number): void {
		ctx!.fillText(text, x, y);
	}

	function clamp(v: number, lo: number, hi: number): number {
		return Math.min(hi, Math.max(lo, v));
	}

	function sample(fn: (s: Scope) => number, x: number): number | null {
		try {
			scope.vars['x'] = x;
			const v = fn(scope);
			return typeof v === 'number' ? v : null;
		} catch {
			return null;
		} finally {
			delete scope.vars['x'];
		}
	}

	function drawCurve(fn: (s: Scope) => number, color: string): void {
		ctx!.strokeStyle = color;
		ctx!.lineWidth = 2;
		ctx!.beginPath();
		let penDown = false;
		let prevY: number | null = null;
		let prevSy = 0;
		for (let px = 0; px <= cssW; px++) {
			const y = sample(fn, mx(px));
			if (y === null || !Number.isFinite(y)) {
				penDown = false;
				prevY = null;
				continue;
			}
			const py = sy(y);
			// Asymptote detection: huge screen-space jump with a sign change
			if (penDown && prevY !== null && Math.abs(py - prevSy) > cssH * 2 && prevY * y < 0) {
				penDown = false;
			}
			if (penDown) ctx!.lineTo(px, py);
			else {
				ctx!.moveTo(px, py);
				penDown = true;
			}
			prevY = y;
			prevSy = py;
		}
		ctx!.stroke();
	}

	function drawLegend(): void {
		const items = rows
			.map((row, i) => ({ row, color: COLORS[i] as string }))
			.filter(({ row }) => row.visible && row.expr.trim() !== '');
		if (items.length === 0) return;
		ctx!.font = '12px ui-monospace, Consolas, monospace';
		const texts = items.map(({ row }, i) => `f${i + 1}: y = ${row.expr}`);
		const widest = Math.max(...texts.map((t) => ctx!.measureText(t).width));
		const boxW = widest + 34;
		const boxH = items.length * 18 + 10;
		ctx!.fillStyle = palette.boxFill;
		ctx!.fillRect(8, 8, boxW, boxH);
		ctx!.strokeStyle = palette.grid;
		ctx!.lineWidth = 1;
		ctx!.strokeRect(8, 8, boxW, boxH);
		items.forEach(({ row, color }, i) => {
			const y = 22 + i * 18;
			ctx!.fillStyle = color;
			ctx!.fillRect(14, y - 7, 16, 3);
			ctx!.fillStyle = palette.fg;
			ctx!.fillText(texts[i] as string, 36, y);
		});
	}

	function drawCrosshair(px: number): void {
		const x = mx(px);
		ctx!.strokeStyle = palette.dimFaint;
		ctx!.setLineDash([4, 4]);
		line(px, 0, px, cssH);
		ctx!.setLineDash([]);

		const readings = rows
			.map((row, i) => ({ row, color: COLORS[i] as string }))
			.filter(({ row }) => row.visible && row.fn)
			.map(({ row, color }) => {
				const y = sample(row.fn as (s: Scope) => number, x);
				return y !== null && Number.isFinite(y)
					? { color, text: `${formatNumber(x)}, ${formatNumber(y)}` }
					: { color, text: `${formatNumber(x)}, —` };
			});
		if (readings.length === 0) return;
		ctx!.font = '11px ui-monospace, Consolas, monospace';
		const widest = Math.max(...readings.map((r) => ctx!.measureText(r.text).width));
		const boxW = widest + 24;
		const boxH = readings.length * 16 + 8;
		const boxX = px + 12 + boxW > cssW ? px - boxW - 12 : px + 12;
		ctx!.fillStyle = palette.boxFill;
		ctx!.fillRect(boxX, 12, boxW, boxH);
		readings.forEach((r, i) => {
			ctx!.fillStyle = r.color;
			ctx!.fillRect(boxX + 8, 20 + i * 16, 6, 6);
			ctx!.fillStyle = palette.fg;
			ctx!.fillText(r.text, boxX + 18, 26 + i * 16);
		});
	}

	// --- interactions --------------------------------------------------------
	function zoomAt(factor: number, anchorX: number, anchorY: number): void {
		const ax = mx(anchorX);
		const ay = my(anchorY);
		let { xMin, xMax, yMin, yMax } = view;
		xMin = ax - (ax - xMin) * factor;
		xMax = ax + (xMax - ax) * factor;
		yMin = ay - (ay - yMin) * factor;
		yMax = ay + (yMax - ay) * factor;
		if (clampView(xMin, xMax, yMin, yMax)) {
			view = { xMin, xMax, yMin, yMax };
			render();
		}
	}

	function clampView(xMin: number, xMax: number, yMin: number, yMax: number): boolean {
		if (xMax - xMin < MIN_SPAN || yMax - yMin < MIN_SPAN) return false;
		if (xMax - xMin > MAX_SPAN || yMax - yMin > MAX_SPAN) return false;
		if (![xMin, xMax, yMin, yMax].every(Number.isFinite)) return false;
		return true;
	}

	canvas.addEventListener(
		'wheel',
		(e) => {
			e.preventDefault();
			const rect = canvas.getBoundingClientRect();
			const factor = e.deltaY < 0 ? 1 / 1.1 : 1.1;
			zoomAt(factor, e.clientX - rect.left, e.clientY - rect.top);
		},
		{ passive: false },
	);

	// Pointer pan (single) and pinch zoom (two fingers), via Pointer Events
	const pointers = new Map<number, { x: number; y: number }>();
	let pinchBase: { dist: number; view: typeof view } | null = null;

	canvas.addEventListener('pointerdown', (e) => {
		canvas.setPointerCapture(e.pointerId);
		pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
		if (pointers.size === 2) startPinch();
	});

	canvas.addEventListener('pointermove', (e) => {
		if (pointers.has(e.pointerId)) {
			const prev = pointers.get(e.pointerId) as { x: number; y: number };
			pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
			if (pointers.size === 1 && !pinchBase) {
				// pan
				const dx = e.offsetX - prev.x;
				const dy = e.offsetY - prev.y;
				const spanX = view.xMax - view.xMin;
				const spanY = view.yMax - view.yMin;
				view.xMin -= (dx / cssW) * spanX;
				view.xMax -= (dx / cssW) * spanX;
				view.yMin += (dy / cssH) * spanY;
				view.yMax += (dy / cssH) * spanY;
				render();
			} else if (pointers.size === 2 && pinchBase) {
				// pinch
				const [p1, p2] = [...pointers.values()] as { x: number; y: number }[];
				const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
				if (dist > 0) {
					const midX = (p1.x + p2.x) / 2;
					const midY = (p1.y + p2.y) / 2;
					view = { ...pinchBase.view };
					zoomAt(dist / pinchBase.dist, midX, midY);
				}
			}
		}
		// hover crosshair (only when not touching)
		if (e.pointerType === 'mouse' && pointers.size === 0) {
			hoverPx = e.offsetX;
			render();
		}
	});

	function endPointer(e: PointerEvent): void {
		pointers.delete(e.pointerId);
		if (pointers.size < 2) pinchBase = null;
		if (pointers.size === 1) startPanFrom([...pointers.values()][0] as { x: number; y: number });
	}
	canvas.addEventListener('pointerup', endPointer);
	canvas.addEventListener('pointercancel', endPointer);
	canvas.addEventListener('pointerleave', () => {
		if (pointers.size === 0) {
			hoverPx = null;
			render();
		}
	});

	function startPinch(): void {
		const [p1, p2] = [...pointers.values()] as { x: number; y: number }[];
		pinchBase = { dist: Math.hypot(p2.x - p1.x, p2.y - p1.y), view: { ...view } };
	}

	function startPanFrom(_p: { x: number; y: number }): void {
		// pan continues from the remaining pointer; nothing else needed since
		// pointermove diffs against the last stored position
	}

	document.querySelectorAll<HTMLButtonElement>('[data-graph-zoom]').forEach((btn) => {
		btn.addEventListener('click', () => {
			const mode = btn.dataset.graphZoom;
			if (mode === 'reset') {
				view = { ...DEFAULT_VIEW };
				render();
			} else {
				zoomAt(mode === 'in' ? 0.8 : 1.25, cssW / 2, cssH / 2);
			}
		});
	});

	// --- function rows -------------------------------------------------------
	function recompile(row: FnRow): void {
		if (!row.expr.trim()) {
			row.fn = null;
			return;
		}
		try {
			row.fn = compile(row.expr);
		} catch (err) {
			row.fn = null;
			// message surfaced by the row's error element
			throw err;
		}
	}

	function renderRows(): void {
		rowsHost!.innerHTML = '';
		rows.forEach((row, i) => {
			const div = document.createElement('div');
			div.className = 'graph-row';

			const swatch = document.createElement('span');
			swatch.className = 'graph-swatch';
			swatch.style.background = COLORS[i];

			const input = document.createElement('input');
			input.type = 'text';
			input.value = row.expr;
			input.placeholder = 'e.g. x^2 - 3 or a*x';
			input.setAttribute('aria-label', `Function ${i + 1}`);

			const errorEl = document.createElement('span');
			errorEl.className = 'row-error';

			const visible = document.createElement('input');
			visible.type = 'checkbox';
			visible.checked = row.visible;
			visible.title = 'Show / hide curve';
			visible.setAttribute('aria-label', `Show function ${i + 1}`);

			const remove = document.createElement('button');
			remove.type = 'button';
			remove.className = 'row-remove';
			remove.textContent = '×';
			remove.title = 'Remove function';
			remove.setAttribute('aria-label', `Remove function ${i + 1}`);

			input.addEventListener('input', () => {
				row.expr = input.value;
				try {
					recompile(row);
					errorEl.textContent = '';
				} catch (err) {
					errorEl.textContent = err instanceof CalcError ? err.message : 'Invalid';
				}
				render();
			});
			visible.addEventListener('change', () => {
				row.visible = visible.checked;
				render();
			});
			remove.addEventListener('click', () => {
				rows = rows.filter((r) => r !== row);
				renderRows();
				render();
			});

			div.append(swatch, input, errorEl, visible, remove);
			rowsHost!.append(div);
		});
		addBtn!.disabled = rows.length >= MAX_FNS;
	}

	addBtn.addEventListener('click', () => {
		if (rows.length >= MAX_FNS) return;
		rows.push({ expr: '', fn: null, visible: true });
		renderRows();
		const inputs = rowsHost!.querySelectorAll('input[type="text"]');
		(inputs[inputs.length - 1] as HTMLInputElement).focus();
	});

	// --- init ----------------------------------------------------------------
	rows.forEach((row) => {
		try {
			recompile(row);
		} catch {
			row.fn = null;
		}
	});
	renderRows();
	resize();

	return {
		refresh: render,
	};
}
