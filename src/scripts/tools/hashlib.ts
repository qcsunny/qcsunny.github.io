// Hash implementations the Web Crypto API refuses to ship: MD5, SHA-224 and
// the SHA-3 family (Keccak). SHA-1/256/384/512 go through crypto.subtle —
// native code beats any JS we could write, especially on large files.
//
// Everything here is byte-oriented (Uint8Array in, hex string out) so the same
// functions hash pasted text and dropped files. Verified against the NIST
// test vectors by tools/hashlib-test.mts conventions: empty string, 'abc'.

// --- MD5 (RFC 1321) ------------------------------------------------------------------

const MD5_S = [
	7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
	5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
	4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
	6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];
const MD5_K = new Uint32Array(64);
for (let i = 0; i < 64; i++) MD5_K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32);

function md5Hex(msg: Uint8Array): string {
	// message + 0x80 + zeros + 64-bit little-endian bit length
	const bitLen = msg.length * 8;
	const padded = new Uint8Array((((msg.length + 8) >> 6) + 1) << 6);
	padded.set(msg);
	padded[msg.length] = 0x80;
	const dv = new DataView(padded.buffer);
	dv.setUint32(padded.length - 8, bitLen >>> 0, true);
	dv.setUint32(padded.length - 4, Math.floor(bitLen / 2 ** 32), true);

	let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
	const M = new Uint32Array(16);
	for (let off = 0; off < padded.length; off += 64) {
		for (let i = 0; i < 16; i++) M[i] = dv.getUint32(off + i * 4, true);
		let A = a0, B = b0, C = c0, D = d0;
		for (let i = 0; i < 64; i++) {
			let F: number, g: number;
			if (i < 16) { F = (B & C) | (~B & D); g = i; }
			else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
			else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; }
			else { F = C ^ (B | ~D); g = (7 * i) % 16; }
			F = (F + A + MD5_K[i] + M[g]) >>> 0;
			A = D; D = C; C = B;
			B = (B + ((F << MD5_S[i]) | (F >>> (32 - MD5_S[i])))) >>> 0;
		}
		a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
	}
	const out = new Uint8Array(16);
	const odv = new DataView(out.buffer);
	odv.setUint32(0, a0, true); odv.setUint32(4, b0, true);
	odv.setUint32(8, c0, true); odv.setUint32(12, d0, true);
	return toHex(out);
}

// --- SHA-224 / SHA-256 core (FIPS 180-4) ----------------------------------------------
// crypto.subtle has SHA-256 but not SHA-224, and 224 is 256 with a different
// IV and a truncated digest — so this core serves SHA-224 directly (and could
// serve 256, but native wins there, so it doesn't).

const SHA256_K = new Uint32Array([
	0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
	0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
	0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
	0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
	0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
	0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
	0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
	0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function sha256Core(msg: Uint8Array, iv: Uint32Array, digestWords: number): string {
	const bitLen = msg.length * 8;
	const padded = new Uint8Array((((msg.length + 8) >> 6) + 1) << 6);
	padded.set(msg);
	padded[msg.length] = 0x80;
	const dv = new DataView(padded.buffer);
	dv.setUint32(padded.length - 8, Math.floor(bitLen / 2 ** 32));
	dv.setUint32(padded.length - 4, bitLen >>> 0);

	const H = Uint32Array.from(iv);
	const W = new Uint32Array(64);
	for (let off = 0; off < padded.length; off += 64) {
		for (let i = 0; i < 16; i++) W[i] = dv.getUint32(off + i * 4);
		for (let i = 16; i < 64; i++) {
			const s0 = rotr(W[i - 15]!, 7) ^ rotr(W[i - 15]!, 18) ^ (W[i - 15]! >>> 3);
			const s1 = rotr(W[i - 2]!, 17) ^ rotr(W[i - 2]!, 19) ^ (W[i - 2]! >>> 10);
			W[i] = (W[i - 16]! + s0 + W[i - 7]! + s1) >>> 0;
		}
		let [a, b, c, d, e, f, g, h] = H;
		for (let i = 0; i < 64; i++) {
			const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
			const ch = (e & f) ^ (~e & g);
			const t1 = (h + S1 + ch + SHA256_K[i]! + W[i]!) >>> 0;
			const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
			const maj = (a & b) ^ (a & c) ^ (b & c);
			const t2 = (S0 + maj) >>> 0;
			h = g; g = f; f = e;
			e = (d + t1) >>> 0;
			d = c; c = b; b = a;
			a = (t1 + t2) >>> 0;
		}
		H[0] = (H[0]! + a) >>> 0; H[1] = (H[1]! + b) >>> 0; H[2] = (H[2]! + c) >>> 0; H[3] = (H[3]! + d) >>> 0;
		H[4] = (H[4]! + e) >>> 0; H[5] = (H[5]! + f) >>> 0; H[6] = (H[6]! + g) >>> 0; H[7] = (H[7]! + h) >>> 0;
	}
	const out = new Uint8Array(digestWords * 4);
	const odv = new DataView(out.buffer);
	for (let i = 0; i < digestWords; i++) odv.setUint32(i * 4, H[i]!);
	return toHex(out);
}

const SHA224_IV = Uint32Array.from([
	0xc1059ed8, 0x367cd507, 0x3070dd17, 0xf70e5939, 0xffc00b31, 0x68581511, 0x64f98fa7, 0xbefa4fa4,
]);

function rotr(x: number, n: number): number {
	return ((x >>> n) | (x << (32 - n))) >>> 0;
}

// --- SHA-3 / Keccak-f[1600] (FIPS 202) ------------------------------------------------

const KECCAK_RC = BigUint64Array.from([
	0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n,
	0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
	0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
	0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
	0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
	0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n,
]);
const KECCAK_ROT = [
	0, 1, 62, 28, 27,
	36, 44, 6, 55, 20,
	3, 10, 43, 25, 39,
	41, 45, 15, 21, 8,
	18, 2, 61, 56, 14,
];

function keccakF1600(A: BigUint64Array): void {
	for (let round = 0; round < 24; round++) {
		// θ
		const C = new BigUint64Array(5);
		for (let x = 0; x < 5; x++) C[x] = A[x] ^ A[x + 5] ^ A[x + 10] ^ A[x + 15] ^ A[x + 20];
		const D = new BigUint64Array(5);
		for (let x = 0; x < 5; x++) D[x] = C[(x + 4) % 5] ^ rotl64(C[(x + 1) % 5], 1);
		for (let x = 0; x < 5; x++)
			for (let y = 0; y < 5; y++) A[x + 5 * y] ^= D[x];
		// ρ + π
		const B = new BigUint64Array(25);
		for (let x = 0; x < 5; x++)
			for (let y = 0; y < 5; y++)
				B[y + 5 * ((2 * x + 3 * y) % 5)] = rotl64(A[x + 5 * y]!, KECCAK_ROT[x + 5 * y]!);
		// χ
		for (let y = 0; y < 5; y++)
			for (let x = 0; x < 5; x++)
				A[x + 5 * y] = B[x + 5 * y]! ^ (~B[(x + 1) % 5 + 5 * y]! & B[(x + 2) % 5 + 5 * y]!);
		// ι
		A[0] ^= KECCAK_RC[round]!;
	}
}

function rotl64(x: bigint, n: number): bigint {
	return ((x << BigInt(n)) | (x >> BigInt(64 - n))) & 0xffffffffffffffffn;
}

/** SHA-3 sponge: rate = 1600 - 2×digestBits, domain padding 0x06 … 0x80. */
function sha3Hex(msg: Uint8Array, digestBits: number): string {
	const rateBytes = (1600 - 2 * digestBits) / 8; // 136 for 256, 72 for 512
	const padded = new Uint8Array(Math.ceil((msg.length + 1) / rateBytes) * rateBytes);
	padded.set(msg);
	padded[msg.length] ^= 0x06;
	padded[padded.length - 1] ^= 0x80;

	const A = new BigUint64Array(25);
	const block = new BigUint64Array(rateBytes / 8);
	for (let off = 0; off < padded.length; off += rateBytes) {
		for (let i = 0; i < block.length; i++) {
			let v = 0n;
			for (let b = 7; b >= 0; b--) v = (v << 8n) | BigInt(padded[off + i * 8 + b]!);
			block[i] = v;
		}
		for (let i = 0; i < block.length; i++) A[i] ^= block[i];
		keccakF1600(A);
	}
	const out = new Uint8Array(digestBits / 8);
	for (let i = 0; i < out.length; i++) {
		const word = A[i >> 3]! >> BigInt((i & 7) * 8);
		out[i] = Number(word & 0xffn);
	}
	return toHex(out);
}

// --- shared helpers / public API ------------------------------------------------------

function toHex(bytes: Uint8Array): string {
	let s = '';
	for (const b of bytes) s += b.toString(16).padStart(2, '0');
	return s;
}

export type HashAlgo =
	| 'MD5'
	| 'SHA-1'
	| 'SHA-224'
	| 'SHA-256'
	| 'SHA-384'
	| 'SHA-512'
	| 'SHA3-256'
	| 'SHA3-512';

/** The shipped-out list, in display order. */
export const HASH_ALGOS: HashAlgo[] = ['MD5', 'SHA-1', 'SHA-224', 'SHA-256', 'SHA-384', 'SHA-512', 'SHA3-256', 'SHA3-512'];

/** Hex digest of bytes under any algorithm. SHA-1/256/384/512 ride Web
 *  Crypto; MD5 / SHA-224 / SHA-3 are the hand-rolled ones above. */
export async function hashBytes(algo: HashAlgo, data: Uint8Array): Promise<string> {
	switch (algo) {
		case 'MD5':
			return md5Hex(data);
		case 'SHA-224':
			return sha256Core(data, SHA224_IV, 7);
		case 'SHA3-256':
			return sha3Hex(data, 256);
		case 'SHA3-512':
			return sha3Hex(data, 512);
		default: {
			const buf = await crypto.subtle.digest(algo, data as unknown as ArrayBuffer);
			return toHex(new Uint8Array(buf));
		}
	}
}

/** HMAC over the SHA-2 family (plus SHA-1), via Web Crypto's native HMAC.
 *  SHA-3-based HMAC is rare enough that it is deliberately not offered. */
export async function hmacBytes(algo: 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512', secret: string, data: Uint8Array): Promise<string> {
	const enc = new TextEncoder();
	const key = await crypto.subtle.importKey('raw', enc.encode(secret) as unknown as ArrayBuffer, { name: 'HMAC', hash: { name: algo } }, false, ['sign']);
	const sig = await crypto.subtle.sign('HMAC', key, data as unknown as ArrayBuffer);
	return toHex(new Uint8Array(sig));
}
