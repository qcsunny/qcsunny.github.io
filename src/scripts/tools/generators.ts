// Renderers for the three generator tools: password, UUID and random numbers.
// All randomness comes from crypto.getRandomValues (rejection-sampled so the
// distribution stays uniform), never Math.random.

import type {
	GeneratorConfig,
	PasswordGenConfig,
	RandomGenConfig,
	UuidGenConfig,
} from '../../tools/registry';

// --- shared helpers -----------------------------------------------------------------

/** Uniform random integer in [0, maxExclusive) with rejection sampling. */
function randInt(maxExclusive: number): number {
	if (maxExclusive <= 0) return 0;
	const limit = Math.floor(0x100000000 / maxExclusive) * maxExclusive;
	const buf = new Uint32Array(1);
	do {
		crypto.getRandomValues(buf);
	} while (buf[0]! >= limit);
	return buf[0]! % maxExclusive;
}

async function copyText(text: string): Promise<boolean> {
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		return false;
	}
}

function makeCopyButton(getText: () => string): { wrap: HTMLElement; flash: () => void } {
	const wrap = document.createElement('span');
	wrap.className = 't-btnwrap';
	const btn = document.createElement('button');
	btn.type = 'button';
	btn.className = 't-btn';
	btn.textContent = 'Copy';
	const hint = document.createElement('span');
	hint.className = 't-copy-hint';
	hint.textContent = '';
	btn.addEventListener('click', () => {
		void copyText(getText()).then((okFlag) => {
			hint.textContent = okFlag ? 'Copied ✓' : 'Copy failed';
			setTimeout(() => (hint.textContent = ''), 1500);
		});
	});
	wrap.append(btn, hint);
	return { wrap, flash: () => (hint.textContent = 'Copied ✓') };
}

function checkRow(id: string, label: string, checked: boolean): HTMLLabelElement {
	const row = document.createElement('label');
	row.className = 't-checkrow';
	const box = document.createElement('input');
	box.type = 'checkbox';
	box.id = id;
	box.checked = checked;
	box.className = 't-check';
	row.append(box, document.createTextNode(label));
	return row;
}

// --- password -------------------------------------------------------------------------

const SETS = {
	lower: 'abcdefghijklmnopqrstuvwxyz',
	upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
	digits: '0123456789',
	symbols: '!@#$%^&*()-_=+[]{};:,.<>?/~',
};

function passwordHtml(chars: string, length: number): string {
	let out = '';
	for (let i = 0; i < length; i++) out += chars[randInt(chars.length)];
	return out;
}

function strengthLabel(entropyBits: number): { label: string; note: string } {
	if (entropyBits < 40) return { label: 'Weak', note: 'Fine for throwaway accounts, not for anything you care about.' };
	if (entropyBits < 60) return { label: 'Fair', note: 'Reasonable for most accounts with rate-limited login.' };
	if (entropyBits < 80) return { label: 'Strong', note: 'Resistant to offline brute force at scale.' };
	return { label: 'Very strong', note: 'Comfortably beyond brute-force reach.' };
}

function initPassword(host: HTMLElement, cfg: PasswordGenConfig): void {
	host.innerHTML = '';

	const lenLabel = document.createElement('span');
	lenLabel.className = 't-label';
	const lenRow = document.createElement('div');
	lenRow.className = 't-lenrow';
	const slider = document.createElement('input');
	slider.type = 'range';
	slider.id = 't-len';
	slider.min = String(cfg.minLen);
	slider.max = String(cfg.maxLen);
	slider.value = String(cfg.defLen);
	const lenNum = document.createElement('output');
	lenNum.htmlFor = 't-len';
	lenRow.append(slider, lenNum);

	const boxes = [
		{ id: 't-lower', label: 'a–z', on: true, chars: SETS.lower },
		{ id: 't-upper', label: 'A–Z', on: true, chars: SETS.upper },
		{ id: 't-digits', label: '0–9', on: true, chars: SETS.digits },
		{ id: 't-symbols', label: '!@#…', on: true, chars: SETS.symbols },
	];
	const checkRowEl = document.createElement('div');
	checkRowEl.className = 't-checkrow-group';
	for (const b of boxes) checkRowEl.append(checkRow(b.id, b.label, b.on));

	const noAmbiguousBox = checkRow('t-no-ambig', 'Exclude ambiguous (0, O, o, 1, l, I)', false);
	checkRowEl.append(noAmbiguousBox);

	const out = document.createElement('input');
	out.type = 'text';
	out.className = 't-passout';
	out.readOnly = true;
	out.setAttribute('aria-label', 'Generated password');

	const regen = document.createElement('button');
	regen.type = 'button';
	regen.className = 't-btn';
	regen.textContent = 'Regenerate';
	const copy = makeCopyButton(() => out.value);

	const strength = document.createElement('p');
	strength.className = 't-note';

	function update(): void {
		lenLabel.textContent = `Length: ${slider.value} characters`;
		lenNum.textContent = slider.value;
		const active = boxes.filter((b) => {
			const el = document.getElementById(b.id) as HTMLInputElement | null;
			return el?.checked ?? false;
		});
		if (!active.length) {
			out.value = '';
			strength.textContent = 'Select at least one character set.';
			return;
		}
		let pool = active.map((b) => b.chars).join('');
		const noAmbig = (document.getElementById('t-no-ambig') as HTMLInputElement | null)?.checked;
		if (noAmbig) {
			pool = pool.replace(/[0Oo1lI]/g, '');
		}
		if (!pool.length) {
			out.value = '';
			strength.textContent = 'Character pool is empty after exclusions.';
			return;
		}
		out.value = passwordHtml(pool, Number(slider.value));
		const bits = Number(slider.value) * Math.log2(pool.length);
		const { label, note } = strengthLabel(bits);
		strength.textContent = `${label} — about ${Math.round(bits)} bits of entropy. ${note}`;
	}

	host.append(lenLabel, lenRow, checkRowEl, out);
	const actions = document.createElement('div');
	actions.className = 't-btnrow';
	actions.append(regen, copy.wrap);
	host.append(actions, strength);

	slider.addEventListener('input', update);
	for (const b of boxes) {
		document.getElementById(b.id)?.addEventListener('change', update);
	}
	document.getElementById('t-no-ambig')?.addEventListener('change', update);
	regen.addEventListener('click', update);
	update();
}

// --- uuid (v4 + v7) ---------------------------------------------------------------------

function generateUuidV7(): string {
	const bytes = new Uint8Array(16);
	crypto.getRandomValues(bytes);
	const now = BigInt(Date.now());
	bytes[0] = Number((now >> 40n) & 0xffn);
	bytes[1] = Number((now >> 32n) & 0xffn);
	bytes[2] = Number((now >> 24n) & 0xffn);
	bytes[3] = Number((now >> 16n) & 0xffn);
	bytes[4] = Number((now >> 8n) & 0xffn);
	bytes[5] = Number(now & 0xffn);
	bytes[6] = (bytes[6]! & 0x0f) | 0x70; // version 7
	bytes[8] = (bytes[8]! & 0x3f) | 0x80; // variant 10xx
	let hex = '';
	for (let i = 0; i < 16; i++) {
		const b = bytes[i]!.toString(16).padStart(2, '0');
		if (i === 4 || i === 6 || i === 8 || i === 10) hex += '-';
		hex += b;
	}
	return hex;
}

function initUuid(host: HTMLElement, cfg: UuidGenConfig): void {
	host.innerHTML = '';

	const form = document.createElement('div');
	form.className = 't-form';

	const controlsRow = document.createElement('div');
	controlsRow.className = 't-btnrow';

	const verField = document.createElement('div');
	verField.className = 't-field';
	const verLabel = document.createElement('label');
	verLabel.htmlFor = 't-uuid-ver';
	verLabel.textContent = 'Version';
	const verSelect = document.createElement('select');
	verSelect.id = 't-uuid-ver';
	const optV4 = document.createElement('option');
	optV4.value = 'v4';
	optV4.textContent = 'UUID v4 (Random / 随机)';
	const optV7 = document.createElement('option');
	optV7.value = 'v7';
	optV7.textContent = 'UUID v7 (Time-ordered / 时间有序)';
	verSelect.append(optV4, optV7);
	verField.append(verLabel, verSelect);

	const countField = document.createElement('div');
	countField.className = 't-field';
	const countLabel = document.createElement('label');
	countLabel.htmlFor = 't-count';
	countLabel.textContent = 'Count';
	const count = document.createElement('input');
	count.type = 'number';
	count.id = 't-count';
	count.min = '1';
	count.max = String(cfg.maxCount);
	count.value = String(cfg.defCount);
	countField.append(countLabel, count);

	const hyphenBox = checkRow('t-uuid-hyphen', 'Hyphens (-)', true);
	const upperBox = checkRow('t-uuid-upper', 'Uppercase', false);

	const gen = document.createElement('button');
	gen.type = 'button';
	gen.className = 't-btn t-primary';
	gen.textContent = 'Generate';

	controlsRow.append(verField, countField, hyphenBox, upperBox, gen);

	const out = document.createElement('textarea');
	out.className = 't-textarea t-mono t-out';
	out.rows = 8;
	out.readOnly = true;
	out.setAttribute('aria-label', 'Generated UUIDs');
	const copy = makeCopyButton(() => out.value);
	const note = document.createElement('p');
	note.className = 't-note';

	function update(): void {
		const n = Math.min(Math.max(Math.floor(Number(count.value) || 1), 1), cfg.maxCount);
		count.value = String(n);
		const ver = verSelect.value;
		const withHyphen = (document.getElementById('t-uuid-hyphen') as HTMLInputElement)?.checked ?? true;
		const uppercase = (document.getElementById('t-uuid-upper') as HTMLInputElement)?.checked ?? false;

		const lines: string[] = [];
		for (let i = 0; i < n; i++) {
			let id = ver === 'v7' ? generateUuidV7() : crypto.randomUUID();
			if (!withHyphen) id = id.replace(/-/g, '');
			if (uppercase) id = id.toUpperCase();
			lines.push(id);
		}
		out.value = lines.join('\n');
		note.textContent = ver === 'v7'
			? 'UUID v7: 48-bit millisecond timestamp + 74 bits randomness (RFC 9562). Naturally sortable and database index friendly.'
			: 'UUID v4: 122 cryptographically secure random bits (RFC 4122). Uniform distribution with zero correlation.';
	}

	const copyRow = document.createElement('div');
	copyRow.className = 't-btnrow';
	copyRow.append(copy.wrap);

	host.append(controlsRow, out, copyRow, note);
	gen.addEventListener('click', update);
	count.addEventListener('change', update);
	verSelect.addEventListener('change', update);
	hyphenBox.querySelector('input')?.addEventListener('change', update);
	upperBox.querySelector('input')?.addEventListener('change', update);
	update();
}

// --- random numbers -------------------------------------------------------------------------

function initRandom(host: HTMLElement, cfg: RandomGenConfig): void {
	host.innerHTML = '';

	const form = document.createElement('div');
	form.className = 't-form';
	const defs: { id: string; label: string; value: string; min?: string; max?: string }[] = [
		{ id: 't-min', label: 'Minimum (inclusive)', value: String(cfg.defMin) },
		{ id: 't-max', label: 'Maximum (inclusive)', value: String(cfg.defMax) },
		{ id: 't-count', label: 'How many', value: String(cfg.defCount), min: '1', max: '1000' },
	];
	for (const d of defs) {
		const field = document.createElement('div');
		field.className = 't-field';
		const lab = document.createElement('label');
		lab.htmlFor = d.id;
		lab.textContent = d.label;
		const input = document.createElement('input');
		input.type = 'number';
		input.id = d.id;
		input.value = d.value;
		if (d.min) input.min = d.min;
		if (d.max) input.max = d.max;
		field.append(lab, input);
		form.append(field);
	}
	const uniqueBox = checkRow('t-unique', 'No duplicates', false);
	form.append(uniqueBox);

	const gen = document.createElement('button');
	gen.type = 'button';
	gen.className = 't-btn t-primary';
	gen.textContent = 'Generate';
	const actions = document.createElement('div');
	actions.className = 't-btnrow';
	const copy = makeCopyButton(() => out.value);
	actions.append(gen, copy.wrap);

	const out = document.createElement('textarea');
	out.className = 't-textarea t-mono t-out';
	out.readOnly = true;
	out.setAttribute('aria-label', 'Random numbers');
	const note = document.createElement('p');
	note.className = 't-note';

	function update(): void {
		const min = Math.ceil(Number((document.getElementById('t-min') as HTMLInputElement).value) || 0);
		const max = Math.floor(Number((document.getElementById('t-max') as HTMLInputElement).value) || 0);
		let count = Math.min(Math.max(Math.floor(Number((document.getElementById('t-count') as HTMLInputElement).value) || 1), 1), 1000);
		const unique = (document.getElementById('t-unique') as HTMLInputElement).checked;
		if (max < min) {
			out.value = '';
			note.textContent = 'Maximum must be ≥ minimum.';
			return;
		}
		const range = max - min + 1;
		if (unique) {
			count = Math.min(count, range);
			const pool = Array.from({ length: range }, (_, i) => min + i);
			// Fisher–Yates with crypto randomness
			for (let i = pool.length - 1; i > 0; i--) {
				const j = randInt(i + 1);
				[pool[i], pool[j]] = [pool[j]!, pool[i]!];
			}
			out.value = pool.slice(0, count).join('\n');
			note.textContent = `${count} unique number${count === 1 ? '' : 's'} drawn from ${min} to ${max} (range of ${range}).`;
		} else {
			const lines: number[] = [];
			for (let i = 0; i < count; i++) lines.push(min + randInt(range));
			out.value = lines.join('\n');
			note.textContent = `${count} number${count === 1 ? '' : 's'} from ${min} to ${max}, duplicates allowed.`;
		}
	}

	host.append(form, actions, out, note);
	gen.addEventListener('click', update);
	for (const id of ['t-min', 't-max', 't-count']) {
		document.getElementById(id)?.addEventListener('change', update);
	}
	document.getElementById('t-unique')?.addEventListener('change', update);
	update();
}

// --- entry -----------------------------------------------------------------------------------

export function initGenerator(host: HTMLElement, config: GeneratorConfig): void {
	switch (config.generator) {
		case 'password':
			initPassword(host, config);
			break;
		case 'uuid':
			initUuid(host, config);
			break;
		case 'random':
			initRandom(host, config);
			break;
	}
}
