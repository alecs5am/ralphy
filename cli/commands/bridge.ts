import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import { openDomainDbAt } from "../lib/store/db.js";
import { assertStartupJournalReady } from "../lib/migration/cutover-journal.js";
import { resolveDataRoot } from "../lib/context.js";
import { setDataRoot } from "../lib/paths.js";
import { runBridge } from "../lib/bridge/server.js";

export function bridgeCmd(): Command {
  return new Command("bridge")
    .description("Run the versioned desktop stdio bridge")
    .option("--stdio", "serve newline-delimited JSON on stdin/stdout")
    .option("--root <path>", "data root containing ralphy.db")
    .action(async function (this: Command) {
      const options = this.optsWithGlobals() as { stdio?: boolean; root?: string };
      if (!options.stdio) throw new Error("bridge requires --stdio");
      // Only bootstrap a pristine desktop library, never an incomplete legacy store.
      if (options.root && path.basename(path.resolve(options.root)) === ".ralphy" && fs.existsSync(options.root)) {
        const entries = fs.readdirSync(options.root);
        const pristine = entries.length === 0 || (entries.length === 1 && entries[0] === "workspaces"
          && fs.lstatSync(path.join(options.root, "workspaces")).isDirectory()
          && fs.readdirSync(path.join(options.root, "workspaces")).length === 0);
        if (pristine) {
          assertStartupJournalReady(options.root);
          openDomainDbAt(options.root).close();
        }
      }
      const identity = resolveDataRoot({ root: options.root });
      setDataRoot(identity.dataRoot);
      await runBridge({ dataRoot: identity.dataRoot });
    });
}
