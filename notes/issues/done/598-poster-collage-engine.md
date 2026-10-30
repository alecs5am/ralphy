# `ralphy editor poster`: the poster-collage engine as a CLI verb

> **Status:** done — 2026-10-30 (`ralphy editor poster` assembles a poster-collage composition from a scenes file with the engine embedded under `cli/lib/poster/`; validates scenes and assets, inlines referenced Lottie, copies the licensed fonts, snapshots the previous index.html like `catalog use`, lints; a rebuild of the accepted 84.6 s project snapshots byte-identical to the scratch build at 9 sample times)
> **Filed:** 2026-10-30
> **Folder:** issues
> **Severity:** medium
> **Category:** editor / CLI / HyperFrames

## Context

The owner asked for faceless poster-collage explainer montages (TikTok / Reels, 9:16) that beat a reference edit: big condensed red titles with scattered letter reveals, kicker labels, handwritten notes, collected cut-outs and stickers, and many micro-effects. A data-driven HyperFrames engine was built in a session scratchpad (an engine script, an HTML shell, a Python assembler, an Oswald advance-width table) and rendered an 84.6 s, 25-scene cut that the owner accepted. The owner wants it applied to new projects from now on, which a scratchpad cannot do: the next agent has neither the engine nor the lessons behind it.

## What

- Move the engine, the shell and the advance table into the repo under `cli/lib/poster/`, embedded into the compiled CLI as text (the `cli/commands/track.ts` pattern). Keep the engine code as it is; its render-safety fixes are load-bearing.
- `ralphy editor poster <project> --scenes <file.js> --audio <relative src> [--duration <sec>] [--lang <code>] [--title <text>] [--dry-run]`:
  - port the assembler to TypeScript: fill the shell, inline the Lottie JSON of every animation the scenes reference, embed the advance table;
  - copy `oswald.ttf`, `caveat.ttf`, `inter.ttf` and their license files from the licensed catalog fonts into `<project>/fonts/` when missing, never overwriting;
  - default the duration to the audio duration (ffprobe);
  - snapshot an existing `index.html` before replacing it, exactly like `ralphy catalog use` (#594): the project-tree Composition revision on a store root, append-only `compositions/v<N>.html` on a tree-only root;
  - validate before writing: the scenes file defines `ASSETS` and `SCENES`, every `src` is in `ASSETS` and on disk, coded errors naming the problem;
  - `--dry-run` prints the plan (scene count, referenced and missing assets, inlined Lottie bytes) and writes nothing;
  - lint the result and report it.
- Agent docs: `.agents/skills/editor/references/poster-collage.md` (when to use, workflow, the scene schema and every item type, effect recipes, layout rules, the QA loop, the lessons), linked from the editor skill and from `stock-assets.md`.

## Scope / acceptance

- Unit tests for the assembler: placeholders filled, Lottie inlined only for referenced files, advance table present, missing asset and missing `SCENES` errors, the snapshot taken before the overwrite.
- An integration test on temp roots (tree-only and store): a small English scenes file with one Lottie and one image writes `index.html` and the fonts; a second run snapshots first. No real render.
- `docs/cli-surface.generated.md` regenerated; the usual lints green.

## Resolution

- Engine in `cli/lib/poster/`: `engine.js` (the scratch engine, code unchanged except one literal no-break space now written as `" "`; comments rewritten, the render-safety rules in its header), `shell.html`, `oswald700-adv.json` (the same 203 advance widths, written with `\u` escapes so the file is ASCII). All three are text imports, so the compiled binary carries them (checked with `bun build --compile`). `engine.d.ts` types the script as text; the `.html` and `.json` imports are cast because the type checker describes Bun's default loaders.
- Shell fix: the `arcs` item drew an SVG with no CSS rule; it sat in normal flow and painted under the absolutely positioned background, so its connectors never showed (seen on the accepted project at 17.2 s). The shell now styles `.arcs` (absolute, full frame, unfilled 6 px dashed strokes). A unit test checks that every class the engine creates has a shell rule.
- Assembler (`cli/lib/poster/assemble.ts`, the `build.py` port): fills the shell in one pass (inserted text is never read as a placeholder or a `$` replacement pattern), appends `OSWALD_ADV` and `LOTTIE_DATA` to the scenes code, escapes `<` in the inlined JSON and refuses `</script` in the scenes code. Lottie is inlined only for files a `lottie` item uses (`build.py` inlined every `artifacts/animations/*.json` string in the file). The scenes file runs in a fresh `node:vm` context (only `COMP_ID` and `DURATION` defined, 2 s timeout) and is checked against enumerations read from the embedded engine and shell: item types, required fields, icon names, ascending scene times, `at` on nested items that read it. Unknown backgrounds, transitions, entrances and shatter targets are warnings.
- Project half (`cli/lib/poster/project.ts`): asset checks (not in ASSETS, file missing, outside the project; URLs warn), Lottie JSON validation (numeric `ip < op`), the font plan (`fonts/<font>.ttf` and `fonts/<font>-LICENSE.txt` from `.ralphy/catalog/fonts/<font>/`, copied only when missing, `COPYFILE_EXCL`), and `applyPosterPlan`, which takes the snapshot before any write.
- Verb (`cli/commands/editor.ts`): `ralphy editor poster <project> --scenes --audio [--duration] [--lang] [--title] [--no-lint] [--dry-run]`. The positional project resolves scope like `render` (`cli/index.ts`). Duration defaults to ffprobe on the audio. Snapshot: on a store root `renderCompositionForProject` (refused when the video Composition was authored outside the tree), else `compositions/v<N>.html` through `planFileSnapshot` / `writeNew` from #594; none when there is no previous index.html. Lint: the in-repo `lintHyperframesHtml` plus the upstream `hyperframes lint --json` (`runUpstreamHyperframesLint` in `cli/lib/render/hyperframes-lint.ts`: the pinned node_modules binary from a checkout, `bunx hyperframes` from a compiled CLI); an upstream error sets exit 1. `--dry-run` lists missing assets and exits 1 instead of failing. No new error codes: E_FILE_MALFORMED (scenes defects, a src not in ASSETS, a bad Lottie or audio file), E_FILE_UNREADABLE (missing asset files by path, the scenes file, the audio, a store Project with no tree yet), E_INPUT_INVALID (flags, assets outside the project), E_NOT_FOUND, E_DEP_MISSING (no ffprobe and no `--duration`).
- Docs: `.agents/skills/editor/references/poster-collage.md`, linked from the editor skill cookbook and sub-docs table and from `stock-assets.md`; `docs/cli-surface.generated.md` regenerated.
- Tests: `tests/unit/poster-assemble.test.ts`, `tests/integration/editor-poster-598.test.ts` (tree-only and store roots; upstream lint when installed). Verified by rebuilding the accepted 25-scene project from its scenes file into a scratch mirror: `hyperframes snapshot` frames at 0.8, 2.9, 5.2, 9.9, 13.5, 21, 40, 62 and 80 s are byte-identical to the scratch `build.py` output.
