# Niche UGC skills are too thin to produce non-slop output

> **Status:** issue
> **Filed:** 2026-05-27
> **Folder:** issues

## Context

Surfaced running `/ralphy-ugc-ad` end-to-end on a test brief (no-name
coffee grinder, project `ugc-ad-test-001`, 2026-05-27). The pipeline
executed cleanly — gates, refs, model calls, composition, all correct
— but the user judged the result AI-slop and not shippable. The skill
body got the agent through the motions without giving it the depth to
make the output actually convincing. The `ralphy-ugc-*` skills were
ported in `[[008-skills-vs-templates-rework]]` phase 2 but never
pressure-tested against a real render.

## What

Research and rework the niche UGC skills (`ralphy-ugc-ad` first, then
the rest) so each is super-detailed and *operational*, not a thin
overlay. Each skill body should spell out, with worked specifics:

- **Models** — exact ids + why, per beat type, cross-checked against
  `MODELS.md` (image register, i2v provider, audio path, music).
- **Scenario/scriptwriting** — concrete hook frameworks, beat timing,
  VO line craft, what separates believable from generic for the niche.
- **HyperFrames montage** — how to actually cut/compose the niche
  (transition choice, caption style, music ducking, SFX, pacing) —
  not just "assemble the clips".
- **The AI-slop failure modes** specific to the niche and the concrete
  countermeasures (lipsync tells, generic captions/CTA chips,
  diction-as-VO tone, etc.).

Goal: the agent understands every detail and reliably produces
non-slop output, not just a valid pipeline run.

## Why it matters

The niche skill is the DEFAULT route for a generic brief (AGENTS
invariant #10). If the default route yields slop, the whole
skills-first model fails its first contact with a real user. Higher
leverage than any single template.

## Notes

- Start from a research pass: what makes real UGC ads in each niche
  convincing (study references, not just prior prompt lore).
- Fold in existing memory rules (anti-ai-slop, photoreal-still,
  Kling-no-music post-mix, Kling-no-RU-audio) explicitly per skill.
- Cross-ref `[[003-anti-ai-slop-photoreal-flash]]` (image register
  gap) and `[[008-skills-vs-templates-rework]]` (taxonomy + which
  skills exist). This issue is the depth/validity gap, distinct from
  both.
- Validation bar: a render the user rates ship-able, not just a
  passing quality gate. Consider a per-skill worked example checked
  into the skill.
- Test artifacts that motivated this live at
  `workspace/projects/ugc-ad-test-001/` (kept, not deleted).
