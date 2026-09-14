// YAML block-subset parser / emitter + YAML⇄JSON conversion, for the
// /devtools/yaml-formatter tool. No dependencies — the parser intentionally
// covers the block style people actually paste into a validator:
//   mappings, nested mappings and sequences by indentation,
//   "- " sequence items (including "- key: value" compact nested maps),
//   plain / single-quoted / double-quoted scalars, numbers, booleans, null
//   (null, ~, empty), inline flow sequences [a, b] and flow maps {k: v},
//   # comments, and a leading document separator '---'.
// It deliberately does NOT support: anchors & aliases, multi-line literal
// | and folded > blocks, tags (!!str), multiple documents, or complex keys.
// A block scalar indicator in a block position is rejected outright rather
// than read as the string "|" — that silent fallback is what made
// "text: |" at the end of a document parse as a literal pipe character. The same
// principle covers every indicator that cannot open a plain scalar: "- - x",
// "a: - 1", "- : x" and "a: b: c" would each be swallowed as ordinary text and
// report a wrong value, so all of them error instead. Duplicate keys are rejected
// too — a repeat silently drops the earlier value, which in a formatter means
// data loss with no warning.
// Every unsupported construct produces a precise error rather than a guess.

export interface YamlError {
	error: string;
	errorZh: string;
}

interface Line {
	indent: number;
	content: string; // comment-stripped, right-trimmed, without leading spaces
	raw: string;
	lineNo: number;
}

/** Is x a YamlError? Lets parse results narrow without casts. */
export function isYamlError(x: unknown): x is YamlError {
	return typeof x === 'object' && x !== null && 'error' in x;
}

// "|", ">", "2|", "|-", "|2-" etc. start a block scalar — but only in a
// BLOCK value position. Inside a flow collection ([|], {a: |}) the same
// token is an ordinary plain scalar, so this check belongs at the block
// entry points, not inside parseScalar.
const BLOCK_SCALAR_RE = /^[|>][-+0-9]*$/;

function assertNotBlockScalar(line: Line, tok: string): void {
	if (BLOCK_SCALAR_RE.test(tok.trim())) {
		throw new Error(
			`line ${line.lineNo}: block scalars ("|" literal and ">" folded) are not supported`,
		);
	}
}

// --- tokenizer ------------------------------------------------------------------------

/** Strip comments (only outside quotes) and blank lines; compute indentation. */
function lexLines(text: string): Line[] {
	const out: Line[] = [];
	const src = text.replace(/\r\n/g, '\n');
	const lines = src.split('\n');
	for (let i = 0; i < lines.length; i++) {
		const raw = lines[i];
		if (!raw.trim()) continue;
		// A tab inside the leading whitespace sets the indentation column, and
		// 0x09 is not a legal indent character - accepting it makes
		// "a:\n\tb: 1" parse as a nested map at a column no reader can see.
		if (raw.slice(0, raw.length - raw.trimStart().length).includes('\t')) {
			throw new Error(`line ${i + 1}: tabs cannot be used for indentation`);
		}
		if (/^---\s*$/.test(raw.trim()) && out.length === 0) continue; // leading document separator
		if (/^\.\.\.\s*$/.test(raw.trim())) continue; // document end
		const indent = raw.length - raw.trimStart().length;
		let content = stripComment(raw.trimStart());
		content = content.trimEnd();
		if (!content) continue;
		out.push({ indent, content, raw, lineNo: i + 1 });
	}
	return out;
}

/** Remove a trailing # comment that is outside single/double quotes. */
function stripComment(s: string): string {
	let inS = false;
	let inD = false;
	for (let i = 0; i < s.length; i++) {
		const ch = s[i];
		if (ch === "'" && !inD) inS = !inS;
		else if (ch === '"' && !inS) inD = !inD;
		else if (ch === '#' && !inS && !inD && (i === 0 || /\s/.test(s[i - 1]))) return s.slice(0, i);
	}
	return s;
}

// --- scalar parsing ------------------------------------------------------------------

const SCALAR_MAP: Record<string, unknown> = {
	null: null,
	Null: null,
	NULL: null,
	'~': null,
	true: true,
	True: true,
	TRUE: true,
	false: false,
	False: false,
	FALSE: false,
};

/** Parse a scalar token: quoted strings, flow collections, numbers, bool/null. */
function parseScalar(tok: string, lineNo = 0): unknown {
	const t = tok.trim();
	const where = lineNo ? `line ${lineNo}: ` : '';
	if (t === '') return null;
	if (t.startsWith('"') || t.startsWith("'")) {
		const q = t[0];
		if (!(t.endsWith(q) && t.length >= 2)) {
			throw new Error(`${where}a quoted scalar is left unterminated ("${t.slice(0, 30)}")`);
		}
	}
	if (t.startsWith('"') && t.length >= 2) {
		// Double-quoted: every escape YAML defines. \xXX, \uXXXX and \UXXXXXXXX
		// must be DECODED - keeping them verbatim reports the wrong string.
		const SIMPLE: Record<string, string> = {
			0: '\0', a: '\x07', b: '\b', t: '\t', n: '\n', v: '\x0b', f: '\f', r: '\r',
			e: '\x1b', '"': '"', '\\': '\\', '/': '/',
			N: '\u0085', _: '\u00a0', L: '\u2028', P: '\u2029',
		};
		const HEX: Record<string, number> = { x: 2, u: 4, U: 8 };
		let out = '';
		for (let i = 1; i < t.length - 1; i++) {
			if (t[i] !== '\\') { out += t[i]; continue; }
			i++;
			const c = t[i];
			if (c === undefined) throw new Error(`${where}a backslash ends the string`);
			if (Object.prototype.hasOwnProperty.call(SIMPLE, c)) { out += SIMPLE[c]!; continue; }
			const n = HEX[c];
			if (n !== undefined) {
				const hex = t.slice(i + 1, i + 1 + n);
				if (!new RegExp(`^[0-9a-fA-F]{${n}}$`).test(hex)) {
					throw new Error(`${where}escape "\\${c}" needs ${n} hex digits`);
				}
				out += String.fromCodePoint(parseInt(hex, 16));
				i += n;
				continue;
			}
			throw new Error(`${where}unsupported escape "\\${c}"`);
		}
		return out;
	}
	if (t.startsWith("'") && t.endsWith("'") && t.length >= 2) {
		// Single-quoted: '' is an escaped quote; no other escapes.
		return t.slice(1, -1).replace(/''/g, "'");
	}
	if (t.startsWith('[')) return parseFlowSeq(t);
	if (t.startsWith('{')) return parseFlowMap(t);
	if (Object.prototype.hasOwnProperty.call(SCALAR_MAP, t)) return SCALAR_MAP[t];
	// YAML 1.2 core schema number forms.
	if (/^[-+]?\d+$/.test(t)) return parseInt(t, 10);
	if (/^[-+]?(\d+\.\d*|\.\d+|\d+)([eE][-+]?\d+)?$/.test(t) && /[.eE]/.test(t)) return Number(t);
	if (/^0x[0-9a-fA-F]+$/.test(t)) return parseInt(t, 16);
	if (/^0o[0-7]+$/.test(t)) return parseInt(t.slice(2), 8);
	return t; // plain string
}

// Indicators that may not OPEN a plain scalar in YAML. Each of these would
// otherwise be swallowed as ordinary text - "- - x" reading as the string "- x"
// is the silent misparse this exists to stop. Anchors, aliases, tags and explicit
// keys are unsupported by this parser on purpose, so they error instead of being
// parsed as words.
function rejectIndicators(line: Line, tok: string): void {
	const t = tok.trim();
	if (!t) return;
	const c = t[0];
	const next = t.length === 1 ? '' : t[1];
	if ((c === ':' || c === '?') && (next === '' || /\s/.test(next))) {
		throw new Error(
			`line ${line.lineNo}: ${c === ':' ? 'an empty key' : 'explicit "? key" syntax'} is not allowed`,
		);
	}
	if ('*&!@`'.includes(c)) {
		throw new Error(`line ${line.lineNo}: anchors, aliases, tags and reserved indicators (${c}) are not supported`);
	}
}

/** A block value may not continue a collection or open a second "key: " pair. */
function checkBlockValue(line: Line, rest: string): void {
	const t = rest.trim();
	if (t === '-' || t.startsWith('- ')) {
		throw new Error(`line ${line.lineNo}: a "- " sequence item cannot be a block value on the same line`);
	}
	// A closed quoted scalar or a balanced flow collection may contain
	// anything; only a plain scalar is subject to the indicator and "second
	// colon" rules - "a: {k: v, k: w}" must not trip the colon check.
	const q = t[0];
	const quoted = t.length >= 2 && (q === '"' || q === "'") && t[t.length - 1] === q;
	if (!quoted && !isBalancedFlow(t)) {
		rejectIndicators(line, t);
		if (/:(\s|$)/.test(t)) {
			throw new Error(`line ${line.lineNo}: only one "key: value" pair per line`);
		}
	}
}

/** Is t a flow collection ("{…}" / "[…]") whose brackets balance? */
function isBalancedFlow(t: string): boolean {
	if (!(t[0] === '{' || t[0] === '[')) return false;
	let depth = 0;
	let inS = false;
	let inD = false;
	for (let i = 0; i < t.length; i++) {
		const c = t[i];
		if (c === "'" && !inD) inS = !inS;
		else if (c === '"' && !inS) inD = !inD;
		else if (!inS && !inD) {
			if (c === '{' || c === '[') depth++;
			else if (c === '}' || c === ']') depth--;
		}
	}
	return depth === 0 && !inS && !inD;
}

/** Split a flow collection body on top-level commas. */
function splitFlow(s: string): string[] {
	const parts: string[] = [];
	let depth = 0;
	let inS = false;
	let inD = false;
	let cur = '';
	for (let i = 0; i < s.length; i++) {
		const ch = s[i];
		if (ch === "'" && !inD) inS = !inS;
		else if (ch === '"' && !inS) inD = !inD;
		else if (!inS && !inD) {
			if (ch === '[' || ch === '{') depth++;
			else if (ch === ']' || ch === '}') depth--;
			else if (ch === ',' && depth === 0) {
				parts.push(cur);
				cur = '';
				continue;
			}
		}
		cur += ch;
	}
	if (cur.trim()) parts.push(cur);
	return parts;
}

function parseFlowSeq(t: string): unknown[] {
	if (!t.endsWith(']')) throw new Error(`flow sequence is missing its closing "]"`);
	const body = t.slice(1, -1).trim();
	return splitFlow(body).map((p) => parseScalar(p));
}

// Record a parsed key as a real own property. Bracket assignment would reach
// Object.prototype.__proto__ for a "__proto__" key and silently change the
// prototype instead of storing the key, so defineProperty keeps the value.
function setKey(obj: Record<string, unknown>, key: string, value: unknown): void {
	Object.defineProperty(obj, key, { value, enumerable: true, writable: true, configurable: true });
}

function parseFlowMap(t: string): Record<string, unknown> {
	if (!t.endsWith('}')) throw new Error(`flow map is missing its closing "}"`);
	const body = t.slice(1, -1).trim();
	const out: Record<string, unknown> = {};
	// A repeat silently discards the earlier value - reject, as the block parser
	// does for the same case.
	const seen = new Set<string>();
	for (const part of splitFlow(body)) {
		const colon = part.indexOf(':');
		if (colon === -1) throw new Error(`flow map item "${part.trim()}" has no ':'`);
		const key = String(parseScalar(part.slice(0, colon)));
		if (seen.has(key)) throw new Error(`duplicate key "${key}" in a flow map`);
		seen.add(key);
		setKey(out, key, parseScalar(part.slice(colon + 1)));
	}
	return out;
}

// --- parser --------------------------------------------------------------------------

/** Split "key: value" at the first top-level colon (outside quotes / flow). */
function splitKey(content: string): { key: string; rest: string } | null {
	let inS = false;
	let inD = false;
	let depth = 0;
	for (let i = 0; i < content.length; i++) {
		const ch = content[i];
		if (ch === "'" && !inD) inS = !inS;
		else if (ch === '"' && !inS) inD = !inD;
		else if (!inS && !inD) {
			if (ch === '[' || ch === '{') depth++;
			else if (ch === ']' || ch === '}') depth--;
			else if (ch === ':' && depth === 0) {
				// "key:" at end, or "key: value" — colon must end the key or be
				// followed by a space (so URLs like http:// in a value don't split).
				if (i === content.length - 1 || content[i + 1] === ' ') {
					const key = content.slice(0, i).trim();
					const rest = content.slice(i + 1).trim();
					if (!key) return null;
					return { key: String(parseScalar(key)), rest };
				}
			}
		}
	}
	return null;
}

/** A re-parsed block must swallow every line it was handed. Anything left over
 *  is a line whose indent sits between the item's indent and the nested block's
 *  - "- a: 1\n b: 2" - and dropping it would report a wrong value. */
function assertBlockConsumed(block: Line[], consumed: number, expected: number): void {
	const left = block[consumed];
	if (left) {
		throw new Error(
			`line ${left.lineNo}: unexpected indent (expected ${expected}, got ${left.indent})`,
		);
	}
}

/** Parse a block node at lines[pos] with the given minimum indent.
 *  Returns [value, nextPos] or throws on malformed input. */
function parseBlock(lines: Line[], pos: number, minIndent: number): [unknown, number] {
	if (pos >= lines.length) return [null, pos];
	const line = lines[pos];
	if (line.indent < minIndent) return [null, pos];

	if (line.content.startsWith('- ') || line.content === '-') {
		return parseBlockSeq(lines, pos, line.indent);
	}
	const kv = splitKey(line.content);
	if (kv) return parseBlockMap(lines, pos, line.indent);
	// A single scalar at document level.
	assertNotBlockScalar(line, line.content);
	rejectIndicators(line, line.content);
	return [parseScalar(line.content, line.lineNo), pos + 1];
}

function parseBlockSeq(lines: Line[], pos: number, indent: number): [unknown[], number] {
	const items: unknown[] = [];
	let i = pos;
	while (i < lines.length) {
		const line = lines[i];
		if (line.indent < indent) break;
		if (line.indent > indent) {
			throw new Error(`line ${line.lineNo}: unexpected indent (expected ${indent}, got ${line.indent})`);
		}
		if (!(line.content.startsWith('- ') || line.content === '-')) {
			// A same-indent line that is not an item ENDS the sequence - it belongs
			// to the enclosing block. Returning rather than throwing lets "a:\n- 1\nb: 3"
			// parse, and lets the caller report what is actually wrong (a duplicate
			// key, a stray line at document root) instead of "expected a dash".
			break;
		}
		const itemBody = line.content === '-' ? '' : line.content.slice(2);
		if (itemBody === '-' || itemBody.startsWith('- ')) {
			// "- - …" is a sequence nested two columns inside this item. Same
			// virtual-line trick as the compact map below: rewrite the first line
			// at indent + 2 so it reads as an item, and collect the rest of this
			// item's lines as-is. Irregular nesting ("- - 1\n   - 2") surfaces as
			// an indent error - never as a misread scalar.
			const nested: Line[] = [{ indent: indent + 2, content: itemBody, raw: line.raw, lineNo: line.lineNo }];
			let j = i + 1;
			while (j < lines.length && lines[j].indent > indent) j++;
			nested.push(...lines.slice(i + 1, j));
			const [val, consumed] = parseBlockSeq(nested, 0, indent + 2);
			assertBlockConsumed(nested, consumed, indent + 2);
			items.push(val);
			i = j;
			continue;
		}
		// Compact nested map: "- key: value" — the key starts 2 columns in.
		const kv = splitKey(itemBody);
		if (kv) {
			// Inline map entry inside the item: continue as a map at indent + 2.
			const virtual: Line[] = [{ indent: indent + 2, content: itemBody, raw: line.raw, lineNo: line.lineNo }];
			// Collect following lines whose indent > line.indent (they belong to this item).
			let j = i + 1;
			while (j < lines.length && lines[j].indent > indent) j++;
			virtual.push(...lines.slice(i + 1, j));
			const [val, consumed] = parseBlockMap(virtual, 0, indent + 2);
			assertBlockConsumed(virtual, consumed, indent + 2);
			items.push(val);
			i = j;
			continue;
		}
		if (itemBody.trim() === '') {
			// "- " alone: value is the nested block on following lines.
			const [val, next] = parseBlock(lines, i + 1, indent + 1);
			items.push(val);
			i = next;
			continue;
		}
		// Plain scalar / flow item.
		if (itemBody.trim()) {
			assertNotBlockScalar(line, itemBody);
			rejectIndicators(line, itemBody);
		}
		items.push(parseScalar(itemBody, line.lineNo));
		i++;
	}
	return [items, i];
}

function parseBlockMap(lines: Line[], pos: number, indent: number): [Record<string, unknown>, number] {
	const map: Record<string, unknown> = {};
	// A repeat silently drops the earlier value - reject instead of last-wins.
	const seenKeys = new Set<string>();
	let i = pos;
	while (i < lines.length) {
		const line = lines[i];
		if (line.indent < indent) break;
		if (line.indent > indent) {
			throw new Error(`line ${line.lineNo}: unexpected indent (expected ${indent}, got ${line.indent})`);
		}
		const kv = splitKey(line.content);
		if (!kv) {
			throw new Error(`line ${line.lineNo}: expected "key: value", got "${line.content.slice(0, 30)}"`);
		}
		if (seenKeys.has(kv.key)) {
			throw new Error(`line ${line.lineNo}: duplicate key "${kv.key}"`);
		}
		seenKeys.add(kv.key);
		if (line.content.startsWith('- ')) {
			throw new Error(`line ${line.lineNo}: sequence item where a mapping key was expected`);
		}
		if (kv.rest === '') {
			// "key:" — value is the nested block that follows (may be empty → null).
			// Two legal shapes: deeper-indented block, or a sequence at the SAME
			// indent (very common in the wild): "items:\n- a\n- b".
			const next = lines[i + 1];
			if (next && next.indent === indent && (next.content.startsWith('- ') || next.content === '-')) {
				const [val, p] = parseBlockSeq(lines, i + 1, indent);
				setKey(map, kv.key, val);
				i = p;
				continue;
			}
			let j = i + 1;
			while (j < lines.length && lines[j].indent > indent) j++;
			if (j > i + 1) {
				const [val, p] = parseBlock(lines, i + 1, indent + 1);
				setKey(map, kv.key, val);
				i = p;
			} else {
				setKey(map, kv.key, null);
				i = j;
			}
			continue;
		}
		assertNotBlockScalar(line, kv.rest);
		checkBlockValue(line, kv.rest);
		setKey(map, kv.key, parseScalar(kv.rest, line.lineNo));
		i++;
	}
	return [map, i];
}

/** Parse YAML into a JS value; throws Error with a "line N: …" message. */
export function parseYaml(text: string): unknown {
	const lines = lexLines(text);
	if (lines.length === 0) return null;
	const [val, pos] = parseBlock(lines, 0, 0);
	if (pos < lines.length) {
		throw new Error(`line ${lines[pos].lineNo}: content after the end of the document root`);
	}
	return val;
}

// --- emitter ---------------------------------------------------------------------------

const KEY_RE = /^[A-Za-z0-9_][A-Za-z0-9_-]*$/;

// YAML 1.1 reads these as booleans; the 1.2 core schema reads them as
// strings. Every other token we quote is quoted because it cannot be
// written any other way; these can be, so the answer depends on the
// direction the data is travelling — see the `strict` argument.
const WEAK_BOOL_RE = /^(yes|no|on|off)$/i;

function quoteIfNeeded(s: string, strict = false): string {
	if (s === '') return "''";
	if (/[:#\-?\[\]{},&*!|>'"%@`\n\t]/.test(s) || /^\s|\s$/.test(s) || s !== s.trim()) return JSON.stringify(s);
	if (/^(true|false|null|~)$/i.test(s) || /^[-+]?[.\d]/.test(s) || (strict && WEAK_BOOL_RE.test(s)))
		return JSON.stringify(s);
	return s;
}

function emitScalar(v: unknown, strict = false): string {
	if (v === null) return 'null';
	if (typeof v === 'boolean') return String(v);
	if (typeof v === 'number') return String(v);
	return quoteIfNeeded(String(v), strict);
}

function isPlainKey(k: string): boolean {
	// KEY_RE already excludes every character that cannot open a plain scalar,
	// the bool/null list keeps YAML 1.1 readers (PyYAML) from reading "yes" as
	// true, and the identity check is the exact round-trip condition. It catches
	// keys KEY_RE alone lets through: "1e3" and "0o17" are legal plain scalars,
	// so emitting them bare makes the parser read back 1000 and 15 instead of
	// the strings "1e3" and "0o17" - and object keys are always strings.
	return (
		KEY_RE.test(k) &&
		!/^(true|false|null|~|yes|no|on|off)$/i.test(k) &&
		String(parseScalar(k)) === k
	);
}

/**
 * Emit a JS value as block-style YAML at the given indentation level.
 * `strict` quotes yes/no/on/off; it is off for formatYaml (a formatter must
 * not rewrite what the user's own YAML 1.1 readers see as a boolean) and on
 * for jsonToYaml (JSON's "yes" is unambiguously a string, and only the
 * quoted form keeps that meaning under a 1.1 schema).
 */
function emit(value: unknown, indent: number, strict = false): string {
	const pad = '  '.repeat(indent);
	const lines: string[] = [];
	if (Array.isArray(value)) {
		if (value.length === 0) return '[]';
		for (const item of value) {
			if (item && typeof item === 'object' && !Array.isArray(item)) {
				const sub = emit(item, 0, strict);
				const subLines = sub.split('\n');
				lines.push(`${pad}- ${subLines[0]}`);
				for (const l of subLines.slice(1)) lines.push(`${pad}  ${l}`);
			} else if (Array.isArray(item)) {
				// emit() returns "[]" for an empty array, which would land at
				// column 0 — an unattached collection, not a sequence item.
				if (item.length === 0) {
					lines.push(`${pad}- []`);
					continue;
				}
				const sub = emit(item, indent + 1, strict).split('\n');
				lines.push(`${pad}-`);
				for (const l of sub) lines.push(l);
			} else {
				lines.push(`${pad}- ${emitScalar(item, strict)}`);
			}
		}
		return lines.join('\n');
	}
	if (value && typeof value === 'object') {
		const entries = Object.entries(value as Record<string, unknown>);
		if (entries.length === 0) return '{}';
		for (const [k, v] of entries) {
			const key = isPlainKey(k) ? k : JSON.stringify(k);
			if (v && typeof v === 'object' && (Array.isArray(v) ? v.length > 0 : Object.keys(v as object).length > 0)) {
				const sub = emit(v, indent + 1, strict);
				lines.push(`${pad}${key}:`);
				for (const l of sub.split('\n')) if (l.trim()) lines.push(`${l}`);
			} else if (v && typeof v === 'object') {
				lines.push(`${pad}${key}: ${Array.isArray(v) ? '[]' : '{}'}`);
			} else {
				lines.push(`${pad}${key}: ${emitScalar(v, strict)}`);
			}
		}
		return lines.join('\n');
	}
	return `${pad}${emitScalar(value, strict)}`;
}

/** Convert JSON text to YAML text (throws on invalid JSON). */
export function jsonToYaml(jsonText: string): string {
	const data = JSON.parse(jsonText);
	return emit(data, 0, true) + '\n';
}

/** Format = parse then emit with canonical 2-space indentation. */
export function formatYaml(text: string): string {
	return emit(parseYaml(text), 0) + '\n';
}

/** YAML text → JSON text (2-space pretty). Throws on parse errors. */
export function yamlToJson(text: string): string {
	return JSON.stringify(parseYaml(text), null, 2) + '\n';
}

/** Validate; returns null when OK, or a bilingual error message pair. */
export function validateYaml(text: string): YamlError | null {
	try {
		parseYaml(text);
		return null;
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		return {
			error: `— (${msg})`,
			errorZh: `—（${msg}）`,
		};
	}
}
