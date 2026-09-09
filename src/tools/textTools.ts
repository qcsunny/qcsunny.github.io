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

export const TEXT_TOOLS: ToolEntry[] = [
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
	{
		slug: 'markdown-preview',
		category: 'utilities',
		name: 'Markdown Live Editor & Previewer',
		nameZh: 'Markdown 实时渲染与预览编辑器',
		description: 'Live split-screen Markdown rendering with GitHub Flavored Markdown (GFM), tables, task lists, code syntax, KaTeX-typeset maths, and HTML export.',
		descriptionZh: '纯本地双栏实时 Markdown 渲染编辑器，支持 GFM 全语法、LaTeX 公式排版与 HTML 导出。',
		kind: 'markdown',
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
		slug: 'word-counter',
		category: 'utilities',
		name: 'Word Counter',
		nameZh: '在线字数统计',
		description: 'Live word, character, sentence and paragraph counts plus reading time.',
		descriptionZh: '实时统计词数、字符数、句子数、段落数与预估阅读时长。',
		kind: 'text',
		config: {
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
			placeholder: 'Type or paste text…',
			placeholderZh: '在此输入或粘贴文本…',
			stats: charStats,
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
					type: 'text',
					def: 'ff',
					placeholder: 'e.g. ff, 255, 11111111',
					placeholderZh: '例如 ff、255、11111111',
					required: true,
				},
			],
			compute: (v) => {
				const base = Number(v.str('base') || '16');
				const raw = v.str('number');
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
					type: 'number',
					def: '0',
					step: 'any',
					min: '0',
					required: true,
					hint: 'Seconds since 1970-01-01 00:00:00 UTC.',
					hintZh: '自 1970-01-01 00:00:00 (UTC) 以来的秒数。',
				},
			],
			compute: (v) => {
				const sec = v.num('seconds');
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
					type: 'text',
					def: '0 12 * * *',
					placeholder: 'minute hour day month weekday',
					placeholderZh: '分 时 日 月 周',
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
		slug: 'hash-generator',
		category: 'devtools',
		name: 'SHA-256 Hash Generator',
		nameZh: 'SHA-256 哈希生成器',
		description: 'Compute the SHA-256 digest of any text entirely in your browser.',
		descriptionZh: '在本机浏览器内计算任意文本的 SHA-256 摘要。',
		kind: 'text',
		config: {
			placeholder: 'Type or paste text to hash…',
			placeholderZh: '输入或粘贴需要求哈希的文本…',
			mono: true,
			live: true,
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
					{
						label: 'Algorithm',
						labelZh: '算法',
						value: 'SHA-256 (256-bit)',
					},
				];
			},
			transforms: [
				{
					id: 'hash',
					label: 'Generate SHA-256',
					labelZh: '生成哈希',
					run: async (text: string) => {
						if (!text) return { output: '—' };
						const hash = await sha256Async(text);
						return { output: `SHA-256 ${hash}` };
					},
				},
			],
		},
	},
];
