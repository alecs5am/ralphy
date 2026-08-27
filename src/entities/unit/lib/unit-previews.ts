import type { UnitItemDto, UnitPresentationDto } from "../../../../electron/ralphy/types";
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
  if (value.includes("post") || value.includes("article") || value.includes("text")) return "post";
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
  const kind = unitPreviewKind(format);
  const base = targets[kind] ?? [];
  const presentationsOnly = kind === "generic" && presentations.length > 0;
  const fallback = [{ id: "generic-unit", platform: "generic", variant: "generic", label: "Preview" } satisfies SocialTarget];
  const result = [...(presentationsOnly ? [] : base.length ? base : fallback)];
  for (const platform of new Set(presentations.map((presentation) => presentation.platform))) {
    if (!result.some((target) => target.platform === platform)) result.push(targetFor(platform, format));
  }
  return result;
}

type UnitMediaApi = Pick<MediaWorkbenchBridge, "resolveCompositionOutputPreview" | "loadDocumentPreview">;

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
