---
name: vox-collage
namespace: user
description: >-
  How to turn ONE topic into a Vox-style paper-collage explainer / ad video — a punchy narrated short where each beat is a torn-paper collage POSTER that comes alive, with VO, music and captions. A craft overlay on the standard pipeline: the look is BORN in the image (a rich layered collage poster per beat — text-to-image, 5-part prompt structure, headline baked in), then a FLAT-SAFE "living poster" motion pass animates it, then hard-cut assembly. Supplies the one mandatory beat-map approval gate, the density rule (6+ separate cut-out pieces filling the frame, NOT one sticker on a plain bg), the flat-safe i2v constraint set (ONE smooth 2D camera move, ~5% amplitude, stability anchors on text/layout, banned warp moves) that is WHY seedance works for flat art, and anti-monotony hard cuts (adjacent beats never share a camera move; static reserved for the payoff). Works for ANY topic / product / person + ANY era-matched aesthetic. Ported from vox-director by Alisa Qian.
  USE WHEN the user asks for a "vox video", "collage explainer", "paper-collage animation", "motion collage", "sticker explainer", "make a collage ad", "torn-paper animated explainer", "scrapbook-style tribute", or wants to turn a topic / product / person into a punchy narrated collage video — even if they don't say "Vox".
  This is a niche SKILL (generalized craft overlay), not a remix TEMPLATE. For "remix this exact collage video but swap X", use the remix path in docs/skills-vs-templates.md.
---

## Trigger

**FIRES** on a generic paper-collage motion-video brief: "make a vox-style video about X", "turn this topic into a collage explainer", "motion collage ad for our product", "sticker-collage explainer", "torn-paper animated short", "scrapbook tribute to <person>". Any subject — the skill is subject-agnostic.

**DO NOT FIRE** when:
- The brief is for static multi-slide stills (a swipe-through deck) → use [`/carousel`](../carousel/SKILL.md).
- The brief is for ONE still (poster / key art) → use [`/poster`](../poster/SKILL.md).
- The brief is a creepy PSA / VHS warning → use [`/analog-horror-psa`](../analog-horror-psa/SKILL.md).
- The user points at one specific collage video to reproduce → that is the **remix path**. See [`docs/skills-vs-templates.md`](../../../docs/skills-vs-templates.md).

## What this skill is

A generalized craft overlay that adapts the vox-director METHOD to OUR stack. It does not name a topic, a person, or an aesthetic — it tells the art-director + editor HOW a paper-collage motion video is built so a strong one comes out for whatever the user is pushing. Every model call routes **through `ralphy generate` / `ralphy render`** (AGENTS.md invariants #1, #2) — no provider API, no Atlas Cloud plumbing, no ad-hoc curl/ffmpeg for the paid steps.

**The one idea to internalize:** the collage LOOK and the collage MOTION are two different steps.
1. **The look is born in the IMAGE step.** Each beat is a finished collage *poster* made by a text-to-image model. All the collage DNA (torn paper, cut-outs, halftone, bold flat color, baked headline) lives in that poster. If the image is not a rich, dense collage, nothing downstream saves it.
2. **The motion is added after.** A flat-safe i2v pass animates the whole poster ("living poster"). The constraint set is what makes a video model animate flat art without warping it.

Before writing ANY image or motion prompt, read the two references — they are the whole craft:
- [`references/prompt-guide.md`](references/prompt-guide.md) — the LOOK layer (image + motion prompt structures, the vocabulary banks, the era-matched theme presets).
- [`references/beat-layer.md`](references/beat-layer.md) — the STORY layer (narrative arcs, hook patterns, beat counts, the hard-constrained flat-safe camera-move vocab).

## Hard invariants

- **All generation routes through `ralphy` verbs.** `ralphy generate image|video|voiceover|music|captions` and `ralphy render`. No provider API, no `curl`, no ad-hoc `ffmpeg` for a paid step. Read `MODELS.md` before naming any model id — training memory is stale.
- **The beat map is the ONE mandatory approval gate.** Draft `beats.json` (arc + per-beat scene/headline/motion), show it in chat, get "go" BEFORE any paid generation. Everything downstream flows from it.
- **Density is a HARD requirement in the image prompt.** A single sticker on a plain background reads EMPTY and dead. See "The density rule" — 6+ separate layered cut-out pieces filling the negative space, or the beat fails.
- **Motion is flat-safe or it warps.** ONE continuous 2D camera move (`push_in`/`pan`/`tilt`/`parallax` = uniform scale/translate ONLY), ~5% amplitude, stability anchors on ALL text/seal/layout, dimensional lock, plus a negative prompt. BANNED (they bend flat art): `orbit`, `dolly_zoom`, `roll`, `whip`, `crane`, handheld, fast/snap zoom. This constraint is WHY `bytedance/seedance-2.0` works for this style.
- **Assembly is HARD CUTS.** No crossfades between beats (a collage crossfade reads as mush). Explosive entrances; adjacent beats never share a camera move; `static` is reserved for the payoff beat.
- **Reference-required gate (#3).** Fires when a beat's subject is a named real person / branded product / recognizable IP — attach a ref or refuse with a concrete ask. A generic topic / no-name product proceeds without a ref.
- **Real people / brand logos in the MOTION step:** `seedance-2.0` (and veo) block photoreal-human and celebrity anchors (see MEMORY.md). Route those beats' i2v to `kwaivgi/kling-v3.0-pro` instead. Generating the poster is fine; only the animate step is filtered.
- **Append-only on regen.** Re-rolling a poster / clip writes `.v2`, never overwrites (AGENTS.md #14). The quality gate refuses, not warns — two failed `scoreImage`/`scoreVideo` in a row → stop and report options.

## The niche, in one paragraph

A Vox collage lives or dies on **density in the poster** + **flat-safe motion** + **hard-cut rhythm**. Each beat's poster must be a genuinely layered, hand-assembled collage — a hero cut-out plus props, figures, torn text strips, geometric scraps, washi tape, and halftone fields that fill the negative space so the frame feels FULL. The style block is reused verbatim across every beat (that is what makes 6 different beats feel like one film); only the scene, the one bold flat bg color, and the baked headline change. The motion pass then adds subtle layered parallax without touching the baked text. The cut is hard between beats, and no two adjacent beats move the same way.

## The fixed workflow (do not restructure — only fill the slots)

| Step | What it does | Output | ralphy verb |
|---|---|---|---|
| 1. Topic → **beat map** | Read `references/beat-layer.md`; pick an `arc`, write per-beat scene + ≤3s-hook headline + `camera_move` (varied) + rich `element_motion`; split each beat into wide+detail shots | `beats.json` + user "go" (the gate) | — (author + `ralphy project log-prompt`) |
| 2. Pick the aesthetic | Read `references/prompt-guide.md` §5; suggest 3-4 era-matched theme presets (or compose one). Optional cheap bake-off: render one beat per preset, user picks by eye | chosen `theme` in `beats.json` | `ralphy generate image` (bake-off) |
| 3. **Posters** (the look) | One dense collage poster per beat/shot, 5-part prompt, headline baked in. VERIFY each looks like a real layered collage before animating (re-roll is cheap here) | `artifacts/images/<beat>-<shot>.png` | `ralphy generate image` |
| 4. **Motion** (flat-safe) | Animate each poster with the constrained i2v prompt. First frame = the poster | `artifacts/videos/<beat>-<shot>.mp4` | `ralphy generate video --first-frame` |
| 5. VO + music | One consistent narrator + instrumental bed (music banned inside the video; separate pass per MEMORY.md) | `artifacts/voiceover/*.mp3`, `artifacts/music/*.mp3` | `ralphy generate voiceover` / `ralphy generate music` |
| 6. Captions | Scribe-synced kinetic captions — scribe the stitched VO first, snap timings to word-level `startMs` (AGENTS.md #16) | `artifacts/captions/*` | `ralphy generate captions` |
| 7. **Assemble** (hard cuts) | Opacity-gated HyperFrames multi-scene (or ffmpeg concat), hard cuts, VO ducked under music, burn captions | `render/final.mp4` | `ralphy render` |

The beat-map gate is the hard checkpoint: catching a weak arc / hook here costs nothing; catching it after a full poster+motion set burns real money.

## Model mapping (ralphy stack — verify against MODELS.md)

The original ran on Atlas Cloud model ids. On OUR stack the equivalents are:

| Job | vox-director (Atlas) | **ralphy verb + model** | Note |
|---|---|---|---|
| Keyframe / collage poster | `google/nano-banana-2/text-to-image` | `ralphy generate image --model google/gemini-3-pro-image-preview` | nano-banana-pro lineage — closest match; renders EN headline text well + rich collage. **Default.** |
| Poster with perfect headline typography | (same) | `ralphy generate image --model openai/gpt-5.4-image-2` | **Fallback** when the baked wood-type headline must be pixel-crisp / perfectly spelled. |
| Animate (living poster, non-real content) | `google/gemini-omni-flash/image-to-video` | `ralphy generate video --model bytedance/seedance-2.0 --first-frame <poster>` | with the flat-safe constrained prompt below. Craft overlay: [`/seedance-prompts`](../seedance-prompts/SKILL.md). |
| Animate (real people / brand logos) | `kwaivgi/kling-video-o3-pro/image-to-video` | `ralphy generate video --model kwaivgi/kling-v3.0-pro --first-frame <poster>` | seedance/veo block photoreal-human + celebrity anchors (MEMORY.md); kling is the route. |
| Narration | `xai/tts-v1` | `ralphy generate voiceover` | ElevenLabs; one consistent narrator. Design 2-3 voice previews + let the user pick (MEMORY.md). |
| Music | `minimax/music-2.6` | `ralphy generate music` | Instrumental, no vocals, no named-artist references (ToS). Separate overlay pass — never baked into the video. |
| Assembly / captions | local ffmpeg | `ralphy render` (HyperFrames) + `ralphy generate captions` | hard cuts; opacity-gated multi-scene composition. |

## The validated recipe (proven in `bitacora-firstbug-001`)

These three rules are what made seedance produce a real living collage rather than a warped mess. Encode them verbatim.

### DENSITY comes from the IMAGE prompt

The 5-part structure from `references/prompt-guide.md` §1, with the density made explicit:

1. **STYLE block — identical on every beat.** `Mixed-media hand-cut PAPER COLLAGE, editorial zine style, <era idiom>. Torn/scissor-cut paper edges, tape corners, heavy halftone Ben-Day dots, newspaper clippings, paper-stencil shapes, real paper drop shadows. Figures are PRINTED-texture cut-outs of real archival imagery, NOT CGI, NOT a 3D render — keep print grain, misregistration, paper imperfections. High-contrast, tactile, hand-assembled. Limited bold flat palette: <2-3 named hexes>.`
2. **SCENE as 6+ SEPARATE layered cut-out pieces**, each with clean torn edges + its own drop shadow, in distinct depth layers: a **hero** cut-out dead center + **props** + a **figure/hand** + a **torn text strip** + **geometric scraps** (triangles / circles / zigzag bolts / starburst) + **washi tape corners** + **dense halftone dot fields filling the negative space so the frame feels full and rich**. *A single sticker on a plain background reads EMPTY — this line is the difference between a real collage and a dead frame.*
3. **BACKGROUND — one bold flat color** (`On a bold flat <color> paper background.`).
4. **HEADLINE — baked in, torn-paper wood-type, in "quotes"** + a small subtitle strip + a red seal accent. `A torn-paper banner with a big bold cut-out wood-type slab headline "<TITLE>" ... keep the headline crisp and legible.`
5. **TECH** — `Aspect ratio 9:16, 2k resolution.`

Reuse blocks 1 + 5 verbatim across beats; vary only 2 (scene), 3 (bg color), 4 (headline).

### MOTION is flat-safe

The constrained i2v prompt (from `references/prompt-guide.md` §2). Fill `<>`; keep every guard:

```
Animate this still into a mixed-media paper-collage MOTION GRAPHIC. Keep it flat 2D paper, NOT 3D, no photoreal render.

CAMERA: one single smooth continuous <push_in | pan | tilt | parallax>, subtle amplitude only (~5%).
MOVEMENT: the layered paper cut-outs drift gently with visible drop-shadow parallax at different depths — foreground scraps and washi tape move a little more than the background; halftone dot fields shimmer/pulse subtly; torn edges and tape corners flutter; <the hero element> sways slightly; geometric scraps bob and settle on a gentle beat; a breathing, hand-assembled scrapbook quality.
AESTHETIC: preserve the torn-paper, tape, halftone Ben-Day dots, newspaper-clipping and paper-stencil textures exactly; keep the bold flat <bg> background and the print grain.
FEEL: <emotional tone of this beat>.
COLOR: <this beat's palette>, high contrast, stable grade.

STABILITY: keep the layout, the seal, and ALL on-screen text perfectly sharp, legible and stable — do NOT redraw, distort, warp or move the lettering. Flat 2D, camera parallel to the poster, no 3D rotation, no perspective change; paper layers parallax only, elements slide and pivot as rigid flat paper, do not bend or morph. No new objects appear. ONE smooth continuous move — no sudden zoom snaps, no jump-cuts, no teleporting or re-framing inside the shot. Single continuous shot; the motion eases in and settles.

Negative prompt: 3D render, CGI, perspective distortion, warping paper, morphing, text wobble, jump cut, sudden zoom, camera shake, new elements appearing, blurry text.
```

- **BANNED camera moves** (they warp flat art): `orbit`, `dolly_zoom`, `roll`, `whip`, `crane`, `handheld`, `fast_zoom`. If you want a dolly's *feel*, use a 2D `push_in` — it scales the whole poster (text included) as one piece and never warps.
- **Amplitude is THE anti-morph lever.** Keep it `~5%` / `very subtle`. Big amplitude near baked text = wobble/morph.
- **Describe motion, not the picture.** The still already carries subject/scene/text/style; restating them makes the model re-synthesize and warp them.

### ASSEMBLY is hard cuts + anti-monotony

- **Hard cuts between beats**, explosive entrances — no crossfades (a collage dissolve reads as mush).
- **Adjacent beats never share a camera move**; alternate families (scale ↔ translate ↔ static). Reserve `static` for the payoff / quote beat so the motion drop signals "this is the point." (The reference `money-60s` failed by using push-in on all 12 shots.)
- **~6-8 beats for 30s, ~10-12 for 60s; cut every 3-5s; never hold a static poster >7s.** Split each beat into a wide (establishing, headline) + detail (cut-in, no headline) shot so the visual cuts mid-narration.

## Aspect ratio

- Social / TikTok / Reels / Shorts default → `--aspect 9:16`.
- YouTube / landscape explainer → `--aspect 16:9`.
- Square feed post → `--aspect 1:1`.

The poster aspect and the i2v aspect must match; bake `Aspect ratio <a>` into the image prompt's TECH block AND pass `--aspect` on `ralphy generate image`.

## CLI cookbook

```bash
# Step 1 — author beats.json + log the brief, then STOP for the beat-map approval gate.
ralphy project log-prompt --project <id> --stage "beat-map" --text "<the arc + beat headlines>"

# Step 3 — posters (one dense collage per beat). Default gemini; gpt-image for perfect headlines.
ralphy generate image --project <id> --slot beat-01-wide \
  --model google/gemini-3-pro-image-preview --aspect 9:16 \
  --prompt-file prompts/beat-01-wide.txt
# Verify it's a real layered collage before animating (re-roll is cheap here, not after motion).

# Step 4 — flat-safe motion. First frame = the poster. seedance for non-real content.
ralphy generate video --project <id> --slot beat-01-wide-vid \
  --model bytedance/seedance-2.0 --first-frame artifacts/images/beat-01-wide.png \
  --prompt-file prompts/beat-01-motion.txt
# Real people / brand logos in the beat → swap the model:
ralphy generate video --project <id> --slot beat-04-wide-vid \
  --model kwaivgi/kling-v3.0-pro --first-frame artifacts/images/beat-04-wide.png \
  --prompt-file prompts/beat-04-motion.txt

# Step 5 — one consistent narrator + a separate instrumental music bed.
ralphy generate voiceover --project <id> --slot vo-full --text-file VO_SCRIPT.md
ralphy generate music --project <id> --slot music-bed \
  --prompt "upbeat instrumental retro-futuristic electronic, no vocals"

# Step 6 — scribe-synced captions (snap to word-level startMs, AGENTS.md #16).
ralphy generate captions --project <id> --slot captions

# Step 7 — opacity-gated HyperFrames assembly, hard cuts, then render.
ralphy render <id>
```

Poster gen is ~$0.02-0.08 each; seedance i2v is the cost driver — verify every poster reads as a dense collage BEFORE spending on motion.

## Failure modes

- **One sticker on a plain bg.** Reads empty/dead. Prevention: the density rule — 6+ separate cut-out pieces + halftone fields filling the negative space.
- **Warped / morphing paper, wobbling text.** Prevention: the flat-safe constraint set — ONE 2D move, ~5% amplitude, stability anchors, dimensional lock, negative prompt. Never a banned camera move on a text beat.
- **Seedance refuses a real-person / logo anchor.** Route that beat's i2v to `kwaivgi/kling-v3.0-pro`; the poster generation is unaffected.
- **Every beat uses the same camera move (monotony).** The single biggest quality leak. Prevention: alternate move families across adjacent beats; static only on the payoff.
- **Crossfades between beats.** Collage dissolves read as mush. Prevention: hard cuts, explosive entrances.
- **Baking music into the i2v.** Kling/seedance music drifts and fights the ElevenLabs bed. Prevention: ban music in the motion prompt; add it as a separate `ralphy generate music` overlay (MEMORY.md).

## Attribution & license

This skill **ports the METHOD** of the open-source **vox-director** skill:

- **Original author:** Alisa Qian.
- **Source:** https://github.com/Alisa0808/vox-director
- **License:** MIT — Copyright (c) 2026 Atlas Cloud.

The creative engine — the 5-part collage image-prompt structure, the flat-safe motion-prompt structure, the narrative-arc / beat / shot library, and the era-matched theme presets — is Alisa Qian's work, reproduced here with gratitude. `references/prompt-guide.md` and `references/beat-layer.md` are **ported verbatim** (with an attribution header prepended to each) under the MIT license, which permits use, modification, and distribution provided the copyright notice and permission notice are retained (satisfied by this section + the per-file headers).

**What was NOT ported (deliberately):** the Atlas Cloud plumbing — `atlas_cloud.py`, `provider.py`, all `ATLASCLOUD_API_KEY` / provider-host calls, and the executable `scripts/*.py`. That plumbing is replaced by ralphy verbs to honor AGENTS.md invariants #1 (only registered connectors hold keys / hit provider hosts) and #2 (`ralphy` is the only entry-point for model calls). This is an adaptation of the creative method to the ralphy stack, not a fork of the runtime.

## See also

- [`references/prompt-guide.md`](references/prompt-guide.md) — the LOOK layer (image + motion prompt structures, vocab banks, theme presets).
- [`references/beat-layer.md`](references/beat-layer.md) — the STORY layer (arcs, hooks, beat counts, flat-safe camera vocab).
- [`docs/skills-vs-templates.md`](../../../docs/skills-vs-templates.md) — why this is a craft-overlay skill, not a template.
- [`.agents/skills/art-director/SKILL.md`](../../../.agents/skills/art-director/SKILL.md) — model picks, ref-anchor flow, prompt cookbook.
- [`.agents/skills/editor/SKILL.md`](../../../.agents/skills/editor/SKILL.md) + [`/hyperframes`](../hyperframes/SKILL.md) — opacity-gated multi-scene assembly, hard cuts, captions.
- [`/seedance-prompts`](../seedance-prompts/SKILL.md) — seedance i2v prompt craft for the motion step.
- `MODELS.md` — read before naming any model id. `MEMORY.md` — seedance filters, kling routes, ElevenLabs-no-artist-names, music-as-separate-pass.
- Reference project: `.ralphy/workspaces/bitacora/projects/bitacora-firstbug-001/` — where the density + flat-safe-motion recipe was validated.
