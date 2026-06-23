# Ralphy Desktop chat product MVP

> **Status:** dropped (standalone Electron desktop MVP not pursued; the human-facing surface is studio/, expanded into a board UI in #478; dropped by the user 2026-06-23)
> **Filed:** 2026-06-15
> **Folder:** issues
> **Severity:** strategic
> **Category:** desktop / chat-product

## Context

Promoted from `notes/ideas/009-desktop-app-claude-code.md`. The user approved
the second launch track on 2026-06-15: a desktop/chat product for non-technical
users. The desktop app is not a replacement for the CLI. It is the primary
human-facing surface over the same agent-native production engine.

The chosen integration remains local-agent first: spawn the user's locally
installed Claude Code style agent in headless/stream mode where possible, then
let that agent drive `ralphy` over a selected project/workspace.

## What

Build the MVP desktop product: a chat window plus a live project panel that
lets a user request media, approve paid steps, inspect artifacts, review eval
results, run repairs, and package Units without touching the CLI directly.

## Why it matters

The substrate track makes agents capable. The desktop track makes that capability
usable by marketers, creators, founders, and other non-CLI users.

## Scope / acceptance

1. **Project selector.** User can choose/create a workspace and project, and the
   app scopes the agent cwd/context correctly.
2. **Agent bridge.** Main process can spawn the local agent binary, stream events
   to the renderer, and send user messages back.
3. **Ralphy event understanding.** Renderer recognizes Ralphy stages: intake,
   research, planning, generation, render, eval, repair, Unit formation, and
   distribution packaging.
4. **Artifact panel.** Live project view shows refs, generated images/videos,
   renders, eval reports, Units, and distribution packs as files change.
5. **Approval UX.** Paid generation/render/repair steps surface a permission
   prompt with estimated cost, scope, and artifact impact.
6. **Budget visibility.** UI shows approved budget, actual spend, and remaining
   retry budget when the spend ledger exists.
7. **Eval/repair UI.** Failed readiness/eval results show blocking issues and
   allow the user to approve a targeted repair plan.
8. **Unit packaging.** Finished Units are visible with media, provenance summary,
   readiness verdict, and distribution pack actions.
9. **Auth/billing warning.** Detect and warn if `ANTHROPIC_API_KEY` would force
   pay-per-token billing instead of subscription OAuth. Document the separate
   Agent SDK credit pool plainly in the desktop onboarding.

## Implementation notes

- Existing scaffold lives under `desktop/`.
- Keep the renderer independent of Next unless there is a clear reason to share
  the landing stack.
- The first MVP can be local-only. Cloud sync, teams, and direct platform
  publishing are not required for the first pass.

## Dependencies and linked work

- Agent substrate: #452.
- Artifact browser precedent: #107.
- Spend ledger: #444.
- Distribution pack: #423.
- Readiness scorecard: #427.
- Scale ops: #460.

## Notes

- Preserve the old idea's key billing conclusion: headless agent driving uses
  a separate agent/SDK-style credit bucket, not the normal interactive time
  bucket. Verify current vendor policy before public claims.
