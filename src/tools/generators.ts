// Registry entries for the three generators (/tools/password-generator,
// /tools/uuid-generator, /tools/random-number). Rendered by
// src/scripts/tools/generators.ts — these need crypto APIs and copy buttons,
// which the plain form renderer doesn't cover.

import type { ToolEntry } from './registry';

export const GENERATOR_TOOLS: ToolEntry[] = [
	{
		slug: 'password-generator',
		category: 'tools',
		name: 'Password Generator',
		description: 'Generate strong random passwords with crypto-grade randomness.',
		kind: 'generator',
		config: { generator: 'password', minLen: 8, maxLen: 64, defLen: 16 },
	},
	{
		slug: 'uuid-generator',
		category: 'tools',
		name: 'UUID Generator',
		description: 'Generate random UUID v4 identifiers in bulk.',
		kind: 'generator',
		config: { generator: 'uuid', defCount: 5, maxCount: 100 },
	},
	{
		slug: 'random-number',
		category: 'tools',
		name: 'Random Number Generator',
		description: 'Draw random integers in any range, with or without duplicates.',
		kind: 'generator',
		config: { generator: 'random', defMin: 1, defMax: 100, defCount: 6 },
	},
];
