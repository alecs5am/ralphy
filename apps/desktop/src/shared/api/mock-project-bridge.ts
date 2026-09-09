/**
 * The project route's mock answers.
 *
 * This is the one route the mock bridge has to answer rather than refuse: the view panel opens a
 * project tab whenever the route lands on one, so a refusal here is a whole tab that cannot draw.
 */
import type { RalphyBridge } from "./ipc";
import { mockProjects } from "./mock-fixtures";

export function mockProjectSurfaces(): Pick<RalphyBridge, "loadProjectOverview" | "loadProjectPage" | "loadProjectActivityRun" | "loadProjectMediaCard" | "loadProjectGeneration" | "loadProjectMediaRevisions" | "selectProjectMediaRevision" | "performProjectMediaAction" | "loadDocumentPreview" | "searchProjectDocuments" | "showProjectDocument" | "reviseProjectDocument" | "resolveProjectPreview" | "loadProjectComposition" | "loadProjectCompositionRevision" | "loadProjectCompositionBuild" | "loadProjectCompositionPage" | "reviseProjectComposition" | "selectProjectCompositionRevision" | "buildProjectComposition" | "resolveCompositionOutputPreview" | "loadProjectUnit" | "loadProjectUnitRevision" | "loadProjectUnitPage" | "loadProjectUnitPreview" | "selectProjectUnitRevision"> {
  return {
    /* The project route is the one place the mock bridge has to answer rather than refuse: the view
       panel opens a project tab whenever the route lands on one, so a refusal here is not a missing
       fixture in a corner of the app, it is a whole tab that cannot draw. The overview is built from
       the catalog's own project so the header states the same name and spend the rest of the mock
       does, and every page comes back empty -- the screen's empty states are real states, and an
       invented iteration history would be a worse answer than none. */
    async loadProjectOverview(project) {
      const summary = mockProjects.find((candidate) =>
        candidate.workspaceId === project.workspaceId && candidate.projectId === project.projectId);
      if (!summary) throw new Error(`No mock project for ${project.workspaceId}/${project.projectId}`);
      const updatedAt = Date.parse(summary.recentActivity);
      return {
        project: {
          id: summary.projectId, workspaceId: summary.workspaceId, slug: summary.projectId,
          name: summary.name, purpose: summary.brief, state: "active", rowVersion: 1,
          createdAt: updatedAt, updatedAt,
        },
        spendUsd: summary.spendUsd ?? 0,
        mediaCounts: { artifacts: summary.finalCount, objects: summary.sharedCount, runObjects: 0 },
      };
    },
    async loadProjectPage() {
      return { items: [], nextCursor: null };
    },
    async loadProjectActivityRun() {
      throw new Error("Project domain reader is unavailable in mock mode");
    },
    async loadProjectMediaCard() {
      throw new Error("Project domain reader is unavailable in mock mode");
    },
    async loadProjectGeneration() {
      throw new Error("Project domain reader is unavailable in mock mode");
    },
    async loadProjectMediaRevisions() {
      return { items: [], nextCursor: null };
    },
    async selectProjectMediaRevision() {
      throw new Error("Project domain reader is unavailable in mock mode");
    },
    async performProjectMediaAction() {
      throw new Error("Project media actions are unavailable in mock mode");
    },
    async loadDocumentPreview() {
      throw new Error("Project domain reader is unavailable in mock mode");
    },
    async searchProjectDocuments() {
      return { items: [], nextCursor: null };
    },
    async showProjectDocument() {
      throw new Error("Project domain reader is unavailable in mock mode");
    },
    async reviseProjectDocument() {
      throw new Error("Project domain reader is unavailable in mock mode");
    },
    async resolveProjectPreview() {
      return null;
    },
    async loadProjectComposition() {
      throw new Error("Composition reader is unavailable in mock mode");
    },
    async loadProjectCompositionRevision() {
      throw new Error("Composition reader is unavailable in mock mode");
    },
    async loadProjectCompositionBuild() {
      throw new Error("Composition reader is unavailable in mock mode");
    },
    async loadProjectCompositionPage() {
      throw new Error("Composition reader is unavailable in mock mode");
    },
    async reviseProjectComposition() {
      throw new Error("Composition mutations are unavailable in mock mode");
    },
    async selectProjectCompositionRevision() {
      throw new Error("Composition mutations are unavailable in mock mode");
    },
    async buildProjectComposition() {
      throw new Error("Composition builds are unavailable in mock mode");
    },
    async resolveCompositionOutputPreview() {
      throw new Error("Composition previews are unavailable in mock mode");
    },
    async loadProjectUnit() {
      throw new Error("Unit reader is unavailable in mock mode");
    },
    async loadProjectUnitRevision() {
      throw new Error("Unit reader is unavailable in mock mode");
    },
    async loadProjectUnitPage() {
      throw new Error("Unit reader is unavailable in mock mode");
    },
    async loadProjectUnitPreview() {
      throw new Error("Unit preview is unavailable in mock mode");
    },
    async selectProjectUnitRevision() {
      throw new Error("Unit mutations are unavailable in mock mode");
    }
  };
}
