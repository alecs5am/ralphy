import { Command } from "commander";
import { raiseError } from "../lib/errors/index.js";
import { out } from "../lib/output.js";
import { ralphDir } from "../lib/paths.js";
import { startPanelServer } from "../lib/panel/server.js";
import { VERSION } from "../lib/version.js";

const DEFAULT_PORT = 4777;

export function panelCmd(): Command {
  return new Command("panel")
    .description(
      "Serve a read-only side panel on 127.0.0.1 for the agent's built-in browser: live job activity " +
      "(running, failed, queued, done) and trend references to copy (picks, rising signals, top videos, " +
      "formats). Runs in the foreground until stopped; reuses a panel already serving the same data root.",
    )
    .option("--port <n>", `Port on 127.0.0.1 (default ${DEFAULT_PORT})`, parsePort, DEFAULT_PORT)
    .option("--trend-workspace <id>", "Workspace id or slug holding the trend corpus (default: trend-corpus, else the first with niches)")
    .action(async (opts: { port: number; trendWorkspace?: string }) => {
      const dataRoot = ralphDir();
      const existing = await probe(opts.port);
      if (existing) {
        if (existing.root !== dataRoot) {
          raiseError("E_INPUT_INVALID", {
            field: "--port",
            detail: `port ${opts.port} already serves a Ralphy panel for ${existing.root}; pass another --port`,
            verb: "panel",
          });
        }
        out({ url: `http://127.0.0.1:${opts.port}/`, port: opts.port, root: dataRoot, reused: true });
        return;
      }
      let server: ReturnType<typeof startPanelServer>;
      try {
        server = startPanelServer({ dataRoot, port: opts.port, trendWorkspace: opts.trendWorkspace, version: VERSION });
      } catch (error) {
        raiseError("E_INPUT_INVALID", {
          field: "--port",
          detail: `cannot listen on 127.0.0.1:${opts.port} (${error instanceof Error ? error.message : String(error)})`,
          verb: "panel",
        });
      }
      if (opts.trendWorkspace && !server.trendWorkspace) {
        server.stop();
        raiseError("E_NOT_FOUND", { kind: "Workspace", id: opts.trendWorkspace });
      }
      out({ url: server.url, port: server.port, root: dataRoot, reused: false, trendWorkspace: server.trendWorkspace?.slug ?? null });
      await new Promise<void>((resolve) => {
        const stop = () => { server.stop(); resolve(); };
        process.once("SIGINT", stop);
        process.once("SIGTERM", stop);
      });
    });
}

function parsePort(value: string): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    raiseError("E_INPUT_INVALID", { field: "--port", detail: `expected 1-65535, got ${value}`, verb: "panel" });
  }
  return port;
}

/** The panel already listening on this port, if any. */
async function probe(port: number): Promise<{ root: string } | null> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(800) });
    const body = (await response.json()) as { app?: string; root?: string };
    return body.app === "ralphy-panel" && body.root ? { root: body.root } : null;
  } catch {
    return null;
  }
}
