import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { REAL_TOOLS } from '../src/tools/registry';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'dist');
const BLOG = join(ROOT, 'src/content/blog');
// Same list BlogPost.astro renders from, so a tool hidden there via `disabled`
// fails this suite instead of silently leaving a dangling relatedTools key.
const tools = REAL_TOOLS;
const toolKeys = new Set(tools.map((tool) => `${tool.category}/${tool.slug}`));
const routeOfTool = (key: string) => `/${key}/`;
const routeOfPost = (slug: string) => `/blog/${slug}/`;

function frontmatter(file: string) {
	const text = readFileSync(join(BLOG, file), 'utf8');
	const block = text.match(/^---\n([\s\S]*?)\n---/m)?.[1] ?? '';
	const readArray = (name: string) => {
		const raw = block.match(new RegExp(`^${name}:\\s*\\[([^\\]]*)\\]`, 'm'))?.[1] ?? '';
		return [...raw.matchAll(/['"]([^'"]+)['"]/g)].map((match) => match[1]);
	};
	return {
		slug: file.replace(/\.mdx?$/, ''),
		relatedTools: readArray('relatedTools'),
		relatedPosts: readArray('relatedPosts'),
	};
}

const posts = readdirSync(BLOG).filter((file) => /\.mdx?$/.test(file)).map(frontmatter);
const postSlugs = new Set(posts.map((post) => post.slug));
const htmlOf = (slug: string) => readFileSync(join(DIST, 'blog', slug, 'index.html'), 'utf8');
const hrefs = (html: string) => [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);

for (const post of posts) {
	test(`blog relations match frontmatter: ${post.slug}`, async () => {
		const html = htmlOf(post.slug);
		const relatedToolHrefs = [...html.matchAll(/<a[^>]*data-related-tool[^>]*href="([^"]+)"/g)].map((match) => match[1]);
		const relatedPostHrefs = [...html.matchAll(/<a[^>]*data-related-post[^>]*href="([^"]+)"/g)].map((match) => match[1]);
		expect(new Set(relatedToolHrefs), `${post.slug} tool links`).toEqual(
			new Set(post.relatedTools.map(routeOfTool)),
		);
		expect(new Set(relatedPostHrefs), `${post.slug} article links`).toEqual(
			new Set(post.relatedPosts.map(routeOfPost)),
		);
		if (post.relatedTools.length === 0) expect(html).not.toContain('data-related-tool');
		for (const href of [...relatedToolHrefs, ...relatedPostHrefs]) {
			expect(existsSync(join(DIST, href.slice(1), 'index.html')), `${post.slug} -> ${href}`).toBe(true);
		}
	});
}

test('frontmatter relations have no duplicate, self, or dead references', async () => {
	const errors: string[] = [];
	for (const post of posts) {
		for (const list of [post.relatedTools, post.relatedPosts]) {
			if (new Set(list).size !== list.length) errors.push(`${post.slug}: duplicate relation`);
		}
		if (post.relatedPosts.includes(post.slug)) errors.push(`${post.slug}: self relation`);
		for (const key of post.relatedTools) if (!toolKeys.has(key)) errors.push(`${post.slug}: unknown tool ${key}`);
		for (const slug of post.relatedPosts) if (!postSlugs.has(slug)) errors.push(`${post.slug}: unknown post ${slug}`);
	}
	expect(errors).toEqual([]);
});

test('tool pages render the reverse blog relation from frontmatter', async () => {
	const expected = new Map<string, string[]>();
	for (const post of posts) for (const tool of post.relatedTools) (expected.get(tool) ?? expected.set(tool, []).get(tool)!).push(post.slug);
	const errors: string[] = [];
	for (const [key, slugs] of expected) {
		const html = readFileSync(join(DIST, key, 'index.html'), 'utf8');
		const actual = hrefs(html).filter((href) => href.startsWith('/blog/')).map((href) => href.split('/')[2]);
		if (new Set(actual).size !== actual.length) errors.push(`${key}: duplicate reverse article`);
		if (new Set(actual).size !== new Set(slugs).size || actual.some((slug) => !slugs.includes(slug)))
			errors.push(`${key}: expected ${slugs.join(',')}, got ${actual.join(',')}`);
	}
	expect(errors).toEqual([]);
});
