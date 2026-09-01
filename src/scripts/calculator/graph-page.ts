// Entry for /calculators/graph — the function grapher page.
import { initGraph } from './graph';
import { createScope } from './vars';

const scope = createScope();
initGraph(scope);
