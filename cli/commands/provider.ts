// `ralphy provider` — inspect the pluggable-provider connector registry.
//
// Promoted to the executable connector roadmap in #487. Today it exposes the
// capability matrix of the bundled connectors (OpenRouter + ElevenLabs + fal)
// PLUS any custom OpenAI-compatible connectors declared in `.ralphy/config.json`
// `providers[]` (local / self-hosted Ollama / vLLM / LiteLLM endpoints). The
// `--provider <id>` flag on `ralphy generate <kind>` selects one; when omitted,
// the first available connector that serves the capability wins.
//
//   provider list [--capability <cap>]   — the connector/capability matrix
//   provider test [<id>] [--ping]        — availability + config validity (offline by default)
//   provider matrix [--model <id>]       — per-(model, capability, provider) param coverage (#497)

import { Command } from "commander";
import { out } from "../lib/output.js";
import { providerMatrix, type Capability } from "../lib/providers/registry.js";
import { PROVIDER_COVERAGE, coverageForModel } from "../lib/providers/coverage.js";
import { loadProviderConfigs } from "../lib/providers/config.js";
import { raiseError } from "../lib/errors/index.js";
import { DomainError } from "../lib/errors/domain.js";
import { getCommandContext, type ResolvedCommandContext } from "../lib/context-state.js";
import {
  activeCredentialResolver,
  credentialSecretRef,
  type CredentialResolver,
} from "../lib/providers/credentials.js";
import {
  getSocialAccountCredentialState,
} from "../lib/store/scopes.js";
import { StoreConflictError } from "../lib/store/types.js";

const ALL_CAPS: Capability[] = ["text", "image", "video", "voice", "music", "sfx", "transcribe"];

function assertCapability(cap: string | undefined): Capability | undefined {
  if (cap === undefined) return undefined;
  if (!ALL_CAPS.includes(cap as Capability)) {
    raiseError("E_INPUT_INVALID", {
      field: "capability",
      detail: `unknown capability '${cap}'. Allowed: ${ALL_CAPS.join(", ")}`,
      verb: "provider",
    });
  }
  return cap as Capability;
}

export function providerCmd(dependencies: {
  resolver?: CredentialResolver;
  readStdin?: () => Promise<string>;
  context?: ResolvedCommandContext;
  accountCredentialState?: typeof getSocialAccountCredentialState;
} = {}) {
  const cmd = new Command("provider").description(
    "Inspect provider connectors and their capability matrix (image / video / voice / music / sfx / text / transcribe).",
  );

  cmd
    .command("list")
    .description("List registered provider connectors, their capabilities, and whether each is configured (key present).")
    .option("--capability <cap>", `Only show connectors that serve this capability (${ALL_CAPS.join(" | ")}).`)
    .action((opts: { capability?: string }) => {
      const cap = assertCapability(opts.capability);
      const rows = providerMatrix().filter((r) => !cap || r.capabilities.includes(cap));
      out({
        capabilities: ALL_CAPS,
        filter: cap ?? null,
        providers: rows.map((r) => ({
          id: r.id,
          label: r.label,
          envVar: r.envVar,
          available: r.available,
          capabilities: r.capabilities,
          matrix: Object.fromEntries(ALL_CAPS.map((c) => [c, r.capabilities.includes(c)])),
        })),
      });
    });

  const auth = cmd
    .command("auth")
    .description("Manage scoped provider credentials");
  const resolver = () => {
    const value = dependencies.resolver ?? activeCredentialResolver();
    if (!value) {
      throw new DomainError("E_MIGRATION_INCOMPLETE");
    }
    return value;
  };
  const emitStatus = async (provider: string, accountId?: string) => {
    if (accountId) {
      const context = accountContext(dependencies);
      const state = (dependencies.accountCredentialState ??
        getSocialAccountCredentialState)({
        workspaceId: context.workspaceId,
        accountId,
      });
      const status = await resolver().status(provider, { accountId });
      const expectedRef = credentialSecretRef(provider, { ...context, accountId });
      out({
        provider,
        configured: state.credentialRef === expectedRef && status.configured,
        source:
          state.credentialRef === expectedRef && status.configured
            ? status.source
            : "missing",
        relinkRequired: state.relinkRequired,
      });
      return;
    }
    const status = await resolver().status(provider);
    out({ provider, ...status });
  };

  auth
    .command("set <provider>")
    .description("Store a credential for the immutable command scope")
    .requiredOption("--stdin", "Read the credential from stdin")
    .option("--account <id>", "Bind the credential to a Social Account")
    .option("--row-version <n>", "Expected Social Account row version", parseRowVersion)
    .action(async (provider: string, opts: AccountAuthOptions) => {
      if (!opts.account) {
        rejectUnusedRowVersion(opts);
        const value = await (dependencies.readStdin ?? readCredentialStdin)();
        await resolver().set(provider, value);
        await emitStatus(provider);
        return;
      }
      const context = accountContext(dependencies);
      const rowVersion = requiredRowVersion(opts);
      assertAccountRowVersion(dependencies, context, opts.account, rowVersion);
      const value = await (dependencies.readStdin ?? readCredentialStdin)();
      await resolver().set(provider, value, {
        accountId: opts.account,
        expectedRowVersion: rowVersion,
      });
      await emitStatus(provider, opts.account);
    });

  auth
    .command("clear <provider>")
    .description("Delete the encrypted credential for the command scope")
    .option("--account <id>", "Clear the credential for a Social Account")
    .option("--row-version <n>", "Expected Social Account row version", parseRowVersion)
    .action(async (provider: string, opts: AccountAuthOptions) => {
      if (!opts.account) {
        rejectUnusedRowVersion(opts);
        await resolver().clear(provider);
        await emitStatus(provider);
        return;
      }
      const context = accountContext(dependencies);
      const rowVersion = requiredRowVersion(opts);
      assertAccountRowVersion(dependencies, context, opts.account, rowVersion);
      await resolver().clear(provider, {
        accountId: opts.account,
        expectedRowVersion: rowVersion,
      });
      await emitStatus(provider, opts.account);
    });

  auth
    .command("status <provider>")
    .description("Report credential configuration without revealing a value")
    .option("--account <id>", "Report credential status for a Social Account")
    .action((provider: string, opts: AccountAuthOptions) =>
      emitStatus(provider, opts.account),
    );

  auth
    .command("login <provider>")
    .description("Invoke a provider-owned subscription login flow")
    .action(async (provider: string) => {
      await resolver().login(provider);
      await emitStatus(provider);
    });

  cmd
    .command("test [id]")
    .description("Report each connector's availability + config validity. Offline by default (no network); --ping hits the endpoint.")
    .option("--ping", "Probe the endpoint over the network (not just config/key checks). Use with care.")
    .action((id: string | undefined, opts: { ping?: boolean }) => {
      const { errors } = loadProviderConfigs();
      let rows = providerMatrix();
      if (id) {
        rows = rows.filter((r) => r.id === id);
        if (rows.length === 0) {
          raiseError("E_NOT_FOUND", { kind: "provider", id });
        }
      }
      const providers = rows.map((r) => ({
        id: r.id,
        label: r.label,
        envVar: r.envVar,
        available: r.available,
        capabilities: r.capabilities,
        verdict: r.available ? "ready" : `unavailable (set ${r.envVar})`,
      }));
      out({
        providers,
        // Surface config-parse errors so a malformed providers[] entry is visible.
        configErrors: errors,
        pinged: Boolean(opts.ping),
      });
    });

  cmd
    .command("matrix")
    .description(
      "Per-(model, capability, provider) parameter-coverage matrix (#497): which connector-input params each provider actually honors for a model, notable unsupported ones, and the provider that covers them. Hand-curated registry data (decision D-02) — an unknown model has no entry (no entry = no warning at generate time). Example: ralphy provider matrix --model bytedance/seedance-2.0",
    )
    .option(
      "--model <id>",
      "Only rows for this model id, plus its cross-provider family siblings (e.g. bytedance/seedance-2.0 also shows the fal reference-to-video row).",
    )
    .option("--capability <cap>", `Only rows for this capability (${ALL_CAPS.join(" | ")}).`)
    .action((opts: { model?: string; capability?: string }) => {
      const cap = assertCapability(opts.capability);
      let entries = opts.model ? coverageForModel(opts.model) : PROVIDER_COVERAGE;
      if (cap) entries = entries.filter((e) => e.capability === cap);
      out({
        filter: { model: opts.model ?? null, capability: cap ?? null },
        count: entries.length,
        entries: entries.map((e) => ({
          provider: e.provider,
          model: e.model,
          capability: e.capability,
          family: e.family,
          supportedParams: e.supportedParams,
          unsupportedParams: e.unsupportedParams,
          source: e.source,
          notes: e.notes ?? null,
        })),
      });
    });

  return cmd;
}

async function readCredentialStdin(): Promise<string> {
  if (process.stdin.isTTY) {
    throw new DomainError("E_INPUT_INVALID", undefined, {
      field: "stdin",
      detail: "credential input must be piped to stdin",
      verb: "provider auth set",
    });
  }
  process.stdin.setEncoding("utf8");
  let value = "";
  for await (const chunk of process.stdin) value += chunk;
  return value.trim();
}

type AccountAuthOptions = {
  account?: string;
  rowVersion?: number;
};

function parseRowVersion(value: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw providerAuthInput("row-version", "must be a positive integer");
  }
  return parsed;
}

function requiredRowVersion(opts: AccountAuthOptions): number {
  if (opts.rowVersion === undefined) {
    throw providerAuthInput(
      "row-version",
      "is required when --account is provided",
    );
  }
  return opts.rowVersion;
}

function rejectUnusedRowVersion(opts: AccountAuthOptions): void {
  if (opts.rowVersion !== undefined) {
    throw providerAuthInput("account", "is required with --row-version");
  }
}

function accountContext(dependencies: {
  context?: ResolvedCommandContext;
}): ResolvedCommandContext {
  const context = dependencies.context ?? getCommandContext();
  if (!context) throw new DomainError("E_MIGRATION_INCOMPLETE");
  return context;
}

function assertAccountRowVersion(
  dependencies: {
    accountCredentialState?: typeof getSocialAccountCredentialState;
  },
  context: ResolvedCommandContext,
  accountId: string,
  expectedRowVersion: number,
): void {
  const state = (dependencies.accountCredentialState ??
    getSocialAccountCredentialState)({
    workspaceId: context.workspaceId,
    accountId,
  });
  if (state.rowVersion !== expectedRowVersion) throw new StoreConflictError();
}

function providerAuthInput(field: string, detail: string): DomainError {
  return new DomainError("E_INPUT_INVALID", undefined, {
    field,
    detail,
    verb: "provider auth",
  });
}
