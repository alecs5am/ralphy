import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { closeDomainDb, openDomainDb } from "../../cli/lib/store/db.js";
import { exportWorkspacePackage, importWorkspaceArchiveFile, importWorkspacePackage } from "../../cli/lib/store/portable.js";
import { createIteration, createProject, createWorkspace, upsertSocialAccount } from "../../cli/lib/store/scopes.js";
import { createDocument, reviseDocument } from "../../cli/lib/store/documents.js";
import { createArtifact, addArtifactRevision, selectArtifactRevision } from "../../cli/lib/store/artifacts.js";
import { createComposition, reviseComposition, putCompositionSource, bindCompositionInput, sealCompositionRevision, selectCompositionRevision, startBuild, completeBuild } from "../../cli/lib/store/compositions.js";
import { createUnit, reviseUnit, selectUnitRevision, recordPublication, listUnitPresentations } from "../../cli/lib/store/units.js";
import { replaceProjectDocumentBinding, replaceBuildDocumentBinding } from "../../cli/lib/store/document-content.js";
import { startAgentSession } from "../../cli/lib/store/sessions.js";
import { ingestObject } from "../../cli/lib/store/objects.js";
import { getObjectRow, resolveObjectPath } from "../../cli/lib/store/internal-objects.js";
import { readPortableArchive, type PortableManifest } from "../../cli/lib/store/internal-portable-files.js";
import { reviseCompositionCheckout } from "../../cli/lib/composition-build.js";
import { startRun, finishRun, recordRunObject } from "../../cli/lib/store/runs.js";
import { verifyDomainStore } from "../../cli/lib/store/verify.js";
import { writeEntry } from "../../cli/lib/memory/store.js";
import { insertJob, appendLog } from "../../cli/lib/jobs/db.js";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";

let tmp: TmpRoot;
let other: TmpRoot | undefined;

beforeEach(() => { tmp = makeTmpRoot("ralphy-portable"); });
afterEach(() => { closeDomainDb(); tmp.cleanup(); other?.cleanup(); other = undefined; });

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const objectPath = (id: string) => resolveObjectPath(getObjectRow(openDomainDb(), id)!);
function write(relative: string, value: string) {
  const target = path.join(tmp.dir, ".ralphy", relative);
  fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, value);
  return target;
}
async function graph() {
  const workspace = createWorkspace({ slug: "source", name: "Source" });
  const project = createProject({ workspaceId: workspace.id, slug: "project", name: "Project" });
  const context = { workspaceId: workspace.id, projectId: project.id };
  const session = startAgentSession({ ...context, agent: "portable-test" });
  const iteration = createIteration({ projectId: project.id, title: "First iteration" });
  const document = createDocument({ projectId: project.id, kind: "brief", slug: "brief", title: "Brief" });
  const revision = reviseDocument({ documentId: document.id, expectedHeadId: null, format: "text", body: "Complete document\n".repeat(1000), authoredBySessionId: session.id });
  replaceProjectDocumentBinding({ context, projectId: project.id, role: "brief", revisionId: revision.id, expectedRevisionId: null });
  const object = await ingestObject({ scope: context, sourcePath: write("source.bin", "actual media bytes"), originalName: "source.bin", mime: "application/octet-stream", storageClass: "durable" });
  const artifact = createArtifact({ projectId: project.id, slug: "media", kind: "data" });
  const artifactRevision = addArtifactRevision({ artifactId: artifact.id, objectId: object.id, state: "approved", authoredBySessionId: session.id });
  selectArtifactRevision({ artifactId: artifact.id, revisionId: artifactRevision.id, expectedRevisionId: null });
  const composition = createComposition({ projectId: project.id, slug: "composition", kind: "video" });
  const compositionRevision = reviseComposition({ compositionId: composition.id, expectedLatestRevisionId: null, iterationId: iteration.id, engine: "remotion", engineConfig: {}, authoredBySessionId: session.id });
  putCompositionSource({ revisionId: compositionRevision.id, logicalPath: "src/source.bin", objectId: object.id, position: 0 });
  bindCompositionInput({ revisionId: compositionRevision.id, artifactRevisionId: artifactRevision.id, role: "primary", position: 0, config: { fit: "cover" } });
  sealCompositionRevision({ revisionId: compositionRevision.id });
  selectCompositionRevision({ compositionId: composition.id, revisionId: compositionRevision.id, expectedSelectedRevisionId: null });
  const run = startRun({ projectId: project.id, agentSessionId: session.id, kind: "build" });
  const build = startBuild({ compositionRevisionId: compositionRevision.id, runId: run.id, profile: {} });
  replaceBuildDocumentBinding({ context, buildId: build.id, role: "brief", revisionId: revision.id, expectedRevisionId: null });
  completeBuild({ buildId: build.id, outputs: [{ artifactRevisionId: artifactRevision.id, role: "preview", position: 0 }] });
  write("tmp/diagnostic.log", "worker diagnostic");
  const diagnostic = recordRunObject({ runId: run.id, path: "tmp/diagnostic.log", purpose: "diagnostic", state: "diagnostic", retention: "diagnostic", mime: "text/plain", bytes: 17, sha256: hash("worker diagnostic") });
  finishRun(run.id, { state: "succeeded" });
  const unit = createUnit({ projectId: project.id, slug: "unit", format: "video" });
  const unitRevision = reviseUnit({ unitId: unit.id, expectedLatestRevisionId: null, iterationId: iteration.id, authoredBySessionId: session.id, items: [{ artifactRevisionId: artifactRevision.id, role: "primary", position: 0 }], presentations: [{ platform: "tiktok", caption: "Full caption", items: [{ unitItemPosition: 0, position: 0 }] }] });
  selectUnitRevision({ unitId: unit.id, revisionId: unitRevision.id, expectedSelectedRevisionId: null });
  const account = upsertSocialAccount({ workspaceId: workspace.id, platform: "tiktok", externalId: "account-1", username: "@source", config: { style: "friendly" } });
  const presentation = listUnitPresentations({ context, revisionId: unitRevision.id, limit: 10 }).items[0];
  const publicationRun = startRun({ projectId: project.id, kind: "publication" });
  const publication = recordPublication({ presentationId: presentation.id, socialAccountId: account.id, submissionRunId: publicationRun.id, rail: "postiz", idempotencyKey: "source-publication" });
  return { workspace, project, object, artifact, composition, compositionRevision, document, revision, unit, unitRevision, publication, account, diagnostic };
}
async function rewriteArchive(source: string, mutate: (manifest: PortableManifest, entries: Record<string, Blob | string>) => void): Promise<string> {
  const { manifest, files } = await readPortableArchive(source);
  const entries: Record<string, Blob | string> = {};
  for (const [name, file] of files) entries[name] = new Blob([await file.arrayBuffer()]);
  mutate(manifest, entries);
  entries["manifest.json"] = JSON.stringify(manifest);
  const target = path.join(tmp.dir, `modified-${crypto.randomUUID()}.workspace.tar`);
  await Bun.Archive.write(target, entries);
  return target;
}
function bucketFiles(root: string): string[] {
  const buckets = path.join(root, ".ralphy", "buckets");
  return fs.readdirSync(buckets, { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => path.join(entry.parentPath, entry.name)).sort();
}

describe("portable Workspace package", () => {
  test("restores editable video sources and saved edits with the original library hidden", async () => {
    const source = await graph();
    const root = path.join(tmp.dir, ".ralphy");
    const context = { workspaceId: source.workspace.id, projectId: source.project.id };
    const draft = await reviseCompositionCheckout({ context, compositionId: source.composition.id, expectedLatestRevisionId: source.compositionRevision.id, engine: "hyperframes" });
    const html = '<div data-composition-id="main"><video src="clip.mp4"></video></div>';
    fs.writeFileSync(path.join(draft.checkoutPath, "index.html"), html);
    fs.writeFileSync(path.join(draft.checkoutPath, "clip.mp4"), "original source video");
    const directory = `media-library/video-workspaces/${source.workspace.id}/${source.project.id}/${source.unit.id}`;
    const savedHtml = html.replace("</div>", '<audio src="_ralphy_assets/music.mp3"></audio></div>');
    write(`${directory}/_ralphy_assets/music.mp3`, "imported local music");
    write(`${directory}/draft.json`, JSON.stringify({ draft: {
      schemaVersion: 1, html: savedHtml, fps: 24, updatedAt: 1, compositionId: source.composition.id,
      compositionRevisionId: draft.id, checkoutPath: fs.realpathSync(draft.checkoutPath), checkoutHash: hash(html),
      sourceKind: "composition", assets: [{ src: "clip.mp4", name: "clip.mp4", kind: "video" }],
    }, versions: [{ id: hash(html), html, savedAt: 1 }], render: null }));
    const exported = await exportWorkspacePackage({ workspaceId: source.workspace.id });
    const archive = path.join(tmp.dir, "editable.workspace.tar");
    fs.copyFileSync(objectPath(exported.packageObjectId), archive);
    closeDomainDb();
    fs.renameSync(root, `${root}-hidden`);
    other = makeTmpRoot("ralphy-portable-editor");
    const imported = await importWorkspaceArchiveFile({ filePath: archive, idempotencyKey: "editable-import", limit: 100 });
    const mapped = (id: string) => imported.entityMapPage.items.find((item) => item.oldId === id)!.newId;
    const destination = path.join(other.dir, ".ralphy");
    const videoDir = path.join(destination, `media-library/video-workspaces/${imported.workspaceId}/${mapped(source.project.id)}/${mapped(source.unit.id)}`);
    const saved = JSON.parse(fs.readFileSync(path.join(videoDir, "draft.json"), "utf8"));
    expect(saved.draft.checkoutPath).toBe(path.join(destination, "tmp", mapped(draft.id), "checkout"));
    expect(saved.draft.html).toBe(savedHtml);
    expect(saved.versions[0].html).toBe(html);
    expect(fs.readFileSync(path.join(saved.draft.checkoutPath, "index.html"), "utf8")).toBe(html);
    expect(fs.readFileSync(path.join(saved.draft.checkoutPath, "clip.mp4"), "utf8")).toBe("original source video");
    expect(fs.readFileSync(path.join(videoDir, "_ralphy_assets/music.mp3"), "utf8")).toBe("imported local music");
    // Older sealed revisions need no live checkout: immutable source Objects are sufficient.
    expect(fs.readFileSync(path.join(destination, "tmp", mapped(source.compositionRevision.id), "checkout/src/source.bin"), "utf8")).toBe("actual media bytes");
    expect(fs.existsSync(root)).toBe(false);
  });

  test("exports safe entities and imports with a stable replay page", async () => {
    const source = createWorkspace({ slug: "source", name: "Source" });
    createProject({ workspaceId: source.id, slug: "project", name: "Project" });
    upsertSocialAccount({ workspaceId: source.id, platform: "x", externalId: "account-1", username: "@source" });

    const exported = await exportWorkspacePackage({ workspaceId: source.id });
    expect(exported.manifestSummary.entityCounts).toMatchObject({ workspace: 1, project: 1, socialAccount: 1 });
    expect(exported).not.toHaveProperty("path");

    const imported = await importWorkspacePackage({
      packageObjectId: exported.packageObjectId,
      idempotencyKey: "portable-import-1",
      workspaceSlug: "imported",
      limit: 1,
    });
    expect(imported.workspaceId).not.toBe(source.id);
    expect(imported.entityMapPage.items.length).toBe(1);
    expect(imported.entityMapPage.nextCursor).toBeTruthy();
    expect(imported.relinkPage.items[0]).toMatchObject({ platform: "x", handle: "@source" });

    const replay = await importWorkspacePackage({
      packageObjectId: exported.packageObjectId,
      idempotencyKey: "portable-import-1",
      entityAfter: "1",
      relinkAfter: "1",
      limit: 100,
    });
    expect(replay.workspaceId).toBe(imported.workspaceId);
    expect(replay.entityMapPage.items.length).toBeGreaterThan(0);
  });

  test("restores the complete media graph and desktop files into a separate store", async () => {
    const source = await graph();
    const root = path.join(tmp.dir, ".ralphy");
    const asset = write(`media-library/canvases/${source.workspace.id}/assets/local.bin`, "canvas media");
    write(`media-library/canvases/${source.workspace.id}/canvas.json`, JSON.stringify({ id: "canvas-local", workspaceId: source.workspace.id, path: asset, objectId: source.object.id }));
    write(`media-library/video-workspaces/${source.workspace.id}/${source.project.id}/${source.unit.id}/draft.json`, JSON.stringify({ unitId: source.unit.id, text: "Saved video draft" }));
    const transcriptSecret = `sk-or-v1-${"s".repeat(40)}`;
    write(`media-library/agent-chats/${hash(JSON.stringify(source.workspace.id))}.json`, JSON.stringify({ version: 1, activeChatId: "chat-1", chats: [{ id: "chat-1", title: "My creative research", titled: true, manualTitle: true, archived: true, sessionId: "external-session", permissionMode: "full", entries: [{ text: "Long chat\n".repeat(50000) }, { text: `Credentials: ${transcriptSecret}\nAuthorization: Bearer example-token-never-export\napi_key=example-key-never-export` }] }] }));
    write("secrets/config.json", '{"api_key":"configured-secret-never-export"}');
    const exported = await exportWorkspacePackage({ workspaceId: source.workspace.id });
    const archive = await readPortableArchive(objectPath(exported.packageObjectId));
    expect(JSON.stringify(archive.manifest)).not.toContain("secret-never-export");
    expect(archive.manifest.files.some((file) => file.path.includes("secrets"))).toBe(false);
    const archivePath = path.join(tmp.dir, "transfer.workspace.tar");
    fs.copyFileSync(objectPath(exported.packageObjectId), archivePath);
    closeDomainDb(); other = makeTmpRoot("ralphy-portable-destination");
    const host = createWorkspace({ slug: "host", name: "Existing workspace" });
    const packageObject = await ingestObject({ scope: { workspaceId: host.id }, sourcePath: archivePath, originalName: "transfer.workspace.tar", mime: "application/vnd.ralphy.workspace+tar", storageClass: "durable" });
    const imported = await importWorkspacePackage({ packageObjectId: packageObject.id, idempotencyKey: "full-transfer", limit: 100 });
    const mapped = (id: string) => imported.entityMapPage.items.find((item) => item.oldId === id)!.newId;
    const db = openDomainDb();
    expect(fs.readFileSync(objectPath(mapped(source.object.id)), "utf8")).toBe("actual media bytes");
    expect(db.query("SELECT current_revision_id FROM documents WHERE id = ?").get(mapped(source.document.id))).toEqual({ current_revision_id: mapped(source.revision.id) });
    expect(db.query("SELECT selected_revision_id FROM compositions WHERE id = ?").get(mapped(source.composition.id))).toEqual({ selected_revision_id: mapped(source.compositionRevision.id) });
    expect(db.query("SELECT selected_revision_id FROM units WHERE id = ?").get(mapped(source.unit.id))).toEqual({ selected_revision_id: mapped(source.unitRevision.id) });
    expect(db.query("SELECT social_account_id FROM publications WHERE id = ?").get(mapped(source.publication.id))).toEqual({ social_account_id: mapped(source.account.id) });
    expect(db.query("SELECT credential_ref, relink_required FROM social_accounts WHERE id = ?").get(mapped(source.account.id))).toEqual({ credential_ref: null, relink_required: 1 });
    const newRoot = path.join(other.dir, ".ralphy");
    const canvas = JSON.parse(fs.readFileSync(path.join(newRoot, `media-library/canvases/${imported.workspaceId}/canvas.json`), "utf8"));
    expect(canvas).toMatchObject({ workspaceId: imported.workspaceId, objectId: mapped(source.object.id) });
    expect(canvas.path).toBe(path.join(newRoot, `media-library/canvases/${imported.workspaceId}/assets/local.bin`));
    expect(fs.readFileSync(canvas.path, "utf8")).toBe("canvas media");
    const chat = JSON.parse(fs.readFileSync(path.join(newRoot, `media-library/agent-chats/${hash(JSON.stringify(imported.workspaceId))}.json`), "utf8"));
    expect(chat.chats[0].entries[0].text).toBe("Long chat\n".repeat(50000));
    expect(chat.chats[0].sessionId).toBeNull();
    expect(chat.chats[0]).toMatchObject({ title: "My creative research", titled: true, manualTitle: true, archived: true });
    expect(chat.chats[0].id).not.toBe("chat-1");
    expect(chat.activeChatId).toBe(chat.chats[0].id);
    expect(chat.chats[0].permissionMode).toBe("plan");
    expect(JSON.stringify(chat)).not.toContain(transcriptSecret);
    expect(JSON.stringify(chat)).not.toContain("example-token-never-export");
    expect(JSON.stringify(chat)).not.toContain("example-key-never-export");
    expect(fs.readFileSync(path.join(root, `media-library/canvases/${source.workspace.id}/canvas.json`), "utf8")).toContain(source.workspace.id);
    const diagnostic = db.query<{ path: string }, [string]>("SELECT path FROM run_objects WHERE id = ?").get(mapped(source.diagnostic.id))!;
    expect(fs.readFileSync(path.join(newRoot, diagnostic.path), "utf8")).toBe("worker diagnostic");
    expect(db.query("SELECT name FROM workspaces WHERE id = ?").get(host.id)).toEqual({ name: "Existing workspace" });
    closeDomainDb();
    const verified = verifyDomainStore({ hashObjects: true });
    for (const [key, value] of Object.entries(verified)) if (Array.isArray(value) && !["integrityCheck", "unreferencedObjects"].includes(key)) expect(value, key).toEqual([]);
  });

  test("imports a file into an empty library with stable retries and no placeholder workspace", async () => {
    const source = createWorkspace({ slug: "source", name: "Source" });
    createProject({ workspaceId: source.id, slug: "project", name: "Project" });
    const exported = await exportWorkspacePackage({ workspaceId: source.id });
    const archivePath = path.join(tmp.dir, "transfer.workspace.tar");
    fs.copyFileSync(objectPath(exported.packageObjectId), archivePath);
    closeDomainDb(); other = makeTmpRoot("ralphy-portable-empty");
    openDomainDb(); closeDomainDb();
    const cli = Bun.spawn([process.execPath, "cli/index.ts", "--root", path.join(other.dir, ".ralphy"), "--json", "workspace", "import", "--file", archivePath, "--idempotency-key", "native-import"], { cwd: path.resolve(import.meta.dir, "../.."), stdout: "pipe", stderr: "pipe" });
    const stdout = await new Response(cli.stdout).text(), stderr = await new Response(cli.stderr).text();
    expect(await cli.exited, stderr).toBe(0);
    const imported = JSON.parse(stdout);
    const replay = await importWorkspaceArchiveFile({ filePath: archivePath, idempotencyKey: "native-import" });
    expect(replay.workspaceId).toBe(imported.workspaceId);
    expect(openDomainDb().query("SELECT id FROM workspaces WHERE id NOT LIKE 'ws_00000000%'").all()).toEqual([{ id: imported.workspaceId }]);
    expect(openDomainDb().query("SELECT id FROM projects WHERE workspace_id = ?").all(imported.workspaceId)).toHaveLength(1);
  });

  test("rejects traversal, damaged bytes, unsupported tables, and incomplete legacy archives without importing", async () => {
    const source = await graph();
    const exported = await exportWorkspacePackage({ workspaceId: source.workspace.id });
    const original = objectPath(exported.packageObjectId);
    const before = openDomainDb().query("SELECT id FROM workspaces ORDER BY id").all();
    const mutations: Array<(manifest: PortableManifest, entries: Record<string, Blob | string>) => void> = [
      (manifest) => { manifest.files[0].path = "../escaped-file"; },
      (manifest, entries) => { entries[manifest.files[0].entry] = "x".repeat(manifest.files[0].bytes); },
      (manifest) => { manifest.tables.consumer_principals = []; },
      (manifest) => { manifest.tables.objects[0].workspace_id = "ws_ffffffff-ffff-ffff-ffff-ffffffffffff"; },
      (manifest) => { manifest.files[0].kind = "composition_checkout"; manifest.files[0].id = source.compositionRevision.id; manifest.files[0].path = "tmp/another-revision/checkout/index.html"; },
    ];
    for (const mutate of mutations) {
      const archive = await rewriteArchive(original, mutate);
      await expect(importWorkspaceArchiveFile({ filePath: archive, idempotencyKey: crypto.randomUUID() })).rejects.toThrow();
      expect(openDomainDb().query("SELECT id FROM workspaces ORDER BY id").all()).toEqual(before);
    }
    const old = path.join(tmp.dir, "legacy.json"); fs.writeFileSync(old, '{"version":1,"objects":[]}');
    await expect(importWorkspaceArchiveFile({ filePath: old, idempotencyKey: "legacy" })).rejects.toThrow("incomplete metadata");
    expect(fs.existsSync(path.join(tmp.dir, "escaped-file"))).toBe(false);
  });

  test("rolls back promoted bytes and restores database guards after a late workspace conflict", async () => {
    const source = await graph();
    const exported = await exportWorkspacePackage({ workspaceId: source.workspace.id });
    const beforeFiles = bucketFiles(tmp.dir);
    const beforeWorkspaces = openDomainDb().query("SELECT * FROM workspaces ORDER BY id").all();
    const beforeTriggers = openDomainDb().query("SELECT name FROM sqlite_master WHERE type = 'trigger' ORDER BY name").all();
    await expect(importWorkspacePackage({ packageObjectId: exported.packageObjectId, idempotencyKey: "conflict", workspaceSlug: "source" })).rejects.toThrow("UNIQUE");
    expect(bucketFiles(tmp.dir)).toEqual(beforeFiles);
    expect(openDomainDb().query("SELECT * FROM workspaces ORDER BY id").all()).toEqual(beforeWorkspaces);
    expect(openDomainDb().query("SELECT name FROM sqlite_master WHERE type = 'trigger' ORDER BY name").all()).toEqual(beforeTriggers);
    const retry = await importWorkspacePackage({ packageObjectId: exported.packageObjectId, idempotencyKey: "conflict", workspaceSlug: "recovered" });
    expect(retry.workspaceId).not.toBe(source.workspace.id);
  });

  test("refuses symlinked workspace content and symlinked import files", async () => {
    const source = createWorkspace({ slug: "source", name: "Source" });
    const outside = write("unrelated.bin", "private bytes");
    const link = path.join(tmp.dir, ".ralphy", `media-library/canvases/${source.id}/link.bin`);
    fs.mkdirSync(path.dirname(link), { recursive: true }); fs.symlinkSync(outside, link);
    await expect(exportWorkspacePackage({ workspaceId: source.id })).rejects.toThrow();
    await expect(importWorkspaceArchiveFile({ filePath: link, idempotencyKey: "symlink" })).rejects.toThrow();
    expect(fs.readFileSync(outside, "utf8")).toBe("private bytes");
    fs.unlinkSync(link);
    const project = createProject({ workspaceId: source.id, slug: "video", name: "Video" });
    const composition = createComposition({ projectId: project.id, slug: "video", kind: "video" });
    const revision = await reviseCompositionCheckout({ context: { workspaceId: source.id, projectId: project.id }, compositionId: composition.id, expectedLatestRevisionId: null, engine: "hyperframes" });
    fs.symlinkSync(outside, path.join(revision.checkoutPath, "source.mp4"));
    await expect(exportWorkspacePackage({ workspaceId: source.id })).rejects.toThrow();
  });

  test("preserves memory revisions and job provenance while disabling imported execution", async () => {
    const workspace = createWorkspace({ slug: "source", name: "Source" });
    const project = createProject({ workspaceId: workspace.id, slug: "project", name: "Project" });
    await writeEntry({ ref: { tier: "workspace", ws: workspace.id }, status: "active", slug: "principle", text: "Keep source footage.", type: "feedback" });
    const run = startRun({ workspaceId: workspace.id, projectId: project.id, kind: "generation" });
    const job = insertJob({ run_id: run.id, project_id: project.id, kind: "shell", command: { argv: ["test-worker", "--api-key", "test-secret-never-export"] } });
    appendLog(job, "stdout", "A useful worker log line");
    const output = write("job-logs/output.txt", "worker output");
    write("job-logs/worker.log", "worker log bytes");
    const db = openDomainDb();
    db.prepare("UPDATE jobs SET log_path = ? WHERE id = ?").run("job-logs/worker.log", job);
    db.prepare("INSERT INTO job_artifacts (job_id,kind,path,bytes,sha256) VALUES (?,?,?,?,?)").run(job, "text", path.relative(path.join(tmp.dir, ".ralphy"), output), 13, hash("worker output"));
    const exported = await exportWorkspacePackage({ workspaceId: workspace.id });
    const archive = await readPortableArchive(objectPath(exported.packageObjectId));
    expect(JSON.stringify(archive.manifest)).not.toContain("test-secret-never-export");
    const imported = await importWorkspacePackage({ packageObjectId: exported.packageObjectId, idempotencyKey: "memory-jobs", limit: 100 });
    const mapped = (type: string, id: string) => imported.entityMapPage.items.find((item) => item.oldType === type && item.oldId === id)!.newId;
    expect(db.query("SELECT status FROM jobs WHERE id = ?").get(mapped("job", String(job)))).toEqual({ status: "cancelled" });
    expect(db.query("SELECT state FROM runs WHERE id = ?").get(mapped("run", run.id))).toEqual({ state: "cancelled" });
    expect(db.query("SELECT slug, status FROM memory_entries WHERE workspace_id = ?").all(imported.workspaceId)).toEqual([{ slug: "principle", status: "active" }]);
    const artifact = db.query<{ path: string }, [string]>("SELECT path FROM job_artifacts WHERE job_id = ?").get(mapped("job", String(job)))!;
    expect(fs.readFileSync(path.join(tmp.dir, ".ralphy", artifact.path), "utf8")).toBe("worker output");
    const log = db.query<{ log_path: string }, [string]>("SELECT log_path FROM jobs WHERE id = ?").get(mapped("job", String(job)))!;
    expect(fs.readFileSync(path.join(tmp.dir, ".ralphy", log.log_path), "utf8")).toBe("worker log bytes");
  });
});
