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
	},
	{
		slug: 'percentage-increase',
		category: 'calculators',
		name: 'Percentage Increase Calculator',
		description: 'Percentage change between two values, with absolute change and multiplier.',
		kind: 'form',
		config: percentageIncrease,
	},
	{
		slug: 'fraction',
		category: 'calculators',
		name: 'Fraction Calculator',
		description: 'Simplify fractions, convert to decimal and percent, and decimals back to exact fractions.',
		kind: 'form',
		config: fraction,
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
	},
	{
		slug: 'ratio',
		category: 'calculators',
		name: 'Ratio Calculator',
		description: 'Simplify ratios, convert to decimal and percent, and solve A:B = C:x.',
		kind: 'form',
		config: ratio,
	},
	{
		slug: 'proportion',
		category: 'calculators',
		name: 'Proportion Calculator',
		description: 'Solve a : b = c : x for the missing value.',
		kind: 'form',
		config: proportion,
	},
	{
		slug: 'simple-interest',
		category: 'calculators',
		name: 'Simple Interest Calculator',
		description: 'Compute simple interest I = P × r × t with total amount and per-period interest.',
		kind: 'form',
		config: simpleInterest,
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
