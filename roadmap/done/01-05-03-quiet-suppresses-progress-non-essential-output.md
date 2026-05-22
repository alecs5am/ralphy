---
id: 01.05.03
status: done
v1_0: yes
category: 01-cli
topic: "01.05 Common flag vocabulary"
title: "--quiet suppresses progress + non-essential output"
---

# 01.05.03 — `--quiet` suppresses progress + non-essential output

**v1.0:** yes

**Acceptance criteria:**
- `--quiet` exists on every verb; only the final result (JSON object) goes to stdout, only errors go to stderr. **[x]** — top-level `-q, --quiet` flag in `cli/index.ts` threads through `setQuiet()` in `cli/lib/ui.ts`; `ok/info/warn` and the `NdjsonEmitter` honor it.
- Compatible with `-p` (pretty + quiet = colored final result, no spinners / streams). **[x]** — quiet is orthogonal to the pretty/json mode.

**Notes:** Tested in `tests/unit/quiet-mode.test.ts` (5 cases) + `tests/integration/cli-quiet-flag.test.ts` (3 cases).
