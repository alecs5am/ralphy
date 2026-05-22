---
id: 01.04.03
status: doing
v1_0: yes
category: 01-cli
topic: "01.04 Setup, status, doctor"
title: "ralphy doctor covers every required dep + key + project link"
---

# 01.04.03 — `ralphy doctor` covers every required dep + key + project link

**v1.0:** yes

**Acceptance criteria:**
- Checks: `bun` present, `ffmpeg` present, `yt-dlp` present, `OPENROUTER_API_KEY` set + valid, `ELEVENLABS_API_KEY` set + valid, workspace dir writeable, project link present, asset cache reachable.
- Pretty output groups by category (env / keys / deps / project) with red/yellow/green per check.
- JSON output: `{ ok: bool, checks: [{ name, status, message, hint? }] }`.
- Exit 0 if all green, exit 1 if any red, exit 2 if any yellow only.
- Documented escape hatch for partial-config use cases.
