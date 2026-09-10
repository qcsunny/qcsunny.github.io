// Hand-written QR code encoder — zero dependencies.
//
// Supports: numeric / alphanumeric / byte modes (auto-picked, no mixed-mode
// segmentation), versions 1–40, ECC levels L/M/Q/H, all 8 data masks with ISO
// penalty scoring. Reed–Solomon EC over GF(256) (poly 0x11D).
//
// Layout: encodeQr() → QrCode { size, modules, mode } where modules is
// row-major, 1 = dark.

export type Ecc = 'L' | 'M' | 'Q' | 'H';
export type QrMode = 'numeric' | 'alnum' | 'byte';

export interface QrCode {
	size: number;
	/** row-major, 1 = dark, 0 = light */
	modules: Uint8Array;
	/** the encoding mode auto-picked for the input (for the page's readout) */
	mode: QrMode;
}

export function getModule(qr: QrCode, row: number, col: number): boolean {
	return qr.modules[row * qr.size + col] === 1;
}

// --- GF(256) arithmetic ------------------------------------------------------------

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(() => {
	let x = 1;
	for (let i = 0; i < 255; i++) {
		EXP[i] = x;
		LOG[x] = i;
		x <<= 1;
		if (x & 0x100) x ^= 0x11d;
	}
	for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]!;
})();

function gfMul(a: number, b: number): number {
	if (a === 0 || b === 0) return 0;
	return EXP[LOG[a]! + LOG[b]!]!;
}

/** Remainder of data·x^degree mod generator, generator built incrementally. */
function rsRemainder(data: number[], degree: number): number[] {
	// generator polynomial, highest power first: gen[0] = 1
	let gen: number[] = [1];
	for (let i = 0; i < degree; i++) {
		const next: number[] = new Array(gen.length + 1).fill(0);
		for (let j = 0; j < gen.length; j++) {
			next[j]! ^= gen[j]!; // × x
			next[j + 1]! ^= gfMul(gen[j]!, EXP[i]!); // × α^i
		}
		gen = next;
	}
	const rem: number[] = new Array(degree).fill(0);
	for (const b of data) {
		const factor = b ^ rem.shift()!;
		rem.push(0);
		if (factor !== 0) {
			for (let i = 0; i < degree; i++) rem[i]! ^= gfMul(gen[i + 1]!, factor);
		}
	}
	return rem;
}

// --- version tables (1–10) -----------------------------------------------------------

// The full ISO/IEC 18004 error-correction block table, versions 1–40,
// extracted from the widely-used qrcode-generator reference and
// cross-checked entry-by-entry against the previous hand-written v1–10
// table (40/40 identical).
/** [ecCodewordsPerBlock, [blockCount, dataCodewordsPerBlock][]] indexed by version-1. */
const EC_BLOCKS: Record<Ecc, [number, [number, number][]][]> = {
	L: [
			[7, [[1, 19]]],
			[10, [[1, 34]]],
			[15, [[1, 55]]],
			[20, [[1, 80]]],
			[26, [[1, 108]]],
			[18, [[2, 68]]],
			[20, [[2, 78]]],
			[24, [[2, 97]]],
			[30, [[2, 116]]],
			[18, [[2, 68], [2, 69]]],
			[20, [[4, 81]]],
			[24, [[2, 92], [2, 93]]],
			[26, [[4, 107]]],
			[30, [[3, 115], [1, 116]]],
			[22, [[5, 87], [1, 88]]],
			[24, [[5, 98], [1, 99]]],
			[28, [[1, 107], [5, 108]]],
			[30, [[5, 120], [1, 121]]],
			[28, [[3, 113], [4, 114]]],
			[28, [[3, 107], [5, 108]]],
			[28, [[4, 116], [4, 117]]],
			[28, [[2, 111], [7, 112]]],
			[30, [[4, 121], [5, 122]]],
			[30, [[6, 117], [4, 118]]],
			[26, [[8, 106], [4, 107]]],
			[28, [[10, 114], [2, 115]]],
			[30, [[8, 122], [4, 123]]],
			[30, [[3, 117], [10, 118]]],
			[30, [[7, 116], [7, 117]]],
			[30, [[5, 115], [10, 116]]],
			[30, [[13, 115], [3, 116]]],
			[30, [[17, 115]]],
			[30, [[17, 115], [1, 116]]],
			[30, [[13, 115], [6, 116]]],
			[30, [[12, 121], [7, 122]]],
			[30, [[6, 121], [14, 122]]],
			[30, [[17, 122], [4, 123]]],
			[30, [[4, 122], [18, 123]]],
			[30, [[20, 117], [4, 118]]],
			[30, [[19, 118], [6, 119]]],
	],
	M: [
			[10, [[1, 16]]],
			[16, [[1, 28]]],
			[26, [[1, 44]]],
			[18, [[2, 32]]],
			[24, [[2, 43]]],
			[16, [[4, 27]]],
			[18, [[4, 31]]],
			[22, [[2, 38], [2, 39]]],
			[22, [[3, 36], [2, 37]]],
			[26, [[4, 43], [1, 44]]],
			[30, [[1, 50], [4, 51]]],
			[22, [[6, 36], [2, 37]]],
			[22, [[8, 37], [1, 38]]],
			[24, [[4, 40], [5, 41]]],
			[24, [[5, 41], [5, 42]]],
			[28, [[7, 45], [3, 46]]],
			[28, [[10, 46], [1, 47]]],
			[26, [[9, 43], [4, 44]]],
			[26, [[3, 44], [11, 45]]],
			[26, [[3, 41], [13, 42]]],
			[26, [[17, 42]]],
			[28, [[17, 46]]],
			[28, [[4, 47], [14, 48]]],
			[28, [[6, 45], [14, 46]]],
			[28, [[8, 47], [13, 48]]],
			[28, [[19, 46], [4, 47]]],
			[28, [[22, 45], [3, 46]]],
			[28, [[3, 45], [23, 46]]],
			[28, [[21, 45], [7, 46]]],
			[28, [[19, 47], [10, 48]]],
			[28, [[2, 46], [29, 47]]],
			[28, [[10, 46], [23, 47]]],
			[28, [[14, 46], [21, 47]]],
			[28, [[14, 46], [23, 47]]],
			[28, [[12, 47], [26, 48]]],
			[28, [[6, 47], [34, 48]]],
			[28, [[29, 46], [14, 47]]],
			[28, [[13, 46], [32, 47]]],
			[28, [[40, 47], [7, 48]]],
			[28, [[18, 47], [31, 48]]],
	],
	Q: [
			[13, [[1, 13]]],
			[22, [[1, 22]]],
			[18, [[2, 17]]],
			[26, [[2, 24]]],
			[18, [[2, 15], [2, 16]]],
			[24, [[4, 19]]],
			[18, [[2, 14], [4, 15]]],
			[22, [[4, 18], [2, 19]]],
			[20, [[4, 16], [4, 17]]],
			[24, [[6, 19], [2, 20]]],
			[28, [[4, 22], [4, 23]]],
			[26, [[4, 20], [6, 21]]],
			[24, [[8, 20], [4, 21]]],
			[20, [[11, 16], [5, 17]]],
			[30, [[5, 24], [7, 25]]],
			[24, [[15, 19], [2, 20]]],
			[28, [[1, 22], [15, 23]]],
			[28, [[17, 22], [1, 23]]],
			[26, [[17, 21], [4, 22]]],
			[30, [[15, 24], [5, 25]]],
			[28, [[17, 22], [6, 23]]],
			[30, [[7, 24], [16, 25]]],
			[30, [[11, 24], [14, 25]]],
			[30, [[11, 24], [16, 25]]],
			[30, [[7, 24], [22, 25]]],
			[28, [[28, 22], [6, 23]]],
			[30, [[8, 23], [26, 24]]],
			[30, [[4, 24], [31, 25]]],
			[30, [[1, 23], [37, 24]]],
			[30, [[15, 24], [25, 25]]],
			[30, [[42, 24], [1, 25]]],
			[30, [[10, 24], [35, 25]]],
			[30, [[29, 24], [19, 25]]],
			[30, [[44, 24], [7, 25]]],
			[30, [[39, 24], [14, 25]]],
			[30, [[46, 24], [10, 25]]],
			[30, [[49, 24], [10, 25]]],
			[30, [[48, 24], [14, 25]]],
			[30, [[43, 24], [22, 25]]],
			[30, [[34, 24], [34, 25]]],
	],
	H: [
			[17, [[1, 9]]],
			[28, [[1, 16]]],
			[22, [[2, 13]]],
			[16, [[4, 9]]],
			[22, [[2, 11], [2, 12]]],
			[28, [[4, 15]]],
			[26, [[4, 13], [1, 14]]],
			[26, [[4, 14], [2, 15]]],
			[24, [[4, 12], [4, 13]]],
			[28, [[6, 15], [2, 16]]],
			[24, [[3, 12], [8, 13]]],
			[28, [[7, 14], [4, 15]]],
			[22, [[12, 11], [4, 12]]],
			[24, [[11, 12], [5, 13]]],
			[24, [[11, 12], [7, 13]]],
			[30, [[3, 15], [13, 16]]],
			[28, [[2, 14], [17, 15]]],
			[28, [[2, 14], [19, 15]]],
			[26, [[9, 13], [16, 14]]],
			[28, [[15, 15], [10, 16]]],
			[30, [[19, 16], [6, 17]]],
			[24, [[34, 13]]],
			[30, [[16, 15], [14, 16]]],
			[30, [[30, 16], [2, 17]]],
			[30, [[22, 15], [13, 16]]],
			[30, [[33, 16], [4, 17]]],
			[30, [[12, 15], [28, 16]]],
			[30, [[11, 15], [31, 16]]],
			[30, [[19, 15], [26, 16]]],
			[30, [[23, 15], [25, 16]]],
			[30, [[23, 15], [28, 16]]],
			[30, [[19, 15], [35, 16]]],
			[30, [[11, 15], [46, 16]]],
			[30, [[59, 16], [1, 17]]],
			[30, [[22, 15], [41, 16]]],
			[30, [[2, 15], [64, 16]]],
			[30, [[24, 15], [46, 16]]],
			[30, [[42, 15], [32, 16]]],
			[30, [[10, 15], [67, 16]]],
			[30, [[20, 15], [61, 16]]],
	],
};

/** Alignment pattern centers by version-1 index (v1 has none). */
const ALIGNMENT: number[][] = [
	[],
	[6, 18],
	[6, 22],
	[6, 26],
	[6, 30],
	[6, 34],
	[6, 22, 38],
	[6, 24, 42],
	[6, 26, 46],
	[6, 28, 50],
	[6, 30, 54],
	[6, 32, 58],
	[6, 34, 62],
	[6, 26, 46, 66],
	[6, 26, 48, 70],
	[6, 26, 50, 74],
	[6, 30, 54, 78],
	[6, 30, 56, 82],
	[6, 30, 58, 86],
	[6, 34, 62, 90],
	[6, 28, 50, 72, 94],
	[6, 26, 50, 74, 98],
	[6, 30, 54, 78, 102],
	[6, 28, 54, 80, 106],
	[6, 32, 58, 84, 110],
	[6, 30, 58, 86, 114],
	[6, 34, 62, 90, 118],
	[6, 26, 50, 74, 98, 122],
	[6, 30, 54, 78, 102, 126],
	[6, 26, 52, 78, 104, 130],
	[6, 30, 56, 82, 108, 134],
	[6, 34, 60, 86, 112, 138],
	[6, 30, 58, 86, 114, 142],
	[6, 34, 62, 90, 118, 146],
	[6, 30, 54, 78, 102, 126, 150],
	[6, 24, 50, 76, 102, 128, 154],
	[6, 28, 54, 80, 106, 132, 158],
	[6, 32, 58, 84, 110, 136, 162],
	[6, 26, 54, 82, 110, 138, 166],
	[6, 30, 58, 86, 114, 142, 170],
];

const ECC_LEVEL_BITS: Record<Ecc, number> = { L: 1, M: 0, Q: 3, H: 2 };

function dataCodewords(version: number, ecc: Ecc): number {
	return EC_BLOCKS[ecc][version - 1]![1].reduce((sum, [count, dc]) => sum + count * dc, 0);
}

// --- modes ---------------------------------------------------------------------------
// The whole input is encoded in one mode, auto-picked as the cheapest that
// covers it. No mixed-mode segmentation: a URL that is mostly alphanumeric
// with a "://" pair still shrinks less by switching than the 4-bit header +
// widened length field per extra segment costs, and every mainstream scanner
// handles all three modes.

const ALNUM_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';
const ALNUM_VALUE: Record<string, number> = {};
for (let i = 0; i < ALNUM_CHARS.length; i++) ALNUM_VALUE[ALNUM_CHARS[i]!] = i;

const MODE_BITS: Record<QrMode, number> = { numeric: 0b0001, alnum: 0b0010, byte: 0b0100 };

function detectMode(text: string): QrMode {
	if (/^[0-9]+$/.test(text)) return 'numeric';
	for (const ch of text) if (!(ch in ALNUM_VALUE)) return 'byte';
	return 'alnum';
}

/** Character-count indicator width; the spec widens it twice, at v10 and v27. */
function charCountBits(mode: QrMode, version: number): number {
	const range = version < 10 ? 0 : version < 27 ? 1 : 2;
	return (
		{
			numeric: [10, 12, 14],
			alnum: [9, 11, 13],
			byte: [8, 16, 16],
		} as Record<QrMode, [number, number, number]>
	)[mode]![range]!;
}

/** Max characters of this mode that fit the version's data area. */
function charCapacity(mode: QrMode, version: number, ecc: Ecc): number {
	const D = dataCodewords(version, ecc) * 8 - 4 - charCountBits(mode, version);
	if (mode === 'numeric') {
		const groups = Math.floor(D / 10);
		const r = D - groups * 10;
		return groups * 3 + (r >= 7 ? 2 : r >= 4 ? 1 : 0);
	}
	if (mode === 'alnum') {
		const groups = Math.floor(D / 11);
		const r = D - groups * 11;
		return groups * 2 + (r >= 6 ? 1 : 0);
	}
	return Math.floor(D / 8);
}

// --- encoding --------------------------------------------------------------------------

/**
 * @param forcedMask 0–7 to force a specific data mask (testing); omit to
 *        let ISO penalty scoring choose.
 */
/** The text does not fit even version 40 (the largest QR code) at this ECC. */
export class QrCapacityError extends Error {
	constructor(
		readonly units: number,
		readonly capacity: number,
		readonly ecc: Ecc,
		readonly mode: QrMode,
	) {
		super(`${units} ${mode === 'byte' ? 'bytes' : 'characters'} exceed the ${capacity}-${mode === 'byte' ? 'byte' : 'character'} capacity of version 40 at ECC ${ecc}`);
		this.name = 'QrCapacityError';
	}
}

export function encodeQr(text: string, ecc: Ecc = 'M', forcedMask?: number): QrCode {
	// One mode covers the whole input; the unit of capacity is characters for
	// numeric/alnum and bytes for byte mode.
	const mode = detectMode(text);
	const units = mode === 'byte' ? new TextEncoder().encode(text).length : text.length;

	// pick the smallest version that fits
	let version = 0;
	for (let v = 1; v <= 40; v++) {
		if (units <= charCapacity(mode, v, ecc)) {
			version = v;
			break;
		}
	}
	if (!version) {
		throw new QrCapacityError(units, charCapacity(mode, 40, ecc), ecc, mode);
	}

	// --- bit stream: mode | length | data | terminator | padding ---
	const bits: number[] = [];
	const appendBits = (val: number, len: number): void => {
		for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1);
	};
	appendBits(MODE_BITS[mode], 4);
	appendBits(units, charCountBits(mode, version));
	if (mode === 'numeric') {
		// 3 digits → 10 bits (value 0–999), 2 → 7 bits, 1 → 4 bits
		for (let i = 0; i < text.length; i += 3) {
			const chunk = text.slice(i, i + 3);
			appendBits(Number(chunk), chunk.length === 3 ? 10 : chunk.length === 2 ? 7 : 4);
		}
	} else if (mode === 'alnum') {
		// 2 chars → 11 bits (first×45 + second), 1 → 6 bits
		for (let i = 0; i < text.length; i += 2) {
			if (i + 1 < text.length) {
				appendBits(ALNUM_VALUE[text[i]!]! * 45 + ALNUM_VALUE[text[i + 1]!]!, 11);
			} else {
				appendBits(ALNUM_VALUE[text[i]!]!, 6);
			}
		}
	} else {
		for (const b of new TextEncoder().encode(text)) appendBits(b, 8);
	}

	const capacityBits = dataCodewords(version, ecc) * 8;
	appendBits(0, Math.min(4, capacityBits - bits.length));
	while (bits.length % 8 !== 0) bits.push(0);
	const padBytes = [0xec, 0x11];
	let padIdx = 0;
	while (bits.length < capacityBits) {
		appendBits(padBytes[padIdx % 2]!, 8);
		padIdx++;
	}
	const codewords: number[] = [];
	for (let i = 0; i < bits.length; i += 8) {
		let b = 0;
		for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j]!;
		codewords.push(b);
	}

	// --- Reed–Solomon: split into blocks, compute EC, interleave ---
	const [ecPerBlock, blockSpec] = EC_BLOCKS[ecc][version - 1]!;
	const dataBlocks: number[][] = [];
	let offset = 0;
	for (const [count, dc] of blockSpec) {
		for (let i = 0; i < count; i++) {
			dataBlocks.push(codewords.slice(offset, offset + dc));
			offset += dc;
		}
	}
	const ecBlocks = dataBlocks.map((block) => rsRemainder(block, ecPerBlock));

	const interleaved: number[] = [];
	const maxDataLen = Math.max(...dataBlocks.map((b) => b.length));
	for (let i = 0; i < maxDataLen; i++) {
		for (const block of dataBlocks) if (i < block.length) interleaved.push(block[i]!);
	}
	for (let i = 0; i < ecPerBlock; i++) {
		for (const block of ecBlocks) interleaved.push(block[i]!);
	}

	// --- matrix with function patterns ---
	const size = version * 4 + 17;
	const modules = new Uint8Array(size * size);
	const isFunction = new Uint8Array(size * size);

	const setFn = (row: number, col: number, dark: boolean): void => {
		modules[row * size + col] = dark ? 1 : 0;
		isFunction[row * size + col] = 1;
	};

	const drawFinder = (row: number, col: number): void => {
		for (let dr = -1; dr <= 7; dr++) {
			for (let dc = -1; dc <= 7; dc++) {
				const r = row + dr;
				const c = col + dc;
				if (r < 0 || r >= size || c < 0 || c >= size) continue;
				const dist = Math.max(Math.abs(dr - 3), Math.abs(dc - 3));
				setFn(r, c, dist !== 2 && dist !== 4);
			}
		}
	};
	drawFinder(0, 0);
	drawFinder(0, size - 7);
	drawFinder(size - 7, 0);

	for (const r of ALIGNMENT[version - 1]!) {
		for (const c of ALIGNMENT[version - 1]!) {
			// skip the three that would overlap finder patterns
			if ((r === 6 && c === 6) || (r === 6 && c === size - 7) || (r === size - 7 && c === 6)) continue;
			for (let dr = -2; dr <= 2; dr++) {
				for (let dc = -2; dc <= 2; dc++) {
					setFn(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
				}
			}
		}
	}

	// timing patterns (values agree with alignment centers at even indices)
	for (let i = 8; i < size - 8; i++) {
		setFn(6, i, i % 2 === 0);
		setFn(i, 6, i % 2 === 0);
	}

	// format info (dummy pass: reserves the areas), real bits drawn after masking
	const drawFormat = (mask: number): void => {
		const data = (ECC_LEVEL_BITS[ecc] << 3) | mask;
		let rem = data << 10;
		for (let i = 4; i >= 0; i--) {
			if ((rem >>> (i + 10)) & 1) {
				rem ^= 0x537 << i;
			}
		}
		const formatBits = ((data << 10) | rem) ^ 0x5412;
		const bit = (i: number): boolean => ((formatBits >>> i) & 1) === 1;
		for (let i = 0; i <= 5; i++) setFn(i, 8, bit(i));
		setFn(7, 8, bit(6));
		setFn(8, 8, bit(7));
		setFn(8, 7, bit(8));
		for (let i = 9; i < 15; i++) setFn(8, 14 - i, bit(i));
		for (let i = 0; i < 8; i++) setFn(8, size - 1 - i, bit(i));
		for (let i = 8; i < 15; i++) setFn(size - 15 + i, 8, bit(i));
		// dark module — always set
		setFn(size - 8, 8, true);
	};
	drawFormat(0);

	if (version >= 7) {
		let remVer = version << 12;
		for (let i = 5; i >= 0; i--) {
			if ((remVer >>> (i + 12)) & 1) {
				remVer ^= 0x1f25 << i;
			}
		}
		const versionBits = (version << 12) | remVer;
		for (let i = 0; i < 18; i++) {
			const bit = ((versionBits >>> i) & 1) === 1;
			const a = size - 11 + (i % 3);
			const b = Math.floor(i / 3);
			setFn(b, a, bit);
			setFn(a, b, bit);
		}
	}

	// --- data placement: zigzag from bottom-right, two columns at a time ---
	let bitIdx = 0;
	const totalBits = interleaved.length * 8;
	for (let right = size - 1; right >= 1; right -= 2) {
		if (right === 6) right = 5;
		for (let vert = 0; vert < size; vert++) {
			for (let j = 0; j < 2; j++) {
				const col = right - j;
				const upward = ((right + 1) & 2) === 0;
				const row = upward ? size - 1 - vert : vert;
				const idx = row * size + col;
				if (!isFunction[idx] && bitIdx < totalBits) {
					const bit = (interleaved[bitIdx >>> 3]! >>> (7 - (bitIdx & 7))) & 1;
					modules[idx] = bit;
					bitIdx++;
				}
			}
		}
	}

	// --- mask selection: 8 candidates, ISO penalty scoring ---
	const maskBit = (mask: number, row: number, col: number): boolean => {
		switch (mask) {
			case 0:
				return (row + col) % 2 === 0;
			case 1:
				return row % 2 === 0;
			case 2:
				return col % 3 === 0;
			case 3:
				return (row + col) % 3 === 0;
			case 4:
				return (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0;
			case 5:
				return ((row * col) % 2) + ((row * col) % 3) === 0;
			case 6:
				return (((row * col) % 2) + ((row * col) % 3)) % 2 === 0;
			default:
				return (((row + col) % 2) + ((row * col) % 3)) % 2 === 0;
		}
	};

	const penalty = (mask: number): number => {
		const dark = (row: number, col: number): boolean => {
			const v = modules[row * size + col] === 1;
			return isFunction[row * size + col] ? v : v !== maskBit(mask, row, col);
		};
		let score = 0;

		// rule 1: runs of 5+ same color, rows and columns
		for (let axis = 0; axis < 2; axis++) {
			for (let i = 0; i < size; i++) {
				let runColor = false;
				let runLen = 0;
				for (let j = 0; j < size; j++) {
					const v = axis === 0 ? dark(i, j) : dark(j, i);
					if (v === runColor) {
						runLen++;
						if (runLen === 5) score += 3;
						else if (runLen > 5) score++;
					} else {
						runColor = v;
						runLen = 1;
					}
				}
			}
		}

		// rule 2: 2×2 blocks of one color
		for (let r = 0; r < size - 1; r++) {
			for (let c = 0; c < size - 1; c++) {
				const v = dark(r, c);
				if (v === dark(r, c + 1) && v === dark(r + 1, c) && v === dark(r + 1, c + 1)) score += 3;
			}
		}

		// rule 3: finder-like patterns 1011101 with 0000 on either side
		const FINDER = ['10111010000', '00001011101'];
		for (let axis = 0; axis < 2; axis++) {
			for (let i = 0; i < size; i++) {
				let line = '';
				for (let j = 0; j < size; j++) line += (axis === 0 ? dark(i, j) : dark(j, i)) ? '1' : '0';
				for (const pattern of FINDER) {
					let from = 0;
					for (;;) {
						const at = line.indexOf(pattern, from);
						if (at === -1) break;
						score += 40;
						from = at + 1;
					}
				}
			}
		}

		// rule 4: dark/light balance
		let darkCount = 0;
		for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (dark(r, c)) darkCount++;
		const percent = (darkCount * 100) / (size * size);
		score += Math.floor(Math.abs(percent - 50) / 5) * 10;

		return score;
	};

	let bestMask = forcedMask ?? 0;
	if (forcedMask === undefined) {
		let bestScore = Number.POSITIVE_INFINITY;
		for (let m = 0; m < 8; m++) {
			const s = penalty(m);
			if (s < bestScore) {
				bestScore = s;
				bestMask = m;
			}
		}
	}

	// apply the winning mask to data modules only
	for (let r = 0; r < size; r++) {
		for (let c = 0; c < size; c++) {
			const idx = r * size + c;
			if (!isFunction[idx] && maskBit(bestMask, r, c)) modules[idx] ^= 1;
		}
	}

	// real format bits with the chosen mask
	drawFormat(bestMask);

	return { size, modules, mode };
}
