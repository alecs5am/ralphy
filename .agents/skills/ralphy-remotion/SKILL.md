---
name: ralphy-remotion
namespace: user
description: >-
  Compatibility shim for the legacy `/ralphy-remotion` skill name. Use when a saved Claude Code command, old project note, or user request still mentions Ralphy Remotion; redirect the task to HyperFrames and the current Ralphy render playbooks instead of authoring new Remotion code.
---

# ralphy-remotion

## Trigger

Use this only for legacy references to `/ralphy-remotion`, "Ralphy Remotion",
or old Remotion-based project instructions.

## Hard invariants

- Do not create new Remotion compositions for Ralphy projects.
- Use `.agents/skills/editor/SKILL.md` and `.agents/skills/hyperframes/references/playbook.md` for current
  composition and render work.
- For engine-specific implementation details, load `.agents/skills/hyperframes`
  and `.agents/skills/hyperframes-cli`.

## Workflow

1. Treat the request as a HyperFrames task.
2. Read the editor or HyperFrames playbook required by `AGENTS.md`.
3. Use `ralphy render <project>` for final renders.

## Outputs

Return the HyperFrames-based answer or change. Mention that the old Remotion
name is a compatibility alias only when the user explicitly asked about it.
