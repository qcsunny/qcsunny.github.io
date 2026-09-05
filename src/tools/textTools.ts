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
	},
	{
		slug: 'json-formatter',
		category: 'tools',
		name: 'JSON Formatter & Validator',
		nameZh: 'JSON 格式化与校验工具',
		description: 'Format, validate, minify, escape, and inspect JSON with exact error positions, one-click copy, and file download.',
		descriptionZh: '格式化、校验、压缩与转义 JSON，精准定位语法错误行号与列号。',
		kind: 'json',
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
	},
	{
		slug: 'sql-formatter',
		category: 'tools',
		name: 'SQL Formatter & Beautifier',
		nameZh: 'SQL 格式化与美化工具',
		description: 'Format, beautify, indent, and minify SQL queries with keyword auto-capitalization and 100% browser-side privacy.',
		descriptionZh: 'SQL 查询格式化美化与压缩工具，支持关键字自动大写与本地隐私安全。',
		kind: 'sql',
	},
	{
		slug: 'jwt-decoder',
		category: 'tools',
		name: 'JWT Decoder & Formatter',
		nameZh: 'JWT 令牌解码与格式化',
		description: 'Decode JSON Web Tokens (JWT) into Header and Payload, inspect expiration timestamps, and verify claims safely with zero data upload.',
		descriptionZh: '解析 JWT 令牌 Header 与 Payload，快速检验过期时间与 Claims 字段。',
		kind: 'jwt',
	},
	{
		slug: 'url-parser',
		category: 'tools',
		name: 'URL Parser & Query Formatter',
		nameZh: 'URL 网址与参数格式化',
		description: 'Parse URLs into protocol, hostname, path, and query strings. Decode, sort params, remove tracking tags, and export to JSON.',
		descriptionZh: '解析 URL 协议、域名、路径与参数，支持参数排序与去除营销追踪参数。',
		kind: 'url',
	},
	{
		slug: 'xml-formatter',
		category: 'tools',
		name: 'XML / SVG Formatter & Validator',
		nameZh: 'XML / SVG 格式化与校验工具',
		description: 'Validate XML syntax, format with customizable 2/4-space indentation, and minify XML/SVG documents in your browser.',
		descriptionZh: 'XML 与 SVG 矢量代码格式化、层级缩进与语法校验工具。',
		kind: 'xml',
	},
	{
		slug: 'css-formatter',
		category: 'tools',
		name: 'CSS Formatter & Minifier',
		nameZh: 'CSS 格式化与压缩工具',
		description: 'Beautify CSS stylesheets with clean rules and property indentation, or minify CSS to a single line for production performance.',
		descriptionZh: 'CSS 样式表格式化排版与单行 Minify 压缩工具。',
		kind: 'css',
	},
	{
		slug: 'html-formatter',
		category: 'tools',
		name: 'HTML Formatter & Minifier',
		nameZh: 'HTML 格式化与压缩工具',
		description: 'Format messy HTML with proper indentation and self-closing element awareness, or minify HTML to optimize web page delivery.',
		descriptionZh: 'HTML 网页代码规范缩进排版与单行 Minify 压缩工具。',
		kind: 'html',
	},
	{
		slug: 'markdown-preview',
		category: 'tools',
		name: 'Markdown Live Editor & Previewer',
		nameZh: 'Markdown 实时渲染与预览编辑器',
		description: 'Live split-screen Markdown rendering with GitHub Flavored Markdown (GFM), tables, task lists, code syntax, KaTeX-typeset maths, and HTML export.',
		descriptionZh: '纯本地双栏实时 Markdown 渲染编辑器，支持 GFM 全语法、LaTeX 公式排版与 HTML 导出。',
		kind: 'markdown',
	},
];

