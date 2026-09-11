// Document OCR — PDF (via the vendored pdf.js) and JPG/PNG/WebP images,
// recognized in-browser by Tesseract.js (also vendored). Nothing uploads:
// wasm + language data all come from this site, inference runs in the tab.
//
// Honest limits, stated on the page: this is the wasm build of Tesseract —
// best on clean scans, weak on phone photos with perspective/skew, and
// Chinese runs ~10-30 s/page. Confidence per page is always shown so the
// visitor can see which pages deserve a manual check.

import { bilingual, onLang } from './i18n';

/** Minimal structural types for the vendored ESM builds — same reason as
 *  pdftoolkit.ts: the npm packages' .d.ts never enters the type program. */
interface TessWord {
	text: string;
	confidence: number;
}
interface TessResult {
	text: string;
	confidence: number;
	words?: TessWord[];
}
interface TessWorker {
	recognize(image: HTMLCanvasElement): Promise<{ data: TessResult }>;
	terminate(): Promise<void>;
}
interface TessModule {
	createWorker(lang: string, oem: number, options: { workerPath: string; corePath: string; langPath: string; logger?: (m: { status: string; progress: number }) => void }): Promise<TessWorker>;
}

let tessCache: Promise<TessModule> | null = null;
const loadTesseract = (): Promise<TessModule> => {
	tessCache ??= (async () => {
		// the ESM build wraps everything in a default export
		const tessUrl = '/tesseract/tesseract.esm.min.js';
		const mod = (await import(/* @vite-ignore */ tessUrl)) as unknown as { default?: TessModule } & TessModule;
		return (mod.default ?? mod) as TessModule;
	})();
	return tessCache;
};

/** pdf.js narrow types (see pdftoolkit-ui.ts). */
interface PdfJsViewport {
	width: number;
	height: number;
}
interface PdfJsPage {
	getViewport(o: { scale: number }): PdfJsViewport;
	render(o: { canvas: HTMLCanvasElement; canvasContext: CanvasRenderingContext2D; viewport: PdfJsViewport }): { promise: Promise<void> };
}
interface PdfJsDoc {
	numPages: number;
	getPage(n: number): Promise<PdfJsPage>;
}
interface PdfJsModule {
	GlobalWorkerOptions: { workerSrc: string };
	getDocument(src: { data: Uint8Array; cMapUrl: string; cMapPacked: boolean; standardFontDataUrl: string }): { promise: Promise<PdfJsDoc> };
}

const loadPdfjs = async (): Promise<PdfJsModule> => {
	const url = '/pdfjs/build/pdf.min.mjs';
	return (await import(/* @vite-ignore */ url)) as unknown as PdfJsModule;
};

export interface OcrPage {
	source: string; // "page 3" / file name
	text: string;
	confidence: number; // 0-100
}

export type ProgressFn = (done: number, total: number, note: string) => void;

/** Render every PDF page to canvas at 2x (the sweet spot for Tesseract:
 *  ~150-200 DPI equivalent) and run the worker over each. */
export async function ocrPdf(bytes: Uint8Array, lang: 'eng' | 'chi_sim', onProgress: ProgressFn): Promise<OcrPage[]> {
	const pdfjs = await loadPdfjs();
	pdfjs.GlobalWorkerOptions.workerSrc = '/pdfjs/worker/pdf.worker.min.mjs';
	const doc = await pdfjs.getDocument({ data: bytes.slice(), cMapUrl: '/pdfjs/cmaps/', cMapPacked: true, standardFontDataUrl: '/pdfjs/standard_fonts/' }).promise;
	const out: OcrPage[] = [];
	const worker = await makeWorker(lang, onProgress, doc.numPages);
	try {
		for (let i = 1; i <= doc.numPages; i++) {
			const page = await doc.getPage(i);
			const viewport = page.getViewport({ scale: 2 });
			const canvas = document.createElement('canvas');
			canvas.width = viewport.width;
			canvas.height = viewport.height;
			const ctx = canvas.getContext('2d');
			if (!ctx) throw new Error('no 2d context');
			await page.render({ canvas, canvasContext: ctx, viewport }).promise;
			const r = await worker.recognize(canvas);
			out.push({ source: `page ${i}`, text: r.data.text.trim(), confidence: Math.round(r.data.confidence) });
			onProgress(out.length, doc.numPages, `page ${i}`);
		}
	} finally {
		await worker.terminate();
	}
	return out;
}

/** Decode one image (jpg/png/webp) and OCR it. */
export async function ocrImage(file: File, lang: 'eng' | 'chi_sim', onProgress: ProgressFn): Promise<OcrPage> {
	const bitmap = await createImageBitmap(file);
	// Tesseract prefers ~300 DPI text height; cap the upscale so a 4000px
	// phone photo does not become a 16k canvas.
	const target = 2000;
	const scale = Math.min(2, Math.max(1, target / Math.max(bitmap.width, bitmap.height)));
	const canvas = document.createElement('canvas');
	canvas.width = Math.round(bitmap.width * scale);
	canvas.height = Math.round(bitmap.height * scale);
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('no 2d context');
	ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
	bitmap.close();
	const worker = await makeWorker(lang, onProgress, 1);
	try {
		const r = await worker.recognize(canvas);
		onProgress(1, 1, file.name);
		return { source: file.name, text: r.data.text.trim(), confidence: Math.round(r.data.confidence) };
	} finally {
		await worker.terminate();
	}
}

const makeWorker = (lang: 'eng' | 'chi_sim', _onProgress: ProgressFn, _total: number): Promise<TessWorker> =>
	loadTesseract().then((m) =>
		m.createWorker(lang, 1, {
			workerPath: '/tesseract/worker.min.js',
			corePath: '/tesseract/core',
			langPath: '/tesseract/lang',
		}),
	);

// UI --------------------------------------------------------------------------------------------

export function initPdfOcr(host: HTMLElement): void {
	let lang: 'eng' | 'chi_sim' = 'eng';
	const busy = { on: false };

	const drop = document.createElement('div');
	drop.className = 't-pdf-drop t-ocr-drop';

	const controls = document.createElement('div');
	controls.className = 't-filerow t-ocr-controls';
	const langSel = document.createElement('select');
	// <option> text cannot hold an i18n span pair — use the data-text-*
	// attributes ToolShell's syncLangUI swaps on language change
	for (const [v, en, zh] of [
		['eng', 'English', '英语'],
		['chi_sim', 'Chinese (Simplified)', '简体中文'],
	] as const) {
		const o = document.createElement('option');
		o.value = v;
		o.textContent = en;
		o.dataset.textEn = en;
		o.dataset.textZh = zh;
		langSel.append(o);
	}
	langSel.addEventListener('change', () => {
		lang = langSel.value as 'eng' | 'chi_sim';
	});
	const langLabel = document.createElement('label');
	langLabel.className = 't-csslayout-field';
	langLabel.append(bilingual('Language', '识别语言'), langSel);
	controls.append(langLabel);

	const input = document.createElement('input');
	input.type = 'file';
	input.multiple = true;
	input.accept = '.pdf,application/pdf,.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp';
	input.style.display = 'none';
	const pick = document.createElement('button');
	pick.type = 'button';
	pick.className = 't-btn';
	pick.append(bilingual('📄 Choose files', '📄 选择文件'));
	pick.addEventListener('click', () => input.click());
	const dropLabel = document.createElement('span');
	drop.append(dropLabel, pick, input);

	const progress = document.createElement('p');
	progress.className = 't-file-hint';
	const output = document.createElement('pre');
	output.className = 't-csscode t-ocr-output';
	const copyBtn = document.createElement('button');
	copyBtn.type = 'button';
	copyBtn.className = 't-btn';
	copyBtn.append(bilingual('📋 Copy text', '📋 复制文本'));
	copyBtn.addEventListener('click', () => {
		void navigator.clipboard.writeText(output.textContent ?? '');
	});

	const run = async (files: File[]): Promise<void> => {
		if (busy.on || !files.length) return;
		busy.on = true;
		output.textContent = '';
		try {
			const results: OcrPage[] = [];
			const total = files.length;
			let done = 0;
			for (const f of files) {
				progress.replaceChildren(
					bilingual(`Recognizing ${f.name}… (clean scans work best; Chinese takes ~10-30 s per page)`, `正在识别 ${f.name}…（清晰扫描件效果最佳；中文每页约 10-30 秒）`),
				);
				if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) {
					const bytes = new Uint8Array(await f.arrayBuffer());
					const pages = await ocrPdf(bytes, lang, (d, t) => {
						progress.replaceChildren(bilingual(`${f.name}: page ${d}/${t}`, `${f.name}：第 ${d}/${t} 页`));
					});
					results.push(...pages);
				} else {
					const r = await ocrImage(f, lang, () => undefined);
					results.push(r);
				}
				done++;
				progress.replaceChildren(bilingual(`Done ${done}/${total}`, `已完成 ${done}/${total}`));
			}
			// report: per-source confidence, then the text; low confidence is flagged
			const lines: string[] = [];
			for (const r of results) {
				const flag = r.confidence < 70 ? '  ⚠ low confidence — check manually' : '';
				lines.push(`── ${r.source} · ${r.confidence}%${flag} ──`);
				lines.push(r.text || '(no text found)');
				lines.push('');
			}
			output.textContent = lines.join('\n');
			progress.replaceChildren(bilingual(`Recognized ${results.length} page(s). Low-confidence pages are flagged ⚠.`, `已识别 ${results.length} 页。低置信度页面已标 ⚠。`));
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			progress.replaceChildren(bilingual(`Failed: ${msg}`, `失败：${msg}`));
		} finally {
			busy.on = false;
		}
	};

	const accept = (files: File[]): void => {
		void run(files);
	};
	input.addEventListener('change', () => {
		const files = [...(input.files ?? [])];
		if (files.length) accept(files);
	});
	drop.addEventListener('dragover', (e) => {
		e.preventDefault();
		drop.classList.add('t-droptarget');
	});
	drop.addEventListener('dragleave', () => drop.classList.remove('t-droptarget'));
	drop.addEventListener('drop', (e) => {
		e.preventDefault();
		drop.classList.remove('t-droptarget');
		const files = [...(e.dataTransfer?.files ?? [])];
		if (files.length) accept(files);
	});

	const privacy = document.createElement('p');
	privacy.className = 't-file-privacy';
	privacy.append(
		bilingual(
			'🔒 OCR runs entirely in this tab (wasm from this site, nothing uploaded). Best on clean scans — phone photos with skew, low contrast or complex layouts will disappoint.',
			'🔒 识别完全在本页内运行（wasm 与语言包来自本站，绝不上传）。清晰扫描件效果最佳——倾斜、低对比度或复杂版面的拍照件效果会打折扣。',
		),
	);

	host.append(controls, drop, privacy, progress, output, copyBtn);
	onLang(() => {
		dropLabel.replaceChildren(
			document.documentElement.dataset.lang === 'zh'
				? document.createTextNode('把 PDF / JPG / PNG / WebP 拖到这里（可多选）')
				: document.createTextNode('Drop PDF / JPG / PNG / WebP files here (multiple ok)'),
		);
	});
}
