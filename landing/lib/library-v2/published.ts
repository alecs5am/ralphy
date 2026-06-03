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

import type { Block, Blueprint, Unit } from "./types";

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
  },
  {
    "id": "choose-silenthill",
    "format": "video",
    "title": "Choose Your Guide: Silent Hill",
    "blurb": "PS1 fog-horror: the bandaged nurse vs the armed madman",
    "templateId": "choose-your-path-gauntlet",
    "styleId": "analog-horror",
    "recipeIds": [
      "ffmpeg-xfade-master",
      "vhs-pause-freeze",
      "smpte-countdown-disc",
      "old-radio-ps1-vo",
      "chroma-split",
      "film-grain",
      "burned-captions",
      "voxel-dither"
    ],
    "assetIds": [
      "choosepath-soundtrack"
    ],
    "mediaCount": 1,
    "media": [
      {
        "src": "/showcase/choose-silenthill/showcase.mp4",
        "kind": "video",
        "aspect": "9 / 16",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/choose-silenthill/showcase.mp4"
      }
    ]
  },
  {
    "id": "choose-spaceship",
    "format": "video",
    "title": "Choose Your Guide: Derelict Ship",
    "blurb": "PS1 sci-fi horror: soothing ship-AI vs abrasive engineer",
    "templateId": "choose-your-path-gauntlet",
    "styleId": "analog-horror",
    "recipeIds": [
      "ffmpeg-xfade-master",
      "vhs-pause-freeze",
      "smpte-countdown-disc",
      "old-radio-ps1-vo",
      "chroma-split",
      "film-grain",
      "burned-captions",
      "voxel-dither",
      "boomerang-motion-fill"
    ],
    "assetIds": [
      "choosepath-soundtrack",
      "aura-hologram",
      "voss-engineer"
    ],
    "mediaCount": 1,
    "media": [
      {
        "src": "/showcase/choose-spaceship/showcase.mp4",
        "kind": "video",
        "aspect": "9 / 16",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/choose-spaceship/showcase.mp4"
      }
    ]
  },
  {
    "id": "choose-swamp",
    "format": "video",
    "title": "Choose Your Guide: The Swamp",
    "blurb": "PS1 Slavic folk-horror: read the witch, trust-but-verify the leshy",
    "templateId": "choose-your-path-gauntlet",
    "styleId": "analog-horror",
    "recipeIds": [
      "ffmpeg-xfade-master",
      "vhs-pause-freeze",
      "smpte-countdown-disc",
      "old-radio-ps1-vo",
      "chroma-split",
      "film-grain",
      "burned-captions",
      "voxel-dither",
      "boomerang-motion-fill"
    ],
    "assetIds": [
      "choosepath-soundtrack",
      "vedma-witch",
      "leshy-trent"
    ],
    "mediaCount": 1,
    "media": [
      {
        "src": "/showcase/choose-swamp/showcase.mp4",
        "kind": "video",
        "aspect": "9 / 16",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/choose-swamp/showcase.mp4"
      }
    ]
  },
  {
    "id": "choose-backrooms",
    "format": "video",
    "title": "Choose Your Path: Backrooms",
    "blurb": "PS1 liminal descent, party of 4 dwindles to 1, blue-pipe subversion",
    "templateId": "choose-your-path-gauntlet",
    "styleId": "analog-horror",
    "recipeIds": [
      "ffmpeg-xfade-master",
      "vhs-pause-freeze",
      "smpte-countdown-disc",
      "old-radio-ps1-vo",
      "chroma-split",
      "film-grain",
      "burned-captions",
      "voxel-dither",
      "boomerang-motion-fill"
    ],
    "assetIds": [
      "choosepath-soundtrack",
      "hazmat-scientists"
    ],
    "mediaCount": 1,
    "media": [
      {
        "src": "/showcase/choose-backrooms/showcase.mp4",
        "kind": "video",
        "aspect": "9 / 16",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/choose-backrooms/showcase.mp4"
      }
    ]
  },
  {
    "id": "choose-warofworlds",
    "format": "video",
    "title": "Choose Your Guide: War of the Worlds",
    "blurb": "PS1 invasion horror: gentle-alien trap vs grim survivor",
    "templateId": "choose-your-path-gauntlet",
    "styleId": "analog-horror",
    "recipeIds": [
      "ffmpeg-xfade-master",
      "vhs-pause-freeze",
      "smpte-countdown-disc",
      "old-radio-ps1-vo",
      "chroma-split",
      "film-grain",
      "burned-captions",
      "voxel-dither",
      "boomerang-motion-fill"
    ],
    "assetIds": [
      "choosepath-soundtrack",
      "peaceful-alien",
      "oneeyed-survivor"
    ],
    "mediaCount": 1,
    "media": [
      {
        "src": "/showcase/choose-warofworlds/showcase.mp4",
        "kind": "video",
        "aspect": "9 / 16",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/choose-warofworlds/showcase.mp4"
      }
    ]
  },
  {
    "id": "choose-magicschool",
    "format": "video",
    "title": "Choose Your Path: Magic School",
    "blurb": "Colorful PS1 magic-school dash: staircases, living armor, portals, Peeves",
    "templateId": "choose-your-path-gauntlet",
    "styleId": "ps1-magic-colorful",
    "recipeIds": [
      "ffmpeg-xfade-master",
      "vhs-pause-freeze",
      "smpte-countdown-disc",
      "old-radio-ps1-vo",
      "chroma-split",
      "film-grain",
      "burned-captions",
      "boomerang-motion-fill"
    ],
    "assetIds": [
      "choosepath-soundtrack"
    ],
    "mediaCount": 1,
    "media": [
      {
        "src": "/showcase/choose-magicschool/showcase.mp4",
        "kind": "video",
        "aspect": "9 / 16",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/choose-magicschool/showcase.mp4"
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
  },
  {
    "kind": "asset",
    "id": "aura-hologram",
    "name": "AURA — Ship-AI Hologram",
    "blurb": "Giant translucent pink-magenta holographic woman (Joi-style), scanline flicker, echoed across ship monitors. The soothing-but-lethal AI guide (spaceship).",
    "refs": [],
    "sub": "character"
  },
  {
    "kind": "recipe",
    "id": "boomerang-motion-fill",
    "name": "Boomerang Motion Fill",
    "blurb": "Fill a segment longer than its clip with forward+reverse motion (split/reverse/concat, -t target) instead of a frozen tpad tail — keeps hubs and idle endings alive. Fork freezes stay frozen by design.",
    "refs": []
  },
  {
    "kind": "recipe",
    "id": "choose-path-xfade-master",
    "name": "Choose-Path xfade Master Bake",
    "blurb": "Stitch N i2v clips into one master via ffmpeg xfade (0.5s, offset = sum(dur)-k*0.5), every input normalized to 1080x1920@24; emits A[]/SEG[] timing arrays for the overlay composition.",
    "refs": []
  },
  {
    "kind": "asset",
    "id": "choosepath-soundtrack",
    "name": "Choose-Path Soundtrack",
    "blurb": "The shared dark-ambient trend bed used across the whole choose-your-path series (soundtrack.mp3), looped/faded per video length.",
    "refs": [],
    "sub": "music"
  },
  {
    "kind": "asset",
    "id": "hazmat-scientists",
    "name": "Hazmat Scientist Trio",
    "blurb": "Three biohazard-suit gas-mask scientists (orange/teal/purple), the dwindling party of the Backrooms descent.",
    "refs": [],
    "sub": "character"
  },
  {
    "kind": "asset",
    "id": "leshy-trent",
    "name": "LESHY — Half-Tree Trent",
    "blurb": "50/50 flesh-and-bark forest spirit, never speaks, only groans/gestures. Trust-but-verify guide (swamp).",
    "refs": [],
    "sub": "character"
  },
  {
    "kind": "asset",
    "id": "oneeyed-survivor",
    "name": "One-Eyed Survivor",
    "blurb": "Big ~60yo Black man, milky scarred blind eye, green overshirt, sawn-off rifle. Grim honest guide (war of the worlds).",
    "refs": [],
    "sub": "character"
  },
  {
    "kind": "asset",
    "id": "peaceful-alien",
    "name": "Peaceful Alien (brain-in-capsule)",
    "blurb": "Floating pink-brain in a clean capsule with soft tentacles, benevolent warm glow — the welcoming lie (war of the worlds).",
    "refs": [],
    "sub": "character"
  },
  {
    "kind": "recipe",
    "id": "play-freeze-fork",
    "name": "Play-Freeze Fork Beat",
    "blurb": "Fork beat: play the clip's full action (~3.9s), then tpad-freeze the last frame for the held dilemma while a 0.5s/tick SMPTE countdown runs. The decision-moment primitive.",
    "refs": []
  },
  {
    "kind": "style",
    "id": "ps1-magic-colorful",
    "name": "PS1 Magic-School (Colorful)",
    "blurb": "Vibrant glowing PS1/PS2-era magic-castle render — floating candles, jewel-tone stained glass, sparkling motes, warm torchlight. Bright magical, NOT horror.",
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
    "kind": "recipe",
    "id": "smpte-countdown-disc",
    "name": "SMPTE 3-2-1 Countdown Disc",
    "blurb": "GSAP sweeping-ring countdown disc (3-2-1) over a fork, with soft beep ticks (2 soft + 1 final). Punches in right after the guide's command.",
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
    "kind": "asset",
    "id": "vedma-witch",
    "name": "VEDMA — Bog Witch",
    "blurb": "Beautiful (not a hag) purple-gowned pointed-hat Slavic witch with grim help. Read-the-witch guide (swamp).",
    "refs": [],
    "sub": "character"
  },
  {
    "kind": "asset",
    "id": "voss-engineer",
    "name": "VOSS — Derelict-Ship Engineer",
    "blurb": "Fat balding bearded low-poly engineer, yellow hard hat, grimy coverall, cigarette. The abrasive-but-right guide (spaceship).",
    "refs": [],
    "sub": "character"
  }
];
// ralphy:published-blocks:end

// ralphy:published-blueprints:start
export const PUBLISHED_BLUEPRINTS: Blueprint[] = [];
// ralphy:published-blueprints:end
