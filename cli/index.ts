#!/usr/bin/env node
import { Command } from "commander";
import { setPretty } from "./lib/output.js";
import { setRoot } from "./lib/paths.js";
import { findProjectRootSafe, loadProjectEnv } from "./lib/project-root.js";
import { installSigintHandler, CancelledError } from "./lib/cancel.js";
import { raiseError } from "./lib/errors/index.js";

// Install SIGINT handler before parsing so Ctrl-C during preAction is also
// caught. The token flips on first SIGINT; verbs read it cooperatively and
// the command boundary handler below emits E_CANCELLED (exit 130).
installSigintHandler();

// Uncaught CancelledError (thrown by token.throwIfCancelled() inside a verb)
// becomes the structured E_CANCELLED payload + exit 130 per 01.07.02.
// All other uncaught exceptions become E_INTERNAL — never silent.
process.on("uncaughtException", (e: unknown) => {
  if (e instanceof CancelledError) raiseError("E_CANCELLED");
  const detail = e instanceof Error ? e.message : String(e);
  raiseError("E_INTERNAL", { detail });
});
process.on("unhandledRejection", (reason: unknown) => {
  if (reason instanceof CancelledError) raiseError("E_CANCELLED");
  const detail = reason instanceof Error ? reason.message : String(reason);
  raiseError("E_INTERNAL", { detail });
});

import { initCmd } from "./commands/init.js";
import { configCmd } from "./commands/config.js";
import { brandCmd } from "./commands/brand.js";
import { personaCmd } from "./commands/persona.js";
import { refCmd } from "./commands/ref.js";
import { projectCmd } from "./commands/project.js";
import { templateCmd } from "./commands/template.js";
import { batchCmd } from "./commands/batch.js";
import { assetCmd } from "./commands/asset.js";
import { workspaceCmd } from "./commands/workspace.js";
import { dashboardCmd } from "./commands/dashboard.js";
import { profileCmd } from "./commands/profile.js";
import { setupCmd } from "./commands/setup.js";
import { statusCmd } from "./commands/status.js";
import { generateCmd } from "./commands/generate.js";
import { modelsCmd } from "./commands/models.js";
import { daemonCmd } from "./commands/daemon.js";
import { queueCmd } from "./commands/queue.js";
import { doctorCmd } from "./commands/doctor.js";
import { renderCmd } from "./commands/render.js";
import { assetsCmd } from "./commands/assets.js";
import { exampleCmd } from "./commands/example.js";
import { audioCmd } from "./commands/audio.js";
import { videoCmd } from "./commands/video.js";
import { bannerCmd } from "./commands/banner.js";
import { evalCmd } from "./commands/eval.js";
import { researchCmd } from "./commands/research.js";
import { editorCmd } from "./commands/editor.js";
import { voiceCmd } from "./commands/voice.js";
import { whoamiCmd } from "./commands/whoami.js";
import { versionCmd } from "./commands/version.js";
import { newCmd } from "./commands/new.js";
import { cloneCmd } from "./commands/clone.js";
import { skillCmd } from "./commands/skill.js";
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
    if (opts.cwd) {
      setRoot(opts.cwd);
      await loadProjectEnv(opts.cwd);
      return;
    }
    // Skip project auto-detection for setup — it has its own logic for first-run.
    const sub = thisCommand.args[0];
    if (sub === "setup") return;
    const detected = await findProjectRootSafe();
    if (detected) {
      setRoot(detected);
      await loadProjectEnv(detected);
    }
  });

program.addCommand(versionCmd());
program.addCommand(newCmd());
program.addCommand(cloneCmd());
program.addCommand(skillCmd());
program.addCommand(setupCmd());
program.addCommand(statusCmd());
program.addCommand(doctorCmd());
program.addCommand(generateCmd());
program.addCommand(modelsCmd());
program.addCommand(daemonCmd());
program.addCommand(queueCmd());
program.addCommand(renderCmd());
program.addCommand(editorCmd());
program.addCommand(voiceCmd());
program.addCommand(whoamiCmd());
program.addCommand(initCmd());
program.addCommand(configCmd());
program.addCommand(brandCmd());
program.addCommand(personaCmd());
program.addCommand(refCmd());
program.addCommand(projectCmd());
program.addCommand(templateCmd());
program.addCommand(batchCmd());
program.addCommand(assetCmd());
program.addCommand(workspaceCmd());
program.addCommand(dashboardCmd());
program.addCommand(profileCmd());
program.addCommand(assetsCmd());
program.addCommand(exampleCmd());
program.addCommand(audioCmd());
program.addCommand(videoCmd());
program.addCommand(bannerCmd());
program.addCommand(evalCmd());
program.addCommand(researchCmd());

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
  const path = await import("node:path");

  let profile = await loadUserProfile();
  if (profile.signals.projects_done === 0 && profile.signals.renders_shipped === 0) {
    try {
      const workspaceRoot = path.join(root(), "workspace");
      const fromDisk = await backfillFromWorkspace({ workspaceRoot });
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
