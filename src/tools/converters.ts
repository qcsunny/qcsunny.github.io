// Registry entries for /converters/* — one page per unit category in ./units.

import type { ToolContent, ToolEntry } from './registry';

const converter = (
	slug: string,
	categoryId: string,
	name: string,
	description: string,
	content: ToolContent,
): ToolEntry => ({
	slug,
	category: 'converters',
	name,
	description,
	kind: 'converter',
	config: { categoryId },
	content,
});

export const CONVERTER_TOOLS: ToolEntry[] = [
	converter(
		'length',
		'length',
		'Length Converter',
		'Convert between millimeters, centimeters, meters, kilometers, inches, feet, yards and miles.',
		{
			about: [
				'Convert between the metric units everyone uses — millimeters, centimeters, meters and kilometers — and the imperial units still common in the United States: inches, feet, yards and miles. Type a value, pick the two units, and every other unit in the list updates instantly.',
				'The conversion is exact and happens entirely in your browser: one inch is exactly 25.4 mm by international agreement, and every other factor on this page is derived from the definitions below. Nothing you type is sent anywhere.',
			],
			aboutZh: [
				'在毫米、厘米、米、千米等公制单位与英寸、英尺、码、英里等英制单位之间自由换算。输入数值后所有单位实时同步更新，无需点击任何按钮。',
				'换算完全在浏览器本地完成，精确无误差：1 英寸按国际标准精确等于 25.4 毫米，其余系数均由此推导。你输入的内容不会被上传到任何服务器。',
			],
			faq: [
				{ q: 'How many feet are in a mile?', a: 'Exactly 5,280 feet — or 1,609.344 meters, since the international mile is defined as 1,609.344 mm × 1000.' },
				{ q: 'Is 1 inch exactly 2.54 cm?', a: 'Yes. Since 1959 the inch has been defined as exactly 25.4 mm, so 1 inch = 2.54 cm with no rounding.' },
				{ q: 'Do my inputs leave my computer?', a: 'No. The converter is plain JavaScript running in your browser — it works offline once the page has loaded.' },
			],
			faqZh: [
				{ q: '一英里等于多少英尺？', a: '精确值是 5280 英尺，即 1609.344 米——国际英里的定义就是 1609.344 毫米 × 1000。' },
				{ q: '1 英寸正好是 2.54 厘米吗？', a: '是的。自 1959 年起英寸被定义为精确的 25.4 毫米，因此 1 英寸 = 2.54 厘米没有任何舍入误差。' },
				{ q: '我输入的数据会被上传吗？', a: '不会。换算由浏览器中的 JavaScript 本地完成，页面加载后即使断网也能继续使用。' },
			],
		},
	),
	converter(
		'weight',
		'weight',
		'Weight Converter',
		'Convert between milligrams, grams, kilograms, tonnes, ounces, pounds and stone.',
		{
			about: [
				'Convert mass and weight between metric units (milligrams, grams, kilograms, tonnes) and imperial units (ounces, pounds, stone). All fields update live as you type, so you can read off several conversions at once.',
				'Conversions use the exact international definitions: 1 pound = 453.59237 grams and 1 ounce = 1/16 of a pound. The stone, still used for body weight in the UK, is 14 pounds.',
			],
			aboutZh: [
				'在公制（毫克、克、千克、吨）与英制（盎司、磅、英石）质量单位之间换算。输入时所有单位实时联动，一次输入即可读出多种换算结果。',
				'换算采用国际标准精确定义：1 磅 = 453.59237 克，1 盎司 = 1/16 磅；英国仍用于体重表示的"英石"为 14 磅。',
			],
			faq: [
				{ q: 'How many grams are in a pound?', a: 'Exactly 453.59237 grams, per the international agreement that defines the pound.' },
				{ q: 'What is a stone?', a: 'A British unit equal to 14 pounds (about 6.35 kg), still commonly used in the UK for body weight.' },
				{ q: 'Does this work for cooking recipes?', a: 'Yes — grams to ounces is a quick way to translate US recipes into metric measurements.' },
			],
			faqZh: [
				{ q: '一磅等于多少克？', a: '精确值是 453.59237 克，这是国际协议对磅的官方定义。' },
				{ q: '"英石"是什么单位？', a: '英制质量单位，等于 14 磅（约 6.35 千克），英国至今常用它表示体重。' },
				{ q: '能用于食谱换算吗？', a: '可以，克与盎司的互转正好用于把美式食谱换算成公制用量。' },
			],
		},
	),
	converter('temperature', 'temperature', 'Temperature Converter', 'Convert between Celsius, Fahrenheit and Kelvin.', {
		about: [
			'Convert between Celsius, Fahrenheit and Kelvin — the three temperature scales you meet in weather reports, recipes, and science. Enter a value in any field and the other two update instantly.',
			'Kelvin is the SI base unit of temperature and uses the same degree size as Celsius, just offset by 273.15. Fahrenheit conversions use the exact formulas: °F = °C × 9/5 + 32 and K = °C + 273.15.',
		],
		aboutZh: [
			'在摄氏度、华氏度、开尔文这三个温度标度之间换算——分别对应天气预报、美式食谱和科学研究中的常见场景。在任意一栏输入，其余两栏即时更新。',
			'开尔文是国际单位制的基本温度单位，刻度间隔与摄氏度相同，仅偏移 273.15。华氏度换算采用精确公式：°F = °C × 9/5 + 32。',
		],
		faq: [
			{ q: 'What is 37 °C in Fahrenheit?', a: '98.6 °F — normal human body temperature.' },
			{ q: 'At what temperature do Celsius and Fahrenheit agree?', a: 'At −40 degrees: −40 °C and −40 °F are the same temperature.' },
			{ q: 'Can temperatures go below 0 Kelvin?', a: 'No. Absolute zero (0 K) is the theoretical lower limit of temperature.' },
		],
		faqZh: [
			{ q: '37 摄氏度是华氏多少度？', a: '98.6 °F，即正常人体体温。' },
			{ q: '摄氏和华氏在什么温度数值相等？', a: '在 −40 度：−40 °C 与 −40 °F 是同一个温度。' },
			{ q: '温度可以低于 0 开尔文吗？', a: '不可以，绝对零度（0 K）是温度的理论下限。' },
		],
	}),
	converter(
		'area',
		'area',
		'Area Converter',
		'Convert between square millimeters, square centimeters, square meters, hectares, square kilometers and imperial area units.',
		{
			about: [
				'Convert area between square meters, square kilometers, hectares, and the imperial family of square feet, square yards, acres and square miles. Useful for real estate, land surveys and gardening.',
				'A hectare is exactly 10,000 m² and an acre is exactly 4,046.8564224 m². Because area units are squares of length units, the factors grow quickly — one square mile is 2.59 million square meters.',
			],
			aboutZh: [
				'在平方米、平方千米、公顷与平方英尺、平方码、英亩、平方英里等面积单位之间换算，适用于房产、土地测量与园艺场景。',
				'1 公顷精确等于 10000 平方米，1 英亩精确等于 4046.8564224 平方米。面积单位是长度单位的平方，因此系数增长很快——1 平方英里约为 259 万平方米。',
			],
			faq: [
				{ q: 'How big is a hectare?', a: 'Exactly 10,000 square meters (0.01 km²), or about 2.47 acres.' },
				{ q: 'How many square feet in an acre?', a: '43,560 square feet — an acre is defined as one furlong by one chain.' },
				{ q: 'How do I convert m² to ft²?', a: 'Multiply by 10.7639104. This converter applies the factor automatically as you type.' },
			],
			faqZh: [
				{ q: '一公顷有多大？', a: '精确等于 10000 平方米（0.01 平方千米），约合 2.47 英亩。' },
				{ q: '一英亩是多少平方英尺？', a: '43560 平方英尺——英亩的定义为一弗隆乘一链。' },
				{ q: '平方米怎么换算成平方英尺？', a: '乘以 10.7639104 即可，本页在输入时会自动完成这一换算。' },
			],
		},
	),
	converter(
		'volume',
		'volume',
		'Volume Converter',
		'Convert between milliliters, liters, cubic meters and US gallons, quarts, pints, cups and fluid ounces.',
		{
			about: [
				'Convert volume between liters, milliliters, cubic meters, and US customary units: gallons, quarts, pints, cups and fluid ounces. Hand for cooking, fuel economy and aquarium math alike.',
				'The page uses US customary definitions: 1 US gallon = 3.785411784 liters exactly, 1 cup = 236.5882365 ml, and 8 fluid ounces per cup. Note that imperial (UK) gallons are about 20% larger.',
			],
			aboutZh: [
				'在升、毫升、立方米与美制加仑、夸脱、品脱、杯、液量盎司之间换算，可用于烹饪、油耗与水族箱容量计算。',
				'本页采用美制度量定义：1 美制加仑精确等于 3.785411784 升，1 杯 = 236.5882365 毫升，1 杯 = 8 液量盎司。注意英制（英联邦）加仑约大 20%。',
			],
			faq: [
				{ q: 'How many ml is one US cup?', a: '236.5882365 ml by US legal definition — commonly rounded to 240 ml in recipes.' },
				{ q: 'Is a UK gallon the same as a US gallon?', a: 'No. An imperial gallon is about 4.546 liters; a US gallon is 3.785 liters.' },
				{ q: 'How many cups are in a quart?', a: '4 cups — the US customary ladder is 1 gallon = 4 quarts = 8 pints = 16 cups.' },
			],
			faqZh: [
				{ q: '一美制杯等于多少毫升？', a: '按美国法定定义为 236.5882365 毫升，食谱中常取整为 240 毫升。' },
				{ q: '英制加仑和美制加仑一样吗？', a: '不一样。英制加仑约 4.546 升，美制加仑为 3.785 升。' },
				{ q: '一夸脱等于几杯？', a: '4 杯——美制进率为 1 加仑 = 4 夸脱 = 8 品脱 = 16 杯。' },
			],
		},
	),
	converter(
		'speed',
		'speed',
		'Speed Converter',
		'Convert between m/s, km/h, mph, knots and ft/s.',
		{
			about: [
				'Convert speed between meters per second, kilometers per hour, miles per hour, knots and feet per second — the units used in physics, road signs, aviation and weather reports.',
				'All conversions are exact: 1 m/s = 3.6 km/h, 1 mph = 1.609344 km/h, and 1 knot (nautical mile per hour) = 1.852 km/h exactly.',
			],
			aboutZh: [
				'在米/秒、千米/小时、英里/小时、节（海里/小时）与英尺/秒之间换算——分别覆盖物理、道路交通、航空与气象领域的常用单位。',
				'所有换算均为精确值：1 米/秒 = 3.6 千米/小时，1 英里/小时 = 1.609344 千米/小时，1 节 = 1.852 千米/小时（精确）。',
			],
			faq: [
				{ q: 'How fast is 100 km/h in mph?', a: 'About 62.14 mph, since 1 mph = 1.609344 km/h.' },
				{ q: 'Why do ships and planes use knots?', a: 'A knot is one nautical mile per hour, which ties speed directly to latitude-based distance on charts.' },
				{ q: 'What is 1 m/s in km/h?', a: 'Exactly 3.6 km/h — a useful mental shortcut for physics problems.' },
			],
			faqZh: [
				{ q: '100 千米/小时是多少英里/小时？', a: '约 62.14 mph，因为 1 英里/小时 = 1.609344 千米/小时。' },
				{ q: '为什么船只和飞机用"节"？', a: '1 节 = 1 海里/小时，把速度与航海图上基于纬度的距离直接对应起来。' },
				{ q: '1 米/秒等于多少千米/小时？', a: '精确等于 3.6 千米/小时，这是物理题中常用的心算捷径。' },
			],
		},
	),
	converter(
		'time',
		'time',
		'Time Converter',
		'Convert between nanoseconds, microseconds, milliseconds, seconds, minutes, hours, days and weeks.',
		{
			about: [
				'Convert durations from nanoseconds up to weeks. Typical uses: benchmark results in milliseconds, video timestamps in minutes and seconds, and work-hour accounting in hours and weeks.',
				'All factors are exact decimal powers of 60, 7 and 1000, so every conversion on this page is exact — no floating-point rounding you would ever notice.',
			],
			aboutZh: [
				'从纳秒到星期的时间单位换算。典型场景：性能测试中的毫秒、视频时间戳的分钟数，以及工时统计中的小时与周。',
				'所有系数都是 60、7、1000 的精确十进制幂，因此本页换算完全精确，不会出现可感知的浮点误差。',
			],
			faq: [
				{ q: 'How many milliseconds are in one day?', a: '86,400,000 ms (24 × 60 × 60 × 1000).' },
				{ q: 'How many hours are in a week?', a: '168 hours — 7 days × 24 hours.' },
				{ q: 'Is a "week" here always 7 days?', a: 'Yes. Calendar months vary, but weeks are always exactly 7 days of 24 hours.' },
			],
			faqZh: [
				{ q: '一天有多少毫秒？', a: '86400000 毫秒（24 × 60 × 60 × 1000）。' },
				{ q: '一周有多少小时？', a: '168 小时，即 7 天 × 24 小时。' },
				{ q: '这里的"周"一定是 7 天吗？', a: '是的。月份天数有变化，但一周恒定为 7 天 × 24 小时。' },
			],
		},
	),
	converter(
		'data',
		'data',
		'Data Size Converter',
		'Convert between bytes, KB/MB/GB/TB (1000-based) and KiB/MiB/GiB/TiB (1024-based).',
		{
			about: [
				'Convert digital storage between the decimal units (KB, MB, GB, TB — powers of 1000) and the binary units (KiB, MiB, GiB, TiB — powers of 1024). This distinction explains why a "1 TB" drive shows up as about 931 GiB in your operating system.',
				'By international standard, KB/MB/GB are powers of 1000 while KiB/MiB/GiB are powers of 1024. This converter keeps them strictly apart instead of blurring them together.',
			],
			aboutZh: [
				'在十进制单位（KB、MB、GB、TB——1000 的幂）与二进制单位（KiB、MiB、GiB、TiB——1024 的幂）之间换算。这正解释了为什么"1 TB"硬盘在操作系统里只显示约 931 GiB。',
				'按国际标准，KB/MB/GB 是 1000 的幂，KiB/MiB/GiB 是 1024 的幂。本页严格区分两者，不做含糊的混算。',
			],
			faq: [
				{ q: 'Why does my 1 TB drive show 931 GB?', a: 'The drive is 1 TB (10¹² bytes); the OS reports binary GiB (2³⁰ bytes). 10¹² ÷ 2³⁰ ≈ 931.' },
				{ q: 'How many MB in a GB?', a: 'Exactly 1000 MB by the SI-based definition. If you mean binary units, 1 GiB = 1024 MiB.' },
				{ q: 'What does KiB mean?', a: '"Kibibyte" — 1024 bytes. The "bi" marks it as binary, avoiding the old KB = 1024 ambiguity.' },
			],
			faqZh: [
				{ q: '为什么 1 TB 硬盘只显示 931 GB？', a: '硬盘容量是 1 TB（10¹² 字节），操作系统按二进制 GiB（2³⁰ 字节）显示，10¹² ÷ 2³⁰ ≈ 931。' },
				{ q: '1 GB 等于多少 MB？', a: '按国际单位制约精确为 1000 MB；若指二进制单位，则 1 GiB = 1024 MiB。' },
				{ q: 'KiB 是什么意思？', a: '"千字节"（Kibibyte），即 1024 字节。名称中的 "bi" 标明二进制，避免过去 KB = 1024 的歧义。' },
			],
		},
	),
];
