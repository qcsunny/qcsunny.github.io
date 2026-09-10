// Client-side lazy catalog: maps a tool category to its entries, imported on
// demand so a tool page downloads only its own category's configs instead of
// the whole registry. registry.ts stays the build-time aggregate every page,
// hub and search index reads; nothing here runs at build time.
// The 'tools' legacy alias resolves like devtools (see categoryHref).

import type { ToolCategory, ToolEntry } from './registry';

export async function loadCategoryEntries(category: ToolCategory): Promise<ToolEntry[]> {
	switch (category) {
		case 'calculators':
			return (await import('./calculators')).CALCULATOR_TOOLS;
		case 'converters':
			return (await import('./converters')).CONVERTER_TOOLS;
		case 'finance':
			return (await import('./finance')).FINANCE_TOOLS;
		case 'tools':
		case 'devtools':
			return [
				...(await import('./textTools')).DEVTOOLS_TEXT_TOOLS,
				...(await import('./generators')).DEVTOOLS_GENERATOR_TOOLS,
			];
		case 'utilities':
			return [
				...(await import('./daily')).DAILY_TOOLS,
				...(await import('./textTools')).UTILITIES_TEXT_TOOLS,
				...(await import('./generators')).UTILITIES_GENERATOR_TOOLS,
				...(await import('./widgets')).TOOL_WIDGETS,
			];
	}
}
