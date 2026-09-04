// Place any global data in this file. You can import this data from anywhere in your site with the `import` keyword.

export const SITE_TITLE = 'QCSunny Lab';
export const SITE_DESCRIPTION =
	'个人博客与免费在线工具集：科学计算器、单位换算、复利与房贷计算、二维码生成器等 34 个纯浏览器端工具。Free browser-based tools: calculators, converters, finance helpers and more.';

/** Cloudflare Web Analytics beacon token — create a free account at
 *  dash.cloudflare.com, add the site, then paste the token here. Empty = off. */
export const CF_ANALYTICS_TOKEN = '6dc1c25712424a5495eafb07d9e2ed82';

/** Google Search Console ownership-verification code (the content value of
 *  the <meta name="google-site-verification"> tag). Get it at
 *  search.google.com/search-console → Add property → URL prefix → HTML tag.
 *  Empty = the meta tag is not rendered. */
export const SEARCH_CONSOLE_VERIFICATION = '5nFbYmHtHutBfgGNWpFnIwAyFKrHJM9eRtugU3113EI';

/** Bing Webmaster Tools ownership-verification code (the content value of
 *  the <meta name="msvalidate.01"> tag). Get it at bing.com/webmasters →
 *  Add site → Meta tag. Empty = the meta tag is not rendered. */
export const BING_VERIFICATION = '8CC3DB3923EC9481C31FA85EA02C4E67';

/** Baidu Webmaster Tools verification code (the content value of
 *  the <meta name="baidu-site-verification"> tag). Empty = not rendered. */
export const BAIDU_VERIFICATION = '';

/** IndexNow key for instant Bing / Yandex / Naver indexing API */
export const INDEXNOW_KEY = '5a68d90471c64eb3be0953ef82bc5951';

/** Google AdSense publisher id (ca-pub-XXXX). Fill in after AdSense approval;
 *  empty = no ad slots are rendered anywhere on the site. */
export const ADSENSE_CLIENT = '';

/** AdSense ad-unit ids created in the AdSense dashboard. A slot stays hidden
 *  until its id is filled in. Fixed heights are reserved in CSS so loading an
 *  ad never shifts the layout (CLS). */
export const AD_SLOTS = {
	/** below the tool, above the editorial content */
	mid: '',
	/** end of page, above the footer */
	bottom: '',
};
