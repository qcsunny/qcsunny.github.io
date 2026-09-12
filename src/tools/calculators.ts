// Registry entries for /calculators/* (form tools + redirects).
// The scientific calculator and grapher live on static pages instead.

import type { FormConfig, ToolEntry } from './registry';
import { compile, formatNumber } from '../scripts/calculator/engine';
import { computeStats, parseNumbers } from './stats';
import * as eco from './econometrics';

const pct = (v: number): string => `${formatNumber(v)}%`;

// ln Γ(z), Lanczos approximation (g=7) — binomial/Poisson probabilities are
// computed in log space so C(10000, 5000) neither overflows nor underflows.
const LG_C = [
	0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
	-176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
	1.5056327351493116e-7,
];
function lgamma(z: number): number {
	if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgamma(1 - z);
	z -= 1;
	let x = LG_C[0] as number;
	for (let i = 1; i < 9; i++) x += LG_C[i] as number / (z + i);
	const t = z + 7.5;
	return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

// Gauss–Legendre quadrature nodes/weights (10- and 20-point), generated via
// Newton iteration on the Legendre polynomials; sum(weights) = 2 verified.
const GL10_N: readonly number[] = [-0.97390652851717174, -0.86506336668898454, -0.67940956829902444, -0.43339539412924716, -0.14887433898163122, 0.14887433898163122, 0.43339539412924716, 0.67940956829902444, 0.86506336668898454, 0.97390652851717174];
const GL10_W: readonly number[] = [0.066671344308688027, 0.14945134915058053, 0.21908636251598207, 0.26926671930999624, 0.29552422471475293, 0.29552422471475293, 0.26926671930999624, 0.21908636251598207, 0.14945134915058053, 0.066671344308688027];
const GL20_N: readonly number[] = [-0.99312859918509488, -0.96397192727791381, -0.91223442825132595, -0.83911697182221889, -0.7463319064601508, -0.63605368072651502, -0.51086700195082713, -0.37370608871541955, -0.2277858511416451, -0.076526521133497338, 0.076526521133497338, 0.2277858511416451, 0.37370608871541955, 0.51086700195082713, 0.63605368072651502, 0.7463319064601508, 0.83911697182221889, 0.91223442825132595, 0.96397192727791381, 0.99312859918509488];
const GL20_W: readonly number[] = [0.017614007139152264, 0.04060142980038705, 0.06267204833410904, 0.083276741576704741, 0.10193011981724048, 0.11819453196151831, 0.1316886384491765, 0.14209610931838215, 0.14917298647260377, 0.15275338713072598, 0.15275338713072598, 0.14917298647260377, 0.14209610931838215, 0.1316886384491765, 0.11819453196151831, 0.10193011981724048, 0.083276741576704741, 0.06267204833410904, 0.04060142980038705, 0.017614007139152264];

/** Composite Gauss–Legendre: `panels` subintervals × `nodes`-point rule per
 *  panel. 20-point × 50 panels (1000 evaluations) is exact to ~1e-15 for any
 *  integrand that is 39-times differentiable — where Simpson's same-budget
 *  error sits near 1e-11. */
function glQuadrature(f: (x: number) => number, a: number, b: number, panels: number, nodes: readonly number[], weights: readonly number[]): number {
	const h = (b - a) / panels;
	let total = 0;
	for (let p = 0; p < panels; p++) {
		const mid = a + (p + 0.5) * h;
		const half = h / 2;
		for (let k = 0; k < nodes.length; k++) total += (weights[k] as number) * f(mid + (half * (nodes[k] as number)));
	}
	return total * (h / 2);
}

/** Solve A·x = b by Gaussian elimination with partial pivoting. Singular (or
 *  numerically near-singular) systems return null — repeated x values in a
 *  regression, typically. */
function gaussSolve(A: number[][], b: number[]): number[] | null {
	const n = b.length;
	const M = A.map((row, i) => [...row, b[i] as number]);
	let maxNorm = 0;
	for (let r = 0; r < n; r++) {
		for (let c = 0; c < n; c++) {
			maxNorm = Math.max(maxNorm, Math.abs(A[r]![c]!));
		}
	}
	const eps = Math.max(1e-12, maxNorm * 1e-13);

	for (let col = 0; col < n; col++) {
		let piv = col;
		for (let r = col + 1; r < n; r++) if (Math.abs(M[r]![col]!) > Math.abs(M[piv]![col]!)) piv = r;
		if (Math.abs(M[piv]![col]!) < eps) return null;
		[M[col], M[piv]] = [M[piv]!, M[col]!];
		for (let r = col + 1; r < n; r++) {
			const f = M[r]![col]! / M[col]![col]!;
			for (let c = col; c <= n; c++) M[r]![c] = M[r]![c]! - f * M[col]![c]!;
		}
	}
	const x = new Array<number>(n).fill(0);
	for (let r = n - 1; r >= 0; r--) {
		let s = M[r]![n] as number;
		for (let c = r + 1; c < n; c++) s -= M[r]![c]! * x[c]!;
		x[r] = s / M[r]![r]!;
	}
	return x;
}

// --- prime factorization (Miller–Rabin + Pollard rho) ------------------------
// The mainstream route for a whole number up to 2^64−1: strip small primes by
// trial division, then finish the remainder with deterministic Miller–Rabin and
// Pollard's rho in BigInt. Trial-dividing every integer up to √n — the original
// code — took ~3.4 s on a prime near 2^53; rho is ~n^¼ steps (~10⁴), so the
// same input returns in milliseconds. Everything above the small-prime prefix
// runs in BigInt: rho's (a·a) mod n would overflow a Number, and the input
// itself stops being exact past 2^53.
const MR_BASES = [2n, 325n, 9375n, 28178n, 450775n, 9780504n, 1795265022n];

function modPow(b: bigint, e: bigint, m: bigint): bigint {
	let r = 1n;
	b %= m;
	while (e > 0n) {
		if (e & 1n) r = (r * b) % m;
		b = (b * b) % m;
		e >>= 1n;
	}
	return r;
}

/** Deterministic below 2^64 (covers every n this tool accepts, n ≤ 2^64−1). */
function isPrime(n: bigint): boolean {
	if (n < 2n) return false;
	for (const p of [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n]) {
		if (n % p === 0n) return n === p;
	}
	let d = n - 1n;
	let s = 0n;
	while (d % 2n === 0n) {
		d /= 2n;
		s++;
	}
	for (const a of MR_BASES) {
		if (a % n === 0n) continue;
		let x = modPow(a, d, n);
		if (x === 1n || x === n - 1n) continue;
		let composite = true;
		for (let r = 0n; r < s; r++) {
			x = (x * x) % n;
			if (x === n - 1n) {
				composite = false;
				break;
			}
		}
		if (composite) return false;
	}
	return true;
}

function bigGcd(a: bigint, b: bigint): bigint {
	while (b !== 0n) {
		const t = b;
		b = a % b;
		a = t;
	}
	return a;
}

function pollardRho(n: bigint): bigint {
	if ((n & 1n) === 0n) return 2n;
	if (n % 3n === 0n) return 3n;
	// Brent's cycle detection + batch GCD. Powers of 2 steps with batch GCD
	// save ~25% steps vs Floyd and drop GCD calls by >95%. Retries with c+1 if
	// the batch collapses onto n or step limit is reached.
	for (let c = 1n; c <= 100n; c++) {
		const f = (z: bigint): bigint => (z * z + c) % n;
		let y = 2n;
		let d = 1n;
		const m = 128; // batch size for GCD
		let r = 1;

		while (d === 1n) {
			if (r > 65536) break; // Retry with next seed c if cycle search exceeds bound
			const x = y;
			let k = 0;
			while (k < r && d === 1n) {
				const ys = y;
				let q = 1n;
				const limit = Math.min(m, r - k);
				for (let i = 0; i < limit; i++) {
					y = f(y);
					const diff = x > y ? x - y : y - x;
					q = (q * diff) % n;
				}
				d = bigGcd(q, n);
				k += limit;
				// If a factor is hit, backtrack through this batch step-by-step
				if (d > 1n) {
					y = ys;
					d = 1n;
					while (d === 1n) {
						y = f(y);
						const diff = x > y ? x - y : y - x;
						d = bigGcd(diff, n);
					}
					if (d !== n) return d;
					break; // collapsed onto n, retry with next c
				}
			}
			r <<= 1;
		}
		if (d !== n && d > 1n) return d;
	}
	return n;
}

/** n is composite here — callers run isPrime first. Collects n's prime factors. */
function factorBig(n: bigint, out: bigint[]): void {
	if (n === 1n) return;
	if (isPrime(n)) {
		out.push(n);
		return;
	}
	const d = pollardRho(n);
	factorBig(d, out);
	factorBig(n / d, out);
}

// Small primes for the cheap first pass. Pure trial division would walk every
// prime up to √n (~9.5×10⁷ at 2^53) — the code never does that. This short
// baked table only peels the ubiquitous small factors; the remainder is
// finished by Miller–Rabin + Pollard rho, which splits even a leftover with a
// mid-size factor in ~√p steps. A literal up to 1000 keeps the table ~1 KB and
// costs no runtime sieve on tool pages that never factorize.
const SMALL_PRIMES: bigint[] = [
	2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n, 41n, 43n,
	47n, 53n, 59n, 61n, 67n, 71n, 73n, 79n, 83n, 89n, 97n, 101n, 103n, 107n,
	109n, 113n, 127n, 131n, 137n, 139n, 149n, 151n, 157n, 163n, 167n, 173n, 179n, 181n,
	191n, 193n, 197n, 199n, 211n, 223n, 227n, 229n, 233n, 239n, 241n, 251n, 257n, 263n,
	269n, 271n, 277n, 281n, 283n, 293n, 307n, 311n, 313n, 317n, 331n, 337n, 347n, 349n,
	353n, 359n, 367n, 373n, 379n, 383n, 389n, 397n, 401n, 409n, 419n, 421n, 431n, 433n,
	439n, 443n, 449n, 457n, 461n, 463n, 467n, 479n, 487n, 491n, 499n, 503n, 509n, 521n,
	523n, 541n, 547n, 557n, 563n, 569n, 571n, 577n, 587n, 593n, 599n, 601n, 607n, 613n,
	617n, 619n, 631n, 641n, 643n, 647n, 653n, 659n, 661n, 673n, 677n, 683n, 691n, 701n,
	709n, 719n, 727n, 733n, 739n, 743n, 751n, 757n, 761n, 769n, 773n, 787n, 797n, 809n,
	811n, 821n, 823n, 827n, 829n, 839n, 853n, 857n, 859n, 863n, 877n, 881n, 883n, 887n,
	907n, 911n, 919n, 929n, 937n, 941n, 947n, 953n, 967n, 971n, 977n, 983n, 991n, 997n,
];

/** Factor a whole number 2..2^64−1 exactly. Returns ascending prime factors
 *  with exponents and τ(n) = Π(eᵢ+1). Everything stays in BigInt after the
 *  input parse, so a factor above 2^53 is never rounded through a Number. */
function factorWhole(n: bigint): { factors: Array<{ f: bigint; e: number }>; divisors: number } {
	if (isPrime(n)) {
		return { factors: [{ f: n, e: 1 }], divisors: 2 };
	}
	const byFactor = new Map<string, number>();
	let rest = n;

	// Bitwise trailing zero peel for factor 2 (shifts instead of BigInt division)
	if ((rest & 1n) === 0n) {
		let c = 0;
		do {
			rest >>= 1n;
			c++;
		} while ((rest & 1n) === 0n);
		byFactor.set('2', c);
	}

	for (const p of SMALL_PRIMES) {
		if (p === 2n) continue;
		if (p * p > rest) break;
		if (rest % p === 0n) {
			let c = 0;
			do {
				rest /= p;
				c++;
			} while (rest % p === 0n);
			byFactor.set(p.toString(), c);
		}
	}
	if (rest > 1n) {
		const bigs: bigint[] = [];
		factorBig(rest, bigs);
		for (const q of bigs) {
			const k = q.toString();
			byFactor.set(k, (byFactor.get(k) ?? 0) + 1);
		}
	}
	const factors = [...byFactor.entries()]
		.map(([k, e]) => ({ f: BigInt(k), e }))
		.sort((a, b) => (a.f < b.f ? -1 : a.f > b.f ? 1 : 0));
	let divisors = 1;
	for (const { e } of factors) divisors *= e + 1;
	return { factors, divisors };
}

// --- percentage -----------------------------------------------------------------

const percentage: FormConfig = {
	intro: 'Answers update as you type.',
	introZh: '输入数值即刻实时计算得出结果。',
	fields: [
		{ id: 'p', label: 'Percent', labelZh: '百分比 (P)', suffix: '(%)', type: 'number', def: '15', step: 'any', required: true },
		{ id: 'v', label: 'Of value', labelZh: '数值 (V)', type: 'number', def: '200', step: 'any', required: true },
		{ id: 'n', label: 'Number', labelZh: '对比数值 (N)', type: 'number', def: '30', step: 'any' },
	],
	compute: (v) => {
		const p = v.num('p');
		const val = v.num('v');
		const n = v.num('n');
		return {
			rows: [
				{
					label: `${v.str('p')}% of ${v.str('v')}`,
					labelZh: `${v.str('v')} 的 ${v.str('p')}%`,
					value: formatNumber((p / 100) * val),
					emphasis: true,
				},
				{
					label: `${v.str('n')} is what % of ${v.str('v')}`,
					labelZh: `${v.str('n')} 占 ${v.str('v')} 的百分比`,
					value: val === 0 ? '—' : pct((n / val) * 100),
				},
				{
					label: `${v.str('v')} increased by ${v.str('p')}%`,
					labelZh: `${v.str('v')} 增加 ${v.str('p')}% 后`,
					value: formatNumber(val * (1 + p / 100)),
				},
				{
					label: `${v.str('v')} decreased by ${v.str('p')}%`,
					labelZh: `${v.str('v')} 减少 ${v.str('p')}% 后`,
					value: formatNumber(val * (1 - p / 100)),
				},
			],
		};
	},
};

// --- percentage increase ----------------------------------------------------------

const percentageIncrease: FormConfig = {
	intro: 'Measure relative change between two numbers.',
	introZh: '衡量两个数值之间的相对增减变化与变化倍数。',
	fields: [
		{ id: 'from', label: 'From (initial value)', labelZh: '初始值 (变化前)', type: 'number', def: '100', step: 'any', required: true },
		{ id: 'to', label: 'To (final value)', labelZh: '最终值 (变化后)', type: 'number', def: '125', step: 'any', required: true },
	],
	compute: (v) => {
		const from = v.num('from');
		const to = v.num('to');
		const change = to - from;
		const pctChange = from === 0 ? Number.NaN : (change / Math.abs(from)) * 100;
		return {
			rows: [
				{
					label: 'Percentage change',
					labelZh: '变化百分比',
					value: from === 0 ? '— (initial value is 0)' : pct(pctChange),
					valueZh: from === 0 ? '— (初始值为 0，无法计算)' : undefined,
					emphasis: true,
				},
				{ label: 'Absolute change', labelZh: '绝对变化量', value: `${change >= 0 ? '+' : ''}${formatNumber(change)}` },
				{ label: 'Multiplier (to ÷ from)', labelZh: '变化倍数 (最终值 ÷ 初始值)', value: from === 0 ? '—' : formatNumber(to / from) },
			],
			note:
				from === 0
					? undefined
					: change >= 0
						? `An increase of ${formatNumber(change)}.`
						: `A decrease of ${formatNumber(-change)} (negative growth).`,
			noteZh:
				from === 0
					? undefined
					: change >= 0
						? `增加了 ${formatNumber(change)}。`
						: `减少了 ${formatNumber(-change)}（负增长）。`,
		};
	},
};

// --- fraction ---------------------------------------------------------------------

function gcd(a: number, b: number): number {
	a = Math.abs(a);
	b = Math.abs(b);
	while (b > 0) [a, b] = [b, a % b];
	return a;
}

/** Decimal → fraction via continued fractions; null when no exact match within maxDenom. */
function decimalToFraction(x: number, maxDenom = 10000): { num: number; den: number } | null {
	const sign = x < 0 ? -1 : 1;
	x = Math.abs(x);
	let h1 = 1,
		h0 = 0,
		k1 = 0,
		k0 = 1,
		b = x;
	for (let i = 0; i < 32; i++) {
		const a = Math.floor(b);
		[h0, h1] = [h1, a * h1 + h0];
		[k0, k1] = [k1, a * k1 + k0];
		if (k1 > maxDenom) break;
		if (Math.abs(x - h1 / k1) < 1e-12) return { num: sign * h1, den: k1 };
		const frac = b - a;
		if (frac < 1e-12) return k1 <= maxDenom ? { num: sign * h1, den: k1 } : null;
		b = 1 / frac;
	}
	return k1 <= maxDenom && Math.abs(x - h1 / k1) < 1e-9 ? { num: sign * h1, den: k1 } : null;
}

const fraction: FormConfig = {
	intro: 'Top: simplify a fraction and see it as a decimal. Bottom: convert a decimal back to an exact fraction.',
	introZh: '上方将分数约分为最简形式和小数；下方将任意小数还原为精确连分数。',
	fields: [
		{ id: 'a', label: 'Fraction numerator a', labelZh: '分子 a', type: 'number', def: '24', step: 'any' },
		{ id: 'b', label: 'Fraction denominator b', labelZh: '分母 b', type: 'number', def: '36', step: 'any' },
		{ id: 'd', label: 'Decimal to convert', labelZh: '待转换小数', type: 'number', def: '0.375', step: 'any' },
	],
	compute: (v) => {
		const rows: import('./registry').FormResultRow[] = [];
		const a = v.num('a');
		const b = v.num('b');
		if (Number.isFinite(a) && Number.isFinite(b) && b !== 0) {
			const g = gcd(a, b) || 1;
			rows.push({ label: `a/b simplified`, labelZh: 'a/b 最简分数', value: `${a / g} / ${b / g}`, emphasis: true });
			rows.push({ label: 'a/b as decimal', labelZh: '对应小数值', value: formatNumber(a / b) });
			rows.push({ label: 'a/b as percent', labelZh: '对应百分比', value: pct((a / b) * 100) });
		} else if (Number.isFinite(b) && b === 0) {
			rows.push({
				label: 'a/b simplified',
				labelZh: 'a/b 最简分数',
				value: '— (denominator cannot be 0)',
				valueZh: '— (分母不能为 0)',
			});
		}
		const d = v.num('d');
		if (Number.isFinite(d)) {
			const f = decimalToFraction(d);
			rows.push({
				label: 'Decimal as fraction',
				labelZh: '小数还原最简分数',
				value: f ? `${f.num} / ${f.den}` : 'no exact fraction with a denominator ≤ 10000',
				valueZh: f ? undefined : '未找到分母 ≤ 10000 的精确分数',
				emphasis: true,
			});
		}
		return { rows };
	},
};

// --- ratio -------------------------------------------------------------------------

const ratio: FormConfig = {
	intro: 'Simplifies A:B, solves A:B = C:x, and shows A/B as decimal and percent.',
	introZh: '化简 A:B 为最简整数比，求解 A:B = C:x 比例方程，并显示小数与百分比。',
	fields: [
		{ id: 'a', label: 'A', labelZh: '前项 A', type: 'number', def: '16', step: 'any', required: true },
		{ id: 'b', label: 'B', labelZh: '后项 B', type: 'number', def: '24', step: 'any', required: true },
		{ id: 'c', label: 'C (scale A to C)', labelZh: '缩放基准 C', type: 'number', def: '40', step: 'any' },
	],
	compute: (v) => {
		const a = v.num('a');
		const b = v.num('b');
		const c = v.num('c');
		const rows: import('./registry').FormResultRow[] = [];
		if (a === 0 && b === 0) {
			rows.push({ label: 'A:B simplified', labelZh: 'A:B 最简整数比', value: '— (both zero)', valueZh: '— (A、B 不能同时为 0)' });
		} else {
			const g = gcd(a, b) || 1;
			rows.push({ label: 'A:B simplified', labelZh: 'A:B 最简整数比', value: `${a / g} : ${b / g}`, emphasis: true });
			rows.push({
				label: 'A ÷ B',
				labelZh: 'A ÷ B 的商',
				value: b === 0 ? '— (division by 0)' : formatNumber(a / b),
				valueZh: b === 0 ? '— (除数不能为 0)' : undefined,
			});
			rows.push({ label: 'A ÷ B as percent', labelZh: 'A ÷ B 的百分比', value: b === 0 ? '—' : pct((a / b) * 100) });
			if (a !== 0 && Number.isFinite(c)) {
				const x = (b * c) / a;
				rows.push({ label: `A:B = C:x → x`, labelZh: '解 A:B = C:x 得 x', value: formatNumber(x) });
			}
		}
		return { rows };
	},
};


// --- pi calculator (Machin-like formula with BigInt arbitrary precision) --------
const PI_CACHE = new Map<number, string>();

function computePiMachin(digits: number): string {
	const cached = PI_CACHE.get(digits);
	if (cached !== undefined) return cached;

	const extra = 10;
	const totalDigits = digits + extra;
	const unity = 10n ** BigInt(totalDigits);

	function arccot(xVal: number, u: bigint): bigint {
		const x = BigInt(xVal);
		const xSq = x * x;
		let sum = u / x;
		let xpower = sum;
		let n = 3n;
		let sign = -1n;
		while (true) {
			xpower = xpower / xSq;
			const term = xpower / n;
			if (term === 0n) break;
			sum += sign * term;
			sign = -sign;
			n += 2n;
		}
		return sum;
	}

	// Machin's formula: pi/4 = 4 * arccot(5) - arccot(239)
	const piScaled = 16n * arccot(5, unity) - 4n * arccot(239, unity);
	const piInt = piScaled / 10n ** BigInt(extra);
	const piStr = piInt.toString();
	const result = piStr[0] + '.' + piStr.slice(1, digits + 1);
	PI_CACHE.set(digits, result);
	return result;
}

const piCalculator: FormConfig = {
	intro: 'Calculate Pi (π) up to 2,000 decimal places using Machin-like arbitrary-precision formula, with fraction approximations and geometry circle properties.',
	introZh: '使用高精度梅钦类公式（Machin formula）计算圆周率 π 至小数点后 2000 位，并提供经典密率分式逼近与几何圆性质计算。',
	fields: [
		{
			id: 'digits',
			label: 'Decimal places (N)',
			labelZh: '计算小数位数 (N)',
			type: 'number',
			def: '100',
			step: '1',
			min: '1',
			max: '2000',
			required: true,
			hint: 'Integer from 1 to 2000 decimal places.',
			hintZh: '请输入 1 到 2000 之间的整数位数。',
		},
		{
			id: 'radius',
			label: 'Circle radius r (optional)',
			labelZh: '可选圆半径 r（几何验算）',
			type: 'number',
			def: '',
			step: 'any',
			min: '0',
			hint: 'Compute circumference and circle area.',
			hintZh: '输入半径可同时计算圆周长与圆面积。',
		},
	],
	compute: (v) => {
		const d = v.num('digits');
		if (!Number.isInteger(d) || d < 1 || d > 2000) {
			return {
				rows: [
					{
						label: 'Result',
						labelZh: '计算结果',
						value: '— (enter an integer between 1 and 2000)',
						valueZh: '— (请输入 1 到 2000 之间的整数位数)',
					},
				],
			};
		}

		const piStr = computePiMachin(d);
		const rows: import('./registry').FormResultRow[] = [
			{
				label: `Value of π (${d} decimal places)`,
				labelZh: `圆周率 π（前 ${d} 位小数）`,
				value: piStr,
				valueZh: piStr,
				emphasis: true,
			},
			{
				label: 'Milü fraction (355/113)',
				labelZh: '祖冲之密率 (355/113)',
				value: `${(355 / 113).toFixed(7)} (Error: ~8.5e-8)`,
				valueZh: `${(355 / 113).toFixed(7)} (相对误差仅约 8.5e-8)`,
			},
			{
				label: 'Yuelü fraction (22/7)',
				labelZh: '经典约率 (22/7)',
				value: `${(22 / 7).toFixed(4)} (Error: ~0.04%)`,
				valueZh: `${(22 / 7).toFixed(4)} (相对误差约 0.04%)`,
			},
		];

		const r = v.num('radius');
		if (r > 0) {
			const c = 2 * Math.PI * r;
			const a = Math.PI * r * r;
			rows.push(
				{
					label: 'Circumference (C = 2πr)',
					labelZh: '圆周长 (C = 2πr)',
					value: formatNumber(c),
					valueZh: formatNumber(c),
				},
				{
					label: 'Circle area (A = πr²)',
					labelZh: '圆面积 (A = πr²)',
					value: formatNumber(a),
					valueZh: formatNumber(a),
				},
			);
		}

		return {
			rows,
			note: `Computed via Machin's series expansion: π/4 = 4·arccot(5) − arccot(239) using exact BigInt integer arithmetic.`,
			noteZh: `基于梅钦展开式 π/4 = 4·arccot(5) − arccot(239) 并通过原生 BigInt 进行任意精度整数递推运算。`,
		};
	},
};

// --- matrix calculator (Linear Algebra operations) ----------------------------
function parseMatrix(text: string): number[][] | null {
	const trimmed = text.trim();
	if (!trimmed) return null;
	const lines = trimmed.split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean);
	if (lines.length === 0) return null;
	const m: number[][] = [];
	let cols = -1;
	for (const line of lines) {
		const parts = line.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
		if (parts.length === 0) continue;
		if (cols === -1) cols = parts.length;
		else if (parts.length !== cols) return null;
		const row: number[] = [];
		for (const p of parts) {
			const v = Number(p);
			if (!Number.isFinite(v)) return null;
			row.push(v);
		}
		m.push(row);
	}
	return m.length > 0 && cols > 0 ? m : null;
}

function formatMatrix(m: number[][]): string {
	return m.map((row) => row.map((v) => formatNumber(v)).join('\t')).join('\n');
}

function transposeMatrix(m: number[][]): number[][] {
	const r = m.length, c = m[0]!.length;
	const res: number[][] = Array.from({ length: c }, () => Array(r).fill(0));
	for (let i = 0; i < r; i++) {
		for (let j = 0; j < c; j++) {
			res[j]![i] = m[i]![j]!;
		}
	}
	return res;
}

function lupDecompose(m: number[][]): { LU: number[][]; P: number[]; sign: number } | null {
	const n = m.length;
	if (n !== m[0]!.length) return null;
	const A = m.map((r) => [...r]);
	const P: number[] = Array.from({ length: n }, (_, i) => i);
	let sign = 1;

	for (let i = 0; i < n; i++) {
		let maxVal = 0;
		let pivot = i;
		for (let j = i; j < n; j++) {
			const val = Math.abs(A[j]![i]!);
			if (val > maxVal) {
				maxVal = val;
				pivot = j;
			}
		}
		if (maxVal < 1e-12) return null; // singular matrix
		if (pivot !== i) {
			[A[i], A[pivot]] = [A[pivot]!, A[i]!];
			[P[i], P[pivot]] = [P[pivot]!, P[i]!];
			sign = -sign;
		}
		const diag = A[i]![i]!;
		for (let j = i + 1; j < n; j++) {
			A[j]![i]! /= diag;
			for (let k = i + 1; k < n; k++) {
				A[j]![k]! -= A[j]![i]! * A[i]![k]!;
			}
		}
	}
	return { LU: A, P, sign };
}

function solveLup(m: number[][]): { det: number; inv: number[][] | null } | null {
	const n = m.length;
	if (n !== m[0]!.length) return null;
	if (n === 1) return { det: m[0]![0]!, inv: m[0]![0]! !== 0 ? [[1 / m[0]![0]!]] : null };
	if (n === 2) {
		const det = m[0]![0]! * m[1]![1]! - m[0]![1]! * m[1]![0]!;
		if (Math.abs(det) < 1e-12) return { det: 0, inv: null };
		return {
			det,
			inv: [
				[m[1]![1]! / det, -m[0]![1]! / det],
				[-m[1]![0]! / det, m[0]![0]! / det],
			],
		};
	}

	const lup = lupDecompose(m);
	if (!lup) return { det: 0, inv: null };

	const { LU, P, sign } = lup;
	let det = sign;
	for (let i = 0; i < n; i++) det *= LU[i]![i]!;

	if (Math.abs(det) < 1e-12) return { det: 0, inv: null };

	// Solve A * X = I using forward and back substitution
	const inv: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
	for (let col = 0; col < n; col++) {
		// Forward solve L * y = P * e_col
		const y = new Array(n).fill(0);
		for (let i = 0; i < n; i++) {
			let s = P[i] === col ? 1 : 0;
			for (let j = 0; j < i; j++) s -= LU[i]![j]! * y[j]!;
			y[i] = s;
		}
		// Back solve U * x = y
		for (let i = n - 1; i >= 0; i--) {
			let s = y[i]!;
			for (let j = i + 1; j < n; j++) s -= LU[i]![j]! * inv[j]![col]!;
			inv[i]![col] = s / LU[i]![i]!;
		}
	}
	return { det, inv };
}

const matrixCalculator: FormConfig = {
	intro: 'Perform linear algebra matrix operations: Determinant, Inverse, Trace, Rank, Transpose, Addition (A + B), and Multiplication (A × B).',
	introZh: '线性代数常用矩阵运算工具：行列式 (det)、逆矩阵 (A⁻¹)、矩阵的迹 (trace)、转置 (Aᵀ)、加法 (A + B) 与矩阵乘法 (A × B)。',
	fields: [
		{
			id: 'op',
			label: 'Operation',
			labelZh: '运算类型',
			type: 'select',
			def: 'props',
			options: [
				{ value: 'props', label: 'Single Matrix Properties (det, inverse, trace, transpose)', labelZh: '单矩阵属性分析 (行列式、求逆、迹、转置)' },
				{ value: 'add', label: 'Matrix Addition (A + B)', labelZh: '矩阵加法 (A + B)' },
				{ value: 'sub', label: 'Matrix Subtraction (A - B)', labelZh: '矩阵减法 (A - B)' },
				{ value: 'mul', label: 'Matrix Multiplication (A × B)', labelZh: '矩阵乘法 (A × B)' },
			],
		},
		{
			id: 'matA',
			label: 'Matrix A (rows separated by newlines, elements by space or comma)',
			labelZh: '矩阵 A（换行分行，空格或逗号分隔元素）',
			type: 'textarea',
			def: '1  2  3\n0  1  4\n5  6  0',
			placeholder: '1  2  3\n0  1  4\n5  6  0',
			required: true,
			wide: true,
		},
		{
			id: 'matB',
			label: 'Matrix B (for A+B, A-B, A×B)',
			labelZh: '矩阵 B（用于双矩阵加减乘）',
			type: 'textarea',
			def: '2  0  1\n1  3  2\n0  1  1',
			placeholder: '2  0  1\n1  3  2\n0  1  1',
			showIf: (v) => v.str('op') !== 'props',
			wide: true,
		},
	],
	compute: (v) => {
		const op = v.str('op');
		const a = parseMatrix(v.str('matA'));
		if (!a) {
			return {
				rows: [
					{
						label: 'Error',
						labelZh: '输入错误',
						value: '— (invalid Matrix A: must be non-empty with equal row lengths and valid numbers)',
						valueZh: '— (矩阵 A 格式有误：请确保每行元素个数相同且均为有效数字)',
					},
				],
			};
		}

		const rows: import('./registry').FormResultRow[] = [];
		const rA = a.length, cA = a[0]!.length;
		rows.push({
			label: 'Matrix A Dimensions',
			labelZh: '矩阵 A 阶数/尺寸',
			value: `${rA} × ${cA}`,
			valueZh: `${rA} × ${cA}`,
		});

		if (op === 'props') {
			const isSquare = rA === cA;
			if (isSquare) {
				const sol = solveLup(a);
				const det = sol ? sol.det : 0;
				rows.push({
					label: 'Determinant det(A)',
					labelZh: '行列式 det(A)',
					value: formatNumber(det),
					valueZh: formatNumber(det),
					emphasis: true,
				});

				let tr = 0;
				for (let i = 0; i < rA; i++) tr += a[i]![i]!;
				rows.push({
					label: 'Trace tr(A)',
					labelZh: '矩阵的迹 tr(A)',
					value: formatNumber(tr),
					valueZh: formatNumber(tr),
				});

				const inv = sol ? sol.inv : null;
				if (inv) {
					rows.push({
						label: 'Inverse Matrix A⁻¹',
						labelZh: '逆矩阵 A⁻¹',
						value: formatMatrix(inv),
						valueZh: formatMatrix(inv),
					});
				} else {
					rows.push({
						label: 'Inverse Matrix A⁻¹',
						labelZh: '逆矩阵 A⁻¹',
						value: 'Singular matrix (det ≈ 0, non-invertible)',
						valueZh: '奇异矩阵（行列式为 0，不可逆）',
					});
				}
			} else {
				rows.push({
					label: 'Determinant & Inverse',
					labelZh: '行列式与逆矩阵',
					value: '— (requires a square matrix)',
					valueZh: '— (仅方阵支持求行列式与逆矩阵)',
				});
			}

			const trans = transposeMatrix(a);
			rows.push({
				label: 'Transpose Aᵀ',
				labelZh: '转置矩阵 Aᵀ',
				value: formatMatrix(trans),
				valueZh: formatMatrix(trans),
			});

			if (rA === 2 && cA === 2) {
				const m00 = a[0]![0]!, m01 = a[0]![1]!;
				const m10 = a[1]![0]!, m11 = a[1]![1]!;
				const tr2 = m00 + m11;
				const det2 = m00 * m11 - m01 * m10;
				const disc = tr2 * tr2 - 4 * det2;
				if (disc >= 0) {
					const l1 = (tr2 + Math.sqrt(disc)) / 2;
					const l2 = (tr2 - Math.sqrt(disc)) / 2;
					rows.push({
						label: 'Eigenvalues (λ₁, λ₂)',
						labelZh: '特征值 (λ₁, λ₂)',
						value: `λ₁ = ${formatNumber(l1)},  λ₂ = ${formatNumber(l2)}`,
						valueZh: `λ₁ = ${formatNumber(l1)},  λ₂ = ${formatNumber(l2)}`,
					});
					const getEigVec = (l: number): string => {
						if (Math.abs(m01) > 1e-12) return `[${formatNumber(m01)}, ${formatNumber(l - m00)}]ᵀ`;
						if (Math.abs(m10) > 1e-12) return `[${formatNumber(l - m11)}, ${formatNumber(m10)}]ᵀ`;
						return l === m00 ? '[1, 0]ᵀ' : '[0, 1]ᵀ';
					};
					rows.push({
						label: 'Eigenvectors (v₁, v₂)',
						labelZh: '特征向量 (v₁, v₂)',
						value: `v₁ = ${getEigVec(l1)},  v₂ = ${getEigVec(l2)}`,
						valueZh: `v₁ = ${getEigVec(l1)},  v₂ = ${getEigVec(l2)}`,
					});
				} else {
					const real = formatNumber(tr2 / 2);
					const imag = formatNumber(Math.sqrt(-disc) / 2);
					rows.push({
						label: 'Eigenvalues (λ₁, λ₂)',
						labelZh: '特征值 (λ₁, λ₂)',
						value: `${real} ± ${imag}i`,
						valueZh: `${real} ± ${imag}i (复数特征值对)`,
					});
				}
			}

			return { rows };
		}

		// Binary operations
		const b = parseMatrix(v.str('matB'));
		if (!b) {
			return {
				rows: [
					...rows,
					{
						label: 'Error',
						labelZh: '输入错误',
						value: '— (invalid Matrix B: must be non-empty with equal row lengths and valid numbers)',
						valueZh: '— (矩阵 B 格式有误：请确保每行元素个数相同且均为有效数字)',
					},
				],
			};
		}
		const rB = b.length, cB = b[0]!.length;
		rows.push({
			label: 'Matrix B Dimensions',
			labelZh: '矩阵 B 阶数/尺寸',
			value: `${rB} × ${cB}`,
			valueZh: `${rB} × ${cB}`,
		});

		if (op === 'add' || op === 'sub') {
			if (rA !== rB || cA !== cB) {
				rows.push({
					label: 'Operation Result',
					labelZh: '运算结果',
					value: '— (addition/subtraction requires matrices of the same dimensions)',
					valueZh: '— (矩阵加减法要求两矩阵具有相同的行数与列数)',
				});
				return { rows };
			}
			const sign = op === 'add' ? 1 : -1;
			const res = Array.from({ length: rA }, (_, i) =>
				Array.from({ length: cA }, (_, j) => a[i]![j]! + sign * b[i]![j]!),
			);
			rows.push({
				label: op === 'add' ? 'Result (A + B)' : 'Result (A - B)',
				labelZh: op === 'add' ? '结果 (A + B)' : '结果 (A - B)',
				value: formatMatrix(res),
				valueZh: formatMatrix(res),
				emphasis: true,
			});
		} else if (op === 'mul') {
			if (cA !== rB) {
				rows.push({
					label: 'Operation Result',
					labelZh: '运算结果',
					value: `— (multiplication A(${rA}×${cA}) × B(${rB}×${cB}) undefined: columns of A must match rows of B)`,
					valueZh: `— (无法相乘：A 的列数 ${cA} 与 B 的行数 ${rB} 不相等)`,
				});
				return { rows };
			}
			// Transpose B once for cache-friendly sequential column access during multiply.
			const bT: number[][] = Array.from({ length: cB }, (_, j) =>
				Array.from({ length: cA }, (_, k) => b[k]![j]!),
			);
			const res: number[][] = Array.from({ length: rA }, () => new Array<number>(cB).fill(0));
			for (let i = 0; i < rA; i++) {
				const rowA = a[i]!;
				const rowRes = res[i]!;
				for (let j = 0; j < cB; j++) {
					const colBT = bT[j]!;
					let s = 0;
					for (let k = 0; k < cA; k++) {
						s += rowA[k]! * colBT[k]!;
					}
					rowRes[j] = s;
				}
			}
			rows.push({
				label: 'Result (A × B)',
				labelZh: '结果 (A × B)',
				value: formatMatrix(res),
				valueZh: formatMatrix(res),
				emphasis: true,
			});
		}


		return { rows };
	},
};

// --- equation solver & calculus -----------------------------------------------
function solveQuadratic(a: number, b: number, c: number): { x1: string; x2: string; delta: number } {
	const delta = b * b - 4 * a * c;
	if (delta >= 0) {
		const s = Math.sqrt(delta);
		// Citardauq formulation: avoids catastrophic cancellation when b² ≫ 4ac
		const q = -0.5 * (b + (b >= 0 ? 1 : -1) * s);
		const x1 = q / a;
		const x2 = c / q;
		return { x1: formatNumber(x1), x2: formatNumber(x2), delta };
	}
	const real = formatNumber(-b / (2 * a));
	const imag = formatNumber(Math.sqrt(-delta) / (2 * Math.abs(a)));
	return {
		x1: `${real} + ${imag}i`,
		x2: `${real} - ${imag}i`,
		delta,
	};
}

function solveCubic(a: number, b: number, c: number, d: number): string[] {
	if (a === 0) {
		if (b === 0) return c === 0 ? ['— (no variable)'] : [formatNumber(-d / c)];
		const q = solveQuadratic(b, c, d);
		return [q.x1, q.x2];
	}
	// Depressed cubic t^3 + pt + q = 0
	const p = (3 * a * c - b * b) / (3 * a * a);
	const q = (2 * b * b * b - 9 * a * b * c + 27 * a * a * d) / (27 * a * a * a);
	const shift = -b / (3 * a);
	const delta = (q / 2) ** 2 + (p / 3) ** 3;

	if (Math.abs(delta) < 1e-12) {
		if (Math.abs(p) < 1e-12 && Math.abs(q) < 1e-12) {
			return [formatNumber(shift)];
		}
		const u = Math.cbrt(-q / 2);
		return [formatNumber(2 * u + shift), formatNumber(-u + shift)];
	} else if (delta > 0) {
		const sqrtD = Math.sqrt(delta);
		const u = Math.cbrt(-q / 2 + sqrtD);
		const v = Math.cbrt(-q / 2 - sqrtD);
		const r1 = u + v + shift;
		const real = -0.5 * (u + v) + shift;
		const imag = (Math.sqrt(3) / 2) * Math.abs(u - v);
		return [
			formatNumber(r1),
			`${formatNumber(real)} + ${formatNumber(imag)}i`,
			`${formatNumber(real)} - ${formatNumber(imag)}i`,
		];
	} else {
		// Three distinct real roots via trigonometry
		const r = Math.sqrt(-(p ** 3) / 27);
		const cosArg = Math.max(-1, Math.min(1, -q / (2 * r)));
		const phi = Math.acos(cosArg);
		const m = 2 * Math.cbrt(r);
		const r1 = m * Math.cos(phi / 3) + shift;
		const r2 = m * Math.cos((phi + 2 * Math.PI) / 3) + shift;
		const r3 = m * Math.cos((phi + 4 * Math.PI) / 3) + shift;
		return [formatNumber(r1), formatNumber(r2), formatNumber(r3)];
	}
}

const equationSolver: FormConfig = {
	intro: 'Solve polynomial equations (Quadratic ax²+bx+c=0, Cubic ax³+bx²+cx+d=0), 2x2 linear systems, numerical calculus (derivatives & integrals), and function limits via Richardson extrapolation.',
	introZh: '代数方程求解、微积分与极限工具：支持自然输入方程或方程组智能识别、一元二次/三次方程求根（含复数虚根）、二元一次方程组、数值微积分以及函数极限求解。',
	fields: [
		{
			id: 'type',
			label: 'Problem Type / Input Mode',
			labelZh: '计算类型 / 输入方式',
			type: 'select',
			def: 'auto',
			options: [
				{ value: 'auto', label: 'Smart Equation (e.g. x² - 5x + 6 = 0 or 2x+3y=8, 5x-y=3)', labelZh: '自然方程输入 (智能识别二次/三次/线性方程组 · 推荐)' },
				{ value: 'quad', label: 'Quadratic by Coefficients (ax² + bx + c = 0)', labelZh: '一元二次方程 (按系数 a, b, c)' },
				{ value: 'cubic', label: 'Cubic by Coefficients (ax³ + bx² + cx + d = 0)', labelZh: '一元三次方程 (按系数 a, b, c, d)' },
				{ value: 'linear2', label: '2x2 Linear System (by coefficients)', labelZh: '二元一次线性方程组 (按系数)' },
				{ value: 'calculus', label: 'Calculus: Numerical Derivative & Integral', labelZh: '微积分运算（数值导数与定积分）' },
				{ value: 'limit', label: 'Limit (x → x0)', labelZh: '极限求解 (x → x0)' },
				{ value: 'ode', label: 'Differential Equation (ODE: dy/dx = f(x, y))', labelZh: '常微分方程初值问题 (ODE: dy/dx = f(x, y))' },
			],
		},
		// Smart Equation field with one-click presets
		{
			id: 'eq',
			label: 'Equation or System',
			labelZh: '方程或方程组表达式',
			type: 'text',
			def: 'x^2 - 5x + 6 = 0',
			placeholder: 'e.g. x^2 - 5x + 6 = 0 or 2x + 3y = 8, 5x - y = 3',
			placeholderZh: '例如 x^2 - 5x + 6 = 0 或 2x + 3y = 8, 5x - y = 3',
			hint: 'Type any polynomial equation, linear equation, or comma-separated linear system. Click a preset chip below for instant loading.',
			hintZh: '直接输入任意代数方程（未知数 x）或用逗号分隔的二元方程组（未知数 x, y）。可点击下方范例一键载入。',
			wide: true,
			showIf: (v) => v.str('type') === 'auto',
			presets: [
				{ label: 'x² − 5x + 6 = 0', labelZh: 'x² − 5x + 6 = 0 (实根 2, 3)', value: 'x^2 - 5x + 6 = 0' },
				{ label: '2x² + 3x − 5 = 0', labelZh: '2x² + 3x − 5 = 0', value: '2x^2 + 3x - 5 = 0' },
				{ label: 'x² + 4 = 0', labelZh: 'x² + 4 = 0 (复根 ±2i)', value: 'x^2 + 4 = 0' },
				{ label: '2x + 3y = 8, 5x − y = 3', labelZh: '2x + 3y = 8, 5x − y = 3 (方程组)', value: '2x + 3y = 8, 5x - y = 3' },
				{ label: 'x³ − 6x² + 11x − 6 = 0', labelZh: 'x³ − 6x² + 11x − 6 = 0 (三次方程)', value: 'x^3 - 6x^2 + 11x - 6 = 0' },
				{ label: '3x + 7 = 22', labelZh: '3x + 7 = 22 (一元一次)', value: '3x + 7 = 22' },
			],
		},
		// Coefficients for quadratic / cubic
		{ id: 'a', label: 'Coefficient a', labelZh: '二次/三次项系数 a', type: 'number', def: '1', step: 'any', showIf: (v) => v.str('type') === 'quad' || v.str('type') === 'cubic' },
		{ id: 'b', label: 'Coefficient b', labelZh: '一次/二次项系数 b', type: 'number', def: '-5', step: 'any', showIf: (v) => v.str('type') === 'quad' || v.str('type') === 'cubic' },
		{ id: 'c', label: 'Coefficient c', labelZh: '常数/一次项系数 c', type: 'number', def: '6', step: 'any', showIf: (v) => v.str('type') === 'quad' || v.str('type') === 'cubic' },
		{ id: 'd', label: 'Constant d', labelZh: '常数项 d', type: 'number', def: '0', step: 'any', showIf: (v) => v.str('type') === 'cubic' },
		// 2x2 Linear system: a1*x + b1*y = c1; a2*x + b2*y = c2
		{ id: 'a1', label: 'Equation 1: x coefficient (a1)', labelZh: '方程 1：x 系数 (a1)', type: 'number', def: '2', step: 'any', showIf: (v) => v.str('type') === 'linear2' },
		{ id: 'b1', label: 'Equation 1: y coefficient (b1)', labelZh: '方程 1：y 系数 (b1)', type: 'number', def: '3', step: 'any', showIf: (v) => v.str('type') === 'linear2' },
		{ id: 'c1', label: 'Equation 1: constant (c1)', labelZh: '方程 1：常数项 (c1)', type: 'number', def: '8', step: 'any', showIf: (v) => v.str('type') === 'linear2' },
		{ id: 'a2', label: 'Equation 2: x coefficient (a2)', labelZh: '方程 2：x 系数 (a2)', type: 'number', def: '5', step: 'any', showIf: (v) => v.str('type') === 'linear2' },
		{ id: 'b2', label: 'Equation 2: y coefficient (b2)', labelZh: '方程 2：y 系数 (b2)', type: 'number', def: '-1', step: 'any', showIf: (v) => v.str('type') === 'linear2' },
		{ id: 'c2', label: 'Equation 2: constant (c2)', labelZh: '方程 2：常数项 (c2)', type: 'number', def: '3', step: 'any', showIf: (v) => v.str('type') === 'linear2' },
		// Calculus fields
		{ id: 'calcExpr', label: 'Function f(x)', labelZh: '被积/被求导函数 f(x)', type: 'text', def: 'x^2 + sin(x)', showIf: (v) => v.str('type') === 'calculus' },
		{ id: 'x0', label: 'Derivative evaluation point x0', labelZh: '求导点 x0', type: 'number', def: '1', step: 'any', showIf: (v) => v.str('type') === 'calculus' },
		{ id: 'intA', label: 'Integral lower limit a', labelZh: '积分下限 a', type: 'number', def: '0', step: 'any', showIf: (v) => v.str('type') === 'calculus' },
		{ id: 'intB', label: 'Integral upper limit b', labelZh: '积分上限 b', type: 'number', def: '2', step: 'any', showIf: (v) => v.str('type') === 'calculus' },
		// Limit fields
		{ id: 'limExpr', label: 'Function f(x)', labelZh: '函数表达式 f(x)', type: 'text', def: 'sin(x)/x', showIf: (v) => v.str('type') === 'limit' },
		{ id: 'limX0', label: 'Approach point x0', labelZh: '趋近目标点 x0', type: 'number', def: '0', step: 'any', showIf: (v) => v.str('type') === 'limit' && !v.str('limDir').includes('inf') },
		{
			id: 'limDir',
			label: 'Direction',
			labelZh: '极限方向',
			type: 'select',
			def: 'both',
			options: [
				{ value: 'both', label: 'Two-sided limit (x → x0)', labelZh: '双侧极限 (x → x0)' },
				{ value: 'right', label: 'Right-sided limit (x → x0⁺)', labelZh: '右极限 (x → x0⁺)' },
				{ value: 'left', label: 'Left-sided limit (x → x0⁻)', labelZh: '左极限 (x → x0⁻)' },
				{ value: 'inf', label: 'x → ∞ (unsigned / both infinities)', labelZh: 'x → ∞（无符号/双侧无穷）' },
				{ value: '+inf', label: 'x → +∞ (positive infinity)', labelZh: 'x → +∞（正无穷大）' },
				{ value: '-inf', label: 'x → −∞ (negative infinity)', labelZh: 'x → −∞（负无穷大）' },
			],
			showIf: (v) => v.str('type') === 'limit',
		},
		// ODE fields
		{ id: 'odeExpr', label: 'Derivative dy/dx = f(x, y)', labelZh: '导数表达式 dy/dx = f(x, y)', type: 'text', def: 'x + y', showIf: (v) => v.str('type') === 'ode' },
		{ id: 'odeX0', label: 'Initial point x0', labelZh: '初始点 x0', type: 'number', def: '0', step: 'any', showIf: (v) => v.str('type') === 'ode' },
		{ id: 'odeY0', label: 'Initial value y0 = y(x0)', labelZh: '初始值 y0 = y(x0)', type: 'number', def: '1', step: 'any', showIf: (v) => v.str('type') === 'ode' },
		{ id: 'odeX1', label: 'Target point x1', labelZh: '目标点 x1', type: 'number', def: '1', step: 'any', showIf: (v) => v.str('type') === 'ode' },
		{ id: 'odeSteps', label: 'Integration Steps N', labelZh: '计算步数 N', type: 'number', def: '100', step: '1', min: '1', max: '5000', showIf: (v) => v.str('type') === 'ode' },
	],
	compute: (v) => {
		const type = v.str('type');
		const rows: import('./registry').FormResultRow[] = [];

		if (type === 'auto') {
			let raw = v.str('eq').trim();
			if (!raw) {
				return { rows: [{ label: 'Error', labelZh: '错误', value: '— (enter an equation)', valueZh: '— (请输入方程或表达式)' }] };
			}

			// Preprocess characters
			raw = raw
				.replace(/²/g, '^2')
				.replace(/³/g, '^3')
				.replace(/−/g, '-')
				.replace(/×/g, '*')
				.replace(/÷/g, '/');
			raw = raw.replace(/\b([xy])\s*\(/g, '$1*(');
			raw = raw.replace(/\)\s*\(/g, ')*(');
			raw = raw.replace(/\)\s*([xy])/g, ')*$1');
			raw = raw.replace(/(\d)\s*([xy])/g, '$1*$2');
			raw = raw.replace(/(\d)\s*\(/g, '$1*(');

			// 1. Check if 2x2 Linear System
			if (/[yY]/.test(raw) && (raw.includes(',') || raw.includes(';') || raw.includes('\n'))) {
				const parts = raw.split(/[,;\n]+/).map((p) => p.trim()).filter(Boolean);
				if (parts.length >= 2) {
					try {
						const parseSide = (side: string): string => {
							if (side.includes('=')) {
								const [l, r] = side.split('=');
								return `(${l}) - (${r || '0'})`;
							}
							return side;
						};
						const fn1 = compile(parseSide(parts[0]!));
						const fn2 = compile(parseSide(parts[1]!));
						const scope = { vars: {}, deg: false };
						const e1 = (xv: number, yv: number) => {
							scope.vars = { x: xv, y: yv };
							return fn1(scope);
						};
						const e2 = (xv: number, yv: number) => {
							scope.vars = { x: xv, y: yv };
							return fn2(scope);
						};

						const a1 = e1(1, 0) - e1(0, 0);
						const b1 = e1(0, 1) - e1(0, 0);
						const c1 = -e1(0, 0);

						const a2 = e2(1, 0) - e2(0, 0);
						const b2 = e2(0, 1) - e2(0, 0);
						const c2 = -e2(0, 0);

						rows.push({
							label: 'Identified Problem Type',
							labelZh: '识别问题类型',
							value: '2x2 Linear System',
							valueZh: '二元一次线性方程组',
						});
						rows.push({
							label: 'Standard Matrix Form',
							labelZh: '标准方程组形式',
							value: `${formatNumber(a1)}x + ${formatNumber(b1)}y = ${formatNumber(c1)};  ${formatNumber(a2)}x + ${formatNumber(b2)}y = ${formatNumber(c2)}`,
							valueZh: `${formatNumber(a1)}x + ${formatNumber(b1)}y = ${formatNumber(c1)}；${formatNumber(a2)}x + ${formatNumber(b2)}y = ${formatNumber(c2)}`,
						});

						const det = a1 * b2 - a2 * b1;
						rows.push({
							label: 'Coefficient Determinant det(A)',
							labelZh: '系数矩阵行列式 det(A)',
							value: formatNumber(det),
							valueZh: formatNumber(det),
						});

						if (Math.abs(det) < 1e-12) {
							const consistent = Math.abs(a1 * c2 - a2 * c1) < 1e-12 && Math.abs(b1 * c2 - b2 * c1) < 1e-12;
							rows.push({
								label: 'System Solution',
								labelZh: '方程组求解结果',
								value: consistent ? 'Infinitely many solutions (dependent equations)' : 'No solution (parallel inconsistent lines)',
								valueZh: consistent ? '无穷多解（两方程等价重合）' : '无解（两直线平行无交点）',
								emphasis: true,
							});
							return { rows };
						}

						const x = (c1 * b2 - c2 * b1) / det;
						const y = (a1 * c2 - a2 * c1) / det;
						rows.push({
							label: 'Solution for x',
							labelZh: '未知数 x 解',
							value: formatNumber(x),
							valueZh: formatNumber(x),
							emphasis: true,
						});
						rows.push({
							label: 'Solution for y',
							labelZh: '未知数 y 解',
							value: formatNumber(y),
							valueZh: formatNumber(y),
							emphasis: true,
						});
						return { rows };
					} catch (e: any) {
						return { rows: [{ label: 'Error', labelZh: '解析错误', value: String(e.message || e), valueZh: String(e.message || e) }] };
					}
				}
			}

			// 2. Single variable polynomial equation in x
			let lhs = raw;
			let rhs = '0';
			if (raw.includes('=')) {
				const eqParts = raw.split('=');
				lhs = eqParts[0]!.trim();
				rhs = eqParts.slice(1).join('=').trim() || '0';
			}

			try {
				const fn = compile(`(${lhs}) - (${rhs})`);
				// Reuse one vars object — avoids a heap allocation per evaluation call.
				const pVars: Record<string, number> = { x: 0 };
				const scope = { vars: pVars, deg: false };
				const p = (xv: number) => {
					pVars['x'] = xv;
					return fn(scope);
				};

				// 5-point symmetric sampling: correctly extracts coefficients up to degree 4.
				// Old 4-point scheme (x=0,1,-1,2) conflated a₂+a₄ in the "quadratic" slot,
				// causing x⁴ to be misidentified as quadratic.
				const p0 = p(0);
				const p1 = p(1);
				const pm1 = p(-1);
				const p2 = p(2);
				const pm2 = p(-2);

				// Derive exact polynomial coefficients via central finite differences:
				//   a0 = p(0)
				//   12*a4 = (p(2)+p(-2))/2 - 2*(p(1)+p(-1)) + 3*p(0)
				//   a2    = (p(1)+p(-1))/2 - a0 - a4
				//   6*a3  = (p(2)-p(-2))/2 - (p(1)-p(-1))
				//   a1    = (p(1)-p(-1))/2 - a3
				const a0 = p0;
				const a4 = ((p2 + pm2) / 2 - 2 * (p1 + pm1) + 3 * a0) / 12;
				const a2 = (p1 + pm1) / 2 - a0 - a4;
				const a3 = ((p2 - pm2) / 2 - (p1 - pm1)) / 6;
				const a1 = (p1 - pm1) / 2 - a3;

				const clean = (n: number) => (Math.abs(n - Math.round(n)) < 1e-9 ? Math.round(n) : n);
				const ca4 = clean(a4);
				const ca3 = clean(a3);
				const ca2 = clean(a2);
				const ca1 = clean(a1);
				const ca0 = clean(a0);

				// Quartic equation (degree 4) — solve numerically via companion-matrix eigenvalue
				// or, for now, report standard form and note that analytical solution is complex.
				if (Math.abs(ca4) > 1e-9) {
					rows.push({
						label: 'Identified Problem Type',
						labelZh: '识别问题类型',
						value: 'Quartic Polynomial Equation (Degree 4)',
						valueZh: '一元四次代数方程 (4 次)',
					});
					rows.push({
						label: 'Standard Form',
						labelZh: '标准形式',
						value: `${formatNumber(ca4)}x⁴ + ${formatNumber(ca3)}x³ + ${formatNumber(ca2)}x² + ${formatNumber(ca1)}x + ${formatNumber(ca0)} = 0`,
						valueZh: `${formatNumber(ca4)}x⁴ + ${formatNumber(ca3)}x³ + ${formatNumber(ca2)}x² + ${formatNumber(ca1)}x + ${formatNumber(ca0)} = 0`,
					});
					// Numerical root finding via bisection + Newton on a dense scan using Cauchy's bound
					const numRoots: number[] = [];
					const evalP = (xv: number) => { pVars['x'] = xv; return fn(scope); };
					const maxCoeff = Math.max(Math.abs(ca3), Math.abs(ca2), Math.abs(ca1), Math.abs(ca0));
					const cauchyBound = 1 + maxCoeff / Math.abs(ca4);
					const bound = Math.max(100, Math.min(1e6, cauchyBound));
					const SCAN = 400;
					const lo = -bound, hi = bound;
					let prev = evalP(lo);
					for (let i = 1; i <= SCAN; i++) {
						const xMid = lo + (hi - lo) * i / SCAN;
						const cur = evalP(xMid);
						if (Number.isFinite(prev) && Number.isFinite(cur) && prev * cur < 0) {
							// Bisection refine
							let lo2 = xMid - (hi - lo) / SCAN, hi2 = xMid;
							for (let j = 0; j < 50; j++) {
								const m = (lo2 + hi2) / 2;
								const fm = evalP(m);
								if (evalP(lo2) * fm <= 0) hi2 = m; else lo2 = m;
							}
							const root = (lo2 + hi2) / 2;
							if (!numRoots.some((r) => Math.abs(r - root) < 1e-8)) numRoots.push(root);
						}
						prev = cur;
					}
					if (numRoots.length > 0) {
						numRoots.sort((a, b) => a - b).forEach((r, idx) => {
							rows.push({
								label: `Real Root x${idx + 1}`,
								labelZh: `实数根 x${idx + 1}`,
								value: formatNumber(r),
								valueZh: formatNumber(r),
								emphasis: idx === 0,
							});
						});
					} else {
						rows.push({
							label: 'Real Roots',
							labelZh: '实数根',
							value: 'No real roots found in [−100, 100]',
							valueZh: '在 [−100, 100] 范围内未找到实数根',
						});
					}
					return { rows };
				}

				// Cubic equation (degree 3)
				if (Math.abs(ca3) > 1e-9) {
					rows.push({
						label: 'Identified Problem Type',
						labelZh: '识别问题类型',
						value: 'Cubic Polynomial Equation',
						valueZh: '一元三次代数方程',
					});
					rows.push({
						label: 'Standard Form',
						labelZh: '标准形式',
						value: `${formatNumber(ca3)}x³ + ${formatNumber(ca2)}x² + ${formatNumber(ca1)}x + ${formatNumber(ca0)} = 0`,
						valueZh: `${formatNumber(ca3)}x³ + ${formatNumber(ca2)}x² + ${formatNumber(ca1)}x + ${formatNumber(ca0)} = 0`,
					});
					const roots = solveCubic(ca3, ca2, ca1, ca0);
					roots.forEach((r, idx) => {
						rows.push({
							label: `Root x${idx + 1}`,
							labelZh: `方程根 x${idx + 1}`,
							value: r,
							valueZh: r,
							emphasis: idx === 0,
						});
					});
					return { rows };
				}

				// Quadratic equation (degree 2)
				if (Math.abs(ca2) > 1e-9) {
					rows.push({
						label: 'Identified Problem Type',
						labelZh: '识别问题类型',
						value: 'Quadratic Equation (Degree 2)',
						valueZh: '一元二次方程 (2 次)',
					});
					rows.push({
						label: 'Standard Form',
						labelZh: '标准形式',
						value: `${formatNumber(ca2)}x² + ${formatNumber(ca1)}x + ${formatNumber(ca0)} = 0`,
						valueZh: `${formatNumber(ca2)}x² + ${formatNumber(ca1)}x + ${formatNumber(ca0)} = 0`,
					});
					const sol = solveQuadratic(ca2, ca1, ca0);
					rows.push({
						label: 'Discriminant Δ = b² − 4ac',
						labelZh: '判别式 Δ = b² − 4ac',
						value: formatNumber(sol.delta),
						valueZh: formatNumber(sol.delta),
					});
					rows.push({ label: 'Root x₁', labelZh: '方程根 x₁', value: sol.x1, valueZh: sol.x1, emphasis: true });
					rows.push({ label: 'Root x₂', labelZh: '方程根 x₂', value: sol.x2, valueZh: sol.x2, emphasis: true });
					const xv = -ca1 / (2 * ca2);
					const yv = ca0 - (ca1 * ca1) / (4 * ca2);
					rows.push({
						label: 'Parabola Vertex (xv, yv)',
						labelZh: '抛物线顶点坐标 (xv, yv)',
						value: `(${formatNumber(xv)}, ${formatNumber(yv)})`,
						valueZh: `(${formatNumber(xv)}, ${formatNumber(yv)})`,
					});
					rows.push({
						label: 'Axis of Symmetry',
						labelZh: '对称轴方程',
						value: `x = ${formatNumber(xv)}`,
						valueZh: `x = ${formatNumber(xv)}`,
					});
					return { rows };
				}

				// Linear equation (degree 1)
				if (Math.abs(ca1) > 1e-9) {
					const root = -ca0 / ca1;
					rows.push({
						label: 'Identified Problem Type',
						labelZh: '识别问题类型',
						value: 'Linear Equation in x',
						valueZh: '一元一次方程',
					});
					rows.push({
						label: 'Standard Form',
						labelZh: '化简形式',
						value: `${formatNumber(ca1)}x + ${formatNumber(ca0)} = 0`,
						valueZh: `${formatNumber(ca1)}x + ${formatNumber(ca0)} = 0`,
					});
					rows.push({
						label: 'Root x',
						labelZh: '方程唯一根 x',
						value: formatNumber(root),
						valueZh: formatNumber(root),
						emphasis: true,
					});
					rows.push({
						label: 'Solution Steps',
						labelZh: '求解步骤',
						value: `${formatNumber(ca1)}x = ${formatNumber(-ca0)}  ⇒  x = ${formatNumber(-ca0)} / ${formatNumber(ca1)} = ${formatNumber(root)}`,
						valueZh: `${formatNumber(ca1)}x = ${formatNumber(-ca0)}  ⇒  x = ${formatNumber(-ca0)} / ${formatNumber(ca1)} = ${formatNumber(root)}`,
					});
					return { rows };
				}

				// Constant equation (0 = 0 or c = 0)
				rows.push({
					label: 'Identified Problem Type',
					labelZh: '方程类型',
					value: 'Constant Identity / Contradiction',
					valueZh: '常数恒等式 / 矛盾式',
				});
				rows.push({
					label: 'Solution',
					labelZh: '求解结果',
					value: Math.abs(ca0) < 1e-9 ? 'Infinite solutions (Identity 0 = 0)' : 'No solution (Contradiction)',
					valueZh: Math.abs(ca0) < 1e-9 ? '无数解（恒等式 0 = 0）' : '无解（常数矛盾）',
					emphasis: true,
				});
				return { rows };
			} catch (e: any) {
				return { rows: [{ label: 'Error', labelZh: '计算错误', value: String(e.message || e), valueZh: String(e.message || e) }] };
			}
		}


		if (type === 'quad') {
			const a = v.num('a');
			const b = v.num('b');
			const c = v.num('c');
			if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c)) {
				return { rows: [{ label: 'Error', labelZh: '错误', value: '— (invalid coefficients)', valueZh: '— (请输入有效系数)' }] };
			}
			if (a === 0) {
				if (b === 0) {
					return { rows: [{ label: 'Solution', labelZh: '方程求解', value: c === 0 ? 'Infinite solutions (0 = 0)' : 'No solution', valueZh: c === 0 ? '无数解 (0 = 0)' : '无解' }] };
				}
				const x = -c / b;
				return { rows: [{ label: 'Linear Root x', labelZh: '一次方程根 x', value: formatNumber(x), valueZh: formatNumber(x), emphasis: true }] };
			}
			const sol = solveQuadratic(a, b, c);
			rows.push({
				label: 'Discriminant Δ = b² − 4ac',
				labelZh: '判别式 Δ = b² − 4ac',
				value: formatNumber(sol.delta),
				valueZh: formatNumber(sol.delta),
			});
			rows.push({
				label: 'Root x₁',
				labelZh: '方程根 x₁',
				value: sol.x1,
				valueZh: sol.x1,
				emphasis: true,
			});
			rows.push({
				label: 'Root x₂',
				labelZh: '方程根 x₂',
				value: sol.x2,
				valueZh: sol.x2,
				emphasis: true,
			});
			const xv = -b / (2 * a);
			const yv = c - (b * b) / (4 * a);
			rows.push({
				label: 'Parabola Vertex (xv, yv)',
				labelZh: '抛物线顶点坐标 (xv, yv)',
				value: `(${formatNumber(xv)}, ${formatNumber(yv)})`,
				valueZh: `(${formatNumber(xv)}, ${formatNumber(yv)})`,
			});
			rows.push({
				label: 'Axis of Symmetry',
				labelZh: '对称轴方程',
				value: `x = ${formatNumber(xv)}`,
				valueZh: `x = ${formatNumber(xv)}`,
			});
			return { rows };
		}

		if (type === 'cubic') {
			const a = v.num('a');
			const b = v.num('b');
			const c = v.num('c');
			const d = v.num('d');
			if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c) || !Number.isFinite(d)) {
				return { rows: [{ label: 'Error', labelZh: '错误', value: '— (invalid coefficients)', valueZh: '— (请输入有效系数)' }] };
			}
			const roots = solveCubic(a, b, c, d);
			roots.forEach((r, idx) => {
				rows.push({
					label: `Root x${idx + 1}`,
					labelZh: `方程根 x${idx + 1}`,
					value: r,
					valueZh: r,
					emphasis: idx === 0,
				});
			});
			return { rows };
		}

		if (type === 'linear2') {
			const a1 = v.num('a1'), b1 = v.num('b1'), c1 = v.num('c1');
			const a2 = v.num('a2'), b2 = v.num('b2'), c2 = v.num('c2');
			const det = a1 * b2 - a2 * b1;
			if (Math.abs(det) < 1e-12) {
				const consistent = Math.abs(a1 * c2 - a2 * c1) < 1e-12 && Math.abs(b1 * c2 - b2 * c1) < 1e-12;
				return {
					rows: [
						{
							label: 'Linear System Solution',
							labelZh: '方程组求解',
							value: consistent ? 'Infinitely many solutions (dependent equations)' : 'No solution (parallel lines)',
							valueZh: consistent ? '无穷多解（两方程等价重合）' : '无解（两直线平行无交点）',
						},
					],
				};
			}
			const x = (c1 * b2 - c2 * b1) / det;
			const y = (a1 * c2 - a2 * c1) / det;
			rows.push({
				label: 'Solution for x',
				labelZh: '未知数 x 解',
				value: formatNumber(x),
				valueZh: formatNumber(x),
				emphasis: true,
			});
			rows.push({
				label: 'Solution for y',
				labelZh: '未知数 y 解',
				value: formatNumber(y),
				valueZh: formatNumber(y),
				emphasis: true,
			});
			return { rows };
		}

		if (type === 'calculus') {
			const exprStr = v.str('calcExpr').trim();
			const x0 = v.num('x0');
			const a = v.num('intA');
			const b = v.num('intB');
			if (!exprStr) {
				return { rows: [{ label: 'Error', labelZh: '错误', value: '— (enter a valid function f(x))', valueZh: '— (请输入有效函数 f(x))' }] };
			}

			try {
				const fn = compile(exprStr);
				// Reuse one vars object — avoids a heap allocation per evaluation call.
				const calcVars: Record<string, number> = { x: 0 };
				const scope = { vars: calcVars, deg: false };

				// Numerical Derivative via 5-point symmetric stencil
				if (Number.isFinite(x0)) {
					const h = 1e-5;
					const evalAt = (xv: number) => {
						calcVars['x'] = xv;
						return fn(scope);
					};
					const f_p2 = evalAt(x0 + 2 * h);
					const f_p1 = evalAt(x0 + h);
					const f_m1 = evalAt(x0 - h);
					const f_m2 = evalAt(x0 - 2 * h);
					const dVal = (-f_p2 + 8 * f_p1 - 8 * f_m1 + f_m2) / (12 * h);
					rows.push({
						label: `Derivative f'(${x0})`,
						labelZh: `一阶导数值 f'(${x0})`,
						value: formatNumber(dVal),
						valueZh: formatNumber(dVal),
						emphasis: true,
					});
				}

				// Numerical Definite Integral via Adaptive Simpson Quadrature (1e-9 tolerance)
				// Uses an eval-count budget (MAX_EVALS) instead of a fixed recursion depth,
				// which is safer for discontinuous/high-frequency functions and terminates
				// in 3-5 levels for smooth functions rather than always reaching depth 15.
				if (Number.isFinite(a) && Number.isFinite(b)) {
					let evalCount = 0;
					const MAX_EVALS = 4096;
					const evalAt = (xv: number) => {
						calcVars['x'] = xv;
						evalCount++;
						return fn(scope);
					};
					const simpson = (x0: number, x2: number, f0: number, f1: number, f2: number) =>
						((x2 - x0) / 6) * (f0 + 4 * f1 + f2);

					const adapt = (
						x0: number,
						x2: number,
						f0: number,
						f1: number,
						f2: number,
						whole: number,
					): number => {
						const x1 = (x0 + x2) / 2;
						const xLeftMid = (x0 + x1) / 2;
						const xRightMid = (x1 + x2) / 2;
						const fLeftMid = evalAt(xLeftMid);
						const fRightMid = evalAt(xRightMid);
						const left = simpson(x0, x1, f0, fLeftMid, f1);
						const right = simpson(x1, x2, f1, fRightMid, f2);
						const delta = left + right - whole;
						if (Math.abs(delta) <= 15 * 1e-9 || evalCount >= MAX_EVALS) {
							return left + right + delta / 15;
						}
						return (
							adapt(x0, x1, f0, fLeftMid, f1, left) +
							adapt(x1, x2, f1, fRightMid, f2, right)
						);
					};

					const f0 = evalAt(a);
					const f2 = evalAt(b);
					const mid = (a + b) / 2;
					const f1 = evalAt(mid);
					const whole = simpson(a, b, f0, f1, f2);
					const intVal = adapt(a, b, f0, f1, f2, whole);

					rows.push({
						label: `Definite Integral ∫[${a} to ${b}] f(x) dx`,
						labelZh: `定积分 ∫[${a} 到 ${b}] f(x) dx`,
						value: formatNumber(intVal),
						valueZh: formatNumber(intVal),
						emphasis: true,
					});
				}
			} catch (e: any) {
				return { rows: [{ label: 'Evaluation Error', labelZh: '计算错误', value: String(e.message || e), valueZh: String(e.message || e) }] };
			}

			return { rows };
		}

		if (type === 'limit') {
			const exprStr = v.str('limExpr').trim();
			const x0 = v.num('limX0');
			const dir = v.str('limDir');
			if (!exprStr || !Number.isFinite(x0)) {
				return { rows: [{ label: 'Error', labelZh: '错误', value: '— (enter a valid function f(x) and target point x0)', valueZh: '— (请输入有效函数 f(x) 与趋向点 x0)' }] };
			}

			try {
				const fn = compile(exprStr);
				// Reuse pre-allocated vars to avoid GC pressure across 12 approach-sequence evaluations.
				const limVars: Record<string, number> = { x: x0 };
				const scope = { vars: limVars, deg: false };
				const evalSafe = (xv: number): number => {
					limVars['x'] = xv;
					return fn(scope);
				};

				// Helper for x → ±∞ evaluation via substitution t = 1/x (t → 0⁺)
				const calcInf = (sign: 1 | -1) => {
					const steps = [1e-1, 1e-2, 1e-3, 1e-4, 1e-5, 1e-6];
					const vals: number[] = [];
					for (const t of steps) {
						const val = evalSafe(sign / t);
						if (Number.isFinite(val)) vals.push(val);
					}
					if (vals.length < 2) {
						const lastLarge = evalSafe(sign * 1e6);
						const lastLarger = evalSafe(sign * 1e8);
						if (Number.isFinite(lastLarge) && Number.isFinite(lastLarger)) {
							if (lastLarge > 1e5 && lastLarger > lastLarge) return { num: null, str: '+∞', strZh: '+∞', spread: 0 };
							if (lastLarge < -1e5 && lastLarger < lastLarge) return { num: null, str: '−∞', strZh: '−∞', spread: 0 };
						}
						return { num: null, str: 'Does not exist (oscillates or complex)', strZh: '极限不存在（函数振荡或发散）', spread: 0 };
					}
					const v1 = vals[vals.length - 2]!;
					const v2 = vals[vals.length - 1]!;
					const extrap = (4 * v2 - v1) / 3;
					const limVal = Math.abs(extrap - Math.round(extrap)) < 1e-9 ? Math.round(extrap) : extrap;
					return { num: limVal, str: formatNumber(limVal), strZh: formatNumber(limVal), spread: Math.abs(v2 - v1) };
				};

				// ---- x → ±∞ (signed) ----
				if (dir === '+inf' || dir === '-inf') {
					const sign = dir === '+inf' ? 1 : -1;
					const res = calcInf(sign);
					const dirStr = dir === '+inf' ? '+∞' : '−∞';
					const dirStrZh = dir === '+inf' ? '正无穷大 (+∞)' : '负无穷大 (−∞)';
					rows.push({
						label: `Limit lim(x → ${dirStr}) f(x)`,
						labelZh: `极限 lim(x → ${dirStrZh}) f(x)`,
						value: res.str,
						valueZh: res.strZh,
						emphasis: true,
					});
					if (res.spread > 1e-4) {
						rows.push({
							label: 'Note',
							labelZh: '提示',
							value: `Convergence is slow (spread = ${res.spread.toExponential(2)}); result may be approximate`,
							valueZh: `收敛较慢（相邻差 ${res.spread.toExponential(2)}），结果为近似值`,
						});
					}
					return { rows };
				}

				// ---- x → ∞ (unsigned / both directions) ----
				if (dir === 'inf') {
					const resPos = calcInf(1);
					const resNeg = calcInf(-1);
					const bothNumeric = resPos.num !== null && resNeg.num !== null;
					const equalNumeric = bothNumeric && Math.abs(resPos.num! - resNeg.num!) < 1e-4;
					const equalDiverge = resPos.num === null && resNeg.num === null && resPos.str === resNeg.str && (resPos.str === '+∞' || resPos.str === '−∞');

					if (equalNumeric) {
						const avg = (resPos.num! + resNeg.num!) / 2;
						const valStr = formatNumber(avg);
						rows.push({
							label: 'Unsigned Limit lim(x → ∞) f(x)',
							labelZh: '双侧无穷极限 lim(x → ∞) f(x)',
							value: valStr,
							valueZh: valStr,
							emphasis: true,
						});
						rows.push({
							label: 'Note',
							labelZh: '说明',
							value: `Both directions converge to the same value: lim(x → +∞) = ${resPos.str}, lim(x → −∞) = ${resNeg.str}`,
							valueZh: `正负无穷两侧极限一致：lim(x → +∞) = ${resPos.strZh}，lim(x → −∞) = ${resNeg.strZh}`,
						});
					} else if (equalDiverge) {
						rows.push({
							label: 'Unsigned Limit lim(x → ∞) f(x)',
							labelZh: '双侧无穷极限 lim(x → ∞) f(x)',
							value: resPos.str!,
							valueZh: resPos.strZh!,
							emphasis: true,
						});
						rows.push({
							label: 'Note',
							labelZh: '说明',
							value: `Both directions diverge to ${resPos.str}`,
							valueZh: `正负两侧无穷大均趋于 ${resPos.strZh}`,
						});
					} else {
						rows.push({
							label: 'Unsigned Limit lim(x → ∞) f(x)',
							labelZh: '双侧无穷极限 lim(x → ∞) f(x)',
							value: 'Does not exist (differs at +∞ and −∞)',
							valueZh: '极限不存在（正负无穷两端极限不一致）',
							emphasis: true,
						});
						rows.push({
							label: 'Breakdown',
							labelZh: '两侧分别情况',
							value: `lim(x → +∞) = ${resPos.str}, lim(x → −∞) = ${resNeg.str}`,
							valueZh: `lim(x → +∞) = ${resPos.strZh}，lim(x → −∞) = ${resNeg.strZh}`,
						});
					}
					return { rows };
				}

				// ---- x → x0 (finite approach point) ----
				// Approach sequence with Richardson extrapolation
				const evalDirectional = (sign: 1 | -1): number | null => {
					// Test sequence of diminishing step sizes
					const steps = [1e-1, 1e-2, 1e-3, 1e-4, 1e-5, 1e-6];
					const vals: number[] = [];
					for (const h of steps) {
						const val = evalSafe(x0 + sign * h);
						if (Number.isFinite(val)) vals.push(val);
					}
					if (vals.length < 2) return null;

					// Richardson extrapolation on the last two clean steps
					const v1 = vals[vals.length - 2]!;
					const v2 = vals[vals.length - 1]!;
					const extrap = (4 * v2 - v1) / 3;
					return Math.abs(extrap - Math.round(extrap)) < 1e-9 ? Math.round(extrap) : extrap;
				};

				let limLeft: number | null = null;
				let limRight: number | null = null;

				if (dir === 'both' || dir === 'left') limLeft = evalDirectional(-1);
				if (dir === 'both' || dir === 'right') limRight = evalDirectional(1);

				if (dir === 'left') {
					rows.push({
						label: `Left-sided Limit lim(x → ${x0}⁻) f(x)`,
						labelZh: `左极限 lim(x → ${x0}⁻) f(x)`,
						value: limLeft !== null ? formatNumber(limLeft) : 'undefined',
						valueZh: limLeft !== null ? formatNumber(limLeft) : '未定义 / 不存在',
						emphasis: true,
					});
				} else if (dir === 'right') {
					rows.push({
						label: `Right-sided Limit lim(x → ${x0}⁺) f(x)`,
						labelZh: `右极限 lim(x → ${x0}⁺) f(x)`,
						value: limRight !== null ? formatNumber(limRight) : 'undefined',
						valueZh: limRight !== null ? formatNumber(limRight) : '未定义 / 不存在',
						emphasis: true,
					});
				} else {
					// Two-sided limit
					const exists = limLeft !== null && limRight !== null && Math.abs(limLeft - limRight) < 1e-7;
					const finalVal = limLeft !== null && limRight !== null && exists ? (limLeft + limRight) / 2 : null;
					rows.push({
						label: `Two-sided Limit lim(x → ${x0}) f(x)`,
						labelZh: `双侧极限 lim(x → ${x0}) f(x)`,
						value: finalVal !== null ? formatNumber(finalVal) : 'Does not exist (left ≠ right or undefined)',
						valueZh: finalVal !== null ? formatNumber(finalVal) : '极限不存在（左右极限不相等或未定义）',
						emphasis: true,
					});
					if (limLeft !== null) {
						rows.push({
							label: `Left Limit (x → ${x0}⁻)`,
							labelZh: `左极限 (x → ${x0}⁻)`,
							value: formatNumber(limLeft),
							valueZh: formatNumber(limLeft),
						});
					}
					if (limRight !== null) {
						rows.push({
							label: `Right Limit (x → ${x0}⁺)`,
							labelZh: `右极限 (x → ${x0}⁺)`,
							value: formatNumber(limRight),
							valueZh: formatNumber(limRight),
						});
					}
				}
			} catch (e: any) {
				return { rows: [{ label: 'Evaluation Error', labelZh: '计算错误', value: String(e.message || e), valueZh: String(e.message || e) }] };
			}

			return { rows };
		}

		if (type === 'ode') {
			const exprStr = v.str('odeExpr').trim();
			const x0 = v.num('odeX0');
			const y0 = v.num('odeY0');
			const x1 = v.num('odeX1');
			const steps = Math.max(1, Math.min(5000, Math.round(v.num('odeSteps')) || 100));
			if (!exprStr || !Number.isFinite(x0) || !Number.isFinite(y0) || !Number.isFinite(x1)) {
				return { rows: [{ label: 'Error', labelZh: '错误', value: '— (enter valid equation and initial conditions)', valueZh: '— (请输入有效微分方程表达式与初值)' }] };
			}
			try {
				const fn = compile(exprStr);
				// Reuse one vars object — with steps=5000 and 4 evals/step this avoids
				// 20 K short-lived heap allocations per compute() call.
				const odeVars: Record<string, number> = { x: x0, y: y0 };
				const scope = { vars: odeVars, deg: false };
				const f = (xv: number, yv: number): number => {
					odeVars['x'] = xv;
					odeVars['y'] = yv;
					return fn(scope);
				};
				const h = (x1 - x0) / steps;
				let curX = x0;
				let curY = y0;
				for (let i = 0; i < steps; i++) {
					const k1 = f(curX, curY);
					const k2 = f(curX + 0.5 * h, curY + 0.5 * h * k1);
					const k3 = f(curX + 0.5 * h, curY + 0.5 * h * k2);
					const k4 = f(curX + h, curY + h * k3);
					curY += (h / 6) * (k1 + 2 * k2 + 2 * k3 + k4);
					curX += h;
				}
				rows.push({
					label: `Numerical Solution y(${formatNumber(x1)})`,
					labelZh: `方程数值解 y(${formatNumber(x1)})`,
					value: formatNumber(curY),
					valueZh: formatNumber(curY),
					emphasis: true,
				});
				rows.push({
					label: 'Initial Condition',
					labelZh: '初值条件',
					value: `y(${formatNumber(x0)}) = ${formatNumber(y0)}`,
					valueZh: `y(${formatNumber(x0)}) = ${formatNumber(y0)}`,
				});
				rows.push({
					label: 'Step size h and steps N',
					labelZh: '步长 h 与积分步数 N',
					value: `h = ${formatNumber(h)},  N = ${steps}`,
					valueZh: `h = ${formatNumber(h)},  N = ${steps}`,
				});
			} catch (e: any) {
				return { rows: [{ label: 'Evaluation Error', labelZh: '计算错误', value: String(e.message || e), valueZh: String(e.message || e) }] };
			}
			return { rows };
		}

		return { rows };
	},
};

const complexCalculator: FormConfig = {
	intro: 'Calculate complex numbers in rectangular form (a + bi) and polar/Euler form (r·e^(iθ)), with arithmetic, powers, roots, conjugate, and exponential functions.',
	introZh: '复数代数与极坐标形式计算：支持实部虚部形式 (a + bi) 与极坐标/欧拉形式 (r·e^(iθ)) 互转、加减乘除、乘方、开方、共轭、倒数与复指数对数。',
	fields: [
		{ id: 'a1', label: 'z₁ Real Part (a₁)', labelZh: '复数 z₁ 实部 a₁', type: 'number', def: '3', step: 'any', required: true },
		{ id: 'b1', label: 'z₁ Imaginary Part (b₁)', labelZh: '复数 z₁ 虚部 b₁', type: 'number', def: '4', step: 'any', required: true },
		{ id: 'a2', label: 'z₂ Real Part (a₂)', labelZh: '复数 z₂ 实部 a₂', type: 'number', def: '1', step: 'any', required: true },
		{ id: 'b2', label: 'z₂ Imaginary Part (b₂)', labelZh: '复数 z₂ 虚部 b₂', type: 'number', def: '-2', step: 'any', required: true },
		{ id: 'n', label: 'Exponent n (for z₁ⁿ)', labelZh: '幂指数 n (用于计算 z₁ⁿ)', type: 'number', def: '3', step: 'any', required: true },
	],
	compute: (v) => {
		const a1 = v.num('a1'), b1 = v.num('b1');
		const a2 = v.num('a2'), b2 = v.num('b2');
		const n = v.num('n');
		if (!Number.isFinite(a1) || !Number.isFinite(b1) || !Number.isFinite(a2) || !Number.isFinite(b2)) {
			return { rows: [{ label: 'Error', labelZh: '错误', value: '— (enter valid real and imaginary parts)', valueZh: '— (请输入有效实部与虚部)' }] };
		}
		const fmtC = (re: number, im: number): string => {
			const rStr = formatNumber(re);
			if (Math.abs(im) < 1e-12) return rStr;
			const sign = im >= 0 ? ' + ' : ' − ';
			const absIm = Math.abs(im);
			const iStr = Math.abs(absIm - 1) < 1e-12 ? 'i' : `${formatNumber(absIm)}i`;
			if (Math.abs(re) < 1e-12) return im < 0 ? `−${iStr}` : iStr;
			return `${rStr}${sign}${iStr}`;
		};
		const r1 = Math.hypot(a1, b1);
		const th1 = Math.atan2(b1, a1);
		const deg1 = (th1 * 180) / Math.PI;

		const rows: import('./registry').FormResultRow[] = [
			{ label: 'z₁ (Rectangular form)', labelZh: '复数 z₁（代数形式）', value: fmtC(a1, b1), valueZh: fmtC(a1, b1), emphasis: true },
			{ label: 'z₁ (Polar / Euler form)', labelZh: '复数 z₁（极坐标 / 欧拉形式）', value: `${formatNumber(r1)} · e^(${formatNumber(th1)}i)  [${formatNumber(r1)} ∠ ${formatNumber(deg1)}°]`, valueZh: `${formatNumber(r1)} · e^(${formatNumber(th1)}i)  [${formatNumber(r1)} ∠ ${formatNumber(deg1)}°]`, emphasis: true },
			{ label: 'Modulus |z₁|', labelZh: '模长 |z₁|', value: formatNumber(r1), valueZh: formatNumber(r1) },
			{ label: 'Argument Arg(z₁)', labelZh: '辐角 Arg(z₁)', value: `${formatNumber(th1)} rad (${formatNumber(deg1)}°)`, valueZh: `${formatNumber(th1)} 弧度 (${formatNumber(deg1)}°)` },
			{ label: 'Conjugate z̄₁', labelZh: '共轭复数 z̄₁', value: fmtC(a1, -b1), valueZh: fmtC(a1, -b1) },
		];
		const d1 = a1 * a1 + b1 * b1;
		if (d1 !== 0) {
			rows.push({ label: 'Reciprocal 1 / z₁', labelZh: '倒数 1 / z₁', value: fmtC(a1 / d1, -b1 / d1), valueZh: fmtC(a1 / d1, -b1 / d1) });
		}
		rows.push({ label: 'Addition z₁ + z₂', labelZh: '复数加法 z₁ + z₂', value: fmtC(a1 + a2, b1 + b2), valueZh: fmtC(a1 + a2, b1 + b2) });
		rows.push({ label: 'Subtraction z₁ − z₂', labelZh: '复数减法 z₁ − z₂', value: fmtC(a1 - a2, b1 - b2), valueZh: fmtC(a1 - a2, b1 - b2) });
		const mulRe = a1 * a2 - b1 * b2;
		const mulIm = a1 * b2 + a2 * b1;
		rows.push({ label: 'Multiplication z₁ · z₂', labelZh: '复数乘法 z₁ · z₂', value: fmtC(mulRe, mulIm), valueZh: fmtC(mulRe, mulIm) });
		const d2 = a2 * a2 + b2 * b2;
		if (d2 !== 0) {
			const divRe = (a1 * a2 + b1 * b2) / d2;
			const divIm = (b1 * a2 - a1 * b2) / d2;
			rows.push({ label: 'Division z₁ / z₂', labelZh: '复数除法 z₁ / z₂', value: fmtC(divRe, divIm), valueZh: fmtC(divRe, divIm) });
		}
		if (Number.isFinite(n) && r1 > 0) {
			const rn = Math.pow(r1, n);
			const thn = th1 * n;
			rows.push({ label: `Power z₁^${n}`, labelZh: `乘方 z₁^${n}`, value: fmtC(rn * Math.cos(thn), rn * Math.sin(thn)), valueZh: fmtC(rn * Math.cos(thn), rn * Math.sin(thn)) });
		}
		const sqrtR = Math.sqrt(r1);
		const sqrtTh = th1 / 2;
		rows.push({ label: 'Principal Square Root √z₁', labelZh: '主平方根 √z₁', value: fmtC(sqrtR * Math.cos(sqrtTh), sqrtR * Math.sin(sqrtTh)), valueZh: fmtC(sqrtR * Math.cos(sqrtTh), sqrtR * Math.sin(sqrtTh)) });
		const expA = Math.exp(a1);
		rows.push({ label: 'Exponential e^z₁', labelZh: '复指数 e^z₁', value: fmtC(expA * Math.cos(b1), expA * Math.sin(b1)), valueZh: fmtC(expA * Math.cos(b1), expA * Math.sin(b1)) });
		if (r1 > 0) {
			rows.push({ label: 'Principal Logarithm Ln(z₁)', labelZh: '主对数 Ln(z₁)', value: fmtC(Math.log(r1), th1), valueZh: fmtC(Math.log(r1), th1) });
		}
		return { rows };
	},
};

const vectorCalculator: FormConfig = {
	intro: 'Calculate 2D and 3D vectors: magnitude, unit vectors, dot product, cross product, angle, and vector projection.',
	introZh: '二维与三维空间向量计算：模长、单位向量、点乘（内积）、叉乘（外积）、夹角以及向量投影。',
	fields: [
		{
			id: 'dim',
			label: 'Dimension',
			labelZh: '空间维度',
			type: 'select',
			def: '3d',
			options: [
				{ value: '3d', label: '3D Vector (x, y, z)', labelZh: '三维向量 (x, y, z)' },
				{ value: '2d', label: '2D Vector (x, y)', labelZh: '二维向量 (x, y)' },
			],
		},
		{ id: 'u1', label: 'Vector u: x component (ux)', labelZh: '向量 u：x 分量', type: 'number', def: '1', step: 'any', required: true },
		{ id: 'u2', label: 'Vector u: y component (uy)', labelZh: '向量 u：y 分量', type: 'number', def: '2', step: 'any', required: true },
		{ id: 'u3', label: 'Vector u: z component (uz)', labelZh: '向量 u：z 分量', type: 'number', def: '3', step: 'any', showIf: (v) => v.str('dim') === '3d' },
		{ id: 'v1', label: 'Vector v: x component (vx)', labelZh: '向量 v：x 分量', type: 'number', def: '4', step: 'any', required: true },
		{ id: 'v2', label: 'Vector v: y component (vy)', labelZh: '向量 v：y 分量', type: 'number', def: '5', step: 'any', required: true },
		{ id: 'v3', label: 'Vector v: z component (vz)', labelZh: '向量 v：z 分量', type: 'number', def: '6', step: 'any', showIf: (v) => v.str('dim') === '3d' },
	],
	compute: (v) => {
		const is3D = v.str('dim') === '3d';
		const ux = v.num('u1'), uy = v.num('u2'), uz = is3D ? v.num('u3') : 0;
		const vx = v.num('v1'), vy = v.num('v2'), vz = is3D ? v.num('v3') : 0;
		if (!Number.isFinite(ux) || !Number.isFinite(uy) || !Number.isFinite(vx) || !Number.isFinite(vy) || (is3D && (!Number.isFinite(uz) || !Number.isFinite(vz)))) {
			return { rows: [{ label: 'Error', labelZh: '错误', value: '— (enter valid components)', valueZh: '— (请输入有效向量分量)' }] };
		}
		const fmtV = (x: number, y: number, z: number): string =>
			is3D ? `(${formatNumber(x)}, ${formatNumber(y)}, ${formatNumber(z)})` : `(${formatNumber(x)}, ${formatNumber(y)})`;

		const magU = Math.hypot(ux, uy, uz);
		const magV = Math.hypot(vx, vy, vz);
		const dot = ux * vx + uy * vy + uz * vz;
		const crossX = uy * vz - uz * vy;
		const crossY = uz * vx - ux * vz;
		const crossZ = ux * vy - uy * vx;

		const rows: import('./registry').FormResultRow[] = [
			{ label: 'Vector u', labelZh: '向量 u', value: fmtV(ux, uy, uz), valueZh: fmtV(ux, uy, uz) },
			{ label: 'Vector v', labelZh: '向量 v', value: fmtV(vx, vy, vz), valueZh: fmtV(vx, vy, vz) },
			{ label: 'Magnitude |u|', labelZh: '向量 u 模长 |u|', value: formatNumber(magU), valueZh: formatNumber(magU) },
			{ label: 'Magnitude |v|', labelZh: '向量 v 模长 |v|', value: formatNumber(magV), valueZh: formatNumber(magV) },
		];
		if (magU > 0) {
			rows.push({ label: 'Unit Vector û', labelZh: '向量 u 的单位向量 û', value: fmtV(ux / magU, uy / magU, uz / magU), valueZh: fmtV(ux / magU, uy / magU, uz / magU) });
		}
		if (magV > 0) {
			rows.push({ label: 'Unit Vector v̂', labelZh: '向量 v 的单位向量 v̂', value: fmtV(vx / magV, vy / magV, vz / magV), valueZh: fmtV(vx / magV, vy / magV, vz / magV) });
		}
		rows.push({ label: 'Dot Product u · v', labelZh: '点积 (内积) u · v', value: formatNumber(dot), valueZh: formatNumber(dot), emphasis: true });

		if (is3D) {
			rows.push({ label: 'Cross Product u × v', labelZh: '叉积 (外积) u × v', value: fmtV(crossX, crossY, crossZ), valueZh: fmtV(crossX, crossY, crossZ), emphasis: true });
			rows.push({ label: 'Cross Product Magnitude |u × v|', labelZh: '叉积模长 (平行四边形面积)', value: formatNumber(Math.hypot(crossX, crossY, crossZ)), valueZh: formatNumber(Math.hypot(crossX, crossY, crossZ)) });
		} else {
			rows.push({ label: '2D Pseudo-Cross Product (u ∧ v)', labelZh: '2D 伪叉积 (行列式面积)', value: formatNumber(crossZ), valueZh: formatNumber(crossZ) });
		}

		if (magU > 0 && magV > 0) {
			const cosTheta = Math.max(-1, Math.min(1, dot / (magU * magV)));
			const thetaRad = Math.acos(cosTheta);
			const thetaDeg = (thetaRad * 180) / Math.PI;
			rows.push({ label: 'Angle θ between u and v', labelZh: '向量夹角 θ', value: `${formatNumber(thetaDeg)}°  (${formatNumber(thetaRad)} rad)`, valueZh: `${formatNumber(thetaDeg)}°  (${formatNumber(thetaRad)} 弧度)`, emphasis: true });

			const projScalar = dot / (magV * magV);
			const projX = projScalar * vx, projY = projScalar * vy, projZ = projScalar * vz;
			rows.push({ label: 'Vector Projection proj_v(u)', labelZh: '向量 u 在 v 上的投影向量', value: fmtV(projX, projY, projZ), valueZh: fmtV(projX, projY, projZ) });
		}

		rows.push({ label: 'Vector Addition u + v', labelZh: '向量加法 u + v', value: fmtV(ux + vx, uy + vy, uz + vz), valueZh: fmtV(ux + vx, uy + vy, uz + vz) });
		rows.push({ label: 'Vector Subtraction u − v', labelZh: '向量减法 u − v', value: fmtV(ux - vx, uy - vy, uz - vz), valueZh: fmtV(ux - vx, uy - vy, uz - vz) });
		rows.push({ label: 'Distance |u − v|', labelZh: '空间距离 |u − v|', value: formatNumber(Math.hypot(ux - vx, uy - vy, uz - vz)), valueZh: formatNumber(Math.hypot(ux - vx, uy - vy, uz - vz)) });

		return { rows };
	},
};

// --- Normal Distribution & Hypothesis Testing Algorithms ----------------------------

function normalCdf(z: number): number {
	const b1 = 0.31938153;
	const b2 = -0.356563782;
	const b3 = 1.781477937;
	const b4 = -1.821255978;
	const b5 = 1.330274429;
	const p = 0.2316419;
	const c2 = 0.3989422804014327; // 1 / √(2π)

	if (z < 0) return 1 - normalCdf(-z);
	const t = 1 / (1 + p * z);
	const poly = t * (b1 + t * (b2 + t * (b3 + t * (b4 + t * b5))));
	return 1 - c2 * Math.exp(-0.5 * z * z) * poly;
}

// Continued fraction approximation for Incomplete Beta Function (used for t-distribution p-value)
function betaIncomplete(a: number, b: number, x: number): number {
	if (x <= 0) return 0;
	if (x >= 1) return 1;

	// Log-Gamma approximation via Lanczos formula
	const logGamma = (z: number): number => {
		const c = [
			0.99999999999980993, 676.5203681218851, -1259.1392167224028,
			771.32342877765313, -176.61502916214059, 12.507343278686905,
			-0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
		];
		if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
		z -= 1;
		let xG = c[0]!;
		for (let i = 1; i < 9; i++) xG += c[i]! / (z + i);
		const tG = z + 7.5;
		return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(tG) - tG + Math.log(xG);
	};

	const bt = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));

	if (x < (a + 1) / (a + b + 2)) {
		return (bt * betaCf(a, b, x)) / a;
	}
	return 1 - (bt * betaCf(b, a, 1 - x)) / b;
}

function betaCf(a: number, b: number, x: number): number {
	const maxIter = 100;
	const eps = 3e-7;
	let qab = a + b;
	let qap = a + 1;
	let qam = a - 1;
	let c = 1;
	let d = 1 - (qab * x) / qap;
	if (Math.abs(d) < 1e-30) d = 1e-30;
	d = 1 / d;
	let h = d;

	for (let m = 1; m <= maxIter; m++) {
		const m2 = 2 * m;
		let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
		d = 1 + aa * d;
		if (Math.abs(d) < 1e-30) d = 1e-30;
		c = 1 + aa / c;
		if (Math.abs(c) < 1e-30) c = 1e-30;
		d = 1 / d;
		h *= d * c;
		aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
		d = 1 + aa * d;
		if (Math.abs(d) < 1e-30) d = 1e-30;
		c = 1 + aa / c;
		if (Math.abs(c) < 1e-30) c = 1e-30;
		d = 1 / d;
		const del = d * c;
		h *= del;
		if (Math.abs(del - 1) < eps) break;
	}
	return h;
}

function tCdf(t: number, df: number): number {
	const x = df / (df + t * t);
	const prob = 0.5 * betaIncomplete(df / 2, 0.5, x);
	return t >= 0 ? 1 - prob : prob;
}

const hypothesisTesting: FormConfig = {
	intro: 'Perform Z-test and Student’s t-test for sample mean, calculate test statistics, one-sided/two-sided p-values, and 95%/99% confidence intervals.',
	introZh: '进行单样本 Z 检验与 t 检验，计算检验统计量、单侧/双侧 p-value 显著性概率以及 95%/99% 置信区间。',
	fields: [
		{
			id: 'testType',
			label: 'Test Type',
			labelZh: '检验方法类型',
			type: 'select',
			def: 't_test',
			options: [
				{ value: 't_test', label: 'One-Sample t-Test (Unknown Population Std Dev)', labelZh: '单样本 t 检验 (总体标准差 σ 未知 · 推荐)' },
				{ value: 'z_test', label: 'One-Sample Z-Test (Known Population Std Dev σ)', labelZh: '单样本 Z 检验 (总体标准差 σ 已知)' },
			],
		},
		{ id: 'sampleMean', label: 'Sample Mean (x̄)', labelZh: '样本平均值 (x̄)', type: 'number', def: '105', step: 'any', required: true },
		{ id: 'nullMean', label: 'Hypothesized Null Mean (μ0)', labelZh: '原假设均值 (μ0)', type: 'number', def: '100', step: 'any', required: true },
		{ id: 'sampleSd', label: 'Sample Std Dev (s) / Known σ', labelZh: '标准差 (样本 s 或已知 σ)', type: 'number', def: '15', step: 'any', min: '0.0001', required: true },
		{ id: 'sampleSize', label: 'Sample Size (n)', labelZh: '样本容量 (n)', type: 'number', def: '25', step: '1', min: '2', required: true },
	],
	compute: (v) => {
		const testType = v.str('testType');
		const xbar = v.num('sampleMean');
		const mu0 = v.num('nullMean');
		const sd = v.num('sampleSd');
		const n = Math.round(v.num('sampleSize'));

		if (!Number.isFinite(xbar) || !Number.isFinite(mu0) || !(sd > 0) || !(n >= 2)) {
			return { rows: [{ label: 'Error', labelZh: '错误', value: '— (invalid sample values or n < 2)', valueZh: '— (请输入有效样本数据与 n ≥ 2)' }] };
		}

		const se = sd / Math.sqrt(n);
		const stat = (xbar - mu0) / se;
		const df = n - 1;

		let pTwo = 0;
		let pRight = 0;
		let pLeft = 0;
		// Exact critical value: tCritical is the cross-validated bisection from
		// the econometrics core (solves 2·tSurvival(df, x) = alpha), not the old
		// 2.0 + 3/df approximation which was off by −19% at df = 2.
		let zCrit95: number;

		if (testType === 'z_test') {
			const cdf = normalCdf(stat);
			pRight = 1 - cdf;
			pLeft = cdf;
			pTwo = 2 * (1 - normalCdf(Math.abs(stat)));
			zCrit95 = eco.tCritical(0.05, 1e9);
		} else {
			const cdf = tCdf(stat, df);
			pRight = 1 - cdf;
			pLeft = cdf;
			pTwo = 2 * (1 - tCdf(Math.abs(stat), df));
			zCrit95 = eco.tCritical(0.05, df);
		}

		const margin95 = zCrit95 * se;
		const ci95Low = xbar - margin95;
		const ci95High = xbar + margin95;

		// {value, valueZh} pair so a spread fills both row halves at once.
		const fmtP = (p: number): { value: string; valueZh: string } =>
			p < 0.0001
				? { value: '< 0.0001 (Highly Significant ***)', valueZh: '< 0.0001（高度显著 ***）' }
				: { value: `${(p * 100).toFixed(3)}% (p = ${formatNumber(p)})`, valueZh: `${(p * 100).toFixed(3)}%（p = ${formatNumber(p)}）` };

		return {
			rows: [
				{
					label: testType === 'z_test' ? 'Z-Statistic' : `t-Statistic (df = ${df})`,
					labelZh: testType === 'z_test' ? 'Z 统计量' : `t 统计量 (自由度 df = ${df})`,
					value: formatNumber(stat),
					emphasis: true,
				},
				{
					label: 'Two-Tailed p-Value (H1: μ ≠ μ0)',
					labelZh: '双侧 p 值 (H1: μ ≠ μ0)',
					...fmtP(pTwo),
					emphasis: true,
				},
				{
					label: 'Right-Tailed p-Value (H1: μ > μ0)',
					labelZh: '右侧 p 值 (H1: μ > μ0)',
					...fmtP(pRight),
				},
				{
					label: 'Left-Tailed p-Value (H1: μ < μ0)',
					labelZh: '左侧 p 值 (H1: μ < μ0)',
					...fmtP(pLeft),
				},
				{
					label: 'Standard Error (SE = s / √n)',
					labelZh: '标准误 (SE)',
					value: formatNumber(se),
				},
				{
					label: '95% Confidence Interval for Mean',
					labelZh: '总体均值 95% 置信区间',
					value: `[${formatNumber(ci95Low)},  ${formatNumber(ci95High)}]`,
				},
			],
			note: pTwo < 0.05
				? `Statistically significant at α = 0.05 (p = ${formatNumber(pTwo)} < 0.05). Reject the null hypothesis H0.`
				: `Not statistically significant at α = 0.05 (p = ${formatNumber(pTwo)} ≥ 0.05). Fail to reject the null hypothesis H0.`,
			noteZh: pTwo < 0.05
				? `在 α = 0.05 显著性水平下结果具有统计学意义 (p = ${formatNumber(pTwo)} < 0.05)，应拒绝原假设 H0。`
				: `在 α = 0.05 显著性水平下结果无显著差异 (p = ${formatNumber(pTwo)} ≥ 0.05)，无法拒绝原假设 H0。`,
		};
	},
};

const normalDistribution: FormConfig = {
	intro: 'Calculate Z-score, cumulative probability P(X ≤ x), right-tail probability P(X > x), and interval probability P(x1 ≤ X ≤ x2) for any normal distribution N(μ, σ²).',
	introZh: '计算任意正态分布 N(μ, σ²) 下的 Z-Score、累积概率 P(X ≤ x)、右尾概率 P(X > x) 及区间概率 P(x1 ≤ X ≤ x2)。',
	fields: [
		{ id: 'mean', label: 'Mean (μ)', labelZh: '期望/均值 (μ)', type: 'number', def: '0', step: 'any', required: true },
		{ id: 'sd', label: 'Std Dev (σ)', labelZh: '标准差 (σ)', type: 'number', def: '1', step: 'any', min: '0.0001', required: true },
		{ id: 'x1', label: 'Value x (or x1)', labelZh: '输入数值 x (或区间下限 x1)', type: 'number', def: '1.96', step: 'any', required: true },
		{ id: 'x2', label: 'Upper bound x2 (optional)', labelZh: '可选区间上限 x2', type: 'number', def: '', step: 'any' },
	],
	compute: (v) => {
		const mu = v.num('mean');
		const sigma = v.num('sd');
		const x1 = v.num('x1');
		const x2Val = v.str('x2').trim();
		const hasX2 = x2Val !== '' && Number.isFinite(Number(x2Val));
		const x2 = hasX2 ? Number(x2Val) : x1;

		if (!Number.isFinite(mu) || !(sigma > 0) || !Number.isFinite(x1)) {
			return { rows: [{ label: 'Error', labelZh: '错误', value: '— (invalid mean, std dev σ > 0, or x)', valueZh: '— (请输入有效均值、标准差 σ > 0 及 x)' }] };
		}

		const z1 = (x1 - mu) / sigma;
		const p1 = normalCdf(z1);
		const pRight = 1 - p1;

		const rows: import('./registry').FormResultRow[] = [
			{
				label: `Z-Score for x = ${x1}`,
				labelZh: `x = ${x1} 对应的 Z-Score`,
				value: formatNumber(z1),
				emphasis: true,
			},
			{
				label: `Cumulative Probability P(X ≤ ${x1})`,
				labelZh: `累积分布概率 P(X ≤ ${x1})`,
				value: `${(p1 * 100).toFixed(4)}%  (p = ${formatNumber(p1)})`,
				emphasis: true,
			},
			{
				label: `Right-tail Probability P(X > ${x1})`,
				labelZh: `右尾概率 P(X > ${x1})`,
				value: `${(pRight * 100).toFixed(4)}%  (p = ${formatNumber(pRight)})`,
			},
		];

		if (hasX2 && x2 > x1) {
			const z2 = (x2 - mu) / sigma;
			const p2 = normalCdf(z2);
			const pInterval = p2 - p1;
			rows.push(
				{
					label: `Z-Score for x2 = ${x2}`,
					labelZh: `x2 = ${x2} 对应的 Z-Score`,
					value: formatNumber(z2),
				},
				{
					label: `Interval Probability P(${x1} ≤ X ≤ ${x2})`,
					labelZh: `区间分布概率 P(${x1} ≤ X ≤ ${x2})`,
					value: `${(pInterval * 100).toFixed(4)}%  (p = ${formatNumber(pInterval)})`,
					emphasis: true,
				},
			);
		}

		rows.push(
			{ label: '68-95-99.7 Rule [μ ± 1σ]', labelZh: '68-95-99.7 法则 [μ ± 1σ] (68.27%)', value: `[${formatNumber(mu - sigma)},  ${formatNumber(mu + sigma)}]` },
			{ label: '68-95-99.7 Rule [μ ± 2σ]', labelZh: '68-95-99.7 法则 [μ ± 2σ] (95.45%)', value: `[${formatNumber(mu - 2 * sigma)},  ${formatNumber(mu + 2 * sigma)}]` },
			{ label: '68-95-99.7 Rule [μ ± 3σ]', labelZh: '68-95-99.7 法则 [μ ± 3σ] (99.73%)', value: `[${formatNumber(mu - 3 * sigma)},  ${formatNumber(mu + 3 * sigma)}]` },
		);

		return {
			rows,
			note: `For N(${mu}, ${sigma}²), a value of ${x1} is ${Math.abs(z1).toFixed(2)} standard deviations ${z1 >= 0 ? 'above' : 'below'} the mean.`,
			noteZh: `在正态分布 N(${mu}, ${sigma}²) 中，数值 ${x1} 位于均值 ${z1 >= 0 ? '右侧 (高于均值)' : '左侧 (低于均值)'} ${Math.abs(z1).toFixed(2)} 个标准差处。`,
		};
	},
};

const confidenceInterval: FormConfig = {
	intro: 'Calculate 90%, 95%, or 99% confidence intervals for sample means (t-distribution / Z-distribution) and sample proportions.',
	introZh: '计算 90%、95% 或 99% 置信水平下的样本均值（t 分布 / Z 分布）与样本比例置信区间及抽样误差范围。',
	fields: [
		{
			id: 'mode',
			label: 'Confidence Interval Type',
			labelZh: '置信区间类型',
			type: 'select',
			def: 'mean_t',
			options: [
				{ value: 'mean_t', label: 'Sample Mean (Unknown Population Std Dev - t Distribution)', labelZh: '样本均值 (总体标准差未知 · Student’s t 分布)' },
				{ value: 'mean_z', label: 'Sample Mean (Known Population Std Dev σ - Z Distribution)', labelZh: '样本均值 (总体标准差 σ 已知 · Z 分布)' },
				{ value: 'proportion', label: 'Sample Proportion (Binomial / A/B Test Conversion)', labelZh: '样本比例 (A/B 测试转化率 / 二项分布)' },
			],
		},
		{
			id: 'confLevel',
			label: 'Confidence Level (%)',
			labelZh: '置信水平 Confidence Level',
			type: 'select',
			def: '95',
			options: [
				{ value: '90', label: '90% Confidence Level', labelZh: '90% 置信水平 (α = 0.10)' },
				{ value: '95', label: '95% Confidence Level', labelZh: '95% 置信水平 (α = 0.05)' },
				{ value: '99', label: '99% Confidence Level', labelZh: '99% 置信水平 (α = 0.01)' },
			],
		},
		{ id: 'val1', label: 'Sample Mean (x̄) / Success Count (x)', labelZh: '样本均值 (x̄) 或 成功事件数 (x)', type: 'number', def: '100', step: 'any', required: true },
		{ id: 'val2', label: 'Sample Std Dev (s) / Known σ / Total n', labelZh: '标准差 (s 或已知 σ) 或 总体容量 n', type: 'number', def: '15', step: 'any', min: '0.0001', required: true },
		{ id: 'val3', label: 'Sample Size n (for mean modes)', labelZh: '样本容量 n (仅均值模式需要)', type: 'number', def: '30', step: '1', min: '2' },
	],
	compute: (v) => {
		const mode = v.str('mode');
		const confLevel = v.str('confLevel');
		const v1 = v.num('val1');
		const v2 = v.num('val2');
		const v3 = v.num('val3');

		const zCritMap: Record<string, number> = {
			'90': 1.64485,
			'95': 1.95996,
			'99': 2.57583,
		};
		const zCrit = zCritMap[confLevel] || 1.95996;

		if (mode === 'proportion') {
			const x = v1;
			const n = Math.round(v2);
			if (n < 1 || x < 0 || x > n) {
				return { rows: [{ label: 'Error', labelZh: '错误', value: '— (x must be between 0 and n, n ≥ 1)', valueZh: '— (成功数 x 须在 0 至 n 之间，n ≥ 1)' }] };
			}
			const p = x / n;
			const se = Math.sqrt((p * (1 - p)) / n);
			const me = zCrit * se;
			const low = Math.max(0, p - me);
			const high = Math.min(1, p + me);

			return {
				rows: [
					{ label: 'Sample Proportion (p̂)', labelZh: '样本比例 (p̂)', value: `${(p * 100).toFixed(3)}% (${formatNumber(p)})`, emphasis: true },
					{ label: `${confLevel}% Confidence Interval`, labelZh: `${confLevel}% 置信区间`, value: `[${(low * 100).toFixed(3)}%,  ${(high * 100).toFixed(3)}%]  ([${formatNumber(low)}, ${formatNumber(high)}])`, emphasis: true },
					{ label: 'Margin of Error (ME)', labelZh: '抽样误差范围 (ME)', value: `±${(me * 100).toFixed(3)}% (±${formatNumber(me)})` },
					{ label: 'Standard Error (SE)', labelZh: '标准误 (SE)', value: formatNumber(se) },
					{ label: 'Sample Size (n)', labelZh: '样本容量 (n)', value: String(n) },
				],
				note: `We are ${confLevel}% confident that the true population proportion lies between ${(low * 100).toFixed(2)}% and ${(high * 100).toFixed(2)}%.`,
				noteZh: `在 ${confLevel}% 置信水平下，总体真实比例预计落在 ${(low * 100).toFixed(2)}% 至 ${(high * 100).toFixed(2)}% 之间。`,
			};
		}

		const xbar = v1;
		const sd = v2;
		const n = Math.round(v3);

		if (!Number.isFinite(xbar) || !(sd > 0) || !(n >= 2)) {
			return { rows: [{ label: 'Error', labelZh: '错误', value: '— (invalid mean, std dev > 0, or n ≥ 2)', valueZh: '— (请输入有效均值、标准差 > 0 及 n ≥ 2)' }] };
		}

		const df = n - 1;
		const se = sd / Math.sqrt(n);
		// Exact t critical per confidence level via the cross-validated
		// tCritical bisection (the old z + 3/df shortcut was +25% off at 90%,
		// −54% at 99%/df=2). tCritical takes two-tailed alpha.
		const alpha = 1 - Number(confLevel) / 100;
		const crit = mode === 'mean_t' ? eco.tCritical(alpha, df) : zCrit;

		const me = crit * se;
		const low = xbar - me;
		const high = xbar + me;

		return {
			rows: [
				{ label: 'Sample Mean (x̄)', labelZh: '样本均值 (x̄)', value: formatNumber(xbar), emphasis: true },
				{ label: `${confLevel}% Confidence Interval`, labelZh: `${confLevel}% 置信区间`, value: `[${formatNumber(low)},  ${formatNumber(high)}]`, emphasis: true },
				{ label: 'Margin of Error (ME = Critical × SE)', labelZh: '抽样误差范围 (ME)', value: `±${formatNumber(me)}` },
				{ label: 'Standard Error (SE = s / √n)', labelZh: '标准误 (SE)', value: formatNumber(se) },
				{ label: mode === 'mean_t' ? `Critical t-Value (df = ${df})` : 'Critical Z-Value', labelZh: mode === 'mean_t' ? `临界 t 值 (df = ${df})` : '临界 Z 值', value: formatNumber(crit) },
				{ label: 'Sample Size (n)', labelZh: '样本容量 (n)', value: String(n) },
			],
			note: `We are ${confLevel}% confident that the true population mean μ lies within [${formatNumber(low)}, ${formatNumber(high)}].`,
			noteZh: `在 ${confLevel}% 置信水平下，总体真实均值 μ 预计在 [${formatNumber(low)}, ${formatNumber(high)}] 范围内。`,
		};
	},
};

const anovaCalculator: FormConfig = {
	intro: 'Perform One-Way Analysis of Variance (ANOVA) to test whether 3 or 4 sample group means differ significantly.',
	introZh: '进行单因素方差分析 (One-Way ANOVA)，检验 3 或 4 组样本数据的总体均值是否存在统计学显著差异。',
	fields: [
		{ id: 'g1', label: 'Group 1 Data (comma or space separated)', labelZh: '第 1 组样本数据 (逗号或空格分隔)', type: 'text', def: '23, 25, 29, 31, 30', required: true },
		{ id: 'g2', label: 'Group 2 Data', labelZh: '第 2 组样本数据', type: 'text', def: '18, 20, 22, 24, 21', required: true },
		{ id: 'g3', label: 'Group 3 Data', labelZh: '第 3 组样本数据', type: 'text', def: '35, 38, 40, 42, 39', required: true },
		{ id: 'g4', label: 'Group 4 Data (optional)', labelZh: '第 4 组样本数据 (可选)', type: 'text', def: '' },
	],
	compute: (v) => {
		const parseData = (str: string) =>
			str
				.split(/[\s,]+/)
				.map((x) => Number(x.trim()))
				.filter((x) => Number.isFinite(x));

		const groups = [parseData(v.str('g1')), parseData(v.str('g2')), parseData(v.str('g3')), parseData(v.str('g4'))].filter(
			(g) => g.length > 0,
		);

		if (groups.length < 2) {
			return { rows: [{ label: 'Error', labelZh: '错误', value: '— (at least 2 non-empty groups required)', valueZh: '— (请至少输入 2 组非空样本数据)' }] };
		}

		const k = groups.length;
		const groupMeans = groups.map((g) => g.reduce((a, b) => a + b, 0) / g.length);
		const N = groups.reduce((a, g) => a + g.length, 0);

		if (N <= k) {
			return { rows: [{ label: 'Error', labelZh: '错误', value: '— (total sample size N must be > group count k)', valueZh: '— (总样本容量 N 必须大于分组数 k)' }] };
		}

		const grandTotal = groups.reduce((a, g) => a + g.reduce((b, c) => b + c, 0), 0);
		const grandMean = grandTotal / N;

		let ssb = 0;
		groups.forEach((g, i) => {
			const m = groupMeans[i]!;
			ssb += g.length * (m - grandMean) ** 2;
		});

		let ssw = 0;
		groups.forEach((g, i) => {
			const m = groupMeans[i]!;
			g.forEach((x) => {
				ssw += (x - m) ** 2;
			});
		});

		const sst = ssb + ssw;
		const dfb = k - 1;
		const dfw = N - k;

		const msb = ssb / dfb;
		const msw = ssw / dfw;

		const fStat = msw > 0 ? msb / msw : 0;

		let pValue = 0;
		if (fStat > 0 && dfb > 0 && dfw > 0) {
			const x = dfw / (dfw + dfb * fStat);
			pValue = betaIncomplete(dfw / 2, dfb / 2, x);
		} else {
			pValue = 1;
		}

		// {value, valueZh} pair so a spread fills both row halves at once.
		const fmtP = (p: number): { value: string; valueZh: string } =>
			p < 0.0001
				? { value: '< 0.0001 (Highly Significant ***)', valueZh: '< 0.0001（高度显著 ***）' }
				: { value: `${(p * 100).toFixed(3)}% (p = ${formatNumber(p)})`, valueZh: `${(p * 100).toFixed(3)}%（p = ${formatNumber(p)}）` };

		return {
			rows: [
				{ label: 'F-Statistic', labelZh: 'F 检验统计量', value: formatNumber(fStat), emphasis: true },
				{ label: 'p-Value', labelZh: 'p-value 显著性概率', ...fmtP(pValue), emphasis: true },
				{ label: 'Between-Groups SS (SSB)', labelZh: '组间平方和 (SSB)', value: formatNumber(ssb) },
				{ label: 'Within-Groups SS (SSW)', labelZh: '组内平方和 (SSW / 残差)', value: formatNumber(ssw) },
				{ label: 'Total Sum of Squares (SST)', labelZh: '总平方和 (SST)', value: formatNumber(sst) },
				{ label: 'Degrees of Freedom (dfB / dfW)', labelZh: '自由度 (组间 dfB / 组内 dfW)', value: `${dfb} / ${dfw}` },
				{ label: 'Between-Groups MS (MSB)', labelZh: '组间均方 (MSB)', value: formatNumber(msb) },
				{ label: 'Within-Groups MS (MSW)', labelZh: '组内均方 (MSW)', value: formatNumber(msw) },
				{ label: 'Group Means', labelZh: '各组样本均值', value: groupMeans.map((m, i) => `G${i + 1}: ${formatNumber(m)}`).join('  |  ') },
			],
			note: pValue < 0.05
				? `Statistically significant difference between groups at α = 0.05 (F = ${formatNumber(fStat)}, p = ${formatNumber(pValue)} < 0.05). Reject H0.`
				: `No statistically significant difference between groups at α = 0.05 (F = ${formatNumber(fStat)}, p = ${formatNumber(pValue)} ≥ 0.05). Fail to reject H0.`,
			noteZh: pValue < 0.05
				? `在 α = 0.05 显著性水平下，各组总体均值差异具有统计学意义 (F = ${formatNumber(fStat)}, p = ${formatNumber(pValue)} < 0.05)，应拒绝原假设 H0。`
				: `在 α = 0.05 显著性水平下，未发现各组总体均值存在显著差异 (F = ${formatNumber(fStat)}, p = ${formatNumber(pValue)} ≥ 0.05)，无法拒绝原假设 H0。`,
		};
	},
};

// --- entries --------------------------------------------------------------------------

// Shared formatting for the econometrics tools (everything numeric flows
// through the validated core in ./econometrics; these helpers only format).
const ecoRow = (label: string, labelZh: string, value: string, valueZh = value) => ({ label, labelZh, value, valueZh });
const ecoFmt = (v: number): string => (Number.isFinite(v) ? formatNumber(v) : '—');
const ecoP = (p: number): string => (p < 1e-6 ? ecoFmt(p) : formatNumber(Number(p.toPrecision(4))));
const ecoGuard = (msg: string, msgZh: string) => ({ rows: [ecoRow('Result', '结果', `— ${msg}`, `— ${msgZh}`)] });
/** clamp an integer field to [lo, hi]; NaN or out-of-range returns null so
 *  the caller can emit a bilingual guard row. */
const ecoInt = (raw: number, lo: number, hi: number): number | null => {
	const n = Math.round(raw);
	return Number.isFinite(raw) && n >= lo && n <= hi ? n : null;
};

export const CALCULATOR_TOOLS: ToolEntry[] = [
	{
		slug: 'percentage',
		category: 'calculators',
		name: 'Percentage Calculator',
		nameZh: '百分比计算器',
		description: 'What is P% of V, N as a percent of V, and value increased or decreased by a percent.',
		descriptionZh: '快速计算数值的 P% 百分比、占比多少以及按百分比增减后的数值。',
		kind: 'form',
		config: percentage,
	},
	{
		slug: 'percentage-increase',
		category: 'calculators',
		name: 'Percentage Increase Calculator',
		nameZh: '百分比增减计算器',
		description: 'Percentage change between two values, with absolute change and multiplier.',
		descriptionZh: '计算两个数值之间的相对增长/下降百分比、绝对差值与变化倍数。',
		kind: 'form',
		config: percentageIncrease,
	},
	{
		slug: 'fraction',
		category: 'calculators',
		name: 'Fraction Calculator',
		nameZh: '分数计算器',
		description: 'Simplify fractions, convert to decimal and percent, and decimals back to exact fractions.',
		descriptionZh: '分数约分最简式、转小数与百分比，支持小数利用连分数逆向还原为精确分数。',
		kind: 'form',
		config: fraction,
	},
	{
		slug: 'ratio',
		category: 'calculators',
		name: 'Ratio & Proportion Calculator',
		nameZh: '比例与比例方程计算器',
		description: 'Simplify ratios, solve proportions A:B = C:x, and convert to decimal and percent.',
		descriptionZh: '化简比值为最简整数比，求解 A:B = C:x 比例方程与小数百分比互转。',
		kind: 'form',
		config: ratio,
	},
	// the finance overlaps live on /finance/*

	{
		slug: 'prime-factorization',
		category: 'calculators',
		name: 'Prime Factorization',
		nameZh: '质因数分解',
		description: 'Factor a whole number into primes as 2^3 × 3 × 5, with the divisor count.',
		descriptionZh: '把一个整数分解为质因数（如 2^3 × 3 × 5），并给出约数个数。',
		kind: 'form',
		config: {
			fields: [
				{
					id: 'number',
					label: 'Number',
					labelZh: '待分解整数',
					// bigint (text + numeric keypad), not number: an <input type=number>
					// round-trips through a JS Number, which stops being exact at 2^53 —
					// above that the factorization could not be trusted. BigInt holds the
					// whole 2..2^64−1 range exactly (Miller–Rabin is deterministic <2^64).
					type: 'bigint',
					def: '360',
					required: true,
					hint: 'Whole number 2 … 2^64−1 (up to 20 digits).',
					hintZh: '整数 2 … 2^64−1（最多 20 位）。',
				},
			],
			compute: (v) => {
				const n = v.bigint('number');
				if (n === null || n < 2n || n >= 1n << 64n) {
					return {
						rows: [
							{
								label: 'Result',
								labelZh: '计算结果',
								value: '— (enter a whole number from 2 to 2^64−1)',
								valueZh: '— (请输入 2 到 2^64−1 的整数)',
							},
						],
					};
				}
				const { factors, divisors } = factorWhole(n);
				const repr = factors
					.map(({ f, e }) => (e === 1 ? f.toString() : `${f}^${e}`))
					.join(' × ');
				return {
					rows: [
						{ label: 'Prime factorization', labelZh: '质因数分解', value: repr, valueZh: repr },
						{ label: 'Number of divisors', labelZh: '约数个数', value: String(divisors), valueZh: String(divisors) },
					],
				};
			},
		},
	},
	{
		slug: 'combinatorics',
		category: 'calculators',
		name: 'Combinations & Permutations',
		nameZh: '组合与排列计算器',
		description: 'Compute nCr (combinations), nPr (permutations) and n! with exact BigInt results.',
		descriptionZh: '精确计算组合数 nCr、排列数 nPr 与阶乘 n!，大数使用 BigInt 无溢出。',
		kind: 'form',
		config: {
			fields: [
				{ id: 'n', label: 'n', labelZh: '总数 n', type: 'number', def: '10', step: '1', min: '0', required: true },
				{ id: 'r', label: 'r (choose r)', labelZh: '选取数 r', type: 'number', def: '3', step: '1', min: '0', required: true },
			],
			compute: (v) => {
				const n = v.num('n');
				const r = v.num('r');
				if (!Number.isInteger(n) || !Number.isInteger(r) || n < 0 || r < 0 || r > n) {
					return {
						rows: [
							{
								label: 'Result',
								labelZh: '计算结果',
								value: '— (integers with 0 ≤ r ≤ n)',
								valueZh: '— (请输入满足 0 ≤ r ≤ n 的整数)',
							},
						],
					};
				}
				if (n > 2000) {
					return {
						rows: [
							{
								label: 'Result',
								labelZh: '计算结果',
								value: '— (n is capped at 2000)',
								valueZh: '— (n 上限为 2000)',
							},
						],
					};
				}
				const fac = (x: number) => {
					let p = 1n;
					for (let i = 2n; i <= BigInt(x); i++) p *= i;
					return p;
				};
				const facN = fac(n);
				const k = Math.min(r, n - r);
				let perm = 1n;
				for (let i = BigInt(n - r + 1); i <= BigInt(n); i++) perm *= i;
				let comb = 1n;
				for (let i = 1n; i <= BigInt(k); i++) {
					comb = (comb * (BigInt(n) - BigInt(k) + i)) / i;
				}
				return {
					rows: [
						{ label: 'n! (factorial)', labelZh: '阶乘 n!', value: facN.toString(), valueZh: facN.toString() },
						{ label: 'nPr (permutations)', labelZh: '排列数 nPr', value: perm.toString(), valueZh: perm.toString() },
						{ label: 'nCr (combinations)', labelZh: '组合数 nCr', value: comb.toString(), valueZh: comb.toString() },
					],
				};
			},
		},
	},
	{
		slug: 'descriptive-statistics',
		category: 'calculators',
		name: 'Descriptive Statistics',
		nameZh: '描述统计与线性回归',
		description: 'Sum, mean, median, mode, min/max and both sample & population standard deviation — plus optional simple linear regression.',
		descriptionZh: '求和、均值、中位数、众数、极值、样本与总体标准差，并可对 y 关于 x 做一元线性回归。',
		kind: 'form',
		config: {
			fields: [
				{
					id: 'y',
					label: 'Values (comma or space separated)',
					labelZh: '数值列表（逗号或空格分隔）',
					type: 'textarea',
					def: '1, 2, 3, 4, 5',
				},
				{
					id: 'x',
					label: 'Optional x (for linear regression)',
					labelZh: '可选 x 列表（用于线性回归）',
					type: 'textarea',
					def: '',
				},
			],
			compute: (v) => {
				// Univariate stats come from the shared computeStats() — one source for
				// both this tool and the retired /calculators/average page. parseNumbers
				// accepts spaces, commas, semicolons or new lines and reports (rather than
				// silently drops) entries that cannot be parsed.
				const { nums: y, invalid: badY } = parseNumbers(v.str('y'));
				const { nums: x, invalid: badX } = parseNumbers(v.str('x'));
				const s = computeStats(y);
				if (!s) {
					return {
						rows: [
							{
								label: 'Result',
								labelZh: '计算结果',
								value: '— (enter at least one value)',
								valueZh: '— (请至少输入一个数值)',
							},
						],
					};
				}
				// Sample variance divides by n−1, so a single value is 0/0 = NaN — render
				// the em dash (same as the retired average tool did) instead of a NaN row.
				const cell = (n: number) => (Number.isNaN(n) ? '—' : formatNumber(n));
				const row = (label: string, labelZh: string, v: string) => ({ label, labelZh, value: v, valueZh: v });
				const rows = [
					row('Count', '数据个数', String(s.count)),
					row('Sum', '总和', formatNumber(s.sum)),
					row('Mean', '平均值', formatNumber(s.mean)),
					row('Median', '中位数', formatNumber(s.median)),
					{
						label: 'Mode',
						labelZh: '众数',
						value: s.modes ? s.modes.map((m) => formatNumber(m)).join(', ') : '—',
						valueZh: s.modes ? s.modes.map((m) => formatNumber(m)).join(', ') : '—',
					},
					row('Min', '最小值', formatNumber(s.min)),
					row('Max', '最大值', formatNumber(s.max)),
					row('Sample variance', '样本方差', cell(s.varianceS)),
					row('Sample std. deviation', '样本标准差', cell(s.sdS)),
					row('Population std. deviation (σ)', '总体标准差 (σ)', cell(s.sdP)),
				];
				if (badY.length || badX.length) {
					const bad = [...badY, ...badX];
					rows.push({
						label: 'Ignoring invalid entries',
						labelZh: '已忽略的无效数据',
						value: bad.join('  '),
						valueZh: bad.join('  '),
					});
				}
				if (x.length === y.length && x.length >= 2) {
					const mx = x.reduce((a, b) => a + b, 0) / x.length;
					const sxy = x.reduce((a, xi, i) => a + (xi - mx) * (y[i] - s.mean), 0);
					const sxx = x.reduce((a, xi) => a + (xi - mx) ** 2, 0);
					if (sxx !== 0) {
						const slope = sxy / sxx;
						const inter = s.mean - slope * mx;
						rows.push(row('Regression slope (y ~ a + b·x)', '回归斜率 b', formatNumber(slope)));
						rows.push(row('Regression intercept', '回归截距 a', formatNumber(inter)));
					}
				}
				return { rows };
			},
		},
	},
	{
		slug: 'pi',
		category: 'calculators',
		name: 'Pi Calculator (π to 2,000 digits)',
		nameZh: '圆周率 π 计算器（精确至 2000 位）',
		description: 'Compute Pi (π) up to 2,000 decimal places using arbitrary-precision Machin formula, with Milü fractions and geometry properties.',
		descriptionZh: '使用高精度梅钦类公式计算圆周率 π 至小数点后 2000 位，包含祖冲之密率逼近与圆周长面积计算。',
		kind: 'form',
		config: piCalculator,
	},
	{
		slug: 'matrix',
		category: 'calculators',
		name: 'Matrix Calculator (Linear Algebra)',
		nameZh: '矩阵计算器（线性代数）',
		description: 'Perform matrix arithmetic and linear algebra operations: Determinant, Inverse, Trace, Transpose, Addition, and Multiplication.',
		descriptionZh: '线性代数常用矩阵运算工具：行列式求解、逆矩阵、矩阵的迹、转置矩阵以及矩阵加减与乘法。',
		kind: 'form',
		config: matrixCalculator,
	},
	{
		slug: 'equation-solver',
		category: 'calculators',
		name: 'Equation, Calculus & Limit Solver',
		nameZh: '方程求解、微积分与极限计算器',
		description: 'Solve quadratic and cubic equations, 2x2 linear systems, calculate numerical derivatives, definite integrals, and function limits (e.g. sin(x)/x as x→0).',
		descriptionZh: '一元二次与三次方程（含复数根）、二元一次线性方程组求解，以及数值微积分与极限求解（如 sin(x)/x 趋向 0 的极限）。',
		kind: 'form',
		config: equationSolver,
	},
	{
		slug: 'complex-number',
		category: 'calculators',
		name: 'Complex Numbers Calculator',
		nameZh: '复数计算器（代数与极坐标形式）',
		description: 'Perform complex arithmetic, rectangular to polar Euler form conversion, powers, roots, and complex functions.',
		descriptionZh: '复数代数运算与极坐标/欧拉形式互转，支持模长辐角、共轭、乘方、开方及复指数对数。',
		kind: 'form',
		config: complexCalculator,
	},
	{
		slug: 'vector',
		category: 'calculators',
		name: 'Vector Calculator (2D & 3D)',
		nameZh: '空间向量计算器（2D / 3D）',
		description: 'Calculate 2D and 3D vector magnitude, dot product, cross product, angle, projection, addition, and distance.',
		descriptionZh: '计算二维与三维向量的模长、点积、叉积、向量夹角、投影向量、向量加减及空间距离。',
		kind: 'form',
		config: vectorCalculator,
	},
	{
		slug: 'hypothesis-testing',
		category: 'calculators',
		name: 'Hypothesis Testing & p-Value Calculator',
		nameZh: '假设检验与 p 值计算器 (Z-Test / t-Test)',
		description: 'Perform Z-test and Student’s t-test for sample means, calculate p-values, test statistics, and 95%/99% confidence intervals.',
		descriptionZh: '支持单样本 Z 检验与 t 检验，精准计算检验统计量、单侧与双侧 p-value 显著性及置信区间。',
		kind: 'form',
		config: hypothesisTesting,
	},
	{
		slug: 'normal-distribution',
		category: 'calculators',
		name: 'Normal Distribution & Z-Score Calculator',
		nameZh: '正态分布与 Z-Score 分位数计算器',
		description: 'Calculate Z-score, cumulative probability P(X ≤ x), interval probability P(x1 ≤ X ≤ x2), and percentiles for any mean μ and std dev σ.',
		descriptionZh: '计算给定均值 μ 与标准差 σ 下的 Z-Score、累积分布概率 P(X ≤ x)、区间概率与标准百分位数。',
		kind: 'form',
		config: normalDistribution,
	},
	{
		slug: 'confidence-interval',
		category: 'calculators',
		name: 'Confidence Interval Calculator',
		nameZh: '均值与比例置信区间计算器',
		description: 'Calculate 90%, 95%, or 99% confidence intervals for sample means (t / Z distribution) and sample proportions with margin of error.',
		descriptionZh: '计算 90%、95% 或 99% 置信水平下的样本均值（t 分布 / Z 分布）与样本比例置信区间及抽样误差范围。',
		kind: 'form',
		config: confidenceInterval,
	},
	{
		slug: 'anova-calculator',
		category: 'calculators',
		name: 'One-Way ANOVA Calculator (Analysis of Variance)',
		nameZh: '单因素方差分析计算器 (One-Way ANOVA)',
		description: 'Perform One-Way ANOVA across 3 or 4 sample groups, with F-statistic, p-value, sum of squares (SSB/SSW), and mean squares.',
		descriptionZh: '多组样本数据的单因素方差分析 (ANOVA)，计算 F 检验统计量、p-value 显著性概率、组间/组内平方和与均方。',
		kind: 'form',
		config: anovaCalculator,
	},
	{
		slug: 'calculus',
		category: 'calculators',
		name: 'Calculus Calculator (Derivative · Integral · Limit)',
		nameZh: '微积分计算器（导数 · 定积分 · 极限）',
		description: 'Numerical derivative at a point, definite integral over an interval, and two-sided limits of any f(x) — powered by the site expression engine.',
		descriptionZh: '对任意 f(x) 求某点的数值导数、区间定积分与双侧极限——由站内表达式引擎驱动。',
		kind: 'form',
		config: {
			intro: 'One f(x), three modes. Derivatives use central differences; integrals use composite Simpson; limits probe both sides with shrinking steps.',
			introZh: '一个 f(x)，三种模式：导数用中心差分，定积分用复合辛普森法，极限从两侧以递减步长探测。',
			fields: [
				{ id: 'fx', label: 'f(x)', labelZh: 'f(x)', type: 'text', def: 'x^2 * sin(x)', placeholder: 'e.g. x^2 * sin(x)', placeholderZh: '例如 x^2 * sin(x)', required: true },
				{
					id: 'mode',
					label: 'Mode',
					labelZh: '模式',
					type: 'select',
					def: 'derivative',
					options: [
						{ value: 'derivative', label: "Derivative f'(x₀)" },
						{ value: 'integral', label: 'Definite integral ∫ₐᵇ' },
						{ value: 'limit', label: 'Limit x → x₀' },
					],
				},
				{ id: 'x0', label: 'x₀', labelZh: 'x₀', type: 'number', def: '1', step: 'any', showIf: (v) => v.str('mode') !== 'integral' },
				{ id: 'a', label: 'a (lower bound)', labelZh: 'a（下限）', type: 'number', def: '0', step: 'any', showIf: (v) => v.str('mode') === 'integral' },
				{ id: 'b', label: 'b (upper bound)', labelZh: 'b（上限）', type: 'number', def: '3.1415926', step: 'any', showIf: (v) => v.str('mode') === 'integral' },
			],
			compute: (v) => {
				const row = (label: string, labelZh: string, value: string, valueZh = value) => ({ label, labelZh, value, valueZh });
				const num = (x: number) => (Number.isFinite(x) ? formatNumber(x) : '—');
				let f: (x: number) => number;
				try {
					const g = compile(v.str('fx'));
					f = (x) => g({ vars: { x }, deg: false });
				} catch (err) {
					const msg = err instanceof Error ? err.message : 'invalid expression';
					return { rows: [row('Expression error', '表达式错误', `— (${msg})`)] };
				}
				const safe = (x: number): number => {
					const y = f(x);
					if (!Number.isFinite(y)) throw new Error('not finite');
					return y;
				};
				const mode = v.str('mode');
				if (mode === 'integral') {
					let a = v.num('a');
					let b = v.num('b');
					if (!Number.isFinite(a) || !Number.isFinite(b))
						return { rows: [row('Bounds', '积分区间', '— (a and b are required)', '— (需要填写 a 和 b)')] };
					const swapped = a > b;
					if (swapped) [a, b] = [b, a];
					// Composite Gauss–Legendre, 1000 evaluations per pass: the shipped
					// result is 20-node × 50 panels; the 10-node × 100-panel pass of
					// the same budget doubles as an error estimate (for smooth
					// integrands both are ~1e-15, so the estimate reads ≈ 0).
					try {
						const q20 = glQuadrature(safe, a, b, 50, GL20_N, GL20_W);
						const q10 = glQuadrature(safe, a, b, 100, GL10_N, GL10_W);
						return {
							rows: [
								row('∫ f(x) dx', '∫ f(x) dx', num(swapped ? -q20 : q20), num(swapped ? -q20 : q20)),
								row('Estimated error (two rules, same budget)', '误差估计（同预算两种规则）', num(Math.abs(q20 - q10))),
								row('Method', '方法', 'Composite Gauss–Legendre, 20 pt × 50 panels', '复合高斯-勒让德，20 点 × 50 分段'),
							],
							note: swapped ? 'a > b — the sign is flipped.' : undefined,
							noteZh: swapped ? 'a > b——结果已翻转换号。' : undefined,
						};
					} catch {
						return { rows: [row('Result', '结果', '— (f is not finite somewhere on [a, b])', '— (f 在 [a, b] 上有非有限值)')] };
					}
				}
				const x0 = v.num('x0');
				if (!Number.isFinite(x0)) return { rows: [row('Point', '点位', '— (x₀ is required)', '— (需要填写 x₀)')] };
				if (mode === 'limit') {
					const table = [1e-1, 1e-2, 1e-3, 1e-4, 1e-6, 1e-8].map((h) => {
						const r = safe(x0 + h);
						const l = safe(x0 - h);
						return [String(h), num(r), num(l)];
					});
					const right = f(x0 + 1e-8);
					const left = f(x0 - 1e-8);
					const agree = Number.isFinite(right) && Number.isFinite(left) && Math.abs(right - left) < 1e-4 * (1 + Math.abs(right));
					return {
						rows: [
							row('Right limit f(x₀+h)', '右极限 f(x₀+h)', num(right)),
							row('Left limit f(x₀−h)', '左极限 f(x₀−h)', num(left)),
							row(
								'Verdict',
								'结论',
								agree ? `both sides approach ${num(right)}` : 'no common limit (diverges, oscillates, or needs finer analysis)',
								agree ? `两侧都趋于 ${num(right)}` : '两侧无公共极限（发散、振荡或需更细分析）',
							),
						],
						table: { columns: ['h', 'f(x₀+h)', 'f(x₀−h)'], columnsZh: ['h', 'f(x₀+h)', 'f(x₀−h)'], rows: table },
					};
				}
				// derivative: central difference, h scaled to |x₀| (round-off sweet spot ≈ ε^⅓)
				const h = 6e-6 * Math.max(1, Math.abs(x0));
				try {
					const d1 = (safe(x0 + h) - safe(x0 - h)) / (2 * h);
					const d2 = (safe(x0 + h) - 2 * safe(x0) + safe(x0 - h)) / (h * h);
					return {
						rows: [
							row("f'(x₀)", "f'(x₀)", num(d1)),
							row('f″(x₀)', 'f″(x₀)', num(d2)),
							row('Method', '方法', 'Central difference, h ≈ 6·10⁻⁶·max(1, |x₀|)', '中心差分（自适应步长）'),
						],
					};
				} catch {
					return { rows: [row('Result', '结果', '— (f is not finite near x₀)', '— (f 在 x₀ 附近有非有限值)')] };
				}
			},
		},
	},
	{
		slug: 'polynomial-regression',
		category: 'calculators',
		name: 'Polynomial Regression',
		nameZh: '多项式回归拟合',
		description: 'Fit a polynomial of degree 1–5 to (x, y) data by least squares: coefficients, R², RMSE and the fitted equation.',
		descriptionZh: '对 (x, y) 数据做 1–5 次多项式最小二乘拟合：给出系数、R²、RMSE 与拟合方程。',
		kind: 'form',
		config: {
			intro: 'Paste points as "x, y" per line (spaces, commas or semicolons all separate). Degree 1 is plain linear regression.',
			introZh: '每行一个 "x, y" 点（逗号、空格、分号均可作分隔）。1 次即普通线性回归。',
			fields: [
				{
					id: 'points',
					label: 'Data points (x, y per line)',
					labelZh: '数据点（每行 x, y）',
					type: 'textarea',
					def: '0, 1\n1, 2.1\n2, 4.4\n3, 9.2\n4, 15.8\n5, 25.1',
				},
				{
					id: 'degree',
					label: 'Degree',
					labelZh: '次数',
					type: 'select',
					def: '2',
					options: [1, 2, 3, 4, 5].map((d) => ({ value: String(d), label: `${d}` })),
				},
			],
			compute: (v) => {
				const row = (label: string, labelZh: string, value: string, valueZh = value) => ({ label, labelZh, value, valueZh });
				const pts: [number, number][] = [];
				const bad: string[] = [];
				for (const line of v.str('points').split('\n')) {
					const t = line.trim();
					if (!t) continue;
					const m = t.split(/[,;\s]+/).filter(Boolean).map(Number);
					if (m.length === 2 && m.every(Number.isFinite)) pts.push([m[0] as number, m[1] as number]);
					else bad.push(t);
				}
				const deg = Number(v.str('degree')) || 1;
				if (pts.length < deg + 2)
					return { rows: [row('Result', '结果', `— (a degree-${deg} fit needs at least ${deg + 2} points, got ${pts.length})`, `—（${deg} 次拟合至少需要 ${deg + 2} 个点，当前 ${pts.length} 个）`)] };
				// normal equations A·c = b with A = Σ x^(i+j)
				const A: number[][] = [];
				const b: number[] = [];
				for (let i = 0; i <= deg; i++) {
					A.push([]);
					for (let j = 0; j <= deg; j++) {
						let s = 0;
						for (const [x] of pts) s += x ** (i + j);
						A[i]!.push(s);
					}
					let bi = 0;
					for (const [x, y] of pts) bi += y * x ** i;
					b.push(bi);
				}
				const c = gaussSolve(A, b);
				if (!c)
					return { rows: [row('Result', '结果', '— (singular system: the x values need more spread)', '—（矩阵奇异：x 取值需要更分散）')] };
				// R² and RMSE against the mean-baseline model
				const n = pts.length;
				const meanY = pts.reduce((s, [, y]) => s + y, 0) / n;
				let ssRes = 0;
				let ssTot = 0;
				for (const [x, y] of pts) {
					let fy = 0;
					for (let i = 0; i <= deg; i++) fy += (c[i] as number) * x ** i;
					ssRes += (y - fy) ** 2;
					ssTot += (y - meanY) ** 2;
				}
				const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 1;
				const rmse = Math.sqrt(ssRes / n);
				// ŷ = a₂x² + a₁x + a₀, highest degree first, signs inline
				const parts: string[] = [];
				for (let i = deg; i >= 0; i--) {
					const co = c[i] as number;
					const xp = i === 0 ? '' : i === 1 ? 'x' : `x^${i}`;
					const mag = formatNumber(Math.abs(co)) + xp;
					parts.push(parts.length === 0 ? (co < 0 ? `−${mag}` : mag) : `${co < 0 ? '−' : '+'} ${mag}`);
				}
				const eq = parts.join(' ');
				const rows = [
					{ label: 'Fitted equation', labelZh: '拟合方程', value: `ŷ = ${eq}`, valueZh: `ŷ = ${eq}` },
					row('R²', 'R²', formatNumber(r2)),
					row('RMSE', 'RMSE', formatNumber(rmse)),
					row('Points used', '使用点数', String(n)),
				];
				for (let i = deg; i >= 0; i--) rows.push(row(`Coefficient of x^${i}`, `x^${i} 的系数`, formatNumber(c[i] as number)));
				if (bad.length) rows.push(row('Ignored invalid lines', '已忽略的无效行', bad.slice(0, 5).join('  ')));
				return { rows };
			},
		},
	},
	{
		slug: 'probability-distribution',
		category: 'calculators',
		name: 'Probability Distribution (Binomial · Poisson)',
		nameZh: '概率分布（二项 · 泊松）',
		description: 'P(X = k), P(X ≤ k), mean and variance for binomial and Poisson distributions — computed in log space so huge n never overflows.',
		descriptionZh: '二项分布与泊松分布的 P(X = k)、P(X ≤ k)、均值与方差——对数空间计算，超大 n 也不会溢出。',
		kind: 'form',
		config: {
			intro: 'Binomial needs n and p; Poisson needs λ. k is the value to evaluate at.',
			introZh: '二项分布填 n 和 p；泊松分布填 λ。k 为待评估的取值。',
			fields: [
				{
					id: 'dist',
					label: 'Distribution',
					labelZh: '分布',
					type: 'select',
					def: 'binomial',
					options: [
						{ value: 'binomial', label: 'Binomial B(n, p)' },
						{ value: 'poisson', label: 'Poisson P(λ)' },
					],
				},
				{ id: 'n', label: 'n (trials)', labelZh: 'n（试验次数）', type: 'number', def: '20', step: '1', showIf: (v) => v.str('dist') === 'binomial' },
				{ id: 'p', label: 'p (success probability)', labelZh: 'p（成功概率）', type: 'number', def: '0.5', step: 'any', showIf: (v) => v.str('dist') === 'binomial' },
				{ id: 'lambda', label: 'λ (rate)', labelZh: 'λ（速率）', type: 'number', def: '3', step: 'any', showIf: (v) => v.str('dist') === 'poisson' },
				{ id: 'k', label: 'k (value)', labelZh: 'k（取值）', type: 'number', def: '5', step: '1' },
			],
			compute: (v) => {
				const row = (label: string, labelZh: string, value: string, valueZh = value) => ({ label, labelZh, value, valueZh });
				const fmtP = (x: number) => (x < 1e-10 ? '≈ 0' : x > 1 - 1e-10 ? '≈ 1' : formatNumber(x));
				const dist = v.str('dist');
				const k = Math.max(0, Math.floor(v.num('k') || 0));
				let pmf: (i: number) => number;
				let mean: number;
				let variance: number;
				if (dist === 'poisson') {
					const lam = v.num('lambda');
					if (!Number.isFinite(lam) || lam < 0)
						return { rows: [row('λ', 'λ', '— (λ must be ≥ 0)', '— (λ 需要 ≥ 0)')] };
					pmf = (i) => Math.exp(-lam + i * Math.log(lam || 1) - lgamma(i + 1));
					mean = lam;
					variance = lam;
				} else {
					const n = Math.floor(v.num('n'));
					const p = v.num('p');
					if (!Number.isFinite(n) || n < 0)
						return { rows: [row('n', 'n', '— (n must be ≥ 0)', '— (n 需要 ≥ 0)')] };
					if (!Number.isFinite(p) || p < 0 || p > 1)
						return { rows: [row('p', 'p', '— (p must be in [0, 1])', '— (p 需在 [0, 1] 之间)')] };
					pmf = (i) =>
						i > n || p === 0
							? i === 0 && p === 0 ? 1 : 0
							: Math.exp(lgamma(n + 1) - lgamma(i + 1) - lgamma(n - i + 1) + i * Math.log(p || 1) + (n - i) * Math.log(1 - p || 1));
					mean = n * p;
					variance = n * p * (1 - p);
				}
				const pk = pmf(k);
				let cdf = 0;
				for (let i = 0; i <= k && i <= 1e6; i++) cdf += pmf(i);
				const rows = [
					{ label: 'P(X = k)', labelZh: 'P(X = k)', value: fmtP(pk), valueZh: fmtP(pk), emphasis: true },
					row('P(X ≤ k)', 'P(X ≤ k)', fmtP(Math.min(1, cdf))),
					row('P(X > k)', 'P(X > k)', fmtP(Math.max(0, 1 - Math.min(1, cdf)))),
					row('Mean E[X]', '均值 E[X]', formatNumber(mean)),
					row('Variance Var[X]', '方差 Var[X]', formatNumber(variance)),
				];
				const table = {
					columns: ['i', 'P(X = i)', 'P(X ≤ i)'],
					columnsZh: ['i', 'P(X = i)', 'P(X ≤ i)'],
					rows: [] as string[][],
				};
				let acc = 0;
				const lo = Math.max(0, k - 2);
				for (let i = lo; i <= k + 2; i++) {
					acc += pmf(i);
					table.rows.push([String(i), fmtP(pmf(i)), fmtP(Math.min(1, acc))]);
				}
				return { rows, table };
			},
		},
		},
		{
			slug: 'linear-regression',
			category: 'calculators',
			name: 'Linear Regression (OLS · WLS · GLS)',
			nameZh: '线性回归（OLS · WLS · GLS）',
			description: 'Multiple linear regression with classical or robust standard errors (HC1–HC3, Newey–West HAC, cluster-robust) and AR(1) GLS — coefficients, t tests, R² and F.',
			descriptionZh: '多元线性回归：经典或稳健标准误（HC1–HC3、Newey–West HAC、聚类稳健），支持 AR(1) 广义最小二乘——系数、t 检验、R² 与 F 检验。',
			kind: 'form',
			config: {
				intro: 'One observation per line, columns separated by spaces/commas; the LAST column is the response. WLS takes one weight per row, cluster takes one group id per row.',
				introZh: '每行一个观测，列用空格或逗号分隔；最后一列为因变量。WLS 每行填一个权重，聚类每行填一个组编号。',
				fields: [
					{
						id: 'data',
						label: 'Data (x1 … xk, y per line)',
						labelZh: '数据（每行 x1 … xk, y）',
						type: 'textarea',
						def: 'ad_spend, price, sales\n1.2, 19.9, 98\n2.5, 21.0, 105\n3.1, 18.5, 118\n4.8, 22.1, 124\n5.0, 19.2, 138\n6.3, 23.4, 141\n7.1, 20.8, 152\n8.4, 22.7, 163\n9.0, 21.5, 171\n10.2, 24.0, 178\n11.5, 22.3, 194\n12.8, 23.9, 203\n13.5, 21.1, 216\n15.0, 23.6, 228',
					},
					{
						id: 'est',
						label: 'Estimator',
						labelZh: '估计方法',
						type: 'select',
						def: 'ols',
						options: [
							{ value: 'ols', label: 'OLS' },
							{ value: 'wls', label: 'WLS (row weights)' },
							{ value: 'gls', label: 'GLS (AR(1) errors)' },
						],
					},
					{
						id: 'weights',
						label: 'Weights (one per row, WLS only)',
						labelZh: '权重（WLS，每行一个）',
						type: 'textarea',
						def: '1\n1\n1\n2\n2\n2\n3\n3\n3\n4\n4\n4\n5\n5\n5',
						showIf: (v) => v.str('est') === 'wls',
					},
					{
						id: 'rho',
						label: 'ρ (AR(1) coefficient, |ρ| < 0.95)',
						labelZh: 'ρ（AR(1) 系数，|ρ| < 0.95）',
						type: 'number',
						def: '0.5',
						step: 'any',
						showIf: (v) => v.str('est') === 'gls',
					},
					{
						id: 'vcov',
						label: 'Standard errors',
						labelZh: '标准误',
						type: 'select',
						def: 'classical',
						options: [
							{ value: 'classical', label: 'Classical' },
							{ value: 'hc1', label: 'Robust HC1 (White)' },
							{ value: 'hc2', label: 'Robust HC2' },
							{ value: 'hc3', label: 'Robust HC3' },
							{ value: 'hac', label: 'HAC (Newey–West)' },
							{ value: 'cluster', label: 'Cluster-robust' },
						],
					},
					{
						id: 'hacLag',
						label: 'HAC lag truncation',
						labelZh: 'HAC 滞后阶数',
						type: 'number',
						def: '4',
						step: '1',
						showIf: (v) => v.str('vcov') === 'hac',
					},
					{
						id: 'clusters',
						label: 'Cluster ids (one per row)',
						labelZh: '聚类编号（每行一个）',
						type: 'textarea',
						def: '1\n1\n1\n1\n1\n2\n2\n2\n2\n2\n3\n3\n3\n3\n3',
						showIf: (v) => v.str('vcov') === 'cluster',
					},
				],
				compute: (v) => {
					const est = v.str('est');
					const vcov = v.str('vcov');
					const parsed = eco.parseColumns(v.str('data'), 2);
					if (parsed.cols.length < 2 || parsed.rows < 3)
						return ecoGuard('need at least 3 rows with 2+ columns', '至少需要 3 行、每行 2 列以上');
					const n = parsed.rows;
					const k = parsed.cols.length; // includes the response column
					if (n <= k)
						return ecoGuard(`too few observations (${n}) for ${k} columns`, `观测数（${n}）不足 ${k} 列`);
					const y = parsed.cols[parsed.cols.length - 1] as number[];
					const names = ['(intercept)'];
					for (let j = 1; j < parsed.cols.length - 1; j++) names.push(parsed.names[j] as string);
					const X = parsed.cols[0]!.map((_, i) => {
						const row = [1];
						for (let j = 0; j < parsed.cols.length - 2; j++) row.push(parsed.cols[j]![i] as number);
						return row;
					});
					let vinv: number[][] | null = null;
					if (est === 'wls') {
						const w = parseNumbers(v.str('weights')).nums;
						if (w.length !== n || w.some((s) => s <= 0))
							return ecoGuard(`WLS needs ${n} positive weights (one per row)`, `加权最小二乘需要 ${n} 个正权重（每行一个）`);
						vinv = eco.vinvDiag(w);
					} else if (est === 'gls') {
						const rho = v.num('rho');
						if (!Number.isFinite(rho) || Math.abs(rho) >= 0.95)
							return ecoGuard('ρ must satisfy |ρ| < 0.95', 'ρ 需满足 |ρ| < 0.95');
						vinv = eco.vinvAr1(rho, n);
					}
					const m = eco.fitWGLS(X, y, vinv, names);
					if (!m) return ecoGuard('singular design (a column is constant or collinear)', '设计矩阵奇异（某列为常数或共线）');
					let se: number[] = m.se;
					const rb = eco.robustBase(m);
					if (vcov === 'hc1' || vcov === 'hc2' || vcov === 'hc3') {
						const cov = eco.covHC(rb, vcov);
						se = cov.map((r, i) => Math.sqrt(Math.max(r[i], 0)));
					} else if (vcov === 'hac') {
						const lag = ecoInt(v.num('hacLag'), 0, n - 2);
						if (lag === null) return ecoGuard(`HAC lag must be 0–${n - 2}`, `滞后截断阶数需在 0–${n - 2}`);
						const cov = eco.covHAC(rb, lag);
						se = cov.map((r, i) => Math.sqrt(Math.max(r[i], 0)));
					} else if (vcov === 'cluster') {
						const ids = parseNumbers(v.str('clusters')).nums;
						if (ids.length !== n)
							return ecoGuard(`clustering needs ${n} group ids (one per row)`, `聚类需要与行数相同的 ${n} 个组编号`);
						const codes = new Map<number, number>();
						const groups = ids.map((g) => {
							if (!codes.has(g)) codes.set(g, codes.size);
							return codes.get(g) as number;
						});
						if (codes.size < 2) return ecoGuard('clustering needs at least 2 groups', '聚类至少需要 2 个组');
						const cov = eco.covCluster(rb, groups);
						if (!cov) return ecoGuard('clustering needs at least 2 groups', '聚类至少需要 2 个组');
						se = cov.map((r, i) => Math.sqrt(Math.max(r[i], 0)));
					}
					const df = n - k;
					const tvals = m.beta.map((b, i) => (se[i]! > 0 ? b / (se[i] as number) : b === 0 ? 0 : Infinity));
					const pvals = tvals.map((t) => (Number.isFinite(t) ? 2 * eco.tSurvival(df, Math.abs(t)) : t > 0 ? 0 : 1));
					const table = {
						columns: ['Term', 'Estimate', 'Std. error', 't', 'p'],
						columnsZh: ['变量', '估计值', '标准误', 't 值', 'p 值'],
						rows: names.map((nm, i) => [nm, ecoFmt(m.beta[i] as number), ecoFmt(se[i] as number), ecoFmt(tvals[i] as number), ecoP(pvals[i] as number)]),
					};
					const rows = [
						ecoRow('Observations', '观测数', String(n)),
						ecoRow('R²', 'R²', ecoFmt(m.r2)),
						ecoRow('Adjusted R²', '调整 R²', ecoFmt(m.adjR2)),
						ecoRow('F (joint significance)', 'F 检验（联合显著性）', `${ecoFmt(m.f)} (p = ${ecoP(m.fP)})`, `${ecoFmt(m.f)}（p = ${ecoP(m.fP)}）`),
						ecoRow('Residual std. error', '残差标准误', `${ecoFmt(m.sigma)} (df = ${df})`, `${ecoFmt(m.sigma)}（自由度 ${df}）`),
					];
					if (parsed.bad.length) rows.push(ecoRow('Ignored invalid lines', '已忽略的无效行', parsed.bad.slice(0, 5).join('  ')));
					return { rows, table };
				},
			},
		},
		{
			slug: 'ols-diagnostics',
			category: 'calculators',
			name: 'OLS Regression Diagnostics',
			nameZh: 'OLS 回归诊断',
			description: 'Heteroskedasticity (Breusch–Pagan, White), autocorrelation (Durbin–Watson, Breusch–Godfrey, Ljung–Box), normality (Jarque–Bera) and influence (leverage, Cook\'s distance, DFFITS) on a fitted regression.',
			descriptionZh: '对回归残差做全面诊断：异方差（Breusch–Pagan、White）、自相关（Durbin–Watson、Breusch–Godfrey、Ljung–Box）、正态性（Jarque–Bera）与强影响点（杠杆值、Cook 距离、DFFITS）。',
			kind: 'form',
			config: {
				intro: 'Rows are time-ordered observations: x columns first, the LAST column is the response. An intercept is added automatically.',
				introZh: '每行一个按时间排序的观测：前面是 x 列，最后一列为因变量，自动添加截距项。',
				fields: [
					{
						id: 'data',
						label: 'Data (x1 … xk, y per line)',
						labelZh: '数据（每行 x1 … xk, y）',
						type: 'textarea',
						def: 'month, ad_spend, sales\n1, 1.2, 96\n2, 1.8, 99\n3, 2.6, 108\n4, 3.1, 112\n5, 3.9, 121\n6, 4.4, 124\n7, 5.3, 133\n8, 6.0, 138\n9, 6.8, 145\n10, 7.5, 149\n11, 8.3, 158\n12, 9.1, 164\n13, 9.7, 167\n14, 10.6, 177\n15, 11.2, 180\n16, 12.0, 188\n17, 12.9, 197\n18, 13.6, 202\n19, 14.4, 209\n20, 15.1, 214',
					},
					{ id: 'bgLag', label: 'Breusch–Godfrey lags', labelZh: 'Breusch–Godfrey 滞后阶数', type: 'number', def: '4', step: '1' },
					{ id: 'lbLag', label: 'Ljung–Box lags', labelZh: 'Ljung–Box 滞后阶数', type: 'number', def: '10', step: '1' },
				],
				compute: (v) => {
					const parsed = eco.parseColumns(v.str('data'), 2);
					if (parsed.cols.length < 2 || parsed.rows < 8)
						return ecoGuard('need at least 8 rows with 2+ columns', '至少需要 8 行、每行 2 列以上');
					const n = parsed.rows;
					const k = parsed.cols.length;
					if (n <= k) return ecoGuard(`too few observations (${n}) for ${k} columns`, `观测数（${n}）不足 ${k} 列`);
					const bgLag = ecoInt(v.num('bgLag'), 1, Math.min(10, n - k - 2));
					if (bgLag === null)
						return ecoGuard(`Breusch–Godfrey lags must be 1–${Math.min(10, n - k - 2)}`, `BG 检验滞后阶数需在 1–${Math.min(10, n - k - 2)}`);
					const lbLag = ecoInt(v.num('lbLag'), 1, Math.min(40, n - 2));
					if (lbLag === null)
						return ecoGuard(`Ljung–Box lags must be 1–${Math.min(40, n - 2)}`, `LB 检验滞后阶数需在 1–${Math.min(40, n - 2)}`);
					const y = parsed.cols[parsed.cols.length - 1] as number[];
					const X = parsed.cols[0]!.map((_, i) => {
						const row = [1];
						for (let j = 0; j < parsed.cols.length - 2; j++) row.push(parsed.cols[j]![i] as number);
						return row;
					});
					const m = eco.fitWGLS(X, y, null);
					if (!m) return ecoGuard('singular design (a column is constant or collinear)', '设计矩阵奇异（某列为常数或共线）');
					const bp = eco.breuschPagan(m);
					const wh = eco.white(m);
					const dw = eco.durbinWatson(m.resid);
					const bg = eco.breuschGodfrey(m, bgLag);
					const lb = eco.ljungBox(m.resid, lbLag);
					const jb = eco.jarqueBera(m.resid);
					const inf = eco.influence(m);
					const levCut = (2 * m.k) / n;
					const levCount = inf.leverage.filter((h) => h > levCut).length;
					const cookMax = Math.max(...inf.cooks);
					const dffitsCut = 2 * Math.sqrt(m.k / n);
					const dffitsCount = inf.dffits.filter((d) => Math.abs(d) > dffitsCut).length;
					const verdict = (p: number): [string, string] => (p < 0.05 ? ['present', '存在'] : ['not detected', '未检出']);
					const bpV = bp ? verdict(bp.p) : ['—', '—'];
					const whV = wh ? verdict(wh.p) : ['— (a regressor never varies)', '—（某个回归量为常数）'];
					const rows = [
						ecoRow('Observations / parameters', '观测数 / 参数数', `${n} / ${m.k}`),
						ecoRow('Durbin–Watson', 'Durbin–Watson 统计量', ecoFmt(dw), ecoFmt(dw)),
						ecoRow('Breusch–Pagan LM (heteroskedasticity)', 'Breusch–Pagan LM（异方差）', bp ? `${ecoFmt(bp.stat)} (p = ${ecoP(bp.p)}) — ${bpV[0]}` : '—', bp ? `${ecoFmt(bp.stat)}（p = ${ecoP(bp.p)}）——${bpV[1]}` : '—'),
						ecoRow('White LM (heteroskedasticity)', 'White LM（异方差）', `${ecoFmt(wh ? wh.stat : NaN)} (p = ${ecoP(wh ? wh.p : NaN)}) — ${whV[0]}`, `${ecoFmt(wh ? wh.stat : NaN)}（p = ${ecoP(wh ? wh.p : NaN)}）——${whV[1]}`),
						ecoRow(`Breusch–Godfrey LM (AR(${bgLag}) errors)`, `Breusch–Godfrey LM（AR(${bgLag}) 误差）`, bg ? `${ecoFmt(bg.stat)} (p = ${ecoP(bg.p)}) — ${verdict(bg.p)[0]}` : '—', bg ? `${ecoFmt(bg.stat)}（p = ${ecoP(bg.p)}）——${verdict(bg.p)[1]}` : '—'),
						ecoRow(`Ljung–Box Q(${lbLag})`, `Ljung–Box Q(${lbLag})`, `${ecoFmt(lb.stat)} (p = ${ecoP(lb.p)}) — ${verdict(lb.p)[0]}`, `${ecoFmt(lb.stat)}（p = ${ecoP(lb.p)}）——${verdict(lb.p)[1]}`),
						ecoRow('Jarque–Bera (normality)', 'Jarque–Bera（正态性）', `${ecoFmt(jb.stat)} (p = ${ecoP(jb.p)}) — ${jb.p < 0.05 ? 'rejected' : 'not rejected'}`, `${ecoFmt(jb.stat)}（p = ${ecoP(jb.p)}）——${jb.p < 0.05 ? '拒绝正态' : '未拒绝正态'}`),
						ecoRow('High-leverage points (h > 2k/n)', '高杠杆点（h > 2k/n）', `${levCount} (cut-off ${ecoFmt(levCut)})`, `${levCount} 个（阈值 ${ecoFmt(levCut)}）`),
						ecoRow('Max Cook\'s distance', '最大 Cook 距离', ecoFmt(cookMax), ecoFmt(cookMax)),
						ecoRow(`|DFFITS| > ${ecoFmt(dffitsCut)}`, `|DFFITS| > ${ecoFmt(dffitsCut)} 的观测`, String(dffitsCount), `${dffitsCount} 个`),
					];
					if (parsed.bad.length) rows.push(ecoRow('Ignored invalid lines', '已忽略的无效行', parsed.bad.slice(0, 5).join('  ')));
					return { rows };
				},
			},
		},
		{
			slug: 'quantile-regression',
			category: 'calculators',
			name: 'Quantile Regression',
			nameZh: '分位数回归',
			description: 'Estimate conditional quantiles (median = τ 0.5) by minimising the check loss — robust to outliers and skewness that distort least squares.',
			descriptionZh: '通过最小化检查损失估计条件分位数（τ = 0.5 即中位数回归）——对扭曲最小二乘的离群值与偏态更稳健。',
			kind: 'form',
			config: {
				intro: 'Same layout as linear regression: x columns first, the LAST column is the response. The intercept is included automatically.',
				introZh: '与线性回归相同的格式：前面是 x 列，最后一列为因变量，自动包含截距。',
				fields: [
					{
						id: 'data',
						label: 'Data (x1 … xk, y per line)',
						labelZh: '数据（每行 x1 … xk, y）',
						type: 'textarea',
						def: 'hours, score\n1, 52\n2, 55\n2.5, 61\n3, 58\n3.5, 64\n4, 66\n5, 71\n5.5, 68\n6, 74\n7, 78\n7.5, 75\n8, 82\n9, 86\n9.5, 99\n10, 88\n11, 93\n12, 97\n13, 95\n14, 130\n15, 99',
					},
					{
						id: 'tau',
						label: 'Quantile τ',
						labelZh: '分位数 τ',
						type: 'select',
						def: '0.5',
						options: ['0.05', '0.1', '0.25', '0.5', '0.75', '0.9', '0.95'].map((t) => ({ value: t, label: `τ = ${t}` })),
					},
				],
				compute: (v) => {
					const tau = Number(v.str('tau'));
					const parsed = eco.parseColumns(v.str('data'), 2);
					if (parsed.cols.length < 2 || parsed.rows < 5)
						return ecoGuard('need at least 5 rows with 2+ columns', '至少需要 5 行、每行 2 列以上');
					const n = parsed.rows;
					if (n <= parsed.cols.length)
						return ecoGuard(`too few observations (${n}) for ${parsed.cols.length} columns`, `观测数（${n}）不足 ${parsed.cols.length} 列`);
					const y = parsed.cols[parsed.cols.length - 1] as number[];
					const names = ['(intercept)'];
					for (let j = 1; j < parsed.cols.length - 1; j++) names.push(parsed.names[j] as string);
					const X = parsed.cols[0]!.map((_, i) => {
						const row = [1];
						for (let j = 0; j < parsed.cols.length - 2; j++) row.push(parsed.cols[j]![i] as number);
						return row;
					});
					const fit = eco.rqFit(X, y, tau, names);
					if (!fit) return ecoGuard('the quantile fit did not converge for this data', '该数据的分位数拟合未收敛');
					const rows = [
						ecoRow('Quantile τ', '分位数 τ', v.str('tau')),
						ecoRow('Pseudo R² (Koenker–Machado)', '伪 R²（Koenker–Machado）', ecoFmt(fit.pseudoR2)),
						ecoRow('Observations', '观测数', String(n)),
						ecoRow('Iterations (annealed IRLS)', '迭代次数（退火 IRLS）', String(fit.iter)),
					];
					if (parsed.bad.length) rows.push(ecoRow('Ignored invalid lines', '已忽略的无效行', parsed.bad.slice(0, 5).join('  ')));
					const table = {
						columns: ['Term', 'Estimate'],
						columnsZh: ['变量', '估计值'],
						rows: names.map((nm, i) => [nm, ecoFmt(fit.beta[i] as number)]),
					};
					return { rows, table };
				},
			},
		},
		{
			slug: 'mixed-effects-model',
			category: 'calculators',
			name: 'Mixed Effects Model (Random Intercept)',
			nameZh: '混合效应模型（随机截距）',
			description: 'Linear mixed model by maximum likelihood: fixed effects with random intercepts (and an optional random slope) across groups, plus ICC and variance components.',
			descriptionZh: '极大似然线性混合模型：固定效应 + 跨组随机截距（可选随机斜率），给出 ICC 与方差分解。',
			kind: 'form',
			config: {
				intro: 'The FIRST column is the group id, the LAST column is the response; columns in between are fixed-effect regressors. An intercept is added automatically.',
				introZh: '第一列为组编号，最后一列为因变量，中间各列为固定效应自变量，自动添加截距。',
				fields: [
					{
						id: 'data',
						label: 'Data (group, x1 … xk, y per line)',
						labelZh: '数据（每行 组, x1 … xk, y）',
						type: 'textarea',
						def: 'school, hours, score\n1, 2, 55\n1, 4, 62\n1, 6, 68\n1, 8, 74\n2, 2, 63\n2, 4, 70\n2, 6, 78\n2, 8, 84\n3, 2, 48\n3, 4, 55\n3, 6, 61\n3, 8, 66\n4, 2, 70\n4, 4, 77\n4, 6, 84\n4, 8, 92\n5, 2, 52\n5, 4, 59\n5, 6, 66\n5, 8, 73',
					},
					{
						id: 'slope',
						label: 'Random slope',
						labelZh: '随机斜率',
						type: 'select',
						def: 'none',
						options: [
							{ value: 'none', label: 'None (random intercept only)' },
							{ value: 'x1', label: 'On the first regressor' },
						],
					},
				],
				compute: (v) => {
					const parsed = eco.parseColumns(v.str('data'), 3);
					if (parsed.cols.length < 3 || parsed.rows < 8)
						return ecoGuard('need at least 8 rows with 3+ columns (group, x, y)', '至少需要 8 行、3 列以上（组、x、y）');
					const n = parsed.rows;
					const nX = parsed.cols.length - 2;
					if (n <= parsed.cols.length)
						return ecoGuard(`too few observations (${n}) for this design`, `观测数（${n}）不足`);
					const groups = parsed.cols[0] as number[];
					const y = parsed.cols[parsed.cols.length - 1] as number[];
					const names = ['(intercept)'];
					for (let j = 2; j < parsed.cols.length - 1; j++) names.push(parsed.names[j] as string);
					const X = parsed.cols[0]!.map((_, i) => {
						const row = [1];
						for (let j = 1; j < parsed.cols.length - 2; j++) row.push(parsed.cols[j]![i] as number);
						return row;
					});
					const slopeCol = v.str('slope') === 'x1' && nX >= 1 ? 1 : null;
					const fit = eco.lmmFit(X, y, groups, slopeCol, names);
					if (!fit) return ecoGuard('the mixed model did not converge for this data', '该数据的混合模型未收敛');
					const table = {
						columns: ['Fixed effect', 'Estimate', 'Std. error', 't', 'p'],
						columnsZh: ['固定效应', '估计值', '标准误', 't 值', 'p 值'],
						rows: names.map((nm, i) => [nm, ecoFmt(fit.beta[i] as number), ecoFmt(fit.se[i] as number), ecoFmt(fit.tstat[i] as number), ecoP(fit.pval[i] as number)]),
					};
					const rows = [
						ecoRow('Groups', '组数', String(fit.groupCount)),
						ecoRow('Observations', '观测数', String(n)),
						ecoRow('Random intercept sd σ_u0', '随机截距标准差 σ_u0', ecoFmt(fit.sigmaU0)),
						ecoRow('Random slope sd σ_u1', '随机斜率标准差 σ_u1', slopeCol === null ? '—' : ecoFmt(fit.sigmaU1), slopeCol === null ? '—' : ecoFmt(fit.sigmaU1)),
						ecoRow('Residual sd σ_e', '残差标准差 σ_e', ecoFmt(fit.sigmaE)),
						ecoRow('ICC (share of variance between groups)', 'ICC（组间方差占比）', ecoFmt(fit.icc)),
						ecoRow('Log-likelihood', '对数似然', ecoFmt(fit.logLik)),
						ecoRow('AIC / BIC', 'AIC / BIC', `${ecoFmt(fit.aic)} / ${ecoFmt(fit.bic)}`),
					];
					if (parsed.bad.length) rows.push(ecoRow('Ignored invalid lines', '已忽略的无效行', parsed.bad.slice(0, 5).join('  ')));
					return { rows, table };
				},
			},
		},
		{
			slug: 'logistic-regression',
			category: 'calculators',
			name: 'Logistic Regression (Logit · Probit)',
			nameZh: '逻辑回归（Logit · Probit）',
			description: 'Binary outcome regression by iteratively reweighted least squares: coefficients, z tests, likelihood-ratio test, AIC/BIC and average marginal effects.',
			descriptionZh: '二分类结果的 IRLS 回归：系数、z 检验、似然比检验、AIC/BIC 与平均边际效应。',
			kind: 'form',
			config: {
				intro: 'The LAST column is the binary response (0/1); earlier columns are regressors. An intercept is added automatically.',
				introZh: '最后一列为二分类因变量（0/1），前面各列为自变量，自动添加截距。',
				fields: [
					{
						id: 'data',
						label: 'Data (x1 … xk, y ∈ {0, 1} per line)',
						labelZh: '数据（每行 x1 … xk, y ∈ {0, 1}）',
						type: 'textarea',
						def: 'hours, attended, passed\n2, 1, 0\n3, 0, 0\n4, 1, 0\n5, 0, 1\n6, 1, 0\n6, 0, 1\n7, 1, 1\n8, 0, 1\n8, 1, 1\n9, 0, 1\n9, 1, 0\n10, 0, 1\n10, 1, 1\n11, 0, 1\n11, 1, 1\n12, 1, 1\n12, 0, 1\n13, 1, 1\n13, 0, 1\n14, 1, 1',
					},
					{
						id: 'family',
						label: 'Model',
						labelZh: '模型',
						type: 'select',
						def: 'logit',
						options: [
							{ value: 'logit', label: 'Logit' },
							{ value: 'probit', label: 'Probit' },
						],
					},
				],
				compute: (v) => {
					const fam = v.str('family') === 'probit' ? 'probit' : 'logit';
					const parsed = eco.parseColumns(v.str('data'), 2);
					if (parsed.cols.length < 2 || parsed.rows < 8)
						return ecoGuard('need at least 8 rows with 2+ columns', '至少需要 8 行、每行 2 列以上');
					const n = parsed.rows;
					if (n <= parsed.cols.length)
						return ecoGuard(`too few observations (${n}) for ${parsed.cols.length} columns`, `观测数（${n}）不足 ${parsed.cols.length} 列`);
					const y = parsed.cols[parsed.cols.length - 1] as number[];
					if (y.some((v2) => v2 !== 0 && v2 !== 1))
						return ecoGuard('the last column must be 0 or 1 for every row', '最后一列每行必须为 0 或 1');
					if (y.every((v2) => v2 === 0) || y.every((v2) => v2 === 1))
						return ecoGuard('the response needs both 0s and 1s', '因变量需要同时含有 0 和 1');
					const names = ['(intercept)'];
					for (let j = 1; j < parsed.cols.length - 1; j++) names.push(parsed.names[j] as string);
					const X = parsed.cols[0]!.map((_, i) => {
						const row = [1];
						for (let j = 0; j < parsed.cols.length - 2; j++) row.push(parsed.cols[j]![i] as number);
						return row;
					});
					const fit = eco.irls(X, y, { family: fam }, names);
					if (!fit || !fit.converged)
						return ecoGuard('the fit did not converge (possible perfect separation)', '拟合未收敛（可能存在完全分离）');
					const me = eco.marginalEffects(X, fit.beta, fam);
					const table = {
						columns: ['Term', 'Estimate', 'Std. error', 'z', 'p'],
						columnsZh: ['变量', '估计值', '标准误', 'z 值', 'p 值'],
						rows: names.map((nm, i) => [nm, ecoFmt(fit.beta[i] as number), ecoFmt(fit.se[i] as number), ecoFmt(fit.zstat[i] as number), ecoP(fit.pval[i] as number)]),
					};
					const rows: { label: string; labelZh: string; value: string; valueZh?: string }[] = [
						ecoRow('Observations (1s / 0s)', '观测数（1 / 0）', `${n} (${y.filter((v2) => v2 === 1).length} / ${y.filter((v2) => v2 === 0).length})`),
						ecoRow('Log-likelihood', '对数似然', ecoFmt(fit.logLik)),
						ecoRow('LR test vs intercept-only', '对仅截距模型的似然比检验', `χ²(${fit.lrDf}) = ${ecoFmt(fit.lrStat)} (p = ${ecoP(fit.lrP)})`, `χ²(${fit.lrDf}) = ${ecoFmt(fit.lrStat)}（p = ${ecoP(fit.lrP)}）`),
						ecoRow('AIC / BIC', 'AIC / BIC', `${ecoFmt(fit.aic)} / ${ecoFmt(fit.bic)}`),
					];
					for (let i = 1; i < names.length; i++) {
						rows.push(ecoRow(
							`Avg. marginal effect of ${names[i]}`,
							`${names[i]} 的平均边际效应`,
							ecoFmt(me ? (me.ame[i] as number) : NaN),
						));
					}
					if (parsed.bad.length) rows.push(ecoRow('Ignored invalid lines', '已忽略的无效行', parsed.bad.slice(0, 5).join('  ')));
					return { rows, table };
				},
			},
		},
		{
			slug: 'count-regression',
			category: 'calculators',
			name: 'Count Regression (Poisson · NB · ZIP)',
			nameZh: '计数回归（泊松 · 负二项 · 零膨胀）',
			description: 'Poisson, negative binomial (ML dispersion) and zero-inflated models for count outcomes, with overdispersion diagnostics and AIC comparison.',
			descriptionZh: '针对计数型因变量的泊松、负二项（极大似然估计离散参数）与零膨胀模型，含过散度诊断与 AIC 比较。',
			kind: 'form',
			config: {
				intro: 'The LAST column is a non-negative integer count; earlier columns are regressors. ZIP adds a constant structural-zero probability.',
				introZh: '最后一列为非负整数计数，前面各列为自变量。ZIP 额外估计一个常数结构零概率。',
				fields: [
					{
						id: 'data',
						label: 'Data (x1 … xk, y counts per line)',
						labelZh: '数据（每行 x1 … xk, y 计数）',
						type: 'textarea',
						def: 'visitors, complaints, tickets\n12, 1, 0\n18, 0, 1\n25, 2, 3\n30, 1, 2\n35, 3, 4\n40, 2, 3\n44, 1, 5\n50, 4, 6\n55, 3, 7\n60, 5, 8\n65, 4, 9\n70, 6, 11\n75, 5, 12\n80, 7, 14\n85, 6, 15\n90, 8, 17\n95, 7, 18\n100, 9, 21\n105, 8, 22\n110, 10, 25',
					},
					{
						id: 'family',
						label: 'Model',
						labelZh: '模型',
						type: 'select',
						def: 'poisson',
						options: [
							{ value: 'poisson', label: 'Poisson' },
							{ value: 'nbinom', label: 'Negative binomial (NB2)' },
							{ value: 'zip', label: 'Zero-inflated Poisson' },
							{ value: 'zinb', label: 'Zero-inflated NB' },
						],
					},
				],
				compute: (v) => {
					const fam = v.str('family');
					const parsed = eco.parseColumns(v.str('data'), 2);
					if (parsed.cols.length < 2 || parsed.rows < 8)
						return ecoGuard('need at least 8 rows with 2+ columns', '至少需要 8 行、每行 2 列以上');
					const n = parsed.rows;
					if (n <= parsed.cols.length)
						return ecoGuard(`too few observations (${n}) for ${parsed.cols.length} columns`, `观测数（${n}）不足 ${parsed.cols.length} 列`);
					const y = parsed.cols[parsed.cols.length - 1] as number[];
					if (y.some((v2) => v2 < 0 || !Number.isInteger(v2)))
						return ecoGuard('the last column must be non-negative integers', '最后一列必须是非负整数');
					const names = ['(intercept)'];
					for (let j = 1; j < parsed.cols.length - 1; j++) names.push(parsed.names[j] as string);
					const X = parsed.cols[0]!.map((_, i) => {
						const row = [1];
						for (let j = 0; j < parsed.cols.length - 2; j++) row.push(parsed.cols[j]![i] as number);
						return row;
					});
					const rows: { label: string; labelZh: string; value: string; valueZh?: string }[] = [];
					let table: { columns: string[]; columnsZh: string[]; rows: string[][] };
					if (fam === 'zip' || fam === 'zinb') {
						const count = fam === 'zip' ? 'poisson' : 'nbinom';
						if (y.every((v2) => v2 > 0))
							return ecoGuard('zero-inflated models need some zero counts', '零膨胀模型要求因变量含有 0');
						const fit = eco.zipFit(X, y, count);
						if (!fit) return ecoGuard('the zero-inflated fit did not converge', '零膨胀模型拟合未收敛');
						table = {
							columns: ['Term', 'Estimate', 'Std. error', 'z', 'p'],
							columnsZh: ['变量', '估计值', '标准误', 'z 值', 'p 值'],
							rows: names.map((nm, i) => [nm, ecoFmt(fit.count.beta[i] as number), ecoFmt(fit.count.se[i] as number), ecoFmt(fit.count.zstat[i] as number), ecoP(fit.count.pval[i] as number)]),
						};
						rows.push(ecoRow('Structural-zero probability π', '结构零概率 π', ecoFmt(fit.pi)));
						rows.push(ecoRow('Count model', '计数部分模型', count === 'poisson' ? 'Poisson (log link)' : 'Negative binomial (log link)', count === 'poisson' ? '泊松（对数连接）' : '负二项（对数连接）'));
						if (count === 'nbinom') rows.push(ecoRow('Dispersion α (variance = μ + αμ²)', '离散参数 α（方差 = μ + αμ²）', ecoFmt(fit.count.alpha)));
						rows.push(ecoRow('Log-likelihood', '对数似然', ecoFmt(fit.logLik)));
						rows.push(ecoRow('AIC / BIC', 'AIC / BIC', `${ecoFmt(fit.aic)} / ${ecoFmt(fit.bic)}`));
					} else {
						const fit = fam === 'nbinom' ? eco.nbFit(X, y, names) : eco.irls(X, y, { family: 'poisson' }, names);
						if (!fit || !fit.converged)
							return ecoGuard('the fit did not converge', '拟合未收敛');
						table = {
							columns: ['Term', 'Estimate', 'Std. error', 'z', 'p'],
							columnsZh: ['变量', '估计值', '标准误', 'z 值', 'p 值'],
							rows: names.map((nm, i) => [nm, ecoFmt(fit.beta[i] as number), ecoFmt(fit.se[i] as number), ecoFmt(fit.zstat[i] as number), ecoP(fit.pval[i] as number)]),
						};
						// overdispersion check: Pearson χ² / df under a Poisson view
						if (fam === 'poisson') {
							let chi2 = 0;
							for (let i = 0; i < n; i++) chi2 += ((y[i]! - fit.fitted[i]!) ** 2) / Math.max(fit.fitted[i] as number, 1e-12);
							const ratio = chi2 / (n - fit.k);
							rows.push(ecoRow('Pearson χ² / df (overdispersion)', 'Pearson χ² / 自由度（过散度）', `${ecoFmt(ratio)}${ratio > 1.5 ? ' — overdispersed, consider NB' : ''}`, `${ecoFmt(ratio)}${ratio > 1.5 ? '——过散，建议负二项' : ''}`));
						} else {
							rows.push(ecoRow('Dispersion α (variance = μ + αμ²)', '离散参数 α（方差 = μ + αμ²）', ecoFmt(fit.alpha)));
						}
						rows.push(ecoRow('Log-likelihood', '对数似然', ecoFmt(fit.logLik)));
						rows.push(ecoRow('LR test vs intercept-only', '对仅截距模型的似然比检验', `χ²(${fit.lrDf}) = ${ecoFmt(fit.lrStat)} (p = ${ecoP(fit.lrP)})`, `χ²(${fit.lrDf}) = ${ecoFmt(fit.lrStat)}（p = ${ecoP(fit.lrP)}）`));
						rows.push(ecoRow('AIC / BIC', 'AIC / BIC', `${ecoFmt(fit.aic)} / ${ecoFmt(fit.bic)}`));
					}
					rows.unshift(ecoRow('Observations', '观测数', String(n)));
					if (parsed.bad.length) rows.push(ecoRow('Ignored invalid lines', '已忽略的无效行', parsed.bad.slice(0, 5).join('  ')));
					return { rows, table };
				},
			},
		},
		{
			slug: 'time-series-stationarity',
			category: 'calculators',
			name: 'Stationarity Tests (ADF · KPSS)',
			nameZh: '平稳性检验（ADF · KPSS）',
			description: 'Augmented Dickey–Fuller (unit-root null) and KPSS (stationarity null) tests with MacKinnon and Kwiatkowski critical values — they confirm each other from opposite directions.',
			descriptionZh: '增广 Dickey–Fuller 检验（单位根原假设）与 KPSS 检验（平稳原假设），附 MacKinnon 与 Kwiatkowski 临界值——两个方向互相印证。',
			kind: 'form',
			config: {
				intro: 'One observation per line, in time order. ADF lags can be chosen by AIC automatically; KPSS uses Schwert\'s rule unless overridden.',
				introZh: '每行一个观测，按时间顺序排列。ADF 滞后阶数可按 AIC 自动选择；KPSS 默认用 Schwert 准则，也可手动指定。',
				fields: [
					{
						id: 'data',
						label: 'Series (one value per line)',
						labelZh: '序列（每行一个数值）',
						type: 'textarea',
						def: '100.2\n101.1\n100.8\n102.3\n103.0\n102.5\n104.1\n105.3\n104.8\n106.2\n107.0\n106.5\n108.1\n109.0\n108.4\n110.2\n111.1\n110.6\n112.3\n113.0\n112.5\n114.1\n115.0\n114.6\n116.2\n117.1\n116.5\n118.0\n119.2\n118.7\n120.1\n121.0\n120.6\n122.3\n123.0\n122.5\n124.1\n125.2\n124.8\n126.0',
					},
					{
						id: 'adfTrend',
						label: 'ADF deterministic terms',
						labelZh: 'ADF 确定性项',
						type: 'select',
						def: 'drift',
						options: [
							{ value: 'none', label: 'None' },
							{ value: 'drift', label: 'Constant (drift)' },
							{ value: 'trend', label: 'Constant + trend' },
						],
					},
					{
						id: 'adfLagMode',
						label: 'ADF lag order',
						labelZh: 'ADF 滞后阶数',
						type: 'select',
						def: 'auto',
						options: [
							{ value: 'auto', label: 'Automatic (AIC)' },
							{ value: 'manual', label: 'Manual' },
						],
					},
					{ id: 'adfLag', label: 'ADF lags (manual)', labelZh: 'ADF 滞后（手动）', type: 'number', def: '1', step: '1', showIf: (v) => v.str('adfLagMode') === 'manual' },
					{
						id: 'kpssTrend',
						label: 'KPSS specification',
						labelZh: 'KPSS 设定',
						type: 'select',
						def: 'level',
						options: [
							{ value: 'level', label: 'Level stationary' },
							{ value: 'trend', label: 'Trend stationary' },
						],
					},
					{
						id: 'kpssLagMode',
						label: 'KPSS lag truncation',
						labelZh: 'KPSS 滞后截断',
						type: 'select',
						def: 'auto',
						options: [
							{ value: 'auto', label: "Schwert's rule" },
							{ value: 'manual', label: 'Manual' },
						],
					},
					{ id: 'kpssLag', label: 'KPSS lags (manual)', labelZh: 'KPSS 滞后（手动）', type: 'number', def: '3', step: '1', showIf: (v) => v.str('kpssLagMode') === 'manual' },
				],
				compute: (v) => {
					const series = parseNumbers(v.str('data')).nums;
					if (series.length < 12) return ecoGuard('need at least 12 observations', '至少需要 12 个观测');
					const n = series.length;
					const trendMap: Record<string, 'none' | 'drift' | 'trend'> = { none: 'none', drift: 'drift', trend: 'trend' };
					const adfTrend = trendMap[v.str('adfTrend')] ?? 'drift';
					let adfRes;
					const maxAuto = Math.min(eco.adfLagMax(n), n - 8);
					if (v.str('adfLagMode') === 'manual') {
						const lag = ecoInt(v.num('adfLag'), 0, maxAuto);
						if (lag === null) return ecoGuard(`ADF lags must be 0–${maxAuto}`, `ADF 滞后阶数需在 0–${maxAuto}`);
						adfRes = eco.adf(series, lag, adfTrend);
					} else {
						adfRes = eco.adfAuto(series, adfTrend);
					}
					const kpssTrend = v.str('kpssTrend') === 'trend' ? 'trend' : 'level';
					let kpssRes;
					if (v.str('kpssLagMode') === 'manual') {
						const lag = ecoInt(v.num('kpssLag'), 0, n - 2);
						if (lag === null) return ecoGuard(`KPSS lags must be 0–${n - 2}`, `KPSS 滞后阶数需在 0–${n - 2}`);
						kpssRes = eco.kpss(series, kpssTrend, lag);
					} else {
						kpssRes = eco.kpss(series, kpssTrend);
					}
					if (!adfRes || !kpssRes) return ecoGuard('the series is too short for these settings', '该序列对当前设定太短');
					const rows: { label: string; labelZh: string; value: string; valueZh?: string }[] = [
						ecoRow('Observations', '观测数', String(n)),
					];
					const adfVerdict = adfRes.stat < adfRes.cv[1] ? 'reject unit root' : 'unit root not rejected';
					const adfVerdictZh = adfRes.stat < adfRes.cv[1] ? '拒绝单位根' : '无法拒绝单位根';
					rows.push(ecoRow(
						`ADF t statistic (${adfTrend === 'none' ? 'no constant' : adfTrend === 'drift' ? 'constant' : 'constant + trend'}, ${adfRes.lags} lag${adfRes.lags === 1 ? '' : 's'})`,
						`ADF t 统计量（${adfTrend === 'none' ? '无常数项' : adfTrend === 'drift' ? '含常数' : '常数 + 趋势'}，${adfRes.lags} 阶滞后）`,
						`${ecoFmt(adfRes.stat)} — ${adfVerdict}`,
						`${ecoFmt(adfRes.stat)}——${adfVerdictZh}`,
					));
					rows.push(ecoRow('ADF critical values (1% / 5% / 10%)', 'ADF 临界值（1% / 5% / 10%）', adfRes.cv.map((c) => ecoFmt(c)).join(' / ')));
					const kpssVerdict = kpssRes.stat > kpssRes.cv[1] ? 'reject stationarity' : 'stationarity not rejected';
					const kpssVerdictZh = kpssRes.stat > kpssRes.cv[1] ? '拒绝平稳' : '无法拒绝平稳';
					rows.push(ecoRow(
						`KPSS η statistic (${kpssTrend === 'level' ? 'level' : 'trend'}, ${kpssRes.lags} lags)`,
						`KPSS η 统计量（${kpssTrend === 'level' ? '水平平稳' : '趋势平稳'}，${kpssRes.lags} 阶）`,
						`${ecoFmt(kpssRes.stat)} — ${kpssVerdict}`,
						`${ecoFmt(kpssRes.stat)}——${kpssVerdictZh}`,
					));
					rows.push(ecoRow('KPSS critical values (10% / 5% / 1%)', 'KPSS 临界值（10% / 5% / 1%）', kpssRes.cv.map((c) => ecoFmt(c)).join(' / ')));
					return {
						rows,
						note: 'ADF critical values: MacKinnon (2010), asymptotic. KPSS critical values: Kwiatkowski et al. (1992), Table 1.',
						noteZh: 'ADF 临界值取自 MacKinnon（2010）渐近表；KPSS 临界值取自 Kwiatkowski 等（1992）表 1。',
					};
				},
			},
		},
		{
			slug: 'arima-forecast',
			category: 'calculators',
			name: 'ARIMA Forecast (SARIMAX)',
			nameZh: 'ARIMA 预测（SARIMAX）',
			description: 'Fit ARIMA/SARIMAX by conditional-sum-of-squares maximum likelihood (parameters constrained to be stable and invertible) and forecast with 95% intervals.',
			descriptionZh: '以条件平方和极大似然拟合 ARIMA/SARIMAX（参数约束为稳定可逆），并给出带 95% 置信区间的预测。',
			kind: 'form',
			config: {
				intro: 'One value per line in time order. Seasonal terms (P, D, Q at period m) apply when set above zero; m = 12 for monthly, 4 for quarterly data.',
				introZh: '每行一个数值，按时间顺序。季节项（周期 m 上的 P、D、Q）设为非零时生效；月度数据 m = 12，季度数据 m = 4。',
				fields: [
					{
						id: 'data',
						label: 'Series (one value per line)',
						labelZh: '序列（每行一个数值）',
						type: 'textarea',
						def: '42\n43\n45\n44\n46\n48\n47\n49\n52\n51\n54\n53\n56\n58\n57\n60\n62\n61\n64\n63\n66\n68\n67\n70\n73\n72\n75\n74\n77\n79\n78\n81\n80\n83\n85\n84\n87\n86\n89\n91\n90\n93\n92\n95\n97\n96\n99\n98\n101\n103\n102\n105\n104\n107\n109\n108\n111\n110\n113\n115',
					},
					{ id: 'p', label: 'p (AR order)', labelZh: 'p（AR 阶数）', type: 'number', def: '1', step: '1' },
					{ id: 'd', label: 'd (differences)', labelZh: 'd（差分阶数）', type: 'number', def: '1', step: '1' },
					{ id: 'q', label: 'q (MA order)', labelZh: 'q（MA 阶数）', type: 'number', def: '1', step: '1' },
					{ id: 'P', label: 'P (seasonal AR)', labelZh: 'P（季节 AR）', type: 'number', def: '0', step: '1' },
					{ id: 'D', label: 'D (seasonal diff)', labelZh: 'D（季节差分）', type: 'number', def: '0', step: '1' },
					{ id: 'Q', label: 'Q (seasonal MA)', labelZh: 'Q（季节 MA）', type: 'number', def: '0', step: '1' },
					{ id: 'm', label: 'm (seasonal period)', labelZh: 'm（季节周期）', type: 'number', def: '12', step: '1', showIf: (v) => Number(v.num('P')) > 0 || Number(v.num('D')) > 0 || Number(v.num('Q')) > 0 },
					{ id: 'h', label: 'Forecast horizon (1–24)', labelZh: '预测步数（1–24）', type: 'number', def: '8', step: '1' },
				],
				compute: (v) => {
					const series = parseNumbers(v.str('data')).nums;
					if (series.length < 16) return ecoGuard('need at least 16 observations', '至少需要 16 个观测');
					const p = ecoInt(v.num('p'), 0, 5);
					const d = ecoInt(v.num('d'), 0, 2);
					const q = ecoInt(v.num('q'), 0, 5);
					if (p === null || d === null || q === null)
						return ecoGuard('p and q must be 0–5, d must be 0–2', 'p、q 需在 0–5，d 需在 0–2');
					const P = ecoInt(v.num('P'), 0, 2);
					const D = ecoInt(v.num('D'), 0, 1);
					const Q = ecoInt(v.num('Q'), 0, 2);
					if (P === null || D === null || Q === null)
						return ecoGuard('P and Q must be 0–2, D must be 0–1', 'P、Q 需在 0–2，D 需在 0–1');
					const h = ecoInt(v.num('h'), 1, 24);
					if (h === null) return ecoGuard('forecast horizon must be 1–24', '预测步数需在 1–24');
					const seasonal = P + D + Q > 0;
					const m = seasonal ? ecoInt(v.num('m'), 2, 52) : 1;
					if (m === null) return ecoGuard('seasonal period m must be 2–52', '季节周期 m 需在 2–52');
					const spec = { p, d, q, P, D, Q, m };
					if (series.length - (eco.diffPoly(d, D, m).length - 1) < 8)
						return ecoGuard('the series is too short after differencing', '差分后序列太短');
					const fit = eco.arimaEstimate(series, spec);
					if (!fit) return ecoGuard('the model could not be fitted for this data', '该数据无法拟合此模型');
					const fc = eco.arimaForecast(fit, series, h);
					if (!fc) return ecoGuard('forecasting failed for this model', '该模型预测失败');
					const table = {
						columns: ['Step', 'Forecast', '95% lower', '95% upper'],
						columnsZh: ['步数', '预测值', '95% 下界', '95% 上界'],
						rows: fc.point.map((pt, i) => [String(i + 1), ecoFmt(pt), ecoFmt(fc.lo[i] as number), ecoFmt(fc.hi[i] as number)]),
					};
					const rows: { label: string; labelZh: string; value: string; valueZh?: string }[] = [
						ecoRow(`Model ARIMA(${p},${d},${q})${seasonal ? `(${P},${D},${Q})[${m}]` : ''}`, `模型 ARIMA(${p},${d},${q})${seasonal ? `(${P},${D},${Q})[${m}]` : ''}`, `${fit.nused} differenced observations`, `差分后观测数 ${fit.nused}`),
						ecoRow('Log-likelihood (CSS)', '对数似然（CSS）', ecoFmt(fit.logLik)),
						ecoRow('AIC / AICc / BIC', 'AIC / AICc / BIC', `${ecoFmt(fit.aic)} / ${ecoFmt(fit.aicc)} / ${ecoFmt(fit.bic)}`),
					];
					fit.phi.forEach((c, i) => rows.push(ecoRow(`AR(${i + 1}) coefficient`, `AR(${i + 1}) 系数`, ecoFmt(c))));
					fit.theta.forEach((c, i) => rows.push(ecoRow(`MA(${i + 1}) coefficient`, `MA(${i + 1}) 系数`, ecoFmt(c))));
					fit.Phi.forEach((c, i) => rows.push(ecoRow(`SAR(${i + 1})×${m} coefficient`, `季节 AR(${i + 1})×${m} 系数`, ecoFmt(c))));
					fit.Theta.forEach((c, i) => rows.push(ecoRow(`SMA(${i + 1})×${m} coefficient`, `季节 MA(${i + 1})×${m} 系数`, ecoFmt(c))));
					rows.push(ecoRow('Innovation variance σ²', '新息方差 σ²', ecoFmt(fit.sigma2)));
					return { rows, table, note: d + D > 0 ? 'Intervals for differenced models carry the differenced-scale variance without accumulating level uncertainty — treat them as approximate.' : undefined, noteZh: d + D > 0 ? '含差分模型的区间沿用差分尺度方差、未累积水平不确定性，应视为近似值。' : undefined };
				},
			},
		},
		{
			slug: 'var-vecm',
			category: 'calculators',
			name: 'VAR & Cointegration (Johansen)',
			nameZh: 'VAR 与协整（Johansen）',
			description: 'Vector autoregression with stability check, Granger causality F tests and Cholesky impulse responses, plus the Johansen reduced-rank trace statistics for cointegration.',
			descriptionZh: '向量自回归：稳定性检验、Granger 因果 F 检验、Cholesky 脉冲响应，以及 Johansen 降秩迹统计量协整检验。',
			kind: 'form',
			config: {
				intro: 'Each COLUMN is a series (2–4 columns), one period per line, in time order. The Johansen part compares the trace statistics against published Osterwald-Lumenau/MacKinnon tables — they are reported, not hardcoded.',
				introZh: '每一列为一个序列（2–4 列），每行一个时期，按时间顺序。Johansen 部分输出迹统计量，需对照已发表的 Osterwald-Lumenau/MacKinnon 临界值表——本工具不硬编码该表。',
				fields: [
					{
						id: 'data',
						label: 'Data (series per column)',
						labelZh: '数据（每列一个序列）',
						type: 'textarea',
						def: 'rate, price, volume\n5.1, 100, 42\n5.0, 101, 45\n4.9, 103, 51\n4.8, 102, 48\n4.7, 105, 55\n4.6, 107, 60\n4.6, 106, 58\n4.5, 109, 64\n4.4, 111, 70\n4.3, 110, 66\n4.3, 113, 73\n4.2, 115, 79\n4.1, 114, 74\n4.0, 117, 82\n4.0, 119, 88\n3.9, 118, 83\n3.8, 121, 90\n3.8, 123, 96\n3.7, 122, 91\n3.6, 125, 98\n3.6, 127, 104\n3.5, 126, 99\n3.4, 129, 106\n3.4, 131, 112',
					},
					{
						id: 'p',
						label: 'Lag order p',
						labelZh: '滞后阶数 p',
						type: 'select',
						def: '2',
						options: [1, 2, 3].map((l) => ({ value: String(l), label: String(l) })),
					},
					{ id: 'h', label: 'Forecast horizon (1–12)', labelZh: '预测步数（1–12）', type: 'number', def: '6', step: '1' },
				],
				compute: (v) => {
					const parsed = eco.parseColumns(v.str('data'), 2);
					if (parsed.cols.length < 2 || parsed.cols.length > 4)
						return ecoGuard('need 2–4 columns (one series each)', '需要 2–4 列（每列一个序列）');
					if (parsed.rows < 16) return ecoGuard('need at least 16 observations', '至少需要 16 个观测');
					const p = ecoInt(Number(v.str('p')), 1, 3);
					if (p === null) return ecoGuard('lag order must be 1–3', '滞后阶数需在 1–3');
					const h = ecoInt(v.num('h'), 1, 12);
					if (h === null) return ecoGuard('forecast horizon must be 1–12', '预测步数需在 1–12');
					const K = parsed.cols.length;
					const y = parsed.cols[0]!.map((_, i) => parsed.cols.map((c) => c[i] as number));
					const names = parsed.names.slice(0, K).map((nm, i) => nm === `x${i + 1}` ? `series ${i + 1}` : nm);
					const fit = eco.varFit(y, p, names);
					if (!fit) return ecoGuard('the VAR could not be fitted (too few observations)', '观测数不足，无法拟合 VAR');
					const granger = eco.grangerTests(y, p, names);
					const fc = eco.varForecast(fit, y, h);
					const joh = eco.johansen(y, p);
					const rows: { label: string; labelZh: string; value: string; valueZh?: string }[] = [
						ecoRow('Variables / observations', '变量数 / 观测数', `${K} / ${fit.T}`),
						ecoRow('Stability (max companion eigenvalue)', '稳定性（伴随矩阵最大特征值模）', `${ecoFmt(fit.maxModulus)} — ${fit.stable ? 'stable' : 'NOT stable'}`, `${ecoFmt(fit.maxModulus)}——${fit.stable ? '稳定' : '不稳定'}`),
						ecoRow('Log-likelihood', '对数似然', ecoFmt(fit.logLik)),
						ecoRow('AIC / BIC (Lütkepohl)', 'AIC / BIC（Lütkepohl 口径）', `${ecoFmt(fit.aic)} / ${ecoFmt(fit.bic)}`),
					];
					const fcTable = {
						columns: ['Step', ...names],
						columnsZh: ['步数', ...names],
						rows: fc.map((row, i) => [String(i + 1), ...row.map((c) => ecoFmt(c))]),
					};
					if (parsed.bad.length) rows.push(ecoRow('Ignored invalid lines', '已忽略的无效行', parsed.bad.slice(0, 5).join('  ')));
					if (granger) {
						rows.push(ecoRow('Granger causality (F tests)', 'Granger 因果检验（F 检验）', 'non-significant p means no evidence of causation', 'p 值不显著表示没有因果证据'));
						for (const g of granger) {
							if (g.cause === g.target) continue;
							rows.push(ecoRow(
								`Does ${g.cause} Granger-cause ${g.target}?`,
								`${g.cause} 是否 Granger 引致 ${g.target}？`,
								`F(${g.df1}, ${g.df2}) = ${ecoFmt(g.f)} (p = ${ecoP(g.p)})`,
								`F(${g.df1}, ${g.df2}) = ${ecoFmt(g.f)}（p = ${ecoP(g.p)}）`,
							));
						}
					}
					if (joh) {
						rows.push(ecoRow('Johansen eigenvalues (descending)', 'Johansen 特征值（降序）', joh.lambda.map((lam) => ecoFmt(lam)).join(', ')));
						for (let r = 0; r < joh.lambda.length; r++) {
							rows.push(ecoRow(
								`Johansen trace stat, rank = ${r}`,
								`Johansen 迹统计量，秩 = ${r}`,
								`${ecoFmt(joh.trace[r] as number)} (max-eig ${ecoFmt(joh.maxEig[r] as number)})`,
								`${ecoFmt(joh.trace[r] as number)}（最大特征值统计量 ${ecoFmt(joh.maxEig[r] as number)}）`,
							));
						}
					}
					return {
						rows,
						table: fcTable,
						note: joh ? 'Johansen trace/max-eigenvalue statistics must be compared against the published Osterwald-Lumenau/MacKinnon table for this K and specification; the eigenvalue column supports an informal rank call.' : undefined,
						noteZh: joh ? 'Johansen 迹/最大特征值统计量需对照已发表的 Osterwald-Lumenau/MacKinnon 临界值表；特征值列可辅助非正式判断秩。' : undefined,
					};
				},
			},
		},
		{
			slug: 'state-space-kalman',
			category: 'calculators',
			name: 'State Space & Kalman Filter',
			nameZh: '状态空间与卡尔曼滤波',
			description: 'Local level / local drift / stationary AR(1) unobserved-component models: the Kalman filter and RTS smoother estimate the latent state and forecast with exact likelihood-based variances.',
			descriptionZh: '局部水平 / 带漂移 / 平稳 AR(1) 不可观测分量模型：卡尔曼滤波与 RTS 平滑器估计潜状态，并以精确似然给出预测及方差。',
			kind: 'form',
			config: {
				intro: 'One value per line in time order. "Local level" models a random walk state; "with drift" adds a constant growth rate; "AR(1)" a stationary persistence.',
				introZh: '每行一个数值，按时间顺序。“局部水平”为随机游走状态；“带漂移”加入恒定增长率；“AR(1)”为平稳持续性。',
				fields: [
					{
						id: 'data',
						label: 'Series (one value per line)',
						labelZh: '序列（每行一个数值）',
						type: 'textarea',
						def: '102\n104\n103\n106\n108\n107\n110\n112\n111\n114\n116\n118\n117\n120\n122\n121\n124\n126\n128\n127\n130\n132\n131\n134\n136\n135\n138\n140\n142\n141\n144\n146\n145\n148\n150\n149\n152\n154\n153\n156',
					},
					{
						id: 'spec',
						label: 'State equation',
						labelZh: '状态方程',
						type: 'select',
						def: 'level',
						options: [
							{ value: 'level', label: 'Local level (random walk)' },
							{ value: 'drift', label: 'Local level with drift' },
							{ value: 'ar', label: 'Stationary AR(1)' },
						],
					},
					{ id: 'h', label: 'Forecast horizon (1–24)', labelZh: '预测步数（1–24）', type: 'number', def: '6', step: '1' },
				],
				compute: (v) => {
					const series = parseNumbers(v.str('data')).nums;
					if (series.length < 10) return ecoGuard('need at least 10 observations', '至少需要 10 个观测');
					const h = ecoInt(v.num('h'), 1, 24);
					if (h === null) return ecoGuard('forecast horizon must be 1–24', '预测步数需在 1–24');
					const specMap: Record<string, 'level' | 'drift' | 'ar'> = { level: 'level', drift: 'drift', ar: 'ar' };
					const spec = specMap[v.str('spec')] ?? 'level';
					const fit = eco.kalmanFit(series, spec, h);
					if (!fit) return ecoGuard('the filter did not converge for this data', '该数据下滤波器未收敛');
					const rows: { label: string; labelZh: string; value: string; valueZh?: string }[] = [
						ecoRow('Observations', '观测数', String(fit.T)),
						ecoRow('Observation noise sd σ_e', '观测噪声标准差 σ_e', ecoFmt(fit.sigE)),
						ecoRow('State noise sd σ_a', '状态噪声标准差 σ_a', ecoFmt(fit.sigA)),
					];
					if (spec === 'drift') rows.push(ecoRow('Drift c', '漂移系数 c', ecoFmt(fit.c)));
					if (spec === 'ar') rows.push(ecoRow('State persistence φ', '状态持续系数 φ', ecoFmt(fit.phi)));
					rows.push(ecoRow('Log-likelihood', '对数似然', ecoFmt(fit.logLik)));
					rows.push(ecoRow('AIC / BIC', 'AIC / BIC', `${ecoFmt(fit.aic)} / ${ecoFmt(fit.bic)}`));
					const table = {
						columns: ['Step', 'Forecast', 'Std. error'],
						columnsZh: ['步数', '预测值', '标准误'],
						rows: fit.forecast.map((f, i) => [String(i + 1), ecoFmt(f), ecoFmt(fit.forecastSe[i] as number)]),
					};
					return { rows, table };
				},
			},
		},
	];

