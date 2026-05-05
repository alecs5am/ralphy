// `ralphy status` — capability + project state, JSON or pretty.
//
// Discoverable shortcut for `ralphy setup --status`. Used by skills (Claude
// Code, ralph-core) to decide whether to run the wizard.

import { Command } from "commander";
import { getCapabilityStatus } from "../lib/capabilities.js";
import { findProjectRootSafe } from "../lib/project-root.js";
import { out, isPretty } from "../lib/output.js";

export function statusCmd() {
  return new Command("status")
    .description("Show enabled capabilities + linked project")
    .action(async () => {
      const caps = getCapabilityStatus();
      const projectDir = await findProjectRootSafe();

      if (isPretty()) {
        console.log(`\n  Project: ${projectDir ?? "(not linked — run `ralphy setup`)"}\n`);
        const grouped: Record<string, typeof caps> = {};
        for (const c of caps) {
          (grouped[c.category] ??= []).push(c);
        }
        for (const [cat, list] of Object.entries(grouped)) {
          console.log(`  ${cat}`);
          for (const c of list) {
            const tag = c.enabled ? "✓" : c.required ? "✗" : "○";
            const env = c.envVar ?? "(no key)";
            console.log(`    ${tag}  ${c.label.padEnd(28)} ${env}`);
          }
          console.log();
        }
        return;
      }

      out({
        project_dir: projectDir,
        capabilities: caps,
      });
    });
}
