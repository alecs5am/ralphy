// Test helper: spawn the ralphy CLI as an async child process and await its
// exit. Exists because bun 1.3.x `spawnSync` blocks the parent event loop —
// any test that pairs a sync CLI spawn with an in-process HTTP fixture server
// deadlocks (the fixture can never serve the child's request). See
// notes/issues/072-bun-1.3-test-incompatibilities.md. Use this instead of
// `spawnSync` whenever the test process also runs a server.

import { spawn } from "node:child_process";

export type CliResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
  json: any;
};

export function spawnCli(
  bunArgs: string[],
  opts: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number } = {},
): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    const child = spawn("bun", bunArgs, {
      cwd: opts.cwd,
      env: opts.env ?? { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (opts.timeoutMs) {
      timer = setTimeout(() => child.kill("SIGKILL"), opts.timeoutMs);
    }
    child.on("error", (err) => {
      if (timer) clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      let json: any = null;
      try {
        json = JSON.parse(stdout);
      } catch {
        /* not json */
      }
      resolve({ exitCode: code ?? -1, stdout, stderr, json });
    });
  });
}
