-- 0001_init_library_v2.sql
--
-- Library v2 — canonical Supabase schema for the Unit/Block content graph.
--
-- The model has five entities (see landing/lib/library-v2/types.ts):
--   Format  — the SHAPE of a deliverable (carried as the `format_id` enum on units).
--   Unit    — a finished deliverable in a Format, holding 1..N media items.
--   Block   — a reusable building block, one of four kinds (template/style/recipe/asset).
-- A Unit = exactly 1 template + 1 style + N recipe + M asset rows in `unit_blocks`.
-- Those rows are the Unit's PROVENANCE. `applicable` swap links (other blocks of the
-- same kind / same asset sub) are DERIVED at query time and are NEVER stored here.
--
-- Two-store model: the committed static catalog (landing/lib/library-v2/catalog.ts)
-- stays the open-source downloadable snapshot; this schema is the scalable canonical
-- store. Both serve the same shapes (see landing/lib/library-v2/source.ts).
--
-- Idempotent-safe: enum creation is guarded, tables use `if not exists`. RLS is on
-- with a PUBLIC SELECT policy on each table (the data is open); writes go through the
-- service role / Supabase MCP only — there is intentionally no insert/update/delete policy.

-- ── Enums (guarded so re-running the migration does not error) ───────────────

do $$ begin
  create type format_id as enum (
    'video', 'carousel', 'sticker-pack', 'podcast-cuts',
    'fb-creative', 'motion-design', 'poster', 'image'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type block_kind as enum ('template', 'style', 'recipe', 'asset');
exception when duplicate_object then null; end $$;

do $$ begin
  create type asset_sub as enum ('character', 'location', 'prop', 'music');
exception when duplicate_object then null; end $$;

do $$ begin
  create type link_kind as enum ('provenance', 'applicable');
exception when duplicate_object then null; end $$;

-- ── Tables ───────────────────────────────────────────────────────────────────

-- Reusable building blocks. `sub` is non-null only on asset blocks. `refs` holds
-- optional reference-example media paths surfaced on the block page (empty for now).
create table if not exists blocks (
  id         text primary key,
  kind       block_kind  not null,
  name       text        not null,
  blurb      text,
  sub        asset_sub,                       -- only set when kind = 'asset'
  refs       jsonb       not null default '[]',
  created_at timestamptz not null default now()
);

-- Finished deliverables. `media` carries the resolved web-servable items; each item
-- keeps the local `src` AND, after a storage upload, a `storageUrl` — so the offline
-- snapshot and the Supabase copy both resolve. `media_count` is the real file count
-- (packs/carousels) or the format default (1).
create table if not exists units (
  id          text primary key,
  format      format_id   not null,
  title       text        not null,
  blurb       text,
  date        text,                       -- loose display string (e.g. "2026-05"), not a strict calendar date
  media       jsonb       not null default '[]',
  media_count int         not null default 1,
  hero        boolean     not null default false,
  created_at  timestamptz not null default now()
);

-- The composition join: exactly 1 template + 1 style + N recipe + M asset rows per
-- unit, all with link_kind = 'provenance'. `applicable' links are derived at query
-- time (same kind / same asset sub) and are NOT pre-populated here.
create table if not exists unit_blocks (
  unit_id   text not null references units(id)  on delete cascade,
  block_id  text not null references blocks(id) on delete restrict,
  role      text not null check (role in ('template', 'style', 'recipe', 'asset')),
  link_kind link_kind not null default 'provenance',
  position  int  not null default 0,
  primary key (unit_id, block_id, role)
);

-- Per-unit reproduction Blueprints (#074/#077). 1:1 with a unit (unit_id is the
-- primary key AND the FK). `data` is the full JSON-serialized Blueprint object
-- (the six axes + the resolved storageUrl-per-asset + any oversizeSkipped note).
-- Idempotent upsert keyed by unit_id; append-only (a re-publish replaces the row).
create table if not exists blueprints (
  unit_id    text primary key references units(id) on delete cascade,
  data       jsonb       not null,
  created_at timestamptz not null default now()
);

-- ── Indexes ──────────────────────────────────────────────────────────────────

create index if not exists unit_blocks_block_id_idx on unit_blocks (block_id);
create index if not exists units_format_idx          on units (format);
create index if not exists blocks_kind_idx           on blocks (kind);

-- ── Row-level security (data is open: PUBLIC SELECT, no write policy) ─────────

alter table blocks      enable row level security;
alter table units       enable row level security;
alter table unit_blocks enable row level security;
alter table blueprints  enable row level security;

do $$ begin
  create policy blocks_public_select on blocks
    for select using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy units_public_select on units
    for select using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy unit_blocks_public_select on unit_blocks
    for select using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy blueprints_public_select on blueprints
    for select using (true);
exception when duplicate_object then null; end $$;
