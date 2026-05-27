---
id: 03.06.01
status: done
v1_0: yes
category: 03-skills
topic: "03.06 New-skill scaffolder"
title: "ralphy skill new <name>"
---

# 03.06.01 — `ralphy skill new <name>`

**v1.0:** yes

**Implementation:** `cli/commands/skill.ts → newCmd` + `cli/lib/skill/scaffold.ts`. Scaffolds `.agents/skills/<name>/SKILL.md` with valid frontmatter (`name`, `namespace`, `description`) + section stubs (`## Trigger`, `## Hard invariants`, `## Workflow`, `## Outputs`, `## Cookbook`), and `docs/playbooks/<name>.md` with an intent + trigger summary. `--add-to-routing` inserts a sentinel-bounded row into AGENTS.md (idempotent on re-run). Clack prompts for intent / triggers / row text on TTY; `--non-interactive` plus `--intent` + `--trigger` flags skip the prompts (CI path). Refuses non-kebab-case names (`E_INPUT_INVALID`) and pre-existing skill folders (`E_ALREADY_EXISTS`). Integration tests in `tests/integration/cli-skill-new.test.ts`.

**Acceptance criteria:**
- Verb scaffolds `.agents/skills/<name>/SKILL.md` from a template with the required frontmatter + section headers.
- Auto-creates a stub at `docs/playbooks/<name>.md` and adds it to the AGENTS.md routing table (interactive: asks for the intent / trigger phrases / row text).
- Lint passes on the resulting skill.
