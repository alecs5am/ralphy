---
id: 01.02.05
status: done
v1_0: yes
category: 01-cli
topic: "01.02 Output contract uniformity"
title: "--dry-run semantics standardized"
---

# 01.02.05 — `--dry-run` semantics standardized

**v1.0:** yes

**Implementation:** `--dry-run` + `--summary` flags landed on `generate image`, `generate video`, `generate voiceover`, `generate music`, `render`. Single-step verbs accept `--summary` as no-op (per D-06). `render --dry-run --summary` collapses to per-stage rollup. Coverage tests: [`tests/integration/cli-dryrun-coverage.test.ts`](../../tests/integration/cli-dryrun-coverage.test.ts) (6 cases) + existing [`cli-dryrun.test.ts`](../../tests/integration/cli-dryrun.test.ts).

**Acceptance criteria:**
- `--dry-run` exists on every verb that calls a paid API or mutates non-log workspace state.
- Default output is the **full unrolled plan**: JSON with `{ would_call: [...], cost_estimate_usd, would_write: [...] }`. Each `would_call` entry includes `{ stage, model_id, slot, prompt_hash, est_usd, latency_hint_s }`. See [D-06](../01-cli/OPEN-QUESTIONS.md#decision-log).
- `--summary` collapses `would_call` to a per-stage rollup `{ stage: { count, model_picks: {...}, est_usd } }` and omits `would_write`. Multi-step verbs (`iterate`, `render`, `batch run`) must support it; single-step verbs (`generate image|video|voiceover|music`) accept the flag as a no-op for shell-script consistency.
- Exit 0 if the dry-run "would have worked"; non-zero with the same error shape if validation would fail.
- Test: every verb with `--dry-run` proves it does not make a paid API call (parsed from `generations.jsonl` after run — must be empty for the project).

**Notes:** today `generate video` has it; `generate image`, `generate voiceover`, `generate music`, `iterate`, `render`, `batch run` do not. Pretty rendering on TTY uses a per-stage collapsible table for the full form, and a flat 5-7-line table for `--summary`.
