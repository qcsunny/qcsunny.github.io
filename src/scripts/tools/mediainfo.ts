// Media file metadata extractor (a tiny MediaInfo): parses MP4/MOV boxes and
// WebM/MKV EBML structure for codec / resolution / duration / fps / audio
// info, with WAV/RIFF and FLAC STREAMINFO readers and an HTMLMediaElement fallback for
// containers the walker does not know. Runs entirely on the dropped file's
// bytes in the browser — nothing is uploaded.

export interface MediaLine {
	label: string;
	labelZh: string;
	value: string;
}

function fmtDuration(sec: number): string {
	if (!Number.isFinite(sec) || sec <= 0) return '—';
	const h = Math.floor(sec / 3600);
	const m = Math.floor((sec % 3600) / 60);
	const s = Math.floor(sec % 60);
	const ms = Math.round((sec % 1) * 1000);
	const two = (n: number): string => String(n).padStart(2, '0');
	return h > 0 ? `${h}:${two(m)}:${two(s)}` : `${m}:${two(s)}.${String(ms).padStart(3, '0')}`;
}

function humanSize(n: number): string {
	if (n < 1024) return `${n} B`;
	if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
	if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
	return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

const CODEC_NAMES: Record<string, string> = {
	avc1: 'H.264 / AVC',
	avc3: 'H.264 / AVC',
	hvc1: 'H.265 / HEVC',
	hev1: 'H.265 / HEVC',
	av01: 'AV1',
	vp09: 'VP9',
	mp4a: 'AAC',
	Opus: 'Opus',
	'ac-3': 'Dolby AC-3',
	'ec-3': 'Dolby E-AC-3 (Dolby Digital Plus)',
	dvh1: 'Dolby Vision (H.265)',
	dvhe: 'Dolby Vision (H.265)',
	'dvav': 'Dolby Vision (AV1)',
	sowt: 'PCM (little-endian)',
	lpcm: 'PCM',
	alac: 'ALAC',
};

function codecName(fourcc?: string): string {
	if (!fourcc) return 'unknown codec';
	return CODEC_NAMES[fourcc] ?? fourcc;
}

// --- ISO-BMFF (MP4 / MOV / M4A) ----------------------------------------------------------
//
// Box layout references: ISO/IEC 14496-12. Sample-entry offsets (from the
// entry's own box start E): video width/height at E+32/E+34; audio channels
// at E+24, sample rate (16.16 fixed) at E+32.

interface Mp4Track {
	kind: 'video' | 'audio' | 'other';
	/** HDR flavor from the colr/dvcC boxes, when present */
	hdr?: 'HDR10' | 'HLG' | 'Dolby Vision';
	width?: number;
	height?: number;
	codec?: string;
	sampleRate?: number;
	channels?: number;
	sttsSamples?: number;
	sttsTicks?: number;
}

function parseMp4(buf: ArrayBuffer): { lines: MediaLine[]; durationSec: number } | null {
	const dv = new DataView(buf);
	const len = buf.byteLength;
	const fourcc = (o: number): string => String.fromCharCode(dv.getUint8(o), dv.getUint8(o + 1), dv.getUint8(o + 2), dv.getUint8(o + 3));

	/** Walk sibling boxes in [start, end); visit(boxType, contentStart, contentEnd). */
	const walk = (start: number, end: number, visit: (type: string, cs: number, ce: number) => void): void => {
		let o = start;
		while (o + 8 <= end) {
			let size = dv.getUint32(o);
			const type = fourcc(o + 4);
			let hdr = 8;
			if (size === 1) {
				if (o + 16 > end) return;
				size = Number(dv.getBigUint64(o + 8));
				hdr = 16;
			} else if (size === 0) size = end - o;
			if (size < hdr || o + size > end) return;
			visit(type, o + hdr, o + size);
			o += size;
		}
	};

	let brand = '';
	let timescale = 0;
	let duration = 0;
	const tracks: Mp4Track[] = [];

	walk(0, len, (type, cs, ce) => {
		if (type === 'ftyp') brand = fourcc(cs);
		if (type !== 'moov') return;
		walk(cs, ce, (t2, cs2, ce2) => {
			if (t2 === 'mvhd') {
				const version = dv.getUint8(cs2);
				if (version === 1) {
					timescale = dv.getUint32(cs2 + 20);
					duration = Number(dv.getBigUint64(cs2 + 24));
				} else {
					timescale = dv.getUint32(cs2 + 12);
					duration = dv.getUint32(cs2 + 16);
				}
			}
			if (t2 !== 'trak') return;
			const track: Mp4Track = { kind: 'other' };
			walk(cs2, ce2, (t3, cs3, ce3) => {
				if (t3 === 'tkhd') {
					// width/height (16.16 fixed) are the box's last 8 content bytes
					const w = dv.getUint32(ce3 - 8) / 65536;
					const h = dv.getUint32(ce3 - 4) / 65536;
					if (w > 0 && h > 0) {
						track.width = Math.round(w);
						track.height = Math.round(h);
					}
				}
				if (t3 !== 'mdia') return;
				walk(cs3, ce3, (t4, cs4, ce4) => {
					if (t4 === 'hdlr') {
						const h = fourcc(cs4 + 8);
						track.kind = h === 'vide' ? 'video' : h === 'soun' ? 'audio' : 'other';
					}
					if (t4 === 'minf') {
						walk(cs4, ce4, (t5, cs5, ce5) => {
							if (t5 !== 'stbl') return;
							walk(cs5, ce5, (t6, cs6, ce6) => {
								if (t6 === 'stsd') {
									// content: version/flags(4) + entryCount(4) + first entry at E
									const E = cs6 + 8;
									if (E + 36 > ce6) return;
									track.codec = fourcc(E + 4);
									const isAudio = track.codec === 'mp4a' || track.codec === 'Opus' || track.codec === 'ac-3' || track.codec === 'ec-3';
									if (isAudio) {
										track.channels = dv.getUint16(E + 24);
										track.sampleRate = Math.round(dv.getUint32(E + 32) / 65536);
									} else {
										const w = dv.getUint16(E + 32);
										const h = dv.getUint16(E + 34);
										if (w && h) {
											track.width = w;
											track.height = h;
										}
									}
									// Child boxes inside the sample entry carry the HDR story:
									//   colr/nclx — primaries + transfer (16 = PQ/HDR10, 18 = HLG)
									//   dvcC/dvvC — Dolby Vision (profile in byte 3)
									// Video entries: fixed part is 78 bytes; audio: 28.
									const fixed = isAudio ? 8 + 28 : 8 + 78;
									const entrySize = dv.getUint32(E);
									const entryEnd = Math.min(ce6, E + (entrySize > 8 ? entrySize : ce6 - E));
									walk(E + fixed, entryEnd, (child, ccs, _cce) => {
										if (child === 'dvcC' || child === 'dvvC') {
											track.hdr = 'Dolby Vision';
										} else if (child === 'colr' && fourcc(ccs) === 'nclx') {
											const transfer = dv.getUint16(ccs + 6);
											if (transfer === 16) track.hdr = track.hdr ?? 'HDR10';
											else if (transfer === 18) track.hdr = track.hdr ?? 'HLG';
										}
									});
								}
								if (t6 === 'stts') {
									// content: version/flags(4) + entryCount(4) + (count, delta) pairs
									const n = dv.getUint32(cs6 + 4);
									let samples = 0;
									let ticks = 0;
									for (let i = 0; i < n && cs6 + 8 + i * 8 + 8 <= ce6; i++) {
										const c = dv.getUint32(cs6 + 8 + i * 8);
										const d = dv.getUint32(cs6 + 8 + i * 8 + 4);
										samples += c;
										ticks += c * d;
									}
									if (samples > 0 && ticks > 0) {
										track.sttsSamples = samples;
										track.sttsTicks = ticks;
									}
								}
							});
						});
					}
				});
			});
			tracks.push(track);
		});
	});

	if (!brand && tracks.length === 0) return null; // not an ISO-BMFF file
	const durationSec = timescale > 0 ? duration / timescale : 0;

	const lines: MediaLine[] = [{ label: 'Container', labelZh: '容器', value: `ISO-BMFF (brand: ${brand || '—'})` }];
	if (durationSec > 0) lines.push({ label: 'Duration', labelZh: '时长', value: fmtDuration(durationSec) });
	const video = tracks.find((t) => t.kind === 'video');
	const audio = tracks.find((t) => t.kind === 'audio');
	if (video) {
		lines.push({
			label: 'Video',
			labelZh: '视频轨',
			value: `${codecName(video.codec)}${video.width ? ` · ${video.width}×${video.height}` : ''}${video.hdr ? ` · ${video.hdr}` : ''}`,
		});
		if (video.sttsSamples && video.sttsTicks && timescale > 0) {
			const fps = (video.sttsSamples * timescale) / video.sttsTicks;
			lines.push({ label: 'Frame rate', labelZh: '帧率', value: `${fps.toFixed(2).replace(/\.?0+$/, '')} fps` });
		}
	} else lines.push({ label: 'Video', labelZh: '视频轨', value: '— (none)' });
	if (audio) {
		const parts = [codecName(audio.codec)];
		if (audio.channels) parts.push(`${audio.channels} ch`);
		if (audio.sampleRate) parts.push(`${audio.sampleRate} Hz`);
		lines.push({ label: 'Audio', labelZh: '音频轨', value: parts.join(' · ') });
	} else lines.push({ label: 'Audio', labelZh: '音频轨', value: '— (none)' });
	lines.push({ label: 'Tracks', labelZh: '轨道数', value: String(tracks.length) });
	return { lines, durationSec };
}

// --- WAV / RIFF -----------------------------------------------------------------------------

function parseWav(buf: ArrayBuffer): { lines: MediaLine[]; durationSec: number } | null {
	const dv = new DataView(buf);
	const tag = (o: number): string => String.fromCharCode(dv.getUint8(o), dv.getUint8(o + 1), dv.getUint8(o + 2), dv.getUint8(o + 3));
	if (buf.byteLength < 44 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return null;
	const channels = dv.getUint16(22, true);
	const sampleRate = dv.getUint32(24, true);
	const bits = dv.getUint16(34, true);
	let dataBytes = 0;
	let o = 12;
	while (o + 8 <= buf.byteLength) {
		const id = tag(o);
		const size = dv.getUint32(o + 4, true);
		if (id === 'data') {
			dataBytes = size;
			break;
		}
		o += 8 + size + (size % 2);
	}
	const byteRate = (sampleRate * channels * bits) / 8 || 1;
	const durationSec = dataBytes / byteRate;
	return {
		lines: [
			{ label: 'Container', labelZh: '容器', value: 'WAV (RIFF / PCM)' },
			{ label: 'Duration', labelZh: '时长', value: fmtDuration(durationSec) },
			{ label: 'Audio', labelZh: '音频轨', value: `PCM · ${channels} ch · ${sampleRate} Hz · ${bits}-bit` },
			{ label: 'Bit rate', labelZh: '码率', value: `${Math.round((byteRate * 8) / 1000)} kbps` },
		],
		durationSec,
	};
}

// --- MP3 -------------------------------------------------------------------------------------
//
// Frame header (4 bytes after any ID3v2 tag): version/layer bits, bitrate
// index, sample rate index, channel mode. CBR duration = size×8/bitrate.

const MP3_BITRATES: Record<string, number[]> = {
	// V1L3, V1L2, V1L1, V2L3, V2L2, V2L1 (kbit/s, index 0 = free)
	v1l3: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0],
	v1l2: [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384, 0],
	v1l1: [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448, 0],
	v2l3: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0],
	v2l2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0],
	v2l1: [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256, 0],
};
const MP3_RATES: Record<number, number[]> = {
	3: [44100, 48000, 32000], // MPEG1
	2: [22050, 24000, 16000], // MPEG2
	0: [11025, 12000, 8000], // MPEG2.5
};

function parseMp3(buf: ArrayBuffer): { lines: MediaLine[]; durationSec: number } | null {
	const dv = new DataView(buf);
	const len = buf.byteLength;
	// skip ID3v2: "ID3" + ver(2) + flags(1) + syncsafe size(4)
	let off = 0;
	if (len > 10 && dv.getUint8(0) === 0x49 && dv.getUint8(1) === 0x44 && dv.getUint8(2) === 0x33) {
		const size = ((dv.getUint8(6) & 0x7f) << 21) | ((dv.getUint8(7) & 0x7f) << 14) | ((dv.getUint8(8) & 0x7f) << 7) | (dv.getUint8(9) & 0x7f);
		off = 10 + size;
	}
	// find a frame sync: 11 set bits
	let hdr = -1;
	for (let o = off; o + 4 <= Math.min(len, off + 64 * 1024); o++) {
		if (dv.getUint8(o) === 0xff && (dv.getUint8(o + 1) & 0xe0) === 0xe0) {
			hdr = o;
			break;
		}
	}
	if (hdr < 0) return null;
	const b1 = dv.getUint8(hdr + 1) as number;
	const b2 = dv.getUint8(hdr + 2) as number;
	const verBits = (b1 >> 3) & 0x03; // 3=MPEG1, 2=MPEG2, 0=MPEG2.5, 1=reserved
	const layerBits = (b1 >> 1) & 0x03; // 1=III, 2=II, 3=I
	if (verBits === 1 || layerBits === 0) return null;
	const ver = verBits === 3 ? 1 : verBits === 2 ? 2 : 2.5;
	const layer = layerBits === 1 ? 3 : layerBits === 2 ? 2 : 1;
	const key = `v${verBits === 3 ? 1 : 2}l${layer}`;
	const brIdx = (b2 >> 4) & 0x0f;
	const srIdx = (b2 >> 2) & 0x03;
	const modeBits = (dv.getUint8(hdr + 3) as number) >> 6;
	const bitrate = (MP3_BITRATES[key] ?? MP3_BITRATES['v1l3'] as number[])[brIdx] ?? 0;
	const sampleRate = (MP3_RATES[verBits] ?? [])[srIdx] ?? 0;
	if (!bitrate || !sampleRate) return null;
	const channels = modeBits === 3 ? 1 : 2;
	const durationSec = (len * 8) / (bitrate * 1000); // CBR estimate
	const lines: MediaLine[] = [
		{ label: 'Container', labelZh: '容器', value: `MP3 (MPEG ${ver} Layer ${layer}, CBR)` },
		{ label: 'Duration', labelZh: '时长', value: `${fmtDuration(durationSec)} (estimated)` },
		{ label: 'Audio', labelZh: '音频轨', value: `MP3 · ${channels} ch · ${sampleRate} Hz · ${bitrate} kbps` },
	];
	return { lines, durationSec };
}

// --- FLAC -----------------------------------------------------------------------------------

function parseFlac(buf: ArrayBuffer): { lines: MediaLine[]; durationSec: number } | null {
	const dv = new DataView(buf);
	const tag = (o: number): string => String.fromCharCode(dv.getUint8(o), dv.getUint8(o + 1), dv.getUint8(o + 2), dv.getUint8(o + 3));
	if (buf.byteLength < 42 || tag(0) !== 'fLaC') return null;
	// The first metadata block must be STREAMINFO (type 0), 34 bytes:
	//   4.18: min/max blocksize, 3.18: min/max frame size, then a 128-bit tail
	//   holding sample rate (20 bits), channels−1 (3 bits), bits−1 (5 bits),
	//   total samples (36 bits).
	if ((dv.getUint8(4) & 0x7f) !== 0) return null;
	const bits = dv.getUint32(18) >>> 0; // big-endian window: rate<<12 | ch<<9 | depth<<4 | hi(samples)
	const sampleRate = bits >>> 12;
	const channels = ((bits >>> 9) & 0x07) + 1;
	const depth = ((bits >>> 4) & 0x1f) + 1;
	const totalSamples = (bits & 0x0f) * 2 ** 32 + (dv.getUint32(22) >>> 0);
	const durationSec = sampleRate > 0 ? totalSamples / sampleRate : 0;
	return {
		lines: [
			{ label: 'Container', labelZh: '容器', value: 'FLAC (lossless audio)' },
			{ label: 'Duration', labelZh: '时长', value: fmtDuration(durationSec) },
			{ label: 'Audio', labelZh: '音频轨', value: `FLAC · ${channels} ch · ${sampleRate} Hz · ${depth}-bit` },
			{ label: 'Bit rate', labelZh: '码率', value: durationSec > 0 ? `${Math.round((buf.byteLength * 8) / durationSec / 1000)} kbps` : '—' },
		],
		durationSec,
	};
}

// --- WebM / MKV (EBML) ----------------------------------------------------------------------
//
// EBML: every element is ID (vint, marker kept) + size (vint, marker stripped)
// + payload. Masters recurse. IDs read here are full multi-byte values.

function parseEbml(buf: ArrayBuffer): { lines: MediaLine[]; durationSec: number } | null {
	const dv = new DataView(buf);
	const len = buf.byteLength;
	if (len < 4 || dv.getUint8(0) !== 0x1a || dv.getUint8(1) !== 0x45 || dv.getUint8(2) !== 0xdf || dv.getUint8(3) !== 0xa3) return null;

	/** Read a vint at pos. `strip` drops the marker bits (sizes); IDs keep them. */
	const vint = (pos: number, strip: boolean): { value: number; len: number } | null => {
		if (pos >= len) return null;
		const first = dv.getUint8(pos);
		if (first === 0) return null;
		let n = 0;
		let mask = 0x80;
		while (mask && !(first & mask)) {
			mask >>= 1;
			n++;
		}
		if (n > 7 || pos + 1 + n > len) return null;
		let v = strip ? first & (0xff >> (n + 1)) : first;
		for (let i = 1; i <= n; i++) v = v * 256 + dv.getUint8(pos + i);
		return { value: v, len: n + 1 };
	};

	const MASTERS = new Set([0x1a45dfa3, 0x18538067, 0x1549a966, 0x1654ae6b, 0xae, 0xe0, 0xe1]);
	interface TrackInfo {
		type?: number;
		codec?: string;
		w?: number;
		h?: number;
		ch?: number;
		sr?: number;
	}
	const tracks: TrackInfo[] = [];
	let timestampScale = 1_000_000;
	let durationRaw = 0;
	let docType = '';

	const walk = (start: number, end: number, depth: number, track: TrackInfo | null): void => {
		let pos = start;
		while (pos + 2 <= end && depth <= 6) {
			const idR = vint(pos, false);
			if (!idR) break;
			const szR = vint(pos + idR.len, true);
			if (!szR) break;
			const contentStart = pos + idR.len + szR.len;
			if (contentStart > end) break;
			const size = szR.value;
			const contentEnd = size === 0 ? end : Math.min(end, contentStart + size);
			const id = idR.value;
			const isTrackEntry = id === 0xae;
			const child: TrackInfo | null = isTrackEntry ? {} : track;
			if (size === 0 || MASTERS.has(id)) {
				walk(contentStart, contentEnd, depth + 1, child);
				if (isTrackEntry && child && (child.type !== undefined || child.codec)) tracks.push(child);
			} else {
				const payload = (max: number): number => {
					let v = 0;
					for (let i = 0; i < Math.min(size, max); i++) v = v * 256 + dv.getUint8(contentStart + i);
					return v;
				};
				const str = (): string => {
					const out: number[] = [];
					for (let i = 0; i < Math.min(size, 64); i++) out.push(dv.getUint8(contentStart + i));
					return String.fromCharCode(...out).replace(/\0.*$/, '');
				};
				switch (id) {
					case 0x4282:
						docType = str();
						break; // DocType
					case 0x2ad7b1:
						timestampScale = payload(8) || timestampScale;
						break; // TimestampScale
					case 0x4489:
						durationRaw =
							size === 4 ? dv.getFloat32(contentStart) : size === 8 ? dv.getFloat64(contentStart) : payload(8);
						break; // Duration (float)
					case 0x83:
						if (track) track.type = payload(1);
						break; // TrackType (1 video, 2 audio)
					case 0x86:
						if (track) track.codec = str();
						break; // CodecID (V_VP9, A_OPUS, …)
					case 0xb0:
						if (track) track.w = payload(4);
						break; // PixelWidth
					case 0xba:
						if (track) track.h = payload(4);
						break; // PixelHeight
					case 0x9f:
						if (track) track.ch = payload(2);
						break; // Channels
					case 0xb5:
						if (track) track.sr = Math.round(payload(4) / 1000);
						break; // SamplingFrequency (float, commonly ×1000)
				}
			}
			if (size === 0) break; // unknown size: this level ends here
			pos = contentEnd;
		}
	};

	walk(0, len, 0, null);
	const durationSec = durationRaw > 0 ? (durationRaw * timestampScale) / 1e9 : 0;
	const WEBM_CODEC: Record<string, string> = {
		V_VP8: 'VP8',
		V_VP9: 'VP9',
		V_AV1: 'AV1',
		V_MPEG4: 'MPEG-4',
		'V_MPEG4/ISO/AVC': 'H.264 / AVC',
		'V_MPEGH/ISO/HEVC': 'H.265 / HEVC',
		A_OPUS: 'Opus',
		A_VORBIS: 'Vorbis',
		A_AAC: 'AAC',
	};
	const video = tracks.find((t) => t.type === 1);
	const audio = tracks.find((t) => t.type === 2);
	const lines: MediaLine[] = [
		{ label: 'Container', labelZh: '容器', value: `${docType === 'matroska' ? 'Matroska' : 'WebM'} (EBML)` },
	];
	if (durationSec > 0) lines.push({ label: 'Duration', labelZh: '时长', value: fmtDuration(durationSec) });
	if (video)
		lines.push({
			label: 'Video',
			labelZh: '视频轨',
			value: `${WEBM_CODEC[video.codec ?? ''] ?? video.codec ?? 'unknown codec'}${video.w ? ` · ${video.w}×${video.h}` : ''}`,
		});
	else lines.push({ label: 'Video', labelZh: '视频轨', value: '— (none)' });
	if (audio) {
		const parts = [WEBM_CODEC[audio.codec ?? ''] ?? audio.codec ?? 'unknown codec'];
		if (audio.ch) parts.push(`${audio.ch} ch`);
		if (audio.sr) parts.push(`${audio.sr} Hz`);
		lines.push({ label: 'Audio', labelZh: '音频轨', value: parts.join(' · ') });
	} else lines.push({ label: 'Audio', labelZh: '音频轨', value: '— (none)' });
	lines.push({ label: 'Tracks', labelZh: '轨道数', value: String(tracks.length) });
	return { lines, durationSec };
}

// --- entry point -----------------------------------------------------------------------------

/** The fileTransform entry point: bytes → report text. */
export async function mediaInfo(
	data: ArrayBuffer,
	name: string,
	size: number,
): Promise<{ output: string; error?: string; errorZh?: string }> {
	const head: MediaLine[] = [{ label: 'File', labelZh: '文件', value: `${name} (${humanSize(size)})` }];
	const parsed = parseMp4(data) ?? parseWav(data) ?? parseFlac(data) ?? parseMp3(data) ?? parseEbml(data);
	if (parsed) {
		const lines = [...head, ...parsed.lines];
		if (parsed.durationSec > 0)
			lines.push({ label: 'Overall bit rate', labelZh: '总码率', value: `${Math.round((size * 8) / parsed.durationSec / 1000)} kbps` });
		lines.push({
			label: 'Privacy',
			labelZh: '隐私',
			value: 'Parsed locally · 本地解析，文件不出设备',
		});
		return { output: renderLines(lines) };
	}

	// Unknown container: fall back to the browser's own media stack via a blob
	// URL — still local, just decoded instead of parsed.
	const meta = await new Promise<{ w: number; h: number; d: number } | null>((resolve) => {
		const el = document.createElement('video');
		const url = URL.createObjectURL(new Blob([data]));
		const done = (r: { w: number; h: number; d: number } | null): void => {
			URL.revokeObjectURL(url);
			resolve(r);
		};
		el.preload = 'metadata';
		el.onloadedmetadata = () => done({ w: el.videoWidth, h: el.videoHeight, d: el.duration });
		el.onerror = () => done(null);
		setTimeout(() => done(null), 4000);
		el.src = url;
	});
	if (meta && (meta.w || meta.d > 0)) {
		const lines = [
			...head,
			{ label: 'Container', labelZh: '容器', value: 'unknown (browser metadata)' },
			{ label: 'Duration', labelZh: '时长', value: fmtDuration(meta.d) },
			{
				label: 'Video',
				labelZh: '视频轨',
				value: meta.w ? `${meta.w}×${meta.h}` : '— (audio only?)',
			},
			{
				label: 'Note',
				labelZh: '说明',
				value: 'Container not recognized · 容器未识别，以上为浏览器能解出的字段',
			},
		];
		return { output: renderLines(lines) };
	}
	return {
		output: '',
		error: 'Not a media file this tool recognizes (MP4/MOV, WebM/MKV, WAV, FLAC, MP3).',
		errorZh: '不是本工具支持的媒体文件（MP4/MOV、WebM/MKV、WAV、FLAC、MP3）。',
	};
}

/** A textarea report cannot carry .i18n span pairs, so every line shows both
 *  halves of its label ("File 文件") — bilingual without a rebuild. */
function renderLines(lines: MediaLine[]): string {
	return lines.map((l) => `${(l.label + ' ' + l.labelZh).padEnd(26)} ${l.value}`).join('\n');
}
