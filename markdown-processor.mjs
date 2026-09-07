// @ts-check
import { satteri } from '@astrojs/markdown-satteri';

/** @typedef {import('astro/markdown').AstroMarkdownOptions} AstroMarkdownOptions */
/** @typedef {import('astro/markdown').MarkdownRenderOptions} MarkdownRenderOptions */
/** @typedef {import('astro/markdown').MdxRendererOptions} MdxRendererOptions */
/** @typedef {import('astro/markdown').MarkdownProcessor} MarkdownProcessor */
/** @typedef {import('@astrojs/markdown-satteri').SatteriProcessorOptions} SatteriProcessorOptions */
/** @typedef {import('@astrojs/markdown-satteri').SatteriResolvedOptions} SatteriResolvedOptions */

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
 * @param {SatteriProcessorOptions} [options]
 * @returns {MarkdownProcessor & { options: SatteriResolvedOptions }}
 */
export function createGfmMarkdownProcessor(options = {}) {
	const base = satteri(options);

	return {
		name: 'gfm-satteri',
		options: base.options,
		/** @param {AstroMarkdownOptions} renderConfig */
		async createRenderer(renderConfig) {
			const baseRenderer = await base.createRenderer(renderConfig);
			return {
				/**
				 * @param {string} content
				 * @param {MarkdownRenderOptions} [renderOpts]
				 */
				async render(content, renderOpts) {
					const normalized = normalizeMarkdown(content);
					return baseRenderer.render(normalized, renderOpts);
				},
			};
		},
		/**
		 * @param {AstroMarkdownOptions} renderConfig
		 * @param {MdxRendererOptions} mdxConfig
		 */
		async createMdxRenderer(renderConfig, mdxConfig) {
			if (!base.createMdxRenderer) {
				throw new Error('Sätteri must provide an MDX renderer');
			}
			return base.createMdxRenderer(renderConfig, mdxConfig);
		},
	};
}

/**
 * Normalizes Markdown input before it enters Sätteri's parser:
 * 1. Protects fenced and inline code from every prose transform.
 * 2. Sanitizes LaTeX formulas in heading lines to standard Unicode so headings and TOC never break.
 * 3. Escapes standalone tildes in prose to preserve numeric/time ranges while preserving ~~strikethrough~~.
 *
 * @param {string} markdown
 */
function normalizeMarkdown(markdown) {
	/** @type {string[]} */
	const code = [];
	let marker = '\u0000ASTRO_CODE_';
	while (markdown.includes(marker)) marker = `_${marker}`;

	const protectedText = markdown.replace(/```[\s\S]*?```|`[^`\n]+`/g, (value) => {
		const token = `${marker}${code.length}\u0000`;
		code.push(value);
		return token;
	});

	let text = normalizeHeadings(protectedText);
	text = text.replace(/(?<!~)~(?!~)/g, '\\~');

	return text.replace(new RegExp(`${marker}(\\d+)\\u0000`, 'g'), (_, index) => code[Number(index)]);
}

/**
 * Converts common LaTeX math macros in markdown heading lines to standard Unicode symbols.
 * This guarantees that both the rendered <h2/h3> tags and the right-hand TOC navigation
 * have crystal-clear, accessible, and semantic typography.
 * @param {string} markdown
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
