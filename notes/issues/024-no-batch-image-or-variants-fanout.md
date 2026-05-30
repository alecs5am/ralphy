# Missing verb: `generate image --batch` / `--variants` fan-out

> **Status:** done — 2026-05-30
> **Filed:** 2026-05-29
> **Folder:** issues
> **Severity:** medium
> **Category:** cli

## Context

`--variants N` (where it exists) is same-prompt-only. For N-different prompts (sticker pack, anchor set, FB ad pack, App Store creatives), the agent hand-writes a bash loop with manual `&`+`wait` concurrency, no cost rollup, no per-call manifest entry.

## What

- `free-air-vpn-stickerpack`: 32-sticker pack required `/tmp/gen_stickers.sh` with manual chunks (#4, top-3 roadmap).
- `sotaocr-fb-001`: 2 hand-rolled bash batches (23 + 9 concurrent), ~10 min bash-glue across sessions.
- `appstore-takeaminute-001`: 32-image batch hand-rolled per-slot dispatcher.

## Why it matters

The batch use case is core for any creative-pack project. Bash glue means no cost rollup, no idempotent retry, no manifest provenance.

## Suggested fix

- `ralphy generate image --batch <prompts.jsonl> --concurrency N` — one line per slot/prompt/ref, respects per-model concurrency from MODELS.md.
- `ralphy generate image --variants N` — single prompt, N variants, auto-suffix `<slot>-v1..vN`.
- `ralphy generate image-batch --prompts-dir <dir> --model <id> --size <WxH> --ref <ref...>` — each `*.txt` file becomes one slot named by stem.
- Add `--dry-run` cost preview: "N × model = $Y est, ETA Z sec."
- Touch `cli/commands/generate.ts`.

## Sources

- `workspace/projects/free-air-vpn-stickerpack/postmortem/03-cli-issues.md` — #4
- `workspace/projects/sotaocr-fb-001/postmortem/03-cli-issues.md` — #2, workflow-fixes #3
- `workspace/projects/appstore-takeaminute-001/POSTMORTEM.md` — 32-image fan-out
