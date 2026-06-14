# `ref pull` should store references inside the active workspace, not the global tree

> **Status:** done — 2026-06-14 (canonical location: workspaces/<ws>/shared/refs/; default workspace stays global)
> **Filed:** 2026-06-12
> **Folder:** issues

## Context

Surfaced in the `trafalgar` workspace session (2026-06-12). The user created a
workspace, ran `ralphy ref pull <ig-url>` ×4, then could not find the pulled
videos anywhere under `.ralphy/workspaces/trafalgar/` — they had landed in the
global `.ralphy/references/<slug>/` tree. User (paraphrased): *"if I'm working
inside a workspace, the refs should be in the workspace — I don't want to hunt
for them somewhere global."*

## What

When a workspace is active, the `ref` verbs should resolve to a
**workspace-local** reference store by default instead of the global
`.ralphy/references/` tree:

- `ref pull` writes into the active workspace (e.g.
  `.ralphy/workspaces/<ws>/refs/<slug>/` — or `shared/refs/<slug>/` if we want
  refs reusable across the workspace's projects; pick one and document it).
- `ref list | show | frames | analyze | analyze-video | transcribe | blueprint`
  resolve **workspace-local first, then fall back to global** so existing global
  refs keep working.
- A `--global` flag forces the old global-tree behavior; with **no active
  workspace**, global stays the default.

## Why it matters

The global tree is invisible from the workspace dir, so a user operating inside
a workspace cannot find their own pulled refs without a `fd -H` into a hidden
global path. Refs are per-project/per-collab assets in practice (the trafalgar
reels belong to the trafalgar collab), so the storage location should follow the
active workspace. Removes a "where did my download go" papercut on every
workspace session.

## Notes

- Decide the canonical location: `workspaces/<ws>/refs/` (workspace-scoped) vs
  `workspaces/<ws>/shared/refs/` (reusable across the workspace's projects). The
  `shared/` tier already exists and is documented as the cross-project reuse
  home — leaning that way, but confirm against the `<project>/artifacts/refs/`
  (#105) resolution order so the three ref homes (project → workspace → global)
  compose cleanly.
- Migration: existing global refs stay put; resolution just gains a
  workspace-local first hop. No move required.
- Related: #105 (artifacts/refs kind, project-level), #108 (workspace layer +
  shared tier), #119 (ref pull yt-dlp runtime). This issue is about *storage
  location*, orthogonal to those.

## Scope / acceptance

- `cli/commands/ref.ts` (and the path-resolution lib it uses, likely
  `cli/lib/research/*` / wherever `ref pull` computes its output dir): when a
  workspace is active, `ref pull` writes the slug dir under the workspace; add
  `--global` to opt out.
- Read verbs (`list`/`show`/`frames`/`analyze`/`analyze-video`/`transcribe`/
  `blueprint`) try workspace-local path first, then global.
- Document the resolution order (project `artifacts/refs/` → workspace refs →
  global) in `AGENTS.md` "Where data lives" + `CLAUDE.md` project-layout section.
- Tests: a `ref pull --local <mp4>` smoke with an active workspace asserts the
  slug dir is created under `.ralphy/workspaces/<ws>/...` (not global); a
  `--global` smoke asserts it lands in `.ralphy/references/`; a read-verb smoke
  asserts workspace-local resolves before a same-slug global entry.
- Gates: `bun test` green; no Cyrillic on disk.
