import { Command } from "commander";
import { execSync } from "child_process";
import path from "path";
import { root } from "../lib/paths.js";

export function dashboardCmd() {
  return new Command("dashboard")
    .description("Start the dashboard web UI")
    .option("--port <port>", "Port number", "4321")
    .option("--open", "Open in browser")
    .action((opts) => {
      const dashDir = path.join(root(), "dashboard");
      const env = { ...process.env, DASHBOARD_PORT: opts.port, PROJECT_ROOT: root() };
      console.log(`Starting dashboard on http://localhost:${opts.port}...`);
      try {
        execSync(`npx tsx server/index.ts`, { cwd: dashDir, stdio: "inherit", env });
      } catch {
        // Ctrl+C exit
      }
    });
}
