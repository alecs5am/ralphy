import { afterEach, expect, test, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { mkdtemp, rm, symlink, mkdir, writeFile, readFile, rename } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openComposition } from "@hyperframes/sdk";
import { blankVideoComposition, videoRef } from "../shared/video-workspace";
import { addClip, changeTiming, compositionInfo, splitClip, timelineElements, trimClip, videoElement } from "../src/features/video-workspace/lib/composition";
import { readVideoStore, videoDirectory, writeVideoStore, type VideoStored } from "../electron/video-workspace/store";
import { loadVideo, renderVideo, saveVideo, type VideoRuntime } from "../electron/video-workspace/runtime";
import { prepareVideoUnitRevision } from "../electron/video-workspace/unit-revision";

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
  expect(videoElement(comp, id)?.attributes.id).toMatch(/^clip-/);
  expect(videoElement(comp, id)?.attributes.id).not.toBe(videoElement(comp, clip.scopedId)?.attributes.id);
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

test("FPS-only saves preserve complete versions and restoring preserves the current draft", async () => {
  const root = await mkdtemp(join(tmpdir(), "video-fps-history-")); roots.push(root);
  const ref = { workspaceId: "ws", projectId: "project", unitId: "unit" };
  const directory = await videoDirectory(root, ref);
  const html = blankVideoComposition();
  const value: VideoStored = { draft: { schemaVersion: 1, html, fps: 24, updatedAt: 1, compositionId: null, compositionRevisionId: null, checkoutPath: null, sourceKind: "empty", assets: [] }, versions: [], render: null };
  let revision = await writeVideoStore(directory, value, null, () => undefined);
  const runtime: VideoRuntime = { root, cli: vi.fn(), request: vi.fn(), mint: async () => ({ url: "preview" }), assertCurrent() {} };
  const sixty = await saveVideo(runtime, ref, html, 60, revision);
  expect(sixty.versions[0]).toMatchObject({ html, fps: 24 });
  const thirty = await saveVideo(runtime, ref, html, 30, sixty.revision);
  expect(thirty.versions.map((version) => version.fps)).toEqual([60, 24]);
  const original = thirty.versions[1];
  await saveVideo(runtime, ref, original.html, original.fps!, thirty.revision);
  const reopened = (await readVideoStore(directory))!.value;
  expect(reopened.draft.fps).toBe(24);
  expect(reopened.versions.map((version) => version.fps)).toEqual([30, 60, 24]);
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

test("missing source media and folders preserve saved edits and recover when restored", async () => {
  const root = await mkdtemp(join(tmpdir(), "video-missing-")); roots.push(root);
  const ref = { workspaceId: "ws", projectId: "project", unitId: "unit" };
  const checkout = join(root, "tmp", "draft", "checkout"); await mkdir(checkout, { recursive: true });
  const html = blankVideoComposition({ src: "source.mp4", kind: "video" });
  await writeFile(join(checkout, "index.html"), html); await writeFile(join(checkout, "source.mp4"), "source");
  const runtime: VideoRuntime = { root, cli: vi.fn(), assertCurrent() {}, mint: async () => ({ url: "preview" }), request: vi.fn(async (method) => {
    if (method === "unit.show") return { projectId: "project", compositionId: "composition" };
    if (method === "composition.show") return { id: "composition", latestRevisionId: "draft" };
    if (method === "composition.revision.show") return { id: "draft", state: "draft" };
    throw new Error(`Unexpected ${method}`);
  }) as VideoRuntime["request"] };
  const opened = await loadVideo(runtime, ref);
  const edit = html.replace("</body>", "<!-- saved edit --></body>");
  await saveVideo(runtime, ref, edit, 24, opened.revision);
  await rename(checkout, `${checkout}-recovery`);
  const missing = await loadVideo(runtime, ref);
  expect(missing.draft.html).toBe(edit);
  expect(missing.draft.checkoutPath).toBeNull();
  expect(missing.draft.sourceWarning).toContain("saved edits are preserved");
  expect(missing.draft.assets).toEqual([expect.objectContaining({ src: "source.mp4", missing: true })]);
  await rename(`${checkout}-recovery`, checkout);
  const restored = await loadVideo(runtime, ref);
  expect(restored.draft.checkoutPath).not.toBeNull();
  expect(restored.draft.html).toBe(edit);
  expect(restored.draft.assets[0].missing).toBe(false);
});

test("a video render revision preserves paged items, presentation order and caption selection", async () => {
  const calls: Array<[string, any]> = [];
  const request = vi.fn(async (method, params) => {
    calls.push([method, params]);
    const page = (items: unknown[], nextCursor: string | null = null) => ({ items, nextCursor });
    if (method === "unit.show") return { id: "unit", latestRevisionId: "before" };
    if (method === "unit.items") return params.after ? page([{ id: "caption", documentRevisionId: "doc", artifactRevisionId: null, role: "caption", position: 1, config: null }]) : page([{ id: "video", artifactRevisionId: "old-video", documentRevisionId: null, role: "master", position: 0, config: { fit: "cover" } }], "next-items");
    if (method === "unit.presentations") return page([{ id: "presentation", platform: "instagram", position: 0, effectiveCaptionRevisionId: "final", coverArtifactRevisionId: null, crop: null, safeArea: null, options: { short: true } }]);
    if (method === "media.revision.show") return { objectId: "object" };
    if (method === "locator.resolve") return { mime: "video/mp4" };
    if (method === "presentation.items") return page([{ unitItemId: "video", position: 0, config: null }]);
    if (method === "presentation.captions") return page([{ id: "final", revisionNo: 2, state: "final", text: "Ready caption" }, { id: "draft", revisionNo: 1, state: "draft", text: "Draft caption" }]);
    if (method === "unit.revise") return { id: "after" };
    throw new Error(`Unexpected ${method}`);
  }) as VideoRuntime["request"];
  const append = await prepareVideoUnitRevision(request, { workspaceId: "ws", projectId: "project", unitId: "unit" });
  await append("new-video", "composition-revision");
  const revised = calls.find(([method]) => method === "unit.revise")![1];
  expect(revised.expectedLatestRevisionId).toBe("before");
  expect(revised.parentRevisionId).toBe("before");
  expect(revised.items).toEqual([
    { artifactRevisionId: "new-video", documentRevisionId: null, role: "master", position: 0, config: { fit: "cover" } },
    { artifactRevisionId: null, documentRevisionId: "doc", role: "caption", position: 1, config: null },
  ]);
  expect(revised.presentations[0]).toMatchObject({ effectiveCaptionRevisionNo: 2, items: [{ unitItemPosition: 0, position: 0, config: null }], captions: [{ state: "draft", text: "Draft caption" }, { state: "final", text: "Ready caption" }] });
});
