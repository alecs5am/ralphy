---
id: 01.03.02
status: done
v1_0: yes
category: 01-cli
topic: "01.03 Help system depth"
title: "Every front-stage verb's --help ends with an Examples block"
---

# 01.03.02 — Every front-stage verb's `--help` ends with an `Examples` block

**v1.0:** yes

**Implementation:** `Examples:` blocks added to `clone`, `render`, `new`, `skill install` via `addHelpText("after", ...)`. Landing grep test via [`scripts/lint-help-examples.ts`](../../scripts/lint-help-examples.ts) — extracts every `ralphy <...>` literal from `landing/`, classifies v1.0 vs post-launch, fails when a v1.0 example isn't found in the corresponding `--help`. Wired via `bun run lint:help-examples`. Tests: [`tests/unit/lint-help-examples.test.ts`](../../tests/unit/lint-help-examples.test.ts) (8 cases).

**Acceptance criteria:**
- Each of `trend`, `clone`, `iterate`, `mcp`, `skill install`, `render` has at least 3 examples in `--help`.
- Examples are **byte-identical** to a corresponding string in `landing/components/**` (grep test enforced in CI).
- Each example is runnable as-is on a freshly-set-up machine — no implicit dependencies on prior state.

**Notes:** the grep test is the enforcement; soft promises rot.
