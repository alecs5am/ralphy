# `generate voiceover` missing: cost log, `--speed`, voice clone verb, stability flags

> **Status:** issue
> **Filed:** 2026-05-29
> **Folder:** issues
> **Severity:** medium
> **Category:** cli

## Context

`ralphy generate voiceover` (ElevenLabs) has gaps that force agents to `curl` directly: cost not computed, no `--speed`, no voice-clone verb, no `--stability`/`--similarity-boost`/`--style` pass-through. The whole "clone narrator from source + tuned delivery" workflow goes through raw API calls outside the CLI.

## What

- `choose-your-guide-001`: GAP-5 — 25 voiceover calls reported `cost_usd: 0`; GAP-14 — speed + clone via raw curl. `remove_background_noise=true` mandatory on clone is tribal knowledge.
- `ralphy-vs-higgsfield-001`: #2 — no `ralphy voice clone`; 3 raw curl calls per clone; misleading `ralphy clone` verb is a visual template-style lift (name collision).
- `analog-horror-fridge-001`: user abandoned CLI after 3 takes and hand-generated 10 clips in the 11Labs UI to set `stability ~0.5`, `style 0` for the "Alerter" PSA voice.

## Why it matters

The VO chain has the highest "ship-vs-bail" rate in the CLI. When agents bail to the web UI, no `generations.jsonl` row gets written, no rollup, no manifest entry.

## Suggested fix

- `cli/commands/generate.ts → voiceover`:
  - Compute `cost_usd = ceil(chars/1000) * voice_price_per_kchar` and write to `generations.jsonl`.
  - Add `--speed <0..2>` flag.
  - Add `--stability`, `--similarity-boost`, `--style` pass-through.
- New verb `ralphy voice clone <audio> --name <n> [--isolate] [--denoise]`:
  - Wraps `/v1/audio-isolation` + `/v1/voices/add`.
  - Returns `voice_id` and logs to gen-log.
  - Defaults `remove_background_noise=true`.
- Rename the visual-clone verb `ralphy clone` → `ralphy template clone` to remove the name collision with voice clone.

## Sources

- `workspace/projects/choose-your-guide-001/postmortem/03-cli-issues.md` — GAP-5, GAP-14
- `workspace/projects/ralphy-vs-higgsfield-001/postmortem/03-cli-issues.md` — #2
- `workspace/projects/analog-horror-fridge-001/POSTMORTEM.md` — stability flags missing
