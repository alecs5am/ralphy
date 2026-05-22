---
id: 01.02.01
status: doing
v1_0: yes
category: 01-cli
topic: "01.02 Output contract uniformity"
title: "JSON-default stdout off-TTY; pretty-default on-TTY"
---

# 01.02.01 — JSON-default stdout off-TTY; pretty-default on-TTY

**v1.0:** yes

**Acceptance criteria:**
- Every verb emits a single JSON object to stdout on success when `process.stdout.isTTY === false` (piped, redirected, or `--json` passed), even non-data verbs like `setup` (returns a summary).
- On TTY with no `--json`, every verb renders pretty (cli-table3 for arrays, colored key:value for objects, spinners for long ops) — universal, no per-verb allow-list. See [D-02](../01-cli/OPEN-QUESTIONS.md#decision-log).
- Schema is documented in `docs/cli-spec.md` per verb.
- `--json` forces JSON unconditionally (overrides TTY auto-detect — for users who want machine output inside an interactive shell).
- Audit: `bun run cli-audit-output` (new script in `scripts/`) parses every verb's stdout in a piped sample run and fails if any returns non-JSON without an explicit text-mode flag.

**Notes:** TTY-routing infrastructure landed in [`cli/lib/output.ts`](../../cli/lib/output.ts) + [`cli/lib/ui.ts`](../../cli/lib/ui.ts) (commits `bee7f59`, `03ccf9a`); remaining gaps are `audio`, `video` (ffmpeg recipes — currently print human strings), `assets pull`, and `example pull` — these still bypass `out()`.
