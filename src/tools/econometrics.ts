// Numeric core for the econometrics tools (linear models, GLM/discrete
// choice, time series, robust diagnostics). None of this touches the DOM —
// the tool configs in ./calculators.ts stay thin: parse a textarea, call one
// of the functions below, format rows. All the algebra lives here so a slip
// in, say, the sandwich covariance shows up in every tool that needs it, and
// fixing it fixes them all.
//
// Everything is deterministic — no Math.random, no Date — so the e2e suite
// can pin a fitted coefficient to a decimal place. Optimisers (Nelder–Mead)
// always start from a fixed point, and every special-function routine is a
// closed-form series/continued fraction with a hard iteration cap.

// ---------------------------------------------------------------------------
// 1. Linear algebra
// ---------------------------------------------------------------------------

export type Vec = number[];
export type Mat = number[][];

export function zeros(r: number, c: number): Mat {
	return Array.from({ length: r }, () => new Array<number>(c).fill(0));
}

export function eye(n: number): Mat {
	const m = zeros(n, n);
	for (let i = 0; i < n; i++) m[i][i] = 1;
	return m;
}

export function matTrans(a: Mat): Mat {
	const r = a.length;
	const c = a[0].length;
	const out = zeros(c, r);
	for (let i = 0; i < r; i++) for (let j = 0; j < c; j++) out[j][i] = a[i][j];
	return out;
}

export function matVec(a: Mat, v: Vec): Vec {
	const out: Vec = [];
	for (let i = 0; i < a.length; i++) {
		let s = 0;
		const row = a[i];
		for (let j = 0; j < v.length; j++) s += row[j] * v[j];
		out.push(s);
	}
	return out;
}

export function matMul(a: Mat, b: Mat): Mat {
	const n = a.length;
	const m = b[0].length;
	const kk = b.length;
	const out = zeros(n, m);
	for (let i = 0; i < n; i++) {
		for (let t = 0; t < kk; t++) {
			const f = a[i][t];
			if (f === 0) continue;
			const ri = out[i];
			const bt = b[t];
			for (let j = 0; j < m; j++) ri[j] += f * bt[j];
		}
	}
	return out;
}

/** A'A accumulated entry-by-entry into a symmetric matrix. Symmetrising by
 *  construction (instead of transposing then multiplying) kills the ~1e-16
 *  asymmetry round-off leaves behind, which a later solve could pivot on. */
export function crossprod(a: Mat): Mat {
	const r = a.length;
	const c = a[0].length;
	const out = zeros(c, c);
	for (let i = 0; i < r; i++) {
		const row = a[i];
		for (let j = 0; j < c; j++) {
			const v = row[j];
			if (v === 0) continue;
			for (let k = j; k < c; k++) out[j][k] += v * row[k];
		}
	}
	for (let j = 0; j < c; j++) for (let k = 0; k < j; k++) out[j][k] = out[k][j];
	return out;
}

/** LU decomposition with partial pivoting. The singularity test is RELATIVE —
 *  the pivot candidate against the largest magnitude in the matrix — so a
 *  design measured in billions (or billionths) fails for the right reason
 *  instead of every large-scale system reading as singular. */
export function luDecompose(a: Mat): { lu: Mat; piv: number[]; singular: boolean; det: number } {
	const n = a.length;
	const lu = a.map((row) => [...row]);
	const piv: number[] = [];
	let maxAbs = 0;
	for (const row of lu) for (const v of row) { const av = Math.abs(v); if (av > maxAbs) maxAbs = av; }
	const tol = 1e-12 * Math.max(maxAbs, 1e-300);
	let det = 1;
	for (let k = 0; k < n; k++) {
		let p = k;
		let best = Math.abs(lu[k][k]);
		for (let i = k + 1; i < n; i++) { const v = Math.abs(lu[i][k]); if (v > best) { best = v; p = i; } }
		piv.push(p);
		if (best <= tol) return { lu, piv, singular: true, det: 0 };
		if (p !== k) { const t = lu[p]; lu[p] = lu[k]; lu[k] = t; det = -det; }
		det *= lu[k][k];
		for (let i = k + 1; i < n; i++) {
			const f = (lu[i][k] /= lu[k][k]);
			if (f === 0) continue;
			const ri = lu[i];
			const rk = lu[k];
			for (let j = k + 1; j < n; j++) ri[j] -= f * rk[j];
		}
	}
	return { lu, piv, singular: false, det };
}

function luApply(d: { lu: Mat; piv: number[] }, b: Vec): Vec {
	const n = d.lu.length;
	const x = [...b];
	// The stored L belongs to the fully row-permuted matrix (a swap at step k
	// carries the already-computed multipliers along), so the permutation
	// must be applied to b FIRST, in the order the swaps happened — then a
	// plain forward substitution. Interleaving swap and elimination would
	// combine pre-swap b entries with post-swap multipliers.
	for (let k = 0; k < n; k++) {
		const p = d.piv[k];
		if (p !== k) { const t = x[p]; x[p] = x[k]; x[k] = t; }
	}
	for (let k = 0; k < n; k++) {
		for (let i = k + 1; i < n; i++) x[i] -= d.lu[i][k] * x[k];
	}
	for (let i = n - 1; i >= 0; i--) {
		for (let j = i + 1; j < n; j++) x[i] -= d.lu[i][j] * x[j];
		x[i] /= d.lu[i][i];
	}
	return x;
}

/** Solve A·x = b; null when A is (near-)singular — collinear regressors. */
export function solve(a: Mat, b: Vec): Vec | null {
	const d = luDecompose(a);
	return d.singular ? null : luApply(d, b);
}

/** Solve A·B = C for B. */
export function solveMany(a: Mat, b: Mat): Mat | null {
	const d = luDecompose(a);
	if (d.singular) return null;
	const cols = b[0].length;
	const stacked: Mat = [];
	for (let j = 0; j < cols; j++) stacked.push(luApply(d, b.map((row) => row[j])));
	return matTrans(stacked);
}

export function solveInv(a: Mat): Mat | null {
	return solveMany(a, eye(a.length));
}

export function detOf(a: Mat): number {
	return luDecompose(a).det;
}

/** Lower-triangular Cholesky factor; null when A is not positive definite. */
export function cholesky(a: Mat): Mat | null {
	const n = a.length;
	const L = zeros(n, n);
	for (let i = 0; i < n; i++) {
		for (let j = 0; j <= i; j++) {
			let s = a[i][j];
			for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
			if (i === j) {
				if (s <= 0) return null;
				L[i][i] = Math.sqrt(s);
			} else L[i][j] = s / L[j][j];
		}
	}
	return L;
}

/** Symmetric eigen-decomposition by cyclic Jacobi rotations. Eigenvalues are
 *  returned in `values` (unsorted, diagonal of the reduced matrix) with the
 *  matching orthonormal columns in `vectors`. */
export function jacobiEigen(aIn: Mat): { values: Vec; vectors: Mat } {
	const n = aIn.length;
	const a = aIn.map((row) => [...row]);
	const V = eye(n);
	let scale = 0;
	for (const row of aIn) for (const v of row) scale = Math.max(scale, Math.abs(v));
	if (scale === 0) return { values: new Array<number>(n).fill(0), vectors: V };
	for (let sweep = 0; sweep < 100; sweep++) {
		let off = 0;
		for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += a[i][j] * a[i][j];
		if (off < 1e-30 * scale * scale) break;
		for (let i = 0; i < n; i++) {
			for (let j = i + 1; j < n; j++) {
				if (Math.abs(a[i][j]) < 1e-300) continue;
				const theta = (a[j][j] - a[i][i]) / (2 * a[i][j]);
				const t = (theta >= 0 ? 1 : -1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
				const c = 1 / Math.sqrt(t * t + 1);
				const s = t * c;
				for (let k = 0; k < n; k++) {
					const aik = a[i][k];
					const ajk = a[j][k];
					a[i][k] = c * aik - s * ajk;
					a[j][k] = s * aik + c * ajk;
				}
				for (let k = 0; k < n; k++) {
					const aki = a[k][i];
					const akj = a[k][j];
					a[k][i] = c * aki - s * akj;
					a[k][j] = s * aki + c * akj;
				}
				for (let k = 0; k < n; k++) {
					const vki = V[k][i];
					const vkj = V[k][j];
					V[k][i] = c * vki - s * vkj;
					V[k][j] = s * vki + c * vkj;
				}
			}
		}
	}
	const values: Vec = [];
	for (let i = 0; i < n; i++) values.push(a[i][i]);
	return { values, vectors: V };
}

/** Polynomial multiplication (coefficient arrays, index = power). */
export function conv(a: number[], b: number[]): number[] {
	const out = new Array<number>(a.length + b.length - 1).fill(0);
	for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) out[i + j] += a[i] * b[j];
	return out;
}

// ---------------------------------------------------------------------------
// 2. Special functions
// ---------------------------------------------------------------------------

// ln Γ(z), Lanczos approximation (g=7) — same coefficients as the private
// lgamma in ./calculators.ts, kept here so the core is self-contained.
const LG_C = [
	0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
	-176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
	1.5056327351493116e-7,
];

export function lgamma(z: number): number {
	if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgamma(1 - z);
	z -= 1;
	let x = LG_C[0];
	for (let i = 1; i < 9; i++) x += LG_C[i] / (z + i);
	const t = z + 7.5;
	return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

export function lnBeta(a: number, b: number): number {
	return lgamma(a) + lgamma(b) - lgamma(a + b);
}

// erf/erfc: alternating power series for |x| ≤ 1, a backward-recurrence
// continued fraction beyond — exact to double precision at the seam, unlike
// the 1e-7 Abramowitz rational fits some calculators still ship.
function erfSeries(x: number): number {
	const x2 = x * x;
	let term = x;
	let sum = x;
	for (let n = 1; n < 60; n++) {
		term *= -x2 / n;
		const add = term / (2 * n + 1);
		sum += add;
		if (Math.abs(add) < 1e-18 * Math.abs(sum)) break;
	}
	return (2 / Math.sqrt(Math.PI)) * sum;
}

// erfc(x) = e^{−x²}/√π · 1/(x + ½/(x + 1/(x + 3/2/(x + …))))  for x ≥ 1
function erfcCf(x: number): number {
	let d = x;
	for (let k = 120; k >= 1; k--) d = x + k / 2 / d;
	return Math.exp(-x * x) / Math.sqrt(Math.PI) / d;
}

function erfc(x: number): number {
	if (x >= 1) return erfcCf(x);
	if (x <= -1) return 2 - erfcCf(-x);
	return 1 - erfSeries(x);
}

export function normCdf(z: number): number {
	return 0.5 * erfc(-z / Math.SQRT2);
}

export function normPdf(z: number): number {
	return Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
}

export const expit = (z: number): number => 1 / (1 + Math.exp(-z));

// Inverse normal CDF — Acklam's rational approximation, |error| < 1.15e-9.
export function normInv(p: number): number {
	if (p <= 0) return -Infinity;
	if (p >= 1) return Infinity;
	const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.383577518672690e2, -3.066479806614716e1, 2.506628277459239];
	const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
	const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
	const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
	const plow = 0.02425;
	let z: number;
	if (p < plow) {
		const q = Math.sqrt(-2 * Math.log(p));
		z = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
	} else if (p > 1 - plow) {
		const q = Math.sqrt(-2 * Math.log(1 - p));
		z = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
	} else {
		const q = p - 0.5;
		const r = q * q;
		z = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
	}
	// one Halley step polishes Acklam's ~1e-9 down to double precision
	const e = 0.5 * erfc(-z / Math.SQRT2) - p;
	const u = (e * Math.sqrt(2 * Math.PI)) * Math.exp(0.5 * z * z);
	return z - u / (1 + 0.5 * z * u);
}

/** Incomplete-beta continued fraction (DLMF 5.12) by modified Lentz:
 *  CF = 1/(1 + d₁/(1 + d₂/(1 + …))) with
 *  d_{2m+1} = −(a+m)(a+b+m)x/((a+2m)(a+2m+1)),  d_{2m} = m(b−m)x/((a+2m−1)(a+2m)).
 *  Converges to ~1e-14 over the whole (a, b, x) range the t/F/CF
 *  distributions need — verified against scipy.special.betainc. */
function betacf(a: number, b: number, x: number): number {
	const d = (j: number): number => {
		if (j % 2 === 1) {
			const m = (j - 1) / 2;
			return -((a + m) * (a + b + m) * x) / ((a + 2 * m) * (a + 2 * m + 1));
		}
		const m = j / 2;
		return (m * (b - m) * x) / ((a + 2 * m - 1) * (a + 2 * m));
	};
	const TINY = 1e-300;
	let f = 1;
	let c = f;
	let dd = 0;
	for (let j = 1; j <= 500; j++) {
		const dj = d(j);
		dd = 1 + dj * dd;
		if (dd === 0) dd = TINY;
		dd = 1 / dd;
		c = 1 + dj / c;
		if (c === 0) c = TINY;
		const delta = c * dd;
		f *= delta;
		if (Math.abs(delta - 1) < 3e-16) break;
	}
	return 1 / f;
}

/** Regularized incomplete beta I_x(a, b). */
export function incBeta(a: number, b: number, x: number): number {
	if (x <= 0) return 0;
	if (x >= 1) return 1;
	const lnbt = -lnBeta(a, b) + a * Math.log(x) + b * Math.log(1 - x);
	const bt = Math.exp(lnbt);
	if (x < (a + 1) / (a + b + 2)) return bt * betacf(a, b, x) / a;
	return 1 - bt * betacf(b, a, 1 - x) / b;
}

export function incBetaUpper(a: number, b: number, x: number): number {
	return 1 - incBeta(a, b, x);
}

function gammpSeries(a: number, x: number): number {
	let sum = 1 / a;
	let del = sum;
	let ap = a;
	for (let n = 0; n < 500; n++) {
		ap++;
		del *= x / ap;
		sum += del;
		if (Math.abs(del) < Math.abs(sum) * 1e-16) break;
	}
	return sum * Math.exp(-x + a * Math.log(x) - lgamma(a));
}

function gamqFrac(a: number, x: number): number {
	const FPMIN = 1e-300;
	let b = x + 1 - a;
	let c = 1 / FPMIN;
	let d = 1 / b;
	let h = d;
	for (let i = 1; i <= 500; i++) {
		const an = -i * (i - a);
		b += 2;
		d = an * d + b;
		if (Math.abs(d) < FPMIN) d = FPMIN;
		c = b + an / c;
		if (Math.abs(c) < FPMIN) c = FPMIN;
		d = 1 / d;
		const del = d * c;
		h *= del;
		if (Math.abs(del - 1) < 3e-16) break;
	}
	return Math.exp(-x + a * Math.log(x) - lgamma(a)) * h;
}

/** Regularized upper incomplete gamma Q(a, x). */
export function gammaSurvival(a: number, x: number): number {
	if (x < 0 || a <= 0) return NaN;
	if (x === 0) return 1;
	if (x < a + 1) return 1 - gammpSeries(a, x);
	return gamqFrac(a, x);
}

export function chiSqSurvival(df: number, x: number): number {
	return gammaSurvival(df / 2, x / 2);
}

export function fSurvival(df1: number, df2: number, x: number): number {
	if (x <= 0 || df1 <= 0 || df2 <= 0) return 1;
	const z = df2 / (df2 + df1 * x);
	return incBeta(df2 / 2, df1 / 2, z);
}

/** One-sided upper tail P(T > t) for t ≥ 0:
 *  P(T > t) = ½·I_{df/(df+t²)}(df/2, 1/2). Callers wanting the two-sided
 *  p-value multiply by 2. */
export function tSurvival(df: number, t: number): number {
	if (df <= 0) return NaN;
	if (!Number.isFinite(t)) return t > 0 ? 0 : 1;
	return 0.5 * incBeta(df / 2, 0.5, df / (df + t * t));
}

/** Two-sided critical value at level alpha (e.g. 0.05), by bisection. */
export function tCritical(alpha: number, df: number): number {
	let lo = 0;
	let hi = 1e3;
	for (let i = 0; i < 200; i++) {
		const mid = 0.5 * (lo + hi);
		if (2 * tSurvival(df, mid) > alpha) lo = mid;
		else hi = mid;
	}
	return 0.5 * (lo + hi);
}

// ---------------------------------------------------------------------------
// 3. Pasting data: whitespace/comma/semicolon/pipe separated columns
// ---------------------------------------------------------------------------

export interface ParsedCols {
	/** columns[col][row] — last column is conventionally the response. */
	cols: number[][];
	names: string[];
	/** raw lines that could not be parsed into the common width. */
	bad: string[];
	rows: number;
}

export function parseColumns(text: string, minCols: number): ParsedCols {
	const bad: string[] = [];
	const parsed: { t: string; nums: number[] }[] = [];
	let header: string[] | null = null;
	for (const line of text.split('\n')) {
		const t = line.trim();
		if (!t) continue;
		const toks = t.split(/[\t,;|]+|\s+/).filter(Boolean);
		if (!header && toks.length >= minCols && !toks.every((s) => Number.isFinite(Number(s)))) {
			header = toks;
			continue;
		}
		const nums = toks.map(Number);
		if (toks.length >= minCols && nums.every(Number.isFinite)) parsed.push({ t, nums });
		else bad.push(t);
	}
	if (!parsed.length) return { cols: [], names: [], bad, rows: 0 };
	const width = Math.max(...parsed.map((r) => r.nums.length));
	const good: number[][] = [];
	for (const r of parsed) {
		if (r.nums.length === width) good.push(r.nums);
		else bad.push(r.t);
	}
	const cols: number[][] = Array.from({ length: width }, () => []);
	for (const r of good) for (let j = 0; j < width; j++) cols[j].push(r[j]);
	const defaults = Array.from({ length: width }, (_, i) => (i === width - 1 ? 'y' : `x${i + 1}`));
	return { cols, names: header && header.length === width ? header : defaults, bad, rows: good.length };
}

// ---------------------------------------------------------------------------
// 4. OLS / WLS / GLS — one weighted least squares core
// ---------------------------------------------------------------------------

export interface OlsModel {
	n: number;
	k: number;
	names: string[];
	x: Mat;
	y: Vec;
	beta: Vec;
	se: Vec;
	tstat: Vec;
	pval: Vec;
	ciLo: Vec;
	ciHi: Vec;
	tcrit: number;
	resid: Vec;
	fitted: Vec;
	h: Vec;
	stdResid: Vec;
	r2: number;
	adjR2: number;
	f: number;
	fP: number;
	sigma: number;
	sse: number;
	sst: number;
	bread: Mat;
	/** Design the estimator actually saw — OLS: x itself, WLS: √w-scaled
	 *  rows, GLS: V⁻¹·x. Sandwich covariances must be built on these. */
	wx: Mat;
	wresid: Vec;
}

export function vinvDiag(w: Vec): Mat {
	const n = w.length;
	const m = zeros(n, n);
	for (let i = 0; i < n; i++) m[i][i] = w[i];
	return m;
}

/** AR(1) precision (scale-free): tridiagonal, −ρ/(1−ρ²) off the diagonal,
 *  1/(1−ρ²) at the corners and (1+ρ²)/(1−ρ²) inside. The scale factor that
 *  appears in the full V⁻¹ cancels in β̂ = (X'V⁻¹X)⁻¹X'V⁻¹y. */
export function vinvAr1(rho: number, n: number): Mat {
	const m = zeros(n, n);
	const c = 1 / (1 - rho * rho);
	for (let i = 0; i < n; i++) m[i][i] = (i === 0 || i === n - 1 ? 1 : 1 + rho * rho) * c;
	for (let i = 0; i + 1 < n; i++) { m[i][i + 1] = m[i + 1][i] = -rho * c; }
	return m;
}

/** Fit y = Xβ + e, e ~ (0, V), by GLS: Z = V⁻¹X, β = (Z'Z)⁻¹Z'y. Passing
 *  vinv = null is OLS; a diagonal V⁻¹ is WLS; a full matrix (e.g. vinvAr1)
 *  is GLS. All three are the same code path — R²/SSE are computed in the
 *  metric of V⁻¹ (which reduces to the textbook values when V = I).
 *  Returns null when the design is singular or n ≤ k. */
export function fitWGLS(x: Mat, y: Vec, vinv: Mat | null, names?: string[]): OlsModel | null {
	const n = x.length;
	const k = x[0].length;
	if (n <= k || y.length !== n) return null;
	let z: Mat = x;
	let u: Vec = y;
	let diag = true;
	if (vinv) {
		for (let i = 0; i < n && diag; i++) {
			for (let j = 0; j < n; j++) {
				if (i !== j && vinv[i][j] !== 0) { diag = false; break; }
			}
		}
	}
	if (diag && vinv) {
		// WLS: Z = √w·X makes Z'Z = X'WX and Z'y = X'Wy
		z = x.map((row, i) => { const s = Math.sqrt(Math.max(vinv[i][i], 0)); return row.map((v) => v * s); });
		u = y.map((v, i) => v * Math.sqrt(Math.max(vinv[i][i], 0)));
	}
	let bread: Mat | null;
	let beta: Vec;
	if (!vinv || diag) {
		const zz = crossprod(z);
		bread = solveInv(zz);
		if (!bread) return null;
		const zy: Vec = new Array<number>(k).fill(0);
		for (let i = 0; i < n; i++) {
			const zi = z[i];
			const ui = u[i];
			for (let t = 0; t < k; t++) zy[t] += zi[t] * ui;
		}
		beta = matVec(bread, zy);
	} else {
		// general GLS: β = (X'V⁻¹X)⁻¹X'V⁻¹y — Z = V⁻¹X does NOT work here,
		// since Z'Z = X'V⁻¹'V⁻¹X ≠ X'V⁻¹X
		const vinvX = matMul(vinv, x);
		const xt = matTrans(x);
		const A = matMul(xt, vinvX);
		bread = solveInv(A);
		if (!bread) return null;
		const vinvY = matVec(vinv, y);
		const b = matVec(xt, vinvY);
		beta = matVec(bread, b);
		z = x;
		u = y;
	}
	const fitted: Vec = [];
	const resid: Vec = [];
	for (let i = 0; i < n; i++) {
		let f = 0;
		for (let t = 0; t < k; t++) f += x[i][t] * beta[t];
		fitted.push(f);
		resid.push(y[i] - f);
	}
	// weighted SSE = e'V⁻¹e
	let sse = 0;
	if (vinv) {
		const ve = matVec(vinv, resid);
		for (let i = 0; i < n; i++) sse += resid[i] * ve[i];
	} else {
		for (let i = 0; i < n; i++) sse += resid[i] * resid[i];
	}
	// weighted SST around the GLS-weighted mean
	let sst: number;
	if (vinv) {
		const vy = matVec(vinv, y);
		let oneV1 = 0;
		let oneVy = 0;
		let yVy = 0;
		for (let i = 0; i < n; i++) {
			let rowSum = 0;
			for (let j = 0; j < n; j++) rowSum += vinv[i][j];
			oneV1 += rowSum;
			oneVy += vy[i];
			yVy += y[i] * vy[i];
		}
		const c = oneVy / oneV1;
		sst = Math.max(yVy - 2 * c * oneVy + c * c * oneV1, 0);
	} else {
		let mu = 0;
		for (const v of y) mu += v;
		mu /= n;
		sst = 0;
		for (const v of y) sst += (v - mu) * (v - mu);
	}
	const df = n - k;
	const sigma2 = sse / df;
	// hat diagonal on the Z scale
	const rb = matMul(z, bread);
	const h: Vec = [];
	for (let i = 0; i < n; i++) {
		let s = 0;
		for (let t = 0; t < k; t++) s += rb[i][t] * z[i][t];
		h.push(Math.min(Math.max(s, 0), 1));
	}
	const se: Vec = [];
	const tstat: Vec = [];
	const pval: Vec = [];
	for (let t = 0; t < k; t++) {
		// σ̂²·bread for every path — the statsmodels GLS convention treats V
		// as known up to scale (σ̂² = e'V⁻¹e/(n−k)); callers whose V is fully
		// specified (the mixed model) override with sqrt(diag(bread)).
		const s = Math.sqrt(Math.max(sigma2 * bread[t][t], 0));
		se.push(s);
		if (s > 0) {
			const tv = beta[t] / s;
			tstat.push(tv);
			pval.push(2 * tSurvival(df, Math.abs(tv)));
		} else {
			tstat.push(beta[t] === 0 ? 0 : Infinity);
			pval.push(beta[t] === 0 ? 1 : 0);
		}
	}
	const tcrit = tCritical(0.05, df);
	const ciLo = beta.map((v, t) => v - tcrit * se[t]);
	const ciHi = beta.map((v, t) => v + tcrit * se[t]);
	const r2 = sst > 0 ? Math.min(Math.max(1 - sse / sst, 0), 1) : (sse === 0 ? 1 : 0);
	const adjR2 = sst > 0 ? 1 - (1 - r2) * (n - 1) / df : 0;
	let f = 0;
	let fP = 1;
	if (k > 1 && sse > 0 && sst > sse) {
		f = ((sst - sse) / (k - 1)) / (sse / df);
		fP = fSurvival(k - 1, df, f);
	}
	const wresid = u.map((v, i) => v - (z[i]!.reduce((s, zv, t) => s + zv * beta[t], 0)));
	const stdResid = wresid.map((e, i) => e / (Math.sqrt(sigma2) * Math.sqrt(Math.max(1 - h[i], 1e-12))));
	return {
		n, k, names: names ?? Array.from({ length: k }, (_, i) => (i === 0 ? 'const' : `x${i}`)),
		x, y, beta, se, tstat, pval, ciLo, ciHi, tcrit, resid, fitted, h,
		r2, adjR2, f, fP, sigma: Math.sqrt(sigma2), sse, sst, bread, wx: z, wresid, stdResid,
	};
}

// ---------------------------------------------------------------------------
// 5. Robust sandwich covariances (Stata convention: V = bread · meat · bread)
// ---------------------------------------------------------------------------

export interface RobustBase {
	x: Mat;
	resid: Vec;
	h: Vec;
	bread: Mat;
	n: number;
	k: number;
}

/** The base a sandwich needs: the whitened design, its residuals and hat
 *  values, and (X'X)⁻¹ — all taken from the model as fitted. */
export function robustBase(m: OlsModel): RobustBase {
	return { x: m.wx, resid: m.wresid, h: m.h, bread: m.bread, n: m.n, k: m.k };
}

function sandwich(b: RobustBase, meat: Mat): Mat {
	const bm = matMul(b.bread, meat);
	const out = matMul(bm, b.bread);
	for (let i = 0; i < b.k; i++) {
		for (let j = 0; j < i; j++) {
			const v = 0.5 * (out[i][j] + out[j][i]);
			out[i][j] = out[j][i] = v;
		}
	}
	return out;
}

/** Heteroskedasticity-consistent covariance: HC0 (White), HC1 (Stata's
 *  default), HC2, HC3 (recommended for small samples). */
export function covHC(b: RobustBase, type: 'hc0' | 'hc1' | 'hc2' | 'hc3'): Mat {
	const meat = zeros(b.k, b.k);
	const hc1 = b.n / (b.n - b.k);
	for (let i = 0; i < b.n; i++) {
		const e = b.resid[i];
		let g = e * e;
		if (type === 'hc1') g *= hc1;
		else if (type === 'hc2') g /= Math.max(1 - b.h[i], 1e-12);
		else if (type === 'hc3') g /= Math.max(1 - b.h[i], 1e-12) ** 2;
		const xi = b.x[i];
		for (let t = 0; t < b.k; t++) {
			const v = g * xi[t];
			if (v === 0) continue;
			for (let s = t; s < b.k; s++) meat[t][s] += v * xi[s];
		}
	}
	for (let t = 0; t < b.k; t++) for (let s = 0; s < t; s++) meat[t][s] = meat[s][t];
	return sandwich(b, meat);
}

/** Newey–West HAC covariance with Bartlett weights, lag truncation L,
 *  small-sample factor n/(n−k) — Stata's `newey` defaults. */
export function covHAC(b: RobustBase, lag: number): Mat {
	const { k, n } = b;
	const meat = zeros(k, k);
	const add = (l: number, w: number, flip: boolean) => {
		for (let i = l; i < n; i++) {
			const g = w * b.resid[i] * b.resid[i - l];
			if (g === 0) continue;
			const a = flip ? b.x[i - l] : b.x[i];
			const c = flip ? b.x[i] : b.x[i - l];
			for (let t = 0; t < k; t++) {
				const v = g * a[t];
				for (let s = 0; s < k; s++) meat[t][s] += v * c[s];
			}
		}
	};
	add(0, 1, false);
	for (let l = 1; l <= lag; l++) {
		const w = 1 - l / (lag + 1);
		add(l, w, false);
		add(l, w, true);
	}
	const adj = n / (n - k);
	for (let t = 0; t < k; t++) for (let s = 0; s < k; s++) meat[t][s] *= adj;
	return sandwich(b, meat);
}

/** Cluster-robust covariance with the finite-sample factor
 *  G/(G−1) · (n−1)/(n−k). The meat is Σ_g s_g s_g' with s_g = Σ_{i∈g} x_i e_i
 *  — scores are summed WITHIN each cluster before the outer product, which
 *  is what makes intra-cluster correlation count. Null when fewer than two
 *  clusters. */
export function covCluster(b: RobustBase, groups: number[]): Mat | null {
	const parts = new Map<number, Vec>();
	for (let i = 0; i < b.n; i++) {
		const g = groups[i];
		let s = parts.get(g);
		if (!s) { s = new Array<number>(b.k).fill(0); parts.set(g, s); }
		const e = b.resid[i];
		const xi = b.x[i];
		for (let t = 0; t < b.k; t++) s[t] += xi[t] * e;
	}
	const G = parts.size;
	if (G < 2) return null;
	const meat = zeros(b.k, b.k);
	for (const s of parts.values()) {
		for (let t = 0; t < b.k; t++) {
			if (s[t] === 0) continue;
			for (let q = t; q < b.k; q++) meat[t][q] += s[t] * s[q];
		}
	}
	const adj = (G / (G - 1)) * ((b.n - 1) / (b.n - b.k));
	for (let t = 0; t < b.k; t++) {
		for (let q = t; q < b.k; q++) {
			const v = meat[t][q] * adj;
			meat[t][q] = meat[q][t] = v;
		}
	}
	return sandwich(b, meat);
}

// ---------------------------------------------------------------------------
// 6. Regression diagnostics
// ---------------------------------------------------------------------------

export interface TestResult {
	stat: number;
	df: number;
	p: number;
}

/** Breusch–Pagan heteroskedasticity test (Koenker's n·R² form): LM from the
 *  auxiliary regression of e² on the original design. */
export function breuschPagan(m: OlsModel): TestResult | null {
	const e2 = m.resid.map((e) => e * e);
	const aux = fitWGLS(m.x, e2, null);
	if (!aux) return null;
	const lm = aux.n * Math.max(0, aux.r2);
	return { stat: lm, df: m.k - 1, p: chiSqSurvival(m.k - 1, lm) };
}

/** White's heteroskedasticity test: LM from regressing e² on a constant,
 *  every regressor, its squares and pairwise products. Null when the
 *  augmented design is singular (e.g. a regressor that never varies). */
export function white(m: OlsModel): TestResult | null {
	const nc = m.x.map((row) => row.slice(1));
	if (!nc.length) return null;
	const aux: Mat = m.x.map((_row, i) => {
		const out: number[] = [1, ...nc[i]];
		for (let a = 0; a < nc[i].length; a++) out.push(nc[i][a] * nc[i][a]);
		for (let a = 0; a < nc[i].length; a++) for (let b = a + 1; b < nc[i].length; b++) out.push(nc[i][a] * nc[i][b]);
		return out;
	});
	const e2 = m.resid.map((e) => e * e);
	const fit = fitWGLS(aux, e2, null);
	if (!fit) return null;
	const lm = fit.n * Math.max(0, fit.r2);
	return { stat: lm, df: fit.k - 1, p: chiSqSurvival(fit.k - 1, lm) };
}

export function durbinWatson(e: Vec): number {
	let num = 0;
	let den = 0;
	for (let t = 0; t < e.length; t++) {
		den += e[t] * e[t];
		if (t > 0) { const d = e[t] - e[t - 1]; num += d * d; }
	}
	return den > 0 ? num / den : NaN;
}

/** Breusch–Godfrey LM test for serial correlation up to `lag` orders, in
 *  the Greene/statsmodels form: the auxiliary regression of e on the
 *  original design and the lagged residuals runs over the full sample with
 *  pre-sample residuals zero-filled. */
export function breuschGodfrey(m: OlsModel, lag: number): TestResult | null {
	const T = m.n;
	const e = m.resid;
	const X: Mat = [];
	const Y: Vec = [];
	for (let t = 0; t < T; t++) {
		const row = [...m.x[t]];
		for (let l = 1; l <= lag; l++) row.push(t - l >= 0 ? e[t - l] : 0);
		X.push(row);
		Y.push(e[t]);
	}
	const fit = fitWGLS(X, Y, null);
	if (!fit) return null;
	const lm = fit.n * Math.max(0, fit.r2);
	return { stat: lm, df: lag, p: chiSqSurvival(lag, lm) };
}

export function acov(e: Vec, maxLag: number): number[] {
	const n = e.length;
	let mu = 0;
	for (const v of e) mu += v;
	mu /= n;
	const out: number[] = [];
	for (let k = 0; k <= maxLag; k++) {
		let s = 0;
		for (let t = k; t < n; t++) s += (e[t] - mu) * (e[t - k] - mu);
		out.push(s / n);
	}
	return out;
}

export function acf(e: Vec, maxLag: number): number[] {
	const c = acov(e, maxLag);
	const v = c[0] || 1;
	return c.map((g) => g / v);
}

/** Partial autocorrelations via the Durbin–Levinson recursion. */
export function pacf(e: Vec, maxLag: number): number[] {
	if (maxLag < 1) return [];
	const r = acf(e, maxLag);
	const out: number[] = [];
	const phi: number[][] = [[r[1]]];
	out.push(r[1]);
	for (let m = 2; m <= maxLag; m++) {
		let num = r[m];
		let den = 1;
		for (let j = 1; j <= m - 1; j++) {
			num -= phi[m - 2][j - 1] * r[m - j];
			den -= phi[m - 2][j - 1] * r[j];
		}
		const pm = Math.abs(den) < 1e-12 ? 0 : num / den;
		const row = new Array<number>(m).fill(0);
		row[m - 1] = pm;
		for (let j = 1; j <= m - 1; j++) row[j - 1] = phi[m - 2][j - 1] - pm * phi[m - 2][m - 1 - j];
		phi.push(row);
		out.push(pm);
	}
	return out;
}

/** Ljung–Box portmanteau Q on residuals; dfAdjust subtracts fitted AR terms
 *  when the residuals come from an ARMA(p, q) fit (standard practice). */
export function ljungBox(e: Vec, maxLag: number, dfAdjust = 0): TestResult {
	const n = e.length;
	const r = acf(e, maxLag);
	let q = 0;
	for (let k = 1; k <= maxLag; k++) q += (r[k] * r[k]) / Math.max(n - k, 1);
	q *= n * (n + 2);
	const df = Math.max(1, maxLag - dfAdjust);
	return { stat: q, df, p: chiSqSurvival(df, q) };
}

export function jarqueBera(e: Vec): TestResult {
	const n = e.length;
	let mu = 0;
	for (const v of e) mu += v;
	mu /= n;
	let m2 = 0;
	let m3 = 0;
	let m4 = 0;
	for (const v of e) {
		const d = v - mu;
		const d2 = d * d;
		m2 += d2;
		m3 += d2 * d;
		m4 += d2 * d2;
	}
	m2 /= n;
	m3 /= n;
	m4 /= n;
	const g1 = m3 / Math.pow(m2, 1.5);
	const g2 = m4 / (m2 * m2) - 3;
	const jb = (n / 6) * (g1 * g1 + 0.25 * g2 * g2);
	return { stat: jb, df: 2, p: chiSqSurvival(2, jb) };
}

export interface Influence {
	cooks: Vec;
	dffits: Vec;
	leverage: Vec;
	/** n×k matrix of DFBETAS, one row per observation. */
	dfbeta: Mat;
}

/** Cook's distance, leverage, externally-studentized DFFITS and DFBETAS.
 *  All formulas use the whitened design/residuals, so they are exact for OLS
 *  and the usual weighted analogues for WLS. */
export function influence(m: OlsModel): Influence {
	const { n, k } = m;
	const cooks: Vec = [];
	const dffits: Vec = [];
	const dfb: Mat = [];
	const s2 = m.sse / (n - k);
	for (let i = 0; i < n; i++) {
		const h = m.h[i];
		const oneMinusH = Math.max(1 - h, 1e-12);
		const ei = m.wresid[i];
		const s2i = Math.max(((n - k) * s2 - (ei * ei) / oneMinusH) / (n - k - 1), 1e-300);
		const ti = ei / Math.sqrt(s2i * oneMinusH);
		dffits.push(ti * Math.sqrt(h / oneMinusH));
		cooks.push((ei * ei * h) / (k * s2 * oneMinusH * oneMinusH));
		const row = new Array<number>(k).fill(0);
		for (let t = 0; t < k; t++) {
			let s = 0;
			for (let j = 0; j < k; j++) s += m.bread[t][j] * m.wx[i][j];
			row[t] = (s * ei) / oneMinusH;
		}
		dfb.push(row);
	}
	return { cooks, dffits, leverage: [...m.h], dfbeta: dfb };
}

// ---------------------------------------------------------------------------
// 7. GLM by iteratively reweighted least squares
// ---------------------------------------------------------------------------

export type GlmFamily = 'logit' | 'probit' | 'poisson' | 'nbinom';

export interface GlmModel {
	n: number;
	k: number;
	names: string[];
	beta: Vec;
	se: Vec;
	zstat: Vec;
	pval: Vec;
	logLik: number;
	/** intercept-only model at the same family/alpha — the LR test's null */
	nullLogLik: number;
	lrStat: number;
	lrP: number;
	lrDf: number;
	deviance: number;
	aic: number;
	bic: number;
	fitted: Vec;
	resid: Vec;
	alpha: number;
	iter: number;
	converged: boolean;
}

interface CoreInfo {
	mu: number;
	dmu: number;
}

function familyCore(fam: GlmFamily, eta: number): CoreInfo {
	if (fam === 'logit') {
		const mu = expit(eta);
		return { mu, dmu: mu * (1 - mu) };
	}
	if (fam === 'probit') {
		return { mu: normCdf(eta), dmu: normPdf(eta) };
	}
	// log link (poisson & nbinom): cap η so exp() cannot overflow mid-loop
	return { mu: Math.exp(Math.min(eta, 700)), dmu: Math.exp(Math.min(eta, 700)) };
}

export interface IrlsOpts {
	family: GlmFamily;
	/** NB2 dispersion for 'nbinom' (α = 1/r); ignored otherwise. */
	alpha?: number;
	/** prior (case) weights, e.g. the (1−τ) of a ZIP E-step */
	weights?: Vec | null;
	maxIter?: number;
}

export function irls(x: Mat, y: Vec, opts: IrlsOpts, names?: string[]): GlmModel | null {
	const n = x.length;
	const k = x[0].length;
	if (n <= k) return null;
	const fam = opts.family;
	const alpha = fam === 'nbinom' ? Math.max(opts.alpha ?? 1, 1e-8) : 0;
	const pw = opts.weights ?? null;
	if (fam === 'logit' || fam === 'probit') {
		for (const v of y) if (v !== 0 && v !== 1) return null;
	}
	let swy = 0;
	let sw = 0;
	for (let i = 0; i < n; i++) {
		const w0 = pw ? pw[i] : 1;
		swy += w0 * y[i];
		sw += w0;
	}
	if (sw <= 0) return null;
	const ybar = swy / sw;
	const interceptStart = fam === 'poisson' || fam === 'nbinom'
		? Math.log(Math.max(ybar, 1e-6))
		: Math.log(Math.max(ybar, 1e-6) / Math.max(1 - ybar, 1e-6));
	const beta: Vec = new Array<number>(k).fill(0);
	beta[0] = interceptStart;
	const maxIter = opts.maxIter ?? 200;
	let converged = false;
	let iter = 0;
	let bread: Mat | null = null;
	let mu: Vec = [];
	for (iter = 1; iter <= maxIter; iter++) {
		mu = [];
		const W: Vec = [];
		const z: Vec = [];
		for (let i = 0; i < n; i++) {
			let e = 0;
			for (let t = 0; t < k; t++) e += x[i][t] * beta[t];
			const core = familyCore(fam, e);
			mu.push(core.mu);
			const varf = fam === 'logit' || fam === 'probit'
				? Math.max(core.mu * (1 - core.mu), 1e-10)
				: fam === 'poisson' ? core.mu : core.mu + alpha * core.mu * core.mu;
			const dmu = Math.max(Math.abs(core.dmu), 1e-300);
			W.push((core.dmu * core.dmu) / varf * (pw ? pw[i] : 1));
			z.push(Math.max(-1e10, Math.min(1e10, e + (y[i] - core.mu) / dmu)));
		}
		const wx = x.map((row, i) => row.map((v) => v * Math.sqrt(Math.max(W[i], 0))));
		const wz = z.map((v, i) => v * Math.sqrt(Math.max(W[i], 0)));
		bread = solveInv(crossprod(wx));
		if (!bread) return null;
		const zy: Vec = new Array<number>(k).fill(0);
		for (let i = 0; i < n; i++) {
			for (let t = 0; t < k; t++) zy[t] += wx[i][t] * wz[i];
		}
		const newBeta = matVec(bread, zy);
		let dmax = 0;
		for (let t = 0; t < k; t++) dmax = Math.max(dmax, Math.abs(newBeta[t] - beta[t]));
		for (let t = 0; t < k; t++) beta[t] = newBeta[t];
		if (dmax < 1e-9) { converged = true; break; }
	}
	if (!bread) return null;
	// the loop's mu/bread trail the final β by one Newton step — recompute
	// both at the converged parameters so fitted values and SEs are exact
	mu = [];
	const Wf: Vec = [];
	for (let i = 0; i < n; i++) {
		let e = 0;
		for (let t = 0; t < k; t++) e += x[i][t] * beta[t];
		const core = familyCore(fam, e);
		mu.push(core.mu);
		const varf = fam === 'logit' || fam === 'probit'
			? Math.max(core.mu * (1 - core.mu), 1e-10)
			: fam === 'poisson' ? core.mu : core.mu + alpha * core.mu * core.mu;
		Wf.push((core.dmu * core.dmu) / varf * (pw ? pw[i] : 1));
	}
	const wxFinal = x.map((row, i) => row.map((v) => v * Math.sqrt(Math.max(Wf[i], 0))));
	const finalBread = solveInv(crossprod(wxFinal));
	if (finalBread) bread = finalBread;
	const se: Vec = [];
	for (let t = 0; t < k; t++) se.push(Math.sqrt(Math.max(bread[t][t], 0)));
	const logLik = glmLogLik(fam, alpha, y, mu, pw);
	const deviance = glmDeviance(fam, alpha, y, mu, pw);
	// intercept-only null for the LR test; a single-column design IS the
	// null model, so recursing would never terminate — LR is 0 there.
	let nullLogLik = logLik;
	if (k > 1) {
		const nullModel = irls(y.map(() => [1]), y, { ...opts, maxIter: 100 });
		if (!nullModel) return null;
		nullLogLik = nullModel.logLik;
	}
	const lrStat = k > 1 ? Math.max(0, 2 * (logLik - nullLogLik)) : 0;
	const lrDf = k - 1;
	const paramCount = k;
	return {
		n, k, names: names ?? Array.from({ length: k }, (_, i) => (i === 0 ? 'const' : `x${i}`)),
		beta, se,
		zstat: beta.map((v, t) => (se[t] > 0 ? v / se[t] : 0)),
		pval: beta.map((_, t) => (se[t] > 0 ? 2 * (1 - normCdf(Math.abs(beta[t] / se[t]))) : 1)),
		logLik, nullLogLik, lrStat,
		lrP: lrDf > 0 ? chiSqSurvival(lrDf, lrStat) : 1,
		lrDf,
		deviance,
		aic: -2 * logLik + 2 * paramCount,
		bic: -2 * logLik + paramCount * Math.log(n),
		fitted: mu, resid: y.map((v, i) => v - mu[i]),
		alpha, iter, converged,
	};
}

function glmLogLik(fam: GlmFamily, alpha: number, y: Vec, mu: Vec, pw: Vec | null): number {
	let ll = 0;
	for (let i = 0; i < y.length; i++) {
		const w0 = pw ? pw[i] : 1;
		const yi = y[i];
		const mi = mu[i];
		if (fam === 'logit' || fam === 'probit') {
			if (yi === 1) ll += w0 * Math.log(Math.max(mi, 1e-300));
			else ll += w0 * Math.log(Math.max(1 - mi, 1e-300));
		} else if (fam === 'poisson') {
			ll += w0 * (yi * Math.log(Math.max(mi, 1e-300)) - mi - lgamma(yi + 1));
		} else {
			const r = 1 / alpha;
			ll += w0 * (lgamma(yi + r) - lgamma(r) - lgamma(yi + 1)
				+ r * Math.log(r / (r + mi)) + yi * Math.log(Math.max(mi, 1e-300) / (r + mi)));
		}
	}
	return Number.isFinite(ll) ? ll : -1e300;
}

function glmDeviance(fam: GlmFamily, alpha: number, y: Vec, mu: Vec, pw: Vec | null): number {
	let d = 0;
	for (let i = 0; i < y.length; i++) {
		const w0 = pw ? pw[i] : 1;
		const yi = y[i];
		const mi = Math.max(mu[i], 1e-300);
		if (fam === 'logit' || fam === 'probit') {
			if (yi === 1) d += w0 * Math.log(mi);
			else d += w0 * Math.log(Math.max(1 - mi, 1e-300));
		} else if (fam === 'poisson') {
			d += w0 * (yi > 0 ? yi * Math.log(yi / mi) - (yi - mi) : mi);
		} else {
			const r = 1 / alpha;
			d += w0 * (yi > 0 ? yi * Math.log(yi / mi) : 0)
				- w0 * (yi + r) * Math.log((yi + r) / (mi + r));
		}
	}
	return -2 * d;
}

/** Profile-likelihood estimate of the NB2 dispersion: coarse grid over ln α
 *  then golden-section refinement, each candidate refitting the IRLS. */
export function nbFit(x: Mat, y: Vec, names?: string[]): GlmModel | null {
	const prof = (lna: number): { ll: number; model: GlmModel | null } => {
		const m = irls(x, y, { family: 'nbinom', alpha: Math.exp(lna) }, names);
		return m ? { ll: m.logLik, model: m } : { ll: -Infinity, model: null };
	};
	const lo = -8;
	const hi = 8;
	const steps = 33;
	let bestI = 0;
	let bestLl = -Infinity;
	let bestModel: GlmModel | null = null;
	for (let i = 0; i < steps; i++) {
		const r = prof(lo + ((hi - lo) * i) / (steps - 1));
		if (r.ll > bestLl) { bestLl = r.ll; bestI = i; bestModel = r.model; }
	}
	let a = lo + ((hi - lo) * Math.max(bestI - 1, 0)) / (steps - 1);
	let b = lo + ((hi - lo) * Math.min(bestI + 1, steps - 1)) / (steps - 1);
	const invphi = (Math.sqrt(5) - 1) / 2;
	let c = b - invphi * (b - a);
	let d = a + invphi * (b - a);
	let fc = prof(c);
	let fd = prof(d);
	for (let it = 0; it < 60 && b - a > 1e-8; it++) {
		if (fc.ll > fd.ll) {
			b = d;
			d = c;
			fd = fc;
			c = b - invphi * (b - a);
			fc = prof(c);
		} else {
			a = c;
			c = d;
			fc = fd;
			d = a + invphi * (b - a);
			fd = prof(d);
		}
	}
	const pick = fc.ll >= fd.ll ? fc : fd;
	const chosen = pick.ll >= bestLl ? pick : { ll: bestLl, model: bestModel };
	if (!chosen.model) return null;
	const m = chosen.model;
	// the dispersion α is an estimated parameter: it enters the ICs as +1
	return { ...m, aic: m.aic + 2, bic: m.bic + Math.log(m.n) };
}

export interface ZipModel {
	/** structural-zero probability (constant inflation arm) */
	pi: number;
	/** count-arm fit: 'poisson' or 'nbinom' with its α */
	count: GlmModel;
	logLik: number;
	aic: number;
	bic: number;
	iter: number;
	converged: boolean;
	paramCount: number;
}

/** Zero-inflated Poisson / NB2 with a constant inflation probability, by EM:
 *  E-step classifies each zero, M-step refits the count arm with (1−τ)
 *  weights and updates π in closed form. */
export function zipFit(x: Mat, y: Vec, count: 'poisson' | 'nbinom'): ZipModel | null {
	const n = x.length;
	const n0 = y.filter((v) => v === 0).length;
	if (n0 === 0 || n0 === n) return null;
	const initial = count === 'nbinom' ? nbFit(x, y) : irls(x, y, { family: 'poisson' });
	if (!initial) return null;
	let model: GlmModel = initial;
	let pi = 0.01;
	let converged = false;
	let iter = 0;
	for (iter = 1; iter <= 500; iter++) {
		const mu = model.fitted;
		const alpha = model.alpha;
		const tau: Vec = new Array<number>(n).fill(0);
		for (let i = 0; i < n; i++) {
			if (y[i] !== 0) continue;
			const p0 = count === 'poisson' ? Math.exp(-mu[i]) : Math.pow(1 / (1 + alpha * mu[i]), 1 / alpha);
			tau[i] = (pi * 1) / (pi + (1 - pi) * p0 + 1e-300);
		}
		const newPi = tau.reduce((s, v) => s + v, 0) / n;
		const next = count === 'nbinom'
			? irls(x, y, { family: 'nbinom', alpha, weights: tau.map((v) => 1 - v) })
			: irls(x, y, { family: 'poisson', weights: tau.map((v) => 1 - v) });
		if (!next) return null;
		const dBeta = Math.max(...next.beta.map((v, t) => Math.abs(v - model.beta[t])));
		model = next;
		const dPi = Math.abs(newPi - pi);
		pi = Math.min(Math.max(newPi, 0), 0.999999);
		if (dPi < 1e-10 && dBeta < 1e-9) { converged = true; break; }
		if (pi > 0.9999) break;
	}
	// observed-data log-likelihood
	const mu = model.fitted;
	const alpha = model.alpha;
	let ll = 0;
	for (let i = 0; i < n; i++) {
		if (y[i] !== 0) {
			const pmf = count === 'poisson'
				? y[i] * Math.log(Math.max(mu[i], 1e-300)) - mu[i] - lgamma(y[i] + 1)
				: (lgamma(y[i] + 1 / alpha) - lgamma(1 / alpha) - lgamma(y[i] + 1)
					+ (1 / alpha) * Math.log(1 / (1 + alpha * mu[i])) + y[i] * Math.log(Math.max(mu[i], 1e-300) / (1 / alpha + mu[i])));
			ll += Math.log(1 - pi) + pmf;
		} else {
			const p0 = count === 'poisson' ? Math.exp(-mu[i]) : Math.pow(1 / (1 + alpha * mu[i]), 1 / alpha);
			ll += Math.log(pi + (1 - pi) * p0 + 1e-300);
		}
	}
	const paramCount = model.k + 1 + (count === 'nbinom' ? 1 : 0);
	return {
		pi, count: model, logLik: ll,
		aic: -2 * ll + 2 * paramCount,
		bic: -2 * ll + paramCount * Math.log(n),
		iter, converged, paramCount,
	};
}

export interface MargEffects {
	/** average marginal effects: mean over the sample of ∂μ/∂x_j */
	ame: Vec;
	/** marginal effects at the mean: ∂μ/∂x_j evaluated at x̄ */
	mem: Vec;
}

/** Marginal effects for a binary logit/probit fit. */
export function marginalEffects(x: Mat, beta: Vec, family: 'logit' | 'probit'): MargEffects | null {
	const n = x.length;
	const k = beta.length;
	if (n === 0) return null;
	let dsum = 0;
	const xbar: Vec = new Array<number>(k).fill(0);
	for (let i = 0; i < n; i++) for (let t = 0; t < k; t++) xbar[t] += x[i][t] / n;
	for (let i = 0; i < n; i++) {
		let eta = 0;
		for (let t = 0; t < k; t++) eta += x[i][t] * beta[t];
		dsum += family === 'logit' ? expit(eta) * (1 - expit(eta)) : normPdf(eta);
	}
	let etaBar = 0;
	for (let t = 0; t < k; t++) etaBar += xbar[t] * beta[t];
	const dBar = family === 'logit' ? expit(etaBar) * (1 - expit(etaBar)) : normPdf(etaBar);
	const ame: Vec = [];
	const mem: Vec = [];
	for (let t = 0; t < k; t++) {
		ame.push((dsum / n) * beta[t]);
		mem.push(dBar * beta[t]);
	}
	return { ame, mem };
}

// ---------------------------------------------------------------------------
// 8. Unit roots / stationarity
// ---------------------------------------------------------------------------

export type AdfTrend = 'none' | 'drift' | 'trend';

export interface AdfResult {
	/** t statistic on the lagged level's coefficient */
	stat: number;
	/** MacKinnon (2010) asymptotic critical values — 1%, 5%, 10% */
	cv: [number, number, number];
	lags: number;
	nused: number;
	model: OlsModel;
}

// MacKinnon (2010) asymptotic critical values for the ADF t statistic
// (verified against statsmodels.tsa.adfvalues.mackinnoncrit, N=1, T=∞).
const ADF_CV: Record<AdfTrend, [number, number, number]> = {
	none: [-2.5657, -1.941, -1.6168],
	drift: [-3.4304, -2.8615, -2.5668],
	trend: [-3.9588, -3.4105, -3.1271],
};

function adfCore(y: Vec, lags: number, trend: AdfTrend, startAt: number): AdfResult | null {
	const T = y.length;
	if (lags < 0 || startAt < lags + 1 || startAt >= T) return null;
	const dy: Vec = [];
	for (let t = 1; t < T; t++) dy.push(y[t] - y[t - 1]);
	const X: Mat = [];
	const Y: Vec = [];
	for (let t = startAt; t < T; t++) {
		const row: number[] = [];
		if (trend !== 'none') row.push(1);
		if (trend === 'trend') row.push(t);
		row.push(y[t - 1]);
		for (let l = 1; l <= lags; l++) row.push(dy[t - 1 - l]);
		X.push(row);
		Y.push(dy[t - 1]);
	}
	const m = fitWGLS(X, Y, null);
	if (!m) return null;
	const idx = trend === 'none' ? 0 : trend === 'drift' ? 1 : 2;
	return { stat: m.tstat[idx], cv: ADF_CV[trend], lags, nused: m.n, model: m };
}

export function adf(y: Vec, lags: number, trend: AdfTrend): AdfResult | null {
	return adfCore(y, lags, trend, lags + 1);
}

/** Schwert's rule for the maximum lag considered in lag selection (same
 *  ceil form statsmodels uses in adfuller's autolag). */
export function adfLagMax(n: number): number {
	return Math.max(1, Math.ceil(12 * Math.pow(n / 100, 0.25)));
}

/** ADF with the lag order chosen by AIC over 0..maxLag, all candidates
 *  evaluated on the common start-at-maxLag sample so the AICs compare. */
export function adfAuto(y: Vec, trend: AdfTrend, maxLag?: number): AdfResult | null {
	const cap = Math.min(maxLag ?? adfLagMax(y.length), y.length - 6);
	if (cap < 0) return null;
	let best: AdfResult | null = null;
	let bestAic = Infinity;
	for (let l = 0; l <= cap; l++) {
		const r = adfCore(y, l, trend, cap + 1);
		if (!r) continue;
		const aic = r.nused * Math.log(Math.max(r.model.sse / r.nused, 1e-300)) + 2 * r.model.k;
		if (aic < bestAic) { bestAic = aic; best = r; }
	}
	if (!best) return null;
	// refit at the chosen lag with its own (larger) sample
	return adf(y, best.lags, trend);
}

export interface KpssResult {
	stat: number;
	/** Kwiatkowski et al. (1992) critical values — 10%, 5%, 1% */
	cv: [number, number, number];
	lags: number;
}

const KPSS_CV = {
	level: [0.347, 0.463, 0.739] as [number, number, number],
	trend: [0.119, 0.146, 0.216] as [number, number, number],
};

/** Schwert's lag rule for the long-run variance (statsmodels' "legacy"). */
export function kpssLagAuto(n: number): number {
	return Math.max(1, Math.ceil(12 * Math.pow(n / 100, 0.25)));
}

/** KPSS test with the null of stationarity: η = ΣS²/(n²·λ̂), λ̂ the Bartlett
 *  Newey–West long-run variance of the (de-meaned or detrended) series. */
export function kpss(y: Vec, trend: 'level' | 'trend', lags?: number): KpssResult | null {
	const n = y.length;
	if (n < 8) return null;
	let e: Vec;
	if (trend === 'level') {
		let mu = 0;
		for (const v of y) mu += v;
		mu /= n;
		e = y.map((v) => v - mu);
	} else {
		const X = y.map((_, i) => [1, i + 1]);
		const m = fitWGLS(X, y, null);
		if (!m) return null;
		e = m.resid;
	}
	const L = Math.max(0, Math.min(lags ?? kpssLagAuto(n), n - 2));
	let s = 0;
	let s2 = 0;
	for (let t = 0; t < n; t++) {
		s += e[t];
		s2 += s * s;
	}
	const g: Vec = [];
	for (let k = 0; k <= L; k++) {
		let acc = 0;
		for (let t = k; t < n; t++) acc += e[t] * e[t - k];
		g.push(acc / n);
	}
	let lam = g[0];
	for (let k = 1; k <= L; k++) lam += 2 * (1 - k / (L + 1)) * g[k];
	if (lam <= 0) return null;
	return { stat: s2 / (n * n * lam), cv: trend === 'level' ? KPSS_CV.level : KPSS_CV.trend, lags: L };
}

// ---------------------------------------------------------------------------
// 9. ARIMA / SARIMAX by conditional-sum-of-squares maximum likelihood
// ---------------------------------------------------------------------------

export interface ArimaSpec {
	p: number;
	d: number;
	q: number;
	P: number;
	D: number;
	Q: number;
	m: number;
}

export interface ArimaModel {
	spec: ArimaSpec;
	phi: Vec;
	theta: Vec;
	Phi: Vec;
	Theta: Vec;
	sigma2: number;
	logLik: number;
	aic: number;
	aicc: number;
	bic: number;
	nused: number;
	/** residuals aligned with w (zeros before the burn-in) */
	resid: Vec;
	/** the differenced series w = Δ^d Δ_m^D y */
	w: Vec;
	burn: number;
	converged: boolean;
	iter: number;
}

/** Coefficients of (1−B)^d·(1−B^m)^D: w_t = Σ_j coef[j]·y_{t−j}. */
export function diffPoly(d: number, D: number, m: number): number[] {
	let a: number[] = [1];
	for (let i = 0; i < d; i++) a = conv(a, [1, -1]);
	for (let i = 0; i < D; i++) {
		const s: number[] = new Array<number>(m + 1).fill(0);
		s[0] = 1;
		s[m] = -1;
		a = conv(a, s);
	}
	return a;
}

interface ArmaPoly {
	/** c[j] = AR coefficient at lag j (j ≥ 1) of the combined
	 *  (1−φB…)(1−ΦB^m…) polynomial, negated for the recursion
	 *  w_t = Σ c_j w_{t−j} + ε_t + Σ d_j ε_{t−j} */
	c: number[];
	d: number[];
	maxLag: number;
}

function armaPolys(spec: ArimaSpec, raw: Vec): ArmaPoly {
	// raw AR/MA parameters, kept inside (−0.9995, 0.9995) by a barrier in
	// the objective — AR fits stay non-explosive and MA fits invertible by
	// construction, so the optimiser can never wander into a region where
	// forecasts blow up.
	const phi = raw.slice(0, spec.p);
	const theta = raw.slice(spec.p, spec.p + spec.q);
	const Phi = raw.slice(spec.p + spec.q, spec.p + spec.q + spec.P);
	const Theta = raw.slice(spec.p + spec.q + spec.P, spec.p + spec.q + spec.P + spec.Q);
	const arN: number[] = [1];
	for (let i = 0; i < spec.p; i++) arN.push(-phi[i]);
	const maN: number[] = [1];
	for (let i = 0; i < spec.q; i++) maN.push(theta[i]);
	const arS: number[] = [1];
	for (let i = 0; i < spec.P; i++) { while (arS.length < (i + 1) * spec.m) arS.push(0); arS.push(-Phi[i]); }
	const maS: number[] = [1];
	for (let i = 0; i < spec.Q; i++) { while (maS.length < (i + 1) * spec.m) maS.push(0); maS.push(Theta[i]); }
	const ar = conv(arN, arS);
	const ma = conv(maN, maS);
	return { c: ar.slice(1).map((v) => -v), d: ma.slice(1), maxLag: Math.max(ar.length, ma.length) - 1 };
}

export function arimaEstimate(y: Vec, spec: ArimaSpec): ArimaModel | null {
	const dp = diffPoly(spec.d, spec.D, spec.m);
	const dmax = dp.length - 1;
	if (y.length - dmax < 8) return null;
	const w: Vec = [];
	for (let t = dmax; t < y.length; t++) {
		let s = 0;
		for (let j = 0; j < dp.length; j++) s += dp[j] * y[t - j];
		w.push(s);
	}
	const np = spec.p + spec.q + spec.P + spec.Q;
	const base = {
		spec, phi: [] as Vec, theta: [] as Vec, Phi: [] as Vec, Theta: [] as Vec,
		sigma2: 0, logLik: 0, aic: 0, aicc: 0, bic: 0, w, burn: 0,
		converged: true, iter: 0, nused: w.length, resid: [...w],
	};
	const finalize = (raw: Vec | null, eps: Vec, cnt: number, converged: boolean, iter: number): ArimaModel => {
		const sigma2 = cnt > 0 ? eps.reduce((s, v) => s + v * v, 0) / cnt : NaN;
		const ll = -0.5 * cnt * (Math.log(2 * Math.PI * sigma2) + 1);
		const K = np + 1;
		const aic = -2 * ll + 2 * K;
		const aicc = cnt - K - 1 > 0 ? aic + (2 * K * (K + 1)) / (cnt - K - 1) : NaN;
		const bic = -2 * ll + K * Math.log(cnt);
		let phi: Vec = [];
		let theta: Vec = [];
		let Phi: Vec = [];
		let Theta: Vec = [];
		let burn = 0;
		if (raw) {
			phi = raw.slice(0, spec.p);
			theta = raw.slice(spec.p, spec.p + spec.q);
			Phi = raw.slice(spec.p + spec.q, spec.p + spec.q + spec.P);
			Theta = raw.slice(spec.p + spec.q + spec.P, spec.p + spec.q + spec.P + spec.Q);
			burn = armaPolys(spec, raw).maxLag;
		}
		return { ...base, phi, theta, Phi, Theta, sigma2, logLik: ll, aic, aicc, bic, nused: cnt, resid: eps, burn, converged, iter };
	};
	if (np === 0) return finalize(null, [...w], w.length, true, 0);
	const css = (raw: Vec): { eps: Vec; sse: number; cnt: number } => {
		const { c, d, maxLag } = armaPolys(spec, raw);
		const eps: Vec = new Array<number>(w.length).fill(0);
		let sse = 0;
		let cnt = 0;
		for (let t = maxLag; t < w.length; t++) {
			let e = w[t];
			for (let j = 1; j <= c.length; j++) e -= c[j - 1] * w[t - j];
			for (let j = 1; j <= d.length; j++) e -= d[j - 1] * eps[t - j];
			eps[t] = e;
			sse += e * e;
			cnt++;
		}
		return { eps, sse, cnt };
	};
	const obj = (raw: Vec): number => {
		// barrier: |param| ≥ 0.9995 is outside the admissible region
		for (const v of raw) if (!Number.isFinite(v) || Math.abs(v) >= 0.9995) return 1e12;
		const r = css(raw);
		if (r.cnt < np + 2) return 1e12;
		return r.cnt * Math.log(Math.max(r.sse / r.cnt, 1e-300));
	};
	let raw: Vec = new Array<number>(np).fill(0);
	let res = nelderMead(raw, obj, { maxIter: 3000, tol: 1e-11 });
	// restarts from the optimum with shrinking steps — Nelder–Mead stalls in
	// flat valleys (θ near ±1 on an ARIMA(0,1,1) is the worst case), and a
	// second simplex seeded tighter closes the remaining gap
	res = nelderMead(res.x, obj, { maxIter: 3000, tol: 1e-12, step: res.x.map((v) => (v === 0 ? 0.05 : Math.abs(v) * 0.05)) });
	res = nelderMead(res.x, obj, { maxIter: 4000, tol: 1e-13, step: res.x.map(() => 0.002) });
	raw = res.x;
	const r = css(raw);
	return finalize(raw, r.eps, r.cnt, res.converged, res.iter);
}

export interface ArimaForecast {
	/** level forecasts ŷ_{T+1..T+h} */
	point: Vec;
	/** ~95% interval; for d > 0 the variance is the differenced-scale
	 *  variance integrated without accumulating level uncertainty — an
	 *  approximation flagged in the tool copy */
	lo: Vec;
	hi: Vec;
	psi: Vec;
}

export function arimaForecast(mod: ArimaModel, hist: Vec, h: number): ArimaForecast | null {
	if (h < 1 || h > 200) return null;
	const { spec } = mod;
	const np = spec.p + spec.q + spec.P + spec.Q;
	const raw: Vec = [...mod.phi, ...mod.theta, ...mod.Phi, ...mod.Theta];
	const { c, d } = np === 0
		? { c: [] as number[], d: [] as number[] }
		: armaPolys(spec, raw);
	// ψ weights of the MA(∞) representation, for forecast variances
	const psi: Vec = [1];
	for (let j = 1; j < h; j++) {
		let v = d[j] ?? 0;
		for (let i = 1; i <= Math.min(j, c.length); i++) v += c[i - 1] * (psi[j - i] ?? 0);
		psi.push(v);
	}
	// w-scale forecasts, ε̂ = 0 beyond the sample
	const wExt: Vec = [...mod.w];
	const epsExt: Vec = [...mod.resid];
	const wf: Vec = [];
	const varW: Vec = [];
	for (let s = 0; s < h; s++) {
		const t = wExt.length;
		let v = 0;
		for (let j = 1; j <= c.length; j++) v += c[j - 1] * (wExt[t - j] ?? 0);
		for (let j = 1; j <= d.length; j++) v += d[j - 1] * (epsExt[t - j] ?? 0);
		wExt.push(v);
		wf.push(v);
		let acc = 0;
		for (let j = 0; j <= s; j++) acc += (psi[j] ?? 0) ** 2;
		varW.push(mod.sigma2 * acc);
	}
	// integrate back to levels: w_t = Σ dp[j] y_{t−j}  ⇒  y_t = w_t − Σ_{j≥1} dp[j] y_{t−j}
	const dp = diffPoly(spec.d, spec.D, spec.m);
	const lev: Vec = [...hist];
	const point: Vec = [];
	const lo: Vec = [];
	const hi: Vec = [];
	const z975 = normInv(0.975);
	for (let s = 0; s < h; s++) {
		const t = lev.length;
		let v = wf[s];
		for (let j = 1; j < dp.length; j++) v -= dp[j] * lev[t - j];
		lev.push(v);
		point.push(v);
		const se = Math.sqrt(Math.max(varW[s], 0));
		lo.push(v - z975 * se);
		hi.push(v + z975 * se);
	}
	return { point, lo, hi, psi };
}

// ---------------------------------------------------------------------------
// 10. VAR, Granger causality, impulse responses, Johansen cointegration
// ---------------------------------------------------------------------------

export interface VarModel {
	K: number;
	p: number;
	T: number;
	names: string[];
	/** coefficient per equation: coef[eq][0] is the intercept, then K·p lags */
	coef: Mat;
	se: Mat;
	tstat: Mat;
	pval: Mat;
	/** residual covariance (MLE, divided by T) */
	sigmaU: Mat;
	logLik: number;
	aic: number;
	bic: number;
	hqic: number;
	stable: boolean;
	maxModulus: number;
	fitted: Mat;
	resid: Mat;
}

export function varFit(y: Mat, p: number, names?: string[]): VarModel | null {
	const T = y.length;
	const K = y[0].length;
	const rows = T - p;
	if (rows <= K * p + 2) return null;
	const X: Mat = [];
	for (let t = p; t < T; t++) {
		const row: number[] = [1];
		for (let l = 1; l <= p; l++) for (let j = 0; j < K; j++) row.push(y[t - l][j]);
		X.push(row);
	}
	const coef: Mat = [];
	const se: Mat = [];
	const tstat: Mat = [];
	const pval: Mat = [];
	const resid: Mat = [];
	const fitted: Mat = [];
	for (let j = 0; j < K; j++) {
		const yj: Vec = [];
		for (let t = p; t < T; t++) yj.push(y[t][j]);
		const m = fitWGLS(X, yj, null);
		if (!m) return null;
		coef.push(m.beta);
		se.push(m.se);
		tstat.push(m.tstat);
		pval.push(m.pval);
		resid.push(m.resid);
		fitted.push(m.fitted);
	}
	// residual covariance (MLE) and likelihood
	const sigmaU = zeros(K, K);
	for (let a = 0; a < K; a++) for (let b = 0; b < K; b++) {
		let s = 0;
		for (let i = 0; i < rows; i++) s += resid[a][i] * resid[b][i];
		sigmaU[a][b] = s / rows;
	}
	const ld = Math.log(Math.max(Math.abs(detOf(sigmaU)), 1e-300));
	const logLik = (-rows * K / 2) * (Math.log(2 * Math.PI) + 1) - (rows / 2) * ld;
	// Lütkepohl's information criteria, statsmodels' convention:
	// ln|Σ̂| + (2 / T)·free for AIC, ln(T)/T·free for BIC.
	const free = K * K * p + K;
	const aic = ld + (2 / rows) * free;
	const bic = ld + (Math.log(rows) / rows) * free;
	const hqic = ld + (2 * Math.log(Math.log(rows)) / rows) * free;
	// stability: eigenvalues of the Kp×Kp companion matrix
	const comp = companionOf(coef, K, p);
	const eig = matrixEigenvalues(comp);
	let maxModulus = 0;
	for (const e of eig) maxModulus = Math.max(maxModulus, Math.hypot(e[0], e[1]));
	return {
		K, p, T: rows, names: names ?? Array.from({ length: K }, (_, i) => `y${i + 1}`),
		coef, se, tstat, pval, sigmaU, logLik, aic, bic, hqic,
		stable: maxModulus < 1, maxModulus, fitted, resid,
	};
}

function companionOf(coef: Mat, K: number, p: number): Mat {
	// first block row: A_1..A_p stacked sideways; below: shifted identity
	const n = K * p;
	const F = zeros(n, n);
	for (let j = 0; j < K; j++) {
		for (let l = 0; l < p; l++) {
			for (let c = 0; c < K; c++) F[j][l * K + c] = coef[j][1 + l * K + c];
		}
	}
	for (let l = 0; l < p - 1; l++) for (let c = 0; c < K; c++) F[(l + 1) * K + c][l * K + c] = 1;
	return F;
}

/** Eigenvalues of a general square matrix: characteristic polynomial by
 *  Faddeev–LeVerrier, roots by Durand–Kerner. Returned as [re, im] pairs. */
export function matrixEigenvalues(a: Mat): [number, number][] {
	const n = a.length;
	// Faddeev–LeVerrier: det(λI − A) = λ^n + c_1 λ^{n−1} + … + c_n, with
	// M_k = A·M_{k−1} + c_{k−1}·I, c_k = −tr(A·M_k)/k  (M_0 = 0, c_0 = 1)
	const cs: number[] = [1];
	let AM: Mat = zeros(n, n); // A·M_0 = 0
	for (let k = 1; k <= n; k++) {
		const Mk = zeros(n, n);
		for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) Mk[i][j] = AM[i][j] + (i === j ? cs[k - 1] : 0);
		AM = matMul(a, Mk);
		let tr = 0;
		for (let i = 0; i < n; i++) tr += AM[i][i];
		cs.push(-tr / k);
	}
	return polyRoots(cs);
}

/** Durand–Kerner root finder for a polynomial with leading coefficient 1. */
export function polyRoots(coeffs: number[]): [number, number][] {
	const n = coeffs.length - 1;
	if (n < 1) return [];
	const c = coeffs.slice(1); // λ^n + c[0] λ^{n−1} + … + c[n−1]
	let re: number[] = [];
	let im: number[] = [];
	// classic Durand–Kerner start: powers of 0.4 + 0.9i
	let cr = 1;
	let ci = 0;
	for (let i = 0; i < n; i++) {
		re.push(cr);
		im.push(ci);
		const nr = cr * 0.4 - ci * 0.9;
		ci = cr * 0.9 + ci * 0.4;
		cr = nr;
	}
	const evalP = (zr: number, zi: number): [number, number] => {
		let rr = 1;
		let ri = 0;
		for (let k = 0; k < n; k++) {
			// (r)(z) + c[k]
			const nr = rr * zr - ri * zi + c[k];
			const ni = rr * zi + ri * zr;
			rr = nr;
			ri = ni;
		}
		return [rr, ri];
	};
	for (let iter = 0; iter < 500; iter++) {
		let move = 0;
		for (let i = 0; i < n; i++) {
			const [vr, vi] = evalP(re[i], im[i]);
			const mag = vr * vr + vi * vi;
			if (mag < 1e-300) continue;
			// z_i -= P(z_i) / Π_{j≠i} (z_i − z_j)
			let dr = 1;
			let di = 0;
			for (let j = 0; j < n; j++) {
				if (j === i) continue;
				const ar = re[i] - re[j];
				const ai = im[i] - im[j];
				const nr = dr * ar - di * ai;
				const ni = dr * ai + di * ar;
				dr = nr;
				di = ni;
			}
			const dd = dr * dr + di * di;
			if (dd < 1e-300) continue;
			const qr = (vr * dr + vi * di) / dd;
			const qi = (vi * dr - vr * di) / dd;
			re[i] -= qr;
			im[i] -= qi;
			move = Math.max(move, Math.hypot(qr, qi));
		}
		if (move < 1e-14) break;
	}
	const out: [number, number][] = [];
	for (let i = 0; i < n; i++) out.push([re[i], im[i]]);
	return out;
}

export interface GrangerTest {
	cause: string;
	target: string;
	f: number;
	df1: number;
	df2: number;
	p: number;
}

/** Block-exclusion F tests: does `cause`'s lags help predict `target`'s
 *  equation over and above all other lags? */
export function grangerTests(y: Mat, p: number, names: string[]): GrangerTest[] | null {
	const T = y.length;
	const K = y[0].length;
	const rows = T - p;
	const df2 = rows - K * p - 1;
	if (df2 <= 0) return null;
	const X: Mat = [];
	for (let t = p; t < T; t++) {
		const row: number[] = [1];
		for (let l = 1; l <= p; l++) for (let j = 0; j < K; j++) row.push(y[t - l][j]);
		X.push(row);
	}
	const out: GrangerTest[] = [];
	for (let tgt = 0; tgt < K; tgt++) {
		const yj: Vec = [];
		for (let t = p; t < T; t++) yj.push(y[t][tgt]);
		const full = fitWGLS(X, yj, null);
		if (!full) return null;
		for (let cause = 0; cause < K; cause++) {
			const cols: number[] = [];
			for (let c = 0; c < X[0].length; c++) {
				if (c === 0) { cols.push(c); continue; }
				const varIdx = (c - 1) % K;
				if (varIdx === cause) continue;
				cols.push(c);
			}
			const Xr = X.map((row) => cols.map((c) => row[c]));
			const rest = fitWGLS(Xr, yj, null);
			if (!rest) return null;
			const f = ((rest.sse - full.sse) / p) / (full.sse / df2);
			out.push({
				cause: names[cause],
				target: names[tgt],
				f,
				df1: p,
				df2,
				p: fSurvival(p, df2, Math.max(f, 0)),
			});
		}
	}
	return out;
}

/** Orthogonalised (Cholesky) impulse responses over `horizon` steps. The
 *  Cholesky factor is taken from the df-adjusted residual covariance — the
 *  Lütkepohl/statsmodels convention. */
export function irf(m: VarModel, horizon: number): Mat[] | null {
	const adj = (m.T / (m.T - m.K * m.p - 1));
	const sigmaAdj = m.sigmaU.map((row) => row.map((v) => v * adj));
	const P = cholesky(sigmaAdj);
	if (!P) return null;
	const { K, p } = m;
	// coefficient matrices A_l (K×K)
	const A: Mat[] = [];
	for (let l = 0; l < p; l++) {
		const Al = zeros(K, K);
		for (let j = 0; j < K; j++) for (let c = 0; c < K; c++) Al[j][c] = m.coef[j][1 + l * K + c];
		A.push(Al);
	}
	const out: Mat[] = [];
	// Φ_0 = I; Φ_h = Σ_{l=1..min(h,p)} Φ_{h−l}·A_l — every EARLIER Φ, not
	// just Φ_{h−1}, enters the recursion.
	const phis: Mat[] = [eye(K)];
	out.push(matMul(phis[0], P));
	for (let h = 1; h <= horizon; h++) {
		const next = zeros(K, K);
		for (let l = 1; l <= Math.min(h, p); l++) {
			const part = matMul(phis[h - l], A[l - 1]);
			for (let i = 0; i < K; i++) for (let j = 0; j < K; j++) next[i][j] += part[i][j];
		}
		phis.push(next);
		out.push(matMul(next, P));
	}
	return out;
}

/** h-step VAR forecasts. */
export function varForecast(m: VarModel, y: Mat, h: number): Mat {
	const { K, p } = m;
	const hist: Mat = y.map((row) => [...row]);
	const out: Mat = [];
	for (let s = 0; s < h; s++) {
		const t = hist.length;
		const row: Vec = new Array<number>(K).fill(0);
		for (let j = 0; j < K; j++) {
			let v = m.coef[j][0];
			for (let l = 1; l <= p; l++) for (let c = 0; c < K; c++) v += m.coef[j][1 + (l - 1) * K + c] * hist[t - l][c];
			row[j] = v;
		}
		hist.push(row);
		out.push(row);
	}
	return out;
}

export interface JohansenResult {
	/** squared canonical correlations, sorted descending, clipped to [0, 1) */
	lambda: Vec;
	/** trace statistics for r = 0 … K−1 */
	trace: Vec;
	/** max-eigenvalue statistics for r = 0 … K−1 */
	maxEig: Vec;
	/** cointegration vectors β (K×K), columns matching lambda */
	beta: Mat;
	T: number;
}

/** Johansen reduced-rank procedure: Δy and y_{−1} on lagged differences
 *  (plus a constant when `withConst`), then the generalised eigenproblem
 *  det(S₀₁ S₁₁⁻¹ S₁₀ − λ S₀₀) = 0 solved through a Cholesky of S₀₀ and a
 *  symmetric Jacobi eigen-decomposition. `withConst = false` matches the
 *  no-deterministic case (statsmodels' det_order = −1). Formal rank tests
 *  need the Osterwald-Lumenau/MacKinnon tables, which are NOT hardcoded
 *  here — the returned statistics are for comparison against a published
 *  table. */
export function johansen(y: Mat, p: number, withConst = true): JohansenResult | null {
	const T = y.length;
	const K = y[0].length;
	const laggedDiff = Math.max(1, p);
	const start = laggedDiff + 1;
	const rows = T - start;
	if (rows <= K * p + K + 2 || K < 2) return null;
	// aux design: [const?, Δy_{t−1} … Δy_{t−laggedDiff}]
	const Z: Mat = [];
	for (let t = start; t < T; t++) {
		const row: number[] = withConst ? [1] : [];
		for (let l = 1; l <= laggedDiff; l++) for (let j = 0; j < K; j++) row.push(y[t - l][j] - y[t - l - 1][j]);
		Z.push(row);
	}
	const dyT: Mat = [];
	const yLag: Mat = [];
	for (let t = start; t < T; t++) {
		const drow: number[] = [];
		const lrow: number[] = [];
		for (let j = 0; j < K; j++) {
			drow.push(y[t][j] - y[t - 1][j]);
			lrow.push(y[t - 1][j]);
		}
		dyT.push(drow);
		yLag.push(lrow);
	}
	// residual matrices R0 (Δy) and R1 (y_{−1})
	const R0: Mat = [];
	const R1: Mat = [];
	for (let j = 0; j < K; j++) {
		const m0 = fitWGLS(Z, dyT.map((r) => r[j]), null);
		const m1 = fitWGLS(Z, yLag.map((r) => r[j]), null);
		if (!m0 || !m1) return null;
		R0.push(m0.resid);
		R1.push(m1.resid);
	}
	const s00 = crossprodT(R0, rows);
	const s11 = crossprodT(R1, rows);
	const s01: Mat = zeros(K, K);
	for (let a = 0; a < K; a++) for (let b = 0; b < K; b++) {
		let s = 0;
		for (let i = 0; i < rows; i++) s += R0[a][i] * R1[b][i];
		s01[a][b] = s / rows;
	}
	const C = cholesky(s00);
	if (!C) return null;
	// M = C⁻¹ (S₀₁S₁₀' … ) — build S₀₁S₁₁⁻¹S₁₀ then sandwich with C⁻¹
	const s11Inv = solveInv(s11);
	if (!s11Inv) return null;
	const s10 = matTrans(s01); // S₁₀ = S₀₁'
	const prod = matMul(s01, matMul(s11Inv, s10)); // symmetric K×K
	// W = C⁻¹ · prod · C⁻¹'
	const Ci = solveMany(C, eye(K));
	if (!Ci) return null;
	const W = matMul(Ci, matMul(prod, matTrans(Ci)));
	const { values, vectors } = jacobiEigen(W);
	const order = values.map((v, i) => [Math.min(Math.max(v, 0), 0.999999), i] as [number, number])
		.sort((a, b) => b[0] - a[0]);
	const lambda: Vec = order.map((o) => o[0]);
	// β columns: v (Jacobi vector for W) → C⁻¹' v, normalised
	const beta: Mat = zeros(K, K);
	for (let r = 0; r < K; r++) {
		const src = order[r][1];
		const v: Vec = [];
		for (let i = 0; i < K; i++) v.push(vectors[i][src]);
		// β = C⁻¹' v = (C⁻¹)' v; solve C' β = v
		const bt = solve(matTrans(C), v);
		if (!bt) return null;
		const norm = Math.sqrt(bt.reduce((s, x) => s + x * x, 0)) || 1;
		for (let i = 0; i < K; i++) beta[i][r] = bt[i] / norm;
	}
	const trace: Vec = [];
	const maxEig: Vec = [];
	for (let r = 0; r < K; r++) {
		let acc = 0;
		for (let i = r; i < K; i++) acc += -rows * Math.log(1 - lambda[i]);
		trace.push(acc);
		maxEig.push(-rows * Math.log(1 - lambda[r]));
	}
	return { lambda, trace, maxEig, beta, T: rows };
}

/** (A·A')/n for row-stored observations A (K×rows). */
function crossprodT(A: Mat, n: number): Mat {
	const K = A.length;
	const out = zeros(K, K);
	for (let a = 0; a < K; a++) {
		for (let b = a; b < K; b++) {
			let s = 0;
			for (let i = 0; i < n; i++) s += A[a][i] * A[b][i];
			out[a][b] = out[b][a] = s / n;
		}
	}
	return out;
}

// ---------------------------------------------------------------------------
// 11. State space: local level / drift / stationary AR(1) + Kalman filter
// ---------------------------------------------------------------------------

export type KalmanSpec = 'level' | 'drift' | 'ar';

export interface KalmanModel {
	spec: KalmanSpec;
	phi: number;
	c: number;
	sigE: number;
	sigA: number;
	logLik: number;
	aic: number;
	bic: number;
	filtered: Vec;
	smooth: Vec;
	forecast: Vec;
	forecastSe: Vec;
	converged: boolean;
	T: number;
}

/** y_t = x_t + e_t, x_t = c + φ·x_{t−1} + a_t. 'level': φ=1, c=0;
 *  'drift': φ=1, c free; 'ar': |φ|<1 via tanh, c free. Variances are
 *  optimised in log space, the likelihood integrated exactly through the
 *  filter (prediction-error decomposition). */
export function kalmanFit(y: Vec, spec: KalmanSpec, horizon: number): KalmanModel | null {
	const T = y.length;
	if (T < 8 || horizon < 1 || horizon > 200) return null;
	const run = (theta: Vec): { ll: number; xF: Vec; xS: Vec; fc: Vec; fcSe: Vec } | null => {
		const sigE = Math.exp(Math.max(Math.min(theta[0], 20), -20));
		const sigA = Math.exp(Math.max(Math.min(theta[1], 20), -20));
		const phi = spec === 'ar' ? 0.9995 * Math.tanh(theta[2]) : 1;
		const c = spec === 'level' ? 0 : theta[spec === 'drift' ? 2 : 3];
		// diffuse-ish initialisation anchored on the first observation
		let x = y[0];
		let P = 10 * (sigA * sigA + sigE * sigE) + 1;
		let ll = -0.5 * (Math.log(2 * Math.PI * (P + sigE * sigE)));
		const xF: Vec = [];
		const xP: number[] = [];
		for (let t = 0; t < T; t++) {
			if (t > 0) {
				x = c + phi * x;
				P = phi * phi * P + sigA * sigA;
				const v = y[t] - x;
				const F = P + sigE * sigE;
				if (F <= 1e-300) return null;
				ll += -0.5 * (Math.log(2 * Math.PI * F) + (v * v) / F);
				const K = P / F;
				x += K * v;
				P *= 1 - K;
			}
			xF.push(x);
			xP.push(P);
		}
		// RTS smoother — needs (x_pred, P_pred) pairs; rebuild them by
		// re-running the stored recursion
		let xs = xF[T - 1];
		const xS: Vec = new Array<number>(T).fill(0);
		xS[T - 1] = xs;
		for (let t = T - 2; t >= 0; t--) {
			const pp = predAt({ x: xF[t], P: xP[t], phi, c, sigA });
			const J = (xP[t] * phi) / pp.P;
			xs = xF[t] + J * (xs - pp.x);
			xS[t] = xs;
		}
		// forecasts
		const fc: Vec = [];
		const fcSe: Vec = [];
		let fx = xF[T - 1];
		let fP = xP[T - 1];
		for (let s = 0; s < horizon; s++) {
			const pp = predAt2(fx, fP, phi, c, sigA);
			fc.push(pp.x);
			fcSe.push(Math.sqrt(Math.max(pp.P + sigE * sigE, 0)));
			fx = pp.x;
			fP = pp.P;
		}
		return { ll, xF, xS, fc, fcSe };
	};
	const predAt = (st: { x: number; P: number; phi: number; c: number; sigA: number }) => predAt2(st.x, st.P, st.phi, st.c, st.sigA);
	const predAt2 = (x: number, P: number, phi: number, c: number, sigA: number): { x: number; P: number } => ({ x: c + phi * x, P: phi * phi * P + sigA * sigA });
	const obj = (theta: Vec): number => {
		const r = run(theta);
		return r && Number.isFinite(r.ll) ? -r.ll : 1e12;
	};
	const dim = spec === 'level' ? 2 : spec === 'drift' ? 3 : 4;
	let theta: Vec;
	if (spec === 'level') theta = [0, 0];
	else if (spec === 'drift') theta = [0, 0, 0];
	else theta = [0, 0, 0, 0];
	// scale-aware starts: signal variance from first differences
	const dvar = (() => {
		const d: Vec = [];
		for (let t = 1; t < T; t++) d.push(y[t] - y[t - 1]);
		let mu = 0;
		for (const v of d) mu += v;
		mu /= d.length;
		let s = 0;
		for (const v of d) s += (v - mu) * (v - mu);
		return Math.max(s / d.length, 1e-12);
	})();
	theta[0] = 0.5 * Math.log(dvar);
	theta[1] = -1 * Math.log(10); // start with a quiet state process
	let best = nelderMead(theta, obj, { maxIter: 4000, tol: 1e-11 });
	best = nelderMead(best.x, obj, { maxIter: 4000, tol: 1e-12, step: best.x.map((v) => (v === 0 ? 0.05 : Math.abs(v) * 0.05)) });
	const r = run(best.x);
	if (!r) return null;
	const sigE = Math.exp(Math.max(Math.min(best.x[0], 20), -20));
	const sigA = Math.exp(Math.max(Math.min(best.x[1], 20), -20));
	const phi = spec === 'ar' ? 0.9995 * Math.tanh(best.x[2]) : 1;
	const c = spec === 'level' ? 0 : spec === 'drift' ? best.x[2] : best.x[3];
	const K = dim + (spec === 'ar' ? 2 : 1); // (σe, σa) + φ/c as estimated
	return {
		spec, phi, c, sigE, sigA,
		logLik: r.ll,
		aic: -2 * r.ll + 2 * K,
		bic: -2 * r.ll + K * Math.log(T),
		filtered: r.xF, smooth: r.xS, forecast: r.fc, forecastSe: r.fcSe,
		converged: best.converged, T,
	};
}

// ---------------------------------------------------------------------------
// 12. Deterministic optimiser + quantile regression + mixed effects
// ---------------------------------------------------------------------------

export interface NmResult {
	x: Vec;
	fx: number;
	iter: number;
	converged: boolean;
}

/** Nelder–Mead simplex, fixed reflection/expansion/contraction/shrink
 *  coefficients and a deterministic 5%-of-start step. Non-finite objective
 *  values are clamped so a wild candidate cannot poison the simplex. */
export function nelderMead(start: Vec, f: (x: Vec) => number, opts?: { maxIter?: number; tol?: number; step?: Vec }): NmResult {
	const n = start.length;
	const maxIter = opts?.maxIter ?? 3000;
	const tol = opts?.tol ?? 1e-10;
	const step = opts?.step ?? start.map((v) => (v === 0 ? 0.1 : Math.max(Math.abs(v) * 0.05, 1e-4)));
	const safe = (x: Vec): number => {
		const v = f(x);
		return Number.isFinite(v) ? v : 1e300;
	};
	const pts: Vec[] = [start.slice()];
	for (let i = 0; i < n; i++) {
		const p = start.slice();
		p[i] += step[i];
		pts.push(p);
	}
	let vals = pts.map(safe);
	const sortAll = (): void => {
		const idx = vals.map((v, i) => [v, i] as [number, number]).sort((a, b) => a[0] - b[0]);
		const np: Vec[] = [];
		const nv: Vec = [];
		for (const [, i] of idx) { np.push(pts[i]); nv.push(vals[i]); }
		for (let i = 0; i <= n; i++) { pts[i] = np[i]; vals[i] = nv[i]; }
	};
	sortAll();
	let converged = false;
	let iter = 0;
	for (iter = 1; iter <= maxIter; iter++) {
		if (Math.abs(vals[n] - vals[0]) < tol * (1 + Math.abs(vals[0]))) { converged = true; break; }
		const c: Vec = new Array<number>(n).fill(0);
		for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) c[j] += pts[i][j] / n;
		const refl = c.map((cv, j) => cv + (cv - pts[n][j]));
		const fr = safe(refl);
		if (fr < vals[0]) {
			const exp = c.map((cv, j) => cv + 2 * (cv - pts[n][j]));
			const fe = safe(exp);
			if (fe < fr) { pts[n] = exp; vals[n] = fe; }
			else { pts[n] = refl; vals[n] = fr; }
		} else if (fr < vals[n - 1]) {
			pts[n] = refl;
			vals[n] = fr;
		} else {
			const con = c.map((cv, j) => cv + 0.5 * (pts[n][j] - cv));
			const fc = safe(con);
			if (fc < vals[n]) { pts[n] = con; vals[n] = fc; }
			else {
				for (let i = 1; i <= n; i++) {
					for (let j = 0; j < n; j++) pts[i][j] = pts[0][j] + 0.5 * (pts[i][j] - pts[0][j]);
					vals[i] = safe(pts[i]);
				}
			}
		}
		sortAll();
	}
	return { x: pts[0].slice(), fx: vals[0], iter, converged };
}

export interface RqModel {
	n: number;
	k: number;
	tau: number;
	beta: Vec;
	resid: Vec;
	/** 1 − ρ_τ(e)/ρ_τ(y − Q_τ(y)), Koenker–Machado's local fit measure */
	pseudoR2: number;
	iter: number;
	converged: boolean;
}

const checkLoss = (e: number, tau: number): number => (e >= 0 ? tau * e : (tau - 1) * e);

/** Quantile regression by iteratively reweighted least squares with an
 *  annealed threshold (Schlossmacher's scheme): each round solves the
 *  weighted LS problem for w_i = |τ − 1(e_i<0)|/max(|e_i|, δ) with δ shrinking
 *  tenfold, so the solution converges to the exact check-loss minimiser for
 *  well-behaved data. */
export function rqFit(x: Mat, y: Vec, tau: number, names?: string[]): RqModel | null {
	const n = x.length;
	const k = x[0].length;
	if (n <= k || tau <= 0 || tau >= 1) return null;
	const sortedY = [...y].sort((a, b) => a - b);
	const scale = Math.max(
		Math.abs(sortedY[Math.floor(n * 0.75)] - sortedY[Math.floor(n * 0.25)]),
		Math.abs(sortedY[n - 1] - sortedY[0]) * 1e-6,
		1e-12,
	);
	let beta: Vec | null = null;
	let resid: Vec = [];
	let iter = 0;
	let converged = false;
	let delta = 0.01 * scale;
	for (let round = 0; round < 12 && !converged; round++) {
		for (let it = 0; it < 60; it++) {
			iter++;
			const e: Vec = beta
				? y.map((v, i) => v - x[i].reduce((s, xv, t) => s + xv * beta![t], 0))
				: [...y];
			const w: Vec = e.map((v) => (v < 0 ? 1 - tau : tau) / Math.max(Math.abs(v), delta));
			const m = fitWGLS(x, y, vinvDiag(w), names);
			if (!m) return null;
			const dmax = beta ? Math.max(...m.beta.map((v, t) => Math.abs(v - beta![t]))) : Infinity;
			beta = m.beta;
			resid = m.resid;
			if (dmax < 1e-11) break;
		}
		if (delta <= 1e-13 * scale) { converged = true; break; }
		delta *= 0.1;
	}
	if (!beta) return null;
	// Koenker–Machado pseudo-R²
	const qtau = sortedY[Math.min(Math.max(Math.floor(tau * n), 0), n - 1)];
	let lossModel = 0;
	let lossNull = 0;
	for (let i = 0; i < n; i++) {
		lossModel += Math.abs(checkLoss(resid[i], tau));
		lossNull += Math.abs(checkLoss(y[i] - qtau, tau));
	}
	return {
		n, k, tau, beta, resid,
		pseudoR2: lossNull > 0 ? Math.max(0, 1 - lossModel / lossNull) : 0,
		iter, converged,
	};
}

export interface LmmModel {
	n: number;
	k: number;
	names: string[];
	beta: Vec;
	se: Vec;
	tstat: Vec;
	pval: Vec;
	df: number;
	sigmaU0: number;
	sigmaU1: number;
	rho: number;
	sigmaE: number;
	icc: number;
	logLik: number;
	aic: number;
	bic: number;
	groupCount: number;
	converged: boolean;
	/** per-group random intercept BLUPs, aligned with sorted group codes */
	blup: { code: number; size: number; intercept: number; slope: number }[];
}

/** Linear mixed model with random intercept (and optionally a random slope
 *  on column `slopeCol`, 1-based among the non-constant columns) across
 *  `groups`, fitted by maximum profile likelihood: the variance components
 *  are optimised with Nelder–Mead over (ln σ0, [ln σ1, atanh ρ], ln σe) and
 *  the fixed effects are the GLS solution at each candidate. Group-specific
 *  blocks are inverted through the 2×2 Woodbury identity, so cost is linear
 *  in the number of groups. */
export function lmmFit(x: Mat, y: Vec, groups: Vec, slopeCol: number | null, names?: string[]): LmmModel | null {
	const n = x.length;
	const k = x[0].length;
	if (n <= k || groups.length !== n) return null;
	const codes = Array.from(new Set(groups)).sort((a, b) => a - b);
	const G = codes.length;
	if (G < 2 || G >= n) return null;
	const codeIdx = new Map<number, number>(codes.map((c, i) => [c, i] as [number, number]));
	const members: number[][] = codes.map(() => []);
	for (let i = 0; i < n; i++) members[codeIdx.get(groups[i])!].push(i);
	// random-slope covariate values (z_i) per observation
	const zOf: Vec = slopeCol === null
		? new Array<number>(n).fill(1)
		: x.map((row) => row[Math.min(Math.max(slopeCol, 1), k - 1)]);
	const hasSlope = slopeCol !== null;
	const q = hasSlope ? 2 : 1;
	const logLikOf = (theta: Vec): { ll: number; m: OlsModel | null; vinv: Mat } => {
		const s0 = Math.exp(Math.max(Math.min(theta[0], 12), -12));
		const se = Math.exp(Math.max(Math.min(theta[1], 12), -12));
		let s1 = 0;
		let rho = 0;
		if (hasSlope) {
			s1 = Math.exp(Math.max(Math.min(theta[2], 12), -12));
			rho = 0.995 * Math.tanh(theta[3]);
		}
		// G matrix (q×q)
		const Gm = hasSlope
			? [[s0 * s0, rho * s0 * s1], [rho * s0 * s1, s1 * s1]]
			: [[s0 * s0]];
		const Gdet = hasSlope ? Gm[0][0] * Gm[1][1] - Gm[0][1] * Gm[1][0] : Gm[0][0];
		if (Gdet <= 1e-300) return { ll: -Infinity, m: null, vinv: [] };
		// G⁻¹
		const Gi = hasSlope
			? [[Gm[1][1] / Gdet, -Gm[0][1] / Gdet], [-Gm[0][1] / Gdet, Gm[0][0] / Gdet]]
			: [[1 / Gdet]];
		const vinv = zeros(n, n);
		let logDetV = 0;
		for (let g = 0; g < G; g++) {
			const idx = members[g];
			const ng = idx.length;
			// Z_g'Z_g (q×q) and G⁻¹σe² + Z'Z
			const ztz = zeros(q, q);
			for (let a = 0; a < q; a++) for (let b = a; b < q; b++) {
				let s = 0;
				for (const i of idx) s += (a === 0 ? 1 : zOf[i]) * (b === 0 ? 1 : zOf[i]);
				ztz[a][b] = ztz[b][a] = s;
			}
			const B = zeros(q, q);
			for (let a = 0; a < q; a++) for (let b = 0; b < q; b++) B[a][b] = Gi[a][b] * se * se + ztz[a][b];
			const Bdet = q === 1 ? B[0][0] : B[0][0] * B[1][1] - B[0][1] * B[1][0];
			if (Math.abs(Bdet) < 1e-300) return { ll: -Infinity, m: null, vinv: [] };
			const Bi = q === 1
				? [[1 / B[0][0]]]
				: [[B[1][1] / Bdet, -B[0][1] / Bdet], [-B[0][1] / Bdet, B[0][0] / Bdet]];
			logDetV += (ng - q) * Math.log(se * se) + Math.log(Gdet) + Math.log(Math.abs(Bdet));
			// V_g⁻¹ = (1/σe²)(I − Z Bi Z')
			for (let ai = 0; ai < ng; ai++) {
				const i = idx[ai];
				for (let bi = 0; bi < ng; bi++) {
					const j = idx[bi];
					let zBz = 0;
					for (let a = 0; a < q; a++) {
						const za = a === 0 ? 1 : zOf[i];
						for (let b = 0; b < q; b++) zBz += za * Bi[a][b] * (b === 0 ? 1 : zOf[j]);
					}
					vinv[i][j] = ((i === j ? 1 : 0) - zBz) / (se * se);
				}
			}
		}
		const m = fitWGLS(x, y, vinv, names);
		if (!m) return { ll: -Infinity, m: null, vinv: [] };
		const ll = -0.5 * (n * Math.log(2 * Math.PI) + logDetV + m.sse);
		return { ll, m, vinv };
	};
	const obj = (theta: Vec): number => {
		const r = logLikOf(theta);
		return Number.isFinite(r.ll) ? -r.ll : 1e12;
	};
	// starts: OLS residual variance split between the arms
	const ols = fitWGLS(x, y, null);
	if (!ols) return null;
	const s2 = Math.max(ols.sse / (n - k), 1e-12);
	let theta: Vec = hasSlope
		? [0.5 * Math.log(s2), 0.5 * Math.log(s2), 0.5 * Math.log(s2), 0]
		: [0.5 * Math.log(s2), 0.5 * Math.log(s2)];
	let best = nelderMead(theta, obj, { maxIter: 4000, tol: 1e-10 });
	best = nelderMead(best.x, obj, { maxIter: 4000, tol: 1e-11, step: best.x.map((v) => (v === 0 ? 0.05 : Math.abs(v) * 0.05)) });
	const r = logLikOf(best.x);
	const m = r.m;
	if (!m) return null;
	const s0 = Math.exp(best.x[0]);
	const se = Math.exp(best.x[1]);
	const s1 = hasSlope ? Math.exp(best.x[2]) : 0;
	const rho = hasSlope ? 0.995 * Math.tanh(best.x[3]) : 0;
	// BLUPs: u_g = G Z_g' V_g⁻¹ (y_g − X_g β̂)
	const blup: { code: number; size: number; intercept: number; slope: number }[] = [];
	for (let g = 0; g < G; g++) {
		const idx = members[g];
		const rvec: Vec = idx.map((i) => m.resid[i]);
		const vr: Vec = idx.map((_, ai) => idx.reduce((s, j, bi) => s + r.vinv[idx[ai]][j] * rvec[bi], 0));
		let z1 = 0;
		let z2 = 0;
		for (let ai = 0; ai < idx.length; ai++) {
			const z = hasSlope ? zOf[idx[ai]] : 1;
			z1 += vr[ai];
			z2 += vr[ai] * z;
		}
		if (hasSlope) {
			const Gm = GmOf(s0, s1, rho);
			blup.push({
				code: codes[g],
				size: idx.length,
				intercept: Gm[0][0] * z1 + Gm[0][1] * z2,
				slope: Gm[1][0] * z1 + Gm[1][1] * z2,
			});
		} else {
			blup.push({ code: codes[g], size: idx.length, intercept: s0 * s0 * z1, slope: 0 });
		}
	}
	const paramCount = k + q * (q + 1) / 2 + 1;
	const df = Math.max(n - k - G, 1);
	return {
		n, k, names: m.names, beta: m.beta,
		se: m.beta.map((_, t) => Math.sqrt(Math.max(m.bread[t][t], 0))),
		tstat: m.tstat, pval: m.tstat.map((tv) => 2 * tSurvival(df, Math.abs(tv))),
		df,
		sigmaU0: s0, sigmaU1: s1, rho, sigmaE: se,
		icc: (s0 * s0) / (s0 * s0 + se * se),
		logLik: r.ll,
		aic: -2 * r.ll + 2 * paramCount,
		bic: -2 * r.ll + paramCount * Math.log(n),
		groupCount: G,
		converged: best.converged,
		blup,
	};
}

function GmOf(s0: number, s1: number, rho: number): number[][] {
	return [[s0 * s0, rho * s0 * s1], [rho * s0 * s1, s1 * s1]];
}
