// Excel Workbook Analyzer & Cleaner — the XLStylesTool idea, in the browser.
//
// An .xlsx/.xlsm file is a zip of XML parts. Bloat accumulates in exactly the
// places this tool reads: a styles.xml with thousands of unused cellXfs
// (every paste-special leaves some behind), defined names that point at other
// workbooks, hidden name ranges left by macros and old links, media nobody
// sees, and pivot caches of long-gone pivot tables. The workbook still opens
// fine — it just gets slower every year.
//
// Everything happens on the dropped bytes in this page: JSZip unpacks, regex
// + DOMParser walks the parts, and the cleaned copy is re-zipped for download.
// Nothing is uploaded anywhere.

import JSZip from 'jszip';

export interface XlsxPart {
	path: string;
	compressed: number; // bytes as stored
}

export interface XlsxSheetInfo {
	name: string;
	rows: number;
	cells: number;
	dimension: string;
	usedStyles: number; // distinct style ids referenced
}

export interface XlsxName {
	name: string;
	hidden: boolean;
	external: boolean; // references another workbook ([1]!…)
	ref: string;
}

export interface XlsxReport {
	fileName: string;
	fileSize: number;
	sheets: XlsxSheetInfo[];
	parts: XlsxPart[]; // by compressed size, desc
	totalCellXfs: number;
	usedCellXfs: number; // distinct ids referenced by any sheet
	definedNames: XlsxName[];
	externalLinks: number; // externalReference entries
	mediaCount: number;
	mediaBytes: number;
	pivotCaches: number;
	warnings: string[];
}

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Parse the dropped workbook into a report. Regex walks are deliberate —
 *  sheet XML can be tens of MB and a DOM parse of that would freeze the page. */
export async function analyzeWorkbook(data: ArrayBuffer, name: string): Promise<XlsxReport> {
	const zip = await JSZip.loadAsync(data);
	const warnings: string[] = [];

	// --- part sizes ---
	const parts: XlsxPart[] = [];
	zip.forEach((path, file) => {
		if (file.dir) return;
		parts.push({ path, compressed: (file as unknown as { _data: { compressedSize: number } })._data.compressedSize ?? 0 });
	});
	parts.sort((a, b) => b.compressed - a.compressed);

	// --- sheets: names from workbook.xml, stats from each sheet part ---
	const wbXml = (await zip.file('xl/workbook.xml')?.async('string')) ?? '';
	const relsXml = (await zip.file('xl/_rels/workbook.xml.rels')?.async('string')) ?? '';
	const relMap = new Map<string, string>();
	for (const m of relsXml.matchAll(/<Relationship [^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)) relMap.set(m[1]!, m[2]!);

	const sheetRels: { name: string; target: string }[] = [];
	for (const m of wbXml.matchAll(/<sheet [^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)) {
		const target = relMap.get(m[2]!);
		if (target) sheetRels.push({ name: m[1]!, target: target.replace(/^\//, '') });
	}

	const sheets: XlsxSheetInfo[] = [];
	const usedStyleIds = new Set<string>();
	for (const { name: sheetName, target } of sheetRels) {
		const path = target.startsWith('xl/') ? target : `xl/${target}`;
		const xml = (await zip.file(path)?.async('string')) ?? '';
		if (!xml) {
			warnings.push(`sheet part missing: ${path}`);
			continue;
		}
		const dimension = /<dimension ref="([^"]+)"/.exec(xml)?.[1] ?? '—';
		const rows = (xml.match(/<row [^>]*r=/g) ?? []).length;
		const cells = (xml.match(/<c r=/g) ?? []).length;
		for (const s of xml.matchAll(/\bs="(\d+)"/g)) usedStyleIds.add(s[1]!);
		sheets.push({ name: sheetName, rows, cells, dimension, usedStyles: usedStyleIds.size });
	}

	// --- styles ---
	const stylesXml = (await zip.file('xl/styles.xml')?.async('string')) ?? '';
	const totalCellXfs = Number(/<cellXfs count="(\d+)"/.exec(stylesXml)?.[1] ?? 0);

	// --- defined names ---
	const definedNames: XlsxName[] = [];
	for (const m of wbXml.matchAll(/<definedName ([^>]*)>([^<]*)<\/definedName>/g)) {
		const attrs = m[1]!;
		const ref = m[2]!.trim();
		definedNames.push({
			name: /name="([^"]+)"/.exec(attrs)?.[1] ?? '?',
			hidden: /hidden="1"/.test(attrs),
			external: /\[\d+\]/.test(ref),
			ref: ref.slice(0, 64),
		});
	}

	// --- external links / media / pivot caches ---
	const externalLinks = (wbXml.match(/<externalReference /g) ?? []).length;
	let mediaCount = 0;
	let mediaBytes = 0;
	let pivotCaches = 0;
	parts.forEach((p) => {
		if (/^xl\/media\//.test(p.path)) {
			mediaCount++;
			mediaBytes += p.compressed;
		}
		if (/pivotCache/i.test(p.path)) pivotCaches++;
	});

	return {
		fileName: name,
		fileSize: data.byteLength,
		sheets,
		parts,
		totalCellXfs,
		usedCellXfs: usedStyleIds.size,
		definedNames,
		externalLinks,
		mediaCount,
		mediaBytes,
		pivotCaches,
		warnings,
	};
}

export interface CleanOptions {
	stripUnusedStyles: boolean;
	removeHiddenNames: boolean;
	removeExternalNames: boolean;
	removeExternalLinks: boolean;
	removeMedia: boolean;
}

/** Produce the cleaned workbook as a Blob. Rewrites only the parts the chosen
 *  options touch; every other part is copied through byte-identical. */
export async function cleanWorkbook(data: ArrayBuffer, opts: CleanOptions): Promise<{ blob: Blob; removedStyles: number; removedNames: number }> {
	const zip = await JSZip.loadAsync(data);
	let removedStyles = 0;
	let removedNames = 0;

	const wbFile = zip.file('xl/workbook.xml');
	if (wbFile) {
		let wbXml = await wbFile.async('string');

		if (opts.removeExternalLinks) {
			wbXml = wbXml.replace(/<externalReferences>[\s\S]*?<\/externalReferences>/gi, '');

			// Remove externalLink relationships from workbook.xml.rels
			const relsFile = zip.file('xl/_rels/workbook.xml.rels');
			if (relsFile) {
				let relsXml = await relsFile.async('string');
				relsXml = relsXml.replace(/<Relationship [^>]*Target="externalLinks\/[^"]*"[^>]*\/>/gi, '');
				zip.file('xl/_rels/workbook.xml.rels', relsXml);
			}

			// Remove externalLink parts from zip
			const extFiles = zip.file(/^xl\/externalLinks\//i) ?? [];
			extFiles.forEach((f) => zip.remove(f.name));

			// Remove externalLink parts from [Content_Types].xml to prevent Excel "missing part" corruption
			const ctFile = zip.file('[Content_Types].xml');
			if (ctFile) {
				let ctXml = await ctFile.async('string');
				ctXml = ctXml.replace(/<Override\b[^>]*PartName="\/xl\/externalLinks\/[^"]*"[^>]*\/>/gi, '');
				zip.file('[Content_Types].xml', ctXml);
			}
		}

		if (opts.removeHiddenNames || opts.removeExternalNames) {
			wbXml = wbXml.replace(/<definedNames\b[^>]*>([\s\S]*?)<\/definedNames>/gi, (_whole, inner: string) => {
				const frags = inner.split(/(?=<definedName\b)/i);
				const kept = frags
					.filter((frag) => {
						if (!frag.trim()) return false;
						const nameAttr = /name="([^"]+)"/i.exec(frag)?.[1] ?? '';
						const isHidden = /hidden="1"/i.test(frag);
						const refText = frag.replace(/^[^>]*>/, '');
						const isExternal = /\[\d+\]/.test(refText);

						// Built-in system names (e.g. _FilterDatabase, Print_Area, Print_Titles, _xlnm.*) MUST NEVER be removed even if hidden
						const lowerName = nameAttr.toLowerCase();
						const isSystem =
							lowerName.startsWith('_filterdatabase') ||
							lowerName.startsWith('_xlnm') ||
							lowerName.startsWith('print_area') ||
							lowerName.startsWith('print_titles') ||
							lowerName.startsWith('consolidate_area') ||
							lowerName.startsWith('extract_data') ||
							lowerName.startsWith('sheet_title');

						if (isSystem) return true;

						if (opts.removeHiddenNames && isHidden) {
							removedNames++;
							return false;
						}
						if (opts.removeExternalNames && isExternal) {
							removedNames++;
							return false;
						}
						return true;
					})
					.join('');
				if (!kept.trim()) return '';
				const count = (kept.match(/<definedName\b/gi) ?? []).length;
				return `<definedNames count="${count}">${kept}</definedNames>`;
			});
		}
		zip.file('xl/workbook.xml', wbXml);
	}

	if (opts.stripUnusedStyles) {
		const stylesFile = zip.file('xl/styles.xml');
		const used = new Set<string>();
		// Match all worksheet XML files under xl/worksheets/
		const sheets = zip.file(/^xl\/worksheets\/.*\.xml$/i) ?? [];
		for (const f of sheets) {
			const xml = await f.async('string');
			for (const s of xml.matchAll(/\bs="(\d+)"/g)) used.add(s[1]!);
			for (const s of xml.matchAll(/\bstyle="(\d+)"/g)) used.add(s[1]!);
		}
		if (stylesFile) {
			const stylesXml = await stylesFile.async('string');
			// remap is built inside the synchronous replace callback and
			// consumed after it — the sheet rewrite must finish before
			// generateAsync re-zips, or cells point at deleted style ids.
			let remap = new Map<string, string>();
			const rewritten = stylesXml.replace(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/gi, (_whole, body: string) => {
				// Parse full <xf .../> or <xf ...>...</xf> elements without truncating inner nodes like <alignment>
				const xfs: string[] = [];
				const xfRegex = /<xf\b[\s\S]*?(?:\/>|<\/xf>)/gi;
				let m: RegExpExecArray | null;
				while ((m = xfRegex.exec(body)) !== null) {
					xfs.push(m[0]);
				}

				const keep: number[] = [];
				remap = new Map<string, string>();
				xfs.forEach((_xf, i) => {
					const id = String(i);
					if (i === 0 || used.has(id)) {
						remap.set(id, String(keep.length));
						keep.push(i);
					}
				});
				removedStyles = xfs.length - keep.length;

				const keptXml = keep.map((i) => xfs[i]).join('');
				return `<cellXfs count="${keep.length}">${keptXml}</cellXfs>`;
			});
			await remapSheetStyles(zip, remap);
			zip.file('xl/styles.xml', rewritten);
		}
	}

	if (opts.removeMedia) {
		// 1. Remove physical media files from zip
		const media = zip.file(/^xl\/media\//i) ?? [];
		media.forEach((f) => zip.remove(f.name));

		// 2. Remove media relationships from drawings to avoid dangling target corruption
		const drawRels = zip.file(/^xl\/drawings\/_rels\/.*\.rels$/i) ?? [];
		for (const r of drawRels) {
			let relsXml = await r.async('string');
			relsXml = relsXml.replace(/<Relationship\b[^>]*Target="(?:\.\.\/)?media\/[^"]*"[^>]*\/>/gi, '');
			zip.file(r.name, relsXml);
		}

		// 3. Remove drawing anchors embedding blip images from drawings XML
		const drawFiles = zip.file(/^xl\/drawings\/drawing\d+\.xml$/i) ?? [];
		for (const df of drawFiles) {
			let dXml = await df.async('string');
			dXml = dXml.replace(/<xdr:(?:twoCellAnchor|oneCellAnchor|absoluteAnchor)\b[^>]*>[\s\S]*?<a:blip\b[\s\S]*?<\/xdr:(?:twoCellAnchor|oneCellAnchor|absoluteAnchor)>/gi, '');
			zip.file(df.name, dXml);
		}

		// 4. Remove media overrides from [Content_Types].xml
		const ctFile = zip.file('[Content_Types].xml');
		if (ctFile) {
			let ctXml = await ctFile.async('string');
			ctXml = ctXml.replace(/<Override\b[^>]*PartName="\/xl\/media\/[^"]*"[^>]*\/>/gi, '');
			zip.file('[Content_Types].xml', ctXml);
		}
	}

	const blob = await zip.generateAsync({
		type: 'blob',
		compression: 'DEFLATE',
		compressionOptions: { level: 6 },
		mimeType: XLSX_MIME,
	});
	return { blob, removedStyles, removedNames };
}

/** Remap s="old" and style="old" in every sheet after cellXfs collapse in a single pass. */
async function remapSheetStyles(zip: JSZip, remap: Map<string, string>): Promise<void> {
	const sheets = zip.file(/^xl\/worksheets\/.*\.xml$/i) ?? [];
	for (const f of sheets) {
		let xml = await f.async('string');
		xml = xml.replace(/\bs="(\d+)"/g, (match, oldId: string) => {
			const newId = remap.get(oldId);
			return newId !== undefined ? `s="${newId}"` : match;
		});
		xml = xml.replace(/\bstyle="(\d+)"/g, (match, oldId: string) => {
			const newId = remap.get(oldId);
			return newId !== undefined ? `style="${newId}"` : match;
		});
		zip.file(f.name, xml);
	}
}
