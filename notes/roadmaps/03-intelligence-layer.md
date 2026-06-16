# Research intelligence and reference layer roadmap

> **Status:** roadmap source
> **Filed:** 2026-06-16
> **Folder:** roadmaps
> **Related issues:** #416, #419, #422, #426, #449, #455

## Purpose

Build the context layer that lets agents produce grounded media instead of
generic output. The intelligence pack should be the shared source for planning,
prompting, eval, repair, and distribution.

## Target capabilities

- Typed intelligence pack for every non-trivial project.
- Source provenance for facts and references.
- Required-reference matrix by mode.
- Competitor and benchmark discovery.
- Product and brand fidelity anchors.
- Claims and platform constraints.
- Ref pack linting and contact sheets.

## Intelligence pack shape

The pack should include:

- Project brief and assumptions.
- Product, brand, or entity facts.
- Audience and use case.
- Competitors and market patterns.
- Trend and niche observations.
- Reference assets and their roles.
- Visual style implications.
- Claims, restrictions, and proof requirements.
- Platform specs and safe areas.
- Benchmark examples.
- Open risks and missing inputs.

Every item should carry provenance and confidence. User-provided facts, crawled
facts, model-inferred facts, and agent assumptions must be distinguishable.

## Workstreams

### Product and brand intake

Issue families:

- Product URL extraction.
- Brand URL extraction.
- Uploaded product image analysis.
- Required brand asset detection.
- Logo and typography handling.
- Claim extraction and proof flags.
- Contradiction detection across sources.

### Reference packs

Issue families:

- Reference asset roles.
- Contact sheet generation.
- Ref lint rules.
- Missing-reference gate.
- Workspace shared ref reuse.
- Source video frame packs.
- Reference dedupe and quality ranking.

### Market and trend research

Issue families:

- Competitor discovery.
- Social format mining.
- Ad library research.
- Creator DNA extraction.
- Trend velocity scoring.
- Benchmark pack generation.
- Research depth selection by budget and mode.

### Pack consumption

Issue families:

- Production plan reads intelligence pack.
- Prompt compiler reads intelligence pack.
- Eval gates read intelligence pack.
- Repair plan cites intelligence pack facts.
- Distribution copy uses approved claims.
- Desktop renders pack summary.

## Acceptance ladder

1. Intelligence pack schema exists.
2. Product URL and brand URL fixtures populate the pack.
3. Ref pack lint and contact sheet are attached.
4. Mode contracts can require pack fields.
5. Plans and evals consume the same pack.
6. Missing required intelligence blocks large spend or logs explicit bypass.

## Example issues to file later

- Add `INTELLIGENCE_PACK.json` schema and Markdown report.
- Add provenance confidence fields for research facts.
- Add required-intelligence declarations to mode contracts.
- Add competitor benchmark discovery for ad creative packs.
- Add ref pack lint findings to readiness reports.
