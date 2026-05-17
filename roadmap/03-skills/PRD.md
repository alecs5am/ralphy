# 03 — Skills — PRD

## Problem

Ralphy's agent layer is two things stitched together: routing (`AGENTS.md`) and skill bundles (`.agents/skills/<name>/SKILL.md` symlinked from `.claude/skills/`). It works in Claude Code; it half-works elsewhere. Five gaps:

1. **No formal adoption of the agentskills.io standard.** Our skills already have the right frontmatter shape (`name`, `description`), but we haven't declared compliance, haven't enforced it, and we drift slightly from the spec (e.g., we sometimes use multi-paragraph descriptions where the spec wants one line).
2. **Cross-agent portability is hand-rolled.** Users on Cursor get our skills only if they manually adapt them to `.cursor/rules/*.mdc`. Copilot users need `.github/instructions/`. Codex / Aider / Zed / Warp all read `AGENTS.md` natively but ignore our `.agents/skills/`. There's no generator.
3. **The `ralphy skill install` verb is unbuilt** (see [`01.01.06`](../01-cli/SPEC.md)). It's the bridge from "skills exist in this repo" to "skills live in my agent's config dir".
4. **Description fields aren't optimized for the trigger budget.** Claude Code allots ~1% of context for skill discovery — our descriptions vary from 100 to 800+ chars without intent. Bigger isn't better; specific is better.
5. **No `!`-block usage for state pre-loading.** Claude Code skills can run shell commands inline before the prompt is sent. We could pre-load `ralphy status`, `ralphy project show <id>`, gen-log summaries — saving the agent a round trip on every skill invocation. We don't.

This category owns the agent-side surface: how Ralphy presents itself as a skill bundle, how it portably installs into other agents, and how `AGENTS.md` evolves.

## Users

| User | Need |
|---|---|
| **Claude Code user** | Skills install with one verb, route deterministically, pre-load relevant state. |
| **Cursor / Copilot / Codex user** | The same routing they would get on Claude Code, expressed in their agent's native format. |
| **Skill author** | A schema-validated skill format; a way to test a skill's trigger accuracy. |
| **Repo contributor** | When I add a new playbook in `docs/playbooks/`, a matching skill stub gets generated and the router (`AGENTS.md`) gets updated. |

## User stories

1. As a **Claude Code user**, I run `ralphy skill install` in any directory; it detects Claude Code, installs the skill bundle under `~/.claude/skills/`, and `claude` immediately routes the next "make me a video" through Ralphy's playbook.
2. As a **Cursor user**, I run `ralphy skill install --agent cursor`; the verb writes `.cursor/rules/ralphy-router.mdc` (`alwaysApply: true`) + one `.mdc` per playbook with `description` set for agent-requested mode.
3. As a **Copilot user**, same verb installs `.github/copilot-instructions.md` (the router) + `.github/instructions/<playbook>.instructions.md` files with `applyTo: '**'`.
4. As a **skill author**, when I edit a SKILL.md description, a CI lint validates length (≤ 1536 chars), tone ("starts with use case, then triggers"), and a small synthetic test that asks "what does this skill do?" to a cheap model and checks the answer matches my intent.
5. As an **agent picking up a task**, a skill I invoke pre-loads project state via `!`-blocks — I don't waste a tool call on `ralphy status`.
6. As a **repo contributor**, when I add `docs/playbooks/new-role.md`, a hook creates `.agents/skills/new-role/SKILL.md` with the conventional frontmatter and links it from `AGENTS.md`.
7. As an **agent on a non-Claude platform**, the absence of MCP doesn't hurt me — the CLI + the SKILL.md + AGENTS.md combo gives me the same surface.

## Success metrics

| Metric | Target at v1.0 | How we measure |
|---|---|---|
| `ralphy skill install` works on Claude Code, Cursor, Copilot, Codex | 4/4 | Manual run per target |
| Skill description length compliance | ≤ 1536 chars, 100% | Lint |
| Trigger accuracy on canonical utterances | ≥ 90% match playbook from `docs/use-cases.md` | Synthetic eval |
| Playbooks with paired SKILL.md | 100% | Grep |
| Skill bundle install/uninstall round-trip | 0 stray files | Smoke |
| Cross-agent generator outputs validated by each agent's loader | Yes | Smoke |
| `!`-block pre-loading used in ≥ 50% of playbook entry skills | Yes | Skill audit |
| MCP server shipped | No (deferred) | Roadmap entry, owned by [`01.01.05`](../01-cli/) |

## Non-goals

- **Building an MCP server for v1.0.** Documented in research; deferred to v1.1+. The CLI + skill bundle covers every agent today.
- **A skill marketplace / discovery service.** Out of scope.
- **Auto-update of installed skills.** Users re-run `ralphy skill install` on `ralphy upgrade`.
- **Skill-internal tool definitions beyond `ralphy ...` CLI calls.** Skills shell out to `ralphy`; they don't define their own external API tools.
- **The Skill *contents*** in the sense of "what each playbook says". That belongs to the respective category playbook docs (`docs/playbooks/`). This category owns the *system*: format, install, route, validate.

## v1.0 cut

**Must ship:**

- `03.01` — Skill format declared as agentskills.io-compliant; lint enforces
- `03.02` — `ralphy skill install` covering Claude Code, Cursor, Copilot, Codex (cross-link [`01.01.06`](../01-cli/SPEC.md))
- `03.03` — Description-field discipline (≤ 1536 chars; trigger-accuracy eval)
- `03.04` — `!`-block state preloading in playbook entry skills
- `03.05` — `AGENTS.md` audited; routing table 1:1 with skills
- `03.06` — New-playbook scaffolding flow (`ralphy skill new <name>`)

**Post-launch:**

- `03.07` — MCP server (`ralphy mcp`) implementation
- `03.08` — Skill testing harness with adversarial-prompt eval
- `03.09` — Skill marketplace / discovery
- `03.10` — Agent-specific skill optimization (per-agent prompt tweaks)
