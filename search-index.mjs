// Generate the external search indexes at build time: /search-index.json (the
// tool registry) and /search-blog.json (the blog collection). They replaced the
// payload that used to be inlined into every page's HTML via define:vars —
// 17.2 KB brotli on every page at 84 tools — so a multi-page visit now
// downloads the index once per deployment (long-cached in _headers) instead of
// once per page. The search UIs fetch these on open and warm them during
// browser idle time, keeping first-keystroke latency and offline search intact.
//
// Wired in astro.config.mjs as a local integration, same pattern as llms-txt.mjs.
//
// Row shape is positional (identical order in every consumer): [href, name,
// nameZh, desc, descZh, category, keywords, slug] — the object keys are what
// brotli cannot compress away, and 84 × 8 repeated key names cost real bytes.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readBlogFrontmatter } from './scripts/lib/blog-frontmatter.mjs';
import { BLOG_CATEGORIES, getBlogCategory } from './src/blog/blogMetadata';
import { getAllSearchItems } from './src/tools/registry';

const root = path.dirname(fileURLToPath(import.meta.url));

function toolIndex() {
	return getAllSearchItems().map((t) => [
		t.href,
		t.name,
		t.nameZh || '',
		// Descriptions are capped at 120 code points: the modal result card
		// shows two lines and search relevance ranks slug/name/keywords first,
		// so the tail of a 200-char description costs budget without earning
		// either display or matching. The registry keeps the full text.
		truncate(t.description),
		t.descriptionZh ? truncate(t.descriptionZh) : '',
		t.category,
		t.keywords || '',
		t.slug,
	]);
}

// Mirrors buildBlogSearchConfig (src/components/tools/blogSearchConfig.ts):
// same fields, same keyword assembly, only the generation site moved. The
// titles are single-language (the post's own), so name and nameZh match — and
// desc/descZh likewise, so the descZh slot ships empty (the modal's rehydration
// falls back to desc) instead of paying twice for the same paragraph.
function blogIndex() {
	const blogDir = path.join(root, 'src/content/blog');
	return readBlogFrontmatter(blogDir)
		.map(({ slug, data }) => {
			const cat = getBlogCategory(data.category);
			return {
				slug,
				data,
				keywords: [data.topics.join(' '), data.searchTerms.join(' '), cat.labelEn, cat.labelZh].join(' '),
				category: cat.key,
			};
		})
		.sort((a, b) => Date.parse(b.data.pubDate) - Date.parse(a.data.pubDate))
		.map(({ slug, data, keywords, category }) => [
			`/blog/${slug}/`,
			data.title,
			data.title,
			data.description,
			'',
			category,
			keywords,
			slug,
		]);
}

/** Cap a description at 120 code points, cutting on the last space when
 *  there is one (Latin text) so words survive; CJK needs no space. */
function truncate(text) {
	if ([...text].length <= 120) return text;
	const cut = [...text].slice(0, 120).join('');
	const sp = cut.lastIndexOf(' ');
	return (sp > 80 ? cut.slice(0, sp) : cut) + '…';
}

export default function searchIndex() {
	return {
		name: 'search-index',
		hooks: {
			'astro:build:done': ({ logger, dir }) => {
				const out = dir.pathname;
				const tools = toolIndex();
				const posts = blogIndex();
				fs.writeFileSync(
					path.join(out, 'search-index.json'),
					JSON.stringify({ v: 1, rows: tools, cats: BLOG_CATEGORIES }),
				);
				fs.writeFileSync(
					path.join(out, 'search-blog.json'),
					JSON.stringify({ v: 1, rows: posts, cats: BLOG_CATEGORIES }),
				);
				logger.info(`search indexes generated (${tools.length} tools, ${posts.length} posts)`);
			},
		},
	};
}
