# AGENTS.md

Ralphy is a plugin for the user's coding agent (Claude Code, Codex, others): agent skills, a small
Python CLI (`ralphy`), bundled media tools and the fal MCP config. Ralphy holds only what an agent
cannot hold on its own: state across sessions, the browser sessions of the user's accounts, the
hosted trend base and component library, and the panel. Media work is done by the agent with
ffmpeg, HyperFrames, the fal MCP server and `tools/`.

> This file is imported by `CLAUDE.md`, so it is always in context. The build contract is
> `docs/plans/2026-11-17-ralphy-v1.md`; when this file and the contract disagree, the contract wins.

## Two entities

- **Content**: one vertical video: a HyperFrames composition, media, references, saved versions
  (code snapshots), one working render (`render.mp4`), posts. Id `<account>/<nnn>-<slug>`.
- **Account**: a media persona with a style lock, platforms, a schedule, `posts.csv`, `stats.csv`.

Loop: copy a working reference (reverse, v1), rework it for the account (remake, v2+), post, read
stats, iterate.

## Folders

User data is plain files in `~/ralphy` (`RALPHY_HOME`): `<account>/account.md`, `posts.csv`,
`stats.csv`, `videos/<nnn>-<slug>/` (`index.html`, `notes.md`, `render.mp4`, `versions/`, `media/`),
`refs/<slug>/`, and `inbox/`. Keys and browser profiles: `~/.config/ralphy`. Caches:
`~/.cache/ralphy`. Full layout: `skills/ralphy/references/layout.md`. Legacy data roots (`~/.ralphy`,
a checkout's `.ralphy/`) are never read or written by the new code.

## Skills

`skills/` (`.agents/skills` and `.claude/skills` are symlinks to it). Start with `ralphy`. Every
skill except the entry skill `ralphy` is named `ralphy-<job>`.

| Skill | Use it for |
|---|---|
| [`ralphy`](skills/ralphy/SKILL.md) | Folders, verbs, the loop, hard rules, which skill when |
| [`ralphy-trendwatch`](skills/ralphy-trendwatch/SKILL.md) | Hosted trend base, custom niches, picking outliers, signals to fixes |
| [`ralphy-reverse`](skills/ralphy-reverse/SKILL.md) | Copy a reference as exactly as possible; the result is v1 |
| [`ralphy-remake`](skills/ralphy-remake/SKILL.md) | Rework the copy for the account; keep the timing skeleton |
| [`ralphy-publish`](skills/ralphy-publish/SKILL.md) | Accounts, platforms, sign-in, captions, plan, approval, run |
| [`ralphy-fal`](skills/ralphy-fal/SKILL.md) | Generation through the fal MCP server and direct provider APIs; cost first |
| [`ralphy-library`](skills/ralphy-library/SKILL.md) | Components, video blocks and prompts from the hosted library |
| [`ralphy-media`](skills/ralphy-media/SKILL.md) | The bundled tools in `tools/` |
| [`ralphy-setup`](skills/ralphy-setup/SKILL.md) | Install, keys, fal connection, doctor, troubleshooting |

Composition engine rules come from the upstream HyperFrames skills (`bunx hyperframes@0.6.31 skills`).
Skill frontmatter carries only `name` and `description`; at most 10 skills; no content-niche,
script-writing, quality-scoring or HyperFrames house-style skills.

## Development

- Python 3.11+, uv project at the root: `pyproject.toml`, `uv.lock`, package `ralphy/`, run as
  `uv run python -m ralphy`. One module per verb in `ralphy/commands/<verb>.py` with
  `register(subparsers)`.
- Checks: `uv run ruff check ralphy tools tests` and `uv run pytest`. Tests use temporary
  `RALPHY_HOME`, `RALPHY_CONFIG_DIR`, `RALPHY_CACHE_DIR`; never real user folders, the network, paid
  APIs or a real browser login.
- Tools: `tools/<name>.py`, PEP 723 inline dependencies, the docstring's first line is the summary,
  `--help` and `--json` on each. Try one with `uv run tools/<name>.py --help`. Heavy media and ML
  libraries stay in the tools, never in the core.
- `bin/ralphy` installs uv on first run and execs `uv run --frozen --no-dev python -m ralphy`. Bun or
  Node is only for HyperFrames (`ralphy render`).
- Version: `0.8.0` in `pyproject.toml`, `ralphy/__init__.py` and both plugin manifests; a test keeps
  them equal.
- Repository files in English.

## Git and GitHub identity

This is the personal `alecs5am/ralphy` repository. Never inherit a corporate author identity or
switch the globally active `gh` account. Configure each checkout locally:

```sh
git config --local user.name alecs5am
git config --local user.email 209291055+alecs5am@users.noreply.github.com
git config --local user.useConfigOnly true
git remote set-url origin git@github-alecs5am:alecs5am/ralphy.git
```

- The `github-alecs5am` SSH host must offer only the personal key (`IdentitiesOnly yes`); check with
  `ssh -T git@github-alecs5am`. Use it for fetch and push.
- On the maintainer machine `git gh ...` is a repository-local alias that runs `gh` with the
  `alecs5am` token (`gh auth token --hostname github.com --user alecs5am`) for that process only
  and fails if the token is unavailable. Elsewhere, pass the personal token per process through
  `GH_TOKEN`.

## Hard rules for the product

1. No paid generation and no posting without the user's explicit go; show the cost first.
2. Never delete media or versions; `render.mp4` is the only file Ralphy overwrites.
3. Start from a working reference (reverse), then remake.
4. The agent uses its own tools freely (ffmpeg, curl, yt-dlp, HyperFrames). Ralphy verbs exist only
   for state, posting, rendering, trends, the library and the panel.
