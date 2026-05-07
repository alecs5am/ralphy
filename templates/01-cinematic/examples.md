# Cinematic Examples — Quick Index + Platform Variants

Five full-length, copy-paste-ready prompts live in `prompt-cookbook.md` (Examples A-E). This file indexes them and adds three platform-adapted variants for vertical / mobile-first deployment.

## Index of full prompts (in `prompt-cookbook.md`)

| # | Title | Length | Aspect | Mood | Hook | Camera spine | Lighting | Grade |
|---|---|---|---|---|---|---|---|---|
| A | Noir detective interior | 10s | 16:9 | mystery, danger | black-to-blue-burst | dolly forward 1.5 ft/s | chiaroscuro | bleach bypass |
| B | Epic golden-hour landscape | 15s | 16:9 | awe, majesty | macro-droplet to wide | crane descend 200ft to 20ft | golden hour + volumetric | golden warm |
| C | Intimate dialogue close-up | 10s | 16:9 | vulnerability | eyes-snap-open | push-in 6 in | soft three-point warm | warm intimate |
| D | High-energy chase | 8s | 16:9 | adrenaline | silent-then-kick-drum | gimbal track 3.5-5 ft/s | harsh midday + parallax | teal-orange action |
| E | Hands across a table | 12s | 16:9 | love, goodbye | extreme-macro hands | push-in 12 in | three-point lamplight | warm intimate, vignetted |

## Picking a recipe

- **Branded product cameo in a generic scene** → A or E. (Add reference image of product per AGENTS.md rule #3.)
- **Travel / nature / scenic** → B.
- **Founder story / emotional pitch** → C.
- **Sports / action / kinetic product** → D.
- **Couple / relationship / event-recap** → E.

Don't have a recipe that fits? Build from `prompt-cookbook.md` master scaffold + one move from each variation axis in `template.json`.

## Platform variants

The cookbook examples are 16:9 widescreen. To deploy on vertical platforms, append a platform block. Three drop-in variants below.

### Variant 1: TikTok 9:16 vertical adaptation

Append after `[CAMERA]` block:

```
[PLATFORM ADAPTATION — TikTok 9:16]
Aspect ratio: 9:16 portrait, 1080x1920. Vertical safe-zone: action
occupies center 70% of frame (top 10% and bottom 20% reserved for
TikTok UI). Hook compresses to 0-0.8s window (TikTok scroll is more
aggressive than 16:9 platforms). Camera velocity bumped 25%: replace
"2 ft/s dolly" with "2.5 ft/s." Quick cuts every 1.5s minimum.
Optional: one trending-audio downbeat at the hook moment, music bed
otherwise.
```

### Variant 2: Instagram Reels 9:16 aesthetic-first

Append after `[GRADE]` block:

```
[PLATFORM ADAPTATION — Instagram Reels 9:16]
Aspect ratio: 9:16 vertical, 1080x1920. Duration: 25-35s preferred
(Reels rewards longer-form). Aesthetic-first: prioritize sophisticated
grade and motivated lighting over speed. Pacing softer: 3-3.5 ft/s
camera (not 4+). Safe-zone: action within center 85% of frame. Music:
trending OR original high-quality, at -1dB (more present than on 16:9).
Visual must be stunning at 1.5s mark — Instagram users scroll on
visuals, not audio.
```

### Variant 3: LinkedIn 16:9 professional adaptation

Append at end of prompt:

```
[PLATFORM ADAPTATION — LinkedIn 16:9]
Aspect ratio: 16:9, 1920x1080. Duration: 15-20s. Pacing deliberate:
2.5-3 ft/s camera maximum. Tone professional, aspirational. NO trending
audio. Original score / VO essential — 50% of LinkedIn watchers have
audio off, so VO + caption hardcode mandatory. Color grade: corporate
trust palette (blues / golds / neutrals) or company brand colors.
Hook still required at 0-2s, but softer (no kick drum drop, no extreme
macro shock — eyes-open or rack-focus work better here).
```

## Reference-image patterns (when used)

Cinematic style does NOT require a reference, but one optional movie-still reference can lock palette + lighting. Useful patterns:

- **Single mood board still** (one frame from a film with the desired palette + lighting setup): pin teal-orange grade, golden hour direction, or chiaroscuro ratios.
- **Composition reference** (a cinematography frame showing framing / depth-of-field / leading lines): pin compositional rules without copying subject matter.
- **Color-grade-only reference** (a bleached or split-toned still): pin grade, leave everything else generated.

Phrasing in the prompt:

```
Reference image: establish [palette / lighting / composition] from this
frame. Match [color temperature / shadow ratio / focal-length feel /
grain density]. DO NOT copy subject, character, or branded elements
from reference.
```

The "DO NOT copy" line matters — gemini-3-pro will pull subject likeness from references unless explicitly told to hold off.

## Build your own (5-minute recipe)

1. Pick **mood** from the variation axis (noir / epic / intimate / dystopian / nostalgic / awe).
2. Pick **hook** from `hooks.md` (or stack 2-3).
3. Pick **camera move** from cookbook table.
4. Pick **lighting setup** from cookbook table.
5. Pick **grade** from cookbook table.
6. Fill the master scaffold from cookbook with concrete numbers (focal length, ft/s, color temp, dB).
7. Add platform block if vertical.
8. Run.

Iteration is cheap. The first generation almost always misses one axis (lighting too flat, camera too slow, grade too neutral). Re-prompt with the corrected axis pinned harder and re-run.
