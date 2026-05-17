# 05 — Project Resources — PRD

## Problem

`workspace/projects/<id>/` is the unit of work in Ralphy. Every render reads from it; every gen writes to it. Adjacent to it sit shared resources — brands, personas, refs, templates, the asset cache. Today this layer works but is **uneven**:

1. **State is spread across too many on-disk files with no single source of truth.** A project carries `prompts.json`, `asset-manifest.json`, `STORYBOARD.md`, `scenario.json`, `captions.json`, `logs/generations.jsonl`, `logs/user-prompts.jsonl`, `logs/user-assets.jsonl`, `postmortem/`, plus arbitrary `assets/<slot>.<ext>` files. The append-only invariant from commit `d0196e2` is documented in `AGENTS.md` but not enforced in code — a stray `fs.unlink` would silently break it.
2. **No global registry.** Listing "all projects" works because `ralphy project list` greps the workspace, but cross-project queries ("which projects use the `glitter-cream` ref?") are impossible without a manual filesystem walk.
3. **Brand and Persona are underused.** CRUD exists; the scenarist playbook references them; but they're not consistently passed through to the prompt cookbook ([`02 — Prompts & Templates`](../02-prompts-and-templates/)) and not enforced as the "identity contract" they should be.
4. **Asset catalog drift.** The companion [`ralphy-assets`](https://github.com/alecs5am/ralphy-assets) repo holds the pool layer (manifest v2). `docs/assets-catalog.md` is supposed to be derived from the live manifest, but regeneration is manual (`ralphy assets catalog --write`) and easy to forget.
5. **Profiles are anemic.** `profiles/<nick>/` is committed-dump shape (`profiles/ralphy-showcase/`). Export / import works but there's no story for partial profiles ("just my brands") or for shareable profile bundles.

This category owns the data layer: what lives where, who can write to it, how it's named, how it's discovered.

## Users

| User | Need |
|---|---|
| **Human developer** | `ralphy project list` shows real, useful state. Multi-project workflow doesn't require remembering ids. Brand/persona configured once, reused everywhere. |
| **AI agent** | Every project has the same on-disk shape so playbook logic is deterministic. Append-only invariant is enforced by the CLI, not by trust. |
| **Profile sharer** | One command exports a portable bundle; another imports it on a fresh machine without merge conflicts. |
| **Asset contributor** | Adding a new pool asset to `ralphy-assets` is a documented PR flow, not folklore. |

## User stories

1. As an **agent**, I run `ralphy project show <id>` and get every piece of state about a project (refs used, brand, persona, gen-log summary, asset manifest, render status) in one JSON object — no chained reads.
2. As a **human**, I run `ralphy project list -p` and see all my projects ranked by last-activity, with cost and render-status at a glance.
3. As a **human**, I delete a project with `ralphy project delete <id>` and the workspace registry, the asset cache references, and any cross-links update atomically.
4. As an **agent**, I `ralphy generate image --project <id> --slot scene-04-image` and the file is written as `assets/scene-04-image.png`. If the slot already has a file, it writes `.v2`, `.v3` — never overwrites.
5. As a **scenarist agent**, I look up the project's brand and persona and pass them into every prompt without filesystem reads — `ralphy brand show <id>` + `ralphy persona show <id>` return canonical JSON.
6. As a **human**, I want to define a brand once and have every subsequent project inherit its tone, palette, and forbidden words.
7. As a **template author**, I run `ralphy assets add-pool <kind>/<slug> <local-path>` and get a PR-ready manifest update + the rsync/upload commands to land it in `ralphy-assets`.
8. As a **power user**, I run `ralphy profile export myself.tar.zst` to bundle my entire workspace (projects + brands + personas + refs) and `ralphy profile import` to restore it elsewhere.
9. As an **agent**, I treat the append-only invariant as enforced — `ralphy` refuses to delete or overwrite project artifacts unless the user explicitly consented, with the word "delete" or "wipe" in the request.

## Success metrics

| Metric | Target at v1.0 | How we measure |
|---|---|---|
| `ralphy project show <id>` JSON has every resource a playbook needs | 100% of fields the editor / scenarist / art-director playbooks consume | Schema check; playbook smoke runs |
| Append-only invariant violations in CI | 0 | A `lint:append-only` test that mutates a sentinel artifact and asserts the CLI refuses |
| Time to `ralphy project list` on a workspace with 100 projects | < 200ms | Hyperfine benchmark |
| Brand / persona referenced by playbooks (no inline overrides) | ≥ 90% of generations | gen-log audit |
| Asset catalog drift (manifest entries vs catalog doc) | 0 entries out of sync | CI grep |
| Profile import round-trip (export → wipe → import → diff) | 0 diff | Smoke test |

## Non-goals

- **Multi-user / multi-tenancy.** Single local workspace per machine. Sharing happens via profile export.
- **Cloud sync of workspace state.** Profiles are tarballs; pushing them to S3 / Drive is the user's problem.
- **A database.** State lives in files (`.json`, `.jsonl`, `.md`). The registry is a JSON index, not SQLite.
- **Encryption / secrets management for project artifacts.** API keys live in `~/.ralphy/`, not in projects. Project artifacts are assumed shareable.
- **Template *contents*.** Templates as a library belong to [`02 — Prompts & Templates`](../02-prompts-and-templates/). This category owns only the on-disk shape and the `template` CRUD verb plumbing.
- **Companion repo CI / publishing automation.** That lives with [`09 — Distribution`](../09-distribution-and-release/).

## v1.0 cut

**Must ship:**

- `05.01` — Workspace registry (single index of projects, brands, personas, refs)
- `05.02` — Canonical project on-disk shape, documented and validated
- `05.03` — Append-only invariant enforced in code (not just convention)
- `05.04` — Brand & Persona as first-class, threaded through playbooks
- `05.05` — Asset cache + pool-layer integration with companion repo (covers the `ralphy assets` verb tree)
- `05.06` — Profile export / import round-trip
- `05.06A` — `ralphy memory` — cross-session memory store

**Post-launch:**

- `05.07` — Cross-project search ("which projects use ref X")
- `05.08` — Project archival (move out of active workspace without deletion)
- `05.09` — Partial profile bundles (just brands, just refs)
