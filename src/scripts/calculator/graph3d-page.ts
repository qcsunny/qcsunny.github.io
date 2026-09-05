// Entry for /calculators/graph3d — the 3D surface plotter page.
// Shares the calculator's scope so a formula may reference stored variables
// (e.g. `a*x*y` after setting `a` on /calculators/standard/).
import { initGraph3d } from './graph3d';
import { createScope } from './vars';

const scope = createScope();
initGraph3d(scope);
