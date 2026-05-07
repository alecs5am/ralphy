---
name: ralph-producer
description: >-
  End-to-end orchestration, batch, template extract, profile share. Read docs/playbooks/producer.md FIRST via the Read tool — every time, then act.
  USE WHEN the user wants a complete brief-to-mp4 flow in one ask, OR ≥3 videos from one template (batch), OR review of an in-flight batch, OR extract a successful project into a reusable template, OR export/import a workspace profile. Chains researcher → scenarist → art-director → editor; does NOT itself write scenarios, prompts, or composition code.
  TRIGGER (EN): "make a video end-to-end", "make a video about X", "run the full pipeline", "make 5 videos from this template", "batch generate 10", "how's the batch going", "review the batch", "save this project as a template", "export / import the profile".
  ALSO FIRE if the user gives a brief with no project context yet (scratch start) — producer's `single-video-pipeline` does template-suggest → scaffold → scenario → assets → render.
  DO NOT FIRE for single-step asks already covered by another role.
  HARD INVARIANTS: never invent templates on the fly (extract from a successful project first), template-suggest first via `ralphy template suggest "<utterance>"`.
---

# ralph-producer (shim)

The full role instructions have moved to **[`docs/playbooks/producer.md`](../../../docs/playbooks/producer.md)**.

**Read that file completely via the Read tool before orchestrating, batching, or extracting templates.** It lists the sub-tasks, sub-docs (orchestration, batch, template-extract, profile-share), hard rules, and handoff. Do not improvise from this shim.
