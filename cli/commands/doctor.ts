// `ralphy doctor` — env health check. JSON output for skills + automation.
//
// Per AGENTS.md hard rule #5 (no auto-launched processes), this replaces the
// old `core playbook` session bootstrap that used to spawn Studio + dashboard.
// The skill now invokes `ralphy doctor`, walks the user through fixing
// blockers, and stops without starting any background services.

import { Command } from "commander";
import { spawn } from "node:child_process";
import path from "node:path";
import { existsSync } from "node:fs";
import { CAPABILITIES, hasCapability } from "../lib/capabilities.js";
import { findProjectRootSafe, readGlobalConfig } from "../lib/project-root.js";
import { out, isPretty } from "../lib/output.js";

type DoctorReport = {
  ralphy: {
    installed: true;
    version: string;
    linkedProject: string | null;
    cwd: string;
  };
  deps: {
    bun: boolean;
    ffmpeg: boolean;
  };
  keys: Record<string, boolean>;
  blockers: string[];
  warnings: string[];
};

async function bin(name: string, flag = "--version"): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn(name, [flag], { stdio: ["ignore", "ignore", "ignore"] });
    proc.on("error", () => resolve(false));
    proc.on("close", (code) => resolve(code === 0));
  });
}

const VERSION = "1.0.0";

export function doctorCmd() {
  return new Command("doctor")
    .description("Env health check — keys, dependencies, project link. JSON for scripts; -p for human view.")
    .action(async () => {
      const report: DoctorReport = {
        ralphy: {
          installed: true,
          version: VERSION,
          linkedProject: null,
          cwd: process.cwd(),
        },
        deps: { bun: false, ffmpeg: false },
        keys: {},
        blockers: [],
        warnings: [],
      };

      // Project linkage
      const linked = await findProjectRootSafe();
      const cfg = await readGlobalConfig();
      report.ralphy.linkedProject = linked ?? cfg.default_project_dir ?? null;
      if (!report.ralphy.linkedProject) {
        report.warnings.push(
          "ralphy is not linked to a project — run `ralphy setup --link <path>` or `cd` into the project root.",
        );
      } else if (!existsSync(path.join(report.ralphy.linkedProject, "package.json"))) {
        report.warnings.push(
          `Linked project at ${report.ralphy.linkedProject} has no package.json — was it moved or deleted?`,
        );
      }

      // Dependencies
      // ffmpeg uses single-dash `-version`, bun uses `--version`.
      [report.deps.bun, report.deps.ffmpeg] = await Promise.all([
        bin("bun"),
        bin("ffmpeg", "-version"),
      ]);
      if (!report.deps.bun) report.blockers.push("bun is not installed — `brew install bun`.");
      if (!report.deps.ffmpeg) report.blockers.push("ffmpeg is not installed — `brew install ffmpeg`.");

      // Keys
      for (const cap of CAPABILITIES) {
        const present = hasCapability(cap.id);
        report.keys[cap.envVar] = present;
        if (!present && cap.required) {
          report.blockers.push(
            `${cap.envVar} missing — ${cap.label} required (${cap.signupUrl}). Run \`ralphy setup\`.`,
          );
        }
      }

      if (isPretty()) {
        const ui = await import("../lib/ui.js");
        const { c, icons, section, kv } = ui;
        console.log();
        console.log(`${icons.spark} ${c.bold("ralphy")} ${c.value("v" + report.ralphy.version)}`);
        kv(
          {
            cwd: report.ralphy.cwd,
            project: report.ralphy.linkedProject ?? c.muted("(not linked)"),
          },
          { maxKeyWidth: 8 },
        );

        section("Dependencies");
        console.log(`  ${report.deps.bun ? icons.ok : icons.fail} bun`);
        console.log(`  ${report.deps.ffmpeg ? icons.ok : icons.fail} ffmpeg`);

        section("API keys");
        for (const cap of CAPABILITIES) {
          const ok = report.keys[cap.envVar];
          console.log(`  ${ok ? icons.ok : icons.fail} ${c.label(cap.envVar.padEnd(24))} ${c.value(cap.label)}`);
        }

        if (report.blockers.length > 0) {
          section(`Blockers ${c.err(`(${report.blockers.length})`)}`);
          for (const b of report.blockers) console.log(`  ${icons.fail} ${c.err(b)}`);
        }
        if (report.warnings.length > 0) {
          section(`Warnings ${c.warn(`(${report.warnings.length})`)}`);
          for (const w of report.warnings) console.log(`  ${icons.warn} ${c.warn(w)}`);
        }
        if (report.blockers.length === 0 && report.warnings.length === 0) {
          console.log(`\n  ${icons.ok} ${c.ok("ready")}\n`);
        }
        return;
      }

      out(report);
      if (report.blockers.length > 0) process.exitCode = 1;
    });
}
