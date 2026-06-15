// Image-pack spec Zod schema (#429). An `ImagePackSpec` is the SLOT-ROLE plan a
// multi-still deliverable is generated against — App Store screenshots, Play
// Store screenshots, a social image pack, or an ad creative pack. It sits on top
// of the existing pieces:
//   • the `image-pack` project KIND (a `selected/` sibling; `cli/lib/contract.ts`
//     probes for it and relaxes the scenario requirement),
//   • `generate image --batch <jsonl>` / `--variants N` (#024) — the spec EMITS
//     the batch jsonl; it does NOT reimplement generation,
//   • the `ad-creative-pack` content mode (`cli/lib/content-modes.ts`) — the
//     closest existing route for the ad-creative kind.
//
// Each spec carries a kind, an aspect, and an ordered set of SLOTS. A slot names
// a ROLE (what the still is for — hero / feature-callout / proof / …) and a
// COMPOSITION CLASS (how it is laid out — full-bleed / device-frame / text-card /
// portrait-quote / …). The art-director fills the per-slot prompt; this schema
// only fixes the role/composition scaffold so the pack ships with discipline.
//
// Where the JSON lands:
//   • <project>/pack.json   (project root, beside asset-manifest.json)
//
// Schema style mirrors `cli/lib/schemas/{ref-pack,research-facts,unit}.ts`: a Zod
// object with inline-doc comments, exported `z.infer` types, sane defaults so a
// partial assembly still parses, and a `parseImagePackSpec()`. The default slot
// sets per kind are authored once in `defaultSpecForKind()` and reused by the
// scaffold. English-only-on-disk.

import { z } from "zod";

// ─── Pack-kind taxonomy ─────────────────────────────────────────────────────────

/**
 * The four image-pack kinds. Append, never repurpose.
 *
 *   • app-store    — iOS App Store screenshot set (hero → features → proof → CTA).
 *   • play-store   — Google Play screenshot set (same spine, Play conventions).
 *   • social       — a social image pack (cover + N feed/story stills).
 *   • ad-creative  — an FB / Meta performance creative pack (the fb-creatives A-E
 *                    5-set), routed against the `ad-creative-pack` content mode.
 */
export const IMAGE_PACK_KINDS = ["app-store", "play-store", "social", "ad-creative"] as const;
export type ImagePackKind = (typeof IMAGE_PACK_KINDS)[number];

/** True when `value` is a legal pack kind. */
export function isImagePackKind(value: unknown): value is ImagePackKind {
  return typeof value === "string" && (IMAGE_PACK_KINDS as readonly string[]).includes(value);
}

// ─── Slot ───────────────────────────────────────────────────────────────────────

/**
 * One slot in the pack. `id` is the canonical slot name carried through to the
 * batch jsonl + the asset manifest (kebab-case, e.g. `hero`, `feature-01`).
 * `role` is what the still is FOR; `compositionClass` is HOW it is laid out;
 * `note` is the one-line art-direction hint the prompt stub is seeded from.
 */
export const ImagePackSlotSchema = z.object({
  /** Canonical slot id (kebab-case) — the batch-jsonl + manifest key. */
  id: z.string().min(1),
  /** What the still is for (hero / feature-callout / proof / cta / …). */
  role: z.string().min(1),
  /** How the still is laid out (full-bleed / device-frame / text-card / …). */
  compositionClass: z.string().min(1),
  /** One-line art-direction hint the prompt stub is seeded from (English-on-disk). */
  note: z.string().default(""),
});
export type ImagePackSlot = z.infer<typeof ImagePackSlotSchema>;

// ─── The top-level spec ───────────────────────────────────────────────────────────

export const ImagePackSpecSchema = z.object({
  /** Schema version — bump when a field becomes required. */
  version: z.literal(1).default(1),
  /** The pack kind from the fixed taxonomy. */
  kind: z.enum(IMAGE_PACK_KINDS),
  /** Aspect-ratio alias forwarded to `generate image --aspect` (e.g. 9:16, 1:1). */
  aspect: z.string().min(1),
  /** The ordered slot set — each names a role + composition class. */
  slots: z.array(ImagePackSlotSchema).min(1),
});
export type ImagePackSpec = z.infer<typeof ImagePackSpecSchema>;

/** Project-relative location the pack spec + provenance JSON is persisted to. */
export const IMAGE_PACK_ARTIFACT = "pack.json" as const;
/** Project-relative location the batch-ready jsonl skeleton is written to. */
export const IMAGE_PACK_PROMPTS_ARTIFACT = "prompts/pack.jsonl" as const;

/**
 * Parse + validate an unknown value into an ImagePackSpec. Throws a ZodError on a
 * malformed object. Callers mapping onto `E_VALIDATION_FAILED` should catch and
 * pass `error.message` as `detail`.
 */
export function parseImagePackSpec(input: unknown): ImagePackSpec {
  return ImagePackSpecSchema.parse(input);
}

// ─── Default slot sets per kind ────────────────────────────────────────────────────

/**
 * The default aspect per kind. App / Play store stills are tall 9:16 phone
 * frames; social packs default to 1:1 feed; ad-creative defaults to 4:5 (the
 * fb-creatives FB-feed default) — the agent overrides per placement.
 */
const DEFAULT_ASPECT: Record<ImagePackKind, string> = {
  "app-store": "9:16",
  "play-store": "9:16",
  social: "1:1",
  "ad-creative": "4:5",
};

/**
 * The default ROLE/COMPOSITION slot set per kind. These are the production-tested
 * spines:
 *   • App Store / Play Store — hero → feature-callout(s) → lifestyle → dimensions
 *     → comparison → usage → cta (the TakeAMinute App Store pack shape this issue
 *     cites).
 *   • social — a cover + N feed stills.
 *   • ad-creative — the fb-creatives A-E 5-set (real-people / graphic / proof /
 *     meme / niche), one representative slot per set (the pack scales N per set
 *     via --count; see `defaultSpecForKind`).
 *
 * `count` (when passed to `defaultSpecForKind`) tunes the repeatable middle of a
 * set — the feature callouts for the stores, the feed stills for social, the
 * concepts-per-set for ad-creative — clamped to a sane range.
 */
function appStoreSlots(featureCount: number): ImagePackSlot[] {
  const slots: ImagePackSlot[] = [
    { id: "hero", role: "hero", compositionClass: "device-frame-headline", note: "The lead screenshot: app device frame + the single strongest value headline." },
  ];
  for (let i = 1; i <= featureCount; i++) {
    const n = String(i).padStart(2, "0");
    slots.push({
      id: `feature-${n}`,
      role: "feature-callout",
      compositionClass: "device-frame-callout",
      note: "One feature: device frame + a short benefit caption + a callout pointing at the UI.",
    });
  }
  slots.push(
    { id: "lifestyle", role: "lifestyle", compositionClass: "context-scene", note: "The app in real-world use — a person / environment around the device." },
    { id: "dimensions", role: "dimensions", compositionClass: "spec-grid", note: "Specs / numbers / supported platforms laid out as a clean grid." },
    { id: "comparison", role: "comparison", compositionClass: "before-after", note: "Before/after or us-vs-them — the differentiating claim, side by side." },
    { id: "usage", role: "usage", compositionClass: "step-sequence", note: "A short how-it-works step sequence across the device frame." },
    { id: "cta", role: "cta", compositionClass: "text-card-cta", note: "The closing call to action: download prompt + store badge." },
  );
  return slots;
}

/** Ad-creative pack: the fb-creatives A-E 5-set. `perSet` repeats each set. */
function adCreativeSlots(perSet: number): ImagePackSlot[] {
  const sets: Array<{ role: string; compositionClass: string; note: string; prefix: string }> = [
    { prefix: "a", role: "real-people", compositionClass: "portrait-quote", note: "Photoreal candid portrait + a pull-quote card + CTA pill (the A set)." },
    { prefix: "b", role: "graphic", compositionClass: "typography-poster", note: "Wordmark / price-stack / data-viz anchored on one specific lander number (the B set)." },
    { prefix: "c", role: "proof", compositionClass: "dashboard-shot", note: "Screenshot-flavored proof: dashboard tile / code-card / before-after (the C set)." },
    { prefix: "d", role: "meme", compositionClass: "meme-header", note: "Meme-header on a brand-tinted canvas, laddering back to one product claim (the D set)." },
    { prefix: "e", role: "niche", compositionClass: "segment-card", note: "Segment-targeted concept (indie hacker / AI engineer / ops lead) (the E set)." },
  ];
  const slots: ImagePackSlot[] = [];
  for (const s of sets) {
    for (let i = 1; i <= perSet; i++) {
      slots.push({ id: `${s.prefix}${i}`, role: s.role, compositionClass: s.compositionClass, note: s.note });
    }
  }
  return slots;
}

/** Social pack: a cover + N feed stills. */
function socialSlots(feedCount: number): ImagePackSlot[] {
  const slots: ImagePackSlot[] = [
    { id: "cover", role: "cover", compositionClass: "hook-headline", note: "The cover still: the scroll-stopping hook headline + key visual." },
  ];
  for (let i = 1; i <= feedCount; i++) {
    const n = String(i).padStart(2, "0");
    slots.push({
      id: `feed-${n}`,
      role: "feed",
      compositionClass: "feed-still",
      note: "One feed still continuing the cover's narrative — baked text + key visual.",
    });
  }
  return slots;
}

/**
 * Build the DEFAULT spec for a pack kind. `count` tunes the repeatable middle of
 * the set (feature callouts for the stores, feed stills for social,
 * concepts-per-set for ad-creative); it is clamped to a sane range so a typo
 * can't blow up the batch. Omitting it uses the per-kind default.
 *
 * The returned spec is validated through `ImagePackSpecSchema` so callers always
 * get a well-formed object.
 */
export function defaultSpecForKind(kind: ImagePackKind, count?: number): ImagePackSpec {
  const aspect = DEFAULT_ASPECT[kind];
  let slots: ImagePackSlot[];
  switch (kind) {
    case "app-store":
    case "play-store": {
      // Default 4 feature callouts (→ 10-slot pack); clamp 1-8.
      const featureCount = clamp(count ?? 4, 1, 8);
      slots = appStoreSlots(featureCount);
      break;
    }
    case "ad-creative": {
      // Default 1 concept per set (→ the 5-slot A-E starter); clamp 1-8 per set.
      const perSet = clamp(count ?? 1, 1, 8);
      slots = adCreativeSlots(perSet);
      break;
    }
    case "social": {
      // Default 4 feed stills (→ 5-slot pack); clamp 1-12.
      const feedCount = clamp(count ?? 4, 1, 12);
      slots = socialSlots(feedCount);
      break;
    }
  }
  return ImagePackSpecSchema.parse({ kind, aspect, slots });
}

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, Math.trunc(n)));
}
