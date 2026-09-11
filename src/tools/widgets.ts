// Widget-backed tools (QR, color) — registry entries with dedicated widgets
// in src/scripts/tools/{qr,color}.ts. Kept in their own module so the
// client catalog (catalog.ts) can pull the devtools/color categories without
// dragging the whole registry — and every other category's configs — into
// a page's bundle.

import type { ToolEntry } from './registry';

/** Registry entries for /devtools/qr-code-generator and /color/color-converter.
 *  Their widgets live in src/scripts/tools/{qr,color}.ts and are loaded via
 *  dynamic import from the dispatcher. */

export const DEVTOOLS_WIDGETS: ToolEntry[] = [
	{
		slug: 'qr-code-generator',
		category: 'devtools',
		name: 'QR Code Generator',
		nameZh: '二维码生成器',
		description: 'Turn text or URLs into downloadable QR codes, generated entirely in your browser.',
		descriptionZh: '将文本或网址转换为可下载的二维码，完全在浏览器本地生成。',
		kind: 'qr',
	},
];

export const COLOR_WIDGETS: ToolEntry[] = [
	{
		slug: 'color-converter',
		category: 'color',
		name: 'Color Converter',
		nameZh: '颜色换算工具',
		description: 'Convert colors between HEX, RGB and HSL with a live swatch and complement.',
		descriptionZh: '在 HEX、RGB 和 HSL 之间转换颜色，支持实时色块预览与互补色计算。',
		kind: 'color',
	},
];

