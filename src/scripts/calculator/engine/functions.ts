import { CalcError } from './errors';

/** Evaluation scope: user variables plus the angle mode. */
export interface Scope {
	vars: Record<string, number>;
	/** true = degrees, false = radians */
	deg: boolean;
}

export const CONSTANTS: Record<string, number> = {
	pi: Math.PI,
	e: Math.E,
	tau: Math.PI * 2,
};

export interface FuncDef {
	arity: number | [number, number];
	fn: (args: number[], scope: Scope) => number;
}

const toRad = (v: number, s: Scope): number => (s.deg ? (v * Math.PI) / 180 : v);
const fromRad = (v: number, s: Scope): number => (s.deg ? (v * 180) / Math.PI : v);

/** Factorial used by both the `!` postfix operator and the fact() function. */
export function factorial(n: number): number {
	if (!Number.isInteger(n) || n < 0) {
		throw new CalcError('Factorial requires a non-negative integer');
	}
	if (n > 170) throw new CalcError('Factorial result too large (n ≤ 170)');
	let r = 1;
	for (let k = 2; k <= n; k++) r *= k;
	return r;
}

export const FUNCTIONS: Record<string, FuncDef> = {
	sin: { arity: 1, fn: ([x], s) => Math.sin(toRad(x, s)) },
	cos: { arity: 1, fn: ([x], s) => Math.cos(toRad(x, s)) },
	tan: { arity: 1, fn: ([x], s) => Math.tan(toRad(x, s)) },
	asin: { arity: 1, fn: ([x], s) => fromRad(Math.asin(x), s) },
	acos: { arity: 1, fn: ([x], s) => fromRad(Math.acos(x), s) },
	atan: { arity: 1, fn: ([x], s) => fromRad(Math.atan(x), s) },
	atan2: { arity: 2, fn: ([y, x], s) => fromRad(Math.atan2(y, x), s) },
	sinh: { arity: 1, fn: ([x]) => Math.sinh(x) },
	cosh: { arity: 1, fn: ([x]) => Math.cosh(x) },
	tanh: { arity: 1, fn: ([x]) => Math.tanh(x) },
	ln: { arity: 1, fn: ([x]) => Math.log(x) },
	log: { arity: 1, fn: ([x]) => Math.log10(x) },
	log2: { arity: 1, fn: ([x]) => Math.log2(x) },
	sqrt: { arity: 1, fn: ([x]) => Math.sqrt(x) },
	cbrt: { arity: 1, fn: ([x]) => Math.cbrt(x) },
	abs: { arity: 1, fn: ([x]) => Math.abs(x) },
	exp: { arity: 1, fn: ([x]) => Math.exp(x) },
	floor: { arity: 1, fn: ([x]) => Math.floor(x) },
	ceil: { arity: 1, fn: ([x]) => Math.ceil(x) },
	round: { arity: 1, fn: ([x]) => Math.round(x) },
	sign: { arity: 1, fn: ([x]) => Math.sign(x) },
	fact: { arity: 1, fn: ([n]) => factorial(n) },
	pow: { arity: 2, fn: ([a, b]) => a ** b },
	min: { arity: [1, Infinity], fn: (args) => Math.min(...args) },
	max: { arity: [1, Infinity], fn: (args) => Math.max(...args) },
};
