// WebGL 2D hardware accelerator for:
// 1. Implicit Curve rendering F(x, y) = 0 with sub-pixel signed-distance anti-aliasing.
// 2. Complex Domain Coloring f(z) with HSV phase mapping and magnitude contour rings.
// 3. ODE Vector Field & Streamline Flow dy/dx = f(x, y).
// Zero external libraries: pure native WebGL 1/2 with automatic CPU fallback.

export interface ViewBox {
	xMin: number;
	xMax: number;
	yMin: number;
	yMax: number;
}

export interface WebGL2DGraphRenderer {
	readonly isSupported: boolean;
	resize(width: number, height: number, dpr: number): void;
	renderImplicit(expr: string, view: ViewBox, colorHex: string): boolean;
	renderComplex(expr: string, view: ViewBox): boolean;
	renderVectorField(expr: string, view: ViewBox): boolean;
	clear(): void;
	destroy(): void;
}

function hexToRgb(hex: string): [number, number, number] {
	const h = hex.replace('#', '').slice(0, 6);
	const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h.padEnd(6, '0');
	const n = Number.parseInt(full, 16);
	if (!Number.isFinite(n)) return [0.14, 0.22, 1.0];
	return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** Translates standard infix formula into GLSL float expression for F(x, y) */
export function mathToGLSL(src: string): string {
	let s = src.trim().toLowerCase();
	// If it contains '=', turn LHS = RHS into LHS - (RHS)
	if (s.includes('=')) {
		const [lhs, rhs] = s.split('=');
		s = `(${lhs}) - (${rhs})`;
	}

	// Ensure integer numbers have decimals for float literals in GLSL
	s = s.replace(/(?<!\.)\b(\d+)\b(?!\.)/g, '$1.0');

	// Replace powers with robust non-NaN forms
	s = s.replace(/([a-zA-Z0-9_.]+|\([^\)]+\))\s*\^\s*2(?:\.0)?\b/g, '(($1)*($1))');
	s = s.replace(/([a-zA-Z0-9_.]+|\([^\)]+\))\s*\^\s*3(?:\.0)?\b/g, '(($1)*($1)*($1))');
	s = s.replace(/([a-zA-Z0-9_.]+|\([^\)]+\))\s*\^\s*4(?:\.0)?\b/g, '(($1)*($1)*($1)*($1))');
	s = s.replace(/([a-zA-Z0-9_.]+|\([^\)]+\))\s*\^\s*([0-9.]+)/g, 'pow(abs($1), $2)');

	// Map common math functions
	s = s.replace(/\bln\s*\(/g, 'log(');
	s = s.replace(/\bpi\b/g, '3.141592653589793');
	s = s.replace(/\be\b/g, '2.718281828459045');

	return s;
}

export function createWebGL2DGraphRenderer(canvas: HTMLCanvasElement): WebGL2DGraphRenderer | null {
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

		let isContextLost = false;
		canvas.addEventListener('webglcontextlost', (e) => {
			e.preventDefault();
			isContextLost = true;
		});

		const quadBuf = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

		let currentProg: WebGLProgram | null = null;
		let lastKey = '';

		const VS_QUAD = `
			attribute vec2 aPos;
			void main() {
				gl_Position = vec4(aPos, 0.0, 1.0);
			}
		`;

		function compileShader(type: number, src: string): WebGLShader | null {
			const s = gl!.createShader(type);
			if (!s) return null;
			gl!.shaderSource(s, src);
			gl!.compileShader(s);
			if (!gl!.getShaderParameter(s, gl!.COMPILE_STATUS)) {
				gl!.deleteShader(s);
				return null;
			}
			return s;
		}

		function createProgram(vsSrc: string, fsSrc: string): WebGLProgram | null {
			const vs = compileShader(gl!.VERTEX_SHADER, vsSrc);
			const fs = compileShader(gl!.FRAGMENT_SHADER, fsSrc);
			// Every failure path frees both shaders: if only one compiled,
			// the other is orphaned; and deleteProgram detaches without
			// freeing, so a link failure used to leak both. Each new formula
			// recompiles, so these leaks accumulate across a session until
			// the GL context OOMs.
			if (!vs || !fs) {
				if (vs) gl!.deleteShader(vs);
				if (fs) gl!.deleteShader(fs);
				return null;
			}
			const p = gl!.createProgram();
			if (!p) {
				gl!.deleteShader(vs);
				gl!.deleteShader(fs);
				return null;
			}
			gl!.attachShader(p, vs);
			gl!.attachShader(p, fs);
			gl!.linkProgram(p);
			// Once linked the program holds the compiled code; the shader
			// objects are safe to detach and delete on both outcomes.
			gl!.detachShader(p, vs);
			gl!.detachShader(p, fs);
			gl!.deleteShader(vs);
			gl!.deleteShader(fs);
			if (!gl!.getProgramParameter(p, gl!.LINK_STATUS)) {
				gl!.deleteProgram(p);
				return null;
			}
			return p;
		}

		function resize(width: number, height: number, dpr: number): void {
			if (isContextLost) return;
			canvas.width = Math.round(width * dpr);
			canvas.height = Math.round(height * dpr);
			gl!.viewport(0, 0, canvas.width, canvas.height);
		}

		function clear(): void {
			if (isContextLost) return;
			gl!.clearColor(0, 0, 0, 0);
			gl!.clear(gl!.COLOR_BUFFER_BIT);
		}

		// 1. Implicit Curve Renderer
		function renderImplicit(expr: string, view: ViewBox, colorHex: string): boolean {
			if (isContextLost) return false;
			const glslExpr = mathToGLSL(expr);
			const key = `implicit:${glslExpr}`;

			if (key !== lastKey || !currentProg) {
				const fs = `
					precision highp float;
					uniform vec2 uRes;
					uniform vec4 uBounds; // xMin, yMin, xMax, yMax
					uniform vec3 uColor;

					float evaluateF(float x, float y) {
						return ${glslExpr};
					}

					void main() {
						vec2 uv = gl_FragCoord.xy / uRes;
						float x = mix(uBounds.x, uBounds.z, uv.x);
						float y = mix(uBounds.y, uBounds.w, uv.y);

						float f = evaluateF(x, y);

						// Finite difference gradient for signed distance approximation
						vec2 eps = vec2((uBounds.z - uBounds.x) / uRes.x, (uBounds.w - uBounds.y) / uRes.y);
						float df_dx = (evaluateF(x + eps.x, y) - evaluateF(x - eps.x, y)) / (2.0 * eps.x);
						float df_dy = (evaluateF(x, y + eps.y) - evaluateF(x, y - eps.y)) / (2.0 * eps.y);

						float gradLen = length(vec2(df_dx, df_dy));
						if (gradLen < 1e-6) gradLen = 1e-6;

						// Screen pixel distance to curve F(x, y) = 0
						float dist = abs(f) / gradLen;
						float pixelDist = dist / eps.x;

						// Sub-pixel anti-aliased line (width ~ 2.0px)
						float alpha = smoothstep(1.8, 0.2, pixelDist);
						if (alpha <= 0.001) discard;

						gl_FragColor = vec4(uColor, alpha * 0.95);
					}
				`;

				const p = createProgram(VS_QUAD, fs);
				if (!p) return false;
				if (currentProg) gl!.deleteProgram(currentProg);
				currentProg = p;
				lastKey = key;
			}

			gl!.useProgram(currentProg);
			gl!.enable(gl!.BLEND);
			gl!.blendFunc(gl!.SRC_ALPHA, gl!.ONE_MINUS_SRC_ALPHA);

			const pLoc = gl!.getAttribLocation(currentProg, 'aPos');
			gl!.bindBuffer(gl!.ARRAY_BUFFER, quadBuf);
			gl!.enableVertexAttribArray(pLoc);
			gl!.vertexAttribPointer(pLoc, 2, gl!.FLOAT, false, 0, 0);

			gl!.uniform2f(gl!.getUniformLocation(currentProg, 'uRes'), canvas.width, canvas.height);
			gl!.uniform4f(gl!.getUniformLocation(currentProg, 'uBounds'), view.xMin, view.yMin, view.xMax, view.yMax);
			const [r, g, b] = hexToRgb(colorHex);
			gl!.uniform3f(gl!.getUniformLocation(currentProg, 'uColor'), r, g, b);

			gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4);
			gl!.disableVertexAttribArray(pLoc);
			return true;
		}

		// 2. Complex Domain Coloring Renderer
		function renderComplex(expr: string, view: ViewBox): boolean {
			if (isContextLost) return false;
			let s = expr.trim().toLowerCase();
			s = s.replace(/\bln\s*\(/g, 'c_log(');
			s = s.replace(/\bsin\s*\(/g, 'c_sin(');
			s = s.replace(/\bcos\s*\(/g, 'c_cos(');
			s = s.replace(/\bexp\s*\(/g, 'c_exp(');

			s = s.replace(/\bz\s*\^\s*2\b/g, 'c_pow2(z)');
			s = s.replace(/\bz\s*\^\s*3\b/g, 'c_pow3(z)');
			s = s.replace(/\bz\s*\^\s*4\b/g, 'c_pow4(z)');
			s = s.replace(/\bz\s*\^\s*5\b/g, 'c_pow5(z)');
			s = s.replace(/(?<!\.)\b(\d+)\b(?!\.)/g, 'vec2($1.0, 0.0)');

			const key = `complex:${s}`;

			if (key !== lastKey || !currentProg) {
				const fs = `
					precision highp float;
					uniform vec2 uRes;
					uniform vec4 uBounds; // xMin, yMin, xMax, yMax

					vec2 c_add(vec2 a, vec2 b) { return a + b; }
					vec2 c_sub(vec2 a, vec2 b) { return a - b; }
					vec2 c_mul(vec2 a, vec2 b) { return vec2(a.x*b.x - a.y*b.y, a.x*b.y + a.y*b.x); }
					vec2 c_div(vec2 a, vec2 b) {
						float d = dot(b, b);
						if (d < 1e-12) return vec2(1e6, 1e6);
						return vec2(dot(a, b), a.y*b.x - a.x*b.y) / d;
					}
					vec2 c_pow2(vec2 z) { return vec2(z.x*z.x - z.y*z.y, 2.0*z.x*z.y); }
					vec2 c_pow3(vec2 z) { return c_mul(z, c_pow2(z)); }
					vec2 c_pow4(vec2 z) { return c_pow2(c_pow2(z)); }
					vec2 c_pow5(vec2 z) { return c_mul(z, c_pow4(z)); }
					vec2 c_exp(vec2 z) { return exp(z.x) * vec2(cos(z.y), sin(z.y)); }
					vec2 c_sin(vec2 z) {
						float e_y = exp(z.y);
						float e_my = exp(-z.y);
						float cosh_y = (e_y + e_my) * 0.5;
						float sinh_y = (e_y - e_my) * 0.5;
						return vec2(sin(z.x) * cosh_y, cos(z.x) * sinh_y);
					}
					vec2 c_cos(vec2 z) {
						float e_y = exp(z.y);
						float e_my = exp(-z.y);
						float cosh_y = (e_y + e_my) * 0.5;
						float sinh_y = (e_y - e_my) * 0.5;
						return vec2(cos(z.x) * cosh_y, -sin(z.x) * sinh_y);
					}
					vec2 c_log(vec2 z) { return vec2(log(length(z) + 1e-12), atan(z.y, z.x)); }

					vec3 hsv2rgb(vec3 c) {
						vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
						vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
						return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
					}

					vec2 evaluateComplex(vec2 z) {
						return ${s};
					}

					void main() {
						vec2 uv = gl_FragCoord.xy / uRes;
						vec2 z = vec2(
							mix(uBounds.x, uBounds.z, uv.x),
							mix(uBounds.y, uBounds.w, uv.y)
						);

						vec2 w = evaluateComplex(z);
						float phase = atan(w.y, w.x);
						float hue = fract((phase + 3.1415926535) / 6.283185307);

						float mag = length(w);
						float logMag = log2(mag + 1e-6);
						float contour = fract(logMag);
						float rings = 0.85 + 0.15 * sin(contour * 6.2831853);

						vec3 rgb = hsv2rgb(vec3(hue, 0.85, rings));
						gl_FragColor = vec4(rgb, 0.90);
					}
				`;

				const p = createProgram(VS_QUAD, fs);
				if (!p) return false;
				if (currentProg) gl!.deleteProgram(currentProg);
				currentProg = p;
				lastKey = key;
			}

			gl!.useProgram(currentProg);
			gl!.enable(gl!.BLEND);
			gl!.blendFunc(gl!.SRC_ALPHA, gl!.ONE_MINUS_SRC_ALPHA);

			const pLoc = gl!.getAttribLocation(currentProg, 'aPos');
			gl!.bindBuffer(gl!.ARRAY_BUFFER, quadBuf);
			gl!.enableVertexAttribArray(pLoc);
			gl!.vertexAttribPointer(pLoc, 2, gl!.FLOAT, false, 0, 0);

			gl!.uniform2f(gl!.getUniformLocation(currentProg, 'uRes'), canvas.width, canvas.height);
			gl!.uniform4f(gl!.getUniformLocation(currentProg, 'uBounds'), view.xMin, view.yMin, view.xMax, view.yMax);

			gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4);
			gl!.disableVertexAttribArray(pLoc);
			return true;
		}

		// 3. Vector Field & Streamline Flow Renderer (dy/dx = f(x, y))
		function renderVectorField(expr: string, view: ViewBox): boolean {
			if (isContextLost) return false;
			const glslExpr = mathToGLSL(expr);
			const key = `vector:${glslExpr}`;

			if (key !== lastKey || !currentProg) {
				const fs = `
					precision highp float;
					uniform vec2 uRes;
					uniform vec4 uBounds; // xMin, yMin, xMax, yMax

					float evaluateSlope(float x, float y) {
						return ${glslExpr};
					}

					vec3 hsv2rgb(vec3 c) {
						vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
						vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
						return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
					}

					void main() {
						vec2 uv = gl_FragCoord.xy / uRes;
						float x = mix(uBounds.x, uBounds.z, uv.x);
						float y = mix(uBounds.y, uBounds.w, uv.y);

						// Cell grid for direction tick lines (32 x 20 grid)
						vec2 gridCount = vec2(32.0, 20.0);
						vec2 cell = fract(uv * gridCount);
						vec2 cellCenter = vec2(0.5, 0.5);

						// Sample center of current cell
						vec2 cellUV = (floor(uv * gridCount) + 0.5) / gridCount;
						float cx = mix(uBounds.x, uBounds.z, cellUV.x);
						float cy = mix(uBounds.y, uBounds.w, cellUV.y);

						float slope = evaluateSlope(cx, cy);
						vec2 dir = normalize(vec2(1.0, clamp(slope, -50.0, 50.0)));

						// Signed distance from cell pixel to line segment through center along dir
						vec2 delta = cell - cellCenter;
						float proj = dot(delta, dir);
						vec2 perp = delta - proj * dir;
						float dist = length(perp);

						// Arrow / segment length constraint
						float segLen = 0.38;
						float alongAlpha = step(abs(proj), segLen);
						float lineAlpha = smoothstep(0.08, 0.02, dist) * alongAlpha;

						if (lineAlpha <= 0.01) discard;

						float angle = atan(dir.y, dir.x);
						float hue = fract((angle + 3.14159265) / 6.2831853);
						vec3 color = hsv2rgb(vec3(hue, 0.85, 0.95));

						gl_FragColor = vec4(color, lineAlpha * 0.90);
					}
				`;

				const p = createProgram(VS_QUAD, fs);
				if (!p) return false;
				if (currentProg) gl!.deleteProgram(currentProg);
				currentProg = p;
				lastKey = key;
			}

			gl!.useProgram(currentProg);
			gl!.enable(gl!.BLEND);
			gl!.blendFunc(gl!.SRC_ALPHA, gl!.ONE_MINUS_SRC_ALPHA);

			const pLoc = gl!.getAttribLocation(currentProg, 'aPos');
			gl!.bindBuffer(gl!.ARRAY_BUFFER, quadBuf);
			gl!.enableVertexAttribArray(pLoc);
			gl!.vertexAttribPointer(pLoc, 2, gl!.FLOAT, false, 0, 0);

			gl!.uniform2f(gl!.getUniformLocation(currentProg, 'uRes'), canvas.width, canvas.height);
			gl!.uniform4f(gl!.getUniformLocation(currentProg, 'uBounds'), view.xMin, view.yMin, view.xMax, view.yMax);

			gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4);
			gl!.disableVertexAttribArray(pLoc);
			return true;
		}

		function destroy(): void {
			clear();
			if (currentProg) gl!.deleteProgram(currentProg);
			if (quadBuf) gl!.deleteBuffer(quadBuf);
		}

		return {
			isSupported: true,
			resize,
			renderImplicit,
			renderComplex,
			renderVectorField,
			clear,
			destroy,
		};
	} catch (e) {
		console.warn('[WebGL 2D] Init error, falling back to CPU:', e);
		return null;
	}
}

// --- CPU Fallback Software Rasterizers ----------------------------------------

/** CPU fallback for implicit curves F(x, y) = 0 via Marching Squares on a 120x80 grid */
export function renderImplicitCPU(
	ctx: CanvasRenderingContext2D,
	fn: (x: number, y: number) => number,
	view: ViewBox,
	colorHex: string,
	width: number,
	height: number,
): void {
	const nx = 120;
	const ny = 80;
	const dx = (view.xMax - view.xMin) / nx;
	const dy = (view.yMax - view.yMin) / ny;

	const grid = new Float32Array((nx + 1) * (ny + 1));
	for (let j = 0; j <= ny; j++) {
		const y = view.yMin + j * dy;
		for (let i = 0; i <= nx; i++) {
			const x = view.xMin + i * dx;
			// A thrown sample (an engine edge case at this (x,y)) must not
			// abort the whole curve — NaN compares false in the sign tests
			// below, so marching squares skips the cell. Mirrors the guard
			// renderVectorFieldCPU puts around the same fn(x,y) call.
			let v: number;
			try {
				v = fn(x, y);
			} catch {
				v = NaN;
			}
			grid[j * (nx + 1) + i] = v;
		}
	}

	const toPx = (x: number) => ((x - view.xMin) / (view.xMax - view.xMin)) * width;
	const toPy = (y: number) => height - ((y - view.yMin) / (view.yMax - view.yMin)) * height;

	ctx.save();
	ctx.strokeStyle = colorHex;
	ctx.lineWidth = 2;
	ctx.beginPath();

	for (let j = 0; j < ny; j++) {
		const y0 = view.yMin + j * dy;
		const y1 = y0 + dy;
		for (let i = 0; i < nx; i++) {
			const x0 = view.xMin + i * dx;
			const x1 = x0 + dx;

			const v0 = grid[j * (nx + 1) + i]!;
			const v1 = grid[j * (nx + 1) + (i + 1)]!;
			const v2 = grid[(j + 1) * (nx + 1) + (i + 1)]!;
			const v3 = grid[(j + 1) * (nx + 1) + i]!;

			const b0 = v0 > 0 ? 1 : 0;
			const b1 = v1 > 0 ? 2 : 0;
			const b2 = v2 > 0 ? 4 : 0;
			const b3 = v3 > 0 ? 8 : 0;
			const mask = b0 | b1 | b2 | b3;
			if (mask === 0 || mask === 15) continue;

			// Edge interpolations
			const bottom = { x: x0 + (dx * (0 - v0)) / (v1 - v0), y: y0 };
			const right = { x: x1, y: y0 + (dy * (0 - v1)) / (v2 - v1) };
			const top = { x: x0 + (dx * (0 - v3)) / (v2 - v3), y: y1 };
			const left = { x: x0, y: y0 + (dy * (0 - v0)) / (v3 - v0) };

			const drawSegment = (pA: { x: number; y: number }, pB: { x: number; y: number }) => {
				ctx.moveTo(toPx(pA.x), toPy(pA.y));
				ctx.lineTo(toPx(pB.x), toPy(pB.y));
			};

			if (mask === 1 || mask === 14) drawSegment(left, bottom);
			else if (mask === 2 || mask === 13) drawSegment(bottom, right);
			else if (mask === 3 || mask === 12) drawSegment(left, right);
			else if (mask === 4 || mask === 11) drawSegment(top, right);
			else if (mask === 5) {
				drawSegment(left, top);
				drawSegment(bottom, right);
			} else if (mask === 6 || mask === 9) drawSegment(bottom, top);
			else if (mask === 7 || mask === 8) drawSegment(left, top);
			else if (mask === 10) {
				drawSegment(left, bottom);
				drawSegment(top, right);
			}
		}
	}
	ctx.stroke();
	ctx.restore();
}


/** Compiles the rewritten complex expression (the same infix string the GLSL
 *  fragment shader compiles — c_* functions, vec2(n,0) literals, z^2..5 →
 *  c_powN) into a per-pixel evaluator. Complex mode sets row.fn = null because
 *  the calculator engine compiles real-valued functions only, so the CPU
 *  fallback must carry its own complex arithmetic instead of reusing row.fn.
 *  Returns null on any token the GLSL path would also reject, so the two stay
 *  consistent (the CPU is, if anything, slightly more lenient: ^ generalises
 *  to c_pow and bare decimals / pi / e are accepted even though the shader
 *  rejects them — a strictly-more-capable fallback never causes drift). */
function buildComplexEvaluator(src: string): ((zx: number, zy: number) => [number, number]) | null {
	type Cx = [number, number];
	const mul = (a: Cx, b: Cx): Cx => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
	const div = (a: Cx, b: Cx): Cx => {
		const d = b[0] * b[0] + b[1] * b[1];
		if (d < 1e-12) return [1e6, 1e6];
		return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
	};
	const pow2 = (z: Cx): Cx => [z[0] * z[0] - z[1] * z[1], 2 * z[0] * z[1]];
	const pow3 = (z: Cx): Cx => mul(z, pow2(z));
	const pow4 = (z: Cx): Cx => pow2(pow2(z));
	const pow5 = (z: Cx): Cx => mul(z, pow4(z));
	const cexp = (z: Cx): Cx => { const e = Math.exp(z[0]); return [e * Math.cos(z[1]), e * Math.sin(z[1])]; };
	const csin = (z: Cx): Cx => {
		const ey = Math.exp(z[1]), emy = Math.exp(-z[1]);
		const ch = (ey + emy) * 0.5, sh = (ey - emy) * 0.5;
		return [Math.sin(z[0]) * ch, Math.cos(z[0]) * sh];
	};
	const ccos = (z: Cx): Cx => {
		const ey = Math.exp(z[1]), emy = Math.exp(-z[1]);
		const ch = (ey + emy) * 0.5, sh = (ey - emy) * 0.5;
		return [Math.cos(z[0]) * ch, -Math.sin(z[0]) * sh];
	};
	const clog = (z: Cx): Cx => [Math.log(Math.hypot(z[0], z[1]) + 1e-12), Math.atan2(z[1], z[0])];
	const cpow = (a: Cx, b: Cx): Cx => cexp(mul(b, clog(a)));
	const fns: Record<string, (z: Cx) => Cx> = {
		c_pow2: pow2, c_pow3: pow3, c_pow4: pow4, c_pow5: pow5,
		c_exp: cexp, c_sin: csin, c_cos: ccos, c_log: clog,
	};

	// --- tokenizer -------------------------------------------------------
	const toks: string[] = [];
	let i = 0;
	while (i < src.length) {
		const c = src[i];
		if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }
		if ((c >= '0' && c <= '9') || c === '.') {
			let j = i + 1;
			while (j < src.length && ((src[j] >= '0' && src[j] <= '9') || src[j] === '.')) j++;
			toks.push(src.slice(i, j));
			i = j;
			continue;
		}
		if ((c >= 'a' && c <= 'z') || c === '_') {
			let j = i + 1;
			while (j < src.length && ((src[j] >= 'a' && src[j] <= 'z') || (src[j] >= '0' && src[j] <= '9') || src[j] === '_')) j++;
			toks.push(src.slice(i, j));
			i = j;
			continue;
		}
		if (c === '+' || c === '-' || c === '*' || c === '/' || c === '^' || c === '(' || c === ')' || c === ',') {
			toks.push(c);
			i++;
			continue;
		}
		return null; // a character the shader would also reject
	}

	type CEval = (zx: number, zy: number) => Cx;
	let pos = 0;
	const peek = (): string => toks[pos];
	const eat = (): string => toks[pos++];
	const expect = (t: string): boolean => { if (toks[pos] !== t) return false; pos++; return true; };

	const parsePrimary = (): CEval | null => {
		const t = peek();
		if (t === undefined) return null;
		if (t[0] >= '0' && t[0] <= '9') {
			eat();
			const n = Number(t);
			const lit: Cx = [Number.isFinite(n) ? n : 0, 0];
			return () => lit;
		}
		if (t[0] >= 'a' && t[0] <= 'z') {
			eat();
			if (t === 'z') return (zx, zy) => [zx, zy];
			if (t === 'pi') { const c: Cx = [Math.PI, 0]; return () => c; }
			if (t === 'e') { const c: Cx = [Math.E, 0]; return () => c; }
			if (t === 'vec2') {
				if (!expect('(')) return null;
				const a = parseExpr();
				if (!a || !expect(',')) return null;
				const b = parseExpr();
				if (!b || !expect(')')) return null;
				return (zx, zy) => [a(zx, zy)[0], b(zx, zy)[0]];
			}
			if (t.startsWith('c_')) {
				const fn = fns[t];
				if (!fn) return null;
				if (!expect('(')) return null;
				const a = parseExpr();
				if (!a || !expect(')')) return null;
				return (zx, zy) => fn(a(zx, zy));
			}
			return null; // unknown identifier
		}
		if (t === '(') {
			eat();
			const inner = parseExpr();
			if (!inner || !expect(')')) return null;
			return inner;
		}
		return null;
	};

	const parseFactor = (): CEval | null => {
		if (peek() === '-') { eat(); const a = parseFactor(); return a ? (zx, zy) => { const v = a(zx, zy); return [-v[0], -v[1]] as Cx; } : null; }
		if (peek() === '+') { eat(); return parseFactor(); }
		const base = parsePrimary();
		if (!base) return null;
		if (peek() === '^') {
			eat();
			const exp = parseFactor(); // right-associative
			if (!exp) return null;
			return (zx, zy) => cpow(base(zx, zy), exp(zx, zy));
		}
		return base;
	};

	const parseTerm = (): CEval | null => {
		let left = parseFactor();
		if (!left) return null;
		for (;;) {
			const op = peek();
			if (op !== '*' && op !== '/') break;
			eat();
			const right = parseFactor();
			if (!right) return null;
			const L: CEval = left;
			left = op === '*'
				? (zx, zy) => mul(L(zx, zy), right(zx, zy))
				: (zx, zy) => div(L(zx, zy), right(zx, zy));
		}
		return left;
	};

	const parseExpr = (): CEval | null => {
		let left = parseTerm();
		if (!left) return null;
		for (;;) {
			const op = peek();
			if (op !== '+' && op !== '-') break;
			eat();
			const right = parseTerm();
			if (!right) return null;
			const L: CEval = left;
			left = op === '+'
				? (zx, zy) => { const a = L(zx, zy), b = right(zx, zy); return [a[0] + b[0], a[1] + b[1]] as Cx; }
				: (zx, zy) => { const a = L(zx, zy), b = right(zx, zy); return [a[0] - b[0], a[1] - b[1]] as Cx; };
		}
		return left;
	};

	const out = parseExpr();
	if (!out || pos !== toks.length) return null;
	return out;
}

// Reused across renders so a non-WebGL machine panning complex mode does not
// allocate a fresh canvas every frame.
let complexScratch: HTMLCanvasElement | null = null;

/** CPU fallback for complex domain coloring f(z). Reproduces the WebGL
 *  fragment shader's picture (HSV phase + log2-magnitude contour rings) on a
 *  2D canvas, so a context loss or a non-WebGL machine shows the same surface
 *  instead of a silent blank canvas. */
export function renderComplexCPU(
	ctx: CanvasRenderingContext2D,
	expr: string,
	view: ViewBox,
	width: number,
	height: number,
): void {
	// identical textual rewrite to the GLSL path — keep the two in lockstep
	let s = expr.trim().toLowerCase();
	s = s.replace(/\bln\s*\(/g, 'c_log(');
	s = s.replace(/\bsin\s*\(/g, 'c_sin(');
	s = s.replace(/\bcos\s*\(/g, 'c_cos(');
	s = s.replace(/\bexp\s*\(/g, 'c_exp(');
	s = s.replace(/\bz\s*\^\s*2\b/g, 'c_pow2(z)');
	s = s.replace(/\bz\s*\^\s*3\b/g, 'c_pow3(z)');
	s = s.replace(/\bz\s*\^\s*4\b/g, 'c_pow4(z)');
	s = s.replace(/\bz\s*\^\s*5\b/g, 'c_pow5(z)');
	s = s.replace(/(?<!\.)\b(\d+)\b(?!\.)/g, 'vec2($1.0, 0.0)');

	const evaluate = buildComplexEvaluator(s);
	if (!evaluate) return; // unparseable — leave the cleared canvas (matches GLSL)

	const devW = ctx.canvas.width || Math.max(2, Math.round(width));
	const devH = ctx.canvas.height || Math.max(2, Math.round(height));
	const cap = 1000; // bound a big-screen redraw so pan/zoom stays responsive
	const scale = Math.min(1, cap / Math.max(devW, devH));
	const rw = Math.max(2, Math.round(devW * scale));
	const rh = Math.max(2, Math.round(devH * scale));

	const img = ctx.createImageData(rw, rh);
	const data = img.data;
	const TWO_PI = 6.283185307179586;
	const PI = Math.PI;
	const xRange = view.xMax - view.xMin;
	const yRange = view.yMax - view.yMin;

	const hsv2rgb = (h: number, s: number, v: number): [number, number, number] => {
		const fr = (x: number): number => x - Math.floor(x);
		const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);
		// Sam Hocevar's fast path, identical to the shader's hsv2rgb.
		const px = Math.abs(fr(h) * 6 - 3);
		const py = Math.abs(fr(h + 2 / 3) * 6 - 3);
		const pz = Math.abs(fr(h + 1 / 3) * 6 - 3);
		const ch = (p: number): number => 1 - s * (1 - clamp01(p - 1));
		return [v * ch(px), v * ch(py), v * ch(pz)];
	};

	for (let r = 0; r < rh; r++) {
		// ImageData row 0 is the top; the shader's uv.y is bottom-up, so the
		// graph's y axis (up = +) maps row rh-1 → yMax.
		const uvY = (rh - r - 0.5) / rh;
		const zy = view.yMin + uvY * yRange;
		let off = r * rw * 4;
		for (let c = 0; c < rw; c++) {
			const uvX = (c + 0.5) / rw;
			const zx = view.xMin + uvX * xRange;
			const w = evaluate(zx, zy);
			let R = 0, G = 0, B = 0;
			if (Number.isFinite(w[0]) && Number.isFinite(w[1])) {
				const phase = Math.atan2(w[1], w[0]);
				let hue = (phase + PI) / TWO_PI;
				hue -= Math.floor(hue);
				const mag = Math.hypot(w[0], w[1]);
				let logMag = Math.log2(mag + 1e-6);
				logMag -= Math.floor(logMag);
				const rings = 0.85 + 0.15 * Math.sin(logMag * TWO_PI);
				const rgb = hsv2rgb(hue, 0.85, rings);
				R = rgb[0]; G = rgb[1]; B = rgb[2];
			}
			data[off] = R * 255;
			data[off + 1] = G * 255;
			data[off + 2] = B * 255;
			data[off + 3] = 229; // alpha 0.90 → 229
			off += 4;
		}
	}

	// putImageData ignores the ctx transform, so blit through an offscreen
	// canvas with drawImage (which the dpr transform scales to fill the view).
	if (!complexScratch) complexScratch = document.createElement('canvas');
	if (complexScratch.width !== rw || complexScratch.height !== rh) {
		complexScratch.width = rw;
		complexScratch.height = rh;
	}
	const octx = complexScratch.getContext('2d');
	if (!octx) return;
	octx.putImageData(img, 0, 0);
	ctx.drawImage(complexScratch, 0, 0, rw, rh, 0, 0, width, height);
}

/** CPU fallback for Vector Field dy/dx = f(x, y) */
export function renderVectorFieldCPU(
	ctx: CanvasRenderingContext2D,
	fn: (x: number, y: number) => number,
	view: ViewBox,
	width: number,
	height: number,
): void {
	const nx = 24;
	const ny = 16;
	const dx = (view.xMax - view.xMin) / nx;
	const dy = (view.yMax - view.yMin) / ny;

	const toPx = (x: number) => ((x - view.xMin) / (view.xMax - view.xMin)) * width;
	const toPy = (y: number) => height - ((y - view.yMin) / (view.yMax - view.yMin)) * height;

	ctx.save();
	ctx.strokeStyle = '#2337ff';
	ctx.lineWidth = 1.5;

	for (let j = 0; j <= ny; j++) {
		const y = view.yMin + (j + 0.5) * dy;
		for (let i = 0; i <= nx; i++) {
			const x = view.xMin + (i + 0.5) * dx;
			let slope = 0;
			try {
				slope = fn(x, y);
			} catch {
				continue;
			}
			if (!Number.isFinite(slope)) continue;
			const angle = Math.atan(slope);
			const segPx = 12;
			const cx = toPx(x);
			const cy = toPy(y);
			const vx = Math.cos(angle) * segPx;
			const vy = -Math.sin(angle) * segPx;

			ctx.beginPath();
			ctx.moveTo(cx - vx, cy - vy);
			ctx.lineTo(cx + vx, cy + vy);
			ctx.stroke();
		}
	}
	ctx.restore();
}
