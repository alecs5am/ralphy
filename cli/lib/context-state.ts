import { DomainError } from "./errors/domain.js";

export type ResolvedCommandContext =
  | { kind: "session"; sessionId: string; workspaceId: string; projectId?: string }
  | { kind: "scope"; workspaceId: string; projectId?: string };

let current: ResolvedCommandContext | null = null;

export function setCommandContext(context: ResolvedCommandContext): void {
  current = context;
}

export function clearCommandContext(): void {
  current = null;
}

export function getCommandContext(): ResolvedCommandContext | null {
  return current;
}

export function assertCommandWorkspace(workspaceId: string): void {
  if (current !== null && current.workspaceId !== workspaceId) {
    throw conflict(
      "workspace",
      "Workspace conflicts with the immutable command scope",
    );
  }
}

export function assertCommandProject(
  projectId: string,
  workspaceId?: string,
): void {
  if (current?.projectId !== undefined && current.projectId !== projectId) {
    throw conflict(
      "project",
      "Project conflicts with the immutable command scope",
    );
  }
  if (workspaceId !== undefined) assertCommandWorkspace(workspaceId);
}

function conflict(field: "workspace" | "project", detail: string): DomainError {
  return new DomainError("E_INPUT_INVALID", undefined, {
    field,
    detail,
    verb: field,
  });
}
