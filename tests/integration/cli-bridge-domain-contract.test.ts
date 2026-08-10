import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { generationInput } from "../../cli/lib/generation-input.js";
import {
  addArtifactRevision,
  addArtifactUsage,
  createArtifact,
  selectArtifactRevision,
} from "../../cli/lib/store/artifacts.js";
import { createBridgeMethods, type BridgeMethodContext } from "../../cli/lib/bridge/methods.js";
import {
  bindCompositionInput,
  completeBuild,
  createComposition,
  putCompositionSource,
  reviseComposition,
  sealCompositionRevision,
  startBuild,
} from "../../cli/lib/store/compositions.js";
import { closeDomainDb, openDomainDb } from "../../cli/lib/store/db.js";
import { ingestObject } from "../../cli/lib/store/objects.js";
import {
  promoteRunObject,
  recordRunObject,
  finishRun,
  finishRunAttempt,
  recordRunResult,
  startRun,
  startRunAttempt,
} from "../../cli/lib/store/runs.js";
import { createProject, createWorkspace } from "../../cli/lib/store/scopes.js";
import { createUnit, reviseUnit } from "../../cli/lib/store/units.js";
import { makeTmpRoot, type TmpRoot } from "../helpers/tmp-root.js";

let root: TmpRoot;

afterEach(() => {
  closeDomainDb();
  root.cleanup();
});

function bridgeContext(): BridgeMethodContext {
  return {
    consumerSessions: new Set(),
    activitySubscriptions: new Map(),
    helloComplete: true,
    markHello() {},
    setAuthority() {},
  };
}

async function call(method: string, params: Record<string, unknown>) {
  const handler = createBridgeMethods({ dataRoot: path.join(root.dir, ".ralphy") }).get(method);
  if (!handler) throw new Error(`Missing bridge method: ${method}`);
  return handler.handle(params, bridgeContext()) as Promise<unknown> | unknown;
}

async function storedObject(
  workspaceId: string,
  projectId: string,
  name: string,
  storageClass: "durable" | "working" | "diagnostic" = "working",
) {
  const sourcePath = path.join(root.dir, name);
  fs.writeFileSync(sourcePath, `bytes:${name}`);
  return ingestObject({
    scope: { workspaceId, projectId },
    sourcePath,
    originalName: `private-${name}`,
    mime: "application/octet-stream",
    storageClass,
    metadata: { private: true },
  });
}

function nestedKeys(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(nestedKeys);
  if (value === null || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, item]) => [key, ...nestedKeys(item)]);
}

describe("Desktop bridge domain contract", () => {
  test("advertises and resolves a scoped Artifact revision", async () => {
    root = makeTmpRoot("ralphy-bridge-domain-reads");
    const workspace = createWorkspace({ slug: "desktop", name: "Desktop" });
    const project = createProject({ workspaceId: workspace.id, slug: "project", name: "Project" });
    const context = { workspaceId: workspace.id, projectId: project.id };
    const object = await storedObject(workspace.id, project.id, "source.bin");
    const artifact = createArtifact({ projectId: project.id, slug: "input", kind: "data" });
    const artifactRevision = addArtifactRevision({
      artifactId: artifact.id,
      objectId: object.id,
      state: "approved",
    });
    const hello = await call("system.hello", {}) as { capabilities: string[] };
    expect(hello.capabilities).toContain("media.revision.show");

    expect(await call("media.revision.show", { context, revisionId: artifactRevision.id }))
      .toMatchObject({ id: artifactRevision.id, objectId: object.id });
  });

  test("media.select returns the refreshed public card from a null selection", async () => {
    root = makeTmpRoot("ralphy-bridge-media-select-card");
    const workspace = createWorkspace({ slug: "selection", name: "Selection" });
    const project = createProject({ workspaceId: workspace.id, slug: "project", name: "Project" });
    const object = await storedObject(workspace.id, project.id, "selected.bin");
    const artifact = createArtifact({ projectId: project.id, slug: "hero", kind: "image" });
    const revision = addArtifactRevision({
      artifactId: artifact.id,
      objectId: object.id,
      state: "approved",
    });

    expect(await call("media.select", {
      context: { workspaceId: workspace.id, projectId: project.id },
      ref: { type: "artifact", id: artifact.id },
      revisionId: revision.id,
      expectedSelectedRevisionId: null,
    })).toEqual({
      ref: { type: "artifact", id: artifact.id },
      workspaceId: workspace.id,
      projectId: project.id,
      slug: "hero",
      kind: "image",
      selectedRevisionId: revision.id,
      selectedState: "approved",
      mime: "application/octet-stream",
      bytes: Buffer.byteLength("bytes:selected.bin"),
      selectedAt: revision.createdAt,
      revisionCount: 1,
      selectedObjectId: object.id,
      storageClass: "working",
      usageRoles: [],
      target: { type: "object", id: object.id },
    });
  });

  test("advertises bounded media generation details without widening media.list", async () => {
    root = makeTmpRoot("ralphy-bridge-media-generation");
    const workspace = createWorkspace({ slug: "generation", name: "Generation" });
    const project = createProject({ workspaceId: workspace.id, slug: "project", name: "Project" });
    const context = { workspaceId: workspace.id, projectId: project.id };
    const object = await storedObject(workspace.id, project.id, "generated.png", "durable");
    const artifact = createArtifact({
      projectId: project.id,
      slug: "hero",
      kind: "image",
      metadata: { note: "private", voiceId: "private", url: "private", externalId: "private", credential: "private" },
    });
    const revision = addArtifactRevision({
      artifactId: artifact.id,
      objectId: object.id,
      state: "candidate",
      metadata: { path: "private", bucket: "private", key: "private", sha: "private" },
    });
    const run = startRun({
      projectId: project.id,
      kind: "generate.image",
      metadata: { request: "private", response: "private", error: "private" },
    });
    recordRunResult(openDomainDb(), {
      runId: run.id,
      position: 0,
      entityType: "artifact_revision",
      entityId: revision.id,
    });
    const runObject = recordRunObject({
      runId: run.id,
      path: "tmp/private-generated.png",
      purpose: "result",
      state: "ready",
      retention: "keep",
      mime: "image/png",
      bytes: 123,
      sha256: "a".repeat(64),
      metadata: { logicalPath: "private", absolutePath: "private" },
    });
    const input = generationInput(
      [{ role: "prompt", value: "A safe prompt" }],
      [{ name: "aspectRatio", value: "9:16" }],
    );
    const attempt = startRunAttempt({
      runId: run.id,
      provider: "fixture",
      model: "fixture-image",
      request: input,
    });
    const finishedAttempt = finishRunAttempt(attempt.id, {
      state: "succeeded",
      response: { url: "private", externalId: "private" },
      costUsd: 0.75,
    });
    const finishedRun = finishRun(run.id, { state: "succeeded" });
    const expectedInput = {
      version: 1,
      texts: [{ role: "prompt", value: "A safe prompt", truncated: false }],
      parameters: [{ name: "aspectRatio", value: "9:16" }],
    };

    const hello = await call("system.hello", {}) as { capabilities: string[] };
    expect(hello.capabilities).toContain("media.generation.show");
    for (const target of [
      { type: "artifact-revision", id: revision.id },
      { type: "run-object", id: runObject.id },
    ] as const) {
      const detail = await call("media.generation.show", { context, target });
      expect(detail).toEqual({
        status: "generation",
        target,
        run: finishedRun,
        attempts: {
          items: [{ ...finishedAttempt, input: expectedInput }],
          nextCursor: null,
        },
        cost: { knownUsd: 0.75, complete: true },
      });
      const keys = new Set(nestedKeys(detail));
      for (const hidden of [
        "absolutePath", "logicalPath", "path", "bucket", "key", "sha", "sha256",
        "metadata", "request", "response", "error", "note", "voiceId", "url",
        "externalId", "credential",
      ]) expect(keys.has(hidden)).toBe(false);
    }

    const list = await call("media.list", { context, types: ["artifact"], limit: 20 });
    expect(JSON.stringify(list)).toBe(JSON.stringify({
      items: [{
        ref: { type: "artifact", id: artifact.id },
        workspaceId: workspace.id,
        projectId: project.id,
        slug: "hero",
        kind: "image",
        selectedRevisionId: null,
        selectedState: null,
        mime: null,
        bytes: null,
        selectedAt: null,
        revisionCount: 1,
        selectedObjectId: null,
        storageClass: null,
        usageRoles: [],
        target: null,
      }],
      nextCursor: null,
    }));

    const pagedRun = startRun({ projectId: project.id, kind: "generation" });
    const pagedRunObject = recordRunObject({
      runId: pagedRun.id,
      path: "tmp/paged.png",
      purpose: "result",
      state: "ready",
      retention: "keep",
    });
    for (let index = 0; index < 21; index += 1) {
      const pagedAttempt = startRunAttempt({ runId: pagedRun.id, request: input });
      finishRunAttempt(pagedAttempt.id, { state: index === 20 ? "succeeded" : "failed", costUsd: 0 });
      finishRun(pagedRun.id, { state: index === 20 ? "succeeded" : "failed" });
    }
    const defaultPage = await call("media.generation.show", {
      context,
      target: { type: "run-object", id: pagedRunObject.id },
    }) as { attempts: { items: unknown[]; nextCursor: string | null } };
    expect(defaultPage.attempts.items).toHaveLength(20);
    expect(defaultPage.attempts.nextCursor).not.toBeNull();
    const maxPage = await call("media.generation.show", {
      context,
      target: { type: "run-object", id: pagedRunObject.id },
      limit: 100,
    }) as { attempts: { items: unknown[]; nextCursor: string | null } };
    expect(maxPage.attempts.items).toHaveLength(21);
    expect(maxPage.attempts.nextCursor).toBeNull();

    const validTarget = { type: "artifact-revision", id: revision.id };
    for (const params of [
      [],
      { context },
      { context, target: [] },
      { context, target: {} },
      { context, target: { type: "artifact-revision" } },
      { context, target: { id: revision.id } },
      { context, target: { ...validTarget, extra: true } },
      { context, target: { type: "object", id: object.id } },
      { context, target: { type: "artifact", id: artifact.id } },
      { context, target: { type: "artifact-revision", id: "" } },
      { context, target: { type: "artifact-revision", id: "x".repeat(129) } },
      { context, target: validTarget, after: "not-a-cursor" },
      { context, target: validTarget, limit: 0 },
      { context, target: validTarget, limit: 101 },
      { context, target: validTarget, extra: true },
    ]) {
      await expect(call(
        "media.generation.show",
        params as Record<string, unknown>,
      )).rejects.toThrow();
    }
  });

  test("traverses nested scoped production reads without exposing stored internals", async () => {
    root = makeTmpRoot("ralphy-bridge-nested-domain-reads");
    const workspace = createWorkspace({ slug: "desktop", name: "Desktop" });
    const project = createProject({ workspaceId: workspace.id, slug: "project", name: "Project" });
    const context = { workspaceId: workspace.id, projectId: project.id };
    const object = await storedObject(workspace.id, project.id, "source.bin");
    const artifact = createArtifact({ projectId: project.id, slug: "input", kind: "data" });
    const artifactRevision = addArtifactRevision({
      artifactId: artifact.id,
      objectId: object.id,
      state: "approved",
    });
    const composition = createComposition({ projectId: project.id, slug: "composition", kind: "custom" });
    const draft = reviseComposition({
      compositionId: composition.id,
      expectedLatestRevisionId: null,
      engine: "manual",
      engineConfig: { privateProviderConfig: "stored-only" },
    });
    putCompositionSource({ revisionId: draft.id, logicalPath: "private/a.html", objectId: object.id, position: 0 });
    putCompositionSource({ revisionId: draft.id, logicalPath: "private/b.html", objectId: object.id, position: 1 });
    bindCompositionInput({ revisionId: draft.id, artifactRevisionId: artifactRevision.id, role: "primary", position: 0 });
    bindCompositionInput({ revisionId: draft.id, artifactRevisionId: artifactRevision.id, role: "secondary", position: 1 });
    const revision = sealCompositionRevision({ revisionId: draft.id });
    const run = startRun({ projectId: project.id, kind: "build" });
    const attemptRun = startRun({ projectId: project.id, kind: "generation" });
    const attempt = startRunAttempt({ runId: attemptRun.id, request: { secret: "stored-only" } });
    finishRunAttempt(attempt.id, { state: "failed", response: { secret: "stored-only" }, error: "stored-only" });
    finishRun(attemptRun.id, { state: "failed", error: "stored-only" });
    startRunAttempt({ runId: attemptRun.id, request: { secret: "stored-only" } });
    const build = startBuild({ compositionRevisionId: revision.id, runId: run.id, profile: { privateProviderConfig: "stored-only" } });
    completeBuild({
      buildId: build.id,
      outputs: [
        { artifactRevisionId: artifactRevision.id, position: 0 },
        { artifactRevisionId: artifactRevision.id, position: 1 },
      ],
    });
    startBuild({
      compositionRevisionId: revision.id,
      runId: startRun({ projectId: project.id, kind: "build" }).id,
      profile: { privateProviderConfig: "stored-only" },
    });
    const unit = createUnit({ projectId: project.id, slug: "unit", format: "post" });
    const unitRevision = reviseUnit({
      unitId: unit.id,
      expectedLatestRevisionId: null,
      metadata: { secret: "stored-only" },
      items: [
        { artifactRevisionId: artifactRevision.id, role: "primary", position: 0 },
        { artifactRevisionId: artifactRevision.id, role: "secondary", position: 1 },
      ],
      presentations: [{
        platform: "tiktok",
        captions: [{ state: "draft", text: "Draft" }, { state: "final", text: "Final" }],
        effectiveCaptionRevisionNo: 2,
        items: [{ unitItemPosition: 0, position: 0 }, { unitItemPosition: 1, position: 1 }],
      }, { platform: "instagram" }],
    });

    const hello = await call("system.hello", {}) as { capabilities: string[] };
    const methods = [
      "run.attempts",
      "composition.sources",
      "composition.inputs",
      "composition.builds",
      "build.show",
      "build.outputs",
      "unit.items",
      "unit.presentations",
      "presentation.items",
      "presentation.captions",
    ];
    for (const method of methods) expect(hello.capabilities).toContain(method);

    const sources = await call("composition.sources", { context, revisionId: revision.id, limit: 1 }) as { items: Array<{ id: string }>; nextCursor: string | null };
    const inputs = await call("composition.inputs", { context, revisionId: revision.id, limit: 1 }) as { items: Array<{ id: string }>; nextCursor: string | null };
    const builds = await call("composition.builds", { context, compositionRevisionId: revision.id, limit: 1 }) as { items: Array<{ id: string }>; nextCursor: string | null };
    const outputs = await call("build.outputs", { context, buildId: build.id, limit: 1 }) as { items: Array<{ id: string }>; nextCursor: string | null };
    const items = await call("unit.items", { context, revisionId: unitRevision.id, limit: 1 }) as { items: Array<{ id: string }>; nextCursor: string | null };
    const presentations = await call("unit.presentations", { context, revisionId: unitRevision.id, limit: 1 }) as { items: Array<{ id: string }>; nextCursor: string | null };
    const presentationId = presentations.items[0]!.id;
    const presentationItems = await call("presentation.items", { context, presentationId, limit: 1 }) as { items: Array<{ id: string }>; nextCursor: string | null };
    const captions = await call("presentation.captions", { context, presentationId, limit: 1 }) as { items: Array<{ id: string }>; nextCursor: string | null };
    const attempts = await call("run.attempts", { context, runId: attemptRun.id, limit: 1 }) as { items: Array<{ id: string }>; nextCursor: string | null };
    const shownBuild = await call("build.show", { context, buildId: build.id }) as { id: string };

    for (const page of [sources, inputs, builds, outputs, items, presentations, presentationItems, captions, attempts]) {
      expect(page.items).toHaveLength(1);
      expect(page.nextCursor).not.toBeNull();
    }
    expect(shownBuild.id).toBe(build.id);
    expect(attempts.items[0]!.id).toBe(attempt.id);
    expect(await call("composition.sources", { context, revisionId: revision.id, after: sources.nextCursor, limit: 1 })).toMatchObject({ items: [{ id: expect.any(String) }], nextCursor: null });
    await expect(call("build.show", { context: { workspaceId: createWorkspace({ slug: "other", name: "Other" }).id }, buildId: build.id })).rejects.toThrow(/not found|scope/i);

    const response = JSON.stringify({ sources, inputs, builds, outputs, items, presentations, presentationItems, captions, attempts, shownBuild });
    for (const hidden of [root.dir, "private/a.html", "privateProviderConfig", "stored-only", "secret"]) {
      expect(response).not.toContain(hidden);
    }
  });

  test("returns stable safe media targets, selected storage facts, and distinct usage roles", async () => {
    root = makeTmpRoot("ralphy-bridge-media-targets");
    const workspace = createWorkspace({ slug: "media", name: "Media" });
    const project = createProject({
      workspaceId: workspace.id,
      slug: "project",
      name: "Project",
      metadata: { purpose: "Review media", privatePlan: true },
    });
    const context = { workspaceId: workspace.id, projectId: project.id };
    const selectedObject = await storedObject(workspace.id, project.id, "selected.bin", "durable");
    const rawObject = await storedObject(workspace.id, project.id, "raw.bin");
    const selected = createArtifact({ projectId: project.id, slug: "selected", kind: "data" });
    const selectedRevision = addArtifactRevision({
      artifactId: selected.id,
      objectId: selectedObject.id,
      state: "approved",
    });
    selectArtifactRevision({ artifactId: selected.id, revisionId: selectedRevision.id, expectedRevisionId: null });
    addArtifactUsage({ artifactRevisionId: selectedRevision.id, projectId: project.id, role: "source" });
    addArtifactUsage({ artifactRevisionId: selectedRevision.id, workspaceId: workspace.id, role: "source" });
    addArtifactUsage({ artifactRevisionId: selectedRevision.id, projectId: project.id, role: "cover" });
    addArtifactUsage({ artifactRevisionId: selectedRevision.id, projectId: project.id, role: "reference" });
    const unselected = createArtifact({ projectId: project.id, slug: "unselected", kind: "data" });
    addArtifactRevision({ artifactId: unselected.id, objectId: rawObject.id, state: "candidate" });

    const run = startRun({ projectId: project.id, kind: "generation" });
    const runPath = path.join(root.dir, ".ralphy", "tmp", "promoted.bin");
    fs.mkdirSync(path.dirname(runPath), { recursive: true });
    fs.writeFileSync(runPath, "promoted");
    const runObject = recordRunObject({
      runId: run.id,
      path: "tmp/promoted.bin",
      purpose: "output",
      state: "working",
      retention: "keep",
      mime: "application/octet-stream",
      bytes: 8,
      sha256: createHash("sha256").update("promoted").digest("hex"),
    });
    const promoted = await promoteRunObject({
      runObjectId: runObject.id,
      mime: "application/octet-stream",
      storageClass: "working",
    });
    const page = await call("media.list", { context, limit: 20 }) as { items: Array<Record<string, unknown>> };
    const byRef = new Map(page.items.map((card) => [`${(card.ref as { type: string }).type}:${(card.ref as { id: string }).id}`, card]));
    expect(byRef.get(`artifact:${selected.id}`)).toMatchObject({
      selectedObjectId: selectedObject.id,
      storageClass: "durable",
      usageRoles: ["cover", "reference", "source"],
      target: { type: "object", id: selectedObject.id },
    });
    expect(byRef.get(`artifact:${unselected.id}`)).toMatchObject({
      selectedObjectId: null,
      storageClass: null,
      usageRoles: [],
      target: null,
    });
    expect(byRef.get(`run-object:${promoted.id}`)).toMatchObject({
      target: { type: "object", id: promoted.objectId },
    });
    expect(byRef.get(`object:${rawObject.id}`)).toMatchObject({
      target: { type: "object", id: rawObject.id },
    });
    const references = await call("media.list", {
      context,
      filter: "references",
      limit: 1,
    }) as { items: Array<Record<string, unknown>>; nextCursor: string | null };
    expect(references.items.map((card) => card.ref)).toEqual([
      { type: "artifact", id: selected.id },
    ]);
    expect(references.nextCursor).toBeNull();

    const runObjects = await call("run.objects", {
      context,
      runId: run.id,
      limit: 10,
    }) as { items: Array<Record<string, unknown>>; nextCursor: string | null };
    expect(runObjects.items).toHaveLength(1);
    expect(runObjects.items[0]).toMatchObject({
      id: promoted.id,
      logicalPath: "tmp/promoted.bin",
      locationClass: "temp",
      attemptId: null,
      attemptNo: null,
    });
    expect(Object.keys(runObjects.items[0]!).sort()).toEqual([
      "attemptId", "attemptNo", "bytes", "createdAt", "id", "locationClass",
      "logicalPath", "mime", "objectId", "projectId", "purpose", "retention",
      "runId", "state", "workspaceId",
    ]);

    const workspaceOverview = await call("workspace.overview", {
      context: { workspaceId: workspace.id },
      workspaceId: workspace.id,
      sections: {
        sharedMedia: { filter: "advanced-objects", limit: 1 },
        publications: { limit: 1 },
        metrics: true,
      },
    }) as Record<string, unknown>;
    expect(Object.keys(workspaceOverview).sort()).toEqual([
      "metrics", "publications", "sharedMedia", "workspace",
    ]);
    expect(workspaceOverview).toMatchObject({
      sharedMedia: { items: [], nextCursor: null },
      publications: { items: [], nextCursor: null },
      metrics: { publicationCount: 0, views: null },
    });

    const projectOverview = await call("project.overview", {
      context,
      projectId: project.id,
      sections: { publications: { limit: 1 }, metrics: true },
    }) as Record<string, unknown>;
    expect(Object.keys(projectOverview).sort()).toEqual([
      "metrics", "project", "publications",
    ]);
    expect(projectOverview).toMatchObject({
      project: { id: project.id, purpose: "Review media" },
      publications: { items: [], nextCursor: null },
      metrics: { publicationCount: 0, views: null },
    });
    expect(JSON.stringify(page.items)).not.toMatch(/"(absolutePath|bucket|key|sha256|path|originalName|metadata|locator)"/);
  });

  test("resolves scoped Object and RunObject locators only for explicit trusted purposes", async () => {
    root = makeTmpRoot("ralphy-bridge-locators");
    const workspace = createWorkspace({ slug: "locator", name: "Locator" });
    const project = createProject({ workspaceId: workspace.id, slug: "project", name: "Project" });
    const sibling = createProject({ workspaceId: workspace.id, slug: "sibling", name: "Sibling" });
    const context = { workspaceId: workspace.id, projectId: project.id };
    const rawObject = await storedObject(workspace.id, project.id, "raw-locator.bin");
    const foreignObject = await storedObject(workspace.id, sibling.id, "foreign.bin");
    await expect(call("locator.resolve", { context, target: { type: "object", id: rawObject.id }, purpose: "execute" }))
      .rejects.toThrow(/purpose/i);
    await expect(call("locator.resolve", { context, target: { type: "object", id: foreignObject.id }, purpose: "preview" }))
      .rejects.toThrow();

    const run = startRun({ projectId: project.id, kind: "generation" });
    const tmp = path.join(root.dir, ".ralphy", "tmp");
    fs.mkdirSync(tmp, { recursive: true });
    fs.writeFileSync(path.join(tmp, "working.bin"), "working");
    const working = recordRunObject({
      runId: run.id,
      path: "tmp/working.bin",
      purpose: "preview",
      state: "working",
      retention: "keep",
      mime: "application/octet-stream",
      bytes: 7,
    });
    expect(await call("locator.resolve", { context, target: { type: "run-object", id: working.id }, purpose: "preview" }))
      .toEqual({ absolutePath: path.join(tmp, "working.bin"), mime: "application/octet-stream", bytes: 7 });

    fs.writeFileSync(path.join(tmp, "promoted-locator.bin"), "promoted");
    const promoted = await promoteRunObject({
      runObjectId: recordRunObject({
        runId: run.id,
        path: "tmp/promoted-locator.bin",
        purpose: "output",
        state: "working",
        retention: "keep",
        bytes: 8,
      }).id,
      mime: "application/octet-stream",
      storageClass: "working",
    });
    expect(await call("locator.resolve", { context, target: { type: "run-object", id: promoted.id }, purpose: "open" }))
      .toMatchObject({ mime: "application/octet-stream", bytes: 8 });

    fs.symlinkSync(path.join(tmp, "working.bin"), path.join(tmp, "link.bin"));
    const symlink = recordRunObject({
      runId: run.id,
      path: "tmp/link.bin",
      purpose: "preview",
      state: "working",
      retention: "keep",
      bytes: 7,
    });
    fs.writeFileSync(path.join(tmp, "mismatch.bin"), "short");
    const mismatch = recordRunObject({
      runId: run.id,
      path: "tmp/mismatch.bin",
      purpose: "preview",
      state: "working",
      retention: "keep",
      bytes: 99,
    });
    for (const item of [symlink, mismatch]) {
      await expect(call("locator.resolve", { context, target: { type: "run-object", id: item.id }, purpose: "preview" }))
        .rejects.toThrow(/symlink|regular file|byte count/i);
    }
    openDomainDb().exec("PRAGMA ignore_check_constraints = ON");
    openDomainDb().prepare("UPDATE run_objects SET path = '../escape.bin' WHERE id = ?").run(working.id);
    openDomainDb().exec("PRAGMA ignore_check_constraints = OFF");
    await expect(call("locator.resolve", { context, target: { type: "run-object", id: working.id }, purpose: "preview" }))
      .rejects.toThrow(/path|escape/i);
  });
});
