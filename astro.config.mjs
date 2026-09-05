// @ts-check

import mdx from '@astrojs/mdx';
import { satteri } from '@astrojs/markdown-satteri';
import sitemap from '@astrojs/sitemap';
import { defineConfig, fontProviders } from 'astro/config';

import llmsTxt from './llms-txt.mjs';
import ogImages from './og-images.mjs';
import satteriKatex from './satteri-katex.mjs';

// https://astro.build/config
export default defineConfig({
	site: 'https://qcsunny.org',
	integrations: [mdx(), sitemap(), llmsTxt(), ogImages()],
	markdown: {
		// Sätteri parses maths only when asked; satteri-katex.mjs then renders it
		// to finished markup during the build, so the browser gets plain HTML and
		// no KaTeX JavaScript at all. This replaced a runtime loader that pulled
		// three files from cdn.jsdelivr.net on every post containing a `$`, which
		// left every formula on the site dependent on a third party staying up.
		//
		// Passing satteri() explicitly keeps Astro's own defaults (gfm and smart
		// punctuation on) — only the `math` feature is added.
		processor: satteri({
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
