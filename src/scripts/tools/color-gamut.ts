// Hardware-accelerated OKLab / OKLCH Chromaticity & Gamut Slice (sRGB vs Display P3)
// Zero third-party dependencies: Native WebGL 2/1 with pure Canvas 2D CPU fallback.

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

function srgbToLinear(c: number): number {
	return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function linearToSrgb(c: number): number {
	return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
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

/** Pull the chroma of an OKLab color back along its own hue until it sits
 *  inside sRGB. Channel-clamping instead (oklabToRgb's per-channel clamp)
 *  shifts the hue — a click in the out-of-gamut area would land on a color
 *  that does not match where it was clicked; this keeps the direction. */
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

export interface GamutController {
	update(rgb: RgbColor): void;
	destroy(): void;
}

const VS_QUAD = `
	attribute vec2 aPos;
	void main() {
		gl_Position = vec4(aPos, 0.0, 1.0);
	}
`;

const FS_GAMUT = `
	precision highp float;
	uniform vec2 uRes;
	uniform float uLightness;

	float srgbCompand(float c) {
		return c <= 0.0031308 ? c * 12.92 : 1.055 * pow(clamp(c, 0.0, 1.0), 1.0 / 2.4) - 0.055;
	}

	void main() {
		vec2 uv = gl_FragCoord.xy / uRes;
		// Map UV to OKLab a, b: [-0.35, +0.35]
		float a = mix(-0.35, 0.35, uv.x);
		float b = mix(-0.35, 0.35, uv.y);
		float L = uLightness;

		float l_ = L + 0.3963377774 * a + 0.2158037573 * b;
		float m_ = L - 0.1055613458 * a - 0.0638541728 * b;
		float s_ = L - 0.0894841775 * a - 1.2914855480 * b;

		float l = l_ * l_ * l_;
		float m = m_ * m_ * m_;
		float s = s_ * s_ * s_;

		float lr = +4.0767439362 * l - 3.3077115913 * m + 0.2309699291 * s;
		float lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
		float lb = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;

		bool inSrgb = (lr >= 0.0 && lr <= 1.0 && lg >= 0.0 && lg <= 1.0 && lb >= 0.0 && lb <= 1.0);

		// Transform to XYZ (D65) then to Display P3
		float X = 0.4124564 * lr + 0.3575761 * lg + 0.1804375 * lb;
		float Y = 0.2126729 * lr + 0.7151522 * lg + 0.0721750 * lb;
		float Z = 0.0193339 * lr + 0.1191920 * lg + 0.9503041 * lb;

		float p3_r = +2.4934969 * X - 0.9313836 * Y - 0.4027108 * Z;
		float p3_g = -0.8294890 * X + 1.7626641 * Y + 0.0236247 * Z;
		float p3_b = +0.0358458 * X - 0.0761724 * Y + 0.9568845 * Z;

		bool inP3 = (p3_r >= 0.0 && p3_r <= 1.0 && p3_g >= 0.0 && p3_g <= 1.0 && p3_b >= 0.0 && p3_b <= 1.0);

		vec3 srgbCol = vec3(srgbCompand(lr), srgbCompand(lg), srgbCompand(lb));

		if (inSrgb) {
			gl_FragColor = vec4(srgbCol, 1.0);
		} else if (inP3) {
			// Display P3 gamut area: render with vivid indicator
			gl_FragColor = vec4(clamp(srgbCol, 0.0, 1.0), 0.82);
		} else {
			// Out of gamut: dark neutral background
			gl_FragColor = vec4(0.12, 0.14, 0.18, 0.25);
		}
	}
`;

export function initColorGamut(
	card: HTMLElement,
	onSelectRgb: (rgb: RgbColor) => void,
): GamutController {
	const glCanvas = card.querySelector<HTMLCanvasElement>('.t-gamut-gl');
	const canvas2d = card.querySelector<HTMLCanvasElement>('.t-gamut-2d');
	const infoEl = card.querySelector<HTMLElement>('.t-gamut-info');

	let currentRgb: RgbColor = { r: 35, g: 55, b: 255 };
	let currentOklab: OklabColor = rgbToOklab(35, 55, 255);

	let gl: WebGLRenderingContext | WebGL2RenderingContext | null = null;
	let glProg: WebGLProgram | null = null;
	let quadBuf: WebGLBuffer | null = null;
	let isGlAvailable = false;

	if (glCanvas) {
		try {
			gl =
				(glCanvas.getContext('webgl2', { alpha: true }) as WebGLRenderingContext | null) ||
				(glCanvas.getContext('webgl', { alpha: true }) as WebGLRenderingContext | null);

			if (gl) {
				const vs = gl.createShader(gl.VERTEX_SHADER)!;
				gl.shaderSource(vs, VS_QUAD);
				gl.compileShader(vs);

				const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
				gl.shaderSource(fs, FS_GAMUT);
				gl.compileShader(fs);

				glProg = gl.createProgram()!;
				gl.attachShader(glProg, vs);
				gl.attachShader(glProg, fs);
				gl.linkProgram(glProg);

				if (gl.getProgramParameter(glProg, gl.LINK_STATUS)) {
					quadBuf = gl.createBuffer();
					gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
					gl.bufferData(
						gl.ARRAY_BUFFER,
						new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
						gl.STATIC_DRAW,
					);
					isGlAvailable = true;
				}
			}
		} catch (err) {
			console.warn('[Gamut WebGL] init failed, fallback to CPU:', err);
			isGlAvailable = false;
		}
	}

	const ctx = canvas2d?.getContext('2d') || null;

	// --- lightness slider ---------------------------------------------------------
	// The slice shows the a-b plane at ONE lightness; without this slider the
	// only way to move between slices was to type a different color somewhere
	// else first. Sweeping L here re-slices live (and the current hue/chroma
	// follow, pulled back into sRGB when the slice's gamut is narrower).
	const controlsRow = document.createElement('div');
	controlsRow.className = 't-gamut-controls';
	const lLabel = document.createElement('label');
	lLabel.htmlFor = 't-gamut-l';
	lLabel.append(bilingual('Lightness', '亮度'));
	const lSlider = document.createElement('input');
	lSlider.type = 'range';
	lSlider.id = 't-gamut-l';
	lSlider.min = '0';
	lSlider.max = '1';
	lSlider.step = '0.001';
	lSlider.value = String(currentOklab.L);
	const lVal = document.createElement('span');
	lVal.className = 't-gamut-lval';
	lVal.textContent = `${Math.round(currentOklab.L * 100)}%`;
	controlsRow.append(lLabel, lSlider, lVal);
	card.append(controlsRow);

	lSlider.addEventListener('input', () => {
		const L = Number(lSlider.value);
		const { a, b } = clampOklabToSrgb(L, currentOklab.a, currentOklab.b);
		const picked = oklabToRgb(L, a, b);
		onSelectRgb({ r: picked.r, g: picked.g, b: picked.b });
	});

	function toScreen(a: number, b: number, w: number, h: number): { x: number; y: number } {
		const x = ((a - -0.35) / (0.35 - -0.35)) * w;
		const y = h - ((b - -0.35) / (0.35 - -0.35)) * h;
		return { x, y };
	}

	function fromScreen(x: number, y: number, w: number, h: number): { a: number; b: number } {
		const a = -0.35 + (x / w) * (0.35 - -0.35);
		const b = -0.35 + ((h - y) / h) * (0.35 - -0.35);
		return { a, b };
	}

	function renderGamutCPU(w: number, h: number): void {
		if (!ctx) return;
		const nw = 64;
		const nh = 64;
		const imgData = ctx.createImageData(nw, nh);
		const data = imgData.data;

		for (let j = 0; j < nh; j++) {
			const b = -0.35 + ((nh - 1 - j) / (nh - 1)) * 0.7;
			for (let i = 0; i < nw; i++) {
				const a = -0.35 + (i / (nw - 1)) * 0.7;
				const res = oklabToRgb(currentOklab.L, a, b);
				const idx = (j * nw + i) * 4;
				data[idx] = res.r;
				data[idx + 1] = res.g;
				data[idx + 2] = res.b;
				data[idx + 3] = res.inSrgb ? 255 : 40;
			}
		}

		// Draw scaled image to canvas
		const offscreen = document.createElement('canvas');
		offscreen.width = nw;
		offscreen.height = nh;
		offscreen.getContext('2d')?.putImageData(imgData, 0, 0);
		ctx.drawImage(offscreen, 0, 0, w, h);
	}

	function draw2DOverlay(w: number, h: number): void {
		if (!ctx) return;
		const center = toScreen(0, 0, w, h);

		// Axes
		ctx.strokeStyle = 'rgba(128, 128, 128, 0.35)';
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.moveTo(center.x, 0);
		ctx.lineTo(center.x, h);
		ctx.moveTo(0, center.y);
		ctx.lineTo(w, center.y);
		ctx.stroke();

		// Axis labels
		ctx.font = '11px ui-monospace, Consolas, monospace';
		ctx.fillStyle = 'rgba(128, 128, 128, 0.75)';
		ctx.fillText('+b (yellow)', center.x + 6, 16);
		ctx.fillText('-b (blue)', center.x + 6, h - 8);
		ctx.fillText('-a (green)', 8, center.y - 6);
		ctx.fillText('+a (red)', w - 54, center.y - 6);

		// Current color pointer marker
		const curPos = toScreen(currentOklab.a, currentOklab.b, w, h);
		ctx.save();
		ctx.beginPath();
		ctx.arc(curPos.x, curPos.y, 6, 0, Math.PI * 2);
		ctx.fillStyle = `rgb(${currentRgb.r}, ${currentRgb.g}, ${currentRgb.b})`;
		ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
		ctx.shadowBlur = 8;
		ctx.fill();
		ctx.lineWidth = 2.5;
		ctx.strokeStyle = '#ffffff';
		ctx.stroke();
		ctx.restore();
	}

	function render(): void {
		if (!canvas2d) return;
		const rect = canvas2d.getBoundingClientRect();
		const w = rect.width;
		const h = rect.height;
		if (w < 4 || h < 4) return;

		const dpr = window.devicePixelRatio || 1;

		if (isGlAvailable && gl && glProg && glCanvas) {
			glCanvas.width = Math.round(w * dpr);
			glCanvas.height = Math.round(h * dpr);
			gl.viewport(0, 0, glCanvas.width, glCanvas.height);
			gl.useProgram(glProg);

			const pLoc = gl.getAttribLocation(glProg, 'aPos');
			gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
			gl.enableVertexAttribArray(pLoc);
			gl.vertexAttribPointer(pLoc, 2, gl.FLOAT, false, 0, 0);

			gl.uniform2f(gl.getUniformLocation(glProg, 'uRes'), glCanvas.width, glCanvas.height);
			gl.uniform1f(gl.getUniformLocation(glProg, 'uLightness'), currentOklab.L);

			gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
		}

		canvas2d.width = Math.round(w * dpr);
		canvas2d.height = Math.round(h * dpr);
		ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx?.clearRect(0, 0, w, h);

		if (!isGlAvailable) {
			renderGamutCPU(w, h);
		}

		draw2DOverlay(w, h);

		if (infoEl) {
			const zh = isZh();
			const test = oklabToRgb(currentOklab.L, currentOklab.a, currentOklab.b);
			const spaceText = test.inSrgb
				? zh
					? '色域: sRGB (标准)'
					: 'Gamut: sRGB (Standard)'
				: zh
					? '色域: Display P3 / 宽色域'
					: 'Gamut: Display P3 (Wide)';
			infoEl.textContent = `${spaceText} · L: ${(currentOklab.L * 100).toFixed(1)}% · C: ${currentOklab.C.toFixed(3)}`;
		}
	}

	function handlePointer(e: PointerEvent): void {
		if (!canvas2d) return;
		const rect = canvas2d.getBoundingClientRect();
		const px = e.clientX - rect.left;
		const py = e.clientY - rect.top;
		const { a, b } = fromScreen(px, py, rect.width, rect.height);
		// Out-of-gamut clicks snap to the gamut edge along the clicked hue,
		// so the picked color always matches the direction of the click.
		const inGamut = clampOklabToSrgb(currentOklab.L, a, b);
		const picked = oklabToRgb(currentOklab.L, inGamut.a, inGamut.b);
		onSelectRgb({ r: picked.r, g: picked.g, b: picked.b });
	}

	let isDragging = false;
	if (canvas2d) {
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
	}

	render();

	return {
		update(rgb: RgbColor): void {
			currentRgb = rgb;
			currentOklab = rgbToOklab(rgb.r, rgb.g, rgb.b);
			// keep the slider in step when the color changed elsewhere (hex
			// input, RGB fields, a slice click)
			lSlider.value = String(currentOklab.L);
			lVal.textContent = `${Math.round(currentOklab.L * 100)}%`;
			render();
		},
		destroy(): void {
			if (gl && glProg) gl.deleteProgram(glProg);
			if (gl && quadBuf) gl.deleteBuffer(quadBuf);
		},
	};
}
