# CLI.md — `ralphy` quick reference

Read this before running any `ralphy` command you haven't used recently. The CLI surface drifts (new flags, renamed verbs); Claude's training is stale on this repo's specifics. For deep specs see `docs/cli-spec.md` and `docs/agent-guide.md`.

## Invocation

- **Globally** (after `curl ... install.sh | sh`): `ralphy <command>`
- **In-tree dev**: `bun run ralph -- <command>` or `bun run ralphy -- <command>` (NOT `npm`/`npx`/`yarn`).
- **Always** run via `ralphy`; never reach for `bunx tsx <file>`, raw `curl` to providers, or ad-hoc `ffmpeg`. If a verb is missing, propose adding it under `cli/commands/` instead of bypassing.

## Output contract

- Default: JSON to stdout (parse it).
- `-p` / `--pretty`: human tables (use only when reporting to the user).
- `--cwd <path>`: pin the workspace root (overrides project auto-detection).
- Exit non-zero on validation/runtime failure; error message in stderr.

## Discovery

```bash
ralphy --help                       # top-level commands
ralphy <resource> --help            # subcommands for a resource
ralphy <resource> <action> --help   # full flag list (always check before guessing)
```

If you don't remember a flag, **run `--help` first**. Don't invent flags from training-set memory.

## Top-level commands

| Command | Use when |
|---|---|
| `setup` | First-time wizard — API keys, profiles, dev services. **Non-interactive** flags (`-y`, `--openrouter-key`, `--elevenlabs-key`, `--keys-from-env`, `--project-dir`, `--import-profile`, `--no-verify`, `--allow-unverified`) bypass the TUI and emit a JSON summary — use these when driving from an agent / CI. |
| `status` | Show enabled capabilities + linked project. |
| `doctor` | Env health check (keys, deps, project link). JSON for scripts; `-p` for human view. |
| `generate {image\|video\|voiceover\|music\|captions}` | Single asset gen. Logs cost+path automatically. |
| `models {list\|show <id>}` | Inspect OR video models + their per-model param whitelists. **Read before any video gen.** |
| `daemon {start\|stop\|status}` | Manage the background job worker. |
| `queue {add\|list\|show\|cancel\|retry\|logs\|watch}` | Manage queued jobs. |
| `render <project>` | Render project → `workspace/projects/<id>/render/final.mp4`. `--loudnorm` for EBU R128. |
| `assets {list\|pull\|pull-key\|install\|clean\|cache-info}` | Pull assets from the `ralphy-assets` companion repo. |
| `example {list\|pull}` | Pull complete reference projects. |
| `audio` / `video` | FFmpeg recipes (loudnorm, sidechain duck, concat, extract-segment, burn-subs, tonemap-hdr). |
| `init` / `config` | Workspace bootstrap + key/value config. |

## Resources (CRUD)

Each follows `ralphy <resource> {create\|list\|show <id>\|update <id>\|delete <id>}`:

`brand`, `persona`, `ref`, `project`, `template`, `batch`, `asset`, `workspace`, `profile`.

Notable extensions:
- `project log <id>` / `project timeline <id>` / `project log-prompt` / `project log-asset` — append-only project memory at `workspace/projects/<id>/logs/`.
- `project score <id>` — run virality rubric over `scenario.json` (no LLM).
- `project transcribe <id>` — Scribe v1 → `captions.json` (Caption[]).
- `project clone <id>` — duplicate.
- `template suggest "<utterance...>"` — keyword-rank templates (top-3 with score 0..1). **Always run first** before picking a template by hand.
- `template use <id>` — scaffold a project; auto-pulls required assets.
- `ref blueprint <slug>` / `ref scrape-trends` — research helpers.
- `batch submit --from <file>` — topo-sorted batch insert with symbolic dependencies. Use this for "N generations + 1 render".

Templates live in **two roots**: `templates/` (repo-public, committed) and `workspace/templates/` (user-local, gitignored). Workspace overrides repo on id collision.

## `generate` — the only gate to provider APIs

All four kinds share `--project <id> --slot <slot>`. Slot must match `^[a-z0-9-]+$`.

### `generate video` flags worth memorizing

| Flag | Notes |
|---|---|
| `--prompt` | Motion / camera description. |
| `--duration <s>` | Per-model whitelist — hailuo only `[6,10]`, kling `[5,10]`. Check `models show <id>`. |
| `--model <id>` | Default `kwaivgi/kling-v3.0-pro`. Full roster in `MODELS.md`. |
| `--first-frame <ref>` | URL / local path / data-URI. **Strongly recommended for portrait** when prompt has wide-shot bias (kling rotation fix). |
| `--last-frame <ref>` | Only models with `last_frame` in `supported_frame_images`. |
| `--aspect-ratio <r>` | Per-model whitelist (kling `9:16/16:9/1:1`; hailuo `16:9` only; seedance up to 7). Default `9:16`. |
| `--resolution <r>` | Per-model whitelist (kling `720p` only; veo up to 4K; seedance `480p/720p/1080p`). Default `720p`. |
| `--audio` | Veo 3 only. Unsafe outside English. |
| `--dry-run` | Validate + print resolved request + cost estimate; do not submit. **Use this first** when unsure about params. |
| `--no-validate` | Skip per-model validation (force-submit). Last-resort. |
| `--queue` | Enqueue as a daemon job, return id immediately. Pair with `--depends-on`, `--queue-tag`, `--queue-priority`. |
| `--poll-interval-ms` / `--poll-max-attempts` | Default `15000` / `80` (~20min). |

Same `--queue / --depends-on / --queue-tag / --queue-priority` flags exist on every `generate <kind>` subcommand.

### `generate image` / `voiceover` / `music` / `captions`

- `image` — default `gemini-3-pro-image-preview`. Returns PNG or JPEG (gemini sometimes returns JPEG even for `.png` slots).
- `voiceover` — ElevenLabs, default `eleven_multilingual_v2` (RU). Use `eleven_v3` for premium English only.
- `music` — ElevenLabs `music_v1`, instrumental by default.
- `captions` — Scribe v1 word-level, ≤25MB audio.

## Queue / daemon mental model

- Single SQLite file at `workspace/.ralph/jobs.sqlite`. WAL mode; concurrent readers + single writer.
- Daemon = detached `bun.spawn` process; pidfile `workspace/.ralph/daemon.pid`. Auto-started on `--queue` / `batch submit`.
- States: `pending → running → completed | failed | cancelled | blocked`. Cascade-block: a candidate with a failed/cancelled dep moves to `blocked`.
- `queue add` takes a positional `<argv...>` after `--`. For ralphy gens prefer `generate ... --queue` (cleaner — strips queue flags before re-exec).
- `queue watch` (no id) → ANSI dashboard of all active jobs. `queue watch <id>` → tail one job's logs. `queue logs <id> --follow` → stream stdout/stderr.

## Hard rules (mirror of AGENTS.md invariants)

1. **No FAL_KEY, no Vercel, no OpenAI direct.** Only `OPENROUTER_API_KEY` + `ELEVENLABS_API_KEY`. All media → `cli/lib/providers/media.ts`. All LLM → `callLLM()`.
2. **`ralphy` is the only entry-point** for model calls, ffmpeg recipes, yt-dlp pulls, project mutations. Reaching for `curl`/`bunx tsx`/raw `ffmpeg` against a workflow → STOP.
3. **Reference-required gate.** Named real entity → require user-supplied reference before any generation.
4. **Quality gates refuse, not warn.** `scoreScenario` / `scoreImage` / `scoreVideo` failing twice → stop and report options.
5. **Always check `MODELS.md` before any model call.** Then `ralphy models show <id>` for the live param matrix.
6. **`ralphy` for CRUD**, never hand-edit `workspace/`.

## Common patterns

```bash
# Bootstrap from an agent / CI, no TUI. Reads keys from current env vars.
ralphy setup -y --project-dir /path/to/ugc-cli --keys-from-env

# Same, but pipe a key in from stdin (no shell history leak)
cat or-key.txt | ralphy setup -y --project-dir /path/to/ugc-cli --openrouter-key - --elevenlabs-key xi-...

# Dry-run a video gen to see resolved request + cost
ralphy generate video --project p-001 --slot scene-01-vid --prompt "..." --duration 5 --model kwaivgi/kling-v3.0-pro --dry-run

# Queue 11 portrait clips with first-frame anchor, then render after all complete
for i in 01 02 ... 11; do
  ralphy generate video --project p-001 --slot scene-$i-vid --first-frame .../scene-$i-img.png \
    --prompt "..." --duration 5 --queue --queue-tag scenes
done
ralphy queue watch                          # ANSI dashboard until all done
ralphy render p-001 --loudnorm

# Suggest a template from a free-form ask
ralphy template suggest "talking-head educational explainer 45s"

# Inspect what kling supports right now
ralphy models show kwaivgi/kling-v3.0-pro
```

## When this doc lies

The CLI evolves faster than this file. If a flag here doesn't exist, or `--help` shows a flag not listed here, **trust `--help`** and update this doc.
