// #461 — universal media-artifact model: schema round-trip + defaults, the
// unit.json media adapter (the non-breaking migration seam), the capability
// maps, and bad-kind / bad-shape rejection.

import { describe, test, expect } from "bun:test";
import {
  MEDIA_ARTIFACT_KINDS,
  EVAL_CAPABILITIES,
  DISTRIBUTION_CAPABILITIES,
  parseMediaArtifact,
  parseMediaArtifactSet,
  mediaArtifactFromUnitMedia,
  isMediaArtifactKind,
} from "../../cli/lib/schemas/media-artifact.js";
import { UnitManifestSchema, type UnitManifest } from "../../cli/lib/schemas/unit.js";

describe("MediaArtifact schema", () => {
  test("fills defaults and round-trips a minimal artifact", () => {
    const a = parseMediaArtifact({ kind: "video", path: "render/final.mp4" });
    expect(a.version).toBe(1);
    expect(a.kind).toBe("video");
    expect(a.path).toBe("render/final.mp4");
    expect(a.textTracks).toEqual([]); // defaulted
  });

  test("round-trips a fully-populated artifact unchanged", () => {
    const full = {
      version: 1 as const,
      kind: "video" as const,
      uri: "obj://bucket/key.mp4",
      mime: "video/mp4",
      durationMs: 31000,
      width: 1080,
      height: 1920,
      aspect: "9:16",
      bytes: 4_200_000,
      textTracks: [{ kind: "captions" as const, path: "captions/scene-04.srt", format: "srt" as const, language: "en" }],
      role: "hero",
      slot: "scene-04",
      id: "scene-04",
      model: "kwaivgi/kling-v3.0-pro",
      provider: "openrouter",
      costUsd: 0.42,
      provenance: { template: "choose-path", style: "ps1-horror", recipes: ["vhs-grain"], assets: ["narrator-voice"] },
    };
    expect(parseMediaArtifact(full)).toMatchObject(full);
  });

  test("accepts a uri-only (storage-agnostic) artifact", () => {
    const a = parseMediaArtifact({ kind: "image", uri: "obj://bucket/hero.png" });
    expect(a.uri).toBe("obj://bucket/hero.png");
    expect(a.path).toBeUndefined();
  });

  test("rejects a bad kind", () => {
    expect(() => parseMediaArtifact({ kind: "hologram", path: "x.glb" })).toThrow();
  });

  test("rejects an artifact with neither uri nor path", () => {
    expect(() => parseMediaArtifact({ kind: "image" })).toThrow(/uri or a path/);
  });

  test('rejects kind "custom" without a customKind label', () => {
    expect(() => parseMediaArtifact({ kind: "custom", path: "scene.glb" })).toThrow(/customKind/);
  });

  test('accepts kind "custom" with a label (the extension escape)', () => {
    const a = parseMediaArtifact({ kind: "custom", customKind: "webgl-scene", path: "scene/index.html" });
    expect(a.kind).toBe("custom");
    expect(a.customKind).toBe("webgl-scene");
  });

  test("isMediaArtifactKind guards the taxonomy", () => {
    expect(isMediaArtifactKind("audio")).toBe(true);
    expect(isMediaArtifactKind("hologram")).toBe(false);
    expect(isMediaArtifactKind(42)).toBe(false);
  });
});

describe("MediaArtifactSet schema", () => {
  test("defaults to an empty ordered set and round-trips members", () => {
    const empty = parseMediaArtifactSet({});
    expect(empty.artifacts).toEqual([]);
    const set = parseMediaArtifactSet({
      artifacts: [
        { kind: "video", path: "a.mp4" },
        { kind: "captions", path: "a.srt" },
      ],
      order: ["a.mp4", "a.srt"],
    });
    expect(set.artifacts.map((x) => x.kind)).toEqual(["video", "captions"]);
    expect(set.order).toEqual(["a.mp4", "a.srt"]);
  });
});

describe("capability maps (eval + distribution seams)", () => {
  test("every taxonomy kind has an eval + distribution entry", () => {
    for (const k of MEDIA_ARTIFACT_KINDS) {
      expect(EVAL_CAPABILITIES[k]).toBeDefined();
      expect(DISTRIBUTION_CAPABILITIES[k]).toBeDefined();
    }
  });

  test("video is motion+timing eval-gated; a ref is never eval-gated", () => {
    expect(EVAL_CAPABILITIES.video).toContain("motion");
    expect(EVAL_CAPABILITIES.video).toContain("timing");
    expect(EVAL_CAPABILITIES.ref).toEqual([]);
  });

  test("a ref is source-only for distribution; an image is feed-postable", () => {
    expect(DISTRIBUTION_CAPABILITIES.ref).toEqual(["source-only"]);
    expect(DISTRIBUTION_CAPABILITIES.image).toContain("feed-post");
  });
});

describe("mediaArtifactFromUnitMedia adapter (migration seam)", () => {
  // A real-shaped video unit.json (validated through the actual schema so the
  // adapter is proven against the live Unit contract, not a hand-rolled stub).
  function videoUnit(): UnitManifest {
    return UnitManifestSchema.parse({
      slug: "choose-path-001",
      format: "video",
      media: ["final.mp4", "thumb.png"],
      media_meta: {
        "final.mp4": { kind: "video", aspect: "9 / 16" },
        "thumb.png": { kind: "image", aspect: "9 / 16" },
      },
      provenance: { template: "choose-path", style: "ps1-horror", recipes: ["vhs-grain"], assets: ["narrator"] },
      provenance_graph: "provenance.json",
      created: "2026-06-23T00:00:00.000Z",
    });
  }

  test("maps ordered unit media into valid artifacts, preserving order", () => {
    const arts = mediaArtifactFromUnitMedia(videoUnit());
    expect(arts.map((a) => a.path)).toEqual(["final.mp4", "thumb.png"]); // order preserved
    expect(arts.map((a) => a.kind)).toEqual(["video", "image"]);
    // id/slot default to the filename (the manifest's stable key).
    expect(arts[0].id).toBe("final.mp4");
    expect(arts[0].slot).toBe("final.mp4");
    expect(arts[0].aspect).toBe("9 / 16");
  });

  test("lifts unit block provenance + the graph pointer onto every artifact", () => {
    const arts = mediaArtifactFromUnitMedia(videoUnit());
    for (const a of arts) {
      expect(a.provenance?.template).toBe("choose-path");
      expect(a.provenance?.style).toBe("ps1-horror");
      expect(a.provenance?.recipes).toEqual(["vhs-grain"]);
      expect(a.provenance?.provenanceGraph).toBe("provenance.json");
    }
  });

  test("legacy unit without media_meta infers kind from the file extension", () => {
    const legacy = UnitManifestSchema.parse({
      slug: "old-pack",
      format: "image",
      media: ["a.png", "clip.mp4", "vo.mp3", "subs.srt", "unknownfile"],
      created: "2026-01-01T00:00:00.000Z",
    });
    const arts = mediaArtifactFromUnitMedia(legacy);
    expect(arts.map((a) => a.kind)).toEqual(["image", "video", "audio", "captions", "image"]);
  });

  test("an audio-only clip pack (#461 fixture) maps cleanly", () => {
    const audioPack = UnitManifestSchema.parse({
      slug: "podcast-cuts-001",
      format: "podcast-cuts",
      media: ["cut-01.mp3", "cut-02.mp3"],
      media_meta: {
        // unit.ts media_meta.kind is image|video only today; audio falls to the
        // extension inference path, which the adapter resolves to "audio".
      },
      created: "2026-06-23T00:00:00.000Z",
    });
    const arts = mediaArtifactFromUnitMedia(audioPack);
    expect(arts.map((a) => a.kind)).toEqual(["audio", "audio"]);
  });

  test("a unit with no provenance produces artifacts with no provenance block", () => {
    const bare = UnitManifestSchema.parse({
      slug: "bare-001",
      format: "image",
      media: ["a.png"],
      created: "2026-06-23T00:00:00.000Z",
    });
    const arts = mediaArtifactFromUnitMedia(bare);
    expect(arts[0].provenance).toBeUndefined();
  });
});
