// UI half of the Excel Workbook Analyzer: drag/drop a .xlsx/.xlsm, get the
// bloat report (part sizes, sheets, styles, names, links, media, pivots),
// tick what to clean, download the re-packed file. All of it stays in this
// page — see xlsxtool.ts for the parsing half.

import { analyzeWorkbook, cleanWorkbook, type CleanOptions, type XlsxReport } from './xlsxtool';
import { bilingual, onLang } from './i18n';

const fmtBytes = (n: number): string => {
	if (n < 1024) return `${n} B`;
	if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
	return `${(n / (1024 * 1024)).toFixed(2)} MB`;
};

export function initXlsxAnalyzer(host: HTMLElement): void {
	let currentBytes: ArrayBuffer | null = null;
	let currentReport: XlsxReport | null = null;

	// --- drop zone ---
	const drop = document.createElement('div');
	drop.className = 't-dropzone t-xlsx-drop';
	const dropLabel = document.createElement('span');
	drop.append(dropLabel);

	const fileInput = document.createElement('input');
	fileInput.type = 'file';
	fileInput.accept = '.xlsx,.xlsm';
	fileInput.style.display = 'none';

	const pick = document.createElement('button');
	pick.type = 'button';
	pick.className = 't-btn';
	pick.append(bilingual('📄 Choose a .xlsx / .xlsm file', '📄 选择 .xlsx / .xlsm 文件'));
	pick.addEventListener('click', () => fileInput.click());
	drop.append(pick, fileInput);

	// --- report area ---
	const report = document.createElement('div');
	report.className = 't-xlsx-report';

	// --- clean options ---
	const cleanBox = document.createElement('div');
	cleanBox.className = 't-xlsx-clean t-filerow';

	const resultLine = document.createElement('p');
	resultLine.className = 't-file-hint';

	const draw = async (buf: ArrayBuffer, name: string): Promise<void> => {
		currentBytes = buf;
		report.innerHTML = '';
		resultLine.textContent = '';
		cleanBox.innerHTML = '';
		report.append(bilingual('Analyzing…', '分析中…'));
		try {
			const r = await analyzeWorkbook(buf, name);
			currentReport = r;
			renderReport(r);
			renderClean(r);
		} catch {
			report.innerHTML = '';
			report.append(bilingual('Not a readable .xlsx/.xlsm file (it may be the legacy .xls, or password-protected).', '无法读取该 .xlsx/.xlsm 文件（可能是旧版 .xls，或已加密）。'));
		}
	};

	const renderReport = (r: XlsxReport): void => {
		report.innerHTML = '';
		const head = document.createElement('div');
		head.className = 't-xlsx-head';
		head.append(
			bilingual('File 文件', '文件'),
			Object.assign(document.createElement('strong'), { textContent: r.fileName }),
			bilingual(`· ${fmtBytes(r.fileSize)}`, `· ${fmtBytes(r.fileSize)}`),
		);
		report.append(head);

		// bloat verdict lines
		const rows: [string, string][] = [
			['Sheets 工作表', `${r.sheets.length} (${r.sheets.map((s) => s.name).slice(0, 6).join(', ')}${r.sheets.length > 6 ? '…' : ''})`],
			['Cell styles 样式数', `${r.totalCellXfs} total / ${r.usedCellXfs} in use${r.totalCellXfs - r.usedCellXfs > 50 ? '  ⚠ bloat' : ''}`],
			['Defined names 命名区域', `${r.definedNames.length}${r.definedNames.some((n) => n.hidden) ? ` (${r.definedNames.filter((n) => n.hidden).length} hidden ⚠)` : ''}`],
			['External links 外部链接', String(r.externalLinks)],
			['Media 媒体文件', r.mediaCount ? `${r.mediaCount} · ${fmtBytes(r.mediaBytes)}` : '0'],
			['Pivot caches 透视缓存', String(r.pivotCaches)],
		];
		const grid = document.createElement('div');
		grid.className = 't-xlsx-grid';
		for (const [label, value] of rows) {
			const cell = document.createElement('div');
			cell.className = 't-xlsx-stat';
			const l = document.createElement('span');
			l.className = 't-xlsx-statlabel';
			l.append(bilingual(label, label));
			const v = document.createElement('strong');
			v.textContent = value;
			cell.append(l, v);
			grid.append(cell);
		}
		report.append(grid);

		// per-part size table (top 12)
		if (r.parts.length) {
			const table = document.createElement('table');
			table.className = 't-table';
			const thead = document.createElement('thead');
			thead.innerHTML = '<tr><th>Part 部件</th><th>Size 大小</th></tr>';
			const tbody = document.createElement('tbody');
			for (const p of r.parts.slice(0, 12)) {
				const tr = document.createElement('tr');
				const td1 = document.createElement('td');
				td1.textContent = p.path;
				const td2 = document.createElement('td');
				td2.textContent = fmtBytes(p.compressed);
				tr.append(td1, td2);
				tbody.append(tr);
			}
			table.append(thead, tbody);
			const wrap = document.createElement('div');
			wrap.className = 't-tablewrap';
			wrap.append(table);
			report.append(wrap);
		}
		if (r.warnings.length) {
			const warn = document.createElement('p');
			warn.className = 't-file-hint';
			warn.textContent = r.warnings.join(' · ');
			report.append(warn);
		}
	};

	const renderClean = (r: XlsxReport): void => {
		cleanBox.innerHTML = '';
		const unused = r.totalCellXfs - r.usedCellXfs;
		const hidden = r.definedNames.filter((n) => n.hidden).length;
		const extNames = r.definedNames.filter((n) => n.external).length;
		const mkOpt = (key: keyof CleanOptions, en: string, zh: string, count: string): HTMLLabelElement => {
			const label = document.createElement('label');
			label.className = 't-xlsx-opt';
			const cb = document.createElement('input');
			cb.type = 'checkbox';
			cb.checked = true;
			cb.dataset.opt = key;
			const span = document.createElement('span');
			span.append(bilingual(en, zh), Object.assign(document.createElement('em'), { textContent: count }));
			label.append(cb, span);
			return label;
		};
		if (unused > 0) cleanBox.append(mkOpt('stripUnusedStyles', 'Strip unused cell styles', '剥离未使用的单元格样式', ` (${unused})`));
		if (hidden > 0) cleanBox.append(mkOpt('removeHiddenNames', 'Remove hidden defined names', '删除隐藏命名区域', ` (${hidden})`));
		if (extNames > 0) cleanBox.append(mkOpt('removeExternalNames', 'Remove external-reference names', '删除外部引用命名区域', ` (${extNames})`));
		if (r.externalLinks > 0) cleanBox.append(mkOpt('removeExternalLinks', 'Unlink external workbooks', '解除外部工作簿链接', ` (${r.externalLinks})`));
		if (r.mediaCount > 0) cleanBox.append(mkOpt('removeMedia', 'Remove embedded media', '删除内嵌媒体', ` (${r.mediaCount})`));
		if (!cleanBox.children.length) {
			cleanBox.append(bilingual('Nothing obvious to clean — this workbook is already lean.', '没有明显可清理的内容——这个工作簿已经很干净了。'));
			return;
		}
		const btn = document.createElement('button');
		btn.type = 'button';
		btn.className = 't-btn t-primary';
		btn.append(bilingual('🧹 Clean & download', '🧹 清理并下载'));
		btn.addEventListener('click', () => {
			if (!currentBytes || !currentReport) return;
			const opts: CleanOptions = {
				stripUnusedStyles: false,
				removeHiddenNames: false,
				removeExternalNames: false,
				removeExternalLinks: false,
				removeMedia: false,
			};
			for (const cb of cleanBox.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')) {
				const k = cb.dataset.opt as keyof CleanOptions;
				if (k) opts[k] = cb.checked;
			}
			void (async () => {
				resultLine.textContent = '';
				const { blob, removedStyles, removedNames } = await cleanWorkbook(currentBytes as ArrayBuffer, opts);
				const url = URL.createObjectURL(blob);
				const a = document.createElement('a');
				a.href = url;
				a.download = (currentReport as XlsxReport).fileName.replace(/\.(xlsx|xlsm)$/i, '') + '-cleaned.xlsx';
				a.click();
				setTimeout(() => URL.revokeObjectURL(url), 5000);
				// before/after with a percentage badge: green when it shrank,
				// dim when re-zip overhead made it grow (tiny files)
				const delta = 1 - blob.size / (currentReport as XlsxReport).fileSize;
				const pct = `${delta >= 0 ? '−' : '+'}${Math.abs(delta * 100).toFixed(1)}%`;
				resultLine.append(
					bilingual(
						`Cleaned: ${removedStyles} styles, ${removedNames} names removed — ${fmtBytes(blob.size)} (was ${fmtBytes(currentReport.fileSize)})`,
						`清理完成：移除 ${removedStyles} 个样式、${removedNames} 个命名区域——${fmtBytes(blob.size)}（原 ${fmtBytes(currentReport.fileSize)}）`,
					),
					Object.assign(document.createElement('strong'), {
						textContent: ` ${pct}`,
						className: delta > 0.005 ? 't-xlsx-shrunk' : 't-xlsx-grew',
					}),
				);
			})();
		});
		cleanBox.append(btn);
	};

	// wire drop + pick
	const handleFile = (f: File): void => {
		void f.arrayBuffer().then((buf) => draw(buf, f.name));
	};
	drop.addEventListener('dragover', (e) => {
		e.preventDefault();
		drop.classList.add('t-droptarget');
	});
	drop.addEventListener('dragleave', () => drop.classList.remove('t-droptarget'));
	drop.addEventListener('drop', (e) => {
		e.preventDefault();
		drop.classList.remove('t-droptarget');
		const f = e.dataTransfer?.files?.[0];
		if (f) handleFile(f);
	});
	fileInput.addEventListener('change', () => {
		const f = fileInput.files?.[0];
		if (f) handleFile(f);
	});

	const privacy = document.createElement('p');
	privacy.className = 't-file-privacy';
	privacy.append(bilingual('🔒 The workbook is unpacked and re-packed entirely in this page — nothing is uploaded.', '🔒 工作簿在本页面内解包与重打包——绝不上传。'));

	const hint = document.createElement('p');
	hint.className = 't-file-hint';
	hint.append(
		bilingual(
			'Finds what makes workbooks slow: unused cell styles, hidden and external defined names, dead links, leftover media and pivot caches. The cleaned copy downloads with a -cleaned suffix.',
			'找出让工作簿变慢的东西：未使用的单元格样式、隐藏与外部命名区域、失效链接、残留媒体与透视缓存。清理后的文件以 -cleaned 后缀下载。',
		),
	);

	host.append(drop, privacy, report, cleanBox, resultLine, hint);

	// language-reactive labels that can't be plain span pairs
	onLang(() => {
		// dropzone label via title attr pattern: use setBilingual-style rewrite
		dropLabel.replaceChildren(
			document.documentElement.dataset.lang === 'zh'
				? document.createTextNode('把 .xlsx / .xlsm 文件拖到这里')
				: document.createTextNode('Drop a .xlsx / .xlsm file here'),
		);
	});
}
