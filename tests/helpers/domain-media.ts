import fs from "node:fs";
import path from "node:path";
import { setRoot } from "../../cli/lib/paths.js";
import { getArtifactRevision } from "../../cli/lib/store/artifacts.js";
import { closeDomainDb, openDomainDb } from "../../cli/lib/store/db.js";
import { getObjectRow, resolveObjectPath } from "../../cli/lib/store/internal-objects.js";
import { createProject, createWorkspace } from "../../cli/lib/store/scopes.js";

export type DomainProjectFixture = { workspaceId: string; projectId: string };

export function seedDomainProject(root: string, slug: string): DomainProjectFixture {
  setRoot(root);
  fs.mkdirSync(path.join(root, ".ralphy"), { recursive: true });
  openDomainDb();
  const workspace = createWorkspace({ slug: "default", name: "Default" });
  const project = createProject({ workspaceId: workspace.id, slug, name: slug });
  closeDomainDb();
  setRoot(process.cwd());
  return { workspaceId: workspace.id, projectId: project.id };
}

export function artifactRevisionObjectPath(
  root: string,
  fixture: DomainProjectFixture,
  revisionId: string,
): string {
  setRoot(root);
  const db = openDomainDb();
  const revision = getArtifactRevision({ context: fixture, revisionId });
  const object = getObjectRow(db, revision.objectId);
  if (!object) throw new Error(`Object not found: ${revision.objectId}`);
  const objectPath = resolveObjectPath(object);
  closeDomainDb();
  setRoot(process.cwd());
  return objectPath;
}
