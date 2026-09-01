import { formatNumber } from './engine';

export interface StatsResult {
	count: number;
	sum: number;
	mean: number;
	median: number;
	modes: number[] | null;
	min: number;
	max: number;
	varianceS: number; // sample (n-1)
	sdS: number;
	varianceP: number; // population (n)
	sdP: number;
}

export function parseNumbers(text: string): { nums: number[]; invalid: string[] } {
	const parts = text.split(/[\s,;]+/).filter((p) => p.length > 0);
	const nums: number[] = [];
	const invalid: string[] = [];
	for (const part of parts) {
		const n = Number(part);
		if (Number.isFinite(n)) nums.push(n);
		else invalid.push(part);
	}
	return { nums, invalid };
}

export function computeStats(nums: number[]): StatsResult | null {
	const n = nums.length;
	if (n === 0) return null;
	const sum = nums.reduce((a, b) => a + b, 0);
	const mean = sum / n;

	const sorted = [...nums].sort((a, b) => a - b);
	const median =
		n % 2 === 1 ? (sorted[(n - 1) / 2] as number) : ((sorted[n / 2 - 1] as number) + (sorted[n / 2] as number)) / 2;

	// mode: most frequent value(s); only when frequency > 1
	const freq = new Map<number, number>();
	for (const v of nums) freq.set(v, (freq.get(v) ?? 0) + 1);
	const maxFreq = Math.max(...freq.values());
	const modes = maxFreq > 1 ? [...freq.entries()].filter(([, f]) => f === maxFreq).map(([v]) => v).sort((a, b) => a - b) : null;

	const ss = nums.reduce((acc, v) => acc + (v - mean) ** 2, 0);
	const varianceP = ss / n;
	const varianceS = n >= 2 ? ss / (n - 1) : Number.NaN;

	return {
		count: n,
		sum,
		mean,
		median,
		modes,
		min: sorted[0] as number,
		max: sorted[n - 1] as number,
		varianceS,
		sdS: Math.sqrt(varianceS),
		varianceP,
		sdP: Math.sqrt(varianceP),
	};
}

export function initStats(): void {
	const input = document.querySelector<HTMLTextAreaElement>('#stats-input');
	const invalidEl = document.querySelector<HTMLElement>('#stats-invalid');
	const body = document.querySelector<HTMLTableSectionElement>('#stats-body');
	const emptyEl = document.querySelector<HTMLElement>('#stats-empty');
	if (!input || !invalidEl || !body || !emptyEl) return;

	function update(): void {
		const { nums, invalid } = parseNumbers(input!.value);
		if (invalid.length > 0) {
			invalidEl!.hidden = false;
			invalidEl!.textContent = `Ignoring invalid entr${invalid.length === 1 ? 'y' : 'ies'}: ${invalid.join(', ')}`;
		} else {
			invalidEl!.hidden = true;
		}

		const stats = computeStats(nums);
		body!.innerHTML = '';
		emptyEl!.hidden = stats !== null;
		if (!stats) return;

		const fmt = (v: number): string => (Number.isNaN(v) ? '—' : formatNumber(v));
		const rows: Array<[string, string]> = [
			['Count', String(stats.count)],
			['Sum', fmt(stats.sum)],
			['Mean', fmt(stats.mean)],
			['Median', fmt(stats.median)],
			['Mode', stats.modes ? stats.modes.map((m) => formatNumber(m)).join(', ') : '—'],
			['Min', fmt(stats.min)],
			['Max', fmt(stats.max)],
			['Sample variance (s², n−1)', fmt(stats.varianceS)],
			['Sample std. deviation (s)', fmt(stats.sdS)],
			['Population variance (σ², n)', fmt(stats.varianceP)],
			['Population std. deviation (σ)', fmt(stats.sdP)],
		];
		for (const [label, value] of rows) {
			const tr = document.createElement('tr');
			const th = document.createElement('th');
			th.scope = 'row';
			th.textContent = label;
			const td = document.createElement('td');
			td.textContent = value;
			tr.append(th, td);
			body!.append(tr);
		}
	}

	input.addEventListener('input', update);
	update();
}
