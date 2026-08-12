import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { RalphyBridgeClient } from "../electron/ralphy/client";

function nestedKeys(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(nestedKeys);
  if (value === null || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) => [key, ...nestedKeys(child)]);
}

function nestedValuesForKey(value: unknown, wanted: string): unknown[] {
  if (Array.isArray(value)) return value.flatMap((child) => nestedValuesForKey(child, wanted));
  if (value === null || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) => [
    ...(key === wanted ? [child] : []),
    ...nestedValuesForKey(child, wanted),
  ]);
}

const currentCoreCapabilities = [
  "activity.list", "activity.subscribe", "activity.unsubscribe", "agent.auth.login",
  "agent.auth.status", "agent.credential.clear", "agent.credential.set",
  "agent.credential.status", "agent.providers", "agent.turn.resume", "agent.turn.start", "agent.turn.status", "agent.turn.stop",
  "build.outputs", "build.show", "calendar.list", "calendar.update",
  "campaign.list", "campaign.show", "campaign.update", "composition.build",
  "composition.builds", "composition.inputs", "composition.list", "composition.revise", "composition.revision.show",
  "composition.revisions", "composition.select", "composition.show", "composition.sources",
  "consumer.authenticate", "consumer.session.end", "consumer.session.start",
  "document.bind", "document.content", "document.create", "document.list",
  "document.revise", "document.revisions", "document.search", "document.show",
  "evaluation.create", "evaluation.list", "evaluation.show", "feedback.add", "feedback.list", "feedback.resolve", "generation.start",
  "locator.resolve", "media.generation.show", "media.list", "media.review", "media.revision.show", "media.revisions", "media.select", "media.show", "metric.list", "metric.totals",
  "migration.desktop.import", "migration.secret.import", "operation.find",
  "presentation.captions", "presentation.items", "project.iteration.create",
  "project.iteration.list", "project.list", "project.overview", "project.show",
  "project.status", "project.update", "publication.cancel", "publication.list",
  "publication.lookup", "publication.publish", "publication.reconcile", "publication.recover",
  "publication.refresh", "repair.start", "run.attempts", "run.cancel", "run.list", "run.objects", "run.results", "run.show",
  "session.end", "session.list", "session.show", "session.start", "system.hello",
  "transcription.start", "transform.start", "unit.items", "unit.list", "unit.presentations",
  "unit.preview", "unit.revise", "unit.revision.show", "unit.revisions", "unit.select",
  "unit.show", "workspace.account.list", "workspace.account.upsert", "workspace.export",
  "workspace.import", "workspace.list", "workspace.overview", "workspace.show", "workspace.update",
] as const;

const currentCoreStoreId = "store_0123456789abcdef0123456789abcdef";
const firstMediaCursor = "c1.WzQsImFydF9wcmpfMSJd";

let fixtureDirectory: string;
let fixtureBin: string;

const currentCoreFixtures = [
  {
    method: "document.search",
    params: { context: { workspaceId: "ws_1", projectId: "prj_1" }, query: "launch", limit: 50 },
    result: { items: [{ documentId: "doc_1", revisionId: "drev_3", workspaceId: "ws_1", projectId: "prj_1", kind: "brief", slug: "launch", documentTitle: "Launch", revisionNo: 3, parentRevisionId: "drev_2", iterationId: "iter_1", format: "markdown", title: "Launch v3", authoredBySessionId: "session_1", createdAt: 3 }], nextCursor: null },
  },
  {
    method: "document.show",
    params: { context: { workspaceId: "ws_1", projectId: "prj_1" }, documentId: "doc_1" },
    result: { id: "doc_1", workspaceId: "ws_1", projectId: "prj_1", kind: "brief", slug: "launch", title: "Launch", currentRevisionId: "drev_3", rowVersion: 3, createdAt: 1, updatedAt: 3, currentRevision: { id: "drev_3", documentId: "doc_1", revisionNo: 3, parentRevisionId: "drev_2", iterationId: "iter_1", format: "markdown", title: "Launch v3", authoredBySessionId: "session_1", createdAt: 3 } },
  },
  {
    method: "document.content",
    params: { context: { workspaceId: "ws_1", projectId: "prj_1" }, revisionId: "drev_3", afterByte: 0, limitBytes: 65_536 },
    result: { revisionId: "drev_3", format: "markdown", text: "# Launch", nextByte: null },
  },
  {
    method: "document.revise",
    params: { context: { workspaceId: "ws_1", projectId: "prj_1" }, documentId: "doc_1", expectedHeadId: "drev_3", iterationId: "iter_1", format: "json", title: "Launch v4", body: { approved: true } },
    result: { id: "drev_4", documentId: "doc_1", revisionNo: 4, parentRevisionId: "drev_3", iterationId: "iter_1", format: "json", title: "Launch v4", authoredBySessionId: null, createdAt: 4 },
  },
  {
    method: "workspace.overview",
    params: { context: { workspaceId: "ws_1" }, workspaceId: "ws_1", sections: { documents: { limit: 5 }, units: { limit: 5 }, accounts: { limit: 5 }, projects: { limit: 5 }, activity: { afterSequence: 0, limit: 10 }, sharedMedia: { limit: 5 }, publications: { limit: 5 }, metrics: true } },
    result: {
      workspace: { id: "ws_1", slug: "launch", name: "Launch Studio", rowVersion: 2, createdAt: 1, updatedAt: 9 },
      documents: { items: [{ id: "doc_ws_1", workspaceId: "ws_1", projectId: null, slug: "workspace-brief", title: "Workspace brief", kind: "brief", currentRevisionId: "drev_ws_1", rowVersion: 1, createdAt: 2, updatedAt: 2 }], nextCursor: null },
      units: { items: [{ id: "unit_ws_1", workspaceId: "ws_1", projectId: null, slug: "launch-reel", format: "9:16", latestRevisionId: "urev_ws_2", selectedRevisionId: "urev_ws_1", createdAt: 2, updatedAt: 5 }], nextCursor: null },
      accounts: { items: [{ id: "acct_1", workspaceId: "ws_1", platform: "tiktok", externalId: "external_1", displayName: "Launch Studio", username: "launch", credentialConfigured: true, credentialSource: "encrypted", relinkRequired: false, rowVersion: 1, createdAt: 2, updatedAt: 3 }], nextCursor: null },
      projects: { items: [{ id: "prj_1", workspaceId: "ws_1", slug: "launch", name: "Launch", state: "active", rowVersion: 1, createdAt: 1, updatedAt: 8 }], nextCursor: null },
      activity: { items: [{ sequence: 7, workspaceId: "ws_1", projectId: null, entityType: "workspace", entityId: "ws_1", action: "updated", createdAt: 7 }, { sequence: 8, workspaceId: "ws_1", projectId: "prj_1", entityType: "project", entityId: "prj_1", action: "updated", createdAt: 8 }], nextCursor: null },
      sharedMedia: { items: [{ ref: { type: "artifact", id: "art_ws_1" }, workspaceId: "ws_1", projectId: null, slug: "logo", kind: "image", selectedRevisionId: "arev_ws_1", selectedState: "approved", mime: "image/png", bytes: 12, selectedAt: 4, revisionCount: 1, selectedObjectId: "obj_ws_1", storageClass: "bucket", usageRoles: ["reference"], target: { type: "object", id: "obj_ws_1" }, mediaKind: "image", provenance: "not-generation" }], nextCursor: null },
      publications: { items: [{ id: "pub_ws_1", unitId: "unit_ws_1", presentationId: "pres_ws_1", platform: "tiktok", socialAccountId: "acct_1", rail: "postiz", state: "published", url: "https://example.test/post/workspace", scheduledAt: null, submittedAt: 6, publishedAt: 7, createdAt: 5, updatedAt: 7 }], nextCursor: null },
      metrics: { publicationCount: 1, views: 100, likes: 10, comments: 2, shares: 1, watchTimeMs: 1000 },
    },
  },
  {
    method: "project.overview",
    params: { context: { workspaceId: "ws_1", projectId: "prj_1" }, projectId: "prj_1", sections: { documents: { limit: 5 }, iterations: { limit: 5 }, feedback: { limit: 5 }, stages: { limit: 5 }, compositions: { limit: 5 }, builds: { limit: 5 }, units: { limit: 5 }, runs: { limit: 5 }, activity: { afterSequence: 0, limit: 10 }, mediaCounts: true, publications: { limit: 5 }, metrics: true } },
    result: {
      project: { id: "prj_1", workspaceId: "ws_1", slug: "launch", name: "Launch", state: "active", rowVersion: 1, createdAt: 1, updatedAt: 8, purpose: "Launch" },
      spendUsd: 3.84,
      documents: { items: [
        { id: "doc_1", workspaceId: "ws_1", projectId: "prj_1", slug: "launch", title: "Launch", kind: "brief", currentRevisionId: "drev_3", rowVersion: 3, createdAt: 1, updatedAt: 3, binding: { ownerType: "project", ownerId: "prj_1", role: "brief", documentId: "doc_1", boundRevisionId: "drev_2", currentHeadRevisionId: "drev_3", hasNewerHead: true } },
        { id: "doc_ws_1", workspaceId: "ws_1", projectId: null, slug: "workspace-brief", title: "Workspace brief", kind: "brief", currentRevisionId: "drev_ws_1", rowVersion: 1, createdAt: 2, updatedAt: 2, binding: null },
      ], nextCursor: null },
      iterations: { items: [{ id: "iter_1", projectId: "prj_1", number: 1, title: "Initial", state: "active", priorIterationChanges: null, createdAt: 1, closedAt: null }], nextCursor: null },
      feedback: { items: [{ id: "feedback_1", projectId: "prj_1", iterationId: "iter_1", status: "open", targetType: "document_revision", targetId: "drev_2", createdAt: 2, resolvedAt: null }], nextCursor: null },
      stages: { items: [{ id: "stage_1", projectId: "prj_1", stage: "production", state: "active", entityType: "composition", entityId: "comp_1", rowVersion: 1, updatedAt: 3 }], nextCursor: null },
      compositions: { items: [{ id: "comp_1", projectId: "prj_1", slug: "launch-cut", kind: "video", latestRevisionId: "crev_1", selectedRevisionId: "crev_1", createdAt: 2, updatedAt: 3 }], nextCursor: null },
      builds: { items: [{ id: "build_1", compositionRevisionId: "crev_1", runId: "run_1", state: "succeeded", createdAt: 3, finishedAt: 4 }], nextCursor: null },
      units: { items: [{ id: "unit_prj_1", workspaceId: "ws_1", projectId: "prj_1", slug: "project-reel", format: "9:16", latestRevisionId: "urev_prj_1", selectedRevisionId: "urev_prj_1", createdAt: 3, updatedAt: 4 }], nextCursor: null },
      runs: { items: [{ id: "run_1", workspaceId: "ws_1", projectId: "prj_1", kind: "generation", label: "Launch", state: "succeeded", createdAt: 1, startedAt: 2, endedAt: 3 }], nextCursor: null },
      activity: { items: [{ sequence: 7, workspaceId: "ws_1", projectId: null, entityType: "workspace", entityId: "ws_1", action: "updated", createdAt: 7 }, { sequence: 8, workspaceId: "ws_1", projectId: "prj_1", entityType: "project", entityId: "prj_1", action: "updated", createdAt: 8 }], nextCursor: null },
      mediaCounts: { artifacts: 2, objects: 2, runObjects: 1 },
      publications: { items: [{ id: "pub_prj_1", unitId: "unit_prj_1", presentationId: "pres_prj_1", platform: "tiktok", socialAccountId: "acct_1", rail: "postiz", state: "published", url: "https://example.test/post/project", scheduledAt: null, submittedAt: 7, publishedAt: 8, createdAt: 6, updatedAt: 8 }], nextCursor: null },
      metrics: { publicationCount: 1, views: 100, likes: 10, comments: 2, shares: 1, watchTimeMs: 1000 },
    },
  },
  {
    method: "media.list",
    params: { context: { workspaceId: "ws_1", projectId: "prj_1" }, limit: 1, filter: "references", types: ["artifact"] },
    result: { items: [{ ref: { type: "artifact", id: "art_prj_1" }, workspaceId: "ws_1", projectId: "prj_1", slug: "reference-1", kind: "image", selectedRevisionId: "arev_prj_1", selectedState: "approved", mime: "image/png", bytes: 12, selectedAt: 4, revisionCount: 1, selectedObjectId: "obj_prj_1", storageClass: "bucket", usageRoles: ["reference"], target: { type: "object", id: "obj_prj_1" }, mediaKind: "image", provenance: "generation" }], nextCursor: firstMediaCursor },
  },
  {
    method: "media.show",
    params: { context: { workspaceId: "ws_1", projectId: "prj_1" }, ref: { type: "artifact", id: "art_prj_1" } },
    result: { ref: { type: "artifact", id: "art_prj_1" }, workspaceId: "ws_1", projectId: "prj_1", slug: "reference-1", kind: "image", selectedRevisionId: "arev_prj_1", selectedState: "approved", mime: "image/png", bytes: 12, selectedAt: 4, revisionCount: 1, selectedObjectId: "obj_prj_1", storageClass: "bucket", usageRoles: ["reference"], target: { type: "object", id: "obj_prj_1" }, mediaKind: "image", provenance: "generation" },
  },
  {
    method: "media.show",
    params: { context: { workspaceId: "ws_1", projectId: "prj_1" }, ref: { type: "run-object", id: "robj_1" } },
    result: { ref: { type: "run-object", id: "robj_1" }, workspaceId: "ws_1", projectId: "prj_1", runId: "run_1", purpose: "output", state: "ready", retention: "durable", mime: "video/mp4", bytes: 12, createdAt: 5, objectId: "obj_prj_1", logicalPath: "outputs/final.mp4", locationClass: "other", attemptId: null, attemptNo: null, target: { type: "object", id: "obj_prj_1" }, mediaKind: "video", provenance: "generation" },
  },
  {
    method: "media.show",
    params: { context: { workspaceId: "ws_1", projectId: "prj_1" }, ref: { type: "object", id: "obj_prj_1" } },
    result: { ref: { type: "object", id: "obj_prj_1" }, workspaceId: "ws_1", projectId: "prj_1", storageClass: "bucket", mime: "video/mp4", bytes: 12, createdAt: 4, referenceCount: 2, target: { type: "object", id: "obj_prj_1" }, mediaKind: "video", provenance: "generation" },
  },
  {
    method: "media.generation.show",
    params: { context: { workspaceId: "ws_1", projectId: "prj_1" }, target: { type: "artifact-revision", id: "arev_prj_1" }, limit: 20 },
    result: {
      status: "generation",
      target: { type: "artifact-revision", id: "arev_prj_1" },
      run: { id: "run_1", workspaceId: "ws_1", projectId: "prj_1", agentSessionId: null, kind: "generation", label: "Launch", state: "succeeded", createdAt: 1, startedAt: 2, endedAt: 3 },
      attempts: {
        items: [{ id: "attempt_1", runId: "run_1", attemptNo: 1, provider: "openrouter", model: "fixture-image", state: "succeeded", costUsd: 0.75, startedAt: 2, endedAt: 3, input: { version: 1, texts: [{ role: "prompt", value: "A safe prompt", truncated: false }], parameters: [{ name: "aspectRatio", value: "9:16" }] } }],
        nextCursor: null,
      },
      cost: { knownUsd: 0.75, complete: true },
    },
  },
  {
    method: "media.revisions",
    params: { context: { workspaceId: "ws_1", projectId: "prj_1" }, ref: { type: "artifact", id: "art_prj_1" }, limit: 50 },
    result: { items: [{ id: "arev_prj_1", artifactId: "art_prj_1", objectId: "obj_prj_1", revisionNo: 1, parentRevisionId: null, iterationId: "iter_1", state: "approved", authoredBySessionId: "session_1", createdAt: 4 }], nextCursor: null },
  },
  {
    method: "media.select",
    params: { context: { workspaceId: "ws_1", projectId: "prj_1" }, ref: { type: "artifact", id: "art_prj_1" }, revisionId: "arev_prj_1", expectedSelectedRevisionId: null },
    result: { ref: { type: "artifact", id: "art_prj_1" }, workspaceId: "ws_1", projectId: "prj_1", slug: "reference-1", kind: "image", selectedRevisionId: "arev_prj_1", selectedState: "approved", mime: "image/png", bytes: 12, selectedAt: 4, revisionCount: 1, selectedObjectId: "obj_prj_1", storageClass: "bucket", usageRoles: ["reference"], target: { type: "object", id: "obj_prj_1" }, mediaKind: "image", provenance: "generation" },
  },
  {
    method: "media.list",
    params: { context: { workspaceId: "ws_1", projectId: "prj_1" }, after: firstMediaCursor, limit: 1, filter: "references", types: ["artifact"] },
    result: { items: [{ ref: { type: "artifact", id: "art_prj_2" }, workspaceId: "ws_1", projectId: "prj_1", slug: "reference-2", kind: "image", selectedRevisionId: "arev_prj_2", selectedState: "approved", mime: "image/png", bytes: 13, selectedAt: 5, revisionCount: 1, selectedObjectId: "obj_prj_2", storageClass: "bucket", usageRoles: ["reference"], target: { type: "object", id: "obj_prj_2" }, mediaKind: "image", provenance: "unknown" }], nextCursor: null },
  },
  {
    method: "run.objects",
    params: { context: { workspaceId: "ws_1", projectId: "prj_1" }, runId: "run_1", limit: 5 },
    result: { items: [{ id: "robj_1", workspaceId: "ws_1", projectId: "prj_1", runId: "run_1", objectId: "obj_prj_1", purpose: "output", state: "ready", retention: "durable", mime: "video/mp4", bytes: 12, logicalPath: "outputs/final.mp4", locationClass: "other", attemptId: null, attemptNo: null, createdAt: 5 }], nextCursor: null },
  },
  {
    method: "unit.show",
    params: { context: { workspaceId: "ws_1", projectId: "prj_1" }, unitId: "unit_prj_1" },
    result: { id: "unit_prj_1", workspaceId: "ws_1", projectId: "prj_1", slug: "project-reel", format: "9:16", latestRevisionId: "urev_prj_1", selectedRevisionId: "urev_prj_1", createdAt: 3, updatedAt: 4 },
  },
  {
    method: "unit.revision.show",
    params: { context: { workspaceId: "ws_1", projectId: "prj_1" }, revisionId: "urev_prj_1" },
    result: { id: "urev_prj_1", unitId: "unit_prj_1", revisionNo: 1, parentRevisionId: null, iterationId: "iter_1", note: "Approved cut", authoredBySessionId: "session_1", createdAt: 3, sealedAt: 4 },
  },
  {
    method: "unit.revisions",
    params: { context: { workspaceId: "ws_1", projectId: "prj_1" }, unitId: "unit_prj_1", order: "newest", limit: 50 },
    result: { items: [{ id: "urev_prj_1", unitId: "unit_prj_1", revisionNo: 1, parentRevisionId: null, iterationId: "iter_1", note: "Approved cut", authoredBySessionId: "session_1", createdAt: 3, sealedAt: 4 }], nextCursor: null },
  },
  {
    method: "unit.items",
    params: { context: { workspaceId: "ws_1", projectId: "prj_1" }, revisionId: "urev_prj_1", limit: 50 },
    result: { items: [{ id: "uitem_prj_1", unitRevisionId: "urev_prj_1", artifactRevisionId: "arev_prj_1", documentRevisionId: null, role: "asset", position: 0, config: null, createdAt: 3 }], nextCursor: null },
  },
  {
    method: "unit.presentations",
    params: { context: { workspaceId: "ws_1", projectId: "prj_1" }, revisionId: "urev_prj_1", limit: 50 },
    result: { items: [{ id: "presentation_prj_1", unitRevisionId: "urev_prj_1", platform: "tiktok", position: 0, effectiveCaptionRevisionId: null, coverArtifactRevisionId: "arev_prj_1", crop: null, safeArea: null, options: {}, createdAt: 3 }], nextCursor: null },
  },
  {
    method: "unit.select",
    params: { context: { workspaceId: "ws_1", projectId: "prj_1" }, unitId: "unit_prj_1", revisionId: "urev_prj_1", expectedSelectedRevisionId: null },
    result: { id: "unit_prj_1", workspaceId: "ws_1", projectId: "prj_1", slug: "project-reel", format: "9:16", latestRevisionId: "urev_prj_1", selectedRevisionId: "urev_prj_1", createdAt: 3, updatedAt: 4 },
  },
  {
    method: "activity.list",
    params: { afterSequence: 6, limit: 10 },
    result: { items: [{ sequence: 7, workspaceId: "ws_1", projectId: null, entityType: "workspace", entityId: "ws_1", action: "updated", createdAt: 7 }, { sequence: 8, workspaceId: "ws_1", projectId: "prj_1", entityType: "project", entityId: "prj_1", action: "updated", createdAt: 8 }], nextCursor: null },
  },
  {
    method: "activity.subscribe",
    params: { subscriptionId: "sub_1", afterSequence: 7 },
    result: { subscriptionId: "sub_1", sequence: 7 },
  },
  {
    method: "activity.unsubscribe",
    params: { subscriptionId: "sub_1" },
    result: { subscriptionId: "sub_1", unsubscribed: true },
  },
] as const;

type CurrentCoreFixture = (typeof currentCoreFixtures)[number];

function fixturesFor<Method extends CurrentCoreFixture["method"]>(method: Method) {
  return currentCoreFixtures.filter(
    (fixture): fixture is Extract<CurrentCoreFixture, { method: Method }> => fixture.method === method,
  );
}

beforeAll(async () => {
  fixtureDirectory = await mkdtemp(join(tmpdir(), "ralphy-current-core-"));
  fixtureBin = join(fixtureDirectory, "ralphy-current-core-fixture");
  await writeFile(fixtureBin, `#!/usr/bin/env node
const readline = require("node:readline");
const { isDeepStrictEqual } = require("node:util");
const send = (value) => process.stdout.write(JSON.stringify(value) + "\\n");
const fixtures = ${JSON.stringify(currentCoreFixtures)};
readline.createInterface({ input: process.stdin }).on("line", (line) => {
  const request = JSON.parse(line);
  if (request.method === "system.hello") return send({ v: 1, id: request.id, ok: true, result: {
    protocolVersion: 1,
    coreVersion: "2",
    schemaVersion: 6,
    storeId: "${currentCoreStoreId}",
    rootId: "${"a".repeat(64)}",
    capabilities: ${JSON.stringify(currentCoreCapabilities)},
    activitySequence: 8,
    startup: { state: "ready", migration: "complete" },
    limits: {
      maxFrameBytes: 1048576,
      maxRequestIdBytes: 128,
      maxInFlight: 64,
      maxSeenIds: 65536,
      maxOutboundBytes: 8388608,
      maxAgentDeltaBytes: 65536
    }
  }});
  const fixture = fixtures.find((candidate) => candidate.method === request.method && isDeepStrictEqual(request.params, candidate.params));
  if (!fixture) {
    return send({ v: 1, id: request.id, ok: false, error: { code: "E_FIXTURE", message: "Unexpected fixture request" } });
  }
  send({ v: 1, id: request.id, ok: true, result: fixture.result });
  if (request.method === "activity.subscribe") send({ v: 1, event: "activity", subscriptionId: "sub_1", sequence: 8, data: { sequence: 8, workspaceId: "ws_1", projectId: "prj_1", entityType: "project", entityId: "prj_1", action: "updated", createdAt: 8 } });
});
`);
  await chmod(fixtureBin, 0o755);
});

afterAll(async () => {
  await rm(fixtureDirectory, { recursive: true, force: true });
});

describe("current Core bridge contract", () => {
  test("accepts the exact current system.hello shape and capabilities", async () => {
    const client = new RalphyBridgeClient({ bin: fixtureBin, root: "/fixture-root" });
    const hello = await client.start();
    expect(hello).toEqual({
      protocolVersion: 1,
      coreVersion: "2",
      schemaVersion: 6,
      storeId: currentCoreStoreId,
      rootId: "a".repeat(64),
      capabilities: [...currentCoreCapabilities],
      activitySequence: 8,
      startup: { state: "ready", migration: "complete" },
      limits: {
        maxFrameBytes: 1048576,
        maxRequestIdBytes: 128,
        maxInFlight: 64,
        maxSeenIds: 65536,
        maxOutboundBytes: 8388608,
        maxAgentDeltaBytes: 65536,
      },
    });
    expect(hello.storeId).toMatch(/^store_[0-9a-f]{32}$/);
    expect(hello.capabilities).toEqual([...hello.capabilities].sort());
    await client.close();
  });

  test("keeps every reused fixture identity single-owner and scope-coherent", () => {
    const search = fixturesFor("document.search")[0]!.result.items[0]!;
    const shown = fixturesFor("document.show")[0]!.result;
    const revised = fixturesFor("document.revise")[0]!.result;
    const workspace = fixturesFor("workspace.overview")[0]!.result;
    const project = fixturesFor("project.overview")[0]!.result;
    const workspaceDocument = workspace.documents.items[0]!;
    const directDocument = project.documents.items.find((document) => document.projectId === project.project.id)!;
    const { currentRevision, ...shownDocument } = shown;

    expect.soft(project.documents.items.map(({ id }) => id)).toEqual([shown.id, workspaceDocument.id]);
    expect.soft(project.documents.items).toContainEqual({ ...workspaceDocument, binding: null });
    expect.soft(directDocument).toEqual({
      ...shownDocument,
      binding: {
        ownerType: "project",
        ownerId: project.project.id,
        role: "brief",
        documentId: shown.id,
        boundRevisionId: currentRevision.parentRevisionId,
        currentHeadRevisionId: shown.currentRevisionId,
        hasNewerHead: true,
      },
    });
    expect.soft(search.documentId).toBe(shown.id);
    expect.soft(search.revisionId).toBe(shown.currentRevisionId);
    expect.soft(search.parentRevisionId).toBe(currentRevision.parentRevisionId);
    expect.soft(currentRevision.documentId).toBe(shown.id);
    expect.soft(currentRevision.iterationId).toBe(project.iterations.items[0]!.id);
    expect.soft(revised.documentId).toBe(shown.id);
    expect.soft(revised.parentRevisionId).toBe(shown.currentRevisionId);
    expect.soft(revised.iterationId).toBe(project.iterations.items[0]!.id);
    expect.soft(project.feedback.items[0]!.iterationId).toBe(project.iterations.items[0]!.id);

    const documentIdentities = new Map<string, unknown>();
    for (const document of [shownDocument, workspaceDocument, ...project.documents.items]) {
      const identity = {
        workspaceId: document.workspaceId,
        projectId: document.projectId,
        slug: document.slug,
        title: document.title,
        kind: document.kind,
        currentRevisionId: document.currentRevisionId,
      };
      const previous = documentIdentities.get(document.id);
      if (previous) expect.soft(identity).toEqual(previous);
      else documentIdentities.set(document.id, identity);
    }

    const revisionOwners = new Map<string, string>();
    const revisions = [
      { id: search.revisionId, documentId: search.documentId },
      { id: search.parentRevisionId!, documentId: search.documentId },
      { id: currentRevision.id, documentId: currentRevision.documentId },
      { id: currentRevision.parentRevisionId!, documentId: currentRevision.documentId },
      { id: revised.id, documentId: revised.documentId },
      { id: revised.parentRevisionId!, documentId: revised.documentId },
      { id: workspaceDocument.currentRevisionId!, documentId: workspaceDocument.id },
      { id: directDocument.binding!.boundRevisionId, documentId: directDocument.id },
      { id: directDocument.binding!.currentHeadRevisionId!, documentId: directDocument.id },
      { id: project.feedback.items[0]!.targetId, documentId: directDocument.id },
    ];
    for (const revision of revisions) {
      const previous = revisionOwners.get(revision.id);
      if (previous) expect.soft(revision.documentId).toBe(previous);
      else revisionOwners.set(revision.id, revision.documentId);
    }

    const { purpose: _purpose, ...projectSummary } = project.project;
    expect.soft(projectSummary).toEqual(workspace.projects.items[0]);
    const workspaceUnit = workspace.units.items[0]!;
    const projectUnit = project.units.items[0]!;
    const account = workspace.accounts.items[0]!;
    expect.soft(workspaceUnit.id).not.toBe(projectUnit.id);
    expect.soft(workspaceUnit).toMatchObject({ workspaceId: workspace.workspace.id, projectId: null });
    expect.soft(projectUnit).toMatchObject({ workspaceId: workspace.workspace.id, projectId: project.project.id });
    expect.soft(workspace.publications.items[0]!.unitId).toBe(workspaceUnit.id);
    expect.soft(project.publications.items[0]!.unitId).toBe(projectUnit.id);
    expect.soft(workspace.publications.items[0]!.socialAccountId).toBe(account.id);
    expect.soft(project.publications.items[0]!.socialAccountId).toBe(account.id);
    expect.soft(workspace.activity.items).toEqual(project.activity.items);
    expect.soft(fixturesFor("activity.list")[0]!.result.items).toEqual(workspace.activity.items);
    expect.soft(project.stages.items[0]!.entityId).toBe(project.compositions.items[0]!.id);
    expect.soft(project.builds.items[0]!.compositionRevisionId).toBe(project.compositions.items[0]!.selectedRevisionId);
    expect.soft(project.compositions.items[0]!.selectedRevisionId).toBe(project.compositions.items[0]!.latestRevisionId);
    expect.soft(project.builds.items[0]!.runId).toBe(project.runs.items[0]!.id);

    const media = fixturesFor("media.list");
    const projectMedia = media.flatMap((fixture) => fixture.result.items);
    const workspaceMedia = workspace.sharedMedia.items[0]!;
    const runObject = fixturesFor("run.objects")[0]!.result.items[0]!;
    expect.soft(new Set(projectMedia.map(({ ref }) => ref.id)).size).toBe(project.mediaCounts.artifacts);
    expect.soft(projectMedia.map(({ projectId }) => projectId)).toEqual([project.project.id, project.project.id]);
    expect.soft(projectMedia[0]!.ref.id).not.toBe(workspaceMedia.ref.id);
    expect.soft(workspaceMedia).toMatchObject({ workspaceId: workspace.workspace.id, projectId: null });
    for (const card of [workspaceMedia, ...projectMedia]) {
      expect.soft(card.target).toEqual({ type: "object", id: card.selectedObjectId });
    }
    expect.soft(projectMedia[0]!.selectedObjectId).toBe(runObject.objectId);
    expect.soft(runObject.runId).toBe(project.runs.items[0]!.id);
    expect.soft(runObject.projectId).toBe(project.project.id);

    const subscription = fixturesFor("activity.subscribe")[0]!;
    const unsubscription = fixturesFor("activity.unsubscribe")[0]!;
    expect.soft(subscription.result.subscriptionId).toBe(subscription.params.subscriptionId);
    expect.soft(unsubscription.params.subscriptionId).toBe(subscription.result.subscriptionId);
    expect.soft(unsubscription.result.subscriptionId).toBe(subscription.result.subscriptionId);
  });

  test("uses only current-Core store and cursor encodings and round-trips the Media cursor", () => {
    expect(currentCoreStoreId).toMatch(/^store_[0-9a-f]{32}$/);
    const nonNullCursors = currentCoreFixtures
      .flatMap(({ result }) => nestedValuesForKey(result, "nextCursor"))
      .filter((cursor) => cursor !== null);
    expect(nonNullCursors).toEqual([firstMediaCursor]);

    const [family, payload, extra] = firstMediaCursor.split(".");
    expect(extra).toBeUndefined();
    expect(family).toBe("c1");
    const decoded = JSON.parse(Buffer.from(payload!, "base64url").toString("utf8"));
    expect(decoded).toEqual([4, "art_prj_1"]);
    expect(`${family}.${Buffer.from(JSON.stringify(decoded)).toString("base64url")}`).toBe(firstMediaCursor);

    const media = fixturesFor("media.list");
    expect(media[0]!.result.nextCursor).toBe(firstMediaCursor);
    expect("after" in media[1]!.params && media[1]!.params.after).toBe(media[0]!.result.nextCursor);
  });

  test("round-trips the exact current Document requests, DTOs, and revise payload", async () => {
    const client = new RalphyBridgeClient({ bin: fixtureBin, root: "/fixture-root" });
    await client.start();
    try {
      const context = { workspaceId: "ws_1", projectId: "prj_1" };
      const timeout = new Promise<"fixture-timeout">((resolve) => setTimeout(() => resolve("fixture-timeout"), 100));
      const search = await Promise.race([client.request("document.search", { context, query: "launch", limit: 50 }), timeout]);
      expect(search).toEqual({
        items: [{ documentId: "doc_1", revisionId: "drev_3", workspaceId: "ws_1", projectId: "prj_1", kind: "brief", slug: "launch", documentTitle: "Launch", revisionNo: 3, parentRevisionId: "drev_2", iterationId: "iter_1", format: "markdown", title: "Launch v3", authoredBySessionId: "session_1", createdAt: 3 }],
        nextCursor: null,
      });
      await expect(client.request("document.show", { context, documentId: "doc_1" })).resolves.toEqual({
        id: "doc_1", workspaceId: "ws_1", projectId: "prj_1", kind: "brief", slug: "launch", title: "Launch", currentRevisionId: "drev_3", rowVersion: 3, createdAt: 1, updatedAt: 3,
        currentRevision: { id: "drev_3", documentId: "doc_1", revisionNo: 3, parentRevisionId: "drev_2", iterationId: "iter_1", format: "markdown", title: "Launch v3", authoredBySessionId: "session_1", createdAt: 3 },
      });
      await expect(client.request("document.content", { context, revisionId: "drev_3", afterByte: 0, limitBytes: 65_536 })).resolves.toEqual({ revisionId: "drev_3", format: "markdown", text: "# Launch", nextByte: null });
      await expect(client.request("document.revise", { context, documentId: "doc_1", expectedHeadId: "drev_3", iterationId: "iter_1", format: "json", title: "Launch v4", body: { approved: true } })).resolves.toEqual({ id: "drev_4", documentId: "doc_1", revisionNo: 4, parentRevisionId: "drev_3", iterationId: "iter_1", format: "json", title: "Launch v4", authoredBySessionId: null, createdAt: 4 });
    } finally {
      await client.close();
    }
  });

  test("round-trips the exact current overview, Media, Run Object, and activity requests", async () => {
    const client = new RalphyBridgeClient({ bin: fixtureBin, root: "/fixture-root" });
    await client.start();
    try {
      const workspaceSections = {
        documents: { limit: 5 },
        units: { limit: 5 },
        accounts: { limit: 5 },
        projects: { limit: 5 },
        activity: { afterSequence: 0, limit: 10 },
        sharedMedia: { limit: 5 },
        publications: { limit: 5 },
        metrics: true as const,
      };
      const projectSections = {
        documents: { limit: 5 },
        iterations: { limit: 5 },
        feedback: { limit: 5 },
        stages: { limit: 5 },
        compositions: { limit: 5 },
        builds: { limit: 5 },
        units: { limit: 5 },
        runs: { limit: 5 },
        activity: { afterSequence: 0, limit: 10 },
        mediaCounts: true as const,
        publications: { limit: 5 },
        metrics: true as const,
      };

      const workspace = await client.request("workspace.overview", {
        context: { workspaceId: "ws_1" }, workspaceId: "ws_1", sections: workspaceSections,
      });
      expect(Object.keys(workspace)).toEqual([
        "workspace", "documents", "units", "accounts", "projects", "activity", "sharedMedia", "publications", "metrics",
      ]);
      expect(Object.keys(workspace.workspace)).toEqual([
        "id", "slug", "name", "rowVersion", "createdAt", "updatedAt",
      ]);
      expect(Object.keys(workspace.documents!.items[0]!)).toEqual([
        "id", "workspaceId", "projectId", "slug", "title", "kind", "currentRevisionId", "rowVersion", "createdAt", "updatedAt",
      ]);
      expect(Object.keys(workspace.units!.items[0]!)).toEqual([
        "id", "workspaceId", "projectId", "slug", "format", "latestRevisionId", "selectedRevisionId", "createdAt", "updatedAt",
      ]);
      expect(Object.keys(workspace.accounts!.items[0]!)).toEqual([
        "id", "workspaceId", "platform", "externalId", "displayName", "username", "credentialConfigured", "credentialSource", "relinkRequired", "rowVersion", "createdAt", "updatedAt",
      ]);
      expect(Object.keys(workspace.projects!.items[0]!)).toEqual([
        "id", "workspaceId", "slug", "name", "state", "rowVersion", "createdAt", "updatedAt",
      ]);
      expect(Object.keys(workspace.activity!.items[0]!)).toEqual([
        "sequence", "workspaceId", "projectId", "entityType", "entityId", "action", "createdAt",
      ]);
      expect(Object.keys(workspace.sharedMedia!.items[0]!)).toEqual([
        "ref", "workspaceId", "projectId", "slug", "kind", "selectedRevisionId", "selectedState", "mime", "bytes", "selectedAt", "revisionCount", "selectedObjectId", "storageClass", "usageRoles", "target", "mediaKind", "provenance",
      ]);
      expect(Object.keys(workspace.publications!.items[0]!)).toEqual([
        "id", "unitId", "presentationId", "platform", "socialAccountId", "rail", "state", "url", "scheduledAt", "submittedAt", "publishedAt", "createdAt", "updatedAt",
      ]);
      expect(Object.keys(workspace.metrics!)).toEqual([
        "publicationCount", "views", "likes", "comments", "shares", "watchTimeMs",
      ]);
      const project = await client.request("project.overview", {
        context: { workspaceId: "ws_1", projectId: "prj_1" }, projectId: "prj_1", sections: projectSections,
      });
      expect(Object.keys(project)).toEqual([
        "project", "spendUsd", "documents", "iterations", "feedback", "stages", "compositions", "builds", "units", "runs", "activity", "mediaCounts", "publications", "metrics",
      ]);
      expect(project.spendUsd).toBe(3.84);
      expect(Object.keys(project.project)).toEqual([
        "id", "workspaceId", "slug", "name", "state", "rowVersion", "createdAt", "updatedAt", "purpose",
      ]);
      expect(Object.keys(project.documents!.items[0]!)).toEqual([
        "id", "workspaceId", "projectId", "slug", "title", "kind", "currentRevisionId", "rowVersion", "createdAt", "updatedAt", "binding",
      ]);
      expect(Object.keys(project.documents!.items[0]!.binding!)).toEqual([
        "ownerType", "ownerId", "role", "documentId", "boundRevisionId", "currentHeadRevisionId", "hasNewerHead",
      ]);
      expect(Object.keys(project.iterations!.items[0]!)).toEqual([
        "id", "projectId", "number", "title", "state", "priorIterationChanges", "createdAt", "closedAt",
      ]);
      expect(Object.keys(project.feedback!.items[0]!)).toEqual([
        "id", "projectId", "iterationId", "status", "targetType", "targetId", "createdAt", "resolvedAt",
      ]);
      expect(Object.keys(project.stages!.items[0]!)).toEqual([
        "id", "projectId", "stage", "state", "entityType", "entityId", "rowVersion", "updatedAt",
      ]);
      expect(Object.keys(project.compositions!.items[0]!)).toEqual([
        "id", "projectId", "slug", "kind", "latestRevisionId", "selectedRevisionId", "createdAt", "updatedAt",
      ]);
      expect(Object.keys(project.builds!.items[0]!)).toEqual([
        "id", "compositionRevisionId", "runId", "state", "createdAt", "finishedAt",
      ]);
      expect(Object.keys(project.units!.items[0]!)).toEqual([
        "id", "workspaceId", "projectId", "slug", "format", "latestRevisionId", "selectedRevisionId", "createdAt", "updatedAt",
      ]);
      expect(Object.keys(project.runs!.items[0]!)).toEqual([
        "id", "workspaceId", "projectId", "kind", "label", "state", "createdAt", "startedAt", "endedAt",
      ]);
      expect(Object.keys(project.activity!.items[0]!)).toEqual([
        "sequence", "workspaceId", "projectId", "entityType", "entityId", "action", "createdAt",
      ]);
      expect(Object.keys(project.mediaCounts!)).toEqual(["artifacts", "objects", "runObjects"]);
      expect(Object.keys(project.publications!.items[0]!)).toEqual([
        "id", "unitId", "presentationId", "platform", "socialAccountId", "rail", "state", "url", "scheduledAt", "submittedAt", "publishedAt", "createdAt", "updatedAt",
      ]);
      expect(Object.keys(project.metrics!)).toEqual([
        "publicationCount", "views", "likes", "comments", "shares", "watchTimeMs",
      ]);
      const workspaceUnit = workspace.units!.items[0]!;
      const projectUnit = project.units!.items[0]!;
      const workspacePublication = workspace.publications!.items[0]!;
      const projectPublication = project.publications!.items[0]!;
      expect(projectUnit.id).not.toBe(workspaceUnit.id);
      expect(projectPublication.id).not.toBe(workspacePublication.id);
      expect(workspacePublication.unitId).toBe(workspaceUnit.id);
      expect(projectPublication.unitId).toBe(projectUnit.id);
      expect(workspace.activity!.items).toEqual(project.activity!.items);
      expect(workspace.activity!.items).toHaveLength(2);
      expect(workspace.activity!.items[0]).toMatchObject({ sequence: 7, projectId: null });
      expect(workspace.activity!.items[1]).toMatchObject({ sequence: 8, projectId: "prj_1" });
      expect.soft(workspace.units!.nextCursor).toBeNull();
      expect.soft(workspace.activity!.nextCursor).toBeNull();
      expect.soft(project.activity!.nextCursor).toBeNull();
      const firstProjectMedia = await client.request("media.list", {
        context: { workspaceId: "ws_1", projectId: "prj_1" }, limit: 1, filter: "references", types: ["artifact"],
      });
      expect(firstProjectMedia).toMatchObject({ nextCursor: firstMediaCursor });
      expect(firstProjectMedia.items[0]).toMatchObject({ projectId: "prj_1" });
      expect(firstProjectMedia.items[0]!.ref.id).not.toBe(workspace.sharedMedia!.items[0]!.ref.id);
      const shownMedia = await Promise.all([
        client.request("media.show", {
          context: { workspaceId: "ws_1", projectId: "prj_1" }, ref: { type: "artifact", id: "art_prj_1" },
        }),
        client.request("media.show", {
          context: { workspaceId: "ws_1", projectId: "prj_1" }, ref: { type: "run-object", id: "robj_1" },
        }),
        client.request("media.show", {
          context: { workspaceId: "ws_1", projectId: "prj_1" }, ref: { type: "object", id: "obj_prj_1" },
        }),
      ]);
      expect(shownMedia.map(({ mediaKind, provenance }) => ({ mediaKind, provenance }))).toEqual([
        { mediaKind: "image", provenance: "generation" },
        { mediaKind: "video", provenance: "generation" },
        { mediaKind: "video", provenance: "generation" },
      ]);
      expect(Object.keys(shownMedia[0]!)).toEqual([
        "ref", "workspaceId", "projectId", "slug", "kind", "selectedRevisionId", "selectedState", "mime", "bytes", "selectedAt", "revisionCount", "selectedObjectId", "storageClass", "usageRoles", "target", "mediaKind", "provenance",
      ]);
      expect(Object.keys(shownMedia[1]!)).toEqual([
        "ref", "workspaceId", "projectId", "runId", "purpose", "state", "retention", "mime", "bytes", "createdAt", "objectId", "logicalPath", "locationClass", "attemptId", "attemptNo", "target", "mediaKind", "provenance",
      ]);
      expect(Object.keys(shownMedia[2]!)).toEqual([
        "ref", "workspaceId", "projectId", "storageClass", "mime", "bytes", "createdAt", "referenceCount", "target", "mediaKind", "provenance",
      ]);
      await expect(client.request("media.list", {
        context: { workspaceId: "ws_1", projectId: "prj_1" }, after: firstProjectMedia.nextCursor!, limit: 1, filter: "references", types: ["artifact"],
      })).resolves.toMatchObject({ nextCursor: null });
      const runObjects = await client.request("run.objects", {
        context: { workspaceId: "ws_1", projectId: "prj_1" }, runId: "run_1", limit: 5,
      });
      expect(runObjects).toEqual({
        items: [expect.objectContaining({
          id: "robj_1", logicalPath: "outputs/final.mp4", locationClass: "other", attemptId: null, attemptNo: null,
        })],
        nextCursor: null,
      });
      expect(Object.keys(runObjects.items[0]!)).toEqual([
        "id", "workspaceId", "projectId", "runId", "objectId", "purpose", "state", "retention", "mime", "bytes", "logicalPath", "locationClass", "attemptId", "attemptNo", "createdAt",
      ]);
      for (const value of [workspace, project, runObjects]) {
        const keys = nestedKeys(value);
        for (const forbidden of [
          "path", "absolutePath", "hash", "metadata", "credential", "value", "providerRequest", "providerResponse", "providerError",
        ]) expect(keys).not.toContain(forbidden);
      }
      const catchup = await client.request("activity.list", { afterSequence: 6, limit: 10 });
      expect(catchup).toEqual({ items: workspace.activity!.items, nextCursor: null });

      const event = new Promise((resolve) => client.onEvent(resolve));
      await expect(client.request("activity.subscribe", {
        subscriptionId: "sub_1", afterSequence: 7,
      })).resolves.toEqual({ subscriptionId: "sub_1", sequence: 7 });
      await expect(event).resolves.toMatchObject({
        event: "activity",
        subscriptionId: "sub_1",
        sequence: 8,
        data: workspace.activity!.items[1],
      });
      await expect(client.request("activity.unsubscribe", { subscriptionId: "sub_1" })).resolves.toEqual({
        subscriptionId: "sub_1", unsubscribed: true,
      });

      await expect(client.request("workspace.overview", {
        context: { workspaceId: "ws_1" }, workspaceId: "ws_1", sections: { ...workspaceSections, metrics: undefined },
      } as never)).rejects.toMatchObject({ code: "E_FIXTURE" });
    } finally {
      await client.close();
    }
  });

  test("round-trips the exact generation-detail and null-aware Artifact selection contracts", async () => {
    const client = new RalphyBridgeClient({ bin: fixtureBin, root: "/fixture-root" });
    await client.start();
    try {
      const context = { workspaceId: "ws_1", projectId: "prj_1" };
      const detail = await client.request("media.generation.show", {
        context,
        target: { type: "artifact-revision", id: "arev_prj_1" },
        limit: 20,
      });
      expect(detail).toEqual(fixturesFor("media.generation.show")[0]!.result);
      expect(Object.keys(detail)).toEqual(["status", "target", "run", "attempts", "cost"]);
      expect(Object.keys(detail.attempts.items[0]!)).toEqual([
        "id", "runId", "attemptNo", "provider", "model", "state", "costUsd", "startedAt", "endedAt", "input",
      ]);
      for (const hidden of ["path", "absolutePath", "request", "response", "error", "metadata", "credential", "externalId", "voiceId"]) {
        expect(nestedKeys(detail)).not.toContain(hidden);
      }
      await expect(client.request("media.revisions", {
        context, ref: { type: "artifact", id: "art_prj_1" }, limit: 50,
      })).resolves.toEqual(fixturesFor("media.revisions")[0]!.result);
      expect(Object.keys(fixturesFor("media.revisions")[0]!.result.items[0]!)).toEqual([
        "id", "artifactId", "objectId", "revisionNo", "parentRevisionId", "iterationId",
        "state", "authoredBySessionId", "createdAt",
      ]);
      await expect(client.request("media.select", {
        context,
        ref: { type: "artifact", id: "art_prj_1" },
        revisionId: "arev_prj_1",
        expectedSelectedRevisionId: null,
      })).resolves.toEqual(fixturesFor("media.select")[0]!.result);
    } finally {
      await client.close();
    }
  });

  test("unit workbench round-trips the frozen newest-page and nullable-CAS contract", async () => {
    const client = new RalphyBridgeClient({ bin: fixtureBin, root: "/fixture-root" });
    await client.start();
    try {
      const context = { workspaceId: "ws_1", projectId: "prj_1" };
      const unit = await client.request("unit.show", { context, unitId: "unit_prj_1" });
      const revision = await client.request("unit.revision.show", { context, revisionId: "urev_prj_1" });
      const revisions = await client.request("unit.revisions", {
        context, unitId: "unit_prj_1", order: "newest", limit: 50,
      });
      const items = await client.request("unit.items", { context, revisionId: "urev_prj_1", limit: 50 });
      const presentations = await client.request("unit.presentations", { context, revisionId: "urev_prj_1", limit: 50 });
      const selected = await client.request("unit.select", {
        context, unitId: "unit_prj_1", revisionId: "urev_prj_1", expectedSelectedRevisionId: null,
      });

      expect(unit).toEqual(fixturesFor("unit.show")[0]!.result);
      expect(revision).toEqual(revisions.items[0]);
      expect(items.items[0]).toMatchObject({ unitRevisionId: revision.id, position: 0 });
      expect(presentations.items[0]).toMatchObject({ unitRevisionId: revision.id, platform: "tiktok" });
      expect(selected.selectedRevisionId).toBe(revision.id);
      expect(Object.keys(revision)).toEqual([
        "id", "unitId", "revisionNo", "parentRevisionId", "iterationId", "note",
        "authoredBySessionId", "createdAt", "sealedAt",
      ]);
      await expect(client.request("unit.items", {
        context, revisionId: "urev_prj_1", order: "newest", limit: 50,
      } as never)).rejects.toMatchObject({ code: "E_FIXTURE" });
      await expect(client.request("unit.revisions", {
        context, unitId: "unit_prj_1", order: "sideways", limit: 50,
      } as never)).rejects.toMatchObject({ code: "E_FIXTURE" });
    } finally {
      await client.close();
    }
  });

  const exactCoreBin = process.env.RALPHY_CORE_BIN;
  const exactCoreRoot = process.env.RALPHY_CORE_TEST_ROOT;
  (exactCoreBin && exactCoreRoot ? test : test.skip)(
    "handshakes with the explicit locally built Core binary",
    async () => {
      const client = new RalphyBridgeClient({
        bin: exactCoreBin!,
        root: exactCoreRoot!,
      });
      const hello = await client.start();
      expect(hello.capabilities).toEqual([...currentCoreCapabilities]);
      await client.close();
    },
  );
});
