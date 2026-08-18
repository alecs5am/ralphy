# Workspace Memory Workbench

## Goal

Replace the workspace-level Memory placeholder with the high-fidelity rulebook from the supplied Memory design archive. Preserve the existing Hermes Memory lifecycle and vocabulary while moving its durable behavior onto the SQLite domain store used by current Desktop builds.

Memory remains a small set of durable rules and facts. It is not chat history, a notes application, or a project activity log.

## Existing behavior to preserve

The existing Core Memory system is the semantic source of truth:

- global and workspace tiers;
- workspace entries override global entries with the same slug during recall;
- active, proposed, rejected, and archived states;
- append-only revisions;
- explicit approve, reject, and retire operations;
- direct user notes may become active immediately;
- curation never silently changes active memory;
- no delete or destructive overwrite action;
- a 100-active-entry cap per tier;
- case-insensitive substring search over metadata and the full body.

The implementation ports these rules rather than maintaining the legacy file store beside SQLite.

## Core storage

Add a schema migration after the current schema version. `memory_entries` gains an explicit `tier` column with values `workspace` and `global`. The existing `workspace_id` remains the owning/provenance workspace; a global entry is visible in every workspace. Add a partial unique index so one global entry owns a slug across the store, while workspace slugs remain unique per workspace.

The linked Document revision stores the structured Markdown body. Memory rows store identity, lifecycle, type, provenance, and current revision pointers. Revisions are immutable:

- revising writes the next revision number;
- the prior active revision remains available in history;
- a proposal for an existing slug may coexist with the current active revision;
- approval promotes the proposed revision and archives the previous active revision;
- rejection preserves the proposed revision for provenance;
- retirement archives every revision and removes the entry from recall.

Existing migrated Memory rows become workspace-tier entries. No existing row is deleted or rewritten.

## Core bridge contract

Add the smallest complete contract needed by Desktop:

- `memory.list` returns active or proposed summaries for an effective, workspace, or global scope, with optional query, type, and ordering filters.
- `memory.show` returns one entry, its structured body, quality flags, and override relationship.
- `memory.create` writes an active entry or proposal.
- `memory.revise` appends an active revision or proposal to an existing entry.
- `memory.approve` activates one proposal or all proposals in one tier.
- `memory.reject` preserves a proposal as rejected.
- `memory.retire` archives an active entry and all revisions.
- `memory.history` returns append-only revision history and bodies for comparison.
- `memory.recall` returns the exact effective digest for one workspace, including overridden global slugs.
- `memory.health` reports deterministic quality findings such as missing negative scope and exact-slug overrides. It is read-only and never changes active entries.
- `memory.curate` reuses the existing Hermes curation analysis and may stage merge proposals. It never changes or retires active entries.

All mutations validate scope, type, slug, status transition, capacity, and optimistic revision state in Core. Desktop never opens or writes `ralphy.db` directly.

## Desktop page

Implement one workspace page, not permanent inner tabs. The page follows `Memory Page.dc.html`:

- page header with `Review memory health`, `Preview agent context`, and the single primary `Add memory` action;
- search, Effective/Workspace/Global scope control, type chips, and sort control;
- proposal review strip and same-page review mode;
- rulebook groups by type in active mode and by tier in review mode;
- one expanded rule at a time, with Rule, Why, How to apply, Does not apply to, provenance, override warning, and lifecycle actions;
- no right-side inspector;
- a read-only recall drawer based on `Memory Recall.dc.html`;
- Add/Revise dialog, version history comparison, and approve/reject/retire confirmations;
- explicit empty, loading, error, no-results, malformed-entry, inherited-only, and capacity states.

Use the existing AWS Diatype fonts, Lucide pipeline, semantic colors, focus treatment, Dialog primitive, and workbench layout. Do not add a dependency or copy the prototype runtime.

## Interaction and accessibility

- Search and filters preserve state while dialogs and the recall drawer open.
- Rule headers are buttons with `aria-expanded` and keyboard toggling.
- Status and tier always include text or an icon, never color alone.
- Dialog focus returns to the initiating control.
- Toast-style status messages announce changes without stealing focus.
- High-impact actions use explicit confirmation copy.
- Motion follows the existing reduced-motion configuration.

## UX Testing Lab data

Seed idempotent workspace fixtures through the new Core contract after taking a database backup. Live fixtures remain scoped to `UX Testing Lab`. Global-tier scenarios use a copied test root so test content cannot affect other real workspaces.

The fixture covers active entries, proposals, an override, a missing negative scope, multiple versions, all visible types, recall preview, and review actions.

## Verification

- Core tests cover migration, tier uniqueness, effective recall, append-only revision, proposal approval/rejection, retirement, capacity, filtering, and bridge validation.
- Desktop tests cover contract parsing, routing from the Memory sidebar item, filters, accordion behavior, review mode, recall drawer, dialogs, confirmations, focus, and mutation refresh.
- Run targeted red/green checks while iterating, then the Core and Desktop repository validation entry points.
- Build and package the Desktop app, then compare `UX Testing Lab` at 1440×900 and 1280×800 against the supplied HTML references.

## Non-goals

- No direct SQLite access from Electron.
- No parallel legacy file-backed Memory source.
- No semantic or AI search.
- No automatic approval, retirement, or cleanup.
- No destructive overwrite, delete, restore, or old-version promotion.
- No rejected inspector layout from `Memory Inspector.dc.html`.
