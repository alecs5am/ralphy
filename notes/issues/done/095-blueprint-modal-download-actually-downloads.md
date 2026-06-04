# Blueprint modal — download buttons must download, not navigate

> **Status:** done — 2026-06-04 (new DownloadAssetLink client component: blob-fetch + createObjectURL + programmatic anchor click forces a true save for the cross-origin Supabase Storage URLs where the download attr is ignored; falls back to new-tab on CORS; AssetRow routes through it; next build green)
> **Filed:** 2026-06-04
> **Folder:** issues
> **Severity:** medium
> **Category:** landing / frontend / UX

## Context

In the Blueprint modal (unit page), the hard-asset "Download" actions are plain
links to the Storage URL — clicking opens the file in the SAME tab (navigates away
from the library) instead of downloading. That breaks the expected download UX.

## What

Make the Blueprint hard-asset download actions actually download the file:
- add the `download` attribute (and a filename) to the anchor, and/or fetch the
  blob + trigger a save, so the click saves the file rather than navigating.
- at minimum open in a new tab (`target="_blank" rel="noopener"`) so the library
  context is preserved — but a true download is the goal.
- Cross-origin note: the assets live on Supabase Storage (different origin), where
  the HTML5 `download` attribute is ignored for cross-origin URLs — so use a
  blob-fetch + `URL.createObjectURL` + programmatic anchor click to force the save
  (the only reliable cross-origin download path).

## Why it matters

"Download" that navigates away is a broken expectation; users expect a file save.

## Scope / acceptance

- Clicking a Blueprint hard-asset "Download" saves the file (blob-fetch path for
  the cross-origin Storage URLs), staying on the page.
- Applies to every download affordance in the Blueprint modal / panel.
- `bunx next build` green.

## Notes

- Touches `BlueprintPanel`/`BlueprintModal` (the asset download links). Part of #086.
