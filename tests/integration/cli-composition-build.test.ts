import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { addArtifactRevision, createArtifact } from "../../cli/lib/store/artifacts.js";
import {
  bindCompositionInput,
  createComposition,
  getCompositionRevision,
  putCompositionSource,
  reviseComposition,
  sealCompositionRevision,
} from "../../cli/lib/store/compositions.js";
import { closeDomainDb, openDomainDb } from "../../cli/lib/store/db.js";
import { ingestObject } from "../../cli/lib/store/objects.js";
import { setRoot } from "../../cli/lib/paths.js";
import { createProject, createWorkspace } from "../../cli/lib/store/scopes.js";
import { storedObjectPath } from "../helpers/stored-object.js";
import { runCompositionBuild, reviseCompositionCheckout } from "../../cli/lib/composition-build.js";

const REPO = path.resolve(import.meta.dir, "..", "..");
const CLI = path.join(REPO, "cli", "index.ts");

let fixtureRoot: string;
let dataRoot: string;
let workspaceId: string;
let projectId: string;

beforeEach(() => {
  fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-composition-cli-"));
  dataRoot = path.join(fixtureRoot, ".ralphy");
  fs.mkdirSync(dataRoot);
  setRoot(fixtureRoot);
  openDomainDb();
  const workspace = createWorkspace({ slug: "composition-cli", name: "Composition CLI" });
  const project = createProject({ workspaceId: workspace.id, slug: "video", name: "Video" });
  workspaceId = workspace.id;
  projectId = project.id;
});

afterEach(() => {
  closeDomainDb();
  setRoot(REPO);
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
});

describe("composition revision/build CLI", () => {
  test("revises an editable checkout, seals it, builds ordered outputs, and shows nested history", async () => {
    const parent = await compositionWithSource("history", "<html>parent</html>");
    const revised = expectOk<RevisionResult>(await runCli([
      "composition", "revise", parent.compositionId,
      "--expected", parent.revisionId,
      "--engine", "manual",
      "--config", JSON.stringify({ outputs: [
        { source: "index.html", slug: "master-html", kind: "document", mime: "text/html", role: "master" },
        { source: "preview.txt", slug: "preview", kind: "document", mime: "text/plain", role: "preview" },
      ] }),
    ]));
    expect(revised.parentRevisionId).toBe(parent.revisionId);
    expect(revised.checkoutPath).toBe(path.join(fs.realpathSync(dataRoot), "tmp", revised.id, "checkout"));
    expect(fs.readFileSync(path.join(revised.checkoutPath, "index.html"), "utf8")).toBe("<html>parent</html>");
    fs.writeFileSync(path.join(revised.checkoutPath, "index.html"), "<html>edited</html>");
    fs.writeFileSync(path.join(revised.checkoutPath, "preview.txt"), "preview");

    const built = expectOk<BuildResult>(await runCli([
      "composition", "build", parent.compositionId,
      "--revision", revised.id,
      "--profile", "preview",
    ]));
    expect(built.compositionRevisionId).toBe(revised.id);
    expect(built.state).toBe("succeeded");
    expect(built.outputs.map((output) => output.role)).toEqual(["master", "preview"]);
    expect(built.outputs.map((output) => output.position)).toEqual([0, 1]);
    expect(JSON.stringify(built)).not.toContain(`${dataRoot}/buckets/`);

    const shown = expectOk<{ revisions: Array<{ id: string; state: string; builds: BuildResult[] }> }>(
      await runCli(["composition", "show", parent.compositionId]),
    );
    const shownRevision = shown.revisions.find((revision) => revision.id === revised.id)!;
    expect(shownRevision.state).toBe("sealed");
    expect(shownRevision.builds[0]?.id).toBe(built.id);
    expect(shownRevision.builds[0]?.outputs.map((output) => output.position)).toEqual([0, 1]);
    expect(fs.existsSync(path.join(fixtureRoot, "compositions", "v1.html"))).toBe(false);
  });

  test("seals source bytes before a manual engine failure and requires revise for another build", async () => {
    const composition = createComposition({ projectId, slug: "failure", kind: "video" });
    const draft = reviseComposition({
      compositionId: composition.id,
      expectedLatestRevisionId: null,
      engine: "manual",
      engineConfig: { outputs: [{ source: "missing.mp4", slug: "missing", kind: "video", mime: "video/mp4" }] },
    });
    const checkoutPath = path.join(dataRoot, "tmp", draft.id, "checkout");
    fs.mkdirSync(checkoutPath, { recursive: true });
    fs.writeFileSync(path.join(checkoutPath, "source.txt"), "sealed even on failure");

    const failed = await runCli(["composition", "build", composition.id, "--revision", draft.id]);
    expect(failed.exitCode).not.toBe(0);
    expect(getCompositionRevision({ context: { workspaceId, projectId }, revisionId: draft.id }).state).toBe("sealed");
    expect(fs.readFileSync(path.join(checkoutPath, "source.txt"), "utf8")).toBe("sealed even on failure");
    const retry = await runCli(["composition", "build", composition.id, "--revision", draft.id]);
    expect(retry.exitCode).not.toBe(0);
  });

  test("uses only exact ordered Artifact revision inputs and never scans legacy artifact directories", async () => {
    const first = await artifactRevision("first", "one");
    const second = await artifactRevision("second", "two");
    const composition = createComposition({ projectId, slug: "inputs", kind: "video" });
    const draft = reviseComposition({
      compositionId: composition.id,
      expectedLatestRevisionId: null,
      engine: "manual",
      engineConfig: { outputs: [
        { inputPosition: 1, slug: "second-out", kind: "document", mime: "text/plain", role: "second" },
        { inputPosition: 0, slug: "first-out", kind: "document", mime: "text/plain", role: "first" },
      ] },
    });
    bindCompositionInput({ revisionId: draft.id, artifactRevisionId: first.id, role: "scene", position: 0 });
    bindCompositionInput({ revisionId: draft.id, artifactRevisionId: second.id, role: "scene", position: 1 });
    const checkoutPath = path.join(dataRoot, "tmp", draft.id, "checkout");
    fs.mkdirSync(checkoutPath, { recursive: true });
    const legacyArtifacts = path.join(fixtureRoot, "artifacts", "videos");
    fs.mkdirSync(legacyArtifacts, { recursive: true });
    fs.writeFileSync(path.join(legacyArtifacts, "rogue.txt"), "must not be scanned");

    const built = expectOk<BuildResult>(await runCli([
      "composition", "build", composition.id, "--revision", draft.id,
    ]));
    expect(built.outputs.map((output) => output.role)).toEqual(["second", "first"]);
    const outputBytes = built.outputs.map((output) => fs.readFileSync(storedObjectPath(output.objectId), "utf8"));
    expect(outputBytes).toEqual(["two", "one"]);
  });

  test("rejects stale selection/builds, unsupported engines, and missing input bytes", async () => {
    const base = await compositionWithSource("conflicts", "base");
    const staleDraft = reviseComposition({
      compositionId: base.compositionId,
      expectedLatestRevisionId: base.revisionId,
      engine: "manual",
      engineConfig: { outputs: [{ source: "index.html", slug: "old", kind: "document", mime: "text/html" }] },
    });
    const newest = reviseComposition({
      compositionId: base.compositionId,
      expectedLatestRevisionId: staleDraft.id,
      engine: "remotion",
      engineConfig: {},
    });
    const staleCheckout = path.join(dataRoot, "tmp", staleDraft.id, "checkout");
    fs.mkdirSync(staleCheckout, { recursive: true });
    fs.writeFileSync(path.join(staleCheckout, "index.html"), "old");
    const stale = await runCli(["composition", "build", base.compositionId, "--revision", staleDraft.id]);
    expect(errorCode(stale.stderr)).toBe("E_CONFLICT");

    const newestCheckout = path.join(dataRoot, "tmp", newest.id, "checkout");
    fs.mkdirSync(newestCheckout, { recursive: true });
    fs.writeFileSync(path.join(newestCheckout, "index.html"), "unsupported");
    const unsupported = await runCli(["composition", "build", base.compositionId, "--revision", newest.id]);
    expect(errorCode(unsupported.stderr)).toBe("E_INPUT_INVALID");

    const selected = expectOk<{ selectedRevisionId: string }>(await runCli([
      "composition", "select", base.compositionId,
      "--revision", base.revisionId,
      "--expected", "none",
    ]));
    expect(selected.selectedRevisionId).toBe(base.revisionId);
    const staleSelection = await runCli([
      "composition", "select", base.compositionId,
      "--revision", base.revisionId,
      "--expected", "none",
    ]);
    expect(errorCode(staleSelection.stderr)).toBe("E_CONFLICT");

    const missing = await artifactRevision("missing", "gone");
    const missingComposition = createComposition({ projectId, slug: "missing-input", kind: "video" });
    const missingDraft = reviseComposition({
      compositionId: missingComposition.id,
      expectedLatestRevisionId: null,
      engine: "manual",
      engineConfig: { outputs: [{ inputPosition: 0, slug: "gone", kind: "document", mime: "text/plain" }] },
    });
    bindCompositionInput({ revisionId: missingDraft.id, artifactRevisionId: missing.id, role: "input", position: 0 });
    fs.unlinkSync(storedObjectPath(missing.objectId));
    fs.mkdirSync(path.join(dataRoot, "tmp", missingDraft.id, "checkout"), { recursive: true });
    const missingResult = await runCli(["composition", "build", missingComposition.id, "--revision", missingDraft.id]);
    expect(missingResult.exitCode).not.toBe(0);
    expect(getCompositionRevision({ context: { workspaceId, projectId }, revisionId: missingDraft.id }).state).toBe("draft");
  });

  test("rejects checkout root replacement, entry replacement, hardlinks, and special files without touching external sentinels", async () => {
    const composition = createComposition({ projectId, slug: "pinned-checkout", kind: "video" });
    const draft = await reviseCompositionCheckout({
      compositionId: composition.id, expectedLatestRevisionId: null, engine: "manual",
      engineConfig: { outputs: [{ source: "index.html", slug: "safe", kind: "document", mime: "text/html" }] },
    });
    fs.writeFileSync(path.join(draft.checkoutPath, "index.html"), "safe");
    const external = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-external-sentinel-"));
    const sentinel = path.join(external, "sentinel.txt");
    fs.writeFileSync(sentinel, "external");
    const original = `${draft.checkoutPath}.original`;
    fs.renameSync(draft.checkoutPath, original);
    fs.symlinkSync(external, draft.checkoutPath);
    await expect(runCompositionBuild({ compositionId: composition.id, revisionId: draft.id })).rejects.toThrow();
    expect(fs.readFileSync(sentinel, "utf8")).toBe("external");
    fs.unlinkSync(draft.checkoutPath);
    fs.renameSync(original, draft.checkoutPath);
    fs.linkSync(sentinel, path.join(draft.checkoutPath, "hardlink.txt"));
    await expect(runCompositionBuild({ compositionId: composition.id, revisionId: draft.id })).rejects.toThrow();
    fs.unlinkSync(path.join(draft.checkoutPath, "hardlink.txt"));
    Bun.spawnSync(["mkfifo", path.join(draft.checkoutPath, "special")]);
    if (fs.existsSync(path.join(draft.checkoutPath, "special"))) {
      await expect(runCompositionBuild({ compositionId: composition.id, revisionId: draft.id })).rejects.toThrow();
      fs.unlinkSync(path.join(draft.checkoutPath, "special"));
    }
    await expect(runCompositionBuild({
      compositionId: composition.id,
      revisionId: draft.id,
      testHooks: { afterCheckoutEnumerated: () => {
        fs.unlinkSync(path.join(draft.checkoutPath, "index.html"));
        fs.symlinkSync(sentinel, path.join(draft.checkoutPath, "index.html"));
      } },
    } as never)).rejects.toThrow();
    expect(fs.readFileSync(sentinel, "utf8")).toBe("external");
  });

  test("atomically replaces the complete source set and seals against concurrent revise or injected transaction failure", async () => {
    const base = await compositionWithSource("atomic-snapshot", "old");
    const draft = await reviseCompositionCheckout({
      compositionId: base.compositionId, expectedLatestRevisionId: base.revisionId, engine: "manual",
      engineConfig: { outputs: [{ source: "index.html", slug: "out", kind: "document", mime: "text/html" }] },
    });
    fs.writeFileSync(path.join(draft.checkoutPath, "index.html"), "new");
    await expect(runCompositionBuild({
      compositionId: base.compositionId, revisionId: draft.id,
      testHooks: { beforeSnapshotCommit: () => reviseComposition({
        compositionId: base.compositionId, expectedLatestRevisionId: draft.id,
        engine: "manual", engineConfig: {},
      }) },
    } as never)).rejects.toThrow(/conflict/i);
    expect(getCompositionRevision({ context: { workspaceId, projectId }, revisionId: draft.id }).state).toBe("draft");

    const latest = openDomainDb().query<{ id: string }, []>("SELECT id FROM composition_revisions ORDER BY revision_no DESC LIMIT 1").get()!.id;
    const second = await reviseCompositionCheckout({
      compositionId: base.compositionId, expectedLatestRevisionId: latest, engine: "manual",
      engineConfig: { outputs: [{ source: "index.html", slug: "out-2", kind: "document", mime: "text/html" }] },
    });
    fs.writeFileSync(path.join(second.checkoutPath, "index.html"), "newer");
    await expect(runCompositionBuild({
      compositionId: base.compositionId, revisionId: second.id,
      testHooks: { beforeSnapshotTransactionCommit: () => { throw new Error("snapshot transaction crash"); } },
    } as never)).rejects.toThrow(/snapshot transaction crash/);
    expect(getCompositionRevision({ context: { workspaceId, projectId }, revisionId: second.id }).state).toBe("draft");
  });

  test("atomically succeeds Run, Attempt, Artifact outputs, Build, and ordered build_outputs", async () => {
    const composition = createComposition({ projectId, slug: "atomic-completion", kind: "video" });
    const draft = await reviseCompositionCheckout({
      compositionId: composition.id, expectedLatestRevisionId: null, engine: "manual",
      engineConfig: { outputs: [{ source: "index.html", slug: "atomic", kind: "document", mime: "text/html" }] },
    });
    fs.writeFileSync(path.join(draft.checkoutPath, "index.html"), "output");
    await expect(runCompositionBuild({
      compositionId: composition.id, revisionId: draft.id,
      testHooks: { beforeBuildCompletionCommit: () => { throw new Error("completion crash"); } },
    } as never)).rejects.toThrow(/request failed/);
    const states = openDomainDb().query<{ runState: string; attemptState: string; buildState: string }, []>(
      `SELECT run.state AS runState, attempt.state AS attemptState, build.state AS buildState
       FROM builds build JOIN runs run ON run.id = build.run_id
       JOIN run_attempts attempt ON attempt.run_id = run.id ORDER BY build.created_at DESC LIMIT 1`,
    ).get()!;
    expect(states).toEqual({ runState: "failed", attemptState: "failed", buildState: "failed" });
    expect(openDomainDb().query<{ count: number }, []>("SELECT COUNT(*) AS count FROM build_outputs").get()!.count).toBe(0);
  });

  test("rejects invalid profile before sealing or creating operational rows", async () => {
    const composition = createComposition({ projectId, slug: "invalid-profile", kind: "video" });
    const draft = await reviseCompositionCheckout({ compositionId: composition.id, expectedLatestRevisionId: null, engine: "manual", engineConfig: {} });
    fs.writeFileSync(path.join(draft.checkoutPath, "index.html"), "draft");
    await expect(runCompositionBuild({ compositionId: composition.id, revisionId: draft.id, profile: { fps: Number.NaN } as never })).rejects.toThrow();
    expect(getCompositionRevision({ context: { workspaceId, projectId }, revisionId: draft.id }).state).toBe("draft");
    expect(openDomainDb().query<{ count: number }, []>("SELECT COUNT(*) AS count FROM builds").get()!.count).toBe(0);
  });

  test("materializes exact ordered inputs and passes input config plus Build profile to the engine", async () => {
    const first = await artifactRevision("engine-first", "one");
    const second = await artifactRevision("engine-second", "two");
    const composition = createComposition({ projectId, slug: "engine-facts", kind: "video" });
    const draft = await reviseCompositionCheckout({ compositionId: composition.id, expectedLatestRevisionId: null, engine: "manual", engineConfig: { mode: "fixture" } });
    bindCompositionInput({ revisionId: draft.id, artifactRevisionId: first.id, role: "scene", position: 0, config: { slot: "a" } });
    bindCompositionInput({ revisionId: draft.id, artifactRevisionId: second.id, role: "voiceover", position: 1, config: { startAtSec: 2 } });
    fs.writeFileSync(path.join(draft.checkoutPath, "source.txt"), "source");
    let observed: unknown;
    const built = await runCompositionBuild({
      compositionId: composition.id, revisionId: draft.id, profile: { fps: 24, quality: "draft" },
      testHooks: { runEngine: async (facts: unknown) => { observed = facts; return [{ bytes: "fixture", filename: "fixture.txt", slug: "fixture", kind: "document", mime: "text/plain", role: "master" }]; } },
    } as never);
    expect(built.state).toBe("succeeded");
    expect(observed).toMatchObject({
      engineConfig: { mode: "fixture" }, profile: { fps: 24, quality: "draft" },
      inputs: [{ position: 0, role: "scene", config: { slot: "a" } }, { position: 1, role: "voiceover", config: { startAtSec: 2 } }],
    });
  });

  test("migrated render dry-run is read-only and domain from-clip rejects without legacy fallback", async () => {
    const base = await compositionWithSource("render-domain", "html");
    const draft = await reviseCompositionCheckout({ compositionId: base.compositionId, expectedLatestRevisionId: base.revisionId, engine: "manual", engineConfig: {} });
    const before = openDomainDb().query<{ runs: number; builds: number }, []>("SELECT (SELECT COUNT(*) FROM runs) AS runs, (SELECT COUNT(*) FROM builds) AS builds").get()!;
    expectOk(await runCli(["render", projectId, "--dry-run"]));
    expect(openDomainDb().query<{ runs: number; builds: number }, []>("SELECT (SELECT COUNT(*) FROM runs) AS runs, (SELECT COUNT(*) FROM builds) AS builds").get()).toEqual(before);
    const fromClip = await runCli(["render", projectId, "--from-clip", path.join(fixtureRoot, "clip.mp4")]);
    expect(errorCode(fromClip.stderr)).toBe("E_INPUT_INVALID");
    expect(getCompositionRevision({ context: { workspaceId, projectId }, revisionId: draft.id }).state).toBe("draft");
  });

  test("migrated compose dry-run is read-only and rejects legacy-only mutation flags", async () => {
    const base = await compositionWithSource("compose-domain", "html");
    await reviseCompositionCheckout({ compositionId: base.compositionId, expectedLatestRevisionId: base.revisionId, engine: "manual", engineConfig: {} });
    const before = openDomainDb().query<{ runs: number; builds: number }, []>("SELECT (SELECT COUNT(*) FROM runs) AS runs, (SELECT COUNT(*) FROM builds) AS builds").get()!;
    expectOk(await runCli(["compose", projectId, "--dry-run"]));
    expect(openDomainDb().query<{ runs: number; builds: number }, []>("SELECT (SELECT COUNT(*) FROM runs) AS runs, (SELECT COUNT(*) FROM builds) AS builds").get()).toEqual(before);
    expect(errorCode((await runCli(["compose", projectId, "--remove-segment", "scene"])).stderr)).toBe("E_INPUT_INVALID");
    expect(errorCode((await runCli(["compose", projectId, "--out", "elsewhere.mp4"])).stderr)).toBe("E_INPUT_INVALID");
  });

  test("hyperframes save-version delegates through the explicit root outside cwd", async () => {
    const base = await compositionWithSource("hyperframes-root", "<html></html>");
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-outside-cwd-"));
    const result = await runCli(["hyperframes", "save-version", projectId], outside);
    const revised = expectOk<RevisionResult>(result);
    expect(revised.parentRevisionId).toBe(base.revisionId);
    expect(revised.checkoutPath).toContain(path.join(fs.realpathSync(dataRoot), "tmp"));
  });

  test("materializes revise checkout through pinned directories and rejects a replaced root", async () => {
    const base = await compositionWithSource("revise-pinned", "source");
    const external = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-revise-external-"));
    const sentinel = path.join(external, "sentinel.txt");
    fs.writeFileSync(sentinel, "external");
    let attacked = false;
    await expect(reviseCompositionCheckout({
      compositionId: base.compositionId,
      expectedLatestRevisionId: base.revisionId,
      engine: "manual",
      engineConfig: {},
      testHooks: { afterCheckoutOpened: (checkoutPath: string) => {
        attacked = true;
        fs.renameSync(checkoutPath, `${checkoutPath}.original`);
        fs.symlinkSync(external, checkoutPath);
      } },
    } as never)).rejects.toThrow(/changed|conflict/i);
    expect(attacked).toBe(true);
    expect(fs.readFileSync(sentinel, "utf8")).toBe("external");
  });

  test("keeps engine source and output pinned across concurrent root and entry replacement", async () => {
    const composition = createComposition({ projectId, slug: "engine-pinned", kind: "video" });
    const draft = await reviseCompositionCheckout({
      compositionId: composition.id, expectedLatestRevisionId: null, engine: "manual",
      engineConfig: { mode: "fixture" },
    });
    fs.writeFileSync(path.join(draft.checkoutPath, "index.html"), "source");
    const external = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-engine-external-"));
    const sentinel = path.join(external, "sentinel.txt");
    fs.writeFileSync(sentinel, "external");
    let attacked = false;
    await expect(runCompositionBuild({
      compositionId: composition.id,
      revisionId: draft.id,
      testHooks: {
        beforeEngineLaunch: ({ sourcePath, outputPath }: { sourcePath: string; outputPath: string }) => {
          attacked = true;
          fs.writeFileSync(outputPath, "placeholder");
          fs.renameSync(outputPath, `${outputPath}.original`);
          fs.symlinkSync(sentinel, outputPath);
          fs.renameSync(sourcePath, `${sourcePath}.original`);
          fs.symlinkSync(external, sourcePath);
        },
        runEngine: async () => [{ bytes: "fixture", filename: "fixture.txt", slug: "fixture", kind: "document", mime: "text/plain", role: "master" }],
      },
    } as never)).rejects.toThrow();
    expect(attacked).toBe(true);
    expect(fs.readFileSync(sentinel, "utf8")).toBe("external");
  });

  test("streams build source and output promotion without whole-file synchronous reads", async () => {
    const composition = createComposition({ projectId, slug: "streaming-build", kind: "video" });
    const draft = await reviseCompositionCheckout({
      compositionId: composition.id, expectedLatestRevisionId: null, engine: "manual",
      engineConfig: { mode: "fixture" },
    });
    fs.writeFileSync(path.join(draft.checkoutPath, "large.bin"), Buffer.alloc(2 * 1024 * 1024, 7));
    const read = spyOn(fs, "readFileSync").mockImplementation(() => {
      throw new Error("whole-file sync read forbidden");
    });
    try {
      const built = await runCompositionBuild({
        compositionId: composition.id,
        revisionId: draft.id,
        testHooks: { runEngine: async () => [{ bytes: Buffer.alloc(2 * 1024 * 1024, 9), filename: "large.bin", slug: "large", kind: "document", mime: "application/octet-stream" }] },
      } as never);
      expect(built.state).toBe("succeeded");
    } finally {
      read.mockRestore();
    }
  });

  test("rolls back snapshot sealing and all operational rows when atomic start fails", async () => {
    const composition = createComposition({ projectId, slug: "atomic-start", kind: "video" });
    const draft = await reviseCompositionCheckout({
      compositionId: composition.id, expectedLatestRevisionId: null, engine: "manual",
      engineConfig: { outputs: [{ source: "index.html", slug: "out", kind: "document", mime: "text/html" }] },
    });
    fs.writeFileSync(path.join(draft.checkoutPath, "index.html"), "source");
    await expect(runCompositionBuild({
      compositionId: composition.id,
      revisionId: draft.id,
      testHooks: { beforeBuildStartTransactionCommit: () => { throw new Error("atomic start crash"); } },
    } as never)).rejects.toThrow(/atomic start crash/);
    expect(getCompositionRevision({ context: { workspaceId, projectId }, revisionId: draft.id }).state).toBe("draft");
    expect(openDomainDb().query<{ runs: number; attempts: number; builds: number }, []>(
      "SELECT (SELECT COUNT(*) FROM runs) AS runs, (SELECT COUNT(*) FROM run_attempts) AS attempts, (SELECT COUNT(*) FROM builds) AS builds",
    ).get()).toEqual({ runs: 0, attempts: 0, builds: 0 });
  });

  test("conflicts when an input role or canonical config changes during snapshot", async () => {
    const input = await artifactRevision("tuple-input", "one");
    const composition = createComposition({ projectId, slug: "tuple-conflict", kind: "video" });
    const draft = await reviseCompositionCheckout({
      compositionId: composition.id, expectedLatestRevisionId: null, engine: "manual",
      engineConfig: { mode: "fixture" },
    });
    bindCompositionInput({ revisionId: draft.id, artifactRevisionId: input.id, role: "scene", position: 0, config: { slot: "a" } });
    fs.writeFileSync(path.join(draft.checkoutPath, "index.html"), "source");
    await expect(runCompositionBuild({
      compositionId: composition.id,
      revisionId: draft.id,
      testHooks: { beforeSnapshotCommit: () => openDomainDb().prepare(
        "UPDATE composition_inputs SET role = 'voiceover', config_json = '{\"slot\":\"b\"}' WHERE composition_revision_id = ?",
      ).run(draft.id), runEngine: async () => [{ bytes: "fixture", filename: "fixture.txt", slug: "fixture", kind: "document", mime: "text/plain" }] },
    } as never)).rejects.toThrow(/inputs changed/i);
    expect(getCompositionRevision({ context: { workspaceId, projectId }, revisionId: draft.id }).state).toBe("draft");
  });

  test("passes supported MP4 render fields and rejects unsupported formats, summary, and legacy post-processing", async () => {
    const base = await compositionWithSource("render-profile", "html");
    await reviseCompositionCheckout({ compositionId: base.compositionId, expectedLatestRevisionId: base.revisionId, engine: "manual", engineConfig: {} });
    const plan = expectOk<{ profile: Record<string, unknown> }>(await runCli([
      "render", projectId, "--dry-run", "--format", "mp4", "--resolution", "portrait", "--workers", "2",
    ]));
    expect(plan.profile).toMatchObject({ format: "mp4", resolution: "portrait", workers: "2" });
    for (const format of ["webm", "mov", "png-sequence"]) {
      const rejected = await runCli(["render", projectId, "--dry-run", "--format", format]);
      expect(errorCode(rejected.stderr)).toBe("E_INPUT_INVALID");
      expect(rejected.stderr).toContain("for format:");
    }
    const summary = await runCli(["render", projectId, "--dry-run", "--summary"]);
    expect(errorCode(summary.stderr)).toBe("E_INPUT_INVALID");
    expect(summary.stderr).toContain("for summary:");
    expect(errorCode((await runCli(["render", projectId, "--loudnorm"])).stderr)).toBe("E_INPUT_INVALID");
  });

  test("rejects non-MP4 Build profiles before sealing or creating lifecycle rows", async () => {
    for (const format of ["webm", "mov", "png-sequence"]) {
      const composition = createComposition({ projectId, slug: `format-${format}`, kind: "video" });
      const draft = await reviseCompositionCheckout({ compositionId: composition.id, expectedLatestRevisionId: null, engine: "manual", engineConfig: { mode: "fixture" } });
      fs.writeFileSync(path.join(draft.checkoutPath, "index.html"), "source");
      await expect(runCompositionBuild({
        compositionId: composition.id,
        revisionId: draft.id,
        profile: { format },
        testHooks: { runEngine: async () => [{ bytes: "video", filename: "master.mp4", slug: "master", kind: "video", mime: "video/mp4" }] },
      } as never)).rejects.toMatchObject({ code: "E_INPUT_INVALID", details: { field: "format" } });
      expect(getCompositionRevision({ context: { workspaceId, projectId }, revisionId: draft.id }).state).toBe("draft");
    }
    expect(openDomainDb().query<{ runs: number; builds: number }, []>(
      "SELECT (SELECT COUNT(*) FROM runs) AS runs, (SELECT COUNT(*) FROM builds) AS builds",
    ).get()).toEqual({ runs: 0, builds: 0 });
  });

  test("hyperframes domain namespace rejects unconsumed composition and quality options before lifecycle", async () => {
    const base = await compositionWithSource("hyperframes-options", "html");
    await reviseCompositionCheckout({ compositionId: base.compositionId, expectedLatestRevisionId: base.revisionId, engine: "manual", engineConfig: {} });
    for (const args of [
      ["--composition", "alternate.html"],
      ["--quality", "web"],
      ["--quality", "print"],
      ["--quality", "archive"],
    ]) {
      const rejected = await runCli(["hyperframes", "render", projectId, ...args]);
      expect(errorCode(rejected.stderr)).toBe("E_INPUT_INVALID");
      expect(rejected.stderr).toContain(`for ${args[0]!.slice(2)}:`);
    }
    expect(openDomainDb().query<{ runs: number; builds: number }, []>(
      "SELECT (SELECT COUNT(*) FROM runs) AS runs, (SELECT COUNT(*) FROM builds) AS builds",
    ).get()).toEqual({ runs: 0, builds: 0 });
  });

  test("resolves positional projects for render, compose, and hyperframes render under a multi-Workspace root", async () => {
    const otherWorkspace = createWorkspace({ slug: "other-workspace", name: "Other Workspace" });
    const otherProject = createProject({ workspaceId: otherWorkspace.id, slug: "other-video", name: "Other Video" });
    const sourcePath = path.join(fixtureRoot, "other-index.html");
    fs.writeFileSync(sourcePath, "other");
    const object = await ingestObject({
      scope: { workspaceId: otherWorkspace.id, projectId: otherProject.id }, sourcePath,
      originalName: "index.html", mime: "text/html", storageClass: "durable", transfer: "copy",
    });
    const composition = createComposition({ projectId: otherProject.id, slug: "other-composition", kind: "video" });
    const revision = reviseComposition({ compositionId: composition.id, expectedLatestRevisionId: null, engine: "manual", engineConfig: {} });
    putCompositionSource({ revisionId: revision.id, logicalPath: "index.html", objectId: object.id });
    sealCompositionRevision({ revisionId: revision.id });

    for (const args of [["render", otherProject.id, "--dry-run"], ["compose", otherProject.id, "--dry-run"]]) {
      const result = await runCli(args);
      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.json.projectId).toBe(otherProject.id);
    }
    const hyperframes = await runCli(["hyperframes", "render", otherProject.id, "--composition", "alternate.html"]);
    expect(errorCode(hyperframes.stderr)).toBe("E_INPUT_INVALID");
    expect(hyperframes.stderr).toContain("for composition:");
  });

  test("terminalizes Build, Attempt, and Run when the post-start revision reload fails", async () => {
    const composition = createComposition({ projectId, slug: "reload-failure", kind: "video" });
    const draft = await reviseCompositionCheckout({ compositionId: composition.id, expectedLatestRevisionId: null, engine: "manual", engineConfig: { mode: "fixture" } });
    fs.writeFileSync(path.join(draft.checkoutPath, "index.html"), "source");
    let injected = false;
    await expect(runCompositionBuild({
      compositionId: composition.id,
      revisionId: draft.id,
      testHooks: {
        beforeBuildRevisionReload: () => { injected = true; throw new Error("reload crash"); },
        runEngine: async () => [{ bytes: "fixture", filename: "fixture.txt", slug: "fixture", kind: "document", mime: "text/plain" }],
      },
    } as never)).rejects.toThrow(/request failed/);
    expect(injected).toBe(true);
    expect(openDomainDb().query<{ runState: string; attemptState: string; buildState: string }, []>(
      `SELECT run.state AS runState, attempt.state AS attemptState, build.state AS buildState
       FROM builds build JOIN runs run ON run.id = build.run_id
       JOIN run_attempts attempt ON attempt.run_id = run.id`,
    ).get()).toEqual({ runState: "failed", attemptState: "failed", buildState: "failed" });
  });

  test("restores modes and closes descriptors after every materialization construction phase fails", async () => {
    const phases = ["directories", "sources", "inputs", "output", "chmod"];
    const external = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-materialize-sentinel-"));
    const sentinel = path.join(external, "sentinel.txt");
    fs.writeFileSync(sentinel, "external");
    for (const phase of phases) {
      const composition = createComposition({ projectId, slug: `materialize-${phase}`, kind: "video" });
      const draft = await reviseCompositionCheckout({ compositionId: composition.id, expectedLatestRevisionId: null, engine: "manual", engineConfig: { mode: "fixture" } });
      fs.writeFileSync(path.join(draft.checkoutPath, "index.html"), "source");
      let injected = false;
      await expect(runCompositionBuild({
        compositionId: composition.id,
        revisionId: draft.id,
        testHooks: {
          materializeEnginePhase: (actual: string) => {
            if (actual === phase) { injected = true; throw new Error(`materialize ${phase} crash`); }
          },
          runEngine: async () => [{ bytes: "fixture", filename: "fixture.txt", slug: "fixture", kind: "document", mime: "text/plain" }],
        },
      } as never)).rejects.toThrow(/request failed/);
      expect(injected).toBe(true);
      const runId = openDomainDb().query<{ id: string }, [string]>(
        `SELECT run.id FROM builds build JOIN runs run ON run.id = build.run_id
         WHERE build.composition_revision_id = ? ORDER BY build.created_at DESC LIMIT 1`,
      ).get(draft.id)!.id;
      const runPath = path.join(dataRoot, "tmp", runId);
      expect(openDescriptorTargets().filter((target) => target.startsWith(runPath))).toEqual([]);
      const sourceDir = path.join(dataRoot, "tmp", runId, "source");
      if (fs.existsSync(sourceDir)) {
        expect(fs.statSync(sourceDir).mode & 0o777).toBe(0o700);
        for (const name of fs.readdirSync(sourceDir)) {
          const entry = path.join(sourceDir, name);
          if (fs.statSync(entry).isFile()) expect(fs.statSync(entry).mode & 0o777).toBe(0o600);
        }
      }
      expect(fs.readFileSync(sentinel, "utf8")).toBe("external");
    }
  });

  test("does not commit a draft when checkout directory setup fails", async () => {
    const base = await compositionWithSource("revise-disk-failure", "base");
    let checkoutPath = "";
    await expect(reviseCompositionCheckout({
      compositionId: base.compositionId,
      expectedLatestRevisionId: base.revisionId,
      engine: "manual",
      engineConfig: {},
      testHooks: { afterCheckoutOpened: (path: string) => { checkoutPath = path; throw new Error("checkout setup crash"); } },
    })).rejects.toThrow(/checkout setup crash/);
    expect(openDomainDb().query<{ id: string }, [string]>(
      "SELECT id FROM composition_revisions WHERE composition_id = ? ORDER BY revision_no DESC LIMIT 1",
    ).get(base.compositionId)!.id).toBe(base.revisionId);
    expect(fs.existsSync(checkoutPath)).toBe(false);
  });

  test("does not commit a draft when pinned parent copy fails", async () => {
    const base = await compositionWithSource("revise-copy-failure", "base");
    let checkoutPath = "";
    await expect(reviseCompositionCheckout({
      compositionId: base.compositionId,
      expectedLatestRevisionId: base.revisionId,
      engine: "manual",
      engineConfig: {},
      testHooks: { afterCheckoutEntryCopied: (facts: { checkoutPath: string }) => {
        checkoutPath = facts.checkoutPath;
        throw new Error("checkout copy crash");
      } },
    } as never)).rejects.toThrow(/checkout copy crash/);
    expect(openDomainDb().query<{ id: string }, [string]>(
      "SELECT id FROM composition_revisions WHERE composition_id = ? ORDER BY revision_no DESC LIMIT 1",
    ).get(base.compositionId)!.id).toBe(base.revisionId);
    expect(fs.existsSync(checkoutPath)).toBe(false);
  });

  test("cleans the materialized orphan when a concurrent latest revision wins", async () => {
    const base = await compositionWithSource("revise-race", "base");
    let concurrentId = "";
    let checkoutPath = "";
    await expect(reviseCompositionCheckout({
      compositionId: base.compositionId,
      expectedLatestRevisionId: base.revisionId,
      engine: "manual",
      engineConfig: {},
      testHooks: { beforeRevisionCommit: (facts: { checkoutPath: string }) => {
        checkoutPath = facts.checkoutPath;
        concurrentId = reviseComposition({
          compositionId: base.compositionId,
          expectedLatestRevisionId: base.revisionId,
          engine: "manual",
          engineConfig: {},
        }).id;
      } },
    } as never)).rejects.toThrow(/conflict/i);
    expect(openDomainDb().query<{ id: string }, [string]>(
      "SELECT id FROM composition_revisions WHERE composition_id = ? ORDER BY revision_no DESC LIMIT 1",
    ).get(base.compositionId)!.id).toBe(concurrentId);
    expect(fs.existsSync(checkoutPath)).toBe(false);
  });

  test("conflicts and cleans checkout when the captured parent source or input tuple changes", async () => {
    for (const changed of ["source", "input"] as const) {
      const originalPath = path.join(fixtureRoot, `${changed}-original.html`);
      const replacementPath = path.join(fixtureRoot, `${changed}-replacement.html`);
      fs.writeFileSync(originalPath, "original");
      fs.writeFileSync(replacementPath, "replacement");
      const original = await ingestObject({
        scope: { workspaceId, projectId }, sourcePath: originalPath, originalName: "index.html",
        mime: "text/html", storageClass: "durable", transfer: "copy",
      });
      const replacement = await ingestObject({
        scope: { workspaceId, projectId }, sourcePath: replacementPath, originalName: "index.html",
        mime: "text/html", storageClass: "durable", transfer: "copy",
      });
      const firstInput = await artifactRevision(`${changed}-first-input`, "first");
      const secondInput = await artifactRevision(`${changed}-second-input`, "second");
      const composition = createComposition({ projectId, slug: `parent-tuple-${changed}`, kind: "video" });
      const parent = reviseComposition({ compositionId: composition.id, expectedLatestRevisionId: null, engine: "manual", engineConfig: {} });
      putCompositionSource({ revisionId: parent.id, logicalPath: "index.html", objectId: original.id, position: 0 });
      bindCompositionInput({ revisionId: parent.id, artifactRevisionId: firstInput.id, role: "scene", position: 0, config: { slot: "a" } });
      let checkoutPath = "";
      await expect(reviseCompositionCheckout({
        compositionId: composition.id,
        expectedLatestRevisionId: parent.id,
        engine: "manual",
        engineConfig: {},
        testHooks: { beforeRevisionCommit: (facts) => {
          checkoutPath = facts.checkoutPath;
          if (changed === "source") {
            putCompositionSource({ revisionId: parent.id, logicalPath: "index.html", objectId: replacement.id, position: 0 });
          } else {
            bindCompositionInput({ revisionId: parent.id, artifactRevisionId: secondInput.id, role: "voiceover", position: 0, config: { slot: "b" } });
          }
        } },
      })).rejects.toThrow(/conflict|changed/i);
      expect(openDomainDb().query<{ count: number }, [string]>(
        "SELECT COUNT(*) AS count FROM composition_revisions WHERE composition_id = ?",
      ).get(composition.id)!.count).toBe(1);
      expect(fs.existsSync(checkoutPath)).toBe(false);
    }
  });

  test("resolves hyperframes save-version positional Project under a multi-Workspace root", async () => {
    const otherWorkspace = createWorkspace({ slug: "save-other-workspace", name: "Save Other Workspace" });
    const otherProject = createProject({ workspaceId: otherWorkspace.id, slug: "save-other-video", name: "Save Other Video" });
    const sourcePath = path.join(fixtureRoot, "save-other-index.html");
    fs.writeFileSync(sourcePath, "other");
    const object = await ingestObject({
      scope: { workspaceId: otherWorkspace.id, projectId: otherProject.id }, sourcePath,
      originalName: "index.html", mime: "text/html", storageClass: "durable", transfer: "copy",
    });
    const composition = createComposition({ projectId: otherProject.id, slug: "save-other-composition", kind: "video" });
    const revision = reviseComposition({ compositionId: composition.id, expectedLatestRevisionId: null, engine: "manual", engineConfig: {} });
    putCompositionSource({ revisionId: revision.id, logicalPath: "index.html", objectId: object.id });
    sealCompositionRevision({ revisionId: revision.id });

    const result = await runCli(["hyperframes", "save-version", otherProject.id]);
    const revised = expectOk<RevisionResult>(result);
    expect(revised.parentRevisionId).toBe(revision.id);
    expect(revised.checkoutPath).toContain(revised.id);
  });

  test("hyperframes render calls the domain controller directly with explicit root and no legacy lifecycle", async () => {
    const base = await compositionWithSource("hyperframes-direct", "<!doctype html><html></html>");
    const draft = await reviseCompositionCheckout({
      compositionId: base.compositionId,
      expectedLatestRevisionId: base.revisionId,
      engine: "hyperframes",
      engineConfig: {},
    });
    fs.writeFileSync(path.join(draft.checkoutPath, "index.html"), "<!doctype html><html></html>");
    const bin = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-hyperframes-bin-"));
    const nestedBun = path.join(bin, "bun");
    const nestedMarker = path.join(bin, "nested-bun-called");
    fs.writeFileSync(nestedBun, `#!/bin/sh\nprintf called > '${nestedMarker}'\nexit 99\n`);
    fs.chmodSync(nestedBun, 0o755);
    const bunx = path.join(bin, "bunx");
    fs.writeFileSync(bunx, "#!/bin/sh\nwhile [ $# -gt 0 ]; do if [ \"$1\" = \"--output\" ]; then shift; printf video > \"$1\"; exit 0; fi; shift; done\nexit 2\n");
    fs.chmodSync(bunx, 0o755);
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "ralphy-hyperframes-cwd-"));
    const result = await runCli(["hyperframes", "render", projectId], outside, {
      PATH: `${bin}:${process.env.PATH ?? ""}`,
    });
    expectOk(result);
    expect(fs.existsSync(nestedMarker)).toBe(false);
    expect(fs.existsSync(path.join(dataRoot, "workspaces", workspaceId, "projects", projectId, "generations.jsonl"))).toBe(false);
  });
});

async function compositionWithSource(slug: string, bytes: string) {
  const sourcePath = path.join(fixtureRoot, `${slug}.html`);
  fs.writeFileSync(sourcePath, bytes);
  const object = await ingestObject({
    scope: { workspaceId, projectId }, sourcePath, originalName: "index.html",
    mime: "text/html", storageClass: "durable", transfer: "copy",
  });
  const composition = createComposition({ projectId, slug, kind: "video" });
  const revision = reviseComposition({
    compositionId: composition.id, expectedLatestRevisionId: null,
    engine: "manual", engineConfig: {},
  });
  putCompositionSource({ revisionId: revision.id, logicalPath: "index.html", objectId: object.id });
  sealCompositionRevision({ revisionId: revision.id });
  return { compositionId: composition.id, revisionId: revision.id };
}

async function artifactRevision(slug: string, bytes: string) {
  const sourcePath = path.join(fixtureRoot, `${slug}.txt`);
  fs.writeFileSync(sourcePath, bytes);
  const object = await ingestObject({
    scope: { workspaceId, projectId }, sourcePath, originalName: `${slug}.txt`,
    mime: "text/plain", storageClass: "durable", transfer: "copy",
  });
  const artifact = createArtifact({ projectId, slug, kind: "document" });
  return addArtifactRevision({ artifactId: artifact.id, objectId: object.id, parentRevisionId: null, state: "working" });
}

async function runCli(args: string[], cwd = fixtureRoot, env: Record<string, string> = {}) {
  const child = Bun.spawn([process.execPath, "run", CLI, "--json", "--root", dataRoot, ...args], {
    cwd, env: { ...process.env, ...env, NO_COLOR: "1" }, stdout: "pipe", stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited,
  ]);
  let json: unknown = null;
  try { json = JSON.parse(stdout); } catch { /* error case */ }
  return { exitCode, stdout, stderr, json };
}

function expectOk<T>(result: Awaited<ReturnType<typeof runCli>>): T {
  expect(result.exitCode, result.stderr).toBe(0);
  return result.json as T;
}

function errorCode(stderr: string): string | null {
  for (const line of stderr.trim().split("\n").reverse()) {
    try {
      const parsed = JSON.parse(line) as { error?: { code?: string } };
      if (parsed.error?.code) return parsed.error.code;
    } catch { /* diagnostic */ }
  }
  return null;
}

function openDescriptorTargets(): string[] {
  return fs.readdirSync("/dev/fd").flatMap((name) => {
    try { return [fs.readlinkSync(path.join("/dev/fd", name))]; } catch { return []; }
  });
}

type RevisionResult = { id: string; parentRevisionId: string | null; checkoutPath: string };
type BuildResult = {
  id: string;
  compositionRevisionId: string;
  state: string;
  outputs: Array<{ artifactRevisionId: string; objectId: string; role: string | null; position: number }>;
};
