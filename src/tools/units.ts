// Unit conversion data shared by the /converters/* pages.
// High-precision factors for metric, imperial, US customary, and traditional Chinese units.

export interface UnitDef {
	label: string;
	labelZh?: string;
	/** compact symbol shown in the readout, e.g. "kg" */
	short?: string;
	/**
	 * Chinese symbol, for the traditional units that have no Latin one: the
	 * English view reads "1 kg = 2 jin", the Chinese view "1 千克 = 2 市斤".
	 * Left unset when the symbol reads the same in both (kg, psi, kWh).
	 */
	shortZh?: string;
	toBase: (v: number) => number;
	fromBase: (v: number) => number;
}

export interface UnitCategory {
	id: string;
	label: string;
	labelZh?: string;
	units: Record<string, UnitDef>;
}

/** Linear unit: value * factor converts to base unit. */
const lin = (
	label: string,
	factor: number,
	labelZh?: string,
	short?: string,
	shortZh?: string,
): UnitDef => ({
	label,
	labelZh,
	short: short ?? (label.match(/\(([^)]+)\)/)?.[1] ?? label),
	shortZh,
	toBase: (v) => v * factor,
	fromBase: (v) => v / factor,
});

export const UNIT_CATEGORIES: UnitCategory[] = [
	{
		id: 'weight',
		label: 'Weight & Mass',
		labelZh: '重量与质量',
		units: {
			// Metric
			ug: lin('microgram (µg)', 1e-9, '微克', 'µg'),
			mg: lin('milligram (mg)', 1e-6, '毫克', 'mg'),
			g: lin('gram (g)', 0.001, '克', 'g'),
			kg: lin('kilogram (kg)', 1, '千克 / 公斤', 'kg'),
			q: lin('quintal (q)', 100, '公担 (100 kg)', 'q'),
			t: lin('tonne (t)', 1000, '公吨 (1000 kg)', 't'),

			// Chinese Traditional / 市制
			jin: lin('jin / catty', 0.5, '市斤 (500 g / 10两)', 'jin', '市斤'),
			liang: lin('liang / tael', 0.05, '市两 (50 g / 10钱)', 'liang', '市两'),
			qian: lin('qian / mace', 0.005, '市钱 (5 g / 10分)', 'qian', '市钱'),
			fen_wt: lin('fen', 0.0005, '市分 (0.5 g)', 'fen', '市分'),
			dan_wt: lin('dan / picul', 50, '市担 (50 kg / 100市斤)', 'dan', '市担'),
			hk_jin: lin('Hong Kong catty', 0.60478982, '港斤 / 司马斤 (约604.79 g)', 'HK catty', '港斤'),
			hk_liang: lin('Hong Kong tael', 0.03779936375, '港两 / 司马两 (约37.80 g，珠宝黄金)', 'HK tael', '港两'),
			tw_jin: lin('Taiwan catty', 0.6, '台斤 (600 g / 16台两)', 'TW catty', '台斤'),
			tw_liang: lin('Taiwan tael', 0.0375, '台两 (37.5 g)', 'TW tael', '台两'),

			// Precious Metals & Gems
			ozt: lin('troy ounce (oz t)', 0.0311034768, '金衡盎司 (31.1035 g，国际贵金属标准)', 'oz t'),
			ct: lin('carat (ct)', 0.0002, '克拉 (0.2 g / 200 mg，钻石宝石标准)', 'ct'),
			gr: lin('grain (gr)', 0.00006479891, '格令 (约64.80 mg)', 'gr'),

			// Imperial & US Customary
			dr: lin('dram (dr)', 0.0017718451953125, '打兰 (约1.77 g)', 'dr'),
			oz: lin('ounce (oz)', 0.028349523125, '常衡盎司 (约28.35 g)', 'oz'),
			lb: lin('pound (lb)', 0.45359237, '磅 (约0.4536 kg)', 'lb'),
			st: lin('stone (st)', 6.35029318, '英石 (14 磅 / 约6.35 kg)', 'st'),
			us_cwt: lin('US hundredweight (cwt)', 45.359237, '美担 / 短担 (100 磅 / 约45.36 kg)', 'cwt (US)', '美担'),
			uk_cwt: lin('UK hundredweight (cwt)', 50.80234544, '英担 / 长担 (112 磅 / 约50.80 kg)', 'cwt (UK)', '英担'),
			us_ton: lin('US short ton', 907.18474, '美吨 / 短吨 (2000 磅 / 约907.18 kg)', 'short ton', '美吨'),
			uk_ton: lin('UK long ton', 1016.0469088, '英吨 / 长吨 (2240 磅 / 约1016.05 kg)', 'long ton', '英吨'),
		},
	},
	{
		id: 'length',
		label: 'Length',
		labelZh: '长度与距离',
		units: {
			// Metric
			pm: lin('picometer (pm)', 1e-12, '皮米', 'pm'),
			nm: lin('nanometer (nm)', 1e-9, '纳米 (半导体工艺制程)', 'nm'),
			um: lin('micrometer (µm)', 1e-6, '微米 (工业精密制造)', 'µm'),
			mm: lin('millimeter (mm)', 0.001, '毫米', 'mm'),
			cm: lin('centimeter (cm)', 0.01, '厘米 / 公分', 'cm'),
			dm: lin('decimeter (dm)', 0.1, '分米', 'dm'),
			m: lin('meter (m)', 1, '米 / 公尺', 'm'),
			km: lin('kilometer (km)', 1000, '千米 / 公里', 'km'),

			// Chinese Traditional / 市制
			li: lin('li', 500, '市里 / 华里 (500 米 / 0.5 公里)', 'li', '华里'),
			zhang: lin('zhang', 10 / 3, '市丈 (10/3 米 ≈ 3.333 米)', 'zhang', '市丈'),
			chi: lin('chi', 1 / 3, '市尺 (1/3 米 ≈ 0.3333 米)', 'chi', '市尺'),
			cun: lin('cun', 1 / 30, '市寸 (1/30 米 ≈ 3.333 厘米)', 'cun', '市寸'),
			fen_len: lin('fen', 1 / 300, '市分 (1/300 米 ≈ 3.333 毫米)', 'fen', '市分'),

			// Marine & Depth
			nmi: lin('nautical mile (nmi)', 1852, '海里 (1852 米，国际航海航空法定标准)', 'nmi'),
			ftm: lin('fathom (ftm)', 1.8288, '英寻 / 浔 (6 英尺 / 1.8288 米，水深标准)', 'ftm'),
			cable: lin('cable (cb)', 185.2, '链 (0.1 海里 / 185.2 米)', 'cb'),

			// Imperial & US Customary
			mil: lin('mil / thou', 0.0000254, '密耳 / 丝 (0.001 英寸 / 0.0254 毫米，PCB)', 'mil'),
			in: lin('inch (in)', 0.0254, '英寸 (25.4 毫米)', 'in'),
			ft: lin('foot (ft)', 0.3048, '英尺 (12 英寸 / 0.3048 米)', 'ft'),
			yd: lin('yard (yd)', 0.9144, '码 (3 英尺 / 0.9144 米)', 'yd'),
			mi: lin('mile (mi)', 1609.344, '英里 (5280 英尺 / 约1.609 千米)', 'mi'),

			// Astronomical
			au: lin('astronomical unit (AU)', 149597870700, '天文单位 (日地平均距离 ≈ 1.496亿千米)', 'AU'),
			ly: lin('light-year (ly)', 9.4607304725808e15, '光年 (真空中光行一年距离 ≈ 9.46万亿千米)', 'ly'),
		},
	},
	{
		id: 'area',
		label: 'Area',
		labelZh: '面积',
		units: {
			// Metric
			mm2: lin('square millimeter (mm²)', 1e-6, '平方毫米', 'mm²'),
			cm2: lin('square centimeter (cm²)', 1e-4, '平方厘米', 'cm²'),
			dm2: lin('square decimeter (dm²)', 1e-2, '平方分米', 'dm²'),
			m2: lin('square meter (m²)', 1, '平方米', 'm²'),
			a: lin('are (a)', 100, '公亩 (100 平方米)', 'a'),
			ha: lin('hectare (ha)', 1e4, '公顷 (10,000 平方米 / 15 亩)', 'ha'),
			km2: lin('square kilometer (km²)', 1e6, '平方千米 / 平方公里', 'km²'),

			// Chinese Land Area / 市制
			mu: lin('mu', 2000 / 3, '市亩 (2000/3 平方米 ≈ 666.67 m²)', 'mu', '亩'),
			qing: lin('qing', 200000 / 3, '市顷 (100 亩 ≈ 6.67 公顷)', 'qing', '顷'),
			fen_area: lin('fen of land', 200 / 3, '分地 (0.1 亩 ≈ 66.67 平方米)', 'fen', '分地'),
			sq_zhang: lin('square zhang', 100 / 9, '平方丈 (100/9 平方米 ≈ 11.11 m²)', 'sq zhang', '平方丈'),
			sq_chi: lin('square chi', 1 / 9, '平方尺 (1/9 平方米 ≈ 0.111 m²)', 'sq chi', '平方尺'),
			sq_cun: lin('square cun', 1 / 900, '平方寸 (约11.11 cm²)', 'sq cun', '平方寸'),

			// Imperial & US Customary
			in2: lin('square inch (in²)', 0.00064516, '平方英寸', 'in²'),
			ft2: lin('square foot (ft²)', 0.09290304, '平方英尺 (约0.0929 平方米)', 'ft²'),
			yd2: lin('square yard (yd²)', 0.83612736, '平方码 (9 平方英尺)', 'yd²'),
			ac: lin('acre (ac)', 4046.8564224, '英亩 (4046.86 平方米 / 约6.07 亩)', 'ac'),
			mi2: lin('square mile (mi²)', 2589988.110336, '平方英里 (640 英亩 / 约2.59 平方千米)', 'mi²'),
		},
	},
	{
		id: 'volume',
		label: 'Volume & Capacity',
		labelZh: '体积与容量',
		units: {
			// Metric
			mL: lin('milliliter (mL)', 0.001, '毫升 (mL)', 'mL'),
			cc: lin('cubic centimeter / cc (cm³)', 0.001, '立方厘米 / 毫升 (cc / cm³ · 排量常用)', 'cc'),
			cL: lin('centiliter (cL)', 0.01, '厘升 (10 mL)', 'cL'),
			dL: lin('deciliter (dL)', 0.1, '分升 (100 mL)', 'dL'),
			L: lin('liter / dm³ (L)', 1, '升 / 立方分米 (dm³)', 'L'),
			m3: lin('cubic meter (m³)', 1000, '立方米 (1000 升)', 'm³'),

			// Chinese Traditional
			sheng: lin('sheng', 1, '市升 (1 升)', 'sheng', '市升'),
			dou: lin('dou', 10, '市斗 (10 升)', 'dou', '市斗'),
			dan_vol: lin('dan', 100, '市石 (100 升 / 10 斗)', 'dan', '市石'),

			// Culinary / Kitchen
			tsp: lin('US teaspoon (tsp)', 0.00492892159375, '茶匙 (美制 / 约4.93 mL)', 'tsp'),
			tbsp: lin('US tablespoon (tbsp)', 0.01478676478125, '汤匙 (美制 / 约14.79 mL / 3茶匙)', 'tbsp'),
			cup: lin('US cup', 0.2365882365, '量杯 (美制 / 约236.59 mL / 16汤匙)', 'cup'),

			// US Liquid
			floz: lin('US fluid ounce (fl oz)', 0.0295735295625, '美制液量盎司 (约29.57 mL)', 'fl oz'),
			pt: lin('US pint (pt)', 0.473176473, '美制品脱 (16 液盎司 / 约473.18 mL)', 'pt'),
			qt: lin('US quart (qt)', 0.946352946, '美制夸脱 (2 品脱 / 约946.35 mL)', 'qt'),
			gal: lin('US gallon (gal)', 3.785411784, '美制加仑 (4 夸脱 / 约3.785 升)', 'gal'),

			// UK Imperial Liquid
			uk_floz: lin('UK fluid ounce (imp fl oz)', 0.0284130625, '英制液量盎司 (约28.41 mL)', 'imp fl oz'),
			uk_pt: lin('UK pint (imp pt)', 0.56826125, '英制品脱 (20 英制液盎司 / 约568.26 mL)', 'imp pt'),
			uk_qt: lin('UK quart (imp qt)', 1.1365225, '英制夸脱 (约1.1365 升)', 'imp qt'),
			uk_gal: lin('UK gallon (imp gal)', 4.54609, '英制加仑 (约4.546 升)', 'imp gal'),

			// Industrial & Engineering
			bbl: lin('oil barrel (bbl)', 158.987294928, '石油桶 (42 美制加仑 / 约158.99 升)', 'bbl'),
			cu_in: lin('cubic inch (in³)', 0.016387064, '立方英寸 (约16.39 mL)', 'in³'),
			cu_ft: lin('cubic foot (ft³)', 28.316846592, '立方英尺 (约28.32 升)', 'ft³'),
			cu_yd: lin('cubic yard (yd³)', 764.554857984, '立方码 (27 立方英尺 / 约764.55 升)', 'yd³'),
		},
	},
	{
		id: 'temperature',
		label: 'Temperature',
		labelZh: '温度',
		units: {
			C: {
				label: 'Celsius (°C)',
				labelZh: '摄氏度 (°C)',
				short: '°C',
				toBase: (v) => v + 273.15,
				fromBase: (v) => v - 273.15,
			},
			F: {
				label: 'Fahrenheit (°F)',
				labelZh: '华氏度 (°F)',
				short: '°F',
				toBase: (v) => ((v - 32) * 5) / 9 + 273.15,
				fromBase: (v) => ((v - 273.15) * 9) / 5 + 32,
			},
			K: {
				label: 'Kelvin (K)',
				labelZh: '开尔文 (K，热力学温标)',
				short: 'K',
				toBase: (v) => v,
				fromBase: (v) => v,
			},
			R: {
				label: 'Rankine (°R)',
				labelZh: '兰氏度 (°R，绝对华氏度)',
				short: '°R',
				toBase: (v) => (v * 5) / 9,
				fromBase: (v) => (v * 9) / 5,
			},
			Re: {
				label: 'Réaumur (°Re)',
				labelZh: '列氏度 (°Re)',
				short: '°Re',
				toBase: (v) => (v * 5) / 4 + 273.15,
				fromBase: (v) => ((v - 273.15) * 4) / 5,
			},
		},
	},
	{
		id: 'speed',
		label: 'Speed & Velocity',
		labelZh: '速度',
		units: {
			ms: lin('meter/second (m/s)', 1, '米/秒 / 米每秒 (m/s · 国际标准)', 'm/s'),
			kmh: lin('kilometer/hour (km/h)', 1 / 3.6, '千米/小时 / 公里每小时 (km/h · 俗称码/时速)', 'km/h'),
			m_min: lin('meter/minute (m/min)', 1 / 60, '米/分钟 (m/min · 跑步机/传动)', 'm/min'),
			km_min: lin('kilometer/minute (km/min)', 1000 / 60, '千米/分钟 (km/min)', 'km/min'),
			cm_s: lin('centimeter/second (cm/s)', 0.01, '厘米/秒 / 公分每秒 (cm/s)', 'cm/s'),
			in_s: lin('inch/second (in/s)', 0.0254, '英寸/秒 (in/s)', 'in/s'),
			mph: lin('mile/hour (mph)', 0.44704, '英里/小时 / 哩每小时 (mph · 俗称迈)', 'mph'),
			kn: lin('knot (kn)', 1852 / 3600, '节 (kn · 海里/小时 · 航速)', 'kn'),
			fts: lin('foot/second (ft/s)', 0.3048, '英尺/秒 (ft/s)', 'ft/s'),
			ft_min: lin('foot/minute (ft/min)', 0.3048 / 60, '英尺/分钟 (ft/min · 垂直升降速度)', 'ft/min'),
			mach: lin('Mach (Ma, sea level 15°C)', 340.29, '马赫 / 声速音速 (Ma ≈ 340.29 m/s ≈ 1225 km/h)', 'Ma'),
			c: lin('speed of light (c)', 299792458, '真空中光速 (c ≈ 30万千米/秒)', 'c'),
			kms: lin('kilometer/second (km/s)', 1000, '千米/秒 / 公里每秒 (km/s · 航天宇宙速度)', 'km/s'),
		},
	},
	{
		id: 'pressure',
		label: 'Pressure',
		labelZh: '压力与压强',
		units: {
			Pa: lin('pascal (Pa)', 1, '帕斯卡 (国际标准单位)', 'Pa'),
			hPa: lin('hectopascal / mbar (hPa)', 100, '百帕 / 毫巴 (气象天气预报)', 'hPa'),
			kPa: lin('kilopascal (kPa)', 1000, '千帕 (kPa · 汽车胎压标准 250 kPa)', 'kPa'),
			MPa: lin('megapascal (MPa)', 1e6, '兆帕 (100万帕 · 材料强度与工程高压)', 'MPa'),
			GPa: lin('gigapascal (GPa)', 1e9, '吉帕 (10亿帕 · 地质力学与超硬材料)', 'GPa'),
			bar: lin('bar', 100000, '巴 (100 kPa · 汽车胎压 2.5 bar)', 'bar'),
			mbar: lin('millibar (mbar)', 100, '毫巴', 'mbar'),
			psi: lin('pounds per sq inch (psi)', 6894.757293168, '磅力/平方英寸 (美制胎压 36 psi)', 'psi'),
			// Exactly 101325 Pa by definition (10th CGPM, 1954) — *not* 760 mmHg. Both
			// units later got independent exact definitions, so the identity every
			// textbook prints is off by 1.4e-7: this table converts 1 atm to
			// 759.999891726 mmHg, which is the honest answer. Do not "round" either one
			// to make them meet.
			atm: lin('standard atmosphere (atm)', 101325, '标准大气压 (101.325 kPa)', 'atm'),
			mmHg: lin('millimeter of mercury (mmHg / Torr)', 133.322387415, '毫米汞柱 / 托 (人体血压 120/80 mmHg 与真空度)', 'mmHg'),
			// Derived from mmHg rather than transcribed: the conventional inch of mercury
			// is the same definition scaled by an exact inch, so writing it as the product
			// keeps the two agreeing. The hand-entered 3386.3886666667 disagreed from the
			// 8th digit, which the 12-significant-digit display was wide enough to show —
			// 1 inHg printed as 25.4000001975 mmHg, and the standard 29.92 inHg altimeter
			// setting as 759.968005908 instead of 759.968.
			inHg: lin('inch of mercury (inHg)', 25.4 * 133.322387415, '英寸汞柱 (inHg · 航空气象高度计标准 29.92 inHg)', 'inHg'),
			mmH2O: lin('millimeter of water (mmH₂O)', 9.80665, '毫米水柱 (微压差与通风管道)', 'mmH₂O'),
			kgf_cm2: lin('kgf/cm²', 98066.5, '公斤力/平方厘米 (国内俗称"打2.5公斤气")', 'kgf/cm²'),
		},
	},
	{
		id: 'power',
		label: 'Power',
		labelZh: '功率',
		units: {
			mW: lin('milliwatt (mW)', 0.001, '毫瓦 (微功耗芯片)', 'mW'),
			W: lin('watt (W)', 1, '瓦特 (国际标准单位)', 'W'),
			kW: lin('kilowatt (kW)', 1000, '千瓦 (家用电器与新能源电机功率)', 'kW'),
			MW: lin('megawatt (MW)', 1e6, '兆瓦 (100万瓦，发电机组与风电)', 'MW'),
			GW: lin('gigawatt (GW)', 1e9, '吉瓦 / 十亿瓦 (电网规模)', 'GW'),
			ps: lin('metric horsepower (ps)', 735.49875, '米制马力 / 匹 (汽车发动机公制马力)', 'ps'),
			hp: lin('mechanical horsepower (hp)', 745.69987158227022, '英制马力 (美英汽车功率标准)', 'hp'),
			// BTU/3600 written out, so this agrees with the energy table's BTU instead of
			// truncating at the 8th digit (0.29307107 vs 0.293071070172).
			btu_h: lin('BTU per hour (BTU/h)', 1055.05585262 / 3600, '英热单位/小时 (空调制冷量匹数)', 'BTU/h'),
			kcal_h: lin('kilocalorie/hour (kcal/h)', 4184 / 3600, '千卡/小时 / 大卡/时 (kcal/h · 锅炉暖通供热)', 'kcal/h'),
			ft_lb_s: lin('foot-pound/second (ft·lb/s)', 1.3558179483314, '英尺·磅/秒', 'ft·lb/s'),
			cal_s: lin('calorie/second (cal/s)', 4.184, '卡路里/秒', 'cal/s'),
		},
	},
	{
		id: 'energy',
		label: 'Energy & Work',
		labelZh: '能量与功',
		units: {
			J: lin('joule (J)', 1, '焦耳 (国际标准单位)', 'J'),
			kJ: lin('kilojoule (kJ)', 1000, '千焦 (食品标签营养热量标准)', 'kJ'),
			MJ: lin('megajoule (MJ)', 1e6, '兆焦 (燃气热值与大工业)', 'MJ'),
			GJ: lin('gigajoule (GJ)', 1e9, '吉焦 (10亿焦耳 · 集中供热与燃气热力)', 'GJ'),
			cal: lin('calorie (cal)', 4.184, '卡路里 (化学热量)', 'cal'),
			kcal: lin('kilocalorie / Calorie (kcal)', 4184, '千卡 / 大卡 (健身减脂饮食热量核心)', 'kcal'),
			Wh: lin('watt-hour (Wh)', 3600, '瓦时 (手机电池与充电宝额定能量)', 'Wh'),
			kWh: lin('kilowatt-hour (kWh)', 3.6e6, '千瓦时 / 度电 (家庭用电与电动车电池度数)', 'kWh'),
			MWh: lin('megawatt-hour (MWh)', 3.6e9, '兆瓦时 (1000 度电 · 发电与储能电站)', 'MWh'),
			eV: lin('electronvolt (eV)', 1.602176634e-19, '电子伏特 (微观粒子物理能量)', 'eV'),
			keV: lin('kiloelectronvolt (keV)', 1.602176634e-16, '千电子伏特 (X射线物理能量)', 'keV'),
			MeV: lin('megaelectronvolt (MeV)', 1.602176634e-13, '兆电子伏特 (核物理高能粒子)', 'MeV'),
			BTU: lin('British thermal unit (BTU)', 1055.05585262, '英热单位 (暖通与天然气供热)', 'BTU'),
			ft_lb: lin('foot-pound (ft·lb)', 1.3558179483314, '英尺·磅', 'ft·lb'),
		},
	},
	{
		id: 'time',
		label: 'Time',
		labelZh: '时间',
		units: {
			ps: lin('picosecond (ps)', 1e-12, '皮秒', 'ps'),
			ns: lin('nanosecond (ns)', 1e-9, '纳秒 (光纤与内存延迟)', 'ns'),
			us: lin('microsecond (µs)', 1e-6, '微秒', 'µs'),
			ms: lin('millisecond (ms)', 0.001, '毫秒 (网络延迟 ping)', 'ms'),
			s: lin('second (s)', 1, '秒 (国际标准单位)', 's'),
			min: lin('minute (min)', 60, '分钟 (60 秒)', 'min'),
			h: lin('hour (h)', 3600, '小时 (60 分钟 / 3600 秒)', 'h'),
			d: lin('day (d)', 86400, '天 / 日 (24 小时)', 'd'),
			wk: lin('week (wk)', 604800, '周 / 星期 (7 天)', 'wk'),
			xun: lin('xun', 864000, '旬 (10 天)', 'xun', '旬'),
			mo: lin('month (mo, 30.44d)', 2629800, '月 (平均月 ≈ 30.44 天)', 'mo', '月'),
			quarter: lin('quarter', 7889400, '季度 (3 个月 ≈ 91.31 天)', 'qtr', '季度'),
			yr: lin('year (yr, 365d)', 31536000, '平年 (365 天)', 'yr', '年'),
			leap_yr: lin('leap year (366d)', 31622400, '闰年 (366 天)', 'leap yr', '闰年'),
			century: lin('century', 3155760000, '世纪 (100 年)', 'century', '世纪'),
		},
	},
	{
		id: 'data',
		label: 'Data Size & Bandwidth',
		labelZh: '数据存储与带宽',
		units: {
			// Bits (Bandwidth)
			b: lin('bit (b)', 0.125, '比特 (1/8 字节，网络带宽通信标准)', 'b'),
			Kb: lin('kilobit (Kb, 1000b)', 125, '千比特 (1000 比特 / 125 字节)', 'Kb'),
			Mb: lin('megabit (Mb, 1000²b)', 125000, '兆比特 (如 100M 宽带 = 100 Mbps = 12.5 MB/s)', 'Mb'),
			Gb: lin('gigabit (Gb, 1000³b)', 125000000, '吉比特 (如千兆宽带 1 Gbps = 125 MB/s)', 'Gb'),
			Tb: lin('terabit (Tb, 1000⁴b)', 125000000000, '太比特 (骨干网带宽 1 Tbps = 125 GB/s)', 'Tb'),

			// Decimal Bytes (Storage devices, HDD/SSD standard, SI 1000-base)
			B: lin('byte (B)', 1, '字节 (8 比特)', 'B'),
			KB: lin('kilobyte (KB, 1000)', 1e3, '千字节 (1000 字节，厂商标称)', 'KB'),
			MB: lin('megabyte (MB, 1000²)', 1e6, '兆字节 (1000² 字节)', 'MB'),
			GB: lin('gigabyte (GB, 1000³)', 1e9, '吉字节 / 十亿字节 (1000³ 字节，512G 固态硬盘)', 'GB'),
			TB: lin('terabyte (TB, 1000⁴)', 1e12, '太字节 / 万亿字节 (1000⁴ 字节)', 'TB'),
			PB: lin('petabyte (PB, 1000⁵)', 1e15, '拍字节 (1000⁵ 字节，企业级云存储)', 'PB'),
			EB: lin('exabyte (EB, 1000⁶)', 1e18, '艾字节 (1000⁶ 字节)', 'EB'),

			// Binary Bytes (OS memory & files, IEC 1024-base)
			KiB: lin('kibibyte (KiB, 1024)', 1024, '千字节 (1024 字节，系统实际计算)', 'KiB'),
			MiB: lin('mebibyte (MiB, 1024²)', 1024 ** 2, '兆字节 (1024² 字节)', 'MiB'),
			GiB: lin('gibibyte (GiB, 1024³)', 1024 ** 3, '吉字节 (1024³ 字节，如 16 GiB 运行内存)', 'GiB'),
			TiB: lin('tebibyte (TiB, 1024⁴)', 1024 ** 4, '太字节 (1024⁴ 字节)', 'TiB'),
			PiB: lin('pebibyte (PiB, 1024⁵)', 1024 ** 5, '拍字节 (1024⁵ 字节)', 'PiB'),
			EiB: lin('exbibyte (EiB, 1024⁶)', 1024 ** 6, '艾字节 (1024⁶ 字节)', 'EiB'),
		},
	},
];

export function getCategory(id: string): UnitCategory | undefined {
	return UNIT_CATEGORIES.find((c) => c.id === id);
}
