// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { chromium } from '@playwright/test';

const BLOG_DIR = path.resolve('src/content/blog');
const CACHE_DIR = path.resolve('.cache/mermaid');

// Ensure cache dir exists
if (!fs.existsSync(CACHE_DIR)) {
	fs.mkdirSync(CACHE_DIR, { recursive: true });
}

/**
 * Scan all markdown files in src/content/blog, find all ```mermaid blocks,
 * and return array of { code, hash, file }
 */
export function findMermaidDiagrams() {
	if (!fs.existsSync(BLOG_DIR)) return [];
	const files = fs.readdirSync(BLOG_DIR).filter((f) => f.endsWith('.md') || f.endsWith('.mdx'));
	/** @type {{ code: string, hash: string, file: string }[]} */
	const diagrams = [];

	for (const file of files) {
		const filePath = path.join(BLOG_DIR, file);
		const content = fs.readFileSync(filePath, 'utf8');
		const matches = content.matchAll(/^```mermaid\r?\n([\s\S]*?)^```[ \t]*$/gm);
		for (const m of matches) {
			const code = m[1].trim();
			const hash = crypto.createHash('sha256').update(code).digest('hex').slice(0, 16);
			diagrams.push({ code, hash, file });
		}
	}
	return diagrams;
}

export async function renderAllDiagrams() {
	const diagrams = findMermaidDiagrams();
	if (diagrams.length === 0) {
		console.log('[diagrams] No mermaid diagrams found in blog posts.');
		return;
	}

	const missing = diagrams.filter((d) => !fs.existsSync(path.join(CACHE_DIR, `${d.hash}.svg`)));
	if (missing.length === 0) {
		console.log(`[diagrams] All ${diagrams.length} diagram(s) up to date in cache.`);
		return;
	}

	console.log(`[diagrams] Rendering ${missing.length} new/changed diagram(s)...`);

	const mermaidDist = path.resolve('node_modules/mermaid/dist/mermaid.min.js');
	if (!fs.existsSync(mermaidDist)) {
		throw new Error('mermaid package not found. Run npm i -D mermaid');
	}
	const mermaidCode = fs.readFileSync(mermaidDist, 'utf8');

	/** @type {string | undefined} */
	let executablePath = undefined;
	const cacheBase = path.join(process.env.HOME || '', '.cache/ms-playwright');
	if (fs.existsSync(cacheBase)) {
		const entries = fs.readdirSync(cacheBase);
		for (const entry of entries) {
			const cand1 = path.join(cacheBase, entry, 'chrome-linux64/chrome');
			if (fs.existsSync(cand1)) { executablePath = cand1; break; }
			const cand2 = path.join(cacheBase, entry, 'chrome-headless-shell-linux64/chrome-headless-shell');
			if (fs.existsSync(cand2)) { executablePath = cand2; break; }
		}
	}

	let browser;
	try {
		browser = await chromium.launch({
			...(executablePath ? { executablePath } : {}),
			args: ['--no-sandbox', '--disable-setuid-sandbox', '--headless=new'],
		});
	} catch (err) {
		console.warn(`[diagrams] Chromium not available locally (${/** @type {Error} */ (err).message.split('\n')[0]}).`);
		console.warn(`[diagrams] Skipping local rendering. Diagrams will be rendered into SVG automatically by cloud CI on push.`);
		return;
	}
	const page = await browser.newPage();
	await page.setContent(`<!DOCTYPE html><html><head><script>${mermaidCode}</script></head><body></body></html>`);

	for (let i = 0; i < missing.length; i++) {
		const { code, hash, file } = missing[i];
		try {
			const svg = await page.evaluate(async ({ id, code }) => {
				// @ts-ignore
				window.mermaid.initialize({
					startOnLoad: false,
					theme: 'default',
					securityLevel: 'loose',
				});
				// @ts-ignore
				const res = await window.mermaid.render(id, code);
				return res.svg;
			}, { id: `m_${hash}`, code });

			fs.writeFileSync(path.join(CACHE_DIR, `${hash}.svg`), svg, 'utf8');
			console.log(`[diagrams] (${i + 1}/${missing.length}) Rendered diagram for ${file} [${hash}]`);
		} catch (err) {
			console.error(`[diagrams] Failed to render diagram in ${file}:`, err);
		}
	}

	await browser.close();
	console.log(`[diagrams] Finished rendering diagrams.`);
}

// If run directly:
if (process.argv[1] === new URL(import.meta.url).pathname) {
	renderAllDiagrams().catch((err) => {
		console.error(err);
		process.exit(1);
	});
}
