import type { BuildDto, CompositionRevisionDto, OverviewPublicationDto, UnitDto, UnitRevisionDto } from "../../electron/ralphy/types";

export type UnitLifecycleAction = "none" | "select" | "render" | "retry";

export type UnitLifecycle = {
  label: "In progress" | "Preview ready" | "Selected" | "Rendering" | "Render failed" | "Ready" | "Scheduled" | "Published";
  tone: "idle" | "warn" | "danger" | "ok";
  action: UnitLifecycleAction;
};

export function unitLifecycle(input: {
  unit: UnitDto;
  revision?: UnitRevisionDto | null;
  compositionRevision?: CompositionRevisionDto | null;
  builds?: BuildDto[];
  publications?: OverviewPublicationDto[];
}): UnitLifecycle {
  const { unit, revision = null, compositionRevision = null, builds = [], publications = [] } = input;
  if (publications.some((item) => item.unitId === unit.id && item.state === "published")) {
    return { label: "Published", tone: "ok", action: revision && revision.id !== unit.selectedRevisionId && revision.sealedAt !== null ? "select" : "none" };
  }
  if (publications.some((item) => item.unitId === unit.id && item.state === "scheduled")) {
    return { label: "Scheduled", tone: "warn", action: "none" };
  }
  const latestBuild = [...builds].sort((left, right) => right.createdAt - left.createdAt)[0];
  if (latestBuild?.state === "pending" || latestBuild?.state === "running") {
    return { label: "Rendering", tone: "warn", action: "none" };
  }
  if (latestBuild?.state === "failed" || latestBuild?.state === "cancelled") {
    return { label: "Render failed", tone: "danger", action: "retry" };
  }
  if (!revision) {
    if (!unit.latestRevisionId) return { label: "In progress", tone: "idle", action: "none" };
    return unit.selectedRevisionId
      ? { label: "Selected", tone: "warn", action: "none" }
      : { label: "Preview ready", tone: "ok", action: "none" };
  }
  const selected = !!revision && revision.id === unit.selectedRevisionId;
  if (selected && (latestBuild?.state === "succeeded" || (compositionRevision === null && revision.sealedAt !== null))) {
    return { label: "Ready", tone: "ok", action: "none" };
  }
  if (selected) return { label: "Selected", tone: "warn", action: compositionRevision?.state === "draft" ? "render" : "none" };
  if (revision.sealedAt === null || compositionRevision?.state === "draft") {
    return { label: "In progress", tone: "idle", action: revision?.sealedAt === null ? "none" : "select" };
  }
  return { label: "Preview ready", tone: "ok", action: "select" };
}
