# Postiz Workspace Publishing Implementation Plan

**Goal:** Publish or schedule project and workspace Units through a saved
Postiz Cloud connection, with an agent skill that prepares the social copy.

**Architecture:** Keep the HTTP client in `cli/lib/providers/postiz.ts`. Resolve
env overrides first and a workspace-local `credentials.json` second. Generalize
the existing publish orchestrator around a project-or-workspace Unit location,
then add target-aware text and Postiz settings without creating a second
publishing pipeline.

**Tech stack:** TypeScript, Bun, Commander, Zod, Postiz Public API.

---

### Task 1: Lock the new connector and payload behavior with tests

**Files:**
- Modify: `tests/unit/publish.test.ts`
- Modify: `tests/unit/analytics.test.ts`

Add failing tests for the Cloud API root, workspace credential fallback,
Telegram, provider settings, workspace text Units, and X thread payloads. Run
the focused tests and confirm the intended failures.

### Task 2: Add workspace-aware Postiz configuration

**Files:**
- Modify: `cli/lib/providers/postiz.ts`

Resolve `POSTIZ_API_KEY` plus `POSTIZ_API_URL`/legacy base URL first, then read
`connectors.postiz` from the requested workspace credentials file. Normalize a
full Public API root and forward workspace scope through every connector call.

### Task 3: Generalize publish mapping and orchestration

**Files:**
- Modify: `cli/lib/publish/mapping.ts`
- Modify: `cli/lib/publish/publish.ts`
- Modify: `cli/commands/publish.ts`

Add Telegram, provider-specific settings, workspace Unit paths, text-body and X
thread resolution, and the `--workspace` CLI form. Preserve project behavior,
append-only provenance, ledger checks, and the readiness gate.

### Task 4: Make analytics read workspace Units

**Files:**
- Modify: `cli/lib/analytics/pull.ts`
- Modify: `cli/commands/analytics.ts`

Allow `analytics pull --workspace <slug> [unit]` to read publish provenance and
append snapshots beside workspace-owned Units while preserving the project
form.

### Task 5: Add the agent-facing publishing skill

**Files:**
- Create: `.agents/skills/social-publish/SKILL.md`
- Modify: `AGENTS.md`

Route publish/schedule utterances to a thin skill that reads workspace strategy,
forms or resolves the Unit, prepares target copy and hashtags, and invokes the
CLI. Validate frontmatter and repository skill-routing lint.

### Task 6: Configure and verify `ralphy-automaton`

**Files (gitignored):**
- Modify: `.ralphy/workspaces/ralphy-automaton/credentials.json`
- Modify: `.ralphy/workspaces/ralphy-automaton/workspace.json`
- Create: `.ralphy/workspaces/ralphy-automaton/SOCIAL_STRATEGY.md`

Merge the saved Postiz Cloud key without touching existing credentials. Store
the four public account bindings and editorial roles. Run a read-only account
listing through the real connector and verify all four enabled integrations.

### Task 7: Verify and ship

Run focused tests, `bun run lint`, relevant repository lints, Cyrillic scan,
`gitleaks protect --staged --redact`, and `git diff --check`. Commit and push
core changes. Do not create a live post; the first post is the user's new-chat
acceptance test.
