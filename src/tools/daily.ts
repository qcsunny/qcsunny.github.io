// Registry entries for /utilities/* form tools — the daily-life calculators
// (age, date math, BMI & calories). The utilities category's text tools live
// in textTools.ts; these FormConfig entries are kept in their own file so each
// file stays one widget kind. Dates are handled as {y, m, d} triples parsed
// from the ISO strings the form's 'date' inputs produce, and every day
// arithmetic goes through Date.UTC so a DST gap can never shift a count.

import type { FormConfig, ToolEntry } from './registry';
import { formatNumber } from '../scripts/calculator/engine';

interface Ymd {
	y: number;
	m: number;
	d: number;
}

const WEEKDAY_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEKDAY_ZH = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

/** Days in a Gregorian month (month is 1-12). */
function daysInMonth(y: number, m: number): number {
	const dim = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
	if (m === 2 && y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0)) return 29;
	return dim[m - 1];
}

function parseYmd(s: string): Ymd | null {
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
	if (!m) return null;
	const y = Number(m[1]);
	const mo = Number(m[2]);
	const d = Number(m[3]);
	if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) return null;
	return { y, m: mo, d };
}


// The world clock set: zones people actually schedule across. IANA keys are
// the runtime truth; labels are for reading.
const ZONES: { tz: string; label: string; labelZh: string }[] = [
	{ tz: 'Asia/Shanghai', label: 'Beijing / Shanghai', labelZh: '北京 / 上海' },
	{ tz: 'Asia/Tokyo', label: 'Tokyo', labelZh: '东京' },
	{ tz: 'Asia/Singapore', label: 'Singapore', labelZh: '新加坡' },
	{ tz: 'Asia/Dubai', label: 'Dubai', labelZh: '迪拜' },
	{ tz: 'Asia/Kolkata', label: 'Mumbai / Delhi', labelZh: '孟买 / 德里' },
	{ tz: 'Europe/Moscow', label: 'Moscow', labelZh: '莫斯科' },
	{ tz: 'Europe/Berlin', label: 'Berlin / Paris', labelZh: '柏林 / 巴黎' },
	{ tz: 'Europe/London', label: 'London', labelZh: '伦敦' },
	{ tz: 'America/New_York', label: 'New York', labelZh: '纽约' },
	{ tz: 'America/Chicago', label: 'Chicago', labelZh: '芝加哥' },
	{ tz: 'America/Los_Angeles', label: 'Los Angeles', labelZh: '洛杉矶' },
	{ tz: 'Australia/Sydney', label: 'Sydney', labelZh: '悉尼' },
];

const pad2 = (n: number): string => String(n).padStart(2, '0');
const ymdStr = (p: Ymd): string => `${p.y}-${pad2(p.m)}-${pad2(p.d)}`;
const utcMs = (p: Ymd): number => Date.UTC(p.y, p.m - 1, p.d);
/** Whole days from a to b (b − a); negative when b is before a. */
const dayDiff = (a: Ymd, b: Ymd): number => Math.round((utcMs(b) - utcMs(a)) / 86400000);
const weekdayOf = (p: Ymd): number => new Date(utcMs(p)).getUTCDay();

function fromUtc(ms: number): Ymd {
	const d = new Date(ms);
	return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
}

const addDays = (p: Ymd, n: number): Ymd => fromUtc(utcMs(p) + n * 86400000);

/** Calendar-aware month arithmetic: Jan 31 + 1 month = Feb 28, not Mar 3.
 *  Reports whether the day had to be clamped to the target month's length. */
function addMonths(p: Ymd, n: number): { date: Ymd; clamped: boolean } {
	const total = p.y * 12 + (p.m - 1) + n;
	const y = Math.floor(total / 12);
	const m = total - y * 12 + 1;
	const last = daysInMonth(y, m);
	const d = Math.min(p.d, last);
	return { date: { y, m, d }, clamped: d !== p.d };
}

/** The one date the age tool needs as a default. Evaluated per page load in
 *  the browser (build-time imports only read slugs, never field defs). */
function todayYmd(): Ymd {
	const t = new Date();
	return { y: t.getFullYear(), m: t.getMonth() + 1, d: t.getDate() };
}
const TODAY = ymdStr(todayYmd());

/** {y, m, d} broken down as calendar periods, the way people state an age:
 *  borrow days from the month before `a`, then months from the year. */
function calendarBreakdown(b: Ymd, a: Ymd): { years: number; months: number; days: number } {
	let years = a.y - b.y;
	let months = a.m - b.m;
	let days = a.d - b.d;
	if (days < 0) {
		months--;
		const pm = a.m === 1 ? 12 : a.m - 1;
		const py = a.m === 1 ? a.y - 1 : a.y;
		days += daysInMonth(py, pm);
	}
	if (months < 0) {
		years--;
		months += 12;
	}
	return { years, months, days };
}

/** Business days (Mon–Fri) in the half-open span [start, start + spanDays).
 *  O(1): full weeks contribute 5 each, the remainder is at most 6 days. */
function businessDays(start: Ymd, spanDays: number): number {
	if (spanDays <= 0) return 0;
	const weeks = Math.floor(spanDays / 7);
	const rem = spanDays - weeks * 7;
	let wd = weekdayOf(start);
	let extra = 0;
	for (let i = 0; i < rem; i++) {
		if (wd !== 0 && wd !== 6) extra++;
		wd = (wd + 1) % 7;
	}
	return weeks * 5 + extra;
}

// --- age calculator ---------------------------------------------------------------

const ageConfig: FormConfig = {
	intro: 'Your exact age in years, months and days — plus total days lived, the weekday you were born on and a countdown to your next birthday.',
	introZh: '精确到年、月、日的年龄，附带已活总天数、出生当天是星期几以及下一个生日的倒计时。',
	fields: [
		{
			id: 'birth',
			type: 'date',
			label: 'Date of birth',
			labelZh: '出生日期',
			required: true,
		},
		{
			id: 'asof',
			type: 'date',
			label: 'Age at date',
			labelZh: '计算基准日期',
			def: TODAY,
			hint: 'Leave as is to compute your age today.',
			hintZh: '保持默认即按今天计算。',
		},
	],
	compute: (v) => {
		const b = parseYmd(v.str('birth'));
		const a = parseYmd(v.str('asof')) ?? todayYmd();
		if (!b) {
			return {
				rows: [{ label: 'Age', labelZh: '年龄', value: '— (enter a valid date of birth)', valueZh: '—（请输入有效的出生日期）' }],
			};
		}
		const total = dayDiff(b, a);
		if (total < 0) {
			return {
				rows: [{ label: 'Age', labelZh: '年龄', value: '— (birth date is after the reference date)', valueZh: '—（出生日期晚于基准日期）' }],
			};
		}
		const { years, months, days } = calendarBreakdown(b, a);
		const weeks = Math.floor(total / 7);
		const remDays = total - weeks * 7;
		const totalMonths = years * 12 + months;

		// Next birthday: this year's if it is still ahead, else next year's.
		// A Feb 29 birthday lands on Feb 28 in common years.
		const clampTo = (y: number): Ymd => ({ y, m: b.m, d: Math.min(b.d, daysInMonth(y, b.m)) });
		let next = clampTo(a.y);
		if (dayDiff(next, a) <= 0) next = clampTo(a.y + 1);
		const untilNext = dayDiff(a, next);

		return {
			rows: [
				{
					label: 'Age',
					labelZh: '年龄',
					value: `${years} years, ${months} months, ${days} days`,
					valueZh: `${years} 岁 ${months} 个月 ${days} 天`,
					emphasis: true,
				},
				{ label: 'Total days lived', labelZh: '已活总天数', value: formatNumber(total) },
				{ label: 'Total weeks', labelZh: '总周数', value: `${formatNumber(weeks)} weeks, ${remDays} days`, valueZh: `${formatNumber(weeks)} 周零 ${remDays} 天` },
				{ label: 'Total months', labelZh: '总月数', value: `${formatNumber(totalMonths)} months`, valueZh: `${formatNumber(totalMonths)} 个月` },
				{ label: 'Born on a', labelZh: '出生那天是', value: WEEKDAY_EN[weekdayOf(b)], valueZh: WEEKDAY_ZH[weekdayOf(b)] },
				{ label: 'Next birthday', labelZh: '下一个生日', value: `${ymdStr(next)} (${WEEKDAY_EN[weekdayOf(next)]})`, valueZh: `${ymdStr(next)}（${WEEKDAY_ZH[weekdayOf(next)]}）` },
				{ label: 'Days until next birthday', labelZh: '距下一个生日', value: `${formatNumber(untilNext)} days`, valueZh: `${formatNumber(untilNext)} 天` },
			],
			note: 'The years/months/days breakdown follows calendar periods, so "3 months" means three full calendar months, not 90 days. Ages are computed with the Gregorian calendar and no time zones.',
			noteZh: '年/月/日的拆分按日历周期计——"3 个月"指三个完整的日历月，而非 90 天。年龄按公历计算，不涉及时区。',
		};
	},
};

// --- date calculator ----------------------------------------------------------------

const dateConfig: FormConfig = {
	intro: 'Two modes in one page: measure the exact difference between two dates (including business days), or add / subtract days, weeks, months and years from a date.',
	introZh: '一个页面两种模式：计算两个日期之间的精确间隔（含工作日），或从某个日期加减日、周、月、年。',
	fields: [
		{
			id: 'mode',
			type: 'select',
			label: 'Mode',
			labelZh: '模式',
			def: 'diff',
			options: [
				{ value: 'diff', label: 'Difference between two dates', labelZh: '两日期之差' },
				{ value: 'add', label: 'Add / subtract from a date', labelZh: '日期加减' },
			],
		},
		{
			id: 'from',
			type: 'date',
			label: 'Start date',
			labelZh: '开始日期',
			required: true,
			def: TODAY,
			showIf: (v) => v.str('mode') !== 'add',
		},
		{
			id: 'to',
			type: 'date',
			label: 'End date',
			labelZh: '结束日期',
			required: true,
			def: TODAY,
			showIf: (v) => v.str('mode') !== 'add',
		},
		{
			id: 'inclEnd',
			type: 'checkbox',
			label: 'Include the end date itself in day counts',
			labelZh: '天数统计包含结束日当天',
			def: 'false',
			showIf: (v) => v.str('mode') !== 'add',
		},
		{
			id: 'start',
			type: 'date',
			label: 'Start date',
			labelZh: '起始日期',
			required: true,
			def: TODAY,
			showIf: (v) => v.str('mode') === 'add',
		},
		{
			id: 'op',
			type: 'select',
			label: 'Operation',
			labelZh: '运算',
			def: 'add',
			options: [
				{ value: 'add', label: 'Add (+)', labelZh: '加（+）' },
				{ value: 'sub', label: 'Subtract (−)', labelZh: '减（−）' },
			],
			showIf: (v) => v.str('mode') === 'add',
		},
		{
			id: 'amount',
			type: 'number',
			label: 'Amount',
			labelZh: '数量',
			required: true,
			def: '30',
			min: '0',
			step: '1',
			showIf: (v) => v.str('mode') === 'add',
		},
		{
			id: 'unit',
			type: 'select',
			label: 'Unit',
			labelZh: '单位',
			def: 'days',
			options: [
				{ value: 'days', label: 'Days', labelZh: '天' },
				{ value: 'weeks', label: 'Weeks', labelZh: '周' },
				{ value: 'months', label: 'Months', labelZh: '月' },
				{ value: 'years', label: 'Years', labelZh: '年' },
			],
			showIf: (v) => v.str('mode') === 'add',
		},
	],
	compute: (v) => {
		if (v.str('mode') === 'add') {
			const start = parseYmd(v.str('start'));
			const n = v.num('amount');
			if (!start || !Number.isFinite(n) || n < 0) {
				return {
					rows: [{ label: 'Result date', labelZh: '结果日期', value: '— (enter a valid date and amount)', valueZh: '—（请输入有效的日期与数量）' }],
				};
			}
			const sign = v.str('op') === 'sub' ? -1 : 1;
			const k = sign * n;
			let result: Ymd;
			let clamped = false;
			switch (v.str('unit')) {
				case 'weeks':
					result = addDays(start, k * 7);
					break;
				case 'months': {
					const r = addMonths(start, k);
					result = r.date;
					clamped = r.clamped;
					break;
				}
				case 'years': {
					const r = addMonths(start, k * 12);
					result = r.date;
					clamped = r.clamped;
					break;
				}
				default:
					result = addDays(start, k);
			}
			return {
				rows: [
					{
						label: 'Result date',
						labelZh: '结果日期',
						value: `${ymdStr(result)} (${WEEKDAY_EN[weekdayOf(result)]})`,
						valueZh: `${ymdStr(result)}（${WEEKDAY_ZH[weekdayOf(result)]}）`,
						emphasis: true,
					},
					{ label: 'Days from start date', labelZh: '距起始日期', value: `${formatNumber(dayDiff(start, result))} days`, valueZh: `${formatNumber(dayDiff(start, result))} 天` },
				],
				note: clamped
					? 'The target month is shorter, so the day was clamped to its last day (e.g. Jan 31 + 1 month → Feb 28).'
					: undefined,
				noteZh: clamped
					? '目标月份天数不足，日已钳制到当月最后一天（如 1 月 31 日 + 1 个月 → 2 月 28 日）。'
					: undefined,
			};
		}

		const from = parseYmd(v.str('from'));
		const to = parseYmd(v.str('to'));
		if (!from || !to) {
			return {
				rows: [{ label: 'Difference', labelZh: '间隔', value: '— (enter two valid dates)', valueZh: '—（请输入两个有效日期）' }],
			};
		}
		const span = dayDiff(from, to);
		if (span < 0) {
			return {
				rows: [{ label: 'Difference', labelZh: '间隔', value: '— (end date is before start date)', valueZh: '—（结束日期早于开始日期）' }],
			};
		}
		const incl = v.bool('inclEnd');
		const totalDays = span + (incl ? 1 : 0);
		const { years, months, days } = calendarBreakdown(from, to);
		const weeks = Math.floor(span / 7);
		const remDays = span - weeks * 7;
		return {
			rows: [
				{
					label: 'Difference',
					labelZh: '间隔',
					value: `${years} years, ${months} months, ${days} days`,
					valueZh: `${years} 年 ${months} 个月 ${days} 天`,
					emphasis: true,
				},
				{ label: 'Total days', labelZh: '总天数', value: formatNumber(totalDays) },
				{ label: 'Total weeks', labelZh: '总周数', value: `${formatNumber(weeks)} weeks, ${remDays} days`, valueZh: `${formatNumber(weeks)} 周零 ${remDays} 天` },
				{ label: 'Business days (Mon–Fri)', labelZh: '工作日天数（周一至周五）', value: formatNumber(businessDays(from, totalDays)) },
			],
			note: 'The breakdown counts full calendar periods and excludes the end date itself; tick the checkbox to include it in the day counts. Business days count Monday–Friday and ignore public holidays.',
			noteZh: '年/月/日按完整日历周期计且不含结束日当天；勾选后总天数与工作日将包含结束日。工作日仅统计周一至周五，不含法定节假日。',
		};
	},
};

// --- BMI & TDEE calculator ------------------------------------------------------------

/** Mifflin–St Jeor (1990): BMR in kcal/day. */
function bmr(sex: string, kg: number, cm: number, age: number): number {
	return 10 * kg + 6.25 * cm - 5 * age + (sex === 'male' ? 5 : -161);
}

const ACTIVITY: { value: string; factor: number; label: string; labelZh: string }[] = [
	{ value: 'sedentary', factor: 1.2, label: 'Sedentary — desk job, little exercise', labelZh: '久坐 — 办公室工作，几乎不运动' },
	{ value: 'light', factor: 1.375, label: 'Light — exercise 1–3 days / week', labelZh: '轻度 — 每周运动 1–3 天' },
	{ value: 'moderate', factor: 1.55, label: 'Moderate — exercise 3–5 days / week', labelZh: '中度 — 每周运动 3–5 天' },
	{ value: 'active', factor: 1.725, label: 'Active — exercise 6–7 days / week', labelZh: '高度 — 每周运动 6–7 天' },
	{ value: 'athlete', factor: 1.9, label: 'Athlete — physical job or 2× daily training', labelZh: '运动员 — 体力工作或每天两练' },
];

const bmiConfig: FormConfig = {
	intro: 'Body Mass Index, the healthy weight range for your height, your basal metabolic rate (Mifflin–St Jeor) and the daily calories that maintain or change your weight.',
	introZh: '身体质量指数 BMI、对应身高的健康体重范围、基础代谢率（Mifflin–St Jeor 公式）与维持或增减体重所需的每日热量。',
	fields: [
		{
			id: 'sex',
			type: 'select',
			label: 'Sex',
			labelZh: '性别',
			def: 'male',
			options: [
				{ value: 'male', label: 'Male', labelZh: '男' },
				{ value: 'female', label: 'Female', labelZh: '女' },
			],
		},
		{
			id: 'age',
			type: 'number',
			label: 'Age',
			labelZh: '年龄',
			required: true,
			def: '30',
			min: '2',
			max: '120',
			suffix: '(years)',
			suffixZh: '（岁）',
		},
		{
			id: 'height',
			type: 'number',
			label: 'Height',
			labelZh: '身高',
			required: true,
			def: '170',
			min: '50',
			max: '280',
			step: '0.1',
		},
		{
			id: 'heightUnit',
			type: 'select',
			label: 'Height unit',
			labelZh: '身高单位',
			def: 'cm',
			options: [
				{ value: 'cm', label: 'Centimeters (cm)', labelZh: '厘米 (cm)' },
				{ value: 'in', label: 'Inches (in)', labelZh: '英寸 (in)' },
			],
		},
		{
			id: 'weight',
			type: 'number',
			label: 'Weight',
			labelZh: '体重',
			required: true,
			def: '65',
			min: '10',
			max: '500',
			step: '0.1',
		},
		{
			id: 'weightUnit',
			type: 'select',
			label: 'Weight unit',
			labelZh: '体重单位',
			def: 'kg',
			options: [
				{ value: 'kg', label: 'Kilograms (kg)', labelZh: '千克 (kg)' },
				{ value: 'lb', label: 'Pounds (lb)', labelZh: '磅 (lb)' },
			],
		},
		{
			id: 'activity',
			type: 'select',
			label: 'Activity level',
			labelZh: '活动水平',
			def: 'moderate',
			options: ACTIVITY.map((a) => ({ value: a.value, label: a.label, labelZh: a.labelZh })),
		},
	],
	compute: (v) => {
		const kgPerLb = 0.45359237;
		const cmPerIn = 2.54;
		const hCm = v.str('heightUnit') === 'in' ? v.num('height') * cmPerIn : v.num('height');
		const wKg = v.str('weightUnit') === 'lb' ? v.num('weight') * kgPerLb : v.num('weight');
		const age = v.num('age');
		if (!Number.isFinite(hCm) || hCm <= 0 || !Number.isFinite(wKg) || wKg <= 0 || !Number.isFinite(age)) {
			return {
				rows: [{ label: 'BMI', labelZh: 'BMI', value: '— (enter a valid height, weight and age)', valueZh: '—（请输入有效的身高、体重与年龄）' }],
			};
		}
		const showKg = v.str('weightUnit') === 'kg';
		// Weight display: convert back into whichever unit the visitor chose.
		const showW = (kg: number): string => (showKg ? `${formatNumber(kg)} kg` : `${formatNumber(kg / kgPerLb)} lb`);

		const m = hCm / 100;
		const bmiVal = wKg / (m * m);
		const cat =
			bmiVal < 18.5
				? { en: 'Underweight (< 18.5)', zh: '偏瘦（< 18.5）' }
				: bmiVal < 25
					? { en: 'Normal weight (18.5 – 24.9)', zh: '正常（18.5 – 24.9）' }
					: bmiVal < 30
						? { en: 'Overweight (25 – 29.9)', zh: '超重（25 – 29.9）' }
						: { en: 'Obesity (≥ 30)', zh: '肥胖（≥ 30）' };

		const factor = ACTIVITY.find((a) => a.value === v.str('activity'))?.factor ?? 1.55;
		const base = bmr(v.str('sex'), wKg, hCm, age);
		const tdee = base * factor;
		const kcal = (n: number): { en: string; zh: string } => ({
			en: `${formatNumber(Math.round(n))} kcal/day`,
			zh: `${formatNumber(Math.round(n))} 千卡/天`,
		});

		return {
			rows: [
				{ label: 'BMI', labelZh: 'BMI', value: formatNumber(Math.round(bmiVal * 10) / 10), emphasis: true },
				{ label: 'Category', labelZh: '体重分类', value: cat.en, valueZh: cat.zh },
				{ label: 'Healthy weight range (BMI 18.5–24.9)', labelZh: '健康体重范围（BMI 18.5–24.9）', value: `${showW(18.5 * m * m)} – ${showW(24.9 * m * m)}` },
				{ label: 'BMR (Mifflin–St Jeor)', labelZh: '基础代谢率 BMR', value: kcal(base).en, valueZh: kcal(base).zh },
				{ label: `TDEE (activity × ${factor})`, labelZh: `每日总消耗 TDEE（活动系数 × ${factor}）`, value: kcal(tdee).en, valueZh: kcal(tdee).zh },
				{ label: 'Lose 0.25 kg / week (~0.55 lb)', labelZh: '每周减重 0.25 公斤（约 0.55 磅）', value: kcal(tdee - 275).en, valueZh: kcal(tdee - 275).zh },
				{ label: 'Lose 0.5 kg / week (~1.1 lb)', labelZh: '每周减重 0.5 公斤（约 1.1 磅）', value: kcal(tdee - 550).en, valueZh: kcal(tdee - 550).zh },
				{ label: 'Gain 0.5 kg / week', labelZh: '每周增重 0.5 公斤', value: kcal(tdee + 550).en, valueZh: kcal(tdee + 550).zh },
			],
			note: 'Categories follow the WHO BMI cutoffs; several Asian populations (including China) use 24 / 28 for overweight / obesity instead. 1 kg of body fat ≈ 7,700 kcal, so ±0.25 kg/week ≈ ±275 kcal/day. Estimates are for healthy adults and not medical advice.',
			noteZh: '分类采用 WHO BMI 标准；中国等亚洲人群常用 24 / 28 作为超重/肥胖界值。1 公斤体脂约等于 7,700 千卡，因此每周 ±0.25 公斤 ≈ 每日 ±275 千卡。结果适用于健康成年人，不构成医疗建议。',
		};
	},
};

export const DAILY_TOOLS: ToolEntry[] = [
	{
		slug: 'age-calculator',
		category: 'utilities',
		name: 'Age Calculator',
		nameZh: '年龄计算器',
		description: 'Exact age in years, months and days, plus total days lived and a countdown to your next birthday.',
		descriptionZh: '精确到年月日的年龄计算，附带已活总天数与下一个生日倒计时。',
		kind: 'form',
		config: ageConfig,
	},
	{
		slug: 'date-calculator',
		category: 'utilities',
		name: 'Date Calculator',
		nameZh: '日期计算器',
		description: 'Difference between two dates (with business days) and date arithmetic — add or subtract days, weeks, months or years.',
		descriptionZh: '计算两个日期的间隔（含工作日统计），并支持日期加减日、周、月、年。',
		kind: 'form',
		config: dateConfig,
	},
	{
		slug: 'bmi-calculator',
		category: 'utilities',
		name: 'BMI & Calorie Calculator',
		nameZh: 'BMI 与每日热量计算器',
		description: 'BMI with WHO category, healthy weight range, BMR (Mifflin–St Jeor) and daily calories to maintain or change weight.',
		descriptionZh: 'BMI 与 WHO 分类、健康体重范围、基础代谢率与增减重每日热量目标。',
		kind: 'form',
		config: bmiConfig,
	},
	{
		slug: 'timezone-converter',
		category: 'utilities',
		name: 'Time Zone Converter & World Clock',
		nameZh: '时区转换与世界时钟',
		description: 'Convert a moment between any two time zones (DST handled by the browser\u2019s own tz database) and see it across 12 world cities at once.',
		descriptionZh: '在任意两个时区间转换某一时刻（夏令时由浏览器时区数据库处理），并一次看到全球 12 个主要城市的时间。',
		kind: 'form',
		config: {
			// The IANA keys are the truth; the labels only make them readable.
			intro: 'Set a date and time in the "from" zone; the converter and the world-clock table follow. DST is handled by the browser\u2019s tz database.',
			introZh: '设定"源时区"的日期时间，转换结果与世界时钟随之更新。夏令时由浏览器时区数据库自动处理。',
			fields: [
				{ id: 'date', label: 'Date', labelZh: '日期', type: 'date', def: '2026-09-11', required: true },
				{ id: 'time', label: 'Time', labelZh: '时间', type: 'text', def: '14:30', placeholder: 'HH:MM (24h)', required: true },
				{
					id: 'from',
					label: 'From zone',
					labelZh: '源时区',
					type: 'select',
					def: 'Asia/Shanghai',
					options: ZONES.map((z) => ({ value: z.tz, label: z.label })),
				},
				{
					id: 'to',
					label: 'To zone',
					labelZh: '目标时区',
					type: 'select',
					def: 'America/New_York',
					options: ZONES.map((z) => ({ value: z.tz, label: z.label })),
				},
			],
			compute: (v) => {
				const row = (label: string, labelZh: string, value: string, valueZh = value) => ({ label, labelZh, value, valueZh });
				const from = v.str('from');
				const to = v.str('to');
				const dateStr = v.str('date');
				const timeStr = v.str('time');
				const tm = /^(\d{1,2}):(\d{2})$/.exec(timeStr.trim());
				if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr) || !tm)
					return { rows: [row('Input', '输入', '— (need a date and HH:MM time)', '—（需要日期与 HH:MM 时间）')] };
				const wallAsUtc = Date.parse(`${dateStr}T${pad2(Number(tm[1]))}:${tm[2]}:00Z`);
				if (!Number.isFinite(wallAsUtc))
					return { rows: [row('Input', '输入', '— (the date/time is not valid)', '—（日期/时间无效）')] };
				// wall time in `from` -> UTC: subtract the zone offset, iterating once
				// so a DST boundary in the gap lands on the right instant.
				const offsetOf = (zone: string, at: number): number => {
					try {
						const parts = new Intl.DateTimeFormat('en-US', {
							timeZone: zone,
							hour12: false,
							year: 'numeric',
							month: '2-digit',
							day: '2-digit',
							hour: '2-digit',
							minute: '2-digit',
							second: '2-digit',
						}).formatToParts(new Date(at));
						const get = (t: string): string => parts.find((p) => p.type === t)?.value ?? '0';
						const asUtc = Date.UTC(Number(get('year')), Number(get('month')) - 1, Number(get('day')), Number(get('hour')) % 24, Number(get('minute')), Number(get('second')));
						return asUtc - at;
					} catch {
						return 0;
					}
				};
				let utc = wallAsUtc - offsetOf(from, wallAsUtc);
				utc = wallAsUtc - offsetOf(from, utc);
				const WD_ZH: Record<string, string> = { Mon: '星期一', Tue: '星期二', Wed: '星期三', Thu: '星期四', Fri: '星期五', Sat: '星期六', Sun: '星期日' };
				const fmt = (zone: string, at: number): { time: string; date: string; wdEn: string; wdZh: string } => {
					const d = new Date(at);
					const p = new Intl.DateTimeFormat('en-GB', {
						timeZone: zone,
						hour12: false,
						weekday: 'short',
						year: 'numeric',
						month: '2-digit',
						day: '2-digit',
						hour: '2-digit',
						minute: '2-digit',
					}).formatToParts(d);
					const get = (t: string): string => p.find((x) => x.type === t)?.value ?? '';
					const wdEn = get('weekday');
					return {
						time: `${get('hour')}:${get('minute')}`,
						date: `${get('year')}-${get('month')}-${get('day')}`,
						wdEn,
						wdZh: WD_ZH[wdEn] ?? wdEn,
					};
				};
				const target = fmt(to, utc);
				const diffH = (offsetOf(to, utc) - offsetOf(from, utc)) / 3600000;
				const rows = [
					{
						label: `Time in ${to}`,
						labelZh: `${to} 的时间`,
						value: `${target.time} ${target.date}`,
						valueZh: `${target.time} ${target.date}`,
						emphasis: true,
					},
					row('Weekday', '星期', target.wdEn, target.wdZh),
					row('Time difference', '时差', `${diffH >= 0 ? '+' : ''}${formatNumber(diffH)} h`),
				];
				// The world clock: the same instant across the major zones.
				const table = {
					columns: ['City', 'Time', 'Date', 'Weekday'],
					columnsZh: ['城市', '时间', '日期', '星期'],
					rows: ZONES.map((z) => {
						const t = fmt(z.tz, utc);
						return [z.label, t.time, t.date, t.wdEn];
					}),
				};
				// zh weekday column: the table cells carry words, not digits
				const tableZh = {
					columns: ['城市', '时间', '日期', '星期'],
					rows: ZONES.map((z) => {
						const t = fmt(z.tz, utc);
						return [z.labelZh, t.time, t.date, t.wdZh];
					}),
				};
				return { rows, table: { ...table, rowsZh: tableZh.rows, columnsZh: tableZh.columns } };
			},
		},
	},
];
