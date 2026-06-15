// Variant-tournament tests (#421) — the DECISION layer on existing variants.
//
// `buildVariantMatrix` + `runTournament` are PURE (no model call, no disk), so
// the bulk of this file asserts on them inline with an INJECTED scorer; one
// smoke test drives the `ralphy batch tournament <id>` verb against a fixture
// batch in the cheap --manual mode (`bun run cli/index.ts`, NOT bunx tsx — the
// latter breaks on bun:sqlite per the test discipline). The two issue fixtures:
//   1. an image-pack tournament (rank N stills by injected image scores).
//   2. a video music-bed tournament (rank N music-bed variants by injected scores).
//
// Both modes (manual + model-assisted) are exercised via injection so NO paid
// generation runs. English-only-on-disk: every id / reason is plain English.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root";
import {
  buildVariantMatrix,
  runTournament,
  manualScorer,
  modelAssistedScorer,
  kindForMedia,
  type TournamentCandidate,
  type AssetScore,
} from "../../cli/lib/variant-tournament";
import { parseTournamentResult, parseVariantMatrix } from "../../cli/lib/schemas/variant-matrix";

const REPO = path.resolve(import.meta.dir, "..", "..");
const CLI = path.join(REPO, "cli", "index.ts");

// ─── buildVariantMatrix (the plan) ──────────────────────────────────────────────

describe("buildVariantMatrix — axes + hypotheses + expected cost", () => {
  test("estimates per-axis cost as perSlotCostUsd × slots and rolls up", () => {
    const m = buildVariantMatrix({
      baseId: "spring-001",
      axes: [
        { axis: "hook", hypothesis: "a punchier hook lifts 0-3s retention", slots: ["h1", "h2", "h3"], perSlotCostUsd: 0.15 },
        { axis: "music-bed", hypothesis: "an upbeat bed raises watch time", slots: ["m1", "m2"], perSlotCostUsd: 0.1 },
      ],
    });
    expect(m.baseId).toBe("spring-001");
    expect(m.axes[0]!.expectedCostUsd).toBe(0.45);
    expect(m.axes[1]!.expectedCostUsd).toBe(0.2);
    expect(m.totalExpectedCostUsd).toBe(0.65);
    // schema-valid
    expect(() => parseVariantMatrix(m)).not.toThrow();
  });

  test("an unpriced axis records 0 expected cost and still parses", () => {
    const m = buildVariantMatrix({
      baseId: "demo-001",
      axes: [{ axis: "caption-style", slots: ["c1", "c2"] }],
    });
    expect(m.axes[0]!.expectedCostUsd).toBe(0);
    expect(m.axes[0]!.hypothesis).toBe("");
    expect(m.totalExpectedCostUsd).toBe(0);
  });
});

// ─── runTournament — ranking + champion + preserved losers ──────────────────────

describe("runTournament — image-pack tournament (manual injected scores)", () => {
  // Fixture #1 from the issue: N stills ranked by injected image scores.
  const candidates: TournamentCandidate[] = [
    { variantId: "still-a", mediaPath: "artifacts/images/a.png", kind: "image", axis: "first-frame", cost: 0.15 },
    { variantId: "still-b", mediaPath: "artifacts/images/b.png", kind: "image", axis: "first-frame", cost: 0.15 },
    { variantId: "still-c", mediaPath: "artifacts/images/c.png", kind: "image", axis: "first-frame", cost: 0.15 },
  ];

  test("ranks descending, picks the champion, preserves the losers", async () => {
    const scores = { "still-a": 72, "still-b": 91, "still-c": 64 };
    const r = await runTournament({ baseId: "pack-001", candidates, scoreFn: manualScorer(scores), scorer: "manual" });

    // Ranking order: b (91) > a (72) > c (64).
    expect(r.ranked.map((e) => e.variantId)).toEqual(["still-b", "still-a", "still-c"]);
    expect(r.ranked.map((e) => e.rank)).toEqual([1, 2, 3]);

    // Champion is the top entry.
    expect(r.champion?.variantId).toBe("still-b");
    expect(r.champion?.score).toBe(91);

    // Losers are EVERY non-champion, preserved with a rationale — never dropped.
    expect(r.losers.map((e) => e.variantId)).toEqual(["still-a", "still-c"]);
    expect(r.losers.every((l) => l.rationale.includes("still-b"))).toBe(true);
    expect(r.losers.every((l) => l.rationale.toLowerCase().includes("preserved"))).toBe(true);

    // The loser count + champion together cover every candidate (nothing deleted).
    expect(r.losers.length + 1).toBe(candidates.length);

    // Cost rollup sums every candidate (winners AND losers).
    expect(r.cost.totalUsd).toBe(0.45);
    expect(r.cost.byVariant).toHaveLength(3);

    // schema-valid + scorer recorded.
    expect(r.scorer).toBe("manual");
    expect(() => parseTournamentResult(r)).not.toThrow();
  });

  test("ties break deterministically by variantId for a stable ranking", async () => {
    const scores = { "still-a": 80, "still-b": 80, "still-c": 80 };
    const r = await runTournament({ candidates, scoreFn: manualScorer(scores) });
    expect(r.ranked.map((e) => e.variantId)).toEqual(["still-a", "still-b", "still-c"]);
    expect(r.champion?.variantId).toBe("still-a");
  });

  test("a missing manual score lands a 0 with a clear reason (never crashes)", async () => {
    const r = await runTournament({ candidates, scoreFn: manualScorer({ "still-a": 50 }) });
    const c = r.ranked.find((e) => e.variantId === "still-c")!;
    expect(c.score).toBe(0);
    expect(c.reasons.join(" ")).toContain("no manual score supplied");
  });

  test("an empty pool yields a null champion + no losers (no crash)", async () => {
    const r = await runTournament({ candidates: [], scoreFn: manualScorer({}) });
    expect(r.champion).toBeNull();
    expect(r.losers).toEqual([]);
    expect(r.cost.totalUsd).toBe(0);
  });
});

describe("runTournament — video music-bed tournament (model-assisted injected scores)", () => {
  // Fixture #2 from the issue: N music-bed variants (video) ranked by the
  // model-assisted scorer. The video eval is INJECTED so no paid gen runs.
  const candidates: TournamentCandidate[] = [
    { variantId: "bed-a", mediaPath: "render/final.a.mp4", kind: "video", axis: "music-bed", prompt: "upbeat", cost: 0.6 },
    { variantId: "bed-b", mediaPath: "render/final.b.mp4", kind: "video", axis: "music-bed", prompt: "mellow", cost: 0.6 },
  ];

  // Canned per-variant asset scores keyed by media basename.
  const canned: Record<string, AssetScore> = {
    "final.a.mp4": { scores: { clarity: 9, composition: 8, fidelity: 8, motion: 9 }, comment: "tight cut on the beat" },
    "final.b.mp4": { scores: { clarity: 7, composition: 7, fidelity: 6, motion: 7 }, comment: "bed drags the pacing" },
  };

  function injectedVideoScorer() {
    return modelAssistedScorer({
      // Image branch never fires in this fixture, but must be present.
      scoreImageFn: async () => ({ scores: { clarity: 5, composition: 5, fidelity: 5 } }),
      scoreVideoFn: async (i) => canned[path.basename(i.videoPath)]!,
    });
  }

  test("averages the eval sub-scores to 0-100, ranks, and picks the champion", async () => {
    const r = await runTournament({
      baseId: "musicbed-001",
      candidates,
      scoreFn: injectedVideoScorer(),
      scorer: "model-assisted",
    });

    // bed-a avg (9+8+8+9)/4 = 8.5 → 85; bed-b avg (7+7+6+7)/4 = 6.75 → 67.5.
    expect(r.ranked.map((e) => e.variantId)).toEqual(["bed-a", "bed-b"]);
    expect(r.champion?.variantId).toBe("bed-a");
    expect(r.champion?.score).toBe(85);
    expect(r.ranked.find((e) => e.variantId === "bed-b")!.score).toBe(67.5);

    // The motion sub-score rides along in reasons (auditable ranking).
    expect(r.champion?.reasons.some((x) => x.includes("motion 9/10"))).toBe(true);
    expect(r.champion?.reasons).toContain("tight cut on the beat");

    // Loser preserved, scorer recorded, schema-valid.
    expect(r.losers.map((e) => e.variantId)).toEqual(["bed-b"]);
    expect(r.scorer).toBe("model-assisted");
    expect(() => parseTournamentResult(r)).not.toThrow();
  });

  test("the image branch routes through scoreImageFn (3-axis, no motion)", async () => {
    const scoreFn = modelAssistedScorer({
      scoreImageFn: async () => ({ scores: { clarity: 8, composition: 8, fidelity: 8 } }),
      scoreVideoFn: async () => ({ scores: { clarity: 1, composition: 1, fidelity: 1, motion: 1 } }),
    });
    const r = await runTournament({
      candidates: [{ variantId: "img-1", mediaPath: "a.png", kind: "image" }],
      scoreFn,
    });
    // (8+8+8)/3 = 8 → 80; no motion sub-score in the reasons.
    expect(r.champion?.score).toBe(80);
    expect(r.champion?.reasons.some((x) => x.includes("motion"))).toBe(false);
  });
});

describe("kindForMedia", () => {
  test("routes images vs video by extension", () => {
    expect(kindForMedia("/x/a.png")).toBe("image");
    expect(kindForMedia("/x/a.JPG")).toBe("image");
    expect(kindForMedia("/x/final.mp4")).toBe("video");
    expect(kindForMedia("/x/clip.mov")).toBe("video");
  });
});

// ─── CLI smoke (bun run cli/index.ts, NOT bunx tsx) — cheap --manual mode ───────

describe("ralphy batch tournament <id> — CLI smoke (manual mode, no paid gen)", () => {
  let tmp: TmpRoot;

  beforeEach(() => {
    tmp = makeTmpRoot("ralphy-batch-tournament-421");
  });
  afterEach(() => {
    tmp.cleanup();
  });

  function writeJson(rel: string, obj: unknown) {
    const abs = path.join(tmp.dir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, JSON.stringify(obj, null, 2) + "\n");
  }
  function writeText(rel: string, text: string) {
    const abs = path.join(tmp.dir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, text);
  }

  test("ranks two variant projects, picks a champion, preserves the loser, writes tournament.json", () => {
    const wsProjects = ".ralphy/workspaces/default/projects";
    writeJson(".ralphy/registry.json", {
      projects: {
        "bed-a-001": { workspace: "default" },
        "bed-b-001": { workspace: "default" },
      },
    });
    writeJson(".ralphy/workspaces/default/batches/musicbed-001/batch-config.json", {
      batchId: "musicbed-001",
      name: "Music bed tournament",
    });
    writeJson(".ralphy/workspaces/default/batches/musicbed-001/state.json", {
      batchId: "musicbed-001",
      status: "running",
      projects: ["bed-a-001", "bed-b-001"],
    });
    // Each variant project has a render + a gen-log row carrying its cost.
    writeText(`${wsProjects}/bed-a-001/render/final.mp4`, "fake-mp4");
    writeText(
      `${wsProjects}/bed-a-001/logs/generations.jsonl`,
      JSON.stringify({ timestamp: "t", provider: "openrouter", model: "m1", endpoint: "m1", kind: "video", status: "ok", cost_usd: 0.6, input: {} }) + "\n",
    );
    writeText(`${wsProjects}/bed-b-001/render/final.mp4`, "fake-mp4");
    writeText(
      `${wsProjects}/bed-b-001/logs/generations.jsonl`,
      JSON.stringify({ timestamp: "t", provider: "openrouter", model: "m1", endpoint: "m1", kind: "video", status: "ok", cost_usd: 0.6, input: {} }) + "\n",
    );
    // Manual scores map (the cheap mode — no model call).
    writeJson("scores.json", { "bed-a-001": 88, "bed-b-001": 70 });

    const res = spawnSync(
      "bun",
      ["run", CLI, "--cwd", tmp.dir, "batch", "tournament", "musicbed-001", "--manual", path.join(tmp.dir, "scores.json")],
      { encoding: "utf8" },
    );
    expect(res.status).toBe(0);
    const start = res.stdout.indexOf("{");
    const result = JSON.parse(res.stdout.slice(start));
    expect(result.baseId).toBe("musicbed-001");
    expect(result.scorer).toBe("manual");
    expect(result.champion.variantId).toBe("bed-a-001");
    expect(result.ranked.map((e: { variantId: string }) => e.variantId)).toEqual(["bed-a-001", "bed-b-001"]);
    expect(result.losers.map((e: { variantId: string }) => e.variantId)).toEqual(["bed-b-001"]);
    expect(result.cost.totalUsd).toBe(1.2);

    // tournament.json was written into the batch dir (the durable record).
    const written = JSON.parse(
      fs.readFileSync(path.join(tmp.dir, ".ralphy/workspaces/default/batches/musicbed-001/tournament.json"), "utf8"),
    );
    expect(written.champion.variantId).toBe("bed-a-001");

    // Losers preserved on disk — the variant render is untouched (append-only #14).
    expect(fs.existsSync(path.join(tmp.dir, `${wsProjects}/bed-b-001/render/final.mp4`))).toBe(true);
  });

  test("unknown batch id raises E_NOT_FOUND", () => {
    const res = spawnSync(
      "bun",
      ["run", CLI, "--cwd", tmp.dir, "batch", "tournament", "no-such-batch"],
      { encoding: "utf8" },
    );
    expect(res.status).not.toBe(0);
    expect(res.stdout + res.stderr).toContain("E_NOT_FOUND");
  });
});
