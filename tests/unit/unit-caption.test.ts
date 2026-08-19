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

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root";
import { projectDir, workspaceUnitsDir } from "../../cli/lib/paths";
import { buildUnitCaption, type CaptionContext } from "../../cli/lib/social/caption";
import { UnitManifestSchema, UnitCaptionSchema } from "../../cli/lib/schemas/unit";
import { NICHE_TAGS, bankTags } from "../../cli/lib/social/hashtag-bank";

const REPO = path.resolve(import.meta.dir, "..", "..");
const CLI = path.join(REPO, "cli", "index.ts");

// Canned platform copy a stubbed LLM returns. Schema-shaped pre-merge.
const CANNED_COPY = {
  tiktok: "POV: your aura hits 999,999 and the room goes PS1",
  reels:
    "When the aura is too strong the graphics downgrade to PS1. Caught it on camera. Watch till the end.",
  shorts: "Aura: 999,999 (PS1 mode)",
};

let tmp: TmpRoot;
beforeEach(() => {
  tmp = makeTmpRoot("ralphy-caption-403");
});
afterEach(() => {
  tmp.cleanup();
});

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

describe("ralphy unit caption (CLI smoke, faked LLM)", () => {
  const PROJECT = "caption-cli-403";

  function seedProjectAndUnit(rootDir: string, slug: string, manifest: Record<string, unknown>) {
    const regPath = path.join(rootDir, ".ralphy", "registry.json");
    fs.writeFileSync(
      regPath,
      JSON.stringify({ projects: { [PROJECT]: { id: PROJECT, name: "Caption CLI", workspace: "default" } } }),
    );
    const unitDir = path.join(projectDir(PROJECT), "units", slug);
    fs.mkdirSync(unitDir, { recursive: true });
    fs.writeFileSync(path.join(unitDir, "unit.json"), JSON.stringify(manifest, null, 2));
    return unitDir;
  }

  function writeFakeCopy(rootDir: string): string {
    const p = path.join(rootDir, "fake-copy.json");
    fs.writeFileSync(p, JSON.stringify(CANNED_COPY));
    return p;
  }

  function runCaption(rootDir: string, fakePath: string, args: string[]) {
    return spawnSync("bun", ["run", CLI, "--cwd", rootDir, "--json", "unit", "caption", ...args], {
      cwd: rootDir,
      encoding: "utf8",
      env: { ...process.env, RALPHY_FAKE_CAPTION_JSON: fakePath },
    });
  }

  function baseManifest(slug: string, over: Record<string, unknown> = {}) {
    return {
      slug,
      format: "video",
      media: ["clip.mp4"],
      tags: ["aura", "ps1core", "meme"],
      created: new Date().toISOString(),
      ...over,
    };
  }

  test("writes a schema-valid caption into unit.json", () => {
    const slug = "aura-moment-001";
    const unitDir = seedProjectAndUnit(tmp.dir, slug, baseManifest(slug));
    const fake = writeFakeCopy(tmp.dir);

    const r = runCaption(tmp.dir, fake, [PROJECT, slug, "--language", "English"]);
    expect(r.status).toBe(0);
    const json = JSON.parse(r.stdout);
    expect(json.captioned).toBe(1);

    const written = JSON.parse(fs.readFileSync(path.join(unitDir, "unit.json"), "utf8"));
    expect(() => UnitManifestSchema.parse(written)).not.toThrow();
    expect(written.caption.platform.tiktok).toBe(CANNED_COPY.tiktok);
    expect(written.caption.language).toBe("English");
    // Bank niche tags merged in.
    for (const tag of NICHE_TAGS.aura.slice(0, 3)) {
      expect(written.caption.hashtags).toContain(tag);
    }
  });

  test("--language flows through to the persisted caption", () => {
    const slug = "lang-unit";
    const unitDir = seedProjectAndUnit(tmp.dir, slug, baseManifest(slug));
    const fake = writeFakeCopy(tmp.dir);
    const r = runCaption(tmp.dir, fake, [PROJECT, slug, "--language", "German"]);
    expect(r.status).toBe(0);
    const written = JSON.parse(fs.readFileSync(path.join(unitDir, "unit.json"), "utf8"));
    expect(written.caption.language).toBe("German");
  });

  test("a second run does NOT clobber (append-only); --force archives prior", () => {
    const slug = "appendonly-unit";
    const unitDir = seedProjectAndUnit(tmp.dir, slug, baseManifest(slug));
    const fake = writeFakeCopy(tmp.dir);

    // First caption.
    const r1 = runCaption(tmp.dir, fake, [PROJECT, slug]);
    expect(r1.status).toBe(0);
    const afterFirst = JSON.parse(fs.readFileSync(path.join(unitDir, "unit.json"), "utf8"));
    const firstCaption = afterFirst.caption;
    expect(firstCaption).toBeTruthy();

    // Second run WITHOUT --force → skipped, caption unchanged, no versions.
    const r2 = runCaption(tmp.dir, fake, [PROJECT, slug]);
    expect(r2.status).toBe(0);
    const json2 = JSON.parse(r2.stdout);
    expect(json2.captioned).toBe(0);
    expect(json2.results[0].skipped).toBeTruthy();
    const afterSkip = JSON.parse(fs.readFileSync(path.join(unitDir, "unit.json"), "utf8"));
    expect(afterSkip.caption).toEqual(firstCaption);
    expect(afterSkip.caption_versions).toBeUndefined();

    // Third run WITH --force → re-draft, prior archived into caption_versions.
    const r3 = runCaption(tmp.dir, fake, [PROJECT, slug, "--force"]);
    expect(r3.status).toBe(0);
    const afterForce = JSON.parse(fs.readFileSync(path.join(unitDir, "unit.json"), "utf8"));
    expect(Array.isArray(afterForce.caption_versions)).toBe(true);
    expect(afterForce.caption_versions.length).toBe(1);
    expect(afterForce.caption_versions[0]).toEqual(firstCaption);
    // Still schema-valid after the force re-draft.
    expect(() => UnitManifestSchema.parse(afterForce)).not.toThrow();
  }, 20000); // three CLI spawns — the 5s default flakes under parallel load

  test("--bulk writes a caption block per unit", () => {
    const slugs = ["bulk-a", "bulk-b", "bulk-c"];
    const dirs = slugs.map((s) => seedProjectAndUnit(tmp.dir, s, baseManifest(s)));
    const fake = writeFakeCopy(tmp.dir);

    const r = runCaption(tmp.dir, fake, [PROJECT, "--bulk", "--language", "English"]);
    expect(r.status).toBe(0);
    const json = JSON.parse(r.stdout);
    expect(json.bulk).toBe(true);
    expect(json.captioned).toBe(3);

    for (const dir of dirs) {
      const written = JSON.parse(fs.readFileSync(path.join(dir, "unit.json"), "utf8"));
      expect(written.caption).toBeTruthy();
      expect(() => UnitManifestSchema.parse(written)).not.toThrow();
    }
  });

  test("--workspace + --copy-file captions a workspace unit with verbatim copy", () => {
    const WS = "caption-ws";
    const slug = "ws-wire-001";
    const unitDir = path.join(workspaceUnitsDir(WS), slug);
    fs.mkdirSync(unitDir, { recursive: true });
    fs.writeFileSync(path.join(unitDir, "unit.json"), JSON.stringify(baseManifest(slug), null, 2));
    const copyPath = path.join(tmp.dir, "seo-copy.json");
    fs.writeFileSync(copyPath, JSON.stringify({ ...CANNED_COPY, hashtags: ["#ipo", "openai"] }));

    // No RALPHY_FAKE hook: --copy-file itself must bypass the LLM draft.
    const r = spawnSync(
      "bun",
      ["run", CLI, "--cwd", tmp.dir, "--json", "unit", "caption", slug, "--workspace", WS, "--copy-file", copyPath],
      { cwd: tmp.dir, encoding: "utf8" },
    );
    expect(r.status).toBe(0);
    const json = JSON.parse(r.stdout);
    expect(json.workspace).toBe(WS);
    expect(json.captioned).toBe(1);

    const written = JSON.parse(fs.readFileSync(path.join(unitDir, "unit.json"), "utf8"));
    expect(() => UnitManifestSchema.parse(written)).not.toThrow();
    expect(written.caption.platform.reels).toBe(CANNED_COPY.reels);
    // A curated hashtag set in the copy file wins over the bank ('#' enforced).
    expect(written.caption.hashtags).toEqual(["#ipo", "#openai"]);
  }, 20000); // CLI spawn — the 5s default flakes under parallel load
});
