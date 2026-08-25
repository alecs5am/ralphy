# Playbooks index

What is left here is the material that is not owned by any one role: the phase contract every
content request runs, the per-mode quality floors, and the Unit lifecycle. The role playbooks
(`researcher`, `scenarist`, `art-director`, `editor`, `producer`, `core`, `intake`,
`personal-clipper`, `ralphy-install`, `hyperframes`) moved to `.agents/skills/<slug>/` — a role is
an executable skill with its own trigger vocabulary, not a doc the router has to name by hand.

| Playbook | When the agent should read it |
|---|---|
| [agent-production-contract.md](agent-production-contract.md) | **The canonical chat-to-render phase sequence.** Read for ANY "make content" request — it is the source of truth the role skills execute slices of (intake → mode → match → memory → ref gate → style lock → plan → scenario → prompts → assets → render → eval → repair → unit → postmortem). |
| [unit-lifecycle.md](unit-lifecycle.md) | The full chat-request-to-packaged-Unit path: every phase, its required artifact, its stop conditions, and the resume model. |
| [modes/README.md](modes/README.md) | **Mode-level quality playbooks (#417).** Read the matching `modes/<mode>.md` BEFORE drafting prompts for a supported content mode that has no register guideline — sets the quality floor (objective · inputs · refs · prompt spine · model picks · failure modes · eval · negative scope). |
| [meta.md](meta.md) | Maintainer-only: how to write and revise the docs in this tree. |

## How it fits together

- **`CLAUDE.md`** is the bootstrap. Hard rule: read the matched route fully before acting — do not improvise.
- **`AGENTS.md`** is the base context: positioning, the discipline, where data lives, the base routing table, the skill index, and the hard invariants. It is `@`-imported into the system prompt, so it is always loaded.
- **Skills (`.agents/skills/<slug>/`)** carry the HOW. `SKILL.md` is the body, `references/` is what it reads on demand, `scripts/` is what it runs. Frontmatter `description` carries the trigger vocabulary the router matches against; every skill is invocable as `/<slug>`.
- **These playbooks** carry what spans roles. They have no frontmatter and no slash-command; the contract is read by whichever skill is executing a phase.
