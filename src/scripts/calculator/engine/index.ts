import { compileNode, evalNode, formatNumber } from './eval';
import { CONSTANTS, FUNCTIONS, type Scope } from './functions';
import { parse } from './parser';

export { CalcError } from './errors';
export type { Scope } from './functions';
export { formatNumber };

/** Evaluate an expression string, throwing CalcError on syntax/semantic errors. */
export function evaluate(src: string, scope: Scope): number {
	return evalNode(parse(src), scope);
}

/** Parse once, evaluate many times (graph sampling hot path). */
export function compile(src: string): (scope: Scope) => number {
	return compileNode(parse(src));
}

const ASSIGN_RE = /^\s*([a-zA-Z_][a-zA-Z_0-9]*)\s*=\s*(.+)$/;

/**
 * Recognise `name = expression` assignments. On success writes the variable
 * into scope.vars and returns the name; returns null when src is not an
 * assignment (evaluation errors from the right-hand side propagate).
 */
export function tryAssign(src: string, scope: Scope): string | null {
	const m = ASSIGN_RE.exec(src);
	if (!m) return null;
	const name = m[1] as string;
	if (name in CONSTANTS || name in FUNCTIONS) return null; // let normal eval report it
	scope.vars[name] = evaluate(m[2] as string, scope);
	return name;
}
