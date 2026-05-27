---
id: 01.06.01
status: done
v1_0: yes
category: 01-cli
topic: "01.06 Exit codes and error catalog"
title: "Error code catalog committed and stable"
---

# 01.06.01 — Error code catalog committed and stable

**v1.0:** yes

**Acceptance criteria:**
- `cli/lib/errors/catalog.ts` exports a typed enum of every `code` the CLI can emit; total < 30 distinct codes for v1.0. **[x]** — 25 codes across 6 classes (user / provider / env / gate / runtime / cancelled).
- Each entry has `{ code, http_analog?, message_template, hint_template, related_docs, deprecated?: boolean, replaced_by?: string }`. **[x]** — typed via `ErrorEntry` interface.
- New errors must be added to the catalog before being thrown — tested by a `lint:errors` script that greps for thrown errors and verifies their code is in the catalog. **[x]** — `scripts/lint-error-codes.ts`, wired via `bun run lint:errors`. Currently 0 violations across 76 scanned files.
- **Stability policy (per [D-07](../01-cli/OPEN-QUESTIONS.md#decision-log)):** the catalog becomes **append-only** at the v1.0 cut. Renames forbidden, removals forbidden. Deprecating a code requires flipping `deprecated: true`, naming the successor via `replaced_by`, and adding a CHANGELOG entry. Deprecated codes continue to be emitted by the CLI for at least one major version. Pre-v1.0, renames are still allowed but each one needs a one-line CHANGELOG callout so the freeze starts from a clean baseline.
- `docs/cli-spec.md` (or `docs/error-codes.md`) includes the full catalog as a generated section; the page is the public source of truth.
