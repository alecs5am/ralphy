// #574 — the curated model registry: MODELS.md index + docs/models/<kind>.md
// detail, read one model at a time by `ralphy models show <id>`.
//
// These tests keep the single source of truth honest: every index row has a
// detail section, every detail section has an index row, every file under
// docs/models/ is embedded into the CLI, and the index stays short enough that
// reading it is cheaper than the 41k-char pre-split file it replaced.

import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import {
  DETAIL_DOCS,
  MODEL_KINDS,
  detailModelIds,
  findDroppedEntry,
  findRegistryEntry,
  kindNotes,
  listRegistry,
  mentionsModel,
  parseIndex,
  parseSections,
  splitItems,
} from "../../cli/lib/models/registry.js";

const REPO = path.resolve(import.meta.dir, "..", "..");

describe("models registry — index and detail agree (#574)", () => {
  test("every index row has a `## \\`<id>\\`` section in its kind's detail file", () => {
    const sections = detailModelIds();
    const missing = listRegistry().filter(
      (row) => !sections.some((s) => s.id === row.id && s.source === row.source),
    );
    expect(missing.map((m) => m.id)).toEqual([]);
  });

  test("every detail section has an index row (no orphan model sections)", () => {
    const ids = new Set(listRegistry().map((r) => r.id));
    expect(detailModelIds().filter((s) => !ids.has(s.id))).toEqual([]);
  });

  test("index ids are unique and every kind has at least one model", () => {
    const rows = listRegistry();
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
    for (const kind of MODEL_KINDS) {
      expect(rows.some((r) => r.kind === kind)).toBe(true);
    }
  });

  test("every docs/models/*.md file on disk is embedded in the CLI", () => {
    const onDisk = fs
      .readdirSync(path.join(REPO, "docs", "models"))
      .filter((f) => f.endsWith(".md"))
      .map((f) => `docs/models/${f}`)
      .sort();
    expect(Object.keys(DETAIL_DOCS).sort()).toEqual(onDisk);
  });

  test("embedded text matches the files on disk", () => {
    for (const [rel, text] of Object.entries(DETAIL_DOCS)) {
      expect(text).toBe(fs.readFileSync(path.join(REPO, rel), "utf8"));
    }
  });

  test("MODELS.md stays a short index (well under the 41k-char pre-split file)", () => {
    const bytes = fs.statSync(path.join(REPO, "MODELS.md")).size;
    expect(bytes).toBeLessThan(12_000);
  });
});

describe("models registry — lookup", () => {
  test("resolves an exact id, an alias, and a bare ElevenLabs model id", () => {
    expect(findRegistryEntry("kwaivgi/kling-v3.0-pro")?.id).toBe("kwaivgi/kling-v3.0-pro");
    expect(findRegistryEntry("nano banana pro")?.id).toBe("google/gemini-3-pro-image-preview");
    expect(findRegistryEntry("eleven_v3")?.id).toBe("elevenlabs/eleven_v3");
    expect(findRegistryEntry("does-not/exist")).toBeNull();
  });

  test("an entry carries role + price from the index and detail from its section", () => {
    const e = findRegistryEntry("openai/gpt-5.4-image-2")!;
    expect(e.kind).toBe("image");
    expect(e.price).toContain("$0.20");
    expect(e.source).toBe("docs/models/image.md");
    expect(e.detail).toContain("Ignores in-prompt size hints");
    // Role is plain text (markdown bold stripped).
    expect(listRegistry({ kind: "image" })[0]!.role.startsWith("Default")).toBe(true);
  });

  test("a cross-model shared rule reaches every model it names", () => {
    // Video lesson 9 (concurrency caps) lives once, in video.md's shared notes,
    // and names image, video and music models.
    for (const id of ["openai/gpt-5.4-image-2", "kwaivgi/kling-v3.0-pro", "elevenlabs/music_v1"]) {
      const related = findRegistryEntry(id)!.related;
      expect(related.some((r) => r.from.includes("Concurrency caps"))).toBe(true);
    }
    // The tried-and-dropped table surfaces for an active model it names.
    const seedance = findRegistryEntry("bytedance/seedance-2.0")!;
    expect(seedance.related.some((r) => r.from.startsWith("dropped.md"))).toBe(true);
  });

  test("mentions require code font and an exact id boundary", () => {
    expect(mentionsModel("use `bytedance/seedance-2.0` here", "bytedance/seedance-2.0")).toBe(true);
    expect(mentionsModel("`bytedance/seedance-2.0-fast` only", "bytedance/seedance-2.0")).toBe(false);
    expect(mentionsModel("`kwaivgi/kling-v3.0-pro --audio` slips", "kwaivgi/kling-v3.0-pro")).toBe(true);
    expect(mentionsModel("`openrouter:openai/gpt-5.4-image-2` cap", "openai/gpt-5.4-image-2")).toBe(true);
    expect(mentionsModel("`eleven_multilingual_v2` voice", "elevenlabs/eleven_multilingual_v2")).toBe(true);
  });

  test("a dropped id answers from docs/models/dropped.md", () => {
    const d = findDroppedEntry("fal-ai/lyria2")!;
    expect(d.status).toBe("dropped");
    expect(d.mentions.length).toBeGreaterThan(0);
    expect(findDroppedEntry("not-a/model")).toBeNull();
  });

  test("kind notes return only the shared sections of one kind", () => {
    const notes = kindNotes("video");
    expect(notes).toContain("Routing rules");
    expect(notes).not.toContain("## `kwaivgi/kling-v3.0-pro`");
  });

  test("a model entry is a small slice of the registry", () => {
    const bytes = JSON.stringify(findRegistryEntry("kwaivgi/kling-v3.0-pro")).length;
    expect(bytes).toBeLessThan(15_000);
  });
});

describe("models registry — parsers", () => {
  test("parseIndex reads `| `id` | role | price |` rows under kind headings", () => {
    const rows = parseIndex(
      "# x\n\n## Image\n\n| Model | Role | Price |\n|---|---|---|\n| `a/b` | **Default** — x | ~$1 |\n\n## Notes\n\n| `c/d` | y | z |\n",
    );
    expect(rows).toEqual([{ id: "a/b", kind: "image", role: "Default — x", price: "~$1", source: "docs/models/image.md" }]);
  });

  test("parseSections separates model sections from shared notes and ignores fenced headings", () => {
    const s = parseSections("# T\n\n## Shared notes\n\nx\n\n## `a/b`\n\n```\n## not a heading\n```\n");
    expect(s.map((x) => [x.heading, x.modelId])).toEqual([["Shared notes", null], ["`a/b`", "a/b"]]);
    expect(s[1]!.body).toContain("## not a heading");
  });

  test("splitItems yields list items with continuations and header-prefixed table rows", () => {
    const items = splitItems("### Sub\n\n9. item\n   - child\n   tail\n10. next\n\n| A | B |\n|---|---|\n| 1 | 2 |\n");
    expect(items.map((i) => i.text)).toEqual(["9. item\n   - child\n   tail", "10. next", "| A | B |\n| 1 | 2 |"]);
    expect(items.every((i) => i.subheading === "Sub")).toBe(true);
  });
});
