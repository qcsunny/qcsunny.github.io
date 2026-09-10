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

// --- tokenizer ------------------------------------------------------------------------

/** Strip comments (only outside quotes) and blank lines; compute indentation. */
function lexLines(text: string): Line[] {
	const out: Line[] = [];
	const src = text.replace(/\r\n/g, '\n');
	const lines = src.split('\n');
	for (let i = 0; i < lines.length; i++) {
		const raw = lines[i];
		if (!raw.trim()) continue;
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
function parseScalar(tok: string): unknown {
	const t = tok.trim();
	if (t === '') return null;
	if (t.startsWith('"') || t.startsWith("'")) {
		const q = t[0];
		if (!(t.endsWith(q) && t.length >= 2)) {
			throw new Error(`multi-line quoted scalars are not supported ("${t.slice(0, 30)}" is left unterminated)`);
		}
	}
	if (t.startsWith('"') && t.length >= 2) {
		// Double-quoted: \" \\ \n \t escapes; anything else is kept verbatim.
		let out = '';
		for (let i = 1; i < t.length - 1; i++) {
			if (t[i] === '\\' && i + 1 < t.length - 1) {
				const c = t[i + 1];
				if (c === '"') out += '"';
				else if (c === '\\') out += '\\';
				else if (c === 'n') out += '\n';
				else if (c === 't') out += '\t';
				else out += '\\' + c;
				i++;
			} else out += t[i];
		}
		return out;
	}
	if (t.startsWith("'") && t.endsWith("'") && t.length >= 2) {
		// Single-quoted: '' is an escaped quote; no other escapes.
		return t.slice(1, -1).replace(/''/g, "'");
	}
	if (t.startsWith('[')) return parseFlowSeq(t);
	if (t.startsWith('{')) return parseFlowMap(t);
	if (t in SCALAR_MAP) return SCALAR_MAP[t];
	// YAML 1.2 core schema number forms.
	if (/^[-+]?\d+$/.test(t)) return parseInt(t, 10);
	if (/^[-+]?(\d+\.\d*|\.\d+|\d+)([eE][-+]?\d+)?$/.test(t) && /[.eE]/.test(t)) return Number(t);
	if (/^0x[0-9a-fA-F]+$/.test(t)) return parseInt(t, 16);
	if (/^0o[0-7]+$/.test(t)) return parseInt(t.slice(2), 8);
	return t; // plain string
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

function parseFlowMap(t: string): Record<string, unknown> {
	if (!t.endsWith('}')) throw new Error(`flow map is missing its closing "}"`);
	const body = t.slice(1, -1).trim();
	const out: Record<string, unknown> = {};
	for (const part of splitFlow(body)) {
		const colon = part.indexOf(':');
		if (colon === -1) throw new Error(`flow map item "${part.trim()}" has no ':'`);
		const key = parseScalar(part.slice(0, colon));
		out[String(key)] = parseScalar(part.slice(colon + 1));
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
	return [parseScalar(line.content), pos + 1];
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
			throw new Error(`line ${line.lineNo}: expected a "- " item or a deeper/mapping line, got "${line.content.slice(0, 30)}"`);
		}
		const itemBody = line.content === '-' ? '' : line.content.slice(2);
		// Compact nested map: "- key: value" — the key starts 2 columns in.
		const kv = splitKey(itemBody);
		if (kv && itemBody.startsWith('- ')) {
			throw new Error(`line ${line.lineNo}: nested "- -" is not supported`);
		}
		if (kv) {
			// Inline map entry inside the item: continue as a map at indent + 2.
			const virtual: Line[] = [{ indent: indent + 2, content: itemBody, raw: line.raw, lineNo: line.lineNo }];
			// Collect following lines whose indent > line.indent (they belong to this item).
			let j = i + 1;
			while (j < lines.length && lines[j].indent > indent) j++;
			virtual.push(...lines.slice(i + 1, j));
			const [val] = parseBlockMap(virtual, 0, indent + 2);
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
		items.push(parseScalar(itemBody));
		i++;
	}
	return [items, i];
}

function parseBlockMap(lines: Line[], pos: number, indent: number): [Record<string, unknown>, number] {
	const map: Record<string, unknown> = {};
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
				map[kv.key] = val;
				i = p;
				continue;
			}
			let j = i + 1;
			while (j < lines.length && lines[j].indent > indent) j++;
			if (j > i + 1) {
				const [val] = parseBlock(lines, i + 1, indent + 1);
				map[kv.key] = val;
			} else {
				map[kv.key] = null;
			}
			i = j;
			continue;
		}
		map[kv.key] = parseScalar(kv.rest);
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

function quoteIfNeeded(s: string): string {
	if (s === '') return "''";
	if (/[:#\-?\[\]{},&*!|>'"%@`\n\t]/.test(s) || /^\s|\s$/.test(s) || s !== s.trim()) return JSON.stringify(s);
	if (/^(true|false|null|~|yes|no|on|off)$/i.test(s) || /^[-+]?[.\d]/.test(s)) return JSON.stringify(s);
	return s;
}

function emitScalar(v: unknown): string {
	if (v === null) return 'null';
	if (typeof v === 'boolean') return String(v);
	if (typeof v === 'number') return String(v);
	return quoteIfNeeded(String(v));
}

function isPlainKey(k: string): boolean {
	return KEY_RE.test(k) && !/^(true|false|null|~|yes|no|on|off)$/i.test(k);
}

/** Emit a JS value as block-style YAML at the given indentation level. */
function emit(value: unknown, indent: number): string {
	const pad = '  '.repeat(indent);
	const lines: string[] = [];
	if (Array.isArray(value)) {
		if (value.length === 0) return '[]';
		for (const item of value) {
			if (item && typeof item === 'object' && !Array.isArray(item)) {
				const sub = emit(item, 0);
				const subLines = sub.split('\n');
				lines.push(`${pad}- ${subLines[0]}`);
				for (const l of subLines.slice(1)) lines.push(`${pad}  ${l}`);
			} else if (Array.isArray(item)) {
				const sub = emit(item, indent + 1).split('\n');
				lines.push(`${pad}-`);
				for (const l of sub) lines.push(l);
			} else {
				lines.push(`${pad}- ${emitScalar(item)}`);
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
				const sub = emit(v, indent + 1);
				lines.push(`${pad}${key}:`);
				for (const l of sub.split('\n')) if (l.trim()) lines.push(`${l}`);
			} else if (v && typeof v === 'object') {
				lines.push(`${pad}${key}: ${Array.isArray(v) ? '[]' : '{}'}`);
			} else {
				lines.push(`${pad}${key}: ${emitScalar(v)}`);
			}
		}
		return lines.join('\n');
	}
	return `${pad}${emitScalar(value)}`;
}

/** Convert JSON text to YAML text (throws on invalid JSON). */
export function jsonToYaml(jsonText: string): string {
	const data = JSON.parse(jsonText);
	return emit(data, 0) + '\n';
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
