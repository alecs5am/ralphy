import fs from "node:fs";
import path from "node:path";
import { setRoot } from "../../cli/lib/paths.js";
import { createDocument, reviseDocument } from "../../cli/lib/store/documents.js";
import { closeDomainDb, openDomainDb } from "../../cli/lib/store/db.js";
import { createProject, createWorkspace, updateProjectStage } from "../../cli/lib/store/scopes.js";

export type DomainContractProject = { workspaceId: string; projectId: string };

export function ensureDomainContractProject(
  root: string,
  slug: string,
  kind: "video" | "image-pack" = "video",
  workspaceSlug = "default",
): DomainContractProject {
  setRoot(root);
  fs.mkdirSync(path.join(root, ".ralphy"), { recursive: true });
  const db = openDomainDb();
  let workspace = db
    .query<{ id: string }, [string]>("SELECT id FROM workspaces WHERE slug = ?")
    .get(workspaceSlug);
  if (!workspace) workspace = createWorkspace({ slug: workspaceSlug, name: workspaceSlug });
  let project = db
    .query<{ id: string }, [string, string, string]>(
      "SELECT id FROM projects WHERE workspace_id = ? AND (id = ? OR slug = ?)",
    )
    .get(workspace.id, slug, slug);
  if (!project) {
    project = createProject({
      workspaceId: workspace.id,
      slug,
      name: slug,
      metadata: { kind },
    });
  }
  closeDomainDb();
  return { workspaceId: workspace.id, projectId: project.id };
}

export function setDomainContractStage(
  root: string,
  slug: string,
  stage: string,
  state = "complete",
  workspaceSlug = "default",
): DomainContractProject {
  return setDomainContractDocumentStage(
    root,
    slug,
    stage,
    {},
    state,
    "video",
    workspaceSlug,
  );
}

export function setDomainContractProjectKind(
  root: string,
  slug: string,
  kind: "video" | "image-pack",
  workspaceSlug = "default",
): DomainContractProject {
  const project = ensureDomainContractProject(root, slug, "video", workspaceSlug);
  setRoot(root);
  const db = openDomainDb();
  db.prepare("UPDATE projects SET metadata_json = ?, updated_at = ? WHERE id = ?").run(
    JSON.stringify({ kind }),
    Date.now(),
    project.projectId,
  );
  closeDomainDb();
  return project;
}

export function setDomainContractDocumentStage(
  root: string,
  slug: string,
  stage: string,
  body: unknown,
  state = "complete",
  kind: "video" | "image-pack" = "video",
  workspaceSlug = "default",
): DomainContractProject {
  const project = ensureDomainContractProject(root, slug, kind, workspaceSlug);
  setRoot(root);
  const db = openDomainDb();
  const existingDocument = db
    .query<{ id: string; currentRevisionId: string | null }, [string, string]>(
      "SELECT id, current_revision_id AS currentRevisionId FROM documents WHERE project_id = ? AND slug = ?",
    )
    .get(project.projectId, `contract-${stage}`);
  const document = existingDocument
    ? existingDocument
    : createDocument({
        projectId: project.projectId,
    kind: "custom",
        slug: `contract-${stage}`,
        title: `Contract ${stage}`,
      });
  const revision = reviseDocument({
    documentId: document.id,
    expectedHeadId: document.currentRevisionId,
    format: "json",
    body,
  });
  const existingStage = db
    .query<{ rowVersion: number }, [string, string]>(
      "SELECT row_version AS rowVersion FROM project_stages WHERE project_id = ? AND stage = ?",
    )
    .get(project.projectId, stage);
  updateProjectStage({
    projectId: project.projectId,
    stage,
    state,
    entityType: "document_revision",
    entityId: revision.id,
    expectedRowVersion: existingStage?.rowVersion ?? null,
  });
  closeDomainDb();
  return project;
}
