// Registry entries for /converters/* — one page per unit category in ./units.

import type { ToolContent, ToolEntry } from './registry';

const converter = (
	slug: string,
	categoryId: string,
	name: string,
	nameZh: string,
	description: string,
	content: ToolContent,
): ToolEntry => ({
	slug,
	category: 'converters',
	name,
	nameZh,
	description,
	kind: 'converter',
	config: { categoryId },
	content,
});

export const CONVERTER_TOOLS: ToolEntry[] = [
	converter(
		'weight',
		'weight',
		'Weight & Mass Converter',
		'重量与质量单位换算器',
		'Convert between kg, g, mg, tonnes, jin (市斤), liang (两), troy oz (金衡盎司), carats (克拉), pounds, ounces and stone.',
		{
			about: [
				'Comprehensive mass and weight converter covering metric (kg, g, mg, tonne), traditional Chinese (市斤, 两, 钱, 担, 港斤, 台斤), precious gems & metals (carat, troy ounce, grain), and imperial / US units (pound, ounce, stone, short/long ton).',
				'All conversion factors are defined to exact international and legal standards with zero telemetry. Ideal for gold & jewelry trading, international commerce, fitness & diet tracking, and everyday life.',
			],
			aboutZh: [
				'全功能多维度重量与质量换算器：涵盖国际公制（千克、克、毫克、微克、公吨）、中国市制与港台衡量（市斤、两、钱、担、港斤/司马斤、台斤）、珠宝贵金属（金衡盎司 oz t、克拉 ct、格令 gr）以及英美常衡（磅、盎司、英石、美吨、英吨）。',
				'严格遵照国际法定标准与传统常衡定义换算，100% 浏览器本地高精度秒级计算。适合黄金珠宝估值、跨境海淘外贸、健身饮食热量称重及日常生活。',
			],
			faq: [
				{ q: 'How many grams are in 1 troy ounce (oz t)?', a: 'Exactly 31.1034768 grams, which is the global pricing standard for spot gold, silver and platinum (unlike the everyday 28.35 g avoirdupois ounce).' },
				{ q: 'How many grams is 1 Chinese jin (市斤)?', a: '1 Chinese market jin (市斤) is exactly 500 grams (0.5 kg), consisting of 10 liang (两) of 50 grams each.' },
				{ q: 'What is 1 carat (ct) in grams?', a: '1 metric carat equals exactly 0.2 grams (200 milligrams), the universal unit for diamonds and gemstones.' },
				{ q: 'How many pounds are in 1 kilogram?', a: '1 kilogram equals approximately 2.20462 pounds (strictly defined as 1 lb = 0.45359237 kg).' },
			],
			faqZh: [
				{ q: '1 金衡盎司（oz t）等于多少克？', a: '精确等于 31.1034768 克。国际现货黄金、白银报价均以金衡盎司为基准，不同于日常食物所用的常衡盎司（约 28.35 克）。' },
				{ q: '1 市斤和 1 公斤有什么关系？', a: '中国现代市制中，1 市斤 = 500 克 = 0.5 公斤（千克）；1 市斤包含 10 市两（每两 50 克）。而港澳司马斤约为 604.79 克，台斤为 600 克。' },
				{ q: '1 克拉（ct）等于多少克？', a: '1 克拉精确等于 0.2 克（200 毫克），是全球钻石与天然贵重宝石的通用度量单位。' },
				{ q: '1 公斤等于多少磅？', a: '约合 2.20462 磅。国际常衡磅严格定义为 0.45359237 千克。' },
			],
		},
	),
	converter(
		'length',
		'length',
		'Length & Distance Converter',
		'长度与距离单位换算器',
		'Convert between millimeters, centimeters, meters, kilometers, Chinese chi/cun/li, nautical miles, inches, feet, yards and miles.',
		{
			about: [
				'Convert across metric units (nm, µm, mm, cm, m, km), traditional Chinese measures (市里, 丈, 尺, 寸, 分), nautical standards (nautical mile, fathom, cable), and imperial units (inch, foot, yard, mile).',
				'From semiconductor wafer nanometers to transoceanic nautical miles and astronomical light-years, calculations run with full floating-point accuracy.',
			],
			aboutZh: [
				'全能长度与空间跨度换算器：涵盖公制（纳米、微米、毫米、厘米、分米、米、千米/公里）、中国市制（华里、丈、尺、寸、分）、航海水深（海里、英寻、链）以及英美制（英寸、英尺、码、英里、密耳）。',
				'无论是芯片制程纳米、服装腰围尺寸市尺、海运航空海里还是星际天文光年，皆可实时无缝转换。',
			],
			faq: [
				{ q: 'How many meters are in 1 nautical mile (nmi)?', a: 'Exactly 1,852 meters by international agreement, used globally in marine navigation and aviation.' },
				{ q: 'How many feet are in 1 mile?', a: 'Exactly 5,280 feet — or 1,609.344 meters.' },
				{ q: 'How many centimeters is 1 Chinese chi (市尺)?', a: '1 Chinese chi equals 1/3 of a meter, or approximately 33.333 centimeters (10 cun).' },
			],
			faqZh: [
				{ q: '1 海里（nmi）等于多少米？', a: '国际标准精确等于 1,852 米，广泛应用于全球海运船舶航行与民航客机飞行。' },
				{ q: '1 英里等于多少公里？', a: '1 国际英里严格等于 1.609344 公里（5,280 英尺）。' },
				{ q: '1 市尺等于多少厘米？', a: '1 市尺等于 1/3 米，约合 33.333 厘米。1 市尺包含 10 市寸（1 寸 ≈ 3.33 厘米），常用于服装裁剪与腰围计量。' },
			],
		},
	),
	converter(
		'area',
		'area',
		'Area & Land Measure Converter',
		'面积与土地单位换算器',
		'Convert between square meters, hectares, Chinese mu (亩), qing (顷), acres, square feet, yards and square miles.',
		{
			about: [
				'Convert surface and real estate land areas across international metric units (m², km², hectare, are), traditional Chinese land measures (亩, 顷, 分地, 平方尺), and imperial units (acre, square foot, square yard, square mile).',
			],
			aboutZh: [
				'土地与房屋面积专业换算工具：支持平方米、平方千米、公顷、公亩，中国市制土地面积（市亩、顷、分地、平方尺），以及英美常用面积（英亩、平方英尺、平方码、平方英里）。',
			],
			faq: [
				{ q: 'How many square meters are in 1 Chinese mu (亩)?', a: '1 Chinese mu equals 2000/3 square meters, or approximately 666.67 m². 1 hectare equals exactly 15 mu.' },
				{ q: 'How many square feet are in 1 acre?', a: 'Exactly 43,560 square feet (approx. 4,046.86 m² or ~6.07 Chinese mu).' },
			],
			faqZh: [
				{ q: '1 亩地等于多少平方米？', a: '1 市亩等于 2000/3 平方米，约合 666.67 平方米。1 公顷（10,000 m²）恰好等于 15 亩。' },
				{ q: '1 英亩等于多少亩和平方米？', a: '1 英亩（acre）等于 4046.856 平方米，折合中国市亩约 6.07 亩。' },
			],
		},
	),
	converter(
		'volume',
		'volume',
		'Volume & Capacity Converter',
		'体积与容量单位换算器',
		'Convert between liters, mL, cubic meters, US gallons, UK gallons, barrels (bbl), cups, tablespoons and cubic feet.',
		{
			about: [
				'Convert volume and liquid capacity across metric units (mL, L, m³), culinary kitchen spoons (tsp, tbsp, cup), US & UK liquid standards (fl oz, pint, quart, gallon), oil barrels (bbl), and cubic feet/inches.',
			],
			aboutZh: [
				'体积与液体容量全量换算器：涵盖国际公制（毫升、升、立方米）、厨房烘焙量勺（茶匙、汤匙、美制量杯）、美制与英制液体（液盎司、品脱、夸脱、加仑）、国际原油标准桶（bbl）以及立方英尺/立方英寸。',
			],
			faq: [
				{ q: 'What is the difference between a US gallon and a UK imperial gallon?', a: 'A US gallon is about 3.785 liters (231 cu in), while a UK imperial gallon is larger at 4.54609 liters (approx. 20% more).' },
				{ q: 'How many liters is 1 oil barrel (bbl)?', a: '1 standard petroleum barrel equals exactly 42 US gallons, or approximately 158.987 liters.' },
			],
			faqZh: [
				{ q: '美制加仑和英制加仑有什么区别？', a: '美制加仑约 3.785 升，而英制加仑为 4.54609 升，英制加仑比美制大约多出 20% 容量。' },
				{ q: '1 桶原油（bbl）是多少升？', a: '国际大宗石油交易的 1 标准桶等于 42 美制加仑，约合 158.987 升。' },
			],
		},
	),
	converter(
		'pressure',
		'pressure',
		'Pressure Converter',
		'压力与压强单位换算器',
		'Convert between pascals (Pa), kPa, MPa, bar, psi, standard atmospheres (atm), mmHg/Torr, and kgf/cm².',
		{
			about: [
				'High-precision pressure and stress conversion for engineering, automotive tire pressures, diving, medical blood pressure, and atmospheric meteorology. Seamlessly convert between Pa, kPa, MPa, bar, psi, atm, mmHg/Torr, and kgf/cm².',
			],
			aboutZh: [
				'专业工程与日常生活压力/压强换算器：轻松互换帕斯卡（Pa）、千帕（kPa）、兆帕（MPa）、巴（bar）、磅力/平方英寸（psi）、标准大气压（atm）、毫米汞柱（mmHg / 托 Torr）以及公斤力/平方厘米（kgf/cm²）。',
				'常用于汽车冷态胎压校准（如 2.5 bar = 250 kPa = 36.3 psi）、血压计读数、水暖管道打压与气象气压监测。',
			],
			faq: [
				{ q: 'How many psi is 2.5 bar tire pressure?', a: '2.5 bar equals approximately 36.26 psi (and 250 kPa).' },
				{ q: 'What is 1 standard atmosphere (atm) in pascals?', a: '1 atm is defined as exactly 101,325 Pa (101.325 kPa or 760 mmHg).' },
				{ q: 'What is "kgf/cm²"?', a: '1 kgf/cm² is 1 kilogram-force per square centimeter (approx. 98.07 kPa or 0.98 bar), colloquially referred to in China as "1 公斤气压".' },
			],
			faqZh: [
				{ q: '汽车胎压 2.5 bar 等于多少 psi 和千帕？', a: '2.5 bar 约等于 36.26 psi，严格等于 250 kPa（千帕）。' },
				{ q: '1 个标准大气压（atm）是多少？', a: '精确等于 101,325 帕斯卡（101.325 kPa），相当于 760 毫米汞柱（mmHg）。' },
				{ q: '修车师傅常说的"打 2.5 公斤气"是什么意思？', a: '指的是 2.5 kgf/cm²（公斤力/平方厘米），约等于 2.45 bar 或 245 kPa，与标准的 2.5 bar 极为接近。' },
			],
		},
	),
	converter(
		'power',
		'power',
		'Power & Horsepower Converter',
		'功率与马力单位换算器',
		'Convert between watts (W), kilowatts (kW), megawatts (MW), metric horsepower (ps/匹), mechanical horsepower (hp) and BTU/h.',
		{
			about: [
				'Convert power across international SI units (W, kW, MW, GW), automotive horsepower (metric ps vs mechanical imperial hp), air conditioner capacity (BTU/h), and mechanical work rates (ft·lb/s).',
			],
			aboutZh: [
				'功率与马力多用途换算器：涵盖国际标准瓦特（W）、千瓦（kW）、兆瓦（MW）、吉瓦（GW），汽车发动机马力（米制公制马力 ps / 匹、英制马力 hp），空调制冷量匹数与冷量（BTU/h）以及英尺·磅/秒。',
			],
			faq: [
				{ q: 'What is the difference between metric horsepower (ps) and imperial horsepower (hp)?', a: '1 metric horsepower (ps / cv) is defined as 75 kgf·m/s = 735.49875 W. 1 mechanical imperial horsepower (hp) is 550 ft·lb/s = 745.69987 W (approx. 1.4% stronger).' },
				{ q: 'How many horsepower is a 150 kW electric vehicle motor?', a: '150 kW equals approximately 203.9 metric horsepower (ps) or 201.2 mechanical hp.' },
			],
			faqZh: [
				{ q: '米制公制马力（ps/匹）和英制马力（hp）有什么区别？', a: '1 米制马力（公制马力 ps）等于 735.49875 瓦；1 英制马力（hp）等于 745.69987 瓦，英制马力比公制马力大约强 1.4%。中国与欧洲车系常用 ps/kW，美系常用 hp。' },
				{ q: '新能源汽车电机 150 kW 相当于多少匹马力？', a: '150 kW 约合 203.9 匹公制马力（ps），动力相当于传统 2.0T 高功率燃油发动机。' },
			],
		},
	),
	converter(
		'energy',
		'energy',
		'Energy & Heat Converter',
		'能量热量与功换算器',
		'Convert between joules (J), kilojoules (kJ), calories, kilocalories (kcal/大卡), watt-hours (Wh), kilowatt-hours (kWh / 度电) and BTU.',
		{
			about: [
				'Convert physical work, thermal calories, electrical storage, and fuel heating values across joules (J, kJ, MJ), dietary calories (cal, kcal / 大卡), electrical energy (Wh, kWh), British thermal units (BTU), and electronvolts (eV).',
			],
			aboutZh: [
				'能量、功与热量全能转换器：涵盖物理功焦耳（J、kJ、MJ）、食品热量与减脂卡路里（卡 cal、千卡/大卡 kcal）、电力能源（瓦时 Wh、千瓦时 / 度电 kWh）、空调暖通英热单位（BTU）以及微观粒子物理电子伏特（eV）。',
			],
			faq: [
				{ q: 'How many kilojoules (kJ) are in 1 food Calorie (kcal / 大卡)?', a: '1 kcal (food Calorie / 大卡) equals 4.184 kJ. To convert food labels from kJ to kcal, divide by 4.184.' },
				{ q: 'How many joules are in 1 kilowatt-hour (1 kWh / 1 度电)?', a: 'Exactly 3,600,000 joules (3.6 MJ).' },
			],
			faqZh: [
				{ q: '食品标签上的千焦（kJ）怎么换算成大卡（kcal）？', a: '1 千卡（大卡 kcal）等于 4.184 千焦（kJ）。食品袋上的千焦数值除以 4.184，即可快速得到健身常说的大卡热量。' },
				{ q: '1 度电（kWh）等于多少焦耳？', a: '精确等于 3,600,000 焦耳（3.6 兆焦 MJ）。' },
			],
		},
	),
	converter(
		'temperature',
		'temperature',
		'Temperature Converter',
		'温度单位换算器',
		'Convert between Celsius (°C), Fahrenheit (°F), Kelvin (K), Rankine (°R) and Réaumur (°Re).',
		{
			about: [
				'Convert between Celsius, Fahrenheit, absolute Kelvin, Rankine, and Réaumur temperature scales with exact mathematical formulas.',
			],
			aboutZh: [
				'在摄氏度（°C）、华氏度（°F）、绝对温标开尔文（K）、兰氏度（°R）与列氏度（°Re）之间精确换算。',
			],
			faq: [
				{ q: 'At what temperature are Celsius and Fahrenheit equal?', a: '-40 degrees. -40 °C equals -40 °F.' },
				{ q: 'What is absolute zero?', a: '0 Kelvin (0 K), which is -273.15 °C or -459.67 °F.' },
			],
			faqZh: [
				{ q: '摄氏度与华氏度在哪一点数值相同？', a: '-40 度。即 -40 °C = -40 °F。' },
				{ q: '绝对零度是多少？', a: '0 开尔文（0 K），即 -273.15 °C 或 -459.67 °F。' },
			],
		},
	),
	converter(
		'speed',
		'speed',
		'Speed & Velocity Converter',
		'速度与航速单位换算器',
		'Convert between m/s, km/h, mph, knots, feet/second, Mach (Ma) and speed of light (c).',
		{
			about: [
				'Convert velocity across standard metric (m/s, km/h), road traffic (mph), marine/aviation (knot), supersonic speeds (Mach), and cosmic physics (speed of light).',
			],
			aboutZh: [
				'速度与航速全能转换器：支持米/秒（m/s）、千米/小时（公里/小时 km/h）、英里/小时（mph）、节（海里/小时 kn）、英尺/秒（ft/s）、超音速马赫（Ma）以及真空光速（c）。',
			],
			faq: [
				{ q: 'What is Mach 1 speed?', a: 'Mach 1 at standard sea level (15 °C) is approximately 340.29 m/s, or 1,225.04 km/h (761.2 mph).' },
				{ q: 'How many km/h is 1 knot (kn)?', a: '1 knot equals 1 nautical mile per hour, or exactly 1.852 km/h.' },
			],
			faqZh: [
				{ q: '1 马赫（Mach）速度是多少公里/小时？', a: '在 15 °C 标准海平面气温下，1 马赫约等于 340.29 米/秒，合 1,225.04 公里/小时。' },
				{ q: '1 节（航速 knot）等于多少公里/小时？', a: '1 节等于每小时 1 海里，精确合 1.852 公里/小时。' },
			],
		},
	),
	converter(
		'time',
		'time',
		'Time Duration Converter',
		'时间单位换算器',
		'Convert between picoseconds, nanoseconds, milliseconds, seconds, minutes, hours, days, weeks, months and years.',
		{
			about: [
				'Convert time spans from microchip clock cycles (picoseconds, nanoseconds) to human scales (seconds, minutes, hours, days, weeks, months, years, and centuries).',
			],
			aboutZh: [
				'从芯片纳秒时钟周期到人类宏观纪年（秒、分、时、日、周、旬、月、季度、年与世纪）的跨尺度时间换算。',
			],
			faq: [
				{ q: 'How many seconds are in one day?', a: '86,400 seconds (24 × 60 × 60).' },
				{ q: 'How many hours are in a non-leap year?', a: '8,760 hours (365 days × 24 hours).' },
			],
			faqZh: [
				{ q: '一天有多少秒？', a: '86,400 秒（24 小时 × 60 分钟 × 60 秒）。' },
				{ q: '平年一年有多少小时？', a: '8,760 小时（365 天 × 24 小时）。' },
			],
		},
	),
	converter(
		'data',
		'data',
		'Data Size & Bandwidth Converter',
		'数据存储与带宽换算器',
		'Convert between bits (b, Mb, Gb), bytes (B, KB, MB, GB, TB, PB) and binary kibibytes (KiB, MiB, GiB, TiB).',
		{
			about: [
				'Convert network bandwidth (bits: Mbps, Gbps), decimal manufacturer storage (KB, MB, GB, TB, PB — powers of 1000), and binary operating system memory/file sizes (KiB, MiB, GiB, TiB — powers of 1024).',
			],
			aboutZh: [
				'数据存储与网络速率全栈换算器：严格区分网络通信比特带宽（Mbps、Gbps）、存储硬件厂商十进制标称容量（KB、MB、GB、TB、PB，1000 进制）与操作系统二进制真实内存容量（KiB、MiB、GiB、TiB，1024 进制）。',
			],
			faq: [
				{ q: 'Why does 100 Mbps broadband only download at ~12.5 MB/s?', a: 'Internet bandwidth is measured in bits (b), while files are measured in bytes (B). Since 1 Byte = 8 bits, 100 Mbps ÷ 8 = 12.5 MB/s.' },
				{ q: 'Why does a 1 TB SSD only show ~931 GB in Windows?', a: 'SSD makers use decimal 10¹² bytes (1,000,000,000,000 bytes). Windows calculates in binary GiB (2³⁰ bytes = 1,073,741,824 bytes). 10¹² ÷ 2³⁰ ≈ 931.32 GiB.' },
			],
			faqZh: [
				{ q: '为什么 100M / 1000M 宽带的实际下载速度只有 12.5 MB/s 和 125 MB/s？', a: '因为网络运营商宣称的 100M 指的是比特每秒（100 Mbps），而下载文件显示的是字节每秒（MB/s）。1 字节（Byte）= 8 比特（bit），故 100 Mbps ÷ 8 = 12.5 MB/s，千兆宽带 1000 Mbps ÷ 8 = 125 MB/s。' },
				{ q: '为什么买的 1 TB 硬盘在电脑里只有 931 GB？', a: '硬盘制造商按十进制 1 TB = 10¹² 字节出厂标称；而 Windows 操作系统底层按二进制 GiB（1 GiB = 1024³ 字节）统计：10¹² ÷ 1024³ ≈ 931.32 GiB。' },
			],
		},
	),
];
