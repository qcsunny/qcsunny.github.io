// Descriptive statistics for the /calculators/average page.
// Extracted from the old calculator Stats tab.

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
	const modes =
		maxFreq > 1 ? [...freq.entries()].filter(([, f]) => f === maxFreq).map(([v]) => v).sort((a, b) => a - b) : null;

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
