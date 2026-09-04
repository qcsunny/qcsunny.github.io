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
	| 'html';

export interface ToolMeta {
	slug: string;
	category: ToolCategory;
	name: string;
	nameZh?: string;
	description: string;
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

/** Static feature pages listed on the calculators index (real routes live in src/pages/calculators/). */
export const CALCULATOR_FEATURED: (ToolMeta & { content?: ToolContent })[] = [
	{
		slug: 'standard',
		category: 'calculators',
		name: 'Scientific Calculator',
		nameZh: '科学计算器',
		description: 'Standard and scientific calculator with variables, history and DEG/RAD modes.',
	},
	{
		slug: 'graph',
		category: 'calculators',
		name: 'Function Grapher',
		nameZh: '函数图像绘制器',
		description: 'Plot up to 4 functions with zoom, pan and a live value crosshair.',
	},
];

export function categoryLabel(id: ToolCategory): string {
	return CATEGORIES.find((c) => c.id === id)?.label ?? id;
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
