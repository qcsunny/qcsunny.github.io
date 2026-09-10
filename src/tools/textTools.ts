// Registry entries for /devtools/* (text utilities + generators + QR + color).
// Password/UUID/random share the 'generator' kind with dedicated renderers in
// src/scripts/tools/generators.ts; color and QR have their own modules.
//
// The array below is grouped by the job the visitor came to do, highest-traffic
// group first: code/document formatters (plus the Markdown editor, the other
// "I'm writing code" tool), then the codecs and token decoders, then the small
// text counters. This list is the display order on /devtools/, on the search
// modal and on every page's related-tools strip — the search modal has no
// relevance score, it substring-filters and keeps index position, so the
// declaration order *is* the ranking.

import type { TextConfig, ToolEntry } from './registry';
import { HTTP_STATUSES } from './httpStatus';
import { MIME_MAP } from './mimeTypes';
import { parseUa } from './useragent';
import { PORTS } from './ports';

/** YAML transforms share the same bilingual error shape: the parser throws
 *  Error("line N: message"), which we surface verbatim in both views. */
function errToEn(e: unknown): string {
	return `— (${e instanceof Error ? e.message : 'invalid YAML'})`;
}
function errToZh(e: unknown): string {
	return `—（${e instanceof Error ? e.message : 'YAML 无效'}）`;
}

/** Batch engine for the per-line tools (base64, cidr, hash, case…): run f on
 *  every non-empty line, one result per line as "input → output". A line that
 *  throws (or returns null) is marked ✗ WITHOUT aborting the batch — the whole
 *  point of batch mode is that one bad row must not cost you the other 200. */
function runBatch(text: string, f: (line: string) => string | null): { output: string; error?: string; errorZh?: string } {
	const lines = text
		.split('\n')
		.map((l) => l.trim())
		.filter((l) => l.length > 0);
	if (!lines.length) return { output: '', error: 'Enter at least one line.', errorZh: '请至少输入一行内容。' };
	const out = lines.map((line) => {
		try {
			const r = f(line);
			return r === null ? `${line} → ✗` : `${line} → ${r}`;
		} catch {
			return `${line} → ✗`;
		}
	});
	return { output: out.join('\n') };
}

// --- text extractor / slug helpers -----------------------------------------------------

/** URLs: absolute http(s) links and www.-prefixed hosts, up to the first
 *  whitespace or closing bracket/quote. Bare domains ("example.com" without a
 *  scheme) are deliberately NOT matched — filenames and version strings
 *  ("utils-1.2.3.js") false-positive far too often. */
const URL_RE_G = /(?:https?:\/\/|www\.)[^\s<>"'）)\]}]+/giu;
const EMAIL_RE_G = /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+/giu;

function extractMatches(text: string, re: RegExp, what: 'URL' | 'Email'): { output: string; error?: string; errorZh?: string } {
	const found = text.match(re) ?? [];
	if (!found.length)
		return { output: '', error: `No ${what.toLowerCase()}s found in the text.`, errorZh: `文本中没有找到${what === 'URL' ? '网址' : '邮箱'}。` };
	return { output: found.join('\n') };
}

/** Title → URL slug: lowercase, fold diacritics (café → cafe), keep letters /
 *  digits / CJK, collapse every other run into ONE separator, trim separators.
 *  CJK characters survive as-is — browsers percent-encode them on copy, and
 *  stripping them would empty a purely Chinese title. */
function slugify(text: string, sep: string): string {
	const s = text
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9㐀-鿿぀-ヿ가-힯]+/gu, sep);
	// split + filter both trims the ends and collapses runs of the separator.
	return s.split(sep).filter(Boolean).join(sep);
}

// --- json diff --------------------------------------------------------------------------

type JsonDiff = { path: string; kind: 'added' | 'removed' | 'changed'; a: string; b: string };

/** Deep structural comparison of two parsed JSON values; arrays compare by
 *  index (a reordering is a row of changes, which is honest for data files).
 *  Returns at most `cap` entries so a wildly different pair cannot produce a
 *  10k-row report. */
function jsonDiff(a: unknown, b: unknown, path = '$', out: JsonDiff[] = [], cap = 200): JsonDiff[] {
	if (out.length >= cap) return out;
	const show = (v: unknown): string => {
		const s = JSON.stringify(v);
		return s === undefined ? 'undefined' : s.length > 80 ? s.slice(0, 77) + '…' : s;
	};
	if (Array.isArray(a) && Array.isArray(b)) {
		const n = Math.max(a.length, b.length);
		for (let i = 0; i < n && out.length < cap; i++) {
			if (i >= b.length) out.push({ path: `${path}[${i}]`, kind: 'removed', a: show(a[i]), b: '' });
			else if (i >= a.length) out.push({ path: `${path}[${i}]`, kind: 'added', a: '', b: show(b[i]) });
			else jsonDiff(a[i], b[i], `${path}[${i}]`, out, cap);
		}
	} else if (a && b && typeof a === 'object' && typeof b === 'object') {
		const keys = [...new Set([...Object.keys(a as object), ...Object.keys(b as object)])].sort();
		for (const k of keys) {
			if (out.length >= cap) break;
			const key = /^\w+$/.test(k) ? `.${k}` : `[${JSON.stringify(k)}]`;
			const av = (a as Record<string, unknown>)[k];
			const bv = (b as Record<string, unknown>)[k];
			if (!(k in (a as object))) out.push({ path: path + key, kind: 'added', a: '', b: show(bv) });
			else if (!(k in (b as object))) out.push({ path: path + key, kind: 'removed', a: show(av), b: '' });
			else jsonDiff(av, bv, path + key, out, cap);
		}
	} else if (a !== b) {
		// type-changing or value-changing: 1 !== "1" is a change, not noise
		out.push({ path, kind: 'changed', a: show(a), b: show(b) });
	}
	return out;
}

// --- web/seo batch helpers ----------------------------------------------------------------

/** Match status codes by number or keyword across name/meaning/cause. */
function matchStatuses(text: string) {
	const q = text.trim().toLowerCase();
	if (!q) return [];
	if (/^\d{3}$/.test(q)) return HTTP_STATUSES.filter((e) => String(e.code) === q);
	if (/^\d+$/.test(q)) return HTTP_STATUSES.filter((e) => String(e.code).startsWith(q));
	const hits = HTTP_STATUSES.filter((e) => `${e.name} ${e.nameZh} ${e.meaning} ${e.meaningZh} ${e.cause} ${e.causeZh}`.toLowerCase().includes(q));
	return hits;
}

/** Match ports by number, prefix, or service keyword. */
function matchPorts(text: string) {
	const q = text.trim().toLowerCase();
	if (!q) return [];
	if (/^\d+$/.test(q)) return PORTS.filter((p) => String(p.port) === q);
	const hits = PORTS.filter((p) => p.port.toString().startsWith(q) || `${p.service} ${p.serviceZh}`.toLowerCase().includes(q));
	return hits;
}

function matchMime(text: string) {
	const q = text.trim().toLowerCase().replace(/^\./, '');
	if (!q) return [];
	if (q.includes('/')) return MIME_MAP.filter((m) => m.mime === q);
	return MIME_MAP.filter((m) => m.ext === q);
}

function noMime(t: string): { output: string; error: string; errorZh: string } {
	return {
		output: '',
		error: `No MIME entry matches "${t.trim().slice(0, 40)}" — try ".pdf", "font/woff2", or an extension without the dot.`,
		errorZh: `没有匹配 "${t.trim().slice(0, 40)}" 的条目——试试 ".pdf"、"font/woff2"，或不带点的扩展名。`,
	};
}

/** robots DSL → canonical robots.txt. Lines: user-agent / disallow / allow /
 *  sitemap / crawl-delay / blank (new group). Everything else is an error. */
function robotsFromDsl(text: string): { output: string; errors: string[] } {
	const lines: string[] = [];
	const errors: string[] = [];
	for (const raw of text.split('\n')) {
		const t = raw.trim();
		if (!t) {
			if (lines.length && lines[lines.length - 1] !== '') lines.push('');
			continue;
		}
		const m = /^([a-z-]+)\s*:\s*(.*)$/i.exec(t);
		if (!m) {
			errors.push(`✗ Cannot parse: "${t.slice(0, 50)}" — every line must be "directive: value".`, `✗ 无法解析："${t.slice(0, 50)}"——每行必须是 "指令: 值"。`);
			break;
		}
		const [, directive, value] = m;
		const d = directive.toLowerCase();
		if (!['user-agent', 'disallow', 'allow', 'sitemap', 'crawl-delay'].includes(d)) {
			errors.push(`✗ Unknown directive "${d}" — allowed: user-agent, disallow, allow, sitemap, crawl-delay.`, `✗ 未知指令 "${d}"——可用：user-agent、disallow、allow、sitemap、crawl-delay。`);
			break;
		}
		if (d === 'crawl-delay') lines.push(`Crawl-delay: ${value}`);
		else lines.push(`${d.charAt(0).toUpperCase() + d.slice(1)}: ${value}`);
	}
	if (errors.length) return { output: '', errors };
	while (lines.length && lines[lines.length - 1] === '') lines.pop();
	return { output: lines.join('\n') + '\n', errors: [] };
}

function lintRobots(text: string): string[] {
	const problems: string[] = [];
	const lines = text.split('\n');
	let sawDirective = false;
	let groupHasAgent = false;
	for (const raw of lines) {
		const t = raw.trim();
		if (!t || t.startsWith('#')) continue;
		const m = /^([a-zA-Z-]+)\s*:\s*(.*)$/.exec(t);
		if (!m) {
			problems.push(`✗ Unparseable line 无法解析: "${t.slice(0, 60)}"`);
			continue;
		}
		const d = m[1]!.toLowerCase();
		const v = m[2] ?? '';
		sawDirective = true;
		if (!['user-agent', 'disallow', 'allow', 'sitemap', 'crawl-delay'].includes(d)) {
			problems.push(`✗ Unknown directive 未知指令: "${d}" ${d === 'disalow' || d === 'dissallow' ? '(typo for disallow? 拼写错误？)' : ''}`);
			continue;
		}
		if (d === 'user-agent') groupHasAgent = true;
		if ((d === 'disallow' || d === 'allow') && !groupHasAgent)
			problems.push(`✗ "${t.slice(0, 40)}" comes before any User-agent — it applies to nothing. 该行出现在任何 User-agent 之前，不会生效。`);
		if (d === 'sitemap' && !/^https?:\/\//.test(v))
			problems.push(`✗ Sitemap should be an absolute URL sitemap 应为绝对 URL: "${v.slice(0, 60)}"`);
	}
	if (!problems.length && !sawDirective) problems.push('✗ No directives found 没有找到任何指令。');
	if (!/sitemap\s*:/i.test(text) && !problems.length)
		problems.push('⚠ No Sitemap line — adding one helps crawlers discover everything. 缺少 Sitemap 行——补上有利于收录。');
	return problems;
}

function escXml(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function humanCount(n: number): string {
	return n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`;
}

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
		else if (/\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}/u.test(ch)) cjk++;
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
	return b64encode(text).replace(/\s+/g, '').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// --- entries -------------------------------------------------------------------------------


// --- number base converter (devtools) -------------------------------------------------

const BASE_CHARS: Record<number, string> = {
	2: '01',
	8: '01234567',
	10: '0123456789',
	16: '0123456789abcdef',
};

/** Parse a string of digits in `base` into a BigInt, honouring a leading '-'. */
function parseBigInt(value: string, base: number): bigint | null {
	const t = value.trim();
	if (!t) return null;
	const sign = t.startsWith('-') ? -1n : 1n;
	const body = (t.startsWith('-') || t.startsWith('+') ? t.slice(1) : t).toLowerCase();
	if (!body) return null;
	const chars = BASE_CHARS[base];
	if (!chars) return null;
	let out = 0n;
	for (const ch of body) {
		const idx = chars.indexOf(ch);
		if (idx === -1) return null;
		out = out * BigInt(base) + BigInt(idx);
	}
	return sign * out;
}

/** Render a non-negative BigInt in a base without using Number (no precision loss). */
function bigToBase(n: bigint, base: number): string {
	if (n === 0n) return '0';
	const chars = BASE_CHARS[base];
	let out = '';
	let x = n < 0n ? -n : n;
	while (x > 0n) {
		out = chars[Number(x % BigInt(base))] + out;
		x /= BigInt(base);
	}
	return out;
}

// --- Unix timestamp converter (devtools) ---------------------------------------------

/** Deterministic formatting for the compute scan (Node has no browser locale data
 *  differences worth depending on here). */
function stamp(ms: number, tz: string, zh: boolean): string {
	const d = new Date(ms);
	if (zh)
		return d.toLocaleString('zh-CN', {
			timeZone: tz,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
			hour12: false,
		});
	return d.toLocaleString('en-US', {
		timeZone: tz,
		year: 'numeric',
		month: 'long',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
	});
}

// --- cron expression parser (devtools) ------------------------------------------------

/** Collapse a value list back into compact cron tokens ('0-5,10,15'). */
function compactCron(vals: number[], full: boolean): string {
	if (full) return '*';
	const runs: string[] = [];
	let i = 0;
	while (i < vals.length) {
		let j = i;
		while (j + 1 < vals.length && vals[j + 1] === vals[j] + 1) j++;
		runs.push(j === i ? String(vals[i]) : `${vals[i]}-${vals[j]}`);
		i = j + 1;
	}
	return runs.join(',');
}

// --- cron dialects --------------------------------------------------------------------
// Linux 5-field: minute hour day month weekday
// Spring/Quartz 6-field: second minute hour day month weekday
// Quartz 7-field: second minute hour day month weekday year
type CronDialect = 'linux' | 'spring-quartz' | 'quartz-7';

interface ParsedField {
	mask: bigint;
	vals: number[];
	full: boolean;
	ignore: boolean;
}

interface ParsedCron {
	sec?: ParsedField;
	min: ParsedField;
	hour: ParsedField;
	dom: ParsedField;
	mon: ParsedField;
	dow: ParsedField;
	year?: ParsedField;
}

interface CronError {
	error: string;
	errorZh: string;
}

/** Type guard: parseCron's mk() returns ParsedField on success, CronError on
 *  failure; the guard narrows the field results so no `as` casts are needed. */
function isCronError(x: ParsedField | ParsedCron | CronError): x is CronError {
	return 'error' in x;
}

// The zh labels stay free of Latin product names. compute() rows are guarded
// with a zero-tolerance /[A-Za-z]{3,}/ (e2e/i18n.spec.ts) — unlike the registry
// fields, which tolerate an annotation under PROSE_MAX_CJK_SHARE — because a
// short row cannot carry a share test: in "—（Quartz 要求…）" the name is 30% of
// the line. Descriptive names say the same thing without the Latin.
const DIALECT_FIELDS: Record<CronDialect, { count: number; hasSecond: boolean; hasYear: boolean; en: string; zh: string }> = {
	linux: { count: 5, hasSecond: false, hasYear: false, en: 'Linux 5-field', zh: '标准五段式' },
	'spring-quartz': { count: 6, hasSecond: true, hasYear: false, en: 'Spring/Quartz 6-field', zh: '秒级六段式' },
	'quartz-7': { count: 7, hasSecond: true, hasYear: true, en: 'Quartz 7-field', zh: '含年七段式' },
};

/** Parse one cron field token set into a bitmask + value list, or null if invalid.
 *  Supports `*`, `a-b`, `a-b/n`, `a/n`, `*`/n and comma lists. `a/n` follows the
 *  POSIX convention of meaning `a-max/n`. `?` is accepted only when allowQuestion
 *  is true (Quartz day-of-month/day-of-week) and yields ignore:true. L/W/#
 *  modifiers do not match the token regex and are rejected as malformed. */
function parseCronField(token: string, min: number, max: number, allowQuestion: boolean): ParsedField | null {
	if (allowQuestion && token.trim() === '?') {
		return { mask: 0n, vals: [], full: false, ignore: true };
	}
	const out: number[] = [];
	for (const part of token.split(',')) {
		const m = /^(\*|\d+)(?:-(\d+))?(?:\/(\d+))?$/.exec(part.trim());
		if (!m) return null;
		let lo = min;
		let hi = max;
		if (m[1] !== '*') {
			lo = Number(m[1]);
			hi = m[2] !== undefined ? Number(m[2]) : m[3] !== undefined ? max : lo;
		}
		const step = m[3] !== undefined ? Number(m[3]) : 1;
		if (step < 1 || lo < min || hi > max || lo > hi) return null;
		for (let v = lo; v <= hi; v += step) out.push(v);
	}
	if (!out.length) return null;
	const vals = [...new Set(out)].sort((a, b) => a - b);
	let mask = 0n;
	for (const v of vals) mask |= 1n << BigInt(v);
	return { mask, vals, full: vals.length === max - min + 1, ignore: false };
}

/** Normalise a day-of-week mask to internal 0-6 (0=Sunday). Linux allows 0 and 7
 *  both meaning Sunday, so bit 7 is merged into bit 0 and cleared; Quartz uses
 *  1-7 with 1=Sunday, so the whole mask shifts right by one. */
function normalizeDowMask(raw: bigint, dialect: CronDialect): bigint {
	if (dialect === 'linux') {
		let m = raw;
		if ((m >> 7n) & 1n) m = (m | 1n) & ~(1n << 7n);
		return m;
	}
	return raw >> 1n;
}

/** Days in a Gregorian month (month is 1-12). */
function daysInMonth(year: number, month: number): number {
	const dim = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
	if (month === 2 && (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0))) return 29;
	return dim[month - 1];
}

/** Weekday 0-6 (0=Sunday) of a Gregorian date. Only the date part is used, so it
 *  is unaffected by DST gaps. */
function weekdayOf(year: number, month: number, day: number, utc: boolean): number {
	const d = utc ? new Date(Date.UTC(year, month - 1, day)) : new Date(year, month - 1, day);
	return utc ? d.getUTCDay() : d.getDay();
}

/** Smallest set bit index >= from, or -1 when none. */
function nextSetBit(mask: bigint, from: number): number {
	const start = from < 0 ? 0 : from;
	const shifted = mask >> BigInt(start);
	if (shifted === 0n) return -1;
	let idx = start;
	let s = shifted;
	while ((s & 1n) === 0n) {
		s >>= 1n;
		idx++;
	}
	return idx;
}

function firstSet(mask: bigint): number {
	return nextSetBit(mask, 0);
}

/** Parse a cron expression for the given dialect into per-field masks, or an
 *  error. Day-of-month/day-of-week keep Vixie's OR semantics (see dayMatches);
 *  Quartz 6/7-field enforces exactly one of them to be '?'. */
function parseCron(expr: string, dialect: CronDialect): ParsedCron | CronError {
	const parts = expr.trim().split(/\s+/);
	const spec = DIALECT_FIELDS[dialect];
	if (parts.length !== spec.count) {
		return {
			error: `— (expected ${spec.count} fields for ${spec.en}, got ${parts.length})`,
			errorZh: `—（${spec.zh}应为 ${spec.count} 段，实际输入 ${parts.length} 段）`,
		};
	}
	const idx: Record<'sec' | 'min' | 'hour' | 'dom' | 'mon' | 'dow' | 'year', number> = {
		sec: spec.hasSecond ? 0 : -1,
		min: spec.hasSecond ? 1 : 0,
		hour: spec.hasSecond ? 2 : 1,
		dom: spec.hasSecond ? 3 : 2,
		mon: spec.hasSecond ? 4 : 3,
		dow: spec.hasSecond ? 5 : 4,
		year: spec.hasYear ? 6 : -1,
	};
	const allowQ = spec.hasSecond; // '?' is legal only in 6/7-field Quartz
	const dowLo = dialect === 'linux' ? 0 : 1;
	const mk = (i: number, lo: number, hi: number, dowNorm: boolean): ParsedField | CronError => {
		const tok = parts[i];
		const f = parseCronField(tok, lo, hi, allowQ);
		if (!f) {
			if (tok.trim() === '?') {
				return {
					error: `— ('?' is not valid in Linux 5-field cron; use '*')`,
					errorZh: `—（标准五段式不支持 '?'，请用 '*'）`,
				};
			}
			return {
				error: `— (field ${i + 1} "${tok}" is out of range or malformed)`,
				errorZh: `—（第 ${i + 1} 段 "${tok}" 越界或格式错误）`,
			};
		}
		return dowNorm && !f.ignore ? { ...f, mask: normalizeDowMask(f.mask, dialect) } : f;
	};
	const sec = spec.hasSecond ? mk(idx.sec, 0, 59, false) : undefined;
	if (sec && isCronError(sec)) return sec;
	const min = mk(idx.min, 0, 59, false);
	if (isCronError(min)) return min;
	const hour = mk(idx.hour, 0, 23, false);
	if (isCronError(hour)) return hour;
	const dom = mk(idx.dom, 1, 31, false);
	if (isCronError(dom)) return dom;
	const mon = mk(idx.mon, 1, 12, false);
	if (isCronError(mon)) return mon;
	const dow = mk(idx.dow, dowLo, 7, true);
	if (isCronError(dow)) return dow;
	const year = spec.hasYear ? mk(idx.year, 1970, 2099, false) : undefined;
	if (year && isCronError(year)) return year;
	if (spec.hasSecond) {
		if (!dom.ignore && !dow.ignore) {
			return {
				error: `— (Quartz requires one of day-of-month / day-of-week to be '?')`,
				errorZh: `—（六/七段式要求日与周字段其一为 '?'）`,
			};
		}
		if (dom.ignore && dow.ignore) {
			return {
				error: `— (Quartz requires exactly one of day-of-month / day-of-week to be '?', not both)`,
				errorZh: `—（六/七段式要求日与周字段恰一为 '?'，不可都为 '?'）`,
			};
		}
	}
	const result: ParsedCron = { min, hour, dom, mon, dow };
	if (sec) result.sec = sec;
	if (year) result.year = year;
	return result;
}

/** Vixie day-of-month/day-of-week semantics: both present → OR, but a 'full'
 *  field matches every day and yields to the restricted one. A '?' (ignore)
 *  field drops out entirely. */
function dayMatches(dom: ParsedField, dow: ParsedField, d: number, wd: number): boolean {
	if (dom.ignore) return ((dow.mask >> BigInt(wd)) & 1n) === 1n;
	if (dow.ignore) return ((dom.mask >> BigInt(d)) & 1n) === 1n;
	if (dom.full && dow.full) return true;
	if (dom.full) return ((dow.mask >> BigInt(wd)) & 1n) === 1n;
	if (dow.full) return ((dom.mask >> BigInt(d)) & 1n) === 1n;
	return ((dom.mask >> BigInt(d)) & 1n) === 1n || ((dow.mask >> BigInt(wd)) & 1n) === 1n;
}

const MAX_YEAR = 2099;

interface NextFireResult {
	times: number[];
	error?: string;
	errorZh?: string;
}

/** Greedy carry scan from startMs: year → month → day → hour → minute → second,
 *  each field jumping to its next set bit and cascading resets upward. Local
 *  wall-clock times that do not exist (a spring-forward DST gap) are skipped by
 *  read-back comparison; a fall-back duplicate hour yields a single timestamp. */
function nextFire(parsed: ParsedCron, startMs: number, tz: 'local' | 'UTC', count: number): NextFireResult {
	const utc = tz === 'UTC';
	const hasSecond = parsed.sec !== undefined;
	const hasYear = parsed.year !== undefined;
	const sec = parsed.sec!;
	const year = parsed.year;
	const start = new Date(startMs);
	let y: number, mo: number, d: number, h: number, mi: number, s: number;
	if (utc) {
		y = start.getUTCFullYear();
		mo = start.getUTCMonth() + 1;
		d = start.getUTCDate();
		h = start.getUTCHours();
		mi = start.getUTCMinutes();
		s = start.getUTCSeconds();
	} else {
		y = start.getFullYear();
		mo = start.getMonth() + 1;
		d = start.getDate();
		h = start.getHours();
		mi = start.getMinutes();
		s = start.getSeconds();
	}
	// strictly after now
	if (hasSecond) s += 1;
	else {
		s = 0;
		mi += 1;
	}
	const construct = (yy: number, mm: number, dd: number, hh: number, mmm: number, ss: number) =>
		utc ? new Date(Date.UTC(yy, mm - 1, dd, hh, mmm, ss)) : new Date(yy, mm - 1, dd, hh, mmm, ss);
	const readBack = (dt: Date): number[] =>
		utc
			? [dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate(), dt.getUTCHours(), dt.getUTCMinutes(), dt.getUTCSeconds()]
			: [dt.getFullYear(), dt.getMonth() + 1, dt.getDate(), dt.getHours(), dt.getMinutes(), dt.getSeconds()];
	const resetTime = () => {
		h = firstSet(parsed.hour.mask);
		mi = firstSet(parsed.min.mask);
		s = hasSecond ? firstSet(sec.mask) : 0;
	};
	const times: number[] = [];
	let guard = 0;
	while (times.length < count) {
		if (++guard > 2_000_000) {
			return { times, error: '— (iteration limit reached; the expression may be unsatisfiable)', errorZh: '—（迭代超限，表达式可能无法触发）' };
		}
		if (hasYear && year) {
			if (((year.mask >> BigInt(y)) & 1n) === 0n) {
				const nb = nextSetBit(year.mask, y);
				if (nb < 0) {
					return { times, error: '— (no execution time before 2100; the year field has no matching year)', errorZh: '—（年字段范围内已无匹配年份，表达式不可能再触发）' };
				}
				y = nb;
				mo = firstSet(parsed.mon.mask);
				d = 1;
				resetTime();
				continue;
			}
		} else if (y > MAX_YEAR) {
			return { times, error: '— (no execution time before 2100; check for an impossible day such as Feb 30)', errorZh: '—（2100 年前无可执行时刻，请检查是否存在不可能的日期如 2 月 30 日）' };
		}
		// MONTH
		if (((parsed.mon.mask >> BigInt(mo)) & 1n) === 0n) {
			const nb = nextSetBit(parsed.mon.mask, mo);
			if (nb < 0) {
				y += 1;
				mo = firstSet(parsed.mon.mask);
			} else mo = nb;
			d = 1;
			resetTime();
			continue;
		}
		// DAY
		if (d > daysInMonth(y, mo)) {
			d = 1;
			mo += 1;
			resetTime();
			continue;
		}
		if (!dayMatches(parsed.dom, parsed.dow, d, weekdayOf(y, mo, d, utc))) {
			d += 1;
			resetTime();
			continue;
		}
		// HOUR
		if (((parsed.hour.mask >> BigInt(h)) & 1n) === 0n) {
			const nb = nextSetBit(parsed.hour.mask, h);
			if (nb < 0) {
				d += 1;
				resetTime();
				continue;
			}
			h = nb;
			mi = firstSet(parsed.min.mask);
			s = hasSecond ? firstSet(sec.mask) : 0;
			continue;
		}
		// MINUTE
		if (((parsed.min.mask >> BigInt(mi)) & 1n) === 0n) {
			const nb = nextSetBit(parsed.min.mask, mi);
			if (nb < 0) {
				h += 1;
				mi = firstSet(parsed.min.mask);
				s = hasSecond ? firstSet(sec.mask) : 0;
				continue;
			}
			mi = nb;
			s = hasSecond ? firstSet(sec.mask) : 0;
			continue;
		}
		// SECOND
		if (hasSecond && ((sec.mask >> BigInt(s)) & 1n) === 0n) {
			const nb = nextSetBit(sec.mask, s);
			if (nb < 0) {
				mi += 1;
				s = firstSet(sec.mask);
				continue;
			}
			s = nb;
		}
		// all fields matched — verify the wall clock actually exists
		const cand = construct(y, mo, d, h, mi, s);
		const back = readBack(cand);
		if (back[0] !== y || back[1] !== mo || back[2] !== d || back[3] !== h || back[4] !== mi || back[5] !== s) {
			// non-existent wall clock (spring-forward DST gap): skip
			if (hasSecond) s += 1;
			else mi += 1;
			continue;
		}
		times.push(cand.getTime());
		if (hasSecond) s += 1;
		else mi += 1;
	}
	return { times };
}


// --- sha-1 / sha-256 (pure TS, sync — WebCrypto is async and TextTransform is not) ----

function rotr(x: number, n: number): number {
	return (x >>> n) | (x << (32 - n));
}

export function sha256Hex(msg: string): string {
	const bytes = new TextEncoder().encode(msg);
	const ml = bytes.length * 8;
	const data = new Uint8Array((((bytes.length + 8) >> 6) + 1) * 64);
	data.set(bytes);
	data[bytes.length] = 0x80;
	const dv = new DataView(data.buffer);
	dv.setUint32(data.length - 8, Math.floor(ml / 2 ** 32), false);
	dv.setUint32(data.length - 4, ml >>> 0, false);
	const K = [
		0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
		0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
		0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
		0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
		0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
		0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
		0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
		0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
	];
	const w = new Uint32Array(64);
	let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a, h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
	for (let i = 0; i < data.length; i += 64) {
		for (let j = 0; j < 16; j++) w[j] = dv.getUint32(i + j * 4, false);
		for (let j = 16; j < 64; j++) {
			const s0 = rotr(w[j - 15], 7) ^ rotr(w[j - 15], 18) ^ (w[j - 15] >>> 3);
			const s1 = rotr(w[j - 2], 17) ^ rotr(w[j - 2], 19) ^ (w[j - 2] >>> 10);
			w[j] = (w[j - 16] + s0 + w[j - 7] + s1) >>> 0;
		}
		let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
		for (let j = 0; j < 64; j++) {
			const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
			const ch = (e & f) ^ (~e & g);
			const t1 = (h + S1 + ch + K[j] + w[j]) >>> 0;
			const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
			const maj = (a & b) ^ (a & c) ^ (b & c);
			const t2 = (S0 + maj) >>> 0;
			h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
		}
		h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
		h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
	}
	return [h0, h1, h2, h3, h4, h5, h6, h7].map((x) => x.toString(16).padStart(8, '0')).join('');
}

export async function sha256Async(msg: string): Promise<string> {
	if (typeof crypto !== 'undefined' && crypto.subtle && typeof crypto.subtle.digest === 'function') {
		const bytes = new TextEncoder().encode(msg);
		const hashBuf = await crypto.subtle.digest('SHA-256', bytes);
		const arr = new Uint8Array(hashBuf);
		let hex = '';
		for (let i = 0; i < arr.length; i++) {
			hex += arr[i].toString(16).padStart(2, '0');
		}
		return hex;
	}
	return sha256Hex(msg);
}

// --- case converter -----------------------------------------------------------------
// Word boundaries come from non-alphanumeric runs, case transitions
// (lower→UPPER) and the acronym→word seam (XMLHttp→XML|Http), so acronyms
// survive re-joining in every style.

export function splitWords(s: string): string[] {
	return s
		.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
		.replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
		.split(/[^A-Za-z0-9]+/)
		.filter(Boolean);
}

const cap = (w: string): string => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w);

export function toCamel(s: string): string {
	return splitWords(s)
		.map((w, i) => (i === 0 ? w.toLowerCase() : cap(w)))
		.join('');
}
export function toPascal(s: string): string {
	return splitWords(s)
		.map(cap)
		.join('');
}
export function toSnake(s: string): string {
	return splitWords(s)
		.map((w) => w.toLowerCase())
		.join('_');
}
export function toKebab(s: string): string {
	return splitWords(s)
		.map((w) => w.toLowerCase())
		.join('-');
}
export function toConstant(s: string): string {
	return splitWords(s)
		.map((w) => w.toUpperCase())
		.join('_');
}
export function toTitle(s: string): string {
	return splitWords(s)
		.map(cap)
		.join(' ');
}
export function toSentence(s: string): string {
	const w = splitWords(s).map((x) => x.toLowerCase());
	return w.length ? cap(w[0]) + ' ' + w.slice(1).join(' ') : '';
}

// --- RMB uppercase (人民币大写金额) --------------------------------------------------
// Formal amount for invoices and bank slips. The Chinese characters ARE the
// tool's subject matter, so they show in both language views — same exemption
// as converters/weight's 市斤/两. Rules follow the People's Bank accounting
// convention: 零 collapsed to single, trailing 零 dropped, all-zero integer
// part reads 零元, no fractional part reads 整, 角 present + no 分 reads e.g.
// 伍角, and 零 bridges 元 to 分 (10.05 → 壹拾元零伍分).
// Supports 0 ≤ amount < 10^16 with up to two decimal places.

const RMB_DIGITS = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖'];
const RMB_SECTIONS = ['', '拾', '佰', '仟'];
const RMB_GROUP_UNITS = ['', '万', '亿', '万亿'];

/** Convert a numeric amount into the formal Chinese uppercase amount, or null
 *  when the input is not a valid non-negative amount with ≤2 decimals. */
export function rmbUppercase(input: string): string | null {
	const t = input.replace(/[¥￥,，\s]/g, '');
	if (!/^\d{1,16}(\.\d{1,2})?$/.test(t)) return null;
	const [intRaw, dec = ''] = t.split('.');
	const int = intRaw.replace(/^0+(?=\d)/, '');
	const hasJiao = dec[0] !== undefined && dec[0] !== '0';
	const hasFen = dec.length > 1 && dec[1] !== '0';

	let intStr = '';
	if (int !== '0') {
		// 4-digit chunks, most significant first; each chunk carries its group unit.
		const groups: string[] = [];
		for (let i = int.length; i > 0; i -= 4) groups.unshift(int.slice(Math.max(0, i - 4), i));
		const parts: string[] = [];
		let pendingZero = false;
		groups.forEach((g, idx) => {
			const unit = RMB_GROUP_UNITS[groups.length - 1 - idx];
			if (/^0+$/.test(g)) {
				// An entirely-zero group (100000001 → 亿 group then two 0001/0000…):
				// it contributes nothing but remembers a 零 for the next nonzero group.
				if (parts.length) pendingZero = true;
				return;
			}
			// Section digits with 拾佰仟; 零 only where a nonzero digit follows a gap.
			const padded = g.padStart(4, '0');
			let section = '';
			let zeroIn = false;
			for (let i = 0; i < 4; i++) {
				const d = +padded[i];
				if (d === 0) {
					if (section) zeroIn = true;
					continue;
				}
				if (zeroIn) {
					section += '零';
					zeroIn = false;
				}
				section += RMB_DIGITS[d] + RMB_SECTIONS[3 - i];
			}
			// A nonzero group whose thousands digit is 0 needs a bridging 零
			// after a preceding group (12340001 → …万零壹元).
			if (parts.length && padded[0] === '0') pendingZero = true;
			if (pendingZero) {
				parts.push('零');
				pendingZero = false;
			}
			parts.push(section + unit);
		});
		intStr = parts.join('') + '元';
	}

	if (!hasJiao && !hasFen) return (intStr || '零元') + '整';
	let decStr = '';
	if (hasJiao) decStr += RMB_DIGITS[+dec[0]] + '角';
	if (hasFen) {
		// No 角 between 元 and 分 → bridge with 零 (10.05 → 壹拾元零伍分),
		// except when there is no 元 part at all (0.05 → 伍分).
		if (!hasJiao && int !== '0') decStr += '零';
		decStr += RMB_DIGITS[+dec[1]] + '分';
	}
	return intStr + decStr;
}

// --- roman numerals -------------------------------------------------------------------

const ROMAN_VALUES: [number, string][] = [
	[1000, 'M'],
	[900, 'CM'],
	[500, 'D'],
	[400, 'CD'],
	[100, 'C'],
	[90, 'XC'],
	[50, 'L'],
	[40, 'XL'],
	[10, 'X'],
	[9, 'IX'],
	[5, 'V'],
	[4, 'IV'],
	[1, 'I'],
];

/** 1–3999; null outside the range classical numerals can express. */
export function toRoman(n: number): string | null {
	if (!Number.isInteger(n) || n < 1 || n > 3999) return null;
	let out = '';
	for (const [v, sym] of ROMAN_VALUES) {
		while (n >= v) {
			out += sym;
			n -= v;
		}
	}
	return out;
}

/** Validate and evaluate a Roman numeral (1–3999); null when malformed. */
export function fromRoman(s: string): number | null {
	const t = s.trim().toUpperCase();
	if (!/^[MDCLXVI]+$/.test(t)) return null;
	// Reject non-canonical forms (e.g. IIII, VX, IC) by re-encoding.
	let n = 0;
	const vals: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
	for (let i = 0; i < t.length; i++) {
		const cur = vals[t[i]];
		const next = vals[t[i + 1]] ?? 0;
		n += cur < next ? -cur : cur;
	}
	if (n < 1 || n > 3999 || toRoman(n) !== t) return null;
	return n;
}

// --- HTML entities ---------------------------------------------------------------------

const ENTITY_ESCAPES: [RegExp, string][] = [
	[/&/g, '&amp;'],
	[/</g, '&lt;'],
	[/>/g, '&gt;'],
	[/"/g, '&quot;'],
	[/'/g, '&#39;'],
];

const NAMED_ENTITIES: Record<string, string> = {
	amp: '&',
	lt: '<',
	gt: '>',
	quot: '"',
	apos: "'",
	nbsp: ' ',
	ensp: ' ',
	emsp: ' ',
	copy: '©',
	reg: '®',
	trade: '™',
	deg: '°',
	plusmn: '±',
	middot: '·',
	times: '×',
	divide: '÷',
	hellip: '…',
	mdash: '—',
	ndash: '–',
	lsquo: '‘',
	rsquo: '’',
	ldquo: '“',
	rdquo: '”',
	laquo: '«',
	raquo: '»',
	euro: '€',
	pound: '£',
	yen: '¥',
	cent: '¢',
};

/** Unescape one &entity; token, or null when unknown. */
function unescapeEntity(tok: string): string | null {
	if (tok.startsWith('#x') || tok.startsWith('#X')) {
		const cp = parseInt(tok.slice(2), 16);
		return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : null;
	}
	if (tok.startsWith('#')) {
		const cp = parseInt(tok.slice(1), 10);
		return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : null;
	}
	return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, tok) ? NAMED_ENTITIES[tok] : null;
}

export function escapeEntities(text: string): string {
	let out = text;
	for (const [re, rep] of ENTITY_ESCAPES) out = out.replace(re, rep);
	return out;
}

/** Unescape every entity in the text; null when any single one is unknown,
 *  so a typo is reported instead of silently passing through. */
export function unescapeEntities(text: string): string | null {
	let ok = true;
	const out = text.replace(/&([#xX]?[0-9a-zA-Z]+);/g, (_m, tok: string) => {
		const r = unescapeEntity(tok);
		if (r === null) {
			ok = false;
			return _m;
		}
		return r;
	});
	return ok ? out : null;
}

// --- CSV / JSON -------------------------------------------------------------------------

/** RFC 4180 CSV parser: quoted fields, doubled quotes, CRLF or LF rows.
 *  Returns null when a quoted field is left unterminated. */
export function parseCsv(text: string): string[][] | null {
	const rows: string[][] = [];
	let row: string[] = [];
	let field = '';
	let inQuotes = false;
	let i = 0;
	const s = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
	while (i < s.length) {
		const ch = s[i];
		if (inQuotes) {
			if (ch === '"') {
				if (s[i + 1] === '"') {
					field += '"';
					i += 2;
					continue;
				}
				inQuotes = false;
			} else {
				field += ch;
			}
		} else if (ch === '"' && field === '') {
			inQuotes = true;
		} else if (ch === ',') {
			row.push(field);
			field = '';
		} else if (ch === '\n') {
			row.push(field);
			rows.push(row);
			row = [];
			field = '';
		} else {
			field += ch;
		}
		i++;
	}
	if (inQuotes) return null;
	if (field !== '' || row.length > 0) {
		row.push(field);
		rows.push(row);
	}
	// Drop a trailing all-empty row created by a final newline.
	if (rows.length > 1 && rows[rows.length - 1].every((c) => c === '') && rows[rows.length - 1].length === 1) rows.pop();
	return rows;
}

function csvCell(v: string): string {
	return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** CSV text → JSON text. First row is the header; ragged rows are an error. */
export function csvToJson(text: string): { output: string; error?: string; errorZh?: string } {
	const rows = parseCsv(text);
	if (!rows) return { output: '', error: 'Unterminated quoted field.', errorZh: '存在未闭合的引号字段。' };
	if (rows.length < 2) return { output: '', error: 'CSV needs a header row plus at least one data row.', errorZh: 'CSV 需要一行表头和至少一行数据。' };
	const header = rows[0];
	const seen = new Set<string>();
	for (const h of header) {
		if (seen.has(h)) return { output: '', error: `Duplicate header "${h}".`, errorZh: `表头 "${h}" 重复。` };
		seen.add(h);
	}
	const objs: Record<string, string>[] = [];
	for (let r = 1; r < rows.length; r++) {
		if (rows[r].length !== header.length) {
			return {
				output: '',
				error: `Row ${r + 1} has ${rows[r].length} fields, expected ${header.length}.`,
				errorZh: `第 ${r + 1} 行有 ${rows[r].length} 个字段，应为 ${header.length} 个。`,
			};
		}
		const obj: Record<string, string> = {};
		header.forEach((h, c) => (obj[h] = rows[r][c]));
		objs.push(obj);
	}
	return { output: JSON.stringify(objs, null, 2) };
}

/** JSON text (array of flat objects) → CSV text. */
export function jsonToCsv(text: string): { output: string; error?: string; errorZh?: string } {
	let data: unknown;
	try {
		data = JSON.parse(text);
	} catch {
		return { output: '', error: 'Not valid JSON.', errorZh: '这不是合法的 JSON。' };
	}
	if (!Array.isArray(data) || data.length === 0) {
		return { output: '', error: 'Expected a non-empty JSON array of objects.', errorZh: '需要非空的 JSON 对象数组。' };
	}
	// Header: keys of the first object, in order; extra keys in later rows are ignored.
	const first = data[0];
	if (typeof first !== 'object' || first === null || Array.isArray(first)) {
		return { output: '', error: 'Expected an array of objects, not primitives.', errorZh: '需要对象数组，不支持基本类型。' };
	}
	const header = Object.keys(first as Record<string, unknown>);
	const lines = [header.map(csvCell).join(',')];
	for (const item of data) {
		if (typeof item !== 'object' || item === null) {
			return { output: '', error: 'Every row must be an object.', errorZh: '每一行都必须是对象。' };
		}
		const rec = item as Record<string, unknown>;
		lines.push(header.map((h) => csvCell(rec[h] === undefined || rec[h] === null ? '' : String(rec[h]))).join(','));
	}
	return { output: lines.join('\n') };
}

export const DEVTOOLS_TEXT_TOOLS: ToolEntry[] = [
	{
		slug: 'json-formatter',
		category: 'devtools',
		name: 'JSON Formatter & Validator',
		nameZh: 'JSON 格式化与校验工具',
		description: 'Format, validate, minify, escape, and inspect JSON with exact error positions, one-click copy, and file download.',
		descriptionZh: '格式化、校验、压缩与转义 JSON，精准定位语法错误行号与列号。',
		kind: 'json',
	},

	{
		slug: 'sql-formatter',
		category: 'devtools',
		name: 'SQL Formatter & Beautifier',
		nameZh: 'SQL 格式化与美化工具',
		description: 'Format, beautify, indent, and minify SQL queries with keyword auto-capitalization and 100% browser-side privacy.',
		descriptionZh: 'SQL 查询格式化美化与压缩工具，支持关键字自动大写与本地隐私安全。',
		kind: 'sql',
	},

	{
		slug: 'html-formatter',
		category: 'devtools',
		name: 'HTML Formatter & Minifier',
		nameZh: 'HTML 格式化与压缩工具',
		description: 'Format messy HTML with proper indentation and self-closing element awareness, or minify HTML to optimize web page delivery.',
		descriptionZh: 'HTML 网页代码规范缩进排版与单行 Minify 压缩工具。',
		kind: 'html',
	},

	{
		slug: 'css-formatter',
		category: 'devtools',
		name: 'CSS Formatter & Minifier',
		nameZh: 'CSS 格式化与压缩工具',
		description: 'Beautify CSS stylesheets with clean rules and property indentation, or minify CSS to a single line for production performance.',
		descriptionZh: 'CSS 样式表格式化排版与单行 Minify 压缩工具。',
		kind: 'css',
	},

	{
		slug: 'xml-formatter',
		category: 'devtools',
		name: 'XML / SVG Formatter & Validator',
		nameZh: 'XML / SVG 格式化与校验工具',
		description: 'Validate XML syntax, format with customizable 2/4-space indentation, and minify XML/SVG documents in your browser.',
		descriptionZh: 'XML 与 SVG 矢量代码格式化、层级缩进与语法校验工具。',
		kind: 'xml',
	},

	// --- JS / TS Code Formatter ---------------------------------------------------------
	{
		slug: 'js-formatter',
		category: 'devtools',
		name: 'JavaScript & TypeScript Code Formatter',
		nameZh: 'JavaScript / TypeScript 代码格式化与压缩',
		description: 'Format and beautify JavaScript & TypeScript code with 2-space indentation and block rules, or minify to a single line.',
		descriptionZh: 'JavaScript 与 TypeScript 代码规范缩进格式化美化、单行 Minify 压缩与括号整理工具。',
		kind: 'text',
		config: {
			def: 'const user = { name: \"Alice\", age: 30, tags: [\"admin\", \"dev\"] };\nconsole.log(JSON.stringify(user, null, 2));\n',
			placeholder: 'function calculateTotal(items){let sum=0;for(let i=0;i<items.length;i++){sum+=items[i].price;}return sum;}',
			placeholderZh: '粘贴 JS / TS 代码，例如：function calculateTotal(items){let sum=0;for(let i=0;i<items.length;i++){sum+=items[i].price;}return sum;}',
			mono: true,
			live: true,
			stats: (text: string) => {
				const lines = text ? text.split('\n').length : 0;
				const chars = text.length;
				return [
					{ label: 'Total Lines', labelZh: '总行数', value: String(lines) },
					{ label: 'Character Count', labelZh: '字符总数', value: String(chars) },
				];
			},
			transforms: [
				{
					id: 'format',
					label: 'Format JS/TS',
					labelZh: '格式化排版',
					run: (text: string) => ({ output: formatJsTsCode(text, 'beautify') }),
				},
				{
					id: 'minify',
					label: 'Minify Code',
					labelZh: '单行压缩',
					run: (text: string) => ({ output: formatJsTsCode(text, 'minify') }),
				},
			],
		},
	},


	// --- GraphQL Formatter --------------------------------------------------------------
	{
		slug: 'graphql-formatter',
		category: 'devtools',
		name: 'GraphQL Query & Schema Formatter',
		nameZh: 'GraphQL 查询与 Schema 格式化工具',
		description: 'Format GraphQL queries, mutations, subscriptions, and SDL schemas with clean indentation and directive alignment.',
		descriptionZh: 'GraphQL 查询语句 (Query / Mutation) 与 Schema 声明规范格式化、层级缩进与单行压缩。',
		kind: 'text',
		config: {
			def: 'query GetUser($id: ID!) { user(id: $id) { id name email posts { title } } }',
			placeholder: 'query GetUser($id: ID!){ user(id: $id){ id name email posts{ title content } } }',
			placeholderZh: '粘贴 GraphQL 查询语句，例如：query GetUser($id: ID!){ user(id: $id){ id name email posts{ title content } } }',
			mono: true,
			live: true,
			stats: (text: string) => {
				const lines = text ? text.split('\n').length : 0;
				const chars = text.length;
				return [
					{ label: 'Total Lines', labelZh: '总行数', value: String(lines) },
					{ label: 'Character Count', labelZh: '字符总数', value: String(chars) },
				];
			},
			transforms: [
				{
					id: 'format',
					label: 'Format GraphQL',
					labelZh: '格式化排版',
					run: (text: string) => ({ output: formatGraphQL(text, 'beautify') }),
				},
				{
					id: 'minify',
					label: 'Minify Query',
					labelZh: '单行压缩',
					run: (text: string) => ({ output: formatGraphQL(text, 'minify') }),
				},
			],
		},
	},

	{
		slug: 'yaml-formatter',
		category: 'devtools',
		name: 'YAML Formatter & Validator',
		nameZh: 'YAML 格式化与校验工具',
		description: 'Format and validate YAML with canonical 2-space indentation, or convert between YAML and JSON both ways.',
		descriptionZh: '规范化缩进格式化并校验 YAML，支持 YAML 与 JSON 双向转换。',
		kind: 'text',
		config: {
			def: '# demo service config\nserver:\n  host: example.com\n  port: 8080\ndatabase:\n  name: demo\n  replicas:\n    - primary\n    - replica-1\n',
			placeholder: 'server:\n  port: 8080\n…',
			placeholderZh: 'server:\n  port: 8080\n…',
			mono: true,
			transforms: [
				{
					id: 'format',
					label: 'Format / Validate',
					labelZh: '格式化 / 校验',
					// The parser is dynamically imported so its ~10 KB stays out of
					// the shared tool chunk every tool page downloads (perf-budget
					// pins main < 60 KB brotli); text.ts already awaits run().
					run: async (t) => {
						if (!t.trim()) return { output: '', error: 'Enter YAML first.', errorZh: '请先输入 YAML。' };
						try {
							const { formatYaml: fmt } = await import('./yaml');
							return { output: fmt(t) };
						} catch (e) {
							return { output: '', error: errToEn(e), errorZh: errToZh(e) };
						}
					},
				},
				{
					id: 'yaml2json',
					label: 'YAML → JSON',
					labelZh: 'YAML → JSON',
					run: async (t) => {
						if (!t.trim()) return { output: '', error: 'Enter YAML first.', errorZh: '请先输入 YAML。' };
						try {
							const { yamlToJson: toJ } = await import('./yaml');
							return { output: toJ(t) };
						} catch (e) {
							return { output: '', error: errToEn(e), errorZh: errToZh(e) };
						}
					},
				},
				{
					id: 'json2yaml',
					label: 'JSON → YAML',
					labelZh: 'JSON → YAML',
					run: async (t) => {
						if (!t.trim()) return { output: '', error: 'Enter JSON first.', errorZh: '请先输入 JSON。' };
						try {
							const { jsonToYaml: toY } = await import('./yaml');
							return { output: toY(t) };
						} catch (e) {
							return { output: '', error: errToEn(e), errorZh: errToZh(e) };
						}
					},
				},
			],
		} satisfies TextConfig,
	},

	{
		slug: 'toml-formatter',
		category: 'devtools',
		name: 'TOML Formatter & Validator',
		nameZh: 'TOML 格式化与校验工具',
		description: 'Format and validate TOML (Cargo.toml / pyproject.toml), or convert between TOML and JSON both ways.',
		descriptionZh: '规范化格式化并校验 TOML（Cargo.toml / pyproject.toml），支持 TOML 与 JSON 双向转换。',
		kind: 'text',
		config: {
			def: '# demo config\ntitle = "demo"\nversion = 2\n\n[server]\nhost = "example.com"\nport = 8080\n\n[[products]]\nname = "hammer"\nsku = 738594937\n\n[[products]]\nname = "nail"\n',
			placeholder: 'title = "demo"…',
			placeholderZh: 'title = "demo"…',
			mono: true,
			transforms: [
				{
					id: 'format',
					label: 'Format / Validate',
					labelZh: '格式化 / 校验',
					run: async (t) => {
						if (!t.trim()) return { output: '', error: 'Enter TOML first.', errorZh: '请先输入 TOML。' };
						try {
							const { formatToml: fmt } = await import('./toml');
							return { output: fmt(t) };
						} catch (e) {
							return { output: '', error: errToEn(e), errorZh: errToZh(e) };
						}
					},
				},
				{
					id: 'toml2json',
					label: 'TOML → JSON',
					labelZh: 'TOML → JSON',
					run: async (t) => {
						if (!t.trim()) return { output: '', error: 'Enter TOML first.', errorZh: '请先输入 TOML。' };
						try {
							const { tomlToJson: toJ } = await import('./toml');
							return { output: toJ(t) };
						} catch (e) {
							return { output: '', error: errToEn(e), errorZh: errToZh(e) };
						}
					},
				},
				{
					id: 'json2toml',
					label: 'JSON → TOML',
					labelZh: 'JSON → TOML',
					run: async (t) => {
						if (!t.trim()) return { output: '', error: 'Enter JSON first.', errorZh: '请先输入 JSON。' };
						try {
							const { jsonToToml: toT } = await import('./toml');
							return { output: toT(t) };
						} catch (e) {
							return { output: '', error: errToEn(e), errorZh: errToZh(e) };
						}
					},
				},
			],
		} satisfies TextConfig,
	},

	{
		slug: 'json-to-typescript',
		category: 'devtools',
		name: 'JSON to TypeScript Interface Generator',
		nameZh: 'JSON 转 TypeScript 接口生成器',
		description: 'Generate TypeScript interfaces from JSON, merging object arrays into one interface with optional keys.',
		descriptionZh: '从 JSON 生成 TypeScript interface 定义，对象数组自动合并为单一接口并标注可选字段。',
		kind: 'text',
		config: {
			def: '{\n  "name": "Alice",\n  "age": 30,\n  "address": { "city": "Springfield", "zip": "12345" },\n  "orders": [\n    { "id": 1, "total": 99.5, "shipped": true },\n    { "id": 2, "total": 12.0 }\n  ]\n}\n',
			placeholder: '{ "name": "Alice", … }',
			placeholderZh: '{ "name": "Alice", … }',
			mono: true,
			live: true,
			transforms: [
				{
					id: 'gen',
					label: 'Generate interfaces',
					labelZh: '生成 TypeScript 接口',
					run: async (t) => {
						if (!t.trim()) return { output: '', error: 'Enter JSON first.', errorZh: '请先输入 JSON。' };
						try {
							const { jsonToTypescript: gen } = await import('./jsontots');
							return { output: gen(t) };
						} catch (e) {
							return { output: '', error: errToEn(e), errorZh: errToZh(e) };
						}
					},
				},
			],
		} satisfies TextConfig,
	},

	{
		slug: 'xml-json-converter',
		category: 'devtools',
		name: 'XML ⇄ JSON Converter',
		nameZh: 'XML 与 JSON 互转工具',
		description: 'Convert XML to JSON (attributes as @keys, text as #text) and JSON back to XML, fully in your browser.',
		descriptionZh: 'XML 转 JSON（属性映射为 @键、文本为 #text），以及 JSON 转 XML，全程浏览器本地处理。',
		kind: 'text',
		config: {
			def: '<?xml version="1.0"?>\n<library name="city">\n  <book id="1">Dune</book>\n  <book id="2">Hyperion</book>\n  <open>false</open>\n</library>\n',
			placeholder: '<root>…</root>',
			placeholderZh: '<root>…</root>',
			mono: true,
			transforms: [
				{
					id: 'xml2json',
					label: 'XML → JSON',
					labelZh: 'XML → JSON',
					run: async (t) => {
						if (!t.trim()) return { output: '', error: 'Enter XML first.', errorZh: '请先输入 XML。' };
						try {
							const { xmlToJson: toJ } = await import('./xmljson');
							return { output: toJ(t) };
						} catch (e) {
							return { output: '', error: errToEn(e), errorZh: errToZh(e) };
						}
					},
				},
				{
					id: 'json2xml',
					label: 'JSON → XML',
					labelZh: 'JSON → XML',
					run: async (t) => {
						if (!t.trim()) return { output: '', error: 'Enter JSON first.', errorZh: '请先输入 JSON。' };
						try {
							const { jsonToXml: toX } = await import('./xmljson');
							return { output: toX(t) };
						} catch (e) {
							return { output: '', error: errToEn(e), errorZh: errToZh(e) };
						}
					},
				},
			],
		} satisfies TextConfig,
	},

	{
		slug: 'env-json-converter',
		category: 'devtools',
		name: '.env ⇄ JSON Converter',
		nameZh: '.env 与 JSON 互转工具',
		description: 'Convert .env files to JSON and back, with quote handling, export prefixes and inline comments.',
		descriptionZh: '.env 文件与 JSON 互转，完整处理引号、export 前缀与行内注释。',
		kind: 'text',
		config: {
			def: '# app config\nHOST=example.com\nPORT=8080\nDEBUG=false\nAPI_KEY="your-key-here"\n',
			placeholder: 'KEY=value…',
			placeholderZh: 'KEY=value…',
			mono: true,
			live: true,
			transforms: [
				{
					id: 'env2json',
					label: '.env → JSON',
					labelZh: '.env → JSON',
					run: async (t) => {
						if (!t.trim()) return { output: '', error: 'Enter .env content first.', errorZh: '请先输入 .env 内容。' };
						try {
							const { envToJson: toJ } = await import('./envjson');
							return { output: toJ(t) };
						} catch (e) {
							return { output: '', error: errToEn(e), errorZh: errToZh(e) };
						}
					},
				},
				{
					id: 'json2env',
					label: 'JSON → .env',
					labelZh: 'JSON → .env',
					run: async (t) => {
						if (!t.trim()) return { output: '', error: 'Enter JSON first.', errorZh: '请先输入 JSON。' };
						try {
							const { jsonToEnv: toE } = await import('./envjson');
							return { output: toE(t) };
						} catch (e) {
							return { output: '', error: errToEn(e), errorZh: errToZh(e) };
						}
					},
				},
			],
		} satisfies TextConfig,
	},

	{
		slug: 'csv-json-converter',
		category: 'devtools',
		name: 'CSV ⇄ JSON Converter',
		nameZh: 'CSV 与 JSON 互转工具',
		description: 'Convert CSV to JSON (first row as header) or a JSON array of objects to CSV, with full RFC 4180 quoting support.',
		descriptionZh: 'CSV 转 JSON（首行为表头），或将 JSON 对象数组转为 CSV，完整支持 RFC 4180 引号规则。',
		kind: 'text',
		config: {
			def: 'name,role,city\nAlice,Engineer,Shanghai\nBob,Designer,"Downtown, Hangzhou"',
			placeholder: 'Paste CSV or a JSON array…',
			placeholderZh: '粘贴 CSV 或 JSON 数组…',
			mono: true,
			transforms: [
				{
					id: 'csv2json',
					label: 'CSV → JSON',
					labelZh: 'CSV → JSON',
					run: (t) => csvToJson(t),
				},
				{
					id: 'json2csv',
					label: 'JSON → CSV',
					labelZh: 'JSON → CSV',
					run: (t) => jsonToCsv(t),
				},
			],
		} satisfies TextConfig,
	},

	{
		slug: 'base64',
		category: 'devtools',
		name: 'Base64 Encoder / Decoder',
		nameZh: 'Base64 编码解码',
		description: 'Encode text to Base64 or decode it back, with Unicode and URL-safe support.',
		descriptionZh: '文本与 Base64 互相编解码，完整支持 Unicode 中文与 URL 安全模式。',
		kind: 'text',
		config: {
			def: 'Hello, QCSunny Lab!',
			placeholder: 'Text to encode, or Base64 to decode…',
			placeholderZh: '待编码的文本，或待解码的 Base64…',
			mono: true,
			transforms: [
				{
					id: 'encode',
					label: 'Encode → Base64',
					labelZh: '编码为 Base64',
					run: (t) => ({
						output: t ? b64encode(t) : '',
						error: t ? undefined : 'Enter text first.',
						errorZh: t ? undefined : '请先输入文本。',
					}),
				},
				{
					id: 'decode',
					label: 'Decode ← Base64',
					labelZh: 'Base64 解码',
					run: (t) => {
						if (!t.trim())
							return { output: '', error: 'Enter Base64 first.', errorZh: '请先输入 Base64 字符串。' };
						try {
							return { output: b64decode(t) };
						} catch {
							return { output: '', error: 'Not valid Base64.', errorZh: '这不是合法的 Base64。' };
						}
					},
				},
				{
					id: 'urlsafe',
					label: 'Encode URL-safe',
					labelZh: 'URL 安全编码',
					run: (t) => ({
						output: t ? b64url(t) : '',
						error: t ? undefined : 'Enter text first.',
						errorZh: t ? undefined : '请先输入文本。',
					}),
				},
				{
					id: 'encodeLines',
					label: 'Encode each line',
					labelZh: '逐行编码',
					run: (t) => runBatch(t, (line) => b64encode(line)),
				},
				{
					id: 'decodeLines',
					label: 'Decode each line',
					labelZh: '逐行解码',
					// Batch decode: one bad line is marked ✗, the rest of the list still decodes.
					run: (t) => runBatch(t, (line) => {
						try {
							return b64decode(line);
						} catch {
							return null;
						}
					}),
				},
			],
		} satisfies TextConfig,
	},

	{
		slug: 'jwt-decoder',
		category: 'devtools',
		name: 'JWT Decoder & Formatter',
		nameZh: 'JWT 令牌解码与格式化',
		description: 'Decode JSON Web Tokens (JWT) into Header and Payload, inspect expiration timestamps, and verify claims safely with zero data upload.',
		descriptionZh: '解析 JWT 令牌 Header 与 Payload，快速检验过期时间与 Claims 字段。',
		kind: 'jwt',
	},

	{
		slug: 'url-parser',
		category: 'devtools',
		name: 'URL Parser & Query Formatter',
		nameZh: 'URL 网址与参数格式化',
		description: 'Parse URLs into protocol, hostname, path, and query strings. Decode, sort params, remove tracking tags, and export to JSON.',
		descriptionZh: '解析 URL 协议、域名、路径与参数，支持参数排序与去除营销追踪参数。',
		kind: 'url',
	},


	{
		slug: 'hash-generator',
		category: 'devtools',
		name: 'Hash & HMAC Generator (Text & File)',
		nameZh: '哈希与 HMAC 生成器 (文本 / 文件)',
		description: 'MD5, SHA-1/224/256/384/512 and SHA-3 digests of text or dropped files, plus HMAC-SHA256/384/512 — all locally in your browser.',
		descriptionZh: '文本或拖入文件计算 MD5、SHA-1/224/256/384/512、SHA-3 摘要，并支持 HMAC-SHA256/384/512，全程本地运算。',
		kind: 'text',
		config: {
			def: 'hello world',
			placeholder: 'Type or paste text to hash…',
			placeholderZh: '输入或粘贴需要求哈希的文本…',
			mono: true,
			live: true,
			// Bytes in, digests out — shared by the text and the file paths.
			// hashlib lazily imported: the hand-rolled MD5/SHA-224/SHA-3 cores
			// (~6 KB) stay out of the chunk every tool page downloads.
			fileTransform: async (data, name, size, secret = '') => {
				const { hashBytes, HASH_ALGOS, hmacBytes } = await import('../scripts/tools/hashlib');
				const bytes = new Uint8Array(data);
				const lines: string[] = [`File: ${name} (${size.toLocaleString()} bytes)`, ''];
				for (const algo of HASH_ALGOS) lines.push(`${algo.padEnd(10)} ${await hashBytes(algo, bytes)}`);
				if (secret) {
					lines.push('', '-- HMAC --');
					for (const algo of (['SHA-256', 'SHA-384', 'SHA-512'] as const)) lines.push(`${algo.padEnd(10)} ${await hmacBytes(algo, secret, bytes)}`);
				}
				return { output: lines.join('\n') };
			},
			secretInput: {
				label: 'Secret key (for HMAC)',
				labelZh: '密钥（HMAC 用）',
				placeholder: 'leave empty to skip HMAC',
				placeholderZh: '留空则不计算 HMAC',
			},
			stats: (text: string) => {
				const charCount = text.length;
				const byteCount = new TextEncoder().encode(text).length;
				return [
					{
						label: 'Characters',
						labelZh: '字符数',
						value: String(charCount),
					},
					{
						label: 'UTF-8 Bytes',
						labelZh: '字节数 (UTF-8)',
						value: String(byteCount),
					},
				];
			},
			transforms: [
				{
					id: 'hash',
					label: 'Generate all hashes',
					labelZh: '计算全部哈希',
					run: async (text: string, secret = '') => {
						if (!text) return { output: '—' };
						const { hashBytes, HASH_ALGOS, hmacBytes } = await import('../scripts/tools/hashlib');
						const bytes = new TextEncoder().encode(text);
						const lines: string[] = [];
						for (const algo of HASH_ALGOS) lines.push(`${algo.padEnd(10)} ${await hashBytes(algo, bytes)}`);
						if (secret) {
							lines.push('', '-- HMAC --');
							for (const algo of (['SHA-256', 'SHA-384', 'SHA-512'] as const)) lines.push(`${algo.padEnd(10)} ${await hmacBytes(algo, secret, bytes)}`);
						}
						return { output: lines.join('\n') };
					},
				},
				{
					id: 'hmac',
					label: 'HMAC only',
					labelZh: '仅计算 HMAC',
					run: async (text: string, secret = '') => {
						if (!text) return { output: '', error: 'Enter text first.', errorZh: '请先输入文本。' };
						if (!secret) return { output: '', error: 'Enter the secret key above.', errorZh: '请先在上方输入密钥。' };
						const { hmacBytes } = await import('../scripts/tools/hashlib');
						const bytes = new TextEncoder().encode(text);
						const lines: string[] = [];
						for (const algo of (['SHA-256', 'SHA-384', 'SHA-512'] as const)) lines.push(`${algo.padEnd(10)} ${await hmacBytes(algo, secret, bytes)}`);
						return { output: lines.join('\n') };
					},
				},
				{
					id: 'hashLines',
					label: 'Hash each line (SHA-256)',
					labelZh: '逐行生成哈希 (SHA-256)',
					run: async (text: string) => {
						const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
						if (!lines.length) return { output: '', error: 'Enter at least one line.', errorZh: '请至少输入一行内容。' };
						const { hashBytes } = await import('../scripts/tools/hashlib');
						const out: string[] = [];
						for (const line of lines) out.push(`${line} → ${await hashBytes('SHA-256', new TextEncoder().encode(line))}`);
						return { output: out.join('\n') };
					},
				},
			],
		},
	},

	{
		slug: 'case-converter',
		category: 'devtools',
		name: 'Case & Naming Converter',
		nameZh: '大小写与命名风格转换器',
		description: 'Convert identifiers or sentences between camelCase, PascalCase, snake_case, kebab-case, CONSTANT_CASE and more.',
		descriptionZh: '标识符或句子在 camelCase、PascalCase、snake_case、kebab-case、常量与标题式之间互转。',
		kind: 'text',
		config: {
			def: 'user profile XMLHttpRequest api_key',
			placeholder: 'e.g. "user profile XMLHttp api_key"…',
			placeholderZh: '例如 "user profile XMLHttp api_key"…',
			transforms: [
				{
					id: 'camel',
					label: 'camelCase',
					labelZh: '驼峰 (camelCase)',
					run: (t) => ({ output: toCamel(t), error: t ? undefined : 'Enter text first.', errorZh: t ? undefined : '请先输入文本。' }),
				},
				{
					id: 'pascal',
					label: 'PascalCase',
					labelZh: '帕斯卡 (PascalCase)',
					run: (t) => ({ output: toPascal(t), error: t ? undefined : 'Enter text first.', errorZh: t ? undefined : '请先输入文本。' }),
				},
				{
					id: 'snake',
					label: 'snake_case',
					labelZh: '下划线 (snake_case)',
					run: (t) => ({ output: toSnake(t), error: t ? undefined : 'Enter text first.', errorZh: t ? undefined : '请先输入文本。' }),
				},
				{
					id: 'kebab',
					label: 'kebab-case',
					labelZh: '短横线 (kebab-case)',
					run: (t) => ({ output: toKebab(t), error: t ? undefined : 'Enter text first.', errorZh: t ? undefined : '请先输入文本。' }),
				},
				{
					id: 'constant',
					label: 'CONSTANT_CASE',
					labelZh: '常量 (CONSTANT_CASE)',
					run: (t) => ({ output: toConstant(t), error: t ? undefined : 'Enter text first.', errorZh: t ? undefined : '请先输入文本。' }),
				},
				{
					id: 'title',
					label: 'Title Case',
					labelZh: '标题式 (Title Case)',
					run: (t) => ({ output: toTitle(t), error: t ? undefined : 'Enter text first.', errorZh: t ? undefined : '请先输入文本。' }),
				},
				{
					id: 'sentence',
					label: 'Sentence case',
					labelZh: '句首大写 (Sentence case)',
					run: (t) => ({ output: toSentence(t), error: t ? undefined : 'Enter text first.', errorZh: t ? undefined : '请先输入文本。' }),
				},
				{
					id: 'upper',
					label: 'UPPERCASE',
					labelZh: '全大写',
					run: (t) => ({ output: t.toUpperCase(), error: t ? undefined : 'Enter text first.', errorZh: t ? undefined : '请先输入文本。' }),
				},
				{
					id: 'lower',
					label: 'lowercase',
					labelZh: '全小写',
					run: (t) => ({ output: t.toLowerCase(), error: t ? undefined : 'Enter text first.', errorZh: t ? undefined : '请先输入文本。' }),
				},
				{
					id: 'batch',
					label: 'Convert each line (all styles)',
					labelZh: '逐行转换 (四种风格对照)',
					// One row per input line, four naming styles side by side — batch mode is
					// exactly the 'not sure which style I need' moment, so show them all.
					run: (t) => {
						const r = runBatch(t, (line) => `${toCamel(line)} | ${toSnake(line)} | ${toKebab(line)} | ${toConstant(line)}`);
						if (!r.output) return r;
						return { output: `# input → camelCase | snake_case | kebab-case | CONSTANT_CASE\n${r.output}` };
					},
				},
			],
		} satisfies TextConfig,
	},

	{
		slug: 'line-organizer',
		category: 'devtools',
		name: 'Line Organizer (Dedupe · Sort · Clean)',
		nameZh: '文本行整理器（去重 · 排序 · 清理）',
		description: 'Clean up pasted lists in one click: remove duplicates, sort alphabetically or by length, trim whitespace and drop empty lines.',
		descriptionZh: '一键整理粘贴进来的列表：去除重复行、按字母或长度排序、去除行首尾空白与空行。',
		kind: 'text',
		config: {
			def: 'banana\napple\n  apple  \ncherry\n\nbanana\n42\n7',
			placeholder: 'Paste one item per line…',
			placeholderZh: '每行一条，粘贴待整理的列表…',
			mono: true,
			stats: (text: string) => {
				const lines = text.split('\n');
				const nonEmpty = lines.filter((l) => l.trim()).length;
				const unique = new Set(lines.map((l) => l.trim()).filter(Boolean)).size;
				return [
					{ label: 'Lines', labelZh: '总行数', value: String(lines.length) },
					{ label: 'Non-empty', labelZh: '非空行', value: String(nonEmpty) },
					{ label: 'Unique', labelZh: '去重后', value: String(unique) },
					{ label: 'Duplicates', labelZh: '重复行', value: String(nonEmpty - unique) },
				];
			},
			transforms: [
				{
					id: 'clean',
					label: 'Clean (trim · dedupe · drop empty)',
					labelZh: '一键清理（去空白 · 去重 · 删空行）',
					// The 90% case: paste a noisy list, get a clean one, order kept.
					run: (t) => {
						const seen = new Set<string>();
						const out: string[] = [];
						for (const line of t.split('\n')) {
							const s = line.trim();
							if (!s || seen.has(s)) continue;
							seen.add(s);
							out.push(s);
						}
						if (!out.length) return { output: '', error: 'Nothing to keep — the input is empty or blank.', errorZh: '没有可保留的内容——输入为空或全是空白。' };
						return { output: out.join('\n') };
					},
				},
				{
					id: 'dedupe',
					label: 'Remove duplicates',
					labelZh: '仅去重',
					run: (t) => {
						const seen = new Set<string>();
						const out: string[] = [];
						for (const line of t.split('\n')) {
							if (seen.has(line)) continue;
							seen.add(line);
							out.push(line);
						}
						return { output: out.join('\n') };
					},
				},
				{
					id: 'sortAz',
					label: 'Sort A → Z',
					labelZh: '排序 A → Z',
					// numeric: true so v2 sorts before v10; undefined stays last so
					// the blanks survive for the dedicated buttons to handle.
					run: (t) => ({
						output: t
							.split('\n')
							.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
						.join('\n'),
					}),
				},
				{
					id: 'sortZa',
					label: 'Sort Z → A',
					labelZh: '排序 Z → A',
					run: (t) => ({
						output: t
							.split('\n')
							.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
						.join('\n'),
					}),
				},
				{
					id: 'sortLen',
					label: 'Sort by length',
					labelZh: '按长度排序',
					run: (t) => ({
						output: t
							.split('\n')
							.sort((a, b) => a.length - b.length || a.localeCompare(b, undefined, { numeric: true }))
						.join('\n'),
					}),
				},
				{
					id: 'reverse',
					label: 'Reverse order',
					labelZh: '反转顺序',
					run: (t) => ({ output: t.split('\n').reverse().join('\n') }),
				},
				{
					id: 'removeEmpty',
					label: 'Remove empty lines',
					labelZh: '删除空行',
					run: (t) => ({ output: t.split('\n').filter((l) => l.trim()).join('\n') }),
				},
				{
					id: 'trim',
					label: 'Trim each line',
					labelZh: '去除行首尾空白',
					run: (t) => ({ output: t.split('\n').map((l) => l.trim()).join('\n') }),
				},
			],
		} satisfies TextConfig,
	},

	{
		slug: 'text-extractor',
		category: 'devtools',
		name: 'Text Extractor (URLs · Emails)',
		nameZh: '文本提取器（网址 · 邮箱）',
		description: 'Pull every URL and email address out of pasted text — logs, chat transcripts, pages of prose — one match per line, duplicates optional.',
		descriptionZh: '从粘贴的任意文本（日志、聊天记录、长文）中提取全部网址和邮箱地址，每行一条，可选择去重。',
		kind: 'text',
		config: {
			// Fictional sample data only (example.com, RFC 2606 domains).
			def: 'Contact alice@example.com or sales@example.org.\nDocs: https://docs.example.com/getting-started#install\nSee also www.example.net/pricing and https://example.dev/api\nReach bob.smith+support@example.io for help.',
			placeholder: 'Paste text with URLs or emails inside…',
			placeholderZh: '粘贴包含网址或邮箱的文本…',
			mono: true,
			stats: (text: string) => [
				{ label: 'URLs found', labelZh: '网址数', value: String((text.match(URL_RE_G) ?? []).length) },
				{ label: 'Emails found', labelZh: '邮箱数', value: String((text.match(EMAIL_RE_G) ?? []).length) },
				{ label: 'Characters', labelZh: '字符数', value: String(text.length) },
			],
			transforms: [
				{
					id: 'urls',
					label: 'Extract URLs',
					labelZh: '提取网址',
					run: (t) => extractMatches(t, URL_RE_G, 'URL'),
				},
				{
					id: 'emails',
					label: 'Extract emails',
					labelZh: '提取邮箱',
					run: (t) => extractMatches(t, EMAIL_RE_G, 'Email'),
				},
				{
					id: 'all',
					label: 'Extract all (unique)',
					labelZh: '全部提取（去重）',
					// Combined pass, deduped across both kinds — the "give me every
					// contact point in this dump" button.
					run: (t) => {
						const urls = t.match(URL_RE_G) ?? [];
						const emails = t.match(EMAIL_RE_G) ?? [];
						const all = [...urls, ...emails];
						if (!all.length) return { output: '', error: 'No URLs or emails found in the text.', errorZh: '文本中没有找到网址或邮箱。' };
						return { output: [...new Set(all)].join('\n') };
					},
				},
			],
		} satisfies TextConfig,
	},

	{
		slug: 'slug-generator',
		category: 'devtools',
		name: 'URL Slug Generator',
		nameZh: 'URL Slug 生成器',
		description: 'Turn any title into a clean SEO-friendly URL slug: lowercased, diacritics folded, punctuation collapsed to one separator. Chinese titles are kept as-is.',
		descriptionZh: '把任意标题转成干净的 SEO 友好 URL Slug：转小写、折叠变音符号、标点合并为单个分隔符，中文标题原样保留。',
		kind: 'text',
		config: {
			def: '10 Tips for Writing Better CSS!',
			placeholder: 'Type a title…',
			placeholderZh: '输入文章标题…',
			stats: (text: string) => [
				{ label: 'Characters', labelZh: '字符数', value: String(text.length) },
				{ label: 'Slug length', labelZh: 'Slug 长度', value: String(slugify(text, '-').length) },
			],
			transforms: [
				{
					id: 'hyphen',
					label: 'Slug (kebab-case)',
					labelZh: 'Slug（短横线）',
					run: (t) => {
						const s = slugify(t, '-');
						return s ? { output: s } : { output: '', error: 'Nothing to keep — the title has no letters, digits or CJK characters.', errorZh: '没有可保留的内容——标题里没有字母、数字或汉字。' };
					},
				},
				{
					id: 'underscore',
					label: 'Slug (snake_case)',
					labelZh: 'Slug（下划线）',
					run: (t) => {
						const s = slugify(t, '_');
						return s ? { output: s } : { output: '', error: 'Nothing to keep — the title has no letters, digits or CJK characters.', errorZh: '没有可保留的内容——标题里没有字母、数字或汉字。' };
					},
				},
			],
		} satisfies TextConfig,
	},

	{
		slug: 'json-diff',
		category: 'devtools',
		name: 'JSON Diff (Structural)',
		nameZh: 'JSON 结构化对比',
		description: 'Compare two JSON documents structurally: added, removed and changed values listed by path — key order and formatting differences are not noise.',
		descriptionZh: '结构化比较两个 JSON 文档：按路径列出新增、删除与变更的值——键顺序和格式差异不算噪音。',
		kind: 'form',
		config: {
			intro: 'Paste two JSON documents. The comparison is structural (parsed trees, not text), so reordered keys and different indentation do not show up as changes.',
			introZh: '粘贴两个 JSON 文档。比较基于解析后的树而非文本，键顺序不同、缩进不同都不会被当作变更。',
			fields: [
				{
					id: 'left',
					label: 'JSON A',
					labelZh: 'JSON A（左）',
					type: 'textarea',
					def: '{\n  "name": "example",\n  "version": "1.0.0",\n  "tags": ["a", "b"],\n  "price": 9.99\n}',
				},
				{
					id: 'right',
					label: 'JSON B',
					labelZh: 'JSON B（右）',
					type: 'textarea',
					def: '{\n  "version": "1.1.0",\n  "name": "example",\n  "tags": ["a", "b", "c"],\n  "price": 12.5,\n  "deprecated": false\n}',
				},
			],
			compute: (v) => {
				const row = (label: string, labelZh: string, value: string, valueZh = value) => ({ label, labelZh, value, valueZh });
				let a: unknown, b: unknown;
				try {
					a = JSON.parse(v.str('left'));
				} catch (e) {
					return { rows: [row('JSON A is invalid', 'JSON A 无效', e instanceof Error ? e.message : 'invalid JSON')] };
				}
				try {
					b = JSON.parse(v.str('right'));
				} catch (e) {
					return { rows: [row('JSON B is invalid', 'JSON B 无效', e instanceof Error ? e.message : 'invalid JSON')] };
				}
				const diffs = jsonDiff(a, b);
				if (!diffs.length) {
					return { rows: [row('Result', '结果', 'Identical — the two documents are structurally equal.', '完全一致——两个文档结构相等。')] };
				}
				const count = (k: JsonDiff['kind']) => diffs.filter((d) => d.kind === k).length;
				const capNote = diffs.length >= 200;
				return {
					rows: [
						row('Changed', '变更', String(count('changed'))),
						row('Added in B', 'B 中新增', String(count('added'))),
						row('Removed from A', 'A 中已删除', String(count('removed'))),
					],
					table: {
						columns: ['Path', 'Change', 'A value', 'B value'],
						columnsZh: ['路径', '变更类型', 'A 的值', 'B 的值'],
						rows: diffs.map((d) => [
							d.path,
							d.kind === 'added' ? '+ added' : d.kind === 'removed' ? '− removed' : '~ changed',
							d.a || '—',
							d.b || '—',
						]),
					},
					note: capNote
						? 'Showing the first 200 differences — the documents diverge massively.'
						: undefined,
					noteZh: capNote ? '仅显示前 200 条差异——两份文档差异过大。' : undefined,
				};
			},
		},
	},

	{
		slug: 'json-schema',
		category: 'devtools',
		name: 'JSON Schema Generator & Validator',
		nameZh: 'JSON Schema 生成与校验',
		description: 'Infer a draft-07 schema from a JSON document, then validate documents against it — errors listed by JSON path, all in your browser.',
		descriptionZh: '从 JSON 文档推导 draft-07 Schema，再据此校验其他文档——错误按 JSON 路径列出，全程浏览器本地。',
		kind: 'jsonschema',
	},

	{
		slug: 'http-status-lookup',
		category: 'devtools',
		name: 'HTTP Status Code Lookup',
		nameZh: 'HTTP 状态码查询',
		description: 'Look up any HTTP status code — or search by keyword ("redirect", "teapot", "timeout") — with meaning and typical causes in both languages.',
		descriptionZh: '查询任意 HTTP 状态码——也支持关键词搜索（"redirect"、"teapot"、"timeout"）——中英双语给出含义与常见原因。',
		kind: 'text',
		config: {
			def: '404',
			placeholder: 'A code (404) or keyword (redirect, timeout…)',
			placeholderZh: '状态码（404）或关键词（redirect、timeout…）',
			mono: true,
			stats: (text: string) => [
				{ label: 'Matching codes', labelZh: '匹配的状态码', value: String(matchStatuses(text).length) },
				{ label: 'Codes in reference', labelZh: '收录状态码', value: String(HTTP_STATUSES.length) },
			],
			transforms: [
				{
					id: 'lookup',
					label: 'Look up',
					labelZh: '查询',
					run: (t) => {
						const found = matchStatuses(t);
						if (!found.length)
							return { output: '', error: 'No status code matches — try a number (100-599) or a keyword like "redirect".', errorZh: '没有匹配的状态码——试试数字（100–599）或关键词，如 "redirect"。' };
						const blocks = found.slice(0, 8).map(
							(e) =>
								`${e.code} ${e.name} ${e.nameZh}\n` +
								`  Meaning 含义: ${e.meaning}\n  ${e.meaningZh}\n` +
								`  Typical causes 常见原因: ${e.cause}\n  ${e.causeZh}`,
						);
						return { output: blocks.join('\n\n') };
					},
				},
			],
		},
	},
	{
		slug: 'mime-type-lookup',
		category: 'devtools',
		name: 'MIME Type Lookup',
		nameZh: 'MIME 类型查询',
		description: 'Map file extensions to MIME types and back: .pdf ↔ application/pdf, .woff2 ↔ font/woff2 — with the practical notes servers actually need.',
		descriptionZh: '文件扩展名与 MIME 类型互查：.pdf ↔ application/pdf、.woff2 ↔ font/woff2——附服务器实践所需的备注。',
		kind: 'text',
		config: {
			def: '.pdf',
			placeholder: 'Extension (.pdf) or MIME type (application/pdf)',
			placeholderZh: '扩展名（.pdf）或 MIME 类型（application/pdf）',
			mono: true,
			stats: (text: string) => [{ label: 'Matching types', labelZh: '匹配的类型', value: String(matchMime(text).length) }],
			transforms: [
				{
					id: 'ext2mime',
					label: 'Extension → MIME',
					labelZh: '扩展名 → MIME',
					run: (t) => {
						const found = matchMime(t);
						if (!found.length) return noMime(t);
						return { output: found.map((m) => `.${m.ext.padEnd(14)} ${m.mime}${m.note ? `  (${m.note} · ${m.noteZh})` : ''}`).join('\n') };
					},
				},
				{
					id: 'mime2ext',
					label: 'MIME → extensions',
					labelZh: 'MIME → 扩展名',
					run: (t) => {
						const q = t.trim().toLowerCase();
						if (!q) return { output: '', error: 'Enter a MIME type (e.g. application/pdf).', errorZh: '请输入 MIME 类型（如 application/pdf）。' };
						const hits = MIME_MAP.filter((m) => m.mime === q);
						if (!hits.length) return noMime(t);
						return { output: hits.map((m) => `${m.mime} → .${m.ext}`).join('\n') };
					},
				},
			],
		},
	},
	{
		slug: 'user-agent-parser',
		category: 'devtools',
		name: 'User-Agent Parser',
		nameZh: 'User-Agent 解析器',
		description: 'Paste any User-Agent string and get browser, version, engine, operating system and device class — with crawler and bot detection.',
		descriptionZh: '粘贴任意 User-Agent 字符串，解析浏览器、版本、引擎、操作系统与设备类型——并识别爬虫与机器人。',
		kind: 'text',
		config: {
			def: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
			placeholder: 'Paste a User-Agent string…',
			placeholderZh: '粘贴 User-Agent 字符串…',
			mono: true,
			stats: (text: string) => {
				const ua = parseUa(text);
				if (!ua) return [{ label: 'Status', labelZh: '状态', value: '— (paste a UA string)' }];
				return [
					{ label: 'Browser', labelZh: '浏览器', value: ua.browser },
					{ label: 'OS', labelZh: '操作系统', value: ua.os },
					{ label: 'Device', labelZh: '设备类型', value: ua.device },
					...(ua.bot ? [{ label: 'Bot', labelZh: '爬虫', value: 'YES' }] : []),
				];
			},
			transforms: [
				{
					id: 'report',
					label: 'Full report',
					labelZh: '完整报告',
					run: (t) => {
						const ua = parseUa(t);
						if (!ua) return { output: '', error: 'Paste a User-Agent string first.', errorZh: '请先粘贴 User-Agent 字符串。' };
						const lines = [
							['Browser 浏览器', `${ua.browser} / ${ua.browserZh}${ua.version ? ` · v${ua.version}` : ''}`],
							['Engine 引擎', `${ua.engine} / ${ua.engineZh}`],
							['OS 操作系统', `${ua.os} / ${ua.osZh}`],
							['Device 设备', `${ua.device} / ${ua.deviceZh}`],
							['Bot 爬虫', ua.bot ? 'YES · detected as a bot' : 'NO · human-facing browser'],
						];
						return { output: lines.map(([l, v]) => `${l.padEnd(24)} ${v}`).join('\n') };
					},
				},
			],
		},
	},
	{
		slug: 'media-info',
		category: 'devtools',
		name: 'Media Info (Video · Audio Metadata)',
		nameZh: '媒体信息查看器（视频/音频元数据）',
		description: 'Drop an MP4/MOV, WebM/MKV or WAV file and read codec, resolution, duration, frame rate and audio channels — parsed byte-by-byte in your browser, never uploaded.',
		descriptionZh: '拖入 MP4/MOV、WebM/MKV 或 WAV 文件，读取编码、分辨率、时长、帧率与音频声道——逐字节本地解析，绝不上传。',
		kind: 'text',
		config: {
			placeholder: 'Drop a media file onto this box — or pick one below…',
			placeholderZh: '把媒体文件拖到此框——或点击下方按钮选择…',
			mono: true,
			// Binary path: bytes straight into the box parsers (MP4 boxes, EBML,
			// RIFF), with the browser's own media stack as a fallback. The bytes
			// never leave the page.
			fileTransform: async (data, name, size) => {
				const { mediaInfo } = await import('../scripts/tools/mediainfo');
				return mediaInfo(data, name, size);
			},
			transforms: [
				{
					id: 'how',
					label: 'How it works',
					labelZh: '工作原理',
					run: () => ({
						output:
							'Drop a file (or use the 📄 button). The bytes are parsed locally:\n' +
							'  · MP4 / MOV — ISO-BMFF boxes (ftyp / moov / trak / stsd / stts)\n' +
							'  · WebM / MKV — EBML elements (Duration / Tracks / CodecID)\n' +
							'  · WAV — RIFF fmt/data chunks\n' +
							'Unknown containers fall back to the browser\u2019s decoder for what it can read.\n' +
							'\n文件拖入后完全本地解析：MP4/MOV 走 box 结构，WebM/MKV 走 EBML，WAV 读 RIFF 头；未知容器由浏览器解码兜底。文件不会上传。',
					}),
				},
			],
		},
	},
	{
		slug: 'robots-txt-generator',
		category: 'devtools',
		name: 'robots.txt Generator & Validator',
		nameZh: 'robots.txt 生成与校验',
		description: 'Write rules in a simple line format (user-agent / disallow / allow / sitemap) and get a valid robots.txt — or lint an existing one for typos and order mistakes.',
		descriptionZh: '用简单的行格式（user-agent / disallow / allow / sitemap）书写规则并生成合法的 robots.txt——或校验现有文件，揪出拼写与顺序错误。',
		kind: 'text',
		config: {
			def: 'user-agent: *\ndisallow: /admin\ndisallow: /private/\nallow: /private/public/\n\nuser-agent: GPTBot\ndisallow: /\n\nsitemap: https://example.com/sitemap.xml',
			placeholder: 'user-agent: *\ndisallow: /private',
			placeholderZh: 'user-agent: *\ndisallow: /private',
			mono: true,
			live: false,
			transforms: [
				{
					id: 'generate',
					label: 'Generate robots.txt',
					labelZh: '生成 robots.txt',
					run: (t) => {
						const { output, errors } = robotsFromDsl(t);
						if (errors.length) return { output: '', error: errors[0], errorZh: errors[1] ?? errors[0] };
						return { output };
					},
				},
				{
					id: 'validate',
					label: 'Validate / lint',
					labelZh: '校验 / 检查',
					run: (t) => {
						const problems = lintRobots(t);
						if (!problems.length)
							return { output: '✓ No problems found — directives, order and sitemap all check out.\n✓ 未发现问题——指令、顺序与 sitemap 均合规。' };
						return { output: problems.join('\n') };
					},
				},
			],
		},
	},
	{
		slug: 'sitemap-xml-generator',
		category: 'devtools',
		name: 'sitemap.xml Generator & Validator',
		nameZh: 'sitemap.xml 生成与校验',
		description: 'Paste one URL per line (optionally "url, lastmod") and get a valid sitemap.xml — or validate a pasted sitemap: URL count, limits, malformed entries.',
		descriptionZh: '每行一个 URL（可选 "url, lastmod"）生成合法 sitemap.xml——或校验粘贴的 sitemap：URL 数量、上限与格式问题。',
		kind: 'text',
		config: {
			def: 'https://example.com/\nhttps://example.com/about\nhttps://example.com/tools, 2026-09-01',
			placeholder: 'https://example.com/page\nhttps://example.com/other, 2026-09-01',
			placeholderZh: 'https://example.com/page\nhttps://example.com/other, 2026-09-01',
			mono: true,
			transforms: [
				{
					id: 'generate',
					label: 'Generate sitemap.xml',
					labelZh: '生成 sitemap.xml',
					run: (t) => {
						const entries = t
							.split('\n')
							.map((l) => l.trim())
							.filter(Boolean)
							.map((l) => {
								const [url, lastmod] = l.split(',').map((s) => s.trim());
								return { url: url ?? '', lastmod };
							});
						const bad = entries.filter((e) => !/^https?:\/\//.test(e.url));
						if (!entries.length) return { output: '', error: 'Enter at least one URL.', errorZh: '请至少输入一个 URL。' };
						if (bad.length) return { output: '', error: `These lines are not absolute URLs: ${bad.slice(0, 3).map((e) => e.url).join(', ')}`, errorZh: `以下行不是绝对 URL：${bad.slice(0, 3).map((e) => e.url).join('、')}` };
						const urls = [...new Set(entries.map((e) => e.url))];
						const xml =
							'<?xml version="1.0" encoding="UTF-8"?>\n' +
							'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
							urls
								.map((url) => {
									const e = entries.find((x) => x.url === url) as { url: string; lastmod?: string };
									return `  <url>\n    <loc>${escXml(url)}</loc>\n${e.lastmod ? `    <lastmod>${e.lastmod}</lastmod>\n` : ''}  </url>`;
								})
								.join('\n') +
							'\n</urlset>\n';
						return { output: `${urls.length} URLs · ${humanCount(xml.length)}\n\n${xml}` };
					},
				},
				{
					id: 'validate',
					label: 'Validate sitemap.xml',
					labelZh: '校验 sitemap.xml',
					run: (t) => {
						const locs = [...t.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
						if (!locs.length) return { output: '', error: 'No <loc> entries found — paste a sitemap.xml to validate.', errorZh: '未找到 <loc> 条目——请粘贴待校验的 sitemap.xml。' };
						const bad = locs.filter((u) => !/^https?:\/\//.test(u));
						const lines = [
							`URLs URL 数: ${locs.length}${locs.length > 50000 ? '  ⚠ over the 50,000 limit · 超过 5 万上限!' : ''}`,
							`Unique 去重后: ${new Set(locs).size}`,
							`Non-absolute 非绝对 URL: ${bad.length}${bad.length ? ` (${bad.slice(0, 3).join(', ')})` : ''}`,
						];
						return { output: lines.join('\n') };
					},
				},
			],
		},
	},
	{
		slug: 'meta-tag-generator',
		category: 'devtools',
		name: 'Meta Tag Generator & OG Preview',
		nameZh: 'Meta 标签生成与 OG 预览',
		description: 'Fill in title, description, URL and image — get the full <head> tag block (meta + Open Graph + Twitter) with a live social share card preview.',
		descriptionZh: '填写标题、描述、URL 与图片——生成完整 <head> 标签块（meta + Open Graph + Twitter），并实时预览社交分享卡片。',
		kind: 'meta',
	},

	{
		slug: 'port-lookup',
		category: 'devtools',
		name: 'Port Lookup (TCP / UDP)',
		nameZh: '网络端口查询',
		description: 'Look up well-known ports by number or service name — SSH, MySQL, Redis, Kubernetes — with security notes on the ones that get you pwned.',
		descriptionZh: '按端口号或服务名查询常用端口——SSH、MySQL、Redis、Kubernetes——并给高危端口附安全提示。',
		kind: 'text',
		config: {
			def: '6379',
			placeholder: 'A port (6379) or a service name (mysql, ssh…)',
			placeholderZh: '端口号（6379）或服务名（mysql、ssh…）',
			mono: true,
			stats: (text: string) => [
				{ label: 'Matching ports', labelZh: '匹配的端口', value: String(matchPorts(text).length) },
				{ label: 'Ports in reference', labelZh: '收录端口', value: String(PORTS.length) },
			],
			transforms: [
				{
					id: 'lookup',
					label: 'Look up',
					labelZh: '查询',
					run: (t) => {
						const found = matchPorts(t);
						if (!found.length)
							return { output: '', error: 'No port matches — try a number (1-65535) or a service name like "mysql".', errorZh: '没有匹配的端口——试试数字（1–65535）或服务名，如 "mysql"。' };
						return {
							output: found
								.slice(0, 10)
								.map(
									(p) =>
										`${String(p.port).padEnd(6)} ${p.proto.padEnd(4)} ${p.service} ${p.serviceZh}` +
										(p.note ? `\n              ${p.note} · ${p.noteZh}` : ''),
								)
								.join('\n'),
						};
					},
				},
			],
		},
	},
	{
		slug: 'lossless-checker',
		category: 'devtools',
		name: 'Fake-Lossless Detector (Audio Spectrum)',
		nameZh: '真假无损音乐判别（频谱分析）',
		description: 'Drop a FLAC/WAV file and check whether it is truly lossless: lossy MP3/AAC transcodes leave a frequency ceiling that a real CD rip does not have.',
		descriptionZh: '拖入 FLAC/WAV 文件判别是否真无损：MP3/AAC 有损转码会留下频率天花板，真 CD 抓轨则延伸到奈奎斯特频率。',
		kind: 'text',
		config: {
			placeholder: 'Drop an audio file onto this box — or pick one below…',
			placeholderZh: '把音频文件拖到此框——或点击下方按钮选择…',
			mono: true,
			// The file is decoded by the browser's own audio stack and FFT'd in
			// the page; nothing is uploaded.
			fileTransform: async (data, name) => {
				const { losslessCheck } = await import('../scripts/tools/lossless');
				return losslessCheck(data, name);
			},
			transforms: [
				{
					id: 'how',
					label: 'How it works',
					labelZh: '工作原理',
					run: () => ({
						output:
							'Drop a file (or use the 📄 button). The audio is decoded locally and the loudest windows are FFT-analysed:\n' +
							'  · true lossless: energy reaches ~22 kHz (the CD Nyquist limit)\n' +
							'  · MP3/AAC transcode: a hard ceiling at ~16-20 kHz (lower bitrate = lower ceiling)\n' +
							'\nHeuristic 判定为启发式：部分真无损母带高频本就偏少，请结合截止频率本身判断。文件全程本地解码，绝不上传。',
					}),
				},
			],
		},
	},
	{
		slug: 'css-clamp',
		category: 'devtools',
		name: 'CSS clamp() Calculator',
		nameZh: 'CSS clamp() 计算器',
		description: 'Generate a responsive clamp() from min/max viewport widths and font sizes — fluid type with hard floors and ceilings, in px or rem, with sample values at real breakpoints.',
		descriptionZh: '由最小/最大视口与字号生成响应式 clamp()——带下限上限的流式字号，支持 px 或 rem，附真实断点的取值示例。',
		kind: 'form',
		config: {
			intro: 'Sizes scale linearly between the two viewports and never leave the [min, max] range.',
			introZh: '字号在两个视口之间线性变化，且永远不超出 [最小, 最大] 区间。',
			fields: [
				{ id: 'minVw', label: 'Min viewport', labelZh: '最小视口', suffix: '(px)', type: 'number', def: '375', step: 'any', required: true },
				{ id: 'maxVw', label: 'Max viewport', labelZh: '最大视口', suffix: '(px)', type: 'number', def: '1440', step: 'any', required: true },
				{ id: 'minSize', label: 'Font size at min viewport', labelZh: '最小视口字号', suffix: '(px)', type: 'number', def: '16', step: 'any', required: true },
				{ id: 'maxSize', label: 'Font size at max viewport', labelZh: '最大视口字号', suffix: '(px)', type: 'number', def: '24', step: 'any', required: true },
			],
			compute: (v) => {
				const row = (label: string, labelZh: string, value: string, valueZh = value) => ({ label, labelZh, value, valueZh });
				const minVw = v.num('minVw');
				const maxVw = v.num('maxVw');
				const minSize = v.num('minSize');
				const maxSize = v.num('maxSize');
				if (!(maxVw > minVw) || !Number.isFinite(minSize) || !Number.isFinite(maxSize))
					return { rows: [row('Result', '结果', '— (max viewport must exceed min viewport)', '—（最大视口需大于最小视口）')] };
				const slope = (maxSize - minSize) / (maxVw - minVw);
				const px = `clamp(${minSize}px, calc(${(minSize - slope * minVw).toFixed(2)}px + ${(slope * 100).toFixed(4)}vw), ${maxSize}px)`;
				const rem16 = (n: number): string => (n / 16).toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
				const rem = `clamp(${rem16(minSize)}rem, calc(${rem16(minSize)}rem + ${(rem16(maxSize - minSize))} * (100vw - ${minVw}px) / ${maxVw - minVw}), ${rem16(maxSize)}rem)`;
				const at = (vw: number): string => `${Math.round(minSize + slope * (vw - minVw))}px @ ${vw}px`;
				return {
					rows: [
						row('At 320px', '320px 时', at(320)),
						row('At 768px', '768px 时', at(768)),
						row('At 1920px', '1920px 时', at(1920)),
						row('Slope', '斜率', `${(slope * 100).toFixed(4)}vw / 100px`),
					],
					// The generated CSS is code — identical in both views, so it
					// rides in the note (which allows same-content halves) rather
					// than a value row (whose zh half must not carry Latin words).
					note: `${px}\n${rem}`,
					noteZh: `${px}\n${rem}`,
				};
			},
		},
	},
	{
		slug: 'wcag-contrast',
		category: 'devtools',
		name: 'WCAG Contrast Checker',
		nameZh: 'WCAG 颜色对比度检查',
		description: 'Check a foreground/background pair against WCAG 2.1: the exact contrast ratio plus pass/fail for AA and AAA on normal text, large text and UI components.',
		descriptionZh: '检查前景/背景色组合是否满足 WCAG 2.1：精确对比度，以及正文、大字号、界面组件的 AA 与 AAA 判定。',
		kind: 'form',
		config: {
			intro: 'AA needs 4.5:1 (normal text) or 3:1 (large text); AAA needs 7:1 or 4.5:1. UI components and focus rings need 3:1.',
			introZh: 'AA 要求 4.5:1（正文）或 3:1（大字号）；AAA 要求 7:1 或 4.5:1。界面组件与焦点框要求 3:1。',
			fields: [
				{ id: 'fg', label: 'Foreground color', labelZh: '前景色', type: 'text', def: '#767676', placeholder: '#767676 or 767676', required: true },
				{ id: 'bg', label: 'Background color', labelZh: '背景色', type: 'text', def: '#ffffff', placeholder: '#ffffff', required: true },
			],
			compute: (v) => {
				const row = (label: string, labelZh: string, value: string, valueZh = value) => ({ label, labelZh, value, valueZh });
				const parse = (s: string): [number, number, number] | null => {
					const h = s.trim().replace(/^#/, '');
					if (/^[0-9a-f]{3}$/i.test(h))
						return [parseInt(h[0]! + h[0]!, 16), parseInt(h[1]! + h[1]!, 16), parseInt(h[2]! + h[2]!, 16)];
					if (/^[0-9a-f]{6}$/i.test(h))
						return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
					return null;
				};
				const fg = parse(v.str('fg'));
				const bg = parse(v.str('bg'));
				if (!fg || !bg)
					return { rows: [row('Result', '结果', '— (colors must be hex, e.g. #767676)', '—（颜色须为十六进制，如 #767676）')] };
				const lum = ([r, g, b]: [number, number, number]): number => {
					const lin = (c: number): number => {
						const s = c / 255;
						return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
					};
					return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
				};
				const l1 = lum(fg);
				const l2 = lum(bg);
				const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
				const r = Math.round(ratio * 100) / 100;
				const verdict = (need: number, en: string, zh: string) =>
					ratio >= need
						? { label: en, labelZh: zh, value: `✓ pass (${r}:1 ≥ ${need}:1)`, valueZh: `✓ 通过（${r}:1 ≥ ${need}:1）` }
						: { label: en, labelZh: zh, value: `✗ fail (${r}:1 < ${need}:1)`, valueZh: `✗ 未通过（${r}:1 < ${need}:1）` };
				return {
					rows: [
						{ label: 'Contrast ratio', labelZh: '对比度', value: `${r}:1`, emphasis: true },
						verdict(4.5, 'AA — normal text', 'AA——正文'),
						verdict(3, 'AA — large text (≥18.7px bold / 24px)', 'AA——大字号（≥18.7px 粗体 / 24px）'),
						verdict(7, 'AAA — normal text', 'AAA——正文'),
						verdict(4.5, 'AAA — large text', 'AAA——大字号'),
						verdict(3, 'UI components & focus indicators', '界面组件与焦点指示'),
					],
				};
			},
		},
	},
	{
		slug: 'color-palette',
		category: 'devtools',
		name: 'Color Palette Generator',
		nameZh: '配色方案生成器',
		description: 'Build a five-swatch palette from one base color: complementary, analogous, triadic, split-complementary or monochrome — shown as actual swatches with hex codes.',
		descriptionZh: '从一个基准色生成五色配色：互补、邻近、三角、分裂互补或单色——以真实色块展示并附十六进制码。',
		kind: 'form',
		config: {
			intro: 'The base color is always the middle swatch; the harmony rotates hue and adjusts lightness/saturation around it.',
			introZh: '基准色固定为中间色块；其余颜色按和谐规则旋转色相并调整明度饱和度。',
			fields: [
				{ id: 'base', label: 'Base color', labelZh: '基准色', type: 'text', def: '#3b82f6', placeholder: '#3b82f6', required: true },
				{
					id: 'harmony',
					label: 'Harmony',
					labelZh: '配色和谐',
					type: 'select',
					def: 'analogous',
					options: [
						{ value: 'analogous', label: 'Analogous (±30°)' },
						{ value: 'complementary', label: 'Complementary (180°)' },
						{ value: 'triadic', label: 'Triadic (±120°)' },
						{ value: 'split', label: 'Split-complementary (150°/210°)' },
						{ value: 'monochrome', label: 'Monochrome' },
					],
				},
			],
			compute: (v) => {
				const row = (label: string, labelZh: string, value: string, valueZh = value) => ({ label, labelZh, value, valueZh });
				const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v.str('base').trim());
				if (!m) return { rows: [row('Result', '结果', '— (base color must be hex, e.g. #3b82f6)', '—（基准色须为十六进制，如 #3b82f6）')] };
				const h = m[1]!;
				const rgb: [number, number, number] =
					h.length === 3
						? [parseInt(h[0]! + h[0]!, 16), parseInt(h[1]! + h[1]!, 16), parseInt(h[2]! + h[2]!, 16)]
						: [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
				// rgb -> hsl
				const [r, g, b] = rgb.map((c) => c / 255) as [number, number, number];
				const max = Math.max(r, g, b);
				const min = Math.min(r, g, b);
				const l = (max + min) / 2;
				const d = max - min;
				const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
				let hue = 0;
				if (d !== 0) {
					if (max === r) hue = 60 * (((g - b) / d) % 6);
					else if (max === g) hue = 60 * ((b - r) / d + 2);
					else hue = 60 * ((r - g) / d + 4);
				}
				if (hue < 0) hue += 360;
				const hslToHex = (hh: number, ss: number, ll: number): string => {
					const c = (1 - Math.abs(2 * ll - 1)) * ss;
					const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
					const mo = ll - c / 2;
					let rr = 0;
					let gg = 0;
					let bb = 0;
					if (hh < 60) [rr, gg, bb] = [c, x, 0];
					else if (hh < 120) [rr, gg, bb] = [x, c, 0];
					else if (hh < 180) [rr, gg, bb] = [0, c, x];
					else if (hh < 240) [rr, gg, bb] = [0, x, c];
					else if (hh < 300) [rr, gg, bb] = [x, 0, c];
					else [rr, gg, bb] = [c, 0, x];
					const to = (n: number): string => Math.round((n + mo) * 255).toString(16).padStart(2, '0');
					return `#${to(rr)}${to(gg)}${to(bb)}`;
				};
				const harmony = v.str('harmony');
				let swatches: string[];
				if (harmony === 'monochrome') {
					swatches = [hslToHex(hue, Math.min(1, s * 1.1), 0.88), hslToHex(hue, s, 0.72), hslToHex(hue, s, l), hslToHex(hue, s, 0.35), hslToHex(hue, s, 0.18)];
				} else if (harmony === 'analogous') {
					swatches = [hslToHex((hue + 330) % 360, s, Math.min(0.85, l + 0.12)), hslToHex((hue + 340) % 360, s, l), hslToHex(hue, s, l), hslToHex((hue + 20) % 360, s, l), hslToHex((hue + 30) % 360, s, Math.max(0.2, l - 0.12))];
				} else if (harmony === 'complementary') {
					swatches = [hslToHex(hue, s, 0.92), hslToHex(hue, s * 0.5, l), hslToHex(hue, s, l), hslToHex((hue + 180) % 360, s, l), hslToHex((hue + 180) % 360, s, 0.3)];
				} else if (harmony === 'triadic') {
					swatches = [hslToHex((hue + 120) % 360, s, 0.85), hslToHex(hue, s, l), hslToHex((hue + 240) % 360, s, l), hslToHex((hue + 120) % 360, s, l), hslToHex((hue + 240) % 360, s, 0.3)];
				} else {
					swatches = [hslToHex((hue + 150) % 360, s, 0.85), hslToHex(hue, s, l), hslToHex((hue + 210) % 360, s, l), hslToHex((hue + 150) % 360, s, 0.4), hslToHex((hue + 210) % 360, s, 0.25)];
				}
				// chartSvg swatch strip: rects + hex labels under each
				const W = 120;
				const svg =
					`<svg viewBox="0 0 ${5 * W} 150" xmlns="http://www.w3.org/2000/svg" role="img">` +
					swatches
						.map(
							(hex, i) =>
								`<rect x="${i * W}" y="0" width="${W}" height="110" fill="${hex}"/>` +
								`<text x="${i * W + W / 2}" y="135" text-anchor="middle" font-family="var(--font-mono, monospace)" font-size="15" fill="currentColor">${hex}</text>`,
						)
						.join('') +
					`</svg>`;
				return {
					rows: [row('Base color', '基准色', `#${h.toLowerCase()}`)],
					// hex codes are language-neutral; the note accepts identical
					// halves, a value row's zh half would not.
					note: swatches.join('  '),
					noteZh: swatches.join('  '),
					chartSvg: svg,
				};
			},
		},
	},

	{
		slug: 'browser-info',
		category: 'devtools',
		name: 'Browser & Hardware Info',
		nameZh: '浏览器与硬件信息',
		description: 'Read what the browser knows about this machine — CPU cores, memory, GPU, screen, network, codec support — and copy it as a report. Nothing is sent anywhere; the page just prints its own APIs.',
		descriptionZh: '读取浏览器可知的本机信息——CPU 核数、内存、GPU、屏幕、网络、解码支持——一键生成可复制报告。纯本地读取，不向任何地方发送。',
		kind: 'text',
		config: {
			placeholder: 'Click "Scan this browser" below — the report fills in here…',
			placeholderZh: '点击下方"扫描本机浏览器"——报告将显示在此处…',
			mono: true,
			transforms: [
				{
					id: 'scan',
					label: 'Scan this browser',
					labelZh: '扫描本机浏览器',
					// Every field below is a standard browser API reading — the
					// report is literally the page describing itself, client-side.
					run: async () => {
						const nav = navigator as Navigator & {
							hardwareConcurrency?: number;
							deviceMemory?: number;
							connection?: { effectiveType?: string; downlink?: number; rtt?: number };
							userAgentData?: { platform?: string };
						};
						const L = (label: string, value: string): string => `${label.padEnd(30)} ${value}`;
						const lines: string[] = [];
						// --- browser / engine (reuse the UA parser) ---
						const ua = parseUa(nav.userAgent);
						if (ua) {
							lines.push(L('Browser 浏览器', `${ua.browser} / ${ua.browserZh}${ua.version ? ` · v${ua.version}` : ''}`));
							lines.push(L('Engine 引擎', `${ua.engine} / ${ua.engineZh}`));
							lines.push(L('OS 操作系统', `${ua.os} / ${ua.osZh}`));
							lines.push(L('Device 设备', `${ua.device} / ${ua.deviceZh}`));
						}
						lines.push(L('Platform 平台', nav.userAgentData?.platform ?? nav.platform ?? '—'));
						lines.push(L('Languages 语言', nav.languages?.join(', ') ?? nav.language));
						lines.push(L('Time zone 时区', Intl.DateTimeFormat().resolvedOptions().timeZone ?? '—'));
						// --- hardware ---
						lines.push(L('CPU cores 逻辑核心', String(nav.hardwareConcurrency ?? '—')));
						lines.push(L('Device memory 设备内存', nav.deviceMemory ? `~${nav.deviceMemory} GB (browser caps at 8)` : '— (not exposed)'));
						lines.push(L('Touch points 触控点', String(nav.maxTouchPoints ?? 0)));
						// --- screen ---
						const s = screen;
						lines.push(L('Screen 屏幕', `${s.width}×${s.height} @ ${s.colorDepth}-bit`));
						lines.push(L('Available 可用区域', `${s.availWidth}×${s.availHeight}`));
						lines.push(L('Pixel ratio 像素比', String(window.devicePixelRatio)));
						// --- GPU via WebGL ---
						try {
							const canvas = document.createElement('canvas');
							const gl = (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) as WebGLRenderingContext | null;
							if (gl) {
								const ext = gl.getExtension('WEBGL_debug_renderer_info');
								const renderer = ext ? (gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) as string) : (gl.getParameter(gl.RENDERER) as string);
								lines.push(L('GPU 显卡', renderer || '—'));
							} else lines.push(L('GPU 显卡', '— (WebGL unavailable)'));
						} catch {
							lines.push(L('GPU 显卡', '— (WebGL blocked)'));
						}
						// --- network ---
						const conn = nav.connection;
						if (conn) lines.push(L('Network 网络', `${conn.effectiveType ?? '—'}${conn.downlink ? ` · ~${conn.downlink} Mbps` : ''}${conn.rtt ? ` · ${conn.rtt} ms RTT` : ''}`));
						else lines.push(L('Network 网络', '— (not exposed)'));
						// --- storage ---
						try {
							const est = await navigator.storage.estimate();
							if (est.quota) lines.push(L('Storage quota 存储配额', `${(est.quota / 1024 ** 3).toFixed(1)} GB (used ${((est.usage ?? 0) / 1024 ** 2).toFixed(0)} MB)`));
						} catch { /* API absent — skip silently */ }
						// --- preferences ---
						lines.push(L('Color scheme 配色偏好', matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
						lines.push(L('Reduced motion 减少动效', matchMedia('(prefers-reduced-motion: reduce)').matches ? 'yes' : 'no'));
						// --- codec support: the honest answer for "can my browser play HEVC?" ---
						const v = document.createElement('video');
						const a = document.createElement('audio');
						const can = (el: HTMLMediaElement, type: string): string => {
							const r = el.canPlayType(type);
							return r === 'probably' ? '✓' : r === 'maybe' ? '(maybe)' : '✗';
						};
						const codecs: [string, string][] = [
							['H.264 / AVC', 'video/mp4; codecs="avc1.42E01E"'],
							['H.265 / HEVC', 'video/mp4; codecs="hvc1.1.6.L93.B0"'],
							['VP9', 'video/webm; codecs="vp9"'],
							['AV1', 'video/mp4; codecs="av01.0.05M.08"'],
							['AAC', 'audio/mp4; codecs="mp4a.40.2"'],
							['MP3', 'audio/mpeg'],
							['Opus', 'audio/webm; codecs="opus"'],
							['FLAC', 'audio/flac'],
						];
						lines.push('', '--- Codec support 解码支持 ---');
						for (const [name, type] of codecs) {
							const el = name === 'MP3' || name === 'AAC' || name === 'Opus' || name === 'FLAC' ? a : v;
							lines.push(L(name, can(el, type)));
						}
						lines.push('', '🔒 Everything above was read locally 报告完全本地生成，未向任何服务器发送。');
						return { output: lines.join('\n') };
					},
				},
			],
		},
	},

	{
		slug: 'html-entity-escaper',
		category: 'devtools',
		name: 'HTML Entity Escape / Unescape',
		nameZh: 'HTML 实体转义工具',
		description: 'Escape text to HTML entities (&amp; &lt; &quot;) or unescape named and numeric entities back to characters.',
		descriptionZh: '把文本转义为 HTML 实体，或将命名实体与数字实体还原为字符。',
		kind: 'text',
		config: {
			def: '<a href="https://example.com">Alice &amp; Bob</a>',
			placeholder: 'Text to escape, or entities to decode…',
			placeholderZh: '待转义的文本，或待解码的 HTML 实体…',
			mono: true,
			live: true,
			transforms: [
				{
					id: 'escape',
					label: 'Escape → entities',
					labelZh: '转义为 HTML 实体',
					run: (t) => ({ output: escapeEntities(t), error: t ? undefined : 'Enter text first.', errorZh: t ? undefined : '请先输入文本。' }),
				},
				{
					id: 'unescape',
					label: 'Unescape ← entities',
					labelZh: '实体还原为文本',
					run: (t) => {
						const r = unescapeEntities(t);
						return r !== null
							? { output: r }
							: { output: '', error: 'Contains an unknown entity.', errorZh: '包含无法识别的实体。' };
					},
				},
			],
		} satisfies TextConfig,
	},


	{
		slug: 'number-base-converter',
		category: 'devtools',
		name: 'Number Base Converter',
		nameZh: '进制转换器 (2 / 8 / 10 / 16)',
		description: 'Convert integers between binary, octal, decimal and hexadecimal. Big values are handled with BigInt, so nothing rounds.',
		descriptionZh: '在二进制、八进制、十进制与十六进制之间互转整数；大数用 BigInt 全程无精度损失。',
		kind: 'form',
		config: {
			fields: [
				{
					id: 'base',
					label: 'Source base',
					labelZh: '源进制',
					type: 'select',
					def: '16',
					options: [
						{ value: '2', label: 'Binary (2)', labelZh: '二进制 (2)' },
						{ value: '8', label: 'Octal (8)', labelZh: '八进制 (8)' },
						{ value: '10', label: 'Decimal (10)', labelZh: '十进制 (10)' },
						{ value: '16', label: 'Hexadecimal (16)', labelZh: '十六进制 (16)' },
					],
				},
				{
					id: 'number',
					label: 'Number in source base',
					labelZh: '源进制下的数字',
					// textarea: one value per line — several lines switch the compute
					// into a batch table (one row per input), a single line stays on
					// the full per-base breakdown.
					type: 'textarea',
					def: 'ff',
					placeholder: 'e.g. ff, 255, 11111111 — or one per line for batch',
					placeholderZh: '例如 ff、255、11111111——批量时每行一个',
					required: true,
				},
			],
			compute: (v) => {
				const base = Number(v.str('base') || '16');
				const raw = v.str('number');
				// Batch: one value per line, one result row per value. A bad line is
				// marked invalid without sinking the rest of the list.
				const lines = raw.split('\n').map((s) => s.trim()).filter((s) => s.length > 0);
				if (lines.length > 1) {
					return {
						rows: [
							{
								label: 'Batch result',
								labelZh: '批量结果',
								value: `${lines.length} values from base ${base}`,
								valueZh: `共 ${lines.length} 个数值（${base} 进制）`,
								emphasis: true,
							},
						],
						table: {
							columns: ['Input', 'Binary', 'Octal', 'Decimal', 'Hexadecimal'],
							columnsZh: ['输入', '二进制', '八进制', '十进制', '十六进制'],
							rows: lines.map((line) => {
								const n = parseBigInt(line, base);
								if (n === null) return [line, '—', '—', '—', '✗ invalid'];
								return [line, bigToBase(n, 2), bigToBase(n, 8), bigToBase(n, 10), '0x' + bigToBase(n, 16)];
							}),
						},
					};
				}
				const n = parseBigInt(raw, base);
				if (n === null) {
					return {
						rows: [
							{
								label: 'Result',
								labelZh: '计算结果',
								value: `— (${raw || 'empty'} is not valid in base ${base})`,
								valueZh: `— (输入在 ${base} 进制下含有不合法字符)`,
							},
						],
					};
				}
				return {
					rows: [
						{ label: 'Binary', labelZh: '二进制', value: bigToBase(n, 2), valueZh: bigToBase(n, 2) },
						{ label: 'Octal', labelZh: '八进制', value: bigToBase(n, 8), valueZh: bigToBase(n, 8) },
						{ label: 'Decimal', labelZh: '十进制', value: bigToBase(n, 10), valueZh: bigToBase(n, 10) },
						{
							label: 'Hexadecimal',
							labelZh: '十六进制',
							value: '0x' + bigToBase(n, 16),
							valueZh: bigToBase(n, 16),
						},
					],
				};
			},
		},
	},

	{
		slug: 'unix-timestamp',
		category: 'devtools',
		name: 'Unix Timestamp Converter',
		nameZh: 'Unix 时间戳转换器',
		description: 'Convert between Unix seconds / milliseconds and local or UTC wall-clock time, plus ISO 8601.',
		descriptionZh: '在 Unix 秒、毫秒与本地/UTC 时间、ISO 8601 之间互转。',
		kind: 'form',
		config: {
			fields: [
				{
					id: 'seconds',
					label: 'Unix timestamp (seconds)',
					labelZh: 'Unix 时间戳（秒）',
					// textarea: one timestamp per line — several lines switch the
					// compute into a batch table (the log-analysis case), a single
					// line keeps the full breakdown below.
					type: 'textarea',
					def: '0',
					placeholder: 'e.g. 1760000000 — or one per line for batch',
					placeholderZh: '例如 1760000000——批量时每行一个',
					required: true,
					hint: 'Seconds since 1970-01-01 00:00:00 UTC. Millisecond values (13 digits) are detected automatically.',
					hintZh: '自 1970-01-01 00:00:00 (UTC) 以来的秒数；13 位毫秒值会自动识别。',
				},
			],
			compute: (v) => {
				const raw = v.str('seconds');
				const lines = raw.split('\n').map((s) => s.trim()).filter((s) => s.length > 0);
				// Batch: one timestamp per line → one row each (the log-paste case).
				if (lines.length > 1) {
					const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
					return {
						rows: [
							{
								label: 'Batch result',
								labelZh: '批量结果',
								value: `${lines.length} timestamps · ${localTz}`,
								valueZh: `共 ${lines.length} 个时间戳 · ${localTz}`,
								emphasis: true,
							},
						],
						table: {
							columns: ['Timestamp (s)', 'Local Time', 'UTC Time'],
							columnsZh: ['时间戳 (秒)', '本地时间', 'UTC 时间'],
							rows: lines.map((line) => {
								// 13-digit values are milliseconds; a bare number is seconds.
								let sec = Number(line);
								if (!Number.isFinite(sec) || sec < 0) return [line, '—', '—'];
								if (/^\d{13}$/.test(line)) sec = sec / 1000;
								const ms = Math.round(sec * 1000);
								return [line, stamp(ms, localTz, false), stamp(ms, 'UTC', false)];
							}),
						},
					};
				}
				const sec = Number(raw);
				if (!Number.isFinite(sec) || sec < 0) {
					return {
						rows: [
							{
								label: 'Result',
								labelZh: '计算结果',
								value: '— (enter a valid non-negative Unix second)',
								valueZh: '— (请输入有效的非负 Unix 秒数)',
							},
						],
					};
				}
				const ms = Math.round(sec * 1000);
				return {
					rows: [
						{
							label: 'Unix seconds',
							labelZh: 'Unix 秒数',
							value: String(Math.round(sec)),
							valueZh: String(Math.round(sec)),
						},
						{ label: 'Milliseconds', labelZh: '毫秒数', value: String(ms), valueZh: String(ms) },
						{
							label: 'Local date & time',
							labelZh: '本地时间',
							value: stamp(ms, Intl.DateTimeFormat().resolvedOptions().timeZone, false),
							valueZh: stamp(ms, Intl.DateTimeFormat().resolvedOptions().timeZone, true),
						},
						{
							label: 'UTC date & time',
							labelZh: '协调世界时 (UTC)',
							value: stamp(ms, 'UTC', false),
							valueZh: stamp(ms, 'UTC', true),
						},
						{
							label: 'ISO 8601 (UTC)',
							labelZh: 'ISO 8601 (UTC)',
							value: new Date(ms).toISOString(),
							valueZh: new Date(ms).toISOString(),
						},
					],
				};
			},
		},
	},

	{
		slug: 'cron-expression-parser',
		category: 'devtools',
		name: 'Cron Expression Parser',
		nameZh: 'Cron 表达式解析器',
		description: 'Parse Linux 5-field and Quartz 6/7-field cron expressions, expand every field, and list the next execution times.',
		descriptionZh: '解析标准五段式与秒级六/七段式 Cron 表达式，展开各字段取值并列出下次执行时间。',
		kind: 'form',
		config: {
			fields: [
				{
					id: 'dialect',
					label: 'Dialect',
					labelZh: '方言',
					type: 'select',
					def: 'linux',
					options: [
						{ value: 'linux', label: 'Linux 5-field (minute hour dom mon dow)', labelZh: '标准五段式（分 时 日 月 周）' },
						{ value: 'spring-quartz', label: 'Spring/Quartz 6-field (sec min hour dom mon dow)', labelZh: '秒级六段式（秒 分 时 日 月 周）' },
						{ value: 'quartz-7', label: 'Quartz 7-field (sec min hour dom mon dow year)', labelZh: '含年七段式（秒 分 时 日 月 周 年）' },
					],
					hint: 'Spring and Quartz use six fields with a leading seconds field; Quartz seven-field appends a year. Quartz requires day-of-month and day-of-week to be exclusive — exactly one of them must be "?".',
					hintZh: 'Spring 与 Quartz 用 6 段，最前面是秒；Quartz 7 段末尾再加年。Quartz 要求日与周字段互斥——恰一为 "?"。',
				},
				{
					id: 'expr',
					label: 'Cron expression',
					labelZh: 'Cron 表达式',
					// textarea: one expression per line — several lines switch the
					// compute into a batch table (paste a whole crontab).
					type: 'textarea',
					def: '0 12 * * *',
					placeholder: 'minute hour day month weekday — or one per line for batch',
					placeholderZh: '分 时 日 月 周——批量时每行一条',
					required: true,
					hint: 'Fields are minute (0-59), hour (0-23), day of month (1-31), month (1-12) and weekday (Linux 0-7 with 0 and 7 both Sunday; Quartz 1-7 with 1=Sunday). Supports "*", ranges a-b, steps (a/n means a-max/n) and comma lists. The L/W/# modifiers are not supported.',
					hintZh: '字段依次为：分 (0-59)、时 (0-23)、日 (1-31)、月 (1-12)、周（Linux 0-7，0 与 7 均为周日；Quartz 1-7，1 为周日）。支持 *、区间 a-b、步长（a/n 意为 a-max/n）与逗号列表。不支持 L/W/# 扩展语法。',
				},
				{
					id: 'tz',
					label: 'Time zone',
					labelZh: '时区',
					type: 'select',
					def: 'local',
					options: [
						{ value: 'local', label: 'Local (browser)', labelZh: '本地时区（浏览器）' },
						{ value: 'UTC', label: 'UTC', labelZh: 'UTC' },
					],
					hint: 'Next-fire times are computed against this wall clock. UTC has no daylight-saving transitions.',
					hintZh: '下次执行时间按此时区的墙钟计算。UTC 无夏令时跳变。',
				},
				{
					id: 'count',
					label: 'How many runs',
					labelZh: '执行次数',
					type: 'select',
					def: '7',
					options: [
						{ value: '1', label: '1', labelZh: '1' },
						{ value: '3', label: '3', labelZh: '3' },
						{ value: '5', label: '5', labelZh: '5' },
						{ value: '7', label: '7', labelZh: '7' },
						{ value: '10', label: '10', labelZh: '10' },
					],
				},
			],
			compute: (v) => {
				const dialect = v.str('dialect') as CronDialect;
				const expr = v.str('expr');
				const tz: 'local' | 'UTC' = v.str('tz') === 'UTC' ? 'UTC' : 'local';
				const count = Number(v.str('count')) || 7;
				const spec = DIALECT_FIELDS[dialect];

				// Batch: one expression per line (paste a whole crontab), one row
				// per expression with its next fire — invalid lines are flagged ✗
				// without sinking the rest.
				const batchLines = expr.split('\n').map((s) => s.trim()).filter((s) => s.length > 0);
				if (batchLines.length > 1) {
					const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
					const table = {
						columns: tz === 'UTC' ? ['Expression', 'Next run (UTC)'] : ['Expression', 'Next run (local)', 'Next run (UTC)'],
						columnsZh: tz === 'UTC' ? ['表达式', '下次执行 (UTC)'] : ['表达式', '下次执行 (本地)', '下次执行 (UTC)'],
						rows: batchLines.map((line) => {
							const parsed = parseCron(line, dialect);
							if (isCronError(parsed)) return tz === 'UTC' ? [line, `✗ ${parsed.error}`] : [line, `✗ ${parsed.error}`, '—'];
							const fire = nextFire(parsed, Date.now(), tz, 1);
							const next = fire.times[0];
							if (next === undefined) return tz === 'UTC' ? [line, '— (never fires)'] : [line, '—', '—'];
							return tz === 'UTC' ? [line, stamp(next, 'UTC', false)] : [line, stamp(next, localTz, false), stamp(next, 'UTC', false)];
						}),
						rowsZh: batchLines.map((line) => {
							const parsed = parseCron(line, dialect);
							if (isCronError(parsed)) return tz === 'UTC' ? [line, `✗ ${parsed.errorZh}`] : [line, `✗ ${parsed.errorZh}`, '—'];
							const fire = nextFire(parsed, Date.now(), tz, 1);
							const next = fire.times[0];
							if (next === undefined) return tz === 'UTC' ? [line, '—（不会触发）'] : [line, '—', '—'];
							return tz === 'UTC' ? [line, stamp(next, 'UTC', true)] : [line, stamp(next, localTz, true), stamp(next, 'UTC', true)];
						}),
					};
					return {
						rows: [
							{
								label: 'Batch result',
								labelZh: '批量结果',
								value: `${batchLines.length} expressions (${dialect})`,
								valueZh: `共 ${batchLines.length} 条表达式（${dialect}）`,
								emphasis: true,
							},
						],
						table,
					};
				}

				const parsed = parseCron(expr, dialect);
				if (isCronError(parsed)) {
					return { rows: [{ label: 'Result', labelZh: '计算结果', value: parsed.error, valueZh: parsed.errorZh }] };
				}

				// Field display rows, in dialect order.
				const fieldSpecs: { f: ParsedField; en: string; zh: string }[] = [];
				if (spec.hasSecond) fieldSpecs.push({ f: parsed.sec!, en: 'Second', zh: '秒' });
				fieldSpecs.push({ f: parsed.min, en: 'Minute', zh: '分钟' });
				fieldSpecs.push({ f: parsed.hour, en: 'Hour', zh: '小时' });
				fieldSpecs.push({ f: parsed.dom, en: 'Day of month', zh: '日' });
				fieldSpecs.push({ f: parsed.mon, en: 'Month', zh: '月份' });
				fieldSpecs.push({ f: parsed.dow, en: 'Weekday', zh: '星期' });
				if (spec.hasYear) fieldSpecs.push({ f: parsed.year!, en: 'Year', zh: '年份' });
				const display = fieldSpecs.map((fs) => {
					const compact = fs.f.ignore ? '?' : compactCron(fs.f.vals, fs.f.full);
					return { label: fs.en, labelZh: fs.zh, value: compact, valueZh: compact };
				});

				// Human-readable summary: a single minute+hour becomes a clock phrase,
				// otherwise every restricted field is listed.
				const all = (f: ParsedField) => f.full || f.ignore;
				let en: string;
				let zh: string;
				if (parsed.min.full && parsed.hour.full && all(parsed.dom) && parsed.mon.full && all(parsed.dow) && (!spec.hasSecond || parsed.sec!.full) && (!spec.hasYear || parsed.year!.full)) {
					en = spec.hasSecond ? 'every second' : 'every minute';
					zh = spec.hasSecond ? '每秒执行一次' : '每分钟执行一次';
				} else if (parsed.min.vals.length === 1 && parsed.hour.vals.length === 1 && all(parsed.dom) && parsed.mon.full && all(parsed.dow) && (!spec.hasSecond || parsed.sec!.vals.length === 1)) {
					const hh = String(parsed.hour.vals[0]).padStart(2, '0');
					const mm = String(parsed.min.vals[0]).padStart(2, '0');
					const ss = spec.hasSecond ? `:${String(parsed.sec!.vals[0]).padStart(2, '0')}` : '';
					en = `at ${hh}:${mm}${ss}`;
					zh = `在每天 ${parsed.hour.vals[0]} 点 ${mm} 分${spec.hasSecond ? ` ${parsed.sec!.vals[0]} 秒` : ''}执行`;
				} else {
					const partsEn: string[] = [];
					const partsZh: string[] = [];
					if (spec.hasSecond && !parsed.sec!.full) {
						partsEn.push(`second ${compactCron(parsed.sec!.vals, false)}`);
						partsZh.push(`第 ${compactCron(parsed.sec!.vals, false)} 秒`);
					}
					if (!parsed.min.full) {
						partsEn.push(`minute ${compactCron(parsed.min.vals, false)}`);
						partsZh.push(`第 ${compactCron(parsed.min.vals, false)} 分`);
					}
					if (!parsed.hour.full) {
						partsEn.push(`hour ${compactCron(parsed.hour.vals, false)}`);
						partsZh.push(`第 ${compactCron(parsed.hour.vals, false)} 时`);
					}
					if (!parsed.dom.ignore && !parsed.dom.full) {
						partsEn.push(`day-of-month ${compactCron(parsed.dom.vals, false)}`);
						partsZh.push(`每月 ${compactCron(parsed.dom.vals, false)} 日`);
					}
					if (!parsed.mon.full) {
						partsEn.push(`month ${compactCron(parsed.mon.vals, false)}`);
						partsZh.push(`${compactCron(parsed.mon.vals, false)} 月`);
					}
					if (!parsed.dow.ignore && !parsed.dow.full) {
						partsEn.push(`weekday ${compactCron(parsed.dow.vals, false)}`);
						partsZh.push(`星期 ${compactCron(parsed.dow.vals, false)} 周`);
					}
					if (spec.hasYear && parsed.year && !parsed.year.full) {
						partsEn.push(`year ${compactCron(parsed.year.vals, false)}`);
						partsZh.push(`${compactCron(parsed.year.vals, false)} 年`);
					}
					en = partsEn.join(', ');
					zh = partsZh.join('，') + ' 执行';
				}

				// Next-fire table.
				const fire = nextFire(parsed, Date.now(), tz, count);
				const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
				const table = fire.times.length
					? {
							columns: tz === 'UTC' ? ['#', 'UTC'] : ['#', 'Local time', 'UTC'],
							columnsZh: tz === 'UTC' ? ['#', 'UTC'] : ['#', '本地时间', 'UTC'],
							rows: fire.times.map((ms, i) => (tz === 'UTC' ? [String(i + 1), stamp(ms, 'UTC', false)] : [String(i + 1), stamp(ms, localTz, false), stamp(ms, 'UTC', false)])),
							rowsZh: fire.times.map((ms, i) => (tz === 'UTC' ? [String(i + 1), stamp(ms, 'UTC', true)] : [String(i + 1), stamp(ms, localTz, true), stamp(ms, 'UTC', true)])),
						}
					: undefined;

				const rows = [
					...display,
					{ label: 'Schedule', labelZh: '执行时间', value: en, valueZh: zh },
				];
				if (fire.error) rows.push({ label: 'Next runs', labelZh: '下次执行', value: fire.error, valueZh: fire.errorZh! });

				return {
					rows,
					table,
					note: 'Next-fire times follow this wall clock. An hour that does not exist because of a spring-forward DST gap is skipped, and a fall-back duplicate hour appears once. The L/W/# modifiers are not supported.',
					noteZh: '下次执行时间按此时区的墙钟计算。因夏令时春季快进而不存在的小时会被跳过，秋季回拨的重复小时只出现一次。不支持 L/W/# 扩展语法。',
				};
			},
		},
	},


	{
		slug: 'regex-tester',
		category: 'devtools',
		name: 'Regex Tester',
		nameZh: '正则表达式测试器',
		description: 'Test a regular expression against sample text: match count, the matches themselves, and syntax errors.',
		descriptionZh: '用正则表达式测试样本文本：返回匹配数量、命中的具体内容与语法错误提示。',
		kind: 'form',
		config: {
			fields: [
				{
					id: 'pattern',
					label: 'Regular expression',
					labelZh: '正则表达式',
					type: 'text',
					def: '\\d{4}-\\d{2}-\\d{2}',
					placeholder: 'e.g. \\d+',
					placeholderZh: '例如 \\d+',
					required: true,
				},
				{
					id: 'flags',
					label: 'Flags',
					labelZh: '修饰符',
					type: 'select',
					def: 'g',
					options: [
						{ value: '', label: 'None', labelZh: '无' },
						{ value: 'g', label: 'g (global)', labelZh: 'g（全局）' },
						{ value: 'gi', label: 'gi (case-insensitive)', labelZh: 'gi（忽略大小写）' },
						{ value: 'gm', label: 'gm (multiline)', labelZh: 'gm（多行）' },
					],
				},
				{
					id: 'text',
					label: 'Test text',
					labelZh: '待测试文本',
					type: 'textarea',
					def: 'Releases: 2026-09-07 and 2026-10-01.',
					placeholder: 'Paste text to test against…',
					placeholderZh: '粘贴用于测试的文本…',
				},
			],
			compute: (v) => {
				const pat = v.str('pattern');
				const flags = v.str('flags');
				const text = v.str('text');
				let re: RegExp;
				try {
					re = new RegExp(pat, flags);
				} catch {
					return {
						rows: [
							{
								label: 'Result',
								labelZh: '计算结果',
								value: '— (invalid regular expression)',
								valueZh: '— (正则表达式不合法)',
							},
						],
					};
				}
				const matches: string[] = [];
				if (re.global || re.sticky) {
					re.lastIndex = 0;
					let m: RegExpExecArray | null;
					while ((m = re.exec(text)) !== null && matches.length < 12) {
						matches.push(m[0]);
						if (m[0] === '') re.lastIndex++;
					}
				} else {
					const m = re.exec(text);
					if (m) matches.push(m[0]);
				}
				const rows: { label: string; labelZh: string; value: string; valueZh: string }[] = [
					{
						label: 'Matches found',
						labelZh: '命中次数',
						value: String(matches.length),
						valueZh: String(matches.length),
					},
				];
				matches.slice(0, 5).forEach((s, i) => {
					rows.push({
						label: `Match ${i + 1}`,
						labelZh: `第 ${i + 1} 处匹配`,
						value: s,
						valueZh: s,
					});
				});
				return { rows };
			},
		},
	},

	{
		slug: 'css-px-rem-converter',
		category: 'devtools',
		name: 'CSS Size Converter (px / rem / em / %)',
		nameZh: 'CSS 尺寸换算 (px / rem / em / %)',
		description: 'Convert font and spacing sizes between px, rem and em, given the root font size.',
		descriptionZh: '在 px、rem、em 之间换算字号与间距，可指定根字号。',
		kind: 'form',
		config: {
			fields: [
				{
					id: 'value',
					label: 'Size',
					labelZh: '尺寸值',
					type: 'number',
					def: '16',
					step: 'any',
					min: '0',
					required: true,
				},
				{
					id: 'unit',
					label: 'Unit',
					labelZh: '单位',
					type: 'select',
					def: 'px',
					options: [
						{ value: 'px', label: 'px', labelZh: 'px（像素）' },
						{ value: 'rem', label: 'rem', labelZh: 'rem（根字号倍数）' },
						{ value: 'em', label: 'em', labelZh: 'em（字号倍数）' },
					],
				},
				{
					id: 'root',
					label: 'Root font size',
					labelZh: '根字号',
					type: 'number',
					def: '16',
					step: 'any',
					min: '1',
					required: true,
					suffix: '(px)',
					suffixZh: '（像素）',
				},
			],
			compute: (v) => {
				const val = v.num('value');
				const root = v.num('root');
				if (!Number.isFinite(val) || val < 0 || !(root > 0)) {
					return {
						rows: [
							{
								label: 'Result',
								labelZh: '计算结果',
								value: '— (enter a size and a positive root font size)',
								valueZh: '— (请输入尺寸值且根字号需大于 0)',
							},
						],
					};
				}
				const unit = v.str('unit') || 'px';
				const px = unit === 'rem' || unit === 'em' ? val * root : val;
				const fmt = (x: number) => {
					const r = Math.round(x * 10000) / 10000;
					return String(r);
				};
				return {
					rows: [
						{ label: 'Pixels (px)', labelZh: '像素 (px)', value: fmt(px), valueZh: fmt(px) },
						{ label: 'rem', labelZh: 'rem', value: fmt(px / root), valueZh: fmt(px / root) },
						{
							label: 'em (relative to root)',
							labelZh: 'em（以根字号为基准）',
							value: fmt(px / root),
							valueZh: fmt(px / root),
						},
						{
							label: '% of root font',
							labelZh: '根字号百分比',
							value: fmt((px / root) * 100) + '%',
							valueZh: fmt((px / root) * 100) + '%',
						},
					],
				};
			},
		},
	},


	// --- cURL to Code Converter --------------------------------------------------------
	{
		slug: 'curl-to-code',
		category: 'devtools',
		name: 'cURL to Code Converter',
		nameZh: 'cURL 转多语言代码生成器',
		description: 'Convert cURL command lines into JavaScript (fetch/axios), Python (requests), Go, Rust, and PHP code.',
		descriptionZh: '将 cURL 命令解析并一键转换为 JS (fetch/axios)、Python (requests)、Go、Rust 与 PHP 等多语言 HTTP 请求代码。',
		kind: 'text',
		config: {
			// Fictional sample (example.com / Alice), per the def convention.
			def: `curl -X POST "https://api.example.com/v1/users" \\\n  -H "Content-Type: application/json" \\\n  -H "Authorization: Bearer demo-token" \\\n  -d '{"name": "Alice", "role": "admin"}'`,
			placeholder: 'curl -X POST "https://api.example.com/v1/data" -H "Content-Type: application/json" -d \'{"name": "Alice"}\'',
			placeholderZh: '粘贴 cURL 命令，如：curl -X POST "https://api.example.com/v1/data" -H "Content-Type: application/json" -d \'{"name": "Alice"}\'',
			mono: true,
			live: true,
			stats: (text: string) => {
				const trimmed = text.trim();
				const parsed = trimmed ? parseCurl(trimmed) : null;
				return [
					{
						label: 'HTTP Method',
						labelZh: '请求动词 Method',
						value: parsed ? parsed.method : '—',
					},
					{
						label: 'Target URL',
						labelZh: '目标网址 URL',
						value: parsed && parsed.url ? parsed.url : '—',
					},
					{
						label: 'Headers Count',
						labelZh: '请求头标点数',
						value: parsed ? String(Object.keys(parsed.headers).length) : '0',
					},
				];
			},
			transforms: [
				{
					id: 'js-fetch',
					label: 'JS (fetch)',
					labelZh: 'JS (fetch)',
					run: (text: string) => {
						const trimmed = text.trim();
						if (!trimmed) return { output: '// Paste a cURL command above to convert to JavaScript fetch code' };
						const parsed = parseCurl(trimmed);
						return { output: curlToJsFetch(parsed) };
					},
				},
				{
					id: 'python-requests',
					label: 'Python (requests)',
					labelZh: 'Python (requests)',
					run: (text: string) => {
						const trimmed = text.trim();
						if (!trimmed) return { output: '# Paste a cURL command above to convert to Python requests code' };
						const parsed = parseCurl(trimmed);
						return { output: curlToPython(parsed) };
					},
				},
			],
		},
	},


	// --- IP Subnet / CIDR Calculator ---------------------------------------------------
	{
		slug: 'cidr-calculator',
		category: 'devtools',
		name: 'IP Subnet & CIDR Calculator (IPv4 / IPv6)',
		nameZh: 'IPv4 / IPv6 子网掩码与 CIDR 计算器',
		description: 'Compute network address, netmask, broadcast, host range from IPv4/CIDR — plus full IPv6 breakdowns with :: expansion and 128-bit prefix math.',
		descriptionZh: 'IPv4/CDIR 网段计算网络地址、子网掩码、广播地址与可用主机范围，并支持 IPv6 网段的 :: 展开、128 位前缀与地址总数计算。',
		kind: 'text',
		config: {
			def: '192.168.1.50/24',
			placeholder: '192.168.1.50/24, or 2001:db8::1/64',
			placeholderZh: '输入 IPv4/CIDR（如 192.168.1.50/24）或 IPv6（如 2001:db8::1/64）',
			mono: true,
			live: true,
			stats: (text: string) => {
				const trimmed = text.trim() || '192.168.1.1/24';
				if (trimmed.includes(':')) {
					const v6 = parseCidr6(trimmed);
					if (!v6) return [{ label: 'Status', labelZh: '状态', value: 'Invalid IPv6/CIDR format' }];
					return [
						{ label: 'Network CIDR', labelZh: '网段 CIDR', value: v6.cidr },
						{ label: 'Total Addresses', labelZh: '地址总数', value: v6.total },
						{ label: 'IP Scope', labelZh: '地址类型', value: (typeof document !== 'undefined' && document.documentElement.dataset.lang === 'zh' ? v6.scopeZh : v6.scope) },
					];
				}
				const info = parseCidrCalc(trimmed);
				if (!info) {
					return [{ label: 'Status', labelZh: '状态', value: 'Invalid IPv4/CIDR format' }];
				}
				return [
					{ label: 'Network CIDR', labelZh: '网段 CIDR', value: info.cidr },
					{ label: 'Subnet Netmask', labelZh: '子网掩码', value: info.netmask },
					{ label: 'Usable Hosts', labelZh: '可用主机总数', value: info.usableHosts },
					{ label: 'IP Scope', labelZh: '网络类型范围', value: (typeof document !== 'undefined' && document.documentElement.dataset.lang === 'zh' ? info.scopeZh : info.scope) },
				];
			},
			transforms: [
				{
					id: 'cidr',
					label: 'Calculate Subnet',
					labelZh: '计算子网明细',
					run: (text: string) => {
						const trimmed = text.trim() || '192.168.1.1/24';
						// ':' → IPv6 path (128-bit, BigInt); dotted → IPv4 as before
						if (trimmed.includes(':')) {
							const v6 = parseCidr6(trimmed);
							if (!v6) {
								return {
									output: '',
									error: 'Invalid IPv6/CIDR string (e.g. 2001:db8::1/64)',
									errorZh: '无效的 IPv6/CIDR 格式（例如 2001:db8::1/64）',
								};
							}
							const lines = [
								`=== IPv6 / CIDR Subnet Breakdown ===`,
								`CIDR Notation   : ${v6.cidr}`,
								`IP Address      : ${v6.ip}`,
								`Prefix Length   : /${v6.prefix} of 128 bits`,
								`Network Address : ${v6.network}`,
								`Last Address    : ${v6.lastAddress}`,
								`Total Addresses : ${v6.total}`,
								`Scope           : ${v6.scope}`,
							];
							return { output: lines.join('\n') };
						}
						const info = parseCidrCalc(trimmed);
						if (!info) {
							return {
								output: '',
								error: 'Invalid IP/CIDR string (e.g. 192.168.1.1/24)',
								errorZh: '无效的 IP/CIDR 格式（例如 192.168.1.1/24）',
							};
						}
						const lines = [
							`=== IPv4 / CIDR Subnet Breakdown ===`,
							`CIDR Notation   : ${info.cidr}`,
							`IP Address      : ${info.ip}`,
							`Subnet Netmask  : ${info.netmask}`,
							`Wildcard Mask   : ${info.wildcard}`,
							`Network Address : ${info.network}`,
							`Broadcast Addr  : ${info.broadcast}`,
							`First Usable Host: ${info.firstUsable}`,
							`Last Usable Host : ${info.lastUsable}`,
							`Total Hosts     : ${info.totalHosts}`,
							`Usable Hosts    : ${info.usableHosts}`,
							`IP Class        : ${info.ipClass}`,
							`Scope           : ${info.scope}`,
						];
						return { output: lines.join('\n') };
					},
				},
				{
					id: 'cidrBatch',
					label: 'Calculate each line',
					labelZh: '逐行批量计算',
					// One compact summary per CIDR — for pasting an ACL or a subnet plan and
					// eyeballing the whole list. A bad line is ✗, the list keeps going.
					run: (text: string) =>
						runBatch(text, (line) => {
							if (line.includes(':')) {
								const v6 = parseCidr6(line);
								if (!v6) return null;
								return `${v6.cidr} · ${v6.total} addrs (${v6.network} – ${v6.lastAddress})`;
							}
							const info = parseCidrCalc(line);
							if (!info) return null;
							return `${info.cidr} · mask ${info.netmask} · usable ${info.firstUsable}–${info.lastUsable} (${info.usableHosts} hosts)`;
						}),
				},
			],
		},
	},

];

export const UTILITIES_TEXT_TOOLS: ToolEntry[] = [
	{
		slug: 'word-counter',
		category: 'utilities',
		name: 'Word Counter',
		nameZh: '在线字数统计',
		description: 'Live word, character, sentence and paragraph counts plus reading time.',
		descriptionZh: '实时统计词数、字符数、句子数、段落数与预估阅读时长。',
		kind: 'text',
		config: {
			def: 'The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs.\n',
			placeholder: 'Type or paste text…',
			placeholderZh: '在此输入或粘贴文本…',
			stats: wordStats,
		} satisfies TextConfig,
	},

	{
		slug: 'character-counter',
		category: 'utilities',
		name: 'Character Counter',
		nameZh: '字符计数器',
		description: 'Count characters, letters, digits, spaces, symbols and UTF-8 bytes.',
		descriptionZh: '实时细分统计字符、字母、数字、空格、符号与 UTF-8 字节数。',
		kind: 'text',
		config: {
			def: 'Hello, world! This is a sample text with 12345 numbers.\n',
			placeholder: 'Type or paste text…',
			placeholderZh: '在此输入或粘贴文本…',
			stats: charStats,
		} satisfies TextConfig,
	},

	{
		slug: 'markdown-preview',
		category: 'utilities',
		name: 'Markdown Live Editor & Previewer',
		nameZh: 'Markdown 实时渲染与预览编辑器',
		description: 'Live split-screen Markdown rendering with GitHub Flavored Markdown (GFM), tables, task lists, code syntax, KaTeX-typeset maths, and HTML export.',
		descriptionZh: '纯本地双栏实时 Markdown 渲染编辑器，支持 GFM 全语法、LaTeX 公式排版与 HTML 导出。',
		kind: 'markdown',
	},


	// --- Markdown Table Formatter -------------------------------------------------------
	{
		slug: 'markdown-table-formatter',
		category: 'utilities',
		name: 'Markdown Table Auto-Align Formatter',
		nameZh: 'Markdown 表格自动对齐与格式化',
		description: 'Format messy Markdown tables into clean, readable, column-aligned ASCII markdown tables with Unicode-aware auto-fitted widths.',
		descriptionZh: '自动对齐错乱的 Markdown 表格，支持中文全角与英文字符宽度自适应计算，一键格式化完美矩形网格。',
		kind: 'text',
		config: {
			def: '| Name | Role |\n| --- | --- |\n| Alice | admin |\n| Bob | dev |\n',
			placeholder: '| Product | Category | Price | Status |\n|:---|:---:|---:|:---|\n| iPhone 16 Pro | Electronics | $999 | In Stock |\n| Mechanical Keyboard | Peripherals | $129 | Pre-order |',
			placeholderZh: '粘贴 Markdown 表格，如：\n| 商品 | 分类 | 价格 |\n|:---|:---:|---:|\n| iPhone 16 Pro | 电子产品 | 7999元 |',
			mono: true,
			live: true,
			stats: (text: string) => {
				const lines = text ? text.split('\n').filter((l) => l.trim().startsWith('|') || l.trim().endsWith('|')).length : 0;
				return [
					{ label: 'Table Rows', labelZh: '表格行数', value: String(lines) },
				];
			},
			transforms: [
				{
					id: 'align',
					label: 'Align & Beautify Table',
					labelZh: '等宽对齐美化',
					run: (text: string) => ({ output: formatMarkdownTable(text, 'align') }),
				},
				{
					id: 'compact',
					label: 'Compact Table',
					labelZh: '紧凑模式',
					run: (text: string) => ({ output: formatMarkdownTable(text, 'compact') }),
				},
			],
		},
	},

	{
		slug: 'text-diff',
		category: 'utilities',
		name: 'Text Diff',
		nameZh: '文本差异对比',
		description: 'Compare two texts line by line and report added, removed and unchanged lines plus similarity.',
		descriptionZh: '逐行比较两段文本，给出新增、删除、未变行数与整体相似度。',
		kind: 'form',
		config: {
			fields: [
				{
					id: 'before',
					label: 'Original text',
					labelZh: '原文本',
					type: 'textarea',
					def: 'alpha\nbeta\ngamma',
				},
				{
					id: 'after',
					label: 'Changed text',
					labelZh: '修改后的文本',
					type: 'textarea',
					def: 'alpha\nbeta\ndelta',
				},
			],
			compute: (v) => {
				const a = v.str('before').split('\n');
				const b = v.str('after').split('\n');
				// LCS length over lines via DP (capped to avoid pathological inputs).
				const cap = 500;
				const aa = a.slice(0, cap);
				const bb = b.slice(0, cap);
				const dp: Uint32Array[] = [new Uint32Array(bb.length + 1)];
				for (let i = 1; i <= aa.length; i++) {
					dp.push(new Uint32Array(bb.length + 1));
					for (let j = 1; j <= bb.length; j++) {
						dp[i][j] =
							aa[i - 1] === bb[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
					}
				}
				const lcs = dp[aa.length][bb.length];
				const total = Math.max(aa.length, bb.length) || 1;
				return {
					rows: [
						{ label: 'Added lines', labelZh: '新增行', value: String(bb.length - lcs), valueZh: String(bb.length - lcs) },
						{
							label: 'Removed lines',
							labelZh: '删除行',
							value: String(aa.length - lcs),
							valueZh: String(aa.length - lcs),
						},
						{ label: 'Unchanged lines', labelZh: '未变行', value: String(lcs), valueZh: String(lcs) },
						{
							label: 'Similarity',
							labelZh: '相似度',
							value: String(Math.round((lcs / total) * 1000) / 10) + '%',
							valueZh: String(Math.round((lcs / total) * 1000) / 10) + '%',
						},
					],
				};
			},
		},
	},

	{
		slug: 'roman-numeral',
		category: 'utilities',
		name: 'Roman Numeral Converter',
		nameZh: '罗马数字转换器',
		description: 'Convert between Roman numerals and Arabic numbers (1–3999), with strict validation of non-canonical forms.',
		descriptionZh: '罗马数字与阿拉伯数字互转（1–3999），严格校验非规范写法。',
		kind: 'text',
		config: {
			def: 'MCMLXXXVII',
			placeholder: 'e.g. 1987 or MCMLXXXVII',
			placeholderZh: '例如 1987 或 MCMLXXXVII',
			live: true,
			stats: (text: string) => {
				const t = text.trim();
				const asNum = /^-?\d+$/.test(t) ? Number(t) : null;
				const n = asNum ?? fromRoman(t);
				const valid = n !== null && n >= 1 && n <= 3999;
				return [
					{
						label: 'Arabic value',
						labelZh: '阿拉伯数字值',
						value: valid ? String(n) : '—',
					},
					{
						label: 'Roman form',
						labelZh: '罗马数字',
						value: valid ? (asNum !== null ? (toRoman(n) as string) : t.toUpperCase()) : '—',
					},
				];
			},
			transforms: [
				{
					id: 'toroman',
					label: 'Number → Roman',
					labelZh: '数字 → 罗马数字',
					run: (t) => {
						const n = Number(t.trim());
						if (!t.trim()) return { output: '', error: 'Enter a number or numeral first.', errorZh: '请先输入数字或罗马数字。' };
						const r = toRoman(n);
						return r
							? { output: r }
							: { output: '', error: 'Enter an integer from 1 to 3999.', errorZh: '请输入 1 到 3999 的整数。' };
					},
				},
				{
					id: 'fromroman',
					label: 'Roman → Number',
					labelZh: '罗马数字 → 数字',
					run: (t) => {
						if (!t.trim()) return { output: '', error: 'Enter a numeral first.', errorZh: '请先输入罗马数字。' };
						const n = fromRoman(t);
						return n !== null
							? { output: String(n) }
							: { output: '', error: 'Not a canonical Roman numeral (1–3999).', errorZh: '这不是规范的罗马数字（1–3999）。' };
					},
				},
			],
		} satisfies TextConfig,
	},

];

interface ParsedCurl {
	url: string;
	method: string;
	headers: Record<string, string>;
	body: string;
}

function parseCurl(cmd: string): ParsedCurl {
	const trimmed = cmd.replace(/\\\r?\n/g, ' ').trim();
	const tokens: string[] = [];
	let current = '';
	let inQuote = false;
	let quoteChar = '';

	for (let i = 0; i < trimmed.length; i++) {
		const ch = trimmed[i]!;
		if (inQuote) {
			if (ch === quoteChar && trimmed[i - 1] !== '\\') {
				inQuote = false;
			} else {
				current += ch;
			}
		} else if (ch === "'" || ch === '"') {
			inQuote = true;
			quoteChar = ch;
		} else if (/\s/.test(ch)) {
			if (current) {
				tokens.push(current);
				current = '';
			}
		} else {
			current += ch;
		}
	}
	if (current) tokens.push(current);

	let url = '';
	let method = '';
	const headers: Record<string, string> = {};
	let body = '';

	for (let i = 0; i < tokens.length; i++) {
		const t = tokens[i]!;
		if (t === 'curl' || t.startsWith('curl')) continue;

		if (t === '-X' || t === '--request') {
			method = (tokens[++i] || 'GET').toUpperCase();
		} else if (t === '-H' || t === '--header') {
			const headerLine = tokens[++i] || '';
			const colonIdx = headerLine.indexOf(':');
			if (colonIdx > 0) {
				const key = headerLine.slice(0, colonIdx).trim();
				const val = headerLine.slice(colonIdx + 1).trim();
				headers[key] = val;
			}
		} else if (t === '-d' || t === '--data' || t === '--data-raw' || t === '--data-binary') {
			body = tokens[++i] || '';
			if (!method) method = 'POST';
		} else if (t === '-u' || t === '--user') {
			const userPass = tokens[++i] || '';
			headers['Authorization'] = `Basic ${btoa(userPass)}`;
		} else if (!t.startsWith('-') && !url) {
			url = t;
		}
	}
	if (!method) method = 'GET';
	return { url: url || 'https://api.example.com/data', method, headers, body };
}

function curlToJsFetch(parsed: ParsedCurl): string {
	const opts: string[] = [`method: '${parsed.method}'`];
	if (Object.keys(parsed.headers).length > 0) {
		const hLines = Object.entries(parsed.headers).map(([k, v]) => `    '${k}': '${v}'`);
		opts.push(`headers: {\n${hLines.join(',\n')}\n  }`);
	}
	if (parsed.body) {
		opts.push(`body: JSON.stringify(${parsed.body.startsWith('{') ? parsed.body : JSON.stringify(parsed.body)})`);
	}
	return `fetch('${parsed.url}', {\n  ${opts.join(',\n  ')}\n})\n  .then(res => res.json())\n  .then(data => console.log(data))\n  .catch(err => console.error(err));`;
}

function curlToPython(parsed: ParsedCurl): string {
	let code = `import requests\n\nurl = '${parsed.url}'\n`;
	if (Object.keys(parsed.headers).length > 0) {
		const hLines = Object.entries(parsed.headers).map(([k, v]) => `    '${k}': '${v}'`);
		code += `headers = {\n${hLines.join(',\n')}\n}\n`;
	} else {
		code += `headers = {}\n`;
	}
	if (parsed.body) {
		if (parsed.body.startsWith('{')) {
			code += `json_data = ${parsed.body}\nresponse = requests.${parsed.method.toLowerCase()}(url, headers=headers, json=json_data)\n`;
		} else {
			code += `data = '''${parsed.body}'''\nresponse = requests.${parsed.method.toLowerCase()}(url, headers=headers, data=data)\n`;
		}
	} else {
		code += `response = requests.${parsed.method.toLowerCase()}(url, headers=headers)\n`;
	}
	code += `print(response.status_code)\nprint(response.json())`;
	return code;
}

function ipToLong(ip: string): number | null {
	const parts = ip.split('.').map((p) => Number(p));
	if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) return null;
	return ((parts[0]! << 24) | (parts[1]! << 16) | (parts[2]! << 8) | parts[3]!) >>> 0;
}

function longToIp(long: number): string {
	return [
		(long >>> 24) & 255,
		(long >>> 16) & 255,
		(long >>> 8) & 255,
		long & 255,
	].join('.');
}

// --- IPv6 / CIDR -----------------------------------------------------------------
// 128-bit addresses live in BigInt. Parsing honours the RFC 4291 text form:
// '::' collapses one run of zero groups (at most once), groups are 1–4 hex
// digits, and an IPv4 tail (e.g. ::ffff:192.168.1.1) counts as two groups.

/** Parse an IPv6 address string to a 128-bit BigInt, or null. */
export function parseIpv6(s: string): bigint | null {
	const t = s.trim().toLowerCase();
	if (!t) return null;
	const dbl = t.split('::');
	if (dbl.length > 2) return null;
	const hasDbl = dbl.length === 2;

	const parseGroups = (part: string): bigint[] | null => {
		if (part === '') return [];
		const groups = part.split(':');
		const out: bigint[] = [];
		for (let i = 0; i < groups.length; i++) {
			const g = groups[i]!;
			// embedded IPv4 tail: only legal in the last group
			if (g.includes('.')) {
				if (i !== groups.length - 1) return null;
				const v4 = ipToLong(g);
				if (v4 === null) return null;
				out.push(BigInt(v4 >>> 16), BigInt(v4 & 0xffff));
			} else {
				if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
				out.push(BigInt(parseInt(g, 16)));
			}
		}
		return out;
	};

	const head = parseGroups(dbl[0]!);
	if (head === null) return null;
	const tail = hasDbl ? parseGroups(dbl[1]!) : [];
	if (tail === null) return null;
	const total = head.length + tail.length;
	if (total > 8) return null;
	if (!hasDbl && total !== 8) return null;

	let v = 0n;
	for (const g of head) v = (v << 16n) | g;
	if (hasDbl) v <<= BigInt(16 * (8 - total));
	for (const g of tail!) v = (v << 16n) | g;
	return v;
}

/** Format a 128-bit BigInt as IPv6, compressing the longest zero run to '::'. */
export function bigIntToIpv6(v: bigint): string {
	const groups: string[] = [];
	for (let i = 7; i >= 0; i--) {
		groups.push(((v >> BigInt(i * 16)) & 0xffffn).toString(16));
	}
	// longest run of ≥2 zero groups, first one wins ties
	let bestStart = -1;
	let bestLen = 0;
	let i = 0;
	while (i < 8) {
		if (groups[i] === '0') {
			let j = i;
			while (j < 8 && groups[j] === '0') j++;
			if (j - i > bestLen) {
				bestLen = j - i;
				bestStart = i;
			}
			i = j;
		} else i++;
	}
	if (bestLen >= 2) {
		return `${groups.slice(0, bestStart).join(':')}::${groups.slice(bestStart + bestLen).join(':')}`;
	}
	return groups.join(':');
}

function ipv6Scope(v: bigint): { en: string; zh: string } {
	if (v === 0n) return { en: 'Unspecified (::)', zh: '未指定地址 (::)' };
	if (v === 1n) return { en: 'Loopback (::1)', zh: '回环地址 (::1)' };
	if ((v >> 120n) === 0xffn) return { en: 'Multicast (ff00::/8)', zh: '组播地址 (ff00::/8)' };
	// fe80::/10: top 10 bits are 1111111010 (0x3FA)
	if ((v >> 118n) === 0x3fan) return { en: 'Link-Local (fe80::/10)', zh: '链路本地 (fe80::/10)' };
	// fc00::/7: top 7 bits are 1111110 (0x7E)
	if ((v >> 121n) === 0x7en) return { en: 'Unique Local (fc00::/7, ULA)', zh: '唯一本地地址 (fc00::/7, ULA)' };
	if ((v >> 125n) === 0x1n) return { en: 'Global Unicast (2000::/3)', zh: '全球单播地址 (2000::/3)' };
	return { en: 'Reserved / Special', zh: '保留 / 特殊用途' };
}

/** IPv6 CIDR breakdown; input is `addr` or `addr/prefix`, prefix defaults to 64. */
export function parseCidr6(input: string) {
	const parts = input.trim().split('/');
	if (parts.length > 2) return null;
	const prefix = parts[1] !== undefined ? Number(parts[1]) : 64;
	if (!Number.isInteger(prefix) || prefix < 0 || prefix > 128) return null;
	const ip = parseIpv6(parts[0]!);
	if (ip === null) return null;

	const mask = prefix === 0 ? 0n : ((1n << BigInt(prefix)) - 1n) << BigInt(128 - prefix);
	const network = ip & mask;
	const last = network | (~mask & ((1n << 128n) - 1n));
	const total = 1n << BigInt(128 - prefix);
	const scope = ipv6Scope(network);

	return {
		ip: bigIntToIpv6(ip),
		cidr: `${bigIntToIpv6(network)}/${prefix}`,
		network: bigIntToIpv6(network),
		lastAddress: bigIntToIpv6(last),
		prefix,
		total: total.toLocaleString('en-US'),
		scope: scope.en,
		scopeZh: scope.zh,
	};
}

function parseCidrCalc(input: string) {
	const parts = input.trim().split('/');
	if (parts.length > 2) return null;
	const ipStr = parts[0]!;
	const maskBits = parts[1] !== undefined ? Number(parts[1]) : 24;
	if (!Number.isInteger(maskBits) || maskBits < 0 || maskBits > 32) return null;

	const ipLong = ipToLong(ipStr);
	if (ipLong === null) return null;

	const maskLong = maskBits === 0 ? 0 : (0xffffffff << (32 - maskBits)) >>> 0;
	const wildcardLong = (~maskLong) >>> 0;
	const netLong = (ipLong & maskLong) >>> 0;
	const bcastLong = (netLong | wildcardLong) >>> 0;

	const totalHosts = maskBits >= 31 ? (maskBits === 32 ? 1 : 2) : Math.pow(2, 32 - maskBits);
	const usableHosts = maskBits >= 31 ? totalHosts : Math.max(0, totalHosts - 2);

	const firstUsable = maskBits >= 31 ? netLong : netLong + 1;
	const lastUsable = maskBits >= 31 ? bcastLong : bcastLong - 1;

	const firstOctet = (ipLong >>> 24) & 255;
	let ipClass = 'A';
	if (firstOctet >= 128 && firstOctet <= 191) ipClass = 'B';
	else if (firstOctet >= 192 && firstOctet <= 223) ipClass = 'C';
	else if (firstOctet >= 224 && firstOctet <= 239) ipClass = 'D (Multicast)';
	else if (firstOctet >= 240) ipClass = 'E (Experimental)';

	let isPrivate = false;
	if (firstOctet === 10) isPrivate = true;
	else if (firstOctet === 172 && ((ipLong >>> 16) & 255) >= 16 && ((ipLong >>> 16) & 255) <= 31) isPrivate = true;
	else if (firstOctet === 192 && ((ipLong >>> 16) & 255) === 168) isPrivate = true;
	else if (firstOctet === 127) isPrivate = true;

	return {
		ip: longToIp(ipLong),
		cidr: `${longToIp(ipLong)}/${maskBits}`,
		netmask: longToIp(maskLong),
		wildcard: longToIp(wildcardLong),
		network: longToIp(netLong),
		broadcast: longToIp(bcastLong),
		firstUsable: longToIp(firstUsable),
		lastUsable: longToIp(lastUsable),
		totalHosts: totalHosts.toLocaleString(),
		usableHosts: usableHosts.toLocaleString(),
		ipClass,
		scope: isPrivate ? 'Private / Internal (RFC 1918)' : 'Public Internet',
		scopeZh: isPrivate ? '私有网络 IP (RFC 1918 / 局域网)' : '公网 IP (Public Internet)',
	};
}

function formatJsTsCode(code: string, mode: 'beautify' | 'minify'): string {
	if (!code.trim()) return '';
	if (mode === 'minify') {
		let out = '';
		let inStr = false;
		let strChar = '';
		let inComment = false;
		let inBlockComment = false;

		for (let i = 0; i < code.length; i++) {
			const ch = code[i]!;
			const next = code[i + 1] || '';

			if (inComment) {
				if (ch === '\n') inComment = false;
				continue;
			}
			if (inBlockComment) {
				if (ch === '*' && next === '/') {
					inBlockComment = false;
					i++;
				}
				continue;
			}
			if (inStr) {
				out += ch;
				if (ch === strChar && code[i - 1] !== '\\') {
					inStr = false;
				}
				continue;
			}
			if (ch === '/' && next === '/') {
				inComment = true;
				i++;
				continue;
			}
			if (ch === '/' && next === '*') {
				inBlockComment = true;
				i++;
				continue;
			}
			if (ch === "'" || ch === '"' || ch === '`') {
				inStr = true;
				strChar = ch;
				out += ch;
				continue;
			}

			if (/\s/.test(ch)) {
				const lastChar = out.slice(-1);
				if (lastChar && /[a-zA-Z0-9_$]/.test(lastChar) && /[a-zA-Z0-9_$]/.test(next)) {
					out += ' ';
				}
				continue;
			}

			out += ch;
		}
		return out.trim();
	}

	let indent = 0;
	let out = '';
	let inStr = false;
	let strChar = '';
	let inComment = false;
	let inBlockComment = false;
	let newLine = true;

	const getIndent = () => '  '.repeat(indent);

	for (let i = 0; i < code.length; i++) {
		const ch = code[i]!;
		const next = code[i + 1] || '';

		if (inComment) {
			out += ch;
			if (ch === '\n') {
				inComment = false;
				newLine = true;
			}
			continue;
		}
		if (inBlockComment) {
			out += ch;
			if (ch === '*' && next === '/') {
				out += '/';
				i++;
				inBlockComment = false;
			}
			continue;
		}
		if (inStr) {
			out += ch;
			if (ch === strChar && code[i - 1] !== '\\') {
				inStr = false;
			}
			continue;
		}

		if (ch === '/' && next === '/') {
			inComment = true;
			if (newLine) {
				out += getIndent();
				newLine = false;
			}
			out += '//';
			i++;
			continue;
		}
		if (ch === '/' && next === '*') {
			inBlockComment = true;
			if (newLine) {
				out += getIndent();
				newLine = false;
			}
			out += '/*';
			i++;
			continue;
		}
		if (ch === "'" || ch === '"' || ch === '`') {
			inStr = true;
			strChar = ch;
			if (newLine) {
				out += getIndent();
				newLine = false;
			}
			out += ch;
			continue;
		}

		if (ch === '{' || ch === '[' || ch === '(') {
			if (newLine) {
				out += getIndent();
				newLine = false;
			}
			out += ch;
			if (ch === '{') {
				indent++;
				out += '\n';
				newLine = true;
			}
			continue;
		}

		if (ch === '}' || ch === ']' || ch === ')') {
			if (ch === '}') {
				indent = Math.max(0, indent - 1);
				if (!newLine) out += '\n';
				out += getIndent() + '}';
				newLine = false;
			} else {
				out += ch;
			}
			continue;
		}

		if (ch === ';') {
			out += ';\n';
			newLine = true;
			continue;
		}

		if (ch === '\n') {
			if (!newLine) {
				out += '\n';
				newLine = true;
			}
			continue;
		}

		if (/\s/.test(ch)) {
			if (!newLine && !out.endsWith(' ')) {
				out += ' ';
			}
			continue;
		}

		if (newLine) {
			out += getIndent();
			newLine = false;
		}

		out += ch;
	}

	return out.trim();
}

function formatGraphQL(code: string, mode: 'beautify' | 'minify'): string {
	const trimmed = code.trim();
	if (!trimmed) return '';

	if (mode === 'minify') {
		let out = '';
		let inStr = false;
		let inComment = false;
		for (let i = 0; i < trimmed.length; i++) {
			const ch = trimmed[i]!;
			if (inComment) {
				if (ch === '\n') inComment = false;
				continue;
			}
			if (inStr) {
				out += ch;
				if (ch === '"' && trimmed[i - 1] !== '\\') inStr = false;
				continue;
			}
			if (ch === '#') {
				inComment = true;
				continue;
			}
			if (ch === '"') {
				inStr = true;
				out += ch;
				continue;
			}
			if (/\s/.test(ch)) {
				const last = out.slice(-1);
				const next = trimmed[i + 1] || '';
				if (/[a-zA-Z0-9_$]/.test(last) && /[a-zA-Z0-9_$]/.test(next)) {
					out += ' ';
				}
				continue;
			}
			out += ch;
		}
		return out.trim();
	}

	let indent = 0;
	let out = '';
	let inStr = false;
	let inComment = false;
	let newLine = true;

	const getIndent = () => '  '.repeat(indent);

	for (let i = 0; i < trimmed.length; i++) {
		const ch = trimmed[i]!;

		if (inComment) {
			out += ch;
			if (ch === '\n') {
				inComment = false;
				newLine = true;
			}
			continue;
		}
		if (inStr) {
			out += ch;
			if (ch === '"' && trimmed[i - 1] !== '\\') inStr = false;
			continue;
		}
		if (ch === '#') {
			inComment = true;
			if (newLine) out += getIndent();
			out += ch;
			newLine = false;
			continue;
		}
		if (ch === '"') {
			inStr = true;
			if (newLine) {
				out += getIndent();
				newLine = false;
			}
			out += ch;
			continue;
		}

		if (ch === '{') {
			if (newLine) {
				out += getIndent();
				newLine = false;
			}
			out += ' {\n';
			indent++;
			newLine = true;
			continue;
		}

		if (ch === '}') {
			indent = Math.max(0, indent - 1);
			if (!newLine) out += '\n';
			out += getIndent() + '}\n';
			newLine = true;
			continue;
		}

		if (ch === '\n') {
			if (!newLine) {
				out += '\n';
				newLine = true;
			}
			continue;
		}

		if (/\s/.test(ch)) {
			if (!newLine && !out.endsWith(' ') && !out.endsWith('\n')) {
				out += ' ';
			}
			continue;
		}

		if (newLine) {
			out += getIndent();
			newLine = false;
		}

		out += ch;
	}

	return out.replace(/\n\s*\n/g, '\n').trim();
}

function getVisualWidth(str: string): number {
	let len = 0;
	for (const ch of str) {
		const code = ch.codePointAt(0) || 0;
		if (
			(code >= 0x1100 && code <= 0x115f) ||
			(code >= 0x2e80 && code <= 0xa4cf) ||
			(code >= 0xac00 && code <= 0xd7a3) ||
			(code >= 0xf900 && code <= 0xfaff) ||
			(code >= 0xfe10 && code <= 0xfe19) ||
			(code >= 0xfe30 && code <= 0xfe6f) ||
			(code >= 0xff00 && code <= 0xff60) ||
			(code >= 0xffe0 && code <= 0xffe6) ||
			(code >= 0x20000 && code <= 0x323af)
		) {
			len += 2;
		} else {
			len += 1;
		}
	}
	return len;
}

function formatMarkdownTable(text: string, mode: 'align' | 'compact'): string {
	const lines = text.split(/\r?\n/);
	const tableLines: { index: number; line: string }[] = [];

	lines.forEach((line, index) => {
		if (line.trim().startsWith('|') || (line.includes('|') && line.trim().endsWith('|'))) {
			tableLines.push({ index, line: line.trim() });
		}
	});

	if (tableLines.length < 2) {
		return text.trim();
	}

	const parsedRows = tableLines.map((tl) => {
		let raw = tl.line;
		if (raw.startsWith('|')) raw = raw.slice(1);
		if (raw.endsWith('|')) raw = raw.slice(0, -1);
		return raw.split('|').map((cell) => cell.trim());
	});

	const colCount = Math.max(...parsedRows.map((r) => r.length));

	const sepRow = parsedRows[1] || [];
	const alignments: ('left' | 'right' | 'center')[] = [];
	for (let c = 0; c < colCount; c++) {
		const cell = sepRow[c] || '';
		const starts = cell.startsWith(':');
		const ends = cell.endsWith(':');
		if (starts && ends) alignments.push('center');
		else if (ends) alignments.push('right');
		else alignments.push('left');
	}

	if (mode === 'compact') {
		const resultLines = parsedRows.map((row, rIdx) => {
			if (rIdx === 1) {
				const seps = alignments.map((align) => {
					if (align === 'center') return ':---:';
					if (align === 'right') return '---:';
					return ':---';
				});
				return `|${seps.join('|')}|`;
			}
			const cells = Array.from({ length: colCount }, (_, c) => row[c] || '');
			return `|${cells.join('|')}|`;
		});

		const outLines = [...lines];
		tableLines.forEach((tl, i) => {
			outLines[tl.index] = resultLines[i] || '';
		});
		return outLines.join('\n').trim();
	}

	const colWidths: number[] = Array(colCount).fill(3);
	parsedRows.forEach((row, rIdx) => {
		if (rIdx === 1) return;
		for (let c = 0; c < colCount; c++) {
			const cellText = row[c] || '';
			const w = getVisualWidth(cellText);
			colWidths[c] = Math.max(colWidths[c]!, w);
		}
	});

	const padString = (str: string, width: number, align: 'left' | 'right' | 'center') => {
		const visW = getVisualWidth(str);
		const totalPad = Math.max(0, width - visW);
		if (align === 'right') {
			return ' '.repeat(totalPad) + str;
		}
		if (align === 'center') {
			const left = Math.floor(totalPad / 2);
			const right = totalPad - left;
			return ' '.repeat(left) + str + ' '.repeat(right);
		}
		return str + ' '.repeat(totalPad);
	};

	const formattedRows = parsedRows.map((row, rIdx) => {
		if (rIdx === 1) {
			const seps = alignments.map((align, c) => {
				const w = colWidths[c]!;
				if (align === 'center') return ':' + '-'.repeat(Math.max(1, w - 2)) + ':';
				if (align === 'right') return '-'.repeat(Math.max(1, w - 1)) + ':';
				return ':' + '-'.repeat(Math.max(1, w - 1));
			});
			return `| ${seps.join(' | ')} |`;
		}
		const cells = Array.from({ length: colCount }, (_, c) => {
			const cellText = row[c] || '';
			const align = alignments[c] || 'left';
			return padString(cellText, colWidths[c]!, align);
		});
		return `| ${cells.join(' | ')} |`;
	});

	const outLines = [...lines];
	tableLines.forEach((tl, i) => {
		outLines[tl.index] = formattedRows[i] || '';
	});
	return outLines.join('\n').trim();
}

