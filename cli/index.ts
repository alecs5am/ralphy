#!/usr/bin/env node
import { Command } from "commander";
import { setPretty } from "./lib/output.js";
import { setRoot, layoutMode } from "./lib/paths.js";
import { findProjectRootSafe, loadProjectEnv } from "./lib/project-root.js";
import { installSigintHandler, CancelledError } from "./lib/cancel.js";
import { raiseError } from "./lib/errors/index.js";

// Install SIGINT handler before parsing so Ctrl-C during preAction is also
// caught. The token flips on first SIGINT; verbs read it cooperatively and
// the command boundary handler below emits E_CANCELLED (exit 130).
installSigintHandler();

// Uncaught CancelledError (thrown by token.throwIfCancelled() inside a verb)
// becomes the structured E_CANCELLED payload + exit 130 per 01.07.02.
// LegacyLayoutError (the #106 fail-fast guard in cli/lib/paths.ts — lib code
// can't process.exit, so it throws a coded Error) maps to E_LEGACY_LAYOUT.
// All other uncaught exceptions become E_INTERNAL — never silent.
function geoblockCtx(e: unknown): { provider: string; reason: string } | null {
  const g = e as { code?: string; provider?: string; reason?: string } | null;
  if (g?.code !== "E_GEOBLOCK") return null;
  return { provider: g.provider ?? "ElevenLabs", reason: g.reason ?? "non-audio body" };
}

process.on("uncaughtException", (e: unknown) => {
  if (e instanceof CancelledError) raiseError("E_CANCELLED");
  if ((e as { code?: string } | null)?.code === "E_LEGACY_LAYOUT") raiseError("E_LEGACY_LAYOUT");
  const geo = geoblockCtx(e);
  if (geo) raiseError("E_GEOBLOCK", geo);
  const detail = e instanceof Error ? e.message : String(e);
  raiseError("E_INTERNAL", { detail });
});
process.on("unhandledRejection", (reason: unknown) => {
  if (reason instanceof CancelledError) raiseError("E_CANCELLED");
  if ((reason as { code?: string } | null)?.code === "E_LEGACY_LAYOUT") raiseError("E_LEGACY_LAYOUT");
  const geo = geoblockCtx(reason);
  if (geo) raiseError("E_GEOBLOCK", geo);
  const detail = reason instanceof Error ? reason.message : String(reason);
  raiseError("E_INTERNAL", { detail });
});

import { initCmd } from "./commands/init.js";
import { configCmd } from "./commands/config.js";
import { brandCmd } from "./commands/brand.js";
import { personaCmd } from "./commands/persona.js";
import { refCmd } from "./commands/ref.js";
import { projectCmd } from "./commands/project.js";
import { unitCmd } from "./commands/unit.js";
import { blueprintCmd } from "./commands/blueprint.js";
import { libraryCmd } from "./commands/library.js";
import { templateCmd } from "./commands/template.js";
import { batchCmd } from "./commands/batch.js";
import { assetCmd } from "./commands/asset.js";
import { workspaceCmd } from "./commands/workspace.js";
import { calendarCmd } from "./commands/calendar.js";
import { farmCmd } from "./commands/farm.js";
import { publishCmd } from "./commands/publish.js";
import { analyticsCmd } from "./commands/analytics.js";
import { workflowCmd } from "./commands/workflow.js";
import { runCmd } from "./commands/run.js";
import { studioCmd } from "./commands/studio.js";
import { migrateCmd } from "./commands/migrate.js";
import { setupCmd } from "./commands/setup.js";
import { statusCmd } from "./commands/status.js";
import { generateCmd } from "./commands/generate.js";
import { providerCmd } from "./commands/provider.js";
import { modelsCmd } from "./commands/models.js";
import { daemonCmd } from "./commands/daemon.js";
import { queueCmd } from "./commands/queue.js";
import { doctorCmd } from "./commands/doctor.js";
import { renderCmd } from "./commands/render.js";
import { hyperframesCmd } from "./commands/hyperframes.js";
import { assetsCmd } from "./commands/assets.js";
import { exampleCmd } from "./commands/example.js";
import { audioCmd } from "./commands/audio.js";
import { videoCmd } from "./commands/video.js";
import { clipCmd } from "./commands/clip.js";
import { imageCmd } from "./commands/image.js";
import { bannerCmd } from "./commands/banner.js";
import { evalCmd } from "./commands/eval.js";
import { researchCmd } from "./commands/research.js";
import { editorCmd } from "./commands/editor.js";
import { composeCmd } from "./commands/compose.js";
import { voiceCmd } from "./commands/voice.js";
import { whoamiCmd } from "./commands/whoami.js";
import { versionCmd } from "./commands/version.js";
import { newCmd } from "./commands/new.js";
import { cloneCmd } from "./commands/clone.js";
import { skillCmd } from "./commands/skill.js";
import { promptsCmd } from "./commands/prompts.js";
import { promptCmd } from "./commands/prompt.js";
import { guidelineCmd } from "./commands/guideline.js";
import { benchmarkCmd } from "./commands/benchmark.js";
import { memoryCmd } from "./commands/memory.js";
import { lessonsCmd } from "./commands/lessons.js";
import { bannerString } from "./lib/banner.js";
import { VERSION } from "./lib/version.js";

const program = new Command();

program
  .name("ralphy")
  .description("UGC video generation pipeline CLI")
  // Commander accepts only one short flag; we use the lowercase -v
  // (npm / docker / kubectl convention) instead of Commander's default -V.
  .version(VERSION, "-v, --version", "Print the ralphy version")
  .option("-p, --pretty", "Force pretty output (rich UI with colors, tables, icons)")
  .option("--json", "Force JSON output (overrides TTY auto-detection — use for shell piping / scripts)")
  .option("-q, --quiet", "Suppress progress, spinners, and chatter; only emit the final result")
  .option("--no-color", "Disable color output even on TTY")
  .option("--cwd <path>", "Working directory (overrides project auto-detection)")
  .hook("preAction", async (thisCommand) => {
    const opts = thisCommand.opts();
    // ui.ts mode: auto-detect TTY unless explicit --pretty / --json
    const { setMode, setQuiet } = await import("./lib/ui.js");
    // Commander turns --no-color into opts.color === false. Force chalk off
    // so the rest of the run produces ANSI-free output regardless of TTY.
    //
    // We ALSO honor the NO_COLOR env var explicitly here (no-color.org: any
    // non-empty value disables color, and it MUST win). chalk's own
    // auto-detection respects NO_COLOR on its own, but FORCE_COLOR has higher
    // precedence in supports-color — so `FORCE_COLOR=3 NO_COLOR=1 --pretty`
    // would otherwise leak ANSI into a pipe. Pinning chalk.level=0 here makes
    // NO_COLOR authoritative regardless of FORCE_COLOR (issue #001 ANSI-in-pipe
    // audit). Tested by tests/integration/cli-no-color.test.ts.
    const noColorEnv = process.env.NO_COLOR !== undefined && process.env.NO_COLOR !== "";
    if (opts.color === false || noColorEnv) {
      const { default: chalk } = await import("chalk");
      chalk.level = 0;
      process.env.NO_COLOR = "1";
      // Transitive color libs (cli-table3 borders → yoctocolors, ora) read
      // FORCE_COLOR with HIGHER precedence than NO_COLOR. If both are set we
      // must clear FORCE_COLOR so those libs also disable — otherwise table
      // borders + spinners leak ANSI into a NO_COLOR pipe. NO_COLOR wins.
      delete process.env.FORCE_COLOR;
      // chalk v5 binds each c.green/c.dim builder to the level at first access,
      // so `chalk.level = 0` alone does NOT recolor the palette ui.ts baked at
      // import time (when FORCE_COLOR may have forced level 3). Rebuild the
      // palette + icons on a fresh level-0 instance. (#001 §D)
      const { disableColor } = await import("./lib/ui.js");
      disableColor();
    }
    if (opts.json) {
      setMode("json");
      setPretty(false);
    } else if (opts.pretty) {
      setMode("pretty");
      setPretty(true);
    } else {
      // Mirror TTY detection into legacy setPretty() so old commands light up too
      setMode("auto");
      setPretty(Boolean(process.stdout.isTTY));
    }
    setQuiet(Boolean(opts.quiet));
    // #106 fail-fast: an unmigrated legacy workspace/ root refuses every verb
    // except `migrate` (which performs the move) and `doctor` (which diagnoses
    // it). Enforced here at the command boundary — the deeper guard in
    // paths.ts (workspace() throws LegacyLayoutError) is defense-in-depth for
    // lib callers, but defensive try/catch around registry/config reads would
    // otherwise swallow it into empty results.
    const sub = thisCommand.args[0];
    const guardLegacyLayout = () => {
      if (sub === "migrate" || sub === "doctor") return;
      if (layoutMode() === "legacy") raiseError("E_LEGACY_LAYOUT");
    };
    if (opts.cwd) {
      setRoot(opts.cwd);
      await loadProjectEnv(opts.cwd);
      guardLegacyLayout();
      return;
    }
    // Skip project auto-detection for setup — it has its own logic for first-run.
    if (sub === "setup") return;
    const detected = await findProjectRootSafe();
    if (detected) {
      setRoot(detected);
      await loadProjectEnv(detected);
    }
    guardLegacyLayout();
  });

program.addCommand(versionCmd());
program.addCommand(newCmd());
program.addCommand(cloneCmd());
program.addCommand(skillCmd());
program.addCommand(setupCmd());
program.addCommand(statusCmd());
program.addCommand(doctorCmd());
program.addCommand(generateCmd());
program.addCommand(providerCmd());
program.addCommand(modelsCmd());
program.addCommand(daemonCmd());
program.addCommand(queueCmd());
program.addCommand(renderCmd());
program.addCommand(hyperframesCmd());
program.addCommand(editorCmd());
program.addCommand(composeCmd());
program.addCommand(voiceCmd());
program.addCommand(whoamiCmd());
program.addCommand(initCmd());
program.addCommand(configCmd());
program.addCommand(brandCmd());
program.addCommand(personaCmd());
program.addCommand(refCmd());
program.addCommand(projectCmd());
program.addCommand(unitCmd());
program.addCommand(blueprintCmd());
program.addCommand(libraryCmd());
program.addCommand(templateCmd());
program.addCommand(guidelineCmd());
program.addCommand(benchmarkCmd());
program.addCommand(memoryCmd());
program.addCommand(lessonsCmd());
program.addCommand(batchCmd());
program.addCommand(assetCmd());
program.addCommand(workspaceCmd());
program.addCommand(calendarCmd());
program.addCommand(farmCmd());
program.addCommand(publishCmd());
program.addCommand(analyticsCmd());
program.addCommand(workflowCmd());
program.addCommand(runCmd());
program.addCommand(studioCmd());
program.addCommand(migrateCmd());
program.addCommand(assetsCmd());
program.addCommand(exampleCmd());
program.addCommand(audioCmd());
program.addCommand(videoCmd());
program.addCommand(clipCmd());
program.addCommand(imageCmd());
program.addCommand(bannerCmd());
program.addCommand(evalCmd());
program.addCommand(researchCmd());
program.addCommand(promptsCmd());
program.addCommand(promptCmd());

program.addHelpText("beforeAll", bannerString());

// Custom `help [command...]` command — walks the full subcommand tree so
// `ralphy help generate image` drills into the leaf, not just the first
// level. Commander's built-in helpCommand only supports a single positional
// arg and stops at depth 1, so we replace it.
program.helpCommand(false);
program.addCommand(
  new Command("help")
    .description("Show help for a command (e.g. `ralphy help generate image`)")
    .argument("[command...]", "command chain — drills as deep as it resolves")
    .action((tokens: string[] = []) => {
      let target: Command = program;
      let depth = 0;
      for (const token of tokens) {
        depth += 1;
        const next = target.commands.find(
          (c) => c.name() === token || (c.aliases && c.aliases().includes(token)),
        );
        if (!next) {
          const trail = tokens.slice(0, depth).join(" ");
          console.error(`Unknown command: ralphy ${trail}`);
          console.error(`Run \`ralphy help${tokens.slice(0, depth - 1).map((t) => " " + t).join("")}\` to see what's available.`);
          process.exit(1);
        }
        target = next;
      }
      target.outputHelp();
    }),
);

// Bare `ralphy` (no subcommand) — status dashboard: version + capabilities +
// user profile + recommendation. The agent calls this on session start to load
// user context. Rich pretty output on TTY; --json forces machine output.
program.action(async () => {
  const { loadUserProfile, computeSkillScore, bandForScore, backfillFromWorkspace } =
    await import("./lib/user-profile.js");
  const { root } = await import("./lib/paths.js");
  const { isPrettyMode, banner, section, kv, bar, skillPath, c, icons } = await import("./lib/ui.js");
  const { saveUserProfile } = await import("./lib/user-profile.js");

  let profile = await loadUserProfile();
  if (profile.signals.projects_done === 0 && profile.signals.renders_shipped === 0) {
    try {
      const { projectsDir } = await import("./lib/paths.js");
      const fromDisk = await backfillFromWorkspace({ projectsDir: projectsDir() });
      profile.signals = { ...profile.signals, ...fromDisk };
      if (profile.skill.user_override === null) {
        profile.skill.score = computeSkillScore(profile.signals);
        profile.skill.band = bandForScore(profile.skill.score);
      }
      await saveUserProfile(profile);
    } catch {
      /* backfill is best-effort */
    }
  }

  // Memory digest (#117) — auto-recall: the agent loads memory by virtue of
  // making this step-0 call, no separate discipline needed. Best-effort: a
  // store/layout error must never break the status call.
  let memoryDigest: unknown = null;
  try {
    const { recall } = await import("./lib/memory/store.js");
    const r = await recall({});
    memoryDigest = {
      workspace: r.workspace,
      count: r.count,
      truncated: r.truncated,
      note: r.note,
      entries: r.entries.map((e) => ({ slug: e.slug, tier: e.tier, description: e.description })),
    };
  } catch {
    /* no memory yet / legacy layout — omit */
  }

  // JSON branch — agent / pipe-friendly
  if (!isPrettyMode()) {
    console.log(
      JSON.stringify(
        {
          version: VERSION,
          user: {
            firstSeen: profile.firstSeen,
            lastSeen: profile.lastSeen,
            is_developer: profile.is_developer,
            skill: profile.skill,
            signals: profile.signals,
          },
          capabilities: {
            openrouter: Boolean(process.env.OPENROUTER_API_KEY),
            elevenlabs: Boolean(process.env.ELEVENLABS_API_KEY),
          },
          project_root: root(),
          memory: memoryDigest,
        },
        null,
        2,
      ),
    );
    return;
  }

  // Pretty dashboard
  banner();

  const homeDir = process.env.HOME || "";
  const projectShort = root().startsWith(homeDir) ? "~" + root().slice(homeDir.length) : root();
  const caps = [
    { label: "OpenRouter", on: Boolean(process.env.OPENROUTER_API_KEY) },
    { label: "ElevenLabs", on: Boolean(process.env.ELEVENLABS_API_KEY) },
  ];
  console.log(`${icons.arrow} ${c.bold("version")}      ${c.value("v" + VERSION)}`);
  console.log(`${icons.arrow} ${c.bold("project")}      ${c.path(projectShort)}`);
  console.log(
    `${icons.arrow} ${c.bold("capabilities")} ${caps.map((cap) => (cap.on ? icons.ok + " " : icons.fail + " ") + cap.label).join("   ")}`,
  );

  // User block
  const tenure =
    profile.signals.sessions_count === 0
      ? c.muted("first session")
      : c.muted(`returning, ${profile.signals.sessions_count} session${profile.signals.sessions_count === 1 ? "" : "s"}`);
  const badge = profile.is_developer ? `  ${icons.star} ${c.brand("developer")}` : "";
  section(`User${badge}`, [
    `${c.label("Skill   ")} ${bar(profile.skill.score, 10)}  ${c.bold(profile.skill.score.toFixed(1) + " / 10")}  ${c.brand(profile.skill.band)}`,
    `${c.label("Path    ")} ${skillPath(profile.skill.band)}`,
    `${c.label("Tenure  ")} ${tenure}`,
  ]);

  // Signals block
  const sigEntries: Array<[string, unknown]> = [
    ["Projects done", profile.signals.projects_done],
    ["With postmortem", profile.signals.projects_with_postmortem],
    ["Renders shipped", profile.signals.renders_shipped],
    ["Templates used", profile.signals.templates_used_count === 0 ? c.muted("0  (try `ralphy template suggest \"<brief>\"`)") : profile.signals.templates_used_count],
    ["CLI verb breadth", profile.signals.cli_verb_breadth === 0 ? c.muted("0  (auto-tracked)") : profile.signals.cli_verb_breadth],
    ["Sessions", profile.signals.sessions_count],
  ];
  section("Signals (auto-backfilled from workspace)");
  kv(sigEntries, { maxKeyWidth: 18 });

  // Quick start
  section("Quick start");
  console.log(`  ${icons.bullet} ${c.cmd("ralphy whoami")}                             detailed profile + recommendation`);
  console.log(`  ${icons.bullet} ${c.cmd("ralphy template suggest \"<brief>\"")}        find a template by utterance`);
  console.log(`  ${icons.bullet} ${c.cmd("ralphy --help")}                             full verb surface`);
  console.log();
});

program.parseAsync();
