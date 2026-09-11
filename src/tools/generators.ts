// Registry entries for the three generators (/security/password-generator,
// /devtools/uuid-generator, /devtools/random-number). Rendered by
// src/scripts/tools/generators.ts — these need crypto APIs and copy buttons,
// which the plain form renderer doesn't cover.

import type { ToolEntry } from './registry';


export const DEVTOOLS_GENERATOR_TOOLS: ToolEntry[] = [
	{
		slug: 'uuid-generator',
		category: 'devtools',
		name: 'UUID / ULID / NanoID Generator',
		nameZh: 'UUID / ULID / NanoID 生成器',
		description: 'Generate UUID v4, time-ordered UUID v7, sortable ULIDs and short NanoIDs in bulk.',
		descriptionZh: '批量生成 UUID v4、时间有序的 UUID v7、可排序 ULID 与短 NanoID 标识符。',
		kind: 'generator',
		config: { generator: 'uuid', defCount: 5, maxCount: 100 },
	},
	{
		slug: 'random-number',
		category: 'devtools',
		name: 'Random Number Generator',
		nameZh: '随机数生成器',
		description: 'Draw random integers in any range, with or without duplicates.',
		descriptionZh: '在指定范围内生成随机整数，支持是否允许重复与排序输出。',
		kind: 'generator',
		config: { generator: 'random', defMin: 1, defMax: 100, defCount: 6 },
	},
];

export const SECURITY_GENERATOR_TOOLS: ToolEntry[] = [
	{
		slug: 'password-generator',
		category: 'security',
		name: 'Password Generator',
		nameZh: '强密码生成器',
		description: 'Generate strong random passwords with crypto randomness and ambiguous character filtering.',
		descriptionZh: '高强度随机密码生成器，采用密码学随机数，支持字符集筛选与易混淆字符排除。',
		kind: 'generator',
		config: { generator: 'password', minLen: 8, maxLen: 64, defLen: 16 },
	},
];

