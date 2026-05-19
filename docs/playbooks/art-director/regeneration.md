# Regeneration & variants

## The one-retry rule

**One retry max on the same approach. If the second attempt also misses, redesign the scene.**

Concrete pattern from glitter-cream-001 rule #7:
- Take 1: "jar near cheek, finger taps the lid" → Kling renders as "applying powder compact". Miss.
- Take 2: "jar near cheek, **NOT applying makeup**, finger taps lid clearly visible" → still "powder compact". Miss.
- Take 3 (correct path): **redesign the scene** to "jar tilted at arms-length, two-handed, dropper held above" — completely different staging, different basin. Worked first try.

The wrong move: a 3rd, 4th, 5th prompt tweak on "jar near cheek" — each $0.42, each producing a slight variation of "powder compact". Total burn: $1.26 for nothing.

Why this works: Kling (and seedance, and veo) have strong source-archetype priors. When a verbal description triggers a known basin ("hand near face holding something" → "applying makeup"), `DO NOT do X` negation rarely escapes the basin — the model has 10,000× more training data for the canonical interpretation than for the variant the user wants. A redesign that uses different framing / posture / camera angle pivots into a different basin entirely.

| Failure mode | Retry once with… | If still wrong → |
|---|---|---|
| Aesthetic mismatch (lighting, color) | explicit color/light tokens | Redesign scene |
| Identity drift (wrong face / wardrobe) | add `--ref <master>` | Re-gen the master, then re-anchor |
| Wrong action (jar→powder compact, hack→cooking) | cultural framing instead of literal | Redesign scene with different staging |
| Aspect / framing wrong | explicit "tall vertical portrait shot" | Pre-anchor with `--first-frame` portrait |
| Anatomy broken (limb count, body geometry) | specific negative ("no third arm") | Switch model (gemini → gpt-5.4-image-2 for portraits) |
| Music ToS rejection | the API's `prompt_suggestion` verbatim (now structured per Fix #8) | Drop named refs, use genre+tempo only |
| 400 base64 on kling `--last-frame` | the auto-C2PA-strip should catch (commit a64e94b) | Fall back to seedance multi-frame |

The CLI now auto-archives the existing slot file to `<slot>.v{N}.<ext>` on every regen (commit 753d2f7) — "try once more then redesign" is risk-free at the file-system level. Pass `--force-overwrite` only on explicit "просто перепиши" from the user.

Always surface the redesign to the user before generating: "Kling rendered the jar-near-cheek shot as 'applying powder compact' on both takes. Suggest redesigning to jar-at-arms-length, two-handed, with the dropper held above. Generate?"

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
