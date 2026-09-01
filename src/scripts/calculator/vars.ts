// Shared scope construction for the calculator pages (standard + graph).
import type { Scope } from './engine';

const VARS_KEY = 'calc:vars';

export function loadVars(): Record<string, number> {
	try {
		const raw = localStorage.getItem(VARS_KEY);
		const parsed = raw ? JSON.parse(raw) : {};
		if (parsed && typeof parsed === 'object') {
			const vars: Record<string, number> = {};
			for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
				if (typeof v === 'number' && Number.isFinite(v)) vars[k] = v;
			}
			return vars;
		}
	} catch {
		// storage unavailable — start fresh
	}
	return {};
}

export function saveVars(vars: Record<string, number>): void {
	const copy: Record<string, number> = {};
	for (const [k, v] of Object.entries(vars)) {
		if (k !== 'ans') copy[k] = v;
	}
	try {
		localStorage.setItem(VARS_KEY, JSON.stringify(copy));
	} catch {
		// ignore
	}
}

export function createScope(): Scope {
	return { vars: loadVars(), deg: false };
}
