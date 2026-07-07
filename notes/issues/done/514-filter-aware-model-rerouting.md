# Filter-aware model/provider rerouting rules

> **Status:** done — 2026-07-07
> **Filed:** 2026-07-06
> **Folder:** issues
> **Severity:** high
> **Category:** providers / reliability / craft-as-data

## Context

Months of production surfaced hard routing rules that today live only in agent
memory and MODELS.md prose: seedance's privacy filter blocks photoreal-human
i2v anchors (route kling), veo blocks body-horror prompts AND input frames,
seedance output-copyright-fails on known-anime-lookalike anchors (route kling),
gemini image returns IMAGE_SAFETY where gpt-image succeeds, ElevenLabs Music
rejects artist names but returns a ready `prompt_suggestion`. A headless farm
has no agent in the loop to apply these — a filter rejection is currently just
a failed node.

## What

A declarative rerouting-rules table consulted by media node executors
(#511/#512) on provider content-filter/safety errors: match on (model,
capability, error class, optionally a content trait tag) -> action
(`reroute:<model>` | `resubmit-with:<transform>` | `park-for-human`), bounded
to one reroute hop per node execution. Rules ship as data
(`cli/lib/providers/reroute-rules.ts` or JSON) seeded from the known set, and
the workspace can extend them in its bundle.

## Why it matters

These rules are the distilled cost of every burned generation that hit a
filter. Encoding them turns the farm's worst headless failure mode (a branch
dying at 2am on a filter the agent would have dodged) into a self-healing
reroute — and it's a moat competitors without the production history can't
copy from docs.

## Scope / acceptance

- Error classification: map provider error payloads to a small taxonomy
  (`safety-input`, `safety-output`, `copyright`, `tos-content`, `transient`)
  — extend #450's taxonomy, don't fork it.
- Rules schema + seed rules for the documented cases (seedance/kling/veo/
  gemini/gpt-image/ElevenLabs-music); each rule cites its origin (memory slug
  or postmortem) in a `source` field.
- Executor integration: on classified failure, apply the first matching rule;
  journal a `node-rerouted` event (from, to, rule id); a second filter
  failure after reroute = normal `on_fail`.
- The ElevenLabs `prompt_suggestion` resubmit path implemented as a
  `resubmit-with` transform.
- `park-for-human` routes into the approval inbox with the rule's explanation.
- Reroutes respect the #497 coverage matrix (never reroute onto a provider
  that can't express the node's params — park instead).
- Tests: classification fixtures per provider payload, one-hop bound,
  coverage-respecting reroute, park path, journal events.

## Notes

- Sequence after #512.
- Rule extension via bundle: coordinate schema with #502's manifest
  (workspace-level rules merge over the built-in set, never replace it).
