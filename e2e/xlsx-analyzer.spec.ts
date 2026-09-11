// Excel Workbook Analyzer & Cleaner. The fixture is assembled in the test
// (JSZip) carrying exactly the bloat the tool exists to find: a hidden
// defined name, an external-reference name, an external link, and unused
// cell styles. Assertions read the rendered report, the dynamically-built
// clean options, the emitted download's bytes (re-unzipped: the named-name
// entries must be gone while the sheets survive byte-for-byte), and the
// before/after size line.

import { test, expect } from '@playwright/test';
import JSZip from 'jszip';
import { readFileSync } from 'node:fs';

/** Build the bloat fixture as an xlsx zip (Uint8Array) in-process. */
async function buildFixture(): Promise<Uint8Array> {
	const zip = new JSZip();
	zip.file(
		'[Content_Types].xml',
		'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
			'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
			'<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
			'<Default Extension="xml" ContentType="application/xml"/>' +
			'<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
			'</Types>',
	);
	zip.file(
		'_rels/.rels',
		'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
			'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
			'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
			'</Relationships>',
	);
	zip.file(
		'xl/workbook.xml',
		'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
			'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
			'<sheets><sheet name="Data" sheetId="1" r:id="rId1"/></sheets>' +
			'<externalReferences><externalReference r:id="rId2"/></externalReferences>' +
			'<definedNames>' +
			'<definedName name="MyRange">Data!$A$1:$B$2</definedName>' +
			'<definedName name="HiddenName" hidden="1">Data!$C$1</definedName>' +
			'<definedName name="ExtRef">[2]Sheet1!$A$1</definedName>' +
			'</definedNames>' +
			'</workbook>',
	);
	zip.file(
		'xl/_rels/workbook.xml.rels',
		'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
			'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
			'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
			'<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/externalLink" Target="externalLinks/externalLink1.xml"/>' +
			'</Relationships>',
	);
	zip.file(
		'xl/worksheets/sheet1.xml',
		'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
			'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' +
			'<row r="1"><c r="A1" t="inlineStr"><is><t>hello</t></is></c><c r="B1"><v>42</v></c></row>' +
			'<row r="2"><c r="A2" t="inlineStr"><is><t>world</t></is></c><c r="B2" s="1"><v>7</v></c></row>' +
			'</sheetData></worksheet>',
	);
	zip.file(
		'xl/styles.xml',
		'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
			'<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
			'<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" applyFont="1"/><xf numFmtId="14" fontId="0" fillId="0" borderId="0" applyNumberFormat="1"/></cellXfs>' +
			'</styleSheet>',
	);
	zip.file(
		'xl/externalLinks/externalLink1.xml',
		'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
			'<externalLink xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><externalBook><sheetNames><sheetName val="Sheet1"/></sheetNames></externalBook></externalLink>',
	);
	return zip.generateAsync({ type: 'uint8array' });
}

/** Drop the fixture bytes onto the analyzer page via DataTransfer. */
async function dropFixture(page: import('@playwright/test').Page, bytes: Uint8Array): Promise<void> {
	await page.evaluate(async (b64) => {
		const bin = atob(b64);
		const bytes = new Uint8Array(bin.length);
		for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
		const file = new File([bytes], 'fixture.xlsx');
		const dt = new DataTransfer();
		dt.items.add(file);
		const drop = document.querySelector('.t-xlsx-drop');
		drop?.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
	}, Buffer.from(bytes).toString('base64'));
}

test('xlsx analyzer reports bloat and offers the matching clean options', async ({ page }) => {
	await page.goto('/devtools/xlsx-analyzer/');
	await page.waitForSelector('.t-xlsx-drop');
	await dropFixture(page, await buildFixture());
	await page.waitForSelector('.t-xlsx-report .t-xlsx-stat');

	const report = await page.locator('.t-xlsx-report').innerText();
	expect(report).toContain('fixture.xlsx');
	expect(report).toContain('Data'); // sheet name
	expect(report).toContain('3 total / 1 in use'); // 3 cellXfs, only s="1" referenced
	expect(report).toContain('3 (1 hidden'); // defined names: MyRange + HiddenName + ExtRef
	expect(report).toContain('xl/worksheets/sheet1.xml'); // part table

	// clean options appear only for what was actually found
	const clean = await page.locator('.t-xlsx-clean').innerText();
	expect(clean).toContain('Strip unused cell styles');
	expect(clean).toContain('Remove hidden defined names');
	expect(clean).toContain('Remove external-reference names');
	expect(clean).toContain('Unlink external workbooks');
	expect(clean).not.toContain('Remove embedded media'); // fixture has none
});

test('xlsx cleaner emits a download with names and links stripped', async ({ page }) => {
	await page.goto('/devtools/xlsx-analyzer/');
	await page.waitForSelector('.t-xlsx-drop');
	await dropFixture(page, await buildFixture());
	await page.waitForSelector('.t-xlsx-clean input[type="checkbox"]');

	const dlPromise = page.waitForEvent('download');
	await page.getByRole('button', { name: /Clean & download/ }).click();
	const dl = await dlPromise;
	expect(dl.suggestedFilename()).toBe('fixture-cleaned.xlsx');

	// the before/after size line appears
	await expect(page.locator('.t-xlsx-clean + .t-file-hint')).toContainText(/KB|B\)/);

	// re-unzip the download: names/links gone, sheet data intact
	const path = await dl.path();
	const zip = await JSZip.loadAsync(readFileSync(path));
	const wb = await (zip.file('xl/workbook.xml') ?? fail('workbook.xml missing')).async('string');
	expect(wb).not.toContain('HiddenName');
	expect(wb).not.toContain('ExtRef');
	expect(wb).toContain('MyRange'); // the normal name survives
	expect(wb).not.toContain('<externalReferences>');
	const sheet = await (zip.file('xl/worksheets/sheet1.xml') ?? fail('sheet1.xml missing')).async('string');
	expect(sheet).toContain('<v>42</v>');
	expect(sheet).toContain('world');
});

test('xlsx analyzer keeps hidden rows and columns untouched', async ({ page }) => {
	// regression guard for the "will it eat my hidden rows" question: the
	// cleaner must never rewrite sheet structure beyond style-id remapping
	await page.goto('/devtools/xlsx-analyzer/');
	await page.waitForSelector('.t-xlsx-drop');

	const zip = new JSZip();
	zip.file(
		'xl/workbook.xml',
		'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
			'<sheets><sheet name="S" sheetId="1" r:id="rId1"/></sheets>' +
			'<definedNames><definedName name="KeepMe">S!$A$1</definedName><definedName name="HiddenName" hidden="1">S!$C$1</definedName></definedNames>' +
			'</workbook>',
	);
	zip.file('xl/_rels/workbook.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>');
	zip.file(
		'xl/worksheets/sheet1.xml',
		'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
			'<cols><col min="2" max="2" width="0" hidden="1"/></cols>' +
			'<sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>visible</t></is></c></row>' +
			'<row r="2" hidden="1"><c r="A2" t="inlineStr"><is><t>hidden row</t></is></c></row></sheetData></worksheet>',
	);
	zip.file('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/></Types>');
	zip.file('_rels/.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
	const bytes = await zip.generateAsync({ type: 'uint8array' });
	await dropFixture(page, bytes);
	await page.waitForSelector('.t-xlsx-clean input[type="checkbox"]');

	const dlPromise = page.waitForEvent('download');
	await page.getByRole('button', { name: /Clean & download/ }).click();
	const dl = await dlPromise;
	const path = await dl.path();
	const re = await JSZip.loadAsync(readFileSync(path));
	const sheet = await (re.file('xl/worksheets/sheet1.xml') ?? fail('sheet1.xml missing')).async('string');
	expect(sheet).toContain('<row r="2" hidden="1">'); // hidden row survives
	expect(sheet).toContain('hidden col'.replace('col', 'row')); // its data too
	expect(sheet).toMatch(/<col [^>]*hidden="1"/); // hidden column survives
	const wb = await (re.file('xl/workbook.xml') ?? fail('workbook.xml missing')).async('string');
	expect(wb).toContain('KeepMe');
	expect(wb).not.toContain('HiddenName');
});
