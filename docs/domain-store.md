# Ralphy domain store

Ralphy's authoritative state is a SQLite database bound to one explicit
`.ralphy` data root. Workspaces, Projects, Documents, Artifacts, Compositions,
Builds, Units, Publications, Metrics, Runs, Sessions, and Activity are durable
domain entities; filesystem paths are derived evidence, never identity.

## Scope and revisions

Every read and write carries either `{ sessionId }` or
`{ workspaceId, projectId? }`. A Session is immutable and its Project scope
cannot be changed in place. Revisions are append-only and mutations use an
expected-head or expected-selected-revision value, so stale clients receive a
conflict instead of silently overwriting newer work.

Documents expose metadata and revision history without body text. Consumers
use the bounded `document.content` seam with `afterByte` and
`limitBytes <= 65536`; the seam preserves UTF-8 code points and returns only
`revisionId`, `format`, `text`, and `nextByte`.

## Builds, Units, and presentations

A Composition revision is sealed before a Build starts. A Build owns a Run and
ordered outputs. A Unit is an immutable identity with ordered items and
platform presentations; latest and selected revisions are independent. Caption,
crop, safe-area, and platform options belong to a Presentation revision rather
than to an unscoped file.

## Bridge

Start the long-lived JSONL bridge against an explicit data root:

```bash
bun run cli/index.ts bridge --stdio --root /path/to/.ralphy
```

Each request is `{ v: 1, id, method, params }`; each response is a matching
success or sanitized failure envelope. `system.hello` reports protocol limits,
capabilities, store identity, and the latest Activity sequence. The bridge
keeps no mutable context: every scoped request supplies its own scope.

`activity.subscribe` is a store-wide monotonic feed. The subscription ACK is
flushed before polling starts, and reconnects use `activity.list` from the last
drained sequence. Activity payloads, storage locators, provider diagnostics,
credentials, RunObject paths, and Object hashes are not ordinary DTO fields.

## Locators and credentials

Only trusted Electron main may call `locator.resolve`. It accepts a stable
Object or RunObject reference plus a scope and returns a checked regular-file
path, MIME, and byte count. Renderer IPC, consumer operations, and agents do
not receive this capability; they use entity references and bounded document
content instead.

Credential methods are write-only. `agent.credential.status` reports configured,
source, and relink state; `set`, `clear`, and provider-owned login never return
the value. Provider resolution prefers scoped encrypted storage, then the
allowlisted bridge startup environment, then provider subscription, then
missing.

## Portable packages

`workspace.export` creates a durable package Object and returns only its Run ID,
Object ID, and bounded entity counts. `workspace.import` requires an
idempotency key and returns cursor-paged old-to-new entity mappings and account
relink requirements. Secrets, credential references, operational Runs,
Publications, Metrics, and consumer-owned state are excluded. Replaying the same
key and package is idempotent; later cursors do not create duplicate rows.

Legacy registry/current-Workspace pointers and control files are not
authoritative state. Use explicit Workspace scope, immutable Sessions, and the
portable package contract for cross-installation transfer.
