# Workboards

A **workboard** is a lightweight, notes-native grouping of active `notes/issues/` into ordered execution **lanes** for one focused work session (a `/dev-loop` run, a day, a week). It exists so a downstream agent moves a *coherent product slice* forward instead of cherry-picking easy unrelated issues.

> **A workboard is NOT a source of truth.** The flat top level of `notes/issues/` remains the live backlog (see [issues folder layout](../README.md#issues-folder-layout)). A workboard only *selects + orders + records the handoff* for issues that already exist there. If a workboard and `notes/issues/` disagree, `notes/issues/` wins. Do not invent work in a workboard that has no issue file.

This deliberately does **not** resurrect the retired roadmap board (`notes/monorepo`-style program planning lives in the `#452`-class umbrella issues + `notes/roadmaps/`). A workboard is tactical and disposable.

## Lifecycle

1. **Open** — copy [`TEMPLATE.md`](TEMPLATE.md) to `notes/workboards/<YYYY-MM-DD>-<slug>.md`, set `Status: active`, fill the lanes by selecting issue ids from the live backlog and ordering them by dependency.
2. **Run** — as each issue lands (or is deferred), update its row's status inline. The git history of the file is the audit trail; no separate log.
3. **Close** — when the slice is done (or the session ends), set `Status: closed — <date>` and fill the **Completion notes** section (what landed, what was deferred + why, any new issues filed mid-run). A closed workboard stays in place as the record — never delete it.
4. **Refresh** — a new session opens a NEW dated workboard. Carry-over (deferred / unfinished) issues are re-selected into the new board by id; the old board stays closed. Never reopen a closed board.

## File shape

Every workboard follows [`TEMPLATE.md`](TEMPLATE.md): a status/date header, a **Lanes** table (lane · issue id · depends-on · expected gates · status), a **Dependency order** note, and a **Completion notes** section filled on close.

## Naming

`notes/workboards/<YYYY-MM-DD>-<slug>.md` — date-stamped by open date so boards sort chronologically. The slug names the slice (`content-farm-pipeline`, `library-hardening`, …).
