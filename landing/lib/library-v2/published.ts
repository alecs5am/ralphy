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
  },
  {
    "id": "choose-path-voxel-en",
    "format": "video",
    "title": "Choose Your Path — voxel horror gauntlet (EN)",
    "blurb": "Branching POV horror: pick a guide, survive a chain of 50/50 freeze-timer forks. PS1/voxel register. English VO.",
    "templateId": "choose-your-path-gauntlet",
    "styleId": "voxel-night-rain",
    "recipeIds": [
      "vhs-pause-freeze",
      "ffmpeg-xfade-master",
      "old-radio-ps1-vo",
      "voxel-dither"
    ],
    "assetIds": [
      "shpundel-armadillo",
      "tolik-old-man",
      "kobold-swarm",
      "backrooms-bed"
    ],
    "mediaCount": 1,
    "media": [
      {
        "src": "/showcase/choose-path-voxel-en/final-en-compressed.mp4",
        "kind": "video",
        "aspect": "9 / 16",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/choose-path-voxel-en/final-en-compressed.mp4"
      }
    ]
  },
  {
    "id": "nyastics-emotes-final",
    "format": "sticker-pack",
    "title": "Free Air — 40 emote stickers FINAL (TG-ready)",
    "blurb": "Final 40 Free Air mascot emote stickers (hippo-pack pose port, client IP). gpt-5.4-image-2 double-ref, green-keyed, no outline, 512px transparent PNG. 3 borderline poses (walk/aww/sad) re-rolled and swapped to best variant. Ready for @Stickers upload.",
    "templateId": "",
    "styleId": "",
    "recipeIds": [],
    "assetIds": [],
    "mediaCount": 40,
    "media": [
      {
        "src": "/showcase/nyastics-emotes-final/ny01-laugh.png",
        "kind": "image",
        "aspect": "1 / 1",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/nyastics-emotes-final/ny01-laugh.png"
      },
      {
        "src": "/showcase/nyastics-emotes-final/ny02-tada.png",
        "kind": "image",
        "aspect": "376 / 512",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/nyastics-emotes-final/ny02-tada.png"
      },
      {
        "src": "/showcase/nyastics-emotes-final/ny03-rofl.png",
        "kind": "image",
        "aspect": "512 / 438",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/nyastics-emotes-final/ny03-rofl.png"
      },
      {
        "src": "/showcase/nyastics-emotes-final/ny04-walk.png",
        "kind": "image",
        "aspect": "457 / 512",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/nyastics-emotes-final/ny04-walk.png"
      },
      {
        "src": "/showcase/nyastics-emotes-final/ny05-splash.png",
        "kind": "image",
        "aspect": "498 / 512",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/nyastics-emotes-final/ny05-splash.png"
      },
      {
        "src": "/showcase/nyastics-emotes-final/ny06-aww.png",
        "kind": "image",
        "aspect": "512 / 499",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/nyastics-emotes-final/ny06-aww.png"
      },
      {
        "src": "/showcase/nyastics-emotes-final/ny07-hi.png",
        "kind": "image",
        "aspect": "322 / 512",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/nyastics-emotes-final/ny07-hi.png"
      },
      {
        "src": "/showcase/nyastics-emotes-final/ny08-scheme.png",
        "kind": "image",
        "aspect": "295 / 512",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/nyastics-emotes-final/ny08-scheme.png"
      },
      {
        "src": "/showcase/nyastics-emotes-final/ny09-excited.png",
        "kind": "image",
        "aspect": "389 / 512",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/nyastics-emotes-final/ny09-excited.png"
      },
      {
        "src": "/showcase/nyastics-emotes-final/ny10-chill.png",
        "kind": "image",
        "aspect": "487 / 512",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/nyastics-emotes-final/ny10-chill.png"
      },
      {
        "src": "/showcase/nyastics-emotes-final/ny11-lurk.png",
        "kind": "image",
        "aspect": "512 / 463",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/nyastics-emotes-final/ny11-lurk.png"
      },
      {
        "src": "/showcase/nyastics-emotes-final/ny12-cake.png",
        "kind": "image",
        "aspect": "2 / 3",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/nyastics-emotes-final/ny12-cake.png"
      },
      {
        "src": "/showcase/nyastics-emotes-final/ny13-noodles.png",
        "kind": "image",
        "aspect": "373 / 512",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/nyastics-emotes-final/ny13-noodles.png"
      },
      {
        "src": "/showcase/nyastics-emotes-final/ny14-plusone.png",
        "kind": "image",
        "aspect": "277 / 512",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/nyastics-emotes-final/ny14-plusone.png"
      },
      {
        "src": "/showcase/nyastics-emotes-final/ny15-shake.png",
        "kind": "image",
        "aspect": "376 / 512",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/nyastics-emotes-final/ny15-shake.png"
      },
      {
        "src": "/showcase/nyastics-emotes-final/ny16-feast.png",
        "kind": "image",
        "aspect": "512 / 401",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/nyastics-emotes-final/ny16-feast.png"
      },
      {
        "src": "/showcase/nyastics-emotes-final/ny17-stack.png",
        "kind": "image",
        "aspect": "223 / 512",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/nyastics-emotes-final/ny17-stack.png"
      },
      {
        "src": "/showcase/nyastics-emotes-final/ny18-pizza.png",
        "kind": "image",
        "aspect": "357 / 512",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/nyastics-emotes-final/ny18-pizza.png"
      },
      {
        "src": "/showcase/nyastics-emotes-final/ny19-melon.png",
        "kind": "image",
        "aspect": "366 / 512",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/nyastics-emotes-final/ny19-melon.png"
      },
      {
        "src": "/showcase/nyastics-emotes-final/ny20-grumpy.png",
        "kind": "image",
        "aspect": "230 / 512",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/nyastics-emotes-final/ny20-grumpy.png"
      },
      {
        "src": "/showcase/nyastics-emotes-final/ny21-salad.png",
        "kind": "image",
        "aspect": "4 / 5",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/nyastics-emotes-final/ny21-salad.png"
      },
      {
        "src": "/showcase/nyastics-emotes-final/ny22-warrior.png",
        "kind": "image",
        "aspect": "4 / 5",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/nyastics-emotes-final/ny22-warrior.png"
      },
      {
        "src": "/showcase/nyastics-emotes-final/ny23-sad.png",
        "kind": "image",
        "aspect": "222 / 512",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/nyastics-emotes-final/ny23-sad.png"
      },
      {
        "src": "/showcase/nyastics-emotes-final/ny24-sus.png",
        "kind": "image",
        "aspect": "276 / 512",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/nyastics-emotes-final/ny24-sus.png"
      },
      {
        "src": "/showcase/nyastics-emotes-final/ny25-huh.png",
        "kind": "image",
        "aspect": "318 / 512",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/nyastics-emotes-final/ny25-huh.png"
      },
      {
        "src": "/showcase/nyastics-emotes-final/ny26-writing.png",
        "kind": "image",
        "aspect": "512 / 408",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/nyastics-emotes-final/ny26-writing.png"
      },
      {
        "src": "/showcase/nyastics-emotes-final/ny27-sleep.png",
        "kind": "image",
        "aspect": "512 / 408",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/nyastics-emotes-final/ny27-sleep.png"
      },
      {
        "src": "/showcase/nyastics-emotes-final/ny28-money.png",
        "kind": "image",
        "aspect": "332 / 512",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/nyastics-emotes-final/ny28-money.png"
      },
      {
        "src": "/showcase/nyastics-emotes-final/ny29-reading.png",
        "kind": "image",
        "aspect": "512 / 366",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/nyastics-emotes-final/ny29-reading.png"
      },
      {
        "src": "/showcase/nyastics-emotes-final/ny30-rose.png",
        "kind": "image",
        "aspect": "235 / 512",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/nyastics-emotes-final/ny30-rose.png"
      },
      {
        "src": "/showcase/nyastics-emotes-final/ny31-stand.png",
        "kind": "image",
        "aspect": "304 / 512",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/nyastics-emotes-final/ny31-stand.png"
      },
      {
        "src": "/showcase/nyastics-emotes-final/ny32-car.png",
        "kind": "image",
        "aspect": "1 / 1",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/nyastics-emotes-final/ny32-car.png"
      },
      {
        "src": "/showcase/nyastics-emotes-final/ny33-fire.png",
        "kind": "image",
        "aspect": "475 / 512",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/nyastics-emotes-final/ny33-fire.png"
      },
      {
        "src": "/showcase/nyastics-emotes-final/ny34-grass.png",
        "kind": "image",
        "aspect": "399 / 512",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/nyastics-emotes-final/ny34-grass.png"
      },
      {
        "src": "/showcase/nyastics-emotes-final/ny35-crawl.png",
        "kind": "image",
        "aspect": "445 / 512",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/nyastics-emotes-final/ny35-crawl.png"
      },
      {
        "src": "/showcase/nyastics-emotes-final/ny36-dead.png",
        "kind": "image",
        "aspect": "1 / 1",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/nyastics-emotes-final/ny36-dead.png"
      },
      {
        "src": "/showcase/nyastics-emotes-final/ny37-drink.png",
        "kind": "image",
        "aspect": "395 / 512",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/nyastics-emotes-final/ny37-drink.png"
      },
      {
        "src": "/showcase/nyastics-emotes-final/ny38-cry.png",
        "kind": "image",
        "aspect": "1 / 1",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/nyastics-emotes-final/ny38-cry.png"
      },
      {
        "src": "/showcase/nyastics-emotes-final/ny39-yawn.png",
        "kind": "image",
        "aspect": "9 / 16",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/nyastics-emotes-final/ny39-yawn.png"
      },
      {
        "src": "/showcase/nyastics-emotes-final/ny40-angry.png",
        "kind": "image",
        "aspect": "400 / 512",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/nyastics-emotes-final/ny40-angry.png"
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
  },
  {
    "kind": "template",
    "id": "choose-your-path-gauntlet",
    "name": "Choose-Your-Path Gauntlet",
    "blurb": "Hub → pick a guide → a chain of binary 50/50 forks (scene plays → freeze + 3-2-1 timer → consequence) → branch payoff. Generalizes analog-horror-pick-a-door into a guide-choice survival gauntlet. Narration restates each choice ('you picked X — …') for retention.",
    "refs": []
  },
  {
    "kind": "recipe",
    "id": "vhs-pause-freeze",
    "name": "VHS Pause-Freeze",
    "blurb": "Play a clip then hold its last frame (ffmpeg tpad clone) for the choice beat; overlay canvas VCR noise + scanlines + wobble + SMPTE countdown disc + soft beeps; clear all overlays BEFORE the dissolve so the timer never bleeds into the next scene.",
    "refs": []
  },
  {
    "kind": "recipe",
    "id": "ffmpeg-xfade-master",
    "name": "ffmpeg xfade master",
    "blurb": "HyperFrames cannot render video↔video crossfades — bake them: trim segments → normalize (fps/format/sar) → xfade-chain (offset = sum(dur[0..k]) − (k+1)·d) → drive ONE <video>; overlays gated by an embedded clip-start array.",
    "refs": []
  },
  {
    "kind": "recipe",
    "id": "old-radio-ps1-vo",
    "name": "Old-Radio PS1 VO",
    "blurb": "Creepy lo-fi narrator filter for cloned VO: highpass=300,lowpass=3100,acrusher bits=10,acompressor,+5dB — band-limited, crunchy, PS1-horror voice.",
    "refs": []
  },
  {
    "kind": "asset",
    "id": "shpundel-armadillo",
    "name": "Shpundel (armadillo guide)",
    "blurb": "Voxel/PS1 armored armadillo-creature guide in a roadside shrine; the unsettling one.",
    "refs": [
      "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blocks/asset/shpundel-armadillo/char-shpundel-master.png"
    ],
    "sub": "character"
  },
  {
    "kind": "asset",
    "id": "tolik-old-man",
    "name": "Tolik (old-man guide)",
    "blurb": "Voxel/PS1 mustached old man in a blue raincoat with umbrella; the friendly-seeming lighthouse guide.",
    "refs": [
      "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blocks/asset/tolik-old-man/char-tolik-master.png"
    ],
    "sub": "character"
  },
  {
    "kind": "asset",
    "id": "kobold-swarm",
    "name": "Candle-headed kobolds",
    "blurb": "Voxel/PS1 candle-headed kobold miners (cobalt-cave swarm + crowned chieftain). 'You no take candle.'",
    "refs": [
      "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blocks/asset/kobold-swarm/a07-death-candle.png"
    ],
    "sub": "character"
  },
  {
    "kind": "asset",
    "id": "backrooms-bed",
    "name": "Backrooms (liminal bed)",
    "blurb": "Liminal-horror ambient music bed used under the gauntlet. EXTERNAL track (YouTube 'Backrooms.' by Deaven Wink) — metadata only, not redistributed.",
    "refs": [],
    "sub": "music"
  }
];
// ralphy:published-blocks:end
