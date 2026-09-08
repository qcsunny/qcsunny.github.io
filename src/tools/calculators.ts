// Registry entries for /calculators/* (form tools + redirects).
// The scientific calculator and grapher live on static pages instead.

import type { FormConfig, ToolEntry } from './registry';
import { compile, formatNumber } from '../scripts/calculator/engine';
import { computeStats, parseNumbers } from './stats';

const pct = (v: number): string => `${formatNumber(v)}%`;
const money = (v: number): string => formatNumber(Math.round(v * 100) / 100);

/** A money row: "$1,234.00" in the English view, "¥1,234.00" in the Chinese one,
 *  matching the suffix: '($)' / suffixZh: '(¥)' the inputs already declare. Same
 *  helper as src/tools/finance.ts, alongside the same local money().
 */
const cash = (v: number | null): { value: string; valueZh: string } =>
	v === null || !Number.isFinite(v) ? { value: '—', valueZh: '—' } : { value: `$${money(v)}`, valueZh: `¥${money(v)}` };

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
	for (let c = 1n; ; c++) {
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

// --- simple interest ------------------------------------------------------------------

const simpleInterest: FormConfig = {
	intro: 'Interest computed on the principal only: I = P × r × t.',
	introZh: '按单利公式 I = P × r × t 测算利息收益与到期总本息。',
	fields: [
		{ id: 'p', label: 'Principal', labelZh: '本金', suffix: '($)', suffixZh: '(¥)', type: 'number', def: '10000', step: 'any', min: '0', required: true },
		{ id: 'r', label: 'Annual rate', labelZh: '年利率', suffix: '(%)', type: 'number', def: '5', step: 'any', min: '0', required: true },
		{ id: 't', label: 'Time', labelZh: '投资/借款期限', suffix: '(years)', suffixZh: '(年)', type: 'number', def: '3', step: 'any', min: '0', required: true },
	],
	compute: (v) => {
		const p = v.num('p');
		const r = v.num('r');
		const t = v.num('t');
		const interest = p * (r / 100) * t;
		return {
			rows: [
				{ label: 'Simple interest', labelZh: '单利利息', ...cash(interest), emphasis: true },
				{ label: 'Final amount (P + I)', labelZh: '到期本息总额 (本金 + 利息)', ...cash(p + interest) },
				{ label: 'Interest per year', labelZh: '每年利息', ...cash(interest / (t || 1)) },
			],
			note: 'Unlike compound interest, the principal never grows — each period earns the same amount.',
			noteZh: '与复利不同，单利的计息本金始终不变——每期利息完全相同。',
		};
	},
};

// --- pi calculator (Machin-like formula with BigInt arbitrary precision) --------
function computePiMachin(digits: number): string {
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
	return piStr[0] + '.' + piStr.slice(1, digits + 1);
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
			const res = Array.from({ length: rA }, () => Array(cB).fill(0));
			for (let i = 0; i < rA; i++) {
				for (let j = 0; j < cB; j++) {
					let s = 0;
					for (let k = 0; k < cA; k++) {
						s += a[i]![k]! * b[k]![j]!;
					}
					res[i]![j] = s;
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
	const imag = formatNumber(Math.sqrt(-delta) / (2 * a));
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
		const phi = Math.acos(-q / (2 * r));
		const m = 2 * Math.cbrt(r);
		const r1 = m * Math.cos(phi / 3) + shift;
		const r2 = m * Math.cos((phi + 2 * Math.PI) / 3) + shift;
		const r3 = m * Math.cos((phi + 4 * Math.PI) / 3) + shift;
		return [formatNumber(r1), formatNumber(r2), formatNumber(r3)];
	}
}

const equationSolver: FormConfig = {
	intro: 'Solve polynomial equations (Quadratic ax²+bx+c=0, Cubic ax³+bx²+cx+d=0), 2x2 linear systems, numerical calculus (derivatives & integrals), and function limits via Richardson extrapolation.',
	introZh: '代数方程求解、微积分与极限工具：一元二次/三次方程求根（含复数虚根）、二元一次线性方程组、数值微积分以及基于理查森外推的函数极限求解。',
	fields: [
		{
			id: 'type',
			label: 'Problem Type',
			labelZh: '计算类型',
			type: 'select',
			def: 'quad',
			options: [
				{ value: 'quad', label: 'Quadratic Equation (ax² + bx + c = 0)', labelZh: '一元二次方程 (ax² + bx + c = 0)' },
				{ value: 'cubic', label: 'Cubic Equation (ax³ + bx² + cx + d = 0)', labelZh: '一元三次方程 (ax³ + bx² + cx + d = 0)' },
				{ value: 'linear2', label: '2x2 Linear System (a1·x + b1·y = c1)', labelZh: '二元一次线性方程组' },
				{ value: 'calculus', label: 'Calculus: Numerical Derivative & Integral', labelZh: '微积分运算（数值导数与定积分）' },
				{ value: 'limit', label: 'Limit (x → x0)', labelZh: '极限求解 (x → x0)' },
				{ value: 'ode', label: 'Differential Equation (ODE: dy/dx = f(x, y))', labelZh: '常微分方程初值问题 (ODE: dy/dx = f(x, y))' },
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
		{ id: 'limX0', label: 'Approach point x0', labelZh: '趋近目标点 x0', type: 'number', def: '0', step: 'any', showIf: (v) => v.str('type') === 'limit' },
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
				const scope = { vars: {}, deg: false };

				// Numerical Derivative via 5-point symmetric stencil
				if (Number.isFinite(x0)) {
					const h = 1e-5;
					const evalAt = (xv: number) => {
						scope.vars = { x: xv };
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
				if (Number.isFinite(a) && Number.isFinite(b)) {
					const evalAt = (xv: number) => {
						scope.vars = { x: xv };
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
						depth: number,
					): number => {
						const x1 = (x0 + x2) / 2;
						const xLeftMid = (x0 + x1) / 2;
						const xRightMid = (x1 + x2) / 2;
						const fLeftMid = evalAt(xLeftMid);
						const fRightMid = evalAt(xRightMid);
						const left = simpson(x0, x1, f0, fLeftMid, f1);
						const right = simpson(x1, x2, f1, fRightMid, f2);
						const delta = left + right - whole;
						if (depth <= 0 || Math.abs(delta) <= 15 * 1e-9) {
							return left + right + delta / 15;
						}
						return (
							adapt(x0, x1, f0, fLeftMid, f1, left, depth - 1) +
							adapt(x1, x2, f1, fRightMid, f2, right, depth - 1)
						);
					};

					const f0 = evalAt(a);
					const f2 = evalAt(b);
					const mid = (a + b) / 2;
					const f1 = evalAt(mid);
					const whole = simpson(a, b, f0, f1, f2);
					const intVal = adapt(a, b, f0, f1, f2, whole, 15);

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
				const scope = { vars: {}, deg: false };
				const evalSafe = (xv: number): number => {
					scope.vars = { x: xv };
					return fn(scope);
				};

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
				const scope = { vars: {}, deg: false };
				const f = (xv: number, yv: number): number => {
					scope.vars = { x: xv, y: yv };
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
	{
		slug: 'simple-interest',
		category: 'calculators',
		name: 'Simple Interest Calculator',
		nameZh: '单利计算器',
		description: 'Compute simple interest I = P × r × t with total amount and per-period interest.',
		descriptionZh: '根据 I = P × r × t 计算单利利息、到期本息总额与逐期明细。',
		kind: 'form',
		config: simpleInterest,
	},
	// the three finance overlaps live on /finance/* — these paths redirect

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
				const perm = fac(n) / fac(n - r);
				const comb = perm / fac(r);
				return {
					rows: [
						{ label: 'n! (factorial)', labelZh: '阶乘 n!', value: fac(n).toString(), valueZh: fac(n).toString() },
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
];

