// QR generator page: textarea + ECC selector + canvas render + PNG download.
// The encoder is dynamically imported by the dispatcher, so its ~350 lines
// stay out of every other tool page's bundle.

import { encodeQr, type Ecc } from './qr/encoder';

const QUIET_ZONE = 4; // modules of white border, per spec
const MODULE_PX = 8; // canvas pixels per module

export function initQr(host: HTMLElement): void {
	host.innerHTML = '';

	const field = document.createElement('div');
	field.className = 't-field';
	const label = document.createElement('label');
	label.htmlFor = 't-qr-text';
	label.textContent = 'Text or URL';
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
	eccLabel.textContent = 'Error correction';
	const eccSelect = document.createElement('select');
	eccSelect.id = 't-qr-ecc';
	for (const [value, text] of [
		['M', 'M — balanced (default)'],
		['L', 'L — largest capacity'],
		['Q', 'Q — high'],
		['H', 'H — highest (30% recoverable)'],
	] as const) {
		const opt = document.createElement('option');
		opt.value = value;
		opt.textContent = text;
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
	canvas.setAttribute('aria-label', 'Generated QR code');

	const error = document.createElement('p');
	error.className = 't-error';

	const actions = document.createElement('div');
	actions.className = 't-btnrow';
	const download = document.createElement('button');
	download.type = 'button';
	download.className = 't-btn';
	download.textContent = 'Download PNG';
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
				error.textContent = 'Canvas is unavailable in this browser.';
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
			meta.textContent = `Version ${(qr.size - 17) / 4} · ${qr.size}×${qr.size} modules · ECC ${eccSelect.value} · ${bytes} bytes encoded.`;
		} catch (err) {
			canvas.width = 0;
			canvas.height = 0;
			meta.textContent = '';
			error.textContent = err instanceof Error ? err.message : 'Could not encode this text.';
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
	update();
}
