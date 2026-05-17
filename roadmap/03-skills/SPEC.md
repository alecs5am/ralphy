# 03 — Skills — SPEC

> **Vision.** Ralphy is a first-class skill bundle in every agent platform that supports `AGENTS.md`. `ralphy skill install` is the one-verb on-ramp. Triggers fire on the right utterances; misfires are measured and fixed.

## Scope

**In:**

- agentskills.io-compliant SKILL.md format + lint
- Cross-agent skill installer (Claude Code, Cursor, Copilot, Codex)
- Description-field discipline + trigger accuracy eval
- `!`-block state preloading
- AGENTS.md routing audit
- New-skill scaffolder

**Not in (cross-references):**

- The `ralphy skill install` CLI surface itself → [`01.01.06`](../01-cli/SPEC.md)
- MCP server → [`01.01.05`](../01-cli/SPEC.md), post-launch
- Playbook *contents* → respective category playbooks under `docs/playbooks/`

---

## 03.01 agentskills.io compliance

The Anthropic-published spec is the industry-converging standard. Adopt verbatim.

### 03.01.01 Frontmatter contract  [~]
**v1.0:** yes

**Acceptance criteria:**
- Every SKILL.md has `name` (kebab-case slug matching folder), `description` (one paragraph, ≤ 1536 chars).
- Optional: `when_to_use`, `allowed-tools`, `disable-model-invocation`, `paths`, `context`, `argument-hint`, `arguments`.
- Lint: `bun run lint:skills` parses frontmatter, validates schema, errors on missing required fields.

### 03.01.02 Body structure  [~]
**v1.0:** yes

**Acceptance criteria:**
- Each SKILL.md body has these sections in order: `## Trigger` (when), `## Hard invariants` (must-do, must-not), `## Workflow` (steps), `## Outputs` (what the user sees / what gets written), `## Cookbook` (concrete examples).
- Lint warns on missing sections (warnings, not errors — some skills are intentionally minimal).

### 03.01.03 Documented in `docs/skills-format.md`  [ ]
**v1.0:** yes

**Acceptance criteria:**
- New doc explains the format, links to agentskills.io, shows an annotated example (probably `ralph-researcher`).
- Referenced from `CONTRIBUTING.md` for new contributors.

---

## 03.02 Cross-agent installer

The `ralphy skill install` verb (CLI side at [`01.01.06`](../01-cli/SPEC.md)) consumes this category's adapter system.

### 03.02.01 Claude Code adapter  [ ]
**v1.0:** yes

**Acceptance criteria:**
- Default behavior: `--symlink` from `~/.claude/skills/ralphy/` → `<repo>/.agents/skills/`.
- `--copy` mode: hardcopy + sentinel file `.ralphy-installed` for clean uninstall.
- Round-trip test: install → invoke a skill in Claude Code → uninstall → no residue.

### 03.02.02 Cursor adapter  [ ]
**v1.0:** yes

**Acceptance criteria:**
- Writes `.cursor/rules/ralphy-router.mdc` with `alwaysApply: true` and the AGENTS.md routing table.
- Writes one `.cursor/rules/ralphy-<playbook>.mdc` per playbook with `description` set for Agent-Requested mode.
- Scope `user` writes to `~/.cursor/rules/`; scope `project` writes to `<cwd>/.cursor/rules/`.

### 03.02.03 Copilot adapter  [ ]
**v1.0:** yes

**Acceptance criteria:**
- Writes `.github/copilot-instructions.md` (the router) OR adds Ralphy section to existing one (idempotent).
- Writes one `.github/instructions/ralphy-<playbook>.instructions.md` per playbook with `applyTo: '**'`.

### 03.02.04 Codex / generic AGENTS.md  [ ]
**v1.0:** yes

**Acceptance criteria:**
- Codex, Aider, Zed, Warp, Jules, Devin all read `AGENTS.md` at repo root.
- Adapter ensures repo root `AGENTS.md` has the canonical content; no file moves.
- For "personal scope" outside the repo: writes `~/.agents/AGENTS.md` (best-effort; documented as not all agents respect it).

### 03.02.05 Uninstall path  [ ]
**v1.0:** yes

**Acceptance criteria:**
- `ralphy skill uninstall [--agent <id>]` removes everything the installer placed.
- Re-running install after uninstall produces identical state to a first-install.

---

## 03.03 Description-field discipline

Description is the trigger contract. Bad descriptions fire on wrong utterances and miss right ones.

### 03.03.01 Description length lint  [ ]
**v1.0:** yes

**Acceptance criteria:**
- Lint fails on description > 1536 chars (Claude Code budget cap).
- Warns on description < 80 chars (probably under-specified).

### 03.03.02 Description shape lint  [ ]
**v1.0:** yes

**Acceptance criteria:**
- First sentence must describe the *purpose* (what the skill does).
- Second sentence (or block) must list *trigger phrases* — at least 3 EN + optional RU.
- Lint pattern-matches; failures point at the offending skill.

### 03.03.03 Trigger accuracy eval  [ ]
**v1.0:** yes

**Acceptance criteria:**
- `bun run eval:skill-routing` runs the canonical utterances from `docs/use-cases.md` through a cheap LLM with the skill description list, asks which skill fires, asserts the expected one.
- Pass threshold: ≥ 90% accuracy.
- CI failure on regression.

### 03.03.04 Description authoring guide  [ ]
**v1.0:** yes

**Acceptance criteria:**
- `docs/skills-format.md` includes a "writing a great description" section with do/don't examples.
- Cites the synthetic eval as the feedback loop.

---

## 03.04 `!`-block state preloading

Claude Code SKILL.md supports `` !`<command>` `` blocks that run before the prompt is sent. Use them.

### 03.04.01 Entry skills preload project state  [ ]
**v1.0:** yes

**Acceptance criteria:**
- Each playbook-entry skill (scenarist, art-director, editor, producer, evaluator) starts with a `## Context` block running `!ralphy status`, `!ralphy project show $PROJECT` (if `$PROJECT` is set).
- Output is captured and made available to the agent without an extra tool call.
- Documented limit: only when `disable-model-invocation` is unset and the agent supports `!`-blocks.

### 03.04.02 Fallback for non-Claude-Code agents  [ ]
**v1.0:** yes

**Acceptance criteria:**
- Cursor / Copilot adapters: convert `!`-blocks into a "first action: run this command" inline instruction.
- Documented in the adapter behavior.

---

## 03.05 AGENTS.md routing audit

`AGENTS.md` is the entry point in every agent. Today it's good; lock it.

### 03.05.01 Audit pass before v1.0  [ ]
**v1.0:** yes

**Acceptance criteria:**
- Every row in the routing table points at an existing playbook.
- Every playbook listed has a matching SKILL.md.
- Every hard invariant referenced (#1..#13) is current.
- `bun run lint:agents-md` enforces.

### 03.05.02 `AGENTS.md` includes a "for non-Claude agents" section  [ ]
**v1.0:** yes

**Acceptance criteria:**
- New short section explaining: the routing is a contract; if your agent doesn't have a skill system, read the table and follow it manually.
- Acknowledges Codex / Aider / Zed natively read AGENTS.md.

### 03.05.03 Versioning convention  [ ]
**v1.0:** stretch

**Acceptance criteria:**
- `AGENTS.md` carries a version tag in its frontmatter or header.
- Bumped when the routing table changes; documented in changelog.

---

## 03.06 New-skill scaffolder

When you add a playbook, the skill should follow without manual ceremony.

### 03.06.01 `ralphy skill new <name>`  [ ]
**v1.0:** yes

**Acceptance criteria:**
- Verb scaffolds `.agents/skills/<name>/SKILL.md` from a template with the required frontmatter + section headers.
- Auto-creates a stub at `docs/playbooks/<name>.md` and adds it to the AGENTS.md routing table (interactive: asks for the intent / trigger phrases / row text).
- Lint passes on the resulting skill.

### 03.06.02 Pre-commit hook  [ ]
**v1.0:** stretch

**Acceptance criteria:**
- A git pre-commit hook (opt-in via `bun run hooks:install`) runs `lint:skills` + `lint:agents-md`.

---

## 03.07 Post-launch

### 03.07.01 MCP server  [ ]
**v1.0:** no (owned spec-wise by [`01.01.05`](../01-cli/SPEC.md))

**Acceptance criteria:**
- `ralphy mcp` exposes every CLI verb as an MCP tool. Resources for project artifacts. Prompts for canonical workflows (`make-video`, `analyze-reference`, `evaluate-render`).
- See [`01.01.05`](../01-cli/SPEC.md) for full criteria.

### 03.07.02 Adversarial trigger eval  [ ]
**v1.0:** no

**Acceptance criteria:**
- Synthetic eval includes adversarial utterances (off-topic, ambiguous, near-collision between two skills) and checks for graceful misroute behavior.

### 03.07.03 Skill marketplace  [ ]
**v1.0:** no

**Acceptance criteria:**
- A read-only registry of community-published skills, listable via `ralphy skill discover`.
