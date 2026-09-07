// Editorial mapping connecting interactive tools to in-depth engineering blog posts.
// Keyed by "<category>/<slug>", e.g. "calculators/prime-factorization".
// Rendered at build time by ToolShell.astro to form a solid two-way internal linking network (mesh).
// Kept in this dedicated file so client bundles never download editorial prose.

export interface RelatedArticle {
	slug: string;
	title: string;
	titleZh: string;
	summary: string;
	summaryZh: string;
}

export const TOOL_RELATED_ARTICLES: Record<string, RelatedArticle[]> = {
	'calculators/prime-factorization': [
		{
			slug: 'prime-factorization-and-pollard-brent',
			title: "Fast Prime Factorization: From O(√n) to Pollard's rho & Brent in JavaScript",
			titleZh: "质因数分解：从 O(√n) 试除到 Pollard's rho 与 Brent 算法的前端极速实现",
			summary: 'How deterministic Miller-Rabin and Pollard-Brent cycle finding accelerate 64-bit factorization by over 300x in the browser.',
			summaryZh: '深入解析确定性 Miller-Rabin 素性测试与 Pollard-Brent 环查找，如何在纯前端将大数分解提速 300 倍以上。',
		},
	],
	'calculators/standard': [
		{
			slug: 'floating-point-ieee754-and-precision',
			title: 'Why 0.1 + 0.2 ≠ 0.3: Deep Dive into IEEE 754 and Safe Arithmetic',
			titleZh: '浮点数精度陷阱深度剖析：为什么 0.1 + 0.2 ≠ 0.3 与前端高精度计算设计',
			summary: 'Binary representations, rounding errors, and architectural patterns for resilient decimal calculations.',
			summaryZh: '深入 IEEE 754 浮点数底层位表示、舍入误差累积与前端高精度算术引擎的设计实践。',
		},
		{
			slug: 'web-calculator',
			title: 'From Zero to Math Engine: Building a Handcrafted Browser Scientific Calculator',
			titleZh: '从零构建前端科学计算器：分词、语法解析与无依赖数学引擎实战',
			summary: 'Architecture of a dependency-free scientific calculator: tokenizer, operator precedence parser, and responsive UI.',
			summaryZh: '拆解纯手写科学计算器核心架构：分词器、双栈运算符优先级解析与零依赖高响应式交互。',
		},
	],
	'calculators/fraction': [
		{
			slug: 'floating-point-ieee754-and-precision',
			title: 'Why 0.1 + 0.2 ≠ 0.3: Deep Dive into IEEE 754 and Safe Arithmetic',
			titleZh: '浮点数精度陷阱深度剖析：为什么 0.1 + 0.2 ≠ 0.3 与前端高精度计算设计',
			summary: 'Overcoming binary floating-point roundoff issues with exact rational fractions and continued fraction approximations.',
			summaryZh: '用有理数精确分数与连分数逼近算法化解二进制浮点数舍入误差问题。',
		},
	],
	'calculators/descriptive-statistics': [
		{
			slug: 'sample-variance-bessel-correction-and-welford',
			title: "Bessel's Correction and Welford's Algorithm: Accurate Sample Variance in One Pass",
			titleZh: '样本方差与贝塞尔修正：为什么除以 n-1 以及 Welford 单遍稳定算法',
			summary: "Why dividing by n-1 eliminates sample variance bias, and how Welford's algorithm prevents catastrophic cancellation.",
			summaryZh: '数学推导为什么除以 n-1 能消除方差估计的有偏性，以及 Welford 增量算法如何避免灾难性数值抵消。',
		},
	],
	'calculators/combinatorics': [
		{
			slug: 'combinatorics-combinations-and-bigint',
			title: "Combinatorics Engine: Pascal's Triangle, Factorial Explosions, and Exact BigInts",
			titleZh: '排列组合与阶乘爆炸：如何用 BigInt 与乘除交替实现零溢出高精度计数',
			summary: "Navigating factorial explosions in C(n, k) calculations with alternating multiplication-division and BigInt safety.",
			summaryZh: '化解排列组合中的阶乘爆炸难题：交替乘除法与原生 BigInt 结合实现全精度零溢出计算。',
		},
	],
	'calculators/graph': [
		{
			slug: 'canvas-2d-surface-plot',
			title: 'Plotting Math Functions with Canvas 2D: Coordinate Transforms and Asymptote Handling',
			titleZh: '基于 Canvas 2D 的函数图像绘制：坐标系变换、自适应步长与渐近线处理',
			summary: 'Mathematical plotting pipeline using Canvas 2D: coordinate transforms, adaptive sampling, and singularity handling.',
			summaryZh: 'Canvas 2D 数学函数绘图渲染管线：屏幕坐标系映射、自适应采样步长与极点渐近线跳变处理。',
		},
	],
	'calculators/graph3d': [
		{
			slug: 'canvas-2d-surface-plot',
			title: 'Plotting Math Functions with Canvas 2D: Coordinate Transforms and Asymptote Handling',
			titleZh: '基于 Canvas 2D 的函数图像绘制：坐标系变换、自适应步长与渐近线处理',
			summary: '3D surface rendering principles: isometric projection, depth ordering, and 2D canvas wireframe algorithms.',
			summaryZh: '三维曲面绘图原理：等轴测投影几何变换、深度排序与二维画布线框渲染算法。',
		},
	],
	'finance/auto-loan': [
		{
			slug: 'auto-loan-and-irr-cost',
			title: 'Auto Loan True Cost: Decoding Low Down Payment Traps and Real IRR',
			titleZh: '汽车贷款真相：低首付、零利率背后的真实年化成本与 IRR 测算',
			summary: 'Exposing nominal interest rate distortions, hidden processing fees, and real internal rate of return in vehicle financing.',
			summaryZh: '识破车贷低首付与分期手续费背后的名义利率谎言，用真实内部收益率（IRR）算清资金占用成本。',
		},
		{
			slug: 'hidden-cost-of-installments-and-irr',
			title: 'The Hidden Cost of Consumer Installments: Why Nominal Fee Rates Lie and How IRR Reveals the Truth',
			titleZh: '分期付款的隐性成本：名义费率背后的真实 IRR 年化利率陷阱',
			summary: 'Why monthly fee rates roughly double the true annual borrowing cost, proven through cash flow analysis.',
			summaryZh: '严谨现金流折现分析：为什么看似低廉的月手续费会使实际借贷成本翻倍。',
		},
	],
	'finance/loan-payment': [
		{
			slug: 'auto-loan-and-irr-cost',
			title: 'Auto Loan True Cost: Decoding Low Down Payment Traps and Real IRR',
			titleZh: '汽车贷款真相：低首付、零利率背后的真实年化成本与 IRR 测算',
			summary: 'Equal installment amortization schedules, cash flow discounting, and annual percentage rate verification.',
			summaryZh: '等额本息还款模型推导、分期现金流折现分析与真实综合年化利率测算。',
		},
	],
	'finance/inflation': [
		{
			slug: 'inflation-purchasing-power-and-rule-of-72',
			title: 'Inflation and Purchasing Power: The Math of Decay and the Rule of 72',
			titleZh: '通胀与购买力缩水：指数级衰减账本与 72 法则的严谨推导',
			summary: 'The exponential decay of fiat purchasing power, Taylor expansion behind the Rule of 72, and hedging strategies.',
			summaryZh: '法定货币购买力指数级衰减的数学本质、72 法则的泰勒级数推导与抗通胀资产配置要诀。',
		},
	],
	'finance/compound-interest': [
		{
			slug: 'compound-interest-and-irr-guide',
			title: 'The Real Math of Compound Interest: Continuous Compounding and IRR',
			titleZh: '复利与内部收益率（IRR）：从连续复利公式到真实投资回报测算',
			summary: 'Derivation of continuous compounding limits, periodic investment valuation, and cash flow IRR solving.',
			summaryZh: '复利极限推导、定期定投终值模型建立与牛顿迭代法求解不规则现金流真实收益率。',
		},
	],
	'finance/mortgage': [
		{
			slug: 'mortgage-amortization-and-prepayment',
			title: 'Mortgage Math: Equal Principal vs Equal Installment and Early Payoff Secrets',
			titleZh: '房贷还款数学模型：等额本息、等额本金与提前还款的减息账本',
			summary: 'Mathematical models for amortized loans, total interest comparison, and optimal early repayment decision-making.',
			summaryZh: '等额本息与等额本金数学模型精析、全周期利息对比与提前还款减少利息的决策依据。',
		},
	],
	'finance/mortgage-prepayment': [
		{
			slug: 'mortgage-amortization-and-prepayment',
			title: 'Mortgage Math: Equal Principal vs Equal Installment and Early Payoff Secrets',
			titleZh: '房贷还款数学模型：等额本息、等额本金与提前还款的减息账本',
			summary: 'How early prepayment cuts remaining principal and saves compounding interest in long-term home loans.',
			summaryZh: '解析提前还款如何直接削减剩余本金，以及在长期复利周期中实现最大化利息减免。',
		},
	],
	'finance/salary': [
		{
			slug: 'china-income-tax-and-bonus-guide',
			title: 'Comprehensive Guide to China Individual Income Tax and Year-End Bonus Calculation',
			titleZh: '中国个人所得税与年终奖计税全解析：七级超额累进与避坑指南',
			summary: 'Seven-bracket cumulative progressive tax algorithm, social insurance deductions, and year-end bonus cliff pitfalls.',
			summaryZh: '累计预扣法七级超额累进税率、五险一金专项附加扣除与年终奖多发少得临界点盲区拆解。',
		},
	],
	'finance/tax': [
		{
			slug: 'china-income-tax-and-bonus-guide',
			title: 'Comprehensive Guide to China Individual Income Tax and Year-End Bonus Calculation',
			titleZh: '中国个人所得税与年终奖计税全解析：七级超额累进与避坑指南',
			summary: 'Seven-bracket progressive tax mechanism, special deductions, and tax optimization algorithms.',
			summaryZh: '详解个人所得税阶梯计税机制、专项扣除政策逻辑与年终综合所得纳税筹划。',
		},
	],
	'finance/fire-calculator': [
		{
			slug: 'fire-movement-and-4-percent-rule-guide',
			title: 'The 4% Rule and FIRE Movement: Mathematical Modeling for Early Retirement',
			titleZh: '4% 法则与 FIRE 财务自由：提前退休的数学建模与提现率安全边界',
			summary: 'Trinity Study methodology, safe withdrawal rates, and Monte Carlo sequence-of-returns risk in retirement portfolios.',
			summaryZh: '三一学院研究经验法则、动态安全提现率模型与规避退休初期收益顺序风险的策略。',
		},
	],
	'finance/irr-calculator': [
		{
			slug: 'hidden-cost-of-installments-and-irr',
			title: 'The Hidden Cost of Consumer Installments: Why Nominal Fee Rates Lie and How IRR Reveals the Truth',
			titleZh: '分期付款的隐性成本：名义费率背后的真实 IRR 年化利率陷阱',
			summary: 'Revealing true borrowing costs using Internal Rate of Return analysis for amortized installment loans.',
			summaryZh: '使用内部收益率（IRR）方法识破分期付款中名义费率与真实年化借贷成本的巨大鸿沟。',
		},
	],
	'finance/savings-goal': [
		{
			slug: 'inflation-purchasing-power-and-rule-of-72',
			title: 'Inflation and Purchasing Power: The Math of Decay and the Rule of 72',
			titleZh: '通胀与购买力缩水：指数级衰减账本与 72 法则的严谨推导',
			summary: 'Setting realistic savings milestones adjusted for purchasing power depreciation over long time horizons.',
			summaryZh: '在长期储蓄规划中结合通胀折现率，设定切实可行的资产积累目标与定期储蓄路径。',
		},
	],
	'devtools/jwt-decoder': [
		{
			slug: 'jwt-security-and-decoder-pitfalls',
			title: 'JWT Security Architecture: Decoding Traps, None Algorithm, and Local-First Inspection',
			titleZh: 'JWT 安全架构深剖：None 算法漏洞、签名陷阱与纯本地解析实践',
			summary: 'Token structure, vulnerability mitigations (alg=none, key confusion), and zero-server-leak inspection patterns.',
			summaryZh: '剖析 JWT 三段式底层结构、关键漏洞防范（None 算法越权、密钥混淆）与零网络上传纯本地调试规范。',
		},
	],
	'devtools/cron-expression-parser': [
		{
			slug: 'cron-expression-and-timezone-pitfalls',
			title: 'Cron Expression Secrets: Timezones, DST Traps, and Next Run Time Engine',
			titleZh: 'Cron 表达式深度解析：时区、夏令时陷阱与下一触发时间核心算法',
			summary: 'Five vs six-field standards, daylight saving anomalies, and deterministic next-execution search engines.',
			summaryZh: '拆解标准 5 域与 6 域规范异同、跨时区与夏令时跳变陷阱，以及高鲁棒性下一触发时间推算引擎。',
		},
	],
	'devtools/password-generator': [
		{
			slug: 'password-entropy-and-secure-random',
			title: 'Password Entropy and Web Cryptography: Building a Zero-Bias Secure Generator',
			titleZh: '密码熵增与 Web Crypto 安全随机：如何构建零偏差密码生成器',
			summary: 'Information entropy calculation, rejection sampling against modulo bias, and CSPRNG web crypto best practices.',
			summaryZh: '信息熵数学模型、避免取模偏差的拒绝采样算法，以及基于 Web Crypto 的工业级安全随机实践。',
		},
	],
	'devtools/uuid-generator': [
		{
			slug: 'uuid-v4-vs-v7-database-guide',
			title: 'UUID v4 vs UUID v7: The Evolution of Identifiers and Database Index Friendliness',
			titleZh: 'UUID v4 与 v7 演进史：为什么现代数据库主键应当全面拥抱时间序 UUID',
			summary: 'RFC 9562 architecture: why time-ordered UUID v7 drastically optimizes B-Tree indexing over random UUID v4.',
			summaryZh: '解析 RFC 9562 标准核心演进：时间序 UUID v7 如何消除随机 v4 导致的 B+ 树频繁页分裂与写入放大。',
		},
	],
	'devtools/qr-code-generator': [
		{
			slug: 'qr-code-reed-solomon-encoder',
			title: 'Inside the QR Code Pipeline: Reed-Solomon Correction and Mask Optimization in 400 Lines',
			titleZh: '纯手写二维码流水线：Reed-Solomon 纠错与掩码优选的核心实现',
			summary: 'From text stream to pixel matrix: Galois Field GF(256) polynomial division and ISO/IEC 18004 pipeline.',
			summaryZh: '从零解析二维码完整流水线：伽罗瓦有限域多项式长除法、8 种掩码罚分评估与纯手写矩阵排布。',
		},
	],
	'devtools/sql-formatter': [
		{
			slug: 'sql-tokenizer-and-code-formatter',
			title: 'Writing a Zero-Dependency SQL Formatter: State Machines, Indentation, and Infinite Loops',
			titleZh: '手写零依赖 SQL 格式化美化器：有限状态机分词与无限死循环排查',
			summary: 'Handcrafting a deterministic SQL lexer and indentation engine, plus debugging a browser-freezing regex trap.',
			summaryZh: '零依赖实现高鲁棒性 SQL 词法扫描与缩进状态机，以及记一次排查导致浏览器冻结的死循环实战。',
		},
	],
	'devtools/json-formatter': [
		{
			slug: 'sql-tokenizer-and-code-formatter',
			title: 'Writing a Zero-Dependency SQL Formatter: State Machines, Indentation, and Infinite Loops',
			titleZh: '手写零依赖 SQL 格式化美化器：有限状态机分词与无限死循环排查',
			summary: 'Native JSON parser error location mechanics compared with state-machine tokenizer architectures.',
			summaryZh: '原生 JSON 语法报错精确行列定位机制，以及与状态机代码美化架构的工程权衡。',
		},
	],
	'devtools/markdown-preview': [
		{
			slug: 'static-site-byte-ledger',
			title: 'Building a Zero-Third-Party High-Performance Static Web Application',
			titleZh: '纯自建零第三方依赖：高性能前端静态站架构设计与字节账本',
			summary: 'Eliminating external runtime assets and shaving bundle weights for near-instant cold loads.',
			summaryZh: '拆解全站零外部 CDN、零第三方脚本依赖的高性能静态架构与首屏字节控制实践。',
		},
	],
	'converters/length': [
		{
			slug: 'si-units-and-conversion-precision',
			title: 'SI Unit Conversion System: Base Standards, Prefix Scaling, and Precision Guards',
			titleZh: '国际单位制与单位换算设计：基准量换算网络与高精度防护',
			summary: 'SI base standards, prefix multipliers, and building an acyclic base-unit conversion graph.',
			summaryZh: '国际单位制基准量溯源、公制词头阶跃缩放与避免中间精度丢失的基准量换算网络设计。',
		},
	],
	'converters/weight': [
		{
			slug: 'si-units-and-conversion-precision',
			title: 'SI Unit Conversion System: Base Standards, Prefix Scaling, and Precision Guards',
			titleZh: '国际单位制与单位换算设计：基准量换算网络与高精度防护',
			summary: 'Conversion graph design connecting metric mass, imperial avoirdupois, and traditional Chinese market units.',
			summaryZh: '连通公制质量、英制常衡制与市制单位的无环换算拓扑图设计与高精度浮点处理。',
		},
	],
	'devtools/unix-timestamp': [
		{
			slug: 'cron-expression-and-timezone-pitfalls',
			title: 'Cron Expression Secrets: Timezones, DST Traps, and Next Run Time Engine',
			titleZh: 'Cron 表达式深度解析：时区、夏令时陷阱与下一触发时间核心算法',
			summary: 'Epoch seconds, UTC offsets, and leap second handling in distributed scheduling environments.',
			summaryZh: '纪元秒数（Epoch）、UTC 偏移量、时区漂移与分布式任务调度中的时间基准守则。',
		},
	],
	'devtools/number-base-converter': [
		{
			slug: 'floating-point-ieee754-and-precision',
			title: 'Why 0.1 + 0.2 ≠ 0.3: Deep Dive into IEEE 754 and Safe Arithmetic',
			titleZh: '浮点数精度陷阱深度剖析：为什么 0.1 + 0.2 ≠ 0.3 与前端高精度计算设计',
			summary: 'Radix conversions, periodic binary fractions, and arbitrary-precision integer representations.',
			summaryZh: '进制转换中的二进制循环小数现象、浮点截断误差与大整数基数转换算法。',
		},
	],
};
