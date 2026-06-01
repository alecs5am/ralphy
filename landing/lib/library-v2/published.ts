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
export const PUBLISHED_UNITS: Unit[] = [
  {
    "id": "voxel-fork",
    "format": "image",
    "title": "Voxel Horror Fork",
    "blurb": "First-person lantern at a fork in the path — armadillo by the mine, gnome with umbrella, lighthouse beam through the rain. Voxel horror-game still.",
    "templateId": "choose-the-door",
    "styleId": "voxel-night-rain",
    "recipeIds": [
      "rain-overlay",
      "lantern-glow",
      "voxel-dither",
      "noir-grade"
    ],
    "assetIds": [],
    "mediaCount": 1,
    "media": [
      {
        "src": "/showcase/voxel-fork/voxel-fork.png",
        "kind": "image",
        "aspect": "9 / 16",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/voxel-fork/voxel-fork.png"
      }
    ]
  }
];
// ralphy:published-units:end

// ralphy:published-blocks:start
export const PUBLISHED_BLOCKS: Block[] = [
  {
    "kind": "style",
    "id": "voxel-night-rain",
    "name": "Voxel night-rain",
    "blurb": "Blocky voxel 3D under heavy rain and lantern light — cozy-eerie horror-game mood, dense fog, deep blues, warm point-light pools.",
    "refs": []
  }
];
// ralphy:published-blocks:end
