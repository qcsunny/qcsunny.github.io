// QR generator page: textarea + ECC selector + canvas render + PNG download.
// The encoder is dynamically imported by the dispatcher, so its ~350 lines
// stay out of every other tool page's bundle.
//
// Every label here is built in the browser, so none of it can come from the
// .i18n-en/.i18n-zh pairs in the HTML: bilingual() supplies the pair for text
// nodes and langProp/langAttr rewrite the ones that cannot hold markup
// (<option> text, aria-label).

import { bilingual, langAttr, langProp, setBilingual } from './i18n';
import { encodeQr, QrCapacityError, type Ecc } from './qr/encoder';

const QUIET_ZONE = 4; // modules of white border, per spec
const MODULE_PX = 8; // canvas pixels per module

export function initQr(host: HTMLElement): void {
	host.innerHTML = '';

	const field = document.createElement('div');
	field.className = 't-field';
	const label = document.createElement('label');
	label.htmlFor = 't-qr-text';
	label.append(bilingual('Text or URL', '文本或网址'));
	const input = document.createElement('textarea');
	input.id = 't-qr-text';
	input.className = 't-textarea';
	input.rows = 3;
	input.spellcheck = false;
	input.value = 'https://qcsunny.org/';
	field.append(label, input);

	const eccField = document.createElement('div');
	eccField.className = 't-field t-eccfield';
	const eccLabel = document.createElement('label');
	eccLabel.htmlFor = 't-qr-ecc';
	eccLabel.append(bilingual('Error correction', '容错级别'));
	const eccSelect = document.createElement('select');
	eccSelect.id = 't-qr-ecc';
	for (const [value, en, zh] of [
		['M', 'M — balanced (default)', 'M — 均衡 (默认)'],
		['L', 'L — largest capacity', 'L — 容量最大'],
		['Q', 'Q — high', 'Q — 较高容错'],
		['H', 'H — highest (30% recoverable)', 'H — 最高容错 (可恢复 30%)'],
	] as const) {
		const opt = document.createElement('option');
		opt.value = value;
		langProp(opt, 'textContent', en, zh);
		eccSelect.append(opt);
	}
	eccField.append(eccLabel, eccSelect);

	const settings = document.createElement('div');
	settings.className = 't-qrsettings';
	settings.append(field, eccField);

	const meta = document.createElement('p');
	meta.className = 't-note';

	const canvas = document.createElement('canvas');
	canvas.className = 't-qr-canvas';
	canvas.setAttribute('role', 'img');
	langAttr(canvas, 'aria-label', 'Generated QR code', '生成的二维码');

	const error = document.createElement('p');
	error.className = 't-error';

	const actions = document.createElement('div');
	actions.className = 't-btnrow';
	const download = document.createElement('button');
	download.type = 'button';
	download.className = 't-btn';
	download.append(bilingual('Download PNG', '下载 PNG'));
	actions.append(download);

	host.append(settings, meta, canvas, error, actions);

	function update(): void {
		error.textContent = '';
		try {
			const qr = encodeQr(input.value, eccSelect.value as Ecc);
			const total = qr.size + QUIET_ZONE * 2;
			canvas.width = total * MODULE_PX;
			canvas.height = total * MODULE_PX;
			const ctx = canvas.getContext('2d');
			if (!ctx) {
				setBilingual(
					error,
					'Canvas is unavailable in this browser.',
					'当前浏览器不支持 Canvas 绘图。',
				);
				return;
			}
			ctx.fillStyle = '#ffffff';
			ctx.fillRect(0, 0, canvas.width, canvas.height);
			ctx.fillStyle = '#000000';
			for (let r = 0; r < qr.size; r++) {
				for (let c = 0; c < qr.size; c++) {
					if (qr.modules[r * qr.size + c]) {
						ctx.fillRect(
							(c + QUIET_ZONE) * MODULE_PX,
							(r + QUIET_ZONE) * MODULE_PX,
							MODULE_PX,
							MODULE_PX,
						);
					}
				}
			}
			const bytes = new TextEncoder().encode(input.value).length;
			const version = (qr.size - 17) / 4;
			setBilingual(
				meta,
				`Version ${version} · ${qr.size}×${qr.size} modules · ECC ${eccSelect.value} · ${bytes} bytes encoded.`,
				`版本 ${version} · ${qr.size}×${qr.size} 模块 · 容错 ${eccSelect.value} · 已编码 ${bytes} 字节。`,
			);
		} catch (err) {
			canvas.width = 0;
			canvas.height = 0;
			meta.textContent = '';
			if (err instanceof QrCapacityError) {
				setBilingual(
					error,
					`Text is ${err.bytes} bytes — the largest supported code (version 10, ECC ${err.ecc}) holds ${err.capacity}.`,
					`文本长度 ${err.bytes} 字节 — 本编码器支持的最大版本 (版本 10，容错 ${err.ecc}) 仅能容纳 ${err.capacity} 字节。`,
				);
			} else {
				setBilingual(
					error,
					err instanceof Error ? err.message : 'Could not encode this text.',
					err instanceof Error ? err.message : '无法编码这段文本。',
				);
			}
		}
	}

	download.addEventListener('click', () => {
		if (!canvas.width) return;
		const link = document.createElement('a');
		link.download = 'qr-code.png';
		link.href = canvas.toDataURL('image/png');
		link.click();
	});

	input.addEventListener('input', update);
	eccSelect.addEventListener('change', update);
	// Nothing here needs re-running on a language change: the readout and the
	// error line are .i18n-en/.i18n-zh pairs, and the <option> text is rewritten
	// by langProp above.
	update();
}
