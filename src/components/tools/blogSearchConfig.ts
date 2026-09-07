import type { CollectionEntry } from 'astro:content';
import type { SearchCategory, SearchConfig } from './SearchTypes';

// The blog list and a single article page both put the Header's search button
// over the blog collection, so both need the same index. Kept in one module
// rather than duplicated across the two files — otherwise the list page and
// the reading page could drift apart about what "金融" means.
//
// Category is inferred from the slug (the frontmatter carries no category
// field), so getBlogCategory travels with this config: the list page already
// used it for the card's data-cat and data-search attributes.

// The labels match what the article cards already print (金融与数学, not 金融),
// so a card and its own search badge never describe the same post differently.
export const BLOG_CATEGORIES: SearchCategory[] = [
	{ key: 'finance', labelEn: 'Finance & Math', labelZh: '金融与数学', icon: '💰', color: '#10b981', tint: 'rgba(16,185,129,0.15)' },
	{ key: 'architecture', labelEn: 'Architecture', labelZh: '架构与数据库', icon: '🏗️', color: '#6366f1', tint: 'rgba(99,102,241,0.15)' },
	{ key: 'ai', labelEn: 'AI & LLM', labelZh: 'AI 与大模型', icon: '🤖', color: '#ec4899', tint: 'rgba(236,72,153,0.15)' },
	{ key: 'web', labelEn: 'Web Craft', labelZh: '前端与工具研发', icon: '🌐', color: '#f59e0b', tint: 'rgba(245,158,11,0.15)' },
];

const CAT_BY_KEY = new Map(BLOG_CATEGORIES.map((c) => [c.key, c]));

export function getBlogCategory(slug: string): SearchCategory {
	if (
		slug.includes('compound') ||
		slug.includes('mortgage') ||
		slug.includes('tax') ||
		slug.includes('bonus') ||
		slug.includes('irr') ||
		slug.includes('installment') ||
		slug.includes('fire') ||
		slug.includes('finance')
	) {
		return CAT_BY_KEY.get('finance')!;
	}
	if (slug.includes('uuid') || slug.includes('database')) {
		return CAT_BY_KEY.get('architecture')!;
	}
	if (slug.includes('glm') || slug.includes('ai')) {
		return CAT_BY_KEY.get('ai')!;
	}
	return CAT_BY_KEY.get('web')!;
}

export function buildBlogSearchConfig(posts: CollectionEntry<'blog'>[]): SearchConfig {
	const items = posts.map((post) => {
		const cat = getBlogCategory(post.id);
		return {
			href: `/blog/${post.id}/`,
			slug: post.id,
			name: post.data.title,
			nameZh: post.data.title,
			desc: post.data.description,
			descZh: post.data.description,
			category: cat.key,
			// The slug and both category labels are folded into the searchable
			// text, so typing "irr" or "架构" finds the article either way.
			keywords: `${cat.labelEn} ${cat.labelZh}`,
		};
	});

	const count = items.length;
	return {
		items,
		categories: BLOG_CATEGORIES,
		copy: {
			placeholderEn: `Search ${count} articles (title, topic, category)...`,
			placeholderZh: '搜索文章（标题、主题、分类，如 房贷、日历、复利）...',
			emptyHintEn: 'Try searching with "compound", "uuid", "calendar", "glm"',
			emptyHintZh: '可尝试搜索："复利"、"UUID"、"日历"、"GLM"等',
			footerLinkHref: '/blog/',
			footerLinkEn: 'All articles ➔',
			footerLinkZh: '前往全部文章 ➔',
			btnAriaEn: 'Search articles (shortcut /)',
			btnAriaZh: '搜索文章 (快捷键 /)',
			btnTitleEn: 'Search articles (/ or Ctrl+K)',
			btnTitleZh: '搜索文章 (快捷键 / 或 Ctrl+K)',
		},
	};
}
