# Privacy

Ralphy is a plugin made of Markdown skills, hook scripts and a Python command-line program
(`ralphy`) that runs on your machine. It has no telemetry, no analytics and no account, and it
sends nothing to the Ralphy authors.

## What is stored, and where

Everything Ralphy keeps stays on your machine:

- `~/ralphy` (`RALPHY_HOME`): your accounts, videos, references, posts and stats as plain files.
- `~/.config/ralphy` (`RALPHY_CONFIG_DIR`): `keys.env` (your provider keys) and the browser
  profiles used for posting, one per account and platform.
- `~/.cache/ralphy` (`RALPHY_CACHE_DIR`): cached copies of the hosted trend base and library. Safe
  to delete.

`ralphy doctor` reports key names, never values.

## What the CLI requests over the network

- **Hosted trends and library.** `ralphy trends` and `ralphy lib` send plain HTTPS GET requests to
  the Ralphy trend base (`ralphy-trends.web.app`) and component library (`ralphy-library.web.app`) on
  Firebase Hosting. A request carries the path of the file asked for and a
  `User-Agent: ralphy/<version>` header. No account, key, content or identifier is sent. Hosting
  logs of these requests (IP address, user agent) are kept by Google as the hosting provider.
  Override the hosts with `RALPHY_TRENDS_URL` and `RALPHY_LIBRARY_URL`.
- **Installers on first use.** `bin/ralphy` downloads uv from `astral.sh` when it is missing
  (skipped when `RALPHY_NO_AUTO_INSTALL` is set), and uv then installs the locked Python
  dependencies from PyPI. `ralphy render` installs Bun from `bun.sh` when neither Bun nor Node
  exists, and runs HyperFrames (`hyperframes@0.6.31`) from the npm registry. New compositions load
  GSAP from `cdn.jsdelivr.net` when rendered.
- **References.** `ralphy tool pull` downloads the video you point it at with yt-dlp.

## Posting

`ralphy post run` drives Google Chrome with a separate persistent profile per account and platform
(YouTube, TikTok, Instagram, X). You sign in by hand in that browser window; Ralphy never sees or
stores your passwords. It posts only rows you approved, and only to your own accounts. Traffic goes
from your machine to those platforms under their own privacy policies.

## Generation

Ralphy does not call generation providers itself. The fal MCP server in `.mcp.json`
(`mcp.fal.ai`) is connected by your coding agent with your own `FAL_KEY`; prompts and reference
media for a generation go from your agent to fal under fal's privacy policy. `ELEVENLABS_API_KEY`
and `OPENROUTER_API_KEY`, if you set them, are used by your agent or the bundled tools only when you
ask for those providers.

## The panel

`ralphy panel` serves a page on `127.0.0.1` only. It reads your files and makes no outside request.

## Your coding agent

Your coding agent (Claude Code, Codex, or another) sees what the skills and CLI output show it,
under that agent's own privacy terms.

Questions: open an issue at https://github.com/alecs5am/ralphy/issues.
