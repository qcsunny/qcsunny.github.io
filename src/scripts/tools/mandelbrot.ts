// Mandelbrot / Julia set explorer — one fragment shader, one pan/zoom
// interaction model, zero libraries. Everything renders on the GPU: each
// pixel runs its own escape-time iteration, so a 60fps drag through
// 10^14 zoom needs nothing but the browser's WebGL.

export function initMandelbrot(host: HTMLElement): void {
	const wrap = document.createElement('div');
	wrap.className = 't-fractal';

	const canvas = document.createElement('canvas');
	canvas.className = 't-fractal-canvas';
	const dpr = Math.min(2, window.devicePixelRatio || 1);
	function resize(): void {
		const w = wrap.clientWidth || 800;
		const h = Math.round(w * 0.6);
		canvas.width = Math.round(w * dpr);
		canvas.height = Math.round(h * dpr);
		canvas.style.height = `${h}px`;
		render();
	}

	const glCtx = canvas.getContext('webgl', { preserveDrawingBuffer: true });
	if (!glCtx) {
		host.append('WebGL is not available in this browser.');
		return;
	}
	const gl = glCtx; // narrowed alias — closures below keep the non-null type

	const VERT = 'attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }';
	const FRAG = `
precision highp float;
uniform vec2 uRes;      // canvas pixels
uniform vec2 uCenter;   // fast-path complex plane center
uniform vec2 uCenterX;  // deep path: (float32 high, residual low)
uniform vec2 uCenterY;
uniform float uScale;   // complex-plane units per canvas pixel
uniform int uMaxIter;
uniform vec2 uJulia;    // Julia constant (uMode 1) — unused in mode 0
uniform int uMode;      // 0 = Mandelbrot, 1 = Julia
uniform float uHue;     // palette shift 0..1
uniform int uDeep;      // double-single path below float32 pixel precision

// Double-single arithmetic: one value is hi+lo, about 44-48 useful bits on
// float32 hardware. 4097 = 2^12+1 splits a 24-bit float for Dekker product.
vec2 dsAdd(vec2 a, vec2 b) {
	float s = a.x + b.x;
	float v = s - a.x;
	float t = ((b.x - v) + (a.x - (s - v))) + a.y + b.y;
	float z = s + t;
	return vec2(z, t - (z - s));
}
vec2 dsSub(vec2 a, vec2 b) { return dsAdd(a, -b); }
vec2 dsMul(vec2 a, vec2 b) {
	float p = a.x * b.x;
	float ca = a.x * 4097.0;
	float cb = b.x * 4097.0;
	float ah = ca - (ca - a.x);
	float bh = cb - (cb - b.x);
	float al = a.x - ah;
	float bl = b.x - bh;
	float e = (((ah * bh - p) + ah * bl) + al * bh) + al * bl;
	e += a.x * b.y + a.y * b.x;
	float z = p + e;
	return vec2(z, e - (z - p));
}
void main() {
	vec2 pixel = (gl_FragCoord.xy - uRes * 0.5) * uScale;
	float i = 0.0;
	float escaped = 0.0;
	float mag2 = 0.0;
	if (uDeep == 0) {
		vec2 c = uCenter + pixel;
		vec2 z = uMode == 1 ? c : vec2(0.0);
		vec2 k = uMode == 1 ? uJulia : c;
		for (int n = 0; n < 2000; n++) {
			if (n >= uMaxIter) break;
			z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + k;
			mag2 = dot(z, z);
			if (mag2 > 256.0) { escaped = 1.0; break; }
			i += 1.0;
		}
	} else {
		vec2 cr = dsAdd(uCenterX, vec2(pixel.x, 0.0));
		vec2 ci = dsAdd(uCenterY, vec2(pixel.y, 0.0));
		vec2 zr = uMode == 1 ? cr : vec2(0.0);
		vec2 zi = uMode == 1 ? ci : vec2(0.0);
		vec2 kr = uMode == 1 ? vec2(uJulia.x, 0.0) : cr;
		vec2 ki = uMode == 1 ? vec2(uJulia.y, 0.0) : ci;
		for (int n = 0; n < 2000; n++) {
			if (n >= uMaxIter) break;
			vec2 zr2 = dsMul(zr, zr);
			vec2 zi2 = dsMul(zi, zi);
			vec2 zrzi = dsMul(zr, zi);
			zr = dsAdd(dsSub(zr2, zi2), kr);
			zi = dsAdd(dsAdd(zrzi, zrzi), ki);
			mag2 = zr.x * zr.x + zi.x * zi.x;
			if (mag2 > 256.0) { escaped = 1.0; break; }
			i += 1.0;
		}
	}
	if (escaped < 0.5) { gl_FragColor = vec4(0.03, 0.04, 0.08, 1.0); return; }
	// smooth iteration count + cyclic palette (cosine palette, iq style)
	float sn = i - log2(log2(mag2) / 2.0) + 4.0;
	float t = 0.02 * sqrt(sn) + uHue;
	vec3 col = 0.5 + 0.5 * cos(6.28318 * (t + vec3(0.0, 0.33, 0.67)));
	gl_FragColor = vec4(col, 1.0);
}`;

	function compile(type: number, src: string): WebGLShader {
		const s = gl.createShader(type) as WebGLShader;
		gl.shaderSource(s, src);
		gl.compileShader(s);
		if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
		return s;
	}
	const prog = gl.createProgram() as WebGLProgram;
	gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
	gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
	gl.linkProgram(prog);
	gl.useProgram(prog);

	const buf = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, buf);
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
	const loc = gl.getAttribLocation(prog, 'p');
	gl.enableVertexAttribArray(loc);
	gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

	const U = {
		res: gl.getUniformLocation(prog, 'uRes'),
		center: gl.getUniformLocation(prog, 'uCenter'),
		centerX: gl.getUniformLocation(prog, 'uCenterX'),
		centerY: gl.getUniformLocation(prog, 'uCenterY'),
		scale: gl.getUniformLocation(prog, 'uScale'),
		iter: gl.getUniformLocation(prog, 'uMaxIter'),
		julia: gl.getUniformLocation(prog, 'uJulia'),
		mode: gl.getUniformLocation(prog, 'uMode'),
		hue: gl.getUniformLocation(prog, 'uHue'),
		deep: gl.getUniformLocation(prog, 'uDeep'),
	};

	// --- state ---
	let cx = -0.6;
	let cy = 0.0;
	// Zoom is stored as the complex-plane SPAN across the canvas width, not
	// per-pixel units — canvas.width is 0 at init, and a per-pixel scale would
	// divide by it. render() derives pixels-per-unit each frame.
	let span = 3.2;
	let iter = 300;
	let mode = 0;
	let jx = -0.7269;
	let jy = 0.1889;
	let hue = 0.0;

	const splitFloat = (v: number): [number, number] => {
		const hi = Math.fround(v);
		return [hi, Math.fround(v - hi)];
	};

	function render(): void {
		gl.viewport(0, 0, canvas.width, canvas.height);
		gl.uniform2f(U.res, canvas.width, canvas.height);
		gl.uniform2f(U.center, cx, cy);
		const [cxHi, cxLo] = splitFloat(cx);
		const [cyHi, cyLo] = splitFloat(cy);
		gl.uniform2f(U.centerX, cxHi, cxLo);
		gl.uniform2f(U.centerY, cyHi, cyLo);
		gl.uniform1i(U.deep, span < 2e-4 ? 1 : 0);
		gl.uniform1f(U.scale, span / canvas.width);
		gl.uniform1i(U.iter, iter);
		gl.uniform2f(U.julia, jx, jy);
		gl.uniform1i(U.mode, mode);
		gl.uniform1f(U.hue, hue);
		gl.drawArrays(gl.TRIANGLES, 0, 3);
	}

	// --- controls row ---
	const controls = document.createElement('div');
	controls.className = 't-filerow t-fractal-ctrl';
	const mkBtn = (en: string, zh: string, onClick: () => void): HTMLButtonElement => {
		const b = document.createElement('button');
		b.type = 'button';
		b.className = 't-btn';
		b.append(
			Object.assign(document.createElement('span'), { className: 'i18n-en', textContent: en }),
			Object.assign(document.createElement('span'), { className: 'i18n-zh', textContent: zh }),
		);
		b.addEventListener('click', onClick);
		return b;
	};
	const reset = (): void => {
		cx = mode ? 0 : -0.6;
		cy = 0;
		span = 3.2;
		iter = 300;
		render();
	};
	controls.append(mkBtn('Reset view', '重置视图', reset));

	const modeBtn = mkBtn('Julia mode →', '切换朱利亚集 →', () => {
		mode = mode ? 0 : 1;
		modeBtn.textContent = '';
		modeBtn.append(
			Object.assign(document.createElement('span'), { className: 'i18n-en', textContent: mode ? '← Mandelbrot' : 'Julia mode →' }),
			Object.assign(document.createElement('span'), { className: 'i18n-zh', textContent: mode ? '← 曼德博集' : '切换朱利亚集 →' }),
		);
		reset();
	});
	controls.append(modeBtn);

	const saveBtn = mkBtn('💾 PNG', '💾 保存 PNG', () => {
		render(); // preserveDrawingBuffer keeps the last frame
		const a = document.createElement('a');
		a.href = canvas.toDataURL('image/png');
		a.download = `fractal-${Date.now()}.png`;
		a.click();
	});
	controls.append(saveBtn);

	const iterLabel = document.createElement('span');
	iterLabel.className = 't-file-hint';
	iterLabel.append(
		Object.assign(document.createElement('span'), { className: 'i18n-en', textContent: 'iterations' }),
		Object.assign(document.createElement('span'), { className: 'i18n-zh', textContent: '迭代次数' }),
	);
	const iterInput = document.createElement('input');
	iterInput.type = 'range';
	iterInput.min = '50';
	iterInput.max = '1200';
	iterInput.value = '300';
	iterInput.addEventListener('input', () => {
		iter = Number(iterInput.value);
		render();
	});
	controls.append(iterInput, iterLabel);

	const hueLabel = document.createElement('span');
	hueLabel.className = 't-file-hint';
	hueLabel.append(
		Object.assign(document.createElement('span'), { className: 'i18n-en', textContent: 'palette' }),
		Object.assign(document.createElement('span'), { className: 'i18n-zh', textContent: '配色' }),
	);
	const hueInput = document.createElement('input');
	hueInput.type = 'range';
	hueInput.min = '0';
	hueInput.max = '100';
	hueInput.addEventListener('input', () => {
		hue = Number(hueInput.value) / 100;
		render();
	});
	controls.append(hueLabel, hueInput);

	const zoomLabel = document.createElement('span');
	zoomLabel.className = 't-file-hint t-fractal-zoom';
	zoomLabel.append(
		Object.assign(document.createElement('span'), { className: 'i18n-en', textContent: 'drag to pan · wheel to zoom' }),
		Object.assign(document.createElement('span'), { className: 'i18n-zh', textContent: '拖动平移 · 滚轮缩放' }),
	);
	controls.append(zoomLabel);

	// --- interaction: drag pan, wheel zoom at cursor ---
	let dragging = false;
	let lastX = 0;
	let lastY = 0;
	canvas.addEventListener('pointerdown', (e) => {
		dragging = true;
		lastX = e.clientX;
		lastY = e.clientY;
		canvas.setPointerCapture(e.pointerId);
	});
	canvas.addEventListener('pointermove', (e) => {
		if (!dragging) return;
		const px = span / canvas.width;
		cx -= (e.clientX - lastX) * px * dpr;
		cy += (e.clientY - lastY) * px * dpr;
		lastX = e.clientX;
		lastY = e.clientY;
		render();
	});
	canvas.addEventListener('pointerup', () => (dragging = false));
	canvas.addEventListener(
		'wheel',
		(e) => {
			e.preventDefault();
			const rect = canvas.getBoundingClientRect();
			const px = ((e.clientX - rect.left) * canvas.width) / rect.width;
			const py = ((e.clientY - rect.top) * canvas.height) / rect.height;
			// zoom anchored at the cursor: keep the complex point under it fixed
			const s = span / canvas.width;
			const zx = cx + (px - canvas.width / 2) * s;
			const zy = cy - (py - canvas.height / 2) * s;
			const factor = Math.exp(-e.deltaY * 0.0015);
			span /= factor;
			// JS center + double-single shader floor: below ~1e-13 the 44-48
			// effective bits no longer keep adjacent complex coordinates distinct
			if (span < 1e-13) span = 1e-13;
			if (span > 6) span = 6;
			const s2 = span / canvas.width;
			cx = zx - (px - canvas.width / 2) * s2;
			cy = zy + (py - canvas.height / 2) * s2;
			// deepen iterations as we dive, back off as we zoom out
			iter = Math.max(100, Math.min(1200, Math.round(300 - Math.log10(span / 3.2) * 120)));
			iterInput.value = String(iter);
			render();
		},
		{ passive: false },
	);
	// double-click: zoom in 4x at the point
	canvas.addEventListener('dblclick', (e) => {
		const rect = canvas.getBoundingClientRect();
		const px = ((e.clientX - rect.left) * canvas.width) / rect.width;
		const py = ((e.clientY - rect.top) * canvas.height) / rect.height;
		const s = span / canvas.width;
		const zx = cx + (px - canvas.width / 2) * s;
		const zy = cy - (py - canvas.height / 2) * s;
		span /= 4;
		const s2 = span / canvas.width;
		cx = zx - (px - canvas.width / 2) * s2;
		cy = zy + (py - canvas.height / 2) * s2;
		render();
	});

	wrap.append(canvas);
	host.append(controls, wrap);
	resize();
	window.addEventListener('resize', resize);
}
