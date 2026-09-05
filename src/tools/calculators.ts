// Registry entries for /calculators/* (form tools + redirects).
// The scientific calculator and grapher live on static pages instead.

import type { FormConfig, ToolEntry } from './registry';
import { formatNumber } from '../scripts/calculator/engine';
import { computeStats, parseNumbers } from './stats';

const pct = (v: number): string => `${formatNumber(v)}%`;
const money = (v: number): string => formatNumber(Math.round(v * 100) / 100);

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
				{ label: `${v.str('p')}% of ${v.str('v')}`, value: formatNumber((p / 100) * val), emphasis: true },
				{ label: `${v.str('n')} is what % of ${v.str('v')}`, value: val === 0 ? '—' : pct((n / val) * 100) },
				{ label: `${v.str('v')} increased by ${v.str('p')}%`, value: formatNumber(val * (1 + p / 100)) },
				{ label: `${v.str('v')} decreased by ${v.str('p')}%`, value: formatNumber(val * (1 - p / 100)) },
			],
		};
	},
};

// --- percentage increase ----------------------------------------------------------

const percentageIncrease: FormConfig = {
	intro: 'Measure relative change between two numbers.',
	introZh: '衡量两个数值之间的相对增减变化与变化倍数。',
	fields: [
		{ id: 'from', label: 'From (initial value)', labelZh: '初始值 (From)', type: 'number', def: '100', step: 'any', required: true },
		{ id: 'to', label: 'To (final value)', labelZh: '最终值 (To)', type: 'number', def: '125', step: 'any', required: true },
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
					value: from === 0 ? '— (initial value is 0)' : pct(pctChange),
					emphasis: true,
				},
				{ label: 'Absolute change', value: `${change >= 0 ? '+' : ''}${formatNumber(change)}` },
				{ label: 'Multiplier (to ÷ from)', value: from === 0 ? '—' : formatNumber(to / from) },
			],
			note:
				from === 0
					? undefined
					: change >= 0
						? `An increase of ${formatNumber(change)}.`
						: `A decrease of ${formatNumber(-change)} (negative growth).`,
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
			rows.push({ label: 'a/b simplified', labelZh: 'a/b 最简分数', value: '— (分母不能为 0)' });
		}
		const d = v.num('d');
		if (Number.isFinite(d)) {
			const f = decimalToFraction(d);
			rows.push({
				label: 'Decimal as fraction',
				labelZh: '小数还原最简分数',
				value: f ? `${f.num} / ${f.den}` : '未找到分母 ≤ 10000 的精确分数',
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
			rows.push({ label: 'A:B simplified', value: '— (both zero)' });
		} else {
			const g = gcd(a, b) || 1;
			rows.push({ label: 'A:B simplified', value: `${a / g} : ${b / g}`, emphasis: true });
			rows.push({ label: 'A ÷ B', value: b === 0 ? '— (division by 0)' : formatNumber(a / b) });
			rows.push({ label: 'A ÷ B as percent', value: b === 0 ? '—' : pct((a / b) * 100) });
			if (a !== 0 && Number.isFinite(c)) {
				const x = (b * c) / a;
				rows.push({ label: `A:B = C:x → x`, value: formatNumber(x) });
			}
		}
		return { rows };
	},
};

// --- proportion ---------------------------------------------------------------------

const proportion: FormConfig = {
	intro: 'Solves a : b = c : x for x (equivalently a/b = c/x).',
	introZh: '求解比例方程 a : b = c : x 中的未知数 x。',
	fields: [
		{ id: 'a', label: 'a', labelZh: '比例项 a', type: 'number', def: '2', step: 'any', required: true },
		{ id: 'b', label: 'b', labelZh: '比例项 b', type: 'number', def: '4', step: 'any', required: true },
		{ id: 'c', label: 'c', labelZh: '比例项 c', type: 'number', def: '8', step: 'any', required: true },
	],
	compute: (v) => {
		const a = v.num('a');
		const b = v.num('b');
		const c = v.num('c');
		if (a === 0) return { rows: [{ label: 'x', labelZh: '未知数 x', value: '— (a 不能为 0)' }] };
		const x = (b * c) / a;
		return {
			rows: [
				{ label: 'x', labelZh: '未知数 x', value: formatNumber(x), emphasis: true },
				{ label: 'Check: a ÷ b', labelZh: '验证 a ÷ b', value: b === 0 ? '—' : formatNumber(a / b) },
				{ label: 'Check: c ÷ x', labelZh: '验证 c ÷ x', value: formatNumber(c / x) },
			],
		};
	},
};

// --- simple interest ------------------------------------------------------------------

const simpleInterest: FormConfig = {
	intro: 'Interest computed on the principal only: I = P × r × t.',
	introZh: '按单利公式 I = P × r × t 测算利息收益与到期总本息。',
	fields: [
		{ id: 'p', label: 'Principal', labelZh: '本金', suffix: '($ / ¥)', suffixZh: '($ / 元)', type: 'number', def: '10000', step: 'any', min: '0', required: true },
		{ id: 'r', label: 'Annual rate', labelZh: '年利率', suffix: '(%)', type: 'number', def: '5', step: 'any', min: '0', required: true },
		{ id: 't', label: 'Time', labelZh: '投资/借款期限', suffix: '(years / 年)', type: 'number', def: '3', step: 'any', min: '0', required: true },
	],
	compute: (v) => {
		const p = v.num('p');
		const r = v.num('r');
		const t = v.num('t');
		const interest = p * (r / 100) * t;
		return {
			rows: [
				{ label: 'Simple interest', value: money(interest), emphasis: true },
				{ label: 'Final amount (P + I)', value: money(p + interest) },
				{ label: 'Interest per year', value: money(interest / (t || 1)) },
			],
			note: 'Unlike compound interest, the principal never grows — each period earns the same amount.',
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
			mono: true,
			stats: (text) => {
				const { nums, invalid } = parseNumbers(text);
				const s = computeStats(nums);
				if (!s) {
					return invalid.length
						? [{ label: 'Ignoring invalid entries', value: invalid.join(', ') }]
						: [];
				}
				const fmt = (v: number): string => (Number.isNaN(v) ? '—' : formatNumber(v));
				const rows: import('./registry').TextStat[] = [
					{ label: 'Mean (average)', value: fmt(s.mean) },
					{ label: 'Median', value: fmt(s.median) },
					{
						label: 'Mode',
						value: s.modes ? s.modes.map((m) => formatNumber(m)).join(', ') : '—',
					},
					{ label: 'Count', value: String(s.count) },
					{ label: 'Sum', value: fmt(s.sum) },
					{ label: 'Min', value: fmt(s.min) },
					{ label: 'Max', value: fmt(s.max) },
					{ label: 'Sample std. deviation (s)', value: fmt(s.sdS) },
					{ label: 'Population std. deviation (σ)', value: fmt(s.sdP) },
				];
				if (invalid.length) {
					rows.push({ label: 'Ignoring invalid entries', value: invalid.join(', ') });
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
		slug: 'proportion',
		category: 'calculators',
		name: 'Proportion Calculator',
		nameZh: '比例方程计算器',
		description: 'Redirects to the unified Ratio & Proportion Calculator.',
		descriptionZh: '跳转至比例与比例方程计算器。',
		kind: 'redirect',
		config: { target: '/calculators/ratio/' },
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
		slug: 'compound-interest',
		category: 'calculators',
		name: 'Compound Interest Calculator',
		nameZh: '复利计算器',
		description: 'Redirects to the compound interest calculator.',
		descriptionZh: '跳转至复利投资与定投收益计算器。',
		kind: 'redirect',
		config: { target: '/finance/compound-interest/' },
	},
	{
		slug: 'loan',
		category: 'calculators',
		name: 'Loan Calculator',
		nameZh: '贷款计算器',
		description: 'Redirects to the loan payment calculator.',
		descriptionZh: '跳转至贷款月供与还款计划计算器。',
		kind: 'redirect',
		config: { target: '/finance/loan-payment/' },
	},
	{
		slug: 'mortgage',
		category: 'calculators',
		name: 'Mortgage Calculator',
		nameZh: '房贷计算器',
		description: 'Redirects to the mortgage calculator.',
		descriptionZh: '跳转至房贷综合对比计算器。',
		kind: 'redirect',
		config: { target: '/finance/mortgage/' },
	},
];
