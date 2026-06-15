// Unit provenance graph (#420).
//
// Two layers:
//   1. `buildProvenanceGraph()` in-process against a fixture project seeded with
//      multiple variants (a manifest slot whose promoted `.v3` won over rejected
//      `.v1`/`.v2`) and a repair pass (eval.json + repair-plan.json). Asserts
//      every chain node lands, the selected/rejected variant split is correct,
//      model/provider/cost/timestamp are captured, and the cost rolls up.
//   2. CLI end-to-end (`bun run cli/index.ts unit create`) writes the sibling
//      provenance.json + the `provenance_graph` pointer, and a legacy unit.json
//      WITHOUT the graph still validates (additive guarantee).
//
// English-only-on-disk: every fixture slug / filename / string is plain English.

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root";
import { buildProvenanceGraph } from "../../cli/lib/provenance";
import {
  ProvenanceGraphSchema,
  PROVENANCE_GRAPH_FILENAME,
} from "../../cli/lib/schemas/provenance-graph";
import { UnitManifestSchema } from "../../cli/lib/schemas/unit";
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

// ─── Layer 2: CLI end-to-end + legacy validation ────────────────────────────────

describe("ralphy unit create — provenance graph sibling (#420)", () => {
  const REPO = path.resolve(import.meta.dir, "..", "..");
  const CLI = path.join(REPO, "cli", "index.ts");
  let tmpRoot: string;

  function ralphy(args: string[]): { exitCode: number; stdout: string; json: any } {
    const r = spawnSync("bun", ["run", CLI, "--cwd", tmpRoot, "--json", ...args], {
      cwd: tmpRoot,
      encoding: "utf8",
      env: { ...process.env },
    });
    let json: any = null;
    try {
      json = JSON.parse(r.stdout);
    } catch {
      /* not JSON */
    }
    return { exitCode: r.status ?? -1, stdout: r.stdout, json };
  }

  function projDir(project: string): string {
    return path.join(tmpRoot, ".ralphy", "workspaces", "default", "projects", project);
  }

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-prov-cli-420-"));
    const project = "cli-prov-420";
    const imagesDir = path.join(projDir(project), "artifacts", "images");
    fs.mkdirSync(imagesDir, { recursive: true });
    fs.writeFileSync(path.join(imagesDir, "hero.png"), "hero-bytes");
    // Seed a brief + manifest so the graph has nodes to capture.
    fs.writeFileSync(path.join(projDir(project), "BRIEF.md"), "# Brief");
    fs.writeFileSync(
      path.join(projDir(project), "asset-manifest.json"),
      JSON.stringify({
        slots: { "hero-image": { kind: "image", path: "artifacts/images/hero.png", costUsd: 0.05 } },
      }),
    );
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  });

  test("create writes provenance.json + the provenance_graph pointer", () => {
    const r = ralphy([
      "unit", "create", "cli-prov-420",
      "--slug", "hero", "--format", "image",
      "--from", "artifacts/images/hero.png",
    ]);
    expect(r.exitCode).toBe(0);
    expect(r.json?.provenance_graph).toBe(PROVENANCE_GRAPH_FILENAME);
    expect(r.json?.manifest.provenance_graph).toBe(PROVENANCE_GRAPH_FILENAME);

    const unitDir = path.join(projDir("cli-prov-420"), "units", "hero");
    const graphPath = path.join(unitDir, PROVENANCE_GRAPH_FILENAME);
    expect(fs.existsSync(graphPath)).toBe(true);
    const graph = ProvenanceGraphSchema.parse(JSON.parse(fs.readFileSync(graphPath, "utf8")));
    expect(graph.slug).toBe("hero");
    expect(graph.nodes.some((n) => n.kind === "brief")).toBe(true);
    expect(graph.nodes.some((n) => n.id === "asset:hero-image")).toBe(true);
  });

  test("a legacy unit.json with no provenance_graph still validates (additive)", () => {
    const legacy = {
      slug: "old-unit",
      format: "image",
      media: ["a.png"],
      created: "2026-01-01T00:00:00.000Z",
    };
    expect(UnitManifestSchema.safeParse(legacy).success).toBe(true);
    // And the new optional field is simply absent — not defaulted to anything.
    const parsed = UnitManifestSchema.parse(legacy);
    expect(parsed.provenance_graph).toBeUndefined();
  });
});
