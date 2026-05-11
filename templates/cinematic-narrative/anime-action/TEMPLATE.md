# Anime Action — vibe-style template

> Cel-shaded 2D Japanese-animation aesthetic. Limited animation with strategic impact frames, speed lines, dramatic rim lighting, and explosive auras. Covers ten distinct anime registers (shounen, seinen, mecha, magical girl, isekai, slice-of-life, sports, horror, romance-comedy, cyberpunk) — pick one per video, do not mix.

**Slug:** `anime-action` · **Aspect:** 9:16 · **fps:** 24 (anime standard) · **Duration:** 6–15 s · **Clips:** 2–4 · **Reference:** optional (required only for named characters / real franchises).

Stack: `gemini-3-pro` keyframes → `kling-v3.0-pro` i2v (or `veo-3.1` for multi-beat shots) → ElevenLabs VO + Music. `generate_audio: false` on i2v; the music + sting layer is added in composition.

---

## Why this template exists

Anime is not "cartoon animation." It's a deliberate, decades-old visual tradition with rules that read as anime *only when respected together*: cel shading + limited animation + speed lines + dramatic light + intentional color saturation + impact frames. Skip any one and the output reads as generic stylized 3D, not anime. This template encodes those rules so a single brief ("anime fight scene", "magical-girl transformation", "slice-of-life morning") expands into a prompt that actually looks Japanese-animated.

The template is **vibe-style, not vibe-reference**. There is no required upload. A named character (Goku, Naruto, Sailor Moon) flips it to reference-required under AGENTS.md rule #3 — refuse without an uploaded character sheet.

---

## Visual anchors (non-negotiable)

These four are present in every anime-action prompt this template emits. If a generated frame loses any one, the result will not read as anime — regenerate with the missing anchor named explicitly.

1. **Cel shading & flat shadows.** 2D character on a (often watercolor) background. Shadows are *solid blocks of color*, not photorealistic gradients. Edges are defined, not feathered. Hair has individual strand definition with a hard highlight streak.
2. **Limited animation with impact frames.** Characters hold poses 0.5–1.0 s. When motion happens it's decisive: a punch travels in 0.2 s, then an impact frame freezes 0.2–0.4 s with a bright cross-shaped highlight. *Two key frames + speed lines* (smear) replaces smooth interpolation.
3. **Speed lines, not motion blur.** Sharp straight lines radiating from a vanishing point or trailing behind motion. Used for fast movement and for stationary characters radiating contained energy.
4. **Dramatic rim lighting + intentional saturation.** Single or dual key light creates strong outlines (golden = heroic, cyan = cold/mystical, purple = supernatural, white = transcendent). Saturation is genre-coded: 140%+ for shounen action, 60–70% for seinen, 75–80% for slice-of-life, 150%+ for cyberpunk neon.

Supporting anchors that flip on per-genre: **eye design** (large irises, multi-layered highlights, tsurime / tareme shape), **hair physics** (gravity-optional, strand-defined, motion trails), **screen-tone overlays** (halftone or diagonal-line manga pattern flashed for 0.1–0.3 s on emotional beats), **onomatopoeia text** (BOOM / CRASH / WHOOSH on impact).

---

## Variation axes

Pick one position on each axis at scenario time. Mixing positions across axes is fine; mixing positions on the same axis is the "shounen-seinen mash-up" failure mode — commit.

| Axis | Positions |
|---|---|
| Subgenre | shounen action · seinen drama · mecha · magical girl · isekai · slice-of-life · sports · horror · romance-comedy · cyberpunk |
| Energy register | peaceful (slice-of-life) → emotional (drama) → kinetic (sports) → explosive (shounen climax) |
| Saturation | 60–70% (seinen / horror) · 75–85% (slice-of-life / romance) · 100–120% (sports / OP) · 130–150% (shounen / mecha / cyberpunk) |
| Hook type | eye close-up · speed-line burst · transformation flash · blade unsheath · aura explosion · sakura wind · title-card slam · silhouette-on-sky · impact frame · chibi pop · sweat-drop · screen-tone shift |
| Camera | static · dramatic zoom · rotating · Dutch angle · parallax pan · POV slash · whip-pan · low-angle hero · overhead · canted |
| Lighting | golden-hour warm · blue hour cool · neon night · sepia nostalgia · high-contrast shounen · soft romantic · volumetric god-rays |

Full vocabulary lives in `prompt-cookbook.md`. Hooks, with timing, in `hooks.md`.

---

## Narrative arc (default 8–12 s)

```
0:00–0:02  HOOK            — one of the 12 anime hooks, exact timing in hooks.md
0:02–0:05  ESTABLISH       — setting + character pose; limited animation
                             (static body, animated FX: aura pulse, hair float,
                              petals drifting, particles)
0:05–0:08  BEAT            — the action: launch / transformation / weapon raise /
                             chibi reaction / tear / petal gust. Two-key-frame
                             motion bridged by speed lines.
0:08–0:10  IMPACT FRAME    — white flash 0.3 s, cross-highlight, screen shake,
                             ducked-to-silence audio then orchestral/J-rock sting.
0:10–end   RECOVERY/OUTRO  — aftermath pose, dust dissipating, name card,
                             title re-appears, or fade to black.
```

Slice-of-life and emotional drama replace the impact frame with a screen-tone flash + held silence. Mecha replaces it with a shockwave ripple + debris burst. Magical-girl replaces it with a costume-reveal twirl + sparkle expansion. Always one climactic beat per video — don't stack two.

---

## Inputs the template needs from the user

Required:

- **Subgenre** (one of ten — see axis above). If the brief is just "anime", ask once.
- **Core beat** — what happens in the climactic moment. "Hero powers up", "heroine cries on a train platform", "mecha clash", "schoolgirl wakes up", "transformation".

Optional but improves output:

- Character description (gender, hair, eye color, outfit register — sailor uniform, tactical gear, kimono, harem pants, pajamas).
- Setting (valley at sunset, cyberpunk alley in rain, tatami-mat bedroom, train platform at blue hour).
- Color register (warm / cool / neon / pastel / desaturated).
- Music register (orchestral / J-rock / piano / synth / acoustic).
- VO language and one line if a battle cry / monologue is wanted (default: silent).

Required *only when* the brief names a real franchise character or real person — uploaded reference image, otherwise refuse per AGENTS.md rule #3.

---

## When NOT to use this template

- The user wants 3D-CGI realism — use `3d-cgi`.
- The user wants Western cartoon (rounder shapes, softer edges, pastel) — use `cartoon`.
- The user wants live-action martial arts choreography without stylization — use `fight-scenes`.
- The user wants comic-panel-to-video (Western superhero) — use `comic-to-video`.
- A product-demo UGC ad — use `before-after-product` (anime aesthetic on a product reveal almost never converts).
- Any brief that requires lip-synced dialogue — anime via i2v handles silence + impact stings well, but speech sync is a known weak point. Either keep it monologue-narrator with VO over a static pose, or pick a different template.

---

## Companion docs

- `hooks.md` — 12 anime hooks with exact timing, lighting, sound cues, and the genre each fits.
- `prompt-cookbook.md` — master prompt template, full anime camera vocabulary, per-genre visual language, sound design, common mistakes, and 5 worked examples (shounen climax, slice-of-life morning, mecha clash, OP montage, emotional farewell) — distilled to fit our two-model stack.

Read `MODELS.md` before any model call. Read `docs/playbooks/art-director.md` for the prompt-engineering loop.
