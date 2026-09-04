// Registry entries for /finance/* — all form tools, several with result
// tables (compound interest year by year, loan amortization, mortgage prepayment, etc.).

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

// --- compound interest (incorporating investment return) ------------------------

const compoundInterest: FormConfig = {
	intro: 'Compounded growth with an optional monthly contribution and year-by-year schedule.',
	fields: [
		{ id: 'p', label: 'Principal / Starting balance', labelZh: '初始投资本金', suffix: '($ / ¥)', type: 'number', def: '10000', step: 'any', min: '0' },
		{ id: 'r', label: 'Annual interest rate / return', labelZh: '预期年化收益率 / 利率', suffix: '(%)', type: 'number', def: '6', step: 'any' },
		{ id: 't', label: 'Investment horizon', labelZh: '投资年限', suffix: '(years / 年)', type: 'number', def: '10', step: 'any', min: '0' },
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
		{ id: 'loan', label: 'Original loan amount', labelZh: '原贷款本金', suffix: '($ / ¥)', type: 'number', def: '1000000', step: 'any', min: '0' },
		{ id: 'rate', label: 'Annual interest rate', labelZh: '贷款年化利率', suffix: '(%)', type: 'number', def: '3.8', step: 'any', min: '0' },
		{ id: 'years', label: 'Original loan term', labelZh: '原贷款期限', suffix: '(years / 年)', type: 'number', def: '30', step: '1', min: '1' },
		{ id: 'paidMonths', label: 'Months already paid', labelZh: '已正常还款月数', suffix: '(months / 个月)', type: 'number', def: '36', step: '1', min: '0' },
		{ id: 'prepay', label: 'Lump-sum prepayment amount', labelZh: '本次提前还贷金额', suffix: '($ / ¥)', type: 'number', def: '200000', step: 'any', min: '0' },
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
		{ id: 'amount', label: 'Current amount / Present value', labelZh: '当前金额 / 资产现值', suffix: '($ / ¥)', type: 'number', def: '100000', step: 'any', min: '0' },
		{ id: 'rate', label: 'Average annual inflation rate', labelZh: '年均通货膨胀率', suffix: '(%)', type: 'number', def: '3', step: 'any' },
		{ id: 'years', label: 'Time horizon', labelZh: '时间跨度', suffix: '(years / 年)', type: 'number', def: '20', step: 'any', min: '0' },
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
		{ id: 'target', label: 'Target savings goal', labelZh: '目标储蓄规划总额', suffix: '($ / ¥)', type: 'number', def: '500000', step: 'any', min: '0' },
		{ id: 'current', label: 'Current initial savings', labelZh: '当前已有初始存款', suffix: '($ / ¥)', type: 'number', def: '50000', step: 'any', min: '0' },
		{ id: 'years', label: 'Time to reach goal', labelZh: '计划储备年限', suffix: '(years / 年)', type: 'number', def: '5', step: 'any', min: '0.1' },
		{ id: 'rate', label: 'Expected annual return rate', labelZh: '预期年化投资收益率', suffix: '(%)', type: 'number', def: '5', step: 'any' },
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
		{ id: 'carPrice', label: 'Vehicle price', labelZh: '车辆裸车指导价', suffix: '($ / ¥)', type: 'number', def: '150000', step: 'any', min: '0' },
		{ id: 'downPct', label: 'Down payment percentage', labelZh: '首付比例', suffix: '(%)', type: 'number', def: '20', step: 'any', min: '0', max: '100' },
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
		{ id: 'rate', label: 'Annual interest rate', labelZh: '车贷年化利率', suffix: '(%)', type: 'number', def: '4.5', step: 'any', min: '0' },
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
		{ id: 'principal', label: 'Borrowed principal', labelZh: '分期 / 借款本金', suffix: '($ / ¥)', type: 'number', def: '12000', step: 'any', min: '0' },
		{ id: 'periods', label: 'Installment periods', labelZh: '分期总期数', suffix: '(months / 期)', type: 'number', def: '12', step: '1', min: '1' },
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
		{ id: 'feeRate', label: 'Monthly fee rate', labelZh: '每期手续费率', suffix: '(%)', type: 'number', def: '0.6', step: 'any', min: '0', hint: 'Used when "Monthly fee rate" is selected', hintZh: '仅在选择"按每月手续费率"时生效' },
		{ id: 'monthlyPay', label: 'Monthly payment amount', labelZh: '每期固定还款额', suffix: '($ / ¥)', type: 'number', def: '1072', step: 'any', min: '0', hint: 'Used when "Fixed monthly payment" is selected', hintZh: '仅在选择"按每期固定还款金额"时生效' },
		{ id: 'totalFee', label: 'Total fee / interest', labelZh: '总手续费或总利息', suffix: '($ / ¥)', type: 'number', def: '864', step: 'any', min: '0', hint: 'Used when "Total fee" is selected', hintZh: '仅在选择"按总手续费"时生效' },
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
		{ id: 'age', label: 'Current age', labelZh: '当前年龄', suffix: '(years / 岁)', type: 'number', def: '30', step: '1', min: '18', max: '80' },
		{ id: 'annualExp', label: 'Expected annual living expenses in retirement', labelZh: '退休后预期年生活支出', suffix: '($ / ¥)', type: 'number', def: '100000', step: 'any', min: '0' },
		{ id: 'currentAssets', label: 'Current net investment assets', labelZh: '当前已有可投资生息净资产', suffix: '($ / ¥)', type: 'number', def: '300000', step: 'any', min: '0' },
		{ id: 'annualSave', label: 'Annual savings added to investments', labelZh: '每年新增投资结余 (年储蓄额)', suffix: '($ / ¥)', type: 'number', def: '80000', step: 'any', min: '0' },
		{ id: 'returnRate', label: 'Expected annual net return rate', labelZh: '预期年化投资回报率 (扣除通胀后)', suffix: '(%)', type: 'number', def: '6', step: 'any' },
		{ id: 'swr', label: 'Safe withdrawal rate (SWR)', labelZh: '安全提款率 (SWR)', suffix: '(%)', type: 'number', def: '4', step: 'any', hint: 'Standard 4% rule (Trinity Study)', hintZh: 'Trinity 经典 4% 法则 (即 25 倍年支出)' },
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
	fields: [
		{ id: 'amount', label: 'Loan amount', labelZh: '贷款本金', suffix: '($ / ¥)', type: 'number', def: '30000', step: 'any', min: '0' },
		{ id: 'rate', label: 'Annual interest rate', labelZh: '贷款年化利率', suffix: '(%)', type: 'number', def: '6', step: 'any' },
		{ id: 'years', label: 'Term', labelZh: '还款期限', suffix: '(years / 年)', type: 'number', def: '5', step: 'any', min: '0' },
	],
	compute: (v) => {
		const amount = v.num('amount');
		const rate = v.num('rate');
		const years = v.num('years');
		const months = Math.round(years * 12);
		if (!(amount > 0) || !(months > 0)) {
			return { rows: [{ label: 'Monthly payment', labelZh: '每月月供', value: '— (amount and term must be > 0)' }] };
		}
		const pay = monthlyPayment(amount, rate, months);
		const { rows: tableRows, totalInterest } = amortize(amount, rate, months);
		return {
			rows: [
				{ label: 'Monthly payment', labelZh: '每月还款额 (月供)', value: money(pay), emphasis: true },
				{ label: 'Number of payments', labelZh: '还款期数 (月数)', value: `${months} months / 期` },
				{ label: 'Total repayment (Principal + Interest)', labelZh: '还款本息总额', value: money(pay * months) },
				{ label: 'Total interest paid', labelZh: '支付利息总计', value: money(totalInterest) },
			],
			table: {
				columns: ['Year', 'Principal Paid', 'Interest Paid', 'Remaining Balance'],
				columnsZh: ['年份', '已还本金', '已付利息', '剩余本金余额'],
				rows: tableRows,
			},
		};
	},
};

// --- mortgage -----------------------------------------------------------------------

const mortgage: FormConfig = {
	fields: [
		{ id: 'price', label: 'Home price', labelZh: '房产总售价', suffix: '($ / ¥)', type: 'number', def: '350000', step: 'any', min: '0' },
		{ id: 'down', label: 'Down payment', labelZh: '购房首付款', suffix: '($ / ¥)', type: 'number', def: '70000', step: 'any', min: '0' },
		{ id: 'rate', label: 'Annual interest rate', labelZh: '房贷年化利率', suffix: '(%)', type: 'number', def: '4.5', step: 'any' },
		{ id: 'years', label: 'Term', labelZh: '按揭年限', suffix: '(years / 年)', type: 'number', def: '30', step: 'any', min: '0' },
		{ id: 'tax', label: 'Property tax per year', labelZh: '年房产税', suffix: '($ / ¥)', type: 'number', def: '4200', step: 'any', min: '0' },
		{ id: 'ins', label: 'Insurance per year', labelZh: '年房屋保险', suffix: '($ / ¥)', type: 'number', def: '1500', step: 'any', min: '0' },
		{ id: 'hoa', label: 'HOA fees per month', labelZh: '每月物业管理费', suffix: '($ / ¥)', type: 'number', def: '0', step: 'any', min: '0' },
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
			rows.push({ label: 'Down payment exceeds the home price — no loan needed.', labelZh: '首付金额超过房价，无需办理贷款。', value: '' });
			return { rows };
		}
		if (!(loan > 0) || !(months > 0)) {
			rows.push({ label: 'Monthly payment', labelZh: '每月月供', value: '— (loan amount and term must be > 0)' });
			return { rows };
		}
		const pi = monthlyPayment(loan, rate, months);
		const monthlyExtras = v.num('tax') / 12 + v.num('ins') / 12 + v.num('hoa');
		const { rows: tableRows, totalInterest } = amortize(loan, rate, months);
		return {
			rows: [
				{ label: 'Total monthly payment', labelZh: '每月总供款 (含税费保险)', value: money(pi + monthlyExtras), emphasis: true },
				{ label: 'Principal & interest (P&I)', labelZh: '贷款本息月供', value: money(pi) },
				{ label: 'Property tax (monthly)', labelZh: '每月房产税', value: money(v.num('tax') / 12) },
				{ label: 'Home insurance (monthly)', labelZh: '每月房屋保险', value: money(v.num('ins') / 12) },
				{ label: 'HOA fees', labelZh: '每月物业管理费', value: money(v.num('hoa')) },
				{ label: 'Loan principal', labelZh: '贷款总额', value: money(loan) },
				{ label: 'Total interest over term', labelZh: '全周期利息总额', value: money(totalInterest) },
			],
			table: {
				columns: ['Year', 'Principal Paid', 'Interest Paid', 'Remaining Balance'],
				columnsZh: ['年份', '已还本金', '已付利息', '剩余本金余额'],
				rows: tableRows,
			},
		};
	},
};

// --- roi ---------------------------------------------------------------------------------

const roi: FormConfig = {
	intro: 'ROI = (revenue − cost) ÷ cost × 100.',
	fields: [
		{ id: 'cost', label: 'Cost of investment', labelZh: '投资成本', suffix: '($ / ¥)', type: 'number', def: '1000', step: 'any' },
		{ id: 'revenue', label: 'Revenue / Final value', labelZh: '回收金额 / 终值', suffix: '($ / ¥)', type: 'number', def: '1500', step: 'any' },
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
		{ id: 'price', label: 'Original price', labelZh: '商品原价', suffix: '($ / ¥)', type: 'number', def: '100', step: 'any', min: '0' },
		{ id: 'pct', label: 'Discount percentage off', labelZh: '折扣率 (%)', suffix: '(%)', type: 'number', def: '20', step: 'any' },
		{ id: 'qty', label: 'Quantity', labelZh: '购买件数', type: 'number', def: '1', step: '1', min: '1' },
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
		{ id: 'annual', label: 'Annual salary', labelZh: '年薪总额', suffix: '($ / ¥)', type: 'number', def: '60000', step: 'any', min: '0' },
		{ id: 'hours', label: 'Hours per week', labelZh: '每周工作小时数', type: 'number', def: '40', step: 'any', min: '0' },
		{ id: 'weeks', label: 'Working weeks per year', labelZh: '每年工作周数', type: 'number', def: '52', step: 'any', min: '0' },
		{ id: 'days', label: 'Working days per week', labelZh: '每周工作天数', type: 'number', def: '5', step: 'any', min: '0' },
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

// --- progressive & flat tax -----------------------------------------------------

const tax: FormConfig = {
	intro: 'Calculate net income, tax brackets, and effective rate with China IIT, US Federal, or Flat tax.',
	fields: [
		{ id: 'gross', label: 'Gross income', labelZh: '税前收入', suffix: '($ / ¥)', type: 'number', def: '120000', step: 'any', min: '0' },
		{
			id: 'period',
			label: 'Income period',
			labelZh: '计税周期',
			type: 'select',
			def: 'annual',
			options: [
				{ value: 'annual', label: 'Annual (per year)', labelZh: '按年薪计算' },
				{ value: 'monthly', label: 'Monthly (per month)', labelZh: '按月薪计算' },
			],
		},
		{
			id: 'regime',
			label: 'Tax regime',
			labelZh: '税制方案',
			type: 'select',
			def: 'cn',
			options: [
				{ value: 'cn', label: 'China Individual Income Tax (中国新个税 3%~45% 七级累进)', labelZh: '中国新个人所得税 (七级超额累进)' },
				{ value: 'us_single', label: 'US Federal Income Tax (美国联邦税 Single 单身)', labelZh: '美国联邦个人所得税 (Single 单身标准)' },
				{ value: 'flat', label: 'Flat Tax Rate (固定单一税率)', labelZh: '固定单一税率' },
			],
		},
		{ id: 'deduction', label: 'Pre-tax deductions', labelZh: '税前附加扣除 / 社保公积金', suffix: '($ / ¥)', type: 'number', def: '0', step: 'any', min: '0', hint: 'Social security, 401k, or special additional deductions per period', hintZh: '每期五险一金或专项附加扣除金额' },
		{ id: 'flatRate', label: 'Flat rate (%)', labelZh: '单一固定税率 (%)', suffix: '(%)', type: 'number', def: '20', step: 'any', min: '0', hint: 'Only used when "Flat Tax Rate" is chosen', hintZh: '仅在选择"固定单一税率"时生效' },
	],
	compute: (v) => {
		const rawGross = v.num('gross');
		const period = v.str('period');
		const regime = v.str('regime');
		const rawDeduction = v.num('deduction');
		const flatRate = v.num('flatRate') / 100;

		const annualGross = period === 'monthly' ? rawGross * 12 : rawGross;
		const annualDeduction = period === 'monthly' ? rawDeduction * 12 : rawDeduction;

		let annualTax = 0;
		let taxableIncome = 0;
		let marginalRate = 0;
		const tableRows: string[][] = [];

		if (regime === 'cn') {
			// China Individual Income Tax: standard deduction 60,000/yr (5,000/mo)
			const standardDeduction = 60000;
			taxableIncome = Math.max(0, annualGross - standardDeduction - annualDeduction);
			const brackets = [
				{ max: 36000, rate: 0.03 },
				{ max: 144000, rate: 0.10 },
				{ max: 300000, rate: 0.20 },
				{ max: 420000, rate: 0.25 },
				{ max: 660000, rate: 0.30 },
				{ max: 960000, rate: 0.35 },
				{ max: Infinity, rate: 0.45 },
			];
			let prev = 0;
			for (const b of brackets) {
				if (taxableIncome > prev) {
					const inBracket = Math.min(taxableIncome, b.max) - prev;
					const taxInBracket = inBracket * b.rate;
					annualTax += taxInBracket;
					marginalRate = b.rate * 100;
					tableRows.push([
						`${prev ? money(prev) : '0'} – ${b.max === Infinity ? 'Above' : money(b.max)}`,
						`${(b.rate * 100).toFixed(0)}%`,
						money(inBracket),
						money(taxInBracket),
					]);
					prev = b.max;
				} else {
					break;
				}
			}
		} else if (regime === 'us_single') {
			// US Federal Tax (Single 2024/2026 baseline): standard deduction $14,600
			const standardDeduction = 14600;
			taxableIncome = Math.max(0, annualGross - standardDeduction - annualDeduction);
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
					tableRows.push([
						`${prev ? money(prev) : '0'} – ${b.max === Infinity ? 'Above' : money(b.max)}`,
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
			taxableIncome = Math.max(0, annualGross - annualDeduction);
			annualTax = taxableIncome * flatRate;
			marginalRate = flatRate * 100;
			tableRows.push(['All taxable income', `${(flatRate * 100).toFixed(1)}%`, money(taxableIncome), money(annualTax)]);
		}

		const annualNet = annualGross - annualTax;
		const monthlyNet = annualNet / 12;
		const monthlyTax = annualTax / 12;
		const effectiveRate = annualGross > 0 ? (annualTax / annualGross) * 100 : 0;

		return {
			rows: [
				{ label: 'Net take-home income (Annual)', labelZh: '税后净收入 (年度到手)', value: money(annualNet), emphasis: true },
				{ label: 'Net take-home income (Monthly average)', labelZh: '税后净收入 (月均到手)', value: money(monthlyNet) },
				{ label: 'Total tax owed (Annual)', labelZh: '应缴个人所得税 (年度总税额)', value: money(annualTax) },
				{ label: 'Tax owed (Monthly average)', labelZh: '应缴个人所得税 (月均)', value: money(monthlyTax) },
				{ label: 'Effective tax rate', labelZh: '实际综合有效税率', value: `${formatNumber(effectiveRate)}%` },
				{ label: 'Marginal top tax bracket', labelZh: '最高适用边际税率', value: `${marginalRate.toFixed(0)}%` },
				{ label: 'Taxable income', labelZh: '应纳税所得额', value: money(taxableIncome) },
			],
			table: tableRows.length
				? {
						columns: ['Tax Bracket', 'Rate', 'Taxable in Bracket', 'Tax Owed'],
						columnsZh: ['税率阶梯', '适用税率', '级内应纳税所得额', '本级应纳税额'],
						rows: tableRows,
					}
				: undefined,
			note: `On an annual gross of ${money(annualGross)}, total tax is ${money(annualTax)} (effective rate of ${formatNumber(effectiveRate)}%), leaving ${money(annualNet)} take-home.`,
			noteZh: `在税前年收入 ${money(annualGross)} 情况下，全年度个人所得税为 ${money(annualTax)}（综合实际税率 ${formatNumber(effectiveRate)}%），税后实际到手 ${money(annualNet)}（月均 ${money(monthlyNet)}）。`,
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
		name: 'Mortgage Calculator',
		nameZh: '房贷月供与购房成本计算器',
		description: 'Monthly mortgage payment including principal, interest, property tax, home insurance and HOA fees.',
		kind: 'form',
		config: mortgage,

		content: {
			about: [
				'A real home mortgage involves more than loan principal and interest: property taxes, homeowners insurance, and HOA dues are typically paid alongside the mortgage. This calculator provides the complete monthly housing cost and a full multi-year amortization schedule.',
				'A 20% down payment eliminates the need for private mortgage insurance (PMI) and lowers the principal amount.',
			],
			aboutZh: [
				'真实的房贷支出不仅仅是本金和利息：房产税、房屋保险与物业费通常随月供一同支出。本计算器给出完整的综合月供开销与逐年摊还明细。',
				'提供 20% 以上首付款不仅能降低贷款本金，还能免去额外的贷款保险费用。',
			],
			faq: [
				{ q: 'How is the mortgage payment calculated?', a: 'Using standard monthly amortization formula based on home price minus down payment, annual rate, and loan term.' },
				{ q: 'What are escrow expenses?', a: 'Taxes and insurance collected monthly by the lender and paid on your behalf.' },
			],
			faqZh: [
				{ q: '房贷月供如何计算？', a: '以房价减去首付后的贷款本金为基础，结合执行年利率与贷款年限，按等额本息标准公式摊还。' },
				{ q: '附加费用（税费保险）是必须的吗？', a: '根据当地政策与小区规定，房产税、房屋保险与物业费通常属于固定持有成本。' },
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
		nameZh: '个人所得税与税后薪资计算器',
		description: 'Calculate net income, tax brackets, and effective rate with China IIT, US Federal, or Flat tax.',
		kind: 'form',
		config: tax,

		content: {
			about: [
				'Compute your true take-home pay, progressive tax brackets, and effective tax rate. Choose between Chinese Individual Income Tax (新个税七级超额累进), US Federal Tax (Single brackets), or a customized flat rate.',
				'Standard deductions and pre-tax withholdings (such as social security, 401(k), and special deductions) are deducted before computing bracket taxes, giving you an accurate financial picture.',
			],
			aboutZh: [
				'精准计算税后到手收入、个税阶梯分布与综合实际税率。支持中国新个税（七级超额累进税率）、美国联邦个人所得税（Single 单身标准）以及自定义单一税率模式。',
				'支持输入起征点免征额、社保五险一金以及专项附加扣除，完整呈现各档阶梯纳税额度与月均到手薪资。',
			],
			faq: [
				{ q: 'What is the difference between marginal and effective tax rate?', a: 'Marginal rate is the tax paid on your last dollar of income (the highest bracket); effective rate is total tax divided by total gross income.' },
				{ q: 'How does China Individual Income Tax bracket system work?', a: 'It calculates cumulative annual taxable income after a standard 60,000 RMB deduction (5,000/month) and social security, applying progressive rates from 3% to 45%.' },
			],
			faqZh: [
				{ q: '边际税率与实际税率有什么区别？', a: '边际税率是您最后一元收入所适用的最高税率档位；实际综合税率是总纳税额除以总收入的实际百分比，通常远低于边际税率。' },
				{ q: '中国新个税的计算规则是怎样的？', a: '采用年度综合所得计税，扣除每年 6 万元基本减除费用（5000元/月）及五险一金与专项附加扣除后，按 3% 至 45% 七级超额累进税率计算。' },
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
