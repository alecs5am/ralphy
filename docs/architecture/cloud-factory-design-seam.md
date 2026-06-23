# Managed cloud factory — design seam

> **Status:** design only. Nothing here is built. No remote workers, no accounts, no billing, no shared storage, no hosted queue exists or is proposed for this round. This doc names the boundary a future managed version would cut along, so local decisions made now don't quietly wall it off.
> **Tracks:** [`../../notes/issues/done/462-managed-cloud-factory-design-seam.md`](../../notes/issues/done/462-managed-cloud-factory-design-seam.md)
> **Grounded as of:** 2026-06-23 against the live repo. Path/primitive citations below were verified to exist (or noted as absent/planned) at that time.

Read [`../../CLAUDE.md`](../../CLAUDE.md) (the `.ralphy/` layout) and [`../../AGENTS.md`](../../AGENTS.md) (the hard invariants — especially #1 connector-only keys and #14 append-only) for the surrounding context. The local primitives this seam wraps already exist: the job queue + daemon ([`../../cli/lib/jobs/db.ts`](../../cli/lib/jobs/db.ts), `.ralphy/jobs.db`), the path resolver with its injectable root ([`../../cli/lib/paths.ts`](../../cli/lib/paths.ts) `setRoot`), the provider connectors ([`../../cli/lib/providers/`](../../cli/lib/providers/)), and the project registry (`.ralphy/registry.json`).

---

## 1. Goal & non-goals

### Goal

Name the one boundary a future managed Ralphy ("any amount of media, run for you") would cut along, and the local assumptions that would have to become abstractions at that boundary — so the local CLI and the desktop product can keep being built without painting the cloud version into a corner. The local factory must prove repeatable quality FIRST; this doc only keeps the door open.

### Non-goals

- **Not building cloud anything.** No remote workers, no hosted queue, no accounts, no billing, no shared object store, no library sync service, no direct platform publishing this round (per the issue's design-only acceptance).
- **Not a rewrite mandate.** The point is the opposite: identify the few seams worth keeping clean so the local system stays portable, and leave everything else local-first.
- **Not a schedule.** Cloud is a later milestone gated on the local + desktop tracks (#452, #453) proving the workflow. This is insurance, not a roadmap item.

---

## 2. The boundary

There is exactly one boundary worth naming: **between the agent/driver that decides what to produce and the execution substrate that produces it.** Locally both live on one machine and talk through the filesystem (`.ralphy/`) and a local SQLite queue (`jobs.db`). A managed version splits them: the driver (chat surface + LLM) stays near the user; the substrate (queue, generation, storage) becomes a remote service addressed by a project/workspace identity instead of a local path.

Everything below is "what changes when that single seam goes over a network."

---

## 3. Portability checklist

The local assumptions that would each have to become an abstraction at the boundary. Keep these few replaceable; let the rest stay local-first.

| Local assumption | Where it lives today | What cloud needs it to become |
|---|---|---|
| **Filesystem paths** (`.ralphy/...` rooted at cwd) | [`cli/lib/paths.ts`](../../cli/lib/paths.ts) — already centralized, already has `setRoot()` for tests | A storage adapter behind the same `paths.ts` surface: local FS vs. object-store keys. The single choke point already exists; do not scatter `path.join(dataRoot, ...)` outside it. |
| **Process spawning** (the daemon, ffmpeg, agent binary) | local child processes; daemon polls `jobs.db` | A worker pool consuming a hosted queue. Keep job execution behind the queue contract (§4), not inline in command handlers. |
| **Provider keys** (`OPENROUTER_API_KEY`, `ELEVENLABS_API_KEY`, `FAL_KEY`) | per-connector `envVar`, connector-only (invariant #1) | Server-held secrets per account, never shipped to the client. Invariant #1 (keys only inside registered connectors) is exactly the discipline that makes this safe — preserve it. |
| **Queue state** (`jobs.db`, `depends_on`, retry, status) | local SQLite | A shared queue with the same job shape (§4). The DAG + retry semantics are already explicit; portability = not leaking SQLite specifics into callers. |
| **Artifact serving** (`<project>/artifacts/`, append-only) | local files; Studio reads them read-only | Signed URLs over object storage. Append-only (#14) maps cleanly to immutable object keys + versioned names. |
| **User approvals** (paid-gen / irreversible gates) | synchronous chat prompt before spend | An async approval record on the job: `awaiting-approval → approved/denied`, surfaced to whatever client is attached. The gate must be a queue state, not an in-process pause. |
| **Workspace/project identity** | `registry.json` maps `id → workspace`, bare ids | `(account, workspace, project)` tuple. Keep ids opaque + relocatable (`project move` already exists) so an account prefix can be added without reshaping callers. |

---

## 4. API sketch (high level)

The shapes a hosted substrate would expose. These mirror primitives that already exist locally — the sketch is "what the local thing looks like once it's addressable over a network," not new surface.

- **Job** — `{ id, account, workspace, project, kind (generate.image|video|voiceover|music|render|eval), spec, dependsOn[], status (pending|running|awaiting-approval|done|error), cost, attempts, logs }`. Mirrors [`cli/lib/jobs/db.ts`](../../cli/lib/jobs/db.ts) + the `workflow.json` fan-out (#478). Submit / get / cancel / approve.
- **Artifact** — `{ uri, project, kind, slot, version, mime, bytes, provenance }`. Mirrors `<project>/artifacts/<kind>/` + the asset manifest. Immutable; new version = new key (append-only #14).
- **Unit** — `{ id, project, format, media[] (ordered artifact refs), provenance (template/style/recipe/asset ids), readinessVerdict }`. Mirrors [`cli/lib/schemas/unit.ts`](../../cli/lib/schemas/unit.ts).
- **Spend** — `{ account, workspace, approvedBudget, spent, remaining, ledgerRows[] }`. The cloud enforcement point for the planned spend ledger (#444); locally this is per-project gen-log cost rows.
- **Workspace** — `{ account, slug, sharedRefs, evaluators, workflows[] }`. Mirrors `.ralphy/workspaces/<ws>/`; the unit of multi-tenancy.

---

## 5. Risk list

- **Security** — server-held provider keys + per-account isolation; never ship a key to a client (invariant #1 already enforces connector-only key reads — the cloud port must not relax it). Signed, expiring artifact URLs; no cross-account path traversal.
- **Cost control** — generation is real money. A hosted queue MUST enforce the spend ledger (#444) as a hard ceiling per account/workspace, with approval gates as queue states (§3), not advisory. A runaway fan-out is the headline failure mode.
- **Abuse** — open generation invites spam/NSFW/CSAM/deepfake attempts. Needs rate limits, content policy at submit time, and an audit trail. Shares the validation surface with community uploads ([`community-uploads-design.md`](community-uploads-design.md) §7).
- **Copyright / likeness** — the reference-required gate (invariant #3) and named-entity handling become a liability surface when strangers drive it; provenance on every artifact is the mitigation.
- **Platform publishing** — direct upload to TikTok/Meta/etc. carries each platform's ToS, token custody, and takedown risk. Keep publishing manual-package-first (see #458); direct API upload is the last thing to add, behind explicit per-account consent.

---

## 6. Decision hooks

This seam exists to keep the following tracks portable; revisit it when any of them makes a path/identity/secret decision:

- **Agent substrate** (#452) — the agent-substrate contract IS the local half of §2's boundary. Keep its state inspectable + resumable from artifacts, not chat.
- **Desktop MVP** (#453) — local-agent-first; its agent bridge + approval UX is the same driver/substrate split, just both halves local. Don't hardcode "the agent is in this process."
- **Scale operations** (#460) — the spend ledger, queue hardening, and approval scopes built there are the exact primitives §4 would expose; build them queue-shaped, not inline.
- **Universal media artifact model** (#461) — the artifact metadata contract is the §4 Artifact shape; keep it storage-agnostic (uri, not local path).

---

## What this does NOT decide

Storage vendor, queue technology, auth provider, pricing, and whether cloud ever ships. All deferred. The only commitment is: keep [`paths.ts`](../../cli/lib/paths.ts) the single path choke point, keep keys connector-only, keep the queue contract explicit, and keep approvals modeled as job state — and the cloud port stays a wrapping job, not a rewrite.
