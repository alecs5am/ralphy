# `ralphy workspace eval <project>` runner + engine + scorecard

> **Status:** done — 2026-06-18
> **Filed:** 2026-06-18
> **Folder:** issues
> **Severity:** high
> **Category:** eval / cli

## Context

With the config framework (#468) in place, a runner is needed to score a project against its workspace's custom criteria and emit a machine-readable scorecard that the repair loop (#473) and the studio gates (#472) consume.

## What

Add a verb `ralphy workspace eval <project>` (or `ralphy eval workspace`) plus an engine that runs the configured criteria: deterministic ones computed in code; vision ones via one `callLLM()` deep-vision pass against the workspace rubric. Output a `workspace-eval.json` scorecard + a markdown report.

## Why it matters

A single command turns the universe rubric into an actionable scorecard; without it the configured criteria are inert.

## Scope / acceptance

- Verb registered in `cli/index.ts` under the `workspace` group (or an `eval workspace` subcommand). Engine `cli/lib/eval/workspace-evaluators.ts`.
- Reuse, do not reinvent: `callLLM()` (no ad-hoc provider calls), the `Finding` shape (`cli/lib/eval/types.ts`), the scoring/penalty model (`cli/lib/eval/findings.ts`), and the deep-vision prompt composition (`cli/lib/eval/deep-vision.ts`).
- Output `workspace-eval.json` mirrors `eval.json` v1.0 + a `criteria[]` array (`{ id, score, verdict, threshold, findings }`) and an overall verdict. Markdown via the existing report-renderer pattern.
- Verdict vocabulary aligns with the readiness scorecard #427 (`ship`/`repair`/`needs-user-decision`/`blocked`) so it feeds #457 and the repair loop #409.
- `out()` pretty-mode coverage (dev-playbook policy) + a JSON-assertion smoke test in `tests/unit/` (run via `bun run cli/index.ts`, not `bunx tsx`).
- Append-only output (auto-version on re-run).

## Dependencies and linked work

- Config framework: #468.
- Deep-vision engine: #411.
- Feeds quality flywheel #457 and repair loop #409.
- Blocks #470, #475; consumed by #472, #473.

## Notes

- gemini-3.1-pro deep-vision rejects mp4s over ~40 MB — reuse the downscale workaround `ralphy eval video` uses (MODELS.md video-analysis failure mode).
