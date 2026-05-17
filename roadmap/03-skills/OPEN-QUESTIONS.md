# 03 — Skills — Open Questions & Decisions

## Open questions

### Q-01: Default install scope — user or project?
**Context:** `ralphy skill install` with no flag — does it install to `~/.claude/skills/` (user) or `./.claude/skills/` (project)?
**Options:**
- A. User by default. Convenient for power users who use Ralphy across projects.
- B. Project by default. Reproducible per checkout.
- C. Detect — if in a git repo, project; else user.
**Blocking:** `03.02.01`.
**Owner:** user. Default lean: A.

### Q-02: Symlink vs copy default
**Context:** symlink keeps installed skills live-updating with the repo; copy is more durable but stale.
**Options:**
- A. Symlink default for repo-checkout users; copy default for `npm`/`brew` installs (binary users with no source tree).
- B. Always copy. Predictable.
- C. Always symlink. Fast feedback for contributors.
**Blocking:** `03.02.01`.
**Owner:** user. Default lean: A.

### Q-03: Cursor / Copilot router file — overwrite or merge?
**Context:** the user may already have `.cursor/rules/` or `.github/copilot-instructions.md` with their own content.
**Options:**
- A. Refuse to overwrite without `--force`. Safe.
- B. Merge: add a Ralphy section bounded by sentinel markers (`<!-- ralphy:start --> ... <!-- ralphy:end -->`).
- C. Write to a separate file (`ralphy.mdc` / `ralphy.instructions.md`) — user includes manually.
**Blocking:** `03.02.02`, `03.02.03`.
**Owner:** user. Default lean: B.

### Q-04: Description length: hard cap or soft warn?
**Context:** Claude Code budgets ~1% of context for descriptions. Going over wastes budget; going way over may truncate.
**Options:**
- A. Hard cap 1536 chars (fail lint).
- B. Soft warn at 1200, hard fail at 1536.
- C. Soft warn only.
**Blocking:** `03.03.01`.
**Owner:** user. Default lean: B.

### Q-05: Trigger eval — synthetic or human-curated?
**Context:** synthetic LLM eval is cheap; human-curated is more accurate.
**Options:**
- A. Synthetic with a cheap model (Haiku). Fast, cheap, periodically noisy.
- B. Human-curated test set of 50 utterances; CI runs against fixed expected routes.
- C. Both: human-curated set; synthetic eval as a regression spot-check.
**Blocking:** `03.03.03`.
**Owner:** user. Default lean: C.

### Q-06: `!`-block preloading — opt-in per skill or always-on?
**Context:** preloading saves a tool call but adds latency and noise on skills where state isn't relevant.
**Options:**
- A. Always-on in playbook-entry skills (the 5 main roles).
- B. Opt-in via a frontmatter flag (`preload: status,project`).
- C. Always-on but configurable; defaults are the 5 entry skills.
**Blocking:** `03.04.01`.
**Owner:** user. Default lean: C.

### Q-07: AGENTS.md vs CLAUDE.md — final placement
**Context:** today we have both. CLAUDE.md `@`-imports AGENTS.md. Some agents read only one or the other.
**Options:**
- A. Keep both. CLAUDE.md is Claude-Code-flavored; AGENTS.md is generic.
- B. AGENTS.md only. Delete CLAUDE.md (or make it a thin wrapper).
- C. Stop using CLAUDE.md; document that Claude Code reads AGENTS.md natively per its docs.
**Blocking:** `03.05.01`.
**Owner:** user.

---

## Decision log

*(empty — fill as questions resolve)*
