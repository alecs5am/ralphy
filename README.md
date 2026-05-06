# ugc-cli — UGC video generation pipeline

A studio in one repo. Scripted CLI (`ralphy`) + Remotion composition library + dashboard + Claude skill library. Open Claude Code, say "make me a video in style X about Y" — get a finished mp4.

> Not a developer? That's fine. You only need **three commands**: `ralphy setup`, `ralphy status`, and text in chat. Skills handle the rest.

---

## ⚡ Quick install (3 minutes)

### 1. Install dependencies

```bash
# Bun (runtime + package manager)
curl -fsSL https://bun.sh/install | bash

# ffmpeg (for video/audio processing — Remotion calls it)
brew install ffmpeg          # macOS
# or: sudo apt install ffmpeg  # Linux
```

### 2. Install the `ralphy` CLI

```bash
curl -fsSL https://raw.githubusercontent.com/alecs5am/ralphy/main/install.sh | sh
```

The script:
- detects your OS/arch (darwin-arm64, darwin-x64, linux-x64, linux-arm64, windows-x64),
- downloads the matching binary from the latest GitHub Release,
- drops it into `~/.local/bin/ralphy`,
- reminds you to add `~/.local/bin` to `PATH` if it isn't there yet.

The binary is a single statically linked file (~60 MB) with bun-runtime + bytecode-compiled TS code inside. Nothing else needed.

Check:

```bash
ralphy --version
```

### 3. Clone the project

```bash
git clone https://github.com/alecs5am/ralphy.git
cd ralphy
bun install
```

### 4. Run the setup wizard

```bash
ralphy setup
```

Interactive multi-step:

1. **Project** — links `ralphy` to this folder (saved to `~/.config/ralphy/config.json`).
2. **API keys** — multi-select providers → password-prompt for each → API ping for verification:
   - **OPENROUTER_API_KEY** *(required)* — image / video / LLM / vision / transcribe (one key for the entire media stack: gemini-3-pro-image-preview, kling-v3.0-pro, veo-3.1, seedance-2.0, claude/gpt LLM, whisper-1)
   - **ELEVENLABS_API_KEY** *(required)* — voiceover (eleven_multilingual_v2) + music (ElevenLabs Music)
3. **Profiles** — multi-select bundles from `profiles/` (templates + references + example projects from other users).

**The wizard is idempotent**: re-runs don't touch already-set keys, imported profiles are marked `(imported — re-import is safe)`. **Does not auto-launch Studio or dashboard** — those are separate manual commands when you actually want them.

### 5. Verify everything is OK

```bash
ralphy doctor
```

Should print `blockers: []` plus the two keys present and dependencies (bun, ffmpeg) installed.

### 6. Make your first video

```bash
claude          # launch Claude Code in this folder
```

In chat:

> **"Set up the dev env and make me a video in soviet style about \<your product\>"**

The chat will:
1. run `ralphy doctor` to confirm env is clean,
2. read the `soviet-nostalgic` template,
3. write a scenario for your product,
4. generate assets via OpenRouter (image + video models),
5. record the voiceover via ElevenLabs,
6. compose it through Remotion,
7. hand back a link to the finished mp4.

~8 minutes per video, ~$8–12 in API costs.

---

## 🎯 What you can ask the chat for

| What you want | What to say | What happens |
|---|---|---|
| Video in a proven format | "Make a video in soviet style about **\<topic\>**" | `soviet-nostalgic` → finished mp4 |
| Several videos at once | "Make 10 videos in style X on different topics around **\<area\>**" | Chat brainstorms ideas → you approve → 10 videos in parallel |
| Use another site's style | "Take the design from **\<url\>** and make a landing-page promo from it" | `/ralph-researcher` → `/ralph-scenarist` → assembly |
| Break down what some other creator does | "Check **@handle** on Instagram, see what works for them" | `/ralph-researcher` → analysis + recommendations |
| Make a new template | "Save project **\<id\>** as template **\<slug\>**" | TEMPLATE.md + fragments + model-stack + reference-example |
| Share your own work | "Export my profile **\<your-nick\>**" | Dump `workspace/` into `profiles/<nick>/` ready to commit |
| Pull in someone else's work | "Import profile **\<nick\>**" | Adds their templates/references on top of yours |

**The main rule: talk to it like a producer.** Don't tell the chat *how* to do it — tell it what you want delivered.

---

## 🛠 Direct commands (no chat)

`ralphy` is the main CLI. Installed globally, works from any folder (locates the project via `~/.config/ralphy/config.json` or by walking up from cwd).

```bash
ralphy status -p              # color summary of keys and providers
ralphy project list           # all projects
ralphy project show <id>      # project details
ralphy project log <id>       # generation logs (models, costs)
ralphy template list          # available templates
ralphy template show <id>     # TEMPLATE.md + fragments
ralphy template use <id> --project <new-id> --name "..." --brief "..."
ralphy profile list           # available public profiles
ralphy profile import <nick>  # pull into your workspace
ralphy profile export <nick>  # dump your workspace into the repo
ralphy doctor                 # JSON env check (keys, deps, blockers)
ralphy setup                  # re-run the wizard
ralphy setup --status         # JSON status for scripts
ralphy setup --link <path>    # link to another project
ralphy setup --unlink         # remove the link
```

In the project root the same commands are available via `bun run` (no binary required):

```bash
bun run dev                   # Remotion Studio
bun run dashboard             # dashboard
bun run setup                 # wizard (= ralphy setup)
bun run ralphy -- <args>      # CLI (= ralphy <args>)
bun run lint                  # eslint + tsc
```

---

## 📦 Profiles — sharing work

The `profiles/<nick>/` folder is a committed dump of someone's local `workspace/`. Templates, references, example projects. Import is **additive** — your local files aren't overwritten, registry and logs are merged.

```bash
ralphy profile list
ralphy profile show ralphy-showcase
ralphy profile import ralphy-showcase       # additive
ralphy profile import ralphy-showcase --overwrite   # replace conflicting files
ralphy profile export <your-nick>    # dump your work
```

Heavy renders (`render/`, `*.mp4`) are dropped from exports automatically. Want to keep them — `--include-renders`.

---

## 🗂 Layout

```
ugc-cli/
  CLAUDE.md           ← instructions for the chat itself (how to operate)
  MODELS.md           ← registry of current AI models with prices and avoid-lists
  README.md           ← this file
  install.sh          ← curl-installer for the ralphy binary
  cli/                ← TypeScript sources for the CLI
  src/                ← Remotion components + compositions
  dashboard/          ← React SPA for browsing projects
  scripts/            ← helper scripts (build-binaries.ts and friends)
  workspace/          ← locally generated files (gitignored)
  profiles/           ← committed dumps of other workspaces
  .agents/skills/     ← skills (source of truth)
  .claude/skills/     ← symlinks to .agents/skills/ for Claude Code
  docs/               ← technical documentation
  dist/binaries/      ← built binaries (gitignored)
```

---

## 🔧 If you're a developer

```bash
git clone https://github.com/alecs5am/ralphy.git
cd ralphy
bun install
bun run setup                 # or: tsx cli/index.ts setup

# Dev loop
bun run dev                   # Remotion Studio (composition preview)
bun run dashboard             # dashboard at :4321
bun run lint                  # eslint src/ + tsc

# Build binaries for all platforms (~15s, requires Bun)
bun run build:bin             # → dist/binaries/ralphy-{darwin,linux,windows}-{arch}
bun run build:bin:current     # current platform only

# Release
git tag v0.1.0 && git push --tags     # GH Action builds and uploads to Release
```

Full technical docs:

- [`CLAUDE.md`](CLAUDE.md) — main rules, secret sauce, skill routing
- [`MODELS.md`](MODELS.md) — which AI models to use and why
- [`docs/agent-guide.md`](docs/agent-guide.md) — every ralphy command with examples
- [`docs/cli-spec.md`](docs/cli-spec.md) — formal CLI spec
- [`docs/dashboard-spec.md`](docs/dashboard-spec.md) — dashboard spec

---

## ❓ FAQ / Troubleshooting

**`ralphy: command not found`**
`~/.local/bin` isn't in `PATH`. Add to `~/.zshrc` (or `~/.bashrc`):
```bash
export PATH="$HOME/.local/bin:$PATH"
```
Then `source ~/.zshrc`.

**`ralphy status` says "Could not locate the ugc-cli project"**
Link the project: `ralphy setup --link /path/to/ugc-cli`. Or just `cd` into the project folder.

**`ralphy setup` silently hangs**
Make sure the terminal has a TTY. In CI/non-interactive environments use `ralphy setup --link ... --status` — no TUI.

**What if I don't have ~$15 per video?**
You can run only the cheap stages (research, scenario, prompts) — they cost pennies. Defer the asset render.

**Which providers are mandatory?**
Just two — `OPENROUTER_API_KEY` (image / video / LLM / vision / transcribe — single key for the whole media stack) and `ELEVENLABS_API_KEY` (voice + music). FAL / Vercel / OpenAI / Replicate are **not needed** in v2 — the stack is consolidated on OpenRouter.

**Is it safe to put keys in `.env`?**
Yes — `.env` is in `.gitignore`, never goes to the repo. `ralphy setup` validates each key with an API ping before saving.

**Can I do all this without Claude Code?**
Technically yes — every script underneath is TS. But the point of the project is to delegate to the chat. Manual mode lives in [`docs/agent-guide.md`](docs/agent-guide.md).

**Where do I look at what came out?**
In chat — `ralphy project show <id>` + `ralphy project log <id>` + the final mp4 path. The web dashboard was retired in v2; the code stays for legacy use but isn't supported.

**Installed but want to remove.**
```bash
rm ~/.local/bin/ralphy
rm -rf ~/.config/ralphy
```
The project folder `ugc-cli/` is removed with a regular `rm -rf`.

**Update ralphy to a new version?**
The same install script overwrites the binary:
```bash
curl -fsSL https://raw.githubusercontent.com/alecs5am/ralphy/main/install.sh | sh
```
Specific version: `RALPHY_VERSION=v0.2.0 curl ... | sh`.

**Won't run on an old Intel Mac or Linux**
You probably need a `-baseline` build (CPU support without AVX2). Open an issue and I'll add it to the release artefacts.
