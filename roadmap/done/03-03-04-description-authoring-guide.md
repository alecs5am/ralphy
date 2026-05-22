---
id: 03.03.04
status: done
v1_0: yes
category: 03-skills
topic: "03.03 Description-field discipline"
title: "Description authoring guide"
---

# 03.03.04 — Description authoring guide

**v1.0:** yes — absorbs the length guidance per [D-04](../03-skills/OPEN-QUESTIONS.md#decision-log); refocused per [D-07](../03-skills/OPEN-QUESTIONS.md#decision-log).

**Implementation:** "Writing a great description" section in `docs/skills-format.md` covers (1) the trigger-budget reality (~1500 char soft ceiling, 1536 cap), (2) do/don't framing — first sentence = what, second = when, optional third = what it does NOT do, (3) one good ~300-char example and one bad ~1800-char example to make the comparison tangible.

**Acceptance criteria:**
- `docs/skills-format.md` includes a "writing a great description" section with do/don't examples.
- Frames descriptions as **user-facing summaries** — what the user is invoking this skill for, what it produces, when to reach for it — NOT as auto-route trigger phrase lists.
- One paragraph explicitly describes the Claude Code trigger-budget reality: descriptions are concatenated for slash-command menu rendering and "suggest this skill" surfaces; ~1500 chars is a soft ceiling per skill; over-stuffing makes the menu noisy without helping the user pick. Shows one good (~300-char) and one bad (~1800-char) example.
