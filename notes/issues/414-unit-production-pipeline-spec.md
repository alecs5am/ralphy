# 414 - Specify the ideal Unit production pipeline

Status: active

## Problem

Ralphy has the raw ingredients for producing Units: intake, research, scenarios, generation, HyperFrames rendering, evaluation, postmortems, templates, and unit packaging. The missing piece is a single opinionated lifecycle that tells an agent exactly how to move from a vague chat request to a polished, reusable Unit.

Without that lifecycle, quality depends too much on the agent's taste and memory. The same user prompt can produce a weak one-off render, a strong reusable Unit, or an unfinished pile of assets depending on which agent handled it.

## Scope

- Define the canonical Unit lifecycle:
  - chat request;
  - content mode selection;
  - product/brand/niche intake;
  - research depth decision;
  - benchmark and style grounding;
  - production plan;
  - council preflight;
  - scenario and shot list;
  - asset generation;
  - composition/render;
  - native-video validation;
  - repair loop;
  - council polish review;
  - Unit formation;
  - publish/package decision;
  - postmortem and memory capture.
- Define required artifacts per stage:
  - `research/report.md`;
  - `sources.json`;
  - `STYLE_LOCK.md` or equivalent structured style lock;
  - production plan JSON/Markdown;
  - storyboard/script;
  - prompts and manifests;
  - render outputs;
  - native eval report;
  - repair plan;
  - `unit.json`;
  - postmortem/memory entries.
- Define stop conditions:
  - missing required references for named real entities;
  - failed quality gates after retry budget;
  - mode unsupported;
  - cost/time estimate exceeds target;
  - user approval needed before paid generation.
- Define when to use cheap checks versus full native-video validation.
- Update producer, templater, evaluator, and unit docs to share the same lifecycle vocabulary.
- Add a machine-readable status model so agents can resume a Unit pipeline without guessing the current phase.

## Acceptance

- There is one canonical document or schema that describes the Unit lifecycle end to end.
- Agents can inspect a project and determine the next Unit-production step.
- A Unit cannot be considered polished unless it has passed the native-video final gate or an explicit user-approved bypass.
- The lifecycle integrates with content modes from #412 and repair loop work from #409.
- Tests or fixtures cover at least one complete pipeline state transition path.

## Links

- Related: #406 agent production contract.
- Related: #407 brief-to-production-plan.
- Related: #408 style and benchmark grounding.
- Related: #409 eval-to-repair loop.
- Related: #410 chat-native content farm mode.
- Related: #411 native video validation.
