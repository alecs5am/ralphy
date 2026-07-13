# Workspace Shared Assets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a Ralphy workspace a typed social-account home whose agents can inspect account identity and generate shared brand assets without creating a project.

**Architecture:** Add a backward-compatible Zod workspace manifest and a small destination value object at the provider output/logging seam. All generation continues through the existing connectors; destination resolution chooses either project artifacts or workspace shared assets, with separate append-only generation logs.

**Tech Stack:** Bun, TypeScript, Commander, Zod, Bun test

## Global Constraints

- Existing workspace manifests parse through defaults without migration.
- Workspace manifests store public metadata only, never credentials.
- Existing project generation behavior and output paths remain unchanged.
- Generation accepts exactly one of `--project <id>` and `--workspace <slug>`.
- Workspace assets live under `shared/assets/{images,videos,voiceover,music,sfx,fonts}`.
- Workspace generation logs live at `<workspace>/logs/generations.jsonl`.
- Writes retain existing append-only collision/versioning behavior.
- `ralphy gen` is an alias for `ralphy generate`.
- Repository files and commit messages remain English-only.

---

### Task 1: Add the typed workspace manifest

**Files:**
- Create: `cli/lib/schemas/workspace.ts`
- Modify: `cli/commands/workspace.ts`
- Test: `tests/unit/workspace-schema.test.ts`

**Interfaces:**
- Produces: `WorkspaceManifestSchema`, `WorkspaceManifest`, `parseWorkspaceManifest(value)`

- [ ] **Step 1: Write failing compatibility tests**

Test that `{ slug: "acme", name: "Acme" }` receives version/profile/channel defaults, and that profile/channel metadata round-trips while unknown secret-shaped fields are not accepted.

Run: `bun test tests/unit/workspace-schema.test.ts`

Expected: FAIL because the schema module does not exist.

- [ ] **Step 2: Implement the schema**

Define strict channel keys `telegram`, `x`, `threads`, `devto`, and `medium`, each with optional `handle`. Define profile defaults for `displayName`, `bio`, `language`, and `timezone`. Export the inferred type and parse helper.

- [ ] **Step 3: Use the schema in create/show/list**

Workspace creation writes a parsed manifest. Workspace reads parse old JSON before presenting it. Parse errors identify the manifest path and preserve the original file.

- [ ] **Step 4: Verify and commit**

Run the schema test and workspace command tests. Commit `feat: type workspace account manifests`.

### Task 2: Formalize workspace shared paths

**Files:**
- Modify: `cli/lib/paths.ts`
- Modify: `cli/commands/workspace.ts`
- Test: `tests/unit/workspace-paths.test.ts`

**Interfaces:**
- Produces: `workspaceSharedAssetsDir(slug)`, `workspaceSharedAssetKindDir(slug, kind)`, `workspaceLogsDir(slug)`, `workspaceUnitsDir(slug)`

- [ ] **Step 1: Write failing path tests**

Assert exact paths below `.ralphy/workspaces/acme/shared/assets/images`, `.ralphy/workspaces/acme/logs`, and `.ralphy/workspaces/acme/units`.

- [ ] **Step 2: Add pure path helpers**

Implement the four exported helpers using existing `workspaceDir()` and `path.join()`. Accept the same artifact kind union used by project artifacts.

- [ ] **Step 3: Create directories for new workspaces**

Extend workspace creation to make `shared/assets/{images,videos,voiceover,music,sfx,fonts}`, `logs`, and `units`, while leaving existing `shared/brands`, `shared/personas`, and `shared/refs` untouched.

- [ ] **Step 4: Verify and commit**

Run path and workspace creation tests. Commit `feat: add workspace shared asset layout`.

### Task 3: Introduce one generation destination type

**Files:**
- Create: `cli/lib/generation-destination.ts`
- Modify: `cli/lib/providers/types.ts`
- Modify: `cli/lib/providers/shared.ts`
- Test: `tests/unit/generation-destination.test.ts`

**Interfaces:**
- Produces: `GenerationDestination = { kind: "project"; id: string } | { kind: "workspace"; id: string }`, `destinationAssetPath(destination, artifactKind, filename)`, `destinationLabel(destination)`
- Consumes: project artifact and workspace shared path helpers

- [ ] **Step 1: Write failing destination tests**

Assert project output remains `projects/<id>/artifacts/images/file.png` and workspace output becomes `workspaces/<slug>/shared/assets/images/file.png`.

- [ ] **Step 2: Implement the discriminated union and pure helpers**

Map project destinations to `artifactKindDir()` and workspace destinations to `workspaceSharedAssetKindDir()`. Keep path selection out of connector implementations.

- [ ] **Step 3: Extend provider common input compatibly**

Replace the required `projectId` transport field with required `destination`, and expose a temporary derived project id only where an upstream provider requires request metadata. No connector may branch on Commander options.

- [ ] **Step 4: Verify and commit**

Run destination and provider unit tests. Commit `refactor: route generation through destination scope`.

### Task 4: Add workspace generation logging

**Files:**
- Modify: `cli/lib/gen-log.ts`
- Modify: `cli/lib/providers/shared.ts`
- Modify: connector files returned by `rg 'logGeneration\(' cli/lib/providers`
- Test: `tests/unit/gen-log.test.ts`

**Interfaces:**
- Produces: `logGeneration(destination: GenerationDestination, entry: GenerationLogEntry): Promise<void>`

- [ ] **Step 1: Write a failing workspace log test**

Generate one log entry for `{ kind: "workspace", id: "acme" }` and assert one JSONL line at `workspaces/acme/logs/generations.jsonl`.

- [ ] **Step 2: Generalize the log root**

Select project `logs/` or workspace `logs/` from the destination union. Preserve the existing JSONL entry shape and append semantics.

- [ ] **Step 3: Update connector call sites structurally**

Use `ast-grep` for `logGeneration($A, $B)` and pass the destination from common input. Update `logFailure()` the same way.

- [ ] **Step 4: Verify and commit**

Run generation log and connector tests. Commit `feat: log workspace asset generations`.

### Task 5: Add mutually exclusive command scope and `gen` alias

**Files:**
- Modify: `cli/commands/generate.ts`
- Modify: `cli/index.ts`
- Test: `tests/commands/generate-workspace.test.ts`
- Test: `tests/cli-surface.test.ts`

**Interfaces:**
- Consumes: `GenerationDestination`
- Produces: `parseGenerationDestination({ project?, workspace? }): GenerationDestination`

- [ ] **Step 1: Write failing CLI tests**

Cover project-only success, workspace-only success, missing-scope failure, both-scopes failure, `ralphy gen image --help`, and workspace image destination/versioning.

- [ ] **Step 2: Add one scope parser**

Return the matching destination when exactly one option is present. Throw `RalphyError` with a stable message when zero or two scopes are present.

- [ ] **Step 3: Apply the options to media generation commands**

Change image, video, voiceover, music, and sfx from required project option to optional project plus optional workspace. Keep captions project-scoped because they transform project media.

- [ ] **Step 4: Register the alias**

Register the same Commander command tree under `generate` and `gen` without duplicating handlers.

- [ ] **Step 5: Verify and commit**

Run targeted command/provider tests and CLI surface generation. Commit `feat: generate shared assets from workspaces`.

### Task 6: Expose account inventory in workspace show

**Files:**
- Modify: `cli/commands/workspace.ts`
- Test: `tests/commands/workspace-show.test.ts`
- Modify: `docs/cli-surface.md`
- Modify: `AGENTS.md`

**Interfaces:**
- Consumes: typed manifest, shared asset paths, workspace unit paths
- Produces: JSON fields `profile`, `channels`, `sharedAssets`, `workspaceUnits`, and `projectUnitCount`

- [ ] **Step 1: Write a failing JSON output test**

Create a workspace with one shared image, one workspace unit, and one project unit. Assert the exact aggregate counts in `workspace show --json`.

- [ ] **Step 2: Implement read-only inventory aggregation**

Count files/units without rewriting manifests. Missing directories count as zero for old workspaces.

- [ ] **Step 3: Document agent usage**

Add examples for account profile metadata, `ralphy gen image --workspace acme`, and explicit `shared/assets/...` references.

- [ ] **Step 4: Verify and commit**

Run workspace tests, lint, CLI docs checks, and binary smoke. Commit `docs: explain workspace account assets`.
