export interface GenerationUnitSource { canvasId: string; runId: string; resultId: string }
export interface GenerationUnitDestination { projectId: string | null; unitId?: string; expectedLatestRevisionId?: string | null; name?: string }
export interface SavedGenerationUnit { workspaceId: string; projectId: string | null; unitId: string; revisionId: string; revisionNo: number; label: string; alreadySaved: boolean }
export interface GenerationUnitOptions {
  workspaceName: string;
  projects: { id: string; name: string }[];
  units: { id: string; label: string; format: string; latestRevisionId: string | null }[];
}
export interface GenerationUnitsBridge {
  loadGenerationUnitOptions(workspaceId: string, projectId: string | null): Promise<GenerationUnitOptions>;
  saveGenerationToUnit(workspaceId: string, source: GenerationUnitSource, destination: GenerationUnitDestination): Promise<SavedGenerationUnit>;
}
export const GENERATION_UNIT_CHANNELS = { options: "workspace:generation:unit-options", save: "workspace:generation:save-unit" } as const;
