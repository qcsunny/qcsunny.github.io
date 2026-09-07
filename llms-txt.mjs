// Generate /llms.txt at build time from the tool registry and blog frontmatter
// (replaces the hand-maintained public/llms.txt that kept going stale).
// Wired in astro.config.mjs as a local integration; runs in astro:build:done
// and writes into dist/, so the output never needs manual syncing.
//
// Blog titles/descriptions are parsed from frontmatter with a minimal reader
// (single-line `'quoted'` or plain values cover every post in src/content/blog).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readBlogFrontmatter } from './scripts/lib/blog-frontmatter.mjs';
import { CATEGORIES, REAL_TOOLS } from './src/tools/registry.ts';

const SITE = 'https://qcsunny.org';

function render() {
	// REAL_TOOLS = CALCULATOR_FEATURED + REGISTRY minus the redirect stubs.
	const tools = REAL_TOOLS;
	const count = tools.length;

	const lines = [];
	lines.push('# QCSunny Lab');
	lines.push('');
	lines.push(
		`> QCSunny Lab (${SITE}) is a personal developer technical blog and collection of ${count} free, browser-based online tools. All tools execute entirely client-side with zero tracking, offline capability, and zero data uploads.`,
	);
	lines.push('');
	lines.push('## Online Tools');

	// Registry order is: calculators, converters, finance, text, generators,
	// widgets. Group by the CATEGORIES order for a stable, human-logical layout.
	for (const cat of CATEGORIES) {
		const group = tools.filter((t) => t.category === cat.id);
		if (group.length === 0) continue;
		lines.push('');
		lines.push(`### ${cat.label}`);
		for (const t of group) {
			lines.push(
				`- [${t.name}](${SITE}/${t.category}/${t.slug}/): ${t.description}`,
			);
		}
	}

	const blogDir = path.join(
		path.dirname(fileURLToPath(import.meta.url)),
		'src/content/blog',
	);
	const posts = readBlogFrontmatter(blogDir)
		.map(({ slug, data }) => ({ slug, data }))
		.sort((a, b) => Date.parse(b.data.pubDate) - Date.parse(a.data.pubDate));

	if (posts.length > 0) {
		lines.push('');
		lines.push('## Engineering Blog');
		for (const post of posts) {
			lines.push(`- [${post.data.title}](${SITE}/blog/${post.slug}/): ${post.data.description}`);
		}
	}

	return lines.join('\n') + '\n';
}

export default function llmsTxt() {
	return {
		name: 'llms-txt',
		hooks: {
			'astro:build:done': ({ logger, dir }) => {
				const text = render();
				fs.writeFileSync(path.join(dir.pathname, 'llms.txt'), text);
				const tools = (text.match(/^- \[/gm) ?? []).length;
				const posts = (text.match(/\/blog\//g) ?? []).length;
				logger.info(`llms.txt generated (${tools - posts} tools, ${posts} posts)`);
			},
		},
	};
}
