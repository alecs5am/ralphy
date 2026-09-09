# Task 1 report — usable media Desktop contract

## Result

- Added the frozen Core v2/schema v6 `media.generation.show` DTO and method contract, including closed generation input names and null-aware `media.select` CAS typing.
- Added exact compiled contract assertions, strict Project reader validation, Artifact revision paging/selection, and local `unknown/not-recorded` handling for an unselected Artifact without a Core request.
- Added only named preload/client methods and secured main handlers. The handlers reuse `securedHandle`, `parseProjectReference`, the exact generation target parser, and the existing root guard before and after each Core request.

## TDD evidence

- RED: `bun run test -- tests/ralphy-current-core.test.ts tests/project-reader.test.ts tests/ipc-security.test.ts` exited 1 with 9 expected failures: the Core capability was unknown, the three reader methods were absent, and the preload methods were absent. The remaining 25 tests passed with 1 intentional live-Core skip.
- Additional RED: `bun run test -- tests/project-reader.test.ts -t "mismatched selection"` exited 1 because a refreshed Artifact card with the wrong selected Object was accepted.
- GREEN: `bun run test -- tests/ralphy-current-core.test.ts tests/project-reader.test.ts tests/ipc-security.test.ts` passed 34 tests with 1 intentional live-Core skip.
- Typecheck: `bun run typecheck` exited 0.

## Scope and concerns

- No dependency, UI/controller/CSS, Core/schema/migration, package/install, or live `.ralphy` change was made.
- The repository has no `lint` package script; `bun run lint` reports `Script not found "lint"`. The requested focused tests and typecheck are the available Task 1 gates.
- The worktree already contained substantial unrelated unstaged Desktop changes; they were preserved.
- The Task 1-listed files themselves already contained the approved/frozen Desktop domain foundation (including three previously untracked files). Per owner direction, the commit includes those listed files whole; no path outside the Task 1 inventory is staged.

## Review fix round 1

- RED: the focused three-file gate exited 1 with three verified failures: a production-shaped nine-field Artifact revision was rejected, sibling-scope/21-attempt generation details were accepted, and the production Project media registrar seam was absent. The remaining 33 tests passed with 1 intentional live-Core skip.
- Compiled RED: `bun run typecheck` exited 2 because the copied `ResultFor<"media.revisions">` did not equal the frozen Core Artifact revision result.
- Added the full frozen Core Artifact revision shape and exact compiled result assertion, bound generation/producers to the requested Workspace/Project visibility and 20-attempt page, and moved the three handlers into a narrow production-used registrar with sender, parser, and before/after root fences.
- GREEN: the focused three-file gate passed 36 tests with 1 intentional live-Core skip; `bun run typecheck` exited 0.
