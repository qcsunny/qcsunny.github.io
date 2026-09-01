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

		content: {
			about: [
				'Compound interest is interest earned on interest: each period, your gains are added to the balance and the next period is calculated on the new total. This calculator takes a starting balance, an annual rate, a compounding frequency and an optional monthly contribution, then shows the year-by-year growth in a table.',
				'The formula is A = P·(1 + r/n)^(n·t), where n is the number of compounding periods per year. Over long horizons the effect is dramatic — a small monthly contribution can double the final balance of a decades-long investment.',
			],
			aboutZh: [
				'复利就是"利息生利息"：每期收益计入本金，下一期按新总额计息。本计算器支持初始本金、年利率、复利频率与可选的每月定投，并以逐年表格展示增长过程。',
				'公式为 A = P·(1 + r/n)^(n·t)，其中 n 为每年复利次数。时间越长效果越惊人——长期投资中，一笔小额月供可以让最终余额翻倍。',
			],
			faq: [
				{ q: 'What is the difference between simple and compound interest?', a: 'Simple interest is always calculated on the original principal; compound interest is calculated on the growing balance, so it earns "interest on interest".' },
				{ q: 'Does compounding frequency matter?', a: 'Yes. More frequent compounding (monthly vs yearly) yields slightly more, though the difference shrinks as rates fall.' },
				{ q: 'Are monthly contributions included from month one?', a: 'Yes, contributions are added at the end of each month and start compounding in the following period.' },
			],
			faqZh: [
				{ q: '复利和单利有什么区别？', a: '单利永远按原始本金计息；复利按不断增长的总余额计息，相当于"利滚利"。' },
				{ q: '复利频率有影响吗？', a: '有。更频繁的复利（如按月对比按年）收益略高，但利率越低差距越小。' },
				{ q: '每月定投从第一个月就算复利吗？', a: '是的，定投在每月月末计入，并从下一期开始参与复利。' },
			],
		},
	},
	{
		slug: 'loan-payment',
		category: 'finance',
		name: 'Loan Payment Calculator',
		description: 'Monthly payment, total interest and a yearly amortization schedule for any loan.',
		kind: 'form',
		config: loanPayment,

		content: {
			about: [
				'Estimate the monthly payment for any fixed-rate loan — a car loan, personal loan or student loan — using the standard amortization formula. Enter the amount, annual rate and term in months or years to get the payment, total interest and a yearly schedule of remaining balance.',
				'The monthly rate is the annual rate divided by 12, and the payment is P·i/(1 − (1+i)^−n). The schedule shows how each payment splits between interest and principal, and how the balance declines faster near the end of the term.',
			],
			aboutZh: [
				'用标准等额本息公式估算任意固定利率贷款（车贷、个人贷款、助学贷款）的月供。输入金额、年利率与期限，即可得到月供、总利息和按年的余额摊还表。',
				'月利率 = 年利率 ÷ 12，月供公式为 P·i/(1 − (1+i)^−n)。摊还表展示每期还款中利息与本金的比例，以及期限后期余额加速下降的过程。',
			],
			faq: [
				{ q: 'What is amortization?', a: 'A fixed monthly payment where the interest share shrinks and the principal share grows each month, keeping the total constant.' },
				{ q: 'Does a longer term cost more?', a: 'Yes. Lower monthly payments come at the price of more total interest over the life of the loan.' },
				{ q: 'Can I compare several loan offers?', a: 'Sure — change the rate or term and the results recalculate instantly, so you can compare offers side by side.' },
			],
			faqZh: [
				{ q: '什么是摊还（amortization）？', a: '即等额本息还款：每月还款额固定，但其中利息占比逐月减少、本金占比逐月增加。' },
				{ q: '期限越长成本越高吗？', a: '是的。月供压力变小，但贷款周期内支付的总利息更多。' },
				{ q: '可以比较多个贷款方案吗？', a: '可以，修改利率或期限后结果即时重算，方便并排对比。' },
			],
		},
	},
	{
		slug: 'mortgage',
		category: 'finance',
		name: 'Mortgage Calculator',
		description: 'Monthly payment including principal, interest, tax, insurance and HOA, with an amortization schedule.',
		kind: 'form',
		config: mortgage,

		content: {
			about: [
				'A mortgage is more than principal and interest: property tax, insurance and HOA fees are usually collected with the monthly payment. This calculator takes the home price, down payment, rate, term and those extras, then reports the full monthly payment plus an amortization schedule.',
				'A larger down payment reduces the loan amount and can eliminate private mortgage insurance (typically required below 20% down). The schedule table shows how equity builds over the years.',
			],
			aboutZh: [
				'房贷月供不只是本金加利息：房产税、保险和物业费通常也随月供一起缴纳。本计算器接受房价、首付、利率、期限及这些附加费用，给出完整的月供与摊还计划表。',
				'更高的首付能减少贷款额，并可能免去房贷保险（首付低于 20% 时通常必须购买）。摊还表展示了房屋净值逐年累积的过程。',
			],
			faq: [
				{ q: 'How much do I need for a 20% down payment?', a: '20% of the purchase price — for a $400,000 home that is $80,000, enough to avoid private mortgage insurance.' },
				{ q: 'What are escrow payments?', a: 'Property tax and insurance collected monthly by the lender and paid on your behalf — the "extras" fields in this calculator.' },
				{ q: 'Why is so much of my early payment interest?', a: 'Interest accrues on the outstanding balance, which is largest at the start, so the interest share of each payment is highest early on.' },
			],
			faqZh: [
				{ q: '20% 首付需要准备多少钱？', a: '房价的 20%——例如 40 万美元的房子需要 8 万美元，可以免去房贷保险。' },
				{ q: '什么是 escrow（托管缴费）？', a: '贷款机构每月代收房产税和保险费并代为缴纳，即本计算器中的"附加费用"字段。' },
				{ q: '为什么前期的还款大多是利息？', a: '利息按未偿余额计算，期初余额最大，因此前期还款中利息占比最高。' },
			],
		},
	},
	{
		slug: 'investment-return',
		category: 'finance',
		name: 'Investment Return Calculator',
		description: 'Future value of an initial investment plus monthly contributions, year by year.',
		kind: 'form',
		config: investmentReturn,

		content: {
			about: [
				'Project the future value of an investment that starts with a lump sum and grows with monthly contributions at a fixed annual return. The results break the final value into "money you put in" versus "growth" so the power of compounding is visible.',
				'Returns are compounded monthly and shown year by year. Real-world returns vary — this is a planning tool, not a promise — but it makes the trade-off between contribution size and time horizon concrete.',
			],
			aboutZh: [
				'预测一笔投资的未来价值：起始一次性投入 + 每月定投，按固定年收益率复利增长。结果把终值拆分为"投入本金"与"收益增长"两部分，复利的力量一目了然。',
				'收益按月复利计算并逐年展示。实际收益会有波动——这是规划工具而非承诺——但它能直观呈现定投金额与投资期限之间的权衡。',
			],
			faq: [
				{ q: 'What return rate should I use?', a: 'Historically broad stock indexes returned about 7–10% per year before inflation; use a conservative number for planning.' },
				{ q: 'Does it account for inflation?', a: 'No — enter a real (inflation-adjusted) return rate if you want results in today\'s purchasing power.' },
				{ q: 'When do contributions happen?', a: 'At the end of each month, and they start earning returns the following month.' },
			],
			faqZh: [
				{ q: '收益率应该填多少？', a: '历史上宽基股指的年化收益约为 7–10%（未扣通胀）；做规划时建议使用更保守的数字。' },
				{ q: '考虑通货膨胀吗？', a: '不考虑。若想按今天的购买力查看结果，请输入扣除通胀后的实际收益率。' },
				{ q: '定投是什么时候计入的？', a: '每月月末计入，从下个月开始产生收益。' },
			],
		},
	},
	{
		slug: 'roi',
		category: 'finance',
		name: 'ROI Calculator',
		description: 'Return on investment from cost and revenue, with net profit and return multiple.',
		kind: 'form',
		config: roi,

		content: {
			about: [
				'Return on investment (ROI) measures how efficiently money was used: net profit divided by cost. Enter what you spent and what you got back, and this page reports ROI as a percentage, the net profit, and the return multiple (revenue ÷ cost).',
				'ROI does not account for time — doubling your money in one year and over twenty years both show 100% ROI. For time-aware comparisons, an annualized (CAGR) measure is the better tool.',
			],
			aboutZh: [
				'投资回报率（ROI）衡量资金使用效率：净利润除以成本。输入投入与回收金额，即可得到 ROI 百分比、净利润和回报倍数（收入 ÷ 成本）。',
				'ROI 不考虑时间因素——一年翻倍和二十年翻倍的 ROI 都是 100%。若需要考虑时间的比较，年化收益率（CAGR）更合适。',
			],
			faq: [
				{ q: 'What is a good ROI?', a: 'It depends on the asset class; beating a benchmark like the S&P 500 (~10% annualized historically) is a common bar for active investments.' },
				{ q: 'Can ROI be negative?', a: 'Yes — if revenue is below cost, ROI is negative, meaning the investment lost money.' },
				{ q: 'What is the return multiple?', a: 'Revenue divided by cost: 2.0× means you got back twice what you put in.' },
			],
			faqZh: [
				{ q: 'ROI 多少算好？', a: '取决于资产类别；主动投资常见的基准是跑赢标普 500（历史年化约 10%）。' },
				{ q: 'ROI 可以是负数吗？', a: '可以。收入低于成本时 ROI 为负，表示亏损。' },
				{ q: '回报倍数是什么？', a: '收入 ÷ 成本：2.0× 表示收回的金额是投入的两倍。' },
			],
		},
	},
	{
		slug: 'discount',
		category: 'finance',
		name: 'Discount Calculator',
		description: 'Final price and savings from a percentage discount, for one or many items.',
		kind: 'form',
		config: discount,

		content: {
			about: [
				'Work out the final price after a percentage discount, and how much you save — for one item or a whole cart. Enter the original price, the discount percentage and the quantity to see the total you pay and the total saved.',
				'Stacked offers (like "30% off, then an extra 20%") are multiplicative, not additive: two 20% discounts equal 36% off, not 40%. Apply them one at a time to see the real combined rate.',
			],
			aboutZh: [
				'计算打折后的到手价与节省金额——单件或整单皆可。输入原价、折扣率和数量，即可看到应付总额与节省总额。',
				'叠加优惠（如"先 7 折再 8 折"）是相乘而非相加：两个 8 折相当于 6.4 折而非 6 折。分两次计算即可看到真实的合并折扣。',
			],
			faq: [
				{ q: 'How do I calculate a 20% discount?', a: 'Multiply the price by 0.8 (or subtract price × 0.20). The calculator does this for any percentage.' },
				{ q: 'Is "50% off, then 50% off" free?', a: 'No — it is 75% off total, because the second 50% applies to the already-halved price.' },
				{ q: 'Can I use it for sales tax too?', a: 'Enter the tax rate as a negative discount for a quick estimate, though exact tax rules vary by region.' },
			],
			faqZh: [
				{ q: '8 折怎么算？', a: '原价乘以 0.8（即减去原价的 20%）。本计算器支持任意折扣率。' },
				{ q: '"5 折再 5 折"等于免费吗？', a: '不等于——总计是 2.5 折，因为第二个 5 折作用于已减半的价格。' },
				{ q: '能用来估算含税价吗？', a: '可以把税率当作负折扣快速估算，但各地税收规则不同，精确计算请以当地规则为准。' },
			],
		},
	},
	{
		slug: 'salary',
		category: 'finance',
		name: 'Salary Calculator',
		description: 'Convert an annual salary into hourly, weekly, biweekly, monthly and daily rates.',
		kind: 'form',
		config: salary,

		content: {
			about: [
				'Convert an annual salary into hourly, daily, weekly, biweekly and monthly rates — the numbers that matter when comparing a contractor\'s hourly rate to a salaried offer, or budgeting paycheck to paycheck.',
				'The page assumes full-time work: 40 hours per week and 52 weeks per year (2,080 hours). You can adjust the hours per week to match your actual schedule.',
			],
			aboutZh: [
				'把年薪换算为时薪、日薪、周薪、双周薪和月薪——在对比外包时薪与正式Offer、或按工资周期做预算时最有用。',
				'本页按全职假设计算：每周 40 小时、每年 52 周（共 2080 小时）。你可以调整每周工时以匹配实际安排。',
			],
			faq: [
				{ q: 'How much is $60,000 a year per hour?', a: 'About $28.85 per hour at 2,080 hours per year (40 h/week × 52 weeks).' },
				{ q: 'Why is biweekly pay not half of monthly?', a: 'Biweekly = 26 paychecks a year, monthly = 12; two months a year you get three biweekly checks.' },
				{ q: 'Does this include vacation weeks?', a: 'The default 52-week year includes paid time off; if you are unpaid for some weeks, lower the weeks per year.' },
			],
			faqZh: [
				{ q: '年薪 6 万美元合多少时薪？', a: '按每年 2080 小时（每周 40 小时 × 52 周）计算，约合时薪 28.85 美元。' },
				{ q: '为什么双周薪不等于月薪的一半？', a: '双周薪一年发 26 次，月薪一年发 12 次；每年有两个月会收到三笔双周薪。' },
				{ q: '包含年假吗？', a: '默认的 52 周按带薪休假计算；若部分周无薪，请调低每年工作周数。' },
			],
		},
	},
	{
		slug: 'tax',
		category: 'finance',
		name: 'Tax Calculator',
		description: 'Simple flat-rate income tax: tax owed and net income from gross salary.',
		kind: 'form',
		config: tax,

		content: {
			about: [
				'A simple flat-rate income tax calculator: enter your gross income and a tax rate, and see the tax owed and your net (take-home) income. Useful for quick estimates, side-income planning and comparing flat-tax scenarios.',
				'Most countries use progressive brackets rather than a single rate, so for a precise return use your tax authority\'s calculator. For marginal decisions — "what if I earn $1,000 more" — your marginal bracket rate is the right number to enter here.',
			],
			aboutZh: [
				'简单的单一税率所得税计算器：输入税前收入与税率，即可得到应纳税额与税后实际到手收入。适合快速估算、副业收入规划与单一税制场景比较。',
				'多数国家采用累进税率而非单一税率，因此精确申报请以税务机关的计算工具为准。若是边际决策（"多赚 1000 元会怎样"），此处应填入你的边际税率档。',
			],
			faq: [
				{ q: 'Which rate should I enter?', a: 'For a rough estimate, your effective (average) rate; for the impact of extra income, your marginal (top bracket) rate.' },
				{ q: 'Does it handle social security or other deductions?', a: 'No — this is income tax only. Add those rates together if you want an all-in deduction estimate.' },
				{ q: 'Can it handle negative income?', a: 'Enter 0 or more; a loss year needs a different calculation (often carry-forward rules).' },
			],
			faqZh: [
				{ q: '应该填哪个税率？', a: '粗略估算填实际（平均）税率；看额外收入的边际影响则填边际（最高档）税率。' },
				{ q: '包含社保等其他扣缴吗？', a: '不包含，本页只算所得税。若想估算全部扣缴，可把各项税率相加后输入。' },
				{ q: '收入为负怎么办？', a: '请输入 0 或正数；亏损年度的计算通常涉及结转规则，本页不适用。' },
			],
		},
	},
];
