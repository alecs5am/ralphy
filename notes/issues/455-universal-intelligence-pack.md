# Universal intelligence pack

> **Status:** issue
> **Filed:** 2026-06-15
> **Folder:** issues
> **Severity:** high
> **Category:** research / references / planning

## Context

Strong production starts with context: product, brand, audience, competitors,
references, platform conventions, benchmarks, and claims. Recent postmortems
show the same failure mode repeatedly: weak or late references cause wasted
generations and user corrections.

Existing issues cover pieces: #416 research bootstrap, #426 reference pack,
#419 benchmarks, #422 product fidelity, and #449 ref-pack lint. This issue
defines the unified intelligence layer that connects them.

## What

Create an intelligence pack that every non-trivial project can build before
generation. It should combine research facts, reference pack, benchmark set,
claim constraints, platform requirements, and style implications into one
typed artifact consumed by planning, generation, eval, and repair.

## Why it matters

Reference quality is the floor of output quality. A low-tech user should not
need to know which refs are required; the agent should discover, request,
normalize, and lock them before large spend.

## Scope / acceptance

1. **Artifact schema.** Define `INTELLIGENCE_PACK.json` plus a readable Markdown
   report with sections for brand, product, audience, competitors, benchmarks,
   refs, claims, platform constraints, and open risks.
2. **Source provenance.** Every fact or ref must carry source/provenance and
   confidence. User-provided facts and crawled facts are distinguishable.
3. **Required-ref matrix.** Content modes can declare required intelligence
   fields. Missing requirements block or downgrade the production plan.
4. **Ref pack integration.** Intelligence pack must point to typed refs from
   #426 and include contact-sheet/lint output from #449 when available.
5. **Planning integration.** Production plan and mode compiler read the pack
   instead of re-parsing scattered research files.
6. **Eval integration.** Product fidelity, claims, platform, and readiness gates
   reference the same pack.
7. **Fixtures.** Add fixtures for brand URL, product URL, generic niche, source
   video, and open-world unknown content.

## Dependencies and linked work

- Research bootstrap: #416.
- Golden benchmarks: #419.
- Product fidelity: #422.
- Reference pack: #426.
- Ref-pack contact sheet/lint: #449.
- Claims/platform gates: #442, #443.

## Notes

- Default policy: no large paid generation until required intelligence exists or
  the user explicitly approves a bypass with a reason.
