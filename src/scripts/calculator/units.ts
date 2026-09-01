import { formatNumber } from './engine';

interface UnitDef {
	label: string;
	toBase: (v: number) => number;
	fromBase: (v: number) => number;
}

interface Category {
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

const CATEGORIES: Category[] = [
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
		id: 'mass',
		label: 'Mass',
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

export function initUnits(): void {
	const catSel = document.querySelector<HTMLSelectElement>('#unit-category');
	const fromSel = document.querySelector<HTMLSelectElement>('#unit-from');
	const toSel = document.querySelector<HTMLSelectElement>('#unit-to');
	const fromInput = document.querySelector<HTMLInputElement>('#unit-from-value');
	const toInput = document.querySelector<HTMLInputElement>('#unit-to-value');
	const swapBtn = document.querySelector<HTMLButtonElement>('#unit-swap');
	if (!catSel || !fromSel || !toSel || !fromInput || !toInput || !swapBtn) return;

	for (const cat of CATEGORIES) {
		const opt = document.createElement('option');
		opt.value = cat.id;
		opt.textContent = cat.label;
		catSel.append(opt);
	}

	function currentCategory(): Category {
		return CATEGORIES.find((c) => c.id === catSel!.value) ?? CATEGORIES[0]!;
	}

	function fillUnitSelects(cat: Category, keepFrom?: string, keepTo?: string): void {
		const names = Object.keys(cat.units);
		fill(fromSel!, names, cat.units, keepFrom);
		fill(toSel!, names, cat.units, keepTo);
	}

	function fill(sel: HTMLSelectElement, names: string[], units: Record<string, UnitDef>, keep?: string): void {
		sel.innerHTML = '';
		for (const name of names) {
			const opt = document.createElement('option');
			opt.value = name;
			opt.textContent = units[name]!.label;
			sel.append(opt);
		}
		if (keep && names.includes(keep)) sel.value = keep;
	}

	function convert(): void {
		const cat = currentCategory();
		const from = cat.units[fromSel!.value];
		const to = cat.units[toSel!.value];
		if (!from || !to) return;
		const v = Number(fromInput!.value);
		if (fromInput!.value.trim() === '' || !Number.isFinite(v)) {
			toInput!.value = '';
			return;
		}
		toInput!.value = formatNumber(to.fromBase(from.toBase(v)));
	}

	function onCategoryChange(): void {
		const cat = currentCategory();
		fillUnitSelects(cat);
		// pick a sensible default pair: first and (if available) second unit
		const names = Object.keys(cat.units);
		if (names.length > 1) toSel!.value = names[1] as string;
		convert();
	}

	catSel.addEventListener('change', onCategoryChange);
	fromSel.addEventListener('change', convert);
	toSel.addEventListener('change', convert);
	fromInput.addEventListener('input', convert);
	swapBtn.addEventListener('click', () => {
		const fromVal = fromSel.value;
		fromSel.value = toSel.value;
		toSel.value = fromVal;
		// carry the converted value into the left side
		if (toInput.value) fromInput.value = toInput.value;
		convert();
	});

	// init: category order is CATEGORIES order; selects default to first units
	fillUnitSelects(currentCategory());
	const names = Object.keys(currentCategory().units);
	if (names.length > 1) toSel.value = names[1] as string;
	fromInput.value = '1';
	convert();
}
