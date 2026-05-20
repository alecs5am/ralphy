# 03 — Skills — Open Questions & Decisions

## Open questions

### Q-01: Default install scope — user or project? → D-03

### Q-02: Symlink vs copy default → D-01

### Q-03: Cursor / Copilot router file — overwrite or merge? → D-02

### Q-04: Description length: hard cap or soft warn? → D-04

### Q-05: Trigger eval — synthetic or human-curated? → D-07

### Q-06: `!`-block preloading — opt-in per skill or always-on? → D-05

### Q-07: AGENTS.md vs CLAUDE.md — final placement → D-06

---

## Decision log

### D-07: Skills are user-invokable techniques, not auto-route surfaces; trigger eval cancelled (2026-05-20)
**Was:** Q-05
**Decision:** Reframe the skill layer: Skills are **explicit user-invokable techniques and pre-planned flows** (e.g., `/postmortem`, `/release`, `/ralph-evaluator`, `/ralph-researcher`) — they fire when the user types the slash command, NOT when an agent auto-routes a natural-language utterance against a description corpus. Natural-language routing happens through `AGENTS.md` + the playbooks it references; the agent reads the routing table, picks a playbook, follows it. Skills are an additional layer for *advanced techniques the user knows they want*. Consequence: no trigger-accuracy eval is needed for v1.0, because we don't have a trigger surface in the auto-route sense.
**Why:** The user's mental model (verified during this question) is that AGENTS.md + playbooks are the agent's primary instruction set; skills exist for moments when the user wants a specific structured flow (`/postmortem` after a hard session). Building a synthetic / human-curated eval for natural-language routing against skill descriptions would be optimizing for a use case the architecture has chosen NOT to rely on. Description fields still matter (they help the agent *suggest* a skill to the user, and help Claude Code render the right invocation menu), but their quality bar is "scannable + accurate" — not "wins an auto-route tournament".
**Consequences:**
- `03.03.03` (trigger accuracy eval) → cancelled, `[x] (cancelled — D-07)`, `v1.0: no`.
- `03.03.04` (description authoring guide) refocuses: descriptions describe *what the user might invoke this for*, not *what utterances trigger it*. Guide examples emphasize "user-facing summary" over "trigger phrase list".
- `03.01.01` / `03.01.02` (frontmatter + body structure) stay valid — agentskills.io compliance still matters because Claude Code uses the frontmatter to render the slash-command menu.
- AGENTS.md routing audit (`03.05.01`) becomes the load-bearing v1.0 task in this category — it's the primary routing surface. Tighten its lint to verify every row points at a real playbook and no playbook is orphaned.
- `03.06.01` (`ralphy skill new`) stays — adding a new user-invokable technique is still useful (`/some-new-flow`).
- PRD problem statements #4 (description optimization for trigger budget) and #5 (`!`-block preloading) are downgraded to historical context; they reflect the old "skills as auto-route surface" framing.

### D-06: AGENTS.md is the canonical routing source; CLAUDE.md stays as Claude-flavored personal layer (2026-05-20)
**Was:** Q-07
**Decision:** `AGENTS.md` (and every playbook / sub-doc it points to) is the single source of routing truth for every agent (Claude Code, Cursor, Codex, OpenCode, future). It is the file every adapter (per `01-D-05`) points at. `CLAUDE.md` continues to exist alongside `AGENTS.md` as a Claude-Code-specific layer — it `@`-imports `AGENTS.md` and adds Claude-flavored personal context (memory file path, repo-specific quirks the maintainer wants Claude to know). The agent the maintainer actually uses gets a slightly richer surface; everyone else gets `AGENTS.md` and is fine.
**Why:** AGENTS.md is now an emerging multi-agent convention (Codex / OpenCode / Aider read it natively); keeping it as the canonical source lets us write routing rules once and have them work across the agent matrix. CLAUDE.md still earns its keep because the maintainer (Claude Code user) benefits from a Claude-specific layer for memory + ergonomics — collapsing it into AGENTS.md would either pollute the generic file with Claude-isms or lose them entirely.
**Consequences:**
- `03.05.01` (audit) verifies AGENTS.md is the *source* and CLAUDE.md is a *consumer* — no Claude-specific routing rules in AGENTS.md, no generic routing rules duplicated into CLAUDE.md.
- `03.05.02` (non-Claude agents section) restated: AGENTS.md already targets non-Claude agents by default; no separate "for other agents" subsection needed.
- `01.01.06` skill-install adapters (per `01-D-05`) all point at `AGENTS.md` as the routing destination; Claude adapter additionally merges into `CLAUDE.md`.
- If we ever drop Claude Code as the maintainer's primary agent, CLAUDE.md can be reduced to a thin `@AGENTS.md` stub without breaking anything else.

### D-05: No structured `!`-block preloading; agent decides per-invocation (2026-05-20)
**Was:** Q-06
**Decision:** Skills do NOT ship with `!`-block state preloading hard-coded into their bodies. The agent decides per-invocation what state to pull via `ralphy <verb>` tool calls (the AGENTS.md routing step 0 — `ralphy whoami` / `ralphy status` — is the only baseline preload, and that's an agent-instruction, not a skill mechanic). This makes `03.04.01` and `03.04.02` redundant for v1.0.
**Why:** Preloading inside a skill body is opaque, adds latency on every invocation regardless of whether the state matters, and the skill author has to predict what the agent will need. Letting the agent decide keeps each skill body smaller, makes the trigger cleaner, and matches how the rest of the playbook discipline works (agent reads playbook → decides what state to fetch). For Claude Code specifically, the `whoami`/`status` baseline preload happens once per session via the AGENTS.md routing step 0, which is sufficient.
**Consequences:**
- `03.04.01` (entry skills preload project state) → cancelled, flipped to `[x] (cancelled — D-05)` with `v1.0: no`.
- `03.04.02` (fallback for non-Claude-Code agents) → cancelled (was a hedge against `03.04.01`'s Claude-specific mechanic).
- `docs/skills-format.md` (when written for `03.01.03`) explicitly says: skills are routing + reasoning instructions, not preload macros. State comes from `ralphy <verb>` calls the agent makes after entering the skill.
- The agent-side discipline in `AGENTS.md` step 0 (run `ralphy` / `ralphy whoami`) covers the only baseline-preload need.

### D-04: No automated description-length lint; documented guideline only (2026-05-20)
**Was:** Q-04
**Decision:** We do NOT add an automated lint for SKILL.md description length. Authors are reminded in `docs/skills-format.md` (per `03.01.03`) that Claude Code budgets ~1% of context for skill discovery and that descriptions over ~1500 chars risk truncation in the trigger surface — but no CI rule blocks a long description. If drift ever causes a real "this skill stopped triggering" bug, we reopen the question and add the lint as a follow-up task.
**Why:** Today the skill set is small enough that the trigger-budget pressure is theoretical; adding a lint costs maintenance and friction-on-PR for a problem we haven't observed. The skill-author audience is mostly the project maintainer for v1.0, who already internalizes the constraint. Lint becomes worth it when external contributors start adding skills and we can't review every PR; we'll know we crossed that line because triggers will start drifting.
**Consequences:**
- `03.03.01` (description length lint) → cancelled, `[x] (cancelled — D-04)`, `v1.0: no`.
- `03.03.02` (description shape lint) → kept but downgraded to `v1.0: no` unless it shares the same lint runner with another rule (revisit when scoping v0.3).
- `03.03.04` (description authoring guide) absorbs the length guidance — one paragraph in `docs/skills-format.md` describing the budget reality and showing one good / one bad example.
- A new `03.07.04` (post-launch) entry tracks "Reintroduce description-length lint" if needed later.

### D-03: Interactive wizard during `ralphy setup`; user scope is the wizard default; choice persisted (2026-05-20)
**Was:** Q-01
**Decision:** `ralphy skill install` does NOT pick a default scope silently. Instead, the **first** time it runs on a machine it launches an interactive wizard (modelled after Remotion's `npx create-video@latest` "Say yes to install Skills" flow):
1. Detect which agent rule-dirs / configs exist on the machine (`~/.claude/`, `~/.cursor/`, `~/.codex/`, repo-level `AGENTS.md`, `.github/copilot-instructions.md`).
2. Show the detected list and ask "install the Ralphy skill bundle for: [x] claude [x] cursor [ ] codex" (multi-select).
3. For each selected agent, ask scope where it matters (Claude: "user (works in every project) or project (this checkout only)?" — default **user**; Cursor: same; Codex: always project — `AGENTS.md` is repo-root). Default `user` is the wizard's `[Y/n]` default because it matches the tester-onboarding scenario of "install once, agent knows ralphy everywhere".
4. Persist the result to `~/.ralphy/config.json` under `skill.installedAgents` (list of agents) and `skill.installScope` (`user` | `project`). Subsequent `ralphy skill install` runs read this config and run non-interactively against the same target set. `ralphy skill install --reconfigure` re-launches the wizard. Per-agent override flags (`--agent claude --scope project`) still work and bypass the wizard.
5. The wizard also runs as a sub-step of `ralphy setup` (per `01.04.02`), so a fresh-machine tester gets one prompt-set covering API keys + skill install.

**Why:** Picking a hard default (Option A or B) is the wrong shape — half the audience wants user-scope, half wants project-scope, and a wrong silent pick burns trust. Auto-detect by "are we in a git repo?" (Option C) is magic that breaks the moment the tester moves to a different repo and the install "disappears". An interactive wizard with persisted choice mirrors a pattern testers already know (`create-next-app`, Remotion's `create-video`) and removes the question on every subsequent run.
**Consequences:**
- `03.02.01` (Claude adapter) acceptance gains: invoke the wizard on first run; honor `skill.installScope` from config on subsequent runs.
- `01.04.02` (`ralphy setup` wizard) gains a "Install skill bundle for your agent(s)?" step that chains into the same flow.
- New SPEC task `03.02.06` — "Interactive `ralphy skill install` wizard + config persistence" — captures the wizard mechanics so each adapter sub-task stays focused on its target.
- `--scope user|project` flag stays for power users + CI; bypasses the wizard.
- `ralphy skill install --reconfigure` is the canonical "I want to change which agents I install to" entry point.

### D-02: Sentinel-bounded merge into existing rule files (2026-05-20)
**Was:** Q-03
**Decision:** Mirrors [01-D-05](../01-cli/OPEN-QUESTIONS.md#decision-log). When the adapter writes into a file the user might already own (`.cursor/rules/ralphy.mdc`, `.github/copilot-instructions.md`, repo-root `AGENTS.md`, `~/.claude/CLAUDE.md`, project-root `CLAUDE.md`), the adapter inserts a Ralphy section bounded by sentinels:

```
<!-- ralphy:start v=<schema-version> -->
... routing block ...
<!-- ralphy:end -->
```

Re-runs replace the inner content idempotently. Uninstall (`ralphy skill uninstall`) strips the block, leaving the rest of the file untouched. For files the adapter *owns* outright (`~/.claude/skills/ralphy/`, `.cursor/rules/ralphy.mdc` when freshly created), there is no merge — the directory or file is the adapter's.
**Why:** Refuse-without-`--force` (Option A) is hostile to the most common tester scenario (user already has some Cursor rules). Separate file (Option C) is fine when supported (Cursor permits multiple `.mdc` files) but doesn't work for files like `.github/copilot-instructions.md` where there's only one canonical path. Sentinel-merge handles both surfaces with one consistent mechanic.
**Consequences:**
- `03.02.02` (Cursor adapter), `03.02.03` (Copilot adapter), `03.02.04` (Codex / AGENTS.md adapter) all reference the sentinel format.
- `03.02.05` (uninstall) is the symmetric strip-the-block operation.
- The sentinel schema version (`v=1`) lets future ralphy versions detect and migrate stale blocks without parsing the inner content.

### D-01: Symlink for repo-checkout users; copy for binary-only installs (2026-05-20)
**Was:** Q-02
**Decision:** Mirrors [01-D-05](../01-cli/OPEN-QUESTIONS.md#decision-log). `ralphy skill install` defaults to symlinking the skill bundle when invoked from a repo checkout (the binary can resolve a real source tree at `<repo>/.agents/skills/`). When the user has only the brew / npm binary (no source tree on disk), the install falls back to copying the bundled skill set out of the binary's resources. Explicit `--symlink` / `--copy` flags override the auto-detect.
**Why:** Symlink keeps installed skills live-updating with the repo (the contributor / power-user case), copy is durable for the binary-only audience (the tester case who runs `brew install` and has no clone). Auto-detecting which mode applies removes the choice from the wizard and gives both audiences the right default.
**Consequences:**
- `03.02.01` Claude adapter acceptance: auto-detect symlink vs. copy based on the binary's source-tree resolution; the wizard does NOT ask about it.
- `01.09.07` (`ralphy doctor` reports install mode) surfaces this: doctor shows `install_mode: { binary: "brew|npm|local", skill_bundle: "symlink|copy" }`.
