# Content modes and open-world compiler roadmap

> **Status:** roadmap source
> **Filed:** 2026-06-16
> **Folder:** roadmaps
> **Related issues:** #412, #413, #418, #454, #430, #446

## Purpose

Make content mode selection a production intelligence layer, not a keyword
lookup. Ralphy should handle known modes with rich guidance and unknown modes
with disciplined discovery.

## Target capabilities

- Deterministic classification into known, ambiguous, or unknown mode status.
- Mode contracts that declare required inputs, research depth, artifacts,
  quality gates, model guidance, and expected Unit shape.
- Provisional mode profiles for unknown content.
- Promotion path from provisional mode to supported mode or template.
- Fixtures that prove mode routing does not regress.

## Known mode expansion

The first supported mode library should cover high-value production work:

- Product shot.
- Lifestyle scene.
- Closeup product with person.
- Pinterest pin.
- Hero banner.
- Social carousel.
- Ad creative pack.
- UGC review.
- Tutorial UGC.
- Unboxing UGC.
- TV ad.
- Cartoon animation.
- Motion design.
- Product animation.
- Infographic animation.
- Typography animation.
- Podcast video.
- AI influencer.
- Personal clipper.
- Amazon listing.
- Restyle.
- Conceptual product.

Each mode should eventually have:

- Intent definition.
- Required and optional inputs.
- Reference policy.
- Research policy.
- Scenario shape.
- Prompt slots.
- Model stack guidance.
- Eval gates.
- Repair vocabulary.
- Distribution outputs.
- Benchmark examples.

## Open-world mode path

Unknown content is not failure. It is a different route:

1. Detect unknown or low-confidence mode.
2. Choose closest media format without overclaiming support.
3. Research the niche or ask for references.
4. Produce `provisional-mode.json`.
5. Ask for user approval before paid generation.
6. Run stricter checkpoints.
7. After completion, propose one of:
   - keep as provisional;
   - map to existing mode;
   - create a new supported mode;
   - extract a template only.

## Workstreams

### Mode registry and contracts

Issue families:

- Mode schema.
- Mode capability flags.
- Required-input declaration.
- Mode-to-Unit mapping.
- Mode-to-eval mapping.
- Mode-to-distribution mapping.
- Contract validation tests.

### Classifier and ambiguity handling

Issue families:

- Known/ambiguous/unknown output shape.
- Confidence reasons.
- Single-question disambiguation.
- Low-tech prompt fixtures.
- Negative examples where generic terms should not overroute.

### Mode playbooks

Issue families:

- Product commerce modes.
- UGC modes.
- Motion design modes.
- Still image and carousel modes.
- Long-form and clipping modes.
- Listing and marketplace modes.
- Restyle and adaptation modes.

### Provisional mode promotion

Issue families:

- Provisional profile artifact.
- Project postmortem to mode proposal.
- Benchmark extraction from successful provisional runs.
- Maintainer review flow.
- Library integration.

## Acceptance ladder

1. Mode registry describes all first-class modes.
2. Classifier returns known/ambiguous/unknown with reasons.
3. Five unknown prompts produce useful provisional profiles.
4. Ten known modes have mode contracts and fixtures.
5. Twenty modes have benchmarks, eval gates, and distribution mappings.
6. A provisional mode can be promoted into a reusable template or supported
   mode proposal.

## Example issues to file later

- Add `provisional-mode.json` schema and writer.
- Add mode contract coverage for `ad-creative-pack`.
- Add ambiguity fixtures for briefs that mention multiple content modes.
- Add promotion proposal generation after successful unknown-mode projects.
- Add mode-specific required-intelligence validation.
