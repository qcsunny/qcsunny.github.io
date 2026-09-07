import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { BLOG_CATEGORY_KEYS, BLOG_TOPIC_KEYS } from './blog/blogMetadata';

const dateString = z
	.string()
	.min(1)
	.refine((value) => !Number.isNaN(Date.parse(value)), 'Expected a valid date string')
	.transform((value) => new Date(value));

const blog = defineCollection({
	// Load Markdown and MDX files in the `src/content/blog/` directory.
	loader: glob({ base: './src/content/blog', pattern: '**/*.{md,mdx}' }),
	// Type-check frontmatter using a schema
	schema: ({ image }) =>
		z.object({
			title: z.string(),
			description: z.string(),
			// Transform string to Date object
			pubDate: dateString,
			updatedDate: dateString.optional(),
			heroImage: z.optional(image()),
      category: z.enum(BLOG_CATEGORY_KEYS),
      topics: z.array(z.enum(BLOG_TOPIC_KEYS)).min(1).max(4),
      searchTerms: z.array(z.string().min(1)).min(1).max(12),
      contentLang: z.enum(['zh-CN', 'en']),
      relatedTools: z.array(z.string()).max(4),
      relatedPosts: z.array(z.string()).max(3),
      asOfDate: dateString.optional(),
		}),
});

export const collections = { blog };
