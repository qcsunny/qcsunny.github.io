// PDF Toolkit operations — the pure-logic half. Every function takes bytes
// in, gives bytes (or a report) out; the UI layer (pdftoolkit-ui) owns files
// and downloads. pdf-lib does the structure work (merge/split/rotate/
// watermark/metadata/compress); pdf.js renders pages to images in the
// toolkit's raster and image→PDF tabs.
//
// One honest limitation, stated on the page: pdf-lib cannot WRITE encrypted
// PDFs (a long-standing upstream gap), so encryption is not offered; loading
// an encrypted file fails with a clear message instead of a stack trace.

// pdf-lib through minimal structural types. Its real .d.ts (3 MB) plus the
// project's other types pushed astro check's diagnostics past node's 2 GB
// default heap. The import stays a plain dynamic one (vite bundles it as
// before); only the TYPE the checker sees is narrowed to what we call.
interface PdfLibDegrees {
	type: 'degrees';
	angle: number;
}
interface PdfLibFont {
	widthOfTextAtSize(text: string, size: number): number;
}
interface PdfLibImage {
	width: number;
	height: number;
}
interface PdfLibPage {
	getWidth(): number;
	getHeight(): number;
	getSize(): { width: number; height: number };
	getRotation(): PdfLibDegrees;
	setRotation(angle: PdfLibDegrees): void;
	setSize(w: number, h: number): void;
	drawText(text: string, o: {
		x: number;
		y: number;
		size: number;
		font: PdfLibFont;
		opacity?: number;
		rotate?: PdfLibDegrees;
		color?: { r: number; g: number; b: number };
	}): void;
	drawImage(img: PdfLibImage, o: { x: number; y: number; width: number; height: number }): void;
}
interface PdfLibDoc {
	getPageCount(): number;
	getPageIndices(): number[];
	getPages(): PdfLibPage[];
	getPage(i: number): PdfLibPage;
	addPage(size?: [number, number] | PdfLibPage): PdfLibPage;
	copyPages(src: PdfLibDoc, indices: number[]): Promise<PdfLibPage[]>;
	getTitle(): string | undefined;
	setTitle(t: string): void;
	getAuthor(): string | undefined;
	setAuthor(t: string): void;
	getSubject(): string | undefined;
	setSubject(t: string): void;
	getCreator(): string | undefined;
	setCreator(t: string): void;
	getProducer(): string | undefined;
	setProducer(t: string): void;
	setKeywords(k: string[]): void;
	getCreationDate(): Date | undefined;
	getModificationDate(): Date | undefined;
	embedFont(f: 'Helvetica-Bold'): Promise<PdfLibFont>;
	embedJpg(b: Uint8Array): Promise<PdfLibImage>;
	embedPng(b: Uint8Array): Promise<PdfLibImage>;
	save(o?: { useObjectStreams?: boolean }): Promise<Uint8Array>;
}
interface PdfLib {
	PDFDocument: {
		create(): Promise<PdfLibDoc>;
		load(b: Uint8Array, o?: { ignoreEncryption?: boolean }): Promise<PdfLibDoc>;
	};
	StandardFonts: Record<string, string>;
	degrees(a: number): PdfLibDegrees;
	rgb(r: number, g: number, b: number): { r: number; g: number; b: number };
}

// Vendored UMD build (public/pdfjs/lib/pdf-lib.min.js) loaded as a classic
// script: importing the npm package pulled its 3MB .d.ts into astro check's
// type program and blew the heap — both locally and in CI. The vendored
// file has no types; the narrow interfaces above are the whole contract.
let pdfLibCache: Promise<PdfLib> | null = null;
const loadPdfLib = (): Promise<PdfLib> => {
	pdfLibCache ??= new Promise<PdfLib>((resolve, reject) => {
		if (typeof window !== 'undefined' && (window as unknown as { PDFLib?: PdfLib }).PDFLib) {
			resolve((window as unknown as { PDFLib: PdfLib }).PDFLib);
			return;
		}
		const el = document.createElement('script');
		el.src = '/pdfjs/lib/pdf-lib.min.js';
		el.onload = () => {
			const w = window as unknown as { PDFLib?: PdfLib };
			if (w.PDFLib) resolve(w.PDFLib);
			else reject(new Error('pdf-lib failed to initialize'));
		};
		el.onerror = () => reject(new Error('could not load pdf-lib'));
		document.head.append(el);
	});
	return pdfLibCache;
};

export interface PdfMetaInfo {
	pageCount: number;
	title: string | null;
	author: string | null;
	subject: string | null;
	creator: string | null;
	producer: string | null;
	creationDate: Date | null;
	modDate: Date | null;
	pageSizes: { w: number; h: number }[]; // pt, first page + distinct set
}

export async function readPdfMeta(bytes: Uint8Array): Promise<PdfMetaInfo> {
	const pdf = await loadPdfLib();
	const doc = await pdf.PDFDocument.load(bytes, { ignoreEncryption: false });
	const sizes = doc.getPages().map((p) => ({ w: Math.round(p.getWidth()), h: Math.round(p.getHeight()) }));
	return {
		pageCount: doc.getPageCount(),
		title: doc.getTitle() ?? null,
		author: doc.getAuthor() ?? null,
		subject: doc.getSubject() ?? null,
		creator: doc.getCreator() ?? null,
		producer: doc.getProducer() ?? null,
		creationDate: doc.getCreationDate() ?? null,
		modDate: doc.getModificationDate() ?? null,
		pageSizes: sizes,
	};
}

/** Merge several PDFs, in the given order, into one document. */
export async function mergePdfs(files: Uint8Array[]): Promise<Uint8Array> {
	const pdf = await loadPdfLib();
	const out = await pdf.PDFDocument.create();
	for (const bytes of files) {
		const src = await pdf.PDFDocument.load(bytes);
		const pages = await out.copyPages(src, src.getPageIndices());
		for (const p of pages) out.addPage(p);
	}
	return out.save();
}

/** Parse a page-range expression: "1-3,5,8-" (1-based, open end allowed,
 *  out-of-range clamps). Returns a sorted unique 0-based index list. */
export function parsePageRange(expr: string, pageCount: number): number[] {
	const picked = new Set<number>();
	for (const part of expr.split(/[,，]/)) {
		const t = part.trim();
		if (!t) continue;
		const m = /^(\d+)(?:\s*[-–]\s*(\d+)?)?$/.exec(t);
		if (!m) continue;
		const from = Math.max(1, Number(m[1]));
		const to = m[2] === undefined ? (m[1] && t.includes('-') ? pageCount : from) : Math.min(pageCount, Number(m[2]));
		for (let i = from; i <= Math.max(from, to); i++) if (i <= pageCount) picked.add(i - 1);
	}
	return [...picked].sort((a, b) => a - b);
}

/** Extract the selected pages (order as written in the expression) into a
 *  new document. */
export async function extractPages(bytes: Uint8Array, expr: string): Promise<{ out: Uint8Array; kept: number[] }> {
	const pdf = await loadPdfLib();
	const src = await pdf.PDFDocument.load(bytes);
	const indices = parsePageRange(expr, src.getPageCount());
	if (!indices.length) throw new Error('no pages selected');
	const out = await pdf.PDFDocument.create();
	const copied = await out.copyPages(src, indices);
	for (const p of copied) out.addPage(p);
	return { out: await out.save(), kept: indices.map((i) => i + 1) };
}

/** Split into single-page PDFs — one blob per page. */
export async function splitPdf(bytes: Uint8Array): Promise<Uint8Array[]> {
	const pdf = await loadPdfLib();
	const src = await pdf.PDFDocument.load(bytes);
	const outs: Uint8Array[] = [];
	for (let i = 0; i < src.getPageCount(); i++) {
		const one = await pdf.PDFDocument.create();
		const [p] = await one.copyPages(src, [i]);
		one.addPage(p);
		outs.push(await one.save());
	}
	return outs;
}

/** Rotate pages by a multiple of 90°. `expr` empty → all pages. */
export async function rotatePdf(bytes: Uint8Array, degreesDelta: 90 | 180 | 270, expr: string): Promise<Uint8Array> {
	const pdf = await loadPdfLib();
	const doc = await pdf.PDFDocument.load(bytes);
	const indices = expr.trim() ? parsePageRange(expr, doc.getPageCount()) : doc.getPageIndices();
	for (const i of indices) {
		const page = doc.getPage(i);
		// degrees(0) is fine (90-multiple check passes); the earlier smoke
		// failure was a bare-number call, not the zero itself.
		page.setRotation(pdf.degrees((page.getRotation().angle + degreesDelta) % 360));
	}
	return doc.save();
}

export interface WatermarkOptions {
	text: string;
	size: number;
	opacity: number; // 0-1
	angle: number; // degrees, counter-clockwise
	color: [number, number, number]; // 0-1 rgb
	tile: boolean; // repeat across the page vs one centered stamp
}

export async function watermarkPdf(bytes: Uint8Array, opts: WatermarkOptions): Promise<Uint8Array> {
	const pdf = await loadPdfLib();
	const doc = await pdf.PDFDocument.load(bytes);
	const font = await doc.embedFont('Helvetica-Bold');
	const { text, size, opacity, angle, color, tile } = opts;
	if (!text.trim()) throw new Error('empty watermark text');
	for (const page of doc.getPages()) {
		const { width, height } = page.getSize();
		const textWidth = font.widthOfTextAtSize(text, size);
		const [r, g, b] = color;
		if (tile) {
			const stepX = textWidth + size * 2;
			const stepY = size * 4;
			for (let y = -height * 0.2; y < height * 1.2; y += stepY) {
				for (let x = -width * 0.2; x < width * 1.2; x += stepX) {
					page.drawText(text, { x, y, size, font, opacity, rotate: pdf.degrees(angle), color: pdf.rgb(r, g, b) });
				}
			}
		} else {
			page.drawText(text, {
				x: (width - textWidth) / 2,
				y: height / 2 - size / 2,
				size,
				font,
				opacity,
				rotate: pdf.degrees(angle),
				color: pdf.rgb(r, g, b),
			});
		}
	}
	return doc.save();
}

/** Metadata: view is readPdfMeta; clear wipes DocInfo fields. */
export async function clearPdfMeta(bytes: Uint8Array): Promise<Uint8Array> {
	const pdf = await loadPdfLib();
	const doc = await pdf.PDFDocument.load(bytes);
	doc.setTitle('');
	doc.setAuthor('');
	doc.setSubject('');
	doc.setKeywords([]);
	doc.setProducer('');
	doc.setCreator('');
	return doc.save();
}

/** "Compress": pdf-lib already drops unused objects and re-serializes with
 *  object streams + full cross-reference compression — the same lossless
 *  re-pack MS Word does on "Save As, minimum size". No image downsampling
 *  (that would be lossy and needs re-encoding every image). */
export async function compressPdf(bytes: Uint8Array): Promise<Uint8Array> {
	const pdf = await loadPdfLib();
	const doc = await pdf.PDFDocument.load(bytes);
	return doc.save({ useObjectStreams: true });
}

/** Image → PDF: jpg/png bytes become one page each, page size = image size
 *  (in px treated as pt — the standard "photo PDF" behaviour). */
export async function imagesToPdf(images: { bytes: Uint8Array; type: 'jpeg' | 'png' }[]): Promise<Uint8Array> {
	const pdf = await loadPdfLib();
	const doc = await pdf.PDFDocument.create();
	for (const img of images) {
		const embedded = img.type === 'jpeg' ? await doc.embedJpg(img.bytes) : await doc.embedPng(img.bytes);
		const page = doc.addPage([embedded.width, embedded.height]);
		page.drawImage(embedded, { x: 0, y: 0, width: embedded.width, height: embedded.height });
	}
	return doc.save();
}

export const PDF_TOOLKIT_SAVE = { useObjectStreams: true };
