# `05-workflow-fixes.template.md` — playbook & workflow corrections

The meta doc. Where did our *process* break, and which playbook / doc needs editing so the next session doesn't re-hit the same wall?

## What lives here vs. 03-cli-issues.md

- **03 = code fix.** Add a new ralphy verb. Repair a broken command. Touch `cli/`.
- **05 = doc fix.** Add a hard rule to AGENTS.md. Fix a misleading line in `docs/playbooks/<role>.md`. Touch `docs/`, `AGENTS.md`, `CLAUDE.md`, or `MODELS.md`.

The same incident often produces a row in both — that's fine. Cross-link explicitly: "see 03-cli-issues.md#<n>".

## Template

```markdown
# Workflow & playbook fixes — <project-id> session <YYYY-MM-DD>

Where the playbook misled us, where it was silent, and where the workflow itself needs restructuring. Every row is a candidate PR against `docs/`, `AGENTS.md`, or `CLAUDE.md`.

## Summary

- **Total fix rows:** <N>
- **By target file:**
  - `AGENTS.md`: <n>
  - `docs/playbooks/<role>.md`: <n>
  - `MODELS.md`: <n>
  - `CLAUDE.md`: <n>
  - **New playbook section needed:** <n>
- **Append-only violations this session:** <Y> — see 01-chat-history.md append-only audit

## Fix rows

For each fix, fill this structure:

### #1 — <one-line headline>

- **Target file:** `<exact path>` (e.g. `docs/playbooks/art-director/regeneration.md`)
- **Target line / section:** L<N> or `## Single-slot regen`
- **Triggered at:** [01-chat-history.md#turn-N]
- **What the playbook says today (verbatim):** > <quote>
- **Why it misled the agent:** <1-2 sentences explaining the failure mode>
- **What it should say instead:** > <proposed new text, verbatim>
- **Severity:** P0 (blocks future sessions) | P1 (cost money) | P2 (cosmetic)
- **Linked CLI issues:** see 03-cli-issues.md#<n>

### #2 — <next fix>

...

## Workflow-level findings (not tied to a single line)

Higher-level patterns — when no single playbook edit fixes it, but the *workflow* itself is wrong.

### Finding A — <headline>

**Pattern observed:** <2-3 sentences describing what kept going wrong across multiple turns>

**Evidence:** turns N, N+M, N+M+K — all hit the same wall.

**Root cause hypothesis:** <what's structurally missing — a role handoff, a checkpoint, a routing rule>

**Proposed structural fix:**
- <bullet — a new section in AGENTS.md>
- <bullet — a new sub-doc under docs/playbooks/>
- <bullet — a new ralphy verb that would force the right shape>

### Finding B — <headline>

...

## Append-only violations seen this session

A table linking back to `01-chat-history.md`'s end-of-session audit. Each row is a P0 fix — append-only is a hard invariant.

| Artifact deleted/overwritten | Turn | What triggered it | How to prevent | Linked fix |
|---|---|---|---|---|
| `assets/videos/scene-03.mp4` | 14 | "регенерируй scene-03" — agent overwrote instead of writing `.v2.` | Change `art-director/regeneration.md` L14 to mandate `.vN.ext` (already done in this PR? mark ✅) | #<n> above |
| ... | ... | ... | ... | ... |

## Suggested doc PRs (extracted from fix rows)

Top-N edits, ranked by how often they'd save a future session:

1. **`<file>`**: <one-line description>. Rows: #<a>, #<b>. Severity: P0.
2. **`<file>`**: ... Rows: #<c>. Severity: P1.
3. ...

## Skills & sub-agents that should have fired but didn't (or fired wrong)

If the routing in AGENTS.md sent the agent to the wrong playbook, or a useful skill (`ralph-evaluator`, `ralph-researcher`, etc.) didn't trigger when it should have — log it here.

| Should have fired | Actually fired (or didn't) | Trigger that was missing | Fix |
|---|---|---|---|
| `ralph-evaluator` after `ralphy render` | did not fire | description doesn't match "ну как, ок?" — needs Russian trigger | Add Russian phrases to ralph-evaluator description |
| ... | ... | ... | ... |

---

*Written <YYYY-MM-DD>. Each fix row above should become a doc PR. Open them via `gh pr create` against `main` with the row body as the PR body.*
```

---

## Filling guidance

- **Quote the playbook verbatim.** "the playbook said something like..." is useless. Open the file, paste the line.
- **Severity matters.** P0 = the same agent will fail in the same way on the next session. P2 = cosmetic.
- **Workflow-level findings are the highest-leverage section.** A single P0 finding here often reshapes 3-4 individual line edits. Don't skip it because it's harder to write.
- **Append-only violations are always P0.** Every row in the violations table maps to a fix row above with severity P0.
- **Skills section is for routing.** If you (the agent) ended up in the right place but only after a confusing detour, the description needs more triggers. This is where `skill-creator` would be invoked next.

## Iteration N addendum

```markdown
---

## Iteration N — <YYYY-MM-DD>

### Status updates on prior fixes

| Fix # from iteration <N-1> | Status as of this iteration |
|---|---|
| #3 (art-director regen language) | ✅ merged in commit `<sha>` |
| #5 (new `ralphy project clean` verb) | ⏳ still open |

### New fixes from iteration N

<numbered rows continuing from prior iteration's last fix>

### Recurrence flags

If iteration N hit a problem already documented in iteration <N-1> as fixed — flag it loudly here. The fix didn't take.
```
