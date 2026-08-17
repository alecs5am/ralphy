# Project View and Social Unit Previews

## Status

Approved in conversation on 2026-08-17. This spec supersedes the Project View
presentation in `2026-08-17-project-tabs-responsive-redesign.md` where the two
documents differ. Existing controller safety, paging, mutations, IPC trust
boundaries, and unsaved-document guards remain unchanged unless this spec
explicitly names a change.

## Goal

Make the desktop Project View visually calm and immediately readable, keep the
Overview within one normal desktop viewport, reproduce the approved Gooey tabs,
fix document format presentation, and replace the Units master/detail screen
with a media-like grid and social-platform preview dialog.

Verification uses workspace `UX Testing Lab` and project `UX Tester`.

## Constraints

- Work only in `ralphy-desktop`; use the installed Ralphy CLI contract rather
  than importing source from a sibling checkout.
- Add no package. Reuse React, Radix Dialog, the existing preview components,
  and the existing Core methods `unit.items`, `unit.presentations`, and
  `unit.preview`.
- Preserve current Project paging, scroll memory, document edit/conflict
  handling, revision selection, and mutation behavior.
- Treat attached handoff HTML as a visual specification, not production code.
- Do not fabricate stored presentation data. A social shell may render safe
  defaults when a presentation is absent, but stored crop, safe-area, caption,
  and options always win when present.

## Shared Selection Language

Scope the selection change to `.project-region`. Selected rows, cards, and
revision controls use the existing selected surface plus a one-pixel neutral
inset edge. Remove the current two-pixel purple selection ring from Project
content. Keyboard focus remains a visible two-pixel accent ring and must not be
merged with selection state.

The change applies consistently to Documents, Media, Compositions, Units, and
their revision controls. Hover and selection must not change geometry.

## Gooey Tabs

Create one small reusable `GooeyTabs` component with the two approved presets:

- `M`: 104x28 cells, radius 9, three-pixel track padding, 12px text.
- `S`: 92x26 cells, radius 8, three-pixel track padding, 12px text.

The project navigation uses `M` and keeps the current labels: Overview,
Documents, Media, Compositions, Units, and Activity. Unit social-platform tabs
use `S`. Counts remain optional because current pages do not expose reliable
totals.

Two background blobs move with 300ms and 480ms durations through the approved
SVG goo filter. Text sits outside the filtered layer. Arrow keys, Home, End,
`role=tablist`, `role=tab`, roving tab index, and `aria-selected` remain intact.
`prefers-reduced-motion` disables the filter and uses one short sliding surface.
At narrow widths the track scrolls horizontally instead of shrinking cells.

## Overview

The Overview becomes a fixed-height desktop dashboard rather than a long
activity report. Its normal 2K and 1440px layouts contain:

1. A compact six-metric strip using the current publication and engagement
   totals.
2. A Project pulse card with state, active iteration, updated date, spend, and
   counts of open feedback, active/running work, and failed/cancelled work.
3. A Ready Units area showing up to four selected Units as compact cards with
   format, selected/latest state, and a type-appropriate visual treatment.
4. A compact Distribution summary showing platform and publication state.

Remove the long Production stream, nested Deliverables lists, build list, and
Recent activity list from Overview. Their full data remains available in the
existing dedicated tabs. Empty sections collapse instead of reserving space.
Small windows may scroll; the normal desktop target must not.

## Documents

Keep the current master/detail behavior and document editing. Match the handoff
composition:

- A compact left rail with sticky search, small content/file thumbnail, title,
  actual format, kind, and updated date.
- A calm right document surface with a compact sticky identity row and
  Render/Source segmented control.
- Render mode uses the existing Markdown/JSON/text viewers; Source mode exposes
  the current editor/source presentation without changing save semantics.
- The readable document body remains centered within the flexible right pane.

### Format bug root cause

`document.list` returns `DocumentDto`, which has no revision format. The current
UI guesses from slug/title and therefore shows `DOC` until `document.show`
loads the active row.

Inside the desktop reader, enrich each returned document page with its exact
`document.show` detail before marking the page ready. Cache by document ID and
`currentRevisionId`, so pagination and reloads do not repeat unchanged detail
requests. The renderer then reads `currentRevision.format` for every row and
never guesses from the title. This stays inside the desktop repository and does
not change the Core contract.

## Unit Model in the UI

For rendering, a Unit is:

```ts
type UnitContent = {
  unit: UnitDto;
  revision: UnitRevisionDto;
  media: UnitMedia[];
  presentations: UnitPresentationDto[];
};
```

`media` is the ordered array produced from `unit.items`. Artifact items resolve
through the existing artifact preview path; document items resolve through the
existing document preview path. Each resolved item carries its role and its
actual media kind derived from MIME or document format. The Unit `format`
chooses the social variant; the media array supplies its content.

## Units Grid

Replace the master/detail split with a responsive grid using the established
Media-card rhythm. Each card shows the first useful media preview, Unit slug,
Unit format/type, and selected/latest revision state.

Card previews load lazily only when a card approaches the viewport and cache by
Unit ID plus revision ID. A failed thumbnail shows a compact type fallback and
does not prevent opening the Unit. Single click selects the card; double click
opens the dialog. Keyboard Enter opens the selected card so double-click is not
the only accessible path.

## Unit Preview Dialog

Use the installed Radix Dialog and the existing media/document renderers. The
dialog contains:

- Unit identity and format.
- One revision dropdown ordered newest first, with Selected and Latest labels.
- The existing "Make selected" mutation when the inspected sealed revision is
  not selected.
- Compact Gooey platform tabs.
- A primary social preview surface and a small metadata area for caption,
  crop, safe-area, and options when available.

Changing the revision rebuilds the media array and available presentation data.
Changing a platform loads `unit.preview` lazily for that revision and platform.
Dialog close restores focus to its card.

## Social Preview Components

Use React composition rather than class inheritance. Platform chrome is owned
by a base shell; content variants insert the Unit media array:

```tsx
function TikTokVideo(props: SocialPreviewProps) {
  return <TikTokShell><VerticalVideo {...props} /></TikTokShell>;
}

function TikTokCarousel(props: SocialPreviewProps) {
  return <TikTokShell><Carousel {...props} /></TikTokShell>;
}

function InstagramReels(props: SocialPreviewProps) {
  return <InstagramShell><VerticalVideo {...props} /></InstagramShell>;
}

function InstagramPost(props: SocialPreviewProps) {
  return <InstagramShell><SquarePost {...props} /></InstagramShell>;
}
```

A small registry maps `platform + unit.format` to a component. Initial supported
formats match `UX Testing Lab`:

| Unit format | Automatic preview targets |
|---|---|
| `video` | TikTok Video, Instagram Reels, YouTube Shorts |
| `carousel` | TikTok Carousel, Instagram Carousel, LinkedIn Carousel, Pinterest Pin |
| `audio` | TikTok Video, Instagram Reels, YouTube Shorts using cover/waveform treatment |

Actual `unit.presentations` enrich these targets and may add a supported
platform. Unknown formats use one generic Unit preview rather than speculative
platform UI. Adding a new format later means adding one registry entry and only
the missing content variant; it does not require another modal or data flow.

The social shells reproduce recognizable layout, aspect ratio, safe areas, and
control placement. They are previews, not pixel-for-pixel clones of proprietary
apps, and do not contain outbound posting actions.

## Data Flow

1. Units page loads the existing `unit.list` page.
2. Visible cards lazily resolve the selected revision's first previewable item.
3. Opening a card loads the revision, all paged Unit items and presentations,
   and resolves the ordered media array.
4. The registry derives automatic platform targets from `unit.format`.
5. Selecting a platform combines the chosen shell, media array, and any exact
   `unit.preview` presentation metadata.
6. Revision changes invalidate only the Unit-content/dialog cache for that
   Unit; list paging and other tabs remain untouched.

Stale async results must be ignored when the dialog closes, the Unit changes,
or the revision changes. Preview URLs and media players follow existing cleanup
behavior.

## Error and Empty States

- A failed document-detail enrichment keeps the list usable and displays an
  unknown format marker for only that row; retrying the page retries enrichment.
- A Unit with no selected revision uses latest; a Unit with neither shows an
  empty card and cannot open a social preview.
- A failed media item does not hide the rest of the ordered media array.
- Missing `unit.preview` metadata falls back to the shell defaults while still
  rendering resolved Unit media.
- Unknown platform/format combinations use the generic preview.

## Testing and Verification

Implement with focused failing tests first:

- Gooey tab semantics, keyboard movement, geometry markers, and reduced-motion
  fallback.
- Project-scoped neutral selection and preserved focus visibility.
- Overview omits long feeds and fits the desktop geometry fixture.
- Documents show correct formats before row selection and preserve editing,
  search, paging, and conflict behavior.
- Unit format-to-platform registry, ordered media resolution, lazy card preview,
  double-click/Enter dialog opening, revision dropdown, platform switching,
  stale-result protection, and focus restoration.

Then run focused Project tests, `bun run typecheck`, the full test suite, and
`bun run build`. Finish with a visual pass through Overview, Documents, and all
four Units in `UX Testing Lab`, including video, carousel, and audio previews.

## Non-goals

- No publishing, editing, or generation action inside social previews.
- No persisted screenshot cache or new database table.
- No new cross-repository contract.
- No generic design-system rewrite outside Project View.
- No speculative shells for Unit formats absent from the current desktop data.
