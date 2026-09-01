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
		description: 'Live word, character, sentence and paragraph counts plus reading time.',
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
		description: 'Count characters, letters, digits, spaces, symbols and UTF-8 bytes.',
		kind: 'text',
		config: {
			placeholder: 'Type or paste text…',
			stats: charStats,
		} satisfies TextConfig,
	},
	{
		slug: 'json-formatter',
		category: 'tools',
		name: 'JSON Formatter',
		description: 'Format and minify JSON with exact error positions, fully in your browser.',
		kind: 'text',
		config: {
			placeholder: '{"paste": "JSON here"}',
			mono: true,
			transforms: [
				{ id: 'format', label: 'Format', run: (t) => formatJson(t, 2) },
				{ id: 'minify', label: 'Minify', run: (t) => formatJson(t, 0) },
			],
		} satisfies TextConfig,
	},
	{
		slug: 'base64',
		category: 'tools',
		name: 'Base64 Encoder / Decoder',
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
	},
];
