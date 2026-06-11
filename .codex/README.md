# Codex Project Setup

This directory is for Codex-local, machine-specific configuration. The project
instructions for Codex live at the repository root in `AGENTS.md`.

## Routing

- Start every session from `AGENTS.md`; it is the canonical Codex router for
  Ralphy work.
- `CLAUDE.md` imports the same router for Claude Code. Do not edit Claude files
  when only refreshing Codex setup.
- Run `bun run cli/index.ts` with no subcommand at the start of a fresh agent
  session to load the local user profile, as required by `AGENTS.md`.

## Skills

- The source skill bundle lives in `.agents/skills/`.
- Codex discovers the project skill root directly; do not duplicate the bundle
  under `.codex/`.
- Claude Code uses `.claude/skills/` symlinks that point back to
  `.agents/skills/`. Leave those symlinks intact unless the task explicitly
  targets Claude Code.
- After adding or changing a skill, run `bun run lint:skills`.

## Local Config

- Keep `.codex/config.toml` local and untracked. It may contain MCP credentials
  or other secrets.
- Commit only documentation or safe examples under `.codex/`.
- If Codex routing needs to be refreshed, prefer:

```bash
bun run cli/index.ts skill install --agent codex --scope project
```

That command only updates the root `AGENTS.md` sentinel block. Do not run the
Claude adapter unless the task is explicitly to update Claude Code.
