// @ts-check

import mdx from '@astrojs/mdx';
import { createGfmMarkdownProcessor } from './markdown-processor.mjs';
import sitemap from '@astrojs/sitemap';
import { defineConfig, fontProviders } from 'astro/config';

import { readBlogFrontmatter } from './scripts/lib/blog-frontmatter.mjs';
import { assertBlogRelations } from './src/blog/blogMetadata.ts';

import llmsTxt from './llms-txt.mjs';
import modulePreload from './modulepreload.mjs';
import ogImages from './og-images.mjs';
import satteriKatex from './satteri-katex.mjs';
import searchIndex from './search-index.mjs';

// Blog lastmod → ISO, skimmed from frontmatter at config time so the sitemap
// can emit <lastmod>. @astrojs/sitemap never sees the content collection, so
// there is no collection-aware hook. updatedDate wins when an article carries
// one (2026-09-10: the field is live — set it in frontmatter and the sitemap
// follows), pubDate is the fallback.
/** @type {Record<string, string>} */
const blogLastmod = {};
{
	const dir = 'src/content/blog';
	const entries = readBlogFrontmatter(dir);
	assertBlogRelations(
		/** @type {import('./src/blog/blogMetadata.ts').RelationValidationInput[]} */ (
			entries.map((/** @type {{ slug: string, data: Record<string, unknown> }} */ entry) => ({ slug: entry.slug, ...entry.data }))
		),
	);
	for (const { slug, data } of entries) {
		// updatedDate is the later date when present; fall back to pubDate.
		const raw = data.updatedDate ?? data.pubDate;
		const ts = Date.parse(raw);
		blogLastmod[`/blog/${slug}/`] = new Date(ts).toISOString();
	}
}

// https://astro.build/config
export default defineConfig({
	site: 'https://qcsunny.org',
	integrations: [
		mdx(),
		sitemap({
			serialize: (item) => {
				const path = new URL(item.url).pathname;
				const lastmod = blogLastmod[path];
				return lastmod ? { ...item, lastmod } : item;
			},
		}),
		llmsTxt(),
		ogImages(),
		modulePreload(),
		searchIndex(),
	],
	markdown: {
		// Dual Shiki themes so a code block follows the site theme instead of
		// being permanently dark: light mode renders github-light (light bg,
		// dark text, light-tuned token colours), dark mode renders github-dark.
		// Shiki then emits --shiki-light / --shiki-dark CSS variables on every
		// token and the <pre>, and global.css routes them through html[data-theme]
		// (dark = data-theme='dark', light = attribute absent → :root). Astro's
		// default inline color is left on so a no-JS / no-CSS fall-through still
		// shows readable code.
		shikiConfig: {
			themes: { light: 'github-light', dark: 'github-dark' },
			wrap: false,
			defaultColor: false,
		},
		// Sätteri parses maths only when asked; satteri-katex.mjs then renders it
		// to finished markup during the build, so the browser gets plain HTML and
		// no KaTeX JavaScript at all. This replaced a runtime loader that pulled
		// three files from cdn.jsdelivr.net on every post containing a `$`, which
		// left every formula on the site dependent on a third party staying up.
		//
		// createGfmMarkdownProcessor wraps satteri to enforce strict GFM (double-tilde
		// only for strikethrough, preserving numeric ranges like 0~59 in blog source)
		// and sanitizes LaTeX macros in headings for clean TOC rendering.
		processor: createGfmMarkdownProcessor({
			features: { math: true },
			mdastPlugins: [satteriKatex()],
		}),
	},
	fonts: [
		{
			provider: fontProviders.local(),
			name: 'Atkinson',
			cssVariable: '--font-atkinson',
			fallbacks: ['sans-serif'],
			options: {
				variants: [
					// Subsetted woff2 built by scripts/subset-fonts.py from the
					// upstream OFL TTFs in scripts/fonts-upstream/ — 46.6 KB of
					// full-charset woff down to 29 KB, which matters because these
					// two files were 64% of the home page's first-visit bytes and
					// are the only part HTTP compression cannot touch. Re-run that
					// script after adding characters the font must cover.
					{
						src: ['./src/assets/fonts/atkinson-regular.woff2'],
						weight: 400,
						style: 'normal',
						display: 'swap',
					},
					{
						src: ['./src/assets/fonts/atkinson-bold.woff2'],
						weight: 700,
						style: 'normal',
						display: 'swap',
					},
				],
			},
		},
	],
	vite: {
		build: {
			// Vite inlines any asset under 4 KB as a base64 data URI, which is the
			// wrong trade for a webfont. KaTeX_Size3-Regular.woff2 is 3,624 bytes,
			// so it was ending up inside katex.css as 4,840 bytes of base64 (+33%
			// for the encoding, and compression barely touches base64) — bytes that
			// every page carrying a formula had to download before it could paint,
			// whether or not it used a size-3 delimiter. Keeping the face a separate
			// file restores @font-face's on-demand fetch, which is the entire reason
			// these are vendored (see scripts/build-katex-css.py).
			assetsInlineLimit: (filePath) => (/\.woff2?$/.test(filePath) ? false : undefined),
		},
	},
});
