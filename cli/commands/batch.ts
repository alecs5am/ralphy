import { Command } from "commander";
import fs from "fs/promises";
import path from "path";
import { addEntity, getEntity, listEntities, deleteEntity } from "../lib/registry.js";
import { slugify } from "../lib/ids.js";
import { batchesDir } from "../lib/paths.js";
import { out, ok, err } from "../lib/output.js";
import { submitBatchFromFile } from "../lib/jobs/enqueue.js";
import { ensureDaemonRunning } from "../lib/jobs/daemon.js";

export function batchCmd() {
  const cmd = new Command("batch").description("Manage batch operations");

  cmd
    .command("create")
    .description("Create a batch")
    .requiredOption("--name <name>", "Batch name")
    .option("--template <id>", "Template ID")
    .option("--variations <file>", "Path to variations JSON/CSV")
    .option("--concurrency <n>", "Parallel jobs", parseInt, 3)
    .action(async (opts) => {
      const id = slugify(opts.name);
      const dir = path.join(batchesDir(), id);
      await fs.mkdir(dir, { recursive: true });

      const config: Record<string, unknown> = {
        batchId: id,
        name: opts.name,
        concurrency: opts.concurrency,
        createdAt: new Date().toISOString(),
      };
      if (opts.template) config.template = opts.template;

      if (opts.variations) {
        try {
          const raw = await fs.readFile(opts.variations, "utf-8");
          if (opts.variations.endsWith(".csv")) {
            const lines = raw.trim().split("\n");
            const headers = lines[0].split(",").map((h: string) => h.trim().replace(/"/g, ""));
            config.variations = lines.slice(1).map((line: string) => {
              const vals = line.split(",").map((v: string) => v.trim().replace(/"/g, ""));
              return Object.fromEntries(headers.map((h: string, i: number) => [h, vals[i]]));
            });
          } else {
            config.variations = JSON.parse(raw);
          }
        } catch (e: any) {
          err(`Cannot read variations file: ${e.message}`);
        }
      }

      await fs.writeFile(path.join(dir, "batch-config.json"), JSON.stringify(config, null, 2) + "\n");
      await fs.writeFile(
        path.join(dir, "state.json"),
        JSON.stringify({ batchId: id, status: "pending", projects: [] }, null, 2) + "\n"
      );

      await addEntity("batches", id, { name: opts.name, status: "pending", createdAt: config.createdAt });
      ok(`Batch created: ${id}`);
      out(config);
    });

  cmd
    .command("list")
    .description("List all batches")
    .action(async () => {
      const batches = await listEntities("batches");
      out(batches.map((b: any) => ({ id: b.id, name: b.name, status: b.status || "—" })));
    });

  cmd
    .command("show <id>")
    .description("Show batch details")
    .action(async (id: string) => {
      const dir = path.join(batchesDir(), id);
      try {
        const config = JSON.parse(await fs.readFile(path.join(dir, "batch-config.json"), "utf-8"));
        const state = JSON.parse(await fs.readFile(path.join(dir, "state.json"), "utf-8")).catch?.(() => null);
        out({ config, state });
      } catch {
        err(`Batch not found: ${id}`);
      }
    });

  cmd
    .command("status <id>")
    .description("Show batch status")
    .action(async (id: string) => {
      const dir = path.join(batchesDir(), id);
      try {
        const state = JSON.parse(await fs.readFile(path.join(dir, "state.json"), "utf-8"));
        out(state);
      } catch {
        err(`Batch not found: ${id}`);
      }
    });

  cmd
    .command("delete <id>")
    .description("Delete a batch")
    .option("--with-projects", "Also delete associated projects")
    .action(async (id: string) => {
      await fs.rm(path.join(batchesDir(), id), { recursive: true, force: true });
      await deleteEntity("batches", id);
      ok(`Batch deleted: ${id}`);
      out({ deleted: id });
    });

  // `batch submit --from <jobs.json>` — atomic enqueue of N jobs to the
  // local job daemon, with symbolic depends_on resolved to real ids on
  // insert. Use this for the "N generations + 1 render" pattern.
  // File format:
  //   [
  //     { "id": "clip-01", "kind": "generate.video",
  //       "argv": ["generate","video","--project","X","--slot","s",...] },
  //     { "id": "render", "kind": "render", "argv": ["render","X"],
  //       "depends_on": ["clip-01","clip-02",...] }
  //   ]
  cmd
    .command("submit")
    .description(
      "Submit a batch of jobs to the local daemon with symbolic dependencies. Use this for the 'N generations + 1 render' pattern.",
    )
    .requiredOption(
      "--from <file>",
      "JSON file with the batch spec (array of jobs, or { jobs: [...] })",
    )
    .action(async (opts) => {
      try {
        const result = await submitBatchFromFile(opts.from);
        ensureDaemonRunning();
        out({
          submitted: result.ids.length,
          ids: result.ids,
          symbolMap: result.symbolMap,
        });
      } catch (e) {
        err((e as Error).message);
      }
    });

  return cmd;
}
