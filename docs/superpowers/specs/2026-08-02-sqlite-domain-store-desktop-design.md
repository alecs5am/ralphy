# SQLite Domain Store, Versioned Production, and Desktop Integration Design

> **Status:** approved by the user on 2026-08-02
> **Date:** 2026-08-02
> **Scope:** `ralphy` core, `ralphy-desktop`, and the user's existing `.ralphy` data

## Goal

Replace the filesystem-as-database model with one mandatory local SQLite domain
store and immutable workspace/project object buckets. Rework the entire Ralphy
CLI to use that store, make the Desktop application consume the same versioned
core contract, and fully migrate the user's existing `.ralphy` library into the
new model without leaving a legacy tree behind.

The result must remain equally usable from a normal Codex/Claude chat and from
the richer Desktop application:

- chat agents drive the JSON-first CLI;
- Desktop uses a long-lived local stdio bridge exposed by the installed CLI;
- core owns the database, migrations, object paths, validation, and writes;
- Desktop and sibling repositories never import core TypeScript or open SQLite
  directly.

## Current-state evidence

The live `.ralphy` library is approximately 66 GB. Its registry contains 146
projects while 160 project directories exist physically. Thirty workspace
directories exist, including scopes not represented consistently in registry
project mappings.

`denti-perio-pitch-001` demonstrates the structural problems:

- 9.8 GB and 17,897 regular files;
- 7 GB under `render/`;
- 16,366 files and roughly 2.75 GB inside three `render/work-*` directories;
- 1,096 artifact files and 92 composition files, including 42 HTML sources;
- 21 Markdown documents and 998 generation-log events;
- client feedback documents are not linked to the revisions that addressed
  them;
- `asset-manifest.json` is approximately 13 MB because it embeds ten base64
  image payloads and records absolute paths for all 163 slots;
- Unit directories copy hundreds of megabytes of media and express logical Unit
  revisions through `.v2` directory names.

Desktop currently derives `finals`, `assets`, `refs`, `units`, and `files` by
classifying paths. These categories mix status, role, domain entity, and storage
implementation. Reviews are keyed by path-derived IDs, so overwrites erase
history and renames orphan annotations.

Core already provides two foundations to reuse:

- `bun:sqlite` with WAL, foreign keys, `busy_timeout`, transactions, and
  `PRAGMA user_version` in the jobs store;
- the storage-agnostic `MediaArtifact` taxonomy with `path | uri`, kind, role,
  slot, metadata, and provenance.

No ORM, database server, HTTP service, or competing media taxonomy is needed.

## Hard invariants

1. `.ralphy/ralphy.db` is the only authoritative domain store after cutover.
2. Every edit to revisioned creative state (Documents, Artifacts,
   Compositions, and Units) creates an immutable revision; no revision is
   rewritten in place. Operational pointers/statuses remain mutable but every
   change is audited.
3. A project belongs to exactly one workspace.
4. Stored object locations are relative bucket keys, never absolute paths.
5. Binary payloads and data URLs never live in SQLite.
6. Every file in the pre-migration library receives an explicit migration
   disposition. Nothing is silently skipped.
7. A Unit is a flexible publishable bundle, never an alias for one media file.
8. A Build belongs to exactly one Composition revision and records all of its
   exact inputs and outputs.
9. Working and diagnostic files remain discoverable by agents and Desktop.
   Cache classification must not make evidence disappear.
10. Desktop writes only through the versioned core contract.
11. Long-running provider/render work never holds a SQLite transaction open.
12. No long-lived dual-write to legacy JSON/JSONL/Markdown files is permitted.
13. No automatic deletion of working, rejected, or superseded project objects
    occurs while a project is active.

## Domain model

### Workspace and project

A Workspace represents a client/product and one or more social accounts. It
owns public identity, shared documents, shared media, references, account
configuration, and Projects.

A Project is a focused production area that aims to produce one Unit or a
family of closely related Unit variants. A Project cannot exist outside a
Workspace. Multiple materially different concepts should be separate Projects.

Workspace and Project display slugs are mutable. Stable opaque IDs own all
database relationships and physical bucket prefixes.

### Iteration, revision, and feedback

These concepts are deliberately separate:

- **Iteration** is a meaningful project-wide work round caused by a new brief,
  a batch of client corrections, or a new conceptual direction.
- **Revision** is an immutable version of one Document, Artifact, Composition,
  or Unit.
- **Build** is the result of executing one exact Composition revision.

Internal retries and small fixes create revisions/builds inside the current
Iteration. A new batch of requested changes creates a new Iteration.

Feedback items belong to an Iteration and may target a Document revision,
Artifact revision, Composition revision, Build/output, Unit item, platform
presentation, or media timecode. Each item has a status, resolution note, and
links to the revisions/builds that resolved it.

### Object, artifact, and artifact revision

- **Object** is immutable stored bytes plus storage metadata. It has no creative
  meaning by itself.
- **Artifact** is a stable logical media/resource identity such as
  `scene-03-video`, `brand-logo`, or `master-voiceover`.
- **ArtifactRevision** is one exact version of an Artifact backed by one Object.
- **ArtifactRelation** records provenance such as `derived-from`, `variant-of`,
  or `uses`.
- **ArtifactUsage** assigns a contextual role to an exact Artifact revision in
  a Workspace, Project, feedback item, or another domain context.

Intrinsic kind and contextual role are separate. `video`, `image`, `audio`,
`captions`, `document`, `data`, `package`, and `custom` are kinds. `reference`,
`composition-input`, `working`, and `deliverable` are usage/lifecycle concepts,
not competing file categories.

Artifact revision lifecycle states are `working`, `candidate`, `approved`,
`rejected`, `superseded`, and `archived`. A Unit or Composition always links to
an exact Artifact revision, never to a mutable filename.

### Composition, composition revision, and build

A Composition is an optional, versioned assembly that turns exact inputs into
one or more outputs. It generalizes video editing without forcing uploaded
ready-to-publish media to have a fake Composition.

Composition semantics and implementation are orthogonal:

- `kind`: `video`, `carousel`, `sticker-pack`, `image`, `audio`, `document`, or
  `custom`;
- `engine`: `hyperframes`, `remotion`, `html`, `ffmpeg`, `manual`, or a future
  engine/plugin slug.

`kind` belongs to the Composition. `engine` belongs to each revision, allowing a
HyperFrames revision to be followed by a Remotion revision of the same logical
Composition.

A Composition revision contains:

- its parent and project Iteration;
- engine ID/version and validated engine configuration;
- immutable source files with logical paths;
- exact input Artifact revisions with roles/order/configuration;
- draft/sealed lifecycle and authorship.

`composition revise` creates a new draft and materializes a normal editable
checkout. `composition build` snapshots the checkout into immutable Objects,
seals the revision, and creates a Build. Further edits start another revision.
Sealing occurs before engine execution, so a failed Build still points to the
exact reproducible source revision that failed.

A Build has a profile/configuration and one or more ordered output Artifact
revisions. UI terminology is format-specific:

- video Build -> Render;
- carousel Build -> Export;
- sticker-pack Build -> Pack build.

One video revision may therefore have master, social-compression, preview, and
platform-specific Builds without duplicating the Composition.

### Unit, platform presentation, publication, and metrics

A Unit is the logical publishable deliverable. It is not a file and does not
know which engine produced its media.

A Unit revision contains an ordered heterogeneous list of Unit items. Examples:

- a Telegram sticker pack with 32 sticker Artifact revisions;
- an Instagram carousel with eight ordered image Artifact revisions;
- a vertical short with a video, thumbnail, captions, and optional text tracks;
- an article/package with body, cover, and attachments.

The same video uploaded to TikTok, Instagram Reels, and YouTube Shorts remains
one Unit. Each platform receives a `UnitPresentation` containing caption,
cover/crop/safe-area configuration, ordered-item overrides, and platform
options. Desktop renders the appropriate platform UI preview from this record.

A Publication is an actual scheduled/published attempt for one presentation.
It records Postiz/provider identifiers, state, URL, timestamps, and errors.
Metric snapshots append time-series views, engagement, watch-time, and raw
provider fields without mutating prior snapshots.

### Documents

A Document is a typed logical text/structured-content identity. A
DocumentRevision stores immutable Markdown, plain text, or JSON directly in
SQLite.

Initial kinds include `brief`, `style-guide`, `production-plan`, `scenario`,
`storyboard`, `research`, `postmortem`, `memory`, `note`, and `custom`.

Workspace documents are visible to all projects. A project/build binds the exact
Document revision it used, so a later workspace style-guide edit cannot alter
historical provenance. Text and Markdown revisions are indexed with SQLite FTS5.
Structured domain state is normalized into its own tables rather than hidden in
generic documents.

### Runs, jobs, and working files

A Run is the durable provenance record for generation, build, evaluation,
publication, migration, or another operation. A Job is optional queued
execution. A Run may have multiple provider/process attempts.

Files produced during execution are `RunObjects` with purpose, state, path,
retention classification, size/hash, and an optional promoted Object ID. They
remain queryable from the Run and can be promoted into normal working Artifacts.

Storage classification is separate from creative lifecycle:

- project working files are durable bucket Objects and remain visible;
- cache is reproducible acceleration data;
- temp is in-flight execution data;
- useful failed-run diagnostics remain accessible instead of being silently
  removed.

Active-project working/rejected/superseded bytes are never deleted
automatically. `archive/compact` first presents exact candidates and savings and
requires explicit confirmation.

## SQLite schema groups

The implementation may split migration files for reviewability, but these are
the canonical logical tables.

### Scope and lifecycle

- `workspaces`
- `social_accounts`
- `projects`
- `project_iterations`
- `feedback_items`
- `project_stages`

`projects.workspace_id` is required. Project slugs are unique within a
Workspace. Project stages replace lifecycle inference from file presence and
link completion to exact entity revisions/builds.

### Documents

- `documents`
- `document_revisions`
- `project_document_bindings`
- `build_document_bindings`
- FTS5 virtual table for searchable text/Markdown revisions

### Storage and media

- `objects`
- `artifacts`
- `artifact_revisions`
- `artifact_relations`
- `artifact_usages`

Common query fields (kind, MIME, dimensions, duration, bytes, hash, provider,
model, cost, state, timestamps) are columns. Rare provider-specific metadata is
validated JSON. Binary/base64 data is forbidden.

### Production

- `compositions`
- `composition_revisions`
- `composition_revision_files`
- `composition_inputs`
- `builds`
- `build_outputs`
- `evaluations`

### Delivery and distribution

- `units`
- `unit_revisions`
- `unit_items`
- `unit_presentations`
- `presentation_items`
- `publications`
- `metric_snapshots`

### Execution and activity

- `agent_sessions`
- `runs`
- `run_attempts`
- `run_objects`
- `jobs`
- `job_logs`
- `activity_events`

The existing jobs schema migrates into this database and gains a Run link.
`activity_events.id` is the monotonic Desktop change sequence. Activity is an
append-only audit/change feed, not event sourcing; current state remains in
ordinary relational rows.

### System and migration

- `schema_migrations`
- `migration_runs`
- `migration_entries`
- `migration_issues`

Every source path is represented by one migration entry with a disposition,
target row/object, size/hash, state, and error when applicable.

## Local storage layout

```text
.ralphy/
  ralphy.db
  buckets/
    <workspace-id>/
      shared/
        objects/
      projects/
        <project-id>/
          objects/
  tmp/
    <run-or-checkout-id>/
  cache/
  backups/
  exports/
```

Workspace and Project renames do not move bytes because prefixes use IDs.
Reassigning a Project to another Workspace is an explicit `project transfer`
operation with a journaled bucket move; it is not a normal metadata update.

An Object row stores `backend`, `bucket`, `key`, `sha256`, `mime`, `bytes`, and
`original_name`. Local is the only backend in this implementation. The shape
allows a later S3 backend without changing domain relationships. A Project is a
logical bucket/prefix, not necessarily a literal cloud bucket.

Unit formation never copies media. Shared Workspace objects can be referenced
by Projects. Duplicate hashes may reuse a proven canonical Object during
migration/compaction, but content-addressed global storage is not required.

## Core service, CLI, and Desktop bridge

Core exposes one domain/store implementation over `bun:sqlite`. There is no ORM.

```text
Codex/Claude agent -> ralphy CLI --json --+
                                          +-> domain service -> SQLite + buckets
Desktop -> installed ralphy stdio bridge -+
```

Normal CLI commands instantiate the service in process. Desktop launches one
long-lived installed `ralphy` child process and exchanges versioned JSONL
request/response/event envelopes over stdio. This avoids per-request startup,
ports, authentication surfaces, and a second database implementation.

The bridge provides:

- schema/API version and capabilities;
- paginated Workspace/Project snapshots;
- entity queries/mutations by stable ID;
- monotonic activity subscription/resume;
- resolved local object locators for preview/Finder/drag operations;
- stable error codes and diagnostics on stderr.

Desktop never opens SQLite. Farm and other sibling repositories continue to use
the installed CLI JSON contract.

The CLI becomes entity-first. Representative surfaces are:

```text
ralphy document list|show|revise
ralphy artifact list|show|promote
ralphy composition show|revise|build|select
ralphy unit show|revise|preview
ralphy publication list|publish|refresh
ralphy activity list --since <event-id>
```

Filesystem paths remain implementation details of object/debug/export commands.
All commands accept explicit Workspace/Project scope or an Agent Session ID. The
global mutable active-Workspace pointer is removed.

## Desktop information architecture

Workspace Overview shows:

- social accounts and public identity;
- current Workspace documents;
- shared media/references;
- active Projects;
- recent Units, publication state, and aggregate metrics.

Project Overview shows:

- current Iteration, purpose, and open feedback;
- changes from the prior Iteration;
- operating Documents and their selected revisions;
- Compositions, selected revisions, Builds, and evaluations;
- Units, platform presentations, publications, and metrics;
- working Artifacts/RunObjects and recent activity.

Primary Project surfaces become `Overview`, `Documents`, `Media`,
`Compositions`, `Units`, and `Activity`. `References` and `Working` are Media
filters. Raw Objects are available in an advanced technical browser. `Finals`
and `Files` are removed as peer domain categories.

The Unit view previews each platform's UI separately while preserving one Unit
identity when the underlying media is shared. The Composition view presents
revision history and nested Builds/outputs as one aggregate.

## Write and concurrency model

SQLite runs in WAL mode with foreign keys, a bounded busy timeout, and short
transactions. Desktop and multiple chat agents may read concurrently. Writes
are serialized by SQLite and use optimistic revision checks.

An operation that produces bytes follows this sequence:

1. A short transaction creates the Run/Job and activity record.
2. Provider/renderer output is written below a run-specific temp directory.
3. The output is validated, measured, and hashed.
4. It is atomically moved to an immutable bucket key.
5. A short transaction inserts Object/Artifact revision/Build output rows and
   the next activity event.
6. On failure, the Run is marked failed and useful diagnostics remain linked.

Desktop mutations include the expected selected/revision ID. A stale write
returns a conflict instead of overwriting newer agent work.

Object-write/database-commit failure can leave only an unreferenced immutable
Object, which verification/compact can report. A database row must never point
to missing bytes. Source checkouts are mutable only while their Composition
revision is draft.

Schema migration takes an exclusive migration lock and creates a verified
database backup first. No media operation may run concurrently with a storage
migration or project transfer.

## Full migration of the existing library

The migration is complete, physical, resumable, and journaled. Indexing legacy
paths is only an internal staging step. The final live tree contains no legacy
registry/manifests/logs/documents and no path-scanner fallback.

### Preflight and recovery

1. Stop Desktop, daemon, and all generation/render jobs.
2. Checkpoint the existing jobs WAL and acquire a maintenance lock.
3. Verify target paths and free space.
4. Create a recoverable snapshot/clone when the filesystem supports it;
   otherwise create a verified scoped backup or stop before destructive moves.
5. Record source counts, bytes, and control-file hashes.

The migration never targets a broad unresolved path. Every move names an exact
source and destination.

### Inventory and import

The importer creates a coverage ledger for every source path and classifies it
as domain data, durable Object, RunObject, cache, system file, or issue.

It imports:

- registry/config/workspace/project state;
- all physical Workspaces/Projects, including unregistered ones marked
  `needs_review`;
- Workspace/project Markdown and structured documents;
- asset manifests and every media version;
- generation/user-prompt/user-asset JSONL rows;
- composition sources, render variants, and diagnostic frames;
- Unit manifests, provenance, captions, publications, and analytics;
- evaluations, stage state, scorecards, spend, and postmortems;
- Desktop media annotations and saved stable preferences;
- the existing jobs/log/artifact database;
- global/workspace memory, references, research, and shared assets.

Embedded data URLs are decoded into Objects. Absolute paths become relative
keys. Matching Unit copies link to the proven source Artifact revision instead
of creating a new live copy.

Plaintext credentials are not inserted into ordinary tables. Secret values move
through a core-owned encrypted secret store; SQLite keeps only secret references
and non-secret account metadata. On macOS the encryption key is stored in the
user Keychain. Desktop accesses secrets only through core operations and never
receives secret values. Environment-owned provider keys remain environment
owned unless an existing connector explicitly imports them.

### Physical relocation

Every move is journaled as `planned -> moved -> verified` with source,
destination, bytes, and hash. A crash can resume or reverse the exact journal.

- Workspace shared content moves into the Workspace shared bucket.
- Project durable/working content moves into its Project bucket.
- Composition sources become revision source Objects.
- Render working directories/probes/frames become indexed RunObjects under the
  appropriate storage class.
- Cache/temp/system files receive explicit destinations or exclusion reasons.
- JSON/JSONL/Markdown source files leave the live tree after their imported
  rows and recovery snapshots are verified.

Ambiguous filename families (`.vN`, `-vN`, `rN`, `final*`) are fully imported
but are not assigned a selected head without evidence. They appear in the
Desktop review queue with `needs_review`.

### Verification and cutover

Activation requires:

- 100% migration-entry coverage;
- reconciliation proving that every source count/byte belongs to an imported
  row, relocated Object/RunObject, recovery snapshot, or explicit system-file
  exclusion;
- hashes for all durable Objects;
- `PRAGMA foreign_key_check` and `integrity_check` success;
- zero database links to missing Objects;
- valid Composition revision -> Build -> output chains;
- valid Unit revision -> item -> Artifact revision chains;
- no binary/base64 payloads in SQLite;
- no unresolved absolute paths in live rows;
- representative Desktop and CLI read/write smoke tests.

The final cutover installs the database and ID-based buckets as `.ralphy`, then
starts only v2-aware CLI/Desktop builds. The recovery snapshot remains outside
the live layout until the user verifies real projects. Its later deletion is an
explicit, separately confirmed action.

## Delivery sequence

This is a cross-repository contract change and lands in release order.

1. **Core domain foundation:** SQLite migrations, store modules, domain types,
   object store, revisions, activity feed, and compatibility import readers.
2. **Core production/delivery:** Composition/Build, Unit/presentation,
   publication/metrics, documents, Runs, and entity-first CLI commands.
3. **Core contract:** versioned stdio bridge, pagination, subscriptions, stable
   errors, and full CLI writer conversion. Core must build/test standalone.
4. **Desktop adapter:** replace scanner/annotation path IDs with bridge DTOs and
   stable IDs while retaining the current UI long enough to validate parity.
5. **Desktop domain UI:** new Workspace/Project overviews, Documents, Media,
   Composition/Build, Unit/platform preview/publication/metrics, working files,
   and Activity surfaces.
6. **Migration tooling:** full importer, physical mover, recovery journal,
   verification, secure-secret migration, and review queue.
7. **Rehearsal:** run audit/import/verify against a snapshot of the real library;
   fix every migration issue without touching the live source.
8. **Maintenance cutover:** stop writers, take recovery snapshot, migrate all
   live data, verify, package/launch Desktop, and exercise representative real
   projects including Denti.AI.

There is no permanent legacy mode. Compatibility readers exist only to complete
the migration and are removed after the verified cutover.

## Error handling and security

- Stable error codes distinguish validation, conflict, missing Object, migration
  coverage, database integrity, engine failure, provider failure, and secure
  storage failure.
- SQLite/bridge stdout remains machine JSON; diagnostics use stderr.
- Failed operations never promote/select a partial revision.
- Secret values never appear in bridge responses, logs, activity payloads, or
  normal database columns.
- Object resolvers validate scope and key ownership before returning paths.
- Destructive archive/compact actions operate on explicit DB IDs and show an
  exact plan before confirmation.
- Full migration and project transfer require maintenance locks and resumable
  journals.

## Verification strategy

### Core

- migration tests for every schema version and rollback-safe failure point;
- transaction tests for generation, revision selection, Composition sealing,
  multi-output Builds, Unit revisioning, publications, and metrics;
- concurrency/conflict tests with multiple connections in WAL mode;
- stdio contract tests for pagination, event resume, errors, and version gates;
- storage tests proving no row points at missing bytes and no overwrite occurs;
- CLI parity tests covering every existing stateful verb after conversion.

### Migration

- representative fixtures for video, carousel, sticker pack, article,
  Workspace Units, shared references, malformed JSONL, base64 manifests,
  orphan projects, duplicate Unit media, and ambiguous revision names;
- a Denti-like fixture with multiple feedback rounds, Composition revisions,
  render profiles, working frames, and Unit variants;
- coverage-ledger assertions that every source path has exactly one disposition;
- before/after counts, bytes, hashes, integrity checks, and recovery replay;
- a full rehearsal against a recoverable snapshot of the real 66 GB library.

### Desktop

- bridge adapter and DTO tests;
- Workspace/Project overview tests;
- Composition revision/Build switching and preview tests;
- multi-item Unit and platform-preview tests;
- publication/status/metric tests with mocked Postiz responses;
- working-file/run inspection and feedback-target tests;
- packaged-app smoke against the migrated real library.

Before completion, core runs its full lint/integration entry point and Desktop
runs typecheck, tests, build, package, signature verification, and live UI smoke.
Secret-adjacent changes additionally pass gitleaks.

## Non-goals for this program

- Hosting a multi-user cloud service.
- Implementing a real S3 backend before the local migration is proven.
- Adding an ORM or generic event-sourcing framework.
- Automatically deleting historical project media.
- Rebuilding farm automation inside core or Desktop.
- Preserving legacy filesystem scanning after the verified cutover.

The schema and object keys remain cloud-portable, but the first completed system
is deliberately local, single-user, and SQLite-backed.

## Acceptance criteria

The program is complete only when:

1. Every core CLI stateful verb reads/writes the SQLite domain store.
2. Desktop uses the installed core bridge and no longer derives entities from
   paths.
3. Composition revisions are immutable, engine-typed, switchable, and own one
   or more Builds with exact outputs.
4. Units support arbitrary ordered media bundles, platform previews,
   publications, and metric snapshots.
5. Workspace/Project Documents, Iterations, feedback, working files, and
   activity are first-class and searchable.
6. The user's complete current `.ralphy` library is physically migrated with
   100% coverage and verified integrity.
7. Representative real projects, especially Denti.AI, open and remain usable in
   both chat-driven CLI workflows and the packaged Desktop application.
8. No live legacy registry/manifests/JSONL/Markdown state or path-scanner
   fallback remains.
