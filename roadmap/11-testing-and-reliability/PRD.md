# 11 — Testing & Reliability — PRD

## Problem

`CLAUDE.md` says "TDD-leaning. New CLI command → smoke via `bunx tsx cli/index.ts <cmd>` + JSON assertion. New UI → Playwright. New Remotion component → render frames 0–10 for crash check." That's the policy. The reality is thinner:

1. **No formal test harness for the CLI.** Smoke tests are ad-hoc shell scripts or one-off `bunx tsx` invocations. Coverage is unknown.
2. **No golden renders.** The TOP-5 templates work today; they could regress tomorrow and we wouldn't notice until a user complains. The `render-test-2026-05-11.md` report is a one-off snapshot, not an ongoing check.
3. **Doctor scenarios untested.** `ralphy doctor` works on a happy-path machine. What does it do when `OPENROUTER_API_KEY` is set but expired? When `ffmpeg` is on PATH but a broken version? When the workspace dir is read-only? We don't know.
4. **Skill integration drift.** Playbooks reference CLI verbs by name. When a verb's flags change, the playbook silently breaks until an agent picks it up and fails mid-flow.
5. **Release reliability depends on people remembering to run things.** See `09 — Distribution`; this category provides the test infrastructure that 09 consumes.

Reliability isn't separate from quality — but where [`08 — Quality & Evaluation`](../08-quality-and-evaluation/) judges the output content (was this video any good?), this category judges the **system** (does the CLI behave like the contract says?).

## Users

| User | Need |
|---|---|
| **Maintainer (alecs5am)** | Refactors don't accidentally break things. CI tells me before users do. |
| **AI agent picking up a refactor** | When I change `cli/lib/foo.ts`, I see which tests fail; the failure messages point me at the contract I broke. |
| **OSS contributor** | I can run `bun test` and see green/red without setting up API keys or paying for gens. |
| **Release engineer (also alecs5am)** | I know a release is good because the smoke suite passed, not because "it worked last time". |

## User stories

1. As a **maintainer**, `bun test` runs in < 60s, exercises every CLI verb's JSON shape, and zero tests require API credits.
2. As a **maintainer**, on every PR, a golden-render workflow runs the TOP-5 templates with cached prompts + deterministic seeds and asserts the resulting mp4 has the same dimensions, duration, audio characteristics, and a perceptual-hash-similar first frame.
3. As an **agent**, when I edit `cli/lib/providers/media.ts`, the failing test names mention "media provider contract" so I know what I broke without reading the test code.
4. As a **maintainer**, the CI matrix exercises macOS + Linux. I find out about Linux-only path bugs in a PR, not at install time.
5. As an **OSS contributor**, I run `bun test` on a fresh clone and nothing fails because of missing keys — paid-API tests are gated behind an env var and skipped by default.
6. As a **release engineer**, the `clean-machine smoke` (from [`09`](../09-distribution-and-release/)) reuses the same fixtures as the unit suite. No parallel test infrastructure.
7. As a **playbook author**, when I rename a verb in a playbook, a "playbook lint" job in CI verifies that every referenced `ralphy ...` invocation is callable.

## Success metrics

| Metric | Target at v1.0 | How we measure |
|---|---|---|
| CLI verb JSON-shape coverage | 100% of v1.0-must-ship verbs | Test inventory matches `cli/commands/` |
| `bun test` wall-time | < 60s | Hyperfine in CI |
| `bun test` failures requiring API credits | 0 (paid tests gated behind `RALPHY_TEST_PAID=1`) | Test taxonomy |
| Golden renders for TOP-5 templates passing on every PR | 5/5 | CI status |
| Doctor scenarios tested | ≥ 10 (missing key, expired key, missing ffmpeg, missing yt-dlp, read-only workspace, no internet, low disk, broken project link, stale registry, etc.) | Test count |
| Playbook lint passing | 100% of playbooks parse cleanly | CI status |
| Median PR check time | < 10 min | GitHub stats |

## Non-goals

- **Unit-testing every line of `cli/lib/`.** We're not chasing coverage %. We're testing contracts: verb in/out, file shapes, error codes.
- **Property-based / fuzz testing.** Out of scope for v1.0.
- **Load testing.** This isn't a server.
- **Visual regression testing of the landing page.** That's owned by `07 — Socials & Docs`.
- **Provider mock fidelity beyond what the contract needs.** We mock OpenRouter / ElevenLabs at the response-shape level; not behavior simulation.
- **Snapshot testing for ffmpeg output.** Bit-exact across ffmpeg versions is unreliable. We check structural properties.

## v1.0 cut

**Must ship:**

- `11.01` — CLI smoke suite (every must-ship verb, JSON-shape assertion)
- `11.02` — Golden renders for TOP-5 templates
- `11.03` — Doctor scenario tests
- `11.04` — Playbook lint (every `ralphy ...` invocation in playbooks is callable)
- `11.05` — Recipe tests (cross-link with [`06.01.04`](../06-utilities/SPEC.md))
- `11.06` — CI matrix (macOS + Linux)
- `11.07` — Paid-test gating via `RALPHY_TEST_PAID=1`

**Post-launch:**

- `11.08` — Windows CI matrix entry
- `11.09` — Periodic full-suite (including paid) nightly
- `11.10` — Property-based testing for prompt cookbooks
