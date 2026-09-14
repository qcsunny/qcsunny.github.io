// TOML parser / emitter + TOML⇄JSON conversion, for the /devtools/toml-formatter
// tool. No dependencies — the parser covers the constructs people actually paste
// (Cargo.toml, pyproject.toml, config files):
//   [table] and [[array-of-tables]] headers, dotted keys, bare/quoted keys,
//   basic "…" and literal '…' strings, multiline """…""" / '''…''',
//   integers (dec with _ separators, 0x / 0o / 0b), floats (incl. inf / nan),
//   booleans, RFC 3339 date-times (kept as strings), arrays (incl. multiline)
//   and inline tables { k = v }.
// It deliberately does NOT support DTDs or anything XML-adjacent — TOML has none.
// Every malformed construct produces a precise error rather than a guess.
//
// Two integer traps worth knowing about, both of which used to slip through:
//   * TOML 1.0 permits underscores only strictly between two digits, so
//     `1__000` and `100_` are INVALID; this parser used to read them as 1000
//     and 100, silently accepting a file no other TOML tool would read.
//   * TOML integers are 64-bit, JS numbers are exact to 2^53. A value in
//     between is legal TOML that this tool cannot hold, so it is refused
//     instead of being rounded into a plausible-looking wrong number.
//   * The emitter emits only integers inside 2^53 as integers, so its output
//     is always readable again by the parser above; a larger integer-valued
//     number keeps its value and comes out as a float literal instead.

export interface TomlError {
	error: string;
	errorZh: string;
}

/** Is x a TomlError? Lets parse results narrow without casts. */
export function isTomlError(x: unknown): x is TomlError {
	return typeof x === 'object' && x !== null && 'error' in x;
}

interface LogicalLine {
	text: string;
	lineNo: number;
}

// --- phase 1: physical → logical lines ---------------------------------------------

/** Escape sequences of a basic string (single- or multi-line). TOML's set is
 *  JSON's plus \e \xHH \UHHHHHHHH; the \u/\U forms pass through as JSON ones. */
function unescapeBasic(body: string): string {
	let out = '';
	for (let i = 0; i < body.length; i++) {
		if (body[i] !== '\\') {
			out += body[i];
			continue;
		}
		const c = body[i + 1];
		if (c === undefined) throw new Error('dangling backslash at end of string');
		if (c === 'n') out += '\n';
		else if (c === 't') out += '\t';
		else if (c === 'r') out += '\r';
		else if (c === '"') out += '"';
		else if (c === '\\') out += '\\';
		else if (c === 'b') out += '\b';
		else if (c === 'f') out += '\f';
		else if (c === 'e') out += '\x1b';
		else if (c === 'u' || c === 'U') {
			const width = c === 'u' ? 4 : 8;
			const hex = body.slice(i + 2, i + 2 + width);
			if (hex.length < width) throw new Error(`incomplete \\${c} escape`);
			out += String.fromCodePoint(parseInt(hex, 16));
			i += 1 + width;
			continue;
		} else if (c === '\n') {
			// Line-ending backslash in a multiline string: swallow the newline and
			// leading whitespace of the next line.
			let j = i + 2;
			while (j < body.length && /\s/.test(body[j])) j++;
			i = j - 1;
			continue;
		} else throw new Error(`unknown escape sequence "\\${c}"`);
		i++;
	}
	return out;
}

/** Join multiline strings and multiline arrays into single logical lines.
 *  Comments inside an array body would corrupt the bracket count and hide the
 *  continuation, so they are stripped per line here; comments after a
 *  non-array value are stripped later, in parseKeyValue. */
function logicalLines(text: string): LogicalLine[] {
	const phys = text.replace(/\r\n/g, '\n').split('\n');
	const out: LogicalLine[] = [];
	let i = 0;
	while (i < phys.length) {
		const lineNo = i + 1;
		let line = phys[i];
		if (!line.trim()) {
			i++;
			continue;
		}
		// A multiline string opens when """ or ''' appears; join lines until the
		// matching triple closes. The value must be on the right of "=".
		const openIdx = findMultilineOpen(line);
		if (openIdx !== -1) {
			const delim = line.slice(openIdx, openIdx + 3);
			const closeAt = line.indexOf(delim, openIdx + 3);
			if (closeAt !== -1) {
				// Opens and closes on this one physical line - collapse to the same
				// single-line placeholder the multiline branch uses. Skipping here
				// dropped the whole "key = value" from the parsed document.
				const inner = line.slice(openIdx + 3, closeAt);
				const value = delim === '"""' ? unescapeBasic(inner) : inner;
				// Anything left after the closer besides a comment means the inner """
				// was an unescaped early terminator, not part of the value - reject
				// instead of silently truncating. A bare trailing quote is kept lenient:
				// an even-length run ("""a"""" = escaped "" plus the closer) is genuinely
				// ambiguous for indexOf, and rejecting valid TOML would be the worse call.
				const tail = stripComment(line.slice(closeAt + 3)).trim();
				if (tail && !/^["'\s]+$/u.test(tail)) {
					throw new Error(`line ${lineNo}: unexpected content after multiline string`);
				}
				line = line.slice(0, openIdx) + JSON.stringify(value);
				out.push({ text: line, lineNo });
				i++;
				continue;
			}
			let body = line.slice(openIdx + 3);
			let closed = false;
			while (i + 1 < phys.length && !closed) {
				const next = phys[i + 1];
				const end = next.indexOf(delim);
				if (end !== -1) {
					body += '\n' + next.slice(0, end);
					// Keep any trailing content (e.g. a comment) after the closer.
					line = line.slice(0, openIdx) + next.slice(end + 3);
					closed = true;
				} else {
					body += '\n' + next;
				}
				i++;
			}
			if (!closed) throw new Error(`line ${lineNo}: unterminated multiline string ${delim}`);
			// Rebuild: "key = " + a single-line quoted placeholder.
			const value =
				delim === '"""'
					? unescapeBasic(body.replace(/^\n/, ''))
					: body.replace(/^\n/, '');
			line = line.slice(0, openIdx) + JSON.stringify(value);
			out.push({ text: line, lineNo });
			i++;
			continue;
		}
		// An array whose brackets are still open swallows following lines. A
		// comment is stripped from each physical line as we go: left in the joined
		// text it would hide the continuation (the later stripComment would cut
		// the line at the "#"), and a "]" inside one could lie about the depth.
		if (openArrayDepth(stripComment(line)) > 0) {
			let joined = stripComment(line);
			while (i + 1 < phys.length && openArrayDepth(joined) > 0) {
				i++;
				const cont = stripComment(phys[i].trim());
				if (!cont) continue;
				joined += ' ' + cont;
			}
			if (openArrayDepth(joined) > 0) throw new Error(`line ${lineNo}: array is missing its closing "]"`);
			line = joined;
		}
		out.push({ text: line, lineNo });
		i++;
	}
	return out;
}

/** Position of a """ or ''' that starts a VALUE (i.e. after "="), or -1.
 *  Quotes inside an already-closed single-line string must not count. */
function findMultilineOpen(line: string): number {
	const eq = line.indexOf('=');
	if (eq === -1) return -1;
	const after = line.slice(eq + 1);
	const rel = after.search(/"""|'''/);
	if (rel === -1) return -1;
	const abs = eq + 1 + rel;
	// The triple must be preceded only by whitespace since the "=".
	if (line.slice(eq + 1, abs).trim() !== '') return -1;
	return abs;
}

/** Net bracket depth of a line, ignoring brackets inside quoted strings.
 *  Only "[" beyond the first value "[" counts, so the key part is safe. */
function openArrayDepth(line: string): number {
	const eq = line.indexOf('=');
	if (eq === -1) return 0;
	let depth = 0;
	let i = eq + 1;
	while (i < line.length) {
		const ch = line[i];
		if (ch === '"' || ch === "'") {
			const close = line.indexOf(ch, i + 1);
			if (close === -1) return depth; // unterminated quote: let the value parser report it
			i = close + 1;
			continue;
		}
		if (ch === '[') depth++;
		else if (ch === ']') depth--;
		i++;
	}
	return depth;
}

/** Remove a trailing # comment that sits outside quotes; only called on the
 *  value part of a line (never on the key side, where # can be a quoted char). */
function stripComment(s: string): string {
	let inS = false;
	let inD = false;
	for (let i = 0; i < s.length; i++) {
		const ch = s[i];
		if (ch === "'" && !inD) inS = !inS;
		else if (ch === '"' && !inS) inD = !inD;
		else if (ch === '#' && !inS && !inD) return s.slice(0, i);
	}
	return s;
}

// --- value parsing ------------------------------------------------------------------

const DATETIME_RE =
	/^\d{4}-\d{2}-\d{2}([Tt ]\d{2}:\d{2}:\d{2}(\.\d+)?([Zz]|[+-]\d{2}:\d{2})?)?$/;
const LOCAL_TIME_RE = /^\d{2}:\d{2}:\d{2}(\.\d+)?$/;

// --- integer literals ------------------------------------------------------------------
/** Underscores sit strictly between two digits: `1_000` ok, `1__000` / `100_` no.
 *  The same regex also doubles as a "only legal characters" check. */
const DIGIT_RUN: Record<number, RegExp> = {
	16: /^[0-9a-fA-F]+(?:_[0-9a-fA-F]+)*$/,
	8: /^[0-7]+(?:_[0-7]+)*$/,
	2: /^[01]+(?:_[01]+)*$/,
	10: /^[0-9]+(?:_[0-9]+)*$/,
};
const DIGIT_CLASS: Record<number, string> = { 16: '0-9a-fA-F', 8: '0-7', 2: '01', 10: '0-9' };

/** Two different failures deserve two different messages: a character that may
 *  never appear here, versus a well-formed digit run with a misplaced `_`. */
function badDigitMessage(part: string, kind: 'integer' | 'float', base: number, raw: string): string {
	const shown = raw.slice(0, 30);
	if (!part) return `invalid ${kind} "${shown}" — a dot needs digits on both sides`;
	if (part.startsWith('_') || part.endsWith('_') || part.includes('__')) {
		return `invalid ${kind} "${shown}" — underscores may only separate two digits`;
	}
	const odd = [...part].find((c) => new RegExp(`[^_${DIGIT_CLASS[base]!}]`).test(c));
	if (odd !== undefined) return `invalid ${kind} "${shown}" — unexpected character "${odd}"`;
	return `invalid ${kind} "${shown}" — underscores may only separate two digits`;
}

/** Check a float's integer and fractional parts (underscores allowed there). */
function assertUnderscores(mant: string, raw: string): void {
	for (const part of mant.replace(/^[+-]/, '').split('.')) {
		if (!DIGIT_RUN[10]!.test(part)) throw new Error(badDigitMessage(part, 'float', 10, raw));
	}
}

/** Exponent parts carry no underscores at all: `1e1_0` is not TOML. */
function assertNoUnderscore(exp: string, raw: string): void {
	if (exp.includes('_')) {
		throw new Error(`invalid float "${raw.slice(0, 30)}" — underscores are not allowed in an exponent`);
	}
}

/**
 * Validate and convert a TOML integer literal.
 *
 * TOML integers are signed 64-bit; a JS `Number` is exact only inside 2^53, so
 * both failures used to be silent — and they collapsed onto the same answer:
 *   `9223372036854775808`  (2^63, INVALID TOML)  → 9223372036854776000
 *   `9223372036854775807`  (2^63 − 1, valid TOML) → 9223372036854776000
 * A legal file and an illegal one mapping to one wrong number is not a parser.
 */
function parseTomlInt(raw: string, base: 10 | 16 | 8 | 2): number {
	const sign = raw[0] === '+' || raw[0] === '-' ? raw[0] : '';
	const body = raw.slice(sign.length).replace(/^0[xob]/, '');
	if (!DIGIT_RUN[base]!.test(body)) throw new Error(badDigitMessage(body, 'integer', base, raw));
	// Base 10 only: `007` is not a TOML integer (0x01 is).
	if (base === 10 && body.length > 1 && body.startsWith('0')) {
		throw new Error(`invalid integer "${raw.slice(0, 30)}" — decimal integers may not start with a zero`);
	}
	// BigInt is told the radix, and the sign is kept out of the literal:
	// `0x1A` is 26, `0b101` is 5, and `BigInt("-0x10")` is a SyntaxError.
	const prefix = base === 16 ? '0x' : base === 8 ? '0o' : base === 2 ? '0b' : '';
	const mag = BigInt(prefix + body.replace(/_/g, ''));
	const negative = sign === '-';
	const value = negative ? -mag : mag;
	// The negative bound is one wider: −2^63 is a legal TOML integer.
	const maxAbs = negative ? 9223372036854775808n : 9223372036854775807n;
	if (mag > maxAbs) {
		throw new Error(`integer "${raw.slice(0, 30)}" is outside TOML's signed 64-bit range (−9223372036854775808 … 9223372036854775807)`);
	}
	const n = Number(value);
	if (!Number.isSafeInteger(n)) {
		throw new Error(
			`integer "${raw.slice(0, 30)}" is valid TOML but exceeds 2^53 − 1, the largest integer a JS number can hold exactly — quote it as a string instead`,
		);
	}
	return n;
}

function parseValue(raw: string): unknown {
	const s = raw.trim();
	if (s === '') throw new Error('missing value after "="');
	if (s.startsWith('"')) {
		if (!s.endsWith('"') || s.length < 2) throw new Error(`unterminated basic string ${s.slice(0, 30)}`);
		return unescapeBasic(s.slice(1, -1));
	}
	if (s.startsWith("'")) {
		if (!s.endsWith("'") || s.length < 2) throw new Error(`unterminated literal string ${s.slice(0, 30)}`);
		return s.slice(1, -1);
	}
	if (s.startsWith('[')) return parseArray(s);
	if (s.startsWith('{')) return parseInlineTable(s);
	if (s === 'true') return true;
	if (s === 'false') return false;
	if (DATETIME_RE.test(s) || LOCAL_TIME_RE.test(s)) return s; // kept as string
	if (/^[+-]?inf$/.test(s)) return s.startsWith('-') ? -Infinity : Infinity;
	if (/^[+-]?nan$/.test(s)) return NaN;
	if (/^[+-]?0x[0-9a-fA-F]/.test(s)) return parseTomlInt(s, 16);
	if (/^[+-]?0o[0-7]/.test(s)) return parseTomlInt(s, 8);
	if (/^[+-]?0b[01]/.test(s)) return parseTomlInt(s, 2);
	if (/^[+-]?[0-9]/.test(s) && !/[.eE]/.test(s)) return parseTomlInt(s, 10);
	// Underscores are legal in a float's integer and fractional parts and
	// forbidden in its exponent: `1_0.5_0` ok, `1e1_0` not TOML.
	if (/^[+-]?[0-9][0-9_]*\.[0-9_]*([eE][+-]?[0-9_]+)?$/.test(s)) {
		const i = s.search(/[eE]/);
		const mant = i === -1 ? s : s.slice(0, i);
		assertUnderscores(mant, s);
		if (i !== -1) assertNoUnderscore(s.slice(i + 1).replace(/^[+-]/, ''), s);
		return Number(s.replace(/_/g, ''));
	}
	if (/^[+-]?[0-9][0-9_]*[eE][+-]?[0-9_]+$/.test(s)) {
		const i = s.search(/[eE]/);
		assertUnderscores(s.slice(0, i), s);
		assertNoUnderscore(s.slice(i + 1).replace(/^[+-]/, ''), s);
		return Number(s.replace(/_/g, ''));
	}
	// TOML has no bare strings — this is the classic YAML-habit error.
	throw new Error(`invalid value "${s.slice(0, 30)}" (unquoted strings are not valid TOML — use "quotes")`);
}

/** Split an array / inline-table body on top-level commas. */
function splitFlow(s: string): string[] {
	const parts: string[] = [];
	let depth = 0;
	let i = 0;
	while (i < s.length) {
		const ch = s[i];
		if (ch === '"' || ch === "'") {
			const close = s.indexOf(ch, i + 1);
			i = close === -1 ? s.length : close + 1;
			continue;
		}
		if (ch === '[' || ch === '{') depth++;
		else if (ch === ']' || ch === '}') depth--;
		else if (ch === ',' && depth === 0) {
			parts.push(s.slice(0, i));
			s = s.slice(i + 1);
			i = 0;
			continue;
		}
		i++;
	}
	if (s.trim()) parts.push(s);
	return parts;
}

function parseArray(t: string): unknown[] {
	if (!t.endsWith(']')) throw new Error('array is missing its closing "]"');
	const body = t.slice(1, -1).trim();
	if (!body) return [];
	return splitFlow(body).map((p) => parseValue(p));
}

function parseInlineTable(t: string): Record<string, unknown> {
	if (!t.endsWith('}')) throw new Error('inline table is missing its closing "}"');
	const body = t.slice(1, -1).trim();
	if (!body) return {};
	const out: Record<string, unknown> = {};
	for (const part of splitFlow(body)) {
		const parsed = parseKeyValue(part.trim());
		assignDotted(out, parsed.keys, parsed.value);
	}
	return out;
}

// --- key parsing ---------------------------------------------------------------------

/** Parse a (possibly dotted, possibly quoted) key path like a.b."c.d". */
function parseKeyPath(s: string): string[] {
	const keys: string[] = [];
	let i = 0;
	while (i < s.length) {
		if (s[i] === '"' || s[i] === "'") {
			const close = s.indexOf(s[i], i + 1);
			if (close === -1) throw new Error(`unterminated quoted key ${s.slice(0, 30)}`);
			keys.push(s[i] === '"' ? unescapeBasic(s.slice(i + 1, close)) : s.slice(i + 1, close));
			i = close + 1;
		} else {
			const m = /^[A-Za-z0-9_-]+/.exec(s.slice(i));
			if (!m) throw new Error(`invalid key "${s.slice(0, 30).trim()}"`);
			keys.push(m[0]);
			i += m[0].length;
		}
		if (i < s.length && s[i] === '.') i++;
		else if (i < s.length) throw new Error(`invalid character "${s[i]}" in key "${s.slice(0, 30).trim()}"`);
	}
	if (!keys.length) throw new Error('empty key');
	return keys;
}

function parseKeyValue(s: string): { keys: string[]; value: unknown } {
	const eq = s.indexOf('=');
	if (eq === -1) throw new Error(`expected "key = value", got "${s.slice(0, 30).trim()}"`);
	const keyPart = s.slice(0, eq).trim();
	const valuePart = stripComment(s.slice(eq + 1)).trim();
	return { keys: parseKeyPath(keyPart), value: parseValue(valuePart) };
}

/** True when obj has an own property named key (Object.prototype keys are not). */
function hasOwn(obj: object, key: string): boolean {
	return Object.prototype.hasOwnProperty.call(obj, key);
}

/** Record a parsed key as a real own property. Bracket assignment would reach
 *  Object.prototype.__proto__ for a "__proto__" key and change the prototype
 *  instead of storing the key, so defineProperty keeps the value. */
function setKey(obj: Record<string, unknown>, key: string, value: unknown): void {
	Object.defineProperty(obj, key, { value, enumerable: true, writable: true, configurable: true });
}

/** Set keys[...last] = value inside obj, creating intermediate tables.
 *  Redefining an existing scalar key is an error (TOML forbids duplicates). */
function assignDotted(obj: Record<string, unknown>, keys: string[], value: unknown): void {
	let cur = obj;
	for (let i = 0; i < keys.length - 1; i++) {
		const k = keys[i]!;
		if (!hasOwn(cur, k)) setKey(cur, k, {});
		else if (typeof cur[k] !== 'object' || cur[k] === null) {
			throw new Error(`key "${k}" is already defined as a value, cannot extend it`);
		}
		cur = cur[k] as Record<string, unknown>;
	}
	const last = keys[keys.length - 1]!;
	if (hasOwn(cur, last)) throw new Error(`duplicate key "${keys.join('.')}"`);
	setKey(cur, last, value);
}

// --- parser --------------------------------------------------------------------------

/** Parse TOML into a JS value; throws Error with a "line N: …" message. */
export function parseToml(text: string): Record<string, unknown> {
	const root: Record<string, unknown> = {};
	// Current table = the path of the last [header]; "defined" marks tables that
	// were written explicitly, so a repeated [header] can be rejected.
	let current: Record<string, unknown> = root;
	// Keyed by the table OBJECT, not its path string: [fruits.physical] written once
	// per [[fruits]] item is legal TOML, and each occurrence is a DIFFERENT object
	// at the same path. String keys collided on the path and rejected valid docs.
	const definedTables = new Map<Record<string, unknown>, string>();

	/** Walk/insert a table path; marks it as explicitly defined. */
	function enterTable(path: string[], kind: 'table' | 'array'): Record<string, unknown> {
		let cur: Record<string, unknown> = root;
		for (let i = 0; i < path.length; i++) {
			const k = path[i]!;
			if (i === path.length - 1 && kind === 'array') {
				let arr: unknown = cur[k];
				if (!hasOwn(cur, k)) {
					arr = [];
					setKey(cur, k, arr);
				} else if (!Array.isArray(arr)) {
					throw new Error(`"${path.join('.')}" is already defined as a table, cannot redefine as array of tables`);
				}
				const item: Record<string, unknown> = {};
				(arr as unknown[]).push(item);
				return item;
			}
			let sub: unknown = cur[k];
			if (!hasOwn(cur, k)) {
				sub = {};
				setKey(cur, k, sub);
			} else if (Array.isArray(sub)) {
				// [a] right after [[a]]: the name is already an array of tables, so
				// a [table] header at that name duplicates it - reject rather than
				// silently appending into the last array item.
				if (i === path.length - 1 && kind === 'table') {
					throw new Error(`table [${path.join('.')}] is defined more than once`);
				}
				// Continuing a path THROUGH an array of tables targets its last item.
				if (!sub.length || typeof sub[sub.length - 1] !== 'object') {
					throw new Error(`"${path.slice(0, i + 1).join('.')}" is not a table`);
				}
				cur = sub[sub.length - 1] as Record<string, unknown>;
				continue;
			} else if (typeof sub !== 'object' || sub === null) {
				throw new Error(`"${path.slice(0, i + 1).join('.')}" is already defined as a value`);
			}
			cur = sub as Record<string, unknown>;
		}
		if (kind === 'table') {
			if (definedTables.has(cur)) {
				throw new Error(`table [${definedTables.get(cur)}] is defined more than once`);
			}
			definedTables.set(cur, path.join('.'));
		}
		return cur;
	}

	for (const { text: line, lineNo } of logicalLines(text)) {
		const stripped = stripComment(line).trim();
		if (!stripped) continue; // comment-only line (comments after values are stripped in parseKeyValue)
		try {
			const arrTable = /^\[\[(.+)\]\]$/.exec(stripped);
			if (arrTable) {
				current = enterTable(parseKeyPath(arrTable[1]!.trim()), 'array');
				continue;
			}
			const table = /^\[(.+)\]$/.exec(stripped);
			if (table) {
				current = enterTable(parseKeyPath(table[1]!.trim()), 'table');
				continue;
			}
			const { keys, value } = parseKeyValue(stripped);
			assignDotted(current, keys, value);
		} catch (e) {
			throw new Error(`line ${lineNo}: ${e instanceof Error ? e.message : String(e)}`);
		}
	}
	return root;
}

// --- emitter -------------------------------------------------------------------------

const BARE_KEY_RE = /^[A-Za-z0-9_-]+$/;

function emitKey(k: string): string {
	return BARE_KEY_RE.test(k) ? k : JSON.stringify(k);
}

function emitString(s: string): string {
	// A value that round-trips as a TOML date-time is emitted bare; anything
	// else takes the JSON escape set, which is a valid TOML basic string.
	if (DATETIME_RE.test(s) || LOCAL_TIME_RE.test(s)) return s;
	return JSON.stringify(s);
}

/**
 * Write a JS number so that this parser reads it back unchanged.
 *
 * Only integers inside 2^53 come out as TOML integers — those are exactly the
 * integers parseTomlInt accepts, so emitted output is always readable again.
 * A larger integer-valued number keeps its value and gives up only its type:
 * a TOML float literal, which must carry a dot or an exponent, and String()
 * supplies one only from 1e21 upward, so 2^53 needs a `.0` bolted on.
 */
function tomlNumber(v: number): string {
	if (Number.isSafeInteger(v)) return String(v);
	const s = String(v);
	return /[.eE]/.test(s) ? s : `${s}.0`;
}

function emitScalar(v: unknown): string {
	if (typeof v === 'string') return emitString(v);
	if (v === null) throw new Error('TOML has no null value (drop the key instead)');
	if (typeof v === 'number') {
		if (Number.isNaN(v)) return 'nan';
		if (v === Infinity) return 'inf';
		if (v === -Infinity) return '-inf';
		return tomlNumber(v);
	}
	if (typeof v === 'boolean') return String(v);
	return JSON.stringify(v); // best effort for anything exotic
}

/** Inline form for arrays of scalars / short mixed arrays. */
function emitInlineArray(v: unknown[]): string {
	if (!v.length) return '[]';
	return `[${v.map((item) => (item && typeof item === 'object' ? emitInlineValue(item) : emitScalar(item))).join(', ')}]`;
}

function emitInlineValue(v: unknown): string {
	if (Array.isArray(v)) return emitInlineArray(v);
	if (v && typeof v === 'object') {
		const entries = Object.entries(v as Record<string, unknown>);
		if (!entries.length) return '{}';
		return `{ ${entries.map(([k, val]) => `${emitKey(k)} = ${val && typeof val === 'object' && !Array.isArray(val) ? emitInlineValue(val) : Array.isArray(val) ? emitInlineArray(val) : emitScalar(val)}`).join(', ')} }`;
	}
	return emitScalar(v);
}

function isObjectArray(v: unknown): v is Record<string, unknown>[] {
	return Array.isArray(v) && v.length > 0 && v.every((x) => x && typeof x === 'object' && !Array.isArray(x));
}

/** Emit a JS object as TOML: scalars of `path`'s table first, then one
 *  [section] per nested object and one [[section]] per object array. */
function emitTable(obj: Record<string, unknown>, path: string[], out: string[], asArrayTable = false): void {
	const scalars: [string, unknown][] = [];
	const subTables: [string, Record<string, unknown>][] = [];
	const tableArrays: [string, Record<string, unknown>[]][] = [];
	const inlineArrays: [string, unknown[]][] = [];
	for (const [k, v] of Object.entries(obj)) {
		if (v && typeof v === 'object' && !Array.isArray(v)) subTables.push([k, v as Record<string, unknown>]);
		else if (isObjectArray(v)) tableArrays.push([k, v]);
		else if (Array.isArray(v)) inlineArrays.push([k, v]);
		else if (v === undefined) continue;
		else scalars.push([k, v]);
	}
	// An array-table item ALWAYS needs its [[header]] — without it the item
	// would silently merge into the previous one. A plain table only needs a
	// header when it carries scalars/arrays of its own (or is empty); one that
	// merely wraps sub-tables lets them carry their own deeper headers.
	if (path.length && (asArrayTable || scalars.length || inlineArrays.length || !subTables.length)) {
		out.push(`${asArrayTable ? '[[' : '['}${path.map(emitKey).join('.')}${asArrayTable ? ']]' : ']'}`);
	}
	for (const [k, v] of scalars) out.push(`${emitKey(k)} = ${emitScalar(v)}`);
	for (const [k, v] of inlineArrays) out.push(`${emitKey(k)} = ${emitInlineArray(v)}`);
	for (const [k, v] of subTables) emitTable(v, [...path, k], out);
	for (const [k, arr] of tableArrays) {
		for (const item of arr) emitTable(item, [...path, k], out, true);
	}
}

// --- public API -----------------------------------------------------------------------

/** Format = parse then emit with canonical sections. */
export function formatToml(text: string): string {
	const lines: string[] = [];
	emitTable(parseToml(text), [], lines);
	return (lines.length ? lines.join('\n') + '\n' : '');
}

/** TOML text → JSON text (2-space pretty; Infinity/NaN become strings). */
export function tomlToJson(text: string): string {
	const data = JSON.parse(JSON.stringify(parseToml(text), (_k, v) => (typeof v === 'number' && !Number.isFinite(v) ? String(v) : v)));
	return JSON.stringify(data, null, 2) + '\n';
}

/** JSON text → TOML text. */
export function jsonToToml(jsonText: string): string {
	const data = JSON.parse(jsonText);
	if (!data || typeof data !== 'object' || Array.isArray(data)) {
		throw new Error('the JSON root must be an object for TOML conversion');
	}
	const lines: string[] = [];
	emitTable(data, [], lines);
	return (lines.length ? lines.join('\n') + '\n' : '');
}
