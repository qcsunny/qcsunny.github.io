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

import { CALCULATOR_FEATURED, CATEGORIES, REGISTRY } from './src/tools/registry.ts';

const SITE = 'https://qcsunny.org';

function frontmatter(file) {
	const md = fs.readFileSync(file, 'utf8');
	const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---/);
	const out = {};
	if (!m) return out;
	for (const line of m[1].split(/\r?\n/)) {
		const kv = line.match(/^([A-Za-z]+):\s*(.*)$/);
		if (!kv) continue;
		out[kv[1]] = kv[2].replace(/^['"](.*)['"]$/, '$1').trim();
	}
	return out;
}

function render() {
	const tools = [
		...CALCULATOR_FEATURED,
		...REGISTRY.filter((e) => e.kind !== 'redirect'),
	];
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
	const posts = fs
		.readdirSync(blogDir)
		.filter((f) => /\.mdx?$/.test(f))
		.map((f) => ({ fm: frontmatter(path.join(blogDir, f)), file: f }))
		.filter((p) => p.fm.title)
		.sort((a, b) => (b.fm.pubDate ?? '').localeCompare(a.fm.pubDate ?? ''));

	if (posts.length > 0) {
		lines.push('');
		lines.push('## Engineering Blog');
		for (const p of posts) {
			const slug = p.file.replace(/\.mdx?$/, '');
			lines.push(`- [${p.fm.title}](${SITE}/blog/${slug}/): ${p.fm.description}`);
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
