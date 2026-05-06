import { Command } from "commander";
import fs from "fs/promises";
import path from "path";
import { workspace, ralphDir, brandsDir, personasDir, refsDir, projectsDir, batchesDir, templatesDir, referencesDir, root } from "../lib/paths.js";
import { loadRegistry, saveRegistry } from "../lib/registry.js";
import { saveConfig } from "../lib/config.js";
import { out, ok } from "../lib/output.js";

export function initCmd() {
  return new Command("init")
    .description("Initialize workspace and config")
    .option("--defaults", "Use all defaults without prompts")
    .action(async (opts) => {
      const dirs = [
        ralphDir(),
        brandsDir(),
        personasDir(),
        refsDir(),
        projectsDir(),
        batchesDir(),
        templatesDir(),
        referencesDir(),
      ];

      for (const dir of dirs) {
        await fs.mkdir(dir, { recursive: true });
      }

      // Init registry if not exists
      const reg = await loadRegistry();
      await saveRegistry(reg);

      // Init config if not exists
      const configFile = path.join(ralphDir(), "config.json");
      try {
        await fs.access(configFile);
      } catch {
        await saveConfig({
          defaults: {
            platform: "tiktok",
            aspectRatio: "9:16",
            fps: 30,
          },
          render: {
            concurrency: 3,
            quality: "production",
          },
        });
      }

      // Init .env if not exists
      const envFile = path.join(root(), ".env");
      try {
        await fs.access(envFile);
      } catch {
        await fs.writeFile(
          envFile,
          "OPENROUTER_API_KEY=\nELEVENLABS_API_KEY=\n"
        );
      }

      ok("Workspace initialized");
      out({
        workspace: workspace(),
        registry: path.join(ralphDir(), "registry.json"),
        config: configFile,
      });
    });
}
