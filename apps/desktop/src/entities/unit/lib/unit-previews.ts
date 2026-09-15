import type { Page, UnitItemDto, UnitPresentationDto } from "../../../../electron/ralphy/types";
import type { CompositionOutputPreview } from "../../../../electron/ralphy/project-reader";
import type { MediaWorkbenchBridge, ProjectReference } from "../../../../electron/media/types";

export type DocumentUnitPreview = { revisionId: string; format: string; text: string; truncated: boolean };
export type UnitMedia = {
  id: string;
  role: string;
  position: number;
  kind: "image" | "video" | "audio" | "document" | "other";
  preview: CompositionOutputPreview | DocumentUnitPreview;
};

export type SocialTarget = {
  id: string;
  platform: string;
  variant: "video" | "reels" | "shorts" | "carousel" | "post" | "pin" | "generic";
  label: string;
};

export type UnitPreviewKind = "video" | "carousel" | "longform" | "post" | "generic";

export function preferredUnitPoster(media: UnitMedia[], portrait = false): UnitMedia | null {
  const roles = portrait ? ["vertical-cover", "cover"] : ["cover", "vertical-cover"];
  return roles.map((role) => media.find((item) => !("text" in item.preview) && item.role === role)).find(Boolean) ?? null;
}

export function unitPreviewKind(format: string): UnitPreviewKind {
  const value = format.toLowerCase();
  if (value.includes("long") || value.includes("16:9") || value.includes("youtube")) return "longform";
  if (value.includes("carousel") || value.includes("gallery") || value.includes("slides")) return "carousel";
  if (value === "image" || value.includes("post") || value.includes("article") || value.includes("text")) return "post";
  if (value.includes("video") || value.includes("audio") || value.includes("9:16") || value.includes("reel") || value.includes("short")) return "video";
  return "generic";
}

const targets: Record<string, SocialTarget[]> = {
  video: [
    { id: "tiktok-video", platform: "tiktok", variant: "video", label: "TikTok" },
    { id: "instagram-reels", platform: "instagram", variant: "reels", label: "Reels" },
    { id: "youtube-shorts", platform: "youtube", variant: "shorts", label: "Shorts" },
  ],
  audio: [
    { id: "tiktok-video", platform: "tiktok", variant: "video", label: "TikTok" },
    { id: "instagram-reels", platform: "instagram", variant: "reels", label: "Reels" },
    { id: "youtube-shorts", platform: "youtube", variant: "shorts", label: "Shorts" },
  ],
  carousel: [
    { id: "instagram-carousel", platform: "instagram", variant: "carousel", label: "Instagram" },
    { id: "x-carousel", platform: "x", variant: "post", label: "X" },
  ],
  longform: [
    { id: "youtube-video", platform: "youtube", variant: "video", label: "YouTube" },
  ],
  post: [
    { id: "instagram-post", platform: "instagram", variant: "post", label: "Instagram" },
    { id: "x-post", platform: "x", variant: "post", label: "X" },
  ],
};
const platformLabels: Record<string, string> = {
  instagram: "Instagram",
  linkedin: "LinkedIn",
  pinterest: "Pinterest",
  tiktok: "TikTok",
  youtube: "YouTube",
  x: "X",
};

function targetFor(platform: string, format: string): SocialTarget {
  const kind = unitPreviewKind(format);
  const known = targets[kind]?.find((target) => target.platform === platform);
  if (known) return known;
  const variant = kind === "carousel" ? "carousel" : kind === "post" ? "post" : kind === "video" && platform === "instagram" ? "reels" : kind === "video" && platform === "youtube" ? "shorts" : kind === "video" ? "video" : "generic";
  const label = platform === "instagram" && kind === "video" ? "Reels" : platform === "youtube" && kind === "video" ? "Shorts" : platformLabels[platform] ?? platform.replace(/(^|[-_])\w/g, (part) => part.toUpperCase().replace(/[-_]/, " "));
  return { id: `${platform}-${kind}`, platform, variant, label };
}

export function socialTargets(format: string, presentations: UnitPresentationDto[]): SocialTarget[] {
  if (presentations.length) return [...new Set([...presentations].sort((a, b) => a.position - b.position).map((item) => item.platform))].map((platform) => targetFor(platform, format));
  const kind = unitPreviewKind(format);
  const base = targets[kind] ?? [];
  const fallback = [{ id: "generic-unit", platform: "generic", variant: "generic", label: "Preview" } satisfies SocialTarget];
  return base.length ? [...base] : fallback;
}

type UnitMediaApi = Pick<MediaWorkbenchBridge, "resolveCompositionOutputPreview" | "loadDocumentPreview">;

/** A revision owns its thumbnail; inspecting another revision must never change it. */
export async function resolveUnitRevisionPreview(
  api: UnitMediaApi & Pick<MediaWorkbenchBridge, "loadProjectUnitPage" | "loadProjectUnitPreview">,
  project: ProjectReference,
  revisionId: string,
  preferMedia = false,
): Promise<UnitMedia | null> {
  project = { workspaceId: project.workspaceId, projectId: project.projectId };
  const presentations = await api.loadProjectUnitPage(project, { kind: "presentations", revisionId });
  const presentation = [...presentations.items].sort((a, b) => a.position - b.position)[0];
  if (!preferMedia && presentation?.coverArtifactRevisionId) {
    try {
      const preview = await api.resolveCompositionOutputPreview(project, presentation.coverArtifactRevisionId);
      if (preview.mime?.startsWith("image/")) return { id: presentation.coverArtifactRevisionId, role: "cover", position: 0, kind: "image", preview };
    } catch { /* A missing cover can still have a playable public item. */ }
  }
  const metadata = presentation ? await api.loadProjectUnitPreview(project, revisionId, presentation.platform) : null;
  const publicIds = metadata?.presentation.unitItemIds;
  let cursor: string | null = null;
  const seen = new Set<string>();
  do {
    const page: Page<UnitItemDto> = await api.loadProjectUnitPage(project, { kind: "items", revisionId, cursor });
    const items = [...page.items].sort((a, b) => a.position - b.position).filter((item) => Array.isArray(publicIds)
      ? publicIds.includes(item.id) : !["source", "reference", "evidence"].includes(item.role));
    for (const item of items) {
      const [media] = await resolveUnitMedia(api, project, [item]);
      if (media && media.kind !== "other") return media;
    }
    cursor = page.nextCursor;
    if (cursor && seen.has(cursor)) throw new Error("Repeated Unit item cursor");
    if (cursor) seen.add(cursor);
  } while (cursor);
  return null;
}

export async function resolveUnitMedia(
  api: UnitMediaApi,
  project: ProjectReference,
  items: UnitItemDto[],
): Promise<UnitMedia[]> {
  const media = await Promise.all([...items].sort((a, b) => a.position - b.position).map(async (item): Promise<UnitMedia | null> => {
    try {
      if (item.artifactRevisionId) {
        const preview = await api.resolveCompositionOutputPreview(project, item.artifactRevisionId);
        const mime = preview.mime ?? "";
        return { id: item.id, role: item.role, position: item.position, kind: mime.startsWith("image/") ? "image" : mime.startsWith("video/") ? "video" : mime.startsWith("audio/") ? "audio" : "other", preview };
      }
      if (item.documentRevisionId) {
        return { id: item.id, role: item.role, position: item.position, kind: "document", preview: await api.loadDocumentPreview(project, item.documentRevisionId) };
      }
    } catch {
      return null;
    }
    return null;
  }));
  return media.filter((item): item is UnitMedia => item !== null);
}
