import { Command } from "commander";
import { postizIntegrations, type PostizIntegration } from "../lib/providers/postiz.js";
import { out, ok } from "../lib/output.js";
import { raiseError } from "../lib/errors/index.js";
import { DomainError } from "../lib/errors/domain.js";
import { activeCredentialResolver } from "../lib/providers/credentials.js";
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
  for await (const chunk of process.stdin) value += chunk;
  return value.trim();
}

export function postizCmd() {
  const cmd = new Command("postiz").description(
    "Connect and inspect the active workspace's Postiz publishing account",
  );

  cmd
    .command("connect")
    .description("Import a scoped Postiz key from stdin and verify it")
    .requiredOption("--workspace <slug>", "Workspace that owns this Postiz connection")
    .requiredOption("--stdin", "Read the Postiz API key from stdin")
    .action(async (opts) => {
      try {
        const apiKey = await readStdin();
        if (!apiKey) throw new Error("Postiz API key is empty");
        const workspace = String(opts.workspace).trim();
        assertCommandWorkspace(workspace);
        const resolver = activeCredentialResolver();
        if (!resolver) throw new DomainError("E_MIGRATION_INCOMPLETE");
        const previous = await resolver.resolve("postiz");
        await resolver.set("postiz", apiKey);
        try {
          const integrations = await postizIntegrations(fetch, workspace);
          ok(`Connected Postiz to ${workspace} (${integrations.length} integration(s))`);
          out({
            workspace,
            connected: true,
            integrations: integrations.map(safeIntegration),
          });
        } catch (error) {
          if (previous.value === null) await resolver.clear("postiz");
          else await resolver.set("postiz", previous.value);
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
