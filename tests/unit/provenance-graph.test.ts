// Unit provenance graph (#420).
//
// `buildProvenanceGraph()` is tested in-process against a fixture project seeded with
//      multiple variants (a manifest slot whose promoted `.v3` won over rejected
//      `.v1`/`.v2`) and a repair pass (eval.json + repair-plan.json). Asserts
//      every chain node lands, the selected/rejected variant split is correct,
// model/provider/cost/timestamp are captured, and the cost rolls up.
//
// English-only-on-disk: every fixture slug / filename / string is plain English.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root";
import { buildProvenanceGraph } from "../../cli/lib/provenance";
import { ProvenanceGraphSchema } from "../../cli/lib/schemas/provenance-graph";
import { projectDir } from "../../cli/lib/paths";

const PROJECT = "provenance-fixture-420";

// ─── Layer 1: in-process graph builder ──────────────────────────────────────────

describe("buildProvenanceGraph (#420)", () => {
  let tmp: TmpRoot;

  /** Write a project-relative file (mkdir -p the parent). */
  function writeArtifact(rel: string, contents = "x") {
    const abs = path.join(projectDir(PROJECT), rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, contents);
  }

  beforeEach(() => {
    tmp = makeTmpRoot("ralphy-prov-420");

    // ── The full reproduction chain on disk ──
    writeArtifact("BRIEF.md", "# Brief");
    writeArtifact("artifacts/refs/research-facts.json", JSON.stringify({ version: 1 }));
    writeArtifact("STYLE_LOCK.md", "# Style lock");
    writeArtifact("prompts.json", JSON.stringify({ slots: {} }));

    // Asset manifest: one slot whose promoted variant is the .v3.
    writeArtifact(
      "asset-manifest.json",
      JSON.stringify({
        slots: {
          "scene-01-bg-image": {
            kind: "image",
            path: "artifacts/images/scene-01-bg-image.v3.png",
            model: "google/gemini-3-pro-image-preview",
            costUsd: 0.12,
            generatedAt: "2026-06-14T10:00:00.000Z",
          },
        },
      }),
    );

    // Gen-log: three attempts on the slot. The first two are kept-but-rejected
    // variants (.v1/.v2); the third is the promoted output (matches manifest path).
    const rows = [
      {
        timestamp: "2026-06-14T09:58:00.000Z",
        provider: "openrouter",
        model: "google/gemini-3-pro-image-preview",
        endpoint: "google/gemini-3-pro-image-preview",
        kind: "image",
        input: { slot: "scene-01-bg-image", project: PROJECT },
        output: { local: "artifacts/images/scene-01-bg-image.png" },
        status: "ok",
        cost_usd: 0.12,
        attempt: 1,
      },
      {
        timestamp: "2026-06-14T09:59:00.000Z",
        provider: "openrouter",
        model: "google/gemini-3-pro-image-preview",
        endpoint: "google/gemini-3-pro-image-preview",
        kind: "image",
        input: { slot: "scene-01-bg-image", project: PROJECT },
        output: { local: "artifacts/images/scene-01-bg-image.v2.png" },
        status: "ok",
        cost_usd: 0.12,
        attempt: 2,
      },
      {
        timestamp: "2026-06-14T10:00:00.000Z",
        provider: "openrouter",
        model: "google/gemini-3-pro-image-preview",
        endpoint: "google/gemini-3-pro-image-preview",
        kind: "image",
        input: { slot: "scene-01-bg-image", project: PROJECT },
        output: { local: "artifacts/images/scene-01-bg-image.v3.png" },
        status: "ok",
        cost_usd: 0.12,
        attempt: 3,
      },
    ];
    writeArtifact("logs/generations.jsonl", rows.map((r) => JSON.stringify(r)).join("\n") + "\n");

    // A logged source ref (user-supplied product photo).
    writeArtifact(
      "logs/user-assets.jsonl",
      JSON.stringify({
        timestamp: "2026-06-14T09:50:00.000Z",
        kind: "photo",
        source: "/Users/dev/Desktop/product.png",
        localPath: "artifacts/refs/product.png",
        purpose: "product-ref",
      }) + "\n",
    );

    // Render + eval + council + a repair pass (the #409 loop).
    writeArtifact("render/final.mp4", "mp4-bytes");
    writeArtifact("eval.json", JSON.stringify({ schemaVersion: "1.0" }));
    writeArtifact("council-polish.json", JSON.stringify({ phase: "polish" }));
    writeArtifact("repair-plan.json", JSON.stringify({ version: 1 }));
  });

  afterEach(() => tmp.cleanup());

  test("captures every node kind in the reproduction chain", async () => {
    const graph = await buildProvenanceGraph(PROJECT, "hero-cut");
    expect(ProvenanceGraphSchema.safeParse(graph).success).toBe(true);
    expect(graph.slug).toBe("hero-cut");
    expect(graph.projectId).toBe(PROJECT);

    const kinds = new Set(graph.nodes.map((n) => n.kind));
    for (const k of [
      "brief",
      "research-facts",
      "style-lock",
      "prompt",
      "source-ref",
      "generated-asset",
      "render",
      "eval-report",
      "council-report",
      "repair-plan",
      "final-media",
    ]) {
      expect(kinds.has(k as any)).toBe(true);
    }
  });

  test("records the selected-vs-rejected variant split + model/provider/cost", async () => {
    const graph = await buildProvenanceGraph(PROJECT, "hero-cut");
    const asset = graph.nodes.find((n) => n.id === "asset:scene-01-bg-image");
    expect(asset).toBeDefined();

    // The promoted .v3 is selected; the earlier .v1/.v2 outputs are rejected.
    expect(asset!.selectedVariants).toEqual(["artifacts/images/scene-01-bg-image.v3.png"]);
    expect(asset!.rejectedVariants.sort()).toEqual([
      "artifacts/images/scene-01-bg-image.png",
      "artifacts/images/scene-01-bg-image.v2.png",
    ]);

    expect(asset!.modelCall?.provider).toBe("openrouter");
    expect(asset!.modelCall?.model).toBe("google/gemini-3-pro-image-preview");
    expect(asset!.modelCall?.costUsd).toBe(0.12);
    expect(asset!.modelCall?.timestamp).toBe("2026-06-14T10:00:00.000Z");
  });

  test("links parents into a DAG (render ← assets, polish council ← eval)", async () => {
    const graph = await buildProvenanceGraph(PROJECT, "hero-cut");
    const render = graph.nodes.find((n) => n.id === "render");
    expect(render!.parents).toContain("asset:scene-01-bg-image");
    const council = graph.nodes.find((n) => n.id === "council-polish");
    expect(council!.parents).toContain("eval");
    const finalMedia = graph.nodes.find((n) => n.id === "final-media");
    expect(finalMedia!.parents).toEqual(["render"]);
  });

  test("rolls up total cost across asset nodes", async () => {
    const graph = await buildProvenanceGraph(PROJECT, "hero-cut");
    expect(graph.totalCostUsd).toBe(0.12);
  });

  test("best-effort: a bare project with nothing on disk yields an empty graph, no crash", async () => {
    // Fresh project dir with no artifacts at all.
    const BARE = "bare-420";
    fs.mkdirSync(projectDir(BARE), { recursive: true });
    const graph = await buildProvenanceGraph(BARE, "empty");
    expect(graph.nodes).toEqual([]);
    expect(graph.totalCostUsd).toBe(0);
  });
});
