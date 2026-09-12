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
import { DAILY_TOOLS } from './daily';
import { SECURITY_GENERATOR_TOOLS, DEVTOOLS_GENERATOR_TOOLS } from './generators';
import { DEVTOOLS_WIDGETS, COLOR_WIDGETS } from './widgets';
import { FINANCE_TOOLS } from './finance';
import { DEVTOOLS_TEXT_TOOLS, OFFICE_TEXT_TOOLS, SECURITY_TEXT_TOOLS, TEXT_TOOLS, MEDIA_TEXT_TOOLS, COLOR_TEXT_TOOLS, SEO_TEXT_TOOLS, FUN_TEXT_TOOLS } from './textTools';

export type ToolCategory = 'calculators' | 'converters' | 'finance' | 'devtools' | 'office' | 'security' | 'text' | 'media' | 'color' | 'seo' | 'fun' | 'daily';
export type ToolKind =
	| 'form'
	| 'converter'
	| 'text'
	| 'qr'
	| 'color'
	| 'generator'
	| 'redirect'
	| 'json'
	| 'jsonschema'
	| 'meta'
	| 'fractal'
	| 'imgfilter'
	| 'gridgen'
	| 'flexgen'
	| 'xlsxanalyzer'
	| 'pdftoolkit'
	| 'pdfocr'
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
	/** Temporarily hide the tool without deleting its code. It gets no page, so
	 *  its URL 404s (the site's no-redirect policy), and every listing follows
	 *  automatically — the category hubs, the tools hub, the homepage counts,
	 *  the search index, llms.txt and the sitemap all derive from REGISTRY,
	 *  which drops disabled entries at the one point below. Its client config
	 *  stays in the category's lazy chunk, because catalog.ts imports the data
	 *  files rather than REGISTRY, so re-enabling is a flag flip plus a
	 *  rebuild.
	 *
	 *  Two references cannot be pruned for you: a stale `content.ts` key is
	 *  inert dead weight until the tool comes back, but a blog post's
	 *  `relatedTools` entry pointing at it fails loudly (e2e/blog-tools-card).
	 *  e2e/hidden-tools pins that a disabled tool ships no page and no listing. */
	disabled?: boolean;
}

// --- editorial content (SEO) -----------------------------------------------------------
// Rendered under the tool widget by ToolShell: English sections are the page's
// primary content (page lang is en); Chinese sections are marked up with
// lang="zh-CN" so search engines index both language queries.
//
// The prose itself lives in ./content.ts, keyed "<category>/<slug>", and is
// deliberately NOT a field on ToolEntry — see that file's header for the byte
// count that decision is worth.

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
	/** input type rendered; 'select' needs options, 'checkbox' is boolean;
	 *  'bigint' is a text field with a numeric keypad whose value is read as
	 *  BigInt (use when the number can exceed Number's exact 2^53 range);
	 *  'date' is a native date picker whose value is the ISO string read
	 *  via str() and parsed by compute() */
	type?: 'number' | 'bigint' | 'text' | 'select' | 'checkbox' | 'textarea' | 'date';
	def?: string;
	placeholder?: string;
	placeholderZh?: string;
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
	/** fast clickable preset chips rendered below the input */
	presets?: { label: string; labelZh?: string; value: string }[];
}

export interface FormResultRow {
	label: string;
	labelZh?: string;
	value: string;
	/** only for rows whose value is prose rather than a number */
	valueZh?: string;
	/** render as the large highlighted primary result */
	emphasis?: boolean;
}

export interface FormTable {
	columns: string[];
	columnsZh?: string[];
	rows: string[][];
	/** same shape as rows; supply it only when a cell carries words, not digits */
	rowsZh?: string[][];
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
	/** exact integer for a 'bigint' field; null when empty / not digits / > 2^64−1 */
	bigint(id: string): bigint | null;
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
	/** `error` is shown in the English view, `errorZh` in the Chinese one; with
	 *  errorZh missing the English text shows in both. The second argument is
	 *  the optional secret box's current value ('' when the tool declares no
	 *  secretInput, or the i18n harness runs transforms headless). */
	run: (
		text: string,
		secret?: string,
	) =>
		| { output: string; error?: string; errorZh?: string }
		| Promise<{ output: string; error?: string; errorZh?: string }>;
}

export interface TextConfig {
	/** sample content prefilled into the input on first load — use clearly
	 *  fictional data (example.com, placeholder names), never anything that
	 *  could read as a real person's information */
	def?: string;
	placeholder?: string;
	placeholderZh?: string;
	/** live per-input statistics rows */
	stats?: (text: string) => TextStat[];
	/** button-triggered transforms writing into an output area */
	transforms?: TextTransform[];
	/** monospace font for input/output (code-like tools) */
	mono?: boolean;
	/** whether the primary transform should run live on input (with debounce) */
	live?: boolean;
	/** File-drop support: accepted extensions ('.yml,.yaml'). When set, the
	 *  input textarea becomes a drop zone with a file-picker button; the file
	 *  is read as TEXT locally and dropped into the box. Binary hashing goes
	 *  through fileTransform instead. */
	acceptFiles?: string;
	/** Binary counterpart of transforms for file-oriented tools: given the
	 *  raw bytes (never leaves the browser), produce the output. When set, a
	 *  file picker + drop zone replaces the textarea content source; the
	 *  textarea still shows the pasted-text path. */
	fileTransform?: (data: ArrayBuffer, name: string, size: number, secret: string) => Promise<{ output: string; error?: string; errorZh?: string }>;
	/** An extra password-type input rendered above the transform buttons
	 *  (HMAC keys and the like). Its current value is passed to every
	 *  transform's run() as the second argument. */
	secretInput?: { label: string; labelZh?: string; placeholder?: string; placeholderZh?: string };
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
		| { kind: 'jsonschema' }
		| { kind: 'meta' }
		| { kind: 'fractal' }
		| { kind: 'imgfilter' }
		| { kind: 'gridgen' }
		| { kind: 'flexgen' }
		| { kind: 'xlsxanalyzer' }
		| { kind: 'pdftoolkit' }
		| { kind: 'pdfocr' }
		| { kind: 'sql' }
		| { kind: 'jwt' }
		| { kind: 'url' }
		| { kind: 'xml' }
		| { kind: 'css' }
		| { kind: 'html' }
		| { kind: 'markdown' }
	);

// --- categories ----------------------------------------------------------------

export const CATEGORIES: {
	id: ToolCategory;
	label: string;
	labelZh: string;
	blurb: string;
	blurbZh: string;
}[] = [
	{
		id: 'office',
		label: 'Office & Documents',
		labelZh: 'Office 办公与文档处理',
		blurb: 'Excel workbook analysis and cleaning, the PDF toolkit (merge, split, watermark), and document OCR for PDFs and images.',
		blurbZh: 'Excel 工作簿分析与清理、PDF 工具箱（合并/拆分/水印）、PDF 与图片的文档 OCR 识别。',
	},
	{
		id: 'security',
		label: 'Security & Privacy',
		labelZh: '安全与隐私',
		blurb: 'Password strength, hashing and HMAC, JWT inspection, subnet math, and what your browser reveals about you.',
		blurbZh: '强密码生成、哈希与 HMAC、JWT 检查、子网计算、浏览器隐私指纹自查。',
	},
	{
		id: 'text',
		label: 'Text Processing',
		labelZh: '文本处理',
		blurb: 'Case conversion, dedupe and sort, extraction, diffs, CSV ⇄ JSON, markdown tools, word and character counts.',
		blurbZh: '大小写转换、去重排序、内容提取、文本对比、CSV ⇄ JSON、Markdown 工具、字数统计。',
	},
	{
		id: 'media',
		label: 'Media Files',
		labelZh: '媒体文件',
		blurb: 'Video and audio metadata parsing, true-lossless detection, and a GPU convolution filter lab.',
		blurbZh: '视频音频元数据解析、真假无损判别、GPU 卷积滤镜实验室。',
	},
	{
		id: 'color',
		label: 'Color & Design',
		labelZh: '颜色与设计',
		blurb: 'Color conversion, palettes, WCAG contrast, and the CSS size/clamp helpers designers reach for.',
		blurbZh: '颜色转换、配色方案、WCAG 对比度检查、CSS 尺寸与 clamp 助手。',
	},
	{
		id: 'seo',
		label: 'SEO & Site',
		labelZh: 'SEO 与站点',
		blurb: 'Meta tags with OG preview, robots.txt, sitemap.xml, and URL slug generation.',
		blurbZh: 'Meta 标签与 OG 预览、robots.txt、sitemap.xml、URL slug 生成。',
	},
	{
		id: 'fun',
		label: 'Experiments & Fun',
		labelZh: '实验与趣味',
		blurb: 'The Mandelbrot and Julia explorer — one GPU thread per pixel.',
		blurbZh: '曼德博与朱利亚集合浏览器——每像素一个 GPU 线程。',
	},
	{
		id: 'daily',
		label: 'Daily Calculators',
		labelZh: '日常计算',
		blurb: 'Age, date and BMI calculators, plus the time zone converter with a world clock.',
		blurbZh: '年龄、日期与 BMI 计算器，以及带世界时钟的时区转换。',
	},
	{
		id: 'finance',
		label: 'Finance & Investment',
		labelZh: '金融理财与投资计算',
		blurb: 'Mortgage prepayment, compound interest, true APR/IRR, inflation, savings goals, and FIRE freedom.',
		blurbZh: '房贷提前还款、复利定投、真实年化利率 IRR、通货膨胀、目标储蓄与 FIRE 财务自由。',
	},
	{
		id: 'devtools',
		label: 'Developer Tools',
		labelZh: '开发调试工具',
		blurb: 'JSON, SQL, YAML, XML, HTML, CSS and JS formatters, base64, regex, cron, timestamps, ports, mime and status-code lookups.',
		blurbZh: 'JSON/SQL/YAML/XML/HTML/CSS/JS 格式化，base64、正则、cron、时间戳、端口、MIME 与状态码查询。',
	},
	{
		id: 'calculators',
		label: 'Math & Statistics',
		labelZh: '数学与统计计算',
		blurb: 'Every calculator: scientific calculator, function graphing, percentages, fractions, ratios, summary statistics and linear regression.',
		blurbZh: '全部计算工具：科学计算器、函数图像绘制、百分比增减、比例方程、最简分数、统计分析与线性回归。',
	},
	{
		id: 'converters',
		label: 'Unit Converters',
		labelZh: '多功能单位换算',
		blurb: 'Length, weight, temperature, area, volume, speed, time, data storage, energy, power, and pressure.',
		blurbZh: '长度、重量、温度、面积、体积、速度、时间、数据存储、能量热量、功率马力与压力压强换算。',
	},
];

/** Static feature pages listed on the calculators index (real routes live in src/pages/calculators/).
 *  They are hand-written pages rather than registry-driven ones, so they carry
 *  no `kind`; the field stays optional so the index listings can filter these
 *  and REGISTRY entries with one expression. */
export const CALCULATOR_FEATURED: (ToolMeta & { kind?: ToolKind })[] = [
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

/** Breadcrumb href for a category — each category has its own hub page, so a
 *  category link always lands on a page whose title is that category's name.
 *  Every category maps 1:1 onto its route segment: /finance/, /calculators/,
 *  /converters/, /devtools/, /office/, /security/, /text/, /media/, /color/,
 *  /seo/, /fun/ and /daily/. */
export function categoryHref(id: ToolCategory): string {
	return `/${id}/`;
}


/** The category table — the one place a data group is filed under a category.
 *
 * Every entry declares exactly one `category`, and that field is the single
 * source of truth: it decides the URL segment (/office/<slug>/), which hub and
 * breadcrumb the page sits under, and the search index row. To recategorize a
 * tool, change that field and move its entry to the matching group below.
 *
 * The groups exist only to split the client bundle — catalog.ts imports one
 * group per page, so a text tool never downloads the finance configs (the
 * perf-budget spec pins this). That is why a move is two edits rather than
 * one: REGISTRY routes off the `category` field, while the client chunk off
 * group membership, and if the two disagree you get a page whose script cannot
 * find its own config. So they are cross-checked at every build instead of by
 * eyeball — the drift was what silently dropped mandelbrot-explorer, whose
 * entry had been removed from its group while `category: 'fun'` still stood.
 */
const CATEGORY_GROUPS: { id: ToolCategory; entries: ToolEntry[] }[] = [
	{ id: 'calculators', entries: CALCULATOR_TOOLS },
	{ id: 'converters', entries: CONVERTER_TOOLS },
	{ id: 'finance', entries: FINANCE_TOOLS },
	{ id: 'daily', entries: DAILY_TOOLS },
	{ id: 'devtools', entries: [...DEVTOOLS_TEXT_TOOLS, ...DEVTOOLS_GENERATOR_TOOLS, ...DEVTOOLS_WIDGETS] },
	{ id: 'text', entries: TEXT_TOOLS },
	{ id: 'office', entries: OFFICE_TEXT_TOOLS },
	{ id: 'security', entries: [...SECURITY_TEXT_TOOLS, ...SECURITY_GENERATOR_TOOLS] },
	{ id: 'media', entries: MEDIA_TEXT_TOOLS },
	{ id: 'color', entries: [...COLOR_TEXT_TOOLS, ...COLOR_WIDGETS] },
	{ id: 'seo', entries: SEO_TEXT_TOOLS },
	{ id: 'fun', entries: FUN_TEXT_TOOLS },
];

/** Every registry-driven tool page, across all categories. Disabled entries
 *  are dropped here, at the single point every page and listing reads — the
 *  route files' getStaticPaths, the hubs, REAL_TOOLS, findEntry and the search
 *  index all follow from this array. The category assertion below still walks
 *  group.entries, so a disabled tool keeps getting its category/group check. */
export const REGISTRY: ToolEntry[] = CATEGORY_GROUPS.flatMap((g) => g.entries).filter(
	(e) => !e.disabled,
);

/** Every entry the data files declare but REGISTRY has hidden — kept out of
 *  e2e/hidden-tools.spec so that spec can fail if one of these ever ships a
 *  page or a listing anyway. */
export const HIDDEN_TOOLS: ToolEntry[] = [...CATEGORY_GROUPS.flatMap((g) => g.entries)]
	.filter((e) => e.disabled);

// Asserted at build time — registry.ts is imported by every page's frontmatter,
// so a failure fails the build rather than shipping a broken category.
for (const group of CATEGORY_GROUPS) {
	for (const entry of group.entries) {
		if (entry.category !== group.id) {
			throw new Error(
				`registry: "${entry.slug}" sits in the "${group.id}" group but declares category "${entry.category}". ` +
					`Move the entry to the matching group or change its category — they must agree.`,
			);
		}
	}
	if (!CATEGORIES.some((c) => c.id === group.id)) {
		throw new Error(`registry: group "${group.id}" has no CATEGORIES entry, so its hub page would render no title.`);
	}
}
for (const cat of CATEGORIES) {
	if (!CATEGORY_GROUPS.some((g) => g.id === cat.id)) {
		throw new Error(`registry: category "${cat.id}" is in CATEGORIES but has no data group, so its hub would be empty.`);
	}
}

/** Every real tool page the site has: the calculators CALCULATOR_FEATURED
 *  lists (they are static pages, not registry entries) plus every registry
 *  entry, minus the legacy redirect stubs that carry no page. The canonical
 *  list — the homepage's featured picks, the category pages, the search index
 *  and llms.txt all derive their rows and counts from it, so adding a tool
 *  needs no hand-edited number or list anywhere. */
export const REAL_TOOLS = [...CALCULATOR_FEATURED, ...REGISTRY].filter(
	(e) => e.kind !== 'redirect',
);

/** How many tool pages the site has. Derive from REAL_TOOLS rather than
 *  re-filtering CALCULATOR_FEATURED + REGISTRY yourself: this is the one
 *  source for "how many tools" (SITE_DESCRIPTION's meta, the homepage/about/
 *  blog counts), so the number can never drift from what the registry holds. */
export const TOOL_COUNT = REAL_TOOLS.length;

export function findEntry(category: string, slug: string): ToolEntry | undefined {
	return REGISTRY.find((e) => e.category === category && e.slug === slug);
}

/** Comprehensive searchable aliases and keywords for tools across EN & ZH */
export const TOOL_KEYWORDS: Record<string, string> = {
	'mortgage': '房贷 房贷计算器 等额本息 等额本金 商业贷款 公积金贷款 组合贷款 成本平衡点 首付 月供 利率 LPR 买房 home loan mortgage payment crossover',
	'rent-vs-buy': '买房 租房 买房还是租房 收益对比 房价涨幅 租金涨幅 首付机会成本 复利对比 rent vs buy home equity investment net worth',
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
	'retirement-drawdown': '退休 养老金提取 资产耗尽 提款率 4%法则 提款策略 通胀调整 retirement drawdown withdrawal depletion nest egg',
	'refinance': '再融资 转按揭 房贷转按 利率下调 降息 回本月数 月供节省 refinance break even closing costs rate',
	'rental-yield': '租金收益率 租售比 资本化率 cap rate 净营业收入 noi 收租 投资房产 房产投资 rental yield price to rent vacancy',
	'credit-card-minimum': '信用卡 最低还款 循环利息 还款陷阱 信用卡逾期 利息计算 credit card minimum payment apr revolving interest debt',
	'annuity-calculator': '年金 年金现值 年金终值 先付年金 普通年金 养老年金 保险给付 折现 annuity present future value pension payout due ordinary',
	'json-formatter': 'json 格式化 校验 压缩 美化 解析 语法高亮 json format validator parser prettify minify',
	'sql-formatter': 'sql 格式化 sql美化 数据库查询 ddl dml 大小写转换 sql prettifier database query format',
	'jwt-decoder': 'jwt 解码 token bearer json web token header payload signature auth 验签 签发 hs256 hs512 hmac sign verify',
		'net-worth': '净资产 资产负债 资产 负债 个人财务 net worth assets liabilities',
		'lump-sum-vs-dca': '定投 一次性投资 定期定额 平均成本法 dca dollar cost averaging lump sum',
		'real-return': '真实收益率 实际收益率 通胀 购买力 费雪 real return inflation fisher',
		'port-lookup': '端口 查询 网络端口 tcp udp 6379 3306 22 80 well known port',
		'timezone-converter': '时区 转换 世界时钟 城市时间 时差 夏令时 timezone converter world clock dst',
		'css-clamp': 'css clamp 响应式字号 流式排版 fluid type clamp calculator',
		'wcag-contrast': '对比度 无障碍 wcag 颜色对比 accessibility contrast ratio aa aaa',
		'color-palette': '配色 色板 色轮 互补色 邻近色 三角配色 palette generator harmony',
		'lossless-checker': '无损音乐 真假无损 flac 频谱 转码 检测 lossless spectrum transcode',
		'browser-info': '浏览器信息 硬件信息 gpu 显卡 核心数 屏幕 分辨率 解码支持 hevc av1 browser hardware info navigator',
		'mandelbrot-explorer': '曼德博 分形 范数集合 朱利亚 复平面 缩放 mandelbrot julia fractal explorer zoom',
		'css-grid-generator': 'css grid 网格 布局 生成器 可视化 拖拽 行列 grid template columns span',
		'flexbox-generator': 'flexbox 弹性 布局 生成器 可视化 justify content align items direction wrap gap',
		'xlsx-analyzer': 'excel 工作簿 分析 清理 xlsx xlsm 膨胀 体积 优化 样式 cellXfs 命名区域 defined names 外部链接 媒体 透视缓存 pivot cache bloat clean',
		'pdf-toolkit': 'pdf 工具箱 合并 拆分 提取 页面 旋转 水印 压缩 元数据 清除 转图片 图片转pdf merge split extract rotate watermark compress metadata pdf to image',
		'document-ocr': 'ocr 文字识别 光学字符识别 扫描 pdf 转文字 图片转文字 tesseract 识别 中文识别 英文识别 text recognition extract text from image scanned document',
		'image-filter-lab': '图像滤镜 卷积 模糊 锐化 边缘检测 浮雕 卷积核 convolution kernel filter image processing',
		'http-status-lookup': 'http 状态码 404 500 302 status code 错误码 重定向 查询',
		'mime-type-lookup': 'mime 类型 content-type 文件类型 扩展名 application/pdf 查询 mime type',
		'user-agent-parser': 'user agent ua 解析 浏览器识别 爬虫识别 设备 useragent browser detection',
		'media-info': '视频信息 mediainfo 元数据 码率 分辨率 时长 帧率 mp4 webm mkv wav metadata',
		'robots-txt-generator': 'robots.txt 生成 爬虫协议 disallow allow 校验 生成器',
		'sitemap-xml-generator': 'sitemap 网站地图 生成 校验 url 收录 lastmod',
		'meta-tag-generator': 'meta 标签 seo og open graph twitter card 社交分享 预览 生成',
		'json-schema': 'json schema 生成 校验 draft-07 validator generator schema',
		'json-diff': 'json 对比 差异 比较 diff compare json对比工具',
		'calculus': '微积分 导数 求导 定积分 极限 derivative integral limit differentiation',
		'polynomial-regression': '多项式回归 最小二乘 拟合 曲线拟合 regression least squares fit',
		'probability-distribution': '概率分布 二项分布 泊松分布 binomial poisson pmf cdf 概率计算',
		'linear-regression': '线性回归 多元回归 ols wls gls 稳健标准误 聚类 异方差 robust standard errors cluster heteroskedasticity',
		'ols-diagnostics': '回归诊断 残差分析 异方差 自相关 durbin-watson breusch-pagan white cook距离 杠杆值 影响点诊断 diagnostics residual influence',
		'quantile-regression': '分位数回归 中位数回归 稳健回归 check loss quantile median regression',
		'mixed-effects-model': '混合效应模型 随机截距 随机效应 分层线性模型 icc mixed model random intercept hierarchical multilevel',
		'logistic-regression': '逻辑回归 logit probit 二分类 边际效应 优势比 logistic binary classification marginal effects odds',
		'count-regression': '计数回归 泊松回归 负二项 零膨胀 过散度 poisson negative binomial zero-inflated overdispersion',
		'time-series-stationarity': '平稳性检验 单位根 adf kpss adf检验 平稳 时间序列 unit root stationarity',
		'arima-forecast': 'arima sarimax 时间序列预测 预测 区间 arima forecast time series prediction',
		'var-vecm': 'var 向量自回归 granger因果 协整 johansen 脉冲响应 vecm cointegration impulse response',
		'state-space-kalman': '卡尔曼滤波 状态空间 不可观测分量 局部水平 平滑 kalman filter state space local level smoothing',
		'line-organizer': '去重 删除重复行 排序 文本行排序 空行清理 行首尾空白 列表整理 dedupe unique sort lines remove duplicates trim whitespace',
		'text-extractor': '提取网址 提取邮箱 正则提取 url email extractor 抓取 邮件地址',
		'slug-generator': 'slug url 别名 seo 友好链接 标题转url kebab-case 短横线 slugify permalink',
	'base64': 'base64 编码 解码 文本编解码 base64 encode decode binary string',
	'url-parser': 'url 解析 查询参数 url编解码 query params encode decode hostname protocol path',
	'xml-formatter': 'xml 格式化 树形视图 美化 缩进 xml formatter pretty print indent',
	'css-formatter': 'css 格式化 样式美化 压缩 展开 整理 css prettify minify beautifier',
	'html-formatter': 'html 格式化 网页代码美化 缩进 压缩 html beautifier indent format',
	'markdown-preview': 'markdown 渲染 markdown预览 实时渲染 实时预览 gfm 编辑器 排版 导出html 解析器 数学公式 latex 公式渲染 katex mathml markdown viewer editor preview compiler gfm table math formula latex',
	'password-generator': '密码 强密码 随机密码 密码生成器 字符熵 安全密码 password generator random crypto secure',
	'uuid-generator': 'uuid guid v4 v7 ulid nanoid 唯一标识符 随机uuid 时间戳uuid 可排序id 短id uuid generator random monotonic sortable short id',
	'random-number': '随机数 随机抽取 掷骰子 抽签 范围生成器 random number generator dice range lottery',
	'qr-code-generator': '二维码 qr code 生成 二维码制作 扫码 qr code generator barcode matrix 数字模式 大容量 长文本 wifi密码',
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
	'descriptive-statistics': '平均数 中位数 众数 统计 标准差 方差 线性回归 mean median average statistics variance',
	'hypothesis-testing': '假设检验 p值 t检验 z检验 显著性概率 显著性水平 检验统计量 置信区间 hypothesis testing p value t test z test confidence interval',
	'confidence-interval': '置信区间 均值置信区间 比例置信区间 总体均值 总体比例 区间估计 样本均值 边际误差 置信水平 t分布 z分布 confidence interval mean proportion margin of error sample mean',
	'anova-calculator': '方差分析 单因素方差分析 ANOVA F检验 组间方差 组内方差 显著性水平 p值 均方 自由度 one way anova f test mean square variance hypothesis',
	'normal-distribution': '正态分布 z score 高斯分布 概率密度 累积分布 68 95 99法则 分位数 normal distribution gaussian probability cdf z score',
	'prime-factorization': '质因数分解 质数 素数 分解质因数 prime factorization factors',
	'combinatorics': '排列组合 组合数 排列数 阶乘 combinations permutations factorial',
	'pi': '圆周率 pi π 祖冲之 密率 约率 弧度 面积 周长 梅钦公式 machin digits circle',
	'matrix': '矩阵 线性代数 行列式 逆矩阵 转置 矩阵乘法 特征值 特征向量 trace det matrix inverse transpose eigenvalues eigenvectors linear algebra',
	'equation-solver': '方程求解 一元二次方程 一元三次方程 方程组 微积分 导数 定积分 极限 常微分方程 抛物线顶点 quadratic cubic calculus derivative integral limit ode differential equation solver vertex',
	'complex-number': '复数 复数计算器 复平面 实部 虚部 极坐标 欧拉公式 模长 幅角 共轭 复指数 complex number polar rectangular euler conjugate argument magnitude',
	'vector': '向量 矢量 向量计算器 点积 数量积 叉积 向量积 模长 夹角 投影 单位向量 vector 2d 3d dot product cross product projection magnitude angle',
	'number-base-converter': '进制转换 二进制 十六进制 base converter binary hex radix',
	'unix-timestamp': '时间戳 unix时间戳 时间转换 timestamp unix epoch',
	'cron-expression-parser': 'cron 定时任务 cron表达式 crontab schedule parser spring quartz 六段 七段 秒级 年字段 下次执行 下次触发 执行时间 时区 UTC next run next fire',
	'regex-tester': '正则表达式 正则测试 regex tester pattern match',
	'css-px-rem-converter': 'px rem 换算 像素 css px rem converter',
	'text-diff': '文本对比 diff text diff compare',
	'hash-generator': '哈希 散列 sha256 md5 sha1 sha224 sha384 sha512 sha3 hash generator checksum 文件哈希 hmac 摘要 file digest',
	'curl-to-code': 'curl 代码转换 代码生成 请求转换 fetch axios python requests go rust php curl code converter API',
	'cidr-calculator': 'cidr 子网掩码 ip计算器 广播地址 网络地址 可用主机 ip范围 subnet netmask wildcard broadcast usable hosts',
	'js-formatter': 'js 格式化 ts 格式化 javascript typescript 美化 压缩 单行 minify js prettify ts beautifier',
	'graphql-formatter': 'graphql 格式化 graphql query mutation sdl schema 美化 压缩 graphql format query beautify',
	'markdown-table-formatter': 'markdown 表格 对齐 格式化 md表格 markdown table formatter align beautify gfm',
	'standard': '科学计算器 计算器 算术函数 根号 三角函数 次方 scientific calculator standard math sqrt sin cos',
	'graph': '函数图像 曲线绘制 坐标系 绘图 函数可视化 function grapher plotting curves calculus',
	'graph3d': '三维函数 空间曲面 3D曲面 3d surface plotter mesh',
	'age-calculator': '年龄计算 年龄计算器 周岁 虚岁 实际年龄 出生多少天 生日倒计时 age calculator date of birth how old',
	'date-calculator': '日期计算 日期计算器 日期间隔 日期差 两个日期相差多少天 工作日计算 日期加减 几月几号 date calculator days between date add subtract business days',
	'bmi-calculator': 'bmi 身体质量指数 bmi计算器 体重指数 基础代谢率 bmr 每日热量 tdee 减肥热量 增肌热量 卡路里计算 bmi calculator calorie bmr tdee',
	'case-converter': '大小写转换 命名风格 驼峰转换 下划线转换 case converter camelcase snake_case kebab pascal 帕斯卡 变量命名 标识符转换',
	'cny-uppercase': '人民币大写 金额大写 大写金额 转大写 发票大写 银行大写 壹贰叁 人民币转大写 chinese yuan uppercase amount rmb 数字转大写',
	'roman-numeral': '罗马数字 罗马数字转换 罗马数字对照 roman numeral converter 罗马数字翻译',
	'html-entity-escaper': 'html实体 转义 反转义 html entity escape unescape &amp 字符实体 编码解码',
	'csv-json-converter': 'csv转json json转csv 表格转换 csv to json json to csv 数据转换 excel导出',
	'yaml-formatter': 'yaml 格式化 yaml校验 yaml转json json转yaml yml 格式化 validator parser prettify 配置文件 kubernetes',
	'toml-formatter': 'toml 格式化 toml校验 toml转json json转toml cargo.toml pyproject.toml rust python 配置文件 toml format validate',
	'json-to-typescript': 'json转ts json转typescript typescript 接口生成 interface 类型定义 代码生成 json to typescript interface types codegen',
	'xml-json-converter': 'xml转json json转xml xml json 互转 报文解析 xml json convert',
	'env-json-converter': 'env 环境变量 dotenv .env转json json转env 配置互转 environment variables',
	'fuel': '油耗换算 百公里油耗 l/100km mpg 每公里油耗 燃油消耗 fuel consumption converter miles per gallon',
	'angle': '角度换算 弧度 度 角度转弧度 deg rad gradian turn arcminute angle converter 角分 角秒',
};

export interface SearchItem {
	slug: string;
	category: ToolCategory;
	name: string;
	nameZh?: string;
	description: string;
	descriptionZh?: string;
	href: string;
	keywords: string;
}

export function getAllSearchItems(): SearchItem[] {
	return REAL_TOOLS.map((e) => ({
		slug: e.slug,
		category: e.category,
		name: e.name,
		nameZh: e.nameZh || '',
		description: e.description,
		descriptionZh: e.descriptionZh || '',
		href: `/${e.category}/${e.slug}/`,
		keywords: TOOL_KEYWORDS[e.slug] || '',
	}));
}

