// Client entry for every registry-driven tool page. The page's <html> carries
// data-tool-kind / data-tool-category / data-tool-slug (set by ToolShell);
// dispatch to the matching widget renderer. Two lazy layers keep the shared
// chunk small (perf-budget pins it < 60 KB brotli): the big widget modules
// (QR, JSON, SQL, …) are dynamically imported, and the tool's own config —
// form fields, compute functions, transforms — comes from its category's data
// module via catalog.ts, so a page never downloads another category's tools.

import type { ToolCategory } from '../../tools/registry';
import { initForm } from './form';
import { initConverter } from './converter';

void (async () => {
	const root = document.documentElement;
	const kind = root.dataset.toolKind;
	const category = root.dataset.toolCategory ?? '';
	const slug = root.dataset.toolSlug ?? '';

	if (!kind || kind === 'redirect') return;

	const host = document.querySelector<HTMLElement>('#t-root');
	if (!host) throw new Error('tools: #t-root missing');

	// Only config-carrying kinds need their registry entry; every widget kind
	// (qr, color, json, sql, jwt, url, xml, css, html, markdown) renders standalone.
	if (kind === 'form' || kind === 'converter' || kind === 'text' || kind === 'generator') {
		const { loadCategoryEntries } = await import('../../tools/catalog');
		const entries = await loadCategoryEntries(category as ToolCategory);
		const entry = entries.find((e) => e.slug === slug);
		if (!entry) throw new Error(`tools: unknown entry ${category}/${slug}`);

		switch (entry.kind) {
			case 'form':
				initForm(host, entry.config);
				break;
			case 'converter':
				initConverter(host, entry.config);
				break;
			case 'text':
				await import('./text').then((m) => m.initText(host, entry.config));
				break;
			case 'generator':
				await import('./generators').then((m) => m.initGenerator(host, entry.config));
				break;
		}
		return;
	}

	switch (kind) {
		case 'qr':
			await import('./qr').then((m) => m.initQr(host));
			break;
		case 'color':
			await import('./color').then((m) => m.initColor(host));
			break;
		case 'json':
			await import('./json').then((m) => m.initJson(host));
			break;
		case 'sql':
			await import('./sql').then((m) => m.initSql(host));
			break;
		case 'jwt':
			await import('./jwt').then((m) => m.initJwt(host));
			break;
		case 'url':
			await import('./url').then((m) => m.initUrl(host));
			break;
		case 'xml':
			await import('./xml').then((m) => m.initXml(host));
			break;
		case 'css':
			await import('./css').then((m) => m.initCss(host));
			break;
		case 'html':
			await import('./html').then((m) => m.initHtml(host));
			break;
		case 'markdown':
			await import('./markdown').then((m) => m.initMarkdown(host));
			break;
	}
})();
