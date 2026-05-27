---
id: 03.02.04
status: done
v1_0: yes
category: 03-skills
topic: "03.02 Cross-agent installer"
title: "Codex / generic AGENTS.md"
---

# 03.02.04 — Codex / generic AGENTS.md

**v1.0:** yes

**Implementation:** `cli/lib/skill/installer.ts → installCodex()`. Sentinel-merges the Ralphy routing block into repo-root `AGENTS.md` (creating the file if missing). Foreign AGENTS.md content is preserved outside the sentinel block. The "personal scope outside the repo" branch (~/.agents/AGENTS.md) is documented as best-effort but not enabled by default — agents respect repo-root AGENTS.md uniformly so a user-scope hop adds risk without benefit.

**Acceptance criteria:**
- Codex, Aider, Zed, Warp, Jules, Devin all read `AGENTS.md` at repo root.
- Adapter ensures repo root `AGENTS.md` has the canonical content; no file moves.
- For "personal scope" outside the repo: writes `~/.agents/AGENTS.md` (best-effort; documented as not all agents respect it).
