import { expect, test } from "bun:test";
import { spawn } from "node:child_process";
import path from "node:path";
import { buildDomainCatalog } from "../../apps/desktop/electron/media/catalog.js";
import { RalphyBridgeClient } from "../../apps/desktop/electron/ralphy/client.js";
import { createWorkspaceReader } from "../../apps/desktop/electron/ralphy/workspace-reader.js";
import { loadWorkspaceUnits } from "../../apps/desktop/src/pages/workspace-units/api/load-workspace-units.js";
import { createArtifact } from "../../cli/lib/store/artifacts.js";
import { closeDomainDb } from "../../cli/lib/store/db.js";
import { createProject, createWorkspace } from "../../cli/lib/store/scopes.js";
import { createUnit } from "../../cli/lib/store/units.js";
import { makeTmpRoot } from "../helpers/tmp-root.js";

test("desktop workspace pages and shared counts span real bridge pages without crossing scopes", async () => {
  const root = makeTmpRoot("ralphy-desktop-workspace-library");
  const library = path.join(root.dir, ".ralphy");
  const cli = path.resolve(import.meta.dir, "../../cli/index.ts");
  const bridge = new RalphyBridgeClient({ root: library,
    spawn: (_bin, args, options) => spawn(process.execPath, [cli, ...args], options) });
  try {
    const workspace = createWorkspace({ slug: "studio", name: "Studio" });
    const other = createWorkspace({ slug: "other", name: "Other" });
    const project = createProject({ workspaceId: workspace.id, slug: "project", name: "Project" });
    const workspaceUnit = createUnit({ workspaceId: workspace.id, slug: "workspace-unit", format: "video" });
    for (let index = 0; index < 104; index++) createUnit({ projectId: project.id, slug: `unit-${index}`, format: "video" });
    for (let index = 0; index < 105; index++) createArtifact({ workspaceId: workspace.id, slug: `shared-${index}`, kind: "video" });
    createArtifact({ projectId: project.id, slug: "project-only", kind: "video" });
    createArtifact({ workspaceId: other.id, slug: "other-workspace", kind: "video" });
    closeDomainDb();
    await bridge.start();
    const renamed = await bridge.request("workspace.update", {
      context: { workspaceId: workspace.id }, workspaceId: workspace.id,
      expectedRowVersion: workspace.rowVersion, name: "Renamed studio",
    });
    expect(renamed.name).toBe("Renamed studio");
    expect(renamed.rowVersion).toBe(workspace.rowVersion + 1);

    const reader = createWorkspaceReader({ request: bridge.request.bind(bridge) });
    const units = await loadWorkspaceUnits(workspace.id, reader.loadUnitPage);
    expect(units.warning).toBeNull();
    expect(units.units).toHaveLength(105);
    expect(units.units.find((unit) => unit.id === workspaceUnit.id)?.projectId).toBeNull();
    expect(units.publications).toEqual([]);
    const catalog = await buildDomainCatalog(library, bridge);
    expect(catalog.workspaces.find((row) => row.id === workspace.id)).toMatchObject({ sharedCount: 105, unitCount: 105 });
    expect(catalog.projects.find((row) => row.projectId === project.id)).toMatchObject({ sharedCount: 105, unitCount: 104 });
    expect(catalog.workspaces.find((row) => row.id === other.id)?.sharedCount).toBe(1);
  } finally { await bridge.close(); closeDomainDb(); root.cleanup(); }
}, 20_000);
