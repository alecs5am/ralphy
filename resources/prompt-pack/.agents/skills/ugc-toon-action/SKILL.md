---
name: ugc-toon-action
namespace: user
description: >-
  How to make a stylized cartoon / painterly action animation of ANY subject — generalized niche know-how, not one specific video. A domain overlay on the standard pipeline that supplies the two pillars of good toon-action: (1) a seedance-2.0 t2v action-generation guide (the literal painterly STYLE block, the AUDIO-POLICY block, the named-style-reference silhouette-lock trick, multi-clip continuity anchoring, and WHY kling is wrong for non-default physics) and (2) GPT character-generation prompts (the SUBJECTS-block design discipline + named-pop-culture-reference lock). Works for ANY premise the user names — a skate duel, a cooking battle, a pet chase, a product mascot — the skill supplies the know-how, the user supplies the subject.
  USE WHEN the user wants a cartoon / animated / painterly / comic-book / Spider-Verse-or-Arcane-style action scene, "make a cool toon animation", a stylized action short, with no specific existing video to reproduce.
  This is a niche-style SKILL (generalized), not a remix TEMPLATE (one concrete video). For "remix this exact animation but swap X", use the remix path in docs/skills-vs-templates.md. The optional fighting-game VS character poster is ONE output format, not the point of the skill.
---

## Trigger

**FIRES** on a generic stylized-animation action brief: "make a cartoon animation of X", "Spider-Verse / Arcane style action scene", "painterly comic-book short", "cool animated action of <subject>", "toon fight / chase / trick". Any subject — the skill is subject-agnostic.

**DO NOT FIRE** when:
- The user points at one specific animation to reproduce (`@template:comic-spiderverse-action`, "remix this one", names a slug) → that is the **remix path** (`ralphy template use <slug>`), not this skill. See [`docs/skills-vs-templates.md`](../../../docs/skills-vs-templates.md).
- The brief is live-action / photoreal UGC (talking creator, unboxing, testimonial) → a different niche skill (`/ugc-ad`, `/ugc-unboxing`).
- The user wants a single static illustration, not motion → that is an image job, not this skill.

## What this skill is

A generalized overlay, not a finished animation. It names no subject, no cast, no script — it tells the pipeline HOW great cartoon-action animations are made so the scenarist and art-director produce a strong one for whatever the user wants animated. It runs **through** the normal pipeline (intake → scenarist → art-director → editor) and never bypasses the intake gates, the reference-required gate, or the quality gates. It is an **original aesthetic homage** — it evokes the Spider-Verse / Arcane painterly register, it does not reproduce a specific copyrighted scene or impersonate real people.

## Hard invariants

- **Provider invariants stand.** All generation via `ralphy generate` (OpenRouter media + ElevenLabs only — no FAL, no raw API). Renders via `ralphy render <id>`. Read `MODELS.md` before naming any model id.
- **seedance-2.0 t2v is the engine — NOT kling.** kling-v3.0-pro is tuned for default UGC selfie motion (talking head, light gesture) and **smears** any non-default physics — jumps, flips, grinds, chases, aerial rotation, combat. Stylized cartoon/painterly action is exactly the non-default lane. Use `bytedance/seedance-2.0` t2v. (Memory `[[feedback_vg_model_picks]]`.)
- **Pure t2v, not i2v from a photoreal anchor.** seedance's privacy filter blocks photoreal-human i2v anchors even AI-generated; but pure stylized/cartoon/painterly **t2v** is fine. Describe the characters in text, don't anchor on a photoreal frame. (Memory `[[feedback_seedance_rejects_realistic_people]]` — scope is photoreal-i2v only.)
- **Music is a separate ElevenLabs pass, banned inside seedance.** Every seedance prompt carries the AUDIO-POLICY block (diegetic SFX only). The music bed is a post-render ElevenLabs pass, genre+BPM+instrumentation only — NEVER name modern recording artists. (Memory `[[feedback_elevenlabs_music_no_artist_names]]`, `[[feedback_kling_no_music_eleven_music_postmix]]`.)
- **Reference gate.** A named real IP character (Spider-Man, a specific anime character as the SUBJECT) fires the reference-required gate. Original stylized characters proceed without a ref. Naming a pop-culture style reference to *lock a silhouette* (see pillar 2) is allowed — that shapes an original character, it does not make the deliverable depict the referenced IP.

## The niche, in one paragraph

A toon-action scene lives on **two things**: a believable, consistent **cast** and **action the model can actually render**. The single biggest failure is silhouette drift — the character looks different shot to shot — closely followed by motion smear when the action is outside the model's lane. Both are solved up front: design the characters with a tight SUBJECTS block and a named-style-reference that locks the silhouette, and route the motion to seedance (not kling) with the painterly STYLE block held literal across every clip. Get those right and the painterly aesthetic carries the rest.

## Pillar 1 — seedance action-generation guide (the heart of the skill)

How to generate cool cartoon/painterly action with `bytedance/seedance-2.0` t2v. Author each clip as a SUBJECTS → ENVIRONMENT → AUDIO-POLICY → STYLE → SHOT-LIST prompt. The descriptor blocks are **literal — do not paraphrase between clips** (paraphrasing drifts the look).

### STYLE block (painterly Spider-Verse / Arcane — literal)

```text
STYLE:
Digital painting feel, Spider-Man Across the Spider-Verse meets Arcane (Netflix). Large summarized flat color blocks, hard-edge brush strokes, painterly gouache texture, chunky variable-weight ink linework outlining characters, halftone dot patterns in mid-shadows, subtle chromatic-aberration RGB offset on bright edges, visible canvas grain. Heavy directional shadows in deep saturated tones (cobalt blue, deep magenta, ink-black). Highlights as crisp painted shapes. Warm peach/orange highlights, deep cobalt/magenta shadows, accent reds and purples. Comic-panel impact text painted into action frames in chunky ink linework. NO photorealism, NO 3D render, NO Pixar / Disney CG, NO smooth airbrush, NO commercial CG polish, NO anime cel-shade glossy.
```

### AUDIO-POLICY block (drop into EVERY seedance prompt)

```text
AUDIO POLICY — CRITICAL:
NO MUSIC. NO SOUNDTRACK. NO SCORE. NO MELODIC INSTRUMENTS. NO BEAT. NO BACKING TRACK OF ANY KIND. Audio track must contain ONLY diegetic on-camera sound effects: <6-8 specific SFX cues for the action>. Strictly silent of music — this video will receive a music track in post.
```

`--audio` ON works on seedance despite older CLI help hints — it returns an AAC SFX track when the AUDIO-POLICY block bans music.

### Action rules

- **Shot-list inside the prompt.** Number SHOT 1..N with lens + camera move + the action beat + per-shot SFX. Vary lens (24/28/35/50mm) and move (snap-zoom, tracking, dolly-back, low-angle hero) so it reads edited, not static.
- **Multi-clip continuity anchor** (cheaper + more reliable than seedance last_frame→first_frame for stylized work): end clip N with a location-exit phrase, open clip N+1 with the same phrase prefixed "They have JUST"; match sky color, time-of-day, and 1-2 silhouette descriptors **verbatim** across both prompts.
- **Comic SFX text** (KRRRACK / FWIP / SLAM / POP) painted into impact frames doubles as caption + visual — often replaces a separate kinetic-typography layer.

## Pillar 2 — GPT character-generation prompts

The LLM (`callLLM`, via the scenarist) designs the cast BEFORE any image/video call. Generalized character DESIGN, reusable for any premise.

### SUBJECTS-block discipline

Each character is one dense line: **name — age, height, skin tone, hair (with named-style reference), outfit head-to-toe, signature prop, stance/posture**. Two contrasting silhouettes read best (e.g. short+stocky vs tall+lean). Example shape (substitute freely):

```text
<NAME> — <age> <gender>, <height>, <skin>, <hair styled like a NAMED pop-culture reference>, <top> + <bottom> + <shoes>, <signature prop>, <stance>.
```

### Named-style-reference silhouette lock (the key trick)

seedance recognizes named style references baked into the hair/outfit line and uses them to hold the silhouette across shots — e.g. "hair like Musashi Miyamoto from Vagabond", "Spike from Cowboy Bebop", "Edward Elric from Fullmetal Alchemist". Pick a reference that locks a distinctive silhouette (hair / cape / signature accessory). **Without one, the model improvises and the character drifts between shots.** The character stays original; the reference only shapes the silhouette.

### OPTIONAL — VS character-select poster (one output format, skippable)

If — and only if — the user wants a marketing card alongside the cut, generate a fighting-game VS character-select poster with `google/gemini-3-pro-image-preview`, passing the user's layout reference as `--ref` (gemini holds multi-ref layout 1:1; ~$0.15, ~46s). The poster register is intentionally **photoreal 3D-render lookbook**, a different register from the painterly video — it is a marketing surface, not the point of the skill. Skip this entire stage for a video-only deliverable. The full poster prompt lives in [`templates/cinematic-narrative/comic-spiderverse-action/prompt-cookbook.md`](../../../templates/cinematic-narrative/comic-spiderverse-action/prompt-cookbook.md).

## Default model stack (verify against MODELS.md)

- **Character design + script:** the scenarist LLM (`callLLM`) — produces the SUBJECTS blocks + shot beats.
- **Optional VS poster:** `google/gemini-3-pro-image-preview`, `--ref` to a layout reference. Skip if video-only.
- **Action video:** `bytedance/seedance-2.0` t2v, 1080p, `--audio` ON, AUDIO-POLICY banning music. ~$0.14/s (≈$2.10 per 15s clip). NOT kling, NOT veo (5-6× pricier for no gain on painterly).
- **Music:** post-render ElevenLabs Music pass, instrumental, genre+BPM+instrumentation only, no artist names. On `400 bad_prompt`, resubmit the API's `prompt_suggestion` verbatim.
- **Editor:** `ralphy video concat` the clips, then `ralphy video add-music --duck` (sidechain duck under the diegetic SFX), then `ralphy render <id>`.

## Workflow

1. **Intake.** Collect: subject/premise, the two characters (or let the agent design them), action vocabulary (flip / chase / fight / trick), location + time-of-day, target length + aspect (default 16:9 for cinematic action; 9:16 if the user wants vertical — this is a niche-skill aspect override, see [intake.md](../../../.agents/skills/intake/SKILL.md) step 3), poster wanted? (default no), target language. Announce: "This is a stylized toon-action animation — using the toon-action skill."
2. **Reference gate.** Named real IP as the SUBJECT → ref or logged `--no-ref-consent`. Original characters → proceed.
3. **Character design (pillar 2).** Draft the SUBJECTS blocks with named-style-reference silhouette locks; get the user's "go".
4. **Optional VS poster** (only if requested) — gemini ref-anchored.
5. **Action clips (pillar 1).** seedance t2v per clip, literal STYLE + AUDIO-POLICY blocks, continuity-anchored — one clip at a time with checkpoints.
6. **Music** (post-render ElevenLabs), then **concat + duck + render** (`ralphy render <id>`).
7. **Hand off** to `/evaluator` for the post-render quality gate.

## Cookbook

- "Make a cool Spider-Verse-style skate duel" → original characters, seedance action, optional poster skipped unless asked. Match this skill.
- "Animated cooking battle, two chefs, Arcane vibe" → same pillars, swap action vocabulary to knife-work / flame / plating; design two contrasting chef silhouettes.
- "Remix THIS exact comic-spiderverse-action video but swap the skaters" → NOT this skill → remix path (`ralphy template use comic-spiderverse-action`).

## See also

- [`docs/skills-vs-templates.md`](../../../docs/skills-vs-templates.md) — skill vs remix template.
- [`templates/cinematic-narrative/comic-spiderverse-action/`](../../../templates/cinematic-narrative/comic-spiderverse-action/) — the concrete source template (full prompt-cookbook, hooks, model-stack, examples) this skill generalizes.
- [`.agents/skills/intake/SKILL.md`](../../../.agents/skills/intake/SKILL.md) — the gates this runs through.
- `MEMORY.md` — vg-model-picks (seedance vs kling), seedance-rejects-realistic-people, ElevenLabs-no-artist-names, Kling-no-music post-mix.
