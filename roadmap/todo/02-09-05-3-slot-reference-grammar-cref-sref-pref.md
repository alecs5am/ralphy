---
id: 02.09.05
status: todo
v1_0: no
category: 02-prompts-and-templates
topic: "02.09 Post-launch"
title: "3-slot reference grammar (--cref / --sref / --pref)"
---

# 02.09.05 — 3-slot reference grammar (`--cref / --sref / --pref`)

**v1.0:** no — reopens per [D-02](../02-prompts-and-templates/OPEN-QUESTIONS.md#decision-log) alongside `02.01.x` prompt-adapter work.

**Acceptance criteria:** (post-launch — mirrors original `02.02.01` / `02.02.02`)
- CLI flags `--cref` (character / identity), `--sref` (style / aesthetic), `--pref` (product / hero object). Each accepts URL / local path / data-URI; each repeatable.
- Legacy `--ref` stays as a synonym for `--cref` (most common single-ref use) for backward compatibility.
- Provider layer routes per model: Runway → `subjectReference[]` / `styleReference[]`; Midjourney v7 → `--cref` / `--sref` passthrough; Gemini image → multi-ref input ordered cref-first; Kling → prompt-formula hints.
- `Scene.refs` shape upgrades from `string[]` to `{ cref?: string[], sref?: string[], pref?: string[] }` with a one-pass migration verb that reads the old shape as `cref`.
- Master shots (`workspace/projects/<id>/master/{character,style,product}.png`) auto-populate the matching slot per `02.02.03`.
