// JSON Schema generator + validator (draft-07 subset) in one page.
// - Generate: infer a schema from a pasted JSON document
// - Validate: check a JSON document against the schema box, errors listed by
//   JSON path
// 100% in-browser, zero network — same privacy posture as every other tool.

import { isZh, onLang } from './i18n';
import { createWorkbench } from './workbench';

/** True when obj has an own property named key. The `in` operator walks the
 *  prototype chain, so "constructor" would count as present on every object. */
function hasOwn(obj: object, key: string): boolean {
	return Object.prototype.hasOwnProperty.call(obj, key);
}

/** Build a RegExp for a JSON Schema "pattern", or null if it is malformed. A
 *  pattern is an unflagged ECMA-262 regular expression; a bad one used to throw
 *  out of the whole run instead of being reported as an error for that string. */
function patternRe(pattern: string): RegExp | null {
	try {
		return new RegExp(pattern);
	} catch {
		return null;
	}
}

// --- schema inference --------------------------------------------------------------------

type Schema = Record<string, unknown>;

// JSON.parse survives to roughly 9000 levels, but validate() would blow the
// stack far earlier, so both passes share one conservative limit.
const MAX_DEPTH = 1000;
const MAX_REF_DEPTH = 64;

function inferSchema(v: unknown, depth = 0): Schema {
	if (depth > MAX_DEPTH) throw new Error(`the document is nested more than ${MAX_DEPTH} levels deep`);
	if (v === null) return { type: 'null' };
	if (typeof v === 'boolean') return { type: 'boolean' };
	if (typeof v === 'number') return { type: Number.isInteger(v) ? 'integer' : 'number' };
	if (typeof v === 'string') return { type: 'string' };
	if (Array.isArray(v)) {
		if (!v.length) return { type: 'array' };
		return { type: 'array', items: v.map((x) => inferSchema(x, depth + 1)).reduce((a, b) => mergeSchemas(a, b, depth + 1)) };
	}
	const properties: Record<string, unknown> = {};
	for (const key of Object.keys(v as object).sort()) {
		properties[key] = inferSchema((v as Record<string, unknown>)[key], depth + 1);
	}
	// A single sample cannot prove a key optional, so every observed key is
	// required — the honest reading of "the document looks like this".
	return { type: 'object', properties, required: Object.keys(properties) };
}

/** Merge the schemas of several array samples into one items schema. */
function mergeSchemas(a: Schema, b: Schema, depth = 0): Schema {
	// Merging against an empty schema is the identity: an unconstrained side
	// would otherwise fold into an anyOf that matches everything.
	if (Object.keys(a).length === 0) return b;
	if (Object.keys(b).length === 0) return a;
	if (depth > MAX_DEPTH) throw new Error(`the document is nested more than ${MAX_DEPTH} levels deep`);
	const ja = JSON.stringify(a);
	const jb = JSON.stringify(b);
	if (ja === jb) return a;
	const ta = String(a.type);
	const tb = String(b.type);
	if (ta !== tb) {
		// heterogeneous array: integer+number folds to number, anything else is anyOf
		if ((ta === 'integer' && tb === 'number') || (ta === 'number' && tb === 'integer')) return { type: 'number' };
		return { anyOf: [a, b] };
	}
	if (ta === 'object') {
		const properties: Record<string, unknown> = { ...((a.properties as Record<string, unknown>) ?? {}) };
		for (const [k, s] of Object.entries((b.properties as Record<string, unknown>) ?? {})) {
			properties[k] = properties[k] ? mergeSchemas(properties[k] as Schema, s as Schema, depth + 1) : s;
		}
		const reqA = (a.required as string[]) ?? [];
		const reqB = new Set((b.required as string[]) ?? []);
		return { type: 'object', properties, required: reqA.filter((k) => reqB.has(k)) };
	}
	if (ta === 'array') {
		return { type: 'array', items: mergeSchemas((a.items as Schema) ?? {}, (b.items as Schema) ?? {}, depth + 1) };
	}
	return { anyOf: [a, b] };
}

// --- validation (draft-07 subset) ---------------------------------------------------------

interface VError {
	path: string;
	en: string;
	zh: string;
}

function typeOf(v: unknown): string {
	if (v === null) return 'null';
	if (Array.isArray(v)) return 'array';
	return typeof v === 'number' && !Number.isInteger(v) ? 'number' : typeof v === 'number' ? 'integer' : typeof v;
}

function typeMatches(v: unknown, t: string): boolean {
	const actual = typeOf(v);
	return actual === t || (t === 'number' && actual === 'integer') || (t === 'object' && actual === 'object' && v !== null && !Array.isArray(v));
}

/** Order-independent equality. JSON.stringify compares by key order, so an
 *  enum of [{a:1,b:2}] used to reject the equal object {b:2,a:1}. */
function deepEqual(a: unknown, b: unknown): boolean {
	if (a === b) return true;
	if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
	if (Array.isArray(a) !== Array.isArray(b)) return false;
	if (Array.isArray(a) && Array.isArray(b)) {
		if (a.length !== b.length) return false;
		return a.every((x, i) => deepEqual(x, (b as unknown[])[i]));
	}
	const ao = a as Record<string, unknown>;
	const bo = b as Record<string, unknown>;
	const ak = Object.keys(ao);
	const bk = Object.keys(bo);
	return ak.length === bk.length && ak.every((k) => hasOwn(bo, k) && deepEqual(ao[k], bo[k]));
}

/** Canonical form for uniqueItems: object keys sorted, so the check is
 *  order-independent and the whole scan stays one Set lookup. */
function canonical(v: unknown): string {
	if (v === null || typeof v !== 'object') return JSON.stringify(v);
	if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
	const o = v as Record<string, unknown>;
	return '{' + Object.keys(o).sort().map((k) => JSON.stringify(k) + ':' + canonical(o[k])).join(',') + '}';
}

/** Resolve an internal JSON Pointer $ref against the schema root. Anything
 *  other than "#" or "#/…" is an external reference this offline tool cannot
 *  follow, so it is reported instead of being quietly treated as a pass. */
function resolveRef(ref: string, root: Schema): Schema | null {
	if (ref === '#') return root;
	if (!ref.startsWith('#/')) return null;
	let cur: unknown = root;
	for (const part of ref.slice(2).split('/')) {
		if (cur === null || typeof cur !== 'object' || Array.isArray(cur)) return null;
		cur = (cur as Record<string, unknown>)[part.replace('~1', '/').replace('~0', '~')];
	}
	return cur === null || typeof cur !== 'object' || Array.isArray(cur) ? null : (cur as Schema);
}

function validate(v: unknown, schema: unknown, path: string, out: VError[]): void {
	validateWith(v, schema, path, out, 0, schema as Schema, 0);
}

function validateWith(v: unknown, schema: unknown, path: string, out: VError[], depth: number, root: Schema, refDepth: number): void {
	if (out.length >= 50) return; // a broken schema against a big file: cap the report
	if (depth > MAX_DEPTH) {
		out.push({ path, en: `validation stopped: nested more than ${MAX_DEPTH} levels deep`, zh: `校验已停止：嵌套超过 ${MAX_DEPTH} 层` });
		return;
	}
	if (schema === false) {
		// A boolean schema is legal draft-07, not an unknown shape: "false"
		// rejects every value. Treating it as "no constraint" let anything pass.
		out.push({ path, en: 'value is not allowed (the schema is false)', zh: '值不被允许（schema 为 false）' });
		return;
	}
	if (schema === true || schema === null || schema === undefined) return;
	if (typeof schema !== 'object' || Array.isArray(schema)) {
		out.push({ path, en: `invalid schema: a schema is a boolean or an object, got ${typeOf(schema)}`, zh: `schema 无效：应为布尔值或对象，实际为 ${typeOf(schema)}` });
		return;
	}
	const s = schema as Schema;

	if (typeof s.$ref === 'string') {
		// draft-07 gives $ref precedence: sibling keywords do not also apply.
		const ref = s.$ref;
		if (refDepth > MAX_REF_DEPTH) {
			out.push({ path, en: `too many nested $ref references (${ref})`, zh: `嵌套 $ref 过多（${ref}）` });
			return;
		}
		const target = resolveRef(ref, root);
		if (target === null) {
			out.push({
				path,
				en: ref.startsWith('#') ? `unresolved $ref "${ref}"` : `only internal $ref ("#/…") is supported: "${ref}"`,
				zh: ref.startsWith('#') ? `无法解析 $ref "${ref}"` : `仅支持内部 $ref（"#/…"）：${ref}`,
			});
		} else validateWith(v, target, path, out, depth, root, refDepth + 1);
		return;
	}

	if (s.type !== undefined) {
		const types = Array.isArray(s.type) ? s.type : [s.type];
		if (types.some((t) => typeof t !== 'string')) {
			out.push({ path, en: 'invalid schema: "type" must be a string or an array of strings', zh: 'schema 无效："type" 应为字符串或字符串数组' });
			return;
		}
		const ts = types as string[];
		if (!ts.some((t) => typeMatches(v, t))) {
			out.push({ path, en: `expected ${ts.join(' | ')}, got ${typeOf(v)}`, zh: `期望 ${ts.join(' | ')}，实际为 ${typeOf(v)}` });
			return; // wrong root type: deeper checks would only cascade noise
		}
	}
	if (s.const !== undefined && !deepEqual(s.const, v)) {
		out.push({ path, en: `value does not match const ${JSON.stringify(s.const)}`, zh: `值与 const ${JSON.stringify(s.const)} 不符` });
	}
	if (s.enum !== undefined) {
		if (!Array.isArray(s.enum)) {
			out.push({ path, en: 'invalid schema: "enum" must be an array', zh: 'schema 无效："enum" 应为数组' });
		} else if (!s.enum.some((e) => deepEqual(e, v))) {
			out.push({ path, en: `value is not one of the allowed enum values`, zh: `值不在 enum 允许的取值中` });
		}
	}
	if (typeof v === 'number') {
		for (const k of ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum'] as const) {
			if (hasOwn(s, k) && typeof s[k] !== 'number') {
				out.push({ path, en: `invalid schema: "${k}" must be a number`, zh: `schema 无效："${k}" 应为数字` });
				break;
			}
		}
		if (typeof s.minimum === 'number' && v < s.minimum)
			out.push({ path, en: `${v} is below the minimum ${s.minimum}`, zh: `${v} 小于最小值 ${s.minimum}` });
		if (typeof s.exclusiveMinimum === 'number' && v <= s.exclusiveMinimum)
			out.push({ path, en: `${v} is not above the exclusive minimum ${s.exclusiveMinimum}`, zh: `${v} 未严格大于最小值 ${s.exclusiveMinimum}` });
		if (typeof s.maximum === 'number' && v > s.maximum)
			out.push({ path, en: `${v} is above the maximum ${s.maximum}`, zh: `${v} 大于最大值 ${s.maximum}` });
		if (typeof s.exclusiveMaximum === 'number' && v >= s.exclusiveMaximum)
			out.push({ path, en: `${v} is not below the exclusive maximum ${s.exclusiveMaximum}`, zh: `${v} 未严格小于最大值 ${s.exclusiveMaximum}` });
		if (hasOwn(s, 'multipleOf') && typeof s.multipleOf !== 'number')
			out.push({ path, en: 'invalid schema: "multipleOf" must be a number', zh: 'schema 无效："multipleOf" 应为数字' });
		if (typeof s.multipleOf === 'number') {
			// A quotient has no fractional part iff truncating it is a no-op.
			// Math.trunc, not parseInt: parseInt stringifies first, so
			// parseInt(1e21) reads "1e+21" and stops at the sign, treating the
			// quotient as 1 and rejecting a value that is an exact multiple.
			// IEEE 754 division is what the draft asks for, and it bites on
			// decimal multiples: 0.3 / 0.1 is 2.9999999999999996, so 0.3 fails
			// multipleOf: 0.1. That is the spec's own rule, not a bug here - the
			// usual escape hatch is writing the multiple against integers.
			const div = s.multipleOf;
			const q = v / div;
			if (div === 0 || Math.trunc(q) !== q)
				out.push({ path, en: `${v} is not a multiple of ${div}`, zh: `${v} 不是 ${div} 的整数倍` });
		}
	}
	if (typeof v === 'string') {
		if (hasOwn(s, 'minLength') && typeof s.minLength !== 'number')
			out.push({ path, en: 'invalid schema: "minLength" must be a number', zh: 'schema 无效："minLength" 应为数字' });
		if (hasOwn(s, 'maxLength') && typeof s.maxLength !== 'number')
			out.push({ path, en: 'invalid schema: "maxLength" must be a number', zh: 'schema 无效："maxLength" 应为数字' });
		if (typeof s.minLength === 'number' && v.length < s.minLength)
			out.push({ path, en: `length ${v.length} is below minLength ${s.minLength}`, zh: `长度 ${v.length} 小于 minLength ${s.minLength}` });
		if (typeof s.maxLength === 'number' && v.length > s.maxLength)
			out.push({ path, en: `length ${v.length} is above maxLength ${s.maxLength}`, zh: `长度 ${v.length} 大于 maxLength ${s.maxLength}` });
		if (s.pattern !== undefined) {
			if (typeof s.pattern !== 'string') {
				out.push({ path, en: 'invalid schema: "pattern" must be a string', zh: 'schema 无效："pattern" 应为字符串' });
			} else {
				const re = patternRe(s.pattern);
				if (re === null) {
					out.push({ path, en: `invalid pattern /${s.pattern}/`, zh: `pattern 无效 /${s.pattern}/` });
				} else if (!re.test(v)) {
					out.push({ path, en: `does not match the pattern /${s.pattern}/`, zh: `不匹配 pattern /${s.pattern}/` });
				}
			}
		}
	}
	if (Array.isArray(v)) {
		if (hasOwn(s, 'minItems') && typeof s.minItems !== 'number')
			out.push({ path, en: 'invalid schema: "minItems" must be a number', zh: 'schema 无效："minItems" 应为数字' });
		if (hasOwn(s, 'maxItems') && typeof s.maxItems !== 'number')
			out.push({ path, en: 'invalid schema: "maxItems" must be a number', zh: 'schema 无效："maxItems" 应为数字' });
		if (typeof s.minItems === 'number' && v.length < s.minItems)
			out.push({ path, en: `has ${v.length} items, fewer than minItems ${s.minItems}`, zh: `共 ${v.length} 项，少于 minItems ${s.minItems}` });
		if (typeof s.maxItems === 'number' && v.length > s.maxItems)
			out.push({ path, en: `has ${v.length} items, more than maxItems ${s.maxItems}`, zh: `共 ${v.length} 项，多于 maxItems ${s.maxItems}` });
		if (hasOwn(s, 'uniqueItems') && typeof s.uniqueItems !== 'boolean')
			out.push({ path, en: 'invalid schema: "uniqueItems" must be a boolean', zh: 'schema 无效："uniqueItems" 应为布尔值' });
		if (s.uniqueItems === true) {
			const seen = new Set<string>();
			let dup = -1;
			for (let i = 0; i < v.length; i++) {
				const c = canonical(v[i]);
				if (seen.has(c)) { dup = i; break; }
				seen.add(c);
			}
			if (dup >= 0)
				out.push({ path, en: `items at index ${dup} repeat an earlier item`, zh: `索引 ${dup} 处的元素与前面的元素重复` });
		}
		if (hasOwn(s, 'contains') && typeof s.contains !== 'object' && s.contains !== null && typeof s.contains !== 'boolean')
			out.push({ path, en: 'invalid schema: "contains" must be a schema', zh: 'schema 无效："contains" 应为 schema' });
		if (s.contains !== undefined) {
			// "At least one item matches" — stop at the first match, and give
			// each probe its own sink so one bad item cannot eat the budget
			// reserved for the real report.
			let ok = false;
			for (let i = 0; i < v.length && !ok; i++) {
				const sub: VError[] = [];
				validateWith(v[i], s.contains, `${path}[${i}]`, sub, depth + 1, root, refDepth);
				ok = sub.length === 0;
			}
			if (!ok)
				out.push({ path, en: 'no item matches the "contains" schema', zh: '没有任何元素满足 "contains" 中的 schema' });
		}
		if (s.items !== undefined) {
			if (Array.isArray(s.items)) {
				// Tuple form: position i is validated against its own schema, and
				// extra positions against additionalItems rather than being free.
				for (let i = 0; i < v.length; i++) {
					if (out.length >= 50) break;
					const at = `${path}[${i}]`;
					if (i < s.items.length) validateWith(v[i], s.items[i], at, out, depth + 1, root, refDepth);
					else if (s.additionalItems === false) {
						out.push({ path: at, en: `too many items: the schema allows at most ${s.items.length}`, zh: `数组过长：schema 最多允许 ${s.items.length} 项` });
						break;
					} else if (s.additionalItems !== undefined) validateWith(v[i], s.additionalItems, at, out, depth + 1, root, refDepth);
				}
			} else {
				for (let i = 0; i < v.length; i++) validateWith(v[i], s.items, `${path}[${i}]`, out, depth + 1, root, refDepth);
			}
		}
	}
	if (v && typeof v === 'object' && !Array.isArray(v)) {
		const obj = v as Record<string, unknown>;
		const keys = Object.keys(obj);
		if (hasOwn(s, 'minProperties') && typeof s.minProperties !== 'number')
			out.push({ path, en: 'invalid schema: "minProperties" must be a number', zh: 'schema 无效："minProperties" 应为数字' });
		if (hasOwn(s, 'maxProperties') && typeof s.maxProperties !== 'number')
			out.push({ path, en: 'invalid schema: "maxProperties" must be a number', zh: 'schema 无效："maxProperties" 应为数字' });
		if (typeof s.minProperties === 'number' && keys.length < s.minProperties)
			out.push({ path, en: `has ${keys.length} properties, fewer than minProperties ${s.minProperties}`, zh: `共 ${keys.length} 个属性，少于 minProperties ${s.minProperties}` });
		if (typeof s.maxProperties === 'number' && keys.length > s.maxProperties)
			out.push({ path, en: `has ${keys.length} properties, more than maxProperties ${s.maxProperties}`, zh: `共 ${keys.length} 个属性，多于 maxProperties ${s.maxProperties}` });
		if (hasOwn(s, 'propertyNames')) {
			// Validates each NAME, not each value - so it catches schemas like
			// { propertyNames: { pattern: "^x_" } } that a value-only check misses.
			const sub: VError[] = [];
			for (const key of keys) validateWith(key, s.propertyNames, `${path}.${key}`, sub, depth + 1, root, refDepth);
			if (sub.length)
				out.push({ path, en: `a property name does not match the "propertyNames" schema`, zh: `存在不满足 "propertyNames" 的属性名` });
		}
		if (hasOwn(s, 'dependencies')) {
			// draft-07 gives this keyword two meanings at once: an array value is
			// a list of required siblings, and an object value is a schema the
			// WHOLE INSTANCE must satisfy when the key is present. Both apply to
			// the same key, and only when that key is present.
			// ajv 8 confirms the container reading: { dependencies: { a:
			// { required: ['b'] } } } rejects { a: 1 } at instancePath "" with
			// "must have required property 'b'" - so validate the instance, not
			// just the property's value, which made a `required` dep never fire.
			const deps = s.dependencies;
			if (typeof deps !== 'object' || Array.isArray(deps) || deps === null) {
				out.push({ path, en: 'invalid schema: "dependencies" must be an object or an array', zh: 'schema 无效："dependencies" 应为对象或数组' });
			} else if (Array.isArray(deps)) {
				if (deps.some((d) => typeof d !== 'string'))
					out.push({ path, en: 'invalid schema: "dependencies" array entries must be strings', zh: 'schema 无效："dependencies" 数组元素应为字符串' });
			} else {
				for (const [key, spec] of Object.entries(deps)) {
					if (!hasOwn(obj, key)) continue; // absent key: no dependency to honour
					if (Array.isArray(spec)) {
						if (spec.some((d) => typeof d !== 'string')) {
							out.push({ path, en: 'invalid schema: "dependencies" array entries must be strings', zh: 'schema 无效："dependencies" 数组元素应为字符串' });
						}
						for (const d of spec as string[]) {
							if (!hasOwn(obj, d))
								out.push({ path, en: `property "${key}" requires property "${d}"`, zh: `属性 "${key}" 要求同时存在属性 "${d}"` });
						}
					} else if (spec !== undefined) {
						const sub: VError[] = [];
						validateWith(obj, spec, path, sub, depth + 1, root, refDepth);
						if (sub.length) {
							out.push({ path, en: `property "${key}" does not match its dependency schema`, zh: `属性 "${key}" 不满足其依赖 schema` });
							for (const e of sub) {
								if (out.length >= 50) break;
								out.push({ path: `${path}·dep[${key}]`, en: e.en, zh: e.zh });
							}
						}
					}
				}
			}
		}
		if (s.required !== undefined) {
			if (!Array.isArray(s.required) || s.required.some((k) => typeof k !== 'string')) {
				out.push({ path, en: 'invalid schema: "required" must be an array of strings', zh: 'schema 无效："required" 应为字符串数组' });
			} else {
				for (const key of s.required as string[]) {
					if (!hasOwn(obj, key))
						out.push({ path, en: `missing required property "${key}"`, zh: `缺少必填属性 "${key}"` });
				}
			}
		}
		const props = (s.properties as Record<string, unknown>) ?? {};
		const pats = (s.patternProperties as Record<string, unknown>) ?? {};
		// A key matched by a pattern counts as known, so it must not be flagged as
		// additional — that combination used to reject valid documents.
		const isKnown = (key: string): boolean => {
			if (hasOwn(props, key)) return true;
			return Object.keys(pats).some((p) => { const re = patternRe(p); return re !== null && re.test(key); });
		};
		for (const p of Object.keys(pats)) {
			if (patternRe(p) === null)
				out.push({ path, en: `invalid patternProperties pattern /${p}/`, zh: `patternProperties 无效 /${p}/` });
		}
		for (const key of keys) {
			if (out.length >= 50) break;
			const at = /^\w+$/.test(key) ? `${path}.${key}` : `${path}[${JSON.stringify(key)}]`;
			if (hasOwn(props, key)) validateWith(obj[key], props[key], at, out, depth + 1, root, refDepth);
			for (const [p, sub] of Object.entries(pats)) {
				const re = patternRe(p);
				if (re !== null && re.test(key)) validateWith(obj[key], sub, at, out, depth + 1, root, refDepth);
			}
		}
		if (s.additionalProperties === false) {
			for (const key of keys) {
				if (out.length >= 50) break;
				if (!isKnown(key))
					out.push({ path: /^\w+$/.test(key) ? `${path}.${key}` : `${path}[${JSON.stringify(key)}]`, en: `additional property "${key}" is not allowed`, zh: `不允许出现额外属性 "${key}"` });
			}
		} else if (typeof s.additionalProperties === 'object' && s.additionalProperties !== null) {
			for (const key of keys) {
				if (out.length >= 50) break;
				if (!isKnown(key))
					validateWith(obj[key], s.additionalProperties, /^\w+$/.test(key) ? `${path}.${key}` : `${path}[${JSON.stringify(key)}]`, out, depth + 1, root, refDepth);
			}
		}
	}

	// Composition: each sub-schema is validated against a throwaway sink so one
	// branch cannot consume the 50-error budget meant for the top-level report.
	if (hasOwn(s, 'allOf') && Array.isArray(s.allOf)) {
		const branches = s.allOf as unknown[];
		for (let i = 0; i < branches.length; i++) {
			const sub: VError[] = [];
			validateWith(v, branches[i], path, sub, depth, root, refDepth);
			if (sub.length) {
				out.push({ path, en: `does not match allOf[${i}]`, zh: `不满足 allOf[${i}]` });
				for (const e of sub) {
					if (out.length >= 50) break;
					out.push({ path: `${path}·allOf[${i}]`, en: e.en, zh: e.zh });
				}
			}
		}
	} else if (hasOwn(s, 'allOf') && s.allOf !== undefined) {
		out.push({ path, en: 'invalid schema: "allOf" must be an array', zh: 'schema 无效："allOf" 应为数组' });
	}
	if (hasOwn(s, 'anyOf') && Array.isArray(s.anyOf)) {
		const branches = s.anyOf as unknown[];
		const matched = branches.filter((branch) => {
			const subs: VError[] = [];
			validateWith(v, branch, path, subs, depth, root, refDepth);
			return subs.length === 0;
		}).length;
		if (matched === 0)
			out.push({ path, en: `does not match any of ${branches.length} schemas (anyOf)`, zh: `不匹配 anyOf 中的任一 schema（共 ${branches.length} 个）` });
	} else if (hasOwn(s, 'anyOf') && s.anyOf !== undefined) {
		out.push({ path, en: 'invalid schema: "anyOf" must be an array', zh: 'schema 无效："anyOf" 应为数组' });
	}
	if (hasOwn(s, 'oneOf') && Array.isArray(s.oneOf)) {
		const branches = s.oneOf as unknown[];
		const matched = branches.filter((branch) => {
			const subs: VError[] = [];
			validateWith(v, branch, path, subs, depth, root, refDepth);
			return subs.length === 0;
		}).length;
		if (matched === 0)
			out.push({ path, en: `does not match any of ${branches.length} schemas (oneOf)`, zh: `不匹配 oneOf 中的任一 schema（共 ${branches.length} 个）` });
		else if (matched > 1)
			out.push({ path, en: `matches ${matched} of ${branches.length} schemas, expected exactly 1 (oneOf)`, zh: `匹配了 oneOf 中的 ${matched} 个 schema，应恰好匹配 1 个（共 ${branches.length} 个）` });
	} else if (hasOwn(s, 'oneOf') && s.oneOf !== undefined) {
		out.push({ path, en: 'invalid schema: "oneOf" must be an array', zh: 'schema 无效："oneOf" 应为数组' });
	}
	if (hasOwn(s, 'not')) {
		const sub: VError[] = [];
		validateWith(v, s.not, path, sub, depth, root, refDepth);
		if (sub.length === 0)
			out.push({ path, en: 'value must NOT be valid against the "not" schema', zh: '值不应通过 "not" 中的 schema 校验' });
	}
	if (hasOwn(s, 'if')) {
		const sub: VError[] = [];
		validateWith(v, s.if, path, sub, depth, root, refDepth);
		if (sub.length === 0) {
			if (hasOwn(s, 'then')) validateWith(v, s.then, path, out, depth, root, refDepth);
		} else if (hasOwn(s, 'else')) validateWith(v, s.else, path, out, depth, root, refDepth);
	}
}

// --- page ----------------------------------------------------------------------------------

export function initJsonSchema(host: HTMLElement): void {
	let wb: ReturnType<typeof createWorkbench>;

	const READY_EN = 'Ready: paste a JSON document, then Generate a schema or Validate against one.';
	const READY_ZH = '准备就绪：粘贴 JSON 文档后，可一键生成 Schema 或对文档验校。';

	// The schema box: a second textarea injected above the workbench input (the
	// workbench clears the host, so this goes in after it renders).
	const schemaRow = document.createElement('div');
	schemaRow.className = 't-field t-schemarow';
	const schemaLabel = document.createElement('label');
	schemaLabel.htmlFor = 't-jsonschema';
	schemaLabel.append(
		Object.assign(document.createElement('span'), { className: 'i18n-en', textContent: 'Schema (draft-07) — paste here to validate' }),
		Object.assign(document.createElement('span'), { className: 'i18n-zh', textContent: 'Schema（draft-07）—— 粘贴到这里用于校验' }),
	);
	const schemaBox = document.createElement('textarea');
	schemaBox.id = 't-jsonschema';
	schemaBox.className = 't-textarea t-mono';
	schemaBox.rows = 5;
	schemaBox.spellcheck = false;
	schemaRow.append(schemaLabel, schemaBox);

	function doGenerate(): void {
		const raw = wb.inputArea.value.trim();
		if (!raw) {
			wb.updateStatus('error', '✗ Paste a JSON document first.', '✗ 请先粘贴 JSON 文档。');
			return;
		}
		let value: unknown;
		try {
			value = JSON.parse(raw);
		} catch (err) {
			wb.updateStatus('error', `✗ Not valid JSON: ${err instanceof Error ? err.message : ''}`, `✗ 不是合法 JSON：${err instanceof Error ? err.message : ''}`);
			return;
		}
		let schema: string;
		try {
			schema = JSON.stringify(inferSchema(value), null, 2);
		} catch (err) {
			wb.updateStatus('error', `✗ Cannot generate: ${err instanceof Error ? err.message : ''}`, `✗ 无法生成：${err instanceof Error ? err.message : ''}`);
			return;
		}
		wb.outputArea.value = schema;
		// Round-trip convenience: generating preloads the schema box so the very
		// next click can be Validate.
		schemaBox.value = schema;
		wb.updateStatus('valid', '✓ Schema generated (draft-07) and loaded into the schema box.', '✓ 已生成 Schema（draft-07）并载入校验框。');
	}

	function doValidate(): void {
		const zh = isZh();
		const rawJson = wb.inputArea.value.trim();
		const rawSchema = schemaBox.value.trim();
		if (!rawJson) {
			wb.updateStatus('error', '✗ Paste a JSON document first.', '✗ 请先粘贴 JSON 文档。');
			return;
		}
		if (!rawSchema) {
			wb.updateStatus('error', '✗ Paste (or Generate) a schema in the schema box first.', '✗ 请先在校验框粘贴（或生成）Schema。');
			return;
		}
		let value: unknown, schema: unknown;
		try {
			value = JSON.parse(rawJson);
		} catch (err) {
			wb.updateStatus('error', `✗ Document is not valid JSON: ${err instanceof Error ? err.message : ''}`, `✗ 文档不是合法 JSON：${err instanceof Error ? err.message : ''}`);
			return;
		}
		try {
			schema = JSON.parse(rawSchema);
		} catch (err) {
			wb.updateStatus('error', `✗ Schema is not valid JSON: ${err instanceof Error ? err.message : ''}`, `✗ Schema 不是合法 JSON：${err instanceof Error ? err.message : ''}`);
			return;
		}
		const errors: VError[] = [];
		validate(value, schema, '$', errors);
		if (!errors.length) {
			wb.outputArea.value = zh ? '✓ 文档通过 Schema 校验，无错误。' : '✓ The document is valid against the schema.';
			wb.updateStatus('valid', '✓ Valid — no errors.', '✓ 校验通过，无错误。');
			return;
		}
		const lines = [zh ? `✗ ${errors.length} 处校验错误：` : `✗ ${errors.length} validation error${errors.length > 1 ? 's' : ''}:`, ''];
		for (const e of errors) lines.push(`${e.path}  →  ${zh ? e.zh : e.en}`);
		if (errors.length >= 50) lines.push('', zh ? '（仅显示前 50 条）' : '(showing the first 50)');
		wb.outputArea.value = lines.join('\n');
		wb.updateStatus('error', `✗ ${errors.length} error${errors.length > 1 ? 's' : ''}`, `✗ 共 ${errors.length} 处错误`);
	}

	wb = createWorkbench({
		host,
		inputTitle: 'JSON Document',
		inputTitleZh: 'JSON 文档',
		outputTitle: 'Schema / Validation Report',
		outputTitleZh: 'Schema / 校验报告',
		inputPlaceholder: '{"name": "example", "version": 2, "tags": ["a"]}',
		inputPlaceholderZh: '{"name": "example", "version": 2, "tags": ["a"]}',
		outputPlaceholder: 'The generated schema or the validation errors will appear here…',
		outputPlaceholderZh: '生成的 Schema 或校验错误将显示在此处…',
		fileAccept: '.json',
		fileDefaultName: `schema-${Date.now()}.json`,
		downloadLabel: '💾 Download JSON',
		downloadLabelZh: '💾 下载 JSON',
		buttons: [
			{ label: 'Generate Schema', labelZh: '生成 Schema', primary: true, onClick: doGenerate },
			{ label: 'Validate Document', labelZh: '校验文档', primary: false, onClick: doValidate },
		],
		onSample: () => {
			wb.inputArea.value = '{\n  "name": "example",\n  "version": 2,\n  "price": 9.99,\n  "tags": ["a", "b"],\n  "meta": { "draft": true, "authors": null }\n}';
			doGenerate();
		},
		onClear: () => {
			wb.inputArea.value = '';
			wb.outputArea.value = '';
			schemaBox.value = '';
			wb.updateStatus('idle', 'Cleared', '已清空');
		},
		initialStatus: READY_EN,
		initialStatusZh: READY_ZH,
	});

	// The workbench clears the host, so the schema box goes in after it renders.
	host.insertBefore(schemaRow, host.firstChild ?? null);

	// First visit shows content, not blank boxes: preload the sample document
	// and generate its schema, so every box on the page is self-explaining.
	wb.inputArea.value =
		'{\n  "name": "example",\n  "version": 2,\n  "price": 9.99,\n  "tags": ["a", "b"],\n  "meta": { "draft": true, "authors": null }\n}';
	doGenerate();

	// The validation report is plain text in a <textarea>; rebuild it in the
	// other language on every switch. Only error reports carry prose, so the
	// rebuild just re-runs the last action.
	onLang(() => {
		if (wb.outputArea.value.includes('✗') || wb.outputArea.value.includes('✓')) doValidate();
	});
}

