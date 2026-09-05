// Clock page controller — local time, a Pomodoro timer, and this page's own
// three-state theme cycle.
//
// This lived as an is:inline <script> inside clock.astro until 2026-09. Every
// word the page shows is written from JavaScript, so /clock stayed English after
// the rest of the site learned to switch: BaseHead already sets html[data-lang]
// here and global.css ships, but the .i18n-en/.i18n-zh pair only helps text that
// sits in the markup, and none of this does. Being a module is what lets the
// controller import the site's language helper.

import { isZh, onLang, wireLangToggle } from './tools/i18n';

const pick = <T extends Element>(sel: string): T => {
	const el = document.querySelector<T>(sel);
	if (!el) throw new Error(`clock: ${sel} missing`);
	return el;
};

const root = document.documentElement;
const weekdayEl = pick<HTMLElement>('#clock-weekday');
const dateEl = pick<HTMLElement>('#clock-date');
const timeEl = pick<HTMLElement>('#clock-time');
const pomoLine = pick<HTMLElement>('#clock-pomodoro');
const pomoToggle = pick<HTMLButtonElement>('.pomodoro-toggle');
const pomoReset = pick<HTMLButtonElement>('.pomodoro-reset');
const secondsToggle = pick<HTMLButtonElement>('.seconds-toggle');
const themeToggle = pick<HTMLButtonElement>('.theme-toggle');

const t = (en: string, zh: string): string => (isZh() ? zh : en);

// --- clock -------------------------------------------------------------------
// Weekday and date come from Intl, which every browser ships: "Sunday" /
// "September 6, 2026" against "星期日" / "2026年9月6日".
function render(): void {
	const now = new Date();
	const locale = isZh() ? 'zh-CN' : 'en-US';
	weekdayEl.textContent = now.toLocaleDateString(locale, { weekday: 'long' });
	dateEl.textContent = now.toLocaleDateString(locale, {
		year: 'numeric',
		month: 'long',
		day: 'numeric',
	});
	const p = (n: number): string => String(n).padStart(2, '0');
	timeEl.textContent =
		root.dataset.seconds === 'off'
			? `${p(now.getHours())}:${p(now.getMinutes())}`
			: `${p(now.getHours())}:${p(now.getMinutes())}:${p(now.getSeconds())}`;
}

// --- seconds toggle ----------------------------------------------------------
function syncSecondsButton(): void {
	const off = root.dataset.seconds === 'off';
	secondsToggle.setAttribute('aria-pressed', String(!off));
	secondsToggle.setAttribute('aria-label', off ? t('Show seconds', '显示秒') : t('Hide seconds', '隐藏秒'));
}

secondsToggle.addEventListener('click', () => {
	root.dataset.seconds = root.dataset.seconds === 'off' ? 'on' : 'off';
	try {
		localStorage.setItem('clock:seconds', root.dataset.seconds);
	} catch {
		/* storage unavailable — choice just won't persist */
	}
	syncSecondsButton();
	render();
});

// --- pomodoro ----------------------------------------------------------------
// 🍅 starts a 25-minute focus countdown, then a 5-minute break. While running:
// click pauses/resumes, ✕ resets. State is stored as timestamps, so a refresh
// resumes the countdown instead of restarting it.
const POMO_KEY = 'clock:pomodoro';
const FOCUS_MS = 25 * 60_000;
const BREAK_MS = 5 * 60_000;
const baseTitle = document.title;

interface Pomo {
	phase: 'focus' | 'break';
	endAt: number;
	paused: boolean;
	pausedRemaining: number;
}
let pomo: Pomo | null = null;

function loadPomo(): Pomo | null {
	try {
		const raw = localStorage.getItem(POMO_KEY);
		if (!raw) return null;
		const p = JSON.parse(raw) as Pomo | null;
		if (!p || (p.phase !== 'focus' && p.phase !== 'break')) return null;
		// a timer that expired while the page was closed is simply gone
		if (!p.paused && Date.now() >= p.endAt) return null;
		return p;
	} catch {
		return null;
	}
}
function savePomo(): void {
	try {
		localStorage.setItem(POMO_KEY, pomo ? JSON.stringify(pomo) : '');
	} catch {
		/* ignore */
	}
}

// one short triple beep, synthesised — no audio files
type LegacyWindow = Window & { webkitAudioContext?: typeof AudioContext };
const AudioCtor = (): typeof AudioContext | undefined =>
	window.AudioContext ?? (window as LegacyWindow).webkitAudioContext;
let audioCtx: AudioContext | null = null;

// must be called from a user gesture, or the browser keeps audio suspended
function initAudio(): void {
	try {
		const Ctor = AudioCtor();
		if (!Ctor) return;
		audioCtx ??= new Ctor();
		void audioCtx.resume();
	} catch {
		/* audio unavailable */
	}
}
function beep(): void {
	try {
		const Ctor = AudioCtor();
		if (!Ctor) return;
		audioCtx ??= new Ctor();
		const t0 = audioCtx.currentTime;
		for (const off of [0, 0.22, 0.44]) {
			const osc = audioCtx.createOscillator();
			const gain = audioCtx.createGain();
			osc.frequency.value = 880;
			osc.connect(gain);
			gain.connect(audioCtx.destination);
			gain.gain.setValueAtTime(0.0001, t0 + off);
			gain.gain.exponentialRampToValueAtTime(0.2, t0 + off + 0.02);
			gain.gain.exponentialRampToValueAtTime(0.0001, t0 + off + 0.18);
			osc.start(t0 + off);
			osc.stop(t0 + off + 0.2);
		}
	} catch {
		/* audio unavailable — silent fallback */
	}
}

function startPhase(phase: Pomo['phase'], duration: number): void {
	pomo = { phase, endAt: Date.now() + duration, paused: false, pausedRemaining: duration };
	savePomo();
	syncPomo();
}

const fmt = (ms: number): string => {
	const s = Math.ceil(ms / 1000);
	return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

function syncPomo(): void {
	if (!pomo) {
		pomoToggle.textContent = '🍅';
		pomoToggle.classList.remove('running', 'paused');
		pomoToggle.setAttribute('aria-label', t('Start Pomodoro timer (25 minutes)', '开始番茄钟 (25 分钟)'));
		pomoReset.setAttribute('aria-label', t('Reset Pomodoro timer', '重置番茄钟'));
		pomoReset.hidden = true;
		pomoLine.hidden = true;
		document.title = baseTitle;
		return;
	}
	const remaining = pomo.paused ? pomo.pausedRemaining : Math.max(0, pomo.endAt - Date.now());
	const left = fmt(remaining);
	const phase = pomo.phase === 'focus' ? t('Focus', '专注') : t('Break', '休息');
	pomoToggle.textContent = left;
	pomoToggle.classList.toggle('running', !pomo.paused);
	pomoToggle.classList.toggle('paused', pomo.paused);
	// "Pause Pomodoro focus (24:13)" / "暂停番茄钟专注 (24:13)" — the English
	// lowercases the phase mid-sentence, which Chinese neither needs nor allows.
	pomoToggle.setAttribute(
		'aria-label',
		isZh()
			? `${pomo.paused ? '继续' : '暂停'}番茄钟${phase} (${left})`
			: `${pomo.paused ? 'Resume' : 'Pause'} Pomodoro ${phase.toLowerCase()} (${left})`,
	);
	pomoReset.setAttribute('aria-label', t('Reset Pomodoro timer', '重置番茄钟'));
	pomoReset.hidden = false;
	pomoLine.hidden = false;
	pomoLine.textContent = `${phase} ${left}${pomo.paused ? t(' · paused', ' · 已暂停') : ''}`;
	document.title = remaining > 0 ? `${left} · ${phase}` : baseTitle;
}

function tickPomo(): void {
	if (!pomo || pomo.paused) return;
	if (Date.now() >= pomo.endAt) {
		beep();
		if (pomo.phase === 'focus') {
			startPhase('break', BREAK_MS);
		} else {
			pomo = null;
			savePomo();
		}
	}
	syncPomo();
}

pomoToggle.addEventListener('click', () => {
	initAudio();
	if (!pomo) {
		startPhase('focus', FOCUS_MS);
		return;
	}
	if (pomo.paused) {
		pomo.endAt = Date.now() + pomo.pausedRemaining;
		pomo.paused = false;
	} else {
		pomo.pausedRemaining = Math.max(0, pomo.endAt - Date.now());
		pomo.paused = true;
	}
	savePomo();
	syncPomo();
});

pomoReset.addEventListener('click', () => {
	pomo = null;
	savePomo();
	syncPomo();
});

// --- theme -------------------------------------------------------------------
// light / dark / auto (auto = follow the browser). Its own storage key, so the
// fullscreen clock can be dark on a desk while the rest of the site is not.
const mql = matchMedia('(prefers-color-scheme: dark)');
const ICONS: Record<string, string> = { light: '☀', dark: '☾', auto: '◐' };
const themeLabel = (mode: string): string =>
	mode === 'light'
		? t('Light theme', '浅色主题')
		: mode === 'dark'
			? t('Dark theme', '深色主题')
			: t('Auto theme (follows browser setting)', '自动主题 (跟随浏览器设置)');
const ORDER = ['light', 'dark', 'auto'];

function syncIcon(): void {
	const mode = root.dataset.themeMode ?? 'auto';
	themeToggle.textContent = ICONS[mode] ?? ICONS.auto ?? '◐';
	themeToggle.title = themeLabel(mode);
	themeToggle.setAttribute('aria-label', themeLabel(mode));
}

function applyMode(mode: string): void {
	root.dataset.themeMode = mode;
	root.dataset.theme = mode === 'auto' ? (mql.matches ? 'dark' : 'light') : mode;
	try {
		localStorage.setItem('clock:theme', mode);
	} catch {
		/* storage unavailable — mode just won't persist */
	}
	syncIcon();
}

themeToggle.addEventListener('click', () => {
	const current = root.dataset.themeMode ?? 'auto';
	applyMode(ORDER[(ORDER.indexOf(current) + 1) % ORDER.length] ?? 'auto');
});

// In auto mode, react live when the browser theme changes
mql.addEventListener('change', () => {
	if (root.dataset.themeMode === 'auto') {
		root.dataset.theme = mql.matches ? 'dark' : 'light';
	}
});

// --- start -------------------------------------------------------------------
// No Header.astro on this page, so the switch itself has to live in the corner.
wireLangToggle(pick<HTMLButtonElement>('.lang-toggle'));

pomo = loadPomo();

// onLang runs this once immediately, so it doubles as the first paint, and again
// on every switch — which is the whole point: nothing on this page is a span
// pair that CSS could swap.
onLang(() => {
	render();
	syncSecondsButton();
	syncPomo();
	syncIcon();
});

// sync to the next whole second, then tick clock and pomodoro together
const tickAll = (): void => {
	render();
	tickPomo();
};
setTimeout(
	() => {
		tickAll();
		setInterval(tickAll, 1000);
	},
	1000 - (Date.now() % 1000),
);
