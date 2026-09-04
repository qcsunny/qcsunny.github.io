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

		content: {
			about: [
				'Generate strong passwords with true cryptographic randomness — every character comes from the browser\'s crypto.getRandomValues, not Math.random. Choose the length (8–64), toggle lowercase, uppercase, digits and symbols, and optionally exclude easily confused ambiguous characters (0, O, o, 1, l, I).',
				'The strength label estimates entropy from the character pool and length: for example, 16 characters from a 62-symbol alphabet is about 95 bits, far beyond what brute-force attacks can reach.',
			],
			aboutZh: [
				'用真正的密码学随机源生成高强度密码——每个字符都来自浏览器的 crypto.getRandomValues，而非 Math.random。长度可在 8–64 之间调整，可勾选小写、大写、数字与符号，并支持一键排除易混淆歧义字符（0、O、o、1、l、I）。',
				'强度标签根据字符池大小和长度估算熵值：例如 62 个字符集取 16 位约 95 比特熵，远超暴力破解的可达范围。',
			],
			faq: [
				{ q: 'Are the passwords sent anywhere?', a: 'No. They are generated locally and never leave your device; the copy button only touches your clipboard.' },
				{ q: 'Why exclude ambiguous characters?', a: 'Characters like 0 (zero) vs O (capital o) or 1 (one) vs l (lowercase L) are easily mistyped when reading passwords on paper or mobile screens.' },
				{ q: 'How long should a password be?', a: 'At least 12 characters with symbols, or 16+ alphanumeric-only, to stay well beyond current cracking speeds.' },
				{ q: 'Why crypto and not Math.random?', a: 'Math.random is predictable and not designed for security; getRandomValues is a cryptographic source with uniform sampling.' },
			],
			faqZh: [
				{ q: '生成的密码会被上传吗？', a: '不会。密码在本地生成，绝不离开你的设备；复制按钮也只操作本机剪贴板。' },
				{ q: '为什么要排除易混淆字符？', a: '如数字 0 与大写字母 O、数字 1 与小写字母 l 在屏幕或纸质抄录时极易看错输入，过滤后更清晰。' },
				{ q: '密码应该设多长？', a: '含符号时至少 12 位；纯字母数字建议 16 位以上，才能远超当前破解速度。' },
				{ q: '为什么用 crypto 而不是 Math.random？', a: 'Math.random 是可预测的，并非为安全设计；getRandomValues 是均匀采样的密码学随机源。' },
			],
		},
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

		content: {
			about: [
				'Generate UUID v4 (cryptographically random) and modern UUID v7 (timestamp-ordered, RFC 9562) identifiers in bulk — up to 100 at a time — with custom uppercase and hyphen formatting.',
				'UUID v4 provides 122 bits of pure randomness, ideal for secure stateless tokens. UUID v7 combines a 48-bit millisecond Unix timestamp with 74 random bits, giving monotonic time ordering that drastically improves database B-tree index performance and cache locality.',
			],
			aboutZh: [
				'批量生成随机 UUID v4 以及现代时间有序的 UUID v7（RFC 9562 标准），支持自定义大小写与连字符格式，单次最高可生成 100 个。',
				'UUID v4 提供 122 位纯密码学随机性，适合无状态安全令牌；UUID v7 将 48 位 Unix 毫秒时间戳与 74 位随机数结合，具有天然的时间单调递增性，可大幅提升 PostgreSQL、MySQL 等数据库的 B 树索引性能与写入局部性。',
			],
			faq: [
				{ q: 'What is the difference between UUID v4 and UUID v7?', a: 'UUID v4 is completely random. UUID v7 encodes a 48-bit millisecond timestamp in the prefix, so UUIDs sort chronologically by creation time.' },
				{ q: 'Why use UUID v7 for database primary keys?', a: 'Pure random UUIDs cause page fragmentation in B-trees (random disk writes). UUID v7 is sequential, meaning new inserts append near the end of index leaves, boosting throughput.' },
				{ q: 'Can two generated UUIDs collide?', a: 'The chance is astronomically small — you would need billions generated per millisecond to observe collisions.' },
			],
			faqZh: [
				{ q: 'UUID v4 和 UUID v7 有什么区别？', a: 'UUID v4 完全随机；UUID v7 前缀包含 48 位毫秒时间戳，生成的 ID 天然按创建时间排序。' },
				{ q: '为什么数据库主键推荐 UUID v7？', a: '纯随机的 UUID v4 会导致 B+ 树索引严重碎片化；UUID v7 具有时间局部性，新记录追加在索引末尾，显著降低 I/O 压力。' },
				{ q: '两个 UUID 可能发生碰撞重复吗？', a: '概率微乎其微——即使在同一毫秒内也拥有 74 位的随机熵，需要每毫秒生成数十亿个才可能碰撞。' },
			],
		},
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

		content: {
			about: [
				'Draw random integers in any range — for giveaways, sampling, games or picking who goes first. Choose the count, the minimum and maximum, and whether repeats are allowed.',
				'Numbers come from the browser\'s cryptographic random source with rejection sampling, so every value in the range is exactly equally likely. With "no duplicates" the page uses a Fisher–Yates shuffle, like drawing cards from a deck.',
			],
			aboutZh: [
				'在任意范围内抽取随机整数——可用于抽奖、抽样、游戏或决定顺序。可设置数量、最小值、最大值以及是否允许重复。',
				'数字来自浏览器密码学随机源并采用拒绝采样，范围内每个值的概率严格相等。勾选"不允许重复"时采用 Fisher–Yates 洗牌算法，如同从牌堆里抽牌。',
			],
			faq: [
				{ q: 'Is the draw fair?', a: 'Yes — rejection sampling avoids the modulo bias that makes naive random numbers slightly unfair.' },
				{ q: 'How do I pick a giveaway winner?', a: 'Number the entrants 1–N, set min 1 and max N, count 1, no duplicates — done.' },
				{ q: 'Why does the count cap depend on the range?', a: 'With no duplicates allowed, you cannot draw more unique numbers than the range contains.' },
			],
			faqZh: [
				{ q: '抽取结果公平吗？', a: '公平——拒绝采样避免了朴素取模算法导致的微小概率偏差。' },
				{ q: '怎么抽抽奖中奖者？', a: '把参与者编号 1–N，最小值填 1、最大值填 N、数量 1、不允许重复即可。' },
				{ q: '为什么数量上限和范围有关？', a: '在不允许重复的模式下，去重抽取的数量不可能超过范围内的数字个数。' },
			],
		},
	},
];
