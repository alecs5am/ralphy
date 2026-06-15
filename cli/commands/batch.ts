import { Command } from "commander";
import fs from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { addEntity, listEntities, deleteEntity } from "../lib/registry.js";
import { slugify } from "../lib/ids.js";
import { batchesDir, projectDir } from "../lib/paths.js";
import { out, ok, err } from "../lib/output.js";
import { raiseError } from "../lib/errors/index.js";
import { submitBatchFromFile } from "../lib/jobs/enqueue.js";
import { ensureDaemonRunning } from "../lib/jobs/daemon.js";
import { isVaryAxis, VARY_AXES } from "../lib/schemas/hook-body-cta.js";
import { buildBatchReview, type BatchInput, type ProjectStateInput } from "../lib/batch-review.js";
import { readGenerations } from "../lib/gen-log.js";
import type { EvalReport } from "../lib/eval/types.js";
import type { RepairPlan } from "../lib/schemas/repair-plan.js";
import {
  runTournament,
  manualScorer,
  modelAssistedScorer,
  kindForMedia,
  type TournamentCandidate,
} from "../lib/variant-tournament.js";
import { TOURNAMENT_RESULT_FILENAME } from "../lib/schemas/variant-matrix.js";
import { scoreImage, scoreVideo } from "../lib/quality.js";

/** Read + JSON.parse a file, or null on any failure. */
async function safeReadJson<T = unknown>(fp: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(fp, "utf-8")) as T;
  } catch {
    return null;
  }
}

/**
 * Normalize a batch state.json `projects[]` entry to a project id. Entries may
 * be a bare id string, or an object carrying `{ id | projectId | project }`.
 */
function projectIdOf(entry: unknown): string | null {
  if (typeof entry === "string") return entry;
  if (entry && typeof entry === "object") {
    const o = entry as Record<string, unknown>;
    for (const k of ["id", "projectId", "project"]) {
      if (typeof o[k] === "string") return o[k] as string;
    }
  }
  return null;
}

/**
 * Resolve a variant project's candidate media for the tournament (#421). The
 * canonical deliverable is `render/final.mp4`; an image-pack variant with no
 * render falls back to the first promoted asset-manifest slot. Returns null when
 * neither exists (the verb then skips it from the model-assisted pool). The
 * `cost` is summed from the project's gen-log so the result's roll-up matches
 * the #410 review's cost contract.
 */
async function resolveCandidate(pid: string): Promise<TournamentCandidate | null> {
  const pdir = projectDir(pid);
  let cost = 0;
  let prompt = "";
  try {
    for (const row of await readGenerations(pid)) {
      if (typeof row.cost_usd === "number" && Number.isFinite(row.cost_usd)) cost += row.cost_usd;
    }
  } catch {
    /* unreadable gen-log → 0 cost */
  }

  const renderRel = path.join("render", "final.mp4");
  if (existsSync(path.join(pdir, renderRel))) {
    return { variantId: pid, mediaPath: path.join(pdir, renderRel), kind: "video", cost: Number(cost.toFixed(2)), prompt };
  }

  // Image-pack fallback: the first promoted asset-manifest slot path.
  const manifest = await safeReadJson<{ slots?: Record<string, { path?: string }> }>(
    path.join(pdir, "asset-manifest.json"),
  );
  const firstSlot = manifest?.slots ? Object.values(manifest.slots).find((s) => s.path) : undefined;
  if (firstSlot?.path) {
    const abs = path.isAbsolute(firstSlot.path) ? firstSlot.path : path.join(pdir, firstSlot.path);
    return { variantId: pid, mediaPath: abs, kind: kindForMedia(abs), cost: Number(cost.toFixed(2)), prompt };
  }
  return null;
}

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

  // ── review (#410 — content-farm triage) ─────────────────────────────────────
  // Deterministic aggregation over the batch's member projects. ZERO model
  // calls — it only reads artifacts the per-project pipeline already wrote
  // (eval.json, repair-plan.json, generations.jsonl) and rolls them up into the
  // farm-mode triage view: winners (ship-ready, #411), failures (failed eval),
  // a cost roll-up (sum per-project generations.jsonl cost_usd), style drift
  // (eval style.*/brief.* findings), repeated model failures (the same
  // model/error recurring across ≥2 items), and recommended repairs (the #409
  // owner buckets). The pure builder is `buildBatchReview` so it is unit-tested
  // without shelling out. JSON output.
  cmd
    .command("review <id>")
    .description(
      "Deterministic farm-mode triage over a batch's member projects (#410). Rolls up winners (ship-ready, #411), failures (failed eval), a cost roll-up (sum of per-project generations.jsonl cost_usd), style drift (eval style.*/brief.* findings vs the shared style lock), repeated model failures (the same model/error recurring across ≥2 items), and recommended repairs (the #409 owner buckets). Makes ZERO model calls — pure aggregation over existing artifacts. JSON output.",
    )
    .action(async (id: string) => {
      const dir = path.join(batchesDir(), id);
      const state = await safeReadJson<{ projects?: unknown[] }>(path.join(dir, "state.json"));
      const config = await safeReadJson<{ name?: string; template?: string | null }>(
        path.join(dir, "batch-config.json"),
      );
      if (!state && !config) {
        raiseError("E_NOT_FOUND", { kind: "Batch", id });
      }

      const projectIds = Array.from(
        new Set((state?.projects ?? []).map(projectIdOf).filter((p): p is string => !!p)),
      ).sort((a, b) => a.localeCompare(b, "en"));

      const projectStates: ProjectStateInput[] = [];
      for (const pid of projectIds) {
        const pdir = projectDir(pid);
        // Skip ids that don't resolve to a project dir on disk (registry drift).
        if (!existsSync(pdir)) {
          projectStates.push({ id: pid, generations: [] });
          continue;
        }
        const evalReport = await safeReadJson<EvalReport>(path.join(pdir, "eval.json"));
        const repairPlan = await safeReadJson<RepairPlan>(path.join(pdir, "repair-plan.json"));
        const generations = await readGenerations(pid);
        projectStates.push({ id: pid, evalReport, repairPlan, generations });
      }

      const batch: BatchInput = {
        batchId: id,
        name: config?.name,
        template: config?.template ?? null,
      };
      const review = buildBatchReview(batch, projectStates);
      ok(
        `Batch review: ${review.winners.length}/${review.total} ship-ready, ${review.failures.length} failed ($${review.cost.totalUsd.toFixed(2)} spent)`,
      );
      out(review);
    });

  // ── tournament (#421 — the decision layer on variants) ──────────────────────
  // `ralphy batch tournament <id>` is the DECISION step on top of `batch vary`
  // (#024, which CREATES the variants) and `batch review` (#410, which
  // aggregates winners/failures/cost). It RANKS the batch's variant projects,
  // picks a CHAMPION, and PRESERVES the losers with a rationale (AGENTS.md #14 —
  // losers are training data, NEVER deleted). Two scorer modes:
  //   • model-assisted (default): `scoreVideo` for clip variants, `scoreImage`
  //     for still variants (cli/lib/quality.ts).
  //   • --manual <scores.json>: a `variantId → score` map for cheap manual
  //     visual review — ZERO model calls.
  // Writes `<batch>/tournament.json` (the durable champion + loser record) and
  // prints the ranked result + champion + cost rollup. Never deletes a loser.
  cmd
    .command("tournament <id>")
    .description(
      "Rank a batch's variant projects, pick a champion, and preserve the losers with rationale (#421). Model-assisted by default (scoreImage for still variants, scoreVideo for clip variants); --manual <scores.json> for the cheap no-model mode. Writes tournament.json. NEVER deletes a losing variant (append-only #14).",
    )
    .option("--manual <file>", "JSON map of variantId → score (or { score, reasons }) for the cheap no-model mode")
    .action(async (id: string, opts: { manual?: string }) => {
      const dir = path.join(batchesDir(), id);
      const state = await safeReadJson<{ projects?: unknown[] }>(path.join(dir, "state.json"));
      const config = await safeReadJson<{ name?: string }>(path.join(dir, "batch-config.json"));
      if (!state && !config) {
        raiseError("E_NOT_FOUND", { kind: "Batch", id });
      }

      const projectIds = Array.from(
        new Set((state?.projects ?? []).map(projectIdOf).filter((p): p is string => !!p)),
      ).sort((a, b) => a.localeCompare(b, "en"));

      // Resolve a scorable candidate per variant project (render/final.mp4 →
      // image-pack fallback). Variants with neither are skipped from the pool.
      const candidates: TournamentCandidate[] = [];
      for (const pid of projectIds) {
        if (!existsSync(projectDir(pid))) continue;
        const cand = await resolveCandidate(pid);
        if (cand) candidates.push(cand);
      }

      // Wire the scorer: --manual → caller-supplied map (no model call); else
      // model-assisted (scoreImage / scoreVideo). Both are injected so the
      // runner stays mode-agnostic.
      let scorer: "manual" | "model-assisted";
      let scoreFn;
      if (opts.manual) {
        const scores = await safeReadJson<Record<string, number | { score: number; reasons?: string[] }>>(opts.manual);
        if (!scores || typeof scores !== "object") {
          raiseError("E_FILE_MALFORMED", { format: "JSON", path: opts.manual, detail: "expected a variantId → score map" });
        }
        scorer = "manual";
        scoreFn = manualScorer(scores!);
      } else {
        scorer = "model-assisted";
        scoreFn = modelAssistedScorer({
          scoreImageFn: (i) => scoreImage({ imagePath: i.imagePath, prompt: i.prompt }),
          scoreVideoFn: (i) => scoreVideo({ videoPath: i.videoPath, prompt: i.prompt }),
        });
      }

      const result = await runTournament({ baseId: id, candidates, scoreFn, scorer });

      // Persist the durable champion + loser record. Fresh write — append-only
      // re-runs land in tournament.v2.json is out of scope; this is the latest
      // verdict, the per-variant artifacts stay untouched on disk.
      await fs.writeFile(path.join(dir, TOURNAMENT_RESULT_FILENAME), JSON.stringify(result, null, 2) + "\n");

      ok(
        result.champion
          ? `Champion: ${result.champion.variantId} (score ${result.champion.score}); ${result.losers.length} loser(s) preserved on disk ($${result.cost.totalUsd.toFixed(2)} spent)`
          : `No scorable variants found for ${id}`,
      );
      out(result);
    })
    .addHelpText("after", `
Examples:
  $ ralphy batch tournament farm-001
  $ ralphy batch tournament farm-001 --manual scores.json
`);

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
      const baseDir = projectDir(opts.base);
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
        const dir = projectDir(id);
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
