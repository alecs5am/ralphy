---
id: 01.09.01
status: done
v1_0: yes
category: 01-cli
topic: "01.09 Standalone operation & global config"
title: "ralphy new \"<brief>\" creates a project under ~/.ralphy/"
---

# 01.09.01 — `ralphy new "<brief>"` creates a project under `~/.ralphy/`

**v1.0:** yes

**Implementation:** [`cli/commands/new.ts`](../../cli/commands/new.ts). CWD-independent — projects live at `$RALPHY_HOME/projects/<id>/` (defaults to `$HOME/.ralphy/projects/`). Auto-derives slug from brief, or accepts `--id <slug>`, or generates `YYMMDD-HHMMSS` when neither is provided. Refuses to overwrite existing project with `E_ALREADY_EXISTS`. Scaffolds canonical layout: `assets/`, `render/`, `logs/{generations,user-prompts,user-assets}.jsonl`, plus `BRIEF.md` when a brief is provided. Tests: [`tests/integration/cli-new.test.ts`](../../tests/integration/cli-new.test.ts) (4 cases).

**Acceptance criteria:**
- `ralphy new "<brief>"` (or `ralphy new --id <slug>` without brief) creates `~/.ralphy/projects/<id>/` with the canonical project shape (cross-link [`05.02`](../05-project-resources/PRD.md)).
- No CWD dependence — the project lives in `~/.ralphy/projects/`, not in CWD.
- Output: `{ project_id, path, brief? }` JSON.
- Pretty mode prints "Project created at `~/.ralphy/projects/<id>` — `ralphy render <id>` to render once assets are in place".
