# 415 - Introduce council reviews for plans and polished Units

Status: active

## Problem

Single-agent judgment is brittle for creative production. One agent can miss market fit, another can over-focus on visuals, another can ship with weak captions or bad pacing. Ralphy needs a structured council mechanism that brings multiple specialist perspectives into the pipeline without turning every production into an unbounded debate.

The council should improve decisions at two expensive points: before paid generation starts, and after native-video evaluation finds concrete issues.

## Scope

- Define council roles:
  - strategist: audience, offer, channel, and format fit;
  - niche researcher: trend, competitor, and benchmark fit;
  - creative director: concept, hook, memorability, and taste;
  - art director: visual system, references, product fidelity, and prompt quality;
  - editor: pacing, scene order, captions, audio, and final cut;
  - performance marketer: thumb-stop, proof, CTA, and variant logic;
  - QA evaluator: objective gates, failure modes, and release verdict.
- Add two council moments:
  - preflight council on the production plan before paid generation;
  - polish council after native-video evaluation and before Unit formation.
- Define a structured output:
  - verdict;
  - role scores;
  - blocking issues;
  - non-blocking improvements;
  - disagreements;
  - prioritized repair actions;
  - final ship/block recommendation.
- Keep council calls bounded:
  - no paid media generation inside council;
  - no arbitrary browsing unless the research stage explicitly requested it;
  - all LLM calls through `callLLM()`;
  - deterministic fixture mode for tests.
- Integrate council output with the production plan and repair loop.

## Acceptance

- Agents can run a council review from a production plan and receive a structured preflight verdict.
- Agents can run a council review from a native-video eval report and receive a prioritized repair plan.
- Council output is persisted in the project and referenced by later stages.
- The repair loop can consume council priorities without free-form parsing.
- Tests cover at least one preflight council and one polish council fixture.

## Links

- Related: #407 brief-to-production-plan.
- Related: #409 eval-to-repair loop.
- Related: #410 chat-native content farm mode.
- Related: #414 Unit production pipeline.
