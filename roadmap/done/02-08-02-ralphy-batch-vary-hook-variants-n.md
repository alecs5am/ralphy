---
id: 02.08.02
status: done
v1_0: yes
category: 02-prompts-and-templates
topic: "02.08 Hook / Body / CTA primitive"
title: "ralphy batch --vary hook --variants N"
---

# 02.08.02 — `ralphy batch --vary hook --variants N`

**v1.0:** yes

**Implementation (2026-05-20):** Shipped as `ralphy batch vary --base <project-id> --axis <hook|body|cta|persona> --variants <N> [--variants-file <path>] [--dry-run]` (subcommand pattern matches the rest of the `batch` verb tree). Creates N variant projects named `<base>-h1`, `<base>-h2`, … (suffix maps to axis: `h`/`b`/`c`/`p`). Each variant clones scenario.json and overlays the swap from `--variants-file` (array of N objects). `--dry-run` previews without writing. Registers variants in the project registry with `variant_of` + `variant_axis` metadata. Tests at `tests/integration/cli-batch-vary.test.ts`.

**Acceptance criteria:**
- Generates N scenarios that swap only the hook, keep body + CTA constant.
- Each variant renders to a separate project (`<base>-h1`, `<base>-h2`, …).
- Cost preview: `--dry-run` shows hook regen cost only (body assets are reused via symlink / hardlink).
