# Gate usefulness audit, October 2026 (#569)

**Question.** Most gates were written when generation models were weaker. Which ones still improve results or prevent real defects, and which only cost time and tokens?

**Method in one line.** Free first: every stored gate report on the maintainer machine was tallied, the deterministic gates were re-run for real over the stored inputs and the on-disk caption tracks, scenarios and projects, the model-graded gates were assessed from their stored outputs and from the code, and a sample of findings was checked by eye against the frames and contact sheets. No paid provider call was made.

## TL;DR

- **The evidence base is thin and one-sided.** 68 stored `eval.json` reports across 19 projects, 29 of them full-video model runs. No outcome labels exist yet (#558 tables are empty), no repair-plan item was ever approved, and the calibration datasets point at fixture videos that are not in the repo. False-negative rates are unmeasurable; false-positive rates below come from the auditor's own inspection.
- **Three checks produced most of the noise, and all three were measurement or format artifacts:**
  1. `structure.hook-zone-static` fired on **61 of 68** reports (every project), was acted on **1 time in 22** iterations, and was wrong on **7 of 7** openings inspected (animated openers, a static frame around a moving panel, deliberate continuous shots). The full-video model judged the same openings as working in 12 of 20 co-fires.
  2. `format.resolution` fired on 34 reports; **18** were 9:16 renders at or above 1080x1920 (17 at 2160x3840). Acted on 0 times in 25 iterations.
  3. The caption gate's `captions.too-short` check would **fail 13 of the 16** caption tracks on disk (2,512 fail findings), because those tracks are word-level scribe output, not display windows. The eval's `captions.thin` was **3 of 3** wrong for the opposite reason: it counted caption entries instead of words.
- **Two hard blocks were false on every stored run.** The platform-spec gate blocked **7 of 13** runs, every one on `format.media-kind` for source stills under `artifacts/images`; keyframe vision `fail`s were wrong on **14 of the 23** checked against the frame (fully visible text called "cut off", split-screen and platform-chrome layouts called defects).
- **The checks that earn their keep:** loudness (resolved in the next eval 7 of 7 times), dead air at warn/fail level (a 4.5 s gap fixed to 2.0 s, a 5.3 s trailing silence), landscape-frame detection, and the full-video model pass, which carried the highest-value catches (an undelivered payoff mechanism, a missing brief pose, a register mismatch).
- **Applied:** the noisy checks became advisory or were re-measured (table below); 13 of 68 stored verdicts change, all toward the verdict the evidence supports. `RALPHY_EVAL_STRICT_RUBRIC=1` restores every relaxed severity for one release, and it reproduces all 68 stored verdicts exactly.
- **Not changed here:** the full-video pass returned a ship-ready verdict on **0 of 29** runs. That needed labeled calibration data, not a threshold guess. **Since #583:** the 29 renders are labeled (9 ship-ready), and a calibrated aggregation agrees with the labels on 28 of 29 (was 20 of 29); see [Full-video pass calibration (#583)](#full-video-pass-calibration-583).

## Data

| Source | What exists on this machine |
|---|---|
| `eval.json` | 68 reports, 19 projects, 3 workspaces. Modes: 37 structure, 21 deep-style, 8 native-video, 2 pre-#411. 22 of the 68 are evaluations of external course videos (reference analysis), not Ralphy productions. |
| `eval-deep-vision.json` | 26 parsed full-video reports (3 more runs errored). |
| `repair-plan.json` | 10 plans, 48 items, **0** ever moved off `approvalState: pending`. |
| `captions-gate.json` | 15 runs on 3 projects (all phrase-captioned). |
| `platform-spec.json` | 13 runs on 3 projects. |
| `hook.json` | 2 runs on 1 project. |
| `text-legibility.json` | 1 run, every analysis failed (provider credit error). |
| `fidelity.json`, `claims.json`, `workspace-eval.json`, `scorecard.json` | none. No workspace `evaluators.json` exists either. |
| SQLite store | `evaluations`: 0 rows. `metric_snapshots`: 0. `units`: 0. `publications`: 0. No outcome labels (#558). |
| Session baseline (#562) | Eval ran in one production session (3 min); repair and postmortem never ran. |
| On-disk inputs re-run | 22 `scenario.json`, 16 caption tracks, the stored inputs of all 68 eval reports, 7 project media sets. |

**Definitions.**

- **Fires**: reports containing at least one finding of the category.
- **Acted on**: the category is absent from the next eval of the same project (consecutive pairs by `evaluatedAt`, excluding the course-reference project). It is a proxy: model variance and mode changes also make categories disappear. Repair-plan approvals would be a better signal, but none were recorded.
- **FP estimate**: findings checked by the auditor against the frame, a contact sheet (`ralphy ref digest`, 0.5 s cadence) or the stored inputs, counted as wrong / checked. A single reviewer, not the owner.
- **Cost**: wall time measured from `generations.jsonl` latencies or a local run; dollar cost from the logs where recorded, else `MODELS.md`. Eval LLM calls do not log `cost_usd`.

## Inventory and verdicts

Phase follows the production contract. "Blocks" is what the gate does today, after this audit.

### Pre-render

| Gate / check | Kind, cost | Blocks | Fires | Acted on | FP estimate | Verdict | Reason |
|---|---|---|---|---|---|---|---|
| `scoreScenario` (`ralphy project score`) | deterministic, < 1 ms, $0 | hard (refuse), scenario phase | 14 of 22 scenarios failed; 14 of the 19 scenarios whose project has a render failed and were rendered anyway | n/a (no approvals logged) | 12 of 14 failing scenarios were format or applicability artifacts: 11 personal-clipper scenarios (a mode whose registry does not run this gate; no generated scenes, hook lives in the source speech), 1 long-form hook judged strong by the #571 review | **Keep hard, made format-aware** | Free and catches real plan defects (Green Zone, missing hook in modes that declare the gate). After the change 2 of 22 fail, both on the gate's own terms. |
| `ralphy ref check` (reference-required) | deterministic, $0 | hard | no stored log of refusals | n/a | n/a | Keep | Prevents a real defect class (named entities without refs); errs to false negatives by design. |
| `eval retention-check` | deterministic, $0 | never | facts only | n/a | n/a | Keep | Already advisory (#571). |
| `eval prose`, text-quality, batch-variance, image-pack score | deterministic, $0 | criteria / advisory | 0 stored runs | n/a | n/a | Keep | Free; no evidence either way. |

### Generation

| Gate / check | Kind, cost | Blocks | Fires | Acted on | FP estimate | Verdict | Reason |
|---|---|---|---|---|---|---|---|
| `scoreImage` | gemini-2.5-flash, ~$0.001 | none in practice | only called by `batch review` tournament ranking | n/a | n/a | Keep as ranking scorer; **follow-up** | AGENTS.md invariant 4 names it as a refusing gate, but no generation path calls it. Doc and code disagree. |
| `scoreVideo` | gemini-2.5-flash, 3 frames, ~$0.003 | none in practice | same | n/a | n/a | Same | Same. |

### Post-render: `ralphy eval video` deterministic findings

Structure pass measured at 0.9-10 s wall time for 13-83 s renders, $0.

| Check | Severity now | Fires | Acted on | FP estimate | Verdict | Reason |
|---|---|---|---|---|---|---|
| `format.aspect-ratio` (landscape) | fail | 5 (2 projects) | 0 of 3 (QA renders of source plates) | 0 of 5 | Keep | Real: the frames are landscape. |
| `format.resolution` | warn, only below 1080 wide; a non-9:16 portrait frame is now `format.aspect-ratio` warn | 34 | 0 of 25 | 18 of 34 (9:16 at or above 1080x1920) | **Relaxed** | Platforms downscale on upload; the platform gate owns file size. |
| `format.fps` | warn | 0 | n/a | n/a | Keep | Free. |
| `structure.duration-drift` | warn / fail | 0 | n/a | n/a | Keep; **follow-up** | Never fires because the declared duration ignores canonical `target_duration_s`. |
| `audio.loudness` | warn / fail | 8 (4 projects) | **7 of 7** | 0 of 8 by numbers | **Keep** | Cheap, objective, and always fixed. |
| `audio.true-peak` | fail | 0 | n/a | n/a | Keep | Free. |
| `audio.dead-air` | info / warn / fail | 40 reports, 117 findings (96 info) | 4 of 10 | warn/fail rungs real where checked (a 4.47 s gap cut to 1.97 s on the next render; 5.34 s trailing silence) | **Keep**; follow-up on the info rung | The 0.8-1.5 s info rung is speech cadence and lands in repair plans as noise. |
| `structure.hook-zone-empty` | fail | 0 | n/a | unreachable: the first scene always starts at 0 | Retire candidate (left in place) | Dead code; see follow-ups. |
| `structure.hook-zone-static` | **info** (was warn) | 61 of 68, all 19 projects | **1 of 22** | 7 of 7 openings inspected; #571 classified 3 of 3 as format choices | **Made advisory** | The detector sees hard cuts only. Inspected openings: an animated zoom-out plus card build, an IG-post mock whose inner panel cuts at ~2.2 s (frame-wide score 0.08, under the 0.4 threshold), text builds over a presenter, a letterboxed talking head, a split screen-recording layout, a deliberate continuous i2v shot. The full-video pass rated the opening pass in 12, warn in 4, fail in 4 of the 20 co-fires; the focused hook gate scored the one co-fire it ran on at 81.7/100. |
| `structure.hook-zone-thin-vo` | warn | 0 | n/a | n/a | Keep | Free. |
| `captions.thin` / `captions.dense` | warn | 3 / 0 | n/a (one eval per project) | **3 of 3** (counted entries: 0.61 wps measured vs 2.7-2.8 real) | **Re-measured** (counts words) | Measurement bug. The 1.5-4.5 wps band itself is a rubric default; no fires remain to judge it. |
| `captions.missing` | info | 60 of 68 | 0 of 24 | not a defect: burned-in captions have no `captions.json` | Keep as info; follow-up | One point each, but it pads repair plans. |

### Post-render: model-graded passes

| Gate / check | Kind, cost | Blocks | Fires | Acted on | FP estimate | Verdict | Reason |
|---|---|---|---|---|---|---|---|
| Keyframe vision (`vision.*`, ids `F*`) | gemini-2.5-flash, 1 call per detected scene, 4.5 s mean (111 logged), ~$0.001 | **warn at most** (was fail) | 23 keyframe fails, 59 keyframe text warns | low (text 1 of 9) | **14 of 23 fails checked, 14 wrong**: 11 clipped-text or split-screen claims on 5 frames whose text was fully visible; 3 `vision.brand` calls on IG-post mock layouts where the chrome is the template | **Capped at warn** | #411 already defines keyframes as a diagnostic. In 1 of the 3 runs where the full-video model said pass but the report failed, four hallucinated keyframe text fails were the cause. |
| Full-video pass (`native-video` / `deep-style`) | gemini-3.1-pro-preview, 1 call, 19.6 s (native) / 20.7 s (deep-style) mean latency; eval calls log no cost, the same model on the same payload for video analysis averages $0.0075 over 54 calls (lower bound) | hard (the only ship gate) | 29 runs: model overall pass 6 / warn 7 / fail 13 / error 3; report verdict fail 25 / warn 4; **ship-ready 0 of 29** | category churn ~50% between runs, confounded by model variance | Highest-value true positives: undelivered payoff mechanism (shibuya), missing brief pose (lump, still missing on the later render), register mismatch (astons). Contested: `style.timing-hook-first-3s` encodes the rubric's 3 s window | **Keep; calibrate** | It finds what nothing else finds. Its verdict carries no ship signal today; fixing that needs labeled data, not a guessed threshold. |
| First-frame hook (`eval hook`, #440) | gemini-2.5-flash, 2 frames, 2.1 s | hard on fail | 2 runs, 1 project, both pass | n/a | n/a | Keep | No evidence either way; cheap. |
| Caption gate (`eval captions`, #441) | deterministic + gemini-2.5-flash on 6 frames (3.6 s mean) | hard on fail | stored: 15 runs, 14 pass, 1 warn (unsafe placement, gone on the next run). Offline deterministic re-run over all 16 tracks: **13 fail** | 1 of 1 | too-short: **13 of 13** fails were word-level tracks (median entry 140 ms, the speech rate) | **Re-scoped** | Word-level tracks skip the too-short window check; phrase tracks keep it. After: 0 of 16 fail. A model-returned category (`captions.Caption Placement`) is now slugified. |
| Platform spec (`eval platform`, #443) | deterministic (ffprobe, image-size), < 1 s | hard on fail | 13 runs, **7 blocked** | 4K fail acted on once (re-render at 1080) | media-kind **7 of 7** blocked runs (source stills validated as Reels uploads, 20 per run) | **Re-scoped** | With a render present, intermediates are not uploads; a file is skipped for a platform when another file of the right kind exists. Over-size frames are a downscale warn. After: 0 of 7 sampled projects blocked. |
| OCR / text legibility (#439) | gemini-2.5-flash per image + 6 frames per video | hard on fail | 1 run: 14 of 14 analyses failed (credits) yet the report said "warn, emphasis / soft issues" | n/a | n/a | Keep; **follow-up** | An all-failed read should be inconclusive, not a soft pass. |
| Product fidelity (#422), claims (#442) | gemini-2.5-flash per asset; claims has a deterministic first stage | hard on fail | 0 runs | n/a | n/a | Keep | Commercial-only, prevents a real legal defect class; unexercised. |
| Workspace evaluators (#469-#476), stage loop (#473) | deterministic criteria + per-criterion full-video passes | per rubric | 0 runs, no `evaluators.json` on disk | n/a | n/a | Keep | Unexercised. |
| Scorecard (#427), flywheel `eval run` (#484), council, distribution pack | aggregation, $0 | verdict only | 0 runs | n/a | n/a | Keep | Unexercised. The scorecard counted `hook-zone-static` twice (hook and pacing dimensions); it now reads as pass. |
| Calibration harness (`eval calibrate`) | offline $0 / live per judge | none | never run | n/a | n/a | Keep; **follow-up** | Starter datasets reference `fixtures/hook/*.mp4` and `fixtures/captions/*.mp4`, which are not in the repo, so live calibration cannot run. |

## Changes applied

| File | Before | After |
|---|---|---|
| `cli/lib/eval/findings.ts` | `structure.hook-zone-static` warn, "Hooks under 1.5s read as more dynamic" | info, message says the detector sees hard cuts only; fix hint points to the retention review |
| `cli/lib/eval/findings.ts` | warn on any frame other than exactly 1080x1920 | no finding for 9:16 at or above 1080 wide; warn for 9:16 below 1080; `format.aspect-ratio` warn for a portrait frame that is not 9:16 |
| `cli/lib/eval/findings.ts` | keyframe vision issues kept the model's severity, including fail | capped at warn, fix hint asks to confirm on the full video |
| `cli/lib/eval/orchestrator.ts` | caption density = caption entries / duration | caption words / duration (bug fix, not reverted by strict mode) |
| `cli/lib/eval/captions-gate.ts` | too-short checked every entry | skipped on word-level tracks (≥ 8 entries, ≥ 80% single words); report carries `wordLevelTrack`; model categories slugified |
| `cli/lib/eval/platform.ts` | validated every file under `artifacts/{videos,images}` beside the render; media-kind fail per file; over-max resolution fail | with a render, `artifacts/videos` are skipped (bug fix); a mismatched-kind file is skipped when a matching file exists; over-max resolution is a warn (file-size cap stays a fail) |
| `cli/lib/score.ts` | undeclared duration assumed 15 s; `durationSec` ignored; 10-word hook cap hard in every tier; every mode refused | `durationSec` read; undeclared length follows the scene total and has no target to exceed; hook cap hard only in short-ad; a mode whose registry does not list `scoreScenario` gets format checks as warnings plus an `advisory` note (Green Zone stays hard); result carries `tier` |
| `cli/commands/project.ts` | `project score` ignored the content mode | passes the production plan's mode; prints `tier` and `advisory` |
| `cli/lib/eval/strict-rubric.ts` | n/a | `RALPHY_EVAL_STRICT_RUBRIC=1` restores the pre-audit severities for one release (remove after the next release if nobody needs it) |

**Re-score of the stored reports.** Re-running the new `buildFindings` over the inputs stored in all 68 reports (keeping the stored full-video findings) changes 13 verdicts: 10 structure-only reports go from warn to pass (their only warns were the two false checks), and 3 go from fail to warn (2 avatar full-video runs failed only on hallucinated keyframe text, 1 pre-#411 report). With the strict switch on, all 68 stored verdicts are reproduced exactly. No full-video run becomes ship-ready; its own warns keep every one at warn or fail.

**Re-run of the other deterministic gates.** Scenario gate: 14 of 22 failing before, 2 after. Caption gate (deterministic part): 13 of 16 failing before, 0 after. Platform gate on 7 projects: the media-kind blocks are gone; 2 projects with 2160x3840 renders move from fail to a downscale warn.

**Docs updated.** `docs/eval-calibration.md`, `docs/virality-rubric.md` (Part 7 callout), `docs/playbooks/agent-production-contract.md` (phase 10), `.agents/skills/scenarist/references/quality-gate.md` (now matches the code), `.agents/skills/scenarist/references/retention-review.md`, `.agents/skills/evaluator/SKILL.md`.

AGENTS.md invariant 4 is unchanged: the gates that stay hard still refuse. The ones made advisory were never decisive evidence of a defect.

## Full-video pass calibration (#583)

**Question.** The full-video pass found the most valuable defects but marked ship-ready on 0 of 29 runs. Which of its verdicts were right, and what aggregation makes ship-ready match a human reading without losing the true catches?

**Labels.** Every one of the 29 stored full-video runs was labeled ship-ready yes / no by inspecting the render that run evaluated: `ralphy ref digest` contact sheets at 1 fps, plus 5-10 fps frame strips wherever a stored finding needed checking. Listening judgments come from the stored loudness, dead-air and full-video audio findings. Ten renders had been overwritten after their eval; each was matched to its auto-versioned file (`final.v2.mp4`, `final-social.v1.mp4`, ...) by timestamp and duration, so every label is on the evaluated bytes. **9 of 29 are ship-ready** (8 of the 26 runs whose full-video pass parsed, plus one run whose pass died on HTTP 413). Labels, reasons and the stored sub-results (category and severity only, no media) are in `cli/lib/eval/calibration-datasets/full-video-pass-569.json`; label definition: ship-ready means a competent editor would publish that exact file for its purpose, with only minor polish left.

**What the labels show.**

- Every render labeled not-ship-ready carries at least one real `fail`: a deterministic one (loudness, dead air, landscape frame) or a structural full-video one (brief drift, register miss, undelivered mechanism, a broken body arc or closer).
- Every ship-ready render carries only warns once two kinds of detail `fail` are discounted, and it still carries several of them: 2 to 12 warns per run. "Two warns make a warn" therefore blocked all nine.
- The detail `fail`s on ship-ready renders did not hold up: the fixed caption box that `gamgee-fatigue` was failed for "scaling" is fixed at 5 fps; the "fused fingers" on `seoul-v7-audio-check` are intact; the same picture scored two motion-artifact fails on that run and none on `seoul-short-v4-audio`. On those two runs and on `app-demo-recording-v7` (a hook-window fail and a wink artifact), the model's own `overall_verdict` was `warn`, not `fail`.
- The "first 3 s" sub-check never decided a verdict on its own: capping it alone changes 0 of 29 outcomes.

**Candidate aggregations** over the stored sub-results (deterministic findings re-run with the current rules, full-video findings as stored). Positive class for kappa = "block"; 29 runs, of which 26 have a parsed full-video result.

| Rule | Ship-ready | Agree (29) | Agree (26 parsed) | False blocks | False passes | Cohen's kappa (29) |
|---|---|---|---|---|---|---|
| Strict, pre-#569 (stored verdicts) | 0 | 20 | 18 | 9 | 0 | 0.00 |
| Current, post-#569 (`score()` over all findings) | 0 | 20 | 18 | 9 | 0 | 0.00 |
| + `style.timing-hook-first-3s` capped at warn | 0 | 20 | 18 | 9 | 0 | 0.00 |
| Fails block, warns do not (drop "two warns make a warn") | 5 | 25 | 23 | 4 | 0 | 0.63 |
| Model `overall_verdict` = pass and no deterministic fail | 4 | 24 | 22 | 5 | 0 | 0.53 |
| Model `overall_verdict` != fail and no deterministic fail | 9 | 27 | 25 | 1 | 1 (`gamgee-lump`) | 0.84 |
| Fails block + hook window capped + detail fails need the model's holistic fail **(chosen)** | 8 | **28** | **26** | 1 | 0 | **0.92** |
| Same, detail fails always capped | 8 | 28 | 26 | 1 | 0 | 0.92 |
| Chosen + 3 or more full-video warns block | 3 | 23 | 21 | 6 | 0 | 0.41 |
| Chosen + 8 or more full-video warns block | 7 | 27 | 25 | 2 | 0 | 0.83 |

The one remaining disagreement is `avatar-free-edit`: its full-video pass hit HTTP 413 (fixed by the upload size cap below), so the gate correctly reports inconclusive instead of passing a render it never saw.

**Chosen rule** (`cli/lib/eval/full-video-verdict.ts`, recorded as `scoring.aggregation = "full-video-calibrated-583"`; native-video and deep-style only):

1. `style.timing-hook-first-3s` is capped at warn.
2. `style.rule-violation` and `vision.ai-artifacts` keep a `fail` only when the model's `overall_verdict` is also `fail`; otherwise they become warns with a note in the fix hint.
3. The verdict is `fail` on any remaining `fail` (deterministic or full-video) or on a holistic `fail`; `warn` when the full-video pass produced no usable result (error or unparseable JSON, which used to read as `pass` when nothing else fired); else `pass`. Warns stay in `eval.json`, the repair plan and the scorecard's `repair` verdict; they no longer block ship on their own.

The "always capped" variant ties on this data; the chosen one keeps a detail `fail` the model stands behind, so it blocks a superset of what the tie blocks. The warn-count variants only lose agreement.

**True catches kept.** `shibuya-hat-reveal` (undelivered payoff mechanism), `gamgee-lump` (missing brief pose) and `astons-alex-demo` (register mismatch) all stay blocked, on brief / mechanism / register `fail`s the caps do not touch.

**Per-run labels and verdicts** (before = current post-#569 aggregation, after = chosen rule):

| Run | Ship-ready | Model overall | Before | After | Label reason |
|---|---|---|---|---|---|
| `anm-p15-reel-v01` | no | error | fail | fail | Framing jumps between full-bleed and slide layouts that leave large empty black bands (0-2 s, 45-53 s); the 4 s end card is silent. |
| `astons-alex-demo` | no | fail | fail | fail | The brief asked for a moving portrait plate; the host is a still image under a slow digital zoom (register mismatch), and there is no music or SFX bed. |
| `avatar-chrome-edit` | no | error | fail | fail | Mix sits at -24.5 LUFS (8.5 LU under target); a caption line is duplicated at 6-7 s and ghost text overlaps at 4 s. |
| `avatar-chrome-final` | no | fail | fail | fail | A product-demo promo that never shows a product: long frozen portrait holds (13-19 s) and a 1.1 s dead tail. |
| `avatar-proof-edit` | no | fail | fail | fail | The founder clips keep the speaker's own-language audio under the English VO (stored audio finding); the 6 s closer is a frozen still. |
| `avatar-free-edit-fixed` | yes | pass | warn | ship | Clean split layout, readable hook lines, every example labeled, clear CTA, mix on target. |
| `avatar-free-edit` | yes | error | warn | warn (miss) | Same cut as the -fixed run; only the encode differs. The full-video pass errored on body size (413). |
| `avatar-seedance-final` | yes | pass | warn | ship | Coherent split layout; silence is the brief's explicit audio policy; the collar warp during breathing is minor. |
| `guardian-fire-dynamic-v2` | no | fail | fail | fail | A 4:3 landscape 5 s plate with floaty, unweighted motion; not a vertical deliverable. |
| `gamgee-fatigue` | yes | warn | fail | ship | All four poses present, diagrams legible, captions fixed. The model's caption-box-scaling fails are not visible at 5 fps. |
| `gamgee-limp` | yes | pass | warn | ship | All four poses present (seated, walking, standing, resting); the model's missing-standing-pose warn is wrong. |
| `gamgee-lump` | no | warn | fail | fail | The walking-stride pose the brief requires never appears (seated, standing, resting, seated). |
| `founder-mode-v2` | yes | warn | warn | ship | The meme lands: tight dialogue, a 1.9 s beat before the swipe, clear payoff. Lip-sync and swipe-hand blur are minor. |
| `founder-mode-v1` | no | fail | fail | fail | A 4.4 s dead pause (7.4-11.8 s) stalls the punchline; the arm moves in a jerky, warped way at 9 s. |
| `fourth-wall` | no | warn | fail | fail | Mix at -20.6 LUFS; the hand morphs during the key swipe; the end card holds 3.7 s of silence. |
| `app-demo-presenter-v7` | no | fail | fail | fail | Baked-in captions are gibberish glyphs for the whole clip; mix at -19.4 LUFS. |
| `app-demo-recording-v7` | yes | warn | fail | ship | Complete split-screen tutorial with readable captions and a clear CTA; the illegible log in the first 3 s is a weak but acceptable opener. |
| `app-demo-seedance25` | no | fail | fail | fail | A model test: one static talking-head shot for 20 s with looping mouth motion and no captions. |
| `saas-carousel-v2` | no | warn | fail | fail | The last panel does not deliver the briefed reaction and the piece ends on 4.8 s of silence over a held frame. |
| `saas-trial` | no | pass | fail | fail | Pacing stalls: 5.3 s silent tail and long silent gaps (46% of the runtime silent). |
| `pony-feed` | no | fail | fail | fail | A slideshow with dissolves instead of the briefed character animation; the phone-sharing action never happens. |
| `seoul-v7-audio-check` | yes | warn | fail | ship | Same picture as short-v4 with a new mix; the hand-anatomy fails are not visible on inspection. |
| `seoul-a3-02` | no | pass | fail | fail | Good picture for shot 02, but the native bus audio the brief requires is near-silent (-33 LUFS); not standalone. |
| `seoul-short-v1` | no | fail | fail | fail | Black opening frame, a black flash near 7 s, and shot 03 is missing. |
| `seoul-short-v2` | no | fail | fail | fail | Black opening frame; the payoff reverse shot breaks the seat continuity the brief locked. |
| `seoul-short-v3-audio` | no | fail | fail | fail | Wrong music bed per the stored audio finding (dramatic score instead of the quiet jazz trio), black opening frame and black tail. |
| `seoul-short-v4-audio` | yes | pass | warn | ship | Clean cut, audio fixed, no black frames; 960x1704 is below 1080 wide but fine for the platform. |
| `shibuya-hat-reveal` | no | fail | fail | fail | The hat-triggered transformation chain (the payoff mechanism) is not delivered; the finale is a static composite with mismatched scale. |
| `more-than-friends` | no | fail | fail | fail | The caption is tiny and sits over the subject's chest; the brief's second beat (glance aside, then lens) is missing. |

**Strict switch.** `RALPHY_EVAL_STRICT_RUBRIC=1` restores the raw full-video severities and the `score()` verdict; over the stored findings it reproduces all 29 stored verdicts. The inconclusive guard (no usable full-video result cannot pass) stays on in both modes.

**Other #583 changes.**

| File | Before | After |
|---|---|---|
| `cli/lib/eval/deep-vision.ts` | raw cap 40 MB; larger files rejected | raw budget derived from the 20,000,000-byte request limit after base64 (4/3) and a 512 KiB prompt reserve: 14,606,736 bytes (about 13.9 MiB). A larger render is transcoded to a proxy (720 px short side or lower, bitrate-capped to fit, audio kept) under `.ralphy/cache/eval-proxy/` with local ffmpeg and uploaded instead of failing; up to three smaller retries if the encode overshoots. `eval-deep-vision.json` records `upload` (proxied, original and uploaded bytes). |
| `cli/lib/providers/openrouter.ts`, `openai-compatible.ts`, `shared.ts` | chat calls logged latency only | the OpenRouter request asks for `usage: { include: true }`; `callLLM` returns `usage` (tokens, billed cost) and writes `cost_usd` + `tokens` to the call's `generations.jsonl` row. No cost is estimated when the provider reports none. |
| `cli/lib/spend.ts` | n/a | `evalSpendByGate(projectId)` sums eval cost per gate from the `endpoint` labels (`eval/deep-vision/<mode>`, `openrouter/eval-hook`, ...). Eval cost also counts toward project spend. |
| `cli/lib/repair.ts`, `schemas/repair-plan.ts` | info findings became plan items | info findings stay in `eval.json` only; the plan records `omittedInfo`. Deep-vision priority-3 redos and council actions are explicit requests and stay. |

**Limitations.** The rule was chosen on the same 29 runs it is scored on, by one labeler; agreement on new renders will be lower. Its three parts each answer a defect checked by eye (or, for the hook window, an audit suspect that turned out inert), not a threshold fitted per run. Several ship-ready calls are close (for example `app-demo-recording-v7`, whose first 3 s show an illegible log). Add labeled renders to the dataset as they ship and re-run the comparison; `tests/unit/full-video-calibration-583.test.ts` re-aggregates the dataset offline.

## Limitations

- **No outcome labels.** #558 has no imported analytics, so no gate can be checked against reach or retention, and false negatives cannot be counted. The hook for later: once `ralphy analytics import` has data, join each Unit's stored gate verdicts (`eval.json`, `hook.json`, `captions-gate.json`) to its `metric_snapshots` and compare hit rates by verdict.
- **One labeler.** FP estimates are the auditor's reading of frames and contact sheets, not the owner's.
- **Acted-on is a proxy.** No repair-plan item was ever marked approved or applied. Category disappearance between runs mixes real fixes with model variance and mode changes.
- **A third of the reports are reference analysis.** 22 of 68 evaluate external course videos.
- **Small samples for the focused gates.** Hook 2 runs, OCR 1 failed run, captions 15 runs on 3 projects, platform 13 runs on 3 projects; fidelity, claims and workspace evaluators never ran.
- **Model-graded gates were not re-run.** No paid calls were made, so their verdicts on the changed inputs are inferred, and keyframe findings were checked on 5 frames plus 1 contact sheet.
- **Costs are partial.** Eval LLM calls logged latency but not dollars; the full-video cost is a lower-bound proxy. Since #583 they log the provider-billed `cost_usd`.
- **Some stored reports predate their renders.** Several projects were re-rendered after the stored eval, so a finding about the earlier render cannot always be checked against today's file.

## Follow-up candidates

Not changed here, in rough priority order:

1. **Done in #583.** **Full-video pass ship signal.** 0 of 29 runs ship-ready. Label 10-20 real renders (ship / do-not-ship) and run `ralphy eval calibrate`; then decide whether the "two warns make a warn" aggregation or the `style.timing-hook-first-3s` sub-dimension (a rubric 3 s window inside the prompt) should change.
2. **AGENTS.md invariant 4 vs code.** `scoreImage` / `scoreVideo` are named as refusing gates but run only inside `batch review`. Either wire them (opt-in) into `generate` or reword the invariant to the gates that actually run.
3. **Calibration fixtures.** The starter datasets reference fixture videos that are not in the repo. Add them, or build a dataset from labeled real renders; the 14 keyframe fails labeled in this audit can seed a keyframe-vision set.
4. **Done in #583.** **Deep-vision byte cap.** `DEEP_VISION_MAX_MP4_BYTES` is 40 MB, but the provider rejects request bodies over 20 MB (base64), which logged 413s after 14-50 s. Cap near 14 MB raw or re-encode first.
5. **Done in #583.** **Log eval spend.** Record `cost_usd` for eval LLM calls (eval-vision, deep-vision, hook, captions, OCR) so the next audit can measure cost, not only latency.
6. **`structure.duration-drift` never fires.** `readDeclared` reads `format.durationSec ?? duration`, not canonical `target_duration_s`, and `hookText` ignores `hook.vo`.
7. **Replace the cut proxy.** `structure.hook-zone-empty` is unreachable. A motion-energy check on the first 3 s from the #557 scene-score profile (scaled to 270 px, about 0.1 s) would measure what the hook-zone checks meant to measure.
8. **Scene detection in framed layouts.** Inner-panel cuts score 0.08-0.10 and soft cuts 0.16-0.30 against the 0.4 threshold, so scene counts and pacing facts are wrong for IG-mock and split layouts.
9. **OCR inconclusive state.** A run whose analyses all failed should report inconclusive, not a soft warn.
10. **Done in #583.** **Repair-plan noise.** Keep info findings (`audio.dead-air` 0.8-1.5 s, `captions.missing`, now `structure.hook-zone-static`) out of the repair plan, or group them as notes.
11. **Record repair decisions.** Move `approvalState` when a plan item is approved or applied, so acted-on can be measured directly.
12. **Caption density band.** 1.5-4.5 wps is a rubric default; revisit once word-counted data exists.
13. **`retention-check` in `eval run`.** Wire it as an advisory, never-blocking step (a #571 follow-up).
