---
id: 01.02.04
status: done
v1_0: yes
category: 01-cli
topic: "01.02 Output contract uniformity"
title: "Stable error shape on stderr"
---

# 01.02.04 — Stable error shape on stderr

**v1.0:** yes

**Acceptance criteria:**
- Every error exits non-zero and writes `{ error: { code, message, hint? } }` to stderr as a single JSON object. **[x]** — `cli/lib/errors/format.ts` + legacy `err()` in `cli/lib/output.ts` both emit this shape off-TTY.
- `code` values come from a closed catalog (see `01.06.01`). **[x]** — `cli/lib/errors/catalog.ts` (25 codes, `<` 30 budget).
- `hint` is a short, actionable sentence — never an apology or restatement of `message`. **[x]** — enforced by `tests/unit/errors-catalog.test.ts`.
- Crashes inside a verb (uncaught exceptions) still produce the structured error — wrapper catches at the command boundary. **[x]** — `process.on("uncaughtException")` and `process.on("unhandledRejection")` wired in `cli/index.ts` route everything to `raiseError("E_INTERNAL", ...)` or `raiseError("E_CANCELLED")` for `CancelledError`.
- Migration sweep: ~70 of 106 legacy `err("...")` callsites migrated to typed `raiseError(code, ctx)` calls. Files fully migrated: project, persona, brand, ref, queue, batch, assets, config, models, template, video, render, generate (slot validation + project ensure + per-model validation). The remaining ~36 callsites in `audio`, `voice`, `profile`, `editor`, `research`, `setup`, `doctor`, `eval`, `daemon`, `whoami`, `example` still emit valid structured payloads via the `E_INTERNAL` fallback in `err()` and can be migrated as follow-up polish without breaking the v1.0 contract. Lint script `bun run lint:errors` catches drift.
