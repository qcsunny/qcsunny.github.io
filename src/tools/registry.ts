// Central registry of every data-driven tool page. Imported by:
//  - the four dynamic routes src/pages/{category}/[slug].astro (getStaticPaths)
//  - the client dispatcher src/scripts/tools/main.ts (finds the entry by
//    category + slug and renders it with the matching widget)
// compute/stats functions are pure and unit-testable with tsx.
// The scientific calculator (/calculators/standard) and function grapher
// (/calculators/graph) are static pages, not registry entries — see
// CALCULATOR_FEATURED below, which only feeds the index listings.

import { CALCULATOR_TOOLS } from './calculators';
import { CONVERTER_TOOLS } from './converters';
import { FINANCE_TOOLS } from './finance';
import { GENERATOR_TOOLS } from './generators';
import { TEXT_TOOLS } from './textTools';

export type ToolCategory = 'calculators' | 'converters' | 'finance' | 'tools';
export type ToolKind =
	| 'form'
	| 'converter'
	| 'text'
	| 'qr'
	| 'color'
	| 'generator'
	| 'redirect'
	| 'json'
	| 'sql'
	| 'jwt'
	| 'url'
	| 'xml'
	| 'css'
	| 'html'
	| 'markdown';

export interface ToolMeta {
	slug: string;
	category: ToolCategory;
	name: string;
	nameZh?: string;
	description: string;
	descriptionZh?: string;
}

// --- editorial content (SEO) -----------------------------------------------------------
// Rendered under the tool widget by ToolShell: English sections are the page's
// primary content (page lang is en); Chinese sections are marked up with
// lang="zh-CN" so search engines index both language queries.

export interface ToolFaq {
	q: string;
	a: string;
}

export interface ToolContent {
	/** English paragraphs introducing the tool (what/why/how) */
	about?: string[];
	/** Chinese counterpart of about */
	aboutZh?: string[];
	/** English FAQs (also emitted as FAQPage JSON-LD) */
	faq?: ToolFaq[];
	/** Chinese FAQs */
	faqZh?: ToolFaq[];
}

// --- form tools ---------------------------------------------------------------

export interface FormField {
	id: string;
	label: string;
	labelZh?: string;
	/** input type rendered; 'select' needs options, 'checkbox' is boolean */
	type?: 'number' | 'text' | 'select' | 'checkbox' | 'textarea';
	def?: string;
	placeholder?: string;
	/** unit hint shown after the label, e.g. "(%)" or "($)" */
	suffix?: string;
	suffixZh?: string;
	options?: { value: string; label: string; labelZh?: string }[];
	step?: string;
	min?: string;
	max?: string;
	/** long explanation shown under the field */
	hint?: string;
	hintZh?: string;
	wide?: boolean;
	required?: boolean | ((values: FormValues) => boolean);
	/** condition to display and activate this field based on other form values */
	showIf?: (values: FormValues) => boolean;
}

export interface FormResultRow {
	label: string;
	labelZh?: string;
	value: string;
	/** render as the large highlighted primary result */
	emphasis?: boolean;
}

export interface FormTable {
	columns: string[];
	columnsZh?: string[];
	rows: string[][];
}

export interface FormResult {
	rows: FormResultRow[];
	table?: FormTable;
	chartSvg?: string;
	note?: string;
	noteZh?: string;
}

/** Value accessor handed to compute(); keeps configs terse and typed. */
export interface FormValues {
	/** parsed number, NaN when empty/invalid */
	num(id: string): number;
	/** raw input string, trimmed */
	str(id: string): string;
	bool(id: string): boolean;
}

export interface FormConfig {
	intro?: string;
	introZh?: string;
	fields: FormField[];
	compute: (v: FormValues) => FormResult;
}

// --- other kinds --------------------------------------------------------------

export interface ConverterConfig {
	/** category id in ./units */
	categoryId: string;
}

export interface TextStat {
	label: string;
	labelZh?: string;
	value: string;
}

export interface TextTransform {
	id: string;
	label: string;
	labelZh?: string;
	run: (text: string) => { output: string; error?: string };
}

export interface TextConfig {
	placeholder?: string;
	/** live per-input statistics rows */
	stats?: (text: string) => TextStat[];
	/** button-triggered transforms writing into an output area */
	transforms?: TextTransform[];
	/** monospace font for input/output (code-like tools) */
	mono?: boolean;
}

// --- generator tools (password / uuid / random) ------------------------------------

export interface PasswordGenConfig {
	generator: 'password';
	minLen: number;
	maxLen: number;
	defLen: number;
}

export interface UuidGenConfig {
	generator: 'uuid';
	defCount: number;
	maxCount: number;
}

export interface RandomGenConfig {
	generator: 'random';
	defMin: number;
	defMax: number;
	defCount: number;
}

export type GeneratorConfig = PasswordGenConfig | UuidGenConfig | RandomGenConfig;

export interface RedirectConfig {
	target: string;
}

export type ToolEntry = ToolMeta &
	(
		| { kind: 'form'; config: FormConfig }
		| { kind: 'converter'; config: ConverterConfig }
		| { kind: 'text'; config: TextConfig }
		| { kind: 'qr' }
		| { kind: 'color' }
		| { kind: 'generator'; config: GeneratorConfig }
		| { kind: 'redirect'; config: RedirectConfig }
		| { kind: 'json' }
		| { kind: 'sql' }
		| { kind: 'jwt' }
		| { kind: 'url' }
		| { kind: 'xml' }
		| { kind: 'css' }
		| { kind: 'html' }
		| { kind: 'markdown' }
	) & { content?: ToolContent };

// --- categories ----------------------------------------------------------------

export const CATEGORIES: {
	id: ToolCategory;
	label: string;
	labelZh: string;
	blurb: string;
	blurbZh: string;
}[] = [
	{
		id: 'finance',
		label: 'Finance & Investment',
		labelZh: '金融理财与投资计算',
		blurb: 'Mortgage prepayment, compound interest, true APR/IRR, inflation, savings goals, and FIRE freedom.',
		blurbZh: '房贷提前还款、复利定投、真实年化利率 IRR、通货膨胀、目标储蓄与 FIRE 财务自由。',
	},
	{
		id: 'calculators',
		label: 'Math & Statistics',
		labelZh: '数学与统计计算',
		blurb: 'Scientific calculator, function graphing, percentage, ratios, fractions, and summary statistics.',
		blurbZh: '科学计算器、函数图像绘制、百分比增减、比例方程、最简分数与统计分析。',
	},
	{
		id: 'tools',
		label: 'Developer & Security Tools',
		labelZh: '开发调试与安全工具',
		blurb: 'JSON, SQL, JWT, URL, XML, CSS, HTML formatters, UUID v4/v7, QR code, and passwords.',
		blurbZh: 'JSON/SQL 格式化、JWT 解码、UUID v4/v7、二维码生成、强密码生成与文本工具。',
	},
	{
		id: 'converters',
		label: 'Unit Converters',
		labelZh: '多功能单位换算',
		blurb: 'Length, weight, temperature, area, volume, speed, time, data storage, and color conversion.',
		blurbZh: '长度、重量、温度、面积、体积、速度、时间、数据存储以及 HEX/RGB/HSL 颜色换算。',
	},
];

/** Static feature pages listed on the calculators index (real routes live in src/pages/calculators/).
 *  They are hand-written pages rather than registry-driven ones, so they carry
 *  no `kind`; the field stays optional so the index listings can filter these
 *  and REGISTRY entries with one expression. */
export const CALCULATOR_FEATURED: (ToolMeta & { kind?: ToolKind; content?: ToolContent })[] = [
	{
		slug: 'standard',
		category: 'calculators',
		name: 'Scientific Calculator',
		nameZh: '科学计算器',
		description: 'Standard and scientific calculator with variables, history and DEG/RAD modes.',
		descriptionZh: '标准与科学计算器，支持变量存储、历史记录与角度/弧度切换。',
	},
	{
		slug: 'graph',
		category: 'calculators',
		name: 'Function Grapher',
		nameZh: '函数图像绘制器',
		description: 'Plot up to 5 functions with zoom, pan and a live value crosshair.',
		descriptionZh: '同时绘制多达 5 条函数图像，支持平移缩放与十字准星实时取值。',
	},
	{
		slug: 'graph3d',
		category: 'calculators',
		name: '3D Surface Plotter',
		nameZh: '三维函数图像绘制器',
		description: 'Plot z = f(x, y) as a shaded 3D surface you can rotate, zoom and inspect.',
		descriptionZh: '把 z = f(x, y) 绘制为可旋转缩放的三维曲面，支持等高配色与极值读数。',
	},
];

export function categoryLabel(id: ToolCategory): string {
	return CATEGORIES.find((c) => c.id === id)?.label ?? id;
}

export function categoryLabelZh(id: ToolCategory): string {
	return CATEGORIES.find((c) => c.id === id)?.labelZh ?? id;
}

/** Registry entries for /tools/qr-code-generator and /tools/color-converter.
 *  Their widgets live in src/scripts/tools/{qr,color}.ts and are loaded via
 *  dynamic import from the dispatcher. */
export const TOOL_WIDGETS: ToolEntry[] = [
	{
		slug: 'qr-code-generator',
		category: 'tools',
		name: 'QR Code Generator',
		nameZh: '二维码生成器',
		description: 'Turn text or URLs into downloadable QR codes, generated entirely in your browser.',
		descriptionZh: '将文本或网址转换为可下载的二维码，完全在浏览器本地生成。',
		kind: 'qr',

		content: {
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
	},
	{
		slug: 'color-converter',
		category: 'tools',
		name: 'Color Converter',
		nameZh: '颜色换算工具',
		description: 'Convert colors between HEX, RGB and HSL with a live swatch and complement.',
		descriptionZh: '在 HEX、RGB 和 HSL 之间转换颜色，支持实时色块预览与互补色计算。',
		kind: 'color',

		content: {
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
	},
];

/** Every registry-driven tool page, all four categories. */
export const REGISTRY: ToolEntry[] = [
	...CALCULATOR_TOOLS,
	...CONVERTER_TOOLS,
	...FINANCE_TOOLS,
	...TEXT_TOOLS,
	...GENERATOR_TOOLS,
	...TOOL_WIDGETS,
];

export function findEntry(category: string, slug: string): ToolEntry | undefined {
	return REGISTRY.find((e) => e.category === category && e.slug === slug);
}

/** Comprehensive searchable aliases and keywords for tools across EN & ZH */
export const TOOL_KEYWORDS: Record<string, string> = {
	'mortgage': '房贷 房贷计算器 等额本息 等额本金 商业贷款 公积金贷款 组合贷款 成本平衡点 首付 月供 利率 LPR 买房 home loan mortgage payment crossover',
	'mortgage-prepayment': '提前还贷 提前还款 缩短年限 减少月供 结清 房贷省息 利息计算 mortgage prepayment balance payoff',
	'loan-payment': '贷款月供 贷款本金 个人贷款 等额本息 借款额度 每月预算 还款计划 loan payment installment amortization',
	'irr-calculator': 'irr apr 真实年化利率 真实利率 信用卡分期 综合费率 手续费 名义费率 internal rate return true apr installment',
	'compound-interest': '复利 复利计算器 定投 72法则 滚雪球 利滚利 理财收益 投资 compound interest returns investment',
	'investment-return': '投资回报 投资收益 年化收益率 理财 基金 股票 investment return roi growth',
	'tax': '个税 个人所得税 五险一金 专项附加扣除 年终奖 单独计税 综合所得 薪资到手 逆向反推 income tax take home salary payroll',
	'salary': '薪资 时薪 日薪 月薪 年薪 工资换算 工作日 工时 hourly wage salary conversion paycheck',
	'auto-loan': '车贷 汽车贷款 落地首付 购置税 车险 购车计算器 分期购车 auto loan car financing vehicle price',
	'fire-calculator': 'fire 财务自由 提前退休 4%法则 被动收入 养老规划 financial independence retire early',
	'inflation': '通货膨胀 通胀 购买力贬值 物价上涨 资产缩水 现值终值 inflation purchasing power future value',
	'savings-goal': '目标储蓄 存钱规划 每月定投 倒推储蓄 备用金 养老金 savings goal monthly target plan',
	'roi': 'roi 投资回报率 投资收益率 利润率 盈亏平衡 商业分析 return on investment profit margin',
	'discount': '打折 折扣 满减 优惠 打折计算器 促销 折后价 discount sales percent off savings',
	'json-formatter': 'json 格式化 校验 压缩 美化 解析 语法高亮 json format validator parser prettify minify',
	'sql-formatter': 'sql 格式化 sql美化 数据库查询 ddl dml 大小写转换 sql prettifier database query format',
	'jwt-decoder': 'jwt 解码 token bearer json web token header payload signature auth',
	'base64': 'base64 编码 解码 文本编解码 base64 encode decode binary string',
	'url-parser': 'url 解析 查询参数 url编解码 query params encode decode hostname protocol path',
	'xml-formatter': 'xml 格式化 树形视图 美化 缩进 xml formatter pretty print indent',
	'css-formatter': 'css 格式化 样式美化 压缩 展开 整理 css prettify minify beautifier',
	'html-formatter': 'html 格式化 网页代码美化 缩进 压缩 html beautifier indent format',
	'markdown-preview': 'markdown 渲染 markdown预览 实时渲染 实时预览 gfm 编辑器 排版 导出html 解析器 markdown viewer editor preview compiler gfm table',
	'password-generator': '密码 强密码 随机密码 密码生成器 字符熵 安全密码 password generator random crypto secure',
	'uuid-generator': 'uuid guid v4 v7 唯一标识符 随机uuid 时间戳uuid uuid generator random monotonic',
	'random-number': '随机数 随机抽取 掷骰子 抽签 范围生成器 random number generator dice range lottery',
	'qr-code-generator': '二维码 qr code 生成 二维码制作 扫码 qr code generator barcode matrix',
	'color-converter': '颜色转换 hex rgb hsl 调色板 互补色 颜色换算 color converter hex rgb hsl palette',
	'word-counter': '字数统计 字符数 汉字数 英文单词 阅读时间 句子段落 word count character counter reading time cjk',
	'character-counter': '字符统计 字母 数字 空格 字节数 utf-8 character counter bytes letters numbers',
	'weight': '重量 质量 单位换算 公斤 千克 克 市斤 两 磅 盎司 克拉 金衡盎司 吨 weight mass kg lb oz g jin stone carat',
	'length': '长度 距离 单位换算 米 厘米 毫米 公里 千米 尺 寸 里 英里 海里 英寸 英尺 码 length distance m km cm inch ft yard mile',
	'area': '面积 换算 平方米 平方厘米 平方公里 平方千米 亩 公顷 平方英尺 平方英里 area square meter hectare acre sq ft',
	'volume': '体积 容积 换算 升 毫升 立方米 立方分米 立方厘米 加仑 桶 volume capacity liter gallon cubic meter ml',
	'temperature': '温度 换算 摄氏度 华氏度 开尔文 celsius fahrenheit kelvin temperature',
	'speed': '速度 换算 千米每小时 公里每小时 米每秒 节 马赫 迈 码 km/h m/s knot mach mph speed velocity',
	'pressure': '压强 压力 换算 帕斯卡 帕 千帕 兆帕 标准大气压 巴 毫米汞柱 psi bar kpa pressure atmospheric pascal',
	'power': '功率 换算 瓦特 瓦 千瓦 兆瓦 马力 匹 w kw hp megawatt power wattage horsepower',
	'energy': '能量 功 换算 焦耳 千焦 卡路里 大卡 千瓦时 度 电子伏特 joule calorie kwh btu energy work',
	'time': '时间 换算 秒 分钟 小时 天 周 月 年 毫秒 微秒 time duration second minute hour day week year',
	'data': '数据 存储容量 换算 bit 字节 byte kb mb gb tb pb 计算机存储 data storage byte gigabyte terabyte',
	'percentage': '百分比 百分率 占比 计算 增加 减少 percentage math percent of proportion',
	'percentage-increase': '百分比增长 增长率 变化率 增幅 跌幅 环比 同比 percentage increase growth rate change',
	'ratio': '比例 比值 化简 黄金分割 缩放 ratio simplify scale a:b',
	'proportion': '比例式 方程求解 a:b=c:x 内项外项 proportion solve equation cross multiply',
	'simple-interest': '单利 利息计算 本息和 simple interest p r t principal',
	'fraction': '分数 约分 化简 最简分数 小数转分数 分数转小数 fraction simplify decimal continued',
	'average': '平均数 平均值 中位数 众数 统计 标准差 方差 mean median mode average statistics variance',
	'standard': '科学计算器 计算器 算术函数 根号 三角函数 次方 scientific calculator standard math sqrt sin cos',
	'graph': '函数图像 曲线绘制 坐标系 绘图 函数可视化 function grapher plotting curves calculus',
	'graph3d': '三维函数 3d函数图像 空间曲面 曲面绘制 双变量函数 马鞍面 等高线 立体绘图 二元函数 偏导 3d surface plotter mesh wireframe two variable saddle contour',
};

export interface SearchItem {
	slug: string;
	category: ToolCategory;
	name: string;
	nameZh?: string;
	description: string;
	href: string;
	keywords: string;
}

export function getAllSearchItems(): SearchItem[] {
	const all = [...CALCULATOR_FEATURED, ...REGISTRY.filter((e) => e.kind !== 'redirect')];
	return all.map((e) => ({
		slug: e.slug,
		category: e.category,
		name: e.name,
		nameZh: e.nameZh || '',
		description: e.description,
		href: `/${e.category}/${e.slug}/`,
		keywords: TOOL_KEYWORDS[e.slug] || '',
	}));
}

