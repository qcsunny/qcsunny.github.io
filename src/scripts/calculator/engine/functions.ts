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
	// Golden ratio (1 + √5) / 2
	phi: (1 + Math.sqrt(5)) / 2,
	// Euler-Mascheroni constant
	gamma: 0.5772156649015329,
	// Speed of light in vacuum (m/s)
	c: 299792458,
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
		throw new CalcError('Factorial requires a non-negative integer', '阶乘只接受非负整数');
	}
	if (n > 170) throw new CalcError('Factorial result too large (n ≤ 170)', '阶乘结果过大（n ≤ 170）');
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
	log: {
		arity: [1, 2],
		fn: ([x, base]) => (base === undefined ? Math.log10(x) : Math.log(x) / Math.log(base)),
	},
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
	gcd: {
		arity: 2,
		fn: ([a, b]) => {
			let x = Math.abs(Math.round(a));
			let y = Math.abs(Math.round(b));
			while (y > 0) [x, y] = [y, x % y];
			return x;
		},
	},
	lcm: {
		arity: 2,
		fn: ([a, b]) => {
			const x = Math.abs(Math.round(a));
			const y = Math.abs(Math.round(b));
			if (x === 0 || y === 0) return 0;
			let m = x, n = y;
			while (n > 0) [m, n] = [n, m % n];
			return (x / m) * y;
		},
	},
	nCr: {
		arity: 2,
		fn: ([n, r]) => {
			if (!Number.isInteger(n) || !Number.isInteger(r) || n < 0 || r < 0 || r > n) {
				throw new CalcError(
					'nCr requires integers with 0 ≤ r ≤ n',
					'nCr 要求整数且满足 0 ≤ r ≤ n',
				);
			}
			const k = Math.min(r, n - r);
			let res = 1;
			for (let i = 1; i <= k; i++) {
				res = (res * (n - i + 1)) / i;
			}
			return Math.round(res);
		},
	},
	nPr: {
		arity: 2,
		fn: ([n, r]) => {
			if (!Number.isInteger(n) || !Number.isInteger(r) || n < 0 || r < 0 || r > n) {
				throw new CalcError(
					'nPr requires integers with 0 ≤ r ≤ n',
					'nPr 要求整数且满足 0 ≤ r ≤ n',
				);
			}
			let res = 1;
			for (let i = 0; i < r; i++) {
				res *= n - i;
			}
			return Math.round(res);
		},
	},
};
