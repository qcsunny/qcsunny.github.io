// Fake-lossless detector: is a "lossless" file actually a transcoded MP3/AAC?
//
// Lossy codecs low-pass their output — MP3 cuts at ~16 kHz (128 kbps) to
// ~20 kHz (320 kbps), AAC similar. Genuine CD-ripped lossless carries content
// up to 22.05 kHz. We decode the file with the browser's own audio stack,
// FFT the loudest windows, and find where the spectrum falls off a cliff.
//
// Honest limits, stated in the report: some genuine masters simply have
// little energy above 16 kHz (old recordings, quiet genres), so the verdict
// is a heuristic — the raw cutoff frequencies are always shown.

/** In-place iterative radix-2 FFT on re/im arrays of length n (power of 2). */
function fft(re: Float64Array, im: Float64Array): void {
	const n = re.length;
	// bit reversal
	for (let i = 1, j = 0; i < n; i++) {
		let bit = n >> 1;
		for (; j & bit; bit >>= 1) j ^= bit;
		j ^= bit;
		if (i < j) {
			[re[i], re[j]] = [re[j] as number, re[i] as number];
			[im[i], im[j]] = [im[j] as number, im[i] as number];
		}
	}
	for (let len = 2; len <= n; len <<= 1) {
		const ang = (-2 * Math.PI) / len;
		for (let i = 0; i < n; i += len) {
			for (let k = 0; k < len / 2; k++) {
				const wr = Math.cos(ang * k);
				const wi = Math.sin(ang * k);
				const ur = re[i + k] as number;
				const ui = im[i + k] as number;
				const vr = re[i + k + len / 2] as number;
				const vi = im[i + k + len / 2] as number;
				re[i + k] = ur + wr * vr - wi * vi;
				im[i + k] = ui + wr * vi + wi * vr;
				re[i + k + len / 2] = ur - wr * vr + wi * vi;
				im[i + k + len / 2] = ui - wr * vi - wi * vr;
			}
		}
	}
}

const N = 8192; // FFT window: ~5.4 Hz bins at 44.1 kHz — plenty for a cutoff scan

/** Median cutoff (Hz) across the loudest windows of a channel: the highest
 *  frequency whose magnitude stays within DYN_RANGE_DB of the window peak. */
function windowCutoffs(samples: Float32Array, sampleRate: number, windows: number): number[] {
	// pick the loudest windows: RMS over a coarse stride, keep top `windows`
	const stride = Math.max(N, Math.floor(samples.length / 64));
	const candidates: { rms: number; start: number }[] = [];
	for (let s = 0; s + N <= samples.length; s += stride) {
		let sum = 0;
		for (let i = s; i < s + N; i += 16) sum += (samples[i] as number) ** 2;
		candidates.push({ rms: sum, start: s });
	}
	candidates.sort((a, b) => b.rms - a.rms);
	const picked = candidates.slice(0, windows);
	const cutoffs: number[] = [];
	for (const { start } of picked) {
		const re = new Float64Array(N);
		const im = new Float64Array(N);
		// Hann window
		for (let i = 0; i < N; i++) re[i] = (samples[start + i] as number) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
		fft(re, im);
		const bins = N / 2;
		const mags = new Float64Array(bins);
		let peak = 0;
		for (let k = 0; k < bins; k++) {
			const m = Math.hypot(re[k] as number, im[k] as number);
			mags[k] = m;
			if (m > peak) peak = m;
		}
		if (peak <= 0) continue;
		// the cutoff = highest bin whose magnitude is within 60 dB of the peak
		const threshold = peak / 1000;
		let cut = 0;
		for (let k = bins - 1; k >= 0; k--) {
			if ((mags[k] as number) >= threshold) {
				cut = k;
				break;
			}
		}
		cutoffs.push(((cut + 1) * sampleRate) / N);
	}
	return cutoffs;
}

function median(xs: number[]): number {
	if (!xs.length) return 0;
	const s = [...xs].sort((a, b) => a - b);
	return s[Math.floor(s.length / 2)] as number;
}

/** The fileTransform entry: decode with WebAudio, scan the spectrum, report. */
export async function losslessCheck(data: ArrayBuffer, name: string): Promise<{ output: string; error?: string; errorZh?: string }> {
	const ctx = new AudioContext();
	let audio: AudioBuffer;
	try {
		audio = await ctx.decodeAudioData(data.slice(0));
	} catch {
		await ctx.close();
		return {
			output: '',
			error: 'The browser could not decode this file as audio (try FLAC / WAV / MP3 / AAC).',
			errorZh: '浏览器无法将此文件解码为音频（试试 FLAC / WAV / MP3 / AAC）。',
		};
	}
	const sampleRate = audio.sampleRate;
	const channel = audio.getChannelData(0);
	const cutoffs = windowCutoffs(channel, sampleRate, 6);
	await ctx.close();
	if (!cutoffs.length) {
		return { output: '', error: 'The file appears to be silent — no spectrum to analyze.', errorZh: '文件似乎是无声的——没有频谱可分析。' };
	}
	const cut = median(cutoffs);
	const ctxNyquist = sampleRate / 2;
	// decodeAudioData resamples to the AudioContext rate, so sampleRate above is
	// the *decode* rate, not the file's own rate. A 44.1 kHz master tops out at
	// 22050 Hz, which sits below the 24 kHz Nyquist of a 48 kHz context — judge
	// against the smaller ceiling or every genuine CD rip reads as a transcode.
	const refCeiling = Math.min(ctxNyquist, 22050);

	// Verdict bands against an absolute ceiling, not against the context rate.
	// 0.97 × 22050 = 21389 Hz clears LAME 320's ~20.5 kHz lossy floor while
	// still accepting real rips whose energy runs to 21–22 kHz. 15.5–21.4 kHz:
	// classic lossy low-pass (V0 ~19.5, 128 ~16); below that: heavy lossy or
	// a dull master.
	let verdictEn: string;
	let verdictZh: string;
	if (cut >= refCeiling * 0.97) {
		verdictEn = `Consistent with true lossless — energy reaches the ${refCeiling / 1000} kHz ceiling.`;
		verdictZh = `与真无损一致——能量一直延伸到 ${refCeiling / 1000} kHz 天花板。`;
	} else if (cut >= 15500) {
		verdictEn = `Frequency ceiling at ${Math.round(cut)} Hz — the signature of a lossy low-pass (MP3/AAC transcode).`;
		verdictZh = `频率天花板在 ${Math.round(cut)} Hz——典型的有损低通特征（MP3/AAC 转码）。`;
	} else {
		verdictEn = `Very low ceiling at ${Math.round(cut)} Hz — either a low-bitrate transcode or a dull master; check the sample itself.`;
		verdictZh = `频率天花板低至 ${Math.round(cut)} Hz——可能是低码率转码，也可能是母带本身偏暗；请结合样本判断。`;
	}

	const lines: [string, string][] = [
		['File 文件', name],
		['Decode rate 解码采样率', `${sampleRate} Hz (Nyquist ${Math.round(ctxNyquist)} Hz, ref ceiling ${refCeiling / 1000} kHz)`],
		['Channels 声道', String(audio.numberOfChannels)],
		['Duration 时长', `${audio.duration.toFixed(1)} s`],
		['Cutoff (median) 截止频率(中位)', `${Math.round(cut)} Hz`],
		['Cutoff per window 各窗口', cutoffs.map((c) => `${Math.round(c / 1000)}k`).join(' ')],
		['Verdict 判定', verdictEn],
		['', verdictZh],
		['Note 说明', 'Heuristic: some genuine masters have little energy above 16 kHz — treat the cutoff, not only the verdict.'],
		['', '此判定为启发式：部分真无损母带 16 kHz 以上能量本就很少——请结合截止频率本身，而非只看结论。'],
	];
	return { output: lines.map(([l, v]) => (l ? `${l.padEnd(28)} ${v}` : ` ${' '.repeat(28)} ${v}`)).join('\n') };
}
