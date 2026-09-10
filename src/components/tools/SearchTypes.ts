// The data-driven shape behind the site-wide search overlay, shared by
// ToolSearchModal (which renders the panel) and Header (which renders the
// trigger button and forwards the config). Kept as plain data so a page can
// hand the overlay anything searchable — the tool registry by default, the
// blog collection on the blog pages — without either component knowing about
// the other.

export interface SearchItem {
	href: string;
	name: string;
	nameZh?: string;
	desc: string;
	descZh?: string;
	category: string;
	icon?: string;
	keywords?: string;
	slug?: string;
}

export interface SearchCategory {
	key: string;
	labelEn: string;
	labelZh: string;
	/** Retained for the haystack and any future visual use, but no longer
	    rendered: the redesigned rows carry a plain dim text label instead of
	    per-category icon/colour chips. */
	icon?: string;
	color?: string;
	tint?: string;
}

export interface SearchCopy {
	placeholderEn: string;
	placeholderZh: string;
	emptyHintEn: string;
	emptyHintZh: string;
	footerLinkHref: string;
	footerLinkEn: string;
	footerLinkZh: string;
	/** The Header trigger's a11y strings, which must name whatever is being
	    searched — "Search tools" on a tool page, "Search articles" on the blog. */
	btnAriaEn: string;
	btnAriaZh: string;
	btnTitleEn: string;
	btnTitleZh: string;
}

export interface SearchConfig {
	/** The externally generated index this page's modal fetches (see
	 *  search-index.mjs). Rows are positional: [href, name, nameZh, desc,
	 *  descZh, category, keywords, slug]. Defaults to the tool index. */
	indexUrl?: string;
	/** Rows for the server-rendered pills/counts only; the searchable payload
	 *  comes from indexUrl at runtime. */
	items: SearchItem[];
	categories: SearchCategory[];
	copy: SearchCopy;
}
