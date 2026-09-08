import { afterEach, expect, test } from "vitest";
import { readdirSync, writeFileSync } from "node:fs";
import { mkdtemp, mkdir, readdir, rm, rmdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CANVAS_WRITE_LOCK, parseCanvas, canvasOrder, type WorkflowCanvas } from "../shared/workflow-canvas";
import { loadCanvases, saveCanvas } from "../electron/canvas/store";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });
const canvas = (): WorkflowCanvas => ({ version: 1, id: "canvas-one", name: "Product launch", nodes: [
  { id: "prompt", kind: "prompt", title: "Brief", value: "Introduce our product", x: 40, y: 60 },
  { id: "model", kind: "model", title: "Image model", value: "Use configured image model", x: 340, y: 60 },
], edges: [{ from: "prompt", to: "model" }] });

test("canvas validation preserves a graph and rejects cycles, bad references and unsafe input", () => {
  expect(parseCanvas(canvas())).toEqual(canvas());
  expect(canvasOrder(canvas()).map(({ id }) => id)).toEqual(["prompt", "model"]);
  expect(() => parseCanvas({ ...canvas(), edges: [{ from: "model", to: "prompt" }, { from: "prompt", to: "model" }] })).toThrow(/cycle/i);
  expect(() => parseCanvas({ ...canvas(), edges: [{ from: "missing", to: "model" }] })).toThrow();
  expect(() => parseCanvas({ ...canvas(), id: "../../escape" })).toThrow();
  expect(() => parseCanvas({ ...canvas(), nodes: [{ ...canvas().nodes[0], x: Infinity }] })).toThrow();
});

test("canvas saves survive reload and reject stale revisions, traversal and symlink stores", async () => {
  const root = await mkdtemp(join(tmpdir(), "ralphy-canvas-")); roots.push(root);
  expect(await loadCanvases(root, "ws_ux")).toEqual([]);
  const saved = await saveCanvas(root, "ws_ux", canvas(), null);
  expect(await loadCanvases(root, "ws_ux")).toEqual([saved]);
  const changed = { ...canvas(), name: "Agent edit" };
  await writeFile(saved.path, JSON.stringify(changed));
  await expect(saveCanvas(root, "ws_ux", canvas(), saved.revision)).rejects.toThrow(/changed/i);
  expect((await loadCanvases(root, "ws_ux"))[0]?.canvas.name).toBe("Agent edit");
  await expect(loadCanvases(root, "../escape")).rejects.toThrow();
  const another = await mkdtemp(join(tmpdir(), "ralphy-canvas-")); roots.push(another);
  await mkdir(join(another, "media-library"));
  await symlink(root, join(another, "media-library", "canvases"));
  await expect(saveCanvas(another, "ws_ux", canvas(), null)).rejects.toThrow(/directory/i);
});

test("a concurrent edit after staging is preserved and releases the workspace lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "ralphy-canvas-")); roots.push(root);
  const saved = await saveCanvas(root, "ws_ux", canvas(), null);
  const directory = join(root, "media-library", "canvases", "ws_ux");
  let injected = false;
  await expect(saveCanvas(root, "ws_ux", { ...canvas(), name: "Manual edit" }, saved.revision, () => {
    if (!injected && readdirSync(directory).some((name) => name.endsWith(".tmp"))) {
      injected = true;
      writeFileSync(saved.path, JSON.stringify({ ...canvas(), name: "Concurrent agent edit" }));
    }
  })).rejects.toThrow(/changed/i);
  expect(injected).toBe(true);
  const [external] = await loadCanvases(root, "ws_ux");
  expect(external?.canvas.name).toBe("Concurrent agent edit");
  expect(await readdir(directory)).toEqual(["canvas-one.json"]);
  await expect(saveCanvas(root, "ws_ux", canvas(), external!.revision)).resolves.toBeDefined();
});

test("concurrent creates at the workspace cap leave 100 loadable canvases", async () => {
  const root = await mkdtemp(join(tmpdir(), "ralphy-canvas-")); roots.push(root);
  const directory = join(root, "media-library", "canvases", "ws_ux");
  await mkdir(directory, { recursive: true });
  await Promise.all(Array.from({ length: 99 }, (_, index) => {
    const value = { ...canvas(), id: `canvas-${index}` };
    return writeFile(join(directory, `${value.id}.json`), JSON.stringify(value));
  }));
  const results = await Promise.allSettled([
    saveCanvas(root, "ws_ux", { ...canvas(), id: "extra-a" }, null),
    saveCanvas(root, "ws_ux", { ...canvas(), id: "extra-b" }, null),
  ]);
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
  expect(await loadCanvases(root, "ws_ux")).toHaveLength(100);
});

test("an existing cooperative lock fails immediately without removing another writer's lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "ralphy-canvas-")); roots.push(root);
  const directory = join(root, "media-library", "canvases", "ws_ux");
  const lock = join(directory, CANVAS_WRITE_LOCK);
  await mkdir(lock, { recursive: true });
  await expect(saveCanvas(root, "ws_ux", canvas(), null)).rejects.toThrow(/locked by another writer/i);
  expect(await readdir(directory)).toEqual([CANVAS_WRITE_LOCK]);
  await rmdir(lock);
  await expect(saveCanvas(root, "ws_ux", canvas(), null)).resolves.toBeDefined();
});
