---
id: 05.02.01
status: todo
v1_0: yes
category: 05-project-resources
topic: "05.02 Canonical project shape"
title: "Project schema documented in docs/project-shape.md"
---

# 05.02.01 — Project schema documented in `docs/project-shape.md`

**v1.0:** yes

**Acceptance criteria:**
- New doc enumerates every file/dir under `workspace/projects/<id>/` with its purpose, owner playbook, and append-only status.
- Includes `prompts.json`, `asset-manifest.json`, `scenario.json`, `captions.json`, `STORYBOARD.md`, `POSTMORTEM.md`, `postmortem/`, `assets/`, `render/`, `logs/`.
- Each entry: which playbook reads/writes it, what's allowed (append / new-file / overwrite-on-promote / never-touch).
