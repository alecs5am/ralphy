# Monorepo → multi-repo split plan

> **Status:** design only. Nothing in this doc has been executed. No files moved, no repos created, no install/CI/code changed. Execution is a separate, dedicated session.
> **Tracks:** [`notes/issues/059-monorepo-split-design-plan-only.md`](../../notes/issues/059-monorepo-split-design-plan-only.md)
> **Target repos:** **core** · **landing** · **docs** · **assets**.
> **Grounded as of:** 2026-06-15 against the live repo. Every path/script citation below was verified to exist (or noted as absent) at that time.

Read [`../../CLAUDE.md`](../../CLAUDE.md) (project layout) and [`../../AGENTS.md`](../../AGENTS.md) (invariants #11/#12 on the `ralphy-assets` companion + asset cache) for the surrounding context. The `.ralphy/` data-root layout is the single source of truth in [`../../cli/lib/paths.ts`](../../cli/lib/paths.ts).

---

## 1. Goals & non-goals

### Goals

- **Isolate the only thing a user installs (the `ralphy` binary) from everything that is build-/publish-only** — the Next.js landing site, the Mintlify docs site, and heavy media. A `curl | sh` or `npm i -g @alecs5am/ralphy` should never pull a Next.js app or a gigabyte of showcase mp4s.
- **Give each surface its own release cadence + CI.** Landing deploys on push; the binary releases on a `v*` tag; docs publish to Mintlify; assets change rarely and are heavy.
- **Keep the `ralphy-assets` companion repo's existing contract intact** — manifest at `https://raw.githubusercontent.com/alecs5am/ralphy-assets/main/manifest.json`, SHA-256-verified, no-auth pulls (see [`../../cli/lib/assets-repo.ts`](../../cli/lib/assets-repo.ts)).
- **Give every cross-surface shared source exactly one owner** with a defined consumption path for the others: `.agents/skills/`, `guidelines/`, `MODELS.md`, `AGENTS.md`, `docs/playbooks/`, and the content library JSON.

### Non-goals

- Not changing the `ralphy` CLI surface, the provider layer, or the HyperFrames engine.
- Not changing the install UX. `install.sh`, the Homebrew tap, and the npm wrapper must keep working byte-for-byte from the user's side.
- Not splitting `cli/` itself into sub-packages. Core stays a single Bun package compiled from `cli/index.ts`.
- Not retiring `ralphy-assets`. The `assets` target is a question of *relationship* to that existing repo (§6), not a greenfield build.

### What stays coupled (the crux)

Two distinct couplings make this split non-trivial, and they pull in opposite directions:

1. **The CLI reads non-code source files off disk at runtime**, relative to `root()` in [`../../cli/lib/paths.ts`](../../cli/lib/paths.ts) (defaults to `process.cwd()`, overridden to the linked-project root in [`../../cli/index.ts`](../../cli/index.ts)). Skills and guidelines are read this way. These same files are read **at build time** by the landing site, which reaches *up one directory* out of `landing/`.
2. **The content library source-of-truth lives in `landing/`, not `cli/`.** `landing/lib/library-v2/library.json` IS the database; the CLI consumes a copy of it over Bunny CDN at runtime (`cli/lib/library/client.ts`). The publisher that edits and uploads it is `landing/scripts/publish-entity.ts`. So the surface a *user* depends on (templates/units/blocks) is *owned* by the marketing repo. This is the single most surprising coupling and gets its own treatment in §3.

---

## 2. Path → target-repo mapping

Every top-level entry that exists in the repo today, with its destination and a coupling note. "core" = the CLI repo a user installs.

| Path | Target repo | Note |
|---|---|---|
| `cli/` | **core** | The CLI + engine. The sole `bun build --compile` entrypoint — [`../../scripts/build-binaries.ts`](../../scripts/build-binaries.ts) compiles `cli/index.ts`. |
| `tests/` | **core** | Unit / integration / live tests of the CLI. |
| `scripts/` | **core** | Build + lint generators. A few are docs-oriented (`build-cli-docs.ts`) — cross-repo, see §7. Several `tmp-*.sh` / `mlg-remix.py` are scratch one-offs; do not carry them forward. |
| `npm/` | **core** | The npm wrapper `@alecs5am/ralphy` (`npm/package.json`, `npm/bin/ralphy.js`, `npm/scripts/install.js`). Ships with core because it tracks the binary release version in lockstep. |
| `install.sh`, `install.ps1` | **core** | `curl`/`irm` installers. Default `RALPHY_REPO=alecs5am/ralphy`. See §5. |
| `.agents/` (skills) | **core (owner), SHARED** | Read at runtime by `ralphy skill *` ([`../../cli/commands/skill.ts`](../../cli/commands/skill.ts) `resolveBundleDir()`) AND at build time by landing ([`../../landing/lib/skills-loader.ts`](../../landing/lib/skills-loader.ts)). `.claude/skills/*` are per-skill symlinks into `../../.agents/skills/<slug>`. See §3. |
| `guidelines/` | **core (owner), SHARED** | Read at runtime by `ralphy guideline *` ([`../../cli/commands/guideline.ts`](../../cli/commands/guideline.ts), `guidelinesDir() = path.join(root(), "guidelines")`) AND at build time by landing ([`../../landing/lib/guidelines-loader.ts`](../../landing/lib/guidelines-loader.ts)). See §3. |
| `MODELS.md` | **core (owner), SHARED** | Referenced throughout `cli/` as guidance; read at build time by landing ([`../../landing/lib/models-loader.ts`](../../landing/lib/models-loader.ts)). See §3. |
| `AGENTS.md` | **core (owner)** | The agent routing contract; `@`-imported by `CLAUDE.md`. The skill installer writes pointers at `<repo>/AGENTS.md` ([`../../cli/lib/skill/installer.ts`](../../cli/lib/skill/installer.ts)). Read by the *agent* (Claude Code), not the compiled binary. Stays in core. |
| `CLAUDE.md` | **core** | Project instructions; `@AGENTS.md` import. Lives where `cli/` lives. |
| `CLI.md` | **core** | CLI command-surface cheatsheet. |
| `README.md` | **core** | This repo's README becomes core's. Each carved repo gets its own. |
| `BRAND_DESIGN.md` | **landing** | Brand / visual design notes — consumed by the marketing surface, not the CLI. |
| `docs/` | **core** | Operator + agent docs tied to the CLI: `docs/playbooks/` (read by the agent at runtime), `docs/agent-guide.md`, `docs/cli-spec.md`, `docs/cli-surface.generated.md`, `docs/use-cases.md`, `docs/skills-vs-templates.md`, `docs/content-modes.md`, `docs/perf-targets.md`, `docs/architecture/` (incl. **this file**). Stays in core. **Do NOT confuse with `docs-mintlify/`.** |
| `docs-mintlify/` | **docs** | The Mintlify site (`docs.json`, `.styleguide.md`, `.archive/`, `reference/cli/*.mdx`). The CLI-ref `.mdx` are generated by `scripts/build-cli-docs.ts` from core — cross-repo generation, see §7. |
| `landing/` | **landing** | Next.js marketing + `/library` + skills site. **Owns `landing/lib/library-v2/library.json` (the content-library source-of-truth) and `landing/scripts/publish-entity.ts` (the publisher).** Its loaders reach up into core sources at build time (§3). |
| `studio/` | **core** (provisional) | Ralphy Studio (#107) — the local read-only artifact browser over `.ralphy/workspaces/<ws>/projects/<id>/artifacts/`. Independent package (`studio/package.json`, Bun + server + src). Tightly bound to the `.ralphy/` layout `cli/` owns, so it travels with core unless given its own repo. **Open question** — see §9. |
| `desktop/` | **core** (provisional) or own repo | Electron app embedding Claude Code (`desktop/package.json`, React 19 + Vite + Electron). It *spawns* the local `claude`/`ralphy` binary (`desktop/electron/`, `desktop/src/lib/ipc.ts`), not a code import. Lowest coupling of anything. **Open question** — see §9. |
| `notes/` | **core** | The only dev tracker (`notes/ideas/`, `notes/issues/`, `notes/decisions/`). Bound to `cli/` dev. Dev-only, never shipped. There is **no separate `roadmap/` board** — `notes/` is it. |
| `.github/` | **split per repo** | Each repo gets the workflows relevant to it — see §7. |
| `.husky/` | **core** | Pre-commit hook (`prepare: husky` in root `package.json`; runs `bun test` on unit + integration). |
| `.codex/`, `.claude/` | **core** | Agent-harness config (`.codex/README.md`, `.claude/settings*.json`, `.claude/skills/` symlinks). Travels with the CLI dev surface. |
| `out/` | **gitignored, none** | Next.js export output (conceptually landing's, but regenerated, not committed). |
| `dist/` | **gitignored, none** | Build output of `build-binaries.ts` (and `desktop/dist*`). Regenerated; not committed. |
| `package.json`, `bun.lock`, `bunfig.toml`, `tsconfig.json`, `.prettierrc`, `skills-lock.json` | **core** | Root toolchain config. `landing/`, `desktop/`, `studio/` already carry their own. Each repo keeps the configs it needs. `skills-lock.json` pairs with `.agents/skills/`. |
| `LICENSE` | **all four** | Apache-2.0 root + MIT for the npm wrapper (`npm/package.json`). Copy the correct license into each repo. |

**Entries named in the issue that DO NOT exist in the repo today** (so they map nowhere — recorded to prevent a future session chasing them):

- `templates/` — **retired (#084)**. The repo-public `templates/<category>/<slug>/` folder is gone; public templates are served from the content library JSON. Note: a stale build-time loader [`../../landing/lib/templates-loader.ts`](../../landing/lib/templates-loader.ts) still walks a now-absent `<repo>/templates/` dir — flag for removal during the carve (see §3 + §9).
- `roadmap/` — does not exist. `notes/` is the only tracker.
- `out/`, `dist/` — exist but are gitignored build output (above).

**Ownership summary for the shared set:** `.agents/skills/`, `guidelines/`, `MODELS.md`, `AGENTS.md`, `docs/playbooks/` are **owned by core**, consumed by landing (build-time) and by the running CLI (runtime). The content library JSON is the inverse — **owned by landing**, consumed by the CLI at runtime over CDN. Both are §3.

---

## 3. The hard problem: runtime + build-time coupling

### 3a. Core-owned sources read both ways

**Runtime reads (the CLI, against `root()`):**

- `.agents/skills/` → `resolveBundleDir()` walks `--repo` flag → `$RALPHY_REPO_ROOT` → `process.cwd()` ([`../../cli/commands/skill.ts`](../../cli/commands/skill.ts)).
- `guidelines/` → `guidelinesDir() = path.join(root(), "guidelines")` ([`../../cli/commands/guideline.ts`](../../cli/commands/guideline.ts)).
- `MODELS.md`, `AGENTS.md`, `docs/playbooks/` → read by the *agent* (Claude Code) from the checkout it operates in, and pointed at by the skill installer which writes `<repo>/AGENTS.md` / `<repo>/docs/playbooks/` references ([`../../cli/lib/skill/installer.ts`](../../cli/lib/skill/installer.ts)).

**The load-bearing fact:** the compiled binary does **not** embed any of these files. `build-binaries.ts` runs `bun build --compile cli/index.ts` — only JS reachable through imports is bundled; skills / guidelines / `*.md` are plain files read off disk via `root()`. `root()` defaults to `process.cwd()` and is overridden to the linked-project root in [`../../cli/index.ts`](../../cli/index.ts). `doctor` reports `templatesSource: "bundled"` for non-developer mode ([`../../cli/commands/doctor.ts`](../../cli/commands/doctor.ts)) — but no embedding step exists, so for skills/guidelines that is **aspirational, not implemented**. A pure binary install with no checkout on `cwd` has no `guidelines/` or `.agents/skills/` to read. The dev story works because devs run from a checkout (`process.cwd()` is the repo). After a split, an end user who runs the binary in an arbitrary project dir is in the same broken state — the split *surfaces* this latent issue rather than creating it.

**Build-time reads (landing, Next.js — all reach `../` out of `landing/`):**

- `.agents/skills/` → `REPO_ROOT = path.resolve(process.cwd(), "..")` then `.agents/skills` ([`../../landing/lib/skills-loader.ts`](../../landing/lib/skills-loader.ts)); skill icons under `landing/public/assets/skills/`.
- `guidelines/`, `MODELS.md` → same `../` REPO_ROOT pattern ([`../../landing/lib/guidelines-loader.ts`](../../landing/lib/guidelines-loader.ts), [`../../landing/lib/models-loader.ts`](../../landing/lib/models-loader.ts)).
- `templates/` → [`../../landing/lib/templates-loader.ts`](../../landing/lib/templates-loader.ts) still references a `<repo>/templates/` dir that no longer exists — dead code to delete during the carve, not a real coupling.

After a split, `../` no longer points at core. This is the single change that breaks the most things in the landing build.

### 3b. Landing-owned content library, read by the CLI at runtime

This is the inverted coupling. From [`../../cli/lib/library/client.ts`](../../cli/lib/library/client.ts) and [`../../landing/scripts/publish-entity.ts`](../../landing/scripts/publish-entity.ts):

- The library is **one static JSON document** committed at `landing/lib/library-v2/library.json`. Per `publish-entity.ts`: *"library.json IS the database — committed to the repo, mirrored to Bunny."* The Supabase Postgres backend was retired (June 2026, #104).
- The CLI reads it **over CDN** at `https://ralphy.b-cdn.net/library/library.json` (overridable via `RALPHY_LIBRARY_URL`), with a 10-min on-disk cache under `libraryCacheDir()` = `.ralphy/cache/library/`. `ralphy template list / suggest / use` and the library/unit/blueprint verbs all flow through this client.
- The publisher `landing/scripts/publish-entity.ts` edits the committed `library.json`, uploads media bytes to a Bunny Storage Zone, and uploads the JSON to Bunny so the CLI sees the change immediately.
- Landing's own `/library` screens read the same committed JSON via `landing/lib/library-v2/source.ts` (static, no network).

**Consequence:** after the split, the content surface the *user* depends on is produced in the **landing** repo. The CLI's runtime dependency is the *CDN URL*, not a repo path — so as long as `landing` keeps uploading `library.json` to `ralphy.b-cdn.net`, the CLI keeps working with **no change**. The coupling is operational (who runs `publish-entity.ts`, who owns the Bunny credentials in `landing/.env.local`), not a code import. This is good news: the CDN indirection already decouples the code. The split just needs to keep the publisher and its Bunny credentials living with `landing/`.

### 3c. Options for where the core-owned shared set lives after the split

| Option | Mechanism | Landing/docs build | CLI runtime | Trade-offs |
|---|---|---|---|---|
| **A. Git submodule** | core added as a submodule under `landing/vendor/core` | reads `vendor/core/{skills,guidelines,...}` | unchanged | Submodules are fiddly in CI (detached HEAD, `--recurse-submodules`, drift); pinned-SHA bump on every shared-source edit. Rejected as primary. |
| **B. Published npm package** | core publishes `@alecs5am/ralphy-sources` (data dirs + a tiny loader) on each release | `import` it, no `../` | binary could bundle OR fetch | Clean, versioned dependency edge; landing/docs `bun add` it. Cost: another publish step; runtime binary still needs files on disk unless embedded (option D). |
| **C. Build-time tarball fetch** | landing/docs CI fetches a pinned tarball of the shared set from a core release | fetch into a temp dir, point loaders at it | unchanged | No submodule pain, no publish ceremony. Cost: pin management; offline dev needs a local-core fallback. |
| **D. Embed into the binary** | a pre-`compile` step copies the shared set into an embeddable form (`Bun.embeddedFiles` / generated TS module) | n/a (still need A/B/C for build) | binary self-contained — **fixes the aspirational `templatesSource: "bundled"`** | Solves the *runtime* half permanently; removes the hidden "you also need a checkout" requirement. Larger binary. Does nothing for build-time. |

### 3d. Recommendation

**Keep core as the single owner of its shared set, and combine D + B/C:**

1. **Runtime (the user-facing crux): embed the core-owned shared set into the binary (option D).** Add a `scripts/embed-sources.ts` step before `bun build --compile` that emits a generated module carrying `.agents/skills/`, `guidelines/`, `MODELS.md`, `AGENTS.md`, and `docs/playbooks/`. A pure `curl | sh` / `npm i -g` install then becomes genuinely self-contained — which is what `doctor`'s `templatesSource: "bundled"` already claims. Keep the `root()`/`cwd` disk-read path as the **dev override** (developer mode reads live files so edits are immediate). This removes the hidden "you also need a checkout" requirement the current binary install silently has.
2. **Build-time (landing + docs): consume a published sources package (option B), fall back to a sibling core checkout for local dev.** Replace the `path.resolve(process.cwd(), "..")` REPO_ROOT in the landing loaders with: `process.env.RALPHY_CORE_DIR` → else the resolved `@alecs5am/ralphy-sources` package dir → else `../` (legacy sibling-checkout dev). One env var, one published dep, no submodule. Delete the dead `templates-loader.ts` while touching this file.
3. **Content library (landing-owned): no code change needed.** Keep `library.json` + `publish-entity.ts` + the Bunny credentials in `landing/`. The CLI's CDN URL is already the decoupled edge.

Why split mechanisms: the runtime and build-time halves have opposite constraints (the binary must be offline-self-contained; the Next.js build is online and can install a package). Forcing one mechanism on both optimizes neither. Embedding fixes a real latent bug; a published sources package gives landing/docs a clean versioned edge without `../` into a repo that no longer exists.

**Avoid the submodule (option A) as the primary mechanism** — it pushes a pinned-SHA bump into every shared-source edit and is the most common cross-repo CI failure mode. It remains an acceptable *local-dev* fallback.

---

## 4. Git-history strategy per repo

Use `git filter-repo` (not the deprecated `filter-branch`, not `git subtree split`) where a carved repo should keep authorship history of its paths; use a clean cut where history is noise or where heavy binaries make rewritten history toxic.

| Repo | Strategy | Command shape | History kept |
|---|---|---|---|
| **core** | **In-place.** Core is the natural heir — fewest moves if it *stays* `alecs5am/ralphy`. Just `git rm -r` the carved-out dirs (`landing/`, `docs-mintlify/`) in one commit. | `git rm -r landing docs-mintlify BRAND_DESIGN.md; git commit` | Full history (it *is* this repo). Removed dirs stay reachable in old commits — acceptable. |
| **landing** | **`git filter-repo` path-keep.** | `git filter-repo --path landing/ --path BRAND_DESIGN.md --path-rename landing/:` (on a fresh `--no-local` clone) | History of `landing/` + `BRAND_DESIGN.md`, rebased to root. |
| **docs** | **`git filter-repo` path-keep.** | `git filter-repo --path docs-mintlify/ --path-rename docs-mintlify/:` | History of `docs-mintlify/` only. `.archive/` comes along — keep it. |
| **assets** | **Depends on §6.** Recommendation is *no new repo* — consolidate into `ralphy-assets` via a clean copy (heavy binaries + rewritten git history is the worst combo). | `ralphy template extract --lift-heavy` / a copy script into `ralphy-assets/pool/` | None (clean copy). |

Why `filter-repo` over `subtree split`: `git subtree split` is slower on large histories, does not rename paths to repo root cleanly, and is harder to make reproducible; `filter-repo` is the upstream-recommended tool for exactly this carve-with-rename. Why a *clean cut* for assets: rewriting history that contains large binaries balloons every clone and is unrecoverable once pushed.

**Pre-flight for `filter-repo`:** always operate on a fresh `git clone --no-local` mirror. Tag the monorepo HEAD (`pre-split-2026-NN`) before any carve so every new repo can cite its origin commit, and so §8 rollbacks have a known-good anchor.

---

## 5. Install-flow impact

The install surface must keep working unchanged from the user's side. What actually changes:

| Channel | File / mechanism | If core stays `alecs5am/ralphy` (recommended) | If core moves to a new repo name |
|---|---|---|---|
| **curl installer** | [`../../install.sh`](../../install.sh) | None. `REPO="${RALPHY_REPO:-alecs5am/ralphy}"`, fetches `releases/latest`. | Bump default `RALPHY_REPO` + the `raw.githubusercontent.com/.../install.sh` URL in docs/README. |
| **PowerShell installer** | `install.ps1` | None. | Same `RALPHY_REPO` bump. |
| **Homebrew tap** | `alecs5am/homebrew-tap` (external) → `brew install alecs5am/tap/ralphy` | None — the tap formula points at GitHub Release asset URLs the core repo still produces. | Formula `url`/`homepage` must point at the new repo's releases. |
| **npm** | [`../../npm/package.json`](../../npm/package.json) `@alecs5am/ralphy`; postinstall [`../../npm/scripts/install.js`](../../npm/scripts/install.js) downloads `releases/download/v${VERSION}/ralphy-${os}-${arch}` from `RALPHY_REPO` (default `alecs5am/ralphy`). | None. | Bump default `RALPHY_REPO` in `install.js`. |

**Hard requirement either way:** core keeps producing the **same release-asset names** — `ralphy-${os}-${arch}[.exe]` + `SHA256SUMS` (the five targets in [`../../scripts/build-binaries.ts`](../../scripts/build-binaries.ts)) — on a `v*` tag, via `.github/workflows/release.yml`. All four downstream channels key off those exact names. Do **not** rename them in the split.

**Recommendation: keep core at `alecs5am/ralphy`** (this repo). It makes install a no-op change — every installer, the tap, and the npm postinstall already default to that repo, and the README curl one-liner stays valid. Move *landing* and *docs* out to new repos instead. This minimizes the §5/§7 blast radius.

**New assertion to tighten in install-smoke after embedding (§3d.1):** [`../../.github/workflows/install-smoke.yml`](../../.github/workflows/install-smoke.yml) already runs `ralphy template list --json` (with `|| true`) and `ralphy doctor` across all four channels. Once the binary embeds sources, drop the `|| true` so a self-contained binary that fails to surface skills/guidelines is caught at smoke time rather than in a tester's terminal.

---

## 6. Asset-cache impact

Today's asset wiring ([`../../cli/lib/assets-repo.ts`](../../cli/lib/assets-repo.ts), [`../../cli/commands/assets.ts`](../../cli/commands/assets.ts), [`../../cli/lib/paths.ts`](../../cli/lib/paths.ts)):

- Manifest URL is hard-coded: `DEFAULT_MANIFEST_URL = "https://raw.githubusercontent.com/alecs5am/ralphy-assets/main/manifest.json"`.
- `ralphy assets list / pull / pull-pool / install / clean / cache-info` fetch from that companion repo and cache under `assetCacheDir()` = **`.ralphy/cache/assets/`** (`<workspace>/cache/assets`; the pre-#108 path was `workspace/.ralph/asset-cache/` — already migrated).
- `ralphy template use` auto-pulls required heavy assets; `ralphy template extract --lift-heavy` *writes* into a local checkout of `ralphy-assets/pool/` ([`../../cli/commands/template.ts`](../../cli/commands/template.ts)).
- `docs/assets-catalog.md` is generated from the live manifest (`ralphy assets catalog --write`).

**The `assets` target repo in this plan and the existing `ralphy-assets` companion are the same concern.** Recommendation: **do not create a new `assets` repo — keep `ralphy-assets` as the single asset home**, and lift any heavy media that may still sit inside the monorepo into `ralphy-assets/pool/` via the existing `--lift-heavy` path. Rationale:

- The CLI already speaks the `ralphy-assets` manifest contract end-to-end. A second asset repo means a second manifest, a second cache layout, and a config knob nobody wants.
- Heavy media + rewritten git history is the worst combo (§4); `ralphy-assets` already isolates that weight from core.
- The split's intent — "keep heavy media out of the thing users install" — is *already satisfied* by `ralphy-assets`.

**No changes needed** to the manifest URL, the cache dir, or the `ralphy assets *` verbs. `.ralphy/cache/assets/` stays gitignored, untouched by the split. If maintainers later want to rename the companion (e.g. `ralphy-assets` → `ralphy-pool`), that is a manifest-URL constant change + a redirect, tracked as an open question (§9).

---

## 7. CI split

**Current state:** there is **no `ci.yml`** (the issue's reference predates the layout). The real workflows are `.github/workflows/test.yml`, `release.yml`, `install-smoke.yml`, and `docs-deploy.yml`.

**The lint scripts actually wired into `test.yml`** today (from [`../../package.json`](../../package.json)): `lint:errors`, `lint:help-examples`, `lint:skills` (which chains `lint:skill-routing`), `lint:agents-md`, `lint:mode-guidelines`, `cli:surface:check`, `docs:cli:check`, `lint:docs-links:fast`. Additional `package.json` lint scripts not currently in `test.yml`: `lint:confirmation-shape`, `lint:motion-graphics`, `lint:gen-log`. There is **no `lint:templates`** (the templates dir was retired) and **no `validate-roadmap`** (no roadmap board).

| Check | Source it validates | Target repo | Cross-repo? |
|---|---|---|---|
| `bun test` (unit/integration) | `cli/` | **core** | No |
| `lint:errors` | `cli/lib/errors/catalog.ts` | **core** | No |
| `lint:help-examples` | `cli/commands/*` `--help` | **core** | No |
| `lint:skills` + `lint:skill-routing` | `.agents/skills/*` | **core (owns skills)** | Landing re-runs a read-only copy on its pinned sources to fail fast on a stale pin. |
| `lint:agents-md` | `AGENTS.md` routing table | **core** | No |
| `lint:mode-guidelines` | content-mode → `guidelines/<slug>/` or `docs/playbooks/modes/<mode>.md` coverage (#417) | **core** | No (all inputs core-owned). |
| `lint:confirmation-shape`, `lint:motion-graphics`, `lint:gen-log` | `prompts.json` / gen-log schema | **core** | No |
| `cli:surface:check` | `docs/cli-surface.generated.md` vs `cli/` | **core** | No (output lives in core's `docs/`). |
| `docs:cli:check` | `docs-mintlify/reference/cli/*.mdx` vs `cli/` | **CROSS** — generator (`scripts/build-cli-docs.ts`) + source live in core; output lives in **docs** | Yes — see below |
| `lint:docs-links:fast` | links in `docs/`, `docs-mintlify/`, root `*.md` (per [`../../scripts/lint-docs-links.ts`](../../scripts/lint-docs-links.ts) default scope) | **split** — core runs it over its surface; docs runs it over `docs-mintlify/` | Partially |

**The one genuinely cross-repo check is `docs:cli:check`.** Today `scripts/build-cli-docs.ts` reads `cli/` and writes `docs-mintlify/reference/cli/*.mdx`; CI fails if they drift. After the split, core owns the generator + source; docs owns the output. Options:

1. **Generate-and-PR (recommended):** a core CI job runs `bun run docs:cli` and, on diff, opens a PR against the `docs` repo (via `gh pr create` with a scoped bot token). Docs CI then only lint-checks links. Keeps the source-of-truth edge one-directional (core → docs).
2. **Docs pulls core as a build dep** (the §3 sources package) and runs the generator in docs CI. Simpler edge, but couples docs CI to core's TS toolchain.

Recommend option 1: docs stays a pure-content repo; core pushes the generated reference downstream.

**`docs-deploy.yml` is already docs-aware.** It mirrors `main` → `docs-live` only when `docs-mintlify/**` changes, to gate Mintlify free-tier deploys. After the split this workflow **moves to the docs repo** and its path filter becomes trivial (everything in that repo is docs).

**Resulting per-repo CI:**

- **core** — `test.yml`: `bun test` + all `lint:*` + `cli:surface:check` + the `docs:cli` generate-and-PR job. `release.yml`: `build:bin` (now with the embed-sources step from §3d.1) + GH Release. `install-smoke.yml`: unchanged, tightened (§5).
- **landing** — Next build + the loaders against pinned core sources + a read-only `lint:skills` over the pinned copy + the existing Vercel deploy. Owns `publish-entity.ts` + Bunny credentials.
- **docs** — `docs-deploy.yml` (now trivial path filter) + `lint:docs-links` over `docs-mintlify/` + the receiving end of core's generate-and-PR.
- **assets** (`ralphy-assets`) — manifest validation + SHA-256 regen (already in the companion).

---

## 8. Staged cutover sequence + rollback

Ordered low-risk → high-risk. Each stage is independently revertible. Do **not** carve core until everything that reads from it has a working non-`../` source path.

**Stage 0 — Prep (no carve).** Tag monorepo HEAD `pre-split`. Add the §3 indirection *first, in the monorepo*: (a) `scripts/embed-sources.ts` + wire into `build:bin`; (b) refactor the landing loaders to the `RALPHY_CORE_DIR` → published-package → `../` fallback chain and delete the dead `templates-loader.ts`. Verify both old (`../`) and new paths build green. **Rollback:** revert the two commits; nothing external changed.

**Stage 1 — docs out first (lowest coupling).** `filter-repo` `docs-mintlify/` into `ralphy-docs`. Move `docs-deploy.yml` there. Wire docs CI (links only). Stand up the core→docs generate-and-PR job (§7 option 1) but keep the in-monorepo `docs:cli:check` running in parallel until the cross-repo job is green twice. Repoint the Mintlify dashboard's connected branch to the new repo's `docs-live`. **Rollback:** the monorepo copy of `docs-mintlify/` is still present (we only *copied* history out); delete the new repo, restore the old Mintlify branch, drop the cross-repo job.

**Stage 2 — landing out next.** `filter-repo` `landing/` + `BRAND_DESIGN.md` into `ralphy-landing`. Publish the §3 sources package from the monorepo first; point landing's loaders at it (or a sibling core checkout for local dev). Carry `landing/.env.local`'s Bunny credentials into the new repo's deploy secrets so `publish-entity.ts` still works. Verify a clean `next build` AND a dry-run `publish-entity.ts`. **Rollback:** monorepo `landing/` still present; delete the new repo and the sources-package consumption commit. The CLI is unaffected throughout — it reads `library.json` from the CDN, not from any repo path.

**Stage 3 — assets consolidation.** Lift any heavy files still inside the monorepo into `ralphy-assets/pool/` via `ralphy template extract --lift-heavy` (or a one-off copy script). Regenerate `manifest.json` + `docs/assets-catalog.md`. No new repo (§6). **Rollback:** the lifted files are *copies* in `ralphy-assets`; restore the monorepo originals from the `pre-split` tag and revert the manifest.

**Stage 4 — core cleanup (last, highest blast radius).** Now that nothing reads `landing/`/`docs-mintlify/` from the monorepo: `git rm -r landing docs-mintlify BRAND_DESIGN.md` in core; switch `release.yml` to the embed-sources build; move `docs-deploy.yml` out (done in stage 1) and tighten `install-smoke.yml` (§5). Keep core at `alecs5am/ralphy` so installers don't move (§5). **Rollback:** `git revert` the removal commit; binaries and installers were untouched, so users see nothing.

**Global rollback note:** because stages 1–3 only *copy* paths out (no monorepo deletion until stage 4), the monorepo remains a fully working superset through stage 3. The point of no easy return is stage 4's `git rm`; gate it behind two green cross-repo CI runs of every dependent.

---

## 9. Open questions

Genuine unknowns that need a maintainer decision, not invented answers.

- **Core repo identity.** Keep core as `alecs5am/ralphy` (recommended — zero install churn) or rename and accept bumping `RALPHY_REPO` defaults + the tap formula + the npm postinstall + docs/README URLs? Decide before stage 4.
- **`desktop/` and `studio/` placement.** Both build independently and have low coupling — `desktop/` spawns the binary (no code import); `studio/` is bound only to the `.ralphy/` layout. Stay in core, or carve into `ralphy-desktop` / `ralphy-studio`? Depends on release-cadence preference. The plan provisionally keeps both in core.
- **Shared-source mechanism per consumer.** Confirm the §3d recommendation (embed for binary runtime + a published `@alecs5am/ralphy-sources` package for landing/docs build). Specifically: published npm package (option B) vs build-time tarball fetch (option C) to avoid another publish step?
- **Binary-embed scope.** Should the embed include `docs/playbooks/` + `AGENTS.md` (so the *agent* can read them from the binary's linked dir), or only the CLI-consumed set (`skills`/`guidelines`/`MODELS.md`)? Today the agent (Claude Code) reads playbooks + `AGENTS.md` from a checkout, not the binary — does the end-user flow assume Claude Code has the repo on disk regardless? This determines whether "binary only, no checkout" is even a supported end-user mode.
- **Content-library ownership after the split.** `library.json` + `publish-entity.ts` + the Bunny credentials live in `landing/`, yet the *artifact* is a CLI runtime dependency. Confirm landing remains the owner (recommended — the CDN URL already decouples the code), or should the library JSON + publisher move to core (the CLI's true consumer) with landing reading it back? This is the inverse of the skills/guidelines ownership and worth an explicit decision.
- **`docs:cli` cross-repo edge.** Confirm generate-and-PR (core → docs, option 1) over docs-pulls-core-as-dep (option 2). Needs a bot token with PR rights on the docs repo.
- **`assets` repo vs `ralphy-assets`.** Confirm §6: consolidate into the existing `ralphy-assets` (recommended) rather than create a fourth repo. A companion rename would add a manifest-URL migration + redirect.
- **Dead `templates-loader.ts`.** Confirm it can be deleted outright in stage 0 (it walks a retired `<repo>/templates/` dir), or does any landing screen still reference its output and need a no-op stub first?
- **`out/` / `dist/` hygiene.** Both are gitignored build output; confirm neither was ever accidentally committed before a carve (a stray committed `out/` would bloat the landing `filter-repo`). Run `git log --all --diff-filter=A -- out dist` on the mirror before stage 2.
