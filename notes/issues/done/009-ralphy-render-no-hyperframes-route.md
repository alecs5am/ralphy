# `ralphy render` cannot drive HyperFrames projects

> **Status:** done — 2026-05-30
> **Filed:** 2026-05-29
> **Folder:** issues
> **Severity:** high
> **Category:** cli

## Context

AGENTS.md invariant #2 promises: "`ralphy render <id>` is the only path". In practice `render.ts` only knows the Remotion `UGCVideo` path and requires `composition-props.json`. Every project authored as `workspace/projects/<id>/index.html` (HyperFrames — the documented HF route) falls through to raw `bunx hyperframes render`, bypassing the gen-log, asset manifest, and quality gates.

## What

- `openrouter-ship-001`: ~23 renders this session all bypassed ralphy; `E_FILE_UNREADABLE: composition-props.json` on first try.
- `ralphy-vs-higgsfield-001`: ~15 invocations of `bunx hyperframes render` directly.
- `tokyo-y2k-001`: needed a stub `composition-props.json` even for a no-prop composition; STATIC_ROOT recipe contradicts existing examples (see issue 020).
- `odindoma-fb-ad-001`, `arena-rocker-001`: same pattern, including pure-clip deliverable cases where the user wants a loudnorm-only pass.

## Why it matters

The single-entry-point invariant is the load-bearing rule for cost accounting, append-only logs, and the gen-log of the editor stage. Currently it's aspirational, not actual.

## Suggested fix

- In `cli/commands/render.ts`:
  - Detect `workspace/projects/<id>/index.html` with `data-composition-id` → route to `cli/lib/render/hyperframes.ts`.
  - Make `composition-props.json` optional; accept `--composition <id>` to skip the file read.
  - Append a row to `generations.jsonl` for every render (Remotion AND HyperFrames).
- Add `ralphy render <id> --from-clip <path> [--loudnorm]` for pure-clip deliverables (loudnorm + faststart wrap, no recomposition).
- Add `ralphy project show <id> --remotion-paths` to print the exact STATIC_ROOT + symlink convention.

## Sources

- `workspace/projects/openrouter-ship-001/postmortem/03-cli-issues.md` — critical, ~23 renders bypassed
- `workspace/projects/openrouter-ship-001/postmortem/05-workflow-fixes.md` — Fix 1
- `workspace/projects/ralphy-vs-higgsfield-001/postmortem/03-cli-issues.md` — #1, workflow-fixes #1
- `workspace/projects/tokyo-y2k-001/postmortem/03-cli-issues.md` — #1, #2
- `workspace/projects/odindoma-fb-ad-001/postmortem/03-cli-issues.md` — #5
- `workspace/projects/arena-rocker-001/postmortem/03-cli-issues.md` — #3

## Resolution — 2026-05-30

Audit: Remotion was removed in commit `92ef823` (well before this issue was filed); the current `cli/commands/render.ts` already routes exclusively to `cli/lib/render/hyperframes.ts` and accepts `--composition <id>` with no `composition-props.json` requirement. The first two bullets of the suggested fix were already true on `main` — they just hadn't been verified by a test. The Remotion-paths helper is moot (no Remotion left to point at) and was skipped.

What landed in this PR:
- Added `--from-clip <path> [--loudnorm]` for pure-clip deliverables (faststart-wrap + optional loudnorm / grade / compress chain). All paths log a canonical `provider: "ffmpeg"` row to `generations.jsonl`, preserving AGENTS.md #2.
- New `tests/integration/cli-render-from-clip.test.ts` covers the dry-run plan shape, missing-file refusal, the live wrap+loudnorm path, and a lock-in test asserting `composition-props.json` / `UGCVideo` / `remotion` no longer appear in `render.ts`.
- Regenerated `docs/cli-surface.generated.md` to capture the new flag.
