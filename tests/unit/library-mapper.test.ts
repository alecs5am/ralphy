// Unit tests for the library PostgREST snake→camel + `data`-merge mappers
// (cli/lib/library/client.ts). Pure functions over hardcoded fixture rows — NO
// network, NO fs. English-only-on-disk: every fixture string is plain English.

import { describe, test, expect } from "bun:test";
import { mapUnit, mapBlock, mapBlueprint } from "../../cli/lib/library/client.ts";

describe("mapUnit", () => {
  test("maps a units row snake→camel and keeps media + tags", () => {
    const row = {
      id: "animated-fb-ad",
      format: "motion-design",
      title: "Animated FB Showcase Reel",
      blurb: "A 1:1 silent motion reel.",
      date: "2026-05",
      media: [
        {
          src: "/showcase/animated-fb-ad/clip.mp4",
          kind: "video",
          aspect: "1 / 1",
          storageUrl: "https://example.test/clip.mp4",
        },
      ],
      media_count: 1,
      hero: false,
      created_at: "2026-05-31T22:08:47.565422+00:00",
      tags: ["kinetic-typography", "bloom"],
    };
    const u = mapUnit(row);
    expect(u.id).toBe("animated-fb-ad");
    expect(u.format).toBe("motion-design");
    expect(u.title).toBe("Animated FB Showcase Reel");
    expect(u.mediaCount).toBe(1); // media_count → mediaCount
    expect(u.createdAt).toBe("2026-05-31T22:08:47.565422+00:00"); // created_at → createdAt
    expect(u.hero).toBe(false);
    expect(u.tags).toEqual(["kinetic-typography", "bloom"]);
    expect(u.media?.[0]?.storageUrl).toBe("https://example.test/clip.mp4");
    // No snake_case keys leak onto the entity.
    expect((u as Record<string, unknown>).media_count).toBeUndefined();
    expect((u as Record<string, unknown>).created_at).toBeUndefined();
  });

  test("derives mediaCount from media length when media_count absent", () => {
    const u = mapUnit({
      id: "x",
      format: "image",
      title: "t",
      blurb: "b",
      media: [{ src: "a", kind: "image", aspect: "1 / 1" }, { src: "b", kind: "image", aspect: "1 / 1" }],
    });
    expect(u.mediaCount).toBe(2);
  });
});

describe("mapBlock", () => {
  test("merges the recipe `data` payload (body/artifact/params) onto the block", () => {
    const row = {
      id: "noir-grade",
      kind: "recipe",
      name: "Noir / Analog-Horror Grade",
      blurb: "A cold, low-light color grade.",
      sub: null,
      refs: [],
      created_at: "2026-05-31T22:08:47.565422+00:00",
      recipe_kind: "ffmpeg",
      data: {
        body: "## What it is\n\nA color grade.",
        params: { preset: "analog-horror", saturation: 0.78 },
        artifact: "ffmpeg -i in.mp4 -vf eq=... out.mp4",
      },
    };
    const b = mapBlock(row);
    expect(b.kind).toBe("recipe");
    expect(b.id).toBe("noir-grade");
    expect(b.recipeKind).toBe("ffmpeg"); // recipe_kind → recipeKind
    expect(b.createdAt).toBe("2026-05-31T22:08:47.565422+00:00");
    // The `data` keys are merged onto the entity.
    expect(b.body).toContain("color grade");
    expect(b.artifact).toContain("ffmpeg");
    expect((b.params as Record<string, unknown>).preset).toBe("analog-horror");
    // The raw `data` wrapper does not survive on the entity.
    expect((b as Record<string, unknown>).data).toBeUndefined();
    expect((b as Record<string, unknown>).recipe_kind).toBeUndefined();
  });

  test("an asset block carries its sub and no data payload", () => {
    const b = mapBlock({
      id: "ghost-mascot",
      kind: "asset",
      name: "Ghost mascot",
      blurb: "A reusable character.",
      sub: "character",
      refs: ["refs/ghost.png"],
    });
    expect(b.kind).toBe("asset");
    expect(b.sub).toBe("character");
    expect(b.refs).toEqual(["refs/ghost.png"]);
    expect(b.recipeKind).toBeUndefined();
  });
});

describe("mapBlueprint", () => {
  test("maps unit_id→unitId and merges the `data` axes", () => {
    const row = {
      unit_id: "choose-magicschool",
      created_at: "2026-06-01T00:00:00+00:00",
      data: {
        schemaVersion: 1,
        assets: [{ kind: "location", path: "assets/hub.png", slot: "hub", bytes: 2146006 }],
        prompts: [{ slot: "s02", text: "a prompt", stage: "image" }],
        costRollupUsd: 1.23,
      },
    };
    const bp = mapBlueprint(row);
    expect(bp.unitId).toBe("choose-magicschool"); // unit_id → unitId
    expect(bp.createdAt).toBe("2026-06-01T00:00:00+00:00");
    expect(bp.schemaVersion).toBe(1);
    expect(Array.isArray(bp.assets)).toBe(true);
    expect((bp.assets as unknown[]).length).toBe(1);
    expect(bp.costRollupUsd).toBe(1.23);
    expect((bp as Record<string, unknown>).unit_id).toBeUndefined();
    expect((bp as Record<string, unknown>).data).toBeUndefined();
  });
});
