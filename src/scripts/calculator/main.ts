import type { Scope } from './engine';
import { initBasic } from './basic';
import { initGraph } from './graph';
import { initStats } from './stats';
import { initTabs } from './tabs';
import { initUnits } from './units';

const VARS_KEY = 'calc:vars';

function loadVars(): Record<string, number> {
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

function saveVars(vars: Record<string, number>): void {
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

const scope: Scope = { vars: loadVars(), deg: false };

initTabs();
const graph = initGraph(scope);
initBasic(scope, {
	onVarsChange: () => {
		saveVars(scope.vars);
		graph.refresh();
	},
});
initUnits();
initStats();
