<div align="center">

<img src="docs/branding/banner.png" alt="RALPHY — UGC video pipeline CLI" width="100%" />

**An autonomous UGC-video studio in one repo.**
Drive it from a chat. Get an mp4 in ~8 minutes.

[![Tests](https://github.com/alecs5am/ralphy/actions/workflows/test.yml/badge.svg)](https://github.com/alecs5am/ralphy/actions/workflows/test.yml)
[![Release](https://github.com/alecs5am/ralphy/actions/workflows/release.yml/badge.svg)](https://github.com/alecs5am/ralphy/actions/workflows/release.yml)
[![Latest release](https://img.shields.io/github/v/release/alecs5am/ralphy?include_prereleases&label=release)](https://github.com/alecs5am/ralphy/releases)
[![Bun](https://img.shields.io/badge/runtime-bun-fbf0df?logo=bun&logoColor=000)](https://bun.sh)
[![TypeScript](https://img.shields.io/badge/lang-typescript-3178c6?logo=typescript&logoColor=fff)](https://www.typescriptlang.org/)
[![Remotion](https://img.shields.io/badge/render-remotion%204.0.441-3b82f6)](https://remotion.dev)
[![Made with Claude](https://img.shields.io/badge/built%20with-claude%20code-d97706)](https://claude.com/claude-code)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](#contributing)

</div>

---

## What is this

`ralphy` is a CLI + Remotion render pipeline + Claude Code skill library that turns a one-line prompt into a finished UGC-style mp4. It wires up:

- **OpenRouter** — image (`gemini-3-pro-image-preview`), video (`kling-v3.0-pro`, `veo-3.1`, `seedance-2.0`, …), LLM/vision, transcription
- **ElevenLabs** — voiceover (`eleven_multilingual_v2` / `eleven_v3`) + music beds
- **Remotion** — composition, captions, transitions, final render
- **A local job queue** — SQLite + a detached worker, so an agent can fire 11 generations and walk away

You drive the whole thing from chat ("make a video in soviet style about \<thing\>") or from the CLI directly. No SaaS, no dashboard, no FAL/Vercel/OpenAI wrappers — just two API keys.

> **Two keys, two commands, two minutes.** Then ask the chat for a video.

## Demo

```text
You          ▸ Make a 30s explainer in soviet-nostalgic style about my new espresso machine.
ralphy       ▸ Reading template `soviet-nostalgic`… picked.
             ▸ Pulling reference assets from ralphy-assets… ✓ (3 files, cached)
             ▸ Drafting scenario (6 scenes, ≤10-word hook, problem→solution)… ✓
             ▸ Queueing 6 image gens + 6 video gens + 1 VO + 1 music…    job id 41
             ▸ [watch] 13/13 done · $7.84 spent · 6:42 elapsed
             ▸ Rendering composition… workspace/projects/espresso-001/render/final.mp4
             ▸ Done. 30.0s · 1080×1920 · 24 fps.
```

Total cost on the default stack: **~$8–12 per 30s video.** Speed: **~8 min cold-start, ~25 min for a 10-batch.**

## Install

### One-liner (binary, recommended)

**macOS / Linux** (and Git Bash / WSL / Cygwin on Windows):

```bash
curl -fsSL https://raw.githubusercontent.com/alecs5am/ralphy/main/install.sh | sh
```

**Windows PowerShell:**

```powershell
irm https://raw.githubusercontent.com/alecs5am/ralphy/main/install.ps1 | iex
```

Detects your OS/arch (darwin-arm64, darwin-x64, linux-x64, linux-arm64, windows-x64), downloads the matching binary from the latest GitHub Release, drops it at `~/.local/bin/ralphy` (POSIX) or `%LOCALAPPDATA%\Programs\ralphy\ralphy.exe` (Windows). The binary is a single statically linked file (~60 MB) — bun runtime + bytecode-compiled TS, no `node_modules` to manage.

The installer:
- strips macOS Gatekeeper quarantine + Windows MOTW so the binary runs without prompts
- appends the install dir to your shell's PATH (`~/.zshrc` / `~/.bashrc` / fish config / user PATH on Windows) — idempotent, re-runs don't duplicate
- prints an "upgraded `1.0.0` → `0.0.1`" delta when overwriting an older install

After installing, reload your shell (or open a new terminal) and:

```bash
ralphy --version          # sanity check (also: ralphy -v, ralphy version)
ralphy help               # top-level command index
ralphy help generate      # man-style detail for any subcommand
```

### Or from source

```bash
curl -fsSL https://bun.sh/install | bash       # bun
brew install ffmpeg                             # ffmpeg (or apt install ffmpeg)
git clone https://github.com/alecs5am/ralphy.git
cd ralphy && bun install
bun run ralphy -- --version
```

## Setup

Two flavours: **interactive wizard** (humans) and **non-interactive** (agents / CI).

**Interactive:**
```bash
ralphy setup
```
Walks you through linking the project dir, entering `OPENROUTER_API_KEY` + `ELEVENLABS_API_KEY` (verified via API ping), and optionally importing a public profile. Idempotent — re-runs are safe.

**Non-interactive (for AI agents in a terminal, or CI):**
```bash
# Keys from explicit flags
ralphy setup -y --project-dir /path/to/ralphy \
  --openrouter-key sk-or-... --elevenlabs-key xi-...

# Or pipe a key in via stdin (no shell history leak)
cat or-key.txt | ralphy setup -y --project-dir /path/to/ralphy --openrouter-key -

# Or pick them up from the current env
OPENROUTER_API_KEY=sk-or-... ELEVENLABS_API_KEY=xi-... \
  ralphy setup -y --project-dir /path/to/ralphy --keys-from-env
```
Emits a structured JSON summary, exits non-zero on real failures (bad project dir, unverified key without `--allow-unverified`). Full flag list: `ralphy setup --help`.

**Verify:**
```bash
ralphy doctor          # blockers: []  ← green
```

## First video

```bash
claude          # launch Claude Code in this folder
```

Then in chat:

> **"Set up the dev env and make me a video in soviet style about \<your product\>"**

The agent reads `AGENTS.md`, picks a template, drafts a scenario, queues asset generations, renders the mp4, and hands you the path. You watch progress via `ralphy queue watch` if you want a live dashboard.

## What you can ask for

| You want | You say | What happens |
|---|---|---|
| Video in a proven format | "Make a video in soviet style about **\<topic\>**" | `soviet-nostalgic` template → finished mp4 |
| A whole batch | "10 videos in style X across **\<topics\>**" | Brainstorm → approve → queued in parallel (`batch submit`) |
| Style transfer from a URL | "Use the design from **\<url\>** for a landing-page promo" | researcher → scenarist → art-director → editor playbook chain |
| Creator breakdown | "Check **@handle** on Instagram, what's working" | researcher playbook + scoreTikTok rubric |
| Save what you just built | "Save project **\<id\>** as template **\<slug\>**" | Adds to `templates/` (TEMPLATE.md + fragments + reference example) |
| Share your work | "Export my profile **\<nick\>**" | Dumps `workspace/` to `profiles/<nick>/` ready to commit |

Talk to it like a producer — say what you want delivered, not how.

## Direct CLI

Full command surface lives in [`CLI.md`](CLI.md). Highlights:

```bash
# Discovery
ralphy --help                              # top-level
ralphy <resource> <action> --help          # always check before guessing flags
ralphy models list                         # 13 OR video models, current price + param matrix
ralphy template suggest "<utterance>"      # rank templates against free text

# Single-shot generation (validated against per-model whitelists)
ralphy generate video --project p-001 --slot scene-01-vid \
  --model kwaivgi/kling-v3.0-pro --duration 5 --aspect-ratio 9:16 \
  --first-frame .../scene-01-img.png --prompt "..." --dry-run

# Queue + daemon (fire-and-forget)
ralphy generate video ... --queue --queue-tag scenes      # enqueue
ralphy queue watch                                         # ANSI dashboard
ralphy queue logs <id> --follow                            # tail one job

# CRUD on projects, templates, refs, brands, personas, batches, profiles
ralphy project list / show / log / timeline / score
ralphy template list / show / use / suggest

# Render
ralphy render <project-id> --loudnorm
```

JSON by default (parse it). `-p` switches to human tables.

## Architecture

```
ralphy/
├── cli/                  ralphy CLI (TypeScript, bun runtime)
│   ├── commands/         resource subcommands (generate, queue, daemon, render, …)
│   └── lib/              providers/ jobs/ ffmpeg-recipes/ or-catalog/ …
├── src/
│   ├── lib/              durable Remotion components (captions, overlays, layouts)
│   └── videos/<name>/    per-video compositions
├── templates/            committed template pack (vibe-reference + vibe-style)
├── workspace/            generated files (gitignored)
│   ├── projects/<id>/    per-project assets, manifests, logs, render
│   └── .ralph/           jobs.sqlite, daemon.pid, or-catalog cache
├── profiles/             committed dumps of users' workspaces (additive imports)
├── docs/playbooks/       role/domain instruction docs (researcher, scenarist, …)
├── tests/                unit + integration + live (env-gated)
├── AGENTS.md             playbook router (auto-loaded into the system prompt)
├── CLAUDE.md             repo orientation
├── MODELS.md             current model snapshot (read before any model call)
└── CLI.md                ralphy command cheatsheet
```

The runtime stack is two providers (`OPENROUTER_API_KEY`, `ELEVENLABS_API_KEY`), one render engine (Remotion), one local SQLite queue, and a detached bun worker. No SaaS, no dashboard, no agent runtime.

## Templates & profiles

- **Templates** ship in two roots — `templates/` (repo-public, committed) and `workspace/templates/` (user-local, gitignored). Workspace overrides repo on id collision. Two `kind`s today: `vibe-reference` (full production templates with composition + reference example) and `vibe-style` (prompt cookbooks: hooks, camera vocab, worked examples). Roster: [`docs/templates-index.md`](docs/templates-index.md).

- **Profiles** are committed dumps of someone's `workspace/`. Import is additive — your local files aren't overwritten, registry and logs are merged. Heavy renders are dropped from exports unless `--include-renders`.

  ```bash
  ralphy profile list
  ralphy profile import <nick>             # additive
  ralphy profile import <nick> --overwrite # replace conflicts
  ralphy profile export <your-nick>
  ```

- **Heavy assets** (trend music, full example projects) live in the [`ralphy-assets`](https://github.com/alecs5am/ralphy-assets) companion repo. They auto-pull on `ralphy template use` into `workspace/.ralph/asset-cache/` (SHA-256 verified, no auth).

## Documentation

| File | Read when |
|---|---|
| [`AGENTS.md`](AGENTS.md) | First. Routing rules + the "read the playbook before acting" discipline. |
| [`CLAUDE.md`](CLAUDE.md) | Repo orientation, conventions, project memory model. |
| [`MODELS.md`](MODELS.md) | Before **every** model call. Claude's training is stale on current models / prices. |
| [`CLI.md`](CLI.md) | Before running an unfamiliar `ralphy` verb / flag. |
| [`docs/playbooks/`](docs/playbooks/) | Per-role instructions (researcher, scenarist, art-director, editor, producer, core, ralphy-install, remotion). |
| [`docs/use-cases.md`](docs/use-cases.md) | Canonical utterances when routing is ambiguous. |
| [`docs/templates-index.md`](docs/templates-index.md) | Template roster. |
| [`docs/cli-spec.md`](docs/cli-spec.md) | Formal CLI spec. |
| [`docs/perf-targets.md`](docs/perf-targets.md) | Speed targets. |

## Contributing

```bash
git clone https://github.com/alecs5am/ralphy.git
cd ralphy && bun install

# Dev loop
bun run dev                    # Remotion Studio (composition preview)
bun run lint                   # eslint src/ + tsc
bun test                       # full suite (unit + integration)
bun run test:unit              # unit only
bun run test:integration       # integration only
bun run test:live              # live API tests (RUN_LIVE_TESTS=1, ~$0.15)

# Build binaries
bun run build:bin              # all platforms → dist/binaries/
bun run build:bin:current      # current platform only

# Release
git tag v0.2.0 && git push --tags    # release.yml builds + uploads to GitHub Release
```

A pre-commit hook (husky 9) runs unit + integration tests on every commit. CI runs the same on push/PR via [`test.yml`](.github/workflows/test.yml).

PRs welcome — especially new templates, new model entries in `MODELS.md`, and bug fixes in `cli/lib/providers/`. For non-trivial changes, open an issue first.

## FAQ

<details>
<summary><b><code>ralphy: command not found</code></b></summary>

`~/.local/bin` isn't in `PATH`. Add to `~/.zshrc` (or `~/.bashrc`):
```bash
export PATH="$HOME/.local/bin:$PATH"
```
Then `source ~/.zshrc`.
</details>

<details>
<summary><b><code>ralphy status</code> says "Could not locate the ugc-cli project"</b></summary>

Link the project: `ralphy setup --link /path/to/ralphy`. Or just `cd` into the project folder.
</details>

<details>
<summary><b>How do I run setup without a TTY (CI / agent)?</b></summary>

Use `ralphy setup -y` with `--openrouter-key`, `--elevenlabs-key`, `--keys-from-env`, or stdin (`--openrouter-key -`). See the **Setup** section above.
</details>

<details>
<summary><b>Which providers are mandatory?</b></summary>

Just two — `OPENROUTER_API_KEY` (image / video / LLM / vision / transcribe) and `ELEVENLABS_API_KEY` (voice + music). FAL / Vercel / OpenAI direct / Replicate are **not used**; the v2 stack is consolidated on OpenRouter.
</details>

<details>
<summary><b>Is it safe to put keys in <code>.env</code>?</b></summary>

Yes — `.env` is in `.gitignore`. `ralphy setup` validates each key with an API ping before saving (skip with `--no-verify`).
</details>

<details>
<summary><b>Can I use this without Claude Code?</b></summary>

Yes — every command is a `ralphy` verb. The chat layer just routes prompts to playbooks; you can drive the CLI by hand. See [`CLI.md`](CLI.md) and [`docs/cli-spec.md`](docs/cli-spec.md).
</details>

<details>
<summary><b>What costs are realistic per video?</b></summary>

A 30s vertical UGC video on the default kling stack: ~$8–12 (image gens, 6×5s video clips, 1 VO, 1 music bed). Use `--dry-run` on any `ralphy generate` to preview cost without spending. See `MODELS.md` for the per-model price table.
</details>

<details>
<summary><b>How do I update <code>ralphy</code>?</b></summary>

Re-run the install script — it overwrites the binary:
```bash
curl -fsSL https://raw.githubusercontent.com/alecs5am/ralphy/main/install.sh | sh
```
Pin a version: `RALPHY_VERSION=v0.2.0 curl ... | sh`.
</details>

<details>
<summary><b>Uninstall</b></summary>

```bash
rm ~/.local/bin/ralphy
rm -rf ~/.config/ralphy
```
The cloned repo is removed with `rm -rf`.
</details>

<details>
<summary><b>Won't run on an old Intel Mac / Linux without AVX2</b></summary>

Open an issue — happy to add `-baseline` builds to the release artefacts.
</details>

## License

UNLICENSED — private project. Use at your own risk; no warranty. Author may relicense before a public release.

---

<div align="center">

Built by [@alecs5am](https://github.com/alecs5am) · Powered by [Remotion](https://remotion.dev), [OpenRouter](https://openrouter.ai), [ElevenLabs](https://elevenlabs.io), and [Bun](https://bun.sh)

</div>
