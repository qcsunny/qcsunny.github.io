// Registry entries for /finance/* — all form tools, several with result
// tables (compound interest year by year, loan amortization).

import type { FormConfig, FormResultRow, ToolEntry } from './registry';
import { formatNumber } from '../scripts/calculator/engine';

const money = (v: number): string => formatNumber(Math.round(v * 100) / 100);

/** Equal-payment amortization monthly payment. months > 0. */
function monthlyPayment(principal: number, annualRatePct: number, months: number): number {
	const i = annualRatePct / 100 / 12;
	if (i <= 0) return principal / months;
	return (principal * i) / (1 - (1 + i) ** -months);
}

/** Amortization rows grouped by year: [year, principal, interest, balance]. */
function amortize(
	principal: number,
	annualRatePct: number,
	months: number,
): { rows: string[][]; totalInterest: number } {
	const pay = monthlyPayment(principal, annualRatePct, months);
	const i = annualRatePct / 100 / 12;
	let balance = principal;
	let totalInterest = 0;
	const out: string[][] = [];
	for (let y = 1; y <= Math.ceil(months / 12); y++) {
		let principalY = 0;
		let interestY = 0;
		for (let m = 0; m < 12 && (y - 1) * 12 + m < months; m++) {
			const interest = balance * i;
			const princ = Math.min(pay - interest, balance);
			balance -= princ;
			principalY += princ;
			interestY += interest;
			totalInterest += interest;
		}
		out.push([String(y), money(principalY), money(interestY), money(Math.max(balance, 0))]);
	}
	return { rows: out, totalInterest };
}

// --- compound interest ----------------------------------------------------------

const compoundInterest: FormConfig = {
	intro: 'Compounded growth with an optional monthly contribution.',
	fields: [
		{ id: 'p', label: 'Principal', suffix: '($)', type: 'number', def: '10000', step: 'any', min: '0' },
		{ id: 'r', label: 'Annual interest rate', suffix: '(%)', type: 'number', def: '5', step: 'any' },
		{ id: 't', label: 'Years', type: 'number', def: '10', step: 'any', min: '0' },
		{
			id: 'n',
			label: 'Compounding frequency',
			type: 'select',
			def: '12',
			options: [
				{ value: '1', label: 'Annually' },
				{ value: '2', label: 'Semiannually' },
				{ value: '4', label: 'Quarterly' },
				{ value: '12', label: 'Monthly' },
				{ value: '365', label: 'Daily' },
			],
		},
		{
			id: 'm',
			label: 'Monthly contribution',
			suffix: '($)',
			type: 'number',
			def: '0',
			step: 'any',
			hint: 'Added at the end of each month',
		},
	],
	compute: (v) => {
		const p = v.num('p');
		const r = v.num('r') / 100;
		const t = v.num('t');
		const n = Number(v.str('n')) || 1;
		const m = v.num('m');
		if (!(t > 0)) return { rows: [{ label: 'Final amount', value: '— (years must be > 0)' }] };
		// effective monthly rate so contributions match the compounding frequency
		const monthlyRate = (1 + r / n) ** (n / 12) - 1;
		const months = Math.round(t * 12);
		const fv = (elapsedMonths: number): number =>
			p * (1 + monthlyRate) ** elapsedMonths +
			(monthlyRate === 0 ? m * elapsedMonths : (m * ((1 + monthlyRate) ** elapsedMonths - 1)) / monthlyRate);
		const final = fv(months);
		const invested = p + m * months;
		const tableRows: string[][] = [];
		const years = Math.min(Math.ceil(t), 60);
		for (let y = 1; y <= years; y++) {
			const em = Math.min(y * 12, months);
			tableRows.push([
				String(y),
				money(p + m * em),
				money(fv(em)),
				money(fv(em) - (p + m * em)),
			]);
		}
		return {
			rows: [
				{ label: 'Final amount', value: money(final), emphasis: true },
				{ label: 'Total invested (principal + contributions)', value: money(invested) },
				{ label: 'Interest earned', value: money(final - invested) },
			],
			table: { columns: ['Year', 'Invested', 'Value', 'Interest'], rows: tableRows },
		};
	},
};

// --- loan payment -----------------------------------------------------------------

const loanPayment: FormConfig = {
	fields: [
		{ id: 'amount', label: 'Loan amount', suffix: '($)', type: 'number', def: '30000', step: 'any', min: '0' },
		{ id: 'rate', label: 'Annual interest rate', suffix: '(%)', type: 'number', def: '6', step: 'any' },
		{ id: 'years', label: 'Term', suffix: '(years)', type: 'number', def: '5', step: 'any', min: '0' },
	],
	compute: (v) => {
		const amount = v.num('amount');
		const rate = v.num('rate');
		const years = v.num('years');
		const months = Math.round(years * 12);
		if (!(amount > 0) || !(months > 0)) {
			return { rows: [{ label: 'Monthly payment', value: '— (amount and term must be > 0)' }] };
		}
		const pay = monthlyPayment(amount, rate, months);
		const { rows: tableRows, totalInterest } = amortize(amount, rate, months);
		return {
			rows: [
				{ label: 'Monthly payment', value: money(pay), emphasis: true },
				{ label: 'Number of payments', value: String(months) },
				{ label: 'Total paid', value: money(pay * months) },
				{ label: 'Total interest', value: money(totalInterest) },
			],
			table: {
				columns: ['Year', 'Principal paid', 'Interest paid', 'Remaining balance'],
				rows: tableRows,
			},
		};
	},
};

// --- mortgage -----------------------------------------------------------------------

const mortgage: FormConfig = {
	fields: [
		{ id: 'price', label: 'Home price', suffix: '($)', type: 'number', def: '350000', step: 'any', min: '0' },
		{ id: 'down', label: 'Down payment', suffix: '($)', type: 'number', def: '70000', step: 'any', min: '0' },
		{ id: 'rate', label: 'Annual interest rate', suffix: '(%)', type: 'number', def: '6.5', step: 'any' },
		{ id: 'years', label: 'Term', suffix: '(years)', type: 'number', def: '30', step: 'any', min: '0' },
		{ id: 'tax', label: 'Property tax per year', suffix: '($)', type: 'number', def: '4200', step: 'any', min: '0' },
		{ id: 'ins', label: 'Insurance per year', suffix: '($)', type: 'number', def: '1500', step: 'any', min: '0' },
		{ id: 'hoa', label: 'HOA fees per month', suffix: '($)', type: 'number', def: '0', step: 'any', min: '0' },
	],
	compute: (v) => {
		const price = v.num('price');
		const down = v.num('down');
		const rate = v.num('rate');
		const years = v.num('years');
		const months = Math.round(years * 12);
		const loan = price - down;
		const rows: FormResultRow[] = [];
		if (down > price) {
			rows.push({ label: 'Down payment exceeds the home price — no loan needed.', value: '' });
			return { rows };
		}
		if (!(loan > 0) || !(months > 0)) {
			rows.push({ label: 'Monthly payment', value: '— (loan amount and term must be > 0)' });
			return { rows };
		}
		const pi = monthlyPayment(loan, rate, months);
		const monthlyExtras = v.num('tax') / 12 + v.num('ins') / 12 + v.num('hoa');
		const { rows: tableRows, totalInterest } = amortize(loan, rate, months);
		return {
			rows: [
				{ label: 'Total monthly payment', value: money(pi + monthlyExtras), emphasis: true },
				{ label: 'Principal & interest', value: money(pi) },
				{ label: 'Property tax (monthly)', value: money(v.num('tax') / 12) },
				{ label: 'Insurance (monthly)', value: money(v.num('ins') / 12) },
				{ label: 'HOA fees', value: money(v.num('hoa')) },
				{ label: 'Loan amount', value: money(loan) },
				{ label: 'Total interest over the term', value: money(totalInterest) },
			],
			table: {
				columns: ['Year', 'Principal paid', 'Interest paid', 'Remaining balance'],
				rows: tableRows,
			},
		};
	},
};

// --- investment return ----------------------------------------------------------------

const investmentReturn: FormConfig = {
	fields: [
		{ id: 'initial', label: 'Initial investment', suffix: '($)', type: 'number', def: '10000', step: 'any', min: '0' },
		{ id: 'monthly', label: 'Monthly contribution', suffix: '($)', type: 'number', def: '500', step: 'any', min: '0' },
		{ id: 'years', label: 'Years', type: 'number', def: '20', step: 'any', min: '0' },
		{ id: 'rate', label: 'Annual return rate', suffix: '(%)', type: 'number', def: '7', step: 'any' },
	],
	compute: (v) => {
		const p = v.num('initial');
		const m = v.num('monthly');
		const t = v.num('years');
		const i = v.num('rate') / 100 / 12;
		if (!(t > 0)) return { rows: [{ label: 'Final value', value: '— (years must be > 0)' }] };
		const months = Math.round(t * 12);
		const fv = (em: number): number =>
			p * (1 + i) ** em + (i === 0 ? m * em : (m * ((1 + i) ** em - 1)) / i);
		const final = fv(months);
		const invested = p + m * months;
		const growth = final - invested;
		const tableRows: string[][] = [];
		for (let y = 1; y <= Math.min(Math.ceil(t), 60); y++) {
			const em = Math.min(y * 12, months);
			tableRows.push([String(y), money(p + m * em), money(fv(em)), money(fv(em) - (p + m * em))]);
		}
		return {
			rows: [
				{ label: 'Final value', value: money(final), emphasis: true },
				{ label: 'Total invested', value: money(invested) },
				{ label: 'Investment growth', value: money(growth) },
				{ label: 'Growth vs invested', value: invested > 0 ? `${formatNumber((growth / invested) * 100)}%` : '—' },
			],
			table: { columns: ['Year', 'Invested', 'Value', 'Growth'], rows: tableRows },
		};
	},
};

// --- roi ---------------------------------------------------------------------------------

const roi: FormConfig = {
	intro: 'ROI = (revenue − cost) ÷ cost × 100.',
	fields: [
		{ id: 'cost', label: 'Cost of investment', suffix: '($)', type: 'number', def: '1000', step: 'any' },
		{ id: 'revenue', label: 'Revenue / final value', suffix: '($)', type: 'number', def: '1500', step: 'any' },
	],
	compute: (v) => {
		const cost = v.num('cost');
		const revenue = v.num('revenue');
		const profit = revenue - cost;
		if (cost === 0) return { rows: [{ label: 'ROI', value: '— (cost is 0)' }] };
		return {
			rows: [
				{ label: 'ROI', value: `${formatNumber((profit / cost) * 100)}%`, emphasis: true },
				{ label: 'Net profit', value: money(profit) },
				{ label: 'Return multiple (revenue ÷ cost)', value: `${formatNumber(revenue / cost)}×` },
			],
			note: profit >= 0 ? `A gain of ${money(profit)}.` : `A loss of ${money(-profit)}.`,
		};
	},
};

// --- discount ------------------------------------------------------------------------------

const discount: FormConfig = {
	fields: [
		{ id: 'price', label: 'Original price', suffix: '($)', type: 'number', def: '100', step: 'any', min: '0' },
		{ id: 'pct', label: 'Discount', suffix: '(%)', type: 'number', def: '20', step: 'any' },
		{ id: 'qty', label: 'Quantity', type: 'number', def: '1', step: '1', min: '1' },
	],
	compute: (v) => {
		const price = v.num('price');
		const pctOff = v.num('pct');
		const qty = Math.max(1, Math.round(v.num('qty')) || 1);
		const unit = price * (1 - pctOff / 100);
		return {
			rows: [
				{ label: 'Final price per item', value: money(unit), emphasis: true },
				{ label: 'You save per item', value: money(price - unit) },
				{ label: `Total for ${qty} item${qty > 1 ? 's' : ''}`, value: money(unit * qty) },
				{ label: 'Total savings', value: money((price - unit) * qty) },
			],
		};
	},
};

// --- salary ----------------------------------------------------------------------------------

const salary: FormConfig = {
	fields: [
		{ id: 'annual', label: 'Annual salary', suffix: '($)', type: 'number', def: '60000', step: 'any', min: '0' },
		{ id: 'hours', label: 'Hours per week', type: 'number', def: '40', step: 'any', min: '0' },
		{ id: 'weeks', label: 'Working weeks per year', type: 'number', def: '52', step: 'any', min: '0' },
		{ id: 'days', label: 'Working days per week', type: 'number', def: '5', step: 'any', min: '0' },
	],
	compute: (v) => {
		const annual = v.num('annual');
		const weeks = v.num('weeks');
		const days = v.num('days');
		const totalHours = v.num('hours') * weeks;
		const rows: FormResultRow[] = [];
		if (!(weeks > 0)) {
			rows.push({ label: 'Hourly rate', value: '— (working weeks must be > 0)' });
			return { rows };
		}
		rows.push({
			label: 'Hourly rate',
			value: totalHours > 0 ? money(annual / totalHours) : '—',
			emphasis: true,
		});
		rows.push({ label: 'Weekly', value: money(annual / weeks) });
		rows.push({ label: 'Biweekly', value: money((annual / weeks) * 2) });
		rows.push({ label: 'Monthly', value: money(annual / 12) });
		rows.push({ label: 'Daily', value: days > 0 ? money(annual / weeks / days) : '—' });
		return { rows };
	},
};

// --- tax ----------------------------------------------------------------------------------------

const tax: FormConfig = {
	intro: 'Simple flat-rate tax: enter your marginal or effective rate.',
	fields: [
		{ id: 'gross', label: 'Gross income', suffix: '($)', type: 'number', def: '50000', step: 'any', min: '0' },
		{ id: 'rate', label: 'Tax rate', suffix: '(%)', type: 'number', def: '20', step: 'any', min: '0' },
	],
	compute: (v) => {
		const gross = v.num('gross');
		const rate = v.num('rate') / 100;
		const owed = gross * rate;
		return {
			rows: [
				{ label: 'Net income', value: money(gross - owed), emphasis: true },
				{ label: 'Tax owed', value: money(owed) },
				{ label: 'Net per month', value: money((gross - owed) / 12) },
				{ label: 'Tax per month', value: money(owed / 12) },
			],
		};
	},
};

// --- entries --------------------------------------------------------------------------------------

export const FINANCE_TOOLS: ToolEntry[] = [
	{
		slug: 'compound-interest',
		category: 'finance',
		name: 'Compound Interest Calculator',
		description: 'Compound interest with configurable compounding frequency, monthly contributions and a year-by-year table.',
		kind: 'form',
		config: compoundInterest,
	},
	{
		slug: 'loan-payment',
		category: 'finance',
		name: 'Loan Payment Calculator',
		description: 'Monthly payment, total interest and a yearly amortization schedule for any loan.',
		kind: 'form',
		config: loanPayment,
	},
	{
		slug: 'mortgage',
		category: 'finance',
		name: 'Mortgage Calculator',
		description: 'Monthly payment including principal, interest, tax, insurance and HOA, with an amortization schedule.',
		kind: 'form',
		config: mortgage,
	},
	{
		slug: 'investment-return',
		category: 'finance',
		name: 'Investment Return Calculator',
		description: 'Future value of an initial investment plus monthly contributions, year by year.',
		kind: 'form',
		config: investmentReturn,
	},
	{
		slug: 'roi',
		category: 'finance',
		name: 'ROI Calculator',
		description: 'Return on investment from cost and revenue, with net profit and return multiple.',
		kind: 'form',
		config: roi,
	},
	{
		slug: 'discount',
		category: 'finance',
		name: 'Discount Calculator',
		description: 'Final price and savings from a percentage discount, for one or many items.',
		kind: 'form',
		config: discount,
	},
	{
		slug: 'salary',
		category: 'finance',
		name: 'Salary Calculator',
		description: 'Convert an annual salary into hourly, weekly, biweekly, monthly and daily rates.',
		kind: 'form',
		config: salary,
	},
	{
		slug: 'tax',
		category: 'finance',
		name: 'Tax Calculator',
		description: 'Simple flat-rate income tax: tax owed and net income from gross salary.',
		kind: 'form',
		config: tax,
	},
];
