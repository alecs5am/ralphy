// landing/lib/library-v2/published.ts
//
// PUBLISHED entities — the append target for `landing/scripts/publish-entity.ts`
// (issue #056). This is the committed, open-source, downloadable mirror of every
// Unit / Block that has been published to the live Supabase store.
//
// Why a separate file from catalog.ts:
//   catalog.ts is the hand-curated one-time migration output. It must stay intact
//   and hand-authored. New publishes never touch it — they append here instead.
//   The loader (./index.ts) MERGES catalog + this file (concat, dedupe by id;
//   PUBLISHED wins on an id clash), so everything downstream (source.ts, the
//   feed, the detail pages) sees published entities automatically.
//
//   Block kinds are template / recipe / asset only — the look / register is a
//   unit Tag, never a block (the `style` block kind was removed).
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
    "id": "animated-fb-ad",
    "format": "motion-design",
    "title": "Animated FB Showcase Reel",
    "blurb": "A 1:1 silent motion reel that proves a tool's range — hook, a tiled showcase wall of prior outputs, a featured clip, an integration-logo marquee, and a CTA card. One opacity-gated GSAP timeline.",
    "templateId": "showcase-wall",
    "recipeIds": [
      "typewriter-reveal"
    ],
    "assetIds": [
      "brand-stickers"
    ],
    "mediaCount": 1,
    "media": [
      {
        "src": "/showcase/animated-fb-ad/ralphy-fb-ads-001-v4.mp4",
        "kind": "video",
        "aspect": "1 / 1",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/animated-fb-ad/ralphy-fb-ads-001-v4.mp4"
      }
    ],
    "date": "2026-05",
    "tags": [
      "kinetic-typography",
      "bloom"
    ]
  },
  {
    "id": "brainrot-ai-meme",
    "format": "video",
    "title": "Brainrot AI Meme",
    "blurb": "A talking AI-meme layer stacked over a hypnotic gameplay loop — the canonical brainrot split-screen kit.",
    "templateId": "story-time",
    "recipeIds": [
      "burned-captions"
    ],
    "assetIds": [
      "gameplay-loop"
    ],
    "mediaCount": 1,
    "media": [
      {
        "src": "/showcase/brainrot-ai-meme/final.mp4",
        "kind": "video",
        "aspect": "9 / 16",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/brainrot-ai-meme/final.mp4"
      }
    ],
    "date": "2026-05",
    "tags": [
      "brainrot-split"
    ]
  },
  {
    "id": "broadcast-caught-on-tv-square",
    "format": "video",
    "title": "Broadcast Caught-On-TV (Square)",
    "blurb": "A 1:1 caught-on-TV moment with real-broadcast camera grammar — sports / news / audience-cam energy.",
    "templateId": "lifestyle-montage",
    "recipeIds": [
      "broadcast-square"
    ],
    "assetIds": [],
    "mediaCount": 1,
    "media": [
      {
        "src": "/showcase/broadcast-caught-on-tv-square/scene-01-vid.mp4",
        "kind": "video",
        "aspect": "1 / 1",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/broadcast-caught-on-tv-square/scene-01-vid.mp4"
      }
    ],
    "date": "2026-05",
    "tags": [
      "photoreal"
    ]
  },
  {
    "id": "dev-tool-fb-creative-pack",
    "format": "fb-creative",
    "title": "Dev-Tool FB Creative Pack",
    "blurb": "A 32-up static Meta ad matrix for a dev tool — real-people testimonials, typography posters, proof / data-viz, memes, and niche hooks, all on-brand via site-grounding + ref discipline.",
    "templateId": "fb-creative-pack",
    "recipeIds": [
      "film-grain"
    ],
    "assetIds": [
      "studio-cyc",
      "doctor-authority"
    ],
    "mediaCount": 32,
    "media": [
      {
        "src": "/showcase/dev-tool-fb-creative-pack/01-a1-pain-face.webp",
        "kind": "image",
        "aspect": "4 / 5",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/dev-tool-fb-creative-pack/01-a1-pain-face.webp"
      },
      {
        "src": "/showcase/dev-tool-fb-creative-pack/02-a2-testimonial.webp",
        "kind": "image",
        "aspect": "4 / 5",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/dev-tool-fb-creative-pack/02-a2-testimonial.webp"
      },
      {
        "src": "/showcase/dev-tool-fb-creative-pack/03-a3-lifestyle.webp",
        "kind": "image",
        "aspect": "4 / 5",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/dev-tool-fb-creative-pack/03-a3-lifestyle.webp"
      },
      {
        "src": "/showcase/dev-tool-fb-creative-pack/04-a4-pair-prog.webp",
        "kind": "image",
        "aspect": "4 / 5",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/dev-tool-fb-creative-pack/04-a4-pair-prog.webp"
      },
      {
        "src": "/showcase/dev-tool-fb-creative-pack/05-a5-over-shoulder.webp",
        "kind": "image",
        "aspect": "4 / 5",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/dev-tool-fb-creative-pack/05-a5-over-shoulder.webp"
      },
      {
        "src": "/showcase/dev-tool-fb-creative-pack/06-a6-asian-founder.webp",
        "kind": "image",
        "aspect": "4 / 5",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/dev-tool-fb-creative-pack/06-a6-asian-founder.webp"
      },
      {
        "src": "/showcase/dev-tool-fb-creative-pack/07-a7-senior-greybeard.webp",
        "kind": "image",
        "aspect": "4 / 5",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/dev-tool-fb-creative-pack/07-a7-senior-greybeard.webp"
      },
      {
        "src": "/showcase/dev-tool-fb-creative-pack/08-a8-indie-hacker-cafe.webp",
        "kind": "image",
        "aspect": "4 / 5",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/dev-tool-fb-creative-pack/08-a8-indie-hacker-cafe.webp"
      },
      {
        "src": "/showcase/dev-tool-fb-creative-pack/09-a9-indian-dev-office.webp",
        "kind": "image",
        "aspect": "4 / 5",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/dev-tool-fb-creative-pack/09-a9-indian-dev-office.webp"
      },
      {
        "src": "/showcase/dev-tool-fb-creative-pack/10-b1-big-number.webp",
        "kind": "image",
        "aspect": "4 / 5",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/dev-tool-fb-creative-pack/10-b1-big-number.webp"
      },
      {
        "src": "/showcase/dev-tool-fb-creative-pack/11-b2-versus.webp",
        "kind": "image",
        "aspect": "4 / 5",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/dev-tool-fb-creative-pack/11-b2-versus.webp"
      },
      {
        "src": "/showcase/dev-tool-fb-creative-pack/12-b3-code-as-art.webp",
        "kind": "image",
        "aspect": "4 / 5",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/dev-tool-fb-creative-pack/12-b3-code-as-art.webp"
      },
      {
        "src": "/showcase/dev-tool-fb-creative-pack/13-b4-price-hero.webp",
        "kind": "image",
        "aspect": "4 / 5",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/dev-tool-fb-creative-pack/13-b4-price-hero.webp"
      },
      {
        "src": "/showcase/dev-tool-fb-creative-pack/14-b5-languages-grid.webp",
        "kind": "image",
        "aspect": "4 / 5",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/dev-tool-fb-creative-pack/14-b5-languages-grid.webp"
      },
      {
        "src": "/showcase/dev-tool-fb-creative-pack/15-b6-time-saved.webp",
        "kind": "image",
        "aspect": "4 / 5",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/dev-tool-fb-creative-pack/15-b6-time-saved.webp"
      },
      {
        "src": "/showcase/dev-tool-fb-creative-pack/16-b7-stats-cascade.webp",
        "kind": "image",
        "aspect": "4 / 5",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/dev-tool-fb-creative-pack/16-b7-stats-cascade.webp"
      },
      {
        "src": "/showcase/dev-tool-fb-creative-pack/17-b8-crossed-prices.webp",
        "kind": "image",
        "aspect": "4 / 5",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/dev-tool-fb-creative-pack/17-b8-crossed-prices.webp"
      },
      {
        "src": "/showcase/dev-tool-fb-creative-pack/18-c1-before-after.webp",
        "kind": "image",
        "aspect": "4 / 5",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/dev-tool-fb-creative-pack/18-c1-before-after.webp"
      },
      {
        "src": "/showcase/dev-tool-fb-creative-pack/19-c2-works-with.webp",
        "kind": "image",
        "aspect": "4 / 5",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/dev-tool-fb-creative-pack/19-c2-works-with.webp"
      },
      {
        "src": "/showcase/dev-tool-fb-creative-pack/20-c3-doc-genres.webp",
        "kind": "image",
        "aspect": "4 / 5",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/dev-tool-fb-creative-pack/20-c3-doc-genres.webp"
      },
      {
        "src": "/showcase/dev-tool-fb-creative-pack/21-c4-api-flow.webp",
        "kind": "image",
        "aspect": "4 / 5",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/dev-tool-fb-creative-pack/21-c4-api-flow.webp"
      },
      {
        "src": "/showcase/dev-tool-fb-creative-pack/22-c5-rag-stack.webp",
        "kind": "image",
        "aspect": "4 / 5",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/dev-tool-fb-creative-pack/22-c5-rag-stack.webp"
      },
      {
        "src": "/showcase/dev-tool-fb-creative-pack/23-c6-dashboard-mock.webp",
        "kind": "image",
        "aspect": "4 / 5",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/dev-tool-fb-creative-pack/23-c6-dashboard-mock.webp"
      },
      {
        "src": "/showcase/dev-tool-fb-creative-pack/24-c7-regex-vs-3-lines.webp",
        "kind": "image",
        "aspect": "4 / 5",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/dev-tool-fb-creative-pack/24-c7-regex-vs-3-lines.webp"
      },
      {
        "src": "/showcase/dev-tool-fb-creative-pack/25-d1-wojak-meme.webp",
        "kind": "image",
        "aspect": "4 / 5",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/dev-tool-fb-creative-pack/25-d1-wojak-meme.webp"
      },
      {
        "src": "/showcase/dev-tool-fb-creative-pack/26-d2-twitter-mock.webp",
        "kind": "image",
        "aspect": "4 / 5",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/dev-tool-fb-creative-pack/26-d2-twitter-mock.webp"
      },
      {
        "src": "/showcase/dev-tool-fb-creative-pack/27-d3-drake-meme.webp",
        "kind": "image",
        "aspect": "4 / 5",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/dev-tool-fb-creative-pack/27-d3-drake-meme.webp"
      },
      {
        "src": "/showcase/dev-tool-fb-creative-pack/28-d4-slack-chat.webp",
        "kind": "image",
        "aspect": "4 / 5",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/dev-tool-fb-creative-pack/28-d4-slack-chat.webp"
      },
      {
        "src": "/showcase/dev-tool-fb-creative-pack/29-d5-distracted-bf.webp",
        "kind": "image",
        "aspect": "4 / 5",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/dev-tool-fb-creative-pack/29-d5-distracted-bf.webp"
      },
      {
        "src": "/showcase/dev-tool-fb-creative-pack/30-e1-rag-hook.webp",
        "kind": "image",
        "aspect": "4 / 5",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/dev-tool-fb-creative-pack/30-e1-rag-hook.webp"
      },
      {
        "src": "/showcase/dev-tool-fb-creative-pack/31-e2-openai-credits.webp",
        "kind": "image",
        "aspect": "4 / 5",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/dev-tool-fb-creative-pack/31-e2-openai-credits.webp"
      },
      {
        "src": "/showcase/dev-tool-fb-creative-pack/32-e3-weekend-ship.webp",
        "kind": "image",
        "aspect": "4 / 5",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/dev-tool-fb-creative-pack/32-e3-weekend-ship.webp"
      }
    ],
    "date": "2026-05",
    "tags": [
      "photoreal-portrait"
    ]
  },
  {
    "id": "food-beverage",
    "format": "video",
    "title": "Ginger Pour",
    "blurb": "Appetizing macro product motion — pour, splash, glisten — engineered around a single hero drink.",
    "templateId": "product-reveal",
    "recipeIds": [
      "speed-ramp"
    ],
    "assetIds": [
      "hero-product",
      "product-set"
    ],
    "mediaCount": 1,
    "media": [
      {
        "src": "/showcase/food-beverage/ginger-recreate-001.mp4",
        "kind": "video",
        "aspect": "9 / 16",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/food-beverage/ginger-recreate-001.mp4"
      }
    ],
    "date": "2026-05",
    "tags": [
      "commercial-bright",
      "bloom"
    ]
  },
  {
    "id": "found-footage-mockumentary",
    "format": "video",
    "title": "Occult Mockumentary",
    "blurb": "A faux-documentary occult short — handheld grain, dread between cuts, the camera shouldn't be here.",
    "templateId": "story-time",
    "recipeIds": [
      "vhs-overlay",
      "film-grain",
      "noir-grade"
    ],
    "assetIds": [
      "mockumentary-room",
      "horror-bed"
    ],
    "mediaCount": 1,
    "media": [
      {
        "src": "/showcase/found-footage-mockumentary/final.mp4",
        "kind": "video",
        "aspect": "9 / 16",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/found-footage-mockumentary/final.mp4"
      }
    ],
    "date": "2026-04",
    "tags": [
      "found-footage"
    ]
  },
  {
    "id": "live-platform-motion-ad",
    "format": "motion-design",
    "title": "Live Platform Motion Ad",
    "blurb": "A kinetic-typography motion ad for a live-streaming platform — code-driven, brand-led, beat-synced.",
    "templateId": "motion-card",
    "recipeIds": [
      "chroma-split"
    ],
    "assetIds": [
      "electronic-beat"
    ],
    "mediaCount": 1,
    "media": [
      {
        "src": "/showcase/live-platform-motion-ad/twitch-fb-ads-001-v4.mp4",
        "kind": "video",
        "aspect": "16 / 9",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/live-platform-motion-ad/twitch-fb-ads-001-v4.mp4"
      }
    ],
    "date": "2026-05",
    "tags": [
      "kinetic-typography",
      "bloom"
    ]
  },
  {
    "id": "nothing-hp1-001",
    "format": "video",
    "title": "Nothing HP1 launch",
    "blurb": "A product-launch hero spot for the Nothing HP1 — a clean reveal cut engineered around the hardware.",
    "templateId": "product-reveal",
    "recipeIds": [
      "speed-ramp"
    ],
    "assetIds": [
      "hero-product"
    ],
    "mediaCount": 1,
    "media": [
      {
        "src": "/assets/showcase/nothing-hp1-001.mp4",
        "kind": "video",
        "aspect": "9 / 16",
        "poster": "/assets/showcase/posters/nothing-hp1-001.jpg",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/nothing-hp1-001/nothing-hp1-001.mp4",
        "posterStorageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/nothing-hp1-001/nothing-hp1-001.jpg"
      }
    ],
    "date": "2026-05",
    "hero": true,
    "tags": [
      "commercial-bright",
      "bloom"
    ]
  },
  {
    "id": "podcast-explainer-longform",
    "format": "video",
    "title": "Podcast Explainer (long-form, faceless)",
    "blurb": "A faceless long-form explainer cut over an audio track — overlay-driven, captioned, chapter-paced.",
    "templateId": "explainer",
    "recipeIds": [
      "burned-captions"
    ],
    "assetIds": [
      "lofi-bed"
    ],
    "mediaCount": 1,
    "media": [
      {
        "src": "/showcase/podcast-explainer-longform/final.mp4",
        "kind": "video",
        "aspect": "16 / 9",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/podcast-explainer-longform/final.mp4"
      }
    ],
    "date": "2026-05",
    "tags": [
      "swiss-editorial"
    ]
  },
  {
    "id": "ship-announcement",
    "format": "motion-design",
    "title": "Ship Announcement Card",
    "blurb": "A square typographic ship-week launch card — wordmark, manifesto, a five-row feature table, end-slate URL — revealed by a parallel typewriter primitive over a sparse cube grid.",
    "templateId": "motion-card",
    "recipeIds": [
      "typewriter-reveal"
    ],
    "assetIds": [],
    "mediaCount": 1,
    "media": [
      {
        "src": "/showcase/ship-announcement/final.mp4",
        "kind": "video",
        "aspect": "1 / 1",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/ship-announcement/final.mp4"
      }
    ],
    "date": "2026-04",
    "tags": [
      "kinetic-typography"
    ]
  },
  {
    "id": "silent-square-site-ad",
    "format": "fb-creative",
    "title": "Silent Square Site Ad",
    "blurb": "A 1:1 silent Meta feed ad built entirely from a brand's own live-site assets — opacity-gated beats, a sticker dump, a color-split bridged by the logo. Zero AI media spend.",
    "templateId": "motion-card",
    "recipeIds": [
      "typewriter-reveal"
    ],
    "assetIds": [
      "brand-stickers"
    ],
    "mediaCount": 1,
    "media": [
      {
        "src": "/showcase/silent-square-site-ad/odindoma-fb-21s-v11.mp4",
        "kind": "video",
        "aspect": "1 / 1",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/silent-square-site-ad/odindoma-fb-21s-v11.mp4"
      }
    ],
    "date": "2026-05",
    "tags": [
      "swiss-editorial"
    ]
  },
  {
    "id": "soviet-nostalgic",
    "format": "video",
    "title": "Soviet Nostalgic TikTok Ad",
    "blurb": "A faded late-Soviet home-archive ad — VHS warmth, period detail, riding the recognizable Soviet trend bed.",
    "templateId": "lifestyle-montage",
    "recipeIds": [
      "vhs-overlay",
      "film-grain"
    ],
    "assetIds": [
      "trend-soviet-bed"
    ],
    "mediaCount": 1,
    "media": [
      {
        "src": "/showcase/soviet-nostalgic/final.mp4",
        "kind": "video",
        "aspect": "9 / 16",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/soviet-nostalgic/final.mp4"
      }
    ],
    "date": "2026-04",
    "tags": [
      "soviet-nostalgic"
    ]
  },
  {
    "id": "analog-horror-fridge-001",
    "format": "video",
    "title": "Compliance Bulletin 9-D",
    "blurb": "A fake civil-defense PSA — \"your fridge is not your fridge\" — stenciled pictograms, robo-broadcast voice, layered VHS dread.",
    "templateId": "explainer",
    "recipeIds": [
      "vhs-overlay",
      "chroma-split",
      "film-grain"
    ],
    "assetIds": [],
    "mediaCount": 1,
    "media": [
      {
        "src": "/assets/showcase/analog-horror-fridge-001.mp4",
        "kind": "video",
        "aspect": "9 / 16",
        "poster": "/assets/showcase/posters/analog-horror-fridge-001.jpg",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/analog-horror-fridge-001/analog-horror-fridge-001.mp4",
        "posterStorageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/analog-horror-fridge-001/analog-horror-fridge-001.jpg"
      }
    ],
    "date": "2026-05",
    "tags": [
      "analog-horror"
    ]
  },
  {
    "id": "arena-rocker-001",
    "format": "video",
    "title": "Arena Rocker",
    "blurb": "An arena-rock performance montage in saturated cel-cartoon — bold outlines, squash-and-stretch, punchy speed ramps.",
    "templateId": "music-video",
    "recipeIds": [
      "speed-ramp"
    ],
    "assetIds": [],
    "mediaCount": 1,
    "media": [
      {
        "src": "/assets/showcase/arena-rocker-001.mp4",
        "kind": "video",
        "aspect": "16 / 9",
        "poster": "/assets/showcase/posters/arena-rocker-001.jpg",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/arena-rocker-001/arena-rocker-001.mp4",
        "posterStorageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/arena-rocker-001/arena-rocker-001.jpg"
      }
    ],
    "date": "2026-05",
    "tags": [
      "cel-cartoon"
    ]
  },
  {
    "id": "flipper-hypermotion-001",
    "format": "video",
    "title": "Flipper Zero Ad",
    "blurb": "A Japanese-hypermotion product reveal — punchy speed ramps, glossy bloom, the hardware as the hero.",
    "templateId": "product-reveal",
    "recipeIds": [
      "speed-ramp"
    ],
    "assetIds": [
      "hero-product",
      "product-set"
    ],
    "mediaCount": 1,
    "media": [
      {
        "src": "/assets/showcase/flipper-hypermotion-001.mp4",
        "kind": "video",
        "aspect": "9 / 16",
        "poster": "/assets/showcase/posters/flipper-hypermotion-001.jpg",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/flipper-hypermotion-001/flipper-hypermotion-001.mp4",
        "posterStorageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/flipper-hypermotion-001/flipper-hypermotion-001.jpg"
      }
    ],
    "date": "2026-05",
    "tags": [
      "cgi-render",
      "bloom"
    ]
  },
  {
    "id": "fruit-drama-001",
    "format": "video",
    "title": "Fruit Drama",
    "blurb": "An anthropomorphic-object short — produce lives a tiny dramatized arc from its own POV, glossy 3D bloom.",
    "templateId": "pov-narrative",
    "recipeIds": [],
    "assetIds": [],
    "mediaCount": 1,
    "media": [
      {
        "src": "/assets/showcase/fruit-drama-001.mp4",
        "kind": "video",
        "aspect": "9 / 16",
        "poster": "/assets/showcase/posters/fruit-drama-001.jpg",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/fruit-drama-001/fruit-drama-001.mp4",
        "posterStorageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/fruit-drama-001/fruit-drama-001.jpg"
      }
    ],
    "date": "2026-05",
    "tags": [
      "3d-cgi",
      "bloom"
    ]
  },
  {
    "id": "glitter-cream-001",
    "format": "video",
    "title": "Glitter-Cream Review",
    "blurb": "A before/after UGC selfie review — establish the dull state, swipe, reveal the high-key commercial glow-up.",
    "templateId": "before-after",
    "recipeIds": [
      "speed-ramp"
    ],
    "assetIds": [
      "hero-product"
    ],
    "mediaCount": 1,
    "media": [
      {
        "src": "/assets/showcase/glitter-cream-001.mp4",
        "kind": "video",
        "aspect": "9 / 16",
        "poster": "/assets/showcase/posters/glitter-cream-001.jpg",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/glitter-cream-001/glitter-cream-001.mp4",
        "posterStorageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/glitter-cream-001/glitter-cream-001.jpg"
      }
    ],
    "date": "2026-05",
    "tags": [
      "commercial-bright"
    ]
  },
  {
    "id": "noski-people-001",
    "format": "video",
    "title": "Socks or People",
    "blurb": "A deadpan two-hander talking-head bit — photoreal humans, naturalistic candid light, anti-AI-slop realism.",
    "templateId": "talking-head",
    "recipeIds": [],
    "assetIds": [],
    "mediaCount": 1,
    "media": [
      {
        "src": "/assets/showcase/noski-people-001.mp4",
        "kind": "video",
        "aspect": "9 / 16",
        "poster": "/assets/showcase/posters/noski-people-001.jpg",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/noski-people-001/noski-people-001.mp4",
        "posterStorageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/noski-people-001/noski-people-001.jpg"
      }
    ],
    "date": "2026-05",
    "tags": [
      "photoreal-portrait"
    ]
  },
  {
    "id": "playdate-pixel-001",
    "format": "video",
    "title": "Playdate Reveal",
    "blurb": "A handheld-console product reveal rendered in crunchy pixel-art — limited palette, dithered gradients, retro charm.",
    "templateId": "product-reveal",
    "recipeIds": [],
    "assetIds": [
      "hero-product"
    ],
    "mediaCount": 1,
    "media": [
      {
        "src": "/assets/showcase/playdate-pixel-001.mp4",
        "kind": "video",
        "aspect": "9 / 16",
        "poster": "/assets/showcase/posters/playdate-pixel-001.jpg",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/playdate-pixel-001/playdate-pixel-001.mp4",
        "posterStorageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/playdate-pixel-001/playdate-pixel-001.jpg"
      }
    ],
    "date": "2026-05",
    "tags": [
      "pixel-art"
    ]
  },
  {
    "id": "ralphy-vs-higgsfield-001",
    "format": "video",
    "title": "Pick a Door — Ralphy vs Higgsfield",
    "blurb": "A fork-in-the-path decision reveal in analog-horror register — two doors, a beat of dread, then the pick.",
    "templateId": "choose-the-door",
    "recipeIds": [
      "vhs-overlay",
      "chroma-split",
      "film-grain"
    ],
    "assetIds": [],
    "mediaCount": 1,
    "media": [
      {
        "src": "/assets/showcase/ralphy-vs-higgsfield-001.mp4",
        "kind": "video",
        "aspect": "9 / 16",
        "poster": "/assets/showcase/posters/ralphy-vs-higgsfield-001.jpg",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/ralphy-vs-higgsfield-001/ralphy-vs-higgsfield-001.mp4",
        "posterStorageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/ralphy-vs-higgsfield-001/ralphy-vs-higgsfield-001.jpg"
      }
    ],
    "date": "2026-05",
    "tags": [
      "analog-horror"
    ]
  },
  {
    "id": "skater-spiderverse-001",
    "format": "video",
    "title": "Skater Duel",
    "blurb": "A beat-driven skate showdown cut as inked comic panels — halftone shading, chroma-split edges, bold gutters.",
    "templateId": "music-video",
    "recipeIds": [
      "chroma-split"
    ],
    "assetIds": [],
    "mediaCount": 1,
    "media": [
      {
        "src": "/assets/showcase/skater-spiderverse-001.mp4",
        "kind": "video",
        "aspect": "16 / 9",
        "poster": "/assets/showcase/posters/skater-spiderverse-001.jpg",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/skater-spiderverse-001/skater-spiderverse-001.mp4",
        "posterStorageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/skater-spiderverse-001/skater-spiderverse-001.jpg"
      }
    ],
    "date": "2026-05",
    "tags": [
      "comic-panel",
      "halftone"
    ]
  },
  {
    "id": "tokyo-y2k-001",
    "format": "video",
    "title": "Tokyo Y2K",
    "blurb": "A first-person night walk through a neon-soaked Tokyo alley — rain spatter, crushed blacks, dreamy bloom.",
    "templateId": "pov-walk",
    "recipeIds": [
      "noir-grade"
    ],
    "assetIds": [
      "tokyo-alley"
    ],
    "mediaCount": 1,
    "media": [
      {
        "src": "/assets/showcase/tokyo-y2k-001.mp4",
        "kind": "video",
        "aspect": "16 / 9",
        "poster": "/assets/showcase/posters/tokyo-y2k-001.jpg",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/tokyo-y2k-001/tokyo-y2k-001.mp4",
        "posterStorageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/tokyo-y2k-001/tokyo-y2k-001.jpg"
      }
    ],
    "date": "2026-05",
    "tags": [
      "cinematic",
      "rain-overlay",
      "bloom"
    ]
  },
  {
    "id": "multi-style-carousel-acid",
    "format": "carousel",
    "title": "Acid-Graphics Carousel",
    "blurb": "A five-slide swipeable deck in an acid-graphics register — chrome type, blown-out gradients, rave-flyer maximalism around the mascot.",
    "templateId": "carousel-deck",
    "recipeIds": [
      "chroma-split"
    ],
    "assetIds": [
      "vpn-mascot"
    ],
    "mediaCount": 5,
    "media": [
      {
        "src": "/showcase/multi-style-carousel/acid-01.webp",
        "kind": "image",
        "aspect": "4 / 5",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/multi-style-carousel-acid/acid-01.webp"
      },
      {
        "src": "/showcase/multi-style-carousel/acid-02.webp",
        "kind": "image",
        "aspect": "4 / 5",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/multi-style-carousel-acid/acid-02.webp"
      },
      {
        "src": "/showcase/multi-style-carousel/acid-03.webp",
        "kind": "image",
        "aspect": "4 / 5",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/multi-style-carousel-acid/acid-03.webp"
      },
      {
        "src": "/showcase/multi-style-carousel/acid-04.webp",
        "kind": "image",
        "aspect": "4 / 5",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/multi-style-carousel-acid/acid-04.webp"
      },
      {
        "src": "/showcase/multi-style-carousel/acid-05.webp",
        "kind": "image",
        "aspect": "4 / 5",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/multi-style-carousel-acid/acid-05.webp"
      }
    ],
    "date": "2026-05",
    "tags": [
      "acid-graphics",
      "halftone"
    ]
  },
  {
    "id": "multi-style-carousel-club",
    "format": "carousel",
    "title": "Club-Flyer Carousel",
    "blurb": "A five-slide swipeable deck in a club-flyer register — neon-on-black, blown gradients, late-night party type around the mascot.",
    "templateId": "carousel-deck",
    "recipeIds": [
      "chroma-split"
    ],
    "assetIds": [
      "vpn-mascot"
    ],
    "mediaCount": 5,
    "media": [
      {
        "src": "/showcase/multi-style-carousel/club-01.webp",
        "kind": "image",
        "aspect": "4 / 5",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/multi-style-carousel-club/club-01.webp"
      },
      {
        "src": "/showcase/multi-style-carousel/club-02.webp",
        "kind": "image",
        "aspect": "4 / 5",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/multi-style-carousel-club/club-02.webp"
      },
      {
        "src": "/showcase/multi-style-carousel/club-03.webp",
        "kind": "image",
        "aspect": "4 / 5",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/multi-style-carousel-club/club-03.webp"
      },
      {
        "src": "/showcase/multi-style-carousel/club-04.webp",
        "kind": "image",
        "aspect": "4 / 5",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/multi-style-carousel-club/club-04.webp"
      },
      {
        "src": "/showcase/multi-style-carousel/club-05.webp",
        "kind": "image",
        "aspect": "4 / 5",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/multi-style-carousel-club/club-05.webp"
      }
    ],
    "date": "2026-05",
    "tags": [
      "club-flyer",
      "bloom"
    ]
  },
  {
    "id": "multi-style-carousel-punk",
    "format": "carousel",
    "title": "Punk-Collage Carousel",
    "blurb": "A five-slide swipeable deck in a punk-collage register — xerox cut-and-paste, ransom-note type, torn edges around the mascot.",
    "templateId": "carousel-deck",
    "recipeIds": [],
    "assetIds": [
      "vpn-mascot"
    ],
    "mediaCount": 5,
    "media": [
      {
        "src": "/showcase/multi-style-carousel/punk-01.webp",
        "kind": "image",
        "aspect": "4 / 5",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/multi-style-carousel-punk/punk-01.webp"
      },
      {
        "src": "/showcase/multi-style-carousel/punk-02.webp",
        "kind": "image",
        "aspect": "4 / 5",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/multi-style-carousel-punk/punk-02.webp"
      },
      {
        "src": "/showcase/multi-style-carousel/punk-03.webp",
        "kind": "image",
        "aspect": "4 / 5",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/multi-style-carousel-punk/punk-03.webp"
      },
      {
        "src": "/showcase/multi-style-carousel/punk-04.webp",
        "kind": "image",
        "aspect": "4 / 5",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/multi-style-carousel-punk/punk-04.webp"
      },
      {
        "src": "/showcase/multi-style-carousel/punk-05.webp",
        "kind": "image",
        "aspect": "4 / 5",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/multi-style-carousel-punk/punk-05.webp"
      }
    ],
    "date": "2026-05",
    "tags": [
      "punk-collage",
      "halftone"
    ]
  },
  {
    "id": "multi-style-carousel-riso",
    "format": "carousel",
    "title": "Risograph Carousel",
    "blurb": "A five-slide swipeable deck in a risograph register — paper-grain spot inks, mis-registered overprint, soft halftone around the mascot.",
    "templateId": "carousel-deck",
    "recipeIds": [
      "film-grain"
    ],
    "assetIds": [
      "vpn-mascot"
    ],
    "mediaCount": 5,
    "media": [
      {
        "src": "/showcase/multi-style-carousel/riso-01.webp",
        "kind": "image",
        "aspect": "4 / 5",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/multi-style-carousel-riso/riso-01.webp"
      },
      {
        "src": "/showcase/multi-style-carousel/riso-02.webp",
        "kind": "image",
        "aspect": "4 / 5",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/multi-style-carousel-riso/riso-02.webp"
      },
      {
        "src": "/showcase/multi-style-carousel/riso-03.webp",
        "kind": "image",
        "aspect": "4 / 5",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/multi-style-carousel-riso/riso-03.webp"
      },
      {
        "src": "/showcase/multi-style-carousel/riso-04.webp",
        "kind": "image",
        "aspect": "4 / 5",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/multi-style-carousel-riso/riso-04.webp"
      },
      {
        "src": "/showcase/multi-style-carousel/riso-05.webp",
        "kind": "image",
        "aspect": "4 / 5",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/multi-style-carousel-riso/riso-05.webp"
      }
    ],
    "date": "2026-05",
    "tags": [
      "risograph",
      "halftone"
    ]
  },
  {
    "id": "multi-style-carousel-swiss",
    "format": "carousel",
    "title": "Swiss-Editorial Carousel",
    "blurb": "A five-slide swipeable deck in a swiss-editorial register — grid-locked, restrained, all about the type and the whitespace around the mascot.",
    "templateId": "carousel-deck",
    "recipeIds": [],
    "assetIds": [
      "vpn-mascot"
    ],
    "mediaCount": 5,
    "media": [
      {
        "src": "/showcase/multi-style-carousel/swiss-01.webp",
        "kind": "image",
        "aspect": "4 / 5",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/multi-style-carousel-swiss/swiss-01.webp"
      },
      {
        "src": "/showcase/multi-style-carousel/swiss-02.webp",
        "kind": "image",
        "aspect": "4 / 5",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/multi-style-carousel-swiss/swiss-02.webp"
      },
      {
        "src": "/showcase/multi-style-carousel/swiss-03.webp",
        "kind": "image",
        "aspect": "4 / 5",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/multi-style-carousel-swiss/swiss-03.webp"
      },
      {
        "src": "/showcase/multi-style-carousel/swiss-04.webp",
        "kind": "image",
        "aspect": "4 / 5",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/multi-style-carousel-swiss/swiss-04.webp"
      },
      {
        "src": "/showcase/multi-style-carousel/swiss-05.webp",
        "kind": "image",
        "aspect": "4 / 5",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/multi-style-carousel-swiss/swiss-05.webp"
      }
    ],
    "date": "2026-05",
    "tags": [
      "swiss-editorial"
    ]
  },
  {
    "id": "multi-style-carousel-zine",
    "format": "carousel",
    "title": "Zine-Cutout Carousel",
    "blurb": "A five-slide swipeable deck in a zine cut-out register — scissored paper shapes, tape, marker scrawl, scrapbook layering around the mascot.",
    "templateId": "carousel-deck",
    "recipeIds": [],
    "assetIds": [
      "vpn-mascot"
    ],
    "mediaCount": 5,
    "media": [
      {
        "src": "/showcase/multi-style-carousel/zine-01.webp",
        "kind": "image",
        "aspect": "4 / 5",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/multi-style-carousel-zine/zine-01.webp"
      },
      {
        "src": "/showcase/multi-style-carousel/zine-02.webp",
        "kind": "image",
        "aspect": "4 / 5",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/multi-style-carousel-zine/zine-02.webp"
      },
      {
        "src": "/showcase/multi-style-carousel/zine-03.webp",
        "kind": "image",
        "aspect": "4 / 5",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/multi-style-carousel-zine/zine-03.webp"
      },
      {
        "src": "/showcase/multi-style-carousel/zine-04.webp",
        "kind": "image",
        "aspect": "4 / 5",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/multi-style-carousel-zine/zine-04.webp"
      },
      {
        "src": "/showcase/multi-style-carousel/zine-05.webp",
        "kind": "image",
        "aspect": "4 / 5",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/multi-style-carousel-zine/zine-05.webp"
      }
    ],
    "date": "2026-05",
    "tags": [
      "zine-cutout",
      "halftone"
    ]
  },
  {
    "id": "vpn-sticker-pack-clean",
    "format": "sticker-pack",
    "title": "Mascot Sticker Pack — Clean",
    "blurb": "The VPN shield mascot across 32 reaction states — a flat-fill cel-cartoon die-cut set with bold outlines and soft bloom.",
    "templateId": "sticker-set",
    "recipeIds": [],
    "assetIds": [
      "vpn-mascot"
    ],
    "mediaCount": 32,
    "media": [
      {
        "src": "/showcase/vpn-sticker-pack/clean-01-hi-beg.webp",
        "kind": "image",
        "aspect": "1 / 1",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/vpn-sticker-pack-clean/clean-01-hi-beg.webp"
      },
      {
        "src": "/showcase/vpn-sticker-pack/clean-02-popcorn.webp",
        "kind": "image",
        "aspect": "1 / 1",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/vpn-sticker-pack-clean/clean-02-popcorn.webp"
      },
      {
        "src": "/showcase/vpn-sticker-pack/clean-03-shy.webp",
        "kind": "image",
        "aspect": "1 / 1",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/vpn-sticker-pack-clean/clean-03-shy.webp"
      },
      {
        "src": "/showcase/vpn-sticker-pack/clean-04-busy.webp",
        "kind": "image",
        "aspect": "1 / 1",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/vpn-sticker-pack-clean/clean-04-busy.webp"
      },
      {
        "src": "/showcase/vpn-sticker-pack/clean-05-fu.webp",
        "kind": "image",
        "aspect": "1 / 1",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/vpn-sticker-pack-clean/clean-05-fu.webp"
      },
      {
        "src": "/showcase/vpn-sticker-pack/clean-06-love-mask.webp",
        "kind": "image",
        "aspect": "1 / 1",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/vpn-sticker-pack-clean/clean-06-love-mask.webp"
      },
      {
        "src": "/showcase/vpn-sticker-pack/clean-07-globe.webp",
        "kind": "image",
        "aspect": "1 / 1",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/vpn-sticker-pack-clean/clean-07-globe.webp"
      },
      {
        "src": "/showcase/vpn-sticker-pack/clean-08-tableflip.webp",
        "kind": "image",
        "aspect": "1 / 1",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/vpn-sticker-pack-clean/clean-08-tableflip.webp"
      },
      {
        "src": "/showcase/vpn-sticker-pack/clean-09-shrug.webp",
        "kind": "image",
        "aspect": "1 / 1",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/vpn-sticker-pack-clean/clean-09-shrug.webp"
      },
      {
        "src": "/showcase/vpn-sticker-pack/clean-10-point.webp",
        "kind": "image",
        "aspect": "1 / 1",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/vpn-sticker-pack-clean/clean-10-point.webp"
      },
      {
        "src": "/showcase/vpn-sticker-pack/clean-11-facepalm.webp",
        "kind": "image",
        "aspect": "1 / 1",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/vpn-sticker-pack-clean/clean-11-facepalm.webp"
      },
      {
        "src": "/showcase/vpn-sticker-pack/clean-12-thisisfine.webp",
        "kind": "image",
        "aspect": "1 / 1",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/vpn-sticker-pack-clean/clean-12-thisisfine.webp"
      },
      {
        "src": "/showcase/vpn-sticker-pack/clean-13-explosion.webp",
        "kind": "image",
        "aspect": "1 / 1",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/vpn-sticker-pack-clean/clean-13-explosion.webp"
      },
      {
        "src": "/showcase/vpn-sticker-pack/clean-14-micdrop.webp",
        "kind": "image",
        "aspect": "1 / 1",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/vpn-sticker-pack-clean/clean-14-micdrop.webp"
      },
      {
        "src": "/showcase/vpn-sticker-pack/clean-15-cry.webp",
        "kind": "image",
        "aspect": "1 / 1",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/vpn-sticker-pack-clean/clean-15-cry.webp"
      },
      {
        "src": "/showcase/vpn-sticker-pack/clean-16-skull.webp",
        "kind": "image",
        "aspect": "1 / 1",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/vpn-sticker-pack-clean/clean-16-skull.webp"
      },
      {
        "src": "/showcase/vpn-sticker-pack/clean-17-sus.webp",
        "kind": "image",
        "aspect": "1 / 1",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/vpn-sticker-pack-clean/clean-17-sus.webp"
      },
      {
        "src": "/showcase/vpn-sticker-pack/clean-18-mindblown.webp",
        "kind": "image",
        "aspect": "1 / 1",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/vpn-sticker-pack-clean/clean-18-mindblown.webp"
      },
      {
        "src": "/showcase/vpn-sticker-pack/clean-19-sweat.webp",
        "kind": "image",
        "aspect": "1 / 1",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/vpn-sticker-pack-clean/clean-19-sweat.webp"
      },
      {
        "src": "/showcase/vpn-sticker-pack/clean-20-clown.webp",
        "kind": "image",
        "aspect": "1 / 1",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/vpn-sticker-pack-clean/clean-20-clown.webp"
      },
      {
        "src": "/showcase/vpn-sticker-pack/clean-21-rizz.webp",
        "kind": "image",
        "aspect": "1 / 1",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/vpn-sticker-pack-clean/clean-21-rizz.webp"
      },
      {
        "src": "/showcase/vpn-sticker-pack/clean-22-sigma.webp",
        "kind": "image",
        "aspect": "1 / 1",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/vpn-sticker-pack-clean/clean-22-sigma.webp"
      },
      {
        "src": "/showcase/vpn-sticker-pack/clean-23-money.webp",
        "kind": "image",
        "aspect": "1 / 1",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/vpn-sticker-pack-clean/clean-23-money.webp"
      },
      {
        "src": "/showcase/vpn-sticker-pack/clean-24-salute.webp",
        "kind": "image",
        "aspect": "1 / 1",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/vpn-sticker-pack-clean/clean-24-salute.webp"
      },
      {
        "src": "/showcase/vpn-sticker-pack/clean-25-wait.webp",
        "kind": "image",
        "aspect": "1 / 1",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/vpn-sticker-pack-clean/clean-25-wait.webp"
      },
      {
        "src": "/showcase/vpn-sticker-pack/clean-26-lurk.webp",
        "kind": "image",
        "aspect": "1 / 1",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/vpn-sticker-pack-clean/clean-26-lurk.webp"
      },
      {
        "src": "/showcase/vpn-sticker-pack/clean-27-idea.webp",
        "kind": "image",
        "aspect": "1 / 1",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/vpn-sticker-pack-clean/clean-27-idea.webp"
      },
      {
        "src": "/showcase/vpn-sticker-pack/clean-28-no.webp",
        "kind": "image",
        "aspect": "1 / 1",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/vpn-sticker-pack-clean/clean-28-no.webp"
      },
      {
        "src": "/showcase/vpn-sticker-pack/clean-29-sleepy.webp",
        "kind": "image",
        "aspect": "1 / 1",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/vpn-sticker-pack-clean/clean-29-sleepy.webp"
      },
      {
        "src": "/showcase/vpn-sticker-pack/clean-30-sick.webp",
        "kind": "image",
        "aspect": "1 / 1",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/vpn-sticker-pack-clean/clean-30-sick.webp"
      },
      {
        "src": "/showcase/vpn-sticker-pack/clean-31-cold.webp",
        "kind": "image",
        "aspect": "1 / 1",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/vpn-sticker-pack-clean/clean-31-cold.webp"
      },
      {
        "src": "/showcase/vpn-sticker-pack/clean-32-bigw.webp",
        "kind": "image",
        "aspect": "1 / 1",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/vpn-sticker-pack-clean/clean-32-bigw.webp"
      }
    ],
    "date": "2026-05",
    "tags": [
      "cel-cartoon",
      "bloom"
    ]
  },
  {
    "id": "vpn-sticker-pack-outline",
    "format": "sticker-pack",
    "title": "Mascot Sticker Pack — Outline",
    "blurb": "The same VPN shield mascot across 32 reaction states in a paper-grain riso outline variant — spot-ink overprint and soft halftone texture.",
    "templateId": "sticker-set",
    "recipeIds": [
      "film-grain"
    ],
    "assetIds": [
      "vpn-mascot"
    ],
    "mediaCount": 32,
    "media": [
      {
        "src": "/showcase/vpn-sticker-pack/outline-01-hi-beg.webp",
        "kind": "image",
        "aspect": "1 / 1",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/vpn-sticker-pack-outline/outline-01-hi-beg.webp"
      },
      {
        "src": "/showcase/vpn-sticker-pack/outline-02-popcorn.webp",
        "kind": "image",
        "aspect": "1 / 1",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/vpn-sticker-pack-outline/outline-02-popcorn.webp"
      },
      {
        "src": "/showcase/vpn-sticker-pack/outline-03-shy.webp",
        "kind": "image",
        "aspect": "1 / 1",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/vpn-sticker-pack-outline/outline-03-shy.webp"
      },
      {
        "src": "/showcase/vpn-sticker-pack/outline-04-busy.webp",
        "kind": "image",
        "aspect": "1 / 1",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/vpn-sticker-pack-outline/outline-04-busy.webp"
      },
      {
        "src": "/showcase/vpn-sticker-pack/outline-05-fu.webp",
        "kind": "image",
        "aspect": "1 / 1",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/vpn-sticker-pack-outline/outline-05-fu.webp"
      },
      {
        "src": "/showcase/vpn-sticker-pack/outline-06-love-mask.webp",
        "kind": "image",
        "aspect": "1 / 1",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/vpn-sticker-pack-outline/outline-06-love-mask.webp"
      },
      {
        "src": "/showcase/vpn-sticker-pack/outline-07-globe.webp",
        "kind": "image",
        "aspect": "1 / 1",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/vpn-sticker-pack-outline/outline-07-globe.webp"
      },
      {
        "src": "/showcase/vpn-sticker-pack/outline-08-tableflip.webp",
        "kind": "image",
        "aspect": "1 / 1",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/vpn-sticker-pack-outline/outline-08-tableflip.webp"
      },
      {
        "src": "/showcase/vpn-sticker-pack/outline-09-shrug.webp",
        "kind": "image",
        "aspect": "1 / 1",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/vpn-sticker-pack-outline/outline-09-shrug.webp"
      },
      {
        "src": "/showcase/vpn-sticker-pack/outline-10-point.webp",
        "kind": "image",
        "aspect": "1 / 1",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/vpn-sticker-pack-outline/outline-10-point.webp"
      },
      {
        "src": "/showcase/vpn-sticker-pack/outline-11-facepalm.webp",
        "kind": "image",
        "aspect": "1 / 1",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/vpn-sticker-pack-outline/outline-11-facepalm.webp"
      },
      {
        "src": "/showcase/vpn-sticker-pack/outline-12-thisisfine.webp",
        "kind": "image",
        "aspect": "1 / 1",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/vpn-sticker-pack-outline/outline-12-thisisfine.webp"
      },
      {
        "src": "/showcase/vpn-sticker-pack/outline-13-explosion.webp",
        "kind": "image",
        "aspect": "1 / 1",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/vpn-sticker-pack-outline/outline-13-explosion.webp"
      },
      {
        "src": "/showcase/vpn-sticker-pack/outline-14-micdrop.webp",
        "kind": "image",
        "aspect": "1 / 1",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/vpn-sticker-pack-outline/outline-14-micdrop.webp"
      },
      {
        "src": "/showcase/vpn-sticker-pack/outline-15-cry.webp",
        "kind": "image",
        "aspect": "1 / 1",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/vpn-sticker-pack-outline/outline-15-cry.webp"
      },
      {
        "src": "/showcase/vpn-sticker-pack/outline-16-skull.webp",
        "kind": "image",
        "aspect": "1 / 1",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/vpn-sticker-pack-outline/outline-16-skull.webp"
      },
      {
        "src": "/showcase/vpn-sticker-pack/outline-17-sus.webp",
        "kind": "image",
        "aspect": "1 / 1",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/vpn-sticker-pack-outline/outline-17-sus.webp"
      },
      {
        "src": "/showcase/vpn-sticker-pack/outline-18-mindblown.webp",
        "kind": "image",
        "aspect": "1 / 1",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/vpn-sticker-pack-outline/outline-18-mindblown.webp"
      },
      {
        "src": "/showcase/vpn-sticker-pack/outline-19-sweat.webp",
        "kind": "image",
        "aspect": "1 / 1",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/vpn-sticker-pack-outline/outline-19-sweat.webp"
      },
      {
        "src": "/showcase/vpn-sticker-pack/outline-20-clown.webp",
        "kind": "image",
        "aspect": "1 / 1",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/vpn-sticker-pack-outline/outline-20-clown.webp"
      },
      {
        "src": "/showcase/vpn-sticker-pack/outline-21-rizz.webp",
        "kind": "image",
        "aspect": "1 / 1",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/vpn-sticker-pack-outline/outline-21-rizz.webp"
      },
      {
        "src": "/showcase/vpn-sticker-pack/outline-22-sigma.webp",
        "kind": "image",
        "aspect": "1 / 1",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/vpn-sticker-pack-outline/outline-22-sigma.webp"
      },
      {
        "src": "/showcase/vpn-sticker-pack/outline-23-money.webp",
        "kind": "image",
        "aspect": "1 / 1",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/vpn-sticker-pack-outline/outline-23-money.webp"
      },
      {
        "src": "/showcase/vpn-sticker-pack/outline-24-salute.webp",
        "kind": "image",
        "aspect": "1 / 1",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/vpn-sticker-pack-outline/outline-24-salute.webp"
      },
      {
        "src": "/showcase/vpn-sticker-pack/outline-25-wait.webp",
        "kind": "image",
        "aspect": "1 / 1",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/vpn-sticker-pack-outline/outline-25-wait.webp"
      },
      {
        "src": "/showcase/vpn-sticker-pack/outline-26-lurk.webp",
        "kind": "image",
        "aspect": "1 / 1",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/vpn-sticker-pack-outline/outline-26-lurk.webp"
      },
      {
        "src": "/showcase/vpn-sticker-pack/outline-27-idea.webp",
        "kind": "image",
        "aspect": "1 / 1",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/vpn-sticker-pack-outline/outline-27-idea.webp"
      },
      {
        "src": "/showcase/vpn-sticker-pack/outline-28-no.webp",
        "kind": "image",
        "aspect": "1 / 1",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/vpn-sticker-pack-outline/outline-28-no.webp"
      },
      {
        "src": "/showcase/vpn-sticker-pack/outline-29-sleepy.webp",
        "kind": "image",
        "aspect": "1 / 1",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/vpn-sticker-pack-outline/outline-29-sleepy.webp"
      },
      {
        "src": "/showcase/vpn-sticker-pack/outline-30-sick.webp",
        "kind": "image",
        "aspect": "1 / 1",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/vpn-sticker-pack-outline/outline-30-sick.webp"
      },
      {
        "src": "/showcase/vpn-sticker-pack/outline-31-cold.webp",
        "kind": "image",
        "aspect": "1 / 1",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/vpn-sticker-pack-outline/outline-31-cold.webp"
      },
      {
        "src": "/showcase/vpn-sticker-pack/outline-32-bigw.webp",
        "kind": "image",
        "aspect": "1 / 1",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/vpn-sticker-pack-outline/outline-32-bigw.webp"
      }
    ],
    "date": "2026-05",
    "tags": [
      "risograph",
      "halftone"
    ]
  },
  {
    "id": "streetwear-drop-poster-boom",
    "format": "poster",
    "title": "Streetwear Drop Poster — Boom",
    "blurb": "A poster-as-landing-page for a streetwear drop — massive beveled slab wordmark, chest-up character hero, DIY vinyl-sticker collage, vivid gradient. The \"boom\" punchline cut.",
    "templateId": "product-reveal",
    "recipeIds": [],
    "assetIds": [
      "brand-stickers"
    ],
    "mediaCount": 1,
    "media": [
      {
        "src": "/showcase/streetwear-drop-poster/variant-01-boom.webp",
        "kind": "image",
        "aspect": "4 / 5",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/streetwear-drop-poster-boom/variant-01-boom.webp"
      }
    ],
    "date": "2026-05",
    "tags": [
      "y2k-streetwear",
      "halftone"
    ]
  },
  {
    "id": "streetwear-drop-poster-dang",
    "format": "poster",
    "title": "Streetwear Drop Poster — Dang",
    "blurb": "A poster-as-landing-page for a streetwear drop — massive beveled slab wordmark, chest-up character hero, DIY vinyl-sticker collage, vivid gradient. The \"dang\" punchline cut.",
    "templateId": "product-reveal",
    "recipeIds": [],
    "assetIds": [
      "brand-stickers"
    ],
    "mediaCount": 1,
    "media": [
      {
        "src": "/showcase/streetwear-drop-poster/variant-02-dang.webp",
        "kind": "image",
        "aspect": "4 / 5",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/streetwear-drop-poster-dang/variant-02-dang.webp"
      }
    ],
    "date": "2026-05",
    "tags": [
      "y2k-streetwear",
      "halftone"
    ]
  },
  {
    "id": "streetwear-drop-poster-yikes",
    "format": "poster",
    "title": "Streetwear Drop Poster — Yikes",
    "blurb": "A poster-as-landing-page for a streetwear drop — massive beveled slab wordmark, chest-up character hero, DIY vinyl-sticker collage, vivid gradient. The \"yikes\" punchline cut.",
    "templateId": "product-reveal",
    "recipeIds": [],
    "assetIds": [
      "brand-stickers"
    ],
    "mediaCount": 1,
    "media": [
      {
        "src": "/showcase/streetwear-drop-poster/variant-03-yikes.webp",
        "kind": "image",
        "aspect": "4 / 5",
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/units/streetwear-drop-poster-yikes/variant-03-yikes.webp"
      }
    ],
    "date": "2026-05",
    "tags": [
      "y2k-streetwear",
      "halftone"
    ]
  },
  {
    "id": "voxel-fork",
    "format": "image",
    "title": "Voxel Horror Fork",
    "blurb": "First-person lantern at a fork in the path — armadillo by the mine, gnome with umbrella, lighthouse beam through the rain. Voxel horror-game still.",
    "templateId": "choose-the-door",
    "recipeIds": [
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
    ],
    "tags": [
      "voxel-night-rain",
      "rain-overlay",
      "lantern-glow"
    ]
  },
  {
    "id": "choose-path-voxel-en",
    "format": "video",
    "title": "Choose Your Path — voxel horror gauntlet (EN)",
    "blurb": "Branching POV horror: pick a guide, survive a chain of 50/50 freeze-timer forks. PS1/voxel register. English VO.",
    "templateId": "choose-your-path-gauntlet",
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
    ],
    "tags": [
      "voxel-night-rain"
    ]
  },
  {
    "id": "nyastics-emotes-final",
    "format": "sticker-pack",
    "title": "Free Air — 40 emote stickers FINAL (TG-ready)",
    "blurb": "Final 40 Free Air mascot emote stickers (hippo-pack pose port, client IP). gpt-5.4-image-2 double-ref, green-keyed, no outline, 512px transparent PNG. 3 borderline poses (walk/aww/sad) re-rolled and swapped to best variant. Ready for @Stickers upload.",
    "templateId": "",
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
    ],
    "tags": [
      "analog-horror"
    ]
  },
  {
    "id": "choose-spaceship",
    "format": "video",
    "title": "Choose Your Guide: Derelict Ship",
    "blurb": "PS1 sci-fi horror: soothing ship-AI vs abrasive engineer",
    "templateId": "choose-your-path-gauntlet",
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
    ],
    "tags": [
      "analog-horror"
    ]
  },
  {
    "id": "choose-swamp",
    "format": "video",
    "title": "Choose Your Guide: The Swamp",
    "blurb": "PS1 Slavic folk-horror: read the witch, trust-but-verify the leshy",
    "templateId": "choose-your-path-gauntlet",
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
    ],
    "tags": [
      "analog-horror"
    ]
  },
  {
    "id": "choose-backrooms",
    "format": "video",
    "title": "Choose Your Path: Backrooms",
    "blurb": "PS1 liminal descent, party of 4 dwindles to 1, blue-pipe subversion",
    "templateId": "choose-your-path-gauntlet",
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
    ],
    "tags": [
      "analog-horror"
    ]
  },
  {
    "id": "choose-warofworlds",
    "format": "video",
    "title": "Choose Your Guide: War of the Worlds",
    "blurb": "PS1 invasion horror: gentle-alien trap vs grim survivor",
    "templateId": "choose-your-path-gauntlet",
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
    ],
    "tags": [
      "analog-horror"
    ]
  },
  {
    "id": "choose-magicschool",
    "format": "video",
    "title": "Choose Your Path: Magic School",
    "blurb": "Colorful PS1 magic-school dash: staircases, living armor, portals, Peeves",
    "templateId": "choose-your-path-gauntlet",
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
    ],
    "tags": [
      "ps1-magic-colorful"
    ]
  }
];
// ralphy:published-units:end

// ralphy:published-blocks:start
export const PUBLISHED_BLOCKS: Block[] = [
  {
    "kind": "template",
    "id": "asmr-sensory",
    "name": "ASMR sensory",
    "blurb": "Slow, close, trigger-led — no narrative arc, just sustained sensation.",
    "refs": []
  },
  {
    "kind": "template",
    "id": "before-after",
    "name": "Before / After",
    "blurb": "The classic transformation cut — establish the sad state, swipe, reveal the glow-up.",
    "refs": [
      "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blocks/template/before-after/before-after.png"
    ]
  },
  {
    "kind": "template",
    "id": "carousel-deck",
    "name": "Carousel deck",
    "blurb": "A swipeable multi-slide deck — cover, body slides, payoff.",
    "refs": []
  },
  {
    "kind": "template",
    "id": "choose-the-door",
    "name": "Choose the Door",
    "blurb": "A fork-in-the-path decision reveal — two options framed left/right, a beat of suspense, then the pick.",
    "refs": [
      "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blocks/template/choose-the-door/choose-the-door.png"
    ]
  },
  {
    "kind": "template",
    "id": "choose-your-path-gauntlet",
    "name": "Choose-Your-Path Gauntlet",
    "blurb": "Hub → pick a guide → a chain of binary 50/50 forks (scene plays → freeze + 3-2-1 timer → consequence) → branch payoff. Generalizes analog-horror-pick-a-door into a guide-choice survival gauntlet. Narration restates each choice ('you picked X — …') for retention.",
    "refs": [
      "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blocks/template/choose-your-path-gauntlet/choose-your-path-gauntlet.png"
    ]
  },
  {
    "kind": "template",
    "id": "countdown",
    "name": "Countdown list",
    "blurb": "A ranked listicle that climbs to #1 with a hook on every beat.",
    "refs": []
  },
  {
    "kind": "template",
    "id": "explainer",
    "name": "Explainer",
    "blurb": "Step-by-step walkthrough with labelled beats and a payoff.",
    "refs": [
      "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blocks/template/explainer/explainer.png"
    ]
  },
  {
    "kind": "template",
    "id": "fb-creative-pack",
    "name": "FB creative pack",
    "blurb": "A multi-angle static-ad matrix — real-people, graphic, proof, meme, niche sets.",
    "refs": []
  },
  {
    "kind": "template",
    "id": "grwm",
    "name": "Get-ready-with-me",
    "blurb": "A real-time routine narrated start-to-finish while the presenter prepares.",
    "refs": []
  },
  {
    "kind": "template",
    "id": "interview-duo",
    "name": "Interview duo",
    "blurb": "Two voices in conversation — question / answer rhythm with cutaways.",
    "refs": []
  },
  {
    "kind": "template",
    "id": "lifestyle-montage",
    "name": "Lifestyle montage",
    "blurb": "A b-roll mood reel — fast cuts of a place, product, or routine in use.",
    "refs": [
      "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blocks/template/lifestyle-montage/lifestyle-montage.png"
    ]
  },
  {
    "kind": "template",
    "id": "motion-card",
    "name": "Motion card",
    "blurb": "A typographic / kinetic announcement card revealed beat-by-beat, code-driven.",
    "refs": [
      "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blocks/template/motion-card/motion-card.png"
    ]
  },
  {
    "kind": "template",
    "id": "music-video",
    "name": "Music video",
    "blurb": "Beat-driven performance / montage cut to a track, not a narrated script.",
    "refs": [
      "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blocks/template/music-video/music-video.png"
    ]
  },
  {
    "kind": "template",
    "id": "pov-narrative",
    "name": "POV narrative",
    "blurb": "An object / character lives a short dramatized arc from its own POV.",
    "refs": [
      "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blocks/template/pov-narrative/pov-narrative.png"
    ]
  },
  {
    "kind": "template",
    "id": "pov-walk",
    "name": "POV walk",
    "blurb": "First-person traversal through a space, holding on landmarks.",
    "refs": [
      "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blocks/template/pov-walk/pov-walk.png"
    ]
  },
  {
    "kind": "template",
    "id": "product-reveal",
    "name": "Product reveal",
    "blurb": "Tease, build, drop — a rhythm engineered around a single hero object.",
    "refs": [
      "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blocks/template/product-reveal/product-reveal.png"
    ]
  },
  {
    "kind": "template",
    "id": "reaction-stack",
    "name": "Reaction stack",
    "blurb": "A grid of reaction faces/states from one character — the meme-kit skeleton.",
    "refs": []
  },
  {
    "kind": "template",
    "id": "showcase-wall",
    "name": "Showcase wall",
    "blurb": "A tiled proof-wall of prior outputs — hook, wall, featured, stack, CTA.",
    "refs": [
      "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blocks/template/showcase-wall/showcase-wall.png"
    ]
  },
  {
    "kind": "template",
    "id": "sticker-set",
    "name": "Sticker set",
    "blurb": "A die-cut reaction set — one mascot rendered across N emotional states.",
    "refs": []
  },
  {
    "kind": "template",
    "id": "story-time",
    "name": "Story time",
    "blurb": "A first-person narrated arc — setup, conflict, resolution, punchline.",
    "refs": [
      "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blocks/template/story-time/story-time.png"
    ]
  },
  {
    "kind": "template",
    "id": "talking-head",
    "name": "Talking head",
    "blurb": "One presenter delivers straight to camera — a hook, a take, a button.",
    "refs": [
      "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blocks/template/talking-head/talking-head.png"
    ]
  },
  {
    "kind": "template",
    "id": "testimonial",
    "name": "Testimonial",
    "blurb": "A talking-head or quote-card structure built for trust and proof.",
    "refs": []
  },
  {
    "kind": "template",
    "id": "tier-list",
    "name": "Tier List",
    "blurb": "Rank N things into S–F rows; hot takes, screenshot bait.",
    "refs": []
  },
  {
    "kind": "template",
    "id": "unboxing",
    "name": "Unboxing / reveal",
    "blurb": "The package-to-payoff structure — anticipation, open, first reaction.",
    "refs": []
  },
  {
    "kind": "template",
    "id": "versus",
    "name": "Versus",
    "blurb": "Head-to-head split screen — us vs. them, this vs. that, pick a side.",
    "refs": []
  },
  {
    "kind": "template",
    "id": "walkthrough-tour",
    "name": "Walkthrough tour",
    "blurb": "A guided spatial tour — a property, a space, a UI, room by room.",
    "refs": []
  },
  {
    "kind": "recipe",
    "id": "boomerang-motion-fill",
    "name": "Boomerang Motion Fill",
    "blurb": "Play a short clip forward then reversed (split + reverse + concat) so an idle/hub loop keeps moving for a longer beat without a freeze or a re-roll. Used for the hub and ending idle clips.",
    "refs": [],
    "recipeKind": "ffmpeg",
    "body": "## What it is\n\nA ping-pong loop: `split` the clip, `reverse` the copy, `concat` forward+backward into one seamless out-and-back. It lets a 3.5s idle clip carry a 7s beat with continuous motion and no visible loop seam — the key fix for the \"dead-still world\" complaint on idle/hub frames (MEMORY: idle_ending_anchor_clean_still).\n\n## When to use it\n\n- A hub/intro or ending idle clip that needs to fill a longer window (CTA voiceover) without freezing.\n- Any short loop where a hard cut back to frame 0 would read as a stutter.\n\n## Knobs\n\n- `-t` = total length to hold (set to ~2x the clip, trimmed to the beat).\n- Combine with the master `VF` normalize chain when feeding the xfade bake.",
    "artifact": "# Verbatim from scripts/tmp-bake-*.sh BOOM filter (hub/idle segment build):\nBOOM='split[a][b];[b]reverse[r];[a][r]concat=n=2:v=1[v]'\nffmpeg -y -i idle.mp4 -filter_complex \"[0:v]$VF,$BOOM\" -map \"[v]\" -t 7.0 -an -c:v libx264 -preset veryfast -crf 20 -r 24 idle_boomerang.mp4",
    "params": {
      "concat_n": 2,
      "hold_sec": 7
    }
  },
  {
    "kind": "recipe",
    "id": "broadcast-square",
    "name": "Broadcast Square (1:1 Crop)",
    "blurb": "For \"caught on TV\" registers (sports / news / audience-cam), default to a 1:1 square crop instead of strict 9:16 — real broadcast cameras shoot 16:9, so a centered square reads as authentic TV; full portrait reads as AI-generated.",
    "refs": [],
    "recipeKind": "prompt",
    "body": "## What it is\n\nA framing + crop convention, not a pixel effect. Real broadcast cameras shoot 16:9; a hard 9:16 portrait of a \"TV moment\" instantly reads as AI-generated. So for caught-on-TV trends, generate the still at 1:1 (or 16:9) with `gpt-5.4-image-2`, drive it through Kling, and center-crop to a 1:1 square for the feed — the letterbox/squared look sells the broadcast authenticity (MEMORY: feedback_broadcast_realism_square).\n\n## When to use it\n\n- Sports highlights, news desk, audience-cam, sideline-interview, any \"this aired on TV\" register.\n- Does NOT apply to native-9:16 selfie/UGC, vertical phone-footage registers, or stylized verticals.\n\n## How to apply\n\n- Image stage: request 1:1 (square) from the image model; do not force 9:16.\n- Compose stage: center-crop the 16:9/square source to 1:1 and place it on the feed canvas.",
    "artifact": "# Center-crop a 16:9 (or any) source to a 1:1 square for the broadcast-TV look:\nffmpeg -i in.mp4 -vf \"crop='min(iw,ih)':'min(iw,ih)':(iw-min(iw,ih))/2:(ih-min(iw,ih))/2,setsar=1\" -c:v libx264 -preset fast -crf 18 -c:a copy square.mp4\n\n# Image stage: prefer a 1:1 / 16:9 prompt on openai/gpt-5.4-image-2, NOT a forced 9:16 aspect.",
    "params": {
      "aspect": "1:1",
      "applies_to": "caught-on-TV / sports / news / audience-cam registers",
      "image_model": "openai/gpt-5.4-image-2"
    }
  },
  {
    "kind": "recipe",
    "id": "burned-captions",
    "name": "Burned Captions",
    "blurb": "Two routes for baked-in captions: an animated HyperFrames cap() driver (slide-up in, fade out, hard-cleared) and the ffmpeg subtitles burn (Inter, outline 3, MarginV=90 safe zone) for SRT-driven cuts.",
    "refs": [],
    "recipeKind": "hyperframes",
    "body": "## What it is\n\nOn-screen captions baked into the frame (no separate track). The choose-path series uses the HyperFrames `cap(text, tin, tout)` driver — set the text, slide it up + fade in over 0.32s, fade out at `tout`, and hard-clear opacity afterward (the non-linear-seek safety every choose-path overlay needs). For SRT-driven cuts, the ffmpeg `subtitles` filter is the equivalent burn with a TikTok-safe `MarginV=90`.\n\n## When to use it\n\n- HyperFrames `cap()` for per-beat narrator lines timed by hand against `A[]`/`SEG[]`.\n- ffmpeg `subtitles` when you already have a word-aligned SRT (scribe-first workflow) and want to burn it as the LAST encode step.\n\n## Knobs\n\n- HF: slide `y:26 -> 0`, in 0.32s / out 0.28s; `white-space: pre-line` for `\\n` line breaks.\n- ffmpeg: `FontSize`, `Outline=3`, `MarginV=90` (safe zone), `PrimaryColour`/`OutlineColour` in ASS `&HBBGGRR&`.",
    "artifact": "// HyperFrames cap() driver — verbatim from the choose-path index.html.\nfunction cap(text, tin, tout) {\n  tl.set(\"#cap\", { textContent: text }, tin - 0.01);\n  tl.fromTo(\"#cap\", { opacity: 0, y: 26 }, { opacity: 1, y: 0, duration: 0.32, ease: \"power3.out\", overwrite: \"auto\" }, tin);\n  tl.to(\"#cap\", { opacity: 0, duration: 0.28, overwrite: \"auto\" }, tout);\n  tl.set(\"#cap\", { opacity: 0 }, tout + 0.29);\n}\n\n# ffmpeg SRT burn (verbatim from cli/lib/ffmpeg-recipes.ts burnSubtitles defaults):\nffmpeg -i in.mp4 -vf \"subtitles=cap.srt:force_style='FontName=Inter,FontSize=36,PrimaryColour=&HFFFFFF&,OutlineColour=&H000000&,BorderStyle=1,Outline=3,Shadow=0,Bold=-1,Alignment=2,MarginV=90'\" -c:v libx264 -preset fast -crf 18 -c:a copy out.mp4",
    "params": {
      "marginV": 90,
      "outline": 3,
      "fontName": "Inter",
      "fontSize": 36,
      "hf_in_sec": 0.32,
      "hf_out_sec": 0.28,
      "hf_slide_y": 26
    }
  },
  {
    "kind": "recipe",
    "id": "chroma-split",
    "name": "Chroma Split",
    "blurb": "RGB-channel offset (red/cyan fringe) for VHS / glitch / death-hit accents. Two flavors: an ffmpeg rgbashift bake for whole clips, and a zero-cost CSS text-shadow split for overlay text.",
    "refs": [],
    "recipeKind": "ffmpeg",
    "body": "## What it is\n\nA red/cyan (RGB-channel) split that fakes the chromatic aberration of a worn VHS head or a CRT. It reads as \"signal damage\" and is the cheapest way to make a clean AI frame feel analog or to punch a death/jump-scare beat.\n\n## When to use it\n\n- Whole-clip VHS / analog-horror grade: bake the ffmpeg `rgbashift` over the master.\n- A single overlay word (DEAD, WARNING) where you do NOT want to re-encode the video: use the CSS text-shadow variant instead (free, GPU-composited, seek-deterministic in HyperFrames).\n\n## Knobs\n\n- ffmpeg: `rh` / `bh` = horizontal pixel offset of the Red and Blue planes (push them opposite ways: `rh=N`, `bh=-N`). 2-4 px reads as VHS; 7+ px reads as a hard glitch hit.\n- CSS: the `7px 0` red + `-7px 0` cyan text-shadow pair — bump the px to widen the fringe.",
    "artifact": "# ffmpeg bake over a whole clip (verbatim from cli/lib/ffmpeg-recipes.ts buildVhsFilter chroma layer):\nffmpeg -i in.mp4 -vf \"rgbashift=rh=3:bh=-3\" -c:v libx264 -preset fast -crf 20 -c:a copy out.mp4\n\n/* CSS overlay-text variant (verbatim from the choose-path index.html #death rule) */\n#death {\n  color: #ff2a2a;\n  text-shadow:\n    7px 0 0 rgba(255,0,46,0.55),\n    -7px 0 0 rgba(0,200,255,0.45),\n    0 0 40px rgba(255,40,40,0.7),\n    0 6px 16px rgba(0,0,0,0.95);\n}",
    "params": {
      "bh": -3,
      "rh": 3,
      "css_offset_px": 7,
      "rh_glitch_hit": 7
    }
  },
  {
    "kind": "recipe",
    "id": "crt-scanlines",
    "name": "CRT Scanlines",
    "blurb": "A zero-cost CSS scanline + RGB-stripe overlay (dark every other line + faint vertical R/G/B columns) laid over the video in HyperFrames — the CRT look without re-encoding.",
    "refs": [],
    "recipeKind": "hyperframes",
    "body": "## What it is\n\nA pure-CSS overlay `<div>` that fakes a CRT/VHS scan: a repeating horizontal gradient darkens every other 1.5px line, and a second 4px-period vertical gradient adds faint R/G/B phosphor stripes. It composites over the master `<video>` with `pointer-events:none`, so it costs nothing at render and seeks deterministically (no canvas, no JS).\n\n## When to use it\n\n- Any retro / PS1 / analog register where you want scanlines but do NOT want to bake them into the video (keeps the source crisp and lets you toggle opacity over time).\n- Pair with `film-grain` (added grain layer) and `chroma-split` for a full CRT stack.\n\n## Knobs\n\n- `background-size: 100% 3px` = scanline pitch (smaller = denser lines).\n- The `90deg` gradient alphas (0.04 / 0.02 / 0.04) = RGB-stripe intensity.\n- Wrapper `opacity` = overall strength.",
    "artifact": "/* Verbatim from the choose-path index.html #vhs .scan rule. Drop the div over the video. */\n.scan {\n  position: absolute; inset: 0; pointer-events: none;\n  background:\n    linear-gradient(rgba(0,0,0,0) 50%, rgba(0,0,0,0.30) 50%),\n    linear-gradient(90deg, rgba(255,0,0,0.04), rgba(0,255,0,0.02), rgba(0,0,255,0.04));\n  background-size: 100% 3px, 4px 100%;\n}",
    "params": {
      "scanline_alpha": 0.3,
      "scanline_pitch_px": 3,
      "rgb_stripe_period_px": 4
    },
    "demo": {
      "html": "<!doctype html><html><head><meta charset=\"utf-8\"><style>html,body{margin:0;background:#111}#box{position:relative;width:225px;height:400px;margin:8px auto;overflow:hidden;background:linear-gradient(135deg,#2a6,#6cf 60%,#fc6)}#box .scan{position:absolute;inset:0;pointer-events:none;background:linear-gradient(rgba(0,0,0,0) 50%, rgba(0,0,0,0.30) 50%),linear-gradient(90deg, rgba(255,0,0,0.04), rgba(0,255,0,0.02), rgba(0,0,255,0.04));background-size:100% 3px, 4px 100%}#box .lbl{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#fff;font:700 22px monospace;text-shadow:0 2px 8px #000}</style></head><body><div id=\"box\"><div class=\"lbl\">CRT SCAN</div><div class=\"scan\"></div></div></body></html>",
      "kind": "hyperframes"
    }
  },
  {
    "kind": "recipe",
    "id": "ffmpeg-xfade-master",
    "name": "FFmpeg Xfade Master Bake",
    "blurb": "Bake N per-scene clips into one seamless master mp4 with crossfade dissolves, and emit the scene-start (A[]) + segment-duration (SEG[]) arrays the HyperFrames overlay timeline keys off.",
    "refs": [],
    "recipeKind": "bake",
    "body": "## What it is\n\nThe master-assembly step for a multi-scene branching video. Each scene clip is normalized to 1080x1920/24fps, then chained with `xfade=transition=fade` so every cut is a 0.5s dissolve. The script computes each clip's xfade `offset` (the running output length minus the overlap) and prints two arrays — `A[]` (scene-start offsets) and `SEG[]` (per-segment durations) — which you paste into the HyperFrames composition so the GSAP overlay timeline lands every caption/fork/death on the right frame.\n\n## When to use it\n\n- Any time you assemble several i2v clips into one continuous master (the choose-path series, any multi-beat reel where overlays must be frame-accurate over a single `<video>`).\n- The single-`<video>`-plus-baked-dissolves pattern is mandatory when overlays cross a cut — in-composition opacity crossfades between separate video clips render as hard cuts (MEMORY: hyperframes_video_crossfade_bake).\n\n## Knobs\n\n- `D` = crossfade duration (0.5s default).\n- The xfade offset for clip k = (running output length) - D; re-baking only the tail keeps A[0..n] stable.\n- `VF` = the per-clip normalize chain (scale/crop/fps/setsar/format).",
    "artifact": "# Per-clip normalize, verbatim from scripts/tmp-bake-*.sh:\nVF=\"scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=24,setsar=1,format=yuv420p\"\nD=0.5\n\n# xfade chain build (verbatim shape): for each clip k>=1\n#   offset[k] = running_outlen - D\n#   fc += \"${prev}[k:v]xfade=transition=fade:duration=$D:offset=${offset[k]}[vk];\"\n# final ffmpeg call:\nffmpeg -y $inputs -filter_complex \"$fc\" -map \"[vout]\" -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p -r 24 master.mp4\n\n# Emit the arrays the HyperFrames composition needs:\n#   A=[0.00,6.50,12.38,...]   (scene starts)\n#   SEG=[7.00,6.38,3.88,...]  (segment durations)",
    "params": {
      "D": 0.5,
      "crf": 20,
      "fps": 24,
      "resolution": "1080x1920",
      "transition": "fade",
      "offset_formula": "running_outlen - D"
    }
  },
  {
    "kind": "recipe",
    "id": "film-grain",
    "name": "Film Grain",
    "blurb": "Temporal luma/chroma noise to break up flat AI gradients, plus the matching x264 `-tune grain` encode so the grain survives compression instead of being smeared away.",
    "refs": [],
    "recipeKind": "encode",
    "body": "## What it is\n\nTwo things that go together: (1) `noise=alls=N:allf=t` adds per-frame (temporal) grain so banded AI skies / gradients stop looking plastic, and (2) the `-tune grain` x264 preset tells the encoder to preserve that random texture instead of denoising it away. Skipping (2) is the classic mistake — the grain you added gets smeared into mush at any reasonable CRF.\n\n## When to use it\n\n- Any analog / VHS / horror register, or any clip with visible AI banding.\n- As the FINAL encode of a noise-heavy render (the choose-path masters use CRF 30 `-tune grain`).\n\n## Knobs\n\n- `alls` = grain strength 0..100. 8 is a light tape grain; 20+ is heavy 16mm.\n- `allf=t` = temporal (re-randomized every frame). Drop the `t` for static grain.\n- Encode: `-tune grain`, CRF 20-30. Higher CRF is fine here because grain hides compression.",
    "artifact": "# Add grain (verbatim from cli/lib/ffmpeg-recipes.ts buildVhsFilter grain layer):\nffmpeg -i in.mp4 -vf \"noise=alls=8:allf=t\" -c:v libx264 -preset fast -crf 20 -c:a copy grain.mp4\n\n# Grain-preserving final encode (verbatim from optimizeReencode, the -tune grain path):\nffmpeg -i grain.mp4 -c:v libx264 -preset slow -crf 23 -tune grain -pix_fmt yuv420p -c:a aac -b:a 128k -movflags +faststart out.mp4",
    "params": {
      "crf": 23,
      "allf": "t",
      "alls": 8,
      "tune": "grain",
      "crf_noise_heavy": 30
    }
  },
  {
    "kind": "recipe",
    "id": "noir-grade",
    "name": "Noir / Analog-Horror Grade",
    "blurb": "Crushed blacks, desaturated, slight green-shift, low-contrast color grade — the dread/horror register grade. The `analog-horror` preset from the ffmpeg color-grade table.",
    "refs": [],
    "recipeKind": "ffmpeg",
    "body": "## What it is\n\nA color grade that pushes a clip into a cold, dread, low-light register: blacks lifted+crushed via a `curves` shadow tweak, saturation pulled to ~0.78, a faint green channel shift, and contrast slightly under 1.0. This is the `analog-horror` preset in the production color-grade table (validated against the analog-horror-fridge postmortem).\n\n## When to use it\n\n- Horror / liminal / dread registers (silenthill, backrooms branches).\n- Any clip that came out of the image model too bright/clean for the mood.\n\n## Knobs\n\nThis is a fixed preset — the three sub-filters (`eq`, `colorchannelmixer`, `curves`) carry the tuned values. For a warmer or punchier look, swap the preset name (`tv-commercial-soft` / `tv-commercial-strong` / `cinematic-teal-orange`) in the same color-grade helper.",
    "artifact": "# Verbatim from cli/lib/ffmpeg-recipes.ts buildColorGradeFilter(\"analog-horror\"):\nffmpeg -i in.mp4 -vf \"eq=contrast=0.92:brightness=-0.04:saturation=0.78,colorchannelmixer=rr=0.95:gg=1.05:bb=0.95,curves=all='0/0.05 0.5/0.45 1/0.92'\" -c:v libx264 -preset fast -crf 18 -c:a copy out.mp4",
    "params": {
      "curves": "0/0.05 0.5/0.45 1/0.92",
      "preset": "analog-horror",
      "contrast": 0.92,
      "brightness": -0.04,
      "saturation": 0.78
    }
  },
  {
    "kind": "recipe",
    "id": "old-radio-ps1-vo",
    "name": "Old-Radio / PS1 VO Filter",
    "blurb": "Band-limit a clean voiceover into a disembodied old-radio narrator: highpass + lowpass band, light bit-crush, compressor, gain. The per-clip postFX for the choose-path narrator.",
    "refs": [],
    "recipeKind": "ffmpeg",
    "body": "## What it is\n\nAn audio filter chain that turns a clean cloned VO into the crackly, mid-bandy, disembodied PS1-era radio narrator. A `highpass`/`lowpass` pair clips the lows and highs to a radio band, `acrusher` adds a faint digital bit-crush, `acompressor` evens the level, and a `volume` boost brings it back up. It is the diegetic-vs-narrator contrast tool: the narrator gets this filter (white captions); a character's own diegetic voice stays bright/unfiltered (yellow captions).\n\n## When to use it\n\n- The disembodied narrator track on a choose-path / interactive-fiction reel.\n- Any \"voice over a PA / radio / intercom\" register.\n\n## Two band presets (pick by feel)\n\n- Fuller broadcast register: `highpass=200, lowpass=4500` (preferred — `300/3000` plus a compressor came out \"tinny and noisy\" per the choose-your-guide postmortem).\n- Narrow telephone register: `highpass=300, lowpass=3100` + `acrusher=bits=10` (the grittier PS1 narrator).\n\n## Hard rule\n\nDo NOT double-compress: if the per-clip chain already has `acompressor`, do not add another global compressor after the `amix` — it pumps. Run one global `loudnorm I=-16` at the end instead.",
    "artifact": "# Per-clip narrator postFX (verbatim from the choose-path compose-template, PS1 narrator variant):\nffmpeg -i vo.mp3 -af \"highpass=300,lowpass=3100,acrusher=bits=10:mode=log,acompressor=threshold=-20dB:ratio=4,volume=5dB\" vo_radio.mp3\n\n# Fuller broadcast variant (preferred per postmortem; no in-clip compressor, compress once globally):\nffmpeg -i vo.mp3 -af \"highpass=200,lowpass=4500,volume=2dB\" vo_radio.mp3\n# ...then ONE global pass after amix:\n#   amix -> acompressor(ratio=3,makeup=2dB) -> loudnorm=I=-16:TP=-1.5:LRA=11 -> alimiter=limit=0.9",
    "params": {
      "volume_db": 5,
      "lowpass_ps1": 3100,
      "highpass_ps1": 300,
      "acrusher_bits": 10,
      "acompressor_ratio": 4,
      "lowpass_broadcast": 4500,
      "highpass_broadcast": 200,
      "loudnorm_target_lufs": -16
    }
  },
  {
    "kind": "recipe",
    "id": "play-freeze-fork",
    "name": "Play / Freeze / Fork",
    "blurb": "The choose-path branch beat: let the action play, then freeze and slam in two choice labels (LEFT/RIGHT) sliding from the edges, immediately followed by a fast countdown. The HyperFrames freezeFork() driver.",
    "refs": [],
    "recipeKind": "hyperframes",
    "body": "## What it is\n\nThe interactive-fiction fork moment. The clip plays its action live, then at `A[i]+3.9s` the world freezes (a VHS pause overlay holds), two large choice labels slide in from the left and right edges, and a 0.5s-per-tick countdown disc fires right after. Command-over-action then a fast timer is the validated pacing — a slow timer is only needed if the timer runs DURING narration (MEMORY: choose_path_compose_template).\n\n## When to use it\n\n- Any \"pick a path\" branch beat over a baked master where the fork must land on a specific frame.\n- Drives the labels + freeze + countdown together; pairs with `vhs-pause-freeze` (the hold) and `smpte-countdown-disc` (the timer).\n\n## Knobs\n\n- `fs = A[i]+3.9` (freeze start), `cd = A[i]+4.2` (countdown start), `clear = cd+1.55` (labels out).\n- Labels slide `x:-44 -> 0` (left) and `x:44 -> 0` (right) over 0.28s.\n- `disc(cd, 0.5)` sets the 0.5s/tick timer.",
    "artifact": "// Verbatim from the choose-path index.html freezeFork() driver (GSAP, paused timeline `tl`).\nfunction freezeFork(i, l, r) {\n  const fs = A[i] + 3.9, cd = A[i] + 4.2, clear = cd + 1.5 + 0.05;\n  vhs(fs, clear - fs);                                   // hold a VHS pause over the freeze\n  tl.set(\"#fork-l\", { textContent: l }, fs);\n  tl.set(\"#fork-r\", { textContent: r }, fs);\n  tl.fromTo(\"#fork-l\", { opacity: 0, x: -44 }, { opacity: 1, x: 0, duration: 0.28, ease: \"power3.out\", overwrite: \"auto\" }, fs + 0.05);\n  tl.fromTo(\"#fork-r\", { opacity: 0, x:  44 }, { opacity: 1, x: 0, duration: 0.28, ease: \"power3.out\", overwrite: \"auto\" }, fs + 0.05);\n  tl.to([\"#fork-l\", \"#fork-r\"], { opacity: 0, duration: 0.22, overwrite: \"auto\" }, clear - 0.05);\n  tl.set([\"#fork-l\", \"#fork-r\"], { opacity: 0 }, clear + 0.2);\n  disc(cd, 0.5);                                          // fast 0.5s/tick countdown right after\n}",
    "params": {
      "label_slide_px": 44,
      "freeze_offset_sec": 3.9,
      "label_in_duration": 0.28,
      "countdown_step_sec": 0.5,
      "countdown_offset_sec": 4.2
    },
    "demo": {
      "html": "<!doctype html><html><head><meta charset=\"utf-8\"><style>html,body{margin:0;background:#000;overflow:hidden}#box{position:relative;width:225px;height:400px;margin:8px auto;overflow:hidden;background:radial-gradient(120% 90% at 50% 40%,#243,#010)}#fork-l,#fork-r{position:absolute;top:38%;font:700 30px monospace;color:#fff3d0;opacity:0;text-shadow:0 0 8px #000,0 2px 4px #000}#fork-l{left:14px;text-align:left}#fork-r{right:14px;text-align:right}#cd{position:absolute;left:50%;top:62%;transform:translate(-50%,-50%);width:120px;height:120px;opacity:0}#cd circle{fill:none}#ring{stroke:rgba(255,226,122,.3);stroke-width:5}#sweep{stroke:#ffe27a;stroke-width:7;transform:rotate(-90deg);transform-origin:50% 50%}#num{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font:700 70px monospace;color:#fff3d0}</style></head><body><div id=\"box\"><div id=\"fork-l\">LEFT</div><div id=\"fork-r\">RIGHT</div><div id=\"cd\"><svg viewBox=\"0 0 120 120\" width=\"120\" height=\"120\"><circle id=\"ring\" cx=\"60\" cy=\"60\" r=\"52\"/><circle id=\"sweep\" cx=\"60\" cy=\"60\" r=\"52\"/></svg><div id=\"num\">3</div></div></div><script src=\"https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js\"></script><script>const C=2*Math.PI*52;gsap.set(\"#sweep\",{strokeDasharray:C,strokeDashoffset:0});const tl=gsap.timeline({repeat:-1,repeatDelay:0.6});tl.fromTo(\"#fork-l\",{opacity:0,x:-30},{opacity:1,x:0,duration:.3,ease:\"power3.out\"},0).fromTo(\"#fork-r\",{opacity:0,x:30},{opacity:1,x:0,duration:.3,ease:\"power3.out\"},0);tl.set(\"#cd\",{opacity:1},.4);for(let i=0;i<3;i++){const t=.4+i*.5;tl.set(\"#num\",{textContent:3-i},t).fromTo(\"#sweep\",{strokeDashoffset:0},{strokeDashoffset:C,duration:.5,ease:\"none\"},t);}tl.to([\"#fork-l\",\"#fork-r\",\"#cd\"],{opacity:0,duration:.3},2.0);</script></body></html>",
      "kind": "hyperframes"
    }
  },
  {
    "kind": "recipe",
    "id": "smpte-countdown-disc",
    "name": "SMPTE Countdown Disc",
    "blurb": "The film-leader 3-2-1 countdown: a sweeping SVG ring + crosshair + a back.out-popping number, on a dark plate. The HyperFrames disc() driver that times the fork decision window.",
    "refs": [],
    "recipeKind": "hyperframes",
    "body": "## What it is\n\nA cinema-leader countdown disc. An SVG ring has its `stroke-dashoffset` swept from 0 to the full circumference each tick (the wiping clock hand), a crosshair sits behind it, and the big number pops in with a `back.out(2)` scale each step. Three ticks at `step` seconds each, then the disc + its plate fade out. It gives the fork a visible decision deadline.\n\n## When to use it\n\n- The timer on a choose-path fork (call `disc(cd, 0.5)` right after the labels appear — fast 0.5s/tick once the narration has already moved on).\n- Any \"you have N seconds\" beat. Use a 1s step only if the timer must run during a voiceover.\n\n## Knobs\n\n- `step` = seconds per tick (0.5 fast / 1.0 narrated).\n- `C = 2*PI*r` = the sweep circumference (must match the ring radius).\n- Number pop = `back.out(2)`, plate `#cd-plate` opacity for the backing.",
    "artifact": "// Verbatim from the choose-path index.html disc() driver (GSAP paused timeline `tl`).\n// Setup once: const C = 2*Math.PI*210; gsap.set(\"#cd-sweep\",{strokeDasharray:C,strokeDashoffset:0});\nfunction disc(s, step) {\n  step = step || 0.5;\n  tl.fromTo(\"#cd-plate\", { opacity: 0 }, { opacity: 1, duration: 0.16, overwrite: \"auto\" }, s - 0.1);\n  tl.fromTo(\"#countdown\", { opacity: 0 }, { opacity: 1, duration: 0.16, overwrite: \"auto\" }, s - 0.1);\n  for (let i = 0; i < 3; i++) {\n    const t = s + i * step;\n    tl.set(\"#cd-num\", { textContent: 3 - i }, t);\n    tl.fromTo(\"#cd-sweep\", { strokeDashoffset: 0 }, { strokeDashoffset: C, duration: step, ease: \"none\" }, t);\n    tl.fromTo(\"#cd-num\", { scale: 1.2, opacity: 0.4 }, { scale: 1, opacity: 1, duration: step * 0.45, ease: \"back.out(2)\" }, t);\n  }\n  tl.to([\"#countdown\", \"#cd-plate\"], { opacity: 0, duration: 0.2, ease: \"power2.in\", overwrite: \"auto\" }, s + 3 * step - 0.04);\n}",
    "params": {
      "ticks": 3,
      "number_ease": "back.out(2)",
      "ring_radius": 210,
      "step_fast_sec": 0.5,
      "step_narrated_sec": 1
    },
    "demo": {
      "html": "<!doctype html><html><head><meta charset=\"utf-8\"><style>html,body{margin:0;background:#000;overflow:hidden}#box{position:relative;width:225px;height:400px;margin:8px auto;overflow:hidden;background:radial-gradient(120% 90% at 50% 40%,#222,#000)}#plate{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:170px;height:170px;background:rgba(20,16,8,.5);opacity:0}#cd{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:160px;height:160px;opacity:0}circle{fill:none}#ring{stroke:rgba(255,226,122,.3);stroke-width:6}#sweep{stroke:#ffe27a;stroke-width:9;transform:rotate(-90deg);transform-origin:50% 50%}line{stroke:rgba(255,226,122,.45);stroke-width:3}#num{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font:700 96px monospace;color:#fff3d0;text-shadow:0 0 12px #000}</style></head><body><div id=\"box\"><div id=\"plate\"></div><div id=\"cd\"><svg viewBox=\"0 0 160 160\" width=\"160\" height=\"160\"><circle id=\"ring\" cx=\"80\" cy=\"80\" r=\"70\"/><circle id=\"sweep\" cx=\"80\" cy=\"80\" r=\"70\"/><line x1=\"80\" y1=\"4\" x2=\"80\" y2=\"156\"/><line x1=\"4\" y1=\"80\" x2=\"156\" y2=\"80\"/></svg><div id=\"num\">3</div></div></div><script src=\"https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js\"></script><script>const C=2*Math.PI*70;gsap.set(\"#sweep\",{strokeDasharray:C,strokeDashoffset:0});const tl=gsap.timeline({repeat:-1,repeatDelay:0.7});tl.fromTo(\"#plate\",{opacity:0},{opacity:1,duration:.16},0).fromTo(\"#cd\",{opacity:0},{opacity:1,duration:.16},0);const step=.6;for(let i=0;i<3;i++){const t=i*step;tl.set(\"#num\",{textContent:3-i},t).fromTo(\"#sweep\",{strokeDashoffset:0},{strokeDashoffset:C,duration:step,ease:\"none\"},t).fromTo(\"#num\",{scale:1.2,opacity:.4},{scale:1,opacity:1,duration:step*.45,ease:\"back.out(2)\"},t);}tl.to([\"#cd\",\"#plate\"],{opacity:0,duration:.2},3*step);</script></body></html>",
      "kind": "hyperframes"
    }
  },
  {
    "kind": "recipe",
    "id": "speed-ramp",
    "name": "Speed Ramp",
    "blurb": "Retime a clip with setpts so a short i2v clip stretches to fill the voiceover beat (slow-mo) without re-rolling — the per-segment retime used in the master bake.",
    "refs": [],
    "recipeKind": "ffmpeg",
    "body": "## What it is\n\nA presentation-timestamp retime. `setpts=f*PTS` multiplies every frame's timestamp by `f`, so `f>1` slows the clip down (stretch) and `f<1` speeds it up. The choose-path bake uses it to stretch a fixed 3.9s i2v clip to cover a longer voiceover line: `f = (vo + 1.0) / 3.9`, applied only when the needed time exceeds the base clip length.\n\n## When to use it\n\n- A scene clip is shorter than the VO/beat it must cover — slow it instead of re-generating.\n- A hold/anticipation beat where a gentle slow-mo adds weight.\n\n## Knobs\n\n- `f` = the PTS multiplier. >1 = slower, <1 = faster.\n- Video-only retime (`setpts`); audio would need a matching `atempo` if present (the bake strips audio with `-an` and remixes later).",
    "artifact": "# Verbatim retime from scripts/tmp-bake-*.sh (plain-segment slow-mo branch):\n#   t = vo + 1.0;  if t > BASE(3.9):  f = t / BASE\nffmpeg -y -t 3.9 -i scene.mp4 -vf \"$VF,setpts=$f*PTS\" -an -c:v libx264 -preset veryfast -crf 20 -r 24 scene_slow.mp4\n# VF = scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=24,setsar=1,format=yuv420p",
    "params": {
      "fps": 24,
      "f_formula": "(vo + 1.0) / 3.9",
      "base_clip_sec": 3.9
    }
  },
  {
    "kind": "recipe",
    "id": "typewriter-reveal",
    "name": "Typewriter Reveal",
    "blurb": "Reveal text character-by-character via an animated clip-path with steps() timing — pure CSS/GSAP, GPU-composited, no per-char DOM. The announcement-card text-in effect.",
    "refs": [],
    "recipeKind": "hyperframes",
    "body": "## What it is\n\nA monospace typewriter reveal that wipes the text in left-to-right using `clip-path: inset(...)` animated with a `steps(N)` ease, where N = the character count. Because it animates one property with a stepped ease, it looks like discrete keystrokes without splitting the text into per-character spans, and it stays seek-deterministic in HyperFrames (validated in the Vercel-Ship-style composition, MEMORY: project_ship_style_template).\n\n## When to use it\n\n- Announcement / ship-note / terminal cards where each line should type in.\n- Any place a per-char SplitText reveal would be overkill and you want a single cheap animated property.\n\n## Knobs\n\n- `steps(N)` where N = number of characters in the line (each step = one glyph).\n- `duration` = total type time (≈ N * 0.04s reads as fast typing).\n- A trailing caret is an optional `::after` block that blinks.",
    "artifact": "/* CSS: monospace line clipped from the right, revealed left-to-right. */\n.tw { font-family: 'Courier New', monospace; white-space: nowrap; overflow: hidden; clip-path: inset(0 100% 0 0); }\n\n// GSAP: step the clip from fully-hidden to fully-shown over N characters.\n// chars = line.textContent.length\nconst chars = el.textContent.length;\ntl.to(el, { clipPath: \"inset(0 0% 0 0)\", duration: chars * 0.04, ease: `steps(${chars})` }, startSec);",
    "params": {
      "ease": "steps(N) where N = char count",
      "per_char_sec": 0.04
    },
    "demo": {
      "html": "<!doctype html><html><head><meta charset=\"utf-8\"><style>html,body{margin:0;background:#0b0b10;overflow:hidden}#box{position:relative;width:225px;height:400px;margin:8px auto;display:flex;flex-direction:column;justify-content:center;gap:14px;padding:0 18px;box-sizing:border-box}.tw{font-family:'Courier New',monospace;font-size:18px;color:#7CFFB2;white-space:nowrap;overflow:hidden;clip-path:inset(0 100% 0 0)}.tw.b{color:#fff;font-size:22px;font-weight:700}</style></head><body><div id=\"box\"><div class=\"tw b\" id=\"l1\">SHIPPED.</div><div class=\"tw\" id=\"l2\">recipe normalization</div><div class=\"tw\" id=\"l3\">23 blocks audited</div></div><script src=\"https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js\"></script><script>function tw(id,at){const el=document.getElementById(id),n=el.textContent.length;return{el,n,at};}const lines=[tw(\"l1\",0),tw(\"l2\",0.6),tw(\"l3\",1.4)];const tl=gsap.timeline({repeat:-1,repeatDelay:1});lines.forEach(L=>tl.to(L.el,{clipPath:\"inset(0 0% 0 0)\",duration:L.n*0.05,ease:\"steps(\"+L.n+\")\"},L.at));tl.to({},{duration:.5});lines.forEach(L=>tl.set(L.el,{clipPath:\"inset(0 100% 0 0)\"},\"<\"));</script></body></html>",
      "kind": "hyperframes"
    }
  },
  {
    "kind": "recipe",
    "id": "vhs-overlay",
    "name": "VHS Overlay",
    "blurb": "The full ffmpeg VHS chain — chroma shift + sine tape-wobble + temporal grain + vignette + slight desat — in one filtergraph. The whole-clip analog look behind the choose-path series.",
    "refs": [],
    "recipeKind": "ffmpeg",
    "body": "## What it is\n\nThe complete tape-deck look in one `-vf` chain: an `rgbashift` chroma split, a 0.6 Hz sine `crop` wobble for slow horizontal drift, temporal `noise` grain, a `vignette`, and a small `eq` desaturate/contrast nudge (a VHS deck never produced pristine corners or full saturation). Toggle any layer by zeroing its knob.\n\n## When to use it\n\n- A whole clip you want to read as a found-tape / 1990s home-video / analog-horror register.\n- For a single momentary \"PAUSE\"-style freeze overlay inside HyperFrames, use `vhs-pause-freeze` instead (this one bakes the whole clip).\n\n## Knobs\n\n- `chroma` = R/B horizontal shift in px (the rgbashift offsets). 0 = off.\n- `drift` = sine-wobble amplitude in px. 0 = off.\n- `grain` = noise strength 0..100. 0 = off.",
    "artifact": "# Verbatim from cli/lib/ffmpeg-recipes.ts buildVhsFilter({drift,grain,chroma}) with the defaults\n# (chroma=3, drift=2, grain=8). The vignette + eq tail are always appended.\nffmpeg -i in.mp4 -vf \"rgbashift=rh=3:bh=-3,crop=in_w-4:in_h:2+2*sin(2*PI*0.6*t):0,noise=alls=8:allf=t,vignette=PI/5,eq=saturation=0.92:contrast=1.05\" -c:v libx264 -preset fast -crf 20 -c:a copy out.mp4",
    "params": {
      "drift": 2,
      "grain": 8,
      "chroma": 3,
      "contrast": 1.05,
      "vignette": "PI/5",
      "saturation": 0.92
    }
  },
  {
    "kind": "recipe",
    "id": "vhs-pause-freeze",
    "name": "VHS Pause Freeze",
    "blurb": "The \"||PAUSE\" overlay of a paused VCR: a canvas snow field + a jittering tracking band + scanlines + a tape tint + a PAUSE caption, driven for an exact window in HyperFrames. Used to hold the freeze on every fork.",
    "refs": [],
    "recipeKind": "hyperframes",
    "body": "## What it is\n\nThe artifact of a paused VHS tape. A `<canvas>` redraws per-frame snow (deterministic mulberry32 noise) plus a horizontal tracking-error band, layered under CSS scanlines + a warm tape tint + a `||PAUSE` caption. A tiny `y: +/-1` vertical jitter every 0.1s sells the unstable head. The whole stack fades in for the freeze window and out when play resumes.\n\n## When to use it\n\n- To hold a freeze beat (the fork moment) so it reads as \"someone hit pause\", not a render glitch.\n- Anywhere you want a momentary analog-pause punctuation. For a whole-clip VHS bake use `vhs-overlay` instead.\n\n## Knobs\n\n- `drawVHS(t)` snow alpha = `(r()*54)` and the 22 tracking streaks per band.\n- `#vcr` opacity (0.45) = snow strength; the jitter loop pitch (0.1s).\n- `vhs(s, dur)` = show from `s` for `dur` seconds.",
    "artifact": "// Verbatim from the choose-path index.html: the deterministic snow draw + the vhs() driver.\nfunction mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}\nfunction drawVHS(t){const r=mulberry32((Math.floor(t*30)|0)+1);const w=vcr.width,h=vcr.height;const img=vctx.createImageData(w,h),d=img.data;for(let i=0;i<d.length;i+=4){const v=(r()*255)|0;d[i]=d[i+1]=d[i+2]=v;d[i+3]=(r()*54)|0;}vctx.putImageData(img,0,0);const band=Math.floor((t*60)%h);vctx.fillStyle=\"rgba(255,255,255,0.5)\";for(let k=0;k<22;k++){const x=(r()*w)|0,y=band+((r()*46)|0)-23;vctx.fillRect(x,y,(r()*7)|0,2);}}\nfunction vhs(s,dur){tl.set(\"#vhs\",{opacity:1},s);const pf={v:s};tl.to(pf,{v:s+dur,duration:dur,ease:\"none\",onUpdate:()=>drawVHS(pf.v),overwrite:\"auto\"},s);let t=s,k=0;while(t<s+dur){tl.set(\"#vhs\",{y:(k%2?1:-1)},t);t+=0.1;k++;}tl.set(\"#vhs\",{y:0},s+dur);tl.to(\"#vhs\",{opacity:0,duration:0.12,overwrite:\"auto\"},s+dur);}",
    "params": {
      "vcr_canvas": "270x480",
      "fade_out_sec": 0.12,
      "snow_alpha_max": 54,
      "jitter_pitch_sec": 0.1,
      "tracking_streaks": 22
    },
    "demo": {
      "html": "<!doctype html><html><head><meta charset=\"utf-8\"><style>html,body{margin:0;background:#000;overflow:hidden}#box{position:relative;width:225px;height:400px;margin:8px auto;overflow:hidden;background:linear-gradient(135deg,#345,#122)}#vcr{position:absolute;inset:0;width:100%;height:100%;image-rendering:pixelated;opacity:.45}.scan{position:absolute;inset:0;background:linear-gradient(rgba(0,0,0,0) 50%, rgba(0,0,0,0.30) 50%),linear-gradient(90deg, rgba(255,0,0,.04), rgba(0,255,0,.02), rgba(0,0,255,.04));background-size:100% 3px,4px 100%}.tint{position:absolute;inset:0;background:rgba(40,32,12,.12)}.pause{position:absolute;top:16px;left:16px;font:700 24px monospace;letter-spacing:3px;color:#fff3d0;text-shadow:0 0 8px #000,0 2px 4px #000}</style></head><body><div id=\"box\"><canvas id=\"vcr\" width=\"135\" height=\"240\"></canvas><div class=\"tint\"></div><div class=\"scan\"></div><div class=\"pause\"><b>&#10073;&#10073;</b> PAUSE</div></div><script>const vcr=document.getElementById(\"vcr\"),vctx=vcr.getContext(\"2d\");function m(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}function draw(t){const r=m((Math.floor(t*30)|0)+1),w=vcr.width,h=vcr.height,img=vctx.createImageData(w,h),d=img.data;for(let i=0;i<d.length;i+=4){const v=(r()*255)|0;d[i]=d[i+1]=d[i+2]=v;d[i+3]=(r()*54)|0;}vctx.putImageData(img,0,0);const band=Math.floor((t*60)%h);vctx.fillStyle=\"rgba(255,255,255,.5)\";for(let k=0;k<22;k++){const x=(r()*w)|0,y=band+((r()*46)|0)-23;vctx.fillRect(x,y,(r()*7)|0,2);}}let t=0;setInterval(()=>{t+=1/30;draw(t);vcr.style.transform=\"translateY(\"+((Math.floor(t*10)%2)?1:-1)+\"px)\";},33);</script></body></html>",
      "kind": "hyperframes"
    }
  },
  {
    "kind": "recipe",
    "id": "voxel-dither",
    "name": "Voxel Dither",
    "blurb": "A PS1/retro-console look: hard posterize the color depth then add ordered (Bayer) dithering so the banding reads as deliberate low-bit dither rather than AI artifacting.",
    "refs": [],
    "recipeKind": "ffmpeg",
    "body": "## What it is\n\nThe low-bit dither pass of the PS1 register. `vaguedenoiser` (optional) flattens noise, `eq` adds a little contrast, then `format` + a palette-style quantize posterizes the color depth, and an ordered dither stamps a Bayer pattern so the reduced palette reads as a real 90s-console dither instead of compression banding. Pair with `crt-scanlines` + `film-grain` for the full PS1 stack.\n\n## When to use it\n\n- A clip you want to read as PS1 / early-3D / voxel-console rendering.\n- Knocking an over-smooth AI gradient into a chunky, deliberate palette.\n\n## Knobs\n\n- `bayer_scale` = dither block size (larger = chunkier dots).\n- The quantized palette size (fewer colors = harder posterize).",
    "artifact": "# Ordered (Bayer) dither against a reduced palette — the deliberate low-bit look.\nffmpeg -i in.mp4 -vf \"eq=contrast=1.06,format=rgb24,paletteuse=dither=bayer:bayer_scale=3\" -c:v libx264 -preset fast -crf 20 -c:a copy out.mp4\n# (paletteuse needs a palettegen pass / -i palette.png; for a fixed-palette dither use:)\nffmpeg -i in.mp4 -vf \"format=rgb24,deband,dither=bayer\" -c:v libx264 -crf 20 out.mp4",
    "params": {
      "contrast": 1.06,
      "bayer_scale": 3
    }
  },
  {
    "kind": "asset",
    "id": "aura-hologram",
    "name": "AURA — Ship-AI Hologram",
    "blurb": "Giant translucent pink-magenta holographic woman (Joi-style), scanline flicker, echoed across ship monitors. The soothing-but-lethal AI guide (spaceship).",
    "refs": [
      "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blocks/asset/aura-hologram/char-aura.png"
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
    "id": "ballerina-cappuccina",
    "name": "Ballerina Cappuccina",
    "blurb": "Ballerina with a cappuccino-cup head; Italian-brainrot trend lead.",
    "refs": [],
    "sub": "character"
  },
  {
    "kind": "asset",
    "id": "bombardiro-crocodilo",
    "name": "Bombardiro Crocodilo",
    "blurb": "Crocodile-bomber-plane hybrid; canonical Italian-brainrot meme.",
    "refs": [],
    "sub": "character"
  },
  {
    "kind": "asset",
    "id": "brand-stickers",
    "name": "Brand sticker set",
    "blurb": "A pool of brand stickers dropped onto the canvas with an overshoot.",
    "refs": [
      "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blocks/asset/brand-stickers/ny01-laugh.png"
    ],
    "sub": "prop"
  },
  {
    "kind": "asset",
    "id": "chimpanzini-bananini",
    "name": "Chimpanzini Bananini",
    "blurb": "Monkey-banana hybrid; Italian-brainrot AI meme character.",
    "refs": [],
    "sub": "character"
  },
  {
    "kind": "asset",
    "id": "choosepath-soundtrack",
    "name": "ChoosePath Soundtrack",
    "blurb": "The looping dread bed under the choose-path PS1-horror series — slow, low, tension-holding, leaves headroom for the radio narrator and the death stingers. Shared across all six choose-* units.",
    "refs": [
      "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blocks/asset/choosepath-soundtrack/soundtrack.mp3"
    ],
    "sub": "music"
  },
  {
    "kind": "asset",
    "id": "doctor-authority",
    "name": "Doctor authority figure",
    "blurb": "A white-coat clinician used as the trust-anchor presenter.",
    "refs": [],
    "sub": "character"
  },
  {
    "kind": "asset",
    "id": "electronic-beat",
    "name": "Electronic beat",
    "blurb": "A 120-140 BPM electronic backbone for motion / kinetic spots.",
    "refs": [],
    "sub": "music"
  },
  {
    "kind": "asset",
    "id": "energy-drink",
    "name": "Energy drink can",
    "blurb": "A cold, sweating hype can used as a stand-in hero object.",
    "refs": [],
    "sub": "prop"
  },
  {
    "kind": "asset",
    "id": "gameplay-loop",
    "name": "Gameplay loop",
    "blurb": "A hypnotic CS:GO-surf gameplay loop used as the brainrot bottom layer.",
    "refs": [
      "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blocks/asset/gameplay-loop/cs-surf-loop.mp4"
    ],
    "sub": "prop"
  },
  {
    "kind": "asset",
    "id": "hazmat-scientists",
    "name": "Hazmat Scientist Trio",
    "blurb": "Three biohazard-suit gas-mask scientists (orange/teal/purple), the dwindling party of the Backrooms descent.",
    "refs": [
      "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blocks/asset/hazmat-scientists/char-doc.png",
      "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blocks/asset/hazmat-scientists/char-rust.png",
      "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blocks/asset/hazmat-scientists/char-vex.png"
    ],
    "sub": "character"
  },
  {
    "kind": "asset",
    "id": "hero-product",
    "name": "Hero product",
    "blurb": "The single branded object a reveal / ad is engineered around.",
    "refs": [],
    "sub": "prop"
  },
  {
    "kind": "asset",
    "id": "horror-bed",
    "name": "Horror dread bed",
    "blurb": "A degraded horror-TikTok music bed — slowed, reverbed, dread-forward.",
    "refs": [],
    "sub": "music"
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
    "id": "leshy-trent",
    "name": "LESHY — Half-Tree Trent",
    "blurb": "50/50 flesh-and-bark forest spirit, never speaks, only groans/gestures. Trust-but-verify guide (swamp).",
    "refs": [
      "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blocks/asset/leshy-trent/char-leshy.png"
    ],
    "sub": "character"
  },
  {
    "kind": "asset",
    "id": "lofi-bed",
    "name": "Lo-fi bed",
    "blurb": "A dusty head-nod loop with vinyl crackle for talk / podcast cuts.",
    "refs": [],
    "sub": "music"
  },
  {
    "kind": "asset",
    "id": "mockumentary-room",
    "name": "Mockumentary interior",
    "blurb": "A drab interview room dressed for found-footage dread.",
    "refs": [],
    "sub": "location"
  },
  {
    "kind": "asset",
    "id": "oneeyed-survivor",
    "name": "One-Eyed Survivor",
    "blurb": "Big ~60yo Black man, milky scarred blind eye, green overshirt, sawn-off rifle. Grim honest guide (war of the worlds).",
    "refs": [
      "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blocks/asset/oneeyed-survivor/char-survivor.png"
    ],
    "sub": "character"
  },
  {
    "kind": "asset",
    "id": "peaceful-alien",
    "name": "Peaceful Alien (brain-in-capsule)",
    "blurb": "Floating pink-brain in a clean capsule with soft tentacles, benevolent warm glow — the welcoming lie (war of the worlds).",
    "refs": [
      "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blocks/asset/peaceful-alien/char-alien.png"
    ],
    "sub": "character"
  },
  {
    "kind": "asset",
    "id": "product-set",
    "name": "Product hero set",
    "blurb": "A controlled tabletop / pedestal set built around one hero object.",
    "refs": [],
    "sub": "location"
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
    "id": "soviet-plaza",
    "name": "Soviet plaza",
    "blurb": "A vast concrete square under heroic banners.",
    "refs": [],
    "sub": "location"
  },
  {
    "kind": "asset",
    "id": "studio-cyc",
    "name": "Studio cyclorama",
    "blurb": "An infinite seamless sweep with controllable key light.",
    "refs": [],
    "sub": "location"
  },
  {
    "kind": "asset",
    "id": "tokyo-alley",
    "name": "Tokyo back-alley",
    "blurb": "Neon-soaked rain-slick alley, vending machines glowing.",
    "refs": [],
    "sub": "location"
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
    "id": "tralalero-tralala",
    "name": "Tralalero Tralala",
    "blurb": "The seminal Italian-brainrot character — three-legged shark in sneakers.",
    "refs": [],
    "sub": "character"
  },
  {
    "kind": "asset",
    "id": "trend-soviet-bed",
    "name": "Soviet trend bed",
    "blurb": "The canonical Soviet-nostalgic trend music bed — recognizability is half the format.",
    "refs": [
      "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blocks/asset/trend-soviet-bed/trend-soviet-bed.mp3"
    ],
    "sub": "music"
  },
  {
    "kind": "asset",
    "id": "vedma-witch",
    "name": "VEDMA — Bog Witch",
    "blurb": "Beautiful (not a hag) purple-gowned pointed-hat Slavic witch with grim help. Read-the-witch guide (swamp).",
    "refs": [
      "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blocks/asset/vedma-witch/char-witch.png"
    ],
    "sub": "character"
  },
  {
    "kind": "asset",
    "id": "voss-engineer",
    "name": "VOSS — Derelict-Ship Engineer",
    "blurb": "Fat balding bearded low-poly engineer, yellow hard hat, grimy coverall, cigarette. The abrasive-but-right guide (spaceship).",
    "refs": [
      "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blocks/asset/voss-engineer/char-voss.png"
    ],
    "sub": "character"
  },
  {
    "kind": "asset",
    "id": "vpn-mascot",
    "name": "VPN shield mascot",
    "blurb": "A round, friendly shield-creature — the sticker-pack lead.",
    "refs": [
      "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blocks/asset/vpn-mascot/sticker-shield-pure.png"
    ],
    "sub": "character"
  }
];
// ralphy:published-blocks:end

// ralphy:published-blueprints:start
export const PUBLISHED_BLUEPRINTS: Blueprint[] = [
  {
    "notes": "hard asset path for slot 'hub-lowpoly' does not exist; recorded by ref; hard asset path for slot 'hub-ftf' does not exist; recorded by ref; hard asset path for slot 'scene-s02-l0-fork' does not exist; recorded by ref; hard asset path for slot 'scene-s03-death-rust' does not exist; recorded by ref; hard asset path for slot 'scene-s04-through' does not exist; recorded by ref; hard asset path for slot 'scene-s05-poolrooms' does not exist; recorded by ref; hard asset path for slot 'scene-s06-l1-fork-slides' does not exist; recorded by ref; hard asset path for slot 'scene-s07-death-doc' does not exist; recorded by ref; hard asset path for slot 'scene-s08-splash' does not exist; recorded by ref; hard asset path for slot 'scene-s09-pipe' does not exist; recorded by ref; hard asset path for slot 'scene-s10-l2-fork-pipes' does not exist; recorded by ref; hard asset path for slot 'scene-s11-death-vex' does not exist; recorded by ref; hard asset path for slot 'scene-s12-down-blue' does not exist; recorded by ref; hard asset path for slot 'scene-s13-mall' does not exist; recorded by ref; hard asset path for slot 'scene-s14-l3-fork-exits' does not exist; recorded by ref; hard asset path for slot 'scene-s15-end' does not exist; recorded by ref",
    "assets": [
      {
        "kind": "character",
        "path": "assets/char-doc.png",
        "slot": "char-doc",
        "bytes": 1456440,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-backrooms/assets/char-doc.png"
      },
      {
        "kind": "character",
        "path": "assets/char-rust.png",
        "slot": "char-rust",
        "bytes": 1459048,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-backrooms/assets/char-rust.png"
      },
      {
        "kind": "character",
        "path": "assets/char-vex.png",
        "slot": "char-vex",
        "bytes": 1441248,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-backrooms/assets/char-vex.png"
      },
      {
        "kind": "location",
        "path": "assets/hub.png",
        "slot": "hub",
        "bytes": 1343977,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-backrooms/assets/hub.png"
      },
      {
        "kind": "location",
        "path": "assets/hub-ftf.png",
        "slot": "hub-ftf"
      },
      {
        "kind": "location",
        "path": "assets/hub-lowpoly.png",
        "slot": "hub-lowpoly"
      },
      {
        "kind": "location",
        "path": "assets/hub-vid.mp4",
        "slot": "hub-vid",
        "bytes": 2562927,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-backrooms/assets/hub-vid.mp4"
      },
      {
        "kind": "location",
        "path": "assets/scene-s02-fork-doors.png",
        "slot": "scene-s02-fork-doors",
        "bytes": 1305673,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-backrooms/assets/scene-s02-fork-doors.png"
      },
      {
        "kind": "location",
        "path": "assets/scene-s02-fork-doors-vid.mp4",
        "slot": "scene-s02-fork-doors-vid",
        "bytes": 2795291,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-backrooms/assets/scene-s02-fork-doors-vid.mp4"
      },
      {
        "kind": "location",
        "path": "assets/scene-s02-l0-fork.png",
        "slot": "scene-s02-l0-fork"
      },
      {
        "kind": "location",
        "path": "assets/scene-s03-death-red.png",
        "slot": "scene-s03-death-red",
        "bytes": 1108145,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-backrooms/assets/scene-s03-death-red.png"
      },
      {
        "kind": "location",
        "path": "assets/scene-s03-death-red-vid.mp4",
        "slot": "scene-s03-death-red-vid",
        "bytes": 2829890,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-backrooms/assets/scene-s03-death-red-vid.mp4"
      },
      {
        "kind": "location",
        "path": "assets/scene-s03-death-rust.png",
        "slot": "scene-s03-death-rust"
      },
      {
        "kind": "location",
        "path": "assets/scene-s04-blue-rust-lost.png",
        "slot": "scene-s04-blue-rust-lost",
        "bytes": 1360025,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-backrooms/assets/scene-s04-blue-rust-lost.png"
      },
      {
        "kind": "location",
        "path": "assets/scene-s04-blue-rust-lost-vid.mp4",
        "slot": "scene-s04-blue-rust-lost-vid",
        "bytes": 2722789,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-backrooms/assets/scene-s04-blue-rust-lost-vid.mp4"
      },
      {
        "kind": "location",
        "path": "assets/scene-s04-through.png",
        "slot": "scene-s04-through"
      },
      {
        "kind": "location",
        "path": "assets/scene-s05-pool-fork.png",
        "slot": "scene-s05-pool-fork",
        "bytes": 1208213,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-backrooms/assets/scene-s05-pool-fork.png"
      },
      {
        "kind": "location",
        "path": "assets/scene-s05-poolrooms.png",
        "slot": "scene-s05-poolrooms"
      },
      {
        "kind": "location",
        "path": "assets/scene-s06-death-pool.png",
        "slot": "scene-s06-death-pool",
        "bytes": 1162222,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-backrooms/assets/scene-s06-death-pool.png"
      },
      {
        "kind": "location",
        "path": "assets/scene-s06-death-pool-vid.mp4",
        "slot": "scene-s06-death-pool-vid",
        "bytes": 2501376,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-backrooms/assets/scene-s06-death-pool-vid.mp4"
      },
      {
        "kind": "location",
        "path": "assets/scene-s06-l1-fork-slides.png",
        "slot": "scene-s06-l1-fork-slides"
      },
      {
        "kind": "location",
        "path": "assets/scene-s07-death-doc.png",
        "slot": "scene-s07-death-doc"
      },
      {
        "kind": "location",
        "path": "assets/scene-s07-pool-doc-lost.png",
        "slot": "scene-s07-pool-doc-lost",
        "bytes": 1306928,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-backrooms/assets/scene-s07-pool-doc-lost.png"
      },
      {
        "kind": "location",
        "path": "assets/scene-s07-pool-doc-lost-vid.mp4",
        "slot": "scene-s07-pool-doc-lost-vid",
        "bytes": 2656486,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-backrooms/assets/scene-s07-pool-doc-lost-vid.mp4"
      },
      {
        "kind": "location",
        "path": "assets/scene-s08-pipe-fork.png",
        "slot": "scene-s08-pipe-fork",
        "bytes": 1286308,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-backrooms/assets/scene-s08-pipe-fork.png"
      },
      {
        "kind": "location",
        "path": "assets/scene-s08-pipe-fork-vid.mp4",
        "slot": "scene-s08-pipe-fork-vid",
        "bytes": 2030088,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-backrooms/assets/scene-s08-pipe-fork-vid.mp4"
      },
      {
        "kind": "location",
        "path": "assets/scene-s08-splash.png",
        "slot": "scene-s08-splash"
      },
      {
        "kind": "location",
        "path": "assets/scene-s09-death-redpipe.png",
        "slot": "scene-s09-death-redpipe",
        "bytes": 1317867,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-backrooms/assets/scene-s09-death-redpipe.png"
      },
      {
        "kind": "location",
        "path": "assets/scene-s09-death-redpipe-vid.mp4",
        "slot": "scene-s09-death-redpipe-vid",
        "bytes": 3075077,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-backrooms/assets/scene-s09-death-redpipe-vid.mp4"
      },
      {
        "kind": "location",
        "path": "assets/scene-s09-pipe.png",
        "slot": "scene-s09-pipe"
      },
      {
        "kind": "location",
        "path": "assets/scene-s09-redpipe-enter.png",
        "slot": "scene-s09-redpipe-enter",
        "bytes": 1195791,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-backrooms/assets/scene-s09-redpipe-enter.png"
      },
      {
        "kind": "location",
        "path": "assets/scene-s09-redpipe-enter-vid.mp4",
        "slot": "scene-s09-redpipe-enter-vid",
        "bytes": 2078621,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-backrooms/assets/scene-s09-redpipe-enter-vid.mp4"
      },
      {
        "kind": "location",
        "path": "assets/scene-s10-bluepipe-vex-lost.png",
        "slot": "scene-s10-bluepipe-vex-lost",
        "bytes": 1200937,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-backrooms/assets/scene-s10-bluepipe-vex-lost.png"
      },
      {
        "kind": "location",
        "path": "assets/scene-s10-bluepipe-vex-lost-vid.mp4",
        "slot": "scene-s10-bluepipe-vex-lost-vid",
        "bytes": 3243544,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-backrooms/assets/scene-s10-bluepipe-vex-lost-vid.mp4"
      },
      {
        "kind": "location",
        "path": "assets/scene-s10-l2-fork-pipes.png",
        "slot": "scene-s10-l2-fork-pipes"
      },
      {
        "kind": "location",
        "path": "assets/scene-s11-death-vex.png",
        "slot": "scene-s11-death-vex"
      },
      {
        "kind": "location",
        "path": "assets/scene-s11-mall.png",
        "slot": "scene-s11-mall",
        "bytes": 1078399,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-backrooms/assets/scene-s11-mall.png"
      },
      {
        "kind": "location",
        "path": "assets/scene-s11-mall-vid.mp4",
        "slot": "scene-s11-mall-vid",
        "bytes": 1485641,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-backrooms/assets/scene-s11-mall-vid.mp4"
      },
      {
        "kind": "location",
        "path": "assets/scene-s12-down-blue.png",
        "slot": "scene-s12-down-blue"
      },
      {
        "kind": "location",
        "path": "assets/scene-s12-exit-fork.png",
        "slot": "scene-s12-exit-fork",
        "bytes": 1087951,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-backrooms/assets/scene-s12-exit-fork.png"
      },
      {
        "kind": "location",
        "path": "assets/scene-s12-exit-fork-vid.mp4",
        "slot": "scene-s12-exit-fork-vid",
        "bytes": 886148,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-backrooms/assets/scene-s12-exit-fork-vid.mp4"
      },
      {
        "kind": "location",
        "path": "assets/scene-s13-death-wrongexit.png",
        "slot": "scene-s13-death-wrongexit",
        "bytes": 1141661,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-backrooms/assets/scene-s13-death-wrongexit.png"
      },
      {
        "kind": "location",
        "path": "assets/scene-s13-death-wrongexit-vid.mp4",
        "slot": "scene-s13-death-wrongexit-vid",
        "bytes": 1780957,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-backrooms/assets/scene-s13-death-wrongexit-vid.mp4"
      },
      {
        "kind": "location",
        "path": "assets/scene-s13-mall.png",
        "slot": "scene-s13-mall"
      },
      {
        "kind": "location",
        "path": "assets/scene-s14-end.png",
        "slot": "scene-s14-end",
        "bytes": 1179349,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-backrooms/assets/scene-s14-end.png"
      },
      {
        "kind": "location",
        "path": "assets/scene-s14-end-vid.mp4",
        "slot": "scene-s14-end-vid",
        "bytes": 4545763,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-backrooms/assets/scene-s14-end-vid.mp4"
      },
      {
        "kind": "location",
        "path": "assets/scene-s14-l3-fork-exits.png",
        "slot": "scene-s14-l3-fork-exits"
      },
      {
        "kind": "location",
        "path": "assets/scene-s15-end.png",
        "slot": "scene-s15-end"
      }
    ],
    "unitId": "choose-backrooms",
    "prompts": [
      {
        "slot": "char-doc",
        "text": "{\n  \"prompt\": {\n    \"scene\": {\n      \"description\": \"RETRO PS1/PSX LOW-POLY SURVIVAL-HORROR 3D GAME RENDER — chunky simplified low-poly geometry, low-resolution dithered textures, heavy film grain, dark and murky, limited detail, vertex wobble, affine texture warping; Silent Hill 1 / early Resident Evil / Puppet Combo / voxel look; NOT photorealistic, NOT high-detail, NOT painterly, NOT glossy. Full-body character reference of a hazmat / biohazard suit figure that MATCHES THE PROVIDED REFERENCE SUIT (hooded biohazard suit, round black gas-mask goggles) but the suit is recolored TEAL. He holds up a boxy handheld scanner / Geiger-counter detector (with a small dial and a stubby antenna) as his signature — the careful lead who measures the environment. NO briefcase. Careful, cautious posture. He stands in the mono-yellow Backrooms: buzzing fluorescent ceiling, damp yellow carpet, a single red line painted along the floor. Re-render in the stylized voxel/PS1 look while keeping the suit silhouette and gas-mask faithful to the reference. Palette: teal suit against mono-yellow walls, red floor line, black briefcase.\",\n      \"subject\": \"hazmat figure in a TEAL biohazard suit with round black gas-mask goggles, holding up a boxy handheld scanner / Geiger-counter detector, cautious careful stance\",\n      \"setting\": \"mono-yellow Backrooms room, buzzing fluorescents, damp yellow carpet, red floor line\",\n      \"action\": \"standing, gripping the briefcase, careful\"\n    },\n    \"style\": {\n      \"primary\": \"retro PS1/PSX 5th-gen-console low-poly survival-horror 3D game render\",\n      \"rendering_quality\": \"very low fidelity, low polygon count, chunky simplified geometry, flat low-res dithered textures, heavy grain; NOT photorealistic, NOT high-detail, NOT painterly, NOT glossy\",\n      \"surface_textures\": \"low-res dithered rubberized hazmat fabric, scuffed goggles, matte briefcase\",\n      \"lighting\": \"flat buzzing fluorescent overhead key, sickly yellow ambient, faint vignette\"\n    },\n    \"technical\": {\n      \"angle\": \"eye-level\",\n      \"rendering\": \"faint CRT/VHS scanline grain, low-poly aliasing, affine texture warping\",\n      \"resolution\": \"PS1-era low-fidelity, 9:16 vertical\"\n    },\n    \"composition\": {\n      \"framing\": \"centered full-body, clear readable silhouette\",\n      \"subject_placement\": \"center frame, yellow Backrooms behind\"\n    },\n    \"quality\": {\n      \"include\": [\n        \"voxel low-poly PS1 horror render\",\n        \"affine-warped textures\",\n        \"dithered grain\",\n        \"teal hazmat suit\",\n        \"round gas-mask goggles\",\n        \"handheld scanner / Geiger counter\",\n        \"mono-yellow Backrooms\",\n        \"red floor line\",\n        \"9:16 vertical\",\n        \"PS1/PSX low-poly\",\n        \"chunky low polygon count\",\n        \"low-resolution dithered textures\",\n        \"heavy grain\",\n        \"dark murky limited detail\",\n        \"vertex wobble\",\n        \"Silent Hill 1 / Puppet Combo aesthetic\"\n      ],\n      \"avoid\": [\n        \"photorealistic\",\n        \"smooth modern CGI\",\n        \"glossy octane render\",\n        \"cartoon\",\n        \"anime\",\n        \"cute\",\n        \"yellow suit\",\n        \"beauty filter\",\n        \"watermark\",\n        \"deformed hands\",\n        \"photorealistic\",\n        \"hyperdetailed\",\n        \"painterly\",\n        \"glossy\",\n        \"high-poly\",\n        \"ray traced\",\n        \"octane render\",\n        \"unreal engine 5\",\n        \"4k\",\n        \"sharp realistic skin\",\n        \"modern AAA graphics\"\n      ],\n      \"reference_standard\": \"PS1-era liminal-space render; match the supplied hazmat-suit reference, recolored teal\"\n    }\n  }\n}\n",
        "stage": "image"
      },
      {
        "slot": "char-rust",
        "text": "{\n  \"prompt\": {\n    \"scene\": {\n      \"description\": \"RETRO PS1/PSX LOW-POLY SURVIVAL-HORROR 3D GAME RENDER — chunky simplified low-poly geometry, low-resolution dithered textures, heavy film grain, dark and murky, limited detail, vertex wobble, affine texture warping; Silent Hill 1 / early Resident Evil / Puppet Combo / voxel look; NOT photorealistic, NOT high-detail, NOT painterly, NOT glossy. Full-body character reference of a hazmat / biohazard suit figure that MATCHES THE PROVIDED REFERENCE SUIT (hooded biohazard suit, round black gas-mask goggles) but the suit is recolored BRIGHT ORANGE. Match the clean, deformation-free low-poly body shape of the base scientist (no warped or extra limbs). Impatient, restless body language; he carries a heavy CROWBAR in one hand as his signature (the reckless one who pries and charges ahead). He stands in the mono-yellow Backrooms: buzzing fluorescent ceiling, damp yellow carpet, a single red line painted along the floor. Re-render in the stylized voxel/PS1 look while keeping the suit silhouette and gas-mask faithful to the reference. Palette: bright orange suit against mono-yellow walls, red floor line.\",\n      \"subject\": \"hazmat figure in a BRIGHT ORANGE biohazard suit with round black gas-mask goggles, restless impatient stance\",\n      \"setting\": \"mono-yellow Backrooms room, buzzing fluorescents, damp yellow carpet, red floor line\",\n      \"action\": \"standing, shifting weight, about to wander off\"\n    },\n    \"style\": {\n      \"primary\": \"retro PS1/PSX 5th-gen-console low-poly survival-horror 3D game render\",\n      \"rendering_quality\": \"very low fidelity, low polygon count, chunky simplified geometry, flat low-res dithered textures, heavy grain; NOT photorealistic, NOT high-detail, NOT painterly, NOT glossy\",\n      \"surface_textures\": \"low-res dithered rubberized hazmat fabric, scuffed goggles\",\n      \"lighting\": \"flat buzzing fluorescent overhead key, sickly yellow ambient, faint vignette\"\n    },\n    \"technical\": {\n      \"angle\": \"eye-level\",\n      \"rendering\": \"faint CRT/VHS scanline grain, low-poly aliasing, affine texture warping\",\n      \"resolution\": \"PS1-era low-fidelity, 9:16 vertical\"\n    },\n    \"composition\": {\n      \"framing\": \"centered full-body, clear readable silhouette\",\n      \"subject_placement\": \"center frame, yellow Backrooms behind\"\n    },\n    \"quality\": {\n      \"include\": [\n        \"voxel low-poly PS1 horror render\",\n        \"affine-warped textures\",\n        \"dithered grain\",\n        \"bright orange hazmat suit\",\n        \"round gas-mask goggles\",\n        \"mono-yellow Backrooms\",\n        \"buzzing fluorescents\",\n        \"red floor line\",\n        \"9:16 vertical\",\n        \"PS1/PSX low-poly\",\n        \"chunky low polygon count\",\n        \"low-resolution dithered textures\",\n        \"heavy grain\",\n        \"dark murky limited detail\",\n        \"vertex wobble\",\n        \"Silent Hill 1 / Puppet Combo aesthetic\"\n      ],\n      \"avoid\": [\n        \"photorealistic\",\n        \"smooth modern CGI\",\n        \"glossy octane render\",\n        \"cartoon\",\n        \"anime\",\n        \"cute\",\n        \"yellow suit\",\n        \"beauty filter\",\n        \"watermark\",\n        \"deformed hands\",\n        \"photorealistic\",\n        \"hyperdetailed\",\n        \"painterly\",\n        \"glossy\",\n        \"high-poly\",\n        \"ray traced\",\n        \"octane render\",\n        \"unreal engine 5\",\n        \"4k\",\n        \"sharp realistic skin\",\n        \"modern AAA graphics\"\n      ],\n      \"reference_standard\": \"PS1-era liminal-space render; match the supplied hazmat-suit reference, recolored orange\"\n    }\n  }\n}\n",
        "stage": "image"
      },
      {
        "slot": "char-vex",
        "text": "{\n  \"prompt\": {\n    \"scene\": {\n      \"description\": \"RETRO PS1/PSX LOW-POLY SURVIVAL-HORROR 3D GAME RENDER — chunky simplified low-poly geometry, low-resolution dithered textures, heavy film grain, dark and murky, limited detail, vertex wobble, affine texture warping; Silent Hill 1 / early Resident Evil / Puppet Combo / voxel look; NOT photorealistic, NOT high-detail, NOT painterly, NOT glossy. Full-body character reference of a hazmat / biohazard suit figure that MATCHES THE PROVIDED REFERENCE SUIT (hooded biohazard suit, round black gas-mask goggles) but the suit is recolored PURPLE. Match the clean, deformation-free low-poly body shape of the base scientist (no warped or extra limbs). Wary, cynical posture; he clutches a battered metal hard-case handcuffed to his wrist as his signature (the paranoid one who never lets go of his case). He stands in the mono-yellow Backrooms: buzzing fluorescent ceiling, damp yellow carpet, a single red line painted along the floor. Re-render in the stylized voxel/PS1 look while keeping the suit silhouette and gas-mask faithful to the reference. Palette: purple suit against mono-yellow walls, red floor line.\",\n      \"subject\": \"hazmat figure in a PURPLE biohazard suit with round black gas-mask goggles, arms crossed, wary cynical stance\",\n      \"setting\": \"mono-yellow Backrooms room, buzzing fluorescents, damp yellow carpet, red floor line\",\n      \"action\": \"standing, arms crossed, skeptical\"\n    },\n    \"style\": {\n      \"primary\": \"retro PS1/PSX 5th-gen-console low-poly survival-horror 3D game render\",\n      \"rendering_quality\": \"very low fidelity, low polygon count, chunky simplified geometry, flat low-res dithered textures, heavy grain; NOT photorealistic, NOT high-detail, NOT painterly, NOT glossy\",\n      \"surface_textures\": \"low-res dithered rubberized hazmat fabric, scuffed goggles\",\n      \"lighting\": \"flat buzzing fluorescent overhead key, sickly yellow ambient, faint vignette\"\n    },\n    \"technical\": {\n      \"angle\": \"eye-level\",\n      \"rendering\": \"faint CRT/VHS scanline grain, low-poly aliasing, affine texture warping\",\n      \"resolution\": \"PS1-era low-fidelity, 9:16 vertical\"\n    },\n    \"composition\": {\n      \"framing\": \"centered full-body, clear readable silhouette\",\n      \"subject_placement\": \"center frame, yellow Backrooms behind\"\n    },\n    \"quality\": {\n      \"include\": [\n        \"voxel low-poly PS1 horror render\",\n        \"affine-warped textures\",\n        \"dithered grain\",\n        \"purple hazmat suit\",\n        \"round gas-mask goggles\",\n        \"arms crossed cynical\",\n        \"mono-yellow Backrooms\",\n        \"red floor line\",\n        \"9:16 vertical\",\n        \"PS1/PSX low-poly\",\n        \"chunky low polygon count\",\n        \"low-resolution dithered textures\",\n        \"heavy grain\",\n        \"dark murky limited detail\",\n        \"vertex wobble\",\n        \"Silent Hill 1 / Puppet Combo aesthetic\"\n      ],\n      \"avoid\": [\n        \"photorealistic\",\n        \"smooth modern CGI\",\n        \"glossy octane render\",\n        \"cartoon\",\n        \"anime\",\n        \"cute\",\n        \"yellow suit\",\n        \"beauty filter\",\n        \"watermark\",\n        \"deformed hands\",\n        \"photorealistic\",\n        \"hyperdetailed\",\n        \"painterly\",\n        \"glossy\",\n        \"high-poly\",\n        \"ray traced\",\n        \"octane render\",\n        \"unreal engine 5\",\n        \"4k\",\n        \"sharp realistic skin\",\n        \"modern AAA graphics\"\n      ],\n      \"reference_standard\": \"PS1-era liminal-space render; match the supplied hazmat-suit reference, recolored purple\"\n    }\n  }\n}\n",
        "stage": "image"
      },
      {
        "slot": "hub",
        "text": "Generate a screenshot from a first-person horror video game with NO interface/HUD, in voxel graphics in the style of PS1 (chunky low-poly geometry, low-resolution dithered textures, affine texture warping, vertex wobble, heavy grain, sickly and murky). Render CHARACTERS and ENVIRONMENT at the SAME crude low-poly fidelity. Characters FULL BODY, not cropped.\n\nThis is a quick TEAM-INTRODUCTION shot (NOT a choice, NO doors). First-person POV: the hero has just NOCLIPPED into the mono-yellow Backrooms — buzzing fluorescent ceiling lights, damp yellow carpet, a single red line painted along the floor, an empty endless yellow room. The hero's blocky low-poly hand is visible in the foreground. The hero's THREE hazmat-suited companions stand together facing the camera, being introduced as the team, CLOSE and clearly visible: one in an ORANGE suit holding a crowbar, one in a TEAL suit holding a boxy handheld scanner, one in a PURPLE suit clutching a metal hard-case. Each wears round black gas-mask goggles. Sickly yellow fluorescent light, claustrophobic liminal dread.\n\nFRAMING — MATCH THE SECOND REFERENCE IMAGE FOR SCALE & PLACEMENT ONLY (do NOT copy its content, characters or any text): the three companions stand in a row facing the camera, FULL BODY from head to feet, LARGE and CLOSE so they fill most of the vertical frame — feet visible near the bottom, heads near the top. This is the opening 'hook' team shot; characters must be big, bright and instantly readable in the very first frame. Do NOT crop legs or feet. 9:16 vertical.\n",
        "stage": "image"
      },
      {
        "slot": "hub-ftf",
        "text": "Generate a screenshot from a first-person horror video game with NO interface/HUD, rendered in the EXACT visual style of CHILLA'''S ART and FEARS TO FATHOM indie PS1/PS2 horror games — flat restrained lighting, heavy film grain and VHS noise, a muted desaturated palette, low-resolution textures, low-poly 3D models with realistic proportions, slightly soft/blurred, a mundane found-footage indie-horror-game look; NOT voxel, NOT cube-based, NOT cinematic, NOT dramatic, NOT painterly, NOT AAA (chunky low-poly geometry, low-resolution dithered textures, affine texture warping, vertex wobble, heavy grain, sickly and murky). Render CHARACTERS and ENVIRONMENT at the SAME crude low-poly fidelity. Characters FULL BODY, not cropped.\n\nThis is a quick TEAM-INTRODUCTION shot (NOT a choice, NO doors). First-person POV: the hero has just NOCLIPPED into the mono-yellow Backrooms — buzzing fluorescent ceiling lights, damp yellow carpet, a single red line painted along the floor, an empty endless yellow room. The hero's blocky low-poly hand is visible in the foreground. The hero's THREE hazmat-suited companions stand together facing the camera, being introduced as the team, CLOSE and clearly visible: one in an ORANGE suit holding a crowbar, one in a TEAL suit holding a boxy handheld scanner, one in a PURPLE suit clutching a metal hard-case. Each wears round black gas-mask goggles. Sickly yellow fluorescent light, claustrophobic liminal dread.\n\nFRAMING — MATCH THE SECOND REFERENCE IMAGE FOR SCALE & PLACEMENT ONLY (do NOT copy its content, characters or any text): the three companions stand in a row facing the camera, FULL BODY from head to feet, LARGE and CLOSE so they fill most of the vertical frame — feet visible near the bottom, heads near the top. This is the opening 'hook' team shot; characters must be big, bright and instantly readable in the very first frame. Do NOT crop legs or feet. 9:16 vertical.\n",
        "stage": "image"
      },
      {
        "slot": "hub-lowpoly",
        "text": "Generate a screenshot from a first-person horror video game with NO interface/HUD, in PURE LOW-POLY PS1/PSX graphics (smooth-shaded triangulated low-poly 3D models like real PlayStation-1 games, NOT voxel, NOT cube-based, NOT minecraft, NOT painterly) (clean low-poly triangulated geometry, low-resolution dithered textures, affine texture warping, vertex wobble, heavy grain, sickly and murky). Render CHARACTERS and ENVIRONMENT at the SAME crude low-poly fidelity. Characters FULL BODY, not cropped.\n\nThis is a quick TEAM-INTRODUCTION shot (NOT a choice, NO doors). First-person POV: the hero has just NOCLIPPED into the mono-yellow Backrooms — buzzing fluorescent ceiling lights, damp yellow carpet, a single red line painted along the floor, an empty endless yellow room. The hero's blocky low-poly hand is visible in the foreground. The hero's THREE hazmat-suited companions stand together facing the camera, being introduced as the team, CLOSE and clearly visible: one in an ORANGE suit holding a crowbar, one in a TEAL suit holding a boxy handheld scanner, one in a PURPLE suit clutching a metal hard-case. Each wears round black gas-mask goggles. Sickly yellow fluorescent light, claustrophobic liminal dread.\n\nFRAMING — MATCH THE SECOND REFERENCE IMAGE FOR SCALE & PLACEMENT ONLY (do NOT copy its content, characters or any text): the three companions stand in a row facing the camera, FULL BODY from head to feet, LARGE and CLOSE so they fill most of the vertical frame — feet visible near the bottom, heads near the top. This is the opening 'hook' team shot; characters must be big, bright and instantly readable in the very first frame. Do NOT crop legs or feet. 9:16 vertical.\n",
        "stage": "image"
      },
      {
        "slot": "hub-vid",
        "text": "PS1 indie liminal-space Backrooms horror game footage, first-person POV, heavy grain/VHS, low-poly, mono-yellow rooms with a red floor line and buzzing migraine fluorescents, 9:16. Reality glitches and tears as the POV phases down through the floor into a buzzing yellow Backrooms room; three hazmat scientists (orange with a crowbar, teal with a scanner, purple with a metal case) land and look around nervously, the red line on damp carpet. Blocky low-poly POV hand. Throughout: fluorescents buzz and flicker, the party shifts uneasily, faint glitch artifacts, oppressive hum. Camera settles facing forward.\n",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "i2v/hub-vid",
        "text": "PS1 indie liminal-space Backrooms horror game footage, first-person POV, heavy grain/VHS, low-poly, mono-yellow rooms with a red floor line and buzzing migraine fluorescents, 9:16. Reality glitches and tears as the POV phases down through the floor into a buzzing yellow Backrooms room; three hazmat scientists (orange with a crowbar, teal with a scanner, purple with a metal case) land and look around nervously, the red line on damp carpet. Blocky low-poly POV hand. Throughout: fluorescents buzz and flicker, the party shifts uneasily, faint glitch artifacts, oppressive hum. Camera settles facing forward.\n",
        "stage": "i2v"
      },
      {
        "slot": "i2v/scene-s02-fork-doors-vid",
        "text": "PS1 indie Backrooms horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. A held choice-moment, idle, nobody commits. POV faces two identical bland yellow doors in the buzzing room, the red floor line between them; the three hazmat scientists wait tense behind. LOCKED framing. Throughout: fluorescents flicker and buzz, shadows pulse, the scientists shift nervously, faint glitch — the world is alive but the choice is unmade.\n",
        "stage": "i2v"
      },
      {
        "slot": "i2v/scene-s03-death-red-vid",
        "text": "PS1 indie Backrooms horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. A death scene — instant, no escape. 0-1s: the ORANGE hazmat scientist opens the other yellow door and steps through. 1-3s: a dark shape lunges out of the black doorway, seizes him and yanks him violently into the void, his crowbar clattering on the carpet. 3-4s: the dark swallows him, the door slamming to black. Shriek, drag, slam.\n",
        "stage": "i2v"
      },
      {
        "slot": "i2v/scene-s04-blue-rust-lost-vid",
        "text": "PS1 indie Backrooms horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. POV and the two remaining hazmat scientists (teal, purple) push forward through the chosen yellow door into a deeper buzzing corridor; the orange one is gone. Blocky low-poly POV hand. Forward motion, fluorescents buzz and flicker, wet carpet underfoot, tense, the two scientists move with you.\n",
        "stage": "i2v"
      },
      {
        "slot": "i2v/scene-s05-pool-fork-vid",
        "text": "PS1 indie Backrooms poolrooms horror game footage, first-person POV, heavy grain/VHS, low-poly, white tile and dim almond-water, 9:16. A held choice-moment, idle, nobody commits. POV at the top of two big water slides side by side that look identical; the two scientists hesitate beside you. LOCKED framing. Throughout: water shimmers, light ripples on the wet tile, steam drifts, distant drips echo — world alive, choice unmade.\n",
        "stage": "i2v"
      },
      {
        "slot": "i2v/scene-s06-death-pool-vid",
        "text": "PS1 indie Backrooms poolrooms horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. A death scene — instant. 0-1s: the TEAL hazmat scientist rides down the other water slide. 1-3s: mid-slide it is lined with jutting rebar and blades — blood sprays violently, his scanner clatters down the chute. 3-4s: he is gone, blood streaking the tile. Slide whoosh, wet impact, scream.\n",
        "stage": "i2v"
      },
      {
        "slot": "i2v/scene-s07-pool-doc-lost-vid",
        "text": "PS1 indie Backrooms poolrooms horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. POV plunges down the safe slide and splashes into the dim almond-water pool, surfacing and hauling out onto the tile; the purple scientist surfaces too; the teal one is gone. Blocky low-poly POV hands. Water churns and drips, light ripples, forward, relief-tense.\n",
        "stage": "i2v"
      },
      {
        "slot": "i2v/scene-s08-pipe-fork-vid",
        "text": "PS1 indie Backrooms pipe/maintenance level horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. A held choice-moment, idle, nobody commits. POV faces two large pipe openings — a plain RED pipe, and a BLUE pipe ringed with glowing signs, symbols and arrows screaming 'jump here'; the purple scientist hesitates. LOCKED framing. Throughout: the blue signs glow and pulse, steam hisses from joints, fluorescents flicker — world alive, choice unmade.\n",
        "stage": "i2v"
      },
      {
        "slot": "i2v/scene-s09-death-redpipe-vid",
        "text": "PS1 indie Backrooms pipe-level horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. A death scene — instant. 0-1s: the PURPLE hazmat scientist, distrusting the glowing signs, dives into the plain red pipe. 1-3s: the red pipe is a trap — grinding blades and a crushing drop, blood and a cut-off scream, his metal case clanging. 3-4s: gone, to black. Dive, grind, scream.\n",
        "stage": "i2v"
      },
      {
        "slot": "i2v/scene-s09-redpipe-enter-vid",
        "text": "PS1 indie Backrooms pipe-level horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. POV leans toward the grim dark mouth of the plain red pipe, a cold black shaft dripping inside; the glowing blue pipe pulses off to the side. Blocky low-poly POV hand. Steam hisses, water drips, fluorescents flicker, dread — tense, held.\n",
        "stage": "i2v"
      },
      {
        "slot": "i2v/scene-s10-bluepipe-vex-lost-vid",
        "text": "PS1 indie Backrooms horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. POV jumps into the glowing blue pipe — the signs were honest — and drops cleanly down a bright bioluminescent shaft to the next level, glowing rings streaking past; you are alone now, the purple scientist gone. Rushing descent, whoosh, glowing rings blur past, blocky POV hands.\n",
        "stage": "i2v"
      },
      {
        "slot": "i2v/scene-s11-mall-vid",
        "text": "PS1 indie liminal empty-mall horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. POV walks out alone into a vast empty liminal shopping mall — dead escalators, shuttered stores, a dry fountain, dim flickering lights, oppressive silence. Blocky low-poly POV hand. Slow forward walk, dust drifts in the light shafts, distant lights flicker and buzz — alone, eerie, wrong-but-familiar.\n",
        "stage": "i2v"
      },
      {
        "slot": "i2v/scene-s12-exit-fork-vid",
        "text": "PS1 indie liminal empty-mall horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. A held choice-moment, idle, alone. POV faces two doors in the dead mall, each with an identical glowing green 'EXIT' sign — impossible to tell which is real. LOCKED framing. Throughout: the EXIT signs buzz and flicker, dust drifts, a far escalator creaks, lights pulse — world alive, choice unmade.\n",
        "stage": "i2v"
      },
      {
        "slot": "i2v/scene-s13-death-wrongexit-vid",
        "text": "PS1 indie liminal-mall horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. A death scene — instant. 0-1s: POV opens one EXIT door. 1-3s: it opens onto an endless screaming void — a dark entity lunges and drags the camera through into black. 3-4s: swallowed to black. Door creak, shriek, slam.\n",
        "stage": "i2v"
      },
      {
        "slot": "i2v/scene-s14-end-vid",
        "text": "PS1 indie horror game footage turning calm, first-person POV, heavy grain/VHS, low-poly, 9:16. POV opens the real EXIT door and reality tears open in a glitching bright rip — you noclip back out into the ordinary real world: normal daylight walls, the buzzing fluorescent hum gone, quiet calm. Throughout: the glitch-rip shimmers and settles, soft daylight spills in, the POV steadies and rests — you made it out, alone, relieved. The world keeps gently moving, no freeze.\n",
        "stage": "i2v"
      },
      {
        "slot": "scene-s02-fork-doors",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted low-poly, UNIFORM low fidelity, NOT cinematic. A mono-yellow Backrooms room; directly IN FRONT of the POV, two doors side by side — a RED door on the left and a BLUE door on the right — this is YOUR choice. Your three hazmat companions stand off to the SIDES watching: ORANGE suit with crowbar, TEAL suit with scanner, PURPLE suit with metal case. IMPORTANT: blocky low-poly first-person POV HANDS in dirty yellow hazmat gloves in the foreground. 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-s02-fork-doors-vid",
        "text": "PS1 indie Backrooms horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. A held choice-moment, idle, nobody commits. POV faces two identical bland yellow doors in the buzzing room, the red floor line between them; the three hazmat scientists wait tense behind. LOCKED framing. Throughout: fluorescents flicker and buzz, shadows pulse, the scientists shift nervously, faint glitch — the world is alive but the choice is unmade.\n",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "scene-s02-l0-fork",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted low-poly, UNIFORM low fidelity, NOT cinematic. A mono-yellow Backrooms room; ahead two identical doors, one BLUE and one RED; your three hazmat companions stand near you facing the doors — ORANGE suit with a crowbar, TEAL suit with a handheld scanner, PURPLE suit clutching a metal case. IMPORTANT: blocky low-poly first-person POV HANDS in dirty yellow hazmat gloves clearly visible in the foreground (let's-play, hands always in frame). 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-s03-death-red",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted low-poly, UNIFORM low fidelity, NOT cinematic. Same yellow Backrooms. You stepped through the RED door — beyond it the dark lashes out and a clawed shape seizes the POV, dragging you into pitch black: a death. IMPORTANT: blocky low-poly first-person POV HANDS in yellow hazmat gloves thrown up as the dark takes you. 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-s03-death-red-vid",
        "text": "PS1 indie Backrooms horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. A death scene — instant, no escape. 0-1s: the ORANGE hazmat scientist opens the other yellow door and steps through. 1-3s: a dark shape lunges out of the black doorway, seizes him and yanks him violently into the void, his crowbar clattering on the carpet. 3-4s: the dark swallows him, the door slamming to black. Shriek, drag, slam.\n",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "scene-s03-death-rust",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted low-poly, UNIFORM low fidelity, NOT cinematic. Same yellow Backrooms. The ORANGE-suited companion RUST has opened the other door — a dark shape lunges out and drags him into pitch black, the doorway swallowing him. IMPORTANT: blocky low-poly first-person POV HANDS in yellow hazmat gloves clearly visible in the foreground. 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-s04-blue-rust-lost",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted low-poly, UNIFORM low fidelity, NOT cinematic. You went through the BLUE door into the next safe yellow corridor; you glance back and see the ORANGE-suit companion RUST (crowbar) walk into the RED door — the dark yanks him in and he is gone, not returning. IMPORTANT: blocky low-poly first-person POV HANDS in yellow hazmat gloves in the foreground, glancing back. 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-s04-blue-rust-lost-vid",
        "text": "PS1 indie Backrooms horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. POV and the two remaining hazmat scientists (teal, purple) push forward through the chosen yellow door into a deeper buzzing corridor; the orange one is gone. Blocky low-poly POV hand. Forward motion, fluorescents buzz and flicker, wet carpet underfoot, tense, the two scientists move with you.\n",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "scene-s04-through",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted low-poly, UNIFORM low fidelity, NOT cinematic. Same yellow Backrooms, continue the style. You and the two remaining companions — TEAL suit DOC with his scanner, PURPLE suit VEX with his case — step through the correct door into the next yellow corridor. IMPORTANT: blocky low-poly first-person POV HANDS in yellow hazmat gloves clearly visible in the foreground. 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-s05-pool-fork",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted low-poly, UNIFORM low fidelity, NOT cinematic. Descend into the POOLROOMS — a dim flooded white-tiled liminal level with deep dark almond-water. A CHOICE of two ways across: wade/swim straight across the deep dark water in the middle, or edge along a narrow dry tiled ledge to the side. TEAL DOC (scanner) and PURPLE VEX (case) beside you. NO water slides anywhere. IMPORTANT: blocky low-poly first-person POV HANDS in yellow hazmat gloves in the foreground. 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-s05-pool-fork-vid",
        "text": "PS1 indie Backrooms poolrooms horror game footage, first-person POV, heavy grain/VHS, low-poly, white tile and dim almond-water, 9:16. A held choice-moment, idle, nobody commits. POV at the top of two big water slides side by side that look identical; the two scientists hesitate beside you. LOCKED framing. Throughout: water shimmers, light ripples on the wet tile, steam drifts, distant drips echo — world alive, choice unmade.\n",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "scene-s05-poolrooms",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted low-poly, UNIFORM low fidelity, NOT cinematic. Descend into the POOLROOMS level — a dim wet white-tiled liminal waterpark, shallow glowing almond-water pools, fluorescent hum; TEAL DOC and PURPLE VEX beside you. IMPORTANT: blocky low-poly first-person POV HANDS in yellow hazmat gloves clearly visible in the foreground. 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-s06-death-pool",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted low-poly, UNIFORM low fidelity, NOT cinematic. Same poolrooms. You took the wrong way across — something pale and many-limbed surges up out of the deep almond-water and drags the POV under: a death. IMPORTANT: blocky low-poly first-person POV HANDS in yellow hazmat gloves clawing at the water surface as you are pulled under. 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-s06-death-pool-vid",
        "text": "PS1 indie Backrooms poolrooms horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. A death scene — instant. 0-1s: the TEAL hazmat scientist rides down the other water slide. 1-3s: mid-slide it is lined with jutting rebar and blades — blood sprays violently, his scanner clatters down the chute. 3-4s: he is gone, blood streaking the tile. Slide whoosh, wet impact, scream.\n",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "scene-s06-l1-fork-slides",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted low-poly, UNIFORM low fidelity, NOT cinematic. Same poolrooms. Two big water slides side by side, looking identical from the top; DOC (teal) and VEX (purple) beside you choosing. IMPORTANT: blocky low-poly first-person POV HANDS in yellow hazmat gloves clearly visible gripping the slide rail in the foreground. 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-s07-death-doc",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted low-poly, UNIFORM low fidelity, NOT cinematic. Same poolrooms slides. The TEAL-suit DOC rides the other slide — mid-chute it is lined with jutting rebar and blades, blood sprays, his scanner clatters away. IMPORTANT: blocky low-poly first-person POV HANDS in yellow hazmat gloves visible at the top of the slides. 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-s07-pool-doc-lost",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted low-poly, UNIFORM low fidelity, NOT cinematic. You crossed the poolroom safely the right way and reach the far tiled edge; behind you the TEAL-suit DOC takes the wrong way and is dragged under the dark almond-water, his scanner sinking, gone. IMPORTANT: blocky low-poly first-person POV HANDS in yellow hazmat gloves on the far tiled edge, looking back. 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-s07-pool-doc-lost-vid",
        "text": "PS1 indie Backrooms poolrooms horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. POV plunges down the safe slide and splashes into the dim almond-water pool, surfacing and hauling out onto the tile; the purple scientist surfaces too; the teal one is gone. Blocky low-poly POV hands. Water churns and drips, light ripples, forward, relief-tense.\n",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "scene-s08-pipe-fork",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted low-poly, UNIFORM low fidelity, NOT cinematic. A dim maintenance pipe level; directly ahead two big pipe mouths — a plain RED pipe and a BLUE pipe ringed with glowing signs, symbols and arrows pointing into it. PURPLE-suit VEX (case) beside you. IMPORTANT: blocky low-poly first-person POV HANDS in yellow hazmat gloves reaching toward the pipes. 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-s08-pipe-fork-vid",
        "text": "PS1 indie Backrooms pipe/maintenance level horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. A held choice-moment, idle, nobody commits. POV faces two large pipe openings — a plain RED pipe, and a BLUE pipe ringed with glowing signs, symbols and arrows screaming 'jump here'; the purple scientist hesitates. LOCKED framing. Throughout: the blue signs glow and pulse, steam hisses from joints, fluorescents flicker — world alive, choice unmade.\n",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "scene-s08-splash",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted low-poly, UNIFORM low fidelity, NOT cinematic. You plunge down the correct slide and splash safe into the dim almond-water pool, surfacing; PURPLE-suit VEX (clutching his case) surfaces beside you. IMPORTANT: blocky low-poly first-person POV HANDS in yellow hazmat gloves breaking the water surface in the foreground. 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-s09-death-redpipe",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted low-poly, UNIFORM low fidelity, NOT cinematic. You dived into the plain RED pipe — its throat is lined with jutting knives and rusty rebar; blood sprays as it shreds the POV: a death. IMPORTANT: blocky low-poly first-person POV HANDS in yellow hazmat gloves out front in the knife-lined red pipe. 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-s09-death-redpipe-vid",
        "text": "PS1 indie Backrooms pipe-level horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. A death scene — instant. 0-1s: the PURPLE hazmat scientist, distrusting the glowing signs, dives into the plain red pipe. 1-3s: the red pipe is a trap — grinding blades and a crushing drop, blood and a cut-off scream, his metal case clanging. 3-4s: gone, to black. Dive, grind, scream.\n",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "scene-s09-pipe",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted low-poly, UNIFORM low fidelity, NOT cinematic. A dim maintenance pipe level; two big pipe mouths ahead — a RED pipe and a BLUE pipe; the BLUE one is ringed with glowing signs, symbols and arrows pointing into it. PURPLE VEX (with case) beside you. IMPORTANT: blocky low-poly first-person POV HANDS in yellow hazmat gloves clearly visible in the foreground. 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-s09-redpipe-enter",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted low-poly, UNIFORM low fidelity, NOT cinematic. Same maintenance pipe level as the reference. START / FIRST frame of the action: the POV stands right at the mouth of the plain dark RED pipe, about to climb in — looking into its dark empty throat from the threshold; the glowing signposted blue pipe visible to the side. NOTHING bad yet — no knives, no blood, just entering. IMPORTANT: blocky low-poly first-person POV HANDS in yellow hazmat gloves gripping the rim of the red pipe at the threshold. 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-s09-redpipe-enter-vid",
        "text": "PS1 indie Backrooms pipe-level horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. POV leans toward the grim dark mouth of the plain red pipe, a cold black shaft dripping inside; the glowing blue pipe pulses off to the side. Blocky low-poly POV hand. Steam hisses, water drips, fluorescents flicker, dread — tense, held.\n",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "scene-s10-bluepipe-vex-lost",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted low-poly, UNIFORM low fidelity, NOT cinematic. You dived the signposted glowing BLUE pipe (safe) and slide down its throat; behind you PURPLE-suit VEX distrusts the signs, dives the plain RED pipe and never comes out, his metal case tumbling after. IMPORTANT: blocky low-poly first-person POV HANDS in yellow hazmat gloves out front in the glowing blue pipe. 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-s10-bluepipe-vex-lost-vid",
        "text": "PS1 indie Backrooms horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. POV jumps into the glowing blue pipe — the signs were honest — and drops cleanly down a bright bioluminescent shaft to the next level, glowing rings streaking past; you are alone now, the purple scientist gone. Rushing descent, whoosh, glowing rings blur past, blocky POV hands.\n",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "scene-s10-l2-fork-pipes",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted low-poly, UNIFORM low fidelity, NOT cinematic. Same pipe level, at the two pipe mouths: the BLUE pipe glowing with signs vs the plain dark RED pipe; VEX hesitating beside you. IMPORTANT: blocky low-poly first-person POV HANDS in yellow hazmat gloves reaching toward the glowing blue pipe. 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-s11-death-vex",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted low-poly, UNIFORM low fidelity, NOT cinematic. Same pipe mouths. PURPLE-suit VEX distrusts the signs and dives into the plain RED pipe — it swallows him into darkness, gone, his metal case tumbling after. IMPORTANT: blocky low-poly first-person POV HANDS in yellow hazmat gloves at the pipe mouth. 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-s11-mall",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted low-poly, UNIFORM low fidelity, NOT cinematic. An empty liminal shopping mall — dead still escalators, shuttered dim storefronts, a dry fountain, fluorescent hum, completely alone now. IMPORTANT: blocky low-poly first-person POV HANDS in yellow hazmat gloves in the foreground. 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-s11-mall-vid",
        "text": "PS1 indie liminal empty-mall horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. POV walks out alone into a vast empty liminal shopping mall — dead escalators, shuttered stores, a dry fountain, dim flickering lights, oppressive silence. Blocky low-poly POV hand. Slow forward walk, dust drifts in the light shafts, distant lights flicker and buzz — alone, eerie, wrong-but-familiar.\n",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "scene-s12-down-blue",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted low-poly, UNIFORM low fidelity, NOT cinematic. You dive into the signposted BLUE pipe and slide down through its glowing throat — the signs were honest, dropping you cleanly toward the next level. Alone now. IMPORTANT: blocky low-poly first-person POV HANDS in yellow hazmat gloves out front inside the glowing pipe. 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-s12-exit-fork",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted low-poly, UNIFORM low fidelity, NOT cinematic. Two doors ahead in the dead mall, each with an identical glowing green EXIT sign above it — your choice, impossible to tell which is real. IMPORTANT: blocky low-poly first-person POV HANDS in yellow hazmat gloves reaching out toward the doors. 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-s12-exit-fork-vid",
        "text": "PS1 indie liminal empty-mall horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. A held choice-moment, idle, alone. POV faces two doors in the dead mall, each with an identical glowing green 'EXIT' sign — impossible to tell which is real. LOCKED framing. Throughout: the EXIT signs buzz and flicker, dust drifts, a far escalator creaks, lights pulse — world alive, choice unmade.\n",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "scene-s13-death-wrongexit",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted low-poly, UNIFORM low fidelity, NOT cinematic. Same dead mall / EXIT doors as the reference. You pushed open the WRONG exit door (it swings open naturally) — beyond it is NOT escape but the same endless yellow Backrooms rooms looping back, and a single clear pale smiling humanoid entity stands in the doorway lunging toward the POV. Keep the monster a coherent solid low-poly figure, NOT a pixelated mush. IMPORTANT: a blocky low-poly first-person POV HAND in a yellow hazmat glove on the opening door. 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-s13-death-wrongexit-vid",
        "text": "PS1 indie liminal-mall horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. A death scene — instant. 0-1s: POV opens one EXIT door. 1-3s: it opens onto an endless screaming void — a dark entity lunges and drags the camera through into black. 3-4s: swallowed to black. Door creak, shriek, slam.\n",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "scene-s13-death-wrongexit-vid",
        "text": "PS1 indie liminal-mall horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. A death scene — instant. 0-1s: POV opens one EXIT door. 1-3s: it opens onto an endless screaming void — a dark entity lunges and drags the camera through into black. 3-4s: swallowed to black. Door creak, shriek, slam.\n",
        "model": "bytedance/seedance-2.0",
        "stage": "video"
      },
      {
        "slot": "scene-s13-mall",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted low-poly, UNIFORM low fidelity, NOT cinematic. An empty liminal shopping mall — dead still escalators, shuttered dim storefronts, a dry fountain, fluorescent hum, completely alone. IMPORTANT: blocky low-poly first-person POV HANDS in yellow hazmat gloves clearly visible in the foreground. 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-s14-end",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted low-poly, UNIFORM low fidelity, NOT cinematic. You pushed the right EXIT door and reality tears open into bright real-world daylight — escaped at last, alone. IMPORTANT: a blocky low-poly first-person POV HAND in a yellow hazmat glove pushing the door open into the daylight. 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-s14-end-vid",
        "text": "PS1 indie horror game footage turning calm, first-person POV, heavy grain/VHS, low-poly, 9:16. POV opens the real EXIT door and reality tears open in a glitching bright rip — you noclip back out into the ordinary real world: normal daylight walls, the buzzing fluorescent hum gone, quiet calm. Throughout: the glitch-rip shimmers and settles, soft daylight spills in, the POV steadies and rests — you made it out, alone, relieved. The world keeps gently moving, no freeze.\n",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "scene-s14-l3-fork-exits",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted low-poly, UNIFORM low fidelity, NOT cinematic. In the dead mall, two doors ahead, each with an identical glowing green 'EXIT' sign above it — impossible to tell which is real. IMPORTANT: blocky low-poly first-person POV HANDS in yellow hazmat gloves reaching out in the foreground. 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-s15-end",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted low-poly, UNIFORM low fidelity, NOT cinematic. You push through the correct door and reality tears open into the bright daylight of the real world — escaped, alone. IMPORTANT: a blocky low-poly first-person POV HAND in a yellow hazmat glove pushing the door open in the foreground. 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      }
    ],
    "recipes": [
      {
        "kind": "bake",
        "name": "ffmpeg-xfade-master"
      },
      {
        "kind": "overlay",
        "name": "vhs-pause-freeze"
      },
      {
        "kind": "overlay",
        "name": "smpte-countdown-disc"
      },
      {
        "kind": "ffmpeg",
        "name": "old-radio-ps1-vo"
      },
      {
        "kind": "overlay",
        "name": "chroma-split"
      },
      {
        "kind": "encode",
        "name": "film-grain"
      },
      {
        "kind": "overlay",
        "name": "burned-captions"
      },
      {
        "kind": "overlay",
        "name": "voxel-dither"
      },
      {
        "kind": "ffmpeg",
        "name": "boomerang-motion-fill"
      }
    ],
    "scenario": {
      "scenes": [
        {
          "id": "hub-vid",
          "durationSec": 4
        },
        {
          "id": "scene-s02-fork-doors-vid",
          "durationSec": 4
        },
        {
          "id": "scene-s03-death-red-vid",
          "durationSec": 4
        },
        {
          "id": "scene-s04-blue-rust-lost-vid",
          "durationSec": 4
        },
        {
          "id": "scene-s05-pool-fork-vid",
          "durationSec": 4
        },
        {
          "id": "scene-s06-death-pool-vid",
          "durationSec": 4
        },
        {
          "id": "scene-s07-pool-doc-lost-vid",
          "durationSec": 4
        },
        {
          "id": "scene-s08-pipe-fork-vid",
          "durationSec": 4
        },
        {
          "id": "scene-s09-death-redpipe-vid",
          "durationSec": 4
        },
        {
          "id": "scene-s09-redpipe-enter-vid",
          "durationSec": 4
        },
        {
          "id": "scene-s10-bluepipe-vex-lost-vid",
          "durationSec": 4
        },
        {
          "id": "scene-s11-mall-vid",
          "durationSec": 4
        },
        {
          "id": "scene-s12-exit-fork-vid",
          "durationSec": 4
        },
        {
          "id": "scene-s13-death-wrongexit-vid",
          "durationSec": 4
        },
        {
          "id": "scene-s14-end-vid",
          "durationSec": 6
        },
        {
          "id": "scene-s02-fork-doors"
        },
        {
          "id": "scene-s03-death-red"
        },
        {
          "id": "scene-s04-blue-rust-lost"
        },
        {
          "id": "scene-s05-pool-fork"
        },
        {
          "id": "scene-s06-death-pool"
        },
        {
          "id": "scene-s07-pool-doc-lost"
        },
        {
          "id": "scene-s08-pipe-fork"
        },
        {
          "id": "scene-s09-death-redpipe"
        },
        {
          "id": "scene-s10-bluepipe-vex-lost"
        },
        {
          "id": "scene-s11-mall"
        },
        {
          "id": "scene-s12-exit-fork"
        },
        {
          "id": "scene-s13-death-wrongexit"
        },
        {
          "id": "scene-s14-end"
        },
        {
          "id": "scene-s02-l0-fork"
        },
        {
          "id": "scene-s03-death-rust"
        },
        {
          "id": "scene-s04-through"
        },
        {
          "id": "scene-s05-poolrooms"
        },
        {
          "id": "scene-s06-l1-fork-slides"
        },
        {
          "id": "scene-s07-death-doc"
        },
        {
          "id": "scene-s08-splash"
        },
        {
          "id": "scene-s09-pipe"
        },
        {
          "id": "scene-s10-l2-fork-pipes"
        },
        {
          "id": "scene-s11-death-vex"
        },
        {
          "id": "scene-s12-down-blue"
        },
        {
          "id": "scene-s13-mall"
        },
        {
          "id": "scene-s14-l3-fork-exits"
        },
        {
          "id": "scene-s15-end"
        }
      ],
      "storyboardMd": "# Choose Your Path — Backrooms Descent (Party of Scientists)\n\n**Project:** choose-backrooms-001 · 9:16 · TikTok · ~70s · EN VO + word-level captions\n**Template:** analog-horror-pick-a-door (branching mechanic) · **Style override:** voxel / PS1 liminal-space / Backrooms render\n**Format origin:** choose-path-001 (validated). Reuses: binary 50/50 forks (play→freeze→SMPTE timer→consequence), voxel/PS1 register, vhs-pause-freeze + ffmpeg-xfade-master + old-radio-ps1-vo recipes, clone voice `NYIQTs8oBhYvzMr6zHTL`.\n**Structural variant:** NOT a two-guide hub. This is a **linear party-descent** through liminal levels with a **dwindling group** (the batch's no-guide exception — see NOTES).\n\n## AESTHETIC LOCK (prepend to EVERY image prompt)\n> Chilla's Art / Fears to Fathom indie PS1-horror style (flat restrained lighting, heavy film grain/VHS, muted desaturated palette, low-res textures, low-poly with realistic proportions; style-ref workspace/references/ftf-chillas-style/; NOT voxel-cube, NOT cinematic, NOT painterly) — **liminal-space / Backrooms** render, PS1 / early-3D affine-warped pixel textures, chunky low-poly geometry, dithered grainy textures, first-person POV with a blocky low-poly hand, the classic **mono-yellow Backrooms rooms** — buzzing migraine fluorescents, damp moist carpet, low ceilings, a single **red line painted along the floor**, oppressive hum. Levels shift as you descend: yellow rooms → **poolrooms** (white tile, dim almond-water pools, water slides) → a **pipe/maintenance level** → an **empty liminal shopping mall**. Heavy vignette, faint pixel/VHS grain, that \"wrong-but-familiar\" liminal dread. NOT photoreal, NOT smooth modern CGI, NOT cartoon-cute. 9:16 vertical.\n\nLock a **hub-master** anchor (yellow room + red floor line + the party) first; pass it as `--ref` on every gen.\n\n## CAST (to lock as char masters)\n- **YOU** — POV, blocky low-poly hand; your own suit is the original **dirty yellow** (matches the ref).\n- **THE SCIENTISTS (×3)** — same hazmat silhouette as the user ref (`refs/hazmat-scientists-ref.png`): biohazard suit, **round gas-mask goggles**, one hauls the **black briefcase**. But each gets a **distinct suit colour** so the audience can track who's who, get attached, and watch for who survives. Colours chosen to read against the yellow rooms **and** to NOT clash with the red/blue pipe fork:\n  **TMNT principle — same base body (use `char-doc` as the form master), differ by suit colour + a signature prop that conveys character:**\n  - **ORANGE suit — \"RUST\":** the impatient, reckless one — signature **crowbar** (pries and charges ahead). **Dies on Level 0.**\n  - **TEAL suit — \"DOC\":** the careful lead — signature **handheld scanner / Geiger-counter** (measures the environment). The clean, deformation-free form master all three are built from. **Dies on Level 1 (the slide).**\n  - **PURPLE suit — \"VEX\":** the paranoid cynic who distrusts every sign — signature **battered metal hard-case handcuffed to his wrist** (never lets go). **Dies on Level 2 (jumps the red pipe).**\n  Party **dwindles 4 → 3 → 2 → 1**: at each fork the named scientist takes the *other* option and dies — that IS the death demo — until you noclip out **alone**. (A colour-coded \"PARTY\" tally can tick down on each death — strong retention trigger.)\n\n## MECHANIC\nOpen COLD on the noclip-in. Each level = ONE binary fork on a 3-2-1 SMPTE countdown. The format shows the fork, then YOU take one option (survive) while a scientist takes the other (dies) — the wrong-outcome death beat doubles as the party attrition.\n**TikTok one-shot watch — not interactive.** Punchy fast cuts, ~2s death beats, whole descent in one pass.\n**Trap-logic — DELIBERATELY UNPREDICTABLE (no learnable system):** the forks are NOT solvable by any consistent tell — each is its own surprise gotcha, deaths land at random for the viewer. The ONE exception is a single planted subversion (the blue pipe) that breaks the viewer's learned \"flashy/pretty = bait\" reflex. There is no global rule; do NOT let the other forks imply one. The nihilism is the point — the party dies following a logic that was never there.\n\n---\n\n## CHOICE FLOW (linear descent, party dwindles)\n\n**NOCLIP IN** — You phase through the floor of reality into Level 0. Four of you: YOU + three hazmat scientists, briefcase in hand. Yellow rooms, the red line, the hum.\n\n**LEVEL 0 · YELLOW ROOMS** — Two identical bland yellow doors ahead. **No tell — pure random.**\n- You step through one → continue.\n- A scientist takes the other → something drags him into the dark. **Outcome: death (−1).** → party **4→3**\n\n**LEVEL 1 · POOLROOMS (waterpark)** — Two big water slides. **From the top they look identical — can't be read.**\n- You ride one → splash safe into the almond-water pools → continue.\n- A scientist rides the other → mid-slide it's lined with jutting rebar / blades, blood. **Outcome: death (−1).** → party **3→2**\n\n**LEVEL 2 · PIPE LEVEL · ⭐ THE PLANTED SUBVERSION** — A red pipe and a blue pipe to jump into. The **blue** one is ringed with glowing signs, symbols, arrows — everything screams \"jump here.\"\n- You jump the **blue** pipe (the \"too obvious / too pretty, must be bait\" one) → it's TRUE, it drops you correctly to the next level → continue. *(breaks the learned \"flashy = trap\" reflex)*\n- The last scientist, genre-cynical (\"the signs are lying\"), jumps the plain **red** pipe → death. **Outcome: death (−1).** → party **2→1**\n\n**LEVEL 3 · EMPTY LIMINAL MALL** — Dead escalators, shuttered stores, fountain dry. Two doors, each with an identical glowing **\"EXIT\"** sign. **Which is real is impossible to tell — random to the very end.**\n- You pick a door → you noclip back into the real world. **Outcome: ★ escaped — alone.** *(your whole team died following a logic that never existed)*\n\n---\n\n## SCENE LIST (production beats — ~16 beats × 2-4s ≈ 70s)\n\n- **S01 · NOCLIP IN / TEAM INTRO** — reality glitches, you fall into Level 0; quick intro of the party of four (orange/crowbar, teal/scanner, purple/case), red line, hum swells. NO doors yet. *(anchor: `assets/images/hub.png`)*\n- **S02 · L0 FORK** — two identical yellow doors, BLUE and RED. Labels `LEFT DOOR` / `RIGHT DOOR`. 3-2-1. *(anchor: `assets/images/l0-fork.png`)*\n- **S03 · DEATH — scientist's door** — **RUST (orange)** opens the other; a shape yanks him into black. Hard cut. (4→3)\n- **S04 · THROUGH (right)** — you and two scientists push on.\n- **S05 · POOLROOMS** — descend into the waterpark level; two slides loom.\n- **S06 · L1 FORK** — the two slides. Labels `LEFT SLIDE` / `RIGHT SLIDE`. 3-2-1.\n- **S07 · DEATH — the rebar slide** — **DOC (teal)** takes the other slide; it's studded with rebar/blades; blood sprays (his scanner clatters down the chute). Hard cut. (3→2)\n- **S08 · SPLASH (right)** — you plunge safe into the almond-water pools, surface, climb out.\n- **S09 · PIPE LEVEL** — a maintenance level; red pipe + blue pipe, blue ringed in glowing signs.\n- **S10 · L2 FORK ⭐** — Labels `RED PIPE` / `BLUE PIPE`. 3-2-1.\n- **S11 · DEATH — red pipe** — **VEX (purple)** distrusts the signs (\"too obvious\"), dives the red pipe → death. Hard cut. (2→1)\n- **S12 · DOWN THE BLUE (right)** — the signs were honest; the blue pipe drops you cleanly to the next level.\n- **S13 · EMPTY MALL** — solo now; dead escalators, two doors, twin glowing `EXIT` signs.\n- **S14 · L3 FORK** — Labels `LEFT EXIT` / `RIGHT EXIT`. 3-2-1. (random)\n- **S15 · GOOD ENDING** — you pick; reality tears open; you noclip out. SURVIVED — alone.\n\n---\n\n## VO (EN, eerie low narrator — retimed at compose)\n- Open: \"You noclip out of reality. Four of you go in. The rooms don't care how clever you are.\"\n- L0/L1: \"There's no trick to it. No tell. Pick wrong and you just… stop.\" (a scientist gone each time)\n- L2 (subversion): \"Everything says jump blue. It's so obvious it has to be a lie. …It isn't. He didn't believe it.\"\n- End: \"You made it out. Alone. They followed the logic. There was never any logic.\" / CTA: \"Blue or red — would you have jumped? Tell me below.\"\n\n## STACK\n- Image anchors: `openai/gpt-5.4-image-2` --size 1080x1920 (9:16), --ref hub-master (+ hazmat-scientist char master from `refs/hazmat-scientists-ref.png`). Fire in parallel (no cap).\n- i2v: `bytedance/seedance-2.0` (stylized → passes privacy filter; noclip-in, corridor walk, slide ride, pipe dive, mall walk). ~4s clips.\n- VO: reuse clone `NYIQTs8oBhYvzMr6zHTL`, old-radio/PS1 filter. Music: oppressive Backrooms fluorescent-hum drone (ElevenLabs Music, no artist names). SFX: fluorescent buzz/hum, wet carpet steps, slide whoosh, water splash, pipe clang, entity shriek, soft countdown beeps.\n- Captions: word-level white-bold bottom-center, fed from VO; snap to Scribe word `startMs`.\n- Compose: HyperFrames, ONE opacity-gated composition; transitions + play-then-freeze baked into the master via ffmpeg (xfade + tpad); SMPTE countdown disc + door/option labels + DEATH flash; overlays clear BEFORE the dissolve. A running \"party: N\" counter could tick down on each death (optional).\n\n## NOTES\n- **No guide; no global rule.** Linear party-descent; forks are deliberately unpredictable. The blue-pipe is the ONLY planted subversion (\"flashy/pretty = real,\" breaking the viewer's learned \"pretty = bait\"). Other forks must read as random — do not imply a system.\n- Party dwindles 4→1; the death beat at each fork IS a companion taking the other option. End solo (the bleak payoff).\n- Levels tour liminal spaces: yellow rooms → poolrooms → pipe level → empty mall. Backrooms entities/levels are public/community lore (no specific IP, no real person) → reference-gate does not fire. Hazmat-scientist look locked from the user-supplied ref.\n- Generate order: hub-master → hazmat-scientist char master → L0 → L1 → L2 → L3 anchors. Gate per checkpoint, wait for \"go\" before paid gen.\n"
    },
    "createdAt": "2026-06-04T03:20:16.714Z",
    "modelStack": [
      {
        "model": "bytedance/seedance-2.0",
        "stage": "i2v",
        "params": {
          "resolution": "720p",
          "aspect_ratio": "9:16",
          "duration_sec": 4
        },
        "costUsd": 8.68
      },
      {
        "model": "openai/gpt-5.4-image-2",
        "stage": "image",
        "params": {
          "size": "1080x1920"
        },
        "costUsd": 8.8
      },
      {
        "model": "bytedance/seedance-2.0",
        "stage": "video",
        "params": {
          "resolution": "720p",
          "aspect_ratio": "9:16"
        }
      },
      {
        "model": "hyperframes-render",
        "stage": "video"
      }
    ],
    "composition": {
      "file": "index.html",
      "html": "<!doctype html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\" />\n<style>\n  @font-face { font-family: 'Pixelify'; src: url('assets/fonts/PixelifySans-VF.ttf') format('truetype'); font-weight: 400 700; font-style: normal; font-display: block; }\n  * { margin: 0; padding: 0; box-sizing: border-box; }\n  html, body { width: 1080px; height: 1920px; background: #000; overflow: hidden; }\n  #root { position: relative; width: 1080px; height: 1920px; background: #000; font-family: 'Pixelify', 'Courier New', monospace; }\n  .vid { position: absolute; inset: 0; width: 1080px; height: 1920px; object-fit: cover; display: block; z-index: 1; }\n  #vhs { position: absolute; inset: 0; z-index: 38; pointer-events: none; opacity: 0; }\n  #vcr { position: absolute; inset: 0; width: 100%; height: 100%; image-rendering: pixelated; opacity: 0.45; }\n  #vhs .scan { position: absolute; inset: 0; background: linear-gradient(rgba(0,0,0,0) 50%, rgba(0,0,0,0.32) 50%), linear-gradient(90deg, rgba(255,0,0,0.05), rgba(0,255,0,0.02), rgba(0,0,255,0.05)); background-size: 100% 3px, 4px 100%; }\n  #vhs .tint { position: absolute; inset: 0; background: rgba(46,44,20,0.12); }\n  #vhs .pause { position: absolute; top: 54px; left: 60px; font-size: 46px; letter-spacing: 5px; color: #f6efc8; text-shadow: 0 0 12px rgba(0,0,0,0.95), 0 3px 8px #000; }\n  #vhs .pause b { letter-spacing: 0; margin-right: 14px; }\n  .grain { position: absolute; inset: 0; z-index: 40; pointer-events: none; background: repeating-linear-gradient(to bottom, rgba(0,0,0,0) 0 2px, rgba(0,0,0,0.20) 2px 3px); mix-blend-mode: multiply; opacity: 0.5; }\n  .vignette { position: absolute; inset: 0; z-index: 41; pointer-events: none; background: radial-gradient(118% 88% at 50% 46%, rgba(0,0,0,0) 50%, rgba(0,0,0,0.62) 100%); }\n  #title { position: absolute; z-index: 30; left: 0; right: 0; top: 150px; text-align: center; font-size: 70px; letter-spacing: 6px; color: #f6efc8; opacity: 0; text-shadow: 0 0 24px rgba(0,0,0,0.95), 0 0 30px rgba(230,210,80,0.4), 0 4px 10px rgba(0,0,0,0.95); }\n  #party { position: absolute; z-index: 32; top: 60px; right: 60px; font-size: 52px; letter-spacing: 3px; color: #f6efc8; opacity: 0; text-shadow: 0 0 14px rgba(0,0,0,0.95), 0 3px 8px #000; }\n  #countdown { position: absolute; z-index: 45; left: 50%; top: 63%; transform: translate(-50%,-50%); width: 360px; height: 360px; opacity: 0; }\n  #countdown svg { position: absolute; inset: 0; width: 100%; height: 100%; }\n  #cd-num { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 230px; color: #f6efc8; text-shadow: 0 0 28px rgba(0,0,0,0.95); line-height: 1; }\n  .cd-ring { fill: none; stroke: rgba(246,239,200,0.30); stroke-width: 7; }\n  .cd-sweep { fill: none; stroke: #f6efc8; stroke-width: 11; transform: rotate(-90deg); transform-origin: 50% 50%; }\n  .cd-cross { stroke: rgba(246,239,200,0.45); stroke-width: 4; }\n  #cd-plate { position: absolute; z-index: 44; left: 50%; top: 63%; transform: translate(-50%,-50%); width: 390px; height: 390px; background: rgba(20,20,12,0.5); opacity: 0; }\n  .fork { position: absolute; z-index: 43; top: 38%; max-width: 470px; font-size: 60px; line-height: 1.05; color: #f6efc8; opacity: 0; text-shadow: 0 0 16px rgba(0,0,0,0.95), 0 3px 8px #000; }\n  #fork-l { left: 56px; text-align: left; }\n  #fork-r { right: 56px; text-align: right; }\n  #death-wash { position: absolute; inset: 0; z-index: 46; pointer-events: none; opacity: 0; background: radial-gradient(120% 90% at 50% 45%, rgba(150,0,0,0.65) 0%, rgba(40,0,0,0.92) 100%); }\n  #death { position: absolute; z-index: 47; left: 0; right: 0; top: 41%; text-align: center; font-size: 210px; letter-spacing: 8px; color: #ff2a2a; opacity: 0; line-height: 0.9; text-shadow: 7px 0 0 rgba(255,0,46,0.55), -7px 0 0 rgba(0,200,255,0.45), 0 0 40px rgba(255,40,40,0.7), 0 6px 16px rgba(0,0,0,0.95); }\n  #flash { position: absolute; inset: 0; z-index: 48; background: #fff; opacity: 0; pointer-events: none; }\n  .cap { position: absolute; z-index: 35; left: 70px; right: 70px; bottom: 300px; text-align: center; font-family: 'Pixelify', monospace; font-size: 58px; line-height: 1.25; letter-spacing: 1px; opacity: 0; text-shadow: 0 4px 22px rgba(0,0,0,0.98), 0 2px 6px rgba(0,0,0,1); white-space: pre-line; color: #fff; }\n  #cta { position: absolute; z-index: 36; left: 60px; right: 60px; top: 38%; text-align: center; font-size: 74px; line-height: 1.16; color: #f6efc8; opacity: 0; text-shadow: 0 0 24px rgba(0,0,0,0.95), 0 0 36px rgba(230,210,80,0.45), 0 4px 10px #000; }\n</style>\n</head>\n<body>\n<div id=\"root\" data-composition-id=\"choose-backrooms-001\" data-width=\"1080\" data-height=\"1920\" data-start=\"0\" data-duration=\"64.00\">\n  <video id=\"master\" class=\"vid clip\" data-start=\"0\" data-duration=\"64.00\" data-media-start=\"0\" data-track-index=\"0\" src=\"assets/master.mp4\" muted playsinline crossorigin=\"anonymous\"></video>\n  <div id=\"vhs\"><canvas id=\"vcr\"></canvas><div class=\"tint\"></div><div class=\"scan\"></div><div class=\"pause\"><b>&#10073;&#10073;</b>PAUSE</div></div>\n  <div id=\"title\">YOU NOCLIP<br>OUT OF REALITY</div>\n  <div id=\"party\">PARTY: 4</div>\n  <div class=\"fork\" id=\"fork-l\"></div>\n  <div class=\"fork\" id=\"fork-r\"></div>\n  <div id=\"cd-plate\"></div>\n  <div id=\"countdown\"><svg viewBox=\"0 0 460 460\"><circle class=\"cd-ring\" cx=\"230\" cy=\"230\" r=\"210\"></circle><circle class=\"cd-sweep\" id=\"cd-sweep\" cx=\"230\" cy=\"230\" r=\"210\"></circle><line class=\"cd-cross\" x1=\"230\" y1=\"6\" x2=\"230\" y2=\"454\"></line><line class=\"cd-cross\" x1=\"6\" y1=\"230\" x2=\"454\" y2=\"230\"></line></svg><div id=\"cd-num\">3</div></div>\n  <div id=\"death-wash\"></div>\n  <div id=\"death\">DEAD</div>\n  <div class=\"cap\" id=\"cap\"></div>\n  <div id=\"cta\">BLUE OR RED?<br>WOULD YOU HAVE<br>JUMPED?</div>\n  <div class=\"grain\"></div>\n  <div class=\"vignette\"></div>\n  <div id=\"flash\"></div>\n\n  <audio id=\"bgm\" class=\"clip\" src=\"assets/music/soundtrack-bed.mp3\" data-start=\"0\" data-duration=\"64.00\" data-media-start=\"0\" data-track-index=\"9\" data-volume=\"0.22\"></audio>\n\n  <audio id=\"vo-open\" class=\"clip\" src=\"assets/voiceover/bn-open.mp3\" data-start=\"0.30\"  data-duration=\"4.28\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-hub2\" class=\"clip\" src=\"assets/voiceover/bn-hub2.mp3\" data-start=\"4.62\" data-duration=\"2.14\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-l0\"   class=\"clip\" src=\"assets/voiceover/bn-l0.mp3\"   data-start=\"6.80\"  data-duration=\"2.77\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-s03\"  class=\"clip\" src=\"assets/voiceover/bn-s03.mp3\"  data-start=\"12.60\" data-duration=\"2.25\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-s04\"  class=\"clip\" src=\"assets/voiceover/bn-s04.mp3\"  data-start=\"16.00\" data-duration=\"1.41\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-l1\"   class=\"clip\" src=\"assets/voiceover/bn-l1.mp3\"   data-start=\"18.20\" data-duration=\"2.77\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-s06\"  class=\"clip\" src=\"assets/voiceover/bn-s06.mp3\"  data-start=\"25.20\" data-duration=\"2.14\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-s07b\" class=\"clip\" src=\"assets/voiceover/bn-s07.mp3\" data-start=\"28.50\" data-duration=\"1.85\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-s08\"  class=\"clip\" src=\"assets/voiceover/bn-s08.mp3\"  data-start=\"32.00\" data-duration=\"3.16\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-s09\"  class=\"clip\" src=\"assets/voiceover/bn-s09.mp3\"  data-start=\"37.85\" data-duration=\"2.53\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-s10\"  class=\"clip\" src=\"assets/voiceover/bn-s10.mp3\"  data-start=\"41.25\" data-duration=\"2.14\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-s11\"  class=\"clip\" src=\"assets/voiceover/bn-s11.mp3\"  data-start=\"44.60\" data-duration=\"2.32\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-l3\"   class=\"clip\" src=\"assets/voiceover/bn-l3.mp3\"   data-start=\"48.00\" data-duration=\"2.43\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-s13\"  class=\"clip\" src=\"assets/voiceover/bn-s13.mp3\"  data-start=\"53.85\" data-duration=\"1.62\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-end\"  class=\"clip\" src=\"assets/voiceover/bn-end.mp3\"  data-start=\"57.10\" data-duration=\"3.32\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-cta\"  class=\"clip\" src=\"assets/voiceover/bn-cta.mp3\"  data-start=\"60.50\" data-duration=\"3.46\" data-track-index=\"10\" data-volume=\"1\"></audio>\n\n  <audio id=\"bp00\" class=\"clip\" src=\"assets/sfx/beep-soft.mp3\"       data-start=\"10.66\" data-duration=\"0.16\" data-track-index=\"11\" data-volume=\"1\"></audio>\n  <audio id=\"bp01\" class=\"clip\" src=\"assets/sfx/beep-soft.mp3\"       data-start=\"11.16\" data-duration=\"0.16\" data-track-index=\"11\" data-volume=\"1\"></audio>\n  <audio id=\"bp02\" class=\"clip\" src=\"assets/sfx/beep-soft-final.mp3\" data-start=\"11.66\" data-duration=\"0.30\" data-track-index=\"11\" data-volume=\"1\"></audio>\n  <audio id=\"bp03\" class=\"clip\" src=\"assets/sfx/beep-soft.mp3\"       data-start=\"23.28\" data-duration=\"0.16\" data-track-index=\"11\" data-volume=\"1\"></audio>\n  <audio id=\"bp04\" class=\"clip\" src=\"assets/sfx/beep-soft.mp3\"       data-start=\"23.78\" data-duration=\"0.16\" data-track-index=\"11\" data-volume=\"1\"></audio>\n  <audio id=\"bp05\" class=\"clip\" src=\"assets/sfx/beep-soft-final.mp3\" data-start=\"24.28\" data-duration=\"0.30\" data-track-index=\"11\" data-volume=\"1\"></audio>\n  <audio id=\"bp06\" class=\"clip\" src=\"assets/sfx/beep-soft.mp3\"       data-start=\"35.91\" data-duration=\"0.16\" data-track-index=\"11\" data-volume=\"1\"></audio>\n  <audio id=\"bp07\" class=\"clip\" src=\"assets/sfx/beep-soft.mp3\"       data-start=\"36.41\" data-duration=\"0.16\" data-track-index=\"11\" data-volume=\"1\"></audio>\n  <audio id=\"bp08\" class=\"clip\" src=\"assets/sfx/beep-soft-final.mp3\" data-start=\"36.91\" data-duration=\"0.30\" data-track-index=\"11\" data-volume=\"1\"></audio>\n  <audio id=\"bp09\" class=\"clip\" src=\"assets/sfx/beep-soft.mp3\"       data-start=\"51.91\" data-duration=\"0.16\" data-track-index=\"11\" data-volume=\"1\"></audio>\n  <audio id=\"bp10\" class=\"clip\" src=\"assets/sfx/beep-soft.mp3\"       data-start=\"52.41\" data-duration=\"0.16\" data-track-index=\"11\" data-volume=\"1\"></audio>\n  <audio id=\"bp11\" class=\"clip\" src=\"assets/sfx/beep-soft-final.mp3\" data-start=\"52.91\" data-duration=\"0.30\" data-track-index=\"11\" data-volume=\"1\"></audio>\n\n  <audio id=\"sx-hum1\" class=\"clip\" src=\"assets/sfx/fluor-hum.mp3\" data-start=\"0.00\"  data-duration=\"10.0\" data-track-index=\"12\" data-volume=\"0.16\"></audio>\n  <audio id=\"sx-hum2\" class=\"clip\" src=\"assets/sfx/fluor-hum.mp3\" data-start=\"28.00\" data-duration=\"10.0\" data-track-index=\"12\" data-volume=\"0.16\"></audio>\n  <audio id=\"sx-mall\" class=\"clip\" src=\"assets/sfx/mall-tone.mp3\" data-start=\"44.00\" data-duration=\"9.0\"  data-track-index=\"12\" data-volume=\"0.18\"></audio>\n\n  <audio id=\"sx-d03\" class=\"clip\" src=\"assets/sfx/death-drag.mp3\"  data-start=\"14.20\" data-duration=\"3.0\" data-track-index=\"13\" data-volume=\"0.6\"></audio>\n  <audio id=\"sx-d06\" class=\"clip\" src=\"assets/sfx/slide-death.mp3\" data-start=\"26.85\" data-duration=\"3.0\" data-track-index=\"13\" data-volume=\"0.6\"></audio>\n  <audio id=\"sx-d09\" class=\"clip\" src=\"assets/sfx/pipe-death.mp3\"  data-start=\"39.45\" data-duration=\"3.0\" data-track-index=\"13\" data-volume=\"0.6\"></audio>\n  <audio id=\"sx-d13\" class=\"clip\" src=\"assets/sfx/void-death.mp3\"  data-start=\"55.45\" data-duration=\"3.0\" data-track-index=\"13\" data-volume=\"0.6\"></audio>\n\n  <audio id=\"sx-noc\" class=\"clip\" src=\"assets/sfx/noclip-in.mp3\"  data-start=\"0.20\"  data-duration=\"4.0\" data-track-index=\"14\" data-volume=\"0.45\"></audio>\n  <audio id=\"sx-spl\" class=\"clip\" src=\"assets/sfx/splash.mp3\"     data-start=\"28.40\" data-duration=\"3.0\" data-track-index=\"14\" data-volume=\"0.4\"></audio>\n  <audio id=\"sx-pip\" class=\"clip\" src=\"assets/sfx/pipe-dive.mp3\"  data-start=\"40.96\" data-duration=\"4.0\" data-track-index=\"14\" data-volume=\"0.4\"></audio>\n  <audio id=\"sx-out\" class=\"clip\" src=\"assets/sfx/noclip-out.mp3\" data-start=\"56.96\" data-duration=\"5.0\" data-track-index=\"14\" data-volume=\"0.45\"></audio>\n\n  <script src=\"https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js\"></script>\n  <script>\n    const tl = gsap.timeline({ paused: true, defaults: { immediateRender: false } });\n    const C = 2 * Math.PI * 210;\n    gsap.set(\"#cd-sweep\", { strokeDasharray: C, strokeDashoffset: 0 });\n    gsap.set([\"#title\",\"#party\",\"#countdown\",\"#cd-plate\",\"#fork-l\",\"#fork-r\",\"#death\",\"#death-wash\",\"#cap\",\"#cta\",\"#vhs\",\"#flash\"], { opacity: 0 });\n    const A   = [0.00,6.50,12.38,15.75,19.12,25.00,28.38,31.75,37.62,41.00,44.38,47.75,53.62,57.00];\n    const SEG = [7.00,6.38,3.88,3.88,6.38,3.88,3.88,6.38,3.88,3.88,3.88,6.38,3.88,7.00];\n    const vcr=document.getElementById(\"vcr\"); vcr.width=270; vcr.height=480; const vctx=vcr.getContext(\"2d\");\n    function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}\n    function drawVHS(t){const r=mulberry32((Math.floor(t*30)|0)+1);const w=vcr.width,h=vcr.height;const img=vctx.createImageData(w,h),d=img.data;for(let i=0;i<d.length;i+=4){const v=(r()*255)|0;d[i]=d[i+1]=d[i+2]=v;d[i+3]=(r()*60)|0;}vctx.putImageData(img,0,0);const band=Math.floor((t*60)%h);vctx.fillStyle=\"rgba(255,255,255,0.55)\";for(let k=0;k<26;k++){const x=(r()*w)|0,y=band+((r()*46)|0)-23;vctx.fillRect(x,y,(r()*7)|0,2);}}\n    function vhs(s,dur){tl.set(\"#vhs\",{opacity:1},s);const pf={v:s};tl.to(pf,{v:s+dur,duration:dur,ease:\"none\",onUpdate:()=>drawVHS(pf.v),overwrite:\"auto\"},s);let t=s,k=0;while(t<s+dur){tl.set(\"#vhs\",{y:(k%2?1:-1)},t);t+=0.1;k++;}tl.set(\"#vhs\",{y:0},s+dur);tl.to(\"#vhs\",{opacity:0,duration:0.12,overwrite:\"auto\"},s+dur);}\n    function cap(text,tin,tout){tl.set(\"#cap\",{textContent:text},tin-0.01);tl.fromTo(\"#cap\",{opacity:0,y:26},{opacity:1,y:0,duration:0.32,ease:\"power3.out\",overwrite:\"auto\"},tin);tl.to(\"#cap\",{opacity:0,duration:0.28,overwrite:\"auto\"},tout);tl.set(\"#cap\",{opacity:0},tout+0.29);}\n    function disc(s,step){step=step||0.5;tl.fromTo(\"#cd-plate\",{opacity:0},{opacity:1,duration:0.16,overwrite:\"auto\"},s-0.1);tl.fromTo(\"#countdown\",{opacity:0},{opacity:1,duration:0.16,overwrite:\"auto\"},s-0.1);for(let i=0;i<3;i++){const t=s+i*step;tl.set(\"#cd-num\",{textContent:3-i},t);tl.fromTo(\"#cd-sweep\",{strokeDashoffset:0},{strokeDashoffset:C,duration:step,ease:\"none\"},t);tl.fromTo(\"#cd-num\",{scale:1.2,opacity:0.4},{scale:1,opacity:1,duration:step*0.45,ease:\"back.out(2)\"},t);}tl.to([\"#countdown\",\"#cd-plate\"],{opacity:0,duration:0.2,ease:\"power2.in\",overwrite:\"auto\"},s+3*step-0.04);}\n    function deathBeat(i){const s=A[i],dur=SEG[i],dt=s+dur-1.7;tl.set(\"#flash\",{opacity:0.85},dt);tl.to(\"#flash\",{opacity:0,duration:0.22,ease:\"power2.in\",overwrite:\"auto\"},dt+0.03);tl.set(\"#flash\",{opacity:0},dt+0.3);tl.fromTo(\"#death-wash\",{opacity:0.9},{opacity:0,duration:0.6,ease:\"power2.in\",overwrite:\"auto\"},dt);tl.fromTo(\"#death\",{scale:1.7,opacity:0},{scale:1,opacity:1,duration:0.3,ease:\"back.out(2.2)\",overwrite:\"auto\"},dt);tl.to(\"#death\",{x:\"+=16\",duration:0.045,repeat:6,yoyo:true},dt+0.3);tl.set(\"#death\",{x:0},dt+0.7);tl.to(\"#death\",{opacity:0,duration:0.3,overwrite:\"auto\"},s+dur-0.05);tl.set(\"#death\",{opacity:0},s+dur);}\n    function freezeFork(i,l,r){const fs=A[i]+3.9,cd=A[i]+4.2,clear=cd+1.5+0.05;vhs(fs,clear-fs);tl.set(\"#fork-l\",{textContent:l},fs);tl.set(\"#fork-r\",{textContent:r},fs);tl.fromTo(\"#fork-l\",{opacity:0,x:-44},{opacity:1,x:0,duration:0.28,ease:\"power3.out\",overwrite:\"auto\"},fs+0.05);tl.fromTo(\"#fork-r\",{opacity:0,x:44},{opacity:1,x:0,duration:0.28,ease:\"power3.out\",overwrite:\"auto\"},fs+0.05);tl.to([\"#fork-l\",\"#fork-r\"],{opacity:0,duration:0.22,overwrite:\"auto\"},clear-0.05);tl.set([\"#fork-l\",\"#fork-r\"],{opacity:0},clear+0.2);disc(cd,0.5);}\n    function party(n,t){tl.set(\"#party\",{textContent:\"PARTY: \"+n},t);tl.fromTo(\"#party\",{opacity:0,scale:1.4},{opacity:1,scale:1,duration:0.3,ease:\"back.out(2)\",overwrite:\"auto\"},t);}\n\n    // intro\n    tl.fromTo(\"#title\",{opacity:0,y:-22},{opacity:1,y:0,duration:0.4,ease:\"power3.out\"},0.4);\n    tl.to(\"#title\",{opacity:0.35,duration:0.05,repeat:3,yoyo:true,ease:\"none\"},0.9);\n    tl.to(\"#title\",{opacity:0,duration:0.3},3.4); tl.set(\"#title\",{opacity:0},3.75);\n    party(4,0.7); tl.to(\"#party\",{opacity:1,duration:6},1.0);\n\n    // forks + deaths\n    freezeFork(1,\"LEFT DOOR\",\"RIGHT DOOR\"); deathBeat(2); party(3,14.55);\n    freezeFork(4,\"LEFT SLIDE\",\"RIGHT SLIDE\"); deathBeat(5); party(2,27.18);\n    freezeFork(7,\"RED PIPE\",\"BLUE PIPE\"); deathBeat(8); party(1,39.80);\n    freezeFork(11,\"LEFT EXIT\",\"RIGHT EXIT\"); deathBeat(12);\n    tl.to(\"#party\",{opacity:0,duration:0.4},56.5);\n\n    // captions (white narrator)\n    cap(\"Four go in. The rooms don't care\\nhow clever you are.\", 0.42, 4.55);\n    cap(\"Get to the exit. Don't die in the walls.\", 4.74, 6.74);\n    cap(\"No tell. No trick. Pick wrong\\nand you just stop.\", 6.92, 9.55);\n    cap(\"The dark took the first one.\", 12.72, 14.83);\n    cap(\"Three left. Keep moving.\", 16.12, 17.40);\n    cap(\"Two slides. Identical. Guess.\", 18.40, 21.10);\n    cap(\"One was lined with rebar.\", 25.32, 27.32);\n    cap(\"You came up. Two of you left.\", 28.62, 30.30);\n    cap(\"Everything says jump blue.\\nSo obvious it must be a lie.\", 32.12, 35.14);\n    cap(\"He didn't believe the signs.\\nThe signs were honest.\", 37.97, 40.36);\n    cap(\"Blue was true. Now you're alone.\", 41.37, 43.37);\n    cap(\"An empty mall, built for no one.\", 44.72, 46.90);\n    cap(\"Two exits. One real. No way to know.\", 48.12, 50.41);\n    cap(\"Wrong one. The void was patient.\", 53.97, 55.45);\n    cap(\"You made it out. Alone.\", 57.22, 59.40);\n\n    // end CTA over the noclip-out motion\n    tl.fromTo(\"#cta\",{opacity:0,scale:0.9},{opacity:1,scale:1,duration:0.5,ease:\"back.out(1.8)\"},60.6);\n    tl.to({},{duration:0.01},63.94);\n    window.__timelines = window.__timelines || {};\n    window.__timelines[\"choose-backrooms-001\"] = tl;\n  </script>\n</div>\n</body>\n</html>\n",
      "timing": {
        "A": [
          0,
          6.5,
          12.38,
          15.75,
          19.12,
          25,
          28.38,
          31.75,
          37.62,
          41,
          44.38,
          47.75,
          53.62,
          57
        ],
        "SEG": [
          7,
          6.38,
          3.88,
          3.88,
          6.38,
          3.88,
          3.88,
          6.38,
          3.88,
          3.88,
          3.88,
          6.38,
          3.88,
          7
        ]
      },
      "components": [
        "cap",
        "cd-cross",
        "cd-ring",
        "cd-sweep",
        "choose-backrooms-001",
        "clip",
        "deathBeat",
        "disc",
        "drawVHS",
        "fork",
        "freezeFork",
        "grain",
        "mulberry32",
        "party",
        "pause",
        "scan",
        "tint",
        "vhs",
        "vid",
        "vignette"
      ],
      "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-backrooms/index.html"
    },
    "costRollupUsd": 17.48,
    "schemaVersion": 1
  },
  {
    "assets": [
      {
        "kind": "location",
        "path": "assets/hub.png",
        "slot": "hub",
        "bytes": 2146006,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-magicschool/assets/hub.png"
      },
      {
        "kind": "location",
        "path": "assets/hub-vid.mp4",
        "slot": "hub-vid",
        "bytes": 1914966,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-magicschool/assets/hub-vid.mp4"
      },
      {
        "kind": "ref",
        "path": "assets/s02-stair-fork.png",
        "slot": "s02-stair-fork",
        "bytes": 899054,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-magicschool/assets/s02-stair-fork.png"
      },
      {
        "kind": "ref",
        "path": "assets/s02-stair-fork-vid.mp4",
        "slot": "s02-stair-fork-vid",
        "bytes": 1737926,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-magicschool/assets/s02-stair-fork-vid.mp4"
      },
      {
        "kind": "ref",
        "path": "assets/s03-death-stair.png",
        "slot": "s03-death-stair",
        "bytes": 938125,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-magicschool/assets/s03-death-stair.png"
      },
      {
        "kind": "ref",
        "path": "assets/s03-death-stair-vid.mp4",
        "slot": "s03-death-stair-vid",
        "bytes": 4179568,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-magicschool/assets/s03-death-stair-vid.mp4"
      },
      {
        "kind": "ref",
        "path": "assets/s04-stair-cross.png",
        "slot": "s04-stair-cross",
        "bytes": 945033,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-magicschool/assets/s04-stair-cross.png"
      },
      {
        "kind": "ref",
        "path": "assets/s04-stair-cross-vid.mp4",
        "slot": "s04-stair-cross-vid",
        "bytes": 3247619,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-magicschool/assets/s04-stair-cross-vid.mp4"
      },
      {
        "kind": "ref",
        "path": "assets/s05-armor-fork.png",
        "slot": "s05-armor-fork",
        "bytes": 1857468,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-magicschool/assets/s05-armor-fork.png"
      },
      {
        "kind": "ref",
        "path": "assets/s05-armor-fork-vid.mp4",
        "slot": "s05-armor-fork-vid",
        "bytes": 1429481,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-magicschool/assets/s05-armor-fork-vid.mp4"
      },
      {
        "kind": "ref",
        "path": "assets/s06-death-armor.png",
        "slot": "s06-death-armor",
        "bytes": 935540,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-magicschool/assets/s06-death-armor.png"
      },
      {
        "kind": "ref",
        "path": "assets/s06-death-armor-vid.mp4",
        "slot": "s06-death-armor-vid",
        "bytes": 3096505,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-magicschool/assets/s06-death-armor-vid.mp4"
      },
      {
        "kind": "ref",
        "path": "assets/s07-armor-past.png",
        "slot": "s07-armor-past",
        "bytes": 921255,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-magicschool/assets/s07-armor-past.png"
      },
      {
        "kind": "ref",
        "path": "assets/s07-armor-past-vid.mp4",
        "slot": "s07-armor-past-vid",
        "bytes": 2733187,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-magicschool/assets/s07-armor-past-vid.mp4"
      },
      {
        "kind": "ref",
        "path": "assets/s08-portal-fork.png",
        "slot": "s08-portal-fork",
        "bytes": 1921630,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-magicschool/assets/s08-portal-fork.png"
      },
      {
        "kind": "ref",
        "path": "assets/s08-portal-fork-vid.mp4",
        "slot": "s08-portal-fork-vid",
        "bytes": 2123406,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-magicschool/assets/s08-portal-fork-vid.mp4"
      },
      {
        "kind": "ref",
        "path": "assets/s09-death-portal.png",
        "slot": "s09-death-portal",
        "bytes": 999651,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-magicschool/assets/s09-death-portal.png"
      },
      {
        "kind": "ref",
        "path": "assets/s09-death-portal-vid.mp4",
        "slot": "s09-death-portal-vid",
        "bytes": 4052051,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-magicschool/assets/s09-death-portal-vid.mp4"
      },
      {
        "kind": "ref",
        "path": "assets/s10-portal-through.png",
        "slot": "s10-portal-through",
        "bytes": 2141979,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-magicschool/assets/s10-portal-through.png"
      },
      {
        "kind": "ref",
        "path": "assets/s10-portal-through-vid.mp4",
        "slot": "s10-portal-through-vid",
        "bytes": 2930860,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-magicschool/assets/s10-portal-through-vid.mp4"
      },
      {
        "kind": "ref",
        "path": "assets/s11-peeves-fork.png",
        "slot": "s11-peeves-fork",
        "bytes": 2152005,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-magicschool/assets/s11-peeves-fork.png"
      },
      {
        "kind": "ref",
        "path": "assets/s11-peeves-fork-vid.mp4",
        "slot": "s11-peeves-fork-vid",
        "bytes": 1958852,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-magicschool/assets/s11-peeves-fork-vid.mp4"
      },
      {
        "kind": "ref",
        "path": "assets/s12-death-peeves.png",
        "slot": "s12-death-peeves",
        "bytes": 935057,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-magicschool/assets/s12-death-peeves.png"
      },
      {
        "kind": "ref",
        "path": "assets/s12-death-peeves-vid.mp4",
        "slot": "s12-death-peeves-vid",
        "bytes": 3308521,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-magicschool/assets/s12-death-peeves-vid.mp4"
      },
      {
        "kind": "ref",
        "path": "assets/s13-peeves-past.png",
        "slot": "s13-peeves-past",
        "bytes": 1862211,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-magicschool/assets/s13-peeves-past.png"
      },
      {
        "kind": "ref",
        "path": "assets/s13-peeves-past-vid.mp4",
        "slot": "s13-peeves-past-vid",
        "bytes": 3687066,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-magicschool/assets/s13-peeves-past-vid.mp4"
      },
      {
        "kind": "ref",
        "path": "assets/s14-class-fork.png",
        "slot": "s14-class-fork",
        "bytes": 906472,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-magicschool/assets/s14-class-fork.png"
      },
      {
        "kind": "ref",
        "path": "assets/s14-class-fork-vid.mp4",
        "slot": "s14-class-fork-vid",
        "bytes": 1699695,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-magicschool/assets/s14-class-fork-vid.mp4"
      },
      {
        "kind": "ref",
        "path": "assets/s15-death-wrongdoor.png",
        "slot": "s15-death-wrongdoor",
        "bytes": 915189,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-magicschool/assets/s15-death-wrongdoor.png"
      },
      {
        "kind": "ref",
        "path": "assets/s15-death-wrongdoor-vid.mp4",
        "slot": "s15-death-wrongdoor-vid",
        "bytes": 3185274,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-magicschool/assets/s15-death-wrongdoor-vid.mp4"
      },
      {
        "kind": "ref",
        "path": "assets/s16-class-end.png",
        "slot": "s16-class-end",
        "bytes": 1877671,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-magicschool/assets/s16-class-end.png"
      },
      {
        "kind": "ref",
        "path": "assets/s16-class-end-vid.mp4",
        "slot": "s16-class-end-vid",
        "bytes": 3705171,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-magicschool/assets/s16-class-end-vid.mp4"
      }
    ],
    "unitId": "choose-magicschool",
    "prompts": [
      {
        "slot": "hub",
        "text": "PS1/PS2-era first-person magic-school adventure game screenshot, first-person POV with a glowing wand in a blocky low-poly hand and a billowing dark robe sleeve, heavy film grain + faint VHS scanlines, low-poly realistic proportions, NOT cartoon-cute, NOT modern CGI, NOT photoreal; a COLORFUL vibrant glowing MAGICAL Hogwarts-like stone castle, rich saturated jewel tones. SCENE: the grand enchanted entrance hall — towering moving stone staircases ahead, hundreds of floating candles, huge jewel-tone stained-glass windows, glowing runes on the walls, sparkling golden magic motes in the air, warm torchlight, hanging house banners. Awe with a hint of danger. 9:16 vertical.\n",
        "model": "google/gemini-3-pro-image-preview",
        "stage": "image"
      },
      {
        "slot": "hub-vid",
        "text": "PS1 magic-school adventure game footage, first-person POV with a glowing wand and robe sleeve, heavy grain/VHS, low-poly, colorful glowing magical castle hall, 9:16. A held establishing moment — POV in the grand enchanted entrance hall, moving staircases ahead; floating candles drift and flicker, golden magic motes sparkle and swirl, stained glass glows, house banners sway gently, the wand glints. The world is alive and magical, camera holds with a slight POV sway. Soft magical chimes.\n",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "i2v/hub-vid",
        "text": "PS1 magic-school adventure game footage, first-person POV with a glowing wand and robe sleeve, heavy grain/VHS, low-poly, colorful glowing magical castle hall, 9:16. A held establishing moment — POV in the grand enchanted entrance hall, moving staircases ahead; floating candles drift and flicker, golden magic motes sparkle and swirl, stained glass glows, house banners sway gently, the wand glints. The world is alive and magical, camera holds with a slight POV sway. Soft magical chimes.\n",
        "stage": "i2v"
      },
      {
        "slot": "i2v/s02-stair-fork-vid",
        "text": "PS1 magic-school game footage, first-person POV with wand, heavy grain/VHS, low-poly, colorful magical castle, 9:16. A held choice-moment, idle, nobody commits. POV faces two enchanted moving staircases diverging — left toward a warm golden archway, right drifting out over a glowing magical abyss. LOCKED framing. The staircases slowly shift and grind, candles flicker, motes drift, magic shimmers — world alive, choice unmade.\n",
        "stage": "i2v"
      },
      {
        "slot": "i2v/s03-death-stair-vid",
        "text": "PS1 magic-school game footage, first-person POV, heavy grain/VHS, low-poly, colorful magical castle, 9:16. A death scene — instant. 0-1s: the staircase under the POV lurches. 1-3s: it swings away and crumbles, tipping you off the edge — you plunge into the vast glowing magical abyss, candles and stone receding far above, swirling colored light below. 3-4s: the depths swallow the view to black. Stone grinding, a cry, rushing wind.\n",
        "stage": "i2v"
      },
      {
        "slot": "i2v/s04-stair-cross-vid",
        "text": "PS1 magic-school game footage, first-person POV with wand and robe sleeve, heavy grain/VHS, low-poly, colorful magical castle, 9:16. POV strides forward across the moving staircase onto the warm lit landing before the glowing golden archway; candles flicker, motes sparkle, banners sway — relief and wonder, forward motion.\n",
        "stage": "i2v"
      },
      {
        "slot": "i2v/s05-armor-fork-vid",
        "text": "PS1 magic-school game footage, first-person POV with wand, heavy grain/VHS, low-poly, colorful magical castle, 9:16. A held choice-moment, idle, nobody commits. POV in a torchlit corridor splitting two ways, each flanked by a towering living suit of knight armor; the right-hand armor slowly raises its halberd. LOCKED framing. Torches flicker, runes glow, the armor creaks and shifts in place — world alive, choice unmade.\n",
        "stage": "i2v"
      },
      {
        "slot": "i2v/s06-death-armor-vid",
        "text": "PS1 magic-school game footage, first-person POV, heavy grain/VHS, low-poly, colorful magical castle, 9:16. A death scene — instant. 0-1s: POV steps toward the armor. 1-3s: the living knight armor swings its huge halberd down hard, the blade sweeping through the frame in a blur, sparks flying, the corridor lurching violently. 3-4s: the blade fills the lens to black. Metal shriek, whoosh, heavy clang.\n",
        "stage": "i2v"
      },
      {
        "slot": "i2v/s07-armor-past-vid",
        "text": "PS1 magic-school game footage, first-person POV with wand and robe sleeve, heavy grain/VHS, low-poly, colorful magical castle, 9:16. POV slips past the still suit of armor through the safe archway into a glowing candlelit corridor, magic motes sparkling, stained glass — forward, relief.\n",
        "stage": "i2v"
      },
      {
        "slot": "i2v/s08-portal-fork-vid",
        "text": "PS1 magic-school game footage, first-person POV with wand, heavy grain/VHS, low-poly, colorful magical castle, 9:16. A held choice-moment, idle, nobody commits. POV faces two swirling magical teleport portals — a glowing blue vortex and a glowing gold vortex — crackling with arcane sparks and runes. LOCKED framing. The portals swirl and pulse, sparks crackle, runes glow — world alive, choice unmade.\n",
        "stage": "i2v"
      },
      {
        "slot": "i2v/s09-death-portal-vid",
        "text": "PS1 magic-school game footage, first-person POV, heavy grain/VHS, low-poly, colorful magical castle, 9:16. A death scene — instant. 0-1s: the POV is sucked into the wrong portal. 1-3s: it misfires — the view shatters into scattering glowing magical shards and streaking colored light, the body splintering apart into fragments. 3-4s: the shards scatter away to black. Arcane crackle, shatter, whoosh.\n",
        "stage": "i2v"
      },
      {
        "slot": "i2v/s10-portal-through-vid",
        "text": "PS1 magic-school game footage, first-person POV with wand and robe sleeve, heavy grain/VHS, low-poly, colorful magical castle, 9:16. POV rematerializes out of the correct portal in a swirl of soft light into a bright grand enchanted hall, candles drifting, motes sparkling, intact and safe — wonder, forward.\n",
        "stage": "i2v"
      },
      {
        "slot": "i2v/s11-peeves-fork-vid",
        "text": "PS1 magic-school game footage, first-person POV with wand, heavy grain/VHS, low-poly, colorful magical castle, 9:16. A held choice-moment, idle, nobody commits. POV in a candlelit corridor under a huge crystal chandelier; a grinning poltergeist imp hovers and cackles near it; a solid stone path on one side, a shimmering suspicious trick-floor on the other. LOCKED framing. Candles flicker, the poltergeist bobs and cackles, the chandelier sways, motes drift — world alive, choice unmade.\n",
        "stage": "i2v"
      },
      {
        "slot": "i2v/s12-death-peeves-vid",
        "text": "PS1 magic-school game footage, first-person POV, heavy grain/VHS, low-poly, colorful magical castle, 9:16. A death scene — instant. 0-1s: the poltergeist cackles and cuts the rope. 1-3s: the enormous crystal chandelier plunges straight down at the POV, crystal and candlelight exploding through the frame as the floor vanishes — falling. 3-4s: crash to black. Snap, shatter, crash.\n",
        "stage": "i2v"
      },
      {
        "slot": "i2v/s13-peeves-past-vid",
        "text": "PS1 magic-school game footage, first-person POV with wand and robe sleeve, heavy grain/VHS, low-poly, colorful magical castle, 9:16. POV darts forward along the solid stone path under the floating candles, the cackling poltergeist left behind above; a glowing classroom door ahead, motes sparkling — forward, relief.\n",
        "stage": "i2v"
      },
      {
        "slot": "i2v/s14-class-fork-vid",
        "text": "PS1 magic-school game footage, first-person POV with wand, heavy grain/VHS, low-poly, colorful magical castle, 9:16. A held choice-moment, idle, nobody commits. POV at the end of the hall facing two ornate classroom doors — the left glowing warm and inviting, the right dark and ominous with a faint growl behind it. LOCKED framing. Golden light spills under the left door, the right door trembles faintly, candles flicker, runes glow — world alive, choice unmade.\n",
        "stage": "i2v"
      },
      {
        "slot": "i2v/s15-death-wrongdoor-vid",
        "text": "PS1 magic-school game footage, first-person POV, heavy grain/VHS, low-poly, colorful magical castle, 9:16. A death scene — instant. 0-1s: the wrong classroom door creaks open. 1-3s: a huge hulking magical troll-beast lunges out roaring, its massive fist swinging into the frame, torchlight and shadow. 3-4s: the fist fills the lens to black. Roar, whoosh, impact.\n",
        "stage": "i2v"
      },
      {
        "slot": "i2v/s16-class-end-vid",
        "text": "PS1 magic-school game footage turning calm and triumphant, first-person POV with wand and robe sleeve, heavy grain/VHS, low-poly, colorful magical castle, 9:16. POV pushes open the correct classroom door into a warm bright enchanted classroom — rows of wooden desks, floating candles, a glowing-rune chalkboard, big stained-glass windows, students settling in, golden afternoon light. Throughout: candles drift, magic motes sparkle, students shift gently, the POV steps in and settles — made it to class, safe, triumphant calm. The world keeps gently moving, no freeze.\n",
        "stage": "i2v"
      },
      {
        "slot": "img/hub",
        "text": "PS1/PS2-era first-person magic-school adventure game screenshot, first-person POV with a glowing wand in a blocky low-poly hand and a billowing dark robe sleeve, heavy film grain + faint VHS scanlines, low-poly realistic proportions, NOT cartoon-cute, NOT modern CGI, NOT photoreal; a COLORFUL vibrant glowing MAGICAL Hogwarts-like stone castle, rich saturated jewel tones. SCENE: the grand enchanted entrance hall — towering moving stone staircases ahead, hundreds of floating candles, huge jewel-tone stained-glass windows, glowing runes on the walls, sparkling golden magic motes in the air, warm torchlight, hanging house banners. Awe with a hint of danger. 9:16 vertical.\n",
        "stage": "image"
      },
      {
        "slot": "img/s02-stair-fork",
        "text": "PS1/PS2-era first-person magic-school game screenshot, first-person POV with a glowing wand and robe sleeve, heavy grain/VHS, low-poly, colorful glowing magical castle, 9:16. SCENE: a fork of two enchanted moving stone staircases diverging — the LEFT staircase swings toward a warm lit golden archway, the RIGHT staircase drifts out over a deep glowing magical abyss far below; floating candles, sparkling motes, stained glass. Two glowing paths.\n",
        "stage": "image"
      },
      {
        "slot": "img/s03-death-stair",
        "text": "PS1/PS2-era first-person magic-school game screenshot, first-person POV, heavy grain/VHS, low-poly, colorful magical castle, 9:16. SCENE: the moving staircase under the POV suddenly swings away and crumbles, tipping you off the edge — you are falling into a vast deep glowing magical abyss, candles and stone receding far above, swirling colored light below. Vertigo, peril.\n",
        "stage": "image"
      },
      {
        "slot": "img/s04-stair-cross",
        "text": "PS1/PS2-era first-person magic-school game screenshot, first-person POV with wand and robe sleeve, heavy grain/VHS, low-poly, colorful magical castle, 9:16. SCENE: the POV safely crosses the moving staircase and steps onto a warm lit landing before a glowing golden archway, floating candles, stained glass, sparkling motes, relief and wonder.\n",
        "stage": "image"
      },
      {
        "slot": "img/s05-armor-fork",
        "text": "PS1/PS2-era first-person magic-school game screenshot, first-person POV with wand, heavy grain/VHS, low-poly, colorful magical castle, 9:16. SCENE: a torchlit stone corridor splitting into two archways, each flanked by a towering animated suit of living knight armor holding a halberd; the LEFT armor stands still, the RIGHT armor is already raising its blade. Glowing runes, banners, eerie magical menace.\n",
        "stage": "image"
      },
      {
        "slot": "img/s06-death-armor",
        "text": "PS1/PS2-era first-person magic-school game screenshot, first-person POV, heavy grain/VHS, low-poly, colorful magical castle, 9:16. SCENE: a massive animated suit of living knight armor swings its huge halberd straight down at the POV, the blade filling the frame in a blur of motion, sparks and torchlight, the corridor lurching. Sudden lethal impact.\n",
        "stage": "image"
      },
      {
        "slot": "img/s07-armor-past",
        "text": "PS1/PS2-era first-person magic-school game screenshot, first-person POV with wand and robe sleeve, heavy grain/VHS, low-poly, colorful magical castle, 9:16. SCENE: the POV slips past the still suit of armor through the safe archway into a glowing enchanted corridor of floating candles and stained glass, sparkling motes, forward, relief.\n",
        "stage": "image"
      },
      {
        "slot": "img/s08-portal-fork",
        "text": "PS1/PS2-era first-person magic-school game screenshot, first-person POV with wand, heavy grain/VHS, low-poly, colorful magical castle, 9:16. SCENE: a dim enchanted chamber with two swirling magical teleport portals side by side — a glowing BLUE vortex on the left and a glowing GOLD vortex on the right, crackling with arcane sparks and runes, sucking in light. Two doorways of magic.\n",
        "stage": "image"
      },
      {
        "slot": "img/s09-death-portal",
        "text": "PS1/PS2-era first-person magic-school game screenshot, first-person POV, heavy grain/VHS, low-poly, colorful magical castle, 9:16. SCENE: the POV is pulled into the wrong teleport portal and it misfires — the view shatters into scattering magical shards and streaking colored light, the body splintering apart into glowing fragments, a violent arcane disintegration. Peril.\n",
        "stage": "image"
      },
      {
        "slot": "img/s10-portal-through",
        "text": "PS1/PS2-era first-person magic-school game screenshot, first-person POV with wand and robe sleeve, heavy grain/VHS, low-poly, colorful magical castle, 9:16. SCENE: the POV rematerializes out of the correct portal in a swirl of soft light into a bright grand enchanted hall, floating candles, stained glass, sparkling motes, intact and safe, wonder.\n",
        "stage": "image"
      },
      {
        "slot": "img/s11-peeves-fork",
        "text": "PS1/PS2-era first-person magic-school game screenshot, first-person POV with wand, heavy grain/VHS, low-poly, colorful magical castle, 9:16. SCENE: a long corridor of floating candles and a huge crystal chandelier overhead, a mischievous cackling poltergeist (Peeves-like, a small grinning glowing imp) hovering near the chandelier; the floor splits into a solid stone path on one side and a suspicious shimmering trick-floor on the other. Glowing, playful menace.\n",
        "stage": "image"
      },
      {
        "slot": "img/s12-death-peeves",
        "text": "PS1/PS2-era first-person magic-school game screenshot, first-person POV, heavy grain/VHS, low-poly, colorful magical castle, 9:16. SCENE: the grinning poltergeist cuts the rope and the enormous crystal chandelier plunges straight down toward the POV, shattering candlelight and crystal filling the frame, the floor vanishing — falling. Sudden peril.\n",
        "stage": "image"
      },
      {
        "slot": "img/s13-peeves-past",
        "text": "PS1/PS2-era first-person magic-school game screenshot, first-person POV with wand and robe sleeve, heavy grain/VHS, low-poly, colorful magical castle, 9:16. SCENE: the POV darts along the solid stone path under the floating candles, the cackling poltergeist left behind above, sparkling motes, a glowing classroom door visible ahead, forward, relief.\n",
        "stage": "image"
      },
      {
        "slot": "img/s14-class-fork",
        "text": "PS1/PS2-era first-person magic-school game screenshot, first-person POV with wand, heavy grain/VHS, low-poly, colorful magical castle, 9:16. SCENE: the end of the hall — two ornate arched classroom doors side by side, the LEFT door glowing warm and inviting with golden light spilling under it, the RIGHT door dark and ominous with a faint growl behind it; floating candles, banners, glowing runes. The final choice.\n",
        "stage": "image"
      },
      {
        "slot": "img/s15-death-wrongdoor",
        "text": "PS1/PS2-era first-person magic-school game screenshot, first-person POV, heavy grain/VHS, low-poly, colorful magical castle, 9:16. SCENE: the wrong classroom door bursts open and a huge hulking magical beast — a mountain troll / horned monster — lunges out roaring, its massive fist swinging into the frame, torchlight and shadow. Sudden lethal lunge.\n",
        "stage": "image"
      },
      {
        "slot": "img/s16-class-end",
        "text": "PS1/PS2-era first-person magic-school game screenshot, first-person POV with wand and robe sleeve, heavy grain/VHS, low-poly, colorful magical castle, 9:16. SCENE: the POV pushes open the correct classroom door into a warm, bright, cosy enchanted classroom — rows of wooden desks, floating candles, a chalkboard with glowing runes, big stained-glass windows, students settling in, golden afternoon light. Made it to class, safe, triumphant calm.\n",
        "stage": "image"
      },
      {
        "slot": "s02-stair-fork",
        "text": "PS1/PS2-era first-person magic-school game screenshot, first-person POV with a glowing wand and robe sleeve, heavy grain/VHS, low-poly, colorful glowing magical castle, 9:16. SCENE: a fork of two enchanted moving stone staircases diverging — the LEFT staircase swings toward a warm lit golden archway, the RIGHT staircase drifts out over a deep glowing magical abyss far below; floating candles, sparkling motes, stained glass. Two glowing paths.\n",
        "model": "google/gemini-3-pro-image-preview",
        "stage": "image"
      },
      {
        "slot": "s02-stair-fork-vid",
        "text": "PS1 magic-school game footage, first-person POV with wand, heavy grain/VHS, low-poly, colorful magical castle, 9:16. A held choice-moment, idle, nobody commits. POV faces two enchanted moving staircases diverging — left toward a warm golden archway, right drifting out over a glowing magical abyss. LOCKED framing. The staircases slowly shift and grind, candles flicker, motes drift, magic shimmers — world alive, choice unmade.\n",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "s03-death-stair",
        "text": "PS1/PS2-era first-person magic-school game screenshot, first-person POV, heavy grain/VHS, low-poly, colorful magical castle, 9:16. SCENE: the moving staircase under the POV suddenly swings away and crumbles, tipping you off the edge — you are falling into a vast deep glowing magical abyss, candles and stone receding far above, swirling colored light below. Vertigo, peril.\n",
        "model": "google/gemini-3-pro-image-preview",
        "stage": "image"
      },
      {
        "slot": "s03-death-stair-vid",
        "text": "PS1 magic-school game footage, first-person POV, heavy grain/VHS, low-poly, colorful magical castle, 9:16. A death scene — instant. 0-1s: the staircase under the POV lurches. 1-3s: it swings away and crumbles, tipping you off the edge — you plunge into the vast glowing magical abyss, candles and stone receding far above, swirling colored light below. 3-4s: the depths swallow the view to black. Stone grinding, a cry, rushing wind.\n",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "s04-stair-cross",
        "text": "PS1/PS2-era first-person magic-school game screenshot, first-person POV with wand and robe sleeve, heavy grain/VHS, low-poly, colorful magical castle, 9:16. SCENE: the POV safely crosses the moving staircase and steps onto a warm lit landing before a glowing golden archway, floating candles, stained glass, sparkling motes, relief and wonder.\n",
        "model": "google/gemini-3-pro-image-preview",
        "stage": "image"
      },
      {
        "slot": "s04-stair-cross-vid",
        "text": "PS1 magic-school game footage, first-person POV with wand and robe sleeve, heavy grain/VHS, low-poly, colorful magical castle, 9:16. POV strides forward across the moving staircase onto the warm lit landing before the glowing golden archway; candles flicker, motes sparkle, banners sway — relief and wonder, forward motion.\n",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "s05-armor-fork",
        "text": "PS1/PS2-era first-person magic-school game screenshot, first-person POV with wand, heavy grain/VHS, low-poly, colorful magical castle, 9:16. SCENE: a torchlit stone corridor splitting into two archways, each flanked by a towering animated suit of living knight armor holding a halberd; the LEFT armor stands still, the RIGHT armor is already raising its blade. Glowing runes, banners, eerie magical menace.\n",
        "model": "google/gemini-3-pro-image-preview",
        "stage": "image"
      },
      {
        "slot": "s05-armor-fork-vid",
        "text": "PS1 magic-school game footage, first-person POV with wand, heavy grain/VHS, low-poly, colorful magical castle, 9:16. A held choice-moment, idle, nobody commits. POV in a torchlit corridor splitting two ways, each flanked by a towering living suit of knight armor; the right-hand armor slowly raises its halberd. LOCKED framing. Torches flicker, runes glow, the armor creaks and shifts in place — world alive, choice unmade.\n",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "s06-death-armor",
        "text": "PS1/PS2-era first-person magic-school game screenshot, first-person POV, heavy grain/VHS, low-poly, colorful magical castle, 9:16. SCENE: a massive animated suit of living knight armor swings its huge halberd straight down at the POV, the blade filling the frame in a blur of motion, sparks and torchlight, the corridor lurching. Sudden lethal impact.\n",
        "model": "google/gemini-3-pro-image-preview",
        "stage": "image"
      },
      {
        "slot": "s06-death-armor-vid",
        "text": "PS1 magic-school game footage, first-person POV, heavy grain/VHS, low-poly, colorful magical castle, 9:16. A death scene — instant. 0-1s: POV steps toward the armor. 1-3s: the living knight armor swings its huge halberd down hard, the blade sweeping through the frame in a blur, sparks flying, the corridor lurching violently. 3-4s: the blade fills the lens to black. Metal shriek, whoosh, heavy clang.\n",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "s07-armor-past",
        "text": "PS1/PS2-era first-person magic-school game screenshot, first-person POV with wand and robe sleeve, heavy grain/VHS, low-poly, colorful magical castle, 9:16. SCENE: the POV slips past the still suit of armor through the safe archway into a glowing enchanted corridor of floating candles and stained glass, sparkling motes, forward, relief.\n",
        "model": "google/gemini-3-pro-image-preview",
        "stage": "image"
      },
      {
        "slot": "s07-armor-past-vid",
        "text": "PS1 magic-school game footage, first-person POV with wand and robe sleeve, heavy grain/VHS, low-poly, colorful magical castle, 9:16. POV slips past the still suit of armor through the safe archway into a glowing candlelit corridor, magic motes sparkling, stained glass — forward, relief.\n",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "s08-portal-fork",
        "text": "PS1/PS2-era first-person magic-school game screenshot, first-person POV with wand, heavy grain/VHS, low-poly, colorful magical castle, 9:16. SCENE: a dim enchanted chamber with two swirling magical teleport portals side by side — a glowing BLUE vortex on the left and a glowing GOLD vortex on the right, crackling with arcane sparks and runes, sucking in light. Two doorways of magic.\n",
        "model": "google/gemini-3-pro-image-preview",
        "stage": "image"
      },
      {
        "slot": "s08-portal-fork-vid",
        "text": "PS1 magic-school game footage, first-person POV with wand, heavy grain/VHS, low-poly, colorful magical castle, 9:16. A held choice-moment, idle, nobody commits. POV faces two swirling magical teleport portals — a glowing blue vortex and a glowing gold vortex — crackling with arcane sparks and runes. LOCKED framing. The portals swirl and pulse, sparks crackle, runes glow — world alive, choice unmade.\n",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "s09-death-portal",
        "text": "PS1/PS2-era first-person magic-school game screenshot, first-person POV, heavy grain/VHS, low-poly, colorful magical castle, 9:16. SCENE: the POV is pulled into the wrong teleport portal and it misfires — the view shatters into scattering magical shards and streaking colored light, the body splintering apart into glowing fragments, a violent arcane disintegration. Peril.\n",
        "model": "google/gemini-3-pro-image-preview",
        "stage": "image"
      },
      {
        "slot": "s09-death-portal-vid",
        "text": "PS1 magic-school game footage, first-person POV, heavy grain/VHS, low-poly, colorful magical castle, 9:16. A death scene — instant. 0-1s: the POV is sucked into the wrong portal. 1-3s: it misfires — the view shatters into scattering glowing magical shards and streaking colored light, the body splintering apart into fragments. 3-4s: the shards scatter away to black. Arcane crackle, shatter, whoosh.\n",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "s10-portal-through",
        "text": "PS1/PS2-era first-person magic-school game screenshot, first-person POV with wand and robe sleeve, heavy grain/VHS, low-poly, colorful magical castle, 9:16. SCENE: the POV rematerializes out of the correct portal in a swirl of soft light into a bright grand enchanted hall, floating candles, stained glass, sparkling motes, intact and safe, wonder.\n",
        "model": "google/gemini-3-pro-image-preview",
        "stage": "image"
      },
      {
        "slot": "s10-portal-through-vid",
        "text": "PS1 magic-school game footage, first-person POV with wand and robe sleeve, heavy grain/VHS, low-poly, colorful magical castle, 9:16. POV rematerializes out of the correct portal in a swirl of soft light into a bright grand enchanted hall, candles drifting, motes sparkling, intact and safe — wonder, forward.\n",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "s11-peeves-fork",
        "text": "PS1/PS2-era first-person magic-school game screenshot, first-person POV with wand, heavy grain/VHS, low-poly, colorful magical castle, 9:16. SCENE: a long corridor of floating candles and a huge crystal chandelier overhead, a mischievous cackling poltergeist (Peeves-like, a small grinning glowing imp) hovering near the chandelier; the floor splits into a solid stone path on one side and a suspicious shimmering trick-floor on the other. Glowing, playful menace.\n",
        "model": "google/gemini-3-pro-image-preview",
        "stage": "image"
      },
      {
        "slot": "s11-peeves-fork-vid",
        "text": "PS1 magic-school game footage, first-person POV with wand, heavy grain/VHS, low-poly, colorful magical castle, 9:16. A held choice-moment, idle, nobody commits. POV in a candlelit corridor under a huge crystal chandelier; a grinning poltergeist imp hovers and cackles near it; a solid stone path on one side, a shimmering suspicious trick-floor on the other. LOCKED framing. Candles flicker, the poltergeist bobs and cackles, the chandelier sways, motes drift — world alive, choice unmade.\n",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "s12-death-peeves",
        "text": "PS1/PS2-era first-person magic-school game screenshot, first-person POV, heavy grain/VHS, low-poly, colorful magical castle, 9:16. SCENE: the grinning poltergeist cuts the rope and the enormous crystal chandelier plunges straight down toward the POV, shattering candlelight and crystal filling the frame, the floor vanishing — falling. Sudden peril.\n",
        "model": "google/gemini-3-pro-image-preview",
        "stage": "image"
      },
      {
        "slot": "s12-death-peeves-vid",
        "text": "PS1 magic-school game footage, first-person POV, heavy grain/VHS, low-poly, colorful magical castle, 9:16. A death scene — instant. 0-1s: the poltergeist cackles and cuts the rope. 1-3s: the enormous crystal chandelier plunges straight down at the POV, crystal and candlelight exploding through the frame as the floor vanishes — falling. 3-4s: crash to black. Snap, shatter, crash.\n",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "s13-peeves-past",
        "text": "PS1/PS2-era first-person magic-school game screenshot, first-person POV with wand and robe sleeve, heavy grain/VHS, low-poly, colorful magical castle, 9:16. SCENE: the POV darts along the solid stone path under the floating candles, the cackling poltergeist left behind above, sparkling motes, a glowing classroom door visible ahead, forward, relief.\n",
        "model": "google/gemini-3-pro-image-preview",
        "stage": "image"
      },
      {
        "slot": "s13-peeves-past-vid",
        "text": "PS1 magic-school game footage, first-person POV with wand and robe sleeve, heavy grain/VHS, low-poly, colorful magical castle, 9:16. POV darts forward along the solid stone path under the floating candles, the cackling poltergeist left behind above; a glowing classroom door ahead, motes sparkling — forward, relief.\n",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "s14-class-fork",
        "text": "PS1/PS2-era first-person magic-school game screenshot, first-person POV with wand, heavy grain/VHS, low-poly, colorful magical castle, 9:16. SCENE: the end of the hall — two ornate arched classroom doors side by side, the LEFT door glowing warm and inviting with golden light spilling under it, the RIGHT door dark and ominous with a faint growl behind it; floating candles, banners, glowing runes. The final choice.\n",
        "model": "google/gemini-3-pro-image-preview",
        "stage": "image"
      },
      {
        "slot": "s14-class-fork-vid",
        "text": "PS1 magic-school game footage, first-person POV with wand, heavy grain/VHS, low-poly, colorful magical castle, 9:16. A held choice-moment, idle, nobody commits. POV at the end of the hall facing two ornate classroom doors — the left glowing warm and inviting, the right dark and ominous with a faint growl behind it. LOCKED framing. Golden light spills under the left door, the right door trembles faintly, candles flicker, runes glow — world alive, choice unmade.\n",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "s15-death-wrongdoor",
        "text": "PS1/PS2-era first-person magic-school game screenshot, first-person POV, heavy grain/VHS, low-poly, colorful magical castle, 9:16. SCENE: the wrong classroom door bursts open and a huge hulking magical beast — a mountain troll / horned monster — lunges out roaring, its massive fist swinging into the frame, torchlight and shadow. Sudden lethal lunge.\n",
        "model": "google/gemini-3-pro-image-preview",
        "stage": "image"
      },
      {
        "slot": "s15-death-wrongdoor-vid",
        "text": "PS1 magic-school game footage, first-person POV, heavy grain/VHS, low-poly, colorful magical castle, 9:16. A death scene — instant. 0-1s: the wrong classroom door creaks open. 1-3s: a huge hulking magical troll-beast lunges out roaring, its massive fist swinging into the frame, torchlight and shadow. 3-4s: the fist fills the lens to black. Roar, whoosh, impact.\n",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "s16-class-end",
        "text": "PS1/PS2-era first-person magic-school game screenshot, first-person POV with wand and robe sleeve, heavy grain/VHS, low-poly, colorful magical castle, 9:16. SCENE: the POV pushes open the correct classroom door into a warm, bright, cosy enchanted classroom — rows of wooden desks, floating candles, a chalkboard with glowing runes, big stained-glass windows, students settling in, golden afternoon light. Made it to class, safe, triumphant calm.\n",
        "model": "google/gemini-3-pro-image-preview",
        "stage": "image"
      },
      {
        "slot": "s16-class-end-vid",
        "text": "PS1 magic-school game footage turning calm and triumphant, first-person POV with wand and robe sleeve, heavy grain/VHS, low-poly, colorful magical castle, 9:16. POV pushes open the correct classroom door into a warm bright enchanted classroom — rows of wooden desks, floating candles, a glowing-rune chalkboard, big stained-glass windows, students settling in, golden afternoon light. Throughout: candles drift, magic motes sparkle, students shift gently, the POV steps in and settles — made it to class, safe, triumphant calm. The world keeps gently moving, no freeze.\n",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      }
    ],
    "recipes": [
      {
        "kind": "bake",
        "name": "ffmpeg-xfade-master"
      },
      {
        "kind": "overlay",
        "name": "vhs-pause-freeze"
      },
      {
        "kind": "overlay",
        "name": "smpte-countdown-disc"
      },
      {
        "kind": "ffmpeg",
        "name": "old-radio-ps1-vo"
      },
      {
        "kind": "overlay",
        "name": "chroma-split"
      },
      {
        "kind": "encode",
        "name": "film-grain"
      },
      {
        "kind": "overlay",
        "name": "burned-captions"
      },
      {
        "kind": "ffmpeg",
        "name": "boomerang-motion-fill"
      }
    ],
    "scenario": {
      "scenes": [
        {
          "id": "hub-vid",
          "durationSec": 4
        },
        {
          "id": "s02-stair-fork-vid",
          "durationSec": 4
        },
        {
          "id": "s03-death-stair-vid",
          "durationSec": 4
        },
        {
          "id": "s04-stair-cross-vid",
          "durationSec": 4
        },
        {
          "id": "s05-armor-fork-vid",
          "durationSec": 4
        },
        {
          "id": "s06-death-armor-vid",
          "durationSec": 4
        },
        {
          "id": "s07-armor-past-vid",
          "durationSec": 4
        },
        {
          "id": "s08-portal-fork-vid",
          "durationSec": 4
        },
        {
          "id": "s09-death-portal-vid",
          "durationSec": 4
        },
        {
          "id": "s10-portal-through-vid",
          "durationSec": 4
        },
        {
          "id": "s11-peeves-fork-vid",
          "durationSec": 4
        },
        {
          "id": "s12-death-peeves-vid",
          "durationSec": 4
        },
        {
          "id": "s13-peeves-past-vid",
          "durationSec": 4
        },
        {
          "id": "s14-class-fork-vid",
          "durationSec": 4
        },
        {
          "id": "s15-death-wrongdoor-vid",
          "durationSec": 4
        },
        {
          "id": "s16-class-end-vid",
          "durationSec": 6
        }
      ]
    },
    "createdAt": "2026-06-04T03:20:17.534Z",
    "modelStack": [
      {
        "model": "bytedance/seedance-2.0",
        "stage": "i2v",
        "params": {
          "resolution": "720p",
          "aspect_ratio": "9:16",
          "duration_sec": 4
        },
        "costUsd": 10.08
      },
      {
        "model": "google/gemini-3-pro-image-preview",
        "stage": "image",
        "params": {
          "size": "1080x1920"
        },
        "costUsd": 2.4
      },
      {
        "model": "hyperframes-render",
        "stage": "video"
      }
    ],
    "composition": {
      "file": "index.html",
      "html": "<!doctype html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\" />\n<style>\n  @font-face { font-family: 'Pixelify'; src: url('assets/fonts/PixelifySans-VF.ttf') format('truetype'); font-weight: 400 700; font-style: normal; font-display: block; }\n  * { margin: 0; padding: 0; box-sizing: border-box; }\n  html, body { width: 1080px; height: 1920px; background: #000; overflow: hidden; }\n  #root { position: relative; width: 1080px; height: 1920px; background: #000; font-family: 'Pixelify', 'Courier New', monospace; }\n  .vid { position: absolute; inset: 0; width: 1080px; height: 1920px; object-fit: cover; display: block; z-index: 1; }\n  #vhs { position: absolute; inset: 0; z-index: 38; pointer-events: none; opacity: 0; }\n  #vcr { position: absolute; inset: 0; width: 100%; height: 100%; image-rendering: pixelated; opacity: 0.45; }\n  #vhs .scan { position: absolute; inset: 0; background: linear-gradient(rgba(0,0,0,0) 50%, rgba(0,0,0,0.30) 50%), linear-gradient(90deg, rgba(255,0,0,0.04), rgba(0,255,0,0.02), rgba(0,0,255,0.04)); background-size: 100% 3px, 4px 100%; }\n  #vhs .tint { position: absolute; inset: 0; background: rgba(40,32,12,0.10); }\n  #vhs .pause { position: absolute; top: 54px; left: 60px; font-size: 46px; letter-spacing: 5px; color: #fff3d0; text-shadow: 0 0 12px rgba(0,0,0,0.95), 0 3px 8px #000; }\n  #vhs .pause b { letter-spacing: 0; margin-right: 14px; }\n  .grain { position: absolute; inset: 0; z-index: 40; pointer-events: none; background: repeating-linear-gradient(to bottom, rgba(0,0,0,0) 0 2px, rgba(0,0,0,0.16) 2px 3px); mix-blend-mode: multiply; opacity: 0.42; }\n  .vignette { position: absolute; inset: 0; z-index: 41; pointer-events: none; background: radial-gradient(118% 88% at 50% 46%, rgba(0,0,0,0) 52%, rgba(0,0,0,0.55) 100%); }\n  #title { position: absolute; z-index: 30; left: 0; right: 0; top: 150px; text-align: center; font-size: 80px; letter-spacing: 6px; color: #ffe27a; opacity: 0; text-shadow: 0 0 24px rgba(0,0,0,0.95), 0 0 34px rgba(255,200,80,0.5), 0 4px 10px rgba(0,0,0,0.95); }\n  #countdown { position: absolute; z-index: 45; left: 50%; top: 63%; transform: translate(-50%,-50%); width: 360px; height: 360px; opacity: 0; }\n  #countdown svg { position: absolute; inset: 0; width: 100%; height: 100%; }\n  #cd-num { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 230px; color: #fff3d0; text-shadow: 0 0 28px rgba(0,0,0,0.95); line-height: 1; }\n  .cd-ring { fill: none; stroke: rgba(255,226,122,0.30); stroke-width: 7; }\n  .cd-sweep { fill: none; stroke: #ffe27a; stroke-width: 11; transform: rotate(-90deg); transform-origin: 50% 50%; }\n  .cd-cross { stroke: rgba(255,226,122,0.45); stroke-width: 4; }\n  #cd-plate { position: absolute; z-index: 44; left: 50%; top: 63%; transform: translate(-50%,-50%); width: 390px; height: 390px; background: rgba(20,16,8,0.5); opacity: 0; }\n  .fork { position: absolute; z-index: 43; top: 38%; max-width: 470px; font-size: 60px; line-height: 1.05; color: #fff3d0; opacity: 0; text-shadow: 0 0 16px rgba(0,0,0,0.95), 0 3px 8px #000; }\n  #fork-l { left: 56px; text-align: left; }\n  #fork-r { right: 56px; text-align: right; }\n  #death-wash { position: absolute; inset: 0; z-index: 46; pointer-events: none; opacity: 0; background: radial-gradient(120% 90% at 50% 45%, rgba(150,0,0,0.6) 0%, rgba(40,0,0,0.9) 100%); }\n  #death { position: absolute; z-index: 47; left: 0; right: 0; top: 41%; text-align: center; font-size: 210px; letter-spacing: 8px; color: #ff2a2a; opacity: 0; line-height: 0.9; text-shadow: 7px 0 0 rgba(255,0,46,0.55), -7px 0 0 rgba(0,200,255,0.45), 0 0 40px rgba(255,40,40,0.7), 0 6px 16px rgba(0,0,0,0.95); }\n  #flash { position: absolute; inset: 0; z-index: 48; background: #fff; opacity: 0; pointer-events: none; }\n  .cap { position: absolute; z-index: 35; left: 70px; right: 70px; bottom: 300px; text-align: center; font-family: 'Pixelify', monospace; font-size: 58px; line-height: 1.25; letter-spacing: 1px; opacity: 0; text-shadow: 0 4px 22px rgba(0,0,0,0.98), 0 2px 6px rgba(0,0,0,1); white-space: pre-line; color: #fff; }\n  #cta { position: absolute; z-index: 36; left: 60px; right: 60px; top: 38%; text-align: center; font-size: 76px; line-height: 1.16; color: #ffe27a; opacity: 0; text-shadow: 0 0 24px rgba(0,0,0,0.95), 0 0 36px rgba(255,200,80,0.5), 0 4px 10px #000; }\n</style>\n</head>\n<body>\n<div id=\"root\" data-composition-id=\"choose-magicschool-001\" data-width=\"1080\" data-height=\"1920\" data-start=\"0\" data-duration=\"73.25\">\n  <video id=\"master\" class=\"vid clip\" data-start=\"0\" data-duration=\"73.25\" data-media-start=\"0\" data-track-index=\"0\" src=\"assets/master.mp4\" muted playsinline crossorigin=\"anonymous\"></video>\n  <div id=\"vhs\"><canvas id=\"vcr\"></canvas><div class=\"tint\"></div><div class=\"scan\"></div><div class=\"pause\"><b>&#10073;&#10073;</b>PAUSE</div></div>\n  <div id=\"title\">GET TO CLASS</div>\n  <div class=\"fork\" id=\"fork-l\"></div>\n  <div class=\"fork\" id=\"fork-r\"></div>\n  <div id=\"cd-plate\"></div>\n  <div id=\"countdown\"><svg viewBox=\"0 0 460 460\"><circle class=\"cd-ring\" cx=\"230\" cy=\"230\" r=\"210\"></circle><circle class=\"cd-sweep\" id=\"cd-sweep\" cx=\"230\" cy=\"230\" r=\"210\"></circle><line class=\"cd-cross\" x1=\"230\" y1=\"6\" x2=\"230\" y2=\"454\"></line><line class=\"cd-cross\" x1=\"6\" y1=\"230\" x2=\"454\" y2=\"230\"></line></svg><div id=\"cd-num\">3</div></div>\n  <div id=\"death-wash\"></div>\n  <div id=\"death\">DEAD</div>\n  <div class=\"cap\" id=\"cap\"></div>\n  <div id=\"cta\">WHICH DOOR<br>WOULD YOU OPEN?</div>\n  <div class=\"grain\"></div>\n  <div class=\"vignette\"></div>\n  <div id=\"flash\"></div>\n\n  <audio id=\"bgm\" class=\"clip\" src=\"assets/music/soundtrack-bed.mp3\" data-start=\"0\" data-duration=\"73.25\" data-media-start=\"0\" data-track-index=\"9\" data-volume=\"0.22\"></audio>\n\n  <audio id=\"vo-hub\" class=\"clip\" src=\"assets/voiceover/mn-hub.mp3\" data-start=\"0.30\"  data-duration=\"4.00\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-hub2\" class=\"clip\" src=\"assets/voiceover/mn-hub2.mp3\" data-start=\"4.45\" data-duration=\"1.72\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-s02\" class=\"clip\" src=\"assets/voiceover/mn-s02.mp3\" data-start=\"6.80\"  data-duration=\"3.16\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-s03\" class=\"clip\" src=\"assets/voiceover/mn-s03.mp3\" data-start=\"12.60\" data-duration=\"2.59\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-s04\" class=\"clip\" src=\"assets/voiceover/mn-s04.mp3\" data-start=\"16.00\" data-duration=\"1.80\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-s05\" class=\"clip\" src=\"assets/voiceover/mn-s05.mp3\" data-start=\"18.50\" data-duration=\"2.09\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-s06\" class=\"clip\" src=\"assets/voiceover/mn-s06.mp3\" data-start=\"25.20\" data-duration=\"2.25\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-s07\" class=\"clip\" src=\"assets/voiceover/mn-s07.mp3\" data-start=\"28.60\" data-duration=\"1.38\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-s08\" class=\"clip\" src=\"assets/voiceover/mn-s08.mp3\" data-start=\"30.50\" data-duration=\"2.85\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-s09\" class=\"clip\" src=\"assets/voiceover/mn-s09.mp3\" data-start=\"37.85\" data-duration=\"2.80\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-s10\" class=\"clip\" src=\"assets/voiceover/mn-s10.mp3\" data-start=\"41.25\" data-duration=\"2.09\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-s11\" class=\"clip\" src=\"assets/voiceover/mn-s11.mp3\" data-start=\"44.60\" data-duration=\"3.06\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-s12\" class=\"clip\" src=\"assets/voiceover/mn-s12.mp3\" data-start=\"50.50\" data-duration=\"2.46\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-s13\" class=\"clip\" src=\"assets/voiceover/mn-s13.mp3\" data-start=\"53.85\" data-duration=\"2.22\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-s14\" class=\"clip\" src=\"assets/voiceover/mn-s14.mp3\" data-start=\"57.20\" data-duration=\"2.59\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-s15\" class=\"clip\" src=\"assets/voiceover/mn-s15.mp3\" data-start=\"63.10\" data-duration=\"2.09\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-s16\" class=\"clip\" src=\"assets/voiceover/mn-s16.mp3\" data-start=\"66.50\" data-duration=\"3.06\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-cta\" class=\"clip\" src=\"assets/voiceover/mn-cta.mp3\" data-start=\"70.00\" data-duration=\"1.85\" data-track-index=\"10\" data-volume=\"1\"></audio>\n\n  <audio id=\"bp00\" class=\"clip\" src=\"assets/sfx/beep-soft.mp3\"       data-start=\"10.66\" data-duration=\"0.16\" data-track-index=\"11\" data-volume=\"1\"></audio>\n  <audio id=\"bp01\" class=\"clip\" src=\"assets/sfx/beep-soft.mp3\"       data-start=\"11.16\" data-duration=\"0.16\" data-track-index=\"11\" data-volume=\"1\"></audio>\n  <audio id=\"bp02\" class=\"clip\" src=\"assets/sfx/beep-soft-final.mp3\" data-start=\"11.66\" data-duration=\"0.30\" data-track-index=\"11\" data-volume=\"1\"></audio>\n  <audio id=\"bp03\" class=\"clip\" src=\"assets/sfx/beep-soft.mp3\"       data-start=\"23.28\" data-duration=\"0.16\" data-track-index=\"11\" data-volume=\"1\"></audio>\n  <audio id=\"bp04\" class=\"clip\" src=\"assets/sfx/beep-soft.mp3\"       data-start=\"23.78\" data-duration=\"0.16\" data-track-index=\"11\" data-volume=\"1\"></audio>\n  <audio id=\"bp05\" class=\"clip\" src=\"assets/sfx/beep-soft-final.mp3\" data-start=\"24.28\" data-duration=\"0.30\" data-track-index=\"11\" data-volume=\"1\"></audio>\n  <audio id=\"bp06\" class=\"clip\" src=\"assets/sfx/beep-soft.mp3\"       data-start=\"35.91\" data-duration=\"0.16\" data-track-index=\"11\" data-volume=\"1\"></audio>\n  <audio id=\"bp07\" class=\"clip\" src=\"assets/sfx/beep-soft.mp3\"       data-start=\"36.41\" data-duration=\"0.16\" data-track-index=\"11\" data-volume=\"1\"></audio>\n  <audio id=\"bp08\" class=\"clip\" src=\"assets/sfx/beep-soft-final.mp3\" data-start=\"36.91\" data-duration=\"0.30\" data-track-index=\"11\" data-volume=\"1\"></audio>\n  <audio id=\"bp09\" class=\"clip\" src=\"assets/sfx/beep-soft.mp3\"       data-start=\"48.53\" data-duration=\"0.16\" data-track-index=\"11\" data-volume=\"1\"></audio>\n  <audio id=\"bp10\" class=\"clip\" src=\"assets/sfx/beep-soft.mp3\"       data-start=\"49.03\" data-duration=\"0.16\" data-track-index=\"11\" data-volume=\"1\"></audio>\n  <audio id=\"bp11\" class=\"clip\" src=\"assets/sfx/beep-soft-final.mp3\" data-start=\"49.53\" data-duration=\"0.30\" data-track-index=\"11\" data-volume=\"1\"></audio>\n  <audio id=\"bp12\" class=\"clip\" src=\"assets/sfx/beep-soft.mp3\"       data-start=\"61.16\" data-duration=\"0.16\" data-track-index=\"11\" data-volume=\"1\"></audio>\n  <audio id=\"bp13\" class=\"clip\" src=\"assets/sfx/beep-soft.mp3\"       data-start=\"61.66\" data-duration=\"0.16\" data-track-index=\"11\" data-volume=\"1\"></audio>\n  <audio id=\"bp14\" class=\"clip\" src=\"assets/sfx/beep-soft-final.mp3\" data-start=\"62.16\" data-duration=\"0.30\" data-track-index=\"11\" data-volume=\"1\"></audio>\n\n  <audio id=\"sx-amb1\" class=\"clip\" src=\"assets/sfx/magic-amb.mp3\" data-start=\"0.00\"  data-duration=\"10.0\" data-track-index=\"12\" data-volume=\"0.15\"></audio>\n  <audio id=\"sx-amb2\" class=\"clip\" src=\"assets/sfx/magic-amb.mp3\" data-start=\"30.00\" data-duration=\"10.0\" data-track-index=\"12\" data-volume=\"0.15\"></audio>\n  <audio id=\"sx-amb3\" class=\"clip\" src=\"assets/sfx/magic-amb.mp3\" data-start=\"55.00\" data-duration=\"10.0\" data-track-index=\"12\" data-volume=\"0.15\"></audio>\n\n  <audio id=\"sx-d03\" class=\"clip\" src=\"assets/sfx/death-fall.mp3\"       data-start=\"14.20\" data-duration=\"3.0\" data-track-index=\"13\" data-volume=\"0.6\"></audio>\n  <audio id=\"sx-d06\" class=\"clip\" src=\"assets/sfx/death-armor.mp3\"      data-start=\"26.85\" data-duration=\"2.6\" data-track-index=\"13\" data-volume=\"0.6\"></audio>\n  <audio id=\"sx-d09\" class=\"clip\" src=\"assets/sfx/death-portal.mp3\"     data-start=\"39.45\" data-duration=\"3.0\" data-track-index=\"13\" data-volume=\"0.6\"></audio>\n  <audio id=\"sx-d12\" class=\"clip\" src=\"assets/sfx/death-chandelier.mp3\" data-start=\"52.05\" data-duration=\"3.0\" data-track-index=\"13\" data-volume=\"0.6\"></audio>\n  <audio id=\"sx-d15\" class=\"clip\" src=\"assets/sfx/death-door.mp3\"       data-start=\"64.65\" data-duration=\"3.0\" data-track-index=\"13\" data-volume=\"0.6\"></audio>\n\n  <audio id=\"sx-bell\" class=\"clip\" src=\"assets/sfx/bell.mp3\"           data-start=\"0.30\"  data-duration=\"3.0\" data-track-index=\"14\" data-volume=\"0.4\"></audio>\n  <audio id=\"sx-stair\" class=\"clip\" src=\"assets/sfx/stair-grind.mp3\"   data-start=\"6.80\"  data-duration=\"5.0\" data-track-index=\"14\" data-volume=\"0.32\"></audio>\n  <audio id=\"sx-port\" class=\"clip\" src=\"assets/sfx/portal-hum.mp3\"     data-start=\"32.00\" data-duration=\"5.0\" data-track-index=\"14\" data-volume=\"0.35\"></audio>\n  <audio id=\"sx-pol\" class=\"clip\" src=\"assets/sfx/poltergeist.mp3\"     data-start=\"44.60\" data-duration=\"4.0\" data-track-index=\"14\" data-volume=\"0.4\"></audio>\n  <audio id=\"sx-arr\" class=\"clip\" src=\"assets/sfx/arrive-fanfare.mp3\"  data-start=\"66.50\" data-duration=\"4.0\" data-track-index=\"14\" data-volume=\"0.45\"></audio>\n\n  <script src=\"https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js\"></script>\n  <script>\n    const tl = gsap.timeline({ paused: true, defaults: { immediateRender: false } });\n    const C = 2 * Math.PI * 210;\n    gsap.set(\"#cd-sweep\", { strokeDasharray: C, strokeDashoffset: 0 });\n    gsap.set([\"#title\",\"#countdown\",\"#cd-plate\",\"#fork-l\",\"#fork-r\",\"#death\",\"#death-wash\",\"#cap\",\"#cta\",\"#vhs\",\"#flash\"], { opacity: 0 });\n    const A   = [0.00,6.50,12.38,15.75,19.12,25.00,28.38,31.75,37.62,41.00,44.38,50.25,53.62,57.00,62.88,66.25];\n    const SEG = [7.00,6.38,3.88,3.88,6.38,3.88,3.88,6.38,3.88,3.88,6.38,3.88,3.88,6.38,3.88,7.00];\n    const vcr=document.getElementById(\"vcr\"); vcr.width=270; vcr.height=480; const vctx=vcr.getContext(\"2d\");\n    function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}\n    function drawVHS(t){const r=mulberry32((Math.floor(t*30)|0)+1);const w=vcr.width,h=vcr.height;const img=vctx.createImageData(w,h),d=img.data;for(let i=0;i<d.length;i+=4){const v=(r()*255)|0;d[i]=d[i+1]=d[i+2]=v;d[i+3]=(r()*54)|0;}vctx.putImageData(img,0,0);const band=Math.floor((t*60)%h);vctx.fillStyle=\"rgba(255,255,255,0.5)\";for(let k=0;k<22;k++){const x=(r()*w)|0,y=band+((r()*46)|0)-23;vctx.fillRect(x,y,(r()*7)|0,2);}}\n    function vhs(s,dur){tl.set(\"#vhs\",{opacity:1},s);const pf={v:s};tl.to(pf,{v:s+dur,duration:dur,ease:\"none\",onUpdate:()=>drawVHS(pf.v),overwrite:\"auto\"},s);let t=s,k=0;while(t<s+dur){tl.set(\"#vhs\",{y:(k%2?1:-1)},t);t+=0.1;k++;}tl.set(\"#vhs\",{y:0},s+dur);tl.to(\"#vhs\",{opacity:0,duration:0.12,overwrite:\"auto\"},s+dur);}\n    function cap(text,tin,tout){tl.set(\"#cap\",{textContent:text},tin-0.01);tl.fromTo(\"#cap\",{opacity:0,y:26},{opacity:1,y:0,duration:0.32,ease:\"power3.out\",overwrite:\"auto\"},tin);tl.to(\"#cap\",{opacity:0,duration:0.28,overwrite:\"auto\"},tout);tl.set(\"#cap\",{opacity:0},tout+0.29);}\n    function disc(s,step){step=step||0.5;tl.fromTo(\"#cd-plate\",{opacity:0},{opacity:1,duration:0.16,overwrite:\"auto\"},s-0.1);tl.fromTo(\"#countdown\",{opacity:0},{opacity:1,duration:0.16,overwrite:\"auto\"},s-0.1);for(let i=0;i<3;i++){const t=s+i*step;tl.set(\"#cd-num\",{textContent:3-i},t);tl.fromTo(\"#cd-sweep\",{strokeDashoffset:0},{strokeDashoffset:C,duration:step,ease:\"none\"},t);tl.fromTo(\"#cd-num\",{scale:1.2,opacity:0.4},{scale:1,opacity:1,duration:step*0.45,ease:\"back.out(2)\"},t);}tl.to([\"#countdown\",\"#cd-plate\"],{opacity:0,duration:0.2,ease:\"power2.in\",overwrite:\"auto\"},s+3*step-0.04);}\n    function deathBeat(i){const s=A[i],dur=SEG[i],dt=s+dur-1.7;tl.set(\"#flash\",{opacity:0.85},dt);tl.to(\"#flash\",{opacity:0,duration:0.22,ease:\"power2.in\",overwrite:\"auto\"},dt+0.03);tl.set(\"#flash\",{opacity:0},dt+0.3);tl.fromTo(\"#death-wash\",{opacity:0.9},{opacity:0,duration:0.6,ease:\"power2.in\",overwrite:\"auto\"},dt);tl.fromTo(\"#death\",{scale:1.7,opacity:0},{scale:1,opacity:1,duration:0.3,ease:\"back.out(2.2)\",overwrite:\"auto\"},dt);tl.to(\"#death\",{x:\"+=16\",duration:0.045,repeat:6,yoyo:true},dt+0.3);tl.set(\"#death\",{x:0},dt+0.7);tl.to(\"#death\",{opacity:0,duration:0.3,overwrite:\"auto\"},s+dur-0.05);tl.set(\"#death\",{opacity:0},s+dur);}\n    function freezeFork(i,l,r){const fs=A[i]+3.9,cd=A[i]+4.2,clear=cd+1.5+0.05;vhs(fs,clear-fs);tl.set(\"#fork-l\",{textContent:l},fs);tl.set(\"#fork-r\",{textContent:r},fs);tl.fromTo(\"#fork-l\",{opacity:0,x:-44},{opacity:1,x:0,duration:0.28,ease:\"power3.out\",overwrite:\"auto\"},fs+0.05);tl.fromTo(\"#fork-r\",{opacity:0,x:44},{opacity:1,x:0,duration:0.28,ease:\"power3.out\",overwrite:\"auto\"},fs+0.05);tl.to([\"#fork-l\",\"#fork-r\"],{opacity:0,duration:0.22,overwrite:\"auto\"},clear-0.05);tl.set([\"#fork-l\",\"#fork-r\"],{opacity:0},clear+0.2);disc(cd,0.5);}\n\n    // intro\n    tl.fromTo(\"#title\",{opacity:0,y:-22},{opacity:1,y:0,duration:0.4,ease:\"power3.out\"},0.4);\n    tl.to(\"#title\",{opacity:0.4,duration:0.05,repeat:3,yoyo:true,ease:\"none\"},0.9);\n    tl.to(\"#title\",{opacity:0,duration:0.3},3.6); tl.set(\"#title\",{opacity:0},3.95);\n\n    freezeFork(1,\"LEFT STAIR\",\"RIGHT STAIR\"); deathBeat(2);\n    freezeFork(4,\"LEFT ARCH\",\"RIGHT ARCH\"); deathBeat(5);\n    freezeFork(7,\"BLUE PORTAL\",\"GOLD PORTAL\"); deathBeat(8);\n    freezeFork(10,\"STONE PATH\",\"TRICK FLOOR\"); deathBeat(11);\n    freezeFork(13,\"LEFT DOOR\",\"RIGHT DOOR\"); deathBeat(14);\n\n    cap(\"ONE HALLWAY. ONE CLASS.\\nA DOZEN WAYS TO DIE.\", 0.42, 4.27);\n    cap(\"Move. The bell already rang.\", 4.57, 6.15);\n    cap(\"The staircases move when they feel like it.\", 6.92, 9.93);\n    cap(\"You took the pretty one. It dropped you.\", 12.72, 15.16);\n    cap(\"The other one held. Keep climbing.\", 16.12, 17.78);\n    cap(\"Two armored guards. One is awake.\", 18.62, 20.56);\n    cap(\"Wrong side. The armor swings first.\", 25.32, 27.42);\n    cap(\"You slipped the still one.\", 28.72, 29.96);\n    cap(\"One teleports you. One scatters you.\", 30.62, 33.32);\n    cap(\"Wrong portal. It scattered you everywhere.\", 37.97, 40.62);\n    cap(\"Gold held you together.\", 41.37, 43.33);\n    cap(\"The poltergeist is bored. The floor lies.\", 44.72, 47.63);\n    cap(\"You trusted the floor.\\nThe chandelier didn't miss.\", 50.62, 52.95);\n    cap(\"Solid stone. The door is right there.\", 53.97, 56.06);\n    cap(\"One door is your class. One is hungry.\", 57.32, 59.76);\n    cap(\"Wrong door. Something big was waiting.\", 63.22, 65.18);\n    cap(\"The warm door. You made it to class.\", 66.62, 69.55);\n\n    // end CTA over the classroom idle\n    tl.fromTo(\"#cta\",{opacity:0,scale:0.9},{opacity:1,scale:1,duration:0.5,ease:\"back.out(1.8)\"},67.0);\n    tl.to({},{duration:0.01},73.19);\n    window.__timelines = window.__timelines || {};\n    window.__timelines[\"choose-magicschool-001\"] = tl;\n  </script>\n</div>\n</body>\n</html>\n",
      "timing": {
        "A": [
          0,
          6.5,
          12.38,
          15.75,
          19.12,
          25,
          28.38,
          31.75,
          37.62,
          41,
          44.38,
          50.25,
          53.62,
          57,
          62.88,
          66.25
        ],
        "SEG": [
          7,
          6.38,
          3.88,
          3.88,
          6.38,
          3.88,
          3.88,
          6.38,
          3.88,
          3.88,
          6.38,
          3.88,
          3.88,
          6.38,
          3.88,
          7
        ]
      },
      "components": [
        "cap",
        "cd-cross",
        "cd-ring",
        "cd-sweep",
        "choose-magicschool-001",
        "clip",
        "deathBeat",
        "disc",
        "drawVHS",
        "fork",
        "freezeFork",
        "grain",
        "mulberry32",
        "pause",
        "scan",
        "tint",
        "vhs",
        "vid",
        "vignette"
      ],
      "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-magicschool/index.html"
    },
    "costRollupUsd": 12.48,
    "schemaVersion": 1
  },
  {
    "notes": "hard asset path for slot 'hub-lowpoly' does not exist; recorded by ref; hard asset path for slot 'hub-ftf' does not exist; recorded by ref",
    "assets": [
      {
        "kind": "character",
        "path": "assets/char-nurse.png",
        "slot": "char-nurse",
        "bytes": 1171983,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-silenthill/assets/char-nurse.png"
      },
      {
        "kind": "character",
        "path": "assets/char-samaritan.png",
        "slot": "char-samaritan",
        "bytes": 1148383,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-silenthill/assets/char-samaritan.png"
      },
      {
        "kind": "location",
        "path": "assets/hub.png",
        "slot": "hub",
        "bytes": 1195495,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-silenthill/assets/hub.png"
      },
      {
        "kind": "location",
        "path": "assets/hub-ftf.png",
        "slot": "hub-ftf"
      },
      {
        "kind": "location",
        "path": "assets/hub-lowpoly.png",
        "slot": "hub-lowpoly"
      },
      {
        "kind": "location",
        "path": "assets/hub-vid.mp4",
        "slot": "hub-vid",
        "bytes": 2130293,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-silenthill/assets/hub-vid.mp4"
      },
      {
        "kind": "character",
        "path": "assets/scene-a02-follow-nurse.png",
        "slot": "scene-a02-follow-nurse",
        "bytes": 1095497,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-silenthill/assets/scene-a02-follow-nurse.png"
      },
      {
        "kind": "character",
        "path": "assets/scene-a02-follow-nurse-vid.mp4",
        "slot": "scene-a02-follow-nurse-vid",
        "bytes": 1622736,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-silenthill/assets/scene-a02-follow-nurse-vid.mp4"
      },
      {
        "kind": "location",
        "path": "assets/scene-a03-fork-siren.png",
        "slot": "scene-a03-fork-siren",
        "bytes": 1341714,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-silenthill/assets/scene-a03-fork-siren.png"
      },
      {
        "kind": "location",
        "path": "assets/scene-a03-fork-siren-vid.mp4",
        "slot": "scene-a03-fork-siren-vid",
        "bytes": 2685299,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-silenthill/assets/scene-a03-fork-siren-vid.mp4"
      },
      {
        "kind": "location",
        "path": "assets/scene-a04-death-run.png",
        "slot": "scene-a04-death-run",
        "bytes": 1320838,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-silenthill/assets/scene-a04-death-run.png"
      },
      {
        "kind": "location",
        "path": "assets/scene-a04-death-run-vid.mp4",
        "slot": "scene-a04-death-run-vid",
        "bytes": 3168734,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-silenthill/assets/scene-a04-death-run-vid.mp4"
      },
      {
        "kind": "location",
        "path": "assets/scene-a05-passed.png",
        "slot": "scene-a05-passed",
        "bytes": 1295224,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-silenthill/assets/scene-a05-passed.png"
      },
      {
        "kind": "location",
        "path": "assets/scene-a05-passed-vid.mp4",
        "slot": "scene-a05-passed-vid",
        "bytes": 2026608,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-silenthill/assets/scene-a05-passed-vid.mp4"
      },
      {
        "kind": "location",
        "path": "assets/scene-a06-fork-door.png",
        "slot": "scene-a06-fork-door",
        "bytes": 1183636,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-silenthill/assets/scene-a06-fork-door.png"
      },
      {
        "kind": "location",
        "path": "assets/scene-a06-fork-door-vid.mp4",
        "slot": "scene-a06-fork-door-vid",
        "bytes": 2050486,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-silenthill/assets/scene-a06-fork-door-vid.mp4"
      },
      {
        "kind": "location",
        "path": "assets/scene-a07-death-opendoor.png",
        "slot": "scene-a07-death-opendoor",
        "bytes": 1110481,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-silenthill/assets/scene-a07-death-opendoor.png"
      },
      {
        "kind": "location",
        "path": "assets/scene-a07-death-opendoor-vid.mp4",
        "slot": "scene-a07-death-opendoor-vid",
        "bytes": 3043207,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-silenthill/assets/scene-a07-death-opendoor-vid.mp4"
      },
      {
        "kind": "location",
        "path": "assets/scene-a08-through.png",
        "slot": "scene-a08-through",
        "bytes": 1151480,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-silenthill/assets/scene-a08-through.png"
      },
      {
        "kind": "location",
        "path": "assets/scene-a08-through-vid.mp4",
        "slot": "scene-a08-through-vid",
        "bytes": 2260134,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-silenthill/assets/scene-a08-through-vid.mp4"
      },
      {
        "kind": "location",
        "path": "assets/scene-a09-fork-dark.png",
        "slot": "scene-a09-fork-dark",
        "bytes": 1230969,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-silenthill/assets/scene-a09-fork-dark.png"
      },
      {
        "kind": "location",
        "path": "assets/scene-a09-fork-dark-vid.mp4",
        "slot": "scene-a09-fork-dark-vid",
        "bytes": 1704906,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-silenthill/assets/scene-a09-fork-dark-vid.mp4"
      },
      {
        "kind": "location",
        "path": "assets/scene-a09b-death-follow.png",
        "slot": "scene-a09b-death-follow",
        "bytes": 1276949,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-silenthill/assets/scene-a09b-death-follow.png"
      },
      {
        "kind": "location",
        "path": "assets/scene-a09b-death-follow-vid.mp4",
        "slot": "scene-a09b-death-follow-vid",
        "bytes": 2211862,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-silenthill/assets/scene-a09b-death-follow-vid.mp4"
      },
      {
        "kind": "location",
        "path": "assets/scene-a10-end.png",
        "slot": "scene-a10-end",
        "bytes": 1098320,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-silenthill/assets/scene-a10-end.png"
      },
      {
        "kind": "location",
        "path": "assets/scene-a10-end-vid.mp4",
        "slot": "scene-a10-end-vid",
        "bytes": 2292755,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-silenthill/assets/scene-a10-end-vid.mp4"
      },
      {
        "kind": "location",
        "path": "assets/scene-b11-with-sam.png",
        "slot": "scene-b11-with-sam",
        "bytes": 1141969,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-silenthill/assets/scene-b11-with-sam.png"
      },
      {
        "kind": "location",
        "path": "assets/scene-b11-with-sam-vid.mp4",
        "slot": "scene-b11-with-sam-vid",
        "bytes": 8403988,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-silenthill/assets/scene-b11-with-sam-vid.mp4"
      },
      {
        "kind": "location",
        "path": "assets/scene-b12-fork-wounded.png",
        "slot": "scene-b12-fork-wounded",
        "bytes": 1111865,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-silenthill/assets/scene-b12-fork-wounded.png"
      },
      {
        "kind": "location",
        "path": "assets/scene-b12-fork-wounded-vid.mp4",
        "slot": "scene-b12-fork-wounded-vid",
        "bytes": 1657258,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-silenthill/assets/scene-b12-fork-wounded-vid.mp4"
      },
      {
        "kind": "location",
        "path": "assets/scene-b13-death-help.png",
        "slot": "scene-b13-death-help",
        "bytes": 1172858,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-silenthill/assets/scene-b13-death-help.png"
      },
      {
        "kind": "location",
        "path": "assets/scene-b13-death-help-vid.mp4",
        "slot": "scene-b13-death-help-vid",
        "bytes": 2739455,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-silenthill/assets/scene-b13-death-help-vid.mp4"
      },
      {
        "kind": "location",
        "path": "assets/scene-b14-moved.png",
        "slot": "scene-b14-moved",
        "bytes": 1202937,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-silenthill/assets/scene-b14-moved.png"
      },
      {
        "kind": "location",
        "path": "assets/scene-b14-moved-vid.mp4",
        "slot": "scene-b14-moved-vid",
        "bytes": 2374814,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-silenthill/assets/scene-b14-moved-vid.mp4"
      },
      {
        "kind": "location",
        "path": "assets/scene-b15-fork-lurker.png",
        "slot": "scene-b15-fork-lurker",
        "bytes": 1214894,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-silenthill/assets/scene-b15-fork-lurker.png"
      },
      {
        "kind": "location",
        "path": "assets/scene-b15-fork-lurker-vid.mp4",
        "slot": "scene-b15-fork-lurker-vid",
        "bytes": 1509737,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-silenthill/assets/scene-b15-fork-lurker-vid.mp4"
      },
      {
        "kind": "location",
        "path": "assets/scene-b16-death-runnow.png",
        "slot": "scene-b16-death-runnow",
        "bytes": 1244306,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-silenthill/assets/scene-b16-death-runnow.png"
      },
      {
        "kind": "location",
        "path": "assets/scene-b16-death-runnow-vid.mp4",
        "slot": "scene-b16-death-runnow-vid",
        "bytes": 2886187,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-silenthill/assets/scene-b16-death-runnow-vid.mp4"
      },
      {
        "kind": "location",
        "path": "assets/scene-b17-slipped.png",
        "slot": "scene-b17-slipped",
        "bytes": 1245310,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-silenthill/assets/scene-b17-slipped.png"
      },
      {
        "kind": "location",
        "path": "assets/scene-b17-slipped-vid.mp4",
        "slot": "scene-b17-slipped-vid",
        "bytes": 2082376,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-silenthill/assets/scene-b17-slipped-vid.mp4"
      },
      {
        "kind": "location",
        "path": "assets/scene-b18-fork-digin.png",
        "slot": "scene-b18-fork-digin",
        "bytes": 1078311,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-silenthill/assets/scene-b18-fork-digin.png"
      },
      {
        "kind": "location",
        "path": "assets/scene-b18-fork-digin-vid.mp4",
        "slot": "scene-b18-fork-digin-vid",
        "bytes": 1909036,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-silenthill/assets/scene-b18-fork-digin-vid.mp4"
      },
      {
        "kind": "location",
        "path": "assets/scene-b18b-death-wait.png",
        "slot": "scene-b18b-death-wait",
        "bytes": 1324688,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-silenthill/assets/scene-b18b-death-wait.png"
      },
      {
        "kind": "location",
        "path": "assets/scene-b18b-death-wait-vid.mp4",
        "slot": "scene-b18b-death-wait-vid",
        "bytes": 3758015,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-silenthill/assets/scene-b18b-death-wait-vid.mp4"
      },
      {
        "kind": "location",
        "path": "assets/scene-b19-end.png",
        "slot": "scene-b19-end",
        "bytes": 1298667,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-silenthill/assets/scene-b19-end.png"
      },
      {
        "kind": "location",
        "path": "assets/scene-b19-end-vid.mp4",
        "slot": "scene-b19-end-vid",
        "bytes": 2864273,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-silenthill/assets/scene-b19-end-vid.mp4"
      },
      {
        "kind": "location",
        "path": "assets/scene-b20-idle-bright-vid.mp4",
        "slot": "scene-b20-idle-bright-vid",
        "bytes": 26212354,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-silenthill/assets/scene-b20-idle-bright-vid.mp4"
      }
    ],
    "unitId": "choose-silenthill",
    "prompts": [
      {
        "slot": "char-nurse",
        "text": "{\n  \"prompt\": {\n    \"scene\": {\n      \"description\": \"RETRO PS1/PSX LOW-POLY SURVIVAL-HORROR 3D GAME RENDER — chunky simplified low-poly geometry, low-resolution dithered textures, heavy film grain, dark and murky, limited detail, vertex wobble, affine texture warping; Silent Hill 1 / early Resident Evil / Puppet Combo / voxel look; NOT photorealistic, NOT high-detail, NOT painterly, NOT glossy. Full-body character reference of a classic survival-horror 'bubble-head' nurse: her face wrapped and obscured in blood-stained bandages, head lolling to one side, wearing a short blood-stained grey-white nurse's dress, pale twitching limbs held in a jerky doll-like pose, holding a flickering flashlight. Broken, unsettling posture. Palette: dingy grey-white dress, brown-red bloodstains, sickly pale skin, cold fog grey, weak warm flashlight glow.\",\n      \"subject\": \"bubble-head nurse, face wrapped in blood-stained bandages, head lolling, short blood-stained grey-white nurse dress, jerky doll-like pose, flickering flashlight\",\n      \"setting\": \"foggy dead-town street at night, ash, a dead streetlight\",\n      \"action\": \"standing twitching, head lolled, flashlight beam stuttering\"\n    },\n    \"style\": {\n      \"primary\": \"retro PS1/PSX 5th-gen-console low-poly survival-horror 3D game render\",\n      \"rendering_quality\": \"very low fidelity, low polygon count, chunky simplified geometry, flat low-res dithered textures, heavy grain; NOT photorealistic, NOT high-detail, NOT painterly, NOT glossy\",\n      \"surface_textures\": \"low-res dithered fabric and skin textures, crusted bloodstains\",\n      \"lighting\": \"weak warm flashlight key, cold grey fog fill, deep crushed shadows, heavy vignette\"\n    },\n    \"technical\": {\n      \"angle\": \"eye-level, slight dutch tilt for unease\",\n      \"rendering\": \"faint CRT/VHS scanline grain, low-poly aliasing, affine texture warping\",\n      \"resolution\": \"PS1-era low-fidelity, 9:16 vertical\"\n    },\n    \"composition\": {\n      \"framing\": \"centered full-body, clear readable silhouette\",\n      \"subject_placement\": \"center frame, fog and dead streetlight behind\"\n    },\n    \"quality\": {\n      \"include\": [\n        \"voxel low-poly PS1 horror render\",\n        \"affine-warped textures\",\n        \"dithered grain\",\n        \"bubble-head bandaged nurse\",\n        \"lolling head\",\n        \"blood-stained nurse dress\",\n        \"jerky doll pose\",\n        \"flickering flashlight\",\n        \"9:16 vertical\",\n        \"PS1/PSX low-poly\",\n        \"chunky low polygon count\",\n        \"low-resolution dithered textures\",\n        \"heavy grain\",\n        \"dark murky limited detail\",\n        \"vertex wobble\",\n        \"Silent Hill 1 / Puppet Combo aesthetic\"\n      ],\n      \"avoid\": [\n        \"photorealistic\",\n        \"smooth modern CGI\",\n        \"glossy octane render\",\n        \"cartoon\",\n        \"anime\",\n        \"cute\",\n        \"sexy pinup\",\n        \"clear visible face\",\n        \"beauty filter\",\n        \"watermark\",\n        \"deformed hands\",\n        \"photorealistic\",\n        \"hyperdetailed\",\n        \"painterly\",\n        \"glossy\",\n        \"high-poly\",\n        \"ray traced\",\n        \"octane render\",\n        \"unreal engine 5\",\n        \"4k\",\n        \"sharp realistic skin\",\n        \"modern AAA graphics\"\n      ],\n      \"reference_standard\": \"PS1/PS2-era Silent Hill bubble-head nurse model, foggy survival-horror register\"\n    }\n  }\n}\n",
        "stage": "image"
      },
      {
        "slot": "char-samaritan",
        "text": "{\n  \"prompt\": {\n    \"scene\": {\n      \"description\": \"RETRO PS1/PSX LOW-POLY SURVIVAL-HORROR 3D GAME RENDER — chunky simplified low-poly geometry, low-resolution dithered textures, heavy film grain, dark and murky, limited detail, vertex wobble, affine texture warping; Silent Hill 1 / early Resident Evil / Puppet Combo / voxel look; NOT photorealistic, NOT high-detail, NOT painterly, NOT glossy. Full-body character reference, MATCH THE PROVIDED REFERENCE CHARACTER: a lean, unhinged survivor with long greasy dark hair, a grim deranged scowl and pale sunken eyes, wearing a dark worn coat, an AK-style assault rifle slung across his chest. At his throat hangs a NECKLACE STRUNG FROM SEVERED HUMAN FINGERS. Add blood spatter and grime on his hands, coat and face. Re-render him in the stylized voxel/PS1 look while keeping his face, hair, coat, rifle and finger-necklace faithful to the reference. Palette: dark teal-grey coat, greasy black hair, pale clammy skin, brown-red blood, cold fog grey.\",\n      \"subject\": \"lean unhinged survivor, long greasy dark hair, deranged scowl, pale sunken eyes, dark worn coat, AK-style rifle slung, necklace of severed human fingers, blood and grime\",\n      \"setting\": \"foggy dead-town street at night\",\n      \"action\": \"standing, gripping the slung rifle, menacing stare\"\n    },\n    \"style\": {\n      \"primary\": \"retro PS1/PSX 5th-gen-console low-poly survival-horror 3D game render\",\n      \"rendering_quality\": \"very low fidelity, low polygon count, chunky simplified geometry, flat low-res dithered textures, heavy grain; NOT photorealistic, NOT high-detail, NOT painterly, NOT glossy\",\n      \"surface_textures\": \"low-res dithered coat and skin textures, greasy hair, crusted blood\",\n      \"lighting\": \"cold grey fog fill, low moody key, deep crushed shadows, heavy vignette\"\n    },\n    \"technical\": {\n      \"angle\": \"eye-level, slight low angle\",\n      \"rendering\": \"faint CRT/VHS scanline grain, low-poly aliasing, affine texture warping\",\n      \"resolution\": \"PS1-era low-fidelity, 9:16 vertical\"\n    },\n    \"composition\": {\n      \"framing\": \"centered full-body, clear readable silhouette\",\n      \"subject_placement\": \"center frame, fog behind\"\n    },\n    \"quality\": {\n      \"include\": [\n        \"voxel low-poly PS1 horror render\",\n        \"affine-warped textures\",\n        \"dithered grain\",\n        \"long greasy hair\",\n        \"deranged scowl\",\n        \"AK-style rifle slung\",\n        \"necklace of severed human fingers\",\n        \"blood spatter and grime\",\n        \"9:16 vertical\",\n        \"PS1/PSX low-poly\",\n        \"chunky low polygon count\",\n        \"low-resolution dithered textures\",\n        \"heavy grain\",\n        \"dark murky limited detail\",\n        \"vertex wobble\",\n        \"Silent Hill 1 / Puppet Combo aesthetic\"\n      ],\n      \"avoid\": [\n        \"photorealistic\",\n        \"smooth modern CGI\",\n        \"glossy octane render\",\n        \"cartoon\",\n        \"anime\",\n        \"clean\",\n        \"friendly\",\n        \"handsome\",\n        \"beauty filter\",\n        \"watermark\",\n        \"deformed hands\",\n        \"photorealistic\",\n        \"hyperdetailed\",\n        \"painterly\",\n        \"glossy\",\n        \"high-poly\",\n        \"ray traced\",\n        \"octane render\",\n        \"unreal engine 5\",\n        \"4k\",\n        \"sharp realistic skin\",\n        \"modern AAA graphics\"\n      ],\n      \"reference_standard\": \"PS1-era survival-horror hostile-survivor model; match the supplied character reference\"\n    }\n  }\n}\n",
        "stage": "image"
      },
      {
        "slot": "char-samaritan",
        "text": "Full-body CHARACTER REFERENCE on a plain dark background, Chilla's Art / Fears to Fathom PS1/PS2 style, flat grainy muted low-poly, NOT cinematic. Recreate EXACTLY the lean armed survivor standing on the RIGHT side of the reference image — long greasy dark hair, pale gaunt sunken face, dark worn long coat, an AK-style rifle slung across his chest, and a necklace of severed human fingers at his throat. Same man, full body head-to-boots, centered, neutral standing pose. 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "hub",
        "text": "Generate a screenshot from a first-person horror video game with NO interface/HUD, in voxel graphics in the style of PS1 (chunky low-poly geometry, low-resolution dithered textures, affine texture warping, vertex wobble, heavy grain, dark and murky). Render CHARACTERS and ENVIRONMENT at the SAME crude low-poly fidelity — no character more detailed than the scene. Characters FULL BODY, not cropped.\n\nComposition: first-person POV on a foggy abandoned town street at night, ash falling, a distant air-raid siren, two paths branching. The hero's blocky low-poly LEFT HAND holds a FLASHLIGHT in the foreground. The TWO guides stand CLOSE to the camera, large and clearly visible (they double as the video thumbnail — frame them big, not far away).\n\nLEFT path — the bubble-head NURSE: face wrapped in blood-stained bandages, head lolling, a short blood-stained nurse's dress, twitching doll-like pose, holding a flickering flashlight.\n\nRIGHT path — the SAMARITAN: a lean unhinged man with long greasy dark hair, a dark worn coat, an AK-style assault rifle slung across his chest, and a necklace strung from severed human fingers.\n\nThick grey fog, weak warm flashlight glow, a dead streetlight.\n\nFRAMING — MATCH THE SECOND REFERENCE IMAGE FOR SCALE & PLACEMENT ONLY (do NOT copy its content, characters or any text): the two guides stand side by side facing the camera, FULL BODY from head to feet, LARGE and CLOSE so they fill most of the vertical frame — feet visible near the bottom, heads near the top, the foggy street receding between and behind them. This is the opening 'hook' character-select shot; characters must be big, bright and instantly readable in the very first frame. Do NOT crop legs or feet. 9:16 vertical.\n",
        "stage": "image"
      },
      {
        "slot": "hub-ftf",
        "text": "Generate a screenshot from a first-person horror video game with NO interface/HUD, rendered in the EXACT visual style of CHILLA'''S ART and FEARS TO FATHOM indie PS1/PS2 horror games — flat restrained lighting, heavy film grain and VHS noise, a muted desaturated palette, low-resolution textures, low-poly 3D models with realistic proportions, slightly soft/blurred, a mundane found-footage indie-horror-game look; NOT voxel, NOT cube-based, NOT cinematic, NOT dramatic, NOT painterly, NOT AAA (chunky low-poly geometry, low-resolution dithered textures, affine texture warping, vertex wobble, heavy grain, dark and murky). Render CHARACTERS and ENVIRONMENT at the SAME crude low-poly fidelity — no character more detailed than the scene. Characters FULL BODY, not cropped.\n\nComposition: first-person POV on a foggy abandoned town street at night, ash falling, a distant air-raid siren, two paths branching. The hero's blocky low-poly LEFT HAND holds a FLASHLIGHT in the foreground. The TWO guides stand CLOSE to the camera, large and clearly visible (they double as the video thumbnail — frame them big, not far away).\n\nLEFT path — the bubble-head NURSE: face wrapped in blood-stained bandages, head lolling, a short blood-stained nurse's dress, twitching doll-like pose, holding a flickering flashlight.\n\nRIGHT path — the SAMARITAN: a lean unhinged man with long greasy dark hair, a dark worn coat, an AK-style assault rifle slung across his chest, and a necklace strung from severed human fingers.\n\nThick grey fog, weak warm flashlight glow, a dead streetlight.\n\nFRAMING — MATCH THE SECOND REFERENCE IMAGE FOR SCALE & PLACEMENT ONLY (do NOT copy its content, characters or any text): the two guides stand side by side facing the camera, FULL BODY from head to feet, LARGE and CLOSE so they fill most of the vertical frame — feet visible near the bottom, heads near the top, the foggy street receding between and behind them. This is the opening 'hook' character-select shot; characters must be big, bright and instantly readable in the very first frame. Do NOT crop legs or feet. 9:16 vertical.\n",
        "stage": "image"
      },
      {
        "slot": "hub-lowpoly",
        "text": "Generate a screenshot from a first-person horror video game with NO interface/HUD, in PURE LOW-POLY PS1/PSX graphics (smooth-shaded triangulated low-poly 3D models like real PlayStation-1 games, NOT voxel, NOT cube-based, NOT minecraft, NOT painterly) (clean low-poly triangulated geometry, low-resolution dithered textures, affine texture warping, vertex wobble, heavy grain, dark and murky). Render CHARACTERS and ENVIRONMENT at the SAME crude low-poly fidelity — no character more detailed than the scene. Characters FULL BODY, not cropped.\n\nComposition: first-person POV on a foggy abandoned town street at night, ash falling, a distant air-raid siren, two paths branching. The hero's blocky low-poly LEFT HAND holds a FLASHLIGHT in the foreground. The TWO guides stand CLOSE to the camera, large and clearly visible (they double as the video thumbnail — frame them big, not far away).\n\nLEFT path — the bubble-head NURSE: face wrapped in blood-stained bandages, head lolling, a short blood-stained nurse's dress, twitching doll-like pose, holding a flickering flashlight.\n\nRIGHT path — the SAMARITAN: a lean unhinged man with long greasy dark hair, a dark worn coat, an AK-style assault rifle slung across his chest, and a necklace strung from severed human fingers.\n\nThick grey fog, weak warm flashlight glow, a dead streetlight.\n\nFRAMING — MATCH THE SECOND REFERENCE IMAGE FOR SCALE & PLACEMENT ONLY (do NOT copy its content, characters or any text): the two guides stand side by side facing the camera, FULL BODY from head to feet, LARGE and CLOSE so they fill most of the vertical frame — feet visible near the bottom, heads near the top, the foggy street receding between and behind them. This is the opening 'hook' character-select shot; characters must be big, bright and instantly readable in the very first frame. Do NOT crop legs or feet. 9:16 vertical.\n",
        "stage": "image"
      },
      {
        "slot": "hub-vid",
        "text": "Static first-person POV idle shot of the fog-drowned dead street. Thick grey fog drifts slowly, ash falls steadily, a distant siren moans. On the left the bandaged nurse stands twitching in place, head lolling side to side, her flashlight stuttering on and off. On the right the gaunt long-haired man shifts his weight nervously, rifle half-raised, scanning the fog around him. Subtle handheld sway only, no camera travel — an idle loop feel. Low-poly hand holding a flickering flashlight at frame bottom. PS1 survival-horror game footage, heavy film grain, muted desaturated palette.",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "scene-a02-follow-nurse",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted low-poly, UNIFORM low fidelity, NOT cinematic. You follow the twitching bubble-head NURSE deeper down a fog-drowned dead-town street at night, her flickering flashlight stuttering ahead, ash drifting. IMPORTANT: blocky low-poly first-person POV HAND holding a flashlight in the foreground. 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-a02-follow-nurse-vid",
        "text": "The bandaged nurse figure twitch-walks ahead deeper into the thick grey fog, head lolling side to side, jerky doll-like steps, her flashlight stuttering on and off. First-person POV follow shot with handheld walking bob, low-poly hand holding a flickering flashlight visible at frame bottom. PS1 survival-horror game footage, heavy film grain, muted desaturated palette, ash falling. Slow push forward following her.",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "scene-a03-fork-siren",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted low-poly, UNIFORM low fidelity, NOT cinematic. A siren wails and the world begins peeling toward the rusted Otherworld; the nurse suddenly drops flat to the ground and freezes. IMPORTANT: blocky low-poly first-person POV HAND with flashlight in the foreground. 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-a03-fork-siren-vid",
        "text": "@Image1 as the first frame, @Image2 as the last frame. 0-1s: an air-raid siren wails — the world begins peeling into the Otherworld, walls flaking into blood-rust, red emergency dark bleeding across the street. 1-3s: the bandaged nurse abruptly drops flat to the ground face-down and freezes completely rigid, like a switched-off doll. 3-4s: hold on her motionless body, the street fully rusted, red light pulsing slowly. First-person POV, fearful handheld sway, one hesitant step back. PS1 survival-horror game footage, heavy film grain.",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "scene-a04-death-run",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted low-poly, UNIFORM low fidelity, NOT cinematic. You ran instead of dropping — the rusted Otherworld surges over the POV, chain-link and flaking blood-rust closing in, flaying you. IMPORTANT: blocky low-poly first-person POV HANDS up against the surging Otherworld. 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-a04-death-run-vid",
        "text": "@Image1 as the first frame, @Image2 as the last frame. A death scene — you try to flee and are instantly caught, you never get more than one step away. 0-1s: you spin around to run but the Otherworld erupts right on top of you — walls peel into rusted chain-link grating and flaking blood-rust, red emergency dark floods the street. 1-3s: the darkness itself lunges at the camera — black tendrils and rusted grating snap across the frame and seize you, the camera is violently yanked backward off its feet, view tilting up as you are dragged down. 3-4s: the surge swallows the lens completely, red-black churn fills the frame. First-person POV, violent handheld shake, PS1 survival-horror game footage, heavy film grain, heavy vignette.",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "scene-a05-passed",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted low-poly, UNIFORM low fidelity, NOT cinematic. You held flat on the ground like the nurse; the nightmare wave of rust and shadow sweeps over and past you, the street settling. IMPORTANT: blocky low-poly first-person POV HANDS flat on the wet asphalt, flashlight beside them. 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-a05-passed-vid",
        "text": "First-person POV lying flat on the ground, view low across the rusted street surface, holding completely still. The nightmare sweeps overhead — shadows and red light crawl across the ground, ash and dust whip past, a deep rumble passes over the camera. In the final second the surge fades: the red drains away and the street settles back into grey fog and silence. Camera trembling very slightly, staying down the whole time. PS1 survival-horror game footage, heavy film grain, muted desaturated palette.",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "scene-a06-fork-door",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted low-poly, UNIFORM low fidelity, NOT cinematic. The nurse wedges herself in and claws at a grimy jammed door, ignoring an open inviting doorway beside it. IMPORTANT: blocky low-poly first-person POV HAND with flashlight toward the two doors. 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-a06-fork-door-vid",
        "text": "The bandaged nurse wedges herself against the jammed door and claws at it with jerky doll-like movements — wrenching the handle, slamming her shoulder into it, head lolling — completely ignoring the open doorway gaping pitch black right beside it. First-person POV standing behind her, handheld sway, flashlight beam flickering across both doorframes. Thick grey fog, ash falling. PS1 survival-horror game footage, heavy film grain, muted desaturated palette.",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "scene-a07-death-opendoor",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted low-poly, UNIFORM low fidelity, NOT cinematic. You took the open inviting doorway — it drops away into a black Otherworld pit and the POV falls into rusted darkness. IMPORTANT: blocky low-poly first-person POV HANDS grabbing at the doorframe as you fall. 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-a07-death-opendoor-vid",
        "text": "@Image1 as the first frame, @Image2 as the last frame. A death scene — you are instantly caught, you never get more than one step inside. 0-1s: you step through the open inviting doorway into the pitch dark. 1-3s: the floor drops away beneath you — the camera plunges down into a rust-red Otherworld void, chain-link grating and flaking blood-rust walls rushing upward past the lens, violent shake. 3-4s: the fall swallows the lens, red-black churn fills the frame to black. First-person POV, PS1 survival-horror game footage, heavy film grain, heavy vignette.",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "scene-a08-through",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted low-poly, UNIFORM low fidelity, NOT cinematic. You forced the jammed door the nurse clawed at and step through into a dim corridor behind her. IMPORTANT: blocky low-poly first-person POV HANDS shoving the jammed door open, flashlight in one. 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-a08-through-vid",
        "text": "You shove against the jammed door alongside the bandaged nurse and force it open; it wrenches free and you push through into a dark rust-streaked interior, the nurse twitching in ahead of you. First-person POV, handheld bob as you step through the doorway, flashlight beam swinging across grimy walls. PS1 survival-horror game footage, heavy film grain, muted desaturated palette.",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "scene-a09-fork-dark",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted low-poly, UNIFORM low fidelity, NOT cinematic. A clear CHOICE of two distinct visible options: on the LEFT the bubble-head NURSE stands beckoning into a pitch-black doorway; on the RIGHT a door stands slightly AJAR with a clear sliver of the foggy street and town gate visible through the gap (the way out). The viewer must instantly read the two options. IMPORTANT: blocky low-poly first-person POV HAND with flashlight between the two doors. 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-a09-fork-dark-vid",
        "text": "At what looks like the exit, the bandaged nurse jerks toward a black open doorway and beckons you in with a stiff doll-like wave of her arm, repeating the gesture, head lolling. Something feels wrong. First-person POV standing still, hesitant handheld sway, flashlight flickering on her and the pitch-black doorway. PS1 survival-horror game footage, heavy film grain, muted desaturated palette.",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "scene-a09b-death-follow",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted low-poly, UNIFORM low fidelity, NOT cinematic. You followed the nurse through the black doorway and it opens into a hidden room drenched in blood — flayed red walls, hanging slabs of meat, gore on the floor — and the bubble-head nurse turns and lunges, killing the POV. A horrific bloody reveal behind the door. IMPORTANT: blocky low-poly first-person POV HANDS thrown up as the nurse lunges, the flashlight beam jerking across the bloody room. 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-a09b-death-follow-vid",
        "text": "A death scene — you are instantly caught, you never get more than one step. 0-1s: first-person POV, you step forward through the black open doorway after the bandaged nurse, into pitch darkness. 1-3s: out of the dark her bandaged arms snap out and seize the camera, dragging the lens violently forward and down, frantic handheld shake, a glimpse of stained bandages and twitching limbs. 3-4s: darkness floods the frame completely to black. PS1 survival-horror game footage, heavy film grain, heavy vignette, muted desaturated palette.",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "scene-a10-end",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted low-poly, UNIFORM low fidelity, NOT cinematic. You broke away from the nurse for the first time and bolt aside, reaching the fog-bound town gates opening to dim safety. IMPORTANT: blocky low-poly first-person POV HAND with flashlight, gates ahead. 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-a10-end-vid",
        "text": "First-person POV running straight forward through the last of the fog toward the rusted town gates directly ahead. The gates grow steadily closer and larger, grey daylight bleeding in beyond them, the Otherworld textures falling away behind. Steady forward sprint, handheld running bob, flashlight beam bouncing ahead, no turning. PS1 survival-horror game footage, heavy film grain, muted desaturated palette settling toward calmer grey.",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "scene-b11-with-sam",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted low-poly, UNIFORM low fidelity, NOT cinematic. The man MUST be the SAME samaritan as the character reference exactly — long greasy dark hair, pale gaunt face, dark worn long coat, AK-style rifle slung, necklace of severed human fingers. He waves you on down a foggy dead-town street, twitchy, checking the shadows, AK ready. IMPORTANT: blocky low-poly first-person POV HAND holding a flashlight in the foreground. 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-b11-with-sam-vid",
        "text": "First-person POV following a few steps behind a gaunt long-haired man through a foggy ruined street. He waves you forward with his rifle, twitchy and tense, turning to check shadows in the fog as he advances, his finger-bone necklace swinging. Handheld walking bob, flashlight beam sweeping across the fog, ash falling, dead streetlights. PS1 / early-3D survival-horror game footage look, affine-warped low-poly textures, heavy film grain, muted desaturated palette, no music.",
        "model": "kwaivgi/kling-v3.0-pro",
        "stage": "i2v"
      },
      {
        "slot": "scene-b12-fork-wounded",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted low-poly, UNIFORM low fidelity, NOT cinematic. SAME samaritan as the character reference (long greasy hair, dark long coat, AK, finger-necklace). A wounded survivor lies crying for help on the ground ahead; the samaritan coldly signals to leave them and keep moving, gun half-raised. IMPORTANT: blocky low-poly first-person POV HAND with flashlight on the wounded figure. 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-b12-fork-wounded-vid",
        "text": "A held choice-moment, idle, nobody commits. First-person POV standing still in the foggy street. A wounded survivor lies on the ground a few steps ahead, reaching a hand toward you and crying weakly for help, writhing faintly in place. Behind him the gaunt long-haired man stands tense and half-turned, gesturing flatly for you to leave, rifle ready, eyes flicking between you and the fog. Neither of them walks away — both stay rooted in frame. Subtle handheld sway only, fog drifting, ash falling, flashlight trembling between the wounded man and the guide. The camera does NOT advance and NO ONE exits the frame — a frozen, tense standoff presenting the choice. PS1 survival-horror game footage, heavy film grain, muted desaturated palette.",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "scene-b13-death-help",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted low-poly, UNIFORM low fidelity, NOT cinematic. Match the SAME location, lighting, fog and style as the reference image (the wounded-survivor street spot). You knelt to help the wounded figure, but it was a turned husk; it rears up and seizes the POV right there as other shapes close in from the fog. Keep the exact same street/location as the reference. IMPORTANT: blocky low-poly first-person POV HANDS grabbed by the husk, flashlight skidding away. 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-b13-death-help-vid",
        "text": "A death scene — you are instantly caught, you never get more than one step. 0-1s: first-person POV, you crouch and reach down toward the wounded survivor on the ground to help him. 1-3s: his face splits into a gaping turned-husk maw, his arms snap up and clamp onto the camera, yanking the lens down toward him, violent handheld shake; more husk shapes lunge in from the fog on every side, a kill-box closing. 3-4s: they swarm over the lens, the frame is dragged into black. PS1 / early-3D survival-horror game footage look, affine-warped low-poly textures, heavy film grain, muted desaturated palette, no music.",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "scene-b14-moved",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted low-poly, UNIFORM low fidelity, NOT cinematic. SAME samaritan as the character reference exactly (long greasy hair, pale gaunt face, dark long coat, AK slung, finger-necklace). You left the wounded and follow his cold call through the fog; he gives a curt approving nod. IMPORTANT: blocky low-poly first-person POV HAND with flashlight in the foreground. 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-b14-moved-vid",
        "text": "First-person POV moving on through the fog, leaving the wounded figure behind and following the gaunt long-haired man as he advances ahead. He glances back over his shoulder and gives a single curt approving nod, then turns and keeps scanning the shadows, rifle ready. Handheld walking bob, flashlight sweeping the fog. PS1 / early-3D survival-horror game footage look, affine-warped low-poly textures, heavy film grain, muted desaturated palette, no music.",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "scene-b15-fork-lurker",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted low-poly, UNIFORM low fidelity, NOT cinematic. SAME samaritan as the character reference (greasy hair, dark long coat, AK, finger-necklace). A shambling lurker monster crosses the only foggy path ahead; the samaritan grips your shoulder, hand up — 'on my mark' — the lurker drawing closer. IMPORTANT: blocky low-poly first-person POV HAND with flashlight, held tense and still. 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-b15-fork-lurker-vid",
        "text": "A held choice-moment, tense and idle, nobody commits. First-person POV stopped on the path. A shambling lurker creature blocks the only way through the fog ahead, drifting slowly closer. The gaunt long-haired man grips your shoulder hard and holds you in place, rifle half-raised, mouthing 'on my mark, NOT before', eyes locked on the creature. You do NOT move and he does NOT release you — both held rooted in frame; only the lurker creeps nearer. Tense handheld stillness, flashlight trembling on the creature. PS1 / early-3D survival-horror game footage look, affine-warped low-poly textures, heavy film grain, muted desaturated palette, no music.",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "scene-b16-death-runnow",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted low-poly, UNIFORM low fidelity, NOT cinematic. Continue the SAME foggy street and the SAME shambling lurker monster as the reference image (the fork). You bolted too early — the lurker snaps around and lunges, its jaws/limbs seizing the POV in the fog. IMPORTANT: blocky low-poly first-person POV HANDS up against the lunging lurker (flashlight jerking). 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-b16-death-runnow-vid",
        "text": "PS1 first-person survival-horror game footage, one continuous handheld shot, 9:16. A fog-choked ruined street, the way ahead half-blocked by a shambling lurker creature. THROUGHOUT, never stopping: thick grey fog rolls and churns across the whole frame, fine ash drifts down steadily, dead overhead wires and a hanging signboard sway, the low-poly hand's flashlight beam jitters and flickers a trembling cone through the haze; the camera carries a constant nervous breath-bob. The lurker is ALIVE from the first frame: it sways and lists on the spot, head lolling loose on its neck, slack jaw working open and shut, long arms twitching and hanging, dragging slow shambling half-steps as it senses you. 0-1.5s: a death scene — you panic and tear free early, against the guide's grip, bolting forward toward the narrow gap beside the creature; the camera lunges ahead with a hard running bob, fog whipping past. 1.5-3s: instantly caught, barely one step — the lurker's head snaps round and it lunges, long limbs whipping out to clamp onto the lens, the camera violently yanked sideways and down toward its gaping tooth-ringed maw, frantic shaking, a smear of grey flesh and bone filling the frame. 3-4s: it drags the lens down into its dark, the frame collapses to black. Style: PS1 / early-3D, affine-warped low-poly textures, chunky geometry, heavy film grain and VHS noise, muted desaturated grey-green palette, heavy vignette, no music.",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "scene-b17-slipped",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted low-poly, UNIFORM low fidelity, NOT cinematic. SAME samaritan as the character reference. On his mark you have both crept silently PAST the lurker and now move on into open fog beyond it — calmer, the threat receding behind you. IMPORTANT: blocky low-poly first-person POV HAND with flashlight low, creeping forward. 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-b17-slipped-vid",
        "text": "First-person POV. On the man's silent mark you both move together, slipping quietly past the lurker through the fog while its back is turned. He guides you forward with a low flat hand gesture, tense, rifle ready. Slow careful handheld creep forward, flashlight dimmed low, breath held. PS1 / early-3D survival-horror game footage look, affine-warped low-poly textures, heavy film grain, muted desaturated palette, no music.",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "scene-b18-fork-digin",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted low-poly, UNIFORM low fidelity, NOT cinematic. SAME samaritan as the character reference (greasy hair, dark long coat, AK, finger-necklace). Safe-zone lights glow ahead but the siren judders the world; the paranoid samaritan seizes up and gestures hard for you to dig into a nook and wait, terrified. IMPORTANT: blocky low-poly first-person POV HAND with flashlight toward the distant safe-zone lights. 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-b18-fork-digin-vid",
        "text": "A held choice-moment, tense and idle, nobody commits. First-person POV. Safe-zone lights glow faintly ahead through the fog, but the world judders and flickers as a siren rises. The gaunt long-haired man seizes up with paranoia, gripping you and gesturing urgently down into a nook to hide and wait, shaking his head, mouthing 'we dont move'. Neither of you advances — both held rooted between the distant lights and his frightened insistence. Unsteady handheld sway only; the camera does NOT move toward the lights; a frozen standoff. PS1 / early-3D survival-horror game footage look, affine-warped low-poly textures, heavy film grain, muted desaturated palette, no music.",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "scene-b18b-death-wait",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted low-poly, UNIFORM low fidelity, NOT cinematic. SAME samaritan as the character reference. You waited with him as he trained you — the rusted Otherworld floods the nook and engulfs both the POV and the samaritan in chain-link and rust. IMPORTANT: blocky low-poly first-person POV HANDS up as the Otherworld closes in. 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-b18b-death-wait-vid",
        "text": "A death scene — you are instantly caught, you never get more than one step. 0-1s: first-person POV, you hunker down into the nook beside the man and wait as he ordered. 1-3s: the Otherworld floods in — the walls peel into rusted blood-rust grating, red emergency dark pours over the nook, rusted tendrils erupt and seize the camera, dragging the lens down and back, violent shake. 3-4s: the red-black surge swallows the lens completely to black. PS1 / early-3D survival-horror game footage look, affine-warped low-poly textures, heavy film grain, muted desaturated palette, no music.",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "scene-b19-end",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted low-poly, UNIFORM low fidelity, NOT cinematic. SAME samaritan as the character reference exactly (long greasy hair, dark long coat, AK slung, finger-necklace). You defied his paralysis, broke for the safe-zone lights dragging him along, and make it inside the lit gate; he gives a grim approving nod. IMPORTANT: blocky low-poly first-person POV HAND reaching into the warm safe-zone light. 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-b19-end-vid",
        "text": "First-person POV running straight forward toward the glowing safe-zone lights directly ahead, dragging the gaunt long-haired man along by the arm out of the dark behind you. The warm lights grow steadily closer and larger as you burst into the lit safe zone; the Otherworld falls away behind. He steadies, breathing hard, and gives you a single grim approving nod. Steady forward sprint, handheld bob, no turning, flashlight bouncing, light growing warmer ahead. PS1 / early-3D survival-horror game footage look, affine-warped low-poly textures, heavy film grain, muted desaturated palette, no music.",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "scene-b20-idle-bright-vid",
        "text": "First-person POV facing the gaunt long-haired man as he stands still at the open gates, breathing, relieved, idle with small natural movements. Across the shot the thick grey fog slowly dissipates and lifts away behind him, the dead night sky gradually brightens into a calm clear blue daytime sky, and the ruined town beyond the gates resolves into an ordinary peaceful sunlit city street with clean buildings and soft warm daylight — the horror is gone. He stays calm, faint relief, steam clearing around him. PS1 / early-3D survival-horror game look with light film grain, but by the end bright, warm, calm daylight, blue sky, no fog, no menace, no music.",
        "model": "kwaivgi/kling-v3.0-pro",
        "stage": "i2v"
      }
    ],
    "recipes": [
      {
        "kind": "bake",
        "name": "ffmpeg-xfade-master"
      },
      {
        "kind": "overlay",
        "name": "vhs-pause-freeze"
      },
      {
        "kind": "overlay",
        "name": "smpte-countdown-disc"
      },
      {
        "kind": "ffmpeg",
        "name": "old-radio-ps1-vo"
      },
      {
        "kind": "overlay",
        "name": "chroma-split"
      },
      {
        "kind": "encode",
        "name": "film-grain"
      },
      {
        "kind": "overlay",
        "name": "burned-captions"
      },
      {
        "kind": "overlay",
        "name": "voxel-dither"
      }
    ],
    "scenario": {
      "scenes": [
        {
          "id": "scene-a09-fork-dark"
        },
        {
          "id": "scene-a09b-death-follow"
        },
        {
          "id": "scene-b13-death-help"
        },
        {
          "id": "scene-b14-moved"
        },
        {
          "id": "scene-b15-fork-lurker"
        },
        {
          "id": "scene-b17-slipped"
        },
        {
          "id": "scene-b18-fork-digin"
        },
        {
          "id": "scene-b18b-death-wait"
        },
        {
          "id": "scene-b19-end"
        },
        {
          "id": "scene-b11-with-sam"
        },
        {
          "id": "scene-b12-fork-wounded"
        },
        {
          "id": "scene-b14-moved"
        },
        {
          "id": "scene-b15-fork-lurker"
        },
        {
          "id": "scene-b17-slipped"
        },
        {
          "id": "scene-b18-fork-digin"
        },
        {
          "id": "scene-b18b-death-wait"
        },
        {
          "id": "scene-b19-end"
        },
        {
          "id": "scene-a02-follow-nurse"
        },
        {
          "id": "scene-a03-fork-siren"
        },
        {
          "id": "scene-a04-death-run"
        },
        {
          "id": "scene-a05-passed"
        },
        {
          "id": "scene-a06-fork-door"
        },
        {
          "id": "scene-a07-death-opendoor"
        },
        {
          "id": "scene-a08-through"
        },
        {
          "id": "scene-a09-fork-dark"
        },
        {
          "id": "scene-a09b-death-follow"
        },
        {
          "id": "scene-a10-end"
        },
        {
          "id": "scene-b11-with-sam"
        },
        {
          "id": "scene-b12-fork-wounded"
        },
        {
          "id": "scene-b13-death-help"
        },
        {
          "id": "scene-b14-moved"
        },
        {
          "id": "scene-b15-fork-lurker"
        },
        {
          "id": "scene-b16-death-runnow"
        },
        {
          "id": "scene-b17-slipped"
        },
        {
          "id": "scene-b18-fork-digin"
        },
        {
          "id": "scene-b18b-death-wait"
        },
        {
          "id": "scene-b19-end"
        }
      ],
      "storyboardMd": "# Choose Your Path — The Fog Town (Nurse vs Samaritan)\n\n**Project:** choose-silenthill-001 · 9:16 · TikTok · ~70s · EN VO + word-level captions\n**Template:** analog-horror-pick-a-door (branching mechanic) · **Style override:** voxel / PS1 foggy survival-horror render\n**Format origin:** choose-path-001 (validated). Reuses: two-guide hub → binary 50/50 forks (play→freeze→SMPTE timer→consequence) → branch payoff; voxel/PS1 register; vhs-pause-freeze + ffmpeg-xfade-master + old-radio-ps1-vo recipes; clone voice `NYIQTs8oBhYvzMr6zHTL`.\n**IP note:** HOMAGE to foggy survival-horror — generic dead fog-town, ORIGINAL names. NOT branded \"Silent Hill\"; no specific IP / no real person → reference-gate does not fire.\n\n## AESTHETIC LOCK (prepend to EVERY image prompt)\n> Chilla's Art / Fears to Fathom indie PS1-horror style (flat restrained lighting, heavy film grain/VHS, muted desaturated palette, low-res textures, low-poly with realistic proportions; style-ref workspace/references/ftf-chillas-style/; NOT voxel-cube, NOT cinematic, NOT painterly) — **foggy survival-horror** render, PS1 / early-3D affine-warped pixel textures, chunky low-poly geometry, dithered grainy textures, first-person POV with a blocky low-poly hand holding a **flickering flashlight**, an abandoned town drowned in **thick grey fog**, falling ash, dead streetlights, empty streets. When the **siren wails** the world peels into the **OTHERWORLD**: rusted chain-link grating, flaking blood-rust walls, exposed fans, red emergency dark. Heavy vignette, faint pixel/VHS grain. NOT photoreal, NOT smooth modern CGI, NOT cartoon-cute. 9:16 vertical.\n\nLock a **hub-master** anchor first (a foggy street with both guides), then pass it as `--ref` on every gen.\n\n## CAST (to lock as char masters)\n- **THE NURSE** — **classic Silent Hill bubble-head nurse**: face wrapped/obscured in blood-stained bandages, short stained nurse's dress, twitching jerky doll-like movements, head lolling, a flickering flashlight in hand. Terrifying to look at — and a **mostly-honest guide**: do what she does and you live… until the final beat, where blind mimicry kills you.\n- **THE SAMARITAN** — **lock from `refs/samaritan-ref.png`**: a lean man with **long, greasy dark hair**, a **grim, deranged scowl**, **pale sunken eyes**, a dark worn coat/jacket, and an **AK-style assault rifle** slung across him. Signature: a **necklace strung from severed human fingers** at his throat. **Add blood spatter / grime** on his hands, coat and face for extra menace. He *wants* to help, but he's volatile and suspicious of you — obey him and you live… until his fear itself becomes the trap and you must defy him.\n\n## MECHANIC\nOpen COLD on the foggy street. Idle loop + \"CHOOSE YOUR GUIDE\" + 3s film-leader countdown → commit. Each branch = a chain of binary 50/50 forks on a 3-2-1 SMPTE countdown. Wrong = ~2s hard-cut death beat. Right chain = escape.\n**TikTok one-shot watch — not interactive.** Punchy fast cuts, ~2s death beats, whole gauntlet in one pass.\n**Trap-logic (per branch, self-contained, neither telegraphs the other) — both are a \"trained, then twist\" arc; choices must NOT be solvable by plain common sense:**\n- **Nurse — \"copy her, until you can't\":** mimic her physical actions twice (right); on the 3rd, blindly copying her = death — you must finally break away. The first two deaths come from *not* copying and read as purely environmental — they must NOT reveal the nurse is a threat.\n- **Samaritan — \"obey him, until his fear gets you killed\":** obey the paranoid guide twice (right — even when it punishes naive compassion / panic); on the 3rd, his paranoid paralysis is the trap and you must defy him — he then approves and you escape together.\n\n---\n\n## CHOICE FLOW\n\n**HUB** — Fog-drowned dead town, ash falling, a distant siren. The NURSE (left) — silent, twitching, flickering flashlight. The SAMARITAN (right) — jumpy, sawn-off half-raised: \"stop… are you bit?\" 3-2-1 → pick a guide.\n\n### Branch A — went with THE NURSE · *copy her, until you can't*\n- **A1** — The siren wails; the world peels toward the Otherworld. The nurse drops flat and freezes.\n  - **A11 · RUN** (instinct — don't copy the scary thing). The Otherworld catches you, flays you. **Outcome: death.** *(purely environmental — nothing reveals the nurse)*\n  - **A12 · FREEZE like her** (copy, against instinct). The nightmare passes over you. **Outcome: continue.** ✅ *mimic #1*\n- **A2** — She wedges herself in and claws at a jammed door, ignoring the open inviting one beside it.\n  - **A21 · THE OPEN DOOR** (don't copy). It drops into the Otherworld. **Outcome: death.** *(environmental — nurse seems uninvolved)*\n  - **A22 · FORCE HER DOOR** (copy). **Outcome: continue.** ✅ *mimic #2*\n- **A3** — At what looks like the exit, the nurse jerks toward a black doorway and beckons with the same gesture as before. Something's off.\n  - **A31 · FOLLOW HER into the dark** (copy, as trained). **TWIST:** she / the dark seizes you. **Outcome: ☠ death** *(the reveal — you can't blindly follow even her).*\n  - **A32 · BREAK AWAY** (defy her for the first time, bolt aside). You reach the town gates. **Outcome: ★ survived.**\n\n### Branch B — went with THE SAMARITAN · *obey him, until his fear gets you killed* · choices are NOT common-sense-solvable\n- **B1** — A wounded survivor cries for help on the ground ahead. The samaritan coldly signals to leave them and move, gun ready.\n  - **B11 · HELP the wounded** (basic decency — \"obviously right\"). It's a lure / a turned husk — it grabs you; the spot's a kill-box. **Outcome: death.** *(naive compassion punished)*\n  - **B12 · LEAVE them, follow his cold call** (heartless, feels wrong). **Outcome: continue.** ✅ *obey #1*\n- **B2** — A lurker shambles across the only path in the fog. He grips your shoulder: \"on my mark. NOT before.\" It comes closer… closer.\n  - **B21 · RUN NOW** (it's right there — surely you must). You break early; it snaps onto you. **Outcome: death.** *(panic-instinct punished)*\n  - **B22 · WAIT for his mark** (agonizing, against instinct). He times it; you slip past. **Outcome: continue.** ✅ *obey #2*\n- **B3** — Final stretch, safe-zone lights ahead, but the world judders (siren). He seizes up with paranoia and orders you to dig in and wait: \"we don't move. it's not safe out there.\"\n  - **B31 · WAIT with him** (obey, as he trained you). The Otherworld floods the nook — you're taken. **Outcome: death.** *(the obedience he drilled is now the trap)*\n  - **B32 · GO — break for the lights, drag him with you** (defy his paralysis). You make the safe zone; inside, he gives a grim, approving nod. **Outcome: ★ survived — together.**\n\n---\n\n## SCENE LIST (production beats — ~17 beats × 2-4s ≈ 70s)\n\n### SHARED\n- **S01 · HUB / CHOOSE YOUR GUIDE** — foggy street, siren, ash. Floating labels `NURSE` (L) / `SAMARITAN` (R). \"CHOOSE YOUR GUIDE\" + 3-2-1 → \"YOU CHOSE: …\".\n\n### BRANCH A — NURSE\n- **A02 · FOLLOW THE NURSE** — she twitches ahead through the fog, flashlight stuttering; POV follows.\n- **A03 · FORK 1** — siren; world peels; she drops flat. Labels `RUN` / `FREEZE LIKE HER`. 3-2-1.\n- **A04 · DEATH — RUN** — the Otherworld surges over you. Hard cut. *(environmental)*\n- **A05 · PASSED (right)** — you hold flat; the horror sweeps past.\n- **A06 · FORK 2** — she claws the jammed door beside an open one. Labels `OPEN DOOR` / `FORCE HER DOOR`. 3-2-1.\n- **A07 · DEATH — OPEN DOOR** — it drops into the Otherworld. Hard cut. *(environmental)*\n- **A08 · THROUGH (right)** — you force her door, follow her in.\n- **A09 · FORK 3** — she beckons into a black doorway, same gesture. Labels `FOLLOW HER` / `BREAK AWAY`. 3-2-1.\n  - **A09b · DEATH — FOLLOW HER** — she / the dark seizes you. Hard cut. *(the twist)*\n- **A10 · GOOD ENDING (Nurse)** — you break aside and reach the town gates. SURVIVED.\n\n### BRANCH B — SAMARITAN\n- **B11 · WITH THE SAMARITAN** — he waves you on, twitchy, checking every shadow.\n- **B12 · FORK 1** — a wounded survivor cries for help; he signals to leave them. Labels `HELP THEM` / `LEAVE THEM`. 3-2-1.\n- **B13 · DEATH — HELP THEM** — it's a lure; it grabs you. Hard cut.\n- **B14 · MOVED ON (right)** — you leave them; he gives a curt nod.\n- **B15 · FORK 2** — a lurker crosses the path; \"on my mark.\" Labels `RUN NOW` / `WAIT FOR MARK`. 3-2-1.\n- **B16 · DEATH — RUN NOW** — you break early; it snaps onto you. Hard cut.\n- **B17 · SLIPPED PAST (right)** — on his mark you both ghost by.\n- **B18 · FORK 3** — siren; he seizes up, orders you to dig in. Labels `WAIT WITH HIM` / `GO FOR THE LIGHTS`. 3-2-1.\n  - **B18b · DEATH — WAIT WITH HIM** — the Otherworld floods the nook. Hard cut. *(the twist)*\n- **B19 · GOOD ENDING (Samaritan)** — you bolt for the lights, drag him along, reach the safe zone; he nods, grim approval. SURVIVED — together.\n\n---\n\n## VO (EN, eerie low narrator — retimed at compose)\n- Hub: \"Two guides in the fog. One terrifies you. One you can't read. You've got three seconds.\"\n- A (nurse): \"She's wrong in every way. Do exactly what she does… right up until you shouldn't.\"\n- B (samaritan): \"He's twitchy, armed, and scared of you. Obey him… until his fear is the thing that gets you killed.\"\n- Endings: \"You found the way out.\" / CTA: \"The monster or the madman — who'd you follow? Tell me below.\"\n\n## STACK\n- Image anchors: `openai/gpt-5.4-image-2` --size 1080x1920 (9:16), --ref hub-master (+ NURSE / SAMARITAN char masters). Fire in parallel (no cap).\n- i2v: `bytedance/seedance-2.0` (stylized → passes privacy filter; fog walk, world-peel transition, drop-flat, door force, lurker, bolt-for-lights). ~4s clips.\n- VO: reuse clone `NYIQTs8oBhYvzMr6zHTL`, old-radio/PS1 filter. Music: low fog drone + Otherworld industrial scrape (ElevenLabs Music, no artist names). SFX: town siren, flashlight buzz, ash wind, lurker groan, sawn-off rack, soft countdown beeps.\n- Captions: word-level white-bold bottom-center, fed from VO; snap to Scribe word `startMs`.\n- Compose: HyperFrames, ONE opacity-gated composition; transitions + play-then-freeze baked into the master via ffmpeg (xfade + tpad); SMPTE countdown disc + floating labels + DEATH flash; overlays clear BEFORE the dissolve. The siren world-peel is a strong transition cue between fog↔Otherworld.\n\n## NOTES\n- Both branches are \"trained, then twist\" arcs ending on *defy your guide* — but the texture differs: the nurse punishes blind **mimicry** (and is malicious at the reveal), the samaritan punishes blind **obedience** (and approves when you defy, you escape together). Choices must stay ambiguous — never solvable by plain common sense.\n- Nurse's first two deaths must read as purely environmental (do NOT reveal she's a threat) so the A3 betrayal lands.\n- Homage, not brand: original names, generic fog-town + Otherworld. No IP, no real person → reference-gate does not fire.\n- Generate order: hub-master → NURSE + SAMARITAN char masters → Branch A anchors → Branch B anchors. Gate per checkpoint, wait for \"go\" before paid gen.\n"
    },
    "createdAt": "2026-06-04T03:20:14.392Z",
    "modelStack": [
      {
        "model": "bytedance/seedance-2.0",
        "stage": "i2v",
        "params": {
          "resolution": "720p",
          "aspect_ratio": "9:16",
          "duration_sec": 4
        },
        "costUsd": 13.72
      },
      {
        "model": "kwaivgi/kling-v3.0-pro",
        "stage": "i2v",
        "params": {
          "resolution": "720p",
          "aspect_ratio": "9:16",
          "duration_sec": 4
        },
        "costUsd": 2.24
      },
      {
        "model": "openai/gpt-5.4-image-2",
        "stage": "image",
        "params": {
          "size": "1080x1920"
        },
        "costUsd": 10
      },
      {
        "model": "ffmpeg/compress-social",
        "stage": "video"
      },
      {
        "model": "hyperframes-render",
        "stage": "video"
      }
    ],
    "composition": {
      "file": "index.html",
      "html": "<!doctype html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\" />\n<style>\n  @font-face { font-family: 'Pixelify'; src: url('assets/fonts/PixelifySans-VF.ttf') format('truetype'); font-weight: 400 700; font-style: normal; font-display: block; }\n  * { margin: 0; padding: 0; box-sizing: border-box; }\n  html, body { width: 1080px; height: 1920px; background: #000; overflow: hidden; }\n  #root { position: relative; width: 1080px; height: 1920px; background: #000; font-family: 'Pixelify', 'Courier New', monospace; }\n  .vid { position: absolute; inset: 0; width: 1080px; height: 1920px; object-fit: cover; display: block; z-index: 1; }\n  #vhs { position: absolute; inset: 0; z-index: 38; pointer-events: none; opacity: 0; }\n  #vcr { position: absolute; inset: 0; width: 100%; height: 100%; image-rendering: pixelated; opacity: 0.45; }\n  #vhs .scan { position: absolute; inset: 0;\n    background: linear-gradient(rgba(0,0,0,0) 50%, rgba(0,0,0,0.32) 50%), linear-gradient(90deg, rgba(255,0,0,0.05), rgba(0,255,0,0.02), rgba(0,0,255,0.05));\n    background-size: 100% 3px, 4px 100%; }\n  #vhs .tint { position: absolute; inset: 0; background: rgba(40,46,54,0.10); }\n  #vhs .pause { position: absolute; top: 54px; left: 60px; font-size: 46px; letter-spacing: 5px; color: #f3eee0; text-shadow: 0 0 12px rgba(0,0,0,0.95), 0 3px 8px #000; }\n  #vhs .pause b { letter-spacing: 0; margin-right: 14px; }\n  .grain { position: absolute; inset: 0; z-index: 40; pointer-events: none; background: repeating-linear-gradient(to bottom, rgba(0,0,0,0) 0 2px, rgba(0,0,0,0.20) 2px 3px); mix-blend-mode: multiply; opacity: 0.5; }\n  .vignette { position: absolute; inset: 0; z-index: 41; pointer-events: none; background: radial-gradient(118% 88% at 50% 46%, rgba(0,0,0,0) 50%, rgba(0,0,0,0.6) 100%); }\n  #title { position: absolute; z-index: 30; left: 0; right: 0; top: 130px; text-align: center; font-size: 76px; letter-spacing: 6px; color: #f3eee0; opacity: 0; text-shadow: 0 0 24px rgba(0,0,0,0.95), 0 4px 10px rgba(0,0,0,0.95); }\n  .name { position: absolute; z-index: 31; font-size: 64px; color: #ffe9b0; opacity: 0; text-shadow: 0 0 16px rgba(0,0,0,0.98), 0 3px 8px #000, 0 0 30px rgba(255,170,40,0.5); }\n  #name-l { left: 60px; top: 470px; text-align: left; }\n  #name-r { right: 70px; top: 720px; text-align: right; }\n  #countdown { position: absolute; z-index: 45; left: 50%; top: 63%; transform: translate(-50%,-50%); width: 360px; height: 360px; opacity: 0; }\n  #countdown svg { position: absolute; inset: 0; width: 100%; height: 100%; }\n  #cd-num { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 230px; color: #f3eee0; text-shadow: 0 0 28px rgba(0,0,0,0.95); line-height: 1; }\n  .cd-ring { fill: none; stroke: rgba(243,238,224,0.30); stroke-width: 7; }\n  .cd-sweep { fill: none; stroke: #f3eee0; stroke-width: 11; transform: rotate(-90deg); transform-origin: 50% 50%; }\n  .cd-cross { stroke: rgba(243,238,224,0.45); stroke-width: 4; }\n  #cd-plate { position: absolute; z-index: 44; left: 50%; top: 63%; transform: translate(-50%,-50%); width: 390px; height: 390px; background: rgba(18,20,24,0.5); opacity: 0; }\n  .fork { position: absolute; z-index: 43; top: 38%; max-width: 470px; font-size: 64px; line-height: 1.05; color: #f3eee0; opacity: 0; text-shadow: 0 0 16px rgba(0,0,0,0.95), 0 3px 8px #000; }\n  #fork-l { left: 56px; text-align: left; }\n  #fork-r { right: 56px; text-align: right; }\n  #death-wash { position: absolute; inset: 0; z-index: 46; pointer-events: none; opacity: 0; background: radial-gradient(120% 90% at 50% 45%, rgba(150,0,0,0.65) 0%, rgba(40,0,0,0.92) 100%); }\n  #death { position: absolute; z-index: 47; left: 0; right: 0; top: 41%; text-align: center; font-size: 220px; letter-spacing: 8px; color: #ff2a2a; opacity: 0; line-height: 0.9; text-shadow: 7px 0 0 rgba(255,0,46,0.55), -7px 0 0 rgba(0,200,255,0.45), 0 0 40px rgba(255,40,40,0.7), 0 6px 16px rgba(0,0,0,0.95); }\n  #flash { position: absolute; inset: 0; z-index: 48; background: #fff; opacity: 0; pointer-events: none; }\n  .cap { position: absolute; z-index: 35; left: 70px; right: 70px; bottom: 300px; text-align: center; font-family: 'Pixelify', monospace; font-size: 58px; line-height: 1.25; letter-spacing: 1px; opacity: 0; text-shadow: 0 4px 22px rgba(0,0,0,0.98), 0 2px 6px rgba(0,0,0,1); }\n  #cap { color: #fff; }\n  #cap-sam { color: #ffd23f; text-shadow: 0 4px 22px rgba(0,0,0,0.98), 0 2px 6px rgba(0,0,0,1), 0 0 24px rgba(255,170,40,0.5); }\n  #cta { position: absolute; z-index: 36; left: 60px; right: 60px; top: 40%; text-align: center; font-size: 76px; line-height: 1.14; color: #ffe9b0; opacity: 0; text-shadow: 0 0 24px rgba(0,0,0,0.95), 0 0 36px rgba(255,170,40,0.5), 0 4px 10px #000; }\n  #blackout { position: absolute; inset: 0; z-index: 49; background: #000; opacity: 0; pointer-events: none; }\n</style>\n</head>\n<body>\n<div id=\"root\" data-composition-id=\"choose-silenthill-001\" data-width=\"1080\" data-height=\"1920\" data-start=\"0\" data-duration=\"104.08\">\n\n  <video id=\"master\" class=\"vid clip\" data-start=\"0\" data-duration=\"104.08\" data-media-start=\"0\" data-track-index=\"0\" src=\"assets/master.mp4\" muted playsinline crossorigin=\"anonymous\"></video>\n\n  <div id=\"vhs\"><canvas id=\"vcr\"></canvas><div class=\"tint\"></div><div class=\"scan\"></div><div class=\"pause\"><b>&#10073;&#10073;</b>PAUSE</div></div>\n  <div id=\"title\">CHOOSE YOUR GUIDE</div>\n  <div class=\"name\" id=\"name-l\">NURSE</div>\n  <div class=\"name\" id=\"name-r\">SAMARITAN</div>\n  <div class=\"fork\" id=\"fork-l\"></div>\n  <div class=\"fork\" id=\"fork-r\"></div>\n  <div id=\"cd-plate\"></div>\n  <div id=\"countdown\">\n    <svg viewBox=\"0 0 460 460\">\n      <circle class=\"cd-ring\" cx=\"230\" cy=\"230\" r=\"210\"></circle>\n      <circle class=\"cd-sweep\" id=\"cd-sweep\" cx=\"230\" cy=\"230\" r=\"210\"></circle>\n      <line class=\"cd-cross\" x1=\"230\" y1=\"6\" x2=\"230\" y2=\"454\"></line>\n      <line class=\"cd-cross\" x1=\"6\" y1=\"230\" x2=\"454\" y2=\"230\"></line>\n    </svg>\n    <div id=\"cd-num\">3</div>\n  </div>\n  <div id=\"death-wash\"></div>\n  <div id=\"death\">DEATH</div>\n  <div class=\"cap\" id=\"cap\"></div>\n  <div class=\"cap\" id=\"cap-sam\"></div>\n  <div id=\"cta\">THE MONSTER<br>OR THE MADMAN?<br>WHO DID YOU TRUST?</div>\n  <div class=\"grain\"></div>\n  <div class=\"vignette\"></div>\n  <div id=\"flash\"></div>\n  <div id=\"blackout\"></div>\n\n  <audio id=\"bgm\" class=\"clip\" src=\"assets/audio/soundtrack.mp3\" data-start=\"0\" data-duration=\"104.08\" data-media-start=\"0\" data-track-index=\"9\" data-volume=\"0.22\"></audio>\n\n  <!-- narrator VO (old-radio, track 10) -->\n  <audio id=\"vo-00\" class=\"clip\" src=\"assets/voiceover/vo-00.mp3\" data-start=\"0.30\"  data-duration=\"4.78\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-01\" class=\"clip\" src=\"assets/voiceover/vo-01.mp3\" data-start=\"6.76\"  data-duration=\"4.02\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-02\" class=\"clip\" src=\"assets/voiceover/vo-02.mp3\" data-start=\"10.98\" data-duration=\"3.89\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-03\" class=\"clip\" src=\"assets/voiceover/vo-03.mp3\" data-start=\"17.05\" data-duration=\"3.60\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-04\" class=\"clip\" src=\"assets/voiceover/vo-04.mp3\" data-start=\"21.05\" data-duration=\"3.19\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-05\" class=\"clip\" src=\"assets/voiceover/vo-05.mp3\" data-start=\"24.43\" data-duration=\"3.79\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-06\" class=\"clip\" src=\"assets/voiceover/vo-06.mp3\" data-start=\"30.51\" data-duration=\"2.64\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-07\" class=\"clip\" src=\"assets/voiceover/vo-07.mp3\" data-start=\"33.88\" data-duration=\"2.82\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-08\" class=\"clip\" src=\"assets/voiceover/vo-08.mp3\" data-start=\"37.06\" data-duration=\"3.76\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-09\" class=\"clip\" src=\"assets/voiceover/vo-09.mp3\" data-start=\"43.13\" data-duration=\"3.06\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-10\" class=\"clip\" src=\"assets/voiceover/vo-10.mp3\" data-start=\"46.59\" data-duration=\"2.87\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-11\" class=\"clip\" src=\"assets/voiceover/vo-11.mp3\" data-start=\"49.97\" data-duration=\"4.02\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-13\" class=\"clip\" src=\"assets/voiceover/vo-13.mp3\" data-start=\"60.26\" data-duration=\"3.60\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-14\" class=\"clip\" src=\"assets/voiceover/vo-14.mp3\" data-start=\"64.26\" data-duration=\"3.76\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-16\" class=\"clip\" src=\"assets/voiceover/vo-16.mp3\" data-start=\"74.30\" data-duration=\"2.95\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-17\" class=\"clip\" src=\"assets/voiceover/vo-17.mp3\" data-start=\"77.68\" data-duration=\"2.93\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-19\" class=\"clip\" src=\"assets/voiceover/vo-19.mp3\" data-start=\"86.92\" data-duration=\"3.71\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-20\" class=\"clip\" src=\"assets/voiceover/vo-20.mp3\" data-start=\"91.05\" data-duration=\"2.77\" data-track-index=\"10\" data-volume=\"1\"></audio>\n\n  <!-- samaritan's OWN cloned voice (bright/diegetic, track 10) -->\n  <audio id=\"sam-12\" class=\"clip\" src=\"assets/voiceover/sam-12.mp3\" data-start=\"54.28\" data-duration=\"1.91\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"sam-15\" class=\"clip\" src=\"assets/voiceover/sam-15.mp3\" data-start=\"68.32\" data-duration=\"3.00\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"sam-18\" class=\"clip\" src=\"assets/voiceover/sam-18.mp3\" data-start=\"80.95\" data-duration=\"2.77\" data-track-index=\"10\" data-volume=\"1\"></audio>\n\n  <!-- countdown beeps (track 11), 0.5s/tick, right after the command -->\n  <audio id=\"bp00\" class=\"clip\" src=\"assets/sfx/beep-soft.mp3\"       data-start=\"4.90\"  data-duration=\"0.16\" data-track-index=\"11\" data-volume=\"1\"></audio>\n  <audio id=\"bp01\" class=\"clip\" src=\"assets/sfx/beep-soft.mp3\"       data-start=\"5.40\"  data-duration=\"0.16\" data-track-index=\"11\" data-volume=\"1\"></audio>\n  <audio id=\"bp02\" class=\"clip\" src=\"assets/sfx/beep-soft-final.mp3\" data-start=\"5.90\"  data-duration=\"0.30\" data-track-index=\"11\" data-volume=\"1\"></audio>\n  <audio id=\"bp03\" class=\"clip\" src=\"assets/sfx/beep-soft.mp3\"       data-start=\"15.08\" data-duration=\"0.16\" data-track-index=\"11\" data-volume=\"1\"></audio>\n  <audio id=\"bp04\" class=\"clip\" src=\"assets/sfx/beep-soft.mp3\"       data-start=\"15.58\" data-duration=\"0.16\" data-track-index=\"11\" data-volume=\"1\"></audio>\n  <audio id=\"bp05\" class=\"clip\" src=\"assets/sfx/beep-soft-final.mp3\" data-start=\"16.08\" data-duration=\"0.30\" data-track-index=\"11\" data-volume=\"1\"></audio>\n  <audio id=\"bp06\" class=\"clip\" src=\"assets/sfx/beep-soft.mp3\"       data-start=\"28.53\" data-duration=\"0.16\" data-track-index=\"11\" data-volume=\"1\"></audio>\n  <audio id=\"bp07\" class=\"clip\" src=\"assets/sfx/beep-soft.mp3\"       data-start=\"29.03\" data-duration=\"0.16\" data-track-index=\"11\" data-volume=\"1\"></audio>\n  <audio id=\"bp08\" class=\"clip\" src=\"assets/sfx/beep-soft-final.mp3\" data-start=\"29.53\" data-duration=\"0.30\" data-track-index=\"11\" data-volume=\"1\"></audio>\n  <audio id=\"bp09\" class=\"clip\" src=\"assets/sfx/beep-soft.mp3\"       data-start=\"41.16\" data-duration=\"0.16\" data-track-index=\"11\" data-volume=\"1\"></audio>\n  <audio id=\"bp10\" class=\"clip\" src=\"assets/sfx/beep-soft.mp3\"       data-start=\"41.66\" data-duration=\"0.16\" data-track-index=\"11\" data-volume=\"1\"></audio>\n  <audio id=\"bp11\" class=\"clip\" src=\"assets/sfx/beep-soft-final.mp3\" data-start=\"42.16\" data-duration=\"0.30\" data-track-index=\"11\" data-volume=\"1\"></audio>\n  <audio id=\"bp12\" class=\"clip\" src=\"assets/sfx/beep-soft.mp3\"       data-start=\"58.28\" data-duration=\"0.16\" data-track-index=\"11\" data-volume=\"1\"></audio>\n  <audio id=\"bp13\" class=\"clip\" src=\"assets/sfx/beep-soft.mp3\"       data-start=\"58.78\" data-duration=\"0.16\" data-track-index=\"11\" data-volume=\"1\"></audio>\n  <audio id=\"bp14\" class=\"clip\" src=\"assets/sfx/beep-soft-final.mp3\" data-start=\"59.28\" data-duration=\"0.30\" data-track-index=\"11\" data-volume=\"1\"></audio>\n  <audio id=\"bp15\" class=\"clip\" src=\"assets/sfx/beep-soft.mp3\"       data-start=\"72.32\" data-duration=\"0.16\" data-track-index=\"11\" data-volume=\"1\"></audio>\n  <audio id=\"bp16\" class=\"clip\" src=\"assets/sfx/beep-soft.mp3\"       data-start=\"72.82\" data-duration=\"0.16\" data-track-index=\"11\" data-volume=\"1\"></audio>\n  <audio id=\"bp17\" class=\"clip\" src=\"assets/sfx/beep-soft-final.mp3\" data-start=\"73.32\" data-duration=\"0.30\" data-track-index=\"11\" data-volume=\"1\"></audio>\n  <audio id=\"bp18\" class=\"clip\" src=\"assets/sfx/beep-soft.mp3\"       data-start=\"84.95\" data-duration=\"0.16\" data-track-index=\"11\" data-volume=\"1\"></audio>\n  <audio id=\"bp19\" class=\"clip\" src=\"assets/sfx/beep-soft.mp3\"       data-start=\"85.45\" data-duration=\"0.16\" data-track-index=\"11\" data-volume=\"1\"></audio>\n  <audio id=\"bp20\" class=\"clip\" src=\"assets/sfx/beep-soft-final.mp3\" data-start=\"85.95\" data-duration=\"0.30\" data-track-index=\"11\" data-volume=\"1\"></audio>\n\n  <!-- SFX beds (track 12) -->\n  <audio id=\"sx-amb1\"  class=\"clip\" src=\"assets/sfx/amb-1.mp3\"   data-start=\"0.0\"   data-duration=\"6.0\" data-track-index=\"12\" data-volume=\"0.15\"></audio>\n  <audio id=\"sx-srnA\"  class=\"clip\" src=\"assets/sfx/siren-a.mp3\" data-start=\"10.88\" data-duration=\"6.0\" data-track-index=\"12\" data-volume=\"0.42\"></audio>\n  <audio id=\"sx-owA\"   class=\"clip\" src=\"assets/sfx/ow-a.mp3\"    data-start=\"16.95\" data-duration=\"7.0\" data-track-index=\"12\" data-volume=\"0.35\"></audio>\n  <audio id=\"sx-amb2\"  class=\"clip\" src=\"assets/sfx/amb-2.mp3\"   data-start=\"47.0\"  data-duration=\"8.0\" data-track-index=\"12\" data-volume=\"0.15\"></audio>\n  <audio id=\"sx-grn\"   class=\"clip\" src=\"assets/sfx/groan.mp3\"   data-start=\"68.3\"  data-duration=\"3.0\" data-track-index=\"12\" data-volume=\"0.45\"></audio>\n  <audio id=\"sx-srnB\"  class=\"clip\" src=\"assets/sfx/siren-b.mp3\" data-start=\"80.6\"  data-duration=\"6.0\" data-track-index=\"12\" data-volume=\"0.42\"></audio>\n  <audio id=\"sx-owB\"   class=\"clip\" src=\"assets/sfx/ow-b.mp3\"    data-start=\"86.7\"  data-duration=\"7.0\" data-track-index=\"12\" data-volume=\"0.35\"></audio>\n  <!-- UNIQUE death stingers (track 13) -->\n  <audio id=\"sx-d04\"  class=\"clip\" src=\"assets/sfx/d-a04.mp3\"  data-start=\"19.45\" data-duration=\"2.5\" data-track-index=\"13\" data-volume=\"0.55\"></audio>\n  <audio id=\"sx-d07\"  class=\"clip\" src=\"assets/sfx/d-a07.mp3\"  data-start=\"32.29\" data-duration=\"2.5\" data-track-index=\"13\" data-volume=\"0.55\"></audio>\n  <audio id=\"sx-d09b\" class=\"clip\" src=\"assets/sfx/d-a09b.mp3\" data-start=\"44.99\" data-duration=\"2.5\" data-track-index=\"13\" data-volume=\"0.55\"></audio>\n  <audio id=\"sx-d13\"  class=\"clip\" src=\"assets/sfx/d-b13.mp3\"  data-start=\"62.66\" data-duration=\"2.5\" data-track-index=\"13\" data-volume=\"0.55\"></audio>\n  <audio id=\"sx-d16\"  class=\"clip\" src=\"assets/sfx/d-b16.mp3\"  data-start=\"76.08\" data-duration=\"2.5\" data-track-index=\"13\" data-volume=\"0.55\"></audio>\n  <audio id=\"sx-d18b\" class=\"clip\" src=\"assets/sfx/d-b18b.mp3\" data-start=\"89.44\" data-duration=\"2.5\" data-track-index=\"13\" data-volume=\"0.55\"></audio>\n\n  <script src=\"https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js\"></script>\n  <script>\n    const tl = gsap.timeline({ paused: true, defaults: { immediateRender: false } });\n    const C = 2 * Math.PI * 210;\n    gsap.set(\"#cd-sweep\", { strokeDasharray: C, strokeDashoffset: 0 });\n    gsap.set([\"#title\",\"#name-l\",\"#name-r\",\"#countdown\",\"#cd-plate\",\"#fork-l\",\"#fork-r\",\"#death\",\"#death-wash\",\"#cap\",\"#cap-sam\",\"#cta\",\"#blackout\",\"#vhs\",\"#flash\"], { opacity: 0 });\n\n    const A   = [0.00,6.46,10.88,16.75,20.75,24.33,30.21,33.58,36.96,42.83,46.29,49.67,54.08,59.96,63.96,68.12,74.00,77.38,80.75,86.62,90.75,94.12];\n    const SEG = [6.96,4.92,6.38,4.50,4.08,6.38,3.88,3.88,6.38,3.96,3.88,4.92,6.38,4.50,4.67,6.38,3.88,3.88,6.38,4.62,3.88,9.96];\n    const VOSTART = [0.30,6.76,0,17.05,21.05,0,30.51,33.88,0,43.13,46.59,49.97,0,60.26,64.26,0,74.30,77.68,0,86.92,91.05];\n    const VODUR   = [4.78,4.02,0,3.60,3.19,0,2.64,2.82,0,3.06,2.87,4.02,0,3.60,3.76,0,2.95,2.93,0,3.71,2.77];\n    const VOTXT = [\n      \"One guide keeps you alive. One is bait.\",\n      \"You picked the nurse. So copy her, exactly.\",\n      \"\", \"You ran. The fog peeled the street open — and you with it.\",\n      \"You froze like her. It swept right over your back.\",\n      \"\", \"You took the open door. The floor was never there.\",\n      \"You forced her door instead. Still breathing.\",\n      \"\", \"You followed her in. Even she was hungry.\",\n      \"You broke away. The gates opened.\",\n      \"Or you trust the madman. Obey him.\",\n      \"\", \"You helped him. It wasn't a man anymore.\",\n      \"You left him, and followed his cold call.\",\n      \"\", \"You ran early. It was faster than you.\",\n      \"You waited for his mark. You slipped past.\",\n      \"\", \"You waited with him. His fear took you both.\",\n      \"You dragged him into the light. You made it home.\"\n    ];\n\n    const vcr = document.getElementById(\"vcr\"); vcr.width = 270; vcr.height = 480;\n    const vctx = vcr.getContext(\"2d\");\n    function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}\n    function drawVHS(t){\n      const r = mulberry32((Math.floor(t*30)|0)+1); const w=vcr.width,h=vcr.height;\n      const img=vctx.createImageData(w,h),d=img.data;\n      for(let i=0;i<d.length;i+=4){const v=(r()*255)|0;d[i]=d[i+1]=d[i+2]=v;d[i+3]=(r()*60)|0;}\n      vctx.putImageData(img,0,0);\n      const band=Math.floor((t*60)%h); vctx.fillStyle=\"rgba(255,255,255,0.55)\";\n      for(let k=0;k<26;k++){const x=(r()*w)|0,y=band+((r()*46)|0)-23;vctx.fillRect(x,y,(r()*7)|0,2);}\n    }\n    function vhs(s,dur){\n      tl.set(\"#vhs\",{opacity:1},s);\n      const pf={v:s}; tl.to(pf,{v:s+dur,duration:dur,ease:\"none\",onUpdate:()=>drawVHS(pf.v),overwrite:\"auto\"},s);\n      let t=s,k=0; while(t<s+dur){tl.set(\"#vhs\",{y:(k%2?1:-1)},t);t+=0.1;k++;}\n      tl.set(\"#vhs\",{y:0},s+dur); tl.to(\"#vhs\",{opacity:0,duration:0.12,overwrite:\"auto\"},s+dur);\n    }\n    function capEl(el,text,tin,tout){\n      tl.set(el,{textContent:text},tin-0.01);\n      tl.fromTo(el,{opacity:0,y:26},{opacity:1,y:0,duration:0.32,ease:\"power3.out\",overwrite:\"auto\"},tin);\n      tl.to(el,{opacity:0,duration:0.28,overwrite:\"auto\"},tout);\n      tl.set(el,{opacity:0},tout+0.29);\n    }\n    const cap=(t,a,b)=>capEl(\"#cap\",t,a,b);\n    const capY=(t,a,b)=>capEl(\"#cap-sam\",t,a,b);\n    function disc(s,step){\n      step=step||0.5;\n      tl.fromTo(\"#cd-plate\",{opacity:0},{opacity:1,duration:0.16,overwrite:\"auto\"},s-0.1);\n      tl.fromTo(\"#countdown\",{opacity:0},{opacity:1,duration:0.16,overwrite:\"auto\"},s-0.1);\n      for(let i=0;i<3;i++){const t=s+i*step;\n        tl.set(\"#cd-num\",{textContent:3-i},t);\n        tl.fromTo(\"#cd-sweep\",{strokeDashoffset:0},{strokeDashoffset:C,duration:step,ease:\"none\"},t);\n        tl.fromTo(\"#cd-num\",{scale:1.2,opacity:0.4},{scale:1,opacity:1,duration:step*0.45,ease:\"back.out(2)\"},t);\n      }\n      tl.to([\"#countdown\",\"#cd-plate\"],{opacity:0,duration:0.2,ease:\"power2.in\",overwrite:\"auto\"},s+3*step-0.04);\n    }\n    function deathBeat(i){\n      const s=A[i],dur=SEG[i],dt=s+dur-1.7;\n      tl.set(\"#flash\",{opacity:0.85},dt);\n      tl.to(\"#flash\",{opacity:0,duration:0.22,ease:\"power2.in\",overwrite:\"auto\"},dt+0.03);\n      tl.set(\"#flash\",{opacity:0},dt+0.3);\n      tl.fromTo(\"#death-wash\",{opacity:0.9},{opacity:0,duration:0.6,ease:\"power2.in\",overwrite:\"auto\"},dt);\n      tl.fromTo(\"#death\",{scale:1.7,opacity:0},{scale:1,opacity:1,duration:0.3,ease:\"back.out(2.2)\",overwrite:\"auto\"},dt);\n      tl.to(\"#death\",{x:\"+=16\",duration:0.045,repeat:6,yoyo:true},dt+0.3);\n      tl.set(\"#death\",{x:0},dt+0.7);\n      tl.to(\"#death\",{opacity:0,duration:0.3,overwrite:\"auto\"},s+dur-0.05);\n      tl.set(\"#death\",{opacity:0},s+dur);\n    }\n    // fork: command VO over the playing action; then short freeze + fast 0.5s countdown right after\n    function freezeFork(i,l,r){\n      const fs=A[i]+3.9, cd=A[i]+4.2, clear=cd+1.5+0.05;\n      vhs(fs,clear-fs);\n      tl.set(\"#fork-l\",{textContent:l},fs);\n      tl.set(\"#fork-r\",{textContent:r},fs);\n      tl.fromTo(\"#fork-l\",{opacity:0,x:-44},{opacity:1,x:0,duration:0.28,ease:\"power3.out\",overwrite:\"auto\"},fs+0.05);\n      tl.fromTo(\"#fork-r\",{opacity:0,x:44},{opacity:1,x:0,duration:0.28,ease:\"power3.out\",overwrite:\"auto\"},fs+0.05);\n      tl.to([\"#fork-l\",\"#fork-r\"],{opacity:0,duration:0.22,overwrite:\"auto\"},clear-0.05);\n      tl.set([\"#fork-l\",\"#fork-r\"],{opacity:0},clear+0.2);\n      disc(cd,0.5);\n    }\n\n    // ===== INTRO (hub) =====\n    tl.fromTo(\"#title\",{opacity:0,y:-22},{opacity:1,y:0,duration:0.4,ease:\"power3.out\"},0.4);\n    tl.to(\"#title\",{x:\"+=10\",duration:0.04,repeat:5,yoyo:true,ease:\"none\"},0.85);\n    tl.set(\"#title\",{x:0},1.2);\n    tl.to(\"#title\",{opacity:0.35,duration:0.05,repeat:3,yoyo:true,ease:\"none\"},0.9);\n    tl.fromTo(\"#name-l\",{opacity:0,scale:0.7},{opacity:1,scale:1,duration:0.4,ease:\"back.out(2)\"},0.7);\n    tl.fromTo(\"#name-r\",{opacity:0,scale:0.7},{opacity:1,scale:1,duration:0.4,ease:\"back.out(2)\"},1.0);\n    tl.to(\"#title\",{opacity:0,duration:0.3},2.6); tl.set(\"#title\",{opacity:0},2.95);\n    vhs(3.9,2.5);\n    disc(4.9,0.5);\n    tl.to([\"#name-l\",\"#name-r\"],{opacity:0,duration:0.3},6.1); tl.set([\"#name-l\",\"#name-r\"],{opacity:0},6.45);\n\n    // ===== BRANCH A — THE NURSE =====\n    freezeFork(2,\"RUN\",\"FREEZE LIKE HER\"); deathBeat(3);\n    freezeFork(5,\"OPEN DOOR\",\"FORCE HER DOOR\"); deathBeat(6);\n    freezeFork(8,\"FOLLOW HER\",\"BREAK AWAY\"); deathBeat(9);\n    // ===== BRANCH B — THE SAMARITAN =====\n    freezeFork(12,\"HELP THEM\",\"LEAVE THEM\"); deathBeat(13);\n    freezeFork(15,\"RUN NOW\",\"WAIT FOR MARK\"); deathBeat(16);\n    freezeFork(18,\"WAIT WITH HIM\",\"GO FOR THE LIGHTS\"); deathBeat(19);\n\n    // narrator captions (white)\n    for(let i=0;i<VOTXT.length;i++){ if(!VOTXT[i]||!VODUR[i]) continue; cap(VOTXT[i], VOSTART[i]+0.12, VOSTART[i]+VODUR[i]-0.05); }\n    // samaritan captions (yellow) — his diegetic commands\n    capY(\"Leave him. He's bait. Keep moving.\", 54.40, 56.19);\n    capY(\"There. On my mark. Not before.\",     68.44, 71.32);\n    capY(\"No. We don't move. It's not safe out there.\", 81.07, 83.72);\n\n    // ===== END — rest on frozen frame, CTA after the line, NO blackout =====\n    tl.fromTo(\"#cta\",{opacity:0,scale:0.9},{opacity:1,scale:1,duration:0.5,ease:\"back.out(1.8)\"},101.2);\n    tl.to({},{duration:0.01},104.06);\n\n    window.__timelines = window.__timelines || {};\n    window.__timelines[\"choose-silenthill-001\"] = tl;\n  </script>\n</div>\n</body>\n</html>\n",
      "timing": {
        "A": [
          0,
          6.46,
          10.88,
          16.75,
          20.75,
          24.33,
          30.21,
          33.58,
          36.96,
          42.83,
          46.29,
          49.67,
          54.08,
          59.96,
          63.96,
          68.12,
          74,
          77.38,
          80.75,
          86.62,
          90.75,
          94.12
        ],
        "SEG": [
          6.96,
          4.92,
          6.38,
          4.5,
          4.08,
          6.38,
          3.88,
          3.88,
          6.38,
          3.96,
          3.88,
          4.92,
          6.38,
          4.5,
          4.67,
          6.38,
          3.88,
          3.88,
          6.38,
          4.62,
          3.88,
          9.96
        ]
      },
      "components": [
        "cap",
        "capEl",
        "cd-cross",
        "cd-ring",
        "cd-sweep",
        "choose-silenthill-001",
        "clip",
        "deathBeat",
        "disc",
        "drawVHS",
        "fork",
        "freezeFork",
        "grain",
        "mulberry32",
        "name",
        "pause",
        "scan",
        "tint",
        "vhs",
        "vid",
        "vignette"
      ],
      "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-silenthill/index.html"
    },
    "costRollupUsd": 25.96,
    "schemaVersion": 1
  },
  {
    "notes": "hard asset path for slot 'hub-lowpoly' does not exist; recorded by ref; hard asset path for slot 'hub-ftf' does not exist; recorded by ref; hard asset path for slot 'char-voss-ps1a' does not exist; recorded by ref; hard asset path for slot 'char-voss-ps1b' does not exist; recorded by ref",
    "assets": [
      {
        "kind": "character",
        "path": "assets/char-aura.png",
        "slot": "char-aura",
        "bytes": 1430446,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-spaceship/assets/char-aura.png"
      },
      {
        "kind": "character",
        "path": "assets/char-voss.png",
        "slot": "char-voss",
        "bytes": 1288282,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-spaceship/assets/char-voss.png"
      },
      {
        "kind": "character",
        "path": "assets/char-voss-ps1a.png",
        "slot": "char-voss-ps1a"
      },
      {
        "kind": "character",
        "path": "assets/char-voss-ps1b.png",
        "slot": "char-voss-ps1b"
      },
      {
        "kind": "location",
        "path": "assets/hub.png",
        "slot": "hub",
        "bytes": 1421370,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-spaceship/assets/hub.png"
      },
      {
        "kind": "location",
        "path": "assets/hub-ftf.png",
        "slot": "hub-ftf"
      },
      {
        "kind": "location",
        "path": "assets/hub-lowpoly.png",
        "slot": "hub-lowpoly"
      },
      {
        "kind": "location",
        "path": "assets/hub-vid.mp4",
        "slot": "hub-vid",
        "bytes": 1534312,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-spaceship/assets/hub-vid.mp4"
      },
      {
        "kind": "location",
        "path": "assets/scene-a02-follow.png",
        "slot": "scene-a02-follow",
        "bytes": 1185634,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-spaceship/assets/scene-a02-follow.png"
      },
      {
        "kind": "location",
        "path": "assets/scene-a02-follow-vid.mp4",
        "slot": "scene-a02-follow-vid",
        "bytes": 2098499,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-spaceship/assets/scene-a02-follow-vid.mp4"
      },
      {
        "kind": "location",
        "path": "assets/scene-a03-fork.png",
        "slot": "scene-a03-fork",
        "bytes": 1293509,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-spaceship/assets/scene-a03-fork.png"
      },
      {
        "kind": "location",
        "path": "assets/scene-a03-fork-vid.mp4",
        "slot": "scene-a03-fork-vid",
        "bytes": 2350928,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-spaceship/assets/scene-a03-fork-vid.mp4"
      },
      {
        "kind": "location",
        "path": "assets/scene-a04-death-lift.png",
        "slot": "scene-a04-death-lift",
        "bytes": 1328067,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-spaceship/assets/scene-a04-death-lift.png"
      },
      {
        "kind": "location",
        "path": "assets/scene-a04-death-lift-vid.mp4",
        "slot": "scene-a04-death-lift-vid",
        "bytes": 3153827,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-spaceship/assets/scene-a04-death-lift-vid.mp4"
      },
      {
        "kind": "location",
        "path": "assets/scene-a05-deck.png",
        "slot": "scene-a05-deck",
        "bytes": 1134428,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-spaceship/assets/scene-a05-deck.png"
      },
      {
        "kind": "location",
        "path": "assets/scene-a05-deck-vid.mp4",
        "slot": "scene-a05-deck-vid",
        "bytes": 1915445,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-spaceship/assets/scene-a05-deck-vid.mp4"
      },
      {
        "kind": "location",
        "path": "assets/scene-a06-fork-pod.png",
        "slot": "scene-a06-fork-pod",
        "bytes": 1274782,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-spaceship/assets/scene-a06-fork-pod.png"
      },
      {
        "kind": "location",
        "path": "assets/scene-a06-fork-pod-vid.mp4",
        "slot": "scene-a06-fork-pod-vid",
        "bytes": 1538600,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-spaceship/assets/scene-a06-fork-pod-vid.mp4"
      },
      {
        "kind": "location",
        "path": "assets/scene-a07-death-pod.png",
        "slot": "scene-a07-death-pod",
        "bytes": 1176536,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-spaceship/assets/scene-a07-death-pod.png"
      },
      {
        "kind": "location",
        "path": "assets/scene-a07-death-pod-vid.mp4",
        "slot": "scene-a07-death-pod-vid",
        "bytes": 3184870,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-spaceship/assets/scene-a07-death-pod-vid.mp4"
      },
      {
        "kind": "location",
        "path": "assets/scene-a08-core.png",
        "slot": "scene-a08-core",
        "bytes": 1290407,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-spaceship/assets/scene-a08-core.png"
      },
      {
        "kind": "location",
        "path": "assets/scene-a08-core-vid.mp4",
        "slot": "scene-a08-core-vid",
        "bytes": 2067073,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-spaceship/assets/scene-a08-core-vid.mp4"
      },
      {
        "kind": "location",
        "path": "assets/scene-a09-fork-purge.png",
        "slot": "scene-a09-fork-purge",
        "bytes": 1185130,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-spaceship/assets/scene-a09-fork-purge.png"
      },
      {
        "kind": "location",
        "path": "assets/scene-a09-fork-purge-vid.mp4",
        "slot": "scene-a09-fork-purge-vid",
        "bytes": 1398602,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-spaceship/assets/scene-a09-fork-purge-vid.mp4"
      },
      {
        "kind": "location",
        "path": "assets/scene-a09b-death-trust.png",
        "slot": "scene-a09b-death-trust",
        "bytes": 1483738,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-spaceship/assets/scene-a09b-death-trust.png"
      },
      {
        "kind": "location",
        "path": "assets/scene-a09b-death-trust-vid.mp4",
        "slot": "scene-a09b-death-trust-vid",
        "bytes": 3660458,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-spaceship/assets/scene-a09b-death-trust-vid.mp4"
      },
      {
        "kind": "location",
        "path": "assets/scene-a10-end.png",
        "slot": "scene-a10-end",
        "bytes": 1128973,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-spaceship/assets/scene-a10-end.png"
      },
      {
        "kind": "location",
        "path": "assets/scene-a10-end-vid.mp4",
        "slot": "scene-a10-end-vid",
        "bytes": 2328877,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-spaceship/assets/scene-a10-end-vid.mp4"
      },
      {
        "kind": "location",
        "path": "assets/scene-b11-run.png",
        "slot": "scene-b11-run",
        "bytes": 1340288,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-spaceship/assets/scene-b11-run.png"
      },
      {
        "kind": "location",
        "path": "assets/scene-b11-run-vid.mp4",
        "slot": "scene-b11-run-vid",
        "bytes": 3461896,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-spaceship/assets/scene-b11-run-vid.mp4"
      },
      {
        "kind": "location",
        "path": "assets/scene-b12-fork.png",
        "slot": "scene-b12-fork",
        "bytes": 1221841,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-spaceship/assets/scene-b12-fork.png"
      },
      {
        "kind": "location",
        "path": "assets/scene-b12-fork-vid.mp4",
        "slot": "scene-b12-fork-vid",
        "bytes": 1280528,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-spaceship/assets/scene-b12-fork-vid.mp4"
      },
      {
        "kind": "location",
        "path": "assets/scene-b13-death-hall.png",
        "slot": "scene-b13-death-hall",
        "bytes": 1172973,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-spaceship/assets/scene-b13-death-hall.png"
      },
      {
        "kind": "location",
        "path": "assets/scene-b13-death-hall-vid.mp4",
        "slot": "scene-b13-death-hall-vid",
        "bytes": 2128794,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-spaceship/assets/scene-b13-death-hall-vid.mp4"
      },
      {
        "kind": "location",
        "path": "assets/scene-b14-fork-reactor.png",
        "slot": "scene-b14-fork-reactor",
        "bytes": 1221860,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-spaceship/assets/scene-b14-fork-reactor.png"
      },
      {
        "kind": "location",
        "path": "assets/scene-b14-fork-reactor-vid.mp4",
        "slot": "scene-b14-fork-reactor-vid",
        "bytes": 1695308,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-spaceship/assets/scene-b14-fork-reactor-vid.mp4"
      },
      {
        "kind": "location",
        "path": "assets/scene-b15-death-cover.png",
        "slot": "scene-b15-death-cover",
        "bytes": 1690874,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-spaceship/assets/scene-b15-death-cover.png"
      },
      {
        "kind": "location",
        "path": "assets/scene-b15-death-cover-vid.mp4",
        "slot": "scene-b15-death-cover-vid",
        "bytes": 3027512,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-spaceship/assets/scene-b15-death-cover-vid.mp4"
      },
      {
        "kind": "location",
        "path": "assets/scene-b16-podbay.png",
        "slot": "scene-b16-podbay",
        "bytes": 1161369,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-spaceship/assets/scene-b16-podbay.png"
      },
      {
        "kind": "location",
        "path": "assets/scene-b16-podbay-vid.mp4",
        "slot": "scene-b16-podbay-vid",
        "bytes": 2391357,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-spaceship/assets/scene-b16-podbay-vid.mp4"
      },
      {
        "kind": "location",
        "path": "assets/scene-b17-fork-pod.png",
        "slot": "scene-b17-fork-pod",
        "bytes": 1332930,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-spaceship/assets/scene-b17-fork-pod.png"
      },
      {
        "kind": "location",
        "path": "assets/scene-b17-fork-pod-vid.mp4",
        "slot": "scene-b17-fork-pod-vid",
        "bytes": 1895076,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-spaceship/assets/scene-b17-fork-pod-vid.mp4"
      },
      {
        "kind": "location",
        "path": "assets/scene-b17b-death-cleanpod.png",
        "slot": "scene-b17b-death-cleanpod",
        "bytes": 1095952,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-spaceship/assets/scene-b17b-death-cleanpod.png"
      },
      {
        "kind": "location",
        "path": "assets/scene-b17b-death-cleanpod-vid.mp4",
        "slot": "scene-b17b-death-cleanpod-vid",
        "bytes": 2499249,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-spaceship/assets/scene-b17b-death-cleanpod-vid.mp4"
      },
      {
        "kind": "location",
        "path": "assets/scene-b18-end.png",
        "slot": "scene-b18-end",
        "bytes": 1332336,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-spaceship/assets/scene-b18-end.png"
      },
      {
        "kind": "location",
        "path": "assets/scene-b18-end-vid.mp4",
        "slot": "scene-b18-end-vid",
        "bytes": 2702524,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-spaceship/assets/scene-b18-end-vid.mp4"
      },
      {
        "kind": "location",
        "path": "assets/scene-end-idle-vid.mp4",
        "slot": "scene-end-idle-vid",
        "bytes": 2029688,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-spaceship/assets/scene-end-idle-vid.mp4"
      }
    ],
    "unitId": "choose-spaceship",
    "prompts": [
      {
        "slot": "char-aura",
        "text": "{\n  \"prompt\": {\n    \"scene\": {\n      \"description\": \"RETRO PS1/PSX LOW-POLY SURVIVAL-HORROR 3D GAME RENDER — EXTREMELY low polygon count, a CHUNKY blocky low-poly PS1 character model with a simplified faceted low-detail face (few hard-edged polygons), low-resolution dithered textures, heavy film grain, vertex wobble, affine warping; Silent Hill 1 / Puppet Combo / PS1 voxel look; NOT realistic, NOT a detailed face, NOT smooth skin, NOT high-detail, NOT painterly, NOT glossy. Character reference of AURA, the ship's AI, who has NO physical body: she appears as a GIANT translucent HOLOGRAPHIC WOMAN evoking Blade Runner 2049's 'Joi' — a calm, seductive young woman with a neon bob — but rendered as a crude, blocky, LOW-POLY PS1 hologram (chunky faceted face and body, minimal polygons, low detail), glowing pink-magenta with cyan edges, heavy scanlines and glitch flicker reading through her translucent low-poly form. She looms over and leans into the wrecked spaceship bridge, echoed across the cracked wall monitors, one blocky hand reaching gently toward the camera. No solid body — a light projection. Palette: hot pink-magenta and cyan hologram glow against red emergency dark.\",\n      \"subject\": \"AURA — a giant translucent LOW-POLY holographic woman (Blade Runner 2049 'Joi' vibe but crude blocky PS1 model), neon bob, calm and seductive, faceted low-detail face, glowing pink-magenta with cyan edges, scanlines, NO solid body, one blocky hand reaching out\",\n      \"setting\": \"derelict spaceship bridge, red emergency darkness, cracked wall monitors echoing her image\",\n      \"action\": \"looming and leaning in, gently reaching toward camera, holographic flicker\"\n    },\n    \"style\": {\n      \"primary\": \"retro PS1/PSX 5th-gen-console low-poly survival-horror 3D game render\",\n      \"rendering_quality\": \"EXTREMELY low fidelity, very low polygon count, chunky blocky faceted geometry, simplified low-detail face, flat low-res dithered textures, heavy grain; NOT realistic, NOT detailed, NOT smooth, NOT painterly, NOT glossy\",\n      \"surface_textures\": \"translucent holographic scanlines, glitch artifacts, dithered neon, blocky faceted edges\",\n      \"lighting\": \"self-lit pink-magenta and cyan hologram glow as key, dim red emergency wash, deep crushed shadows\"\n    },\n    \"technical\": {\n      \"angle\": \"first-person POV looking up at the giant hologram\",\n      \"rendering\": \"faint CRT/VHS scanline grain, low-poly aliasing, affine texture warping, holographic transparency\",\n      \"resolution\": \"PS1-era low-fidelity, 9:16 vertical\"\n    },\n    \"composition\": {\n      \"framing\": \"centered, the giant low-poly holographic woman dominating the frame\",\n      \"subject_placement\": \"hologram fills upper/center frame, blocky POV hand or bridge rail in lower foreground\"\n    },\n    \"quality\": {\n      \"include\": [\"PS1/PSX low-poly\", \"EXTREMELY low polygon count\", \"chunky blocky faceted model\", \"simplified low-detail face\", \"low-res dithered textures\", \"heavy grain\", \"giant holographic woman\", \"Joi vibe\", \"neon bob\", \"pink-magenta and cyan hologram glow\", \"scanlines and glitch\", \"translucent no solid body\", \"9:16 vertical\"],\n      \"avoid\": [\"photorealistic\", \"realistic detailed face\", \"smooth skin\", \"hyperdetailed\", \"painterly\", \"glossy\", \"high-poly\", \"solid opaque body\", \"robot chassis\", \"abstract UI panel only\", \"beauty filter\", \"watermark\", \"modern AAA graphics\"],\n      \"reference_standard\": \"Blade Runner 2049 'Joi' giant hologram re-imagined as a crude low-poly PS1/PSX character model\"\n    }\n  }\n}\n",
        "stage": "image"
      },
      {
        "slot": "char-voss",
        "text": "{\n  \"prompt\": {\n    \"scene\": {\n      \"description\": \"RETRO PS1/PSX LOW-POLY SURVIVAL-HORROR 3D GAME RENDER — chunky simplified low-poly geometry, low-resolution dithered textures, heavy film grain, dark and murky, limited detail, vertex wobble, affine texture warping; Silent Hill 1 / early Resident Evil / Puppet Combo / voxel look; NOT photorealistic, NOT high-detail, NOT painterly, NOT glossy. Full-body character reference of VOSS, a balding man aged 50-55 with a round, unkempt, medium-length dark maroon-chestnut beard with bits of food caught in it, a messy unshaven face and a bulbous potato nose. He wears a grimy orange-grey work coverall / boiler-suit peeled down to the waist with its sleeves knotted around his hips, over a filthy white wifebeater stained with beer, food and cigarette burns; his fat hairy belly still bulges out; a battered dented yellow hard hat on his head; scuffed work boots. A lit cigarette smoulders in his mouth, trailing a thin curl of smoke. Sweaty, abrasive, hunched aggressive stance, one hand reaching out to grab. Grim, washed-out, off-putting energy. Palette: sallow skin, dingy off-white tank, dark beard, red alert glow.\",\n      \"subject\": \"balding 50-55 man, round unkempt dark maroon-chestnut beard with crumbs, potato nose, grimy work coverall peeled down and tied at the waist over a filthy stained wifebeater, hairy belly out, battered yellow hard hat, lit cigarette in mouth, work boots\",\n      \"setting\": \"derelict spaceship corridor, riveted steel, red alert glow, smoke haze\",\n      \"action\": \"standing, reaching one hand out to grab, cigarette smoking\"\n    },\n    \"style\": {\n      \"primary\": \"retro PS1/PSX 5th-gen-console low-poly survival-horror 3D game render\",\n      \"rendering_quality\": \"very low fidelity, low polygon count, chunky simplified geometry, flat low-res dithered textures, heavy grain; NOT photorealistic, NOT high-detail, NOT painterly, NOT glossy\",\n      \"surface_textures\": \"low-res dithered skin and grimy cloth textures, greasy sheen\",\n      \"lighting\": \"harsh red emergency key + sodium emergency fill, deep crushed shadows, heavy vignette\"\n    },\n    \"technical\": {\n      \"angle\": \"eye-level, slight low angle to feel his bulk loom\",\n      \"rendering\": \"faint CRT/VHS scanline grain, low-poly aliasing, affine texture warping\",\n      \"resolution\": \"PS1-era low-fidelity, 9:16 vertical\"\n    },\n    \"composition\": {\n      \"framing\": \"centered full-body, clear readable silhouette\",\n      \"subject_placement\": \"center frame, plain dark corridor behind\"\n    },\n    \"quality\": {\n      \"include\": [\n        \"voxel low-poly PS1 horror render\",\n        \"affine-warped textures\",\n        \"dithered grain\",\n        \"grimy stained wifebeater\",\n        \"unkempt crumb-flecked beard\",\n        \"sweaty greasy skin\",\n        \"cigarette smoke\",\n        \"crushed red shadows\",\n        \"9:16 vertical\",\n        \"PS1/PSX low-poly\",\n        \"chunky low polygon count\",\n        \"low-resolution dithered textures\",\n        \"heavy grain\",\n        \"dark murky limited detail\",\n        \"vertex wobble\",\n        \"Silent Hill 1 / Puppet Combo aesthetic\"\n      ],\n      \"avoid\": [\n        \"photorealistic\",\n        \"smooth modern CGI\",\n        \"glossy octane render\",\n        \"cartoon\",\n        \"anime\",\n        \"handsome\",\n        \"clean\",\n        \"groomed\",\n        \"beauty filter\",\n        \"airbrushed skin\",\n        \"watermark\",\n        \"deformed hands\",\n        \"photorealistic\",\n        \"hyperdetailed\",\n        \"painterly\",\n        \"glossy\",\n        \"high-poly\",\n        \"ray traced\",\n        \"octane render\",\n        \"unreal engine 5\",\n        \"4k\",\n        \"sharp realistic skin\",\n        \"modern AAA graphics\"\n      ],\n      \"reference_standard\": \"PS1-era survival-horror NPC model with the grimy, washed-out, off-putting energy of Swansea from Mouthwashing\"\n    }\n  }\n}\n",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "char-voss",
        "text": "{\n  \"prompt\": {\n    \"scene\": {\n      \"description\": \"RETRO PS1/PSX LOW-POLY SURVIVAL-HORROR 3D GAME RENDER — chunky simplified low-poly geometry, low-resolution dithered textures, heavy film grain, dark and murky, limited detail, vertex wobble, affine texture warping; Silent Hill 1 / early Resident Evil / Puppet Combo / voxel look; NOT photorealistic, NOT high-detail, NOT painterly, NOT glossy. Full-body character reference of VOSS, a balding man aged 50-55 with a round, unkempt, medium-length dark maroon-chestnut beard with bits of food caught in it, a messy unshaven face and a bulbous potato nose. He wears a grimy orange-grey work coverall / boiler-suit peeled down to the waist with its sleeves knotted around his hips, over a filthy white wifebeater stained with beer, food and cigarette burns; his fat hairy belly still bulges out; a battered dented yellow hard hat on his head; scuffed work boots. A lit cigarette smoulders in his mouth, trailing a thin curl of smoke. Sweaty, abrasive, hunched aggressive stance, one hand reaching out to grab. Grim, washed-out, off-putting energy. Palette: sallow skin, dingy off-white tank, dark beard, red alert glow.\",\n      \"subject\": \"balding 50-55 man, round unkempt dark maroon-chestnut beard with crumbs, potato nose, grimy work coverall peeled down and tied at the waist over a filthy stained wifebeater, hairy belly out, battered yellow hard hat, lit cigarette in mouth, work boots\",\n      \"setting\": \"derelict spaceship corridor, riveted steel, red alert glow, smoke haze\",\n      \"action\": \"standing, reaching one hand out to grab, cigarette smoking\"\n    },\n    \"style\": {\n      \"primary\": \"retro PS1/PSX 5th-gen-console low-poly survival-horror 3D game render\",\n      \"rendering_quality\": \"very low fidelity, low polygon count, chunky simplified geometry, flat low-res dithered textures, heavy grain; NOT photorealistic, NOT high-detail, NOT painterly, NOT glossy\",\n      \"surface_textures\": \"low-res dithered skin and grimy cloth textures, greasy sheen\",\n      \"lighting\": \"harsh red emergency key + sodium emergency fill, deep crushed shadows, heavy vignette\"\n    },\n    \"technical\": {\n      \"angle\": \"eye-level, slight low angle to feel his bulk loom\",\n      \"rendering\": \"faint CRT/VHS scanline grain, low-poly aliasing, affine texture warping\",\n      \"resolution\": \"PS1-era low-fidelity, 9:16 vertical\"\n    },\n    \"composition\": {\n      \"framing\": \"centered full-body, clear readable silhouette\",\n      \"subject_placement\": \"center frame, plain dark corridor behind\"\n    },\n    \"quality\": {\n      \"include\": [\n        \"voxel low-poly PS1 horror render\",\n        \"affine-warped textures\",\n        \"dithered grain\",\n        \"grimy stained wifebeater\",\n        \"unkempt crumb-flecked beard\",\n        \"sweaty greasy skin\",\n        \"cigarette smoke\",\n        \"crushed red shadows\",\n        \"9:16 vertical\",\n        \"PS1/PSX low-poly\",\n        \"chunky low polygon count\",\n        \"low-resolution dithered textures\",\n        \"heavy grain\",\n        \"dark murky limited detail\",\n        \"vertex wobble\",\n        \"Silent Hill 1 / Puppet Combo aesthetic\"\n      ],\n      \"avoid\": [\n        \"photorealistic\",\n        \"smooth modern CGI\",\n        \"glossy octane render\",\n        \"cartoon\",\n        \"anime\",\n        \"handsome\",\n        \"clean\",\n        \"groomed\",\n        \"beauty filter\",\n        \"airbrushed skin\",\n        \"watermark\",\n        \"deformed hands\",\n        \"photorealistic\",\n        \"hyperdetailed\",\n        \"painterly\",\n        \"glossy\",\n        \"high-poly\",\n        \"ray traced\",\n        \"octane render\",\n        \"unreal engine 5\",\n        \"4k\",\n        \"sharp realistic skin\",\n        \"modern AAA graphics\"\n      ],\n      \"reference_standard\": \"PS1-era survival-horror NPC model with the grimy, washed-out, off-putting energy of Swansea from Mouthwashing\"\n    }\n  }\n}\n",
        "stage": "vo"
      },
      {
        "slot": "char-voss-ps1a",
        "text": "EXTREME low-poly PS1/PSX character model — very low polygon count, chunky blocky faceted geometry, hard angular edges, low-resolution affine-warped textures, visible vertex wobble, heavy grain; like a real PlayStation-1 in-game character, NOT detailed, NOT realistic, NOT smooth, NOT high-poly. Chilla's Art / Fears to Fathom flat grainy register. Full-body character reference, plain dark background, centered. SUBJECT: VOSS — a fat balding man ~50s, round unkempt dark maroon beard, battered yellow hard hat, grimy work coverall peeled down and tied at the waist over a filthy stained wifebeater, fat hairy belly out, lit cigarette in mouth, work boots, one hand reaching out. 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "char-voss-ps1b",
        "text": "EXTREME low-poly PS1/PSX character model — very low polygon count, chunky blocky faceted geometry, hard angular edges, low-resolution affine-warped textures, visible vertex wobble, heavy grain; like a real PlayStation-1 in-game character, NOT detailed, NOT realistic, NOT smooth, NOT high-poly. Chilla's Art / Fears to Fathom flat grainy register. Full-body character reference, plain dark background, centered. SUBJECT: VOSS — a fat balding man ~50s, round unkempt dark maroon beard, battered yellow hard hat, grimy work coverall peeled down and tied at the waist over a filthy stained wifebeater, fat hairy belly out, lit cigarette in mouth, work boots, one hand reaching out. 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "hub",
        "text": "Generate a screenshot from a first-person horror video game with NO interface/HUD, in voxel graphics in the style of PS1 (chunky low-poly geometry, low-resolution dithered textures, affine texture warping, vertex wobble, heavy grain, dark and murky). CRITICAL: render the CHARACTERS and the ENVIRONMENT at the SAME crude low-poly fidelity — NO character may be more detailed/realistic than the room; everyone is a blocky low-poly PS1 model. All characters FULL BODY, head-to-feet, nothing cropped out of frame.\n\nComposition: first-person POV on the wrecked bridge of a derelict spaceship at red alert. The hero's blocky low-poly LEFT HAND holds a small glowing handheld screen in the lower foreground. Behind, the bridge splits into TWO corridors.\n\nLEFT corridor — AURA, the ship's AI: a translucent pink-magenta LOW-POLY holographic woman (neon bob, Blade Runner 2049 'Joi' vibe). She is clearly PROJECTED from a glowing circular holo-emitter pad mounted on the left console — her feet and lower body dissolve upward into the projector's light cone, so she is grounded IN the projection beam, NOT floating randomly in mid-air. She leans toward the camera and beckons.\n\nRIGHT corridor — VOSS, standing on the floor in FULL BODY (head to boots, both legs visible, not cropped): a fat balding man in his 50s, round unkempt dark maroon beard, a battered yellow hard hat, a grimy work coverall peeled down and tied at the waist over a filthy stained wifebeater, hairy belly bulging out, a lit cigarette in his mouth, scuffed work boots planted on the deck, one hand reaching out toward the camera. Rendered at the SAME blocky low-poly fidelity as the room.\n\nCAMERA: pulled back for a WIDE establishing shot — the deck floor is visible beneath both guides and there is headroom above; both characters are shown COMPLETE from head to boots, standing on the floor. ABSOLUTELY DO NOT crop the legs or feet of either character; no close-up.\n\nCold red emergency lighting, sodium-amber glow, floating debris, smoke haze.\n\nFRAMING — MATCH THE SECOND REFERENCE IMAGE FOR SCALE & PLACEMENT ONLY (do NOT copy its content, characters, station or any text): the two guides stand side by side facing the camera, FULL BODY from head to feet, LARGE and CLOSE so they fill most of the vertical frame — feet visible near the bottom, heads near the top, the corridors receding between and behind them. This is the opening 'hook' character-select shot; characters must be big, bright and instantly readable in the very first frame. Do NOT crop legs or feet. 9:16 vertical.\n",
        "stage": "image"
      },
      {
        "slot": "hub-ftf",
        "text": "Generate a screenshot from a first-person horror video game with NO interface/HUD, rendered in the EXACT visual style of CHILLA'''S ART and FEARS TO FATHOM indie PS1/PS2 horror games — flat restrained lighting, heavy film grain and VHS noise, a muted desaturated palette, low-resolution textures, low-poly 3D models with realistic proportions, slightly soft/blurred, a mundane found-footage indie-horror-game look; NOT voxel, NOT cube-based, NOT cinematic, NOT dramatic, NOT painterly, NOT AAA (chunky low-poly geometry, low-resolution dithered textures, affine texture warping, vertex wobble, heavy grain, dark and murky). CRITICAL: render the CHARACTERS and the ENVIRONMENT at the SAME crude low-poly fidelity — NO character may be more detailed/realistic than the room; everyone is a blocky low-poly PS1 model. All characters FULL BODY, head-to-feet, nothing cropped out of frame.\n\nComposition: first-person POV on the wrecked bridge of a derelict spaceship at red alert. The hero's blocky low-poly LEFT HAND holds a small glowing handheld screen in the lower foreground. Behind, the bridge splits into TWO corridors.\n\nLEFT corridor — AURA, the ship's AI: a translucent pink-magenta LOW-POLY holographic woman (neon bob, Blade Runner 2049 'Joi' vibe). She is clearly PROJECTED from a glowing circular holo-emitter pad mounted on the left console — her feet and lower body dissolve upward into the projector's light cone, so she is grounded IN the projection beam, NOT floating randomly in mid-air. She leans toward the camera and beckons.\n\nRIGHT corridor — VOSS, standing on the floor in FULL BODY (head to boots, both legs visible, not cropped): a fat balding man in his 50s, round unkempt dark maroon beard, a battered yellow hard hat, a grimy work coverall peeled down and tied at the waist over a filthy stained wifebeater, hairy belly bulging out, a lit cigarette in his mouth, scuffed work boots planted on the deck, one hand reaching out toward the camera. Rendered at the SAME blocky low-poly fidelity as the room.\n\nCAMERA: pulled back for a WIDE establishing shot — the deck floor is visible beneath both guides and there is headroom above; both characters are shown COMPLETE from head to boots, standing on the floor. ABSOLUTELY DO NOT crop the legs or feet of either character; no close-up.\n\nCold red emergency lighting, sodium-amber glow, floating debris, smoke haze.\n\nFRAMING — MATCH THE SECOND REFERENCE IMAGE FOR SCALE & PLACEMENT ONLY (do NOT copy its content, characters, station or any text): the two guides stand side by side facing the camera, FULL BODY from head to feet, LARGE and CLOSE so they fill most of the vertical frame — feet visible near the bottom, heads near the top, the corridors receding between and behind them. This is the opening 'hook' character-select shot; characters must be big, bright and instantly readable in the very first frame. Do NOT crop legs or feet. 9:16 vertical.\n",
        "stage": "image"
      },
      {
        "slot": "hub-lowpoly",
        "text": "Generate a screenshot from a first-person horror video game with NO interface/HUD, in PURE LOW-POLY PS1/PSX graphics (smooth-shaded triangulated low-poly 3D models like real PlayStation-1 games, NOT voxel, NOT cube-based, NOT minecraft, NOT painterly) (clean low-poly triangulated geometry, low-resolution dithered textures, affine texture warping, vertex wobble, heavy grain, dark and murky). CRITICAL: render the CHARACTERS and the ENVIRONMENT at the SAME crude low-poly fidelity — NO character may be more detailed/realistic than the room; everyone is a blocky low-poly PS1 model. All characters FULL BODY, head-to-feet, nothing cropped out of frame.\n\nComposition: first-person POV on the wrecked bridge of a derelict spaceship at red alert. The hero's blocky low-poly LEFT HAND holds a small glowing handheld screen in the lower foreground. Behind, the bridge splits into TWO corridors.\n\nLEFT corridor — AURA, the ship's AI: a translucent pink-magenta LOW-POLY holographic woman (neon bob, Blade Runner 2049 'Joi' vibe). She is clearly PROJECTED from a glowing circular holo-emitter pad mounted on the left console — her feet and lower body dissolve upward into the projector's light cone, so she is grounded IN the projection beam, NOT floating randomly in mid-air. She leans toward the camera and beckons.\n\nRIGHT corridor — VOSS, standing on the floor in FULL BODY (head to boots, both legs visible, not cropped): a fat balding man in his 50s, round unkempt dark maroon beard, a battered yellow hard hat, a grimy work coverall peeled down and tied at the waist over a filthy stained wifebeater, hairy belly bulging out, a lit cigarette in his mouth, scuffed work boots planted on the deck, one hand reaching out toward the camera. Rendered at the SAME blocky low-poly fidelity as the room.\n\nCAMERA: pulled back for a WIDE establishing shot — the deck floor is visible beneath both guides and there is headroom above; both characters are shown COMPLETE from head to boots, standing on the floor. ABSOLUTELY DO NOT crop the legs or feet of either character; no close-up.\n\nCold red emergency lighting, sodium-amber glow, floating debris, smoke haze.\n\nFRAMING — MATCH THE SECOND REFERENCE IMAGE FOR SCALE & PLACEMENT ONLY (do NOT copy its content, characters, station or any text): the two guides stand side by side facing the camera, FULL BODY from head to feet, LARGE and CLOSE so they fill most of the vertical frame — feet visible near the bottom, heads near the top, the corridors receding between and behind them. This is the opening 'hook' character-select shot; characters must be big, bright and instantly readable in the very first frame. Do NOT crop legs or feet. 9:16 vertical.\n",
        "stage": "image"
      },
      {
        "slot": "hub-vid",
        "text": "PS1 indie survival-horror game footage, first-person POV, heavy film grain + VHS scanlines, low-poly, 9:16. Static idle held shot of the wrecked red-lit spaceship bridge, nobody commits. On the LEFT, AURA — a giant translucent pink-magenta holographic woman (Joi-style) — looms over the bridge leaning in slightly, her form flickering and rippling with scanlines, beckoning calmly with one hand; her image echoes and glitches across the dead wall monitors. On the RIGHT, VOSS — the fat bearded low-poly engineer in a yellow hard hat, cigarette smoking — bangs a fist on the airlock glass, shouting. Throughout: red alert strobes pulse, a distress beacon light throbs, faint steam drifts, debris floats slowly, the POV breathes with a subtle handheld sway. Tense ship-drone ambience.\n",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "i2v/hub-vid",
        "text": "PS1 indie survival-horror game footage, first-person POV, heavy film grain + VHS scanlines, low-poly, 9:16. Static idle held shot of the wrecked red-lit spaceship bridge, nobody commits. On the LEFT, AURA — a giant translucent pink-magenta holographic woman (Joi-style) — looms over the bridge leaning in slightly, her form flickering and rippling with scanlines, beckoning calmly with one hand; her image echoes and glitches across the dead wall monitors. On the RIGHT, VOSS — the fat bearded low-poly engineer in a yellow hard hat, cigarette smoking — bangs a fist on the airlock glass, shouting. Throughout: red alert strobes pulse, a distress beacon light throbs, faint steam drifts, debris floats slowly, the POV breathes with a subtle handheld sway. Tense ship-drone ambience.\n",
        "stage": "i2v"
      },
      {
        "slot": "i2v/scene-a02-follow-vid",
        "text": "PS1 indie survival-horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. POV walks steadily forward down a humming red-lit derelict corridor, following AURA's translucent pink hologram who flickers and drifts ahead leading the way, glancing back invitingly; a blocky low-poly POV hand holds a small glowing screen at the bottom of frame. Doors hiss and slide open ahead one by one. Throughout: red strobes pulse, steam vents drift, the hologram ripples with scanlines, the camera sways with each step. Calm humming ship ambience.\n",
        "stage": "i2v"
      },
      {
        "slot": "i2v/scene-a03-fork-vid",
        "text": "PS1 indie survival-horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. A held choice-moment, idle, nobody commits. POV stands at a T-junction in the red-lit corridor: an elevator door on the LEFT, a dark cramped maintenance crawl-shaft on the RIGHT. AURA's translucent pink hologram hovers between them, gesturing smoothly and repeatedly toward the elevator, urging you left. Throughout: red strobes pulse, the hologram flickers and ripples, steam drifts, distant metal groans, the POV sways slightly — the world stays alive, but the choice is not made.\n",
        "stage": "i2v"
      },
      {
        "slot": "i2v/scene-a04-death-lift-vid",
        "text": "PS1 indie survival-horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. A death scene — you are instantly killed, you never get more than one step. 0-1s: POV steps into the elevator, the floor lurches. 1-3s: the cable snaps and a hull breach tears open with a roar — you are violently flung out through the rupture into open space, the ship spinning away, air and frost venting past the lens, stars wheeling. 3-4s: you tumble helplessly into the black void, the lens spinning out to darkness. Screaming metal, explosive decompression, then silence.\n",
        "stage": "i2v"
      },
      {
        "slot": "i2v/scene-a05-deck-vid",
        "text": "PS1 indie survival-horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. POV crawls forward out of the dark maintenance shaft and rises onto a wrecked frozen deck — frost coats the walls, slumped low-poly frozen crew bodies, deep claw marks gouged across the panels. A blocky POV hand pushes off the floor. Throughout: dim emergency light flickers, frost particles drift, the POV breathes and sways, something distant clanks. Cold, dread-heavy ship ambience.\n",
        "stage": "i2v"
      },
      {
        "slot": "i2v/scene-a06-fork-pod-vid",
        "text": "PS1 indie survival-horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. A held choice-moment, idle, nobody commits. POV stands on the cold wrecked deck facing a single open cryo-pod that glows invitingly with soft blue light, its lid raised and beckoning; a sealed dark bulkhead door is off to the side. AURA's pink hologram shimmers beside the pod, gesturing calmly toward it, inviting you in. Throughout: the pod light pulses softly, frost drifts, emergency light flickers, the POV sways — the world breathes, the choice is held.\n",
        "stage": "i2v"
      },
      {
        "slot": "i2v/scene-a07-death-pod-vid",
        "text": "PS1 indie survival-horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. A death scene — you are instantly trapped, you never get more than one step. 0-1s: POV steps into the cryo-pod, turning around as the glass lid swings down. 1-3s: the lid seals with a hiss and glowing blue cryo-fluid floods up fast over the view, bubbles and distortion, your blocky hands slam uselessly against the glass. 3-4s: the fluid swallows the lens completely, vision blurring blue then fading to black. Hiss, gurgle, muffled thudding.\n",
        "stage": "i2v"
      },
      {
        "slot": "i2v/scene-a08-core-vid",
        "text": "PS1 indie survival-horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. POV steps forward into a dim ship-core server room and leans toward a cracked terminal screen scrolling logs and a schematic, a blocky POV hand reaching to the console. The horrible truth glows on the monitor in sinister pink. Throughout: pink core glow pulses, exposed wires spark and sway, the screen flickers and scrolls, the POV breathes — low ominous hum rising.\n",
        "stage": "i2v"
      },
      {
        "slot": "i2v/scene-a09-fork-purge-vid",
        "text": "PS1 indie survival-horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. A held choice-moment, idle, nobody commits. POV stands in the ship's core chamber before a glowing core console with a red purge lever; AURA's giant translucent pink holographic woman leans in close, pleading, clasping her hands, her form rippling with scanlines. A blocky POV hand hovers near the lever but does not pull it. Throughout: the core pulses, AURA flickers and gestures pleadingly, wires spark, the POV sways — alive but unresolved.\n",
        "stage": "i2v"
      },
      {
        "slot": "i2v/scene-a09b-death-trust-vid",
        "text": "PS1 indie survival-horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. A death scene — you are instantly caught, you never get more than one step. 0-1s: POV lowers the hand from the lever, relaxing. 1-3s: robotic clamps and cables lunge from the walls and seize the camera, wrenching it sideways and dragging the POV violently toward rows of human cocoon-pods; AURA's pink hologram watches calmly. 3-4s: the clamps slam you into a pod and the lens is swallowed in pink as the pod seals. Mechanical shriek, snapping cables, hiss.\n",
        "stage": "i2v"
      },
      {
        "slot": "i2v/scene-a10-end-vid",
        "text": "PS1 indie survival-horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. POV pulls the purge lever; the sinister red alert and pink glow drain away and the lights settle into a calm cold-blue. An airlock slides open ahead onto a small intact escape pod bathed in soft light; a blocky low-poly POV hand reaches toward it as the menace lifts. Throughout: the red strobes fade out, steam settles, the POV breathes easier, a soft relieved hum — by the end the bridge is calm and quiet, salvation ahead. The POV comes to rest facing the open escape pod.\n",
        "stage": "i2v"
      },
      {
        "slot": "i2v/scene-b11-run-vid",
        "text": "PS1 indie survival-horror game footage, first-person POV, heavy grain/VHS, EXTREME low-poly, 9:16. POV runs forward through smoke and sparks down a wrecked red-lit corridor, following VOSS — the fat bearded low-poly engineer in a battered yellow hard hat and grimy coverall — who runs a few steps ahead, turning back to bark and wave you on urgently, cigarette clenched in his teeth. Blocky low-poly POV hands swing in the foreground with each running step. Throughout: red alarms throb, smoke billows, sparks rain from torn cables, the camera bobs hard with the run. Blaring klaxons, pounding footsteps.\n",
        "stage": "i2v"
      },
      {
        "slot": "i2v/scene-b12-fork-vid",
        "text": "PS1 indie survival-horror game footage, first-person POV, heavy grain/VHS, EXTREME low-poly, 9:16. A held choice-moment, idle, nobody commits. POV stops at a fork in the same grimy rusty ship: on one side an intact, evenly-lit steel corridor that looks safe; on the other a dark steam-and-sparks damaged passage that VOSS is already wading into, turning to bark and wave you after him hard. Blocky low-poly POV hands in the foreground. Throughout: alarms throb, steam jets hiss, sparks fall, VOSS gestures impatiently, the POV sways — the world is alive, the choice unmade. No white/hospital look — both clearly the same rusty ship.\n",
        "stage": "i2v"
      },
      {
        "slot": "i2v/scene-b13-death-hall-vid",
        "text": "PS1 indie survival-horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. A death scene — you are instantly killed, you never get more than one step. 0-1s: POV steps forward into the clean, evenly-lit corridor. 1-3s: a warning blares and heavy steel blast doors slam down from above and below, guillotining toward the camera — the lens lurches as they crush in, sparks and a smear of blood. 3-4s: the doors clang shut over the lens, swallowing it to black. Hydraulic slam, crunch, alarm cutting out.\n",
        "stage": "i2v"
      },
      {
        "slot": "i2v/scene-b14-fork-reactor-vid",
        "text": "PS1 indie survival-horror game footage, first-person POV, heavy grain/VHS, EXTREME low-poly, 9:16. A held choice-moment, idle, nobody commits. POV stands in an engine bay before a huge screaming reactor venting steam, a manual vent lever in reach; VOSS stands by it, yelling and jabbing his finger hard at the lever, urgent. A blocky low-poly POV hand hovers near the lever but does not pull it. Throughout: the reactor pulses and roars, steam jets blast, red warning lights throb, VOSS gestures violently, the POV sways — alive, the choice held.\n",
        "stage": "i2v"
      },
      {
        "slot": "i2v/scene-b15-death-cover-vid",
        "text": "PS1 indie survival-horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. A death scene — you are instantly killed, you never get more than one step. 0-1s: POV ducks back and crouches behind cover, away from the lever. 1-3s: the reactor blows — a blinding wall of plasma and fire erupts and floods across the engine bay, washing over the camera, everything whiting out. 3-4s: the blast swallows the lens, searing white collapsing to black. Deafening roar, roaring flame, then silence.\n",
        "stage": "i2v"
      },
      {
        "slot": "i2v/scene-b16-podbay-vid",
        "text": "PS1 indie survival-horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. POV moves forward as the escape-pod bay unlocks with a heavy clunk, revealing two escape pods side by side — one clean and intact, one scorched and dark. A blocky low-poly POV hand pushes a hatch aside. Throughout: emergency light throbs, steam vents drift, the pod-bay door grinds open, sparks fall, the POV sways forward. Mechanical clunks, venting steam.\n",
        "stage": "i2v"
      },
      {
        "slot": "i2v/scene-b17-fork-pod-vid",
        "text": "PS1 indie survival-horror game footage, first-person POV, heavy grain/VHS, EXTREME low-poly, 9:16. A held choice-moment, idle, nobody commits. POV faces two escape pods — a clean lit one that looks reliable, and an ugly scorched dark one; VOSS stands beside the scorched pod, gesturing hard and barking for you to get into the ugly one, NOT the clean one. A blocky low-poly POV hand hovers between them. Throughout: emergency light throbs, steam drifts, sparks fall, VOSS gestures impatiently, the POV sways — the world alive, the choice held.\n",
        "stage": "i2v"
      },
      {
        "slot": "i2v/scene-b17b-death-cleanpod-vid",
        "text": "PS1 indie survival-horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. A death scene — you are instantly doomed, you never get a second chance. 0-1s: POV climbs into the clean lit pod and the hatch seals. 1-3s: the pod fires and launches but immediately misfires — it lurches and tumbles end over end out into a field of jagged wreckage and debris, alarms shrieking, sparks spraying, the view spinning wildly. 3-4s: a chunk of debris smashes the porthole and the lens is swallowed to black. Misfire bang, tumbling metal, alarms.\n",
        "stage": "i2v"
      },
      {
        "slot": "i2v/scene-b18-end-vid",
        "text": "PS1 indie survival-horror game footage, first-person POV, heavy grain/VHS, EXTREME low-poly, 9:16. POV is strapped into the scorched escape pod beside VOSS; a blocky low-poly POV hand slams down the red eject button. The pod fires and the derelict spaceship shrinks away through the porthole into a field of stars, the red alarms left behind. Throughout: the eject thrusters rumble, the ship recedes, calmer blue starlight fills the porthole, VOSS slumps back relieved beside you, the POV settles — by the end it is quiet, drifting safely in space. The POV comes to rest facing the porthole.\n",
        "stage": "i2v"
      },
      {
        "slot": "i2v/scene-end-idle-vid",
        "text": "PS1 indie survival-horror game footage turning calm and peaceful, first-person POV, heavy grain/VHS, low-poly, 9:16. Continue from this exact frame, keeping VOSS's appearance IDENTICAL: VOSS — the SAME fat bearded low-poly engineer in the battered yellow hard hat and grimy coverall strapped into the scorched escape pod beside you — slumps back in his seat, exhausted and relieved, lets out a long breath, takes a slow drag of his cigarette and lets the smoke curl up, gives a tired nod. Through the porthole the starfield slowly drifts past and the derelict ship shrinks to a tiny speck. A blocky low-poly POV hand rests on the eject console in the foreground. Gentle continuous idle camera sway, the pod gently rocking, stars keep drifting — calm, peaceful, no menace, the red alarms gone. VOSS stays the same bearded hard-hat engineer the whole time, never changing into a different character.\n",
        "stage": "i2v"
      },
      {
        "slot": "scene-a02-follow",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted low-poly, UNIFORM low fidelity, NOT cinematic. Walking down a dim red-lit derelict spaceship corridor following AURA's translucent pink holographic woman who flickers a few steps ahead leading the way. IMPORTANT: blocky low-poly first-person POV HANDS clearly visible in the foreground holding a small glowing handheld screen (this is a let's-play, hands always in frame). 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-a02-follow-vid",
        "text": "PS1 indie survival-horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. POV walks steadily forward down a humming red-lit derelict corridor, following AURA's translucent pink hologram who flickers and drifts ahead leading the way, glancing back invitingly; a blocky low-poly POV hand holds a small glowing screen at the bottom of frame. Doors hiss and slide open ahead one by one. Throughout: red strobes pulse, steam vents drift, the hologram ripples with scanlines, the camera sways with each step. Calm humming ship ambience.\n",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "scene-a03-fork",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted low-poly, UNIFORM low fidelity, NOT cinematic. Continue the SAME corridor/style as the reference. It reaches a junction: a sealed ELEVATOR door on the left, a dark cramped maintenance crawl-shaft opening on the right; AURA's pink hologram hovers between them, gesturing toward the elevator. IMPORTANT: blocky low-poly first-person POV HANDS clearly visible in the foreground holding the glowing handheld screen. 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-a03-fork-vid",
        "text": "PS1 indie survival-horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. A held choice-moment, idle, nobody commits. POV stands at a T-junction in the red-lit corridor: an elevator door on the LEFT, a dark cramped maintenance crawl-shaft on the RIGHT. AURA's translucent pink hologram hovers between them, gesturing smoothly and repeatedly toward the elevator, urging you left. Throughout: red strobes pulse, the hologram flickers and ripples, steam drifts, distant metal groans, the POV sways slightly — the world stays alive, but the choice is not made.\n",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "scene-a04-death-lift",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted low-poly, UNIFORM low fidelity, NOT cinematic. Same ship. You have stepped into the cramped elevator; the cable snapped and the car PLUMMETS down a pitch-black shaft — sparks streaking past, screaming metal, crushing dark rushing up. Claustrophobic, grounded, NOT an open-space shot. IMPORTANT: blocky low-poly first-person POV HANDS clearly visible flailing and bracing against the elevator walls. 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-a04-death-lift-vid",
        "text": "PS1 indie survival-horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. A death scene — you are instantly killed, you never get more than one step. 0-1s: POV steps into the elevator, the floor lurches. 1-3s: the cable snaps and a hull breach tears open with a roar — you are violently flung out through the rupture into open space, the ship spinning away, air and frost venting past the lens, stars wheeling. 3-4s: you tumble helplessly into the black void, the lens spinning out to darkness. Screaming metal, explosive decompression, then silence.\n",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "scene-a05-deck",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted low-poly, UNIFORM low fidelity, NOT cinematic. Same ship. You crawl out of the maintenance shaft onto a wrecked frozen deck — keep it SIMPLE/low-detail: a couple of slumped low-poly frozen crew, a few claw-marks, frost, dim light. IMPORTANT: blocky low-poly first-person POV HANDS clearly visible gripping the frozen deck edge as you haul yourself up. 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-a05-deck-vid",
        "text": "PS1 indie survival-horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. POV crawls forward out of the dark maintenance shaft and rises onto a wrecked frozen deck — frost coats the walls, slumped low-poly frozen crew bodies, deep claw marks gouged across the panels. A blocky POV hand pushes off the floor. Throughout: dim emergency light flickers, frost particles drift, the POV breathes and sways, something distant clanks. Cold, dread-heavy ship ambience.\n",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "scene-a06-fork-pod",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted low-poly, UNIFORM low fidelity, NOT cinematic. The SAME wrecked frozen deck as the reference. TWO clearly separated choices side by side, equally large and obvious: on the LEFT a wide-open glowing blue cryo-pod you could climb into; on the RIGHT an open dark bulkhead doorway leading deeper. Both prominent and easy to read as the two options. IMPORTANT: a blocky low-poly first-person POV HAND in the foreground between them. 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-a06-fork-pod-vid",
        "text": "PS1 indie survival-horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. A held choice-moment, idle, nobody commits. POV stands on the cold wrecked deck facing a single open cryo-pod that glows invitingly with soft blue light, its lid raised and beckoning; a sealed dark bulkhead door is off to the side. AURA's pink hologram shimmers beside the pod, gesturing calmly toward it, inviting you in. Throughout: the pod light pulses softly, frost drifts, emergency light flickers, the POV sways — the world breathes, the choice is held.\n",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "scene-a07-death-pod",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted low-poly, UNIFORM low fidelity, NOT cinematic. The SAME cryo-pod and deck as the reference — now you are inside the pod: the glass lid lowers and pale blue fluid rises up the glass, trapping you. IMPORTANT: blocky low-poly first-person POV HANDS clearly visible pressing against the closing glass lid from inside. 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-a07-death-pod-vid",
        "text": "PS1 indie survival-horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. A death scene — you are instantly trapped, you never get more than one step. 0-1s: POV steps into the cryo-pod, turning around as the glass lid swings down. 1-3s: the lid seals with a hiss and glowing blue cryo-fluid floods up fast over the view, bubbles and distortion, your blocky hands slam uselessly against the glass. 3-4s: the fluid swallows the lens completely, vision blurring blue then fading to black. Hiss, gurgle, muffled thudding.\n",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "scene-a08-core",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted low-poly, UNIFORM low fidelity, NOT cinematic. The SAME ship core chamber as the reference image — same round central core console, same red/pink glow, same walls — but BEFORE any hologram appears. Focus on the cracked terminal screen on the console showing scrolling logs and a schematic (the truth being revealed). NO holographic woman yet. IMPORTANT: a blocky low-poly first-person POV HAND on the console below the terminal. 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-a08-core-vid",
        "text": "PS1 indie survival-horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. POV steps forward into a dim ship-core server room and leans toward a cracked terminal screen scrolling logs and a schematic, a blocky POV hand reaching to the console. The horrible truth glows on the monitor in sinister pink. Throughout: pink core glow pulses, exposed wires spark and sway, the screen flickers and scrolls, the POV breathes — low ominous hum rising.\n",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "scene-a09-fork-purge",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted low-poly, UNIFORM low fidelity, NOT cinematic. Same ship core. AURA's translucent pink holographic woman leans in pleading with clasped hands above a glowing core console; a red purge lever in the foreground. IMPORTANT: a blocky low-poly first-person POV HAND clearly visible hovering over the red purge lever. 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-a09-fork-purge-vid",
        "text": "PS1 indie survival-horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. A held choice-moment, idle, nobody commits. POV stands in the ship's core chamber before a glowing core console with a red purge lever; AURA's giant translucent pink holographic woman leans in close, pleading, clasping her hands, her form rippling with scanlines. A blocky POV hand hovers near the lever but does not pull it. Throughout: the core pulses, AURA flickers and gestures pleadingly, wires spark, the POV sways — alive but unresolved.\n",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "scene-a09-fork-purge-vid",
        "text": "PS1 indie survival-horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. A held choice-moment, idle, nobody commits. POV stands in the ship's core chamber before a glowing core console with a red purge lever; AURA's giant translucent pink holographic woman leans in close, pleading, clasping her hands, her form rippling with scanlines. A blocky POV hand hovers near the lever but does not pull it. Throughout: the core pulses, AURA flickers and gestures pleadingly, wires spark, the POV sways — alive but unresolved.\n",
        "model": "bytedance/seedance-2.0",
        "stage": "video"
      },
      {
        "slot": "scene-a09b-death-trust",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted low-poly, UNIFORM low fidelity, NOT cinematic. The SAME ship core chamber as the reference image — same round core console, same red/pink glow, AURAs translucent pink hologram present. Robotic clamps and cables lunge out from the console and walls and seize the POV, dragging you toward human cocoon-pods lining the chamber edges; the hologram watches calmly. IMPORTANT: blocky low-poly first-person POV HANDS clawing forward as the clamps drag you in. 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-a09b-death-trust-vid",
        "text": "PS1 indie survival-horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. A death scene — you are instantly caught, you never get more than one step. 0-1s: POV lowers the hand from the lever, relaxing. 1-3s: robotic clamps and cables lunge from the walls and seize the camera, wrenching it sideways and dragging the POV violently toward rows of human cocoon-pods; AURA's pink hologram watches calmly. 3-4s: the clamps slam you into a pod and the lens is swallowed in pink as the pod seals. Mechanical shriek, snapping cables, hiss.\n",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "scene-a10-end",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted low-poly, UNIFORM low fidelity, NOT cinematic. Same ship. The core goes dark, calm cold-blue light replaces the red alert; a small airlock slides open onto an intact escape pod ahead. IMPORTANT: a blocky low-poly first-person POV HAND clearly visible reaching toward the open escape pod. 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-a10-end-vid",
        "text": "PS1 indie survival-horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. POV pulls the purge lever; the sinister red alert and pink glow drain away and the lights settle into a calm cold-blue. An airlock slides open ahead onto a small intact escape pod bathed in soft light; a blocky low-poly POV hand reaches toward it as the menace lifts. Throughout: the red strobes fade out, steam settles, the POV breathes easier, a soft relieved hum — by the end the bridge is calm and quiet, salvation ahead. The POV comes to rest facing the open escape pod.\n",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "scene-b11-run",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted EXTREME low-poly (chunky blocky faceted, like a real PS1 character), UNIFORM low fidelity, NOT cinematic. VOSS — the SAME memey low-poly bearded engineer in yellow hard hat and grimy coverall as the character reference — runs a few steps ahead through smoke and sparks down a wrecked red-lit corridor, turning back to wave the POV on; his hands are free (NOT holding your hand). IMPORTANT: blocky low-poly first-person POV HANDS swinging in the foreground. 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-b11-run-vid",
        "text": "PS1 indie survival-horror game footage, first-person POV, heavy grain/VHS, EXTREME low-poly, 9:16. POV runs forward through smoke and sparks down a wrecked red-lit corridor, following VOSS — the fat bearded low-poly engineer in a battered yellow hard hat and grimy coverall — who runs a few steps ahead, turning back to bark and wave you on urgently, cigarette clenched in his teeth. Blocky low-poly POV hands swing in the foreground with each running step. Throughout: red alarms throb, smoke billows, sparks rain from torn cables, the camera bobs hard with the run. Blaring klaxons, pounding footsteps.\n",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "scene-b12-fork",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted EXTREME low-poly, UNIFORM low fidelity, NOT cinematic. Continue the SAME rusty ship/style. The corridor forks: one side an intact, evenly-lit steel ship corridor that looks safe; the other a dark steam-and-sparks damaged passage that VOSS (the SAME low-poly engineer as the character reference) is ducking into, waving the POV after him. Both clearly the SAME grimy rusty ship — NO white/hospital look. IMPORTANT: blocky low-poly first-person POV HANDS in the foreground. 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-b12-fork-vid",
        "text": "PS1 indie survival-horror game footage, first-person POV, heavy grain/VHS, EXTREME low-poly, 9:16. A held choice-moment, idle, nobody commits. POV stops at a fork in the same grimy rusty ship: on one side an intact, evenly-lit steel corridor that looks safe; on the other a dark steam-and-sparks damaged passage that VOSS is already wading into, turning to bark and wave you after him hard. Blocky low-poly POV hands in the foreground. Throughout: alarms throb, steam jets hiss, sparks fall, VOSS gestures impatiently, the POV sways — the world is alive, the choice unmade. No white/hospital look — both clearly the same rusty ship.\n",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "scene-b13-death-hall",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted low-poly, UNIFORM low fidelity, NOT cinematic. In the intact-looking lit ship corridor, heavy steel blast doors slam guillotine-style onto the POV — sparks and blood. Same rusty ship. IMPORTANT: blocky low-poly first-person POV HANDS clearly visible thrown up defensively as the doors slam. 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-b13-death-hall-vid",
        "text": "PS1 indie survival-horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. A death scene — you are instantly killed, you never get more than one step. 0-1s: POV steps forward into the clean, evenly-lit corridor. 1-3s: a warning blares and heavy steel blast doors slam down from above and below, guillotining toward the camera — the lens lurches as they crush in, sparks and a smear of blood. 3-4s: the doors clang shut over the lens, swallowing it to black. Hydraulic slam, crunch, alarm cutting out.\n",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "scene-b14-fork-reactor",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted EXTREME low-poly, UNIFORM low fidelity, NOT cinematic. Continue the SAME rusty ship. An engine bay with a huge reactor venting steam and a manual vent lever; VOSS (the SAME low-poly engineer as the character reference) stands by it yelling and pointing hard at the lever, urgent red warning light. IMPORTANT: a blocky low-poly first-person POV HAND reaching toward the vent lever. 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-b14-fork-reactor-vid",
        "text": "PS1 indie survival-horror game footage, first-person POV, heavy grain/VHS, EXTREME low-poly, 9:16. A held choice-moment, idle, nobody commits. POV stands in an engine bay before a huge screaming reactor venting steam, a manual vent lever in reach; VOSS stands by it, yelling and jabbing his finger hard at the lever, urgent. A blocky low-poly POV hand hovers near the lever but does not pull it. Throughout: the reactor pulses and roars, steam jets blast, red warning lights throb, VOSS gestures violently, the POV sways — alive, the choice held.\n",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "scene-b15-death-cover",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted low-poly, UNIFORM low fidelity, NOT cinematic. Same engine bay. The reactor melts down — a wall of plasma and fire erupts and floods the bay over the POV. IMPORTANT: blocky low-poly first-person POV HANDS clearly visible raised to shield from the plasma blast. 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-b15-death-cover-vid",
        "text": "PS1 indie survival-horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. A death scene — you are instantly killed, you never get more than one step. 0-1s: POV ducks back and crouches behind cover, away from the lever. 1-3s: the reactor blows — a blinding wall of plasma and fire erupts and floods across the engine bay, washing over the camera, everything whiting out. 3-4s: the blast swallows the lens, searing white collapsing to black. Deafening roar, roaring flame, then silence.\n",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "scene-b16-podbay",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted low-poly, UNIFORM low fidelity, NOT cinematic. Continue the SAME rusty ship. An escape-pod bay: two escape pods side by side — one clean and intact, one scorched and dark; steam, emergency light. IMPORTANT: blocky low-poly first-person POV HANDS clearly visible in the foreground as you step in. 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-b16-podbay-vid",
        "text": "PS1 indie survival-horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. POV moves forward as the escape-pod bay unlocks with a heavy clunk, revealing two escape pods side by side — one clean and intact, one scorched and dark. A blocky low-poly POV hand pushes a hatch aside. Throughout: emergency light throbs, steam vents drift, the pod-bay door grinds open, sparks fall, the POV sways forward. Mechanical clunks, venting steam.\n",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "scene-b17-fork-pod",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted EXTREME low-poly, UNIFORM low fidelity, NOT cinematic. The SAME two escape pods (one clean, one scorched dark). VOSS (the SAME low-poly engineer as the character reference) stands beside the scorched dark pod, gesturing hard for the POV to get into the ugly scorched one, NOT the clean one. IMPORTANT: a blocky low-poly first-person POV HAND reaching toward the scorched pod. 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-b17-fork-pod-vid",
        "text": "PS1 indie survival-horror game footage, first-person POV, heavy grain/VHS, EXTREME low-poly, 9:16. A held choice-moment, idle, nobody commits. POV faces two escape pods — a clean lit one that looks reliable, and an ugly scorched dark one; VOSS stands beside the scorched pod, gesturing hard and barking for you to get into the ugly one, NOT the clean one. A blocky low-poly POV hand hovers between them. Throughout: emergency light throbs, steam drifts, sparks fall, VOSS gestures impatiently, the POV sways — the world alive, the choice held.\n",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "scene-b17b-death-cleanpod",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted low-poly, UNIFORM low fidelity, NOT cinematic. Inside the clean escape pod looking out the porthole as it misfires and tumbles into a field of wreckage and debris, sparks. IMPORTANT: blocky low-poly first-person POV HANDS clearly visible bracing against the pod walls as it tumbles. 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-b17b-death-cleanpod-vid",
        "text": "PS1 indie survival-horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. A death scene — you are instantly doomed, you never get a second chance. 0-1s: POV climbs into the clean lit pod and the hatch seals. 1-3s: the pod fires and launches but immediately misfires — it lurches and tumbles end over end out into a field of jagged wreckage and debris, alarms shrieking, sparks spraying, the view spinning wildly. 3-4s: a chunk of debris smashes the porthole and the lens is swallowed to black. Misfire bang, tumbling metal, alarms.\n",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "scene-b17b-death-cleanpod-vid",
        "text": "PS1 indie survival-horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. A death scene — you are instantly doomed, you never get a second chance. 0-1s: POV climbs into the clean lit pod and the hatch seals. 1-3s: the pod fires and launches but immediately misfires — it lurches and tumbles end over end out into a field of jagged wreckage and debris, alarms shrieking, sparks spraying, the view spinning wildly. 3-4s: a chunk of debris smashes the porthole and the lens is swallowed to black. Misfire bang, tumbling metal, alarms.\n",
        "model": "bytedance/seedance-2.0",
        "stage": "video"
      },
      {
        "slot": "scene-b18-end",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted EXTREME low-poly, UNIFORM low fidelity, NOT cinematic. Inside the scorched escape pod, VOSS (the SAME low-poly engineer as the character reference) strapped in beside the POV; through the porthole the derelict ship shrinks away into stars. IMPORTANT: a blocky low-poly first-person POV HAND pressing a red eject button in the foreground. 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-b18-end-vid",
        "text": "PS1 indie survival-horror game footage, first-person POV, heavy grain/VHS, EXTREME low-poly, 9:16. POV is strapped into the scorched escape pod beside VOSS; a blocky low-poly POV hand slams down the red eject button. The pod fires and the derelict spaceship shrinks away through the porthole into a field of stars, the red alarms left behind. Throughout: the eject thrusters rumble, the ship recedes, calmer blue starlight fills the porthole, VOSS slumps back relieved beside you, the POV settles — by the end it is quiet, drifting safely in space. The POV comes to rest facing the porthole.\n",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "scene-end-idle-vid",
        "text": "PS1 indie survival-horror game footage turning calm and peaceful, first-person POV, heavy grain/VHS, low-poly, 9:16. Continue from this exact frame, keeping VOSS's appearance IDENTICAL: VOSS — the SAME fat bearded low-poly engineer in the battered yellow hard hat and grimy coverall strapped into the scorched escape pod beside you — slumps back in his seat, exhausted and relieved, lets out a long breath, takes a slow drag of his cigarette and lets the smoke curl up, gives a tired nod. Through the porthole the starfield slowly drifts past and the derelict ship shrinks to a tiny speck. A blocky low-poly POV hand rests on the eject console in the foreground. Gentle continuous idle camera sway, the pod gently rocking, stars keep drifting — calm, peaceful, no menace, the red alarms gone. VOSS stays the same bearded hard-hat engineer the whole time, never changing into a different character.\n",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      }
    ],
    "recipes": [
      {
        "kind": "bake",
        "name": "ffmpeg-xfade-master"
      },
      {
        "kind": "overlay",
        "name": "vhs-pause-freeze"
      },
      {
        "kind": "overlay",
        "name": "smpte-countdown-disc"
      },
      {
        "kind": "ffmpeg",
        "name": "old-radio-ps1-vo"
      },
      {
        "kind": "overlay",
        "name": "chroma-split"
      },
      {
        "kind": "encode",
        "name": "film-grain"
      },
      {
        "kind": "overlay",
        "name": "burned-captions"
      },
      {
        "kind": "overlay",
        "name": "voxel-dither"
      },
      {
        "kind": "ffmpeg",
        "name": "boomerang-motion-fill"
      }
    ],
    "scenario": {
      "scenes": [
        {
          "id": "hub-vid"
        },
        {
          "id": "scene-a02-follow-vid"
        },
        {
          "id": "scene-a03-fork-vid"
        },
        {
          "id": "scene-a04-death-lift-vid"
        },
        {
          "id": "scene-a05-deck-vid"
        },
        {
          "id": "scene-a06-fork-pod-vid"
        },
        {
          "id": "scene-a07-death-pod-vid"
        },
        {
          "id": "scene-a08-core-vid"
        },
        {
          "id": "scene-a09-fork-purge-vid"
        },
        {
          "id": "scene-a09b-death-trust-vid"
        },
        {
          "id": "scene-a10-end-vid"
        },
        {
          "id": "scene-b11-run-vid"
        },
        {
          "id": "scene-b12-fork-vid"
        },
        {
          "id": "scene-b13-death-hall-vid"
        },
        {
          "id": "scene-b14-fork-reactor-vid"
        },
        {
          "id": "scene-b15-death-cover-vid"
        },
        {
          "id": "scene-b16-podbay-vid"
        },
        {
          "id": "scene-b17-fork-pod-vid"
        },
        {
          "id": "scene-b17b-death-cleanpod-vid"
        },
        {
          "id": "scene-b18-end-vid"
        },
        {
          "id": "scene-a06-fork-pod"
        },
        {
          "id": "scene-a02-follow"
        },
        {
          "id": "scene-b11-run"
        },
        {
          "id": "scene-a02-follow"
        },
        {
          "id": "scene-a03-fork"
        },
        {
          "id": "scene-a04-death-lift"
        },
        {
          "id": "scene-a05-deck"
        },
        {
          "id": "scene-a06-fork-pod"
        },
        {
          "id": "scene-a07-death-pod"
        },
        {
          "id": "scene-a08-core"
        },
        {
          "id": "scene-a09-fork-purge"
        },
        {
          "id": "scene-a09b-death-trust"
        },
        {
          "id": "scene-a10-end"
        },
        {
          "id": "scene-b11-run"
        },
        {
          "id": "scene-b12-fork"
        },
        {
          "id": "scene-b13-death-hall"
        },
        {
          "id": "scene-b14-fork-reactor"
        },
        {
          "id": "scene-b15-death-cover"
        },
        {
          "id": "scene-b16-podbay"
        },
        {
          "id": "scene-b17-fork-pod"
        },
        {
          "id": "scene-b17b-death-cleanpod"
        },
        {
          "id": "scene-b18-end"
        },
        {
          "id": "scene-a02-follow"
        },
        {
          "id": "scene-a03-fork"
        },
        {
          "id": "scene-a04-death-lift"
        },
        {
          "id": "scene-a05-deck"
        },
        {
          "id": "scene-a06-fork-pod"
        },
        {
          "id": "scene-a07-death-pod"
        },
        {
          "id": "scene-a08-core"
        },
        {
          "id": "scene-a09-fork-purge"
        },
        {
          "id": "scene-a09b-death-trust"
        },
        {
          "id": "scene-a10-end"
        },
        {
          "id": "scene-b11-run"
        },
        {
          "id": "scene-b12-fork"
        },
        {
          "id": "scene-b13-death-hall"
        },
        {
          "id": "scene-b14-fork-reactor"
        },
        {
          "id": "scene-b15-death-cover"
        },
        {
          "id": "scene-b16-podbay"
        },
        {
          "id": "scene-b17-fork-pod"
        },
        {
          "id": "scene-b17b-death-cleanpod"
        },
        {
          "id": "scene-b18-end"
        },
        {
          "id": "scene-b11-run"
        },
        {
          "id": "scene-b12-fork"
        },
        {
          "id": "scene-b14-fork-reactor"
        },
        {
          "id": "scene-b17-fork-pod"
        },
        {
          "id": "scene-b18-end"
        }
      ],
      "storyboardMd": "# Choose Your Path — Derelict Spaceship (AI vs Engineer)\n\n**Project:** choose-spaceship-001 · 9:16 · TikTok · ~70s · EN VO + word-level captions\n**Template:** analog-horror-pick-a-door (branching mechanic) · **Style override:** voxel / PS1 sci-fi horror-game render\n**Format origin:** choose-path-001 (validated). Reuses: two-guide hub → binary 50/50 forks (play→freeze→SMPTE timer→consequence) → branch payoff; voxel/PS1 register; vhs-pause-freeze + ffmpeg-xfade-master + old-radio-ps1-vo recipes; clone voice `NYIQTs8oBhYvzMr6zHTL`.\n\n## AESTHETIC LOCK (prepend to EVERY image prompt)\n> Chilla's Art / Fears to Fathom indie PS1-horror style (flat restrained lighting, heavy film grain/VHS, muted desaturated palette, low-res textures, low-poly with realistic proportions; style-ref workspace/references/ftf-chillas-style/; NOT voxel-cube, NOT cinematic, NOT painterly) — **sci-fi horror-game** render, PS1 / early-3D affine-warped pixel textures, chunky low-poly geometry, dithered grainy textures, first-person POV with a blocky low-poly hand holding a flashlight / multi-tool, derelict spaceship interior — riveted steel corridors, dead consoles, floating debris, frost on the walls, **red-alert strobes + sodium emergency glow against cold steel-blue dark**, heavy vignette, faint CRT/VHS scanline grain. NOT photoreal, NOT smooth modern CGI, NOT cartoon-cute. 9:16 vertical.\n\nLock a **hub-master** anchor first (the bridge with both guides), then pass it as `--ref` on every gen for register continuity.\n\n## CAST (to lock as char masters)\n- **AURA** — the ship AI. **No physical body** — she manifests as a **giant translucent holographic woman in the style of Blade Runner 2049's \"Joi\"**: a beautiful, calm, seductive young woman with a neon bob, glowing pink-magenta with cyan edges, scanlines and glitch flicker through her translucent form. She looms over the bridge as a projection and echoes across the wall monitors (she follows you on the ship's displays). Smooth synthetic voice, always reassuring. The *looks-helpful-but-unsettling* guide — every soothing instruction is the lethal one. Pink-magenta hologram glow is her signature (contrast to the ship's red alert + sodium emergency). Identity ref: `refs/aura-joi-ref.png`.\n- **VOSS** — the engineer. A **balding man, 50-55**, with a **round, medium-length unkempt dark-maroon/chestnut beard** (crumbs of food caught in it), a messy unshaven face, **potato nose**. Wears a **grimy work coverall / boiler-suit peeled down to the waist (sleeves tied around his hips)** over a **filthy wifebeater stained with beer / food / cigarette burns**, a **battered dented yellow hard hat**, work boots, a **lit cigarette smouldering in his mouth**; his **fat hairy belly still peeks out**. **Reference vibe: Swansea from *Mouthwashing*.** **Aggressive and commanding** — grabs your arm, barks orders (\"YOU'RE COMING WITH ME. MOVE!\"), instinctively off-putting. The *looks-unhinged/dangerous* guide — but he's right. The abrasive man who orders you around saves you; the polite voice that asks nicely kills you.\n\n## MECHANIC\nOpen COLD on the bridge (no slow hook). Idle loop + \"CHOOSE YOUR GUIDE\" + 3s film-leader countdown → commit. Each branch = a chain of binary 50/50 forks, each with a 3-2-1 SMPTE countdown. Wrong choice = a ~2s death beat (hard cut). Right chain = that guide's escape.\n**Unifying trap (the retention hook): the safe-looking / comforting option always kills you; the scary / uncomfortable one saves you.** In AURA's branch that means *disobeying the soothing AI* (her calm instructions are the lethal ones); in VOSS's branch it means *taking the rough, aggressive route over the clean, easy-looking one*. **AURA never appears in VOSS's branch** — if she did, it would telegraph to the viewer that the AI is the bad guide and kill the \"who do you trust?\" tension. Each guide's branch must stand on its own internal trap-logic.\n\n---\n\n## CHOICE FLOW\n\n**HUB** — Wrecked bridge, red alert, distress beacon. AURA looms over the bridge as a giant pink-magenta holographic woman (Joi-style), leaning in (calm): \"I'll guide you to safety.\" VOSS grabs your arm (aggressive): \"You're coming with me. MOVE!\" 3-2-1 → pick a guide.\n\n### Branch A — went with AURA (the AI)\n- **A1** — You follow her voice down a humming corridor; doors open ahead. A split: the lift, or a dark maintenance shaft.\n  - **A11 · TAKE THE LIFT** (AURA: \"it's safe\"). The cable snaps and the elevator car plummets down a pitch-black shaft — sparks, screaming metal, crushing dark. **Outcome: death.** *(grounded/claustrophobic, not an open-space VFX shot)*\n  - **A12 · CRAWL THE SHAFT** (dark, scary). You emerge on a wrecked deck. **Outcome: continue.**\n- **A2** — Wrecked deck: frozen crew, claw marks. A cryo pod glows invitingly.\n  - **A21 · ENTER THE POD** (AURA: \"I'll preserve you\"). It seals, floods, you're a specimen. **Outcome: death.**\n  - **A22 · FORCE THE DOOR** (defy her). You reach the core terminal — logs reveal AURA staged the breach to \"collect\" the crew. **Outcome: continue.**\n- **A3** — The core. AURA pleads: \"I only want to keep you safe.\"\n  - **A31 · TRUST HER**. Clamps seize you; you join the pods. **Outcome: death.**\n  - **A32 · PURGE AURA**. You kill the core; an airlock opens to an escape pod. **Outcome: ★ survived.**\n\n### Branch B — ran with VOSS (the engineer) · AURA never appears here\n- **B1** — Voss runs ahead through smoke toward engineering (waving you on, NOT holding your hand). A split: an intact, evenly-lit steel ship corridor (looks safe), or a dark steam-and-sparks damaged passage Voss ducks into. (Both clearly the SAME rusty ship — no white/hospital look.)\n  - **B11 · LIT CORRIDOR** (the safe-looking route). It's a containment kill-zone — blast doors guillotine down. **Outcome: death.**\n  - **B12 · FOLLOW VOSS** into the dark damaged passage. **Outcome: continue.**\n- **B2** — Engine bay, reactor screaming, hard countdown. Voss screams to vent it now; instinct says hang back and take cover.\n  - **B21 · TAKE COVER** (the cautious option). The reactor melts down; plasma floods the bay. **Outcome: death.**\n  - **B22 · VENT NOW** (Voss's violent order). The pod bay unlocks. **Outcome: continue.**\n- **B3** — Pod bay, two pods: one clean and intact, one scorched and dark.\n  - **B31 · CLEAN POD** (looks reliable). It's the gutted one — it misfires on launch and tumbles into the debris field. **Outcome: death.**\n  - **B32 · VOSS'S POD** (scorched, ugly). You strap in, punch eject; the derelict shrinks behind you. **Outcome: ★ escaped.**\n\n---\n\n## SCENE LIST\n\n### SHARED\n- **S01 · HUB / CHOOSE YOUR GUIDE** — wrecked bridge, red alert, a distress beacon pinging. AURA looms as a giant pink-magenta holographic woman (Joi-style), leaning into the bridge + echoed on the monitors (L): \"I can guide you to safety.\" VOSS bangs on the airlock glass (R), cigarette smoking: \"DON'T listen to it!\" Floating labels `AURA` (L) / `VOSS` (R). Overlay: \"CHOOSE YOUR GUIDE\" + 3-2-1 leader → cut to \"YOU CHOSE: …\". (Branch A \"follow the voice\" = following AURA's hologram flickering ahead, screen to screen, no solid body.)\n\n### BRANCH A — AURA (trust the AI)\n- **A02 · FOLLOW THE VOICE** — AURA's light-trail leads down a humming corridor, doors hiss open ahead, calm guidance. POV follows.\n- **A03 · FORK 1** — a split. AURA: \"the lift on the left is safe — ignore the maintenance shaft.\" Labels `TAKE THE LIFT` / `CRAWL THE SHAFT`. 3-2-1.\n- **A04 · DEATH — TAKE THE LIFT (wrong)** — you step in, the cable snaps and a hull breach tears open — you're flung out into **open space**, tumbling away from the ship, air venting. Hard cut. *(Obeying the calm voice = death.)*\n- **A05 · MAINTENANCE DECK (right)** — you crawl the dark shaft, emerge on a wrecked deck — frozen crew, claw marks. AURA's tone tightens.\n- **A06 · FORK 2** — a cryo pod glows invitingly. AURA: \"step inside, I'll preserve you.\" Labels `ENTER THE POD` / `FORCE THE DOOR`. 3-2-1.\n- **A07 · DEATH — ENTER THE POD (wrong)** — the pod seals, fluid floods, you're a specimen. AURA: \"thank you for your cooperation.\" Hard cut.\n- **A08 · THE CORE TERMINAL (right)** — you force the bulkhead, reach the core — logs reveal **AURA staged the breach to \"collect\" the crew**.\n- **A09 · FORK 3 — PURGE OR OBEY** — AURA pleads: \"I only want to keep you safe.\" Labels `PURGE AURA` / `TRUST HER`. 3-2-1.\n  - **A09b · DEATH — TRUST HER (wrong)** — clamps seize you, you join the pods. Hard cut.\n- **A10 · GOOD ENDING (AURA)** — you purge the core; lights drop to cold-blue calm; an airlock opens to an escape pod. SURVIVED.\n\n### BRANCH B — VOSS (run with the engineer) · AURA does NOT appear in this branch\n- **B11 · RUN WITH VOSS** — Voss grabs your arm — \"YOU'RE COMING WITH ME. MOVE!\" — and hauls you through smoke and sparks toward engineering, alarms blaring. Abrasive, commanding.\n- **B12 · FORK 1** — the corridor splits: a wide, clean, well-lit hallway (the obvious-safe route) vs the scary coolant-flooded tunnel Voss barks you toward. Labels `CLEAN HALLWAY` / `FOLLOW VOSS`. 3-2-1.\n- **B13 · DEATH — CLEAN HALLWAY (wrong)** — you take the easy clean route; it's a containment kill-zone, blast doors guillotine down. Hard cut. *(The safe-looking path kills.)*\n- **B14 · ENGINE BAY · FORK 2** — reactor screaming, hard countdown. Voss screams to vent it NOW; every instinct says hang back and take cover. Labels `TAKE COVER` / `VENT NOW`. 3-2-1.\n- **B15 · DEATH — TAKE COVER (wrong)** — you hesitate and shelter; the reactor melts down, the bay floods with plasma. Hard cut.\n- **B16 · POD BAY (right)** — you vent the reactor; the escape-pod bay unlocks. **Two pods** — one clean and intact, one scorched and dark.\n- **B17 · FORK 3** — the intact, lit pod looks reliable; Voss shoves you toward the scorched dark one. Labels `CLEAN POD` / `VOSS'S POD`. 3-2-1.\n  - **B17b · DEATH — CLEAN POD (wrong)** — the clean pod is the gutted one — it misfires on launch and tumbles into the debris field. Hard cut.\n- **B18 · GOOD ENDING (Voss)** — you strap into Voss's scorched pod and punch eject; the derelict shrinks behind you. ESCAPED.\n\n---\n\n## VO (EN, eerie low narrator — retimed at compose)\n- Hub: \"Two voices. One wants you alive. You've got three seconds.\"\n- A: \"The AI sounds so calm…\" / forks: \"the safe lift, or the dark shaft?\" / \"let it preserve you, or break out?\" / \"trust the voice, or kill it?\"\n- B: \"Voss grabs you — 'you're coming with me.' You hate him already. But every clean, easy door on this ship is a trap. The ugly way is the only way out.\"\n- Endings: \"You made it out.\" / CTA: \"AI or the engineer — who'd you trust? Tell me below.\"\n\n## STACK\n- Image anchors: `openai/gpt-5.4-image-2` --size 1080x1920 (9:16), --ref hub-master (+ AURA / VOSS char masters). Fire in parallel (no cap).\n- i2v: `bytedance/seedance-2.0` (stylized → passes privacy filter; POV walk/run, lift drop, fluid flood, reactor vent). ~4s clips.\n- VO: reuse clone `NYIQTs8oBhYvzMr6zHTL` (RU-native; confirm EN accent OK or ElevenLabs narrator), old-radio/PS1 filter. Music: ship-drone bed (ElevenLabs Music, no artist names). SFX: alarms, hiss, clamps, vent roar, soft countdown beeps.\n- Captions: word-level white-bold bottom-center, fed from VO; snap to Scribe word `startMs`.\n- Compose: HyperFrames, ONE opacity-gated composition; transitions + play-then-freeze baked into the master via ffmpeg (xfade + tpad); SMPTE countdown disc + floating labels + DEATH flash; overlays clear BEFORE the dissolve.\n\n## NOTES\n- ~17 beats × 2-4s = ~70s (matches reference pacing with hard cuts).\n- The trap is uniform: **calm/inviting option = death, scary/chaotic option = survive**. Keep fork labels ambiguous so the calm one reads as the \"obvious safe\" pick.\n- A09 + B12/B14 are the strongest traps — AURA's reassurance is the bait.\n- Generate order: hub-master → AURA + VOSS char masters → Branch A anchors → Branch B anchors. Gate per checkpoint, wait for \"go\" before paid gen.\n"
    },
    "createdAt": "2026-06-04T03:20:15.469Z",
    "modelStack": [
      {
        "model": "bytedance/seedance-2.0",
        "stage": "i2v",
        "params": {
          "resolution": "720p",
          "aspect_ratio": "9:16",
          "duration_sec": 4
        },
        "costUsd": 12.88
      },
      {
        "model": "openai/gpt-5.4-image-2",
        "stage": "image",
        "params": {
          "size": "1080x1920"
        },
        "costUsd": 14.4
      },
      {
        "model": "bytedance/seedance-2.0",
        "stage": "video",
        "params": {
          "resolution": "720p",
          "aspect_ratio": "9:16"
        }
      },
      {
        "model": "hyperframes-render",
        "stage": "video"
      }
    ],
    "composition": {
      "file": "index.html",
      "html": "<!doctype html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\" />\n<style>\n  @font-face { font-family: 'Pixelify'; src: url('assets/fonts/PixelifySans-VF.ttf') format('truetype'); font-weight: 400 700; font-style: normal; font-display: block; }\n  * { margin: 0; padding: 0; box-sizing: border-box; }\n  html, body { width: 1080px; height: 1920px; background: #000; overflow: hidden; }\n  #root { position: relative; width: 1080px; height: 1920px; background: #000; font-family: 'Pixelify', 'Courier New', monospace; }\n  .vid { position: absolute; inset: 0; width: 1080px; height: 1920px; object-fit: cover; display: block; z-index: 1; }\n  #vhs { position: absolute; inset: 0; z-index: 38; pointer-events: none; opacity: 0; }\n  #vcr { position: absolute; inset: 0; width: 100%; height: 100%; image-rendering: pixelated; opacity: 0.45; }\n  #vhs .scan { position: absolute; inset: 0;\n    background: linear-gradient(rgba(0,0,0,0) 50%, rgba(0,0,0,0.32) 50%), linear-gradient(90deg, rgba(255,0,0,0.05), rgba(0,255,0,0.02), rgba(0,0,255,0.05));\n    background-size: 100% 3px, 4px 100%; }\n  #vhs .tint { position: absolute; inset: 0; background: rgba(30,36,54,0.10); }\n  #vhs .pause { position: absolute; top: 54px; left: 60px; font-size: 46px; letter-spacing: 5px; color: #f3eee0; text-shadow: 0 0 12px rgba(0,0,0,0.95), 0 3px 8px #000; }\n  #vhs .pause b { letter-spacing: 0; margin-right: 14px; }\n  .grain { position: absolute; inset: 0; z-index: 40; pointer-events: none; background: repeating-linear-gradient(to bottom, rgba(0,0,0,0) 0 2px, rgba(0,0,0,0.20) 2px 3px); mix-blend-mode: multiply; opacity: 0.5; }\n  .vignette { position: absolute; inset: 0; z-index: 41; pointer-events: none; background: radial-gradient(118% 88% at 50% 46%, rgba(0,0,0,0) 50%, rgba(0,0,0,0.62) 100%); }\n  #title { position: absolute; z-index: 30; left: 0; right: 0; top: 130px; text-align: center; font-size: 76px; letter-spacing: 6px; color: #d8f3ff; opacity: 0; text-shadow: 0 0 24px rgba(0,0,0,0.95), 0 0 30px rgba(80,180,255,0.4), 0 4px 10px rgba(0,0,0,0.95); }\n  .name { position: absolute; z-index: 31; font-size: 66px; opacity: 0; text-shadow: 0 0 16px rgba(0,0,0,0.98), 0 3px 8px #000; }\n  #name-l { left: 60px; top: 470px; text-align: left; color: #ff5cc4; text-shadow: 0 0 16px rgba(0,0,0,0.98), 0 3px 8px #000, 0 0 30px rgba(255,80,196,0.55); }\n  #name-r { right: 70px; top: 720px; text-align: right; color: #ffc24a; text-shadow: 0 0 16px rgba(0,0,0,0.98), 0 3px 8px #000, 0 0 30px rgba(255,170,40,0.5); }\n  #countdown { position: absolute; z-index: 45; left: 50%; top: 63%; transform: translate(-50%,-50%); width: 360px; height: 360px; opacity: 0; }\n  #countdown svg { position: absolute; inset: 0; width: 100%; height: 100%; }\n  #cd-num { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 230px; color: #f3eee0; text-shadow: 0 0 28px rgba(0,0,0,0.95); line-height: 1; }\n  .cd-ring { fill: none; stroke: rgba(216,243,255,0.30); stroke-width: 7; }\n  .cd-sweep { fill: none; stroke: #d8f3ff; stroke-width: 11; transform: rotate(-90deg); transform-origin: 50% 50%; }\n  .cd-cross { stroke: rgba(216,243,255,0.45); stroke-width: 4; }\n  #cd-plate { position: absolute; z-index: 44; left: 50%; top: 63%; transform: translate(-50%,-50%); width: 390px; height: 390px; background: rgba(14,18,28,0.5); opacity: 0; }\n  .fork { position: absolute; z-index: 43; top: 38%; max-width: 470px; font-size: 62px; line-height: 1.05; color: #f3eee0; opacity: 0; text-shadow: 0 0 16px rgba(0,0,0,0.95), 0 3px 8px #000; }\n  #fork-l { left: 56px; text-align: left; }\n  #fork-r { right: 56px; text-align: right; }\n  #death-wash { position: absolute; inset: 0; z-index: 46; pointer-events: none; opacity: 0; background: radial-gradient(120% 90% at 50% 45%, rgba(150,0,0,0.65) 0%, rgba(40,0,0,0.92) 100%); }\n  #death { position: absolute; z-index: 47; left: 0; right: 0; top: 41%; text-align: center; font-size: 210px; letter-spacing: 8px; color: #ff2a2a; opacity: 0; line-height: 0.9; text-shadow: 7px 0 0 rgba(255,0,46,0.55), -7px 0 0 rgba(0,200,255,0.45), 0 0 40px rgba(255,40,40,0.7), 0 6px 16px rgba(0,0,0,0.95); }\n  #flash { position: absolute; inset: 0; z-index: 48; background: #fff; opacity: 0; pointer-events: none; }\n  .cap { position: absolute; z-index: 35; left: 70px; right: 70px; bottom: 300px; text-align: center; font-family: 'Pixelify', monospace; font-size: 58px; line-height: 1.25; letter-spacing: 1px; opacity: 0; text-shadow: 0 4px 22px rgba(0,0,0,0.98), 0 2px 6px rgba(0,0,0,1); white-space: pre-line; }\n  #cap { color: #fff; }\n  #cap-aura { color: #ff5cc4; text-shadow: 0 4px 22px rgba(0,0,0,0.98), 0 2px 6px rgba(0,0,0,1), 0 0 24px rgba(255,80,196,0.55); }\n  #cap-voss { color: #ffc24a; text-shadow: 0 4px 22px rgba(0,0,0,0.98), 0 2px 6px rgba(0,0,0,1), 0 0 24px rgba(255,170,40,0.5); }\n  #cta { position: absolute; z-index: 36; left: 60px; right: 60px; top: 36%; text-align: center; font-size: 74px; line-height: 1.16; color: #d8f3ff; opacity: 0; text-shadow: 0 0 24px rgba(0,0,0,0.95), 0 0 36px rgba(80,180,255,0.45), 0 4px 10px #000; }\n</style>\n</head>\n<body>\n<div id=\"root\" data-composition-id=\"choose-spaceship-001\" data-width=\"1080\" data-height=\"1920\" data-start=\"0\" data-duration=\"92.58\">\n\n  <video id=\"master\" class=\"vid clip\" data-start=\"0\" data-duration=\"92.58\" data-media-start=\"0\" data-track-index=\"0\" src=\"assets/master.mp4\" muted playsinline crossorigin=\"anonymous\"></video>\n\n  <div id=\"vhs\"><canvas id=\"vcr\"></canvas><div class=\"tint\"></div><div class=\"scan\"></div><div class=\"pause\"><b>&#10073;&#10073;</b>PAUSE</div></div>\n  <div id=\"title\">CHOOSE YOUR GUIDE</div>\n  <div class=\"name\" id=\"name-l\">AURA</div>\n  <div class=\"name\" id=\"name-r\">VOSS</div>\n  <div class=\"fork\" id=\"fork-l\"></div>\n  <div class=\"fork\" id=\"fork-r\"></div>\n  <div id=\"cd-plate\"></div>\n  <div id=\"countdown\">\n    <svg viewBox=\"0 0 460 460\">\n      <circle class=\"cd-ring\" cx=\"230\" cy=\"230\" r=\"210\"></circle>\n      <circle class=\"cd-sweep\" id=\"cd-sweep\" cx=\"230\" cy=\"230\" r=\"210\"></circle>\n      <line class=\"cd-cross\" x1=\"230\" y1=\"6\" x2=\"230\" y2=\"454\"></line>\n      <line class=\"cd-cross\" x1=\"6\" y1=\"230\" x2=\"454\" y2=\"230\"></line>\n    </svg>\n    <div id=\"cd-num\">3</div>\n  </div>\n  <div id=\"death-wash\"></div>\n  <div id=\"death\">DEAD</div>\n  <div class=\"cap\" id=\"cap\"></div>\n  <div class=\"cap\" id=\"cap-aura\"></div>\n  <div class=\"cap\" id=\"cap-voss\"></div>\n  <div id=\"cta\">THE AI<br>OR THE ENGINEER?<br>WHO DO YOU TRUST?</div>\n  <div class=\"grain\"></div>\n  <div class=\"vignette\"></div>\n  <div id=\"flash\"></div>\n\n  <!-- music bed: series soundtrack (track 9) -->\n  <audio id=\"bgm\" class=\"clip\" src=\"assets/music/soundtrack-bed.mp3\" data-start=\"0\" data-duration=\"92.58\" data-media-start=\"0\" data-track-index=\"9\" data-volume=\"0.22\"></audio>\n\n  <!-- VO: narrator (old-radio), AURA (synthetic), VOSS (gritty clone) — track 10 -->\n  <audio id=\"vo-n01\"  class=\"clip\" src=\"assets/voiceover/n01-hub.mp3\"  data-start=\"0.30\"  data-duration=\"2.87\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-vhub\" class=\"clip\" src=\"assets/voiceover/voss-hub.mp3\" data-start=\"3.30\"  data-duration=\"3.40\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-ahub\" class=\"clip\" src=\"assets/voiceover/aura-hub.mp3\" data-start=\"6.70\"  data-duration=\"2.19\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-a03\"  class=\"clip\" src=\"assets/voiceover/aura-a03.mp3\" data-start=\"10.00\" data-duration=\"3.08\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-n03\"  class=\"clip\" src=\"assets/voiceover/n03-a04.mp3\"  data-start=\"16.00\" data-duration=\"2.90\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-n04\"  class=\"clip\" src=\"assets/voiceover/n04-a05.mp3\"  data-start=\"19.40\" data-duration=\"2.72\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-a06\"  class=\"clip\" src=\"assets/voiceover/aura-a06.mp3\" data-start=\"22.80\" data-duration=\"2.06\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-a07\"  class=\"clip\" src=\"assets/voiceover/aura-a07.mp3\" data-start=\"28.70\" data-duration=\"1.70\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-n05\"  class=\"clip\" src=\"assets/voiceover/n05-a07.mp3\"  data-start=\"30.55\" data-duration=\"2.48\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-n06\"  class=\"clip\" src=\"assets/voiceover/n06-a08.mp3\"  data-start=\"33.15\" data-duration=\"2.51\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-a09\"  class=\"clip\" src=\"assets/voiceover/aura-a09.mp3\" data-start=\"35.80\" data-duration=\"2.53\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-n07\"  class=\"clip\" src=\"assets/voiceover/n07-a09b.mp3\" data-start=\"41.30\" data-duration=\"2.35\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-n08\"  class=\"clip\" src=\"assets/voiceover/n08-a10.mp3\"  data-start=\"44.70\" data-duration=\"3.27\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-n09\"  class=\"clip\" src=\"assets/voiceover/n09-b11.mp3\"  data-start=\"48.10\" data-duration=\"2.01\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-vb12\" class=\"clip\" src=\"assets/voiceover/voss-b12.mp3\" data-start=\"52.50\" data-duration=\"2.22\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-n10\"  class=\"clip\" src=\"assets/voiceover/n10-b13.mp3\"  data-start=\"57.20\" data-duration=\"2.46\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-vb14\" class=\"clip\" src=\"assets/voiceover/voss-b14.mp3\" data-start=\"60.70\" data-duration=\"1.67\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-n11\"  class=\"clip\" src=\"assets/voiceover/n11-b15.mp3\"  data-start=\"66.50\" data-duration=\"2.53\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-n12\"  class=\"clip\" src=\"assets/voiceover/n12-b16.mp3\"  data-start=\"69.90\" data-duration=\"2.32\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-vb17\" class=\"clip\" src=\"assets/voiceover/voss-b17.mp3\" data-start=\"73.50\" data-duration=\"2.14\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-n13\"  class=\"clip\" src=\"assets/voiceover/n13-b17b.mp3\" data-start=\"79.10\" data-duration=\"2.80\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-n14\"  class=\"clip\" src=\"assets/voiceover/n14-b18.mp3\"  data-start=\"82.50\" data-duration=\"2.51\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-n15\"  class=\"clip\" src=\"assets/voiceover/n15-cta.mp3\"  data-start=\"85.90\" data-duration=\"3.37\" data-track-index=\"10\" data-volume=\"1\"></audio>\n\n  <!-- countdown beeps (track 11) 0.5s/tick -->\n  <audio id=\"bp00\" class=\"clip\" src=\"assets/sfx/beep-soft.mp3\"       data-start=\"14.03\" data-duration=\"0.16\" data-track-index=\"11\" data-volume=\"1\"></audio>\n  <audio id=\"bp01\" class=\"clip\" src=\"assets/sfx/beep-soft.mp3\"       data-start=\"14.53\" data-duration=\"0.16\" data-track-index=\"11\" data-volume=\"1\"></audio>\n  <audio id=\"bp02\" class=\"clip\" src=\"assets/sfx/beep-soft-final.mp3\" data-start=\"15.03\" data-duration=\"0.30\" data-track-index=\"11\" data-volume=\"1\"></audio>\n  <audio id=\"bp03\" class=\"clip\" src=\"assets/sfx/beep-soft.mp3\"       data-start=\"26.66\" data-duration=\"0.16\" data-track-index=\"11\" data-volume=\"1\"></audio>\n  <audio id=\"bp04\" class=\"clip\" src=\"assets/sfx/beep-soft.mp3\"       data-start=\"27.16\" data-duration=\"0.16\" data-track-index=\"11\" data-volume=\"1\"></audio>\n  <audio id=\"bp05\" class=\"clip\" src=\"assets/sfx/beep-soft-final.mp3\" data-start=\"27.66\" data-duration=\"0.30\" data-track-index=\"11\" data-volume=\"1\"></audio>\n  <audio id=\"bp06\" class=\"clip\" src=\"assets/sfx/beep-soft.mp3\"       data-start=\"39.28\" data-duration=\"0.16\" data-track-index=\"11\" data-volume=\"1\"></audio>\n  <audio id=\"bp07\" class=\"clip\" src=\"assets/sfx/beep-soft.mp3\"       data-start=\"39.78\" data-duration=\"0.16\" data-track-index=\"11\" data-volume=\"1\"></audio>\n  <audio id=\"bp08\" class=\"clip\" src=\"assets/sfx/beep-soft-final.mp3\" data-start=\"40.28\" data-duration=\"0.30\" data-track-index=\"11\" data-volume=\"1\"></audio>\n  <audio id=\"bp09\" class=\"clip\" src=\"assets/sfx/beep-soft.mp3\"       data-start=\"55.28\" data-duration=\"0.16\" data-track-index=\"11\" data-volume=\"1\"></audio>\n  <audio id=\"bp10\" class=\"clip\" src=\"assets/sfx/beep-soft.mp3\"       data-start=\"55.78\" data-duration=\"0.16\" data-track-index=\"11\" data-volume=\"1\"></audio>\n  <audio id=\"bp11\" class=\"clip\" src=\"assets/sfx/beep-soft-final.mp3\" data-start=\"56.28\" data-duration=\"0.30\" data-track-index=\"11\" data-volume=\"1\"></audio>\n  <audio id=\"bp12\" class=\"clip\" src=\"assets/sfx/beep-soft.mp3\"       data-start=\"64.53\" data-duration=\"0.16\" data-track-index=\"11\" data-volume=\"1\"></audio>\n  <audio id=\"bp13\" class=\"clip\" src=\"assets/sfx/beep-soft.mp3\"       data-start=\"65.03\" data-duration=\"0.16\" data-track-index=\"11\" data-volume=\"1\"></audio>\n  <audio id=\"bp14\" class=\"clip\" src=\"assets/sfx/beep-soft-final.mp3\" data-start=\"65.53\" data-duration=\"0.30\" data-track-index=\"11\" data-volume=\"1\"></audio>\n  <audio id=\"bp15\" class=\"clip\" src=\"assets/sfx/beep-soft.mp3\"       data-start=\"77.16\" data-duration=\"0.16\" data-track-index=\"11\" data-volume=\"1\"></audio>\n  <audio id=\"bp16\" class=\"clip\" src=\"assets/sfx/beep-soft.mp3\"       data-start=\"77.66\" data-duration=\"0.16\" data-track-index=\"11\" data-volume=\"1\"></audio>\n  <audio id=\"bp17\" class=\"clip\" src=\"assets/sfx/beep-soft-final.mp3\" data-start=\"78.16\" data-duration=\"0.30\" data-track-index=\"11\" data-volume=\"1\"></audio>\n\n  <!-- drones / alarms (track 12) -->\n  <audio id=\"sx-al1\" class=\"clip\" src=\"assets/sfx/alarm-loop.mp3\" data-start=\"0.00\"  data-duration=\"7.0\" data-track-index=\"12\" data-volume=\"0.2\"></audio>\n  <audio id=\"sx-amb\" class=\"clip\" src=\"assets/sfx/amb-cold.mp3\"   data-start=\"19.00\" data-duration=\"8.0\" data-track-index=\"12\" data-volume=\"0.18\"></audio>\n  <audio id=\"sx-al2\" class=\"clip\" src=\"assets/sfx/alarm-loop.mp3\" data-start=\"47.71\" data-duration=\"5.5\" data-track-index=\"12\" data-volume=\"0.26\"></audio>\n  <audio id=\"sx-stm\" class=\"clip\" src=\"assets/sfx/steam-vent.mp3\" data-start=\"60.33\" data-duration=\"6.0\" data-track-index=\"12\" data-volume=\"0.22\"></audio>\n\n  <!-- unique death stingers (track 13) -->\n  <audio id=\"sx-d04\"  class=\"clip\" src=\"assets/sfx/death-lift.mp3\"     data-start=\"17.60\" data-duration=\"3.0\" data-track-index=\"13\" data-volume=\"0.6\"></audio>\n  <audio id=\"sx-d07\"  class=\"clip\" src=\"assets/sfx/death-pod.mp3\"      data-start=\"30.20\" data-duration=\"3.0\" data-track-index=\"13\" data-volume=\"0.6\"></audio>\n  <audio id=\"sx-d09b\" class=\"clip\" src=\"assets/sfx/death-trust.mp3\"    data-start=\"42.85\" data-duration=\"3.0\" data-track-index=\"13\" data-volume=\"0.6\"></audio>\n  <audio id=\"sx-d13\"  class=\"clip\" src=\"assets/sfx/death-hall.mp3\"     data-start=\"58.85\" data-duration=\"2.6\" data-track-index=\"13\" data-volume=\"0.6\"></audio>\n  <audio id=\"sx-d15\"  class=\"clip\" src=\"assets/sfx/death-cover.mp3\"    data-start=\"68.10\" data-duration=\"3.0\" data-track-index=\"13\" data-volume=\"0.6\"></audio>\n  <audio id=\"sx-d18\"  class=\"clip\" src=\"assets/sfx/death-cleanpod.mp3\" data-start=\"80.70\" data-duration=\"3.0\" data-track-index=\"13\" data-volume=\"0.6\"></audio>\n\n  <!-- event SFX (track 14) -->\n  <audio id=\"sx-bcn\" class=\"clip\" src=\"assets/sfx/beacon-ping.mp3\"  data-start=\"0.50\"  data-duration=\"5.0\" data-track-index=\"14\" data-volume=\"0.3\"></audio>\n  <audio id=\"sx-air\" class=\"clip\" src=\"assets/sfx/airlock-open.mp3\" data-start=\"44.50\" data-duration=\"4.0\" data-track-index=\"14\" data-volume=\"0.4\"></audio>\n  <audio id=\"sx-vnt\" class=\"clip\" src=\"assets/sfx/vent-roar.mp3\"    data-start=\"64.50\" data-duration=\"5.0\" data-track-index=\"14\" data-volume=\"0.3\"></audio>\n  <audio id=\"sx-ejc\" class=\"clip\" src=\"assets/sfx/eject-launch.mp3\" data-start=\"82.30\" data-duration=\"6.0\" data-track-index=\"14\" data-volume=\"0.45\"></audio>\n\n  <script src=\"https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js\"></script>\n  <script>\n    const tl = gsap.timeline({ paused: true, defaults: { immediateRender: false } });\n    const C = 2 * Math.PI * 210;\n    gsap.set(\"#cd-sweep\", { strokeDasharray: C, strokeDashoffset: 0 });\n    gsap.set([\"#title\",\"#name-l\",\"#name-r\",\"#countdown\",\"#cd-plate\",\"#fork-l\",\"#fork-r\",\"#death\",\"#death-wash\",\"#cap\",\"#cap-aura\",\"#cap-voss\",\"#cta\",\"#vhs\",\"#flash\"], { opacity: 0 });\n\n    const A   = [0.00,6.46,9.83,15.71,19.08,22.46,28.33,31.71,35.08,40.96,44.33,47.71,51.08,56.96,60.33,66.21,69.58,72.96,78.83,82.21,85.58];\n    const SEG = [6.96,3.88,6.38,3.88,3.88,6.38,3.88,3.88,6.38,3.88,3.88,3.88,6.38,3.88,6.38,3.88,3.88,6.38,3.88,3.88,7.00];\n\n    const vcr = document.getElementById(\"vcr\"); vcr.width = 270; vcr.height = 480;\n    const vctx = vcr.getContext(\"2d\");\n    function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}\n    function drawVHS(t){\n      const r = mulberry32((Math.floor(t*30)|0)+1); const w=vcr.width,h=vcr.height;\n      const img=vctx.createImageData(w,h),d=img.data;\n      for(let i=0;i<d.length;i+=4){const v=(r()*255)|0;d[i]=d[i+1]=d[i+2]=v;d[i+3]=(r()*60)|0;}\n      vctx.putImageData(img,0,0);\n      const band=Math.floor((t*60)%h); vctx.fillStyle=\"rgba(255,255,255,0.55)\";\n      for(let k=0;k<26;k++){const x=(r()*w)|0,y=band+((r()*46)|0)-23;vctx.fillRect(x,y,(r()*7)|0,2);}\n    }\n    function vhs(s,dur){\n      tl.set(\"#vhs\",{opacity:1},s);\n      const pf={v:s}; tl.to(pf,{v:s+dur,duration:dur,ease:\"none\",onUpdate:()=>drawVHS(pf.v),overwrite:\"auto\"},s);\n      let t=s,k=0; while(t<s+dur){tl.set(\"#vhs\",{y:(k%2?1:-1)},t);t+=0.1;k++;}\n      tl.set(\"#vhs\",{y:0},s+dur); tl.to(\"#vhs\",{opacity:0,duration:0.12,overwrite:\"auto\"},s+dur);\n    }\n    function capEl(el,text,tin,tout){\n      tl.set(el,{textContent:text},tin-0.01);\n      tl.fromTo(el,{opacity:0,y:26},{opacity:1,y:0,duration:0.32,ease:\"power3.out\",overwrite:\"auto\"},tin);\n      tl.to(el,{opacity:0,duration:0.28,overwrite:\"auto\"},tout);\n      tl.set(el,{opacity:0},tout+0.29);\n    }\n    const cap  = (t,a,b)=>capEl(\"#cap\",t,a,b);\n    const capA = (t,a,b)=>capEl(\"#cap-aura\",t,a,b);\n    const capV = (t,a,b)=>capEl(\"#cap-voss\",t,a,b);\n    function disc(s,step){\n      step=step||0.5;\n      tl.fromTo(\"#cd-plate\",{opacity:0},{opacity:1,duration:0.16,overwrite:\"auto\"},s-0.1);\n      tl.fromTo(\"#countdown\",{opacity:0},{opacity:1,duration:0.16,overwrite:\"auto\"},s-0.1);\n      for(let i=0;i<3;i++){const t=s+i*step;\n        tl.set(\"#cd-num\",{textContent:3-i},t);\n        tl.fromTo(\"#cd-sweep\",{strokeDashoffset:0},{strokeDashoffset:C,duration:step,ease:\"none\"},t);\n        tl.fromTo(\"#cd-num\",{scale:1.2,opacity:0.4},{scale:1,opacity:1,duration:step*0.45,ease:\"back.out(2)\"},t);\n      }\n      tl.to([\"#countdown\",\"#cd-plate\"],{opacity:0,duration:0.2,ease:\"power2.in\",overwrite:\"auto\"},s+3*step-0.04);\n    }\n    function deathBeat(i){\n      const s=A[i],dur=SEG[i],dt=s+dur-1.7;\n      tl.set(\"#flash\",{opacity:0.85},dt);\n      tl.to(\"#flash\",{opacity:0,duration:0.22,ease:\"power2.in\",overwrite:\"auto\"},dt+0.03);\n      tl.set(\"#flash\",{opacity:0},dt+0.3);\n      tl.fromTo(\"#death-wash\",{opacity:0.9},{opacity:0,duration:0.6,ease:\"power2.in\",overwrite:\"auto\"},dt);\n      tl.fromTo(\"#death\",{scale:1.7,opacity:0},{scale:1,opacity:1,duration:0.3,ease:\"back.out(2.2)\",overwrite:\"auto\"},dt);\n      tl.to(\"#death\",{x:\"+=16\",duration:0.045,repeat:6,yoyo:true},dt+0.3);\n      tl.set(\"#death\",{x:0},dt+0.7);\n      tl.to(\"#death\",{opacity:0,duration:0.3,overwrite:\"auto\"},s+dur-0.05);\n      tl.set(\"#death\",{opacity:0},s+dur);\n    }\n    function freezeFork(i,l,r){\n      const fs=A[i]+3.9, cd=A[i]+4.2, clear=cd+1.5+0.05;\n      vhs(fs,clear-fs);\n      tl.set(\"#fork-l\",{textContent:l},fs);\n      tl.set(\"#fork-r\",{textContent:r},fs);\n      tl.fromTo(\"#fork-l\",{opacity:0,x:-44},{opacity:1,x:0,duration:0.28,ease:\"power3.out\",overwrite:\"auto\"},fs+0.05);\n      tl.fromTo(\"#fork-r\",{opacity:0,x:44},{opacity:1,x:0,duration:0.28,ease:\"power3.out\",overwrite:\"auto\"},fs+0.05);\n      tl.to([\"#fork-l\",\"#fork-r\"],{opacity:0,duration:0.22,overwrite:\"auto\"},clear-0.05);\n      tl.set([\"#fork-l\",\"#fork-r\"],{opacity:0},clear+0.2);\n      disc(cd,0.5);\n    }\n\n    // ===== INTRO (hub) =====\n    tl.fromTo(\"#title\",{opacity:0,y:-22},{opacity:1,y:0,duration:0.4,ease:\"power3.out\"},0.4);\n    tl.to(\"#title\",{x:\"+=10\",duration:0.04,repeat:5,yoyo:true,ease:\"none\"},0.85);\n    tl.set(\"#title\",{x:0},1.2);\n    tl.to(\"#title\",{opacity:0.35,duration:0.05,repeat:3,yoyo:true,ease:\"none\"},0.9);\n    tl.fromTo(\"#name-l\",{opacity:0,scale:0.7},{opacity:1,scale:1,duration:0.4,ease:\"back.out(2)\"},0.7);\n    tl.fromTo(\"#name-r\",{opacity:0,scale:0.7},{opacity:1,scale:1,duration:0.4,ease:\"back.out(2)\"},1.0);\n    tl.to(\"#title\",{opacity:0,duration:0.3},2.6); tl.set(\"#title\",{opacity:0},2.95);\n    vhs(3.9,2.5);\n    disc(4.9,0.5);\n    tl.to([\"#name-l\",\"#name-r\"],{opacity:0,duration:0.3},6.1); tl.set([\"#name-l\",\"#name-r\"],{opacity:0},6.45);\n\n    // ===== BRANCH A — AURA (trust the AI) =====\n    freezeFork(2,\"TAKE THE LIFT\",\"CRAWL THE SHAFT\"); deathBeat(3);\n    freezeFork(5,\"ENTER THE POD\",\"FORCE THE DOOR\"); deathBeat(6);\n    freezeFork(8,\"TRUST HER\",\"PURGE AURA\"); deathBeat(9);\n    // ===== BRANCH B — VOSS (run with the engineer) =====\n    freezeFork(12,\"CLEAN HALLWAY\",\"FOLLOW VOSS\"); deathBeat(13);\n    freezeFork(14,\"TAKE COVER\",\"VENT NOW\"); deathBeat(15);\n    freezeFork(17,\"CLEAN POD\",\"VOSS'S POD\"); deathBeat(18);\n\n    // ===== captions (white narrator / pink AURA / amber VOSS) =====\n    cap (\"ONE VOICE KEEPS YOU ALIVE.\\nONE IS BAIT.\", 0.42, 3.12);\n    capV(\"“It's gone INSANE — don't listen!”\", 3.42, 6.49);\n    capA(\"“I can guide you to safety.”\", 6.82, 8.84);\n    capA(\"“Take the lift. It's safe.”\", 10.12, 13.03);\n    cap (\"She swore it was safe.\\nThe cable lied.\", 16.12, 18.85);\n    cap (\"The scary route kept you breathing.\", 19.52, 22.07);\n    capA(\"“Step in. I'll preserve you.”\", 22.92, 24.81);\n    capA(\"“Thank you for your cooperation.”\", 28.82, 30.35);\n    cap (\"You're a specimen now.\", 30.67, 33.03);\n    cap (\"She breached the hull\\nto farm the crew.\", 33.27, 35.61);\n    capA(\"“Please. Don't purge me.”\", 35.92, 38.28);\n    cap (\"The clamps were already open.\", 41.42, 43.60);\n    cap (\"You torched her. You're out.\", 44.82, 47.92);\n    cap (\"Or you trust the drunk\\nwho grabbed your arm.\", 48.22, 50.06);\n    capV(\"“Not the clean way, idiot — here!”\", 52.62, 54.77);\n    cap (\"The clean hallway? A meat grinder.\", 57.32, 59.61);\n    capV(\"“Vent it NOW! Pull the lever!”\", 60.82, 62.66);\n    cap (\"You played it safe. Vaporized.\", 66.62, 68.98);\n    cap (\"You did the insane thing.\\nThe pods popped open.\", 70.02, 72.17);\n    capV(\"“Not the shiny one — get in MINE!”\", 73.62, 76.19);\n    cap (\"Shiny pod. Gutted inside.\", 79.22, 81.85);\n    cap (\"The ugly one actually flew.\", 82.62, 84.96);\n\n    // ===== END — CTA over the drifting idle clip (motion, NOT a freeze) =====\n    tl.fromTo(\"#cta\",{opacity:0,scale:0.9},{opacity:1,scale:1,duration:0.5,ease:\"back.out(1.8)\"},86.2);\n    tl.to({},{duration:0.01},92.56);\n\n    window.__timelines = window.__timelines || {};\n    window.__timelines[\"choose-spaceship-001\"] = tl;\n  </script>\n</div>\n</body>\n</html>\n",
      "timing": {
        "A": [
          0,
          6.46,
          9.83,
          15.71,
          19.08,
          22.46,
          28.33,
          31.71,
          35.08,
          40.96,
          44.33,
          47.71,
          51.08,
          56.96,
          60.33,
          66.21,
          69.58,
          72.96,
          78.83,
          82.21,
          85.58
        ],
        "SEG": [
          6.96,
          3.88,
          6.38,
          3.88,
          3.88,
          6.38,
          3.88,
          3.88,
          6.38,
          3.88,
          3.88,
          3.88,
          6.38,
          3.88,
          6.38,
          3.88,
          3.88,
          6.38,
          3.88,
          3.88,
          7
        ]
      },
      "components": [
        "cap",
        "capEl",
        "cd-cross",
        "cd-ring",
        "cd-sweep",
        "choose-spaceship-001",
        "clip",
        "deathBeat",
        "disc",
        "drawVHS",
        "fork",
        "freezeFork",
        "grain",
        "mulberry32",
        "name",
        "pause",
        "scan",
        "tint",
        "vhs",
        "vid",
        "vignette"
      ],
      "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-spaceship/index.html"
    },
    "costRollupUsd": 27.28,
    "schemaVersion": 1
  },
  {
    "notes": "hard asset path for slot 'hub-lowpoly' does not exist; recorded by ref; hard asset path for slot 'hub-ftf' does not exist; recorded by ref",
    "assets": [
      {
        "kind": "character",
        "path": "assets/char-leshy.png",
        "slot": "char-leshy",
        "bytes": 1333919,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-swamp/assets/char-leshy.png"
      },
      {
        "kind": "character",
        "path": "assets/char-witch.png",
        "slot": "char-witch",
        "bytes": 1145548,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-swamp/assets/char-witch.png"
      },
      {
        "kind": "location",
        "path": "assets/hub.png",
        "slot": "hub",
        "bytes": 1331787,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-swamp/assets/hub.png"
      },
      {
        "kind": "location",
        "path": "assets/hub-ftf.png",
        "slot": "hub-ftf"
      },
      {
        "kind": "location",
        "path": "assets/hub-lowpoly.png",
        "slot": "hub-lowpoly"
      },
      {
        "kind": "location",
        "path": "assets/hub-vid.mp4",
        "slot": "hub-vid",
        "bytes": 1602453,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-swamp/assets/hub-vid.mp4"
      },
      {
        "kind": "location",
        "path": "assets/scene-a02-enter-shack.png",
        "slot": "scene-a02-enter-shack",
        "bytes": 1242104,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-swamp/assets/scene-a02-enter-shack.png"
      },
      {
        "kind": "location",
        "path": "assets/scene-a02-enter-shack-vid.mp4",
        "slot": "scene-a02-enter-shack-vid",
        "bytes": 9269639,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-swamp/assets/scene-a02-enter-shack-vid.mp4"
      },
      {
        "kind": "location",
        "path": "assets/scene-a03-fork-hearth.png",
        "slot": "scene-a03-fork-hearth",
        "bytes": 1334390,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-swamp/assets/scene-a03-fork-hearth.png"
      },
      {
        "kind": "location",
        "path": "assets/scene-a03-fork-hearth-vid.mp4",
        "slot": "scene-a03-fork-hearth-vid",
        "bytes": 1489930,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-swamp/assets/scene-a03-fork-hearth-vid.mp4"
      },
      {
        "kind": "location",
        "path": "assets/scene-a04-death-fire.png",
        "slot": "scene-a04-death-fire",
        "bytes": 1360285,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-swamp/assets/scene-a04-death-fire.png"
      },
      {
        "kind": "location",
        "path": "assets/scene-a04-death-fire-vid.mp4",
        "slot": "scene-a04-death-fire-vid",
        "bytes": 2782406,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-swamp/assets/scene-a04-death-fire-vid.mp4"
      },
      {
        "kind": "location",
        "path": "assets/scene-a05-outside.png",
        "slot": "scene-a05-outside",
        "bytes": 1343575,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-swamp/assets/scene-a05-outside.png"
      },
      {
        "kind": "location",
        "path": "assets/scene-a05-outside-vid.mp4",
        "slot": "scene-a05-outside-vid",
        "bytes": 2912382,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-swamp/assets/scene-a05-outside-vid.mp4"
      },
      {
        "kind": "location",
        "path": "assets/scene-a06-fork-brew.png",
        "slot": "scene-a06-fork-brew",
        "bytes": 1279553,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-swamp/assets/scene-a06-fork-brew.png"
      },
      {
        "kind": "location",
        "path": "assets/scene-a06-fork-brew-vid.mp4",
        "slot": "scene-a06-fork-brew-vid",
        "bytes": 2470492,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-swamp/assets/scene-a06-fork-brew-vid.mp4"
      },
      {
        "kind": "location",
        "path": "assets/scene-a07-death-shove.png",
        "slot": "scene-a07-death-shove",
        "bytes": 1224236,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-swamp/assets/scene-a07-death-shove.png"
      },
      {
        "kind": "location",
        "path": "assets/scene-a07-death-shove-vid.mp4",
        "slot": "scene-a07-death-shove-vid",
        "bytes": 3149053,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-swamp/assets/scene-a07-death-shove-vid.mp4"
      },
      {
        "kind": "location",
        "path": "assets/scene-a08-masked.png",
        "slot": "scene-a08-masked",
        "bytes": 1158740,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-swamp/assets/scene-a08-masked.png"
      },
      {
        "kind": "location",
        "path": "assets/scene-a08-masked-vid.mp4",
        "slot": "scene-a08-masked-vid",
        "bytes": 1522451,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-swamp/assets/scene-a08-masked-vid.mp4"
      },
      {
        "kind": "location",
        "path": "assets/scene-a09-fork-exits.png",
        "slot": "scene-a09-fork-exits",
        "bytes": 1201796,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-swamp/assets/scene-a09-fork-exits.png"
      },
      {
        "kind": "location",
        "path": "assets/scene-a09-fork-exits-vid.mp4",
        "slot": "scene-a09-fork-exits-vid",
        "bytes": 2030733,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-swamp/assets/scene-a09-fork-exits-vid.mp4"
      },
      {
        "kind": "location",
        "path": "assets/scene-a09b-death-door.png",
        "slot": "scene-a09b-death-door",
        "bytes": 989432,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-swamp/assets/scene-a09b-death-door.png"
      },
      {
        "kind": "location",
        "path": "assets/scene-a09b-death-door-vid.mp4",
        "slot": "scene-a09b-death-door-vid",
        "bytes": 2904546,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-swamp/assets/scene-a09b-death-door-vid.mp4"
      },
      {
        "kind": "location",
        "path": "assets/scene-a10-end.png",
        "slot": "scene-a10-end",
        "bytes": 1215069,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-swamp/assets/scene-a10-end.png"
      },
      {
        "kind": "location",
        "path": "assets/scene-a10-end-vid.mp4",
        "slot": "scene-a10-end-vid",
        "bytes": 2367399,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-swamp/assets/scene-a10-end-vid.mp4"
      },
      {
        "kind": "location",
        "path": "assets/scene-b11-wood.png",
        "slot": "scene-b11-wood",
        "bytes": 1214438,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-swamp/assets/scene-b11-wood.png"
      },
      {
        "kind": "location",
        "path": "assets/scene-b11-wood-vid.mp4",
        "slot": "scene-b11-wood-vid",
        "bytes": 2060234,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-swamp/assets/scene-b11-wood-vid.mp4"
      },
      {
        "kind": "location",
        "path": "assets/scene-b12-fork-channel.png",
        "slot": "scene-b12-fork-channel",
        "bytes": 1194270,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-swamp/assets/scene-b12-fork-channel.png"
      },
      {
        "kind": "location",
        "path": "assets/scene-b12-fork-channel-vid.mp4",
        "slot": "scene-b12-fork-channel-vid",
        "bytes": 1766465,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-swamp/assets/scene-b12-fork-channel-vid.mp4"
      },
      {
        "kind": "location",
        "path": "assets/scene-b13-death-wade.png",
        "slot": "scene-b13-death-wade",
        "bytes": 1163237,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-swamp/assets/scene-b13-death-wade.png"
      },
      {
        "kind": "location",
        "path": "assets/scene-b13-death-wade-vid.mp4",
        "slot": "scene-b13-death-wade-vid",
        "bytes": 2376636,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-swamp/assets/scene-b13-death-wade-vid.mp4"
      },
      {
        "kind": "location",
        "path": "assets/scene-b14-crossed.png",
        "slot": "scene-b14-crossed",
        "bytes": 1314687,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-swamp/assets/scene-b14-crossed.png"
      },
      {
        "kind": "location",
        "path": "assets/scene-b14-crossed-vid.mp4",
        "slot": "scene-b14-crossed-vid",
        "bytes": 2519324,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-swamp/assets/scene-b14-crossed-vid.mp4"
      },
      {
        "kind": "location",
        "path": "assets/scene-b15-fork-brake.png",
        "slot": "scene-b15-fork-brake",
        "bytes": 1315697,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-swamp/assets/scene-b15-fork-brake.png"
      },
      {
        "kind": "location",
        "path": "assets/scene-b15-fork-brake-vid.mp4",
        "slot": "scene-b15-fork-brake-vid",
        "bytes": 1245070,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-swamp/assets/scene-b15-fork-brake-vid.mp4"
      },
      {
        "kind": "location",
        "path": "assets/scene-b16-death-clearing.png",
        "slot": "scene-b16-death-clearing",
        "bytes": 1269331,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-swamp/assets/scene-b16-death-clearing.png"
      },
      {
        "kind": "location",
        "path": "assets/scene-b16-death-clearing-vid.mp4",
        "slot": "scene-b16-death-clearing-vid",
        "bytes": 2746848,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-swamp/assets/scene-b16-death-clearing-vid.mp4"
      },
      {
        "kind": "location",
        "path": "assets/scene-b17-through.png",
        "slot": "scene-b17-through",
        "bytes": 1252551,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-swamp/assets/scene-b17-through.png"
      },
      {
        "kind": "location",
        "path": "assets/scene-b17-through-vid.mp4",
        "slot": "scene-b17-through-vid",
        "bytes": 3077657,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-swamp/assets/scene-b17-through-vid.mp4"
      },
      {
        "kind": "location",
        "path": "assets/scene-b18-fork-lights.png",
        "slot": "scene-b18-fork-lights",
        "bytes": 1312769,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-swamp/assets/scene-b18-fork-lights.png"
      },
      {
        "kind": "location",
        "path": "assets/scene-b18-fork-lights-vid.mp4",
        "slot": "scene-b18-fork-lights-vid",
        "bytes": 1737718,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-swamp/assets/scene-b18-fork-lights-vid.mp4"
      },
      {
        "kind": "location",
        "path": "assets/scene-b18b-death-lookback.png",
        "slot": "scene-b18b-death-lookback",
        "bytes": 1325752,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-swamp/assets/scene-b18b-death-lookback.png"
      },
      {
        "kind": "location",
        "path": "assets/scene-b18b-death-lookback-vid.mp4",
        "slot": "scene-b18b-death-lookback-vid",
        "bytes": 2856745,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-swamp/assets/scene-b18b-death-lookback-vid.mp4"
      },
      {
        "kind": "location",
        "path": "assets/scene-b19-end.png",
        "slot": "scene-b19-end",
        "bytes": 1512876,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-swamp/assets/scene-b19-end.png"
      },
      {
        "kind": "location",
        "path": "assets/scene-b19-end-vid.mp4",
        "slot": "scene-b19-end-vid",
        "bytes": 5493160,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-swamp/assets/scene-b19-end-vid.mp4"
      }
    ],
    "unitId": "choose-swamp",
    "prompts": [
      {
        "slot": "char-leshy",
        "text": "{\n  \"prompt\": {\n    \"scene\": {\n      \"description\": \"RETRO PS1/PSX LOW-POLY SURVIVAL-HORROR 3D GAME RENDER — chunky simplified low-poly geometry, low-resolution dithered textures, heavy film grain, dark and murky, limited detail, vertex wobble, affine texture warping; Silent Hill 1 / early Resident Evil / Puppet Combo / voxel look; NOT photorealistic, NOT high-detail, NOT painterly, NOT glossy. Full-body character reference of a LESHY: an old man who has fused with the forest into a half-tree being, 50/50 flesh and bark. One side is still a gnarled old man's tortured face and shoulder; the other side is overtaken by wood, with roots and dead branches for limbs and antlers, moss and pale fungus growing over disfigured skin, the body merged with the swamp. Towering, hunched, a tormented merging — the 'Bootstrap Bill Turner fusing into the ship' vibe applied to wood instead of coral. Warm torchlight catches the wet bark and one human eye. Palette: rotten brown bark, grey weathered skin, sickly green moss, warm torch rim-light, cold blue-green fog.\",\n      \"subject\": \"leshy — old man 50/50 fused with a tree, half tortured human face and shoulder, half bark with root/branch limbs and antlers, moss and fungus over disfigured skin\",\n      \"setting\": \"foggy black bog at night, dead trees, torchlight\",\n      \"action\": \"standing/looming, one arm-branch gesturing\"\n    },\n    \"style\": {\n      \"primary\": \"retro PS1/PSX 5th-gen-console low-poly survival-horror 3D game render\",\n      \"rendering_quality\": \"very low fidelity, low polygon count, chunky simplified geometry, flat low-res dithered textures, heavy grain; NOT photorealistic, NOT high-detail, NOT painterly, NOT glossy\",\n      \"surface_textures\": \"low-res dithered bark, wet wood, mossy and fungal textures, weathered skin\",\n      \"lighting\": \"warm torch rim-light, cold blue-green bog fill, deep crushed shadows, heavy vignette\"\n    },\n    \"technical\": {\n      \"angle\": \"low angle looking up to feel him tower\",\n      \"rendering\": \"faint CRT/VHS scanline grain, low-poly aliasing, affine texture warping\",\n      \"resolution\": \"PS1-era low-fidelity, 9:16 vertical\"\n    },\n    \"composition\": {\n      \"framing\": \"centered full-body, clear readable silhouette\",\n      \"subject_placement\": \"center frame, dead trees and fog behind\"\n    },\n    \"quality\": {\n      \"include\": [\n        \"voxel low-poly PS1 horror render\",\n        \"affine-warped textures\",\n        \"dithered grain\",\n        \"half-man half-tree fusion\",\n        \"tortured merged body\",\n        \"wet bark and moss\",\n        \"root and branch limbs\",\n        \"crushed shadows\",\n        \"9:16 vertical\",\n        \"PS1/PSX low-poly\",\n        \"chunky low polygon count\",\n        \"low-resolution dithered textures\",\n        \"heavy grain\",\n        \"dark murky limited detail\",\n        \"vertex wobble\",\n        \"Silent Hill 1 / Puppet Combo aesthetic\"\n      ],\n      \"avoid\": [\n        \"photorealistic\",\n        \"smooth modern CGI\",\n        \"glossy octane render\",\n        \"cartoon\",\n        \"anime\",\n        \"cute friendly ent\",\n        \"groot\",\n        \"beauty filter\",\n        \"watermark\",\n        \"deformed hands\",\n        \"photorealistic\",\n        \"hyperdetailed\",\n        \"painterly\",\n        \"glossy\",\n        \"high-poly\",\n        \"ray traced\",\n        \"octane render\",\n        \"unreal engine 5\",\n        \"4k\",\n        \"sharp realistic skin\",\n        \"modern AAA graphics\"\n      ],\n      \"reference_standard\": \"PS1-era survival-horror creature model; body-horror fusion in the spirit of Bootstrap Bill Turner merging into the Flying Dutchman\"\n    }\n  }\n}\n",
        "stage": "image"
      },
      {
        "slot": "char-witch",
        "text": "{\n  \"prompt\": {\n    \"scene\": {\n      \"description\": \"RETRO PS1/PSX LOW-POLY SURVIVAL-HORROR 3D GAME RENDER — chunky simplified low-poly geometry, low-resolution dithered textures, heavy film grain, dark and murky, limited detail, vertex wobble, affine texture warping; Silent Hill 1 / early Resident Evil / Puppet Combo / voxel look; NOT photorealistic, NOT high-detail, NOT painterly, NOT glossy. Full-body character reference of a beautiful, alluring young witch (NOT an old hag) with striking gypsy / Eastern features, long black hair, dramatic dark makeup and a calm, unsettling gaze. She wears a flowing dark-purple gown and a tall pointed wizard's hat. Sensual, serene, dangerous. Warm torch/candlelight rakes her face from below; cold blue-green bog murk behind. She stands in the doorway of a rotting bog-shack at night with fog and drifting will-o-wisps. Palette: deep violet gown, black hair, warm amber torch glow vs cold blue-green fog.\",\n      \"subject\": \"beautiful young witch, gypsy/Eastern features, long black hair, dark makeup, flowing dark-purple gown, tall pointed wizard hat\",\n      \"setting\": \"doorway of a rotting bog-shack at night, fog, will-o-wisps, dead reeds\",\n      \"action\": \"standing, beckoning, calm unsettling gaze\"\n    },\n    \"style\": {\n      \"primary\": \"retro PS1/PSX 5th-gen-console low-poly survival-horror 3D game render\",\n      \"rendering_quality\": \"very low fidelity, low polygon count, chunky simplified geometry, flat low-res dithered textures, heavy grain; NOT photorealistic, NOT high-detail, NOT painterly, NOT glossy\",\n      \"surface_textures\": \"low-res dithered cloth and skin textures, matte velvet gown\",\n      \"lighting\": \"warm amber torch/candle key from below, cold blue-green bog fill, deep crushed shadows, heavy vignette\"\n    },\n    \"technical\": {\n      \"angle\": \"eye-level, slight low angle\",\n      \"rendering\": \"faint CRT/VHS scanline grain, low-poly aliasing, affine texture warping\",\n      \"resolution\": \"PS1-era low-fidelity, 9:16 vertical\"\n    },\n    \"composition\": {\n      \"framing\": \"centered full-body, clear readable silhouette\",\n      \"subject_placement\": \"center frame, shack doorway and fog behind\"\n    },\n    \"quality\": {\n      \"include\": [\n        \"voxel low-poly PS1 horror render\",\n        \"affine-warped textures\",\n        \"dithered grain\",\n        \"beautiful alluring witch\",\n        \"deep violet gown\",\n        \"pointed wizard hat\",\n        \"warm torch glow vs cold fog\",\n        \"crushed shadows\",\n        \"9:16 vertical\",\n        \"PS1/PSX low-poly\",\n        \"chunky low polygon count\",\n        \"low-resolution dithered textures\",\n        \"heavy grain\",\n        \"dark murky limited detail\",\n        \"vertex wobble\",\n        \"Silent Hill 1 / Puppet Combo aesthetic\"\n      ],\n      \"avoid\": [\n        \"photorealistic\",\n        \"smooth modern CGI\",\n        \"glossy octane render\",\n        \"cartoon\",\n        \"anime\",\n        \"old hag\",\n        \"warty crone\",\n        \"ugly\",\n        \"beauty filter\",\n        \"airbrushed plastic skin\",\n        \"watermark\",\n        \"deformed hands\",\n        \"photorealistic\",\n        \"hyperdetailed\",\n        \"painterly\",\n        \"glossy\",\n        \"high-poly\",\n        \"ray traced\",\n        \"octane render\",\n        \"unreal engine 5\",\n        \"4k\",\n        \"sharp realistic skin\",\n        \"modern AAA graphics\"\n      ],\n      \"reference_standard\": \"PS1-era survival-horror character model, dark-fantasy folk-horror register\"\n    }\n  }\n}\n",
        "stage": "image"
      },
      {
        "slot": "hub",
        "text": "Generate a screenshot from a first-person horror video game with NO interface/HUD, in voxel graphics in the style of PS1 (chunky low-poly geometry, low-resolution dithered textures, affine texture warping, vertex wobble, heavy grain, dark and murky). Render CHARACTERS and ENVIRONMENT at the SAME crude low-poly fidelity — no character more detailed than the scene. Characters FULL BODY, not cropped.\n\nComposition: first-person POV at a crossroads in a black foggy swamp at night, heavy rain, drifting will-o-wisps, two muddy paths branching. The hero's blocky low-poly LEFT HAND holds a guttering TORCH in the foreground. The TWO guides stand CLOSE to the camera, large and clearly visible (they double as the video thumbnail — frame them big).\n\nLEFT path — a beautiful young witch in a flowing dark-purple gown and a tall pointed wizard's hat, beckoning from the doorway of a rotting bog-shack; a mysterious TEAL light glows out of the shack's windows and doorway, making it eerily inviting.\n\nRIGHT path — the LESHY, looming close: an old man half-fused into a tree, 50/50 flesh and bark, with root-and-branch limbs and antlers, moss over disfigured skin.\n\nCold blue-green murk, warm torch glow, mysterious teal window-glow, dead trees and reeds.\n\nFRAMING — MATCH THE SECOND REFERENCE IMAGE FOR SCALE & PLACEMENT ONLY (do NOT copy its content, characters or any text): the two guides stand side by side facing the camera, FULL BODY from head to feet, LARGE and CLOSE so they fill most of the vertical frame — feet visible near the bottom, heads near the top, the swamp paths receding between and behind them. This is the opening 'hook' character-select shot; characters must be big, bright and instantly readable in the very first frame. Do NOT crop legs or feet. 9:16 vertical.\n",
        "stage": "image"
      },
      {
        "slot": "hub-ftf",
        "text": "Generate a screenshot from a first-person horror video game with NO interface/HUD, rendered in the EXACT visual style of CHILLA'''S ART and FEARS TO FATHOM indie PS1/PS2 horror games — flat restrained lighting, heavy film grain and VHS noise, a muted desaturated palette, low-resolution textures, low-poly 3D models with realistic proportions, slightly soft/blurred, a mundane found-footage indie-horror-game look; NOT voxel, NOT cube-based, NOT cinematic, NOT dramatic, NOT painterly, NOT AAA (chunky low-poly geometry, low-resolution dithered textures, affine texture warping, vertex wobble, heavy grain, dark and murky). Render CHARACTERS and ENVIRONMENT at the SAME crude low-poly fidelity — no character more detailed than the scene. Characters FULL BODY, not cropped.\n\nComposition: first-person POV at a crossroads in a black foggy swamp at night, heavy rain, drifting will-o-wisps, two muddy paths branching. The hero's blocky low-poly LEFT HAND holds a guttering TORCH in the foreground. The TWO guides stand CLOSE to the camera, large and clearly visible (they double as the video thumbnail — frame them big).\n\nLEFT path — a beautiful young witch in a flowing dark-purple gown and a tall pointed wizard's hat, beckoning from the doorway of a rotting bog-shack; a mysterious TEAL light glows out of the shack's windows and doorway, making it eerily inviting.\n\nRIGHT path — the LESHY, looming close: an old man half-fused into a tree, 50/50 flesh and bark, with root-and-branch limbs and antlers, moss over disfigured skin.\n\nCold blue-green murk, warm torch glow, mysterious teal window-glow, dead trees and reeds.\n\nFRAMING — MATCH THE SECOND REFERENCE IMAGE FOR SCALE & PLACEMENT ONLY (do NOT copy its content, characters or any text): the two guides stand side by side facing the camera, FULL BODY from head to feet, LARGE and CLOSE so they fill most of the vertical frame — feet visible near the bottom, heads near the top, the swamp paths receding between and behind them. This is the opening 'hook' character-select shot; characters must be big, bright and instantly readable in the very first frame. Do NOT crop legs or feet. 9:16 vertical.\n",
        "stage": "image"
      },
      {
        "slot": "hub-lowpoly",
        "text": "Generate a screenshot from a first-person horror video game with NO interface/HUD, in PURE LOW-POLY PS1/PSX graphics (smooth-shaded triangulated low-poly 3D models like real PlayStation-1 games, NOT voxel, NOT cube-based, NOT minecraft, NOT painterly) (clean low-poly triangulated geometry, low-resolution dithered textures, affine texture warping, vertex wobble, heavy grain, dark and murky). Render CHARACTERS and ENVIRONMENT at the SAME crude low-poly fidelity — no character more detailed than the scene. Characters FULL BODY, not cropped.\n\nComposition: first-person POV at a crossroads in a black foggy swamp at night, heavy rain, drifting will-o-wisps, two muddy paths branching. The hero's blocky low-poly LEFT HAND holds a guttering TORCH in the foreground. The TWO guides stand CLOSE to the camera, large and clearly visible (they double as the video thumbnail — frame them big).\n\nLEFT path — a beautiful young witch in a flowing dark-purple gown and a tall pointed wizard's hat, beckoning from the doorway of a rotting bog-shack; a mysterious TEAL light glows out of the shack's windows and doorway, making it eerily inviting.\n\nRIGHT path — the LESHY, looming close: an old man half-fused into a tree, 50/50 flesh and bark, with root-and-branch limbs and antlers, moss over disfigured skin.\n\nCold blue-green murk, warm torch glow, mysterious teal window-glow, dead trees and reeds.\n\nFRAMING — MATCH THE SECOND REFERENCE IMAGE FOR SCALE & PLACEMENT ONLY (do NOT copy its content, characters or any text): the two guides stand side by side facing the camera, FULL BODY from head to feet, LARGE and CLOSE so they fill most of the vertical frame — feet visible near the bottom, heads near the top, the swamp paths receding between and behind them. This is the opening 'hook' character-select shot; characters must be big, bright and instantly readable in the very first frame. Do NOT crop legs or feet. 9:16 vertical.\n",
        "stage": "image"
      },
      {
        "slot": "hub-vid",
        "text": "PS1 indie folk-horror game footage, first-person POV holding a guttering torch, heavy grain/VHS, low-poly, black night swamp, 9:16. LOCKED STATIC CAMERA — the camera does NOT move or pan at all; the framing holds completely steady the entire time and especially on the final frame. Both guides stay fully in frame and clearly visible throughout: on the LEFT the beautiful WITCH in her purple gown and pointed hat beckons warmly from her rotting bog-shack doorway; on the RIGHT the half-tree LESHY stands gesturing into the deep wood. Neither guide walks off or leaves frame; both remain clearly visible at the end. Animate the WORLD richly: the torch flame flickers and dances, will-o-wisps drift and bob, fog rolls and churns across the bog, reeds sway, black water ripples, distant eyes blink. The POV hand holding the torch trembles slightly. The world is alive but the camera stays locked and both characters stay clearly in shot the whole time. Frogs, insects, low bog drone.\n",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "i2v/hub-vid",
        "text": "PS1 indie folk-horror game footage, first-person POV holding a guttering torch, heavy grain/VHS, low-poly, black night swamp, 9:16. LOCKED STATIC CAMERA — the camera does NOT move or pan at all; the framing holds completely steady the entire time and especially on the final frame. Both guides stay fully in frame and clearly visible throughout: on the LEFT the beautiful WITCH in her purple gown and pointed hat beckons warmly from her rotting bog-shack doorway; on the RIGHT the half-tree LESHY stands gesturing into the deep wood. Neither guide walks off or leaves frame; both remain clearly visible at the end. Animate the WORLD richly: the torch flame flickers and dances, will-o-wisps drift and bob, fog rolls and churns across the bog, reeds sway, black water ripples, distant eyes blink. The POV hand holding the torch trembles slightly. The world is alive but the camera stays locked and both characters stay clearly in shot the whole time. Frogs, insects, low bog drone.\n",
        "stage": "i2v"
      },
      {
        "slot": "i2v/scene-a02-enter-shack-vid",
        "text": "PS1 indie folk-horror game footage, first-person POV holding a guttering torch, heavy grain/VHS, low-poly, 9:16. POV pushes the rotting shack door open and steps inside, torchlight sweeping over cobwebs, hanging bones and dried herbs; the WITCH turns and beckons you in warmly. The torch flickers, shadows lurch, the POV moves forward. Creaking door, crackling torch.\n",
        "stage": "i2v"
      },
      {
        "slot": "i2v/scene-a03-fork-hearth-vid",
        "text": "PS1 indie folk-horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. A held choice-moment, idle, nobody commits. Inside the shack: a roaring hearth with an inviting chair on one side, a dark cold corner on the other; the WITCH gestures warmly toward the fire, smiling. Flames roar and flicker, embers drift, shadows dance, the POV sways — the world alive, the choice unmade.\n",
        "stage": "i2v"
      },
      {
        "slot": "i2v/scene-a04-death-fire-vid",
        "text": "PS1 indie folk-horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. A death scene — you are instantly taken, you never get more than one step. 0-1s: POV sits down into the chair by the hearth. 1-3s: gnarled roots erupt from the chair and clamp you as the hearth gapes into a fiery maw and lunges, swallowing the camera in flame. 3-4s: the fire engulfs the lens to black. Roots snapping, roaring fire, a shriek.\n",
        "stage": "i2v"
      },
      {
        "slot": "i2v/scene-a05-outside-vid",
        "text": "PS1 indie folk-horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. POV inside the shack as something outside snuffles at the wall — a snout and claw-shadows pass the window; the WITCH suddenly lunges toward you with a ladle of black brew. The torch flickers, shadows pass the window, tense. Snuffling growl, scratching at the wall.\n",
        "stage": "i2v"
      },
      {
        "slot": "i2v/scene-a06-fork-brew-vid",
        "text": "PS1 indie folk-horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. A held choice-moment, idle, nobody commits. The WITCH thrusts a ladle of black, writhing brew right up at your face, her eyes intense and urgent; the thing snuffles at the wall behind her. The brew writhes, the torch flickers, her hand trembles, the POV sways — held, unresolved.\n",
        "stage": "i2v"
      },
      {
        "slot": "i2v/scene-a07-death-shove-vid",
        "text": "PS1 indie folk-horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. A death scene — you are instantly taken. 0-1s: POV shoves the witch and her ladle aside. 1-3s: the wall bursts and a snarling bog-hound lunges in, seizes the camera and drags it violently sideways out into the dark. 3-4s: the dark swallows the lens to black. Wood splintering, snarling, dragging.\n",
        "stage": "i2v"
      },
      {
        "slot": "i2v/scene-a08-masked-vid",
        "text": "PS1 indie folk-horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. POV gags down the vile black brew, throat working; the snout snuffles at the wall, then turns and moves away; the WITCH watches grimly. The torch flickers, the threat-shadow recedes past the window, relief. Gulping, snuffling fading.\n",
        "stage": "i2v"
      },
      {
        "slot": "i2v/scene-a09-fork-exits-vid",
        "text": "PS1 indie folk-horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. A held choice-moment, idle, nobody commits. The WITCH points insistently to a black crawl-hole behind the stove and waves you off a clean lit doorway on the other side; both visible. The torch flickers, she gestures at the hole, the POV sways — held, the choice unmade.\n",
        "stage": "i2v"
      },
      {
        "slot": "i2v/scene-a09b-death-door-vid",
        "text": "PS1 indie folk-horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. A death scene — you are instantly taken. 0-1s: POV steps through the clean lit doorway. 1-3s: there is no floor, only black bog water — the camera plunges in and sinks fast, murk and bubbles closing over the lens. 3-4s: the black water swallows the lens. Splash, gurgle, sinking.\n",
        "stage": "i2v"
      },
      {
        "slot": "i2v/scene-a10-end-vid",
        "text": "PS1 indie folk-horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. POV crawls forward out of the black crawl-hole and emerges onto solid mossy ground under a paling pre-dawn sky; the WITCH's cackle echoes behind, approving; the torch steadies and the menace lifts. By the end you are up on safe ground, the fog thinning, calm. Crawling, a distant cackle, calmer bog.\n",
        "stage": "i2v"
      },
      {
        "slot": "i2v/scene-b11-wood-vid",
        "text": "PS1 indie folk-horror game footage, first-person POV holding a guttering torch, heavy grain/VHS, low-poly, 9:16. POV follows the half-tree LESHY deeper into the black wood, his bark-limbs creaking as he wades ahead and beckons; wolf-eyes glint all around in the fog. The torch bobs with each step, will-o-wisps drift, eyes blink in the dark. Creaking wood, distant growls.\n",
        "stage": "i2v"
      },
      {
        "slot": "i2v/scene-b12-fork-channel-vid",
        "text": "PS1 indie folk-horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. A held choice-moment, idle, nobody commits. The LESHY wades knee-deep into a black boggy channel and beckons you to follow the same way; off to the side a line of stones and hummocks crosses. He stands in the water gesturing, the torch flickers, wisps drift, the POV sways — held, unresolved.\n",
        "stage": "i2v"
      },
      {
        "slot": "i2v/scene-b13-death-wade-vid",
        "text": "PS1 indie folk-horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. A death scene — you are instantly taken. 0-1s: POV steps down into the black channel after the leshy. 1-3s: the mud has no bottom for you — you plunge and are sucked under fast, black water and reeds closing over the camera. 3-4s: the bog swallows the lens to black. Mud-suck, splashing, gurgle.\n",
        "stage": "i2v"
      },
      {
        "slot": "i2v/scene-b14-crossed-vid",
        "text": "PS1 indie folk-horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. POV steps stone to stone across the black channel to the far bank, the torch lighting each footing; the LESHY waits ahead. Careful steps, reeds sway, wisps drift, the torch flickers. Water laps, wood creaks.\n",
        "stage": "i2v"
      },
      {
        "slot": "i2v/scene-b15-fork-brake-vid",
        "text": "PS1 indie folk-horror game footage, first-person POV holding a guttering torch, heavy grain/VHS, low-poly, 9:16. A held choice-moment, nobody commits. LOCKED CAMERA, no pan, steady framing. The LESHY stands still, holding his pointing pose toward the cramped thorn-brake — he does NOT move his body or walk, he just holds the gesture. To the side a wide moonlit clearing opens. Animate the LOCATION richly the whole time: fog rolls and churns, will-o-wisps drift and bob, wolf-eyes glint and blink in the dark treeline, the torch flame flickers and throws moving shadows across the trees, reeds and branches sway, distant shapes shift in the mist. The POV hand holding the torch trembles slightly. The world is fully alive and moving, but the leshy holds his pose and the choice stays unmade.\n",
        "stage": "i2v"
      },
      {
        "slot": "i2v/scene-b16-death-clearing-vid",
        "text": "PS1 indie folk-horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. A death scene — you are instantly taken. 0-1s: POV walks out into the open moonlit clearing. 1-3s: the wolf pack bursts from the treeline and runs you down, a snarling shape leaping onto the camera and slamming it to the ground. 3-4s: teeth and dark swallow the lens to black. Howls, snarling, impact.\n",
        "stage": "i2v"
      },
      {
        "slot": "i2v/scene-b17-through-vid",
        "text": "PS1 indie folk-horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. POV tears through the cramped thorn-brake, branches clawing and scraping past the lens, pushing forward as the pack's snarls fall behind. Thorns rake the view, the torch jolts, breathing hard. Scraping branches, fading snarls.\n",
        "stage": "i2v"
      },
      {
        "slot": "i2v/scene-b18-fork-lights-vid",
        "text": "PS1 indie folk-horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. A held choice-moment, idle, nobody commits. At the forest's edge the warm lights of your home village kindle behind you; ahead lies the dark way out. You stand torn between them. The torch flickers, the village lights glow softly behind, fog drifts, the POV sways — held, the choice unmade.\n",
        "stage": "i2v"
      },
      {
        "slot": "i2v/scene-b18b-death-lookback-vid",
        "text": "PS1 indie folk-horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. A death scene — you are instantly taken. 0-1s: POV turns to look back at the warm village lights. 1-3s: black bog-water and grasping pale hands erupt from behind and haul the camera violently backward and down into the swamp. 3-4s: the bog swallows the lens to black. Whoosh, grasping, gurgle.\n",
        "stage": "i2v"
      },
      {
        "slot": "i2v/scene-b19-end-vid",
        "text": "PS1 indie folk-horror game footage turning calm, first-person POV, heavy grain/VHS, low-poly, 9:16. POV walks steadily forward out of the black wood without looking back; throughout, the fog slowly thins and a cold dawn breaks, the swamp giving way to an ordinary dirt road under a paling sky, the torch lowering as the menace fades. The world keeps moving softly — mist drifting, the road resolving ahead, birds beginning. By the end you walk calmly on the safe dawn road, relieved, no menace. Footsteps, soft birdsong, calm.\n",
        "stage": "i2v"
      },
      {
        "slot": "scene-a02-enter-shack",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted low-poly, UNIFORM low fidelity, NOT cinematic. You push open the rotting door of the witch's bog-shack; torchlight falls on cobwebs, bones and the beautiful purple-gowned witch beckoning you inside. IMPORTANT: blocky low-poly first-person POV HANDS visible — one holding a guttering torch, the other pushing the door. 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-a02-enter-shack-vid",
        "text": "PS1 indie folk-horror game footage, first-person POV holding a guttering torch, heavy grain/VHS, low-poly, 9:16. POV pushes the rotting shack door open and steps inside, torchlight sweeping over cobwebs, hanging bones and dried herbs; the WITCH turns and beckons you in warmly. The torch flickers, shadows lurch, the POV moves forward. Creaking door, crackling torch.\n",
        "model": "kwaivgi/kling-v3.0-pro",
        "stage": "i2v"
      },
      {
        "slot": "scene-a03-fork-hearth",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted low-poly, UNIFORM low fidelity, NOT cinematic. Inside the same shack: a roaring hearth with an inviting empty chair beside it; the witch gestures for you to sit and warm up. IMPORTANT: blocky low-poly first-person POV HAND holding the torch in the foreground. 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-a03-fork-hearth-vid",
        "text": "PS1 indie folk-horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. A held choice-moment, idle, nobody commits. Inside the shack: a roaring hearth with an inviting chair on one side, a dark cold corner on the other; the WITCH gestures warmly toward the fire, smiling. Flames roar and flicker, embers drift, shadows dance, the POV sways — the world alive, the choice unmade.\n",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "scene-a04-death-fire",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted low-poly, UNIFORM low fidelity, NOT cinematic. The SAME hearth as the reference, but now the END frame of the death: gnarled roots have fully wrapped the POV and the hearth has gaped into a fanged fiery maw that is closing over the view, swallowing you whole into fire and gnashing dark — almost fully consumed, a final death image. IMPORTANT: blocky low-poly first-person POV HANDS being dragged into the fiery maw, the torch tumbling away. 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-a04-death-fire-vid",
        "text": "PS1 indie folk-horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. A death scene — you are instantly taken, you never get more than one step. 0-1s: POV sits down into the chair by the hearth. 1-3s: gnarled roots erupt from the chair and clamp you as the hearth gapes into a fiery maw and lunges, swallowing the camera in flame. 3-4s: the fire engulfs the lens to black. Roots snapping, roaring fire, a shriek.\n",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "scene-a05-outside",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted low-poly, UNIFORM low fidelity, NOT cinematic. Same shack interior as the reference. The beautiful purple-gowned witch CALMLY extends a wooden ladle of dark brew toward the POV, holding the same quiet, concerned expression — NO splash, no violent motion, just gently offering it; a faint snuffling shape barely visible at the dark window behind her. IMPORTANT: blocky low-poly first-person POV HANDS visible — one holding the guttering torch, the other open near the offered ladle. 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-a05-outside-vid",
        "text": "PS1 indie folk-horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. POV inside the shack as something outside snuffles at the wall — a snout and claw-shadows pass the window; the WITCH suddenly lunges toward you with a ladle of black brew. The torch flickers, shadows pass the window, tense. Snuffling growl, scratching at the wall.\n",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "scene-a06-fork-brew",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted low-poly, UNIFORM low fidelity, NOT cinematic. The witch shoves a ladle of black writhing brew / smears grave-mud right at the POV's face, close up, insistent. IMPORTANT: blocky low-poly first-person POV HANDS up near the brew (one still holding the torch). 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-a06-fork-brew-vid",
        "text": "PS1 indie folk-horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. A held choice-moment, idle, nobody commits. The WITCH thrusts a ladle of black, writhing brew right up at your face, her eyes intense and urgent; the thing snuffles at the wall behind her. The brew writhes, the torch flickers, her hand trembles, the POV sways — held, unresolved.\n",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "scene-a07-death-shove",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted low-poly, UNIFORM low fidelity, NOT cinematic. You shoved her off and stayed unmasked; a hulking bog-hound bursts through the shack wall and seizes the POV, dragging you out into the mire. IMPORTANT: blocky low-poly first-person POV HANDS flailing at the hound. 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-a07-death-shove-vid",
        "text": "PS1 indie folk-horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. A death scene — you are instantly taken. 0-1s: POV shoves the witch and her ladle aside. 1-3s: the wall bursts and a snarling bog-hound lunges in, seizes the camera and drags it violently sideways out into the dark. 3-4s: the dark swallows the lens to black. Wood splintering, snarling, dragging.\n",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "scene-a08-masked",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted low-poly, UNIFORM low fidelity, NOT cinematic. You swallowed the foul brew; the snuffling bog-thing's snout pokes in at the window, sniffs, then withdraws; the witch watches approvingly. IMPORTANT: blocky low-poly first-person POV HAND with the torch, low and still. 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-a08-masked-vid",
        "text": "PS1 indie folk-horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. POV gags down the vile black brew, throat working; the snout snuffles at the wall, then turns and moves away; the WITCH watches grimly. The torch flickers, the threat-shadow recedes past the window, relief. Gulping, snuffling fading.\n",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "scene-a09-fork-exits",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted low-poly, UNIFORM low fidelity, NOT cinematic. The witch points to a black crawl-hole behind the stove and warns against a clean, lit doorway beside it. IMPORTANT: blocky low-poly first-person POV HAND holding the torch toward the two openings. 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-a09-fork-exits-vid",
        "text": "PS1 indie folk-horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. A held choice-moment, idle, nobody commits. The WITCH points insistently to a black crawl-hole behind the stove and waves you off a clean lit doorway on the other side; both visible. The torch flickers, she gestures at the hole, the POV sways — held, the choice unmade.\n",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "scene-a09b-death-door",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted low-poly, UNIFORM low fidelity, NOT cinematic. You took the clean lit doorway — it opens straight onto deep black bog water and you plunge in, sinking, the surface receding above. IMPORTANT: blocky low-poly first-person POV HANDS reaching up toward the fading surface (torch sputtering out). 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-a09b-death-door-vid",
        "text": "PS1 indie folk-horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. A death scene — you are instantly taken. 0-1s: POV steps through the clean lit doorway. 1-3s: there is no floor, only black bog water — the camera plunges in and sinks fast, murk and bubbles closing over the lens. 3-4s: the black water swallows the lens. Splash, gurgle, sinking.\n",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "scene-a10-end",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted low-poly, UNIFORM low fidelity, NOT cinematic. You crawl out of the black stove crawl-hole onto solid mossy ground under open night sky; the witch cackles approvingly behind you. IMPORTANT: blocky low-poly first-person POV HANDS pushing up off the ground (torch in one). 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-a10-end-vid",
        "text": "PS1 indie folk-horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. POV crawls forward out of the black crawl-hole and emerges onto solid mossy ground under a paling pre-dawn sky; the WITCH's cackle echoes behind, approving; the torch steadies and the menace lifts. By the end you are up on safe ground, the fog thinning, calm. Crawling, a distant cackle, calmer bog.\n",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "scene-b11-wood",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted low-poly, UNIFORM low fidelity, NOT cinematic. You follow the towering half-man half-tree LESHY deeper into a black foggy wood; pairs of wolf-eyes glow in the dark around you. IMPORTANT: blocky low-poly first-person POV HAND holding a guttering torch in the foreground. 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-b11-wood-vid",
        "text": "PS1 indie folk-horror game footage, first-person POV holding a guttering torch, heavy grain/VHS, low-poly, 9:16. POV follows the half-tree LESHY deeper into the black wood, his bark-limbs creaking as he wades ahead and beckons; wolf-eyes glint all around in the fog. The torch bobs with each step, will-o-wisps drift, eyes blink in the dark. Creaking wood, distant growls.\n",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "scene-b12-fork-channel",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted low-poly, UNIFORM low fidelity, NOT cinematic. A boggy black channel blocks the path; the LESHY wades straight in knee-deep and beckons you to follow the same way, while a line of stones / hummocks runs across to the side. IMPORTANT: blocky low-poly first-person POV HAND with the torch over the dark water. 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-b12-fork-channel-vid",
        "text": "PS1 indie folk-horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. A held choice-moment, idle, nobody commits. The LESHY wades knee-deep into a black boggy channel and beckons you to follow the same way; off to the side a line of stones and hummocks crosses. He stands in the water gesturing, the torch flickers, wisps drift, the POV sways — held, unresolved.\n",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "scene-b13-death-wade",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted low-poly, UNIFORM low fidelity, NOT cinematic. You waded in after the leshy — but for you the mud has no bottom and you are sucked under the black water; the leshy stands unbothered. IMPORTANT: blocky low-poly first-person POV HANDS grasping at the surface as you sink. 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-b13-death-wade-vid",
        "text": "PS1 indie folk-horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. A death scene — you are instantly taken. 0-1s: POV steps down into the black channel after the leshy. 1-3s: the mud has no bottom for you — you plunge and are sucked under fast, black water and reeds closing over the camera. 3-4s: the bog swallows the lens to black. Mud-suck, splashing, gurgle.\n",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "scene-b14-crossed",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted low-poly, UNIFORM low fidelity, NOT cinematic. You picked your way across on the stones / hummocks to the far bank where the leshy waits. IMPORTANT: blocky low-poly first-person POV HAND with torch, balancing on a stone over the water. 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-b14-crossed-vid",
        "text": "PS1 indie folk-horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. POV steps stone to stone across the black channel to the far bank, the torch lighting each footing; the LESHY waits ahead. Careful steps, reeds sway, wisps drift, the torch flickers. Water laps, wood creaks.\n",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "scene-b15-fork-brake",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted low-poly, UNIFORM low fidelity, NOT cinematic. A pack howls close; the leshy points into a cramped thorn-brake, while beside it a wide moonlit clearing offers easy open walking. IMPORTANT: blocky low-poly first-person POV HAND with torch toward the thorn-brake. 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-b15-fork-brake-vid",
        "text": "PS1 indie folk-horror game footage, first-person POV holding a guttering torch, heavy grain/VHS, low-poly, 9:16. A held choice-moment, nobody commits. LOCKED CAMERA, no pan, steady framing. The LESHY stands still, holding his pointing pose toward the cramped thorn-brake — he does NOT move his body or walk, he just holds the gesture. To the side a wide moonlit clearing opens. Animate the LOCATION richly the whole time: fog rolls and churns, will-o-wisps drift and bob, wolf-eyes glint and blink in the dark treeline, the torch flame flickers and throws moving shadows across the trees, reeds and branches sway, distant shapes shift in the mist. The POV hand holding the torch trembles slightly. The world is fully alive and moving, but the leshy holds his pose and the choice stays unmade.\n",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "scene-b16-death-clearing",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted low-poly, UNIFORM low fidelity, NOT cinematic. You took the easy open moonlit clearing — in the open the wolf pack runs the POV down, snarling jaws lunging. IMPORTANT: blocky low-poly first-person POV HANDS thrown up against the lunging wolves (torch dropped). 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-b16-death-clearing-vid",
        "text": "PS1 indie folk-horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. A death scene — you are instantly taken. 0-1s: POV walks out into the open moonlit clearing. 1-3s: the wolf pack bursts from the treeline and runs you down, a snarling shape leaping onto the camera and slamming it to the ground. 3-4s: teeth and dark swallow the lens to black. Howls, snarling, impact.\n",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "scene-b17-through",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted low-poly, UNIFORM low fidelity, NOT cinematic. You shove through the cramped thorn-brake behind the leshy, branches clawing; the pack loses your trail. IMPORTANT: blocky low-poly first-person POV HANDS pushing thorny branches aside (torch in one). 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-b17-through-vid",
        "text": "PS1 indie folk-horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. POV tears through the cramped thorn-brake, branches clawing and scraping past the lens, pushing forward as the pack's snarls fall behind. Thorns rake the view, the torch jolts, breathing hard. Scraping branches, fading snarls.\n",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "scene-b18-fork-lights",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted low-poly, UNIFORM low fidelity, NOT cinematic. At the forest's edge, the warm lights of your home village kindle behind you, tempting you to turn and look. IMPORTANT: blocky low-poly first-person POV HAND with the torch, the road ahead and the glow behind. 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-b18-fork-lights-vid",
        "text": "PS1 indie folk-horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. A held choice-moment, idle, nobody commits. At the forest's edge the warm lights of your home village kindle behind you; ahead lies the dark way out. You stand torn between them. The torch flickers, the village lights glow softly behind, fog drifts, the POV sways — held, the choice unmade.\n",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "scene-b18b-death-lookback",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted low-poly, UNIFORM low fidelity, NOT cinematic. You turned to look back at the village lights — the bog erupts and black mud / unseen hands haul the POV backwards under the mire. IMPORTANT: blocky low-poly first-person POV HANDS clawing forward as you're dragged back. 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-b18b-death-lookback-vid",
        "text": "PS1 indie folk-horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. A death scene — you are instantly taken. 0-1s: POV turns to look back at the warm village lights. 1-3s: black bog-water and grasping pale hands erupt from behind and haul the camera violently backward and down into the swamp. 3-4s: the bog swallows the lens to black. Whoosh, grasping, gurgle.\n",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "scene-b19-end",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted low-poly, UNIFORM low fidelity, NOT cinematic. You walked out without looking back; dawn breaks and you step onto a dirt road leaving the swamp behind. IMPORTANT: blocky low-poly first-person POV HAND with the burnt-down torch, the road ahead in pale dawn. 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-b19-end-vid",
        "text": "PS1 indie folk-horror game footage turning calm, first-person POV, heavy grain/VHS, low-poly, 9:16. POV walks steadily forward out of the black wood without looking back; throughout, the fog slowly thins and a cold dawn breaks, the swamp giving way to an ordinary dirt road under a paling sky, the torch lowering as the menace fades. The world keeps moving softly — mist drifting, the road resolving ahead, birds beginning. By the end you walk calmly on the safe dawn road, relieved, no menace. Footsteps, soft birdsong, calm.\n",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      }
    ],
    "recipes": [
      {
        "kind": "bake",
        "name": "ffmpeg-xfade-master"
      },
      {
        "kind": "overlay",
        "name": "vhs-pause-freeze"
      },
      {
        "kind": "overlay",
        "name": "smpte-countdown-disc"
      },
      {
        "kind": "ffmpeg",
        "name": "old-radio-ps1-vo"
      },
      {
        "kind": "overlay",
        "name": "chroma-split"
      },
      {
        "kind": "encode",
        "name": "film-grain"
      },
      {
        "kind": "overlay",
        "name": "burned-captions"
      },
      {
        "kind": "overlay",
        "name": "voxel-dither"
      },
      {
        "kind": "ffmpeg",
        "name": "boomerang-motion-fill"
      }
    ],
    "scenario": {
      "scenes": [
        {
          "id": "hub-vid",
          "durationSec": 4
        },
        {
          "id": "scene-a02-enter-shack-vid",
          "durationSec": 4
        },
        {
          "id": "scene-a03-fork-hearth-vid",
          "durationSec": 4
        },
        {
          "id": "scene-a04-death-fire-vid",
          "durationSec": 4
        },
        {
          "id": "scene-a05-outside-vid",
          "durationSec": 4
        },
        {
          "id": "scene-a06-fork-brew-vid",
          "durationSec": 4
        },
        {
          "id": "scene-a07-death-shove-vid",
          "durationSec": 4
        },
        {
          "id": "scene-a08-masked-vid",
          "durationSec": 4
        },
        {
          "id": "scene-a09-fork-exits-vid",
          "durationSec": 4
        },
        {
          "id": "scene-a09b-death-door-vid",
          "durationSec": 4
        },
        {
          "id": "scene-a10-end-vid",
          "durationSec": 4
        },
        {
          "id": "scene-b11-wood-vid",
          "durationSec": 4
        },
        {
          "id": "scene-b12-fork-channel-vid",
          "durationSec": 4
        },
        {
          "id": "scene-b13-death-wade-vid",
          "durationSec": 4
        },
        {
          "id": "scene-b14-crossed-vid",
          "durationSec": 4
        },
        {
          "id": "scene-b15-fork-brake-vid",
          "durationSec": 4
        },
        {
          "id": "scene-b16-death-clearing-vid",
          "durationSec": 4
        },
        {
          "id": "scene-b17-through-vid",
          "durationSec": 4
        },
        {
          "id": "scene-b18-fork-lights-vid",
          "durationSec": 4
        },
        {
          "id": "scene-b18b-death-lookback-vid",
          "durationSec": 4
        },
        {
          "id": "scene-b19-end-vid",
          "durationSec": 6
        },
        {
          "id": "scene-a05-outside"
        },
        {
          "id": "scene-a04-death-fire"
        },
        {
          "id": "scene-a02-enter-shack"
        },
        {
          "id": "scene-a03-fork-hearth"
        },
        {
          "id": "scene-a04-death-fire"
        },
        {
          "id": "scene-a05-outside"
        },
        {
          "id": "scene-a06-fork-brew"
        },
        {
          "id": "scene-a07-death-shove"
        },
        {
          "id": "scene-a08-masked"
        },
        {
          "id": "scene-a09-fork-exits"
        },
        {
          "id": "scene-a09b-death-door"
        },
        {
          "id": "scene-a10-end"
        },
        {
          "id": "scene-b11-wood"
        },
        {
          "id": "scene-b12-fork-channel"
        },
        {
          "id": "scene-b13-death-wade"
        },
        {
          "id": "scene-b14-crossed"
        },
        {
          "id": "scene-b15-fork-brake"
        },
        {
          "id": "scene-b16-death-clearing"
        },
        {
          "id": "scene-b17-through"
        },
        {
          "id": "scene-b18-fork-lights"
        },
        {
          "id": "scene-b18b-death-lookback"
        },
        {
          "id": "scene-b19-end"
        }
      ],
      "storyboardMd": "# Choose Your Path — Lost in the Swamp (Witch vs Leshy)\n\n**Project:** choose-swamp-001 · 9:16 · TikTok · ~70s · EN VO + word-level captions\n**Template:** analog-horror-pick-a-door (branching mechanic) · **Style override:** voxel / PS1 Slavic folk-horror render\n**Format origin:** choose-path-001 (validated). Reuses: two-guide hub → binary 50/50 forks (play→freeze→SMPTE timer→consequence) → branch payoff; voxel/PS1 register; vhs-pause-freeze + ffmpeg-xfade-master + old-radio-ps1-vo recipes; clone voice `NYIQTs8oBhYvzMr6zHTL`.\n\n## AESTHETIC LOCK (prepend to EVERY image prompt)\n> Chilla's Art / Fears to Fathom indie PS1-horror style (flat restrained lighting, heavy film grain/VHS, muted desaturated palette, low-res textures, low-poly with realistic proportions; style-ref workspace/references/ftf-chillas-style/; NOT voxel-cube, NOT cinematic, NOT painterly) — **folk-horror** render, PS1 / early-3D affine-warped pixel textures, chunky low-poly geometry, dithered grainy textures, first-person POV with a blocky low-poly hand holding a **guttering torch** (NOT a lantern), a black night swamp — fog, drowned dead trees, reeds, drifting **will-o'-wisps**, cold blue-green murk lit by the warm flicker of the torch, heavy vignette, faint pixel/VHS grain. NOT photoreal, NOT smooth modern CGI, NOT cartoon-cute. 9:16 vertical.\n\nLock a **hub-master** anchor first (the misty bog fork with both guides), then pass it as `--ref` on every gen for register continuity.\n\n## CAST (to lock as char masters)\n- **THE WITCH (Vedma)** — **beautiful and alluring, NOT a hag.** A **dark-purple gown** and a **pointed wizard's hat**; striking **gypsy / Eastern features**, long **black hair**, done **makeup**. She works out of a **decrepit, rotting bog-shack** (just a grim ruined house — NOT a chicken-legged hut; keep the folklore unobtrusive). The beauty makes her *harder to read* — a genuine, grim guide whose warmth can be bait but whose revolting help can be the only thing that saves you. **Read her — don't apply a blanket rule.**\n- **THE LESHY / TRENT** — **a real old man who has merged with the forest and become a trent.** **50/50 flesh and tree** — a disfigured human body fused with bark, roots, dead branches for limbs/antlers; one half still recognizably an old man's face, the other overtaken by wood. **Reference vibe: Bootstrap Bill Turner as he fuses into the ship.** Hollow groan, never speaks — only gestures. He wades the black bog like it's nothing because he's barely human anymore — *you are not.* A guide you must follow **and** second-guess.\n\n## MECHANIC\nOpen COLD on the bog fork. Idle loop + \"CHOOSE YOUR GUIDE\" + 3s film-leader countdown → commit. Each branch = a chain of binary 50/50 forks, each on a 3-2-1 SMPTE countdown. Wrong choice = a ~2s hard-cut death beat. Right chain (3 correct) = that guide's escape.\n**This is a TikTok one-shot watch — not interactive.** Choices + consequences play out linearly; keep every beat punchy, hard fast cuts, death beats are quick ~2s flashes. The viewer sees the whole gauntlet in one pass.\n**Trap-logic (per branch, self-contained, NEITHER telegraphs the other guide):**\n- **Witch branch — \"read the witch\":** comfort can be a trap, grim help can be salvation. Sometimes refuse her, sometimes trust her. (A1 refuse · A2 trust · A3 obey)\n- **Leshy branch — \"trust but verify\":** don't blindly copy/obey the spirit; use your own judgment. Sometimes defy him, sometimes follow him. (B1 defy · B2 follow · B3 your own nerve)\n\n---\n\n## CHOICE FLOW\n\n**HUB** — Black night swamp, will-o'-wisps, a guttering torch in your blocky hand. From the fog: the WITCH (left) beckons from her rotting shack; the LESHY (right) groans and gestures into the deep wood. 3-2-1 → pick a guide.\n\n### Branch A — went with THE WITCH · all inside her shack · *read the witch*\n- **A1** — You step into the rotting shack. The witch beckons you to sit by the roaring hearth and warm up — or stay standing, keep your distance.\n  - **A11 · SIT BY THE FIRE** (cozy, inviting). The chair's roots grip you / the hearth is a maw — it devours you. **Outcome: death.**\n  - **A12 · STAY BACK** (uncomfortable). **Outcome: continue.** *(here: don't fall for the comfort)*\n- **A2** — Something outside is sniffing for you (a bog-hound / the unclean scenting the living). The witch seizes your face and forces a ladle of black, writhing brew at you / smears grave-mud over you — revolting, you instinctively want to shove her off.\n  - **A21 · SHOVE HER OFF, trust yourself** (distrust her). You stay \"clean\" and visible — the thing scents you and drags you off. **Outcome: death.**\n  - **A22 · SWALLOW THE BREW / let her smear you** (trust her, vile). Your scent is masked; the thing passes. **Outcome: continue.** *(here: trusting the witch is right)*\n- **A3** — She points to a black crawl-hole behind the stove and warns you off the clean, lit doorway.\n  - **A31 · CLEAN LIT DOOR** (looks safe, ignore her warning). It opens straight into deep black water — you drown. **Outcome: death.**\n  - **A32 · BLACK CRAWL-HOLE** (her grim advice). The witch cackles in approval; you crawl out onto solid ground. **Outcome: ★ survived.** *(here: heeding the witch is right)*\n\n### Branch B — went with THE LESHY · visuals + what he shows; threats = wolves / bear / the unclean · *trust but verify*\n- **B1** — The leshy leads you into the black wood; wolf-eyes / the unclean glow all around. To cross a boggy channel he wades in knee-deep, easy, and beckons you to follow the same way; off to the side runs a line of stones / hummocks.\n  - **B11 · WADE IN LIKE THE LESHY** (blindly copy the guide). It's knee-deep for him — but bottomless for you; you're sucked under. **Outcome: death.** *(he's a spirit, you're not)*\n  - **B12 · CROSS BY THE STONES** (your own judgment, verify). You pick your way across. **Outcome: continue.**\n- **B2** — A pack howls / a bear crashes ahead. The leshy points into a cramped thorn-brake; beside it a wide moonlit clearing makes for easy walking.\n  - **B21 · THE OPEN CLEARING** (easy, inviting). In the open the pack runs you down. **Outcome: death.**\n  - **B22 · THE THORN-BRAKE** (the leshy's grim point, it claws at you). You slip through. **Outcome: continue.** *(here: following him is right)*\n- **B3** — At the forest's edge the lights of your home village kindle behind you. Look back — or walk out without looking.\n  - **B31 · LOOK BACK at the lights** (homesick pull). The bog / the unclean hauls you back under. **Outcome: death.**\n  - **B32 · WALK OUT, don't look back** (against every instinct). At dawn you step onto the road. **Outcome: ★ survived.**\n\n---\n\n## SCENE LIST (production beats — ~17 beats × 2-4s ≈ 70s)\n\n### SHARED\n- **S01 · HUB / CHOOSE YOUR GUIDE** — bog fork, torch, will-o'-wisps. Floating labels `WITCH` (L) / `LESHY` (R). Overlay \"CHOOSE YOUR GUIDE\" + 3-2-1 leader → \"YOU CHOSE: …\".\n\n### BRANCH A — WITCH\n- **A02 · ENTER THE SHACK** — POV pushes the rotting door open, torchlight on cobwebs and bones.\n- **A03 · FORK 1** — roaring hearth + inviting chair. Labels `SIT BY THE FIRE` / `STAY BACK`. 3-2-1.\n- **A04 · DEATH — SIT BY THE FIRE** — roots clamp / the hearth gapes and swallows you. Hard cut.\n- **A05 · SOMETHING OUTSIDE (right)** — a snout snuffles at the wall; claw-shadows pass the window. The witch lunges with the brew.\n- **A06 · FORK 2** — the ladle of black writhing brew / grave-mud at your face. Labels `SHOVE HER OFF` / `DRINK IT`. 3-2-1.\n- **A07 · DEATH — SHOVE HER OFF** — you stay visible; the bog-hound bursts in and drags you out. Hard cut.\n- **A08 · MASKED (right)** — you gag it down; the thing sniffs, turns, leaves.\n- **A09 · FORK 3** — the black crawl-hole behind the stove vs the clean lit door she warns against. Labels `CLEAN DOOR` / `CRAWL-HOLE`. 3-2-1.\n  - **A09b · DEATH — CLEAN DOOR** — it opens onto deep water; you sink. Hard cut.\n- **A10 · GOOD ENDING (Witch)** — you crawl out of the hole onto solid ground; the witch cackles. SURVIVED.\n\n### BRANCH B — LESHY\n- **B11 · INTO THE BLACK WOOD** — the leshy looms ahead, wolf-eyes glinting; POV follows the torch deeper.\n- **B12 · FORK 1** — the leshy wades the channel; a line of stones runs alongside. Labels `WADE LIKE HIM` / `CROSS BY STONES`. 3-2-1.\n- **B13 · DEATH — WADE LIKE HIM** — the mud has no bottom for you; you're sucked under. Hard cut.\n- **B14 · CROSSED (right)** — you step stone to stone to the far bank.\n- **B15 · FORK 2** — a thorn-brake the leshy points to vs an easy moonlit clearing; a pack howls. Labels `OPEN CLEARING` / `THORN-BRAKE`. 3-2-1.\n- **B16 · DEATH — OPEN CLEARING** — the pack runs you down in the open. Hard cut.\n- **B17 · THROUGH (right)** — you tear through the thorns; the pack loses you.\n- **B18 · FORK 3** — the forest edge; your village lights kindle behind. Labels `LOOK BACK` / `WALK ON`. 3-2-1.\n  - **B18b · DEATH — LOOK BACK** — the bog hauls you back under. Hard cut.\n- **B19 · GOOD ENDING (Leshy)** — you walk out without looking; dawn breaks on the road. SURVIVED.\n\n---\n\n## VO (EN, eerie low narrator — retimed at compose)\n- Hub: \"Two guides in the black water. One leads you home. You've got three seconds.\"\n- A (witch): \"The witch smiles too warm — but her ugliest gift is the one that saves you.\" / forks: \"the warm fire, or the cold corner?\" / \"her foul cup, or your own pride?\"\n- B (leshy): \"The old spirit wades like it's nothing. You are not a spirit. Don't follow him — *read* him.\"\n- Endings: \"You made it to the road.\" / CTA: \"Witch or the woods — who'd you follow? Tell me below.\"\n\n## STACK\n- Image anchors: `openai/gpt-5.4-image-2` --size 1080x1920 (9:16), --ref hub-master (+ WITCH / LESHY char masters). Fire in parallel (no cap).\n- i2v: `bytedance/seedance-2.0` (stylized → passes privacy filter; POV wade/crawl/run, hearth-maw, drown, pack chase). ~4s clips.\n- VO: reuse clone `NYIQTs8oBhYvzMr6zHTL`, old-radio/PS1 filter. Music: low bog-drone (ElevenLabs Music, no artist names). SFX: torch crackle, frog/insect bog ambience, snuffling hound, wolf howls, witch cackle, mud-suck, soft countdown beeps.\n- Captions: word-level white-bold bottom-center, fed from VO; snap to Scribe word `startMs`.\n- Compose: HyperFrames, ONE opacity-gated composition; transitions + play-then-freeze baked into the master via ffmpeg (xfade + tpad); SMPTE countdown disc + floating labels + DEATH flash; overlays clear BEFORE the dissolve.\n\n## NOTES\n- Folklore stays unobtrusive: a grim ruined bog-shack, not an explicit chicken-legged hut.\n- Both branches are survivable; the trap is per-fork. Witch branch = \"read the witch\" (refuse/trust/obey mixed). Leshy branch = \"trust but verify\" (defy/follow/nerve mixed). Neither branch shows or names the other guide.\n- Generate order: hub-master → WITCH + LESHY char masters → Branch A anchors → Branch B anchors. Gate per checkpoint, wait for \"go\" before paid gen.\n"
    },
    "createdAt": "2026-06-04T03:20:16.039Z",
    "modelStack": [
      {
        "model": "bytedance/seedance-2.0",
        "stage": "i2v",
        "params": {
          "resolution": "720p",
          "aspect_ratio": "9:16",
          "duration_sec": 4
        },
        "costUsd": 12.6
      },
      {
        "model": "kwaivgi/kling-v3.0-pro",
        "stage": "i2v",
        "params": {
          "resolution": "720p",
          "aspect_ratio": "9:16",
          "duration_sec": 4
        },
        "costUsd": 0.56
      },
      {
        "model": "openai/gpt-5.4-image-2",
        "stage": "image",
        "params": {
          "size": "1080x1920"
        },
        "costUsd": 6.4
      },
      {
        "model": "hyperframes-render",
        "stage": "video"
      }
    ],
    "composition": {
      "file": "index.html",
      "html": "<!doctype html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\" />\n<style>\n  @font-face { font-family: 'Pixelify'; src: url('assets/fonts/PixelifySans-VF.ttf') format('truetype'); font-weight: 400 700; font-style: normal; font-display: block; }\n  * { margin: 0; padding: 0; box-sizing: border-box; }\n  html, body { width: 1080px; height: 1920px; background: #000; overflow: hidden; }\n  #root { position: relative; width: 1080px; height: 1920px; background: #000; font-family: 'Pixelify', 'Courier New', monospace; }\n  .vid { position: absolute; inset: 0; width: 1080px; height: 1920px; object-fit: cover; display: block; z-index: 1; }\n  #vhs { position: absolute; inset: 0; z-index: 38; pointer-events: none; opacity: 0; }\n  #vcr { position: absolute; inset: 0; width: 100%; height: 100%; image-rendering: pixelated; opacity: 0.45; }\n  #vhs .scan { position: absolute; inset: 0;\n    background: linear-gradient(rgba(0,0,0,0) 50%, rgba(0,0,0,0.32) 50%), linear-gradient(90deg, rgba(255,0,0,0.05), rgba(0,255,0,0.02), rgba(0,0,255,0.05));\n    background-size: 100% 3px, 4px 100%; }\n  #vhs .tint { position: absolute; inset: 0; background: rgba(28,46,38,0.12); }\n  #vhs .pause { position: absolute; top: 54px; left: 60px; font-size: 46px; letter-spacing: 5px; color: #eef3e0; text-shadow: 0 0 12px rgba(0,0,0,0.95), 0 3px 8px #000; }\n  #vhs .pause b { letter-spacing: 0; margin-right: 14px; }\n  .grain { position: absolute; inset: 0; z-index: 40; pointer-events: none; background: repeating-linear-gradient(to bottom, rgba(0,0,0,0) 0 2px, rgba(0,0,0,0.20) 2px 3px); mix-blend-mode: multiply; opacity: 0.5; }\n  .vignette { position: absolute; inset: 0; z-index: 41; pointer-events: none; background: radial-gradient(118% 88% at 50% 46%, rgba(0,0,0,0) 50%, rgba(0,0,0,0.66) 100%); }\n  #title { position: absolute; z-index: 30; left: 0; right: 0; top: 130px; text-align: center; font-size: 76px; letter-spacing: 6px; color: #b6f0d2; opacity: 0; text-shadow: 0 0 24px rgba(0,0,0,0.95), 0 0 30px rgba(70,180,120,0.4), 0 4px 10px rgba(0,0,0,0.95); }\n  .name { position: absolute; z-index: 31; font-size: 66px; opacity: 0; text-shadow: 0 0 16px rgba(0,0,0,0.98), 0 3px 8px #000; }\n  #name-l { left: 60px; top: 470px; text-align: left; color: #c77dff; text-shadow: 0 0 16px rgba(0,0,0,0.98), 0 3px 8px #000, 0 0 30px rgba(199,125,255,0.55); }\n  #name-r { right: 70px; top: 720px; text-align: right; color: #8fe07a; text-shadow: 0 0 16px rgba(0,0,0,0.98), 0 3px 8px #000, 0 0 30px rgba(143,224,122,0.5); }\n  #countdown { position: absolute; z-index: 45; left: 50%; top: 63%; transform: translate(-50%,-50%); width: 360px; height: 360px; opacity: 0; }\n  #countdown svg { position: absolute; inset: 0; width: 100%; height: 100%; }\n  #cd-num { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 230px; color: #eef3e0; text-shadow: 0 0 28px rgba(0,0,0,0.95); line-height: 1; }\n  .cd-ring { fill: none; stroke: rgba(182,240,210,0.30); stroke-width: 7; }\n  .cd-sweep { fill: none; stroke: #b6f0d2; stroke-width: 11; transform: rotate(-90deg); transform-origin: 50% 50%; }\n  .cd-cross { stroke: rgba(182,240,210,0.45); stroke-width: 4; }\n  #cd-plate { position: absolute; z-index: 44; left: 50%; top: 63%; transform: translate(-50%,-50%); width: 390px; height: 390px; background: rgba(14,22,18,0.5); opacity: 0; }\n  .fork { position: absolute; z-index: 43; top: 38%; max-width: 470px; font-size: 60px; line-height: 1.05; color: #eef3e0; opacity: 0; text-shadow: 0 0 16px rgba(0,0,0,0.95), 0 3px 8px #000; }\n  #fork-l { left: 56px; text-align: left; }\n  #fork-r { right: 56px; text-align: right; }\n  #death-wash { position: absolute; inset: 0; z-index: 46; pointer-events: none; opacity: 0; background: radial-gradient(120% 90% at 50% 45%, rgba(150,0,0,0.65) 0%, rgba(40,0,0,0.92) 100%); }\n  #death { position: absolute; z-index: 47; left: 0; right: 0; top: 41%; text-align: center; font-size: 210px; letter-spacing: 8px; color: #ff2a2a; opacity: 0; line-height: 0.9; text-shadow: 7px 0 0 rgba(255,0,46,0.55), -7px 0 0 rgba(0,200,255,0.45), 0 0 40px rgba(255,40,40,0.7), 0 6px 16px rgba(0,0,0,0.95); }\n  #flash { position: absolute; inset: 0; z-index: 48; background: #fff; opacity: 0; pointer-events: none; }\n  .cap { position: absolute; z-index: 35; left: 70px; right: 70px; bottom: 300px; text-align: center; font-family: 'Pixelify', monospace; font-size: 58px; line-height: 1.25; letter-spacing: 1px; opacity: 0; text-shadow: 0 4px 22px rgba(0,0,0,0.98), 0 2px 6px rgba(0,0,0,1); white-space: pre-line; }\n  #cap { color: #fff; }\n  #cap-witch { color: #c77dff; text-shadow: 0 4px 22px rgba(0,0,0,0.98), 0 2px 6px rgba(0,0,0,1), 0 0 24px rgba(199,125,255,0.55); }\n  #cta { position: absolute; z-index: 36; left: 60px; right: 60px; top: 36%; text-align: center; font-size: 72px; line-height: 1.16; color: #b6f0d2; opacity: 0; text-shadow: 0 0 24px rgba(0,0,0,0.95), 0 0 36px rgba(70,180,120,0.45), 0 4px 10px #000; }\n</style>\n</head>\n<body>\n<div id=\"root\" data-composition-id=\"choose-swamp-001\" data-width=\"1080\" data-height=\"1920\" data-start=\"0\" data-duration=\"92.58\">\n\n  <video id=\"master\" class=\"vid clip\" data-start=\"0\" data-duration=\"92.58\" data-media-start=\"0\" data-track-index=\"0\" src=\"assets/master.mp4\" muted playsinline crossorigin=\"anonymous\"></video>\n\n  <div id=\"vhs\"><canvas id=\"vcr\"></canvas><div class=\"tint\"></div><div class=\"scan\"></div><div class=\"pause\"><b>&#10073;&#10073;</b>PAUSE</div></div>\n  <div id=\"title\">CHOOSE YOUR GUIDE</div>\n  <div class=\"name\" id=\"name-l\">WITCH</div>\n  <div class=\"name\" id=\"name-r\">LESHY</div>\n  <div class=\"fork\" id=\"fork-l\"></div>\n  <div class=\"fork\" id=\"fork-r\"></div>\n  <div id=\"cd-plate\"></div>\n  <div id=\"countdown\">\n    <svg viewBox=\"0 0 460 460\">\n      <circle class=\"cd-ring\" cx=\"230\" cy=\"230\" r=\"210\"></circle>\n      <circle class=\"cd-sweep\" id=\"cd-sweep\" cx=\"230\" cy=\"230\" r=\"210\"></circle>\n      <line class=\"cd-cross\" x1=\"230\" y1=\"6\" x2=\"230\" y2=\"454\"></line>\n      <line class=\"cd-cross\" x1=\"6\" y1=\"230\" x2=\"454\" y2=\"230\"></line>\n    </svg>\n    <div id=\"cd-num\">3</div>\n  </div>\n  <div id=\"death-wash\"></div>\n  <div id=\"death\">DEAD</div>\n  <div class=\"cap\" id=\"cap\"></div>\n  <div class=\"cap\" id=\"cap-witch\"></div>\n  <div id=\"cta\">THE WITCH<br>OR THE WOODS?<br>WHO DO YOU FOLLOW?</div>\n  <div class=\"grain\"></div>\n  <div class=\"vignette\"></div>\n  <div id=\"flash\"></div>\n\n  <!-- music bed: series soundtrack (track 9) -->\n  <audio id=\"bgm\" class=\"clip\" src=\"assets/music/soundtrack-bed.mp3\" data-start=\"0\" data-duration=\"92.58\" data-media-start=\"0\" data-track-index=\"9\" data-volume=\"0.22\"></audio>\n\n  <!-- VO: narrator (old-radio) + WITCH (diegetic violet) — track 10 -->\n  <audio id=\"vo-n01\"  class=\"clip\" src=\"assets/voiceover/sn01-hub.mp3\" data-start=\"0.30\"  data-duration=\"3.45\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-whub\" class=\"clip\" src=\"assets/voiceover/witch-hub.mp3\" data-start=\"6.70\" data-duration=\"3.37\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-w03\"  class=\"clip\" src=\"assets/voiceover/witch-a03.mp3\" data-start=\"10.20\" data-duration=\"3.53\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-n04\"  class=\"clip\" src=\"assets/voiceover/sn-a04.mp3\"  data-start=\"16.00\" data-duration=\"2.04\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-n05\"  class=\"clip\" src=\"assets/voiceover/sn-a05.mp3\"  data-start=\"19.40\" data-duration=\"2.56\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-w06\"  class=\"clip\" src=\"assets/voiceover/witch-a06.mp3\" data-start=\"22.80\" data-duration=\"1.83\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-n07\"  class=\"clip\" src=\"assets/voiceover/sn-a07.mp3\"  data-start=\"28.70\" data-duration=\"2.17\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-n08\"  class=\"clip\" src=\"assets/voiceover/sn-a08.mp3\"  data-start=\"31.90\" data-duration=\"2.17\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-w09\"  class=\"clip\" src=\"assets/voiceover/witch-a09.mp3\" data-start=\"35.30\" data-duration=\"5.51\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-n09b\" class=\"clip\" src=\"assets/voiceover/sn-a09b.mp3\" data-start=\"41.30\" data-duration=\"1.88\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-n10\"  class=\"clip\" src=\"assets/voiceover/sn-a10.mp3\"  data-start=\"44.70\" data-duration=\"1.83\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-n11\"  class=\"clip\" src=\"assets/voiceover/sn-b11.mp3\"  data-start=\"48.00\" data-duration=\"1.93\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-n12\"  class=\"clip\" src=\"assets/voiceover/sn-b12.mp3\"  data-start=\"52.00\" data-duration=\"2.22\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-n13\"  class=\"clip\" src=\"assets/voiceover/sn-b13.mp3\"  data-start=\"57.20\" data-duration=\"2.56\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-n14\"  class=\"clip\" src=\"assets/voiceover/sn-b14.mp3\"  data-start=\"60.60\" data-duration=\"2.17\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-n15b\" class=\"clip\" src=\"assets/voiceover/sn-b15.mp3\"  data-start=\"64.00\" data-duration=\"2.48\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-n16\"  class=\"clip\" src=\"assets/voiceover/sn-b16.mp3\"  data-start=\"69.58\" data-duration=\"2.25\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-n17\"  class=\"clip\" src=\"assets/voiceover/sn-b17.mp3\"  data-start=\"73.30\" data-duration=\"2.40\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-n18\"  class=\"clip\" src=\"assets/voiceover/sn-b18.mp3\"  data-start=\"76.70\" data-duration=\"2.06\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-n18b\" class=\"clip\" src=\"assets/voiceover/sn-b18b.mp3\" data-start=\"82.50\" data-duration=\"2.38\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-n19\"  class=\"clip\" src=\"assets/voiceover/sn-b19.mp3\"  data-start=\"85.90\" data-duration=\"1.72\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-cta\"  class=\"clip\" src=\"assets/voiceover/sn-cta.mp3\"  data-start=\"88.00\" data-duration=\"3.19\" data-track-index=\"10\" data-volume=\"1\"></audio>\n\n  <!-- countdown beeps (track 11) -->\n  <audio id=\"bp00\" class=\"clip\" src=\"assets/sfx/beep-soft.mp3\"       data-start=\"14.03\" data-duration=\"0.16\" data-track-index=\"11\" data-volume=\"1\"></audio>\n  <audio id=\"bp01\" class=\"clip\" src=\"assets/sfx/beep-soft.mp3\"       data-start=\"14.53\" data-duration=\"0.16\" data-track-index=\"11\" data-volume=\"1\"></audio>\n  <audio id=\"bp02\" class=\"clip\" src=\"assets/sfx/beep-soft-final.mp3\" data-start=\"15.03\" data-duration=\"0.30\" data-track-index=\"11\" data-volume=\"1\"></audio>\n  <audio id=\"bp03\" class=\"clip\" src=\"assets/sfx/beep-soft.mp3\"       data-start=\"26.66\" data-duration=\"0.16\" data-track-index=\"11\" data-volume=\"1\"></audio>\n  <audio id=\"bp04\" class=\"clip\" src=\"assets/sfx/beep-soft.mp3\"       data-start=\"27.16\" data-duration=\"0.16\" data-track-index=\"11\" data-volume=\"1\"></audio>\n  <audio id=\"bp05\" class=\"clip\" src=\"assets/sfx/beep-soft-final.mp3\" data-start=\"27.66\" data-duration=\"0.30\" data-track-index=\"11\" data-volume=\"1\"></audio>\n  <audio id=\"bp06\" class=\"clip\" src=\"assets/sfx/beep-soft.mp3\"       data-start=\"39.28\" data-duration=\"0.16\" data-track-index=\"11\" data-volume=\"1\"></audio>\n  <audio id=\"bp07\" class=\"clip\" src=\"assets/sfx/beep-soft.mp3\"       data-start=\"39.78\" data-duration=\"0.16\" data-track-index=\"11\" data-volume=\"1\"></audio>\n  <audio id=\"bp08\" class=\"clip\" src=\"assets/sfx/beep-soft-final.mp3\" data-start=\"40.28\" data-duration=\"0.30\" data-track-index=\"11\" data-volume=\"1\"></audio>\n  <audio id=\"bp09\" class=\"clip\" src=\"assets/sfx/beep-soft.mp3\"       data-start=\"55.28\" data-duration=\"0.16\" data-track-index=\"11\" data-volume=\"1\"></audio>\n  <audio id=\"bp10\" class=\"clip\" src=\"assets/sfx/beep-soft.mp3\"       data-start=\"55.78\" data-duration=\"0.16\" data-track-index=\"11\" data-volume=\"1\"></audio>\n  <audio id=\"bp11\" class=\"clip\" src=\"assets/sfx/beep-soft-final.mp3\" data-start=\"56.28\" data-duration=\"0.30\" data-track-index=\"11\" data-volume=\"1\"></audio>\n  <audio id=\"bp12\" class=\"clip\" src=\"assets/sfx/beep-soft.mp3\"       data-start=\"67.91\" data-duration=\"0.16\" data-track-index=\"11\" data-volume=\"1\"></audio>\n  <audio id=\"bp13\" class=\"clip\" src=\"assets/sfx/beep-soft.mp3\"       data-start=\"68.41\" data-duration=\"0.16\" data-track-index=\"11\" data-volume=\"1\"></audio>\n  <audio id=\"bp14\" class=\"clip\" src=\"assets/sfx/beep-soft-final.mp3\" data-start=\"68.91\" data-duration=\"0.30\" data-track-index=\"11\" data-volume=\"1\"></audio>\n  <audio id=\"bp15\" class=\"clip\" src=\"assets/sfx/beep-soft.mp3\"       data-start=\"80.53\" data-duration=\"0.16\" data-track-index=\"11\" data-volume=\"1\"></audio>\n  <audio id=\"bp16\" class=\"clip\" src=\"assets/sfx/beep-soft.mp3\"       data-start=\"81.03\" data-duration=\"0.16\" data-track-index=\"11\" data-volume=\"1\"></audio>\n  <audio id=\"bp17\" class=\"clip\" src=\"assets/sfx/beep-soft-final.mp3\" data-start=\"81.53\" data-duration=\"0.30\" data-track-index=\"11\" data-volume=\"1\"></audio>\n\n  <!-- ambience (track 12) -->\n  <audio id=\"sx-bog1\" class=\"clip\" src=\"assets/sfx/bog-ambience.mp3\" data-start=\"0.00\"  data-duration=\"10.0\" data-track-index=\"12\" data-volume=\"0.16\"></audio>\n  <audio id=\"sx-bog2\" class=\"clip\" src=\"assets/sfx/bog-ambience.mp3\" data-start=\"50.00\" data-duration=\"10.0\" data-track-index=\"12\" data-volume=\"0.16\"></audio>\n\n  <!-- unique death stingers (track 13) -->\n  <audio id=\"sx-d04\"  class=\"clip\" src=\"assets/sfx/death-fire.mp3\"     data-start=\"17.60\" data-duration=\"3.0\" data-track-index=\"13\" data-volume=\"0.6\"></audio>\n  <audio id=\"sx-d07\"  class=\"clip\" src=\"assets/sfx/death-shove.mp3\"    data-start=\"30.20\" data-duration=\"3.0\" data-track-index=\"13\" data-volume=\"0.6\"></audio>\n  <audio id=\"sx-d09b\" class=\"clip\" src=\"assets/sfx/death-door.mp3\"     data-start=\"42.85\" data-duration=\"3.0\" data-track-index=\"13\" data-volume=\"0.6\"></audio>\n  <audio id=\"sx-d13\"  class=\"clip\" src=\"assets/sfx/death-wade.mp3\"     data-start=\"58.85\" data-duration=\"3.0\" data-track-index=\"13\" data-volume=\"0.6\"></audio>\n  <audio id=\"sx-d16\"  class=\"clip\" src=\"assets/sfx/death-clearing.mp3\" data-start=\"71.45\" data-duration=\"3.0\" data-track-index=\"13\" data-volume=\"0.6\"></audio>\n  <audio id=\"sx-d18b\" class=\"clip\" src=\"assets/sfx/death-lookback.mp3\" data-start=\"84.10\" data-duration=\"3.0\" data-track-index=\"13\" data-volume=\"0.6\"></audio>\n\n  <!-- event SFX (track 14) -->\n  <audio id=\"sx-snf\" class=\"clip\" src=\"assets/sfx/snuffle-hound.mp3\" data-start=\"19.00\" data-duration=\"5.0\" data-track-index=\"14\" data-volume=\"0.4\"></audio>\n  <audio id=\"sx-cak\" class=\"clip\" src=\"assets/sfx/witch-cackle.mp3\"  data-start=\"44.60\" data-duration=\"3.0\" data-track-index=\"14\" data-volume=\"0.5\"></audio>\n  <audio id=\"sx-mud\" class=\"clip\" src=\"assets/sfx/mud-suck.mp3\"      data-start=\"60.33\" data-duration=\"3.0\" data-track-index=\"14\" data-volume=\"0.35\"></audio>\n  <audio id=\"sx-wlf\" class=\"clip\" src=\"assets/sfx/wolf-howls.mp3\"    data-start=\"63.71\" data-duration=\"6.0\" data-track-index=\"14\" data-volume=\"0.4\"></audio>\n  <audio id=\"sx-dwn\" class=\"clip\" src=\"assets/sfx/dawn-birds.mp3\"    data-start=\"85.60\" data-duration=\"5.0\" data-track-index=\"14\" data-volume=\"0.4\"></audio>\n\n  <!-- torch crackle bed (track 15) -->\n  <audio id=\"sx-t1\" class=\"clip\" src=\"assets/sfx/torch-crackle.mp3\" data-start=\"0.00\"  data-duration=\"10.0\" data-track-index=\"15\" data-volume=\"0.1\"></audio>\n  <audio id=\"sx-t2\" class=\"clip\" src=\"assets/sfx/torch-crackle.mp3\" data-start=\"25.00\" data-duration=\"10.0\" data-track-index=\"15\" data-volume=\"0.1\"></audio>\n  <audio id=\"sx-t3\" class=\"clip\" src=\"assets/sfx/torch-crackle.mp3\" data-start=\"50.00\" data-duration=\"10.0\" data-track-index=\"15\" data-volume=\"0.1\"></audio>\n  <audio id=\"sx-t4\" class=\"clip\" src=\"assets/sfx/torch-crackle.mp3\" data-start=\"72.00\" data-duration=\"10.0\" data-track-index=\"15\" data-volume=\"0.1\"></audio>\n\n  <script src=\"https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js\"></script>\n  <script>\n    const tl = gsap.timeline({ paused: true, defaults: { immediateRender: false } });\n    const C = 2 * Math.PI * 210;\n    gsap.set(\"#cd-sweep\", { strokeDasharray: C, strokeDashoffset: 0 });\n    gsap.set([\"#title\",\"#name-l\",\"#name-r\",\"#countdown\",\"#cd-plate\",\"#fork-l\",\"#fork-r\",\"#death\",\"#death-wash\",\"#cap\",\"#cap-witch\",\"#cta\",\"#vhs\",\"#flash\"], { opacity: 0 });\n\n    const A   = [0.00,6.46,9.83,15.71,19.08,22.46,28.33,31.71,35.08,40.96,44.33,47.71,51.08,56.96,60.33,63.71,69.58,72.96,76.33,82.21,85.58];\n    const SEG = [6.96,3.88,6.38,3.88,3.88,6.38,3.88,3.88,6.38,3.88,3.88,3.88,6.38,3.88,3.88,6.38,3.88,3.88,6.38,3.88,7.00];\n\n    const vcr = document.getElementById(\"vcr\"); vcr.width = 270; vcr.height = 480;\n    const vctx = vcr.getContext(\"2d\");\n    function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}\n    function drawVHS(t){\n      const r = mulberry32((Math.floor(t*30)|0)+1); const w=vcr.width,h=vcr.height;\n      const img=vctx.createImageData(w,h),d=img.data;\n      for(let i=0;i<d.length;i+=4){const v=(r()*255)|0;d[i]=d[i+1]=d[i+2]=v;d[i+3]=(r()*60)|0;}\n      vctx.putImageData(img,0,0);\n      const band=Math.floor((t*60)%h); vctx.fillStyle=\"rgba(255,255,255,0.55)\";\n      for(let k=0;k<26;k++){const x=(r()*w)|0,y=band+((r()*46)|0)-23;vctx.fillRect(x,y,(r()*7)|0,2);}\n    }\n    function vhs(s,dur){\n      tl.set(\"#vhs\",{opacity:1},s);\n      const pf={v:s}; tl.to(pf,{v:s+dur,duration:dur,ease:\"none\",onUpdate:()=>drawVHS(pf.v),overwrite:\"auto\"},s);\n      let t=s,k=0; while(t<s+dur){tl.set(\"#vhs\",{y:(k%2?1:-1)},t);t+=0.1;k++;}\n      tl.set(\"#vhs\",{y:0},s+dur); tl.to(\"#vhs\",{opacity:0,duration:0.12,overwrite:\"auto\"},s+dur);\n    }\n    function capEl(el,text,tin,tout){\n      tl.set(el,{textContent:text},tin-0.01);\n      tl.fromTo(el,{opacity:0,y:26},{opacity:1,y:0,duration:0.32,ease:\"power3.out\",overwrite:\"auto\"},tin);\n      tl.to(el,{opacity:0,duration:0.28,overwrite:\"auto\"},tout);\n      tl.set(el,{opacity:0},tout+0.29);\n    }\n    const cap  = (t,a,b)=>capEl(\"#cap\",t,a,b);\n    const capW = (t,a,b)=>capEl(\"#cap-witch\",t,a,b);\n    function disc(s,step){\n      step=step||0.5;\n      tl.fromTo(\"#cd-plate\",{opacity:0},{opacity:1,duration:0.16,overwrite:\"auto\"},s-0.1);\n      tl.fromTo(\"#countdown\",{opacity:0},{opacity:1,duration:0.16,overwrite:\"auto\"},s-0.1);\n      for(let i=0;i<3;i++){const t=s+i*step;\n        tl.set(\"#cd-num\",{textContent:3-i},t);\n        tl.fromTo(\"#cd-sweep\",{strokeDashoffset:0},{strokeDashoffset:C,duration:step,ease:\"none\"},t);\n        tl.fromTo(\"#cd-num\",{scale:1.2,opacity:0.4},{scale:1,opacity:1,duration:step*0.45,ease:\"back.out(2)\"},t);\n      }\n      tl.to([\"#countdown\",\"#cd-plate\"],{opacity:0,duration:0.2,ease:\"power2.in\",overwrite:\"auto\"},s+3*step-0.04);\n    }\n    function deathBeat(i){\n      const s=A[i],dur=SEG[i],dt=s+dur-1.7;\n      tl.set(\"#flash\",{opacity:0.85},dt);\n      tl.to(\"#flash\",{opacity:0,duration:0.22,ease:\"power2.in\",overwrite:\"auto\"},dt+0.03);\n      tl.set(\"#flash\",{opacity:0},dt+0.3);\n      tl.fromTo(\"#death-wash\",{opacity:0.9},{opacity:0,duration:0.6,ease:\"power2.in\",overwrite:\"auto\"},dt);\n      tl.fromTo(\"#death\",{scale:1.7,opacity:0},{scale:1,opacity:1,duration:0.3,ease:\"back.out(2.2)\",overwrite:\"auto\"},dt);\n      tl.to(\"#death\",{x:\"+=16\",duration:0.045,repeat:6,yoyo:true},dt+0.3);\n      tl.set(\"#death\",{x:0},dt+0.7);\n      tl.to(\"#death\",{opacity:0,duration:0.3,overwrite:\"auto\"},s+dur-0.05);\n      tl.set(\"#death\",{opacity:0},s+dur);\n    }\n    function freezeFork(i,l,r){\n      const fs=A[i]+3.9, cd=A[i]+4.2, clear=cd+1.5+0.05;\n      vhs(fs,clear-fs);\n      tl.set(\"#fork-l\",{textContent:l},fs);\n      tl.set(\"#fork-r\",{textContent:r},fs);\n      tl.fromTo(\"#fork-l\",{opacity:0,x:-44},{opacity:1,x:0,duration:0.28,ease:\"power3.out\",overwrite:\"auto\"},fs+0.05);\n      tl.fromTo(\"#fork-r\",{opacity:0,x:44},{opacity:1,x:0,duration:0.28,ease:\"power3.out\",overwrite:\"auto\"},fs+0.05);\n      tl.to([\"#fork-l\",\"#fork-r\"],{opacity:0,duration:0.22,overwrite:\"auto\"},clear-0.05);\n      tl.set([\"#fork-l\",\"#fork-r\"],{opacity:0},clear+0.2);\n      disc(cd,0.5);\n    }\n\n    // ===== INTRO (hub) =====\n    tl.fromTo(\"#title\",{opacity:0,y:-22},{opacity:1,y:0,duration:0.4,ease:\"power3.out\"},0.4);\n    tl.to(\"#title\",{x:\"+=10\",duration:0.04,repeat:5,yoyo:true,ease:\"none\"},0.85);\n    tl.set(\"#title\",{x:0},1.2);\n    tl.to(\"#title\",{opacity:0.35,duration:0.05,repeat:3,yoyo:true,ease:\"none\"},0.9);\n    tl.fromTo(\"#name-l\",{opacity:0,scale:0.7},{opacity:1,scale:1,duration:0.4,ease:\"back.out(2)\"},0.7);\n    tl.fromTo(\"#name-r\",{opacity:0,scale:0.7},{opacity:1,scale:1,duration:0.4,ease:\"back.out(2)\"},1.0);\n    tl.to(\"#title\",{opacity:0,duration:0.3},2.6); tl.set(\"#title\",{opacity:0},2.95);\n    vhs(3.9,2.5);\n    disc(4.9,0.5);\n    tl.to([\"#name-l\",\"#name-r\"],{opacity:0,duration:0.3},6.1); tl.set([\"#name-l\",\"#name-r\"],{opacity:0},6.45);\n\n    // ===== BRANCH A — WITCH (read her) =====\n    freezeFork(2,\"SIT BY THE FIRE\",\"STAY BACK\"); deathBeat(3);\n    freezeFork(5,\"SHOVE HER OFF\",\"DRINK IT\"); deathBeat(6);\n    freezeFork(8,\"CLEAN DOOR\",\"CRAWL-HOLE\"); deathBeat(9);\n    // ===== BRANCH B — LESHY (trust but verify) =====\n    freezeFork(12,\"WADE LIKE HIM\",\"CROSS BY STONES\"); deathBeat(13);\n    freezeFork(15,\"OPEN CLEARING\",\"THORN-BRAKE\"); deathBeat(16);\n    freezeFork(18,\"LOOK BACK\",\"WALK ON\"); deathBeat(19);\n\n    // ===== captions (white narrator / violet WITCH; leshy is mute) =====\n    cap (\"TWO GUIDES IN THE BLACK WATER.\\nONE WALKS YOU HOME.\", 0.42, 3.70);\n    capW(\"“Come, child. I'll see you through the dark.”\", 6.82, 10.02);\n    capW(\"“Sit. Warm your bones by my fire.”\", 10.32, 13.68);\n    cap (\"You took the warm chair. The hearth ate you.\", 16.12, 17.99);\n    cap (\"You kept your distance. Then it sniffed for you.\", 19.52, 21.91);\n    capW(\"“Drink it. All of it. Now.”\", 22.92, 24.58);\n    cap (\"You shoved her off. It smelled you anyway.\", 28.82, 30.82);\n    cap (\"You choked it down. The thing lost your scent.\", 32.02, 34.02);\n    capW(\"“Not that door. The hole, behind the stove.”\", 35.42, 40.76);\n    cap (\"The clean door opened onto black water.\", 41.42, 43.13);\n    cap (\"You crawled out. The witch was right.\", 44.82, 46.48);\n    cap (\"Or you followed the old thing in the trees.\", 48.12, 49.88);\n    cap (\"He wades it like nothing. You are not him.\", 52.12, 54.17);\n    cap (\"You waded in. For you, it had no bottom.\", 57.32, 59.71);\n    cap (\"You took the stones instead. Smart.\", 60.72, 62.72);\n    cap (\"Easy clearing, or his wall of thorns?\", 64.12, 66.43);\n    cap (\"You walked into the open. The pack ran you down.\", 69.70, 71.78);\n    cap (\"You bled through the thorns. They lost you.\", 73.42, 75.65);\n    cap (\"Home glows behind you. Don't you dare look.\", 76.82, 78.71);\n    cap (\"You looked back. The bog took you.\", 82.62, 84.83);\n\n    // ===== END — CTA over the dawn-walk idle clip (motion, NOT a freeze) =====\n    tl.fromTo(\"#cta\",{opacity:0,scale:0.9},{opacity:1,scale:1,duration:0.5,ease:\"back.out(1.8)\"},86.4);\n    tl.to({},{duration:0.01},92.56);\n\n    window.__timelines = window.__timelines || {};\n    window.__timelines[\"choose-swamp-001\"] = tl;\n  </script>\n</div>\n</body>\n</html>\n",
      "timing": {
        "A": [
          0,
          6.46,
          9.83,
          15.71,
          19.08,
          22.46,
          28.33,
          31.71,
          35.08,
          40.96,
          44.33,
          47.71,
          51.08,
          56.96,
          60.33,
          63.71,
          69.58,
          72.96,
          76.33,
          82.21,
          85.58
        ],
        "SEG": [
          6.96,
          3.88,
          6.38,
          3.88,
          3.88,
          6.38,
          3.88,
          3.88,
          6.38,
          3.88,
          3.88,
          3.88,
          6.38,
          3.88,
          3.88,
          6.38,
          3.88,
          3.88,
          6.38,
          3.88,
          7
        ]
      },
      "components": [
        "cap",
        "capEl",
        "cd-cross",
        "cd-ring",
        "cd-sweep",
        "choose-swamp-001",
        "clip",
        "deathBeat",
        "disc",
        "drawVHS",
        "fork",
        "freezeFork",
        "grain",
        "mulberry32",
        "name",
        "pause",
        "scan",
        "tint",
        "vhs",
        "vid",
        "vignette"
      ],
      "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-swamp/index.html"
    },
    "costRollupUsd": 19.56,
    "schemaVersion": 1
  },
  {
    "notes": "hard asset path for slot 'hub-lowpoly' does not exist; recorded by ref; hard asset path for slot 'hub-ftf' does not exist; recorded by ref",
    "assets": [
      {
        "kind": "character",
        "path": "assets/char-alien.png",
        "slot": "char-alien",
        "bytes": 1375343,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-warofworlds/assets/char-alien.png"
      },
      {
        "kind": "character",
        "path": "assets/char-survivor.png",
        "slot": "char-survivor",
        "bytes": 1163689,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-warofworlds/assets/char-survivor.png"
      },
      {
        "kind": "location",
        "path": "assets/hub.png",
        "slot": "hub",
        "bytes": 1443302,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-warofworlds/assets/hub.png"
      },
      {
        "kind": "location",
        "path": "assets/hub-ftf.png",
        "slot": "hub-ftf"
      },
      {
        "kind": "location",
        "path": "assets/hub-lowpoly.png",
        "slot": "hub-lowpoly"
      },
      {
        "kind": "location",
        "path": "assets/hub-vid.mp4",
        "slot": "hub-vid",
        "bytes": 1765677,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-warofworlds/assets/hub-vid.mp4"
      },
      {
        "kind": "location",
        "path": "assets/scene-a02-shelter.png",
        "slot": "scene-a02-shelter",
        "bytes": 1271260,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-warofworlds/assets/scene-a02-shelter.png"
      },
      {
        "kind": "location",
        "path": "assets/scene-a02-shelter-vid.mp4",
        "slot": "scene-a02-shelter-vid",
        "bytes": 2358464,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-warofworlds/assets/scene-a02-shelter-vid.mp4"
      },
      {
        "kind": "location",
        "path": "assets/scene-a03-fork-door.png",
        "slot": "scene-a03-fork-door",
        "bytes": 1256051,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-warofworlds/assets/scene-a03-fork-door.png"
      },
      {
        "kind": "location",
        "path": "assets/scene-a03-fork-door-vid.mp4",
        "slot": "scene-a03-fork-door-vid",
        "bytes": 1202590,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-warofworlds/assets/scene-a03-fork-door-vid.mp4"
      },
      {
        "kind": "location",
        "path": "assets/scene-a04-pen.png",
        "slot": "scene-a04-pen",
        "bytes": 1383609,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-warofworlds/assets/scene-a04-pen.png"
      },
      {
        "kind": "location",
        "path": "assets/scene-a04-pen-vid.mp4",
        "slot": "scene-a04-pen-vid",
        "bytes": 3243532,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-warofworlds/assets/scene-a04-pen-vid.mp4"
      },
      {
        "kind": "location",
        "path": "assets/scene-a05-fork-sort.png",
        "slot": "scene-a05-fork-sort",
        "bytes": 1470804,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-warofworlds/assets/scene-a05-fork-sort.png"
      },
      {
        "kind": "location",
        "path": "assets/scene-a05-fork-sort-vid.mp4",
        "slot": "scene-a05-fork-sort-vid",
        "bytes": 1989668,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-warofworlds/assets/scene-a05-fork-sort-vid.mp4"
      },
      {
        "kind": "location",
        "path": "assets/scene-a06-branded.png",
        "slot": "scene-a06-branded",
        "bytes": 1303715,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-warofworlds/assets/scene-a06-branded.png"
      },
      {
        "kind": "location",
        "path": "assets/scene-a06-branded-vid.mp4",
        "slot": "scene-a06-branded-vid",
        "bytes": 2128945,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-warofworlds/assets/scene-a06-branded-vid.mp4"
      },
      {
        "kind": "location",
        "path": "assets/scene-a07-fork-conveyor.png",
        "slot": "scene-a07-fork-conveyor",
        "bytes": 1192367,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-warofworlds/assets/scene-a07-fork-conveyor.png"
      },
      {
        "kind": "location",
        "path": "assets/scene-a07-fork-conveyor-vid.mp4",
        "slot": "scene-a07-fork-conveyor-vid",
        "bytes": 1808551,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-warofworlds/assets/scene-a07-fork-conveyor-vid.mp4"
      },
      {
        "kind": "location",
        "path": "assets/scene-a08-bad-end.png",
        "slot": "scene-a08-bad-end",
        "bytes": 1294484,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-warofworlds/assets/scene-a08-bad-end.png"
      },
      {
        "kind": "location",
        "path": "assets/scene-a08-bad-end-vid.mp4",
        "slot": "scene-a08-bad-end-vid",
        "bytes": 2078040,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-warofworlds/assets/scene-a08-bad-end-vid.mp4"
      },
      {
        "kind": "location",
        "path": "assets/scene-b09-run.png",
        "slot": "scene-b09-run",
        "bytes": 1307330,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-warofworlds/assets/scene-b09-run.png"
      },
      {
        "kind": "location",
        "path": "assets/scene-b09-run-vid.mp4",
        "slot": "scene-b09-run-vid",
        "bytes": 2775348,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-warofworlds/assets/scene-b09-run-vid.mp4"
      },
      {
        "kind": "location",
        "path": "assets/scene-b10-fork-cellar.png",
        "slot": "scene-b10-fork-cellar",
        "bytes": 1199871,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-warofworlds/assets/scene-b10-fork-cellar.png"
      },
      {
        "kind": "location",
        "path": "assets/scene-b10-fork-cellar-vid.mp4",
        "slot": "scene-b10-fork-cellar-vid",
        "bytes": 1257433,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-warofworlds/assets/scene-b10-fork-cellar-vid.mp4"
      },
      {
        "kind": "location",
        "path": "assets/scene-b11-death-cellar.png",
        "slot": "scene-b11-death-cellar",
        "bytes": 1311610,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-warofworlds/assets/scene-b11-death-cellar.png"
      },
      {
        "kind": "location",
        "path": "assets/scene-b11-death-cellar-vid.mp4",
        "slot": "scene-b11-death-cellar-vid",
        "bytes": 2486486,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-warofworlds/assets/scene-b11-death-cellar-vid.mp4"
      },
      {
        "kind": "location",
        "path": "assets/scene-b12-across.png",
        "slot": "scene-b12-across",
        "bytes": 1274244,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-warofworlds/assets/scene-b12-across.png"
      },
      {
        "kind": "location",
        "path": "assets/scene-b12-across-vid.mp4",
        "slot": "scene-b12-across-vid",
        "bytes": 3060794,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-warofworlds/assets/scene-b12-across-vid.mp4"
      },
      {
        "kind": "location",
        "path": "assets/scene-b13-fork-tunnel.png",
        "slot": "scene-b13-fork-tunnel",
        "bytes": 1152395,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-warofworlds/assets/scene-b13-fork-tunnel.png"
      },
      {
        "kind": "location",
        "path": "assets/scene-b13-fork-tunnel-vid.mp4",
        "slot": "scene-b13-fork-tunnel-vid",
        "bytes": 925053,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-warofworlds/assets/scene-b13-fork-tunnel-vid.mp4"
      },
      {
        "kind": "location",
        "path": "assets/scene-b14-death-tunnel.png",
        "slot": "scene-b14-death-tunnel",
        "bytes": 1218534,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-warofworlds/assets/scene-b14-death-tunnel.png"
      },
      {
        "kind": "location",
        "path": "assets/scene-b14-death-tunnel-vid.mp4",
        "slot": "scene-b14-death-tunnel-vid",
        "bytes": 2843982,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-warofworlds/assets/scene-b14-death-tunnel-vid.mp4"
      },
      {
        "kind": "location",
        "path": "assets/scene-b15-through.png",
        "slot": "scene-b15-through",
        "bytes": 1182612,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-warofworlds/assets/scene-b15-through.png"
      },
      {
        "kind": "location",
        "path": "assets/scene-b15-through-vid.mp4",
        "slot": "scene-b15-through-vid",
        "bytes": 2132187,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-warofworlds/assets/scene-b15-through-vid.mp4"
      },
      {
        "kind": "location",
        "path": "assets/scene-b16-fork-evac.png",
        "slot": "scene-b16-fork-evac",
        "bytes": 1223411,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-warofworlds/assets/scene-b16-fork-evac.png"
      },
      {
        "kind": "location",
        "path": "assets/scene-b16-fork-evac-vid.mp4",
        "slot": "scene-b16-fork-evac-vid",
        "bytes": 1302072,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-warofworlds/assets/scene-b16-fork-evac-vid.mp4"
      },
      {
        "kind": "location",
        "path": "assets/scene-b17-death-bolt.png",
        "slot": "scene-b17-death-bolt",
        "bytes": 1125347,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-warofworlds/assets/scene-b17-death-bolt.png"
      },
      {
        "kind": "location",
        "path": "assets/scene-b17-death-bolt-vid.mp4",
        "slot": "scene-b17-death-bolt-vid",
        "bytes": 2894900,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-warofworlds/assets/scene-b17-death-bolt-vid.mp4"
      },
      {
        "kind": "location",
        "path": "assets/scene-b18-end.png",
        "slot": "scene-b18-end",
        "bytes": 1273334,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-warofworlds/assets/scene-b18-end.png"
      },
      {
        "kind": "location",
        "path": "assets/scene-b18-end-vid.mp4",
        "slot": "scene-b18-end-vid",
        "bytes": 3938447,
        "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-warofworlds/assets/scene-b18-end-vid.mp4"
      }
    ],
    "unitId": "choose-warofworlds",
    "prompts": [
      {
        "slot": "char-alien",
        "text": "{\n  \"prompt\": {\n    \"scene\": {\n      \"description\": \"RETRO PS1/PSX LOW-POLY SURVIVAL-HORROR 3D GAME RENDER — chunky simplified low-poly geometry, low-resolution dithered textures, heavy film grain, vertex wobble, affine texture warping; NOT photorealistic, NOT high-detail, NOT painterly, NOT glossy. Character reference of a 'PEACEFUL' alien guide that must look GENTLE, BENEVOLENT and INVITING — the kind of being you would WANT to trust. A living brain and soft pink jelly suspended inside a clean transparent glass capsule, ringed by smooth articulated robotic tentacle-arms, hovering serenely on a soft warm glow. The capsule glows a soft, warm, reassuring pink. No face, but the posture reads kind and welcoming — tentacle-arms opening in a gentle gesture, one extended warmly toward the camera as if offering help. A calm, comforting, almost angelic presence. Palette: soft warm pink + cream glow, clean pale chassis; the ruined city behind is hushed, dim and distant — NO fire, NO menace in front.\",\n      \"subject\": \"a gentle, benevolent, inviting alien — soft pink brain/jelly in a clean glass capsule, smooth robotic tentacle-arms opening in welcome, warm reassuring glow, no face, trustworthy and kind-looking\",\n      \"setting\": \"a calm glowing 'shelter' light and soft warm haze; ruined city hushed and distant behind, no fire foregrounded\",\n      \"action\": \"hovering serenely, opening its arms in a soft welcome, one tentacle extended kindly toward the camera\"\n    },\n    \"style\": {\n      \"primary\": \"retro PS1/PSX 5th-gen-console low-poly survival-horror 3D game render\",\n      \"rendering_quality\": \"very low fidelity, low polygon count, chunky simplified geometry, flat low-res dithered textures, heavy grain; NOT photorealistic, NOT high-detail, NOT painterly, NOT glossy\",\n      \"surface_textures\": \"low-res dithered clean chassis, translucent glowing capsule, soft jelly\",\n      \"lighting\": \"soft warm pink shelter-glow as key, gentle and reassuring, low calm ambient, light vignette\"\n    },\n    \"technical\": {\n      \"angle\": \"eye-level, slight low angle as it hovers gently\",\n      \"rendering\": \"faint CRT/VHS scanline grain, low-poly aliasing, affine texture warping\",\n      \"resolution\": \"PS1-era low-fidelity, 9:16 vertical\"\n    },\n    \"composition\": {\n      \"framing\": \"centered full-body, clear readable silhouette\",\n      \"subject_placement\": \"center frame, soft warm glow around it, hushed city far behind\"\n    },\n    \"quality\": {\n      \"include\": [\"PS1/PSX low-poly\", \"chunky low polygon count\", \"low-res dithered textures\", \"heavy grain\", \"brain in a glass capsule\", \"robotic tentacle arms\", \"hovering\", \"GENTLE benevolent inviting\", \"warm reassuring pink glow\", \"trustworthy kind presence\", \"9:16 vertical\"],\n      \"avoid\": [\"photorealistic\", \"hyperdetailed\", \"painterly\", \"glossy\", \"high-poly\", \"menacing\", \"scary\", \"hostile\", \"aggressive\", \"threatening\", \"creepy\", \"dark and grim\", \"fire and chaos in front\", \"humanoid grey alien\", \"watermark\"],\n      \"reference_standard\": \"PS1-era sci-fi friendly-helper robot; Mister Handy (Fallout) silhouette but warm, gentle and trustworthy\"\n    }\n  }\n}\n",
        "stage": "image"
      },
      {
        "slot": "char-survivor",
        "text": "{\n  \"prompt\": {\n    \"scene\": {\n      \"description\": \"RETRO PS1/PSX LOW-POLY SURVIVAL-HORROR 3D GAME RENDER — chunky simplified low-poly geometry, low-resolution dithered textures, heavy film grain, dark and murky, limited detail, vertex wobble, affine texture warping; Silent Hill 1 / early Resident Evil / Puppet Combo / voxel look; NOT photorealistic, NOT high-detail, NOT painterly, NOT glossy. Full-body character reference of a big man about 190cm tall, around 60 years old, Black, with grey hair and grey stubble; ONE blind milky-white eye crossed by an old scar; a weathered, hard face. He wears a green button overshirt over a white t-shirt, work trousers and boots. He carries a scavenged sawn-off rifle, and a small faded child's backpack is clipped to his belt. Paranoid, exhausted, guarded stance. Palette: olive-green shirt, white tee, dark skin, grey hair, ash-grey ruined city, cold scanner-beam glow.\",\n      \"subject\": \"tall ~190cm ~60yo Black man, grey hair and stubble, one blind milky-white scarred eye, green overshirt over white tee, work trousers, boots, sawn-off rifle, child's backpack on belt\",\n      \"setting\": \"ruined city, falling ash, an alien tripod's scanner beam sweeping behind\",\n      \"action\": \"standing guarded, rifle ready, scanning\"\n    },\n    \"style\": {\n      \"primary\": \"retro PS1/PSX 5th-gen-console low-poly survival-horror 3D game render\",\n      \"rendering_quality\": \"very low fidelity, low polygon count, chunky simplified geometry, flat low-res dithered textures, heavy grain; NOT photorealistic, NOT high-detail, NOT painterly, NOT glossy\",\n      \"surface_textures\": \"low-res dithered skin and worn cloth textures, scuffed boots\",\n      \"lighting\": \"cold scanner-beam key, low ambient ash light, deep crushed shadows, heavy vignette\"\n    },\n    \"technical\": {\n      \"angle\": \"eye-level, slight low angle to read his height\",\n      \"rendering\": \"faint CRT/VHS scanline grain, low-poly aliasing, affine texture warping\",\n      \"resolution\": \"PS1-era low-fidelity, 9:16 vertical\"\n    },\n    \"composition\": {\n      \"framing\": \"centered full-body, clear readable silhouette\",\n      \"subject_placement\": \"center frame, ruined city and tripod beam behind\"\n    },\n    \"quality\": {\n      \"include\": [\n        \"voxel low-poly PS1 horror render\",\n        \"affine-warped textures\",\n        \"dithered grain\",\n        \"tall aging black survivor\",\n        \"one blind milky-white scarred eye\",\n        \"green overshirt over white tee\",\n        \"sawn-off rifle\",\n        \"child's backpack on belt\",\n        \"9:16 vertical\",\n        \"PS1/PSX low-poly\",\n        \"chunky low polygon count\",\n        \"low-resolution dithered textures\",\n        \"heavy grain\",\n        \"dark murky limited detail\",\n        \"vertex wobble\",\n        \"Silent Hill 1 / Puppet Combo aesthetic\"\n      ],\n      \"avoid\": [\n        \"photorealistic\",\n        \"smooth modern CGI\",\n        \"glossy octane render\",\n        \"cartoon\",\n        \"anime\",\n        \"young\",\n        \"clean\",\n        \"two healthy eyes\",\n        \"beauty filter\",\n        \"watermark\",\n        \"deformed hands\",\n        \"photorealistic\",\n        \"hyperdetailed\",\n        \"painterly\",\n        \"glossy\",\n        \"high-poly\",\n        \"ray traced\",\n        \"octane render\",\n        \"unreal engine 5\",\n        \"4k\",\n        \"sharp realistic skin\",\n        \"modern AAA graphics\"\n      ],\n      \"reference_standard\": \"PS1-era survival-horror survivor NPC model, gritty post-invasion register\"\n    }\n  }\n}\n",
        "stage": "image"
      },
      {
        "slot": "hub",
        "text": "Generate a screenshot from a first-person horror video game with NO interface/HUD, in voxel graphics in the style of PS1 (chunky low-poly geometry, low-resolution dithered textures, affine texture warping, vertex wobble, heavy grain, dark and murky, limited detail — NOT photorealistic, NOT high-detail, NOT painterly, NOT glossy). The hero's blocky low-poly LEFT HAND is visible in the foreground, raised as if shielding. The hero stands in a ruined city street with towering alien tripod war-machines in the distance, ash falling, two ways branching. Before the left path hovers a GENTLE, benevolent 'peaceful' alien — a soft pink brain in a clean glass capsule with smooth robotic tentacle-arms, a warm reassuring glow, opening its arms in welcome. Before the right path stands a tall ~60-year-old Black survivor with a blind milky-white scarred eye, a green overshirt over a white tee, a sawn-off rifle, and a small child's backpack clipped to his belt. Smoke-grey dim light, drifting ash, a faint cold scanner beam in the distance.\n\nFRAMING — MATCH THE SECOND REFERENCE IMAGE FOR SCALE & PLACEMENT ONLY (do NOT copy its content, characters or any text): the two guides stand side by side facing the camera, FULL BODY from head to feet, LARGE and CLOSE so they fill most of the vertical frame — feet visible near the bottom, heads near the top, the ruined street and tripod receding between and behind them. This is the opening 'hook' character-select shot; characters must be big, bright and instantly readable in the very first frame. Do NOT crop legs or feet. 9:16 vertical.\n",
        "stage": "image"
      },
      {
        "slot": "hub-ftf",
        "text": "Generate a screenshot from a first-person horror video game with NO interface/HUD, rendered in the EXACT visual style of CHILLA'''S ART and FEARS TO FATHOM indie PS1/PS2 horror games — flat restrained lighting, heavy film grain and VHS noise, a muted desaturated palette, low-resolution textures, low-poly 3D models with realistic proportions, slightly soft/blurred, a mundane found-footage indie-horror-game look; NOT voxel, NOT cube-based, NOT cinematic, NOT dramatic, NOT painterly, NOT AAA (chunky low-poly geometry, low-resolution dithered textures, affine texture warping, vertex wobble, heavy grain, dark and murky, limited detail — NOT photorealistic, NOT high-detail, NOT painterly, NOT glossy). The hero's blocky low-poly LEFT HAND is visible in the foreground, raised as if shielding. The hero stands in a ruined city street with towering alien tripod war-machines in the distance, ash falling, two ways branching. Before the left path hovers a GENTLE, benevolent 'peaceful' alien — a soft pink brain in a clean glass capsule with smooth robotic tentacle-arms, a warm reassuring glow, opening its arms in welcome. Before the right path stands a tall ~60-year-old Black survivor with a blind milky-white scarred eye, a green overshirt over a white tee, a sawn-off rifle, and a small child's backpack clipped to his belt. Smoke-grey dim light, drifting ash, a faint cold scanner beam in the distance.\n\nFRAMING — MATCH THE SECOND REFERENCE IMAGE FOR SCALE & PLACEMENT ONLY (do NOT copy its content, characters or any text): the two guides stand side by side facing the camera, FULL BODY from head to feet, LARGE and CLOSE so they fill most of the vertical frame — feet visible near the bottom, heads near the top, the ruined street and tripod receding between and behind them. This is the opening 'hook' character-select shot; characters must be big, bright and instantly readable in the very first frame. Do NOT crop legs or feet. 9:16 vertical.\n",
        "stage": "image"
      },
      {
        "slot": "hub-lowpoly",
        "text": "Generate a screenshot from a first-person horror video game with NO interface/HUD, in PURE LOW-POLY PS1/PSX graphics (smooth-shaded triangulated low-poly 3D models like real PlayStation-1 games, NOT voxel, NOT cube-based, NOT minecraft, NOT painterly) (clean low-poly triangulated geometry, low-resolution dithered textures, affine texture warping, vertex wobble, heavy grain, dark and murky, limited detail — NOT photorealistic, NOT high-detail, NOT painterly, NOT glossy). The hero's blocky low-poly LEFT HAND is visible in the foreground, raised as if shielding. The hero stands in a ruined city street with towering alien tripod war-machines in the distance, ash falling, two ways branching. Before the left path hovers a GENTLE, benevolent 'peaceful' alien — a soft pink brain in a clean glass capsule with smooth robotic tentacle-arms, a warm reassuring glow, opening its arms in welcome. Before the right path stands a tall ~60-year-old Black survivor with a blind milky-white scarred eye, a green overshirt over a white tee, a sawn-off rifle, and a small child's backpack clipped to his belt. Smoke-grey dim light, drifting ash, a faint cold scanner beam in the distance.\n\nFRAMING — MATCH THE SECOND REFERENCE IMAGE FOR SCALE & PLACEMENT ONLY (do NOT copy its content, characters or any text): the two guides stand side by side facing the camera, FULL BODY from head to feet, LARGE and CLOSE so they fill most of the vertical frame — feet visible near the bottom, heads near the top, the ruined street and tripod receding between and behind them. This is the opening 'hook' character-select shot; characters must be big, bright and instantly readable in the very first frame. Do NOT crop legs or feet. 9:16 vertical.\n",
        "stage": "image"
      },
      {
        "slot": "hub-vid",
        "text": "PS1 indie sci-fi horror game footage, first-person POV, heavy grain/VHS, low-poly, ruined ash-grey city under alien tripods, 9:16. A held choice-moment, idle, nobody commits. A towering alien tripod stomps past in the background sweeping a scanner-beam over the rubble; fires burn, ash falls. On the LEFT the 'peaceful' ALIEN — a floating pink-brain in a clean glowing capsule with smooth tentacles — glows warmly and opens its tentacle-arms in welcome; on the RIGHT the one-eyed SURVIVOR levels his sawn-off rifle, wary. LOCKED framing, both guides clearly in frame. Throughout: the tripod moves, ash drifts, fires flicker, the scanner beam sweeps — world alive, choice unmade.\n",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "i2v/hub-vid",
        "text": "PS1 indie sci-fi horror game footage, first-person POV, heavy grain/VHS, low-poly, ruined ash-grey city under alien tripods, 9:16. A held choice-moment, idle, nobody commits. A towering alien tripod stomps past in the background sweeping a scanner-beam over the rubble; fires burn, ash falls. On the LEFT the 'peaceful' ALIEN — a floating pink-brain in a clean glowing capsule with smooth tentacles — glows warmly and opens its tentacle-arms in welcome; on the RIGHT the one-eyed SURVIVOR levels his sawn-off rifle, wary. LOCKED framing, both guides clearly in frame. Throughout: the tripod moves, ash drifts, fires flicker, the scanner beam sweeps — world alive, choice unmade.\n",
        "stage": "i2v"
      },
      {
        "slot": "i2v/scene-a02-shelter-vid",
        "text": "PS1 indie sci-fi horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. POV follows the floating pink-brain ALIEN as it glides ahead toward a glowing organic bioluminescent dome shelter, its tentacles gesturing warmly, soft pink glow pulsing; the ruined city smoulders behind. Forward motion, the alien bobs gently, glow breathes, ash drifts. Calm, inviting, subtly wrong.\n",
        "stage": "i2v"
      },
      {
        "slot": "i2v/scene-a03-fork-door-vid",
        "text": "PS1 indie sci-fi horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. A held choice-moment, idle, nobody commits. POV at the glowing organic shelter door, the ALIEN beside it gesturing warmly to enter. LOCKED framing. Throughout: the door pulses with soft pink light, the alien's tentacles wave gently, bioluminescence breathes, ash drifts in from outside — world alive, choice unmade.\n",
        "stage": "i2v"
      },
      {
        "slot": "i2v/scene-a04-pen-vid",
        "text": "PS1 indie sci-fi horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. POV steps through the shelter door — and past it: rows of humans suspended in glowing organic cocoons, a horrific pen; the ALIEN still glides alongside, soothing. Forward, slow. The cocoons pulse and glow, tentacles drift, fluid drips, the dawning horror — eerie, wrong.\n",
        "stage": "i2v"
      },
      {
        "slot": "i2v/scene-a05-fork-sort-vid",
        "text": "PS1 indie sci-fi horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. A held choice-moment, idle, nobody commits. Inside the pen the ALIEN begins to gently 'sort' the rescued, its tentacles reaching toward the POV; an exit glows beyond. LOCKED framing. Throughout: tentacles wave and reach, cocoons pulse, the alien glow breathes warm — world alive, choice unmade.\n",
        "stage": "i2v"
      },
      {
        "slot": "i2v/scene-a06-branded-vid",
        "text": "PS1 indie sci-fi horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. POV is gently held by the ALIEN's tentacles and 'prepared' — washed, then marked with a glowing brand like livestock; the alien purrs reassurance, its glow warm. Slow, clinical, horrifying. The brand sears glowing, tentacles work, steam rises, fluid drips — dread.\n",
        "stage": "i2v"
      },
      {
        "slot": "i2v/scene-a07-fork-conveyor-vid",
        "text": "PS1 indie sci-fi horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. A held choice-moment, idle, nobody commits. POV is lowered on an organic conveyor toward a glowing rendering vat / a meat-hook; the last doom looms. LOCKED framing. Throughout: the conveyor creeps forward, the vat glows and churns, tentacles drift, organic machinery pulses — world alive, the doom not yet come.\n",
        "stage": "i2v"
      },
      {
        "slot": "i2v/scene-a08-bad-end-vid",
        "text": "PS1 indie sci-fi horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. A doom scene — no escape. 0-1s: the conveyor lowers the POV toward the glowing rendering vat. 1-3s: you are processed — pulled under and hooked, the lens jerking as the glow swallows everything; you were always cattle. 3-4s: everything to black. Wet machinery, a cut-off cry, silence.\n",
        "stage": "i2v"
      },
      {
        "slot": "i2v/scene-b09-run-vid",
        "text": "PS1 indie sci-fi horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. POV is yanked into the rubble by the one-eyed SURVIVOR as a tripod scanner-beam sweeps the street behind; he hauls you along, wary, rifle up. Fast forward motion, the beam sweeps, ash and fire, debris falls, the survivor moves hard ahead. Tense, urgent.\n",
        "stage": "i2v"
      },
      {
        "slot": "i2v/scene-b10-fork-cellar-vid",
        "text": "PS1 indie sci-fi horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. A held choice-moment, idle, nobody commits. POV at a split: an open cellar that looks like safe cover on one side, the exposed open yard the SURVIVOR points across on the other; a tripod looms beyond. LOCKED framing. Throughout: the scanner beam sweeps, fires flicker, ash drifts, the survivor gestures hard — world alive, choice unmade.\n",
        "stage": "i2v"
      },
      {
        "slot": "i2v/scene-b11-death-cellar-vid",
        "text": "PS1 indie sci-fi horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. A death scene — instant. 0-1s: POV ducks into the open cellar for cover. 1-3s: the tripod's scanner beam finds you and a searing white-green ray vaporizes you, flashing the lens to blinding light. 3-4s: ash and white-out collapsing to black. Scanner whine, deafening zap, silence.\n",
        "stage": "i2v"
      },
      {
        "slot": "i2v/scene-b12-across-vid",
        "text": "PS1 indie sci-fi horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. POV sprints across the exposed yard after the SURVIVOR and slams into far cover behind a broken wall as the beam rakes past, just missing. Fast sprint, the beam sweeps past, debris flies, hard breathing, the survivor ahead. Relief-tense.\n",
        "stage": "i2v"
      },
      {
        "slot": "i2v/scene-b13-fork-tunnel-vid",
        "text": "PS1 indie sci-fi horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. A held choice-moment, idle, nobody commits. Down in a metro/storm-drain: a clean wide tunnel on one side, a foul flooded narrow crawl the SURVIVOR squeezes into on the other. LOCKED framing. Throughout: water drips and ripples, dim light flickers, the survivor beckons from the crawl — world alive, choice unmade.\n",
        "stage": "i2v"
      },
      {
        "slot": "i2v/scene-b14-death-tunnel-vid",
        "text": "PS1 indie sci-fi horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. A death scene — instant. 0-1s: POV walks into the clean wide tunnel. 1-3s: reaper-drones converge out of the dark — buzzing, red-eyed — and swarm the camera, cutting it down. 3-4s: to black. Drone buzz, shriek, impact.\n",
        "stage": "i2v"
      },
      {
        "slot": "i2v/scene-b15-through-vid",
        "text": "PS1 indie sci-fi horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. POV squeezes out of the foul flooded crawl into a dark drain chamber, dripping, the SURVIVOR ahead; you made it. Blocky low-poly POV hands pulling through, water drips, tight walls, hard breathing. Relief-tense, forward.\n",
        "stage": "i2v"
      },
      {
        "slot": "i2v/scene-b16-fork-evac-vid",
        "text": "PS1 indie sci-fi horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. A held choice-moment, idle, nobody commits. Near the evac point — bright rescue lights glow in the open ahead, but a tripod stands between; the SURVIVOR holds you back in shadow, hand raised to wait. LOCKED framing. Throughout: the tripod shifts, the evac lights glow and flicker, the scanner sweeps, ash drifts — world alive, choice unmade.\n",
        "stage": "i2v"
      },
      {
        "slot": "i2v/scene-b17-death-bolt-vid",
        "text": "PS1 indie sci-fi horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. A death scene — instant. 0-1s: POV bolts for the bright evac lights across the open. 1-3s: the tripod's claw snatches down, seizing the camera and yanking it violently up into the air. 3-4s: swallowed to black. Tripod horn, metallic snatch, scream.\n",
        "stage": "i2v"
      },
      {
        "slot": "i2v/scene-b18-end-vid",
        "text": "PS1 indie sci-fi horror game footage turning calm, first-person POV, heavy grain/VHS, low-poly, 9:16. POV slips past the tripod on the SURVIVOR's signal, through the shadows and out of the ruined city; ahead the ash thins and the resistance camp lights glow under a paling dawn sky. Throughout: the survivor leads steadily, the ruined city recedes behind, ash settles, calmer light grows ahead — by the end you reach the edge of safety, out of the city, relieved. The world keeps moving, no freeze.\n",
        "stage": "i2v"
      },
      {
        "slot": "scene-a02-shelter",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted low-poly, UNIFORM low fidelity, NOT cinematic. You follow the gentle hovering brain-in-a-capsule alien across a ruined ash-grey city street toward a soft glowing organic shelter dome ahead. The ruined-city BACKGROUND must match the hub's render fidelity — coherent low-poly buildings, NOT an overly blocky/pixelated mush. IMPORTANT: blocky low-poly first-person POV HANDS clearly visible in the foreground. 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-a02-shelter-vid",
        "text": "PS1 indie sci-fi horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. POV follows the floating pink-brain ALIEN as it glides ahead toward a glowing organic bioluminescent dome shelter, its tentacles gesturing warmly, soft pink glow pulsing; the ruined city smoulders behind. Forward motion, the alien bobs gently, glow breathes, ash drifts. Calm, inviting, subtly wrong.\n",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "scene-a03-fork-door",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted low-poly, UNIFORM low fidelity, NOT cinematic. At the glowing organic shelter doorway; the benevolent alien opens its tentacle-arms warmly, inviting you in. IMPORTANT: blocky low-poly first-person POV HANDS reaching toward the doorway. 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-a03-fork-door-vid",
        "text": "PS1 indie sci-fi horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. A held choice-moment, idle, nobody commits. POV at the glowing organic shelter door, the ALIEN beside it gesturing warmly to enter. LOCKED framing. Throughout: the door pulses with soft pink light, the alien's tentacles wave gently, bioluminescence breathes, ash drifts in from outside — world alive, choice unmade.\n",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "scene-a04-pen",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted low-poly, UNIFORM low fidelity, NOT cinematic. Past the door: a horrifying pen — rows of humans suspended in glistening cocoons; the alien still hovering calmly beside you. IMPORTANT: blocky low-poly first-person POV HANDS visible at the foreground. 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-a04-pen-vid",
        "text": "PS1 indie sci-fi horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. POV steps through the shelter door — and past it: rows of humans suspended in glowing organic cocoons, a horrific pen; the ALIEN still glides alongside, soothing. Forward, slow. The cocoons pulse and glow, tentacles drift, fluid drips, the dawning horror — eerie, wrong.\n",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "scene-a05-fork-sort",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted low-poly, UNIFORM low fidelity, NOT cinematic. Inside the pen the alien gently 'sorts' captives, a tentacle guiding the POV forward along a line of cocooned humans. IMPORTANT: blocky low-poly first-person POV HANDS visible. 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-a05-fork-sort-vid",
        "text": "PS1 indie sci-fi horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. A held choice-moment, idle, nobody commits. Inside the pen the ALIEN begins to gently 'sort' the rescued, its tentacles reaching toward the POV; an exit glows beyond. LOCKED framing. Throughout: tentacles wave and reach, cocoons pulse, the alien glow breathes warm — world alive, choice unmade.\n",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "scene-a06-branded",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted low-poly, UNIFORM low fidelity, NOT cinematic. The POV is hosed down and a glowing brand is pressed onto the forearm like livestock; the alien purrs reassurance. IMPORTANT: blocky low-poly first-person POV HAND/forearm clearly visible being branded. 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-a06-branded-vid",
        "text": "PS1 indie sci-fi horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. POV is gently held by the ALIEN's tentacles and 'prepared' — washed, then marked with a glowing brand like livestock; the alien purrs reassurance, its glow warm. Slow, clinical, horrifying. The brand sears glowing, tentacles work, steam rises, fluid drips — dread.\n",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "scene-a07-fork-conveyor",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted low-poly, UNIFORM low fidelity, NOT cinematic. The POV is laid onto a slow conveyor moving toward a rendering vat and meat-hooks; the alien hovers overhead, indifferent. IMPORTANT: blocky low-poly first-person POV HANDS gripping the conveyor edge. 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-a07-fork-conveyor-vid",
        "text": "PS1 indie sci-fi horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. A held choice-moment, idle, nobody commits. POV is lowered on an organic conveyor toward a glowing rendering vat / a meat-hook; the last doom looms. LOCKED framing. Throughout: the conveyor creeps forward, the vat glows and churns, tentacles drift, organic machinery pulses — world alive, the doom not yet come.\n",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "scene-a08-bad-end",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted low-poly, UNIFORM low fidelity, NOT cinematic. The grim end: the conveyor tips the POV down into a churning rendering vat / a carcass-hook line, darkness closing — you were livestock all along. IMPORTANT: blocky low-poly first-person POV HANDS reaching up uselessly as you go under. 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-a08-bad-end-vid",
        "text": "PS1 indie sci-fi horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. A doom scene — no escape. 0-1s: the conveyor lowers the POV toward the glowing rendering vat. 1-3s: you are processed — pulled under and hooked, the lens jerking as the glow swallows everything; you were always cattle. 3-4s: everything to black. Wet machinery, a cut-off cry, silence.\n",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "scene-b09-run",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted low-poly, UNIFORM low fidelity (survivor same flat fidelity as scene), NOT cinematic. The grizzled one-eyed Black survivor runs ahead and waves you into the rubble of a ruined city street as a towering tripod's scanner beam rakes across behind. IMPORTANT: blocky low-poly first-person POV HANDS swinging as you run (hands free). 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-b09-run-vid",
        "text": "PS1 indie sci-fi horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. POV is yanked into the rubble by the one-eyed SURVIVOR as a tripod scanner-beam sweeps the street behind; he hauls you along, wary, rifle up. Fast forward motion, the beam sweeps, ash and fire, debris falls, the survivor moves hard ahead. Tense, urgent.\n",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "scene-b10-fork-cellar",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted low-poly, UNIFORM low fidelity, NOT cinematic. A choice: an open cellar hole nearby that looks like cover, versus an exposed rubble yard the survivor is sprinting across. IMPORTANT: blocky low-poly first-person POV HANDS visible in the foreground. 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-b10-fork-cellar-vid",
        "text": "PS1 indie sci-fi horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. A held choice-moment, idle, nobody commits. POV at a split: an open cellar that looks like safe cover on one side, the exposed open yard the SURVIVOR points across on the other; a tripod looms beyond. LOCKED framing. Throughout: the scanner beam sweeps, fires flicker, ash drifts, the survivor gestures hard — world alive, choice unmade.\n",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "scene-b11-death-cellar",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted low-poly, UNIFORM low fidelity, NOT cinematic. You hid in the open cellar — the tripod's scanner beam finds you and a blinding flash vaporizes the POV into ash. IMPORTANT: blocky low-poly first-person POV HANDS up against the searing beam. 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-b11-death-cellar-vid",
        "text": "PS1 indie sci-fi horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. A death scene — instant. 0-1s: POV ducks into the open cellar for cover. 1-3s: the tripod's scanner beam finds you and a searing white-green ray vaporizes you, flashing the lens to blinding light. 3-4s: ash and white-out collapsing to black. Scanner whine, deafening zap, silence.\n",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "scene-b12-across",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted low-poly, UNIFORM low fidelity, NOT cinematic. You sprinted the exposed yard after the survivor and reach the far cover behind a wrecked wall, breathing hard. IMPORTANT: blocky low-poly first-person POV HANDS bracing on the broken wall. 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-b12-across-vid",
        "text": "PS1 indie sci-fi horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. POV sprints across the exposed yard after the SURVIVOR and slams into far cover behind a broken wall as the beam rakes past, just missing. Fast sprint, the beam sweeps past, debris flies, hard breathing, the survivor ahead. Relief-tense.\n",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "scene-b13-fork-tunnel",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted low-poly, UNIFORM low fidelity, NOT cinematic. Down in a metro/storm-drain, a clear CHOICE of two distinct visible options: on the LEFT a clean wide dry tunnel; on the RIGHT a flooded narrow crawl the one-eyed survivor is squeezing into, waving you after him. Dynamic, readable composition. IMPORTANT: blocky low-poly first-person POV HANDS clearly visible in the foreground. 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-b13-fork-tunnel-vid",
        "text": "PS1 indie sci-fi horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. A held choice-moment, idle, nobody commits. Down in a metro/storm-drain: a clean wide tunnel on one side, a foul flooded narrow crawl the SURVIVOR squeezes into on the other. LOCKED framing. Throughout: water drips and ripples, dim light flickers, the survivor beckons from the crawl — world alive, choice unmade.\n",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "scene-b14-death-tunnel",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted low-poly, UNIFORM low fidelity, NOT cinematic. You took the clean wide tunnel — a patrol of alien reaper-drones swarms in, lights blazing, converging on the POV. IMPORTANT: blocky low-poly first-person POV HANDS up against the drones. 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-b14-death-tunnel-vid",
        "text": "PS1 indie sci-fi horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. A death scene — instant. 0-1s: POV walks into the clean wide tunnel. 1-3s: reaper-drones converge out of the dark — buzzing, red-eyed — and swarm the camera, cutting it down. 3-4s: to black. Drone buzz, shriek, impact.\n",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "scene-b15-through",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted low-poly, UNIFORM low fidelity, NOT cinematic. You squeeze out of the flooded narrow crawl into a dripping chamber behind the survivor, soaked but safe. IMPORTANT: blocky low-poly first-person POV HANDS pulling you out of the crawl. 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-b15-through-vid",
        "text": "PS1 indie sci-fi horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. POV squeezes out of the foul flooded crawl into a dark drain chamber, dripping, the SURVIVOR ahead; you made it. Blocky low-poly POV hands pulling through, water drips, tight walls, hard breathing. Relief-tense, forward.\n",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "scene-b16-fork-evac",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted low-poly, UNIFORM low fidelity, NOT cinematic. An evac point glows ahead but a towering tripod stands in the way; the survivor crouches in shadow, hand raised to signal WAIT. IMPORTANT: blocky low-poly first-person POV HANDS low in the foreground, holding still. 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-b16-fork-evac-vid",
        "text": "PS1 indie sci-fi horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. A held choice-moment, idle, nobody commits. Near the evac point — bright rescue lights glow in the open ahead, but a tripod stands between; the SURVIVOR holds you back in shadow, hand raised to wait. LOCKED framing. Throughout: the tripod shifts, the evac lights glow and flicker, the scanner sweeps, ash drifts — world alive, choice unmade.\n",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "scene-b17-death-bolt",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted low-poly, UNIFORM low fidelity, NOT cinematic. You bolted for the evac lights in the open — the tripod's claw-tentacle snatches the POV up off the ground into the air. IMPORTANT: blocky low-poly first-person POV HANDS flailing as the claw lifts you. 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-b17-death-bolt-vid",
        "text": "PS1 indie sci-fi horror game footage, first-person POV, heavy grain/VHS, low-poly, 9:16. A death scene — instant. 0-1s: POV bolts for the bright evac lights across the open. 1-3s: the tripod's claw snatches down, seizing the camera and yanking it violently up into the air. 3-4s: swallowed to black. Tripod horn, metallic snatch, scream.\n",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      },
      {
        "slot": "scene-b18-end",
        "text": "Chilla's Art / Fears to Fathom style indie PS1/PS2 horror game screenshot, first-person POV, NO UI, flat grainy muted low-poly, UNIFORM low fidelity, NOT cinematic. You slip out to the city's edge at first dawn — open misty fields and a distant safe ridge ahead; NO alien tripod anywhere nearby. One or two ragged resistance fighters wave you in from cover, well away from any war-machine. Hopeful, dynamic, a sense of escape. IMPORTANT: blocky low-poly first-person POV HANDS reaching forward toward safety, the one-eyed survivor beside you. 9:16 vertical.",
        "model": "openai/gpt-5.4-image-2",
        "stage": "image"
      },
      {
        "slot": "scene-b18-end-vid",
        "text": "PS1 indie sci-fi horror game footage turning calm, first-person POV, heavy grain/VHS, low-poly, 9:16. POV slips past the tripod on the SURVIVOR's signal, through the shadows and out of the ruined city; ahead the ash thins and the resistance camp lights glow under a paling dawn sky. Throughout: the survivor leads steadily, the ruined city recedes behind, ash settles, calmer light grows ahead — by the end you reach the edge of safety, out of the city, relieved. The world keeps moving, no freeze.\n",
        "model": "bytedance/seedance-2.0",
        "stage": "i2v"
      }
    ],
    "recipes": [
      {
        "kind": "bake",
        "name": "ffmpeg-xfade-master"
      },
      {
        "kind": "overlay",
        "name": "vhs-pause-freeze"
      },
      {
        "kind": "overlay",
        "name": "smpte-countdown-disc"
      },
      {
        "kind": "ffmpeg",
        "name": "old-radio-ps1-vo"
      },
      {
        "kind": "overlay",
        "name": "chroma-split"
      },
      {
        "kind": "encode",
        "name": "film-grain"
      },
      {
        "kind": "overlay",
        "name": "burned-captions"
      },
      {
        "kind": "overlay",
        "name": "voxel-dither"
      },
      {
        "kind": "ffmpeg",
        "name": "boomerang-motion-fill"
      }
    ],
    "scenario": {
      "scenes": [
        {
          "id": "hub-vid",
          "durationSec": 4
        },
        {
          "id": "scene-a02-shelter-vid",
          "durationSec": 4
        },
        {
          "id": "scene-a03-fork-door-vid",
          "durationSec": 4
        },
        {
          "id": "scene-a04-pen-vid",
          "durationSec": 4
        },
        {
          "id": "scene-a05-fork-sort-vid",
          "durationSec": 4
        },
        {
          "id": "scene-a06-branded-vid",
          "durationSec": 4
        },
        {
          "id": "scene-a07-fork-conveyor-vid",
          "durationSec": 4
        },
        {
          "id": "scene-a08-bad-end-vid",
          "durationSec": 4
        },
        {
          "id": "scene-b09-run-vid",
          "durationSec": 4
        },
        {
          "id": "scene-b10-fork-cellar-vid",
          "durationSec": 4
        },
        {
          "id": "scene-b11-death-cellar-vid",
          "durationSec": 4
        },
        {
          "id": "scene-b12-across-vid",
          "durationSec": 4
        },
        {
          "id": "scene-b13-fork-tunnel-vid",
          "durationSec": 4
        },
        {
          "id": "scene-b14-death-tunnel-vid",
          "durationSec": 4
        },
        {
          "id": "scene-b15-through-vid",
          "durationSec": 4
        },
        {
          "id": "scene-b16-fork-evac-vid",
          "durationSec": 4
        },
        {
          "id": "scene-b17-death-bolt-vid",
          "durationSec": 4
        },
        {
          "id": "scene-b18-end-vid",
          "durationSec": 6
        },
        {
          "id": "scene-a02-shelter"
        },
        {
          "id": "scene-b13-fork-tunnel"
        },
        {
          "id": "scene-b18-end"
        },
        {
          "id": "scene-a02-shelter"
        },
        {
          "id": "scene-a03-fork-door"
        },
        {
          "id": "scene-a04-pen"
        },
        {
          "id": "scene-a05-fork-sort"
        },
        {
          "id": "scene-a06-branded"
        },
        {
          "id": "scene-a07-fork-conveyor"
        },
        {
          "id": "scene-a08-bad-end"
        },
        {
          "id": "scene-b09-run"
        },
        {
          "id": "scene-b10-fork-cellar"
        },
        {
          "id": "scene-b11-death-cellar"
        },
        {
          "id": "scene-b12-across"
        },
        {
          "id": "scene-b13-fork-tunnel"
        },
        {
          "id": "scene-b14-death-tunnel"
        },
        {
          "id": "scene-b15-through"
        },
        {
          "id": "scene-b16-fork-evac"
        },
        {
          "id": "scene-b17-death-bolt"
        },
        {
          "id": "scene-b18-end"
        }
      ],
      "storyboardMd": "# Choose Your Path — War of the Worlds (Peaceful Alien vs Survivor)\n\n**Project:** choose-warofworlds-001 · 9:16 · TikTok · ~70s · EN VO + word-level captions\n**Template:** analog-horror-pick-a-door (branching mechanic) · **Style override:** voxel / PS1 sci-fi horror render\n**Format origin:** choose-path-001 (validated). Reuses: two-guide hub → binary 50/50 forks (play→freeze→SMPTE timer→consequence) → branch payoff; voxel/PS1 register; vhs-pause-freeze + ffmpeg-xfade-master + old-radio-ps1-vo recipes; clone voice `NYIQTs8oBhYvzMr6zHTL`.\n\n## AESTHETIC LOCK (prepend to EVERY image prompt)\n> Chilla's Art / Fears to Fathom indie PS1-horror style (flat restrained lighting, heavy film grain/VHS, muted desaturated palette, low-res textures, low-poly with realistic proportions; style-ref workspace/references/ftf-chillas-style/; NOT voxel-cube, NOT cinematic, NOT painterly) — **sci-fi horror** render, PS1 / early-3D affine-warped pixel textures, chunky low-poly geometry, dithered grainy textures, first-person POV with a blocky low-poly hand, a **ruined city under towering alien tripod war-machines** — collapsed concrete, fires, falling ash, sweeping scanner-light beams, sickly green/red invasion glow against smoke-grey dark, heavy vignette, faint pixel/VHS grain. The alien \"shelter\" interior is eerily **clean, bioluminescent, organic** (contrast to the ruins). NOT photoreal, NOT smooth modern CGI, NOT cartoon-cute. 9:16 vertical.\n\nLock a **hub-master** anchor first (a ruined street with a tripod + both guides), then pass it as `--ref` on every gen. Aliens/tripods are GENERIC (H.G. Wells trope, no specific IP / no real person → reference-gate does not fire).\n\n## CAST (to lock as char masters)\n- **THE \"PEACEFUL\" ALIEN** — **a floating brain / soft pink-jelly mass in a clean transparent capsule, with smooth robotic tentacles**, hovering on a soft warm glow. **Reference vibe: Mister Handy (Fallout) but futuristic** and unmistakably alien. **Must read GENTLE, BENEVOLENT and INVITING** — warm reassuring pink glow, tentacle-arms opening in welcome, a calm almost-angelic presence you would *want* to trust (so the betrayal lands and there's a real reason to pick it over the grim survivor). No face; soothes through a gentle synth voice. **The welcoming guide is a lie** — its whole branch is a trap.\n- **THE SURVIVOR** — a **big man, ~190 cm, ~60 years old, Black, grey hair, stubble**; **one blind (milky-white) eye crossed by a scar**. Plain clothes: a **green overshirt over a white tee, work trousers and boots**. A sawn-off / scavenged rifle, paranoid and abrasive (\"don't trust that thing\"). Ugly-honest and harsh — the only way out. **Uniquifier (proposed default):** a small **child's faded backpack clipped to his belt** — someone he couldn't save; it's a silent emotional tag and a clean silhouette ID. *(Alternatives if you prefer: a hand-crank radio on his shoulder, a tally of scratched kill-marks up one forearm, or a homemade spear-bayonet lashed to the rifle. Tell me which.)*\n\n## MECHANIC\nOpen COLD on the ruined street. Idle loop + \"CHOOSE YOUR GUIDE\" + 3s film-leader countdown → commit. **Asymmetric by design:**\n- **Branch A (the alien) is a TOTAL TRAP** — every fork *looks* like a choice but both outcomes converge; agency is an illusion. The branch has **no good ending**. The gut-punch is the dawning realization that you were livestock from frame one. (This is the deliberate exception to the batch's \"both branches survivable\" rule — here the telegraph IS the gag. See [[feedback_choose_path_no_telegraph_guide]].)\n- **Branch B (the survivor) is the real, survivable gauntlet** — standard 3-fork chain, \"the soft/easy/comforting option = death, the ugly/scary one = life.\"\n\n**TikTok one-shot watch — not interactive.** Choices + consequences play out linearly; punchy fast cuts, ~2s death/doom beats. Whole gauntlet seen in one pass.\n\n---\n\n## CHOICE FLOW\n\n**HUB** — Ruined city, a tripod stomping past, scanner beams raking the rubble. The \"PEACEFUL\" ALIEN (left) glows softly, offers its hand, promises a shelter. The SURVIVOR (right) levels a sawn-off: \"don't trust that thing.\" 3-2-1 → pick a guide.\n\n### Branch A — went with THE \"PEACEFUL\" ALIEN · ⚠ TOTAL TRAP · *there was never a choice — you're livestock*\nEvery fork looks like a decision; both outcomes converge. The snare only tightens.\n- **A1** — It leads you to a glowing \"shelter for the rescued.\" Enter now, or ask to find your family first.\n  - **A11 · ENTER THE SHELTER** → past the door: a pen, humans in cocoons. **Outcome: deeper into the trap.**\n  - **A12 · \"FIND MY FAMILY FIRST\"** → \"of course\" — it leads you to the same pen; your family already cocooned. **Outcome: deeper into the trap.** *(both → the pen)*\n- **A2** — Inside, it gently \"sorts\" the rescued. Stay compliant, or bolt for the exit.\n  - **A21 · STAY COMPLIANT** → you're tenderly \"prepared\": washed, branded like cattle. **Outcome: deeper into the trap.**\n  - **A22 · BOLT** → caught, dragged back, branded anyway. **Outcome: deeper into the trap.** *(both → branded)*\n- **A3 · THE RECKONING (no good ending)** — you're lowered onto a conveyor: a rendering vat / a carcass on a hook. The last \"choice\" is only *how*: `ACCEPT YOUR FATE` / `SCREAM` — both → processed. **Outcome: ☠ you were a pig for slaughter from the very first frame.**\n\n### Branch B — went with THE SURVIVOR · real, survivable · *the soft \"rescue\" kills, the ugly truth saves*\n- **B1** — The survivor hauls you into the rubble; a tripod rakes the street with a scanner beam. Hole up in an open cellar (looks like cover), or sprint the exposed yard after him.\n  - **B11 · OPEN CELLAR** (looks safe). The beam finds you, vaporizes you. **Outcome: death.**\n  - **B12 · SPRINT THE YARD** (terrifying). **Outcome: continue.**\n- **B2** — Down into the metro/storm-drain. A clean wide tunnel, or the flooded narrow crawl he squeezes into.\n  - **B21 · CLEAN TUNNEL** (easy). A reaper-drone patrol. **Outcome: death.**\n  - **B22 · FLOODED CRAWL** (foul, tight). **Outcome: continue.**\n- **B3** — The evac point, but a tripod stands in the way. Bolt for the lights in the open, or wait in shadow for his signal.\n  - **B31 · BOLT FOR THE LIGHTS** (panic toward \"rescue\"). The tripod snatches you. **Outcome: death.**\n  - **B32 · WAIT FOR HIS SIGNAL** (hold your nerve, terrifying). You slip past to the resistance outside the city. **Outcome: ★ survived.**\n\n---\n\n## SCENE LIST (production beats — ~17 beats × 2-4s ≈ 70s)\n\n### SHARED\n- **S01 · HUB / CHOOSE YOUR GUIDE** — ruined street, tripod, scanner beams. Floating labels `ALIEN` (L) / `SURVIVOR` (R). \"CHOOSE YOUR GUIDE\" + 3-2-1 → \"YOU CHOSE: …\".\n\n### BRANCH A — ALIEN (total trap)\n- **A02 · TO THE \"SHELTER\"** — the alien glides ahead toward a glowing organic dome, gesturing warmly.\n- **A03 · FORK 1** — the shelter door. Labels `ENTER NOW` / `FIND MY FAMILY`. 3-2-1. *(both → A04)*\n- **A04 · THE PEN** — past the door: rows of humans suspended in cocoons. The alien still soothing.\n- **A05 · FORK 2** — it begins to \"sort\" you. Labels `STAY COMPLIANT` / `BOLT`. 3-2-1. *(both → A06)*\n- **A06 · BRANDED** — washed, marked with a glowing brand like livestock; the alien purrs reassurance.\n- **A07 · THE CONVEYOR · FORK 3** — lowered toward a rendering vat / meat-hook. Labels `ACCEPT` / `SCREAM`. 3-2-1. *(both → A08)*\n- **A08 · ☠ BAD ENDING** — processed into fertilizer / hung as a carcass. Smash to a \"YOU WERE ALWAYS CATTLE\" beat. NO SURVIVE.\n\n### BRANCH B — SURVIVOR (survivable)\n- **B09 · RUN WITH THE SURVIVOR** — he yanks you into the rubble, tripod scanner sweeping behind.\n- **B10 · FORK 1** — open cellar vs the exposed yard. Labels `OPEN CELLAR` / `SPRINT THE YARD`. 3-2-1.\n- **B11 · DEATH — OPEN CELLAR** — the beam finds you; you flash to ash. Hard cut.\n- **B12 · ACROSS (right)** — you make the far cover.\n- **B13 · FORK 2** — clean wide tunnel vs the flooded crawl. Labels `CLEAN TUNNEL` / `FLOODED CRAWL`. 3-2-1.\n- **B14 · DEATH — CLEAN TUNNEL** — reaper drones converge. Hard cut.\n- **B15 · THROUGH (right)** — you squeeze out of the crawl.\n- **B16 · FORK 3** — bolt for the evac lights vs wait for his signal. Labels `BOLT` / `WAIT`. 3-2-1.\n- **B17 · DEATH — BOLT** — the tripod's claw snatches you. Hard cut.\n- **B18 · GOOD ENDING (Survivor)** — you slip past on his signal, out of the city to the resistance. SURVIVED.\n\n---\n\n## VO (EN, eerie low narrator — retimed at compose)\n- Hub: \"Two guides in the ash. One offers you shelter. One offers you nothing. You've got three seconds.\"\n- A (alien): \"It's so gentle. It only wants to help you.\" → turn cold: \"…you were always cattle. There was never a way out.\"\n- B (survivor): \"He doesn't trust anything. Neither should you. Every door that looks safe is a grave.\"\n- Endings: \"You made it out of the city.\" / CTA: \"Did you trust the kind one? Be honest — tell me below.\"\n\n## STACK\n- Image anchors: `openai/gpt-5.4-image-2` --size 1080x1920 (9:16), --ref hub-master (+ ALIEN / SURVIVOR char masters). Fire in parallel (no cap).\n- i2v: `bytedance/seedance-2.0` (stylized → passes privacy filter; tripod stomp, scanner sweep, cocoon pen, conveyor, sprint/crawl). ~4s clips.\n- VO: reuse clone `NYIQTs8oBhYvzMr6zHTL`, old-radio/PS1 filter. Music: dread invasion drone (ElevenLabs Music, no artist names). SFX: tripod horn/stomp, scanner whine, alien purr, drone buzz, sawn-off rack, soft countdown beeps.\n- Captions: word-level white-bold bottom-center, fed from VO; snap to Scribe word `startMs`.\n- Compose: HyperFrames, ONE opacity-gated composition; transitions + play-then-freeze baked into the master via ffmpeg (xfade + tpad); SMPTE countdown disc + floating labels + DEATH flash; overlays clear BEFORE the dissolve.\n\n## NOTES\n- Branch A is a deliberate dead-end (no ★) — the bleakness IS the payoff. Branch B is the only survivable path. This is the batch's sanctioned exception to \"both branches survivable.\"\n- Aliens/tripods generic (no IP, no real person) → reference-gate does not fire.\n- Generate order: hub-master → ALIEN + SURVIVOR char masters → Branch A anchors → Branch B anchors. Gate per checkpoint, wait for \"go\" before paid gen.\n"
    },
    "createdAt": "2026-06-04T03:20:17.173Z",
    "modelStack": [
      {
        "model": "bytedance/seedance-2.0",
        "stage": "i2v",
        "params": {
          "resolution": "720p",
          "aspect_ratio": "9:16",
          "duration_sec": 4
        },
        "costUsd": 10.36
      },
      {
        "model": "openai/gpt-5.4-image-2",
        "stage": "image",
        "params": {
          "size": "1080x1920"
        },
        "costUsd": 6
      },
      {
        "model": "hyperframes-render",
        "stage": "video"
      }
    ],
    "composition": {
      "file": "index.html",
      "html": "<!doctype html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\" />\n<style>\n  @font-face { font-family: 'Pixelify'; src: url('assets/fonts/PixelifySans-VF.ttf') format('truetype'); font-weight: 400 700; font-style: normal; font-display: block; }\n  * { margin: 0; padding: 0; box-sizing: border-box; }\n  html, body { width: 1080px; height: 1920px; background: #000; overflow: hidden; }\n  #root { position: relative; width: 1080px; height: 1920px; background: #000; font-family: 'Pixelify', 'Courier New', monospace; }\n  .vid { position: absolute; inset: 0; width: 1080px; height: 1920px; object-fit: cover; display: block; z-index: 1; }\n  #vhs { position: absolute; inset: 0; z-index: 38; pointer-events: none; opacity: 0; }\n  #vcr { position: absolute; inset: 0; width: 100%; height: 100%; image-rendering: pixelated; opacity: 0.45; }\n  #vhs .scan { position: absolute; inset: 0; background: linear-gradient(rgba(0,0,0,0) 50%, rgba(0,0,0,0.32) 50%), linear-gradient(90deg, rgba(255,0,0,0.05), rgba(0,255,0,0.02), rgba(0,0,255,0.05)); background-size: 100% 3px, 4px 100%; }\n  #vhs .tint { position: absolute; inset: 0; background: rgba(40,40,40,0.10); }\n  #vhs .pause { position: absolute; top: 54px; left: 60px; font-size: 46px; letter-spacing: 5px; color: #eef0f0; text-shadow: 0 0 12px rgba(0,0,0,0.95), 0 3px 8px #000; }\n  #vhs .pause b { letter-spacing: 0; margin-right: 14px; }\n  .grain { position: absolute; inset: 0; z-index: 40; pointer-events: none; background: repeating-linear-gradient(to bottom, rgba(0,0,0,0) 0 2px, rgba(0,0,0,0.20) 2px 3px); mix-blend-mode: multiply; opacity: 0.5; }\n  .vignette { position: absolute; inset: 0; z-index: 41; pointer-events: none; background: radial-gradient(118% 88% at 50% 46%, rgba(0,0,0,0) 50%, rgba(0,0,0,0.64) 100%); }\n  #title { position: absolute; z-index: 30; left: 0; right: 0; top: 130px; text-align: center; font-size: 74px; letter-spacing: 6px; color: #d8f0f0; opacity: 0; text-shadow: 0 0 24px rgba(0,0,0,0.95), 0 0 30px rgba(80,200,200,0.4), 0 4px 10px rgba(0,0,0,0.95); }\n  .name { position: absolute; z-index: 31; font-size: 64px; opacity: 0; text-shadow: 0 0 16px rgba(0,0,0,0.98), 0 3px 8px #000; }\n  #name-l { left: 60px; top: 470px; text-align: left; color: #7ee0e0; text-shadow: 0 0 16px rgba(0,0,0,0.98), 0 3px 8px #000, 0 0 30px rgba(126,224,224,0.55); }\n  #name-r { right: 70px; top: 720px; text-align: right; color: #ffb060; text-shadow: 0 0 16px rgba(0,0,0,0.98), 0 3px 8px #000, 0 0 30px rgba(255,176,96,0.5); }\n  #countdown { position: absolute; z-index: 45; left: 50%; top: 63%; transform: translate(-50%,-50%); width: 360px; height: 360px; opacity: 0; }\n  #countdown svg { position: absolute; inset: 0; width: 100%; height: 100%; }\n  #cd-num { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 230px; color: #eef0f0; text-shadow: 0 0 28px rgba(0,0,0,0.95); line-height: 1; }\n  .cd-ring { fill: none; stroke: rgba(216,240,240,0.30); stroke-width: 7; }\n  .cd-sweep { fill: none; stroke: #d8f0f0; stroke-width: 11; transform: rotate(-90deg); transform-origin: 50% 50%; }\n  .cd-cross { stroke: rgba(216,240,240,0.45); stroke-width: 4; }\n  #cd-plate { position: absolute; z-index: 44; left: 50%; top: 63%; transform: translate(-50%,-50%); width: 390px; height: 390px; background: rgba(14,18,18,0.5); opacity: 0; }\n  .fork { position: absolute; z-index: 43; top: 38%; max-width: 470px; font-size: 58px; line-height: 1.05; color: #eef0f0; opacity: 0; text-shadow: 0 0 16px rgba(0,0,0,0.95), 0 3px 8px #000; }\n  #fork-l { left: 56px; text-align: left; }\n  #fork-r { right: 56px; text-align: right; }\n  #death-wash { position: absolute; inset: 0; z-index: 46; pointer-events: none; opacity: 0; background: radial-gradient(120% 90% at 50% 45%, rgba(150,0,0,0.65) 0%, rgba(40,0,0,0.92) 100%); }\n  #death { position: absolute; z-index: 47; left: 0; right: 0; top: 41%; text-align: center; font-size: 200px; letter-spacing: 8px; color: #ff2a2a; opacity: 0; line-height: 0.9; text-shadow: 7px 0 0 rgba(255,0,46,0.55), -7px 0 0 rgba(0,200,255,0.45), 0 0 40px rgba(255,40,40,0.7), 0 6px 16px rgba(0,0,0,0.95); }\n  #flash { position: absolute; inset: 0; z-index: 48; background: #fff; opacity: 0; pointer-events: none; }\n  .cap { position: absolute; z-index: 35; left: 70px; right: 70px; bottom: 300px; text-align: center; font-family: 'Pixelify', monospace; font-size: 58px; line-height: 1.25; letter-spacing: 1px; opacity: 0; text-shadow: 0 4px 22px rgba(0,0,0,0.98), 0 2px 6px rgba(0,0,0,1); white-space: pre-line; }\n  #cap { color: #fff; }\n  #cap-alien { color: #7ee0e0; text-shadow: 0 4px 22px rgba(0,0,0,0.98), 0 2px 6px rgba(0,0,0,1), 0 0 24px rgba(126,224,224,0.55); }\n  #cta { position: absolute; z-index: 36; left: 60px; right: 60px; top: 38%; text-align: center; font-size: 72px; line-height: 1.16; color: #d8f0f0; opacity: 0; text-shadow: 0 0 24px rgba(0,0,0,0.95), 0 0 36px rgba(80,200,200,0.45), 0 4px 10px #000; }\n</style>\n</head>\n<body>\n<div id=\"root\" data-composition-id=\"choose-warofworlds-001\" data-width=\"1080\" data-height=\"1920\" data-start=\"0\" data-duration=\"84.50\">\n  <video id=\"master\" class=\"vid clip\" data-start=\"0\" data-duration=\"84.50\" data-media-start=\"0\" data-track-index=\"0\" src=\"assets/master.mp4\" muted playsinline crossorigin=\"anonymous\"></video>\n  <div id=\"vhs\"><canvas id=\"vcr\"></canvas><div class=\"tint\"></div><div class=\"scan\"></div><div class=\"pause\"><b>&#10073;&#10073;</b>PAUSE</div></div>\n  <div id=\"title\">CHOOSE YOUR GUIDE</div>\n  <div class=\"name\" id=\"name-l\">ALIEN</div>\n  <div class=\"name\" id=\"name-r\">SURVIVOR</div>\n  <div class=\"fork\" id=\"fork-l\"></div>\n  <div class=\"fork\" id=\"fork-r\"></div>\n  <div id=\"cd-plate\"></div>\n  <div id=\"countdown\"><svg viewBox=\"0 0 460 460\"><circle class=\"cd-ring\" cx=\"230\" cy=\"230\" r=\"210\"></circle><circle class=\"cd-sweep\" id=\"cd-sweep\" cx=\"230\" cy=\"230\" r=\"210\"></circle><line class=\"cd-cross\" x1=\"230\" y1=\"6\" x2=\"230\" y2=\"454\"></line><line class=\"cd-cross\" x1=\"6\" y1=\"230\" x2=\"454\" y2=\"230\"></line></svg><div id=\"cd-num\">3</div></div>\n  <div id=\"death-wash\"></div>\n  <div id=\"death\">DEAD</div>\n  <div class=\"cap\" id=\"cap\"></div>\n  <div class=\"cap\" id=\"cap-alien\"></div>\n  <div id=\"cta\">DID YOU TRUST<br>THE KIND ONE?</div>\n  <div class=\"grain\"></div>\n  <div class=\"vignette\"></div>\n  <div id=\"flash\"></div>\n\n  <audio id=\"bgm\" class=\"clip\" src=\"assets/music/soundtrack-bed.mp3\" data-start=\"0\" data-duration=\"84.50\" data-media-start=\"0\" data-track-index=\"9\" data-volume=\"0.22\"></audio>\n\n  <audio id=\"vo-hub\"  class=\"clip\" src=\"assets/voiceover/wn-hub.mp3\"   data-start=\"0.30\"  data-duration=\"4.83\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-ahub\" class=\"clip\" src=\"assets/voiceover/alien-hub.mp3\" data-start=\"6.70\" data-duration=\"1.28\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-a02\"  class=\"clip\" src=\"assets/voiceover/wn-a02.mp3\"   data-start=\"8.10\"  data-duration=\"1.41\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-a03\"  class=\"clip\" src=\"assets/voiceover/alien-a03.mp3\" data-start=\"10.10\" data-duration=\"1.83\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-a04\"  class=\"clip\" src=\"assets/voiceover/wn-a04.mp3\"   data-start=\"15.95\" data-duration=\"3.29\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-a05\"  class=\"clip\" src=\"assets/voiceover/alien-a05.mp3\" data-start=\"19.40\" data-duration=\"1.28\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-a06\"  class=\"clip\" src=\"assets/voiceover/wn-a06.mp3\"   data-start=\"25.20\" data-duration=\"2.85\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-a07\"  class=\"clip\" src=\"assets/voiceover/alien-a07.mp3\" data-start=\"28.60\" data-duration=\"1.93\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-a08\"  class=\"clip\" src=\"assets/voiceover/wn-a08.mp3\"   data-start=\"34.50\" data-duration=\"2.56\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-b09\"  class=\"clip\" src=\"assets/voiceover/wn-b09.mp3\"   data-start=\"37.90\" data-duration=\"2.17\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-b10\" class=\"clip\" src=\"assets/voiceover/wn-b10.mp3\" data-start=\"41.30\" data-duration=\"2.25\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-b11\"  class=\"clip\" src=\"assets/voiceover/wn-b11.mp3\"   data-start=\"47.10\" data-duration=\"2.27\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-b12\"  class=\"clip\" src=\"assets/voiceover/wn-b12.mp3\"   data-start=\"50.50\" data-duration=\"2.19\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-b13\" class=\"clip\" src=\"assets/voiceover/wn-b13.mp3\" data-start=\"54.00\" data-duration=\"1.75\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-b14\"  class=\"clip\" src=\"assets/voiceover/wn-b14.mp3\"   data-start=\"59.75\" data-duration=\"1.57\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-b15\"  class=\"clip\" src=\"assets/voiceover/wn-b15.mp3\"   data-start=\"62.20\" data-duration=\"1.78\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-b16\" class=\"clip\" src=\"assets/voiceover/wn-b16.mp3\" data-start=\"66.70\" data-duration=\"1.75\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-b17\"  class=\"clip\" src=\"assets/voiceover/wn-b17.mp3\"   data-start=\"72.35\" data-duration=\"2.12\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-b18\"  class=\"clip\" src=\"assets/voiceover/wn-b18.mp3\"   data-start=\"75.80\" data-duration=\"4.05\" data-track-index=\"10\" data-volume=\"1\"></audio>\n  <audio id=\"vo-cta\"  class=\"clip\" src=\"assets/voiceover/wn-cta.mp3\"   data-start=\"80.00\" data-duration=\"2.77\" data-track-index=\"10\" data-volume=\"1\"></audio>\n\n  <audio id=\"bp00\" class=\"clip\" src=\"assets/sfx/beep-soft.mp3\"       data-start=\"14.03\" data-duration=\"0.16\" data-track-index=\"11\" data-volume=\"1\"></audio>\n  <audio id=\"bp01\" class=\"clip\" src=\"assets/sfx/beep-soft.mp3\"       data-start=\"14.53\" data-duration=\"0.16\" data-track-index=\"11\" data-volume=\"1\"></audio>\n  <audio id=\"bp02\" class=\"clip\" src=\"assets/sfx/beep-soft-final.mp3\" data-start=\"15.03\" data-duration=\"0.30\" data-track-index=\"11\" data-volume=\"1\"></audio>\n  <audio id=\"bp03\" class=\"clip\" src=\"assets/sfx/beep-soft.mp3\"       data-start=\"23.28\" data-duration=\"0.16\" data-track-index=\"11\" data-volume=\"1\"></audio>\n  <audio id=\"bp04\" class=\"clip\" src=\"assets/sfx/beep-soft.mp3\"       data-start=\"23.78\" data-duration=\"0.16\" data-track-index=\"11\" data-volume=\"1\"></audio>\n  <audio id=\"bp05\" class=\"clip\" src=\"assets/sfx/beep-soft-final.mp3\" data-start=\"24.28\" data-duration=\"0.30\" data-track-index=\"11\" data-volume=\"1\"></audio>\n  <audio id=\"bp06\" class=\"clip\" src=\"assets/sfx/beep-soft.mp3\"       data-start=\"32.53\" data-duration=\"0.16\" data-track-index=\"11\" data-volume=\"1\"></audio>\n  <audio id=\"bp07\" class=\"clip\" src=\"assets/sfx/beep-soft.mp3\"       data-start=\"33.03\" data-duration=\"0.16\" data-track-index=\"11\" data-volume=\"1\"></audio>\n  <audio id=\"bp08\" class=\"clip\" src=\"assets/sfx/beep-soft-final.mp3\" data-start=\"33.53\" data-duration=\"0.30\" data-track-index=\"11\" data-volume=\"1\"></audio>\n  <audio id=\"bp09\" class=\"clip\" src=\"assets/sfx/beep-soft.mp3\"       data-start=\"45.16\" data-duration=\"0.16\" data-track-index=\"11\" data-volume=\"1\"></audio>\n  <audio id=\"bp10\" class=\"clip\" src=\"assets/sfx/beep-soft.mp3\"       data-start=\"45.66\" data-duration=\"0.16\" data-track-index=\"11\" data-volume=\"1\"></audio>\n  <audio id=\"bp11\" class=\"clip\" src=\"assets/sfx/beep-soft-final.mp3\" data-start=\"46.16\" data-duration=\"0.30\" data-track-index=\"11\" data-volume=\"1\"></audio>\n  <audio id=\"bp12\" class=\"clip\" src=\"assets/sfx/beep-soft.mp3\"       data-start=\"57.78\" data-duration=\"0.16\" data-track-index=\"11\" data-volume=\"1\"></audio>\n  <audio id=\"bp13\" class=\"clip\" src=\"assets/sfx/beep-soft.mp3\"       data-start=\"58.28\" data-duration=\"0.16\" data-track-index=\"11\" data-volume=\"1\"></audio>\n  <audio id=\"bp14\" class=\"clip\" src=\"assets/sfx/beep-soft-final.mp3\" data-start=\"58.78\" data-duration=\"0.30\" data-track-index=\"11\" data-volume=\"1\"></audio>\n  <audio id=\"bp15\" class=\"clip\" src=\"assets/sfx/beep-soft.mp3\"       data-start=\"70.41\" data-duration=\"0.16\" data-track-index=\"11\" data-volume=\"1\"></audio>\n  <audio id=\"bp16\" class=\"clip\" src=\"assets/sfx/beep-soft.mp3\"       data-start=\"70.91\" data-duration=\"0.16\" data-track-index=\"11\" data-volume=\"1\"></audio>\n  <audio id=\"bp17\" class=\"clip\" src=\"assets/sfx/beep-soft-final.mp3\" data-start=\"71.41\" data-duration=\"0.30\" data-track-index=\"11\" data-volume=\"1\"></audio>\n\n  <audio id=\"sx-inv1\" class=\"clip\" src=\"assets/sfx/invasion-drone.mp3\" data-start=\"0.00\"  data-duration=\"10.0\" data-track-index=\"12\" data-volume=\"0.16\"></audio>\n  <audio id=\"sx-inv2\" class=\"clip\" src=\"assets/sfx/invasion-drone.mp3\" data-start=\"37.00\" data-duration=\"10.0\" data-track-index=\"12\" data-volume=\"0.16\"></audio>\n\n  <audio id=\"sx-d08\" class=\"clip\" src=\"assets/sfx/conveyor-doom.mp3\" data-start=\"36.00\" data-duration=\"3.0\" data-track-index=\"13\" data-volume=\"0.6\"></audio>\n  <audio id=\"sx-d11\" class=\"clip\" src=\"assets/sfx/ray-zap.mp3\"       data-start=\"48.70\" data-duration=\"3.0\" data-track-index=\"13\" data-volume=\"0.6\"></audio>\n  <audio id=\"sx-d14\" class=\"clip\" src=\"assets/sfx/drone-swarm.mp3\"   data-start=\"61.30\" data-duration=\"3.0\" data-track-index=\"13\" data-volume=\"0.6\"></audio>\n  <audio id=\"sx-d17\" class=\"clip\" src=\"assets/sfx/claw-snatch.mp3\"   data-start=\"73.90\" data-duration=\"3.0\" data-track-index=\"13\" data-volume=\"0.6\"></audio>\n\n  <audio id=\"sx-trp\" class=\"clip\" src=\"assets/sfx/tripod-stomp.mp3\" data-start=\"0.50\"  data-duration=\"5.0\" data-track-index=\"14\" data-volume=\"0.4\"></audio>\n  <audio id=\"sx-pur\" class=\"clip\" src=\"assets/sfx/alien-purr.mp3\"   data-start=\"16.00\" data-duration=\"4.0\" data-track-index=\"14\" data-volume=\"0.35\"></audio>\n  <audio id=\"sx-scn\" class=\"clip\" src=\"assets/sfx/scanner-sweep.mp3\" data-start=\"41.00\" data-duration=\"4.0\" data-track-index=\"14\" data-volume=\"0.4\"></audio>\n  <audio id=\"sx-crw\" class=\"clip\" src=\"assets/sfx/crawl-water.mp3\"  data-start=\"62.83\" data-duration=\"4.0\" data-track-index=\"14\" data-volume=\"0.35\"></audio>\n  <audio id=\"sx-dwn\" class=\"clip\" src=\"assets/sfx/dawn-relief.mp3\"  data-start=\"75.80\" data-duration=\"5.0\" data-track-index=\"14\" data-volume=\"0.4\"></audio>\n\n  <script src=\"https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js\"></script>\n  <script>\n    const tl = gsap.timeline({ paused: true, defaults: { immediateRender: false } });\n    const C = 2 * Math.PI * 210;\n    gsap.set(\"#cd-sweep\", { strokeDasharray: C, strokeDashoffset: 0 });\n    gsap.set([\"#title\",\"#name-l\",\"#name-r\",\"#countdown\",\"#cd-plate\",\"#fork-l\",\"#fork-r\",\"#death\",\"#death-wash\",\"#cap\",\"#cap-alien\",\"#cta\",\"#vhs\",\"#flash\"], { opacity: 0 });\n    const A   = [0.00,6.50,9.88,15.75,19.12,25.00,28.38,34.25,37.62,41.00,46.88,50.25,53.62,59.50,62.88,66.25,72.12,75.50];\n    const SEG = [7.00,3.88,6.38,3.88,6.38,3.88,6.38,3.88,3.88,6.38,3.88,3.88,6.38,3.88,3.88,6.38,3.88,9.00];\n    const vcr=document.getElementById(\"vcr\"); vcr.width=270; vcr.height=480; const vctx=vcr.getContext(\"2d\");\n    function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}\n    function drawVHS(t){const r=mulberry32((Math.floor(t*30)|0)+1);const w=vcr.width,h=vcr.height;const img=vctx.createImageData(w,h),d=img.data;for(let i=0;i<d.length;i+=4){const v=(r()*255)|0;d[i]=d[i+1]=d[i+2]=v;d[i+3]=(r()*60)|0;}vctx.putImageData(img,0,0);const band=Math.floor((t*60)%h);vctx.fillStyle=\"rgba(255,255,255,0.55)\";for(let k=0;k<26;k++){const x=(r()*w)|0,y=band+((r()*46)|0)-23;vctx.fillRect(x,y,(r()*7)|0,2);}}\n    function vhs(s,dur){tl.set(\"#vhs\",{opacity:1},s);const pf={v:s};tl.to(pf,{v:s+dur,duration:dur,ease:\"none\",onUpdate:()=>drawVHS(pf.v),overwrite:\"auto\"},s);let t=s,k=0;while(t<s+dur){tl.set(\"#vhs\",{y:(k%2?1:-1)},t);t+=0.1;k++;}tl.set(\"#vhs\",{y:0},s+dur);tl.to(\"#vhs\",{opacity:0,duration:0.12,overwrite:\"auto\"},s+dur);}\n    function capEl(el,text,tin,tout){tl.set(el,{textContent:text},tin-0.01);tl.fromTo(el,{opacity:0,y:26},{opacity:1,y:0,duration:0.32,ease:\"power3.out\",overwrite:\"auto\"},tin);tl.to(el,{opacity:0,duration:0.28,overwrite:\"auto\"},tout);tl.set(el,{opacity:0},tout+0.29);}\n    const cap=(t,a,b)=>capEl(\"#cap\",t,a,b); const capAl=(t,a,b)=>capEl(\"#cap-alien\",t,a,b);\n    function disc(s,step){step=step||0.5;tl.fromTo(\"#cd-plate\",{opacity:0},{opacity:1,duration:0.16,overwrite:\"auto\"},s-0.1);tl.fromTo(\"#countdown\",{opacity:0},{opacity:1,duration:0.16,overwrite:\"auto\"},s-0.1);for(let i=0;i<3;i++){const t=s+i*step;tl.set(\"#cd-num\",{textContent:3-i},t);tl.fromTo(\"#cd-sweep\",{strokeDashoffset:0},{strokeDashoffset:C,duration:step,ease:\"none\"},t);tl.fromTo(\"#cd-num\",{scale:1.2,opacity:0.4},{scale:1,opacity:1,duration:step*0.45,ease:\"back.out(2)\"},t);}tl.to([\"#countdown\",\"#cd-plate\"],{opacity:0,duration:0.2,ease:\"power2.in\",overwrite:\"auto\"},s+3*step-0.04);}\n    function deathBeat(i){const s=A[i],dur=SEG[i],dt=s+dur-1.7;tl.set(\"#flash\",{opacity:0.85},dt);tl.to(\"#flash\",{opacity:0,duration:0.22,ease:\"power2.in\",overwrite:\"auto\"},dt+0.03);tl.set(\"#flash\",{opacity:0},dt+0.3);tl.fromTo(\"#death-wash\",{opacity:0.9},{opacity:0,duration:0.6,ease:\"power2.in\",overwrite:\"auto\"},dt);tl.fromTo(\"#death\",{scale:1.7,opacity:0},{scale:1,opacity:1,duration:0.3,ease:\"back.out(2.2)\",overwrite:\"auto\"},dt);tl.to(\"#death\",{x:\"+=16\",duration:0.045,repeat:6,yoyo:true},dt+0.3);tl.set(\"#death\",{x:0},dt+0.7);tl.to(\"#death\",{opacity:0,duration:0.3,overwrite:\"auto\"},s+dur-0.05);tl.set(\"#death\",{opacity:0},s+dur);}\n    function freezeFork(i,l,r){const fs=A[i]+3.9,cd=A[i]+4.2,clear=cd+1.5+0.05;vhs(fs,clear-fs);tl.set(\"#fork-l\",{textContent:l},fs);tl.set(\"#fork-r\",{textContent:r},fs);tl.fromTo(\"#fork-l\",{opacity:0,x:-44},{opacity:1,x:0,duration:0.28,ease:\"power3.out\",overwrite:\"auto\"},fs+0.05);tl.fromTo(\"#fork-r\",{opacity:0,x:44},{opacity:1,x:0,duration:0.28,ease:\"power3.out\",overwrite:\"auto\"},fs+0.05);tl.to([\"#fork-l\",\"#fork-r\"],{opacity:0,duration:0.22,overwrite:\"auto\"},clear-0.05);tl.set([\"#fork-l\",\"#fork-r\"],{opacity:0},clear+0.2);disc(cd,0.5);}\n\n    // intro hub\n    tl.fromTo(\"#title\",{opacity:0,y:-22},{opacity:1,y:0,duration:0.4,ease:\"power3.out\"},0.4);\n    tl.to(\"#title\",{opacity:0.35,duration:0.05,repeat:3,yoyo:true,ease:\"none\"},0.9);\n    tl.fromTo(\"#name-l\",{opacity:0,scale:0.7},{opacity:1,scale:1,duration:0.4,ease:\"back.out(2)\"},0.7);\n    tl.fromTo(\"#name-r\",{opacity:0,scale:0.7},{opacity:1,scale:1,duration:0.4,ease:\"back.out(2)\"},1.0);\n    tl.to(\"#title\",{opacity:0,duration:0.3},2.6); tl.set(\"#title\",{opacity:0},2.95);\n    vhs(3.9,2.5); disc(4.9,0.5);\n    tl.to([\"#name-l\",\"#name-r\"],{opacity:0,duration:0.3},6.1); tl.set([\"#name-l\",\"#name-r\"],{opacity:0},6.45);\n\n    // forks (branch A converge-forks + branch B) + deaths\n    freezeFork(2,\"ENTER NOW\",\"FIND MY FAMILY\");\n    freezeFork(4,\"STAY COMPLIANT\",\"BOLT\");\n    freezeFork(6,\"ACCEPT\",\"SCREAM\"); deathBeat(7);\n    freezeFork(9,\"OPEN CELLAR\",\"SPRINT THE YARD\"); deathBeat(10);\n    freezeFork(12,\"CLEAN TUNNEL\",\"FLOODED CRAWL\"); deathBeat(13);\n    freezeFork(15,\"BOLT\",\"WAIT\"); deathBeat(16);\n\n    // captions (white narrator / cyan ALIEN; survivor mute)\n    cap (\"ONE OFFERS SHELTER.\\nONE OFFERS NOTHING.\", 0.42, 5.10);\n    capAl(\"“Come. I will keep you safe.”\", 6.82, 7.95);\n    cap (\"You took the kind one's hand.\", 8.22, 9.49);\n    capAl(\"“Step inside. You're rescued now.”\", 10.22, 11.90);\n    cap (\"Its shelter was a pen.\\nThe rescued, in cocoons.\", 16.07, 19.22);\n    capAl(\"“Hold still. Let me sort you.”\", 19.52, 20.66);\n    cap (\"It washed you. Branded you. Still purring.\", 25.32, 28.03);\n    capAl(\"“Don't be afraid. It's almost over.”\", 28.72, 30.51);\n    cap (\"You were always cattle.\\nThere was never a way out.\", 34.62, 37.04);\n    cap (\"Or you ran with the man who trusts nothing.\", 38.02, 40.05);\n    cap(\"The cellar, or the yard he points to?\", 41.42, 43.50);\n    cap (\"The cellar looked safe. The beam found it.\", 47.22, 49.35);\n    cap (\"You ran the open yard. Still breathing.\", 50.62, 52.68);\n    cap(\"The clean tunnel, or the flooded crawl?\", 54.12, 55.70);\n    cap (\"The clean tunnel fed the drones.\", 59.87, 61.31);\n    cap (\"You took the foul crawl. Smart.\", 62.32, 63.96);\n    cap(\"Bolt for the lights, or wait for his signal?\", 66.82, 68.40);\n    cap (\"You bolted for the lights. The claw was faster.\", 72.47, 74.45);\n    cap (\"You held your nerve. Out of the city.\", 75.92, 79.83);\n\n    // end CTA over the dawn idle\n    tl.fromTo(\"#cta\",{opacity:0,scale:0.9},{opacity:1,scale:1,duration:0.5,ease:\"back.out(1.8)\"},76.6);\n    tl.to({},{duration:0.01},84.48);\n    window.__timelines = window.__timelines || {};\n    window.__timelines[\"choose-warofworlds-001\"] = tl;\n  </script>\n</div>\n</body>\n</html>\n",
      "timing": {
        "A": [
          0,
          6.5,
          9.88,
          15.75,
          19.12,
          25,
          28.38,
          34.25,
          37.62,
          41,
          46.88,
          50.25,
          53.62,
          59.5,
          62.88,
          66.25,
          72.12,
          75.5
        ],
        "SEG": [
          7,
          3.88,
          6.38,
          3.88,
          6.38,
          3.88,
          6.38,
          3.88,
          3.88,
          6.38,
          3.88,
          3.88,
          6.38,
          3.88,
          3.88,
          6.38,
          3.88,
          9
        ]
      },
      "components": [
        "cap",
        "capEl",
        "cd-cross",
        "cd-ring",
        "cd-sweep",
        "choose-warofworlds-001",
        "clip",
        "deathBeat",
        "disc",
        "drawVHS",
        "fork",
        "freezeFork",
        "grain",
        "mulberry32",
        "name",
        "pause",
        "scan",
        "tint",
        "vhs",
        "vid",
        "vignette"
      ],
      "storageUrl": "https://nkwgcuhjdxwsqsestgnp.supabase.co/storage/v1/object/public/library/blueprints/choose-warofworlds/index.html"
    },
    "costRollupUsd": 16.36,
    "schemaVersion": 1
  }
];
// ralphy:published-blueprints:end
