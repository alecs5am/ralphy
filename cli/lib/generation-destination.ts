import path from "node:path";
import {
  artifactKindDir,
  workspaceSharedAssetKindDir,
  type ArtifactKind,
} from "./paths.js";

export type GenerationDestination =
  | { kind: "project"; id: string }
  | { kind: "workspace"; id: string };

export type GenerationDestinationInput = {
  projectId?: string;
  workspaceId?: string;
};

export function generationDestination(input: GenerationDestinationInput): GenerationDestination {
  const projectId = input.projectId?.trim();
  const workspaceId = input.workspaceId?.trim();
  if (Boolean(projectId) === Boolean(workspaceId)) {
    throw new Error("generation requires exactly one project or workspace destination");
  }
  return projectId
    ? { kind: "project", id: projectId }
    : { kind: "workspace", id: workspaceId! };
}

export function destinationAssetPath(
  destination: GenerationDestination,
  kind: ArtifactKind | (string & {}),
  filename: string,
): string {
  const dir =
    destination.kind === "project"
      ? artifactKindDir(destination.id, kind)
      : workspaceSharedAssetKindDir(destination.id, kind);
  return path.join(dir, filename);
}

export function destinationInputFields(
  destination: GenerationDestination,
): { project: string } | { workspace: string } {
  return destination.kind === "project"
    ? { project: destination.id }
    : { workspace: destination.id };
}
