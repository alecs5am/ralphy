# Ralphy Roadmap — v1.0 OSS Launch

> **Status: living document.** Source of truth for what we're shipping toward v1.0. Read this before starting any non-trivial work and before opening a new conversation about "what's next".

## What v1.0 means

A stable open-source release that a fresh developer or AI agent can take from a single `curl install.sh | sh` to a polished vertical UGC mp4 — without hand-holding, without secrets we forgot to document, and without a "trust me, it works on my machine" caveat.

Concretely, v1.0 ships when **all of these hold**:

1. **Install → first video in under 15 minutes on a clean machine** (macOS or Linux). Time budget includes API-key prompt, asset pull, template pick, render. No mandatory edits to source.
2. **Five reference templates render reproducibly** — `ralphy template use <slug>` followed by `ralphy render` produces a watchable mp4 every time, across 10 consecutive runs, for the 5 templates in `templates/TOP.md`.
3. **Cost is predictable and visible** — every gen logs price, every render rolls up a total, every `--dry-run` prints an estimate within ±15% of actual.
4. **The CLI surface matches the landing copy 1:1** — every claim in `landing/components/Hero.tsx` and `sections/HowItWorks.tsx` has a real verb with matching `--help` examples.
5. **An AI agent can drive the full pipeline from chat without filesystem hacks** — the routing in `AGENTS.md` lands on real playbooks, the playbooks point at real CLI verbs, and the CLI verbs return parseable JSON.
6. **Quality gates refuse, not warn** — `scoreScenario` / `scoreImage` / `scoreVideo` block bad output rather than letting it through.
7. **Distribution is durable** — npm, brew, and GitHub Releases publish from CI on a single command, with checksums and zero manual steps.
8. **Documentation is a 30-minute path** — a new contributor reads `README.md` → `CLAUDE.md` → `AGENTS.md` → one playbook and is productive. Mintlify docs cover the public CLI surface.

Anything not on that list is post-v1.0.

## How this roadmap is organized

Eleven categories, each with its own folder. Numbering convention: `XX.YY.ZZ` where `XX` is the category (01..11), `YY` is the topic, `ZZ` is the individual task. Categories never renumber; old tasks never get reused.

| # | Category | Why it exists |
|---|---|---|
| [01](01-cli/) | **CLI** | How comfortable the CLI is for humans and AI agents — verb shape, help, output contract, error messages. |
| [02](02-prompts-and-templates/) | **Prompts & Templates** | The cookbook layer that lets Ralphy write good prompts for image / video / voice / music models, plus the template library. |
| [03](03-skills/) | **Skills** | The `.agents/skills/` ↔ `docs/playbooks/` system. Routing, install across agents, MCP, exportable skill bundle. |
| [04](04-user-flow-and-autonomy/) | **User Flow & Autonomy** | Cold-start UX, ambiguity handling, when to ask vs. when to act. Measures "idea → mp4 with zero clarifications" success rate. |
| [05](05-project-resources/) | **Project Resources** | Workspace, brand, persona, ref, asset cache, profiles. Long-lived state per project and across projects. |
| [06](06-utilities/) | **Utilities** | Local non-API operations — ffmpeg recipes, smart-crop, captions, frame extraction, future local models (whisper.cpp). |
| [07](07-socials-and-docs/) | **Socials & Docs** | Landing, Mintlify docs, README, brand assets, social presence. Everything outward-facing. |
| [08](08-quality-and-evaluation/) | **Quality & Evaluation** | Score gates, virality rubric, post-render eval, green-zone enforcement, regression on golden renders. |
| [09](09-distribution-and-release/) | **Distribution & Release** | install.sh, install.ps1, brew tap, npm wrapper, GitHub Releases, code signing, version pipeline. |
| [10](10-cost-and-telemetry/) | **Cost & Telemetry** | Gen-log, cost rollup, budget caps, "iterate from numbers" loop, opt-in usage stats. |
| [11](11-testing-and-reliability/) | **Testing & Reliability** | Golden renders, smoke tests per template, regression on CLI verbs, doctor scenarios, render-test reports. |

## Reading order

If you only have 15 minutes — read this file, then [`CONVENTIONS.md`](CONVENTIONS.md). That's enough to navigate.

If you're picking up a specific category to push forward:

1. Read this file's ship criteria (above) — that's the v1.0 contract.
2. Read the category's `PRD.md` for problem framing and success metrics.
3. Read the category's `SPEC.md` for the actual requirements list with status markers.
4. Check the category's `OPEN-QUESTIONS.md` for decisions not yet locked.
5. Then look at adjacent categories the work touches — cross-category links are inline in each `SPEC.md`.

If you're an AI agent invoked through `AGENTS.md` routing — keep doing what `AGENTS.md` says. This roadmap is for *planning* work, not running it. Only crack open a `SPEC.md` when the user asks "what's next" or "what's left in `<area>`" or you genuinely need to know what's in vs. out of scope.

## Status snapshot

Every task in every `SPEC.md` carries one of three markers:

- `[ ]` — todo, not started
- `[~]` — in progress (some code or doc written, not done)
- `[x]` — done, acceptance criteria met, code merged

A category is "v1.0-ready" when every task it owns that is **also flagged `v1.0:` in its acceptance criteria** is `[x]`. Items without the `v1.0:` flag are post-launch.

This file does **not** mirror the per-category status. Look at the category's `SPEC.md` for current state — duplicating it here invites drift.

## Cross-references

- [`CLAUDE.md`](../CLAUDE.md) — project root context, points at `AGENTS.md`.
- [`AGENTS.md`](../AGENTS.md) — routing for every user request. Operational, not planning.
- [`docs/cli-ux-vision.md`](../docs/cli-ux-vision.md) — front-stage CLI spec, feeds 01-cli.
- [`docs/use-cases.md`](../docs/use-cases.md) — canonical user utterances, feeds 04-user-flow.
- [`docs/perf-targets.md`](../docs/perf-targets.md) — speed & cost budgets, feeds 08 and 10.
- [`docs/virality-rubric.md`](../docs/virality-rubric.md) — quality gate definition, feeds 08.
- [`templates/CATEGORIES.md`](../templates/CATEGORIES.md), [`templates/TOP.md`](../templates/TOP.md) — template inventory, feeds 02.

## Lifecycle

The roadmap is **not** a wishlist. Three rules keep it honest:

1. **Anything in a `SPEC.md` should be shippable**, with concrete acceptance criteria. Vague ideas live in `OPEN-QUESTIONS.md` until they're sharp enough to promote.
2. **Closing a task means updating the `[x]` marker in the same commit that makes it true.** No "done in PR but the doc still says `[ ]`".
3. **If a task is no longer needed, mark it `[x] (cancelled — reason)` rather than deleting it.** History matters for context months later.
