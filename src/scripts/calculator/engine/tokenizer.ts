import { CalcError } from './errors';

export type TokenType = 'num' | 'ident' | 'op' | 'lparen' | 'rparen' | 'comma' | 'eq';

export interface Token {
	type: TokenType;
	value: string;
	pos: number;
}

// Numbers: 123, 1.5, .5, 1.5e-3 (exponent only consumed when digits follow,
// so "2e" lexes as 2 * e — implicit multiplication handles it downstream).
const NUM_RE = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/;
const IDENT_RE = /^[a-zA-Z_][a-zA-Z_0-9]*/;
const OPS = new Set(['+', '-', '*', '/', '^', '%', '!']);

/** Convert an expression string into a token stream. Throws CalcError on unknown characters. */
export function tokenize(src: string): Token[] {
	const tokens: Token[] = [];
	let i = 0;
	while (i < src.length) {
		const ch = src[i] as string;
		if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
			i++;
			continue;
		}
		// Unicode aliases for common math symbols
		if (ch === 'π' || ch === 'τ') {
			tokens.push({ type: 'ident', value: ch === 'π' ? 'pi' : 'tau', pos: i });
			i++;
			continue;
		}
		if (ch === '×' || ch === '·') {
			tokens.push({ type: 'op', value: '*', pos: i });
			i++;
			continue;
		}
		if (ch === '÷') {
			tokens.push({ type: 'op', value: '/', pos: i });
			i++;
			continue;
		}
		const rest = src.slice(i);
		if (ch >= '0' && ch <= '9' || ch === '.') {
			const m = NUM_RE.exec(rest);
			if (!m) throw new CalcError(`Malformed number at position ${i + 1}`, i);
			tokens.push({ type: 'num', value: m[0], pos: i });
			i += m[0].length;
			continue;
		}
		const ident = IDENT_RE.exec(rest);
		if (ident) {
			tokens.push({ type: 'ident', value: ident[0], pos: i });
			i += ident[0].length;
			continue;
		}
		if (ch === '(') {
			tokens.push({ type: 'lparen', value: ch, pos: i });
			i++;
			continue;
		}
		if (ch === ')') {
			tokens.push({ type: 'rparen', value: ch, pos: i });
			i++;
			continue;
		}
		if (ch === ',' || ch === ';') {
			tokens.push({ type: 'comma', value: ',', pos: i });
			i++;
			continue;
		}
		if (OPS.has(ch)) {
			tokens.push({ type: 'op', value: ch, pos: i });
			i++;
			continue;
		}
		if (ch === '=') {
			tokens.push({ type: 'eq', value: ch, pos: i });
			i++;
			continue;
		}
		if (ch === '√') {
			tokens.push({ type: 'ident', value: 'sqrt', pos: i });
			i++;
			continue;
		}
		throw new CalcError(`Unexpected character '${ch}' at position ${i + 1}`, i);
	}
	return tokens;
}
