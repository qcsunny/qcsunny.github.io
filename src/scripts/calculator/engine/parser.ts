import { CalcError } from './errors';
import { tokenize, type Token } from './tokenizer';

export type Node =
	| { kind: 'num'; v: number }
	| { kind: 'var'; name: string; pos: number }
	| { kind: 'call'; name: string; args: Node[]; pos: number }
	| { kind: 'bin'; op: '+' | '-' | '*' | '/' | '%' | '^'; l: Node; r: Node }
	| { kind: 'unary'; op: '-' | '+'; arg: Node }
	| { kind: 'postfix'; op: '!' | '%'; arg: Node };

/**
 * Recursive-descent parser.
 *
 * expr    := term (('+'|'-') term)*
 * term    := unary (('*'|'/'|'%') unary | implicit-mul)*
 * unary   := ('-'|'+') unary | power          // -2^2 = -(2^2)
 * power   := postfix ('^' unary)?             // ^ is right-associative
 * postfix := primary ('!' | '%')*
 * primary := number | constOrVar | func '(' args ')' | '(' expr ')'
 *
 * Implicit multiplication: a number/identifier/'(' following an operand means
 * multiplication, so `2x`, `3sin(x)` and `(x+1)(x-1)` all work.
 *
 * '%' disambiguation: after an operand, '%' is the percent operator unless it
 * is immediately followed by something that starts a new operand, in which
 * case it is binary modulo (`8 % 3`), while `50%` and `50% + 1` are percent.
 */
export function parse(src: string): Node {
	const parser = new Parser(tokenize(src));
	if (parser.tokens.length === 0) throw new CalcError('Empty expression');
	const node = parser.parseExpr();
	const extra = parser.peek();
	if (extra) throw unexpected(extra);
	return node;
}

function unexpected(t: Token): CalcError {
	const shown = t.type === 'eq' ? '=' : t.value;
	return new CalcError(`Unexpected '${shown}' at position ${t.pos + 1}`, t.pos);
}

function startsOperand(t: Token | undefined): boolean {
	return !!t && (t.type === 'num' || t.type === 'ident' || t.type === 'lparen');
}

class Parser {
	tokens: Token[];
	private i = 0;

	constructor(tokens: Token[]) {
		this.tokens = tokens;
	}

	private peek(): Token | undefined {
		return this.tokens[this.i];
	}

	private peekAt(offset: number): Token | undefined {
		return this.tokens[this.i + offset];
	}

	private next(): Token {
		const t = this.tokens[this.i];
		if (!t) throw new CalcError('Unexpected end of expression', this.srcLength());
		this.i++;
		return t;
	}

	private srcLength(): number {
		const last = this.tokens[this.tokens.length - 1];
		return last ? last.pos + last.value.length : 0;
	}

	parseExpr(): Node {
		let node = this.parseTerm();
		for (;;) {
			const t = this.peek();
			if (t?.type === 'op' && (t.value === '+' || t.value === '-')) {
				this.i++;
				const r = this.parseTerm();
				node = { kind: 'bin', op: t.value as '+' | '-', l: node, r };
			} else {
				return node;
			}
		}
	}

	private parseTerm(): Node {
		let node = this.parseUnary();
		for (;;) {
			const t = this.peek();
			if (t?.type === 'op' && (t.value === '*' || t.value === '/' || t.value === '%')) {
				this.i++;
				const r = this.parseUnary();
				node = { kind: 'bin', op: t.value as '*' | '/' | '%', l: node, r };
			} else if (startsOperand(t)) {
				// Implicit multiplication: 2x, 3sin(x), (x+1)(x-1)
				const r = this.parseUnary();
				node = { kind: 'bin', op: '*', l: node, r };
			} else {
				return node;
			}
		}
	}

	private parseUnary(): Node {
		const t = this.peek();
		if (t?.type === 'op' && (t.value === '-' || t.value === '+')) {
			this.i++;
			const arg = this.parseUnary();
			return { kind: 'unary', op: t.value as '-' | '+', arg };
		}
		return this.parsePower();
	}

	private parsePower(): Node {
		const base = this.parsePostfix();
		const t = this.peek();
		if (t?.type === 'op' && t.value === '^') {
			this.i++;
			const exp = this.parseUnary(); // right-associative, allows 2^-3
			return { kind: 'bin', op: '^', l: base, r: exp };
		}
		return base;
	}

	private parsePostfix(): Node {
		let node = this.parsePrimary();
		for (;;) {
			const t = this.peek();
			if (t?.type === 'op' && t.value === '!') {
				this.i++;
				node = { kind: 'postfix', op: '!', arg: node };
			} else if (t?.type === 'op' && t.value === '%' && !startsOperand(this.peekAt(1))) {
				this.i++;
				node = { kind: 'postfix', op: '%', arg: node };
			} else {
				return node;
			}
		}
	}

	private parsePrimary(): Node {
		const t = this.next();
		if (t.type === 'num') return { kind: 'num', v: Number(t.value) };
		if (t.type === 'ident') {
			const after = this.peek();
			if (after?.type === 'lparen') {
				this.i++;
				const args: Node[] = [];
				if (this.peek()?.type === 'rparen') {
					this.i++;
				} else {
					for (;;) {
						args.push(this.parseExpr());
						const sep = this.peek();
						if (sep?.type === 'comma') {
							this.i++;
							continue;
						}
						if (sep?.type === 'rparen') {
							this.i++;
							break;
						}
						throw new CalcError(
							`Expected ',' or ')' at position ${this.tokens[this.i] ? this.tokens[this.i].pos + 1 : 'end'}`,
						);
					}
				}
				return { kind: 'call', name: t.value, args, pos: t.pos };
			}
			return { kind: 'var', name: t.value, pos: t.pos };
		}
		if (t.type === 'lparen') {
			const inner = this.parseExpr();
			const close = this.peek();
			if (close?.type === 'rparen') {
				this.i++;
				return inner;
			}
			throw new CalcError('Missing closing parenthesis', t.pos);
		}
		throw unexpected(t);
	}
}
