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

### 03.01.04 Two-namespace skill split: `ralphy:` (user) vs `ralphy-dev:` (maintainer)  [ ]
**v1.0:** yes

**Acceptance criteria:**
- Repo `.agents/skills/` is reorganized into two top-level groups so slash commands surface as `/ralphy:<skill>` for end-users and `/ralphy-dev:<skill>` for maintainer-only flows. Mechanism: either nested directories (`.agents/skills/ralphy/<skill>/SKILL.md` + `.agents/skills/ralphy-dev/<skill>/SKILL.md`) or a `namespace: ralphy | ralphy-dev` frontmatter field consumed by the install wizard — implementation chooses whichever Claude Code's slash-prefix rendering supports cleanly.
- Initial classification:
  - **`ralphy:`** (user-invokable): `postmortem`, `ralph-evaluator` → `evaluator`, `ralph-researcher` → `researcher`, `ralph-templater` → `templater`, `ralphy-install` → `install` (the skill names lose the redundant `ralph-` / `ralphy-` prefix because the namespace prefix already says it).
  - **`ralphy-dev:`** (maintainer-only): `release`, `remotion-best-practices`, `skill-creator`.
- `ralphy skill install` (the wizard from `03.02.06`) installs only the `ralphy:` namespace by default. `ralphy skill install --dev` (or auto-detect when running inside the `alecs5am/ugc-cli` checkout) additionally installs the `ralphy-dev:` namespace.
- Rename / symlink migration is captured in a small migration note (no breakage for existing maintainer-side usage of `/release` — old slash names alias to the new namespaced names for one release cycle, then drop).
- README + Mintlify quickstart reference only `ralphy:` slash commands. The `ralphy-dev:` namespace is documented in `CONTRIBUTING.md` / `docs/dev-skills.md`, not in the public quickstart.

**Notes:** rationale — keeps the user-facing slash menu uncluttered (a tester typing `/` shouldn't see `/release` and wonder if it ships their project; that's a maintainer-only operation on the ralphy binary itself). The split also lets us evolve the maintainer skill set freely without affecting the user-facing surface contract.

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
- For files written under sentinels (per [D-02](OPEN-QUESTIONS.md#decision-log)), uninstall strips the block and leaves the surrounding file content untouched.
- Re-running install after uninstall produces identical state to a first-install.

### 03.02.06 Interactive wizard + config persistence  [ ]
**v1.0:** yes — per [D-03](OPEN-QUESTIONS.md#decision-log).

**Acceptance criteria:**
- On the first `ralphy skill install` (and as a sub-step of `ralphy setup` per `01.04.02`), launch an interactive wizard:
  1. Detect installed agents by probing for `~/.claude/`, `~/.cursor/`, `~/.codex/`, repo-root `AGENTS.md`, `.github/copilot-instructions.md`.
  2. Multi-select prompt: "install Ralphy skill bundle for: [x] claude [x] cursor [ ] codex" (defaults to detected set, can be edited).
  3. Per agent where ambiguity exists, ask scope: "user (works in every project, recommended) or project (this checkout only)?" Default = `user`. Codex is forced project-scope (AGENTS.md is repo-root).
- Persist to `~/.ralphy/config.json`: `skill.installedAgents` (list of agent ids), `skill.installScope` (`user` | `project`), `skill.installDevNamespace` (`true` | `false`, default `false` — installs `ralphy-dev:*` only when explicitly opted in or auto-detected via `ugc-cli` checkout, per `03.01.04`), `skill.wizardCompletedAt` (timestamp). The wizard does NOT prompt for `--symlink` vs `--copy` — that's auto-detected per [D-01](OPEN-QUESTIONS.md#decision-log).
- Subsequent `ralphy skill install` runs read the config and reinstall non-interactively against the persisted target set.
- `ralphy skill install --reconfigure` re-launches the wizard. `--agent <id> --scope <s>` bypasses the wizard entirely (CI / power users).
- The wizard inherits the CLI's pretty/JSON contract — TTY = interactive; `--json` or piped = wizard refuses and errors with `E_WIZARD_NEEDS_TTY` + hint to pass explicit flags.

**Notes:** modelled on Remotion's `npx create-video@latest` "Say yes to install Skills" flow.

---

## 03.03 Description-field discipline

Description is the trigger contract. Bad descriptions fire on wrong utterances and miss right ones.

### 03.03.01 Description length lint  [x] (cancelled — D-04)
**v1.0:** no

**Resolution (2026-05-20):** No automated lint per [D-04](OPEN-QUESTIONS.md#decision-log). Length guidance moves into `03.03.04` author guide; revisit as `03.07.04` if real trigger drift surfaces.

### 03.03.02 Description shape lint  [ ]
**v1.0:** no — downgraded per [D-04](OPEN-QUESTIONS.md#decision-log). Re-evaluate during v0.3 scope review only if drift surfaces from outside contributors.

**Acceptance criteria:** (post-launch)
- First sentence must describe the *purpose* (what the skill does).
- Second sentence (or block) must list *trigger phrases* — at least 3 EN + optional RU.
- Lint pattern-matches; failures point at the offending skill.

### 03.03.03 Trigger accuracy eval  [x] (cancelled — D-07)
**v1.0:** no

**Resolution (2026-05-20):** Cancelled per [D-07](OPEN-QUESTIONS.md#decision-log). Skills are user-invokable techniques (`/postmortem`, `/release`, etc.) — they fire on explicit user invocation, not on auto-routed natural language. The natural-language routing surface is AGENTS.md (`03.05.01` covers its audit). A trigger-accuracy eval optimizes for a use case we've chosen not to rely on.

### 03.03.04 Description authoring guide  [ ]
**v1.0:** yes — absorbs the length guidance per [D-04](OPEN-QUESTIONS.md#decision-log); refocused per [D-07](OPEN-QUESTIONS.md#decision-log).

**Acceptance criteria:**
- `docs/skills-format.md` includes a "writing a great description" section with do/don't examples.
- Frames descriptions as **user-facing summaries** — what the user is invoking this skill for, what it produces, when to reach for it — NOT as auto-route trigger phrase lists.
- One paragraph explicitly describes the Claude Code trigger-budget reality: descriptions are concatenated for slash-command menu rendering and "suggest this skill" surfaces; ~1500 chars is a soft ceiling per skill; over-stuffing makes the menu noisy without helping the user pick. Shows one good (~300-char) and one bad (~1800-char) example.

---

## 03.04 `!`-block state preloading

Decided NOT to ship per [D-05](OPEN-QUESTIONS.md#decision-log). Topic kept for traceability — agent decides per-invocation what state to fetch via `ralphy <verb>` tool calls; the baseline preload (`ralphy whoami` / `ralphy status` on session start) lives in `AGENTS.md` step 0, not inside individual SKILL.md files.

### 03.04.01 Entry skills preload project state  [x] (cancelled — D-05)
**v1.0:** no

**Resolution (2026-05-20):** No structured `!`-block preloading per [D-05](OPEN-QUESTIONS.md#decision-log). Baseline preload covered by `AGENTS.md` step 0; finer-grained state is the agent's call per invocation.

### 03.04.02 Fallback for non-Claude-Code agents  [x] (cancelled — D-05)
**v1.0:** no

**Resolution (2026-05-20):** Cancelled as a downstream of `03.04.01` — no fallback needed when the source mechanic is dropped.

---

## 03.05 AGENTS.md routing audit

`AGENTS.md` is the entry point in every agent. Today it's good; lock it.

### 03.05.01 Audit pass before v1.0  [ ]
**v1.0:** yes

**Acceptance criteria:**
- AGENTS.md is the **source of truth** for routing per [D-06](OPEN-QUESTIONS.md#decision-log); CLAUDE.md is a Claude-Code-specific consumer (`@`-imports AGENTS.md, may add Claude-flavored personal context but no routing rules).
- Every row in the AGENTS.md routing table points at an existing playbook.
- Every playbook listed has a matching SKILL.md.
- Every hard invariant referenced (#1..#13) is current.
- `bun run lint:agents-md` enforces: AGENTS.md has no Claude-isms (no `~/.claude/` paths, no `claude mcp add` references in the routing table); CLAUDE.md contains no routing rules not also present in AGENTS.md.

### 03.05.02 `AGENTS.md` is multi-agent by default  [x] (folded into 03.05.01 — D-06)
**v1.0:** no

**Resolution (2026-05-20):** Per [D-06](OPEN-QUESTIONS.md#decision-log), AGENTS.md is canonical for every agent — Codex, OpenCode, Aider, and Cursor (via the adapter) all consume it natively or via pointer. No separate "for non-Claude agents" subsection needed; the file's existence + content already targets the multi-agent audience.

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

### 03.07.04 Reintroduce description-length lint  [ ]
**v1.0:** no — trigger condition only.

**Acceptance criteria:**
- Reopen when external contributors start adding skills and review-on-PR can't catch description drift, OR when a real "skill stopped triggering" bug is traced to an over-budget description.
- At that point, ship: lint script that walks `.agents/skills/*/SKILL.md`, parses frontmatter, flags description > 1536 chars; CI required check; one-line fix-it hint pointing at `docs/skills-format.md`.

**Notes:** parked per [D-04](OPEN-QUESTIONS.md#decision-log). Today (v0.x) the description guidance lives in the author guide only.
