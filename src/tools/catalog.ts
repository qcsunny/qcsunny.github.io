// Client-side lazy catalog: maps a tool category to its entries, imported on
// demand so a tool page downloads only its own category's configs instead of
// the whole registry. registry.ts stays the build-time aggregate every page,
// hub and search index reads; nothing here runs at build time.
//
// The group membership mirrors registry.ts's CATEGORY_GROUPS table — move an
// entry's group there and here together, or the client chunk stops containing
// the entry its page routes to. CATEGORY_GROUPS is asserted against each
// entry's `category` field at build time; the Record<ToolCategory, _> shape
// here makes a forgotten category a compile error instead of a silent
// undefined.

import type { ToolCategory, ToolEntry } from './registry';

const CATEGORY_SOURCES: Record<ToolCategory, () => Promise<ToolEntry[]>> = {
	calculators: async () => (await import('./calculators')).CALCULATOR_TOOLS,
	converters: async () => (await import('./converters')).CONVERTER_TOOLS,
	finance: async () => (await import('./finance')).FINANCE_TOOLS,
	daily: async () => (await import('./daily')).DAILY_TOOLS,
	devtools: async () => [
		...(await import('./textTools')).DEVTOOLS_TEXT_TOOLS,
		...(await import('./generators')).DEVTOOLS_GENERATOR_TOOLS,
		...(await import('./widgets')).DEVTOOLS_WIDGETS,
	],
	text: async () => (await import('./textTools')).TEXT_TOOLS,
	office: async () => (await import('./textTools')).OFFICE_TEXT_TOOLS,
	security: async () => [
		...(await import('./textTools')).SECURITY_TEXT_TOOLS,
		...(await import('./generators')).SECURITY_GENERATOR_TOOLS,
	],
	media: async () => (await import('./textTools')).MEDIA_TEXT_TOOLS,
	color: async () => [
		...(await import('./textTools')).COLOR_TEXT_TOOLS,
		...(await import('./widgets')).COLOR_WIDGETS,
	],
	seo: async () => (await import('./textTools')).SEO_TEXT_TOOLS,
	fun: async () => (await import('./textTools')).FUN_TEXT_TOOLS,
};

export async function loadCategoryEntries(category: ToolCategory): Promise<ToolEntry[]> {
	return CATEGORY_SOURCES[category]();
}
