import { Command } from "commander";
import { postizIntegrations, type PostizIntegration } from "../lib/providers/postiz.js";
import { out, ok } from "../lib/output.js";
import { raiseError } from "../lib/errors/index.js";
import { DomainError } from "../lib/errors/domain.js";
import { activeCredentialResolver } from "../lib/providers/credentials.js";
import { connectPostizWorkspace } from "../lib/calendar/connection.js";
import { assertCommandWorkspace } from "../lib/context-state.js";

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
  if (process.stdin.isTTY) throw new Error("pipe the API key to stdin with --stdin");
  let value = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) {
    value += chunk;
    if (value.length > 4096) throw new Error("Postiz API key is too long");
  }
  return value.trim();
}

export function postizCmd() {
  const cmd = new Command("postiz").description(
    "Connect and inspect the active workspace's Postiz publishing account",
  );

  cmd
    .command("connect")
    .description("Verify a Postiz key, save it encrypted, and import supported social accounts")
    .requiredOption("--workspace <slug>", "Workspace that owns this Postiz connection")
    .requiredOption("--stdin", "Read the Postiz API key from stdin")
    .option("--account <id>", "Reconnect one existing account")
    .option("--expected-row-version <number>", "Required version when reconnecting an account")
    .action(async (opts) => {
      try {
        const apiKey = await readStdin();
        if (!apiKey) throw new Error("Postiz API key is empty");
        const workspace = String(opts.workspace).trim();
        assertCommandWorkspace(workspace);
        const resolver = activeCredentialResolver();
        if (!resolver) throw new DomainError("E_MIGRATION_INCOMPLETE");
        const result = await connectPostizWorkspace({
          workspaceId: workspace, credential: apiKey, resolver,
          accountId: opts.account, expectedRowVersion: opts.expectedRowVersion === undefined ? undefined : Number(opts.expectedRowVersion),
        });
        ok(`Connected Postiz to ${workspace} (${result.imported} account(s))`);
        out({ workspace, ...result });
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
        assertCommandWorkspace(workspace);
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
