// Client entry for every registry-driven tool page. The page's <html> carries
// data-tool-kind / data-tool-category / data-tool-slug (set by ToolShell);
// dispatch to the matching widget renderer. QR is dynamically imported so its
// ~400-line encoder stays out of every other page's bundle.

import { findEntry } from '../../tools/registry';
import { initForm } from './form';
import { initConverter } from './converter';

const root = document.documentElement;
const kind = root.dataset.toolKind;
const category = root.dataset.toolCategory ?? '';
const slug = root.dataset.toolSlug ?? '';

if (kind && kind !== 'redirect') {
	const entry = findEntry(category, slug);
	if (!entry) throw new Error(`tools: unknown entry ${category}/${slug}`);
	const host = document.querySelector<HTMLElement>('#t-root');
	if (!host) throw new Error('tools: #t-root missing');

	switch (entry.kind) {
		case 'form':
			initForm(host, entry.config);
			break;
		case 'converter':
			initConverter(host, entry.config);
			break;
		case 'text':
			void import('./text').then((m) => m.initText(host, entry.config));
			break;
		case 'generator':
			void import('./generators').then((m) => m.initGenerator(host, entry.config));
			break;
		case 'qr':
			void import('./qr').then((m) => m.initQr(host));
			break;
		case 'color':
			void import('./color').then((m) => m.initColor(host));
			break;
		case 'json':
			void import('./json').then((m) => m.initJson(host));
			break;
		case 'sql':
			void import('./sql').then((m) => m.initSql(host));
			break;
		case 'jwt':
			void import('./jwt').then((m) => m.initJwt(host));
			break;
		case 'url':
			void import('./url').then((m) => m.initUrl(host));
			break;
		case 'xml':
			void import('./xml').then((m) => m.initXml(host));
			break;
		case 'css':
			void import('./css').then((m) => m.initCss(host));
			break;
		case 'html':
			void import('./html').then((m) => m.initHtml(host));
			break;
	}
}
