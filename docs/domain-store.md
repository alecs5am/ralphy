# Ralphy domain store

Ralphy's authoritative state is a SQLite database bound to one explicit
`.ralphy` data root. Workspaces, Projects, Documents, Artifacts, Compositions,
Builds, Units, Publications, Metrics, Runs, Sessions, and Activity are durable
domain entities; filesystem paths are derived evidence, never identity.

## Scope and revisions

A Document revision with an explicit title also updates the Document's current
display title. Omitting the title preserves the current name; earlier revision
titles remain immutable. Lists and search therefore use the name saved by the
editor, including after a restart.

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

`workspace.export({workspaceId})` creates a version 2, uncompressed `.workspace.tar`
package as a durable Object and returns its Run ID, Object ID, entity counts, and
file count. Transfer covers the entire workspace: projects, documents and all
revisions, media bytes, compositions and builds, units and captions, publishing
and metric history, memory, campaigns, calendar, settings, and execution history.
Saved desktop Canvas files, video drafts, and workspace chat history are included.
Project-only exports are refused because they can lose shared references.

`workspace.import` requires an idempotency key and returns cursor-paged old-to-new
entity mappings and account relink requirements. It always creates a new
workspace. IDs, object paths, desktop workspace paths, and saved root paths are
remapped; existing workspaces remain unchanged. Checksums, file paths, schema,
foreign keys, and domain invariants are checked in a staging store before a
transaction restores the records. A failed import removes files it promoted;
repeating a successful key and package returns the prior result.

For a native file chooser or an initialized library with no workspaces, use:

```bash
ralphy --root /path/to/library --json workspace import \
  --file /path/to/export.workspace.tar --idempotency-key transfer-2026-09
```

`--as` and `--name` optionally choose the new workspace slug and display name.
File retries are identified by the complete archive hash and idempotency key.
No temporary placeholder workspace or source credential configuration is created.
Archives currently support up to 1 GiB; oversized archives fail explicitly rather
than dropping files. Version 1 packages contained incomplete metadata and cannot
restore a workspace; export the original workspace again to obtain version 2.

Configured credentials, credential references, and consumer authentication are
excluded. Recognizable credentials in saved transcript/tool text and metadata
are redacted. Imported accounts require reconnection, chats use Plan permissions
and fresh provider sessions, and unfinished execution jobs are cancelled. Source
media and file bytes are preserved exactly: inspect user-authored files for any
embedded secrets before sharing an archive. Machine configuration and installed
dependencies are not part of workspace transfer.

Legacy registry/current-Workspace pointers and control files are not
authoritative state. Use explicit Workspace scope, immutable Sessions, and the
portable package contract for cross-installation transfer.

## Migration safety

The domain migration is resumable and journaled:

```bash
ralphy migrate domain audit --source /path/to/source/.ralphy
ralphy migrate domain run --source /path/to/source/.ralphy --store-root /path/to/stage/.ralphy
ralphy migrate domain resume --run-id <run> --source /path/to/source/.ralphy --store-root /path/to/stage/.ralphy
ralphy migrate domain status --run-id <run> --store-root /path/to/stage/.ralphy
ralphy migrate domain verify --run-id <run> --store-root /path/to/stage/.ralphy --verification-dir /path/to/reports
ralphy migrate domain cutover --run-id <run> --confirm <run> \
  --verification-id <verification> --verification-record /path/to/reports/verification.json \
  --source /path/to/source/.ralphy --stage /path/to/stage/.ralphy
```

Cutover moves the exact source to a retained recovery root, installs the exact
staged root, and records every transition in a mode-0600 external journal.
`domain recover` resumes an interrupted journal; `domain rollback` restores the
previous generation. Queue jobs linked to a migration remain held until an
operator explicitly runs `ralphy queue resume <id> --migration-run <run>`.
