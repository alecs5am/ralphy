# Usable Media And Targeted Workspace Migration

## Status

Approved in conversation on 2026-08-10.

This design finishes the current Core-backed Desktop structure. It does not
restore the old filesystem-first application structure and does not introduce a
new UI framework. New and repaired surfaces reuse the established Ralphy Media
visual language and interaction components.

## Goals

- Make the current Workspace and Project structure pleasant and usable.
- Restore a visual, virtualized media grid and an accessible modal viewer.
- Show safe generation provenance for a selected media item.
- Preserve generation inputs for new local generations when they are safe to
  retain and display.
- Manually recover only the complete Denti AI and Nightmaker workspaces.
- Leave every other historical workspace and its files untouched.

## Non-goals

- No rollback to the old scanner, raw-path renderer contract, or filesystem
  source of truth.
- No new component library, Tailwind migration, or second design system.
- No global historical Repair framework or reusable migration command.
- No guessed generation relationships, provider payloads, credentials, raw
  requests/responses, or external resource identifiers in the renderer.
- No deletion of historical files or ambiguous records.
- No automatic migration of workspaces other than Denti AI and Nightmaker.

## Product Structure

Keep the current application structure intact:

- Workspace and Project routes remain Core-backed.
- Project keeps its six domain tabs and existing controller/state boundaries.
- Cursor pagination, filters, root epochs, stale-response fences, and trusted
  main-process media URLs remain authoritative.
- The work is a presentation and capability completion, not a navigation or
  information-architecture rollback.

## Visual Language

Reuse the established system in `tokens.css` and `workbench.css`:

- graphite `--canvas`, `--panel-solid`, `--raised`, `--hover`, and
  `--selected` surfaces;
- AWS Diatype and AWS Diatype Mono roles;
- existing spacing, type, motion, focus, shadow, and radius tokens;
- native `corner-shape: squircle` for raised cards, previews, controls, and
  dialogs, while pills remain round;
- structural rules only between application regions, metrics, and tabular
  structure. Lists use surface and hover hierarchy rather than recursive
  borders.

The current Workspace and Project markup stays. Repair its presentation by:

- removing the undefined `--surface` use;
- making each screen own one outer scroll container;
- removing card-inside-list-inside-card borders and duplicate padding;
- reusing the existing metrics band, content sections, segmented modes,
  filter chips, select menu, command buttons, section headings, and project
  card presentation where they fit the current structure;
- applying the established smooth-corner selectors to every active raised
  surface;
- keeping controls keyboard reachable with visible focus.

Documents and Compositions keep their current domain behavior. They receive
the same established fields, buttons, headings, spacing, inline errors, and
raised selected-detail surface instead of raw browser controls or nested card
scaffolding.

## Media Grid

Keep `media.list`, its 50-item cursor page, current filters, explicit Load more,
and `VirtualAssetGrid`. Adapt the former visual tile instead of restoring its
raw-path behavior.

Each tile has:

- deterministic 16:10 preview geometry;
- real image and video preview when the immutable media target is resolvable;
- a bounded audio waveform only when its existing byte ceiling permits it;
- MIME/type fallback glyphs when preview is unavailable;
- title/identifier copy, type/status, generation/cost badges when known;
- the established hover state, selection ring, and smooth corners.

Only mounted virtual tiles request preview URLs. Reuse the former small
concurrency scheduler and cache by immutable media target plus root epoch.
Unmounting cancels publication of late results. Filter, project, and root
changes invalidate the cache lifetime. The renderer never receives a path;
main continues resolving trusted locators and minting `ralphy-media://` URLs.

One click selects a tile. Double-click and an explicit keyboard-reachable Open
button open the viewer. A preview failure leaves a usable fallback tile and
does not affect selection or pagination.

## Modal Viewer And Inspector

Reuse the former Radix Dialog shell, existing modal CSS, Motion treatment, and
the surviving `ImageViewport`, `VideoPlayer`, `AudioWaveform`, and Markdown
preview primitives. Do not restore Finder, Trash, drag, raw paths, annotation,
or agent-feedback actions.

The modal provides:

- accessible title, description, Close control, Escape handling, focus trap,
  and focus return;
- previous/next navigation over only the currently loaded filtered items;
- disabled navigation at loaded page boundaries rather than implicit page
  draining;
- a large preview stage and one inspector surface;
- independent loading, error, retry, and stale-response handling for preview
  and generation details.

The inspector shows, when available:

- whether the item is a generation;
- run state and attempt state;
- provider and model;
- known cost and whether the total is complete;
- generation time;
- prompt, text, and negative prompt as escaped plain text;
- a closed set of safe generation parameters.

An Artifact without a selected revision is not a dead end. The modal uses the
existing scoped `media.revisions` and null-aware `media.select` contracts to
show its revisions and let the user choose one. Successful selection refreshes
the card, preview, and provenance; a conflict reloads the current revisions and
does not retry the mutation automatically.

Long user-authored text is collapsed with Show full and Copy. Historical
values that were never stored render as `Not recorded`; null cost is unknown,
never `$0.00`.

## Generation Detail Contract

Do not add provenance to `media.list`. Add one on-demand, scoped read method for
an immutable target:

```ts
type MediaGenerationTarget =
  | { type: "artifact-revision"; id: string }
  | { type: "run-object"; id: string };
```

`media.generation.show` authorizes the target first, resolves exactly zero or
one producing Run, and returns one of:

- `generation`: safe Run facts, paged attempts, cost completeness, and the
  versioned safe input projection;
- `not-generation`: a proven producer that is not a generation;
- `unknown`: provenance was not recorded or is ambiguous.

ArtifactRevision provenance uses exact reverse `run_results` ownership.
RunObject provenance uses its direct Run. Multiple possible producers return
`unknown`; Core never picks the latest candidate. Raw Object cards do not get
reverse-guessed provenance.

Public attempts retain provider, model, state, timestamps, and cost. The new
input projection is parsed only from a closed, versioned shape:

```ts
type GenerationInput = {
  version: 1;
  texts: Array<{
    role: "prompt" | "text" | "negative-prompt";
    value: string;
    truncated: boolean;
  }>;
  parameters: Array<{
    name: GenerationParameterName;
    value: string | number | boolean;
  }>;
};
```

The parameter name union contains only reviewed non-secret facts such as size,
duration, aspect ratio, resolution, audio booleans, reference counts,
first/last-frame presence, voice presence, numeric voice controls, music
controls, language, and backend. It never contains paths, URLs, data URIs,
credentials, notes, provider responses/errors, external IDs, or arbitrary
metadata. Prompt-like text is UTF-8 bounded and displayed only in the selected
item modal.

New generation commands persist this projection locally in the existing
attempt request storage. Existing legacy attempt payloads remain private and
yield `Not recorded`. The current portable Workspace export does not promise
Run/Attempt export, so the UI describes this as local generation history.

## Targeted Manual Workspace Recovery

The only authorized live targets are:

- Denti AI: `ws_0f2fd33c-bfc6-4a75-83b4-2e1966aafe9f`;
- Nightmaker: `ws_65e3b770-7fa7-4532-87e8-f7c4ff02e0c1`.

The exact case-sensitive `.DS_Store` ghost shapes remain filtered and are not
migration targets. Other workspaces are outside the read/write scope beyond a
top-level identity check.

This is an agent-operated maintenance action, not product code:

1. Stop the packaged app and Core processes.
2. Create and verify a fresh recovery backup under `.ralphy/recovery`.
3. Record integrity, foreign-key, schema, target Workspace, and target Project
   evidence before any write.
4. Assign one agent to Denti AI and one to Nightmaker. Each agent applies
   guarded existing SQL/Core primitives in small Project transactions.
5. A third agent performs read-only independent verification and does not share
   mutation responsibility.
6. Store any one-off evidence, transaction transcript, or exact SQL material
   only under `.ralphy`; do not add a migration script to either repository.

Current evidence authorizes recovery of:

- 7 Compositions;
- 107 CompositionRevisions and 107 source files;
- 67 exact generation Run/Attempt/Build/Output/Result chains;
- deterministic Document Project bindings and selected Artifact/Unit pointers
  only where ownership and revision choice are exact.

Forty non-exact generation candidates remain ordinary historical media. They
are not linked to Builds or labeled as generations. One Composition without a
provable root selection remains unselected for the user. No historical file or
ambiguous row is deleted.

Each Project transaction must be fresh, scoped, referentially valid, and
repeat-observable as a no-op. Failure stops that Workspace immediately; the
backup and failed-state evidence are preserved for inspection rather than
automatically retried.

## Delivery Order

1. Core: safe generation input persistence and `media.generation.show`.
2. Desktop: current-structure visual cleanup, virtual tiles, modal, inspector,
   IPC boundary, and stale-state handling.
3. Build and package the app against the reviewed Core contract.
4. Stop the app and manually recover Denti AI and Nightmaker.
5. Run independent database verification.
6. Smoke-test the packaged app on both workspaces and leave the repository
   clean, with all temporary work under `.ralphy`.

## Verification

Keep product tests narrow and behavioral:

- the virtual grid resolves only mounted tiles, respects concurrency/cache,
  does not overlap, and performs no hidden page drain;
- selection, double-click/Open, modal focus/Escape, loaded-item navigation,
  loading/error/retry, and stale-root behavior;
- provider/model/cost/input rendering, `Not recorded`, prompt escaping and
  bounds, and explicit privacy-field bans;
- trusted IPC sender/root/ref validation and no path exposure;
- one outer scroll owner, no horizontal overflow at 1360x860 and 1100x720,
  structural borders only, current smooth-corner surfaces, and round pills;
- Documents and Compositions retain their existing behavior while using the
  established controls.

The one-off migration is verified by live pre/post invariants instead of a new
general migration test framework:

- exact Workspace/Project scope;
- exact row ownership and immutable source/output binding;
- selected pointers refer to valid in-scope revisions;
- no guessed generation relationship;
- foreign keys and integrity remain clean;
- non-target Workspace counts and digests remain unchanged;
- referenced files exist, are regular non-symlink files, and match recorded
  sizes;
- the independent verifier reproduces the approved 7/107/67 recovery facts.

Final acceptance requires Core tests/lint/build, Desktop typecheck/tests/build,
packaging and launch smoke, plus manual UI QA in both recovered workspaces:
Projects, Documents, Media grid, image/video/audio playback, modal navigation,
generation details, and Compositions.
