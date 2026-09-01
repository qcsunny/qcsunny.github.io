// Unit conversion data shared by the /converters/* pages.
// Extracted from the old calculator Units tab; the calculator itself now
// links to the standalone converter pages instead of embedding a tab.

export interface UnitDef {
	label: string;
	toBase: (v: number) => number;
	fromBase: (v: number) => number;
}

export interface UnitCategory {
	id: string;
	label: string;
	units: Record<string, UnitDef>;
}

/** Linear unit: value * factor converts to base unit. */
const lin = (label: string, factor: number): UnitDef => ({
	label,
	toBase: (v) => v * factor,
	fromBase: (v) => v / factor,
});

export const UNIT_CATEGORIES: UnitCategory[] = [
	{
		id: 'length',
		label: 'Length',
		units: {
			mm: lin('millimeter (mm)', 0.001),
			cm: lin('centimeter (cm)', 0.01),
			m: lin('meter (m)', 1),
			km: lin('kilometer (km)', 1000),
			in: lin('inch (in)', 0.0254),
			ft: lin('foot (ft)', 0.3048),
			yd: lin('yard (yd)', 0.9144),
			mi: lin('mile (mi)', 1609.344),
		},
	},
	{
		id: 'weight',
		label: 'Weight',
		units: {
			mg: lin('milligram (mg)', 1e-6),
			g: lin('gram (g)', 0.001),
			kg: lin('kilogram (kg)', 1),
			t: lin('tonne (t)', 1000),
			oz: lin('ounce (oz)', 0.028349523125),
			lb: lin('pound (lb)', 0.45359237),
			st: lin('stone (st)', 6.35029318),
		},
	},
	{
		id: 'temperature',
		label: 'Temperature',
		units: {
			C: { label: 'Celsius (°C)', toBase: (v) => v + 273.15, fromBase: (v) => v - 273.15 },
			F: {
				label: 'Fahrenheit (°F)',
				toBase: (v) => ((v - 32) * 5) / 9 + 273.15,
				fromBase: (v) => ((v - 273.15) * 9) / 5 + 32,
			},
			K: { label: 'Kelvin (K)', toBase: (v) => v, fromBase: (v) => v },
		},
	},
	{
		id: 'area',
		label: 'Area',
		units: {
			mm2: lin('square millimeter (mm²)', 1e-6),
			cm2: lin('square centimeter (cm²)', 1e-4),
			m2: lin('square meter (m²)', 1),
			ha: lin('hectare (ha)', 1e4),
			km2: lin('square kilometer (km²)', 1e6),
			in2: lin('square inch (in²)', 0.00064516),
			ft2: lin('square foot (ft²)', 0.09290304),
			mi2: lin('square mile (mi²)', 2589988.110336),
		},
	},
	{
		id: 'volume',
		label: 'Volume',
		units: {
			mL: lin('milliliter (mL)', 0.001),
			L: lin('liter (L)', 1),
			m3: lin('cubic meter (m³)', 1000),
			gal: lin('US gallon (gal)', 3.785411784),
			qt: lin('US quart (qt)', 0.946352946),
			pt: lin('US pint (pt)', 0.473176473),
			cup: lin('US cup', 0.2365882365),
			floz: lin('US fluid ounce (fl oz)', 0.0295735295625),
		},
	},
	{
		id: 'speed',
		label: 'Speed',
		units: {
			ms: lin('meter/second (m/s)', 1),
			kmh: lin('kilometer/hour (km/h)', 1 / 3.6),
			mph: lin('mile/hour (mph)', 0.44704),
			kn: lin('knot (kn)', 0.514444444),
			fts: lin('foot/second (ft/s)', 0.3048),
		},
	},
	{
		id: 'time',
		label: 'Time',
		units: {
			ns: lin('nanosecond (ns)', 1e-9),
			us: lin('microsecond (µs)', 1e-6),
			ms: lin('millisecond (ms)', 0.001),
			s: lin('second (s)', 1),
			min: lin('minute (min)', 60),
			h: lin('hour (h)', 3600),
			d: lin('day (d)', 86400),
			wk: lin('week (wk)', 604800),
		},
	},
	{
		id: 'data',
		label: 'Data size',
		units: {
			B: lin('byte (B)', 1),
			KB: lin('kilobyte (KB, 1000)', 1e3),
			MB: lin('megabyte (MB, 1000²)', 1e6),
			GB: lin('gigabyte (GB, 1000³)', 1e9),
			TB: lin('terabyte (TB, 1000⁴)', 1e12),
			KiB: lin('kibibyte (KiB, 1024)', 1024),
			MiB: lin('mebibyte (MiB, 1024²)', 1024 ** 2),
			GiB: lin('gibibyte (GiB, 1024³)', 1024 ** 3),
			TiB: lin('tebibyte (TiB, 1024⁴)', 1024 ** 4),
		},
	},
];

export function getCategory(id: string): UnitCategory | undefined {
	return UNIT_CATEGORIES.find((c) => c.id === id);
}
