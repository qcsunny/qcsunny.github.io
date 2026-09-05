// @ts-check

import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { defineConfig, fontProviders } from 'astro/config';

import llmsTxt from './llms-txt.mjs';
import ogImages from './og-images.mjs';

// https://astro.build/config
export default defineConfig({
	site: 'https://qcsunny.org',
	integrations: [mdx(), sitemap(), llmsTxt(), ogImages()],
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
});
