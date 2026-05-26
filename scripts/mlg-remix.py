#!/usr/bin/env python3
"""MLG / deep-fried meme remix of race-track-maxv-test for Insta avatar."""
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance, ImageOps
import io
import math
import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "workspace/projects/opium-pfp-001/assets/images/race-track-maxv-test.png"
OUT_DIR = ROOT / "workspace/projects/opium-pfp-001/assets/mlg"
IMPACT = "/System/Library/Fonts/Supplemental/Impact.ttf"
EMOJI = "/System/Library/Fonts/Apple Color Emoji.ttc"
HELV_BOLD = "/System/Library/Fonts/HelveticaNeue.ttc"


def stroked_text(img, xy, text, font_path, size, fill, stroke_fill="black",
                 stroke_w=None, anchor="mm", angle=0):
    if stroke_w is None:
        stroke_w = max(2, size // 12)
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    font = ImageFont.truetype(font_path, size)
    d.text(xy, text, font=font, fill=fill, anchor=anchor,
           stroke_width=stroke_w, stroke_fill=stroke_fill)
    if angle:
        layer = layer.rotate(angle, resample=Image.BICUBIC)
    img.alpha_composite(layer)


def emoji_blob(img, xy, char, size, angle=0):
    """Apple Color Emoji only supports specific bitmap sizes (160 native).
    Render at native then resize."""
    native = 160
    layer = Image.new("RGBA", (native * 2, native * 2), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    font = ImageFont.truetype(EMOJI, native, layout_engine=ImageFont.Layout.RAQM
                              if hasattr(ImageFont.Layout, "RAQM") else None)
    try:
        d.text((native, native), char, font=font, embedded_color=True, anchor="mm")
    except Exception:
        d.text((native, native), char, font=font, anchor="mm")
    if size != native * 2:
        layer = layer.resize((size, size), Image.LANCZOS)
    if angle:
        layer = layer.rotate(angle, resample=Image.BICUBIC, expand=True)
    img.alpha_composite(layer, (xy[0] - layer.width // 2, xy[1] - layer.height // 2))


def deep_fry(img, sat=2.8, contrast=1.9, sharpness=2.2, posterize=4, jpeg_q=18, passes=3):
    out = ImageEnhance.Color(img).enhance(sat)
    out = ImageEnhance.Contrast(out).enhance(contrast)
    out = ImageEnhance.Sharpness(out).enhance(sharpness)
    if posterize:
        rgb = out.convert("RGB")
        rgb = ImageOps.posterize(rgb, posterize)
        out = rgb.convert("RGBA")
    for _ in range(passes):
        buf = io.BytesIO()
        out.convert("RGB").save(buf, "JPEG", quality=jpeg_q)
        buf.seek(0)
        out = Image.open(buf).convert("RGBA")
    return out


def add_glow(img, color=(255, 230, 0), radius=60, opacity=140):
    glow = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(glow)
    cx, cy = random.randint(100, img.width - 100), random.randint(100, img.height - 200)
    for r in range(radius, 0, -8):
        a = int(opacity * (1 - r / radius))
        d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(*color, a))
    glow = glow.filter(ImageFilter.GaussianBlur(radius // 4))
    img.alpha_composite(glow)


def crosshair(img, xy, size=140, color=(255, 60, 60, 255)):
    d = ImageDraw.Draw(img)
    cx, cy = xy
    # red X
    d.line((cx - size, cy - size, cx + size, cy + size), fill=color, width=8)
    d.line((cx + size, cy - size, cx - size, cy + size), fill=color, width=8)
    # outer ring
    d.ellipse((cx - size - 12, cy - size - 12, cx + size + 12, cy + size + 12),
              outline=color, width=6)
    # inner ring
    d.ellipse((cx - 30, cy - 30, cx + 30, cy + 30), outline=color, width=4)


def lens_flare(img, xy, size=200, color=(255, 245, 100)):
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    cx, cy = xy
    for r in range(size, 0, -10):
        a = int(180 * (1 - r / size) ** 2)
        d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(*color, a))
    # rays
    for ang in range(0, 360, 30):
        rad = math.radians(ang)
        x2 = cx + math.cos(rad) * size * 1.6
        y2 = cy + math.sin(rad) * size * 1.6
        d.line((cx, cy, x2, y2), fill=(*color, 80), width=4)
    layer = layer.filter(ImageFilter.GaussianBlur(8))
    img.alpha_composite(layer)


def chromatic_shift(img, dx=4):
    r, g, b, a = img.split()
    r = ImageOps.expand(r, border=(dx, 0, 0, 0), fill=0).crop((0, 0, img.width, img.height))
    b = ImageOps.expand(b, border=(0, 0, dx, 0), fill=0).crop((dx, 0, img.width + dx, img.height))
    return Image.merge("RGBA", (r, g, b, a))


def add_jpeg_noise(img, intensity=14):
    noise = Image.effect_noise(img.size, intensity).convert("RGBA")
    noise.putalpha(40)
    img.alpha_composite(noise)


def rainbow_text(img, xy, text, font_path, size, stroke_w=None):
    """Draw text in horizontal rainbow gradient."""
    if stroke_w is None:
        stroke_w = max(3, size // 10)
    font = ImageFont.truetype(font_path, size)
    bbox = font.getbbox(text)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    # text mask
    text_layer = Image.new("RGBA", (tw + 80, th + 80), (0, 0, 0, 0))
    td = ImageDraw.Draw(text_layer)
    td.text((40 - bbox[0], 40 - bbox[1]), text, font=font, fill=(255, 255, 255, 255),
            stroke_width=stroke_w, stroke_fill=(0, 0, 0, 255))
    # rainbow gradient
    grad = Image.new("RGBA", text_layer.size, (0, 0, 0, 0))
    gd = ImageDraw.Draw(grad)
    colors = [(255, 0, 80), (255, 140, 0), (255, 230, 0),
              (40, 220, 60), (0, 180, 255), (180, 60, 255)]
    step = grad.width / len(colors)
    for i, c in enumerate(colors):
        gd.rectangle((i * step, 0, (i + 1) * step, grad.height), fill=(*c, 255))
    # mask gradient by text alpha (keep stroke as black)
    inner_mask = Image.new("L", text_layer.size, 0)
    md = ImageDraw.Draw(inner_mask)
    md.text((40 - bbox[0], 40 - bbox[1]), text, font=font, fill=255)
    # composite: stroke first
    out = Image.new("RGBA", text_layer.size, (0, 0, 0, 0))
    stroke_mask = Image.new("L", text_layer.size, 0)
    sd = ImageDraw.Draw(stroke_mask)
    sd.text((40 - bbox[0], 40 - bbox[1]), text, font=font, fill=255,
            stroke_width=stroke_w, stroke_fill=255)
    out.paste((0, 0, 0, 255), mask=stroke_mask)
    out.paste(grad, mask=inner_mask)
    # place on img
    img.alpha_composite(out, (xy[0] - out.width // 2, xy[1] - out.height // 2))


# ---------- variant 1: classic MLG ----------
def make_v1(base):
    img = base.copy()
    img = deep_fry(img, sat=2.6, contrast=1.7, sharpness=1.8, posterize=5, jpeg_q=22)
    img = chromatic_shift(img, dx=3)
    # lens flares
    lens_flare(img, (170, 200), size=180)
    lens_flare(img, (870, 380), size=140)
    add_glow(img, color=(255, 60, 60), radius=120)
    # crosshair on the face (the face is ~ upper third, slightly left)
    crosshair(img, (440, 220), size=110)
    # emoji bursts
    random.seed(42)
    emojis = ["🔥", "💀", "💯", "🎯", "🚨", "💵", "🍃", "🤡"]
    for i, e in enumerate(emojis):
        x = random.randint(60, 960)
        y = random.randint(60, 960)
        # avoid centre face
        if 280 < x < 600 and 100 < y < 380:
            y += 350
        emoji_blob(img, (x, y), e, size=140, angle=random.randint(-25, 25))
    # top text
    stroked_text(img, (512, 90), "WHEN HE PULL UP", IMPACT, 92, "white", "black", anchor="mm")
    # bottom text rainbow
    rainbow_text(img, (512, 940), "TO THE COOKOUT", IMPACT, 88)
    # MLG watermark
    stroked_text(img, (140, 990), "MLG PRO", IMPACT, 56,
                 (255, 230, 0, 255), (40, 120, 0, 255), anchor="mm")
    # extra red 360 NO SCOPE
    stroked_text(img, (820, 990), "360 NO SCOPE", IMPACT, 38,
                 (255, 80, 80, 255), "black", anchor="mm", angle=-4)
    # corner sniper crosshair small
    crosshair(img, (920, 130), size=50, color=(60, 255, 80, 255))
    add_jpeg_noise(img, intensity=10)
    return img


# ---------- variant 2: drip thug ----------
def make_v2(base):
    img = base.copy()
    # less fried, more "drip"
    img = ImageEnhance.Color(img).enhance(1.5)
    img = ImageEnhance.Contrast(img).enhance(1.3)
    img = ImageEnhance.Brightness(img).enhance(0.96)
    # cyan-pink color cast (drip)
    overlay = Image.new("RGBA", img.size, (40, 200, 255, 35))
    img.alpha_composite(overlay)
    # spotlight beams behind subject
    beams = Image.new("RGBA", img.size, (0, 0, 0, 0))
    bd = ImageDraw.Draw(beams)
    for ang in (-30, -10, 10, 30):
        bd.polygon([(512, 200),
                    (512 + math.cos(math.radians(ang - 90)) * 1400,
                     200 + math.sin(math.radians(ang - 90)) * 1400),
                    (512 + math.cos(math.radians(ang - 90 + 8)) * 1400,
                     200 + math.sin(math.radians(ang - 90 + 8)) * 1400)],
                   fill=(255, 220, 100, 38))
    beams = beams.filter(ImageFilter.GaussianBlur(18))
    img.alpha_composite(beams)
    # diamond / ice emoji rain
    random.seed(7)
    emojis = ["💎", "🥶", "❄️", "💍", "🪩", "💸", "🤑"]
    for _ in range(14):
        e = random.choice(emojis)
        x = random.randint(40, 980)
        y = random.randint(40, 980)
        emoji_blob(img, (x, y), e, size=random.randint(80, 140),
                   angle=random.randint(-30, 30))
    # title rainbow
    rainbow_text(img, (512, 100), "DRIP CHECK", IMPACT, 130)
    # subtitle
    stroked_text(img, (512, 200), "FT. THE BOYS", IMPACT, 56,
                 "white", "black", anchor="mm")
    # bottom
    stroked_text(img, (512, 950), "$$$ CERTIFIED $$$", IMPACT, 64,
                 (255, 230, 0, 255), "black", anchor="mm")
    # corner price tag
    stroked_text(img, (130, 980), "$10K FIT", IMPACT, 50,
                 (60, 255, 80, 255), "black", anchor="mm", angle=-8)
    return img


# ---------- variant 3: illuminati / conspiracy ----------
def make_v3(base):
    img = base.copy()
    # desaturate + sepia-green tint
    img = ImageEnhance.Color(img).enhance(0.45)
    img = ImageEnhance.Contrast(img).enhance(1.4)
    img = ImageEnhance.Brightness(img).enhance(0.88)
    overlay = Image.new("RGBA", img.size, (40, 80, 30, 50))
    img.alpha_composite(overlay)
    # illuminati triangle behind head — drawn glowing
    tri = Image.new("RGBA", img.size, (0, 0, 0, 0))
    td = ImageDraw.Draw(tri)
    cx, cy = 480, 280
    s = 320
    pts = [(cx, cy - s), (cx - s * 0.866, cy + s * 0.5), (cx + s * 0.866, cy + s * 0.5)]
    td.polygon(pts, outline=(255, 220, 0, 255), width=10)
    # inner glow
    td.polygon([(cx, cy - s + 30), (cx - s * 0.866 + 30, cy + s * 0.5 - 18),
                (cx + s * 0.866 - 30, cy + s * 0.5 - 18)],
               outline=(255, 220, 0, 120), width=4)
    tri = tri.filter(ImageFilter.GaussianBlur(3))
    img.alpha_composite(tri)
    # all-seeing eye emoji centred behind face
    emoji_blob(img, (480, 280), "👁️", size=180)
    # static / scan-line overlay
    scan = Image.new("RGBA", img.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(scan)
    for y in range(0, img.height, 3):
        sd.line((0, y, img.width, y), fill=(0, 0, 0, 60), width=1)
    img.alpha_composite(scan)
    add_jpeg_noise(img, intensity=22)
    # top text
    stroked_text(img, (512, 80), "THEY DON'T WANT", IMPACT, 78,
                 (255, 220, 0, 255), "black", anchor="mm")
    stroked_text(img, (512, 160), "U TO SEE THIS", IMPACT, 78,
                 (255, 220, 0, 255), "black", anchor="mm")
    # bottom redacted-style
    stroked_text(img, (512, 940), "[ SHADOW PILOT // 14-B ]", IMPACT, 56,
                 (255, 60, 60, 255), "black", anchor="mm")
    # SCP-style data card top-left
    d = ImageDraw.Draw(img)
    d.rectangle((30, 30, 360, 220), fill=(0, 0, 0, 180), outline=(255, 220, 0, 255), width=3)
    stroked_text(img, (195, 60), "CLASSIFIED", IMPACT, 32,
                 (255, 220, 0, 255), "black", anchor="mm")
    stroked_text(img, (195, 110), "SUBJECT: UNKNOWN", IMPACT, 22, "white", "black", anchor="mm")
    stroked_text(img, (195, 150), "STATUS: AT LARGE", IMPACT, 22,
                 (255, 60, 60, 255), "black", anchor="mm")
    stroked_text(img, (195, 190), "DANGER LEVEL: 9.9", IMPACT, 22,
                 (255, 220, 0, 255), "black", anchor="mm")
    # corner pyramid eye
    emoji_blob(img, (920, 950), "🔺", size=120)
    return img


# ---------- DEEP-FRIED CROP REMIXES (building on v1) ----------

def base_fry(img):
    """Common deepfry foundation reused by all v4–v7 crops."""
    out = deep_fry(img, sat=2.7, contrast=1.75, sharpness=1.9, posterize=5, jpeg_q=20)
    out = chromatic_shift(out, dx=3)
    return out


def hit_markers(img, points, size=42, color=(255, 255, 255, 230)):
    """Small white X hit-markers (Call of Duty style)."""
    d = ImageDraw.Draw(img)
    for cx, cy in points:
        d.line((cx - size, cy - size, cx + size, cy + size), fill=color, width=5)
        d.line((cx + size, cy - size, cx - size, cy + size), fill=color, width=5)


def kill_feed(img, lines, x=20, y_top=540, font_size=28):
    """Top-right COD kill-feed style stack."""
    d = ImageDraw.Draw(img)
    font = ImageFont.truetype(IMPACT, font_size)
    for i, line in enumerate(lines):
        bbox = font.getbbox(line)
        w = bbox[2] - bbox[0]
        y = y_top + i * (font_size + 14)
        d.rectangle((img.width - w - 30, y - 6, img.width - 10, y + font_size + 6),
                    fill=(0, 0, 0, 200))
        d.text((img.width - w - 20, y - bbox[1]), line, font=font,
               fill=(255, 245, 100, 255), stroke_width=2, stroke_fill="black")


def news_ticker(img, text, y=950, font_size=34, bar_color=(200, 30, 30, 230)):
    """Breaking-news red scrolling ticker bar."""
    d = ImageDraw.Draw(img)
    d.rectangle((0, y - 12, img.width, y + font_size + 24), fill=bar_color)
    # BREAKING badge
    badge_font = ImageFont.truetype(IMPACT, font_size + 4)
    d.rectangle((0, y - 12, 250, y + font_size + 24), fill=(255, 230, 0, 255))
    d.text((20, y - 6), "LIVE", font=badge_font, fill="black",
           stroke_width=2, stroke_fill="black")
    body_font = ImageFont.truetype(IMPACT, font_size)
    d.text((270, y - 2), text, font=body_font, fill="white",
           stroke_width=2, stroke_fill="black")


# ---------- variant 4: face-tight (head-and-shoulders) ----------
def make_v4_facetight(base):
    # crop face + shoulders, resize back to square
    crop = base.crop((280, 70, 820, 610)).resize((1024, 1024), Image.LANCZOS)
    img = base_fry(crop)
    # extra fry — re-jpeg
    img = deep_fry(img, sat=1.4, contrast=1.2, sharpness=1.5, posterize=0, jpeg_q=18, passes=2)
    # red glow behind head
    add_glow(img, color=(255, 40, 60), radius=160, opacity=180)
    # huge crosshair pinning the face
    crosshair(img, (510, 380), size=240, color=(255, 60, 60, 255))
    # smaller hit markers scattered
    random.seed(11)
    hit_markers(img, [(random.randint(80, 940), random.randint(80, 940)) for _ in range(8)])
    # emoji rain
    for e, pos, ang in [
        ("🔥", (140, 140), -15), ("💀", (880, 130), 12),
        ("💯", (100, 880), 8), ("🎯", (900, 880), -10),
        ("😤", (180, 500), 0), ("🚨", (860, 500), 0),
        ("🤡", (500, 60), 0),
    ]:
        emoji_blob(img, pos, e, size=130, angle=ang)
    # title
    stroked_text(img, (512, 90), "WHO IS HE??", IMPACT, 120,
                 (255, 230, 0, 255), "black", anchor="mm")
    # subtitle
    stroked_text(img, (512, 200), "RESPECTFULLY...", IMPACT, 56, "white", "black", anchor="mm")
    # bottom rating box
    d = ImageDraw.Draw(img)
    d.rectangle((300, 880, 724, 980), fill="black", outline=(255, 230, 0, 255), width=4)
    stroked_text(img, (512, 930), "UNRATED 💀", IMPACT, 64,
                 (255, 230, 0, 255), "black", anchor="mm")
    add_jpeg_noise(img, intensity=14)
    return img


# ---------- variant 5: dutch-tilt news broadcast ----------
def make_v5_dutchnews(base):
    fried = base_fry(base)
    # rotate 9° anticlockwise, expand, crop back
    rot = fried.rotate(9, resample=Image.BICUBIC, expand=True)
    # crop centre square
    cx, cy = rot.width // 2, rot.height // 2
    img = rot.crop((cx - 512, cy - 512, cx + 512, cy + 512))
    # red corner alert flash
    add_glow(img, color=(255, 50, 50), radius=200, opacity=140)
    # broadcast HUD top
    d = ImageDraw.Draw(img)
    d.rectangle((0, 0, 1024, 80), fill=(0, 0, 0, 200))
    stroked_text(img, (20, 40), "■ LIVE", IMPACT, 44,
                 (255, 60, 60, 255), "black", anchor="lm")
    stroked_text(img, (512, 40), "PIT-LANE BREAKING NEWS", IMPACT, 44,
                 "white", "black", anchor="mm")
    stroked_text(img, (1004, 40), "03:47", IMPACT, 36,
                 (255, 230, 0, 255), "black", anchor="rm")
    # main headline (Impact stack)
    stroked_text(img, (512, 250), "MAN SPOTTED", IMPACT, 92, "white", "black", anchor="mm")
    stroked_text(img, (512, 340), "WITH UNGODLY DRIP", IMPACT, 76,
                 (255, 230, 0, 255), "black", anchor="mm")
    # crosshair on body
    crosshair(img, (520, 620), size=130, color=(255, 60, 60, 255))
    # emoji
    for e, pos, ang in [
        ("🚨", (90, 480), -10), ("🚨", (940, 480), 10),
        ("📺", (140, 140), 0), ("💀", (910, 160), 0),
    ]:
        emoji_blob(img, pos, e, size=120, angle=ang)
    # ticker
    news_ticker(img, "*** SUSPECT ARMED WITH DRIP *** APPROACH WITH CAUTION ***", y=940)
    # bottom-right BREAKING badge
    add_jpeg_noise(img, intensity=12)
    return img


# ---------- variant 6: story-vertical 9:16 ----------
def make_v6_story(base):
    """Build a 1080x1920 (9:16) Insta-Story-ready canvas."""
    canvas = Image.new("RGBA", (1080, 1920), (10, 10, 14, 255))
    fried = base_fry(base)
    # source is square 1024x1024 — scale to 1080 width
    scaled = fried.resize((1080, 1080), Image.LANCZOS)
    # paste centred vertically with some bleed
    canvas.paste(scaled, (0, 420), scaled)
    # add fade gradient top + bottom
    grad = Image.new("L", (1080, 420), 0)
    gd = ImageDraw.Draw(grad)
    for y in range(420):
        gd.line((0, y, 1080, y), fill=int(180 * (1 - y / 420)))
    top_dark = Image.new("RGBA", (1080, 420), (0, 0, 0, 0))
    top_dark.putalpha(grad)
    canvas.alpha_composite(top_dark, (0, 0))
    bottom_dark = Image.new("RGBA", (1080, 420), (0, 0, 0, 0))
    bottom_dark.putalpha(grad.transpose(Image.FLIP_TOP_BOTTOM))
    canvas.alpha_composite(bottom_dark, (0, 1500))
    # red glow behind head area
    add_glow(canvas, color=(255, 50, 60), radius=200, opacity=160)
    # top: "POV"
    stroked_text(canvas, (540, 200), "POV:", IMPACT, 110,
                 (255, 230, 0, 255), "black", anchor="mm")
    stroked_text(canvas, (540, 330), "HE JUST WALKED IN", IMPACT, 92,
                 "white", "black", anchor="mm")
    # crosshair tracking head
    crosshair(canvas, (540, 700), size=140, color=(255, 60, 60, 255))
    # hit markers around him
    random.seed(99)
    hit_markers(canvas, [(random.randint(120, 960), random.randint(800, 1500)) for _ in range(10)])
    # emoji rain top half
    for e, pos, ang in [
        ("🔥", (140, 580), -15), ("🔥", (940, 600), 15),
        ("💀", (110, 1000), 0), ("💀", (970, 980), 0),
        ("💯", (90, 1300), -8), ("💵", (970, 1320), 8),
        ("🚨", (80, 750), 0), ("🚨", (1000, 750), 0),
    ]:
        emoji_blob(canvas, pos, e, size=140, angle=ang)
    # bottom: rainbow CTA + tag
    rainbow_text(canvas, (540, 1680), "NO ONE SURVIVED", IMPACT, 110)
    stroked_text(canvas, (540, 1820), "@ THE COOKOUT", IMPACT, 66,
                 (255, 230, 0, 255), "black", anchor="mm")
    add_jpeg_noise(canvas, intensity=12)
    return canvas


# ---------- AVATAR-FIRST facetight remixes (cleaner composition) ----------
# v4 was too scattered. These keep the same head-and-shoulders crop but obey
# stricter layout: ONE focal accent, symmetric type stack, no floating clutter.

FACE_CROP = (280, 70, 820, 610)  # source rect in race-track-maxv-test.png


def facetight_base(base, fry_passes=2, jpeg_q=18):
    """Reusable facetight foundation: tight crop + chromatic + medium fry."""
    crop = base.crop(FACE_CROP).resize((1024, 1024), Image.LANCZOS)
    img = deep_fry(crop, sat=2.4, contrast=1.6, sharpness=1.7,
                   posterize=5, jpeg_q=jpeg_q, passes=fry_passes)
    img = chromatic_shift(img, dx=3)
    return img


# ---------- variant 9: POV clean (symmetric, avatar-first) ----------
def make_v9_pov_clean(base):
    img = facetight_base(base)
    # red halo behind the head — single focal glow, no scattered light
    halo = Image.new("RGBA", img.size, (0, 0, 0, 0))
    hd = ImageDraw.Draw(halo)
    cx, cy = 500, 360
    for r in range(360, 0, -8):
        a = int(170 * (1 - r / 360) ** 1.6)
        hd.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(255, 40, 60, a))
    halo = halo.filter(ImageFilter.GaussianBlur(28))
    img.alpha_composite(halo)
    # darken bottom band for the tagline
    bottom = Image.new("RGBA", img.size, (0, 0, 0, 0))
    bd = ImageDraw.Draw(bottom)
    bd.rectangle((0, 880, 1024, 1024), fill=(0, 0, 0, 200))
    img.alpha_composite(bottom)
    # top text stack
    stroked_text(img, (512, 70), "POV:", IMPACT, 64,
                 (255, 230, 0, 255), "black", anchor="mm")
    stroked_text(img, (512, 150), "U JUST GOT SPOTTED", IMPACT, 76,
                 "white", "black", anchor="mm")
    # bottom tagline — single line, no extra clutter
    stroked_text(img, (512, 945), "@ THE COOKOUT", IMPACT, 70,
                 (255, 230, 0, 255), "black", anchor="mm")
    # exactly two emojis, symmetric, top corners only
    emoji_blob(img, (90, 90), "🔥", size=140)
    emoji_blob(img, (934, 90), "🔥", size=140)
    add_jpeg_noise(img, intensity=10)
    return img


# ---------- variant 10: rookie trading card ----------
def make_v10_rookie_card(base):
    canvas = Image.new("RGBA", (1024, 1024), (12, 12, 20, 255))
    # gold gradient outer frame
    frame = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    fd = ImageDraw.Draw(frame)
    for i in range(40):
        # gold gradient ring, lighter inside
        t = i / 40
        c = (int(180 + 70 * t), int(140 + 80 * t), int(40 + 60 * t), 255)
        fd.rectangle((i, i, 1024 - i, 1024 - i), outline=c, width=1)
    canvas.alpha_composite(frame)
    # inner background — deep navy
    d = ImageDraw.Draw(canvas)
    d.rectangle((40, 40, 984, 984), fill=(18, 22, 50, 255))
    # team-name banner across the top
    banner = Image.new("RGBA", (944, 110), (0, 0, 0, 0))
    bd = ImageDraw.Draw(banner)
    # diagonal red banner with yellow trim
    for x in range(944):
        t = x / 944
        c = (int(200 - 40 * t), int(20 + 40 * t), 30, 255)
        bd.line((x, 0, x, 110), fill=c)
    canvas.alpha_composite(banner, (40, 50))
    stroked_text(canvas, (512, 105), "OPIUM RACING", IMPACT, 72,
                 (255, 230, 0, 255), "black", anchor="mm")
    # portrait area — facetight crop, slightly less fried (card photo)
    portrait = base.crop(FACE_CROP).resize((780, 580), Image.LANCZOS)
    portrait = ImageEnhance.Color(portrait).enhance(1.4)
    portrait = ImageEnhance.Contrast(portrait).enhance(1.25)
    portrait = portrait.convert("RGBA")
    # frame the portrait
    pframe = Image.new("RGBA", (portrait.width + 16, portrait.height + 16),
                       (255, 220, 80, 255))
    pframe.paste(portrait, (8, 8), portrait)
    canvas.alpha_composite(pframe, (114, 180))
    # holographic shimmer overlay on portrait area
    shim = Image.new("RGBA", (pframe.width, pframe.height), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shim)
    for x in range(0, pframe.width, 3):
        t = x / pframe.width
        c = (int(120 + 130 * math.sin(t * math.pi * 4)),
             int(120 + 130 * math.sin(t * math.pi * 4 + 2)),
             int(120 + 130 * math.sin(t * math.pi * 4 + 4)),
             40)
        sd.line((x, 0, x, pframe.height), fill=c, width=1)
    canvas.alpha_composite(shim, (114, 180))
    # name plate below portrait
    d = ImageDraw.Draw(canvas)
    d.rectangle((114, 776, 910, 836), fill=(255, 220, 80, 255))
    stroked_text(canvas, (512, 806), "★  OPIUM PIRATE  ★", IMPACT, 48,
                 (35, 20, 8, 255), (35, 20, 8, 255), stroke_w=0, anchor="mm")
    # stats panel
    d.rectangle((114, 856, 910, 968), fill=(0, 0, 0, 220),
                outline=(255, 220, 80, 255), width=3)

    def stat_row(label, value, y):
        stroked_text(canvas, (140, y), label, IMPACT, 30, "white", "black",
                     anchor="lm")
        # bar gauge — Impact "I" letters with spacing form a reliable filled bar
        filled = min(int(value / 20), 5)
        rd = ImageDraw.Draw(canvas)
        bar_x = 360
        for i in range(5):
            col = (255, 220, 80, 255) if i < filled else (60, 60, 70, 255)
            rd.rectangle((bar_x + i * 70, y - 14, bar_x + i * 70 + 50, y + 14),
                         fill=col, outline=(255, 220, 80, 255), width=2)
        stroked_text(canvas, (880, y), str(value), IMPACT, 32,
                     (255, 220, 80, 255), "black", anchor="rm")

    stat_row("SPEED", 99, 880)
    stat_row("DRIP", 99, 915)
    stat_row("VIBE", 99, 950)
    # rookie 2026 corner stamp
    stroked_text(canvas, (130, 84), "ROOKIE", IMPACT, 28,
                 (255, 230, 0, 255), "black", anchor="lm", angle=-12)
    stroked_text(canvas, (130, 112), "  2026", IMPACT, 28,
                 (255, 230, 0, 255), "black", anchor="lm", angle=-12)
    # holographic logo bottom-right corner
    stroked_text(canvas, (970, 996), "✦ HOLO ✦", IMPACT, 22,
                 (180, 220, 255, 255), "black", anchor="rm")
    return canvas


# ---------- variant 11: sigma / silent mode ----------
def make_v11_sigma(base):
    # MAX deep-fry on the facetight crop
    img = facetight_base(base, fry_passes=4, jpeg_q=14)
    img = deep_fry(img, sat=1.2, contrast=1.3, sharpness=1.4,
                   posterize=0, jpeg_q=14, passes=2)
    img = chromatic_shift(img, dx=5)
    # red duotone overlay top half
    duo = Image.new("RGBA", img.size, (0, 0, 0, 0))
    dd = ImageDraw.Draw(duo)
    dd.rectangle((0, 0, 1024, 1024), fill=(180, 30, 40, 38))
    img.alpha_composite(duo)
    # heavy vignette
    vig = Image.new("L", img.size, 0)
    vd = ImageDraw.Draw(vig)
    cx, cy = 512, 360
    for r in range(800, 0, -8):
        a = int(220 * (r / 800) ** 1.4)
        vd.ellipse((cx - r, cy - r, cx + r, cy + r), fill=255 - a)
    vig = vig.filter(ImageFilter.GaussianBlur(60))
    dark = Image.new("RGBA", img.size, (0, 0, 0, 0))
    dark.putalpha(ImageOps.invert(vig))
    img.alpha_composite(dark)
    add_jpeg_noise(img, intensity=20)
    return img


# ---------- variant 8: One-Piece WANTED poster ----------

HERCULANUM = "/System/Library/Fonts/Supplemental/Herculanum.ttf"
BASKERVILLE = "/System/Library/Fonts/Supplemental/Baskerville.ttc"


def parchment_canvas(size, base_color=(218, 191, 132)):
    """Aged paper background: warm tan + subtle radial vignette + noise."""
    w, h = size
    bg = Image.new("RGBA", size, (*base_color, 255))
    # subtle warm vignette darkening edges
    vig = Image.new("L", size, 0)
    vd = ImageDraw.Draw(vig)
    cx, cy = w // 2, h // 2
    maxr = int(math.hypot(cx, cy))
    for r in range(maxr, 0, -8):
        a = int(80 * (r / maxr) ** 2)
        vd.ellipse((cx - r, cy - r, cx + r, cy + r), fill=255 - a)
    vig = vig.filter(ImageFilter.GaussianBlur(40))
    dark = Image.new("RGBA", size, (90, 50, 20, 0))
    dark.putalpha(ImageOps.invert(vig))
    bg.alpha_composite(dark)
    # paper grain noise
    noise = Image.effect_noise(size, 12).convert("L")
    noise_rgba = Image.merge("RGBA", (
        noise, noise, noise,
        Image.new("L", size, 50)))
    bg.alpha_composite(noise_rgba)
    # warm yellowish overlay to pull saturation
    warm = Image.new("RGBA", size, (220, 175, 90, 30))
    bg.alpha_composite(warm)
    return bg


def add_burn_corners(canvas, seed=3):
    """Irregular dark organic blobs in the four corners + outer edge fade."""
    random.seed(seed)
    w, h = canvas.size
    burn_layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    bd = ImageDraw.Draw(burn_layer)
    corners = [(0, 0), (w, 0), (0, h), (w, h)]
    for cx, cy in corners:
        # multiple overlapping blobs per corner
        for _ in range(4):
            blob_pts = []
            num = random.randint(8, 14)
            radius = random.randint(70, 160)
            for i in range(num):
                ang = (i / num) * math.pi * 2
                r = radius * random.uniform(0.55, 1.0)
                # bias each blob centre toward the corner
                bcx = cx + random.randint(-60, 60)
                bcy = cy + random.randint(-60, 60)
                px = bcx + math.cos(ang) * r
                py = bcy + math.sin(ang) * r
                blob_pts.append((px, py))
            shade = random.randint(20, 50)
            bd.polygon(blob_pts, fill=(shade, shade // 2, 0, 230))
    burn_layer = burn_layer.filter(ImageFilter.GaussianBlur(6))
    canvas.alpha_composite(burn_layer)
    # outer edge slight darkening line
    edge = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    ed = ImageDraw.Draw(edge)
    ed.rectangle((0, 0, w - 1, h - 1), outline=(80, 50, 10, 120), width=4)
    canvas.alpha_composite(edge)


def sepia(img):
    """Convert image to sepia/wanted-poster print tone."""
    gray = ImageOps.grayscale(img)
    # apply a 'tritone' style mapping toward warm browns
    sep = ImageOps.colorize(gray, black=(40, 18, 6), white=(245, 225, 180),
                            mid=(150, 100, 50))
    sep = ImageEnhance.Contrast(sep).enhance(1.15)
    sep = sep.convert("RGBA")
    return sep


def berry_glyph(canvas, xy, height, color=(35, 20, 8, 255)):
    """Draw a One-Piece-style 'B' Berry mark (B with a horizontal strike) at xy.
    Returns the rendered width so callers can lay out adjacent text."""
    cx, cy = xy
    # Use Baskerville BOLD ITALIC if loadable, fall back to Impact
    font = ImageFont.truetype(BASKERVILLE, int(height * 1.05),
                              index=2)  # Bold Italic in the Baskerville .ttc
    layer = Image.new("RGBA", (int(height * 1.4), int(height * 1.4)), (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    ld.text((layer.width // 2, layer.height // 2), "B", font=font,
            fill=color, anchor="mm")
    # horizontal strike across the bowls
    strike_w = int(height * 0.05)
    sy = layer.height // 2
    ld.line((layer.width * 0.18, sy, layer.width * 0.82, sy),
            fill=color, width=strike_w)
    canvas.alpha_composite(layer, (cx - layer.width // 2, cy - layer.height // 2))
    return layer.width


def make_v8_wanted(base, name="OPIUM PIRATE", bounty="999,999,999"):
    canvas = parchment_canvas((1024, 1024))

    # WANTED title — bigger, slight letter-spacing via manual draw
    title_font = ImageFont.truetype(HERCULANUM, 196)
    d = ImageDraw.Draw(canvas)
    title = "WANTED"
    # letterspacing
    letters = list(title)
    space = 14
    widths = [title_font.getbbox(c)[2] - title_font.getbbox(c)[0] for c in letters]
    total_w = sum(widths) + space * (len(letters) - 1)
    x = (canvas.width - total_w) // 2
    y = 50
    for c, w in zip(letters, widths):
        bbox = title_font.getbbox(c)
        d.text((x - bbox[0], y - bbox[1]), c, font=title_font,
               fill=(28, 16, 6, 255))
        x += w + space
    # decorative thin double rule under WANTED
    for ox in (-4, 4):
        d.line((110, 240 + ox, 914, 240 + ox), fill=(35, 20, 8, 220), width=2)

    # DEAD OR ALIVE — Baskerville
    stroked_text(canvas, (512, 295), "DEAD  OR  ALIVE", BASKERVILLE, 62,
                 (35, 20, 8, 255), (35, 20, 8, 255), stroke_w=0, anchor="mm")

    # portrait — face-tight crop, sepia, double-bordered
    face = base.crop((280, 70, 820, 610))
    face = face.resize((640, 480), Image.LANCZOS)
    face = sepia(face)
    framed = Image.new("RGBA", (face.width + 28, face.height + 28),
                       (35, 20, 8, 255))
    fd = ImageDraw.Draw(framed)
    fd.rectangle((10, 10, framed.width - 11, framed.height - 11),
                 fill=(218, 191, 132, 255))
    fd.rectangle((10, 10, framed.width - 11, framed.height - 11),
                 outline=(35, 20, 8, 255), width=3)
    framed.paste(face, (14, 14), face)
    # drop shadow
    shadow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.rectangle((192, 356, 192 + framed.width + 6, 356 + framed.height + 6),
                 fill=(0, 0, 0, 80))
    shadow = shadow.filter(ImageFilter.GaussianBlur(8))
    canvas.alpha_composite(shadow)
    canvas.alpha_composite(framed, (190, 350))

    # subject name — Herculanum quoted
    stroked_text(canvas, (512, 880), f'"{name}"', HERCULANUM, 68,
                 (35, 20, 8, 255), (35, 20, 8, 255), stroke_w=0, anchor="mm")

    # bounty line — custom Berry glyph + number in Impact
    bounty_text = f"  {bounty}.-"
    bounty_font = ImageFont.truetype(IMPACT, 76)
    bt_bbox = bounty_font.getbbox(bounty_text)
    bt_w = bt_bbox[2] - bt_bbox[0]
    berry_h = 70
    berry_w_est = int(berry_h * 1.1)
    total_w = berry_w_est + bt_w
    start_x = (canvas.width - total_w) // 2
    berry_cx = start_x + berry_w_est // 2
    bounty_y = 950
    berry_glyph(canvas, (berry_cx, bounty_y), berry_h)
    # number
    text_x = berry_cx + berry_w_est // 2
    d.text((text_x - bt_bbox[0], bounty_y - berry_h // 2 - bt_bbox[1] + 6),
           bounty_text, font=bounty_font, fill=(35, 20, 8, 255))

    # ageing — burnt corners
    add_burn_corners(canvas)

    # paper-fold creases — diagonal soft lines
    creases = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    cd = ImageDraw.Draw(creases)
    cd.line((-50, 720, 1100, 580), fill=(70, 40, 10, 35), width=2)
    cd.line((-50, 300, 1100, 380), fill=(70, 40, 10, 30), width=2)
    creases = creases.filter(ImageFilter.GaussianBlur(2))
    canvas.alpha_composite(creases)

    # final mild rotation
    rotated = canvas.rotate(-1.2, resample=Image.BICUBIC, expand=False,
                            fillcolor=(218, 191, 132, 255))
    return rotated


# ---------- variant 7: extreme head zoom (gigachad mode) ----------
def make_v7_gigachad(base):
    # extreme crop on face
    crop = base.crop((360, 130, 660, 430)).resize((1024, 1024), Image.LANCZOS)
    # extra-extra fried (low-res input forces compression artefacts)
    img = deep_fry(crop, sat=3.0, contrast=2.0, sharpness=2.5, posterize=4, jpeg_q=14, passes=4)
    img = chromatic_shift(img, dx=5)
    # heavy red rim glow
    add_glow(img, color=(255, 40, 40), radius=260, opacity=200)
    add_glow(img, color=(255, 220, 0), radius=180, opacity=140)
    # gigachad gradient bar bottom
    d = ImageDraw.Draw(img)
    bar = Image.new("RGBA", (1024, 110), (0, 0, 0, 0))
    bd = ImageDraw.Draw(bar)
    for x in range(1024):
        # red → yellow → green gradient
        if x < 512:
            t = x / 512
            c = (int(255 * (1 - t) + 255 * t), int(40 + 215 * t), 40)
        else:
            t = (x - 512) / 512
            c = (int(255 * (1 - t)), 255, int(40 + 60 * t))
        bd.line((x, 0, x, 110), fill=(*c, 230))
    img.alpha_composite(bar, (0, 880))
    stroked_text(img, (512, 935), "GIGACHAD MODE: ON", IMPACT, 64,
                 "white", "black", anchor="mm")
    # title
    stroked_text(img, (512, 80), "POV:", IMPACT, 110,
                 (255, 230, 0, 255), "black", anchor="mm")
    stroked_text(img, (512, 200), "U LOCKED EYES", IMPACT, 80,
                 "white", "black", anchor="mm")
    # mega crosshair across whole frame
    crosshair(img, (512, 480), size=380, color=(255, 60, 60, 200))
    # emoji corners
    for e, pos in [("🔥", (130, 130)), ("🔥", (894, 130)),
                   ("💀", (130, 850)), ("💀", (894, 850)),
                   ("😤", (260, 600)), ("😤", (764, 600))]:
        emoji_blob(img, pos, e, size=130)
    # kill feed
    kill_feed(img, ["U  ✖  RESPECT",
                    "U  ✖  COMPOSURE",
                    "U  ✖  HOMEWORK"], y_top=300, font_size=32)
    add_jpeg_noise(img, intensity=18)
    return img


def main():
    src = Image.open(SRC).convert("RGBA")
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    targets = {
        "mlg-v1-deepfried": make_v1,
        "mlg-v2-drip": make_v2,
        "mlg-v3-illuminati": make_v3,
        "mlg-v4-facetight": make_v4_facetight,
        "mlg-v5-dutchnews": make_v5_dutchnews,
        "mlg-v6-story-9x16": make_v6_story,
        "mlg-v7-gigachad": make_v7_gigachad,
        "mlg-v8-wanted": make_v8_wanted,
        "mlg-v9-pov-clean": make_v9_pov_clean,
        "mlg-v10-rookie-card": make_v10_rookie_card,
        "mlg-v11-sigma": make_v11_sigma,
    }
    only = sys.argv[1:] if len(sys.argv) > 1 else None
    for name, fn in targets.items():
        if only and not any(tag in name for tag in only):
            continue
        out = fn(src)
        out_path = OUT_DIR / f"{name}.png"
        out.convert("RGB").save(out_path, "PNG")
        out.convert("RGB").save(OUT_DIR / f"{name}.jpg", "JPEG", quality=88)
        print(f"WROTE  {out_path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
