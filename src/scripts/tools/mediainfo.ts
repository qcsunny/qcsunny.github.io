// Media file metadata extractor (a tiny MediaInfo): parses MP4/MOV boxes and
// WebM/MKV EBML structure for codec / resolution / duration / fps / audio
// info, with a WAV/RIFF header reader and an HTMLMediaElement fallback for
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
	'ec-3': 'Dolby E-AC-3',
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
									if (track.codec === 'mp4a' || track.codec === 'Opus' || track.codec === 'ac-3' || track.codec === 'ec-3') {
										track.channels = dv.getUint16(E + 24);
										track.sampleRate = Math.round(dv.getUint32(E + 32) / 65536);
									} else if (E + 36 <= ce6) {
										const w = dv.getUint16(E + 32);
										const h = dv.getUint16(E + 34);
										if (w && h) {
											track.width = w;
											track.height = h;
										}
									}
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
			value: `${codecName(video.codec)}${video.width ? ` · ${video.width}×${video.height}` : ''}`,
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
	const parsed = parseMp4(data) ?? parseWav(data) ?? parseEbml(data);
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
		error: 'Not a media file this tool recognizes (MP4/MOV, WebM/MKV, WAV).',
		errorZh: '不是本工具支持的媒体文件（MP4/MOV、WebM/MKV、WAV）。',
	};
}

/** A textarea report cannot carry .i18n span pairs, so every line shows both
 *  halves of its label ("File 文件") — bilingual without a rebuild. */
function renderLines(lines: MediaLine[]): string {
	return lines.map((l) => `${(l.label + ' ' + l.labelZh).padEnd(26)} ${l.value}`).join('\n');
}
