import { randomUUID } from "node:crypto";
import { VIDEO_CHANNELS, videoHtml, videoRef } from "../../shared/video-workspace";
import { importVideoAsset, loadVideo, renderVideo, saveVideo, type VideoRuntime } from "./runtime";

const previews = new Map<string, { html: string; assertCurrent(): void }>();
export function videoPreviewResponse(url: string): Response {
  const parsed = new URL(url), entry = parsed.hostname === "preview" ? previews.get(parsed.pathname.slice(1)) : null;
  if (!entry) return new Response("Preview expired", { status: 404 });
  try { entry.assertCurrent(); } catch { return new Response("Library changed", { status: 410 }); }
  return new Response(entry.html, { headers: {
    "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: ralphy-media:; media-src ralphy-media:; font-src data: ralphy-media:; connect-src ralphy-media:; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'; sandbox allow-scripts",
  } });
}
export function registerVideoWorkspaceIpc(deps: {
  handle(channel: string, handler: (...args: unknown[]) => Promise<unknown>): void;
  capture(workspaceId: string): Promise<VideoRuntime>;
  chooseFile(): Promise<string | null>;
}) {
  for (const key of Object.keys(VIDEO_CHANNELS) as (keyof typeof VIDEO_CHANNELS)[]) {
    deps.handle(VIDEO_CHANNELS[key], async (rawRef, value, fps, expected) => {
      try {
        const ref = videoRef(rawRef), runtime = await deps.capture(ref.workspaceId);
        await runtime.request("unit.show", { context: { workspaceId: ref.workspaceId, projectId: ref.projectId }, unitId: ref.unitId });
        runtime.assertCurrent();
        if (key === "loadVideoWorkspace") return loadVideo(runtime, ref);
        if (key === "saveVideoWorkspace") {
          if (![24, 25, 30, 60].includes(Number(fps)) || expected !== null && typeof expected !== "string") throw new Error("Invalid video save request");
          return saveVideo(runtime, ref, videoHtml(value), Number(fps), expected as string | null);
        }
        if (key === "importVideoWorkspaceAsset") {
          const path = value === undefined ? await deps.chooseFile() : value;
          if (path === null) return null;
          if (typeof path !== "string") throw new Error("Invalid media file");
          return importVideoAsset(runtime, ref, path);
        }
        if (key === "renderVideoWorkspace") {
          if (typeof value !== "string") throw new Error("Save the video before rendering");
          return renderVideo(runtime, ref, value);
        }
        const html = videoHtml(value), token = randomUUID();
        previews.set(token, { html, assertCurrent: runtime.assertCurrent });
        while (previews.size > 16) previews.delete(previews.keys().next().value!);
        return `ralphy-video://preview/${token}`;
      } catch (error) {
        throw Object.assign(error instanceof Error ? error : new Error("Video workspace failed"), { code: "E_VALIDATION_FAILED" });
      }
    });
  }
}
