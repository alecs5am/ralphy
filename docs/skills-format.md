# Skills format — SKILL.md authoring guide

Ralphy ships its agent-routing intelligence as a bundle of **skills**: one folder
per skill under `.agents/skills/<name>/`, each containing a single `SKILL.md`
that follows the [agentskills.io](https://agentskills.io) convention. This guide
documents the format end-to-end so a new contributor can add a skill that
lints, installs, and renders cleanly across every supported agent (Claude
Code, Cursor, Codex, Copilot).

> **TL;DR.** A SKILL.md is YAML frontmatter + a Markdown body. The
> frontmatter is the trigger contract (Claude Code uses `description` to render
> the slash-command menu and the "suggest this skill" surface). The body is the
> playbook — what the agent reads after the user invokes the skill.

## Where skills live

```
.agents/skills/
  ├── ralph-evaluator/
  │   └── SKILL.md
  ├── ralph-researcher/
  │   └── SKILL.md
  └── …
```

One folder per skill. The folder name **must** match the `name:` field in the
frontmatter (the lint enforces this). Each skill gets its own folder so the
installer can drop in scripts, templates, or worked examples as siblings
without polluting the bundle.

## Frontmatter contract

```yaml
---
name: ralph-evaluator        # required, kebab-case, matches folder name
namespace: ralphy            # optional, "ralphy" (user) or "ralphy-dev" (maintainer)
description: >-              # required, ≤ 1536 chars (agentskills.io cap)
  Quality evaluation of rendered UGC mp4s — scene segmentation, audio loudness,
  caption density, and per-scene visual analysis. Produces an actionable report.
  USE WHEN the user asks to "evaluate / grade / QA" a rendered video.
when_to_use: post-render     # optional, free-form tag
allowed-tools:               # optional, allowlist of tools the skill needs
  - Read
  - Bash
disable-model-invocation: false  # optional, skip the model on dry runs
paths:                       # optional, files the skill commonly touches
  - workspace/projects/<id>/render/
context: render-review       # optional, used by suggestion surfaces
argument-hint: <mp4-path>    # optional, shown in slash-command menus
arguments: [path]            # optional, schema for positional args
---
```

### Required fields

| Field         | Validation                                                  |
| ------------- | ----------------------------------------------------------- |
| `name`        | kebab-case (`^[a-z][a-z0-9-]*$`), matches the folder name   |
| `description` | one paragraph, **≤ 1536 chars** (agentskills.io hard cap)   |

### Optional fields

| Field                      | Purpose                                                                                  |
| -------------------------- | ---------------------------------------------------------------------------------------- |
| `namespace`                | `ralphy` (user-invokable) or `ralphy-dev` (maintainer-only). Drives the install wizard.  |
| `when_to_use`              | Free-form tag for downstream filtering (e.g. `post-render`, `pre-flight`).                |
| `allowed-tools`            | Allowlist of tools the skill is allowed to call.                                          |
| `disable-model-invocation` | When `true`, the skill is documentation-only — never spawns a model call.                 |
| `paths`                    | Glob-or-path hints for workspace files the skill touches.                                 |
| `context`                  | Free-form label used by "suggest this skill" surfaces.                                    |
| `argument-hint`            | Shown next to the slash command in Claude Code's menu.                                    |
| `arguments`                | Positional-argument schema; consumed by future MCP exposure.                              |

> **Namespace split.** Skills marked `namespace: ralphy` are user-facing
> (`/ralphy:postmortem`, `/ralphy:researcher`). Skills marked
> `namespace: ralphy-dev` are maintainer-only (`/ralphy-dev:release`,
> `/ralphy-dev:remotion-best-practices`). `ralphy skill install` installs only
> `ralphy:` by default; `--dev` opts into the maintainer set.

## Body structure

The body follows a conventional section order. The lint **warns** (not errors)
when sections are missing — some skills are intentionally minimal — but every
non-trivial skill should hit each section:

```markdown
# <Skill display name>

## Trigger
When this skill fires. Match the description's `USE WHEN` to keep the
explicit / implicit triggers aligned.

## Hard invariants
Must-do / must-not lines, one bullet each. Concrete and refusable.

## Workflow
Numbered, step-by-step. Each step names the exact `ralphy <verb>` call.

## Outputs
What the user sees on success and what gets written to disk.

## Cookbook
Concrete worked examples. EN + RU phrasing of triggers, sample invocations,
common failure modes.
```

## Writing a great description

The `description` field is the **user-facing summary** of the skill, not an
auto-route trigger phrase list. Claude Code renders it in the slash-command
menu (`/ralphy:<skill>`), the "suggest this skill" surface, and the
description-only `ralphy skill list` output. A scannable, accurate paragraph
serves the user better than a wall of synonyms.

### The trigger-budget reality

Claude Code budgets roughly 1% of its context window for skill discovery
across every installed skill. Descriptions are concatenated for menu rendering
and "suggest this skill" surfaces; **~1500 chars is a soft ceiling per skill**
(the agentskills.io hard cap is 1536; over-stuffing makes the menu noisy
without helping the user pick). Two skills with bloated descriptions push
sibling skills out of the budget; the agent silently stops suggesting them.

### Do / don't

**Do.** Describe (1) what the skill does, (2) what artifact it produces, and
(3) when the user reaches for it. Lead with the verb. Skip synonym lists. Skip
keyword stuffing.

```
✓ Good (~300 chars)

Quality evaluation of rendered UGC mp4s — scene segmentation, audio loudness,
caption density, per-scene visual analysis. Produces eval.json + eval-report.md
sized for a downstream fixer agent. Use after `ralphy render` when you want
verification before publishing.
```

**Don't.** Cram every trigger phrase, every synonym, every example utterance.
This is the failure mode that pushes the description toward the 1536-char cap
without making the user's pick easier.

```
✗ Bad (~1800 chars, truncated by the agentskills.io cap)

Quality evaluation, scoring, grading, reviewing, auditing, checking,
inspecting, analyzing, verifying, validating, QA-ing, assessing of rendered
UGC mp4s — scene segmentation, audio loudness, dead-air detection, caption
density, frame analysis, per-scene visual analysis, retention check, scroll-
stop check, hook strength check, virality rubric scoring, quality gate
analysis, post-render quality gate verification, ready-to-ship readiness
analysis, publish-readiness check… USE WHEN the user asks to "evaluate this
video", "score the render", "grade the mp4", "review the final cut", "QA this
video", "is this ready to ship", "what's wrong with this video", "find issues
in <path.mp4>", "audit the video", "scene-by-scene breakdown", "retention
check", "quality gate", "оцени", "оцени рендер", "проверь видео", "что не так
с видео", "найди косяки", "разбор рендера", "готово к публикации", "финальный
аудит", "оценка качества"…
```

The bad example happens when descriptions get treated as a search index. The
good example happens when descriptions get treated as a menu item the user is
choosing among.

### Structure that works

A description is one paragraph, optionally broken into "what / when" sentences:

1. **First sentence.** What the skill does + what it produces.
2. **Second sentence.** When the user reaches for it.
3. **(Optional) Third sentence.** What it does *not* do — the closest
   adjacent skill the user might confuse it with.

If you need to spell out trigger phrases for routing fidelity, put them in
the body's `## Trigger` section. The body is where the agent looks once the
skill fires; the description is where the user looks before invoking it.

## Two namespaces

Ralphy ships skills in two namespaces (per
[03.01.04](../roadmap/03-skills/SPEC.md#030104-two-namespace-skill-split-ralphy-user-vs-ralphy-dev-maintainer)):

| Namespace    | Audience                | Examples                                       |
| ------------ | ----------------------- | ---------------------------------------------- |
| `ralphy`     | end users               | `postmortem`, `ralph-evaluator`, `ralph-researcher`, `ralph-templater`, `ralphy-install` |
| `ralphy-dev` | maintainers / contributors | `release`, `remotion-best-practices`, `skill-creator` |

A skill in `ralphy-dev` ships through the same lint + installer plumbing as
`ralphy`. The install wizard hides them by default so a tester running
`/<TAB>` on a fresh `ralphy skill install` doesn't see `/release` (which
ships the binary, not the user's project).

## Lint

```bash
bun run lint:skills
```

The lint walks `.agents/skills/*/SKILL.md` and checks:

- Frontmatter parses (`---` … `---` block with valid YAML).
- `name` is kebab-case and matches the folder name.
- `description` exists and is ≤ 1536 chars.
- (Optional) `namespace` is one of `ralphy` / `ralphy-dev`.
- (Warning) Body has `##` section headings.

CI runs `lint:skills` on every PR. A failing lint blocks merge.

## See also

- [agentskills.io](https://agentskills.io) — the upstream spec ralphy follows verbatim.
- [`scripts/lint-skills.ts`](../scripts/lint-skills.ts) — the lint source.
- [`cli/lib/skill/installer.ts`](../cli/lib/skill/installer.ts) — the cross-agent installer.
- [`AGENTS.md`](../AGENTS.md) — the routing table every skill ultimately points back to.
- [`roadmap/03-skills/SPEC.md`](../roadmap/03-skills/SPEC.md) — the canonical scope + decision log.
