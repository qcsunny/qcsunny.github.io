// Renders a tool's inputs + results into a branded PNG "long image" on a
// canvas. Loaded via dynamic import on first click, so its layout code costs
// nothing on page load — the form bundle is already the heaviest thing a tool
// page ships. Drawn from the structured data rather than by rasterizing the
// DOM, which keeps the output identical across browsers and needs no library.
// Palette matches the build-time OG cards in og-images.mjs.

export interface PngRow {
	label: string;
	value: string;
	emphasis?: boolean;
}

export interface PngTable {
	columns: string[];
	rows: string[][];
}

export interface PngExportData {
	title: string;
	lang: 'en' | 'zh';
	inputs: PngRow[];
	results: PngRow[];
	table?: PngTable;
	note?: string;
	/** Basename for the downloaded file, without extension. */
	filename: string;
}

const W = 960;
const PAD = 56;
const CONTENT_W = W - PAD * 2;
/** 2× so the text stays crisp when the image is viewed or zoomed. */
const SCALE = 2;

const BG = '#0f1116';
const CARD = '#171b24';
const FG = '#e8e8ec';
const DIM = '#9aa0ab';
const ACCENT = '#8091ff';
const LINE = '#282e3a';

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", Roboto, sans-serif';

/** A very long amortization table would blow past the browser's max canvas
 *  height, so the image carries a readable prefix and says what it dropped. */
const MAX_TABLE_ROWS = 60;

type Item =
	| { k: 'gap'; h: number }
	| { k: 'rule'; h: number }
	| { k: 'lines'; h: number; lines: string[]; font: string; color: string; lineH: number }
	| { k: 'kv'; h: number; label: string; value: string; emphasis: boolean }
	| { k: 'table'; h: number; head: string[]; rows: string[][]; colW: number[]; font: string; rowH: number };

/** Greedy wrap. CJK breaks between any two characters, Latin only at spaces,
 *  so the token list mixes single wide chars with whole words. */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number, font: string): string[] {
	ctx.font = font;
	const tokens = text.match(/[⺀-￯]|[^\s⺀-￯]+\s*/g) ?? [text];
	const lines: string[] = [];
	let line = '';
	for (const tk of tokens) {
		if (line && ctx.measureText(line + tk).width > maxW) {
			lines.push(line.trimEnd());
			line = tk.trimStart();
		} else {
			line += tk;
		}
	}
	if (line.trim()) lines.push(line.trimEnd());
	return lines.length ? lines : [''];
}

/** Truncate to fit, keeping the tail readable with an ellipsis. */
function clip(ctx: CanvasRenderingContext2D, text: string, maxW: number, font: string): string {
	ctx.font = font;
	if (ctx.measureText(text).width <= maxW) return text;
	let s = text;
	while (s.length > 1 && ctx.measureText(`${s}…`).width > maxW) s = s.slice(0, -1);
	return `${s}…`;
}

const F_TITLE = `700 30px ${FONT}`;
const F_SECTION = `600 12px ${FONT}`;
const F_LABEL = `400 14px ${FONT}`;
const F_VALUE = `600 14px ${FONT}`;
const F_EMPH_LABEL = `600 15px ${FONT}`;
const F_EMPH_VALUE = `700 21px ${FONT}`;
const F_NOTE = `400 12.5px ${FONT}`;
const F_TABLE = `400 12.5px ${FONT}`;

function section(label: string): Item {
	return { k: 'lines', h: 26, lines: [label], font: F_SECTION, color: DIM, lineH: 26 };
}

/** Column widths from the widest cell, squeezed proportionally if the natural
 *  table is wider than the card. */
function tableItem(ctx: CanvasRenderingContext2D, table: PngTable, lang: 'en' | 'zh'): Item[] {
	const head = table.columns;
	const shown = table.rows.slice(0, MAX_TABLE_ROWS);
	const natural = head.map((h, i) => {
		ctx.font = F_TABLE;
		let w = ctx.measureText(h).width;
		for (const r of shown) w = Math.max(w, ctx.measureText(r[i] ?? '').width);
		return w + 22;
	});
	const total = natural.reduce((a, b) => a + b, 0);
	const colW = total > CONTENT_W ? natural.map((w) => (w * CONTENT_W) / total) : natural;

	const rowH = 26;
	const items: Item[] = [
		{ k: 'table', h: 32 + shown.length * rowH, head, rows: shown, colW, font: F_TABLE, rowH },
	];
	if (table.rows.length > shown.length) {
		const dropped = table.rows.length - shown.length;
		const msg =
			lang === 'zh'
				? `（仅显示前 ${shown.length} 行，另有 ${dropped} 行请在页面内查看）`
				: `(first ${shown.length} rows shown, ${dropped} more on the page)`;
		items.push({ k: 'gap', h: 8 }, { k: 'lines', h: 20, lines: [msg], font: F_NOTE, color: DIM, lineH: 20 });
	}
	return items;
}

const HEADER_H = 104;
const FOOTER_H = 76;

function buildItems(ctx: CanvasRenderingContext2D, data: PngExportData): Item[] {
	const zh = data.lang === 'zh';
	const items: Item[] = [];

	const titleLines = wrap(ctx, data.title, CONTENT_W, F_TITLE);
	items.push({ k: 'lines', h: titleLines.length * 40, lines: titleLines, font: F_TITLE, color: FG, lineH: 40 });
	items.push({ k: 'gap', h: 26 });

	if (data.inputs.length) {
		items.push(section(zh ? '输入参数' : 'INPUTS'));
		for (const r of data.inputs) {
			items.push({ k: 'kv', h: 26, label: r.label, value: r.value, emphasis: false });
		}
		items.push({ k: 'gap', h: 18 }, { k: 'rule', h: 1 }, { k: 'gap', h: 18 });
	}

	items.push(section(zh ? '计算结果' : 'RESULTS'));
	for (const r of data.results) {
		items.push({
			k: 'kv',
			h: r.emphasis ? 38 : 26,
			label: r.label,
			value: r.value,
			emphasis: Boolean(r.emphasis),
		});
	}

	if (data.table?.rows.length) {
		items.push({ k: 'gap', h: 24 }, section(zh ? '明细' : 'DETAILS'), { k: 'gap', h: 4 });
		items.push(...tableItem(ctx, data.table, data.lang));
	}

	if (data.note) {
		const noteLines = wrap(ctx, data.note, CONTENT_W, F_NOTE);
		items.push({ k: 'gap', h: 20 });
		items.push({ k: 'lines', h: noteLines.length * 20, lines: noteLines, font: F_NOTE, color: DIM, lineH: 20 });
	}

	return items;
}

function drawItems(ctx: CanvasRenderingContext2D, items: Item[], startY: number): void {
	let y = startY;
	for (const it of items) {
		if (it.k === 'gap') {
			y += it.h;
		} else if (it.k === 'rule') {
			ctx.fillStyle = LINE;
			ctx.fillRect(PAD, y, CONTENT_W, 1);
			y += it.h;
		} else if (it.k === 'lines') {
			ctx.font = it.font;
			ctx.fillStyle = it.color;
			ctx.textAlign = 'left';
			for (const [i, line] of it.lines.entries()) {
				ctx.fillText(line, PAD, y + it.lineH * i + it.lineH * 0.74);
			}
			y += it.h;
		} else if (it.k === 'kv') {
			const labelFont = it.emphasis ? F_EMPH_LABEL : F_LABEL;
			const valueFont = it.emphasis ? F_EMPH_VALUE : F_VALUE;
			const baseline = y + it.h * 0.72;

			ctx.font = valueFont;
			const valueW = Math.min(ctx.measureText(it.value).width, CONTENT_W * 0.62);
			ctx.textAlign = 'right';
			ctx.fillStyle = it.emphasis ? ACCENT : FG;
			ctx.fillText(clip(ctx, it.value, CONTENT_W * 0.62, valueFont), W - PAD, baseline);

			ctx.textAlign = 'left';
			ctx.fillStyle = it.emphasis ? FG : DIM;
			ctx.fillText(clip(ctx, it.label, CONTENT_W - valueW - 20, labelFont), PAD, baseline);
			y += it.h;
		} else {
			y = drawTable(ctx, it, y);
		}
	}
}

function drawTable(ctx: CanvasRenderingContext2D, it: Extract<Item, { k: 'table' }>, top: number): number {
	const xs: number[] = [];
	let x = PAD;
	for (const w of it.colW) {
		xs.push(x);
		x += w;
	}
	const tableW = x - PAD;
	const headFont = `600 12.5px ${FONT}`;

	ctx.fillStyle = CARD;
	ctx.fillRect(PAD, top, tableW, 32);
	ctx.font = headFont;
	ctx.fillStyle = DIM;
	ctx.textAlign = 'left';
	it.head.forEach((h, i) => {
		ctx.fillText(clip(ctx, h, it.colW[i] - 20, headFont), xs[i] + 11, top + 21);
	});

	let y = top + 32;
	for (const [ri, row] of it.rows.entries()) {
		if (ri % 2 === 1) {
			ctx.fillStyle = 'rgba(255,255,255,0.022)';
			ctx.fillRect(PAD, y, tableW, it.rowH);
		}
		ctx.fillStyle = FG;
		ctx.font = it.font;
		row.forEach((cell, ci) => {
			if (ci >= it.colW.length) return;
			ctx.fillText(clip(ctx, cell, it.colW[ci] - 20, it.font), xs[ci] + 11, y + it.rowH * 0.68);
		});
		y += it.rowH;
	}

	ctx.strokeStyle = LINE;
	ctx.lineWidth = 1;
	ctx.strokeRect(PAD + 0.5, top + 0.5, tableW - 1, y - top - 1);
	return y;
}

export function exportResultsPng(data: PngExportData): void {
	// Measuring needs a context before the real height is known, so lay out on
	// a scratch canvas first and size the real one from the result.
	const scratch = document.createElement('canvas').getContext('2d');
	if (!scratch) return;
	const items = buildItems(scratch, data);
	const bodyH = items.reduce((sum, it) => sum + it.h, 0);
	const H = Math.ceil(HEADER_H + bodyH + FOOTER_H);

	const canvas = document.createElement('canvas');
	canvas.width = W * SCALE;
	canvas.height = H * SCALE;
	const ctx = canvas.getContext('2d');
	if (!ctx) return;
	ctx.scale(SCALE, SCALE);
	ctx.textBaseline = 'alphabetic';

	ctx.fillStyle = BG;
	ctx.fillRect(0, 0, W, H);
	// Accent rail down the left edge, same brand cue as the OG cards.
	ctx.fillStyle = ACCENT;
	ctx.fillRect(0, 0, 8, H);

	// header: brand dot + wordmark, date on the right
	ctx.fillStyle = '#10b981';
	ctx.beginPath();
	ctx.arc(PAD + 5, 50, 5, 0, Math.PI * 2);
	ctx.fill();
	ctx.font = `700 16px ${FONT}`;
	ctx.fillStyle = FG;
	ctx.textAlign = 'left';
	ctx.fillText('QCSunny Lab', PAD + 20, 56);

	ctx.font = `400 13px ${FONT}`;
	ctx.fillStyle = DIM;
	ctx.textAlign = 'right';
	ctx.fillText(new Date().toLocaleDateString(data.lang === 'zh' ? 'zh-CN' : 'en-CA'), W - PAD, 56);

	drawItems(ctx, items, HEADER_H);

	// footer: site + the privacy claim the whole site is built on
	const footY = H - 30;
	ctx.fillStyle = LINE;
	ctx.fillRect(PAD, H - FOOTER_H + 16, CONTENT_W, 1);
	ctx.font = `600 13px ${FONT}`;
	ctx.fillStyle = ACCENT;
	ctx.textAlign = 'left';
	ctx.fillText('qcsunny.org', PAD, footY);
	ctx.font = `400 12px ${FONT}`;
	ctx.fillStyle = DIM;
	ctx.textAlign = 'right';
	ctx.fillText(
		data.lang === 'zh' ? '100% 浏览器本地运算 · 数据不上传' : '100% in-browser · nothing uploaded',
		W - PAD,
		footY,
	);

	canvas.toBlob((blob) => {
		if (!blob) return;
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `${data.filename}.png`;
		a.click();
		// Revoke on the next tick; revoking synchronously can cancel the download.
		setTimeout(() => URL.revokeObjectURL(url), 10_000);
	}, 'image/png');
}
