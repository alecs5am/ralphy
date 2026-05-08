// Daemon lifecycle helpers (start / stop / status / autostart).
//
// `ralphy daemon start` forks the worker as a detached child and returns
// immediately. `ralphy queue add` (and friends) call `ensureDaemonRunning`
// so agents can fire-and-forget a job without explicitly running daemon
// start first.

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { root } from "../paths.js";

const DEFAULT_CONCURRENCY = 4;

export function pidFilePath(): string {
  return path.join(root(), "workspace", ".ralph", "daemon.pid");
}

export function daemonLogPath(): string {
  return path.join(root(), "workspace", ".ralph", "daemon.log");
}

export function readPid(): number | null {
  const p = pidFilePath();
  if (!fs.existsSync(p)) return null;
  const raw = fs.readFileSync(p, "utf8").trim();
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export function isDaemonAlive(pid: number | null): boolean {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function daemonStatus(): {
  running: boolean;
  pid: number | null;
  pidFile: string;
  logFile: string;
} {
  const pid = readPid();
  const running = isDaemonAlive(pid);
  if (pid && !running) {
    // Stale pidfile — clean up so a future start doesn't trip.
    try {
      fs.unlinkSync(pidFilePath());
    } catch {
      /* missing */
    }
  }
  return {
    running,
    pid: running ? pid : null,
    pidFile: pidFilePath(),
    logFile: daemonLogPath(),
  };
}

export function startDaemon(opts: {
  concurrency?: number;
  ralphyBin?: string;
} = {}): { pid: number; logFile: string; pidFile: string } {
  const status = daemonStatus();
  if (status.running) {
    return { pid: status.pid!, logFile: status.logFile, pidFile: status.pidFile };
  }

  fs.mkdirSync(path.dirname(pidFilePath()), { recursive: true });

  const ralphyBin = opts.ralphyBin ?? resolveRalphyBin();
  const concurrency = opts.concurrency ?? DEFAULT_CONCURRENCY;

  const out = fs.openSync(daemonLogPath(), "a");
  const err = fs.openSync(daemonLogPath(), "a");

  // Spawn `bun cli/worker-entry.ts` (a tiny shim that calls runWorkerLoop)
  // with the right argv. Using bun directly so we don't need a built binary.
  const workerEntry = path.join(root(), "cli", "worker-entry.ts");
  const child = spawn("bun", ["run", workerEntry, String(concurrency), ralphyBin], {
    cwd: root(),
    env: { ...process.env, RALPHY_DAEMON: "1" },
    detached: true,
    stdio: ["ignore", out, err],
  });
  child.unref();

  // Wait briefly for the worker to write its pid (it writes pidFile in
  // runWorkerLoop). 2s grace.
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    const pid = readPid();
    if (pid && isDaemonAlive(pid)) {
      return { pid, logFile: daemonLogPath(), pidFile: pidFilePath() };
    }
    Bun.sleepSync(50);
  }
  throw new Error(
    `daemon did not write pid file within 2s — see ${daemonLogPath()} for details`,
  );
}

export function stopDaemon(opts: { graceMs?: number } = {}): {
  stopped: boolean;
  pid: number | null;
} {
  const pid = readPid();
  if (!pid || !isDaemonAlive(pid)) {
    if (pid) {
      try {
        fs.unlinkSync(pidFilePath());
      } catch {
        /* missing */
      }
    }
    return { stopped: false, pid: null };
  }
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    /* already gone */
  }
  const deadline = Date.now() + (opts.graceMs ?? 7000);
  while (Date.now() < deadline) {
    if (!isDaemonAlive(pid)) break;
    Bun.sleepSync(100);
  }
  if (isDaemonAlive(pid)) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      /* already gone */
    }
  }
  try {
    fs.unlinkSync(pidFilePath());
  } catch {
    /* missing */
  }
  return { stopped: true, pid };
}

export function ensureDaemonRunning(): number {
  const s = daemonStatus();
  if (s.running) return s.pid!;
  return startDaemon().pid;
}

function resolveRalphyBin(): string {
  // 1. Explicit RALPHY_BIN env var.
  if (process.env.RALPHY_BIN && fs.existsSync(process.env.RALPHY_BIN)) {
    return process.env.RALPHY_BIN;
  }
  // 2. In-tree dev: if the current root has cli/index.ts, prefer it. The
  //    in-tree code is always at least as new as the installed binary,
  //    and a stale ~/.local/bin/ralphy will reject newer subcommands like
  //    `generate music --queue` or `models list`.
  const inTree = path.join(root(), "cli", "index.ts");
  if (fs.existsSync(inTree)) return inTree;
  // 3. Installed binary fallback.
  const home = process.env.HOME;
  if (home) {
    const local = path.join(home, ".local", "bin", "ralphy");
    if (fs.existsSync(local)) return local;
  }
  // 4. Last resort: rely on PATH.
  return "ralphy";
}

export function isInTreeRalphyBin(bin: string): boolean {
  return bin.endsWith("cli/index.ts") || bin.endsWith("cli\\index.ts");
}
