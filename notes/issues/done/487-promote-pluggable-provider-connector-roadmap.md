# Promote pluggable provider connector roadmap

> **Status:** done — 2026-06-24
> **Filed:** 2026-06-24
> **Folder:** issues
> **Severity:** high
> **Category:** providers / connectors / local-farm

## Context

Deep research on local content farms reinforces the pending provider-connector idea: a serious farm should be able to route high-volume work to local or self-hosted systems while keeping premium APIs for the steps where quality matters. The old `notes/ideas/005-pluggable-provider-spec.md` captured the design and the in-tree connector slice already landed, but the remaining work is now concrete enough for the active backlog.

## What

Promote the remaining pluggable-provider scope into an executable connector roadmap: config loading, dynamic connectors, provider-prefixed model routing, provider health/test commands, and a safe OpenAI-compatible local connector path for Ollama/vLLM/LiteLLM-style endpoints.

## Why it matters

OpenRouter and ElevenLabs remain good defaults, but a local content farm needs cost and privacy escape hatches. Users should not fork Ralphy to use ComfyUI, local LLMs, local TTS, or a private GPU cluster through a registered connector.

## Scope / acceptance

- Split the remaining provider idea into a concrete roadmap or implementation sequence.
- Add TOML or equivalent provider config loading with an explicit env-var allowlist for secrets.
- Add support for provider-prefixed model ids, such as `<provider>:<model>`, while preserving a transition path for existing bare model ids.
- Add a generic OpenAI-compatible connector path for local/self-hosted text and vision endpoints.
- Add CLI surfaces for provider test/refresh and model listing by provider/capability, or update existing `provider`/`models` commands to cover them.
- Define how judge/gate models are selected independently from generation providers.
- Add tests for config parsing, secret allowlisting, connector health, prefixed model routing, and backwards compatibility.

## Notes

- Promoted from `notes/ideas/005-pluggable-provider-spec.md`; git history preserves the full design note.
- Keep AGENTS.md invariant #1 intact: only registered connectors may hit provider hosts or read provider keys.
- Do not add ad-hoc ComfyUI, Fal, Replicate, or Ollama calls outside the connector system.
