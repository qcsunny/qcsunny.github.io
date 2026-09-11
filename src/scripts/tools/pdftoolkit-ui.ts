// UI half of the PDF Toolkit: a tabbed workbench (merge / extract / split /
// rotate / watermark / compress / metadata / PDF→image / image→PDF).
// Each tab owns its file drop(s) and controls; the operations come from
// pdftoolkit.ts and pdf.js render lives in this module (worker + fonts are
// vendored under /pdfjs/). Every byte stays in the page.

import { readPdfMeta, mergePdfs, extractPages, splitPdf, rotatePdf, watermarkPdf, clearPdfMeta, compressPdf, imagesToPdf, type PdfMetaInfo } from './pdftoolkit';
import { bilingual } from './i18n';

/** Minimal pdf.js structural types — see the pdf2img tab for why the real
 *  ones are not imported (astro check hangs on pdfjs-dist's .d.ts). */
interface PdfJsViewport {
	width: number;
	height: number;
}
interface PdfJsPage {
	getViewport: (o: { scale: number }) => PdfJsViewport;
	render: (o: { canvas: HTMLCanvasElement; canvasContext: CanvasRenderingContext2D; viewport: PdfJsViewport }) => { promise: Promise<void> };
}
interface PdfJsDoc {
	numPages: number;
	getPage: (n: number) => Promise<PdfJsPage>;
}

const fmtBytes = (n: number): string => {
	if (n < 1024) return `${n} B`;
	if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
	return `${(n / (1024 * 1024)).toFixed(2)} MB`;
};

const download = (bytes: Uint8Array, name: string, type = 'application/pdf'): void => {
	const blob = new Blob([bytes as BlobPart], { type });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = name;
	a.click();
	setTimeout(() => URL.revokeObjectURL(url), 5000);
};

interface PdfFile {
	name: string;
	bytes: Uint8Array;
}

/** A tab panel with: dropzone (single or multi PDF), per-tab controls, run
 *  button, result line. Tab switching is plain class toggling. */
export function initPdfToolkit(host: HTMLElement): void {
	const TABS: { id: string; en: string; zh: string }[] = [
		{ id: 'merge', en: 'Merge 合并', zh: '合并' },
		{ id: 'extract', en: 'Extract 提取', zh: '提取' },
		{ id: 'split', en: 'Split 拆分', zh: '拆分' },
		{ id: 'rotate', en: 'Rotate 旋转', zh: '旋转' },
		{ id: 'watermark', en: 'Watermark 水印', zh: '水印' },
		{ id: 'compress', en: 'Compress 压缩', zh: '压缩' },
		{ id: 'meta', en: 'Metadata 元数据', zh: '元数据' },
		{ id: 'pdf2img', en: 'PDF → Image 转图片', zh: '转图片' },
		{ id: 'img2pdf', en: 'Image → PDF 转PDF', zh: '转PDF' },
	];

	const bar = document.createElement('div');
	bar.className = 't-pdf-tabs';
	const panels: Record<string, HTMLElement> = {};
	const state: { files: PdfFile[]; images: { name: string; bytes: Uint8Array; type: 'jpeg' | 'png' }[] } = { files: [], images: [] };

	for (const tab of TABS) {
		const btn = document.createElement('button');
		btn.type = 'button';
		btn.className = 't-pdf-tab';
		btn.dataset.tab = tab.id;
		btn.append(bilingual(tab.en, tab.zh));
		btn.addEventListener('click', () => {
			for (const b of bar.querySelectorAll('.t-pdf-tab')) b.classList.toggle('t-active', b === btn);
			for (const id of Object.keys(panels)) panels[id]!.classList.toggle('t-hidden', id !== tab.id);
		});
		bar.append(btn);
	}
	host.append(bar);

	const multiTabs = new Set(['merge', 'img2pdf']); // accept many files
	const dropZone = (tabId: string): HTMLElement => {
		const zone = document.createElement('div');
		zone.className = 't-pdf-drop';
		const label = document.createElement('span');
		zone.append(label, bilingual(tabId === 'img2pdf' ? 'Drop JPG / PNG images here (multiple ok)' : 'Drop PDF(s) here — or click to pick', '把文件拖到这里——或点击选择'));
		const input = document.createElement('input');
		input.type = 'file';
		input.multiple = multiTabs.has(tabId);
		input.accept = tabId === 'img2pdf' ? '.jpg,.jpeg,.png,image/jpeg,image/png' : '.pdf,application/pdf';
		input.style.display = 'none';
		input.addEventListener('change', () => {
			const files = [...(input.files ?? [])];
			if (files.length) void acceptFiles(files, multiTabs.has(tabId));
		});
		const pick = document.createElement('button');
		pick.type = 'button';
		pick.className = 't-btn';
		pick.append(bilingual('📄 Choose files', '📄 选择文件'));
		pick.addEventListener('click', () => input.click());
		zone.append(pick, input);
		zone.addEventListener('dragover', (e) => {
			e.preventDefault();
			zone.classList.add('t-droptarget');
		});
		zone.addEventListener('dragleave', () => zone.classList.remove('t-droptarget'));
		zone.addEventListener('drop', (e) => {
			e.preventDefault();
			zone.classList.remove('t-droptarget');
			const files = [...(e.dataTransfer?.files ?? [])];
			if (files.length) void acceptFiles(files, multiTabs.has(tabId));
		});
		return zone;
	};

	const fileCount = (): void => {
		for (const [id, panel] of Object.entries(panels)) {
			const list = panel.querySelector<HTMLElement>('.t-pdf-filelist');
			if (!list) continue;
			list.innerHTML = '';
			for (const f of state.files) {
				const li = document.createElement('li');
				li.textContent = `${f.name} · ${fmtBytes(f.bytes.length)}`;
				list.append(li);
			}
			if (multiTabs.has(id) && state.images.length) {
				for (const f of state.images) {
					const li = document.createElement('li');
					li.textContent = `${f.name} · ${fmtBytes(f.bytes.length)}`;
					list.append(li);
				}
			}
		}
	};

	const acceptFiles = async (files: File[], multi: boolean): Promise<void> => {
		if (!multi) {
			// single-file tabs: the latest drop replaces, it does not accumulate
			state.files = [];
			state.images = [];
		}
		for (const f of files) {
			const bytes = new Uint8Array(await f.arrayBuffer());
			if (f.type === 'image/jpeg' || /\.jpe?g$/i.test(f.name)) state.images.push({ name: f.name, bytes, type: 'jpeg' });
			else if (f.type === 'image/png' || /\.png$/i.test(f.name)) state.images.push({ name: f.name, bytes, type: 'png' });
			else state.files.push({ name: f.name, bytes });
		}
		fileCount();
	};

	// --- build each panel ---
	const mkPanel = (id: string): HTMLElement => {
		const p = document.createElement('div');
		p.className = 't-pdf-panel';
		p.dataset.panel = id;
		if (id !== 'merge' && id !== 'img2pdf') p.append(dropZone(id));
		else p.append(dropZone(id)); // merge & img2pdf also get multi-drop zones
		const list = document.createElement('ul');
		list.className = 't-pdf-filelist';
		p.append(list);
		panels[id] = p;
		return p;
	};
	for (const t of TABS) host.append(mkPanel(t.id));
	// default: first tab active
	bar.querySelector<HTMLElement>('.t-pdf-tab')?.dispatchEvent(new Event('click'));

	// --- per-tab controls & run ---
	const runLine = (panelId: string): HTMLElement => {
		const existing = panels[panelId]!.querySelector<HTMLElement>('.t-pdf-runline');
		if (existing) return existing;
		const el = document.createElement('p');
		el.className = 't-pdf-runline';
		panels[panelId]!.append(el);
		return el;
	};
	const say = (panelId: string, en: string, zh: string): void => {
		const el = runLine(panelId);
		el.innerHTML = '';
		el.append(bilingual(en, zh));
	};
	const firstPdf = (): PdfFile | null => state.files[0] ?? null;
	const outName = (src: string, suffix: string): string => src.replace(/\.pdf$/i, '') + `-${suffix}.pdf`;

	// extract
	const exInput = document.createElement('input');
	exInput.className = 't-trackinput';
	exInput.placeholder = '1-3,5,8-';
	exInput.style.width = '10em';
	panels.extract!.append(exInput);
	const exBtn = mkRunButton('Extract pages 提取页面', '提取页面', async () => {
		const f = firstPdf();
		if (!f) return say('extract', 'Drop a PDF first.', '请先拖入 PDF。');
		const r = await extractPages(f.bytes, exInput.value || '1-');
		download(r.out, outName(f.name, 'extract'));
		say('extract', `Extracted ${r.kept.length} pages: ${r.kept.slice(0, 30).join(', ')}${r.kept.length > 30 ? '…' : ''}`, `已提取 ${r.kept.length} 页：${r.kept.slice(0, 30).join(', ')}${r.kept.length > 30 ? '…' : ''}`);
	});
	panels.extract!.append(exBtn);

	// split
	const spBtn = mkRunButton('Split to single pages 拆分为单页', '拆分为单页', async () => {
		const f = firstPdf();
		if (!f) return say('split', 'Drop a PDF first.', '请先拖入 PDF。');
		const meta = await readPdfMeta(f.bytes);
		if (meta.pageCount > 500) return say('split', 'Over 500 pages — use Extract with ranges instead (splitting would create 500+ files in memory).', '超过 500 页——请改用提取页码范围（拆分会一次产生 500+ 个文件驻留内存）。');
		const parts = await splitPdf(f.bytes);
		for (let i = 0; i < parts.length; i++) download(parts[i]!, `${f.name.replace(/\.pdf$/i, '')}-p${String(i + 1).padStart(3, '0')}.pdf`);
		say('split', `Split into ${parts.length} single-page PDFs.`, `已拆分为 ${parts.length} 个单页 PDF。`);
	});
	panels.split!.append(spBtn);

	// rotate
	const rotSel = document.createElement('select');
	for (const [v, en, zh] of [
		['90', '+90°', '+90°'],
		['180', '180°', '180°'],
		['270', '−90°', '−90°'],
	] as const) {
		const o = document.createElement('option');
		o.value = v;
		o.textContent = en === zh ? en : `${en} / ${zh}`;
		rotSel.append(o);
	}
	const rotInput = document.createElement('input');
	rotInput.className = 't-trackinput';
	rotInput.placeholder = 'pages (blank = all)';
	rotInput.style.width = '12em';
	const rotBtn = mkRunButton('Rotate 旋转', '旋转', async () => {
		const f = firstPdf();
		if (!f) return say('rotate', 'Drop a PDF first.', '请先拖入 PDF。');
		const out = await rotatePdf(f.bytes, Number(rotSel.value) as 90 | 180 | 270, rotInput.value);
		download(out, outName(f.name, 'rotated'));
		say('rotate', 'Rotated and downloaded.', '已旋转并下载。');
	});
	panels.rotate!.append(rotSel, rotInput, rotBtn);

	// watermark
	const wmText = document.createElement('input');
	wmText.className = 't-trackinput';
	wmText.value = 'CONFIDENTIAL';
	wmText.style.width = '10em';
	const wmSize = document.createElement('input');
	wmSize.type = 'number';
	wmSize.value = '40';
	wmSize.className = 't-trackinput';
	wmSize.style.width = '5em';
	const wmOpacity = document.createElement('input');
	wmOpacity.type = 'number';
	wmOpacity.value = '0.3';
	wmOpacity.step = '0.1';
	wmOpacity.min = '0';
	wmOpacity.max = '1';
	wmOpacity.className = 't-trackinput';
	wmOpacity.style.width = '5em';
	const wmAngle = document.createElement('input');
	wmAngle.type = 'number';
	wmAngle.value = '45';
	wmAngle.className = 't-trackinput';
	wmAngle.style.width = '5em';
	const wmTile = document.createElement('input');
	wmTile.type = 'checkbox';
	wmTile.checked = true;
	const wmColor = document.createElement('input');
	wmColor.className = 't-trackinput';
	wmColor.value = '#cc3333';
	wmColor.style.width = '7em';
	const wmHex = (h: string): [number, number, number] => {
		const m = /^#?([0-9a-f]{6})$/i.exec(h.trim());
		if (!m) return [0.8, 0.2, 0.2];
		const x = m[1]!;
		return [parseInt(x.slice(0, 2), 16) / 255, parseInt(x.slice(2, 4), 16) / 255, parseInt(x.slice(4, 6), 16) / 255];
	};
	const wmBtn = mkRunButton('Add watermark & download 加水印并下载', '加水印并下载', async () => {
		const f = firstPdf();
		if (!f) return say('watermark', 'Drop a PDF first.', '请先拖入 PDF。');
		const out = await watermarkPdf(f.bytes, {
			text: wmText.value,
			size: Number(wmSize.value) || 40,
			opacity: Math.min(1, Math.max(0, Number(wmOpacity.value) || 0.3)),
			angle: Number(wmAngle.value) || 45,
			color: wmHex(wmColor.value),
			tile: wmTile.checked,
		});
		download(out, outName(f.name, 'watermarked'));
		say('watermark', 'Watermarked and downloaded.', '已加水印并下载。');
	});
	for (const [label, el] of [
		['Text 文案', wmText],
		['Size 字号', wmSize],
		['Opacity 透明度', wmOpacity],
		['Angle 角度', wmAngle],
		['Color 颜色', wmColor],
	] as const) {
		const wrap = document.createElement('label');
		wrap.className = 't-csslayout-field';
		wrap.append(bilingual(label, label), el);
		panels.watermark!.append(wrap);
	}
	const tileWrap = document.createElement('label');
	tileWrap.className = 't-csslayout-field';
	tileWrap.append(wmTile, bilingual('Tile 平铺', '平铺'));
	panels.watermark!.append(tileWrap, wmBtn);

	// compress
	const cpBtn = mkRunButton('Compress & download 压缩并下载', '压缩并下载', async () => {
		const f = firstPdf();
		if (!f) return say('compress', 'Drop a PDF first.', '请先拖入 PDF。');
		const out = await compressPdf(f.bytes);
		download(out, outName(f.name, 'compressed'));
		const d = 1 - out.length / f.bytes.length;
		say(
			'compress',
			`Lossless repack: ${fmtBytes(f.bytes.length)} → ${fmtBytes(out.length)} (${d > 0 ? `−${(d * 100).toFixed(1)}%` : `+${(-d * 100).toFixed(1)}%`} — images are not recompressed).`,
			`无损重打包：${fmtBytes(f.bytes.length)} → ${fmtBytes(out.length)}（${d > 0 ? `−${(d * 100).toFixed(1)}%` : `+${(-d * 100).toFixed(1)}%`}——图片不做有损压缩）。`,
		);
	});
	panels.compress!.append(cpBtn);

	// metadata: view + clear
	const mvBtn = mkRunButton('View metadata 查看元数据', '查看元数据', async () => {
		const f = firstPdf();
		if (!f) return say('meta', 'Drop a PDF first.', '请先拖入 PDF。');
		const m = await readPdfMeta(f.bytes);
		const fmt = (d: Date | null): string => (d ? d.toISOString().slice(0, 19).replace('T', ' ') : '—');
		say(
			'meta',
			`Pages ${m.pageCount} · ${m.pageSizes[0] ? `${m.pageSizes[0].w}×${m.pageSizes[0].h} pt` : '—'}\nTitle ${m.title ?? '—'} · Author ${m.author ?? '—'}\nSubject ${m.subject ?? '—'}\nCreator ${m.creator ?? '—'} · Producer ${m.producer ?? '—'}\nCreated ${fmt(m.creationDate)} · Modified ${fmt(m.modDate)}`,
			`页数 ${m.pageCount} · ${m.pageSizes[0] ? `${m.pageSizes[0].w}×${m.pageSizes[0].h} pt` : '—'}\n标题 ${m.title ?? '—'} · 作者 ${m.author ?? '—'}\n主题 ${m.subject ?? '—'}\n创建工具 ${m.creator ?? '—'} · 生成器 ${m.producer ?? '—'}\n创建 ${fmt(m.creationDate)} · 修改 ${fmt(m.modDate)}`,
		);
	});
	const mcBtn = mkRunButton('Clear metadata & download 清除元数据并下载', '清除元数据并下载', async () => {
		const f = firstPdf();
		if (!f) return say('meta', 'Drop a PDF first.', '请先拖入 PDF。');
		const out = await clearPdfMeta(f.bytes);
		download(out, outName(f.name, 'nometa'));
		say('meta', 'Metadata cleared and downloaded.', '元数据已清除并下载。');
	});
	panels.meta!.append(mvBtn, mcBtn);

	// merge
	const mgBtn = mkRunButton('Merge & download 合并并下载', '合并并下载', async () => {
		if (state.files.length < 2) return say('merge', 'Drop at least two PDFs.', '请至少拖入两个 PDF。');
		const out = await mergePdfs(state.files.map((f) => f.bytes));
		download(out, 'merged.pdf');
		say('merge', `Merged ${state.files.length} files (${(await readPdfMeta(out)).pageCount} pages).`, `已合并 ${state.files.length} 个文件（共 ${(await readPdfMeta(out)).pageCount} 页）。`);
	});
	panels.merge!.append(mgBtn);

	// pdf → image (pdf.js)
	const p2iScale = document.createElement('select');
	for (const [v, t] of [
		['1.5', '1.5× (~108 DPI)'],
		['2', '2× (~144 DPI)'],
		['3', '3× (~216 DPI)'],
	] as const) {
		const o = document.createElement('option');
		o.value = v;
		o.textContent = t;
		p2iScale.append(o);
	}
	const p2iFmt = document.createElement('select');
	for (const [v, t] of [
		['png', 'PNG'],
		['jpeg', 'JPG'],
	] as const) {
		const o = document.createElement('option');
		o.value = v;
		o.textContent = t;
		p2iFmt.append(o);
	}
	const p2iBtn = mkRunButton('Render pages & download 逐页渲染并下载', '逐页渲染并下载', async () => {
		const f = firstPdf();
		if (!f) return say('pdf2img', 'Drop a PDF first.', '请先拖入 PDF。');
		// pdfjs imported through a minimal structural type: the library's own
		// .d.ts (892 KB, deeply recursive) hangs astro check.
		// Vendored copy under /pdfjs/build — importing the npm package pulled
		// its 892KB recursive .d.ts into astro check and hung it; the vendored
		// file has no types at all, hence the structural cast.
		const pdfjsUrl = '/pdfjs/build/pdf.min.mjs';
		const pdfjs = (await import(/* @vite-ignore */ pdfjsUrl)) as unknown as {
			GlobalWorkerOptions: { workerSrc: string };
			getDocument: (src: { data: Uint8Array; cMapUrl: string; cMapPacked: boolean; standardFontDataUrl: string }) => { promise: PdfJsDoc };
		};
		pdfjs.GlobalWorkerOptions.workerSrc = '/pdfjs/worker/pdf.worker.min.mjs';
		const doc = await pdfjs.getDocument({ data: state.files[0]!.bytes.slice(), cMapUrl: '/pdfjs/cmaps/', cMapPacked: true, standardFontDataUrl: '/pdfjs/standard_fonts/' }).promise;
		const scale = Number(p2iScale.value);
		const fmtType = p2iFmt.value as 'png' | 'jpeg';
		for (let i = 1; i <= doc.numPages; i++) {
			const page = await doc.getPage(i);
			const viewport = page.getViewport({ scale });
			const canvas = document.createElement('canvas');
			canvas.width = viewport.width;
			canvas.height = viewport.height;
			const ctx = canvas.getContext('2d');
			if (!ctx) throw new Error('no 2d context');
			await page.render({ canvas, canvasContext: ctx, viewport }).promise;
			const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, fmtType === 'png' ? 'image/png' : 'image/jpeg', 0.9));
			if (!blob) continue;
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `${f.name.replace(/\.pdf$/i, '')}-p${String(i).padStart(3, '0')}.${fmtType === 'png' ? 'png' : 'jpg'}`;
			a.click();
			setTimeout(() => URL.revokeObjectURL(url), 5000);
			say('pdf2img', `Rendered ${i}/${doc.numPages}…`, `已渲染 ${i}/${doc.numPages} 页…`);
		}
		say('pdf2img', `Done — ${doc.numPages} pages rendered at ${scale}×.`, `完成——${doc.numPages} 页以 ${scale}× 渲染。`);
	});
	panels.pdf2img!.append(p2iScale, p2iFmt, p2iBtn);

	// image → pdf
	const i2pBtn = mkRunButton('Combine images to PDF 图片合成PDF并下载', '图片合成PDF并下载', async () => {
		if (!state.images.length) return say('img2pdf', 'Drop JPG/PNG images first.', '请先拖入 JPG/PNG 图片。');
		const out = await imagesToPdf(state.images);
		download(out, 'images.pdf');
		say('img2pdf', `Combined ${state.images.length} images into one PDF.`, `已将 ${state.images.length} 张图片合成一个 PDF。`);
	});
	panels.img2pdf!.append(i2pBtn);

	const privacy = document.createElement('p');
	privacy.className = 't-file-privacy';
	privacy.append(bilingual('🔒 Every operation runs on bytes inside this page — nothing is uploaded. Encryption is not supported (pdf-lib cannot write encrypted PDFs).', '🔒 所有操作都在本页面内完成——绝不上传。不支持加密（pdf-lib 无法写出加密 PDF）。'));
	host.append(privacy);

	function mkRunButton(en: string, zh: string, run: () => Promise<void>): HTMLButtonElement {
		const b = document.createElement('button');
		b.type = 'button';
		b.className = 't-btn t-primary';
		b.append(bilingual(en, zh));
		b.addEventListener('click', () => {
			void run().catch((err: unknown) => {
				const msg = err instanceof Error ? err.message : String(err);
				// pdf-lib's encrypted-load error is a chance to explain honestly
				const enc = /encrypt/i.test(msg);
				say(
					Object.keys(panels).find((k) => panels[k]!.contains(b)) ?? 'merge',
					enc ? 'This PDF is password-protected — decryption is not supported.' : `Failed: ${msg}`,
					enc ? '该 PDF 有密码保护——不支持解密。' : `失败：${msg}`,
				);
			});
		});
		return b;
	}
}
