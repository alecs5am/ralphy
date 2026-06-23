# Scale operations and spend control

> **Status:** operating contract. Defines how an agent safely runs a LARGE local batch over primitives that already exist (`#428` queue, `#444` spend ledger, `#410` farm/batch review, `#107` Studio). It does NOT build new infrastructure — it names the contract over the built parts and the gaps that remain.
> **Tracks:** [`../../notes/issues/done/460-scale-operations-and-spend-control-program.md`](../../notes/issues/done/460-scale-operations-and-spend-control-program.md)
> **Grounded as of:** 2026-06-23 against the live repo. Every code/path citation below was verified to exist (or noted as a gap) at that time.

Read [`../../CLAUDE.md`](../../CLAUDE.md) (the `.ralphy/` layout) and [`../../AGENTS.md`](../../AGENTS.md) (the hard invariants — especially #4 quality gates refuse, #14 append-only) for the surrounding context. The farm flow this contract operationalizes lives in [`../playbooks/producer.md`](../playbooks/producer.md) (`#410`); the cloud follow-on is [`cloud-factory-design-seam.md`](cloud-factory-design-seam.md).

---

## 1. Local batch run contract

A 100-Unit run moves through one ordered, provenance-preserving sequence. No phase is allowed to lose the audit trail, and no paid phase runs without an explicit approval.

1. **Plan.** The producer farm flow ([`../playbooks/producer.md`](../playbooks/producer.md)) turns one strategic brief into a shared style lock + a variation matrix. The plan is a `production-plan.json` artifact per item, not chat-only — so the run is resumable from disk (see §5).
2. **Approve.** Before any paid generation the user records a spend approval per project: `ralphy project approve <id> --cap <usd> --reason "..."` writes the append-only `spend-ledger.json` ([`../../cli/lib/spend.ts`](../../cli/lib/spend.ts)). This is the hard budget cap §2 enforces.
3. **Queue.** Items are enqueued as jobs. `ralphy generate ... --queue` records its own argv minus the queue-control flags ([`../../cli/lib/jobs/enqueue.ts`](../../cli/lib/jobs/enqueue.ts) `deriveWrappedArgv`); `ralphy batch submit --from <file>` inserts a whole DAG with symbolic `depends_on` refs resolved topologically (`submitBatchFromFile`, cycle-checked). The daemon auto-starts on first enqueue.
4. **Monitor.** `ralphy queue list` / `ralphy queue watch` render the live ledger; `ralphy queue logs <id> --follow` tails one job (§3, §5).
5. **Pause / resume.** Stopping the daemon leaves the SQLite queue intact (`.ralphy/jobs.db`); restarting it re-claims the still-`pending` rows. There is no separate checkpoint — the queue *is* the checkpoint. Cancel-then-retry (`ralphy queue cancel` / `retry`, by id or `--tag`/`--state` filter) is the explicit pause/resume primitive, and it flips status without ever deleting rows ([`../../cli/lib/jobs/db.ts`](../../cli/lib/jobs/db.ts) `cancelJobsByFilter` / `retryJobsByFilter`).
6. **Triage.** `ralphy batch review <id>` ([`../../cli/commands/batch.ts`](../../cli/commands/batch.ts)) is a ZERO-model-call aggregation over the member projects: winners (ship-ready), failures (failed eval), a cost roll-up (sum of per-project `generations.jsonl` cost), style drift vs the shared lock, repeated model failures, and recommended repairs in the `#409` owner buckets.
7. **Repair.** A failed/`repair` verdict feeds the deterministic `ralphy project repair-plan <id>` ([`../../cli/lib/repair.ts`](../../cli/lib/repair.ts)) — owner-classified, free, no model calls. Re-rolls dispatch the same `ralphy generate` verbs, so they are spend-gated transitively (§2).
8. **Package.** Survivors become Units via `ralphy unit create` — COPIES of curated `artifacts/`, append-only (`#069`). Provenance (template / style / recipe / asset ids + the per-project gen-log) travels into `unit.json` untouched.

Provenance never breaks because every phase appends: the gen-log, the queue rows + per-job logs, the eval/repair JSON, and the Unit copies all stay on disk (AGENTS.md #14).

---

## 2. Spend governance

The `#444` ledger ([`../../cli/lib/spend.ts`](../../cli/lib/spend.ts)) is an OPT-IN, project-local budget cap. `checkSpend(projectId, { estimatedUsd, mode })` is consulted BEFORE every paid call: it sums actual spend from `generations.jsonl`, adds the per-call estimate (one shared price table via `estimatedCallCostUsd`), and hard-stops on any of expired / mode-not-allowed / spent+estimate > cap. With no recorded approval it returns `{ allowed: true }` — behavior is unchanged until the user runs `ralphy project approve`.

**What is enforced today:**

- **Generation.** All five paid `ralphy generate` kinds gate at a single chokepoint each — `maybeCheckSpend(...)` is called for `image`, `video`, `voiceover`, `music`, and `sfx` in [`../../cli/commands/generate.ts`](../../cli/commands/generate.ts) (five sites), raising `E_BUDGET_EXCEEDED` on breach. `--no-budget "<reason>"` is the explicit override and logs `stage: "no-budget"` to `user-prompts.jsonl` (auditable, mirrors `--no-ref-consent`).
- **Variant tournaments.** `ralphy generate --variants N` passes the variant count into the same image gate, so the cap sees the full fan-out cost. `ralphy batch tournament` re-rolls and `batch vary` go through `ralphy generate`, so they inherit the gate.
- **Repair.** The repair loop spends ONLY by dispatching `ralphy generate`, so every re-roll is gated transitively — there is deliberately no duplicate ledger check in `repair.ts`.

**Enforcement gaps (honest):**

- **The ledger is project-scoped, not run-scoped.** `checkSpend` reads one project's ledger + one project's gen-log. A 100-Unit run spanning N projects needs N approvals and has NO single ceiling across the run. `Approval.scope` carries a `"batch"` value but it is recorded metadata, not a batch-wide cap — nothing aggregates spend across the member projects. A workspace/batch-level cap is the missing primitive.
- **The queue worker does not call `checkSpend` itself.** Enforcement on a queued job is purely transitive through the re-run `ralphy generate` argv, and only when `--project <id>` was preserved on that argv. A `queue add -- sh -c "..."` shell job, or a generate enqueued without `--project`, bypasses the ledger entirely. The gate lives in the command, not the daemon.

---

## 3. Queue reliability

The `#428` queue is SQLite-backed (`bun:sqlite`, WAL mode, single-writer daemon + many readers) at `.ralphy/jobs.db` ([`../../cli/lib/jobs/db.ts`](../../cli/lib/jobs/db.ts)). The contract it exposes:

- **DAG dependencies.** `depends_on` is a job-id array; `claimNextPending` only claims a job when ALL deps are `completed`, and cascade-`blocked`s a job the moment any dep is `failed`/`cancelled`. Cycles are rejected at submit (`validateNoCycle`).
- **Endpoint-aware concurrency.** The worker runs up to a global `concurrency` (default 4) and accepts per-kind overrides — a per-kind cap + a `minIntervalMs` burst throttle ([`../../cli/lib/jobs/schedule.ts`](../../cli/lib/jobs/schedule.ts) `canDispatchKind`). The atomic claim is restricted to dispatchable kinds, so an ElevenLabs-limited kind can be throttled below the image kind without serializing the whole queue. Defaults preserve pre-`#428` behavior (cap = global, interval = 0).
- **Retry / cancel.** Per-id or bulk-by-`--tag`/`--state`. Both refuse to act without a filter (no accidental mass-wipe), flip status in place, and increment `retry_count` while preserving every prior `job_logs` row.
- **Summaries.** `countByStatus` powers the `queue watch` dashboard (pending / running / done / failed / blocked + daemon up/down).
- **Known-error hints.** A failed job carries `burstCapHint` plus the `#450` taxonomy (`errorClass` / `retryPolicy` / `nextAction` / `fallbackModels`) via `classifyError`, surfaced by `queue list` / `queue show`.

**Gaps:** retry is manual (no automatic backoff/retry policy on the worker — `retry_count` increments only on an explicit `queue retry`); per-kind schedule knobs exist but are not auto-derived from a provider's documented rate limit; the spend gap in §2 (worker does not enforce the cap) is the headline reliability-vs-cost risk for an unattended run.

---

## 4. Workboard integration

A weekly tranche of work is selected with a `#451` **workboard** ([`../../notes/workboards/README.md`](../../notes/workboards/README.md)) — a notes-native, disposable grouping of existing `notes/issues/` into ordered execution lanes for one session. It SELECTS + ORDERS + records the handoff; it does NOT replace `notes/issues/`, which stays the single source of truth (if they disagree, `notes/issues/` wins). A run opens a dated board from [`../../notes/workboards/TEMPLATE.md`](../../notes/workboards/TEMPLATE.md), updates each lane's status inline as issues land or defer, and closes with completion notes. This is the operations-layer analogue of the per-item batch ledger: the board tracks which *issues* are in flight, the queue + `batch review` track which *generations* are in flight.

---

## 5. Progress reporting

An agent emits a status summary from artifacts that already exist — no new bookkeeping:

| Field | Source |
|---|---|
| **completed / failed / blocked** | `ralphy queue list` (`countByStatus`) for in-flight jobs; `ralphy batch review` winners/failures for finished items. |
| **cost** | `actualSpendUsd` per project + the `batch review` cost roll-up; against the cap from `ralphy project budget`. |
| **quality** | `ralphy batch review` winners (ship-ready) vs failed-eval; per project `ralphy project status <id> --contract` ([`../../cli/commands/project.ts`](../../cli/commands/project.ts)) gives the phase ledger + `stage-gate-unmet` reasons. |
| **next action** | the `#409` recommended-repair owner buckets from `batch review` / `repair-plan`. |

The summary is reproducible because every input is a committed artifact (queue DB, gen-log, eval JSON), so a fresh agent can reconstruct run state without the chat history.

---

## 6. Artifact visibility

Run outputs are inspected without manual `ls` (the `.ralphy/` root is hidden) through **Ralphy Studio** (`#107`, [`../../studio/server/index.ts`](../../studio/server/index.ts)): a local artifact browser + scene board over `<project>/artifacts/<kind>/`, with a Files grid, a Board view of scene-image variants, and a collapsible workflow strip. It is **read-only over MEDIA** — the sole writes are the board choice and board layout (`POST /api/projects/:id/board/choose` and `/board/layout`); every other non-GET returns 405. It never mutates media, upholding AGENTS.md #14. Per-job stdout/stderr is separately visible through `ralphy queue logs <id>` / `queue watch <id>` (§3). Studio is the visual alternative to `fd -H` into `.ralphy/`; the CLI is the alternative for jobs/cost.

---

## 7. Cloud seam

Everything above is **local-only**: a single machine, the filesystem `.ralphy/` root, a local SQLite queue, synchronous chat approvals, and a per-project ledger. Which of these would become network abstractions — a hosted queue with the same job shape, signed-URL artifact serving, server-held keys, approvals as async job state, and an account/workspace/project identity tuple — is DEFERRED to and fully owned by [`cloud-factory-design-seam.md`](cloud-factory-design-seam.md). The discipline this doc must preserve so that seam stays cuttable: build operations queue-shaped (not inline in command handlers), keep keys connector-only, and model approvals as state, not an in-process pause. Nothing here proposes building cloud anything.

---

## Local-first milestone

The bar this contract targets: **one agent safely runs a large batch with a budget cap, a resumable queue, and quality triage.** Concretely — plan + approve a per-project cap, `batch submit` a dependency-ordered DAG, monitor + pause/resume via the queue, triage with the zero-model `batch review`, repair through the gated `repair-plan`, and package survivors into append-only Units, all reconstructable from disk after a restart. Cloud execution is a later milestone, not required to prove the local factory.

## What this does NOT decide

- **A run-wide / workspace budget cap.** The ledger is project-scoped (§2); a cross-project ceiling for an N-project run is an open gap, not a decision made here.
- **Daemon-level spend enforcement.** Whether the worker should re-check the cap before spawning (closing the §2 transitive-only gap) is deferred to the `#444` follow-up.
- **Automatic retry/backoff policy.** The worker retries only on explicit `queue retry`; an auto-backoff policy is unspecified.
- **Auto-derived per-endpoint rate limits.** The schedule knobs exist but are hand-set, not pulled from provider docs.
- **Anything cloud.** Storage vendor, hosted queue, accounts, billing, team permissions — all owned by [`cloud-factory-design-seam.md`](cloud-factory-design-seam.md).
