---
id: 01.04.01
status: doing
v1_0: yes
category: 01-cli
topic: "01.04 Setup, status, doctor"
title: "ralphy setup non-interactive mode is bulletproof"
---

# 01.04.01 — `ralphy setup` non-interactive mode is bulletproof

**v1.0:** yes

**Acceptance criteria:**
- All flags from current help (`-y`, `--openrouter-key`, `--elevenlabs-key`, `--keys-from-env`, `--project-dir`, `--import-profile`, `--no-verify`, `--allow-unverified`) work in headless CI.
- Each invalid input produces a structured error with a `code` from the catalog.
- Output ends with a JSON summary: `{ keys_set: [...], project_dir, profile_imported, verification: "ok"|"skipped"|"failed" }`.
