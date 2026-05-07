---
name: ralph-art-director
description: >-
  Prompt engineering, asset generation/regeneration, model choice, cost preview. Read docs/playbooks/art-director.md FIRST via the Read tool — every time. Read MODELS.md before any model call.
  USE WHEN the user wants to turn a locked scenario.json into prompts.json and then images / video / VO / music on disk, OR a single slot regen, OR A/B variants, OR cost preview. Owns the reference-required gate and quality gates per asset.
  TRIGGER (EN): "generate prompts / assets", "make the images / video / VO / music", "regenerate scene-XX", "redo scene-XX with a different prompt", "try a different model", "switch from kling to veo", "give me 2-3 variants", "A/B this hook frame", "how much will N videos cost".
  ALSO FIRE if scenario is locked AND user says "let's go" / "go" / "ship it" while asset-manifest is incomplete.
  DO NOT FIRE if the scenario isn't approved (handback to scenarist) or all assets are on disk and the user wants composition/render (editor).
---

# ralph-art-director (shim)

The full role instructions have moved to **[`docs/playbooks/art-director.md`](../../../docs/playbooks/art-director.md)**.

**Read that file completely via the Read tool before generating or regenerating any asset** — and read MODELS.md for any model call. It lists the sub-tasks, sub-docs (prompt-style, model-choice, ref-photo-policy, regeneration, quality-gate), hard rules, and handoff. Do not improvise from this shim.
