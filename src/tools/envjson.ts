// .env ⇄ JSON conversion for the /devtools/env-json-converter tool.
// .env values are untyped strings — numbers and booleans stay strings on the
// JSON side so the round trip is lossless.

/** True when obj has an own property named key (Object.prototype keys are not). */
function hasOwn(obj: object, key: string): boolean {
	return Object.prototype.hasOwnProperty.call(obj, key);
}

/** .env text → JSON text (2-space pretty). Understands:
 *  KEY=VALUE, export KEY=VALUE, "quoted"/'quoted' values (single-line),
 *  # comments, blank lines, empty values. */
export function envToJson(env: string): string {
	const out: Record<string, string> = {};
	for (const rawLine of env.replace(/\r\n/g, '\n').split('\n')) {
		let line = rawLine.trim();
		if (!line || line.startsWith('#')) continue;
		if (line.startsWith('export ')) line = line.slice(7).trim();
		const eq = line.indexOf('=');
		if (eq === -1) throw new Error(`line is missing "=": "${rawLine.trim().slice(0, 40)}"`);
		const key = line.slice(0, eq).trim();
		if (!key) throw new Error(`empty key in line: "${rawLine.trim().slice(0, 40)}"`);
		let value = line.slice(eq + 1).trim();
		if (value.startsWith('"') || value.startsWith("'")) {
			// Quoted: scan to the matching closer. Double quotes skip escaped
			// characters, so "a\"b" is one value and not two.
			const quote = value.charAt(0);
			let end = -1;
			for (let q = 1; q < value.length; q++) {
				const ch = value.charAt(q);
				if (quote === '"' && ch === '\\') q++;
				else if (ch === quote) {
					end = q;
					break;
				}
			}
			if (end === -1) {
				throw new Error(`unterminated ${quote === '"' ? 'double' : 'single'}-quoted value: "${rawLine.trim().slice(0, 40)}"`);
			}
			const after = value.slice(end + 1).trim();
			// Only a trailing comment may follow the closing quote — "v" # note
			// is "v", and anything else means the value was quoted wrong.
			if (after && !after.startsWith('#')) {
				throw new Error(`unexpected text after the closing quote: "${rawLine.trim().slice(0, 40)}"`);
			}
			// Double quotes honour the four escape sequences the encoder emits
			// decoded in one pass: a doubled backslash must not turn into a newline.
			value = value.slice(1, end);
			if (quote === '"') {
				value = value.replace(/\\(\\|n|t|\")/g, (_m, c: string) => (c === 'n' ? '\n' : c === 't' ? '\t' : c));
			}
		} else {
			// Unquoted: a comment starts at the first "#" preceded by whitespace.
			const hash = value.indexOf(' #');
			if (hash !== -1) value = value.slice(0, hash).trimEnd();
		}
		if (hasOwn(out, key)) throw new Error(`duplicate key "${key}"`);
		out[key] = value;
	}
	return JSON.stringify(out, null, 2) + '\n';
}

/** Quote an env value when needed: empty, or containing whitespace / # / ' " =. */
function quoteEnv(value: string): string {
	if (value === '') return '""';
	if (/[\s#'"=]/.test(value)) {
		if (!value.includes('"')) return `"${value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/\t/g, '\\t')}"`;
		if (!value.includes("'")) return `'${value}'`;
		return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\t/g, '\\t')}"`;
	}
	return value;
}

/** JSON text (flat object of string/number/boolean values) → .env text. */
export function jsonToEnv(jsonText: string): string {
	const data: unknown = JSON.parse(jsonText);
	if (!data || typeof data !== 'object' || Array.isArray(data)) {
		throw new Error('the JSON root must be an object');
	}
	const out: string[] = [];
	for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
		if (v === null || v === undefined) {
			out.push(`${k}=`);
			continue;
		}
		if (v && typeof v === 'object') {
			throw new Error(`value of "${k}" is a nested ${Array.isArray(v) ? 'array' : 'object'} — .env is a flat KEY=VALUE format`);
		}
		out.push(`${k}=${quoteEnv(String(v))}`);
	}
	return (out.length ? out.join('\n') + '\n' : '');
}
