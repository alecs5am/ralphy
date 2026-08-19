import { test, expect } from "bun:test";
import {
  PUBLISH_TARGETS,
  isPublishTarget,
  parseTargets,
  buildDevtoEntry,
} from "../../cli/lib/publish/mapping.js";
import type { UnitManifest } from "../../cli/lib/schemas/unit.js";

// A minimal article unit — only the fields buildDevtoEntry reads.
const articleManifest = {
  slug: "turn-x-into-y",
  format: "article",
  media: ["article.md", "cover.png"],
  title: "Fallback title",
  article: {
    title: "How to turn X into Y",
    description: "desc",
    slug: "turn-x-into-y",
    tags: ["ai", "devtools", "productivity", "video", "extra"],
    canonicalUrl: "https://example.com/x",
    hero: "cover.png",
  },
} as unknown as UnitManifest;

test("devto is a publish target", () => {
  expect(PUBLISH_TARGETS).toContain("devto");
  expect(isPublishTarget("devto")).toBe(true);
  expect(parseTargets("devto,x")).toEqual(["devto", "x"]);
});

test("buildDevtoEntry emits the Postiz dev.to settings shape (#527)", () => {
  const entry = buildDevtoEntry("intg-1", articleManifest, "# Body\n\ntext", {
    id: "img-1",
    path: "https://uploads.postiz.com/a.png",
  });
  expect(entry.integration.id).toBe("intg-1");
  expect(entry.value[0]?.content).toContain("# Body");
  const s = entry.settings as Record<string, unknown>;
  expect(s.__type).toBe("devto");
  expect(s.title).toBe("How to turn X into Y");
  expect(s.canonical).toBe("https://example.com/x");
  expect(s.main_image).toEqual({ id: "img-1", path: "https://uploads.postiz.com/a.png" });
  // Tags (#551): Postiz's DevToTagsSettingsDto validates `value` as a number and
  // `label` as a string; only `label` reaches the dev.to API. Sourced from
  // article.tags, capped at 4 (the fifth, "extra", is dropped), value = index.
  expect(s.tags).toEqual([
    { value: 0, label: "ai" },
    { value: 1, label: "devtools" },
    { value: 2, label: "productivity" },
    { value: 3, label: "video" },
  ]);
});

test("buildDevtoEntry falls back to the unit title and omits main_image without a hero", () => {
  const m = { slug: "s", format: "article", media: ["b.md"], title: "T" } as unknown as UnitManifest;
  const entry = buildDevtoEntry("i", m, "body");
  const s = entry.settings as Record<string, unknown>;
  expect(s.title).toBe("T");
  expect(s.main_image).toBeUndefined();
  expect(s.canonical).toBeUndefined();
  // No article frontmatter → no tags key at all.
  expect(s.tags).toBeUndefined();
});
