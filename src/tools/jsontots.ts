// JSON → TypeScript interfaces, for the /devtools/json-to-typescript tool.
// Infers an interface per object shape; object arrays merge their items'
// keys into one interface with optional markers for keys not every item has.

/** PascalCase a key: "user_name" / "userName" / "user-name" → "UserName". */
function pascal(key: string): string {
	const parts = key.replace(/[-_.\s]+(.)/g, (_m, c: string) => c.toUpperCase()).replace(/[^A-Za-z0-9]/g, '');
	const head = parts.charAt(0).toUpperCase() + parts.slice(1);
	return head || 'Value';
}

class Namer {
	private used = new Set<string>();
	/** Pre-reserve a name so unique() will never hand it out again. */
	reserve(name: string): void {
		this.used.add(name);
	}
	unique(base: string): string {
		let name = pascal(base);
		if (!this.used.has(name)) {
			this.used.add(name);
			return name;
		}
		for (let i = 2; i < 1000; i++) {
			const candidate = `${name}${i}`;
			if (!this.used.has(candidate)) {
				this.used.add(candidate);
				return candidate;
			}
		}
		throw new Error(`cannot derive a unique interface name from "${base}"`);
	}
}

/** TypeScript type for a single JSON value. */
function typeOf(v: unknown, key: string, namer: Namer, out: string[]): string {
	if (v === null) return 'null';
	if (typeof v === 'string') return 'string';
	if (typeof v === 'number') return 'number';
	if (typeof v === 'boolean') return 'boolean';
	if (Array.isArray(v)) {
		if (!v.length) return 'unknown[]';
		// An array of objects becomes ONE merged interface (keys missing from
		// some items go optional) — far more useful than a union of twins.
		if (v.every((x) => x && typeof x === 'object' && !Array.isArray(x))) {
			return `${mergedTypeOfArray(v as Record<string, unknown>[], key, namer, out)}[]`;
		}
		const elemTypes = dedupe(v.map((item) => typeOf(item, key, namer, out)));
		return elemTypes.length === 1 ? `${elemTypes[0]}[]` : `(${elemTypes.join(' | ')})[]`;
	}
	// object → named interface, emitted before its users
	const name = namer.unique(key);
	emitInterface(v as Record<string, unknown>, name, namer, out);
	return name;
}

function dedupe(types: string[]): string[] {
	return [...new Set(types)];
}

function emitInterface(obj: Record<string, unknown>, name: string, namer: Namer, out: string[]): void {
	// One interface = one entry in `out` (joined internally), so the final
	// block-level reverse below keeps each interface's lines in order.
	const lines: string[] = [];
	for (const [k, v] of Object.entries(obj)) {
		const t = typeOf(v, k, namer, out);
		const safeKey = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k) ? k : JSON.stringify(k);
		lines.push(`  ${safeKey}: ${t};`);
	}
	out.push(`export interface ${name} {\n${lines.length ? lines.join('\n') : '  // empty object'}\n}`);
}

/** Merge an array of objects into one shape: every key that is missing from
 *  at least one item becomes optional; types union across items. */
function mergedTypeOfArray(items: Record<string, unknown>[], key: string, namer: Namer, out: string[]): string {
	const allKeys = [...new Set(items.flatMap((it) => Object.keys(it)))];
	const name = namer.unique(key);
	const lines: string[] = [];
	for (const k of allKeys) {
		const present = items.filter((it) => k in it);
		const types = dedupe(present.map((it) => typeOf(it[k], k, namer, out)));
		const union = types.join(' | ');
		const safeKey = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k) ? k : JSON.stringify(k);
		lines.push(`  ${safeKey}${present.length < items.length ? '?' : ''}: ${union};`);
	}
	out.push(`export interface ${name} {\n${lines.length ? lines.join('\n') : '  // empty object'}\n}`);
	return name;
}

/** Main entry: JSON text → TypeScript interface declarations. */
export function jsonToTypescript(jsonText: string, rootName = 'Root'): string {
	const data: unknown = JSON.parse(jsonText);
	const out: string[] = [];
	const namer = new Namer();
	const usedRoot = pascal(rootName);
	namer.reserve(usedRoot);
	if (Array.isArray(data)) {
		if (data.length && data.every((x) => x && typeof x === 'object' && !Array.isArray(x))) {
			const itemName = namer.unique('Item');
			out.push(`export type ${usedRoot} = ${itemName}[];`);
			const merged = mergedTypeOfArray(data as Record<string, unknown>[], 'Item', namer, out);
			if (merged !== itemName) {
				// merge generated its own name; alias it
				out.unshift(`export type ${itemName} = ${merged};`);
			}
		} else {
			const t = typeOf(data, 'Root', namer, out);
			out.push(`export type ${usedRoot} = ${t}[];`);
		}
	} else if (data && typeof data === 'object') {
		emitInterface(data as Record<string, unknown>, usedRoot, namer, out);
	} else {
		out.push(`export type ${usedRoot} = ${typeof data};`);
	}
	// interfaces are emitted bottom-up (children first); flip for readability
	return out.reverse().join('\n') + '\n';
}
