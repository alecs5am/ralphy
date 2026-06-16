# Creative strategy, prompts, and model orchestration roadmap

> **Status:** roadmap source
> **Filed:** 2026-06-16
> **Folder:** roadmaps
> **Related issues:** #421, #424, #430, #432, #445, #456

## Purpose

Turn generation from "ask a model for media" into a controlled creative system:
strategy, hypotheses, prompts, model routing, provider constraints, variants,
telemetry, and learnings.

## Target capabilities

- Creative strategy artifact before generation.
- Variant matrix tied to hypotheses.
- Prompt compiler with mode, model, reference, and platform context.
- Model router that understands capability, cost, speed, and failure history.
- Provider constraint preflight.
- Generation telemetry that feeds future model choices.

## Workstreams

### Creative strategy

Every serious project should define:

- Audience segment.
- Offer or message.
- Core objection.
- Angle.
- Hook.
- Proof.
- CTA.
- Tone.
- Variant axes.
- Platform fit.
- Success criteria.

Issue families:

- Strategy schema.
- Strategy grader.
- Council preflight integration.
- Strategy-to-variant matrix.
- Strategy update after tournament.
- Desktop strategy review.

### Prompt compiler

Prompts should be compiled from structured inputs rather than free-form chat:
mode contract, intelligence pack, creative strategy, references, model adapter,
negative constraints, aspect ratio, language, and quality gate expectations.

Issue families:

- Prompt slot schema.
- Prompt adapter coverage.
- Reference-aware prompt rendering.
- Model-specific constraint warnings.
- Prompt diff reports.
- Prompt regression fixtures.
- Prompt library promotion path.

### Model router and provider orchestration

The router should choose the cheapest reliable model that can satisfy the job,
then fall back safely when providers fail or constraints mismatch.

Issue families:

- Capability matrix.
- Cost and latency estimates.
- Provider health signals.
- Retry and fallback policies.
- Model failure memory.
- Per-mode model preferences.
- Preflight checks for unsupported inputs.

### Variants and tournaments

Variants should be intentional experiments, not random rerolls.

Issue families:

- Variant matrix execution.
- Winner scoring.
- Losing-rationale capture.
- Budget-aware tournament sizing.
- Style drift detection.
- Champion promotion to template or benchmark.

## Acceptance ladder

1. Strategy artifact exists and is reviewable.
2. Prompt compiler uses mode and intelligence pack context.
3. Model router blocks known impossible or bad-fit jobs before spend.
4. Variant tournaments produce champion and losing rationales.
5. Model telemetry changes future routing decisions.
6. Prompt and model changes have fixture coverage.

## Example issues to file later

- Add `CREATIVE_STRATEGY.json` schema.
- Add prompt compiler inputs for intelligence pack and mode contract.
- Add model constraint preflight to generation planning.
- Add strategy grader fixtures for low-tech briefs.
- Add variant tournament result feedback into strategy.
