export interface VideoWorkspaceRef { workspaceId: string; projectId: string; unitId: string }
export interface VideoWorkspaceAsset {
  src: string; name: string; kind: "image" | "video" | "audio" | "font" | "other";
  previewUrl?: string; missing?: boolean;
}
export interface VideoWorkspaceDraft {
  schemaVersion: 1; html: string; fps: number; updatedAt: number;
  compositionId: string | null; compositionRevisionId: string | null;
  checkoutPath: string | null; sourceKind: "composition" | "file" | "empty";
  checkoutHash?: string;
  sourceWarning?: string;
  assets: VideoWorkspaceAsset[];
}
export interface VideoWorkspaceVersion { id: string; savedAt: number; html: string }
export interface VideoWorkspaceLoad {
  draftPath?: string;
  draft: VideoWorkspaceDraft; revision: string | null; versions: VideoWorkspaceVersion[];
  render: VideoWorkspaceRender | null;
}
export interface VideoAgentRequest {
  prompt: string;
  attachment: { kind: "file"; ref: string; label: string; instructions: string };
}
export interface VideoWorkspaceRender {
  compositionRevisionId: string; buildId: string; artifactRevisionId: string | null;
  state: "succeeded" | "failed"; sourceRevision: string; createdAt: number;
  previewUrl?: string; error?: string;
}
export interface VideoWorkspaceBridge {
  loadVideoWorkspace(ref: VideoWorkspaceRef): Promise<VideoWorkspaceLoad>;
  saveVideoWorkspace(ref: VideoWorkspaceRef, html: string, fps: number, expectedRevision: string | null): Promise<VideoWorkspaceLoad>;
  importVideoWorkspaceAsset(ref: VideoWorkspaceRef, file?: File): Promise<VideoWorkspaceAsset | null>;
  previewVideoWorkspace(ref: VideoWorkspaceRef, html: string): Promise<string>;
  renderVideoWorkspace(ref: VideoWorkspaceRef, expectedRevision: string): Promise<VideoWorkspaceRender>;
}
export const VIDEO_CHANNELS = {
  loadVideoWorkspace: "video-workspace:load", saveVideoWorkspace: "video-workspace:save",
  importVideoWorkspaceAsset: "video-workspace:import", previewVideoWorkspace: "video-workspace:preview",
  renderVideoWorkspace: "video-workspace:render",
} as const;

export function videoRef(value: unknown): VideoWorkspaceRef {
  const ref = value as VideoWorkspaceRef;
  if (!ref || ![ref.workspaceId, ref.projectId, ref.unitId].every((part) => typeof part === "string" && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(part))) throw new Error("Invalid video workspace");
  return { workspaceId: ref.workspaceId, projectId: ref.projectId, unitId: ref.unitId };
}
export function videoHtml(value: unknown): string {
  if (typeof value !== "string" || value.length > 8 * 1024 * 1024 || !value.includes("data-composition-id")) throw new Error("Choose a HyperFrames composition under 8 MB");
  return value;
}
export const videoEscape = (value: string): string => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]!));
export function blankVideoComposition(media?: { src: string; kind: "video" | "image" }): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#111;color:white}#video-root{position:relative;width:1080px;height:1920px;overflow:hidden;font-family:Arial,sans-serif}.clip{position:absolute;box-sizing:border-box}</style></head><body><div id="video-root" data-composition-id="main" data-start="0" data-width="1080" data-height="1920" data-duration="18">${media ? `<${media.kind === "video" ? "video" : "img"} id="source" class="clip" data-name="Original clip" data-start="0" data-duration="18" data-track-index="0" src="${videoEscape(media.src)}" style="inset:0;width:100%;height:100%;object-fit:contain"${media.kind === "video" ? ' data-editor-probe="true" playsinline></video>' : ">"}` : ""}</div></body></html>`;
}
