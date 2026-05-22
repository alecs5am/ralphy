---
id: 01.10.01
status: done
v1_0: yes
category: 01-cli
topic: "01.10 Single-file CLI surface enumeration"
title: "docs/cli-surface.md lists every verb"
---

# 01.10.01 — `docs/cli-surface.md` lists every verb

**v1.0:** yes

**Implementation:** [`scripts/build-cli-surface.ts`](../../scripts/build-cli-surface.ts) parses `cli/index.ts` for every `program.addCommand(<verb>Cmd())` registration, runs `<verb> --help` against each, and writes a structured doc to [`docs/cli-surface.generated.md`](../../docs/cli-surface.generated.md). CI gate via `bun run cli:surface:check` (exits non-zero on drift). Hand-curated `docs/cli-surface.md` stays as the narrative companion. Generated doc covers 34 verbs across ~1017 lines. Tests: [`tests/unit/build-cli-surface.test.ts`](../../tests/unit/build-cli-surface.test.ts) (3 cases).

**Acceptance criteria:**
- One document with: every verb (current + v1.0-planned), one-line description, full signature, status (`today`/`v1.0`/`post-v1.0`), category cross-ref.
- Organized by resource (`brand`, `persona`, `project`, …) and by front-stage verb (`trend`, `clone`, `iterate`, `mcp`, `skill install`, `render`).
- Regenerated from `cli/commands/` + roadmap SPECs by a script.
- Initial hand-curated version landed alongside this SPEC; auto-gen lands per [`07.03.01`](../07-socials-and-docs/PRD.md).
