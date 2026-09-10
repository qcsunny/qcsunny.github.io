// Meta tag generator + Open Graph / Twitter card preview in one page.
// Live: type the fields, the <head> block and a pixel-honest social share
// card preview rebuild on every keystroke. Nothing is uploaded — the preview
// is DOM+CSS, external image URLs are deliberately never fetched.

import { isZh, onLang } from './i18n';
import { createWorkbench } from './workbench';

interface Fields {
	title: string;
	desc: string;
	url: string;
	image: string;
	site: string;
	type: string;
	card: string;
}

function esc(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function attr(s: string): string {
	return esc(s).replace(/\n/g, ' ');
}

/** The share-card host shown under the fields: domain, title, description,
 *  and an image placeholder block (the image itself is never loaded). */
function domainOf(url: string): string {
	try {
		return new URL(url).hostname.replace(/^www\./, '');
	} catch {
		return url.replace(/^https?:\/\//, '').split('/')[0] || 'example.com';
	}
}

export function initMetaOg(host: HTMLElement): void {
	let wb: ReturnType<typeof createWorkbench>;

	const F: Fields = { title: '', desc: '', url: '', image: '', site: '', type: 'website', card: 'summary_large_image' };

	// --- field row, rendered ABOVE the workbench input -----------------------
	const fieldRow = document.createElement('div');
	fieldRow.className = 't-filerow t-metafields';
	const makeText = (key: keyof Fields, en: string, zh: string, ph: string): HTMLInputElement => {
		const wrap = document.createElement('label');
		wrap.className = 't-metafield';
		wrap.append(
			Object.assign(document.createElement('span'), { className: 'i18n-en', textContent: en }),
			Object.assign(document.createElement('span'), { className: 'i18n-zh', textContent: zh }),
		);
		const input = document.createElement('input');
		input.type = 'text';
		input.spellcheck = false;
		input.placeholder = ph;
		input.addEventListener('input', () => {
			F[key] = input.value;
			render();
		});
		wrap.append(input);
		fieldRow.append(wrap);
		return input;
	};
	makeText('title', 'Page title', '页面标题', 'My Page — 60 chars or less');
	makeText('desc', 'Description', '描述', 'What this page is about, ~160 chars');
	makeText('url', 'Canonical URL', '规范 URL', 'https://example.com/page');
	makeText('image', 'Image URL (og:image)', '图片 URL（og:image）', 'https://example.com/og.png');
	makeText('site', 'Site name (og:site_name)', '站点名（og:site_name）', 'Example');

	const makeSelect = (key: 'type' | 'card', en: string, zh: string, options: { value: string; label: string }[]): void => {
		const wrap = document.createElement('label');
		wrap.className = 't-metafield';
		wrap.append(
			Object.assign(document.createElement('span'), { className: 'i18n-en', textContent: en }),
			Object.assign(document.createElement('span'), { className: 'i18n-zh', textContent: zh }),
		);
		const sel = document.createElement('select');
		for (const o of options) {
			const opt = document.createElement('option');
			opt.value = o.value;
			opt.textContent = o.label;
			sel.append(opt);
		}
		sel.addEventListener('change', () => {
			F[key] = sel.value;
			render();
		});
		wrap.append(sel);
		fieldRow.append(wrap);
	};
	makeSelect('type', 'og:type', 'og:type', [
		{ value: 'website', label: 'website' },
		{ value: 'article', label: 'article' },
		{ value: 'product', label: 'product' },
	]);
	makeSelect('card', 'twitter:card', 'twitter:card', [
		{ value: 'summary_large_image', label: 'summary_large_image' },
		{ value: 'summary', label: 'summary' },
	]);

	// --- the share-card preview ------------------------------------------------
	const preview = document.createElement('div');
	preview.className = 't-ogpreview';
	// CSS lives in ToolShell.astro; the preview is bilingual via spans in the
	// label, the card content itself is the user's own text.

	const render = (): void => {
		const zh = isZh();
		const domain = domainOf(F.url || 'https://example.com/');
		const title = F.title || (zh ? '页面标题（60 字符内）' : 'Page title (60 chars or less)');
		const desc = F.desc || (zh ? '描述会显示在这里（约 160 字符）。' : 'The description shows up here (~160 chars).');
		const img = F.image || '';

		const lines: string[] = [];
		if (F.title) lines.push(`<title>${esc(F.title)}</title>`);
		if (F.desc) lines.push(`<meta name="description" content="${attr(F.desc)}">`);
		if (F.url) lines.push(`<link rel="canonical" href="${attr(F.url)}">`);
		if (F.site) lines.push(`<meta property="og:site_name" content="${attr(F.site)}">`);
		lines.push(`<meta property="og:type" content="${F.type}">`);
		if (F.title) lines.push(`<meta property="og:title" content="${attr(F.title)}">`);
		if (F.desc) lines.push(`<meta property="og:description" content="${attr(F.desc)}">`);
		if (F.url) lines.push(`<meta property="og:url" content="${attr(F.url)}">`);
		if (img) lines.push(`<meta property="og:image" content="${attr(img)}">`);
		lines.push(`<meta name="twitter:card" content="${F.card}">`);
		if (F.title) lines.push(`<meta name="twitter:title" content="${attr(F.title)}">`);
		if (F.desc) lines.push(`<meta name="twitter:description" content="${attr(F.desc)}">`);
		if (img) lines.push(`<meta name="twitter:image" content="${attr(img)}">`);
		wb.outputArea.value = lines.join('\n');

		// preview card
		preview.innerHTML = '';
		const card = document.createElement('div');
		card.className = F.card === 'summary' ? 't-ogcard t-ogcard-small' : 't-ogcard';
		const imgBox = document.createElement('div');
		imgBox.className = 't-ogcard-img';
		imgBox.textContent = img ? '🖼 ' + img.split('/').pop() : '🖼 1200 × 630';
		const body = document.createElement('div');
		body.className = 't-ogcard-body';
		const d = document.createElement('span');
		d.className = 't-ogcard-domain';
		d.textContent = domain.toUpperCase();
		const t = document.createElement('strong');
		t.className = 't-ogcard-title';
		t.textContent = title;
		const p = document.createElement('span');
		p.className = 't-ogcard-desc';
		p.textContent = desc;
		body.append(d, t, p);
		if (F.card === 'summary') {
			const thumb = document.createElement('div');
			thumb.className = 't-ogcard-img t-ogcard-thumb';
			thumb.textContent = img ? '🖼' : '🖼 1:1';
			card.append(thumb, body);
		} else {
			card.append(imgBox, body);
		}
		preview.append(card);
	};

	wb = createWorkbench({
		host,
		inputTitle: 'Field values (edit above)',
		inputTitleZh: '字段值（在上方编辑）',
		outputTitle: 'Generated <head> tags',
		outputTitleZh: '生成的 <head> 标签',
		inputPlaceholder: 'The inputs above drive everything — this box mirrors the field values.',
		inputPlaceholderZh: '上方输入框驱动一切——此框仅镜像字段值。',
		outputPlaceholder: 'The generated meta / OG / Twitter tags appear here as you type…',
		outputPlaceholderZh: '输入时生成的 meta / OG / Twitter 标签会显示在此处…',
		buttons: [
			{
				label: 'Copy HTML',
				labelZh: '复制 HTML',
				primary: true,
				onClick: async () => {
					await navigator.clipboard.writeText(wb.outputArea.value);
					wb.updateStatus('valid', '✓ Copied to clipboard!', '✓ 已复制到剪贴板！');
				},
			},
		],
		onInput: () => {},
		onClear: () => {
			Object.assign(F, { title: '', desc: '', url: '', image: '', site: '', type: 'website', card: 'summary_large_image' });
			for (const input of fieldRow.querySelectorAll('input')) input.value = '';
			render();
			wb.updateStatus('idle', 'Cleared', '已清空');
		},
		initialStatus: 'Fill the fields above — tags and the share-card preview update live.',
		initialStatusZh: '填写上方字段——标签与分享卡片预览实时更新。',
	});

	// The workbench clears the host: both custom rows go in after it renders.
	host.insertBefore(fieldRow, host.firstChild ?? null);
	host.insertBefore(preview, host.firstChild ?? null);

	// The input box is a passive mirror; keep it in sync and start the render.
	const syncMirror = () => {
		wb.inputArea.value = Object.entries(F)
			.map(([k, v]) => `${k}: ${v}`)
			.join('\n');
	};
	render();
	syncMirror();

	// Preview + placeholder texts rebuild in the other language on switch.
	onLang(render);
}
