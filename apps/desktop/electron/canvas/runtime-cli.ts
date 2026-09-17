import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { appCredentialEnvironment } from "./app-credentials";

export type CanvasCli = (args: string[], signal?: AbortSignal, input?: string) => Promise<unknown>;

/** Only main constructs argv. No shell and no renderer-provided commands or environment. */
export function canvasCli(bin: string, root: string, workspaceId?: string, credentials: NodeJS.ProcessEnv = {}): CanvasCli {
  return (args, signal, input) => new Promise((resolve, reject) => {
    const home = homedir();
    const child = spawn(bin, ["--json", "--quiet", "--root", root, ...(workspaceId ? ["--workspace", workspaceId] : []), ...args], {
      env: appCredentialEnvironment({ HOME: home, PATH: [join(home, ".bun/bin"), join(home, ".local/bin"), "/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin"].join(":"), LANG: "en_US.UTF-8" }, credentials),
      stdio: ["pipe", "pipe", "pipe"], signal, cwd: root,
    });
    child.stdin.on("error", () => {});
    child.stdin.end(input);
    let stdout = "", stderr = "", exceeded = false, timedOut = false;
    let forceStop: ReturnType<typeof setTimeout> | undefined;
    const stop = () => { child.kill("SIGTERM"); forceStop ??= setTimeout(() => child.kill("SIGKILL"), 2000); };
    signal?.addEventListener("abort", stop, { once: true });
    const timeout = (args[0] === "generate" && !args.includes("--dry-run")) || (args.includes("composition") && args.includes("build")) ? 30 * 60_000
      : args[0] === "workspace" && (args[1] === "import" || args[1] === "export") ? 5 * 60_000 : 45_000;
    const timer = setTimeout(() => { timedOut = true; stop(); }, timeout);
    const collect = (chunk: Buffer, error: boolean) => {
      if (exceeded) return;
      if (error) stderr += chunk.toString("utf8"); else stdout += chunk.toString("utf8");
      if (stdout.length + stderr.length > 8 * 1024 * 1024) { exceeded = true; stop(); }
    };
    child.stdout.on("data", (chunk) => collect(chunk, false));
    child.stderr.on("data", (chunk) => collect(chunk, true));
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("close", (code) => {
      clearTimeout(timer); clearTimeout(forceStop); signal?.removeEventListener("abort", stop);
      if (timedOut) { reject(new Error("Runtime command timed out")); return; }
      if (exceeded) { reject(new Error("Runtime response exceeded its size limit")); return; }
      if (code !== 0) {
        try {
          const failure = JSON.parse(stdout || stderr)?.error;
          if (failure?.code === "E_DEP_MISSING") {
            reject(Object.assign(new Error("Required rendering tools are missing"), { code: "E_DEP_MISSING" }));
            return;
          }
          if (typeof failure?.message === "string") {
            reject(new Error(failure.message));
            return;
          }
        } catch { /* Other command failures keep their existing handling below. */ }
      }
      try {
        const result = JSON.parse(stdout);
        if (code !== 0) throw new Error(result?.error?.message || stderr.slice(-2000) || "Runtime command failed");
        resolve(result);
      } catch (cause) { reject(cause instanceof SyntaxError ? new Error(stderr.slice(-2000) || "Runtime did not return a valid response") : cause); }
    });
  });
}
