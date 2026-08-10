import path from "node:path";
import type { JsonValue } from "../store/types.js";

export const classifierVersion = "task-2d1-v1" as const;

export type CompositionLocatorClassification =
  | { kind: "root" | "snapshot"; canonicalProjectRelative: string }
  | { kind: "invalid"; reason: string };

export type RenderLocatorClassification =
  | { kind: "render"; canonicalProjectRelative: string }
  | { kind: "invalid"; reason: string };

export type HyperframesGenerationClassification =
  | {
    kind: "eligible";
    composition: Exclude<CompositionLocatorClassification, { kind: "invalid" }>;
    render: Exclude<RenderLocatorClassification, { kind: "invalid" }>;
    completedAt: string;
    outputBytes: number;
  }
  | { kind: "ignored"; reason: "different-endpoint" | "error" | "malformed" | "wrapper-without-output" }
  | { kind: "needs-review"; reason: "scope-mismatch" | "composition-invalid" | "render-invalid" };

export function classifyCompositionLocator(input: {
  value: unknown;
  projectLocator: string;
}): CompositionLocatorClassification {
  const relative = projectRelativeLocator(input.value, input.projectLocator);
  if (relative === null) return { kind: "invalid", reason: "not an exact project-relative locator" };
  if (relative === "index.html") return { kind: "root", canonicalProjectRelative: relative };
  if (/^compositions\/[^/]+\.html$/u.test(relative)) {
    return { kind: "snapshot", canonicalProjectRelative: relative };
  }
  return { kind: "invalid", reason: "not a direct Composition source" };
}

export function classifyRenderLocator(input: {
  value: unknown;
  projectLocator: string;
}): RenderLocatorClassification {
  const relative = projectRelativeLocator(input.value, input.projectLocator);
  return relative !== null && /^render\/[^/]+\.mp4$/u.test(relative)
    ? { kind: "render", canonicalProjectRelative: relative }
    : { kind: "invalid", reason: "not a direct render output" };
}

export function decodeHyperframesGenerationEvidence(input: {
  body: JsonValue;
  documentProjectId: string;
  owningEntryWorkspaceId: string;
  owningEntryProjectId: string;
  projectLocator: string;
}): HyperframesGenerationClassification {
  const body = asRecord(input.body);
  if (!body || body.endpoint !== "hyperframes-render") return { kind: "ignored", reason: "different-endpoint" };
  if (body.status === "error") return { kind: "ignored", reason: "error" };
  if (body.status !== "ok") return { kind: "ignored", reason: "malformed" };
  if (!input.documentProjectId || input.documentProjectId !== input.owningEntryProjectId
    || !input.owningEntryWorkspaceId || !validProjectLocator(input.projectLocator)) {
    return { kind: "needs-review", reason: "scope-mismatch" };
  }
  const generationInput = asRecord(body.input);
  const generationOutput = asRecord(body.output);
  if (!generationInput || !scopeAgrees(generationInput, input)
    || typeof body.timestamp !== "string" || !Number.isFinite(Date.parse(body.timestamp))) {
    return { kind: "needs-review", reason: "scope-mismatch" };
  }
  const composition = classifyCompositionLocator({
    value: generationInput.composition,
    projectLocator: input.projectLocator,
  });
  if (composition.kind === "invalid") return { kind: "needs-review", reason: "composition-invalid" };
  if (!generationOutput || generationOutput.local === undefined) {
    return { kind: "ignored", reason: "wrapper-without-output" };
  }
  const render = classifyRenderLocator({ value: generationOutput.local, projectLocator: input.projectLocator });
  if (render.kind === "invalid" || typeof generationOutput.bytes !== "number"
    || !Number.isSafeInteger(generationOutput.bytes) || generationOutput.bytes < 0) {
    return { kind: "needs-review", reason: "render-invalid" };
  }
  return {
    kind: "eligible",
    composition,
    render,
    completedAt: body.timestamp,
    outputBytes: generationOutput.bytes,
  };
}

function projectRelativeLocator(value: unknown, projectLocator: string): string | null {
  if (typeof value !== "string" || !value || value.includes("\\") || value.startsWith("/")
    || value.includes("//") || !validProjectLocator(projectLocator)) return null;
  const relative = value.startsWith(`${projectLocator}/`) ? value.slice(projectLocator.length + 1) : value;
  const parts = relative.split("/");
  return parts.some((part) => !part || part === "." || part === "..") ? null : relative;
}

function validProjectLocator(value: string): boolean {
  return /^(?:workspaces\/[^/]+\/projects\/[^/]+|projects\/[^/]+)$/u.test(value)
    && !value.includes("\\") && !value.includes("//")
    && !value.split("/").some((part) => part === "." || part === "..");
}

function scopeAgrees(
  value: Record<string, JsonValue>,
  input: Pick<Parameters<typeof decodeHyperframesGenerationEvidence>[0], "projectLocator" | "owningEntryWorkspaceId" | "owningEntryProjectId">,
): boolean {
  const parts = input.projectLocator.split("/");
  const projectSlug = path.posix.basename(input.projectLocator);
  const workspaceSlug = parts[0] === "workspaces" ? parts[1]! : "default";
  return (value.project === undefined || value.project === projectSlug || value.project === input.owningEntryProjectId)
    && (value.workspace === undefined || value.workspace === workspaceSlug || value.workspace === input.owningEntryWorkspaceId);
}

function asRecord(value: JsonValue | undefined): Record<string, JsonValue> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, JsonValue>
    : null;
}
