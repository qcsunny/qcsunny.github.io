// Calendar page controller: month/year views, week numbers, date jump.
// Zero dependencies — plain local-date math. Two week-numbering rules:
//  - full: week 1 of a year is the first week that lies fully inside that year
//  - iso:  ISO 8601 (weeks start Monday, week 1 contains the first Thursday)
// Boundary weeks: under `full`, days before week 1 keep the previous year's
// numbering (e.g. Jan 1-3 of 2026 belong to 2025's last week) and the trailing
// partial week of December continues the numbering.

import {
	addDays,
	dateOf,
	fullWeekNum,
	isoWeekNum,
	rowWeekNumber,
	sameDay,
	startOfWeek,
	type WeekRule,
	type WeekStart,
} from './calendar/week';

export type { WeekRule, WeekStart };

const MONTHS_LONG = [
	'January',
	'February',
	'March',
	'April',
	'May',
	'June',
	'July',
	'August',
	'September',
	'October',
	'November',
	'December',
];
const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAYS_MINI = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

interface State {
	view: 'month' | 'year';
	year: number;
	month: number; // 0-11
	selected: Date;
	weekStart: WeekStart;
	rule: WeekRule;
}

// --- storage ----------------------------------------------------------------
function loadSettings(): { weekStart: WeekStart; rule: WeekRule } {
	try {
		const raw = localStorage.getItem('calendar:settings');
		if (raw) {
			const parsed = JSON.parse(raw) as { weekStart?: unknown; rule?: unknown };
			const weekStart = parsed.weekStart === 1 ? 1 : 0;
			const rule = parsed.rule === 'iso' ? 'iso' : 'full';
			return { weekStart, rule };
		}
	} catch {
		/* fall through to defaults */
	}
	return { weekStart: 0, rule: 'full' };
}
function saveSettings(): void {
	try {
		localStorage.setItem('calendar:settings', JSON.stringify({ weekStart: state.weekStart, rule: state.rule }));
	} catch {
		/* ignore */
	}
}

// --- state ------------------------------------------------------------------
const today = new Date();
const settings = loadSettings();
const state: State = {
	view: (() => {
		try {
			return localStorage.getItem('calendar:view') === 'year' ? 'year' : 'month';
		} catch {
			return 'month';
		}
	})(),
	year: today.getFullYear(),
	month: today.getMonth(),
	selected: today,
	weekStart: settings.weekStart,
	rule: settings.rule,
};

// --- elements ----------------------------------------------------------------
const monthHost = document.querySelector<HTMLElement>('#cal-month');
const yearHost = document.querySelector<HTMLElement>('#cal-year');
const labelEl = document.querySelector<HTMLElement>('#cal-label');
const infoEl = document.querySelector<HTMLElement>('#cal-info');
const prevBtn = document.querySelector<HTMLButtonElement>('#cal-prev');
const nextBtn = document.querySelector<HTMLButtonElement>('#cal-next');
const todayBtn = document.querySelector<HTMLButtonElement>('#cal-today');
const goBtn = document.querySelector<HTMLButtonElement>('#cal-go');
const dateInput = document.querySelector<HTMLInputElement>('#cal-date-input');
const viewButtons = document.querySelectorAll<HTMLButtonElement>('.cal-topbar [data-view]');
const weekStartButtons = document.querySelectorAll<HTMLButtonElement>('[data-week-start]');
const weekRuleButtons = document.querySelectorAll<HTMLButtonElement>('[data-week-rule]');
if (!monthHost || !yearHost || !labelEl || !infoEl || !prevBtn || !nextBtn || !todayBtn || !goBtn || !dateInput) {
	throw new Error('calendar: required elements missing');
}

// --- rendering ---------------------------------------------------------------
function render(): void {
	labelEl.textContent =
		state.view === 'month' ? `${MONTHS_LONG[state.month]} ${state.year}` : String(state.year);
	monthHost.hidden = state.view !== 'month';
	yearHost.hidden = state.view !== 'year';
	if (state.view === 'month') renderMonth();
	else renderYear();
	viewButtons.forEach((btn) => {
		btn.setAttribute('aria-pressed', String(btn.dataset.view === state.view));
	});
	renderInfo();
}

function renderInfo(): void {
	const s = state.selected;
	const wn =
		state.rule === 'iso' ? isoWeekNum(s) : fullWeekNum(s, state.weekStart);
	const weekYearNote = wn.year !== s.getFullYear() ? ` of ${wn.year}` : '';
	infoEl.textContent = `${DAYS_SHORT[s.getDay()]}, ${MONTHS_LONG[s.getMonth()]} ${s.getDate()}, ${s.getFullYear()} · Week ${wn.week}${weekYearNote}`;
}

function dayButton(date: Date, mini: boolean, monthContext = state.month): HTMLButtonElement {
	const btn = document.createElement('button');
	btn.type = 'button';
	btn.className = mini ? 'mini-day' : 'day';
	btn.textContent = String(date.getDate());
	btn.dataset.date = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
	if (date.getMonth() !== monthContext) btn.classList.add('out');
	if (sameDay(date, today)) btn.classList.add('today');
	if (sameDay(date, state.selected)) btn.classList.add('sel');
	btn.setAttribute(
		'aria-label',
		`${DAYS_SHORT[date.getDay()]}, ${MONTHS_LONG[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`,
	);
	btn.addEventListener('click', () => {
		state.selected = date;
		state.year = date.getFullYear();
		state.month = date.getMonth();
		if (mini) state.view = 'month'; // clicking a day in the year view opens that month
		render();
	});
	return btn;
}

function renderMonth(): void {
	monthHost.innerHTML = '';
	// header: empty corner over the week column, then weekday names
	const corner = document.createElement('span');
	corner.className = 'dow';
	corner.setAttribute('aria-hidden', 'true');
	monthHost.append(corner);
	for (let i = 0; i < 7; i++) {
		const h = document.createElement('span');
		h.className = 'dow';
		h.textContent = DAYS_SHORT[(state.weekStart + i) % 7] as string;
		h.setAttribute('aria-hidden', 'true');
		monthHost.append(h);
	}
	// 6 rows of 7 days starting at the first grid week of the month
	const first = startOfWeek(dateOf(state.year, state.month, 1), state.weekStart);
	for (let row = 0; row < 6; row++) {
		const rowStart = addDays(first, row * 7);
		const wn = document.createElement('span');
		wn.className = 'wnum';
		const num = rowWeekNumber(rowStart, state.weekStart, state.rule);
		wn.textContent = String(num.week);
		wn.title = `Week ${num.week} of ${num.year}`;
		monthHost.append(wn);
		for (let col = 0; col < 7; col++) {
			monthHost.append(dayButton(addDays(rowStart, col), false));
		}
	}
}

function renderYear(): void {
	yearHost.innerHTML = '';
	for (let m = 0; m < 12; m++) {
		const mini = document.createElement('section');
		mini.className = 'mini';
		mini.dataset.month = String(m);

		const title = document.createElement('button');
		title.type = 'button';
		title.className = 'mini-title';
		title.textContent = MONTHS_LONG[m] as string;
		title.setAttribute('aria-label', `Go to ${MONTHS_LONG[m]} ${state.year}`);
		title.addEventListener('click', () => {
			state.view = 'month';
			state.month = m;
			render();
		});

		const grid = document.createElement('div');
		grid.className = 'mini-grid';
		for (let i = 0; i < 7; i++) {
			const h = document.createElement('span');
			h.className = 'dow';
			h.textContent = DAYS_MINI[(state.weekStart + i) % 7] as string;
			h.setAttribute('aria-hidden', 'true');
			grid.append(h);
		}
		const first = startOfWeek(dateOf(state.year, m, 1), state.weekStart);
		const daysInMonth = new Date(state.year, m + 1, 0).getDate();
		const lead = (dateOf(state.year, m, 1).getDay() - state.weekStart + 7) % 7;
		const rows = Math.ceil((lead + daysInMonth) / 7);
		for (let i = 0; i < rows * 7; i++) {
			grid.append(dayButton(addDays(first, i), true, m));
		}

		mini.append(title, grid);
		yearHost.append(mini);
	}
}

// --- interactions ------------------------------------------------------------
function shift(delta: number): void {
	if (state.view === 'month') {
		const d = dateOf(state.year, state.month + delta, 1);
		state.year = d.getFullYear();
		state.month = d.getMonth();
	} else {
		state.year = Math.min(9999, Math.max(1, state.year + delta));
	}
	render();
}

prevBtn.addEventListener('click', () => shift(-1));
nextBtn.addEventListener('click', () => shift(1));

todayBtn.addEventListener('click', () => {
	state.view = 'month';
	state.year = today.getFullYear();
	state.month = today.getMonth();
	state.selected = today;
	render();
});

viewButtons.forEach((btn) => {
	btn.addEventListener('click', () => {
		const view = btn.dataset.view === 'year' ? 'year' : 'month';
		if (view === state.view) return;
		state.view = view;
		try {
			localStorage.setItem('calendar:view', view);
		} catch {
			/* ignore */
		}
		render();
	});
});

function jump(): void {
	const value = dateInput.value.trim();
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
	if (!match) return;
	const y = Number(match[1]);
	const m = Number(match[2]) - 1;
	const d = Number(match[3]);
	const target = dateOf(y, m, d);
	if (target.getMonth() !== m || target.getDate() !== d) return; // rejected overflow like 2026-02-30
	state.view = 'month';
	state.year = y;
	state.month = m;
	state.selected = target;
	render();
}
goBtn.addEventListener('click', jump);
dateInput.addEventListener('keydown', (e) => {
	if (e.key === 'Enter') jump();
});

function setWeekStart(weekStart: WeekStart): void {
	state.weekStart = weekStart;
	weekStartButtons.forEach((btn) => {
		btn.setAttribute('aria-pressed', String(Number(btn.dataset.weekStart) === weekStart));
	});
	saveSettings();
	render();
}
weekStartButtons.forEach((btn) => {
	btn.addEventListener('click', () => setWeekStart(Number(btn.dataset.weekStart) === 1 ? 1 : 0));
});

function setWeekRule(rule: WeekRule): void {
	state.rule = rule;
	weekRuleButtons.forEach((btn) => {
		btn.setAttribute('aria-pressed', String(btn.dataset.weekRule === rule));
	});
	saveSettings();
	render();
}
weekRuleButtons.forEach((btn) => {
	btn.addEventListener('click', () => setWeekRule(btn.dataset.weekRule === 'iso' ? 'iso' : 'full'));
});

// Arrow keys move by month (month view) or year (year view); skip when typing
document.addEventListener('keydown', (e) => {
	if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
	const target = e.target as HTMLElement | null;
	if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.isContentEditable)) {
		return;
	}
	shift(e.key === 'ArrowRight' ? 1 : -1);
});

// sync setting buttons with the loaded state, then first render
weekStartButtons.forEach((btn) => {
	btn.setAttribute('aria-pressed', String(Number(btn.dataset.weekStart) === state.weekStart));
});
weekRuleButtons.forEach((btn) => {
	btn.setAttribute('aria-pressed', String(btn.dataset.weekRule === state.rule));
});
render();
