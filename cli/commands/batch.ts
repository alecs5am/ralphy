import { Command } from "commander";
import fs from "fs/promises";
import path from "path";
import { addEntity, getEntity, listEntities, deleteEntity } from "../lib/registry.js";
import { slugify } from "../lib/ids.js";
import { batchesDir, projectsDir } from "../lib/paths.js";
import { out, ok, err } from "../lib/output.js";
import { raiseError } from "../lib/errors/index.js";
import { submitBatchFromFile } from "../lib/jobs/enqueue.js";
import { ensureDaemonRunning } from "../lib/jobs/daemon.js";
import { isVaryAxis, VARY_AXES } from "../lib/schemas/hook-body-cta.js";

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
        raiseError("E_NOT_FOUND", { kind: "Batch", id });
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
        raiseError("E_NOT_FOUND", { kind: "Batch", id });
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

  // ── batch vary (02.08.02) ────────────────────────────────────────────────
  // `ralphy batch vary --base <project-id> --axis hook --variants N` creates
  // N derived projects that differ from <base> only on the named axis. Each
  // variant project's scenario.json keeps body + cta + everything else identical;
  // only the chosen axis swaps. The variant projects are scaffolded under
  // `<base>-h1`, `<base>-h2`, … and registered as projects so the standard
  // `ralphy render <id>` path works on them.
  //
  // What this command DOES NOT do in v1.0:
  //   • Generate the alternative hook copy. The agent (or the user) provides
  //     `--variants-file <json>` with the swap values. This keeps the verb
  //     cheap and predictable (no LLM call hidden inside `batch vary`).
  //   • Symlink assets between projects. v1.0 copies the scenario file only;
  //     asset reuse is a follow-up. The `--dry-run` flag previews what would
  //     be created without writing.
  cmd
    .command("vary")
    .description(
      "Create N project variants from a base project differing on one axis (hook / body / cta / persona). Use this for A/B testing the hook without re-running the rest of the pipeline.",
    )
    .requiredOption("--base <project-id>", "Base project to vary")
    .requiredOption("--axis <axis>", `Axis to vary: ${VARY_AXES.join(" | ")}`)
    .requiredOption("--variants <n>", "Number of variants to create", (v) => parseInt(v, 10), 3)
    .option("--variants-file <path>", "JSON file with the per-variant swap values (array of N objects)")
    .option("--dry-run", "Preview what would be created without writing")
    .action(async (opts) => {
      const axis = opts.axis;
      if (!isVaryAxis(axis)) {
        raiseError("E_FLAG_UNKNOWN", { flag: "axis", value: axis, allowed: VARY_AXES.join(" | "), verb: "batch vary" });
      }
      const baseDir = path.join(projectsDir(), opts.base);
      let baseScenario: Record<string, unknown>;
      try {
        baseScenario = JSON.parse(await fs.readFile(path.join(baseDir, "scenario.json"), "utf-8"));
      } catch {
        raiseError("E_FILE_UNREADABLE", { path: path.join(baseDir, "scenario.json") });
      }

      let swaps: Array<Record<string, unknown>> = [];
      if (opts.variantsFile) {
        try {
          const raw = await fs.readFile(opts.variantsFile, "utf-8");
          const parsed = JSON.parse(raw);
          if (!Array.isArray(parsed)) {
            raiseError("E_FILE_MALFORMED", { format: "JSON", path: opts.variantsFile, detail: "expected an array" });
          }
          swaps = parsed as Array<Record<string, unknown>>;
        } catch (e) {
          raiseError("E_FILE_UNREADABLE", { path: opts.variantsFile, detail: (e as Error).message });
        }
      }

      const n = opts.variants;
      const suffix = axis === "hook" ? "h" : axis === "cta" ? "c" : axis === "body" ? "b" : "p";
      const planned: Array<{ id: string; dir: string; swap: Record<string, unknown> }> = [];
      for (let i = 0; i < n; i++) {
        const id = `${opts.base}-${suffix}${i + 1}`;
        const dir = path.join(projectsDir(), id);
        const swap = swaps[i] ?? {};
        planned.push({ id, dir, swap });
      }

      if (opts.dryRun) {
        out({
          dryRun: true,
          base: opts.base,
          axis,
          would_create: planned.map((p) => ({ id: p.id, swap: p.swap })),
        });
        return;
      }

      const created: string[] = [];
      for (const p of planned) {
        try {
          await fs.access(p.dir);
          raiseError("E_ALREADY_EXISTS", { kind: "Project", id: p.id });
        } catch { /* fall through */ }
        await fs.mkdir(p.dir, { recursive: true });
        // Shallow clone the scenario and overlay the axis swap.
        const variantScenario: Record<string, unknown> = JSON.parse(JSON.stringify(baseScenario));
        // The swap object's keys are merged at the top of the scenario. The
        // batch caller is responsible for placing the swap under the right
        // key (e.g. { "hook": {...} } for axis=hook). This keeps the verb
        // dumb-pipe and predictable.
        for (const [k, v] of Object.entries(p.swap)) {
          variantScenario[k] = v;
        }
        variantScenario.variant_of = opts.base;
        variantScenario.variant_axis = axis;
        await fs.writeFile(path.join(p.dir, "scenario.json"), JSON.stringify(variantScenario, null, 2) + "\n");
        await addEntity("projects", p.id, {
          name: p.id,
          variant_of: opts.base,
          variant_axis: axis,
          status: "draft",
          createdAt: new Date().toISOString(),
        });
        created.push(p.id);
      }
      ok(`Created ${created.length} variant(s) of ${opts.base} (axis=${axis})`);
      out({ base: opts.base, axis, created });
    })
    .addHelpText("after", `
Examples:
  $ ralphy batch vary --base demo-001 --axis hook --variants 3 --dry-run
  $ ralphy batch vary --base demo-001 --axis hook --variants 3 --variants-file hooks.json
  $ ralphy batch vary --base demo-001 --axis cta  --variants 5 --variants-file ctas.json
`);

  return cmd;
}
