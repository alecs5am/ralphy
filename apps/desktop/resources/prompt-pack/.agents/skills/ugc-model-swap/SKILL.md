---
name: ugc-model-swap
namespace: user
description: >-
  How to recreate a short UGC-style video with a DIFFERENT person/character while keeping everything else identical — setting, action, props, audio, camera feel. The craft layer behind the remix-with-swap pattern ("same video, but replace the creator with X"). Supplies the source-video analysis step, the single-continuous-scene prompt shape, the face-lock rule, prop-negative discipline, and explicit body-mechanics that keep the swap faithful. Works for any source clip + any replacement character.
  USE WHEN the user shares a UGC clip (challenge / reaction / review / try-on / unboxing) and wants the same clip with a different person or character, or wants several character variants of one clip.
  Pairs with the remix path in docs/skills-vs-templates.md: remix swaps any element of a template; this skill is the specialist for swapping the on-camera person. For building a UGC ad from scratch, see /ugc-ad.
---

## Trigger

**FIRES** on a swap brief: "same video but with a different girl/guy", "recreate this clip with <character>", "give me 4 versions of this clip with different people", "swap the creator in this UGC video".

**DO NOT FIRE** when:
- The user wants a brand-new ad authored from a product (no source clip to mirror) → `/ugc-ad`.
- The user wants a different *niche* of video → match that niche's skill.

## What this skill is

The craft specialist for the **swap** kind of remix. The user supplies a source clip and a replacement person/character; this skill mirrors the source faithfully and changes only the on-camera subject. It runs through `ralphy generate` / `ralphy render` like everything else.

## Hard invariants

- **Provider invariants stand.** Source analysis, generation, and render all go through `ralphy` (`ralphy ref analyze-video <slug>` for the source breakdown; `ralphy generate video` for the swap; `ralphy render`). No Higgsfield MCP, no raw API. Read `MODELS.md` before naming a model id.
- **Model choice is the trap — get it right (per `MEMORY.md`):**
  - **Photoreal human replacement → `kwaivgi/kling-v3.0-pro`.** `bytedance/seedance-2.0` blocks photoreal-human i2v anchors (privacy filter), even AI-generated ones — it fails the swap. Do NOT reach for seedance for a realistic person, regardless of what a non-ralphy tutorial claims.
  - **Stylized / non-human character (cartoon, creature, mascot) → `bytedance/seedance-2.0` is fine** and often better for non-default physics motion. The privacy filter only bites photoreal humans.
- **Reference gate.** If the replacement is a **named real person** ("make it Tom Cruise"), the reference-required gate fires — refuse without a ref or logged `--no-ref-consent`. A generic replacement ("a young woman with red hair") proceeds without a ref.
- **Don't recreate copyrighted source audio.** Mirror the *structure* of the source; the user supplies/approves the actual VO and music.

## The craft, in five rules

1. **Single continuous scene — no numbered splits.** Describe the entire video as ONE flowing paragraph. "Scene 1 / Scene 2" labels confuse i2v models and break continuity.
2. **Face always in frame — state it repeatedly.** If the action has the subject look down, reach, or place something, the camera must NOT follow. Put the lock inline in the action AND as a closing rule: "FACE IS ALWAYS CENTER FRAME. Camera locked on the face. Never tilts down. Never follows the hand."
3. **Props — hyper-specific, with negatives.** If there's one prop, forbid the variations the model invents: "only ONE standalone ice cube resting in the palm — no bucket, no bowl, no container, no pile."
4. **Body mechanics — describe the motion, not the intent.** Not "she puts it away" → "she deliberately reaches her hand down and tucks the cube into the waistband, her hand moves below frame, the object disappears from view." Specific mechanics = faithful output.
5. **Lock the setting up top.** Open the prompt with the interior/exterior + lighting ("INTERIOR kitchen, soft window light, blurred counter behind") before any action, or the model relocates the scene.

## Prompt shape (single continuous flow)

```
[Replacement character: age, look, outfit — specific; OR "@ref the attached photo"].
INTERIOR/EXTERIOR [setting] — [lighting], [background].
Opening: [shot type], [what's in foreground]. The subject [neutral start]. FACE ALWAYS IN FRAME.
[Continuous action — body mechanics in order, one flow].
Camera stays tight on the face throughout. Handheld smartphone UGC feel.
FACE IS ALWAYS CENTER FRAME. Camera locked on the face. Never tilts down. Never follows the hand.
Audio: "[line]" / "[line]" / [sound] / "[line]". Natural room acoustics.
```

## Workflow

1. **Analyze the source.** `ralphy ref pull <url>` then `ralphy ref analyze-video <slug>` (gemini-3.1-pro over the full mp4 — don't eyeball frames; see `MEMORY.md`). Extract: setting + lighting, the continuous action sequence, props (what + how used), audio/dialogue, camera feel.
2. **Lock the replacement.** Photo provided → pass via `--ref` (lock it as the master and pass on every variant to prevent drift — `MEMORY.md` super-original-refs). No photo → describe in text. Named real person → reference gate.
3. **Build the single-continuous-scene prompt** per the shape above. Pick the model by the rule (photoreal human → kling; stylized → seedance).
4. **Generate** via `ralphy generate video ... --ref <character>`. 9:16, duration matched to source.
5. **Variants:** to produce multiple character versions, change ONLY the character description; keep setting/action/props/audio identical across variants. Generate as separate `ralphy generate` calls (auto-versioned).
6. **Render + eval** → `ralphy render <id>` → `/evaluator`.

## Pitfalls → fixes

| Problem | Fix |
|---|---|
| Photoreal human swap fails / returns nothing | You used seedance — switch to `kling-v3.0-pro` (privacy filter). |
| Model makes a pile/bucket instead of one prop | Add explicit negatives: "only ONE … no bucket, no bowl, no pile". |
| Camera tilts down and follows the hand | Repeat the face-lock rule inline AND at the end. |
| Subject drops the prop instead of placing it | Spell out body mechanics ("deliberately reaches down and tucks … hand moves below frame"). |
| Scene opens in the wrong location | Put "INTERIOR <room>" at the very top before any action. |
| Video splits into disconnected shots | Remove any "Scene N" labels — one continuous paragraph. |
| Replacement identity drifts between variants | Lock the ref as a master and pass `--ref` on every call. |

## See also

- [`docs/skills-vs-templates.md`](../../../docs/skills-vs-templates.md) — the remix-with-swap pattern this serves.
- `MEMORY.md` — seedance-rejects-realistic-people, super-original-refs, use-ralphy-ref-analyze-video.
- [`MODELS.md`](../../../MODELS.md) — per-model i2v caps + privacy-filter notes.
