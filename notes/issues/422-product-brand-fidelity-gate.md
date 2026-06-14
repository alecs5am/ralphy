# Product and brand fidelity gate

> **Status:** issue
> **Filed:** 2026-06-14
> **Folder:** issues

## Context

Commercial postmortems show fidelity as a recurring blocker: Flipper product colors drifted before canonical refs were pulled, Glitter Cream label style and jar/face geometry drifted, App Store screenshots needed real competitor/product refs, and site-grounding exists because agents otherwise invent SDKs, palettes, and copy.

## What

Add a dedicated product/brand fidelity gate that validates whether generated content preserves the real product, brand assets, claims, packaging, UI, logo, and allowed proof points before a Unit can ship.

## Why it matters

For commercial content, a beautiful but wrong product is a failure. Product fidelity should be a blocker, not a soft visual note inside a generic eval report.

## Scope / acceptance

- Define a fidelity report with product identity, packaging/logo match, color/palette match, UI/API claim accuracy, prohibited claims, and required refs.
- Use product/brand facts from #416 and reference packs from #426.
- Make the gate run before final Unit formation for commercial modes.
- Add mode-specific checks for product-shot, lifestyle-scene, UGC review, tutorial UGC, App Store/image-pack, and ad-creative-pack.
- Native-video eval should include product-in-frame and product-action continuity when video is involved.
- The gate must block ship-ready status when a named product/brand is materially wrong.

## Notes

- Related: #014 site-grounding, #416 research bootstrap, #411 native video validation, and #427 readiness scorecard.
