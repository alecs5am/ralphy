# DevEx, fixtures, docs, and release gates roadmap

> **Status:** roadmap source
> **Filed:** 2026-06-16
> **Folder:** roadmaps
> **Related issues:** #430, #431, #446, #450, #451

## Purpose

Make the project sustainable for a year of development. The backlog can grow to
1000 issues only if agents can execute work safely, tests catch regressions, and
docs stay aligned with the CLI.

## Target capabilities

- Low-tech benchmark suite.
- Agent-user simulator.
- Golden project fixtures.
- Mode and eval smoke tests.
- Pretty and JSON output coverage.
- Weekly workboard for issue selection.
- Release gates for docs, CLI surface, and invariants.

## Workstreams

### Fixtures

Issue families:

- Minimal project fixtures.
- Broken project fixtures.
- Passing Unit fixtures.
- Repairable Unit fixtures.
- Blocked Unit fixtures.
- Mode classification fixtures.
- Provider failure fixtures.
- Desktop event fixtures.

### Testing and lints

Issue families:

- CLI JSON shape tests.
- Pretty-output coverage.
- Docs link checks.
- Agent routing invariant tests.
- No direct provider calls tests.
- Mode coverage tests.
- Eval gate golden tests.

### Developer workflow

Issue families:

- Weekly workboard.
- Issue dependency display.
- Roadmap-to-issue helper.
- Postmortem mining helper.
- Fixture generation helper.
- Maintainer release checklist.

### Documentation

Issue families:

- Agent guide updates.
- Playbook consistency.
- CLI generated docs freshness.
- Desktop onboarding docs.
- Mode authoring docs.
- Library publishing docs.
- Cloud seam docs.

## Acceptance ladder

1. New agents can discover active work and local rules quickly.
2. Golden fixtures cover the canonical production pipeline.
3. Output shape and docs freshness gates run in CI.
4. Mode, eval, and repair regressions have targeted tests.
5. Weekly workboard can select coherent issue tranches.
6. Roadmap batches can be converted to issues without duplicating backlog.

## Example issues to file later

- Add fixture project stopped at each production phase.
- Add golden low-tech prompts for every priority mode.
- Add roadmap-to-issue batch checklist.
- Add eval gate golden files for common failure classes.
- Add weekly workboard grouping by roadmap program.
