---
name: ralphy-setup
description: >-
  Install and repair Ralphy: the plugin, the `ralphy` command, first-run folders, provider keys,
  the fal MCP connection, the upstream HyperFrames skills, `ralphy doctor`, and troubleshooting
  when a command or tool fails. Triggers: "install ralphy", "set up ralphy", "ralphy not found",
  "add my API keys", "fal is not connected", "run doctor", "nothing works", "it failed",
  "установи ralphy", "настрой ключи", "подключи fal", "не работает".
---

# ralphy-setup

## Install

- Claude Code: `/plugin marketplace add alecs5am/ralphy`, then `/plugin install ralphy@ralphy`.
- Codex: `codex plugin marketplace add alecs5am/ralphy`.
- Any agent: `git clone https://github.com/alecs5am/ralphy`, put `<clone>/bin` on PATH, point the
  agent at `<clone>/skills/`.

`bin/ralphy` installs uv on first run when it is missing; HyperFrames renders install Bun on demand.
`ralphy` not on PATH (Codex runs no plugin hook): call `<plugin root>/bin/ralphy`.

System tools: ffmpeg (required for tools and renders), Google Chrome (posting; renders use their own
headless Chrome). macOS: `brew install ffmpeg`.

Update: `/plugin marketplace update ralphy` in Claude Code, or `git pull` in the clone.

## First run

```bash
ralphy setup      # creates ~/ralphy and ~/.config/ralphy, writes a keys.env template, runs doctor
ralphy doctor     # tools (uv, python, bun or node, ffmpeg, Chrome), folders, which keys are set
```

`doctor` prints key names only, never values. Fix what it marks missing before anything else.

## Keys

`~/.config/ralphy/keys.env` (mode 0600), one `NAME=value` per line:

| Key | For |
|---|---|
| `FAL_KEY` | the fal MCP server and fal calls (fal.ai dashboard, API keys) |
| `ELEVENLABS_API_KEY` | direct voice, Scribe, music, sound effects (optional) |
| `OPENROUTER_API_KEY` | vision and audio models for analysis (optional) |

The user edits the file in their own editor or terminal. Never ask for a key in chat, never put one in
a command line, never print the file. Configured is not the same as accepted: no paid test call
without the user's go.

## fal MCP connection

`.mcp.json` declares the fal server with `Authorization: Bearer ${FAL_KEY}`. The agent reads
`FAL_KEY` from its own environment at start, not from `keys.env`. Two ways:

- Key: start the agent from a shell that has it, e.g.
  `set -a; . ~/.config/ralphy/keys.env; set +a; claude`, or export `FAL_KEY` in the shell profile.
  Restart the agent after changing it.
- OAuth instead of a key: Claude Code `claude mcp add --transport http --scope user fal
  https://mcp.fal.ai/mcp-relay`, then sign in with `/mcp`. Codex: `codex mcp add fal --url
  https://mcp.fal.ai/mcp-relay`, then `codex mcp login fal`.

Check: the fal tools (`search_models`, `run_model`, ...) appear in the tool list, or `/mcp` shows the
server connected. 401: the key is missing, wrong, or the account has no credits
(`check_account_status`).

## HyperFrames skills

Install the upstream composition skills once: `bunx hyperframes@0.6.31 skills`
(`npx -y hyperframes@0.6.31 skills` without Bun). They follow HyperFrames' main branch, while
`ralphy render` pins `hyperframes@0.6.31`; where a skill and
`ralphy/references/hyperframes-pitfalls.md` disagree, trust a short test render.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `ralphy: command not found` | call `<plugin root>/bin/ralphy`, or put `<plugin root>/bin` on PATH |
| A tool's first run is slow | it installs its packages and models once (stems: PyTorch); later runs start fast |
| `E_FFMPEG_MISSING` | install ffmpeg |
| `pull` fails with "Sign in" or 403 | update yt-dlp: from the plugin root, `uv run -P yt-dlp tools/pull.py --help`; then retry |
| `pull` fails on a private or login-walled post | ask the owner to allow `--cookies-from-browser <browser>`, or for the file (`ralphy tool pull <file>`) |
| fal tools missing | see fal MCP connection above; restart the agent after setting the key |
| fal 401 / billing block | key wrong or no credits; the user fixes it on fal.ai; do not retry paid calls in a loop |
| Render shows bare HTML or frozen scenes | `ralphy/references/hyperframes-pitfalls.md` |
| Render fails, disk full | renders copy the tree into `~/.cache/ralphy/render/`; free space there (safe to delete) |
| The panel does not open | `ralphy panel --json` (shows url, pid); log at `~/.cache/ralphy/panel/server.log`; `ralphy panel stop`, then `ralphy panel` |
| Trends or library unreachable | the command says so and uses the cache if any; continue without it |
| `needs_login` on a post | `ralphy account login <account> <platform>`; the owner signs in |
| A command errors | rerun with `--json` and read `error.code`, `message`, `hint` |
