// Registry entries for /calculators/* (form tools + redirects).
// The scientific calculator and grapher live on static pages instead.

import type { FormConfig, ToolEntry } from './registry';
import { compile, formatNumber } from '../scripts/calculator/engine';
import { computeStats, parseNumbers } from './stats';

const pct = (v: number): string => `${formatNumber(v)}%`;

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
	// the batch collapses onto n.
	for (let c = 1n; c <= 100n; c++) {
		const f = (z: bigint): bigint => (z * z + c) % n;
		let y = 2n;
		let d = 1n;
		const m = 128; // batch size for GCD
		let r = 1;

		while (d === 1n) {
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
		},
		{
			id: 'matB',
			label: 'Matrix B (for A+B, A-B, A×B)',
			labelZh: '矩阵 B（用于双矩阵加减乘）',
			type: 'textarea',
			def: '2  0  1\n1  3  2\n0  1  1',
			placeholder: '2  0  1\n1  3  2\n0  1  1',
			showIf: (v) => v.str('op') !== 'props',
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
		let zCrit95 = 1.95996;

		if (testType === 'z_test') {
			const cdf = normalCdf(stat);
			pRight = 1 - cdf;
			pLeft = cdf;
			pTwo = 2 * (1 - normalCdf(Math.abs(stat)));
		} else {
			const cdf = tCdf(stat, df);
			pRight = 1 - cdf;
			pLeft = cdf;
			pTwo = 2 * (1 - tCdf(Math.abs(stat), df));
			zCrit95 = df >= 30 ? 1.96 : 2.0 + 3.0 / df;
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
		let crit = zCrit;

		if (mode === 'mean_t') {
			crit = df >= 30 ? zCrit : zCrit + (confLevel === '95' ? 3.0 / df : 4.0 / df);
		}

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
				const facNR = fac(n - r);
				const facR = fac(r);
				const perm = facN / facNR;
				const comb = perm / facR;
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
];

