# `--audio` help text and MODELS.md disagree about kling support

> **Status:** issue
> **Filed:** 2026-05-29
> **Folder:** issues
> **Severity:** low
> **Category:** docs

## Context

`--audio` flag help string says "Veo 3 only" while the CLI unconditionally passes `generate_audio` to OpenRouter for any model, and MODELS.md explicitly clears `kling-v3.0-pro` for ambient/EN VO. The conflict steers agents to skip `--audio` on kling and burn a regen.

## What

- `kbo-broadcast-001`: agent burned a turn proposing ElevenLabs music fallback before user pushed back ("клинг сам может звуки нагенерить").
- `noski-people-001`: #6 — same misdirection.
- `glitter-cream-001`: $0.42 on a silent-by-default kling take.
- `skater-spiderverse-001`: almost declined `--audio` on seedance based on help text.

## Why it matters

The help string is the agent's first source of truth. When it disagrees with MODELS.md, the agent picks the help string and re-discovers the truth through wasted spend.

## Suggested fix

- Rewrite `--audio` help in `cli/commands/generate.ts:207`: "Veo 3 default; kling-v3.0-pro also supports EN audio — see MODELS.md."
- MODELS.md row split: SPEECH (Veo 3 + EN-only kling+seedance) vs AMBIENT/DIEGETIC (fine on kling/seedance/veo).
- Add a "Failure mode" line per model in MODELS.md (also see issue 026).
- Long-term: drive both help string and MODELS.md from a single per-model JSON config (see issue 026).

## Sources

- `workspace/projects/kbo-broadcast-001/postmortem/03-cli-issues.md` — #3
- `workspace/projects/noski-people-001/postmortem/03-cli-issues.md` — #6
- `workspace/projects/glitter-cream-001/POSTMORTEM.md` — kling silent take
- `workspace/projects/skater-spiderverse-001/postmortem/03-cli-issues.md` — #2
- MEMORY: `feedback_kling_no_ru_audio`
