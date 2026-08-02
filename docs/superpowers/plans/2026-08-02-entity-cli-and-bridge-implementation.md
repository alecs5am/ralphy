# Entity CLI and Desktop Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert every stateful Ralphy workflow to the domain store and expose the same versioned operations to chat agents and Desktop through a long-lived stdio bridge.

**Architecture:** CLI commands remain thin Commander adapters around the store functions from the core-domain plan. A root-bound `ralphy bridge --stdio --root <path>` process dispatches versioned JSONL requests to those same functions, streams monotonic activity events, resolves scoped object locators, and owns encrypted credentials plus any agent process that needs them.

**Tech Stack:** Bun, TypeScript, Commander, `bun:sqlite`, Node streams/crypto/child_process, macOS Keychain `security`, Zod, `bun:test`

## Global Constraints

- Complete the core-domain-store plan before this plan.
- Desktop and sibling repositories may invoke the installed CLI contract but may not import core source or open SQLite.
- Every command accepts explicit Workspace/Project scope or an Agent Session ID; remove the mutable global active-Workspace pointer.
- Preserve existing public command names where their semantics remain valid; deprecated path-shaped commands become entity adapters, not parallel stores.
- Machine stdout contains JSON or JSONL only; diagnostics go to stderr.
- Bridge mutations use expected revision/head IDs and return `E_CONFLICT` instead of overwriting newer work.
- External optimistic names are consistent: row mutations use `expectedRowVersion`, head/selection mutations use `expectedRevisionId`, and operational transitions use `expectedState`.
- Never return stored secret values through CLI JSON, bridge responses, logs, activity payloads, or errors.
- Long provider, render, publish, and agent operations use Runs and never keep a database transaction open.
- Compatibility readers live only under `cli/lib/migration/`; ordinary commands have no legacy JSON/JSONL/Markdown fallback.
- Keep files and commit messages English-only and regenerate `docs/cli-surface.generated.md` after command changes.

---

### Task 1: Add stable domain errors and the encrypted core secret store

**Files:**
- Modify: `cli/lib/errors/catalog.ts`
- Create: `cli/lib/errors/domain.ts`
- Modify: `tests/unit/errors-catalog.test.ts`
- Create: `cli/lib/store/secrets.ts`
- Modify: `cli/commands/provider.ts`
- Modify: `cli/commands/setup.ts`
- Modify: `cli/commands/postiz.ts`
- Modify: `cli/lib/providers/postiz.ts`
- Modify: `cli/lib/providers/registry.ts`
- Modify: `cli/lib/providers/shared.ts`
- Modify: the smallest current connector modules that read provider credentials from `process.env`
- Test: `tests/unit/secret-store.test.ts`

**Interfaces:**
- Consumes: immutable `getStoreIdentity()`, `.ralphy/`, Node AES-256-GCM, and `/usr/bin/security` on macOS
- Produces: throwable `DomainError`, `setSecret(ref, value)`, internal-only `readSecret(ref)`, `deleteSecret(ref)`, `hasSecret(ref)`, an explicit provider credential resolver, `provider auth set|clear|status`, and errors `E_CONFLICT`, `E_OBJECT_MISSING`, `E_MIGRATION_INCOMPLETE`, `E_PROTOCOL_UNSUPPORTED`, `E_PROTOCOL_INVALID`, `E_SECRET_STORE`

- [ ] **Step 1: Extend the append-only error catalog test first**

Raise the catalog budget from `< 40` to `< 48` and assert the six exact new codes exist with classes and HTTP analogs:

```ts
expect(ERROR_CODES.E_CONFLICT.httpAnalog).toBe(409);
expect(ERROR_CODES.E_OBJECT_MISSING.httpAnalog).toBe(424);
expect(ERROR_CODES.E_MIGRATION_INCOMPLETE.httpAnalog).toBe(409);
expect(ERROR_CODES.E_PROTOCOL_UNSUPPORTED.httpAnalog).toBe(426);
expect(ERROR_CODES.E_PROTOCOL_INVALID.httpAnalog).toBe(400);
expect(ERROR_CODES.E_SECRET_STORE.class).toBe("env");
```

Run: `bun test tests/unit/errors-catalog.test.ts`

Expected: FAIL because the codes are absent.

- [ ] **Step 2: Add actionable catalog entries and a throwable domain boundary**

Use conflict hints that tell the agent to reload the exact entity, missing-object hints that name `ralphy doctor --storage`, migration hints that name `ralphy migrate domain verify`, protocol hints that require upgrading Desktop/core, and secret hints that name `ralphy provider auth status`.

`DomainError` carries only a stable code, safe message, and sanitized JSON details. Store/controllers/providers throw; only Commander adapters format and exit. Bridge code never calls or imports `raiseError()` and maps unknown failures to `E_INTERNAL` without stack traces, SQLite text, provider payloads, or secret-bearing exceptions.

- [ ] **Step 3: Write the failing encrypted-store test**

Inject a `KeyProvider` in tests so no real Keychain is touched:

```ts
const store = createSecretStore({ root: tmp.dir, keyProvider: { getOrCreateKey: () => fixedKey } });
store.set("provider/openrouter", "secret-value");
expect(store.has("provider/openrouter")).toBe(true);
expect(store.read("provider/openrouter")).toBe("secret-value");
expect(await Bun.file(`${tmp.dir}/.ralphy/secrets.enc`).text()).not.toContain("secret-value");
store.delete("provider/openrouter");
expect(store.has("provider/openrouter")).toBe(false);
```

- [ ] **Step 4: Implement one encrypted file with a Keychain-backed key**

Store `{ version: 1, entries: Record<string, string> }` as one AES-256-GCM envelope `{ version, iv, tag, ciphertext }` in `.ralphy/secrets.enc`, written through a mode-0600 sibling temp file, file/directory fsync, and atomic rename while concurrent writers are serialized. On macOS, obtain a random 32-byte key from a generic-password item whose service is `ralphy-domain-store-key:<store_id>` and account is `ralphy`; the identity comes from `getStoreIdentity()`, never from a mutable root path. If ciphertext exists but its Keychain item is absent, return `E_SECRET_STORE` and never generate a replacement key over unreadable data.

Invoke `/usr/bin/security` without a shell. For creation, put `-w` last and write the key only to child stdin; never put it in argv or env. Capture lookup output internally and never forward it. Validate typed secret refs and keep only refs in SQLite/activity.

`readSecret` is not exported from the public store barrel or any bridge method. `provider auth set <provider> --stdin` and Postiz import read values only from stdin/bridge memory, never argv or inherited env; `clear` deletes and `status` returns configured/unconfigured without a value. Provider/agent code receives credentials through an explicit internal resolver and constructs child environments from a safe base allowlist plus only the requested credential. The long-lived bridge skips project-env loading, privately captures allowlisted inherited credentials at startup, removes known credential keys from its own `process.env`, and never spreads the full environment to a child.

Test corrupted ciphertext, missing Keychain item, concurrent writes, root rename with unchanged store ID, captured child argv/env/stdin, and zero secret occurrence in output, errors, or activity.

- [ ] **Step 5: Verify and commit security primitives**

```bash
git add cli/lib/errors/catalog.ts cli/lib/errors/domain.ts tests/unit/errors-catalog.test.ts cli/lib/store/secrets.ts cli/commands/provider.ts cli/commands/setup.ts cli/commands/postiz.ts cli/lib/providers/postiz.ts cli/lib/providers/registry.ts cli/lib/providers/shared.ts tests/unit/secret-store.test.ts
gitleaks protect --staged --redact
git commit -m "feat(core): add domain errors and encrypted secrets"
```

Expected: both tests pass and gitleaks reports no leak.

### Task 2: Replace active Workspace state with explicit command context

**Files:**
- Create: `cli/lib/context.ts`
- Create: `cli/commands/session.ts`
- Modify: `cli/index.ts`
- Modify: `cli/lib/paths.ts`
- Modify: `cli/lib/registry.ts`
- Modify: `cli/commands/workspace.ts`
- Test: `tests/integration/cli-explicit-context.test.ts`

**Interfaces:**
- Consumes: Workspace/Project/Agent Session rows from the domain store, `--cwd`, and optional legacy positional project IDs
- Produces: `resolveCommandContext(input): CommandContext`, `session start|show|list|end`, where `CommandContext = { workspaceId: string; projectId?: string; sessionId?: string }`

- [ ] **Step 1: Write failing parallel-context tests**

Spawn two CLI commands against one fixture root, each with a different `--workspace`, and assert neither command changes the other's result or writes `activeWorkspace`:

```ts
const a = runCli(["project", "list", "--workspace", "ws_a", "--json"], { cwd: tmp.dir });
const b = runCli(["project", "list", "--workspace", "ws_b", "--json"], { cwd: tmp.dir });
expect(JSON.parse(a.stdout).projects.every((p: { workspaceId: string }) => p.workspaceId === "ws_a")).toBe(true);
expect(JSON.parse(b.stdout).projects.every((p: { workspaceId: string }) => p.workspaceId === "ws_b")).toBe(true);
expect(existsSync(`${tmp.dir}/.ralphy/config.json`)).toBe(false);
```

- [ ] **Step 2: Implement deterministic explicit context**

Resolve one coherent context from an existing active Session or explicit Workspace/Project IDs. A Session fixes immutable scope; any conflicting `--workspace`, `--project`, positional Project, or cwd-derived Project raises `E_INPUT_INVALID` rather than winning by precedence. Without a Session, an explicit Project derives its Workspace, an explicit Workspace may scope Workspace operations, cwd may identify a Project through bucket ownership, and the only Workspace may be inferred only when exactly one exists. More than one possible Workspace without explicit scope raises `E_INPUT_INVALID`; never pick the last-used Workspace.

Add root options `--workspace <id>`, `--project <id>`, and `--session <id>` in `cli/index.ts`. Keep `--cwd` for root detection.

- [ ] **Step 3: Remove mutable active-Workspace writes**

Delete `getActiveWorkspace`, `setActiveWorkspace`, and `currentWorkspace` use from normal command paths. Keep legacy config parsing only in the migration module created by the migration plan. Expose `session start|show|list|end` through the landed immutable Session store. `workspace use` never mutates a Session or active pointer; it becomes a deprecation/error with guidance to start a new explicitly scoped Session. A scope change always creates a new Session. Ending a turn never ends its Session.

- [ ] **Step 4: Verify explicit context**

Run: `bun test tests/integration/cli-explicit-context.test.ts tests/integration/cli-workspace-108.test.ts tests/unit/artifact-paths.test.ts`

Expected: PASS after updating old tests to assert IDs/bucket locators rather than active-pointer paths, including ended/foreign/sibling Session rejection and explicit-flag/Session mismatch.

- [ ] **Step 5: Commit context resolution**

```bash
git add cli/lib/context.ts cli/commands/session.ts cli/index.ts cli/lib/paths.ts cli/lib/registry.ts cli/commands/workspace.ts tests/integration/cli-explicit-context.test.ts tests/integration/cli-workspace-108.test.ts tests/unit/artifact-paths.test.ts
git commit -m "refactor(cli): require explicit workspace context"
```

### Task 3: Expose scope, Document, Artifact, feedback, and activity commands

**Files:**
- Modify: `cli/commands/workspace.ts`
- Modify: `cli/commands/project.ts`
- Create: `cli/commands/document.ts`
- Create: `cli/commands/artifact.ts`
- Create: `cli/commands/activity.ts`
- Create: `cli/commands/feedback.ts`
- Create: `cli/lib/store/transfers.ts`
- Modify: `cli/index.ts`
- Test: `tests/integration/cli-domain-entities.test.ts`
- Modify: `tests/fixtures/verb-shapes.ts`

**Interfaces:**
- Consumes: the complete core-domain Task 9 query/overview/media surface and `resolveCommandContext()`
- Produces: JSON-first CRUD/list/show/revise/promote/select commands with stable IDs and cursor pagination

- [ ] **Step 1: Write one failing end-to-end entity journey**

```ts
const ws = json(runCli(["workspace", "create", "Denti.AI", "--as", "denti-ai", "--json"]));
const project = json(runCli(["project", "create", "Perio pitch", "--as", "perio-pitch", "--workspace", ws.id, "--json"]));
const iteration = json(runCli(["project", "iterate", project.id, "--title", "Client corrections", "--reason", "feedback", "--json"]));
const doc = json(runCli(["document", "create", "--project", project.id, "--kind", "brief", "--slug", "brief", "--title", "Brief", "--json"]));
const rev = json(runCli(["document", "revise", doc.id, "--body", "Updated brief", "--expected", "none", "--iteration", iteration.id, "--json"]));
expect(json(runCli(["activity", "list", "--project", project.id, "--since", "0", "--json"])).items.at(-1).entityId).toBe(rev.id);
```

- [ ] **Step 2: Implement command shapes**

Expose:

```text
workspace create|list|show|update|account
project create|list|show|update|iterate|status|transfer
document create|list|show|revisions|revise|search|bind
artifact create|list|show|revisions|revise|promote|state|usage
feedback add|list|resolve
activity list --since <event-id> --limit <n>
```

All list responses are `{ items, nextCursor }`. `document revise`, `artifact promote`, and metadata updates require `--expected`; `none` is the explicit empty-head token.

Use the public core stores/controllers only; commands and bridge handlers issue no ad-hoc SQL. Lists ordered by creation use the core opaque cursors; activity uses its monotonic integer sequence.

- [ ] **Step 3: Retire registry and path-derived status behavior**

Reimplement Workspace/Project CRUD through `scopes.ts`. Project status reads `project_stages`, exact entity bindings, current Iteration, and open feedback; it no longer infers completion from `scenario.json`, `asset-manifest.json`, or `render/final.mp4`. Workspace account commands store only non-secret platform/provider/external ID/handle metadata and secret refs. Keep `cli/lib/registry.ts` import-free from normal commands so the migration plan can delete it after cutover.

`project transfer` acquires the maintenance lock, creates `storage_transfers` plus one journal entry per Object, moves the exact ID-based Project bucket to the destination Workspace prefix, verifies every byte/hash, then changes `projects.workspace_id` and affected Object buckets in one transaction. `project transfer --resume <transfer-id>` continues from the journal; a failed transfer never leaves DB rows pointing at the new prefix before verification.

The core media controller returns discriminated Artifact, RunObject, and advanced Object cards; `storageClass` remains exactly `durable | working | diagnostic`, while RunObject retention/location are separate fields. Its atomic review operation owns stale-selection checks, Artifact state revision, evaluation/feedback, selection, and activity.

- [ ] **Step 4: Add pretty-output shape coverage and docs**

Add representative list/detail/conflict shapes to `tests/fixtures/verb-shapes.ts`, regenerate CLI docs, then run:

```bash
bun test tests/integration/cli-domain-entities.test.ts
bun test tests/integration/domain-query-surfaces.test.ts
bun run lint:out-coverage
bun run cli:surface:build
bun run cli:surface:check
```

- [ ] **Step 5: Commit entity commands**

```bash
git add cli/commands/workspace.ts cli/commands/project.ts cli/commands/document.ts cli/commands/artifact.ts cli/commands/activity.ts cli/commands/feedback.ts cli/lib/store/transfers.ts cli/index.ts tests/integration/cli-domain-entities.test.ts tests/fixtures/verb-shapes.ts docs/cli-surface.generated.md
git commit -m "feat(cli): add entity-first project commands"
```

### Task 4: Route generation and working media through Runs, Objects, and Artifact revisions

**Files:**
- Modify: `cli/commands/generate.ts`
- Modify: `cli/commands/image.ts`
- Modify: `cli/commands/video.ts`
- Modify: `cli/commands/audio.ts`
- Modify: `cli/commands/voice.ts`
- Modify: `cli/commands/ref.ts`
- Modify: `cli/commands/asset.ts`
- Modify: `cli/lib/providers/shared.ts`
- Modify: `cli/lib/gen-log.ts`
- Modify: `cli/lib/spend.ts`
- Test: `tests/integration/cli-generation-domain.test.ts`

**Interfaces:**
- Consumes: Run/Object/Artifact stores and provider output files
- Produces: each successful generation as one Run plus immutable Object and Artifact revision; each failed generation as a failed Run with visible diagnostics

- [ ] **Step 1: Write a failing fixture-provider generation test**

Assert two generations into one slot create two immutable revisions and no `asset-manifest.json`/`generations.jsonl`:

```ts
const first = generateFixture({ projectId, slot: "scene-01", bytes: "first" });
const second = generateFixture({ projectId, slot: "scene-01", bytes: "second" });
expect(showArtifact("scene-01").revisions.map((r) => r.id)).toEqual([second.revisionId, first.revisionId]);
expect(Bun.file(first.path).text()).resolves.toBe("first");
expect(existsSync(`${legacyProject}/asset-manifest.json`)).toBe(false);
expect(existsSync(`${legacyProject}/generations.jsonl`)).toBe(false);
```

- [ ] **Step 2: Centralize byte-producing operation sequencing**

Add one helper in `cli/lib/store/runs.ts` named `completeArtifactRun(input)` that accepts a finished temp path, measured metadata, logical Artifact identity, and Run ID. It calls `ingestObject`, inserts the Artifact revision, records cost/provider/model on the Run attempt, and emits activity. It never auto-selects or auto-approves the new revision unless the command's existing semantics explicitly request selection.

- [ ] **Step 3: Convert provider and media commands**

Providers write only under the Run temp directory. Replace filename `.vN` archival with Artifact revision creation. `ref pull` creates shared or Project Artifact usages with role `reference`; `asset` becomes a compatibility alias for `artifact`. Replace `gen-log` append/read functions with Run/attempt queries while retaining their exported result shapes until callers are converted. Replace spend JSON aggregation with indexed Run-attempt cost queries.

- [ ] **Step 4: Cover failure evidence and concurrency**

Test provider failure retains stderr/response RunObjects, simultaneous revisions of one Artifact produce distinct revision numbers without overwrite, explicit promotion conflicts on a stale selected ID, and no DB row points to missing bytes after an injected commit failure.

Run: `bun test tests/integration/cli-generation-domain.test.ts tests/unit/auto-version-invariant.test.ts tests/integration/cli-log-asset.test.ts`

- [ ] **Step 5: Commit generation conversion**

Stage only the listed command/provider/store test hunks and commit:

```bash
git commit -m "refactor(generation): persist runs and artifact revisions"
```

### Task 5: Replace composition snapshots and path renders with Composition revisions and Builds

**Files:**
- Create: `cli/commands/composition.ts`
- Create: `cli/lib/composition-build.ts`
- Modify: `cli/commands/render.ts`
- Modify: `cli/commands/hyperframes.ts`
- Modify: `cli/commands/compose.ts`
- Modify: `cli/lib/render/save-version.ts`
- Modify: `cli/lib/composer.ts`
- Modify: `cli/index.ts`
- Test: `tests/integration/cli-composition-build.test.ts`

**Interfaces:**
- Consumes: Composition store, Run/Object/Artifact stores, and current HyperFrames/HTML/ffmpeg render functions
- Produces: `composition show|list|revise|build|select`; `render <project>` becomes the video-specific alias of `composition build`

- [ ] **Step 1: Write a failing revision/build CLI test**

```ts
const draft = json(runCli(["composition", "revise", compositionId, "--engine", "hyperframes", "--json"]));
writeFileSync(`${draft.checkoutPath}/index.html`, fixtureHtml);
const built = json(runCli(["composition", "build", compositionId, "--revision", draft.id, "--profile", "preview", "--json"]));
expect(built.compositionRevisionId).toBe(draft.id);
expect(built.outputs).toHaveLength(1);
expect(json(runCli(["composition", "show", compositionId, "--json"])).revisions[0].builds[0].id).toBe(built.id);
```

- [ ] **Step 2: Implement editable checkouts and sealing**

`composition revise` materializes `.ralphy/tmp/<composition-revision-id>/checkout/` from its parent source Objects and returns the checkout locator for agents. `composition build` ingests every checkout file by logical relative path, validates all input Artifact revisions, seals before spawning the engine, starts a Build/Run, and records either failed diagnostics or ordered output Artifact revisions.

- [ ] **Step 3: Route supported engines with one explicit switch**

`runCompositionBuild` supports the engines already present in core: `hyperframes`, `html`, `ffmpeg`, and `manual`. It rejects unsupported engines with `E_INPUT_INVALID`; do not create a plugin framework. Preserve current HyperFrames lint/render calls and ffmpeg recipes behind this function.

- [ ] **Step 4: Remove directory scanning from composition inputs**

`composer.ts` accepts ordered exact Artifact revision locators from `composition_inputs`; it never scans an artifacts directory, so rejected and historical revisions cannot enter the timeline accidentally. `hyperframes save-version` prints a deprecation hint and delegates to `composition revise` rather than writing `compositions/vN.html`.

- [ ] **Step 5: Verify and commit Builds**

Run: `bun test tests/integration/cli-composition-build.test.ts tests/unit/composer-013.test.ts tests/integration/cli-render-from-clip.test.ts`

```bash
git add cli/commands/composition.ts cli/lib/composition-build.ts cli/commands/render.ts cli/commands/hyperframes.ts cli/commands/compose.ts cli/lib/render/save-version.ts cli/lib/composer.ts cli/index.ts tests/integration/cli-composition-build.test.ts
git commit -m "refactor(render): build sealed composition revisions"
```

### Task 6: Convert Units, platform previews, Postiz publications, and analytics

**Files:**
- Modify: `cli/commands/unit.ts`
- Create: `cli/commands/publication.ts`
- Modify: `cli/commands/publish.ts`
- Modify: `cli/commands/postiz.ts`
- Modify: `cli/commands/analytics.ts`
- Modify: `cli/lib/unit.ts`
- Modify: `cli/lib/publish/publish.ts`
- Modify: `cli/lib/publish/ledger.ts`
- Modify: `cli/lib/analytics/postmortem.ts`
- Modify: `cli/lib/analytics/roi.ts`
- Test: `tests/integration/cli-unit-domain.test.ts`

**Interfaces:**
- Consumes: Unit store and current Postiz connector/mapping logic
- Produces: `unit show|list|revise|select|preview`, `publication list|publish|refresh`, and query-backed analytics

- [ ] **Step 1: Write failing carousel and multi-platform tests**

Create an eight-image Unit revision without copied media, then one video Unit with TikTok/Reels/Shorts presentations. Assert `unit show` returns stable Artifact revision IDs and `unit preview --platform instagram` returns the Instagram-shaped presentation while the Unit ID remains unchanged.

- [ ] **Step 2: Replace Unit directories with DB revisions**

`unit create`/`revise` resolve exact Artifact revisions and insert ordered items. `unit add` creates a new Unit revision rather than mutating a manifest. `unit caption` creates/revises platform presentations. Article body Markdown is a Document/Artifact revision item, not a mutable `unit.json` sibling. Remove media copying from `cli/lib/unit.ts` after migration fixtures cover its reader.

- [ ] **Step 3: Persist publication attempts and metrics**

Keep target-specific caption/settings mapping and Postiz HTTP code, but store every attempt in `publications`; replace `publish-ledger.jsonl` idempotency checks with a unique database key over Unit revision, presentation, target, and schedule slot. Refresh appends Metric snapshots and updates operational Publication state with activity.

- [ ] **Step 4: Query analytics instead of scanning Units**

Rework ROI/postmortem aggregation over Runs, Publications, Metric snapshots, Unit revisions, and provenance IDs. Preserve existing output DTOs where possible so farm callers do not break.

- [ ] **Step 5: Verify and commit delivery conversion**

Run: `bun test tests/integration/cli-unit-domain.test.ts tests/unit/unit-*.test.ts tests/unit/publish-*.test.ts tests/unit/analytics.test.ts`

```bash
git commit -m "refactor(delivery): persist units publications and metrics"
```

### Task 7: Convert remaining structured state and remove filesystem lifecycle inference

**Files:**
- Modify: `cli/lib/store/schema.ts`
- Create: `cli/lib/store/operations.ts`
- Modify: `cli/lib/config.ts`
- Modify: `cli/lib/global-config.ts`
- Modify: `cli/lib/memory/store.ts`
- Modify: `cli/lib/calendar/store.ts`
- Modify: `cli/lib/campaign/store.ts`
- Modify: `cli/lib/contract.ts`
- Modify: `cli/lib/workspace-evaluators.ts`
- Modify: `cli/lib/research/orchestrator.ts`
- Modify: `cli/lib/templater/extract.ts`
- Test: `tests/integration/domain-operations.test.ts`

**Interfaces:**
- Consumes: domain DB, Documents, Artifacts, Runs, Units, Publications, and Project stages
- Produces: schema migration 2 and typed SQL stores for existing non-media stateful verbs

- [ ] **Step 1: Write a failing round-trip matrix test**

The test creates and reads one row through each existing feature surface: non-secret setting, brand profile, persona, Workspace template metadata, memory revision, campaign/cell, calendar entry, evaluator result, and research Run/Document binding. It asserts no `.json`, `.jsonl`, or `.md` control file appears below `.ralphy`.

- [ ] **Step 2: Add schema migration 2**

Create these exact tables with Workspace foreign keys and activity coverage: `settings`, `brands`, `personas`, `workspace_templates`, `memory_entries`, `memory_revisions`, `campaigns`, `campaign_cells`, and `calendar_entries`. Reuse `evaluations`, Documents, Runs, Artifacts, and Publications for evaluator/research/template bodies instead of duplicating them.

Common searchable fields are columns; each table may carry one validated `metadata_json` column for rare feature-specific fields. Secret values are forbidden in `settings`.

- [ ] **Step 3: Convert store modules while preserving their public result shapes**

Replace file reads/writes in the listed modules with explicit SQL. Memory edits create `memory_revisions`; evaluator configurations are typed JSON Document revisions; research results are Documents/Artifacts bound to their Runs; campaign and calendar mutations append activity; project lifecycle reads `project_stages` and exact bindings only.

- [ ] **Step 4: Verify all structured surfaces**

Run: `bun test tests/integration/domain-operations.test.ts tests/unit/campaign.test.ts tests/unit/calendar.test.ts tests/unit/workspace-evaluators.test.ts tests/unit/memory-*.test.ts`

Expected: PASS and schema version 2.

- [ ] **Step 5: Commit operations conversion**

```bash
git commit -m "refactor(core): move structured state into sqlite"
```

### Task 8: Implement the versioned stdio JSONL bridge

**Files:**
- Create: `cli/lib/bridge/protocol.ts`
- Create: `cli/lib/bridge/methods.ts`
- Create: `cli/lib/bridge/server.ts`
- Create: `cli/lib/agent/types.ts`
- Create: `cli/lib/agent/session.ts`
- Create: `cli/lib/agent/codex.ts`
- Create: `cli/lib/agent/claude.ts`
- Create: `cli/commands/bridge.ts`
- Modify: `cli/index.ts`
- Test: `tests/unit/bridge-protocol.test.ts`
- Test: `tests/unit/bridge-boundaries.test.ts`
- Test: `tests/unit/agent-session.test.ts`
- Test: `tests/integration/cli-bridge.test.ts`

**Interfaces:**
- Consumes: all converted domain operations, `resolveCommandContext`, activity cursor, object resolver, secret store, and existing agent/provider execution code
- Produces: root-bound bridge envelopes and methods consumed by Desktop

- [ ] **Step 1: Define and test exact envelopes**

```ts
export type BridgeRequest = { v: 1; id: string; method: string; params?: unknown };
export type BridgeSuccess = { v: 1; id: string; ok: true; result: unknown };
export type BridgeFailure = { v: 1; id: string | null; ok: false; error: { code: string; message: string; details?: unknown } };
export type BridgeEvent =
  | { v: 1; event: "activity"; subscriptionId: string; sequence: number; data: unknown }
  | { v: 1; event: "agent"; agentSessionId: string; turnId: string; sequence: number; data: unknown };
```

Test malformed JSON, multibyte byte limits, unsupported versions, unknown methods, bounded non-empty IDs, duplicate request IDs both in-flight and after completion, connection seen-ID capacity, one response per valid request, and JSON-only stdout.

- [ ] **Step 2: Implement bounded framing, causal dispatch, and one stdout writer**

Use a Buffer-based newline framer that counts bytes before a newline and rejects frames over 1 MiB before buffering the rest; do not use `node:readline`. An oversized frame emits one flushed `E_PROTOCOL_INVALID` failure with `id: null` and terminates the connection. Validate strict request schemas. Keep a lifetime bounded `seenIds` set; never evict IDs for reuse, and require reconnect when the cap is exhausted.

Give every method explicit `read`, `mutation`, or `operation-start` metadata. Serialize short mutations. A read received after a mutation waits for that earlier mutation; independent reads may run concurrently. Long operations return after durable Run/Build/Turn creation and continue outside the mutation lane. Route every response/event through one queued stdout writer, await `drain` after backpressure, and prohibit `console.log` in the bridge subtree. Known `DomainError` codes pass through; unknown errors become sanitized `E_INTERNAL` and raw details stay off the protocol.

- [ ] **Step 3: Register the required method surface**

```text
system.hello
session.start, session.show, session.list, session.end
workspace.list, workspace.show, workspace.update, workspace.overview, workspace.account.list, workspace.account.upsert
project.list, project.show, project.update, project.status, project.overview, project.iteration.list, project.iteration.create
feedback.list, feedback.add, feedback.resolve
document.create, document.list, document.show, document.revisions, document.search, document.revise, document.bind
media.list, media.show, media.revisions, media.review
run.list, run.show, run.objects
composition.list, composition.show, composition.revise, composition.build, composition.select
unit.list, unit.show, unit.revise, unit.select, unit.preview
publication.list, publication.publish, publication.refresh
metric.list
activity.list, activity.subscribe, activity.unsubscribe
locator.resolve
agent.providers, agent.credential.status, agent.credential.set, agent.credential.clear
agent.turn.start, agent.turn.status, agent.turn.stop
migration.secret.import, migration.desktop.import
```

Every method receives an explicit Session or Workspace/Project context; the connection has no mutable active context. `system.hello` is an ordinary request/response, not an unsolicited handshake, and returns protocol/core/schema versions, immutable `storeId`, opaque `rootId`, exact capabilities, latest activity sequence, and migration/startup state. `media.review` maps Shortlist to `candidate`, Approved to `approved`, Reject to `rejected`, and Needs Work to open feedback while retaining favorite/rating/tags/notes as evaluation metadata.

- [ ] **Step 4: Secure locators and agent execution**

`locator.resolve` accepts only `{ target: { type: "object" | "run-object", id }, purpose: "preview" | "read-text" | "finder" | "open" | "drag", context }`, fetches the row internally, checks read visibility separately from authorship scope, and then returns `{ absolutePath, mime, bytes }` to trusted Electron main. Project reads may see Workspace-shared Objects. Reject caller paths/keys/buckets, cross-scope IDs, missing/non-regular bytes, symlink escapes, and unsafe unpromoted RunObject paths. Desktop renderer never supplies or persists a path and never receives this raw result directly.

Agent credentials are write-only bridge inputs. `cli/lib/agent/types.ts` defines normalized `started|text-delta|tool-start|tool-end|completed|failed|cancelled` events. `agent.turn.start` requires an existing active Agent Session, creates one Run per turn, launches the Claude/Codex CLI adapter without a shell or uses the explicit provider credential resolver, and emits events carrying Session/turn/chat/scope identity. Stopping a turn does not end the Session.

Maintain a registry per turn/operation with AbortController, Run ID, Session ID, and child processes registered before awaiting them. Stop process groups with TERM then bounded KILL escalation and terminalize Run/attempt exactly once. On stdin EOF, EPIPE, or bridge exit, cancel all owned children. Never inject secrets into the bridge's own long-lived environment.

- [ ] **Step 5: Test subscriptions, conflicts, locators, and secret redaction**

Spawn `bun run cli/index.ts bridge --stdio --root <fixture>`, send multiple JSONL requests, mutate a Document through a second DB connection, and assert activity resumes after the requested sequence without gaps. Subscription acknowledgment is flushed before events begin; each cursor advances only after the event drains; an async polling loop drains ordered pages without overlapping intervals and supports explicit unsubscribe. Test causal mutation/read ordering, concurrent out-of-order reads, stdout backpressure, cross-root/shared locator rules, stale revision conflict, child/grandchild cancellation, EOF/EPIPE cleanup, and absence of fixture secrets across stdout/stderr/activity.

`tests/unit/bridge-boundaries.test.ts` prohibits bridge imports from `cli/commands/**`, Commander, `output.ts`, and `raiseError()`. Handlers call stores/controllers directly.

Run: `bun test tests/unit/bridge-protocol.test.ts tests/unit/bridge-boundaries.test.ts tests/unit/agent-session.test.ts tests/integration/cli-bridge.test.ts`

- [ ] **Step 6: Commit the bridge**

```bash
git add cli/lib/bridge cli/lib/agent cli/commands/bridge.ts cli/index.ts tests/unit/bridge-protocol.test.ts tests/unit/agent-session.test.ts tests/integration/cli-bridge.test.ts
git commit -m "feat(cli): add versioned desktop bridge"
```

### Task 9: Prohibit normal legacy state access and finish CLI parity

**Files:**
- Create: `scripts/lint-no-legacy-state.ts`
- Modify: `package.json`
- Modify: `.github/workflows/test.yml`
- Modify: every remaining normal-state caller reported by the lint
- Delete after migration cutover: `cli/lib/registry.ts`
- Test: `tests/unit/no-legacy-state-writers.test.ts`

**Interfaces:**
- Consumes: all normal command/library source outside `cli/lib/migration/**`
- Produces: `bun run lint:no-legacy-state` and zero non-migration legacy readers/writers

- [ ] **Step 1: Write the failing static gate**

Reject references outside migration/tests to these authoritative filenames and APIs:

```ts
const bannedNames = [
  "registry.json", "workspace.json", "asset-manifest.json", "generations.jsonl",
  "user-prompts.jsonl", "user-assets.jsonl", "unit.json", "publish-ledger.jsonl",
];
```

Also reject imports of `cli/lib/registry.ts` and direct writes below `projectDir()`, `sharedDir()`, or `workspaceUnitsDir()` unless the path is created by `objects.ts`, Run temp/cache code, export code, or migration.

- [ ] **Step 2: Convert every reported caller by category**

Run the lint repeatedly and route each finding to its owner: settings/resources to `operations.ts`, text to Documents, media to Objects/Artifacts, execution logs to Runs/activity, deliverables to Units, publish history to Publications, and reproducible acceleration files to cache. Do not suppress a finding merely to make the gate pass.

- [ ] **Step 3: Preserve export and debug paths explicitly**

Commands may materialize user-requested exports under `.ralphy/exports/` and inspect resolved Object/RunObject paths. These are derived views and never read back as authoritative state. Add positive tests proving export deletion cannot alter domain rows.

- [ ] **Step 4: Wire and run the complete gate**

```bash
bun run lint:no-legacy-state
bun run lint
bun test tests/unit/
bun test tests/integration/
bun run cli:surface:check
```

Expected: all commands exit 0.

- [ ] **Step 5: Commit CLI cutover**

```bash
git commit -m "refactor(cli): remove filesystem state access"
```

### Task 10: Validate the standalone core contract

**Files:**
- Modify: `README.md`
- Modify: `docs/cli-surface.generated.md` through its generator
- Create: `docs/domain-store.md`
- Test: `tests/integration/cli-domain-journey.test.ts`

**Interfaces:**
- Consumes: all Task 1-9 commands and bridge methods
- Produces: documented JSON/bridge contract and a complete fixture production journey

- [ ] **Step 1: Add the full journey test**

Create Workspace -> Project -> Iteration -> brief revision -> input Artifacts -> Composition revision -> failed Build -> fixed revision -> successful multi-output Build -> multi-platform Unit -> failed Publication -> successful Publication -> Metric snapshots. Read the result both through CLI JSON and bridge methods and assert stable IDs match.

- [ ] **Step 2: Document agent and Desktop usage**

Document explicit scope, immutable revisions, Build terminology, Unit items/presentations, activity cursors, bridge startup/shutdown, locator security, and write-only credential methods. Do not document legacy filenames as supported state.

- [ ] **Step 3: Run standalone core verification**

```bash
bun run lint
bun test tests/integration/
bun run build:bin:current
gitleaks protect --staged --redact
```

Expected: all commands exit 0 with no sibling repository on module resolution paths.

- [ ] **Step 4: Commit the public contract**

```bash
git add README.md docs/domain-store.md docs/cli-surface.generated.md tests/integration/cli-domain-journey.test.ts
git commit -m "docs: publish the domain store contract"
```
