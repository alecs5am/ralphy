# Universal media artifact model

> **Status:** done — 2026-06-23 (schema + builder + test + design doc landed)
> **Filed:** 2026-06-15
> **Folder:** issues
> **Severity:** high
> **Category:** media-model / units

## Context

The ideal state is "any media content in any quantity." Current Ralphy concepts
are strongest for video, still images, carousels, and HyperFrames compositions,
but future work may include audio-only cuts, websites, slide decks, documents,
interactive previews, 3D/WebGL scenes, game-like media, or mixed deliverables.

## What

Define a universal media artifact model that lets projects, Units, provenance,
eval, distribution, and library entities describe arbitrary media outputs
without hardcoding every workflow to `mp4` or `png`.

## Why it matters

Open-world content production needs a stable way to represent new artifact
types. Without it, every new mode invents its own folder conventions, metadata,
eval rules, and packaging behavior.

## Scope / acceptance

1. **Artifact taxonomy.** Define artifact kinds and capabilities: image, video,
   audio, captions, document, slide deck, HTML/interactive, data, ref, package,
   and custom extension.
2. **Metadata contract.** Every artifact can carry path/URI, mime type, duration,
   dimensions, text tracks, source, role, slot, model/provider, cost, and
   provenance links where applicable.
3. **Unit integration.** `unit.json` can list heterogeneous media while preserving
   ordering, roles, selected variants, and distribution outputs.
4. **Eval mapping.** Gate registry can map artifact kinds to applicable quality
   checks.
5. **Distribution mapping.** Distribution packs can package mixed artifacts.
6. **Migration plan.** Document how current artifact manifests map into the new
   model without breaking append-only history.
7. **Fixtures.** Cover video Unit, image pack, carousel, audio-only clip pack,
   and HTML/motion-design Unit.

## Dependencies and linked work

- Unit provenance: #420.
- Distribution factory: #458.
- Open-world modes: #454.
- Library flywheel: #459.

## Notes

- Keep this as schema/adapter work first. Do not rewrite all project storage in
  one risky migration.
