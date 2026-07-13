@AGENTS.md

# Repository orientation

This repository contains the agent-facing Ralphy CLI only. Marketing, public documentation, desktop UI, and unattended workflow automation live in separate companion repositories under the `ralphy` GitHub organization workspace.

- `cli/` — commands and runtime libraries.
- `docs/playbooks/` — operational playbooks loaded through `AGENTS.md`.
- `.agents/skills/` — agent-facing skill entry points.
- `.ralphy/` — gitignored local account workspaces, shared assets, projects, and units.

Use `bun run ralphy -- <command>` for in-tree development and `bun test` for verification.
