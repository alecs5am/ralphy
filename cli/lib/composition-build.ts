import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { DomainError } from "./errors/domain.js";
import { ralphDir } from "./paths.js";
import { buildTimelineFromInputs, renderTimeline } from "./composer.js";
import { lintHyperframesHtml } from "./render/hyperframes-lint.js";
import { runHyperframesRender } from "./render/hyperframes.js";
import { completeArtifactRunSet, projectRunFailure } from "./store/runs.js";
import { getObjectRow, prepareObject, resolveObjectPath, type PreparedObject } from "./store/internal-objects.js";
import { openDomainDb } from "./store/db.js";
import { newDomainId } from "./store/ids.js";
import {
  failCompositionBuildRun,
  getComposition,
  listBuildOutputs,
  listBuilds,
  listCompositionInputs,
  listCompositionRevisions,
  listCompositionSources,
  listCompositions,
  snapshotAndStartCompositionBuild,
  reviseComposition,
  validateBuildProfile,
} from "./store/compositions.js";
import { StoreConflictError, type ArtifactKind, type JsonValue } from "./store/types.js";
import type { QueryContext } from "./store/scope-context.js";
import {
  openDirectoryAt,
  createExclusiveRegularFileAt,
  openExistingDirectoryAt,
  openRegularFileAt,
  openRootDirectory,
  copyRegularFileAt,
  copyRegularFileDescriptors,
  readDirectoryAt,
  removeDirectoryContents,
  unlinkAt,
} from "./store/posix-directory.js";

type RevisionRow = {
  id: string; compositionId: string; projectId: string; workspaceId: string;
  slug: string; kind: string; state: "draft" | "sealed"; engine: string;
  engineConfigJson: string; latestRevisionId: string;
};
type SourceRow = { logicalPath: string; objectId: string; position: number };
type InputRow = {
  artifactRevisionId: string; role: string; position: number; config: JsonValue | null;
  objectId: string; objectPath: string;
  materializedFd?: number;
};
type OutputSpec = {
  source?: string; inputPosition?: number; slug: string; kind: ArtifactKind;
  mime: string; role?: string | null;
};
type EngineFixtureOutput = OutputSpec & { bytes: string | Buffer; filename: string };
type CompositionBuildTestHooks = {
  afterCheckoutEnumerated?: () => void;
  beforeSnapshotCommit?: () => void;
  beforeSnapshotTransactionCommit?: () => void;
  beforeBuildStartTransactionCommit?: () => void;
  beforeBuildCompletionCommit?: () => void;
  beforeBuildRevisionReload?: () => void;
  beforeEngineLaunch?: (facts: { sourcePath: string; outputPath: string }) => void;
  materializeEnginePhase?: (phase: "directories" | "sources" | "inputs" | "output" | "chmod") => void;
  runEngine?: (facts: unknown) => Promise<EngineFixtureOutput[]>;
};

export async function reviseCompositionCheckout(input: {
  compositionId: string;
  expectedLatestRevisionId: string | null;
  engine: string;
  engineVersion?: string | null;
  engineConfig?: JsonValue;
  authoredBySessionId?: string | null;
  /** @internal Filesystem race fixture. */
  testHooks?: {
    afterCheckoutOpened?: (checkoutPath: string) => void;
    afterCheckoutEntryCopied?: (facts: { checkoutPath: string; revisionId: string; logicalPath: string }) => void;
    beforeRevisionCommit?: (facts: { checkoutPath: string; revisionId: string }) => void;
  };
}) {
  const revisionId = newDomainId("crev");
  const checkoutPath = checkoutFor(revisionId);
  const descriptors: number[] = [];
  let tmp: number | null = null;
  let revisionDirectory: number | null = null;
  let committed = false;
  try {
    const root = openRootDirectory(fsSync.realpathSync(ralphDir())); descriptors.push(root);
    const openedTmp = openDirectoryAt(root, "tmp", 0o700); tmp = openedTmp.fd; descriptors.push(tmp);
    const openedRevision = openDirectoryAt(tmp, revisionId, 0o700); revisionDirectory = openedRevision.fd; descriptors.push(revisionDirectory);
    const checkout = openDirectoryAt(revisionDirectory, "checkout", 0o700); descriptors.push(checkout.fd);
    input.testHooks?.afterCheckoutOpened?.(checkoutPath);
    const parentSources = input.expectedLatestRevisionId === null ? [] : revisionSources(input.expectedLatestRevisionId);
    const parentInputs = input.expectedLatestRevisionId === null ? [] : revisionInputs(input.expectedLatestRevisionId);
    for (const source of parentSources) {
      const object = getObjectRow(openDomainDb(), source.objectId);
      if (!object) throw new Error(`Object not found: ${source.objectId}`);
      const parts = source.logicalPath.split("/");
      const name = parts.pop()!;
      let parent = checkout.fd;
      for (const part of parts) {
        const child = openDirectoryAt(parent, part, 0o700); descriptors.push(child.fd); parent = child.fd;
      }
      copyObjectToDirectory(object, parent, name);
      input.testHooks?.afterCheckoutEntryCopied?.({ checkoutPath, revisionId, logicalPath: source.logicalPath });
    }
    input.testHooks?.beforeRevisionCommit?.({ checkoutPath, revisionId });
    assertSameDirectory(checkoutPath, checkout.fd);
    const revision = reviseComposition({
      ...input,
      preallocatedRevisionId: revisionId,
      ...(input.expectedLatestRevisionId === null ? {} : {
        expectedParentSnapshot: {
          sources: parentSources.map(({ logicalPath, objectId, position }) => ({ logicalPath, objectId, position })),
          inputs: parentInputs.map(({ artifactRevisionId, role, position, config }) => ({ artifactRevisionId, role, position, config })),
        },
      }),
    });
    committed = true;
    return { ...revision, checkoutPath };
  } finally {
    if (!committed && revisionDirectory !== null && tmp !== null) {
      try { removeDirectoryContents(revisionDirectory); } catch { /* best-effort orphan cleanup */ }
      try { unlinkAt(tmp, revisionId, true, true); } catch { /* best-effort orphan cleanup */ }
    }
    closeDescriptors(descriptors);
  }
}

export async function runCompositionBuild(input: {
  compositionId: string;
  revisionId: string;
  profile?: JsonValue;
  authoredBySessionId?: string | null;
  /** @internal Fault and renderer fixtures. */
  testHooks?: CompositionBuildTestHooks;
}) {
  const profile = validateBuildProfile(input.profile ?? {});
  let revision = buildRevision(input.compositionId, input.revisionId);
  if (revision.latestRevisionId !== revision.id) {
    throw new StoreConflictError("Composition latest revision conflict");
  }
  if (revision.state !== "draft") {
    throw new StoreConflictError("Composition build requires the latest draft revision");
  }
  if (!["hyperframes", "html", "ffmpeg", "manual"].includes(revision.engine)) {
    throw new DomainError("E_INPUT_INVALID", undefined, { field: "engine", detail: `unsupported engine: ${revision.engine}` });
  }
  validateEngineRequest(revision, input.testHooks);

  const started = await snapshotCheckout(revision, profile, input.authoredBySessionId, input.testHooks);
  const { run, attempt, build } = started;
  try {
    input.testHooks?.beforeBuildRevisionReload?.();
    revision = buildRevision(input.compositionId, input.revisionId);
    const sources = revisionSources(revision.id);
    const inputs = revisionInputs(revision.id);
    const engine = await runEngine(revision, sources, inputs, run.id, profile, input.testHooks);
    try {
      const produced = engine.outputs;
      engine.verify();
      const completed = await completeArtifactRunSet({
        runId: run.id,
        attemptId: attempt.id,
        outputs: produced.map((output) => ({
          finishedPath: output.path,
          originalName: path.basename(output.path),
          mime: output.spec.mime,
          artifact: {
            slug: output.spec.slug,
            kind: output.spec.kind,
            state: "candidate",
            metadata: { compositionRevisionId: revision.id, role: output.spec.role ?? null },
          },
          authoredBySessionId: input.authoredBySessionId,
        })),
        provider: revision.engine,
        model: revision.engine,
        response: { outputCount: produced.length },
        costUsd: 0,
        compositionBuild: {
          buildId: build.id,
          roles: produced.map((output) => output.spec.role ?? null),
        },
        testHooks: { beforeTransactionCommit: input.testHooks?.beforeBuildCompletionCommit },
      });
      return {
        id: build.id,
        compositionRevisionId: revision.id,
        runId: run.id,
        state: "succeeded" as const,
        createdAt: build.createdAt,
        finishedAt: completed.run.endedAt,
        outputs: completed.outputs.map((output, position) => ({
          artifactRevisionId: output.revision.id,
          objectId: output.revision.objectId,
          role: produced[position]!.spec.role ?? null,
          position,
        })),
      };
    } finally {
      engine.close();
    }
  } catch (error) {
    const projected = projectRunFailure(error, { provider: revision.engine });
    try { failCompositionBuildRun({ buildId: build.id, attemptId: attempt.id, error: projected }); } catch { /* completion may already have terminalized all rows */ }
    throw projected;
  }
}

export function getCompositionHistory(context: QueryContext, compositionId: string) {
  const composition = getComposition({ context, compositionId });
  const revisions = listCompositionRevisions({ context, compositionId, limit: 100 }).items.map((revision) => ({
    ...revision,
    sources: listCompositionSources({ context, revisionId: revision.id, limit: 100 }).items,
    inputs: listCompositionInputs({ context, revisionId: revision.id, limit: 100 }).items,
    builds: listBuilds({ context, compositionRevisionId: revision.id, limit: 100 }).items.map((build) => ({
      ...build,
      outputs: listBuildOutputs({ context, buildId: build.id, limit: 100 }).items,
    })),
  }));
  return { ...composition, revisions };
}

export function videoCompositionForProject(context: QueryContext, projectId: string) {
  const composition = listCompositions({ context, projectId, limit: 100 }).items
    .find((item) => item.kind === "video");
  if (!composition) throw new Error(`Video Composition not found for Project: ${projectId}`);
  return composition;
}

async function snapshotCheckout(
  revision: RevisionRow,
  profile: JsonValue,
  authoredBySessionId?: string | null,
  hooks?: CompositionBuildTestHooks,
) {
  const checkout = pinnedCheckoutFiles(revision.id, hooks);
  const files = checkout.files;
  const inputs = revisionInputs(revision.id);
  if (files.length === 0 && inputs.length === 0) {
    throw new Error("Composition checkout and inputs are empty");
  }
  const prepared: Array<{ logicalPath: string; prepared: PreparedObject; position: number }> = [];
  try {
    for (const [position, file] of files.entries()) {
      prepared.push({
        logicalPath: file.logicalPath,
        prepared: await preparePinnedBytes(revision, file),
        position,
      });
    }
    hooks?.beforeSnapshotCommit?.();
    return snapshotAndStartCompositionBuild({
      revisionId: revision.id,
      expectedLatestRevisionId: revision.id,
      sources: prepared,
      expectedInputs: inputs.map(({ position, artifactRevisionId, role, config }) => ({ position, artifactRevisionId, role, config })),
      profile,
      authoredBySessionId,
      testHooks: { beforeCommit: () => {
        hooks?.beforeSnapshotTransactionCommit?.();
        hooks?.beforeBuildStartTransactionCommit?.();
      } },
    });
  } catch (error) {
    await Promise.allSettled(prepared.map((source) => fs.rm(source.prepared.finalPath, { force: true })));
    throw error;
  } finally {
    checkout.close();
  }
}

async function runEngine(
  revision: RevisionRow,
  sources: SourceRow[],
  inputs: InputRow[],
  runId: string,
  profile: JsonValue,
  hooks?: CompositionBuildTestHooks,
) {
  const materialized = materializeEngineTree(runId, sources, inputs, hooks);
  const sourceDir = materialized.sourcePath;
  inputs = materialized.inputs;
  const config = JSON.parse(revision.engineConfigJson) as Record<string, unknown>;
  try {
    if (hooks?.runEngine) {
      const output = materialized.createRunOutput("fixture-0.bin");
      hooks.beforeEngineLaunch?.({ sourcePath: sourceDir, outputPath: output.path });
      const fixture = await hooks.runEngine({
        engine: revision.engine,
        engineConfig: config,
        profile,
        inputs: inputs.map(({ artifactRevisionId, role, position, config, objectPath }) => ({ artifactRevisionId, role, position, config, path: objectPath })),
      });
      if (fixture.length !== 1) throw new Error("Engine fixture must return exactly one output");
      fsSync.writeFileSync(output.fd, fixture[0]!.bytes);
      fsSync.fsyncSync(output.fd);
      return { outputs: [{ path: output.path, spec: fixture[0]! }], close: materialized.close, verify: materialized.verify };
    }
    switch (revision.engine) {
      case "manual":
        return { outputs: await copyDeclaredOutputs(config.outputs, materialized, inputs), close: materialized.close, verify: materialized.verify };
      case "html":
        return { outputs: await copyDeclaredOutputs(config.outputs ?? [{ source: "index.html", slug: `${revision.slug}-html`, kind: "document", mime: "text/html", role: "master" }], materialized, inputs), close: materialized.close, verify: materialized.verify };
      case "hyperframes": {
        const lint = lintHyperframesHtml(readTextDescriptor(materialized.openSource("index.html"), 16 * 1024 * 1024));
        if (!lint.ok) throw new Error(`HyperFrames lint failed with ${lint.errors.length} error(s)`);
        const engineOutput = materialized.createSourceOutput(".ralphy-output");
        hooks?.beforeEngineLaunch?.({ sourcePath: sourceDir, outputPath: engineOutput.path });
        const fps = jsonNumber(profile, "fps") ?? jsonNumber(config, "fps");
        const quality = jsonString(profile, "quality") ?? jsonString(config, "quality");
        const result = await runHyperframesRender({
          projectDir: ".",
          projectFd: materialized.sourceFd,
          outputPath: ".ralphy-output",
          quiet: true,
          ...(fps !== null ? { fps } : {}),
          ...(quality === "draft" || quality === "standard" || quality === "high" ? { quality } : {}),
          ...(jsonString(profile, "format") ? { format: jsonString(profile, "format") as "mp4" | "webm" | "mov" | "png-sequence" } : {}),
          ...(jsonString(profile, "resolution") ? { resolution: jsonString(profile, "resolution")! } : {}),
          ...(jsonString(profile, "workers") ? { workers: jsonString(profile, "workers")! } : {}),
          variables: { ...plainRecord(config.variables), compositionInputs: inputs.map((item) => ({ path: item.objectPath, role: item.role, position: item.position, config: item.config })) },
        });
        if (result.exitCode !== 0) throw new Error(`HyperFrames render failed (exit ${result.exitCode})`);
        const output = materialized.createRunOutput("master.mp4");
        copyRegularFileDescriptors(materialized.openSource(".ralphy-output"), output.fd);
        return { outputs: [{ path: output.path, spec: { slug: `${revision.slug}-master`, kind: "video" as const, mime: "video/mp4", role: "master" } }], close: materialized.close, verify: materialized.verify };
      }
      case "ffmpeg": {
        const engineOutput = materialized.createSourceOutput(".ralphy-output");
        hooks?.beforeEngineLaunch?.({ sourcePath: sourceDir, outputPath: engineOutput.path });
        const timeline = await buildTimelineFromInputs(
          inputs.map((item) => ({ path: item.objectPath, role: item.role, config: item.config, fd: item.materializedFd })),
          { directoryFd: materialized.sourceFd },
        );
        await renderTimeline(timeline, ".ralphy-output", { directoryFd: materialized.sourceFd });
        const output = materialized.createRunOutput("master.mp4");
        copyRegularFileDescriptors(materialized.openSource(".ralphy-output"), output.fd);
        return { outputs: [{ path: output.path, spec: { slug: `${revision.slug}-master`, kind: "video" as const, mime: "video/mp4", role: "master" } }], close: materialized.close, verify: materialized.verify };
      }
    }
    throw new DomainError("E_INPUT_INVALID", undefined, { field: "engine" });
  } catch (error) {
    materialized.close();
    throw error;
  }
}

async function copyDeclaredOutputs(
  value: unknown,
  materialized: ReturnType<typeof materializeEngineTree>,
  inputs: InputRow[],
) {
  if (!Array.isArray(value) || value.length === 0) throw new Error("Manual engine requires configured outputs");
  const results: Array<{ path: string; spec: OutputSpec }> = [];
  for (const [position, raw] of value.entries()) {
    const spec = outputSpec(raw);
    const source = spec.inputPosition === undefined
      ? materialized.openSource(spec.source ?? "")
      : inputs.find((item) => item.position === spec.inputPosition)?.materializedFd;
    if (source === undefined) throw new Error(`Manual output input position not found: ${spec.inputPosition}`);
    const extension = path.extname(spec.source ?? "") || extensionForMime(spec.mime);
    const output = materialized.createRunOutput(`output-${position}${extension}`);
    copyRegularFileDescriptors(source, output.fd);
    results.push({ path: output.path, spec });
  }
  return results;
}

function outputSpec(value: unknown): OutputSpec {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid manual output");
  const row = value as Record<string, unknown>;
  if (typeof row.slug !== "string" || typeof row.kind !== "string" || typeof row.mime !== "string") {
    throw new Error("Manual output requires slug, kind, and mime");
  }
  if (typeof row.source !== "string" && !Number.isSafeInteger(row.inputPosition)) {
    throw new Error("Manual output requires source or inputPosition");
  }
  return {
    source: typeof row.source === "string" ? safeRelative(row.source) : undefined,
    inputPosition: typeof row.inputPosition === "number" ? row.inputPosition : undefined,
    slug: row.slug,
    kind: row.kind as ArtifactKind,
    mime: row.mime,
    role: typeof row.role === "string" ? row.role : null,
  };
}

function buildRevision(compositionId: string, revisionId: string): RevisionRow {
  const row = openDomainDb().query<RevisionRow, [string, string]>(
    `SELECT revision.id, revision.composition_id AS compositionId,
            composition.project_id AS projectId, project.workspace_id AS workspaceId,
            composition.slug, composition.kind, revision.state, revision.engine,
            revision.engine_config_json AS engineConfigJson,
            (SELECT latest.id FROM composition_revisions latest
             WHERE latest.composition_id = composition.id
             ORDER BY latest.revision_no DESC, latest.id DESC LIMIT 1) AS latestRevisionId
     FROM composition_revisions revision
     JOIN compositions composition ON composition.id = revision.composition_id
     JOIN projects project ON project.id = composition.project_id
     WHERE composition.id = ? AND revision.id = ?`,
  ).get(compositionId, revisionId);
  if (!row) throw new Error(`Composition Revision not found: ${revisionId}`);
  return row;
}

function revisionSources(revisionId: string): SourceRow[] {
  return openDomainDb().query<SourceRow, [string]>(
    `SELECT logical_path AS logicalPath, object_id AS objectId, position
     FROM composition_revision_files WHERE composition_revision_id = ?
     ORDER BY position, logical_path, id`,
  ).all(revisionId);
}

function revisionInputs(revisionId: string): InputRow[] {
  const rows = openDomainDb().query<Omit<InputRow, "objectPath">, [string]>(
    `SELECT input.artifact_revision_id AS artifactRevisionId, input.role, input.position,
            json(input.config_json) AS config, revision.object_id AS objectId
     FROM composition_inputs input
     JOIN artifact_revisions revision ON revision.id = input.artifact_revision_id
     WHERE input.composition_revision_id = ? ORDER BY input.position, input.id`,
  ).all(revisionId);
  return rows.map((row) => {
    const object = getObjectRow(openDomainDb(), row.objectId);
    if (!object) throw new Error(`Object not found: ${row.objectId}`);
    return { ...row, config: typeof row.config === "string" ? JSON.parse(row.config) : row.config, objectPath: resolveObjectPath(object) };
  });
}

function pinnedCheckoutFiles(revisionId: string, hooks?: CompositionBuildTestHooks) {
  const descriptors: number[] = [];
  try {
    const root = openRootDirectory(ralphDir()); descriptors.push(root);
    const tmp = openExistingDirectoryAt(root, "tmp");
    if (tmp === null) throw new Error("Composition checkout tmp directory is missing");
    descriptors.push(tmp);
    const revision = openExistingDirectoryAt(tmp, revisionId);
    if (revision === null) throw new Error("Composition checkout revision directory is missing");
    descriptors.push(revision);
    const checkout = openExistingDirectoryAt(revision, "checkout");
    if (checkout === null) throw new Error("Composition checkout is missing");
    descriptors.push(checkout);
    const enumerated = enumeratePinned(checkout, "", descriptors);
    hooks?.afterCheckoutEnumerated?.();
    const files = enumerated.map((entry) => {
      const parent = openPinnedPath(checkout, entry.parents, descriptors);
      const fd = openRegularFileAt(parent, entry.name);
      if (fd === null) throw new StoreConflictError("Composition checkout entry changed while snapshotting");
      descriptors.push(fd);
      const stat = fsSync.fstatSync(fd);
      if (!stat.isFile() || stat.nlink !== 1 || stat.size <= 0) {
        throw new Error("Composition checkout entries must be nonempty unlinked regular files");
      }
      return { logicalPath: entry.logicalPath, fd };
    }).sort((a, b) => a.logicalPath.localeCompare(b.logicalPath));
    return { files, close: () => closeDescriptors(descriptors) };
  } catch (error) {
    closeDescriptors(descriptors);
    throw error;
  }
}

function enumeratePinned(directory: number, prefix: string, descriptors: number[]): Array<{ logicalPath: string; parents: string[]; name: string }> {
  const result: Array<{ logicalPath: string; parents: string[]; name: string }> = [];
  for (const name of readDirectoryAt(directory).sort()) {
    const logicalPath = safeRelative(prefix ? `${prefix}/${name}` : name);
    const child = openExistingDirectoryAt(directory, name);
    if (child !== null) {
      descriptors.push(child);
      result.push(...enumeratePinned(child, logicalPath, descriptors));
    } else {
      result.push({ logicalPath, parents: prefix ? prefix.split("/") : [], name });
    }
  }
  return result;
}

function openPinnedPath(root: number, components: string[], descriptors: number[]): number {
  let current = root;
  for (const component of components) {
    const next = openExistingDirectoryAt(current, component);
    if (next === null) throw new StoreConflictError("Composition checkout ancestor changed while snapshotting");
    descriptors.push(next);
    current = next;
  }
  return current;
}

async function preparePinnedBytes(revision: RevisionRow, file: { logicalPath: string; fd: number }) {
  const privateDir = await fs.mkdtemp(path.join(os.tmpdir(), "ralphy-composition-source-"));
  const sourcePath = path.join(privateDir, "source");
  try {
    const destination = fsSync.openSync(sourcePath, fsSync.constants.O_WRONLY | fsSync.constants.O_CREAT | fsSync.constants.O_EXCL, 0o600);
    try { copyRegularFileDescriptors(file.fd, destination); } finally { fsSync.closeSync(destination); }
    return await prepareObject({
      scope: { workspaceId: revision.workspaceId, projectId: revision.projectId },
      sourcePath,
      originalName: path.basename(file.logicalPath),
      mime: mimeFor(file.logicalPath),
      storageClass: "durable",
      transfer: "copy",
    });
  } finally {
    await fs.rm(privateDir, { recursive: true, force: true });
  }
}

function copyObjectToDirectory(object: NonNullable<ReturnType<typeof getObjectRow>>, directory: number, name: string) {
  const source = fsSync.openSync(resolveObjectPath(object), fsSync.constants.O_RDONLY | fsSync.constants.O_NOFOLLOW);
  try { copyRegularFileAt(source, directory, name, 0o600); } finally { fsSync.closeSync(source); }
}

function assertSameDirectory(directoryPath: string, expected: number) {
  let current: number | null = null;
  try {
    current = openRootDirectory(directoryPath);
    const before = fsSync.fstatSync(expected);
    const after = fsSync.fstatSync(current);
    if (before.dev !== after.dev || before.ino !== after.ino) throw new StoreConflictError("Composition checkout root changed during materialization");
  } catch (error) {
    if (error instanceof StoreConflictError) throw error;
    throw new StoreConflictError("Composition checkout root changed during materialization");
  } finally {
    if (current !== null) fsSync.closeSync(current);
  }
}

function closeDescriptors(descriptors: number[]) {
  for (const descriptor of descriptors.splice(0).reverse()) {
    try { fsSync.closeSync(descriptor); } catch { /* already closed */ }
  }
}

function materializeEngineTree(runId: string, sources: SourceRow[], inputs: InputRow[], hooks?: CompositionBuildTestHooks) {
  const descriptors: number[] = [];
  const immutableDescriptors: number[] = [];
  const outputs: Array<{ path: string; fd: number; dev: number; ino: number }> = [];
  const close = () => {
    for (const descriptor of new Set(immutableDescriptors)) {
      try { fsSync.fchmodSync(descriptor, fsSync.fstatSync(descriptor).isDirectory() ? 0o700 : 0o600); } catch { /* closed */ }
    }
    closeDescriptors(descriptors);
  };
  try {
    const rootPath = fsSync.realpathSync(ralphDir());
    const root = openRootDirectory(rootPath); descriptors.push(root);
    const tmp = openDirectoryAt(root, "tmp", 0o700); descriptors.push(tmp.fd);
    const run = openDirectoryAt(tmp.fd, runId, 0o700); descriptors.push(run.fd);
    const source = openDirectoryAt(run.fd, "source", 0o700); descriptors.push(source.fd); immutableDescriptors.push(source.fd);
    hooks?.materializeEnginePhase?.("directories");
  for (const item of sources) {
    const object = getObjectRow(openDomainDb(), item.objectId);
    if (!object) throw new Error(`Object not found: ${item.objectId}`);
    const parts = item.logicalPath.split("/");
    const name = parts.pop()!;
    let parent = source.fd;
    for (const part of parts) {
      const child = openDirectoryAt(parent, part, 0o700); descriptors.push(child.fd); immutableDescriptors.push(child.fd); parent = child.fd;
    }
    copyObjectToDirectory(object, parent, name);
    const sourceFd = openRegularFileAt(parent, name);
    if (sourceFd === null) throw new StoreConflictError("Materialized source disappeared");
    descriptors.push(sourceFd); immutableDescriptors.push(sourceFd);
  }
  hooks?.materializeEnginePhase?.("sources");
  const inputRoot = openDirectoryAt(source.fd, ".ralphy-inputs", 0o700); descriptors.push(inputRoot.fd); immutableDescriptors.push(inputRoot.fd);
  const materializedInputs = inputs.map((item) => {
    const directoryName = `${String(item.position).padStart(4, "0")}-${safeComponent(item.role)}`;
    const directory = openDirectoryAt(inputRoot.fd, directoryName, 0o700);
    descriptors.push(directory.fd); immutableDescriptors.push(directory.fd);
    const extension = path.extname(item.objectPath) || ".bin";
    const filename = `input${extension}`;
    const object = getObjectRow(openDomainDb(), item.objectId);
    if (!object) throw new Error(`Object not found: ${item.objectId}`);
    copyObjectToDirectory(object, directory.fd, filename);
    const inputFd = openRegularFileAt(directory.fd, filename);
    if (inputFd === null) throw new StoreConflictError("Materialized input disappeared");
    descriptors.push(inputFd); immutableDescriptors.push(inputFd);
    return { ...item, objectPath: `./.ralphy-inputs/${directoryName}/${filename}`, materializedFd: inputFd };
  });
  hooks?.materializeEnginePhase?.("inputs");
  const createOutput = (directory: number, directoryPath: string, name: string) => {
    const fd = createExclusiveRegularFileAt(directory, name, 0o600);
    if (fd === null) throw new StoreConflictError("Engine output already exists");
    descriptors.push(fd);
    const stat = fsSync.fstatSync(fd);
    const result = { path: path.join(directoryPath, name), fd, dev: stat.dev, ino: stat.ino };
    outputs.push(result);
    return result;
  };
  const openSource = (logicalPath: string) => {
    const parts = safeRelative(logicalPath).split("/");
    const name = parts.pop()!;
    const parent = openPinnedPath(source.fd, parts, descriptors);
    const fd = openRegularFileAt(parent, name);
    if (fd === null) throw new StoreConflictError("Materialized source disappeared");
    descriptors.push(fd);
    return fd;
  };
  const engineOutput = createOutput(source.fd, path.join(rootPath, "tmp", runId, "source"), ".ralphy-output");
  hooks?.materializeEnginePhase?.("output");
  for (const descriptor of new Set(immutableDescriptors)) {
    fsSync.fchmodSync(descriptor, fsSync.fstatSync(descriptor).isDirectory() ? 0o500 : 0o400);
  }
  hooks?.materializeEnginePhase?.("chmod");
  return {
    runPath: path.join(rootPath, "tmp", runId),
    sourcePath: path.join(rootPath, "tmp", runId, "source"),
    sourceFd: source.fd,
    inputs: materializedInputs,
    openSource,
    createRunOutput: (name: string) => createOutput(run.fd, path.join(rootPath, "tmp", runId), name),
    createSourceOutput: (name: string) => {
      if (name !== ".ralphy-output") throw new Error("Engine source output name is reserved");
      return engineOutput;
    },
    verify: () => outputs.forEach((output) => {
      const current = fsSync.openSync(output.path, fsSync.constants.O_RDONLY | fsSync.constants.O_NOFOLLOW);
      try {
        const stat = fsSync.fstatSync(current);
        if (stat.dev !== output.dev || stat.ino !== output.ino) throw new StoreConflictError("Engine output path changed during execution");
      } finally { fsSync.closeSync(current); }
    }),
    close,
  };
  } catch (error) {
    close();
    throw error;
  }
}

function validateEngineRequest(revision: RevisionRow, hooks?: CompositionBuildTestHooks): void {
  const config = JSON.parse(revision.engineConfigJson) as Record<string, unknown>;
  if (revision.engine === "manual") {
    if (!hooks?.runEngine && (!Array.isArray(config.outputs) || config.outputs.length === 0)) {
      throw new DomainError("E_INPUT_INVALID", undefined, { field: "engineConfig", detail: "manual outputs are required" });
    }
    if (Array.isArray(config.outputs)) config.outputs.forEach(outputSpec);
  }
}

function safeComponent(value: string) { return value.replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 80) || "input"; }
function jsonNumber(value: JsonValue | Record<string, unknown>, key: string) {
  const item = (value as Record<string, unknown>)[key];
  return typeof item === "number" && Number.isFinite(item) ? item : null;
}
function jsonString(value: JsonValue | Record<string, unknown>, key: string) {
  const item = (value as Record<string, unknown>)[key];
  return typeof item === "string" ? item : null;
}
function plainRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function readTextDescriptor(descriptor: number, maximumBytes: number) {
  const stat = fsSync.fstatSync(descriptor);
  if (!stat.isFile() || stat.size > maximumBytes) throw new Error("HyperFrames composition source is too large");
  const chunks: Buffer[] = [];
  const chunk = Buffer.allocUnsafe(64 * 1024);
  for (;;) {
    const count = fsSync.readSync(descriptor, chunk, 0, chunk.length, null);
    if (count === 0) break;
    chunks.push(Buffer.from(chunk.subarray(0, count)));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function checkoutFor(revisionId: string) { return path.join(ralphDir(), "tmp", revisionId, "checkout"); }
function safeRelative(value: string) {
  if (!value || value.includes("\\") || path.posix.isAbsolute(value) || value.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error("Composition path must be a safe relative POSIX path");
  }
  return value;
}
function mimeFor(filename: string) {
  return ({ ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".txt": "text/plain", ".mp4": "video/mp4", ".mp3": "audio/mpeg", ".wav": "audio/wav", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg" } as Record<string, string>)[path.extname(filename).toLowerCase()] ?? "application/octet-stream";
}
function extensionForMime(mime: string) {
  return ({ "text/html": ".html", "text/plain": ".txt", "video/mp4": ".mp4", "audio/mpeg": ".mp3", "application/json": ".json" } as Record<string, string>)[mime] ?? ".bin";
}
