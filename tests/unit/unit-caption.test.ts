// `ralphy unit caption` + the social-copy lib (#403).
//
// Two layers, mirroring production-plan.test.ts (#407):
//   1. In-process `buildUnitCaption` with an INJECTED draft fn — no live LLM,
//      no `mock.module` on a shared lib (#072). Asserts schema-validity + the
//      hashtag-bank merge + the language pass-through.
//   2. CLI smoke of `ralphy unit caption` via the narrowly-scoped
//      `RALPHY_FAKE_CAPTION_JSON` env hook (same pattern as
//      RALPHY_FAKE_TRANSCRIBE_JSON) — writes the caption into unit.json,
//      enforces append-only (--force archives prior), and runs bulk + --language.
//
// English-only-on-disk: every fixture string is plain English, including the
// "German audience" case, which only sets --language English-side metadata and
// canned English copy (the language FIELD flows through; we do not author
// non-Latin copy on disk).

import { describe, test, expect } from "bun:test";
import { buildUnitCaption, type CaptionContext } from "../../cli/lib/social/caption";
import { UnitManifestSchema, UnitCaptionSchema } from "../../cli/lib/schemas/unit";
import { NICHE_TAGS, bankTags } from "../../cli/lib/social/hashtag-bank";

// Canned platform copy a stubbed LLM returns. Schema-shaped pre-merge.
const CANNED_COPY = {
  tiktok: "POV: your aura hits 999,999 and the room goes PS1",
  reels:
    "When the aura is too strong the graphics downgrade to PS1. Caught it on camera. Watch till the end.",
  shorts: "Aura: 999,999 (PS1 mode)",
};

// ─── buildUnitCaption — injected draft fn, deterministic ─────────────────────

describe("buildUnitCaption (in-process, stubbed draft fn)", () => {
  const baseCtx: CaptionContext = {
    projectId: "aura-proj",
    slug: "aura-moment-001",
    format: "video",
    language: "English",
    niche: "aura",
    title: "Aura Moment",
    tags: ["aura", "ps1core", "meme"],
  };

  test("returns a schema-valid caption with the canned copy", async () => {
    const draft = async () => CANNED_COPY;
    const caption = await buildUnitCaption({ ctx: baseCtx, draft });
    expect(() => UnitCaptionSchema.parse(caption)).not.toThrow();
    expect(caption.platform.tiktok).toBe(CANNED_COPY.tiktok);
    expect(caption.platform.reels).toBe(CANNED_COPY.reels);
    expect(caption.platform.shorts).toBe(CANNED_COPY.shorts);
    expect(caption.language).toBe("English");
  });

  test("hashtags include the bank's niche tags + format + broad-reach", async () => {
    const draft = async () => CANNED_COPY;
    const caption = await buildUnitCaption({ ctx: baseCtx, draft });
    // The aura niche spine must be present.
    for (const tag of NICHE_TAGS.aura.slice(0, 3)) {
      expect(caption.hashtags).toContain(tag);
    }
    // Format tags for a video unit (reel bucket isn't auto for "video"; "video"
    // maps to the video format key) + a broad-reach anchor.
    expect(caption.hashtags).toContain("#fyp");
    // Deduped (no case-insensitive repeats).
    const lower = caption.hashtags.map((t) => t.toLowerCase());
    expect(new Set(lower).size).toBe(lower.length);
    expect(caption.niche).toBe("aura");
  });

  test("--language flows through to the caption", async () => {
    const draft = async () => CANNED_COPY;
    const caption = await buildUnitCaption({
      ctx: { ...baseCtx, language: "German" },
      draft,
    });
    expect(caption.language).toBe("German");
  });

  test("a malformed draft payload falls back without throwing + caps shorts", async () => {
    const longShort = "x".repeat(80);
    const draft = async () => ({ tiktok: "", reels: "", shorts: longShort });
    const caption = await buildUnitCaption({ ctx: baseCtx, draft });
    expect(() => UnitCaptionSchema.parse(caption)).not.toThrow();
    // Empty tiktok/reels fall back to title/blurb/slug; shorts is capped at 40.
    expect(caption.platform.tiktok.length).toBeGreaterThan(0);
    expect(caption.platform.shorts.length).toBeLessThanOrEqual(40);
  });

  test("niche resolves from tags when no explicit niche is set", async () => {
    const draft = async () => CANNED_COPY;
    const caption = await buildUnitCaption({
      ctx: { ...baseCtx, niche: undefined, tags: ["unboxing", "haul"] },
      draft,
    });
    expect(caption.niche).toBe("unboxing");
    expect(caption.hashtags).toContain("#unboxing");
  });
});

// ─── Schema back-compat ──────────────────────────────────────────────────────

describe("UnitManifestSchema caption back-compat", () => {
  test("a manifest WITHOUT caption still validates (optional/additive)", () => {
    const m = {
      slug: "legacy-unit",
      format: "video",
      media: ["clip.mp4"],
      created: new Date().toISOString(),
    };
    expect(() => UnitManifestSchema.parse(m)).not.toThrow();
  });

  test("a manifest WITH a caption + caption_versions validates", () => {
    const cap = {
      platform: { tiktok: "hook", reels: "caption", shorts: "title" },
      hashtags: bankTags({ niche: "aura", format: "video" }),
      language: "English",
      niche: "aura",
      created: new Date().toISOString(),
    };
    const m = {
      slug: "captioned-unit",
      format: "video",
      media: ["clip.mp4"],
      created: new Date().toISOString(),
      caption: cap,
      caption_versions: [cap],
    };
    expect(() => UnitManifestSchema.parse(m)).not.toThrow();
  });
});

// ─── CLI smoke (RALPHY_FAKE_CAPTION_JSON hook) ───────────────────────────────
