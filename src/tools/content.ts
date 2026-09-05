// Editorial prose (about paragraphs + FAQ) for every registry-driven tool page,
// keyed "<category>/<slug>". Rendered into the page's HTML by ToolShell at build
// time; nothing here runs in the browser.
//
// It lives in its own module rather than on the ToolEntry objects for one
// measurable reason. src/scripts/tools/main.ts imports the registry to look up a
// single entry's kind and config, which makes every entry object reachable — and
// Rollup can drop an unused top-level *export* (TOOL_KEYWORDS is proof) but not
// an unused *property* of an object it has to keep. So prose stored on an entry
// was bundled into the client chunk that every tool page loads: 76,008 B raw /
// 25,922 B brotli of text the browser never reads, on top of the same words
// already present in the HTML. e2e/perf-budget.spec.ts pins that it stays out.
import type { ToolContent } from './registry';

export const TOOL_CONTENT: Record<string, ToolContent> = {
	'calculators/percentage': {
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
	'calculators/percentage-increase': {
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
	'calculators/fraction': {
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
	'calculators/average': {
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
	'calculators/ratio': {
		about: [
			'Simplify any ratio A:B to its smallest whole numbers, convert it to a decimal and a percentage, and solve the classic proportion equation A:B = C:x — find x instantly when three of the four terms are known.',
			'Simplifying a ratio divides both sides by their greatest common divisor (GCD), so 18:24 becomes 3:4. The proportion solver uses cross-multiplication: A·x = B·C, meaning x = (B·C) / A.',
		],
		aboutZh: [
			'把任意比 A:B 化为最简整数比，查看对应的小数与百分比，并求解经典比例方程 A:B = C:x——已知其中三项即时求解第四项 x。',
			'化简比即两边同除以最大公约数，例如 18:24 → 3:4。解比例采用交叉相乘法：A·x = B·C，故 x = (B·C) ÷ A。',
		],
		faq: [
			{ q: 'How do I simplify the ratio 36:48?', a: 'Divide both by their GCD (12) to get 3:4.' },
			{ q: 'How do I solve the proportion 3:4 = 9:x?', a: 'Cross-multiply: 3x = 36, so x = 12. Enter A=3, B=4, C=9 to get x=12.' },
			{ q: 'How do I scale a recipe for 12 people?', a: 'If the recipe serves 4, solve 4:12 = 1:x portions — the ratio tells you to multiply every ingredient by 3.' },
			{ q: 'Can ratios have decimals?', a: 'The input can, but the simplified form is always whole numbers — 2.5:1.5 simplifies to 5:3.' },
		],
		faqZh: [
			{ q: '36:48 怎么化简？', a: '两边同除以最大公约数 12，得到 3:4。' },
			{ q: '比例式 3:4 = 9:x 怎么解？', a: '交叉相乘得 3x = 36，故 x = 12。在计算器中输入 A=3、B=4、C=9 即可立即求出 x=12。' },
			{ q: '怎么把 4 人份食谱扩成 12 人份？', a: '解比例 4:12 = 1:x，即可知道所有食材都要乘以 3。' },
			{ q: '比可以有小数吗？', a: '输入可以，但化简结果一定是整数——2.5:1.5 会化简为 5:3。' },
		],
	},
	'calculators/simple-interest': {
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
	'finance/mortgage-prepayment': {
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
	'finance/compound-interest': {
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
	'finance/loan-payment': {
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
	'finance/mortgage': {
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
	'finance/irr-calculator': {
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
	'finance/inflation': {
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
	'finance/savings-goal': {
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
	'finance/auto-loan': {
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
	'finance/fire-calculator': {
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
	'finance/tax': {
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
	'finance/salary': {
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
	'finance/roi': {
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
	'finance/discount': {
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
	'tools/word-counter': {
		about: [
			'Count words, characters, sentences, paragraphs and lines in real time as you type or paste — plus average word length and an estimated reading time based on a 220-words-per-minute pace.',
			'Words are matched with Unicode rules, so it works for English, mixed-language and CJK text (a run of Chinese characters counts as one word). Reading time is a rough guide for blog posts and speeches.',
		],
		aboutZh: [
			'输入或粘贴文本，实时统计词数、字符数、句子数、段落数和行数，另有平均词长和按每分钟 220 词估算的阅读时长。',
			'分词遵循 Unicode 规则，适用于英文、混合语言及中日韩文本（连续的汉字串算作一个词）。阅读时长可用作博客文章和演讲稿的粗略参考。',
		],
		faq: [
			{ q: 'How is a word defined?', a: 'Any run of letters, digits, apostrophes or hyphens — "state-of-the-art" is one word, and so is a run of Chinese characters.' },
			{ q: 'What reading speed is assumed?', a: '220 words per minute, a common silent-reading average for adults.' },
			{ q: 'Does a limit of 5,000 words matter?', a: 'Writing guidelines, essay limits and submission rules usually count words exactly the way this page does.' },
		],
		faqZh: [
			{ q: '"词"是怎么定义的？', a: '连续的字母、数字、撇号或连字符算一个词——"state-of-the-art"是一个词，连续汉字串也算一个词。' },
			{ q: '阅读速度按多少算？', a: '按成年人默读的平均水平每分钟 220 词。' },
			{ q: '统计结果能用于投稿字数要求吗？', a: '可以，本页的计数方式与常见的字数统计规则一致。' },
		],
	},
	'tools/character-counter': {
		about: [
			'Break a text down by character type: total characters, characters without spaces, words, letters, digits, spaces, symbols and the exact UTF-8 byte size — the number that matters for SMS, tweets and database fields.',
			'Each counter is live. The UTF-8 byte count uses a real encoder, so Chinese characters count as 3 bytes and emoji as 4, matching what servers and length-limited APIs actually see.',
		],
		aboutZh: [
			'按字符类型拆解文本：总字符数、不含空格的字符数、词数、字母数、数字数、空格数、符号数，以及精确的 UTF-8 字节数——后者才是短信、推文和数据库字段真正受限的数字。',
			'所有计数实时更新。UTF-8 字节数由真实编码器计算：一个汉字占 3 字节、一个 emoji 占 4 字节，与服务器和有长度限制的 API 的实际行为一致。',
		],
		faq: [
			{ q: 'How many characters fit in one SMS?', a: '160 in the default encoding; if any character needs Unicode (like Chinese), the limit drops to 70 per segment.' },
			{ q: 'Why do bytes differ from characters?', a: 'UTF-8 uses 1–4 bytes per character: "a" is 1 byte, "中" is 3, most emoji are 4.' },
			{ q: 'Do line breaks count?', a: 'Yes — the "spaces & line breaks" row includes every whitespace character.' },
		],
		faqZh: [
			{ q: '一条短信能发多少字？', a: '默认编码下 160 字符；只要包含一个 Unicode 字符（如中文），每段上限就降为 70 字符。' },
			{ q: '为什么字节数和字符数不一样？', a: 'UTF-8 中每个字符占 1–4 字节："a" 占 1 字节，"中" 占 3 字节，多数 emoji 占 4 字节。' },
			{ q: '换行算字符吗？', a: '算——"空格与换行"一栏统计所有空白字符。' },
		],
	},
	'tools/json-formatter': {
		about: [
			'Format messy JSON with consistent indentation, minify it back to one line, and get exact error positions when something is broken — "line 3, column 14" instead of a vague parse failure.',
			'Formatting and validation both go through the browser\'s own JSON.parse, so what this page accepts is exactly what your code will accept — there is no second implementation here to disagree with the standard. What the page adds is the position: the engine reports a byte offset, and that is converted into the line and column you can actually go and look at.',
		],
		aboutZh: [
			'把杂乱的 JSON 排版成统一缩进、或压缩成一行，并在格式有错时给出精确位置——"第 3 行第 14 列"，而不是含糊的解析失败。',
			'格式化与校验都走浏览器自带的 JSON.parse，所以本页接受什么、你的代码就接受什么——这里没有第二套实现去和标准打架。本页加的是「位置」：引擎报的是字节偏移量，这里把它换算成能直接去看的行号与列号。',
		],
		faq: [
			{ q: 'Is my JSON sent to a server?', a: 'No. Parsing, formatting and error detection all run locally in your browser — safe for private data.' },
			{ q: 'Why does my JSON fail on trailing commas?', a: 'The JSON standard does not allow a comma before } or ] — that is a JavaScript-only convenience.' },
			{ q: 'What indent does the formatter use?', a: 'Two spaces, the most common convention for config files and API responses.' },
		],
		faqZh: [
			{ q: '我的 JSON 会上传到服务器吗？', a: '不会。解析、格式化和错误检测全部在浏览器本地运行，敏感数据也安全。' },
			{ q: '为什么尾逗号会报错？', a: 'JSON 标准不允许 } 或 ] 前出现逗号——那是 JavaScript 的特有语法。' },
			{ q: '格式化用几个空格缩进？', a: '两个空格，这是配置文件和 API 响应最常见的约定。' },
		],
	},
	'tools/base64': {
		about: [
			'Encode text to Base64 or decode it back, with full Unicode support — Chinese, emoji and other multi-byte characters are converted correctly via UTF-8, and a URL-safe variant (no +, / or =) is one click away.',
			'Base64 represents any bytes with 64 safe characters, making it a common way to pass binary-ish data in URLs, JSON, data URIs and HTTP Basic authentication headers.',
		],
		aboutZh: [
			'文本与 Base64 互转，完整支持 Unicode——中文、emoji 等多字节字符通过 UTF-8 正确处理；URL 安全变体（不含 +、/、=）也只需一键。',
			'Base64 用 64 个安全字符表示任意字节，常用于在 URL、JSON、data URI 和 HTTP Basic 认证头中传递类二进制数据。',
		],
		faq: [
			{ q: 'Is Base64 encryption?', a: 'No — it is an encoding, not encryption. Anyone can decode it; never use it to hide secrets.' },
			{ q: 'Why does encoded text get longer?', a: 'Every 3 bytes become 4 characters, about a 33% size increase.' },
			{ q: 'What is URL-safe Base64?', a: 'A variant replacing + and / with - and _ and dropping padding, so the result can sit inside a URL query without escaping.' },
		],
		faqZh: [
			{ q: 'Base64 是加密吗？', a: '不是，它是编码而非加密。任何人都能解码，绝不能用它"保护"机密信息。' },
			{ q: '为什么编码后变长了？', a: '每 3 个字节编码为 4 个字符，体积约增加 33%。' },
			{ q: '什么是 URL 安全的 Base64？', a: '一种变体，把 + 和 / 换成 - 和 _ 并去掉填充符，使结果可以直接放进 URL 查询串而无需转义。' },
		],
	},
	'tools/sql-formatter': {
		about: [
			'Beautify messy SQL queries with clean multi-level indentation and automated keyword capitalization (SELECT, FROM, WHERE, JOIN, GROUP BY, etc.).',
			'Runs 100% client-side in your browser — your private database queries, table structures, and sensitive filters are never uploaded to any remote server.',
		],
		aboutZh: [
			'将凌乱冗长的 SQL 查询语句格式化为清晰分层的优美代码，自动将 SELECT、FROM、WHERE、JOIN、GROUP BY 等几十个主流关键字转为大写规范。',
			'100% 运行于本地浏览器内存中——绝不向任何外部服务器上传数据，彻底杜绝企业内部数据库结构、表名与敏感查询条件泄露。',
		],
		faq: [
			{ q: 'Does this tool upload my SQL?', a: 'Never. All parsing, indentation, and minification happen entirely within your local browser JavaScript engine.' },
			{ q: 'Which SQL dialects are supported?', a: 'Standard ANSI SQL, MySQL, PostgreSQL, SQLite, MariaDB, and SQL Server.' },
			{ q: 'Can I minify SQL to a single line?', a: 'Yes — click "Minify" to strip comments and redundant whitespace, ready to embed in an application config or a code literal.' },
		],
		faqZh: [
			{ q: '该工具会上传我的 SQL 吗？', a: '绝不上传。所有分词、缩进排版与压缩均在浏览器本地完成，断网也能正常运行。' },
			{ q: '支持哪些数据库语法？', a: '支持标准 ANSI SQL，以及 MySQL、PostgreSQL、SQLite、MariaDB、SQL Server 等主流关系型数据库。' },
			{ q: '可以压缩为单行吗？', a: '可以，点击"单行压缩 (Minify)"即可去除所有注释与冗余空白，生成适合嵌入代码字面量的紧凑语句。' },
		],
	},
	'tools/jwt-decoder': {
		about: [
			'Inspect and format JSON Web Tokens (JWT) instantly in your browser. Splits the token into Header, Payload, and Signature, and decodes Base64URL data with UTF-8 character support.',
			'Automatically parses expiration (exp), issued-at (iat), and not-before (nbf) timestamps into human-readable local time, displaying live validity countdowns and status indicators.',
		],
		aboutZh: [
			'在浏览器中极速解析 JSON Web Token (JWT) 令牌。自动将 Token 拆分为 Header 头部、Payload 载荷数据与 Signature 签名串，并完整支持 UTF-8 中文字符解码。',
			'自动识别 exp（过期时间）、iat（签发时间）与 nbf（生效时间）时间戳，转换为本地时区的人类可读时间，并直观提示当前 Token 是有效还是已过期。',
		],
		faq: [
			{ q: 'Is it safe to paste production tokens?', a: 'Yes. Unlike typical online JWT decoders that may log your Bearer tokens, this tool runs 100% locally with zero network requests.' },
			{ q: 'Can this tool verify the signature?', a: 'Client-side browsers cannot safely hold your secret key. This tool is designed for inspecting claims, debugging auth issues, and checking token expiration.' },
		],
		faqZh: [
			{ q: '在这里粘贴生产 Token 安全吗？', a: '绝对安全。绝大多数在线 JWT 网站存在泄露甚至截获 Token 的风险，而本工具 100% 纯前端解码，无任何后台网络请求。' },
			{ q: '本工具可以验签吗？', a: '出于安全考量，前端不应持有或输入服务端的私钥/密钥。本工具主要用于查看 Payload 数据、排查鉴权 Bug 及校验过期时间。' },
		],
	},
	'tools/url-parser': {
		about: [
			'Break down complex URLs into protocol, hostname, port, pathname, hash, and structured query parameters.',
			'Provides one-click URL Decode/Encode, parameter alphabetical sorting (essential for API HMAC signatures), and removal of marketing tracking tags (utm_*, spm, gclid, fbclid).',
		],
		aboutZh: [
			'将超长、多层编码的复杂 URL 网址一键拆解为协议、域名、端口、路径、哈希锚点及结构化查询参数列表。',
			'支持一键 URL 解码/编码、按字母升序排列 Query 参数（对接 API 验签必备）、去除营销埋点追踪参数（utm、spm、gclid 等），以及一键导出为标准 JSON 键值对。'
		],
		faq: [
			{ q: 'Why sort query parameters?', a: 'Many payment and cloud APIs (such as AWS, WeChat Pay, Alipay) require parameters to be sorted alphabetically before generating HMAC/MD5 signatures.' },
			{ q: 'What does tracking tag removal do?', a: 'It strips analytics tags like utm_source, utm_campaign, and fbclid to produce a clean, shareable URL.' },
		],
		faqZh: [
			{ q: '为什么要对 Query 参数排序？', a: '在对接微信支付、支付宝、AWS 等 API 接口时，生成签名通常要求参数按字母顺序排列拼接，排序功能可直接输出标准顺序。' },
			{ q: '去除追踪参数有什么用？', a: '去除复制链接时附带的各类营销埋点（如 utm_source、spm 等），生成干净纯粹、便于分享的原始链接。' },
		],
	},
	'tools/xml-formatter': {
		about: [
			'Format and validate XML and SVG documents in your browser. Uses native DOMParser to pinpoint exact syntax error locations.',
			'Offers customizable 2-space and 4-space hierarchical indentation, as well as single-line minification to reduce payload size.'
		],
		aboutZh: [
			'在浏览器中实时校验与美化 XML、SVG 矢量图形与 RSS 数据。利用浏览器原生 DOMParser 快速定位语法错误位置。',
			'支持 2 空格与 4 空格层级缩进，并支持一键去除多余空白和注释进行单行 Minify 压缩，大幅精简报文体积。'
		],
		faq: [
			{ q: 'How does it detect XML errors?', a: 'It leverages the browser engine’s native XML parser, catching unclosed tags and invalid characters with high precision.' },
			{ q: 'Can I format SVG files?', a: 'Yes, SVG is XML-compliant. You can format, clean, or compress SVG vector code here.' },
		],
		faqZh: [
			{ q: '它是如何发现 XML 语法错误的？', a: '直接调用浏览器底层原生的 XML 解析引擎，能够精准捕获未闭合标签、非法字符等语法错误。' },
			{ q: '可以用来格式化 SVG 吗？', a: '完全可以，SVG 本质上就是合法的 XML 格式，你可以随时用来美化或压缩 SVG 矢量图标代码。' },
		],
	},
	'tools/css-formatter': {
		about: [
			'Format messy or compressed CSS into clean, readable code with consistent rules, braces, and property spacing.',
			'Supports 2-space or 4-space indentation, and one-click minification to eliminate whitespace and comments for optimal web loading speeds.'
		],
		aboutZh: [
			'将压缩混淆或排版杂乱的 CSS 样式表格式化为清晰易读的规范代码，规范选择器、大括号和属性分号对齐。',
			'支持 2 空格/4 空格缩进排版，并支持一键生产态 Minify 单行压缩，剔除注释与多余字符，显著减小样式文件体积。'
		],
		faq: [
			{ q: 'Does it support media queries?', a: 'Yes, nested blocks like @media and @keyframes are formatted with clean indentation.' },
			{ q: 'How much does minification save?', a: 'Typically between 20% and 50% depending on the amount of comments and whitespace in the original code.' },
		],
		faqZh: [
			{ q: '支持媒体查询吗？', a: '支持，对于 @media、@keyframes 等包含多层嵌套大括号的规则块均能进行整齐的层级缩进。' },
			{ q: '压缩后能节省多少体积？', a: '通常能够减少 20% 到 50% 的文件大小，大幅加快网页首屏样式的加载速度。' },
		],
	},
	'tools/html-formatter': {
		about: [
			'Indent and organize unformatted HTML markup with awareness of self-closing void elements (meta, img, input, link, br, etc.).',
			'Minify HTML by stripping comments and inter-tag whitespace, reducing download weight for end users.'
		],
		aboutZh: [
			'对杂乱无章的 HTML 网页结构进行层级分明的缩进排版，智能识别 meta、img、input、link、br 等自闭合/单标签元素。',
			'提供一键单行 Minify 压缩功能，剔除 HTML 注释与标签间的冗余空白，有效提升页面传输效率。'
		],
		faq: [
			{ q: 'Does formatting break void tags like <img> and <input>?', a: 'No, the formatter recognizes HTML5 void elements and will not add unexpected closing tags.' },
			{ q: 'Is it completely client-side?', a: 'Yes, runs 100% in your browser with zero latency and zero data transfer.' },
		],
		faqZh: [
			{ q: '格式化会破坏 <img> 或 <input> 这类单标签吗？', a: '不会，格式化引擎内置完整的 HTML5 Void 元素识别表，不会错误添加闭合标签。' },
			{ q: '完全是在本地运行吗？', a: '是的，全部在你的浏览器本地 JavaScript 中执行，速度极快且零网络传输。' },
		],
	},
	'tools/markdown-preview': {
		about: [
			'Render and edit Markdown in real-time with comprehensive GitHub Flavored Markdown (GFM) support, including multi-level headings, bold, italic, tables, checklists, code blocks, blockquotes, and LaTeX maths typeset by KaTeX.',
			'Runs entirely in your browser: the document is never uploaded and nothing is fetched from a third party. Supports one-click HTML/MD copying, file downloading, and word/character statistics.'
		],
		aboutZh: [
			'纯本地双栏实时 Markdown 渲染与编辑工具，支持 GitHub Flavored Markdown (GFM) 全特性，包括多级标题、代码块、表格、任务清单、排版样式，以及由 KaTeX 排版的 LaTeX 数学公式（行内 $x$ 与块级 $$…$$）。',
			'100% 浏览器本地毫秒级解析渲染，文档不上传、不经过任何第三方服务；支持一键复制渲染后 HTML、导出标准 .md 与 .html 文件，实时统计字数与预估阅读时长。'
		],
		faq: [
			{ q: 'Does it support GitHub Flavored Markdown (GFM)?', a: 'Yes, tables, task lists (- [x]), autolinks, and strikethrough (~~text~~) are fully supported.' },
			{ q: 'How are formulas rendered?', a: 'By KaTeX, running locally — inline as $x^2$ and display as $$…$$. It is served from this site rather than a CDN, and only loaded once your document actually contains a formula. A dollar sign used as money, like $5 or $10, is left as text.' },
			{ q: 'Is my document private and safe?', a: 'Completely. Parsing and rendering happen in your browser, the document is never sent anywhere, and no third-party script is involved.' },
			{ q: 'Can I export the rendered HTML?', a: 'Yes, you can copy the HTML directly to clipboard or download it as a standalone HTML file. Formulas are exported as MathML, so the file renders on its own without needing any stylesheet or font from this site.' },
		],
		faqZh: [
			{ q: '支持 GitHub Flavored Markdown (GFM) 语法吗？', a: '完全支持，包含表格语法、任务复选框 (- [x])、删除线 (~~text~~)、超链接自动识别等。' },
			{ q: '数学公式是怎么渲染的？', a: '由 KaTeX 在你的浏览器本地排版：行内写 $x^2$，块级写 $$…$$。KaTeX 由本站自托管而非 CDN，且只在文档真的出现公式时才按需加载。金额里的美元符号（如 $5 或 $10）会照原样显示，不会被误判成公式。' },
			{ q: '我的文档内容安全吗？', a: '100% 安全。解析与渲染全部在你的浏览器本地进行，文档不会被发送到任何地方，也不加载任何第三方脚本，离开页面即清空。' },
			{ q: '支持导出为 HTML 文件吗？', a: '支持，可一键复制渲染后的 HTML 源码，或一键下载独立的 .html 文件。文件里的公式以 MathML 形式导出，浏览器可直接排版，无需依赖本站的样式表或字体。' },
		],
	},
	'tools/password-generator': {
		about: [
			'Generate strong passwords with true cryptographic randomness — every character comes from the browser\'s crypto.getRandomValues, not Math.random. Choose the length (8–64), toggle lowercase, uppercase, digits and symbols, and optionally exclude easily confused ambiguous characters (0, O, o, 1, l, I).',
			'The strength label estimates entropy from the character pool and length: for example, 16 characters from a 62-symbol alphabet is about 95 bits, far beyond what brute-force attacks can reach.',
		],
		aboutZh: [
			'用真正的密码学随机源生成高强度密码——每个字符都来自浏览器的 crypto.getRandomValues，而非 Math.random。长度可在 8–64 之间调整，可勾选小写、大写、数字与符号，并支持一键排除易混淆歧义字符（0、O、o、1、l、I）。',
			'强度标签根据字符池大小和长度估算熵值：例如 62 个字符集取 16 位约 95 比特熵，远超暴力破解的可达范围。',
		],
		faq: [
			{ q: 'Are the passwords sent anywhere?', a: 'No. They are generated locally and never leave your device; the copy button only touches your clipboard.' },
			{ q: 'Why exclude ambiguous characters?', a: 'Characters like 0 (zero) vs O (capital o) or 1 (one) vs l (lowercase L) are easily mistyped when reading passwords on paper or mobile screens.' },
			{ q: 'How long should a password be?', a: 'At least 12 characters with symbols, or 16+ alphanumeric-only, to stay well beyond current cracking speeds.' },
			{ q: 'Why crypto and not Math.random?', a: 'Math.random is predictable and not designed for security; getRandomValues is a cryptographic source with uniform sampling.' },
		],
		faqZh: [
			{ q: '生成的密码会被上传吗？', a: '不会。密码在本地生成，绝不离开你的设备；复制按钮也只操作本机剪贴板。' },
			{ q: '为什么要排除易混淆字符？', a: '如数字 0 与大写字母 O、数字 1 与小写字母 l 在屏幕或纸质抄录时极易看错输入，过滤后更清晰。' },
			{ q: '密码应该设多长？', a: '含符号时至少 12 位；纯字母数字建议 16 位以上，才能远超当前破解速度。' },
			{ q: '为什么用 crypto 而不是 Math.random？', a: 'Math.random 是可预测的，并非为安全设计；getRandomValues 是均匀采样的密码学随机源。' },
		],
	},
	'tools/uuid-generator': {
		about: [
			'Generate UUID v4 (cryptographically random) and modern UUID v7 (timestamp-ordered, RFC 9562) identifiers in bulk — up to 100 at a time — with custom uppercase and hyphen formatting.',
			'UUID v4 provides 122 bits of pure randomness, ideal for secure stateless tokens. UUID v7 combines a 48-bit millisecond Unix timestamp with 74 random bits, giving monotonic time ordering that drastically improves database B-tree index performance and cache locality.',
		],
		aboutZh: [
			'批量生成随机 UUID v4 以及现代时间有序的 UUID v7（RFC 9562 标准），支持自定义大小写与连字符格式，单次最高可生成 100 个。',
			'UUID v4 提供 122 位纯密码学随机性，适合无状态安全令牌；UUID v7 将 48 位 Unix 毫秒时间戳与 74 位随机数结合，具有天然的时间单调递增性，可大幅提升 PostgreSQL、MySQL 等数据库的 B 树索引性能与写入局部性。',
		],
		faq: [
			{ q: 'What is the difference between UUID v4 and UUID v7?', a: 'UUID v4 is completely random. UUID v7 encodes a 48-bit millisecond timestamp in the prefix, so UUIDs sort chronologically by creation time.' },
			{ q: 'Why use UUID v7 for database primary keys?', a: 'Pure random UUIDs cause page fragmentation in B-trees (random disk writes). UUID v7 is sequential, meaning new inserts append near the end of index leaves, boosting throughput.' },
			{ q: 'Can two generated UUIDs collide?', a: 'The chance is astronomically small — you would need billions generated per millisecond to observe collisions.' },
		],
		faqZh: [
			{ q: 'UUID v4 和 UUID v7 有什么区别？', a: 'UUID v4 完全随机；UUID v7 前缀包含 48 位毫秒时间戳，生成的 ID 天然按创建时间排序。' },
			{ q: '为什么数据库主键推荐 UUID v7？', a: '纯随机的 UUID v4 会导致 B+ 树索引严重碎片化；UUID v7 具有时间局部性，新记录追加在索引末尾，显著降低 I/O 压力。' },
			{ q: '两个 UUID 可能发生碰撞重复吗？', a: '概率微乎其微——即使在同一毫秒内也拥有 74 位的随机熵，需要每毫秒生成数十亿个才可能碰撞。' },
		],
	},
	'tools/random-number': {
		about: [
			'Draw random integers in any range — for giveaways, sampling, games or picking who goes first. Choose the count, the minimum and maximum, and whether repeats are allowed.',
			'Numbers come from the browser\'s cryptographic random source with rejection sampling, so every value in the range is exactly equally likely. With "no duplicates" the page uses a Fisher–Yates shuffle, like drawing cards from a deck.',
		],
		aboutZh: [
			'在任意范围内抽取随机整数——可用于抽奖、抽样、游戏或决定顺序。可设置数量、最小值、最大值以及是否允许重复。',
			'数字来自浏览器密码学随机源并采用拒绝采样，范围内每个值的概率严格相等。勾选"不允许重复"时采用 Fisher–Yates 洗牌算法，如同从牌堆里抽牌。',
		],
		faq: [
			{ q: 'Is the draw fair?', a: 'Yes — rejection sampling avoids the modulo bias that makes naive random numbers slightly unfair.' },
			{ q: 'How do I pick a giveaway winner?', a: 'Number the entrants 1–N, set min 1 and max N, count 1, no duplicates — done.' },
			{ q: 'Why does the count cap depend on the range?', a: 'With no duplicates allowed, you cannot draw more unique numbers than the range contains.' },
		],
		faqZh: [
			{ q: '抽取结果公平吗？', a: '公平——拒绝采样避免了朴素取模算法导致的微小概率偏差。' },
			{ q: '怎么抽抽奖中奖者？', a: '把参与者编号 1–N，最小值填 1、最大值填 N、数量 1、不允许重复即可。' },
			{ q: '为什么数量上限和范围有关？', a: '在不允许重复的模式下，去重抽取的数量不可能超过范围内的数字个数。' },
		],
	},
	'tools/qr-code-generator': {
		about: [
			'Turn any text or URL into a QR code and download it as a PNG. Pick the error-correction level (L/M/Q/H) — higher levels survive more damage and are better for printing; the size and QR version adapt automatically to your input.',
			'The encoder is written from scratch and runs entirely in your browser: no QR text ever leaves your device, which matters if you encode payment addresses, Wi-Fi credentials or private links.',
		],
		aboutZh: [
			'把任意文本或 URL 变成二维码并下载 PNG。可选择纠错级别（L/M/Q/H）——级别越高越耐污损，更适合印刷；尺寸和版本会根据内容自动适配。',
			'编码器完全手写并在浏览器本地运行：二维码内容不会离开你的设备——在编码收款地址、Wi-Fi 凭据或私密链接时这一点尤为重要。',
		],
		faq: [
			{ q: 'How much text fits in one QR code?', a: 'Up to 271 characters at the lowest error correction (L) in this generator — shorter for higher ECC levels.' },
			{ q: 'Which error-correction level should I pick?', a: 'M is the everyday default; use Q or H for stickers, packaging or anything that might get scratched.' },
			{ q: 'How big can I print it?', a: 'A QR scans reliably at roughly one-tenth of the scanning distance — a 10 cm code works from about a meter away.' },
		],
		faqZh: [
			{ q: '一个二维码能放多少字？', a: '本生成器在最低纠错级别（L）下最多 271 字符，纠错级别越高容量越小。' },
			{ q: '纠错级别怎么选？', a: '日常用 M 即可；贴纸、包装等可能磨损的场景建议 Q 或 H。' },
			{ q: '二维码可以印多大？', a: '大致按扫描距离的十分之一取边长即可——10 厘米的码在约 1 米外可稳定扫描。' },
		],
	},
	'tools/color-converter': {
		about: [
			'Convert any color between HEX, RGB and HSL. Edit any of the three representations and the others follow instantly, with a live swatch and the complementary color (the hue 180° around the wheel) shown beside it.',
			'HEX and RGB describe exactly which red, green and blue light to mix; HSL is human-friendly — hue (position on the color wheel), saturation (intensity) and lightness — which makes it the natural way to build palettes.',
		],
		aboutZh: [
			'在 HEX、RGB、HSL 三种表示之间转换颜色。编辑任意一种表示，其余两种即时联动，旁边还实时显示色块与互补色（色相环上相差 180° 的颜色）。',
			'HEX 和 RGB 直接描述红绿蓝光的混合比例；HSL 更符合人的直觉——色相（色环位置）、饱和度（鲜艳程度）、亮度——是搭配配色方案的自然选择。',
		],
		faq: [
			{ q: 'What is the difference between HEX and RGB?', a: 'Nothing functional — #ff8800 and rgb(255, 136, 0) are the same color written two ways.' },
			{ q: 'What is a complementary color?', a: 'The color opposite on the wheel: orange #ff8800 complements azure #0088ff. Pairing them gives maximum contrast.' },
			{ q: 'When should I use HSL?', a: 'For building palettes: keep hue, adjust lightness for shades, saturation for muted variants — much easier in HSL than RGB.' },
		],
		faqZh: [
			{ q: 'HEX 和 RGB 有什么区别？', a: '功能上没有区别——#ff8800 与 rgb(255, 136, 0) 是同一颜色的两种写法。' },
			{ q: '什么是互补色？', a: '色环上正对面的颜色：橙色 #ff8800 的互补色是天蓝 #0088ff，两者搭配对比度最强。' },
			{ q: '什么时候用 HSL？', a: '做配色方案时：固定色相、调亮度得深浅变体、调饱和度得柔和变体——比在 RGB 下容易得多。' },
		],
	},
	'converters/weight': {
		about: [
			'Comprehensive mass and weight converter covering metric (kg, g, mg, tonne), traditional Chinese (市斤, 两, 钱, 担, 港斤, 台斤), precious gems & metals (carat, troy ounce, grain), and imperial / US units (pound, ounce, stone, short/long ton).',
			'All conversion factors are defined to exact international and legal standards with zero telemetry. Ideal for gold & jewelry trading, international commerce, fitness & diet tracking, and everyday life.',
		],
		aboutZh: [
			'全功能多维度重量与质量换算器：涵盖国际公制（千克、克、毫克、微克、公吨）、中国市制与港台衡量（市斤、两、钱、担、港斤/司马斤、台斤）、珠宝贵金属（金衡盎司 oz t、克拉 ct、格令 gr）以及英美常衡（磅、盎司、英石、美吨、英吨）。',
			'严格遵照国际法定标准与传统常衡定义换算，100% 浏览器本地高精度秒级计算。适合黄金珠宝估值、跨境海淘外贸、健身饮食热量称重及日常生活。',
		],
		faq: [
			{ q: 'How many grams are in 1 troy ounce (oz t)?', a: 'Exactly 31.1034768 grams, which is the global pricing standard for spot gold, silver and platinum (unlike the everyday 28.35 g avoirdupois ounce).' },
			{ q: 'How many grams is 1 Chinese jin (市斤)?', a: '1 Chinese market jin (市斤) is exactly 500 grams (0.5 kg), consisting of 10 liang (两) of 50 grams each.' },
			{ q: 'What is 1 carat (ct) in grams?', a: '1 metric carat equals exactly 0.2 grams (200 milligrams), the universal unit for diamonds and gemstones.' },
			{ q: 'How many pounds are in 1 kilogram?', a: '1 kilogram equals approximately 2.20462 pounds (strictly defined as 1 lb = 0.45359237 kg).' },
		],
		faqZh: [
			{ q: '1 金衡盎司（oz t）等于多少克？', a: '精确等于 31.1034768 克。国际现货黄金、白银报价均以金衡盎司为基准，不同于日常食物所用的常衡盎司（约 28.35 克）。' },
			{ q: '1 市斤和 1 公斤有什么关系？', a: '中国现代市制中，1 市斤 = 500 克 = 0.5 公斤（千克）；1 市斤包含 10 市两（每两 50 克）。而港澳司马斤约为 604.79 克，台斤为 600 克。' },
			{ q: '1 克拉（ct）等于多少克？', a: '1 克拉精确等于 0.2 克（200 毫克），是全球钻石与天然贵重宝石的通用度量单位。' },
			{ q: '1 公斤等于多少磅？', a: '约合 2.20462 磅。国际常衡磅严格定义为 0.45359237 千克。' },
		],
	},
	'converters/length': {
		about: [
			'Convert across metric units (nm, µm, mm, cm, m, km), traditional Chinese measures (市里, 丈, 尺, 寸, 分), nautical standards (nautical mile, fathom, cable), and imperial units (inch, foot, yard, mile).',
			'From semiconductor wafer nanometers to transoceanic nautical miles and astronomical light-years, calculations run with full floating-point accuracy.',
		],
		aboutZh: [
			'全能长度与空间跨度换算器：涵盖公制（纳米、微米、毫米、厘米、分米、米、千米/公里）、中国市制（华里、丈、尺、寸、分）、航海水深（海里、英寻、链）以及英美制（英寸、英尺、码、英里、密耳）。',
			'无论是芯片制程纳米、服装腰围尺寸市尺、海运航空海里还是星际天文光年，皆可实时无缝转换。',
		],
		faq: [
			{ q: 'How many meters are in 1 nautical mile (nmi)?', a: 'Exactly 1,852 meters by international agreement, used globally in marine navigation and aviation.' },
			{ q: 'How many feet are in 1 mile?', a: 'Exactly 5,280 feet — or 1,609.344 meters.' },
			{ q: 'How many centimeters is 1 Chinese chi (市尺)?', a: '1 Chinese chi equals 1/3 of a meter, or approximately 33.333 centimeters (10 cun).' },
		],
		faqZh: [
			{ q: '1 海里（nmi）等于多少米？', a: '国际标准精确等于 1,852 米，广泛应用于全球海运船舶航行与民航客机飞行。' },
			{ q: '1 英里等于多少公里？', a: '1 国际英里严格等于 1.609344 公里（5,280 英尺）。' },
			{ q: '1 市尺等于多少厘米？', a: '1 市尺等于 1/3 米，约合 33.333 厘米。1 市尺包含 10 市寸（1 寸 ≈ 3.33 厘米），常用于服装裁剪与腰围计量。' },
		],
	},
	'converters/area': {
		about: [
			'Convert surface and real estate land areas across international metric units (m², km², hectare, are), traditional Chinese land measures (亩, 顷, 分地, 平方尺), and imperial units (acre, square foot, square yard, square mile).',
		],
		aboutZh: [
			'土地与房屋面积专业换算工具：支持平方米、平方千米、公顷、公亩，中国市制土地面积（市亩、顷、分地、平方尺），以及英美常用面积（英亩、平方英尺、平方码、平方英里）。',
		],
		faq: [
			{ q: 'How many square meters are in 1 Chinese mu (亩)?', a: '1 Chinese mu equals 2000/3 square meters, or approximately 666.67 m². 1 hectare equals exactly 15 mu.' },
			{ q: 'How many square feet are in 1 acre?', a: 'Exactly 43,560 square feet (approx. 4,046.86 m² or ~6.07 Chinese mu).' },
		],
		faqZh: [
			{ q: '1 亩地等于多少平方米？', a: '1 市亩等于 2000/3 平方米，约合 666.67 平方米。1 公顷（10,000 m²）恰好等于 15 亩。' },
			{ q: '1 英亩等于多少亩和平方米？', a: '1 英亩（acre）等于 4046.856 平方米，折合中国市亩约 6.07 亩。' },
		],
	},
	'converters/volume': {
		about: [
			'Convert volume and liquid capacity across metric units (mL, L, m³), culinary kitchen spoons (tsp, tbsp, cup), US & UK liquid standards (fl oz, pint, quart, gallon), oil barrels (bbl), and cubic feet/inches.',
		],
		aboutZh: [
			'体积与液体容量全量换算器：涵盖国际公制（毫升、升、立方米）、厨房烘焙量勺（茶匙、汤匙、美制量杯）、美制与英制液体（液盎司、品脱、夸脱、加仑）、国际原油标准桶（bbl）以及立方英尺/立方英寸。',
		],
		faq: [
			{ q: 'What is the difference between a US gallon and a UK imperial gallon?', a: 'A US gallon is about 3.785 liters (231 cu in), while a UK imperial gallon is larger at 4.54609 liters (approx. 20% more).' },
			{ q: 'How many liters is 1 oil barrel (bbl)?', a: '1 standard petroleum barrel equals exactly 42 US gallons, or approximately 158.987 liters.' },
		],
		faqZh: [
			{ q: '美制加仑和英制加仑有什么区别？', a: '美制加仑约 3.785 升，而英制加仑为 4.54609 升，英制加仑比美制大约多出 20% 容量。' },
			{ q: '1 桶原油（bbl）是多少升？', a: '国际大宗石油交易的 1 标准桶等于 42 美制加仑，约合 158.987 升。' },
		],
	},
	'converters/pressure': {
		about: [
			'High-precision pressure and stress conversion for engineering, automotive tire pressures, diving, medical blood pressure, and atmospheric meteorology. Seamlessly convert between Pa, kPa, MPa, bar, psi, atm, mmHg/Torr, and kgf/cm².',
			'Everyday uses: setting cold tire pressure (2.5 bar = 250 kPa = 36.3 psi), reading a blood-pressure monitor, pressure-testing plumbing, and following the barometric pressure in a weather report.',
		],
		aboutZh: [
			'专业工程与日常生活压力/压强换算器：轻松互换帕斯卡（Pa）、千帕（kPa）、兆帕（MPa）、巴（bar）、磅力/平方英寸（psi）、标准大气压（atm）、毫米汞柱（mmHg / 托 Torr）以及公斤力/平方厘米（kgf/cm²）。',
			'常用于汽车冷态胎压校准（如 2.5 bar = 250 kPa = 36.3 psi）、血压计读数、水暖管道打压与气象气压监测。',
		],
		faq: [
			{ q: 'How many psi is 2.5 bar tire pressure?', a: '2.5 bar equals approximately 36.26 psi (and 250 kPa).' },
			{ q: 'What is 1 standard atmosphere (atm) in pascals?', a: '1 atm is defined as exactly 101,325 Pa (101.325 kPa or 760 mmHg).' },
			{ q: 'What is "kgf/cm²"?', a: '1 kgf/cm² is 1 kilogram-force per square centimeter (approx. 98.07 kPa or 0.98 bar), colloquially referred to in China as "1 公斤气压".' },
		],
		faqZh: [
			{ q: '汽车胎压 2.5 bar 等于多少 psi 和千帕？', a: '2.5 bar 约等于 36.26 psi，严格等于 250 kPa（千帕）。' },
			{ q: '1 个标准大气压（atm）是多少？', a: '精确等于 101,325 帕斯卡（101.325 kPa），相当于 760 毫米汞柱（mmHg）。' },
			{ q: '修车师傅常说的"打 2.5 公斤气"是什么意思？', a: '指的是 2.5 kgf/cm²（公斤力/平方厘米），约等于 2.45 bar 或 245 kPa，与标准的 2.5 bar 极为接近。' },
		],
	},
	'converters/power': {
		about: [
			'Convert power across international SI units (W, kW, MW, GW), automotive horsepower (metric ps vs mechanical imperial hp), air conditioner capacity (BTU/h), and mechanical work rates (ft·lb/s).',
		],
		aboutZh: [
			'功率与马力多用途换算器：涵盖国际标准瓦特（W）、千瓦（kW）、兆瓦（MW）、吉瓦（GW），汽车发动机马力（米制公制马力 ps / 匹、英制马力 hp），空调制冷量匹数与冷量（BTU/h）以及英尺·磅/秒。',
		],
		faq: [
			{ q: 'What is the difference between metric horsepower (ps) and imperial horsepower (hp)?', a: '1 metric horsepower (ps / cv) is defined as 75 kgf·m/s = 735.49875 W. 1 mechanical imperial horsepower (hp) is 550 ft·lb/s = 745.69987 W (approx. 1.4% stronger).' },
			{ q: 'How many horsepower is a 150 kW electric vehicle motor?', a: '150 kW equals approximately 203.9 metric horsepower (ps) or 201.2 mechanical hp.' },
		],
		faqZh: [
			{ q: '米制公制马力（ps/匹）和英制马力（hp）有什么区别？', a: '1 米制马力（公制马力 ps）等于 735.49875 瓦；1 英制马力（hp）等于 745.69987 瓦，英制马力比公制马力大约强 1.4%。中国与欧洲车系常用 ps/kW，美系常用 hp。' },
			{ q: '新能源汽车电机 150 kW 相当于多少匹马力？', a: '150 kW 约合 203.9 匹公制马力（ps），动力相当于传统 2.0T 高功率燃油发动机。' },
		],
	},
	'converters/energy': {
		about: [
			'Convert physical work, thermal calories, electrical storage, and fuel heating values across joules (J, kJ, MJ), dietary calories (cal, kcal), electrical energy (Wh, kWh), British thermal units (BTU), and electronvolts (eV).',
		],
		aboutZh: [
			'能量、功与热量全能转换器：涵盖物理功焦耳（J、kJ、MJ）、食品热量与减脂卡路里（卡 cal、千卡/大卡 kcal）、电力能源（瓦时 Wh、千瓦时 / 度电 kWh）、空调暖通英热单位（BTU）以及微观粒子物理电子伏特（eV）。',
		],
		faq: [
			{ q: 'How many kilojoules (kJ) are in 1 food Calorie (kcal)?', a: '1 kcal — the Calorie printed on a nutrition label — equals 4.184 kJ. To read a kJ label in kcal, divide by 4.184.' },
			{ q: 'How many joules are in 1 kilowatt-hour (kWh)?', a: 'Exactly 3,600,000 joules (3.6 MJ).' },
		],
		faqZh: [
			{ q: '食品标签上的千焦（kJ）怎么换算成大卡（kcal）？', a: '1 千卡（大卡 kcal）等于 4.184 千焦（kJ）。食品袋上的千焦数值除以 4.184，即可快速得到健身常说的大卡热量。' },
			{ q: '1 度电（kWh）等于多少焦耳？', a: '精确等于 3,600,000 焦耳（3.6 兆焦 MJ）。' },
		],
	},
	'converters/temperature': {
		about: [
			'Convert between Celsius, Fahrenheit, absolute Kelvin, Rankine, and Réaumur temperature scales with exact mathematical formulas.',
		],
		aboutZh: [
			'在摄氏度（°C）、华氏度（°F）、绝对温标开尔文（K）、兰氏度（°R）与列氏度（°Re）之间精确换算。',
		],
		faq: [
			{ q: 'At what temperature are Celsius and Fahrenheit equal?', a: '-40 degrees. -40 °C equals -40 °F.' },
			{ q: 'What is absolute zero?', a: '0 Kelvin (0 K), which is -273.15 °C or -459.67 °F.' },
		],
		faqZh: [
			{ q: '摄氏度与华氏度在哪一点数值相同？', a: '-40 度。即 -40 °C = -40 °F。' },
			{ q: '绝对零度是多少？', a: '0 开尔文（0 K），即 -273.15 °C 或 -459.67 °F。' },
		],
	},
	'converters/speed': {
		about: [
			'Instant velocity conversion between standard scientific units (m/s), automotive traffic speeds (km/h, mph), marine and aviation navigation (knots), supersonic aeronautics (Mach), and cosmic physics (speed of light).',
		],
		aboutZh: [
			'速度与航速全能转换器：精准换算物理科学标准米/秒（m/s）、交通车速公里/小时（千米/小时 km/h，俗称码）、美英车速英里/小时（mph，俗称迈）、航海航空节（海里/小时 kn）、超音速马赫（Ma）以及真空光速（c）。',
		],
		faq: [
			{ q: 'How do you convert m/s to km/h?', a: 'Multiply by 3.6. For example, 10 m/s × 3.6 = 36 km/h. To convert km/h to m/s, divide by 3.6 (e.g. 72 km/h ÷ 3.6 = 20 m/s, 100 km/h ≈ 27.78 m/s).' },
			{ q: 'How many mph is 100 km/h?', a: '100 km/h is about 62.14 mph; going the other way, 60 mph is about 96.56 km/h. The factor is 0.621371 mph per km/h, so a European 130 km/h motorway limit is roughly 81 mph.' },
			{ q: 'What is Mach 1 speed?', a: 'Mach 1 at standard sea level (15 °C) is approximately 340.29 m/s, or 1,225.04 km/h (761.2 mph).' },
			{ q: 'How many km/h is 1 knot (kn)?', a: '1 knot equals 1 nautical mile per hour, or exactly 1.852 km/h.' },
		],
		faqZh: [
			{ q: '米/秒（m/s）与千米/小时（公里/小时 km/h）怎么快速换算？', a: '换算公式为：1 米/秒 = 3.6 千米/小时。米/秒换算为公里/小时直接乘以 3.6；公里/小时换算为米/秒直接除以 3.6。例如：时速 72 km/h = 20 m/s，高速限速 120 km/h ≈ 33.33 m/s。' },
			{ q: '平时开车说的“时速80码”或“80迈”是多少公里/小时？', a: '严格来说，“迈”是英里每小时（mph，1 迈 ≈ 1.609 km/h，80 迈实为 128.7 km/h）；“码”是英制长度单位（1 码 = 0.9144 米）。但在国内日常口语中，车主常将“码”和“迈”作为“公里/小时（km/h）”的俗称，因此口语里的“80码/80迈”通常即指 80 km/h。' },
			{ q: '1 马赫（Mach）速度是多少公里/小时？', a: '在 15 °C 标准海平面气温下，1 马赫约等于 340.29 米/秒，合 1,225.04 公里/小时。' },
			{ q: '1 节（航速 knot）等于多少公里/小时？', a: '1 节等于每小时 1 海里，精确合 1.852 公里/小时。' },
		],
	},
	'converters/time': {
		about: [
			'Convert time spans from microchip clock cycles (picoseconds, nanoseconds) to human scales (seconds, minutes, hours, days, weeks, months, years, and centuries).',
		],
		aboutZh: [
			'从芯片纳秒时钟周期到人类宏观纪年（秒、分、时、日、周、旬、月、季度、年与世纪）的跨尺度时间换算。',
		],
		faq: [
			{ q: 'How many seconds are in one day?', a: '86,400 seconds (24 × 60 × 60).' },
			{ q: 'How many hours are in a non-leap year?', a: '8,760 hours (365 days × 24 hours).' },
		],
		faqZh: [
			{ q: '一天有多少秒？', a: '86,400 秒（24 小时 × 60 分钟 × 60 秒）。' },
			{ q: '平年一年有多少小时？', a: '8,760 小时（365 天 × 24 小时）。' },
		],
	},
	'converters/data': {
		about: [
			'Convert network bandwidth (bits: Mbps, Gbps), decimal manufacturer storage (KB, MB, GB, TB, PB — powers of 1000), and binary operating system memory/file sizes (KiB, MiB, GiB, TiB — powers of 1024).',
		],
		aboutZh: [
			'数据存储与网络速率全栈换算器：严格区分网络通信比特带宽（Mbps、Gbps）、存储硬件厂商十进制标称容量（KB、MB、GB、TB、PB，1000 进制）与操作系统二进制真实内存容量（KiB、MiB、GiB、TiB，1024 进制）。',
		],
		faq: [
			{ q: 'Why does 100 Mbps broadband only download at ~12.5 MB/s?', a: 'Internet bandwidth is measured in bits (b), while files are measured in bytes (B). Since 1 Byte = 8 bits, 100 Mbps ÷ 8 = 12.5 MB/s.' },
			{ q: 'Why does a 1 TB SSD only show ~931 GB in Windows?', a: 'SSD makers use decimal 10¹² bytes (1,000,000,000,000 bytes). Windows calculates in binary GiB (2³⁰ bytes = 1,073,741,824 bytes). 10¹² ÷ 2³⁰ ≈ 931.32 GiB.' },
		],
		faqZh: [
			{ q: '为什么 100M / 1000M 宽带的实际下载速度只有 12.5 MB/s 和 125 MB/s？', a: '因为网络运营商宣称的 100M 指的是比特每秒（100 Mbps），而下载文件显示的是字节每秒（MB/s）。1 字节（Byte）= 8 比特（bit），故 100 Mbps ÷ 8 = 12.5 MB/s，千兆宽带 1000 Mbps ÷ 8 = 125 MB/s。' },
			{ q: '为什么买的 1 TB 硬盘在电脑里只有 931 GB？', a: '硬盘制造商按十进制 1 TB = 10¹² 字节出厂标称；而 Windows 操作系统底层按二进制 GiB（1 GiB = 1024³ 字节）统计：10¹² ÷ 1024³ ≈ 931.32 GiB。' },
		],
	},
};
