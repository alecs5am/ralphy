# Character and background generation expertise

> **Status:** todo
> **Filed:** 2026-10-28
> **Folder:** issues
> **Severity:** high
> **Category:** research / knowledge base

## Context

The owner estimates this domain decides about 60% of AI-video success. Different models specialize in different styles, and each has failure modes the agent must know. Examples: passing an image through a GPT image model re-renders it and introduces artifacts; cloning a real person from one photo needs a specific one-shot path; a realistic character from a prompt needs the right model and a consistency plan across shots; cartoon, comic and anime styles each behave differently; HeyGen avatars handle consistency themselves.

## What

Build an expert reference, verified by tests rather than recalled from training:

- Model map (from `MODELS.md`): photoreal humans, stylized (cartoon, comic, anime, 3D, painterly), backgrounds and environments, editing vs generation, typography-capable.
- Known artifacts per model and input type (re-encoding drift, face melt, hand errors, text corruption, color shift on edit).
- One-shot identity from a photo: which model and which inputs, how many refs, what breaks.
- Consistency across a video: character sheets, ref packs, first frames, seeds, identity checks between shots.
- Avatar platforms (HeyGen): when to use them instead of generating.
- A controlled test matrix: same brief across models and styles, scored by the identity and style checks we already have.

## Scope / acceptance

- `.agents/skills/art-director/references/characters-and-backgrounds.md` with a decision table: goal -> model -> inputs -> consistency method -> known risks.
- Test-matrix results stored as a calibration dataset with images and scores.
- `MODELS.md` updated where tests contradict it.
- Paid tests run only after the owner approves a cost estimate.

## Notes

- Related: `json-prompt-engine`, guidelines `photoreal-studio-portraits`, ref-pack (#449).
