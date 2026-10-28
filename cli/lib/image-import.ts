// Register a host-generated image as an Artifact revision (#572).
//
// Agent hosts ship their own image tools (the Codex image tool, the Claude
// host image tool). Before this module those images bypassed the domain
// generation evidence (Run + Attempt), the cost rollup, and append-only
// revisions, and were then registered by hand with `project log-asset`.
// `ralphy generate image --import <file>` routes them through the same Run
// shape a provider generation writes, in one call:
//
//   - Run kind `generate.image`, metadata `{ operation: "import", source }`.
//   - Run Attempt with `provider = <source>`, the host model name when known,
//     the prompt as the generation input, and `cost_usd = 0` (no provider call).
//   - A NEW Artifact revision in the slot. Earlier revisions are immutable, so
//     a re-import never overwrites (AGENTS.md invariant #14).
//
// The source file is COPIED into the Run temp directory and the copy becomes
// the durable Object; the caller's file is never moved or modified. No source
// locator is persisted in domain state.

import fs from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";
import { ralphDir } from "./paths.js";
import { generationInput } from "./generation-input.js";
import { generationRunScope } from "./generation-scope.js";
import type { GenerationDestination } from "./generation-destination.js";
import {
  completeArtifactRun,
  finishRun,
  finishRunAttempt,
  projectRunFailure,
  startRun,
  startRunAttempt,
  type CompleteArtifactRunResult,
} from "./store/runs.js";

/** Where an imported image came from. Recorded as the Attempt provider. */
export const IMAGE_IMPORT_SOURCES = ["host-native", "user", "other"] as const;
export type ImageImportSource = (typeof IMAGE_IMPORT_SOURCES)[number];

export function isImageImportSource(value: unknown): value is ImageImportSource {
  return typeof value === "string" && (IMAGE_IMPORT_SOURCES as readonly string[]).includes(value);
}

export type SniffedImage = { mime: "image/png" | "image/jpeg" | "image/webp"; extension: ".png" | ".jpg" | ".webp" };

/** Identify PNG / JPEG / WebP from magic bytes. Returns null for anything else. */
export function sniffImage(head: Uint8Array): SniffedImage | null {
  const at = (i: number) => head[i];
  if (
    head.length >= 8 &&
    at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47 &&
    at(4) === 0x0d && at(5) === 0x0a && at(6) === 0x1a && at(7) === 0x0a
  ) {
    return { mime: "image/png", extension: ".png" };
  }
  if (head.length >= 3 && at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) {
    return { mime: "image/jpeg", extension: ".jpg" };
  }
  if (
    head.length >= 12 &&
    at(0) === 0x52 && at(1) === 0x49 && at(2) === 0x46 && at(3) === 0x46 &&
    at(8) === 0x57 && at(9) === 0x45 && at(10) === 0x42 && at(11) === 0x50
  ) {
    return { mime: "image/webp", extension: ".webp" };
  }
  return null;
}

export type ImportImageProbe =
  | { ok: true; image: SniffedImage; bytes: number }
  | { ok: false; reason: string };

/** Check that `filePath` is a readable, non-empty PNG / JPEG / WebP file. Never throws. */
export async function probeImportImage(filePath: string): Promise<ImportImageProbe> {
  let stat;
  try {
    stat = await fs.stat(filePath);
  } catch {
    return { ok: false, reason: `file not found: ${filePath}` };
  }
  if (!stat.isFile()) return { ok: false, reason: `not a regular file: ${filePath}` };
  if (stat.size <= 0) return { ok: false, reason: `file is empty: ${filePath}` };
  let head: Uint8Array;
  try {
    const handle = await fs.open(filePath, "r");
    try {
      const buffer = Buffer.alloc(16);
      const { bytesRead } = await handle.read(buffer, 0, 16, 0);
      head = buffer.subarray(0, bytesRead);
    } finally {
      await handle.close();
    }
  } catch (error) {
    return { ok: false, reason: `cannot read ${filePath}: ${(error as Error).message}` };
  }
  const image = sniffImage(head);
  if (!image) {
    return { ok: false, reason: `${filePath} is not a PNG, JPEG or WebP image` };
  }
  return { ok: true, image, bytes: stat.size };
}

export type ImportImageInput = {
  destination: GenerationDestination;
  slot: string;
  sourcePath: string;
  image: SniffedImage;
  source: ImageImportSource;
  /** Host model name when known; null records "unknown" honestly. */
  model: string | null;
  /** The prompt the host tool was given, when known. */
  prompt: string | null;
};

/**
 * Copy `sourcePath` into a Run temp file and complete it as a new Artifact
 * revision with zero cost. Mirrors the provider path in `generate image`
 * (`executeGeneratedArtifact`) minus the provider call.
 */
export async function importImageArtifact(input: ImportImageInput): Promise<CompleteArtifactRunResult> {
  const provider = input.source;
  const run = startRun({
    ...generationRunScope(input.destination),
    kind: "generate.image",
    label: input.slot,
    metadata: { operation: "import", source: input.source },
  });
  const attempt = startRunAttempt({
    runId: run.id,
    provider,
    model: input.model,
    request: generationInput(
      input.prompt ? [{ role: "prompt", value: input.prompt }] : [],
      [],
    ),
  });
  const originalName = `${input.slot}${input.image.extension}`;
  const outputPath = path.join(ralphDir(), "tmp", run.id, originalName);
  try {
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    // COPYFILE_EXCL: the Run temp path is fresh; never clobber anything there.
    await fs.copyFile(input.sourcePath, outputPath, fsConstants.COPYFILE_EXCL);
  } catch (error) {
    const projected = projectRunFailure(error, { provider });
    finishRunAttempt(attempt.id, { state: "failed", error: projected });
    finishRun(run.id, { state: "failed", error: projected });
    throw projected;
  }
  const provenance = {
    operation: "import",
    source: input.source,
    ...(input.model ? { model: input.model } : {}),
  };
  return completeArtifactRun({
    runId: run.id,
    attemptId: attempt.id,
    finishedPath: outputPath,
    originalName,
    mime: input.image.mime,
    artifact: { slug: input.slot, kind: "image", state: "candidate", metadata: provenance },
    objectMetadata: { provider, ...provenance },
    response: { ...provenance, mime: input.image.mime },
    costUsd: 0,
  });
}
