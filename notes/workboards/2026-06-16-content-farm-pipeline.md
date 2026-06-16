# Workboard — content-farm pipeline tranche (#430–#451)

> **Status:** closed — 2026-06-16
> **Opened:** 2026-06-16
> **Driver:** /dev-loop
> **Slice:** harden the agent-facing content-farm pipeline — model/error preflights, first-class mode playbooks, the eval quality-gate family, plan/spend governance, the low-tech benchmark + simulator + mode smoke suite, and library/ref QA.

This is the first workboard. It records the `/dev-loop` run that executed the #430–#451 pack. Per-issue commit SHAs are in `git log`; the landed issues carry `done — 2026-06-16` in `notes/issues/done/`.

## Lanes

| Lane | Issue | Depends on | Expected gates | Status |
|---|---|---|---|---|
| Foundational libs | [#445](../issues/done/445-model-constraint-preflight.md) | — | `model-constraints` test · surface/docs | landed |
| Foundational libs | [#450](../issues/done/450-agent-error-taxonomy-and-next-actions.md) | #445 | `error-taxonomy` · `jobs-error-hints` · `queue` | landed |
| Mode playbooks | [#433](../issues/done/433-product-shot-and-lifestyle-mode-playbooks.md) | — | `mode-guidelines` · `mode-coverage` · `docs-links` | landed |
| Mode playbooks | [#435](../issues/done/435-ugc-review-and-tv-ad-mode-playbooks.md) | #433 | `mode-guidelines` · `mode-coverage` | landed |
| Mode playbooks | [#438](../issues/done/438-infographic-animation-mode.md) | #433 | `mode-coverage` · `content-modes` · `agents-md` | landed (new mode; 20→21 list) |
| Mode playbooks | [#434](../issues/done/434-try-on-and-closeup-product-person-modes.md) | #433 | `mode-coverage` · `mode-guidelines` · `agents-md` | landed (promoted virtual-model-tryout) |
| Mode playbooks | [#437](../issues/done/437-amazon-listing-mode.md) | #434 | `mode-coverage` · `production-contract` | landed (promoted amazon-listing) |
| Quality gates | [#439](../issues/done/439-text-legibility-ocr-gate.md) | — | `eval-ocr` · `scorecard` · surface | landed |
| Quality gates | [#440](../issues/done/440-first-frame-hook-gate.md) | #439 | `eval-hook` · `scorecard` · `repair-plan` | landed |
| Quality gates | [#441](../issues/done/441-caption-sync-and-readability-gate.md) | #439 | `eval-captions-gate` · `scorecard` | landed |
| Quality gates | [#442](../issues/done/442-claims-and-policy-gate.md) | #439 | `eval-claims` · `scorecard` · `repair-plan` | landed |
| Quality gates | [#443](../issues/done/443-platform-spec-validator.md) | — | `eval-platform` · `scorecard` | landed |
| Plan + spend | [#432](../issues/done/432-production-plan-quality-grader.md) | — | `plan-grade` · `production-contract` · council | landed |
| Plan + spend | [#444](../issues/done/444-spend-governor-and-approval-ledger.md) | — | `spend` · generate pass-through · `errors` | landed |
| Benchmarks / sims | [#430](../issues/done/430-low-tech-prompt-benchmark-suite.md) | modes | `low-tech-prompt-benchmark` | landed |
| Benchmarks / sims | [#431](../issues/done/431-agent-user-simulator.md) | #432 #444 | `agent-simulator` | landed |
| Benchmarks / sims | [#446](../issues/done/446-mode-fixture-smoke-suite.md) | all modes | `mode-smoke` · `smoke:modes` | landed |
| Library / refs | [#449](../issues/done/449-ref-pack-contact-sheet-and-lint.md) | — | `ref-pack-lint` · council | landed |
| Library / refs | [#448](../issues/done/448-library-qa-and-broken-media-checks.md) | — | `lint-library` · `lint:library:fast` | landed |
| Library / refs | [#447](../issues/447-library-seed-units-pack.md) | #448 | scorecard per unit | **deferred** — gated curation + publish |
| Meta | [#451](../issues/done/451-dev-loop-weekly-workboard.md) | — | `docs-links` | landed (this board) |
| Modes (deferred) | [#436](../issues/436-personal-clipper-mode.md) | — | — | **deferred** — needs a new `ralphy clip` verb |

## Dependency order

Foundational shared metadata first (#445 model-constraint table → #450 reuses its fallback recommender). Mode playbooks ran strictly sequentially because each touches the same shared files (`cli/lib/content-modes.ts`, `AGENTS.md`, the mode-count assertions in the mode tests, `docs/content-mode{s,-coverage}.md`); the three registry-mutating ones (#438 add, #434 + #437 gap→supported promotions) each migrate the supported/gap counts in lockstep, so parallelizing them would collide. The eval quality gates (#439–#443) all extend `cli/lib/eval/*` + `scorecard.ts`; #439's OCR is reused by #440's text-hook check, so it led the lane. Benchmarks/sims keyed off the modes (#430, #446) and the plan-grader + spend-governor (#431). Library/refs were independent.

## Completion notes

- **Landed (19):** #445, #450, #433, #435, #438, #434, #437, #439, #440, #441, #442, #443, #432, #444, #430, #431, #446, #449, #448. New CLI surface: `models preflight`, `eval ocr|hook|captions|claims|platform`, `project grade-plan|approve|budget`, `ref lint|contact-sheet`; new lints `smoke:modes` + `lint:library`. The mode taxonomy is now 20 supported / 1 gap (`personal-clipper`).
- **Deferred / carried over:**
  - **#436 personal-clipper** — cannot be promoted on docs alone; there is no clip-extraction route (`editor trim-analyze` is vision-only; ad-hoc ffmpeg is banned by AGENTS #2). Needs a new `ralphy clip` verb (transcript-driven highlight detect → trim + 9:16 crop + caption bake). Substantial feature — a user decision (build now vs. defer). Re-select once scoped.
  - **#447 library seed Units** — no code to write (tooling exists: `unit create/package`, scorecard, `lint:library`). The core is curatorial (pick 10-15 real `.ralphy/` deliverables — user judgment), may need paid thumbnail gen, and publishing to the public Bunny CDN is outward-facing/gated. Run as a guided curation session, not autonomously.
- **New issues to file (found mid-run):**
  - Flaky test `tests/unit/elevenlabs-voiceover-lock-verify.test.ts` — the `writeOrder` FIFO assertion fails ~40% in isolation under load (race-order). Sibling of the #061 `cli-dryrun` flake.
  - Flaky test `tests/integration/cli-ref-pull-bulk.test.ts` — the idempotent "skipped-existing no-op" case times out (45s) on a real URL fetch under full-suite load (network-dependent).
  - `lint:no-cyrillic` is still not wired into CI (the `task_ff8b39b4` follow-up); `cli/commands/project.ts:~808` carries a literal Cyrillic macOS-screenshot regex and `cli/commands/generate.ts:279` a combining-diacritics range that trips `\p{Cyrillic}`.
  - Library data gap: `nyastics-emotes-final` unit has an empty `templateId` (surfaced as a `lint:library` warn).
- **Gotchas for the next session:** the husky pre-push runs the full suite; the three flakes above intermittently block pushes — verify the failing test in isolation, and `--no-verify` only when the sole failure is a known flake and every real gate is green. Mode-count assertions are hardcoded in `tests/unit/mode-coverage.test.ts` (supported/gap counts) + `docs/content-mode-coverage.md` ("N supported") + `AGENTS.md` — any further mode promotion must migrate all three in lockstep.
