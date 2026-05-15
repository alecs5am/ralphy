# `00-INDEX.template.md` — postmortem index

The cover page. ~30-60 lines. Skimmable in 60 seconds.

---

```markdown
# Postmortem — <project-id>

End-to-end record of `<project-id>` (<project-name>). Split into 5 substantive docs so each can be skimmed by the right reader.

**Session:** <YYYY-MM-DD> · <duration estimate, e.g. "~3h, 4 iteration cycles">
**Final spend:** ~$<total> (image $A · video $B · music $C · VO $D · render free)
**Final winner:** `render/<filename.mp4>` (<one-line note: variant, why>)
**Iterations vs. minimum-viable:** ~<N>× over (could have been <M>× with discipline below)

## The 5 docs

| File | What's in it | Who reads it |
|---|---|---|
| [01-chat-history.md](01-chat-history.md) | Chronological replay of every user turn + agent step | The user, to verify "did the agent do what I asked" |
| [02-lessons.md](02-lessons.md) | Rules learned the hard way, pipeline-from-scratch, prompt patterns, composition tricks | Future-me on the next similar project |
| [03-cli-issues.md](03-cli-issues.md) | ralphy verbs that failed or didn't exist + raw workaround used + suggested CLI fix | The CLI maintainer (turn each row into a GitHub issue) |
| [04-models-and-cost.md](04-models-and-cost.md) | $ rollup by phase, model picks, discovered model breakage | Anyone scoping a similar project |
| [05-workflow-fixes.md](05-workflow-fixes.md) | Where the playbook misled us, what to add to AGENTS.md / docs/playbooks/ | The playbook author (turn each row into a doc PR) |

## TL;DR — 3 things this session taught us

1. <one-sentence headline rule from 02-lessons.md, the single most important one>
2. <one-sentence CLI gap from 03-cli-issues.md, the highest-leverage missing verb>
3. <one-sentence workflow fix from 05-workflow-fixes.md, the playbook section that misled us most>

## Next-time win

If a fresh agent ran the same brief tomorrow, the one paragraph in `02-lessons.md` that would save ~$<X> and ~<N> iterations: **<rule headline>**. See [02-lessons.md#rule-<n>](02-lessons.md).

## Legacy single-file postmortem

<Only include this section if `../POSTMORTEM.md` exists from a pre-multidoc session.>

A v1 single-file postmortem from an earlier session lives at [`../POSTMORTEM.md`](../POSTMORTEM.md). It is **not migrated** — read it directly if you need pre-<YYYY-MM-DD> context.

---

*Written <YYYY-MM-DD>. See each doc for per-iteration addenda.*
```

---

## Filling guidance

- **TL;DR — 3 things** is the elevator pitch. If the reader bounces after 30 seconds, those 3 sentences are all they got.
- The 5-row table is a contract — every link must resolve, every "who reads it" must be true.
- **Legacy single-file postmortem** section: only include if the file actually exists. Don't fabricate a link.
- Update the index on every addendum run — bump the iteration count in the header and add a short "iteration N added <date>" note at the bottom.
