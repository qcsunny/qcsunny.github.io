// Image convolution lab: drop an image, edit a 3×3 kernel (or pick a preset),
// and see the result re-convolved live on the GPU. The image never leaves the
// page — it is read into a texture and filtered in a fragment shader.

export function initImgFilter(host: HTMLElement): void {
	const wrap = document.createElement('div');
	wrap.className = 't-fractal';

	const canvas = document.createElement('canvas');
	canvas.className = 't-fractal-canvas';
	const glCtx = canvas.getContext('webgl', { preserveDrawingBuffer: true });
	if (!glCtx) {
		host.append('WebGL is not available in this browser.');
		return;
	}
	const gl = glCtx; // narrowed alias — closures below keep the non-null type

	const VERT = 'attribute vec2 p; varying vec2 vUv; void main() { vUv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }';
	const FRAG = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D uImg;
uniform vec2 uTexel;   // 1/width, 1/height
uniform mat3 uKernel;  // convolution kernel
uniform float uDivisor;
uniform float uOffset;
void main() {
	vec3 sum =
		texture2D(uImg, vUv + uTexel * vec2(-1.0,  1.0)).rgb * uKernel[0][0] +
		texture2D(uImg, vUv + uTexel * vec2( 0.0,  1.0)).rgb * uKernel[1][0] +
		texture2D(uImg, vUv + uTexel * vec2( 1.0,  1.0)).rgb * uKernel[2][0] +
		texture2D(uImg, vUv + uTexel * vec2(-1.0,  0.0)).rgb * uKernel[0][1] +
		texture2D(uImg, vUv + uTexel * vec2( 0.0,  0.0)).rgb * uKernel[1][1] +
		texture2D(uImg, vUv + uTexel * vec2( 1.0,  0.0)).rgb * uKernel[2][1] +
		texture2D(uImg, vUv + uTexel * vec2(-1.0, -1.0)).rgb * uKernel[0][2] +
		texture2D(uImg, vUv + uTexel * vec2( 0.0, -1.0)).rgb * uKernel[1][2] +
		texture2D(uImg, vUv + uTexel * vec2( 1.0, -1.0)).rgb * uKernel[2][2];
	gl_FragColor = vec4(sum / uDivisor + uOffset, 1.0);
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
		img: gl.getUniformLocation(prog, 'uImg'),
		texel: gl.getUniformLocation(prog, 'uTexel'),
		kernel: gl.getUniformLocation(prog, 'uKernel'),
		divisor: gl.getUniformLocation(prog, 'uDivisor'),
		offset: gl.getUniformLocation(prog, 'uOffset'),
	};

	let texture: WebGLTexture | null = null;
	let hasImage = false;

	function render(): void {
		if (!hasImage) return;
		gl.viewport(0, 0, canvas.width, canvas.height);
		gl.uniform1i(U.img, 0);
		gl.uniform2f(U.texel, 1 / canvas.width, 1 / canvas.height);
		// mat3 is column-major; our UI reads row-major so transpose
		gl.uniformMatrix3fv(U.kernel, false, new Float32Array([
			kernel[0], kernel[3], kernel[6],
			kernel[1], kernel[4], kernel[7],
			kernel[2], kernel[5], kernel[8],
		]));
		gl.uniform1f(U.divisor, divisor);
		gl.uniform1f(U.offset, offset);
		gl.drawArrays(gl.TRIANGLES, 0, 3);
	}

	// --- kernel editor: 9 number inputs in a grid ---
	let kernel = [0, 0, 0, 0, 1, 0, 0, 0, 0]; // identity by default
	let divisor = 1;
	let offset = 0;

	const controls = document.createElement('div');
	controls.className = 't-filerow t-filter-ctrl';

	const grid = document.createElement('div');
	grid.className = 't-kernel-grid';
	const cells: HTMLInputElement[] = [];
	for (let i = 0; i < 9; i++) {
		const input = document.createElement('input');
		input.type = 'number';
		input.step = 'any';
		input.value = String(kernel[i]);
		input.addEventListener('input', () => {
			kernel[i] = Number(input.value) || 0;
			render();
		});
		cells.push(input);
		grid.append(input);
	}
	controls.append(grid);

	const applyPreset = (name: string, k: number[], d: number, o: number): void => {
		kernel = [...k];
		divisor = d;
		offset = o;
		cells.forEach((c, i) => (c.value = String(kernel[i])));
		render();
	};
	const mkBtn = (label: string, onClick: () => void): HTMLButtonElement => {
		const b = document.createElement('button');
		b.type = 'button';
		b.className = 't-btn';
		b.textContent = label;
		b.addEventListener('click', onClick);
		return b;
	};
	const presets = document.createElement('div');
	presets.className = 't-filter-presets';
	presets.append(
		mkBtn('Identity', () => applyPreset('identity', [0, 0, 0, 0, 1, 0, 0, 0, 0], 1, 0)),
		mkBtn('Blur', () => applyPreset('blur', [1, 1, 1, 1, 1, 1, 1, 1, 1], 9, 0)),
		mkBtn('Sharpen', () => applyPreset('sharpen', [0, -1, 0, -1, 5, -1, 0, -1, 0], 1, 0)),
		mkBtn('Edge (Sobel)', () => applyPreset('sobel', [-1, 0, 1, -2, 0, 2, -1, 0, 1], 1, 0.5)),
		mkBtn('Emboss', () => applyPreset('emboss', [-2, -1, 0, -1, 1, 1, 0, 1, 2], 1, 0)),
	);
	controls.append(presets);

	const saveBtn = mkBtn('💾 PNG', () => {
		render();
		const a = document.createElement('a');
		a.href = canvas.toDataURL('image/png');
		a.download = `filtered-${Date.now()}.png`;
		a.click();
	});
	controls.append(saveBtn);

	const privacy = document.createElement('span');
	privacy.className = 't-file-privacy';
	privacy.append(
		Object.assign(document.createElement('span'), { className: 'i18n-en', textContent: '🔒 The image is processed locally and never uploaded.' }),
		Object.assign(document.createElement('span'), { className: 'i18n-zh', textContent: '🔒 图片全程本地处理，绝不上传。' }),
	);
	controls.append(privacy);

	// --- image source: file picker + drag & drop + generated sample ---
	const pick = mkBtn('📄 Choose image', () => fileInput.click());
	controls.append(pick);
	const fileInput = document.createElement('input');
	fileInput.type = 'file';
	fileInput.accept = 'image/*';
	fileInput.hidden = true;
	fileInput.addEventListener('change', () => {
		const f = fileInput.files?.[0];
		if (f) void loadImage(f);
		fileInput.value = '';
	});

	async function loadImage(file: File): Promise<void> {
		const url = URL.createObjectURL(file);
		const img = new Image();
		await new Promise<void>((resolve, reject) => {
			img.onload = () => resolve();
			img.onerror = () => reject(new Error('decode failed'));
			img.src = url;
		});
		URL.revokeObjectURL(url);
		setImage(img);
	}

	function setImage(img: HTMLImageElement): void {
		const maxDim = 1024; // GPU-side cap: a 24MP photo is pointless for a preview
		const scaleDown = Math.min(1, maxDim / Math.max(img.width, img.height));
		canvas.width = Math.max(1, Math.round(img.width * scaleDown));
		canvas.height = Math.max(1, Math.round(img.height * scaleDown));
		canvas.style.height = 'auto';
		canvas.style.aspectRatio = `${canvas.width} / ${canvas.height}`;
		if (texture) gl.deleteTexture(texture);
		texture = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, texture);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
		hasImage = true;
		render();
	}

	// sample image drawn locally so the page never starts blank
	function sampleImage(): void {
		const c = document.createElement('canvas');
		c.width = 800;
		c.height = 480;
		const ctx = c.getContext('2d') as CanvasRenderingContext2D;
		const g = ctx.createLinearGradient(0, 0, 800, 480);
		g.addColorStop(0, '#3b82f6');
		g.addColorStop(1, '#f97316');
		ctx.fillStyle = g;
		ctx.fillRect(0, 0, 800, 480);
		for (let i = 0; i < 12; i++) {
			ctx.beginPath();
			ctx.arc(80 + i * 60, 240 + 160 * Math.sin(i * 0.9), 14 + (i % 4) * 9, 0, Math.PI * 2);
			ctx.fillStyle = `hsl(${i * 30} 80% 60%)`;
			ctx.fill();
		}
		ctx.strokeStyle = '#fff';
		ctx.lineWidth = 6;
		ctx.strokeRect(60, 60, 680, 360);
		const img = new Image();
		img.onload = () => setImage(img);
		img.src = c.toDataURL();
	}

	// drop target
	for (const zone of [wrap, canvas] as HTMLElement[]) {
		zone.addEventListener('dragover', (e) => {
			e.preventDefault();
			zone.classList.add('t-droptarget');
		});
		zone.addEventListener('dragleave', () => zone.classList.remove('t-droptarget'));
		zone.addEventListener('drop', (e) => {
			e.preventDefault();
			zone.classList.remove('t-droptarget');
			const f = e.dataTransfer?.files?.[0];
			if (f && f.type.startsWith('image/')) void loadImage(f);
		});
	}

	wrap.append(canvas);
	host.append(controls, wrap, fileInput);
	sampleImage();
}
