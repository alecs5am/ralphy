// Read or update batch state.
//
// Usage:
//   # Print summary
//   node --strip-types .agents/skills/ralph-producer/scripts/batch-status.ts \
//     --batch-id <id>
//
//   # Update one project's status / step
//   node --strip-types .agents/skills/ralph-producer/scripts/batch-status.ts \
//     --batch-id <id> --update <project-id> \
//     [--status pending|running|completed|failed] \
//     [--step scenario|prompts|assets|compose|render --step-status pending|running|completed|failed] \
//     [--render-path <path>] [--error <msg>]

import fs from "node:fs/promises";
import path from "node:path";

type Args = Record<string, string | undefined>;

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const out: Args = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a?.startsWith("--")) out[a.slice(2)] = args[++i];
  }
  return out;
}

async function loadState(batchId: string) {
  const p = path.resolve("workspace/batches", batchId, "state.json");
  const raw = await fs.readFile(p, "utf-8");
  return { path: p, state: JSON.parse(raw) };
}

async function saveState(p: string, state: any) {
  await fs.writeFile(p, JSON.stringify(state, null, 2) + "\n");
}

function printSummary(state: any) {
  const projects: any[] = state.projects ?? [];
  const counts = projects.reduce(
    (acc, p) => {
      acc[p.status] = (acc[p.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  console.log(`\nBatch: ${state.batchId}  template: ${state.template}  concurrency: ${state.concurrency}`);
  console.log(`Total: ${projects.length}  ` + Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join("  "));
  console.log("");

  const rows = projects.map((p) => ({
    id: p.id,
    status: p.status,
    steps: ["scaffold", "scenario", "prompts", "assets", "compose", "render"]
      .map((s) => `${s[0]}:${(p.steps?.[s] ?? "?")[0]}`)
      .join(" "),
    render: p.renderPath ? path.relative(process.cwd(), p.renderPath) : "—",
    error: p.error ?? "",
  }));

  for (const r of rows) {
    console.log(`  ${r.status.padEnd(11)}  ${r.id.padEnd(40)}  ${r.steps}  ${r.render}${r.error ? "  err: " + r.error : ""}`);
  }
}

async function main() {
  const args = parseArgs();
  const batchId = args["batch-id"];
  if (!batchId) {
    console.error("Missing --batch-id");
    process.exit(1);
  }

  const { path: statePath, state } = await loadState(batchId);

  const updateId = args.update;
  if (!updateId) {
    printSummary(state);
    return;
  }

  const proj = state.projects?.find((p: any) => p.id === updateId);
  if (!proj) {
    console.error(`Project not in batch: ${updateId}`);
    process.exit(1);
  }

  if (args.status) {
    proj.status = args.status;
    if (args.status === "running" && !proj.startedAt) proj.startedAt = new Date().toISOString();
    if (args.status === "completed" || args.status === "failed") proj.completedAt = new Date().toISOString();
  }
  if (args.step && args["step-status"]) {
    proj.steps[args.step] = args["step-status"];
  }
  if (args["render-path"]) proj.renderPath = args["render-path"];
  if (args.error) proj.error = args.error;

  await saveState(statePath, state);
  console.log(`Updated ${updateId}: status=${proj.status}` + (args.step ? `  ${args.step}=${args["step-status"]}` : ""));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
