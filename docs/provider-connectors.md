# Provider connectors — the pluggable-provider roadmap

Ralphy ships three bundled connectors — OpenRouter (text / image / video), ElevenLabs (voice / music / sfx), and fal (video). They are good defaults, but a serious content farm needs cost and privacy escape hatches: route high-volume work to a local or self-hosted endpoint while keeping the premium APIs for the steps where quality matters. This doc describes the connector system and the implementation sequence promoted from `notes/ideas/005-pluggable-provider-spec.md` (issue #487).

## Invariant #1 (read first)

Only **registered** provider connectors may hold keys or hit provider hosts — no ad-hoc curl. The OpenAI-compatible connector described below **is** a registered connector, so it is allowed to hold a key and hit a host, but only the ones the user configured:

- The host is **only** the user-configured `baseUrl`. No hardcoded `openai.com` / `fal` host.
- The key is read **dynamically** via `process.env[entry.envVar]` — never a literal banned env var name. The config loader rejects a banned `envVar` before the connector is ever built.

`Vercel` and `OpenAI-direct` stay banned everywhere; `FAL_KEY` stays sanctioned only inside `cli/lib/providers/fal.ts`. The custom connector path does not change any of that.

## Custom providers — config

Declare custom providers in `.ralphy/config.json` under a `providers` array:

```json
{
  "providers": [
    {
      "id": "local-llama",
      "label": "Local Llama (Ollama)",
      "kind": "openai-compatible",
      "baseUrl": "http://localhost:11434/v1",
      "capabilities": ["text"]
    },
    {
      "id": "gpu-cluster",
      "kind": "openai-compatible",
      "baseUrl": "https://llm.internal.example.com/v1",
      "envVar": "RALPHY_LOCAL_API_KEY",
      "capabilities": ["text"]
    }
  ]
}
```

Each entry is validated by `cli/lib/providers/config.ts` (`loadProviderConfigs`):

- `id` — kebab-case (`/^[a-z][a-z0-9-]*$/`), not colliding with a bundled id (`openrouter` / `elevenlabs` / `fal`).
- `kind` — must be `"openai-compatible"` (the only kind this slice ships).
- `baseUrl` — a valid `http(s)` URL. Local / self-hosted Ollama, vLLM, and LiteLLM all expose an OpenAI-shaped `/v1/chat/completions`.
- `envVar` — **optional**. Omit it for a keyless local endpoint. When set, it must **not** be a banned channel (`OPENAI_API_KEY`, `VERCEL_API_KEY`, `VERCEL_KEY`) or a bundled connector's env var (`OPENROUTER_API_KEY`, `ELEVENLABS_API_KEY`, `FAL_KEY`). Default a key var to a non-banned name such as `RALPHY_LOCAL_API_KEY`.
- `capabilities` — a non-empty subset of `text | image | video | voice | music | sfx | transcribe`.

An invalid entry is rejected with a reason (surfaced by `ralphy provider test`); valid entries are loaded. `secretEnvAllowlist(entries)` returns the exact union of declared (safe) env vars — the secret allowlist is the only set of env vars a custom connector can read.

## Prefixed model ids

A model id may carry a `<provider>:<model>` prefix to route to a specific connector:

```bash
ralphy generate image --model openrouter:google/gemini-3-pro-image-preview
# routes to the `openrouter` connector, sends `google/gemini-3-pro-image-preview`
```

`parseModelId(id)` (in `cli/lib/providers/registry.ts`) treats `id` as prefixed **only** when the substring before the first `:` is a **registered** connector id. So bare ids that contain `/` (e.g. `google/gemini-3-pro-image-preview`) are untouched — full backwards compatibility. When prefixed, resolution targets that provider and the bare model (prefix stripped) is sent to the API.

## Judge / gate model selection

Gate and judge code (callLLM-based scoring) can pick a judge model + provider **independently** from the generation provider. Add a `judge` key to `.ralphy/config.json`:

```json
{ "judge": { "provider": "local-llama", "model": "llama-3.1-70b" } }
```

`resolveJudgeModel()` returns `{ provider?, model? }` ready to spread into `callLLM(...)`. A `<provider>:<model>` prefix on the configured model is honored. Both fields may be undefined, in which case `callLLM` falls back to the default text provider. This is the seam — individual gates opt in by spreading `resolveJudgeModel()` into their `callLLM` calls; they are not refactored wholesale.

## CLI surfaces

- `ralphy provider list [--capability <cap>]` — the capability matrix, custom providers included.
- `ralphy provider test [<id>] [--ping]` — per-connector availability + config validity. **Offline by default** (availability / config only). `--ping` (future) would probe the endpoint over the network.

## What landed in this slice (#487)

- Config loading of custom `providers[]` with an explicit env-var allowlist for secrets.
- A generic OpenAI-compatible connector for local / self-hosted **text** endpoints.
- Provider-prefixed model ids (`<provider>:<model>`) with bare-id backwards compatibility.
- `provider test` (offline) + `provider list --capability` filter.
- Judge / gate model independence (`resolveJudgeModel()` + the `judge` config key).

## Deferred

- Local **image / video** generation via the OpenAI-compatible connector or a ComfyUI connector (the factory implements `callLLM` only this slice; a declared image/video capability resolves but the generate method is a no-op until wired).
- `--ping` network probe in `provider test`.
- Provider auto-discovery (scanning common local ports for a live OpenAI-compatible server).
- npm-distributed third-party connectors (the original `notes/ideas/005` dynamic-import idea).
