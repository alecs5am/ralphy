# Retire the repo `templates/` folder — Supabase is the source for public templates

> **Status:** done — 2026-06-04 (folder deleted + CLI on Supabase; landing component refactor → #086-#097, mirror regen → #098)
> **Filed:** 2026-06-04
> **Folder:** issues
> **Severity:** high (architecture direction + removes 64 committed files)
> **Category:** architecture / content-model / cli / frontend

## Decision

Templates are no longer kept as a committed repo folder. Two tiers only:

- **Public / shared templates → Supabase** (the live `units` + `blocks` graph behind `/library`). Single source of truth. Public-read already enforced (RLS `PUBLIC SELECT` on every table + `NEXT_PUBLIC_SUPABASE_*` anon creds).
- **User's own templates → `workspace/templates/`** (already exists, gitignored, `templatesDir()` in `cli/lib/paths.ts`). Saved here when the user asks (e.g. via the `templater` flow). The CLI searches this dir for the user's *local* templates.

The repo-public `templates/<category>/<slug>/` folder (`repoTemplatesDir()`, 64 templates) is **retired**. Rationale: keeping a hand-curated repo folder is inconvenient and the 37 templates not represented on `/library` are untested (scraped, never validated) — they will be dropped, NOT published. Git history preserves them if ever needed.

## Verification (live Supabase, 2026-06-04)

Cross-checked the 64 repo templates against the **live** DB (not the stale committed mirror):

- **27 of 64** have a counterpart on `/library` (as a unit or a template/style block). Examples: `vpn-sticker-pack` → `vpn-sticker-pack-clean` + `vpn-sticker-pack-outline`; `multi-style-carousel` → 6 carousel units; `streetwear-drop-poster` → 3 poster units; `talking-head-rant` → `talking-head` block; `before-after-product` → `before-after` block; plus `dev-tool-fb-creative-pack`, `brainrot-ai-meme`, `food-beverage`, `found-footage-mockumentary`, `soviet-nostalgic`, `ship-announcement`, `animated-fb-ad`, `live-platform-motion-ad`, `silent-square-site-ad`, `podcast-explainer-longform`, `asmr-sensory`, `grwm`, `tier-list`, `doctor-authority`, `italian-brainrot`, `anime-action`, `3d-cgi`, `cinematic`, `music-video`.
- **37 of 64** are orphan (local-only, no `/library` counterpart) — to be dropped:
  `active-lifestyle, ai-avatar, ai-drama, ai-vegetables, anthropomorphic-object-drama, brand-story, cartoon, cgi-architecture, cgi-hardware, comic-to-video, ecommerce-ad, faceless-voiceover, fashion-lookbook, fight-scenes, fit-check, green-screen-explainer, interview-dialog, japanese-hypermotion-product-ad, life-changing-testimonial, listicle, motion-design-ad, multi-scene-product-launch, noski-deadpan-2hander, photo-dump, podcast-clip, pov-first-person, product-360, real-estate, social-hook, storytime, tokyo-y2k-cinematic, trending-sound-remix, try-on, tutorial-how-to, ugc-selfie-product-review, vs-comparison-ad, yap-talking-head`

Live DB totals at filing: 42 units, 26 template blocks, 27 style blocks, 16 recipes, 31 assets.

## Blockers (must land before deleting the folder)

1. **The committed mirror `landing/lib/library-v2/published.ts` is stale** — 9 units vs 42 live, 13 template blocks vs 26 live. Anything that reads the mirror (and any "CLI reads Supabase offline" path) is wrong until it is regenerated from the live DB. Regenerate the mirror first.
2. **`/library` still reads the repo folder for previews.** `landing/lib/showcase-loader.ts` (`TEMPLATES_DIR`) and `landing/lib/library-v2/catalog.ts` resolve preview media / catalog data out of `templates/<cat>/<slug>/`. Deleting the folder without rewiring these onto Supabase Storage breaks the detail pages we want to KEEP. (Note: live units already carry Storage URLs for 48/48 media; block refs 47/47 are remote — the data exists in Storage, only the loaders point at the wrong place.)

## Migration steps

1. Regenerate `published.ts` from the live DB so the open-source mirror == `/library`.
2. Rewire `showcase-loader.ts` + `catalog.ts` off `TEMPLATES_DIR` onto the Supabase/Storage graph.
3. CLI: `ralphy template suggest/list/use` read **two** sources — `workspace/templates/` (user-local) + Supabase public library (live REST with anon key + local cache, falling back to the regenerated mirror offline). Drop the `repoTemplatesDir()` source. `template extract` writes to `workspace/templates/` (or the publish path), never to a repo folder.
4. Delete `templates/`.
5. Cleanup: AGENTS.md routing (the `ralphy template suggest` references), README (`CATEGORIES.md` "64 templates" row), tests (`lint:templates`, `tests/unit/template-suggest.test.ts`), and the `templates/*.md` manifests (`CATEGORIES.md`, `TOP.md`, `FORMATS.md`, `docs/templates-index.md`).

## Update 2026-06-04 (expanded scope + live constraints)

User expanded the mandate and surfaced two live constraints:

**Expanded scope (5 workstreams):**
1. Landing: remove every `/library` dependency on local repo files; serve all media from the cloud (Supabase Storage). Rewire `showcase-loader.ts` + `catalog.ts` off `TEMPLATES_DIR`.
2. Verify the **public anon-key** path works end to end with NO privileged creds (no service-role, no `SUPABASE_DB_URL`) — reads must return data under RLS `PUBLIC SELECT` alone.
3. Delete the retired local template files (the 37 orphans, then the folder).
4. Move the user's project-derived templates into `workspace/templates/` (the user-local tier; see #067).
5. CLI must operate on ALL new-system entities across both tiers (local `workspace/` + public Supabase): **Unit · Blueprint (per-unit) · Template (general/structure) · Recipe**, plus Asset as concrete reusable media.

**Entity-model change (in flight, do not build against the old shape):**
- The **Style** block-kind is being **demoted to plain tags** by a parallel agent (same direction as the recipe-vs-tag split #082/#083). Do NOT design the CLI or the landing rewire around Style as a first-class entity — it is going away. Target entity set: Unit / Blueprint / Template / Recipe (+ Asset). Style → a `tags[]` descriptor.

**Coordination constraint (BLOCKER):**
- A parallel agent is actively mutating `landing/lib/library-v2/`, the `published.ts` mirror, the Supabase schema, and the Style entity, committing to `main` concurrently. Workstreams 1, 3, and the mirror regen collide head-on with it. Sequence AFTER the Style→tags removal lands; until then only non-overlapping prep is safe.
- Verification (workstream 2) and any "CLI reads live Supabase" path need `NEXT_PUBLIC_SUPABASE_ANON_KEY`, which is currently commented out in `landing/.env.local`. The key is public (browser-shipped) — must be enabled before this can be tested.

## Architecture decision + verification (2026-06-04)

**Decision: the CLI reads the public library straight from Supabase PostgREST** (`https://<ref>.supabase.co/rest/v1`) with the **publishable key** (`sb_publishable_*`, the 2026 replacement for the anon key — designed to ship in public clients). No Next.js API gateway: Supabase already exposes a stable REST surface and RLS enforces read-only. The publishable key + URL ship as CLI defaults (env-overridable: `RALPHY_LIBRARY_URL` / `RALPHY_LIBRARY_KEY`), exactly as the landing ships the key to browsers.

**Public-path verification (publishable key, zero privileged creds):**
- `GET /units` → 42 rows (`content-range: 0-41/42`).
- `GET /blocks` → template 26, recipe 16, asset 31 (no style — confirms #6b7614f landed).
- `GET /blueprints` → 6 rows.
- `POST /units` → `42501 row-level security policy` (writes blocked). Read-only public access confirmed. Workstream 2 = DONE.

**DB columns (PostgREST row shape → CLI entity mapping, snake→camel):**
- `units`: id, format, title, blurb, date, media (jsonb), media_count, hero, created_at, tags[]
- `blocks`: id, kind (template|recipe|asset), name, blurb, sub, refs[], created_at, recipe_kind, data (jsonb — enriched recipe payload etc.)
- `blueprints`: unit_id, data (jsonb — the six reproduction axes), created_at
- `unit_blocks`: unit_id, block_id, role, link_kind, position

**Revised execution order (Option A):**
- (A) Verify public REST path — DONE.
- (B) CLI data layer: `cli/lib/library/` (client + types mirroring `library-v2/types.ts` minus Style + snake→camel mapper + local cache under `workspace/.ralph/library-cache/`).
- (C) CLI command surface for all public entities (Unit / Blueprint / Template / Recipe / Asset) — read/discovery via the data layer; `template suggest/list/use` read public templates + the user-local `workspace/templates/` tier.
- (D) Regenerate `published.ts` mirror from live (42 units) so the landing offline fallback is correct.
- (E) Landing off `TEMPLATES_DIR`: retire the dead `/library/[slug]` route + `showcase-loader.ts` local reads.
- (F) Move user-project templates into `workspace/templates/`, delete repo `templates/`, clean up AGENTS.md / README / `lint:templates` / `template-suggest.test.ts`.

## Progress + handoff (2026-06-04)

**CLI tier — DONE (this is the cleanly-non-colliding half):**
- Step B landed: `cli/lib/library/` data layer + `ralphy library` read command (commit `92bacce`). Reads Unit/Template/Recipe/Asset/Blueprint from Supabase PostgREST with the publishable key.
- Step C landed: `template suggest/list/use/show/extract/create/register` rewired to public library + `workspace/templates/`, repo folder dropped as a source; `extract` writes to `workspace/templates/` (commit `958d819`). AGENTS.md invariant #10 updated.

**Landing + deletion steps — HANDED OFF to the parallel #086-#097 batch (do NOT race):**
- The parallel agent filed #086-#097 (`eb36d8a`) — the full library component-system + UX refactor, which OWNS the landing-side of this issue: `#088` shared `<Media>` (aspect-preserving previews, i.e. the Storage-backed media), `#092` feed, and **`#097` "verify the whole library reads through the Supabase API"** (= our workstream 2 on the landing side). 
- Therefore the remaining steps here — (D) regen `published.ts` mirror, (E) landing off `TEMPLATES_DIR` / retire `/library/[slug]` + `showcase-loader.ts`, and (F) delete the repo `templates/` folder — are entangled with that batch. Two agents on `landing/library-v2` collide. Sequence AFTER #086-#097 lands.
- `templates/` CANNOT be deleted until the landing stops reading it (`showcase-loader.ts` `TEMPLATES_DIR`, addressed by #088/#092). `lint:templates` (`scripts/lint-templates.ts`) walks the repo folder and must be retired/repointed at `workspace/templates/` as part of (F).

**Net:** the CLI now operates on all public entities (Unit/Blueprint/Template/Recipe/Asset) from Supabase + the workspace tier. The folder-deletion + landing-decoupling is gated on the parallel landing refactor.

## Related

- #063 (Unit + typed blocks content model), #064 (DB/blob infra), #067 (user-uploaded templates → the `workspace/templates/` tier), #056 (publish path), #069 (project units).
