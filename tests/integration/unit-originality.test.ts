// `ralphy unit originality` (#561) on synthetic near-duplicates generated with
// ffmpeg in a temp dir. The cosmetic edits (mirror, 1.2x speed, a grade, a
// crop + trim) must read as likely duplicates; a re-edit that reorders the
// same shots under a new track reads similar; an unrelated clip reads
// original. Also covers Unit targets from the domain store, the CLI JSON
// shape, the tournament's sibling gate on real renders, and recording the
// changed axes in the decision ledger. Local only: no provider calls.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildSyntheticSet, hasFfmpeg, type SyntheticSet } from "../helpers/synthetic-media";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root";
import { runOriginalityCheck } from "../../cli/lib/originality/check";
import { locationTarget, pathTarget, workspaceUnitTargets } from "../../cli/lib/originality/targets";
import { fingerprintSiblingCheck } from "../../cli/lib/originality/sibling-gate";
import { manualScorer, runTournament } from "../../cli/lib/variant-tournament";
import { recordVariantDecisions } from "../../cli/lib/variant-ledger";
import { readStoredLedger } from "../../cli/lib/analytics/ledger";
import { addArtifactRevision, createArtifact } from "../../cli/lib/store/artifacts";
import { closeDomainDb } from "../../cli/lib/store/db";
import { createDocument, reviseDocument } from "../../cli/lib/store/documents";
import { ingestObject } from "../../cli/lib/store/objects";
import { locateUnits } from "../../cli/lib/store/outcomes";
import { createProject, createWorkspace } from "../../cli/lib/store/scopes";
import { createUnitWithRevision } from "../../cli/lib/store/units";

const REPO = path.resolve(import.meta.dir, "..", "..");
const CLI = path.join(REPO, "cli", "index.ts");
const FFMPEG = hasFfmpeg();
const suite = FFMPEG ? describe : describe.skip;

let mediaDir: string;
let set: SyntheticSet;

beforeAll(() => {
  if (!FFMPEG) return;
  mediaDir = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-originality-561-"));
  set = buildSyntheticSet(mediaDir);
});

afterAll(() => {
  if (mediaDir) fs.rmSync(mediaDir, { recursive: true, force: true });
});

async function check(subject: string, against: string[]) {
  return runOriginalityCheck({
    subject: pathTarget(subject, "subject"),
    targets: against.map((file) => pathTarget(file, "against")),
  });
}

suite("originality on synthetic near-duplicates", () => {
  test.each([
    ["mirrored", "mirrored"],
    ["sped up 1.2x", "sped"],
    ["re-graded", "regraded"],
    ["cropped and trimmed", "croppedTrimmed"],
  ] as const)("%s reads as a likely duplicate of the base", async (_label, key) => {
    const report = await check(set[key], [set.base]);
    expect(report.verdict).toBe("likely-duplicate");
    expect(report.nearest!.visual!).toBeGreaterThanOrEqual(0.85);
  });

  test("mirroring is detected as the same footage, flipped", async () => {
    const report = await check(set.mirrored, [set.base]);
    expect(report.nearest!.mirrored).toBe(true);
    expect(report.nearest!.audio).toBe(1);
  });

  test("a re-edit that reorders the shots under a new track reads similar", async () => {
    const report = await check(set.reordered, [set.base]);
    expect(report.verdict).toBe("similar");
    const row = report.nearest!;
    expect(row.footage!).toBeGreaterThanOrEqual(0.5);
    expect(row.sequence!).toBeLessThan(row.footage!);
    expect(row.visual!).toBeLessThan(0.85);
    expect(row.audio!).toBeLessThan(0.5);
  });

  test("an unrelated clip reads original", async () => {
    const report = await check(set.unrelated, [set.base]);
    expect(report.verdict).toBe("original");
    expect(report.nearest!.visual!).toBeLessThan(0.5);
  });

  test("stills: a mirrored, brightened copy is a duplicate; another image is original", async () => {
    expect((await check(set.stillMirrored, [set.still])).verdict).toBe("likely-duplicate");
    expect((await check(set.stillUnrelated, [set.still])).verdict).toBe("original");
  });

  test("the overall verdict is the worst comparison and names the nearest", async () => {
    const report = await check(set.sped, [set.unrelated, set.reordered, set.base]);
    expect(report.verdict).toBe("likely-duplicate");
    expect(report.nearest!.label).toBe("base.mp4");
    expect(report.comparisons.map((row) => row.verdict)).toEqual(["likely-duplicate", "similar", "original"]);
  });

  test("a caption sidecar adds the script axis", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-originality-script-"));
    try {
      const a = path.join(dir, "a.mp4");
      const b = path.join(dir, "b.mp4");
      fs.copyFileSync(set.unrelated, a);
      fs.copyFileSync(set.base, b);
      const line = "Stop buying cheap kettles. This one pours straight and the handle never gets hot.";
      fs.writeFileSync(path.join(dir, "a.srt"), `1\n00:00:00,000 --> 00:00:03,000\n${line}\n`);
      fs.writeFileSync(path.join(dir, "b.txt"), line);
      const report = await check(a, [b]);
      expect(report.subject.script).toBe("sidecar:a.srt");
      expect(report.nearest!.script).toBe(1);
      // New pictures, new sound, same words: similar, never a duplicate.
      expect(report.verdict).toBe("similar");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("CLI: path-only check needs no Workspace and prints the report as JSON", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-originality-cli-"));
    try {
      fs.mkdirSync(path.join(root, ".ralphy"));
      const res = spawnSync(
        "bun",
        ["run", CLI, "--cwd", root, "--json", "unit", "originality", set.regraded, "--against", set.base, "--against", set.unrelated],
        { encoding: "utf8", env: { ...process.env, NO_COLOR: "1" } },
      );
      expect(res.status, res.stderr).toBe(0);
      const report = JSON.parse(res.stdout);
      expect(report.verdict).toBe("likely-duplicate");
      expect(report.comparisons).toHaveLength(2);
      expect(report.thresholds.visual).toEqual({ duplicate: 0.85, similar: 0.5 });
      expect(Object.keys(report)).toEqual(["subject", "verdict", "nearest", "comparisons", "skipped", "thresholds", "engines", "next"]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

suite("originality against Workspace Units in the domain store", () => {
  let tmp: TmpRoot;

  beforeEach(() => {
    tmp = makeTmpRoot("ralphy-originality-store-561");
  });

  afterEach(() => {
    closeDomainDb();
    tmp.cleanup();
  });

  async function videoUnit(projectId: string, workspaceId: string, slug: string, file: string, script?: string) {
    const object = await ingestObject({
      scope: { workspaceId, projectId },
      sourcePath: file,
      originalName: path.basename(file),
      mime: "video/mp4",
      storageClass: "durable",
      transfer: "copy",
    });
    const artifact = createArtifact({ projectId, slug: `${slug}-render`, kind: "video" });
    const revision = addArtifactRevision({ artifactId: artifact.id, objectId: object.id, state: "approved" });
    const items: Array<{ artifactRevisionId?: string; documentRevisionId?: string; role: string; position: number }> = [
      { artifactRevisionId: revision.id, role: "master", position: 0 },
    ];
    if (script) {
      const doc = createDocument({ projectId, kind: "note", slug: `${slug}-script`, title: "Script" });
      const body = reviseDocument({ documentId: doc.id, expectedHeadId: null, format: "markdown", body: script });
      items.push({ documentRevisionId: body.id, role: "script", position: 1 });
    }
    return createUnitWithRevision({ projectId, slug, format: "video", items });
  }

  test("compares a Unit against the Workspace's other Units, script included", async () => {
    const workspace = createWorkspace({ slug: "kettle-brand", name: "Kettle brand" });
    const project = createProject({ workspaceId: workspace.id, slug: "kettle-001", name: "Kettle" });
    const script = "Stop buying cheap kettles. This one pours straight and the handle never gets hot. Link in bio.";
    await videoUnit(project.id, workspace.id, "kettle-hero", set.base, script);
    await videoUnit(project.id, workspace.id, "kettle-mirror", set.mirrored, script);
    await videoUnit(project.id, workspace.id, "kettle-other", set.unrelated);
    const context = { workspaceId: workspace.id };
    const [location] = locateUnits({ context, ref: "kettle-mirror" });
    const subject = locationTarget(context, location!, "subject");
    if ("reason" in subject) throw new Error(subject.reason);
    expect(subject.scriptSource).toBe("document:script");
    const others = workspaceUnitTargets(context, workspace.id, new Set([location!.unitId]), 50);
    expect(others.targets.map((t) => t.label).sort()).toEqual(["kettle-hero", "kettle-other"]);
    const report = await runOriginalityCheck({ subject, targets: others.targets, skipped: others.skipped });
    expect(report.verdict).toBe("likely-duplicate");
    expect(report.nearest!.label).toBe("kettle-hero");
    expect(report.nearest!.origin).toBe("workspace-unit");
    expect(report.nearest!.script).toBe(1);
    expect(report.comparisons.find((row) => row.label === "kettle-other")!.verdict).toBe("original");
  });

  test("CLI: a Unit reference resolves through the store", async () => {
    const workspace = createWorkspace({ slug: "kettle-cli", name: "Kettle CLI" });
    const project = createProject({ workspaceId: workspace.id, slug: "kettle-cli-001", name: "Kettle" });
    await videoUnit(project.id, workspace.id, "cut-a", set.base);
    await videoUnit(project.id, workspace.id, "cut-b", set.sped);
    closeDomainDb();
    const res = spawnSync(
      "bun",
      ["run", CLI, "--json", "--root", path.join(tmp.dir, ".ralphy"), "--workspace", workspace.id, "unit", "originality", "cut-b"],
      { cwd: tmp.dir, encoding: "utf8", env: { ...process.env, NO_COLOR: "1" } },
    );
    expect(res.status, res.stderr).toBe(0);
    const report = JSON.parse(res.stdout);
    expect(report.subject.label).toBe("cut-b");
    expect(report.verdict).toBe("likely-duplicate");
    expect(report.nearest.label).toBe("cut-a");
  });

  test("tournament changed axes land in the variant Unit's decision ledger", async () => {
    const workspace = createWorkspace({ slug: "farm-ledger", name: "Farm ledger" });
    const project = createProject({ workspaceId: workspace.id, slug: "farm-v1", name: "Farm v1" });
    await videoUnit(project.id, workspace.id, "farm-v1-final", set.base);
    const rows = recordVariantDecisions({ kind: "scope", workspaceId: workspace.id }, [
      { variantId: "farm-v1", changedAxes: ["broll-swap", "vo-rerecord"], cosmeticLayer: ["color-grade"] },
      { variantId: "farm-v9", changedAxes: ["layout-swap"], cosmeticLayer: [] },
    ]);
    expect(rows).toEqual([
      { variantId: "farm-v1", unit: "farm-v1-final", written: true, note: "decision ledger updated" },
      { variantId: "farm-v9", unit: null, written: false, note: "no Unit for this variant yet" },
    ]);
    const [location] = locateUnits({ context: { workspaceId: workspace.id }, ref: "farm-v1" });
    const stored = readStoredLedger({ workspaceId: workspace.id, projectId: project.id }, location!.unitId);
    expect(stored!.body!.manual).toMatchObject({ changed_axes: ["broll-swap", "vo-rerecord"], cosmetic_layer: ["color-grade"] });
  });
});

suite("tournament sibling gate on real renders", () => {
  test("refuses the mirrored sibling of the champion and emits the re-edit", async () => {
    const result = await runTournament({
      baseId: "farm",
      candidates: [
        { variantId: "v1", mediaPath: set.base, kind: "video", changedAxes: ["broll-swap", "vo-rerecord"] },
        { variantId: "v2", mediaPath: set.mirrored, kind: "video", changedAxes: ["layout-swap", "script-rewrite"] },
        { variantId: "v3", mediaPath: set.reordered, kind: "video", changedAxes: ["structure-reorder", "vo-rerecord"] },
      ],
      scoreFn: manualScorer({ v1: 90, v2: 85, v3: 70 }),
      siblingCheck: fingerprintSiblingCheck(),
    });
    expect(result.emitted).toEqual(["v1", "v3"]);
    expect(result.refused.map((r) => [r.variantId, r.reason, r.sibling])).toEqual([["v2", "duplicate-of-sibling", "v1"]]);
    expect(result.originality.comparisons.find((c) => c.variantId === "v3")!.verdict).toBe("similar");
  });

  test("CLI: batch tournament refuses, and --allow-duplicate logs the override", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-originality-batch-"));
    try {
      const ws = path.join(root, ".ralphy", "workspaces", "default");
      fs.mkdirSync(path.join(ws, "batches", "farm-001"), { recursive: true });
      fs.writeFileSync(
        path.join(root, ".ralphy", "registry.json"),
        JSON.stringify({ projects: { "farm-v1": { workspace: "default" }, "farm-v2": { workspace: "default" }, "farm-v3": { workspace: "default" } } }),
      );
      fs.writeFileSync(path.join(ws, "batches", "farm-001", "batch-config.json"), JSON.stringify({ batchId: "farm-001", name: "farm" }));
      fs.writeFileSync(path.join(ws, "batches", "farm-001", "state.json"), JSON.stringify({ batchId: "farm-001", projects: ["farm-v1", "farm-v2", "farm-v3"] }));
      for (const [id, file] of [["farm-v1", set.base], ["farm-v2", set.mirrored], ["farm-v3", set.reordered]] as const) {
        fs.mkdirSync(path.join(ws, "projects", id, "render"), { recursive: true });
        fs.copyFileSync(file, path.join(ws, "projects", id, "render", "final.mp4"));
      }
      // farm-v3 records only a cosmetic layer in its scenario: refused on the plan alone.
      fs.writeFileSync(path.join(ws, "projects", "farm-v3", "scenario.json"), JSON.stringify({ variant_cosmetic_layer: ["mirror", "speed"] }));
      fs.writeFileSync(path.join(root, "scores.json"), JSON.stringify({ "farm-v1": 90, "farm-v2": 85, "farm-v3": 70 }));
      const run = (extra: string[]) =>
        spawnSync("bun", ["run", CLI, "--cwd", root, "batch", "tournament", "farm-001", "--manual", path.join(root, "scores.json"), ...extra], {
          encoding: "utf8",
          env: { ...process.env, NO_COLOR: "1" },
        });

      const plain = run([]);
      expect(plain.status, plain.stderr).toBe(0);
      const result = JSON.parse(plain.stdout.slice(plain.stdout.indexOf("{")));
      expect(result.champion.variantId).toBe("farm-v1");
      expect(result.emitted).toEqual(["farm-v1"]);
      expect(result.refused.map((r: { variantId: string; reason: string }) => [r.variantId, r.reason])).toEqual([
        ["farm-v2", "duplicate-of-sibling"],
        ["farm-v3", "cosmetic-only"],
      ]);
      // Refused variants are never deleted.
      expect(fs.existsSync(path.join(ws, "projects", "farm-v2", "render", "final.mp4"))).toBe(true);

      const overridden = run(["--allow-duplicate", "farm-v2=music-bed A/B test; only the winner ships"]);
      expect(overridden.status, overridden.stderr).toBe(0);
      const second = JSON.parse(overridden.stdout.slice(overridden.stdout.indexOf("{")));
      expect(second.emitted).toEqual(["farm-v1", "farm-v2"]);
      expect(second.overrides[0].overrideReason).toBe("music-bed A/B test; only the winner ships");
      const log = fs.readFileSync(path.join(ws, "projects", "farm-v2", "logs", "user-prompts.jsonl"), "utf8").trim().split("\n").map((line) => JSON.parse(line));
      expect(log.at(-1)).toMatchObject({ stage: "duplicate-override", text: "music-bed A/B test; only the winner ships" });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
