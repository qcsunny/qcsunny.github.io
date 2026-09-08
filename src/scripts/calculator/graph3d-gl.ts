// WebGL hardware-accelerated 3D surface renderer with smooth Gouraud/Phong shading,
// hardware depth buffering, and 60fps MVP transform orbiting.
// Zero external libraries: pure native WebGL 1/2.

export type Style = 'surface' | 'mesh' | 'wire';

export interface Domain {
	xMin: number;
	xMax: number;
	yMin: number;
	yMax: number;
}

export interface GridData {
	n: number;
	z: Float64Array;
	ok: Uint8Array;
	zLo: number;
	zHi: number;
	finite: number;
}

export interface Palette {
	fg: string;
	dim: string;
	grid: string;
	bg: string;
}

const Z_STRETCH = 0.75;
const LIGHT: readonly [number, number, number] = (() => {
	const v: [number, number, number] = [-0.42, -0.58, 0.7];
	const m = Math.hypot(...v);
	return [v[0] / m, v[1] / m, v[2] / m] as const;
})();

function parseColor(str: string, defaultAlpha = 1.0): [number, number, number, number] {
	if (str.startsWith('#')) {
		let c = str.slice(1);
		if (c.length === 3) c = c[0]! + c[0]! + c[1]! + c[1]! + c[2]! + c[2]!;
		const num = parseInt(c, 16);
		return [(num >> 16 & 255) / 255, (num >> 8 & 255) / 255, (num & 255) / 255, defaultAlpha];
	}
	const m = str.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
	if (m) {
		return [
			Number(m[1]) / 255,
			Number(m[2]) / 255,
			Number(m[3]) / 255,
			m[4] !== undefined ? Number(m[4]) : defaultAlpha,
		];
	}
	return [0.5, 0.5, 0.5, defaultAlpha];
}

const VS_SURFACE = `
attribute vec3 aPos;
attribute vec3 aNorm;
attribute float aTone;
attribute float aValid;

uniform mat4 uMVP;

varying vec3 vNorm;
varying float vTone;
varying float vValid;

void main() {
    vNorm = aNorm;
    vTone = aTone;
    vValid = aValid;
    gl_Position = uMVP * vec4(aPos, 1.0);
}
`;

const FS_SURFACE = `
precision mediump float;

varying vec3 vNorm;
varying float vTone;
varying float vValid;

uniform vec3 uLight;
uniform int uStyle; // 0: surface, 1: mesh (opaque back), 2: wire
uniform vec3 uBg;

vec3 viridis(float t) {
    t = clamp(t, 0.0, 1.0);
    vec3 c0 = vec3(0.267, 0.004, 0.329);
    vec3 c1 = vec3(0.231, 0.322, 0.545);
    vec3 c2 = vec3(0.129, 0.569, 0.549);
    vec3 c3 = vec3(0.369, 0.788, 0.384);
    vec3 c4 = vec3(0.992, 0.906, 0.145);
    if (t < 0.25) return mix(c0, c1, t * 4.0);
    if (t < 0.50) return mix(c1, c2, (t - 0.25) * 4.0);
    if (t < 0.75) return mix(c2, c3, (t - 0.50) * 4.0);
    return mix(c3, c4, (t - 0.75) * 4.0);
}

void main() {
    if (vValid < 0.5) discard;
    vec3 n = normalize(vNorm);
    float dotL = abs(dot(n, normalize(uLight)));
    float lit = 0.52 + 0.48 * dotL;
    vec3 col = viridis(vTone);
    if (uStyle == 1) {
        col = uBg;
    }
    if (uStyle == 2) {
        gl_FragColor = vec4(col, 0.75);
    } else {
        gl_FragColor = vec4(col * lit, 1.0);
    }
}
`;

const VS_LINES = `
attribute vec3 aPos;
attribute vec4 aColor;
uniform mat4 uMVP;
varying vec4 vColor;
void main() {
    vColor = aColor;
    gl_Position = uMVP * vec4(aPos, 1.0);
}
`;

const FS_LINES = `
precision mediump float;
varying vec4 vColor;
void main() {
    gl_FragColor = vColor;
}
`;

export interface WebGLSurfaceRenderer {
	readonly isSupported: boolean;
	resize(cssW: number, cssH: number, dpr: number): void;
	uploadGeometry(
		g: GridData,
		domain: Domain,
		toU: (x: number) => number,
		toV: (y: number) => number,
		toW: (z: number, g: { zLo: number; zHi: number }) => number,
	): void;
	uploadFloorAndBox(
		palette: Palette,
		xTicks: number[],
		yTicks: number[],
		uMax: number,
		vMax: number,
		toU: (x: number) => number,
		toV: (y: number) => number,
	): void;
	render(mvp: Float32Array, style: Style, palette: Palette): void;
	clear(): void;
	destroy(): void;
}

export function createWebGLRenderer(canvas: HTMLCanvasElement): WebGLSurfaceRenderer | null {
	try {
		const gl =
			(canvas.getContext('webgl2', {
				alpha: true,
				antialias: true,
				preserveDrawingBuffer: true,
			}) as WebGLRenderingContext | WebGL2RenderingContext | null) ||
			(canvas.getContext('webgl', {
				alpha: true,
				antialias: true,
				preserveDrawingBuffer: true,
			}) as WebGLRenderingContext | null);

		if (!gl) return null;

	const isWebGL2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
	const uintExt = isWebGL2 ? true : !!gl.getExtension('OES_element_index_uint');

	function compileShader(type: number, src: string): WebGLShader | null {
		const s = gl!.createShader(type);
		if (!s) return null;
		gl!.shaderSource(s, src);
		gl!.compileShader(s);
		if (!gl!.getShaderParameter(s, gl!.COMPILE_STATUS)) {
			console.warn('[WebGL] Shader compile error:', gl!.getShaderInfoLog(s));
			gl!.deleteShader(s);
			return null;
		}
		return s;
	}

	function createProg(vsSrc: string, fsSrc: string): WebGLProgram | null {
		const vs = compileShader(gl!.VERTEX_SHADER, vsSrc);
		const fs = compileShader(gl!.FRAGMENT_SHADER, fsSrc);
		if (!vs || !fs) return null;
		const p = gl!.createProgram();
		if (!p) return null;
		gl!.attachShader(p, vs);
		gl!.attachShader(p, fs);
		gl!.linkProgram(p);
		if (!gl!.getProgramParameter(p, gl!.LINK_STATUS)) {
			console.warn('[WebGL] Program link error:', gl!.getProgramInfoLog(p));
			gl!.deleteProgram(p);
			return null;
		}
		return p;
	}

	const surfProg = createProg(VS_SURFACE, FS_SURFACE);
	const lineProg = createProg(VS_LINES, FS_LINES);
	if (!surfProg || !lineProg) return null;

	// Surface locations
	const sLoc = {
		aPos: gl.getAttribLocation(surfProg, 'aPos'),
		aNorm: gl.getAttribLocation(surfProg, 'aNorm'),
		aTone: gl.getAttribLocation(surfProg, 'aTone'),
		aValid: gl.getAttribLocation(surfProg, 'aValid'),
		uMVP: gl.getUniformLocation(surfProg, 'uMVP'),
		uLight: gl.getUniformLocation(surfProg, 'uLight'),
		uStyle: gl.getUniformLocation(surfProg, 'uStyle'),
		uBg: gl.getUniformLocation(surfProg, 'uBg'),
	};

	// Line locations
	const lLoc = {
		aPos: gl.getAttribLocation(lineProg, 'aPos'),
		aColor: gl.getAttribLocation(lineProg, 'aColor'),
		uMVP: gl.getUniformLocation(lineProg, 'uMVP'),
	};

	// Buffers
	const posBuf = gl.createBuffer();
	const normBuf = gl.createBuffer();
	const toneBuf = gl.createBuffer();
	const validBuf = gl.createBuffer();
	const triIdxBuf = gl.createBuffer();
	const wireIdxBuf = gl.createBuffer();

	const linePosColorBuf = gl.createBuffer();

	let numTriangles = 0;
	let numWireIndices = 0;
	let numLineVertices = 0;
	let indexType: number = gl.UNSIGNED_SHORT;

	gl.enable(gl.DEPTH_TEST);
	gl.depthFunc(gl.LEQUAL);
	gl.enable(gl.BLEND);
	gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

	function resize(cssW: number, cssH: number, dpr: number): void {
		canvas.width = Math.round(cssW * dpr);
		canvas.height = Math.round(cssH * dpr);
		gl!.viewport(0, 0, canvas.width, canvas.height);
	}

	function uploadGeometry(
		g: GridData,
		domain: Domain,
		toU: (x: number) => number,
		toV: (y: number) => number,
		toW: (z: number, g: { zLo: number; zHi: number }) => number,
	): void {
		const N = g.n;
		const stride = N + 1;
		const totalVerts = stride * stride;

		indexType = totalVerts > 65535 && uintExt ? gl!.UNSIGNED_INT : gl!.UNSIGNED_SHORT;

		const positions = new Float32Array(totalVerts * 3);
		const normals = new Float32Array(totalVerts * 3);
		const tones = new Float32Array(totalVerts);
		const valids = new Float32Array(totalVerts);

		const zSpan = (g.zHi - g.zLo) || 1;

		// 1. Build vertex positions and tone values
		for (let j = 0; j <= N; j++) {
			const v = toV(domain.yMin + ((domain.yMax - domain.yMin) * j) / N);
			for (let i = 0; i <= N; i++) {
				const k = j * stride + i;
				const u = toU(domain.xMin + ((domain.xMax - domain.xMin) * i) / N);
				const ok = g.ok[k];
				const w = ok ? toW(g.z[k] as number, g) : 0;

				const ptr = k * 3;
				positions[ptr] = u;
				positions[ptr + 1] = v;
				positions[ptr + 2] = w;

				const rawZ = ok ? (g.z[k] as number) : g.zLo;
				tones[k] = (Math.min(g.zHi, Math.max(g.zLo, rawZ)) - g.zLo) / zSpan;
				valids[k] = ok ? 1.0 : 0.0;
			}
		}

		// 2. Smooth per-vertex normals via central differences
		const du = (toU(domain.xMax) - toU(domain.xMin)) / N || 1e-4;
		const dv = (toV(domain.yMax) - toV(domain.yMin)) / N || 1e-4;

		for (let j = 0; j <= N; j++) {
			for (let i = 0; i <= N; i++) {
				const k = j * stride + i;
				const ptr = k * 3;
				if (!g.ok[k]) {
					normals[ptr] = 0;
					normals[ptr + 1] = 0;
					normals[ptr + 2] = 1;
					continue;
				}

				const i0 = Math.max(0, i - 1);
				const i1 = Math.min(N, i + 1);
				const k0 = j * stride + i0;
				const k1 = j * stride + i1;
				const w0 = positions[k0 * 3 + 2] as number;
				const w1 = positions[k1 * 3 + 2] as number;
				const dw_du = (w1 - w0) / ((i1 - i0) * du || du);

				const j0 = Math.max(0, j - 1);
				const j1 = Math.min(N, j + 1);
				const m0 = j0 * stride + i;
				const m1 = j1 * stride + i;
				const v0 = positions[m0 * 3 + 2] as number;
				const v1 = positions[m1 * 3 + 2] as number;
				const dw_dv = (v1 - v0) / ((j1 - j0) * dv || dv);

				const nx = -dw_du;
				const ny = -dw_dv;
				const nz = 1.0;
				const m = Math.hypot(nx, ny, nz) || 1;

				normals[ptr] = nx / m;
				normals[ptr + 1] = ny / m;
				normals[ptr + 2] = nz / m;
			}
		}

		// 3. Triangles and wireframe index buffers
		const triIndices = totalVerts > 65535 && uintExt ? new Uint32Array(N * N * 6) : new Uint16Array(N * N * 6);
		const wireIndices = totalVerts > 65535 && uintExt ? new Uint32Array(N * N * 4 + (N + N) * 2) : new Uint16Array(N * N * 4 + (N + N) * 2);

		let tPtr = 0;
		let wPtr = 0;

		for (let j = 0; j < N; j++) {
			for (let i = 0; i < N; i++) {
				const k00 = j * stride + i;
				const k10 = j * stride + (i + 1);
				const k01 = (j + 1) * stride + i;
				const k11 = (j + 1) * stride + (i + 1);

				if (g.ok[k00] && g.ok[k10] && g.ok[k01] && g.ok[k11]) {
					// 2 triangles
					triIndices[tPtr++] = k00;
					triIndices[tPtr++] = k10;
					triIndices[tPtr++] = k11;
					triIndices[tPtr++] = k00;
					triIndices[tPtr++] = k11;
					triIndices[tPtr++] = k01;

					// Wireframe edges
					wireIndices[wPtr++] = k00;
					wireIndices[wPtr++] = k10;
					wireIndices[wPtr++] = k00;
					wireIndices[wPtr++] = k01;
					if (i === N - 1) {
						wireIndices[wPtr++] = k10;
						wireIndices[wPtr++] = k11;
					}
					if (j === N - 1) {
						wireIndices[wPtr++] = k01;
						wireIndices[wPtr++] = k11;
					}
				}
			}
		}

		numTriangles = tPtr;
		numWireIndices = wPtr;

		// Upload attributes to WebGL
		gl!.bindBuffer(gl!.ARRAY_BUFFER, posBuf);
		gl!.bufferData(gl!.ARRAY_BUFFER, positions, gl!.STATIC_DRAW);

		gl!.bindBuffer(gl!.ARRAY_BUFFER, normBuf);
		gl!.bufferData(gl!.ARRAY_BUFFER, normals, gl!.STATIC_DRAW);

		gl!.bindBuffer(gl!.ARRAY_BUFFER, toneBuf);
		gl!.bufferData(gl!.ARRAY_BUFFER, tones, gl!.STATIC_DRAW);

		gl!.bindBuffer(gl!.ARRAY_BUFFER, validBuf);
		gl!.bufferData(gl!.ARRAY_BUFFER, valids, gl!.STATIC_DRAW);

		gl!.bindBuffer(gl!.ELEMENT_ARRAY_BUFFER, triIdxBuf);
		gl!.bufferData(gl!.ELEMENT_ARRAY_BUFFER, triIndices.subarray(0, tPtr), gl!.STATIC_DRAW);

		gl!.bindBuffer(gl!.ELEMENT_ARRAY_BUFFER, wireIdxBuf);
		gl!.bufferData(gl!.ELEMENT_ARRAY_BUFFER, wireIndices.subarray(0, wPtr), gl!.STATIC_DRAW);
	}

	function uploadFloorAndBox(
		palette: Palette,
		xTicks: number[],
		yTicks: number[],
		uMax: number,
		vMax: number,
		toU: (x: number) => number,
		toV: (y: number) => number,
	): void {
		const lo = -Z_STRETCH;
		const hi = Z_STRETCH;

		const cGrid = parseColor(palette.grid, 0.85);
		const cBox = parseColor(palette.dim, 0.45);

		// Count line vertices: box (12 edges * 2 = 24) + floor lines
		const floorLineCount = (xTicks.length + yTicks.length) * 2;
		const totalVerts = 24 + floorLineCount;
		const data = new Float32Array(totalVerts * 7); // pos(3) + color(4)

		let ptr = 0;
		const addVertex = (x: number, y: number, z: number, c: [number, number, number, number]): void => {
			data[ptr++] = x;
			data[ptr++] = y;
			data[ptr++] = z;
			data[ptr++] = c[0];
			data[ptr++] = c[1];
			data[ptr++] = c[2];
			data[ptr++] = c[3];
		};

		// 1. Floor grid lines (at w = lo)
		for (const x of xTicks) {
			const u = toU(x);
			addVertex(u, -vMax, lo, cGrid);
			addVertex(u, vMax, lo, cGrid);
		}
		for (const y of yTicks) {
			const v = toV(y);
			addVertex(-uMax, v, lo, cGrid);
			addVertex(uMax, v, lo, cGrid);
		}

		// 2. Box 12 edges
		const corners: Array<[number, number, number]> = [
			[-uMax, -vMax, lo],
			[uMax, -vMax, lo],
			[uMax, vMax, lo],
			[-uMax, vMax, lo],
			[-uMax, -vMax, hi],
			[uMax, -vMax, hi],
			[uMax, vMax, hi],
			[-uMax, vMax, hi],
		];
		const edges: Array<[number, number]> = [
			[0, 1], [1, 2], [2, 3], [3, 0],
			[4, 5], [5, 6], [6, 7], [7, 4],
			[0, 4], [1, 5], [2, 6], [3, 7],
		];
		for (const [i, j] of edges) {
			const a = corners[i] as [number, number, number];
			const b = corners[j] as [number, number, number];
			addVertex(a[0], a[1], a[2], cBox);
			addVertex(b[0], b[1], b[2], cBox);
		}

		numLineVertices = totalVerts;
		gl!.bindBuffer(gl!.ARRAY_BUFFER, linePosColorBuf);
		gl!.bufferData(gl!.ARRAY_BUFFER, data, gl!.STATIC_DRAW);
	}

	function render(mvp: Float32Array, style: Style, palette: Palette): void {
		gl!.clearColor(0, 0, 0, 0);
		gl!.clear(gl!.COLOR_BUFFER_BIT | gl!.DEPTH_BUFFER_BIT);

		// 1. Draw floor and bounding box lines
		if (numLineVertices > 0) {
			gl!.useProgram(lineProg);
			gl!.uniformMatrix4fv(lLoc.uMVP, false, mvp);

			gl!.bindBuffer(gl!.ARRAY_BUFFER, linePosColorBuf);
			gl!.enableVertexAttribArray(lLoc.aPos);
			gl!.vertexAttribPointer(lLoc.aPos, 3, gl!.FLOAT, false, 7 * 4, 0);
			gl!.enableVertexAttribArray(lLoc.aColor);
			gl!.vertexAttribPointer(lLoc.aColor, 4, gl!.FLOAT, false, 7 * 4, 3 * 4);

			gl!.drawArrays(gl!.LINES, 0, numLineVertices);

			gl!.disableVertexAttribArray(lLoc.aPos);
			gl!.disableVertexAttribArray(lLoc.aColor);
		}

		// 2. Draw 3D surface
		if (numTriangles > 0) {
			gl!.useProgram(surfProg);
			gl!.uniformMatrix4fv(sLoc.uMVP, false, mvp);
			gl!.uniform3f(sLoc.uLight, LIGHT[0], LIGHT[1], LIGHT[2]);
			const bgRgb = parseColor(palette.bg);
			gl!.uniform3f(sLoc.uBg, bgRgb[0], bgRgb[1], bgRgb[2]);

			gl!.bindBuffer(gl!.ARRAY_BUFFER, posBuf);
			gl!.enableVertexAttribArray(sLoc.aPos);
			gl!.vertexAttribPointer(sLoc.aPos, 3, gl!.FLOAT, false, 0, 0);

			gl!.bindBuffer(gl!.ARRAY_BUFFER, normBuf);
			gl!.enableVertexAttribArray(sLoc.aNorm);
			gl!.vertexAttribPointer(sLoc.aNorm, 3, gl!.FLOAT, false, 0, 0);

			gl!.bindBuffer(gl!.ARRAY_BUFFER, toneBuf);
			gl!.enableVertexAttribArray(sLoc.aTone);
			gl!.vertexAttribPointer(sLoc.aTone, 1, gl!.FLOAT, false, 0, 0);

			gl!.bindBuffer(gl!.ARRAY_BUFFER, validBuf);
			gl!.enableVertexAttribArray(sLoc.aValid);
			gl!.vertexAttribPointer(sLoc.aValid, 1, gl!.FLOAT, false, 0, 0);

			if (style === 'surface') {
				gl!.uniform1i(sLoc.uStyle, 0);
				gl!.bindBuffer(gl!.ELEMENT_ARRAY_BUFFER, triIdxBuf);
				gl!.drawElements(gl!.TRIANGLES, numTriangles, indexType, 0);
			} else if (style === 'mesh') {
				// Base solid surface in background color (prevents seeing through to back wires)
				gl!.uniform1i(sLoc.uStyle, 1);
				gl!.enable(gl!.POLYGON_OFFSET_FILL);
				gl!.polygonOffset(1.0, 1.0);
				gl!.bindBuffer(gl!.ELEMENT_ARRAY_BUFFER, triIdxBuf);
				gl!.drawElements(gl!.TRIANGLES, numTriangles, indexType, 0);
				gl!.disable(gl!.POLYGON_OFFSET_FILL);

				// Overlay wireframe
				gl!.uniform1i(sLoc.uStyle, 2);
				gl!.bindBuffer(gl!.ELEMENT_ARRAY_BUFFER, wireIdxBuf);
				gl!.drawElements(gl!.LINES, numWireIndices, indexType, 0);
			} else if (style === 'wire') {
				gl!.uniform1i(sLoc.uStyle, 2);
				gl!.bindBuffer(gl!.ELEMENT_ARRAY_BUFFER, wireIdxBuf);
				gl!.drawElements(gl!.LINES, numWireIndices, indexType, 0);
			}

			gl!.disableVertexAttribArray(sLoc.aPos);
			gl!.disableVertexAttribArray(sLoc.aNorm);
			gl!.disableVertexAttribArray(sLoc.aTone);
			gl!.disableVertexAttribArray(sLoc.aValid);
		}
	}

	function clear(): void {
		gl!.clearColor(0, 0, 0, 0);
		gl!.clear(gl!.COLOR_BUFFER_BIT | gl!.DEPTH_BUFFER_BIT);
	}

	function destroy(): void {
		clear();
		if (posBuf) gl!.deleteBuffer(posBuf);
		if (normBuf) gl!.deleteBuffer(normBuf);
		if (toneBuf) gl!.deleteBuffer(toneBuf);
		if (validBuf) gl!.deleteBuffer(validBuf);
		if (triIdxBuf) gl!.deleteBuffer(triIdxBuf);
		if (wireIdxBuf) gl!.deleteBuffer(wireIdxBuf);
		if (linePosColorBuf) gl!.deleteBuffer(linePosColorBuf);
		if (surfProg) gl!.deleteProgram(surfProg);
		if (lineProg) gl!.deleteProgram(lineProg);
	}

	return {
		isSupported: true,
		resize,
		uploadGeometry,
		uploadFloorAndBox,
		render,
		clear,
		destroy,
	};
	} catch (e) {
		console.warn('[WebGL] Failed to initialize WebGL renderer, falling back to CPU:', e);
		return null;
	}
}

