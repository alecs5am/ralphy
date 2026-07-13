import { Command } from "commander";
import fs from "node:fs/promises";
import path from "node:path";
import { workspaceDir } from "../lib/paths.js";
import { postizIntegrations, type PostizIntegration } from "../lib/providers/postiz.js";
import { out, ok } from "../lib/output.js";
import { raiseError } from "../lib/errors/index.js";

type Credentials = {
  version?: number;
  connectors?: Record<string, unknown>;
  [key: string]: unknown;
};

function safeIntegration(row: PostizIntegration) {
  return {
    id: row.id,
    name: typeof row.name === "string" ? row.name : null,
    identifier: typeof row.identifier === "string" ? row.identifier : null,
    profile: typeof row.profile === "string" ? row.profile : null,
    picture: typeof row.picture === "string" ? row.picture : null,
    disabled: Boolean(row.disabled),
  };
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) throw new Error("pipe the API key to stdin when --api-key is '-'");
  let value = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) value += chunk;
  return value.trim();
}

async function readCredentials(file: string): Promise<{ raw: string | null; value: Credentials }> {
  try {
    const raw = await fs.readFile(file, "utf8");
    return { raw, value: JSON.parse(raw) as Credentials };
  } catch {
    return { raw: null, value: { version: 1 } };
  }
}

async function savePostizCredentials(
  workspace: string,
  apiKey: string,
  apiUrl: string,
): Promise<{ file: string; previous: string | null }> {
  const file = path.join(workspaceDir(workspace), "credentials.json");
  const { raw: previous, value } = await readCredentials(file);
  const connectors = value.connectors ?? {};
  const updated: Credentials = {
    ...value,
    version: value.version ?? 1,
    connectors: {
      ...connectors,
      postiz: { apiKey, apiUrl },
    },
  };
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(updated, null, 2) + "\n", { mode: 0o600 });
  await fs.chmod(file, 0o600);
  return { file, previous };
}

async function restoreCredentials(file: string, previous: string | null): Promise<void> {
  if (previous === null) {
    await fs.rm(file, { force: true });
    return;
  }
  await fs.writeFile(file, previous, { mode: 0o600 });
  await fs.chmod(file, 0o600);
}

export function postizCmd() {
  const cmd = new Command("postiz").description(
    "Connect and inspect the active workspace's Postiz publishing account",
  );

  cmd
    .command("connect")
    .description("Save a workspace-local Postiz key and verify it with a read-only integrations request")
    .requiredOption("--workspace <slug>", "Workspace that owns this Postiz connection")
    .requiredOption("--api-key <key>", "Postiz API key; use '-' to read it from stdin")
    .option("--api-url <url>", "Full Postiz Public API root", "https://api.postiz.com/public/v1")
    .action(async (opts) => {
      try {
        const apiKey = opts.apiKey === "-" ? await readStdin() : String(opts.apiKey).trim();
        if (!apiKey) throw new Error("Postiz API key is empty");
        const workspace = String(opts.workspace).trim();
        const saved = await savePostizCredentials(workspace, apiKey, String(opts.apiUrl).trim());
        try {
          const integrations = await postizIntegrations(fetch, workspace);
          ok(`Connected Postiz to ${workspace} (${integrations.length} integration(s))`);
          out({
            workspace,
            connected: true,
            credentialsPath: saved.file,
            integrations: integrations.map(safeIntegration),
          });
        } catch (error) {
          await restoreCredentials(saved.file, saved.previous);
          throw error;
        }
      } catch (error) {
        raiseError("E_PROVIDER_HTTP", {
          provider: "Postiz",
          status: "n/a",
          detail: (error as Error).message,
        });
      }
    });

  cmd
    .command("status")
    .description("Verify the saved workspace connection and list public account metadata (read-only)")
    .requiredOption("--workspace <slug>", "Workspace whose Postiz connection to inspect")
    .action(async (opts) => {
      try {
        const workspace = String(opts.workspace).trim();
        const integrations = await postizIntegrations(fetch, workspace);
        out({
          workspace,
          connected: true,
          integrations: integrations.map(safeIntegration),
        });
      } catch (error) {
        raiseError("E_PROVIDER_HTTP", {
          provider: "Postiz",
          status: "n/a",
          detail: (error as Error).message,
        });
      }
    });

  return cmd;
}
