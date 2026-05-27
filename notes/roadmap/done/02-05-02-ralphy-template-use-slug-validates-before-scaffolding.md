---
id: 02.05.02
status: done
v1_0: yes
category: 02-prompts-and-templates
topic: "02.05 `template.yaml` schema"
title: "ralphy template use <slug> validates before scaffolding"
---

# 02.05.02 — `ralphy template use <slug>` validates before scaffolding

**v1.0:** yes

**Implementation (2026-05-20):** `cli/commands/template.ts` now invokes `loadTemplateManifest()` + `diagnoseRequiredInputs()` BEFORE scaffolding the project dir. New flags `--brand`, `--persona`, `--ref` satisfy the `requires` block; missing inputs raise `E_TEMPLATE_INPUT_MISSING` (new code in `cli/lib/errors/catalog.ts`). The same validation gate fires on `template register <id>`. Loader rejects unsupported `version:` with `E_TEMPLATE_VERSION_UNSUPPORTED` per D-03.

**Acceptance criteria:**
- Missing required input → error `E_TEMPLATE_INPUT_MISSING` with hint "supply via `--brand <slug>` or `ralphy brand create`".
- Documented in `docs/cli-spec.md`.
