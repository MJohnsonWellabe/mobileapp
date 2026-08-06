#!/usr/bin/env python3
"""Derive the app's brand assets from the human-supplied files in /brand-assets/.

Run once (or again if /brand-assets/ changes):

    pip install pillow numpy potracer
    python3 scripts/extract-brand-assets.py

Outputs, all committed:
    assets/img/wellabe-mark.svg          the yellow double-l mark, traced to vector
    assets/img/illustrations/*.svg       the curated line-drawing set, traced to vector

Everything ships as SVG rather than PNG. The source art is pure black line work on
transparency, which traces cleanly and comes out both smaller and resolution-
independent: the largest illustration is 77 KB as a 720px PNG and 48 KB as a vector
that stays sharp at any size. Tracing also means every illustration inherits
`currentColor`, so the same file works black on white and yellow on dark chrome
without shipping a second copy.

Why this exists rather than a one-off manual export: /brand-assets/ holds two
PowerPoint decks whose embedded media are the real Wellabe assets. Nobody should
have to guess later which slide a given illustration came from, or redo the trace
by hand. See DECISIONS-LOG.md -> Brand alignment.

The .emf files in both decks are Windows metafiles and are deliberately skipped —
they are not usable on the web and LibreOffice in this environment cannot convert
them. Only the embedded PNGs are used.
"""

import os
import shutil
import sys
import zipfile

import numpy as np
from PIL import Image

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(REPO, "brand-assets")
OUT_IMG = os.path.join(REPO, "assets", "img")
OUT_ILLO = os.path.join(OUT_IMG, "illustrations")
WORK = os.path.join(REPO, "scripts", "tmp", "brand-extract")

# deck key -> source .pptx
DECKS = {"A": "Line Drawings.pptx", "B": "linedrawings2.pptx"}

# Curated subset. "<deck><media index>": (output name, what it is used for).
# Everything not listed here is left behind on purpose — a smaller, deliberate
# set keeps the app coherent, and every illustration that ships has a job.
SELECTED = {
    "A11": ("walking-dog", "MyHealth hero, streak in progress"),
    "A12": ("walking-couple-wide", "thin divider / section footer"),
    "A13": ("open-book", "MyRewards earn-more-points activities"),
    "A14": ("walking-man", "MyHealth daily challenges"),
    "A16": ("video-call", "Talk to an Agent"),
    "A17": ("embrace", "MyCare support, claim resolved"),
    "A18": ("calculator", "MyPayments empty state, cost estimate"),
    "A19": ("family-couch", "home dashboard welcome"),
    "A21": ("table-tablet", "MyInformation"),
    "A9": ("desk-laptop", "admin console"),
    "B2": ("two-people-talking", "agent contact card"),
    "B3": ("phone-and-coffee", "login screen"),
    "B5": ("thinking-at-computer", "no-results / generic empty state"),
    "B13": ("swing", "Preneed, family coverage"),
    "B14": ("holding-hands", "MyCare provider detail"),
}

MARK_MEDIA = "A7"  # the yellow double-l ligature


def unpack():
    os.makedirs(WORK, exist_ok=True)
    media = {}
    for key, filename in DECKS.items():
        path = os.path.join(SRC, filename)
        if not os.path.exists(path):
            sys.exit(f"missing brand asset: {path}")
        dest = os.path.join(WORK, key)
        with zipfile.ZipFile(path) as z:
            z.extractall(dest)
        folder = os.path.join(dest, "ppt", "media")
        for name in os.listdir(folder):
            if name.lower().endswith(".png"):
                index = name[len("image"):-len(".png")]
                media[f"{key}{index}"] = os.path.join(folder, name)
    return media


def ink_mask(path):
    """Return (mask, width, height) where mask is True on inked pixels.

    Three source shapes have to work through one code path:
      - black line art on transparency (most illustrations)
      - black line art on an opaque white background (the wide walking couple)
      - the brand-yellow mark on transparency

    Keying on alpha alone turns the white-backed one into a solid black rectangle.
    Keying on luminance alone loses the yellow mark, whose luminance is close to
    white's. Compositing onto white and then asking "is any channel meaningfully
    darker than white" handles all three: black scores 255, brand yellow scores
    233 on its blue channel, and white and near-white antialiasing score ~0.
    """
    im = Image.open(path).convert("RGBA")
    flat = Image.new("RGBA", im.size, "white")
    flat.alpha_composite(im)
    rgb = np.array(flat.convert("RGB")).astype(np.int16)
    mask = (255 - rgb.min(axis=2)) > 96

    rows, cols = np.any(mask, axis=1), np.any(mask, axis=0)
    if rows.any():
        y0, y1 = np.where(rows)[0][[0, -1]]
        x0, x1 = np.where(cols)[0][[0, -1]]
        mask = mask[y0 : y1 + 1, x0 : x1 + 1]
    return mask, mask.shape[1], mask.shape[0]


def trace_to_paths(path, turdsize, opttolerance):
    """Trace black line art into SVG path data.

    Returns (path_data, width, height, contour_count), cropped to the ink so the
    viewBox has no dead margin.

    Note the inverted mask passed to potrace. potracer's foreground polarity is the
    opposite of what you would expect: tracing the ink returns the whole canvas as
    an extra outer contour, and tracing its complement returns just the artwork.
    """
    import potrace

    mask, w, h = ink_mask(path)
    traced = potrace.Bitmap(~mask).trace(
        turdsize=turdsize, alphamax=1.0, opticurve=True, opttolerance=opttolerance
    )

    pt = lambda p: (p.x, p.y)
    d = []
    for curve in traced:
        sx, sy = pt(curve.start_point)
        d.append(f"M{sx:.1f} {sy:.1f}")
        for seg in curve:
            ex, ey = pt(seg.end_point)
            if seg.is_corner:
                cx, cy = pt(seg.c)
                d.append(f"L{cx:.1f} {cy:.1f}L{ex:.1f} {ey:.1f}")
            else:
                c1x, c1y = pt(seg.c1)
                c2x, c2y = pt(seg.c2)
                d.append(f"C{c1x:.1f} {c1y:.1f} {c2x:.1f} {c2y:.1f} {ex:.1f} {ey:.1f}")
        d.append("Z")
    return "".join(d), w, h, len(traced)


def write_illustrations(media):
    os.makedirs(OUT_ILLO, exist_ok=True)
    total = 0
    for key, (name, purpose) in sorted(SELECTED.items()):
        if key not in media:
            sys.exit(f"selected asset {key} is not in the decks any more")
        d, w, h, contours = trace_to_paths(media[key], turdsize=3, opttolerance=1.0)
        svg = (
            '<svg xmlns="http://www.w3.org/2000/svg" '
            f'viewBox="0 0 {w} {h}" role="presentation" aria-hidden="true">'
            f'<path fill="currentColor" fill-rule="evenodd" d="{d}"/></svg>'
        )
        out = os.path.join(OUT_ILLO, f"{name}.svg")
        with open(out, "w") as fh:
            fh.write(svg)
        total += len(svg)
        print(f"  {name:22} {w:4}x{h:<4} {len(svg) // 1024:3} KB  {purpose}")
    print(f"  {'':22} {'':9} {total // 1024:3} KB  total")


def write_mark(media):
    """Trace the mark to SVG so it stays crisp at any size and can be recoloured.

    Correct output is exactly three contours: the glyph outline plus the two
    counters inside the loops. Anything else means the polarity is wrong.
    """
    d, w, h, contours = trace_to_paths(media[MARK_MEDIA], turdsize=4, opttolerance=0.2)
    if contours != 3:
        sys.exit(f"mark traced to {contours} contours, expected 3 — check polarity")
    # fill="currentColor" so the same file works yellow on dark chrome and black
    # on white without shipping two copies.
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" '
        f'viewBox="0 0 {w} {h}" role="img" aria-label="Wellabe">'
        f'<path fill="currentColor" fill-rule="evenodd" d="{d}"/></svg>'
    )
    os.makedirs(OUT_IMG, exist_ok=True)
    out = os.path.join(OUT_IMG, "wellabe-mark.svg")
    with open(out, "w") as fh:
        fh.write(svg)
    print(f"  wellabe-mark.svg       {w}x{h}  {len(svg)} bytes, {contours} contours")


def main():
    media = unpack()
    print(f"found {len(media)} embedded PNGs across {len(DECKS)} decks")
    print("mark:")
    write_mark(media)
    print("illustrations:")
    write_illustrations(media)
    shutil.rmtree(WORK, ignore_errors=True)


if __name__ == "__main__":
    main()
