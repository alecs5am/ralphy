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
import { doctorCmd } from "./commands/doctor.js";
import { renderCmd } from "./commands/render.js";
import { assetsCmd } from "./commands/assets.js";
import { exampleCmd } from "./commands/example.js";
import { audioCmd } from "./commands/audio.js";
import { videoCmd } from "./commands/video.js";
import { bannerCmd } from "./commands/banner.js";
import { bannerString } from "./lib/banner.js";

const program = new Command();

program
  .name("ralphy")
  .description("UGC video generation pipeline CLI")
  .version("1.0.0")
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

program.addCommand(setupCmd());
program.addCommand(statusCmd());
program.addCommand(doctorCmd());
program.addCommand(generateCmd());
program.addCommand(modelsCmd());
program.addCommand(daemonCmd());
program.addCommand(renderCmd());
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

program.addHelpText("beforeAll", bannerString());

program.parseAsync();
