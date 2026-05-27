# src architecture pass — restructure for maintainer readability

> **Status:** idea
> **Filed:** 2026-05-27
> **Folder:** ideas

## Context

Raised by the owner after the pluggable-provider refactor (2026-05-27): the
`cli/` source is hard to read for maintainers — unstructured, with large
multi-concern modules and unclear boundaries. The provider refactor
([[005-pluggable-provider-spec]]) was a worked example: `media.ts` had grown to a
~960-line monolith mixing OpenRouter image/video, ElevenLabs voice/music/sfx, and
shared file/log plumbing, all behind hardcoded `requireCapability("...")` calls.
Splitting it into `types.ts` / `shared.ts` / `openrouter.ts` / `elevenlabs.ts` /
`registry.ts` made it legible. The same treatment is owed elsewhere.

Distinct from `notes/audit-2026-05/audit.md`, which is a strategic/positioning
audit (license, README, distribution, packaging) — this is purely about
**internal code structure and maintainer ergonomics**.

## What

A deliberate architecture pass over `cli/`:
- Find the other god-modules (candidates: large files under `cli/lib/`,
  `cli/commands/generate.ts` at ~800 lines) and split by concern the way the
  provider layer was split.
- Establish and document the layering contract (commands → lib services →
  providers → shared plumbing) so new code has an obvious home.
- A short `cli/ARCHITECTURE.md` (or a `docs/` page) mapping the directory tree to
  responsibilities, for onboarding maintainers.

## Why it matters

- Maintainer onboarding cost is the bottleneck once contributors arrive (the
  audit's whole thesis is "get to contributors"). Unreadable src caps that.
- Each god-module is a latent merge-conflict and bug surface.

## Notes

- Use `scc` / `tokei` to rank modules by size + complexity as the starting map.
- This is the natural moment to promote the remaining
  [[005-pluggable-provider-spec]] scope into a real `roadmap/` category — pair the
  two so the connector spec lands inside a cleaned-up provider layer.
- Likely too big for one note → promote to a `roadmap/` task set once scoped.
