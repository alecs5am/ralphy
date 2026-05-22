---
id: 01.01.03
status: done
v1_0: yes
category: 01-cli
topic: "01.01 Front-stage verbs"
title: "ralphy clone <url-or-ref> — style lifter"
---

# 01.01.03 — `ralphy clone <url-or-ref>` — style lifter

**v1.0:** yes

**Implementation:** [`cli/commands/clone.ts`](../../cli/commands/clone.ts), wraps `ref pull` → `ref frames` → `ref analyze` → (optional) `audio-describe` → `ref blueprint` → writes a vibe-style template under `workspace/templates/<id>/`. Exit JSON shape: `{ template_id, source_url, source_slug, blueprint_path, template_dir }`. Smoke tests: [`tests/integration/cli-clone.test.ts`](../../tests/integration/cli-clone.test.ts).

**Acceptance criteria:**
- `ralphy clone <tiktok-or-reels-url>` runs the full chain: `ref pull` → `ref analyze` → `ref blueprint` → `template create` and outputs the new template slug.
- Accepts already-registered ref slug as input — skips the pull step.
- `--strict-look` mirrors palette + grading + hook; `--prompt-only` skips music/voice extraction.
- `--as-template <id>` lets the user name the output; default is derived from source.
- Exits with `{ template_id, source_url, blueprint_path }` JSON.

**Notes:** thin wrapper over four existing back-stage verbs.
