# Social Units Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let agents form workspace-native posts, threads, and articles for Telegram, X, Threads, dev.to, Medium, and X Articles.

**Architecture:** Extend the unit schema with two text formats and a validated text payload, then generalize unit storage from project-only paths to a project/workspace destination union. Platforms remain destinations on a portable unit; this change validates and packages content but does not add social API clients.

**Tech Stack:** Bun, TypeScript, Commander, Zod, Bun test

## Global Constraints

- Existing project unit manifests and commands remain valid.
- Add formats `post` and `thread`; retain `article`.
- Valid destinations are `telegram`, `x`, `threads`, `devto`, `medium`, and `x-article`.
- `post` permits Telegram, X, and Threads.
- `thread` permits X and Threads.
- `article` permits dev.to, Medium, and X Articles.
- Text body files are copied into the append-only unit directory.
- Workspace units live at `<workspace>/units/<slug>/`.
- Do not add social publishing API clients or credentials.
- Repository files and commit messages remain English-only.

---

### Task 1: Extend the unit schema with text formats

**Files:**
- Modify: `cli/lib/schemas/unit.ts`
- Test: `tests/unit/unit-schema-social.test.ts`

**Interfaces:**
- Produces: formats `post | thread`, `SOCIAL_DESTINATIONS`, `TextUnitSchema`, `validateTextDestinations(format, destinations)`

- [ ] **Step 1: Write failing schema tests**

Cover a valid Telegram post, X/Threads thread, dev.to/Medium/X Article article, invalid Telegram thread, invalid dev.to post, missing body, empty destinations, and an unchanged legacy video manifest.

- [ ] **Step 2: Add destination and text schemas**

Define `SOCIAL_DESTINATIONS` as a literal tuple. Add optional `text: { body: string; destinations: SocialDestination[] }` to the manifest, then add a schema refinement requiring it for `post` and `thread` and validating the per-format destination matrix.

- [ ] **Step 3: Keep article compatibility**

Allow existing article manifests without `text`. Newly created social-destination articles receive both the existing article metadata and the text payload.

- [ ] **Step 4: Verify and commit**

Run `bun test tests/unit/unit-schema-social.test.ts tests/unit/unit-schema.test.ts`. Commit `feat: add social text unit schema`.

### Task 2: Generalize unit storage scope

**Files:**
- Modify: `cli/lib/unit.ts`
- Modify: `cli/lib/paths.ts`
- Test: `tests/unit/workspace-unit.test.ts`

**Interfaces:**
- Produces: `UnitDestination = { kind: "project"; id: string } | { kind: "workspace"; id: string }`, `unitDestinationRoot(destination)`, and `createUnit({ destination, ... })`

- [ ] **Step 1: Write a failing workspace unit test**

Create a Markdown source file, call `createUnit()` with `{ kind: "workspace", id: "acme" }`, and assert `workspaces/acme/units/launch/unit.json` plus copied body content.

- [ ] **Step 2: Add the destination union and root resolver**

Map project units to the current `<project>/units` path and workspace units to `workspaceUnitsDir()`. Preserve the existing `projectId` convenience wrapper for internal callers until command migration is complete.

- [ ] **Step 3: Skip project provenance only when unavailable**

For project destinations, keep graph/provenance lookup unchanged. For workspace destinations, write empty graph relationships and provenance inputs derived from copied source files; do not fabricate a project id.

- [ ] **Step 4: Verify and commit**

Run workspace and existing unit tests. Commit `refactor: support workspace unit storage`.

### Task 3: Create text units from the CLI

**Files:**
- Modify: `cli/commands/unit.ts`
- Test: `tests/commands/unit-social.test.ts`

**Interfaces:**
- Consumes: `UnitDestination`, `createUnit()`, social destination validation
- Produces: `parseUnitDestination({ project?, workspace? })` and repeatable `--destination <platform>`

- [ ] **Step 1: Write failing command tests**

Test the three example commands from the design specification, project backward compatibility, missing/both scope errors, missing destination for post/thread, and a rejected Telegram thread.

- [ ] **Step 2: Make create scope explicit**

Change `unit create <project>` to `unit create [project]`, add `--workspace <slug>`, and require exactly one scope. Keep positional project invocation working.

- [ ] **Step 3: Add repeatable destinations and body selection**

Parse `--destination` into an ordered de-duplicated array. For post/thread, require exactly one `--from` source and set `text.body` to the copied basename. For article with destinations, use `--body` when present, otherwise the single Markdown `--from` source.

- [ ] **Step 4: Verify and commit**

Run command and existing unit tests. Commit `feat: create workspace social units`.

### Task 4: Support workspace list/show/package/delete

**Files:**
- Modify: `cli/commands/unit.ts`
- Test: `tests/commands/workspace-unit-lifecycle.test.ts`

**Interfaces:**
- Consumes: unit destination root resolver
- Produces: workspace scope for `unit list`, `show`, `package`, and `delete`

- [ ] **Step 1: Write a failing lifecycle test**

Create a workspace post, list it, show its JSON, package it, and delete it with the same append-only/force semantics used by project units.

- [ ] **Step 2: Reuse one scope parser in read/write commands**

Add optional project positional argument plus `--workspace` to lifecycle commands. Resolve the unit root once and pass it to existing filesystem operations.

- [ ] **Step 3: Keep project-only commands explicit**

Leave caption generation project-only if it requires project brief/source context. Its help text must state this instead of accepting a workspace and failing later.

- [ ] **Step 4: Verify and commit**

Run lifecycle and regression tests. Commit `feat: manage workspace unit lifecycle`.

### Task 5: Document formats and examples

**Files:**
- Modify: `docs/cli-surface.md`
- Modify: `docs/skills-vs-templates.md`
- Modify: `AGENTS.md`
- Test: `tests/cli-surface.test.ts`

**Interfaces:**
- Consumes: final CLI command surface and destination matrix
- Produces: agent-facing routing and examples

- [ ] **Step 1: Update the routing contract**

Describe text-first unit formation separately from publishing. Route Telegram/X/Threads post requests to `post`, multi-post sequences to `thread`, and dev.to/Medium/X long-form to `article`.

- [ ] **Step 2: Add exact command examples**

Document workspace post, thread, and article examples and note that credentials/publishing are outside this feature.

- [ ] **Step 3: Regenerate and verify CLI docs**

Run the repository CLI surface generation/check command, unit tests, integration tests, lint, no-Cyrillic scan, and binary smoke.

Expected: all commands exit 0 and generated docs have no diff after regeneration.

- [ ] **Step 4: Commit**

Commit `docs: route social text units through workspaces`.
