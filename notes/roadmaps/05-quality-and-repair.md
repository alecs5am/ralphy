# Quality, eval, council, and repair roadmap

> **Status:** roadmap source
> **Filed:** 2026-06-16
> **Folder:** roadmaps
> **Related issues:** #409, #411, #415, #425, #427, #439, #440, #441, #442, #443, #457

## Purpose

Make polished output the default. Quality should not depend on an agent manually
watching a render or asking a generic vision model to describe screenshots. The
system needs native media analysis, artifact-specific gates, bounded critique,
repair planning, and learning loops.

## Target capabilities

- Video-native evaluation for temporal quality.
- Artifact-specific gates for images, carousels, audio, captions, and packages.
- Council review before expensive generation and before final polish.
- Single readiness verdict.
- Deterministic repair plan vocabulary.
- Repeated-failure routing into durable lessons.

## Workstreams

### Native media evaluation

Video eval should inspect temporal behavior, not only isolated frames.

Issue families:

- Scene segmentation.
- Product presence over time.
- Temporal consistency.
- Motion artifact detection.
- Caption and audio sync.
- Dead-air and pacing checks.
- Shot intent matching.
- Gemini-style video model integration through approved providers.

### Artifact-specific gates

Different Unit types need different quality checks.

Issue families:

- OCR and text legibility.
- First-frame hook scoring.
- Caption readability and safe area.
- Product and brand fidelity.
- Claims and policy validation.
- Platform export validation.
- Carousel slide coherence.
- Audio loudness and silence.

### Council system

Council should be bounded and useful. It should not become an endless committee.

Issue families:

- Role rubric definitions.
- Preflight council on production plan.
- Polish council on eval report.
- Disagreement summarization.
- Verdict normalization.
- Cost-free council guarantee.
- Council actions to repair vocabulary.

### Repair loop

Repair should turn findings into targeted actions with owners, costs, and user
approval.

Issue families:

- Finding merge.
- Owner classification.
- Repair cost estimates.
- User approval gate.
- Targeted asset regeneration.
- Scenario rewrite and editor recut paths.
- Before/after eval comparison.

### Learning from failures

Repeated failures should update the right surface: memory, guideline, model
warning, mode rule, issue, or dropped lesson.

Issue families:

- Failure clustering.
- Negative-scope rule generation.
- Maintainer review.
- MODELS.md update proposals.
- Guideline update proposals.
- Regression fixture creation.

## Acceptance ladder

1. Quality gate registry exists.
2. One command returns a single readiness verdict.
3. Video-native eval is available for rendered mp4s.
4. Repair plans are derived from normalized findings.
5. Repaired outputs are compared against previous evals.
6. Repeated failures become reviewed knowledge or executable issues.

## Example issues to file later

- Add gate registry by mode and artifact kind.
- Add video-native eval report shape with temporal findings.
- Merge council actions into repair plan inputs.
- Add readiness fixtures for pass, repair, and blocked Units.
- Add failure lesson router output to postmortem.
