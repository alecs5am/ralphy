import fs from "node:fs";
import path from "node:path";
import { setRoot } from "../../cli/lib/paths.js";
import { closeDomainDb, openDomainDb } from "../../cli/lib/store/db.js";
import { createWorkspace } from "../../cli/lib/store/scopes.js";

const ARTIFACT_KINDS = [
  "images",
  "videos",
  "voiceover",
  "music",
  "sfx",
  "captions",
  "fonts",
  "refs",
];

/** Seed the compatibility Workspace tree used by filesystem-owned verbs. */
export function seedLegacyWorkspace(root: string, slug = "default"): string {
  const workspaceDir = path.join(root, ".ralphy", "workspaces", slug);
  for (const relative of [
    "projects",
    "units",
    "shared/assets/images",
    "shared/assets/videos",
    "shared/assets/voiceover",
    "shared/assets/music",
    "shared/assets/sfx",
    "shared/assets/fonts",
  ]) {
    fs.mkdirSync(path.join(workspaceDir, relative), { recursive: true });
  }
  fs.writeFileSync(
    path.join(workspaceDir, "workspace.json"),
    `${JSON.stringify({ slug, name: slug }, null, 2)}\n`,
  );
  return workspaceDir;
}

/** Seed only the compatibility filesystem read model used by pre-entity verbs. */
export function seedLegacyProject(
  root: string,
  id: string,
  options: { name?: string; kind?: "video" | "image-pack" } = {},
): string {
  const dataRoot = path.join(root, ".ralphy");
  const workspaceDir = seedLegacyWorkspace(root);
  const projectDir = path.join(workspaceDir, "projects", id);
  const kind = options.kind ?? "video";
  for (const artifactKind of ARTIFACT_KINDS) {
    fs.mkdirSync(path.join(projectDir, "artifacts", artifactKind), {
      recursive: true,
    });
  }
  if (kind === "image-pack") {
    fs.mkdirSync(path.join(projectDir, "selected"), { recursive: true });
  } else {
    fs.mkdirSync(path.join(projectDir, "render"), { recursive: true });
  }
  fs.mkdirSync(dataRoot, { recursive: true });
  const registryPath = path.join(dataRoot, "registry.json");
  let registry: { projects: Record<string, unknown> } = { projects: {} };
  try {
    registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
  } catch {
    // A fresh compatibility fixture has no registry yet.
  }
  registry.projects ??= {};
  registry.projects[id] = {
    id,
    name: options.name ?? id,
    kind,
    workspace: "default",
    status: "draft",
    createdAt: "2026-08-04T00:00:00.000Z",
  };
  fs.writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`);
  return projectDir;
}

export function seedDomainWorkspace(root: string, slug = "default") {
  fs.mkdirSync(path.join(root, ".ralphy"), { recursive: true });
  setRoot(root);
  openDomainDb();
  const workspace = createWorkspace({ slug, name: slug });
  closeDomainDb();
  setRoot(process.cwd());
  return workspace;
}
