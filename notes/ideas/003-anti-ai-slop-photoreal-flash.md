# Anti-AI-slop photoreal register: direct-flash diary

> **Status:** idea
> **Filed:** 2026-05-23
> **Folder:** ideas

## Context

`docs/playbooks/art-director/photoreal-humans.md` currently documents
two registers for photoreal-human prompts — TV-commercial (Tom Ford /
chiaroscuro) and still-photo (Sony A7 IV + Sigma 35mm + Portra 400).
Both still read as "AI photoshoot" when the brief calls for candid,
personal, or PFP-style content. The composition is too clean, the
lighting too cinematic, the framing too centred. Output passes a
quality gate but a human viewer sees the AI artefact instantly.

There is a third register that empirically fixes this: **direct-flash
diary / paparazzi**. Briefs that match it (selfie-style avatars,
diary photos, "found footage" frames, late-night candids) currently
get routed through the still-photo register and silently lose to slop.

## What

Add the third register to `photoreal-humans.md` alongside the existing
two, and ship a prompt-library entry under `docs/prompts/image/` so
`ralphy prompts library lookup` surfaces it automatically.

The register DNA:

- **Camera body**: Ricoh GR III with built-in flash, or a disposable
  film camera (Kodak Funsaver class). Explicitly *not* a mirrorless
  full-frame; substituting Sony / Sigma reintroduces the slop.
- **Flash**: harsh on-camera flash that blows out the front plane and
  drops a hard shadow behind. No cinematic neon split, no rim lighting.
- **Film stock**: heavy Cinestill 800T grain, chromatic aberration on
  flash hotspots, slightly underexposed negative-film density.
- **Framing**: handheld vertical (9:16), off-centre composition, a
  few degrees of camera tilt, framed mid-thigh to slightly above the
  head.
- **Pose**: caught mid-action, not posed; head turned partially away
  from lens; "ugly-beautiful" over "fashion-clean".
- **Negative prompt**: ban *cinematic, movie poster, glossy fashion
  ad, HDR, theatrical lighting, symmetric face, slimmed jaw,
  idealised features, polished studio, beauty filter, plastic skin,
  colour-graded teal-and-orange, magazine cover*.

## Why it matters

PFP, diary, and candid-photo briefs are common and the current
playbook silently routes them through the wrong register. A single
documented third register cuts the typical iteration count and burn
cost on those briefs to one shot.

## Notes

- Promotion path: highest leverage is a new
  `docs/prompts/image/anti-ai-slop-flash-photoreal.md` cookbook entry
  with Bad / OK / Ideal worked examples — auto-consulted via
  `ralphy prompts library lookup`. Pair with a one-paragraph
  extension to `docs/playbooks/art-director/photoreal-humans.md`
  naming the register alongside the existing two.
- Open question: does this generalise beyond the candid-portrait
  niche (e.g. lifestyle product shots, hand-only macro)? Worth a
  validation render on two off-domain subjects before formalising as
  a vibe-style template.
- Cross-ref: `notes/ideas/004-localize-objects-vision-bbox.md` lives
  in the adjacent agent-precision family — that one fixes pixel-level
  miscalibration; this one fixes prompt-register miscalibration.
