// Studio API smoke tests (#107) — fixture-backed, no network beyond
// 127.0.0.1, no dependency on the real data root.

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { startStudio } from "../server/index.js";
import { listArtifacts, listWorkspaces, safeProjectFile, mediaType, readWorkflowLane, readBoard, writeBoardChoice, writeBoardLayout, listRuns, summarizeRun } from "../server/lib.js";
import { readAnnotations, addAnnotation, removeAnnotation, ANNOTATION_TAGS, type AnnotationScope } from "../server/annotations.js";
import { writeInboxPack, listInboxPacks, renderInboxMarkdown, type InboxScope } from "../server/inbox.js";

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

  // #482 run fixture: a ship-ready member project (scorecard + units + spend).
  const sproj = path.join(root, ".ralphy", "workspaces", "default", "projects", "ship-001");
  fs.mkdirSync(path.join(sproj, "logs"), { recursive: true });
  fs.mkdirSync(path.join(sproj, "units", "hero-cut"), { recursive: true });
  fs.mkdirSync(path.join(sproj, "render"), { recursive: true });
  fs.writeFileSync(path.join(sproj, "scorecard.json"), JSON.stringify({ verdict: "ship", polished: true }));
  fs.writeFileSync(path.join(sproj, "units", "hero-cut", "unit.json"), JSON.stringify({ slug: "hero-cut" }));
  fs.writeFileSync(path.join(sproj, "render", "final.mp4"), "x");
  fs.writeFileSync(path.join(sproj, "BRIEF.md"), "# brief\n");
  fs.writeFileSync(path.join(sproj, "scenario.json"), "{}");
  fs.writeFileSync(path.join(sproj, "eval.json"), "{}");
  fs.writeFileSync(
    path.join(sproj, "logs", "generations.jsonl"),
    JSON.stringify({ cost_usd: 1.25 }) + "\n" + JSON.stringify({ cost_usd: 0.75 }) + "\n",
  );

  // The runs: empty, running (member fixture-001 → blocked), complete (ship-001),
  // and one referencing a missing project. Plus a run spend ledger with a cap.
  const runsDir = path.join(root, ".ralphy", "workspaces", "default", "runs");
  const mkRun = (id: string, manifest: Record<string, unknown>) => {
    fs.mkdirSync(path.join(runsDir, id), { recursive: true });
    fs.writeFileSync(path.join(runsDir, id, "run.json"), JSON.stringify({ version: 1, id, workspace: "default", ...manifest }));
  };
  mkRun("run-empty", { title: "Empty Farm", status: "active", projectIds: [] });
  mkRun("run-running", { title: "Running Farm", status: "active", workflow: "episode", projectIds: ["fixture-001"] });
  mkRun("run-complete", { title: "Shipped Farm", status: "complete", projectIds: ["ship-001"] });
  mkRun("run-missing", { title: "Drifted Farm", status: "active", projectIds: ["ship-001", "ghost-999"] });
  // A run cap on run-running: $5 cap, member fixture-001 has $0 spend → under budget.
  fs.writeFileSync(
    path.join(runsDir, "run-running", "spend-ledger.json"),
    JSON.stringify({ version: 1, projectId: "run-running", approvals: [{ scope: "run", budgetCapUsd: 5, reason: "test", approvedAt: "2026-06-24T00:00:00.000Z" }] }),
  );
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
    expect(ws).toEqual([{ slug: "default", name: "Default", projects: 3 }]);
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

describe("runs (#482)", () => {
  const dr = () => path.join(tmpRoot, ".ralphy");

  test("listRuns returns every run with project counts", () => {
    const rows = listRuns(dr(), "default");
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(Object.keys(byId).sort()).toEqual(["run-complete", "run-empty", "run-missing", "run-running"]);
    expect(byId["run-running"].projects).toBe(1);
    expect(byId["run-empty"].projects).toBe(0);
    expect(byId["run-complete"].status).toBe("complete");
  });

  test("summarizeRun: empty run → no members, budget inbox item, zero spend", () => {
    const s = summarizeRun(dr(), "default", "run-empty")!;
    expect(s.projectCount).toBe(0);
    expect(s.budget.spentUsd).toBe(0);
    expect(s.winners).toEqual([]);
    // Active run with no cap → an approval-inbox prompt to approve a budget.
    expect(s.awaitingApprovals.some((a) => a.detail.includes("No run budget approved"))).toBe(true);
  });

  test("summarizeRun: running run → blocked member surfaces as a blocker, under-budget", () => {
    const s = summarizeRun(dr(), "default", "run-running")!;
    expect(s.projectCount).toBe(1);
    expect(s.budget.capUsd).toBe(5);
    expect(s.budget.spentUsd).toBe(0);
    expect(s.budget.overBudget).toBe(false);
    // fixture-001's workflow lane is blocked at scenario → a run blocker.
    expect(s.blockers.some((b) => b.project === "fixture-001")).toBe(true);
    // A cap exists → no "no budget approved" inbox item.
    expect(s.awaitingApprovals.some((a) => a.detail.includes("No run budget approved"))).toBe(false);
  });

  test("summarizeRun: complete run → winner, spend summed, units counted", () => {
    const s = summarizeRun(dr(), "default", "run-complete")!;
    expect(s.winners).toEqual(["ship-001"]);
    expect(s.failures).toEqual([]);
    expect(s.budget.spentUsd).toBe(2); // 1.25 + 0.75
    expect(s.units.count).toBe(1);
    expect(s.quality.find((q) => q.project === "ship-001")!.verdict).toBe("ship");
  });

  test("summarizeRun: missing member project degrades, never throws", () => {
    const s = summarizeRun(dr(), "default", "run-missing")!;
    expect(s.missingProjects).toEqual(["ghost-999"]);
    expect(s.quality.map((q) => q.project)).toEqual(["ship-001"]);
  });

  test("summarizeRun: unknown run → null", () => {
    expect(summarizeRun(dr(), "default", "nope")).toBeNull();
  });
});

describe("annotations (#488)", () => {
  const dr = () => path.join(tmpRoot, ".ralphy");
  const projScope = (id = "board-001"): AnnotationScope => ({ kind: "project", dataRoot: dr(), workspace: "default", id });
  const runScope = (id = "run-complete"): AnnotationScope => ({ kind: "run", dataRoot: dr(), workspace: "default", id });

  test("add + read folds the append-only log (artifact target)", () => {
    const r = addAnnotation(projScope(), {
      target: { type: "artifact", ref: "artifacts/images/scene-01-hub.png" },
      tags: ["winner", "use-as-reference"],
      note: "strongest hook",
    });
    expect("error" in r).toBe(false);
    const list = readAnnotations(projScope());
    const found = list.find((a) => a.target.ref === "artifacts/images/scene-01-hub.png")!;
    expect(found.tags.sort()).toEqual(["use-as-reference", "winner"]);
    expect(found.note).toBe("strongest hook");
  });

  test("remove tombstones a prior annotation by id", () => {
    const added = addAnnotation(projScope(), { target: { type: "workflow_node", ref: "scenario" }, tags: ["reject"] });
    const id = (added as { annotation: { id: string } }).annotation.id;
    expect(readAnnotations(projScope()).some((a) => a.id === id)).toBe(true);
    removeAnnotation(projScope(), id);
    expect(readAnnotations(projScope()).some((a) => a.id === id)).toBe(false);
  });

  test("rejects an unknown tag and an unknown target type", () => {
    expect("error" in addAnnotation(projScope(), { target: { type: "artifact", ref: "artifacts/images/scene-01-hub.png" }, tags: ["not-a-tag"] })).toBe(true);
    expect("error" in addAnnotation(projScope(), { target: { type: "frobnicate", ref: "x" }, tags: ["winner"] })).toBe(true);
  });

  test("artifact ref traversal is rejected; run scope refuses artifact targets", () => {
    expect("error" in addAnnotation(projScope(), { target: { type: "artifact", ref: "../../../registry.json" }, tags: ["winner"] })).toBe(true);
    expect("error" in addAnnotation(runScope(), { target: { type: "artifact", ref: "artifacts/images/x.png" }, tags: ["winner"] })).toBe(true);
  });

  test("run-scoped annotation lands in the run dir", () => {
    const r = addAnnotation(runScope(), { target: { type: "destination", ref: "tiktok-main" }, tags: ["publish-ready"], note: "queue it" });
    expect("error" in r).toBe(false);
    expect(readAnnotations(runScope()).some((a) => a.target.ref === "tiktok-main")).toBe(true);
    // The run annotation must NOT leak into a project file.
    expect(readAnnotations(projScope("ship-001")).some((a) => a.target.ref === "tiktok-main")).toBe(false);
  });

  test("an empty annotation (no tags, no note) is rejected; unknown scope errors", () => {
    expect("error" in addAnnotation(projScope(), { target: { type: "project", ref: "board-001" }, tags: [], note: "" })).toBe(true);
    expect("error" in addAnnotation(projScope("ghost-999"), { target: { type: "project", ref: "ghost-999" }, tags: ["winner"] })).toBe(true);
  });

  test("the tag vocabulary is the documented set", () => {
    expect(ANNOTATION_TAGS).toContain("winner");
    expect(ANNOTATION_TAGS).toContain("template-candidate");
  });
});

describe("agent inbox (#489)", () => {
  const dr = () => path.join(tmpRoot, ".ralphy");
  const projScope = (id = "board-001"): InboxScope => ({ kind: "project", dataRoot: dr(), workspace: "default", id });
  const runScope = (id = "run-complete"): InboxScope => ({ kind: "run", dataRoot: dr(), workspace: "default", id });

  test("writeInboxPack writes JSON + MD, computes a repo-relative artifact path", () => {
    const r = writeInboxPack(projScope(), {
      action: "repair",
      selected: [{ type: "artifact", ref: "artifacts/images/scene-01-hub.png", tags: ["weak-hook"], note: "soft open" }],
      note: "the hook is soft",
      requestedOutcome: "regenerate scene-01 with a stronger cold open",
    });
    expect("error" in r).toBe(false);
    const ok = r as Extract<typeof r, { id: string }>;
    expect(fs.existsSync(ok.jsonPath)).toBe(true);
    expect(fs.existsSync(ok.mdPath)).toBe(true);
    expect(ok.pack.action).toBe("repair");
    expect(ok.pack.project).toBe("board-001");
    expect(ok.pack.run).toBeNull();
    // The `@`-pastable path is repo-root-relative.
    expect(ok.pack.selected[0].path).toBe(".ralphy/workspaces/default/projects/board-001/artifacts/images/scene-01-hub.png");
    expect(ok.pack.tags).toContain("weak-hook");
  });

  test("renderInboxMarkdown is readable and includes the @-pastable path + the not-spend note", () => {
    const md = renderInboxMarkdown({
      version: 1, kind: "agent-inbox", id: "x-repair", action: "repair", createdAt: "2026-06-25T00:00:00.000Z",
      workspace: "default", run: null, project: "board-001",
      selected: [{ type: "artifact", ref: "a.png", path: ".ralphy/x/a.png", tags: ["winner"] }],
      tags: ["winner"], note: "", requestedOutcome: "ship it",
    });
    expect(md).toContain("# Studio context pack — repair");
    expect(md).toContain("`@.ralphy/x/a.png`");
    expect(md.toLowerCase()).toContain("not an instruction to spend money");
  });

  test("rejects a bad action and an empty selection", () => {
    expect("error" in writeInboxPack(projScope(), { action: "nuke", selected: [{ type: "artifact", ref: "a.png" }] })).toBe(true);
    expect("error" in writeInboxPack(projScope(), { action: "repair", selected: [] })).toBe(true);
  });

  test("artifact traversal is rejected; run scope refuses artifact selections", () => {
    expect("error" in writeInboxPack(projScope(), { action: "repair", selected: [{ type: "artifact", ref: "../../../registry.json" }] })).toBe(true);
    expect("error" in writeInboxPack(runScope(), { action: "approve", selected: [{ type: "artifact", ref: "artifacts/images/x.png" }] })).toBe(true);
  });

  test("run-scoped pack writes under the run dir and lists back", () => {
    const r = writeInboxPack(runScope(), { action: "approve", selected: [{ type: "project", ref: "ship-001" }, { type: "unit", ref: "hero-cut" }], requestedOutcome: "approve the winner" });
    expect("error" in r).toBe(false);
    const rows = listInboxPacks(runScope());
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].action).toBe("approve");
    expect(rows[0].selectedCount).toBe(2);
  });

  test("unknown scope errors", () => {
    expect("error" in writeInboxPack(projScope("ghost-999"), { action: "repair", selected: [{ type: "artifact", ref: "a.png" }] })).toBe(true);
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

  test("GET /api/runs lists the workspace runs", async () => {
    const runs = await fetch(`${base}/api/runs?workspace=default`).then((r) => r.json());
    expect(runs.map((r: { id: string }) => r.id).sort()).toEqual(["run-complete", "run-empty", "run-missing", "run-running"]);
  });

  test("GET /api/runs/:id returns the rolled-up summary", async () => {
    const s = await fetch(`${base}/api/runs/run-complete?workspace=default`).then((r) => r.json());
    expect(s.winners).toEqual(["ship-001"]);
    expect(s.budget.spentUsd).toBe(2);
    expect(s.units.count).toBe(1);
  });

  test("GET /api/runs/:id unknown → 404", async () => {
    const r = await fetch(`${base}/api/runs/nope?workspace=default`);
    expect(r.status).toBe(404);
  });

  test("non-GET refused on the runs endpoint (read-only)", async () => {
    const r = await fetch(`${base}/api/runs/run-complete?workspace=default`, { method: "POST" });
    expect(r.status).toBe(405);
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

  // #488 — the tag-an-artifact UI smoke path, exercised over the exact HTTP
  // endpoints the Studio UI calls: POST add → GET list → POST remove.
  test("annotations: POST add an artifact tag, GET it back, POST remove", async () => {
    const post = (suffix: string, body: unknown) =>
      fetch(`${base}/api/projects/board-001/annotations${suffix}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    const add = await post("", { workspace: "default", target: { type: "artifact", ref: "artifacts/images/scene-02-casey.png" }, tags: ["winner"], note: "ship this" });
    expect(add.status).toBe(200);
    const addBody = await add.json();
    const newId = addBody.annotation.id as string;

    const list = await fetch(`${base}/api/projects/board-001/annotations?workspace=default`).then((r) => r.json());
    expect(list.annotations.some((a: { id: string }) => a.id === newId)).toBe(true);

    const rm = await post("/remove", { workspace: "default", id: newId });
    expect(rm.status).toBe(200);
    const after = await fetch(`${base}/api/projects/board-001/annotations?workspace=default`).then((r) => r.json());
    expect(after.annotations.some((a: { id: string }) => a.id === newId)).toBe(false);
  });

  test("annotations: POST with an unknown tag → 400", async () => {
    const r = await fetch(`${base}/api/projects/board-001/annotations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workspace: "default", target: { type: "artifact", ref: "artifacts/images/scene-02-casey.png" }, tags: ["bogus"] }),
    });
    expect(r.status).toBe(400);
  });

  test("annotations: POST to a missing project → 404", async () => {
    const r = await fetch(`${base}/api/projects/ghost-999/annotations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workspace: "default", target: { type: "project", ref: "ghost-999" }, tags: ["winner"] }),
    });
    expect(r.status).toBe(404);
  });

  // #489 — the send-to-agent UI path over HTTP: POST a pack → GET the inbox list.
  test("inbox: POST a context pack, then GET the inbox list", async () => {
    const post = await fetch(`${base}/api/projects/board-001/inbox`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workspace: "default", action: "repair", selected: [{ type: "artifact", ref: "artifacts/images/scene-01-hub.png" }], note: "fix it", requestedOutcome: "stronger hook" }),
    });
    expect(post.status).toBe(200);
    const id = (await post.json()).id as string;
    const list = await fetch(`${base}/api/projects/board-001/inbox?workspace=default`).then((r) => r.json());
    expect(list.inbox.some((p: { id: string }) => p.id === id)).toBe(true);
  });

  test("inbox: POST with a bad action → 400, missing project → 404", async () => {
    const bad = await fetch(`${base}/api/projects/board-001/inbox`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ workspace: "default", action: "nuke", selected: [{ type: "artifact", ref: "artifacts/images/scene-01-hub.png" }] }),
    });
    expect(bad.status).toBe(400);
    const miss = await fetch(`${base}/api/projects/ghost-999/inbox`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ workspace: "default", action: "repair", selected: [{ type: "artifact", ref: "a.png" }] }),
    });
    expect(miss.status).toBe(404);
  });
});
