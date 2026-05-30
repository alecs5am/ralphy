# Templates — format map

**Media format** is the primary axis of the template system (issue 052, "everything is a template"). Every `template.yaml` declares a `format`; the 5 persona [categories](CATEGORIES.md) (`b2b-saas/`, `dtc-commerce/`, …) and the `kind` field (`vibe-reference` / `vibe-style`) stay as secondary facets.

> The `format` lives in `template.yaml`, not in the directory layout — slugs still resolve by `ralphy template list / show / use / suggest` regardless of which category folder they sit in. Filter by format with `ralphy template list --format <f>` and `ralphy template suggest "<brief>" --format <f>`.

## General → style

Inside each format, a **general** template is the format's baseline how-to. A **style** template specializes a general one and points at it with `style_of: <general-slug>` (the parent must share the same `format`). A template with no `style_of` is general / standalone. A format that ships only styles and no general baseline is valid — we add general baselines as they prove out.

## Formats

| Format | Definition |
|---|---|
| `video` | Short- or long-form moving-image content — the bulk of the pack. Generated footage (i2v / t2v) cut and composed into a clip. |
| `image` | A single generated still that is the deliverable on its own (not a video frame). |
| `carousel` | A multi-slide swipeable post (Instagram / LinkedIn) where each slide is its own still. |
| `fb-creative` | A Facebook / Meta ad creative — paid-placement static or short video tuned for the ads manager. |
| `motion-design` | Code- / animation-driven motion graphics (kinetic typography, geometric splits, HyperFrames-authored animation) rather than generated camera footage. |
| `poster` | A single high-impact key-art still — drop poster, flyer, album-cover-style hype graphic. |
| `sticker-pack` | A set of die-cut sticker images (e.g. a Telegram pack) sharing one mascot / visual system. |

The list is intentionally extensible: new formats slot into `TEMPLATE_FORMATS` in `cli/lib/schemas/template.ts` without disturbing existing templates.
