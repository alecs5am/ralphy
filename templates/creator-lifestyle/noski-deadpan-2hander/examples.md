# Worked examples — Noski Deadpan 2-Hander

Two end-to-end variant briefs showing how the template generalizes when you swap cast / topic / location. Both keep the same vibe DNA (head-back posture, photoreal Sony A7 IV register, 7-tag voice profile, lofi cafe music bed) but vary the surface to produce a distinctly different piece.

Each example shows the filled-in slot table, the first dialog line, and how the location-master-plate prompt resolves.

---

## Example A — Source-project canonical (`noski-people-001`)

**Brief:** Imitate @americanbaron's *"Do more things exist or not exist?"* — two-people deadpan-philosophical TikTok 2-hander on the topic of socks vs. people getting lost. English target audience.

### Slot fills

| Slot | Value |
|---|---|
| `{{character_a}}` | Black man, late 20s, shoulder-length thin natural locs, thin gold wire-rim eyeglasses sitting low on his nose, chocolate-brown merino turtleneck, small silver pinky ring on right hand |
| `{{character_a_voice}}` | Black man, late 20s, soft warm baritone voice with slight gravel, deadpan philosophical delivery, neutral American accent, quiet contemplative volume, almost-whispered register |
| `{{character_b}}` | Freckled red-haired young woman, mid-20s, lavender-tipped copper-red hair, slight overbite, cream-and-mustard cable-knit cardigan over white t-shirt, no makeup, dense freckles across cheeks/nose/eyelids |
| `{{character_b_voice}}` | Young pale white woman, mid-20s, soft contralto voice, slight breathy quality, deadpan philosophical delivery, neutral American accent, slight overbite affecting sibilants, quiet contemplative volume, almost-whispered register |
| `{{location_master_plate}}` | Low wide cream boucle modular three-seat couch with one continuous low back-cushion ridge, dusty-pink matte wall, vintage Persian rug in faded reds and rust-blues on light wood floor, dark walnut mid-century sideboard with handmade matte stoneware ceramic vessels + dried bouquet of lagurus and cotton branch, opal-glass globe ceiling pendant lamp visible at top edge of frame, soft north-window daylight entering from camera-left |
| `{{target_language}}` | English |
| `{{topic_seed}}` | Socks or people — what gets lost more often? |
| `{{reference_style_handle}}` | @americanbaron — "Do more things exist or not exist?" |

### First dialog line (Speaker B opens)

> "Socks or people — what gets lost more often?"

### Outcome

73.9s final mp4 with 32 micro-scenes, lofi cafe music bed at -22 LUFS, 1 ToS-rejected music attempt → 1 successful, user-rated 8/10. Total cost $23.15. See `workspace/projects/noski-people-001/postmortem/02-lessons.md` for the full lessons-learned doc that drove this template.

---

## Example B — Variant: doors and memories, indoor library

**Brief:** Deadpan 2-hander in the same register but with a different cast pair, a different location (cosy library / reading room instead of a living room), and a different philosophical seed about doors. English target audience. Aiming for ~60s / 24 micro-scenes (shorter than the source project).

### Slot fills

| Slot | Value |
|---|---|
| `{{character_a}}` | South-Asian woman, early 30s, shoulder-length wavy black hair tucked behind one ear, round tortoiseshell glasses, oversized cream cardigan over a slate-grey turtleneck, small jade ring on left index finger, one barely-visible scar above the right eyebrow |
| `{{character_a_voice}}` | South-Asian woman, early 30s, mid-pitch alto voice with a touch of dryness, deadpan philosophical delivery, neutral British accent (light RP, not posh), quiet contemplative volume, almost-whispered register |
| `{{character_b}}` | Older white man, late 40s, salt-and-pepper short-cropped hair with a receding hairline, three-day stubble, faded charcoal cardigan over an oxford shirt, tortoiseshell reading glasses pushed up on his forehead, leather banded watch on left wrist |
| `{{character_b_voice}}` | White man, late 40s, low baritone voice with smoke-tinted gravel, deadpan philosophical delivery, neutral American accent (mid-atlantic, no regional tilt), quiet contemplative volume, almost-whispered register |
| `{{location_master_plate}}` | Low wide oxblood-leather two-seat chesterfield sofa with one continuous low back-cushion ridge, deep-green book-lined wall behind, worn Persian runner in faded blues and ochres on dark hardwood floor, tall reading lamp with brass base and parchment shade at frame-right, brass library-style ladder partially visible at frame-left, soft west-window late-afternoon light entering from camera-left, dust motes drifting in the beam |
| `{{target_language}}` | English |
| `{{topic_seed}}` | Doors or memories — which close more silently? |
| `{{reference_style_handle}}` | @americanbaron (style reference, not literal imitation) |

### First dialog line (Speaker A opens, this time)

> "Doors or memories — which close more silently?"

### Notes on what changes vs Example A

- **Cast:** older mixed pair instead of young mixed pair. Voice profiles still 7-tag but the texture descriptors shift (dryness, smoke-tinted gravel) — vibe stays deadpan, register stays almost-whispered.
- **Location:** chesterfield + bookshelves instead of boucle couch + dusty-pink wall. The "one continuous low back-cushion ridge" rule still holds — chesterfield has a single tufted back-cushion that reads as a ridge.
- **Lighting:** late-afternoon west-window instead of north-window. Slightly warmer grade overall. Add dust motes in the beam for additional atmosphere; can also become a `detail-dust-motes` cutaway.
- **Scene count:** 24 instead of 32 — tighter, ~50s total. Drop some of the silent-cutaway scenes from the source project's shape. Keep the merged two-speaker top-down finale.
- **Music:** same lofi cafe bed at 65 BPM / -22 LUFS — works equally well for library register.
- **Cost projection:** ~$15-18 (fewer Kling clips, slightly fewer scene anchors).

### What stays literal across both examples

These are the template's DNA — do NOT slot-substitute these:

- "head tipped back resting on the cushion-back ridge"
- "Sony A7 IV with Sigma 35mm / 50mm / 85mm at f/1.4 - f/3.5"
- "Kodak Portra 400 film-grain emulation, slightly desaturated cool-warm grade"
- "Hyperreal, photoreal, not glossy. Naturalistic, candid, not staged."
- "Static camera, no zoom, no pan, no dolly, no movement"
- The 7-tag voice profile structure (gender, age, tone, texture, register, accent, volume, quirks)
- "Same voice as earlier scenes." anchor in every Kling dialog prompt
- The sevenfold music ban in every Kling prompt
- Lofi cafe music bed at 65 BPM, -22 LUFS, instrumental
- 50ms audio fade in/out on every clip before ffmpeg concat

If you find yourself slot-substituting any of these — stop. You're diluting the template into a generic "2-hander" template that doesn't reproduce the deadpan register.
