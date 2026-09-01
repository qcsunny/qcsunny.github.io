// Central registry of every data-driven tool page. Imported by:
//  - the four dynamic routes src/pages/{category}/[slug].astro (getStaticPaths)
//  - the client dispatcher src/scripts/tools/main.ts (finds the entry by
//    category + slug and renders it with the matching widget)
// compute/stats functions are pure and unit-testable with tsx.
// The scientific calculator (/calculators/standard) and function grapher
// (/calculators/graph) are static pages, not registry entries — see
// CALCULATOR_FEATURED below, which only feeds the index listings.

import { CALCULATOR_TOOLS } from './calculators';
import { CONVERTER_TOOLS } from './converters';
import { FINANCE_TOOLS } from './finance';

export type ToolCategory = 'calculators' | 'converters' | 'finance' | 'tools';
export type ToolKind = 'form' | 'converter' | 'text' | 'qr' | 'color' | 'redirect';

export interface ToolMeta {
	slug: string;
	category: ToolCategory;
	name: string;
	description: string;
}

// --- form tools ---------------------------------------------------------------

export interface FormField {
	id: string;
	label: string;
	/** input type rendered; 'select' needs options, 'checkbox' is boolean */
	type?: 'number' | 'text' | 'select' | 'checkbox' | 'textarea';
	def?: string;
	placeholder?: string;
	/** unit hint shown after the label, e.g. "(%)" or "($)" */
	suffix?: string;
	options?: { value: string; label: string }[];
	step?: string;
	min?: string;
	max?: string;
	/** long explanation shown under the field */
	hint?: string;
}

export interface FormResultRow {
	label: string;
	value: string;
	/** render as the large highlighted primary result */
	emphasis?: boolean;
}

export interface FormTable {
	columns: string[];
	rows: string[][];
}

export interface FormResult {
	rows: FormResultRow[];
	table?: FormTable;
	note?: string;
}

/** Value accessor handed to compute(); keeps configs terse and typed. */
export interface FormValues {
	/** parsed number, NaN when empty/invalid */
	num(id: string): number;
	/** raw input string, trimmed */
	str(id: string): string;
	bool(id: string): boolean;
}

export interface FormConfig {
	intro?: string;
	fields: FormField[];
	compute: (v: FormValues) => FormResult;
}

// --- other kinds --------------------------------------------------------------

export interface ConverterConfig {
	/** category id in ./units */
	categoryId: string;
}

export interface TextStat {
	label: string;
	value: string;
}

export interface TextTransform {
	id: string;
	label: string;
	run: (text: string) => { output: string; error?: string };
}

export interface TextConfig {
	placeholder?: string;
	/** live per-input statistics rows */
	stats?: (text: string) => TextStat[];
	/** button-triggered transforms writing into an output area */
	transforms?: TextTransform[];
	/** monospace font for input/output (code-like tools) */
	mono?: boolean;
}

export interface RedirectConfig {
	target: string;
}

export type ToolEntry = ToolMeta &
	(
		| { kind: 'form'; config: FormConfig }
		| { kind: 'converter'; config: ConverterConfig }
		| { kind: 'text'; config: TextConfig }
		| { kind: 'qr' }
		| { kind: 'color' }
		| { kind: 'redirect'; config: RedirectConfig }
	);

// --- categories ----------------------------------------------------------------

export const CATEGORIES: { id: ToolCategory; label: string; blurb: string }[] = [
	{
		id: 'calculators',
		label: 'Calculators',
		blurb: 'Percentage, fractions, ratios, averages and more.',
	},
	{
		id: 'converters',
		label: 'Converters',
		blurb: 'Length, weight, temperature, area, volume, speed, time and data units.',
	},
	{
		id: 'finance',
		label: 'Finance',
		blurb: 'Compound interest, loans, mortgages, investments, salary and tax.',
	},
	{
		id: 'tools',
		label: 'Tools',
		blurb: 'Passwords, QR codes, UUIDs, text and JSON utilities, colors.',
	},
];

/** Static feature pages listed on the calculators index (real routes live in src/pages/calculators/). */
export const CALCULATOR_FEATURED: ToolMeta[] = [
	{
		slug: 'standard',
		category: 'calculators',
		name: 'Scientific Calculator',
		description: 'Standard and scientific calculator with variables, history and DEG/RAD modes.',
	},
	{
		slug: 'graph',
		category: 'calculators',
		name: 'Function Grapher',
		description: 'Plot up to 4 functions with zoom, pan and a live value crosshair.',
	},
];

export function categoryLabel(id: ToolCategory): string {
	return CATEGORIES.find((c) => c.id === id)?.label ?? id;
}

/** Every registry-driven tool page, all four categories. */
export const REGISTRY: ToolEntry[] = [...CALCULATOR_TOOLS, ...CONVERTER_TOOLS, ...FINANCE_TOOLS];

export function findEntry(category: string, slug: string): ToolEntry | undefined {
	return REGISTRY.find((e) => e.category === category && e.slug === slug);
}
