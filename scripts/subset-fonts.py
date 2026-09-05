#!/usr/bin/env python3
"""Rebuild the site's subsetted Atkinson woff2 files from the upstream OFL TTFs.

    python3 scripts/subset-fonts.py [--no-hinting]

Requires fontTools with Brotli (`pip install 'fonttools[woff]'`); it is a
build-time tool only — nothing here ships to the browser.

Atkinson carries no CJK glyph at all, so on this bilingual site it only ever
renders digits, Latin words and code identifiers while Chinese body text falls
back to PingFang / 雅黑. Shipping its full 342-codepoint charset spent most of
the byte budget on European diacritics nothing here uses, hence the subset.

The kept set is ASCII ∪ SYMBOLS ∪ (codepoints the site's own text uses ∩ what
the font covers). The third term is scanned rather than hard-coded, so adding a
character to a post or a tool string is picked up by re-running this script —
build first, since `dist/` is where rendered markdown ends up. SYMBOLS is the
hand-kept floor for glyphs that scanning cannot see: tool output assembled at
runtime, and punctuation a future post is likely to reach for. A codepoint
missing from the subset is not an error — the browser falls back to a system
font for that character, which stays readable, just visually inconsistent.

Upstream is the Google Fonts OFL 1.1 release (v1.006), NOT the 2020 v1.002 that
Astro's blog template shipped: that build's embedded licence reads "without
derivatives or alteration", which forbids subsetting. OFL 1.1 permits it and
declares no Reserved Font Name. Keep scripts/fonts-upstream/ and
src/assets/fonts/OFL.txt together — OFL §2 requires the licence to travel with
the font.
"""

import argparse
import glob
import html
import os
import sys

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

VARIANTS = [
    ('scripts/fonts-upstream/AtkinsonHyperlegible-Regular.ttf', 'src/assets/fonts/atkinson-regular.woff2'),
    ('scripts/fonts-upstream/AtkinsonHyperlegible-Bold.ttf', 'src/assets/fonts/atkinson-bold.woff2'),
]

# Every tool's runtime output (passwords, Base64, UUIDs, JSON, hex) is ASCII, so
# the printable range is kept whole and unconditionally.
ASCII = set(range(0x20, 0x7F))

# Floor for glyphs the scan cannot reach. Currency, maths and typographic marks
# a technical post plausibly needs; no letters — an accented letter that turns up
# later falls back cleanly, whereas a missing ± or × in a formula reads as a gap.
SYMBOLS = {
    0x00A0, 0x00A2, 0x00A3, 0x00A5, 0x00A7, 0x00A9, 0x00AE,  # nbsp ¢ £ ¥ § © ®
    0x00B0, 0x00B1, 0x00B2, 0x00B3, 0x00B5, 0x00B7, 0x00B9,  # ° ± ² ³ µ · ¹
    0x00BC, 0x00BD, 0x00BE, 0x00D7, 0x00F7,                  # ¼ ½ ¾ × ÷
    0x0394, 0x03A9, 0x03BC, 0x03C0,                          # Δ Ω μ π
    0x2013, 0x2014, 0x2018, 0x2019, 0x201A, 0x201C, 0x201D, 0x201E,
    0x2020, 0x2021, 0x2022, 0x2026, 0x2030, 0x2039, 0x203A, 0x2044,
    0x2074, 0x20AC, 0x2113, 0x2122,                          # ⁴ € ℓ ™
    0x2202, 0x220F, 0x2211, 0x2212, 0x2215, 0x2219, 0x221A,  # ∂ ∏ ∑ − ∕ ∙ √
    0x221E, 0x222B, 0x2248, 0x2260, 0x2264, 0x2265, 0x25CA,  # ∞ ∫ ≈ ≠ ≤ ≥ ◊
}

SCAN_GLOBS = [
    'dist/**/*.html',  # rendered markdown + every generated page
    'src/**/*.ts',
    'src/**/*.astro',
    'src/**/*.md',
    'src/**/*.mdx',
    '*.mjs',
]


def is_cjk(cp):
    """CJK never comes from this font, so it must not pull glyphs into the set."""
    return (
        0x2E80 <= cp <= 0x9FFF or 0xF900 <= cp <= 0xFAFF or 0xFF00 <= cp <= 0xFFEF
    )


def scan_site_text():
    """Codepoints appearing in the site's own text, HTML entities decoded."""
    used, files = set(), 0
    for pattern in SCAN_GLOBS:
        for path in glob.glob(os.path.join(ROOT, pattern), recursive=True):
            try:
                with open(path, encoding='utf-8') as fh:
                    # &copy; / &#39; are text to the reader but escapes on disk
                    used |= set(html.unescape(fh.read()))
                files += 1
            except (UnicodeDecodeError, OSError):
                print(f'  skipped {path}', file=sys.stderr)
    if not glob.glob(os.path.join(ROOT, 'dist/**/*.html'), recursive=True):
        print('  warning: no dist/ — run `npm run build` first, or post text is missed')
    return {ord(c) for c in used}, files


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument(
        '--no-hinting',
        action='store_true',
        help="drop ttfautohint's instructions: ~11.6 KB smaller, slightly softer "
        'on low-DPI Windows (ignored by macOS/iOS and by FreeType at its default '
        "'slight' setting either way)",
    )
    args = ap.parse_args()

    site, files = scan_site_text()
    print(f'scanned {files} files → {len(site)} distinct codepoints in site text')
    total_before = total_after = 0

    for src_rel, dst_rel in VARIANTS:
        src, dst = os.path.join(ROOT, src_rel), os.path.join(ROOT, dst_rel)
        with TTFont(src) as probe:
            covered = set(probe.getBestCmap())
        keep = (ASCII | SYMBOLS | {c for c in site if not is_cjk(c)}) & covered

        options = subset.Options()
        options.flavor = 'woff2'
        options.layout_features = ['*']  # kern/liga are NOT in pyftsubset's default set
        options.name_IDs = ['*']  # nameID 0/13/14 carry the copyright and OFL grant
        options.name_legacy = True
        options.hinting = not args.no_hinting
        font = subset.load_font(src, options)
        subsetter = subset.Subsetter(options=options)
        subsetter.populate(unicodes=keep)
        subsetter.subset(font)
        subset.save_font(font, dst, options)
        font.close()

        before, after = os.path.getsize(src), os.path.getsize(dst)
        total_before += before
        total_after += after
        print(
            f'{os.path.basename(dst):24} {len(keep):4} of {len(covered)} codepoints  '
            f'{before:6} B ttf → {after:6} B woff2'
        )

    hint = 'no-hinting' if args.no_hinting else 'hinted'
    print(f'total ({hint}): {total_before} B upstream → {total_after} B shipped')


if __name__ == '__main__':
    main()
