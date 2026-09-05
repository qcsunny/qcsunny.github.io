// Renderers for the three generator tools: password, UUID and random numbers.
// All randomness comes from crypto.getRandomValues (rejection-sampled so the
// distribution stays uniform), never Math.random.

import { bilingual, langAttr, langProp, setBilingual } from './i18n';
import type {
	GeneratorConfig,
	PasswordGenConfig,
	RandomGenConfig,
	UuidGenConfig,
} from '../../tools/registry';

// --- shared helpers -----------------------------------------------------------------

/** Uniform random integer in [0, maxExclusive) with rejection sampling.
 *
 *  Two draw widths, because one 32-bit word cannot cover the whole range the
 *  random-number tool accepts. Above 2^32 the old single-word version computed
 *  `Math.floor(0x100000000 / maxExclusive) * maxExclusive === 0`, which turned
 *  `while (buf[0] >= limit)` into `while (true)` — a hard tab freeze with no
 *  allocation to hint at it. `min 0 / max 5000000000` was enough to hit it. */
function randInt(maxExclusive: number): number {
	if (!Number.isFinite(maxExclusive) || maxExclusive <= 1) return 0;
	const n = Math.floor(maxExclusive);

	if (n <= 0x100000000) {
		const limit = Math.floor(0x100000000 / n) * n;
		const buf = new Uint32Array(1);
		do {
			crypto.getRandomValues(buf);
		} while (buf[0]! >= limit);
		return buf[0]! % n;
	}

	// 21 high bits + 32 low bits = a 53-bit draw, the widest integer doubles
	// represent exactly. floor(2^53 / n) >= 1 for every n <= MAX_SAFE_INTEGER,
	// so `limit` can never collapse to zero here.
	const limit = Math.floor(0x20000000000000 / n) * n;
	const buf = new Uint32Array(2);
	let v: number;
	do {
		crypto.getRandomValues(buf);
		v = (buf[0]! >>> 11) * 0x100000000 + buf[1]!;
	} while (v >= limit);
	return v % n;
}

/** `count` distinct values from [0, range), uniform, without materialising the
 *  range. A partial Fisher–Yates over a *virtual* identity array: only the
 *  positions that actually move are stored, so this is O(count) in time and
 *  memory whether the range is 100 or 10^15. Drawing 6 winners out of a
 *  million entrants used to allocate a million-element array and perform a
 *  million crypto draws to throw all but six of them away. */
function sampleWithoutReplacement(range: number, count: number): number[] {
	const moved = new Map<number, number>();
	const at = (i: number) => moved.get(i) ?? i;
	const picked: number[] = [];
	for (let i = 0; i < count; i++) {
		const j = i + randInt(range - i);
		picked.push(at(j));
		moved.set(j, at(i));
	}
	return picked;
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
	btn.append(bilingual('Copy', '复制'));
	const hint = document.createElement('span');
	hint.className = 't-copy-hint';
	const copied = (): void => setBilingual(hint, 'Copied ✓', '已复制 ✓');
	btn.addEventListener('click', () => {
		void copyText(getText()).then((okFlag) => {
			if (okFlag) copied();
			else setBilingual(hint, 'Copy failed', '复制失败');
			setTimeout(() => hint.replaceChildren(), 1500);
		});
	});
	wrap.append(btn, hint);
	return { wrap, flash: copied };
}

function checkRow(id: string, label: string, checked: boolean, labelZh?: string): HTMLLabelElement {
	const row = document.createElement('label');
	row.className = 't-checkrow';
	const box = document.createElement('input');
	box.type = 'checkbox';
	box.id = id;
	box.checked = checked;
	box.className = 't-check';
	row.append(box, bilingual(label, labelZh));
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

interface Strength {
	label: string;
	note: string;
	labelZh: string;
	noteZh: string;
}

function strengthLabel(entropyBits: number): Strength {
	if (entropyBits < 40)
		return {
			label: 'Weak',
			note: 'Fine for throwaway accounts, not for anything you care about.',
			labelZh: '偏弱',
			noteZh: '仅够用于一次性账号，别用在任何你在意的地方。',
		};
	if (entropyBits < 60)
		return {
			label: 'Fair',
			note: 'Reasonable for most accounts with rate-limited login.',
			labelZh: '一般',
			noteZh: '对有登录频率限制的普通账号来说够用。',
		};
	if (entropyBits < 80)
		return {
			label: 'Strong',
			note: 'Resistant to offline brute force at scale.',
			labelZh: '较强',
			noteZh: '足以抵御大规模离线暴力破解。',
		};
	return {
		label: 'Very strong',
		note: 'Comfortably beyond brute-force reach.',
		labelZh: '很强',
		noteZh: '远超暴力破解的可行范围。',
	};
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

	const noAmbiguousBox = checkRow(
		't-no-ambig',
		'Exclude ambiguous (0, O, o, 1, l, I)',
		false,
		'排除易混淆字符 (0, O, o, 1, l, I)',
	);
	checkRowEl.append(noAmbiguousBox);

	const out = document.createElement('input');
	out.type = 'text';
	out.className = 't-passout';
	out.readOnly = true;
	langAttr(out, 'aria-label', 'Generated password', '生成的密码');

	const regen = document.createElement('button');
	regen.type = 'button';
	regen.className = 't-btn';
	regen.append(bilingual('Regenerate', '重新生成'));
	const copy = makeCopyButton(() => out.value);

	const strength = document.createElement('p');
	strength.className = 't-note';

	function update(): void {
		setBilingual(lenLabel, `Length: ${slider.value} characters`, `密码长度：${slider.value} 位`);
		lenNum.textContent = slider.value;
		const active = boxes.filter((b) => {
			const el = document.getElementById(b.id) as HTMLInputElement | null;
			return el?.checked ?? false;
		});
		if (!active.length) {
			out.value = '';
			setBilingual(strength, 'Select at least one character set.', '请至少勾选一类字符集。');
			return;
		}
		let pool = active.map((b) => b.chars).join('');
		const noAmbig = (document.getElementById('t-no-ambig') as HTMLInputElement | null)?.checked;
		if (noAmbig) {
			pool = pool.replace(/[0Oo1lI]/g, '');
		}
		if (!pool.length) {
			out.value = '';
			setBilingual(strength, 'Character pool is empty after exclusions.', '排除易混淆字符后，可用字符集为空。');
			return;
		}
		out.value = passwordHtml(pool, Number(slider.value));
		const bits = Number(slider.value) * Math.log2(pool.length);
		const st = strengthLabel(bits);
		setBilingual(
			strength,
			`${st.label} — about ${Math.round(bits)} bits of entropy. ${st.note}`,
			`${st.labelZh} — 约 ${Math.round(bits)} 比特熵。${st.noteZh}`,
		);
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
	verLabel.append(bilingual('Version', 'UUID 版本'));
	const verSelect = document.createElement('select');
	verSelect.id = 't-uuid-ver';
	const optV4 = document.createElement('option');
	optV4.value = 'v4';
	langProp(optV4, 'textContent', 'UUID v4 (random)', 'UUID v4 (随机)');
	const optV7 = document.createElement('option');
	optV7.value = 'v7';
	langProp(optV7, 'textContent', 'UUID v7 (time-ordered)', 'UUID v7 (时间有序)');
	verSelect.append(optV4, optV7);
	verField.append(verLabel, verSelect);

	const countField = document.createElement('div');
	countField.className = 't-field';
	const countLabel = document.createElement('label');
	countLabel.htmlFor = 't-count';
	countLabel.append(bilingual('Count', '生成数量'));
	const count = document.createElement('input');
	count.type = 'number';
	count.id = 't-count';
	count.min = '1';
	count.max = String(cfg.maxCount);
	count.value = String(cfg.defCount);
	countField.append(countLabel, count);

	const hyphenBox = checkRow('t-uuid-hyphen', 'Hyphens (-)', true, '带连字符 (-)');
	const upperBox = checkRow('t-uuid-upper', 'Uppercase', false, '转为大写');

	const gen = document.createElement('button');
	gen.type = 'button';
	gen.className = 't-btn t-primary';
	gen.append(bilingual('Generate', '生成'));

	controlsRow.append(verField, countField, hyphenBox, upperBox, gen);

	const out = document.createElement('textarea');
	out.className = 't-textarea t-mono t-out';
	out.rows = 8;
	out.readOnly = true;
	langAttr(out, 'aria-label', 'Generated UUIDs', '生成的 UUID');
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
		if (ver === 'v7') {
			setBilingual(
				note,
				'UUID v7: 48-bit millisecond timestamp + 74 bits randomness (RFC 9562). Naturally sortable and database index friendly.',
				'UUID v7：48 位毫秒时间戳 + 74 位随机数 (RFC 9562)。天然可排序，对数据库索引友好。',
			);
		} else {
			setBilingual(
				note,
				'UUID v4: 122 cryptographically secure random bits (RFC 4122). Uniform distribution with zero correlation.',
				'UUID v4：122 位密码学安全随机数 (RFC 4122)。均匀分布，互不相关。',
			);
		}
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
	const defs: {
		id: string;
		label: string;
		labelZh: string;
		value: string;
		min?: string;
		max?: string;
	}[] = [
		{ id: 't-min', label: 'Minimum (inclusive)', labelZh: '最小值 (含)', value: String(cfg.defMin) },
		{ id: 't-max', label: 'Maximum (inclusive)', labelZh: '最大值 (含)', value: String(cfg.defMax) },
		{
			id: 't-count',
			label: 'How many',
			labelZh: '生成数量',
			value: String(cfg.defCount),
			min: '1',
			max: '1000',
		},
	];
	for (const d of defs) {
		const field = document.createElement('div');
		field.className = 't-field';
		const lab = document.createElement('label');
		lab.htmlFor = d.id;
		lab.append(bilingual(d.label, d.labelZh));
		const input = document.createElement('input');
		input.type = 'number';
		input.id = d.id;
		input.value = d.value;
		if (d.min) input.min = d.min;
		if (d.max) input.max = d.max;
		field.append(lab, input);
		form.append(field);
	}
	const uniqueBox = checkRow('t-unique', 'No duplicates', false, '不允许重复');
	form.append(uniqueBox);

	const gen = document.createElement('button');
	gen.type = 'button';
	gen.className = 't-btn t-primary';
	gen.append(bilingual('Generate', '生成'));
	const actions = document.createElement('div');
	actions.className = 't-btnrow';
	const copy = makeCopyButton(() => out.value);
	actions.append(gen, copy.wrap);

	const out = document.createElement('textarea');
	out.className = 't-textarea t-mono t-out';
	out.readOnly = true;
	langAttr(out, 'aria-label', 'Random numbers', '生成的随机数');
	const note = document.createElement('p');
	note.className = 't-note';

	function update(): void {
		const min = Math.ceil(Number((document.getElementById('t-min') as HTMLInputElement).value) || 0);
		const max = Math.floor(Number((document.getElementById('t-max') as HTMLInputElement).value) || 0);
		let count = Math.min(Math.max(Math.floor(Number((document.getElementById('t-count') as HTMLInputElement).value) || 1), 1), 1000);
		const unique = (document.getElementById('t-unique') as HTMLInputElement).checked;
		if (max < min) {
			out.value = '';
			setBilingual(note, 'Maximum must be ≥ minimum.', '最大值必须不小于最小值。');
			return;
		}
		const range = max - min + 1;
		// Beyond 2^53 integers are no longer exactly representable, so a draw
		// would silently return a neighbouring value. Say so instead.
		if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || !Number.isSafeInteger(range)) {
			out.value = '';
			setBilingual(
				note,
				'Keep both bounds within ±9,007,199,254,740,991 (2⁵³ − 1).',
				'上下界都需落在 ±9,007,199,254,740,991 (2⁵³ − 1) 之内。',
			);
			return;
		}
		if (unique) {
			count = Math.min(count, range);
			const lines = sampleWithoutReplacement(range, count).map((v) => min + v);
			out.value = lines.join('\n');
			setBilingual(
				note,
				`${count} unique number${count === 1 ? '' : 's'} drawn from ${min} to ${max} (range of ${range}).`,
				`已从 ${min} 到 ${max} (共 ${range} 个取值) 中抽取 ${count} 个互不重复的数。`,
			);
		} else {
			const lines: number[] = [];
			for (let i = 0; i < count; i++) lines.push(min + randInt(range));
			out.value = lines.join('\n');
			setBilingual(
				note,
				`${count} number${count === 1 ? '' : 's'} from ${min} to ${max}, duplicates allowed.`,
				`已生成 ${count} 个介于 ${min} 到 ${max} 的随机数，允许重复。`,
			);
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
