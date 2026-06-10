// `ralphy doctor` — env health check. JSON output for skills + automation.
//
// Per AGENTS.md hard rule #5 (no auto-launched processes), this replaces the
// old `core playbook` session bootstrap that used to spawn Studio + dashboard.
// The skill now invokes `ralphy doctor`, walks the user through fixing
// blockers, and stops without starting any background services.

import { Command } from "commander";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { existsSync } from "node:fs";
import { CAPABILITIES, hasCapability } from "../lib/capabilities.js";
import { findProjectRootSafe, readGlobalConfig } from "../lib/project-root.js";
import { out, isPretty } from "../lib/output.js";
import { readGlobalConfig as readHomeConfig } from "../lib/global-config.js";
import { checkForUpdate, type InstallMode as UpdateInstallMode } from "../lib/update-check.js";
import { daemonStatus } from "../lib/jobs/daemon.js";
import { countByStatus } from "../lib/jobs/db.js";

type InstallMode = "binary" | "developer";

type DoctorReport = {
  ralphy: {
    installed: true;
    version: string;
    linkedProject: string | null;
    cwd: string;
    mode: InstallMode;
    home: string;
    repoRoot: string | null;
    templatesSource: "bundled" | "repo";
  };
  versions?: {
    current: string;
    latest: string | null;
    update_hint?: string;
  };
  deps: {
    bun: boolean;
    ffmpeg: boolean;
    /** Optional dependency (#101) — info-level only, never a blocker. */
    imagemagick: boolean;
  };
  keys: Record<string, boolean>;
  daemon?: {
    running: boolean;
    pid: number | null;
    pending: number;
    running_jobs: number;
    failed: number;
    idle_with_pending: boolean;
  };
  blockers: string[];
  warnings: string[];
};

/**
 * Detect install mode (01.09.07).
 * - "developer": running from a repo checkout — package.json + cli/index.ts both reachable.
 * - "binary":    running from a standalone binary install — no repo siblings.
 *
 * Heuristic: walk up from this file's dir (cli/commands/) looking for the
 * marker pair. If found, dev. Otherwise binary. (The repo `templates/` folder
 * was retired in #084 — public templates now live in Supabase — so the
 * package.json + cli/index.ts pair is the developer-checkout signal.)
 */
export function detectInstallMode(startDir?: string): {
  mode: InstallMode;
  repoRoot: string | null;
} {
  // import.meta.dir points at cli/commands/ in dev; in a pkg-bundled binary
  // it points inside the binary's virtual snapshot. The marker pair won't
  // be reachable on disk in that case.
  let dir = startDir ?? import.meta.dir;
  for (let depth = 0; depth < 6; depth++) {
    if (
      existsSync(path.join(dir, "package.json")) &&
      existsSync(path.join(dir, "cli", "index.ts"))
    ) {
      return { mode: "developer", repoRoot: dir };
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return { mode: "binary", repoRoot: null };
}

function ralphyHome(): string {
  return process.env.RALPHY_HOME || path.join(os.homedir(), ".ralphy");
}

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
      const installInfo = detectInstallMode();
      const report: DoctorReport = {
        ralphy: {
          installed: true,
          version: VERSION,
          linkedProject: null,
          cwd: process.cwd(),
          mode: installInfo.mode,
          home: ralphyHome(),
          repoRoot: installInfo.repoRoot,
          templatesSource: installInfo.mode === "developer" ? "repo" : "bundled",
        },
        deps: { bun: false, ffmpeg: false, imagemagick: false },
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
      // ffmpeg + imagemagick use single-dash `-version`, bun uses `--version`.
      [report.deps.bun, report.deps.ffmpeg] = await Promise.all([
        bin("bun"),
        bin("ffmpeg", "-version"),
      ]);
      if (!report.deps.bun) report.blockers.push("bun is not installed — `brew install bun`.");
      if (!report.deps.ffmpeg) report.blockers.push("ffmpeg is not installed — `brew install ffmpeg`.");
      // ImageMagick (#101): OPTIONAL — info-level only, never a blocker and
      // never a warning. IM7 ships `magick`, IM6 ships `convert`.
      report.deps.imagemagick =
        (await bin("magick", "-version")) || (await bin("convert", "-version"));

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

      // Daemon health (issue #027) — if the queue has pending work but the
      // daemon isn't running (or is up with zero workers active), warn loudly
      // so the user knows their fan-out is stuck. We open the jobs DB lazily;
      // if it doesn't exist yet (no project / no jobs ever queued) we skip.
      try {
        const ds = daemonStatus();
        const counts = countByStatus();
        const idleWithPending = counts.pending > 0 && counts.running === 0;
        report.daemon = {
          running: ds.running,
          pid: ds.pid,
          pending: counts.pending,
          running_jobs: counts.running,
          failed: counts.failed,
          idle_with_pending: idleWithPending,
        };
        if (idleWithPending) {
          report.warnings.push(
            `daemon idle while ${counts.pending} job${counts.pending === 1 ? "" : "s"} pending — run \`ralphy daemon start\`${counts.failed > 0 ? " or `ralphy queue retry --state failed`" : ""}.`,
          );
        }
      } catch {
        // No jobs DB available — not a developer environment or a fresh
        // workspace; silent skip.
      }

      // Update check (09.05.04) — opt-out via RALPHY_DOCTOR_NO_UPDATE_CHECK=1
      // or `ralphy config set doctor.checkUpdates false`. Network call is
      // bounded by a 5s timeout; failure is silent.
      try {
        const homeCfg = readHomeConfig();
        const mode: UpdateInstallMode =
          installInfo.mode === "developer"
            ? "developer"
            : (process.env.RALPHY_BIN_DIR && process.env.RALPHY_BIN_DIR.includes("homebrew"))
              ? "brew"
              : "binary";
        const updateResult = await checkForUpdate(VERSION, mode, homeCfg);
        report.versions = {
          current: updateResult.current,
          latest: updateResult.latest,
        };
        if (updateResult.update_hint) {
          report.versions.update_hint = updateResult.update_hint;
          report.warnings.push(
            `Newer version available: ${updateResult.latest}. ${updateResult.update_hint}`,
          );
        }
      } catch {
        // Silent — doctor still reports everything else.
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
        // Optional dep — absence is neutral (muted bullet), never the fail icon.
        if (report.deps.imagemagick) {
          console.log(`  ${icons.ok} imagemagick`);
        } else {
          console.log(`  ${c.muted("·")} ${c.muted("imagemagick (optional — enables faster still ops)")}`);
        }

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
