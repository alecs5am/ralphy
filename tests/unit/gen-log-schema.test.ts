// Issue #032: canonical generations.jsonl schema + read-side normalizer.
//
// Tests cover:
// - normalizeGenerationEntry() coerces legacy shapes (costUsd, top-level slot,
//   missing model/attempt) to canonical (cost_usd, input.slot, model, attempt=1).
// - logGeneration() always emits canonical keys: cost_usd not costUsd, model
//   alongside endpoint, attempt defaulted to 1, input.slot mirrored from
//   top-level slot, input.project from the projectId arg.
// - readGenerations() round-trips legacy rows through the normalizer.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import {
  logGeneration,
  readGenerations,
  normalizeGenerationEntry,
  type RawGenerationEntry,
} from "../../cli/lib/gen-log.js";
import { setRoot } from "../../cli/lib/paths.js";

let tmpRoot: string;
let origRoot: string;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-gen-log-"));
  fs.mkdirSync(path.join(tmpRoot, ".ralphy", "workspaces", "default", "projects", "test-001", "logs"), {
    recursive: true,
  });
  origRoot = process.cwd();
  setRoot(tmpRoot);
});

afterEach(() => {
  setRoot(origRoot);
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  } catch {
    /* best-effort cleanup */
  }
});

describe("normalizeGenerationEntry", () => {
  test("passes a canonical row through unchanged (minus default attempt=1)", () => {
    const canonical: RawGenerationEntry = {
      timestamp: "2026-05-29T10:00:00.000Z",
      provider: "openrouter",
      model: "google/gemini-3-pro-image-preview",
      endpoint: "google/gemini-3-pro-image-preview",
      kind: "image",
      input: { slot: "scene-01-bg", project: "test-001", prompt: "hello" },
      output: { local: "/tmp/out.png" },
      status: "ok",
      latency_ms: 1234,
      cost_usd: 0.15,
      attempt: 1,
    };
    const norm = normalizeGenerationEntry(canonical);
    expect(norm.cost_usd).toBe(0.15);
    expect(norm.model).toBe("google/gemini-3-pro-image-preview");
    expect(norm.endpoint).toBe("google/gemini-3-pro-image-preview");
    expect(norm.input.slot).toBe("scene-01-bg");
    expect(norm.input.project).toBe("test-001");
    expect(norm.attempt).toBe(1);
  });

  test("coerces legacy `costUsd` → `cost_usd`", () => {
    const legacy = {
      timestamp: "2026-05-19T10:00:00.000Z",
      provider: "openrouter",
      endpoint: "openai/gpt-5.4-image-2",
      kind: "image",
      input: { prompt: "hi" },
      status: "ok",
      costUsd: 0.2,
    } as RawGenerationEntry;
    const norm = normalizeGenerationEntry(legacy);
    expect(norm.cost_usd).toBe(0.2);
  });

  test("mirrors top-level `slot` into `input.slot` when missing", () => {
    const legacy: RawGenerationEntry = {
      timestamp: "2026-05-19T10:00:00.000Z",
      provider: "openrouter",
      endpoint: "google/gemini-3-pro-image-preview",
      kind: "image",
      slot: "scene-03-product",
      input: { prompt: "hi" },
      status: "ok",
      cost_usd: 0.15,
    };
    const norm = normalizeGenerationEntry(legacy);
    expect(norm.input.slot).toBe("scene-03-product");
    expect(norm.slot).toBe("scene-03-product");
  });

  test("preserves an explicit `input.slot` over top-level when both are present", () => {
    const row: RawGenerationEntry = {
      timestamp: "2026-05-19T10:00:00.000Z",
      provider: "openrouter",
      endpoint: "x",
      kind: "image",
      slot: "outer-slot",
      input: { slot: "inner-slot" },
      status: "ok",
    };
    const norm = normalizeGenerationEntry(row);
    expect(norm.input.slot).toBe("inner-slot");
  });

  test("falls back model → endpoint when `model` key is missing", () => {
    const legacy: RawGenerationEntry = {
      timestamp: "2026-05-19T10:00:00.000Z",
      provider: "openrouter",
      endpoint: "tts/eleven_multilingual_v2",
      kind: "voiceover",
      input: {},
      status: "ok",
    };
    const norm = normalizeGenerationEntry(legacy);
    expect(norm.model).toBe("tts/eleven_multilingual_v2");
    expect(norm.endpoint).toBe("tts/eleven_multilingual_v2");
  });

  test("defaults `attempt` to 1 when missing", () => {
    const legacy: RawGenerationEntry = {
      timestamp: "2026-05-19T10:00:00.000Z",
      provider: "openrouter",
      endpoint: "x",
      kind: "image",
      input: {},
      status: "ok",
    };
    expect(normalizeGenerationEntry(legacy).attempt).toBe(1);
  });

  test("never mutates the input row", () => {
    const legacy: RawGenerationEntry = {
      timestamp: "t",
      provider: "openrouter",
      endpoint: "x",
      kind: "image",
      slot: "abc",
      input: { prompt: "hi" },
      status: "ok",
      costUsd: 0.1,
    } as RawGenerationEntry;
    const snapshot = JSON.parse(JSON.stringify(legacy));
    normalizeGenerationEntry(legacy);
    // The input object reference is shared into the return value, but the
    // original top-level keys should still be the same after the call.
    // (We do mutate `input` to mirror slot — that is documented.)
    expect(legacy.costUsd).toBe(snapshot.costUsd);
    expect(legacy.slot).toBe(snapshot.slot);
    expect(legacy.provider).toBe(snapshot.provider);
  });
});

describe("logGeneration (writer)", () => {
  test("emits canonical keys only — cost_usd, model, attempt; mirrors slot/project into input", async () => {
    await logGeneration("test-001", {
      provider: "openrouter",
      model: "google/gemini-3-pro-image-preview",
      endpoint: "google/gemini-3-pro-image-preview",
      kind: "image",
      slot: "scene-01-bg-image",
      input: { prompt: "a cat" },
      status: "ok",
      cost_usd: 0.15,
      latency_ms: 1000,
    });

    const logFile = path.join(
      tmpRoot,
      ".ralphy",
      "workspaces",
      "default",
      "projects",
      "test-001",
      "logs",
      "generations.jsonl",
    );
    const raw = fs.readFileSync(logFile, "utf-8").trim();
    const row = JSON.parse(raw);

    // canonical keys present
    expect(row.cost_usd).toBe(0.15);
    expect(row.model).toBe("google/gemini-3-pro-image-preview");
    expect(row.endpoint).toBe("google/gemini-3-pro-image-preview");
    expect(row.provider).toBe("openrouter");
    expect(row.kind).toBe("image");
    expect(row.attempt).toBe(1);

    // input.slot mirrored from top-level slot
    expect(row.input.slot).toBe("scene-01-bg-image");
    // input.project mirrored from the projectId arg
    expect(row.input.project).toBe("test-001");

    // legacy keys MUST NOT appear
    expect(row.costUsd).toBeUndefined();
  });

  test("falls back model = endpoint when caller did not pass model", async () => {
    await logGeneration("test-001", {
      provider: "ffmpeg",
      endpoint: "ffprobe/project-assets",
      kind: "other",
      input: {},
      status: "ok",
    });

    const logFile = path.join(
      tmpRoot,
      ".ralphy",
      "workspaces",
      "default",
      "projects",
      "test-001",
      "logs",
      "generations.jsonl",
    );
    const row = JSON.parse(fs.readFileSync(logFile, "utf-8").trim());
    expect(row.model).toBe("ffprobe/project-assets");
    expect(row.endpoint).toBe("ffprobe/project-assets");
  });
});

describe("readGenerations (read-side normalization)", () => {
  test("normalizes a hand-written legacy row (costUsd, top-level slot, no model)", async () => {
    const logFile = path.join(
      tmpRoot,
      ".ralphy",
      "workspaces",
      "default",
      "projects",
      "test-001",
      "logs",
      "generations.jsonl",
    );
    // Simulate a legacy row written by an old version of the CLI.
    const legacyRow = {
      timestamp: "2026-05-19T10:00:00.000Z",
      provider: "openrouter",
      endpoint: "openai/gpt-5.4-image-2",
      kind: "image",
      slot: "scene-04-product",
      input: { prompt: "old shape" },
      output: { local: "/tmp/old.png" },
      status: "ok",
      costUsd: 0.2,
    };
    fs.writeFileSync(logFile, JSON.stringify(legacyRow) + "\n");

    const rows = await readGenerations("test-001");
    expect(rows).toHaveLength(1);
    const r = rows[0]!;
    expect(r.cost_usd).toBe(0.2);
    expect(r.model).toBe("openai/gpt-5.4-image-2");
    expect(r.input.slot).toBe("scene-04-product");
    expect(r.attempt).toBe(1);
  });

  test("a mixed file (legacy + canonical) reads as 100% canonical", async () => {
    const logFile = path.join(
      tmpRoot,
      ".ralphy",
      "workspaces",
      "default",
      "projects",
      "test-001",
      "logs",
      "generations.jsonl",
    );
    const legacyRow = {
      timestamp: "2026-05-19T10:00:00.000Z",
      provider: "openrouter",
      endpoint: "x",
      kind: "image",
      slot: "old-slot",
      input: { prompt: "old" },
      status: "ok",
      costUsd: 0.1,
    };
    fs.writeFileSync(logFile, JSON.stringify(legacyRow) + "\n");
    // Append a canonical row via the writer.
    await logGeneration("test-001", {
      provider: "openrouter",
      model: "google/gemini-3-pro-image-preview",
      endpoint: "google/gemini-3-pro-image-preview",
      kind: "image",
      slot: "new-slot",
      input: { prompt: "new" },
      status: "ok",
      cost_usd: 0.15,
    });

    const rows = await readGenerations("test-001");
    expect(rows).toHaveLength(2);
    for (const r of rows) {
      expect(typeof r.cost_usd).toBe("number");
      expect(typeof r.model).toBe("string");
      expect(r.attempt).toBe(1);
      expect(r.input.slot).toBeDefined();
    }
    expect(rows[0]!.input.slot).toBe("old-slot");
    expect(rows[1]!.input.slot).toBe("new-slot");
  });
});
