#!/usr/bin/env python3
"""Build square skill-icon tiles for the landing marketplace.

Pipeline per source PNG (generated on a chroma-green screen by
`ralphy generate image`):
  1. chroma-key the green background to transparent (greenness threshold + despill)
  2. autocrop to the icon's bounding box
  3. NEAREST-resize to a fixed target box (keeps pixel-art crisp)
  4. center on a square tile filled with the skill's category background hex
  5. export webp to landing/public/assets/skills/<slug>.webp

The tile background changes by skill category (derived from the slug prefix,
matching landing/lib/skills-loader.ts). Run after generating/regenerating any
icon source:

    python3 landing/scripts/build-skill-icons.py
"""

import sys
from pathlib import Path
from PIL import Image

SRC = Path("../workspace/projects/landing-skill-icons-001/assets/images")
OUT = Path("public/assets/skills")
TILE = 512          # tile side, px
ICON_BOX = 360      # icon fits within this box, centered
GREENNESS = 60      # g - max(r,b) above this => background pixel

CATEGORY_BG = {
    "UGC niches": (231, 166, 188),     # #E7A6BC rose
    "Workflow": (157, 190, 240),       # #9DBEF0 blue
    "Render engine": (132, 214, 196),  # #84D6C4 teal
    "Maintainer": (235, 192, 126),     # #EBC07E amber
}


def category_for(slug: str) -> str:
    if slug.startswith("ralphy-dev-"):
        return "Maintainer"
    if slug.startswith("ralphy-ugc-"):
        return "UGC niches"
    if slug.startswith("ralphy-"):
        return "Workflow"
    return "Render engine"


def chroma_key(img: Image.Image) -> Image.Image:
    img = img.convert("RGBA")
    px = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if g - max(r, b) > GREENNESS:
                px[x, y] = (r, g, b, 0)           # background -> transparent
            elif g > r and g > b and g - max(r, b) > 25:
                # edge despill: pull green down toward the other channels
                ng = (max(r, b) + g) // 2
                px[x, y] = (r, ng, b, a)
    return img


def build(src_path: Path) -> str:
    slug = src_path.stem
    cat = category_for(slug)
    bg = CATEGORY_BG[cat]

    icon = chroma_key(Image.open(src_path))
    bbox = icon.getbbox()
    if bbox:
        icon = icon.crop(bbox)

    # Scale to fit ICON_BOX, preserve aspect, NEAREST for crisp pixels.
    iw, ih = icon.size
    scale = min(ICON_BOX / iw, ICON_BOX / ih)
    icon = icon.resize((max(1, round(iw * scale)), max(1, round(ih * scale))), Image.NEAREST)

    tile = Image.new("RGBA", (TILE, TILE), bg + (255,))
    ox = (TILE - icon.width) // 2
    oy = (TILE - icon.height) // 2
    tile.alpha_composite(icon, (ox, oy))

    OUT.mkdir(parents=True, exist_ok=True)
    out_path = OUT / f"{slug}.webp"
    tile.convert("RGB").save(out_path, "WEBP", quality=92, method=6)
    return f"{slug}  [{cat}]  -> {out_path}"


def main() -> int:
    if not SRC.exists():
        print(f"source dir not found: {SRC.resolve()}", file=sys.stderr)
        return 1
    pngs = sorted(SRC.glob("*.png"))
    if not pngs:
        print("no source PNGs to process", file=sys.stderr)
        return 1
    for p in pngs:
        # skip auto-versioned regen archives (slug.v2.png etc.)
        if ".v" in p.stem.rsplit("-", 1)[-1] or p.stem[-3:-1] == ".v":
            continue
        print(build(p))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
