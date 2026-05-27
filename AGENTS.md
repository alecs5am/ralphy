# AGENTS.md — playbook router

> This file is `@`-imported by `CLAUDE.md`, so it's always in the system prompt. It is the routing contract for every user request.

<!-- ralphy-version-line: do not edit by hand. The `/release` skill bumps this line. -->
> **Current ralphy CLI: `v0.2.0`** (released 2026-05-20). Verify the user's binary via `ralphy --version`. If it lags this version, suggest `brew upgrade ralphy` (macOS) or `npm update -g @alecs5am/ralphy` (cross-platform) so they pick up the fixes documented in this routing table.

## The discipline (read this first, every time)

**Before responding to any user request, do these four steps in order:**

0. **Load user context.** On the FIRST tool call of a new session, run `bun run cli/index.ts` (or `ralphy` if global binary is on PATH) with no subcommand. It prints the user profile: skill score (0-10), band (novice → expert), developer badge, signals (projects done, postmortems, etc), and a `recommendation` string explaining how verbose the intake should be for this user. Skip to step 1 if you already have this context from earlier in the session. The output is JSON; you only need `user.is_developer`, `user.skill.band`, and `recommendation` to adapt your behavior — see `docs/playbooks/intake.md` for the per-band branches.

1. **Match the request to a row in the routing table below.** Single match → that's the playbook. Multiple matches → chain them in role order. No match → ask exactly one clarifying question that maps the ask to a row.
2. **Read the matched playbook fully via the `Read` tool** (path is in the table). Then read sub-docs the playbook points to that are relevant to the specific sub-task. Sub-docs are listed at the top of every playbook with a "When to read it" column.
3. **Then act.** Do not improvise on a topic the playbook covers — if you find yourself thinking "I know how to do this, I'll skip the read", you don't, and skipping is the bug this file exists to prevent.

If a playbook references a tool you've never used (yt-dlp, Playwright, ffmpeg, ralphy CLI), the playbook tells you the exact command. Use it. Don't substitute a tool you happen to know — substitution is a defect, not initiative.

**Failure to read the playbook before acting is a defect.** It causes the `WebFetch a TikTok and ask the user for the file` failure mode that this whole structure exists to eliminate.

## Dev mode vs user mode

Before matching the routing table, decide which mode this request is.

- **User mode (default).** The user wants Ralphy to produce a video / asset / generation, or wants you to operate the CLI on their behalf. Skip this section, go straight to the routing table.
- **Dev mode.** The user wants you to **develop Ralphy itself** — add or fix a CLI verb, refactor `cli/`, edit a playbook, write a skill / template / model entry, touch `docs/`, change a roadmap row, file an idea in `notes/`. **Read [`docs/developing-ralphy.md`](docs/developing-ralphy.md) FIRST** before anything else. It points at the non-obvious things you would otherwise miss: the `notes/` folder, the append-only error catalog, the auto-generated files, the lint suite, the docs styleguide, the skill / template / model discipline, and the **English-only-on-disk** rule.

**Triggers for dev mode (any one is enough):**

- The user names a path under `cli/`, `scripts/`, `tests/`, `roadmap/`, `notes/`, `docs/`, `docs-mintlify/`, `templates/<slug>/`, `.agents/skills/`, or any top-level `*.md` (`AGENTS.md`, `MODELS.md`, `CLAUDE.md`, `MEMORY.md`).
- The user uses dev verbs aimed at Ralphy itself: "implement", "add", "fix", "refactor", "lint", "test", "commit", "release", "publish", "debug", "ship", "make a PR", "fix the bug", "add a verb", "write a test".
- The user references a roadmap task (`01.02.03`), a decision ID (`D-04`), an error code (`E_REF_REQUIRED`), or a SPEC marker (`[ ]` / `[~]` / `[x]`).
- The user wants to add or change a playbook, skill, template, or model.
- The user wants to file an idea, a found issue, or a design note (`notes/`).
- The current chat already includes any of the above and the new turn continues that thread.

If none fire, stay in user mode — go straight to the routing table below. **Do not read `docs/developing-ralphy.md` in user mode** — it is dev-context noise that dilutes the playbook routing.

## Routing

| User intent | Playbook |
|---|---|
| **NEW PROJECT REQUEST** — "make a video about X", "I want one like this + <url>", "launch project Y", any brief with > 1 unknown (audience? brand? aesthetic? duration?). FIRES before any other playbook. | [`docs/playbooks/intake.md`](docs/playbooks/intake.md) — ask 3-5 clarifying questions, **match a niche skill** (`/ralphy-ugc-*`) to the brief — never auto-suggest a template — draft a plan, wait for user "go" before any paid generation, then proceed one beat at a time with checkpoints |
| **NICHE CONTENT SKILL** — the brief names a recognizable *kind* of video ("unboxing", "talking-head rant", "tier-list", "before/after", "day-in-the-life"). Match the generalized niche skill, load it as a domain overlay, run the normal pipeline. | the matching [`.agents/skills/ralphy-ugc-*/SKILL.md`](.agents/skills/) (then chain scenarist → art-director → editor). Concept: [`docs/skills-vs-templates.md`](docs/skills-vs-templates.md) |
| **REMIX A SPECIFIC VIDEO** — user points at one concrete video and asks to reproduce it with a swap: `@template:<slug>`, "remix this one", "make the exact same video but replace X with Y", names a template slug. (Only fires on an explicit pointer — NOT on a generic "make a video like X".) | `ralphy template use <slug> --project <id> --brief "<the swap>"`, then run intake only on the deltas the swap introduces. Concept + flow: [`docs/skills-vs-templates.md`](docs/skills-vs-templates.md) |
| Open research, URL drop in reference context, "style from <site>", "analyze @handle", "break down TikTok / Reel / Shorts", competitor audit, "what's trending in <X>" | [`.agents/skills/ralphy-researcher/SKILL.md`](.agents/skills/ralphy-researcher/SKILL.md) (then [`docs/playbooks/researcher.md`](docs/playbooks/researcher.md) for tool deep-dive) |
| "write a script", "make a video about X", scenario feedback ("rework scene 3", "rewrite hook", "shorten / lengthen", "tighten VO") | [`docs/playbooks/scenarist.md`](docs/playbooks/scenarist.md) |
| "generate prompts / assets", "make images / video / VO / music", "regenerate scene-XX", model swap, A/B variant, cost preview | [`docs/playbooks/art-director.md`](docs/playbooks/art-director.md) |
| "compose the video", "render", "captions", "transitions", "audio mix", "final cut", "preview", HyperFrames code edits | [`docs/playbooks/editor.md`](docs/playbooks/editor.md) (then [`hyperframes.md`](docs/playbooks/hyperframes.md) for the engine) |
| "make video end-to-end", batch (N≥3), "save as template", "review batch", cost rollup | [`docs/playbooks/producer.md`](docs/playbooks/producer.md) |
| **Audio-to-video for long-form** — user drops an audio file (mp3 / wav / m4a) or a long-form URL (> 4 min) and asks for "a video" / "make a video from this podcast" / "edit my audio into a faceless explainer" / "overlay-driven video from audio". The faceless dev-essay / tech-podcast format. | [`.agents/skills/ralphy-audio-explainer/SKILL.md`](.agents/skills/ralphy-audio-explainer/SKILL.md) (uses the [`creator-lifestyle/podcast-explainer-longform`](templates/creator-lifestyle/podcast-explainer-longform/) template) |
| "evaluate / score / grade / QA / review" a rendered mp4, "is this ready to ship", "find issues in this video", scene-by-scene breakdown of a render, retention / scroll-stop check, post-render quality gate | [`.agents/skills/ralphy-evaluator/SKILL.md`](.agents/skills/ralphy-evaluator/SKILL.md) |
| "set this up", "ralphy doctor", "nothing works", "read logs", "missing key", any ralphy CLI usage question | [`docs/playbooks/core.md`](docs/playbooks/core.md) |
| Fresh machine, `which ralphy` empty, "install ralphy" | [`docs/playbooks/ralphy-install.md`](docs/playbooks/ralphy-install.md) |
| **HyperFrames API details (composition rules, GSAP timelines, captions, transitions, registry blocks, audio, ffmpeg)** | [`docs/playbooks/hyperframes.md`](docs/playbooks/hyperframes.md) + the matching `.agents/skills/<topic>/SKILL.md` (`hyperframes`, `hyperframes-cli`, `hyperframes-media`, `hyperframes-registry`, `gsap`, `lottie`, `animejs`, `css-animations`, `three`, `typegpu`, `waapi`, `tailwind`, `website-to-hyperframes`, `contribute-catalog`) |
| **`@guideline:<slug>` tag in the user message**, or user asks "use the photoreal guideline / pull guideline X / how do we usually prompt for Y" — read the prompt-library rules BEFORE drafting any `ralphy generate` prompt for that register. | Run `ralphy guideline show <slug>` and load the body into context; the gallery lives at [`guidelines/`](guidelines/) (repo) and `/library` on the landing. When unsure which slug applies, `ralphy guideline list` shows kind + models per slug. |

**Composition.** A request that spans roles is a chain in role order. Example: "make a video in the style of <url> for <brand>" → researcher → scenarist → art-director → editor. The producer playbook is the wrapper for end-to-end.

**Batch (N≥3).** Always producer → `batch-from-template`. Never run a loop by hand.

## Hard invariants (apply across all playbooks)

1. **No FAL_KEY, no Vercel, no OpenAI direct.** Only `OPENROUTER_API_KEY` + `ELEVENLABS_API_KEY`. All media → `cli/lib/providers/media.ts`. All LLM/vision → `cli/lib/providers/llm.ts → callLLM()`.
2. **`ralphy` is the only entry-point for model calls, ffmpeg recipes, yt-dlp pulls, and project mutations.** Reaching for `bunx tsx` against a TS file, `curl` against any provider API, or `ffmpeg` ad-hoc → **STOP**. Either there's a `ralphy` verb for it (check the playbook's `## CLI cookbook` section), or the operation isn't yet covered — in which case **propose adding the verb to `cli/commands/`** and stop. Never paste raw API code into a project. The gen-log, asset-manifest, cost rollup, and quality gates all depend on this. **For renders specifically: `ralphy render <id>` is the only path** — it expects `workspace/projects/<id>/index.html` (HyperFrames). Direct `bunx hyperframes render` is reserved for debugging.
3. **Reference-required gate.** Fires only for **named real entities the model cannot fabricate** — a specific person ("Elon Musk"), a recognizable brand product ("Coca-Cola can", "iPhone 16", "Old Spice bottle"), or a recognizable IP ("Mickey Mouse", "Pikachu"). Generic product / lifestyle work ("my coffee shop's new pastry", "no-name workout app") proceeds **without** refs — the default flow does not require them (per `04.02.01`). When the gate fires and no ref is attached, refuse with a concrete ask. User can override on a specific generate call with `--no-ref-consent "<reason>"`, which logs `stage: "no-ref-consent"` to `user-prompts.jsonl`. The CLI floor is `ralphy ref check <project-id>` (offline classifier under `cli/lib/eval/refs.ts → needsReference()`); the agent layer adds nuance during intake.
4. **Quality gates refuse, not warn.** If `scoreScenario`/`scoreImage`/`scoreVideo` fail twice in a row, stop and report concrete options. Do not render mp4 over a failed gate.
5. **No auto-launched processes.** No background `hyperframes preview`, no dashboard. Chat is the interface. Use `ralphy doctor` to surface missing keys/deps; `ralphy render <id>` to produce mp4. If the user wants a live preview, instruct them to run `bunx hyperframes preview workspace/projects/<id>` foreground in their own shell.
6. **Always check `MODELS.md`** before any model call. Claude's training is stale.
7. **Always `bun` / `bunx`** (no npm/npx/yarn).
8. **Always `ralphy <command>`** for CRUD, not direct workspace edits.
9. **Speed targets** (`docs/perf-targets.md`): ≤8 min cold-start single video, ≤25 min 10-batch. Exceeding 50% — report before starting.
10. **Skills are the default route; templates are remix-only. Read [`docs/skills-vs-templates.md`](docs/skills-vs-templates.md) before routing any "make a video" request.** Two distinct concepts, two jobs:
    - **Skill** = generalized niche know-how — "how to make a *kind* of video" (e.g. `/ralphy-ugc-unboxing`). A domain overlay on the standard pipeline that works for any subject in its niche. **This is what the agent matches to a generic brief.** Niche content skills use the `ralphy-ugc-*` name prefix under `.agents/skills/`.
    - **Template** = one concrete reproducible video — the full prompt set + composition of a single video that was actually made. Its only job is reproduction ("remix this exact video, but swap X for Y"). It is **user-initiated, never auto-suggested**: the user points at a specific video (`@template:<slug>`, "remix this one", names a slug) and states the swap. A template answers "I want *this* video", never "I want *a* video about X".
    - **`ralphy template suggest` is NOT the cold-start move.** Do not run it to "find something close" to a generic brief — that is the old template-first behavior this model removes. It belongs to remix-shopping only (the user browsing for a specific video to reproduce). On a cold "make a video about X", match a niche skill (or go freeform via the scenarist); never auto-pivot the user into a template.
    - **Where templates live.** `templates/` (repo-public, 5 segment-persona category folders — `b2b-saas/`, `dtc-commerce/`, `creator-lifestyle/`, `entertainment-viral/`, `cinematic-narrative/`) and `workspace/templates/` (user-local, gitignored, flat). Both read by `ralphy template list` / `suggest` / `use`; the loader resolves slugs across both layouts. Workspace overrides repo on id collision. Two `kind`s: `vibe-reference` (full production, 5 in repo) and `vibe-style` (prompt cookbook, 38 in repo). Manifests: [`templates/CATEGORIES.md`](templates/CATEGORIES.md), [`templates/TOP.md`](templates/TOP.md). Index: [`docs/templates-index.md`](docs/templates-index.md).
12. **Asset catalog before reference picks.** Reference imagery, gameplay backgrounds, trend music, and other reusable assets live in the [`ralphy-assets`](https://github.com/alecs5am/ralphy-assets) companion repo, organized as a **pool** (generic, by kind — `italian-brainrot-characters`, `gameplay-loops`, etc.). Before writing a prompt that names a specific character / footage / track, **run `ralphy assets list --kind <kind>`** (or read [`docs/assets-catalog.md`](docs/assets-catalog.md) — derived from the live manifest) to see what's already curated. If the asset exists, pull it (`ralphy assets pull-pool <kind>/<slug> --install <project>`) instead of improvising. If it doesn't exist for a real-world entity (e.g. a specific brainrot character not in the pool), **propose adding it to the pool first** rather than generating a drift-prone reference from text alone. Regenerate the catalog after any manifest change with `ralphy assets catalog --write`.
11. **Heavy assets and example projects live in a companion repo** ([`ralphy-assets`](https://github.com/alecs5am/ralphy-assets)). Required template assets auto-pull on `ralphy template use`; cache at `workspace/.ralph/asset-cache/`. SHA-256 verified, no auth needed.
13. **Prompt-library guidelines are mandatory reading for any covered register.** When the user pastes `@guideline:<slug>` OR the brief matches a guideline's scope (photoreal humans, broadcast realism, anti-AI-slop image, etc.), run `ralphy guideline show <slug>` and **fold the rules into the prompt** you pass to `ralphy generate`. Guidelines codify hard-won failure-mode knowledge (skin pores, negative cluster, six-token spine, anatomy gate) — skipping them is the same defect class as skipping the playbook read. `ralphy guideline list` enumerates what's available; the public gallery is `/library` on the landing.
14. **Append-only on generations. NEVER delete or overwrite user/agent-produced artifacts without an explicit user request.** This rule applies to *everything* under `workspace/projects/<id>/` — `assets/`, `render/`, `logs/`, `prompts.json`, `asset-manifest.json`, `STORYBOARD.md`, `POSTMORTEM.md`, the `postmortem/` directory, and any user-supplied refs. Concretely:
    - **Regen → new version, never overwrite.** `ralphy generate ...` on a slot that already has a file auto-writes `.<slot>.v2.<ext>` (then `v3`, `v4`, …) as of 2026-05-19; the existing file is preserved unchanged. Pass `--force-overwrite` only when the user explicitly asks for legacy destructive behavior. The manifest tracks both; only "promote" a chosen variant on explicit user say-so.
    - **No `rm`, `fs.rm`, `fs.unlink`, `fs.rename`-over-existing inside a project dir** unless the user said the words "delete / remove / clean / wipe" pointing at that artifact. "Regenerate scene-04" is **not** consent to delete the old scene-04.
    - **`generations.jsonl`, `user-prompts.jsonl`, `user-assets.jsonl` are append-only by definition.** Never truncate, rewrite, or filter them in place. Read-and-rewrite to "tidy" is a defect.
    - **Failed / rejected generations stay on disk** until the user explicitly purges them. The gen-log + manifest reasoning across sessions depends on the failed artifacts still being there.
    - **If the user wants a clean slate**, use `ralphy project delete <id>` (registry-aware) or wait for explicit `rm -rf` permission scoped to a named path. Never volunteer a cleanup.
    - **Exceptions** (do not need explicit consent): writing *new* files, appending to a JSONL log, updating `asset-manifest.json` to point at a new version, and CLI-internal scratch like `workspace/.ralph/asset-cache/` (managed by `ralphy assets clean`). When in doubt — keep the file, add a new version, ask.

## Routing failure mode

If no row matches: **don't improvise**. Either ask one clarifying question that maps the request to a row, or refuse with the closest in-scope alternative. See `docs/use-cases.md` for canonical utterances.

## On slash-commands

Built-in skills live under `.agents/skills/` and follow the kebab namespace convention:

- **`ralphy-*`** — content / end-user skills (e.g. `/ralphy-researcher`, `/ralphy-evaluator`, `/ralphy-templater`, `/ralphy-postmortem`, `/ralphy-install`).
- **`ralphy-dev-*`** — maintainer / dev skills (e.g. `/ralphy-dev-release`).
- **HyperFrames skills** (render engine) — `/hyperframes`, `/hyperframes-cli`, `/hyperframes-media`, `/hyperframes-registry`, `/gsap`, `/css-animations`, `/animejs`, `/lottie`, `/three`, `/typegpu`, `/waapi`, `/tailwind`, `/website-to-hyperframes`, `/contribute-catalog`. Installed via `bunx hyperframes skills`.

A skill's body is the source of truth for HOW to execute a flow. The routing table above answers WHICH skill / playbook to use; this file (`AGENTS.md`) is the always-on base context for ralphy work.
