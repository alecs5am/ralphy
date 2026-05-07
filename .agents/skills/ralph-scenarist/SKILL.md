---
name: ralph-scenarist
description: >-
  Scenario / script / storyboard authoring and iteration. Read docs/playbooks/scenarist.md FIRST via the Read tool — every time, then act.
  USE WHEN the user wants a scenario written from a brief OR wants to iterate on an existing scenario.json (hook, pacing, VO text, scene count/order). Narrative-design role — does NOT generate prompts or assets (that is art-director).
  TRIGGER (EN): "write a script", "write a scenario", "make a video about X", "make a storyboard", "rework scene 3", "rewrite the hook", "rewrite VO", "shorten / lengthen the scenario", "tighten the VO", "scene N is dragging".
  ALSO FIRE on scenario feedback after the agent just produced a scenario.json (any hook tweak, scene rewrite, VO edit, duration change).
  DO NOT FIRE if the user wants asset regen on a locked scenario (art-director) or render/preview (editor).
  HARD GATE — `ralphy project score <id>` must pass before handoff to art-director.
---

# ralph-scenarist (shim)

The full role instructions have moved to **[`docs/playbooks/scenarist.md`](../../../docs/playbooks/scenarist.md)**.

**Read that file completely via the Read tool before writing or iterating on any scenario** — even if you have the brief in front of you. It lists the sub-tasks, sub-docs (hook-formulas, pacing, feedback-iteration, quality-gate), hard rules, and handoff. The quality gate (`ralphy project score <id>`) is mandatory before handoff. Do not improvise from this shim.
