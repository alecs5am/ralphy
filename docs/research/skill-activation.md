# Skill activation research — why `.agents/skills/` underfires

**Sprint 0 of `ugc-cli-refocus-2026-05`. Decides Sprint 5 shape.**

## TL;DR

The current `.agents/skills/` setup is **not** Anthropic-style auto-loaded Skills — it is a hand-rolled file-pointer system bound by a routing table inside `CLAUDE.md`. Skills underfire because:

1. The routing table competes with ~280 other lines of `CLAUDE.md` content the model has to keep in head.
2. Skill bodies are 131–485 lines of prose; descriptions are 319–966 chars of crammed-together examples; nothing is optimized for the matching mechanism Claude Code actually uses (eyes-on routing table → `Read` the `SKILL.md` file).
3. There is no `triggers:` field; trigger phrases live inside `description:` mixed with role exposition.
4. Every skill except `remotion-best-practices` is monolithic — no `rules/<topic>.md` decomposition.

**Recommendation: H3 hybrid, refined.** Keep skills as the implementation home, but:
- Extract a thin `AGENTS.md` at repo root that holds *only* the routing table + escalation rules (≤60 lines).
- Slim each `SKILL.md` to ≤80 lines: triggers, sub-task index, pointer to `rules/`.
- Move how-to content to `rules/<topic>.md` per skill (mirror `remotion-best-practices`).
- Trim `CLAUDE.md` to mission + invariants + pointer to `AGENTS.md`.

H1 (tighter triggers in-place) is incomplete — even with perfect descriptions, monolithic bodies still bloat context the moment a skill is read. H2 (drop skills entirely) loses the natural grouping that makes `remotion-best-practices` work.

## Current state — inventory (2026-05-06)

| Skill | SKILL.md lines | description chars | Triggers field? | Modular `rules/`? |
|---|---|---|---|---|
| ralph-art-director | 185 | 629 | no | no |
| ralph-core | 323 | 719 | no | no |
| ralph-editor | 229 | 586 | no | no |
| ralph-producer | 328 | 553 | no | no |
| ralph-researcher | 405 | 966 | no | no |
| ralph-scenarist | 177 | 627 | no | no |
| ralphy-install | 131 | 509 | no | no |
| remotion-best-practices | 61 | 53 | no | **yes (38 files)** |
| skill-creator | 485 | 319 | no | partial (`agents/`, `references/`, `scripts/`) |

`CLAUDE.md`: 328 lines, 17 top-level sections. Routing table is section 1 (lines 5–32) — good visibility — but everything below (Project Structure, Commands, Setup wizard, Dashboard, Env, Skills Pipeline overview, Templates, Project Memory, Profiles, Testing, Conventions, Workspace Layout) is general project context, not routing.

## How activation actually works in this project

There are two different mechanisms at play and they are easy to confuse:

1. **Anthropic Skills auto-loading** (registered via `.claude/skills/<name>/SKILL.md` frontmatter `description:`): Claude Code can match a user utterance against descriptions and surface the skill via the `Skill` tool. This is the lightweight matcher — works best with short, action-oriented descriptions.
2. **Hand-rolled file-pointer routing** (this project): `CLAUDE.md` carries a `Triggers → skills` table and instructs Claude to *Read* the skill file when a trigger matches. The `Skill` tool may or may not be invoked — the actual binding is the model noticing the routing table and choosing to `Read .claude/skills/<name>/SKILL.md`.

Empirically (per user observation), this project relies on mechanism 2, and it underfires because:
- The routing table is one of 17 sections — once the model is mid-conversation, it can drop out of head.
- Trigger phrases are crammed into prose `description:` rather than enumerated, so even when the matcher does try mechanism 1, the signal-to-noise is poor.
- Nothing tells the model that *not* invoking a skill is a failure mode — the routing table is presented as informative rather than imperative.

## Hypotheses tested

### H1 — Tighter triggers, keep monolith
**Change:** rewrite `description:` for each skill as imperative one-liner + 3 example utterances; add explicit `triggers:` array in frontmatter.

**Verdict — partial win, not enough.** Improves mechanism 1 matching, but body is still 131–485 lines. The moment Claude reads the skill, it dumps a paragraph of prose into context where 80 lines of structured pointers would do. No address for the "300-line body" problem.

### H2 — Drop skills, replace with `docs/topics/`
**Change:** delete `.agents/skills/`; move bodies to `docs/topics/<name>.md`; `CLAUDE.md` routing table points to docs by path.

**Verdict — over-corrects.** Loses the one piece that already works: `remotion-best-practices` is a skill *because* the topic decomposition is natural per-role. `rules/<topic>.md` underneath a skill is the right shape; flattening it into `docs/topics/` breaks role boundaries (where does `prompt-style.md` live — `art-director` or `editor`?).

### H3 — Hybrid: thin SKILL.md + per-skill rules/
**Change:**
- Repo root gets `AGENTS.md` (≤60 lines) holding only the routing table, escalation rules, and "always Read SKILL.md before acting".
- Each `SKILL.md` becomes ≤80 lines: short imperative description, `triggers:` array, sub-task index, pointer to `rules/<topic>.md`.
- Per-skill `rules/<topic>.md` files (≤2KB each) hold the actual how-to.
- `CLAUDE.md` slims to mission + invariants (always-bun, always-ralphy, no-runtime-scripts, refusal policy) + single line pointing at `AGENTS.md`.

**Verdict — recommended.** Three independent benefits:
1. Mechanism 1 (auto-match) gets clean descriptions + triggers → better hit-rate.
2. Mechanism 2 (file-pointer) gets a non-buried routing surface (`AGENTS.md`).
3. The body cost of *reading* a skill drops by ~75% because rules are pulled in only for the sub-task at hand.

## Recommendation

**Adopt H3.** Concrete sequencing for Sprint 5:

1. Create `AGENTS.md` first — port the routing table from `CLAUDE.md`, add a top-line directive ("MUST consult this table before any user-task action; failing to route is a defect").
2. Trim `CLAUDE.md` to ≤80 lines: project mission, hard invariants, "see AGENTS.md for routing", "see MODELS.md for models".
3. For each skill in `.agents/skills/`:
   - Replace `description:` with imperative ≤200 chars + 3 example utterances.
   - Add `triggers:` array in frontmatter (≥6 utterance fragments).
   - Move how-to content to `rules/<topic>.md` per the breakdown in the main plan §5.2.
   - SKILL.md becomes a routing index: triggers, sub-task list, rules pointer.
4. Add `bun run scripts/build-full-system-prompt.ts` (Sprint 1.2) baseline measurement; target ≥40% character drop after Sprint 5 with same coverage.

## Out-of-scope

- Live A/B against a fresh chat — high cost, low marginal information. The static analysis above already separates the hypotheses cleanly.
- Forcing every skill into Anthropic auto-loading — this project's routing is already explicit; chasing auto-load adds variance without removing the routing-table dependency.
- Renaming `.agents/skills/` → `.claude/skills/` (or vice-versa) — the symlinks already cover both. No churn needed.

## Decision feed-forward

Sprint 5 should be planned as H3 from the start. Sprint 1 (use-cases doc + system-prompt builder) is unaffected. Sprint 2/3/4/6/7 are unaffected — they touch different surfaces.
