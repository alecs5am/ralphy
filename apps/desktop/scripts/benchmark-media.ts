import { performance } from "node:perf_hooks";
import { buildShallowCatalog } from "../electron/media/catalog";
import { scanProject } from "../electron/media/project-scanner";

const rootPath =
  process.argv[2] ??
  "/Users/maximovchinnikov/github/ralphy/ralphy/.ralphy";

async function timed<Result>(operation: () => Promise<Result>) {
  const startedAt = performance.now();
  const result = await operation();
  return { result, milliseconds: performance.now() - startedAt };
}

await buildShallowCatalog(rootPath, 1);
const catalogRun = await timed(() => buildShallowCatalog(rootPath, 2));
const project =
  catalogRun.result.projects.find((candidate) => candidate.finalCount > 0) ??
  catalogRun.result.projects[0];
if (!project) throw new Error("Benchmark library contains no projects");

await scanProject({ rootPath, ...project, generation: 1 });
const projectRun = await timed(() =>
  scanProject({
    rootPath,
    workspaceId: project.workspaceId,
    projectId: project.projectId,
    generation: 2,
  }),
);

console.log(JSON.stringify({
  rootPath,
  workspaces: catalogRun.result.workspaces.length,
  projects: catalogRun.result.projects.length,
  catalogMs: Number(catalogRun.milliseconds.toFixed(1)),
  scannedProject: project.id,
  projectItems: projectRun.result.items.length,
  projectMs: Number(projectRun.milliseconds.toFixed(1)),
}, null, 2));

if (catalogRun.milliseconds > 250 || projectRun.milliseconds > 300) {
  process.exitCode = 1;
}
