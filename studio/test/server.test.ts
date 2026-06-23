// Studio API smoke tests (#107) — fixture-backed, no network beyond
// 127.0.0.1, no dependency on the real data root.

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { startStudio } from "../server/index.js";
import { listArtifacts, listWorkspaces, safeProjectFile, mediaType, readWorkflowLane, readBoard, writeBoardChoice, writeBoardLayout } from "../server/lib.js";

let tmpRoot: string;
let studio: ReturnType<typeof startStudio>;
let base: string;

function seed(root: string) {
  const proj = path.join(root, ".ralphy", "workspaces", "default", "projects", "fixture-001");
  fs.mkdirSync(path.join(proj, "artifacts", "images"), { recursive: true });
  fs.mkdirSync(path.join(proj, "artifacts", "voiceover"), { recursive: true });
  fs.mkdirSync(path.join(proj, "artifacts", "refs"), { recursive: true });
  fs.mkdirSync(path.join(proj, "render"), { recursive: true });
  // 1x1 PNG
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABh6FO1AAAAABJRU5ErkJggg==",
    "base64",
  );
  fs.writeFileSync(path.join(proj, "artifacts", "images", "hero.png"), png);
  fs.writeFileSync(path.join(proj, "artifacts", "images", "hero.v2.png"), png);
  fs.writeFileSync(path.join(proj, "artifacts", "voiceover", "scene-01.mp3"), "not-really-mp3");
  fs.writeFileSync(path.join(proj, "artifacts", "refs", "brand.txt"), "ref note");
  fs.writeFileSync(path.join(proj, "render", "final.mp4"), "not-really-mp4");
  fs.writeFileSync(
    path.join(root, ".ralphy", "workspaces", "default", "workspace.json"),
    JSON.stringify({ name: "Default", slug: "default" }),
  );
  // #478 workflow lane fixture: a workflow + project state that exercises
  // done / blocked / queued derivation.
  const wfDir = path.join(root, ".ralphy", "workspaces", "default", "workflows");
  fs.mkdirSync(wfDir, { recursive: true });
  fs.writeFileSync(
    path.join(wfDir, "episode.json"),
    JSON.stringify({
      version: "1.0",
      name: "episode",
      steps: [
        { id: "intake", label: "Load context", phase: "intake", engine: "agent", variants: 1, gate: [], mode: "auto" },
        { id: "scenario", label: "Scenario", phase: "scenario", engine: "llm", variants: 1, gate: ["scenario-fidelity"], mode: "approve" },
        { id: "render", label: "Render", phase: "render", engine: "render", variants: 1, gate: [], mode: "auto" },
        { id: "eval", label: "Eval", phase: "eval", engine: "eval", variants: 1, gate: [], mode: "approve" },
      ],
    }),
  );
  fs.writeFileSync(path.join(proj, "BRIEF.md"), "# brief\n");
  fs.writeFileSync(path.join(proj, "scenario.json"), "{}");
  fs.writeFileSync(
    path.join(proj, "workspace-eval.json"),
    JSON.stringify({ criteria: [{ id: "scenario-fidelity", verdict: "fail" }] }),
  );
  // #478 board fixture: a second project whose images follow scene-NN naming.
  const bproj = path.join(root, ".ralphy", "workspaces", "default", "projects", "board-001");
  fs.mkdirSync(path.join(bproj, "artifacts", "images"), { recursive: true });
  for (const f of ["scene-01-hub.png", "scene-02-casey.png", "scene-02-casey.v2.png", "frost-portrait.png"]) {
    fs.writeFileSync(path.join(bproj, "artifacts", "images", f), png);
  }
}

beforeAll(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "studio-test-"));
  seed(tmpRoot);
  process.env.RALPHY_STUDIO_ROOT = tmpRoot;
  studio = startStudio({ port: 0 });
  base = `http://127.0.0.1:${studio.server.port}`;
});

afterAll(() => {
  studio.stop();
  delete process.env.RALPHY_STUDIO_ROOT;
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe("lib", () => {
  test("listWorkspaces reads manifest name + project count", () => {
    const ws = listWorkspaces(path.join(tmpRoot, ".ralphy"));
    expect(ws).toEqual([{ slug: "default", name: "Default", projects: 2 }]);
  });

  test("listArtifacts groups by kind incl. render pseudo-kind, versions intact", () => {
    const all = listArtifacts(path.join(tmpRoot, ".ralphy"), "default", "fixture-001");
    const kinds = new Set(all.map((a) => a.kind));
    expect(kinds).toEqual(new Set(["images", "voiceover", "refs", "render"]));
    expect(all.filter((a) => a.kind === "images").map((a) => a.name).sort()).toEqual([
      "hero.png",
      "hero.v2.png",
    ]);
  });

  test("safeProjectFile blocks traversal and out-of-project paths", () => {
    const dr = path.join(tmpRoot, ".ralphy");
    expect(safeProjectFile(dr, "default", "fixture-001", "artifacts/images/hero.png")).toBeTruthy();
    expect(safeProjectFile(dr, "default", "fixture-001", "../../../registry.json")).toBeNull();
    expect(safeProjectFile(dr, "default", "fixture-001", "/etc/hosts")).toBeNull();
  });

  test("mediaType classification", () => {
    expect(mediaType("a.png")).toBe("image");
    expect(mediaType("a.mp4")).toBe("video");
    expect(mediaType("a.mp3")).toBe("audio");
    expect(mediaType("a.srt")).toBe("text");
    expect(mediaType("a.bin")).toBe("other");
  });

  test("readWorkflowLane derives per-step status (done / blocked / queued)", () => {
    const dr = path.join(tmpRoot, ".ralphy");
    const lane = readWorkflowLane(dr, "default", "fixture-001")!;
    expect(lane).not.toBeNull();
    const byId = Object.fromEntries(lane.steps.map((s) => [s.id, s]));
    expect(byId.intake.status).toBe("done");
    expect(byId.scenario.status).toBe("blocked"); // scenario.json present but gate fails
    expect(byId.scenario.gateVerdict).toBe("fail");
    expect(lane.currentStep).toBe("scenario");
  });

  test("readWorkflowLane returns null for a workspace with no workflow", () => {
    const dr = path.join(tmpRoot, ".ralphy");
    expect(readWorkflowLane(dr, "no-such-ws", "x")).toBeNull();
  });

  test("readBoard groups scene-NN variants, defaults chosen to the canonical image", () => {
    const dr = path.join(tmpRoot, ".ralphy");
    const board = readBoard(dr, "default", "board-001")!;
    expect(board.scenes.map((s) => s.id)).toEqual(["scene-01", "scene-02"]);
    const s2 = board.scenes.find((s) => s.id === "scene-02")!;
    expect(s2.variants.length).toBe(2);
    expect(s2.chosen).toBe("artifacts/images/scene-02-casey.png"); // canonical, not .v2
    expect(board.other.map((v) => v.name)).toEqual(["frost-portrait.png"]);
  });

  test("writeBoardChoice persists a per-scene choice (media untouched)", () => {
    const dr = path.join(tmpRoot, ".ralphy");
    const updated = writeBoardChoice(dr, "default", "board-001", "scene-02", "artifacts/images/scene-02-casey.v2.png");
    expect("error" in updated!).toBe(false);
    const s2 = (updated as { scenes: { id: string; chosen: string | null }[] }).scenes.find((s) => s.id === "scene-02")!;
    expect(s2.chosen).toBe("artifacts/images/scene-02-casey.v2.png");
    // Persisted: a fresh read reflects the override.
    expect(readBoard(dr, "default", "board-001")!.scenes.find((s) => s.id === "scene-02")!.chosen).toBe(
      "artifacts/images/scene-02-casey.v2.png",
    );
    expect(fs.existsSync(path.join(tmpRoot, ".ralphy", "workspaces", "default", "projects", "board-001", "board.json"))).toBe(true);
  });

  test("writeBoardChoice rejects a path outside the project", () => {
    const dr = path.join(tmpRoot, ".ralphy");
    const r = writeBoardChoice(dr, "default", "board-001", "scene-02", "../../../registry.json");
    expect("error" in r!).toBe(true);
  });

  test("writeBoardLayout persists a node position and readBoard returns it", () => {
    const dr = path.join(tmpRoot, ".ralphy");
    const r = writeBoardLayout(dr, "default", "board-001", "assets", 320, 90);
    expect(r).toEqual({ ok: true });
    expect(readBoard(dr, "default", "board-001")!.layout.assets).toEqual({ x: 320, y: 90 });
    // Layout and choices coexist in one board.json.
    expect(readBoard(dr, "default", "board-001")!.scenes.find((s) => s.id === "scene-02")!.chosen).toBe(
      "artifacts/images/scene-02-casey.v2.png",
    );
  });

  test("writeBoardLayout rejects non-finite coordinates", () => {
    const dr = path.join(tmpRoot, ".ralphy");
    expect("error" in writeBoardLayout(dr, "default", "board-001", "assets", NaN, 0)).toBe(true);
  });
});

describe("http api", () => {
  test("GET /api/workspaces", async () => {
    const ws = await fetch(`${base}/api/workspaces`).then((r) => r.json());
    expect(ws[0].slug).toBe("default");
  });

  test("GET /api/projects lists the fixture project", async () => {
    const projects = await fetch(`${base}/api/projects?workspace=default`).then((r) => r.json());
    expect(projects.map((p: { id: string }) => p.id)).toContain("fixture-001");
  });

  test("GET /api/projects/:id/artifacts returns expected kinds", async () => {
    const arts = await fetch(`${base}/api/projects/fixture-001/artifacts?workspace=default`).then((r) => r.json());
    const kinds = new Set(arts.map((a: { kind: string }) => a.kind));
    expect(kinds).toEqual(new Set(["images", "voiceover", "refs", "render"]));
  });

  test("GET file endpoint serves bytes with content-type, blocks traversal", async () => {
    const ok = await fetch(
      `${base}/api/projects/fixture-001/file?workspace=default&path=${encodeURIComponent("artifacts/images/hero.png")}`,
    );
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toBe("image/png");
    const bad = await fetch(
      `${base}/api/projects/fixture-001/file?workspace=default&path=${encodeURIComponent("../../../registry.json")}`,
    );
    expect(bad.status).toBe(404);
  });

  test("range request returns 206 partial content", async () => {
    const r = await fetch(
      `${base}/api/projects/fixture-001/file?workspace=default&path=${encodeURIComponent("render/final.mp4")}`,
      { headers: { range: "bytes=0-3" } },
    );
    expect(r.status).toBe(206);
    expect(r.headers.get("content-range")).toMatch(/^bytes 0-3\//);
    expect((await r.arrayBuffer()).byteLength).toBe(4);
  });

  test("GET /api/projects/:id/workflow returns the derived lane", async () => {
    const lane = await fetch(`${base}/api/projects/fixture-001/workflow?workspace=default`).then((r) => r.json());
    expect(lane.workflow).toBe("episode");
    expect(lane.currentStep).toBe("scenario");
    expect(lane.steps.find((s: { id: string }) => s.id === "scenario").status).toBe("blocked");
  });

  test("GET /api/projects/:id/board returns the derived scene board", async () => {
    const board = await fetch(`${base}/api/projects/board-001/board?workspace=default`).then((r) => r.json());
    expect(board.scenes.map((s: { id: string }) => s.id)).toEqual(["scene-01", "scene-02"]);
  });

  test("POST /api/projects/:id/board/choose persists a choice (the one allowed write)", async () => {
    const r = await fetch(`${base}/api/projects/board-001/board/choose?`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workspace: "default", scene: "scene-02", path: "artifacts/images/scene-02-casey.png" }),
    });
    expect(r.status).toBe(200);
    const board = await r.json();
    expect(board.scenes.find((s: { id: string }) => s.id === "scene-02").chosen).toBe("artifacts/images/scene-02-casey.png");
  });

  test("POST board/choose rejects an out-of-project path", async () => {
    const r = await fetch(`${base}/api/projects/board-001/board/choose`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workspace: "default", scene: "scene-02", path: "../../../registry.json" }),
    });
    expect(r.status).toBe(400);
  });

  test("POST /api/projects/:id/board/layout persists a node position", async () => {
    const r = await fetch(`${base}/api/projects/board-001/board/layout`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workspace: "default", node: "scenario", x: 640, y: 90 }),
    });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
    const board = await fetch(`${base}/api/projects/board-001/board?workspace=default`).then((r) => r.json());
    expect(board.layout.scenario).toEqual({ x: 640, y: 90 });
  });

  test("non-GET refused on non-board endpoints (read-only server)", async () => {
    const r = await fetch(`${base}/api/workspaces`, { method: "POST" });
    expect(r.status).toBe(405);
  });

  test("static UI served at /", async () => {
    const r = await fetch(`${base}/`);
    expect(r.status).toBe(200);
    expect(await r.text()).toContain("Ralphy Studio");
  });
});
