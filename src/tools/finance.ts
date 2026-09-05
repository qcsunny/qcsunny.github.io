// Registry entries for /finance/* — all form tools, several with result
// tables (compound interest year by year, loan amortization, mortgage prepayment, etc.).

import type { FormConfig, FormResultRow, FormTable, ToolEntry } from './registry';
import { formatNumber } from '../scripts/calculator/engine';

const money = (v: number): string => formatNumber(Math.round(v * 100) / 100);

// Percentages and multiples read as prose here, not as calculator output.
// formatNumber keeps 12 significant digits (right for the calculator engine,
// which is shared), so a raw ratio prints as "利息节省 14.4415580034%".
const percent = (v: number): string => formatNumber(Math.round(v * 100) / 100);

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

// --- compound interest (incorporating investment return) ------------------------

const compoundInterest: FormConfig = {
	intro: 'Compounded growth with an optional monthly contribution and year-by-year schedule.',
	fields: [
		{ id: 'p', label: 'Principal / Starting balance', labelZh: '初始投资本金', suffix: '($ / ¥)', type: 'number', def: '10000', step: 'any', min: '0', required: true },
		{ id: 'r', label: 'Annual interest rate / return', labelZh: '预期年化收益率 / 利率', suffix: '(%)', type: 'number', def: '6', step: 'any', required: true },
		{ id: 't', label: 'Investment horizon', labelZh: '投资年限', suffix: '(years / 年)', type: 'number', def: '10', step: 'any', min: '0', required: true },
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
			suffix: '($ / ¥)',
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
		if (!(t > 0)) return { rows: [{ label: 'Final amount', labelZh: '最终金额', value: '— (years must be > 0)' }] };
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
				{ label: 'Final portfolio value', labelZh: '最终资产总值', value: money(final), emphasis: true },
				{ label: 'Total invested (principal + contributions)', labelZh: '累计投入总本金', value: money(invested) },
				{ label: 'Total interest / profit earned', labelZh: '累计利息与投资收益', value: money(growth) },
				{ label: 'Total return on investment (ROI)', labelZh: '总投资回报率 (ROI)', value: `${percent(returnPct)}%` },
				{ label: 'Asset multiple (Final ÷ Invested)', labelZh: '资产增值倍数', value: `${percent(multiple)}×` },
			],
			table: {
				columns: ['Year', 'Total Invested', 'Portfolio Value', 'Interest Earned'],
				columnsZh: ['年份', '累计投入本金', '资产总值', '累计利息收益'],
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
	fields: [
		{ id: 'loan', label: 'Original loan amount', labelZh: '原贷款本金', suffix: '($ / ¥)', type: 'number', def: '1000000', step: 'any', min: '0', required: true },
		{ id: 'rate', label: 'Annual interest rate', labelZh: '贷款年化利率', suffix: '(%)', type: 'number', def: '3.8', step: 'any', min: '0', required: true },
		{ id: 'years', label: 'Original loan term', labelZh: '原贷款期限', suffix: '(years / 年)', type: 'number', def: '30', step: '1', min: '1', required: true },
		{ id: 'paidMonths', label: 'Months already paid', labelZh: '已正常还款月数', suffix: '(months / 个月)', type: 'number', def: '36', step: '1', min: '0', required: true },
		{ id: 'prepay', label: 'Lump-sum prepayment amount', labelZh: '本次提前还贷金额', suffix: '($ / ¥)', type: 'number', def: '200000', step: 'any', min: '0', required: true },
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
			return { rows: [{ label: 'Result', labelZh: '计算结果', value: '— (loan amount and term must be > 0)' }] };
		}
		const i = rate / 100 / 12;
		const origPayment = monthlyPayment(loan, rate, totalMonths);

		// calculate balance after paidMonths
		let balance = loan;
		let interestPaidSoFar = 0;
		for (let m = 0; m < paidMonths; m++) {
			const int = balance * i;
			const pr = Math.min(origPayment - int, balance);
			balance -= pr;
			interestPaidSoFar += int;
		}
		const balanceBefore = balance;
		const prepayActual = Math.min(prepay, balanceBefore);
		const balanceAfter = Math.max(balanceBefore - prepayActual, 0);

		const remainingMonthsOrig = totalMonths - paidMonths;
		const origRemainingTotalPay = origPayment * remainingMonthsOrig;
		const origRemainingInterest = Math.max(origRemainingTotalPay - balanceBefore, 0);

		if (balanceAfter <= 0) {
			return {
				rows: [
					{ label: 'Status', labelZh: '还贷状态', value: 'Loan fully paid off! / 贷款已全额结清！', emphasis: true },
					{ label: 'Remaining balance before prepay', labelZh: '还款前未还本金', value: money(balanceBefore) },
					{ label: 'Actual prepayment used', labelZh: '实际用于冲还本金', value: money(prepayActual) },
					{ label: 'Total interest saved', labelZh: '累计节省利息支出', value: money(origRemainingInterest) },
					{ label: 'Months saved', labelZh: '提前结清期数', value: `${remainingMonthsOrig} months (${(remainingMonthsOrig / 12).toFixed(1)} years)` },
					{ label: 'Interest already paid', labelZh: '已还利息累计', value: money(interestPaidSoFar) },
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
					{ label: 'Total interest saved', labelZh: '累计节省利息支出', value: money(interestSaved), emphasis: true },
					{ label: 'Loan term shortened by', labelZh: '缩短还款期限', value: `${monthsSaved} months / 月 (~${yearsSaved} 年)` },
					{ label: 'New remaining loan term', labelZh: '调整后剩余还款期限', value: `${newMonths} months / 月 (~${(newMonths / 12).toFixed(1)} 年)` },
					{ label: 'Monthly payment (stays same)', labelZh: '每月月供 (基本保持不变)', value: money(origPayment) },
					{ label: 'Remaining balance before prepay', labelZh: '提前还款前未还本金', value: money(balanceBefore) },
					{ label: 'Remaining balance after prepay', labelZh: '提前还款后剩余本金', value: money(balanceAfter) },
					{ label: 'Interest already paid', labelZh: '已正常支付利息', value: money(interestPaidSoFar) },
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
					{ label: 'New monthly payment', labelZh: '调整后每月新月供', value: money(newPayment), emphasis: true },
					{ label: 'Monthly payment reduction', labelZh: '每月月供减轻', value: `-${money(monthlyReduction)} / month` },
					{ label: 'Total interest saved', labelZh: '累计节省利息支出', value: money(interestSaved) },
					{ label: 'Original monthly payment', labelZh: '原每月月供', value: money(origPayment) },
					{ label: 'Remaining balance before prepay', labelZh: '提前还款前未还本金', value: money(balanceBefore) },
					{ label: 'Remaining balance after prepay', labelZh: '提前还款后剩余本金', value: money(balanceAfter) },
					{ label: 'Remaining term (unchanged)', labelZh: '剩余期限 (保持不变)', value: `${remainingMonthsOrig} months / 月 (${(remainingMonthsOrig / 12).toFixed(1)} 年)` },
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
	fields: [
		{ id: 'amount', label: 'Current amount / Present value', labelZh: '当前金额 / 资产现值', suffix: '($ / ¥)', type: 'number', def: '100000', step: 'any', min: '0', required: true },
		{ id: 'rate', label: 'Average annual inflation rate', labelZh: '年均通货膨胀率', suffix: '(%)', type: 'number', def: '3', step: 'any', required: true },
		{ id: 'years', label: 'Time horizon', labelZh: '时间跨度', suffix: '(years / 年)', type: 'number', def: '20', step: 'any', min: '0', required: true },
	],
	compute: (v) => {
		const amount = v.num('amount');
		const rate = v.num('rate');
		const years = v.num('years');
		if (!(amount > 0) || !(years > 0)) {
			return { rows: [{ label: 'Result', labelZh: '计算结果', value: '— (amount and years must be > 0)' }] };
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
				{ label: 'Future equivalent cost', labelZh: '未来购买等价商品所需金额', value: money(futureCost), emphasis: true },
				{ label: 'Future purchasing power of current cash', labelZh: '当前现金在未来的实际购买力', value: money(futurePower) },
				{ label: 'Total purchasing power loss', labelZh: '实际购买力缩水比例', value: `${percent(lossPct)}%` },
				{ label: 'Price level multiplier', labelZh: '物价上涨倍数', value: `${percent(futureCost / amount)}×` },
			],
			table: {
				columns: ['Years Ahead', 'Equivalent Cost', 'Real Purchasing Power', 'Loss (%)'],
				columnsZh: ['年数', '等价商品所需金额', '现金实际购买力', '购买力缩水率'],
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
	fields: [
		{ id: 'target', label: 'Target savings goal', labelZh: '目标储蓄规划总额', suffix: '($ / ¥)', type: 'number', def: '500000', step: 'any', min: '0', required: true },
		{ id: 'current', label: 'Current initial savings', labelZh: '当前已有初始存款', suffix: '($ / ¥)', type: 'number', def: '50000', step: 'any', min: '0', required: true },
		{ id: 'years', label: 'Time to reach goal', labelZh: '计划储备年限', suffix: '(years / 年)', type: 'number', def: '5', step: 'any', min: '0.1', required: true },
		{ id: 'rate', label: 'Expected annual return rate', labelZh: '预期年化投资收益率', suffix: '(%)', type: 'number', def: '5', step: 'any', required: true },
	],
	compute: (v) => {
		const target = v.num('target');
		const current = v.num('current');
		const years = v.num('years');
		const rate = v.num('rate') / 100;
		const months = Math.round(years * 12);
		if (!(target > 0) || !(months > 0)) {
			return { rows: [{ label: 'Result', labelZh: '计算结果', value: '— (target and years must be > 0)' }] };
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
				`${Math.min(100, Math.round((fvAtEm / target) * 100))}%`,
			]);
		}

		return {
			rows: [
				{ label: 'Required monthly savings', labelZh: '每月需定投/储蓄金额', value: money(pmt), emphasis: true },
				{ label: 'Total self-funded contributions', labelZh: '个人累计投入本金', value: money(totalSelfFunded) },
				{ label: 'Gains / interest earned', labelZh: '复合收益 / 利息贡献', value: money(interestEarned) },
				{ label: 'Gains share of goal', labelZh: '收益贡献占比', value: `${percent(interestShare)}%` },
				{ label: 'Target goal amount', labelZh: '目标总储蓄额', value: money(target) },
			],
			table: {
				columns: ['Year', 'Total Contributed', 'Projected Balance', 'Goal Progress'],
				columnsZh: ['年份', '累计投入本金', '预估资产总额', '目标达成度'],
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
	fields: [
		{ id: 'carPrice', label: 'Vehicle price', labelZh: '车辆裸车指导价', suffix: '($ / ¥)', type: 'number', def: '150000', step: 'any', min: '0', required: true },
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
		{ id: 'tax', label: 'Purchase tax / Sales tax', labelZh: '车辆购置税 / 消费税', suffix: '($ / ¥)', type: 'number', def: '13274', step: 'any', min: '0', hint: 'In China, roughly Price ÷ 1.13 × 10%', hintZh: '国内购置税约按 裸车价 ÷ 1.13 × 10% 计算' },
		{ id: 'insurance', label: 'First-year insurance', labelZh: '首年车险保费 (交强险+商业险)', suffix: '($ / ¥)', type: 'number', def: '5000', step: 'any', min: '0' },
		{ id: 'license', label: 'Registration & service fees', labelZh: '上牌与综合杂费', suffix: '($ / ¥)', type: 'number', def: '500', step: 'any', min: '0' },
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
			return { rows: [{ label: 'Result', labelZh: '计算结果', value: '— (price and term must be > 0)' }] };
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
				{ label: 'Monthly payment', labelZh: '每月车贷还款额', value: money(monthly), emphasis: true },
				{ label: 'Initial cash required (drive-away)', labelZh: '购车落地首期总支出 (首付+税险费)', value: money(upfrontCash) },
				{ label: 'Loan principal', labelZh: '汽车贷款总额', value: money(loanAmount) },
				{ label: 'Down payment amount', labelZh: '裸车首付金额', value: money(downPayment) },
				{ label: 'Total loan interest', labelZh: '贷款利息总额', value: money(totalInterest) },
				{ label: 'Total out-of-pocket over full loan', labelZh: '分期购车落地总支出 (全部开销)', value: money(totalOutPocket) },
				{ label: 'Extra cost vs cash purchase', labelZh: '贷款分期较全款多花费用', value: money(totalInterest) },
			],
			note: `Financing ${money(loanAmount)} over ${months} months costs ${money(monthly)}/mo with ${money(totalInterest)} in interest. Upfront cash needed: ${money(upfrontCash)}.`,
			noteZh: `贷款 ${money(loanAmount)} 分 ${months} 期还清，月供为 ${money(monthly)}，贷款利息总计 ${money(totalInterest)}。购车提车首期需准备资金：${money(upfrontCash)}。`,
		};
	},
};

// --- irr & true apr calculator --------------------------------------------------

const irrCalculator: FormConfig = {
	intro: 'Convert advertised installment fees into true APR / IRR via Newton-Raphson approximation.',
	fields: [
		{ id: 'principal', label: 'Borrowed principal', labelZh: '分期 / 借款本金', suffix: '($ / ¥)', type: 'number', def: '12000', step: 'any', min: '0', required: true },
		{ id: 'periods', label: 'Installment periods', labelZh: '分期总期数', suffix: '(months / 期)', type: 'number', def: '12', step: '1', min: '1', required: true },
		{
			id: 'mode',
			label: 'Fee input type',
			labelZh: '费用输入形式',
			type: 'select',
			def: 'fee_rate',
			options: [
				{ value: 'fee_rate', label: 'Monthly fee rate (%)', labelZh: '按每月手续费率 % (如信用卡分期)' },
				{ value: 'monthly_payment', label: 'Fixed monthly payment ($ / ¥)', labelZh: '按每期固定还款金额' },
				{ value: 'total_fee', label: 'Total fee / interest ($ / ¥)', labelZh: '按总手续费 / 总利息金额' },
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
			suffix: '($ / ¥)',
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
			suffix: '($ / ¥)',
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
			return { rows: [{ label: 'Result', labelZh: '计算结果', value: '— (invalid principal, periods, or fee)' }] };
		}

		const nominalAnnualRate = ((totalFee / P) / (n / 12)) * 100;

		// Newton-Raphson solver for monthly IRR r:
		// f(r) = sum_{k=1..n} (pmt / (1+r)^k) - P = 0
		let r = totalFee <= 0 ? 0 : (2 * totalFee) / (n * P);
		if (r <= 0) r = 0.001;

		for (let iter = 0; iter < 60; iter++) {
			let f = -P;
			let df = 0;
			for (let k = 1; k <= n; k++) {
				const disc = (1 + r) ** -k;
				f += pmt * disc;
				df -= k * pmt * (1 + r) ** -(k + 1);
			}
			if (Math.abs(f) < 1e-8 || Math.abs(df) < 1e-12) break;
			const step = f / df;
			r -= step;
			if (r < -0.99) r = -0.99;
		}

		const trueApr = r * 12 * 100;
		const ear = ((1 + r) ** 12 - 1) * 100;
		const rateDiff = trueApr - nominalAnnualRate;

		return {
			rows: [
				{ label: 'True Annualized Rate (APR / IRR)', labelZh: '真实实际年化利率 (APR / IRR)', value: `${trueApr.toFixed(2)}%`, emphasis: true },
				{ label: 'Nominal Advertised Rate', labelZh: '表面名义年化费率 (宣传费率)', value: `${nominalAnnualRate.toFixed(2)}%` },
				{ label: 'Rate Discrepancy (True vs Advertised)', labelZh: '真实利率高出宣传费率', value: `+${rateDiff.toFixed(2)}% (~${(trueApr / (nominalAnnualRate || 1)).toFixed(1)}×)` },
				{ label: 'Monthly installment payment', labelZh: '每期实际还款额', value: money(pmt) },
				{ label: 'Total handling fee / interest', labelZh: '累计支付手续费与利息', value: money(totalFee) },
				{ label: 'Total repayment (Principal + Fees)', labelZh: '还款总额 (本金 + 手续费)', value: money(pmt * n) },
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
	fields: [
		{ id: 'age', label: 'Current age', labelZh: '当前年龄', suffix: '(years / 岁)', type: 'number', def: '30', step: '1', min: '18', max: '80', required: true },
		{ id: 'annualExp', label: 'Expected annual living expenses in retirement', labelZh: '退休后预期年生活支出', suffix: '($ / ¥)', type: 'number', def: '100000', step: 'any', min: '0', required: true },
		{ id: 'currentAssets', label: 'Current net investment assets', labelZh: '当前已有可投资生息净资产', suffix: '($ / ¥)', type: 'number', def: '300000', step: 'any', min: '0', required: true },
		{ id: 'annualSave', label: 'Annual savings added to investments', labelZh: '每年新增投资结余 (年储蓄额)', suffix: '($ / ¥)', type: 'number', def: '80000', step: 'any', min: '0', required: true },
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
			return { rows: [{ label: 'Result', labelZh: '计算结果', value: '— (expenses and withdrawal rate must be > 0)' }] };
		}
		const targetFire = exp / swr;
		const leanFire = targetFire * 0.75;
		const fatFire = targetFire * 1.25;

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
					`${Math.min(200, Math.round((balance / targetFire) * 100))}%`,
				]);
			}
		}

		if (cur >= targetFire) {
			yearsToFire = 0;
		}

		const retAge = yearsToFire >= 0 ? age + yearsToFire : '> 80';
		const yearsText = yearsToFire === 0
			? 'Already reached! / 已经达成！'
			: yearsToFire > 0
				? `${yearsToFire} years / 年 (Age / 退休年龄: ${retAge})`
				: '> 50 years / 超过50年';

		return {
			rows: [
				{ label: 'Target FIRE Nest Egg', labelZh: '标准 FIRE 财务自由目标资产', value: money(targetFire), emphasis: true },
				{ label: 'Time to Financial Freedom', labelZh: '距离财务自由所需时间', value: yearsText },
				{ label: 'Projected Retirement Age', labelZh: '预估可退休年龄', value: String(retAge) },
				{ label: 'Lean FIRE Goal (75% expenses)', labelZh: '极简 Lean FIRE 目标 (75% 支出)', value: money(leanFire) },
				{ label: 'Fat FIRE Goal (125% expenses)', labelZh: '宽裕 Fat FIRE 目标 (125% 支出)', value: money(fatFire) },
				{ label: 'Annual Safe Withdrawal (at 4% SWR)', labelZh: '退休后每年安全提现额度', value: money(targetFire * swr) },
			],
			table: {
				columns: ['Year', 'Age', 'Projected Net Worth', 'FIRE Progress'],
				columnsZh: ['年限', '年龄', '预估生息净资产', 'FIRE 进度'],
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
			suffix: '($ / ¥)',
			type: 'number',
			def: '300000',
			step: 'any',
			min: '0',
			required: true,
			hint: 'Forward mode: enter loan principal. Reverse mode: enter target monthly repayment budget.',
			hintZh: '正向模式输入借款本金总额；逆向模式输入每月可承受的还款预算',
		},
		{ id: 'rate', label: 'Annual interest rate', labelZh: '贷款年化利率', suffix: '(%)', type: 'number', def: '3.8', step: 'any', min: '0', required: true },
		{ id: 'years', label: 'Term', labelZh: '还款期限', suffix: '(years / 年)', type: 'number', def: '30', step: 'any', min: '0.1', required: true },
	],
	compute: (v) => {
		const mode = v.str('calcMode') || 'to_payment';
		const inputVal = v.num('amount');
		const rate = v.num('rate');
		const years = v.num('years');
		const months = Math.round(years * 12);
		if (!(inputVal > 0) || !(months > 0)) {
			return { rows: [{ label: 'Result', labelZh: '计算结果', value: '— (amount and term must be > 0)' }] };
		}
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
					{ label: 'Max borrowing loan amount', labelZh: '最高可贷本金额度 (借款上限)', value: money(principal), emphasis: true },
					{ label: 'Monthly payment budget', labelZh: '每月月供预算 (供款上限)', value: money(pay) },
					{ label: 'Number of payments', labelZh: '还款期数 (月数)', value: `${months} months / 期 (~${years} 年)` },
					{ label: 'Total repayment (Principal + Interest)', labelZh: '还款本息总计', value: money(totalRepay) },
					{ label: 'Total interest paid', labelZh: '支付利息总额', value: money(totalInterest) },
				],
				table: {
					columns: ['Year', 'Principal Paid', 'Interest Paid', 'Remaining Balance'],
					columnsZh: ['年份', '已还本金', '已付利息', '剩余本金余额'],
					rows: tableRows,
				},
				note: `Based on your monthly budget of ${money(pay)} over ${years} years at ${rate}%, the maximum loan you can afford is ${money(principal)}. Total interest paid will be ${money(totalInterest)}.`,
				noteZh: `在 ${years} 年期、年化利率 ${rate}% 条件下，按每月 ${money(pay)} 的月供预算，最高可申请贷款本金 ${money(principal)}，累计支付利息 ${money(totalInterest)}，还款本息总计 ${money(totalRepay)}。`,
			};
		}

		return {
			rows: [
				{ label: 'Monthly payment', labelZh: '每月还款额 (月供)', value: money(pay), emphasis: true },
				{ label: 'Loan principal', labelZh: '贷款本金', value: money(principal) },
				{ label: 'Number of payments', labelZh: '还款期数 (月数)', value: `${months} months / 期 (~${years} 年)` },
				{ label: 'Total repayment (Principal + Interest)', labelZh: '还款本息总额', value: money(totalRepay) },
				{ label: 'Total interest paid', labelZh: '支付利息总计', value: money(totalInterest) },
			],
			table: {
				columns: ['Year', 'Principal Paid', 'Interest Paid', 'Remaining Balance'],
				columnsZh: ['年份', '已还本金', '已付利息', '剩余本金余额'],
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
	prcDecrease: number;
	prcFinalMonth: number;
	crossoverMonth: number;
	interestSaved: number;
	interestSavedPct: number;
}): string {
	const { months, years, pmtMonthly, prcMonth1, prcDecrease, prcFinalMonth, crossoverMonth, interestSaved, interestSavedPct } = params;

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
	if (roughStep > 1800) yStep = 2000;
	else if (roughStep > 900) yStep = 1000;
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

	// Y-axis gridlines & labels
	let yGridSvg = '';
	for (let v = yStart; v <= yEnd; v += yStep) {
		const y = getY(v);
		yGridSvg += `<line x1="${x0}" y1="${y.toFixed(1)}" x2="${x1}" y2="${y.toFixed(1)}" stroke="rgba(148, 163, 184, 0.15)" stroke-dasharray="3 3"/>`;
		yGridSvg += `<text x="${x0 - 10}" y="${(y + 4).toFixed(1)}" font-size="11" font-family="system-ui, sans-serif" fill="#94a3b8" text-anchor="end">¥${formatNumber(v)}</text>`;
	}

	// X-axis gridlines & labels
	let xGridSvg = '';
	const yearStep = years <= 10 ? (years <= 5 ? 1 : 2) : 5;
	for (let y = 0; y <= years; y += yearStep) {
		const m = Math.max(1, y * 12);
		const x = getX(m);
		xGridSvg += `<line x1="${x.toFixed(1)}" y1="${y0}" x2="${x.toFixed(1)}" y2="${y1}" stroke="rgba(148, 163, 184, 0.15)" stroke-dasharray="3 3"/>`;
		xGridSvg += `<text x="${x.toFixed(1)}" y="${y1 + 18}" font-size="11" font-family="system-ui, sans-serif" fill="#94a3b8" text-anchor="middle">${y}年</text>`;
		xGridSvg += `<text x="${x.toFixed(1)}" y="${y1 + 32}" font-size="9.5" font-family="system-ui, sans-serif" fill="#64748b" text-anchor="middle">(${y * 12}期)</text>`;
	}

	// Shaded areas
	let areaSvg = '';
	if (hasCrossover) {
		// Phase 1: Equal Principal higher than Equal P&I
		areaSvg += `<polygon points="${x0.toFixed(1)},${yPmt.toFixed(1)} ${x0.toFixed(1)},${yPrc1.toFixed(1)} ${xCross.toFixed(1)},${yCross.toFixed(1)}" fill="rgba(249, 115, 22, 0.12)"/>`;
		// Phase 2: Equal Principal lower than Equal P&I (savings area)
		areaSvg += `<polygon points="${xCross.toFixed(1)},${yCross.toFixed(1)} ${x1.toFixed(1)},${yPrcN.toFixed(1)} ${x1.toFixed(1)},${yPmt.toFixed(1)}" fill="rgba(16, 185, 129, 0.15)"/>`;

		const text1X = (x0 + xCross) / 2;
		const text1Y = Math.min(yPrc1, yPmt) + Math.abs(yPrc1 - yPmt) * 0.45;
		areaSvg += `<text x="${text1X.toFixed(1)}" y="${text1Y.toFixed(1)}" font-size="11" font-weight="600" fill="#ea580c" text-anchor="middle">前期月供较高 (+¥${money(prcMonth1 - pmtMonthly)})</text>`;

		const text2X = (xCross + x1) / 2;
		const text2Y = yPmt + Math.abs(yPrcN - yPmt) * 0.45;
		areaSvg += `<text x="${text2X.toFixed(1)}" y="${text2Y.toFixed(1)}" font-size="11" font-weight="600" fill="#059669" text-anchor="middle">后期持续省钱 (最多省 ¥${money(pmtMonthly - prcFinalMonth)}/月)</text>`;
	}

	// Crossover lines & badge
	let crossoverSvg = '';
	if (hasCrossover) {
		crossoverSvg += `<line x1="${xCross.toFixed(1)}" y1="${y0}" x2="${xCross.toFixed(1)}" y2="${y1}" stroke="#ef4444" stroke-width="1.5" stroke-dasharray="4 4"/>`;
		crossoverSvg += `<line x1="${x0}" y1="${yCross.toFixed(1)}" x2="${xCross.toFixed(1)}" y2="${yCross.toFixed(1)}" stroke="#ef4444" stroke-width="1.5" stroke-dasharray="4 4"/>`;
		crossoverSvg += `<circle cx="${xCross.toFixed(1)}" cy="${yCross.toFixed(1)}" r="8" fill="rgba(239, 68, 68, 0.25)" stroke="#ef4444" stroke-width="2"/>`;
		crossoverSvg += `<circle cx="${xCross.toFixed(1)}" cy="${yCross.toFixed(1)}" r="4" fill="#ef4444"/>`;

		const badgeW = 230;
		const badgeH = 38;
		const badgeX = Math.min(Math.max(xCross - badgeW / 2, x0 + 10), x1 - badgeW - 10);
		const badgeY = Math.max(y0 + 5, yCross - badgeH - 12);
		crossoverSvg += `<g transform="translate(${badgeX.toFixed(1)}, ${badgeY.toFixed(1)})">
			<rect width="${badgeW}" height="${badgeH}" rx="6" fill="rgba(15, 23, 42, 0.92)" stroke="#ef4444" stroke-width="1.5"/>
			<text x="${badgeW / 2}" y="15" font-size="10.5" font-weight="bold" fill="#f87171" text-anchor="middle" font-family="system-ui, sans-serif">★ 成本平衡点: 第 ${crossoverMonth} 个月 (~${(crossoverMonth / 12).toFixed(1)}年)</text>
			<text x="${badgeW / 2}" y="29" font-size="9.5" fill="#e2e8f0" text-anchor="middle" font-family="system-ui, sans-serif">平衡月供线: ¥${money(pmtMonthly)} / 月 (此后等额本金更省)</text>
		</g>`;
	}

	return `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;user-select:none;">
		<!-- Title -->
		<text x="${x0}" y="26" font-size="13.5" font-weight="bold" fill="var(--fg, #e2e8f0)" font-family="system-ui, sans-serif">📊 房贷月供走势曲线与成本平衡点 (Payment Trajectory & Break-even Crossover)</text>

		<!-- Legends -->
		<g transform="translate(${x0}, 42)" font-size="11" font-family="system-ui, sans-serif">
			<line x1="0" y1="-3" x2="18" y2="-3" stroke="#3b82f6" stroke-width="3"/>
			<text x="24" y="0" fill="#94a3b8">等额本息 (每月固定 ¥${money(pmtMonthly)})</text>

			<line x1="230" y1="-3" x2="248" y2="-3" stroke="#f97316" stroke-width="3"/>
			<text x="254" y="0" fill="#94a3b8">等额本金 (首月 ¥${money(prcMonth1)} ➔ 末月 ¥${money(prcFinalMonth)})</text>

			<circle cx="515" cy="-3" r="4.5" fill="#ef4444"/>
			<text x="525" y="0" fill="#ef4444" font-weight="600">平衡点 (第${(crossoverMonth / 12).toFixed(1)}年反超)</text>

			<rect x="650" y="-12" width="115" height="18" rx="4" fill="rgba(16, 185, 129, 0.15)"/>
			<text x="707" y="1" fill="#10b981" font-weight="600" text-anchor="middle">★ 省息 ¥${money(interestSaved)}</text>
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
			suffix: '($ / ¥)',
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
			suffix: '($ / ¥)',
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
			suffix: '($ / ¥)',
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
			suffix: '(years / 年)',
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
			suffix: '($ / ¥)',
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
			return { rows: [{ label: 'Result', labelZh: '计算结果', value: '— (loan amount and term must be > 0)' }] };
		}

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
					value: `¥${money(interestSaved)} (利息节省 ${percent(interestSavedPct)}%)`,
					emphasis: true,
				},
				{
					label: 'Equal P&I monthly payment',
					labelZh: '【等额本息】每月固定月供',
					value: `${money(totalMonthlyPmt + extras)} / month`,
				},
				{
					label: 'Equal P&I total interest',
					labelZh: '【等额本息】累计利息总额',
					value: money(totalIntPmt),
				},
				{
					label: 'Equal P&I total repayment',
					labelZh: '【等额本息】还款本息总计',
					value: money(totalRepayPmt + extras * months),
				},
				{
					label: 'Equal Principal Month 1 payment',
					labelZh: '【等额本金】首月还款额 (最高)',
					value: `${money(prcMonth1 + extras)} (每月递减 -¥${money(prcDecrease)})`,
				},
				{
					label: 'Equal Principal final month payment',
					labelZh: '【等额本金】末月还款额 (最低)',
					value: money(prcFinalMonth + extras),
				},
				{
					label: 'Equal Principal total interest',
					labelZh: '【等额本金】累计利息总额',
					value: money(totalIntPrc),
				},
				{
					label: 'Equal Principal total repayment',
					labelZh: '【等额本金】还款本息总计',
					value: money(totalRepayPrc + extras * months),
				},
				{
					label: 'Total loan principal',
					labelZh: '贷款本金总额',
					value: `${money(totalLoan)}${loanType === 'combined' ? ` (商贷 ¥${money(commPortion)} + 公积金 ¥${money(gjjPortion)})` : ''}`,
				},
			];

			if (calcBasis === 'by_price') {
				rows.push(
					{ label: 'Home purchase price', labelZh: '房屋购房总价', value: money(price) },
					{ label: 'Down payment amount', labelZh: '购房首付款', value: `${money(downPayment)} (${downPct}%)` },
				);
			}

			const compareTable: FormTable = {
				columns: ['Metric', 'Equal P&I (等额本息)', 'Equal Principal (等额本金)', 'Difference & Analysis'],
				columnsZh: ['比较维度', '等额本息 (每月固定)', '等额本金 (每月递减)', '两方案差异 / 评估'],
				rows: [
					['首月还款额 (Month 1)', money(totalMonthlyPmt + extras), money(prcMonth1 + extras), m1Diff > 0 ? `等额本金首月多还 ¥${money(m1Diff)}` : '两方案相同'],
					['末月还款额 (Final Month)', money(totalMonthlyPmt + extras), money(prcFinalMonth + extras), `等额本金末月少还 ¥${money(totalMonthlyPmt - prcFinalMonth)}`],
					['每月月供变动', '每月保持不变 (恒定月供)', `每月固定递减 -¥${money(prcDecrease)}`, '等额本金逐月减负，归还本金更快'],
					['月供打平月份 (Crossover)', '基准线', crossoverMonth > 0 ? `第 ${crossoverMonth} 个月起更低 (~${(crossoverMonth / 12).toFixed(1)} 年)` : '始终更低', '此后等额本金月供将一直低于等额本息'],
					['支付利息总额 (Total Interest)', money(totalIntPmt), money(totalIntPrc), `★ 等额本金累计省息 ¥${money(interestSaved)} (-${percent(interestSavedPct)}%)`],
					['还款本息总计 (Total Repaid)', money(totalRepayPmt + extras * months), money(totalRepayPrc + extras * months), `等额本金少支出 ¥${money(interestSaved)}`],
					['前期月供压力', '较小，月供恒定便于家庭规划', '较大 (前期月供处于最高位)', crossoverMonth > 0 ? `前 ${(crossoverMonth / 12).toFixed(1)} 年等额本息压力明显更轻` : '等额本金月供始终更低，无前期压力差'],
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
				prcDecrease,
				prcFinalMonth: prcFinalMonth + extras,
				crossoverMonth,
				interestSaved,
				interestSavedPct,
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
				{ label: 'Monthly payment (Fixed)', labelZh: '每月月供 (固定等额)', value: money(totalMonthlyPmt + extras), emphasis: true },
				{ label: 'Total interest paid', labelZh: '支付利息总额', value: money(totalIntPmt) },
				{ label: 'Total repayment (Principal + Interest)', labelZh: '还款本息总计', value: money(totalRepayPmt + extras * months) },
				{ label: 'Loan principal', labelZh: '贷款本金总额', value: money(totalLoan) },
				{ label: 'Number of payments', labelZh: '还款期数', value: `${months} months / 期 (${years} 年)` },
			];
			if (calcBasis === 'by_price') {
				rows.push(
					{ label: 'Home price', labelZh: '房屋总价', value: money(price) },
					{ label: 'Down payment', labelZh: '首付款', value: `${money(downPayment)} (${downPct}%)` },
				);
			}
			return {
				rows,
				table: {
					columns: ['Year', 'Principal Paid', 'Interest Paid', 'Remaining Balance'],
					columnsZh: ['年份', '已还本金', '已付利息', '剩余本金余额'],
					rows: pmtTableRows,
				},
				note: `Financing ${money(totalLoan)} under Equal P&I over ${years} years costs ${money(totalMonthlyPmt + extras)}/month with ${money(totalIntPmt)} in total interest.`,
				noteZh: `贷款 ${money(totalLoan)} 元按等额本息还款，${years} 年期（${months}期）每月固定还款 ${money(totalMonthlyPmt + extras)} 元，全周期累计支付利息 ${money(totalIntPmt)} 元，还款总额 ${money(totalRepayPmt + extras * months)} 元。`,
			};
		}

		// method === 'equal_prc'
		const rows: FormResultRow[] = [
			{ label: 'First month payment (Peak)', labelZh: '首月还款额 (最高月供)', value: money(prcMonth1 + extras), emphasis: true },
			{ label: 'Monthly decrease', labelZh: '每月递减金额', value: `-${money(prcDecrease)} / month` },
			{ label: 'Final month payment', labelZh: '末月还款额 (最低月供)', value: money(prcFinalMonth + extras) },
			{ label: 'Total interest paid', labelZh: '支付利息总额', value: money(totalIntPrc) },
			{ label: 'Total repayment (Principal + Interest)', labelZh: '还款本息总计', value: money(totalRepayPrc + extras * months) },
			{ label: 'Loan principal', labelZh: '贷款本金总额', value: money(totalLoan) },
			{ label: 'Number of payments', labelZh: '还款期数', value: `${months} months / 期 (${years} 年)` },
		];
		if (calcBasis === 'by_price') {
			rows.push(
				{ label: 'Home price', labelZh: '房屋总价', value: money(price) },
				{ label: 'Down payment', labelZh: '首付款', value: `${money(downPayment)} (${downPct}%)` },
			);
		}
		return {
			rows,
			table: {
				columns: ['Year', 'Principal Paid', 'Interest Paid', 'Remaining Balance'],
				columnsZh: ['年份', '已还本金', '已付利息', '剩余本金余额'],
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
	fields: [
		{ id: 'cost', label: 'Cost of investment', labelZh: '投资成本', suffix: '($ / ¥)', type: 'number', def: '1000', step: 'any', required: true },
		{ id: 'revenue', label: 'Revenue / Final value', labelZh: '回收金额 / 终值', suffix: '($ / ¥)', type: 'number', def: '1500', step: 'any', required: true },
	],
	compute: (v) => {
		const cost = v.num('cost');
		const revenue = v.num('revenue');
		const profit = revenue - cost;
		if (cost === 0) return { rows: [{ label: 'ROI', labelZh: '投资回报率', value: '— (cost is 0)' }] };
		return {
			rows: [
				{ label: 'Return on Investment (ROI)', labelZh: '投资回报率 (ROI)', value: `${formatNumber((profit / cost) * 100)}%`, emphasis: true },
				{ label: 'Net profit / gain', labelZh: '净收益金额', value: money(profit) },
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
		{ id: 'price', label: 'Original price', labelZh: '商品原价', suffix: '($ / ¥)', type: 'number', def: '100', step: 'any', min: '0', required: true },
		{ id: 'pct', label: 'Discount percentage off', labelZh: '折扣率 (%)', suffix: '(%)', type: 'number', def: '20', step: 'any', required: true },
		{ id: 'qty', label: 'Quantity', labelZh: '购买件数', type: 'number', def: '1', step: '1', min: '1', required: true },
	],
	compute: (v) => {
		const price = v.num('price');
		const pctOff = v.num('pct');
		const qty = Math.max(1, Math.round(v.num('qty')) || 1);
		const unit = price * (1 - pctOff / 100);
		return {
			rows: [
				{ label: 'Final price per item', labelZh: '单件折后价', value: money(unit), emphasis: true },
				{ label: 'Savings per item', labelZh: '单件立省金额', value: money(price - unit) },
				{ label: `Total for ${qty} item${qty > 1 ? 's' : ''}`, labelZh: `共 ${qty} 件折后总价`, value: money(unit * qty) },
				{ label: 'Total savings', labelZh: '整单累计节省', value: money((price - unit) * qty) },
			],
		};
	},
};

// --- salary ----------------------------------------------------------------------------------

const salary: FormConfig = {
	fields: [
		{ id: 'annual', label: 'Annual salary', labelZh: '年薪总额', suffix: '($ / ¥)', type: 'number', def: '60000', step: 'any', min: '0', required: true },
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
			rows.push({ label: 'Hourly rate', labelZh: '折合时薪', value: '— (working weeks must be > 0)' });
			return { rows };
		}
		rows.push({
			label: 'Hourly rate',
			labelZh: '折合时薪',
			value: totalHours > 0 ? money(annual / totalHours) : '—',
			emphasis: true,
		});
		rows.push({ label: 'Weekly pay', labelZh: '周薪', value: money(annual / weeks) });
		rows.push({ label: 'Biweekly pay', labelZh: '双周薪 (每两周)', value: money((annual / weeks) * 2) });
		rows.push({ label: 'Monthly pay', labelZh: '月薪', value: money(annual / 12) });
		rows.push({ label: 'Daily pay', labelZh: '日薪', value: days > 0 ? money(annual / weeks / days) : '—' });
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
			suffix: '($ / ¥)',
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
			suffix: '($ / ¥)',
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
			suffix: '($ / ¥)',
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
			suffix: '($ / ¥)',
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
				while (
					computeTaxCore({
						annualGross: high,
						regime,
						annualInsurance,
						annualSpecialDeduction,
						effectiveBonus,
						bonusMode,
						flatRate,
					}).totalNetTakeHome < targetAnnualNet
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
					value: money(requiredPeriodGross),
					emphasis: true,
				},
				{
					label: 'Target net take-home pay',
					labelZh: '目标税后到手金额',
					value: `${money(inputIncome)} (${period === 'monthly' ? 'Monthly / 月' : 'Annual / 年'})`,
				},
				{
					label: 'Required pre-tax salary (Annual total)',
					labelZh: '对应全年度税前基本年薪',
					value: money(annualGross),
				},
				{
					label: 'Total annual tax owed',
					labelZh: '全年度预计需缴纳个税',
					value: `${money(out.totalTax)} (月均 ¥${money(out.totalTax / 12)})`,
				},
				{
					label: 'Base salary net pay (Monthly average)',
					labelZh: '月均基本工资税后到手',
					value: money(out.monthlySalaryNet),
				},
			];

			if (effectiveBonus > 0) {
				rows.push({
					label: 'Year-end bonus net pay',
					labelZh: '年终奖税后到手 (实发)',
					value: money(out.bonusTakeHome),
				});
				rows.push({
					label: 'Year-end bonus tax owed',
					labelZh: '年终奖应纳个税',
					value: `${money(out.bonusTax)}${out.isCombinedActive ? ' (并入综合)' : ` (${(out.separateBonusRate * 100).toFixed(0)}% 档, 速算扣除 ¥${out.separateBonusQuick})`}`,
				});
			}

			rows.push(
				{
					label: 'Five Insurances & Housing Fund (Annual)',
					labelZh: '全年五险一金个人承担扣除',
					value: `${money(annualInsurance)} (月均 ¥${money(monthlyInsurance)})`,
				},
				{
					label: 'Special Additional Deductions (Annual)',
					labelZh: '全年专项附加扣除总额',
					value: `${money(annualSpecialDeduction)} (月均 ¥${money(monthlySpecialDeduction)})`,
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
					columns: ['Tax Bracket', 'Rate', 'Taxable in Bracket', 'Tax Owed'],
					columnsZh: ['综合所得税率阶梯', '适用税率', '级内应纳税所得额', '本级应纳税额'],
					rows: out.salaryCalcRows,
				};
			} else if (out.usOrFlatRows.length) {
				table = {
					columns: ['Tax Bracket', 'Rate', 'Taxable in Bracket', 'Tax Owed'],
					columnsZh: ['税率阶梯', '适用税率', '级内应纳税所得额', '本级应纳税额'],
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
				{ label: 'Net take-home income (Annual)', labelZh: '税后总收入 (全年度实发到手)', value: money(out.totalNetTakeHome), emphasis: true },
				{ label: 'Base salary net pay (Monthly average)', labelZh: '基本工资税后到手 (月均)', value: money(out.monthlySalaryNet) },
			];

			if (effectiveBonus > 0) {
				rows.push({ label: 'Year-end bonus net pay', labelZh: '年终奖税后到手 (实发)', value: money(out.bonusTakeHome) });
			}

			rows.push(
				{ label: 'Total annual tax owed', labelZh: '全年度个人所得税总额', value: money(out.totalTax) },
				{ label: 'Base salary tax owed (Annual)', labelZh: '基本工资应纳个税 (全年度)', value: money(out.salaryTax) },
			);

			if (effectiveBonus > 0) {
				rows.push({
					label: 'Year-end bonus tax owed',
					labelZh: '年终奖应纳个税',
					value: `${money(out.bonusTax)}${out.isCombinedActive ? ' (并入综合)' : ` (${(out.separateBonusRate * 100).toFixed(0)}% 档, 速算扣除 ¥${out.separateBonusQuick})`}`,
				});
				let planEvaluationZh = '';
				if (out.bestScheme === 'separate') {
					planEvaluationZh = `单独计税更优 (比合并计税省税 ¥${money(out.taxDiff)})`;
				} else if (out.bestScheme === 'combined') {
					planEvaluationZh = `并入综合所得更优 (比单独计税省税 ¥${money(out.taxDiff)})`;
				} else {
					planEvaluationZh = '两方案税额相同';
				}
				rows.push({
					label: 'Optimal bonus scheme',
					labelZh: '年终奖计税方案优选',
					value: planEvaluationZh,
				});
			}

			rows.push(
				{ label: 'Five Insurances & Housing Fund (Annual)', labelZh: '全年五险一金个人承担扣除', value: money(annualInsurance) },
				{ label: 'Special Additional Deductions (Annual)', labelZh: '全年专项附加扣除总额', value: money(annualSpecialDeduction) },
				{ label: 'Taxable income (Annual comprehensive)', labelZh: '年度综合所得应纳税所得额', value: money(out.salaryTaxable) },
				{ label: 'Effective overall tax rate', labelZh: '综合实际有效税率', value: `${percent(out.effectiveRate)}%` },
				{ label: 'Highest marginal tax rate', labelZh: '最高适用边际税率', value: `${out.marginalRate.toFixed(0)}%` },
			);

			let table: FormTable | undefined;
			if (effectiveBonus > 0) {
				table = {
					columns: ['Tax Scheme', 'Salary Tax', 'Bonus Tax', 'Total Tax', 'Take-Home Pay', 'Recommendation'],
					columnsZh: ['年终奖计税方案', '工资薪金个税', '年终奖个税', '全年个税总额', '最终税后到手', '优选评估'],
					rows: [
						[
							'单独计税 (全年一次性奖金优惠)',
							money(out.salaryTax),
							money(out.separateBonusTax),
							money(out.separateTotalTax),
							money(out.totalGross - annualInsurance - out.separateTotalTax),
							out.bestScheme === 'separate' ? '★ 推荐方案 (省税最高)' : (out.bestScheme === 'equal' ? '税负相同' : '税负偏高'),
						],
						[
							'并入当年综合所得合并计税',
							money(out.salaryTax),
							money(out.combinedBonusTax),
							money(out.combinedTotalTax),
							money(out.totalGross - annualInsurance - out.combinedTotalTax),
							out.bestScheme === 'combined' ? '★ 推荐方案 (省税最高)' : (out.bestScheme === 'equal' ? '税负相同' : '税负偏高'),
						],
					],
				};
			} else if (out.salaryCalcRows.length) {
				table = {
					columns: ['Tax Bracket', 'Rate', 'Taxable in Bracket', 'Tax Owed'],
					columnsZh: ['综合所得税率阶梯', '适用税率', '级内应纳税所得额', '本级应纳税额'],
					rows: out.salaryCalcRows,
				};
			}

			let noteEn = `On gross income of ${money(out.totalGross)} (salary ${money(annualGross)}${effectiveBonus > 0 ? ` + bonus ${money(effectiveBonus)}` : ''}), deductions total ${money(out.totalSalaryDeductions)} (standard 60,000 + insurance ${money(annualInsurance)} + special ${money(annualSpecialDeduction)}). Total tax is ${money(out.totalTax)} (effective rate ${percent(out.effectiveRate)}%), leaving ${money(out.totalNetTakeHome)} net take-home pay.`;
			let noteZh = `总税前收入 ${money(out.totalGross)}（基本年薪 ${money(annualGross)}${effectiveBonus > 0 ? ` + 年终奖 ${money(effectiveBonus)}` : ''}），扣除项合计 ${money(out.totalSalaryDeductions)}（起征点6万 + 五险一金 ${money(annualInsurance)} + 专项附加扣除 ${money(annualSpecialDeduction)}）。全年个税为 ${money(out.totalTax)}（综合实际税率 ${percent(out.effectiveRate)}%），税后综合到手 ${money(out.totalNetTakeHome)}（月均基本薪资 ${money(out.monthlySalaryNet)}${effectiveBonus > 0 ? ` + 年终奖实发 ${money(out.bonusTakeHome)}` : ''}）。`;

			if (effectiveBonus > 0) {
				if (out.bestScheme === 'separate') {
					noteZh += ` 【方案建议】：建议选择【单独计税】，相比并入综合所得可少缴个税 ¥${money(out.taxDiff)}。`;
				} else if (out.bestScheme === 'combined') {
					noteZh += ` 【方案建议】：由于基本工资未用尽免征额或专项扣除额度，建议选择【并入综合所得计税】，可少缴个税 ¥${money(out.taxDiff)}。`;
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
				{ label: 'Net take-home income (Annual)', labelZh: '税后净收入 (年度到手)', value: money(out.totalNetTakeHome), emphasis: true },
				{ label: 'Net take-home income (Monthly average)', labelZh: '税后净收入 (月均到手)', value: money(monthlyNet) },
				{ label: 'Total tax owed (Annual)', labelZh: '应缴个人所得税 (年度总税额)', value: money(out.totalTax) },
				{ label: 'Tax owed (Monthly average)', labelZh: '应缴个人所得税 (月均)', value: money(monthlyTax) },
				{ label: 'Effective tax rate', labelZh: '实际综合有效税率', value: `${percent(out.effectiveRate)}%` },
				{ label: 'Marginal top tax bracket', labelZh: '最高适用边际税率', value: `${out.marginalRate.toFixed(0)}%` },
				{ label: 'Taxable income', labelZh: '应纳税所得额', value: money(out.salaryTaxable) },
			],
			table: out.usOrFlatRows.length
				? {
						columns: ['Tax Bracket', 'Rate', 'Taxable in Bracket', 'Tax Owed'],
						columnsZh: ['税率阶梯', '适用税率', '级内应纳税所得额', '本级应纳税额'],
						rows: out.usOrFlatRows,
					}
				: undefined,
			note: `On gross income of ${money(out.totalGross)}, total tax is ${money(out.totalTax)} (effective rate of ${percent(out.effectiveRate)}%), leaving ${money(out.totalNetTakeHome)} take-home.`,
			noteZh: `在税前收入 ${money(out.totalGross)} 情况下，全年度个人所得税为 ${money(out.totalTax)}（综合实际税率 ${percent(out.effectiveRate)}%），税后实际到手 ${money(out.totalNetTakeHome)}（月均 ${money(monthlyNet)}）。`,
		};
	},
};

// --- entries --------------------------------------------------------------------------------------

export const FINANCE_TOOLS: ToolEntry[] = [
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
		slug: 'investment-return',
		category: 'finance',
		name: 'Investment Return Calculator',
		nameZh: '投资回报与复利计算器',
		description: 'Redirects to the unified Compound Interest & Investment Return Calculator.',
		descriptionZh: '跳转至复利投资与定投收益计算器。',
		kind: 'redirect',
		config: { target: '/finance/compound-interest/' },
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
		slug: 'discount',
		category: 'finance',
		name: 'Discount & Sale Calculator',
		nameZh: '折扣降价与购物优惠计算器',
		description: 'Final price and total savings from a percentage discount, for single or bulk quantities.',
		descriptionZh: '根据打折折扣百分比计算优惠后价格与节省金额，支持单件或批量核算。',
		kind: 'form',
		config: discount,
	},
];
