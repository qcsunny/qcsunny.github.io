// Color converter: three-way HEX ⇄ RGB ⇄ HSL with live swatches (base color
// plus its complement). Editing any field updates the others.
//
// HEX / HSL / rgb() / hsl() and the R G B S L channel captions read the same in
// both views; only the words get a .i18n-en/.i18n-zh pair, which the CSS picks
// between so nothing has to re-run on a language change.

import { bilingual, setBilingual } from './i18n';

interface Rgb {
	r: number;
	g: number;
	b: number;
}
interface Hsl {
	h: number;
	s: number;
	l: number;
}

function clamp(v: number, lo: number, hi: number): number {
	return Math.min(Math.max(v, lo), hi);
}

function rgbToHex({ r, g, b }: Rgb): string {
	const h = (n: number) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0');
	return `#${h(r)}${h(g)}${h(b)}`;
}

function hexToRgb(hex: string): Rgb | null {
	const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
	if (!m) return null;
	let s = m[1]!;
	if (s.length === 3) s = [...s].map((c) => c + c).join('');
	const n = parseInt(s, 16);
	return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHsl({ r, g, b }: Rgb): Hsl {
	const rn = r / 255;
	const gn = g / 255;
	const bn = b / 255;
	const max = Math.max(rn, gn, bn);
	const min = Math.min(rn, gn, bn);
	const l = (max + min) / 2;
	if (max === min) return { h: 0, s: 0, l: l * 100 };
	const d = max - min;
	const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
	let h: number;
	if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
	else if (max === gn) h = ((bn - rn) / d + 2) / 6;
	else h = ((rn - gn) / d + 4) / 6;
	return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function hslToRgb({ h, s, l }: Hsl): Rgb {
	const sn = clamp(s, 0, 100) / 100;
	const ln = clamp(l, 0, 100) / 100;
	// hue preserved modulo 360 so out-of-range input still maps somewhere
	const hn = (((h % 360) + 360) % 360) / 360;
	if (sn === 0) {
		const v = ln * 255;
		return { r: v, g: v, b: v };
	}
	const q = ln < 0.5 ? ln * (1 + sn) : ln + sn - ln * sn;
	const p = 2 * ln - q;
	const channel = (t0: number): number => {
		let t = t0;
		if (t < 0) t += 1;
		if (t > 1) t -= 1;
		if (t < 1 / 6) return p + (q - p) * 6 * t;
		if (t < 1 / 2) return q;
		if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
		return p;
	};
	return { r: channel(hn + 1 / 3) * 255, g: channel(hn) * 255, b: channel(hn - 1 / 3) * 255 };
}

export function initColor(host: HTMLElement): void {
	host.innerHTML = '';

	// --- build the three input groups -------------------------------------------
	const groups = document.createElement('div');
	groups.className = 't-colorgroups';

	// HEX
	const hexField = document.createElement('div');
	hexField.className = 't-field t-colorfield';
	const hexLabel = document.createElement('label');
	hexLabel.htmlFor = 't-hex';
	hexLabel.textContent = 'HEX';
	const hexInput = document.createElement('input');
	hexInput.type = 'text';
	hexInput.id = 't-hex';
	hexInput.spellcheck = false;
	hexInput.value = '#2337ff';
	hexField.append(hexLabel, hexInput);

	// RGB
	const rgbField = document.createElement('div');
	rgbField.className = 't-field t-colorfield';
	const rgbLabel = document.createElement('span');
	rgbLabel.className = 't-colorgrouplabel';
	rgbLabel.textContent = 'RGB (0–255)';
	const rgbRow = document.createElement('div');
	rgbRow.className = 't-colorrow';
	const rgbInputs = ['R', 'G', 'B'].map((ch, i) => {
		const wrap = document.createElement('label');
		wrap.className = 't-colorcell';
		const input = document.createElement('input');
		input.type = 'number';
		input.id = `t-rgb-${ch.toLowerCase()}`;
		input.min = '0';
		input.max = '255';
		input.value = ['35', '55', '255'][i]!;
		const sub = document.createElement('span');
		sub.textContent = ch;
		wrap.append(input, sub);
		rgbRow.append(wrap);
		return input;
	});
	rgbField.append(rgbLabel, rgbRow);

	// HSL
	const hslField = document.createElement('div');
	hslField.className = 't-field t-colorfield';
	const hslLabel = document.createElement('span');
	hslLabel.className = 't-colorgrouplabel';
	hslLabel.textContent = 'HSL';
	const hslRow = document.createElement('div');
	hslRow.className = 't-colorrow';
	const hslInputs = (
		[
			['h', 'H', 0, 360, '226'],
			['s', 'S (%)', 0, 100, '100'],
			['l', 'L (%)', 0, 100, '57'],
		] as const
	).map(([id, ch, min, max, def]) => {
		const wrap = document.createElement('label');
		wrap.className = 't-colorcell';
		const input = document.createElement('input');
		input.type = 'number';
		input.id = `t-hsl-${id}`;
		input.min = String(min);
		input.max = String(max);
		input.value = def;
		const sub = document.createElement('span');
		sub.textContent = ch;
		wrap.append(input, sub);
		hslRow.append(wrap);
		return input;
	});
	hslField.append(hslLabel, hslRow);

	groups.append(hexField, rgbField, hslField);

	// --- swatches ------------------------------------------------------------------
	const swatchRow = document.createElement('div');
	swatchRow.className = 't-swatchrow';
	const base = document.createElement('div');
	base.className = 't-swatch';
	const comp = document.createElement('div');
	comp.className = 't-swatch';
	const baseCap = document.createElement('span');
	baseCap.append(bilingual('Color', '当前颜色'));
	const compCap = document.createElement('span');
	compCap.append(bilingual('Complement', '互补色'));
	const baseWrap = document.createElement('div');
	baseWrap.className = 't-swatchwrap';
	baseWrap.append(base, baseCap);
	const compWrap = document.createElement('div');
	compWrap.className = 't-swatchwrap';
	compWrap.append(comp, compCap);
	swatchRow.append(baseWrap, compWrap);

	const css = document.createElement('div');
	css.className = 't-results';
	const cssHex = document.createElement('div');
	cssHex.className = 't-row';
	const cssHexL = document.createElement('span');
	cssHexL.className = 't-row-label';
	cssHexL.textContent = 'HEX';
	const cssHexV = document.createElement('span');
	cssHexV.className = 't-row-value';
	cssHex.append(cssHexL, cssHexV);
	const cssRgb = document.createElement('div');
	cssRgb.className = 't-row';
	const cssRgbL = document.createElement('span');
	cssRgbL.className = 't-row-label';
	cssRgbL.textContent = 'rgb()';
	const cssRgbV = document.createElement('span');
	cssRgbV.className = 't-row-value';
	cssRgb.append(cssRgbL, cssRgbV);
	const cssHsl = document.createElement('div');
	cssHsl.className = 't-row';
	const cssHslL = document.createElement('span');
	cssHslL.className = 't-row-label';
	cssHslL.textContent = 'hsl()';
	const cssHslV = document.createElement('span');
	cssHslV.className = 't-row-value';
	cssHsl.append(cssHslL, cssHslV);
	css.append(cssHex, cssRgb, cssHsl);

	const note = document.createElement('p');
	note.className = 't-note';

	host.append(groups, swatchRow, css, note);

	// --- sync logic: one source of truth (RGB), fields update it ---------------------
	function render(rgb: Rgb, source: 'hex' | 'rgb' | 'hsl'): void {
		const hex = rgbToHex(rgb);
		const hsl = rgbToHsl(rgb);
		base.style.background = hex;
		comp.style.background = rgbToHex(hslToRgb({ h: (hsl.h + 180) % 360, s: hsl.s, l: hsl.l }));
		if (source !== 'hex') hexInput.value = hex;
		if (source !== 'rgb') {
			const [r, g, b] = [rgbInputs[0]!, rgbInputs[1]!, rgbInputs[2]!];
			r.value = String(Math.round(rgb.r));
			g.value = String(Math.round(rgb.g));
			b.value = String(Math.round(rgb.b));
		}
		if (source !== 'hsl') {
			const [h, s, l] = [hslInputs[0]!, hslInputs[1]!, hslInputs[2]!];
			h.value = String(hsl.h);
			s.value = String(hsl.s);
			l.value = String(hsl.l);
		}
		cssHexV.textContent = hex;
		cssRgbV.textContent = `rgb(${Math.round(rgb.r)}, ${Math.round(rgb.g)}, ${Math.round(rgb.b)})`;
		cssHslV.textContent = `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`;
	}

	hexInput.addEventListener('input', () => {
		const rgb = hexToRgb(hexInput.value);
		if (rgb) {
			note.textContent = '';
			render(rgb, 'hex');
		} else {
			setBilingual(note, 'HEX expects #rgb or #rrggbb.', 'HEX 需要 #rgb 或 #rrggbb 格式。');
		}
	});
	for (const input of rgbInputs) {
		input.addEventListener('input', () => {
			const r = Number(rgbInputs[0]!.value);
			const g = Number(rgbInputs[1]!.value);
			const b = Number(rgbInputs[2]!.value);
			if ([r, g, b].every((v) => Number.isFinite(v) && v >= 0 && v <= 255)) {
				note.textContent = '';
				render({ r, g, b }, 'rgb');
			} else {
				setBilingual(note, 'RGB channels must be 0–255.', 'RGB 三个通道取值需在 0–255 之间。');
			}
		});
	}
	for (const input of hslInputs) {
		input.addEventListener('input', () => {
			const h = Number(hslInputs[0]!.value);
			const s = Number(hslInputs[1]!.value);
			const l = Number(hslInputs[2]!.value);
			if ([h, s, l].every((v) => Number.isFinite(v)) && s >= 0 && s <= 100 && l >= 0 && l <= 100) {
				note.textContent = '';
				render(hslToRgb({ h, s, l }), 'hsl');
			} else {
				setBilingual(note, 'S and L must be 0–100 (H may be any angle).', 'S 与 L 取值需在 0–100 之间 (H 可为任意角度)。');
			}
		});
	}

	render({ r: 35, g: 55, b: 255 }, 'none');
}
