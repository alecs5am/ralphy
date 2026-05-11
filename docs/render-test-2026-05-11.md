# Render-test report — Top-5 templates × YouTube topic

Date: 2026-05-11. Method: 5 parallel general-purpose subagents, each given a $2 budget cap and instructed to act as producer for one template against the same brief context ("user wants a cool video about YouTube"). Each ran the full pipeline: scaffold → scenarist → art-director → editor → render → `ralph-evaluator`.

Companion to the static audit (`docs/template-audit-2026-05-11.md`). Where the audit scored documentation surface, this report scored **production reality**.

## Scoreboard

| # | Template | Topic | Render | Cost | Eval verdict | Headline issue |
|---|---|---|---|---|---|---|
| 1 | `ai-avatar` | YouTube algorithm signals (expert explainer) | ❌ stopped at scene-01 | $1.27 | n/a (no mp4) | `veo-3.1-fast` real cost ~$1.12/8s ≈ **4.5× the documented $0.25** |
| 2 | `brainrot-ai-meme` | YouTube sold for $1.65B (history fact) | ✅ 42.1s mp4 | $0.15 | WARN 64/100 | Asset auto-pull broken; manual Remotion authoring required |
| 3 | `grwm` | Lost 100K subs after one tweet (storytime) | ✅ 47.1s mp4 | $1.55 | **FAIL 52/100** | `kling-v3.0-std` bills **flat $0.70/5s = identical to pro**, format jump-cut signature collapsed |
| 4 | `tutorial-how-to` | First 1000 subs in 2026 (3-step method) | ✅ 41s mp4 | $1.87 | **FAIL 49/100** | `seedance-2.0-fast` real cost ~$0.56/≤4s = **3× the documented $0.05/s**; @remotion/transitions create gradient blends not hard cuts |
| 5 | `podcast-clip` | Samir Chaudry on Greg Isenberg podcast | ✅ 40.9s mp4 | $0.15 | WARN 87/100 | **5 CLI verb mismatches** with cookbook; Scribe truncates at 30 min silently; smart-crop verb absent |

**Total spend: $5.00** (under $10 worst-case ceiling). **Renders shipped: 4 of 5.**

## Three classes of issues

### Class 1 — Systemic infrastructure gaps (affecting most/all templates)

**1.1 Pricing tables in `cli/lib/providers/media.ts` are stale or missing entries.** OpenRouter video models bill **per-clip flat**, not per-second. The `VIDEO_PRICE_PER_SEC` data structure assumes linear per-second scaling that doesn't match observed billing. At least three models confirmed wrong:

| Model | Documented | Observed | Multiplier off |
|---|---|---|---|
| `google/veo-3.1-fast` | $0.25/clip | $1.12/8s clip | **4.5×** |
| `kwaivgi/kling-v3.0-std` | $0.07/s (half of pro) | $0.70/5s clip flat (= pro) | **2×** |
| `bytedance/seedance-2.0-fast` | $0.05/s | $0.56/≤4s clip flat | **~3×** |

Every cost ballpark in every template doc inherits this drift. ai-avatar's "$20 for 10 markets" multilingual pitch is actually ~$80-100. grwm's "$4.60 minimum" is actually ~$5-6. Tutorial's "$2 60s tutorial" is structurally infeasible.

**1.2 No composition scaffolder.** All 5 templates required manual authoring of `src/videos/<id>/index.tsx` + registration in `src/Root.tsx` + `composition-props.json`. The producer playbook (`docs/playbooks/producer.md`) explicitly forbids writing Remotion code. This makes every template a dead-end after the asset-generation phase. The `vibe-reference` / `vibe-style` distinction is **leaky**: vibe-reference templates have `composition.md` but that's a doc, not runnable code; vibe-style templates have no composition guidance at all. Both classes require equal-effort manual Remotion authoring per project.

**1.3 Score gate hardcoded to 15s ad schema.** `ralphy project score` enforces:
- `hook.primary` (single string, mandatory)
- `angle ∈ {testimonial, unboxing, problem-solution, comparison, demo}`
- per-scene `durationSec`
- Total duration ≤ 15s

AGENTS.md hard invariant #4 states "Quality gates refuse, not warn." By-the-book none of the 4 successful renders should have happened. All 4 subagents performed manual schema injection (fake `angle: "comparison"`, fake `durationSec`) just to pass the gate. The gate is calibrated for one specific format (15s e-commerce ad) and refuses everything else, including 4 of the top-5 viral formats.

### Class 2 — Template-specific bugs

**2.1 `ai-avatar` cookbook references `--audio-mode native|silent` flag that doesn't exist.** This was introduced in yesterday's FAL → veo fix commit (`e91fb87`). I extrapolated from MODELS.md's note about EN/zh language safety into a CLI flag that was never implemented. The whole multilingual "silent veo + ElevenLabs mix" recipe is currently fiction. **Fix scope: revert that section of `prompt-cookbook.md` OR implement the flag in `ralphy generate video`.**

**2.2 `brainrot-ai-meme` asset auto-pull silently broken.** `ralphy template use brainrot-ai-meme` returned `copied_assets: []` despite the template.json declaring a required asset. Filename also drifts: docs say `gameplay-loop.mp4`, install lands at `cs-surf-loop.mp4`. CS-surf canonical asset has burned-in HUD (Speed/Stage/PB counters) which violates the template's own `prompt-cookbook.md §8` mistake #4 ("no on-screen game UI"). **Fix scope: debug auto-pull in `cli/commands/template.ts`; re-export the asset with HUD masked; reconcile filenames.**

**2.3 `grwm` budget assumption wrong → format signature destroyed.** Cookbook assumes kling-std is half-price of pro. Actual: identical billing. Subagent fell from 6-8 planned clips to 2, padded with Ken Burns on the persona keyframe. 32 of 47 seconds are the same static portrait. GRWM's primary retention hook is the jump-cut tempo — without it the format reads as "static portrait video", FAIL 52/100. **Fix scope: rewrite cost ballpark, add a budget-floor warning section to cookbook.**

**2.4 `tutorial-how-to` pacing claim aspirational.** `@remotion/transitions` named transitions (slide/wipe/fade presentations) render as gradient blends. The evaluator's scene-cut detector merges them as a single long scene. Found 4 hard cuts in 41s vs target ≤2s/cut. The "1-2s micro-cuts" pacing claim is **not achievable** with the Remotion pattern the template seems to imply. **Fix scope: add a `composition.md` with a snap-cut recipe using hard `<Sequence>` swaps + `OffthreadVideo startFrom/endAt` sub-cuts.**

Also: `TransitionSeries.Transition` overlap math drifted VO `Sequence` past visual track → 2-sec black hole at end. Eval flagged as the only `fail`-severity finding.

**2.5 `podcast-clip` has 6 separate seams.** This is the most multi-tool-risky template in the pack and rendered anyway, but with severe friction:
   - **Scribe single-file truncation at ~30 min, silent.** 57.7-min source → transcript ends at 1769s (29.5 min). CLI does not chunk. No warning. Picker only saw first half.
   - **5 CLI verb mismatches with cookbook:** `ralphy ref pull` takes URL as positional, not `--url`; `ralphy video extract-segment` has `--in --out` not positional `<ref-slug>`, no `--snap-to-words`, no `--pad-*`; `ralphy generate composition` does not exist; `ralphy render` has `--composition` not `--cut` / `--all`; `ralphy project create` is actually `ralphy template use`.
   - **Transcript schema mismatch.** Cookbook documents `{word, start, end}`. Actual Scribe output: `{text, startMs, endMs, timestampMs, confidence}`. Downstream consumers following the cookbook silently produce nulls.
   - **Cost telemetry leak.** Scribe ($0.118) and Gemini picker (~$0.04) costs never made it to `generations.jsonl`. Workspace stats under-report by ~80%.
   - **`find-viral-moments.ts` is an orphan script** at `.agents/skills/ralph-researcher/scripts/find-viral-moments.ts`, not a `ralphy` verb — violates AGENTS.md hard invariant #2.
   - **No `ralphy video smart-crop` verb.** The face-bbox library exists at `cli/lib/face-bbox.ts` but has no CLI wrapper. Render fell back to letterboxed 16:9-in-9:16 with massive black bars.

### Class 3 — Cross-cutting CLI / scenarist gaps

**3.1 VO timing drift +57-71%, not the 15-25% MODELS.md documents.**
- brainrot: 45s script → 76.8s VO (+71%)
- grwm: 30s script → 46.9s VO (+57%)

Scenarist's word→duration math is off by 2-3× the documented drift. Reasonable fix: use `sec ≈ words / 2.5` instead of `/ 3`, then trim during scenarist pass rather than discovering at TTS pass.

**3.2 No `ralphy scenarist` CLI verb.** All 5 subagents wrote scenario manually. The playbook describes the role but the verb isn't there. Either reaffirm it's purely a chat-driven role with no CLI surface, or build a `ralphy scenario create --template <slug> --brief "<text>"` wrapper.

**3.3 Cost telemetry incomplete.** Beyond podcast-clip's Scribe leak, multiple subagents reported partial cost tracking. The `generations.jsonl` schema may need a wider net: every billable external call should hit it.

**3.4 `TEMPLATE_ORIGIN.md` scaffold writes broken references.** Confirmed for ai-avatar and brainrot-ai-meme (both vibe-style). The scaffold in `cli/commands/template.ts` writes references to `reference-example.md / fragments.md / model-stack.md / composition.md` for all dir templates regardless of kind. vibe-style templates don't ship these files. **Fix scope: branch on `meta.kind` in the scaffold writer.**

## Action plan

### P0 — Block before next test-drive

| # | What | File(s) | Notes |
|---|---|---|---|
| P0.1 | Fix pricing tables — add per-clip flat billing for veo-3.1-{fast,lite}, seedance-2.0-{fast}, kling-v3.0-std; sync MODELS.md + every template cookbook that quotes costs | `cli/lib/providers/media.ts`, `MODELS.md`, `templates/*/prompt-cookbook.md`, `templates/*/TEMPLATE.md` | Without this, P0 → P1 test-drives keep falling out of budget |
| P0.2 | Remove unimplemented `--audio-mode native\|silent` flag from ai-avatar cookbook | `templates/entertainment-viral/ai-avatar/prompt-cookbook.md` | My yesterday's bug — revert that section |
| P0.3 | Fix score-gate calibration: either widen on template-declared `typicalDurationSec` OR downgrade to advisory | `cli/lib/score/*.ts` or wherever `ralphy project score` lives | AGENTS.md invariant #4 says refuse — but if it refuses everything beyond 15s, the invariant is broken in practice |
| P0.4 | Fix `TEMPLATE_ORIGIN.md` scaffold to branch on `meta.kind` — vibe-style templates only get `TEMPLATE.md` + `hooks.md` + `prompt-cookbook.md` refs | `cli/commands/template.ts` (look for `TEMPLATE_ORIGIN` block) | Affects every template scaffold operation |

### P1 — Unlocks "vibe-style cookbook" → "actually shippable"

| # | What | Notes |
|---|---|---|
| P1.5 | Generic scenario-driven Remotion compositions per template (BrainrotAIMeme, AiAvatar, TutorialHowTo, GRWM, PodcastClip) in `src/lib/components/`. `ralphy template use` scaffolds `composition-props.json` + symlinks the right composition into `src/videos/<id>/index.tsx`. | This is the biggest payoff — collapses 4-step manual surface to zero |
| P1.6 | Add `ralphy video smart-crop` verb wrapping `cli/lib/face-bbox.ts` | Unblocks podcast-clip + any future reframe-heavy template |
| P1.7 | Promote `find-viral-moments.ts` to `ralphy ref viral-moments <slug>` verb (AGENTS.md invariant #2) | Brings the picker under the canonical CLI surface |

### P2 — Polish

| # | What | Notes |
|---|---|---|
| P2.8 | Scribe chunking for >30 min sources in `ralphy ref transcribe` | Or at minimum, refuse-with-message instead of silent truncation |
| P2.9 | Capture Scribe + vision picker costs in `generations.jsonl` | Workspace stats accuracy |
| P2.10 | Re-export CS-surf canonical asset with HUD masked + rename to `gameplay-loop.mp4` | Asset-side fix in `ralphy-assets` repo |
| P2.11 | Tutorial-how-to: add `composition.md` with snap-cut recipe replacing `@remotion/transitions` | Unblocks the pacing-target claim |
| P2.12 | Scenarist VO duration math: `sec ≈ words / 2.5` + trim during scenarist pass | Stops the +57-71% drift surfacing at TTS time |

## What the eval scores tell us

Two FAIL verdicts, two WARN verdicts, one no-render. Pattern:
- **Higher score** → format that needs less per-clip video generation (`podcast-clip` 87 uses Scribe + ffmpeg over found footage; `brainrot-ai-meme` 64 needs one AI image + canonical gameplay loop)
- **Lower score** → format that needs many parametric video clips (`grwm` 52 needs 6-8 jump-cuts; `tutorial-how-to` 49 needs 6 step-segments)

This suggests the pack is **most fragile where it depends most on per-clip OR billing being predictable**. P0.1 fixing pricing alone will improve grwm/tutorial reproducibility significantly.

## What to do with the rendered mp4s

4 mp4s exist in `workspace/projects/test-{brainrot,grwm,tutorial,podcast}-yt-001/render/final.mp4`. They are gitignored. **Do not yet add as `examples/` entries in ralphy-assets** — shipping broken renders as canonical examples is bad UX. Re-render the same briefs after P0 + P1 land and use those as the example set.

## Reproducibility

Each subagent's full transcript is in `/private/tmp/claude-501/.../tasks/<agent-id>.output` (ephemeral). The 5 agent IDs are noted in the prompt history of the orchestrator session that produced this doc.

Source URL for the podcast-clip test: [Greg Isenberg × Samir Chaudry — How Creators Can Thrive in the AI + AR Era](https://www.youtube.com/watch?v=e1NgZ7MoAf8) (57.7 min).
