import { Command } from "commander";
import fs from "fs/promises";
import path from "path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { addEntity, getEntity, updateEntity, deleteEntity } from "../lib/registry.js";
import { slugify, generateId } from "../lib/ids.js";
import { artifactsDir, projectRefsDir, resolveArtifactKindDirs, projectDir, layoutMode, workspaceDir } from "../lib/paths.js";
import { existsSync } from "node:fs";
import { out, ok, err } from "../lib/output.js";
import { raiseError } from "../lib/errors/index.js";
import { readLog, readGenerations, logUserPrompt, logUserAsset, logGeneration, type UserPromptEntry, type UserAssetEntry } from "../lib/gen-log.js";
import { transcribe, DEFAULT_MODEL, WHISPER_MODEL, type TranscribeLanguage, type TranscribeBackend } from "../lib/transcribe.js";
import { scoreScenario, type Scenario } from "../lib/score.js";
import { buildScorecard } from "../lib/scorecard.js";
import { SCORECARD_ARTIFACT } from "../lib/schemas/scorecard.js";
import { gradeProductionPlan, renderPlanGradeMarkdown } from "../lib/plan/grade.js";
import { PLAN_GRADE_ARTIFACT } from "../lib/schemas/plan-grade.js";
import { buildRepairPlan, renderRepairPlanMarkdown, type DeepVisionFile } from "../lib/repair.js";
import { recordApproval, budgetSummary, resolveExpiry } from "../lib/spend.js";
import type { EvalReport } from "../lib/eval/types.js";
import {
  councilPreflight,
  councilPolish,
  makeLlmCallRole,
  renderCouncilMarkdown,
} from "../lib/council.js";
import { parseProductionPlan } from "../lib/schemas/production-plan.js";
import { renderPlanMarkdown } from "../lib/plan/build.js";
import { compileProductionContract } from "../lib/production/compiler.js";
import { loadTemplateCandidates } from "../lib/plan/catalog.js";
import { llmEnrich } from "../lib/plan/enrich.js";
import {
  styleLockPath,
  hasStyleLock,
  requiresStyleLock,
  deterministicStyleLock,
  mergeStyleLockContent,
  renderStyleLockScaffold,
  type StyleLockContext,
} from "../lib/style-lock.js";
import { llmEnrichStyleLock } from "../lib/style-lock-enrich.js";
import { getContentMode } from "../lib/content-modes.js";
import { scaffoldImagePack, scoreImagePack } from "../lib/image-pack.js";
import { isImagePackKind, IMAGE_PACK_KINDS } from "../lib/schemas/image-pack.js";
import { protectExistingAsset } from "../lib/providers/shared.js";
import { probeFile, walkMediaFiles, classifyFile, diffManifestVsProbe, ensureFfprobe } from "../lib/ffprobe.js";
import { extractFrame, audioStats, contactSheet } from "../lib/ffmpeg-recipes.js";
import { resolveCommandContext } from "../lib/context.js";
import { ralphDir } from "../lib/paths.js";
import {
  createIteration,
  createProject,
  getProject,
  getWorkspace,
  listFeedback,
  listIterations,
  listProjectStages,
  listProjects,
  updateProject,
} from "../lib/store/scopes.js";
import { listProjectDocumentBindings } from "../lib/store/document-content.js";
import {
  projectTransferContext,
  resumeProjectTransfer,
  transferProject,
} from "../lib/store/transfers.js";
import { StoreConflictError } from "../lib/store/types.js";

async function safeJson(fp: string) {
  try { return JSON.parse(await fs.readFile(fp, "utf-8")); } catch { return null; }
}

export function projectCmd() {
  const cmd = new Command("project").description("Manage video projects");

  cmd
    .command("create [name]")
    .description("Create a Project")
    .option("--as <slug>", "Stable Project slug")
    .option("--name <name>", "Compatibility alias for the Project name")
    .option("--id <slug>", "Compatibility alias for --as")
    .option("--kind <kind>", "Compatibility metadata: video | image-pack", "video")
    .option("--workspace <id>", "Owning Workspace ID")
    .action((positionalName: string | undefined, opts, command: Command) => {
      if (!positionalName && !opts.name && !opts.id) {
        raiseError("E_VALIDATION_FAILED", {
          target: "name | --name | --id",
          detail: "a Project name or slug is required",
        });
      }
      if (opts.kind !== "video" && opts.kind !== "image-pack") {
        raiseError("E_VALIDATION_FAILED", {
          target: "--kind",
          detail: `unknown --kind '${opts.kind}'. Allowed: video | image-pack`,
        });
      }
      const name = positionalName ?? opts.name ?? titleCase(opts.id);
      const context = resolveDomainContext(command);
      const workspaceId = opts.workspace ?? context.workspaceId;
      out(
        createProject({
          workspaceId,
          name,
          slug: opts.as ?? opts.id ?? slugify(name),
          metadata: { kind: opts.kind },
        }),
      );
    });

  cmd
    .command("list")
    .description("List Projects in a Workspace")
    .option("--workspace <id>", "Workspace ID")
    .option("--cursor <cursor>", "Continue from an opaque cursor")
    .option("--limit <count>", "Maximum rows", parseCount)
    .action((opts, command: Command) => {
      const context = resolveDomainContext(command);
      out(
        listProjects({
          workspaceId: opts.workspace ?? context.workspaceId,
          cursor: opts.cursor,
          limit: opts.limit,
        }),
      );
    });

  cmd
    .command("show <id>")
    .description("Show a Project")
    .action((id: string, _opts, command: Command) => {
      const context = resolveDomainContext(command, id);
      out(getProject({ workspaceId: context.workspaceId, projectId: context.projectId ?? id }));
    });

  // ── status (#406) ────────────────────────────────────────────────────────
  // Machine-readable pipeline-status surface for agents. Bare form mirrors
  // `show <id> --status` (coarse stage + per-step booleans). `--contract`
  // returns the full production-contract ledger (per-phase satisfied/missing +
  // nextRecommendedAction) so an agent can self-check where a project sits in
  // the contract from `docs/playbooks/agent-production-contract.md`. NOT a
  // human wizard — JSON guidance only.
  cmd
    .command("status <id>")
    .description("Show database-derived Project stages, bindings, Iteration, and feedback")
    .action((id: string, _opts, command: Command) => {
      const context = resolveDomainContext(command, id);
      out(projectStatus(context.workspaceId, id));
    });

  // ── repair-plan (#409) ─────────────────────────────────────────────────────
  // Deterministic eval-to-repair core: read the project's eval output
  // (eval.json, + eval-deep-vision.json when present) and emit an ordered,
  // owner-classified RepairPlan the fixer agent presents to the user BEFORE any
  // paid regeneration. Pure parsing/state — makes ZERO model calls. The fixer's
  // hard "no paid call before approval" gate is structural: every item is born
  // approvalState=pending. Writes repair-plan.json + REPAIR_PLAN.md (append-only,
  // auto-versions via protectExistingAsset; never overwrites). JSON output.
  cmd
    .command("repair-plan <id>")
    .description(
      "Build a deterministic eval-to-repair plan (#409). Reads eval.json (+ eval-deep-vision.json's what_to_redo when present), classifies each finding by owner (art-director / scenarist / editor), orders by severity, and writes repair-plan.json + REPAIR_PLAN.md (append-only, auto-versions). Makes ZERO model calls — the fixer gates paid regeneration on user approval (every item starts approvalState=pending). JSON output.",
    )
    .option("--out-dir <path>", "Override where eval.json / eval-deep-vision.json are read and the plan is written (default: project dir)")
    .action(async (id: string, opts: any) => {
      const project = await getEntity("projects", id);
      if (!project) raiseError("E_NOT_FOUND", { kind: "Project", id });

      const dir = opts.outDir ? path.resolve(String(opts.outDir)) : projectDir(id);
      const evalReport = (await safeJson(path.join(dir, "eval.json"))) as EvalReport | null;
      if (!evalReport) {
        raiseError("E_NOT_FOUND", {
          kind: "eval.json",
          id: path.join(dir, "eval.json"),
        });
      }
      const deepVision = (await safeJson(
        path.join(dir, "eval-deep-vision.json"),
      )) as DeepVisionFile | null;

      const plan = buildRepairPlan(evalReport as EvalReport, deepVision);

      // Append-only: auto-version both artifacts when they already exist
      // (protectExistingAsset renames the existing file to .v{N}). AGENTS.md #14.
      await fs.mkdir(dir, { recursive: true });
      const jsonPath = path.join(dir, "repair-plan.json");
      const mdPath = path.join(dir, "REPAIR_PLAN.md");
      const archivedJson = await protectExistingAsset(jsonPath, false);
      const archivedMd = await protectExistingAsset(mdPath, false);
      await fs.writeFile(jsonPath, JSON.stringify(plan, null, 2) + "\n");
      await fs.writeFile(mdPath, renderRepairPlanMarkdown(plan));

      ok(`Repair plan written for ${id} (${plan.items.length} item(s), source: ${plan.sourcePreferred})`);
      out({
        project: id,
        plan,
        artifacts: {
          json: jsonPath,
          markdown: mdPath,
          ...(archivedJson ? { archivedJson } : {}),
          ...(archivedMd ? { archivedMarkdown: archivedMd } : {}),
        },
      });
    });

  // ── council (#415) ─────────────────────────────────────────────────────────
  // Convene a seven-role specialist council at one of the two expensive
  // decision points and persist a structured CouncilVerdict:
  //   --phase preflight → review production-plan.json BEFORE any paid generation.
  //   --phase polish    → review eval.json (+ eval-deep-vision.json) AFTER eval,
  //                       BEFORE Unit formation.
  // BOUNDED: text-only via callLLM() per role; NO media generation, NO browsing.
  // Writes council-preflight.json / council-polish.json (+ a readable .md),
  // append-only (auto-versions via protectExistingAsset). The polish verdict's
  // prioritizedActions speak the #409 repair vocabulary so they flow into
  // `ralphy project repair-plan` structurally. JSON output.
  cmd
    .command("council <id>")
    .description(
      "Convene a seven-role production council (#415). --phase preflight reviews production-plan.json BEFORE paid generation; --phase polish reviews eval.json (+ eval-deep-vision.json) AFTER eval and BEFORE Unit formation. Each role is a single callLLM() pass (NO media generation, NO browsing). Writes council-preflight.json / council-polish.json + a readable .md (append-only, auto-versions). The polish verdict's prioritizedActions use the #409 repair vocabulary so they feed `ralphy project repair-plan`. JSON output. Use --no-llm for the deterministic fixture (offline / abstaining roles).",
    )
    .requiredOption("--phase <phase>", "Council phase: preflight | polish")
    .option("--no-llm", "Skip the per-role LLM passes — deterministic abstaining roster (offline)")
    .action(async (id: string, opts: any) => {
      const project = await getEntity("projects", id);
      if (!project) raiseError("E_NOT_FOUND", { kind: "Project", id });

      const phase = String(opts.phase);
      if (phase !== "preflight" && phase !== "polish") {
        raiseError("E_VALIDATION_FAILED", {
          target: "--phase",
          detail: `expected "preflight" | "polish", got "${phase}"`,
        });
      }

      const dir = projectDir(id);
      // `--no-llm` → opts.llm === false (commander negates). Inject the live
      // per-role callLLM seam unless the user opted out.
      const deps = opts.llm === false ? {} : { callRole: makeLlmCallRole() };

      let verdict;
      if (phase === "preflight") {
        const planRaw = await safeJson(path.join(dir, "production-plan.json"));
        if (!planRaw) {
          raiseError("E_NOT_FOUND", {
            kind: "production-plan.json",
            id: path.join(dir, "production-plan.json"),
          });
        }
        let plan;
        try {
          plan = parseProductionPlan(planRaw);
        } catch (e) {
          raiseError("E_VALIDATION_FAILED", {
            target: "production-plan.json",
            detail: (e as Error).message,
          });
        }
        verdict = await councilPreflight(plan!, deps);
      } else {
        const evalReport = (await safeJson(path.join(dir, "eval.json"))) as EvalReport | null;
        if (!evalReport) {
          raiseError("E_NOT_FOUND", {
            kind: "eval.json",
            id: path.join(dir, "eval.json"),
          });
        }
        const deepVision = (await safeJson(
          path.join(dir, "eval-deep-vision.json"),
        )) as DeepVisionFile | null;
        verdict = await councilPolish(evalReport as EvalReport, deepVision, deps);
      }

      // Append-only: auto-version both artifacts when they already exist
      // (protectExistingAsset renames the existing file to .v{N}). AGENTS.md #14.
      await fs.mkdir(dir, { recursive: true });
      const jsonPath = path.join(dir, `council-${phase}.json`);
      const mdPath = path.join(dir, `council-${phase}.md`);
      const archivedJson = await protectExistingAsset(jsonPath, false);
      const archivedMd = await protectExistingAsset(mdPath, false);
      await fs.writeFile(jsonPath, JSON.stringify(verdict, null, 2) + "\n");
      await fs.writeFile(mdPath, renderCouncilMarkdown(verdict!));

      ok(`Council ${phase} review written for ${id} — verdict: ${verdict!.verdict}`);
      out({
        project: id,
        phase,
        verdict,
        artifacts: {
          json: jsonPath,
          markdown: mdPath,
          ...(archivedJson ? { archivedJson } : {}),
          ...(archivedMd ? { archivedMarkdown: archivedMd } : {}),
        },
      });
    });

  // ── plan (#407) ──────────────────────────────────────────────────────────
  // Agent-facing planning step: turn a chat brief into a structured production
  // plan BEFORE any paid generation. Created/updated AFTER the format/template
  // match (phase 3) and BEFORE scenario generation (phase 8) — it is the
  // contract phase-7 artifact (`PRODUCTION_PLAN.md`, see
  // docs/playbooks/agent-production-contract.md + cli/lib/contract.ts).
  //
  // Deterministic in-process: classifyContentMode + suggestTemplates (format/
  // template match) + model-stack→cost estimate. The LLM enrichment
  // (audience-language, register, scene-count/duration, first checkpoint,
  // vibe) runs through callLLM() jsonMode (logs a generations.jsonl row) and is
  // validated against ProductionPlanSchema. Writes PRODUCTION_PLAN.md (human)
  // and production-plan.json (the validated object); append-only — a second
  // plan auto-versions (.v2) and never overwrites. JSON output via out().
  cmd
    .command("plan <id>")
    .description(
      "Draft a structured production plan + compiled production contract from a brief (contract phase 7, #407/#418). Deterministic content-mode + template match + cost estimate; callLLM() enrichment for language/register/scene-count. The compiled production-contract.json adds the forward-looking execution contract — content mode, support classification (the #413 unsupported-mode refusal with the closest supported mode), required artifacts, eval/council gates, and Unit shape (distinct from the on-disk ledger `project status --contract`). Writes PRODUCTION_PLAN.md + production-plan.json + production-contract.json (append-only, auto-versions). JSON output.",
    )
    .requiredOption("--brief <text>", "The creative brief to plan from")
    .option("--aspect <ratio>", "Aspect ratio override (default: derived from format)")
    .option("--platform <platform>", "Target platform override (default: tiktok)")
    .option("--no-llm", "Skip the LLM enrichment pass — deterministic fields only")
    .action(async (id: string, opts: any) => {
      const project = await getEntity("projects", id);
      if (!project) raiseError("E_NOT_FOUND", { kind: "Project", id });

      const warnings: string[] = [];
      const candidates = await loadTemplateCandidates((m) => warnings.push(m));

      // Compile the production contract (#418): it builds the plan internally
      // (forwarding candidates + enrich) and folds it + the content-mode registry
      // into one forward-looking execution contract — content mode, support
      // classification (the #413 unsupported-mode refusal), required artifacts,
      // gates, Unit shape. NOT the on-disk ledger (`project status --contract`).
      const { plan, contract } = await compileProductionContract(
        { projectId: id, brief: opts.brief, aspect: opts.aspect, platform: opts.platform },
        {
          candidates,
          // `--no-llm` → opts.llm === false (commander negates). Skip enrichment.
          enrich: opts.llm === false ? undefined : (ctx) => llmEnrich(ctx),
        },
      );

      // Append-only: auto-version all artifacts if they already exist
      // (protectExistingAsset renames the existing file to .v{N}). AGENTS.md #14.
      const dir = projectDir(id);
      await fs.mkdir(dir, { recursive: true });
      const mdPath = path.join(dir, "PRODUCTION_PLAN.md");
      const jsonPath = path.join(dir, "production-plan.json");
      const contractPath = path.join(dir, "production-contract.json");
      const archivedMd = await protectExistingAsset(mdPath, false);
      const archivedJson = await protectExistingAsset(jsonPath, false);
      const archivedContract = await protectExistingAsset(contractPath, false);
      await fs.writeFile(mdPath, renderPlanMarkdown(plan));
      await fs.writeFile(jsonPath, JSON.stringify(plan, null, 2) + "\n");
      await fs.writeFile(contractPath, JSON.stringify(contract, null, 2) + "\n");

      // Mirror the brief into user-prompts.jsonl (the contract's brief-capture
      // intent) so the plan's provenance is in the project's append-only log.
      await logUserPrompt(id, { text: opts.brief, stage: "plan", note: "production plan brief" });

      ok(`Production plan written for ${id}`);
      out({
        project: id,
        plan,
        contract,
        artifacts: {
          markdown: mdPath,
          json: jsonPath,
          contract: contractPath,
          ...(archivedMd ? { archivedMarkdown: archivedMd } : {}),
          ...(archivedJson ? { archivedJson } : {}),
          ...(archivedContract ? { archivedContract } : {}),
        },
        ...(warnings.length ? { warnings } : {}),
      });
    });

  cmd
    .command("style-lock <id>")
    .description(
      "Scaffold/write the STYLE_LOCK.md benchmark/style grounding artifact (contract phase 6, #408). Deterministic scaffold (visual register / pacing / hook / caption+audio / do-not-do / benchmark refs / model implications) seeded from the project's production-plan.json (content_mode, template, register, guidelines), plus one callLLM() jsonMode enrichment pass (skip with --no-llm). Append-only — auto-versions to STYLE_LOCK.v{N}.md, never overwrites. Use --check [--mode <m>] to gate: exits non-zero when the lock is missing for a covered content mode. JSON output.",
    )
    .option("--brief <text>", "Brief override (default: read from production-plan.json)")
    .option("--mode <mode>", "Content-mode override (default: read from production-plan.json; required for --check on a plan-less project)")
    .option("--no-llm", "Skip the LLM enrichment pass — deterministic scaffold only")
    .option(
      "--check",
      "Gate mode: report { ok, hasLock, required, refuse } and exit non-zero when the lock is missing for a covered mode. Writes nothing.",
    )
    .action(async (id: string, opts: any) => {
      const project = await getEntity("projects", id);
      if (!project) raiseError("E_NOT_FOUND", { kind: "Project", id });

      // Resolve content_mode: explicit --mode wins, else the production plan's
      // recorded mode. The plan also seeds the deterministic scaffold context.
      const plan = await safeJson(path.join(projectDir(id), "production-plan.json"));
      const planMode: string | null = plan?.contentMode?.mode ?? null;
      const mode: string | null = opts.mode ?? planMode;
      const required = requiresStyleLock(mode);
      const modeEntry = mode ? getContentMode(mode) : undefined;

      // ── --check: gate, never write ──
      if (opts.check) {
        const lockPresent = hasStyleLock(id);
        const refuse = required && !lockPresent;
        out({
          project: id,
          mode: mode ?? null,
          hasLock: lockPresent,
          required,
          ok: !refuse,
          refuse,
          ...(refuse
            ? {
                reason: `Content mode "${mode}" requires a locked STYLE_LOCK.md before art-direction (#408). Run \`ralphy project style-lock ${id}\` to scaffold it.`,
              }
            : {}),
          path: styleLockPath(id),
        });
        if (refuse) process.exit(1);
        return;
      }

      // ── scaffold/write path ──
      const ctx: StyleLockContext = {
        projectId: id,
        brief: opts.brief ?? plan?.brief ?? project.brief ?? null,
        contentMode: mode,
        required,
        guidelineSlugs: modeEntry?.guidelineOrStyleLock.guidelineSlugs ?? [],
        templateSlug: plan?.formatTemplate?.templateSlug ?? null,
        register: plan?.register ?? null,
        vibe: plan?.vibe ?? null,
        aspect: plan?.aspect ?? null,
        platform: plan?.platform ?? null,
        benchmarkSource: plan?.benchmarkSource ?? null,
        benchmarkSet: modeEntry?.benchmarkSet ?? null,
      };

      const fallback = deterministicStyleLock(ctx);
      let enriched: Partial<typeof fallback> | null = null;
      let llmUsed = false;
      // `--no-llm` → opts.llm === false (commander negates).
      if (opts.llm !== false) {
        try {
          enriched = await llmEnrichStyleLock(ctx);
          llmUsed = true;
        } catch {
          // Network / malformed JSON / no key → deterministic scaffold only.
          enriched = null;
          llmUsed = false;
        }
      }
      const content = mergeStyleLockContent(fallback, enriched);
      const body = renderStyleLockScaffold(ctx, content);

      // Append-only: auto-version if STYLE_LOCK.md already exists (#14).
      const dir = projectDir(id);
      await fs.mkdir(dir, { recursive: true });
      const lockPath = styleLockPath(id);
      const archived = await protectExistingAsset(lockPath, false);
      await fs.writeFile(lockPath, body);

      // A URL/handle benchmark must be crawled via researcher / site-grounding,
      // not by this verb — surface that as guidance (AGENTS #15).
      const benchmarkIsUrl = !!ctx.benchmarkSource && /^https?:\/\//i.test(ctx.benchmarkSource);
      const guidance: string[] = [];
      if (benchmarkIsUrl) {
        guidance.push(
          `Benchmark source is a URL (${ctx.benchmarkSource}) — route it through the researcher / site-grounding sub-agent (AGENTS #15) and fold the digest into STYLE_LOCK.md; this verb does NOT crawl it.`,
        );
      }
      if (!llmUsed && opts.llm !== false) {
        guidance.push("LLM enrichment unavailable (no key / network / malformed) — wrote the deterministic scaffold; fill the TODO sections by hand.");
      }
      if (modeEntry?.guidelineOrStyleLock.guidelineSlugs.length) {
        guidance.push(
          `Applicable guidelines: ${modeEntry.guidelineOrStyleLock.guidelineSlugs.join(", ")} — run \`ralphy guideline show <slug>\` and fold the rules in.`,
        );
      }

      ok(`Style lock written for ${id}`);
      out({
        project: id,
        mode: mode ?? null,
        required,
        llmEnriched: llmUsed,
        path: lockPath,
        ...(archived ? { archived } : {}),
        ...(guidance.length ? { guidance } : {}),
      });
    });

  cmd
    .command("update <id>")
    .description("Update Project metadata with optimistic concurrency")
    .option("--name <name>")
    .option("--slug <slug>")
    .option("--state <state>", "active | archived")
    .requiredOption("--expected <version>", "Expected row version", parseCount)
    .action((id: string, opts, command: Command) => {
      const context = resolveDomainContext(command, id);
      getProject({ workspaceId: context.workspaceId, projectId: id });
      if (opts.state !== undefined && opts.state !== "active" && opts.state !== "archived") {
        raiseError("E_INPUT_INVALID", {
          field: "--state",
          detail: "expected active or archived",
        });
      }
      try {
        out(
          updateProject(
            id,
            { name: opts.name, slug: opts.slug, state: opts.state },
            opts.expected,
          ),
        );
      } catch (error) {
        if (error instanceof StoreConflictError) {
          raiseError("E_CONFLICT", { kind: "Project", id });
        }
        throw error;
      }
    });

  cmd
    .command("iterate <id>")
    .description("Start the next Project Iteration")
    .requiredOption("--title <title>", "Iteration title")
    .option("--reason <reason>", "Iteration reason")
    .action((id: string, opts, command: Command) => {
      const context = resolveDomainContext(command, id);
      getProject({ workspaceId: context.workspaceId, projectId: id });
      out(createIteration({ projectId: id, title: opts.title, reason: opts.reason }));
    });

  cmd
    .command("transfer [id]")
    .description("Journal and verify a Project bucket transfer")
    .option("--to <workspace-id>", "Destination Workspace ID")
    .option("--resume <transfer-id>", "Resume a transfer journal")
    .option("--expected <version>", "Expected Project row version", parseCount)
    .action(async (id: string | undefined, opts, command: Command) => {
      try {
        if (opts.resume) {
          let context;
          try {
            context = domainQueryContext(resolveDomainContext(command));
          } catch (error) {
            const globals = command.optsWithGlobals();
            if (globals.session || globals.workspace || globals.project) throw error;
            context = projectTransferContext(opts.resume);
          }
          out(
            await resumeProjectTransfer(opts.resume, {
              context,
            }),
          );
          return;
        }
        if (!id || !opts.to || opts.expected === undefined) {
          raiseError("E_INPUT_INVALID", {
            field: "project transfer",
            detail: "--to and --expected are required unless --resume is used",
          });
        }
        const context = resolveDomainContext(command, id);
        getProject({ workspaceId: context.workspaceId, projectId: id });
        try {
          getWorkspace(opts.to);
        } catch {
          raiseError("E_NOT_FOUND", { kind: "Workspace", id: opts.to });
        }
        out(
          await transferProject({
            context: domainQueryContext(context),
            projectId: id,
            destinationWorkspaceId: opts.to,
            expectedRowVersion: opts.expected,
          }),
        );
      } catch (error) {
        if (error instanceof StoreConflictError) {
          raiseError("E_CONFLICT", { kind: "Project", id: id ?? opts.resume });
        }
        throw error;
      }
    });

  cmd
    .command("delete <id>")
    .description("Delete a project")
    .option("--keep-render", "Keep the final rendered video")
    .action(async (id: string, opts: any) => {
      const dir = projectDir(id);
      try {
        if (opts.keepRender) {
          // Delete everything except render/
          for (const entry of await fs.readdir(dir)) {
            if (entry !== "render") {
              await fs.rm(path.join(dir, entry), { recursive: true, force: true });
            }
          }
        } else {
          await fs.rm(dir, { recursive: true, force: true });
        }
      } catch { /* dir may not exist */ }
      await deleteEntity("projects", id);
      ok(`Project deleted: ${id}`);
      out({ deleted: id });
    });

  cmd
    .command("log <id>")
    .description("Tail project logs (generations / user-prompts / user-assets)")
    .option("--type <type>", "Log type: generations | user-prompts | user-assets | all", "generations")
    .option("--limit <n>", "Max entries (newest last)", (v) => parseInt(v, 10), 50)
    .action(async (id: string, opts: any) => {
      const project = await getEntity("projects", id);
      if (!project) raiseError("E_NOT_FOUND", { kind: "Project", id });

      const types: Array<"generations" | "user-prompts" | "user-assets"> =
        opts.type === "all" ? ["user-prompts", "user-assets", "generations"] : [opts.type];

      const combined: any[] = [];
      for (const t of types) {
        // Use the normalizer for generations so legacy rows (top-level slot, costUsd,
        // missing model) are coerced to canonical before display. #032
        const entries = t === "generations" ? await readGenerations(id) : await readLog(id, t);
        for (const e of entries) combined.push({ _type: t, ...(e as object) });
      }
      combined.sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
      const sliced = combined.slice(-opts.limit);
      out(sliced);
    });

  cmd
    .command("timeline <id>")
    .description("Merged project timeline (user requests + assets + generations) as pretty chronological log")
    .action(async (id: string) => {
      const project = await getEntity("projects", id);
      if (!project) raiseError("E_NOT_FOUND", { kind: "Project", id });
      const [prompts, assets, gens] = await Promise.all([
        readLog<UserPromptEntry>(id, "user-prompts"),
        readLog<UserAssetEntry>(id, "user-assets"),
        readGenerations(id), // canonicalizes legacy rows transparently (#032)
      ]);
      type Row = { timestamp: string; kind: string; summary: string };
      const rows: Row[] = [];
      for (const p of prompts) rows.push({
        timestamp: p.timestamp,
        kind: "user:prompt" + (p.stage ? `[${p.stage}]` : ""),
        summary: p.text.replace(/\s+/g, " ").slice(0, 120),
      });
      for (const a of assets) rows.push({
        timestamp: a.timestamp,
        kind: "user:asset[" + a.kind + "]",
        summary: (a.purpose ? `${a.purpose} — ` : "") + (a.dest || a.source).slice(-80),
      });
      for (const g of gens) rows.push({
        timestamp: g.timestamp,
        kind: `gen:${g.kind}[${g.provider}]`,
        summary: `${g.endpoint} ${g.status === "ok" ? "✓" : "✗"}${g.note ? " — " + g.note : ""}`,
      });
      rows.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      out(rows);
    });

  cmd
    .command("log-prompt [id]")
    .description("Append a user-prompt entry to project logs. Accept project id positionally OR via --project (#031).")
    .option("--project <id>", "Project id (alternative to the positional <id>)")
    .requiredOption("--text <text>", "Prompt text")
    .option("--stage <stage>", "Stage label (brief | feedback | ...)")
    .option("--note <note>", "Free-form note")
    .action(async (idArg: string | undefined, opts: any) => {
      const id = idArg ?? (opts.project as string | undefined);
      if (!id) raiseError("E_VALIDATION_FAILED", { target: "project id", detail: "pass it positionally or via --project" });
      const project = await getEntity("projects", id);
      if (!project) raiseError("E_NOT_FOUND", { kind: "Project", id });
      await logUserPrompt(id, { text: opts.text, stage: opts.stage, note: opts.note });
      ok(`Prompt logged for ${id}`);
      out({ project: id, logged: "user-prompt" });
    });

  cmd
    .command("log-asset [id]")
    .description(
      "Append a user-asset entry to project logs. Accept project id positionally OR via --project (#031). With --copy-from <src>, copies the file into <project>/artifacts/refs/ first (auto-detects disposable macOS NSIRD / /tmp paths and rescues them before they evaporate). Sanitizes U+202F NARROW NO-BREAK SPACE in filenames.",
    )
    .option("--project <id>", "Project id (alternative to the positional <id>)")
    .requiredOption("--kind <kind>", "screenshot | photo | video | audio | doc | ref-url | other")
    .requiredOption("--source <source>", "Original path or URL")
    .option("--dest <dest>", "Stored path inside project (used as-is if no --copy-from)")
    .option(
      "--copy-from <src>",
      "Local file to copy into <project>/artifacts/refs/ before logging. NSIRD / NSTemporaryDirectory paths get rescued before macOS auto-deletes them (skater + appstore postmortems).",
    )
    .option("--purpose <purpose>", "character-ref | product-ref | brand-screenshot | ...")
    .option("--note <note>", "Free-form note")
    .action(async (idArg: string | undefined, opts: any) => {
      const id = idArg ?? (opts.project as string | undefined);
      if (!id) raiseError("E_VALIDATION_FAILED", { target: "project id", detail: "pass it positionally or via --project" });
      const project = await getEntity("projects", id);
      if (!project) raiseError("E_NOT_FOUND", { kind: "Project", id });

      // Disposable-path detector (issue #038). macOS screenshot temp paths
      // auto-delete within minutes; warn loudly when the user logs one
      // without --copy-from so they at least know the file is on borrowed time.
      const looksDisposable = (p: string): boolean => {
        if (!p) return false;
        return (
          p.includes("/var/folders/") ||
          p.includes("NSIRD_") ||
          p.includes("/TemporaryItems/") ||
          p.startsWith("/tmp/") ||
          /\/Screenshot[^/]*\.png$/i.test(p) ||
          // macOS localized screenshot prefix (Russian for "Screenshot") —
          // ASCII-escaped so no raw Cyrillic lands on disk (lint:no-cyrillic, #465).
          /\/\u0421\u043D\u0438\u043C\u043E\u043A \u044D\u043A\u0440\u0430\u043D\u0430[^/]*\.png$/i.test(p)
        );
      };

      let dest = opts.dest as string | undefined;
      let originalPath: string | undefined;
      let localPath: string | undefined;

      if (opts.copyFrom) {
        const src = path.resolve(opts.copyFrom);
        originalPath = src;
        // Sanitize the basename: replace U+202F NARROW NO-BREAK SPACE / U+00A0 NBSP /
        // U+200B ZERO-WIDTH SPACE / U+2007 FIGURE SPACE with a regular hyphen.
        // macOS NSIRD paths contain these (appstore postmortem hit ENOENT on `ls`
        // showed the file but `cp` failed because of invisible U+202F between words).
        const rawBase = path.basename(src);
        const sanitized = rawBase
          .replace(/[   ​]/g, "-")
          .replace(/\s+/g, "-");
        const refsDir = projectRefsDir(id);
        await fs.mkdir(refsDir, { recursive: true });

        // Idempotency: if a file with the same name already exists in refs/
        // AND has the same sha256, skip the copy (AGENTS.md invariant #14 —
        // never overwrite existing refs/ files without explicit consent).
        // If the name collides but the sha differs, pick the next free
        // `<stem>-N<ext>` slot — never overwrite.
        const sha = async (p: string): Promise<string> => {
          const buf = await fs.readFile(p);
          return crypto.createHash("sha256").update(buf).digest("hex");
        };

        let srcSha = "";
        try {
          srcSha = await sha(src);
        } catch (e) {
          err(`Failed to read ${src}: ${(e as Error).message}`);
        }

        let candidate = path.join(refsDir, sanitized);
        let copied = false;
        let skippedSameSha = false;
        let collided = false;
        try {
          const stat = await fs.stat(candidate).catch(() => null);
          if (stat && stat.isFile()) {
            const existingSha = await sha(candidate);
            if (existingSha === srcSha) {
              skippedSameSha = true;
            } else {
              collided = true;
              const ext = path.extname(sanitized);
              const stem = sanitized.slice(0, sanitized.length - ext.length);
              let n = 2;
              while (true) {
                const next = path.join(refsDir, `${stem}-${n}${ext}`);
                const exists = await fs.stat(next).catch(() => null);
                if (!exists) { candidate = next; break; }
                if (exists.isFile()) {
                  const existSha = await sha(next);
                  if (existSha === srcSha) {
                    candidate = next;
                    skippedSameSha = true;
                    break;
                  }
                }
                n += 1;
                if (n > 9999) {
                  err(`Too many filename collisions for ${sanitized} in refs/`);
                  break;
                }
              }
            }
          }
          if (!skippedSameSha) {
            await fs.copyFile(src, candidate);
            copied = true;
          }
          dest = candidate;
          localPath = candidate;

          if (looksDisposable(src)) {
            // eslint-disable-next-line no-console
            console.error(
              `ralphy: rescued disposable path → ${candidate} (source was under ${src.split("/").slice(0, 5).join("/")}/...)`,
            );
          }
          if (sanitized !== rawBase) {
            // eslint-disable-next-line no-console
            console.error(
              `ralphy: filename sanitized: "${rawBase}" → "${sanitized}"`,
            );
          }
          if (skippedSameSha) {
            // eslint-disable-next-line no-console
            console.error(
              `ralphy: copy skipped (same sha256 already at ${candidate})`,
            );
          } else if (copied && collided) {
            // eslint-disable-next-line no-console
            console.error(
              `ralphy: name collision (different sha256), wrote ${candidate}`,
            );
          }
        } catch (e) {
          err(`Failed to copy ${src} → ${candidate}: ${(e as Error).message}`);
        }
      } else if (looksDisposable(opts.source)) {
        // Warn when the user logs a path that macOS will eat. The asset is
        // load-bearing for the art-director stage; losing it is silent data loss.
        // (issue #038)
        // eslint-disable-next-line no-console
        console.error(
          `ralphy: warning — "${opts.source}" looks like a disposable / temp path (macOS NSIRD, /tmp, or "Screenshot ...png"). Pass --copy-from <src> to stash it in <project>/artifacts/refs/ before it auto-deletes. (issue #038)`,
        );
      }

      await logUserAsset(id, {
        kind: opts.kind,
        source: opts.source,
        dest,
        originalPath,
        localPath,
        purpose: opts.purpose,
        note: opts.note,
      });
      ok(`Asset logged for ${id}${dest ? ` (saved at ${dest})` : ""}`);
      out({
        project: id,
        logged: "user-asset",
        kind: opts.kind,
        dest,
        originalPath,
        localPath,
      });
    });

  cmd
    .command("score <id>")
    .description("Run virality rubric over scenario.json (Hard fails + warnings, no LLM)")
    .option("--strict", "Exit with code 1 if any failure")
    .action(async (id: string, opts: any) => {
      const project = await getEntity("projects", id);
      if (!project) raiseError("E_NOT_FOUND", { kind: "Project", id });
      const scenario = (await safeJson(
        path.join(projectDir(id), "scenario.json")
      )) as Scenario | null;
      if (!scenario) err(`No scenario.json found for ${id}`);

      const result = scoreScenario(scenario as Scenario);
      out({
        project: id,
        passed: result.passed,
        failures: result.failures,
        warnings: result.warnings,
      });
      if (opts.strict && !result.passed) {
        process.exit(1);
      }
    });

  // ── image-pack (#429) ─────────────────────────────────────────────────────────
  // First-class image-pack workflow scaffold + eval rubric. The NEW glue around
  // pieces that already exist: it EMITS a batch-ready prompts/pack.jsonl for
  // `generate image --batch` (#024), creates the `selected/` sibling so the
  // contract probe (cli/lib/contract.ts) types the project as `image-pack`, and
  // writes pack.json (the ImagePackSpec + provenance). Append-only (#14) — a
  // prior pack.json auto-versions unless --force. `--score` runs the deterministic
  // image-pack rubric (role coverage / aspect / selected-set cohesion; model-
  // dependent checks are seams to #439/#422). JSON output. Run AFTER
  // `ralphy project create --id <id> --kind image-pack`.
  cmd
    .command("image-pack <id>")
    .description(
      "Scaffold a first-class image-pack workflow (#429): writes pack.json (slot roles + composition classes per kind) + a batch-ready prompts/pack.jsonl for `generate image --batch` (#024), and creates artifacts/images/, artifacts/refs/, selected/, prompts/, logs/. Default slot sets per --kind: app-store / play-store (hero → feature-callouts → lifestyle → dimensions → comparison → usage → cta), ad-creative (the fb-creatives A-E 5-set), social (cover + N feed). --count tunes the repeatable middle of the set. Append-only — a prior pack.json auto-versions unless --force. --score runs the deterministic eval rubric (role coverage / aspect / selected-set cohesion) instead of scaffolding. JSON output. Example: ralphy project image-pack take-a-minute-001 --kind app-store --count 4",
    )
    .option("--kind <kind>", `Pack kind: ${IMAGE_PACK_KINDS.join(" | ")}`, "app-store")
    .option("--count <n>", "Tune the repeatable middle of the slot set (feature callouts / feed stills / concepts-per-set)", (v) => parseInt(v, 10))
    .option("--force", "Bypass append-only auto-versioning and overwrite an existing pack.json / prompts/pack.jsonl in place")
    .option("--score", "Run the deterministic image-pack eval rubric (role coverage / aspect / selected-set cohesion) instead of scaffolding")
    .action(async (id: string, opts: any) => {
      const project = await getEntity("projects", id);
      if (!project) raiseError("E_NOT_FOUND", { kind: "Project", id });

      // ── --score: run the rubric, write nothing ──
      if (opts.score) {
        const result = scoreImagePack({ projectId: id });
        out({
          project: result.project,
          kind: result.kind ?? null,
          expectedSlots: result.expectedSlots,
          coveredSlots: result.coveredSlots,
          selectedCount: result.selectedCount,
          verdict: result.scoring.verdict,
          score: result.scoring.score,
          findings: result.findings,
        });
        return;
      }

      // ── scaffold path ──
      const kind = String(opts.kind || "app-store");
      if (!isImagePackKind(kind)) {
        raiseError("E_VALIDATION_FAILED", {
          target: "--kind",
          detail: `unknown image-pack kind '${kind}'. Allowed: ${IMAGE_PACK_KINDS.join(" | ")}`,
        });
      }
      const result = await scaffoldImagePack({
        projectId: id,
        kind: kind as any,
        count: typeof opts.count === "number" && !Number.isNaN(opts.count) ? opts.count : undefined,
        force: opts.force === true,
      });

      ok(`Image pack scaffolded for ${id} (${result.kind}, ${result.slotCount} slot(s))`);
      out({
        project: result.projectId,
        kind: result.kind,
        aspect: result.spec.aspect,
        slotCount: result.slotCount,
        slots: result.spec.slots.map((s) => ({ id: s.id, role: s.role, compositionClass: s.compositionClass })),
        packJson: result.packJson,
        promptsJsonl: result.promptsJsonl,
        batchCommand: result.batchCommand,
        ...(result.archivedPackJson ? { archivedPackJson: result.archivedPackJson } : {}),
      });
    });

  // ── scorecard (#427) ────────────────────────────────────────────────────────
  // Deterministic release-readiness AGGREGATOR. It INGESTS the reports the other
  // gates already produced (eval.json, fidelity.json, council-polish.json,
  // STYLE_LOCK.md, distribution-pack.json) + the contract's `polished` and merges
  // them into ONE mode-aware verdict. It re-runs NOTHING and makes ZERO model
  // calls. Writes scorecard.json (append-only, auto-versions via
  // protectExistingAsset; never overwrites — AGENTS.md #14). JSON output.
  cmd
    .command("scorecard <id>")
    .description(
      "Release-readiness scorecard (#427). Deterministic AGGREGATOR — INGESTS the persisted gate reports (eval.json, fidelity.json, council-polish.json, STYLE_LOCK.md, distribution-pack.json) + the contract's native-video-gated `polished` and merges them into ONE mode-aware verdict (ship | repair | needs-user-decision | blocked) with twelve per-dimension readings. Re-runs no gate, makes ZERO model calls, never mutates the project. A missing source artifact makes that dimension `na`. Writes scorecard.json (append-only, auto-versions). JSON output. Example: ralphy project scorecard spring-001 --mode ugc-review",
    )
    .option("--mode <mode>", "Content-mode override for the thresholds (default: production-plan.json contentMode)")
    .action(async (id: string, opts: any) => {
      const project = await getEntity("projects", id);
      if (!project) raiseError("E_NOT_FOUND", { kind: "Project", id });

      const card = buildScorecard({ projectId: id, mode: opts.mode ? String(opts.mode) : null });

      // Append-only: auto-version a prior scorecard.json (protectExistingAsset
      // renames the existing file to .v{N}). AGENTS.md #14.
      const dir = projectDir(id);
      await fs.mkdir(dir, { recursive: true });
      const jsonPath = path.join(dir, SCORECARD_ARTIFACT);
      const archivedJson = await protectExistingAsset(jsonPath, false);
      await fs.writeFile(jsonPath, JSON.stringify(card, null, 2) + "\n");

      ok(`Scorecard for ${id} — verdict: ${card.verdict}${card.polished === null ? "" : ` (polished: ${card.polished})`}`);
      out({
        project: id,
        verdict: card.verdict,
        polished: card.polished,
        reason: card.reason,
        mode: card.mode,
        requiredDimensions: card.requiredDimensions,
        dimensions: card.dimensions,
        artifact: jsonPath,
        ...(archivedJson ? { archivedJson } : {}),
      });
    });

  // ── grade-plan (#432) ─────────────────────────────────────────────────────
  // Deterministic PRODUCTION-PLAN quality grader. Reads production-plan.json and
  // grades it AGAINST the content-mode registry expectations (requiredInputs /
  // requiredRefTypes / defaultResearchDepth / guidelineOrStyleLock / qualityGates)
  // plus the plan's own model stack, cost estimate, and first checkpoint — BEFORE
  // the plan becomes the contract for expensive work. The plan-stage analog of
  // `project scorecard`. Makes ZERO model calls. Writes plan-grade.json +
  // PLAN_GRADE.md (append-only, auto-versions via protectExistingAsset; never
  // overwrites — AGENTS.md #14). JSON output.
  cmd
    .command("grade-plan <id>")
    .description(
      "Grade a production plan BEFORE it becomes the contract for expensive work (#432). Deterministic CRITIC — reads production-plan.json and grades it against the content-mode registry expectations (mode fit, missing inputs, research grounding, style lock, model stack, cost/ETA, gates, first checkpoint) into ONE verdict (strong | weak | blocked). BLOCKED when the plan lacks a required artifact for its mode (a required ref type / input missing, a lock-required mode with no style lock, an empty stack, an unsupported/unclassified mode). Makes ZERO model calls. Writes plan-grade.json + PLAN_GRADE.md (append-only, auto-versions). JSON output. Example: ralphy project grade-plan spring-001",
    )
    .action(async (id: string) => {
      const project = await getEntity("projects", id);
      if (!project) raiseError("E_NOT_FOUND", { kind: "Project", id });

      const dir = projectDir(id);
      const planRaw = await safeJson(path.join(dir, "production-plan.json"));
      if (!planRaw) {
        raiseError("E_NOT_FOUND", { kind: "production-plan.json", id: path.join(dir, "production-plan.json") });
      }
      let plan;
      try {
        plan = parseProductionPlan(planRaw);
      } catch (e) {
        raiseError("E_VALIDATION_FAILED", { target: "production-plan.json", detail: (e as Error).message });
      }

      const grade = await gradeProductionPlan(plan!);

      // Append-only: auto-version a prior plan-grade.json / PLAN_GRADE.md
      // (protectExistingAsset renames the existing file to .v{N}). AGENTS.md #14.
      await fs.mkdir(dir, { recursive: true });
      const jsonPath = path.join(dir, PLAN_GRADE_ARTIFACT);
      const mdPath = path.join(dir, "PLAN_GRADE.md");
      const archivedJson = await protectExistingAsset(jsonPath, false);
      const archivedMd = await protectExistingAsset(mdPath, false);
      await fs.writeFile(jsonPath, JSON.stringify(grade, null, 2) + "\n");
      await fs.writeFile(mdPath, renderPlanGradeMarkdown(grade));

      ok(`Plan grade for ${id} — verdict: ${grade.verdict}`);
      out({
        project: id,
        verdict: grade.verdict,
        reason: grade.reason,
        mode: grade.mode,
        dimensions: grade.dimensions,
        artifacts: {
          json: jsonPath,
          markdown: mdPath,
          ...(archivedJson ? { archivedJson } : {}),
          ...(archivedMd ? { archivedMarkdown: archivedMd } : {}),
        },
      });
    });

  // ── approve (#444) ─────────────────────────────────────────────────────────
  // Record a spend approval into the project-local spend ledger (#444). The
  // ledger is OPT-IN: with no approval recorded, generation proceeds exactly as
  // today. Once recorded, `ralphy generate` checks the active approval BEFORE
  // any paid call and hard-stops when the call would breach it (expired, mode
  // not allowed, or spent+estimated > cap). The `approvals[]` list is
  // append-only — a new approval appends; prior approvals are never rewritten
  // (AGENTS.md #14). JSON output.
  cmd
    .command("approve <id>")
    .description(
      "Record a spend approval into the project-local spend ledger (#444). Sets a hard USD budget cap, optionally the allowed content modes, an expiry, and a user-facing reason. OPT-IN: with no approval recorded, generation is unchanged; once recorded, `ralphy generate` checks the active approval BEFORE every paid call and hard-stops when it would breach (expired / mode not allowed / spent+estimated > cap). Append-only — a new approval appends, never overwrites (spend-ledger.json). JSON output. Example: ralphy project approve spring-001 --cap 10 --modes ugc-review,unboxing-ugc --expiry 24h --reason \"approved batch run\"",
    )
    .requiredOption("--cap <usd>", "Hard USD cap on cumulative actual spend for the scope", parseFloat)
    .requiredOption("--reason <text>", "User-facing reason the budget was approved (auditable)")
    .option("--modes <list>", "Comma-separated content modes this approval permits (default: any mode)")
    .option("--expiry <iso|duration>", "Expiry as an ISO timestamp or a duration (e.g. 24h, 7d, 30m, 2w). Default: never expires")
    .option("--scope <scope>", "project | batch", "project")
    .action(async (id: string, opts: any) => {
      const project = await getEntity("projects", id);
      if (!project) raiseError("E_NOT_FOUND", { kind: "Project", id });

      const cap = Number(opts.cap);
      if (!Number.isFinite(cap) || cap < 0) {
        raiseError("E_INPUT_INVALID", { field: "cap", detail: "must be a non-negative number", verb: "project approve" });
      }
      const scope = String(opts.scope) === "batch" ? "batch" : "project";
      const allowedModes = opts.modes
        ? String(opts.modes).split(",").map((m: string) => m.trim()).filter(Boolean)
        : undefined;
      let expiry: string | undefined;
      if (opts.expiry) {
        const resolved = resolveExpiry(String(opts.expiry));
        if (!resolved) {
          raiseError("E_INPUT_INVALID", { field: "expiry", detail: `cannot parse "${opts.expiry}" as an ISO timestamp or a duration (e.g. 24h, 7d)`, verb: "project approve" });
        }
        expiry = resolved!;
      }

      const ledger = await recordApproval(id, {
        scope,
        budgetCapUsd: cap,
        allowedModes,
        expiry,
        reason: String(opts.reason),
      });
      const approval = ledger.approvals[ledger.approvals.length - 1]!;

      ok(`Spend approval recorded for ${id} — cap $${cap.toFixed(2)}${expiry ? ` (expires ${expiry})` : ""}`);
      out({
        project: id,
        scope: approval.scope,
        capUsd: approval.budgetCapUsd,
        allowedModes: approval.allowedModes ?? null,
        expiry: approval.expiry ?? null,
        reason: approval.reason,
        approvedAt: approval.approvedAt,
        approvals: ledger.approvals.length,
        artifact: path.join(projectDir(id), "spend-ledger.json"),
      });
    });

  // ── budget (#444) ──────────────────────────────────────────────────────────
  // Show the spend ledger state: the active cap, actual spend (sum of gen-log
  // cost_usd), remaining budget, over-budget flag, and the full append-only
  // approval history. Makes ZERO model calls, never mutates the project. JSON
  // output.
  cmd
    .command("budget <id>")
    .description(
      "Show the project's spend ledger state (#444): the active budget cap, actual spend (sum of generations.jsonl cost_usd), remaining budget, an over-budget flag, expiry status, and the full append-only approval history. With no ledger, reports hasLedger:false and the actual spend so far (generation is unenforced). Makes ZERO model calls, never mutates the project. JSON output. Example: ralphy project budget spring-001",
    )
    .action(async (id: string) => {
      const project = await getEntity("projects", id);
      if (!project) raiseError("E_NOT_FOUND", { kind: "Project", id });

      const s = await budgetSummary(id);
      ok(
        s.hasLedger
          ? `Budget for ${id} — spent $${s.spentUsd.toFixed(2)} / cap $${(s.capUsd ?? 0).toFixed(2)}${s.overBudget ? " (OVER BUDGET)" : ""}${s.expired ? " (expired)" : ""}`
          : `No spend ledger for ${id} — generation unenforced; spent $${s.spentUsd.toFixed(2)} so far`,
      );
      out({
        project: id,
        hasLedger: s.hasLedger,
        capUsd: s.capUsd,
        spentUsd: s.spentUsd,
        remainingUsd: s.remainingUsd,
        overBudget: s.overBudget,
        expired: s.expired,
        activeApproval: s.activeApproval,
        approvals: s.approvals,
      });
    });

  cmd
    .command("transcribe <id>")
    .description("Transcribe an audio file → captions.json (Caption[]). Default backend: ElevenLabs Scribe v1 (word-level).")
    .requiredOption("--audio <path>", "Path to audio file (mp3/m4a/wav, ≤25MB)")
    .option("--language <lang>", "ru | en | auto", "ru")
    .option("--backend <backend>", "elevenlabs | openrouter | gemini", "elevenlabs")
    .option("--model <model>", "(advanced; only honored for backend=openrouter)", DEFAULT_MODEL)
    .option("--out <path>", "Output JSON path (default: <project>/captions.json)")
    .action(async (id: string, opts: any) => {
      const project = await getEntity("projects", id);
      if (!project) raiseError("E_NOT_FOUND", { kind: "Project", id });

      const audioPath = path.resolve(opts.audio);
      const projDir = projectDir(id);
      const outPath = opts.out
        ? path.resolve(opts.out)
        : path.join(projDir, "captions.json");

      const language = (opts.language || "ru") as TranscribeLanguage;
      const backend = (opts.backend || "elevenlabs") as TranscribeBackend;

      const t0 = Date.now();
      try {
        const result = await transcribe({
          audioPath,
          language,
          backend,
          model: opts.model,
        });
        await fs.mkdir(path.dirname(outPath), { recursive: true });
        await fs.writeFile(outPath, JSON.stringify(result.captions, null, 2) + "\n");

        await logGeneration(id, {
          provider: result.backend === "elevenlabs" ? "elevenlabs" : "openrouter",
          model: result.model,
          endpoint: result.model,
          kind: "text",
          input: { project: id, audio: audioPath, language, backend: result.backend },
          output: { local: outPath },
          status: "ok",
          latency_ms: result.durationMs,
          cost_usd: result.costUsd,
          note: `transcribed ${result.captions.length} captions, lang=${result.language}, audio=${result.audioDurationSec.toFixed(1)}s`,
        });

        ok(`Transcribed ${result.captions.length} captions → ${outPath}`);
        out({
          project: id,
          captions: result.captions.length,
          language: result.language,
          backend: result.backend,
          model: result.model,
          durationMs: result.durationMs,
          audioDurationSec: result.audioDurationSec,
          costUsd: result.costUsd,
          out: outPath,
        });
      } catch (e: any) {
        await logGeneration(id, {
          provider: backend === "elevenlabs" ? "elevenlabs" : "openrouter",
          model: backend === "openrouter" ? WHISPER_MODEL : `transcribe/${backend}`,
          endpoint: backend === "openrouter" ? WHISPER_MODEL : `transcribe/${backend}`,
          kind: "text",
          input: { project: id, audio: audioPath, language, backend },
          status: "error",
          error: e?.message || String(e),
          latency_ms: Date.now() - t0,
        });
        err(`Transcription failed: ${e?.message || e}`);
      }
    });

  cmd
    .command("clone <id>")
    .description("Clone a project")
    .requiredOption("--name <name>", "New project name")
    .action(async (id: string, opts: any) => {
      const src = projectDir(id);
      const newId = slugify(opts.name) || generateId("proj");
      const dst = projectDir(newId);
      await fs.cp(src, dst, { recursive: true });

      const project = await getEntity("projects", id);
      await addEntity("projects", newId, { ...(project || {}), name: opts.name, id: newId, createdAt: new Date().toISOString() });
      ok(`Project cloned: ${id} → ${newId}`);
      out({ id: newId, clonedFrom: id });
    });

  // ── move (#108) ────────────────────────────────────────────────────────
  cmd
    .command("move <id> <workspace>")
    .description(
      "Move a project into another workspace's projects/ and update its registry entry. Precondition: no background job (ralphy generate / render) may be mid-flight on the project — its file paths go stale on move.",
    )
    .action(async (id: string, targetWs: string) => {
      if (layoutMode() === "legacy") {
        // #106 fail-fast: explicit guard so the refusal is immediate and
        // carries the catalog payload (path helpers would throw anyway).
        raiseError("E_LEGACY_LAYOUT", { verb: "project move" });
      }
      const project = await getEntity("projects", id);
      const src = projectDir(id);
      if (!project && !existsSync(src)) {
        raiseError("E_NOT_FOUND", { kind: "Project", id });
      }
      if (!existsSync(workspaceDir(targetWs))) {
        raiseError("E_NOT_FOUND", { kind: "Workspace", id: targetWs });
      }
      const dst = path.join(workspaceDir(targetWs), "projects", id);
      if (src === dst) {
        out({ id, workspace: targetWs, moved: false, note: "already in target workspace" });
        return;
      }
      if (existsSync(dst)) {
        raiseError("E_ALREADY_EXISTS", { kind: "Project", id: path.join(targetWs, "projects", id) });
      }
      if (existsSync(src)) {
        await fs.mkdir(path.dirname(dst), { recursive: true });
        await fs.rename(src, dst);
      }
      if (project) {
        await updateEntity("projects", id, { workspace: targetWs });
      }
      ok(`Project moved: ${id} → ${targetWs}`);
      out({ id, workspace: targetWs, from: src, to: dst, moved: true });
    });

  // ── assets ─────────────────────────────────────────────────────────────
  // Issue #029. Walks <project>/artifacts/, ffprobe-truths every media file,
  // emits a flat array of {slot, path, kind, duration_s, width, height, fps,
  // codecs, size_bytes}. The point: stop every multi-clip project from
  // re-inventing an ad-hoc `ffprobe -show_entries` loop and inheriting wrong
  // duration constants from sibling projects.
  cmd
    .command("assets <id>")
    .description(
      "ffprobe-truth every media file under <project>/artifacts/ and emit a flat array. Honors --kind video|image|audio.",
    )
    .option("--kind <kind>", "Filter by classified kind: video | image | audio")
    .action(async (id: string, opts: { kind?: string }) => {
      const project = await getEntity("projects", id);
      if (!project) raiseError("E_NOT_FOUND", { kind: "Project", id });
      const dir = projectDir(id);

      try {
        ensureFfprobe();
      } catch (e) {
        err(`${(e as Error).message}\n  → Try \`ralphy doctor\` to verify ffmpeg + ffprobe are installed.`);
      }

      const files = await walkMediaFiles(artifactsDir(id));

      // Build a slot lookup from asset-manifest.json (if present) so each row
      // carries the canonical slot name when we have one. We resolve real
      // paths on both sides so symlink-prefixed temp dirs (macOS /tmp vs
      // /private/tmp) still match.
      const manifest = await safeJson(path.join(dir, "asset-manifest.json"));
      const pathToSlot = new Map<string, string>();
      const tryRealpath = async (p: string): Promise<string> => {
        try { return await fs.realpath(p); } catch { return path.resolve(p); }
      };
      if (manifest && typeof manifest === "object") {
        const slots = (manifest as { slots?: Record<string, any>; assets?: Array<any> }).slots;
        if (slots) {
          for (const [slot, meta] of Object.entries(slots)) {
            const p = (meta as { path?: string }).path;
            if (p) pathToSlot.set(await tryRealpath(p), slot);
          }
        }
        // Legacy manifest shape: `assets: [{id, file, ...}]`.
        const legacy = (manifest as { assets?: Array<{ id?: string; file?: string }> }).assets;
        if (Array.isArray(legacy)) {
          for (const a of legacy) {
            if (a.file && a.id) {
              pathToSlot.set(await tryRealpath(path.join(dir, a.file)), a.id);
            }
          }
        }
      }

      const rows: Array<Record<string, unknown>> = [];
      for (const f of files) {
        const kind = classifyFile(f);
        if (opts.kind && kind !== opts.kind) continue;
        const probe = await probeFile(f);
        const slot = pathToSlot.get(await tryRealpath(f));
        rows.push({
          slot: slot ?? null,
          path: path.relative(dir, f),
          absolute_path: f,
          kind,
          duration_s: probe.duration_s ?? null,
          width: probe.width ?? null,
          height: probe.height ?? null,
          fps: probe.fps ?? null,
          codecs: probe.codecs ?? null,
          size_bytes: probe.size_bytes ?? null,
          has_video: probe.has_video ?? null,
          has_audio: probe.has_audio ?? null,
          error: probe.error ?? null,
        });
      }

      await logGeneration(id, {
        provider: "ffmpeg",
        model: "ffprobe/project-assets",
        endpoint: "ffprobe/project-assets",
        kind: "other",
        input: { project: id, filter_kind: opts.kind ?? null, count: rows.length },
        status: "ok",
        cost_usd: 0,
        note: `ffprobe ${rows.length} media files under artifacts/`,
      });

      out(rows);
    });

  // ── verify ─────────────────────────────────────────────────────────────
  // Postmortem-driven (tokyo + kbo + noski): asset-manifest.json claims can
  // drift from on-disk reality (wrong aspect, wrong duration, truncated codec).
  // ffprobes every slot file and compares against the manifest's own claim.
  // Tolerance: 100ms on duration; exact on width / height / size_bytes.
  cmd
    .command("verify <id>")
    .description(
      "ffprobe every slot in asset-manifest.json and flag divergences from claimed duration / dimensions / size (tolerance: 100ms on duration). Exit non-zero on any red.",
    )
    .option("--strict", "Treat warnings (missing optional metadata) as errors too", false)
    .action(async (id: string, opts: { strict?: boolean }) => {
      const dir = projectDir(id);
      try { await fs.access(dir); } catch { raiseError("E_NOT_FOUND", { kind: "Project", id }); }

      try {
        ensureFfprobe();
      } catch (e) {
        err(`${(e as Error).message}\n  → Try \`ralphy doctor\` to verify ffmpeg + ffprobe are installed.`);
      }

      const manifestPath = path.join(dir, "asset-manifest.json");
      const manifest = await safeJson(manifestPath);
      if (!manifest) {
        err(`asset-manifest.json missing or invalid at ${manifestPath}`);
      }

      // Normalize to a uniform { slot, claim, path } shape across the two
      // shapes we see in the wild:
      //   1. `slots: { <slot>: { path, kind, durationSec?, width?, height? } }`
      //   2. `assets: [ { id, file, durationSec?, width?, height? } ]`
      type Entry = { slot: string; claim: Record<string, unknown>; localPath: string | null; kind?: string };
      const entries: Entry[] = [];
      const m = manifest as any;
      if (m.slots && typeof m.slots === "object") {
        for (const [slot, meta] of Object.entries(m.slots as Record<string, any>)) {
          entries.push({
            slot,
            claim: meta as Record<string, unknown>,
            localPath: (meta?.path as string | undefined) ?? null,
            kind: meta?.kind as string | undefined,
          });
        }
      } else if (Array.isArray(m.assets)) {
        for (const a of m.assets as Array<Record<string, unknown>>) {
          const file = (a.file as string | undefined) ?? (a.path as string | undefined);
          entries.push({
            slot: (a.id as string | undefined) ?? (file ?? "<unknown>"),
            claim: a,
            localPath: file ? (path.isAbsolute(file) ? file : path.join(dir, file)) : null,
            kind: a.type as string | undefined,
          });
        }
      } else {
        err(`asset-manifest.json has neither .slots nor .assets at ${manifestPath}`);
      }

      type SlotReport = {
        slot: string;
        path: string | null;
        exists: boolean;
        kind?: string;
        probe: Record<string, unknown>;
        divergences: Array<{ field: string; manifest: unknown; ffprobe: unknown; delta?: number }>;
        issues: string[];
      };
      const reports: SlotReport[] = [];
      let red = 0;

      for (const e of entries) {
        const issues: string[] = [];
        const r: SlotReport = {
          slot: e.slot,
          path: e.localPath,
          exists: false,
          kind: e.kind,
          probe: {},
          divergences: [],
          issues,
        };
        if (!e.localPath) {
          issues.push("manifest entry has no `path` / `file` field");
          red += 1;
          reports.push(r);
          continue;
        }
        const ext = path.extname(e.localPath).toLowerCase();
        // Probe only if it's media we understand; otherwise just stat-check.
        const probe = await probeFile(e.localPath);
        r.exists = probe.exists;
        r.probe = {
          duration_s: probe.duration_s ?? null,
          width: probe.width ?? null,
          height: probe.height ?? null,
          fps: probe.fps ?? null,
          codecs: probe.codecs ?? null,
          size_bytes: probe.size_bytes ?? null,
        };
        if (!probe.exists) {
          issues.push(`file missing on disk: ${e.localPath}`);
          red += 1;
          reports.push(r);
          continue;
        }
        if (probe.error) {
          issues.push(probe.error);
          red += 1;
        }

        const div = diffManifestVsProbe(e.claim, probe);
        r.divergences = div;
        if (div.length > 0) red += 1;

        if (opts.strict && probe.exists && !probe.codecs?.length && ext && ext !== ".srt" && ext !== ".vtt") {
          issues.push("strict: file has no decodable codec");
          red += 1;
        }
        reports.push(r);
      }

      await logGeneration(id, {
        provider: "ffmpeg",
        model: "ffprobe/project-verify",
        endpoint: "ffprobe/project-verify",
        kind: "other",
        input: { project: id, strict: !!opts.strict, slotCount: reports.length, redCount: red },
        status: red === 0 ? "ok" : "error",
        cost_usd: 0,
        note: `verify: ${reports.length} slots, ${red} red`,
      });

      out({
        project: id,
        slotCount: reports.length,
        redCount: red,
        verdict: red === 0 ? "ok" : "fail",
        slots: reports,
      });
      if (red > 0) {
        // Non-zero exit so CI / scripts can chain
        process.exitCode = 1;
      }
    });

  // ── thumbnail (#049) ───────────────────────────────────────────────────
  // `ralphy project thumbnail <id> --at <t>` — single-frame extract for QA
  // preview. Replaces the venom-bodywash workaround of 30 raw `ffmpeg -ss`
  // invocations. Writes <project>/compositions/thumbnails/<basename>-<t>.png
  // if --slot/--src given, else <project>/thumb-<t>.png. Numeric-suffix on
  // collision (AGENTS.md #14: no overwrite).
  cmd
    .command("thumbnail <id>")
    .description(
      "Extract a single frame from a project video. Default source: <project>/render/final.mp4.",
    )
    .requiredOption("--at <seconds>", "Timestamp in seconds (float ok)", parseFloat)
    .option(
      "--src <path>",
      "Video to thumbnail (default: <project>/render/final.mp4). Relative paths resolve under the project dir.",
    )
    .option("--out <path>", "Output PNG path (default under <project>/compositions/thumbnails/)")
    .action(async (id: string, opts: any) => {
      const project = await getEntity("projects", id);
      if (!project) raiseError("E_NOT_FOUND", { kind: "Project", id });
      const dir = projectDir(id);
      const src = opts.src
        ? (path.isAbsolute(opts.src) ? opts.src : path.join(dir, opts.src))
        : path.join(dir, "render", "final.mp4");
      const t = Number(opts.at);
      if (!Number.isFinite(t) || t < 0) {
        raiseError("E_VALIDATION_FAILED", {
          target: "--at",
          detail: `must be a non-negative number, got '${opts.at}'`,
        });
      }
      const baseSlug = path
        .basename(src, path.extname(src))
        .replace(/[^a-zA-Z0-9_-]+/g, "-");
      const defaultOut = path.join(
        dir,
        "compositions",
        "thumbnails",
        `${baseSlug}-${t.toString().replace(".", "p")}.png`,
      );
      let dst = opts.out
        ? (path.isAbsolute(opts.out) ? opts.out : path.join(dir, opts.out))
        : defaultOut;
      // Numeric-suffix on collision (AGENTS.md #14). Never overwrite.
      const ext = path.extname(dst);
      const stem = dst.slice(0, dst.length - ext.length);
      let n = 2;
      while (await fs.access(dst).then(() => true).catch(() => false)) {
        dst = `${stem}-${n}${ext}`;
        n += 1;
        if (n > 9999) break;
      }
      await fs.mkdir(path.dirname(dst), { recursive: true });
      await extractFrame({ src, atSec: t, dst, projectId: id, note: `thumbnail @${t}s` });
      out({ project: id, src, atSec: t, out: dst });
    });

  // ── audio-stats (#049) ─────────────────────────────────────────────────
  // `ralphy project audio-stats <id>` — LUFS / peak / mean per audio file
  // under <project>/artifacts/. Replaces venom-bodywash's 10 raw
  // `ffmpeg -af volumedetect` invocations. JSON output, gen-log row per
  // file.
  cmd
    .command("audio-stats <id>")
    .description(
      "Loudness table (mean/peak dBFS + integrated LUFS + true peak + LRA) for every audio file under <project>/artifacts/.",
    )
    .option("--src <path>", "Single file to probe instead of the artifacts/ walk")
    .action(async (id: string, opts: any) => {
      const project = await getEntity("projects", id);
      if (!project) raiseError("E_NOT_FOUND", { kind: "Project", id });
      const dir = projectDir(id);
      let files: string[];
      if (opts.src) {
        const p = path.isAbsolute(opts.src) ? opts.src : path.join(dir, opts.src);
        files = [p];
      } else {
        try {
          ensureFfprobe();
        } catch (e) {
          err(`${(e as Error).message}\n  → Try \`ralphy doctor\` to verify ffmpeg is installed.`);
        }
        const all = await walkMediaFiles(artifactsDir(id));
        files = all.filter((f) => classifyFile(f) === "audio");
      }
      const rows: Array<Record<string, unknown>> = [];
      for (const f of files) {
        try {
          const stats = await audioStats({ src: f, projectId: id, note: "project audio-stats" });
          rows.push({ ...stats, path: path.relative(dir, f), absolute_path: f });
        } catch (e) {
          rows.push({ path: path.relative(dir, f), absolute_path: f, error: (e as Error).message });
        }
      }
      out({ project: id, count: rows.length, files: rows });
    });

  // ── contact-sheet (#049) ───────────────────────────────────────────────
  // `ralphy project contact-sheet <id> --slots 'pattern' --cols 5` — montage
  // images into an N-column grid PNG. Replaces 6 raw ffmpeg hstack invocations
  // from ralphy-carousel-001.
  cmd
    .command("contact-sheet <id>")
    .description(
      "Grid montage of images. --slots accepts a glob over <project>/artifacts/images/ (e.g. 'zine-*'). Default cols=5.",
    )
    .option(
      "--slots <pattern>",
      "Glob pattern matched against filenames under <project>/artifacts/images/ (default: '*' = all images)",
      "*",
    )
    .option("--cols <n>", "Grid columns (default 5)", (v) => parseInt(v, 10), 5)
    .option("--tile-w <n>", "Tile width (default 480)", (v) => parseInt(v, 10), 480)
    .option("--tile-h <n>", "Tile height (default 270)", (v) => parseInt(v, 10), 270)
    .option("--name <name>", "Output basename (default: contact-<timestamp>)")
    .option("--out <path>", "Override output path entirely")
    .action(async (id: string, opts: any) => {
      const project = await getEntity("projects", id);
      if (!project) raiseError("E_NOT_FOUND", { kind: "Project", id });
      const dir = projectDir(id);
      const imagesDirs = resolveArtifactKindDirs(id, "images");
      const entryToDir = new Map<string, string>();
      for (const d of imagesDirs) {
        try {
          for (const f of await fs.readdir(d)) {
            if (!entryToDir.has(f)) entryToDir.set(f, d);
          }
        } catch { /* missing dir contributes nothing */ }
      }
      if (entryToDir.size === 0) {
        raiseError("E_FILE_UNREADABLE", { path: imagesDirs[0] });
      }
      const entries: string[] = [...entryToDir.keys()];
      // Tiny inline glob — only `*` and `?` are honored, keeps the surface small.
      const pattern = String(opts.slots || "*");
      const rx = new RegExp(
        "^" +
          pattern
            .replace(/[.+^${}()|[\]\\]/g, "\\$&")
            .replace(/\*/g, ".*")
            .replace(/\?/g, ".") +
          "$",
      );
      const srcs = entries
        .filter((f) => /\.(png|jpg|jpeg|webp)$/i.test(f))
        .filter((f) => rx.test(f) || rx.test(path.basename(f, path.extname(f))))
        .map((f) => path.join(entryToDir.get(f)!, f))
        .sort((a, b) => path.basename(a).localeCompare(path.basename(b)));
      if (srcs.length === 0) {
        raiseError("E_VALIDATION_FAILED", {
          target: "--slots",
          detail: `no images matched '${pattern}' under ${imagesDirs.join(" / ")}`,
        });
      }
      const cols = Number(opts.cols) > 0 ? Number(opts.cols) : 5;
      const tileW = Number(opts.tileW) > 0 ? Number(opts.tileW) : 480;
      const tileH = Number(opts.tileH) > 0 ? Number(opts.tileH) : 270;
      const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const name = String(opts.name || `contact-${stamp}`);
      const dst = opts.out
        ? (path.isAbsolute(opts.out) ? opts.out : path.join(dir, opts.out))
        : path.join(dir, "compositions", "contact", `${name}.png`);
      await contactSheet({ srcs, dst, cols, tileW, tileH, projectId: id, note: `contact-sheet --slots ${pattern}` });
      out({ project: id, slotPattern: pattern, tileCount: srcs.length, cols, rows: Math.ceil(srcs.length / cols), out: dst });
    });

  // ── zip (#049) ─────────────────────────────────────────────────────────
  // `ralphy project zip <id> [--selected|--all]` — handoff bundle. Replaces
  // the appstore-takeaminute hand-assembled 32-PNG + curated-8-PNG zips. Uses
  // the system `zip` binary (always present on macOS / linux). gen-log row.
  cmd
    .command("zip <id>")
    .description(
      "Zip a project's deliverables into <cwd>/<id>.zip. --selected = <project>/selected/ only. --all = everything except logs/cache.",
    )
    .option("--selected", "Zip only <project>/selected/ (cherry-picked deliverables)")
    .option("--all", "Zip everything except logs/ and node_modules / cache")
    .option("--out <path>", "Output path (default: <cwd>/<id>.zip)")
    .action(async (id: string, opts: any) => {
      const project = await getEntity("projects", id);
      if (!project) raiseError("E_NOT_FOUND", { kind: "Project", id });
      if (!opts.selected && !opts.all) {
        raiseError("E_VALIDATION_FAILED", {
          target: "--selected | --all",
          detail: "pass --selected (cherry-picked deliverables) or --all (full project minus logs/cache)",
        });
      }
      const dir = projectDir(id);
      const t0 = Date.now();
      const dst = opts.out
        ? path.resolve(opts.out)
        : path.resolve(process.cwd(), `${id}.zip`);
      // Numeric-suffix on collision — never overwrite an existing zip.
      let finalDst = dst;
      const ext = path.extname(finalDst);
      const stem = finalDst.slice(0, finalDst.length - ext.length);
      let n = 2;
      while (await fs.access(finalDst).then(() => true).catch(() => false)) {
        finalDst = `${stem}-${n}${ext}`;
        n += 1;
        if (n > 9999) break;
      }
      await fs.mkdir(path.dirname(finalDst), { recursive: true });
      const args = ["-r", finalDst];
      if (opts.selected) {
        const sel = path.join(dir, "selected");
        try {
          await fs.access(sel);
        } catch {
          raiseError("E_FILE_UNREADABLE", { path: sel });
        }
        args.push("selected");
      } else {
        // --all: every top-level entry except logs/ and the .ralph cache.
        const top = await fs.readdir(dir);
        for (const e of top) {
          if (e === "logs" || e === ".ralph" || e === "node_modules") continue;
          args.push(e);
        }
      }
      const r = await new Promise<{ exitCode: number; stderr: string }>((resolve) => {
        const proc = spawn("zip", args, { cwd: dir });
        let stderr = "";
        proc.stderr.on("data", (d) => (stderr += d.toString()));
        proc.on("error", (e) => resolve({ exitCode: 1, stderr: e.message }));
        proc.on("close", (code) => resolve({ exitCode: code ?? 1, stderr }));
      });
      if (r.exitCode !== 0) {
        raiseError("E_INTERNAL", { detail: `zip failed (exit ${r.exitCode}): ${r.stderr.slice(0, 300)}` });
      }
      const size = (await fs.stat(finalDst)).size;
      await logGeneration(id, {
        provider: "other",
        model: "zip/project",
        endpoint: "zip/project",
        kind: "other",
        input: { project: id, mode: opts.selected ? "selected" : "all" },
        output: { local: finalDst, bytes: size },
        status: "ok",
        latency_ms: Date.now() - t0,
        cost_usd: 0,
        note: `project zip (${opts.selected ? "selected" : "all"})`,
      });
      out({ project: id, mode: opts.selected ? "selected" : "all", out: finalDst, bytes: size });
    });

  return cmd;
}

function resolveDomainContext(command: Command, positionalProjectId?: string) {
  const opts = command.optsWithGlobals();
  return resolveCommandContext({
    dataRoot: ralphDir(),
    sessionId: opts.session,
    workspaceId: opts.workspace,
    projectId: opts.project,
    positionalProjectId,
    cwd: process.cwd(),
  });
}

function domainQueryContext(context: ReturnType<typeof resolveCommandContext>) {
  return context.kind === "session"
    ? { sessionId: context.sessionId }
    : {
        workspaceId: context.workspaceId,
        ...(context.projectId ? { projectId: context.projectId } : {}),
      };
}

function projectStatus(workspaceId: string, projectId: string) {
  const context = { workspaceId, projectId } as const;
  const iterations = listIterations({ context, projectId, limit: 100 }).items;
  const feedback = listFeedback({ context, projectId, limit: 100 }).items;
  return {
    project: getProject({ workspaceId, projectId }),
    stages: listProjectStages({ context, projectId, limit: 100 }).items,
    bindings: listProjectDocumentBindings(context, { projectId, limit: 100 }).items,
    currentIteration:
      iterations.filter((iteration) => iteration.state === "active").at(-1) ?? null,
    openFeedback: feedback.filter((item) => item.status === "open"),
  };
}

function parseCount(value: string): number {
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count <= 0) {
    throw new Error("Expected a positive integer");
  }
  return count;
}

function titleCase(value: string): string {
  return value
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join(" ");
}
