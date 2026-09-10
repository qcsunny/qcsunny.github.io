import type { CollectionEntry } from 'astro:content';
import {
	BLOG_CATEGORIES as BLOG_CATEGORY_DEFINITIONS,
	getBlogCategory,
} from '../../blog/blogMetadata';
import type { SearchCategory, SearchConfig } from './SearchTypes';

// Category is explicit frontmatter metadata. The slug remains the stable route
// identifier, while the category travels with the collection entry into search
// and card rendering. The related fields become the recommendation source in
// PR3; this module only exposes category and authored search terms.
export const BLOG_CATEGORIES: SearchCategory[] = BLOG_CATEGORY_DEFINITIONS.map(
	(category) => ({ ...category }),
);

export function buildBlogSearchConfig(posts: CollectionEntry<'blog'>[]): SearchConfig {
	const items = posts.map((post) => {
		const cat = getBlogCategory(post.data.category);
		return {
			href: `/blog/${post.id}/`,
			slug: post.id,
			name: post.data.title,
			nameZh: post.data.title,
			desc: post.data.description,
			descZh: post.data.description,
			category: cat.key,
			keywords: [
				post.data.topics.join(' '),
				post.data.searchTerms.join(' '),
				cat.labelEn,
				cat.labelZh,
			].join(' '),
		};
	});

	const count = items.length;
	return {
		// items only feed the server-rendered pills/counts; the searchable rows
		// come from /search-blog.json at runtime (search-index.mjs builds it
		// with the same field assembly as the items below).
		indexUrl: '/search-blog.json',
		items,
		categories: BLOG_CATEGORIES,
		copy: {
			placeholderEn: `Search ${count} articles (title, topic, category)...`,
			placeholderZh: '搜索文章（标题、主题、分类，如 房贷、日历、复利）...',
			emptyHintEn: 'Try searching with "compound", "uuid", "calendar", "glm"',
			emptyHintZh: '可尝试搜索：“复利”、“UUID”、“日历”、“GLM”等',
			footerLinkHref: '/blog/',
			footerLinkEn: 'All articles',
			footerLinkZh: '前往全部文章',
			btnAriaEn: 'Search articles (shortcut /)',
			btnAriaZh: '搜索文章 (快捷键 /)',
			btnTitleEn: 'Search articles (/ or Ctrl+K)',
			btnTitleZh: '搜索文章 (快捷键 / 或 Ctrl+K)',
		},
	};
}
