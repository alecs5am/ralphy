---
id: 02.02.01
status: todo
v1_0: no
category: 02-prompts-and-templates
topic: "02.02 Reference grammar"
title: "CLI flags --cref, --sref, --pref"
---

# 02.02.01 — CLI flags `--cref`, `--sref`, `--pref`

**v1.0:** no — deferred per [D-02](../02-prompts-and-templates/OPEN-QUESTIONS.md#decision-log). Stays in `02.02.01` (post-launch).

**Acceptance criteria:** (post-launch)
- `ralphy generate {image|video} --cref <character.png> --sref <style.png> --pref <product.png>`.
- All three accept URL / local path / data-URI.
- Each can be repeated (`--cref a.png --cref b.png` for multi-ref consistency).
- Legacy `--ref` stays as a synonym for `--cref` (the most common single-ref use), continuing to work after the 3-slot grammar ships.
