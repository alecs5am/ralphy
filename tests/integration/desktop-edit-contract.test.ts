import { afterEach, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { RalphyBridgeClient } from "../../apps/desktop/electron/ralphy/client.js";
import { createProjectReader } from "../../apps/desktop/electron/ralphy/project-reader.js";
import { addArtifactRevision, createArtifact, selectArtifactRevision } from "../../cli/lib/store/artifacts.js";
import { closeDomainDb, openDomainDb } from "../../cli/lib/store/db.js";
import { ingestObject } from "../../cli/lib/store/objects.js";
import { createProject, createWorkspace } from "../../cli/lib/store/scopes.js";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";

let root: TmpRoot;
let bridge: RalphyBridgeClient | undefined;
const cli = path.resolve(import.meta.dir, "../../cli/index.ts");
async function connect() {
  bridge = new RalphyBridgeClient({
    root: path.join(root.dir, ".ralphy"),
    spawn: (_bin, args, options) => spawn(process.execPath, [cli, ...args], options),
  });
  await bridge.start();
  return { bridge, reader: createProjectReader({ request: bridge.request.bind(bridge) }) };
}
afterEach(async () => { await bridge?.close(); bridge = undefined; closeDomainDb(); root?.cleanup(); });

test("desktop reviews, document conflicts, and memory edits survive a real bridge restart", async () => {
  root = makeTmpRoot("ralphy-desktop-edits");
  const workspace = createWorkspace({ slug: "contract", name: "Contract" });
  const project = createProject({ workspaceId: workspace.id, slug: "project", name: "Project" });
  const scope = { workspaceId: workspace.id, projectId: project.id };
  const source = path.join(root.dir, "fixture.txt"); fs.writeFileSync(source, "local test media");
  const object = await ingestObject({ scope, sourcePath: source, originalName: "fixture.txt", mime: "text/plain", storageClass: "durable" });
  const artifact = createArtifact({ projectId: project.id, slug: "test-media", kind: "data" });
  const initial = addArtifactRevision({ artifactId: artifact.id, objectId: object.id, state: "candidate" });
  selectArtifactRevision({ artifactId: artifact.id, revisionId: initial.id, expectedRevisionId: null });
  closeDomainDb();

  const first = await connect();
  const approved = await first.reader.reviewMedia(scope, { artifactId: artifact.id, expectedSelectedRevisionId: initial.id, verdict: "approved" });
  expect(approved.selectedState).toBe("approved");
  expect(approved.selectedRevisionId).not.toBe(initial.id);
  const working = await first.reader.reviewMedia(scope, { artifactId: artifact.id, expectedSelectedRevisionId: approved.selectedRevisionId!, verdict: "needs-work", feedback: "Shorten the opening." });
  expect(working).toMatchObject({ selectedState: "candidate", latestReviewVerdict: "needs-work" });
  await expect(first.reader.reviewMedia(scope, { artifactId: artifact.id, expectedSelectedRevisionId: initial.id, verdict: "approved" })).rejects.toMatchObject({ code: "E_CONFLICT" });

  await expect(first.reader.createDocument(scope, { title: "Review note", workspaceId: "other" } as never)).rejects.toMatchObject({ code: "E_VALIDATION_FAILED" });
  const document = await first.reader.createDocument(scope, { title: "Review note" });
  expect(document).toMatchObject({ ...scope, kind: "note", title: "Review note", currentRevisionId: null });
  const revision = await first.reader.reviseDocument(scope, { documentId: document.id, expectedHeadId: null, format: "text", body: "First version" });
  const revised = await first.reader.reviseDocument(scope, { documentId: document.id, expectedHeadId: revision.id, format: "text", title: "Saved review note", body: "Saved second version" });
  await expect(first.reader.reviseDocument(scope, { documentId: document.id, expectedHeadId: revision.id, format: "text", body: "Stale update" })).rejects.toMatchObject({ code: "E_CONFLICT" });

  const context = { workspaceId: workspace.id };
  const body = { rule: "Use plain language.", why: "Readers should understand it once.", howToApply: ["Prefer concrete verbs."], doesNotApplyTo: ["Verbatim quotes."] };
  const memory = await first.bridge.request("memory.create", { context, tier: "workspace", status: "active", slug: "voice", type: "style", name: "Voice", description: "Simple prose", body, source: "Desktop" });
  const nextMemory = await first.bridge.request("memory.revise", { context, memoryEntryId: memory.id, expectedRevisionId: memory.revisionId, status: "active", type: "style", name: "Voice", description: "Concise prose", body: { ...body, rule: "Use concise plain language." }, source: "Desktop" });
  await expect(first.bridge.request("memory.retire", { context, memoryEntryId: memory.id, expectedRevisionId: memory.revisionId })).rejects.toMatchObject({ code: "E_CONFLICT" });
  await first.bridge.request("memory.retire", { context, memoryEntryId: memory.id, expectedRevisionId: nextMemory.revisionId });
  await first.bridge.close();

  const restarted = await connect();
  expect(await restarted.bridge.request("media.show", { context: scope, ref: { type: "artifact", id: artifact.id } })).toMatchObject({ selectedRevisionId: working.selectedRevisionId, selectedState: "candidate", latestReviewVerdict: "needs-work" });
  const prior = await restarted.reader.selectMediaRevision(scope, artifact.id, initial.id, working.selectedRevisionId!);
  expect(prior.latestReviewVerdict).toBeUndefined();
  expect(await restarted.reader.showDocument(scope, document.id)).toMatchObject({ title: "Saved review note", currentRevisionId: revised.id });
  expect((await restarted.bridge.request("document.list", { context: scope })).items.find((item) => item.id === document.id)?.title).toBe("Saved review note");
  expect(await restarted.reader.loadDocumentPreview(scope, revised.id)).toMatchObject({ text: "Saved second version" });
  expect(await restarted.bridge.request("memory.show", { context, memoryEntryId: memory.id })).toMatchObject({ status: "archived" });
  const history = await restarted.bridge.request("memory.history", { context, memoryEntryId: memory.id });
  expect(history.items.map((entry) => entry.revisionId)).toEqual([nextMemory.revisionId, memory.revisionId]);
  await restarted.bridge.close();
  const db = openDomainDb();
  expect(db.query("SELECT body, status FROM feedback_items").all()).toEqual([{ body: "Shorten the opening.", status: "open" }]);
  expect(db.query("SELECT verdict FROM evaluations ORDER BY created_at").all()).toEqual([{ verdict: "approved" }, { verdict: "needs-work" }]);
  expect(db.query("SELECT id FROM agent_sessions WHERE agent = 'desktop-review' AND ended_at IS NULL").all()).toEqual([]);
}, 20_000);
