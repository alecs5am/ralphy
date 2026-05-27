---
id: 01.06.02
status: done
v1_0: yes
category: 01-cli
topic: "01.06 Exit codes and error catalog"
title: "Exit codes mapped to error code classes"
---

# 01.06.02 — Exit codes mapped to error code classes

**v1.0:** yes

**Acceptance criteria:**
- `0` — success.
- `1` — generic runtime failure (an unmapped code; should approach zero occurrences by v1.0).
- `2` — user error (bad flag, missing file, invalid input).
- `3` — provider error (API down, rate limit, validation fail).
- `4` — environment error (missing dep, missing key).
- `5` — quality-gate refusal (score below threshold).
- `130` — cancelled by SIGINT.
- Documented in `docs/cli-spec.md` and used consistently. **[x]** — implemented via `classifyExitCode()` in `cli/lib/errors/catalog.ts`.
- **Stability policy:** the exit-code class set is locked at v1.0 (per [D-07](../01-cli/OPEN-QUESTIONS.md#decision-log)). Adding a new class requires a major-version bump.
