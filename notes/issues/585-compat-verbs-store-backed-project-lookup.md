# Compatibility project verbs must find store-only projects

> **Status:** todo
> **Filed:** 2026-10-28
> **Folder:** issues
> **Severity:** high
> **Category:** bug / domain store

## Context

Found in #573: `project log-asset`, `log-prompt`, `timeline` and the other compatibility verbs still look projects up in `registry.json`. Domain state is authoritative in SQLite (CLAUDE.md, AGENTS.md), so a project that exists only in the store (for example `deeep-guardian-rescues-002` in the owner's data) now resolves its scope cleanly and then fails with `E_NOT_FOUND`.

## What

Route every compatibility project verb through the store-backed project lookup (by id or slug, via the #573 resolver), keeping the registry only as a read-only fallback for unmigrated legacy roots if one still exists.

## Scope / acceptance

- Each verb that reads `registry.json` today is listed in the PR and switched; `rg registry.json cli/commands` shows no remaining project lookups outside migration code.
- Integration test: a store-only project works with log-asset, log-prompt and timeline.
- `bun run lint:no-legacy-state`, `lint:store-boundary` and affected tests pass.
