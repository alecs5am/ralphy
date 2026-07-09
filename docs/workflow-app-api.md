# Studio workflow-app API boundary (#492)

Studio (`studio/`) is the visual workflow surface; **Claude Code is the outer orchestrator**. As Studio grows past a read-only browser, the agent should operate it through a stable local API instead of re-deriving `.ralphy/` file paths for every action. This doc is that contract.

> **The rule:** orchestrate through the API boundary. Prefer an endpoint here over an ad-hoc `.ralphy/` file read wherever one exists. The `.ralphy/` files remain the durable state behind the API — the API is the operational contract Studio, Claude Code, and future agents share.

The server is one `Bun.serve` process ([`studio/server/index.ts`](../studio/server/index.ts)): built UI + JSON API + WebSocket live-watch. It is **read-only over media** (AGENTS.md invariant #14) — the only writes are metadata sidecars or engine state, never media.

## Discovery — `GET /api/capabilities`

The machine-readable action list. Call it FIRST to discover the surface instead of guessing. It returns:

- `capabilities[]` — every action as `{ id, method, path, summary, mutates, throughCli }`.
- `idConventions` — how each stable object id is formed.
- `rules[]` — the media-safety + orchestration rules, stated for the consumer.

`throughCli` names the ralphy verb a money/state transition routes through. A `mutates: true` action with `throughCli: null` is an append-only **metadata** sidecar write (board choice, annotation, inbox pack, config-patch proposal). Source: [`studio/server/capabilities.ts`](../studio/server/capabilities.ts).

## Stable object ids

Every response Studio displays and Claude Code references carries a stable id:

| Object | Id shape |
|---|---|
| workspace | the workspace slug (kebab-case) |
| project | `{context}-{NNN}` |
| run | the farm run id |
| **approval** | **`<run>::<node>`** — the run id + the parked node id |
| annotation | id returned on add |
| config patch | id returned on propose |
| inbox pack | `<timestamp>-<action>` |

## The endpoints

Reads (GET) and metadata mutations already existed for annotations (#488), the agent inbox (#489), the run graph (#490), and config patches (#491); the farm control plane + workflow graphs came with #506. This issue adds the **capability endpoint** and the **approval list/respond** gap (#533), and exposes an inbox **show** (`?id=`) and a per-run **show** consistently.

### Runs

- `GET /api/runs?workspace=<ws>` — every run.
- `GET /api/runs/<id>?workspace=<ws>` — one run's rolled-up status/summary.
- `GET /api/runs/<id>/graph?workspace=<ws>` — the derived source-to-unit graph (#490).

### Workflows

- `GET /api/workspaces/<ws>/workflows` — a workspace's workflows with their shape.
- `GET /api/workspaces/<ws>/workflows/<name>/graph` — a graph workflow's node/edge/layer view.

### Annotations (#488), inbox (#489), config patches (#491)

- `GET|POST /api/(projects|runs)/<id>/annotations` (`/remove` to tombstone).
- `GET /api/(projects|runs)/<id>/inbox` (append `&id=<packId>` for one pack) · `POST` to create a context pack.
- `GET /api/runs/<id>/config-patches` · `POST` to **propose** (validate + queue) an allowlisted patch.

Config patches are **proposals** — Studio never applies them. Apply stays the agent's `ralphy studio patch apply` behind the paid-generation gate.

### Approvals (#492/#533) — the parked-approval gate

- `GET /api/workspaces/<ws>/approvals` — every parked-approval item awaiting a decision, each with a stable `<run>::<node>` id, its gated unit/project, the media proof, the caption/title/targets, the gate verdict+score, and realized cost. Enumerates the workspace's `parked-approval` runs and assembles each via `ralphy farm review <run>` (a pure read of existing artifacts + the run journal — no media write).
- `POST /api/workspaces/<ws>/approvals/respond` — `{ id, decision, reason?, actor?, capUsd? }` where `decision` is `approve | reject | request-change`. Drives `ralphy farm review <run> --<decision> <node>` through the CLI. **It adds NO new media mutation** — the verb's `applyReviewDecision` ([`cli/lib/review-card.ts`](../cli/lib/review-card.ts)) maps each action to an existing transition:

  | decision | ralphy transition | effect |
  |---|---|---|
  | `approve` | `recordRunApproval` | releases the park on the next farm resume |
  | `reject` | append-only unit rejection note | media untouched (invariant #14) |
  | `request-change` | `buildRepairPlan` enqueue | routes into the #519/#511 repair loop |

  `reject` and `request-change` require a `reason` (the CLI refuses without one; the refusal relays verbatim).

## Invariants

1. **Orchestrate through the boundary.** Prefer an endpoint over an ad-hoc `.ralphy/` file read where one exists.
2. **Studio writes only metadata; money/state transitions go through a ralphy verb** (the `throughCli` field), never a second media engine (AGENTS.md invariants #1/#14). The approval respond path is the model: Studio relays the decision to `ralphy farm review`; it never generates, renders, evals, or repairs on its own.
3. **Auth (#506) gates every route** — a set `STUDIO_AUTH_TOKEN` requires `Authorization: Bearer <token>` or the `studio_auth` cookie on every route except `GET /api/health` and `POST /api/auth`. The new routes are gated exactly like their siblings.
