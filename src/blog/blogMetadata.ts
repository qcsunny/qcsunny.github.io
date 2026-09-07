import { REAL_TOOLS, REGISTRY, type ToolCategory } from "../tools/registry";

export interface BlogCategoryDefinition {
  key: string;
  labelEn: string;
  labelZh: string;
  color: string;
  tint: string;
}

export const BLOG_CATEGORIES = [
  {
    key: "finance",
    labelEn: "Finance & Math",
    labelZh: "金融与数学",
    color: "#10b981",
    tint: "rgba(16,185,129,0.15)",
  },
  {
    key: "math",
    labelEn: "Math & Statistics",
    labelZh: "数学与统计",
    color: "#8b5cf6",
    tint: "rgba(139,92,246,0.15)",
  },
  {
    key: "algorithms",
    labelEn: "Algorithms",
    labelZh: "算法",
    color: "#06b6d4",
    tint: "rgba(6,182,212,0.15)",
  },
  {
    key: "web",
    labelEn: "Web Craft",
    labelZh: "前端与工具研发",
    color: "#f59e0b",
    tint: "rgba(245,158,11,0.15)",
  },
  {
    key: "engineering",
    labelEn: "Engineering",
    labelZh: "工程实践",
    color: "#3b82f6",
    tint: "rgba(59,130,246,0.15)",
  },
  {
    key: "security",
    labelEn: "Security & Privacy",
    labelZh: "安全与隐私",
    color: "#ef4444",
    tint: "rgba(239,68,68,0.15)",
  },
  {
    key: "ai",
    labelEn: "AI & LLM",
    labelZh: "AI 与大模型",
    color: "#ec4899",
    tint: "rgba(236,72,153,0.15)",
  },
  {
    key: "productivity",
    labelEn: "Productivity",
    labelZh: "效率工具",
    color: "#14b8a6",
    tint: "rgba(20,184,166,0.15)",
  },
] satisfies BlogCategoryDefinition[];

export type BlogCategory = (typeof BLOG_CATEGORIES)[number]["key"];
export const BLOG_CATEGORY_KEYS = BLOG_CATEGORIES.map(
  (category) => category.key,
) as [BlogCategory, ...BlogCategory[]];

export const BLOG_TOPICS = [
  "finance",
  "investing",
  "loans",
  "taxes",
  "mathematics",
  "statistics",
  "algorithms",
  "numerical-computing",
  "frontend",
  "web-platform",
  "developer-tools",
  "security",
  "cryptography",
  "databases",
  "performance",
  "static-sites",
  "ai",
  "llm",
  "date-time",
  "unit-conversion",
] as const;
export type BlogTopic = (typeof BLOG_TOPICS)[number];
export const BLOG_TOPIC_KEYS = BLOG_TOPICS as unknown as [
  BlogTopic,
  ...BlogTopic[],
];

export interface BlogMetadata {
  slug: string;
  category: BlogCategory;
  topics: BlogTopic[];
  searchTerms: string[];
  contentLang: "zh-CN" | "en";
  relatedTools: string[];
  relatedPosts: string[];
}

export const BLOG_TOOL_KEYS = new Set(
  REAL_TOOLS.map((tool) => `${tool.category}/${tool.slug}`),
);
export const BLOG_ARTICLE_LIMITS = {
  topics: 4,
  searchTerms: 12,
  relatedTools: 4,
  relatedPosts: 3,
} as const;

export function findBlogCategory(key: string) {
  return BLOG_CATEGORIES.find((category) => category.key === key);
}

export function getBlogCategory(key: string): (typeof BLOG_CATEGORIES)[number] {
  const category = findBlogCategory(key);
  if (!category) throw new Error(`Unknown blog category: ${key}`);
  return category;
}

export function readingMinutes(body: string): number {
  const words = body.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)?.length ?? 0;
  const cjk = body.match(/[\p{Script=Han}]/gu)?.length ?? 0;
  return Math.max(1, Math.round((words - cjk) / 220 + cjk / 400));
}

export const calculateReadingTime = readingMinutes;

function duplicates(values: readonly string[]) {
  return values.filter((value, index) => values.indexOf(value) !== index);
}

export interface RelationValidationInput extends Omit<BlogMetadata, "slug"> {
  slug: string;
}

export interface RelationValidationOptions {
  articleSlugs?: Iterable<string>;
  toolKeys?: Iterable<string>;
}

export function validateBlogRelations(
  post: RelationValidationInput,
  options: RelationValidationOptions = {},
): string[] {
  const errors: string[] = [];
  const articleSlugs = new Set(options.articleSlugs ?? []);
  const toolKeys = new Set(options.toolKeys ?? BLOG_TOOL_KEYS);
  if (!findBlogCategory(post.category))
    errors.push(`unknown category: ${post.category}`);
  if (post.topics.length < 1 || post.topics.length > BLOG_ARTICLE_LIMITS.topics)
    errors.push(`topics must contain 1-${BLOG_ARTICLE_LIMITS.topics} items`);
  if (
    post.searchTerms.length < 1 ||
    post.searchTerms.length > BLOG_ARTICLE_LIMITS.searchTerms
  )
    errors.push(
      `searchTerms must contain 1-${BLOG_ARTICLE_LIMITS.searchTerms} items`,
    );
  if (post.relatedTools.length > BLOG_ARTICLE_LIMITS.relatedTools)
    errors.push(
      `relatedTools must contain at most ${BLOG_ARTICLE_LIMITS.relatedTools} items`,
    );
  if (post.relatedPosts.length > BLOG_ARTICLE_LIMITS.relatedPosts)
    errors.push(
      `relatedPosts must contain at most ${BLOG_ARTICLE_LIMITS.relatedPosts} items`,
    );
  for (const field of [
    "topics",
    "searchTerms",
    "relatedTools",
    "relatedPosts",
  ] as const) {
    const repeated = duplicates(post[field]);
    if (repeated.length)
      errors.push(`${field} contains duplicates: ${repeated.join(", ")}`);
  }
  for (const topic of post.topics)
    if (!BLOG_TOPICS.includes(topic as BlogTopic))
      errors.push(`unknown topic: ${topic}`);
  for (const key of post.relatedTools) {
    const entry = REGISTRY.find(
      (tool) => `${tool.category}/${tool.slug}` === key,
    );
    if (!toolKeys.has(key) || entry?.kind === "redirect")
      errors.push(`unknown or redirect tool: ${key}`);
  }
  for (const slug of post.relatedPosts) {
    if (slug === post.slug) errors.push(`self-link in relatedPosts: ${slug}`);
    if (articleSlugs.size && !articleSlugs.has(slug))
      errors.push(`unknown related post: ${slug}`);
  }
  return errors;
}

export function assertBlogRelations(
  posts: readonly RelationValidationInput[],
  options: RelationValidationOptions = {},
): void {
  const articleSlugs = new Set(
    options.articleSlugs ?? posts.map((post) => post.slug),
  );
  const errors = posts.flatMap((post) =>
    validateBlogRelations(post, { ...options, articleSlugs }).map(
      (error) => `${post.slug}: ${error}`,
    ),
  );
  if (errors.length)
    throw new Error(`Invalid blog metadata:\n${errors.join("\n")}`);
}

export interface BlogReverseIndex {
  byTool: Record<string, string[]>;
  byPost: Record<string, string[]>;
}

export function buildBlogReverseIndexes(
  posts: readonly RelationValidationInput[],
): BlogReverseIndex {
  const byTool: Record<string, string[]> = {};
  const byPost: Record<string, string[]> = {};
  for (const post of posts) {
    for (const tool of post.relatedTools) (byTool[tool] ??= []).push(post.slug);
    for (const related of post.relatedPosts)
      (byPost[related] ??= []).push(post.slug);
  }
  return { byTool, byPost };
}

export const buildReverseIndexes = buildBlogReverseIndexes;

export function blogCategoryToToolCategory(
  category: BlogCategory,
): ToolCategory | undefined {
  return category === "finance"
    ? "finance"
    : category === "math"
      ? "calculators"
      : undefined;
}
