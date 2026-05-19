#!/usr/bin/env node
import { Command } from "commander";
import { setPretty } from "./lib/output.js";
import { setRoot } from "./lib/paths.js";
import { findProjectRootSafe, loadProjectEnv } from "./lib/project-root.js";

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
import { versionCmd } from "./commands/version.js";
import { bannerString } from "./lib/banner.js";
import { VERSION } from "./lib/version.js";

const program = new Command();

program
  .name("ralphy")
  .description("UGC video generation pipeline CLI")
  // Commander accepts only one short flag; we use the lowercase -v
  // (npm / docker / kubectl convention) instead of Commander's default -V.
  .version(VERSION, "-v, --version", "Print the ralphy version")
  .option("-p, --pretty", "Human-readable output instead of JSON")
  .option("--cwd <path>", "Working directory (overrides project auto-detection)")
  .hook("preAction", async (thisCommand) => {
    const opts = thisCommand.opts();
    if (opts.pretty) setPretty(true);
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

program.parseAsync();
