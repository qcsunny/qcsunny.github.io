// JSON Schema generator + validator (draft-07 subset) in one page.
// - Generate: infer a schema from a pasted JSON document
// - Validate: check a JSON document against the schema box, errors listed by
//   JSON path
// 100% in-browser, zero network — same privacy posture as every other tool.

import { isZh, onLang } from './i18n';
import { createWorkbench } from './workbench';

// --- schema inference --------------------------------------------------------------------

type Schema = Record<string, unknown>;

function inferSchema(v: unknown): Schema {
	if (v === null) return { type: 'null' };
	if (typeof v === 'boolean') return { type: 'boolean' };
	if (typeof v === 'number') return { type: Number.isInteger(v) ? 'integer' : 'number' };
	if (typeof v === 'string') return { type: 'string' };
	if (Array.isArray(v)) {
		if (!v.length) return { type: 'array' };
		return { type: 'array', items: v.map(inferSchema).reduce(mergeSchemas) };
	}
	const properties: Record<string, unknown> = {};
	for (const key of Object.keys(v as object).sort()) {
		properties[key] = inferSchema((v as Record<string, unknown>)[key]);
	}
	// A single sample cannot prove a key optional, so every observed key is
	// required — the honest reading of "the document looks like this".
	return { type: 'object', properties, required: Object.keys(properties) };
}

/** Merge the schemas of several array samples into one items schema. */
function mergeSchemas(a: Schema, b: Schema): Schema {
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
			properties[k] = properties[k] ? mergeSchemas(properties[k] as Schema, s as Schema) : s;
		}
		const reqA = (a.required as string[]) ?? [];
		const reqB = new Set((b.required as string[]) ?? []);
		return { type: 'object', properties, required: reqA.filter((k) => reqB.has(k)) };
	}
	if (ta === 'array') {
		return { type: 'array', items: mergeSchemas((a.items as Schema) ?? {}, (b.items as Schema) ?? {}) };
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

function validate(v: unknown, schema: unknown, path: string, out: VError[]): void {
	if (out.length >= 50) return; // a broken schema against a big file: cap the report
	if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return; // unknown schema shapes pass silently
	const s = schema as Schema;

	if (s.type !== undefined) {
		const types = Array.isArray(s.type) ? (s.type as string[]) : [String(s.type)];
		if (!types.some((t) => typeMatches(v, t))) {
			out.push({ path, en: `expected ${types.join(' | ')}, got ${typeOf(v)}`, zh: `期望 ${types.join(' | ')}，实际为 ${typeOf(v)}` });
			return; // wrong root type: deeper checks would only cascade noise
		}
	}
	if (s.enum !== undefined && Array.isArray(s.enum)) {
		if (!s.enum.some((e) => JSON.stringify(e) === JSON.stringify(v))) {
			out.push({ path, en: `value is not one of the allowed enum values`, zh: `值不在 enum 允许的取值中` });
		}
	}
	if (typeof v === 'number') {
		if (typeof s.minimum === 'number' && v < s.minimum)
			out.push({ path, en: `${v} is below the minimum ${s.minimum}`, zh: `${v} 小于最小值 ${s.minimum}` });
		if (typeof s.maximum === 'number' && v > s.maximum)
			out.push({ path, en: `${v} is above the maximum ${s.maximum}`, zh: `${v} 大于最大值 ${s.maximum}` });
	}
	if (typeof v === 'string') {
		if (typeof s.minLength === 'number' && v.length < s.minLength)
			out.push({ path, en: `length ${v.length} is below minLength ${s.minLength}`, zh: `长度 ${v.length} 小于 minLength ${s.minLength}` });
		if (typeof s.maxLength === 'number' && v.length > s.maxLength)
			out.push({ path, en: `length ${v.length} is above maxLength ${s.maxLength}`, zh: `长度 ${v.length} 大于 maxLength ${s.maxLength}` });
		if (typeof s.pattern === 'string' && !new RegExp(s.pattern).test(v))
			out.push({ path, en: `does not match the pattern /${s.pattern}/`, zh: `不匹配 pattern /${s.pattern}/` });
	}
	if (Array.isArray(v)) {
		if (typeof s.minItems === 'number' && v.length < s.minItems)
			out.push({ path, en: `has ${v.length} items, fewer than minItems ${s.minItems}`, zh: `共 ${v.length} 项，少于 minItems ${s.minItems}` });
		if (typeof s.maxItems === 'number' && v.length > s.maxItems)
			out.push({ path, en: `has ${v.length} items, more than maxItems ${s.maxItems}`, zh: `共 ${v.length} 项，多于 maxItems ${s.maxItems}` });
		if (s.items !== undefined) for (let i = 0; i < v.length; i++) validate(v[i], s.items, `${path}[${i}]`, out);
	}
	if (v && typeof v === 'object' && !Array.isArray(v)) {
		const obj = v as Record<string, unknown>;
		for (const key of (s.required as string[]) ?? []) {
			if (!(key in obj))
				out.push({ path, en: `missing required property "${key}"`, zh: `缺少必填属性 "${key}"` });
		}
		const props = (s.properties as Record<string, unknown>) ?? {};
		for (const [key, sub] of Object.entries(props)) {
			if (key in obj) validate(obj[key], sub, /^\w+$/.test(key) ? `${path}.${key}` : `${path}[${JSON.stringify(key)}]`, out);
		}
		if (s.additionalProperties === false) {
			for (const key of Object.keys(obj)) {
				if (!(key in props))
					out.push({ path: `${path}.${key}`, en: `additional property "${key}" is not allowed`, zh: `不允许出现额外属性 "${key}"` });
			}
		}
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
		const schema = JSON.stringify(inferSchema(value), null, 2);
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
