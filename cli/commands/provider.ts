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

export function providerCmd() {
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
