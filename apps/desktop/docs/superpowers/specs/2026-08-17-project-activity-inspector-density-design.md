# Project Activity Inspector and Dense Lists Design

## Goal

Make the Documents, Compositions, Units, Media, and Activity project tabs feel intentionally dense and inspectable on a 2K desktop display without changing the Ralphy core contract.

## Scope

This design changes only `ralphy-desktop`:

- contain selection and focus visuals inside virtualized lists;
- increase useful row density in Documents, Compositions, and Units;
- compact the Composition and Unit revision rails;
- center compact audio controls inside Media cards;
- replace the read-only Activity timeline with a filterable log table and right-side event inspector;
- enrich run events through the existing `run.show` and `run.attempts` bridge methods.

The Ralphy CLI protocol and the `ActivityDto` wire shape remain unchanged.

## Dense List Geometry

Documents, Compositions, and Units use one shared visual rhythm:

- 4 px protected space before the first and after the last virtual row;
- 6 px vertical separation between interactive row surfaces;
- 6 px horizontal inset so selection and focus rings remain visible;
- 50–54 px row surfaces with a primary and secondary line;
- compact 24 px file/status badges;
- hover is applied only to unselected rows;
- selected rows keep a stable background and inset selection ring.

The virtualizer's total canvas includes the protected top and bottom space. Rows are translated by their virtual start plus the top inset, so the first ring never intersects the scroll container edge. The same rule applies to the horizontal Composition revision rail: its virtual canvas includes leading and trailing space, and revision cards are separated by 6 px.

Unit revisions keep flex layout but use the same 4 px edge protection, 6 px gap, compact height, and contained ring. This avoids introducing another virtualizer for a short list.

## Media Audio Cards

Compact audio previews fill their masonry preview area and center the player vertically. The play button, status line, waveform, and seek control form one centered group rather than being pinned to the top. The full media viewer retains its existing large audio layout.

The Media card caption remains outside the preview, so the compact waveform does not repeat the full filename as a dominant heading. Loading, unavailable, and duration text stay visible as small secondary status.

## Activity Layout

Activity becomes a two-pane log workspace.

The left pane contains:

- a compact toolbar with free-text search;
- a source filter with `All`, `Ralphy`, `Generations`, and `Production`;
- a model filter populated from enriched run events;
- a virtualized table with columns `Time`, `Source`, `Event`, `Entity`, `Model`, and `Cost`.

Rows are buttons with table semantics. Clicking or pressing Enter selects an event and opens the inspector. Arrow Up and Arrow Down move the selection between visible filtered rows. The selected row retains a contained selection ring.

Source classification is deterministic:

- `Generations`: run or generation entities/actions;
- `Production`: documents, compositions, units, iterations, feedback, builds, and publications;
- `Ralphy`: project, workspace, system, migration, repair, and otherwise unclassified events.

System rows use the bundled Ralphy mascot. Enriched generation rows use the bundled LobeHub model icon through the existing `AiBrandIcon`; unresolved generation rows use a neutral generation glyph until metadata arrives. Production rows use entity-specific Lucide icons.

## Event Enrichment

`ActivityDto` contains identifiers and timestamps but no model or cost. Desktop adds an internal `loadProjectActivityDetail(project, event)` adapter method.

For `run` events the adapter:

1. validates the project and run identifier;
2. calls `run.show`;
3. calls `run.attempts` for the first bounded page;
4. returns run state, label, duration, attempts, distinct providers/models, and the sum of known attempt costs.

For non-run events it returns the base event without extra network work.

The Activity component requests enrichment only for visible run rows and the selected row. Results and in-flight promises are cached by `entityId` for the life of the project screen. Failed enrichment leaves the base event usable and exposes a retry action in the inspector; it never blocks the log table.

No generation prompts, provider payloads, credentials, or unrestricted raw objects are displayed.

## Inspector

The right pane is 360–420 px on wide screens and opens only after an event is selected. It contains:

- event title, icon, source, and close button;
- metric cards for state, duration, model/provider, and known cost when available;
- Overview fields: action, entity type, entity ID, sequence, and timestamp;
- Run fields: run label/kind/state and start/end timestamps;
- Attempts table: attempt number, provider, model, state, and cost;
- a retry state when enrichment fails.

At project-domain widths below 900 px the inspector becomes an overlay drawer anchored to the right. Below 640 px it fills the project content width. Escape closes it and focus returns to the selected row.

## Filtering and Empty States

Search matches action, entity type, entity ID, source, provider, and model. Source filtering works immediately from the base activity event. Model choices appear as run enrichment completes; choosing a model includes only rows with that resolved model.

If filters remove every row, the table displays a compact `No activity matches these filters.` state without clearing the current Activity page or cursor. Infinite cursor loading continues against the unfiltered page.

## Accessibility

- Toolbar controls have visible labels or accessible names.
- The log uses `role="table"`, column headers, and `role="row"` event buttons.
- Selection uses `aria-selected` and the inspector is labelled by its heading.
- Icons are decorative when adjacent text supplies meaning.
- Focus rings are at least 2 px and remain fully inside scroll containers.
- Escape closes the inspector and keyboard row navigation does not steal normal Tab traversal.

## Testing

Tests cover:

- virtual row top/bottom containment and at least 6 px separation at 2560, 1360, and 1100 px;
- compact row density relative to the previous 64–76 px estimates;
- Composition and Unit revision edge containment and spacing;
- compact audio centering without changing the full viewer layout;
- source classification and model icon selection;
- Activity filtering, selection, keyboard navigation, inspector open/close, loading, error, and retry;
- run enrichment validation, bounded attempt loading, derived cost, and absence of sensitive payload fields;
- preservation of Activity cursor loading and remembered scroll;
- full typecheck, test suite, production build, and visual QA on DentiAI at 2K and half-width.

## Non-Goals

- changing the Ralphy core activity event schema;
- storing enriched activity details in the project database;
- building charts or provider latency telemetry not exposed by the current contract;
- loading every historical run before the user scrolls to it;
- adding a new icon dependency or runtime icon CDN.
