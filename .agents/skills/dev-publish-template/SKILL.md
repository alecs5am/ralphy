---
name: dev-publish-template
namespace: maintainer
description: >-
  Publish a finished Ralphy unit and its reusable blocks to the public library.
  Use when the user asks to publish a template, unit, style, recipe, or asset to
  the library. The CLI prepares the entity bundle; the sibling ralphy-web
  repository owns the committed library and upload script.
---

# Publish a finished unit to the library

This skill bridges two repositories without mixing their responsibilities:

- The current `ralphy` repository owns projects, Units, provenance, extraction,
  and validation.
- `../ralphy-web` owns `lib/library-v2/library.json`, public media upload, and
  the `/library` UI.

Read the `templater` skill first. It owns extraction, classification,
blueprints, and de-duplication.

## Hard rules

1. Do not publish before the unit passes its project and workspace evaluators.
2. De-duplicate every proposed Template, Style, Recipe, and Asset against the
   current library before creating a new block.
3. Run the web publisher in dry-run mode first. `--push` requires explicit user
   approval of the entity list and files.
4. Keep source project artifacts append-only. Publishing reads them; it never
   moves, rewrites, or deletes them.
5. Commit and push the `ralphy-web` repository, not the CLI repository, for
   library changes. Heavy reusable media belongs in sibling `ralphy-assets`.
6. All committed text and commit messages are English-only.

## Procedure

1. Resolve the active workspace, project, and unit slug. Read `unit.json`, the
   postmortem, eval output, generation log, and referenced artifacts.
2. Run the `templater` classification and emit block specs plus any blueprint.
3. Compare candidates with `../ralphy-web/lib/library-v2/library.json`; reuse
   existing ids whenever semantics match.
4. From `../ralphy-web`, run the generated publish commands without `--push`:

   ```bash
   bun run scripts/publish-entity.ts --block-file <block.json>
   bun run scripts/publish-entity.ts --unit <absolute-unit-dir>
   bun run scripts/publish-entity.ts --blueprint <absolute-blueprint-dir>
   ```

5. Show the user the dry-run entity list, uploaded-media plan, and exact files
   that will change. Wait for explicit approval.
6. Repeat the commands with `--push` in dependency order: blocks, unit, then
   blueprint.
7. In `ralphy-web`, run its documented lint, typecheck, tests, and build checks;
   run `gitleaks protect --staged --redact`; then commit and push the library
   change.
8. If media moved to `ralphy-assets`, verify and commit that repository
   separately. Never combine repositories in one commit.
9. Report the published unit id, reused and new block ids, and live `/library`
   URL.

## Stop conditions

Stop when the unit has no shippable output, the evaluator has unresolved hard
failures, the library contains an unresolved id collision, dry-run differs from
the proposed entity set, or approval to push is absent.
