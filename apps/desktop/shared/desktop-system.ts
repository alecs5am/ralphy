export interface DesktopSystemInfo {
  libraryPath: string | null;
  libraryWritable: boolean;
  libraryError: string | null;
  availableBytes: number | null;
  cacheBytes: number;
  shell: string;
  versions: { desktop: string; electron: string; node: string; chrome: string; core: string | null };
}

export interface DesktopSystemBridge {
  exportLibraryWorkspace(workspaceId: string): Promise<{ fileName: string } | null>;
  importLibraryWorkspace(): Promise<{ workspaceId: string } | null>;
  createLibraryWorkspace(name: string): Promise<string>;
  createLibraryProject(workspaceId: string, name: string): Promise<string>;
  getDesktopSystemInfo(): Promise<DesktopSystemInfo>;
  clearDesktopCache(): Promise<{ beforeBytes: number; afterBytes: number }>;
  revealDesktopFolder(folder: "library" | "logs"): Promise<void>;
}
export const DESKTOP_SYSTEM_CHANNELS = {
  exportWorkspace: "desktop:library:export-workspace",
  importWorkspace: "desktop:library:import-workspace",
  createWorkspace: "desktop:library:create-workspace",
  createProject: "desktop:library:create-project",
  info: "desktop:system:info",
  clearCache: "desktop:system:clear-cache",
  revealFolder: "desktop:system:reveal-folder",
} as const;
