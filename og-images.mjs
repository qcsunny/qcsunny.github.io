// Generate a 1200x630 social share card per blog post at build time.
// Wired in astro.config.mjs; runs in astro:build:done and writes dist/og/<slug>.png,
// so no binaries are committed and titles never go out of sync.
//
// Cards are composed as SVG and rasterized with sharp (already a dependency via
// Astro's image pipeline). Text is wrapped manually — SVG has no auto-wrap —
// using a width estimate that treats CJK as full-width and ASCII as ~0.55em.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const W = 1200;
const H = 630;
// Brand tokens from src/styles/global.css (dark palette)
const BG = '#0f1116';
const FG = '#e8e8ec';
const ACCENT = '#8091ff';
const DIM = '#9aa0ab';
// The only :lang=zh font on the build image; ASCII falls back cleanly.
const FONT = 'Droid Sans Fallback, DejaVu Sans, sans-serif';

const esc = (s) =>
	s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');

/** Approximate rendered width in em units. CJK/fullwidth ≈ 1, ASCII ≈ 0.55. */
function emWidth(text) {
	let w = 0;
	for (const ch of text) {
		w += /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/.test(ch)
			? 1
			: 0.55;
	}
	return w;
}

// 禁则处理: these may not open a line, so they stay glued to the previous one.
const NO_LINE_START = /^[？！。，、；：）】」』〉》”’%.,!?:;)\]}]/;

/**
 * Greedy wrap into at most maxLines lines of at most maxEm width.
 * Returns { lines, truncated } — truncated means text had to be dropped.
 */
function wrap(text, maxEm, maxLines) {
	const lines = [];
	let line = '';
	// Break on CJK boundaries and ASCII spaces alike.
	const tokens = text.match(/[⺀-￦]|[^\s⺀-￦]+\s*/g) ?? [text];
	for (const tk of tokens) {
		// Punctuation that cannot open a line overflows instead of wrapping.
		if (emWidth(line + tk) > maxEm && line && !NO_LINE_START.test(tk)) {
			lines.push(line.trimEnd());
			line = tk.trimStart();
			if (lines.length === maxLines) break;
		} else {
			line += tk;
		}
	}
	const truncated = lines.length === maxLines;
	if (!truncated && line.trim()) lines.push(line.trimEnd());
	if (truncated) {
		// Ellipsize the last line, leaving room for the … itself.
		let last = lines[maxLines - 1];
		while (last.length > 1 && emWidth(last) > maxEm - 1) last = last.slice(0, -1);
		lines[maxLines - 1] = last.replace(/[\s，、。：；,.:;]+$/, '') + '…';
	}
	return { lines, truncated };
}

function card({ title, description, date }) {
	// Fit the title into at most 3 lines, shrinking the type before truncating.
	let size = 60;
	let fit = wrap(title, (W - 200) / size, 3);
	while (fit.truncated && size > 38) {
		size -= 4;
		fit = wrap(title, (W - 200) / size, 3);
	}
	const lineH = Math.round(size * 1.32);

	// The title is top-anchored and the description bottom-anchored above the
	// footer row, so even a 3-line title can never collide with it.
	const titleTop = 216;
	const titleSpans = fit.lines
		.map(
			(l, i) =>
				`<text x="100" y="${titleTop + i * lineH}" font-family="${FONT}" font-size="${size}" font-weight="700" fill="${FG}">${esc(l)}</text>`,
		)
		.join('\n');

	const descLines = description ? wrap(description, (W - 200) / 24, 2).lines : [];
	const descTop = H - 134 - (descLines.length - 1) * 36;
	const descSpans = descLines
		.map(
			(l, i) =>
				`<text x="100" y="${descTop + i * 36}" font-family="${FONT}" font-size="24" fill="${DIM}">${esc(l)}</text>`,
		)
		.join('\n');

	return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
	<defs>
		<linearGradient id="glow" x1="0" y1="0" x2="1" y2="1">
			<stop offset="0%" stop-color="${ACCENT}" stop-opacity="0.20"/>
			<stop offset="55%" stop-color="${ACCENT}" stop-opacity="0.04"/>
			<stop offset="100%" stop-color="${BG}" stop-opacity="0"/>
		</linearGradient>
	</defs>
	<rect width="${W}" height="${H}" fill="${BG}"/>
	<rect width="${W}" height="${H}" fill="url(#glow)"/>
	<rect x="0" y="0" width="14" height="${H}" fill="${ACCENT}"/>
	<circle cx="1080" cy="120" r="180" fill="${ACCENT}" opacity="0.07"/>

	<circle cx="108" cy="82" r="7" fill="#10b981"/>
	<text x="128" y="90" font-family="${FONT}" font-size="25" font-weight="700" fill="${FG}">QCSunny Lab</text>
	<text x="100" y="${H - 56}" font-family="${FONT}" font-size="23" fill="${ACCENT}">qcsunny.org</text>
	${date ? `<text x="${W - 100}" y="${H - 56}" text-anchor="end" font-family="${FONT}" font-size="23" fill="${DIM}">${esc(date)}</text>` : ''}

	${titleSpans}
	${descSpans}
</svg>`;
}

function frontmatter(file) {
	const md = fs.readFileSync(file, 'utf8');
	const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---/);
	const out = {};
	if (!m) return out;
	for (const line of m[1].split(/\r?\n/)) {
		const kv = line.match(/^([A-Za-z]+):\s*(.*)$/);
		if (!kv) continue;
		out[kv[1]] = kv[2].replace(/^['"](.*)['"]$/, '$1').trim();
	}
	return out;
}

/**
 * libvips renders text through fontconfig, so a build image without a CJK font
 * would silently emit cards full of tofu boxes. Fail the build instead.
 */
function assertCjkFont(logger) {
	let families = '';
	try {
		families = execFileSync('fc-list', [':lang=zh', 'family'], { encoding: 'utf8' });
	} catch (err) {
		// No fontconfig CLI to ask — carry on rather than block the build on a
		// missing diagnostic tool.
		logger.warn(`could not verify CJK font availability (${err.code ?? err.message})`);
		return;
	}
	if (!families.trim()) {
		throw new Error(
			'og-images: no :lang=zh font found — post titles are Chinese and would render as tofu. ' +
				'Install one first (Debian/Ubuntu: apt-get install -y fonts-droid-fallback).',
		);
	}
}

export default function ogImages() {
	return {
		name: 'og-images',
		hooks: {
			'astro:build:done': async ({ logger, dir }) => {
				const blogDir = path.join(
					path.dirname(fileURLToPath(import.meta.url)),
					'src/content/blog',
				);
				const outDir = path.join(dir.pathname, 'og');
				fs.mkdirSync(outDir, { recursive: true });

				const posts = fs
					.readdirSync(blogDir)
					.filter((f) => /\.mdx?$/.test(f))
					.map((f) => ({ slug: f.replace(/\.mdx?$/, ''), fm: frontmatter(path.join(blogDir, f)) }))
					.filter((p) => p.fm.title);

				if (posts.some((p) => /[\p{Script=Han}]/u.test(p.fm.title))) assertCjkFont(logger);

				for (const p of posts) {
					const svg = card({
						title: p.fm.title,
						description: p.fm.description,
						date: p.fm.pubDate,
					});
					await sharp(Buffer.from(svg))
						.png({ compressionLevel: 9 })
						.toFile(path.join(outDir, `${p.slug}.png`));
				}
				logger.info(`og images generated (${posts.length} cards → dist/og/)`);
			},
		},
	};
}
