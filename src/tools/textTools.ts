// Registry entries for /tools/* (text utilities + generators + QR + color).
// Password/UUID/random share the 'generator' kind with dedicated renderers in
// src/scripts/tools/generators.ts; color and QR have their own modules.

import type { TextConfig, ToolEntry } from './registry';

// --- word counter ---------------------------------------------------------------------

const WORD_RE = /[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu;

function wordStats(text: string) {
	const words = text.match(WORD_RE) ?? [];
	const sentences = (text.match(/[^.!?…]+[.!?…]+(\s|$)/g) ?? []).length || (text.trim() ? 1 : 0);
	const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim()).length;
	const lines = text ? text.split('\n').length : 0;
	const letters = [...text].length;
	const avgLen = words.length
		? words.reduce((sum, w) => sum + [...w].length, 0) / words.length
		: 0;
	// ~220 words per minute
	const minutes = words.length / 220;
	return [
		{ label: 'Words', value: String(words.length) },
		{ label: 'Characters', value: String(letters) },
		{ label: 'Characters (no spaces)', value: String(text.replace(/\s/g, '').length) },
		{ label: 'Sentences', value: String(sentences) },
		{ label: 'Paragraphs', value: String(paragraphs) },
		{ label: 'Lines', value: String(lines) },
		{ label: 'Avg. word length', value: avgLen ? avgLen.toFixed(2) : '0' },
		{
			label: 'Reading time',
			value: minutes < 1 ? '< 1 min' : `${Math.round(minutes)} min`,
		},
	];
}

// --- character counter ------------------------------------------------------------------

function charStats(text: string) {
	let letters = 0;
	let digits = 0;
	let spaces = 0;
	let symbols = 0;
	for (const ch of text) {
		if (/\s/.test(ch)) spaces++;
		else if (/\p{L}/u.test(ch)) letters++;
		else if (/\p{N}/u.test(ch)) digits++;
		else symbols++;
	}
	return [
		{ label: 'Characters', value: String([...text].length) },
		{ label: 'Characters (no spaces)', value: String([...text.replace(/\s/g, '')].length) },
		{ label: 'Words', value: String((text.match(WORD_RE) ?? []).length) },
		{ label: 'Letters', value: String(letters) },
		{ label: 'Digits', value: String(digits) },
		{ label: 'Spaces & line breaks', value: String(spaces) },
		{ label: 'Symbols & punctuation', value: String(symbols) },
		{ label: 'Bytes (UTF-8)', value: String(new TextEncoder().encode(text).length) },
	];
}

// --- json formatter -----------------------------------------------------------------------

/** Structural JSON scan returning the byte offset of the first error, so the
 *  message can name an exact line/column (V8's message embeds a snippet, not
 *  a position, in browsers). */
function scanJson(text: string): { message: string; pos: number } | null {
	const n = text.length;
	let i = 0;
	const fail = (msg: string): { message: string; pos: number } => ({ message: msg, pos: i });
	const skipWs = (): void => {
		while (i < n && /\s/.test(text[i]!)) i++;
	};
	function parseString(): { message: string; pos: number } | null {
		i++; // opening quote
		while (i < n) {
			const c = text[i]!;
			if (c === '"') {
				i++;
				return null;
			}
			if (c === '\\') {
				const e = text[i + 1];
				if (!e || !'bfnrtu\\/"'.includes(e)) return fail('Invalid escape sequence');
				if (e === 'u') {
					for (let k = 2; k <= 5; k++) {
						if (!/[0-9a-fA-F]/.test(text[i + k] ?? '')) return fail('Invalid \\u escape');
					}
					i += 4;
				}
				i += 2;
				continue;
			}
			if (c < ' ' && c !== '\t') return fail('Control character in string');
			i++;
		}
		return fail('Unterminated string');
	}
	function parseNumber(): { message: string; pos: number } | null {
		if (text[i] === '-') i++;
		if (text[i] === '0') i++;
		else if (/[1-9]/.test(text[i] ?? '')) {
			while (/[0-9]/.test(text[i] ?? '')) i++;
		} else return fail('Invalid number');
		if (text[i] === '.') {
			i++;
			if (!/[0-9]/.test(text[i] ?? '')) return fail('Invalid number');
			while (/[0-9]/.test(text[i] ?? '')) i++;
		}
		if (text[i] === 'e' || text[i] === 'E') {
			i++;
			if (text[i] === '+' || text[i] === '-') i++;
			if (!/[0-9]/.test(text[i] ?? '')) return fail('Invalid number');
			while (/[0-9]/.test(text[i] ?? '')) i++;
		}
		return null;
	}
	function parseValue(): { message: string; pos: number } | null {
		skipWs();
		if (i >= n) return fail('Unexpected end of input');
		const c = text[i]!;
		if (c === '{') {
			i++;
			skipWs();
			if (text[i] === '}') {
				i++;
				return null;
			}
			for (;;) {
				skipWs();
				if (text[i] !== '"') return fail('Expected object key in quotes');
				let e = parseString();
				if (e) return e;
				skipWs();
				if (text[i] !== ':') return fail("Expected ':' after key");
				i++;
				e = parseValue();
				if (e) return e;
				skipWs();
				if (text[i] === ',') {
					i++;
					continue;
				}
				if (text[i] === '}') {
					i++;
					return null;
				}
				return fail("Expected ',' or '}'");
			}
		}
		if (c === '[') {
			i++;
			skipWs();
			if (text[i] === ']') {
				i++;
				return null;
			}
			for (;;) {
				const e = parseValue();
				if (e) return e;
				skipWs();
				if (text[i] === ',') {
					i++;
					continue;
				}
				if (text[i] === ']') {
					i++;
					return null;
				}
				return fail("Expected ',' or ']'");
			}
		}
		if (c === '"') return parseString();
		if (c === '-' || (c >= '0' && c <= '9')) return parseNumber();
		for (const lit of ['true', 'false', 'null']) {
			if (text.startsWith(lit, i)) {
				i += lit.length;
				return null;
			}
		}
		return fail('Unexpected token');
	}
	const err = parseValue();
	if (err) return err;
	skipWs();
	if (i < n) return fail('Unexpected trailing content');
	return null;
}

function jsonPosition(text: string): { message: string; pos: number } | null {
	return scanJson(text);
}

function posToLineCol(text: string, pos: number): string {
	const before = text.slice(0, pos);
	const line = before.split('\n').length;
	const col = pos - before.lastIndexOf('\n');
	return ` at line ${line}, column ${col}`;
}

function formatJson(text: string, space: number) {
	const trimmed = text.trim();
	if (!trimmed) return { output: '', error: 'Enter JSON to format.' };
	// pre-scan for an exact error position, then parse for the message itself
	const scanErr = jsonPosition(trimmed);
	try {
		const value: unknown = JSON.parse(trimmed);
		return { output: JSON.stringify(value, null, space) };
	} catch (err) {
		const message = scanErr ? scanErr.message : err instanceof Error ? err.message : 'Invalid JSON';
		const where = scanErr ? posToLineCol(trimmed, scanErr.pos) : '';
		return { output: '', error: `Invalid JSON${where} — ${message}` };
	}
}

// --- base64 ---------------------------------------------------------------------------------

function b64encode(text: string): string {
	const bytes = new TextEncoder().encode(text);
	let bin = '';
	for (const b of bytes) bin += String.fromCharCode(b);
	// binary string → base64, chunked to avoid argument-length limits
	return btoa(bin).replace(/.{76}/g, '$&\n');
}

function b64decode(text: string): string {
	const clean = text.replace(/\s+/g, '');
	const bin = atob(clean);
	const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
	return new TextDecoder().decode(bytes);
}

function b64url(text: string): string {
	// URL-safe alphabet (RFC 4648 §5): no padding, -/ instead of +/
	return b64encode(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// --- entries -------------------------------------------------------------------------------

export const TEXT_TOOLS: ToolEntry[] = [
	{
		slug: 'word-counter',
		category: 'tools',
		name: 'Word Counter',
		nameZh: '在线字数统计',
		description: 'Live word, character, sentence and paragraph counts plus reading time.',
		kind: 'text',
		config: {
			placeholder: 'Type or paste text…',
			stats: wordStats,
		} satisfies TextConfig,

		content: {
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
	},
	{
		slug: 'character-counter',
		category: 'tools',
		name: 'Character Counter',
		nameZh: '字符计数器',
		description: 'Count characters, letters, digits, spaces, symbols and UTF-8 bytes.',
		kind: 'text',
		config: {
			placeholder: 'Type or paste text…',
			stats: charStats,
		} satisfies TextConfig,

		content: {
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
	},
	{
		slug: 'json-formatter',
		category: 'tools',
		name: 'JSON Formatter & Validator',
		nameZh: 'JSON 格式化与校验工具',
		description: 'Format, validate, minify, escape, and inspect JSON with exact error positions, one-click copy, and file download.',
		kind: 'json',

		content: {
			about: [
				'Format messy JSON with consistent indentation, minify it back to one line, and get exact error positions when something is broken — "line 3, column 14" instead of a vague parse failure.',
				'Formatting and validation happen entirely in your browser. The error scanner is a structural parser of its own, so it can pinpoint the first mistake in objects, arrays, strings, numbers and literals even when the browser\'s own message cannot.',
			],
			aboutZh: [
				'把杂乱的 JSON 排版成统一缩进、或压缩成一行，并在格式有错时给出精确位置——"第 3 行第 14 列"，而不是含糊的解析失败。',
				'格式化与校验完全在浏览器本地完成。错误扫描器是独立的结构解析器，即使浏览器自身的报错不含位置，它也能定位对象、数组、字符串、数字和字面量中的第一处错误。',
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
	},
	{
		slug: 'base64',
		category: 'tools',
		name: 'Base64 Encoder / Decoder',
		nameZh: 'Base64 编码解码',
		description: 'Encode text to Base64 or decode it back, with Unicode and URL-safe support.',
		kind: 'text',
		config: {
			placeholder: 'Text to encode, or Base64 to decode…',
			mono: true,
			transforms: [
				{
					id: 'encode',
					label: 'Encode → Base64',
					run: (t) => ({ output: t ? b64encode(t) : '', error: t ? undefined : 'Enter text first.' }),
				},
				{
					id: 'decode',
					label: 'Decode ← Base64',
					run: (t) => {
						if (!t.trim()) return { output: '', error: 'Enter Base64 first.' };
						try {
							return { output: b64decode(t) };
						} catch {
							return { output: '', error: 'Not valid Base64.' };
						}
					},
				},
				{
					id: 'urlsafe',
					label: 'Encode URL-safe',
					run: (t) => ({ output: t ? b64url(t) : '', error: t ? undefined : 'Enter text first.' }),
				},
			],
		} satisfies TextConfig,

		content: {
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
	},
];
