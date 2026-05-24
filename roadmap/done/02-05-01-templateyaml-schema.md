---
id: 02.05.01
status: done
v1_0: yes
category: 02-prompts-and-templates
topic: "02.05 `template.yaml` schema"
title: "template.yaml schema"
---

# 02.05.01 — `template.yaml` schema

**v1.0:** yes

**Implementation (2026-05-20):** `cli/lib/schemas/template.ts` exports `TemplateYamlSchema` (Zod) requiring `version: 1` literal, `id` (kebab-case), `kind: "vibe-reference"|"vibe-style"`, `category` enum (5 categories), `requires.{brand?, persona?, refs?, music_style?, voice_style?}`, optional `scenes[]`, etc. Loader at `cli/lib/templater/loader.ts` exports `locateTemplateManifest()`, `parseTemplateManifest()`, `loadTemplateManifest()`. Unknown `version` raises `E_TEMPLATE_VERSION_UNSUPPORTED`. Tests at `tests/unit/schemas-template.test.ts` + `tests/unit/template-loader.test.ts`.

**Acceptance criteria:**
- Schema: `{ version: 1, id, kind: "vibe-reference"|"vibe-style", category, requires: { brand?, persona?, refs?: int, music_style?, voice_style? }, scenes: SceneTemplate[], estimated_cost_usd, estimated_duration_s, references: string[] }`.
- `version: 1` is mandatory per [D-03](../02-prompts-and-templates/OPEN-QUESTIONS.md#decision-log). Missing or unknown version → loader errors with `E_TEMPLATE_VERSION_UNSUPPORTED`.
- `refs: int` is a single integer count for v1.0 (matches the flat `--ref` grammar from [D-02](../02-prompts-and-templates/OPEN-QUESTIONS.md#decision-log)); the 3-slot shape `{ character, style, product }` lands post-launch with `02.02.01`.
- Zod schema in `cli/lib/schemas/template.ts`. Reader keeps a `v1` parser; future `v2` reader gets added alongside the schema bump, with v1 staying supported for at least one major release cycle.
