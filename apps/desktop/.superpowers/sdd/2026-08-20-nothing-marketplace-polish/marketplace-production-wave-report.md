# Marketplace production wave report

- Base: `32e93891aac05f97637699d35b58c7e3290e652d`
- Head: `f2523313a0b442744dfab3d437d95388ede909b5`
- Branch: `codex/nothing-marketplace-wave`

## Delivered

- Rebuilt the entire reachable Marketplace presentation as flat light/dark Instrument surfaces: Discover, category cards, results, source/cache/failure states, Models, installed Ollama inventory, Template/Recipe detail, unavailable Prompt/Component/Skill surfaces, My Library, collection, downloads, updates, and review workflows.
- Preserved the existing controller, query, route history, paging, virtualized result navigation, controlled remote-media rules, clipboard bounds, provider URL security, and truthful availability contracts.
- Moved every target/review workflow from its private Radix dialog to `InstrumentOverlay` owner `target-chooser`, including Escape, focus trap, opener restoration, semantic unavailable actions, and a single local workflow scroller.
- Target IDs now use the collision-safe form `project:<workspaceId>:<projectId>`; visible labels expose names only.
- Exported `MARKETPLACE_SCENARIOS` and `MARKETPLACE_SCENARIO_IDS` from the canonical scenario registry for integration evidence runners.
- Added `audit:instrument:marketplace`, which rejects raw colors, shadows, blur, gradients, legacy tokens, raw dialog/portal ownership, missing Instrument root/overlay ownership, and missing reduced-motion coverage.

## Shared files changed for merge

- `package.json`: added `audit:instrument:marketplace` only.
- `src/instrument/scenarios.ts`: added two derived Marketplace exports; canonical scenario contents/fingerprint are unchanged.
- `tests/design-system.test.ts`: updated the Marketplace focus-token assertion from the legacy alias to the Instrument palette token.
- No Work-surface production component or CSS was changed.

## Verification

- `bun run audit:instrument:marketplace` → `MARKETPLACE_INSTRUMENT_AUDIT_OK 10`
- Marketplace/controller/navigation/model/public-detail/unavailable/library/workflow/guard/state/scenario suite → 119 passed.
- `tests/marketplace-geometry.test.tsx` → 2 passed. It used one hidden Electron process with `show: false`; the process exited and no worktree Electron process remained.
- `bun run typecheck` → passed.
- `bun run build` → passed; existing Vite chunk-size warning only.
- `gitleaks protect --staged --redact` → no leaks.
- `git diff --check` → passed.

## Intentionally deferred

- Plan Tasks 8–14 (package/evidence/fidelity/final orchestration) remain for the integration branch as requested.
- Global legacy file deletion/source reachability is not attempted in this isolated wave because the parallel Work wave still owns those shared imports. The Marketplace-specific guard is green and ready to be composed into the global integration audit.
- The already-running release Core bridge outside this worktree was not started or stopped by this wave.
