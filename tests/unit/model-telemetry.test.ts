// Issue #424: model-router telemetry summarizer + recommend verb.
//
// Tests use FIXTURE logs (no network, no provider calls):
// - summarizeModelOutcomes() aggregates generations.jsonl by (model, mode, task)
//   and JOINS production-plan.json (contentMode.mode) + eval.json (verdict/score).
// - recommendModel() ranks observed buckets and falls back to the MODELS.md
//   default (saying so) when telemetry is thin.
// - logModelOverride() appends an auditable override line.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import { setRoot } from "../../cli/lib/paths.js";
import {
  summarizeModelOutcomes,
  recommendModel,
  logModelOverride,
  overridesPath,
  MODELS_MD_DEFAULTS,
} from "../../cli/lib/models/telemetry.js";

let tmpRoot: string;
let origRoot: string;

function projDir(id: string): string {
  return path.join(tmpRoot, ".ralphy", "workspaces", "default", "projects", id);
}

function writeRegistry(ids: string[]) {
  const projects: Record<string, unknown> = {};
  for (const id of ids) projects[id] = { id, workspace: "default" };
  fs.mkdirSync(path.join(tmpRoot, ".ralphy"), { recursive: true });
  fs.writeFileSync(
    path.join(tmpRoot, ".ralphy", "registry.json"),
    JSON.stringify({ projects }, null, 2),
  );
}

function seedProject(
  id: string,
  opts: {
    mode?: string;
    eval?: { verdict: "pass" | "warn" | "fail"; score: number };
    rows: Array<Record<string, unknown>>;
  },
) {
  const dir = projDir(id);
  fs.mkdirSync(path.join(dir, "logs"), { recursive: true });
  if (opts.mode) {
    fs.writeFileSync(
      path.join(dir, "production-plan.json"),
      JSON.stringify({ contentMode: { mode: opts.mode } }),
    );
  }
  if (opts.eval) {
    fs.writeFileSync(
      path.join(dir, "eval.json"),
      JSON.stringify({ scoring: { verdict: opts.eval.verdict, score: opts.eval.score } }),
    );
  }
  const lines = opts.rows.map((r) => JSON.stringify(r)).join("\n");
  fs.writeFileSync(path.join(dir, "logs", "generations.jsonl"), lines + "\n");
}

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-telemetry-"));
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

describe("summarizeModelOutcomes", () => {
  test("aggregates by (model, mode, task), joins plan mode + eval", async () => {
    writeRegistry(["ugc-001"]);
    seedProject("ugc-001", {
      mode: "ugc-review",
      eval: { verdict: "pass", score: 82 },
      rows: [
        { model: "kwaivgi/kling-v3.0-pro", kind: "video", task: "i2v", status: "ok", cost_usd: 0.7 },
        { model: "kwaivgi/kling-v3.0-pro", kind: "video", task: "i2v", status: "ok", cost_usd: 0.7 },
        { model: "kwaivgi/kling-v3.0-pro", kind: "video", task: "i2v", status: "error", failureClass: "moderation" },
        // mode falls back to plan mode when the row omits it
        { model: "google/gemini-3-pro-image-preview", kind: "image", task: "scene-anchor", status: "ok", cost_usd: 0.15 },
      ],
    });

    const summary = await summarizeModelOutcomes();
    expect(summary.projectCount).toBe(1);
    expect(summary.rowCount).toBe(4);

    const kling = summary.outcomes.find(
      (o) => o.model === "kwaivgi/kling-v3.0-pro" && o.task === "i2v",
    )!;
    expect(kling.mode).toBe("ugc-review");
    expect(kling.attempts).toBe(3);
    expect(kling.ok).toBe(2);
    expect(kling.okRate).toBeCloseTo(0.6667, 3);
    expect(kling.failureRate).toBeCloseTo(0.3333, 3);
    expect(kling.failureByClass).toEqual({ moderation: 1 });
    expect(kling.avgCostUsd).toBeCloseTo(0.7, 4);
    expect(kling.avgEvalScore).toBe(82);
    expect(kling.recentEvalVerdict).toBe("pass");
    expect(kling.sampleProjects).toBe(1);
  });

  test("a row's own mode overrides the project plan mode", async () => {
    writeRegistry(["mix-001"]);
    seedProject("mix-001", {
      mode: "tutorial-ugc",
      rows: [
        { model: "m-a", kind: "image", status: "ok", mode: "ugc-review" },
        { model: "m-a", kind: "image", status: "ok" }, // → tutorial-ugc from plan
      ],
    });
    const summary = await summarizeModelOutcomes();
    const modes = summary.outcomes.map((o) => o.mode).sort();
    expect(modes).toEqual(["tutorial-ugc", "ugc-review"]);
  });

  test("never throws on missing files; old rows without #424 fields still aggregate", async () => {
    writeRegistry(["bare-001", "ghost-002"]); // ghost-002 has no dir on disk
    seedProject("bare-001", {
      // no plan, no eval, legacy-shaped rows (no mode/task/failureClass)
      rows: [{ provider: "openrouter", endpoint: "x", kind: "image", status: "ok", costUsd: 0.1 }],
    });
    const summary = await summarizeModelOutcomes();
    expect(summary.rowCount).toBe(1);
    const o = summary.outcomes[0]!;
    expect(o.mode).toBe("unknown");
    expect(o.task).toBe("image"); // falls back to kind
    expect(o.avgEvalScore).toBeNull();
    expect(o.recentEvalVerdict).toBeNull();
  });

  test("single-project scope reads only that project", async () => {
    writeRegistry(["a-001", "b-002"]);
    seedProject("a-001", { mode: "ugc-review", rows: [{ model: "m", kind: "video", status: "ok" }] });
    seedProject("b-002", { mode: "tv-ad", rows: [{ model: "m", kind: "video", status: "ok" }] });
    const summary = await summarizeModelOutcomes({ projectId: "a-001" });
    expect(summary.projectCount).toBe(1);
    expect(summary.outcomes.every((o) => o.mode === "ugc-review")).toBe(true);
  });
});

describe("recommendModel", () => {
  test("recommends the observed winner when a bucket clears the sample threshold", async () => {
    writeRegistry(["ugc-001"]);
    seedProject("ugc-001", {
      mode: "ugc-review",
      eval: { verdict: "pass", score: 90 },
      rows: [
        // winner: 3 ok i2v
        { model: "kwaivgi/kling-v3.0-pro", kind: "video", task: "i2v", status: "ok" },
        { model: "kwaivgi/kling-v3.0-pro", kind: "video", task: "i2v", status: "ok" },
        { model: "kwaivgi/kling-v3.0-pro", kind: "video", task: "i2v", status: "ok" },
        // loser: 3 i2v but 2 fail
        { model: "bytedance/seedance-2.0", kind: "video", task: "i2v", status: "error", failureClass: "moderation" },
        { model: "bytedance/seedance-2.0", kind: "video", task: "i2v", status: "error", failureClass: "moderation" },
        { model: "bytedance/seedance-2.0", kind: "video", task: "i2v", status: "ok" },
      ],
    });
    const summary = await summarizeModelOutcomes();
    const rec = recommendModel(summary, { mode: "ugc-review", task: "i2v" });
    expect(rec.basis).toBe("observed");
    expect(rec.model).toBe("kwaivgi/kling-v3.0-pro");
    expect(rec.reason).toContain("100% ok");
    expect(rec.alternatives.map((a) => a.model)).toContain("bytedance/seedance-2.0");
  });

  test("falls back to the MODELS.md default (and says so) when telemetry is empty", async () => {
    writeRegistry([]);
    const summary = await summarizeModelOutcomes();
    expect(summary.rowCount).toBe(0);
    const rec = recommendModel(summary, { mode: "ugc-review", kind: "video" });
    expect(rec.basis).toBe("default");
    expect(rec.model).toBe(MODELS_MD_DEFAULTS.video);
    expect(rec.reason).toContain("MODELS.md default");
    expect(rec.reason).toContain("no telemetry yet");
  });

  test("falls back to the default when the only bucket is below the sample threshold", async () => {
    writeRegistry(["ugc-001"]);
    seedProject("ugc-001", {
      mode: "ugc-review",
      rows: [{ model: "some/experimental-model", kind: "video", task: "i2v", status: "ok" }],
    });
    const summary = await summarizeModelOutcomes();
    const rec = recommendModel(summary, { mode: "ugc-review", kind: "video" });
    expect(rec.basis).toBe("default");
    expect(rec.model).toBe(MODELS_MD_DEFAULTS.video);
    expect(rec.reason).toContain("< 3 threshold");
  });
});

describe("logModelOverride", () => {
  test("appends an auditable override line", async () => {
    writeRegistry([]);
    const entry = await logModelOverride({
      recommended: "kwaivgi/kling-v3.0-pro",
      chosen: "bytedance/seedance-2.0",
      reason: "stylized horror motion needs seedance physics",
      query: { mode: "tv-ad", task: "i2v" },
      projectId: "horror-001",
    });
    expect(entry.timestamp).toBeTruthy();

    const file = overridesPath();
    const lines = fs.readFileSync(file, "utf8").trim().split("\n");
    expect(lines).toHaveLength(1);
    const row = JSON.parse(lines[0]!);
    expect(row.recommended).toBe("kwaivgi/kling-v3.0-pro");
    expect(row.chosen).toBe("bytedance/seedance-2.0");
    expect(row.query.mode).toBe("tv-ad");

    // append-only: a second override adds a line, never rewrites
    await logModelOverride({
      recommended: "a",
      chosen: "b",
      reason: "second",
      query: { mode: "ugc-review" },
    });
    expect(fs.readFileSync(file, "utf8").trim().split("\n")).toHaveLength(2);
  });
});
