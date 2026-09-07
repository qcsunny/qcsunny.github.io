// Registry entries for /calculators/* (form tools + redirects).
// The scientific calculator and grapher live on static pages instead.

import type { FormConfig, ToolEntry } from './registry';
import { formatNumber } from '../scripts/calculator/engine';
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

const bigGcd = (a: bigint, b: bigint): bigint => (b === 0n ? a : bigGcd(b, a % b));

function pollardRho(n: bigint): bigint {
	if (n % 2n === 0n) return 2n;
	if (n % 3n === 0n) return 3n;
	// Floyd's cycle; if it collapses onto n for this c, retry with the next one.
	for (let c = 1n; ; c++) {
		let x = 2n;
		let y = 2n;
		let d = 1n;
		const f = (z: bigint): bigint => (z * z + c) % n;
		while (d === 1n) {
			x = f(x);
			y = f(f(y));
			d = bigGcd(x > y ? x - y : y - x, n);
		}
		if (d !== n) return d;
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
const SMALL_PRIMES: number[] = [
	2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43,
	47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97, 101, 103, 107,
	109, 113, 127, 131, 137, 139, 149, 151, 157, 163, 167, 173, 179, 181,
	191, 193, 197, 199, 211, 223, 227, 229, 233, 239, 241, 251, 257, 263,
	269, 271, 277, 281, 283, 293, 307, 311, 313, 317, 331, 337, 347, 349,
	353, 359, 367, 373, 379, 383, 389, 397, 401, 409, 419, 421, 431, 433,
	439, 443, 449, 457, 461, 463, 467, 479, 487, 491, 499, 503, 509, 521,
	523, 541, 547, 557, 563, 569, 571, 577, 587, 593, 599, 601, 607, 613,
	617, 619, 631, 641, 643, 647, 653, 659, 661, 673, 677, 683, 691, 701,
	709, 719, 727, 733, 739, 743, 751, 757, 761, 769, 773, 787, 797, 809,
	811, 821, 823, 827, 829, 839, 853, 857, 859, 863, 877, 881, 883, 887,
	907, 911, 919, 929, 937, 941, 947, 953, 967, 971, 977, 983, 991, 997,
];

/** Factor a whole number 2..2^64−1 exactly. Returns ascending prime factors
 *  with exponents and τ(n) = Π(eᵢ+1). Everything stays in BigInt after the
 *  input parse, so a factor above 2^53 is never rounded through a Number. */
function factorWhole(n: bigint): { factors: Array<{ f: bigint; e: number }>; divisors: number } {
	const byFactor = new Map<string, number>();
	let rest = n;
	for (const p of SMALL_PRIMES) {
		const pb = BigInt(p);
		if (pb * pb > rest) break;
		if (rest % pb === 0n) {
			let c = 0;
			do {
				rest /= pb;
				c++;
			} while (rest % pb === 0n);
			byFactor.set(pb.toString(), c);
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
		slug: 'average',
		category: 'calculators',
		name: 'Average Calculator',
		nameZh: '平均数与统计计算器',
		description: 'Mean, median, mode, sum, count, min, max, variance and standard deviation.',
		descriptionZh: '一键计算数据集的算术平均数、中位数、众数、方差与样本/总体标准差。',
		kind: 'text',
		config: {
			placeholder: 'e.g. 12  15  15  9  27  (spaces, commas, semicolons or new lines)',
			placeholderZh: '例如 12  15  15  9  27（空格、逗号、分号或换行分隔均可）',
			mono: true,
			stats: (text) => {
				const { nums, invalid } = parseNumbers(text);
				const s = computeStats(nums);
				if (!s) {
					return invalid.length
						? [{ label: 'Ignoring invalid entries', labelZh: '已忽略的无效数据', value: invalid.join(', ') }]
						: [];
				}
				const fmt = (v: number): string => (Number.isNaN(v) ? '—' : formatNumber(v));
				const rows: import('./registry').TextStat[] = [
					{ label: 'Mean (average)', labelZh: '平均数', value: fmt(s.mean) },
					{ label: 'Median', labelZh: '中位数', value: fmt(s.median) },
					{
						label: 'Mode',
						labelZh: '众数',
						value: s.modes ? s.modes.map((m) => formatNumber(m)).join(', ') : '—',
					},
					{ label: 'Count', labelZh: '数据个数', value: String(s.count) },
					{ label: 'Sum', labelZh: '总和', value: fmt(s.sum) },
					{ label: 'Min', labelZh: '最小值', value: fmt(s.min) },
					{ label: 'Max', labelZh: '最大值', value: fmt(s.max) },
					{ label: 'Sample std. deviation (s)', labelZh: '样本标准差 (s)', value: fmt(s.sdS) },
					{ label: 'Population std. deviation (σ)', labelZh: '总体标准差 (σ)', value: fmt(s.sdP) },
				];
				if (invalid.length) {
					rows.push({ label: 'Ignoring invalid entries', labelZh: '已忽略的无效数据', value: invalid.join(', ') });
				}
				return rows;
			},
		},
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
		description: 'Mean, median, sample variance and standard deviation, min/max and simple linear regression.',
		descriptionZh: '计算均值、中位数、样本方差与标准差、极值，并对 y 关于 x 做一元线性回归。',
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
				const nums = (s: string) =>
					s
						.split(/[,;\s]+/)
						.map((x) => Number(x))
						.filter((x) => Number.isFinite(x));
				const y = nums(v.str('y'));
				const x = nums(v.str('x'));
				if (y.length === 0) {
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
				const mean = y.reduce((a, b) => a + b, 0) / y.length;
				const sorted = [...y].sort((a, b) => a - b);
				const mid = sorted.length >> 1;
				const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
				const variance = y.reduce((a, b) => a + (b - mean) ** 2, 0) / (y.length - 1);
				const std = Math.sqrt(variance);
				const fmt = (n: number) => String(Math.round(n * 1e6) / 1e6);
				const rows = [
					{ label: 'Count', labelZh: '数据个数', value: String(y.length), valueZh: String(y.length) },
					{ label: 'Mean', labelZh: '平均值', value: fmt(mean), valueZh: fmt(mean) },
					{ label: 'Median', labelZh: '中位数', value: fmt(median), valueZh: fmt(median) },
					{ label: 'Sample variance', labelZh: '样本方差', value: fmt(variance), valueZh: fmt(variance) },
					{ label: 'Sample std. deviation', labelZh: '样本标准差', value: fmt(std), valueZh: fmt(std) },
					{ label: 'Min', labelZh: '最小值', value: fmt(Math.min(...sorted)), valueZh: fmt(Math.min(...sorted)) },
					{ label: 'Max', labelZh: '最大值', value: fmt(Math.max(...sorted)), valueZh: fmt(Math.max(...sorted)) },
				];
				if (x.length === y.length && x.length >= 2) {
					const mx = x.reduce((a, b) => a + b, 0) / x.length;
					const sxy = x.reduce((a, xi, i) => a + (xi - mx) * (y[i] - mean), 0);
					const sxx = x.reduce((a, xi) => a + (xi - mx) ** 2, 0);
					if (sxx !== 0) {
						const slope = sxy / sxx;
						const inter = mean - slope * mx;
						rows.push({
							label: 'Regression slope (y ~ a + b·x)',
							labelZh: '回归斜率 b',
							value: fmt(slope),
							valueZh: fmt(slope),
						});
						rows.push({
							label: 'Regression intercept',
							labelZh: '回归截距 a',
							value: fmt(inter),
							valueZh: fmt(inter),
						});
					}
				}
				return { rows };
			},
		},
	},
];
