# Unified Units Production Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a single Units production workbench backed by explicit Core Unit-to-Composition links.

**Architecture:** Core schema version 7 adds nullable identity and revision links plus `unit.create`; existing Unit item flows remain valid. Desktop removes only the user-facing Composition destination and reuses its controller/build machinery inside Unit detail.

**Tech Stack:** Bun, TypeScript, bun:sqlite, Electron, React, Vitest, Testing Library, CSS.

**Spec:** `docs/superpowers/specs/2026-08-17-unified-units-production-workbench.md`

## Global Constraints

- Preserve unrelated dirty changes in both repositories.
- Use Bun only and keep all on-disk content in English.
- Do not infer Unit/Composition relationships from slugs or artifact names.
- Keep Documents and Media behavior and layouts unchanged.
- Reuse existing Composition controller state and components; add no dependencies.

---

### Task 1: Core relationship contract

**Files:**
- Modify: `ralphy/.worktrees/sqlite-domain-store/cli/lib/store/schema.ts`
- Modify: `ralphy/.worktrees/sqlite-domain-store/cli/lib/store/types.ts`
- Modify: `ralphy/.worktrees/sqlite-domain-store/cli/lib/store/internal-types.ts`
- Modify: `ralphy/.worktrees/sqlite-domain-store/cli/lib/store/units.ts`
- Modify: `ralphy/.worktrees/sqlite-domain-store/cli/lib/bridge/methods.ts`
- Test: `ralphy/.worktrees/sqlite-domain-store/tests/integration/domain-query-surfaces.test.ts`
- Test: `ralphy/.worktrees/sqlite-domain-store/tests/integration/cli-bridge.test.ts`

**Interfaces:**
- Produces: `UnitDto.compositionId`, `UnitRevisionDto.compositionRevisionId`, `CreateUnitInput.compositionId?`, `ReviseUnitInput.compositionRevisionId?`, bridge `unit.create`.

- [ ] Write failing store tests proving an empty linked Unit is visible, a linked revision round-trips, cross-project links fail, direct Units still work, and a draft Composition revision cannot be selected.
- [ ] Run the exact Core tests and confirm failures are caused by the missing fields and method.
- [ ] Add schema migration 7, immutable link guards, DTO fields, inputs, validation, and `unit.create`.
- [ ] Run the targeted Core tests until green, then run schema/verification tests affected by the new columns.

### Task 2: Desktop bridge contract

**Files:**
- Modify: `ralphy-desktop/electron/ralphy/types.ts`
- Modify: `ralphy-desktop/electron/ralphy/client.ts`
- Modify: `ralphy-desktop/electron/ralphy/project-reader.ts`
- Test: `ralphy-desktop/tests/project-reader.test.ts`
- Test: `ralphy-desktop/tests/ralphy-current-core.test.ts`

**Interfaces:**
- Consumes: Core contract version 3 with explicit Unit links.
- Produces: exact validated DTOs used by the project screen controller.

- [ ] Write failing bridge tests for the new exact Unit and Unit revision shapes and Core capability/version.
- [ ] Run them and confirm the old contract is rejected.
- [ ] Update Desktop contract types, validators, fixtures, and supported Core version with no renderer IPC expansion.
- [ ] Run the bridge tests until green.

### Task 3: Unified Units workbench

**Files:**
- Modify: `ralphy-desktop/src/components/ProjectControls.tsx`
- Modify: `ralphy-desktop/src/screens/ProjectScreen.tsx`
- Modify: `ralphy-desktop/src/screens/project/OverviewPanel.tsx`
- Modify: `ralphy-desktop/src/screens/project/UnitsPanel.tsx`
- Modify: `ralphy-desktop/src/screens/project/UnitViewer.tsx`
- Create: `ralphy-desktop/src/lib/unit-lifecycle.ts`
- Modify: `ralphy-desktop/src/state/project-screen-controller.ts`
- Modify: `ralphy-desktop/src/styles/workbench.css`
- Test: `ralphy-desktop/tests/project-screen.test.tsx`
- Test: `ralphy-desktop/tests/project-screen-behavior.test.tsx`
- Test: `ralphy-desktop/tests/units-panel.test.tsx`
- Test: `ralphy-desktop/tests/design-system.test.ts`

**Interfaces:**
- Consumes: `UnitDto.compositionId` and `UnitRevisionDto.compositionRevisionId`.
- Produces: `deriveUnitLifecycle(...)` and a single responsive master/detail Units surface.

- [ ] Write failing pure lifecycle tests for in-progress, preview-ready, selected, rendering, failed, ready, published, and direct Unit paths.
- [ ] Write failing UI/controller tests for five tabs, linked Composition loading, selection-before-render, production disclosure, and no top-level Compositions panel.
- [ ] Run the targeted Desktop tests and confirm the expected behavior failures.
- [ ] Implement the lifecycle helper, linked Composition loading, five-tab navigation, inline master/detail layout, revision rail, primary action, and production disclosure by reusing existing controls.
- [ ] Run targeted tests until green and update only the responsive selectors directly affected by Units.

### Task 4: Build and live UX verification

**Files:**
- No production files unless a failing verification produces a regression test first.

**Interfaces:**
- Consumes: local Core bridge executable and Desktop development build.
- Produces: a running Desktop app focused on `UX Testing lab`.

- [ ] Run Core targeted tests and Desktop targeted tests from clean command invocations.
- [ ] Run `bun run build` in `ralphy-desktop`.
- [ ] Start Desktop with `RALPHY_BIN` pointing to the local Core worktree executable.
- [ ] In `UX Testing lab`, exercise draft, selected, render failure/retry, ready, direct document/artifact, and published states; verify keyboard focus and narrow layout.
- [ ] Leave the verified Desktop process open on the Units workbench.
