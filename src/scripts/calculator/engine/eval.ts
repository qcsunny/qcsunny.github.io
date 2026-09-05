import { CalcError } from './errors';
import { CONSTANTS, factorial, FUNCTIONS, type Scope } from './functions';
import type { Node } from './parser';

/** Interpret an AST against a scope. Non-finite results (Overflow/NaN) are returned as-is. */
export function evalNode(node: Node, scope: Scope): number {
	switch (node.kind) {
		case 'num':
			return node.v;
		case 'var':
			return lookupVar(node.name, scope, node.pos);
		case 'call': {
			const def = FUNCTIONS[node.name];
			if (!def) throw new CalcError(`Unknown function '${node.name}'`, node.pos);
			checkArity(node.name, def.arity, node.args.length, node.pos);
			const args = node.args.map((a) => evalNode(a, scope));
			return def.fn(args, scope);
		}
		case 'bin': {
			const l = evalNode(node.l, scope);
			const r = evalNode(node.r, scope);
			return applyBin(node.op, l, r);
		}
		case 'unary': {
			const v = evalNode(node.arg, scope);
			return node.op === '-' ? -v : v;
		}
		case 'postfix': {
			const v = evalNode(node.arg, scope);
			return node.op === '!' ? factorial(v) : v / 100;
		}
	}
}

function lookupVar(name: string, scope: Scope, pos: number): number {
	const c = CONSTANTS[name];
	if (c !== undefined) return c;
	if (name in scope.vars) return scope.vars[name] as number;
	if (name in FUNCTIONS) {
		throw new CalcError(`'${name}' is a function — use ${name}(x)`, pos);
	}
	throw new CalcError(`Unknown variable '${name}'`, pos);
}

function checkArity(name: string, arity: number | [number, number], got: number, pos: number): void {
	const ok =
		typeof arity === 'number' ? got === arity : got >= arity[0] && got <= arity[1];
	if (!ok) {
		const want = typeof arity === 'number' ? `${arity}` : `${arity[0]}–${arity[1]}`;
		throw new CalcError(`${name}() expects ${want} argument(s), got ${got}`, pos);
	}
}

function applyBin(op: '+' | '-' | '*' | '/' | '%' | '^', l: number, r: number): number {
	switch (op) {
		case '+':
			return l + r;
		case '-':
			return l - r;
		case '*':
			return l * r;
		case '/':
			return l / r;
		case '%':
			return l % r;
		case '^':
			return l ** r;
	}
}

/**
 * Compile an AST into a closure `(scope) => number` — one pass of plain JS
 * calls per evaluation, used by the graph's hot sampling loop.
 */
export function compileNode(node: Node): (scope: Scope) => number {
	switch (node.kind) {
		case 'num': {
			const v = node.v;
			return () => v;
		}
		case 'var': {
			const { name } = node;
			const c = CONSTANTS[name];
			if (c !== undefined) return () => c;
			return (scope) => {
				const v = scope.vars[name];
				if (v !== undefined) return v;
				if (name in FUNCTIONS) throw new CalcError(`'${name}' is a function — use ${name}(x)`);
				throw new CalcError(`Unknown variable '${name}'`);
			};
		}
		case 'call': {
			const def = FUNCTIONS[node.name];
			if (!def) return () => { throw new CalcError(`Unknown function '${node.name}'`); };
			const argFns = node.args.map((a) => compileNode(a));
			const name = node.name;
			const arity = def.arity;
			return (scope) => {
				if (typeof arity === 'number' ? argFns.length !== arity : argFns.length < arity[0]) {
					const want = typeof arity === 'number' ? `${arity}` : `${arity[0]}–${arity[1]}`;
					throw new CalcError(`${name}() expects ${want} argument(s)`);
				}
				return def.fn(argFns.map((f) => f(scope)), scope);
			};
		}
		case 'bin': {
			const lf = compileNode(node.l);
			const rf = compileNode(node.r);
			const op = node.op;
			return (scope) => applyBin(op, lf(scope), rf(scope));
		}
		case 'unary': {
			const f = compileNode(node.arg);
			const op = node.op;
			return (scope) => (op === '-' ? -f(scope) : f(scope));
		}
		case 'postfix': {
			const f = compileNode(node.arg);
			const op = node.op;
			return (scope) => {
				const v = f(scope);
				return op === '!' ? factorial(v) : v / 100;
			};
		}
	}
}

/** Format a number for display: 12 significant digits, no float noise. */
export function formatNumber(n: number): string {
	if (Number.isNaN(n)) return 'undefined';
	if (!Number.isFinite(n)) return n > 0 ? '∞' : '-∞';
	// An exact integer inside the safe range already has a short, lossless
	// decimal form, so falling through to the 1e12 exponential cutoff would
	// throw away digits the double is holding perfectly: 1 TiB rendered as
	// `1.099512e+12` instead of `1099511627776`, when the exact byte count is
	// the entire reason someone opens a data-size converter. Above 2^53 the
	// double genuinely cannot hold the digits, so exponential stays honest.
	if (Number.isSafeInteger(n)) return String(n);
	const abs = Math.abs(n);
	if (abs !== 0 && (abs >= 1e12 || abs < 1e-9)) {
		return trimExp(n.toExponential(6));
	}
	return String(Number(n.toPrecision(12)));
}

function trimExp(s: string): string {
	return s.replace(/(\.\d*?)0+e/, '$1e').replace(/\.e/, 'e');
}
