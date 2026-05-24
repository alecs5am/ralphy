# Pluggable provider spec — third-party connectors for Ralphy

> **Status:** idea
> **Filed:** 2026-05-24
> **Folder:** ideas

## Context

Today `cli/lib/providers/llm.ts` and `cli/lib/providers/media.ts` are
hardcoded to OpenRouter (LLM / image / video) and ElevenLabs
(voice / music / SFX). AGENTS.md hard invariant #1 explicitly bans
direct `openai.com` / Vercel / FAL calls inside project code — the
reason was UX simplification in v2, not a principled stance against
heterogeneity.

A real use-case has appeared: a user wants to use Ralphy as the engine
for a content farm running on their own GPU cluster (or on FAL, or on
Replicate, or against a self-hosted LiteLLM / Ollama proxy). Right now
the only path is fork-and-patch. The clean path is a published
connector spec — the user hires a programmer, that programmer
implements our interface against their stack, drops the package into
Ralphy, done. OpenRouter stays first-class default; everything else is
opt-in through the same gate.

This idea is the **spec design**, not the implementation. Goal: write
down the contract so we can debate the shape before any code lands.

## What

### 1. The interface (TypeScript, single file)

A connector is a module exporting one default object that satisfies
`RalphyConnector`. Shape:

```ts
export interface RalphyConnector {
  /** Stable id, kebab-case. Used as model prefix: "<id>:<model>". */
  readonly id: string;

  /** Semver of the connector itself (not of the upstream API). */
  readonly version: string;

  /** Semver range of Ralphy connector-spec this targets. */
  readonly specVersion: string; // e.g. "^1.0.0"

  /** Which capabilities this connector advertises. */
  readonly capabilities: Capability[];

  /** Called once after load. Throw to refuse activation (missing key, bad config). */
  init(ctx: ConnectorContext): Promise<void>;

  /** Health probe. Called by `ralphy doctor` + `ralphy provider test`. */
  health(): Promise<HealthReport>;

  /** Static catalog. Cached by Ralphy; refreshed on `ralphy provider refresh <id>`. */
  listModels(): Promise<ModelDescriptor[]>;

  /** Each capability is optional — present iff advertised in `capabilities`. */
  generateText?(input: TextInput): Promise<TextResult>;
  generateImage?(input: ImageInput): Promise<MediaResult>;
  generateVideo?(input: VideoInput): Promise<MediaResult>;
  generateVoice?(input: VoiceInput): Promise<MediaResult>;
  generateMusic?(input: MusicInput): Promise<MediaResult>;
  generateSfx?(input: SfxInput): Promise<MediaResult>;
  transcribe?(input: TranscribeInput): Promise<TranscribeResult>;
}

type Capability =
  | "text" | "vision" | "image" | "video"
  | "voice" | "music" | "sfx" | "transcribe";
```

`ConnectorContext` (passed to `init`) gives the connector:
- `config: Record<string, unknown>` — the `[providers.<id>]` block from `providers.toml`.
- `secrets: (envVar: string) => string | undefined` — never the raw `process.env`; routed through us so we can audit.
- `logger: { info, warn, error }` — connector logs end up in `workspace/.ralph/connectors/<id>.log`.
- `cacheDir: string` — connector-private, gitignored.
- `fetch: typeof fetch` — wrapped with retry + timeout + outbound-host allowlist from config.

All input types share a small common envelope:

```ts
interface CommonInput {
  projectId?: string;       // for gen-log provenance
  slot?: string;            // e.g. "scene-04-bg-image"
  model: string;            // already stripped of the "<id>:" prefix
  signal?: AbortSignal;
  costCeilingUsd?: number;  // connector SHOULD refuse if estimate exceeds
}
```

`MediaResult` is `{ bytes: Uint8Array, mime: string, costUsd?: number, latencyMs: number, raw?: unknown }` — Ralphy owns the disk write so we keep the append-only / versioned-slot invariant (#13) consistent across all connectors.

### 2. Manifest + discovery

Two registration paths, ranked by ergonomics:

**a) Config-only** for connectors that already exist in the npm registry — `~/.config/ralphy/providers.toml`:

```toml
[providers.fal]
module = "@ralphy/connector-fal"        # resolved via node_modules + bundled set
secrets = { FAL_KEY = "FAL_KEY" }       # env-var allowlist, no raw passthrough
defaults = { image = "flux-pro-1.1", video = "kling-v2" }

[providers.mygpu]
kind = "openai-compat"                  # built-in generic, no module needed
base_url = "https://gpu.mycorp.com/v1"
api_key_env = "MYGPU_KEY"
default_models = { llm = "qwen3-72b", image = "flux-schnell" }
```

The `kind = "openai-compat"` shortcut covers any OpenAI-compatible LLM (Ollama, vLLM, LM Studio, LiteLLM, Together, Groq, Fireworks, DeepInfra) with zero code — the user only writes TOML. That is the 80% case.

**b) Package** for everything non-standard. Connectors ship as npm packages named `@<org>/ralphy-connector-<id>` or `ralphy-connector-<id>`. Ralphy loads them with dynamic `import()` from the user's local install. Bundled, blessed connectors (OpenRouter, ElevenLabs, FAL, Replicate) live in `cli/connectors/<id>/` and ship in the binary.

### 3. Model routing

Models are addressed `<provider-id>:<model-id>` everywhere they appear: prompts, CLI flags, `asset-manifest.json`, gen-log. Resolution:

1. Explicit prefix wins (`fal:flux-pro-1.1`).
2. Otherwise the per-capability default from `providers.toml` (`[defaults] image = "fal:flux-pro-1.1"`).
3. Otherwise the bundled OpenRouter / ElevenLabs default.

Bare model strings without a prefix are deprecated but accepted for one release with a warning, then a lint failure.

### 4. New CLI surface

- `ralphy provider list` — show all registered connectors + their capabilities + health.
- `ralphy provider test <id>` — calls `health()` then a trivial generation per capability.
- `ralphy provider add <module> [--as <id>]` — npm-install + register.
- `ralphy provider remove <id>`.
- `ralphy provider refresh <id>` — re-call `listModels()`.
- `ralphy models list [--provider <id>] [--capability <cap>]` — replaces hand-curated `MODELS.md` as the source of truth; that file becomes a curated cookbook for the bundled defaults only.

### 5. Cost + logging contract

Each connector returns `costUsd` per call when known. When it isn't (local GPU, fixed-cost subscription), the connector returns `costUsd: 0` and a `meta: { billable: false }` flag — `gen-log.ts` already records `provider: string`, no schema change beyond widening that union.

### 6. Versioning + compat

- The spec is semver-versioned in its own package (`@ralphy/connector-spec`).
- Connectors declare `specVersion` and Ralphy refuses to load mismatched majors.
- Adding a new capability is a minor bump (existing connectors continue to work, just don't expose the new verb).
- Renaming or reshaping an existing capability is a major bump.

## Why it matters

- **Content-farm use-case becomes possible without a fork.** A user can hire one engineer, write one connector, point Ralphy at their stack — every scenarist / art-director / editor playbook keeps working unchanged.
- **Cost ceiling drops.** Self-hosted Flux / Wan / Mochi on the user's GPU is materially cheaper at farm scale than OpenRouter rates. We don't have to ship that infra; the user wires it in.
- **Privacy path.** Some users can't send refs through a third party. A local connector + local LLM (Ollama / Llama-3.1-70B) is the answer; the spec is the contract that lets us say "yes" without committing to maintain every backend.
- **OpenRouter stays first-class.** Default UX doesn't change. The spec exists for the long tail, not the median user.
- **Erases AGENTS.md invariant #1 friction.** That invariant becomes "only connectors registered in `providers.toml`" — a stricter, more enforceable rule than the current name-based ban.

## Notes

- **Out of scope for this idea.** Render engines (HyperFrames / Remotion) — those stay code-level, not connector-level. Only model calls are pluggable.
- **Open question — secrets.** Should the connector ever see a raw API key, or always go through a signing proxy in Ralphy? Lean toward: connector gets `(envVar) => string`, returns nothing about it; Ralphy gates which env vars a given connector can read via the `secrets = { ... }` allowlist in TOML. Stops a hostile npm package from exfiltrating `OPENROUTER_API_KEY`.
- **Open question — sandboxing.** First version probably runs connectors in-process (trust the npm install). Hardening (subprocess + IPC) is a follow-up if a connector vulnerability bites us.
- **Open question — reference-image conversion.** Each provider takes refs in a different shape (URL list / base64 / Replicate file-upload / Comfy node-id). The connector is responsible for converting our normalized `refs: string[]` (URLs or `file://` paths) to the provider's wire format. Document this explicitly — easy place to skip and ship a broken adapter.
- **Open question — quality-gate models.** `scoreScenario` / `scoreImage` / `scoreVideo` currently hardcode `gemini-2.5-flash`. They become "any connector advertising `vision`, with `text` fallback for `scoreScenario`". Worth treating as a separate capability slot in `providers.toml` — `[gates] vision = "openrouter:gemini-2.5-flash"` — so swapping the user's image provider doesn't accidentally swap the judge.
- **Bundled set at launch.** `openrouter`, `elevenlabs`, `openai-compat` (generic), maybe `fal` and `replicate`. Anything beyond — community.
- **Promotion target.** When this graduates, it likely splits into 3+ roadmap tasks: (1) spec package + bundled-connector refactor of current code; (2) TOML loader + `ralphy provider *` CLI; (3) MODELS.md → dynamic catalog migration. Spec design itself probably wants a `D-NN` decision record under the new `roadmap/<NN>-connector-spec/` once we commit.
- **Naming.** "Connector" vs "provider" — code today says provider, this doc says connector. Settle one term before the roadmap split: "connector" reads more like a pluggable third-party thing; "provider" feels internal. Lean connector.
- **Cross-ref.** This idea is the structural answer to the conversation that produced it (2026-05-24 chat re: OpenRouter independence). The 4-phase migration sketch in that chat is the implementation outline; this note is just the spec contract that all four phases would target.
