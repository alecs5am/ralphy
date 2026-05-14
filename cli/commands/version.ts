import { Command } from "commander";
import { out } from "../lib/output.js";
import { VERSION } from "../lib/version.js";

export function versionCmd() {
  return new Command("version")
    .description("Print the ralphy version (same as -v / --version)")
    .action(() => {
      out({ version: VERSION });
    });
}
