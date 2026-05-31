# Supabase — Library v2 data layer

The canonical, scalable store for the Library v2 Unit/Block content graph. The
committed static catalog (`landing/lib/library-v2/catalog.ts`) stays the
open-source downloadable snapshot; Supabase becomes the canonical store the live
site reads from once configured. Both serve the **same shapes**, so the screens
are backend-agnostic (see the adapter, below).

## Two-store model

| Store | Role | Source of truth | Auth needed |
|---|---|---|---|
| Committed catalog (`landing/lib/library-v2/catalog.ts` + `index.ts`) | Open-source downloadable snapshot; default read path | Hand-authored migration output | None |
| Supabase (this schema) | Scalable canonical store; live read path when configured | Seeded **from** the catalog | Anon key (read), service role / MCP (write) |

The adapter `landing/lib/library-v2/source.ts` picks the backend at runtime: if
`NEXT_PUBLIC_SUPABASE_URL` **and** `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set, it reads
from Supabase; otherwise it falls back to the static catalog. The static fallback
is the default — clone the repo and the library works with no credentials.

## Schema (`migrations/0001_init_library_v2.sql`)

Five-entity model. **Format** is a fixed taxonomy carried as an enum on `units`
(it is not its own table — it lives in the catalog). **Unit** and **Block** are
tables; the composition is a join table.

- **Enums:** `format_id` (8 formats), `block_kind` (template/style/recipe/asset),
  `asset_sub` (character/location/prop/music), `link_kind` (provenance/applicable).
- **`blocks`** — reusable building blocks. `sub` is non-null only on asset blocks.
  `refs` jsonb holds optional reference-example media (empty for now).
- **`units`** — finished deliverables. `media` jsonb carries each item's local
  `src` and (after a storage upload) its `storageUrl`, so the offline snapshot and
  the Supabase copy both resolve. `media_count` is the real file count or the
  format default (1).
- **`unit_blocks`** — the provenance composition: exactly **1 template + 1 style +
  N recipe + M asset** rows per unit, all `link_kind = 'provenance'`. The
  `applicable` swap links (other blocks of the same kind / same asset sub) are
  **derived at query time** and are never stored.
- **Indexes:** `unit_blocks(block_id)`, `units(format)`, `blocks(kind)`.
- **RLS:** enabled on all three tables with a PUBLIC SELECT policy each (the data is
  open). There is intentionally **no** insert/update/delete policy — writes go
  through the service role / Supabase MCP only.

The migration is idempotent-safe: enum creation is guarded (`duplicate_object` →
no-op), tables use `create table if not exists`, policies are guarded.

## Seed flow (`landing/scripts/seed-supabase.ts`, run with bun)

The seed reads the static catalog and produces the seed two ways: it uploads each
Unit's local media to Storage, and it emits an idempotent SQL file of all rows.

```bash
cd landing

# 1. Dry-run (default): generate the SQL file + print what WOULD upload. Nothing remote.
bun run scripts/seed-supabase.ts --dry-run

# 2. Push storage: upload media to the `library` bucket at units/<unitId>/<filename>.
bun run scripts/seed-supabase.ts --push-storage

# 3. Apply the DB seed. With a service role key it applies directly; otherwise it
#    prints the MCP fallback. Both stages can run together.
bun run scripts/seed-supabase.ts --push-storage --push-db
```

- **`--dry-run`** writes `supabase/seed/library_v2.sql` and prints the planned
  uploads. It touches nothing remote. This is the only mode safe to run blind.
- **`--push-storage`** uploads via the S3-compatible API (`@aws-sdk/client-s3`)
  using the `SUPABASE_S3_*` env. Each uploaded media item gets a `storageUrl`
  folded into the unit's `media` jsonb in the generated SQL — the local `src` is
  always kept too.
- **`--push-db`** applies the SQL via a service-role Supabase client **if**
  `SUPABASE_SERVICE_ROLE_KEY` is set (through an `exec_sql` RPC). If the key is
  absent or the RPC is missing, it prints: *"apply supabase/seed/library_v2.sql via
  the Supabase MCP server"* — paste the generated SQL through the MCP server's SQL
  runner instead.

Recommended order on a fresh project: run the migration → `--push-storage` (so the
generated SQL carries `storageUrl`) → apply `supabase/seed/library_v2.sql` via the
MCP server (or `--push-db`).

## Env vars

Names are in `landing/.env.example`; real values live in the gitignored
`landing/.env.local` and are read at runtime only — never printed or committed.

| Var | Used by | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | adapter, seed | Project URL; also the public-URL base |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | adapter | Runtime DB reads (selects the Supabase backend) |
| `SUPABASE_SERVICE_ROLE_KEY` | seed `--push-db` | DB writes (optional; MCP is the alternative) |
| `SUPABASE_S3_ENDPOINT` / `_REGION` / `_ACCESS_KEY_ID` / `_SECRET_ACCESS_KEY` | seed `--push-storage` | S3-compatible Storage upload |
| `SUPABASE_STORAGE_BUCKET` | seed | Bucket name (`library`) |
| `SUPABASE_PROJECT_REF` | reference | Project ref (used in the S3 endpoint host) |

## Regenerating the seed

Re-run `--dry-run` after any change to `landing/lib/library-v2/catalog.ts`. The
generated `supabase/seed/library_v2.sql` is a derived artifact — do not hand-edit
it; the `on conflict do update` clauses make re-applying a safe refresh.
