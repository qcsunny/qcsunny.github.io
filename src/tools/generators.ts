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
		description: 'Generate strong random passwords with crypto-grade randomness.',
		kind: 'generator',
		config: { generator: 'password', minLen: 8, maxLen: 64, defLen: 16 },

		content: {
			about: [
				'Generate strong passwords with true cryptographic randomness — every character comes from the browser\'s crypto.getRandomValues, not Math.random. Choose the length (8–64) and toggle lowercase, uppercase, digits and symbols.',
				'The strength label estimates entropy from the character pool and length: for example, 16 characters from a 62-symbol alphabet is about 95 bits, far beyond what brute-force attacks can reach.',
			],
			aboutZh: [
				'用真正的密码学随机源生成高强度密码——每个字符都来自浏览器的 crypto.getRandomValues，而非 Math.random。长度可在 8–64 之间调整，并可勾选小写、大写、数字与符号。',
				'强度标签根据字符池大小和长度估算熵值：例如 62 个字符集取 16 位约 95 比特熵，远超暴力破解的可达范围。',
			],
			faq: [
				{ q: 'Are the passwords sent anywhere?', a: 'No. They are generated locally and never leave your device; the copy button only touches your clipboard.' },
				{ q: 'How long should a password be?', a: 'At least 12 characters with symbols, or 16+ alphanumeric-only, to stay well beyond current cracking speeds.' },
				{ q: 'Why crypto and not Math.random?', a: 'Math.random is predictable and not designed for security; getRandomValues is a cryptographic source with uniform sampling.' },
			],
			faqZh: [
				{ q: '生成的密码会被上传吗？', a: '不会。密码在本地生成，绝不离开你的设备；复制按钮也只操作本机剪贴板。' },
				{ q: '密码应该设多长？', a: '含符号时至少 12 位；纯字母数字建议 16 位以上，才能远超当前破解速度。' },
				{ q: '为什么用 crypto 而不是 Math.random？', a: 'Math.random 是可预测的，并非为安全设计；getRandomValues 是均匀采样的密码学随机源。' },
			],
		},
	},
	{
		slug: 'uuid-generator',
		category: 'tools',
		name: 'UUID Generator',
		nameZh: 'UUID 生成器',
		description: 'Generate random UUID v4 identifiers in bulk.',
		kind: 'generator',
		config: { generator: 'uuid', defCount: 5, maxCount: 100 },

		content: {
			about: [
				'Generate random UUIDs (version 4) in bulk — up to 100 at a time — with one click to copy the whole list. UUID v4 takes 122 bits of randomness from the browser\'s cryptographic generator, making collisions practically impossible.',
				'UUIDs are the standard way to give records, files, and API objects an identifier that is unique without any central coordination.',
			],
			aboutZh: [
				'批量生成随机 UUID（版本 4），一次最多 100 个，一键复制整列。UUID v4 的 122 位随机性来自浏览器的密码学随机源，碰撞概率实际上为零。',
				'UUID 是给记录、文件和 API 对象赋予"无需中央协调即可保证唯一"的标识符的标准方案。',
			],
			faq: [
				{ q: 'What does v4 mean?', a: 'Version 4 UUIDs are fully random (122 random bits), as opposed to v1 which is based on time and MAC address.' },
				{ q: 'Can two generated UUIDs collide?', a: 'The chance is astronomically small — you would need to generate billions per year for eons to expect one.' },
				{ q: 'Are UUIDs uppercase or lowercase?', a: 'The standard writes them lowercase; the hex digits are case-insensitive in practice.' },
			],
			faqZh: [
				{ q: 'v4 是什么意思？', a: '版本 4 的 UUID 完全随机（122 个随机位），不同于基于时间和 MAC 地址的 v1。' },
				{ q: '两个 UUID 可能重复吗？', a: '概率小到可以忽略——需要以每年数十亿个的速度连续生成无数年才可能遇到一次。' },
				{ q: 'UUID 用大写还是小写？', a: '标准写法是小写；不过十六进制数字在实际中大小写不敏感。' },
			],
		},
	},
	{
		slug: 'random-number',
		category: 'tools',
		name: 'Random Number Generator',
		nameZh: '随机数生成器',
		description: 'Draw random integers in any range, with or without duplicates.',
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
