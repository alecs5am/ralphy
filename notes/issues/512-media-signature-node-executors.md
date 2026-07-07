# Media node executors typed by I/O signature

> **Status:** todo
> **Filed:** 2026-07-06
> **Folder:** issues
> **Severity:** high
> **Category:** orchestration / media / providers

## Context

The design (`docs/architecture/farm-node-graph.md`, node category B) types
media nodes by I/O signature — t2i, i2i, t2v, i2v, r2v, v2v, lipsync, tts,
voice-design, music, sfx, transcribe, plus deterministic post-ops (upscale,
remove-bg, reframe, crunch). #498 put them in the schema; none has an
executor. #511's `ralphy-generate` covers the generic case, but signatures
carry semantics the generic node can't express or validate: i2v requires a
`first_frame` port, r2v requires `refs[]` with role labels, lipsync requires
an audio + image pair.

## What

Implement the media-signature executors as thin typed fronts over the same
generation lib `ralphy generate` uses (one shared call path — invariant #2),
each enforcing its signature at the port level and validating its
(model, provider, params) binding against the #497 coverage matrix at graph
lint time AND at execution time.

## Why it matters

Signature typing is what makes a graph author (agent or human) unable to wire
an i2v node without an anchor frame or an r2v node on a provider that only
exposes 40% of the model — the mis-wiring fails at `workflow lint`, not after
a paid call.

## Scope / acceptance

- `cli/lib/workflow/executors/media.ts`: executors for t2i, i2i, t2v, i2v,
  r2v, v2v, lipsync, tts, music, sfx, transcribe; post-ops (remove-bg,
  reframe, crunch) wired to their existing lib implementations.
- Port contracts per signature (e.g. i2v: `first_frame: image` required,
  `last_frame: image` optional; r2v: `refs: image[]|video[]` with role
  params; lipsync: `audio` + `image`) — enforced in schema validation (#498
  extension) so `workflow lint` catches violations.
- Coverage-matrix enforcement: unsupported param for the bound provider =
  lint error naming the provider that supports it (hard-fail at import per
  #498's semantics).
- Spend gate + auto-version + gen-log identical to #511's generate path.
- `voice-design` intentionally excluded (training-path-only, needs human ears
  — document why in the executor file header).
- Tests: per-signature port validation (missing anchor, wrong ref type),
  coverage violation, mocked-provider execution, post-op determinism.

## Notes

- Sequence after #511 (shares its generate plumbing) and consumes #497.
- MODELS.md discipline holds: executors read model defaults from the same
  source the CLI does, no hardcoded model ids in executor code.
