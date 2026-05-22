---
id: 01.03.03
status: done
v1_0: yes
category: 01-cli
topic: "01.03 Help system depth"
title: "generate video --help shows per-model flag whitelists"
---

# 01.03.03 — `generate video --help` shows per-model flag whitelists

**v1.0:** yes

**Implementation:** `addHelpText("after", ...)` on the `video` sub-command reads the cached OR catalog synchronously ([`cli/lib/or-catalog.ts → getOrCatalogSync()`](../../cli/lib/or-catalog.ts)) and prints per-model durations / resolutions / aspect_ratios / frame_images. `--model <id>` filter scans `process.argv` and narrows to a single row. Tests: [`tests/integration/cli-help-whitelist.test.ts`](../../tests/integration/cli-help-whitelist.test.ts) (2 cases).

**Acceptance criteria:**
- When a user runs `ralphy generate video --help`, the output includes the per-model `supported_durations`, `supported_resolutions`, `supported_aspect_ratios`, `supported_frame_images` for each model in the registry, refreshed from the 24h-cached OpenRouter video catalog.
- Compact format: one table or grouped block per model.
- `--model <id>` filter: `ralphy generate video --help --model kwaivgi/kling-v3.0-pro` shows only that model's whitelist.

**Notes:** today the user has to run `ralphy models show <id>` separately. Inline it in `--help` so agents don't have to chain reads.
