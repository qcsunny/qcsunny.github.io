// Pure local-date math for the calendar page. No DOM, no side effects —
// exported so the week-numbering rules can be unit-tested directly.
//
// Two week-numbering rules:
//  - full: week 1 of a year is the first week that lies fully inside that year
//  - iso:  ISO 8601 (weeks start Monday, week 1 contains the first Thursday)
// Boundary weeks under `full`: days before week 1 keep the previous year's
// numbering (e.g. Jan 1-3 of 2026 belong to 2025's last week) and the trailing
// partial week of December continues the numbering (e.g. week 53).

export type WeekRule = 'full' | 'iso';
export type WeekStart = 0 | 1; // 0 = Sunday, 1 = Monday

export interface WeekNum {
	week: number;
	/** the year the week number belongs to (can differ from the date's year) */
	year: number;
}

const DAY_MS = 86_400_000;

export function dateOf(y: number, m: number, d: number): Date {
	return new Date(y, m, d);
}

export function addDays(d: Date, n: number): Date {
	return dateOf(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

export function sameDay(a: Date, b: Date): boolean {
	return (
		a.getFullYear() === b.getFullYear() &&
		a.getMonth() === b.getMonth() &&
		a.getDate() === b.getDate()
	);
}

/** Align a date to the start of its week (grid weeks are startDay-aligned). */
export function startOfWeek(d: Date, startDay: number): Date {
	const diff = (d.getDay() - startDay + 7) % 7;
	return addDays(d, -diff);
}

/** [full rule] first week start of a year: Jan 1 if it is the start day. */
export function week1Start(year: number, startDay: number): Date {
	const jan1 = dateOf(year, 0, 1);
	const ws = startOfWeek(jan1, startDay);
	return ws.getTime() === jan1.getTime() ? ws : addDays(ws, 7);
}

/** [full rule] week number of any date. */
export function fullWeekNum(d: Date, startDay: number): WeekNum {
	const ws = startOfWeek(d, startDay);
	const y = ws.getFullYear(); // spanning weeks always number into the December year
	const week = Math.round((ws.getTime() - week1Start(y, startDay).getTime()) / (7 * DAY_MS)) + 1;
	return { week, year: y };
}

/** [iso rule] ISO 8601 week number (Jan 4 is always in week 1). */
export function isoWeekNum(d: Date): WeekNum {
	// Thursday of d's Monday-aligned week decides year and week
	const thursday = addDays(d, 3 - ((d.getDay() + 6) % 7));
	const y = thursday.getFullYear();
	const week1 = startOfWeek(dateOf(y, 0, 4), 1);
	const week = Math.round((thursday.getTime() - week1.getTime()) / (7 * DAY_MS)) + 1;
	return { week, year: y };
}

/**
 * Week number for one calendar grid row. A row is one grid week; under the
 * ISO rule with a Sunday-start grid, the row's Thursday decides (a Sunday-
 * start row can span two ISO weeks).
 */
export function rowWeekNumber(rowStart: Date, weekStart: number, rule: WeekRule): WeekNum {
	const thursday = addDays(rowStart, (4 - weekStart + 7) % 7);
	return rule === 'iso' ? isoWeekNum(thursday) : fullWeekNum(thursday, weekStart);
}
