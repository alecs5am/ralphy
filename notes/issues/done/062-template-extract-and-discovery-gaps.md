# `template extract` scenario gate + json/yaml discovery divergence

> **Status:** done — 2026-06-14
> **Filed:** 2026-05-30
> **Folder:** issues
> **Severity:** medium
> **Category:** cli / templates

## Context

Surfaced while backfilling templates from recent projects (#058). The
`dev-publish-template` skill (#056) wraps `ralphy template extract`, but two
loader/verb gaps forced both #058 keepers to be authored by hand.

## What

1. **`ralphy template extract` requires `scenario.json`.** Asset-based projects
   (still sets like `free-air-vpn-stickerpack`, and HyperFrames ad projects like
   `odindoma-fb-ad-001`) have no `scenario.json`, so extract refuses. The verb
   should tolerate scenario-less still-set / HyperFrames projects (derive what it
   can from `asset-manifest.json` + `index.html`, skip the scene table).
2. **Discovery uses `template.json`, lint uses `template.yaml`.** The template
   walker (`walkTemplateRoot`) only finds dirs containing `template.json`, while
   `lint:templates` validates `template.yaml`. A `yaml`-only template passes lint
   but is invisible to `template list / show / suggest / use`. #058 shipped BOTH
   manifests per template as a workaround.

## Why it matters

#056's one-shot publish flow can't actually run on most real projects until the
extract verb tolerates scenario-less inputs. The json/yaml divergence means the
`format` taxonomy (#052, defined on `template.yaml`) and the CLI discovery
surface can silently drift — a template can lint-pass yet be undiscoverable.

## Notes

- Decide the single source of truth: `template.yaml` (the #052 schema) should be
  it; `template.json` is the legacy auto-migrated form. Make `walkTemplateRoot`
  accept a `template.yaml`-only dir, then deprecate the dual-manifest requirement.
- Cross-ref `033` (extract verb), `056` (publish skill), `052` (format schema).
