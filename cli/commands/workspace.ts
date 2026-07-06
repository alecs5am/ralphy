import { Command } from "commander";
import fs from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import {
  workspace,
  projectsDir,
  batchesDir,
  referencesDir,
  artifactsDir,
  projectDir,
  layoutMode,
  workspacesDir,
  workspaceDir,
  workspaceManifestPath,
  templatesDir,
  DEFAULT_WORKSPACE,
} from "../lib/paths.js";
import { setActiveWorkspace, getActiveWorkspace } from "../lib/registry.js";
import { out, ok, err } from "../lib/output.js";
import { raiseError } from "../lib/errors/index.js";
import {
  runWorkspaceEval,
  renderWorkspaceEvalMarkdown,
  WORKSPACE_EVAL_ARTIFACT,
  WORKSPACE_EVAL_REPORT,
} from "../lib/eval/workspace-evaluators.js";
import { protectExistingAsset } from "../lib/providers/shared.js";
import { callLLM } from "../lib/providers/llm.js";
import {
  exportWorkspaceBundle,
  importWorkspaceBundle,
  BundleError,
  type BundleGap,
  type ImportRefusal,
} from "../lib/bundle.js";
import {
  TRUST_LEVELS,
  writeTrustConfig,
  trustStatus,
  type TrustConfig,
  type TrustLevel,
} from "../lib/trust.js";

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

/** The workspace "bible" files an ideation pass grounds itself in (#469 rubric instance). */
const BIBLE_FILES = [
  "STYLE_LOCK.md",
  "rubrics/scenario.md",
  "rubrics/characters.md",
  "rubrics/locations.md",
  "metrics-benchmarks.json",
  "evaluators.json",
];

/** Read each bible file that exists under <workspace>/, labeled for the LLM context. */
async function gatherWorkspaceBible(slug: string): Promise<{ blocks: string; used: string[] }> {
  const dir = workspaceDir(slug);
  const parts: string[] = [];
  const used: string[] = [];
  for (const rel of BIBLE_FILES) {
    try {
      const body = await fs.readFile(path.join(dir, rel), "utf-8");
      if (body.trim()) {
        parts.push(`### FILE: ${rel}\n\n${body.trim()}`);
        used.push(rel);
      }
    } catch {
      /* missing file — skip silently, this is best-effort grounding */
    }
  }
  return { blocks: parts.join("\n\n---\n\n"), used };
}

/** commander reducer to collect repeatable options into an array. */
function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}

async function dirSize(dir: string): Promise<number> {
  let total = 0;
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true, recursive: true });
    for (const entry of entries) {
      if (entry.isFile()) {
        try {
          const stat = await fs.stat(path.join(entry.parentPath || (entry as any).path, entry.name));
          total += stat.size;
        } catch {}
      }
    }
  } catch {}
  return total;
}

async function countDirs(dir: string): Promise<number> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).length;
  } catch {
    return 0;
  }
}

function requireRalphyLayout(verb: string) {
  if (layoutMode() === "legacy") {
    // #106 fail-fast: every workspace verb requires the .ralphy/ root. This
    // explicit guard short-circuits before any path helper throws so the
    // refusal is immediate and carries the catalog payload.
    raiseError("E_LEGACY_LAYOUT", { verb });
  }
}

async function readWorkspaceManifest(slug: string): Promise<Record<string, unknown> | null> {
  try {
    return JSON.parse(await fs.readFile(workspaceManifestPath(slug), "utf-8"));
  } catch {
    return null;
  }
}

async function listWorkspaceSlugs(): Promise<string[]> {
  try {
    const entries = await fs.readdir(workspacesDir(), { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

export function workspaceCmd() {
  const cmd = new Command("workspace").description(
    "Manage workspaces (studio / universe groupings of projects with a shared/ asset tier)",
  );

  // ── create (#108) ──────────────────────────────────────────────────────
  cmd
    .command("create <slug>")
    .description("Create a workspace: .ralphy/workspaces/<slug>/{workspace.json,shared/,projects/,templates/,batches/}")
    .option("--name <name>", "Display name (default: the slug)")
    .option("--description <d>", "What this workspace groups (studio / universe / client)")
    .action(async (slug: string, opts) => {
      requireRalphyLayout("workspace create");
      if (!SLUG_RE.test(slug)) {
        raiseError("E_VALIDATION_FAILED", {
          target: "slug",
          detail: `'${slug}' is not a valid workspace slug (lowercase kebab-case)`,
        });
      }
      if (existsSync(workspaceDir(slug))) {
        raiseError("E_ALREADY_EXISTS", { kind: "Workspace", id: slug });
      }
      for (const sub of ["shared", "projects", "templates", "batches"]) {
        await fs.mkdir(path.join(workspaceDir(slug), sub), { recursive: true });
      }
      const manifest = {
        name: opts.name || slug,
        slug,
        created: new Date().toISOString(),
        description: opts.description || "",
      };
      await fs.writeFile(workspaceManifestPath(slug), JSON.stringify(manifest, null, 2) + "\n");
      ok(`Workspace created: ${slug}`);
      out({ ...manifest, path: workspaceDir(slug) });
    });

  // ── list (#108) ────────────────────────────────────────────────────────
  cmd
    .command("list")
    .description("List workspaces (slug, name, project count)")
    .action(async () => {
      requireRalphyLayout("workspace list");
      const active = await getActiveWorkspace();
      const slugs = await listWorkspaceSlugs();
      if (slugs.length === 0) {
        // Fresh root with no explicit workspaces yet — the implicit default.
        out([
          {
            slug: DEFAULT_WORKSPACE,
            name: DEFAULT_WORKSPACE,
            projects: await countDirs(path.join(workspaceDir(DEFAULT_WORKSPACE), "projects")),
            active: active === DEFAULT_WORKSPACE,
            implicit: true,
          },
        ]);
        return;
      }
      const rows = [];
      for (const slug of slugs) {
        const manifest = await readWorkspaceManifest(slug);
        rows.push({
          slug,
          name: (manifest?.name as string) || slug,
          projects: await countDirs(path.join(workspaceDir(slug), "projects")),
          active: slug === active,
        });
      }
      out(rows);
    });

  // ── show (#108) ────────────────────────────────────────────────────────
  cmd
    .command("show <slug>")
    .description("Show a workspace: workspace.json + project list")
    .action(async (slug: string) => {
      requireRalphyLayout("workspace show");
      const dir = workspaceDir(slug);
      if (!existsSync(dir)) {
        raiseError("E_NOT_FOUND", { kind: "Workspace", id: slug });
      }
      const manifest = (await readWorkspaceManifest(slug)) || { slug, name: slug };
      const entries = await fs.readdir(path.join(dir, "projects"), { withFileTypes: true }).catch(() => []);
      const projects = entries
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort();
      out({ ...manifest, path: dir, active: (await getActiveWorkspace()) === slug, projects });
    });

  // ── use (#108) ─────────────────────────────────────────────────────────
  cmd
    .command("use <slug>")
    .description("Set the active workspace (the default home for new projects)")
    .action(async (slug: string) => {
      requireRalphyLayout("workspace use");
      if (slug !== DEFAULT_WORKSPACE && !existsSync(workspaceDir(slug))) {
        raiseError("E_NOT_FOUND", { kind: "Workspace", id: slug });
      }
      await setActiveWorkspace(slug);
      // #117 auto-recall: switching workspaces mid-session must surface that
      // workspace's memory without a separate call — fresh client facts ride
      // along on the switch itself. Best-effort; never breaks the switch.
      let memory: unknown = null;
      try {
        const { recall } = await import("../lib/memory/store.js");
        const r = await recall({ ws: slug });
        memory = {
          workspace: r.workspace,
          count: r.count,
          truncated: r.truncated,
          note: r.note,
          entries: r.entries.map((e) => ({ slug: e.slug, tier: e.tier, description: e.description })),
        };
      } catch {
        /* no memory yet — omit */
      }
      ok(`Active workspace: ${slug}`);
      out({ activeWorkspace: slug, memory });
    });

  // ── update (#505 trust-ladder settings) ────────────────────────────────
  cmd
    .command("update <slug>")
    .description(
      "Update workspace settings — the #505 trust-ladder fields in workspace.json's `trust` key: --trust-level L0|L1|L2 (L0 = publish always parks for approval, L1 = auto-pass when the workspace-eval score clears --auto-publish-score, L2 = auto-pass any ship-verdict unit; a fail/warn gate never auto-passes at any level), --auto-publish-score 0-100 (the L1 threshold on the workspace-eval overall score, default 80), --promotion-streak (consecutive verdict-matching decisions before `workspace trust` suggests promotion, default 10), --demote-on-reject true|false (a reject of an auto-published unit drops L2 to L1, default true). Promotion/demotion of the level is always THIS explicit verb — never automatic. Example: ralphy workspace update silent-hill --trust-level L1 --auto-publish-score 85",
    )
    .option("--trust-level <level>", "Trust-ladder level: L0 | L1 | L2")
    .option("--auto-publish-score <n>", "L1 auto-publish threshold on the workspace-eval overall score (0-100)", parseFloat)
    .option("--promotion-streak <n>", "Consecutive verdict-matching decisions before promotion is suggested", (v) => parseInt(v, 10))
    .option("--demote-on-reject <bool>", "true | false — reject of an auto-published unit drops L2 to L1")
    .action(async (slug: string, opts) => {
      requireRalphyLayout("workspace update");
      if (slug !== DEFAULT_WORKSPACE && !existsSync(workspaceDir(slug))) {
        raiseError("E_NOT_FOUND", { kind: "Workspace", id: slug });
      }
      const patch: Partial<TrustConfig> = {};
      if (opts.trustLevel !== undefined) {
        if (!(TRUST_LEVELS as readonly string[]).includes(String(opts.trustLevel))) {
          raiseError("E_INPUT_INVALID", {
            field: "trust-level",
            detail: `must be one of ${TRUST_LEVELS.join(" | ")}`,
            verb: "workspace update",
          });
        }
        patch.level = opts.trustLevel as TrustLevel;
      }
      if (opts.autoPublishScore !== undefined) {
        const n = Number(opts.autoPublishScore);
        if (!Number.isFinite(n) || n < 0 || n > 100) {
          raiseError("E_INPUT_INVALID", {
            field: "auto-publish-score",
            detail: "must be a number in 0-100 (the workspace-eval overall score scale)",
            verb: "workspace update",
          });
        }
        patch.autoPublishScore = n;
      }
      if (opts.promotionStreak !== undefined) {
        const n = Number(opts.promotionStreak);
        if (!Number.isInteger(n) || n < 1) {
          raiseError("E_INPUT_INVALID", {
            field: "promotion-streak",
            detail: "must be a positive integer",
            verb: "workspace update",
          });
        }
        patch.promotionStreak = n;
      }
      if (opts.demoteOnReject !== undefined) {
        const v = String(opts.demoteOnReject).toLowerCase();
        if (v !== "true" && v !== "false") {
          raiseError("E_INPUT_INVALID", {
            field: "demote-on-reject",
            detail: "must be true or false",
            verb: "workspace update",
          });
        }
        patch.demoteOnReject = v === "true";
      }
      if (Object.keys(patch).length === 0) {
        raiseError("E_INPUT_INVALID", {
          field: "flags",
          detail:
            "nothing to update — pass --trust-level, --auto-publish-score, --promotion-streak, or --demote-on-reject",
          verb: "workspace update",
        });
      }
      const trust = writeTrustConfig(slug, patch);
      ok(`Workspace ${slug} updated — trust level ${trust.level}`);
      out({ workspace: slug, trust });
    });

  // ── trust (#505) ────────────────────────────────────────────────────────
  cmd
    .command("trust <slug>")
    .description(
      "Show the workspace's trust-ladder state (#505): the level (L0 park-everything | L1 score-thresholded auto-publish | L2 autopilot on ship-verdict units), the thresholds, the verdict-vs-human agreement (rate, streak, sample count from trust-agreement.jsonl), the auto-pass audit count, and whether promotion is SUGGESTED (streak >= promotion-streak AND agreement rate >= 0.9). Promotion is never applied here — it is always the explicit `ralphy workspace update <ws> --trust-level <L>`. Pure file reads, ZERO model calls. Example: ralphy workspace trust silent-hill",
    )
    .action(async (slug: string) => {
      requireRalphyLayout("workspace trust");
      if (slug !== DEFAULT_WORKSPACE && !existsSync(workspaceDir(slug))) {
        raiseError("E_NOT_FOUND", { kind: "Workspace", id: slug });
      }
      const status = trustStatus(slug);
      ok(
        `Workspace ${slug} — trust ${status.level}, agreement ${
          status.agreement.rate === null ? "n/a" : `${Math.round(status.agreement.rate * 100)}%`
        } over ${status.agreement.samples} sample(s), streak ${status.agreement.streak}${
          status.promotion.suggested ? ` — promotion to ${status.promotion.nextLevel} suggested` : ""
        }`,
      );
      out(status);
    });

  // ── eval (#469) ────────────────────────────────────────────────────────
  cmd
    .command("eval <project>")
    .description(
      "Score a project against its workspace's custom evaluator rubric (#468 config) and write workspace-eval.json + workspace-eval-report.md (append-only). Deterministic criteria run in code (via their validatorId — #470 wires the builtins; an unregistered id is reported as na, never an error); vision criteria run ONE ISOLATED deep-vision pass PER criterion (#477), each loading only its own rubric (inline rubricPrompt > rubricFile > builtin fragment > label) for focused, non-diluted context. The overall verdict uses the #427 readiness vocab (ship | repair | needs-user-decision | blocked). Use --criterion to re-run a single rubric in isolation: the fresh result merges over the prior workspace-eval.json so the other criteria are not re-spent. Example: ralphy workspace eval choose-silenthill-001 --criterion scenario-fidelity",
    )
    .option("--no-vision", "Skip the vision pass entirely (deterministic criteria only — no model call)")
    .option("--model <id>", "Override the deep-vision model (default google/gemini-3.1-pro-preview)")
    .option("--workspace <slug>", "Override the rubric workspace (default: the project's registered workspace)")
    .option("--video <path>", "Override the scored video (default: <project>/render/final.mp4)")
    .option(
      "--criterion <id>",
      "Run ONLY this criterion (repeatable; re-runs merge over the prior workspace-eval.json so other criteria aren't re-spent)",
      collect,
      [],
    )
    .action(async (project: string, opts) => {
      requireRalphyLayout("workspace eval");
      try {
        const criteria = (opts.criterion as string[]) ?? [];
        const result = await runWorkspaceEval(project, {
          noVision: opts.vision === false,
          model: opts.model as string | undefined,
          workspace: opts.workspace as string | undefined,
          video: opts.video as string | undefined,
          criteria: criteria.length > 0 ? criteria : undefined,
        });

        // Append-only persistence: archive any existing report to .vN first.
        const dest = path.join(projectDir(project), WORKSPACE_EVAL_ARTIFACT);
        await protectExistingAsset(dest, false);
        await fs.mkdir(path.dirname(dest), { recursive: true });
        await fs.writeFile(dest, JSON.stringify(result, null, 2));

        const mdDest = path.join(projectDir(project), WORKSPACE_EVAL_REPORT);
        await protectExistingAsset(mdDest, false);
        await fs.writeFile(mdDest, renderWorkspaceEvalMarkdown(result));

        out({
          verdict: result.overall.verdict,
          score: result.overall.score,
          workspace: result.workspace,
          projectId: result.projectId,
          criteria: result.criteria.length,
          summary: result.overall.summary,
          jsonPath: dest,
          mdPath: mdDest,
        });
      } catch (e) {
        err(`workspace eval failed: ${(e as Error).message}`);
      }
    });

  // ── ideate ───────────────────────────────────────────────────────────────
  // Feed the whole workspace bible (STYLE_LOCK + rubrics + metrics) to a strong
  // Gemini text model and ask it to pitch the next episode(s) — grounded so the
  // pitch is written to PASS this universe's own rubric. Goes through callLLM()
  // (AGENTS.md invariant #1/#2 — never an ad-hoc provider call). Workspace-level,
  // so no per-project gen-log row; the pitch is saved as a new file (append-only).
  cmd
    .command("ideate <slug>")
    .description(
      "Feed the workspace bible (STYLE_LOCK.md + rubrics/*.md + metrics-benchmarks.json + evaluators.json) to a Gemini text model via callLLM() and ask it to produce a grounded, rubric-passing draft. Default task: pitch N next-episode concepts. Pass --task to override with any instruction (e.g. write the full scenario for an already-chosen episode) — still grounded in the bible. Saves to <workspace>/ideas/idea-<timestamp>.md (new file, append-only) and prints metadata. Example: ralphy workspace ideate silent-hill --brief 'lean into the space-bar vibe' --count 3",
    )
    .option("--brief <text>", "Extra creative steer folded into the ask (optional)")
    .option("--count <n>", "How many concepts to pitch in the default task (default 3; ignored when --task is set)", (v) => parseInt(v, 10), 3)
    .option("--model <id>", "Override the text model (default google/gemini-3.1-pro-preview)")
    .option("--task <text>", "Custom instruction that REPLACES the default 'pitch N concepts' task (still grounded in the bible) — e.g. write a full episode scenario")
    .action(async (slug: string, opts) => {
      requireRalphyLayout("workspace ideate");
      if (slug !== DEFAULT_WORKSPACE && !existsSync(workspaceDir(slug))) {
        raiseError("E_NOT_FOUND", { kind: "Workspace", id: slug });
      }
      const { blocks, used } = await gatherWorkspaceBible(slug);
      if (!blocks) {
        err(`No bible files found under ${workspaceDir(slug)} (need at least one of: ${BIBLE_FILES.join(", ")})`);
        return;
      }
      const manifest = await readWorkspaceManifest(slug);
      const name = (manifest?.name as string) || slug;
      const count = Number.isFinite(opts.count) && opts.count > 0 ? opts.count : 3;
      const model = (opts.model as string) || "google/gemini-3.1-pro-preview";

      const system =
        `You are the showrunner and creative director of the "${name}" short-form video universe ` +
        `(first-person POV choose-your-path shorts for TikTok/Reels). You are handed the universe BIBLE: ` +
        `the style lock, the per-domain quality rubrics the renders are graded against, and the recorded ` +
        `platform metrics of the shipped episodes. Your job is the TASK described at the end of the message — ` +
        `and whatever you produce must PASS every rubric below and honour the style lock. Be concrete and ` +
        `production-ready, never generic. Honour the rubrics exactly; do not invent constraints they do not state.`;

      const defaultTask =
        `Pitch ${count} DISTINCT next-episode concept${count === 1 ? "" : "s"}. ` +
        "Each must be a fresh, vivid LOCATION + 2 sexy NPC characters who interact with the POV hero, " +
        "with real consequences. For EACH concept give, as markdown:\n" +
        "- **Title** + one-line logline\n" +
        "- **Location** (vivid, detail-rich, crude-PS1 register; a new world, not a repeat)\n" +
        "- **Cast** — the 2 sexy NPCs (look + role + what makes each tempting/dangerous)\n" +
        "- **Cold-open hook** (the <3s scroll-stop beat)\n" +
        "- **The binary choice funnel** — every fork as `CHOICE A / CHOICE B`, each with its win AND loss/game-over consequence; show why each fork is a genuine ~50/50 with no telegraphed trap\n" +
        "- **Punchline ending** (a tight twist, 003-style)\n" +
        "- **Why it passes the rubric** — 2-3 lines mapping the concept to the scenario/character/location bars + the 1:00-2:00 duration band\n\n" +
        "Lead with the single concept you'd green-light first and say why in one line. Use the mandatory " +
        "`sabre-draw` opener assumption. Markdown only.";
      const taskBlock = opts.task ? String(opts.task) : defaultTask;

      const userText = [
        "## THE UNIVERSE BIBLE\n\n" + blocks,
        opts.brief ? `## EXTRA STEER FROM THE SHOWRUNNER\n\n${opts.brief}` : "",
        "## YOUR TASK\n\n" + taskBlock,
      ]
        .filter(Boolean)
        .join("\n\n");

      let text: string;
      let usedModel: string;
      try {
        const res = await callLLM({
          messages: [
            { role: "system", content: system },
            { role: "user", content: userText },
          ],
          model,
          temperature: 0.9,
          maxTokens: 6000,
          endpoint: "workspace-ideate",
        });
        text = res.text?.trim() ?? "";
        usedModel = res.model;
      } catch (e) {
        err(`ideate failed: ${(e as Error).message}`);
        return;
      }
      if (!text) {
        err(`ideate returned an empty draft (model ${model}) — retry or try a different --model`);
        return;
      }

      // Persist the draft as a NEW file (append-only contract — never overwrite).
      const ideasDir = path.join(workspaceDir(slug), "ideas");
      await fs.mkdir(ideasDir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const savedTo = path.join(ideasDir, `idea-${stamp}.md`);
      const header =
        `# ${name} — ${opts.task ? "ideate (custom task)" : "next-episode pitch"}\n\n` +
        `> Generated by \`ralphy workspace ideate ${slug}\` via ${usedModel}. ` +
        `Grounded in: ${used.join(", ")}.` +
        (opts.task ? ` Task: "${opts.task}".` : "") +
        (opts.brief ? ` Steer: "${opts.brief}".` : "") +
        `\n\n`;
      await fs.writeFile(savedTo, header + text + "\n");

      ok(`Ideate complete for ${slug}`);
      out({
        workspace: slug,
        model: usedModel,
        task: opts.task ? "custom" : `pitch:${count}`,
        groundedIn: used,
        chars: text.length,
        savedTo,
      });
    });

  // ── export (#502) ──────────────────────────────────────────────────────
  cmd
    .command("export <slug>")
    .description(
      "Export a trained workspace as a deployable bundle zip (#502): manifest.yaml (name, version, ralphy-version floor, required connector keys, required (model, capability, provider) coverage, trust default — requirements auto-derived from the graph's nodes), pipeline.json (the #498 graph workflow, JSON per D-03), prompts/, compositions/, evaluators/ (STYLE_LOCK.md, evaluators.json, metrics-benchmarks.json), calendar.yaml (recurring slots ONLY — dated entries are never bundled), refs/ (shared/refs as-is). Project artifacts and logs are NEVER bundled. Refuses with the concrete gap list when the workspace is not export-ready (no evaluators.json, no graph workflow, workflow lint errors). Read-only over the source workspace. Uses the system `zip` binary. Format doc: docs/workspace-bundle.md. Example: ralphy workspace export tech-news --out tech-news-v1.zip",
    )
    .option("--out <path>", "Output zip path (default: ./<slug>-bundle-v<version>.zip; never overwrites)")
    .option("--bundle-version <v>", "Bundle version written to the manifest (default 1.0.0)")
    .action(async (slug: string, opts) => {
      requireRalphyLayout("workspace export");
      const version = (opts.bundleVersion as string) || "1.0.0";
      const outPath = (opts.out as string) || `${slug}-bundle-v${version}.zip`;
      try {
        const result = exportWorkspaceBundle(slug, outPath, { version });
        ok(`Bundle exported: ${result.out}`);
        out({
          workspace: result.workspace,
          out: result.out,
          sizeBytes: result.sizeBytes,
          contents: result.contents,
          requiredConnectorKeys: result.manifest.requiredConnectorKeys,
          requiredCoverage: result.manifest.requiredCoverage,
          version: result.manifest.version,
          ralphyVersionFloor: result.manifest.ralphyVersionFloor,
          trustDefault: result.manifest.trustDefault,
        });
      } catch (e) {
        if (!(e instanceof BundleError)) throw e;
        switch (e.code) {
          case "not-found":
            raiseError("E_NOT_FOUND", { kind: "Workspace", id: slug });
            break;
          case "dep-missing":
            raiseError("E_DEP_MISSING", { dep: String(e.details[0] ?? "zip") });
            break;
          case "already-exists":
            raiseError("E_ALREADY_EXISTS", { kind: "Bundle", id: String(e.details[0] ?? outPath) });
            break;
          case "not-ready":
            // Structured refusal: name every gap, then exit non-zero.
            out({ workspace: slug, exportable: false, gaps: e.details as BundleGap[] });
            raiseError("E_VALIDATION_FAILED", { target: "workspace-bundle", detail: e.message });
            break;
          default:
            raiseError("E_VALIDATION_FAILED", { target: "workspace-bundle", detail: e.message });
        }
      }
    });

  // ── import (#502) ──────────────────────────────────────────────────────
  cmd
    .command("import <zip>")
    .description(
      "Import a workspace bundle zip (#502) as a NEW workspace. Validates BEFORE materializing anything: manifest.yaml parses, ralphyVersionFloor <= the current ralphy version, every required connector key is configured (missing keys are NAMED — refuse, or proceed with warnings via --allow-missing-keys), every required (model, capability, provider) coverage triple is known to the #497 matrix (gaps NAMED — refuse, or --allow-coverage-gaps), and the bundled pipeline lints green (#498 graph checks). Collision-safe: an existing workspace slug refuses unless --as <new-slug> is passed — import NEVER overwrites an existing workspace. Materializes workspace.json, workflows/, evaluator files, calendar.json (slots only), shared/refs/, prompts/, compositions/. Uses the system `unzip` binary. Format doc: docs/workspace-bundle.md. Example: ralphy workspace import tech-news-v1.zip --as my-channel",
    )
    .option("--as <slug>", "Import under this workspace slug (default: the manifest name)")
    .option("--allow-missing-keys", "Proceed with warnings when required connector keys are not set")
    .option("--allow-coverage-gaps", "Proceed with warnings when required coverage triples are unknown to the matrix")
    .action(async (zip: string, opts) => {
      requireRalphyLayout("workspace import");
      try {
        const result = importWorkspaceBundle(zip, {
          as: opts.as as string | undefined,
          allowMissingKeys: Boolean(opts.allowMissingKeys),
          allowCoverageGaps: Boolean(opts.allowCoverageGaps),
        });
        ok(`Workspace imported: ${result.workspace}`);
        out({
          workspace: result.workspace,
          path: result.path,
          bundle: result.bundle,
          workflows: result.workflows,
          warnings: result.warnings,
        });
      } catch (e) {
        if (!(e instanceof BundleError)) throw e;
        switch (e.code) {
          case "not-found":
            raiseError("E_FILE_UNREADABLE", { path: zip });
            break;
          case "dep-missing":
            raiseError("E_DEP_MISSING", { dep: String(e.details[0] ?? "unzip") });
            break;
          case "already-exists":
            raiseError("E_ALREADY_EXISTS", { kind: "Workspace", id: String(e.details[0] ?? "") });
            break;
          case "missing-keys":
            out({ imported: false, refusals: e.details as ImportRefusal[] });
            raiseError("E_ENV_KEY_MISSING", {
              key: (e.details as ImportRefusal[])
                .map((r) => r.detail.replace(/^required connector keys not set: /, ""))
                .join(", "),
            });
            break;
          default:
            // Structured refusal list (version floor, coverage gaps, pipeline lint).
            out({ imported: false, refusals: e.details as ImportRefusal[] });
            raiseError("E_VALIDATION_FAILED", { target: "workspace-bundle", detail: e.message });
        }
      }
    });

  // ── stats (pre-#108) ───────────────────────────────────────────────────
  cmd
    .command("stats")
    .description("Show workspace statistics")
    .action(async () => {
      const projectCount = await countDirs(projectsDir());
      const batchCount = await countDirs(batchesDir());
      const refCount = await countDirs(referencesDir());
      const totalBytes = await dirSize(workspace());
      const mb = Math.round((totalBytes / 1024 / 1024) * 100) / 100;

      out({
        projects: projectCount,
        batches: batchCount,
        references: refCount,
        totalSizeMB: mb,
        path: workspace(),
      });
    });

  cmd
    .command("clean")
    .description("Clean workspace contents")
    .option("--renders", "Only remove rendered videos")
    .option("--assets", "Only remove generated assets")
    .option("--all", "Remove everything in workspace (keeps engine config)")
    .action(async (opts) => {
      if (opts.renders) {
        const projects = await fs.readdir(projectsDir()).catch(() => [] as string[]);
        for (const p of projects) {
          await fs.rm(path.join(projectDir(p), "render"), { recursive: true, force: true });
          await fs.mkdir(path.join(projectDir(p), "render"), { recursive: true });
        }
        ok("Renders cleaned");
        out({ cleaned: "renders" });
      } else if (opts.assets) {
        const projects = await fs.readdir(projectsDir()).catch(() => [] as string[]);
        for (const p of projects) {
          await fs.rm(artifactsDir(p), { recursive: true, force: true });
          await fs.mkdir(artifactsDir(p), { recursive: true });
        }
        ok("Assets cleaned");
        out({ cleaned: "assets" });
      } else if (opts.all) {
        // Keep engine config; remove the active workspace's data dirs +
        // global references. The dirs resolve per layout mode (#108).
        for (const dir of [projectsDir(), batchesDir(), referencesDir(), templatesDir()]) {
          await fs.rm(dir, { recursive: true, force: true });
          await fs.mkdir(dir, { recursive: true });
        }
        ok("Workspace cleaned (config preserved)");
        out({ cleaned: "all" });
      } else {
        out({ error: "Specify --renders, --assets, or --all" });
      }
    });

  return cmd;
}
