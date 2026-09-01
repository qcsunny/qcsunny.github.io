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
	fields: [
		{ id: 'p', label: 'Percent', suffix: '(%)', type: 'number', def: '15', step: 'any' },
		{ id: 'v', label: 'Of value', type: 'number', def: '200', step: 'any' },
		{ id: 'n', label: 'Number', type: 'number', def: '30', step: 'any' },
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
	fields: [
		{ id: 'from', label: 'From (initial value)', type: 'number', def: '100', step: 'any' },
		{ id: 'to', label: 'To (final value)', type: 'number', def: '125', step: 'any' },
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
	fields: [
		{ id: 'a', label: 'Fraction numerator a', type: 'number', def: '24', step: 'any' },
		{ id: 'b', label: 'Fraction denominator b', type: 'number', def: '36', step: 'any' },
		{ id: 'd', label: 'Decimal to convert', type: 'number', def: '0.375', step: 'any' },
	],
	compute: (v) => {
		const rows: import('./registry').FormResultRow[] = [];
		const a = v.num('a');
		const b = v.num('b');
		if (Number.isFinite(a) && Number.isFinite(b) && b !== 0) {
			const g = gcd(a, b) || 1;
			rows.push({ label: `a/b simplified`, value: `${a / g} / ${b / g}`, emphasis: true });
			rows.push({ label: 'a/b as decimal', value: formatNumber(a / b) });
			rows.push({ label: 'a/b as percent', value: pct((a / b) * 100) });
		} else if (Number.isFinite(b) && b === 0) {
			rows.push({ label: 'a/b simplified', value: '— (denominator is 0)' });
		}
		const d = v.num('d');
		if (Number.isFinite(d)) {
			const f = decimalToFraction(d);
			rows.push({
				label: 'Decimal as fraction',
				value: f ? `${f.num} / ${f.den}` : 'No exact fraction with denominator ≤ 10000',
				emphasis: true,
			});
		}
		return { rows };
	},
};

// --- ratio -------------------------------------------------------------------------

const ratio: FormConfig = {
	intro: 'Simplifies A:B, solves A:B = C:x, and shows A/B as decimal and percent.',
	fields: [
		{ id: 'a', label: 'A', type: 'number', def: '16', step: 'any' },
		{ id: 'b', label: 'B', type: 'number', def: '24', step: 'any' },
		{ id: 'c', label: 'C (scale A to C)', type: 'number', def: '40', step: 'any' },
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
	fields: [
		{ id: 'a', label: 'a', type: 'number', def: '2', step: 'any' },
		{ id: 'b', label: 'b', type: 'number', def: '4', step: 'any' },
		{ id: 'c', label: 'c', type: 'number', def: '8', step: 'any' },
	],
	compute: (v) => {
		const a = v.num('a');
		const b = v.num('b');
		const c = v.num('c');
		if (a === 0) return { rows: [{ label: 'x', value: '— (a is 0)' }] };
		const x = (b * c) / a;
		return {
			rows: [
				{ label: 'x', value: formatNumber(x), emphasis: true },
				{ label: 'Check: a ÷ b', value: b === 0 ? '—' : formatNumber(a / b) },
				{ label: 'Check: c ÷ x', value: formatNumber(c / x) },
			],
		};
	},
};

// --- simple interest ------------------------------------------------------------------

const simpleInterest: FormConfig = {
	intro: 'Interest computed on the principal only: I = P × r × t.',
	fields: [
		{ id: 'p', label: 'Principal', suffix: '($)', type: 'number', def: '10000', step: 'any' },
		{ id: 'r', label: 'Annual rate', suffix: '(%)', type: 'number', def: '5', step: 'any' },
		{ id: 't', label: 'Time', suffix: '(years)', type: 'number', def: '3', step: 'any' },
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
		description: 'What is P% of V, N as a percent of V, and value increased or decreased by a percent.',
		kind: 'form',
		config: percentage,

		content: {
			about: [
				'Answer the three everyday percentage questions in one place: what is P% of a value, N is what percent of a value, and what a value becomes after adding or subtracting a percent. Results update as you type.',
				'Percent means "per hundred", so P% of V is simply P × V / 100. The calculator is handy for tips, discounts, taxes and exam scores — anything expressed as a part of a whole.',
			],
			aboutZh: [
				'一站式解决三种最常见的百分比问题：某数的 P% 是多少、N 占某数的百分比是多少、以及某数增加或减少一个百分比后是多少。输入即实时更新。',
				'百分比即"每一百份中的份数"，因此 P% × V 就是 P × V ÷ 100。适用于小费、折扣、税费、考试成绩——一切"部分占整体"的计算。',
			],
			faq: [
				{ q: 'How do I calculate a tip?', a: 'For a 15% tip on $80: 15% of 80 = $12, so pay $92 in total — both numbers come straight out of this page.' },
				{ q: 'What is the difference between "of" and "off"?', a: '"20% of $50" is $10; "$50 with 20% off" is $40. The first is a part, the second is a discount.' },
				{ q: 'Can percentages exceed 100?', a: 'Yes — 150% of a value means 1.5× it, common when comparing growth against a baseline.' },
			],
			faqZh: [
				{ q: '怎么算小费？', a: '80 美元的 15% 小费 = 12 美元，共付 92 美元——两个数字都能在本页直接算出。' },
				{ q: '"百分之多少"和"打几折"有什么区别？', a: '"50 的 20%"是 10；"50 打 8 折（减 20%）"是 40。前者是部分，后者是折扣。' },
				{ q: '百分比可以超过 100 吗？', a: '可以——某数的 150% 就是它的 1.5 倍，在增长对比中很常见。' },
			],
		},
	},
	{
		slug: 'percentage-increase',
		category: 'calculators',
		name: 'Percentage Increase Calculator',
		description: 'Percentage change between two values, with absolute change and multiplier.',
		kind: 'form',
		config: percentageIncrease,

		content: {
			about: [
				'Measure relative change between two numbers: the percentage increase or decrease, the absolute difference, and the multiplier (e.g. 1.25× for a 25% rise). A drop shows as a negative percentage.',
				'Percentage change is (new − old) / old × 100. Always divide by the old value — the starting point — which is also why a 50% loss needs a 100% gain to recover.',
			],
			aboutZh: [
				'衡量两个数之间的相对变化：增长或减少的百分比、绝对差值，以及倍数（如增长 25% 即 1.25 倍）。下降会显示为负百分比。',
				'百分比变化 = (新值 − 旧值) ÷ 旧值 × 100。务必除以旧值（起点）——这也解释了为什么亏损 50% 需要上涨 100% 才能回本。',
			],
			faq: [
				{ q: 'From 80 to 100 is what percent increase?', a: '25% — the change (20) divided by the original (80).' },
				{ q: 'Why isn\'t a 50% drop undone by a 50% rise?', a: 'After a 50% drop you need a 100% rise to get back: 100 → 50 → 100.' },
				{ q: 'Can the old value be zero?', a: 'Percentage change from zero is undefined — any change from 0 is infinitely many percent.' },
			],
			faqZh: [
				{ q: '从 80 涨到 100 是增长百分之几？', a: '25%——变化量 20 除以原值 80。' },
				{ q: '为什么跌 50% 后涨 50% 回不了本？', a: '跌 50% 后需要上涨 100% 才能复原：100 → 50 → 100。' },
				{ q: '旧值可以是 0 吗？', a: '从 0 出发的百分比变化无定义——从 0 到任何数都是无穷大的百分比。' },
			],
		},
	},
	{
		slug: 'fraction',
		category: 'calculators',
		name: 'Fraction Calculator',
		description: 'Simplify fractions, convert to decimal and percent, and decimals back to exact fractions.',
		kind: 'form',
		config: fraction,

		content: {
			about: [
				'Simplify a fraction to lowest terms, see it as a decimal and a percentage, and convert a decimal back into the nearest exact fraction (up to a denominator of 10,000) using continued fractions.',
				'Simplifying works by dividing both numerator and denominator by their greatest common divisor (GCD). The decimal-to-fraction direction is exact for terminating decimals like 0.375 = 3/8, and gives the best rational approximation otherwise — 0.333… becomes 1/3.',
			],
			aboutZh: [
				'把分数约分到最简形式，查看对应的小数与百分比；也可以把小数转回最接近的精确分数（分母上限 10000），采用连分数逼近算法。',
				'约分的原理是分子分母同除以最大公约数（GCD）。小数转分数对有限小数是精确的（如 0.375 = 3/8）；对无限小数则给出最优有理逼近——0.333… 会得到 1/3。',
			],
			faq: [
				{ q: 'What is 18/24 in lowest terms?', a: '3/4 — both parts divided by their GCD, 6.' },
				{ q: 'How do I turn 0.125 into a fraction?', a: '0.125 = 125/1000 = 1/8 exactly; the calculator does this reduction for you.' },
				{ q: 'Why does 0.333… become 1/3?', a: 'The continued-fraction method finds 1/3 is the closest fraction with a small denominator to 0.333…' },
			],
			faqZh: [
				{ q: '18/24 的最简形式是什么？', a: '3/4——分子分母同除以最大公约数 6。' },
				{ q: '0.125 怎么化成分数？', a: '0.125 = 125/1000 = 1/8（精确值），本计算器会自动完成约分。' },
				{ q: '为什么 0.333… 会得到 1/3？', a: '连分数算法会找出分母较小时最接近 0.333… 的分数，正是 1/3。' },
			],
		},
	},
	{
		slug: 'average',
		category: 'calculators',
		name: 'Average Calculator',
		description: 'Mean, median, mode, sum, count, min, max, variance and standard deviation.',
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

		content: {
			about: [
				'Paste a list of numbers — separated by spaces, commas, semicolons or new lines — and get the full statistics at once: mean, median, mode, sum, count, min, max, and both sample and population standard deviation.',
				'The mean is the sum divided by the count; the median is the middle value (robust to outliers); the mode is the most frequent value. Invalid entries are ignored and listed so you can fix them.',
			],
			aboutZh: [
				'粘贴一组数字（支持空格、逗号、分号或换行分隔），一次性得到完整统计：均值、中位数、众数、总和、个数、最值，以及样本与总体两种标准差。',
				'均值 = 总和 ÷ 个数；中位数是排序后的中间值（对异常值稳健）；众数是出现最频繁的值。无法解析的条目会被忽略并列出，便于修正。',
			],
			faq: [
				{ q: 'Mean or median — which should I use?', a: 'The median when the data has outliers or is skewed (like incomes); the mean is fine for symmetric data.' },
				{ q: 'What is the difference between the two standard deviations?', a: 'Sample (s) divides by n−1 for estimating from a sample; population (σ) divides by n when you have every value.' },
				{ q: 'What if no number repeats?', a: 'Then there is no mode, and the calculator shows "—".' },
			],
			faqZh: [
				{ q: '均值和中位数用哪个？', a: '数据有异常值或偏态（如收入）时用中位数；对称分布的数据用均值即可。' },
				{ q: '两种标准差有什么区别？', a: '样本标准差（s）除以 n−1，用于从样本估计；总体标准差（σ）除以 n，适用于拥有全部数据的情形。' },
				{ q: '如果没有数字重复怎么办？', a: '那就没有众数，计算器会显示"—"。' },
			],
		},
	},
	{
		slug: 'ratio',
		category: 'calculators',
		name: 'Ratio Calculator',
		description: 'Simplify ratios, convert to decimal and percent, and solve A:B = C:x.',
		kind: 'form',
		config: ratio,

		content: {
			about: [
				'Simplify a ratio A:B to its smallest whole numbers, see it as a decimal and a percentage, and solve the classic proportion A:B = C:x — find x when three of the four terms are known.',
				'Simplifying a ratio divides both sides by their GCD, so 18:24 becomes 3:4. The solver uses cross-multiplication: A·x = B·C, so x = B·C / A.',
			],
			aboutZh: [
				'把比 A:B 化为最简整数比，查看对应的小数与百分比，并解经典比例式 A:B = C:x——已知三项求第四项。',
				'化简比是两边同除以最大公约数，例如 18:24 → 3:4。求解采用交叉相乘：A·x = B·C，故 x = B·C ÷ A。',
			],
			faq: [
				{ q: 'How do I simplify the ratio 36:48?', a: 'Divide both by their GCD (12) to get 3:4.' },
				{ q: 'How do I scale a recipe for 12 people?', a: 'If the recipe serves 4, solve 4:12 = 1:x portions — the ratio tells you to multiply every ingredient by 3.' },
				{ q: 'Can ratios have decimals?', a: 'The input can, but the simplified form is always whole numbers — 2.5:1.5 simplifies to 5:3.' },
			],
			faqZh: [
				{ q: '36:48 怎么化简？', a: '两边同除以最大公约数 12，得到 3:4。' },
				{ q: '怎么把 4 人份食谱扩成 12 人份？', a: '解比例 4:12 = 1:x，即可知道所有食材都要乘以 3。' },
				{ q: '比可以有是小数吗？', a: '输入可以，但化简结果一定是整数——2.5:1.5 会化简为 5:3。' },
			],
		},
	},
	{
		slug: 'proportion',
		category: 'calculators',
		name: 'Proportion Calculator',
		description: 'Solve a : b = c : x for the missing value.',
		kind: 'form',
		config: proportion,

		content: {
			about: [
				'Solve a proportion a : b = c : x for the missing value. Leave the unknown field empty and the calculator fills it in using cross-multiplication: x = b·c / a.',
				'Proportions appear everywhere: converting recipe servings, scaling drawings, currency conversion at a known rate, and map distances. Any two equal ratios form one.',
			],
			aboutZh: [
				'解比例式 a : b = c : x，求未知项。把未知项留空，计算器会用交叉相乘 x = b·c ÷ a 自动补全。',
				'比例无处不在：换算食谱份数、缩放图纸、按已知汇率换货币、地图测距——任何两个相等的比都构成比例。',
			],
			faq: [
				{ q: 'How do I solve 3:4 = 9:x?', a: 'Cross-multiply: 3x = 36, so x = 12.' },
				{ q: 'Which field do I leave empty?', a: 'The one you want to find — usually x, the fourth term.' },
				{ q: 'What if I leave two fields empty?', a: 'The proportion cannot be solved with two unknowns; fill in exactly three values.' },
			],
			faqZh: [
				{ q: '3:4 = 9:x 怎么解？', a: '交叉相乘得 3x = 36，所以 x = 12。' },
				{ q: '该把哪个字段留空？', a: '把要求的那一项留空——通常是第四项 x。' },
				{ q: '留空两个字段会怎样？', a: '两个未知数无法求解，请恰好填入三个值。' },
			],
		},
	},
	{
		slug: 'simple-interest',
		category: 'calculators',
		name: 'Simple Interest Calculator',
		description: 'Compute simple interest I = P × r × t with total amount and per-period interest.',
		kind: 'form',
		config: simpleInterest,

		content: {
			about: [
				'Compute simple interest — interest that stays constant because it is always calculated on the original principal. Enter the principal, annual rate and time in years to get the interest, the total amount, and the per-year breakdown.',
				'The formula is I = P × r × t. For example, $10,000 at 5% for 3 years earns $500 per year, $1,500 total. Compare with compound interest, where each period\'s interest joins the principal.',
			],
			aboutZh: [
				'计算单利——因为永远按原始本金计息，每期利息保持不变。输入本金、年利率与年数，即可得到利息、本息总额与逐年明细。',
				'公式为 I = P × r × t。例如本金 10000、年利率 5%、存 3 年，每年利息 500，共 1500。可与复利对比——复利中每期利息会并入本金。',
			],
			faq: [
				{ q: 'Simple vs compound interest — which pays more?', a: 'Compound, for any term longer than one period. Simple interest stays flat; compound grows on itself.' },
				{ q: 'Can time be a fraction of a year?', a: 'Yes — 0.5 means six months, and interest is prorated linearly.' },
				{ q: 'What uses simple interest?', a: 'Short-term instruments and some loans and bonds; car loans are typically simple interest.' },
			],
			faqZh: [
				{ q: '单利和复利哪个收益高？', a: '只要期限超过一期，复利必然更高。单利每期固定，复利利滚利。' },
				{ q: '时间可以填小数吗？', a: '可以，0.5 表示半年，利息按时间线性折算。' },
				{ q: '哪些场景用单利？', a: '短期工具、部分贷款和债券；车贷通常是单利。' },
			],
		},
	},
	// the three finance overlaps live on /finance/* — these paths redirect
	{
		slug: 'compound-interest',
		category: 'calculators',
		name: 'Compound Interest Calculator',
		description: 'Redirects to the compound interest calculator.',
		kind: 'redirect',
		config: { target: '/finance/compound-interest/' },
	},
	{
		slug: 'loan',
		category: 'calculators',
		name: 'Loan Calculator',
		description: 'Redirects to the loan payment calculator.',
		kind: 'redirect',
		config: { target: '/finance/loan-payment/' },
	},
	{
		slug: 'mortgage',
		category: 'calculators',
		name: 'Mortgage Calculator',
		description: 'Redirects to the mortgage calculator.',
		kind: 'redirect',
		config: { target: '/finance/mortgage/' },
	},
];
