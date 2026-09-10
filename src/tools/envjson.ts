// .env ⇄ JSON conversion for the /devtools/env-json-converter tool.
// .env values are untyped strings — numbers and booleans stay strings on the
// JSON side so the round trip is lossless.

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
		// strip inline comment (only for unquoted values, after whitespace)
		if (!value.startsWith('"') && !value.startsWith("'")) {
			const hash = value.indexOf(' #');
			if (hash !== -1) value = value.slice(0, hash).trimEnd();
		}
		// quoted values: strip the quotes; double quotes honour \n \t \\ escapes
		if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
			value = value
				.slice(1, -1)
				.replace(/\\n/g, '\n')
				.replace(/\\t/g, '\t')
				.replace(/\\\\/g, '\\');
		} else if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
			value = value.slice(1, -1);
		}
		if (key in out) throw new Error(`duplicate key "${key}"`);
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
