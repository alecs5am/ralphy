import type { VideoWorkspaceAsset } from "../../../../shared/video-workspace";

export function videoAssetMetadata(asset: VideoWorkspaceAsset): Promise<{ duration: number; width: number; height: number } | null> {
  if (!asset.previewUrl || !["audio", "video"].includes(asset.kind)) return Promise.resolve(null);
  return new Promise((resolve) => {
    const media = document.createElement("video");
    const done = (value: { duration: number; width: number; height: number } | null) => {
      clearTimeout(timer); media.onloadedmetadata = media.onerror = null;
      media.removeAttribute("src"); media.load(); resolve(value);
    };
    const timer = setTimeout(() => done(null), 6000);
    media.onloadedmetadata = () => done(Number.isFinite(media.duration) && media.duration > 0 ? { duration: media.duration, width: media.videoWidth, height: media.videoHeight } : null);
    media.onerror = () => done(null); media.preload = "metadata"; media.src = asset.previewUrl!;
  });
}
