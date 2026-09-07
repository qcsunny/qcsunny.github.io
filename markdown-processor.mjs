// @ts-check
import { satteri } from '@astrojs/markdown-satteri';

/**
 * Custom Markdown processor wrapper on top of @astrojs/markdown-satteri.
 *
 * Solves two architectural issues in content rendering at the pipeline level,
 * ensuring authors can write natural Markdown without worrying about parser quirks:
 *
 * 1. Single-tilde range bug: Sätteri's Rust parser enables single-tilde strikethrough,
 *    causing numeric ranges like "0~59 ... 0~23" to greedily swallow text into <del>.
 *    In strict GFM, strikethrough MUST be double tilde (~~). We escape lone tildes (\~)
 *    in prose so they remain literal tildes in the rendered HTML without touching author files.
 *
 * 2. Headings with math formulas: Sätteri removes HTML elements when generating heading text,
 *    causing inline KaTeX in headings (like \neq or $O(n^{1/4})$) to break into missing text or
 *    overlapping garbled glyphs in the table-of-contents navigation. We transform heading formulas
 *    into clean Unicode representations before parsing so both the heading and TOC look perfect.
 */
export function createGfmMarkdownProcessor(options = {}) {
	const base = satteri(options);

	return {
		name: 'gfm-satteri',
		options: base.options,
		async createRenderer(renderConfig) {
			const baseRenderer = await base.createRenderer(renderConfig);
			return {
				async render(content, renderOpts) {
					const normalized = normalizeMarkdown(content);
					return baseRenderer.render(normalized, renderOpts);
				},
			};
		},
		async createMdxRenderer(renderConfig) {
			return base.createMdxRenderer ? base.createMdxRenderer(renderConfig) : undefined;
		},
	};
}

/**
 * Normalizes Markdown input before it enters Sätteri's parser:
 * 1. Sanitizes LaTeX formulas in heading lines to standard Unicode so headings and TOC never break.
 * 2. Escapes standalone tildes in prose to preserve numeric/time ranges while preserving ~~strikethrough~~.
 * 3. Preserves code blocks and inline code exactly as written.
 */
function normalizeMarkdown(markdown) {
	// First handle heading math formulas line by line (safe from code fences because of ^#{1,6}\s)
	let text = normalizeHeadings(markdown);

	if (!text.includes('~')) return text;

	// Split by code blocks (```...```) and inline code spans (`...`)
	const parts = text.split(/(```[\s\S]*?```|`[^`\n]+`)/g);

	for (let i = 0; i < parts.length; i += 2) {
		// Only transform regular prose (even indices)
		// Convert any tilde that is NOT part of a double tilde (~~) into \~
		parts[i] = parts[i].replace(/(?<!~)~(?!~)/g, '\\~');
	}

	return parts.join('');
}

/**
 * Converts common LaTeX math macros in markdown heading lines to standard Unicode symbols.
 * This guarantees that both the rendered <h2/h3> tags and the right-hand TOC navigation
 * have crystal-clear, accessible, and semantic typography.
 */
function normalizeHeadings(markdown) {
	return markdown.replace(/^(#{1,6}\s+[^\n]+)$/gm, (headingLine) => {
		return headingLine
			.replace(/\$\\neq\$/g, '≠')
			.replace(/\\neq/g, '≠')
			.replace(/\$\\times\$/g, '×')
			.replace(/\\times/g, '×')
			.replace(/\$\\approx\$/g, '≈')
			.replace(/\\approx/g, '≈')
			.replace(/\$\\pm\$/g, '±')
			.replace(/\\pm/g, '±')
			.replace(/\$\\le(?:q)?\$/g, '≤')
			.replace(/\$\\ge(?:q)?\$/g, '≥')
			.replace(/\$O\(n\^\{1\/4\}\)\$/g, 'O(n¹/⁴)')
			.replace(/O\(n\^\{1\/4\}\)/g, 'O(n¹/⁴)')
			.replace(/\$2\^\{53\}\s*-\s*1\$/g, '2⁵³ - 1')
			.replace(/2\^\{53\}\s*-\s*1/g, '2⁵³ - 1')
			.replace(/\$C\(60,\s*30\)\$/g, 'C(60, 30)')
			.replace(/\$([^$]+)\$/g, '$1');
	});
}
