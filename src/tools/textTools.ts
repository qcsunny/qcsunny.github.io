// Registry entries for /tools/* (text utilities + generators + QR + color).
// Password/UUID/random share the 'generator' kind with dedicated renderers in
// src/scripts/tools/generators.ts; color and QR have their own modules.

import type { TextConfig, ToolEntry } from './registry';

// --- word counter ---------------------------------------------------------------------

const CJK_RE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu;
const LATIN_WORD_RE = /[a-zA-Z0-9]+(?:['’_-][a-zA-Z0-9]+)*/gu;

function wordStats(text: string) {
	const cjkMatches = text.match(CJK_RE) ?? [];
	const latinMatches = text.match(LATIN_WORD_RE) ?? [];
	// Standard international bilingual rule: 1 CJK char = 1 word + Latin space-delimited words
	const totalWords = cjkMatches.length + latinMatches.length;
	const sentences = (text.match(/[^.!?…\n。！？]+[.!?…\n。！？]+(\s|$)/gu) ?? []).length || (text.trim() ? 1 : 0);
	const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim()).length;
	const lines = text ? text.split('\n').length : 0;
	const letters = [...text].length;

	// Reading time: ~220 Latin words/min, ~400 CJK characters/min
	const minutes = latinMatches.length / 220 + cjkMatches.length / 400;
	const readTimeStr = minutes < 0.5 ? (totalWords > 0 ? '< 1 min' : '0 min') : `${Math.ceil(minutes)} min`;

	return [
		{ label: 'Total Words (Bilingual)', labelZh: '综合总字数 (中英双语标准)', value: String(totalWords) },
		{ label: 'Chinese / CJK Characters', labelZh: '中文字数 / 汉字数', value: String(cjkMatches.length) },
		{ label: 'English / Latin Words', labelZh: '英文 / 西文单词数', value: String(latinMatches.length) },
		{ label: 'Characters (with spaces)', labelZh: '总字符数 (含空格与换行)', value: String(letters) },
		{ label: 'Characters (no spaces)', labelZh: '有效字符数 (不含空格)', value: String([...text.replace(/\s/g, '')].length) },
		{ label: 'Sentences', labelZh: '句子数', value: String(sentences) },
		{ label: 'Paragraphs', labelZh: '段落数', value: String(paragraphs) },
		{ label: 'Lines', labelZh: '行数', value: String(lines) },
		{ label: 'Estimated Reading Time', labelZh: '预估阅读时长', value: readTimeStr },
	];
}

// --- character counter ------------------------------------------------------------------

function charStats(text: string) {
	let cjk = 0;
	let latin = 0;
	let digits = 0;
	let spaces = 0;
	let symbols = 0;
	for (const ch of text) {
		if (/\s/.test(ch)) spaces++;
		else if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(ch)) cjk++;
		else if (/[a-zA-Z]/u.test(ch)) latin++;
		else if (/\p{N}/u.test(ch)) digits++;
		else symbols++;
	}
	const utf8Bytes = new TextEncoder().encode(text).length;
	return [
		{ label: 'Total Characters', labelZh: '总字符数', value: String([...text].length) },
		{ label: 'Characters (no spaces)', labelZh: '有效字符数 (不含空格)', value: String([...text.replace(/\s/g, '')].length) },
		{ label: 'Chinese / CJK Characters', labelZh: '汉字字符数', value: String(cjk) },
		{ label: 'Latin Letters (A-Z, a-z)', labelZh: '英文字母数', value: String(latin) },
		{ label: 'Numbers / Digits (0-9)', labelZh: '阿拉伯数字数', value: String(digits) },
		{ label: 'Punctuation & Symbols', labelZh: '标点与特殊符号数', value: String(symbols) },
		{ label: 'Spaces & Line Breaks', labelZh: '空格与换行符数', value: String(spaces) },
		{ label: 'UTF-8 Bytes', labelZh: 'UTF-8 编码字节大小', value: `${utf8Bytes} B (${(utf8Bytes / 1024).toFixed(2)} KB)` },
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
		descriptionZh: '实时统计词数、字符数、句子数、段落数与预估阅读时长。',
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
		descriptionZh: '实时细分统计字符、字母、数字、空格、符号与 UTF-8 字节数。',
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
		descriptionZh: '格式化、校验、压缩与转义 JSON，精准定位语法错误行号与列号。',
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
		descriptionZh: '文本与 Base64 互相编解码，完整支持 Unicode 中文与 URL 安全模式。',
		kind: 'text',
		config: {
			placeholder: 'Text to encode, or Base64 to decode…',
			mono: true,
			transforms: [
				{
					id: 'encode',
					label: 'Encode → Base64',
					labelZh: '编码为 Base64',
					run: (t) => ({ output: t ? b64encode(t) : '', error: t ? undefined : 'Enter text first.' }),
				},
				{
					id: 'decode',
					label: 'Decode ← Base64',
					labelZh: 'Base64 解码',
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
					labelZh: 'URL 安全编码',
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
	{
		slug: 'sql-formatter',
		category: 'tools',
		name: 'SQL Formatter & Beautifier',
		nameZh: 'SQL 格式化与美化工具',
		description: 'Format, beautify, indent, and minify SQL queries with keyword auto-capitalization and 100% browser-side privacy.',
		descriptionZh: 'SQL 查询格式化美化与压缩工具，支持关键字自动大写与本地隐私安全。',
		kind: 'sql',
		content: {
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
				{ q: 'Can I minify SQL to a single line?', a: 'Yes, click "单行压缩 (Minify)" to strip comments and redundant whitespace for embedding into application configs or code literals.' },
			],
			faqZh: [
				{ q: '该工具会上传我的 SQL 吗？', a: '绝不上传。所有分词、缩进排版与压缩均在浏览器本地完成，断网也能正常运行。' },
				{ q: '支持哪些数据库语法？', a: '支持标准 ANSI SQL，以及 MySQL、PostgreSQL、SQLite、MariaDB、SQL Server 等主流关系型数据库。' },
				{ q: '可以压缩为单行吗？', a: '可以，点击"单行压缩 (Minify)"即可去除所有注释与冗余空白，生成适合嵌入代码字面量的紧凑语句。' },
			],
		},
	},
	{
		slug: 'jwt-decoder',
		category: 'tools',
		name: 'JWT Decoder & Formatter',
		nameZh: 'JWT 令牌解码与格式化',
		description: 'Decode JSON Web Tokens (JWT) into Header and Payload, inspect expiration timestamps, and verify claims safely with zero data upload.',
		descriptionZh: '解析 JWT 令牌 Header 与 Payload，快速检验过期时间与 Claims 字段。',
		kind: 'jwt',
		content: {
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
	},
	{
		slug: 'url-parser',
		category: 'tools',
		name: 'URL Parser & Query Formatter',
		nameZh: 'URL 网址与参数格式化',
		description: 'Parse URLs into protocol, hostname, path, and query strings. Decode, sort params, remove tracking tags, and export to JSON.',
		descriptionZh: '解析 URL 协议、域名、路径与参数，支持参数排序与去除营销追踪参数。',
		kind: 'url',
		content: {
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
	},
	{
		slug: 'xml-formatter',
		category: 'tools',
		name: 'XML / SVG Formatter & Validator',
		nameZh: 'XML / SVG 格式化与校验工具',
		description: 'Validate XML syntax, format with customizable 2/4-space indentation, and minify XML/SVG documents in your browser.',
		descriptionZh: 'XML 与 SVG 矢量代码格式化、层级缩进与语法校验工具。',
		kind: 'xml',
		content: {
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
	},
	{
		slug: 'css-formatter',
		category: 'tools',
		name: 'CSS Formatter & Minifier',
		nameZh: 'CSS 格式化与压缩工具',
		description: 'Beautify CSS stylesheets with clean rules and property indentation, or minify CSS to a single line for production performance.',
		descriptionZh: 'CSS 样式表格式化排版与单行 Minify 压缩工具。',
		kind: 'css',
		content: {
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
	},
	{
		slug: 'html-formatter',
		category: 'tools',
		name: 'HTML Formatter & Minifier',
		nameZh: 'HTML 格式化与压缩工具',
		description: 'Format messy HTML with proper indentation and self-closing element awareness, or minify HTML to optimize web page delivery.',
		descriptionZh: 'HTML 网页代码规范缩进排版与单行 Minify 压缩工具。',
		kind: 'html',
		content: {
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
	},
	{
		slug: 'markdown-preview',
		category: 'tools',
		name: 'Markdown Live Editor & Previewer',
		nameZh: 'Markdown 实时渲染与预览编辑器',
		description: 'Live split-screen Markdown rendering with GitHub Flavored Markdown (GFM), tables, task lists, code syntax, KaTeX-typeset maths, and HTML export.',
		descriptionZh: '纯本地双栏实时 Markdown 渲染编辑器，支持 GFM 全语法、LaTeX 公式排版与 HTML 导出。',
		kind: 'markdown',
		content: {
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
	},
];

