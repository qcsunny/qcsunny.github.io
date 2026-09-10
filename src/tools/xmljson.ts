// XML ⇄ JSON conversion for the /devtools/xml-json-converter tool. A small
// self-contained XML subset parser (elements, attributes, text, comments,
// CDATA, processing instructions, doctype) — enough for the config / feed /
// sippet XML people convert, with precise errors for the rest.
//
// JSON shape convention (the classic xml2js one):
//   <person id="1">hi</person>            → { "person": { "@id": "1", "#text": "hi" } }
//   <a><b>1</b><b>2</b></a>               → { "a": { "b": ["1", "2"] } }
//   <a><b>1</b></a>                       → { "a": { "b": "1" } }   (single child stays scalar)
// Repeated elements become arrays; a child that is pure text with no
// attributes collapses to that text string.

export interface XmlNode {
	tag: string;
	attrs: Record<string, string>;
	children: XmlNode[];
	text: string;
}

class ParseContext {
	pos = 0;
	line = 1;
	constructor(readonly src: string) {}
	/** Current position as "line N" for error messages. */
	where(): string {
		return `line ${this.line}`;
	}
	advance(n: number): void {
		for (let i = 0; i < n && this.pos < this.src.length; i++) {
			if (this.src[this.pos] === '\n') this.line++;
			this.pos++;
		}
	}
	rest(): string {
		return this.src.slice(this.pos);
	}
}

const NAME_RE = /^[A-Za-z_:][A-Za-z0-9_.:-]*/;

function parseName(ctx: ParseContext): string {
	const m = NAME_RE.exec(ctx.rest());
	if (!m) throw new Error(`${ctx.where()}: expected an element name`);
	ctx.advance(m[0].length);
	return m[0];
}

/** Decode the five predefined XML entities plus numeric character refs. */
export function decodeEntities(s: string): string {
	return s.replace(/&(#x?[0-9a-fA-F]+|\w+);/g, (whole, body: string) => {
		if (body === 'lt') return '<';
		if (body === 'gt') return '>';
		if (body === 'amp') return '&';
		if (body === 'quot') return '"';
		if (body === 'apos') return "'";
		if (body.startsWith('#x') || body.startsWith('#X')) return String.fromCodePoint(parseInt(body.slice(2), 16));
		if (body.startsWith('#')) return String.fromCodePoint(parseInt(body.slice(1), 10));
		return whole; // unknown entity: keep verbatim
	});
}

/** Parse one element at ctx.pos (which must sit on '<'). */
function parseElement(ctx: ParseContext): XmlNode {
	if (ctx.src[ctx.pos] !== '<') throw new Error(`${ctx.where()}: expected "<"`);
	ctx.advance(1);
	const tag = parseName(ctx);
	const attrs: Record<string, string> = {};
	// attribute list
	for (;;) {
		while (/\s/.test(ctx.src[ctx.pos] ?? '')) ctx.advance(1);
		const ch = ctx.src[ctx.pos];
		if (ch === '/' && ctx.src[ctx.pos + 1] === '>') {
			ctx.advance(2);
			return { tag, attrs, children: [], text: '' };
		}
		if (ch === '>') {
			ctx.advance(1);
			break;
		}
		if (ch === undefined) throw new Error(`${ctx.where()}: unexpected end of input inside <${tag}>`);
		const attrName = parseName(ctx);
		while (/\s/.test(ctx.src[ctx.pos] ?? '')) ctx.advance(1);
		if (ctx.src[ctx.pos] !== '=') throw new Error(`${ctx.where()}: attribute "${attrName}" has no value`);
		ctx.advance(1);
		while (/\s/.test(ctx.src[ctx.pos] ?? '')) ctx.advance(1);
		const quote = ctx.src[ctx.pos];
		if (quote !== '"' && quote !== "'") throw new Error(`${ctx.where()}: attribute value must be quoted`);
		const close = ctx.src.indexOf(quote, ctx.pos + 1);
		if (close === -1) throw new Error(`${ctx.where()}: attribute value is missing its closing quote`);
		attrs[attrName] = decodeEntities(ctx.src.slice(ctx.pos + 1, close));
		ctx.advance(close + 1 - ctx.pos);
	}
	// children until the matching close tag
	const node: XmlNode = { tag, attrs, children: [], text: '' };
	for (;;) {
		if (ctx.pos >= ctx.src.length) throw new Error(`${ctx.where()}: element <${tag}> is never closed`);
		if (ctx.src.startsWith('</', ctx.pos)) {
			ctx.advance(2);
			const closeTag = parseName(ctx);
			while (/\s/.test(ctx.src[ctx.pos] ?? '')) ctx.advance(1);
			if (ctx.src[ctx.pos] !== '>') throw new Error(`${ctx.where()}: malformed closing tag </${closeTag}>`);
			ctx.advance(1);
			if (closeTag !== tag) throw new Error(`${ctx.where()}: closing tag </${closeTag}> does not match <${tag}>`);
			return node;
		}
		if (ctx.src.startsWith('<!--', ctx.pos)) {
			const end = ctx.src.indexOf('-->', ctx.pos + 4);
			if (end === -1) throw new Error(`${ctx.where()}: comment is never closed`);
			ctx.advance(end + 3 - ctx.pos);
			continue;
		}
		if (ctx.src.startsWith('<![CDATA[', ctx.pos)) {
			const end = ctx.src.indexOf(']]>', ctx.pos + 9);
			if (end === -1) throw new Error(`${ctx.where()}: CDATA section is never closed`);
			node.text += ctx.src.slice(ctx.pos + 9, end);
			ctx.advance(end + 3 - ctx.pos);
			continue;
		}
		if (ctx.src.startsWith('<?', ctx.pos) || ctx.src.startsWith('<!', ctx.pos)) {
			// processing instruction or doctype: skip to its '>'
			const end = ctx.src.indexOf('>', ctx.pos);
			if (end === -1) throw new Error(`${ctx.where()}: declaration is never closed`);
			ctx.advance(end + 1 - ctx.pos);
			continue;
		}
		if (ctx.src[ctx.pos] === '<') {
			node.children.push(parseElement(ctx));
			continue;
		}
		// text run up to the next '<'
		const next = ctx.src.indexOf('<', ctx.pos);
		const stop = next === -1 ? ctx.src.length : next;
		node.text += decodeEntities(ctx.src.slice(ctx.pos, stop));
		ctx.advance(stop - ctx.pos);
	}
}

/** Parse an XML document; returns the root element. */
export function parseXml(text: string): XmlNode {
	const ctx = new ParseContext(text.replace(/\r\n/g, '\n').trim());
	// prolog: XML declaration, doctype, comments and whitespace before the root
	for (;;) {
		while (/\s/.test(ctx.src[ctx.pos] ?? '')) ctx.advance(1);
		if (ctx.src.startsWith('<?', ctx.pos) || ctx.src.startsWith('<!', ctx.pos)) {
			if (ctx.src.startsWith('<!--', ctx.pos)) {
				const end = ctx.src.indexOf('-->', ctx.pos + 4);
				if (end === -1) throw new Error(`${ctx.where()}: comment is never closed`);
				ctx.advance(end + 3 - ctx.pos);
				continue;
			}
			const end = ctx.src.indexOf('>', ctx.pos);
			if (end === -1) throw new Error(`${ctx.where()}: declaration is never closed`);
			ctx.advance(end + 1 - ctx.pos);
			continue;
		}
		break;
	}
	const root = parseElement(ctx);
	// trailing content: only whitespace / comments are allowed
	for (;;) {
		while (/\s/.test(ctx.src[ctx.pos] ?? '')) ctx.advance(1);
		if (ctx.pos >= ctx.src.length) return root;
		if (ctx.src.startsWith('<!--', ctx.pos)) {
			const end = ctx.src.indexOf('-->', ctx.pos + 4);
			if (end === -1) throw new Error(`${ctx.where()}: comment is never closed`);
			ctx.advance(end + 3 - ctx.pos);
			continue;
		}
		throw new Error(`${ctx.where()}: content after the document root element`);
	}
}

// --- XML → JSON ------------------------------------------------------------------------

/** A node with only text (no attrs, no children) becomes that text. */
function nodeValue(node: XmlNode): unknown {
	if (node.children.length === 0 && Object.keys(node.attrs).length === 0) {
		return node.text;
	}
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(node.attrs)) out[`@${k}`] = v;
	const grouped = new Map<string, XmlNode[]>();
	for (const child of node.children) {
		const list = grouped.get(child.tag) ?? [];
		list.push(child);
		grouped.set(child.tag, list);
	}
	for (const [tag, list] of grouped) {
		out[tag] = list.length === 1 ? nodeValue(list[0]!) : list.map(nodeValue);
	}
	if (node.text.trim() || node.children.length === 0) out['#text'] = node.text.trim();
	return out;
}

/** XML text → JSON text (2-space pretty). */
export function xmlToJson(xml: string): string {
	const root = parseXml(xml);
	return JSON.stringify({ [root.tag]: nodeValue(root) }, null, 2) + '\n';
}

// --- JSON → XML ------------------------------------------------------------------------

function escapeXml(s: string): string {
	return s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c] ?? c);
}

const TAG_RE = /^[A-Za-z_:][A-Za-z0-9_.:-]*$/;

function emitValue(tag: string, value: unknown, indent: string, out: string[]): void {
	if (!TAG_RE.test(tag)) throw new Error(`"${tag}" is not a valid XML element name`);
	if (value === null || value === undefined) {
		out.push(`${indent}<${tag}/>`);
		return;
	}
	if (Array.isArray(value)) {
		for (const item of value) emitValue(tag, item, indent, out);
		return;
	}
	if (typeof value !== 'object') {
		out.push(`${indent}<${tag}>${escapeXml(String(value))}</${tag}>`);
		return;
	}
	const entries = Object.entries(value as Record<string, unknown>);
	const attrs = entries.filter(([k]) => k.startsWith('@'));
	const text = entries.filter(([k]) => k === '#text');
	const children = entries.filter(([k]) => !k.startsWith('@') && k !== '#text');
	const attrStr = attrs.map(([k, v]) => ` ${k.slice(1)}="${escapeXml(String(v))}"`).join('');
	const textStr = text.map(([, v]) => escapeXml(String(v))).join('');
	if (!children.length) {
		if (!textStr) out.push(`${indent}<${tag}${attrStr}/>`);
		else out.push(`${indent}<${tag}${attrStr}>${textStr}</${tag}>`);
		return;
	}
	out.push(`${indent}<${tag}${attrStr}>${textStr}`);
	for (const [k, v] of children) emitValue(k, v, `${indent}  `, out);
	out.push(`${indent}</${tag}>`);
}

/** JSON text → XML text. The root must be an object with exactly one key. */
export function jsonToXml(jsonText: string): string {
	const data: unknown = JSON.parse(jsonText);
	if (!data || typeof data !== 'object' || Array.isArray(data)) {
		throw new Error('the JSON root must be an object');
	}
	const entries = Object.entries(data as Record<string, unknown>);
	if (entries.length !== 1) {
		throw new Error(`the JSON root must have exactly one key (got ${entries.length}) — it becomes the XML root element`);
	}
	const out: string[] = ['<?xml version="1.0" encoding="UTF-8"?>'];
	emitValue(entries[0]![0], entries[0]![1], '', out);
	return out.join('\n') + '\n';
}
