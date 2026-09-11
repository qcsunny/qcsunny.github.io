// Registry entries for /finance/* — all form tools, several with result
// tables (compound interest year by year, loan amortization, mortgage prepayment, etc.).

import type { FormConfig, FormResult, FormResultRow, FormTable, TextConfig, ToolEntry } from './registry';
import { rmbUppercase } from './textTools';
import { formatNumber } from '../scripts/calculator/engine';

const money = (v: number): string => formatNumber(Math.round(v * 100) / 100);

// Percentages and multiples read as prose here, not as calculator output.
// formatNumber keeps 12 significant digits (right for the calculator engine,
// which is shared), so a raw ratio prints as "利息节省 14.4415580034%".
const percent = (v: number): string => formatNumber(Math.round(v * 100) / 100);

/** A money row: "$1,234.00" in the English view, "¥1,234.00" in the Chinese one —
 *  the split the inputs already declare with suffix: '($)' / suffixZh: '(¥)'.
 *  Spread into a row rather than written out twice, so the symbol cannot drift
 *  apart from its twin; pass null for the em-dash placeholder. Result rows used
 *  to print the number bare while the parenthetical beside it carried a $, which
 *  read as "4462.58 ($371.88/mo)" — a unit on the small figure and none on the
 *  big one.
 */
const cash = (v: number | null): { value: string; valueZh: string } =>
	v === null || !Number.isFinite(v) ? { value: '—', valueZh: '—' } : { value: `$${money(v)}`, valueZh: `¥${money(v)}` };

/** A plain bilingual row (no currency formatting). */
const row2 = (label: string, labelZh: string, value: string, valueZh: string): FormResultRow => ({ label, labelZh, value, valueZh });

/** Equal-payment amortization monthly payment. months > 0. */
function monthlyPayment(principal: number, annualRatePct: number, months: number): number {
	const i = annualRatePct / 100 / 12;
	if (i <= 0) return principal / months;
	return (principal * i) / (1 - (1 + i) ** -months);
}

/** Longest term the schedules below will be built for. amortize() emits one row
 *  per year with no ceiling of its own, and compute() runs on every keystroke —
 *  so an extra digit in a term box asked it for twelve billion months and took
 *  the tab down with it (SIGABRT out of the Node run of the same code, a frozen
 *  page in a browser). 100 years is twice the longest mortgage anyone writes.
 *  Rejected rather than clamped, so no figure is ever quietly computed over a
 *  term other than the one that was typed. */
const MAX_TERM_YEARS = 100;

const overlongTerm = (): FormResult => ({
	rows: [
		{
			label: 'Result',
			labelZh: '计算结果',
			value: `— (term must be ${MAX_TERM_YEARS} years or less)`,
			valueZh: `— (期限不得超过 ${MAX_TERM_YEARS} 年)`,
		},
	],
});

/** Amortization rows grouped by year: [year, principal, interest, balance].
 *  Calculated via closed-form annuity formulas O(years) rather than nested monthly iterations O(months).
 */
function amortize(
	principal: number,
	annualRatePct: number,
	months: number,
): { rows: string[][]; totalInterest: number } {
	const pay = monthlyPayment(principal, annualRatePct, months);
	const i = annualRatePct / 100 / 12;
	let prevBalance = principal;
	let totalInterest = 0;
	const out: string[][] = [];
	const totalYears = Math.ceil(months / 12);

	if (i <= 0) {
		const yearlyPrinc = principal / totalYears;
		for (let y = 1; y <= totalYears; y++) {
			const endBalance = Math.max(0, principal - yearlyPrinc * y);
			out.push([String(y), money(yearlyPrinc), money(0), money(endBalance)]);
		}
		return { rows: out, totalInterest: 0 };
	}

	let powK = 1;
	for (let y = 1; y <= totalYears; y++) {
		const mCount = y === totalYears && months % 12 !== 0 ? months % 12 : 12;
		let endBalance = 0;
		if (y === totalYears && mCount === 12) {
			endBalance = 0;
		} else {
			powK *= (1 + i) ** mCount;
			endBalance = Math.max(0, principal * powK - pay * ((powK - 1) / i));
		}
		const principalY = prevBalance - endBalance;
		const actualPayY = pay * mCount;
		const interestY = actualPayY - principalY;
		totalInterest += interestY;
		out.push([String(y), money(principalY), money(interestY), money(endBalance)]);
		prevBalance = endBalance;
	}
	return { rows: out, totalInterest };
}

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

// --- compound interest (incorporating investment return) ------------------------

const compoundInterest: FormConfig = {
	intro: 'Compounded growth with an optional monthly contribution and year-by-year schedule.',
	introZh: '复利增长测算，可叠加每月定投，并给出逐年资产明细表。',
	fields: [
		{ id: 'p', label: 'Principal / Starting balance', labelZh: '初始投资本金', suffix: '($)', suffixZh: '(¥)', type: 'number', def: '10000', step: 'any', min: '0', required: true },
		{ id: 'r', label: 'Annual interest rate / return', labelZh: '预期年化收益率 / 利率', suffix: '(%)', type: 'number', def: '6', step: 'any', required: true },
		{ id: 't', label: 'Investment horizon', labelZh: '投资年限', suffix: '(years)', suffixZh: '(年)', type: 'number', def: '10', step: 'any', min: '0', required: true },
		{
			id: 'n',
			label: 'Compounding frequency',
			labelZh: '复利计息频率',
			type: 'select',
			def: '12',
			options: [
				{ value: '1', label: 'Annually', labelZh: '按年复利' },
				{ value: '2', label: 'Semiannually', labelZh: '每半年复利' },
				{ value: '4', label: 'Quarterly', labelZh: '按季度复利' },
				{ value: '12', label: 'Monthly', labelZh: '按月复利' },
				{ value: '365', label: 'Daily', labelZh: '按日复利' },
			],
		},
		{
			id: 'm',
			label: 'Monthly contribution',
			labelZh: '每月定期定投金额',
			suffix: '($)', suffixZh: '(¥)',
			type: 'number',
			def: '500',
			step: 'any',
			hint: 'Added at the end of each month',
			hintZh: '在每月月末投入并计入复利',
		},
	],
	compute: (v) => {
		const p = v.num('p');
		const r = v.num('r') / 100;
		const t = v.num('t');
		const n = Number(v.str('n')) || 1;
		const m = v.num('m');
		if (!(t > 0)) return { rows: [{ label: 'Final amount', labelZh: '最终金额', value: '— (years must be > 0)', valueZh: '— (年数需大于 0)' }] };
		// effective monthly rate so contributions match the compounding frequency
		const monthlyRate = (1 + r / n) ** (n / 12) - 1;
		const months = Math.round(t * 12);
		const fv = (elapsedMonths: number): number =>
			p * (1 + monthlyRate) ** elapsedMonths +
			(monthlyRate === 0 ? m * elapsedMonths : (m * ((1 + monthlyRate) ** elapsedMonths - 1)) / monthlyRate);
		const final = fv(months);
		const invested = p + m * months;
		const growth = final - invested;
		const returnPct = invested > 0 ? (growth / invested) * 100 : 0;
		const multiple = invested > 0 ? final / invested : 1;

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
				{ label: 'Final portfolio value', labelZh: '最终资产总值', ...cash(final), emphasis: true },
				{ label: 'Total invested (principal + contributions)', labelZh: '累计投入总本金', ...cash(invested) },
				{ label: 'Total interest / profit earned', labelZh: '累计利息与投资收益', ...cash(growth) },
				{ label: 'Total return on investment (ROI)', labelZh: '总投资回报率 (ROI)', value: `${percent(returnPct)}%` },
				{ label: 'Asset multiple (Final ÷ Invested)', labelZh: '资产增值倍数', value: `${percent(multiple)}×` },
			],
			table: {
				columns: ['Year', 'Total Invested ($)', 'Portfolio Value ($)', 'Interest Earned ($)'],
				columnsZh: ['年份', '累计投入本金 (¥)', '资产总值 (¥)', '累计利息收益 (¥)'],
				rows: tableRows,
			},
			note: `Over ${t} years, your ${money(invested)} total investment grew by ${money(growth)} (${percent(returnPct)}%), ending at ${money(final)}.`,
			noteZh: `在 ${t} 年内，您累计投入的 ${money(invested)} 本金共产生 ${money(growth)} 利息收益（回报率 ${percent(returnPct)}%），最终资产规模达到 ${money(final)}。`,
		};
	},
};

// --- mortgage prepayment calculator ----------------------------------------------

const mortgagePrepayment: FormConfig = {
	intro: 'Calculate remaining loan balance, compare term reduction vs monthly savings, and total interest saved.',
	introZh: '测算剩余贷款余额，对比"缩短年限"与"减少月供"两种方式，并算出节省的总利息。',
	fields: [
		{ id: 'loan', label: 'Original loan amount', labelZh: '原贷款本金', suffix: '($)', suffixZh: '(¥)', type: 'number', def: '1000000', step: 'any', min: '0', required: true },
		{ id: 'rate', label: 'Annual interest rate', labelZh: '贷款年化利率', suffix: '(%)', type: 'number', def: '3.8', step: 'any', min: '0', required: true },
		{ id: 'years', label: 'Original loan term', labelZh: '原贷款期限', suffix: '(years)', suffixZh: '(年)', type: 'number', def: '30', step: '1', min: '1', required: true },
		{ id: 'paidMonths', label: 'Months already paid', labelZh: '已正常还款月数', suffix: '(months)', suffixZh: '(个月)', type: 'number', def: '36', step: '1', min: '0', required: true },
		{ id: 'prepay', label: 'Lump-sum prepayment amount', labelZh: '本次提前还贷金额', suffix: '($)', suffixZh: '(¥)', type: 'number', def: '200000', step: 'any', min: '0', required: true },
		{
			id: 'strategy',
			label: 'Prepayment strategy',
			labelZh: '提前还贷调整方案',
			type: 'select',
			def: 'shorten',
			options: [
				{ value: 'shorten', label: 'Shorten loan term (Keep payment same)', labelZh: '缩短还款年限 (月供基本不变，节省最多利息)' },
				{ value: 'reduce', label: 'Reduce monthly payment (Keep term same)', labelZh: '减少每月供款 (还款期限不变，减轻每月压力)' },
			],
		},
	],
	compute: (v) => {
		const loan = v.num('loan');
		const rate = v.num('rate');
		const totalMonths = Math.round(v.num('years') * 12);
		const paidMonths = Math.min(Math.max(0, Math.round(v.num('paidMonths'))), totalMonths - 1);
		const prepay = v.num('prepay');
		const strategy = v.str('strategy');

		if (!(loan > 0) || !(totalMonths > 0)) {
			return { rows: [{ label: 'Result', labelZh: '计算结果', value: '— (loan amount and term must be > 0)', valueZh: '— (贷款金额与期限需大于 0)' }] };
		}
		if (totalMonths > MAX_TERM_YEARS * 12) return overlongTerm();
		const i = rate / 100 / 12;
		const origPayment = monthlyPayment(loan, rate, totalMonths);

		// calculate balance after paidMonths in O(1) closed form
		let balanceBefore = loan;
		let interestPaidSoFar = 0;
		if (paidMonths > 0) {
			if (i <= 0) {
				const monthlyPrinc = loan / totalMonths;
				balanceBefore = Math.max(0, loan - monthlyPrinc * paidMonths);
				interestPaidSoFar = 0;
			} else {
				const powN = (1 + i) ** paidMonths;
				balanceBefore = Math.max(0, loan * powN - origPayment * ((powN - 1) / i));
				interestPaidSoFar = origPayment * paidMonths - (loan - balanceBefore);
			}
		}
		const prepayActual = Math.min(prepay, balanceBefore);
		const balanceAfter = Math.max(balanceBefore - prepayActual, 0);

		const remainingMonthsOrig = totalMonths - paidMonths;
		const origRemainingTotalPay = origPayment * remainingMonthsOrig;
		const origRemainingInterest = Math.max(origRemainingTotalPay - balanceBefore, 0);

		if (balanceAfter <= 0) {
			return {
				rows: [
					{ label: 'Status', labelZh: '还贷状态', value: 'Loan fully paid off!', valueZh: '贷款已全额结清！', emphasis: true },
					{ label: 'Remaining balance before prepay', labelZh: '还款前未还本金', ...cash(balanceBefore) },
					{ label: 'Actual prepayment used', labelZh: '实际用于冲还本金', ...cash(prepayActual) },
					{ label: 'Total interest saved', labelZh: '累计节省利息支出', ...cash(origRemainingInterest) },
					{
						label: 'Months saved',
						labelZh: '提前结清期数',
						value: `${remainingMonthsOrig} months (${(remainingMonthsOrig / 12).toFixed(1)} years)`,
						valueZh: `${remainingMonthsOrig} 个月 (约 ${(remainingMonthsOrig / 12).toFixed(1)} 年)`,
					},
					{ label: 'Interest already paid', labelZh: '已还利息累计', ...cash(interestPaidSoFar) },
				],
				note: 'Prepayment fully clears all outstanding principal. No further interest will accrue!',
				noteZh: '提前还款金额已完全覆盖所有未偿本金，您的贷款已全部结清，无需再支付后续利息！',
			};
		}

		if (strategy === 'shorten') {
			let newMonths = 0;
			if (i <= 0) {
				newMonths = Math.ceil(balanceAfter / origPayment);
			} else {
				const ratio = (balanceAfter * i) / origPayment;
				if (ratio >= 1) {
					newMonths = remainingMonthsOrig;
				} else {
					newMonths = Math.ceil(-Math.log(1 - ratio) / Math.log(1 + i));
				}
			}
			const monthsSaved = Math.max(remainingMonthsOrig - newMonths, 0);
			const yearsSaved = (monthsSaved / 12).toFixed(1);
			const newTotalPay = origPayment * newMonths;
			const newRemainingInterest = Math.max(newTotalPay - balanceAfter, 0);
			const interestSaved = Math.max(origRemainingInterest - newRemainingInterest, 0);

			return {
				rows: [
					{ label: 'Total interest saved', labelZh: '累计节省利息支出', ...cash(interestSaved), emphasis: true },
						{
						label: 'Loan term shortened by',
						labelZh: '缩短还款期限',
						value: `${monthsSaved} months (~${yearsSaved} yr)`,
						valueZh: `${monthsSaved} 个月 (约 ${yearsSaved} 年)`,
					},
					{
						label: 'New remaining loan term',
						labelZh: '调整后剩余还款期限',
						value: `${newMonths} months (~${(newMonths / 12).toFixed(1)} yr)`,
						valueZh: `${newMonths} 个月 (约 ${(newMonths / 12).toFixed(1)} 年)`,
					},
					{ label: 'Monthly payment (stays same)', labelZh: '每月月供 (基本保持不变)', ...cash(origPayment) },
					{ label: 'Remaining balance before prepay', labelZh: '提前还款前未还本金', ...cash(balanceBefore) },
					{ label: 'Remaining balance after prepay', labelZh: '提前还款后剩余本金', ...cash(balanceAfter) },
					{ label: 'Interest already paid', labelZh: '已正常支付利息', ...cash(interestPaidSoFar) },
				],
				note: `By prepaying ${money(prepayActual)} and keeping monthly payments at ${money(origPayment)}, you shorten your mortgage by ${yearsSaved} years and save ${money(interestSaved)} in interest.`,
				noteZh: `通过提前偿还本金 ${money(prepayActual)} 并保持月供 ${money(origPayment)} 不变，您的房贷将提前约 ${yearsSaved} 年结清，累计节省利息 ${money(interestSaved)}。`,
			};
		} else {
			const newPayment = monthlyPayment(balanceAfter, rate, remainingMonthsOrig);
			const monthlyReduction = Math.max(origPayment - newPayment, 0);
			const newTotalPay = newPayment * remainingMonthsOrig;
			const newRemainingInterest = Math.max(newTotalPay - balanceAfter, 0);
			const interestSaved = Math.max(origRemainingInterest - newRemainingInterest, 0);

			return {
				rows: [
					{ label: 'New monthly payment', labelZh: '调整后每月新月供', ...cash(newPayment), emphasis: true },
					{
						label: 'Monthly payment reduction',
						labelZh: '每月月供减轻',
						value: `-$${money(monthlyReduction)} / month`,
						valueZh: `-¥${money(monthlyReduction)} / 月`,
					},
					{ label: 'Total interest saved', labelZh: '累计节省利息支出', ...cash(interestSaved) },
					{ label: 'Original monthly payment', labelZh: '原每月月供', ...cash(origPayment) },
					{ label: 'Remaining balance before prepay', labelZh: '提前还款前未还本金', ...cash(balanceBefore) },
					{ label: 'Remaining balance after prepay', labelZh: '提前还款后剩余本金', ...cash(balanceAfter) },
					{
						label: 'Remaining term (unchanged)',
						labelZh: '剩余期限 (保持不变)',
						value: `${remainingMonthsOrig} months (${(remainingMonthsOrig / 12).toFixed(1)} yr)`,
						valueZh: `${remainingMonthsOrig} 个月 (${(remainingMonthsOrig / 12).toFixed(1)} 年)`,
					},
				],
				note: `By prepaying ${money(prepayActual)}, your monthly bill drops from ${money(origPayment)} to ${money(newPayment)} (-${money(monthlyReduction)}/mo), saving ${money(interestSaved)} in total interest over ${(remainingMonthsOrig / 12).toFixed(1)} years.`,
				noteZh: `通过提前偿还本金 ${money(prepayActual)}，您的每月月供从 ${money(origPayment)} 降至 ${money(newPayment)}（每月减负 ${money(monthlyReduction)}），在剩余 ${(remainingMonthsOrig / 12).toFixed(1)} 年内累计省息 ${money(interestSaved)}。`,
			};
		}
	},
};

// --- inflation & purchasing power calculator -------------------------------------

const inflation: FormConfig = {
	intro: 'Calculate future purchasing power erosion and future equivalent cost based on annual inflation.',
	introZh: '按年通胀率测算购买力缩水程度，以及同一笔钱在未来的等值成本。',
	fields: [
		{ id: 'amount', label: 'Current amount / Present value', labelZh: '当前金额 / 资产现值', suffix: '($)', suffixZh: '(¥)', type: 'number', def: '100000', step: 'any', min: '0', required: true },
		{ id: 'rate', label: 'Average annual inflation rate', labelZh: '年均通货膨胀率', suffix: '(%)', type: 'number', def: '3', step: 'any', required: true },
		{ id: 'years', label: 'Time horizon', labelZh: '时间跨度', suffix: '(years)', suffixZh: '(年)', type: 'number', def: '20', step: 'any', min: '0', required: true },
	],
	compute: (v) => {
		const amount = v.num('amount');
		const rate = v.num('rate');
		const years = v.num('years');
		// rate ≤ −100% makes (1+r) ≤ 0: purchasing power divides by it
		// (Infinity) and fractional years go NaN. Guard on the same dash-row.
		if (!(amount > 0) || !(years > 0) || !(rate > -100)) {
			return {
				rows: [
					{
						label: 'Result',
						labelZh: '计算结果',
						value: '— (amount and years must be > 0; rate must be > −100%)',
						valueZh: '— (金额与年数需大于 0；年通胀率需大于 −100%)',
					},
				],
			};
		}
		const r = rate / 100;
		const futureCost = amount * (1 + r) ** years;
		const futurePower = amount / (1 + r) ** years;
		const lossPct = (1 - futurePower / amount) * 100;

		const milestones = [1, 3, 5, 10, 15, 20, 25, 30].filter((y) => y <= Math.max(years, 30));
		if (!milestones.includes(Math.round(years))) milestones.push(Math.round(years));
		milestones.sort((a, b) => a - b);

		const tableRows: string[][] = milestones.map((y) => {
			const costY = amount * (1 + r) ** y;
			const powerY = amount / (1 + r) ** y;
			const lossY = (1 - powerY / amount) * 100;
			return [String(y), money(costY), money(powerY), `${percent(lossY)}%`];
		});

		return {
			rows: [
				{ label: 'Future equivalent cost', labelZh: '未来购买等价商品所需金额', ...cash(futureCost), emphasis: true },
				{ label: 'Future purchasing power of current cash', labelZh: '当前现金在未来的实际购买力', ...cash(futurePower) },
				{ label: 'Total purchasing power loss', labelZh: '实际购买力缩水比例', value: `${percent(lossPct)}%` },
				{ label: 'Price level multiplier', labelZh: '物价上涨倍数', value: `${percent(futureCost / amount)}×` },
			],
			table: {
				columns: ['Years Ahead', 'Equivalent Cost ($)', 'Real Purchasing Power ($)', 'Loss (%)'],
				columnsZh: ['年数', '等价商品所需金额 (¥)', '现金实际购买力 (¥)', '购买力缩水率'],
				rows: tableRows,
			},
			note: `At a ${rate}% annual inflation rate, what costs ${money(amount)} today will cost ${money(futureCost)} in ${years} years. Keeping cash under a mattress loses ${percent(lossPct)}% of its real purchasing power.`,
			noteZh: `在年均通胀率 ${rate}% 的影响下，今天价值 ${money(amount)} 的商品在 ${years} 年后需要花费 ${money(futureCost)} 才能买到。若将现金单纯闲置，实际购买力将大幅缩水 ${percent(lossPct)}%。`,
		};
	},
};

// --- savings goal calculator -----------------------------------------------------

const savingsGoal: FormConfig = {
	intro: 'Calculate the required monthly contribution to reach your financial target by a specific date.',
	introZh: '倒推为在目标日期前达成储蓄目标，每月需要投入多少钱。',
	fields: [
		{ id: 'target', label: 'Target savings goal', labelZh: '目标储蓄规划总额', suffix: '($)', suffixZh: '(¥)', type: 'number', def: '500000', step: 'any', min: '0', required: true },
		{ id: 'current', label: 'Current initial savings', labelZh: '当前已有初始存款', suffix: '($)', suffixZh: '(¥)', type: 'number', def: '50000', step: 'any', min: '0', required: true },
		{ id: 'years', label: 'Time to reach goal', labelZh: '计划储备年限', suffix: '(years)', suffixZh: '(年)', type: 'number', def: '5', step: 'any', min: '0.1', required: true },
		{ id: 'rate', label: 'Expected annual return rate', labelZh: '预期年化投资收益率', suffix: '(%)', type: 'number', def: '5', step: 'any', required: true },
	],
	compute: (v) => {
		const target = v.num('target');
		const current = v.num('current');
		const years = v.num('years');
		const rate = v.num('rate') / 100;
		const months = Math.round(years * 12);
		if (!(target > 0) || !(months > 0)) {
			return { rows: [{ label: 'Result', labelZh: '计算结果', value: '— (target and years must be > 0)', valueZh: '— (目标金额与年数需大于 0)' }] };
		}
		const i = rate / 12;
		const fvCurrent = current * (1 + i) ** months;
		const gap = Math.max(0, target - fvCurrent);
		let pmt = 0;
		if (gap > 0) {
			pmt = i === 0 ? gap / months : (gap * i) / ((1 + i) ** months - 1);
		}
		const totalSelfFunded = current + pmt * months;
		const interestEarned = Math.max(0, target - totalSelfFunded);
		const interestShare = target > 0 ? (interestEarned / target) * 100 : 0;

		const tableRows: string[][] = [];
		const displayYears = Math.min(Math.ceil(years), 50);
		for (let y = 1; y <= displayYears; y++) {
			const em = Math.min(y * 12, months);
			const fvAtEm =
				current * (1 + i) ** em +
				(i === 0 ? pmt * em : (pmt * ((1 + i) ** em - 1)) / i);
			const investedAtEm = current + pmt * em;
			tableRows.push([
				String(y),
				money(investedAtEm),
				money(fvAtEm),
				// 超出金额由上一列 Projected Balance 呈现。
				// 上限 100%（目标达成度）：一旦达标，"超出的部分"就是已达成，百分比不再细分，
				`${Math.min(100, Math.round((fvAtEm / target) * 100))}%`,
			]);
		}

		return {
			rows: [
				{ label: 'Required monthly savings', labelZh: '每月需定投/储蓄金额', ...cash(pmt), emphasis: true },
				{ label: 'Total self-funded contributions', labelZh: '个人累计投入本金', ...cash(totalSelfFunded) },
				{ label: 'Gains / interest earned', labelZh: '复合收益 / 利息贡献', ...cash(interestEarned) },
				{ label: 'Gains share of goal', labelZh: '收益贡献占比', value: `${percent(interestShare)}%` },
				{ label: 'Target goal amount', labelZh: '目标总储蓄额', ...cash(target) },
			],
			table: {
				columns: ['Year', 'Total Contributed ($)', 'Projected Balance ($)', 'Goal Progress'],
				columnsZh: ['年份', '累计投入本金 (¥)', '预估资产总额 (¥)', '目标达成度'],
				rows: tableRows,
			},
			note: `To reach ${money(target)} in ${years} years, deposit ${money(pmt)} monthly. Compound interest earns ${money(interestEarned)} (${percent(interestShare)}% of the goal).`,
			noteZh: `要在 ${years} 年内达成 ${money(target)} 的储蓄目标，您只需每月存入 ${money(pmt)}。在复利作用下，利息与投资增值将为您贡献 ${money(interestEarned)}（占目标总额的 ${percent(interestShare)}%）。`,
		};
	},
};

// --- auto loan & out-of-pocket calculator ---------------------------------------

const autoLoan: FormConfig = {
	intro: 'Estimate monthly car payments, interest, taxes, insurance and total out-of-pocket cost.',
	introZh: '估算车贷月供、利息、购置税、保险与落地总花费。',
	fields: [
		{ id: 'carPrice', label: 'Vehicle price', labelZh: '车辆裸车指导价', suffix: '($)', suffixZh: '(¥)', type: 'number', def: '150000', step: 'any', min: '0', required: true },
		{ id: 'downPct', label: 'Down payment percentage', labelZh: '首付比例', suffix: '(%)', type: 'number', def: '20', step: 'any', min: '0', max: '100', required: true },
		{
			id: 'months',
			label: 'Loan term',
			labelZh: '还款分期期限',
			type: 'select',
			def: '36',
			options: [
				{ value: '12', label: '12 months (1 year)', labelZh: '12 期 (1 年)' },
				{ value: '24', label: '24 months (2 years)', labelZh: '24 期 (2 年)' },
				{ value: '36', label: '36 months (3 years)', labelZh: '36 期 (3 年)' },
				{ value: '48', label: '48 months (4 years)', labelZh: '48 期 (4 年)' },
				{ value: '60', label: '60 months (5 years)', labelZh: '60 期 (5 年)' },
			],
		},
		{ id: 'rate', label: 'Annual interest rate', labelZh: '车贷年化利率', suffix: '(%)', type: 'number', def: '4.5', step: 'any', min: '0', required: true },
		{ id: 'tax', label: 'Purchase tax / Sales tax', labelZh: '车辆购置税 / 消费税', suffix: '($)', suffixZh: '(¥)', type: 'number', def: '13274', step: 'any', min: '0', hint: 'In China, roughly Price ÷ 1.13 × 10%', hintZh: '国内购置税约按 裸车价 ÷ 1.13 × 10% 计算' },
		{ id: 'insurance', label: 'First-year insurance', labelZh: '首年车险保费 (交强险+商业险)', suffix: '($)', suffixZh: '(¥)', type: 'number', def: '5000', step: 'any', min: '0' },
		{ id: 'license', label: 'Registration & service fees', labelZh: '上牌与综合杂费', suffix: '($)', suffixZh: '(¥)', type: 'number', def: '500', step: 'any', min: '0' },
	],
	compute: (v) => {
		const price = v.num('carPrice');
		const downPct = v.num('downPct');
		const months = Math.round(Number(v.str('months')) || 36);
		const rate = v.num('rate');
		const tax = v.num('tax');
		const ins = v.num('insurance');
		const license = v.num('license');

		if (!(price > 0) || !(months > 0)) {
			return { rows: [{ label: 'Result', labelZh: '计算结果', value: '— (price and term must be > 0)', valueZh: '— (车价与期限需大于 0)' }] };
		}
		const downPayment = price * (downPct / 100);
		const loanAmount = Math.max(0, price - downPayment);
		const monthly = monthlyPayment(loanAmount, rate, months);
		const totalLoanRepay = monthly * months;
		const totalInterest = Math.max(0, totalLoanRepay - loanAmount);
		const upfrontCash = downPayment + tax + ins + license;
		const totalOutPocket = upfrontCash + totalLoanRepay;

		return {
			rows: [
				{ label: 'Monthly payment', labelZh: '每月车贷还款额', ...cash(monthly), emphasis: true },
				{ label: 'Initial cash required (drive-away)', labelZh: '购车落地首期总支出 (首付+税险费)', ...cash(upfrontCash) },
				{ label: 'Loan principal', labelZh: '汽车贷款总额', ...cash(loanAmount) },
				{ label: 'Down payment amount', labelZh: '裸车首付金额', ...cash(downPayment) },
				{ label: 'Total loan interest', labelZh: '贷款利息总额', ...cash(totalInterest) },
				{ label: 'Total out-of-pocket over full loan', labelZh: '分期购车落地总支出 (全部开销)', ...cash(totalOutPocket) },
				{ label: 'Extra cost vs cash purchase', labelZh: '贷款分期较全款多花费用', ...cash(totalInterest) },
			],
			note: `Financing ${money(loanAmount)} over ${months} months costs ${money(monthly)}/mo with ${money(totalInterest)} in interest. Upfront cash needed: ${money(upfrontCash)}.`,
			noteZh: `贷款 ${money(loanAmount)} 分 ${months} 期还清，月供为 ${money(monthly)}，贷款利息总计 ${money(totalInterest)}。购车提车首期需准备资金：${money(upfrontCash)}。`,
		};
	},
};

// --- irr & true apr calculator --------------------------------------------------

const irrCalculator: FormConfig = {
	intro: 'Convert advertised installment fees into true APR / IRR via Newton-Raphson approximation.',
	introZh: '用牛顿迭代法把分期手续费率还原成真实年化利率 IRR。',
	fields: [
		{ id: 'principal', label: 'Borrowed principal', labelZh: '分期 / 借款本金', suffix: '($)', suffixZh: '(¥)', type: 'number', def: '12000', step: 'any', min: '0', required: true },
		{ id: 'periods', label: 'Installment periods', labelZh: '分期总期数', suffix: '(months)', suffixZh: '(期)', type: 'number', def: '12', step: '1', min: '1', required: true },
		{
			id: 'mode',
			label: 'Fee input type',
			labelZh: '费用输入形式',
			type: 'select',
			def: 'fee_rate',
			options: [
				{ value: 'fee_rate', label: 'Monthly fee rate (%)', labelZh: '按每月手续费率 % (如信用卡分期)' },
				{ value: 'monthly_payment', label: 'Fixed monthly payment ($)', labelZh: '按每期固定还款金额 (¥)' },
				{ value: 'total_fee', label: 'Total fee / interest ($)', labelZh: '按总手续费 / 总利息金额 (¥)' },
			],
		},
		{
			id: 'feeRate',
			label: 'Monthly fee rate',
			labelZh: '每期手续费率',
			suffix: '(%)',
			type: 'number',
			def: '0.6',
			step: 'any',
			min: '0',
			hint: 'Used when "Monthly fee rate" is selected',
			hintZh: '仅在选择"按每月手续费率"时生效',
			showIf: (v) => (v.str('mode') || 'fee_rate') === 'fee_rate',
			required: (v) => (v.str('mode') || 'fee_rate') === 'fee_rate',
		},
		{
			id: 'monthlyPay',
			label: 'Monthly payment amount',
			labelZh: '每期固定还款额',
			suffix: '($)', suffixZh: '(¥)',
			type: 'number',
			def: '1072',
			step: 'any',
			min: '0',
			hint: 'Used when "Fixed monthly payment" is selected',
			hintZh: '仅在选择"按每期固定还款金额"时生效',
			showIf: (v) => v.str('mode') === 'monthly_payment',
			required: (v) => v.str('mode') === 'monthly_payment',
		},
		{
			id: 'totalFee',
			label: 'Total fee / interest',
			labelZh: '总手续费或总利息',
			suffix: '($)', suffixZh: '(¥)',
			type: 'number',
			def: '864',
			step: 'any',
			min: '0',
			hint: 'Used when "Total fee" is selected',
			hintZh: '仅在选择"按总手续费"时生效',
			showIf: (v) => v.str('mode') === 'total_fee',
			required: (v) => v.str('mode') === 'total_fee',
		},
	],
	compute: (v) => {
		const P = v.num('principal');
		const n = Math.max(1, Math.round(v.num('periods')));
		const mode = v.str('mode');
		let pmt = 0;
		let totalFee = 0;

		if (mode === 'monthly_payment') {
			pmt = v.num('monthlyPay');
			totalFee = pmt * n - P;
		} else if (mode === 'total_fee') {
			totalFee = v.num('totalFee');
			pmt = (P + totalFee) / n;
		} else {
			const feeRate = v.num('feeRate') / 100;
			const monthlyFee = P * feeRate;
			pmt = P / n + monthlyFee;
			totalFee = monthlyFee * n;
		}

		if (!(P > 0) || !(n > 0) || !(pmt > 0)) {
			return { rows: [{ label: 'Result', labelZh: '计算结果', value: '— (invalid principal, periods, or fee)', valueZh: '— (本金、期数或费率不合法)' }] };
		}

		const nominalAnnualRate = ((totalFee / P) / (n / 12)) * 100;

		// Newton-Raphson solver for the monthly IRR r, the rate at which n payments
		// are worth exactly the principal today:
		//   f(r)  = pmt · (1 − (1+r)^−n) / r − P
		//   f′(r) = pmt · (n·r·(1+r)^(−n−1) − (1 − (1+r)^−n)) / r²
		// Both sides used to be summed term by term, which made a single Newton step
		// O(n) — and n is a number someone types, with compute() re-running on every
		// keystroke. One digit too many turned 60 steps into tens of billions of `**`
		// calls and hung the tab (a synchronous loop: no timeout can interrupt it).
		// The closed forms are the same annuity, in constant time.
		let r = totalFee <= 0 ? 0 : (2 * totalFee) / (n * P);
		if (r <= 0) r = 0.001;

		for (let iter = 0; iter < 60; iter++) {
			// Both expressions divide by r; at 0 they take their limits A(0) = n and
			// A′(0) = −n(n+1)/2, which a Newton step can land on exactly.
			const u = (1 + r) ** -n;
			const f = r === 0 ? pmt * n - P : (pmt * (1 - u)) / r - P;
			const df = r === 0 ? (-pmt * n * (n + 1)) / 2 : (pmt * (n * r * (1 + r) ** (-n - 1) - (1 - u))) / (r * r);
			if (!Number.isFinite(f) || !Number.isFinite(df)) break;
			if (Math.abs(f) < 1e-8 || Math.abs(df) < 1e-12) break;
			const step = f / df;
			if (!Number.isFinite(step)) break;
			r -= step;
			if (r < -0.99) r = -0.99;
		}

		const trueApr = r * 12 * 100;
		const ear = ((1 + r) ** 12 - 1) * 100;
		const rateDiff = trueApr - nominalAnnualRate;

		// Newton is not guaranteed to land anywhere on an absurd term/fee pair, and
		// "NaN%" is not a result. Same shape as the input guard above.
		if (!Number.isFinite(trueApr) || !Number.isFinite(ear)) {
			return { rows: [{ label: 'Result', labelZh: '计算结果', value: '— (no rate solves these numbers)', valueZh: '— (该组数据无法解出利率)' }] };
		}

		return {
			rows: [
				{ label: 'True Annualized Rate (APR / IRR)', labelZh: '真实实际年化利率 (APR / IRR)', value: `${trueApr.toFixed(2)}%`, emphasis: true },
				{ label: 'Nominal Advertised Rate', labelZh: '表面名义年化费率 (宣传费率)', value: `${nominalAnnualRate.toFixed(2)}%` },
				{ label: 'Rate Discrepancy (True vs Advertised)', labelZh: '真实利率高出宣传费率', value: `+${rateDiff.toFixed(2)}% (~${(trueApr / (nominalAnnualRate || 1)).toFixed(1)}×)` },
				{ label: 'Monthly installment payment', labelZh: '每期实际还款额', ...cash(pmt) },
				{ label: 'Total handling fee / interest', labelZh: '累计支付手续费与利息', ...cash(totalFee) },
				{ label: 'Total repayment (Principal + Fees)', labelZh: '还款总额 (本金 + 手续费)', ...cash(pmt * n) },
				{ label: 'Effective Annual Rate (EAR)', labelZh: '有效年利率 (按月复利 EAR)', value: `${ear.toFixed(2)}%` },
			],
			note: `Why is the true APR (${trueApr.toFixed(2)}%) almost double the advertised rate (${nominalAnnualRate.toFixed(2)}%)? Because you repay principal each month, your average loan balance is only about half the starting amount, but fees are charged on the entire initial balance throughout!`,
			noteZh: `为什么真实年化利率 (${trueApr.toFixed(2)}%) 几乎是宣传费率 (${nominalAnnualRate.toFixed(2)}%) 的两倍？因为您每月都在归还本金，资金实际占用额逐月递减（平均只借了约一半本金），但借款平台却全程按全部本金收取手续费！`,
		};
	},
};

// --- fire calculator (Financial Independence, Retire Early) --------------------

const fireCalculator: FormConfig = {
	intro: 'Calculate your target FIRE nest egg and projected retirement age based on the 4% rule.',
	introZh: '按 4% 法则测算 FIRE 财务自由所需资产，以及预计可退休的年龄。',
	fields: [
		{ id: 'age', label: 'Current age', labelZh: '当前年龄', suffix: '(years)', suffixZh: '(岁)', type: 'number', def: '30', step: '1', min: '18', max: '80', required: true },
			{ id: 'coastAge', label: 'Retirement age for Coast FIRE', labelZh: 'Coast FIRE 计划退休年龄', suffix: '(years)', suffixZh: '(岁)', type: 'number', def: '60', step: '1', min: '18', max: '90', required: true, hint: 'Age at which you stop saving and let compounding reach your FIRE target.', hintZh: '从该年龄起停止追加投入、仅靠复利滚到 FIRE 目标的年龄' },
		{ id: 'annualExp', label: 'Expected annual living expenses in retirement', labelZh: '退休后预期年生活支出', suffix: '($)', suffixZh: '(¥)', type: 'number', def: '100000', step: 'any', min: '0', required: true },
		{ id: 'currentAssets', label: 'Current net investment assets', labelZh: '当前已有可投资生息净资产', suffix: '($)', suffixZh: '(¥)', type: 'number', def: '300000', step: 'any', min: '0', required: true },
		{ id: 'annualSave', label: 'Annual savings added to investments', labelZh: '每年新增投资结余 (年储蓄额)', suffix: '($)', suffixZh: '(¥)', type: 'number', def: '80000', step: 'any', min: '0', required: true },
		{ id: 'returnRate', label: 'Expected annual net return rate', labelZh: '预期年化投资回报率 (扣除通胀后)', suffix: '(%)', type: 'number', def: '6', step: 'any', required: true },
		{ id: 'swr', label: 'Safe withdrawal rate (SWR)', labelZh: '安全提款率 (SWR)', suffix: '(%)', type: 'number', def: '4', step: 'any', required: true, hint: 'Standard 4% rule (Trinity Study)', hintZh: 'Trinity 经典 4% 法则 (即 25 倍年支出)' },
	],
	compute: (v) => {
		const age = Math.round(v.num('age'));
		const exp = v.num('annualExp');
		const cur = v.num('currentAssets');
		const save = v.num('annualSave');
		const r = v.num('returnRate') / 100;
		const swr = v.num('swr') / 100;

		if (!(exp > 0) || !(swr > 0)) {
			return { rows: [{ label: 'Result', labelZh: '计算结果', value: '— (expenses and withdrawal rate must be > 0)', valueZh: '— (年度支出与提现率需大于 0)' }] };
		}
		const targetFire = exp / swr;
		const leanFire = targetFire * 0.75;
		const fatFire = targetFire * 1.25;

		// Coast FIRE is a different question from Lean/Standard/Fat above: instead
		// of "how much must I keep saving toward 25×", it asks "once I hold C, I can
		// stop saving — compounding from now to coastAge will reach the target on its
		// own". So C is the target discounted back over the years left until coastAge,
		// not a spending multiple. Rejected (guard row below) when coastAge is not
		// after the current age — compounding backward is meaningless.
		const coastAge = v.num('coastAge');
		const coastYears = coastAge - age;
		const coastNest = coastYears > 0 ? targetFire / (1 + r) ** coastYears : null;
		const coastReached = coastNest !== null && cur >= coastNest;
		const coastGap = coastNest !== null && !coastReached ? coastNest - cur : 0;

		let balance = cur;
		let yearsToFire = -1;
		const tableRows: string[][] = [];

		for (let y = 1; y <= 50; y++) {
			balance = balance * (1 + r) + save;
			if (balance >= targetFire && yearsToFire === -1) {
				yearsToFire = y;
			}
			if (y <= 5 || y % 5 === 0 || y === yearsToFire) {
				tableRows.push([
					String(y),
					String(age + y),
					money(balance),
					// 超过两倍后百分比不再细分——真实净额由上一列给出，本格也不参与下方 yearsToFire 判断。
					// 上限 200%（目标的两倍）：100% = 恰好够 SWR，100–200% 段仍有意义（1.5 倍 ≈ 更稳、可提更高）。
					`${Math.min(200, Math.round((balance / targetFire) * 100))}%`,
				]);
			}
		}

		if (cur >= targetFire) {
			yearsToFire = 0;
		}

		const retAge = yearsToFire >= 0 ? age + yearsToFire : '> 80';
		const yearsText =
			yearsToFire === 0
				? 'Already reached!'
				: yearsToFire > 0
					? `${yearsToFire} years (retiring at ${retAge})`
					: '> 50 years';
		const yearsTextZh =
			yearsToFire === 0
				? '已经达成！'
				: yearsToFire > 0
					? `${yearsToFire} 年 (退休年龄 ${retAge} 岁)`
					: '超过 50 年';

		return {
			rows: [
				{ label: 'Target FIRE Nest Egg', labelZh: '标准 FIRE 财务自由目标资产', ...cash(targetFire), emphasis: true },
				{ label: 'Time to Financial Freedom', labelZh: '距离财务自由所需时间', value: yearsText, valueZh: yearsTextZh },
				{ label: 'Projected Retirement Age', labelZh: '预估可退休年龄', value: String(retAge) },
				{ label: 'Lean FIRE Goal (75% expenses)', labelZh: '极简 Lean FIRE 目标 (75% 支出)', ...cash(leanFire) },
				{ label: 'Fat FIRE Goal (125% expenses)', labelZh: '宽裕 Fat FIRE 目标 (125% 支出)', ...cash(fatFire) },
				{
					label: 'Coast FIRE Nest Egg (hold this to stop saving)',
					labelZh: 'Coast FIRE 本金门槛（持有至此即可停止追加投入）',
					...(coastNest === null
						? { value: '— (Coast age must be later than current age)', valueZh: '— (计划退休年龄需晚于当前年龄)' }
						: cash(coastNest)),
				},
				{
					label: 'Coast status',
					labelZh: '当前距 Coast 状态',
					...(coastNest === null
						? { value: '—', valueZh: '—' }
						: coastReached
							? { value: 'Reached — compounding alone is enough ✓', valueZh: '已达成——仅靠复利即可滚到目标 ✓' }
							: { value: `Short by ${money(coastGap)}`, valueZh: `还差 ${money(coastGap)}` }),
				},
				{ label: 'Annual Safe Withdrawal (at 4% SWR)', labelZh: '退休后每年安全提现额度', ...cash(targetFire * swr) },
			],
			table: {
				columns: ['Year', 'Age', 'Projected Net Worth ($)', 'FIRE Progress'],
				columnsZh: ['年限', '年龄', '预估生息净资产 (¥)', 'FIRE 进度'],
				rows: tableRows,
			},
			note: `Based on the ${v.str('swr')}% safe withdrawal rate, a portfolio of ${money(targetFire)} generates ${money(exp)}/year indefinitely without depleting your capital.`,
			noteZh: `基于 ${v.str('swr')}% 的安全提款率法则，当您的生息资产达到 ${money(targetFire)} 时，每年可安全提取 ${money(exp)} 用于生活开销，本金长久维持不衰竭。`,
		};
	},
};

// --- loan payment -----------------------------------------------------------------

const loanPayment: FormConfig = {
	intro: 'Calculate monthly loan payments, total interest and amortization schedule, or reverse-calculate maximum borrowing capacity from your monthly budget.',
	introZh: '测算贷款月供、总利息与还款计划表，也可由月供预算反推最高可贷金额。',
	fields: [
		{
			id: 'calcMode',
			label: 'Calculation mode',
			labelZh: '计算模式',
			type: 'select',
			def: 'to_payment',
			options: [
				{ value: 'to_payment', label: 'Forward: loan amount → monthly payment', labelZh: '正向：已知贷款本金，计算每月月供' },
				{ value: 'to_principal', label: 'Reverse: monthly budget → max loan', labelZh: '逆向：已知月供预算，反推最高借款额度' },
			],
		},
		{
			id: 'amount',
			label: 'Amount (Loan Principal or Monthly Budget)',
			labelZh: '输入金额 (贷款本金 或 每月月供预算)',
			suffix: '($)', suffixZh: '(¥)',
			type: 'number',
			def: '300000',
			step: 'any',
			min: '0',
			required: true,
			hint: 'Forward mode: enter loan principal. Reverse mode: enter target monthly repayment budget.',
			hintZh: '正向模式输入借款本金总额；逆向模式输入每月可承受的还款预算',
		},
		{ id: 'rate', label: 'Annual interest rate', labelZh: '贷款年化利率', suffix: '(%)', type: 'number', def: '3.8', step: 'any', min: '0', required: true },
		{ id: 'years', label: 'Term', labelZh: '还款期限', suffix: '(years)', suffixZh: '(年)', type: 'number', def: '30', step: 'any', min: '0.1', required: true },
	],
	compute: (v) => {
		const mode = v.str('calcMode') || 'to_payment';
		const inputVal = v.num('amount');
		const rate = v.num('rate');
		const years = v.num('years');
		const months = Math.round(years * 12);
		if (!(inputVal > 0) || !(months > 0)) {
			return { rows: [{ label: 'Result', labelZh: '计算结果', value: '— (amount and term must be > 0)', valueZh: '— (金额与期限需大于 0)' }] };
		}
		if (months > MAX_TERM_YEARS * 12) return overlongTerm();
		const i = rate / 100 / 12;
		let principal = 0;
		let pay = 0;

		if (mode === 'to_principal') {
			pay = inputVal;
			if (i <= 0) {
				principal = pay * months;
			} else {
				principal = (pay * (1 - (1 + i) ** -months)) / i;
			}
		} else {
			principal = inputVal;
			pay = monthlyPayment(principal, rate, months);
		}

		const { rows: tableRows, totalInterest } = amortize(principal, rate, months);
		const totalRepay = pay * months;

		if (mode === 'to_principal') {
			return {
				rows: [
					{ label: 'Max borrowing loan amount', labelZh: '最高可贷本金额度 (借款上限)', ...cash(principal), emphasis: true },
					{ label: 'Monthly payment budget', labelZh: '每月月供预算 (供款上限)', ...cash(pay) },
					{
						label: 'Number of payments',
						labelZh: '还款期数 (月数)',
						value: `${months} payments (~${years} yr)`,
						valueZh: `${months} 期 (约 ${years} 年)`,
					},
					{ label: 'Total repayment (Principal + Interest)', labelZh: '还款本息总计', ...cash(totalRepay) },
					{ label: 'Total interest paid', labelZh: '支付利息总额', ...cash(totalInterest) },
				],
				table: {
					columns: ['Year', 'Principal Paid ($)', 'Interest Paid ($)', 'Remaining Balance ($)'],
					columnsZh: ['年份', '已还本金 (¥)', '已付利息 (¥)', '剩余本金余额 (¥)'],
					rows: tableRows,
				},
				note: `Based on your monthly budget of ${money(pay)} over ${years} years at ${rate}%, the maximum loan you can afford is ${money(principal)}. Total interest paid will be ${money(totalInterest)}.`,
				noteZh: `在 ${years} 年期、年化利率 ${rate}% 条件下，按每月 ${money(pay)} 的月供预算，最高可申请贷款本金 ${money(principal)}，累计支付利息 ${money(totalInterest)}，还款本息总计 ${money(totalRepay)}。`,
			};
		}

		return {
			rows: [
				{ label: 'Monthly payment', labelZh: '每月还款额 (月供)', ...cash(pay), emphasis: true },
				{ label: 'Loan principal', labelZh: '贷款本金', ...cash(principal) },
				{
						label: 'Number of payments',
						labelZh: '还款期数 (月数)',
						value: `${months} payments (~${years} yr)`,
						valueZh: `${months} 期 (约 ${years} 年)`,
					},
				{ label: 'Total repayment (Principal + Interest)', labelZh: '还款本息总额', ...cash(totalRepay) },
				{ label: 'Total interest paid', labelZh: '支付利息总计', ...cash(totalInterest) },
			],
			table: {
				columns: ['Year', 'Principal Paid ($)', 'Interest Paid ($)', 'Remaining Balance ($)'],
				columnsZh: ['年份', '已还本金 (¥)', '已付利息 (¥)', '剩余本金余额 (¥)'],
				rows: tableRows,
			},
			note: `Financing ${money(principal)} at ${rate}% over ${years} years requires a monthly payment of ${money(pay)}. Total interest will be ${money(totalInterest)}.`,
			noteZh: `贷款本金 ${money(principal)}，按年利率 ${rate}% 分 ${years} 年（${months}期）等额本息偿还，每月月供为 ${money(pay)}，累计总利息支出为 ${money(totalInterest)}。`,
		};
	},
};

// --- mortgage -----------------------------------------------------------------------

/** Equal-principal amortization rows grouped by year: [year, principal, interest, balance]. */
function amortizeEqualPrincipal(
	principal: number,
	annualRatePct: number,
	months: number,
): { rows: string[][]; totalInterest: number; month1: number; decrease: number; finalMonth: number } {
	const i = annualRatePct / 100 / 12;
	const prcMo = months > 0 ? principal / months : 0;
	let balance = principal;
	let totalInterest = 0;
	const out: string[][] = [];

	const month1 = prcMo + principal * i;
	const decrease = prcMo * i;
	const finalMonth = prcMo + prcMo * i;

	for (let y = 1; y <= Math.ceil(months / 12); y++) {
		let principalY = 0;
		let interestY = 0;
		for (let m = 0; m < 12 && (y - 1) * 12 + m < months; m++) {
			const interest = balance * i;
			const princ = Math.min(prcMo, balance);
			balance -= princ;
			principalY += princ;
			interestY += interest;
			totalInterest += interest;
		}
		out.push([String(y), money(principalY), money(interestY), money(Math.max(balance, 0))]);
	}
	return { rows: out, totalInterest, month1, decrease, finalMonth };
}

function renderMortgageComparisonSvg(params: {
	months: number;
	years: number;
	totalLoan: number;
	pmtMonthly: number;
	prcMonth1: number;
	prcFinalMonth: number;
	crossoverMonth: number;
	interestSaved: number;
}): string {
	const { months, years, pmtMonthly, prcMonth1, prcFinalMonth, crossoverMonth, interestSaved } = params;

	const width = 820;
	const height = 390;
	const padLeft = 85;
	const padRight = 35;
	const padTop = 60;
	const padBottom = 55;

	const plotW = width - padLeft - padRight;
	const plotH = height - padTop - padBottom;
	const x0 = padLeft;
	const x1 = width - padRight;
	const y0 = padTop;
	const y1 = height - padBottom;

	// Calculate Y scale
	const vMinVal = Math.max(0, prcFinalMonth * 0.85);
	const vMaxVal = Math.max(prcMonth1 * 1.08, pmtMonthly * 1.15);
	const roughStep = (vMaxVal - vMinVal) / 5;
	let yStep = 500;
	if (roughStep > 1800) {
		// The ladder below used to stop at 2000, so a payment in the millions asked
		// the gridline loop for thousands of lines — each one two <text> nodes, one
		// per language. Above its top rung, climb by decades on a 1-2-2.5-5 scale
		// instead: the count stays near five for a loan of any size, and every step
		// the ladder did cover is left exactly as it was.
		const mag = 10 ** Math.floor(Math.log10(roughStep));
		yStep = [1, 2, 2.5, 5].map((m) => mag * m).find((v) => v >= roughStep) ?? mag * 10;
	} else if (roughStep > 900) yStep = 1000;
	else if (roughStep > 350) yStep = 500;
	else if (roughStep > 150) yStep = 200;
	else yStep = 100;

	const yStart = Math.max(0, Math.floor(vMinVal / yStep) * yStep);
	const yEnd = Math.ceil(vMaxVal / yStep) * yStep;
	const yRange = yEnd - yStart || 1;

	const getX = (m: number): number => x0 + ((Math.max(1, Math.min(months, m)) - 1) / (months - 1 || 1)) * plotW;
	const getY = (v: number): number => y1 - ((v - yStart) / yRange) * plotH;

	const yPmt = getY(pmtMonthly);
	const yPrc1 = getY(prcMonth1);
	const yPrcN = getY(prcFinalMonth);

	const hasCrossover = crossoverMonth > 0 && crossoverMonth < months;
	const xCross = hasCrossover ? getX(crossoverMonth) : x0 + plotW * 0.35;
	const yCross = yPmt;

	// An SVG <text> cannot hold the .i18n-en / .i18n-zh span pair the rest of the
	// site uses, so every label below is emitted twice at the same coordinates and
	// the global toggle rules in global.css hide the wrong one — the chart then
	// follows the language switch with no script of its own. The currency symbol
	// differs for the same reason the form is labelled ($) / (¥).
	const t = (attrs: string, en: string, zh: string): string =>
		`<text class="i18n-en" ${attrs}>${en}</text><text class="i18n-zh" ${attrs}>${zh}</text>`;

	// Rough advance width of a label. getBBox() would be exact but needs a live
	// document, and this runs at build time — an estimate with slack is enough to
	// keep the legend entries apart. A CJK glyph is one em in every face the site
	// ships; Latin averages about half.
	const textW = (s: string, size: number): number => {
		let em = 0;
		for (const ch of s.replace(/&amp;/g, '&')) {
			if (/[\u2e80-\u9fff\uff00-\uffef]/.test(ch)) em += 1;
			else if (/[ .,'|!:;()]/.test(ch)) em += 0.32;
			else if (/[A-Z0-9$&]/.test(ch)) em += 0.62;
			else em += 0.52;
		}
		return em * size;
	};

	// Badge geometry is needed twice — for the badge itself and to keep the
	// early-phase annotation out from under it — so it is measured up here.
	const badgeW = 230;
	const badgeH = 38;
	const badgeX = Math.min(Math.max(xCross - badgeW / 2, x0 + 10), x1 - badgeW - 10);
	const badgeY = Math.max(y0 + 5, yCross - badgeH - 12);

	// Y-axis gridlines & labels
	let yGridSvg = '';
	for (let v = yStart; v <= yEnd; v += yStep) {
		const y = getY(v);
		yGridSvg += `<line x1="${x0}" y1="${y.toFixed(1)}" x2="${x1}" y2="${y.toFixed(1)}" stroke="rgba(148, 163, 184, 0.15)" stroke-dasharray="3 3"/>`;
		yGridSvg += t(`x="${x0 - 10}" y="${(y + 4).toFixed(1)}" font-size="11" font-family="system-ui, sans-serif" fill="#94a3b8" text-anchor="end"`, `$${formatNumber(v)}`, `¥${formatNumber(v)}`);
	}

	// X-axis gridlines & labels
	let xGridSvg = '';
	const yearStep = years <= 10 ? (years <= 5 ? 1 : 2) : 5;
	for (let y = 0; y <= years; y += yearStep) {
		const m = Math.max(1, y * 12);
		const x = getX(m);
		xGridSvg += `<line x1="${x.toFixed(1)}" y1="${y0}" x2="${x.toFixed(1)}" y2="${y1}" stroke="rgba(148, 163, 184, 0.15)" stroke-dasharray="3 3"/>`;
		xGridSvg += t(`x="${x.toFixed(1)}" y="${y1 + 18}" font-size="11" font-family="system-ui, sans-serif" fill="#94a3b8" text-anchor="middle"`, `${y}y`, `${y}年`);
		xGridSvg += t(`x="${x.toFixed(1)}" y="${y1 + 32}" font-size="9.5" font-family="system-ui, sans-serif" fill="#64748b" text-anchor="middle"`, `(${y * 12} mo)`, `(${y * 12}期)`);
	}

	// Shaded areas
	let areaSvg = '';
	if (hasCrossover) {
		// Phase 1: Equal Principal higher than Equal P&I
		areaSvg += `<polygon points="${x0.toFixed(1)},${yPmt.toFixed(1)} ${x0.toFixed(1)},${yPrc1.toFixed(1)} ${xCross.toFixed(1)},${yCross.toFixed(1)}" fill="rgba(249, 115, 22, 0.12)"/>`;
		// Phase 2: Equal Principal lower than Equal P&I (savings area)
		areaSvg += `<polygon points="${xCross.toFixed(1)},${yCross.toFixed(1)} ${x1.toFixed(1)},${yPrcN.toFixed(1)} ${x1.toFixed(1)},${yPmt.toFixed(1)}" fill="rgba(16, 185, 129, 0.15)"/>`;

		// Anchored to the left edge of the wedge it labels, not centred in it: the
		// badge below is centred on the crossover and its box reached back far
		// enough to sit on top of a centred label (it did at the default values).
		// Dropped entirely when the badge leaves no room, since the two overlap
		// vertically whenever the gap between the lines exceeds 22px.
		const gap1En = `Higher early on (+$${money(prcMonth1 - pmtMonthly)})`;
		const gap1Zh = `前期月供较高 (+¥${money(prcMonth1 - pmtMonthly)})`;
		const text1Y = Math.min(yPrc1, yPmt) + Math.abs(yPrc1 - yPmt) * 0.45;
		if (Math.max(textW(gap1En, 11), textW(gap1Zh, 11)) < badgeX - 16 - x0)
			areaSvg += t(`x="${(x0 + 8).toFixed(1)}" y="${text1Y.toFixed(1)}" font-size="11" font-weight="600" fill="#ea580c"`, gap1En, gap1Zh);

		// Centred in the savings wedge, but pulled back inside the plot: a late
		// crossover puts its midpoint within half a label of the right edge.
		const gap2En = `Cheaper later (saves up to $${money(pmtMonthly - prcFinalMonth)}/mo)`;
		const gap2Zh = `后期持续省钱 (最多省 ¥${money(pmtMonthly - prcFinalMonth)}/月)`;
		const half2 = Math.max(textW(gap2En, 11), textW(gap2Zh, 11)) / 2;
		const text2X = Math.min((xCross + x1) / 2, x1 - half2 - 4);
		const text2Y = yPmt + Math.abs(yPrcN - yPmt) * 0.45;
		areaSvg += t(`x="${text2X.toFixed(1)}" y="${text2Y.toFixed(1)}" font-size="11" font-weight="600" fill="#059669" text-anchor="middle"`, gap2En, gap2Zh);
	}

	// Crossover lines & badge
	let crossoverSvg = '';
	if (hasCrossover) {
		crossoverSvg += `<line x1="${xCross.toFixed(1)}" y1="${y0}" x2="${xCross.toFixed(1)}" y2="${y1}" stroke="#ef4444" stroke-width="1.5" stroke-dasharray="4 4"/>`;
		crossoverSvg += `<line x1="${x0}" y1="${yCross.toFixed(1)}" x2="${xCross.toFixed(1)}" y2="${yCross.toFixed(1)}" stroke="#ef4444" stroke-width="1.5" stroke-dasharray="4 4"/>`;
		crossoverSvg += `<circle cx="${xCross.toFixed(1)}" cy="${yCross.toFixed(1)}" r="8" fill="rgba(239, 68, 68, 0.25)" stroke="#ef4444" stroke-width="2"/>`;
		crossoverSvg += `<circle cx="${xCross.toFixed(1)}" cy="${yCross.toFixed(1)}" r="4" fill="#ef4444"/>`;

		crossoverSvg += `<g transform="translate(${badgeX.toFixed(1)}, ${badgeY.toFixed(1)})">
			<rect width="${badgeW}" height="${badgeH}" rx="6" fill="rgba(15, 23, 42, 0.92)" stroke="#ef4444" stroke-width="1.5"/>
			${t(`x="${badgeW / 2}" y="15" font-size="10.5" font-weight="bold" fill="#f87171" text-anchor="middle" font-family="system-ui, sans-serif"`, `★ Break-even: month ${crossoverMonth} (~${(crossoverMonth / 12).toFixed(1)} yr)`, `★ 成本平衡点: 第 ${crossoverMonth} 个月 (~${(crossoverMonth / 12).toFixed(1)}年)`)}
			${t(`x="${badgeW / 2}" y="29" font-size="9.5" fill="#e2e8f0" text-anchor="middle" font-family="system-ui, sans-serif"`, `Break-even payment: $${money(pmtMonthly)}/mo`, `平衡月供线: ¥${money(pmtMonthly)} / 月 (此后等额本金更省)`)}
		</g>`;
	}

	// One legend row per language rather than a row of paired <text> at shared
	// coordinates: the entries are laid out left to right from their measured
	// widths, and the two languages do not come out the same width. Trailing
	// entries are dropped rather than allowed to run off the right edge.
	//
	// Every element carries the class itself instead of riding inside one
	// <g class="i18n-*">. A group would be tidier and does paint correctly —
	// display:none on an SVG container hides its children — but Chromium's
	// checkVisibility() reports true for a <text> under such a group, and that is
	// exactly what e2e/i18n.spec.ts's sweeps use to decide what a reader can see.
	// Tagging the leaves keeps the guard able to see a real leak.
	type Entry = { color: string; label: string; dot?: boolean };
	const legendRow = (cls: 'i18n-en' | 'i18n-zh', all: Entry[]): string => {
		const span = (list: Entry[]): number =>
			list.reduce((n, e) => n + (e.dot ? 15 : 24) + textW(e.label, 11) + 20, -20);
		let entries = all;
		while (entries.length > 2 && span(entries) > plotW) entries = entries.slice(0, -1);
		let x = 0;
		let out = '';
		for (const e of entries) {
			if (e.dot) {
				out += `<circle class="${cls}" cx="${(x + 4.5).toFixed(1)}" cy="-3" r="4.5" fill="${e.color}"/>`;
				x += 15;
			} else {
				out += `<line class="${cls}" x1="${x.toFixed(1)}" y1="-3" x2="${(x + 18).toFixed(1)}" y2="-3" stroke="${e.color}" stroke-width="3"/>`;
				x += 24;
			}
			const fill = e.dot ? e.color : '#94a3b8';
			out += `<text class="${cls}" x="${x.toFixed(1)}" y="0" fill="${fill}"${e.dot ? ' font-weight="600"' : ''}>${e.label}</text>`;
			x += textW(e.label, 11) + 20;
		}
		return out;
	};

	// The interest-saved pill moved up onto the title row and is right-aligned to
	// the plot edge. It used to be a fixed 115px box at x=650 with the amount
	// centred in it, which ran past the right edge of the viewBox as soon as the
	// saving reached five digits — it did at the default values, in both languages.
	const pill = (cls: 'i18n-en' | 'i18n-zh', label: string): string => {
		const w = textW(label, 11) + 18;
		return `<rect class="${cls}" x="${(x1 - w).toFixed(1)}" y="14" width="${w.toFixed(1)}" height="18" rx="4" fill="rgba(16, 185, 129, 0.15)"/><text class="${cls}" x="${x1 - 9}" y="27" font-size="11" font-family="system-ui, sans-serif" fill="#10b981" font-weight="600" text-anchor="end">${label}</text>`;
	};

	const crossYear = (crossoverMonth / 12).toFixed(1);
	const legendEn: Entry[] = [
		{ color: '#3b82f6', label: `Equal P&amp;I (fixed $${money(pmtMonthly)}/mo)` },
		{ color: '#f97316', label: `Equal Principal ($${money(prcMonth1)} ➔ $${money(prcFinalMonth)})` },
	];
	const legendZh: Entry[] = [
		{ color: '#3b82f6', label: `等额本息 (每月固定 ¥${money(pmtMonthly)})` },
		{ color: '#f97316', label: `等额本金 (首月 ¥${money(prcMonth1)} ➔ 末月 ¥${money(prcFinalMonth)})` },
	];
	if (hasCrossover) {
		legendEn.push({ color: '#ef4444', label: `Break-even (yr ${crossYear})`, dot: true });
		legendZh.push({ color: '#ef4444', label: `平衡点 (第${crossYear}年反超)`, dot: true });
	}

	return `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;user-select:none;">
		<!-- Title -->
		${t(`x="${x0}" y="26" font-size="13.5" font-weight="bold" fill="var(--fg, #e2e8f0)" font-family="system-ui, sans-serif"`, 'Payment trajectory &amp; break-even crossover', '房贷月供走势曲线与成本平衡点')}

		${pill('i18n-en', `★ Saves $${money(interestSaved)}`)}
		${pill('i18n-zh', `★ 省息 ¥${money(interestSaved)}`)}

		<!-- Legends -->
		<g transform="translate(${x0}, 42)" font-size="11" font-family="system-ui, sans-serif">
			${legendRow('i18n-en', legendEn)}
			${legendRow('i18n-zh', legendZh)}
		</g>

		<!-- Gridlines -->
		${yGridSvg}
		${xGridSvg}

		<!-- Shaded Cost Areas -->
		${areaSvg}

		<!-- Lines: Equal P&I (Horizontal) and Equal Principal (Sloping) -->
		<line x1="${x0.toFixed(1)}" y1="${yPmt.toFixed(1)}" x2="${x1.toFixed(1)}" y2="${yPmt.toFixed(1)}" stroke="#3b82f6" stroke-width="3" stroke-linecap="round"/>
		<line x1="${x0.toFixed(1)}" y1="${yPrc1.toFixed(1)}" x2="${x1.toFixed(1)}" y2="${yPrcN.toFixed(1)}" stroke="#f97316" stroke-width="3" stroke-linecap="round"/>

		<!-- Crossover Marker and Tooltip -->
		${crossoverSvg}

		<!-- Axis Borders -->
		<line x1="${x0}" y1="${y1}" x2="${x1}" y2="${y1}" stroke="rgba(148, 163, 184, 0.4)" stroke-width="1.5"/>
		<line x1="${x0}" y1="${y0}" x2="${x0}" y2="${y1}" stroke="rgba(148, 163, 184, 0.4)" stroke-width="1.5"/>
	</svg>`;
}

const mortgage: FormConfig = {
	intro: 'Compare level-payment (equal principal & interest) against equal-principal repayment: monthly payment, interest saved, and commercial, provident fund or combined mortgages.',
	introZh: '对比等额本息与等额本金：月供、节省利息，并支持商业贷款、公积金贷款与组合贷款。',
	fields: [
		{
			id: 'method',
			label: 'Repayment method',
			labelZh: '还款方式',
			type: 'select',
			def: 'compare',
			options: [
				{ value: 'compare', label: 'Compare both schemes', labelZh: '双方案对比 (等额本息 vs 等额本金 PK对比)' },
				{ value: 'equal_pmt', label: 'Equal principal & interest (level payment)', labelZh: '等额本息 (每月月供固定，前期压力小)' },
				{ value: 'equal_prc', label: 'Equal principal (declining payment, less interest)', labelZh: '等额本金 (每月递减，总利息更省)' },
			],
		},
		{
			id: 'loanType',
			label: 'Loan type',
			labelZh: '贷款类型',
			type: 'select',
			def: 'commercial',
			options: [
				{ value: 'commercial', label: 'Commercial loan', labelZh: '商业贷款' },
				{ value: 'fund', label: 'Housing provident fund loan', labelZh: '纯公积金贷款' },
				{ value: 'combined', label: 'Combined loan (provident fund + commercial)', labelZh: '组合贷款 (公积金 + 商业贷款)' },
			],
		},
		{
			id: 'calcBasis',
			label: 'Calculation input mode',
			labelZh: '计算方式',
			type: 'select',
			def: 'by_amount',
			options: [
				{ value: 'by_amount', label: 'By loan amount', labelZh: '按贷款额度计算 (直接输入贷款金额)' },
				{ value: 'by_price', label: 'By home price & down payment', labelZh: '按房产总价计算 (输入总价与首付比例)' },
			],
		},
		{
			id: 'price',
			label: 'Home purchase price',
			labelZh: '房屋总价',
			suffix: '($)', suffixZh: '(¥)',
			type: 'number',
			def: '2000000',
			step: 'any',
			min: '0',
			showIf: (v) => v.str('calcBasis') === 'by_price',
			required: (v) => v.str('calcBasis') === 'by_price',
			hint: 'Used when calculating by house price & down payment ratio',
			hintZh: '按房屋总价与首付计算时生效',
		},
		{
			id: 'downPct',
			label: 'Down payment percentage',
			labelZh: '首付比例 (%)',
			suffix: '(%)',
			type: 'number',
			def: '20',
			step: 'any',
			min: '0',
			max: '100',
			showIf: (v) => v.str('calcBasis') === 'by_price',
			required: (v) => v.str('calcBasis') === 'by_price',
			hint: 'e.g. 20% or 30% down',
			hintZh: '如 20% 代表2成首付，30% 代表3成首付',
		},
		{
			id: 'loanAmount',
			label: 'Loan principal / Commercial loan',
			labelZh: '贷款本金 / 商业贷款额度',
			suffix: '($)', suffixZh: '(¥)',
			type: 'number',
			def: '1000000',
			step: 'any',
			min: '0',
			showIf: (v) => (v.str('calcBasis') || 'by_amount') === 'by_amount',
			required: (v) => (v.str('calcBasis') || 'by_amount') === 'by_amount',
			hint: 'Single loan: total loan amount. Combined loan: commercial loan portion.',
			hintZh: '单一贷款时为贷款本金；组合贷款时为商业贷款金额',
		},
		{
			id: 'fundAmount',
			label: 'Provident fund loan amount',
			labelZh: '公积金贷款额度',
			suffix: '($)', suffixZh: '(¥)',
			type: 'number',
			def: '500000',
			step: 'any',
			min: '0',
			showIf: (v) => v.str('loanType') === 'combined',
			required: (v) => v.str('loanType') === 'combined',
			hint: 'Only used when "Combined Loan" is selected',
			hintZh: '仅在选择【组合贷款】时生效',
		},
		{
			id: 'rate',
			label: 'Commercial loan rate (%)',
			labelZh: '商业贷款年利率 (%)',
			suffix: '(%)',
			type: 'number',
			def: '3.45',
			step: 'any',
			min: '0',
			showIf: (v) => (v.str('loanType') || 'commercial') !== 'fund',
			required: (v) => (v.str('loanType') || 'commercial') !== 'fund',
			hint: 'China mortgage rate typically 3.15%~3.45%',
			hintZh: '当前国内商业房贷主流利率在 3.15%~3.45% 左右',
		},
		{
			id: 'fundRate',
			label: 'Provident fund loan rate (%)',
			labelZh: '公积金贷款年利率 (%)',
			suffix: '(%)',
			type: 'number',
			def: '2.85',
			step: 'any',
			min: '0',
			showIf: (v) => v.str('loanType') !== 'commercial',
			required: (v) => v.str('loanType') !== 'commercial',
			hint: 'China 5+ year first-home provident rate is currently 2.85%',
			hintZh: '当前国内首套5年以上公积金基准年利率为 2.85%',
		},
		{
			id: 'years',
			label: 'Loan term',
			labelZh: '按揭贷款期限',
			suffix: '(years)', suffixZh: '(年)',
			type: 'number',
			def: '30',
			step: '1',
			min: '1',
			max: '35',
			required: true,
		},
		{
			id: 'extras',
			label: 'Optional monthly escrow / fees',
			labelZh: '可选每月杂费 (物业/税费/保险)',
			suffix: '($)', suffixZh: '(¥)',
			type: 'number',
			def: '0',
			step: 'any',
			min: '0',
			hint: 'Optional monthly tax, insurance or HOA (default 0)',
			hintZh: '国内通常填0；海外房贷可填入每月税费或物业管理费',
		},
	],
	compute: (v) => {
		const method = v.str('method') || 'compare';
		const loanType = v.str('loanType') || 'commercial';
		const calcBasis = v.str('calcBasis') || 'by_amount';

		let commPortion = 0;
		let gjjPortion = 0;
		let totalLoan = 0;
		let price = 0;
		let downPayment = 0;
		let downPct = 0;

		if (calcBasis === 'by_price') {
			price = Math.max(0, v.num('price') || 0);
			downPct = Math.max(0, Math.min(100, v.num('downPct') || 0));
			downPayment = price * (downPct / 100);
			totalLoan = Math.max(0, price - downPayment);
			if (loanType === 'combined') {
				gjjPortion = Math.min(totalLoan, Math.max(0, v.num('fundAmount') || 0));
				commPortion = Math.max(0, totalLoan - gjjPortion);
			} else if (loanType === 'fund') {
				gjjPortion = totalLoan;
				commPortion = 0;
			} else {
				commPortion = totalLoan;
				gjjPortion = 0;
			}
		} else {
			if (loanType === 'combined') {
				commPortion = Math.max(0, v.num('loanAmount') || 0);
				gjjPortion = Math.max(0, v.num('fundAmount') || 0);
				totalLoan = commPortion + gjjPortion;
			} else if (loanType === 'fund') {
				gjjPortion = Math.max(0, v.num('loanAmount') || 0);
				commPortion = 0;
				totalLoan = gjjPortion;
			} else {
				commPortion = Math.max(0, v.num('loanAmount') || 0);
				gjjPortion = 0;
				totalLoan = commPortion;
			}
		}

		const years = Math.max(1, v.num('years') || 30);
		const months = Math.round(years * 12);
		const commRate = Math.max(0, v.num('rate') || 0);
		const fundRate = Math.max(0, v.num('fundRate') || 0);
		const extras = Math.max(0, v.num('extras') || 0);

		if (!(totalLoan > 0) || !(months > 0)) {
			return { rows: [{ label: 'Result', labelZh: '计算结果', value: '— (loan amount and term must be > 0)', valueZh: '— (贷款金额与期限需大于 0)' }] };
		}
		if (months > MAX_TERM_YEARS * 12) return overlongTerm();

		// --- Equal Principal & Interest (等额本息) ---
		const commPmt = monthlyPayment(commPortion, commRate, months);
		const gjjPmt = monthlyPayment(gjjPortion, fundRate, months);
		const totalMonthlyPmt = commPmt + gjjPmt;
		const totalRepayPmt = totalMonthlyPmt * months;
		const totalIntPmt = Math.max(0, totalRepayPmt - totalLoan);

		const commAmortPmt = amortize(commPortion, commRate, months);
		const gjjAmortPmt = amortize(gjjPortion, fundRate, months);
		const pmtTableRows: string[][] = [];
		for (let y = 0; y < Math.ceil(months / 12); y++) {
			const cRow = commAmortPmt.rows[y] ?? ['0', '0', '0', '0'];
			const gRow = gjjAmortPmt.rows[y] ?? ['0', '0', '0', '0'];
			const prY = (Number(cRow[1].replace(/,/g, '')) || 0) + (Number(gRow[1].replace(/,/g, '')) || 0);
			const inY = (Number(cRow[2].replace(/,/g, '')) || 0) + (Number(gRow[2].replace(/,/g, '')) || 0);
			const balY = (Number(cRow[3].replace(/,/g, '')) || 0) + (Number(gRow[3].replace(/,/g, '')) || 0);
			pmtTableRows.push([String(y + 1), money(prY), money(inY), money(Math.max(balY, 0))]);
		}

		// --- Equal Principal (等额本金) ---
		const commAmortPrc = amortizeEqualPrincipal(commPortion, commRate, months);
		const gjjAmortPrc = amortizeEqualPrincipal(gjjPortion, fundRate, months);
		const prcMonth1 = commAmortPrc.month1 + gjjAmortPrc.month1;
		const prcDecrease = commAmortPrc.decrease + gjjAmortPrc.decrease;
		const prcFinalMonth = commAmortPrc.finalMonth + gjjAmortPrc.finalMonth;
		const totalIntPrc = commAmortPrc.totalInterest + gjjAmortPrc.totalInterest;
		const totalRepayPrc = totalLoan + totalIntPrc;

		const prcTableRows: string[][] = [];
		for (let y = 0; y < Math.ceil(months / 12); y++) {
			const cRow = commAmortPrc.rows[y] ?? ['0', '0', '0', '0'];
			const gRow = gjjAmortPrc.rows[y] ?? ['0', '0', '0', '0'];
			const prY = (Number(cRow[1].replace(/,/g, '')) || 0) + (Number(gRow[1].replace(/,/g, '')) || 0);
			const inY = (Number(cRow[2].replace(/,/g, '')) || 0) + (Number(gRow[2].replace(/,/g, '')) || 0);
			const balY = (Number(cRow[3].replace(/,/g, '')) || 0) + (Number(gRow[3].replace(/,/g, '')) || 0);
			prcTableRows.push([String(y + 1), money(prY), money(inY), money(Math.max(balY, 0))]);
		}

		// Comparison metrics
		const interestSaved = Math.max(0, totalIntPmt - totalIntPrc);
		const interestSavedPct = totalIntPmt > 0 ? (interestSaved / totalIntPmt) * 100 : 0;
		const m1Diff = prcMonth1 - totalMonthlyPmt;
		let crossoverMonth = 0;
		if (prcDecrease > 0 && m1Diff > 0) {
			crossoverMonth = Math.ceil(m1Diff / prcDecrease) + 1;
		}

		if (method === 'compare') {
			const rows: FormResultRow[] = [
				{
					label: 'Interest saved with Equal Principal',
					labelZh: '等额本金比等额本息省息',
					value: `$${money(interestSaved)} (${percent(interestSavedPct)}% less interest)`,
					valueZh: `¥${money(interestSaved)} (利息节省 ${percent(interestSavedPct)}%)`,
					emphasis: true,
				},
				{
					label: 'Equal P&I monthly payment',
					labelZh: '【等额本息】每月固定月供',
					value: `$${money(totalMonthlyPmt + extras)} / month`,
					valueZh: `¥${money(totalMonthlyPmt + extras)} / 月`,
				},
				{
					label: 'Equal P&I total interest',
					labelZh: '【等额本息】累计利息总额',
					...cash(totalIntPmt),
				},
				{
					label: 'Equal P&I total repayment',
					labelZh: '【等额本息】还款本息总计',
					...cash(totalRepayPmt + extras * months),
				},
				{
					label: 'Equal Principal Month 1 payment',
					labelZh: '【等额本金】首月还款额 (最高)',
					value: `$${money(prcMonth1 + extras)} (-$${money(prcDecrease)} each month)`,
					valueZh: `¥${money(prcMonth1 + extras)} (每月递减 -¥${money(prcDecrease)})`,
				},
				{
					label: 'Equal Principal final month payment',
					labelZh: '【等额本金】末月还款额 (最低)',
					...cash(prcFinalMonth + extras),
				},
				{
					label: 'Equal Principal total interest',
					labelZh: '【等额本金】累计利息总额',
					...cash(totalIntPrc),
				},
				{
					label: 'Equal Principal total repayment',
					labelZh: '【等额本金】还款本息总计',
					...cash(totalRepayPrc + extras * months),
				},
				{
					label: 'Total loan principal',
					labelZh: '贷款本金总额',
					value: `$${money(totalLoan)}${loanType === 'combined' ? ` (commercial $${money(commPortion)} + provident fund $${money(gjjPortion)})` : ''}`,
					valueZh: `¥${money(totalLoan)}${loanType === 'combined' ? ` (商贷 ¥${money(commPortion)} + 公积金 ¥${money(gjjPortion)})` : ''}`,
				},
			];

			if (calcBasis === 'by_price') {
				rows.push(
					{ label: 'Home purchase price', labelZh: '房屋购房总价', ...cash(price) },
					{
						label: 'Down payment amount',
						labelZh: '购房首付款',
						value: `$${money(downPayment)} (${downPct}%)`,
						valueZh: `¥${money(downPayment)} (${downPct}%)`,
					},
				);
			}

			const crossYears = (crossoverMonth / 12).toFixed(1);
			const compareTable: FormTable = {
				columns: ['Metric', 'Equal P&I', 'Equal Principal', 'Difference & analysis'],
				columnsZh: ['比较维度', '等额本息 (每月固定)', '等额本金 (每月递减)', '两方案差异 / 评估'],
				rows: [
					['Month 1 payment', money(totalMonthlyPmt + extras), money(prcMonth1 + extras), m1Diff > 0 ? `Equal Principal pays $${money(m1Diff)} more up front` : 'identical'],
					['Final month payment', money(totalMonthlyPmt + extras), money(prcFinalMonth + extras), `Equal Principal pays $${money(totalMonthlyPmt - prcFinalMonth)} less at the end`],
					['Payment trajectory', 'flat for the whole term', `falls $${money(prcDecrease)} every month`, 'Equal Principal retires principal faster'],
					['Crossover month', 'baseline', crossoverMonth > 0 ? `cheaper from month ${crossoverMonth} (~${crossYears} yr)` : 'cheaper throughout', 'past that point Equal Principal always costs less per month'],
					['Total interest', money(totalIntPmt), money(totalIntPrc), `★ Equal Principal saves $${money(interestSaved)} (-${percent(interestSavedPct)}%)`],
					['Total repaid', money(totalRepayPmt + extras * months), money(totalRepayPrc + extras * months), `Equal Principal pays $${money(interestSaved)} less overall`],
					['Early-term strain', 'lower — a constant bill is easy to plan around', 'higher — the first payments are the largest', crossoverMonth > 0 ? `Equal P&I is clearly lighter for the first ${crossYears} years` : 'Equal Principal is lower from the start'],
					['Who it suits', 'buyers who are cash-tight now and expect rising income', 'buyers with spare cash flow who mind the interest', 'decide on your own cash flow and cost of capital'],
				],
				rowsZh: [
					['首月还款额', money(totalMonthlyPmt + extras), money(prcMonth1 + extras), m1Diff > 0 ? `等额本金首月多还 ¥${money(m1Diff)}` : '两方案相同'],
					['末月还款额', money(totalMonthlyPmt + extras), money(prcFinalMonth + extras), `等额本金末月少还 ¥${money(totalMonthlyPmt - prcFinalMonth)}`],
					['每月月供变动', '每月保持不变 (恒定月供)', `每月固定递减 -¥${money(prcDecrease)}`, '等额本金逐月减负，归还本金更快'],
					['月供打平月份', '基准线', crossoverMonth > 0 ? `第 ${crossoverMonth} 个月起更低 (~${crossYears} 年)` : '始终更低', '此后等额本金月供将一直低于等额本息'],
					['支付利息总额', money(totalIntPmt), money(totalIntPrc), `★ 等额本金累计省息 ¥${money(interestSaved)} (-${percent(interestSavedPct)}%)`],
					['还款本息总计', money(totalRepayPmt + extras * months), money(totalRepayPrc + extras * months), `等额本金少支出 ¥${money(interestSaved)}`],
					['前期月供压力', '较小，月供恒定便于家庭规划', '较大 (前期月供处于最高位)', crossoverMonth > 0 ? `前 ${crossYears} 年等额本息压力明显更轻` : '等额本金月供始终更低，无前期压力差'],
					['适合人群画像', '适合刚需刚落户、前期资金紧、收入递增者', '适合前期收入高、资金充裕、利息敏感者', '依自身当下现金流与资金成本科学决策'],
				],
			};

			const noteZh = `【房贷双方案PK核心结论】：贷款 ${money(totalLoan)} 元（${years} 年期 / ${months} 期），选择【等额本金】相比【等额本息】全周期可累计省息 ¥${money(interestSaved)} 元（利息直降 ${percent(interestSavedPct)}%）！\n\n` +
				`• 【等额本息】：每月固定还款 ¥${money(totalMonthlyPmt + extras)} 元，累计利息 ¥${money(totalIntPmt)} 元。适合刚步入职场、前期资金较紧张、月收入较稳定或预期未来收入持续增长的购房者。\n\n` +
				`• 【等额本金】：首月还款 ¥${money(prcMonth1 + extras)} 元，随后每月固定减少 ¥${money(prcDecrease)} 元，在第 ${crossoverMonth} 个月（约 ${(crossoverMonth / 12).toFixed(1)} 年）后月供开始低于等额本息，末月降至 ¥${money(prcFinalMonth + extras)} 元。适合当前收入充裕、手头流动资金宽裕、希望尽可能节省利息支出的购房者。`;

			const noteEn = `[Mortgage Repayment Comparison]: For a ${money(totalLoan)} loan over ${years} years, choosing Equal Principal saves ${money(interestSaved)} in total interest (-${percent(interestSavedPct)}%) compared to Equal P&I!\n\n` +
				`• Equal P&I: Fixed monthly payment of ${money(totalMonthlyPmt + extras)}, total interest of ${money(totalIntPmt)}. Ideal for buyers wanting predictable monthly cash flows.\n\n` +
				`• Equal Principal: Month 1 payment is ${money(prcMonth1 + extras)}, decreasing by ${money(prcDecrease)} each month. It crosses below Equal P&I at month ${crossoverMonth} (~${(crossoverMonth / 12).toFixed(1)} years), ending at ${money(prcFinalMonth + extras)}. Saves significant interest if you can afford higher initial payments.`;

			const chartSvg = renderMortgageComparisonSvg({
				months,
				years,
				totalLoan,
				pmtMonthly: totalMonthlyPmt + extras,
				prcMonth1: prcMonth1 + extras,
				prcFinalMonth: prcFinalMonth + extras,
				crossoverMonth,
				interestSaved,
			});

			return {
				rows,
				table: compareTable,
				chartSvg,
				note: noteEn,
				noteZh,
			};
		}

		if (method === 'equal_pmt') {
			const rows: FormResultRow[] = [
				{ label: 'Monthly payment (Fixed)', labelZh: '每月月供 (固定等额)', ...cash(totalMonthlyPmt + extras), emphasis: true },
				{ label: 'Total interest paid', labelZh: '支付利息总额', ...cash(totalIntPmt) },
				{ label: 'Total repayment (Principal + Interest)', labelZh: '还款本息总计', ...cash(totalRepayPmt + extras * months) },
				{ label: 'Loan principal', labelZh: '贷款本金总额', ...cash(totalLoan) },
				{
				label: 'Number of payments',
				labelZh: '还款期数',
				value: `${months} payments (${years} yr)`,
				valueZh: `${months} 期 (${years} 年)`,
			},
			];
			if (calcBasis === 'by_price') {
				rows.push(
					{ label: 'Home price', labelZh: '房屋总价', ...cash(price) },
					{
						label: 'Down payment',
						labelZh: '首付款',
						value: `$${money(downPayment)} (${downPct}%)`,
						valueZh: `¥${money(downPayment)} (${downPct}%)`,
					},
				);
			}
			return {
				rows,
				table: {
					columns: ['Year', 'Principal Paid ($)', 'Interest Paid ($)', 'Remaining Balance ($)'],
					columnsZh: ['年份', '已还本金 (¥)', '已付利息 (¥)', '剩余本金余额 (¥)'],
					rows: pmtTableRows,
				},
				note: `Financing ${money(totalLoan)} under Equal P&I over ${years} years costs ${money(totalMonthlyPmt + extras)}/month with ${money(totalIntPmt)} in total interest.`,
				noteZh: `贷款 ${money(totalLoan)} 元按等额本息还款，${years} 年期（${months}期）每月固定还款 ${money(totalMonthlyPmt + extras)} 元，全周期累计支付利息 ${money(totalIntPmt)} 元，还款总额 ${money(totalRepayPmt + extras * months)} 元。`,
			};
		}

		// method === 'equal_prc'
		const rows: FormResultRow[] = [
			{ label: 'First month payment (Peak)', labelZh: '首月还款额 (最高月供)', ...cash(prcMonth1 + extras), emphasis: true },
			{
				label: 'Monthly decrease',
				labelZh: '每月递减金额',
				value: `-$${money(prcDecrease)} / month`,
				valueZh: `-¥${money(prcDecrease)} / 月`,
			},
			{ label: 'Final month payment', labelZh: '末月还款额 (最低月供)', ...cash(prcFinalMonth + extras) },
			{ label: 'Total interest paid', labelZh: '支付利息总额', ...cash(totalIntPrc) },
			{ label: 'Total repayment (Principal + Interest)', labelZh: '还款本息总计', ...cash(totalRepayPrc + extras * months) },
			{ label: 'Loan principal', labelZh: '贷款本金总额', ...cash(totalLoan) },
			{
				label: 'Number of payments',
				labelZh: '还款期数',
				value: `${months} payments (${years} yr)`,
				valueZh: `${months} 期 (${years} 年)`,
			},
		];
		if (calcBasis === 'by_price') {
			rows.push(
				{ label: 'Home price', labelZh: '房屋总价', ...cash(price) },
				{
						label: 'Down payment',
						labelZh: '首付款',
						value: `$${money(downPayment)} (${downPct}%)`,
						valueZh: `¥${money(downPayment)} (${downPct}%)`,
					},
			);
		}
		return {
			rows,
			table: {
				columns: ['Year', 'Principal Paid ($)', 'Interest Paid ($)', 'Remaining Balance ($)'],
				columnsZh: ['年份', '已还本金 (¥)', '已付利息 (¥)', '剩余本金余额 (¥)'],
				rows: prcTableRows,
			},
			note: `Financing ${money(totalLoan)} under Equal Principal starts at ${money(prcMonth1 + extras)} in month 1 and decreases by ${money(prcDecrease)} monthly. Total interest is ${money(totalIntPrc)}.`,
			noteZh: `贷款 ${money(totalLoan)} 元按等额本金还款，${years} 年期（${months}期）首月月供 ${money(prcMonth1 + extras)} 元，随后每月递减 ${money(prcDecrease)} 元，全周期累计支付利息 ${money(totalIntPrc)} 元，还款总额 ${money(totalRepayPrc + extras * months)} 元。`,
		};
	},
};

// --- roi ---------------------------------------------------------------------------------

const roi: FormConfig = {
	intro: 'ROI = (revenue − cost) ÷ cost × 100.',
	introZh: 'ROI 投资回报率 =（收入 − 成本）÷ 成本 × 100。',
	fields: [
		{ id: 'cost', label: 'Cost of investment', labelZh: '投资成本', suffix: '($)', suffixZh: '(¥)', type: 'number', def: '1000', step: 'any', required: true },
		{ id: 'revenue', label: 'Revenue / Final value', labelZh: '回收金额 / 终值', suffix: '($)', suffixZh: '(¥)', type: 'number', def: '1500', step: 'any', required: true },
	],
	compute: (v) => {
		const cost = v.num('cost');
		const revenue = v.num('revenue');
		const profit = revenue - cost;
		if (cost === 0) return { rows: [{ label: 'ROI', labelZh: '投资回报率', value: '— (cost is 0)', valueZh: '— (成本为 0)' }] };
		return {
			rows: [
				{ label: 'Return on Investment (ROI)', labelZh: '投资回报率 (ROI)', value: `${formatNumber((profit / cost) * 100)}%`, emphasis: true },
				{ label: 'Net profit / gain', labelZh: '净收益金额', ...cash(profit) },
				{ label: 'Return multiple (Revenue ÷ Cost)', labelZh: '回报倍数 (收入 ÷ 成本)', value: `${percent(revenue / cost)}×` },
			],
			note: profit >= 0 ? `A net profit of ${money(profit)}.` : `A net loss of ${money(-profit)}.`,
			noteZh: profit >= 0 ? `实现净盈利 ${money(profit)}。` : `净亏损 ${money(-profit)}。`,
		};
	},
};

// --- discount ------------------------------------------------------------------------------

const discount: FormConfig = {
	fields: [
		{ id: 'price', label: 'Original price', labelZh: '商品原价', suffix: '($)', suffixZh: '(¥)', type: 'number', def: '100', step: 'any', min: '0', required: true },
		{ id: 'pct', label: 'Discount percentage off', labelZh: '折扣率', suffix: '(%)', type: 'number', def: '20', step: 'any', min: '0', max: '100', required: true },
		{ id: 'qty', label: 'Quantity', labelZh: '购买件数', type: 'number', def: '1', step: '1', min: '1', required: true },
	],
	compute: (v) => {
		const price = v.num('price');
		const pctOff = v.num('pct');
		const qty = Math.max(1, Math.round(v.num('qty')) || 1);
		// A discount outside 0–100% flips the maths: >100% gives a negative
		// price, <0% marks the item up. Reject it instead of showing $- signs.
		if (!(pctOff >= 0) || pctOff > 100) {
			return {
				rows: [
					{ label: 'Result', labelZh: '计算结果', value: '— (discount must be 0–100%)', valueZh: '— (折扣率需在 0–100% 之间)' },
				],
			};
		}
		const unit = price * (1 - pctOff / 100);
		return {
			rows: [
				{ label: 'Final price per item', labelZh: '单件折后价', ...cash(unit), emphasis: true },
				{ label: 'Savings per item', labelZh: '单件立省金额', ...cash(price - unit) },
				{ label: `Total for ${qty} item${qty > 1 ? 's' : ''}`, labelZh: `共 ${qty} 件折后总价`, ...cash(unit * qty) },
				{ label: 'Total savings', labelZh: '整单累计节省', ...cash((price - unit) * qty) },
			],
		};
	},
};

// --- retirement drawdown ---------------------------------------------------------------

const retirementDrawdown: FormConfig = {
	intro: 'How long will your nest egg last in retirement? Simulate monthly withdrawals, optionally growing with inflation.',
	introZh: '退休后的养老资产能支撑多久？按月提取模拟，可选随通胀逐年上调的提取策略。',
	fields: [
		{ id: 'nestEgg', label: 'Retirement nest egg', labelZh: '退休时的资产总额', suffix: '($)', suffixZh: '(¥)', type: 'number', def: '1200000', step: 'any', min: '0', required: true },
		{ id: 'spend', label: 'Monthly living expenses', labelZh: '每月生活开支', suffix: '($)', suffixZh: '(¥)', type: 'number', def: '4000', step: 'any', min: '0', required: true },
		{ id: 'ret', label: 'Expected annual return', labelZh: '资产预期年化收益率', suffix: '(%)', type: 'number', def: '5', step: 'any', required: true },
		{ id: 'infl', label: 'Annual inflation', labelZh: '年均通货膨胀率', suffix: '(%)', type: 'number', def: '3', step: 'any', min: '0', required: true },
		{
			id: 'mode',
			label: 'Withdrawal strategy',
			labelZh: '提取策略',
			type: 'select',
			def: 'inflation',
			options: [
				{ value: 'fixed', label: 'Fixed amount (nominal)', labelZh: '固定金额提取 (名义值)' },
				{ value: 'inflation', label: 'Grow with inflation (real spending constant)', labelZh: '随通胀逐年上调 (实际购买力不变)' },
			],
		},
	],
	compute: (v) => {
		const nestEgg = v.num('nestEgg');
		const spend = v.num('spend');
		const retPct = v.num('ret');
		const inflPct = v.num('infl');
		const inflate = v.str('mode') === 'inflation';
		if (!(nestEgg > 0) || !(spend > 0)) {
			return { rows: [{ label: 'Result', labelZh: '计算结果', value: '— (nest egg and expenses must be > 0)', valueZh: '— (资产总额与每月开支需大于 0)' }] };
		}
		// 600 months = 50 years, the horizon the simulation is capped at.
		const MAX_MONTHS = 600;
		const i = retPct / 100 / 12;
		let balance = nestEgg;
		let withdrawn = 0;
		let earned = 0;
		let months = 0;
		const snapshots: string[][] = [];
		let lastSnapshotYear = 0;
		while (balance > 0 && months < MAX_MONTHS) {
			const interest = balance * i;
			balance += interest;
			earned += interest;
			// In the inflation mode the withdrawal grows by infl every 12 months,
			// keeping its purchasing power flat in real terms.
			const w = inflate ? spend * (1 + inflPct / 100) ** Math.floor(months / 12) : spend;
			const take = Math.min(w, balance);
			balance -= take;
			withdrawn += take;
			months++;
			if (months % 60 === 0 || (balance <= 0 && months % 12 === 0)) {
				const year = Math.ceil(months / 12);
				if (year !== lastSnapshotYear) {
					snapshots.push([String(year), money(w * 12), cash(balance).value]);
					lastSnapshotYear = year;
				}
			}
		}
		const depleted = balance <= 0;
		const yearsOut = months / 12;
		// A 4% annual (≈0.327% monthly) withdrawal is the classic safe-harbour
		// rate; show where the input lands against it.
		const monthlyRatePct = (spend / nestEgg) * 100;
		const rows: FormResultRow[] = [];
		if (depleted) {
			rows.push({ label: 'Nest egg lasts', labelZh: '资产可支撑时长', value: `${Math.floor(yearsOut)} years ${Math.round((yearsOut % 1) * 12)} months`, valueZh: `${Math.floor(yearsOut)} 年 ${Math.round((yearsOut % 1) * 12)} 个月`, emphasis: true });
		} else {
			rows.push({ label: 'Nest egg lasts', labelZh: '资产可支撑时长', value: '50+ years — never depleted', valueZh: '50 年以上 —— 未耗尽', emphasis: true });
		}
		rows.push({ label: 'Total withdrawn', labelZh: '累计提取总额', ...cash(withdrawn) });
		rows.push({ label: 'Total investment income', labelZh: '期间投资收益累计', ...cash(earned) });
		if (!depleted) rows.push({ label: 'Balance after 50 years', labelZh: '50 年后剩余资产', ...cash(balance) });
		rows.push({ label: 'Initial monthly withdrawal rate', labelZh: '初始月提款率', value: `${percent(monthlyRatePct)}% / month (≈ ${percent(monthlyRatePct * 12)}% / year)`, valueZh: `${percent(monthlyRatePct)}% / 月 (≈ ${percent(monthlyRatePct * 12)}% / 年)` });
		return {
			rows,
			table: snapshots.length
				? {
						columns: ['Year', 'Annual Withdrawal ($)', 'Ending Balance ($)'],
						columnsZh: ['年份', '当年提取金额 (¥)', '年末资产余额 (¥)'],
						rows: snapshots,
					}
				: undefined,
			note: depleted
				? `At ${percent(retPct)}% return${inflate ? ` with withdrawals growing at ${percent(inflPct)}% inflation` : ''}, the portfolio is depleted after ${Math.floor(yearsOut)} years. A withdrawal rate above ~4% per year historically risks running out of money.`
				: `At ${percent(retPct)}% return${inflate ? ` with withdrawals growing at ${percent(inflPct)}% inflation` : ''}, the portfolio survives the full 50-year horizon.`,
			noteZh: depleted
				? `在年化 ${percent(retPct)}% 收益${inflate ? `、提取额随 ${percent(inflPct)}% 通胀逐年上调` : ''}的假设下，资产将在 ${Math.floor(yearsOut)} 年后耗尽。年提款率超过约 4% 时，历史上大概率出现本金枯竭风险。`
				: `在年化 ${percent(retPct)}% 收益${inflate ? `、提取额随 ${percent(inflPct)}% 通胀逐年上调` : ''}的假设下，资产足以支撑整个 50 年模拟期。`,
		};
	},
};

// --- mortgage refinance comparison ------------------------------------------------

const refinance: FormConfig = {
	intro: 'Compare your current mortgage against a refinanced loan: monthly savings, break-even months, and lifetime interest.',
	introZh: '对比现有房贷与再融资（转按揭）方案：月供节省、成本回本月数与全周期利息变化。',
	fields: [
		{ id: 'balance', label: 'Current loan balance', labelZh: '当前剩余贷款本金', suffix: '($)', suffixZh: '(¥)', type: 'number', def: '800000', step: 'any', min: '0', required: true },
		{ id: 'oldRate', label: 'Current interest rate', labelZh: '现有房贷利率', suffix: '(%)', type: 'number', def: '5.2', step: 'any', min: '0', required: true },
		{ id: 'remainYears', label: 'Remaining term', labelZh: '剩余还款年限', suffix: '(years)', suffixZh: '(年)', type: 'number', def: '25', step: 'any', min: '0.1', required: true },
		{ id: 'newRate', label: 'New refinanced rate', labelZh: '再融资新利率', suffix: '(%)', type: 'number', def: '3.9', step: 'any', min: '0', required: true },
		{ id: 'newYears', label: 'New loan term', labelZh: '新贷款期限', suffix: '(years)', suffixZh: '(年)', type: 'number', def: '25', step: 'any', min: '0.1', required: true },
		{ id: 'cost', label: 'Refinancing closing costs', labelZh: '再融资手续费 / 过桥成本', suffix: '($)', suffixZh: '(¥)', type: 'number', def: '8000', step: 'any', min: '0', required: true },
	],
	compute: (v) => {
		const balance = v.num('balance');
		const oldRate = v.num('oldRate');
		const remainYears = v.num('remainYears');
		const newRate = v.num('newRate');
		const newYears = v.num('newYears');
		const cost = v.num('cost');
		if (!(balance > 0)) {
			return { rows: [{ label: 'Result', labelZh: '计算结果', value: '— (balance must be > 0)', valueZh: '— (剩余贷款本金需大于 0)' }] };
		}
		if (!(remainYears > 0) || !(newYears > 0) || remainYears > MAX_TERM_YEARS || newYears > MAX_TERM_YEARS) {
			return overlongTerm();
		}
		const remainMonths = Math.round(remainYears * 12);
		const newMonths = Math.round(newYears * 12);
		const oldPay = monthlyPayment(balance, oldRate, remainMonths);
		const newPay = monthlyPayment(balance, newRate, newMonths);
		// Same-remaining-term payment isolates the pure rate cut: if the new loan
		// stretches the term, the lower payment partly comes from re-amortising,
		// not from the cheaper rate.
		const newPaySameTerm = monthlyPayment(balance, newRate, remainMonths);
		const monthlySaving = oldPay - newPay;
		const sameTermSaving = oldPay - newPaySameTerm;
		const oldInterest = oldPay * remainMonths - balance;
		const newInterest = newPay * newMonths - balance;
		const sameTermInterest = newPaySameTerm * remainMonths - balance;
		const breakEven = monthlySaving > 0 && cost > 0 ? cost / monthlySaving : null;
		const yearsLabel = (m: number): string => `${Math.floor(m / 12)} yr ${m % 12} mo`;
		const rows: FormResultRow[] = [
			{ label: `Current payment (${yearsLabel(remainMonths)} left)`, labelZh: `现有月供 (剩余 ${yearsLabel(remainMonths)})`, ...cash(oldPay) },
			{ label: `New payment (${yearsLabel(newMonths)} term)`, labelZh: `新月供 (新期限 ${yearsLabel(newMonths)})`, ...cash(newPay) },
			{ label: 'Monthly saving', labelZh: '每月节省月供', ...cash(monthlySaving), emphasis: monthlySaving > 0 },
		];
		if (breakEven !== null) {
			const beMonths = Math.ceil(breakEven);
			rows.push({ label: 'Break-even point', labelZh: '手续费回本点', value: `${beMonths} months (${yearsLabel(beMonths)})`, valueZh: `${beMonths} 个月 (${yearsLabel(beMonths)})`, emphasis: true });
		} else if (monthlySaving > 0) {
			rows.push({ label: 'Break-even point', labelZh: '手续费回本点', value: 'Immediate — no closing costs', valueZh: '立省 —— 无手续费' });
		} else {
			rows.push({ label: 'Break-even point', labelZh: '手续费回本点', value: '— (new payment is not lower)', valueZh: '— (新月供并未降低)' });
		}
		rows.push({ label: `Same-term payment (new rate, ${yearsLabel(remainMonths)})`, labelZh: `同剩余期限月供 (新利率, ${yearsLabel(remainMonths)})`, ...cash(newPaySameTerm) });
		rows.push({ label: 'Same-term monthly saving', labelZh: '同期限口径每月节省', ...cash(sameTermSaving) });
		rows.push({ label: `Remaining interest — current loan`, labelZh: '现有贷款剩余利息', ...cash(oldInterest) });
		rows.push({ label: `Total interest — new loan (${yearsLabel(newMonths)})`, labelZh: `新贷款全周期利息 (${yearsLabel(newMonths)})`, ...cash(newInterest) });
		rows.push({ label: 'Interest saved (same-term basis)', labelZh: '利息节省 (同期限口径)', ...cash(oldInterest - sameTermInterest) });
		return {
			rows,
			note: newMonths > remainMonths
				? `The new term is longer than what is left on the current loan, so the lower payment partly comes from re-spreading the balance, not just the rate cut. The same-term rows isolate the pure saving from the rate itself. Refinancing pays off if you stay past the break-even point of ${breakEven !== null ? `${Math.ceil(breakEven)} months` : '—'}.`
				: `Refinancing to ${percent(newRate)}% saves ${cash(monthlySaving).value} per month; the closing costs pay for themselves${breakEven !== null ? ` after ${Math.ceil(breakEven)} months` : ' immediately'}.`,
			noteZh: newMonths > remainMonths
				? `新贷款期限长于现有贷款剩余年限，月供下降有一部分来自"重新摊还本金"而非利率优惠。同期限口径的两行才是纯利率差带来的节省。只有计划持有超过回本点（${breakEven !== null ? `${Math.ceil(breakEven)} 个月` : '—'}）再融资才划算。`
				: `转按至 ${percent(newRate)}% 每月可省 ${cash(monthlySaving).valueZh}；手续费${breakEven !== null ? `需 ${Math.ceil(breakEven)} 个月回本` : '为零、立即回本'}。`,
		};
	},
};

// --- rental yield -----------------------------------------------------------------------

const rentalYield: FormConfig = {
	intro: 'Evaluate a rental property as an investment: gross yield, net operating income (NOI), cap rate and price-to-rent ratio.',
	introZh: '把出租房产当作投资品评估：毛租金收益率、净营业收入 (NOI)、资本化率与租售比。',
	fields: [
		{ id: 'price', label: 'Property purchase price', labelZh: '房产购入总价', suffix: '($)', suffixZh: '(¥)', type: 'number', def: '1200000', step: 'any', min: '0', required: true },
		{ id: 'rent', label: 'Monthly rent', labelZh: '每月租金收入', suffix: '($)', suffixZh: '(¥)', type: 'number', def: '4500', step: 'any', min: '0', required: true },
		{ id: 'vacancy', label: 'Vacancy & collection loss', labelZh: '空置与收租损失率', suffix: '(%)', type: 'number', def: '5', step: 'any', min: '0', max: '100', required: true },
		{ id: 'expenses', label: 'Annual operating expenses', labelZh: '年持有运营成本 (物业/维修/保险/税费)', suffix: '($)', suffixZh: '(¥)', type: 'number', def: '12000', step: 'any', min: '0', required: true },
	],
	compute: (v) => {
		const price = v.num('price');
		const rent = v.num('rent');
		const vacancyPct = v.num('vacancy');
		const expenses = v.num('expenses');
		if (!(price > 0)) {
			return { rows: [{ label: 'Result', labelZh: '计算结果', value: '— (purchase price must be > 0)', valueZh: '— (购入总价需大于 0)' }] };
		}
		const annualRent = rent * 12;
		const effectiveRent = annualRent * (1 - vacancyPct / 100);
		const noi = effectiveRent - expenses;
		const grossYield = (annualRent / price) * 100;
		const netYield = (noi / price) * 100;
		// The Chinese price-to-rent ratio: how many years of rent one purchase equals.
		const priceToRent = annualRent > 0 ? price / annualRent : null;
		const paybackYears = noi > 0 ? price / noi : null;
		const rows: FormResultRow[] = [
			{ label: 'Gross rental yield', labelZh: '毛租金收益率', value: `${percent(grossYield)}%`, valueZh: `${percent(grossYield)}%`, emphasis: true },
			{ label: 'Net operating income (NOI)', labelZh: '净营业收入 (NOI)', ...cash(noi) },
			{ label: 'Net yield / Cap rate', labelZh: '净收益率 / 资本化率 (Cap Rate)', value: `${percent(netYield)}%`, valueZh: `${percent(netYield)}%`, emphasis: true },
			{ label: 'Effective annual rent (after vacancy)', labelZh: '扣除空置后年有效租金收入', ...cash(effectiveRent) },
			{ label: 'Monthly cash flow (unleveraged)', labelZh: '月净现金流 (全款无贷款)', ...cash(noi / 12) },
		];
		if (priceToRent !== null) {
			rows.push({ label: 'Price-to-rent ratio', labelZh: '租售比', value: `1 : ${formatNumber(Math.round(priceToRent * 10) / 10)}`, valueZh: `1 : ${formatNumber(Math.round(priceToRent * 10) / 10)}` });
		}
		if (paybackYears !== null) {
			rows.push({ label: 'Payback period (NOI basis)', labelZh: '租金回本年限 (按 NOI 静态)', value: `${formatNumber(Math.round(paybackYears * 10) / 10)} years`, valueZh: `${formatNumber(Math.round(paybackYears * 10) / 10)} 年` });
		}
		// Vacancy sensitivity: NOI and net yield at four loss levels so the
		// single input's leverage on the bottom line is visible.
		const tableRows = [0, 5, 10, 15].map((p) => {
			const eff = annualRent * (1 - p / 100);
			const n = eff - expenses;
			return [`-${p}%`, money(eff), money(n), `${percent((n / price) * 100)}%`];
		});
		return {
			rows,
			table: {
				columns: ['Vacancy Loss', 'Effective Rent ($)', 'NOI ($)', 'Net Yield'],
				columnsZh: ['空置损失率', '年有效租金 (¥)', 'NOI (¥)', '净收益率'],
				rows: tableRows,
			},
			note: `A net yield above 4–5% is generally considered a healthy rental investment; below 2%, returns rely almost entirely on price appreciation. This is an unleveraged all-cash view — mortgage payments are financing costs, not operating expenses.`,
			noteZh: `净收益率高于 4%~5% 通常视为健康的收租型投资；低于 2% 时回报几乎完全依赖房价上涨。本测算为全款无杠杆口径——房贷月供属于融资成本，不计入运营费用。`,
		};
	},
};

// --- credit card minimum payment ------------------------------------------------

const creditCardMinimum: FormConfig = {
	intro: 'See the true cost of paying only the minimum: months to freedom, interest paid, versus a fixed monthly payment.',
	introZh: '看清只还最低还款额的真实代价：清偿时长与利息总额，并与固定月还款方案对比。',
	fields: [
		{ id: 'balance', label: 'Current card balance', labelZh: '信用卡当前欠款本金', suffix: '($)', suffixZh: '(¥)', type: 'number', def: '20000', step: 'any', min: '0', required: true },
		{ id: 'apr', label: 'Card APR', labelZh: '信用卡年化利率 (APR)', suffix: '(%)', type: 'number', def: '18.25', step: 'any', min: '0', required: true },
		{ id: 'minPct', label: 'Minimum payment rate', labelZh: '最低还款比例', suffix: '(%)', type: 'number', def: '2.5', step: 'any', min: '0.1', required: true },
		{ id: 'floor', label: 'Minimum payment floor', labelZh: '最低还款绝对下限', suffix: '($)', suffixZh: '(¥)', type: 'number', def: '50', step: 'any', min: '0', required: true },
		{ id: 'fixed', label: 'Fixed payment to compare', labelZh: '对比用固定月还款额', suffix: '($)', suffixZh: '(¥)', type: 'number', def: '1000', step: 'any', min: '0', required: true },
	],
	compute: (v) => {
		const balance = v.num('balance');
		const apr = v.num('apr');
		const minPct = v.num('minPct');
		const floorAmt = v.num('floor');
		const fixed = v.num('fixed');
		if (!(balance > 0) || !(minPct > 0)) {
			return { rows: [{ label: 'Result', labelZh: '计算结果', value: '— (balance and minimum rate must be > 0)', valueZh: '— (欠款本金与最低还款比例需大于 0)' }] };
		}
		const i = apr / 100 / 12;
		// 600 months = 50 years, plenty for any realistic payoff and a hard stop
		// for the pathological cases below.
		const MAX_MONTHS = 600;
		/** Simulate one repayment rule. Returns null when the balance never
		 *  amortises (payment ≤ monthly interest — the debt snowballs forever). */
		function simulate(payOf: (b: number) => number): { months: number; interest: number; yearly: string[][] } | null {
			let b = balance;
			let interest = 0;
			let months = 0;
			const yearly: string[][] = [];
			while (b > 0.005 && months < MAX_MONTHS) {
				const int = b * i;
				b += int;
				interest += int;
				const pay = Math.min(b, payOf(b));
				b -= pay;
				months++;
				if (months % 12 === 0) yearly.push([String(months / 12), money(pay), money(Math.max(0, b))]);
			}
			return b <= 0.005 ? { months, interest, yearly } : null;
		}
		const minSim = simulate((b) => Math.max(b * (minPct / 100), floorAmt));
		// The fixed payment must at least cover the interest plus a little
		// principal, otherwise it never lands — surfaced as its own guard row.
		const fixedSim = fixed > 0 ? simulate(() => fixed) : null;
		const minFirst = Math.max(balance * (minPct / 100), floorAmt);
		const duration = (m: number): { value: string; valueZh: string } => ({
			value: `${Math.floor(m / 12)} yr ${m % 12} mo (${m} months)`,
			valueZh: `${Math.floor(m / 12)} 年 ${m % 12} 个月 (共 ${m} 期)`,
		});
		const rows: FormResultRow[] = [
			{ label: 'First minimum payment', labelZh: '首月最低还款额', ...cash(Math.min(minFirst, balance * (1 + i))) },
		];
		if (minSim === null) {
			rows.push({ label: 'Minimum-only payoff time', labelZh: '只还最低额的清偿时长', value: 'Never — payment does not cover interest', valueZh: '永远还不清 —— 还款额不足以覆盖利息', emphasis: true });
		} else {
			rows.push({ label: 'Minimum-only payoff time', labelZh: '只还最低额的清偿时长', ...duration(minSim.months), emphasis: true });
			rows.push({ label: 'Total interest (minimum only)', labelZh: '只还最低额的总利息', ...cash(minSim.interest) });
			rows.push({ label: 'Interest as share of principal', labelZh: '利息占本金比例', value: `${percent((minSim.interest / balance) * 100)}%`, valueZh: `${percent((minSim.interest / balance) * 100)}%` });
		}
		if (fixed > 0) {
			if (fixedSim === null) {
				rows.push({ label: `Fixed ${cash(fixed).value}/mo payoff time`, labelZh: `固定月还 ${cash(fixed).valueZh} 的清偿时长`, value: 'Never — payment does not cover interest', valueZh: '永远还不清 —— 还款额不足以覆盖利息' });
			} else {
				rows.push({ label: `Fixed ${cash(fixed).value}/mo payoff time`, labelZh: `固定月还 ${cash(fixed).valueZh} 的清偿时长`, ...duration(fixedSim.months) });
				rows.push({ label: 'Total interest (fixed payment)', labelZh: '固定月还的总利息', ...cash(fixedSim.interest) });
				if (minSim !== null) {
					rows.push({ label: 'Interest saved by fixing payments', labelZh: '改固定月还可省利息', ...cash(minSim.interest - fixedSim.interest), emphasis: true });
				}
			}
		}
		return {
			rows,
			table: minSim && minSim.yearly.length
				? {
						columns: ['Year', 'Representative Payment ($)', 'Balance ($)'],
						columnsZh: ['年份', '当年代表还款额 (¥)', '期末欠款余额 (¥)'],
						rows: minSim.yearly.slice(0, 15),
					}
				: undefined,
			note: minSim === null
				? `A minimum payment of ${percent(minPct)}% does not even cover the monthly interest at ${percent(apr)}% APR — the balance grows every month. Pay more than ${cash(balance * i).value} per month just to stop the debt from increasing.`
				: `Paying only the minimum stretches ${cash(balance).value} of debt over years and multiplies the interest. Every extra amount above the minimum goes straight to principal.`,
			noteZh: minSim === null
				? `按 ${percent(minPct)}% 的最低还款比例，在 ${percent(apr)}% 年化利率下连当月利息都覆盖不了——欠款会越滚越多。每月至少需还 ${cash(balance * i).valueZh} 才能止住债务增长。`
				: `只还最低额会把 ${cash(balance).valueZh} 的欠款拖成数年长债，利息翻倍。超出最低额的每一分钱都直接冲抵本金。`,
		};
	},
};

// --- annuity present & future value ------------------------------------------------

const annuityCalculator: FormConfig = {
	intro: 'Present and future value of an annuity — evaluate pension payouts, insurance products and structured settlements.',
	introZh: '年金现值与终值测算——评估养老金领取、年金保险产品与分期给付方案的价值。',
	fields: [
		{ id: 'payment', label: 'Payment per period', labelZh: '每期给付金额', suffix: '($)', suffixZh: '(¥)', type: 'number', def: '2000', step: 'any', min: '0', required: true },
		{
			id: 'freq',
			label: 'Payment frequency',
			labelZh: '给付频率',
			type: 'select',
			def: 'monthly',
			options: [
				{ value: 'monthly', label: 'Monthly', labelZh: '每月' },
				{ value: 'yearly', label: 'Yearly', labelZh: '每年' },
			],
		},
		{ id: 'years', label: 'Duration', labelZh: '给付年限', suffix: '(years)', suffixZh: '(年)', type: 'number', def: '20', step: 'any', min: '0.1', required: true },
		{ id: 'rate', label: 'Discount / growth rate (annual)', labelZh: '折现 / 增值年化利率', suffix: '(%)', type: 'number', def: '4', step: 'any', required: true },
		{
			id: 'type',
			label: 'Annuity type',
			labelZh: '年金类型',
			type: 'select',
			def: 'ordinary',
			options: [
				{ value: 'ordinary', label: 'Ordinary (end of period)', labelZh: '普通年金 (期末给付)' },
				{ value: 'due', label: 'Annuity due (beginning of period)', labelZh: '先付年金 (期初给付)' },
			],
		},
	],
	compute: (v) => {
		const payment = v.num('payment');
		const yearly = v.str('freq') === 'yearly';
		const years = v.num('years');
		const ratePct = v.num('rate');
		const due = v.str('type') === 'due';
		if (!(payment > 0)) {
			return { rows: [{ label: 'Result', labelZh: '计算结果', value: '— (payment must be > 0)', valueZh: '— (每期给付金额需大于 0)' }] };
		}
		if (!(years > 0) || years > MAX_TERM_YEARS) {
			return overlongTerm();
		}
		const n = Math.round(years * (yearly ? 1 : 12));
		const i = ratePct / 100 / (yearly ? 1 : 12);
		// i === 0 is legal input (a 0% discount rate); the formulas degenerate
		// to plain multiplication, which the branches below handle.
		let pv: number;
		let fv: number;
		if (i === 0) {
			pv = payment * n;
			fv = payment * n;
		} else {
			pv = (payment * (1 - (1 + i) ** -n)) / i;
			fv = (payment * ((1 + i) ** n - 1)) / i;
			if (due) {
				pv *= 1 + i;
				fv *= 1 + i;
			}
		}
		const totalPaid = payment * n;
		return {
			rows: [
				{ label: `Present value (${due ? 'annuity due' : 'ordinary'})`, labelZh: `年金现值 (${due ? '先付年金' : '普通年金'})`, ...cash(pv), emphasis: true },
				{ label: 'Future value at the end', labelZh: '期满终值 (FV)', ...cash(fv) },
				{ label: 'Total payments received', labelZh: '累计给付总额', ...cash(totalPaid) },
				{ label: 'Payments count', labelZh: '给付期数', value: `${n} ${yearly ? 'years' : 'months'}`, valueZh: `共 ${n} ${yearly ? '期 (年付)' : '期 (月付)'}` },
				{ label: 'Discount vs face value', labelZh: '现值相对面值折价', value: pv < totalPaid ? `-${percent(((totalPaid - pv) / totalPaid) * 100)}%` : `${percent(((pv - totalPaid) / totalPaid) * 100)}%`, valueZh: pv < totalPaid ? `折价 ${percent(((totalPaid - pv) / totalPaid) * 100)}%` : `溢价 ${percent(((pv - totalPaid) / totalPaid) * 100)}%` },
			],
			note: `The ${n} payments of ${cash(payment).value} each are worth ${cash(pv).value} today at a ${percent(ratePct)}% discount rate. When comparing an insurance or pension product, its price should not exceed this present value.`,
			noteZh: `每期 ${cash(payment).valueZh}、共 ${n} 期的给付，按 ${percent(ratePct)}% 折现率折算，今天的价值是 ${cash(pv).valueZh}。评估年金保险或养老金产品时，产品价格不应高于这一现值。`,
		};
	},
};

// --- salary ----------------------------------------------------------------------------------

const salary: FormConfig = {
	fields: [
		{ id: 'annual', label: 'Annual salary', labelZh: '年薪总额', suffix: '($)', suffixZh: '(¥)', type: 'number', def: '60000', step: 'any', min: '0', required: true },
		{ id: 'hours', label: 'Hours per week', labelZh: '每周工作小时数', type: 'number', def: '40', step: 'any', min: '0', required: true },
		{ id: 'weeks', label: 'Working weeks per year', labelZh: '每年工作周数', type: 'number', def: '52', step: 'any', min: '0', required: true },
		{ id: 'days', label: 'Working days per week', labelZh: '每周工作天数', type: 'number', def: '5', step: 'any', min: '0', required: true },
	],
	compute: (v) => {
		const annual = v.num('annual');
		const weeks = v.num('weeks');
		const days = v.num('days');
		const totalHours = v.num('hours') * weeks;
		const rows: FormResultRow[] = [];
		if (!(weeks > 0)) {
			rows.push({ label: 'Hourly rate', labelZh: '折合时薪', value: '— (working weeks must be > 0)', valueZh: '— (每年工作周数需大于 0)' });
			return { rows };
		}
		rows.push({
			label: 'Hourly rate',
			labelZh: '折合时薪',
			...cash(totalHours > 0 ? annual / totalHours : null),
			emphasis: true,
		});
		rows.push({ label: 'Weekly pay', labelZh: '周薪', ...cash(annual / weeks) });
		rows.push({ label: 'Biweekly pay', labelZh: '双周薪 (每两周)', ...cash((annual / weeks) * 2) });
		rows.push({ label: 'Monthly pay', labelZh: '月薪', ...cash(annual / 12) });
		rows.push({ label: 'Daily pay', labelZh: '日薪', ...cash(days > 0 ? annual / weeks / days : null) });
		return { rows };
	},
};

// --- progressive & flat tax (China IIT Five Insurances & One Fund, 7 Special Deductions, Year-End Bonus) ---

/** China IIT Annual Comprehensive Tax Brackets (7-level progressive) */
const CN_ANNUAL_BRACKETS = [
	{ max: 36000, rate: 0.03, quick: 0 },
	{ max: 144000, rate: 0.10, quick: 2520 },
	{ max: 300000, rate: 0.20, quick: 16920 },
	{ max: 420000, rate: 0.25, quick: 31920 },
	{ max: 660000, rate: 0.30, quick: 52920 },
	{ max: 960000, rate: 0.35, quick: 85920 },
	{ max: Infinity, rate: 0.45, quick: 181920 },
];

/** China IIT Year-End Bonus Monthly Equivalent Brackets (lump-sum divided by 12) */
const CN_BONUS_MONTHLY_BRACKETS = [
	{ maxMonthly: 3000, maxBonus: 36000, rate: 0.03, quick: 0 },
	{ maxMonthly: 12000, maxBonus: 144000, rate: 0.10, quick: 210 },
	{ maxMonthly: 25000, maxBonus: 300000, rate: 0.20, quick: 1410 },
	{ maxMonthly: 35000, maxBonus: 420000, rate: 0.25, quick: 2660 },
	{ maxMonthly: 55000, maxBonus: 660000, rate: 0.30, quick: 4410 },
	{ maxMonthly: 80000, maxBonus: 960000, rate: 0.35, quick: 7160 },
	{ maxMonthly: Infinity, maxBonus: Infinity, rate: 0.45, quick: 15160 },
];

/**
 * Known Year-End Bonus Tax Pitfalls (经典多发少得盲区区间):
 * When bonus falls strictly in (threshold, maxPitfall], the higher tax rate causes take-home pay
 * to be strictly LESS than taking exactly the threshold bonus!
 */
interface BonusPitfall {
	threshold: number;
	minPitfall: number;
	maxPitfall: number;
	rate: number;
	quick: number;
	prevRate: number;
}

const CN_BONUS_PITFALLS: BonusPitfall[] = [
	{ threshold: 36000, minPitfall: 36001, maxPitfall: 38566.67, rate: 0.10, quick: 210, prevRate: 0.03 },
	{ threshold: 144000, minPitfall: 144001, maxPitfall: 160500, rate: 0.20, quick: 1410, prevRate: 0.10 },
	{ threshold: 300000, minPitfall: 300001, maxPitfall: 318333.33, rate: 0.25, quick: 2660, prevRate: 0.20 },
	{ threshold: 420000, minPitfall: 420001, maxPitfall: 447500, rate: 0.30, quick: 4410, prevRate: 0.25 },
	{ threshold: 660000, minPitfall: 660001, maxPitfall: 706538.46, rate: 0.35, quick: 7160, prevRate: 0.30 },
	{ threshold: 960000, minPitfall: 960001, maxPitfall: 1120000, rate: 0.45, quick: 15160, prevRate: 0.35 },
];

function calcCnTax(taxableIncome: number): { tax: number; marginalRate: number; rows: string[][] } {
	let tax = 0;
	let marginalRate = 0;
	let prev = 0;
	const rows: string[][] = [];
	for (const b of CN_ANNUAL_BRACKETS) {
		if (taxableIncome > prev) {
			const inBracket = Math.min(taxableIncome, b.max) - prev;
			const taxInBracket = inBracket * b.rate;
			tax += taxInBracket;
			marginalRate = b.rate * 100;
			rows.push([
				`${prev ? money(prev) : '0'} – ${b.max === Infinity ? 'Above / 以上' : money(b.max)}`,
				`${(b.rate * 100).toFixed(0)}%`,
				money(inBracket),
				money(taxInBracket),
			]);
			prev = b.max;
		} else {
			break;
		}
	}
	return { tax, marginalRate, rows };
}

interface TaxCoreInput {
	annualGross: number;
	regime: string;
	annualInsurance: number;
	annualSpecialDeduction: number;
	effectiveBonus: number;
	bonusMode: string;
	flatRate: number;
}

interface TaxCoreOutput {
	totalGross: number;
	annualGross: number;
	annualInsurance: number;
	annualSpecialDeduction: number;
	effectiveBonus: number;
	totalSalaryDeductions: number;
	salaryTaxable: number;
	salaryTax: number;
	separateBonusTax: number;
	separateBonusRate: number;
	separateBonusQuick: number;
	bonusTaxableForSeparate: number;
	separateTotalTax: number;
	combinedTotalTax: number;
	combinedBonusTax: number;
	bestScheme: 'separate' | 'combined' | 'equal';
	taxDiff: number;
	isCombinedActive: boolean;
	totalTax: number;
	bonusTax: number;
	bonusTakeHome: number;
	annualSalaryNet: number;
	monthlySalaryNet: number;
	totalNetTakeHome: number;
	effectiveRate: number;
	marginalRate: number;
	pitfallWarning: { threshold: number; min: number; max: number; safeTax: number; currTax: number; lost: number } | null;
	salaryCalcRows: string[][];
	usOrFlatRows: string[][];
}

function computeTaxCore(input: TaxCoreInput): TaxCoreOutput {
	const { annualGross, regime, annualInsurance, annualSpecialDeduction, effectiveBonus, bonusMode, flatRate } = input;
	const totalGross = annualGross + effectiveBonus;

	if (regime === 'cn') {
		const STANDARD_DEDUCTION = 60000;
		const totalSalaryDeductions = STANDARD_DEDUCTION + annualInsurance + annualSpecialDeduction;
		const salaryTaxable = Math.max(0, annualGross - totalSalaryDeductions);
		const salaryShortfall = Math.max(0, totalSalaryDeductions - annualGross);
		const salaryCalc = calcCnTax(salaryTaxable);
		const salaryTax = salaryCalc.tax;

		let separateBonusTax = 0;
		let separateBonusRate = 0;
		let separateBonusQuick = 0;
		let bonusTaxableForSeparate = 0;

		if (effectiveBonus > 0) {
			bonusTaxableForSeparate = Math.max(0, effectiveBonus - salaryShortfall);
			if (bonusTaxableForSeparate > 0) {
				const monthlyQuotient = bonusTaxableForSeparate / 12;
				for (const mb of CN_BONUS_MONTHLY_BRACKETS) {
					if (monthlyQuotient <= mb.maxMonthly) {
						separateBonusRate = mb.rate;
						separateBonusQuick = mb.quick;
						separateBonusTax = Math.max(0, bonusTaxableForSeparate * mb.rate - mb.quick);
						break;
					}
				}
			}
		}

		const separateTotalTax = salaryTax + separateBonusTax;
		const combinedTaxable = Math.max(0, totalGross - totalSalaryDeductions);
		const combinedCalc = calcCnTax(combinedTaxable);
		const combinedTotalTax = combinedCalc.tax;
		const combinedBonusTax = Math.max(0, combinedTotalTax - salaryTax);

		let bestScheme: 'separate' | 'combined' | 'equal' = 'separate';
		const taxDiff = Math.abs(separateTotalTax - combinedTotalTax);
		if (effectiveBonus <= 0) {
			bestScheme = 'separate';
		} else if (separateTotalTax < combinedTotalTax) {
			bestScheme = 'separate';
		} else if (combinedTotalTax < separateTotalTax) {
			bestScheme = 'combined';
		} else {
			bestScheme = 'equal';
		}

		let activeScheme = bonusMode;
		if (bonusMode === 'auto') {
			activeScheme = bestScheme === 'combined' ? 'combined' : 'separate';
		}

		const isCombinedActive = activeScheme === 'combined';
		const totalTax = isCombinedActive ? combinedTotalTax : separateTotalTax;
		const bonusTax = isCombinedActive ? combinedBonusTax : separateBonusTax;
		const bonusTakeHome = Math.max(0, effectiveBonus - bonusTax);
		const annualSalaryNet = Math.max(0, annualGross - annualInsurance - salaryTax);
		const monthlySalaryNet = annualSalaryNet / 12;
		const totalNetTakeHome = Math.max(0, totalGross - annualInsurance - totalTax);
		const effectiveRate = totalGross > 0 ? (totalTax / totalGross) * 100 : 0;
		const marginalRate = isCombinedActive ? combinedCalc.marginalRate : Math.max(salaryCalc.marginalRate, separateBonusRate * 100);

		let pitfallWarning: { threshold: number; min: number; max: number; safeTax: number; currTax: number; lost: number } | null = null;
		if (effectiveBonus > 0 && !isCombinedActive && bonusTaxableForSeparate > 0) {
			for (const p of CN_BONUS_PITFALLS) {
				if (bonusTaxableForSeparate > p.threshold && bonusTaxableForSeparate <= p.maxPitfall) {
					const safeTax = p.threshold * p.prevRate;
					const currTax = bonusTaxableForSeparate * p.rate - p.quick;
					const lost = (p.threshold - safeTax) - (bonusTaxableForSeparate - currTax);
					if (lost > 0) {
						pitfallWarning = {
							threshold: p.threshold,
							min: p.minPitfall,
							max: Math.round(p.maxPitfall),
							safeTax,
							currTax,
							lost: Math.round(lost * 100) / 100,
						};
					}
					break;
				}
			}
		}

		return {
			totalGross,
			annualGross,
			annualInsurance,
			annualSpecialDeduction,
			effectiveBonus,
			totalSalaryDeductions,
			salaryTaxable,
			salaryTax,
			separateBonusTax,
			separateBonusRate,
			separateBonusQuick,
			bonusTaxableForSeparate,
			separateTotalTax,
			combinedTotalTax,
			combinedBonusTax,
			bestScheme,
			taxDiff,
			isCombinedActive,
			totalTax,
			bonusTax,
			bonusTakeHome,
			annualSalaryNet,
			monthlySalaryNet,
			totalNetTakeHome,
			effectiveRate,
			marginalRate,
			pitfallWarning,
			salaryCalcRows: salaryCalc.rows,
			usOrFlatRows: [],
		};
	}

	// US Single & Flat Tax
	const annualDeductions = annualInsurance + annualSpecialDeduction;
	let taxableIncome = 0;
	let annualTax = 0;
	let marginalRate = 0;
	const usOrFlatRows: string[][] = [];

	if (regime === 'us_single') {
		const standardDeduction = 14600;
		taxableIncome = Math.max(0, totalGross - standardDeduction - annualDeductions);
		const brackets = [
			{ max: 11600, rate: 0.10 },
			{ max: 47150, rate: 0.12 },
			{ max: 100525, rate: 0.22 },
			{ max: 191950, rate: 0.24 },
			{ max: 243725, rate: 0.32 },
			{ max: 609350, rate: 0.35 },
			{ max: Infinity, rate: 0.37 },
		];
		let prev = 0;
		for (const b of brackets) {
			if (taxableIncome > prev) {
				const inBracket = Math.min(taxableIncome, b.max) - prev;
				const taxInBracket = inBracket * b.rate;
				annualTax += taxInBracket;
				marginalRate = b.rate * 100;
				usOrFlatRows.push([
					`${prev ? money(prev) : '0'} – ${b.max === Infinity ? 'Above / 以上' : money(b.max)}`,
					`${(b.rate * 100).toFixed(0)}%`,
					money(inBracket),
					money(taxInBracket),
				]);
				prev = b.max;
			} else {
				break;
			}
		}
	} else {
		// Flat Rate
		taxableIncome = Math.max(0, totalGross - annualDeductions);
		annualTax = taxableIncome * flatRate;
		marginalRate = flatRate * 100;
		usOrFlatRows.push(['All taxable income', `${(flatRate * 100).toFixed(1)}%`, money(taxableIncome), money(annualTax)]);
	}

	const annualSalaryNet = Math.max(0, annualGross - annualInsurance - annualTax);
	const monthlySalaryNet = annualSalaryNet / 12;
	const totalNetTakeHome = Math.max(0, totalGross - annualDeductions - annualTax);
	const effectiveRate = totalGross > 0 ? (annualTax / totalGross) * 100 : 0;

	return {
		totalGross,
		annualGross,
		annualInsurance,
		annualSpecialDeduction,
		effectiveBonus,
		totalSalaryDeductions: annualDeductions,
		salaryTaxable: taxableIncome,
		salaryTax: annualTax,
		separateBonusTax: 0,
		separateBonusRate: 0,
		separateBonusQuick: 0,
		bonusTaxableForSeparate: 0,
		separateTotalTax: annualTax,
		combinedTotalTax: annualTax,
		combinedBonusTax: 0,
		bestScheme: 'separate',
		taxDiff: 0,
		isCombinedActive: false,
		totalTax: annualTax,
		bonusTax: 0,
		bonusTakeHome: effectiveBonus,
		annualSalaryNet,
		monthlySalaryNet,
		totalNetTakeHome,
		effectiveRate,
		marginalRate,
		pitfallWarning: null,
		salaryCalcRows: [],
		usOrFlatRows,
	};
}

const tax: FormConfig = {
	intro: 'Calculate net take-home pay, Five Insurances & Housing Fund, 7 Special Additional Deductions, Year-End Bonus tax, or reverse-calculate gross salary from target take-home pay.',
	introZh: '测算税后到手工资、五险一金、七项专项附加扣除与年终奖个税，也可由目标到手工资反推税前月薪。',
	fields: [
		{
			id: 'direction',
			label: 'Calculation direction',
			labelZh: '计算方向',
			type: 'select',
			def: 'gross_to_net',
			options: [
				{ value: 'gross_to_net', label: 'Forward: gross → net take-home', labelZh: '正向：税前薪资算税后到手' },
				{ value: 'net_to_gross', label: 'Reverse: net take-home → required gross', labelZh: '逆向：税后到手反推税前薪资' },
			],
		},
		{
			id: 'gross',
			label: 'Salary / Income amount',
			labelZh: '薪资收入金额 (税前基本薪资 或 目标税后到手)',
			suffix: '($)', suffixZh: '(¥)',
			type: 'number',
			def: '15000',
			step: 'any',
			min: '0',
			required: true,
			hint: 'Forward: enter gross base salary. Reverse: enter desired net take-home pay.',
			hintZh: '正向模式输入税前基本薪资；逆向模式输入目标期望税后到手金额',
		},
		{
			id: 'period',
			label: 'Income period',
			labelZh: '计税周期',
			type: 'select',
			def: 'monthly',
			options: [
				{ value: 'monthly', label: 'Monthly (per month)', labelZh: '按月薪计算' },
				{ value: 'annual', label: 'Annual (per year)', labelZh: '按年薪计算' },
			],
		},
		{
			id: 'regime',
			label: 'Tax regime',
			labelZh: '税制方案',
			type: 'select',
			def: 'cn',
			options: [
				{ value: 'cn', label: 'China individual income tax (7 brackets, 3%–45%)', labelZh: '中国新个税 (五险一金/专项扣除/年终奖)' },
				{ value: 'us_single', label: 'US Federal Income Tax (Single)', labelZh: '美国联邦个人所得税 (Single 单身标准)' },
				{ value: 'flat', label: 'Flat tax rate', labelZh: '固定单一税率' },
			],
		},
		{
			id: 'insurance',
			label: 'Five Insurances & Housing Fund (Monthly)',
			labelZh: '五险一金个人扣除 (每月)',
			suffix: '($)', suffixZh: '(¥)',
			type: 'number',
			def: '2250',
			step: 'any',
			min: '0',
			hint: 'Monthly employee deduction: Pension (8%), Medical (2%), Unemployment (0.5%), Housing Fund (5%~12%)',
			hintZh: '每月个人承担扣缴总额：养老保险(8%) + 医疗保险(2%) + 失业保险(0.5%) + 住房公积金(5%~12%)',
			showIf: (v) => (v.str('regime') || 'cn') === 'cn',
		},
		{
			id: 'specialDeduction',
			label: 'Special Additional Deductions (Monthly)',
			labelZh: '专项附加扣除 (每月合计)',
			suffix: '($)', suffixZh: '(¥)',
			type: 'number',
			def: '2000',
			step: 'any',
			min: '0',
			hint: 'Monthly 7 deductions: Children education (2000/mo), Under 3 infant (2000/mo), Elderly care (1500-3000/mo), Mortgage interest (1000/mo), Rent (800-1500/mo), Continuing edu (400/mo)',
			hintZh: '每月7项累计：子女教育(2000/月/孩)、3岁以下婴幼儿(2000/月/孩)、赡养老人(独生3000/非独生最高1500)、首套房贷(1000)或住房租金(800~1500)、继续教育(400)',
			showIf: (v) => (v.str('regime') || 'cn') === 'cn',
		},
		{
			id: 'bonusMode',
			label: 'Year-end bonus tax scheme',
			labelZh: '年终奖计税方案',
			type: 'select',
			def: 'auto',
			options: [
				{ value: 'auto', label: 'Auto Optimal (Compare separate vs combined & recommend)', labelZh: '智能优选 (自动对比单独与合并计税，推荐最优方案)' },
				{ value: 'separate', label: 'Taxed Separately (Preferential quotient table)', labelZh: '单独计税 (全年一次性奖金优惠政策：除以12查月税率)' },
				{ value: 'combined', label: 'Combined with Comprehensive Income', labelZh: '并入当年综合所得计税' },
				{ value: 'none', label: 'No Bonus (Ignore bonus)', labelZh: '不计年终奖 (仅算基本薪资)' },
			],
			showIf: (v) => (v.str('regime') || 'cn') === 'cn',
		},
		{
			id: 'bonus',
			label: 'Year-end bonus / Annual lump sum',
			labelZh: '全年一次性奖金 (年终奖)',
			suffix: '($)', suffixZh: '(¥)',
			type: 'number',
			def: '30000',
			step: 'any',
			min: '0',
			hint: 'Annual lump-sum bonus eligible for preferential separate taxation policy (extended through 2027)',
			hintZh: '全年一次性发放的年终奖（享受国家单独计税优惠政策，延续执行至2027年12月31日）',
			showIf: (v) => {
				const r = v.str('regime') || 'cn';
				if (r === 'flat') return false;
				if (r === 'cn' && v.str('bonusMode') === 'none') return false;
				return true;
			},
		},
		{
			id: 'flatRate',
			label: 'Flat rate (%)',
			labelZh: '单一固定税率 (%)',
			suffix: '(%)',
			type: 'number',
			def: '20',
			step: 'any',
			min: '0',
			hint: 'Only used when "Flat Tax Rate" is chosen',
			hintZh: '仅在选择“固定单一税率”时生效',
			showIf: (v) => v.str('regime') === 'flat',
			required: (v) => v.str('regime') === 'flat',
		},
	],
	compute: (v) => {
		const direction = v.str('direction') || 'gross_to_net';
		const inputIncome = Math.max(0, v.num('gross') || 0);
		const period = v.str('period');
		const regime = v.str('regime');
		const monthlyInsurance = Math.max(0, v.num('insurance') || 0);
		const monthlySpecialDeduction = Math.max(0, v.num('specialDeduction') || 0);
		const rawBonus = Math.max(0, v.num('bonus') || 0);
		const bonusMode = v.str('bonusMode');
		const flatRate = Math.max(0, (v.num('flatRate') || 0) / 100);

		const annualInsurance = monthlyInsurance * 12;
		const annualSpecialDeduction = monthlySpecialDeduction * 12;
		const effectiveBonus = bonusMode === 'none' ? 0 : rawBonus;

		let annualGross = 0;
		if (direction === 'net_to_gross') {
			const targetAnnualNet = period === 'monthly' ? inputIncome * 12 : inputIncome;
			if (targetAnnualNet <= 0) {
				annualGross = 0;
			} else {
				let low = 0;
				let high = Math.max(targetAnnualNet * 2.5 + annualInsurance + 100000, 100000);
				// Doubling until take-home clears the target. Bounded because the
				// condition is not guaranteed monotonic at the edges: a target big
				// enough to push `high` to Infinity leaves `high *= 2` a no-op, and
				// nothing else would ever end the loop. 2^80 of any currency is past
				// every finite target a person can type.
				for (
					let step = 0;
					step < 80 &&
					computeTaxCore({
						annualGross: high,
						regime,
						annualInsurance,
						annualSpecialDeduction,
						effectiveBonus,
						bonusMode,
						flatRate,
					}).totalNetTakeHome < targetAnnualNet;
					step++
				) {
					high *= 2;
				}
				for (let iter = 0; iter < 50; iter++) {
					const mid = (low + high) / 2;
					const cur = computeTaxCore({
						annualGross: mid,
						regime,
						annualInsurance,
						annualSpecialDeduction,
						effectiveBonus,
						bonusMode,
						flatRate,
					});
					if (cur.totalNetTakeHome >= targetAnnualNet) {
						high = mid;
					} else {
						low = mid;
					}
				}
				annualGross = (low + high) / 2;
			}
		} else {
			annualGross = period === 'monthly' ? inputIncome * 12 : inputIncome;
		}

		const out = computeTaxCore({
			annualGross,
			regime,
			annualInsurance,
			annualSpecialDeduction,
			effectiveBonus,
			bonusMode,
			flatRate,
		});

		if (direction === 'net_to_gross') {
			const requiredPeriodGross = period === 'monthly' ? annualGross / 12 : annualGross;
			const rows: FormResultRow[] = [
				{
					label: period === 'monthly' ? 'Required pre-tax salary (Monthly)' : 'Required pre-tax salary (Annual)',
					labelZh: period === 'monthly' ? '所需税前基本薪资 (月薪)' : '所需税前基本薪资 (年薪)',
					...cash(requiredPeriodGross),
					emphasis: true,
				},
				{
					label: 'Target net take-home pay',
					labelZh: '目标税后到手金额',
					value: `$${money(inputIncome)} (${period === 'monthly' ? 'monthly' : 'annual'})`,
					valueZh: `¥${money(inputIncome)} (${period === 'monthly' ? '每月' : '全年'})`,
				},
				{
					label: 'Required pre-tax salary (Annual total)',
					labelZh: '对应全年度税前基本年薪',
					...cash(annualGross),
				},
				{
					label: 'Total annual tax owed',
					labelZh: '全年度预计需缴纳个税',
					value: `$${money(out.totalTax)} ($${money(out.totalTax / 12)}/mo)`,
					valueZh: `¥${money(out.totalTax)} (月均 ¥${money(out.totalTax / 12)})`,
				},
				{
					label: 'Base salary net pay (Monthly average)',
					labelZh: '月均基本工资税后到手',
					...cash(out.monthlySalaryNet),
				},
			];

			if (effectiveBonus > 0) {
				rows.push({
					label: 'Year-end bonus net pay',
					labelZh: '年终奖税后到手 (实发)',
					...cash(out.bonusTakeHome),
				});
				rows.push({
					label: 'Year-end bonus tax owed',
					labelZh: '年终奖应纳个税',
					value: `$${money(out.bonusTax)}${out.isCombinedActive ? ' (taxed with salary)' : ` (${(out.separateBonusRate * 100).toFixed(0)}% bracket, quick deduction $${out.separateBonusQuick})`}`,
					valueZh: `¥${money(out.bonusTax)}${out.isCombinedActive ? ' (并入综合)' : ` (${(out.separateBonusRate * 100).toFixed(0)}% 档, 速算扣除 ¥${out.separateBonusQuick})`}`,
				});
			}

			rows.push(
				{
					label: 'Five Insurances & Housing Fund (Annual)',
					labelZh: '全年五险一金个人承担扣除',
					value: `$${money(annualInsurance)} ($${money(monthlyInsurance)}/mo)`,
					valueZh: `¥${money(annualInsurance)} (月均 ¥${money(monthlyInsurance)})`,
				},
				{
					label: 'Special Additional Deductions (Annual)',
					labelZh: '全年专项附加扣除总额',
					value: `$${money(annualSpecialDeduction)} ($${money(monthlySpecialDeduction)}/mo)`,
					valueZh: `¥${money(annualSpecialDeduction)} (月均 ¥${money(monthlySpecialDeduction)})`,
				},
				{
					label: 'Effective overall tax rate',
					labelZh: '综合实际有效税率',
					value: `${percent(out.effectiveRate)}%`,
				},
				{
					label: 'Highest marginal tax rate',
					labelZh: '最高适用边际税率',
					value: `${out.marginalRate.toFixed(0)}%`,
				},
			);

			let table: FormTable | undefined;
			if (out.salaryCalcRows.length) {
				table = {
					columns: ['Tax Bracket', 'Rate', 'Taxable in Bracket ($)', 'Tax Owed ($)'],
					columnsZh: ['综合所得税率阶梯', '适用税率', '级内应纳税所得额 (¥)', '本级应纳税额 (¥)'],
					rows: out.salaryCalcRows,
				};
			} else if (out.usOrFlatRows.length) {
				table = {
					columns: ['Tax Bracket', 'Rate', 'Taxable in Bracket ($)', 'Tax Owed ($)'],
					columnsZh: ['税率阶梯', '适用税率', '级内应纳税所得额 (¥)', '本级应纳税额 (¥)'],
					rows: out.usOrFlatRows,
				};
			}

			const noteZh = `【税后倒推税前薪资结果】：若期望${period === 'monthly' ? '每月' : '全年'}税后实发到手 ${money(inputIncome)} 元，扣除每月五险一金 ${money(monthlyInsurance)} 元和专项附加扣除 ${money(monthlySpecialDeduction)} 元后，您需要达到税前月薪至少 ${money(annualGross / 12)} 元（折合税前年薪 ${money(annualGross)} 元${effectiveBonus > 0 ? `，年终奖 ${money(effectiveBonus)} 元` : ''}）。全年度需缴纳个税 ${money(out.totalTax)} 元，实际综合个税税率为 ${percent(out.effectiveRate)}%。`;
			const noteEn = `[Reverse Net-to-Gross Calculation]: To achieve a target net take-home pay of ${money(inputIncome)} (${period}), after insurance (${money(monthlyInsurance)}/mo) and deductions (${money(monthlySpecialDeduction)}/mo), you require a pre-tax salary of ${money(annualGross / 12)}/month (${money(annualGross)}/year${effectiveBonus > 0 ? ` + bonus ${money(effectiveBonus)}` : ''}). Total annual tax owed is ${money(out.totalTax)} (effective rate ${percent(out.effectiveRate)}%).`;

			return {
				rows,
				table,
				note: noteEn,
				noteZh,
			};
		}

		// Forward calculation (gross_to_net)
		if (regime === 'cn') {
			const rows: FormResultRow[] = [
				{ label: 'Net take-home income (Annual)', labelZh: '税后总收入 (全年度实发到手)', ...cash(out.totalNetTakeHome), emphasis: true },
				{ label: 'Base salary net pay (Monthly average)', labelZh: '基本工资税后到手 (月均)', ...cash(out.monthlySalaryNet) },
			];

			if (effectiveBonus > 0) {
				rows.push({ label: 'Year-end bonus net pay', labelZh: '年终奖税后到手 (实发)', ...cash(out.bonusTakeHome) });
			}

			rows.push(
				{ label: 'Total annual tax owed', labelZh: '全年度个人所得税总额', ...cash(out.totalTax) },
				{ label: 'Base salary tax owed (Annual)', labelZh: '基本工资应纳个税 (全年度)', ...cash(out.salaryTax) },
			);

			if (effectiveBonus > 0) {
				rows.push({
					label: 'Year-end bonus tax owed',
					labelZh: '年终奖应纳个税',
					value: `$${money(out.bonusTax)}${out.isCombinedActive ? ' (taxed with salary)' : ` (${(out.separateBonusRate * 100).toFixed(0)}% bracket, quick deduction $${out.separateBonusQuick})`}`,
					valueZh: `¥${money(out.bonusTax)}${out.isCombinedActive ? ' (并入综合)' : ` (${(out.separateBonusRate * 100).toFixed(0)}% 档, 速算扣除 ¥${out.separateBonusQuick})`}`,
				});
				let planEvaluation: string;
				let planEvaluationZh: string;
				if (out.bestScheme === 'separate') {
					planEvaluation = `taxed separately ($${money(out.taxDiff)} less than combining)`;
					planEvaluationZh = `单独计税更优 (比合并计税省税 ¥${money(out.taxDiff)})`;
				} else if (out.bestScheme === 'combined') {
					planEvaluation = `combined with salary ($${money(out.taxDiff)} less than taxing separately)`;
					planEvaluationZh = `并入综合所得更优 (比单独计税省税 ¥${money(out.taxDiff)})`;
				} else {
					planEvaluation = 'both schemes owe the same tax';
					planEvaluationZh = '两方案税额相同';
				}
				rows.push({
					label: 'Optimal bonus scheme',
					labelZh: '年终奖计税方案优选',
					value: planEvaluation,
					valueZh: planEvaluationZh,
				});
			}

			rows.push(
				{ label: 'Five Insurances & Housing Fund (Annual)', labelZh: '全年五险一金个人承担扣除', ...cash(annualInsurance) },
				{ label: 'Special Additional Deductions (Annual)', labelZh: '全年专项附加扣除总额', ...cash(annualSpecialDeduction) },
				{ label: 'Taxable income (Annual comprehensive)', labelZh: '年度综合所得应纳税所得额', ...cash(out.salaryTaxable) },
				{ label: 'Effective overall tax rate', labelZh: '综合实际有效税率', value: `${percent(out.effectiveRate)}%` },
				{ label: 'Highest marginal tax rate', labelZh: '最高适用边际税率', value: `${out.marginalRate.toFixed(0)}%` },
			);

			let table: FormTable | undefined;
			if (effectiveBonus > 0) {
				table = {
					columns: ['Tax Scheme', 'Salary Tax ($)', 'Bonus Tax ($)', 'Total Tax ($)', 'Take-Home Pay ($)', 'Recommendation'],
					columnsZh: ['年终奖计税方案', '工资薪金个税 (¥)', '年终奖个税 (¥)', '全年个税总额 (¥)', '最终税后到手 (¥)', '优选评估'],
					rows: [
						[
							'Taxed separately (one-off annual bonus relief)',
							money(out.salaryTax),
							money(out.separateBonusTax),
							money(out.separateTotalTax),
							money(out.totalGross - annualInsurance - out.separateTotalTax),
							out.bestScheme === 'separate' ? '★ recommended (lowest tax)' : out.bestScheme === 'equal' ? 'same tax' : 'higher tax',
						],
						[
							'Combined into this year’s comprehensive income',
							money(out.salaryTax),
							money(out.combinedBonusTax),
							money(out.combinedTotalTax),
							money(out.totalGross - annualInsurance - out.combinedTotalTax),
							out.bestScheme === 'combined' ? '★ recommended (lowest tax)' : out.bestScheme === 'equal' ? 'same tax' : 'higher tax',
						],
					],
					rowsZh: [
						[
							'单独计税 (全年一次性奖金优惠)',
							money(out.salaryTax),
							money(out.separateBonusTax),
							money(out.separateTotalTax),
							money(out.totalGross - annualInsurance - out.separateTotalTax),
							out.bestScheme === 'separate' ? '★ 推荐方案 (省税最高)' : out.bestScheme === 'equal' ? '税负相同' : '税负偏高',
						],
						[
							'并入当年综合所得合并计税',
							money(out.salaryTax),
							money(out.combinedBonusTax),
							money(out.combinedTotalTax),
							money(out.totalGross - annualInsurance - out.combinedTotalTax),
							out.bestScheme === 'combined' ? '★ 推荐方案 (省税最高)' : out.bestScheme === 'equal' ? '税负相同' : '税负偏高',
						],
					],
				};
			} else if (out.salaryCalcRows.length) {
				table = {
					columns: ['Tax Bracket', 'Rate', 'Taxable in Bracket ($)', 'Tax Owed ($)'],
					columnsZh: ['综合所得税率阶梯', '适用税率', '级内应纳税所得额 (¥)', '本级应纳税额 (¥)'],
					rows: out.salaryCalcRows,
				};
			}

			let noteEn = `On gross income of ${money(out.totalGross)} (salary ${money(annualGross)}${effectiveBonus > 0 ? ` + bonus ${money(effectiveBonus)}` : ''}), deductions total ${money(out.totalSalaryDeductions)} (standard 60,000 + insurance ${money(annualInsurance)} + special ${money(annualSpecialDeduction)}). Total tax is ${money(out.totalTax)} (effective rate ${percent(out.effectiveRate)}%), leaving ${money(out.totalNetTakeHome)} net take-home pay.`;
			let noteZh = `总税前收入 ${money(out.totalGross)}（基本年薪 ${money(annualGross)}${effectiveBonus > 0 ? ` + 年终奖 ${money(effectiveBonus)}` : ''}），扣除项合计 ${money(out.totalSalaryDeductions)}（起征点6万 + 五险一金 ${money(annualInsurance)} + 专项附加扣除 ${money(annualSpecialDeduction)}）。全年个税为 ${money(out.totalTax)}（综合实际税率 ${percent(out.effectiveRate)}%），税后综合到手 ${money(out.totalNetTakeHome)}（月均基本薪资 ${money(out.monthlySalaryNet)}${effectiveBonus > 0 ? ` + 年终奖实发 ${money(out.bonusTakeHome)}` : ''}）。`;

			if (effectiveBonus > 0) {
				if (out.bestScheme === 'separate') {
					noteZh += ` 【方案建议】：建议选择【单独计税】，相比并入综合所得可少缴个税 ¥${money(out.taxDiff)}。`;
					noteEn += ` Recommendation: tax the bonus separately — $${money(out.taxDiff)} less than combining it with salary.`;
				} else if (out.bestScheme === 'combined') {
					noteZh += ` 【方案建议】：由于基本工资未用尽免征额或专项扣除额度，建议选择【并入综合所得计税】，可少缴个税 ¥${money(out.taxDiff)}。`;
					noteEn += ` Recommendation: combine the bonus with salary — the standard allowance and special deductions are not fully used up, saving $${money(out.taxDiff)}.`;
				}
			}

			if (out.pitfallWarning) {
				noteZh += ` ⚠️【年终奖税收盲区预警】：您的年终奖处于多发少得税收盲区（¥${out.pitfallWarning.min} ~ ¥${out.pitfallWarning.max}）。如果将年终奖设为临界点 ¥${money(out.pitfallWarning.threshold)}，税额将从 ¥${money(out.pitfallWarning.currTax)} 降至 ¥${money(out.pitfallWarning.safeTax)}，税后实际到手反而增加 ¥${money(out.pitfallWarning.lost)}！建议与公司沟通避开此区间。`;
				noteEn += ` ⚠️ Note: Your year-end bonus falls into the known tax pitfall bracket (${money(out.pitfallWarning.min)} - ${money(out.pitfallWarning.max)}). Reducing the bonus to ${money(out.pitfallWarning.threshold)} would increase your actual take-home by ${money(out.pitfallWarning.lost)} due to the bracket jump!`;
			}

			return {
				rows,
				table,
				note: noteEn,
				noteZh,
			};
		}

		// US Federal (Single) & Flat Tax
		const monthlyNet = out.totalNetTakeHome / 12;
		const monthlyTax = out.totalTax / 12;

		return {
			rows: [
				{ label: 'Net take-home income (Annual)', labelZh: '税后净收入 (年度到手)', ...cash(out.totalNetTakeHome), emphasis: true },
				{ label: 'Net take-home income (Monthly average)', labelZh: '税后净收入 (月均到手)', ...cash(monthlyNet) },
				{ label: 'Total tax owed (Annual)', labelZh: '应缴个人所得税 (年度总税额)', ...cash(out.totalTax) },
				{ label: 'Tax owed (Monthly average)', labelZh: '应缴个人所得税 (月均)', ...cash(monthlyTax) },
				{ label: 'Effective tax rate', labelZh: '实际综合有效税率', value: `${percent(out.effectiveRate)}%` },
				{ label: 'Marginal top tax bracket', labelZh: '最高适用边际税率', value: `${out.marginalRate.toFixed(0)}%` },
				{ label: 'Taxable income', labelZh: '应纳税所得额', ...cash(out.salaryTaxable) },
			],
			table: out.usOrFlatRows.length
				? {
						columns: ['Tax Bracket', 'Rate', 'Taxable in Bracket ($)', 'Tax Owed ($)'],
						columnsZh: ['税率阶梯', '适用税率', '级内应纳税所得额 (¥)', '本级应纳税额 (¥)'],
						rows: out.usOrFlatRows,
					}
				: undefined,
			note: `On gross income of ${money(out.totalGross)}, total tax is ${money(out.totalTax)} (effective rate of ${percent(out.effectiveRate)}%), leaving ${money(out.totalNetTakeHome)} take-home.`,
			noteZh: `在税前收入 ${money(out.totalGross)} 情况下，全年度个人所得税为 ${money(out.totalTax)}（综合实际税率 ${percent(out.effectiveRate)}%），税后实际到手 ${money(out.totalNetTakeHome)}（月均 ${money(monthlyNet)}）。`,
		};
	},
};

// --- entries --------------------------------------------------------------------------------------
//
// Ordered by the life-stage of the question the visitor asks, highest-traffic
// group first: borrowing (a mortgage is the largest single loan most readers
// will ever arrange, and prepayment and amortization hang straight off it),
// then income (tax and take-home pay), then reading an installment rate
// critically, then growing money (compound interest and its siblings), then
// money over time and the everyday discount. The `redirect` entries stay beside
// the page they point at so the alias reads next to its target. /finance/, the
// search modal, the related-tools strip and the inlined search index all read
// this declaration order — the search modal has no relevance score, it
// substring-filters and keeps index position, so this list *is* the ranking.
//
// Income sits at rank 4–5 rather than below the loan cluster on purpose.
// ToolShell's related strip keeps the first 4 non-redirect tools of a category,
// so ranks 1–4 each link in from all 12 other finance pages while rank 5
// onwards link in from almost none — 13 in-links versus 4 for a 13-tool
// category. 个税 is the site's second-highest-demand finance tool and was
// already backlinked by the income-tax guide, so it belongs inside the strip.
// The cost is that the loan cluster is split: 借款核心 → 收入与税负 → 分期与车贷.
// That ordering deliberately serves both goals, and the top of the list still
// reads mortgage → prepayment → loan payment → tax, the four highest-demand
// finance pages.

// --- Rent vs Buy Calculator Algorithm -----------------------------------------------

const rentVsBuy: FormConfig = {
	intro: 'Compare net wealth accumulated after N years between buying a home (mortgage, home appreciation, debt payoff) vs renting (investing down payment & monthly savings in stocks/funds).',
	introZh: '对比 N 年后买房（房贷本息、房价增值、结清残值）与租房（首付及每月省下的钱用于理财定投）的最终净资产沉淀总额。',
	fields: [
		{ id: 'homePrice', label: 'Home Purchase Price ($/¥)', labelZh: '房屋购买总价 ($/¥)', type: 'number', def: '1000000', step: '10000', required: true },
		{ id: 'downPercent', label: 'Down Payment (%)', labelZh: '首付比例 (%)', type: 'number', def: '30', step: '1', min: '0', max: '100', required: true },
		{ id: 'loanRate', label: 'Mortgage Rate (%)', labelZh: '房贷年利率 (%)', type: 'number', def: '4.0', step: '0.1', min: '0', required: true },
		{ id: 'loanYears', label: 'Loan Term (Years)', labelZh: '房贷年限 (年)', type: 'number', def: '30', step: '1', min: '1', max: '50', required: true },
		{ id: 'homeAppreciation', label: 'Annual Home Appreciation (%)', labelZh: '预期房价年化涨幅 (%)', type: 'number', def: '2.5', step: '0.1', required: true },
		{ id: 'monthlyRent', label: 'Current Monthly Rent ($/¥)', labelZh: '当前月租金 ($/¥)', type: 'number', def: '2500', step: '100', required: true },
		{ id: 'rentInflation', label: 'Annual Rent Inflation (%)', labelZh: '预期租金年涨幅 (%)', type: 'number', def: '2.0', step: '0.1', required: true },
		{ id: 'investReturn', label: 'Investment Return Rate (%)', labelZh: '备选理财/股市年化收益率 (%)', type: 'number', def: '6.0', step: '0.1', required: true },
		{ id: 'horizonYears', label: 'Comparison Horizon (Years)', labelZh: '对比分析年限 (年)', type: 'number', def: '15', step: '1', min: '1', max: '50', required: true },
	],
	compute: (v) => {
		const price = v.num('homePrice');
		const downPct = v.num('downPercent') / 100;
		const rate = v.num('loanRate');
		const loanYears = Math.round(v.num('loanYears'));
		const homeApprec = v.num('homeAppreciation') / 100;
		const initRent = v.num('monthlyRent');
		const rentInfl = v.num('rentInflation') / 100;
		const rInvest = v.num('investReturn') / 100;
		const horizon = Math.round(v.num('horizonYears'));

		if (!Number.isFinite(price) || price <= 0 || horizon <= 0 || loanYears <= 0) {
			return { rows: [{ label: 'Error', labelZh: '错误', value: '— (invalid price or parameters)', valueZh: '— (请输入有效房屋总价与对比参数)' }] };
		}

		const downPayment = price * downPct;
		const loanAmount = price - downPayment;
		const totalMonths = loanYears * 12;
		const monthlyRate = rate / 100 / 12;
		const origPayment = monthlyPayment(loanAmount, rate, totalMonths);

		const monthsEvaluated = Math.min(horizon * 12, totalMonths);
		let remainingLoan = loanAmount;
		if (monthlyRate > 0) {
			const powN = (1 + monthlyRate) ** monthsEvaluated;
			remainingLoan = Math.max(0, loanAmount * powN - origPayment * ((powN - 1) / monthlyRate));
		} else {
			remainingLoan = Math.max(0, loanAmount - (loanAmount / totalMonths) * monthsEvaluated);
		}

		const homeValueAtHorizon = price * Math.pow(1 + homeApprec, horizon);
		const buyNetWealth = homeValueAtHorizon - remainingLoan;

		let rentInvestPool = downPayment;
		const monthlyInvestRate = rInvest / 12;

		for (let m = 1; m <= horizon * 12; m++) {
			const yearIndex = Math.floor((m - 1) / 12);
			const currentMonthlyRent = initRent * Math.pow(1 + rentInfl, yearIndex);
			const monthSavings = origPayment - currentMonthlyRent;
			rentInvestPool = rentInvestPool * (1 + monthlyInvestRate) + monthSavings;
		}

		const rentNetWealth = rentInvestPool;
		const diff = buyNetWealth - rentNetWealth;

		const winner = diff >= 0 ? 'Buying a Home' : 'Renting & Investing';
		const winnerZh = diff >= 0 ? '买房方案胜出' : '租房+理财方案胜出';

		return {
			rows: [
				{
					label: 'Financially Advantageous Option',
					labelZh: '更具优势的资产方案',
					value: winner,
					valueZh: winnerZh,
					emphasis: true,
				},
				{
					label: `Net Asset Advantage after ${horizon} Years`,
					labelZh: `${horizon} 年后胜出方净资产领先优势`,
					...cash(Math.abs(diff)),
					emphasis: true,
				},
				{
					label: `Buying Path: Net Home Equity after ${horizon} Years`,
					labelZh: `买房路径：${horizon} 年后房屋扣除残余房贷净值`,
					...cash(buyNetWealth),
				},
				{
					label: `Renting Path: Investment Portfolio after ${horizon} Years`,
					labelZh: `租房路径：${horizon} 年后首付与每月差额理财总资产`,
					...cash(rentNetWealth),
				},
				{
					label: 'Projected Home Value',
					labelZh: `${horizon} 年后预估房屋总价值`,
					...cash(homeValueAtHorizon),
				},
				{
					label: 'Remaining Mortgage Balance',
					labelZh: `${horizon} 年后剩余未还房贷本金`,
					...cash(remainingLoan),
				},
				{
					label: 'Initial Down Payment Amount',
					labelZh: '买房初始首付投入金额',
					...cash(downPayment),
				},
			],
			note: diff >= 0
				? `After ${horizon} years, buying is projected to leave you with $${formatNumber(diff)} more net wealth than renting.`
				: `After ${horizon} years, renting and investing the savings is projected to leave you with $${formatNumber(Math.abs(diff))} more net wealth than buying.`,
			noteZh: diff >= 0
				? `经过 ${horizon} 年测算，买房沉淀的净资产预计比租房+理财高出 ¥${formatNumber(diff)}。`
				: `经过 ${horizon} 年测算，租房并将资金投向理财预计比买房沉淀的净资产高出 ¥${formatNumber(Math.abs(diff))}。`,
		};
	},
};

export const FINANCE_TOOLS: ToolEntry[] = [
	{
		slug: 'mortgage',
		category: 'finance',
		name: 'Mortgage Loan Calculator (Equal P&I vs Equal Principal)',
		nameZh: '房贷计算器 (等额本息 vs 等额本金对比)',
		description: 'Compare level-payment (equal principal & interest) against equal-principal repayment: monthly payment, interest saved, and commercial, provident fund or combined mortgages.',
		descriptionZh: '等额本息与等额本金同屏对比，支持商业贷款、公积金贷款及组合贷款测算。',
		kind: 'form',
		config: mortgage,
	},
	{
		slug: 'mortgage-prepayment',
		category: 'finance',
		name: 'Mortgage Prepayment Calculator',
		nameZh: '房贷提前还款计算器',
		description: 'Compare shortening your mortgage term vs reducing monthly payment, and calculate total interest saved.',
		descriptionZh: '对比缩短还贷年限与减少月供两种提前还贷策略，精准计算节省利息总额。',
		kind: 'form',
		config: mortgagePrepayment,
	},

	{
		slug: 'rent-vs-buy',
		category: 'finance',
		name: 'Rent vs Buy Home Calculator',
		nameZh: '买房 vs 租房收益对比计算器',
		description: 'Compare accumulated net wealth after N years between buying a home vs renting and investing the savings.',
		descriptionZh: '综合测算 N 年后买房（房贷本息、房屋增值、剩余贷款残值）与租房（首付与每月差额定投理财）的最终净资产沉淀对比。',
		kind: 'form',
		config: rentVsBuy,
	},
	{
		slug: 'loan-payment',
		category: 'finance',
		name: 'Loan Payment Calculator',
		nameZh: '贷款月供与还款计划计算器',
		description: 'Monthly payment, total interest and a yearly amortization schedule for any fixed-rate loan.',
		descriptionZh: '等额本息贷款月供测算、全周期总利息统计与逐年还款摊还明细计划表。',
		kind: 'form',
		config: loanPayment,
	},
	{
		slug: 'tax',
		category: 'finance',
		name: 'Income Tax & Take-Home Salary Calculator',
		nameZh: '个人所得税计算器 (五险一金/专项扣除/年终奖)',
		description: 'Calculate net income, tax brackets, Five Insurances & Housing Fund, 7 Special Deductions, and Year-End Bonus tax optimization (Separate vs Combined).',
		descriptionZh: '精准测算个税、五险一金、7项专项附加扣除与年终奖单独计税/合并计税智能优选。',
		kind: 'form',
		config: tax,
	},
	{
		slug: 'salary',
		category: 'finance',
		name: 'Salary & Hourly Wage Converter',
		nameZh: '薪资与时薪日薪换算器',
		description: 'Convert annual salary into hourly, weekly, biweekly, monthly and daily compensation.',
		descriptionZh: '年薪、月薪、周薪、日薪与时薪之间快速多维互转换算。',
		kind: 'form',
		config: salary,
	},
	{
		slug: 'cny-uppercase',
		category: 'finance',
		name: 'Chinese Uppercase Amount',
		nameZh: '人民币大写金额转换器',
		description: 'Convert a numeric amount into the formal Chinese uppercase form used on invoices and bank slips.',
		descriptionZh: '把数字金额转换为发票、银行凭证使用的规范人民币大写金额。',
		kind: 'text',
		config: {
			// No prefilled sample on purpose: the live transform would render the
			// Chinese uppercase result into the output box on first paint, which
			// the English-view i18n scan reads as a leak. The tool's output is
			// Chinese by definition — it should only appear once the visitor
			// enters an amount (same exemption shape as converters/weight's
			// 市斤/两, which live in labels rather than control values).
			placeholder: 'e.g. 1234567.89',
			placeholderZh: '例如 1234567.89',
			live: true,
			transforms: [
				{
					id: 'upper',
					label: 'Convert → uppercase amount',
					labelZh: '转换为人民币大写',
					run: (t) => {
						if (!t.trim()) return { output: '', error: 'Enter an amount first.', errorZh: '请先输入金额。' };
						const r = rmbUppercase(t);
						return r
							? { output: r }
							: {
									output: '',
									error: 'Enter a valid amount: digits only, at most 2 decimals, below 10^16.',
									errorZh: '请输入有效金额：纯数字、最多两位小数、小于 10^16。',
								};
					},
				},
			],
		} satisfies TextConfig,
	},
	{
		slug: 'irr-calculator',
		category: 'finance',
		name: 'True APR & Installment IRR Calculator',
		nameZh: '分期真实年化利率 / 实际利率 IRR 计算器',
		description: 'Convert advertised monthly installment fees or credit card flat rates to real APR and IRR.',
		descriptionZh: '基于牛顿迭代法求解真实年化利率 IRR 与 APR，揭秘信用卡分期等名义手续费陷阱。',
		kind: 'form',
		config: irrCalculator,
	},
	{
		slug: 'auto-loan',
		category: 'finance',
		name: 'Auto Loan & Out-of-Pocket Calculator',
		nameZh: '汽车贷款与购车落地成本计算器',
		description: 'Monthly car loan payments, interest, down payment, purchase tax, insurance, and total out-of-pocket cost.',
		descriptionZh: '测算汽车贷款月供利息，综合购置税、车险、上牌费等全套提车落地总成本。',
		kind: 'form',
		config: autoLoan,
	},
	{
		slug: 'compound-interest',
		category: 'finance',
		name: 'Compound Interest & Investment Return Calculator',
		nameZh: '复利投资与定投收益计算器',
		description: 'Compound growth with configurable compounding frequency, regular monthly contributions, and year-by-year schedule.',
		descriptionZh: '支持自定义复利计息频率与每月定期定投，按年推演资产长期复利增值轨迹。',
		kind: 'form',
		config: compoundInterest,
	},
	{
		slug: 'simple-interest',
		category: 'finance',
		name: 'Simple Interest Calculator',
		nameZh: '单利计算器',
		description: 'Compute simple interest I = P × r × t with total amount and per-period interest.',
		descriptionZh: '根据 I = P × r × t 计算单利利息、到期本息总额与逐期明细。',
		kind: 'form',
		config: simpleInterest,
	},
	{
		slug: 'roi',
		category: 'finance',
		name: 'ROI Calculator',
		nameZh: '投资回报率 (ROI) 计算器',
		description: 'Return on investment from cost and revenue, with net profit and return multiple.',
		descriptionZh: '根据投入成本与回收金额测算投资回报率 (ROI)、净利润与回报倍数。',
		kind: 'form',
		config: roi,
	},
	{
		slug: 'savings-goal',
		category: 'finance',
		name: 'Savings Goal Calculator',
		nameZh: '目标储蓄规划计算器',
		description: 'Find the required monthly savings to achieve your financial goal by a target date.',
		descriptionZh: '设定财务储蓄目标金额与到期年限，逆向测算每月所需定投金额与复合收益贡献。',
		kind: 'form',
		config: savingsGoal,
	},
	{
		slug: 'fire-calculator',
		category: 'finance',
		name: 'FIRE Calculator (Financial Independence)',
		nameZh: 'FIRE 财务自由与提前退休计算器',
		description: 'Determine your target nest egg, projected retirement age, and safe withdrawal strategy using the 4% rule.',
		descriptionZh: '基于 4% 安全提款法则测算财务自由目标资产、提前退休年龄与提款策略。',
		kind: 'form',
		config: fireCalculator,
	},
	{
		slug: 'inflation',
		category: 'finance',
		name: 'Inflation & Purchasing Power Calculator',
		nameZh: '通货膨胀与购买力缩水计算器',
		description: 'Calculate future purchasing power erosion and future equivalent cost based on annual inflation.',
		descriptionZh: '测算通货膨胀对资金购买力的长期侵蚀影响，展示未来等价物价与贬值幅度。',
		kind: 'form',
		config: inflation,
	},
	{
		slug: 'discount',
		category: 'finance',
		name: 'Discount & Sale Calculator',
		nameZh: '折扣降价与购物优惠计算器',
		description: 'Final price and total savings from a percentage discount, for single or bulk quantities.',
		descriptionZh: '根据打折折扣百分比计算优惠后价格与节省金额，支持单件或批量核算。',
		kind: 'form',
		config: discount,
	},
	{
		slug: 'retirement-drawdown',
		category: 'finance',
		name: 'Retirement Drawdown Calculator',
		nameZh: '退休资产提取与耗尽模拟计算器',
		description: 'Simulate how long your nest egg lasts with monthly withdrawals, fixed or growing with inflation.',
		descriptionZh: '按月提取模拟退休资产的支撑年限，支持固定金额与随通胀逐年上调两种提取策略。',
		kind: 'form',
		config: retirementDrawdown,
	},
	{
		slug: 'refinance',
		category: 'finance',
		name: 'Mortgage Refinance Calculator',
		nameZh: '房贷再融资 (转按揭) 对比计算器',
		description: 'Compare refinancing against your current mortgage: monthly savings, break-even point and lifetime interest.',
		descriptionZh: '对比再融资方案与现有房贷：月供节省额、手续费回本月数与全周期利息变化。',
		kind: 'form',
		config: refinance,
	},
	{
		slug: 'rental-yield',
		category: 'finance',
		name: 'Rental Yield & Cap Rate Calculator',
		nameZh: '租金收益率与租售比计算器',
		description: 'Gross yield, net operating income (NOI), cap rate, price-to-rent ratio and vacancy sensitivity for a rental property.',
		descriptionZh: '测算出租房产的毛租金收益率、净营业收入 NOI、资本化率、租售比与空置率敏感性分析。',
		kind: 'form',
		config: rentalYield,
	},
	{
		slug: 'credit-card-minimum',
		category: 'finance',
		name: 'Credit Card Minimum Payment Calculator',
		nameZh: '信用卡最低还款代价计算器',
		description: 'How long minimum-only payments take to clear a balance, total interest paid, versus a fixed payment plan.',
		descriptionZh: '揭示只还信用卡最低还款额的清偿时长与利息代价，并与固定月还款方案对比省息。',
		kind: 'form',
		config: creditCardMinimum,
	},
	{
		slug: 'annuity-calculator',
		category: 'finance',
		name: 'Annuity Present & Future Value Calculator',
		nameZh: '年金现值与终值计算器',
		description: 'Present and future value of ordinary annuities and annuities due, monthly or yearly — for pension and insurance payout evaluation.',
		descriptionZh: '普通年金与先付年金的现值/终值测算，支持月付年付，评估养老金与年金保险给付价值。',
		kind: 'form',
		config: annuityCalculator,
	},
	{
		slug: 'net-worth',
		category: 'finance',
		name: 'Net Worth Calculator',
		nameZh: '净资产计算器',
		description: 'List assets and liabilities ("label, amount" per line) and get total assets, total liabilities, net worth and the debt-to-asset ratio.',
		descriptionZh: '逐行列出资产与负债（"名称, 金额"），得出总资产、总负债、净资产与资产负债率。',
		kind: 'form',
		config: {
			intro: 'One line per item: "label, amount". Commas, spaces or semicolons all separate.',
			introZh: '每行一项："名称, 金额"。逗号、空格、分号均可作分隔。',
			fields: [
				{
					id: 'assets',
					label: 'Assets (label, amount per line)',
					labelZh: '资产（每行 名称, 金额）',
					type: 'textarea',
					def: 'Cash, 20000\nSavings, 80000\nIndex funds, 150000\nCar, 25000',
				},
				{
					id: 'liabilities',
					label: 'Liabilities (label, amount per line)',
					labelZh: '负债（每行 名称, 金额）',
					type: 'textarea',
					def: 'Mortgage, 210000\nCar loan, 12000',
				},
			],
			compute: (v) => {
				const row = (label: string, labelZh: string, value: string, valueZh = value) => ({ label, labelZh, value, valueZh });
				const parse = (text: string): { items: [string, number][]; bad: string[] } => {
					const items: [string, number][] = [];
					const bad: string[] = [];
					for (const line of text.split('\n')) {
						const t = line.trim();
						if (!t) continue;
						const parts = t.split(/[,;]\s*|\s{2,}/);
						const label = parts.slice(0, -1).join(',').trim() || t;
						const amount = Number((parts.at(-1) ?? '').replace(/[^\d.-]/g, ''));
						if (Number.isFinite(amount)) items.push([label, amount]);
						else bad.push(t);
					}
					return { items, bad };
				};
				const a = parse(v.str('assets'));
				const l = parse(v.str('liabilities'));
				const totalAssets = a.items.reduce((s, [, x]) => s + x, 0);
				const totalLiab = l.items.reduce((s, [, x]) => s + x, 0);
				const net = totalAssets - totalLiab;
				const ratio = totalAssets > 0 ? (totalLiab / totalAssets) * 100 : 0;
				const rows: FormResultRow[] = [
					{ label: 'Net worth', labelZh: '净资产', ...cash(net), emphasis: true },
					{ label: 'Total assets', labelZh: '总资产', ...cash(totalAssets) },
					{ label: 'Total liabilities', labelZh: '总负债', ...cash(totalLiab) },
					row('Debt-to-asset ratio', '资产负债率', `${percent(ratio)}%`),
				];
				if (a.bad.length || l.bad.length)
					rows.push(row('Ignored unparseable lines', '已忽略的无效行', [...a.bad, ...l.bad].slice(0, 3).join('  ')));
				return { rows };
			},
		},
	},
	{
		slug: 'lump-sum-vs-dca',
		category: 'finance',
		name: 'Lump Sum vs Dollar-Cost Averaging',
		nameZh: '一次性投资 vs 定投对比',
		description: 'Compare investing everything today against spreading the same total in monthly installments — future values, contributions and the difference, year by year.',
		descriptionZh: '对比今天一次性全额投入与按月分批定投同一笔总额：终值、投入与差额，逐年展开。',
		kind: 'form',
		config: {
			intro: 'The classic question: invest the lump sum now, or average in monthly? Same total contribution either way — only the timing differs.',
			introZh: '经典问题：一次性投入，还是按月分批？两种方式总投入相同，差别只在入场时机。',
			fields: [
				{ id: 'amount', label: 'Total amount', labelZh: '总金额', suffix: '($)', suffixZh: '(¥)', type: 'number', def: '12000', step: 'any', required: true },
				{ id: 'years', label: 'Investment horizon', labelZh: '投资年限', suffix: '(years)', suffixZh: '(年)', type: 'number', def: '5', step: 'any', required: true },
				{ id: 'rate', label: 'Expected annual return', labelZh: '预期年化收益率', suffix: '(%)', type: 'number', def: '7', step: 'any', required: true },
				{
					id: 'frequency',
					label: 'DCA frequency',
					labelZh: '定投频率',
					type: 'select',
					def: 'monthly',
					options: [
						{ value: 'monthly', label: 'Monthly' },
						{ value: 'quarterly', label: 'Quarterly' },
					],
				},
			],
			compute: (v) => {
				const total = v.num('amount');
				const years = v.num('years');
				const rate = v.num('rate') / 100;
				const perYear = v.str('frequency') === 'quarterly' ? 4 : 12;
				// years is capped at 100: the DCA loop is O(steps) and a
				// pathologically large horizon would freeze the tab (and the
				// i18n sweep, which feeds every field 1e9).
				if (!(total > 0) || !(years > 0) || years > 100 || !Number.isFinite(rate))
					return {
						rows: [
							{ label: 'Result', labelZh: '结果', value: '— (amount > 0, years 1-100)', valueZh: '—（金额需大于 0，年限 1–100）' },
						],
					};
				const steps = Math.round(years * perYear);
				const per = total / steps;
				const i = rate / perYear;
				// Lump sum: everything compounds from day 0.
				const lumpFV = total * (1 + rate) ** years;
				// DCA: each installment compounds for its remaining time (annuity FV).
				let dcaFV = 0;
				for (let k = 1; k <= steps; k++) dcaFV += per * (1 + i) ** k;
				const diff = lumpFV - dcaFV;
				if (!Number.isFinite(lumpFV) || !Number.isFinite(dcaFV))
					return {
						rows: [
							{ label: 'Result', labelZh: '结果', value: '— (the rate overflows this horizon)', valueZh: '—（该收益率在此年限下溢出）' },
						],
					};
				const rows: FormResultRow[] = [
					{ label: 'Lump sum FV', labelZh: '一次性投入终值', ...cash(lumpFV), emphasis: true },
					{ label: 'DCA FV', labelZh: '定投终值', ...cash(dcaFV) },
					{ label: 'Advantage of lump sum', labelZh: '一次性投入领先', ...cash(diff) },
					row2(
						'Verdict',
						'结论',
						diff > 0 ? `Lump sum wins by ${percent((diff / dcaFV) * 100)}%` : `DCA wins by ${percent((-diff / lumpFV) * 100)}%`,
						diff > 0 ? `一次性投入胜出 ${percent((diff / dcaFV) * 100)}%` : `定投胜出 ${percent((-diff / lumpFV) * 100)}%`,
					),
				];
				const table: FormTable = {
					columns: ['Year', 'Lump sum FV ($)', 'DCA FV ($)', 'Contributed ($)'],
					columnsZh: ['年份', '一次性终值 (¥)', '定投终值 (¥)', '已投入 (¥)'],
					rows: [],
				};
				for (let y = 1; y <= Math.min(30, Math.ceil(years)); y++) {
					const lumpY = total * (1 + rate) ** y;
					const end = Math.min(steps, Math.round(y * perYear));
					let dcaY = 0;
					for (let k = 1; k <= end; k++) dcaY += per * (1 + i) ** k;
					table.rows.push([String(y), money(lumpY), money(dcaY), money(per * end)]);
				}
				rows.push({ label: 'Note', labelZh: '说明', value: `Historically lump sum beats DCA about 2 out of 3 times (markets rise more often than they fall); DCA wins in falling markets and buys peace of mind.`, valueZh: `历史上一次性投入约三分之二的概率跑赢定投（市场上涨多于下跌）；下跌市中定投占优，且买的是心安。` });
				return { rows, table };
			},
		},
	},
	{
		slug: 'real-return',
		category: 'finance',
		name: 'Real Return Calculator (Inflation-Adjusted)',
		nameZh: '真实收益率计算器（扣除通胀）',
		description: 'Strip inflation out of a nominal return: the exact Fisher real rate, plus what an investment actually buys after N years.',
		descriptionZh: '把通胀从名义收益中剥离：费雪方程精确实际利率，并算出投资 N 年后的真实购买力。',
		kind: 'form',
		config: {
			intro: 'A 5% return with 3% inflation is not 2% — it is 1.94%. The Fisher equation compounds the ratio, not the difference.',
			introZh: '5% 收益配 3% 通胀不是 2%——而是 1.94%。费雪方程算的是比值之差，不是简单相减。',
			fields: [
				{ id: 'nominal', label: 'Nominal annual return', labelZh: '名义年化收益率', suffix: '(%)', type: 'number', def: '5', step: 'any', required: true },
				{ id: 'inflation', label: 'Annual inflation', labelZh: '年均通胀率', suffix: '(%)', type: 'number', def: '3', step: 'any', required: true },
				{ id: 'years', label: 'Years', labelZh: '年限', suffix: '(years)', suffixZh: '(年)', type: 'number', def: '10', step: 'any' },
				{ id: 'amount', label: 'Amount invested', labelZh: '投资金额', suffix: '($)', suffixZh: '(¥)', type: 'number', def: '10000', step: 'any' },
			],
			compute: (v) => {
				const n = v.num('nominal') / 100;
				const inf = v.num('inflation') / 100;
				const years = Math.max(0, v.num('years') || 0);
				const amount = v.num('amount');
				if (inf <= -1 || !Number.isFinite(n) || !(amount > 0))
					return { rows: [{ label: 'Result', labelZh: '结果', value: '— (inflation must be > −100%)', valueZh: '—（通胀率需大于 −100%）' }] };
				const real = (1 + n) / (1 + inf) - 1;
				const nominalFV = amount * (1 + n) ** years;
				const realFV = amount * ((1 + n) / (1 + inf)) ** years;
				const rows: FormResultRow[] = [
					row2('Real annual return', '实际年化收益率', `${percent(real * 100)}%`, `${percent(real * 100)}%`),
					{ label: 'Naive subtraction', labelZh: '简单相减', value: `${percent((n - inf) * 100)}%`, valueZh: `${percent((n - inf) * 100)}%` },
					{ label: 'Nominal value after N years', labelZh: `${years} 年后名义价值`, ...cash(nominalFV) },
					{ label: 'Real value (today\u2019s money)', labelZh: '真实价值（今日购买力）', ...cash(realFV) },
					row2('Purchasing power kept', '购买力留存', `${percent((realFV / amount) * 100)}%`, `${percent((realFV / amount) * 100)}%`),
				];
				return { rows };
			},
		},
	},
];

