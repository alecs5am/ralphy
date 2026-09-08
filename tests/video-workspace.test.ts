import { afterEach, expect, test, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { mkdtemp, rm, symlink, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openComposition } from "@hyperframes/sdk";
import { blankVideoComposition, videoRef } from "../shared/video-workspace";
import { addClip, changeTiming, compositionInfo, splitClip, timelineElements, trimClip, videoElement } from "../src/features/video-workspace/lib/composition";
import { readVideoStore, videoDirectory, writeVideoStore, type VideoStored } from "../electron/video-workspace/store";
import { loadVideo, renderVideo, saveVideo, type VideoRuntime } from "../electron/video-workspace/runtime";

const roots: string[] = [];
afterEach(async () => { vi.unstubAllGlobals(); await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true }))); });

test("a split keeps the source offset, is frame aligned and undoes as one operation", async () => {
  vi.stubGlobal("crypto", webcrypto);
  const comp = await openComposition(blankVideoComposition({ src: "video.mp4", kind: "video" }), { coalesceMs: 0 });
  const clip = timelineElements(comp)[0];
  comp.setAttribute(clip.scopedId, "data-media-start", "2");
  const before = comp.serialize();
  const id = splitClip(comp, clip.scopedId, 5.01, 30)!;
  expect(videoElement(comp, id)?.start).toBe(5);
  expect(videoElement(comp, id)?.duration).toBe(13);
  expect(videoElement(comp, id)?.attributes["data-media-start"]).toBe("7");
  expect(videoElement(comp, clip.scopedId)?.duration).toBe(5);
  comp.undo();
  expect(comp.serialize()).toBe(before);
  comp.dispose();
});

test("trim bounds protect negative source offsets; timing stays inside the composition", async () => {
  const comp = await openComposition(blankVideoComposition({ src: "video.mp4", kind: "video" }));
  const clip = timelineElements(comp)[0];
  comp.setTiming(clip.scopedId, { start: 3, duration: 8 });
  trimClip(comp, clip.scopedId, "start", -20, 30);
  expect(videoElement(comp, clip.scopedId)?.start).toBe(3);
  trimClip(comp, clip.scopedId, "start", 2, 30);
  expect(videoElement(comp, clip.scopedId)?.attributes["data-media-start"]).toBe("2");
  expect(videoElement(comp, clip.scopedId)?.duration).toBe(6);
  changeTiming(comp, clip.scopedId, -9, 500, 30);
  expect(videoElement(comp, clip.scopedId)?.start).toBe(0);
  expect(videoElement(comp, clip.scopedId)?.duration).toBe(compositionInfo(comp).duration);
  comp.dispose();
});

test("adding text and media preserves literal names and creates editable timed elements", async () => {
  vi.stubGlobal("crypto", webcrypto);
  const comp = await openComposition(blankVideoComposition());
  const id = addClip(comp, null, 17, 4);
  comp.setText(id, '<script>alert("x")</script>');
  addClip(comp, { src: "assets/a&b.png", name: 'A "quoted" title', kind: "image" }, 0);
  const reopened = await openComposition(comp.serialize());
  expect(videoElement(reopened, id)?.text).toBe('<script>alert("x")</script>');
  expect(timelineElements(reopened)).toHaveLength(2);
  expect(videoElement(reopened, id)?.duration).toBe(1);
  expect(reopened.getElements().some((item) => item.tag === "script")).toBe(false);
  reopened.dispose(); comp.dispose();
});

test("Unit-scoped saves reject stale revisions and symlinked storage without losing data", async () => {
  const root = await mkdtemp(join(tmpdir(), "video-workspace-")); roots.push(root);
  const ref = videoRef({ workspaceId: "ws", projectId: "project", unitId: "unit" });
  const directory = await videoDirectory(root, ref);
  const value: VideoStored = { draft: { schemaVersion: 1, html: blankVideoComposition(), fps: 30, updatedAt: 1, compositionId: null, compositionRevisionId: null, checkoutPath: null, sourceKind: "empty", assets: [] }, versions: [], render: null };
  const revision = await writeVideoStore(directory, value, null, () => undefined);
  const next = { ...value, draft: { ...value.draft, updatedAt: 2 } };
  await writeVideoStore(directory, next, revision, () => undefined);
  await expect(writeVideoStore(directory, value, revision, () => undefined)).rejects.toThrow("changed outside");
  expect((await readVideoStore(directory))!.value.draft.updatedAt).toBe(2);
  await mkdir(join(root, "other"));
  await symlink(join(root, "other"), join(root, "media-library", "video-workspaces", "alias"));
  await expect(videoDirectory(root, { ...ref, workspaceId: "alias" })).rejects.toThrow("regular directory");
  expect(() => videoRef({ ...ref, unitId: "../other" })).toThrow("Invalid");
});

test("opening a live source keeps its edits and rendering refuses a source changed by an agent", async () => {
  const root = await mkdtemp(join(tmpdir(), "video-source-")); roots.push(root);
  const ref = { workspaceId: "ws", projectId: "project", unitId: "unit" };
  const checkout = join(root, "tmp", "draft", "checkout"); await mkdir(checkout, { recursive: true });
  const html = blankVideoComposition(); await writeFile(join(checkout, "index.html"), html);
  const cli = vi.fn();
  const runtime: VideoRuntime = { root, cli, assertCurrent() {}, mint: async () => ({ url: "preview" }), request: vi.fn(async (method) => {
    if (method === "unit.show") return { projectId: "project", compositionId: "composition" };
    if (method === "composition.show") return { id: "composition", latestRevisionId: "draft" };
    if (method === "composition.revision.show") return { id: "draft", state: "draft" };
    throw new Error(`Unexpected ${method}`);
  }) as VideoRuntime["request"] };
  const opened = await loadVideo(runtime, ref);
  expect(opened.draft.html).toBe(html); expect(cli).not.toHaveBeenCalled();
  const saved = await saveVideo(runtime, ref, html.replace("</body>", "<!-- local edit --></body>"), 30, opened.revision);
  await writeFile(join(checkout, "index.html"), `${html}\n<!-- agent edit -->`);
  await expect(renderVideo(runtime, ref, saved.revision!)).rejects.toThrow("changed outside");
  expect(await readFile(join(checkout, "index.html"), "utf8")).toContain("agent edit");
  expect((await readVideoStore(await videoDirectory(root, ref)))?.value.draft.html).toContain("local edit");
  expect(cli).not.toHaveBeenCalled();
});
