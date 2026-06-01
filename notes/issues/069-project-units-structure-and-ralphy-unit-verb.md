# Project-local `units/` + a `ralphy unit` command

> **Status:** todo
> **Filed:** 2026-06-01
> **Folder:** issues
> **Severity:** high (foundational — the project-side half of the Unit model)
> **Category:** cli / project-structure

## Context

The library has a first-class **Unit** entity now (#063), but a *workspace project*
has no place for finished deliverables. `assets/` is an append-only working dump
(every `.v2/.v3`, rejects, scratch) — "рабочая свалка". So users hand-make ad-hoc
folders: `free-air-vpn-stickerpack/` already has `stickers/` + `stickers-no-outline/`
at the project root, created by hand. That ad-hoc folder IS a Unit, just informal.

## What

Add a curated **`units/`** layer to the project structure + a `ralphy unit` verb to
form units from selected assets (it COPIES — self-contained, append-only-safe).

```
workspace/projects/<id>/
├── assets/                 # raw working dump (unchanged; append-only, versioned)
└── units/                  # NEW: curated deliverables, append-only
    └── <unit-slug>/
        ├── unit.json
        └── <ordered media files>
```

`unit.json` mirrors the library-v2 graph so publish (#056) is mechanical:
```json
{ "slug": "stickers-outline", "format": "sticker-pack",
  "media": ["01-hi-beg.png", "…"],
  "provenance": { "template": "sticker-set", "style": "risograph",
                  "recipes": ["bloom"], "assets": ["vpn-mascot"] },
  "source_assets": ["assets/images/outline-01.png", "…"],
  "created": "2026-06-01" }
```

`ralphy unit` (new TOP-LEVEL resource, like brand/persona/ref/project/template/asset):
- `create <project> --slug <s> --format <f> --from "<glob>" [--style/--template/--recipe/--asset ...]`
  → copies matched assets into `units/<slug>/`, writes `unit.json` (ordered media + provenance).
- `list <project>` · `show <project> <slug>` · `add <project> <slug> --from <glob>`
  · `delete <project> <slug>` (explicit consent, per #14).
- `ralphy generate` is NOT changed — it keeps writing to `assets/`; units are formed
  explicitly from curated picks.

## Scope / acceptance

1. New `cli/commands/unit.ts` registered in `cli/index.ts`; resource CRUD + `create`/`add`.
2. Unit manifest Zod schema in `cli/lib/schemas/` (format enum aligned with library-v2;
   provenance optional block slugs; ordered `media`).
3. Copies (never moves) source assets into `units/<slug>/`; `units/` is append-only
   (new slug = new dir; regen of a unit = new version, never overwrite — mirror #14).
4. Smoke test: `bunx tsx cli/index.ts unit create … --from …` + JSON assertion (the
   off-domain-English fixture pattern). `bun run lint:*` green.
5. Update `CLAUDE.md` "Project memory"/layout + AGENTS.md invariant #14 to cover `units/`.
6. `docs/cli-surface` regenerated; `docs:cli` fresh.

## Why it matters

Separates "deliverables the user keeps" from the asset svalka, gives publish (#056)
a clean per-unit input with provenance already attached, and stops users hand-rolling
folders. The project-side mirror of the library Unit.

## Notes

- Feeds #056 (publish reads `units/*/unit.json`). Pairs with #063 (graph), #062 (extract).
- Sequence: foundational for the project side; do before the publish-of-units path in #056.
