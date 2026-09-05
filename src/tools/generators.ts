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
		nameZh: '强密码生成器',
		description: 'Generate strong random passwords with crypto randomness and ambiguous character filtering.',
		descriptionZh: '高强度随机密码生成器，采用密码学随机数，支持字符集筛选与易混淆字符排除。',
		kind: 'generator',
		config: { generator: 'password', minLen: 8, maxLen: 64, defLen: 16 },
	},
	{
		slug: 'uuid-generator',
		category: 'tools',
		name: 'UUID Generator (v4 & v7)',
		nameZh: 'UUID 生成器 (v4 / v7)',
		description: 'Generate random UUID v4 and time-ordered UUID v7 identifiers in bulk.',
		descriptionZh: '批量生成随机 UUID v4 与时间有序的 UUID v7 唯一标识符。',
		kind: 'generator',
		config: { generator: 'uuid', defCount: 5, maxCount: 100 },
	},
	{
		slug: 'random-number',
		category: 'tools',
		name: 'Random Number Generator',
		nameZh: '随机数生成器',
		description: 'Draw random integers in any range, with or without duplicates.',
		descriptionZh: '在指定范围内生成随机整数，支持是否允许重复与排序输出。',
		kind: 'generator',
		config: { generator: 'random', defMin: 1, defMax: 100, defCount: 6 },
	},
];
