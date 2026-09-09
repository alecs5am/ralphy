---
name: ugc-rockstar
namespace: user
description: >-
  How to make a GTA-V-style video in the Rockstar-crime-cinema aesthetic — generalized niche-style know-how, concept to camera-ready. A style overlay on the standard pipeline: supplies the visual DNA (teal-and-orange grade, golden-hour Los-Santos light, low-angle power shots, slow-push establishing, helicopter pull-backs), the satirical double-register tone, the location→character→conflict→theme scene logic, and the shot-list shape. Works for any premise — a fake-brand ad, a heist beat, a street skit, a short film.
  USE WHEN the user wants a GTA-V / Rockstar / Los-Santos / open-world-crime-cinema look, "make it feel like GTA", a satirical fake-brand ad in that register, or a Vinewood/heist-style short, with no specific existing video to reproduce.
  This is a niche-style SKILL (generalized), not a remix TEMPLATE. It is an original aesthetic homage — it does not impersonate real living people or reproduce a specific copyrighted scene.
---

## Trigger

**FIRES** on: "GTA-style video", "make it feel like GTA V / Los Santos", "Rockstar aesthetic", "Vinewood crime short", "satirical fake-brand ad like the GTA radio", "heist-cinema look".

**DO NOT FIRE** when:
- The user points at one specific GTA-style video to reproduce → **remix path** (`ralphy template use <slug>`).
- The brief is a different aesthetic (analog horror, cinematic-narrative, clean UGC) → match that niche.

## What this skill is

A generalized **style** overlay, not a finished video. It tells the scenarist and art-director HOW the Rockstar register reads so they produce a strong one for whatever premise the user brings. Runs through the normal pipeline and all gates.

## Hard invariants

- **Provider invariants stand.** All generation via `ralphy generate`; renders via `ralphy render <id>`. No Higgsfield / Runway / raw API — those appear in the source draft and are NOT our stack. Read `MODELS.md` for the current i2v / image ids.
- **Original homage, not impersonation.** Build the *aesthetic* and *satirical world* — do not impersonate a real living person, and do not reproduce a specific copyrighted GTA mission/scene shot-for-shot. Fake brands and invented characters are the point.
- **Music is a separate ElevenLabs pass** with no artist/producer names (`MEMORY.md`) — describe the register (West-Coast hip-hop bed, cinematic tension score) by genre + instrumentation only. Ban music in the Kling prompt; overlay in the editor.

## The GTA-V visual DNA (internalize before any output)

- **Cinematic identity:** late-2000s LA crime cinema (Mann / Scott / Fincher) filtered through satire. Hyperreal, slightly oversaturated, always slightly dangerous.
- **Light:** golden hour by default; even night is hot, neon-soaked.
- **Camera:** low angles for power, eye-level for vulnerability; slow-push establishing (wide, then creep in); rack focus on dialogue (bokeh'd luxury or grim urban texture behind a sharp face); the helicopter aerial pull-back (city as context for chaos).
- **Grade:** teal-and-orange pushed further — teal/cyan shadows, amber/gold highlights, skin popping orange.
- **Tone — the double register:** simultaneously funny AND real AND slightly dangerous. Never just funny, never just violent. A billboard, a radio line, or a fake brand in the background that comments on the world.
- **Specificity:** not "a luxury car" but "a Benefactor-style sedan in the hills, 7pm warm light"; not "a criminal" but "a man in a tracksuit outside an ammo store". The environment talks.
- **Scene logic (the four levels):** location → establishes character → creates conflict → reveals something about power/money, and through that, something universal. A chase isn't about the chase; it's about who owns the street.

## Pipeline (enter at any stage)

1. **Concept brief** — title, logline, tone register (satirical ad / mission / short film / skit), characters, visual reference beats, runtime, platform.
2. **Script** — scene blocks: INT/EXT + invented location + time, action staging, dialogue in voice, one line of camera/lighting per scene.
3. **Shot list** — per shot: type (wide/medium/close/aerial/POV), subject, movement (static / dolly-in / pan / handheld / drone pull-back), duration, lighting/focus note.
4. **Prompts** — per shot, build the `ralphy generate` prompt: subject + action + invented environment + camera move + golden-hour light + the teal-orange grade as the style anchor. Fold the anti-AI-slop register in for any human shot (`MEMORY.md`).
5. **Direction** — grade, music register (separate ElevenLabs pass), pacing ("silence before violence" — build tension through quiet), editing rhythm.

## Default model stack (verify against MODELS.md)

- **Keyframes:** `google/gemini-3-pro-image-preview` (premium typography for fake-brand billboards / on-screen text: `openai/gpt-5.4-image-2`).
- **i2v:** `kwaivgi/kling-v3.0-pro` for default cinematic motion; `bytedance/seedance-2.0` for non-default physics (vehicle stunts, falls, chaotic action — per `MEMORY.md` VG model picks).
- **VO / music:** ElevenLabs; music a separate post-mix pass.

## Workflow

1. **Intake** + announce: "GTA-V register — using the Rockstar skill." Pick the entry stage from what the user already has (concept / script / shots).
2. Produce the brief → script → shot list, getting a "go" at the storyboard lock.
3. Generate anchors one beat at a time with checkpoints, then i2v, then VO + music post-mix + captions, then `ralphy render <id>`.
4. **Hand off** to `/evaluator`.

## Cookbook

- "Make a satirical GTA-style ad for a fake energy drink" → invent the brand + billboard, golden-hour hills, teal-orange grade, double-register VO. Match this skill, run the pipeline.
- "A Vinewood-at-night heist intro" → low-angle power shots, neon glow, silence-before-violence pacing.
- "Make it look exactly like that one GTA clip" with a link → remix path, not this skill.

## Reference files (read on demand)

Deeper craft lives in `references/` next to this skill — read the relevant one before producing that output type:

| File | When to read |
|---|---|
| `references/video-prompts.md` | Building the per-shot `ralphy generate` prompts — style anchors, image + i2v templates, GTA location vocabulary, character archetypes. |
| `references/cinematography.md` | Shot patterns, camera moves, the teal-orange grade spec, editing rhythm. |
| `references/characters.md` | Character-voice profiles + visual archetype design. |
| `references/satire.md` | Fake brands, billboard copy, radio lines — the environmental layer. |
| `references/techniques.md` | Production techniques and continuity rules. |
| `references/examples.md` | Full worked examples — briefs, shot lists, prompts. |
| `references/troubleshooting.md` | Fixing output that doesn't read as GTA V. |

All model/tool names in those files have been normalized to the Ralphy stack (`ralphy generate`, kling-v3.0-pro / seedance-2.0) — if you spot a stray foreign tool name, treat the Ralphy stack as authoritative.

## See also

- [`docs/skills-vs-templates.md`](../../../docs/skills-vs-templates.md) — niche-style skill vs remix template.
- `MEMORY.md` — anti-ai-slop, VG model picks (kling vs seedance), ElevenLabs no-artist-names.
- [`MODELS.md`](../../../MODELS.md) — current image / i2v model ids.
