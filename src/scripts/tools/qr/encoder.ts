// Hand-written QR code encoder — zero dependencies.
//
// Supports: byte mode, versions 1–10, ECC levels L/M/Q/H, all 8 data masks
// with ISO penalty scoring. Reed–Solomon EC over GF(256) (poly 0x11D).
//
// Layout: encode() → { size, modules } where modules is row-major, 1 = dark.

export type Ecc = 'L' | 'M' | 'Q' | 'H';

export interface QrCode {
	size: number;
	/** row-major, 1 = dark, 0 = light */
	modules: Uint8Array;
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
	],
};

/** Alignment pattern centers by version-1 index. */
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
];

const ECC_LEVEL_BITS: Record<Ecc, number> = { L: 1, M: 0, Q: 3, H: 2 };

function dataCodewords(version: number, ecc: Ecc): number {
	return EC_BLOCKS[ecc][version - 1]![1].reduce((sum, [count, dc]) => sum + count * dc, 0);
}

/** Byte-mode capacity: 4-bit mode + 8-bit (v1–9) or 16-bit (v10+) length header. */
function byteCapacity(version: number, ecc: Ecc): number {
	const bits = dataCodewords(version, ecc) * 8 - (version < 10 ? 12 : 20);
	return Math.floor(bits / 8);
}

// --- encoding --------------------------------------------------------------------------

/**
 * @param forcedMask 0–7 to force a specific data mask (testing); omit to
 *        let ISO penalty scoring choose.
 */
export function encodeQr(text: string, ecc: Ecc = 'M', forcedMask?: number): QrCode {
	const bytes = Array.from(new TextEncoder().encode(text));

	// pick the smallest version that fits
	let version = 0;
	for (let v = 1; v <= 10; v++) {
		if (bytes.length <= byteCapacity(v, ecc)) {
			version = v;
			break;
		}
	}
	if (!version) {
		throw new Error(
			`Text is ${bytes.length} bytes — the largest supported code (version 10, ECC ${ecc}) holds ${byteCapacity(10, ecc)}.`,
		);
	}

	// --- bit stream: mode | length | data | terminator | padding ---
	const bits: number[] = [];
	const appendBits = (val: number, len: number): void => {
		for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1);
	};
	appendBits(0b0100, 4); // byte mode
	appendBits(bytes.length, version < 10 ? 8 : 16);
	for (const b of bytes) appendBits(b, 8);

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
		let rem = data;
		for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
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
		let rem = version;
		for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
		const versionBits = (version << 12) | rem;
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

	return { size, modules };
}
