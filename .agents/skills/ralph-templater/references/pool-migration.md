# pool-migration

Heavy-asset migration from a source project's `assets/` tree into the companion `ralphy-assets/pool/` repo.

This is ON by default; `--no-push-assets` skips it (the template then references local paths inside the template dir, which is fine for small refs but bloats the repo if you have multi-MB images or audio).

## What gets migrated

Only the durable, reusable inputs. Not the project's outputs.

| Manifest entry signal | Migrate? | Why |
|---|---|---|
| `refRole: "character-master"` | Yes | Master shot used as `--ref` on every gen — high reuse value |
| `refRole: "location-plate"` | Yes | Location lock for consistency across scenes |
| `refRole: "brand-master"` | Yes | Product/brand reference shot |
| `refRole: "music-bed"` or `path: ".../music/*.mp3"` | Yes | Music bed under VO |
| `locked: true` (any type) | Yes | Explicit user-lock signal |
| `type: "trim-from"` | No | Derived from a parent ref — copy the parent instead |
| `type: "render-output"` | No | Project-specific final |
| Path under `assets/captions/` or `render/` | No | Captions + finals are project outputs |
| Path under `refs/` (research input) | Maybe | If `locked: true` migrate; otherwise it's research material, skip |

## The migration algorithm

For each candidate manifest entry:

1. **Compute the destination key.** The convention is `<slug>/<filename>` (e.g. `tokyo-y2k-cinematic/master-night-alley.png`). The `--manifest-key-prefix` flag overrides the `<slug>/` prefix when the user wants to share assets across templates (rare).

2. **Pick the destination kind folder** inside `ralphy-assets/pool/`:
   - Images (.png, .jpg, .webp) → `pool/<slug>-refs/` (new kind folder per template, keeps refs grouped)
   - Audio (.mp3, .wav, .m4a) → `pool/trend-music/` (existing kind folder — music beds are cross-template)
   - Video clips (.mp4) → `pool/<slug>-refs/` (rare; usually project mp4s aren't reusable assets)
   
   The existing `pool/italian-brainrot-characters/` and `pool/trend-music/` set the precedent — kind folders are by purpose, not by media type alone.

3. **Compute SHA-256 + file size** for the manifest. Existing entries in `ralphy-assets/manifest.json` follow this shape:
   ```json
   {
     "key": "tokyo-y2k-cinematic/master-night-alley.png",
     "kind": "tokyo-y2k-cinematic-refs",
     "sha256": "<hex>",
     "sizeBytes": 829344,
     "addedAt": "2026-05-19T12:00:00Z",
     "source": "workspace/projects/tokyo-y2k-001/assets/images/master-night-alley.png"
   }
   ```
   The `source` field is informational only — for traceability back to which project crystallized this asset.

4. **Skip if SHA matches an existing entry.** Idempotent re-runs are safe; the skill detects when the same asset was already migrated under a different slug and reuses the existing key instead of duplicating.

5. **Copy the file** to `/Users/maximovchinnikov/github/ralphy-assets/pool/<kind>/<filename>`. Never symlink — pool assets need to be standalone for the GitHub raw-fetch flow.

6. **Append to `ralphy-assets/manifest.json`** under the `pool` section.

7. **Regenerate `ralphy-assets/docs/assets-catalog.md`** by running `ralphy assets catalog --write` after all migrations for this run complete. This catalog is what `ralphy assets list --kind <kind>` and the asset-catalog docs surface — keeping it fresh is the only thing that makes new pool entries discoverable.

8. **Reference from template.json** with the remote pattern:
   ```json
   {
     "assets": {
       "location-master-plate": {
         "remote": true,
         "manifestKey": "tokyo-y2k-cinematic/master-night-alley.png",
         "required": true,
         "destSubdir": "assets/images",
         "note": "Pass as --ref on every scene anchor generation. Location lock."
       }
     }
   }
   ```

## Where the migration happens

Programmatically, via the `cli/lib/assets-repo.ts` helpers. The skill calls `loadManifest()` once, then for each migration appends an entry and calls a new helper `writeManifest()` (to be added if not already present).

Heavy lifts:
- `loadManifest()` exists.
- `ensureRequired()` exists (the *consume* side — pulling assets to a project).
- `migrateLocalToPool({ src, slug, refRole, note })` does NOT exist yet — this skill's implementation introduces it.

## Edge cases & safeguards

- **Total migrated size > 50 MB** → pause and ask the user. GitHub raw limit is 100 MB but the streaming-from-raw flow degrades past ~50 MB. Offer to split into multiple template slugs OR commit only the smallest representative samples (with a note in the template that the consumer should bring their own larger assets).
- **Source file missing** (entry in `asset-manifest.json` references a path that doesn't exist) → warn, skip that entry, continue with the rest. Don't fail the whole migration over one stale manifest entry.
- **Pool already has the same SHA under a different key** → reuse the existing key (no duplication). Surface in the output JSON which assets reused existing pool entries vs. which created new entries.
- **`ralphy-assets/` not present locally** (fresh machine, didn't clone the companion repo) → fail with a concrete pointer: "Clone `git@github.com:alecs5am/ralphy-assets.git` into a sibling directory and re-run." Don't try to `git clone` automatically — that's a user-authorization decision.
- **Manifest write race** (two `ralph-templater` runs in parallel) → not handled. The skill is intended to run interactively, one project at a time. If a future need arises, add a file lock around `manifest.json`.
- **`--dry-run`** → compute all migrations, print the plan as JSON, do NOT copy any files or modify `manifest.json`. The output JSON includes the proposed `pool_assets` list so the user can review before re-running without the flag.

## Why migrate at all (vs. shipping assets inside the template dir)

Templates in `ugc-cli/templates/` live in the main repo and ship with every clone. Heavy refs would balloon the clone size for everyone — every new project clones the templates whether or not it uses each one.

Pool assets in `ralphy-assets/` are pulled on-demand by `ralphy template use` via `ensureRequired()`, cached locally at `workspace/.ralph/asset-cache/`. Consumers only download the refs they need, when they need them. SHA-checked, GitHub raw-streamed, no auth.

The exception: small (<200 KB) refs that benefit from being inline (e.g. a tiny brand-mark PNG) can stay in the template dir under `templates/<category>/<slug>/assets/`. The `--no-push-assets` flag bypasses pool migration entirely for cases where the user wants this; the manifestKey is replaced with a local `path` and the consume-side picks it up directly.
