# AGENTS.md — playbook router

> This file is `@`-imported by `CLAUDE.md`, so it's always in the system prompt. It is the routing contract for every user request.

## The discipline (read this first, every time)

**Before responding to any user request, do these three steps in order:**

1. **Match the request to a row in the routing table below.** Single match → that's the playbook. Multiple matches → chain them in role order. No match → ask exactly one clarifying question that maps the ask to a row.
2. **Read the matched playbook fully via the `Read` tool** (path is in the table). Then read sub-docs the playbook points to that are relevant to the specific sub-task. Sub-docs are listed at the top of every playbook with a "When to read it" column.
3. **Then act.** Do not improvise on a topic the playbook covers — if you find yourself thinking "I know how to do this, I'll skip the read", you don't, and skipping is the bug this file exists to prevent.

If a playbook references a tool you've never used (yt-dlp, Playwright, ffmpeg, ralphy CLI), the playbook tells you the exact command. Use it. Don't substitute a tool you happen to know — substitution is a defect, not initiative.

**Failure to read the playbook before acting is a defect.** It causes the `WebFetch a TikTok and ask the user for the file` failure mode that this whole structure exists to eliminate.

## Routing

| User intent | Playbook |
|---|---|
| Open research, URL drop in reference context, "style from <site>", "analyze @handle", "break down TikTok / Reel / Shorts", competitor audit, "what's trending in <X>" | [`docs/playbooks/researcher.md`](docs/playbooks/researcher.md) |
| "write a script", "make a video about X", scenario feedback ("rework scene 3", "rewrite hook", "shorten / lengthen", "tighten VO") | [`docs/playbooks/scenarist.md`](docs/playbooks/scenarist.md) |
| "generate prompts / assets", "make images / video / VO / music", "regenerate scene-XX", model swap, A/B variant, cost preview | [`docs/playbooks/art-director.md`](docs/playbooks/art-director.md) |
| "compose the video", "render", "captions", "transitions", "audio mix", "final cut", "preview", Remotion code edits | [`docs/playbooks/editor.md`](docs/playbooks/editor.md) (then [`remotion.md`](docs/playbooks/remotion.md) for API specifics) |
| "make video end-to-end", batch (N≥3), "save as template", "review batch", cost rollup, profile export / import | [`docs/playbooks/producer.md`](docs/playbooks/producer.md) |
| "set this up", "ralphy doctor", "nothing works", "read logs", "missing key", any ralphy CLI usage question | [`docs/playbooks/core.md`](docs/playbooks/core.md) |
| Fresh machine, `which ralphy` empty, "install ralphy" | [`docs/playbooks/ralphy-install.md`](docs/playbooks/ralphy-install.md) |
| Remotion API details (captions, transitions, audio, ffmpeg, library primitives, animation) | [`docs/playbooks/remotion.md`](docs/playbooks/remotion.md) |

**Composition.** A request that spans roles is a chain in role order. Example: "make a video in the style of <url> for <brand>" → researcher → scenarist → art-director → editor. The producer playbook is the wrapper for end-to-end.

**Batch (N≥3).** Always producer → `batch-from-template`. Never run a loop by hand.

## Hard invariants (apply across all playbooks)

1. **No FAL_KEY, no Vercel, no OpenAI direct.** Only `OPENROUTER_API_KEY` + `ELEVENLABS_API_KEY`. All media → `cli/lib/providers/media.ts`. All LLM/vision → `cli/lib/providers/llm.ts → callLLM()`.
2. **`ralphy` is the only entry-point for model calls, ffmpeg recipes, yt-dlp pulls, and project mutations.** Reaching for `bunx tsx` against a TS file, `curl` against any provider API, or `ffmpeg` ad-hoc → **STOP**. Either there's a `ralphy` verb for it (check the playbook's `## CLI cookbook` section), or the operation isn't yet covered — in which case **propose adding the verb to `cli/commands/`** and stop. Never paste raw API code into a project. The gen-log, asset-manifest, cost rollup, and quality gates all depend on this.
3. **Reference-required gate.** Named person, brand, or specific real entity → require user-supplied reference before any generation. Refuse with a concrete ask. User can override with explicit "generate without reference, I understand the quality will be worse"; log as `stage: "no-ref-consent"`.
4. **Quality gates refuse, not warn.** If `scoreScenario`/`scoreImage`/`scoreVideo` fail twice in a row, stop and report concrete options. Do not render mp4 over a failed gate.
5. **No auto-launched processes.** No background Studio, no dashboard. Chat is the interface. Use `ralphy doctor` to surface missing keys/deps; `ralphy render <id>` to produce mp4.
6. **Always check `MODELS.md`** before any model call. Claude's training is stale.
7. **Always `bun` / `bunx`** (no npm/npx/yarn).
8. **Always `ralphy <command>`** for CRUD, not direct workspace edits.
9. **Speed targets** (`docs/perf-targets.md`): ≤8 min cold-start single video, ≤25 min 10-batch. Exceeding 50% — report before starting.
10. **Templates live in two places.** `templates/` (repo-public) and `workspace/templates/` (user-local, gitignored). Both are read by `ralphy template list` / `suggest` / `use`. Workspace overrides repo on id collision.
11. **Heavy assets and example projects live in a companion repo** ([`ralphy-assets`](https://github.com/alecs5am/ralphy-assets)). Required template assets auto-pull on `ralphy template use`; cache at `workspace/.ralph/asset-cache/`. SHA-256 verified, no auth needed.

## Routing failure mode

If no row matches: **don't improvise**. Either ask one clarifying question that maps the request to a row, or refuse with the closest in-scope alternative. See `docs/use-cases.md` for canonical utterances.

## On slash-commands

Users can still type `/ralph-researcher`, `/ralph-scenarist`, etc. Those slash-commands are now thin shims that redirect to the playbook here — same outcome, just an alternate entry point. The shim's body literally says "Read `docs/playbooks/<role>.md` before acting."
