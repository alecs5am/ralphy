import path from "node:path";
import fs from "node:fs/promises";
import { ralphDir } from "./paths.js";
import {
  completeArtifactRun,
  finishRun,
  finishRunAttempt,
  startRun,
  startRunAttempt,
  projectRunFailure,
} from "./store/runs.js";
import type { ArtifactKind, JsonValue } from "./store/types.js";
import { out as emitOutput } from "./output.js";

type ProviderEvidence = Record<string, unknown>;

export async function produceArtifactRevision(input: {
  scope: { projectId: string } | { workspaceId: string };
  runKind: string;
  requestedOutput: string;
  artifactKind: ArtifactKind;
  mime: string;
  provider: string;
  model: string;
  request?: JsonValue | null;
  metadata?: JsonValue | null;
  produce: (outputPath: string, runId: string) => Promise<unknown>;
}) {
  const requested = path.resolve(input.requestedOutput);
  const extension = path.extname(requested);
  const slug = path.basename(requested, extension);
  if (!slug || !extension) throw new Error("Artifact output requires a filename and extension");
  const run = startRun({ ...input.scope, kind: input.runKind, label: slug });
  const attempt = startRunAttempt({
    runId: run.id,
    provider: input.provider,
    model: input.model,
    request: input.request,
  });
  const outputPath = path.join(ralphDir(), "tmp", run.id, `${slug}${extension.toLowerCase()}`);
  let produced: unknown;
  try {
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    produced = await input.produce(outputPath, run.id);
  } catch (error) {
    const projected = projectRunFailure(error, { provider: input.provider });
    finishRunAttempt(attempt.id, { state: "failed", error: projected });
    finishRun(run.id, { state: "failed", error: projected });
    throw projected;
  }
  const evidence = produced && typeof produced === "object"
    ? produced as ProviderEvidence
    : {};
  const finishedPath = typeof evidence.localPath === "string" ? evidence.localPath : outputPath;
  const costUsd = typeof evidence.costUsd === "number" ? evidence.costUsd : 0;
  const provider = safeProvider(evidence.provider) ?? input.provider;
  const model = safeModel(evidence.model) ?? input.model;
  return completeArtifactRun({
    runId: run.id,
    attemptId: attempt.id,
    finishedPath,
    originalName: `${slug}${extension.toLowerCase()}`,
    mime: input.mime,
    artifact: { slug, kind: input.artifactKind, state: "candidate", metadata: input.metadata },
    objectMetadata: { provider, model },
    provider,
    model,
    response: providerCompletionFacts(evidence, model, input.mime),
    costUsd,
  });
}

const ARTIFACT_LOCATOR_FIELDS = new Set([
  "anchor", "anchorPath", "audioPath", "dir", "from", "input", "localPath",
  "metaPath", "music", "output", "outputPath", "path", "providerPath", "remoteUrl",
  "source", "src", "srcs", "srt", "uri", "url", "videoPath", "voice",
]);
const OMIT_ARTIFACT_VALUE = Symbol("omitArtifactValue");

/** Emit converted Artifact results after recursively removing source locators. */
export function artifactOut(value: unknown): void {
  const projected = withoutArtifactLocators(value);
  emitOutput(projected === OMIT_ARTIFACT_VALUE ? null : projected);
}

function withoutArtifactLocators(value: unknown, key?: string): unknown | typeof OMIT_ARTIFACT_VALUE {
  if (typeof value === "string") {
    return ARTIFACT_LOCATOR_FIELDS.has(key ?? "") || isExplicitLocator(value)
      ? OMIT_ARTIFACT_VALUE
      : value;
  }
  if (Array.isArray(value)) {
    const children = value
      .map((child) => withoutArtifactLocators(child, key))
      .filter((child) => child !== OMIT_ARTIFACT_VALUE);
    return children.length === 0 && ARTIFACT_LOCATOR_FIELDS.has(key ?? "")
      ? OMIT_ARTIFACT_VALUE
      : children;
  }
  if (!value || typeof value !== "object") return value;
  const entries: Array<[string, unknown]> = [];
  for (const [childKey, child] of Object.entries(value)) {
    const projected = withoutArtifactLocators(child, childKey);
    if (projected !== OMIT_ARTIFACT_VALUE) entries.push([childKey, projected]);
  }
  return Object.fromEntries(entries);
}

function isExplicitLocator(value: string): boolean {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(value) || /^data:/i.test(value) ||
    path.posix.isAbsolute(value) || path.win32.isAbsolute(value) ||
    /^[.]{1,2}[\\/]/.test(value) || /^~[\\/]/.test(value);
}

function safeProvider(value: unknown): string | null {
  return typeof value === "string" && /^[a-z][a-z0-9.-]{0,63}$/.test(value) ? value : null;
}

function safeModel(value: unknown): string | null {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._/-]{0,159}$/.test(value) ? value : null;
}

/** Whitelist bounded, locator-free provider facts for Attempt persistence. */
export function providerCompletionFacts(
  evidence: ProviderEvidence,
  model: string,
  mime: string,
): Record<string, JsonValue> {
  const facts: Record<string, JsonValue> = { model, mime };
  if (safeNumber(evidence.latencyMs) !== null) facts.latencyMs = safeNumber(evidence.latencyMs)!;
  const preprocess = safePreprocess(evidence.preprocess);
  if (preprocess) facts.preprocess = preprocess;
  return facts;
}

function safePreprocess(value: unknown): JsonValue | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const result: Record<string, JsonValue> = {};
  for (const key of ["first_frame", "last_frame"] as const) {
    const facts = safeRefFacts(source[key]);
    if (facts) result[key] = facts;
  }
  if (Array.isArray(source.input_references)) {
    result.input_references = source.input_references
      .map(safeRefFacts)
      .filter((item): item is Record<string, JsonValue> => item !== null);
  }
  return Object.keys(result).length > 0 ? result : null;
}

function safeRefFacts(value: unknown): Record<string, JsonValue> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const facts: Record<string, JsonValue> = {};
  for (const key of ["c2pa_stripped", "resized"] as const) {
    if (typeof source[key] === "boolean") facts[key] = source[key];
  }
  for (const key of ["src_bytes", "out_bytes"] as const) {
    const number = safeNumber(source[key]);
    if (number !== null) facts[key] = number;
  }
  for (const key of ["src_dimensions", "out_dimensions"] as const) {
    const dimensions = safeDimensions(source[key]);
    if (dimensions) facts[key] = dimensions;
  }
  if (typeof source.out_mime === "string" && /^image\/[a-z0-9.+-]{1,40}$/i.test(source.out_mime)) {
    facts.out_mime = source.out_mime;
  }
  return Object.keys(facts).length > 0 ? facts : null;
}

function safeDimensions(value: unknown): Record<string, JsonValue> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const width = safeNumber(source.width);
  const height = safeNumber(source.height);
  return width !== null && height !== null ? { width, height } : null;
}

function safeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

export function mimeForOutput(filename: string): string {
  const extension = path.extname(filename).toLowerCase();
  const mime = new Map([
    [".png", "image/png"], [".jpg", "image/jpeg"], [".jpeg", "image/jpeg"],
    [".webp", "image/webp"], [".mp4", "video/mp4"], [".mov", "video/quicktime"],
    [".webm", "video/webm"], [".mp3", "audio/mpeg"], [".wav", "audio/wav"],
    [".m4a", "audio/mp4"], [".aac", "audio/aac"], [".json", "application/json"],
    [".srt", "application/x-subrip"], [".txt", "text/plain"],
  ]).get(extension);
  if (!mime) throw new Error(`unsupported Artifact output extension: ${extension || "<none>"}`);
  return mime;
}
