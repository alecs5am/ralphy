import { describe, expect, test } from "vitest";

import type { BuildDto, CompositionRevisionDto, UnitDto, UnitRevisionDto } from "../electron/ralphy/types";
import { unitLifecycle } from "../src/lib/unit-lifecycle";

const unit: UnitDto = { id: "unit-1", workspaceId: "ws-1", projectId: "project-1", compositionId: "composition-1", slug: "launch", format: "video", latestRevisionId: "revision-1", selectedRevisionId: null, createdAt: 1, updatedAt: 1 };
const revision: UnitRevisionDto = { id: "revision-1", unitId: unit.id, compositionRevisionId: "composition-revision-1", revisionNo: 1, parentRevisionId: null, iterationId: null, note: null, authoredBySessionId: null, createdAt: 1, sealedAt: 1 };
const production: CompositionRevisionDto = { id: "composition-revision-1", compositionId: "composition-1", revisionNo: 1, parentRevisionId: null, iterationId: null, state: "draft", engine: "hyperframes", engineVersion: null, manifestSha256: null, authoredBySessionId: null, createdAt: 1, sealedAt: null };
const build = (state: BuildDto["state"]): BuildDto => ({ id: `build-${state}`, compositionRevisionId: production.id, runId: "run-1", state, createdAt: 2, finishedAt: state === "running" ? null : 3 });

describe("Unit lifecycle", () => {
  test("keeps selection, render, failure, readiness, and publication distinct", () => {
    expect(unitLifecycle({ unit, revision, compositionRevision: production }).label).toBe("In progress");
    const selected = { ...unit, selectedRevisionId: revision.id };
    expect(unitLifecycle({ unit: selected, revision, compositionRevision: production })).toMatchObject({ label: "Selected", action: "render" });
    expect(unitLifecycle({ unit: selected, revision, compositionRevision: production, builds: [build("running")] }).label).toBe("Rendering");
    expect(unitLifecycle({ unit: selected, revision, compositionRevision: production, builds: [build("failed")] })).toMatchObject({ label: "Render failed", action: "retry" });
    expect(unitLifecycle({ unit: selected, revision, compositionRevision: { ...production, state: "sealed", sealedAt: 2, manifestSha256: "a".repeat(64) }, builds: [build("succeeded")] }).label).toBe("Ready");
    const publication = { id: "publication-1", unitId: unit.id, presentationId: "presentation-1", platform: "tiktok", socialAccountId: null, rail: "manual", state: "published" as const, url: null, scheduledAt: null, submittedAt: 3, publishedAt: 4, createdAt: 3, updatedAt: 4 };
    expect(unitLifecycle({ unit: selected, revision, publications: [publication] }).label).toBe("Published");
    expect(unitLifecycle({ unit: { ...selected, selectedRevisionId: "revision-2" }, revision, publications: [publication] })).toMatchObject({ label: "Published", action: "select" });
  });

  test("treats a scheduled publication as its own lifecycle step", () => {
    const publication = { id: "publication-1", unitId: unit.id, presentationId: "presentation-1", platform: "youtube", socialAccountId: null, rail: "manual", state: "scheduled" as const, url: null, scheduledAt: 2_000_000_000, submittedAt: null, publishedAt: null, createdAt: 3, updatedAt: 4 };
    expect(unitLifecycle({ unit, revision, publications: [publication] })).toMatchObject({ label: "Scheduled", tone: "warn", action: "none" });
  });
});
