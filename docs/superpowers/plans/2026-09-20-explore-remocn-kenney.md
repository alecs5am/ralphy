# Explore Remocn and Kenney Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a local Remocn-derived Visuals library, full-bleed Explore cards, and pack-first Kenney Sounds browsing.

**Architecture:** Remocn is copied at development time into small generated catalog packs containing only metadata, source, and local previews. Kenney audio is copied into local pack directories with a generated manifest. Existing Explore projections consume both through `StudioEntry`; no remote runtime integration is added.

**Tech Stack:** React, TypeScript, Vite, Vitest, local static assets, HyperFrames handoff instructions.

**Spec:** `docs/superpowers/specs/2026-09-20-explore-remocn-kenney-design.md`

## Global Constraints

- Preserve unrelated dirty-worktree changes.
- Use Bun and existing dependencies only.
- Remocn source remains MIT-attributed and is reference input for HyperFrames conversion, not executable Remotion runtime code.
- Kenney audio remains labeled `Kenney · CC0` with pack identity.
- Generated source files stay below the repository's 400-line limit.

---

### Task 1: Remocn catalog packs

**Files:**
- Create: `apps/desktop/src/pages/marketplace/lib/studio-catalog-remocn-*.ts`
- Create: `apps/desktop/public/explore/remocn/**`
- Modify: `apps/desktop/src/pages/marketplace/lib/studio-catalog.ts`
- Test: `apps/desktop/tests/marketplace-remocn-catalog.test.ts`

**Interfaces:**
- Produces: `studioRemocnVisuals(): StudioEntry[]` assembled from category-sized files.
- Each entry includes local preview, upstream reference, `mediaCredit: "Remocn · MIT"`, copied source in `artifact`, and HyperFrames conversion instructions in `body`.

- [ ] Write a failing test asserting unique Remocn entries, local preview assets, MIT attribution, upstream references, copied source, and HyperFrames instructions.
- [ ] Run `bun run --cwd apps/desktop test -- marketplace-remocn-catalog.test.ts`; expect missing catalog failures.
- [ ] Implement category-sized catalog files and local assets without adding Remotion to the desktop runtime.
- [ ] Integrate `studioRemocnVisuals()` into Visuals.
- [ ] Re-run the targeted test; expect pass.

### Task 2: Full-bleed Explore cards

**Files:**
- Modify: `apps/desktop/src/pages/marketplace/ui/MarketplaceCreativeResults.tsx`
- Modify: `apps/desktop/src/app/styles/theme/marketplace.css`
- Test: `apps/desktop/tests/marketplace-preview.test.tsx`

**Interfaces:**
- Produces: Explore creative cards whose media touches the Window edge while title and summary keep their spacing.

- [ ] Add a failing source/render assertion for a full-bleed creative card with independently padded copy.
- [ ] Run the targeted test and confirm it fails on the existing Window inset.
- [ ] Add the smallest Explore-only class/prop and CSS override.
- [ ] Re-run the targeted test; expect pass.

### Task 3: Kenney audio packs

**Files:**
- Create: `apps/desktop/public/explore/kenney/**`
- Create: `apps/desktop/src/pages/marketplace/lib/studio-catalog-kenney.ts`
- Modify: `apps/desktop/src/pages/marketplace/lib/studio-catalog.ts`
- Modify: `apps/desktop/src/pages/marketplace/lib/presentation-types.ts`
- Test: `apps/desktop/tests/marketplace-kenney-catalog.test.ts`

**Interfaces:**
- Produces: `studioKenneySounds(): StudioEntry[]` with `pack: { id: string; name: string; publisher: "Kenney" }` metadata and local playable previews.

- [ ] Write a failing test asserting all ten official pack names, CC0 labeling, unique track IDs, local browser-playable assets, and pack metadata.
- [ ] Run the targeted test and confirm the catalog is missing.
- [ ] Download official pack archives, retain the compact browser-playable copy of each track, and record source/license metadata.
- [ ] Implement and integrate `studioKenneySounds()`.
- [ ] Re-run the targeted test; expect pass.

### Task 4: Pack-first Sounds navigation

**Files:**
- Modify: `apps/desktop/src/pages/marketplace/ui/MarketplaceSounds.tsx`
- Modify: `apps/desktop/src/app/styles/theme/marketplace.css`
- Test: `apps/desktop/tests/marketplace-sounds.test.tsx`

**Interfaces:**
- Consumes: `item.studio.pack` from Task 3.
- Produces: pack shelf → selected pack tracks → all packs navigation while preserving the existing single audio player.

- [ ] Add a failing UI test that opens a pack, sees only its tracks, returns to all packs, and keeps ordinary ungrouped sounds usable.
- [ ] Run the targeted test and confirm the pack shelf is absent.
- [ ] Implement pack selection inside `MarketplaceSounds` without adding another audio element.
- [ ] Re-run the targeted test; expect pass.

### Task 5: Integration verification

**Files:**
- Modify only files required by integration failures.

- [ ] Run `bun run --cwd apps/desktop typecheck`.
- [ ] Run targeted marketplace tests.
- [ ] Run `bun run --cwd apps/desktop build`.
- [ ] Run `bun run --cwd apps/desktop audit:arch` and `bun run --cwd apps/desktop audit:style`.
- [ ] Start through root `bun run dev` and visually verify Visuals, full-bleed cards, Sounds pack navigation, and Kenney attribution.
