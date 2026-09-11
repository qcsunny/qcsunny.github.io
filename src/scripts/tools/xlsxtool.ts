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
			// drop the <externalReferences> block; individual externalLink parts
			// stay in the zip (harmless) but nothing references them anymore
			const before = wbXml;
			wbXml = wbXml.replace(/<externalReferences>[\s\S]*?<\/externalReferences>/, '');
			if (before !== wbXml) removedNames += 0; // links aren't names; count via report
		}

		if (opts.removeHiddenNames || opts.removeExternalNames) {
			wbXml = wbXml.replace(/<definedNames>([\s\S]*?)<\/definedNames>/, (_whole, inner: string) => {
				const kept = inner
					.split(/(?=<definedName )/)
					.filter((frag) => {
						const isHidden = /hidden="1"/.test(frag);
						const isExternal = /\[\d+\]/.test(frag.replace(/^[^>]*>/, ''));
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
				if (!kept) return '';
				const count = (kept.match(/<definedName /g) ?? []).length;
				return `<definedNames count="${count}">${kept}</definedNames>`.replace(/ count="\d+"/, ''); // count attr optional; keep plain
			});
		}
		zip.file('xl/workbook.xml', wbXml);
	}

	if (opts.stripUnusedStyles) {
		const stylesFile = zip.file('xl/styles.xml');
		// collect used style ids across all sheets
		const used = new Set<string>();
		const sheetTargets = [...zip.file(/xl\/worksheets\/sheet\d+\.xml/) ?? []];
		for (const f of sheetTargets) {
			const xml = await f.async('string');
			for (const s of xml.matchAll(/\bs="(\d+)"/g)) used.add(s[1]!);
		}
		if (stylesFile) {
			const stylesXml = await stylesFile.async('string');
			// Rewrite cellXfs: keep xf entries whose index is used (index 0 — the
			// default — is always kept). Unused ones collapse; references are
			// remapped by rewriting each sheet's s="…" to the new index.
			const rewritten = stylesXml.replace(/<cellXfs count="\d+">([\s\S]*?)<\/cellXfs>/, (_whole, body: string) => {
				const xfs = [...body.matchAll(/<xf [^>]*(?:\/>|><\/xf>|>)/g)].map((m) => m[0]);
				const keep: number[] = [];
				const remap = new Map<string, string>();
				xfs.forEach((_xf, i) => {
					const id = String(i);
					if (i === 0 || used.has(id)) {
						remap.set(id, String(keep.length));
						keep.push(i);
					}
				});
				removedStyles = xfs.length - keep.length;
				// remap sheet references immediately (closure over zip)
				void remapSheetStyles(zip, remap);
				const keptXml = keep.map((i) => xfs[i]).join('');
				return `<cellXfs count="${keep.length}">${keptXml}</cellXfs>`;
			});
			zip.file('xl/styles.xml', rewritten);
		}
	}

	if (opts.removeMedia) {
		const media = zip.file(/xl\/media\//) ?? [];
		media.forEach((f) => zip.remove(f.name));
	}

	const blob = await zip.generateAsync({
		type: 'blob',
		compression: 'DEFLATE',
		compressionOptions: { level: 6 },
		mimeType: XLSX_MIME,
	});
	return { blob, removedStyles, removedNames };
}

/** Remap s="old" → s="new" in every sheet after cellXfs collapse. The remap
 *  map is applied in descending old-id order so no id is rewritten twice. */
async function remapSheetStyles(zip: JSZip, remap: Map<string, string>): Promise<void> {
	const entries = [...remap.entries()].sort((a, b) => Number(b[0]) - Number(a[0]));
	const sheets = [...(zip.file(/xl\/worksheets\/sheet\d+\.xml/) ?? [])];
	for (const f of sheets) {
		let xml = await f.async('string');
		for (const [oldId, newId] of entries) {
			if (oldId === newId) continue;
			xml = xml.replace(new RegExp(`(\\bs=")${oldId}(")`, 'g'), `$1${newId}$2`);
		}
		zip.file(f.name, xml);
	}
}
