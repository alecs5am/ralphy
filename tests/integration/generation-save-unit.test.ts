import { afterEach, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { saveGenerationToUnit } from "../../apps/desktop/electron/canvas/generation-units.js";
import { importCanvasFile, writeCanvasRun } from "../../apps/desktop/electron/canvas/runtime-files.js";
import type { RuntimeDependencies } from "../../apps/desktop/electron/canvas/runtime.js";
import type { CanvasRun } from "../../apps/desktop/shared/canvas-runtime.js";
import { RalphyBridgeClient } from "../../apps/desktop/electron/ralphy/client.js";
import { closeDomainDb, openDomainDb } from "../../cli/lib/store/db.js";
import { createProject, createWorkspace, upsertSocialAccount } from "../../cli/lib/store/scopes.js";
import { recordPublication } from "../../cli/lib/store/units.js";
import { startRun } from "../../cli/lib/store/runs.js";
import { getObjectRow, resolveObjectPath } from "../../cli/lib/store/internal-objects.js";
import { exportWorkspacePackage, importWorkspaceArchiveFile } from "../../cli/lib/store/portable.js";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";

const roots: TmpRoot[] = [];
let client: RalphyBridgeClient | undefined;
afterEach(async () => { await client?.close(); client = undefined; closeDomainDb(); roots.splice(0).forEach((root) => root.cleanup()); });
const cli = path.resolve(import.meta.dir, "../../cli/index.ts");
async function connect(root: string, workspaceId: string): Promise<RuntimeDependencies> {
  client = new RalphyBridgeClient({ root, spawn: (_bin, args, options) => spawn(process.execPath, [cli, ...args], options) });
  await client.start();
  const request = client.request.bind(client);
  return { root, workspaceId, request: async (method, params) => { try { return await request(method, params); } catch (error) { if (error instanceof Error) error.message = `${method}: ${error.message}`; throw error; } }, cli: async () => { throw new Error("No paid generation allowed"); }, mint: async () => ({ url: "ralphy-media://test" }), assertCurrent() {} };
}
async function fixture(canvasId = "generation-studio") {
  const tmp = makeTmpRoot("ralphy-save-generated-unit"); roots.push(tmp);
  const root = path.join(tmp.dir, ".ralphy"), workspace = createWorkspace({ slug: "studio", name: "Studio" });
  const project = createProject({ workspaceId: workspace.id, slug: "campaign", name: "Campaign" });
  const asset = async (name: string, bytes: string) => { const file = path.join(tmp.dir, name); fs.writeFileSync(file, bytes); return importCanvasFile(root, workspace.id, file); };
  const reference = await asset("reference.png", "source reference bytes"), first = await asset("first.png", "first generated media bytes"), second = await asset("second.png", "second generated media bytes");
  const base = { status: "succeeded" as const, startedAt: 1, endedAt: 2, coreRunIds: [], error: null, estimatedCostUsd: null };
  const outputs = [first, second].map((asset, index) => ({ id: `result-${index}`, nodeId: "model", kind: "image" as const, label: `Created image ${index + 1}`, asset }));
  const run: CanvasRun = { id: "run-save-test", canvasId, workspaceId: workspace.id, canvasRevision: "revision", mode: "execute", status: "succeeded", startedAt: 1, endedAt: 2, error: null,
    snapshot: { version: 2, id: canvasId, name: "Create", nodes: [
      { id: "reference", kind: "media", title: "Reference", value: "", x: 0, y: 0, config: { asset: reference } },
      { id: "prompt", kind: "prompt", title: "Prompt", value: "Original precise instructions", x: 0, y: 100 },
      { id: "model", kind: "model", title: "Image model", value: "Ignored manual prompt", x: 300, y: 0, config: { modality: "image", provider: "openrouter", modelId: "test/image", variants: 2, parameters: { aspectRatio: "16:9" } } },
    ], edges: [{ from: "reference", to: "model", targetPort: "reference" }, { from: "prompt", to: "model", targetPort: "prompt" }] },
    nodes: [{ ...base, nodeId: "reference", results: [{ id: "input-reference", nodeId: "reference", kind: "image", label: "Reference", asset: reference }] }, { ...base, nodeId: "prompt", results: [{ id: "input-prompt", nodeId: "prompt", kind: "text", label: "Prompt", text: "Original precise instructions" }] }, { ...base, nodeId: "model", results: outputs }],
  };
  await writeCanvasRun(root, run); closeDomainDb();
  const runtime = await connect(root, workspace.id);
  return { tmp, root, workspace, project, run, first, second, reference, runtime, source: { canvasId: run.canvasId, runId: run.id, resultId: outputs[0].id } };
}

test("native saved-result lookup creates one unselected Unit, survives a lost response/restart, and rejects changed or forged inputs", async () => {
  const { root, runtime, source, project, first, run } = await fixture();
  const destination = { projectId: project.id, name: "Summer launch" };
  const realRequest = runtime.request;
  runtime.request = async (method, params) => { const value = await realRequest(method, params); if (method === "unit.saveMedia") throw new Error("Connection closed after durable write"); return value; };
  await expect(saveGenerationToUnit(runtime, source, destination)).rejects.toThrow("Connection closed");
  await client!.close();
  const restarted = await connect(root, runtime.workspaceId);
  const [saved, replay] = await Promise.all([saveGenerationToUnit(restarted, source, destination), saveGenerationToUnit(restarted, source, destination)]);
  expect(saved.alreadySaved).toBe(true); expect(replay.revisionId).toBe(saved.revisionId);
  const context = { workspaceId: runtime.workspaceId, projectId: project.id };
  expect((await restarted.request("unit.list", { context })).items).toHaveLength(1);
  expect((await restarted.request("unit.revisions", { context, unitId: saved.unitId })).items).toHaveLength(1);
  expect((await restarted.request("unit.show", { context, unitId: saved.unitId })).selectedRevisionId).toBeNull();
  const metadata = JSON.parse(openDomainDb().query<{ metadata_json: string }, [string]>("SELECT metadata_json FROM unit_revisions WHERE id = ?").get(saved.revisionId)!.metadata_json);
  expect(metadata.generation).toMatchObject({ prompt: "Original precise instructions", modelId: "test/image", provider: "openrouter", modality: "image", operation: "image", variants: 2, referenceBindings: [{ role: "refs", referenceIndex: 0 }], parameters: { aspectRatio: "16:9" }, runId: run.id, resultId: source.resultId });
  expect(metadata.generation.references).toHaveLength(1);
  expect(fs.readFileSync(resolveObjectPath(getObjectRow(openDomainDb(), metadata.generation.references[0].objectId)!), "utf8")).toBe("source reference bytes");
  expect(openDomainDb().query("SELECT id FROM objects").all()).toHaveLength(2);
  await expect(saveGenerationToUnit(restarted, { ...source, resultId: "input-reference" }, destination)).rejects.toThrow("Input references");
  await expect(saveGenerationToUnit(restarted, { ...source, path: "/etc/passwd" } as never, destination)).rejects.toThrow("saved generated result");
  fs.writeFileSync(first.path, "changed bytes");
  await expect(saveGenerationToUnit(restarted, source, destination)).rejects.toThrow("different media or generation details");
  expect((await restarted.request("unit.revisions", { context, unitId: saved.unitId })).items).toHaveLength(1);
}, 20_000);

test("existing Unit saves preserve captions, presentation references, selected versions and publications; stale heads fail before writing", async () => {
  const { runtime, source, project } = await fixture("workflow-example");
  const context = { workspaceId: runtime.workspaceId, projectId: project.id };
  const saved = await saveGenerationToUnit(runtime, source, { projectId: project.id, name: "Campaign image" });
  const original = (await runtime.request("unit.items", { context, revisionId: saved.revisionId })).items[0];
  const staged = await runtime.request("unit.revise", { context, unitId: saved.unitId, expectedLatestRevisionId: saved.revisionId,
    items: [{ artifactRevisionId: original.artifactRevisionId, role: "master", position: 0, config: { fit: "contain" } }],
    presentations: [{ platform: "instagram", position: 0, coverArtifactRevisionId: original.artifactRevisionId, options: { keep: true }, captions: [{ state: "draft", text: "Draft caption" }, { state: "final", text: "Final caption" }], effectiveCaptionRevisionNo: 2, items: [{ unitItemPosition: 0, position: 0, config: { crop: "square" } }] }],
  });
  expect(staged.parentRevisionId).toBe(saved.revisionId);
  await expect(runtime.request("unit.revise", { context, unitId: saved.unitId, expectedLatestRevisionId: staged.id, parentRevisionId: null, items: [{ artifactRevisionId: original.artifactRevisionId, role: "master", position: 0 }] })).rejects.toThrow();
  await runtime.request("unit.select", { context, unitId: saved.unitId, revisionId: staged.id, expectedSelectedRevisionId: null });
  const presentation = (await runtime.request("unit.presentations", { context, revisionId: staged.id })).items[0];
  const account = upsertSocialAccount({ workspaceId: runtime.workspaceId, platform: "instagram", externalId: "account", username: "account" });
  const publication = recordPublication({ presentationId: presentation.id, socialAccountId: account.id, submissionRunId: startRun({ projectId: project.id, kind: "publication" }).id, rail: "postiz", idempotencyKey: "preserved-publication" });
  const source2 = { ...source, resultId: "result-1" };
  await expect(saveGenerationToUnit(runtime, source2, { projectId: project.id, unitId: saved.unitId, expectedLatestRevisionId: saved.revisionId })).rejects.toThrow("Unit changed");
  expect((await runtime.request("unit.revisions", { context, unitId: saved.unitId })).items).toHaveLength(2);
  const added = await saveGenerationToUnit(runtime, source2, { projectId: project.id, unitId: saved.unitId, expectedLatestRevisionId: staged.id });
  const unit = await runtime.request("unit.show", { context, unitId: saved.unitId });
  expect(unit.latestRevisionId).toBe(added.revisionId); expect(unit.selectedRevisionId).toBe(staged.id);
  const item = (await runtime.request("unit.items", { context, revisionId: added.revisionId })).items[0];
  expect(item.artifactRevisionId).not.toBe(original.artifactRevisionId); expect(item.config).toEqual({ fit: "contain" });
  expect((await runtime.request("unit.items", { context, revisionId: added.revisionId })).items[1]).toMatchObject({ role: "cover", artifactRevisionId: original.artifactRevisionId });
  const copied = (await runtime.request("unit.presentations", { context, revisionId: added.revisionId })).items[0];
  expect(copied).toMatchObject({ platform: "instagram", position: 0, coverArtifactRevisionId: original.artifactRevisionId, options: { keep: true } });
  const captions = (await runtime.request("presentation.captions", { context, presentationId: copied.id })).items;
  expect(captions.map((item) => item.text).sort()).toEqual(["Draft caption", "Final caption"]);
  expect(captions.find((item) => item.id === copied.effectiveCaptionRevisionId)?.text).toBe("Final caption");
  expect((await runtime.request("presentation.items", { context, presentationId: copied.id })).items[0]).toMatchObject({ unitItemId: item.id, config: { crop: "square" } });
  expect(openDomainDb().query<{ presentation_id: string }, [string]>("SELECT presentation_id FROM publications WHERE id = ?").get(publication.id)?.presentation_id).toBe(presentation.id);
  const repeat = await saveGenerationToUnit(runtime, source2, { projectId: project.id, unitId: saved.unitId, expectedLatestRevisionId: staged.id });
  expect(repeat.alreadySaved).toBe(true); expect(repeat.revisionId).toBe(added.revisionId);
}, 20_000);

test("simultaneous fresh saves create one revision and native lookup rejects unsupported formats and foreign files", async () => {
  const { runtime, source, project, root, run, tmp } = await fixture("workflow-racing");
  const destination = { projectId: null, name: "Workspace image" };
  const [saved, replay] = await Promise.all([saveGenerationToUnit(runtime, source, destination), saveGenerationToUnit(runtime, source, destination)]);
  expect(replay.unitId).toBe(saved.unitId); expect(replay.revisionId).toBe(saved.revisionId);
  expect([saved.alreadySaved, replay.alreadySaved].sort()).toEqual([false, true]);
  const unsupported = await runtime.request("unit.create", { context: { workspaceId: runtime.workspaceId, projectId: project.id }, slug: "document", format: "article" });
  await expect(saveGenerationToUnit(runtime, source, { projectId: project.id, unitId: unsupported.id, expectedLatestRevisionId: null })).rejects.toThrow("Other Unit formats");
  const foreign = path.join(tmp.dir, "foreign.png"); fs.writeFileSync(foreign, "outside the workspace");
  run.nodes.at(-1)!.results[0].asset!.path = foreign; await writeCanvasRun(root, run);
  await expect(saveGenerationToUnit(runtime, source, { projectId: project.id, name: "Blocked" })).rejects.toThrow();
  expect((await runtime.request("unit.list", { context: { workspaceId: runtime.workspaceId, projectId: project.id } })).items.filter((unit) => unit.projectId === project.id).map((unit) => unit.id)).toEqual([unsupported.id]);
}, 20_000);

test.each(["video", "audio"] as const)("saved %s Units keep the effective task, variation count and reference roles without the source run", async (kind) => {
  const { runtime, source, root, run, tmp } = await fixture();
  const file = path.join(tmp.dir, kind === "video" ? "generated.mp4" : "generated.mp3"); fs.writeFileSync(file, "locally supplied generated media fixture");
  const asset = await importCanvasFile(root, runtime.workspaceId, file);
  const model = run.snapshot.nodes.find((node) => node.id === "model")!;
  model.config = { modality: kind, operation: kind === "audio" ? "voiceover" : "video", variants: 3, provider: kind === "audio" ? "elevenlabs" : "openrouter", modelId: `test/${kind}`, parameters: kind === "audio" ? { voice: "voice-1", stability: 0.5 } : { duration: 5 } };
  if (kind === "video") run.snapshot.nodes.find((node) => node.id === "reference")!.config!.operation = "lastFrame";
  else run.snapshot.edges = run.snapshot.edges.filter((edge) => edge.from !== "reference");
  run.nodes.at(-1)!.results = [{ ...run.nodes.at(-1)!.results[0], kind, asset }];
  await writeCanvasRun(root, run);
  const saved = await saveGenerationToUnit(runtime, source, { projectId: null, name: `Generated ${kind}` });
  fs.rmSync(path.join(root, "media-library", "canvases", runtime.workspaceId, "runs"), { recursive: true });
  const metadata = JSON.parse(openDomainDb().query<{ metadata_json: string }, [string]>("SELECT metadata_json FROM unit_revisions WHERE id = ?").get(saved.revisionId)!.metadata_json);
  expect(metadata.generation).toMatchObject({ modality: kind, operation: kind === "audio" ? "voiceover" : "video", variants: 3, parameters: model.config.parameters, referenceBindings: kind === "video" ? [{ referenceIndex: 0, role: "lastFrame" }] : [] });
  expect(fs.readFileSync(resolveObjectPath(getObjectRow(openDomainDb(), metadata.generation.output.objectId)!), "utf8")).toBe("locally supplied generated media fixture");
}, 20_000);

test("saved Units, provenance and reference bytes transfer independently and retry without another revision", async () => {
  const { tmp, root, runtime, source, project } = await fixture();
  const saved = await saveGenerationToUnit(runtime, source, { projectId: project.id, name: "Portable image" });
  await client!.close(); client = undefined;
  const exported = await exportWorkspacePackage({ workspaceId: runtime.workspaceId });
  const archive = path.join(tmp.dir, "generated.workspace.tar");
  fs.copyFileSync(resolveObjectPath(getObjectRow(openDomainDb(), exported.packageObjectId)!), archive);
  closeDomainDb(); fs.renameSync(root, `${root}-hidden`);
  const restored = makeTmpRoot("ralphy-save-generated-restored"); roots.push(restored);
  const imported = await importWorkspaceArchiveFile({ filePath: archive, idempotencyKey: "generated-unit-transfer", limit: 100 });
  const mapped = (id: string) => imported.entityMapPage.items.find((item) => item.oldId === id)!.newId;
  const restoredRoot = path.join(restored.dir, ".ralphy"); closeDomainDb();
  const next = await connect(restoredRoot, imported.workspaceId);
  const replay = await saveGenerationToUnit(next, source, { projectId: mapped(project.id), name: "Portable image" });
  expect(replay).toMatchObject({ unitId: mapped(saved.unitId), revisionId: mapped(saved.revisionId), alreadySaved: true });
  const metadata = JSON.parse(openDomainDb().query<{ metadata_json: string }, [string]>("SELECT metadata_json FROM unit_revisions WHERE id = ?").get(replay.revisionId)!.metadata_json);
  expect(metadata.generation.prompt).toBe("Original precise instructions");
  expect(metadata.generation).toMatchObject({ modality: "image", operation: "image", variants: 2, referenceBindings: [{ referenceIndex: 0, role: "refs" }] });
  expect(fs.readFileSync(resolveObjectPath(getObjectRow(openDomainDb(), metadata.generation.output.objectId)!), "utf8")).toBe("first generated media bytes");
  expect(fs.readFileSync(resolveObjectPath(getObjectRow(openDomainDb(), metadata.generation.references[0].objectId)!), "utf8")).toBe("source reference bytes");
}, 20_000);
