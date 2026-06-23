# Agent-substrate contract

> **Status:** design only. Nothing here is newly built. This doc DESCRIBES the contract that already exists across shipped primitives (the production-contract ledger, the spend ledger, the job queue, the readiness scorecard, the per-project logs, the eval orchestrator) and names the bar each must clear to call Ralphy an agent-native media OS. It introduces no new verb, schema, or storage.
> **Tracks:** [`../../notes/issues/done/452-agent-substrate-media-os-program.md`](../../notes/issues/done/452-agent-substrate-media-os-program.md)
> **Grounded as of:** 2026-06-23 against the live repo. Every code/path citation below was verified to exist (or noted as absent/planned) at that time.

Read [`../../CLAUDE.md`](../../CLAUDE.md) (the `.ralphy/` layout), [`../../AGENTS.md`](../../AGENTS.md) (the positioning + the hard invariants), and [`../playbooks/agent-production-contract.md`](../playbooks/agent-production-contract.md) (the canonical phase sequence) for the surrounding context. This doc ties those together into one substrate contract and names the honest gaps.

The thesis from #452: **chat is the interface; the CLI is the agent runtime.** The test of success is not "can a maintainer run the CLI" — it is "can a fresh agent enter a project and continue high-quality production without reconstructing context from chat history." Everything below is graded against that test.

---

## 1. The agent-substrate contract

The contract is the set of guarantees an agent driving Ralphy can rely on. It has three halves: what state is inspectable, which verbs are safe to call unattended vs. which need user approval, and what must be persisted.

### Inspectable project state (the substrate's memory)

All project state lives under the gitignored `.ralphy/` root — never in chat. A fresh agent reconstructs the whole picture from disk:

| State | Where | Read via |
|---|---|---|
| Phase ledger | the project tree's artifact presence | `evaluateContract()` ([`../../cli/lib/contract.ts`](../../cli/lib/contract.ts)) → `ralphy project status <id> --contract` |
| Spend | `<project>/spend-ledger.json` + `generations.jsonl` cost rows | `budgetSummary()` ([`../../cli/lib/spend.ts`](../../cli/lib/spend.ts)) → `ralphy project budget <id>` |
| Release readiness | the persisted gate reports aggregated | `buildScorecard()` ([`../../cli/lib/scorecard.ts`](../../cli/lib/scorecard.ts)) → `ralphy project scorecard <id>` |
| Last eval | `<project>/eval.json` (+ `eval-report.md`) | the `/evaluator` orchestrator ([`../../cli/lib/eval/orchestrator.ts`](../../cli/lib/eval/orchestrator.ts)) |
| Generation history | `<project>/logs/generations.jsonl` (every model call, input/output/cost) | [`../../cli/lib/gen-log.ts`](../../cli/lib/gen-log.ts) → `ralphy project log <id>` |
| User intent + skips | `<project>/logs/user-prompts.jsonl` | `ralphy project log-prompt` / `ralphy project timeline <id>` |
| Queued work | `.ralphy/jobs.db` (status, `depends_on`, retry, cost) | [`../../cli/lib/jobs/db.ts`](../../cli/lib/jobs/db.ts) → `ralphy queue list` |
| Raw media | `<project>/artifacts/<kind>/` (append-only) | `fd -H`, the [`../../studio/`](../../studio/) viewer, or the manifest |

The bar: **every decision an agent needs to resume work is reconstructable from these files, with no chat dependency.**

### Safe-to-call vs. approval-required verbs

The split is encoded in the [`../../AGENTS.md`](../../AGENTS.md) hard invariants, not invented here:

- **Safe unattended (read-only / zero model calls):** `project status --contract`, `project budget`, `project scorecard`, `project repair-plan` (deterministic, zero model calls), `ref check`, `queue list`, `template suggest`, `memory recall`, and every `list`/`show` verb. These never spend and never mutate user artifacts.
- **Requires explicit user approval before running (the spend gate):** any paid `ralphy generate {image|video|voiceover|music}` and `ralphy render`. Invariant — the production plan's **"wait for the user's 'go' before any paid generation"** checkpoint (contract phase 8). The fixer's HARD GATE is the same shape: no paid regeneration until the user approves the repair plan.
- **Refuses, does not warn (the quality + reference gates):** the reference-required gate (AGENTS.md #3 — named real entities need a ref or a logged `--no-ref-consent`) and the quality gates (AGENTS.md #4 — `scoreScenario`/`scoreImage`/`scoreVideo` two failures in a row → stop, never render over a failed gate).
- **Append-only, never destructive without explicit consent (AGENTS.md #14):** regen auto-versions (`.v2`, `.v3`), the JSONL logs are never rewritten in place, `units/` is append-only.

### What must be persisted

A phase is "done" only when its artifact is on disk — not when the agent believes it did the work. The required artifacts are `CONTRACT_PHASES[].artifact` in [`../../cli/lib/contract.ts`](../../cli/lib/contract.ts): `BRIEF.md`, `PRODUCTION_PLAN.md`, `scenario.json`, `prompts.json`, `asset-manifest.json`, `render/final.mp4`, `eval.json`. The append-only logs (`generations.jsonl`, `user-prompts.jsonl`, `user-assets.jsonl`) and the spend ledger are persisted continuously, not at a phase boundary.

---

## 2. Project state and resume

The acceptance question — a fresh agent answering "current phase / missing artifacts / next safe action / last eval / spend / blocking decisions" — is answered today by **one read-only call**: `ralphy project status <id> --contract` (alias `--lifecycle`), a thin wrapper over `evaluateContract()` ([`../../cli/lib/contract.ts`](../../cli/lib/contract.ts)). Its JSON carries the resume model (#414):

| Acceptance sub-question | Field |
|---|---|
| current phase | `currentPhase` (the furthest satisfied artifact-bearing phase) |
| missing artifacts | `missingRequired[]` (required artifacts still absent, in phase order) |
| next safe action | `nextPhase` + `nextStep` (the resume cursor + a one-line instruction) |
| blocking decisions | `stopConditions[]` (`reference-required`, `quality-gate-failed`, `user-approval-needed`, `native-gate-required`, `estimate-exceeds-target`, `mode-unsupported`, `stage-gate-unmet`) |
| polished / shippable | `polished` (true only when the native-video final gate passed or a logged bypass exists) |

`evaluateContract()` is PURE and synchronous-on-filesystem (only `existsSync`/`readFileSync` probes), so it is cheap to call on every turn and never spends.

**Last eval and spend are adjacent reads, not part of the same call.** The contract ledger reports *whether* `eval.json` is present and whether `polished` is true; the eval *content* is `<project>/eval.json` and the spend state is `ralphy project budget <id>` ([`../../cli/lib/spend.ts`](../../cli/lib/spend.ts) `budgetSummary`).

**Honest gap:** there is no single "resume digest" verb that fuses contract + budget + last-eval verdict + scorecard into one payload — an agent reads three or four surfaces (`project status --contract`, `project budget`, `project scorecard`, `eval.json`) and composes them. Each is machine-readable and cheap; the composition is the agent's job, not a primitive's. A future `ralphy project resume <id>` that returns the fused snapshot would close the last seam, but the underlying data is all present today.

---

## 3. The production contract as one state machine

The phase sequence, gates, and per-phase artifacts are the canonical state machine in [`../playbooks/agent-production-contract.md`](../playbooks/agent-production-contract.md), with the machine-readable half in `CONTRACT_PHASES` ([`../../cli/lib/contract.ts`](../../cli/lib/contract.ts)). The two are kept in lockstep — the doc cross-references the constant by name and the constant's header comment points back at the doc.

The eighteen phases in order: `intake` → `content-mode` → `format-template-match` → `memory-recall` → `reference-gate` → `research` → `style-lock` → `production-plan` → `council-preflight` → `scenario` → `prompts` → `assets` → `render` → `eval` → `repair` → `council-polish` → `unit` → `postmortem`. Each phase declares a required artifact (or `null` for agent-driven phases whose gate lives in the agent loop), a gate/checkpoint, and an allowed-skip rule. The load-bearing gates:

- **The spend gate** (`production-plan` phase): no paid generation before the user's "go". Surfaced as the `user-approval-needed` stop condition while a plan exists but no asset manifest does.
- **The reference gate** (`reference-gate` phase): refuse on a named real entity with no ref; the floor is `ralphy ref check <id>`.
- **The quality gates** (`scenario`, `prompts`, `assets`): refuse-not-warn, two strikes → stop.
- **The native-video ship gate** (`eval` phase): a keyframe/structure eval is a diagnostic; only the native-video pass can set `polished: true`, which the `unit` phase requires before a Unit is publishable.

The forward-looking compiled contract (`production-contract.json`, written by `ralphy project plan` via the compiler in [`../../cli/lib/production/compiler.ts`](../../cli/lib/production/compiler.ts)) ties mode → support classification → required artifacts → eval/council gates → Unit shape at plan time, and is distinct from the on-disk ledger `project status --contract` reads. Spend, research, ref pack, repair plan, and the distribution/Unit packaging all hang off this one sequence — they are slices of it, not parallel flows.

---

## 4. Machine-readable CLI

The substrate is agent-first, so the CLI is machine-readable by default and the discipline is lint-enforced, not aspirational:

- **JSON by default.** Every agent-facing verb emits JSON unless `-p`/`--pretty` or a TTY is detected. This is the documented default in [`../../CLAUDE.md`](../../CLAUDE.md) and [`../../AGENTS.md`](../../AGENTS.md).
- **Pretty-output coverage where relevant.** Every `out()`-emitting command renders both ways; the rules (no `[object Object]`, `null`/`undefined` → em-dash at every nesting level, `NO_COLOR` wins) live in [`../developing-ralphy.md`](../developing-ralphy.md) (the `out()` render contract) and are enforced by `bun run lint:out-coverage` ([`../../scripts/lint-out-coverage.ts`](../../scripts/lint-out-coverage.ts)) plus the `tests/unit/output-pretty*.test.ts` suite.
- **Actionable errors.** Every code in the append-only error catalog ([`../../cli/lib/errors/catalog.ts`](../../cli/lib/errors/catalog.ts)) carries a `hint` field that tells the caller the concrete next move (`Run \`ralphy {verb} --help\``, `Run \`ralphy {kind} list\` to see available ids`, …). Codes are append-only post-v1.0; the shape is gated by `bun run lint:errors` + `tests/unit/errors-catalog.test.ts`.
- **The AGENTS.md invariants are themselves tested.** `tests/unit/agents-md-invariants.test.ts` enforces connector-only keys (#1), the single render path (#2), bun-only spawning (#7), and the guideline-library floor (#13) — so the contract's safety rules are not just prose.

The bar: **a stable JSON shape, pretty coverage, and an actionable error for every verb the production contract walks through.** The lints above are the standing enforcement of that bar.

---

## 5. Golden demos

Three local proof workflows demonstrate the substrate end-to-end. They are runnable-in-principle today over existing primitives; this section names them so they can be maintained as regression proofs, not re-discovered per session.

1. **Product / site → ad-creative pack.** Brief names a brand URL → site-grounding sub-agent crawls it (AGENTS.md #15, [`../playbooks/site-grounding.md`](../playbooks/site-grounding.md)) → `classifyContentMode` returns `ad-creative-pack`/`fb-creatives` → the [`fb-creatives`](../../.agents/skills/fb-creatives/SKILL.md) skill scaffolds the 5-set matrix → parallel `ralphy generate image` with `--ref` on every gen → `ralphy unit create` packages the numbered PNGs. Proves: research → mode → format-match → generate → Unit.
2. **Source video / audio → short Units.** A long-form audio file or URL → the [`audio-explainer`](../../.agents/skills/audio-explainer/SKILL.md) skill (yt-dlp pull → Scribe transcript → claim segmentation → overlay plan → HyperFrames → `ralphy render`), OR a source reel → researcher analysis → scenario → i2v → render → eval → Unit. Proves: ingest → scenario/transcript → assets → render → eval → Unit.
3. **Open-world unknown brief → provisional mode → finished Unit.** A brief that does not classify to a first-class mode → infer the closest media format, research the niche, run a *provisional* mode, then converge on a real Unit. Proves: the substrate degrades gracefully on unknown content instead of refusing.

**Honest gap:** demo #3's provisional-mode path is **not yet a built primitive** — `classifyContentMode` returns `ambiguous: true` and the agent asks one disambiguating question today, but the open-world mode compiler with provisional modes is tracked as the still-open #454 (a follow-up to the #418 compiler). Demos #1 and #2 are runnable over shipped primitives now; #3 is runnable only via the manual "ask one question, then route to the closest supported mode" fallback until #454 lands. None of the three is yet checked in as a maintained, asserted regression fixture (see §7).

---

## 6. No human wizard drift

The default-driver assumption is explicit in [`../../AGENTS.md`](../../AGENTS.md) ("Positioning — who operates Ralphy"): **the user does not operate `ralphy` by hand — they talk to a chat agent in plain language, and the agent drives the CLI on their behalf.** The CLI exists to give the agent reproducible model calls, project state, quality gates, renders, logs, and memory. Direct human CLI use is sanctioned only for setup, debugging, and power users.

The design consequences this contract commits to:
- Every state surface (§1) is machine-readable JSON first; the pretty/TTY rendering is the human-debug affordance, never the primary path.
- The contract ledger "is guidance, not a wizard — it never prompts the user" ([`../../cli/lib/contract.ts`](../../cli/lib/contract.ts) header + the resume-model section of the contract doc).
- Approvals are surfaced to the agent as state (a `user-approval-needed` stop condition, a missing spend approval) for the agent to relay — not as an interactive CLI prompt the human must answer at a terminal.

A new feature that requires a human to sit at a terminal and answer an interactive prompt to advance the pipeline is a regression against this contract.

---

## 7. What this contract does NOT yet cover (the honest gaps)

So this reads as a bar, not a victory lap:

- **No fused resume verb.** §2 — a fresh agent composes the snapshot from `project status --contract` + `project budget` + `project scorecard` + `eval.json`. The data is all present and cheap; a single `ralphy project resume <id>` payload does not exist yet.
- **Open-world / provisional mode is unbuilt.** §5 demo #3 — the provisional-mode compiler is the still-open #454. Today an unknown brief gets the "ask one question, route to the closest supported mode" fallback, not an inferred provisional mode.
- **Golden demos are not asserted fixtures.** §5 — the three flows are runnable-in-principle and documented, but there is no checked-in regression harness that exercises them on a cadence. #452 calls for "maintain at least three local proof workflows"; the maintenance loop is not yet wired.
- **Spend enforcement is opt-in and project-local.** §1 — `ralphy project approve` records a per-project ceiling that `ralphy generate` checks ([`../../cli/lib/spend.ts`](../../cli/lib/spend.ts)); with no approval recorded, generation is unenforced, and there is no workspace- or account-level ceiling. A cross-project / cross-workspace budget is a [`cloud-factory-design-seam.md`](cloud-factory-design-seam.md) §4 concern, not built here.
- **No async approval record.** Approvals are a synchronous chat turn the agent relays; the queue does not yet model `awaiting-approval → approved/denied` as job state (named as the seam in [`cloud-factory-design-seam.md`](cloud-factory-design-seam.md) §3). Local pipelines pause in chat, not in `jobs.db`.

These are the load-bearing items for the #452 program. The substrate is real and inspectable today; the gaps above are what stand between "a strong set of primitives" and "an agent can resume any project from disk alone with one call."

## See also

- [`../playbooks/agent-production-contract.md`](../playbooks/agent-production-contract.md) — the canonical phase sequence (§3).
- [`../playbooks/unit-lifecycle.md`](../playbooks/unit-lifecycle.md) — the end-to-end Unit lifecycle that reads the contract as its backbone.
- [`cloud-factory-design-seam.md`](cloud-factory-design-seam.md) — the local→remote boundary this contract's local half is measured against.
- [`../../cli/lib/contract.ts`](../../cli/lib/contract.ts) · [`../../cli/lib/spend.ts`](../../cli/lib/spend.ts) · [`../../cli/lib/scorecard.ts`](../../cli/lib/scorecard.ts) · [`../../cli/lib/jobs/db.ts`](../../cli/lib/jobs/db.ts) · [`../../cli/lib/gen-log.ts`](../../cli/lib/gen-log.ts) — the primitives this contract describes.
- #454 — the open-world follow-up (§5 demo #3 / §7).
