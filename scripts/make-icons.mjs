#!/usr/bin/env node
/**
 * Rasterise public/favicon.svg into the favicon set the browser <head> points at.
 *
 * Why this exists: `BaseHead.astro` declares both an SVG icon and a `.ico`
 * fallback. Chrome/Edge/Safari pick the SVG and render it crisply at any size,
 * but every other surface that takes a favicon — a Windows app shortcut, an
 * Explorer icon, a bookmark toolbar tile, a mobile launcher — asks for a raster
 * and reaches for the .ico. The .ico in the repo held exactly 16px and 32px
 * frames, so anything drawing the icon above that scaled one of those two up
 * and showed aliasing, and there was no `apple-touch-icon` at all, so iOS
 * Safari synthesised its own low-resolution thumbnail for the home screen.
 *
 * `favicon.svg` is the only hand-authored asset; every raster here is derived
 * from it at build time. Change the SVG and rerun `npm run icons`.
 *
 * sharp is already a production dependency (it rasterises the OG cards), so this
 * adds no new one.
 */

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'public', 'favicon.svg');
const svg = fs.readFileSync(SRC, 'utf8');

// Small frames get a flatter source: the `feGaussianBlur` glow and the two
// 0.12/0.18-opacity backdrop halos blur everything into one another at 16–32px
// and turn the solar core into a smudge, while at 48px and up they are what
// give the icon its depth. Measured, not guessed — the flat render is the one
// that reads as a Q at 16 and 24px, the glow render does not.
const SMALL = (size) => size <= 32;

const FLAT = svg
	.replace(/ filter="url\(#glow\)"/g, '')
	.replace(/<circle cx="58" cy="58" r="44"[^>]*\/>/, '')
	.replace(/<circle cx="58" cy="58" r="28"[^>]*\/>/, '');

if (FLAT === svg) {
	throw new Error(
		'public/favicon.svg no longer matches the markup this script flattens — ' +
			'update the replacements in scripts/make-icons.mjs',
	);
}

const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];
const APPLE_TOUCH = 180;

const render = (size) =>
	sharp(
		SMALL(size) ? Buffer.from(FLAT) : Buffer.from(svg),
		{ density: 96, skipCache: true },
	)
		.resize(size, size, { fit: 'cover' })
		.png();

// A 256px frame is a 4512px wide PNG; the ICO header encodes 256 as 0 (bWidth is
// a single byte), so keep both halves of that convention in sync.
const encodeSize = (size) => (size >= 256 ? 0 : size);

const encodeIco = (entries) => {
	const dir = Buffer.alloc(6 + entries.length * 16);
	dir.writeUInt16LE(0, 0); // reserved
	dir.writeUInt16LE(1, 2); // 1 = ICO
	dir.writeUInt16LE(entries.length, 4);

	let offset = dir.length;
	const frames = [];
	for (const [i, { size, png }] of entries.entries()) {
		const at = 6 + i * 16;
		dir.writeUInt8(encodeSize(size), at);
		dir.writeUInt8(encodeSize(size), at + 1);
		dir.writeUInt8(0, at + 2); // colour count: 0 for 32-bit
		dir.writeUInt8(0, at + 3); // reserved
		dir.writeUInt16LE(1, at + 4); // planes
		dir.writeUInt16LE(32, at + 6); // bpp
		dir.writeUInt32LE(png.length, at + 8);
		dir.writeUInt32LE(offset, at + 12);
		offset += png.length;
		frames.push(png);
	}

	return Buffer.concat([dir, ...frames]);
};

const frames = await Promise.all(
	ICO_SIZES.map(async (size) => ({
		size,
		png: await render(size).toBuffer(),
	})),
);

const ico = encodeIco(frames);
fs.writeFileSync(path.join(ROOT, 'public', 'favicon.ico'), ico);
fs.writeFileSync(
	path.join(ROOT, 'public', 'apple-touch-icon.png'),
	await render(APPLE_TOUCH).toBuffer(),
);

// Re-parse what we just wrote: a silently truncated ICO would ship a broken
// favicon with no error, which is exactly the class of silent failure this
// script exists to catch.
const written = fs.readFileSync(path.join(ROOT, 'public', 'favicon.ico'));
const count = written.readUInt16LE(4);
if (count !== ICO_SIZES.length) throw new Error(`ICO declares ${count} frames, expected ${ICO_SIZES.length}`);

for (const [i, { size }] of frames.entries()) {
	const at = 6 + i * 16;
	if (encodeSize(size) !== written.readUInt8(at)) throw new Error(`ICO frame ${i} has a wrong bWidth`);
	const len = written.readUInt32LE(at + 8);
	const off = written.readUInt32LE(at + 12);
	if (off + len > written.length) throw new Error(`ICO frame ${i} overruns the file`);
	if (written.subarray(off, off + 8).toString('hex') !== '89504e470d0a1a0a') {
		throw new Error(`ICO frame ${i} is not a PNG`);
	}
}

console.log(`favicon.ico  ${ICO_SIZES.length} frames (${ICO_SIZES.join('/')})  ${ico.length} bytes`);
console.log(`apple-touch-icon.png  ${APPLE_TOUCH}x${APPLE_TOUCH}`);
