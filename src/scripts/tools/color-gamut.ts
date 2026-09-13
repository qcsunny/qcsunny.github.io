// Industrial-grade Color Gamut & Chromaticity Visualizer
// Dual-Mode: Mainstream CIE 1931 xy Chromaticity Diagram (Default) & OKLab/OKLCH a-b Constant Lightness Slice
// Zero third-party dependencies: Canvas 2D + WebGL acceleration.

import { bilingual, isZh } from './i18n';

export interface RgbColor {
	r: number;
	g: number;
	b: number;
}

export interface OklabColor {
	L: number;
	a: number;
	b: number;
	C: number;
	h: number;
}

export interface CieXyColor {
	x: number;
	y: number;
	Y: number;
}

export function srgbToLinear(c: number): number {
	return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function linearToSrgb(c: number): number {
	return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(Math.max(0, c), 1 / 2.4) - 0.055;
}

export function rgbToCieXy(r: number, g: number, b: number): CieXyColor {
	const lr = srgbToLinear(r / 255);
	const lg = srgbToLinear(g / 255);
	const lb = srgbToLinear(b / 255);

	const X = 0.4124564 * lr + 0.3575761 * lg + 0.1804375 * lb;
	const Y = 0.2126729 * lr + 0.7151522 * lg + 0.0721750 * lb;
	const Z = 0.0193339 * lr + 0.1191920 * lg + 0.9503041 * lb;

	const sum = X + Y + Z;
	if (sum <= 0.00001) return { x: 0.3127, y: 0.3290, Y: 0 };
	return { x: X / sum, y: Y / sum, Y };
}

export function cieXyToRgb(x: number, y: number, Y = 0.5): { r: number; g: number; b: number; inSrgb: boolean } {
	if (y <= 0.001) return { r: 0, g: 0, b: 0, inSrgb: false };
	const X = (x / y) * Y;
	const Z = ((1.0 - x - y) / y) * Y;

	const lr = +3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z;
	const lg = -0.9692660 * X + 1.8760108 * Y + 0.0415560 * Z;
	const lb = +0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z;

	const inSrgb = lr >= -0.001 && lr <= 1.001 && lg >= -0.001 && lg <= 1.001 && lb >= -0.001 && lb <= 1.001;
	const maxC = Math.max(lr, lg, lb, 1.0);
	const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

	return {
		r: Math.round(linearToSrgb(clamp01(lr / maxC)) * 255),
		g: Math.round(linearToSrgb(clamp01(lg / maxC)) * 255),
		b: Math.round(linearToSrgb(clamp01(lb / maxC)) * 255),
		inSrgb,
	};
}

export function rgbToOklab(r: number, g: number, b: number): OklabColor {
	const lr = srgbToLinear(r / 255);
	const lg = srgbToLinear(g / 255);
	const lb = srgbToLinear(b / 255);

	const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
	const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
	const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);

	const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
	const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
	const ob = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;

	const C = Math.hypot(a, ob);
	let h = (Math.atan2(ob, a) * 180) / Math.PI;
	if (h < 0) h += 360;

	return { L, a, b: ob, C, h };
}

export function oklabToRgb(L: number, a: number, b: number): { r: number; g: number; b: number; inSrgb: boolean } {
	const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
	const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
	const s_ = L - 0.0894841775 * a - 1.291485548 * b;

	const l = l_ * l_ * l_;
	const m = m_ * m_ * m_;
	const s = s_ * s_ * s_;

	const lr = +4.0767439362 * l - 3.3077115913 * m + 0.2309699291 * s;
	const lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
	const lb = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;

	const inSrgb = lr >= 0 && lr <= 1 && lg >= 0 && lg <= 1 && lb >= 0 && lb <= 1;
	const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

	return {
		r: Math.round(linearToSrgb(clamp01(lr)) * 255),
		g: Math.round(linearToSrgb(clamp01(lg)) * 255),
		b: Math.round(linearToSrgb(clamp01(lb)) * 255),
		inSrgb,
	};
}

export function clampOklabToSrgb(L: number, a: number, b: number): { a: number; b: number } {
	if (oklabToRgb(L, a, b).inSrgb) return { a, b };
	let lo = 0;
	let hi = 1;
	for (let i = 0; i < 20; i++) {
		const mid = (lo + hi) / 2;
		if (oklabToRgb(L, a * mid, b * mid).inSrgb) lo = mid;
		else hi = mid;
	}
	return { a: a * lo, b: b * lo };
}

// 2D Point-in-Triangle test (cross products)
function pointInTriangle(px: number, py: number, ax: number, ay: number, bx: number, by: number, cx: number, cy: number): boolean {
	const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
	const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
	const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
	const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
	const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
	return !(hasNeg && hasPos);
}

// Standard CIE 1931 Spectrum Locus (380nm - 700nm, 2° observer)
const CIE_SPECTRUM_LOCUS: [number, number, number][] = [
	[380, 0.1741, 0.0050],
	[400, 0.1733, 0.0048],
	[420, 0.1689, 0.0069],
	[440, 0.1566, 0.0177],
	[460, 0.1440, 0.0297],
	[470, 0.1241, 0.0578],
	[480, 0.0913, 0.1327],
	[490, 0.0454, 0.2950],
	[500, 0.0082, 0.5384],
	[510, 0.0139, 0.7502],
	[520, 0.0743, 0.8338],
	[530, 0.1547, 0.8059],
	[540, 0.2296, 0.7543],
	[550, 0.3016, 0.6923],
	[560, 0.3731, 0.6245],
	[570, 0.4441, 0.5547],
	[580, 0.5125, 0.4866],
	[590, 0.5752, 0.4242],
	[600, 0.6270, 0.3725],
	[610, 0.6658, 0.3340],
	[620, 0.6915, 0.3083],
	[630, 0.7079, 0.2920],
	[640, 0.7190, 0.2809],
	[660, 0.7300, 0.2700],
	[700, 0.7347, 0.2653],
];

// Standard Reference Gamut Triangles
const GAMUT_SRGB = {
	name: 'sRGB',
	r: [0.640, 0.330] as [number, number],
	g: [0.300, 0.600] as [number, number],
	b: [0.150, 0.060] as [number, number],
};

const GAMUT_P3 = {
	name: 'Display P3',
	r: [0.680, 0.320] as [number, number],
	g: [0.265, 0.690] as [number, number],
	b: [0.150, 0.060] as [number, number],
};

const D65_WHITE: [number, number] = [0.3127, 0.3290];

export interface GamutController {
	update(rgb: RgbColor): void;
	destroy(): void;
}

export function initColorGamut(
	card: HTMLElement,
	onSelectRgb: (rgb: RgbColor) => void,
): GamutController {
	card.innerHTML = '';

	// Top Mode Switch Bar
	let mode: 'cie' | 'oklab' = 'cie';
	let currentRgb: RgbColor = { r: 35, g: 55, b: 255 };
	let currentOklab: OklabColor = rgbToOklab(35, 55, 255);
	let currentCieXy: CieXyColor = rgbToCieXy(35, 55, 255);
	let sliceL = currentOklab.L;
	let sliderDriving = false;

	const header = document.createElement('div');
	header.className = 't-gamut-header';

	const titleGroup = document.createElement('div');
	titleGroup.style.display = 'flex';
	titleGroup.style.alignItems = 'center';
	titleGroup.style.gap = '0.7em';

	const titleText = document.createElement('strong');
	titleText.append(bilingual('Chromaticity & Gamut', '色品与色域分析图'));

	// View Toggle Tabs
	const tabs = document.createElement('div');
	tabs.className = 't-gamut-tabs';
	tabs.style.display = 'inline-flex';
	tabs.style.gap = '0.25em';
	tabs.style.background = 'var(--bg)';
	tabs.style.padding = '0.2em';
	tabs.style.borderRadius = '6px';
	tabs.style.border = '1px solid var(--gridline)';

	const cieBtn = document.createElement('button');
	cieBtn.type = 'button';
	cieBtn.className = 't-btn-mode is-active';
	cieBtn.style.padding = '0.25em 0.6em';
	cieBtn.style.fontSize = '0.78rem';
	cieBtn.style.borderRadius = '4px';
	cieBtn.style.border = 'none';
	cieBtn.style.cursor = 'pointer';
	cieBtn.style.fontWeight = '600';
	cieBtn.style.background = 'var(--accent)';
	cieBtn.style.color = '#fff';
	cieBtn.append(bilingual('CIE 1931 xy (Standard)', 'CIE 1931 xy (主流标准)'));

	const oklabBtn = document.createElement('button');
	oklabBtn.type = 'button';
	oklabBtn.className = 't-btn-mode';
	oklabBtn.style.padding = '0.25em 0.6em';
	oklabBtn.style.fontSize = '0.78rem';
	oklabBtn.style.borderRadius = '4px';
	oklabBtn.style.border = 'none';
	oklabBtn.style.cursor = 'pointer';
	oklabBtn.style.fontWeight = '500';
	oklabBtn.style.background = 'transparent';
	oklabBtn.style.color = 'var(--fg)';
	oklabBtn.append(bilingual('OKLab a-b Slice', 'OKLab a-b 切片'));

	tabs.append(cieBtn, oklabBtn);
	titleGroup.append(titleText, tabs);

	const infoEl = document.createElement('span');
	infoEl.className = 't-gamut-info';
	header.append(titleGroup, infoEl);

	// Viewport & Canvas
	const viewport = document.createElement('div');
	viewport.className = 't-gamut-viewport';
	const canvas2d = document.createElement('canvas');
	canvas2d.className = 't-gamut-2d';
	canvas2d.setAttribute('aria-label', 'CIE 1931 chromaticity diagram and color gamut');
	viewport.append(canvas2d);

	// Lightness controls row with Default & Reset button
	const DEFAULT_LIGHTNESS = 0.65;
	const controlsRow = document.createElement('div');
	controlsRow.className = 't-gamut-controls';
	controlsRow.style.display = 'flex';
	controlsRow.style.alignItems = 'center';
	controlsRow.style.gap = '0.6em';

	const lLabel = document.createElement('label');
	lLabel.htmlFor = 't-gamut-l';
	lLabel.append(bilingual('Lightness', '亮度'));
	const lSlider = document.createElement('input');
	lSlider.type = 'range';
	lSlider.id = 't-gamut-l';
	lSlider.min = '0';
	lSlider.max = '1';
	lSlider.step = '0.001';
	lSlider.value = String(DEFAULT_LIGHTNESS);
	const lVal = document.createElement('span');
	lVal.className = 't-gamut-lval';
	lVal.textContent = `${Math.round(DEFAULT_LIGHTNESS * 100)}%`;

	const resetBtn = document.createElement('button');
	resetBtn.type = 'button';
	resetBtn.className = 't-btn';
	resetBtn.style.padding = '0.25em 0.65em';
	resetBtn.style.fontSize = '0.78rem';
	resetBtn.style.cursor = 'pointer';
	resetBtn.append(bilingual('↺ Reset (65%)', '↺ 恢复默认值 (65%)'));

	resetBtn.addEventListener('click', () => {
		sliderDriving = true;
		try {
			sliceL = DEFAULT_LIGHTNESS;
			lSlider.value = String(DEFAULT_LIGHTNESS);
			lVal.textContent = `${Math.round(DEFAULT_LIGHTNESS * 100)}%`;
			const { a, b } = clampOklabToSrgb(sliceL, currentOklab.a, currentOklab.b);
			const picked = oklabToRgb(sliceL, a, b);
			onSelectRgb({ r: picked.r, g: picked.g, b: picked.b });
		} finally {
			sliderDriving = false;
		}
		render();
	});

	controlsRow.append(lLabel, lSlider, lVal, resetBtn);

	// Dynamic Description Hint
	const hintEl = document.createElement('p');
	hintEl.className = 't-file-hint t-gamut-lhint';

	card.append(header, viewport, controlsRow, hintEl);

	function updateHint(): void {
		hintEl.innerHTML = '';
		if (mode === 'cie') {
			hintEl.append(
				bilingual(
					'CIE 1931 xy Chromaticity Diagram: Shows the full visible spectral horseshoe (380–700 nm). The solid white triangle is standard sRGB; the dashed line is Display P3 wide gamut. Click or drag inside the gamut to pick colors.',
					'CIE 1931 xy 色度图（行业主流标准）：展现完整的可见光谱马蹄形轮廓（380–700 nm）。白色实线三角为标准 sRGB，虚线三角为 Display P3 广色域。点击或拖拽即可在色域空间内精准拾色。',
				),
			);
		} else {
			hintEl.append(
				bilingual(
					'OKLab a-b Slice: Slices color space at constant lightness L. Notice: Yellow requires high intrinsic lightness (L > 0.9); at low L, yellow cannot physically exist in sRGB, which is why the upper (+b) region appears blank.',
					'OKLab a-b 等亮度切片：显示当前亮度下的感知均匀色度分布。注：由于黄色固有明度极高（L > 0.9），在较低亮度下物理上不存在饱和黄色，上方 (+b) 自然为空白；如需查看完整色域全貌请切换至【CIE 1931 xy】。',
				),
			);
		}
	}
	updateHint();

	cieBtn.addEventListener('click', () => {
		if (mode === 'cie') return;
		mode = 'cie';
		cieBtn.style.background = 'var(--accent)';
		cieBtn.style.color = '#fff';
		oklabBtn.style.background = 'transparent';
		oklabBtn.style.color = 'var(--fg)';
		updateHint();
		render();
	});

	oklabBtn.addEventListener('click', () => {
		if (mode === 'oklab') return;
		mode = 'oklab';
		oklabBtn.style.background = 'var(--accent)';
		oklabBtn.style.color = '#fff';
		cieBtn.style.background = 'transparent';
		cieBtn.style.color = 'var(--fg)';
		updateHint();
	});

	lSlider.addEventListener('input', () => {
		sliderDriving = true;
		try {
			sliceL = Number(lSlider.value);
			lVal.textContent = `${Math.round(sliceL * 100)}%`;
			const { a, b } = clampOklabToSrgb(sliceL, currentOklab.a, currentOklab.b);
			const picked = oklabToRgb(sliceL, a, b);
			onSelectRgb({ r: picked.r, g: picked.g, b: picked.b });
		} finally {
			sliderDriving = false;
		}
	});

	const ctx = canvas2d.getContext('2d');

	// --- CIE 1931 Coordinate mapping: x in [0.0, 0.8], y in [0.0, 0.9] ---
	const CIE_X_MIN = 0.0;
	const CIE_X_MAX = 0.8;
	const CIE_Y_MIN = 0.0;
	const CIE_Y_MAX = 0.9;
	const PAD_LEFT = 32;
	const PAD_BOTTOM = 26;
	const PAD_TOP = 14;
	const PAD_RIGHT = 16;

	function cieToScreen(x: number, y: number, w: number, h: number): { x: number; y: number } {
		const plotW = w - PAD_LEFT - PAD_RIGHT;
		const plotH = h - PAD_TOP - PAD_BOTTOM;
		const sx = PAD_LEFT + ((x - CIE_X_MIN) / (CIE_X_MAX - CIE_X_MIN)) * plotW;
		const sy = h - PAD_BOTTOM - ((y - CIE_Y_MIN) / (CIE_Y_MAX - CIE_Y_MIN)) * plotH;
		return { x: sx, y: sy };
	}

	function screenToCie(sx: number, sy: number, w: number, h: number): { x: number; y: number } {
		const plotW = w - PAD_LEFT - PAD_RIGHT;
		const plotH = h - PAD_TOP - PAD_BOTTOM;
		const cx = CIE_X_MIN + Math.max(0, Math.min(1, (sx - PAD_LEFT) / plotW)) * (CIE_X_MAX - CIE_X_MIN);
		const cy = CIE_Y_MIN + Math.max(0, Math.min(1, (h - PAD_BOTTOM - sy) / plotH)) * (CIE_Y_MAX - CIE_Y_MIN);
		return { x: cx, y: cy };
	}

	// --- OKLab Coordinate mapping (expanded to [-0.45, +0.45] so nothing truncates at -0.3) ---
	const OKLAB_MIN = -0.45;
	const OKLAB_MAX = +0.45;

	function oklabToScreen(a: number, b: number, w: number, h: number): { x: number; y: number } {
		const sx = ((a - OKLAB_MIN) / (OKLAB_MAX - OKLAB_MIN)) * w;
		const sy = h - ((b - OKLAB_MIN) / (OKLAB_MAX - OKLAB_MIN)) * h;
		return { x: sx, y: sy };
	}

	function screenToOklab(sx: number, sy: number, w: number, h: number): { a: number; b: number } {
		const a = OKLAB_MIN + (sx / w) * (OKLAB_MAX - OKLAB_MIN);
		const b = OKLAB_MIN + ((h - sy) / h) * (OKLAB_MAX - OKLAB_MIN);
		return { a, b };
	}

	// Offscreen precomputed CIE 1931 background spectrum canvas for optimal 60fps rendering
	let cachedCieBg: HTMLCanvasElement | null = null;
	let cachedBgW = 0;
	let cachedBgH = 0;

	function getCieBackground(w: number, h: number): HTMLCanvasElement {
		if (cachedCieBg && cachedBgW === w && cachedBgH === h) return cachedCieBg;
		const offscreen = document.createElement('canvas');
		offscreen.width = w;
		offscreen.height = h;
		const octx = offscreen.getContext('2d')!;

		// Background dark fill
		octx.fillStyle = '#0e1117';
		octx.fillRect(0, 0, w, h);

		// Build Spectrum Locus Path
		octx.save();
		octx.beginPath();
		CIE_SPECTRUM_LOCUS.forEach(([ , x, y], idx) => {
			const pt = cieToScreen(x, y, w, h);
			if (idx === 0) octx.moveTo(pt.x, pt.y);
			else octx.lineTo(pt.x, pt.y);
		});
		octx.closePath();
		octx.clip(); // Clip gradient to horseshoe only!

		// Render smooth chromaticity inside horseshoe
		const step = 4;
		for (let py = PAD_TOP; py <= h - PAD_BOTTOM; py += step) {
			for (let px = PAD_LEFT; px <= w - PAD_RIGHT; px += step) {
				const { x, y } = screenToCie(px, py, w, h);
				const col = cieXyToRgb(x, y, 0.6);
				octx.fillStyle = `rgb(${col.r},${col.g},${col.b})`;
				octx.fillRect(px, py, step, step);
			}
		}
		octx.restore();

		cachedCieBg = offscreen;
		cachedBgW = w;
		cachedBgH = h;
		return offscreen;
	}

	function renderCie1931(w: number, h: number): void {
		if (!ctx) return;

		// 1. Draw Spectrum Horseshoe
		const bg = getCieBackground(w, h);
		ctx.drawImage(bg, 0, 0);

		// 2. Draw Coordinates & Grid
		ctx.save();
		ctx.lineWidth = 1;
		ctx.font = '10px ui-monospace, Consolas, monospace';

		// Grid lines & labels
		for (let gx = 0.1; gx <= 0.701; gx += 0.1) {
			const p1 = cieToScreen(gx, CIE_Y_MIN, w, h);
			const p2 = cieToScreen(gx, CIE_Y_MAX, w, h);
			ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
			ctx.beginPath();
			ctx.moveTo(p1.x, p1.y);
			ctx.lineTo(p2.x, p2.y);
			ctx.stroke();

			ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
			ctx.fillText(gx.toFixed(1), p1.x - 8, h - 10);
		}

		for (let gy = 0.1; gy <= 0.801; gy += 0.1) {
			const p1 = cieToScreen(CIE_X_MIN, gy, w, h);
			const p2 = cieToScreen(CIE_X_MAX, gy, w, h);
			ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
			ctx.beginPath();
			ctx.moveTo(p1.x, p1.y);
			ctx.lineTo(p2.x, p2.y);
			ctx.stroke();

			ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
			ctx.fillText(gy.toFixed(1), 6, p1.y + 4);
		}

		// Axis labels
		ctx.font = '11px ui-monospace, Consolas, monospace';
		ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
		ctx.fillText('x', w - 14, h - 10);
		ctx.fillText('y', 10, 14);

		// 3. Draw Spectrum Outline & Wavelength markers
		ctx.beginPath();
		CIE_SPECTRUM_LOCUS.forEach(([ , x, y], idx) => {
			const pt = cieToScreen(x, y, w, h);
			if (idx === 0) ctx.moveTo(pt.x, pt.y);
			else ctx.lineTo(pt.x, pt.y);
		});
		ctx.closePath();
		ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
		ctx.lineWidth = 1.5;
		ctx.stroke();

		// Highlight notable wavelength labels (480, 500, 520, 540, 560, 580, 600)
		const labelWls = [480, 500, 520, 540, 560, 580, 600];
		ctx.font = '9px ui-monospace, Consolas, monospace';
		ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
		CIE_SPECTRUM_LOCUS.forEach(([wl, x, y]) => {
			if (labelWls.includes(wl)) {
				const pt = cieToScreen(x, y, w, h);
				const offX = x < 0.2 ? -18 : 6;
				const offY = y > 0.7 ? -4 : 4;
				ctx.fillText(`${wl}`, pt.x + offX, pt.y + offY);
			}
		});

		// 4. Draw Display P3 Gamut Triangle (Dashed, cyan)
		const p3_r = cieToScreen(GAMUT_P3.r[0], GAMUT_P3.r[1], w, h);
		const p3_g = cieToScreen(GAMUT_P3.g[0], GAMUT_P3.g[1], w, h);
		const p3_b = cieToScreen(GAMUT_P3.b[0], GAMUT_P3.b[1], w, h);

		ctx.beginPath();
		ctx.moveTo(p3_r.x, p3_r.y);
		ctx.lineTo(p3_g.x, p3_g.y);
		ctx.lineTo(p3_b.x, p3_b.y);
		ctx.closePath();
		ctx.strokeStyle = '#38bdf8'; // Sky blue
		ctx.lineWidth = 1.5;
		ctx.setLineDash([5, 4]);
		ctx.stroke();
		ctx.setLineDash([]);

		// 5. Draw sRGB Gamut Triangle (Solid, crisp white)
		const srgb_r = cieToScreen(GAMUT_SRGB.r[0], GAMUT_SRGB.r[1], w, h);
		const srgb_g = cieToScreen(GAMUT_SRGB.g[0], GAMUT_SRGB.g[1], w, h);
		const srgb_b = cieToScreen(GAMUT_SRGB.b[0], GAMUT_SRGB.b[1], w, h);

		ctx.beginPath();
		ctx.moveTo(srgb_r.x, srgb_r.y);
		ctx.lineTo(srgb_g.x, srgb_g.y);
		ctx.lineTo(srgb_b.x, srgb_b.y);
		ctx.closePath();
		ctx.strokeStyle = '#ffffff';
		ctx.lineWidth = 2;
		ctx.stroke();

		// Gamut Labels on Triangle Vertices
		ctx.font = 'bold 10px sans-serif';
		ctx.fillStyle = '#ffffff';
		ctx.fillText('R', srgb_r.x + 6, srgb_r.y + 4);
		ctx.fillText('G', srgb_g.x - 4, srgb_g.y - 6);
		ctx.fillText('B', srgb_b.x - 12, srgb_b.y + 4);

		// Triangle label tags
		ctx.font = '10px sans-serif';
		ctx.fillStyle = '#ffffff';
		ctx.fillText('sRGB', (srgb_r.x + srgb_g.x) / 2 + 10, (srgb_r.y + srgb_g.y) / 2);
		ctx.fillStyle = '#38bdf8';
		ctx.fillText('Display P3', (p3_r.x + p3_g.x) / 2 + 12, (p3_r.y + p3_g.y) / 2 - 10);

		// 6. Draw D65 White Point
		const d65Pt = cieToScreen(D65_WHITE[0], D65_WHITE[1], w, h);
		ctx.fillStyle = '#ffffff';
		ctx.beginPath();
		ctx.arc(d65Pt.x, d65Pt.y, 3, 0, Math.PI * 2);
		ctx.fill();
		ctx.font = '9px sans-serif';
		ctx.fillText('D65', d65Pt.x + 6, d65Pt.y + 3);

		// 7. Draw Current Color Pointer (Target Reticle)
		const curPt = cieToScreen(currentCieXy.x, currentCieXy.y, w, h);

		// Reticle crosshair lines
		ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.moveTo(curPt.x - 12, curPt.y);
		ctx.lineTo(curPt.x - 4, curPt.y);
		ctx.moveTo(curPt.x + 4, curPt.y);
		ctx.lineTo(curPt.x + 12, curPt.y);
		ctx.moveTo(curPt.x, curPt.y - 12);
		ctx.lineTo(curPt.x, curPt.y - 4);
		ctx.moveTo(curPt.x, curPt.y + 4);
		ctx.lineTo(curPt.x, curPt.y + 12);
		ctx.stroke();

		// Target rings
		ctx.beginPath();
		ctx.arc(curPt.x, curPt.y, 6.5, 0, Math.PI * 2);
		ctx.fillStyle = `rgb(${currentRgb.r}, ${currentRgb.g}, ${currentRgb.b})`;
		ctx.fill();
		ctx.lineWidth = 2.5;
		ctx.strokeStyle = '#ffffff';
		ctx.stroke();

		ctx.restore();

		// Update Info Header
		const inSrgb = pointInTriangle(
			currentCieXy.x, currentCieXy.y,
			GAMUT_SRGB.r[0], GAMUT_SRGB.r[1],
			GAMUT_SRGB.g[0], GAMUT_SRGB.g[1],
			GAMUT_SRGB.b[0], GAMUT_SRGB.b[1]
		);
		const inP3 = pointInTriangle(
			currentCieXy.x, currentCieXy.y,
			GAMUT_P3.r[0], GAMUT_P3.r[1],
			GAMUT_P3.g[0], GAMUT_P3.g[1],
			GAMUT_P3.b[0], GAMUT_P3.b[1]
		);

		const zh = isZh();
		const statusText = inSrgb
			? (zh ? '色域: sRGB (标准)' : 'Gamut: sRGB')
			: inP3
			? (zh ? '色域: Display P3 (广色域)' : 'Gamut: Display P3')
			: (zh ? '色域: 超出 P3 (Wide/HDR)' : 'Gamut: Out of P3');

		infoEl.textContent = `x: ${currentCieXy.x.toFixed(3)} · y: ${currentCieXy.y.toFixed(3)} · ${statusText}`;
	}

	function renderOklab(w: number, h: number): void {
		if (!ctx) return;
		ctx.fillStyle = '#0f1218';
		ctx.fillRect(0, 0, w, h);

		// Render color slice
		const nw = 72;
		const nh = 72;
		const imgData = ctx.createImageData(nw, nh);
		const data = imgData.data;

		for (let j = 0; j < nh; j++) {
			const b = OKLAB_MIN + ((nh - 1 - j) / (nh - 1)) * (OKLAB_MAX - OKLAB_MIN);
			for (let i = 0; i < nw; i++) {
				const a = OKLAB_MIN + (i / (nw - 1)) * (OKLAB_MAX - OKLAB_MIN);
				const res = oklabToRgb(sliceL, a, b);
				const idx = (j * nw + i) * 4;
				data[idx] = res.r;
				data[idx + 1] = res.g;
				data[idx + 2] = res.b;
				data[idx + 3] = res.inSrgb ? 255 : 35;
			}
		}

		const offscreen = document.createElement('canvas');
		offscreen.width = nw;
		offscreen.height = nh;
		offscreen.getContext('2d')?.putImageData(imgData, 0, 0);
		ctx.drawImage(offscreen, 0, 0, w, h);

		// Grid: every 0.1 from -0.4 to +0.4
		const center = oklabToScreen(0, 0, w, h);
		ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
		ctx.lineWidth = 1;
		ctx.beginPath();
		for (let v = -0.4; v <= 0.4001; v += 0.1) {
			const gx = oklabToScreen(v, 0, w, h).x;
			ctx.moveTo(gx, 0);
			ctx.lineTo(gx, h);
			const gy = oklabToScreen(0, v, w, h).y;
			ctx.moveTo(0, gy);
			ctx.lineTo(w, gy);
		}
		ctx.stroke();

		// Axis ticks & labels
		ctx.font = '9px ui-monospace, Consolas, monospace';
		ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
		for (let v = -0.4; v <= 0.4001; v += 0.2) {
			const gx = oklabToScreen(v, 0, w, h).x;
			ctx.fillText(v.toFixed(1), gx + 2, h - 4);
			const gy = oklabToScreen(0, v, w, h).y;
			ctx.fillText(v.toFixed(1), 3, gy - 2);
		}

		// Center Axes
		ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
		ctx.beginPath();
		ctx.moveTo(center.x, 0);
		ctx.lineTo(center.x, h);
		ctx.moveTo(0, center.y);
		ctx.lineTo(w, center.y);
		ctx.stroke();

		// Axis labels
		ctx.font = '11px ui-monospace, Consolas, monospace';
		ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
		const zh = isZh();
		ctx.fillText(zh ? '+b (黄)' : '+b (yellow)', center.x + 6, 16);
		ctx.fillText(zh ? '-b (蓝)' : '-b (blue)', center.x + 6, h - 8);
		ctx.fillText(zh ? '-a (绿)' : '-a (green)', 8, center.y - 6);
		ctx.fillText(zh ? '+a (红)' : '+a (red)', w - (zh ? 48 : 54), center.y - 6);

		// Gamut contour
		ctx.save();
		ctx.beginPath();
		const steps = 72;
		for (let i = 0; i <= steps; i++) {
			const angle = (i / steps) * Math.PI * 2;
			const edge = clampOklabToSrgb(sliceL, Math.cos(angle) * 0.42, Math.sin(angle) * 0.42);
			const pt = oklabToScreen(edge.a, edge.b, w, h);
			if (i === 0) ctx.moveTo(pt.x, pt.y);
			else ctx.lineTo(pt.x, pt.y);
		}
		ctx.closePath();
		ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
		ctx.lineWidth = 1.5;
		ctx.setLineDash([4, 3]);
		ctx.stroke();
		ctx.restore();

		// Color Pointer
		const curPos = oklabToScreen(currentOklab.a, currentOklab.b, w, h);
		ctx.beginPath();
		ctx.arc(curPos.x, curPos.y, 6.5, 0, Math.PI * 2);
		ctx.fillStyle = `rgb(${currentRgb.r}, ${currentRgb.g}, ${currentRgb.b})`;
		ctx.fill();
		ctx.lineWidth = 2.5;
		ctx.strokeStyle = '#ffffff';
		ctx.stroke();

		// Info header
		const test = oklabToRgb(sliceL, currentOklab.a, currentOklab.b);
		const spaceText = test.inSrgb
			? (zh ? '色域: sRGB (标准)' : 'Gamut: sRGB')
			: (zh ? '色域: Display P3 / 广色域' : 'Gamut: Display P3');
		infoEl.textContent = `${spaceText} · L: ${(sliceL * 100).toFixed(1)}% · C: ${currentOklab.C.toFixed(3)} · h: ${currentOklab.h.toFixed(1)}°`;
	}

	function render(): void {
		if (!canvas2d) return;
		const rect = canvas2d.getBoundingClientRect();
		const w = rect.width;
		const h = rect.height;
		if (w < 10 || h < 10) return;

		const dpr = window.devicePixelRatio || 1;
		canvas2d.width = Math.round(w * dpr);
		canvas2d.height = Math.round(h * dpr);
		ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);

		if (mode === 'cie') {
			renderCie1931(w, h);
		} else {
			renderOklab(w, h);
		}
	}

	function handlePointer(e: PointerEvent): void {
		if (!canvas2d) return;
		const rect = canvas2d.getBoundingClientRect();
		const px = e.clientX - rect.left;
		const py = e.clientY - rect.top;

		if (mode === 'cie') {
			const { x, y } = screenToCie(px, py, rect.width, rect.height);
			// Sample color at chromaticity (x, y) with current relative luminance
			const picked = cieXyToRgb(x, y, Math.max(0.2, currentCieXy.Y || 0.5));
			onSelectRgb({ r: picked.r, g: picked.g, b: picked.b });
		} else {
			const { a, b } = screenToOklab(px, py, rect.width, rect.height);
			const inGamut = clampOklabToSrgb(sliceL, a, b);
			const picked = oklabToRgb(sliceL, inGamut.a, inGamut.b);
			onSelectRgb({ r: picked.r, g: picked.g, b: picked.b });
		}
	}

	let isDragging = false;
	canvas2d.addEventListener('pointerdown', (e) => {
		canvas2d.setPointerCapture(e.pointerId);
		isDragging = true;
		handlePointer(e);
	});
	canvas2d.addEventListener('pointermove', (e) => {
		if (isDragging) handlePointer(e);
	});
	canvas2d.addEventListener('pointerup', (e) => {
		isDragging = false;
		canvas2d.releasePointerCapture(e.pointerId);
	});
	canvas2d.addEventListener('pointercancel', () => {
		isDragging = false;
	});

	new ResizeObserver(render).observe(canvas2d);
	render();

	return {
		update(rgb: RgbColor): void {
			currentRgb = rgb;
			currentOklab = rgbToOklab(rgb.r, rgb.g, rgb.b);
			currentCieXy = rgbToCieXy(rgb.r, rgb.g, rgb.b);

			if (!sliderDriving) {
				sliceL = currentOklab.L;
				lSlider.value = String(sliceL);
				lVal.textContent = `${Math.round(sliceL * 100)}%`;
			}
			render();
		},
		destroy(): void {
			cachedCieBg = null;
		},
	};
}
