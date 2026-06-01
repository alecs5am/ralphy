// landing/lib/library-v2/published.ts
//
// PUBLISHED entities — the append target for `landing/scripts/publish-entity.ts`
// (issue #056). This is the committed, open-source, downloadable mirror of every
// Unit / Block that has been published to the live Supabase store.
//
// Why a separate file from catalog.ts:
//   catalog.ts is the hand-curated one-time migration output (the live 33 units /
//   85 blocks). It must stay intact and hand-authored. New publishes never touch
//   it — they append here instead. The loader (./index.ts) MERGES catalog + this
//   file (concat, dedupe by id; PUBLISHED wins on an id clash), so everything
//   downstream (source.ts, the feed, the detail pages) sees published entities
//   automatically.
//
// Discipline (AGENTS.md invariant #14 — append-only on generations):
//   - The publish script appends or REPLACES by id (idempotent re-publish), it
//     never deletes. A re-publish of an existing id updates that one entry in
//     place; it does not drop the others.
//   - Each published Unit's `media` carries BOTH the local `src` and, after a
//     real Storage upload, a `storageUrl` (+ `posterStorageUrl`) — so the offline
//     snapshot resolves locally and the Supabase copy resolves remotely.
//
// Hand-edit only with care: the publish script rewrites the two array literals
// below between the sentinel markers. Keep the markers intact.

import type { Block, Unit } from "./types";

// ralphy:published-units:start
export const PUBLISHED_UNITS: Unit[] = [];
// ralphy:published-units:end

// ralphy:published-blocks:start
export const PUBLISHED_BLOCKS: Block[] = [];
// ralphy:published-blocks:end
