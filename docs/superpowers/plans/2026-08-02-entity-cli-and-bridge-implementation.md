# Entity CLI and Desktop Bridge Implementation Plan

> **2026-08-04 scope amendment:** `ralphy-farm` and every Farm-specific
> namespace, identity, authentication, migration-map, readiness, release, and
> coordinated-cutover requirement are removed from this program. Any stale
> Farm wording below is superseded and must not be implemented. The bridge and
> replay contracts serve Core and Desktop only.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert every stateful Ralphy workflow to the domain store and expose the same versioned operations to chat agents and Desktop through a long-lived stdio bridge.

**Architecture:** CLI commands remain thin Commander adapters around the store functions from the core-domain plan. A data-root-bound `ralphy bridge --stdio --root <path-to-.ralphy>` process dispatches versioned JSONL requests to those same functions, streams the one store-wide monotonic activity feed, resolves scoped object IDs, and owns encrypted credentials plus any agent process that needs them.

**Tech Stack:** Bun, TypeScript, Commander, `bun:sqlite`, Node streams/crypto/child_process, macOS Keychain `security`, Zod, `bun:test`

## Global Constraints

- Complete the core-domain-store plan before this plan.
- Desktop and sibling repositories may invoke the installed CLI contract but may not import core source or open SQLite.
- `--root` is the canonical data directory that directly contains `ralphy.db`, `buckets/`, and `tmp/`; `--cwd` is only a discovery starting point for the nearest ancestor `.ralphy/ralphy.db`. Never treat repository cwd and data root as the same concept.
- Every command accepts either explicit Workspace/Project scope or one Agent Session ID as a discriminated union; no hidden Session or mutable active-Workspace pointer exists.
- Preserve existing public command names where their semantics remain valid; deprecated path-shaped commands become entity adapters, not parallel stores.
- Machine stdout contains JSON or JSONL only; diagnostics go to stderr.
- Bridge mutations use expected revision/head IDs and return `E_CONFLICT` instead of overwriting newer work.
- External optimistic names are consistent: row mutations use `expectedRowVersion`; Unit/Composition lineage uses `expectedLatestRevisionId`; manual pointers use `expectedSelectedRevisionId`; other heads use `expectedRevisionId`; operational transitions use `expectedState` plus a fence where provider work may be in flight.
- Never return stored secret values through CLI JSON, bridge responses, logs, activity payloads, or errors.
- Long provider, render, publish, and agent operations use Runs and never keep a database transaction open.
- Generation, transform, transcription, repair, Build, Unit-revision, and provider-backed Publication controllers are bridge-safe functions with no Commander dependency. Their consumer form starts or recovers one externally identified Run before doing work; optimistic local draft cancellation is the explicit non-operation exception.
- All ordinary CLI/bridge DTOs are explicit ID-based safe projections. They never expose Activity payload, RunObject path/metadata/error, Object bucket/key/hash/original-name/metadata, or Document body. Only bounded scoped `document.content` may return body text and only trusted-main `locator.resolve` may return a local path; structured agent tool events omit raw argv/args/output while text deltas remain opaque user-visible content.
- New compatibility readers live only under `cli/lib/migration/`; ordinary commands gain no legacy JSON/JSONL/Markdown fallback. Existing read-only registry/current-Workspace adapters may remain only for the measured staged callers removed by Task 9.
- Keep read-only legacy registry/current-Workspace adapters during staged command conversion, then require zero normal callers and delete them in Task 9. No compatibility writer survives Task 2.
- Portable Workspace packages cross installations only through `workspace.export` and `workspace.import`; import persists a complete old-to-new mapping and returns it through bounded `entityMapPage` cursors, while secrets, operational Runs, Publications, Metrics, and consumer-owned state stay out of the package.
- Keep files and commit messages English-only and regenerate `docs/cli-surface.generated.md` after command changes.

## Cross-Plan Release Checkpoint

Execution order is fixed. Complete the core domain plan, this plan, and Full
Library Migration Tasks 1-8 in the core repository. Publish that exact commit
as the stable `@alecs5am/ralphy` package/CLI, record its version, integrity, and
commit, then run the core-only rehearsal and live cutover before Desktop
integration and release validation.

---

### Task 1: Add stable domain errors and the encrypted core secret store

> **Execution amendment (2026-08-03):** Deliver this task as three reviewed
> commits: **1A** stable domain errors (complete at `96c26980`), **1B** an
> append-only schema-v2 migration for Social Account credential metadata, and
> **1C** the root-bound encrypted secret primitive plus Run cleanup. Do not edit
> migration v1. `dataRoot` means the directory that directly contains
> `ralphy.db`, `buckets/`, and `tmp/`; secret primitives receive it explicitly
> and never discover it from cwd or a checkout. `KeyProvider` has separate
> `lookupKey(storeId)` and `createKey(storeId)` operations so existing
> ciphertext can never get a replacement key. Secret mutations serialize both
> in-process and across processes with a `BEGIN IMMEDIATE` lane in the same
> data-root database, re-reading the envelope only after the lock is held.
>
> Execute the existing Task 2 context work as **2A** before scoped auth. Move
> provider/account resolution, credential DTOs, `provider auth`, and child-env
> wiring to **2B** after context exists. That slice must also convert direct
> credential readers in `cli/index.ts`, `capabilities.ts`, `transcribe.ts`, and
> `research.ts`, plus worker/daemon/article child boundaries and their invariant
> tests. `provider auth login` is unsupported unless a provider supplies a real
> owned login callback; it never emulates login by accepting an API key.

**Files:**
- Modify: `cli/lib/errors/catalog.ts`
- Create: `cli/lib/errors/domain.ts`
- Modify: `tests/unit/errors-catalog.test.ts`
- Modify: `cli/lib/store/schema.ts`
- Modify: `cli/lib/store/types.ts`
- Modify: `cli/lib/store/scopes.ts`
- Modify: `cli/lib/store/overviews.ts`
- Create: `cli/lib/store/secrets.ts`
- Modify: `cli/commands/provider.ts`
- Modify: `cli/commands/setup.ts`
- Modify: `cli/commands/init.ts`
- Modify: `cli/commands/voice.ts`
- Modify: `cli/commands/postiz.ts`
- Modify: `cli/lib/providers/apify.ts`
- Modify: `cli/lib/providers/config.ts`
- Modify: `cli/lib/providers/devto.ts`
- Modify: `cli/lib/providers/elevenlabs.ts`
- Modify: `cli/lib/providers/fal.ts`
- Modify: `cli/lib/providers/firecrawl.ts`
- Modify: `cli/lib/providers/hashnode.ts`
- Modify: `cli/lib/providers/llm.ts`
- Modify: `cli/lib/providers/openai-compatible.ts`
- Modify: `cli/lib/providers/openrouter.ts`
- Modify: `cli/lib/providers/postiz.ts`
- Modify: `cli/lib/providers/registry.ts`
- Modify: `cli/lib/providers/shared.ts`
- Modify: `cli/lib/providers/youtube-analytics.ts`
- Test: `tests/unit/secret-store.test.ts`
- Modify: `tests/integration/domain-scopes.test.ts`
- Modify: `tests/integration/domain-query-surfaces.test.ts`

**Interfaces:**
- Consumes: immutable `getStoreIdentity()`, `.ralphy/`, Node AES-256-GCM, and `/usr/bin/security` on macOS
- Produces: throwable `DomainError`, `setSecret(ref, value)`, internal-only `readSecret(ref)`, `deleteSecret(ref)`, `hasSecret(ref)`, encrypted file-secret primitives used by migration, an explicit provider credential resolver, `provider auth set|clear|status|login`, and errors `E_CONFLICT`, `E_OBJECT_MISSING`, `E_MIGRATION_INCOMPLETE`, `E_PROTOCOL_UNSUPPORTED`, `E_PROTOCOL_INVALID`, `E_SECRET_STORE`

- [x] **Step 1: Extend the append-only error catalog test first**

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

- [x] **Step 2: Add actionable catalog entries and a throwable domain boundary**

Use conflict hints that tell the agent to reload the exact entity, missing-object hints that name `ralphy doctor --storage`, migration hints that name `ralphy migrate domain verify`, protocol hints that require upgrading Desktop/core, and secret hints that name `ralphy provider auth status`.

`DomainError` carries only a stable code, safe message, and sanitized JSON details. Store/controllers/providers throw; only Commander adapters format and exit. Bridge code never calls or imports `raiseError()` and maps unknown failures to `E_INTERNAL` without stack traces, SQLite text, provider payloads, or secret-bearing exceptions.

- [ ] **Step 3: Write the failing encrypted-store test**

Inject a `KeyProvider` in tests so no real Keychain is touched:

```ts
const store = createSecretStore({
  dataRoot: tmp.dir,
  keyProvider: {
    lookupKey: async () => fixedKey,
    createKey: async () => fixedKey,
  },
});
store.set("provider/openrouter", "secret-value");
expect(store.has("provider/openrouter")).toBe(true);
expect(store.read("provider/openrouter")).toBe("secret-value");
expect(await Bun.file(`${tmp.dir}/secrets.enc`).text()).not.toContain("secret-value");
store.delete("provider/openrouter");
expect(store.has("provider/openrouter")).toBe(false);
```

- [ ] **Step 4: Implement one encrypted file with a Keychain-backed key**

Store `{ version: 1, entries: Record<string, string>, files: Record<string, string> }` as one AES-256-GCM envelope `{ version, iv, tag, ciphertext }` in `<dataRoot>/secrets.enc`; file values are base64 inside the encrypted plaintext only. Write through a mode-0600 sibling temp file, file/directory fsync, and atomic rename while all secret mutations are serialized. Expose internal `setSecretFile` and `materializeSecretFile(ref, runId)`: materialization writes only below a mode-0700 owned `<dataRoot>/tmp/<run-id>/secrets/` directory at mode 0600, returns an internal locator, and is removed on Run terminalization. Mark the directory with its Run/store IDs; startup removes only marked orphan materializations for terminal/missing Runs before accepting work and never scans or deletes ordinary Run evidence. Materialized secrets never become Objects or protocol DTOs. On macOS, obtain a random 32-byte key from a generic-password item whose service is `ralphy-domain-store-key:<store_id>` and account is `ralphy`; the identity comes from the database opened for that explicit data root, never from a mutable root path. If ciphertext exists but its Keychain item is absent, return `E_SECRET_STORE` and never generate a replacement key over unreadable data.

Invoke `/usr/bin/security` without a shell. For creation, put `-w` last and write the key only to child stdin; never put it in argv or env. Capture lookup output internally and never forward it. Validate typed secret refs and keep only refs in SQLite/activity.

`readSecret` and file-secret reads are not exported from the public store barrel or any value-returning bridge method. Enumerate every provider/connector from the registry and give each an explicit credential descriptor; a registry test fails if one is omitted. Resolution precedence is scoped encrypted ref, then an allowlisted credential captured from the bridge startup environment, then supported provider subscription/login, then missing. `social_accounts` gains nullable `credential_ref`, required `relink_required DEFAULT 0`, plus optimistic `row_version`; only the ref is persisted, while public DTOs expose configured/source/relink-required status and never the ref or value. A portable import creates account descriptors with `credential_ref = NULL` and `relink_required = 1`; successful scoped auth setup clears that flag with the expected row version. A Workspace/account ref cannot satisfy another scope.

Preserve core Task 7's immutable account identity: `workspace_id`, canonical
`platform`, and `external_id` can never be updated, rekeyed, deleted, or
REPLACEd. Account upsert may change only display/public config and credential
status for that exact identity with `expectedRowVersion`; a different identity
inserts a new row.
Now that the real columns exist, extend account list/detail/overview DTOs with
exactly `credentialConfigured: boolean`, `credentialSource: "encrypted" |
"environment" | "subscription" | "missing"`, `relinkRequired`, and
`rowVersion`; before this task those fields do not exist. Never expose
`credential_ref` or infer status from pre-column config.

`provider auth set <provider> --stdin` and Postiz import read values only from stdin/bridge memory, never argv or inherited env; `clear` deletes, `status` reports the selected source without a value, and `login` invokes only a provider-owned subscription flow. Secret descriptors may not target or override `HOME`, `PATH`, shell startup variables, or loader variables. Provider/agent code receives credentials through the explicit internal resolver and constructs child environments from a fixed safe base plus only the requested credential. The long-lived bridge skips project-env loading, privately captures allowlisted inherited credentials once at startup, removes known credential keys from its own `process.env`, and never spreads the full environment to a child. All resolver, activity, error, stdout, stderr, and child-capture tests redact credential values.

Test corrupted ciphertext, missing Keychain item, concurrent text/file writes, mode-0600 Run materialization plus normal/crash-recovery cleanup, root rename with unchanged store ID, provider-enumeration coverage, precedence, account row-version conflicts, forbidden env-name mappings, captured child argv/env/stdin, and zero secret occurrence in SQLite, Objects, output, errors, or activity.

- [ ] **Step 5: Verify and commit security primitives**

```bash
git add cli/lib/errors/catalog.ts cli/lib/errors/domain.ts tests/unit/errors-catalog.test.ts cli/lib/store/schema.ts cli/lib/store/types.ts cli/lib/store/scopes.ts cli/lib/store/overviews.ts cli/lib/store/secrets.ts cli/commands/provider.ts cli/commands/setup.ts cli/commands/init.ts cli/commands/voice.ts cli/commands/postiz.ts cli/lib/providers/apify.ts cli/lib/providers/config.ts cli/lib/providers/devto.ts cli/lib/providers/elevenlabs.ts cli/lib/providers/fal.ts cli/lib/providers/firecrawl.ts cli/lib/providers/hashnode.ts cli/lib/providers/llm.ts cli/lib/providers/openai-compatible.ts cli/lib/providers/openrouter.ts cli/lib/providers/postiz.ts cli/lib/providers/registry.ts cli/lib/providers/shared.ts cli/lib/providers/youtube-analytics.ts tests/unit/secret-store.test.ts tests/integration/domain-scopes.test.ts tests/integration/domain-query-surfaces.test.ts
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
- Produces: `resolveDataRoot(input): DataRootIdentity`, `resolveCommandContext(input): CommandContext`, and `session start|show|list|end`

```ts
type DataRootIdentity = {
  dataRoot: string;
  storeId: string;
  rootId: string;
};
type CommandContext =
  | { kind: "session"; sessionId: string; workspaceId: string; projectId?: string }
  | { kind: "scope"; workspaceId: string; projectId?: string };
```

- [ ] **Step 1: Write failing parallel-context tests**

Spawn two CLI commands against one fixture root, each with a different `--workspace`, and assert neither command changes the other's result or writes `activeWorkspace`:

```ts
const a = runCli(["project", "list", "--workspace", "ws_a", "--json"], { cwd: tmp.dir });
const b = runCli(["project", "list", "--workspace", "ws_b", "--json"], { cwd: tmp.dir });
expect(JSON.parse(a.stdout).projects.every((p: { workspaceId: string }) => p.workspaceId === "ws_a")).toBe(true);
expect(JSON.parse(b.stdout).projects.every((p: { workspaceId: string }) => p.workspaceId === "ws_b")).toBe(true);
expect(existsSync(`${tmp.dir}/.ralphy/config.json`)).toBe(false);
```

- [ ] **Step 2: Separate data-root discovery from domain context**

`--root` accepts only a data directory containing `ralphy.db`; canonicalize its
realpath and reject a repository root that merely contains `.ralphy`. Without
`--root`, start at `--cwd` (or process cwd) and select the nearest ancestor
`.ralphy/ralphy.db`. A legacy `.ralphy` without `ralphy.db` raises
`E_MIGRATION_INCOMPLETE`; no normal command silently creates or reads legacy
state. `storeId` comes from SQLite. `rootId` is an opaque SHA-256 digest of the
canonical data-root path plus filesystem device/inode, so moving the directory
changes `rootId` but not `storeId`. Tests cover nested cwd, ambiguous ancestors,
root moves, a symlink alias resolving to the same canonical root/rootId,
legacy-only roots, and explicit-root precedence.

- [ ] **Step 3: Implement deterministic explicit context**

Resolve one coherent context from an existing active Session or explicit Workspace/Project IDs. A Session fixes immutable scope; any conflicting `--workspace`, `--project`, positional Project, or cwd-derived Project raises `E_INPUT_INVALID` rather than winning by precedence. Without a Session, an explicit Project derives its Workspace, an explicit Workspace may scope Workspace operations, cwd may identify a Project through bucket ownership, and the only Workspace may be inferred only when exactly one exists. More than one possible Workspace without explicit scope raises `E_INPUT_INVALID`; never pick the last-used Workspace.

Add root options `--workspace <id>`, `--project <id>`, and `--session <id>` in `cli/index.ts`. Keep `--cwd` for root detection.

- [ ] **Step 4: Remove mutable active-Workspace writes without breaking staged conversion**

Delete every active-Workspace write immediately. Keep the existing registry/current-Workspace functions as read-only compatibility adapters only while later command tasks still have measured callers; mark them internal and do not add callers. Task 9 proves zero callers before deletion. Expose `session start|show|list|end` through the landed immutable Session store. `workspace use` never mutates a Session or active pointer; during compatibility it returns a deprecation error with explicit `--workspace`/`session start` guidance. A scope change always creates a new Session. Ending a turn never ends its Session; `session end` conflicts while any turn or Run owned by that Session is pending/running.

- [ ] **Step 5: Verify explicit context**

Run: `bun test tests/integration/cli-explicit-context.test.ts tests/integration/cli-workspace-108.test.ts tests/unit/artifact-paths.test.ts`

Expected: PASS after updating old tests to assert IDs rather than active-pointer paths, including data-root/cwd separation, legacy-only failure, ended/foreign/sibling Session rejection, active-Run close conflict, and explicit-flag/Session mismatch.

- [ ] **Step 6: Commit context resolution**

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

Reimplement Workspace/Project CRUD through `scopes.ts`. Project status reads
`project_stages`, exact entity bindings, current Iteration, and open feedback;
it no longer infers completion from `scenario.json`, `asset-manifest.json`, or
`render/final.mp4`. Workspace account commands store only non-secret platform/
provider/external ID/handle metadata and secret refs. Remove this task's
`cli/lib/registry.ts` callers, add none, and leave any still-measured read-only
compatibility callers for the explicit Task 9 zero-caller gate.

`project transfer` conflicts while any active Agent Session is exactly scoped to
the Project or any Project Run is pending/running. It then acquires the
maintenance lock, creates `storage_transfers` plus one journal entry per Object,
moves the exact ID-based Project bucket to the destination Workspace prefix,
verifies every byte/hash, and only then changes `projects.workspace_id` plus
affected Object buckets in one transaction. `project transfer --resume
<transfer-id>` continues from the journal; a failed transfer never leaves DB
rows pointing at the new prefix before verification.

The core media controller returns its exact path-free Artifact, RunObject, and
Object card union without Commander reshaping. `storageClass` remains exactly
`durable | working | diagnostic`, while RunObject retention/location are
separate internal facts. Its Artifact-only atomic review operation owns
stale-selection checks, Artifact state revision, evaluation/feedback,
selection, and activity.

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

Every producer owns only `<data-root>/tmp/<run-id>/`; validate the Run ID and
contained regular path before recording or promoting a RunObject. `recordRunObject`
may keep its contained locator in SQLite, but its activity payload and returned
ordinary DTO contain only RunObject/Run IDs, purpose, state, retention, byte/hash
facts, and optional promoted Object ID—never the locator or original customer
filename.

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
- Modify: `cli/commands/publish.ts`
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
- Produces: `unit show|list|revise|select|preview`, `publication list|publish|lookup|cancel|reconcile|refresh`, and query-backed analytics

- [ ] **Step 1: Write failing carousel and multi-platform tests**

Create an eight-image Unit revision without copied media, then one video Unit with TikTok/Instagram/YouTube presentations. Assert `unit show` returns stable Artifact revision IDs and `unit preview --platform instagram` returns the Instagram-shaped presentation while the Unit ID remains unchanged.

- [ ] **Step 2: Replace Unit directories with DB revisions**

`unit create`/`revise` resolve exact Artifact revisions and insert ordered items.
Revision requires `expectedLatestRevisionId`; selection is independent and
requires `expectedSelectedRevisionId`. `unit add` creates a new Unit revision
rather than mutating a manifest. `unit caption` creates/revises platform
presentations. Zero presentation items means inherit all base items; a nonempty
list is the complete ordered unique subset and keeps override config separate.
Article body Markdown is a Document revision item, not a mutable
`unit.json` sibling. Text-only post/thread/article Units therefore remain valid
without media; 40-item packs and repeated Artifact/Document targets at distinct
positions retain exact order. Caption changes append immutable caption history,
including canonical `humanized` and `auto-draft-archived` states, and update the
effective caption only through a new sealed Unit revision. Remove media copying
from `cli/lib/unit.ts` after migration fixtures cover its reader.

- [ ] **Step 3: Persist publication attempts and metrics**

Keep target-specific caption/settings mapping and Postiz HTTP code, but store
every attempt in `publications`; replace `publish-ledger.jsonl` idempotency
checks with the core key/tuple contract. Each target creates one Publication
with its own dedicated pending submission Run. `publication publish` takes the
exclusive fenced claim, which starts that Run's single provider RunAttempt,
calls Postiz once outside SQLite, and finishes through the same fence so
Publication state, provider IDs/timestamps, RunAttempt, linked Run/result, and
activity commit atomically. A crash/timeout after dispatch terminalizes the
original RunAttempt/Run, invalidates the submission fence, and becomes
`reconciliation_required` or `unknown`; replay returns that attempt and never
POSTs again. Add `publication reconcile` for provider lookup/manual resolution;
it uses a distinct reconciliation Run and fresh fence and cannot invoke
submission. No uncertain path leaves a RunAttempt running.
Add `publication lookup` only for `scheduled | submitted`: it claims a fresh
status-lookup fence and distinct Run/RunAttempt, calls only the provider status
endpoint, and finishes that exact Run/result separately from the submission.
Add local `publication cancel` for `draft` with no provider attempt and a
separately fenced cancellation Run/RunAttempt for `scheduled | submitted`.
Provider-confirmed cancellation becomes `cancelled`; an uncertain response
closes the cancellation attempt and becomes `reconciliation_required |
unknown`. Lookup, cancellation, and reconciliation can never call the submit
endpoint or reuse the submission Run. Draft cancel is an ordinary optimistic
local mutation requiring `expectedState: "draft"`; it has no external tuple,
idempotency key, cancellation Run, or consumer replay promise. After a lost
response the caller reads the Publication instead of retrying via
`operation.find`.

For every provider follow-up, the Run/RunAttempt outcome describes execution of
the lookup/cancel/reconciliation operation, not the Publication outcome. A
successful lookup that proves the Publication failed finishes the lookup Run as
`succeeded`; a timeout/transport/provider-operation error finishes that
follow-up Run as `failed` even if Publication state is retained or moved to
`reconciliation_required | unknown`.
Bind every attempt to the exact Presentation, effective caption revision, and
effective platform options. Preserve the `postiz`, `github-pages`, `devto`,
`hashnode`, and `manual` rail rules, same-Workspace `revisedFrom` lineage, and
nullable account only for validated pre-account failures or accountless rails.
A Medium export creates a RunObject/approval artifact, never a Publication or
invented URL; an idempotent skip is Activity, not another attempt.
Refresh appends source/as-of/window Metric snapshots, records their IDs as Run
results, and is idempotently replayable.

- [ ] **Step 4: Query analytics instead of scanning Units**

Rework ROI/postmortem aggregation over Runs, Publications, Metric snapshots,
Unit revisions, and provenance IDs. Apply requested as-of/window/source filters
first, then choose one snapshot per Publication by the exact total order
`(as_of DESC, created_at DESC, id DESC)`. The default candidate set spans all
sources; an explicit source restricts candidates before applying the same
order. They never add successive cumulative snapshots or count two providers
for one Publication. Preserve
nullable CTR, retention curve, average-view-duration, note, and unknown raw
fields, and keep `NULL` distinct from zero. Preserve existing output DTOs where
possible so Farm callers do not break.

- [ ] **Step 5: Verify and commit delivery conversion**

Run: `bun test tests/integration/cli-unit-domain.test.ts tests/unit/unit-*.test.ts tests/unit/publish-*.test.ts tests/unit/analytics.test.ts`

Expected: PASS including independent latest/selected conflicts, inherit-all vs
explicit presentation subsets, competing publish claims/stale fences,
uncertain-result reconciliation without a second POST, provider/timestamp
locks, rail/account/lineage validation, effective presentation binding, Medium
export without a Publication, atomic Publication/RunAttempt/Run/result/activity
rollback, fenced status lookup from both eligible states, local and provider-
backed cancellation: local draft cancel has no cancellation Run, while provider
cancel has a distinct RunAttempt/Run/result. Prove that none of
those follow-up flows resubmits, independent operation/Publication outcomes,
draft-cancel external-context rejection and read-after-lost-response behavior,
source/as-of/window metrics, default newest-
per-Publication totals, explicit source-filter totals, equal-`as_of` ordering by
`created_at` then ID, and refresh replay returning the original snapshot IDs.

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
- Produces: schema migration 3, typed SQL stores for existing non-media stateful verbs, and bounded `listCampaigns`, `getCampaign`, `updateCampaign`, `listCalendarEntries`, and `updateCalendarEntry`

- [ ] **Step 1: Write a failing round-trip matrix test**

The test creates and reads one row through each existing feature surface: non-secret setting, brand profile, persona, Workspace template metadata, memory revision, campaign/cell, calendar entry, evaluator result, and research Run/Document binding. It asserts no `.json`, `.jsonl`, or `.md` control file appears below `.ralphy`.

- [ ] **Step 2: Add schema migration 3**

Create these exact tables with Workspace foreign keys and activity coverage: `settings`, `brands`, `personas`, `workspace_templates`, `memory_entries`, `memory_revisions`, `campaigns`, `campaign_cells`, and `calendar_entries`. `campaigns` and `calendar_entries` carry optimistic `row_version`; their stable IDs never change. Reuse `evaluations`, Documents, Runs, Artifacts, and Publications for evaluator/research/template bodies instead of duplicating them.

Common searchable fields are columns; each table may carry one validated `metadata_json` column for rare feature-specific fields. Secret values are forbidden in `settings`.

- [ ] **Step 3: Convert store modules while preserving their public result shapes**

Replace file reads/writes in the listed modules with explicit SQL. Memory edits create `memory_revisions`; evaluator configurations are typed JSON Document revisions; research results are Documents/Artifacts bound to their Runs; campaign and calendar mutations append activity; project lifecycle reads `project_stages` and exact bindings only.

Campaign list is creation-cursor paged and filters one exact Workspace plus
optional state; show accepts only a campaign ID visible in that scope. Calendar
list is creation-cursor paged and filters one exact Workspace plus optional
inclusive UTC instant range. `updateCampaign(id, patch,
expectedRowVersion)` and `updateCalendarEntry(id, patch,
expectedRowVersion)` validate every referenced Unit revision, presentation,
social account, and campaign in the same Workspace, use one conditional update,
and append activity. They return safe DTOs without metadata blobs, credentials,
paths, provider payloads, or publication errors. These five functions are the
only source for the later `campaign.list|show|update` and
`calendar.list|update` bridge methods.

- [ ] **Step 4: Verify all structured surfaces**

Run: `bun test tests/integration/domain-operations.test.ts tests/unit/campaign.test.ts tests/unit/calendar.test.ts tests/unit/workspace-evaluators.test.ts tests/unit/memory-*.test.ts`

Expected: PASS and schema version 3, including cursor/limit boundaries,
Workspace isolation, stale row-version conflicts, and cross-Workspace reference
rejection for campaign and calendar mutations.

- [ ] **Step 5: Commit operations conversion**

```bash
git commit -m "refactor(core): move structured state into sqlite"
```

### Task 7A: Publish bridge-safe operation controllers and replay contracts

**Files:**
- Create: `cli/lib/controllers/operations.ts`
- Modify: `cli/commands/generate.ts`
- Modify: `cli/lib/composition-build.ts`
- Modify: `cli/commands/unit.ts`
- Modify: `cli/lib/publish/publish.ts`
- Modify: `cli/lib/analytics/pull.ts`
- Modify: `cli/commands/analytics.ts`
- Modify: `cli/lib/repair.ts`
- Modify: `cli/lib/transcribe.ts`
- Modify: `cli/commands/queue.ts`
- Test: `tests/integration/cli-operation-controllers.test.ts`
- Modify: `tests/integration/jobs-db.test.ts`

**Interfaces:**
- Consumes: authenticated consumer Sessions, external-operation Run APIs, the shared jobs queue, converted generation/Build/Unit/Publication code, and typed campaign/calendar stores
- Produces: `startGenerationOperation`, `startTransformOperation`, `startTranscriptionOperation`, `startRepairOperation`, and replay-safe consumer forms of Composition Build, Unit revision, Publication submission/status lookup/provider-backed cancellation/reconciliation, and Metric refresh; plus the short `recoverExpiredPublicationFollowUp` controller. Draft cancellation and expired-follow-up recovery remain local optimistic/fenced mutations outside the new external-operation set

```ts
type ExternalOperation = {
  runId: string;
  nodeId: string;
  attempt: number;
  operation: string;
  idempotencyKey: string;
};

type ConsumerOperationContext = {
  sessionId: string;
  external: ExternalOperation;
};

type OperationAccepted = {
  runId: string;
  state: "pending" | "running" | "succeeded" | "failed" | "cancelled";
  results: {
    items: Array<{ id: string; runId: string; position: number; entityType: string; entityId: string; createdAt: number }>;
    nextCursor: string | null;
  };
  replayed: boolean;
};
```

- [ ] **Step 1: Write one controller-level crash/replay matrix**

For generation, transform, transcription, repair, Composition Build, Unit
revision, Publication, and Metric refresh, inject a crash after the core transaction commits
but before a response is returned. Retry through a newly authenticated
reconnect Session for the same consumer principal, tuple, key, and canonical
request and require the original Run plus the same result IDs. Replay is
authorized by the Run's `consumer_principal_id`, not equality with its
historical `agent_session_id`. Publication replay from an uncertain dispatch must return
`reconciliation_required`/`unknown` without another POST, and Metric refresh
must return the original source/as-of/window snapshot IDs. Reusing the key with
changed scope/input/config or the tuple with another key conflicts before provider/engine work. An ordinary
Agent Session and a differently authenticated consumer principal both reject;
a consumer-owned Session also rejects when it tries to start an ordinary Run
without external provenance. Assert every Publication target has a distinct submission Run, every
claim has exactly one RunAttempt, an expired submission fence cannot finish or
re-POST, reconciliation has a distinct Run/fresh fence, and injected failures
cannot leave a running attempt or partially commit Publication/Run/result/
Activity state. Status lookup from `scheduled` and `submitted` and provider
cancellation each use their own external Run/fresh fence/RunAttempt/result;
draft cancellation has no provider attempt or external replay identity, and
none may invoke submission. A successful follow-up operation that proves a
failed/cancelled Publication has a succeeded operation Run; timeout/transport/
provider-operation failure has a failed Run regardless of Publication state.
For Jobs linked to external generation, Build, Publication, and Metric-refresh
Runs, both single and mixed bulk generic queue retry reject with zero changes.
The deliberate consumer retry passes only with an incremented external attempt,
new tuple, and new idempotency key.
Exercise expired status/cancellation/reconciliation through the exact recovery
controller at `expiry - 1`, equality, and `expiry + 1`: only expired SQL rows
close; status retains known state; cancellation/reconciliation stay uncertain;
attempt/Run/result/activity and epoch change atomically with no token field.
Globally reject every Publication submission Run—including another
Publication's—as a follow-up Run. Also assert canonical Presentation-derived
platform, insert/HTTPS URL/timeline rules, immutable account/empty Unit
identity, and result-before-terminal ordering.

- [ ] **Step 2: Put the durable boundary before every long operation**

`generation`, `transform`, `transcription`, `repair`, Build, Publication, and Metric refresh
controllers canonicalize the validated semantic request and compute lowercase
SHA-256 `requestDigest`, excluding Session/tuple/key/transport fields. In one
`withImmediateTransaction` callback they first call
`startConsumerOperationRunInTransaction(db, { ..., requestDigest })`. A replay
returns the original result page and creates nothing; only a new Run inserts/
links its initial domain row and calls `insertJobInTransaction(db, { ...job,
run_id: run.id })`. They then return `OperationAccepted`. The store enforces that the six
external columns, `request_digest`, and `consumer_principal_id` are all present
together and immutable. Provider, ffmpeg, render, transcription,
and publish work happens only in the worker outside the transaction. Publication
submission uses that operation Run as its dedicated pending submission Run;
the claim atomically starts its sole provider RunAttempt. Stale workers cannot
finish it. An expired/uncertain dispatch is atomically closed and fence-
invalidated rather than re-enqueued or reclaimed for another POST. Publication
reconciliation creates a distinct external operation Run, claims a fresh
reconciliation fence, and only looks up/resolves the original outcome. A replay
queries the existing Run and pages its position-ordered results; it never
creates another domain row or enqueues again. Metric refresh
records immutable snapshot IDs as ordered results. Unit revision is a
short transaction: create/recover its external Run, write the sealed revision,
record the Unit-revision result, and finish the Run atomically. Fault injection
after each initial domain/Run/Job insert must leave all three committed or none.

Status lookup and provider cancellation follow the same controller boundary:
each creates/replays a distinct external operation Run, enqueues once, claims
its own fence, and records its own RunAttempt/result before terminal Run state.
The controller rejects any globally registered Publication submission Run as a
follow-up and passes one server-captured `now` to strict live/expired SQL predicates.
`recoverExpiredPublicationFollowUp` accepts expected Publication state, claim
kind/Run/epoch but no token/time override; it captures server time once,
performs the core atomic recovery, and never starts provider work or a new
external Run. Its `CommandContext` must see the Publication; an external
follow-up additionally requires a current consumer Session for the same Run
principal/scope, while an ordinary follow-up requires ordinary scoped
authority. Local draft cancellation
is one short atomic store/controller call with `expectedState: "draft"`, no
provider Job, no external Run/context, and no tuple/key replay. Generic queue retry
checks the linked Run before mutation and rejects every externally owned Job;
An external retry must re-enter the matching controller with a new tuple/key.

The controller input is validated JSON and stable IDs only. Generation accepts
the already-supported media kinds and exact Artifact identity/input revision
IDs; transform is limited to the existing `remove-bg | reframe | crunch`
operations; transcription uses the existing core transcription implementation;
repair consumes an exact failed Evaluation/feedback target and creates a new
revision rather than mutating it. No controller accepts a path, raw provider
credential, Commander object, or callback from a sibling repository.

- [ ] **Step 3: Make Commander and bridge share the controllers**

Commands build validated controller inputs and render their DTOs; they do not
own a second provider/render/publish path. `composition.build`, `unit.revise`,
and `publication.publish|lookup|reconcile|refresh` gain optional internal
`ConsumerOperationContext`. No publication command accepts a second platform;
it derives the canonical target from the Presentation and validates the core's
canonical insert/HTTPS URL/timeline contract before provider work.
`publication.cancel` is discriminated by expected
state: `{ expectedState: "draft", consumerOperationContext?: never }` invokes
only optimistic local cancel, while `{ expectedState: "scheduled" |
"submitted", consumerOperationContext?: ConsumerOperationContext }` invokes
provider cancellation with a normal Run for ordinary CLI or a replay-safe
external Run when the consumer context is supplied. Without consumer context,
other ordinary CLI behavior uses a normal Session/Run and cannot populate
external fields. Every successful operation output is recorded
in ordered `run_results` before terminal Run state. `OperationAccepted`
contains only the first `1..100` position-ordered result page; clients follow
its `nextCursor` through the Task 8 `run.results` method.
`publication.recover` is the non-provider controller form
`{ publicationId, expectedState, expectedClaimKind, expectedClaimRunId,
expectedClaimEpoch }`; it rejects any token/external tuple/time override and returns the
safe recovered Publication/Run state.
Commander exposes the same input as `publication recover <publication-id>
--expected-state <state> --claim-kind <status-lookup|cancellation|reconciliation>
--claim-run <run-id> --claim-epoch <positive-int>`; there is no token, lease,
time, retry, or external-provenance flag.

- [ ] **Step 4: Verify the exact replay-safe operation set**

Run:

```bash
bun test tests/integration/cli-operation-controllers.test.ts tests/integration/cli-generation-domain.test.ts tests/integration/cli-composition-build.test.ts tests/integration/cli-unit-domain.test.ts tests/integration/jobs-db.test.ts
```

Expected: PASS with no Commander imports below `cli/lib/controllers/`, one
provider/engine execution per idempotency identity, and stable replay through
both external tuple and key.

- [ ] **Step 5: Commit the controller boundary**

```bash
git add cli/lib/controllers/operations.ts cli/commands/generate.ts cli/lib/composition-build.ts cli/commands/unit.ts cli/commands/publish.ts cli/lib/publish/publish.ts cli/lib/analytics/pull.ts cli/commands/analytics.ts cli/lib/repair.ts cli/lib/transcribe.ts cli/commands/queue.ts tests/integration/cli-operation-controllers.test.ts tests/integration/jobs-db.test.ts
git commit -m "feat(core): add replayable operation controllers"
```

### Task 8: Implement the versioned stdio JSONL bridge

**Files:**
- Modify: `cli/lib/store/schema.ts`
- Modify: `cli/lib/store/types.ts`
- Create: `cli/lib/store/portable.ts`
- Create: `cli/lib/bridge/protocol.ts`
- Create: `cli/lib/bridge/methods.ts`
- Create: `cli/lib/bridge/server.ts`
- Create: `cli/lib/agent/types.ts`
- Create: `cli/lib/agent/store.ts`
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
- Consumes: all converted domain operations, strict `CommandContext`, global activity sequence, object resolver, secret store, and existing agent/provider execution code
- Produces: data-root-bound bridge envelopes, safe DTOs, durable Agent turns, and methods consumed by Desktop

- [ ] **Step 1: Define and test exact envelopes**

```ts
export type BridgeRequest = { v: 1; id: string; method: string; params?: unknown };
export type BridgeSuccess = { v: 1; id: string; ok: true; result: unknown };
export type BridgeFailure = { v: 1; id: string | null; ok: false; error: { code: string; message: string; details?: unknown } };
export type ActivityDto = {
  sequence: number;
  workspaceId: string | null;
  projectId: string | null;
  entityType: string;
  entityId: string;
  action: string;
  createdAt: number;
};
export type BridgeEvent =
  | { v: 1; event: "activity"; subscriptionId: string; sequence: number; data: ActivityDto }
  | { v: 1; event: "agent"; agentSessionId: string; turnId: string; sequence: number; data: unknown };
```

Protocol constants are `MAX_FRAME_BYTES = 1_048_576`,
`MAX_REQUEST_ID_BYTES = 128`, `MAX_IN_FLIGHT = 64`,
`MAX_SEEN_IDS = 65_536`, `MAX_OUTBOUND_BYTES = 8_388_608`, and
`MAX_AGENT_DELTA_BYTES = 65_536`; `system.hello` reports them. Test malformed
JSON, multibyte byte limits, unsupported versions, unknown methods, bounded
non-empty ASCII IDs, duplicate IDs both in-flight and after completion,
connection seen-ID capacity, one response per accepted request, and JSON-only
stdout.

- [ ] **Step 2: Implement bounded framing, causal dispatch, and one stdout writer**

Use a Buffer-based newline framer that counts bytes before a newline and rejects frames over 1 MiB before buffering the rest; do not use `node:readline`. An oversized frame emits one flushed `E_PROTOCOL_INVALID` failure with `id: null` and terminates the connection. Validate strict request schemas. Pause stdin while 64 accepted requests are in flight and resume below the bound. Keep a lifetime bounded `seenIds` set; never evict IDs for reuse, and require reconnect when the cap is exhausted. A duplicate live ID is ambiguous and therefore emits one flushed fatal `E_PROTOCOL_INVALID` with `id: null`, cancels connection-owned work, and closes. A completed-ID reuse receives an ordinary `E_PROTOCOL_INVALID` response and cannot execute again.

Give every method explicit `read`, `mutation`, or `operation-start` metadata. Serialize short mutations. A read received after a mutation waits for that earlier mutation; independent reads may run concurrently. Long operations return after durable Run/Build/Turn creation and continue outside the mutation lane. Route every response/event through one queued stdout writer, await `drain` after backpressure, and cap queued serialized bytes; overflow emits a final fatal protocol error when writable, cancels owned work, and closes rather than allocating without bound. Split normalized agent text deltas at the byte limit without cutting UTF-8. Prohibit `console.log` in the bridge subtree. Known `DomainError` codes pass through only after safe-detail schema validation; unknown, SQLite, filesystem, provider, and child errors become sanitized `E_INTERNAL` without stack, SQL, payload, argv, env, path, or secret text.

- [ ] **Step 3: Register the required method surface**

```text
system.hello
consumer.authenticate, consumer.session.start, consumer.session.end
session.start, session.show, session.list, session.end
workspace.list, workspace.show, workspace.update, workspace.overview, workspace.account.list, workspace.account.upsert
workspace.export, workspace.import
project.list, project.show, project.update, project.status, project.overview, project.iteration.list, project.iteration.create
feedback.list, feedback.add, feedback.resolve
document.create, document.list, document.show, document.revisions, document.content, document.search, document.revise, document.bind
media.list, media.show, media.revisions, media.select, media.review
evaluation.list, evaluation.show, evaluation.create
run.list, run.show, run.objects, run.results
run.cancel
operation.find
generation.start, transform.start, transcription.start, repair.start
composition.list, composition.show, composition.revise, composition.build, composition.select
unit.list, unit.show, unit.revise, unit.select, unit.preview
publication.list, publication.publish, publication.lookup, publication.cancel, publication.reconcile, publication.recover, publication.refresh
metric.list, metric.totals
campaign.list, campaign.show, campaign.update
calendar.list, calendar.update
activity.list, activity.subscribe, activity.unsubscribe
locator.resolve
agent.providers, agent.credential.status, agent.credential.set, agent.credential.clear
agent.auth.status, agent.auth.login
agent.turn.start, agent.turn.resume, agent.turn.status, agent.turn.stop
migration.secret.import, migration.desktop.import
```

Every scoped method accepts exactly one branch, `{ sessionId }` or explicit
`{ workspaceId, projectId? }`; strict schemas reject both/neither and the
connection has no mutable context. Commander JSON and bridge results map to the
same controller DTOs field-for-field; bridge handlers never re-query or invent
path-shaped compatibility fields. `system.hello` is an ordinary response, not
an unsolicited handshake, and returns protocol/core/schema versions, immutable
`storeId`, opaque filesystem-bound `rootId`, exact capabilities, latest global
activity sequence, migration/startup state, and all protocol limits.
It also returns `consumerNamespaces: ["farm"]` and this exact safe field:

```ts
type FarmConsumerHello = null | {
  namespace: "farm";
  state: "pending" | "ready";
  coreMigrationRunId: string;
  migrationId: string;
  stageDigest: string;
  readyRecordDigest: string;
  identityDigest: string | null;
};

type ConsumersHello = { farm: FarmConsumerHello };

export type FarmIdentityV1 = {
  version: 1;
  namespace: "farm";
  storeId: string;
  consumerId: string;
  migrationId: string;
  stageDigest: string;
  credentialDigest: string;
};
```

Before cutover, including while Farm consumes the maintenance mapping and emits
its ready record, `consumers.farm` is exactly `null`. `pending` is reserved
strictly for a successfully cut-over core whose verification-bound Farm record
exists but whose namespace is not installed; it requires
`identityDigest: null`. `ready` requires the digest of the accepted bounded
identity. No path, lock nonce, credential/token digest, or consumer file
content appears in hello. If migration inventory has no Farm candidates, no
consumer is bound and `farm: null` remains valid after freeze and cutover;
`pending` is never synthesized.

The identity file is UTF-8 canonical JSON for `FarmIdentityV1`: keys appear in
the displayed order, with no insignificant whitespace or trailing newline.
`storeId`, `consumerId`, and `migrationId` are 1..128 ASCII bytes matching
`^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$`; stage/credential digests are lowercase
64-hex. Farm creates `consumerId` once during staging and it is immutable
through ready/freeze/install/recovery. `auth.token` is exactly the 43-byte
unpadded canonical base64url encoding of 32 random bytes, without newline;
`credentialDigest` is lowercase SHA-256 hex over the 32 decoded bytes, while
`identityDigest` is SHA-256 over the canonical identity-file bytes. Reject
extra/missing/reordered fields, non-canonical bytes/base64url, changed bound
facts, or invalid IDs/digests. The core Task 9 loader performs real-parent
`lstat`/realpath containment, `O_NOFOLLOW` open, owner/mode/size `fstat`, and
post-read file/parent identity checks before authentication. Farm startup
requires an exact
supported protocol/core/schema/contract tuple plus the declared namespace and
the `workspace.export`, `workspace.import`, and `migration.consumer.map`
capabilities; a missing or newer unsupported capability/version is a hard
startup error rather than a best-effort fallback.
Every media method uses `{ type: "artifact" | "run-object" | "object", id }`.
Mixed-ref reads preserve caller order and enforce Workspace/Project/shared
visibility atomically. `media.review` delegates unchanged to the core atomic
controller: Shortlist is `candidate`, Approved `approved`, Reject `rejected`,
and Needs Work is `candidate`, with favorite/rating/tags/notes in immutable
Evaluation metadata. Project feedback is created only with an exact same-
Project Iteration and is required for Project Needs Work; Workspace reviews
forbid feedback/Iteration and create only the new state revision plus Workspace
Evaluation. `media.select` accepts only an Artifact ref, one exact same-
Artifact revision, and `expectedSelectedRevisionId`; it exposes no locator and
is the sole Studio replacement for legacy `board.json` scene choices.

`document.content` is the bounded text seam for consumers. In addition to the
method's mandatory `{ sessionId } | { workspaceId, projectId? }` context, it
accepts `{ revisionId, afterByte, limitBytes }`, requires `afterByte >= 0` and
both values to be safe integers with `limitBytes` in `1..65_536`, checks exact immutable-revision visibility, and
returns only `{ revisionId, format, text, nextByte }`. Reject a continuation-
byte start; if the nominal limit splits one code point, extend that page by at
most three bytes and set `nextByte` to the actual end. No other Document method
returns a locator, bucket/key, path, or body.

`document.bind` accepts exactly one owner branch `{ projectId, role } | {
buildId, role }`, the new `revisionId`, and required `expectedRevisionId`
(null only for an empty role). It returns `{ ownerType, ownerId, role,
documentId, boundRevisionId, currentHeadRevisionId, hasNewerHead }`; a stale
expectation conflicts and a newer Document head never rewrites the binding.

`workspace.export` creates a core-owned portable package and returns
only `{ runId, packageObjectId, manifestSummary: { version, workspaceId,
entityCounts } }`; package bytes and the hash-bearing canonical manifest remain
behind the explicit export/`locator.resolve` seam and never enter an ordinary
DTO. The canonical package manifest contains the selected Workspace,
Projects, Documents, Objects, Artifacts, Compositions, Builds, Evaluations,
Units, presentations, campaigns, dated calendar entries, and non-secret social
account descriptors (`platform`, `provider`, external ID, handle, and public
config), but excludes credential refs/configured-source state, secrets,
operational Runs/RunObjects, Publications, Metrics, and `.ralphy/farm` state.
`workspace.import` accepts either that package Object ID or bytes first ingested
through the CLI, requires an idempotency key, validates every hash and relation,
and returns `{ workspaceId, entityMapPage, relinkPage }`; each page is caller-
bounded `1..100` with its own ordinal cursor. The complete persisted mapping
covers every imported package entity, including deduplicated identities;
replaying the same key/package with later cursors returns stable pages without
duplicate rows or another import.
Imported social accounts have no credential ref, are marked relink-required,
and each appears in `relinkPage` as `{ oldId, newId, platform, provider,
handle }`; campaign/calendar references are rewritten through the same complete
map. A Publication through such an account refuses until explicit scoped auth
relinks it.

`migration.consumer.map` accepts `{ migrationRunId, lockNonce, namespace:
"farm", grantDigest, sourceIdentityId, sourceInventoryDigest,
afterSourceLocatorHash?, limit }` and returns bounded
rows `{ sourceLocatorHash, sourceKind, targetRefs }`. Each hash is SHA-256 over
`source-kind + NUL + normalized-relative-POSIX-path`; `targetRefs` is a sorted
list of stable core entity type/ID pairs. The method is available only while the
matching pre-freeze import Run owns the maintenance lock,
inventory declares Farm required, `consumers.farm === null`, and the supplied
values match its exact mode-0600 consumer maintenance grant. It neither
requires nor accepts an installed Farm
identity/token. It rejects
unknown source identities, changed inventory digests, absolute or unresolved
source paths, and a wrong/stale lock nonce or grant digest, and is
disabled after freeze/cutover and whenever Farm is `pending` or `ready`. It
never returns a raw path or consumer-owned state.

`activity.subscribe` is only the store-wide sequence feed and accepts an
exclusive numeric sequence, not Workspace/Project filters. The acknowledgment
must drain before polling starts. Clients filter safe events locally; reconnect
uses `activity.list` from the last drained sequence.

`consumer.authenticate` is allowed only after `system.hello`. It accepts exact
JSON `{ namespace: "farm", tokenBase64url }`; the token is canonical unpadded
base64url for exactly 32 decoded bytes. Core validates the decoded-byte digest
against the safely opened bounded identity using `timingSafeEqual`, zeroes the
temporary bytes, and binds that principal to the connection without returning
the token/digest.
`consumer.session.start` creates an immutable scoped Agent Session owned by
that authenticated principal and tracks it on this connection;
`consumer.session.end` may end only one of that connection/principal's
Sessions. A new connection authenticated as the same principal creates a new
Session; that Session may recover the principal's old operation but never
becomes its historical author. Consumer mutations accept only a Session tracked
by the current live connection. Disconnect immediately removes connection authority, ends idle
Sessions, and leaves an active-Run Session usable only for terminal cleanup
before ending it. Consumer mutations require this Session and
the bridge derives `external_system = "ralphy-farm"`. Explicit scope remains
valid for reads, but cannot author a mutation. An ordinary Session cannot
query/start external operations, a foreign principal cannot recover them, and
a consumer Session cannot start an ordinary Run. `operation.find` accepts an
active current-connection consumer Session, either the complete external tuple
or one idempotency key, and optional `resultsAfter` plus `resultsLimit` in
`1..100`. It compares the authenticated principal and scope with the Run and
returns the safe Run plus one `p1.[position,id]` result page. `run.results`
continues that page with `{ context, runId, after, limit }`: ordinary Runs use
normal read visibility, but an external Run requires a current consumer Session
for its exact principal/scope and rejects direct or ordinary context.
Publication submission, lookup, reconciliation, and
provider cancellation remain separate Runs/result streams; local draft cancel
has no Run and cannot be found here.

`generation.start`, `transform.start`, `transcription.start`, and
`repair.start` call the Task 7A controllers. `composition.build`, `unit.revise`,
and `publication.publish|lookup|reconcile|refresh` use their consumer operation
form when external provenance is present. `publication.cancel` rejects external
provenance for `expectedState: "draft"`; for `scheduled | submitted`, it uses
the consumer operation form when provenance is supplied and otherwise a normal
Run. `publication.recover` is a serialized short mutation over an already
expired follow-up; it accepts no external provenance or claim token and calls
only the Task 7 recovery controller. `campaign.list|show|update` and
`calendar.list|update` call only the Task 7 SQL/controller APIs. All operation
methods acknowledge the durable Run/result state; no bridge handler calls a
Commander adapter, provider, filesystem-scanning compatibility reader, or
ad-hoc SQL query.

- [ ] **Step 4: Secure locators and agent execution**

All normal domain methods return explicit safe DTOs and recursively forbid
Activity payload, RunObject path/log/tag/metadata/error, Object
`bucket|key|sha256|originalName|metadata`, Document body,
`path|absolutePath|locator`, raw config/provider payload/report/error, and
credentials. Internal raw rows are never bridge result types. `locator.resolve` is the sole path exception: it accepts only
`{ target: { type: "object" | "run-object", id }, purpose: "preview" |
"read-text" | "finder" | "open" | "drag", context }`, fetches the row
internally, checks read visibility separately from authorship scope, and returns
`{ absolutePath, mime, bytes }` only to trusted Electron main. Project reads may
see Workspace-shared Objects. Reject caller paths/keys/buckets, cross-scope IDs,
missing/non-regular bytes, symlink escapes, and unsafe unpromoted RunObject
locators. Renderer IPC never forwards or persists this raw result.

Consumer operations, Farm runners, and executors have no locator capability;
they read Document text only through bounded `document.content` and use stable
entity refs plus core operations for all media work.

Agent credentials are write-only bridge inputs. `agent.providers` enumerates the
registry; credential status follows the scoped encrypted > captured-env >
subscription > missing precedence, and set/clear mutations share the serialized
secret lane. `agent.auth.status|login` invokes provider-owned subscription auth
without returning tokens. Prompt/customer text enters `agent.turn.start|resume`
only in the JSON request read from bridge stdin and is forwarded through child
stdin or an in-memory provider body, never argv or child env; no customer path
is used as identity.

Add `agent_turns(run_id PRIMARY KEY, agent_session_id, chat_id, provider,
provider_resume_id, resumed_from_run_id, created_at)` with immutable identity and a guarded one-way
`provider_resume_id: NULL -> value` transition, plus append-only
`agent_turn_events(run_id, sequence, kind, data_json, created_at)` with unique
`(run_id, sequence)`. The opaque provider resume ID is distinct from UI
`chatId` and never appears in a DTO/event. One Agent turn is exactly one Run, so `turnId === run.id`; `chatId` is
optional UI grouping and never provenance. `agent.turn.start` requires an active
Agent Session. An ordinary Session creates an ordinary Run; a consumer-owned
Session is accepted only with the complete external tuple/key and uses
`startConsumerOperationRunInTransaction` plus the canonical prompt/request
digest, so it cannot start an ordinary Run. In the same transaction, a new
operation creates its turn plus durable started event; same-principal reconnect
replay returns the existing Run/turn while ordinary/foreign principals reject.
The controller then
flushes the acknowledgment before emitting any event. Persist each normalized
`started|text-delta|tool-start|tool-end|completed|failed|cancelled` event before
delivery, with turn-local monotonic sequence and a database guard for exactly
one terminal event. `status` pages durable events and is the reconnect path for
an in-flight/completed turn. `resume` accepts a prior terminal turn plus a new
prompt, validates the same Agent Session/chat/scope, and creates a new Run/turn
linked by `resumed_from_run_id` while using only the prior stored provider resume
ID. Execution retry may add an attempt to one Run; a new user turn never does.

Maintain a registry per turn/operation with AbortController, Run ID, Session ID,
and child process group registered before awaiting it. `run.cancel` requires
`expectedState`; `agent.turn.stop` delegates to it. Abort provider calls, send
TERM to the process group, escalate to KILL after the fixed timeout, await close,
and terminalize Run/attempt/event exactly once. On stdin EOF, EPIPE, fatal
protocol error, or bridge exit, cancel all owned children. Never inject secrets
into the bridge's own long-lived environment.

- [ ] **Step 5: Test subscriptions, conflicts, locators, and secret redaction**

Spawn `bun run cli/index.ts bridge --stdio --root <fixture-data-root>`, send
multiple JSONL requests, mutate a Document through a second DB connection, and
assert the global activity feed resumes after the requested sequence without
gaps. Subscription acknowledgment drains before events; each cursor advances
only after its event drains; polling drains ordered pages without overlapping
intervals and supports unsubscribe. Test strict direct-vs-Session context,
causal mutation/read ordering, in-flight stdin pause/resume, live/completed ID
duplicates, seen/outbound/delta bounds, concurrent out-of-order reads, stdout
backpressure, exact overview requested-section/cursor shapes, ordered mixed
media refs/visibility, safe-DTO recursive bans for Activity payload,
RunObject path/metadata/error, Object storage/hash/name/metadata, and Document
body, cross-root/shared locator rules,
stale revision conflict, durable status reconnect plus resume-to-new-turn IDs, ack-before-event,
exactly-one terminal event, expected-state cancellation, child/grandchild TERM/
KILL, EOF/EPIPE cleanup, provider precedence/auth, and absence of fixture
secrets or core-injected paths across DTOs/stdout/stderr/activity. Agent text is
tested as opaque content; structured tool events expose only tool name/call ID/
state, not raw arguments or output.

Also assert `system.hello` reports the exact Farm namespace and supported
version/capability tuple plus all three lifecycle values: pre-cutover `null`,
post-cutover/pre-install `pending`, and installed `ready`; consumer auth
rejects padded/non-canonical/wrong-length/wrong tokens without reflection,
survives no identity leaf/parent symlink, owner/mode/size/read-race check, and
cannot claim another principal; a reconnect authenticated as the same principal
creates a new Session that may recover the old operation, while foreign and
ordinary Sessions reject and a consumer Session cannot start an ordinary Run;
generation/transform/transcription/repair/campaign/calendar methods exist and
match their controller DTOs; tuple/key replay for generation, Build, Unit
revision, Publication, Metric refresh, and consumer Agent turn returns the original IDs after a simulated lost
response. Create more than 100 results and require `operation.find` plus
`run.results` to page them once in `(position,id)` order with no leak or
duplicate. Provider lookup/cancel/reconciliation replay returns its original
operation Run/result even when the resulting Publication is failed/cancelled;
operation errors produce failed Runs independently of Publication state. Draft
cancel rejects consumer external fields, and a simulated lost response is
resolved by bounded `publication.list` rather than `operation.find`. Portable
Assert `publication.recover` rejects a live fence, token, external tuple, or
any submission-Run reuse; exact expiry is treated as expired and closes
the follow-up once with the Task 7 status-versus-uncertain semantics and no
secret in response/event. Also require canonical Presentation-derived platform,
URL/timeline DTOs, immutable account/empty Unit identity, and no result insert
after terminal Run. Portable
export/import produces complete stable paged entity/relink mappings with no
manifest/Object hash in the response, preserves campaign/calendar rewrites,
and is idempotent; and
`migration.consumer.map` rejects the wrong Run/lock/grant/source identity or
digest, absolute or unresolved locators, and every post-cutover call while
returning only deterministic hashes and existing stable target refs.
Use the fixed golden from the installed
`@alecs5am/ralphy/contracts/farm-identity-v1.golden.json` export: core's
serializer/parser must reproduce its literal sample bytes/digests and reject a
reordered key, whitespace, trailing newline, or changed sample fact. This is a
contract test only; runtime readiness compares that migration's ready record
with its staged identity/decoded-token facts and never with the golden's fixed
sample values. Test explicit-scope multi-byte `document.content`, continuation-
byte rejection, and the one-code-point `limit + 3` rule; recursively prove that
every other Document/consumer DTO remains locator- and body-free.

`tests/unit/bridge-boundaries.test.ts` prohibits bridge imports from
`cli/commands/**`, Commander, `output.ts`, `raiseError()`, and
`cli/lib/store/internal-types.ts`. Handlers call only public safe stores/
controllers directly.

Run: `bun test tests/unit/bridge-protocol.test.ts tests/unit/bridge-boundaries.test.ts tests/unit/agent-session.test.ts tests/integration/cli-bridge.test.ts`

- [ ] **Step 6: Commit the bridge**

```bash
git add cli/lib/store/schema.ts cli/lib/store/types.ts cli/lib/store/portable.ts cli/lib/store/migration-consumers.ts cli/lib/bridge cli/lib/agent cli/commands/bridge.ts cli/index.ts tests/unit/bridge-protocol.test.ts tests/unit/bridge-boundaries.test.ts tests/unit/agent-session.test.ts tests/integration/cli-bridge.test.ts
git commit -m "feat(cli): add versioned desktop bridge"
```

### Task 9: Prohibit normal legacy state access and finish CLI parity

**Files:**
- Create: `scripts/lint-no-legacy-state.ts`
- Modify: `package.json`
- Modify: `.github/workflows/test.yml`
- Modify: every remaining normal-state caller reported by the lint
- Delete: `cli/lib/registry.ts`
- Modify: `AGENTS.md`
- Modify: `CLAUDE.md`
- Modify: `.agents/skills/intake/SKILL.md`
- Test: `tests/unit/no-legacy-state-writers.test.ts`

**Interfaces:**
- Consumes: all normal command/library source outside `cli/lib/migration/**`
- Produces: `bun run lint:no-legacy-state` and zero non-migration legacy readers/writers

- [ ] **Step 1: Write staged compatibility and final zero-caller gates**

Reject references outside migration/tests to these authoritative filenames and APIs:

```ts
const bannedNames = [
  "registry.json", "workspace.json", "asset-manifest.json", "generations.jsonl",
  "user-prompts.jsonl", "user-assets.jsonl", "unit.json", "publish-ledger.jsonl",
];
```

During Tasks 2-8, a compatibility mode permits only the named read-only
registry/current-Workspace adapters and reports their caller set; it rejects all
legacy control-file writers. Task 9 switches to final mode: reject every import/
call of `cli/lib/registry.ts`, `getActiveWorkspace`, `setActiveWorkspace`, or
`currentWorkspace` outside migration/tests, and reject direct writes below old
`projectDir()`, `sharedDir()`, or `workspaceUnitsDir()` unless owned by
`objects.ts`, Run temp/cache, export, or migration. The final gate is exact zero
callers, not a suppressions list.

- [ ] **Step 2: Convert every reported caller by category**

Run the lint repeatedly and route each finding to its owner: settings/resources to `operations.ts`, text to Documents, media to Objects/Artifacts, execution logs to Runs/activity, deliverables to Units, publish history to Publications, and reproducible acceleration files to cache. Do not suppress a finding merely to make the gate pass.

Update `AGENTS.md`, the `CLAUDE.md` repository orientation, and every playbook
reference (including intake/memory/workspace switching) to explicit
`--workspace` or immutable Sessions. Remove claims that `workspace use`, a
last-used Workspace, registry JSON, or path manifests are authoritative.

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

Create Workspace -> Project -> Iteration -> brief revision -> input Artifacts ->
Composition revision -> failed Build -> fixed revision -> successful
multi-output Build -> multi-platform Unit with independently changed latest and
selected revisions -> failed Publication -> uncertain fenced Publication ->
reconciliation -> successful revised Publication -> a second scheduled
Publication -> status lookup -> provider cancellation -> multi-source Metric snapshots with an equal-
`as_of` tie. Include one text-only Document Unit and one repeated-item pack. Read
the result through CLI JSON and bridge methods and assert stable IDs, effective
presentation/caption/options, Publication lineage, and default versus explicit-
source metric totals match.

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
