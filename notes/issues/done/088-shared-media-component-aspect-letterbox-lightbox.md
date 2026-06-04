# Shared `<Media>` component — aspect-preserving, letterboxed, click-to-lightbox

> **Status:** done — 2026-06-04 (Media.tsx: aspect-locked box + object-fit:contain with bg-tint cinema bars, fit="cover" escape hatch, shadcn-dialog single-item lightbox; routed AssetMedia img/video + RecipeDetail demo + UnitViewer + UnitTile MediaCell; audio branch left for #091, gallery Lightbox kept intact; next build green)
> **Filed:** 2026-06-04
> **Folder:** issues
> **Severity:** high
> **Category:** landing / frontend / design-system

## Context

Image/video rendering is duplicated across every library page (AssetMedia, the
block-page proof, RecipeDetail demo, UnitViewer, unit tiles, blueprint modal),
with per-page sizing rules that drift (we just fixed several native-dimension
bugs). The user wants ONE `<Media>` component used everywhere a picture or video
appears in the library.

## What

A single `<Media>` component for images + videos with two hard behaviors:

1. **Aspect-preserving fit into any slot.** When the host slot's aspect differs
   from the media's intrinsic aspect, show the WHOLE media (never crop) and fill
   the remaining space with cinema-style bars: a 9:16 image in a 1:1 slot gets
   pillarbox bars left/right; a 16:9 image in a 9:16 slot gets letterbox bars
   top/bottom. Works for ALL format aspects. (object-fit: contain inside a sized,
   aspect-locked box with a tinted bar background — no crop, no distortion.)
2. **Click → lightbox modal preview.** Clicking the media opens a modal (shadcn
   dialog, #087) showing it large (capped to viewport, contain). Reuse / unify the
   existing `_shared/Lightbox.tsx`.

Props: `src`, `kind` ("image"|"video"), intrinsic `aspect`, the slot/display
aspect, optional `poster`, `controls`/`autoplay` for video, `lightbox` toggle.

## Why it matters

Kills the per-page media divergence (the source of the sizing/placeholder bugs),
gives consistent cinema-bar framing for mixed aspects, and makes click-to-preview
universal. One component to fix once.

## Scope / acceptance

- `landing/app/library/_shared/Media.tsx` (+ tokens/classes), built on shadcn
  dialog + aspect-ratio.
- AssetMedia, the block-page proof, RecipeDetail demo media, UnitViewer, unit
  tiles, blueprint-modal media all RENDER THROUGH `<Media>` (remove their bespoke
  `<img>/<video>` + sizing). Single-source the fit + lightbox.
- A 9:16 image in a 1:1 tile shows full image + side bars; a 16:9 in a 9:16 shows
  top/bottom bars — verified on real blocks.
- No native-dimension rendering anywhere; `bunx next build` green; no borders.

## Notes

- Depends on #087. Consumed by #089 (UnitCard) + #092/#093/#094. Part of #086.
- Supersedes the ad-hoc caps added in the recent sizing fix (AssetMedia max-height,
  rx-media, etc) — fold those into `<Media>`.
