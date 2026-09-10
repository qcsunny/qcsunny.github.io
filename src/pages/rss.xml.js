import { getCollection } from 'astro:content';
import rss from '@astrojs/rss';
import { SITE_DESCRIPTION, SITE_TITLE } from '../consts';

export async function GET(context) {
	const posts = (await getCollection('blog')).sort(
		(a, b) => b.data.pubDate.getTime() - a.data.pubDate.getTime(),
	);
	return rss({
		title: SITE_TITLE,
		description: SITE_DESCRIPTION,
		site: context.site,
		// RSS 2.0 items carry only pubDate; the item-level "this post was
		// revised" timestamp is expressed as atom:updated via customData
		// (@astrojs/rss 4.x has no native `updated` item field).
		xmlns: { atom: 'http://www.w3.org/2005/Atom' },
		items: posts.map((post) => ({
			...post.data,
			link: `/blog/${post.id}/`,
			customData: post.data.updatedDate
				? `<atom:updated>${post.data.updatedDate.toISOString()}</atom:updated>`
				: undefined,
		})),
	});
}
