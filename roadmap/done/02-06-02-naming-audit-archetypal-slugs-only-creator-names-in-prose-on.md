---
id: 02.06.02
status: done
v1_0: yes
category: 02-prompts-and-templates
topic: "02.06 TOP-5 template hardening"
title: "Naming audit — archetypal slugs only, creator names in prose only"
---

# 02.06.02 — Naming audit — archetypal slugs only, creator names in prose only

**v1.0:** yes — per [D-05](../02-prompts-and-templates/OPEN-QUESTIONS.md#decision-log).

**Implementation (2026-05-20):** `cli/lib/schemas/template.ts` exports `validateSlug()` + `DENIED_SLUG_TOKENS` (hormozi, mr-beast, oldspice, kardashian, rogan, huberman, tornow, codie-sanchez, alex-becker). Whole-token matcher avoids false positives (e.g. "arogant-pov" doesn't trip on "rogan"). Lint script `scripts/lint-templates.ts` (`bun run lint:templates`) walks every shipped template + asserts the slug rule + the v1 YAML manifest. Audit of current 55-slug roster: 0 offenders. Tests at `tests/unit/lint-templates.test.ts` + `tests/unit/templates-migration.test.ts`. New error code `E_TEMPLATE_SLUG_INVALID` in catalog.

**Acceptance criteria:**
- Pass through every slug under `templates/<category>/<slug>/`; flag any that embed a real person's or brand's name (e.g., `hormozi-...`, `mr-beast-...`, `oldspice-...`).
- Rename flagged slugs to archetypal equivalents (`deadpan-monologue-pov`, `cold-open-reveal`, `bright-pastel-commercial-register`). Old slug stays as an alias in `template.yaml` (`aliases: ["<old>"]`) for one major-release cycle, then drops.
- Creator references stay allowed as **prose** inside the template's `README.md` / `composition.md` ("emulates the Old Spice 2010s commercial register") — never in the slug, file path, or CLI surface.
- Add a lint rule (`bun run lint:templates`) blocking new templates whose slug contains a recognizable creator/brand token; maintainer-driven manual list of blocked tokens in `cli/lib/schemas/template.ts`.
