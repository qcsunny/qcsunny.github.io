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
	icon: string;
	/** Badge text colour and the translucent fill behind it. Inlined per row
	    rather than fanned out into `.sm-badge-<cat>` rules, since the blog and
	    the tool categories share the `finance` key with different colours and a
	    single class rule cannot serve both. */
	color: string;
	tint: string;
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
	items: SearchItem[];
	categories: SearchCategory[];
	copy: SearchCopy;
}
