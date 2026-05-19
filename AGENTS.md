# AGENTS.md — playbook router

> This file is `@`-imported by `CLAUDE.md`, so it's always in the system prompt. It is the routing contract for every user request.

## The discipline (read this first, every time)

**Before responding to any user request, do these four steps in order:**

0. **Load user context.** On the FIRST tool call of a new session, run `bun run cli/index.ts` (or `ralphy` if global binary is on PATH) with no subcommand. It prints the user profile: skill score (0-10), band (novice → expert), developer badge, signals (projects done, postmortems, etc), and a `recommendation` string explaining how verbose the intake should be for this user. Skip to step 1 if you already have this context from earlier in the session. The output is JSON; you only need `user.is_developer`, `user.skill.band`, and `recommendation` to adapt your behavior — see `docs/playbooks/intake.md` for the per-band branches.

1. **Match the request to a row in the routing table below.** Single match → that's the playbook. Multiple matches → chain them in role order. No match → ask exactly one clarifying question that maps the ask to a row.
2. **Read the matched playbook fully via the `Read` tool** (path is in the table). Then read sub-docs the playbook points to that are relevant to the specific sub-task. Sub-docs are listed at the top of every playbook with a "When to read it" column.
3. **Then act.** Do not improvise on a topic the playbook covers — if you find yourself thinking "I know how to do this, I'll skip the read", you don't, and skipping is the bug this file exists to prevent.

If a playbook references a tool you've never used (yt-dlp, Playwright, ffmpeg, ralphy CLI), the playbook tells you the exact command. Use it. Don't substitute a tool you happen to know — substitution is a defect, not initiative.

**Failure to read the playbook before acting is a defect.** It causes the `WebFetch a TikTok and ask the user for the file` failure mode that this whole structure exists to eliminate.

## Routing

| User intent | Playbook |
|---|---|
| **NEW PROJECT REQUEST** — "сделай видео про X", "хочу как у вот этого + <url>", "запусти проект Y", any brief with > 1 unknown (audience? brand? aesthetic? duration?). FIRES before any other playbook. | [`docs/playbooks/intake.md`](docs/playbooks/intake.md) — ask 3-5 clarifying questions, draft a plan, wait for user "go" before any paid generation, then proceed one beat at a time with checkpoints |
| Open research, URL drop in reference context, "style from <site>", "analyze @handle", "break down TikTok / Reel / Shorts", competitor audit, "what's trending in <X>" | [`.agents/skills/ralph-researcher/SKILL.md`](.agents/skills/ralph-researcher/SKILL.md) (then [`docs/playbooks/researcher.md`](docs/playbooks/researcher.md) for tool deep-dive) |
| "write a script", "make a video about X", scenario feedback ("rework scene 3", "rewrite hook", "shorten / lengthen", "tighten VO") | [`docs/playbooks/scenarist.md`](docs/playbooks/scenarist.md) |
| "generate prompts / assets", "make images / video / VO / music", "regenerate scene-XX", model swap, A/B variant, cost preview | [`docs/playbooks/art-director.md`](docs/playbooks/art-director.md) |
| "compose the video", "render", "captions", "transitions", "audio mix", "final cut", "preview", Remotion code edits | [`docs/playbooks/editor.md`](docs/playbooks/editor.md) (then [`remotion.md`](docs/playbooks/remotion.md) for API specifics) |
| "make video end-to-end", batch (N≥3), "save as template", "review batch", cost rollup, profile export / import | [`docs/playbooks/producer.md`](docs/playbooks/producer.md) |
| "evaluate / score / grade / QA / review" a rendered mp4, "is this ready to ship", "find issues in this video", scene-by-scene breakdown of a render, retention / scroll-stop check, post-render quality gate | [`.agents/skills/ralph-evaluator/SKILL.md`](.agents/skills/ralph-evaluator/SKILL.md) |
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
10. **Templates live in two places.** `templates/` (repo-public, physically organized into 5 segment-persona category folders — `b2b-saas/`, `dtc-commerce/`, `creator-lifestyle/`, `entertainment-viral/`, `cinematic-narrative/`) and `workspace/templates/` (user-local, gitignored, stays flat). Both are read by `ralphy template list` / `suggest` / `use`; the loader resolves slugs across both layouts, so `ralphy template use <slug>` works regardless of category folder. Workspace overrides repo on id collision. Two `kind`s ship today: `vibe-reference` (full-stack production templates with composition.md + reference example, 5 in repo) and `vibe-style` (prompt cookbooks with hooks + camera vocab + worked example prompts, 38 in repo). Manifests: [`templates/CATEGORIES.md`](templates/CATEGORIES.md) (full slug-by-category roster) and [`templates/TOP.md`](templates/TOP.md) (Top-20 viral-2026 cross-category playlist for agent test-drives). Index: [`docs/templates-index.md`](docs/templates-index.md). Always `ralphy template suggest "<utterance>"` first.
12. **Asset catalog before reference picks.** Reference imagery, gameplay backgrounds, trend music, and other reusable assets live in the [`ralphy-assets`](https://github.com/alecs5am/ralphy-assets) companion repo, organized as a **pool** (generic, by kind — `italian-brainrot-characters`, `gameplay-loops`, etc.). Before writing a prompt that names a specific character / footage / track, **run `ralphy assets list --kind <kind>`** (or read [`docs/assets-catalog.md`](docs/assets-catalog.md) — derived from the live manifest) to see what's already curated. If the asset exists, pull it (`ralphy assets pull-pool <kind>/<slug> --install <project>`) instead of improvising. If it doesn't exist for a real-world entity (e.g. a specific brainrot character not in the pool), **propose adding it to the pool first** rather than generating a drift-prone reference from text alone. Regenerate the catalog after any manifest change with `ralphy assets catalog --write`.
11. **Heavy assets and example projects live in a companion repo** ([`ralphy-assets`](https://github.com/alecs5am/ralphy-assets)). Required template assets auto-pull on `ralphy template use`; cache at `workspace/.ralph/asset-cache/`. SHA-256 verified, no auth needed.
13. **Append-only on generations. NEVER delete or overwrite user/agent-produced artifacts without an explicit user request.** This rule applies to *everything* under `workspace/projects/<id>/` — `assets/`, `render/`, `logs/`, `prompts.json`, `asset-manifest.json`, `STORYBOARD.md`, `POSTMORTEM.md`, the `postmortem/` directory, and any user-supplied refs. Concretely:
    - **Regen → new version, never overwrite.** `ralphy generate ...` on a slot that already has a file auto-writes `.<slot>.v2.<ext>` (then `v3`, `v4`, …) as of 2026-05-19; the existing file is preserved unchanged. Pass `--force-overwrite` only when the user explicitly asks for legacy destructive behavior. The manifest tracks both; only "promote" a chosen variant on explicit user say-so.
    - **No `rm`, `fs.rm`, `fs.unlink`, `fs.rename`-over-existing inside a project dir** unless the user said the words "delete / remove / clean / wipe / удали / снеси" pointing at that artifact. "Regenerate scene-04" is **not** consent to delete the old scene-04.
    - **`generations.jsonl`, `user-prompts.jsonl`, `user-assets.jsonl` are append-only by definition.** Never truncate, rewrite, or filter them in place. Read-and-rewrite to "tidy" is a defect.
    - **Failed / rejected generations stay on disk** until the user explicitly purges them. The gen-log + manifest reasoning across sessions depends on the failed artifacts still being there.
    - **If the user wants a clean slate**, use `ralphy project delete <id>` (registry-aware) or wait for explicit `rm -rf` permission scoped to a named path. Never volunteer a cleanup.
    - **Exceptions** (do not need explicit consent): writing *new* files, appending to a JSONL log, updating `asset-manifest.json` to point at a new version, and CLI-internal scratch like `workspace/.ralph/asset-cache/` (managed by `ralphy assets clean`). When in doubt — keep the file, add a new version, ask.

## Routing failure mode

If no row matches: **don't improvise**. Either ask one clarifying question that maps the request to a row, or refuse with the closest in-scope alternative. See `docs/use-cases.md` for canonical utterances.

## On slash-commands

Users can still type `/ralph-researcher`, `/ralph-scenarist`, etc. Those slash-commands are now thin shims that redirect to the playbook here — same outcome, just an alternate entry point. The shim's body literally says "Read `docs/playbooks/<role>.md` before acting."
