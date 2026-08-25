---
name: remotion-to-hyperframes
namespace: user
description: >-
  Compatibility shim for the legacy `/remotion-to-hyperframes` skill name. Use when an old project, note, or user request asks to migrate Ralphy Remotion work; translate the intent into the current HyperFrames composition model and follow the editor and HyperFrames playbooks.
---

# remotion-to-hyperframes

## Trigger

Use this only when a request explicitly references legacy Remotion material,
old Remotion files, or migration from Remotion to HyperFrames.

## Hard invariants

- HyperFrames HTML is the current source of truth for Ralphy video
  compositions.
- Do not introduce new Remotion dependencies or render paths.
- Preserve project artifacts append-only; snapshot existing HyperFrames
  `index.html` with `ralphy hyperframes save-version <project>` before
  non-trivial edits.

## Workflow

1. Inventory the legacy request and map it to scenes, media tracks, captions,
   and transitions.
2. Read `.agents/skills/editor/SKILL.md` and `.agents/skills/hyperframes/references/playbook.md`.
3. Implement or describe the migration in HyperFrames terms.
4. Render through `ralphy render <project>` when a final mp4 is requested.

## Outputs

Deliver a HyperFrames migration plan, code change, or render result depending
on the user request.
