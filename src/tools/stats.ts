// Descriptive statistics for the /calculators/descriptive-statistics page
// (it absorbed the retired /calculators/average tool) and for the average
// calculator's regression tool.

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

	// Welford online algorithm: single-pass mean + sum-of-squared deviations.
	// Avoids catastrophic cancellation that affects the naive Σ(xᵢ−mean)² formula
	// when the mean is large relative to the spread.
	let mean = 0;
	let M2 = 0;
	let sum = 0;
	for (let i = 0; i < n; i++) {
		const x = nums[i]!;
		sum += x;
		const delta = x - mean;
		mean += delta / (i + 1);
		M2 += delta * (x - mean); // (x - newMean) for numerical stability
	}

	const sorted = [...nums].sort((a, b) => a - b);
	const median =
		n % 2 === 1 ? (sorted[(n - 1) / 2] as number) : ((sorted[n / 2 - 1] as number) + (sorted[n / 2] as number)) / 2;

	// mode: most frequent value(s); only when frequency > 1
	const freq = new Map<number, number>();
	for (const v of nums) freq.set(v, (freq.get(v) ?? 0) + 1);
	let maxFreq = 0;
	for (const f of freq.values()) if (f > maxFreq) maxFreq = f;
	const modes =
		maxFreq > 1 ? [...freq.entries()].filter(([, f]) => f === maxFreq).map(([v]) => v).sort((a, b) => a - b) : null;

	const varianceP = M2 / n;
	const varianceS = n >= 2 ? M2 / (n - 1) : Number.NaN;

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

