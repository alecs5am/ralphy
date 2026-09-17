import type { Composition, ElementSnapshot } from "@hyperframes/sdk";
import { INSTRUMENT_PALETTE } from "@/shared/instrument/palette";
import { videoEscape, type VideoWorkspaceAsset } from "../../../../shared/video-workspace";

export const TRACKS = ["Video", "Titles", "Captions", "Voice", "Music"];
export function compositionInfo(comp: Composition) {
  const root = comp.getElements().find((item) => item.attributes["data-composition-id"]);
  return { root, width: Number(root?.attributes["data-width"]) || 1080, height: Number(root?.attributes["data-height"]) || 1920, duration: Number(root?.attributes["data-duration"]) || 18 };
}
export function timelineElements(comp: Composition): ElementSnapshot[] {
  const timings = comp.getElementTimings();
  return comp.getElements().map((item) => {
    const timing = timings[item.scopedId];
    return timing ? { ...item, start: timing.enterAt, duration: timing.exitAt === null || timing.enterAt === null ? null : timing.exitAt - timing.enterAt } : item;
  }).filter((item) => !item.attributes["data-composition-id"] && item.start !== null && item.duration !== null && item.duration > 0);
}
// SDK 0.8.31 snapshots omit data-duration; its public timing query resolves the declared range.
export const videoElement = (comp: Composition, id: string) => timelineElements(comp).find((item) => item.scopedId === id) ?? comp.getElement(id);
export const elementName = (item: ElementSnapshot) => item.attributes["data-name"] || item.text?.slice(0, 60) || item.attributes.src?.split("/").pop() || item.tag;
export const elementKind = (item: ElementSnapshot) => item.tag === "video" || item.tag === "img" ? "video" : item.tag === "audio" ? "audio" : "text";
export const frameTime = (seconds: number, fps: number) => Math.round(seconds * fps) / fps;
export function timecode(seconds: number, fps = 30): string {
  const frames = Math.max(0, Math.round(seconds * fps));
  return `${String(Math.floor(frames / fps / 60)).padStart(2, "0")}:${String(Math.floor(frames / fps) % 60).padStart(2, "0")}:${String(frames % fps).padStart(2, "0")}`;
}
export function changeTiming(comp: Composition, id: string, start: number, duration: number, fps: number) {
  const end = compositionInfo(comp).duration;
  const from = frameTime(Math.min(end - 1 / fps, Math.max(0, start)), fps);
  const length = frameTime(Math.max(1 / fps, Math.min(end - from, duration)), fps);
  comp.setTiming(id, { start: from, duration: length });
}
export function trimClip(comp: Composition, id: string, edge: "start" | "end", delta: number, fps: number) {
  const item = videoElement(comp, id);
  if (!item || item.start === null || item.duration === null || !Number.isFinite(delta)) return;
  const offset = Number(item.attributes["data-media-start"] || 0);
  const shift = frameTime(edge === "start" ? Math.min(item.duration - 1 / fps, Math.max(-item.start, elementKind(item) === "audio" || item.tag === "video" ? -offset : -Infinity, delta)) : Math.max(1 / fps - item.duration, delta), fps);
  comp.batch(() => {
    changeTiming(comp, id, item.start! + (edge === "start" ? shift : 0), item.duration! + (edge === "start" ? -shift : shift), fps);
    if (edge === "start" && ["video", "audio"].includes(item.tag)) comp.setAttribute(id, "data-media-start", String(offset + shift));
  });
}
export function duplicateClip(comp: Composition, id: string, start?: number): string | null {
  const item = videoElement(comp, id), root = compositionInfo(comp).root;
  if (!item || !root) return null;
  if (item.animationIds.length || item.children.length) throw new Error("Duplicate this animated or nested element with the agent to preserve its animation targets.");
  const attrs = Object.entries(item.attributes).filter(([key]) => key !== "id" && !key.startsWith("data-hf-")).map(([key, value]) => `${key}="${videoEscape(value)}"`).join(" ");
  const styles = Object.entries(item.inlineStyles).map(([key, value]) => `${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}:${value}`).join(";");
  const element = `<${item.tag} id="clip-${crypto.randomUUID()}" ${attrs} class="${videoEscape(item.classNames.join(" "))}" style="${videoEscape(styles)}">${videoEscape(item.text ?? "")}${item.tag === "img" ? "" : `</${item.tag}>`}`;
  const next = comp.addElement(root.scopedId, root.children.length, element);
  if (start !== undefined) comp.setTiming(next, { start });
  return next;
}
export function splitClip(comp: Composition, id: string, at: number, fps: number): string | null {
  const item = videoElement(comp, id);
  if (!item || item.start === null || item.duration === null) return null;
  const cut = frameTime(at, fps), offset = cut - item.start;
  if (offset < 1 / fps || item.duration - offset < 1 / fps) return null;
  let next: string | null = null;
  comp.batch(() => {
    next = duplicateClip(comp, id, cut);
    if (!next) return;
    comp.setTiming(next, { duration: item.duration! - offset });
    if (["video", "audio"].includes(item.tag)) comp.setAttribute(next, "data-media-start", String(Number(item.attributes["data-media-start"] || 0) + offset));
    comp.setTiming(id, { duration: offset });
  });
  return next;
}
export function addClip(comp: Composition, asset: VideoWorkspaceAsset | null, at: number, duration = 4): string {
  const { root, duration: total } = compositionInfo(comp);
  if (!root) throw new Error("Composition root is missing");
  const start = Math.min(Math.max(0, at), total - 0.1), length = Math.min(duration, total - start);
  const track = !asset ? 1 : asset.kind === "audio" ? 4 : 0;
  const timing = `class="clip" data-name="${videoEscape(asset?.name ?? "New title")}" data-start="${start}" data-duration="${length}" data-track-index="${track}"`;
  const tag = asset?.kind === "video" ? "video" : asset?.kind === "audio" ? "audio" : "img";
  const html = asset ? `<${tag} id="media-${crypto.randomUUID()}" ${timing} src="${videoEscape(asset.src)}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover"${tag === "img" ? ">" : ` playsinline></${tag}>`}`
    : `<p ${timing} style="position:absolute;left:10%;top:70%;width:80%;margin:0;color:${INSTRUMENT_PALETTE.light.brandInk};font-family:Arial,sans-serif;font-size:64px;font-weight:600;text-align:center;z-index:10">Your title here</p>`;
  return comp.addElement(root.scopedId, root.children.length, html);
}
