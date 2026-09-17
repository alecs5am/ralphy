import { afterEach, expect, test } from "bun:test";
import { copyFileSync, readFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { createCanvasRuntime } from "../../apps/desktop/electron/canvas/runtime.js";
import { readCanvasText, writeCanvasRun, writeCanvasText } from "../../apps/desktop/electron/canvas/runtime-files.js";
import type { CanvasRun } from "../../apps/desktop/shared/canvas-runtime.js";
import { closeDomainDb, openDomainDb } from "../../cli/lib/store/db.js";
import { exportWorkspacePackage, importWorkspaceArchiveFile } from "../../cli/lib/store/portable.js";
import { getObjectRow, resolveObjectPath } from "../../cli/lib/store/internal-objects.js";
import { createWorkspace } from "../../cli/lib/store/scopes.js";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";

const roots: TmpRoot[] = [];
afterEach(() => { closeDomainDb(); roots.splice(0).forEach((root) => root.cleanup()); });

test("Canvas and Create retain older result pages and complete reusable text after source-independent workspace transfer", async () => {
  const source = makeTmpRoot("ralphy-canvas-history-source"); roots.push(source);
  const root = join(source.dir, ".ralphy"), workspace = createWorkspace({ slug: "history", name: "History" });
  const text = `${"x".repeat(25_000)}REQUIRED_TAIL`, asset = await writeCanvasText(root, workspace.id, text);
  for (const canvas of ["workflow", "generation-studio"]) {
    const run: CanvasRun = { id: "run-1700000000000-original", canvasId: canvas, workspaceId: workspace.id, canvasRevision: "revision", mode: "execute", status: "succeeded", startedAt: 1_700_000_000_000, endedAt: 1_700_000_000_001, error: null,
      snapshot: { version: 2, id: canvas, name: "History", nodes: [{ id: "model", kind: "model", title: "Text", value: "Draft", x: 0, y: 0, config: { modality: "text", provider: "openrouter", modelId: "test/text" } }], edges: [] },
      nodes: [{ nodeId: "model", status: "succeeded", startedAt: 1, endedAt: 2, coreRunIds: [], estimatedCostUsd: null, error: null, results: [{ id: "original-result", nodeId: "model", kind: "text", label: "Original", text: text.slice(0, 20_000), asset }] }],
    };
    await writeCanvasRun(root, run);
    for (let i = 1; i <= 103; i++) await writeCanvasRun(root, { ...run, id: `run-${1_700_000_000_000 + i}-later`, startedAt: run.startedAt + i, mode: i % 3 ? "execute" : "preview", status: i % 2 ? "failed" : "succeeded", nodes: [] });
  }
  const exported = await exportWorkspacePackage({ workspaceId: workspace.id });
  const archive = join(source.dir, "history.workspace.tar");
  copyFileSync(resolveObjectPath(getObjectRow(openDomainDb(), exported.packageObjectId)!), archive);
  closeDomainDb(); renameSync(root, `${root}-hidden`);
  const destination = makeTmpRoot("ralphy-canvas-history-restored"); roots.push(destination);
  const imported = await importWorkspaceArchiveFile({ filePath: archive, idempotencyKey: "history-import", limit: 100 });
  const restoredRoot = join(destination.dir, ".ralphy");
  const runtime = createCanvasRuntime({ root: restoredRoot, workspaceId: imported.workspaceId, cli: async () => { throw new Error("Must not generate"); }, request: async () => { throw new Error("No bridge needed"); }, mint: async () => ({ url: "ralphy-media://test" }), assertCurrent() {} });
  for (const canvas of ["workflow", "generation-studio"]) {
    const page = await runtime.list(canvas), older = await runtime.list(canvas, { before: page.nextCursor });
    expect(page.items).toHaveLength(100); expect(older.items).toHaveLength(4); expect(older.nextCursor).toBeNull();
    const result = older.items.at(-1)!.nodes[0].results[0];
    expect(result.unavailableReason).toBeUndefined(); expect(result.text).toHaveLength(20_000);
    expect(result.asset!.path).toContain(imported.workspaceId); expect(result.asset!.path).not.toContain(workspace.id);
    expect(readFileSync(result.asset!.path, "utf8")).toBe(text);
    expect(await readCanvasText(restoredRoot, imported.workspaceId, result.asset!)).toBe(text);
    expect((await runtime.list(canvas, { resultIds: ["original-result"] })).items.at(-1)!.nodes[0].results[0].id).toBe("original-result");
  }
}, 20_000);
