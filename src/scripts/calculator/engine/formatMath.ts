import type { Node } from './parser';
import { parse } from './parser';
import { formatNumber } from './eval';

function escapeXml(str: string): string {
	return str
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}

const GREEK_VARS: Record<string, string> = {
	pi: 'π',
	tau: 'τ',
	phi: 'φ',
	gamma: 'γ',
	e: 'e',
	c: 'c',
};

// Operator precedence:
// 1: + -
// 2: * / %
// 3: unary - +
// 4: ^
// 5: postfix ! %
// 6: primary (num, var, call, parenthesized)
function precedence(node: Node): number {
	switch (node.kind) {
		case 'bin':
			if (node.op === '+' || node.op === '-') return 1;
			if (node.op === '*' || node.op === '/' || node.op === '%') return 2;
			if (node.op === '^') return 4;
			return 0;
		case 'unary':
			return 3;
		case 'postfix':
			return 5;
		case 'num':
		case 'var':
		case 'call':
			return 6;
	}
}

function wrapParens(inner: string): string {
	return `<mrow><mo>(</mo>${inner}<mo>)</mo></mrow>`;
}

export function nodeToMathML(node: Node, parentPrec = 0, isRightChild = false): string {
	switch (node.kind) {
		case 'num':
			return `<mn>${formatNumber(node.v)}</mn>`;

		case 'var': {
			const name = node.name;
			if (name in GREEK_VARS) {
				const sym = GREEK_VARS[name]!;
				const isNormal = name === 'e';
				return isNormal ? `<mi mathvariant="normal">${sym}</mi>` : `<mi>${sym}</mi>`;
			}
			// Subscript detection e.g. x_1, a_0
			const subMatch = /^([a-zA-Z]+)_([0-9]+|[a-zA-Z]+)$/.exec(name);
			if (subMatch) {
				const base = subMatch[1] as string;
				const sub = subMatch[2] as string;
				return `<msub><mi>${escapeXml(base)}</mi><mrow>${/^\d+$/.test(sub) ? `<mn>${sub}</mn>` : `<mi>${escapeXml(sub)}</mi>`}</mrow></msub>`;
			}
			return `<mi>${escapeXml(name)}</mi>`;
		}

		case 'unary': {
			const opSym = node.op === '-' ? '−' : '+';
			const argStr = nodeToMathML(node.arg, 3);
			const res = `<mrow><mo>${opSym}</mo>${argStr}</mrow>`;
			return parentPrec > 3 ? wrapParens(res) : res;
		}

		case 'postfix': {
			const argStr = nodeToMathML(node.arg, 5);
			const opSym = node.op === '!' ? '!' : '%';
			const res = `<mrow>${argStr}<mo>${opSym}</mo></mrow>`;
			return parentPrec > 5 ? wrapParens(res) : res;
		}

		case 'bin': {
			// Special handling for division: true fraction line naturally eliminates parens
			if (node.op === '/') {
				const num = nodeToMathML(node.l, 0);
				const den = nodeToMathML(node.r, 0);
				const frac = `<mfrac><mrow>${num}</mrow><mrow>${den}</mrow></mfrac>`;
				// In exponent context: (a/b)^c, the base needs parens
				return parentPrec >= 4 && !isRightChild ? wrapParens(frac) : frac;
			}

			// Exponent / power
			if (node.op === '^') {
				// Base needs parens if lower precedence or if another power
				const basePrec = precedence(node.l);
				const baseNeedsParens = basePrec < 4 || (node.l.kind === 'bin' && node.l.op === '/');
				const baseStr = nodeToMathML(node.l, baseNeedsParens ? 10 : 4, false);
				const expStr = nodeToMathML(node.r, 0, true);
				const pow = `<msup><mrow>${baseNeedsParens ? wrapParens(baseStr) : baseStr}</mrow><mrow>${expStr}</mrow></msup>`;
				return parentPrec > 4 ? wrapParens(pow) : pow;
			}

			// Multiplication
			if (node.op === '*') {
				const lStr = nodeToMathML(node.l, 2, false);
				const rStr = nodeToMathML(node.r, 2, true);
				const mul = `<mrow>${lStr}<mo>×</mo>${rStr}</mrow>`;
				return parentPrec > 2 ? wrapParens(mul) : mul;
			}

			// Modulo
			if (node.op === '%') {
				const lStr = nodeToMathML(node.l, 2, false);
				const rStr = nodeToMathML(node.r, 2, true);
				const mod = `<mrow>${lStr}<mo>mod</mo>${rStr}</mrow>`;
				return parentPrec > 2 ? wrapParens(mod) : mod;
			}

			// Addition and subtraction
			const opSym = node.op === '-' ? '−' : '+';
			const lStr = nodeToMathML(node.l, 1, false);
			// For subtraction, a - (b + c) or a - (b - c) needs parens on right child
			const rNeedsParens = node.op === '-' && node.r.kind === 'bin' && (node.r.op === '+' || node.r.op === '-');
			const rStr = nodeToMathML(node.r, rNeedsParens ? 10 : 1, true);
			const add = `<mrow>${lStr}<mo>${opSym}</mo>${rNeedsParens ? wrapParens(rStr) : rStr}</mrow>`;
			return parentPrec > 1 ? wrapParens(add) : add;
		}

		case 'call': {
			const name = node.name;
			const args = node.args;

			// Square root
			if (name === 'sqrt' && args.length === 1) {
				return `<msqrt><mrow>${nodeToMathML(args[0]!, 0)}</mrow></msqrt>`;
			}

			// Cube root
			if (name === 'cbrt' && args.length === 1) {
				return `<mroot><mrow>${nodeToMathML(args[0]!, 0)}</mrow><mn>3</mn></mroot>`;
			}

			// Arbitrary root: root(x, n)
			if (name === 'root' && args.length === 2) {
				return `<mroot><mrow>${nodeToMathML(args[0]!, 0)}</mrow><mrow>${nodeToMathML(args[1]!, 0)}</mrow></mroot>`;
			}

			// Absolute value
			if (name === 'abs' && args.length === 1) {
				return `<mrow><mo>|</mo>${nodeToMathML(args[0]!, 0)}<mo>|</mo></mrow>`;
			}

			// Combinations: nCr(n, r) -> binomial coefficient (n \atop r)
			if (name === 'nCr' && args.length === 2) {
				return `<mrow><mo>(</mo><mfrac linethickness="0"><mrow>${nodeToMathML(args[0]!, 0)}</mrow><mrow>${nodeToMathML(args[1]!, 0)}</mrow></mfrac><mo>)</mo></mrow>`;
			}

			// Permutations: nPr(n, r)
			if (name === 'nPr' && args.length === 2) {
				return `<mrow><msubsup><mi mathvariant="normal">P</mi><mrow>${nodeToMathML(args[0]!, 0)}</mrow><mrow>${nodeToMathML(args[1]!, 0)}</mrow></msubsup></mrow>`;
			}

			// Logarithm with base: log(x, base)
			if (name === 'log' && args.length === 2) {
				return `<mrow><msub><mi mathvariant="normal">log</mi><mrow>${nodeToMathML(args[1]!, 0)}</mrow></msub><mo>(</mo>${nodeToMathML(args[0]!, 0)}<mo>)</mo></mrow>`;
			}

			// Standard trigonometric / logarithmic functions
			const renderedArgs = args.map((a) => nodeToMathML(a, 0)).join('<mo>,</mo>');
			return `<mrow><mi mathvariant="normal">${escapeXml(name)}</mi><mo>(</mo>${renderedArgs}<mo>)</mo></mrow>`;
		}
	}
}

const ASSIGN_RE = /^\s*([a-zA-Z_][a-zA-Z_0-9]*)\s*=\s*(.+)$/;

/**
 * Format any math expression or assignment string into a full MathML <math display="block"> element.
 * Returns null if the expression cannot be parsed.
 */
export function formatExpressionToMathML(src: string, resultValue?: string): string | null {
	const trimmed = src.trim();
	if (!trimmed) return null;

	// Check if this is an assignment
	const assignMatch = ASSIGN_RE.exec(trimmed);
	let varName: string | null = null;
	let exprPart = trimmed;
	if (assignMatch) {
		varName = assignMatch[1] as string;
		exprPart = assignMatch[2] as string;
	}

	let ast: Node | null = null;
	let trailingOp: string | null = null;

	try {
		ast = parse(exprPart);
	} catch {
		// Attempt to recover if typing ended with a trailing binary operator (+, -, *, /, ^)
		const trailMatch = /^(.*?)\s*([+\-*/^])\s*$/.exec(exprPart);
		if (trailMatch && trailMatch[1]) {
			try {
				ast = parse(trailMatch[1]);
				trailingOp = trailMatch[2] as string;
			} catch {
				ast = null;
			}
		}
	}

	if (!ast) return null;

	let body = nodeToMathML(ast, 0);

	if (trailingOp) {
		const sym = trailingOp === '*' ? '×' : trailingOp === '/' ? '÷' : trailingOp === '-' ? '−' : trailingOp;
		body = `<mrow>${body}<mo>${sym}</mo></mrow>`;
	}

	if (varName) {
		body = `<mrow><mi>${escapeXml(varName)}</mi><mo>=</mo>${body}</mrow>`;
	}

	if (resultValue !== undefined && resultValue !== '') {
		body = `<mrow>${body}<mo>=</mo><mn>${escapeXml(resultValue)}</mn></mrow>`;
	}

	return `<math display="block" class="calc-math-root">${body}</math>`;
}
