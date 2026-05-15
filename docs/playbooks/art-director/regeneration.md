# Regeneration & variants

## Single-slot regen

**When:** "regenerate scene-01 background", "VO for clip-04 isn't right", "try a different model for the hero shot".

**Steps:**

1. Read the existing `prompts.json[<slot>]`.
2. Read `generations.jsonl` — filter by slot — so as NOT to repeat a prompt+model combo that has already failed.
3. Confirm with the user:
   - Updated prompt (or "same prompt, new seed/model").
   - Estimated cost (one line from MODELS.md).
4. Run **`ralphy generate <kind>`** for this slot only. **Append-only**: the new file lands at `assets/<kind>/<slot>.v<N+1>.<ext>` (auto-incremented), the previous version is left on disk and stays referenced in `generations.jsonl`. Never pass `--overwrite` or hand-delete the old file — even if the user says "регенерируй", that is not consent to delete the previous artifact. Cleanup is a separate, explicit request (`ralphy project clean <id> --slot <slot>` once that verb exists, or user-typed `rm`).
   ```
   ralphy generate image --project <id> --slot <slot> --model <m> --prompt <p> [--ref <url>]
   ```
5. `asset-manifest.json` updates automatically (new entry or new version).
6. Chat: what changed, cost, path.

**Hard rule:** don't write a runtime TS script under `workspace/projects/<id>/scripts/regen-XX.ts`. If `ralphy generate` doesn't cover the case — stop, extend `cli/commands/generate.ts`, don't copy code into the project.

## A/B variants (compare-variants sub-task)

**When:** the user wants 2-3 variants of one slot to choose from.

**Steps:**

1. Generate N assets with **distinctly different** inputs (not identical seed). The variation axis — one at a time: prompt wording / seed / model / voice_id.
2. `ralphy generate <kind>` with the `--variant <N>` flag — written as `assets/<kind>/<slot>.v<N>.<ext>`.
3. Each call is logged with `note: "variant <N> - <axis>: <value>"` (automatically via ralphy).
4. **Don't update `asset-manifest.json` immediately.** First show the variants to the user, wait for the choice, then promote the chosen one → canonical path in the manifest.

## Post-regeneration quality gate

After every regeneration — `scoreImage` / `scoreVideo` (see `quality-gate.md`). Two failures in a row → stop, report to the user with three options (better ref / different model / different shot).

## VO regeneration triggers caption regen

If you regenerated a voiceover for any slot — captions need to be regenerated too (whisper is tied to the exact audio). After a voiceover slot:

```
ralphy generate captions --project <id> --slot <slot>
```

This is part of `generate-assets`, not a separate sub-task.
