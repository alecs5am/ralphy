import { Command } from "commander";
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
      const identity = resolveDataRoot({ root: options.root });
      setDataRoot(identity.dataRoot);
      await runBridge({ dataRoot: identity.dataRoot });
    });
}
