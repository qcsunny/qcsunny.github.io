// Registry entries for /converters/* — one page per unit category in ./units.

import type { ToolEntry } from './registry';

const converter = (
	slug: string,
	categoryId: string,
	name: string,
	description: string,
): ToolEntry => ({ slug, category: 'converters', name, description, kind: 'converter', config: { categoryId } });

export const CONVERTER_TOOLS: ToolEntry[] = [
	converter(
		'length',
		'length',
		'Length Converter',
		'Convert between millimeters, centimeters, meters, kilometers, inches, feet, yards and miles.',
	),
	converter(
		'weight',
		'weight',
		'Weight Converter',
		'Convert between milligrams, grams, kilograms, tonnes, ounces, pounds and stone.',
	),
	converter('temperature', 'temperature', 'Temperature Converter', 'Convert between Celsius, Fahrenheit and Kelvin.'),
	converter(
		'area',
		'area',
		'Area Converter',
		'Convert between square millimeters, square centimeters, square meters, hectares, square kilometers and imperial area units.',
	),
	converter(
		'volume',
		'volume',
		'Volume Converter',
		'Convert between milliliters, liters, cubic meters and US gallons, quarts, pints, cups and fluid ounces.',
	),
	converter(
		'speed',
		'speed',
		'Speed Converter',
		'Convert between m/s, km/h, mph, knots and ft/s.',
	),
	converter(
		'time',
		'time',
		'Time Converter',
		'Convert between nanoseconds, microseconds, milliseconds, seconds, minutes, hours, days and weeks.',
	),
	converter(
		'data',
		'data',
		'Data Size Converter',
		'Convert between bytes, KB/MB/GB/TB (1000-based) and KiB/MiB/GiB/TiB (1024-based).',
	),
];
