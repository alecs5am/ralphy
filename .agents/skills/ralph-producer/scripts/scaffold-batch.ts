// Scaffold N projects from a template based on an approved ideas file.
//
// Reads:  workspace/batches/<batch-id>/ideas-approved.json
// Writes: N projects via `ralph template use`
//         workspace/batches/<batch-id>/state.json
//
// Usage:
//   node --strip-types .agents/skills/ralph-producer/scripts/scaffold-batch.ts \
//     --batch-id <batch-id>

import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

type Idea = {
  id: string;
  title: string;
  concept: string;
  brief: string;
};

type IdeasFile = {
  batchId: string;
  template: string;
  createdAt: string;
  concurrency?: number;
  ideas: Idea[];
};

type StepStatus = "pending" | "running" | "completed" | "failed";

type ProjectState = {
  id: string;
  title: string;
  status: StepStatus | "scaffolding";
  steps: {
    scaffold: StepStatus;
    scenario: StepStatus;
    prompts: StepStatus;
    assets: StepStatus;
    compose: StepStatus;
    render: StepStatus;
  };
  renderPath: string | null;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
};

type BatchState = {
  batchId: string;
  template: string;
  createdAt: string;
  concurrency: number;
  projects: ProjectState[];
};

function parseArgs(): { batchId: string } {
  const args = process.argv.slice(2);
  let batchId = "";
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--batch-id") batchId = args[++i] ?? "";
  }
  if (!batchId) {
    console.error("Missing --batch-id");
    process.exit(1);
  }
  return { batchId };
}

async function main() {
  const { batchId } = parseArgs();

  const batchDir = path.resolve("workspace/batches", batchId);
  const ideasPath = path.join(batchDir, "ideas-approved.json");

  let ideas: IdeasFile;
  try {
    ideas = JSON.parse(await fs.readFile(ideasPath, "utf-8"));
  } catch (e) {
    console.error(`Cannot read ${ideasPath}: ${(e as Error).message}`);
    process.exit(1);
  }

  if (!ideas.ideas?.length) {
    console.error("ideas-approved.json has no ideas");
    process.exit(1);
  }

  await fs.mkdir(batchDir, { recursive: true });

  const projects: ProjectState[] = [];
  const ralph = (args: string[]) =>
    spawnSync("npx", ["tsx", "cli/index.ts", ...args], { stdio: "inherit" });

  for (const idea of ideas.ideas) {
    const projectId = idea.id.includes("-") ? idea.id : `${batchId}-${idea.id}`;

    console.log(`\n→ Scaffolding ${projectId} …`);
    const r = ralph([
      "template",
      "use",
      ideas.template,
      "--project",
      projectId,
      "--name",
      idea.title,
      "--brief",
      idea.brief,
    ]);

    const scaffoldOk = r.status === 0;
    if (scaffoldOk) {
      // Log the brainstormed concept as a separate user-prompt entry for traceability
      ralph([
        "project",
        "log-prompt",
        projectId,
        "--text",
        `[batch ${batchId}] Concept: ${idea.concept}`,
        "--stage",
        "batch-concept",
      ]);
    }

    projects.push({
      id: projectId,
      title: idea.title,
      status: scaffoldOk ? "pending" : "failed",
      steps: {
        scaffold: scaffoldOk ? "completed" : "failed",
        scenario: "pending",
        prompts: "pending",
        assets: "pending",
        compose: "pending",
        render: "pending",
      },
      renderPath: null,
      error: scaffoldOk ? null : `ralph template use exit code ${r.status}`,
      startedAt: null,
      completedAt: null,
    });
  }

  const state: BatchState = {
    batchId,
    template: ideas.template,
    createdAt: ideas.createdAt,
    concurrency: ideas.concurrency ?? 2,
    projects,
  };

  await fs.writeFile(path.join(batchDir, "state.json"), JSON.stringify(state, null, 2) + "\n");

  const ok = projects.filter((p) => p.steps.scaffold === "completed").length;
  const fail = projects.filter((p) => p.steps.scaffold === "failed").length;
  console.log(`\nScaffolded ${ok}/${projects.length} projects (${fail} failed). State: ${path.relative(process.cwd(), path.join(batchDir, "state.json"))}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
