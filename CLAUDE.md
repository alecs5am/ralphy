# UGC Video Generation Pipeline

Autonomous UGC-video generation pipeline built on Claude Code skills + Remotion + fal.ai + ElevenLabs.

## Proactive Skill Routing (READ FIRST)

**This project runs through skills. The user delegates the way a producer would — you decompose the task and invoke the right skill(s) yourself. Do NOT ask permission ("should I run /skill X?"). If the request matches, read `.claude/skills/<name>/SKILL.md` and execute. Report results, not plans.**

**Session bootstrap:** as soon as the user starts any real work (anything beyond a documentation question like "how does X work"), proactively invoke `/ralph-core` — it brings up Remotion Studio + dashboard (API + web) in the background. The user expects the UI to already be live when they come looking at assets, and won't ask explicitly. The skill checks ports first and won't duplicate processes that are already alive.

**Triggers → skills (do not deviate from this table):**

| User intent (paraphrased) | Skill |
|---|---|
| open research question with no URL ("find how to make AI videos with X", "how do creators do Y", "what's trending in Z", "research this topic / format / genre"), "look at this site", "grab design from [url]", "use the style of [site]", "analyze this TikTok / Reel / Shorts", "study what [@handle] is doing", competitor audit, any website or social URL in a reference context | `/ralph-researcher` |
| "write a script", "make a storyboard", "create a video about", scenario feedback ("rework scene 3", "rewrite the hook", "make the VO faster", "shorten it") | `/ralph-scenarist` |
| "generate prompts", "generate assets", "make the images / videos / VO / music", "redo scene-01 background", "try a different model for X", "A/B this shot", any fal.ai / ElevenLabs / Lyria work | `/ralph-art-director` |
| "compose the video", "render", "preview in Studio", captions, transitions, audio mixing, final cut, Remotion code edits | `/ralph-editor` + `/remotion-best-practices` |
| "make a video end-to-end", "run the full pipeline", "make N videos from this template", batch generation, "save this project as a template", "create template from X", "review the batch", cost rollup, profile export/import | `/ralph-producer` |
| fresh machine, "install ralphy", `which ralphy` returns nothing, brand-new user, "/ralphy-install" | `/ralphy-install` |
| session start, "launch dashboard", "start studio", "set this up", "install deps", "set API keys", "nothing works", missing-dep / missing-key errors, debug a failed generation, read project logs, any ralphy CLI usage question | `/ralph-core` |
| Remotion API details (captions, transitions, audio, ffmpeg, library primitives) | `/remotion-best-practices` |
| Creating a new skill | `/skill-creator` |

**Orchestration rules:**
- If a request spans multiple skills, read them in order and invoke them in the correct sequence. Example: "make me a video in the style of [site] for brand X" → `/ralph-researcher` (design extract) → `/ralph-scenarist` (scenario) → `/ralph-art-director` (prompts + assets) → `/ralph-editor` (compose + render). Use `/ralph-producer` as the wrapper when running end-to-end.
- Before invoking a skill, **always** `Read` its `SKILL.md` — that's where the current commands and edge cases live.
- For batch work (≥3 videos) always go through `/ralph-producer` → sub-task `batch-from-template`. Never run 10 projects by hand in sequence.
- If no skill matches, work directly, but `ls .claude/skills/` first in case you missed one.
- Do not write "I can run /skill, ok?" — just run it. The user wants the result, not a dialogue.

**Model + API guidance:** before any fal-ai MCP call or direct API hit, check `MODELS.md` in the repo root. Claude's model knowledge is stale; that file holds the current registry and the rule "always search for the latest version via `search_models` before hardcoding".

## Agent Documentation

**Read `docs/agent-guide.md` before starting** — full guide for agents: all CLI commands with examples, entities, pipeline, file layout, rules.

Additional specs:
- `docs/cli-spec.md` — complete ralph CLI spec (all flags, formats, edge cases)
- `docs/dashboard-spec.md` — dashboard spec (UI layout, API, WebSocket, views)

**If you change the CLI, dashboard, or pipeline, update the matching doc in `docs/`.**

## Project Structure

- `cli/` — ralph CLI (TypeScript, tsx). Commands under `cli/commands/`, utilities under `cli/lib/`.
- `src/lib/` — durable component library (captions, text, overlays, layouts, hooks, utils, types). Committed.
- `src/videos/{name}/` — per-video compositions. Each video in its own folder, easy to delete.
- `src/showcase/` — preview compositions for browsing the library in Remotion Studio (think Storybook).
- `workspace/` — all generated files (gitignored). Safe to wipe.
- `.agents/skills/` — skill source of truth.
- `.claude/skills/` — symlinks to skills.
- `dashboard/` — React SPA dashboard. `dashboard/server/` (API + file watcher), `dashboard/src/` (React UI).
- `docs/` — specs (cli-spec.md, dashboard-spec.md, agent-guide.md).
- `profiles/` — committed dumps of other users' `workspace/` (see Profiles section).

## Package manager — ALWAYS bun

**Use `bun` and `bunx` instead of `npm` / `pnpm` / `yarn` / `npx` in every command** (install, run-script, one-off CLI invocations, running tsx / remotion / playwright, etc.). This applies to skill commands, ad-hoc runs, and examples in docs. If you see legacy `npm run …` / `npx …` in the project or in a skill, silently swap it for `bun run …` / `bunx …` while editing nearby.

Replacement table:

| Instead of | Write |
|---|---|
| `npm install` / `npm i <pkg>` | `bun install` / `bun add <pkg>` |
| `npm run <script>` | `bun run <script>` |
| `npm run ralph -- <cmd>` | `bun run ralph -- <cmd>` |
| `npx tsx cli/index.ts <cmd>` | `bunx tsx cli/index.ts <cmd>` |
| `npx remotion render …` | `bunx remotion render …` |
| `npx playwright …` | `bunx playwright …` |

Exception: if a tool genuinely does not work under bun (rare), keep npm and note the reason in the commit.

## Commands

- `bun run dev` — Remotion Studio (composition preview + component library)
- `bun run build` — production bundle
- `bunx remotion render <CompositionId> --props <path>` — render a video

## ralphy CLI

`ralphy` is the CLI for all CRUD operations on the project. **Always use ralphy instead of touching `workspace/` files directly.**

Two ways to invoke:
- **Globally installed binary** (recommended for new users): `ralphy <command>` — works from anywhere, finds the project via `~/.config/ralphy/config.json` or walking up from cwd. Install via `curl -fsSL https://raw.githubusercontent.com/alecs5am/ralphy/main/install.sh | sh` or the `/ralphy-install` skill.
- **In-tree dev** (no install needed): `bun run ralphy -- <command>` or `bun run ralph -- <command>` (alias).

Resources: `brand`, `persona`, `ref`, `project`, `template`, `batch`, `asset`, `workspace`, `config`, `dashboard`, `profile`

Each resource supports: `create`, `list`, `show <id>`, `update <id>`, `delete <id>`

Plus top-level: `setup` (interactive wizard), `status` (capability dashboard).

- JSON by default (parse-friendly). `-p` for pretty tables.
- Full command reference with examples: **`docs/agent-guide.md`**
- Technical spec: `docs/cli-spec.md`

## Setup wizard

`ralphy setup` — interactive multi-step wizard built on `@clack/prompts`. Detects existing keys, prompts for missing ones with API ping verification, offers to import public profiles, and optionally launches Studio + dashboard. Re-runnable safely.

```bash
ralphy setup                  # full interactive wizard
ralphy setup --status         # JSON capability status (no TUI)
ralphy setup --link <path>    # point ralphy at a project (saves to ~/.config/ralphy/)
ralphy status -p              # pretty capability table
```

For fresh-machine onboarding (download binary + run setup), use the `/ralphy-install` skill.

## Dashboard

`ralph dashboard` — real-time React SPA for viewing every entity and every media file. Auto-updates on workspace changes. "Copy to Chat" button on every media resource.

```bash
bun run dashboard            # http://localhost:4321
```

Spec: `docs/dashboard-spec.md`. Code: `dashboard/server/` + `dashboard/src/`.

## Environment Variables

In `.env` (never commit). Run `ralphy setup` to configure interactively — it'll prompt only for missing keys and verify each with an API ping. The pipeline degrades gracefully when optional keys are missing; capabilities are tracked in `cli/lib/capabilities.ts`.

```
# Required for the core pipeline:
FAL_KEY=                       # fal.ai — image / video / lipsync / music
ELEVENLABS_API_KEY=            # ElevenLabs — Russian voiceover

# LLM provider (pick at least one — Vercel preferred):
VERCEL_AI_GATEWAY_KEY=         # Vercel AI Gateway — unified LLM/vision (Gemini, Claude, GPT)
OPENROUTER_API_KEY=            # OpenRouter — fallback LLM
OPENAI_API_KEY=                # OpenAI — last-resort LLM (no Gemini)

# Optional:
REPLICATE_API_KEY=             # Replicate — alt for some video models
```

LLM/vision calls go through `cli/lib/providers/llm.ts` → `callLLM()` which auto-picks the best available provider. Don't hardcode `https://openrouter.ai/...` in new scripts — use `callLLM()` so users can swap to Vercel without code edits.

## Skills Pipeline (role-based)

```
/ralph-researcher    → topic discovery + website/social references
                       (workspace/research/{topic-slug}/
                        workspace/references/{site-or-handle}/)
/ralph-scenarist     → scenario.json (new or iterated from feedback)
                       (workspace/projects/{id}/scenario.json)
/ralph-art-director  → prompts.json + generated assets + manifest
                       (workspace/projects/{id}/prompts.json, assets/, asset-manifest.json)
                       handles single-slot regeneration and A/B variants
/ralph-editor        → Remotion composition + final MP4
                       (workspace/projects/{id}/composition-props.json,
                        src/videos/<slug>/, workspace/projects/{id}/render/final.mp4)
/ralph-producer      → end-to-end orchestration, batch-from-template,
                       template extraction/review, profile share
/ralph-core          → dev env bootstrap (Studio + dashboard),
                       fresh-machine setup, CLI cookbook, log inspection,
                       debugging failed generations
/remotion-best-practices → Remotion knowledge base (captions, transitions,
                           audio, ffmpeg, library primitives) — read as a
                           reference manual, not a standalone runner
/skill-creator       → meta-skill for creating / editing / evaluating skills
```

See the trigger table under **Proactive Skill Routing** for when each one fires without an explicit command.

## Templates — starting from a proven format

Templates live in `workspace/templates/`. Two shapes:

- **Flat** — `workspace/templates/<id>.json` — scenario only (created via `ralph template create --from-project <id>`).
- **Dir** (preferred) — `workspace/templates/<id>/` with `template.json` (metadata) + `TEMPLATE.md` (LLM-facing doc) + optional `reference-example.md` (concrete example from the source project), `fragments.md`, `model-stack.md`, `composition.md`. Assembled manually, registered with `ralph template register <id>`.

**Canonical template:** `soviet-nostalgic` (two-era TikTok narrative, see `workspace/templates/soviet-nostalgic/TEMPLATE.md`). Usage:

```bash
bun run ralph -- template list                    # list what's available
bun run ralph -- template show soviet-nostalgic   # read TEMPLATE.md
bun run ralph -- template show soviet-nostalgic --path   # path to the dir
bun run ralph -- template use soviet-nostalgic \  # scaffold a new project
  --project my-new-ad-001 \
  --name "My New Ad" \
  --brief "One-line brief"
```

After `template use`, the new project gets `TEMPLATE_ORIGIN.md` (pointer to the template with a reading list) and the standard subdirectories (`assets/`, `logs/`, `scripts/`, `render/`). **A template is a vibe reference, not a scenario generator.** The scenario itself is written fresh through `/ralph-scenarist`, using TEMPLATE.md + reference-example.md as vibe sources. Do not copy VO lines, clip tables, or timings literally — those vary from project to project.

**When to extract a template:** after at least one video that landed well and the format can be reused. Keep the concrete example as `reference-example.md` (shows the vibe on real content), factor reusable prompt fragments and model-stack rationale into `fragments.md` / `model-stack.md`. **No Mad Libs.** A template must transmit vibe and let the chat make fresh decisions per project, not be filled in mechanically with `{VAR}` slots.

## Project Memory — what to save while working

Every project keeps an append-only creation log under `workspace/projects/{id}/logs/`:

- `generations.jsonl` — every model call (fal.ai / ElevenLabs / Lyria2) with input, output URL, latency, cost estimate, note
- `user-prompts.jsonl` — chronological user prompts with a `stage` label (`brief`, `scenario-feedback`, `regeneration-request`, …)
- `user-assets.jsonl` — user-uploaded references (screenshots, character photos, brand docs) with a `purpose`

**Why:** in the next chat, handing over a project path is enough to instantly recover: what the user asked for, what assets they dropped in, which models were used, what worked and what was rejected.

**How to log:**

```ts
import { logGeneration, logUserAsset, logUserPrompt, loggedFetch } from "../../../../cli/lib/gen-log.js";

// Option 1: manual log
await logGeneration("my-project-001", {
  provider: "fal",
  endpoint: "fal-ai/nano-banana-pro/edit",
  kind: "image",
  input: { prompt, image_urls },
  output: { url: result.images[0].url, local: savedPath },
  status: "ok",
  cost_usd: 0.15,
  note: "clip-03 keyframe",
});

// Option 2: loggedFetch — fetch wrapper, auto-logs
const resp = await loggedFetch({
  projectId: "my-project-001",
  provider: "fal",
  endpoint: "fal-ai/kling-video/v3/pro/image-to-video",
  kind: "video",
  input: body,
  note: "clip-07 reshape motion",
}, "https://queue.fal.run/fal-ai/kling-video/v3/pro/image-to-video", { method: "POST", headers, body: JSON.stringify(body) });
```

**CLI access to logs:**

```bash
bun run ralph -- project log <id>                    # last 50 generations
bun run ralph -- project log <id> --type user-prompts
bun run ralph -- project log <id> --type all --limit 200
bun run ralph -- project timeline <id>               # merged view: user prompts + assets + generations in chronological order
bun run ralph -- project log-prompt <id> --text "..." --stage feedback
bun run ralph -- project log-asset <id> --kind photo --source path --purpose character-ref
```

**Rules:**
- Every script under `workspace/projects/{id}/scripts/` must call `logGeneration()` or `loggedFetch()` for every API call.
- The user's brief is saved to `BRIEF.md` at project start **and** logged via `logUserPrompt(id, { text: brief, stage: "brief" })`.
- When the user drops a reference photo or screenshot, copy it to `assets/uploaded/` and call `logUserAsset`.
- Regenerations always carry a clear `note` describing what changed (e.g. `"clip-03 v2 hand crumples sample"`).

## Profiles — sharing workspace via the repo

`workspace/` is gitignored — each user generates locally. To share artifacts (templates, references, example projects) with others, **export to `profiles/<nickname>/`** (committed) and push.

```bash
bun run ralph -- profile export klimetzc            # workspace/ → profiles/klimetzc/
bun run ralph -- profile list                        # who's in the repo
bun run ralph -- profile show klimetzc               # PROFILE.md (what's inside)
bun run ralph -- profile import klimetzc             # profiles/klimetzc/ → workspace/
bun run ralph -- profile import klimetzc --overwrite # replace local files
bun run ralph -- profile export klimetzc --include-renders  # include heavy mp4s
```

**What goes into a profile:** `templates/`, `references/`, `projects/` (without `render/`, `renders/`, `assets/videos/`, `*.mp4|.mov|.webm`, `node_modules/`, `batches/`), plus `.ralph/registry.json`. Plus an auto-generated `PROFILE.md` with metadata and a summary.

**Import is additive:**
- Files that already exist locally are preserved (`--overwrite` replaces them).
- `.ralph/registry.json` is deep-merged (local entities survive).
- `*.jsonl` logs are appended unique (duplicate lines dropped).

**When to export:** after a new template, a reference-worthy project, a design extract worth sharing. Do not commit a profile on every small tweak — that's history bloat.

## Testing

This project follows TDD — **write tests before or right after the code.** A task is not done until tests exist.

### Tooling

- **Playwright** — main tool for end-to-end UI tests (dashboard, Remotion Studio). Installed in `dashboard/`. Run: `cd dashboard && bunx tsx <test-file>.ts`.
- **CLI tests** — test every CLI command via `bunx tsx cli/index.ts <command>` and check the JSON output. Bash scripts or TypeScript tests both fine.
- **Remotion** — confirm compositions render without errors: `bunx remotion render <id> --frames=0-10` for a fast smoke check.

### What to test

- **CLI**: every new command — create, read, update, delete. Validate JSON output and workspace files.
- **Dashboard**: new views/components — Playwright test: opens, renders, no console errors, interactivity works.
- **Remotion components**: new component — confirm Remotion Studio shows it and rendering does not crash.
- **Skill scripts**: new script — test with mock data, verify output files.

### Approach

1. Write the code.
2. Write the test (Playwright for UI, shell/TS for CLI).
3. Run the test, confirm it passes.
4. Only then consider the task done.

## Conventions

- Skill scripts are TypeScript, run via `node --strip-types` (or `bunx tsx`).
- Generated content lives in `workspace/` only — never permanently in `src/` or `public/`.
- `public/` is a temporary render bridge (symlinks from workspace).
- Project ID: `{context}-{NNN}` (e.g. `spring-2026-001`).
- Scene ID: `scene-{NN}` (e.g. `scene-01`).
- Asset slot ID: `{scene-id}-{type}-{descriptor}` (e.g. `scene-01-bg-image`).
- All Remotion packages must share one version (currently `4.0.441`).
- Use `<Folder>` in `Root.tsx` to organize compositions: `Library/*` and `Videos/*`.
- Use `staticFile()` for every asset reference in compositions.

## Workspace Layout

```
workspace/
  references/{site-name}/     — design extracts from websites
  references/{handle}/        — social content analysis
  projects/{project-id}/      — one per video
    BRIEF.md                  — original user brief (human-readable)
    TEMPLATE_ORIGIN.md        — pointer to the source template (if scaffolded)
    scenario.json             — master scenario
    prompts.json              — generation prompts
    assets/                   — generated media (images, videos, voiceover, music, captions)
    asset-manifest.json       — registry of asset paths
    composition-props.json    — resolved Remotion props
    scripts/                  — project-specific generation scripts
    logs/
      generations.jsonl       — every model call (append-only)
      user-prompts.jsonl      — chronological user prompts
      user-assets.jsonl       — user-uploaded references
    render/                   — final video
  batches/{batch-id}/         — batch operation state
  templates/
    <id>.json                 — flat template (scenario only)
    <id>/                     — dir template (TEMPLATE.md + fragments + model-stack + composition + reference-example)
```
