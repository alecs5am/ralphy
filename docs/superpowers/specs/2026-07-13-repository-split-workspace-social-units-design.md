# Repository Split, Workspace Assets, and Social Units Design

## Goal

Keep `alecs5am/ralphy` as a self-contained CLI runtime for local coding agents.
Move every independently runnable UI, hosted surface, documentation site, and
automation runtime into its own repository. Then make a workspace useful as a
social account home: it owns shared brand assets and can hold text-first units
without forcing the agent to create a video project.

## Product boundary

The core repository serves Codex, Claude Code, Hermes, and similar local agents.
It keeps commands that an agent invokes directly during research, generation,
editing, evaluation, packaging, publishing, and account management. The core
must build, test, install, and run without any sibling repository.

The automation product consumes the core through the stable JSON CLI. It must
not import files from `ralphy/cli/`. This boundary prevents the farm runtime
from turning the core back into a monorepo.

## Repository map

All repositories will be public under `alecs5am` and checked out as siblings:

```text
~/github/ralphy/
  AGENTS.md
  CLAUDE.md
  ralphy/
  ralphy-farm/
  ralphy-web/
  ralphy-docs/
  ralphy-desktop/
  ralphy-assets/
```

The umbrella `AGENTS.md` and `CLAUDE.md` explain ownership, dependency direction,
release order, and the commands agents should run in each repository. The user
also requested the misspelled `CLUADE.md`; a compatibility symlink will point it
to `CLAUDE.md` without creating a second source of truth.

### `ralphy`

Keep:

- the CLI entrypoint, direct commands, provider connectors, render/eval logic,
  workspace/project/unit state, queueing used by direct agent commands, and
  binary/npm/Homebrew release tooling;
- agent-facing playbooks, skills, guidelines, runtime contracts, and developer
  notes needed to change the CLI;
- manual account operations such as calendar, campaign, direct publish, and
  analytics, provided they remain useful without the farm daemon;
- the public-library read client. It fetches published library JSON and does not
  require the web repository at runtime.

Remove:

- `landing/`, `docs-mintlify/`, `desktop/`, `studio/`, and `docker/`;
- workflow-graph execution, farm scheduling, farm runs, bundle deployment,
  auto-publish trust machinery, farm health/backup/upgrade code, and Studio API
  adapters;
- dependencies used only by workflow executors;
- stale root artifacts such as `package-lock.json` in this Bun-only repository
  and the checked-in preview scratch file;
- binary prompt-render research from `notes/`. The corpus belongs in
  `ralphy-assets`; the text research notes remain in core.

Operational `docs/playbooks/` stay in core because agents load them while doing
the work. Public product documentation moves out.

### `ralphy-farm`

Own:

- graph schemas and validation, workflow executors, scheduler, durable farm
  runs, approval state, trust automation, bundle deploy/upgrade/backup, and farm
  observability;
- Studio client/server and the Docker deployment;
- farm-specific tests, docs, and skills.

The farm invokes `ralphy --json` for generation, render, eval, unit, publish,
calendar, campaign, and analytics operations. It may own ingestion and control
flow code that only exists to feed automated graphs. Its package and tests must
run from a standalone checkout with `ralphy` installed or with a configurable
`RALPHY_BIN` path.

### `ralphy-web`

Own the current `landing/` application, public content-library source, Bunny
publishing scripts, brand design source, and web-specific tests. The core CLI
continues to consume the deployed library endpoint.

### `ralphy-docs`

Own the current `docs-mintlify/` documentation site and its style guide. The
initial split keeps the current generated CLI pages as a snapshot. A small sync
command may read a sibling core checkout later; the core build will not depend
on that sync.

### `ralphy-desktop`

Own the Electron application and its renderer. It invokes installed coding
agents and `ralphy`; it does not import core source files.

### `ralphy-assets`

Keep the existing companion repository. Add the prompt-model render corpus that
is currently tracked below `notes/research/prompts/_renders/` in core.

## History-preserving extraction

Each new repository starts from a temporary clone of the current core. Use
`git filter-repo --path <dir> --path-rename <dir>/:` so the extracted files
retain their commits and authors. Add a small root README/package manifest only
after extraction. Create the GitHub repository with `gh repo create`, push the
filtered `main`, then remove the source directory from the core branch.

`ralphy-farm` needs code from several paths rather than one subtree. Its filter
includes the automation commits and files, then a focused cleanup changes the
runtime boundary from internal imports to CLI calls. The core removal happens
only after the farm repository has a pushed recovery point.

## Workspace account model

Add a typed `WorkspaceManifestSchema`. Existing manifests remain valid through
defaults. The manifest gains non-secret account metadata:

```json
{
  "version": 1,
  "slug": "acme",
  "name": "Acme",
  "description": "",
  "profile": {
    "displayName": "Acme",
    "bio": "",
    "language": "English",
    "timezone": "Europe/Moscow"
  },
  "channels": {
    "telegram": { "handle": "@acme" },
    "x": { "handle": "@acme" },
    "threads": { "handle": "@acme" },
    "devto": { "handle": "acme" },
    "medium": { "handle": "@acme" }
  }
}
```

Credentials are outside this change. The manifest stores public identity and
content defaults; provider secrets continue to follow connector-owned secret
rules until a separate credential design is implemented.

## Shared workspace assets

Formalize this layout without disturbing existing `shared/brands`,
`shared/personas`, and `shared/refs`:

```text
<workspace>/shared/assets/
  images/
  videos/
  voiceover/
  music/
  sfx/
  fonts/
```

`ralphy generate` accepts exactly one destination scope:

- `--project <id>` keeps the current behavior;
- `--workspace <slug>` writes to `shared/assets/<kind>/<slot>.<ext>` and logs
  the call to `<workspace>/logs/generations.jsonl`.

`ralphy gen` becomes an alias for `ralphy generate`. Project output and manifest
shapes remain backward compatible. Workspace assets use the same append-only
versioning rules as project assets and can be consumed through explicit
`shared/assets/...` references.

The implementation introduces one destination value object at the existing
output-path/logging seam. It does not create a second generation pipeline.

## Workspace-level units

Project units remain supported at `<project>/units/`. Add workspace-native units
at `<workspace>/units/` for text-first content and shared deliverables. No data
migration or duplicate copy is required.

The `unit` command accepts either a project or workspace scope. `unit list` and
`workspace show` expose workspace-native units and aggregate project-unit counts
so an agent can inspect the account inventory from the workspace.

## Social content model

Add two unit formats: `post` and `thread`. Keep the existing `article` format.
Platforms are destinations rather than formats:

- `post`: Telegram, X, and Threads;
- `thread`: X and Threads;
- `article`: dev.to, Medium, and X Articles.

The manifest gains a text block:

```json
{
  "format": "post",
  "text": {
    "body": "post.md",
    "destinations": ["telegram", "x", "threads"]
  }
}
```

`body` names a copied text file in the unit. A thread may use a JSON file with
an ordered string array or a Markdown body; publishers can interpret the file
later. This change forms and validates units. It does not add unrequested social
API clients.

Example commands:

```bash
ralphy unit create --workspace acme --slug launch-post --format post \
  --from drafts/launch.md --destination telegram --destination x

ralphy unit create --workspace acme --slug launch-thread --format thread \
  --from drafts/thread.json --destination x --destination threads

ralphy unit create --workspace acme --slug launch-article --format article \
  --from drafts/article.md --destination devto --destination medium \
  --destination x-article
```

## Safety and compatibility

- Extracted repositories are pushed before core deletes their files.
- No user `.ralphy/` data is moved or rewritten.
- Existing project commands and unit manifests keep working.
- Existing workspaces parse through schema defaults.
- Every filesystem write stays append-only where the current contract requires
  it.
- Secret scans run before every push. The split never copies local `.env`,
  `.ralphy/`, build output, or ignored research files.
- Repository files remain English-only.

## Verification

Each extracted repository must have a clean checkout, a README, and at least one
runnable build or smoke command. Core must pass TypeScript, lint, targeted unit
tests, integration tests, CLI surface generation, and binary smoke after all
cross-repository references are removed. Tests cover workspace manifest defaults,
workspace output path/versioning/logging, workspace unit creation, social format
validation, and unchanged project behavior.
