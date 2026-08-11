import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { reviseCompositionCheckout, runCompositionBuild } from "../../cli/lib/composition-build.js";
import { generationInput } from "../../cli/lib/generation-input.js";
import {
  addArtifactRevision,
  addArtifactUsage,
  createArtifact,
  selectArtifactRevision,
} from "../../cli/lib/store/artifacts.js";
import { createBridgeMethods, type BridgeMethodContext } from "../../cli/lib/bridge/methods.js";
import { createEvaluation } from "../../cli/lib/store/evaluations.js";
import {
  bindCompositionInput,
  completeBuild,
  createComposition,
  putCompositionSource,
  reviseComposition,
  selectCompositionRevision,
  sealCompositionRevision,
  snapshotAndStartCompositionBuild,
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
import { createIteration, createProject, createWorkspace } from "../../cli/lib/store/scopes.js";
import { startAgentSession } from "../../cli/lib/store/sessions.js";
import { StoreConflictError } from "../../cli/lib/store/types.js";
import { storedObjectPath } from "../helpers/stored-object.js";
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

type InvalidReviseGuard = "foreign-parent" | "foreign-latest" | "stale-latest" | "foreign-iteration";

async function assertReviseGuardBeforeMaterialization(
  contextKind: "project" | "project-session",
  invalidGuard: InvalidReviseGuard,
) {
  const tag = `${contextKind}-${invalidGuard}`;
  root = makeTmpRoot(`ralphy-bridge-revise-${tag}`);
  const workspace = createWorkspace({ slug: `guard-${tag}`, name: `Guard ${tag}` });
  const project = createProject({ workspaceId: workspace.id, slug: "target", name: "Target" });
  const sibling = createProject({ workspaceId: workspace.id, slug: "sibling", name: "Sibling" });
  const session = startAgentSession({ workspaceId: workspace.id, projectId: project.id, agent: "desktop" });
  const context = contextKind === "project"
    ? { workspaceId: workspace.id, projectId: project.id }
    : { sessionId: session.id };

  const targetObject = await storedObject(workspace.id, project.id, `target-${tag}.bin`);
  const targetComposition = createComposition({ projectId: project.id, slug: `target-${tag}`, kind: "video" });
  const targetBase = reviseComposition({
    compositionId: targetComposition.id,
    expectedLatestRevisionId: null,
    engine: "manual",
  });
  putCompositionSource({ revisionId: targetBase.id, logicalPath: "source.bin", objectId: targetObject.id });

  const foreignObject = await storedObject(workspace.id, sibling.id, `foreign-${tag}.bin`);
  const foreignComposition = createComposition({ projectId: sibling.id, slug: `foreign-${tag}`, kind: "video" });
  const foreignRevision = reviseComposition({
    compositionId: foreignComposition.id,
    expectedLatestRevisionId: null,
    engine: "manual",
  });
  putCompositionSource({ revisionId: foreignRevision.id, logicalPath: "source.bin", objectId: foreignObject.id });
  const foreignIteration = createIteration({ projectId: sibling.id, title: `Foreign ${tag}` });

  let expectedLatestRevisionId = targetBase.id;
  let parentRevisionId: string | null | undefined;
  let iterationId: string | undefined;
  let expectedError: RegExp | typeof StoreConflictError;
  if (invalidGuard === "foreign-parent") {
    parentRevisionId = foreignRevision.id;
    expectedError = /parent must belong to the same Composition/i;
  } else if (invalidGuard === "foreign-latest") {
    expectedLatestRevisionId = foreignRevision.id;
    expectedError = StoreConflictError;
    fs.unlinkSync(storedObjectPath(foreignObject.id));
  } else if (invalidGuard === "stale-latest") {
    reviseComposition({
      compositionId: targetComposition.id,
      expectedLatestRevisionId: targetBase.id,
      engine: "manual",
    });
    expectedError = StoreConflictError;
    fs.unlinkSync(storedObjectPath(targetObject.id));
  } else {
    iterationId = foreignIteration.id;
    expectedError = /Iteration does not belong to the Composition Project/i;
  }

  const tmpPath = path.join(root.dir, ".ralphy", "tmp");
  const tmpEntries = () => fs.existsSync(tmpPath) ? fs.readdirSync(tmpPath).sort() : [];
  const counts = () => openDomainDb().query<{
    revisions: number; objects: number; activities: number;
  }, []>(
    `SELECT (SELECT COUNT(*) FROM composition_revisions) AS revisions,
            (SELECT COUNT(*) FROM objects) AS objects,
            (SELECT COUNT(*) FROM activity_events) AS activities`,
  ).get()!;
  const beforeCounts = counts();
  const beforeTmp = tmpEntries();
  let checkoutOpened = false;
  let entryCopied = false;

  const attempt = reviseCompositionCheckout({
    context,
    compositionId: targetComposition.id,
    expectedLatestRevisionId,
    ...(parentRevisionId === undefined ? {} : { parentRevisionId }),
    ...(iterationId === undefined ? {} : { iterationId }),
    engine: "manual",
    ...(contextKind === "project-session" ? { authoredBySessionId: session.id } : {}),
    testHooks: {
      afterCheckoutOpened: () => { checkoutOpened = true; },
      afterCheckoutEntryCopied: () => { entryCopied = true; },
    },
  });
  await expect(attempt).rejects.toThrow(expectedError);
  expect(checkoutOpened).toBe(false);
  expect(entryCopied).toBe(false);
  expect(counts()).toEqual(beforeCounts);
  expect(tmpEntries()).toEqual(beforeTmp);
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

  test("forwards an exact Evaluation target instead of paging its whole family", async () => {
    root = makeTmpRoot("ralphy-bridge-exact-evaluations");
    const workspace = createWorkspace({ slug: "evaluation", name: "Evaluation" });
    const project = createProject({ workspaceId: workspace.id, slug: "project", name: "Project" });
    const context = { workspaceId: workspace.id, projectId: project.id };
    const object = await storedObject(workspace.id, project.id, "evaluation.bin");
    const session = startAgentSession({ workspaceId: workspace.id, projectId: project.id, agent: "reviewer" });
    const targetArtifact = createArtifact({ projectId: project.id, slug: "target", kind: "data" });
    const targetRevision = addArtifactRevision({ artifactId: targetArtifact.id, objectId: object.id, state: "approved" });
    const otherArtifact = createArtifact({ projectId: project.id, slug: "other", kind: "data" });
    const otherRevision = addArtifactRevision({ artifactId: otherArtifact.id, objectId: object.id, state: "approved" });
    const targetEvaluation = createEvaluation({
      target: { type: "artifact_revision", id: targetRevision.id },
      authoredBySessionId: session.id,
      kind: "review",
    });
    createEvaluation({
      target: { type: "artifact_revision", id: otherRevision.id },
      authoredBySessionId: session.id,
      kind: "review",
    });

    expect(await call("evaluation.list", {
      context,
      target: { type: "artifact_revision", id: targetRevision.id },
      limit: 1,
    })).toEqual({ items: [targetEvaluation], nextCursor: null });
  });

  test("rechecks exact Project authorization inside the Composition revise transaction", async () => {
    root = makeTmpRoot("ralphy-bridge-revise-authorization");
    const workspace = createWorkspace({ slug: "revise-auth", name: "Revise auth" });
    const owner = createProject({ workspaceId: workspace.id, slug: "owner", name: "Owner" });
    const sibling = createProject({ workspaceId: workspace.id, slug: "sibling", name: "Sibling" });
    const siblingSession = startAgentSession({
      workspaceId: workspace.id,
      projectId: sibling.id,
      agent: "desktop",
    });
    const composition = createComposition({ projectId: owner.id, slug: "cut", kind: "video" });
    const before = openDomainDb().query<{ count: number }, [string]>(
      "SELECT COUNT(*) AS count FROM composition_revisions WHERE composition_id = ?",
    ).get(composition.id)!.count;

    expect(() => reviseComposition({
      context: { sessionId: siblingSession.id },
      compositionId: composition.id,
      expectedLatestRevisionId: null,
      engine: "manual",
    })).toThrow(/not found|scope/i);
    expect(openDomainDb().query<{ count: number }, [string]>(
      "SELECT COUNT(*) AS count FROM composition_revisions WHERE composition_id = ?",
    ).get(composition.id)!.count).toBe(before);
  });

  test("rechecks exact Project authorization inside the Composition selection transaction", async () => {
    root = makeTmpRoot("ralphy-bridge-select-authorization");
    const workspace = createWorkspace({ slug: "select-auth", name: "Select auth" });
    const owner = createProject({ workspaceId: workspace.id, slug: "owner", name: "Owner" });
    const sibling = createProject({ workspaceId: workspace.id, slug: "sibling", name: "Sibling" });
    const siblingSession = startAgentSession({
      workspaceId: workspace.id,
      projectId: sibling.id,
      agent: "desktop",
    });
    const object = await storedObject(workspace.id, owner.id, "select.bin");
    const composition = createComposition({ projectId: owner.id, slug: "cut", kind: "video" });
    const draft = reviseComposition({
      compositionId: composition.id,
      expectedLatestRevisionId: null,
      engine: "manual",
    });
    putCompositionSource({ revisionId: draft.id, logicalPath: "source.bin", objectId: object.id });
    const sealed = sealCompositionRevision({ revisionId: draft.id });

    expect(() => selectCompositionRevision({
      context: { sessionId: siblingSession.id },
      compositionId: composition.id,
      revisionId: sealed.id,
      expectedSelectedRevisionId: null,
    })).toThrow(/not found|scope/i);
    expect(openDomainDb().query<{ selected: string | null }, [string]>(
      "SELECT selected_revision_id AS selected FROM compositions WHERE id = ?",
    ).get(composition.id)!.selected).toBeNull();
  });

  test("denies a foreign bridge revise before creating a revision or checkout", async () => {
    root = makeTmpRoot("ralphy-bridge-revise-scope");
    const workspace = createWorkspace({ slug: "revise-scope", name: "Revise scope" });
    const owner = createProject({ workspaceId: workspace.id, slug: "owner", name: "Owner" });
    const sibling = createProject({ workspaceId: workspace.id, slug: "sibling", name: "Sibling" });
    const composition = createComposition({ projectId: owner.id, slug: "cut", kind: "video" });
    const revisionCount = () => openDomainDb().query<{ count: number }, [string]>(
      "SELECT COUNT(*) AS count FROM composition_revisions WHERE composition_id = ?",
    ).get(composition.id)!.count;
    const tmpPath = path.join(root.dir, ".ralphy", "tmp");
    const tmpEntries = () => fs.existsSync(tmpPath) ? fs.readdirSync(tmpPath).sort() : [];
    const beforeEntries = tmpEntries();

    await expect(call("composition.revise", {
      context: { workspaceId: workspace.id, projectId: sibling.id },
      compositionId: composition.id,
      expectedLatestRevisionId: null,
      engine: "manual",
      engineConfig: {},
    })).rejects.toThrow(/not found|scope/i);
    let checkoutOpened = false;
    await expect(reviseCompositionCheckout({
      context: { workspaceId: workspace.id, projectId: sibling.id },
      compositionId: composition.id,
      expectedLatestRevisionId: null,
      engine: "manual",
      testHooks: { afterCheckoutOpened: () => { checkoutOpened = true; } },
    })).rejects.toThrow(/not found|scope/i);
    expect(revisionCount()).toBe(0);
    expect(checkoutOpened).toBe(false);
    expect(tmpEntries()).toEqual(beforeEntries);
  });

  for (const contextKind of ["project", "project-session"] as const) {
    for (const invalidGuard of ["foreign-parent", "foreign-latest", "stale-latest", "foreign-iteration"] as const) {
      test(`rejects ${invalidGuard} in ${contextKind} context before checkout materialization`, async () => {
        await assertReviseGuardBeforeMaterialization(contextKind, invalidGuard);
      });
    }
  }

  test("denies a foreign bridge selection without changing its pointer", async () => {
    root = makeTmpRoot("ralphy-bridge-select-scope");
    const workspace = createWorkspace({ slug: "select-scope", name: "Select scope" });
    const owner = createProject({ workspaceId: workspace.id, slug: "owner", name: "Owner" });
    const sibling = createProject({ workspaceId: workspace.id, slug: "sibling", name: "Sibling" });
    const object = await storedObject(workspace.id, owner.id, "select-scope.bin");
    const composition = createComposition({ projectId: owner.id, slug: "cut", kind: "video" });
    const draft = reviseComposition({
      compositionId: composition.id,
      expectedLatestRevisionId: null,
      engine: "manual",
    });
    putCompositionSource({ revisionId: draft.id, logicalPath: "source.bin", objectId: object.id });
    const sealed = sealCompositionRevision({ revisionId: draft.id });

    await expect(call("composition.select", {
      context: { workspaceId: workspace.id, projectId: sibling.id },
      compositionId: composition.id,
      revisionId: sealed.id,
      expectedSelectedRevisionId: null,
    })).rejects.toThrow(/not found|scope/i);
    expect(openDomainDb().query<{ selected: string | null }, [string]>(
      "SELECT selected_revision_id AS selected FROM compositions WHERE id = ?",
    ).get(composition.id)!.selected).toBeNull();
  });

  test("materializes an explicit older parent checkout and returns only its safe revision DTO", async () => {
    root = makeTmpRoot("ralphy-bridge-revise-checkout");
    const workspace = createWorkspace({ slug: "checkout", name: "Checkout" });
    const project = createProject({ workspaceId: workspace.id, slug: "project", name: "Project" });
    const session = startAgentSession({ workspaceId: workspace.id, projectId: project.id, agent: "desktop" });
    const parentObject = await storedObject(workspace.id, project.id, "parent.bin");
    const latestObject = await storedObject(workspace.id, project.id, "latest.bin");
    const composition = createComposition({ projectId: project.id, slug: "cut", kind: "video" });
    const parentDraft = reviseComposition({
      compositionId: composition.id,
      expectedLatestRevisionId: null,
      engine: "manual",
    });
    putCompositionSource({ revisionId: parentDraft.id, logicalPath: "source.bin", objectId: parentObject.id });
    const parent = sealCompositionRevision({ revisionId: parentDraft.id });
    const latest = reviseComposition({
      compositionId: composition.id,
      expectedLatestRevisionId: parent.id,
      engine: "manual",
    });
    putCompositionSource({ revisionId: latest.id, logicalPath: "source.bin", objectId: latestObject.id });
    const iteration = createIteration({ projectId: project.id, title: "Alternate branch" });

    const revised = await call("composition.revise", {
      context: { sessionId: session.id },
      compositionId: composition.id,
      expectedLatestRevisionId: latest.id,
      parentRevisionId: parent.id,
      iterationId: iteration.id,
      engine: "manual",
      engineVersion: "1.0",
      engineConfig: { privateConfig: "checkout-secret" },
    }) as Record<string, unknown>;
    expect(Object.keys(revised).sort()).toEqual([
      "authoredBySessionId", "compositionId", "createdAt", "engine", "engineVersion",
      "id", "iterationId", "parentRevisionId", "revisionNo", "sealedAt", "state",
    ]);
    expect(revised).toMatchObject({
      compositionId: composition.id,
      parentRevisionId: parent.id,
      iterationId: iteration.id,
      authoredBySessionId: session.id,
      state: "draft",
    });
    const checkout = path.join(root.dir, ".ralphy", "tmp", String(revised.id), "checkout");
    expect(fs.readFileSync(path.join(checkout, "source.bin"), "utf8")).toBe("bytes:parent.bin");
    expect(JSON.stringify(revised)).not.toContain("checkout-secret");
    expect(JSON.stringify(revised)).not.toContain(root.dir);

    const beforeEntries = fs.readdirSync(path.join(root.dir, ".ralphy", "tmp")).sort();
    await expect(call("composition.revise", {
      context: { sessionId: session.id },
      compositionId: composition.id,
      expectedLatestRevisionId: latest.id,
      parentRevisionId: parent.id,
      engine: "manual",
    })).rejects.toThrow(/conflict/i);
    expect(fs.readdirSync(path.join(root.dir, ".ralphy", "tmp")).sort()).toEqual(beforeEntries);
  });

  test("rechecks exact Project authorization in the Build snapshot transaction", async () => {
    root = makeTmpRoot("ralphy-bridge-build-authorization");
    const workspace = createWorkspace({ slug: "build-auth", name: "Build auth" });
    const owner = createProject({ workspaceId: workspace.id, slug: "owner", name: "Owner" });
    const sibling = createProject({ workspaceId: workspace.id, slug: "sibling", name: "Sibling" });
    const composition = createComposition({ projectId: owner.id, slug: "cut", kind: "video" });
    const draft = await reviseCompositionCheckout({
      compositionId: composition.id,
      expectedLatestRevisionId: null,
      engine: "manual",
      engineConfig: {
        outputs: [{
          source: "source.txt",
          slug: "master",
          kind: "document",
          mime: "text/plain",
          role: "master",
        }],
      },
    });
    fs.writeFileSync(path.join(draft.checkoutPath, "source.txt"), "authorized bytes");

    let snapshotPrepared = false;
    await expect(runCompositionBuild({
      context: { workspaceId: workspace.id, projectId: sibling.id },
      compositionId: composition.id,
      revisionId: draft.id,
      testHooks: { beforeSnapshotCommit: () => { snapshotPrepared = true; } },
    })).rejects.toThrow(/not found|scope/i);
    expect(() => snapshotAndStartCompositionBuild({
      context: { workspaceId: workspace.id, projectId: sibling.id },
      revisionId: draft.id,
      expectedLatestRevisionId: draft.id,
      sources: [],
      expectedInputs: [],
      profile: {},
    })).toThrow(/not found|scope/i);
    expect(snapshotPrepared).toBe(false);
    expect(openDomainDb().query<{ state: string }, [string]>(
      "SELECT state FROM composition_revisions WHERE id = ?",
    ).get(draft.id)!.state).toBe("draft");
    expect(openDomainDb().query<{ count: number }, []>(
      "SELECT COUNT(*) AS count FROM builds",
    ).get()!.count).toBe(0);
  });

  test("awaits the canonical Build lifecycle and returns only terminal output identities", async () => {
    root = makeTmpRoot("ralphy-bridge-build-terminal");
    const workspace = createWorkspace({ slug: "build-terminal", name: "Build terminal" });
    const project = createProject({ workspaceId: workspace.id, slug: "project", name: "Project" });
    const session = startAgentSession({ workspaceId: workspace.id, projectId: project.id, agent: "desktop" });
    const context = { sessionId: session.id };
    const composition = createComposition({ projectId: project.id, slug: "cut", kind: "video" });
    const draft = await reviseCompositionCheckout({
      compositionId: composition.id,
      expectedLatestRevisionId: null,
      engine: "manual",
      engineConfig: {
        privateEngineConfig: "engine-secret",
        outputs: [
          { source: "master.txt", slug: "master", kind: "document", mime: "text/plain", role: "master" },
          { source: "preview.txt", slug: "preview", kind: "document", mime: "text/plain", role: "preview" },
        ],
      },
    });
    fs.writeFileSync(path.join(draft.checkoutPath, "master.txt"), "master bytes");
    fs.writeFileSync(path.join(draft.checkoutPath, "preview.txt"), "preview bytes");

    const completed = await call("composition.build", {
      context,
      compositionRevisionId: draft.id,
      profile: { quality: "preview", privateProfile: "profile-secret" },
    }) as Record<string, unknown>;
    expect(Object.keys(completed).sort()).toEqual([
      "compositionRevisionId", "createdAt", "finishedAt", "id", "outputs", "runId", "state",
    ]);
    expect(completed).toMatchObject({ compositionRevisionId: draft.id, state: "succeeded" });
    const outputs = completed.outputs as Array<Record<string, unknown>>;
    expect(outputs.map((output) => Object.keys(output).sort())).toEqual([
      ["artifactRevisionId", "objectId", "position", "role"],
      ["artifactRevisionId", "objectId", "position", "role"],
    ]);
    expect(outputs.map(({ role, position }) => ({ role, position }))).toEqual([
      { role: "master", position: 0 },
      { role: "preview", position: 1 },
    ]);
    expect(outputs.map((output) => fs.readFileSync(storedObjectPath(String(output.objectId)), "utf8")))
      .toEqual(["master bytes", "preview bytes"]);
    expect(openDomainDb().query<{ revisionState: string; buildState: string; runState: string; attemptState: string }, [string]>(
      `SELECT revision.state AS revisionState, build.state AS buildState,
              run.state AS runState, attempt.state AS attemptState
       FROM builds build
       JOIN composition_revisions revision ON revision.id = build.composition_revision_id
       JOIN runs run ON run.id = build.run_id
       JOIN run_attempts attempt ON attempt.run_id = run.id
       WHERE build.id = ?`,
    ).get(String(completed.id))).toEqual({
      revisionState: "sealed",
      buildState: "succeeded",
      runState: "succeeded",
      attemptState: "succeeded",
    });
    const serialized = JSON.stringify(completed);
    for (const hidden of [root.dir, draft.checkoutPath, "master.txt", "profile-secret", "engine-secret", "bucket", "bytes"]) {
      expect(serialized).not.toContain(hidden);
    }
  });

  test("creates no lifecycle rows for a stale draft or an already sealed revision", async () => {
    root = makeTmpRoot("ralphy-bridge-build-conflicts");
    const workspace = createWorkspace({ slug: "build-conflicts", name: "Build conflicts" });
    const project = createProject({ workspaceId: workspace.id, slug: "project", name: "Project" });
    const context = { workspaceId: workspace.id, projectId: project.id };
    const composition = createComposition({ projectId: project.id, slug: "cut", kind: "video" });
    const engineConfig = {
      outputs: [{ source: "source.txt", slug: "master", kind: "document", mime: "text/plain" }],
    };
    const first = await reviseCompositionCheckout({
      compositionId: composition.id,
      expectedLatestRevisionId: null,
      engine: "manual",
      engineConfig,
    });
    fs.writeFileSync(path.join(first.checkoutPath, "source.txt"), "first");
    await call("composition.build", { context, compositionRevisionId: first.id, profile: {} });
    const stale = await reviseCompositionCheckout({
      compositionId: composition.id,
      expectedLatestRevisionId: first.id,
      engine: "manual",
      engineConfig,
    });
    fs.writeFileSync(path.join(stale.checkoutPath, "source.txt"), "stale");
    const latest = await reviseCompositionCheckout({
      compositionId: composition.id,
      expectedLatestRevisionId: stale.id,
      engine: "manual",
      engineConfig,
    });
    fs.writeFileSync(path.join(latest.checkoutPath, "source.txt"), "latest");
    const counts = () => openDomainDb().query<{
      runs: number; attempts: number; builds: number; outputs: number; objects: number;
    }, []>(
      `SELECT (SELECT COUNT(*) FROM runs) AS runs,
              (SELECT COUNT(*) FROM run_attempts) AS attempts,
              (SELECT COUNT(*) FROM builds) AS builds,
              (SELECT COUNT(*) FROM build_outputs) AS outputs,
              (SELECT COUNT(*) FROM objects) AS objects`,
    ).get()!;
    const before = counts();

    await expect(call("composition.build", {
      context,
      compositionRevisionId: stale.id,
      profile: {},
    })).rejects.toThrow(StoreConflictError);
    await expect(call("composition.build", {
      context,
      compositionRevisionId: first.id,
      profile: {},
    })).rejects.toThrow(StoreConflictError);
    expect(counts()).toEqual(before);
  });

  test("terminalizes a failed manual Build without fabricating outputs", async () => {
    root = makeTmpRoot("ralphy-bridge-build-failure");
    const workspace = createWorkspace({ slug: "build-failure", name: "Build failure" });
    const project = createProject({ workspaceId: workspace.id, slug: "project", name: "Project" });
    const context = { workspaceId: workspace.id, projectId: project.id };
    const composition = createComposition({ projectId: project.id, slug: "cut", kind: "video" });
    const draft = await reviseCompositionCheckout({
      compositionId: composition.id,
      expectedLatestRevisionId: null,
      engine: "manual",
      engineConfig: {
        outputs: [{ source: "missing.txt", slug: "missing", kind: "document", mime: "text/plain" }],
      },
    });
    fs.writeFileSync(path.join(draft.checkoutPath, "source.txt"), "snapshot survives failure");

    await expect(call("composition.build", {
      context,
      compositionRevisionId: draft.id,
      profile: {},
    })).rejects.toThrow();
    expect(openDomainDb().query<{
      revisionState: string; buildState: string; runState: string; attemptState: string; outputs: number;
    }, [string]>(
      `SELECT revision.state AS revisionState, build.state AS buildState,
              run.state AS runState, attempt.state AS attemptState,
              (SELECT COUNT(*) FROM build_outputs output WHERE output.build_id = build.id) AS outputs
       FROM builds build
       JOIN composition_revisions revision ON revision.id = build.composition_revision_id
       JOIN runs run ON run.id = build.run_id
       JOIN run_attempts attempt ON attempt.run_id = run.id
       WHERE revision.id = ?`,
    ).get(draft.id)).toEqual({
      revisionState: "sealed",
      buildState: "failed",
      runState: "failed",
      attemptState: "failed",
      outputs: 0,
    });
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
