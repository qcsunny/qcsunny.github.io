// Registry entries for /finance/* — all form tools, several with result
// tables (compound interest year by year, loan amortization, mortgage prepayment, etc.).

import type { FormConfig, FormResultRow, FormTable, ToolEntry } from './registry';
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
				{ label: 'Total return on investment (ROI)', labelZh: '总投资回报率 (ROI)', value: `${formatNumber(returnPct)}%` },
				{ label: 'Asset multiple (Final ÷ Invested)', labelZh: '资产增值倍数', value: `${formatNumber(multiple)}×` },
			],
			table: {
				columns: ['Year', 'Total Invested', 'Portfolio Value', 'Interest Earned'],
				columnsZh: ['年份', '累计投入本金', '资产总值', '累计利息收益'],
				rows: tableRows,
			},
			note: `Over ${t} years, your ${money(invested)} total investment grew by ${money(growth)} (${formatNumber(returnPct)}%), ending at ${money(final)}.`,
			noteZh: `在 ${t} 年内，您累计投入的 ${money(invested)} 本金共产生 ${money(growth)} 利息收益（回报率 ${formatNumber(returnPct)}%），最终资产规模达到 ${money(final)}。`,
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
			return [String(y), money(costY), money(powerY), `${formatNumber(lossY)}%`];
		});

		return {
			rows: [
				{ label: 'Future equivalent cost', labelZh: '未来购买等价商品所需金额', value: money(futureCost), emphasis: true },
				{ label: 'Future purchasing power of current cash', labelZh: '当前现金在未来的实际购买力', value: money(futurePower) },
				{ label: 'Total purchasing power loss', labelZh: '实际购买力缩水比例', value: `${formatNumber(lossPct)}%` },
				{ label: 'Price level multiplier', labelZh: '物价上涨倍数', value: `${formatNumber(futureCost / amount)}×` },
			],
			table: {
				columns: ['Years Ahead', 'Equivalent Cost', 'Real Purchasing Power', 'Loss (%)'],
				columnsZh: ['年数', '等价商品所需金额', '现金实际购买力', '购买力缩水率'],
				rows: tableRows,
			},
			note: `At a ${rate}% annual inflation rate, what costs ${money(amount)} today will cost ${money(futureCost)} in ${years} years. Keeping cash under a mattress loses ${formatNumber(lossPct)}% of its real purchasing power.`,
			noteZh: `在年均通胀率 ${rate}% 的影响下，今天价值 ${money(amount)} 的商品在 ${years} 年后需要花费 ${money(futureCost)} 才能买到。若将现金单纯闲置，实际购买力将大幅缩水 ${formatNumber(lossPct)}%。`,
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
				{ label: 'Gains share of goal', labelZh: '收益贡献占比', value: `${formatNumber(interestShare)}%` },
				{ label: 'Target goal amount', labelZh: '目标总储蓄额', value: money(target) },
			],
			table: {
				columns: ['Year', 'Total Contributed', 'Projected Balance', 'Goal Progress'],
				columnsZh: ['年份', '累计投入本金', '预估资产总额', '目标达成度'],
				rows: tableRows,
			},
			note: `To reach ${money(target)} in ${years} years, deposit ${money(pmt)} monthly. Compound interest earns ${money(interestEarned)} (${formatNumber(interestShare)}% of the goal).`,
			noteZh: `要在 ${years} 年内达成 ${money(target)} 的储蓄目标，您只需每月存入 ${money(pmt)}。在复利作用下，利息与投资增值将为您贡献 ${money(interestEarned)}（占目标总额的 ${formatNumber(interestShare)}%）。`,
		};
	},
};

// --- auto loan & out-of-pocket calculator ---------------------------------------

const autoLoan: FormConfig = {
	intro: 'Estimate monthly car payments, interest, taxes, insurance and total out-of-pocket落地 cost.',
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
				{ label: 'Initial cash required (落地首期支出)', labelZh: '购车落地首期总支出 (首付+税险费)', value: money(upfrontCash) },
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
				{ value: 'to_payment', label: 'Forward: Loan Amount to Monthly Payment (正向：已知贷款本金，计算每月月供)', labelZh: '正向：已知贷款本金，计算每月月供' },
				{ value: 'to_principal', label: 'Reverse: Monthly Budget to Max Loan (逆向：已知月供预算，反推最高借款额度)', labelZh: '逆向：已知月供预算，反推最高借款额度' },
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
	intro: 'Compare Equal Principal & Interest (等额本息) vs Equal Principal (等额本金), calculate monthly payments, interest savings, and support Commercial, Provident Fund, or Combined mortgages.',
	fields: [
		{
			id: 'method',
			label: 'Repayment method',
			labelZh: '还款方式',
			type: 'select',
			def: 'compare',
			options: [
				{ value: 'compare', label: 'Compare Both (等额本息 vs 等额本金 双方案对比PK)', labelZh: '双方案对比 (等额本息 vs 等额本金 PK对比)' },
				{ value: 'equal_pmt', label: 'Equal Principal & Interest (等额本息 - 每月月供固定)', labelZh: '等额本息 (每月月供固定，前期压力小)' },
				{ value: 'equal_prc', label: 'Equal Principal (等额本金 - 每月递减，省利息)', labelZh: '等额本金 (每月递减，总利息更省)' },
			],
		},
		{
			id: 'loanType',
			label: 'Loan type',
			labelZh: '贷款类型',
			type: 'select',
			def: 'commercial',
			options: [
				{ value: 'commercial', label: 'Commercial Loan (商业贷款)', labelZh: '商业贷款' },
				{ value: 'fund', label: 'Housing Provident Fund Loan (纯公积金贷款)', labelZh: '纯公积金贷款' },
				{ value: 'combined', label: 'Combined Loan (组合贷款: 公积金 + 商贷)', labelZh: '组合贷款 (公积金 + 商业贷款)' },
			],
		},
		{
			id: 'calcBasis',
			label: 'Calculation input mode',
			labelZh: '计算方式',
			type: 'select',
			def: 'by_amount',
			options: [
				{ value: 'by_amount', label: 'By Loan Amount (按贷款本金额度直接计算)', labelZh: '按贷款额度计算 (直接输入贷款金额)' },
				{ value: 'by_price', label: 'By Home Price & Down Payment (按房屋总价与首付成数计算)', labelZh: '按房产总价计算 (输入总价与首付比例)' },
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
			hint: 'e.g. 20% for 2成首付, 30% for 3成首付',
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
					value: `¥${money(interestSaved)} (利息节省 ${formatNumber(interestSavedPct)}%)`,
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
					['支付利息总额 (Total Interest)', money(totalIntPmt), money(totalIntPrc), `★ 等额本金累计省息 ¥${money(interestSaved)} (-${formatNumber(interestSavedPct)}%)`],
					['还款本息总计 (Total Repaid)', money(totalRepayPmt + extras * months), money(totalRepayPrc + extras * months), `等额本金少支出 ¥${money(interestSaved)}`],
					['前期月供压力', '较小，月供恒定便于家庭规划', '较大 (前期月供处于最高位)', '前 ${(crossoverMonth / 12).toFixed(1)} 年等额本息压力明显更轻'],
					['适合人群画像', '适合刚需刚落户、前期资金紧、收入递增者', '适合前期收入高、资金充裕、利息敏感者', '依自身当下现金流与资金成本科学决策'],
				],
			};

			const noteZh = `【房贷双方案PK核心结论】：贷款 ${money(totalLoan)} 元（${years} 年期 / ${months} 期），选择【等额本金】相比【等额本息】全周期可累计省息 ¥${money(interestSaved)} 元（利息直降 ${formatNumber(interestSavedPct)}%）！\n\n` +
				`• 【等额本息】：每月固定还款 ¥${money(totalMonthlyPmt + extras)} 元，累计利息 ¥${money(totalIntPmt)} 元。适合刚步入职场、前期资金较紧张、月收入较稳定或预期未来收入持续增长的购房者。\n\n` +
				`• 【等额本金】：首月还款 ¥${money(prcMonth1 + extras)} 元，随后每月固定减少 ¥${money(prcDecrease)} 元，在第 ${crossoverMonth} 个月（约 ${(crossoverMonth / 12).toFixed(1)} 年）后月供开始低于等额本息，末月降至 ¥${money(prcFinalMonth + extras)} 元。适合当前收入充裕、手头流动资金宽裕、希望尽可能节省利息支出的购房者。`;

			const noteEn = `[Mortgage Repayment Comparison]: For a ${money(totalLoan)} loan over ${years} years, choosing Equal Principal saves ${money(interestSaved)} in total interest (-${formatNumber(interestSavedPct)}%) compared to Equal P&I!\n\n` +
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
				{ label: 'Return multiple (Revenue ÷ Cost)', labelZh: '回报倍数 (收入 ÷ 成本)', value: `${formatNumber(revenue / cost)}×` },
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
				{ value: 'gross_to_net', label: 'Forward: Gross to Net Take-Home (正向：税前薪资算税后到手)', labelZh: '正向：税前薪资算税后到手' },
				{ value: 'net_to_gross', label: 'Reverse: Net Take-Home to Required Gross (逆向：税后期望到手反推税前薪资)', labelZh: '逆向：税后到手反推税前薪资' },
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
				{ value: 'cn', label: 'China Individual Income Tax (中国新个税综合所得 3%~45% 七级超额累进)', labelZh: '中国新个税 (五险一金/专项扣除/年终奖)' },
				{ value: 'us_single', label: 'US Federal Income Tax (Single)', labelZh: '美国联邦个人所得税 (Single 单身标准)' },
				{ value: 'flat', label: 'Flat Tax Rate (固定单一税率)', labelZh: '固定单一税率' },
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
					value: `${formatNumber(out.effectiveRate)}%`,
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

			const noteZh = `【税后倒推税前薪资结果】：若期望${period === 'monthly' ? '每月' : '全年'}税后实发到手 ${money(inputIncome)} 元，扣除每月五险一金 ${money(monthlyInsurance)} 元和专项附加扣除 ${money(monthlySpecialDeduction)} 元后，您需要达到税前月薪至少 ${money(annualGross / 12)} 元（折合税前年薪 ${money(annualGross)} 元${effectiveBonus > 0 ? `，年终奖 ${money(effectiveBonus)} 元` : ''}）。全年度需缴纳个税 ${money(out.totalTax)} 元，实际综合个税税率为 ${formatNumber(out.effectiveRate)}%。`;
			const noteEn = `[Reverse Net-to-Gross Calculation]: To achieve a target net take-home pay of ${money(inputIncome)} (${period}), after insurance (${money(monthlyInsurance)}/mo) and deductions (${money(monthlySpecialDeduction)}/mo), you require a pre-tax salary of ${money(annualGross / 12)}/month (${money(annualGross)}/year${effectiveBonus > 0 ? ` + bonus ${money(effectiveBonus)}` : ''}). Total annual tax owed is ${money(out.totalTax)} (effective rate ${formatNumber(out.effectiveRate)}%).`;

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
				{ label: 'Effective overall tax rate', labelZh: '综合实际有效税率', value: `${formatNumber(out.effectiveRate)}%` },
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

			let noteEn = `On gross income of ${money(out.totalGross)} (salary ${money(annualGross)}${effectiveBonus > 0 ? ` + bonus ${money(effectiveBonus)}` : ''}), deductions total ${money(out.totalSalaryDeductions)} (standard 60,000 + insurance ${money(annualInsurance)} + special ${money(annualSpecialDeduction)}). Total tax is ${money(out.totalTax)} (effective rate ${formatNumber(out.effectiveRate)}%), leaving ${money(out.totalNetTakeHome)} net take-home pay.`;
			let noteZh = `总税前收入 ${money(out.totalGross)}（基本年薪 ${money(annualGross)}${effectiveBonus > 0 ? ` + 年终奖 ${money(effectiveBonus)}` : ''}），扣除项合计 ${money(out.totalSalaryDeductions)}（起征点6万 + 五险一金 ${money(annualInsurance)} + 专项附加扣除 ${money(annualSpecialDeduction)}）。全年个税为 ${money(out.totalTax)}（综合实际税率 ${formatNumber(out.effectiveRate)}%），税后综合到手 ${money(out.totalNetTakeHome)}（月均基本薪资 ${money(out.monthlySalaryNet)}${effectiveBonus > 0 ? ` + 年终奖实发 ${money(out.bonusTakeHome)}` : ''}）。`;

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
				{ label: 'Effective tax rate', labelZh: '实际综合有效税率', value: `${formatNumber(out.effectiveRate)}%` },
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
			note: `On gross income of ${money(out.totalGross)}, total tax is ${money(out.totalTax)} (effective rate of ${formatNumber(out.effectiveRate)}%), leaving ${money(out.totalNetTakeHome)} take-home.`,
			noteZh: `在税前收入 ${money(out.totalGross)} 情况下，全年度个人所得税为 ${money(out.totalTax)}（综合实际税率 ${formatNumber(out.effectiveRate)}%），税后实际到手 ${money(out.totalNetTakeHome)}（月均 ${money(monthlyNet)}）。`,
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
		kind: 'form',
		config: mortgagePrepayment,

		content: {
			about: [
				'Calculate the financial impact of paying down your mortgage early. Whether you have a year-end bonus or accumulated savings, this calculator shows exactly how much interest you save and lets you compare two strategies: shortening your loan term (keeping your monthly payment the same) versus lowering your ongoing monthly payment.',
				'Because mortgage interest is front-loaded in amortization schedules, prepaying principal in the early to middle years yields massive interest savings — often tens or hundreds of thousands in saved interest.',
			],
			aboutZh: [
				'精准计算房贷提前还贷的省息效果。无论是一笔年终奖金还是储蓄结余，本计算器都能清晰展示提前还贷后的两种核心策略对比：缩短还款年限（月供基本不变，利息省最多）与减少月供金额（还款期限不变，减轻每月现金流压力）。',
				'在等额本息还款机制下，前期还款大部分为利息。在还款前期和中期提前还贷冲抵本金，省息效果最为显著，通常可为您省下数万乃至数十万元利息支出。',
			],
			faq: [
				{ q: 'Is it better to shorten the term or reduce the monthly payment?', a: 'Shortening the loan term saves significantly more total interest. Reducing the monthly payment frees up immediate cash flow each month.' },
				{ q: 'When is the best time to prepay a mortgage?', a: 'Earlier is better, before you have already paid the bulk of the interest during the first third of the loan term.' },
				{ q: 'Does this apply to fixed and variable rate loans?', a: 'Yes, it computes based on your current effective interest rate.' },
			],
			faqZh: [
				{ q: '提前还贷选"缩短年限"还是"减少月供"更好？', a: '缩短还款年限节省的总利息远多于减少月供；而减少月供则能直接释放每月的现金流压力，两者可根据当下财务状况灵活抉择。' },
				{ q: '房贷还款什么时候提前还最划算？', a: '通常在贷款前 1/3 周期内提前还本金最划算，因为此时利息占比最高；若已还款超过一半，大部分利息已付清，省息收益相对降低。' },
				{ q: '支持公积金贷款和商业贷款吗？', a: '支持。只要输入当前贷款的实际执行年化利率即可准确计算。' },
			],
		},
	},
	{
		slug: 'compound-interest',
		category: 'finance',
		name: 'Compound Interest & Investment Return Calculator',
		nameZh: '复利投资与定投收益计算器',
		description: 'Compound growth with configurable compounding frequency, regular monthly contributions, and year-by-year schedule.',
		kind: 'form',
		config: compoundInterest,

		content: {
			about: [
				'Compound interest is interest earned on interest: each period, gains join the principal and the next cycle compounds on the new total. This calculator projects future wealth from starting principal, annual return, compounding frequency, and regular monthly contributions.',
				'The formula is A = P·(1 + r/n)^(n·t) plus accumulated monthly cash flows. Over 10 to 30 years, compound interest transforms modest monthly investments into substantial fortunes.',
			],
			aboutZh: [
				'复利是财富积累的核心杠杆：每期收益并入本金，下一期继续利滚利。本计算器支持初始本金、预期年化收益率、复利频率与每月定投金额，完整预测资产增长轨迹。',
				'长期定投结合复利效应，能将每月几百或几千元的小额结余转化为数倍乃至十倍以上的终身财富。',
			],
			faq: [
				{ q: 'What is the difference between simple and compound interest?', a: 'Simple interest only pays on original principal; compound interest pays on principal plus accumulated interest.' },
				{ q: 'Does compounding frequency matter?', a: 'Yes. More frequent compounding (e.g. monthly vs annually) produces slightly higher overall returns.' },
				{ q: 'Are monthly contributions added at the start or end of the month?', a: 'Added at the end of each month and start compounding in the following period.' },
			],
			faqZh: [
				{ q: '单利与复利有什么区别？', a: '单利永远只按初始本金计息；复利按不断滚存的总资产计息，即"利生利、利滚利"。' },
				{ q: '复利计息频率有影响吗？', a: '有影响。按月复利或按日复利比按年复利收益略高，时间越长差异越明显。' },
				{ q: '每月定投从什么时候开始计息？', a: '定投在每月月末投入，从下个月开始计入复利池产生收益。' },
			],
		},
	},
	{
		slug: 'investment-return',
		category: 'finance',
		name: 'Investment Return Calculator',
		nameZh: '投资回报与复利计算器',
		description: 'Redirects to the unified Compound Interest & Investment Return Calculator.',
		kind: 'redirect',
		config: { target: '/finance/compound-interest/' },
	},
	{
		slug: 'loan-payment',
		category: 'finance',
		name: 'Loan Payment Calculator',
		nameZh: '贷款月供与还款计划计算器',
		description: 'Monthly payment, total interest and a yearly amortization schedule for any fixed-rate loan.',
		kind: 'form',
		config: loanPayment,

		content: {
			about: [
				'Estimate the monthly payment and total interest for any fixed-rate loan — personal loan, car loan, or student debt — using the standard equal-payment amortization formula.',
				'The amortization schedule details how each payment divides between principal and interest, and how the principal payoff accelerates over time.',
			],
			aboutZh: [
				'用标准等额本息公式估算消费贷款、个人借款、助学贷款的月供与总利息支出。',
				'摊还计划表详细展示了每期还款中本金与利息的动态分配，以及后期本金偿还加速的过程。',
			],
			faq: [
				{ q: 'What is amortization?', a: 'A repayment structure where each equal monthly payment pays interest on the remaining balance first, with the rest reducing principal.' },
				{ q: 'Does a longer loan term cost more?', a: 'Yes. While monthly payments are lower, total interest paid over the life of the loan increases substantially.' },
			],
			faqZh: [
				{ q: '什么是等额本息（Amortization）？', a: '每月偿还固定金额，其中利息逐月减少、本金逐月增加，保持总月供恒定。' },
				{ q: '还款期限越长利息越多吗？', a: '是的。延长期限虽然能降低每月还款压力，但全周期支付的总利息会显著增加。' },
			],
		},
	},
	{
		slug: 'mortgage',
		category: 'finance',
		name: 'Mortgage Loan Calculator (Equal P&I vs Equal Principal)',
		nameZh: '房贷计算器 (等额本息 vs 等额本金对比)',
		description: 'Compare Equal Principal & Interest (等额本息) vs Equal Principal (等额本金), calculate monthly payments, interest savings, and support Commercial, Provident Fund, or Combined mortgages.',
		kind: 'form',
		config: mortgage,

		content: {
			about: [
				'Comprehensive mortgage calculator supporting Equal Principal & Interest (等额本息), Equal Principal (等额本金), Commercial loans, Housing Provident Fund (公积金), and Combined loans (组合贷款).',
				'Side-by-side comparison reveals the exact month-by-month payment difference, crossover payoff point, and total interest saved between the two repayment methods.',
			],
			aboutZh: [
				'专业级房贷综合计算器，深度支持【等额本息】与【等额本金】双方案同屏PK对比，支持商业贷款、纯公积金贷款以及公积金+商贷【组合贷款】。',
				'通过可视化对比清晰展示首月月供、每月递减金额、月供持平反超节点（Crossover）、累计利息差额与全周期还款明细，为您买房贷款决策提供科学客观的财务参考。',
			],
			faq: [
				{ q: 'What is the difference between Equal P&I and Equal Principal?', a: 'Equal P&I has fixed monthly payments throughout the loan. Equal Principal pays a fixed amount of principal each month plus accrued interest, so payments start highest and decrease every month, saving more total interest.' },
				{ q: 'Which repayment method is better: Equal P&I or Equal Principal?', a: 'Equal Principal saves significantly more interest overall, but requires higher monthly income in early years. Equal P&I is better if you prefer predictable cash flow or expect your income to rise in the future.' },
				{ q: 'How does a Combined Mortgage (组合贷款) work?', a: 'Combined loans combine low-interest Housing Provident Fund quotas with commercial bank loans, calculating interest on each portion at its respective rate.' },
			],
			faqZh: [
				{ q: '等额本息和等额本金有什么区别？哪种还款方式更划算？', a: '等额本息每月还款金额恒定，前期利息占比大，后期本金占比大；等额本金每月归还等额本金，利息随剩余本金逐月减少，因此首月还款最多并逐月递减。从全周期总支出看，等额本金节省的利息显著多于等额本息，但前期月供压力较大。' },
				{ q: '公积金贷款与商业贷款有什么利率差异？什么是组合贷款？', a: '公积金贷款利率通常明显低于商业贷款（如目前首套公积金5年以上为2.85%，商贷普遍在3.15%~3.45%）。当公积金可贷额度不足以覆盖购房所需总额时，可将公积金贷满，不足部分办理商业贷款，即为组合贷款。' },
				{ q: '提前还贷选等额本息还是等额本金更合适？', a: '若计划在贷款前几年提前还清，等额本金前期偿还的本金更多，剩余本金少于等额本息；等额本息前期还的大多是利息，提前还贷时本金基数依然较高。' },
			],
		},
	},
	{
		slug: 'irr-calculator',
		category: 'finance',
		name: 'True APR & Installment IRR Calculator',
		nameZh: '分期真实年化利率 / 实际利率 IRR 计算器',
		description: 'Convert advertised monthly installment fees or credit card flat rates to real APR and IRR.',
		kind: 'form',
		config: irrCalculator,

		content: {
			about: [
				'Uncover the real annualized interest rate (APR / IRR) behind credit card installments, consumer financing, and car loan promotions. Lenders often advertise nominal monthly handling fees (e.g. 0.6%/month) that look harmless, but the true annualized rate is almost double (around 13.5%+) because you repay principal each month while fees are charged on the entire initial sum.',
				'This calculator implements a robust Newton-Raphson internal rate of return (IRR) solver in your browser to give you the honest APR, effective annual rate (EAR), and total financing costs.',
			],
			aboutZh: [
				'揭秘信用卡账单分期、车贷分期及消费金融背后的真实年化利率（APR / IRR）。许多平台常宣传"月费率仅 0.6%"，让借款人误以为年利率只有 0.6% × 12 = 7.2%。但由于借款人每月都在归还本金，资金实际平均占用额仅为一半左右，导致真实年化利率高达 13.5% 以上！',
				'本计算器基于 Newton-Raphson 牛顿迭代数值算法，在浏览器本地秒级求解内部收益率（IRR），让您看清各种分期的真实融资成本，拒绝低费率消费陷阱。'
			],
			faq: [
				{ q: 'Why is true APR roughly twice the advertised fee rate?', a: 'When you repay equal principal each month, your average debt balance throughout the term is roughly half of the original loan. Charging fees on the full initial amount throughout the term means you are paying interest on money you have already paid back.' },
				{ q: 'What is the formula for calculating true APR?', a: 'It solves for internal rate of return (IRR) where the present value of all future installment cash flows equals the initial borrowed amount.' },
				{ q: 'Is IRR calculation safe and private?', a: '100% private and computed locally in your browser with zero server telemetry.' },
			],
			faqZh: [
				{ q: '为什么分期的真实利率几乎是宣传费率的两倍？', a: '因为分期每月都在偿还本金，您实际欠银行的钱逐月减少，平均欠款只有借款总额的一半左右；但银行手续费却始终按初始全额本金计算，相当于在为您已经还掉的钱继续支付利息。' },
				{ q: '国家对贷款明示年化利率有什么规定？', a: '中国人民银行早在 2021 年就要求所有从事贷款业务的机构必须明示贷款年化利率（采用 IRR 内部收益率口径计算），杜绝用"日息万分之五"、"月手续费 0.6%"误导消费者。' },
				{ q: '计算过程安全保密吗？', a: '完全在您本地浏览器中即时运算，不向任何服务器发送借贷数据，完全保护财务隐私。' },
			],
		},
	},
	{
		slug: 'inflation',
		category: 'finance',
		name: 'Inflation & Purchasing Power Calculator',
		nameZh: '通货膨胀与购买力缩水计算器',
		description: 'Calculate future purchasing power erosion and future equivalent cost based on annual inflation.',
		kind: 'form',
		config: inflation,

		content: {
			about: [
				'Inflation silently erodes purchasing power over time. At an average annual inflation rate of 3%, prices double roughly every 24 years, meaning $100,000 kept in uninvested cash will only buy half as much.',
				'This calculator evaluates how inflation compounds over 1 to 30 years, showing future price equivalents, the declining real value of cash, and total percentage purchasing power lost.',
			],
			aboutZh: [
				'通货膨胀是财富无声的侵蚀者。在年均 3% 的通胀率下，物价大约每 24 年翻一番；这意味着如果不进行抗通胀投资，储蓄的实际购买力将随时间腰斩。',
				'本工具帮您推演 1 至 30 年内通胀的复利影响，直观呈现未来等价商品所需金额、现金真实购买力贬值曲线与累计缩水比例。',
			],
			faq: [
				{ q: 'What is a typical annual inflation rate?', a: 'Central banks typically target around 2–3% annual inflation in normal economic environments.' },
				{ q: 'What is the Rule of 72?', a: 'Divide 72 by the inflation rate (e.g., 72 / 3 = 24) to estimate how many years it takes for prices to double.' },
			],
			faqZh: [
				{ q: '一般年均通货膨胀率是多少？', a: '全球主要央行通常将年通胀率目标定在 2%~3% 之间。' },
				{ q: '什么是"72法则"？', a: '用 72 除以年通胀率（例如 72 ÷ 3 = 24），即可快速估算出物价翻倍所需的年数。' },
			],
		},
	},
	{
		slug: 'savings-goal',
		category: 'finance',
		name: 'Savings Goal Calculator',
		nameZh: '目标储蓄规划计算器',
		description: 'Find the required monthly savings to achieve your financial goal by a target date.',
		kind: 'form',
		config: savingsGoal,

		content: {
			about: [
				'Plan your path to a major financial milestone — an emergency fund, home down payment, wedding, or dream vacation. Enter your target amount, existing balance, deadline, and expected return rate.',
				'The calculator reverse-engineers compound growth to determine the exact monthly contribution required, illustrating how much comes from your paycheck versus investment gains.',
			],
			aboutZh: [
				'为购房首付、应急备用金、子女教育或愿望基金设定清晰的达成路径。输入目标金额、现有存款、计划年限与预期投资收益率。',
				'计算器逆向求解复利模型，精准算出每月需存入的定投金额，并直观呈现个人自存本金与复合收益的各自贡献占比。',
			],
			faq: [
				{ q: 'How does expected return lower monthly savings?', a: 'Investment returns compound over time, meaning compound interest shoulders part of the financial target instead of purely out-of-pocket savings.' },
				{ q: 'What return rate should I use for short horizons?', a: 'For goals within 1–3 years, use conservative rates (2–4%) like money market or high-yield savings accounts.' },
			],
			faqZh: [
				{ q: '为什么收益率能减少每月需存金额？', a: '投资收益在持有期间持续复利滚存，利息为你承担了相当一部分目标总额，减轻了自筹本金的压力。' },
				{ q: '短期目标建议按多高收益率计算？', a: '1~3 年的短期目标建议按货币基金或高流动性存款收益率（2%~4%）保守估算，避免资本波动风险。' },
			],
		},
	},
	{
		slug: 'auto-loan',
		category: 'finance',
		name: 'Auto Loan & Out-of-Pocket Calculator',
		nameZh: '汽车贷款与购车落地成本计算器',
		description: 'Monthly car loan payments, interest, down payment, purchase tax, insurance, and total out-of-pocket落地 cost.',
		kind: 'form',
		config: autoLoan,

		content: {
			about: [
				'Buying a car requires more than just the sticker price or monthly installment. You must budget for the down payment, vehicle purchase tax, initial insurance, registration, and loan interest.',
				'This calculator computes your full upfront cash requirement, monthly car note, total interest paid, and the total cost of ownership across the entire financing period.',
			],
			aboutZh: [
				'买车不仅要看裸车指导价或月供，更需全盘考量首付、车辆购置税、首年车险、上牌杂费与贷款利息等全部开支。',
				'本计算器帮您全面算清提车所需的首期落地总现金、每月实际月供、贷款利息总额以及全周期综合购车支出。',
			],
			faq: [
				{ q: 'What is a typical down payment for a car loan?', a: 'Most buyers put down 20% to 30%, which lowers monthly payments and keeps negative equity risks minimal.' },
				{ q: 'How is vehicle purchase tax calculated in China?', a: 'Generally calculated as: Sticker Price ÷ 1.13 × 10% (around 8.85% of invoice price).' },
			],
			faqZh: [
				{ q: '汽车贷款首付比例一般是多少？', a: '通常为 20%~30%，适当提高首付可减少利息开销并降低每月月供压力。' },
				{ q: '国内汽车购置税怎么计算？', a: '按计税价格的 10% 征收，即 裸车开票价 ÷ 1.13 × 10%（约合裸车价的 8.85%）。新能源汽车在免征额度内可享受免税优惠。' },
			],
		},
	},
	{
		slug: 'fire-calculator',
		category: 'finance',
		name: 'FIRE Calculator (Financial Independence)',
		nameZh: 'FIRE 财务自由与提前退休计算器',
		description: 'Determine your target nest egg, projected retirement age, and safe withdrawal strategy using the 4% rule.',
		kind: 'form',
		config: fireCalculator,

		content: {
			about: [
				'FIRE stands for Financial Independence, Retire Early. Rooted in the landmark Trinity Study, the 4% Safe Withdrawal Rule suggests that if you accumulate 25 times your annual living expenses (or 1 ÷ 0.04), your investment portfolio can sustain your lifestyle indefinitely.',
				'Enter your current age, annual living expenses, existing investment assets, and ongoing savings rate. This calculator maps out your trajectory to Lean FIRE, Regular FIRE, and Fat FIRE milestones.',
			],
			aboutZh: [
				'FIRE（Financial Independence, Retire Early）即"财务自由，提前退休"。基于著名的 Trinity Study 4% 安全提款法则：当你积累的生息资产达到年度生活开支的 25 倍（1 ÷ 0.04）时，资产产生的被动收益即可永续覆盖生活开支。',
				'输入您的年龄、预期年开销、现有生息资产与每年新增储蓄，计算器即可为您测算迈向 Lean FIRE（极简自由）、标准 FIRE 与 Fat FIRE（富足自由）的时间表与退休年龄。',
			],
			faq: [
				{ q: 'What is the 4% rule in FIRE?', a: 'Historical analysis shows that withdrawing 4% of a balanced stock/bond portfolio annually (adjusted for inflation) has over 95% probability of never running out of money over 30+ years.' },
				{ q: 'What is the difference between Lean FIRE and Fat FIRE?', a: 'Lean FIRE covers essential frugal living expenses (~75% of baseline); Fat FIRE provides abundant luxury and travel (~125%+ of baseline).' },
			],
			faqZh: [
				{ q: '什么是 FIRE 运动中的 4% 法则？', a: '历史资产回测表明，每年从股债多元投资组合中提取不超过 4%（并随通胀微调），在 30 年以上的周期里有超过 95% 的概率本金永不枯竭。' },
				{ q: 'Lean FIRE 与 Fat FIRE 有什么区别？', a: 'Lean FIRE 为极简生活主义（按基准支出 75% 测算）；Fat FIRE 为宽裕奢华生活（按基准支出 125% 以上测算），满足更高品质的休闲与旅行需求。' },
			],
		},
	},
	{
		slug: 'tax',
		category: 'finance',
		name: 'Income Tax & Take-Home Salary Calculator',
		nameZh: '个人所得税计算器 (五险一金/专项扣除/年终奖)',
		description: 'Calculate net income, tax brackets, Five Insurances & Housing Fund, 7 Special Deductions, and Year-End Bonus tax optimization (Separate vs Combined).',
		kind: 'form',
		config: tax,

		content: {
			about: [
				'Accurately compute net take-home salary, progressive tax brackets, Five Insurances & Housing Fund contributions, 7 Special Additional Deductions, and Year-End Bonus tax schemes (Separate vs Combined). Supports Chinese Individual Income Tax (新个税综合所得七级累进), US Federal Income Tax (Single), and customizable Flat Tax rates.',
				'Under Chinese tax law, your gross income is reduced by standard deductions (60,000 RMB/year or 5,000 RMB/month), employee social security (pension 8%, medical 2%, unemployment 0.5%, housing fund 5%~12%), and 7 categories of special additional deductions before progressive bracket rates (3% to 45%) are applied.',
				'Year-end bonus can be calculated under the preferential separate taxation policy (extended through 2027) or combined into annual comprehensive income. The calculator automatically analyzes both routes, identifies the exact tax difference, and warns against known bracket jump pitfalls (多发少得盲区).',
			],
			aboutZh: [
				'全面支持中国新个人所得税（七级超额累进综合所得税率）、五险一金个人扣除、最新 7 项专项附加扣除以及全年一次性奖金（年终奖）计税优化方案。同时兼容美国联邦个人所得税（Single 单身标准）与自定义单一税率。',
				'中国新个税实施年度综合汇算清缴制度，以税前总收入扣除 60,000 元/年（5,000 元/月）基本减除费用、五险一金（养老 8%、医疗 2%、失业 0.5%、住房公积金 5%~12%）以及 7 项专项附加扣除后作为应纳税所得额，适用 3% 至 45% 的七级累进税率。',
				'针对年终奖，财政部与税务总局延续全年一次性奖金单独计税优惠政策至 2027 年 12 月 31 日。计算器支持【单独计税（除以12查月度税率）】与【并入当年综合所得】双向对比与智能优选推荐，并对 3.6万、14.4万、30万、42万、66万、96万等“多发1元到手反少几千上万元”的税收临界点盲区提供即时警示。',
			],
			faq: [
				{ q: 'How are the Five Insurances and Housing Fund calculated for employees?', a: 'In China, employees typically contribute 8% for basic pension, 2% for basic medical, 0.5% for unemployment, and 5% to 12% for the housing provident fund (totaling around 15.5%~22.5% of monthly pay within local contribution base limits). Work injury and maternity insurances are paid entirely by employers.' },
				{ q: 'What are the current standards for China’s 7 Special Additional Deductions?', a: 'According to State Council standards: Infant care under 3 (2,000 RMB/mo/child), Children education (2,000 RMB/mo/child), Elderly care (3,000 RMB/mo for only child, max 1,500 RMB/mo shared), First home mortgage interest (1,000 RMB/mo), Housing rent (800–1,500 RMB/mo depending on city), Continuing education (400 RMB/mo or 3,600 RMB/year for qualification exams), and Serious illness medical expenses (up to 80,000 RMB/year).' },
				{ q: 'Should I choose Separate Taxation or Combined Taxation for my Year-End Bonus?', a: 'Separate taxation is generally advantageous for middle and higher earners because the bonus is divided by 12 to capture lower brackets (3%, 10%) independently. However, if your regular salary does not fully use the 60,000 RMB basic deduction or special deductions, combined taxation allows the unused deduction to offset the bonus, saving more tax. This calculator automatically calculates both and recommends the best choice.' },
				{ q: 'What is the Year-End Bonus "tax pitfall" (多发少得盲区)?', a: 'Under separate taxation, when the bonus crosses a bracket boundary by just 1 RMB (such as 36,001 RMB vs 36,000 RMB, or 144,001 RMB vs 144,000 RMB), the entire bonus is taxed at the higher marginal rate, causing the tax owed to jump drastically and leaving you with less take-home pay than if you had received less bonus. The calculator detects this interval and alerts you to negotiate the optimal payout.' },
			],
			faqZh: [
				{ q: '五险一金个人扣除的标准和比例通常是多少？', a: '在我国，个人承担部分通常包含：基本养老保险（8%）、基本医疗保险（2%）、失业保险（0.5%）以及住房公积金（5%~12%，常见 7%~12%），个人扣缴合计比例约为 15.5%~22.5%（以当地社保公积金月缴费基数上下限为准），均在税前全额扣除；工伤保险与生育保险由用人单位全额承担，个人无需缴费。' },
				{ q: '2024年最新 7 项专项附加扣除标准包含哪些？', a: '国务院最新调整标准：①3岁以下婴幼儿照护：2,000元/月/孩；②子女教育：2,000元/月/孩；③赡养老人：独生子女 3,000元/月，非独生子女与其他兄弟姐妹分摊每人每月最高不超过 1,500元；④住房贷款利息：首套房贷 1,000元/月；⑤住房租金：直辖市/省会/副省级城市 1,500元/月，其他市县 800~1,100元/月；⑥继续教育：学历教育 400元/月，职业资格证书 3,600元/年；⑦大病医疗：医保自付超 15,000元部分，在 80,000元/年限额内据实扣除。' },
				{ q: '年终奖单独计税与合并计税，哪种更划算？', a: '绝大多数情况下【单独计税】更划算，因为将年终奖除以12单独对照月度税率表，能重复利用 3% 和 10% 等低税率档位；但在基本月薪较低（全年月度工资未能扣满 6 万元免征额及五险一金与专项附加扣除）时，选择【并入综合所得】能把没用完的扣除额度抵扣年终奖，反而更省税。本工具支持智能优选，自动为您对比两者税额并推荐最佳方案。' },
				{ q: '什么是年终奖“多发1元到手反而少拿几千块”的税收盲区？', a: '在单独计税方式下，当奖金跨越税率分界线（如 36,000元、144,000元、300,000元、420,000元、660,000元、960,000元）时，整笔年终奖全额适用跃迁后的高税率，导致税款骤增。例如发放 36,001元比发放 36,000元税后实际到手少 2,309.10元！本计算器会自动检测并标红预警该盲区，建议您主动与单位人事沟通合理调整申报金额。' },
			],
		},
	},
	{
		slug: 'salary',
		category: 'finance',
		name: 'Salary & Hourly Wage Converter',
		nameZh: '薪资与时薪日薪换算器',
		description: 'Convert annual salary into hourly, weekly, biweekly, monthly and daily compensation.',
		kind: 'form',
		config: salary,

		content: {
			about: [
				'Convert an annual salary into equivalent hourly, daily, weekly, biweekly, and monthly rates. Useful when comparing contractor hourly billing rates to full-time salaried job offers.',
				'Based on 40 hours per week and 52 working weeks per year (2,080 working hours), customizable to your exact schedule.',
			],
			aboutZh: [
				'将年薪灵活换算为对应的时薪、日薪、周薪、双周薪与月薪。在对比外包自由职业时薪与全职 Offer、或进行个人工时估值时极其实用。',
				'默认按全职每周 40 小时、每年 52 周（共 2080 小时）计算，可根据实际工作时间自由调整。',
			],
			faq: [
				{ q: 'How many work hours are in a standard year?', a: 'A standard full-time schedule (40 hours/week × 52 weeks) equals 2,080 working hours per year.' },
			],
			faqZh: [
				{ q: '全职一年的标准工作工时是多少？', a: '按每周 40 小时 × 每年 52 周计算，全职一年约为 2080 个工作工时。' },
			],
		},
	},
	{
		slug: 'roi',
		category: 'finance',
		name: 'ROI Calculator',
		nameZh: '投资回报率 (ROI) 计算器',
		description: 'Return on investment from cost and revenue, with net profit and return multiple.',
		kind: 'form',
		config: roi,

		content: {
			about: [
				'Return on investment (ROI) measures efficiency: net profit divided by cost. Enter what you spent and what you recovered to see ROI percentage, net profit, and return multiple.',
			],
			aboutZh: [
				'投资回报率（ROI）衡量资金利用效率：净利润除以投入成本。输入投入成本与回收金额，即可得到 ROI 百分比、净利润与回报倍数。',
			],
			faq: [
				{ q: 'Can ROI be negative?', a: 'Yes. When revenue is less than initial cost, ROI is negative, representing a financial loss.' },
			],
			faqZh: [
				{ q: 'ROI 可以是负数吗？', a: '可以。当回收金额低于投入成本时，ROI 为负数，表示发生亏损。' },
			],
		},
	},
	{
		slug: 'discount',
		category: 'finance',
		name: 'Discount & Sale Calculator',
		nameZh: '折扣降价与购物优惠计算器',
		description: 'Final price and total savings from a percentage discount, for single or bulk quantities.',
		kind: 'form',
		config: discount,

		content: {
			about: [
				'Work out final price after a percentage discount and how much you save per item or for the whole cart.',
			],
			aboutZh: [
				'计算打折促销后的实际到手价与单件或整单节省金额。',
			],
			faq: [
				{ q: 'How do stacked discounts work?', a: 'Stacked discounts are multiplicative, not additive: 20% off plus another 20% off equals 36% total discount (0.8 × 0.8 = 0.64).' },
			],
			faqZh: [
				{ q: '多重折扣叠加如何计算？', a: '叠加折扣是相乘而非相加：例如打 8 折再打 8 折，总折扣是 6.4 折（0.8 × 0.8 = 0.64），省 36% 而非 40%。' },
			],
		},
	},
];
