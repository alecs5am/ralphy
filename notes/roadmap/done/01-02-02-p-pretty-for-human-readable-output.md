---
id: 01.02.02
status: done
v1_0: yes
category: 01-cli
topic: "01.02 Output contract uniformity"
title: "-p / --pretty for human-readable output"
---

# 01.02.02 — `-p` / `--pretty` for human-readable output

**v1.0:** yes

**Acceptance criteria:**
- Every verb supports `-p` / `--pretty` and produces colored, readable output (tables / panels / progress bars).
- Pretty output is documented as **never machine-parseable** — agents must use `--json` or pipe to capture JSON.
- On TTY without `--json`, every verb defaults to pretty per [D-02](../01-cli/OPEN-QUESTIONS.md#decision-log). `-p` is a no-op on TTY and a force-pretty override when piped (rare, e.g. `ralphy status -p | tee status.txt`).

**Notes:** landed via commits `bee7f59` + `03ccf9a`. Spot-check passes for `out()`-based commands; the four ffmpeg-recipe commands listed in `01.02.01` notes are the remaining bypass and roll up under that task.
