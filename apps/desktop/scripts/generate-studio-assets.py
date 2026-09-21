"""Author original, dependency-free test audio and reusable SVG components for Explore."""
import json
import math
from pathlib import Path
import random
import struct
import wave

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "public/explore/studio"
OUTPUT.mkdir(parents=True, exist_ok=True)
RATE = 22050


def svg(body, background="#151517", definitions=""):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640"><defs>{definitions}</defs><rect width="640" height="640" fill="{background}"/>{body}</svg>'


def text(x, y, content, size=24, color="#faf8f4", extra=""):
    return f'<text x="{x}" y="{y}" fill="{color}" font-family="Arial,sans-serif" font-size="{size}" {extra}>{content}</text>'


VISUALS = [
    {
        "id": "aurora-field", "name": "Aurora field", "summary": "A soft chromatic background with an editable palette.",
        "tags": ["gradient", "background", "organic", "svg"],
        "body": "A layered radial-gradient field for title cards and calm product backdrops. Change the three gradient stops to fit the brand; place text over the quieter center.",
        "svg": svg('<g id="field"><rect width="640" height="640" fill="url(#a)"/><rect width="640" height="640" fill="url(#b)"/><rect width="640" height="640" fill="url(#c)"/></g>', "#102a31", '<radialGradient id="a" cx=".18" cy=".15" r=".9"><stop stop-color="#bceaa5"/><stop offset="1" stop-color="#bceaa5" stop-opacity="0"/></radialGradient><radialGradient id="b" cx=".88" cy=".7" r=".8"><stop stop-color="#cb9278"/><stop offset="1" stop-color="#cb9278" stop-opacity="0"/></radialGradient><radialGradient id="c" cx=".32" cy=".9" r=".62"><stop stop-color="#306b6a"/><stop offset="1" stop-color="#306b6a" stop-opacity="0"/></radialGradient>'),
    },
    {
        "id": "type-opener", "name": "The type opener", "summary": "Oversized editorial type with one sharp accent.",
        "tags": ["typography", "title", "editorial", "svg"],
        "body": "An editorial opener with a small issue line, large two-line title and an accent rule. Edit the title, index and subtitle; animate the title group vertically for a restrained reveal.",
        "svg": svg(text(48, 65, "STUDIO NOTES / 01", 17, "#4a5145") + '<g id="title">' + text(42, 276, "Make", 132, "#243629", 'font-weight="700" letter-spacing="-8"') + text(42, 404, "it felt.", 132, "#243629", 'font-weight="700" letter-spacing="-8"') + '</g><path d="M48 454H592" stroke="#e77a35" stroke-width="14"/>' + text(48, 570, "A different kind of first impression.", 22, "#4a5145"), "#e9e9dc"),
    },
    {
        "id": "caption-stack", "name": "Caption stack", "summary": "Readable phrase-by-phrase captions for a vertical edit.",
        "tags": ["captions", "short-form", "typography", "svg"],
        "body": "A high-contrast three-line caption treatment. Replace phrases with actual transcription, align timing to spoken words and highlight only one meaningful phrase at a time.",
        "svg": svg('<g id="captions"><rect x="66" y="198" width="494" height="72" rx="10" fill="#f5f0e8"/><rect x="86" y="282" width="474" height="72" rx="10" fill="#dcff6b"/><rect x="146" y="366" width="414" height="72" rx="10" fill="#f5f0e8"/>' + text(90, 247, "ONE GOOD IDEA", 43, "#141714", 'font-weight="700"') + text(110, 331, "IS ALL IT TAKES", 40, "#141714", 'font-weight="700"') + text(170, 415, "TO GET GOING.", 40, "#141714", 'font-weight="700"') + '</g>' + text(66, 565, "Phrase by phrase. Always readable.", 20, "#aeb3a5"), "#213127"),
    },
    {
        "id": "lower-third", "name": "A quiet introduction", "summary": "An understated name and role plate for interviews.",
        "tags": ["lower-third", "interview", "identity", "svg"],
        "body": "A compact lower-third label with a vertical accent. Replace name and role, anchor it inside title-safe margins and keep it visible long enough to read before fading out.",
        "svg": svg('<path d="M0 410L640 190V640H0Z" fill="#cad0bc"/><g id="nameplate"><rect x="48" y="392" width="544" height="155" fill="#f8f6ee"/><rect x="48" y="392" width="8" height="155" fill="#b86446"/>' + text(81, 458, "Alex Morgan", 41, "#262b29", 'font-weight="600"') + text(82, 500, "Designer &amp; storyteller", 22, "#59605b") + '</g>' + text(48, 80, "THE PEOPLE BEHIND THE WORK", 18, "#4d5851"), "#e1e5d9"),
    },
    {
        "id": "split-quote", "name": "Words worth keeping", "summary": "A large quote card with an unobtrusive attribution.",
        "tags": ["quote", "editorial", "social", "svg"],
        "body": "A quote layout for a carousel or interview cutaway. Use the exact approved quote, keep line lengths short, and include a factual attribution. Never invent a quote or author.",
        "svg": svg(text(48, 170, "“", 180, "#d77957") + '<g id="quote">' + text(62, 267, "The details", 68, "#eee9df") + text(62, 345, "are the", 68, "#eee9df") + text(62, 423, "whole thing.", 68, "#eee9df") + '</g><path d="M64 480H576" stroke="#726255"/>' + text(64, 544, "A PLACE FOR YOUR QUOTE", 18, "#c2b5a6"), "#302d29"),
    },
    {
        "id": "chapter-divider", "name": "Next chapter", "summary": "A simple chapter card for an essay or documentary.",
        "tags": ["chapter", "documentary", "title", "svg"],
        "body": "A chapter separator with a large chapter number and restrained title. Change the index and section name, then use a short hold between longer segments.",
        "svg": svg(text(44, 380, "02", 320, "#3b4145", 'font-weight="700" letter-spacing="-24"') + '<g id="chapter"><path d="M52 431H587" stroke="#dfedba" stroke-width="2"/>' + text(52, 500, "A closer look", 58, "#dfedba") + text(54, 550, "CHAPTER TWO", 18, "#a5afa9") + '</g>', "#242b2c"),
    },
    {
        "id": "orbit-mark", "name": "Orbit mark", "summary": "A geometric motion accent with a clear center of gravity.",
        "tags": ["geometry", "motion", "accent", "svg"],
        "body": "An abstract orbital mark built from named SVG groups. Recolor the strokes and central disk; rotate the orbit group slowly around the viewBox center for a looping identity accent.",
        "svg": svg('<g id="orbits" stroke="#4a6365" fill="none" stroke-width="2"><ellipse cx="320" cy="320" rx="256" ry="100" transform="rotate(-35 320 320)"/><ellipse cx="320" cy="320" rx="256" ry="100" transform="rotate(35 320 320)"/><ellipse cx="320" cy="320" rx="100" ry="256"/></g><g id="core"><circle cx="320" cy="320" r="72" fill="#df623f"/><circle cx="520" cy="179" r="13" fill="#243a3b"/></g>', "#e4e8df"),
    },
    {
        "id": "end-frame", "name": "Leave a note", "summary": "A closing frame with space for a useful next step.",
        "tags": ["end-card", "cta", "social", "svg"],
        "body": "A minimal end card with one next action. Replace sample text with a real next step, URL or release date; keep it short enough to read within the final three seconds.",
        "svg": svg(text(48, 67, "UNTIL NEXT TIME", 17, "#513f38") + '<g id="closing">' + text(48, 280, "Keep", 112, "#403a35", 'font-weight="700" letter-spacing="-5"') + text(48, 394, "looking.", 112, "#403a35", 'font-weight="700" letter-spacing="-5"') + '<path d="M53 493H567M537 463L567 493L537 523" stroke="#403a35" stroke-width="6" fill="none"/></g>' + text(48, 580, "YOUR NEXT CHAPTER STARTS HERE", 18, "#513f38"), "#e9b7a1"),
    },
]

for visual in VISUALS:
    (OUTPUT / f"visual-{visual['id']}.svg").write_text(visual["svg"] + "\n")
(ROOT / "src/pages/marketplace/lib/studio-visuals.json").write_text(json.dumps(VISUALS, indent=2) + "\n")


def tone(freq, time):
    return math.sin(math.tau * freq * time)


def sound(kind, t, rng):
    noise = rng.uniform(-1, 1)
    if kind == "pulse":
        p = t % .5
        return .45 * tone(55 + 60 * math.exp(-p * 25), p) * math.exp(-p * 17) + .08 * noise * math.exp(-((t + .25) % .5) * 70)
    if kind == "air":
        return .11 * sum(tone(f, t) for f in [130.81, 196, 261.63]) * (.65 + .35 * math.sin(t * .6)) + .016 * noise
    if kind == "signal":
        note = min(2, int(t / .35))
        p = t - note * .35
        return .34 * tone([523.25, 659.25, 783.99][note], t) * math.exp(-p * 5) * (1 - math.exp(-p * 90))
    if kind == "impact":
        return .6 * tone(48 + 28 * math.exp(-t * 9), t) * math.exp(-t * 3) + .13 * noise * math.exp(-t * 12) + .09 * tone(330, t) * math.exp(-t * 2)
    if kind == "clock":
        p = t % .5
        return (.32 * tone(1700 if int(t * 2) % 2 else 2100, p) + .12 * noise) * math.exp(-p * 95)
    if kind == "drift":
        p = t % .5
        note = [261.63, 329.63, 392, 493.88, 392, 329.63, 293.66, 220][int(t * 2) % 8]
        return .3 * (tone(note, t) + .2 * tone(note * 2, t)) * math.exp(-p * 5) * (1 - math.exp(-p * 80))
    if kind == "riser":
        return .17 * noise * min(t / 3, 1) * (1 if t < 3 else math.exp(-(t - 3) * 9)) + (.23 * tone(1046.5, t) * math.exp(-(t - 3) * 6) if t > 3 else 0)
    return .06 * tone(60, t) + .025 * tone(119.7, t) + .014 * noise


COLORS = ["#233b48", "#82928a", "#d69b4b", "#492e38", "#76808b", "#bb8262", "#6c8370", "#282e36"]
for index, (kind, duration) in enumerate([("pulse", 8), ("air", 8), ("signal", 3), ("impact", 3), ("clock", 6), ("drift", 8), ("riser", 4), ("room", 8)]):
    rng = random.Random(100 + index)
    samples = []
    for frame in range(RATE * duration):
        t = frame / RATE
        fade = min(1, t / .025, (duration - t) / .08)
        samples.append(max(-1, min(1, sound(kind, t, rng) * fade)))
    with wave.open(str(OUTPUT / f"sound-{kind}.wav"), "wb") as audio:
        audio.setparams((1, 2, RATE, 0, "NONE", "not compressed"))
        audio.writeframes(b"".join(struct.pack("<h", round(value * 32767)) for value in samples))
    bars = "".join(f'<rect x="{56 + b * 12}" y="{320 - height}" width="5" height="{height * 2}" rx="2" fill="#f5eee0" opacity=".8"/>' for b in range(44) for height in [12 + 120 * abs(math.sin(b * .23 + index) * math.cos(b * .11))])
    (OUTPUT / f"sound-{kind}.svg").write_text(svg(bars + text(48, 70, "RALPHY / ORIGINAL SOUND", 17) + text(48, 576, kind.upper(), 36), COLORS[index]) + "\n")

print(f"Wrote {len(VISUALS)} reusable SVG components and 8 original WAV sounds to {OUTPUT}")
