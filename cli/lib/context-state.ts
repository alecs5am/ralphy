import { DomainError } from "./errors/domain.js";

export type ResolvedCommandContext =
  | { kind: "session"; sessionId: string; workspaceId: string; projectId?: string }
  | { kind: "scope"; workspaceId: string; projectId?: string };

/**
 * The slugs the resolved scope is also known by (#573). Compatibility verbs
 * still address a Project or Workspace by slug; naming the resolved scope by
 * its slug is not a conflict with it.
 */
export type CommandScopeLabels = {
  workspaceSlug?: string;
  projectSlug?: string;
};

let current: ResolvedCommandContext | null = null;
let labels: CommandScopeLabels = {};

export function setCommandContext(
  context: ResolvedCommandContext,
  scopeLabels: CommandScopeLabels = {},
): void {
  current = context;
  labels = { ...scopeLabels };
}

export function clearCommandContext(): void {
  current = null;
  labels = {};
}

export function getCommandContext(): ResolvedCommandContext | null {
  return current;
}

/** The slugs the resolved scope is known by; empty without a resolved scope. */
export function getCommandScopeLabels(): CommandScopeLabels {
  return { ...labels };
}

/**
 * Whether a compatibility reference names the scoped Project: its id, or the
 * slug the scope was resolved from (#573, #585).
 */
export function namesCommandProject(reference: string): boolean {
  return current?.projectId !== undefined &&
    (reference === current.projectId || reference === labels.projectSlug);
}

export function assertCommandWorkspace(workspaceId: string): void {
  if (
    current !== null &&
    current.workspaceId !== workspaceId &&
    labels.workspaceSlug !== workspaceId
  ) {
    throw conflict(
      "workspace",
      `Workspace ${quote(workspaceId)} conflicts with the immutable command scope (${describeScope(current)})`,
    );
  }
}

export function assertCommandProject(
  projectId: string,
  workspaceId?: string,
): void {
  if (
    current?.projectId !== undefined &&
    current.projectId !== projectId &&
    labels.projectSlug !== projectId
  ) {
    throw conflict(
      "project",
      `Project ${quote(projectId)} conflicts with the immutable command scope (${describeScope(current)}); ` +
        `pass ${labels.projectSlug ? `${plain(labels.projectSlug)} or ` : ""}${current.projectId}, or change the scope flags`,
    );
  }
  if (workspaceId !== undefined) assertCommandWorkspace(workspaceId);
}

function describeScope(context: ResolvedCommandContext): string {
  const workspace = labels.workspaceSlug
    ? `Workspace ${plain(labels.workspaceSlug)} (${context.workspaceId})`
    : `Workspace ${context.workspaceId}`;
  const project = context.projectId === undefined
    ? ""
    : labels.projectSlug
      ? `, Project ${plain(labels.projectSlug)} (${context.projectId})`
      : `, Project ${context.projectId}`;
  const session = context.kind === "session" ? `Session ${context.sessionId}: ` : "";
  return `${session}${workspace}${project}`;
}

/** One printable, bounded line: DomainError rejects control characters. */
function plain(value: string, max = 80): string {
  const flat = value.replace(/[\p{Cc}\p{Cs}\u2028\u2029]+/gu, " ").replaceAll('"', "'");
  return flat.length > max ? `${flat.slice(0, max - 1)}...` : flat;
}

function quote(value: string): string {
  return `"${plain(value)}"`;
}

function conflict(field: "workspace" | "project", detail: string): DomainError {
  return new DomainError("E_INPUT_INVALID", undefined, {
    field,
    detail,
    verb: field,
  });
}
