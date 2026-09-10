// Color converter: three-way HEX ⇄ RGB ⇄ HSL with live swatches (base color
// plus its complement). Editing any field updates the others.
//
// HEX / HSL / rgb() / hsl() and the R G B S L channel captions read the same in
// both views; only the words get a .i18n-en/.i18n-zh pair, which the CSS picks
// between so nothing has to re-run on a language change.

import { bilingual, setBilingual } from './i18n';
import { initColorGamut, rgbToOklab } from './color-gamut';

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

	const cssOklch = document.createElement('div');
	cssOklch.className = 't-row';
	const cssOklchL = document.createElement('span');
	cssOklchL.className = 't-row-label';
	cssOklchL.textContent = 'oklch()';
	const cssOklchV = document.createElement('span');
	cssOklchV.className = 't-row-value';
	cssOklch.append(cssOklchL, cssOklchV);

	css.append(cssHex, cssRgb, cssHsl, cssOklch);

	// --- OKLCH Gamut Card -----------------------------------------------------------
	const gamutCard = document.createElement('div');
	gamutCard.className = 't-gamut-card';

	const gamutHeader = document.createElement('div');
	gamutHeader.className = 't-gamut-header';
	const gamutTitle = document.createElement('span');
	gamutTitle.append(bilingual('OKLab / OKLCH Gamut Slice', 'OKLab / OKLCH 色域剖面'));
	const gamutInfo = document.createElement('span');
	gamutInfo.className = 't-gamut-info';
	gamutHeader.append(gamutTitle, gamutInfo);

	const gamutViewport = document.createElement('div');
	gamutViewport.className = 't-gamut-viewport';
	const gamutGl = document.createElement('canvas');
	gamutGl.className = 't-gamut-gl';
	gamutGl.setAttribute('aria-hidden', 'true');
	const gamut2d = document.createElement('canvas');
	gamut2d.className = 't-gamut-2d';
	gamut2d.setAttribute('aria-label', 'OKLab chromaticity gamut slice');
	gamutViewport.append(gamutGl, gamut2d);

	gamutCard.append(gamutHeader, gamutViewport);

	// --- WCAG contrast checker --------------------------------------------------------
	// Two hex fields (foreground / background) over the base color's own contrast
	// card: live preview and AA / AAA pass-or-fail against the active color.
	const contrastCard = document.createElement('div');
	contrastCard.className = 't-gamut-card';

	const contrastHeader = document.createElement('div');
	contrastHeader.className = 't-gamut-header';
	const contrastTitle = document.createElement('span');
	contrastTitle.append(bilingual('WCAG Contrast Checker', 'WCAG 对比度检查'));
	const contrastInfo = document.createElement('span');
	contrastInfo.className = 't-gamut-info';
	contrastHeader.append(contrastTitle, contrastInfo);
	contrastCard.append(contrastHeader);

	const fgField = document.createElement('div');
	fgField.className = 't-field t-colorfield';
	const fgLabel = document.createElement('label');
	fgLabel.htmlFor = 't-contrast-fg';
	fgLabel.append(bilingual('Foreground text', '前景文字颜色'));
	const fgInput = document.createElement('input');
	fgInput.type = 'text';
	fgInput.id = 't-contrast-fg';
	fgInput.spellcheck = false;
	fgInput.value = '#ffffff';
	fgField.append(fgLabel, fgInput);

	const bgField = document.createElement('div');
	bgField.className = 't-field t-colorfield';
	const bgLabel = document.createElement('label');
	bgLabel.htmlFor = 't-contrast-bg';
	bgLabel.append(bilingual('Background', '背景颜色'));
	const bgInput = document.createElement('input');
	bgInput.type = 'text';
	bgInput.id = 't-contrast-bg';
	bgInput.spellcheck = false;
	bgInput.value = rgbToHex({ r: 35, g: 55, b: 255 });
	bgField.append(bgLabel, bgInput);

	const contrastFields = document.createElement('div');
	contrastFields.className = 't-colorgroups';
	contrastFields.append(fgField, bgField);
	contrastCard.append(contrastFields);

	const previewRow = document.createElement('div');
	previewRow.className = 't-contrast-preview';
	const previewSample = document.createElement('span');
	previewSample.className = 't-contrast-sample';
	previewSample.textContent = 'Aa';
	const previewRatio = document.createElement('span');
	previewRatio.className = 't-contrast-ratio';
	previewRow.append(previewSample, previewRatio);
	contrastCard.append(previewRow);

	const contrastRows = document.createElement('div');
	contrastRows.className = 't-css';
	for (const key of ['aaNormal', 'aaLarge', 'aaaNormal', 'aaaLarge'] as const) {
		const row = document.createElement('div');
		row.className = 't-row';
		const l = document.createElement('span');
		l.className = 't-row-label';
		const v = document.createElement('span');
		v.className = 't-row-value';
		l.append(
			bilingual(
				key === 'aaNormal' ? 'AA normal text (4.5:1)' : key === 'aaLarge' ? 'AA large text (3:1)' : key === 'aaaNormal' ? 'AAA normal text (7:1)' : 'AAA large text (4.5:1)',
				key === 'aaNormal' ? 'AA 正文 (4.5:1)' : key === 'aaLarge' ? 'AA 大字 (3:1)' : key === 'aaaNormal' ? 'AAA 正文 (7:1)' : 'AAA 大字 (4.5:1)',
			),
		);
		row.append(l, v);
		contrastRows.append(row);
	}
	contrastCard.append(contrastRows);

	/** WCAG relative luminance (WCAG 2.x, sRGB). */
	function relLum({ r, g, b }: Rgb): number {
		const ch = (v: number) => {
			const s = v / 255;
			return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
		};
		return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
	}

	function updateContrast(): void {
		const fg = hexToRgb(fgInput.value);
		const bg = hexToRgb(bgInput.value);
		if (!fg || !bg) {
			previewRatio.textContent = '—';
			for (const row of contrastRows.children) {
				const v = row.querySelector('.t-row-value') as HTMLElement | null;
				if (v) v.textContent = '—';
			}
			return;
		}
		const l1 = relLum(fg);
		const l2 = relLum(bg);
		const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
		previewSample.style.color = rgbToHex(fg);
		previewSample.style.background = rgbToHex(bg);
		previewRatio.textContent = `${ratio.toFixed(2)}:1`;
		const judgements: [number, HTMLElement][] = [];
		const values = contrastRows.querySelectorAll('.t-row-value');
		judgements.push([4.5, values[0] as HTMLElement]);
		judgements.push([3, values[1] as HTMLElement]);
		judgements.push([7, values[2] as HTMLElement]);
		judgements.push([4.5, values[3] as HTMLElement]);
		const pass = (ok: boolean): Node[] => [
			document.createTextNode(ok ? '✓ ' : '✗ '),
			bilingual(ok ? 'Pass' : 'Fail', ok ? '通过' : '未通过'),
		];
		for (const [need, el] of judgements) {
			const ok = ratio >= need;
			el.replaceChildren(...pass(ok));
		}
	}

	fgInput.addEventListener('input', updateContrast);
	bgInput.addEventListener('input', updateContrast);
	updateContrast();

	const note = document.createElement('p');
	note.className = 't-note';

	host.append(groups, swatchRow, css, gamutCard, contrastCard, note);

	const gamutCtrl = initColorGamut(gamutCard, (pickedRgb) => {
		render(pickedRgb, 'none');
	});

	// --- sync logic: one source of truth (RGB), fields update it ---------------------
	function render(rgb: Rgb, source: 'hex' | 'rgb' | 'hsl' | 'none'): void {
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

		const okl = rgbToOklab(rgb.r, rgb.g, rgb.b);
		cssOklchV.textContent = `oklch(${(okl.L * 100).toFixed(1)}% ${okl.C.toFixed(3)} ${okl.h.toFixed(1)})`;
		gamutCtrl.update(rgb);
		// The main color's own contrast readout follows the active color as the
		// background — the classic "is this color dark enough for white text".
		if (document.activeElement !== bgInput) {
			bgInput.value = hex;
			updateContrast();
		}
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
