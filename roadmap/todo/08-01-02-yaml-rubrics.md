---
id: 08.01.02
status: todo
v1_0: yes
category: 08-quality-and-evaluation
topic: "08.01 `cli/lib/eval/` refactor"
title: "YAML rubrics"
---

# 08.01.02 — YAML rubrics

**v1.0:** yes

**Acceptance criteria:**
- Default rubrics ship at `cli/lib/eval/rubrics/{scenario,image,video,hook,caption,audio}.yaml`.
- Each rubric declares: `id`, `version`, `threshold`, `hard_fail_dimensions: []`, `dimensions: []` with weight + kind + criteria.
- Version-bumped on every rubric change; recorded in `Verdict.rubric` as `<id>@v<version>`.
