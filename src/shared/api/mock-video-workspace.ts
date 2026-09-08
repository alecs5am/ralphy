import type { VideoWorkspaceBridge } from "../../../shared/video-workspace";

export function mockVideoWorkspace(): VideoWorkspaceBridge {
  const unavailable = async (): Promise<never> => { throw new Error("Video workspaces require the desktop app"); };
  return { loadVideoWorkspace: unavailable, saveVideoWorkspace: unavailable, importVideoWorkspaceAsset: unavailable, previewVideoWorkspace: unavailable, renderVideoWorkspace: unavailable };
}
