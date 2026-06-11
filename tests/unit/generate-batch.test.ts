// Unit tests for cli/lib/generate-batch.ts (#024) — pure parsers / builders.
//
// Covers:
//   - parseBatchJsonl: shape validation, blank/# comments skipped, error
//     messages name the offending line number.
//   - buildVariantItems: slot-name derivation (<base>-v1..vN) + default
//     propagation (refs / model / negative).
//   - buildBatchDryRun: shape contract for the --dry-run JSON output across
//     batch / variants / image-batch.

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  parseBatchJsonl,
  buildVariantItems,
  buildBatchDryRun,
  readPromptsDir,
} from "../../cli/lib/generate-batch.js";
import { setRoot } from "../../cli/lib/paths.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// buildBatchDryRun resolves would_write paths through the data root — pin it
// to a fresh tmp root so the assertions don't inherit the developer machine's
// active workspace (`.ralphy/config.json` activeWorkspace leaks otherwise).
let isolatedRoot: string;
const originalCwd = process.cwd();

beforeAll(() => {
  isolatedRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-batch-"));
  setRoot(isolatedRoot);
});

afterAll(() => {
  setRoot(originalCwd);
  fs.rmSync(isolatedRoot, { recursive: true, force: true });
});

describe("parseBatchJsonl", () => {
  test("parses one object per non-blank, non-comment line", () => {
    const raw = [
      "# leading comment",
      "",
      `{"slot": "scene-01", "prompt": "a cat"}`,
      `{"slot": "scene-02", "prompt": "a dog", "refs": ["x.png"]}`,
      "# trailing comment",
      "",
    ].join("\n");
    const items = parseBatchJsonl(raw);
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({ slot: "scene-01", prompt: "a cat" });
    expect(items[1]).toEqual({ slot: "scene-02", prompt: "a dog", refs: ["x.png"] });
  });

  test("forwards optional model + negative on the line", () => {
    const raw = `{"slot": "scene-01", "prompt": "x", "model": "openai/gpt-5.4-image-2", "negative": "no hands"}`;
    const items = parseBatchJsonl(raw);
    expect(items[0]?.model).toBe("openai/gpt-5.4-image-2");
    expect(items[0]?.negative).toBe("no hands");
  });

  test("raises a line-numbered error for malformed JSON", () => {
    const raw = `{"slot": "ok", "prompt": "x"}\nnot-json-here`;
    expect(() => parseBatchJsonl(raw)).toThrow(/line 2/);
  });

  test("raises a line-numbered error for missing slot", () => {
    const raw = `{"prompt": "x"}`;
    expect(() => parseBatchJsonl(raw)).toThrow(/line 1.*slot/);
  });

  test("raises a line-numbered error for missing prompt", () => {
    const raw = `{"slot": "scene-01"}`;
    expect(() => parseBatchJsonl(raw)).toThrow(/line 1.*prompt/);
  });

  test("raises when refs is not an array", () => {
    const raw = `{"slot": "s", "prompt": "p", "refs": "x.png"}`;
    expect(() => parseBatchJsonl(raw)).toThrow(/refs.*array/);
  });

  test("raises on a top-level array (only objects are valid lines)", () => {
    const raw = `["nope"]`;
    expect(() => parseBatchJsonl(raw)).toThrow(/expected an object/);
  });
});

describe("buildVariantItems", () => {
  test("derives <base>-v1..vN slot names", () => {
    const items = buildVariantItems({
      baseSlot: "scene-01",
      prompt: "hi",
      variants: 3,
    });
    expect(items.map((it) => it.slot)).toEqual([
      "scene-01-v1",
      "scene-01-v2",
      "scene-01-v3",
    ]);
  });

  test("propagates refs / model / negative as per-item defaults", () => {
    const items = buildVariantItems({
      baseSlot: "scene-01",
      prompt: "hi",
      variants: 2,
      refs: ["ref-a.png"],
      model: "google/gemini-3-pro-image-preview",
      negative: "no text",
    });
    for (const it of items) {
      expect(it.refs).toEqual(["ref-a.png"]);
      expect(it.model).toBe("google/gemini-3-pro-image-preview");
      expect(it.negative).toBe("no text");
    }
  });

  test("variants=1 still produces a -v1 suffix (consistent with --variants 1 callers)", () => {
    const items = buildVariantItems({ baseSlot: "hero", prompt: "p", variants: 1 });
    expect(items).toEqual([{ slot: "hero-v1", prompt: "p" }]);
  });
});

describe("buildBatchDryRun", () => {
  test("emits the shape contract (mode/model/count/cost/eta/items)", () => {
    const items = buildVariantItems({
      baseSlot: "scene-01",
      prompt: "p",
      variants: 3,
    });
    const dr = buildBatchDryRun({
      defaultModel: "google/gemini-3-pro-image-preview",
      items,
      projectId: "test-001",
    });
    expect(dr.dryRun).toBe(true);
    expect(dr.mode).toBe("batch");
    expect(dr.count).toBe(3);
    expect(dr.model).toBe("google/gemini-3-pro-image-preview");
    expect(dr.cost_estimate_usd).toBeGreaterThan(0);
    expect(dr.eta_seconds).toBeGreaterThan(0);
    expect(dr.items).toHaveLength(3);
    expect(dr.items[0]?.would_write).toContain("workspaces/default/projects/test-001/artifacts/images/scene-01-v1.png");
  });

  test("respects per-item model override when summing cost", () => {
    const items = [
      { slot: "a", prompt: "p", model: "google/gemini-3-pro-image-preview" },
      { slot: "b", prompt: "p", model: "openai/gpt-5.4-image-2" },
    ];
    const dr = buildBatchDryRun({
      defaultModel: "google/gemini-3-pro-image-preview",
      items,
      projectId: "test-001",
    });
    // gpt-5.4-image-2 is more expensive than gemini-3-pro-image-preview, so
    // the per-item override should bubble into the rollup cost.
    expect(dr.items[1]?.est_usd).toBeGreaterThan(dr.items[0]?.est_usd ?? 0);
    expect(dr.cost_estimate_usd).toBeCloseTo(
      (dr.items[0]?.est_usd ?? 0) + (dr.items[1]?.est_usd ?? 0),
      4,
    );
  });
});

describe("readPromptsDir", () => {
  test("each *.txt becomes a slot named by stem; alphabetical order", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-prompts-dir-"));
    try {
      fs.writeFileSync(path.join(dir, "scene-02.txt"), "second prompt\n");
      fs.writeFileSync(path.join(dir, "scene-01.txt"), "first prompt\n");
      fs.writeFileSync(path.join(dir, "ignored.md"), "not a txt\n");
      fs.writeFileSync(path.join(dir, "empty.txt"), "   \n");
      const items = await readPromptsDir(dir);
      expect(items.map((it) => it.slot)).toEqual(["scene-01", "scene-02"]);
      expect(items[0]?.prompt).toBe("first prompt");
      expect(items[1]?.prompt).toBe("second prompt");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
