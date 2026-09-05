// 3D surface plotter for z = f(x, y): a software renderer on canvas 2D.
// No three.js, no WebGL — the site ships zero runtime dependencies, and an
// orthographic projection plus painter's-algorithm depth sorting is all a
// surface plot needs. Evaluating f() dominates the cost, so the sample grid is
// cached: rotating and zooming only re-project it, while editing the formula,
// the domain or the resolution triggers a re-sample.

import { CalcError, compile, type Scope } from './engine';

const DEG = Math.PI / 180;
const DEFAULT_DOMAIN = { xMin: -5, xMax: 5, yMin: -5, yMax: 5 };
const DEFAULT_VIEW = { yaw: -38 * DEG, pitch: 26 * DEG, zoom: 1 };
const PITCH_LIMIT = 88 * DEG;
const ZOOM_LIMIT = { min: 0.35, max: 4 };

/** An axis shorter than this on screen is drawn without ticks or a name: the
 *  projection has squashed it to the point where every number would land on the
 *  same few pixels (y from the front, z from straight above). */
const AXIS_MIN_PX = 42;

/** Vertical extent of the z axis inside the unit box. Below 1 so that a tall
 *  surface does not tower far above the domain footprint. */
const Z_STRETCH = 0.75;

/** Fixed world-space light (upper front left). World-space rather than
 *  camera-space so that rotating the plot actually reveals its shape. */
const LIGHT: readonly [number, number, number] = (() => {
	const v: [number, number, number] = [-0.42, -0.58, 0.7];
	const m = Math.hypot(...v);
	return [v[0] / m, v[1] / m, v[2] / m] as const;
})();

/** Viridis stops — perceptually uniform and colour-vision-safe, the usual
 *  choice for a height ramp. */
const RAMP: ReadonlyArray<readonly [number, number, number]> = [
	[68, 1, 84],
	[59, 82, 139],
	[33, 145, 140],
	[94, 201, 98],
	[253, 231, 37],
];

type Style = 'surface' | 'mesh' | 'wire';

interface Domain {
	xMin: number;
	xMax: number;
	yMin: number;
	yMax: number;
}

interface Extremum {
	x: number;
	y: number;
	z: number;
}

/** One sampled surface, plus the z range actually used for height and colour. */
interface Grid {
	n: number;
	z: Float64Array;
	ok: Uint8Array;
	zLo: number;
	zHi: number;
	/** True when zLo/zHi were pulled in from the real range (see sample()). */
	clipped: boolean;
	min: Extremum | null;
	max: Extremum | null;
	finite: number;
	total: number;
	/** First runtime error, reported only when nothing evaluated. */
	err: string | null;
}

/** Per-cell colour and per-vertex height for one sampled grid. None of it
 *  depends on the camera — LIGHT is fixed in world space and a quad's normal
 *  comes from the height field — so a rotation must not recompute any of it. */
interface Shading {
	n: number;
	/** 1 where all four corners of the cell are finite, one entry per cell. */
	ok: Uint8Array;
	/** Height in normalised world space per lattice vertex, 0 inside a hole. */
	w: Float64Array;
	/** Position on the colour ramp per cell, for rebuilding colours on demand. */
	tone: Float64Array;
	/** `rgb(...)` for the shaded surface, empty string inside a hole. */
	fill: string[];
	/** `rgba(...)` for the wireframe: unshaded and translucent, built on demand
	 *  because most visitors never switch style. */
	wire: string[] | null;
}

interface Palette {
	fg: string;
	dim: string;
	grid: string;
	bg: string;
}

function readPalette(): Palette {
	const cs = getComputedStyle(document.documentElement);
	const v = (name: string, fallback: string): string => cs.getPropertyValue(name).trim() || fallback;
	return {
		fg: v('--fg', '#1a1f28'),
		dim: v('--dim', '#6b7280'),
		grid: v('--gridline', '#e5e9f0'),
		bg: v('--bg', '#ffffff'),
	};
}

/** A 1 / 2 / 5 × 10ⁿ step giving roughly `target` ticks across `span`. */
function niceStep(span: number, target: number): number {
	const raw = Math.abs(span) / Math.max(1, target);
	if (!(raw > 0)) return 1;
	const mag = 10 ** Math.floor(Math.log10(raw));
	const norm = raw / mag;
	return (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
}

/** Tick values inside [lo, hi] on a nice step, with -0 folded to 0. */
function ticks(lo: number, hi: number, target: number): number[] {
	const step = niceStep(hi - lo, target);
	const eps = step * 1e-6;
	const out: number[] = [];
	for (let t = Math.ceil(lo / step) * step; t <= hi + eps; t += step) {
		out.push(Math.abs(t) < eps ? 0 : t);
	}
	return out;
}

/** Compact axis/readout label. formatNumber keeps 12 significant digits, which
 *  is right for the calculator but unreadable on a tick. */
function shortNum(v: number, digits = 4): string {
	if (!Number.isFinite(v)) return '—';
	if (v === 0) return '0';
	const a = Math.abs(v);
	if (a >= 1e6 || a < 1e-4) return v.toExponential(2).replace('e+', 'e');
	return String(Number(v.toPrecision(digits)));
}

function colorAt(t: number): [number, number, number] {
	const c = Math.min(1, Math.max(0, t)) * (RAMP.length - 1);
	const i = Math.min(RAMP.length - 2, Math.floor(c));
	const f = c - i;
	const a = RAMP[i] as readonly [number, number, number];
	const b = RAMP[i + 1] as readonly [number, number, number];
	return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

/** Sample f over the domain on an (n+1)² lattice. */
function sample(fn: (s: Scope) => number, scope: Scope, d: Domain, n: number): Grid {
	const total = (n + 1) * (n + 1);
	const z = new Float64Array(total);
	const ok = new Uint8Array(total);
	const vals: number[] = [];
	let min: Extremum | null = null;
	let max: Extremum | null = null;
	let err: string | null = null;

	const prevX = scope.vars['x'];
	const prevY = scope.vars['y'];
	for (let j = 0; j <= n; j++) {
		const y = d.yMin + ((d.yMax - d.yMin) * j) / n;
		scope.vars['y'] = y;
		for (let i = 0; i <= n; i++) {
			const x = d.xMin + ((d.xMax - d.xMin) * i) / n;
			scope.vars['x'] = x;
			let v: number;
			try {
				v = fn(scope);
			} catch (e) {
				if (!err) err = e instanceof Error ? e.message : 'Cannot evaluate';
				v = Number.NaN;
			}
			const k = j * (n + 1) + i;
			if (Number.isFinite(v)) {
				z[k] = v;
				ok[k] = 1;
				vals.push(v);
				if (!min || v < min.z) min = { x, y, z: v };
				if (!max || v > max.z) max = { x, y, z: v };
			}
		}
	}
	if (prevX === undefined) delete scope.vars['x'];
	else scope.vars['x'] = prevX;
	if (prevY === undefined) delete scope.vars['y'];
	else scope.vars['y'] = prevY;

	let zLo = min ? min.z : 0;
	let zHi = max ? max.z : 1;
	let clipped = false;
	// A pole such as 1/(x²+y²) makes the true range enormous and flattens
	// everything else into one colour, so when the tails are that extreme the
	// height/colour range follows the 1st–99th percentile instead and the spike
	// is drawn clamped. Well-behaved surfaces keep their exact range.
	if (vals.length > 20) {
		vals.sort((a, b) => a - b);
		const q = (p: number): number => vals[Math.round(p * (vals.length - 1))] as number;
		const lo = q(0.01);
		const hi = q(0.99);
		if (hi > lo && zHi - zLo > (hi - lo) * 4) {
			zLo = lo;
			zHi = hi;
			clipped = true;
		}
	}
	if (!(zHi > zLo)) {
		// Constant surface: give it a range so normalisation stays finite.
		const c = zLo;
		zLo = c - 1;
		zHi = c + 1;
	}
	return { n, z, ok, zLo, zHi, clipped, min, max, finite: vals.length, total, err };
}

export function initGraph3d(scope: Scope): void {
	const canvas = document.querySelector<HTMLCanvasElement>('#g3-canvas');
	const exprEl = document.querySelector<HTMLInputElement>('#g3-expr');
	const errEl = document.querySelector<HTMLElement>('#g3-error');
	const readoutEl = document.querySelector<HTMLElement>('#g3-readout');
	if (!canvas || !exprEl || !errEl || !readoutEl) return;
	const ctx = canvas.getContext('2d');
	if (!ctx) return;

	const domain: Domain = { ...DEFAULT_DOMAIN };
	const view = { ...DEFAULT_VIEW };
	let n = 44;
	let style: Style = 'surface';
	let fn: ((s: Scope) => number) | null = null;
	let grid: Grid | null = null;
	let shading: Shading | null = null;
	let cssW = 0;
	let cssH = 0;
	let dpr = 1;
	let palette = readPalette();

	new MutationObserver(() => {
		palette = readPalette();
		render();
	}).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

	function resize(): void {
		const rect = canvas!.getBoundingClientRect();
		cssW = rect.width;
		cssH = rect.height;
		if (cssW < 2 || cssH < 2) return;
		dpr = window.devicePixelRatio || 1;
		canvas!.width = Math.round(cssW * dpr);
		canvas!.height = Math.round(cssH * dpr);
		render();
	}
	new ResizeObserver(resize).observe(canvas);

	// --- projection ----------------------------------------------------------
	// World coordinates are normalised first: x and y share one scale so the
	// domain keeps its aspect ratio, while z is normalised to its own range
	// (its unit is unrelated) and squashed by Z_STRETCH.
	const cxDom = (): number => (domain.xMin + domain.xMax) / 2;
	const cyDom = (): number => (domain.yMin + domain.yMax) / 2;
	const spanUV = (): number =>
		Math.max((domain.xMax - domain.xMin) / 2, (domain.yMax - domain.yMin) / 2) || 1;

	const toU = (x: number): number => (x - cxDom()) / spanUV();
	const toV = (y: number): number => (y - cyDom()) / spanUV();
	const toW = (z: number, g: Grid): number =>
		(Math.min(g.zHi, Math.max(g.zLo, z)) - (g.zLo + g.zHi) / 2) / ((g.zHi - g.zLo) / 2) * Z_STRETCH;

	interface Projected {
		px: number;
		py: number;
		depth: number;
	}

	/** Orthographic camera at yaw θ, elevation φ. Screen up is the world z axis
	 *  projected onto the view plane; depth grows away from the camera, which is
	 *  what the painter's-algorithm sort consumes. */
	function projector(): (u: number, v: number, w: number) => Projected {
		const cy = Math.cos(view.yaw);
		const sy = Math.sin(view.yaw);
		const cp = Math.cos(view.pitch);
		const sp = Math.sin(view.pitch);
		const scale = Math.min(cssW, cssH) * 0.36 * view.zoom;
		const ox = cssW / 2;
		const oy = cssH / 2;
		return (u, v, w) => {
			const t = u * sy + v * cy;
			return {
				px: ox + (u * cy - v * sy) * scale,
				py: oy - (t * sp + w * cp) * scale,
				depth: t * cp - w * sp,
			};
		};
	}

	// --- drawing -------------------------------------------------------------
	function render(): void {
		if (cssW < 2 || cssH < 2) return;
		ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx!.clearRect(0, 0, cssW, cssH);
		if (!grid || !shading) return;
		const p = projector();
		drawFloor(p);
		drawBox(p, 0.5);
		drawSurface(grid, shading);
		drawTicks(p, grid);
		drawColorbar(grid);
	}

	const uMax = (): number => (domain.xMax - cxDom()) / spanUV();
	const vMax = (): number => (domain.yMax - cyDom()) / spanUV();

	/** Normalised coordinates of lattice column i / row j on an N-cell grid. */
	const uOf = (i: number, N: number): number =>
		toU(domain.xMin + ((domain.xMax - domain.xMin) * i) / N);
	const vOf = (j: number, N: number): number =>
		toV(domain.yMin + ((domain.yMax - domain.yMin) * j) / N);

	type Proj = (u: number, v: number, w: number) => Projected;

	/** Grid on the base plane, drawn before the surface so the surface hides it. */
	function drawFloor(p: Proj): void {
		const w = -Z_STRETCH;
		ctx!.strokeStyle = palette.grid;
		ctx!.lineWidth = 1;
		ctx!.beginPath();
		for (const x of ticks(domain.xMin, domain.xMax, 6)) {
			const a = p(toU(x), -vMax(), w);
			const b = p(toU(x), vMax(), w);
			ctx!.moveTo(a.px, a.py);
			ctx!.lineTo(b.px, b.py);
		}
		for (const y of ticks(domain.yMin, domain.yMax, 6)) {
			const a = p(-uMax(), toV(y), w);
			const b = p(uMax(), toV(y), w);
			ctx!.moveTo(a.px, a.py);
			ctx!.lineTo(b.px, b.py);
		}
		ctx!.stroke();
	}

	/** The 12 edges of the domain box. */
	function drawBox(p: Proj, alpha: number): void {
		const u = uMax();
		const v = vMax();
		const lo = -Z_STRETCH;
		const hi = Z_STRETCH;
		const corners: Array<[number, number, number]> = [
			[-u, -v, lo], [u, -v, lo], [u, v, lo], [-u, v, lo],
			[-u, -v, hi], [u, -v, hi], [u, v, hi], [-u, v, hi],
		];
		const edges: Array<[number, number]> = [
			[0, 1], [1, 2], [2, 3], [3, 0],
			[4, 5], [5, 6], [6, 7], [7, 4],
			[0, 4], [1, 5], [2, 6], [3, 7],
		];
		ctx!.save();
		ctx!.globalAlpha = alpha;
		ctx!.strokeStyle = palette.dim;
		ctx!.lineWidth = 1;
		ctx!.beginPath();
		for (const [i, j] of edges) {
			const a = corners[i] as [number, number, number];
			const b = corners[j] as [number, number, number];
			const pa = p(a[0], a[1], a[2]);
			const pb = p(b[0], b[1], b[2]);
			ctx!.moveTo(pa.px, pa.py);
			ctx!.lineTo(pb.px, pb.py);
		}
		ctx!.stroke();
		ctx!.restore();
	}

	/** Cell colours and vertex heights for one grid. Called from resample(), never
	 *  from render(): a rotation reuses every string this builds. */
	function shadeGrid(g: Grid): Shading {
		const N = g.n;
		const stride = N + 1;
		const w = new Float64Array(stride * stride);
		for (let k = 0; k < w.length; k++) w[k] = g.ok[k] ? toW(g.z[k] as number, g) : 0;

		const du = uOf(1, N) - uOf(0, N);
		const dv = vOf(1, N) - vOf(0, N);
		const nzc = 2 * du * dv;
		const half = (g.zHi - g.zLo) / 2 || 1;

		const ok = new Uint8Array(N * N);
		const tone = new Float64Array(N * N);
		const fill: string[] = new Array(N * N).fill('');
		for (let j = 0; j < N; j++) {
			for (let i = 0; i < N; i++) {
				const k = j * stride + i;
				if (!(g.ok[k] && g.ok[k + 1] && g.ok[k + stride] && g.ok[k + stride + 1])) continue;
				const cell = j * N + i;
				ok[cell] = 1;
				const w00 = w[k] as number;
				const w10 = w[k + 1] as number;
				const w11 = w[k + stride + 1] as number;
				const w01 = w[k + stride] as number;

				// Quad normal from the two diagonals, in normalised world space.
				const nx = dv * (w01 - w10 - (w11 - w00));
				const ny = -du * (w11 - w00 + (w01 - w10));
				const len = Math.hypot(nx, ny, nzc) || 1;
				const dot = (nx * LIGHT[0] + ny * LIGHT[1] + nzc * LIGHT[2]) / len;
				const lit = 0.52 + 0.48 * Math.abs(dot);

				const meanZ =
					((g.z[k] as number) +
						(g.z[k + 1] as number) +
						(g.z[k + stride + 1] as number) +
						(g.z[k + stride] as number)) /
					4;
				const t = (Math.min(g.zHi, Math.max(g.zLo, meanZ)) - g.zLo) / (half * 2);
				tone[cell] = t;
				const [r, gg, b] = colorAt(t);
				fill[cell] = `rgb(${(r * lit) | 0}, ${(gg * lit) | 0}, ${(b * lit) | 0})`;
			}
		}
		return { n: N, ok, w, tone, fill, wire: null };
	}

	/** Wireframe colours: the ramp without the shading, so the lines read as
	 *  height alone. Built on the first frame that asks for them. */
	function wireColours(sh: Shading): string[] {
		if (!sh.wire) {
			const out: string[] = new Array(sh.n * sh.n).fill('');
			for (let cell = 0; cell < out.length; cell++) {
				if (!sh.ok[cell]) continue;
				const [r, gg, b] = colorAt(sh.tone[cell] as number);
				out[cell] = `rgba(${r | 0}, ${gg | 0}, ${b | 0}, 0.6)`;
			}
			sh.wire = out;
		}
		return sh.wire;
	}

	/** The quads, painted back to front. Each vertex is projected once and shared
	 *  by the four quads around it; only quads whose four corners are all finite
	 *  are drawn, which is what puts clean holes in surfaces like ln(x*y).
	 *
	 *  No depth sort: a height field on a lattice under an orthographic camera has
	 *  an exact back-to-front order that costs nothing to find. A view ray keeps a
	 *  fixed direction, so it crosses the lattice columns in the order set by the
	 *  signs of sin(yaw) and cos(yaw) — and because the surface is single-valued
	 *  over each cell, the order the ray meets the quads is the order it enters
	 *  their columns. Walking i and j inwards from the far side therefore paints
	 *  every quad before anything that can occlude it. Sorting by each quad's mean
	 *  depth, which is what this used to do, only approximates that order (the
	 *  mean is one number for a quad whose depth spans a range) and cost an
	 *  O(n² log n) comparison sort on every frame. */
	function drawSurface(g: Grid, sh: Shading): void {
		const N = g.n;
		const stride = N + 1;
		const cy = Math.cos(view.yaw);
		const sy = Math.sin(view.yaw);
		const cp = Math.cos(view.pitch);
		const sp = Math.sin(view.pitch);
		const scale = Math.min(cssW, cssH) * 0.36 * view.zoom;
		const ox = cssW / 2;
		const oy = cssH / 2;
		const px = new Float64Array(stride * stride);
		const py = new Float64Array(stride * stride);
		for (let j = 0; j < stride; j++) {
			const v = vOf(j, N);
			for (let i = 0; i < stride; i++) {
				const k = j * stride + i;
				const u = uOf(i, N);
				px[k] = ox + (u * cy - v * sy) * scale;
				py[k] = oy - ((u * sy + v * cy) * sp + (sh.w[k] as number) * cp) * scale;
			}
		}

		// Depth grows with u where sin(yaw) > 0 and with v where cos(yaw) > 0, so
		// the far corner of the lattice is the high end of each of those axes.
		const iFrom = sy > 0 ? N - 1 : 0;
		const iStep = sy > 0 ? -1 : 1;
		const jFrom = cy > 0 ? N - 1 : 0;
		const jStep = cy > 0 ? -1 : 1;

		const colours = style === 'wire' ? wireColours(sh) : sh.fill;
		ctx!.lineWidth = style === 'wire' ? 1 : 0.7;
		ctx!.lineJoin = 'round';
		// Hidden-line look: opaque background fill, coloured edges. One assignment
		// for the whole surface rather than one per quad.
		if (style === 'mesh') ctx!.fillStyle = palette.bg;

		// Each `ctx.fillStyle = …` reparses a CSS colour, which at 7,744 quads
		// costs more than the rasterising does; neighbouring cells routinely round
		// to the same 8-bit triple, so skipping the repeats is free speed.
		let last = '';
		for (let jj = 0; jj < N; jj++) {
			const j = jFrom + jj * jStep;
			for (let ii = 0; ii < N; ii++) {
				const i = iFrom + ii * iStep;
				const cell = j * N + i;
				if (!sh.ok[cell]) continue;
				const k = j * stride + i;
				const k1 = k + 1;
				const k2 = k + stride + 1;
				const k3 = k + stride;
				const colour = colours[cell] as string;

				ctx!.beginPath();
				ctx!.moveTo(px[k] as number, py[k] as number);
				ctx!.lineTo(px[k1] as number, py[k1] as number);
				ctx!.lineTo(px[k2] as number, py[k2] as number);
				ctx!.lineTo(px[k3] as number, py[k3] as number);
				ctx!.closePath();

				if (style === 'surface') {
					if (colour !== last) {
						ctx!.fillStyle = colour;
						// Hairline seam hides the sub-pixel gaps canvas leaves
						// between fills. Assigned from the same string rather than
						// from ctx.fillStyle: reading that getter serialises the
						// colour back into a new string, and paying for it 7,744
						// times a frame was 40% of the frame.
						ctx!.strokeStyle = colour;
						last = colour;
					}
					ctx!.fill();
					ctx!.stroke();
					continue;
				}
				if (colour !== last) {
					ctx!.strokeStyle = colour;
					last = colour;
				}
				if (style === 'mesh') ctx!.fill();
				ctx!.stroke();
			}
		}
	}

	const AXIS_FONT = '11px system-ui, -apple-system, "Segoe UI", sans-serif';

	/** Text with a halo of background colour, so a label that does end up over
	 *  the surface stays readable whatever colour is underneath it. */
	function label(text: string, x: number, y: number, colour: string): void {
		ctx!.lineJoin = 'round';
		ctx!.lineWidth = 3;
		ctx!.strokeStyle = palette.bg;
		ctx!.strokeText(text, x, y);
		ctx!.fillStyle = colour;
		ctx!.fillText(text, x, y);
	}

	/** Tick numbers and axis names, drawn last so they stay readable over the
	 *  surface. The labelled edges are chosen per frame: the two base edges
	 *  nearest the camera carry x and y, the left silhouette edge carries z.
	 *  An axis the projection has squashed — y seen from the front, z from
	 *  straight above — is left bare instead of stacking its numbers on one spot. */
	function drawTicks(p: Proj, g: Grid): void {
		const u = uMax();
		const v = vMax();
		const lo = -Z_STRETCH;
		const centre = p(0, 0, lo);
		/** Unit screen vector pointing away from the box, for label offsets. */
		const outward = (from: Projected): [number, number] => {
			const dx = from.px - centre.px;
			const dy = from.py - centre.py;
			const m = Math.hypot(dx, dy) || 1;
			return [dx / m, dy / m];
		};
		const screenLen = (a: Projected, b: Projected): number => Math.hypot(b.px - a.px, b.py - a.py);

		ctx!.font = AXIS_FONT;
		ctx!.textAlign = 'center';
		ctx!.textBaseline = 'middle';

		const vSide = p(0, -v, lo).depth <= p(0, v, lo).depth ? -v : v;
		if (screenLen(p(-u, vSide, lo), p(u, vSide, lo)) >= AXIS_MIN_PX) {
			const xMid = p(0, vSide, lo);
			const [ox, oy] = outward(xMid);
			for (const x of ticks(domain.xMin, domain.xMax, 6)) {
				const q = p(toU(x), vSide, lo);
				label(shortNum(x), q.px + ox * 14, q.py + oy * 14, palette.dim);
			}
			label('x', xMid.px + ox * 34, xMid.py + oy * 34, palette.fg);
		}

		const uSide = p(-u, 0, lo).depth <= p(u, 0, lo).depth ? -u : u;
		if (screenLen(p(uSide, -v, lo), p(uSide, v, lo)) >= AXIS_MIN_PX) {
			const yMid = p(uSide, 0, lo);
			const [ox, oy] = outward(yMid);
			for (const y of ticks(domain.yMin, domain.yMax, 6)) {
				const q = p(uSide, toV(y), lo);
				label(shortNum(y), q.px + ox * 14, q.py + oy * 14, palette.dim);
			}
			label('y', yMid.px + ox * 34, yMid.py + oy * 34, palette.fg);
		}

		drawZTicks(p, g, u, v);
	}

	/** z on the left-hand silhouette edge of the box. px never depends on w, so
	 *  that edge projects to a vertical line at the smallest px anything in the
	 *  plot can reach: numbers set down to its left can never be covered. */
	function drawZTicks(p: Proj, g: Grid, u: number, v: number): void {
		const corners: Array<[number, number]> = [
			[-u, -v],
			[u, -v],
			[u, v],
			[-u, v],
		];
		let best = corners[0] as [number, number];
		let bestQ = p(best[0], best[1], 0);
		for (const c of corners.slice(1)) {
			const q = p(c[0], c[1], 0);
			// a face seen straight on gives two equally left corners; take the far one
			const better =
				q.px < bestQ.px - 0.5 || (Math.abs(q.px - bestQ.px) <= 0.5 && q.depth > bestQ.depth);
			if (better) {
				best = c;
				bestQ = q;
			}
		}

		const foot = p(best[0], best[1], -Z_STRETCH);
		const head = p(best[0], best[1], Z_STRETCH);
		if (Math.hypot(head.px - foot.px, head.py - foot.py) < AXIS_MIN_PX) return;

		ctx!.font = AXIS_FONT;
		ctx!.textAlign = 'right';
		ctx!.textBaseline = 'middle';
		const rows: Array<[string, number]> = [];
		ctx!.strokeStyle = palette.dim;
		ctx!.lineWidth = 1;
		ctx!.beginPath();
		for (const z of ticks(g.zLo, g.zHi, 5)) {
			const q = p(best[0], best[1], toW(z, g));
			ctx!.moveTo(foot.px, q.py);
			ctx!.lineTo(foot.px - 4, q.py);
			rows.push([shortNum(z), q.py]);
		}
		ctx!.stroke();
		for (const [text, py] of rows) label(text, foot.px - 8, py, palette.dim);

		ctx!.textAlign = 'center';
		label('z', head.px, head.py - 12, palette.fg);
	}

	function drawColorbar(g: Grid): void {
		const w = 10;
		const h = Math.min(130, cssH * 0.42);
		const x = cssW - 16 - w;
		const y = cssH - 18 - h;
		const grad = ctx!.createLinearGradient(0, y + h, 0, y);
		for (let i = 0; i <= 8; i++) {
			const [r, gg, b] = colorAt(i / 8);
			grad.addColorStop(i / 8, `rgb(${r | 0}, ${gg | 0}, ${b | 0})`);
		}
		ctx!.fillStyle = grad;
		ctx!.fillRect(x, y, w, h);
		ctx!.strokeStyle = palette.grid;
		ctx!.lineWidth = 1;
		ctx!.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

		ctx!.font = '10px system-ui, -apple-system, sans-serif';
		ctx!.textAlign = 'right';
		ctx!.textBaseline = 'middle';
		label(shortNum(g.zHi), x - 5, y + 5, palette.dim);
		label(shortNum(g.zLo), x - 5, y + h - 5, palette.dim);
	}

	// --- readout -------------------------------------------------------------
	/** Both languages side by side; global CSS hides the inactive one, the same
	 *  convention the .astro templates use for static copy. */
	function bi(en: string, zh: string): string {
		return `<span class="i18n-en">${en}</span><span class="i18n-zh">${zh}</span>`;
	}

	function stat(label: string, value: string): string {
		return `<span class="g3-stat">${label} <b>${value}</b></span>`;
	}

	function setReadout(g: Grid | null): void {
		if (!g) {
			readoutEl!.innerHTML = '';
			return;
		}
		const at = (e: Extremum): string => `${shortNum(e.z)} <i>@ (${shortNum(e.x)}, ${shortNum(e.y)})</i>`;
		const parts: string[] = [];
		if (g.max) parts.push(stat(bi('max z', '最大值'), at(g.max)));
		if (g.min) parts.push(stat(bi('min z', '最小值'), at(g.min)));
		parts.push(stat(bi('grid', '采样'), `${g.n} × ${g.n}`));
		const holes = g.total - g.finite;
		if (holes > 0) {
			parts.push(
				stat(bi('undefined', '无定义'), `${holes} ${bi('points', '点')}`),
			);
		}
		if (g.clipped) {
			parts.push(
				`<span class="g3-note">${bi(
					'range clipped to the 1st–99th percentile (the surface has a spike)',
					'高度与配色按 1%–99% 分位裁剪（曲面存在尖峰）',
				)}</span>`,
			);
		}
		readoutEl!.innerHTML = parts.join('');
	}

	// --- model ---------------------------------------------------------------
	function resample(): void {
		if (!fn) {
			grid = null;
			shading = null;
			setReadout(null);
			render();
			return;
		}
		const g = sample(fn, scope, domain, n);
		if (g.finite === 0) {
			grid = null;
			shading = null;
			setReadout(null);
			errEl!.textContent = g.err ?? 'No finite value in this domain';
		} else {
			grid = g;
			shading = shadeGrid(g);
			setReadout(g);
			errEl!.textContent = '';
		}
		render();
	}

	/** Compile the formula, then resample. Compile errors are the user's typos, so
	 *  they replace the readout rather than sitting beside a stale surface. */
	function apply(): void {
		const src = exprEl!.value.trim();
		if (!src) {
			fn = null;
			errEl!.textContent = '';
			resample();
			return;
		}
		try {
			fn = compile(src);
		} catch (e) {
			fn = null;
			errEl!.textContent = e instanceof CalcError ? e.message : 'Invalid expression';
			grid = null;
			shading = null;
			setReadout(null);
			render();
			return;
		}
		errEl!.textContent = '';
		resample();
	}

	// --- controls ------------------------------------------------------------
	const numInput = (id: string): HTMLInputElement | null =>
		document.querySelector<HTMLInputElement>(id);

	function writeDomainInputs(): void {
		const pairs: Array<[string, number]> = [
			['#g3-xmin', domain.xMin],
			['#g3-xmax', domain.xMax],
			['#g3-ymin', domain.yMin],
			['#g3-ymax', domain.yMax],
		];
		for (const [id, value] of pairs) {
			const el = numInput(id);
			if (el) el.value = String(value);
		}
	}

	/** Read the four domain boxes. Rejects an empty or inverted range instead of
	 *  sampling a degenerate grid, and leaves the last good domain on screen. */
	function readDomainInputs(): boolean {
		const get = (id: string): number => {
			const el = numInput(id);
			return el ? Number.parseFloat(el.value) : Number.NaN;
		};
		const next = {
			xMin: get('#g3-xmin'),
			xMax: get('#g3-xmax'),
			yMin: get('#g3-ymin'),
			yMax: get('#g3-ymax'),
		};
		if (!Object.values(next).every((v) => Number.isFinite(v))) return false;
		if (!(next.xMax > next.xMin) || !(next.yMax > next.yMin)) return false;
		Object.assign(domain, next);
		return true;
	}

	function showError(en: string, zh: string): void {
		errEl!.innerHTML = bi(en, zh);
	}

	// --- interaction ---------------------------------------------------------
	const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

	/** Drag right orbits counter-clockwise seen from above; drag down raises the
	 *  camera, as if the near face were being pulled toward the viewer. */
	function rotate(dx: number, dy: number): void {
		view.yaw += dx * 0.008;
		view.pitch = clamp(view.pitch + dy * 0.006, -PITCH_LIMIT, PITCH_LIMIT);
		render();
	}

	function zoomBy(factor: number): void {
		view.zoom = clamp(view.zoom * factor, ZOOM_LIMIT.min, ZOOM_LIMIT.max);
		render();
	}

	const pointers = new Map<number, { x: number; y: number }>();
	let pinchDist = 0;

	function spread(): number {
		const pts = [...pointers.values()];
		const a = pts[0];
		const b = pts[1];
		return a && b ? Math.hypot(b.x - a.x, b.y - a.y) : 0;
	}

	canvas.addEventListener('pointerdown', (e) => {
		canvas.setPointerCapture(e.pointerId);
		pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
		if (pointers.size === 2) pinchDist = spread();
	});

	canvas.addEventListener('pointermove', (e) => {
		const prev = pointers.get(e.pointerId);
		if (!prev) return;
		pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
		if (pointers.size === 1) {
			rotate(e.offsetX - prev.x, e.offsetY - prev.y);
		} else if (pointers.size === 2 && pinchDist > 0) {
			const d = spread();
			if (d > 0) {
				zoomBy(d / pinchDist);
				pinchDist = d;
			}
		}
	});

	function endPointer(e: PointerEvent): void {
		pointers.delete(e.pointerId);
		pinchDist = pointers.size === 2 ? spread() : 0;
	}
	canvas.addEventListener('pointerup', endPointer);
	canvas.addEventListener('pointercancel', endPointer);

	canvas.addEventListener(
		'wheel',
		(e) => {
			e.preventDefault();
			zoomBy(e.deltaY < 0 ? 1.1 : 1 / 1.1);
		},
		{ passive: false },
	);

	// The canvas is focusable (tabindex=0) so the plot can be rotated without a
	// pointer: arrows orbit, +/- zoom, 0 restores the default view.
	canvas.addEventListener('keydown', (e) => {
		const step = e.shiftKey ? 30 : 10;
		switch (e.key) {
			case 'ArrowLeft':
				rotate(-step, 0);
				break;
			case 'ArrowRight':
				rotate(step, 0);
				break;
			case 'ArrowUp':
				rotate(0, -step);
				break;
			case 'ArrowDown':
				rotate(0, step);
				break;
			case '+':
			case '=':
				zoomBy(1.15);
				break;
			case '-':
			case '_':
				zoomBy(1 / 1.15);
				break;
			case '0':
				Object.assign(view, DEFAULT_VIEW);
				render();
				break;
			default:
				return;
		}
		e.preventDefault();
	});

	const PRESETS: Record<string, { yaw: number; pitch: number; zoom: number }> = {
		reset: { ...DEFAULT_VIEW },
		top: { yaw: 0, pitch: PITCH_LIMIT, zoom: 1 },
		front: { yaw: 0, pitch: 4 * DEG, zoom: 1 },
	};

	document.querySelectorAll<HTMLButtonElement>('[data-g3-view]').forEach((btn) => {
		btn.addEventListener('click', () => {
			const preset = PRESETS[btn.dataset.g3View as string];
			if (!preset) return;
			Object.assign(view, preset);
			render();
		});
	});

	document.querySelectorAll<HTMLButtonElement>('[data-g3-zoom]').forEach((btn) => {
		btn.addEventListener('click', () => zoomBy(btn.dataset.g3Zoom === 'in' ? 1.2 : 1 / 1.2));
	});

	document.querySelectorAll<HTMLButtonElement>('[data-g3-example]').forEach((btn) => {
		btn.addEventListener('click', () => {
			exprEl!.value = btn.dataset.g3Example as string;
			apply();
		});
	});

	exprEl.addEventListener('input', apply);

	for (const id of ['#g3-xmin', '#g3-xmax', '#g3-ymin', '#g3-ymax']) {
		numInput(id)?.addEventListener('change', () => {
			if (readDomainInputs()) resample();
			else showError('Needs max > min on both axes', '两个轴都需要满足最大值 > 最小值');
		});
	}

	document.querySelector<HTMLSelectElement>('#g3-res')?.addEventListener('change', (e) => {
		const v = Number.parseInt((e.target as HTMLSelectElement).value, 10);
		if (Number.isFinite(v) && v >= 8) {
			n = v;
			resample();
		}
	});

	document.querySelector<HTMLSelectElement>('#g3-style')?.addEventListener('change', (e) => {
		style = (e.target as HTMLSelectElement).value as Style;
		render();
	});

	// --- init ----------------------------------------------------------------
	writeDomainInputs();
	apply();
	resize();
}
