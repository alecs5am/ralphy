# Unified Units Production Workbench

## Goal

Make Units the only project-level production destination. A Unit is visible as soon as production starts, owns the user-facing version and selection lifecycle, and resolves linked Composition data without copying it.

## Core contract

- `UnitDto.compositionId: string | null` is the stable optional production identity link.
- `UnitRevisionDto.compositionRevisionId: string | null` is the optional version-level production link.
- Direct artifact and document Units keep both links null and continue to use Unit items.
- `unit.create` creates an empty Unit identity, optionally linked to a Composition. Empty Units are valid and represent work in progress.
- `unit.revise` accepts `compositionRevisionId`. A revision may contain Unit items, a Composition revision link, or both.
- Core validates that linked Composition entities belong to the same project as the Unit. Links are immutable.
- Selecting a linked Unit revision requires its Composition revision to be sealed.
- Existing Unit and Composition records migrate with null links.

## Desktop information architecture

Top-level project tabs are `Overview`, `Documents`, `Media`, `Units`, and `Activity`. Composition remains an internal production entity and is never a peer navigation destination.

Units use one responsive master/detail workbench. The master shows every Unit, including identities without revisions, with format and lifecycle status. The detail shows the inspected Unit revision, a visible revision rail, selected/latest badges, preview, and one primary next action. On narrow windows the panes stack while preserving the same reading and keyboard order.

Linked Composition engine data, inputs, sources, builds, outputs, and identifiers appear only inside a native `Production details` disclosure. Direct artifact/document Units omit Composition-only sections.

## Lifecycle derivation

Status is derived, not stored in Desktop:

| Condition | Status | Primary action |
|---|---|---|
| Unit has no revision, or linked Composition revision is draft | In progress | None |
| Inspected revision is complete but not selected | Preview ready | Select version |
| Inspected revision is selected and has no final build | Selected | Render final |
| Latest build is pending/running | Rendering | Disabled progress |
| Latest build failed/cancelled | Render failed | Retry render |
| Selected linked revision has a successful build, or selected direct Unit is sealed | Ready | None |
| Project overview contains a published publication for the Unit | Published | None |

`latest` and `selected` remain independent badges. Selecting another revision never deletes build history; that revision becomes Ready only after its own successful build.

## Navigation and failure behavior

- Existing Overview links open Units only. Composition data without a linked Unit is not guessed or matched by slug.
- Loading and mutation controls expose visible progress and disable duplicate actions.
- Local read failures keep the last usable list/detail and offer Retry.
- Documents and Media component trees and layouts are unchanged.

## Accessibility and responsive behavior

- Tabs, Unit rows, revision controls, disclosure, selection, and render actions are keyboard reachable.
- Status uses text in addition to color.
- The active Unit and revision expose `aria-current` or `aria-pressed` state.
- Focus remains visible; reduced-motion behavior continues to use the existing design tokens.
- Wide layout has master and detail scroll owners; narrow layout uses one vertical document flow without horizontal overflow.

## Verification

- Core migration and contract integration tests cover link scope, direct Units, empty in-progress Units, selection guards, and bridge DTO shape.
- Desktop contract tests cover exact DTO validation.
- Component/controller tests cover tab removal, linked production loading, lifecycle actions, direct Units, loading/error states, and responsive CSS.
- Run the Core targeted tests, Desktop targeted tests, `bun run build`, then exercise the `UX Testing lab` workspace with draft, selected, rendering/failed, ready, direct-document, and published examples.
