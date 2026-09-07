import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(file);
    return /\.mdx?$/.test(entry.name) ? [file] : [];
  });
}

export function listBlogFiles(blogDir) {
  return walk(blogDir).sort();
}

export function normalizeBlogFrontmatter(value, file = "<frontmatter>") {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Blog frontmatter must be a mapping: ${file}`);
  }
  const data = { ...value };
  for (const field of ["title", "description"]) {
    if (typeof data[field] !== "string" || !data[field].trim()) {
      throw new Error(
        `Blog frontmatter ${field} must be a non-empty string: ${file}`,
      );
    }
    data[field] = data[field].trim();
  }
  if (typeof data.pubDate !== "string") {
    throw new Error(`Blog frontmatter pubDate must be a date string: ${file}`);
  }
  const pubDate = data.pubDate.trim();
  if (!pubDate || Number.isNaN(Date.parse(pubDate))) {
    throw new Error(`Blog frontmatter pubDate is invalid: ${file}`);
  }
  data.pubDate = pubDate;
  for (const field of ["updatedDate", "asOfDate"]) {
    if (data[field] === undefined) continue;
    if (
      typeof data[field] !== "string" ||
      !data[field].trim() ||
      Number.isNaN(Date.parse(data[field]))
    ) {
      throw new Error(
        `Blog frontmatter ${field} must be a valid date string: ${file}`,
      );
    }
    data[field] = data[field].trim();
  }
  return data;
}

export function parseBlogFrontmatter(file) {
  const source = fs.readFileSync(file, "utf8");
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return {};
  return normalizeBlogFrontmatter(parse(match[1]), file);
}

export function readBlogFrontmatter(blogDir) {
  return listBlogFiles(blogDir).map((file) => ({
    file,
    slug: path
      .relative(blogDir, file)
      .replaceAll(path.sep, "/")
      .replace(/\.mdx?$/, ""),
    data: parseBlogFrontmatter(file),
  }));
}
