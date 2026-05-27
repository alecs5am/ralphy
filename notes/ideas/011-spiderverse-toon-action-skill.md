# Extract a stylized toon-action niche skill from comic-spiderverse-action

> **Status:** idea
> **Filed:** 2026-05-27
> **Folder:** ideas

## Context

Raised in conversation 2026-05-27 while scoping the niche-skill depth
rework (`[[003-niche-ugc-skill-depth]]`). The existing vibe-style
template `templates/cinematic-narrative/comic-spiderverse-action/`
(sourced from project `skater-spiderverse-001`) already encodes
genuinely good, validated craft that generalizes cleanly to a skill —
this is a concrete first instance of the vibe-style-template → niche-skill
migration that `[[008-skills-vs-templates-rework]]` left open.

## What

A template reproduces ONE specific video; we want a SKILL — generalized
know-how for making great cartoon animations of ANY subject, decoupled
from the skater case. The skill's two core, generalizable pillars
(both already written and render-validated in the template, just
subject-bound right now):

1. **seedance action-generation guide** — HOW to generate cool
   cartoon/painterly action with `bytedance/seedance-2.0` t2v: the
   literal AUDIO-POLICY block (ban music, diegetic SFX only), the
   painterly STYLE block, the named-style-reference trick to lock a
   silhouette across shots, multi-clip continuity anchoring, and the
   hard rule on WHY kling is wrong for non-default physics (selfie-tuned,
   smears action — memory `[[feedback_vg_model_picks]]`). This is the
   heart of the skill.
2. **GPT character-generation prompts** — the LLM step that designs the
   characters themselves: the detailed SUBJECTS-block discipline
   (name / age / height / skin / hair / outfit / stance) + the
   "bake a named pop-culture style reference to lock the silhouette"
   rule. Generalized character DESIGN, not tied to any one cast.

The fighting-game VS character-select **poster** is just ONE optional
output format of pillar 2 — explicitly NOT the point of the skill
("the poster format is not mandatory"). Keep it as a skippable extra.

Plus the editor recipe (ElevenLabs post-mix music, genre+BPM only / no
artist names, + sidechain duck) carries over as-is.

## Why it matters

It's the easiest, highest-confidence migration: the craft is already
written, costed, and render-validated (postmortem exists). Shipping it
proves the template→skill path and gives the agent a real cartoon/toon
niche it currently lacks (all `ralphy-ugc-*` skills today are
live-action/photoreal).

## Notes

- Decide the fate of the source template: keep as the remix anchor
  (one concrete reproducible video) while the skill carries the
  generalized know-how — the two are complementary, not duplicates
  (per the skill-vs-template model). Likely keep both.
- Name TBD: `ralphy-ugc-toon-action` vs broader `ralphy-ugc-animation`.
- Subject-agnostic test: re-run on a non-skater subject (e.g. a
  cooking duel, a pet, a product mascot) to confirm it generalizes
  before shipping.
- Cross-ref the open migration question in
  `[[008-skills-vs-templates-rework]]` (phase 2 deferred candidates).
