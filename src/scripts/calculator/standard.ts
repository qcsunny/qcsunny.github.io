// Entry for /calculators/standard — the scientific calculator page.
import { initBasic } from './basic';
import { createScope, saveVars } from './vars';

const scope = createScope();
initBasic(scope, {
	onVarsChange: () => {
		saveVars(scope.vars);
	},
});
