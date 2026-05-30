# Monorepo → multi-repo split plan

> **Status:** design only. Nothing in this doc has been executed. No files moved, no repos created, no CI changed. Execution is a separate, dedicated session.
> **Tracks:** [`notes/issues/059-monorepo-split-design-plan-only.md`](../../notes/issues/059-monorepo-split-design-plan-only.md)
> **Scope of the split:** four target repos — **core**, **landing**, **docs**, **assets**.

This plan is grounded in the actual repo as of 2026-05-30. Path/script citations are real. Read [`../../CLAUDE.md`](../../CLAUDE.md) (project layout) and [`../../AGENTS.md`](../../AGENTS.md) (invariants #11/#12 on the `ralphy-assets` companion + asset-cache) for the surrounding context.

---

## 1. Goals & non-goals

### Goals

- **Isolate the only thing a user installs (the `ralphy` binary) from everything that is build-/publish-only** (landing site, Mintlify docs, heavy media). A user `curl | sh` or `npm i -g @alecs5am/ralphy` should never pull a Next.js app or a GB of showcase mp4s.
- **Give each surface its own release cadence + CI.** Landing deploys on every push; the binary releases on a `v*` tag; docs publish to Mintlify; assets change rarely and are heavy.
- **Keep the `ralphy-assets` companion repo's existing contract intact** (manifest at `https://raw.githubusercontent.com/alecs5am/ralphy-assets/main/manifest.json`, SHA-256-verified, no-auth pulls — see [`../../cli/lib/assets-repo.ts`](../../cli/lib/assets-repo.ts)).
- **Make the runtime/build-time shared sources** (`templates/`, `.agents/skills/`, `docs/playbooks/`, `guidelines/`, `MODELS.md`, `AGENTS.md`) have **one owner** and a defined consumption path for the others.

### Non-goals

- Not changing the `ralphy` CLI surface, the provider layer, or the HyperFrames engine.
- Not changing the install UX. `install.sh`, the Homebrew tap, and the npm wrapper must keep working byte-for-byte from the user's side.
- Not splitting `cli/` itself into sub-packages. Core stays a single Bun/tsx package.
- Not retiring `ralphy-assets`. The new `assets` repo is a question of *relationship* to it (see §6), not a greenfield.

### What stays coupled (the crux)

The CLI reads non-code source files **at runtime** from the repo root (`root()` in [`../../cli/lib/paths.ts`](../../cli/lib/paths.ts), defaulting to `process.cwd()` or the linked-project root resolved in [`../../cli/index.ts`](../../cli/index.ts)). These same files are read **at build time** by the landing site. They are the hard part of the split and get their own section (§3).

---

## 2. Path → target-repo mapping

Every top-level entry, with its destination and a coupling note. "core" = the CLI repo a user installs; "landing", "docs", "assets" as named in the issue.

| Path | Target repo | Note |
|---|---|---|
| `cli/` | **core** | The CLI + engine. Sole `bun build --compile` entrypoint ([`../../scripts/build-binaries.ts`](../../scripts/build-binaries.ts) compiles `cli/index.ts`). |
| `scripts/` | **core** | Build + lint + roadmap-validate scripts. A few are docs-oriented (`build-cli-docs.ts`) — see §7. |
| `tests/` | **core** | Unit/integration/live tests of the CLI. |
| `npm/` | **core** | npm wrapper package `@alecs5am/ralphy` (`npm/package.json`, `bin/ralphy.js`, `scripts/install.js`). Ships with core because it tracks the binary version in lockstep. |
| `install.sh`, `install.ps1` | **core** | curl/iwr installers; pin `RALPHY_REPO=alecs5am/ralphy` by default. See §5. |
| `templates/` | **core (owner)** | Read at runtime by the CLI (`repoTemplatesDir()` in [`../../cli/lib/paths.ts`](../../cli/lib/paths.ts)) AND at build time by landing ([`../../landing/lib/templates-loader.ts`](../../landing/lib/templates-loader.ts)). **SHARED** — see §3. Heavy *assets inside* a template move to `assets`; the `template.yaml`/`template.json` + prompt cookbook stay in core. |
| `.agents/` (skills) | **core (owner)** | Read at runtime by `ralphy skill *` ([`../../cli/commands/skill.ts`](../../cli/commands/skill.ts) `resolveBundleDir`) AND at build time by landing ([`../../landing/lib/skills-loader.ts`](../../landing/lib/skills-loader.ts)). `.claude/skills` is a symlink into `.agents/skills`. **SHARED** — see §3. |
| `guidelines/` | **core (owner)** | Read at runtime by `ralphy guideline *` ([`../../cli/commands/guideline.ts`](../../cli/commands/guideline.ts)) AND at build time by landing ([`../../landing/lib/guidelines-loader.ts`](../../landing/lib/guidelines-loader.ts)). **SHARED** — see §3. |
| `MODELS.md` | **core (owner)** | Read at build time by landing ([`../../landing/lib/models-loader.ts`](../../landing/lib/models-loader.ts)); referenced as guidance throughout `cli/`. **SHARED** — see §3. |
| `AGENTS.md` | **core (owner)** | The agent routing contract; `@`-imported by `CLAUDE.md`. The skill installer points other agents at `<repo>/AGENTS.md` ([`../../cli/lib/skill/installer.ts`](../../cli/lib/skill/installer.ts)). Stays in core. |
| `CLAUDE.md` | **core** | Project instructions; `@AGENTS.md` import. Lives where `cli/` lives. |
| `CLI.md` | **core** | CLI cheatsheet. |
| `README.md` | **core** | Each repo gets its own README; this one is the core README. |
| `LICENSE` | **all four** | Apache-2.0 root + MIT for the npm wrapper (`npm/package.json`). Copy the right license into each repo. |
| `docs/` | **core** | `docs/playbooks/` is read by the agent at runtime; `docs/agent-guide.md`, `docs/cli-spec.md`, `docs/cli-surface.generated.md`, `docs/use-cases.md`, `docs/skills-vs-templates.md`, `docs/perf-targets.md`, **this file** — all are operator/agent docs tied to the CLI. Stays in core. **Do NOT confuse with `docs-mintlify/`.** |
| `docs-mintlify/` | **docs** | The Mintlify site (`docs.json`, `.styleguide.md`, `.archive/`, `reference/cli/*.mdx`). The CLI-ref `.mdx` are generated by `scripts/build-cli-docs.ts` from core — cross-repo generation, see §7. |
| `landing/` | **landing** | Next.js marketing + `/library` + skills site. Its loaders read core sources at build time (§3). |
| `desktop/` | **core** (provisional) or **own repo** | Electron app embedding Claude Code. `desktop/package.json` is independent (React 19 + Vite + Electron). It spawns the local `ralphy`/`claude` binary, not a code import. Lowest coupling to anything else. **Open question** — see §9. |
| `notes/` | **core** | Idea/issue/decision inbox; tightly bound to `cli/` dev and `roadmap/`. Dev-only, never shipped. |
| `roadmap/` | **core** | The committed task board; bound to `cli/` work and validated by `scripts/validate-roadmap.ts` (which cites `cli/`, `templates/`, `ralphy-assets/` paths). Stays with core. |
| `dist/` | **gitignored, none** | Build output of `build-binaries.ts`. Regenerated; not committed. |
| `out/` | **gitignored, none** | Next.js export output; belongs conceptually to landing but is regenerated, not committed. |
| `public/` | **landing** | Static assets for the landing site (skill icons live under `landing/public/assets/skills` per `skills-loader.ts`). Top-level `public/` is landing's. |
| `node_modules/` | **none** | Per-repo, regenerated. |
| `package.json`, `bun.lock`, `bunfig.toml`, `tsconfig.json`, `.prettierrc` | **core** | Root toolchain config. Landing/docs/desktop already carry their own (`landing/package.json`, `desktop/package.json`). Each repo keeps the configs it needs. |
| `package-lock.json` | **delete** | Stale npm lockfile in a Bun repo; do not carry forward (Bun-only per dev rules). |
| `skills-lock.json` | **core** | Skill-install lockfile, paired with `.agents/skills`. |
| `BRAND_DESIGN.md` | **landing** | Brand/visual design notes — consumed by the marketing surface, not the CLI. |
| `.github/` | **split per repo** | Each repo gets the workflows relevant to it — see §7. |
| `.husky/` | **core** | Pre-commit hook runner (`prepare: husky` in root `package.json`). |
| `.env` | **none** | Local secrets; never committed (already gitignored). |
| `workspace/` | **none** | Gitignored user output; not part of any repo. `workspace/.ralph/asset-cache/` is the assets cache — see §6. |

**Summary of ownership for the shared set:** `templates/`, `.agents/skills/`, `guidelines/`, `MODELS.md`, `AGENTS.md`, `docs/playbooks/` are **owned by core**, consumed by landing (build-time) and by the running CLI (runtime). This is §3.

---

## 3. The hard problem: runtime + build-time coupling

### What couples to what (grounded)

**Runtime reads (the CLI binary, against `root()`):**

- `templates/` → `repoTemplatesDir()` = `path.join(root, "templates")` ([`../../cli/lib/paths.ts`](../../cli/lib/paths.ts)), used by `ralphy template list/show/suggest/use` ([`../../cli/commands/template.ts`](../../cli/commands/template.ts)).
- `.agents/skills/` → `resolveBundleDir()` walks `repoOverride` → `$RALPHY_REPO_ROOT` → `process.cwd()` ([`../../cli/commands/skill.ts`](../../cli/commands/skill.ts)).
- `guidelines/` → `guidelinesDir()` = `path.join(root(), "guidelines")` ([`../../cli/commands/guideline.ts`](../../cli/commands/guideline.ts)).
- `MODELS.md`, `AGENTS.md`, `docs/playbooks/` → read by the *agent* (Claude Code) at the linked checkout, and referenced by the skill installer which writes pointers to `<repo>/AGENTS.md` + `<repo>/docs/playbooks/` ([`../../cli/lib/skill/installer.ts`](../../cli/lib/skill/installer.ts)).

**The load-bearing fact:** the compiled binary does **not** embed these files. `build-binaries.ts` runs `bun build --compile cli/index.ts` — only JS reachable through imports is bundled; `templates/`/`.agents/`/`guidelines/`/`*.md` are plain files read off disk via `root()`. `root()` defaults to `process.cwd()` and is overridden to the linked-project root by `findProjectRootSafe()`/`setup --link` ([`../../cli/index.ts`](../../cli/index.ts)). `doctor`'s `templatesSource: "bundled"` for binary mode ([`../../cli/commands/doctor.ts`](../../cli/commands/doctor.ts)) is therefore **aspirational, not implemented** — today a pure binary install with no linked checkout has no templates/skills/guidelines to read. The dev story works because devs run from a checkout (`mode: "developer"`, marker triple = `package.json` + `cli/index.ts` + `templates/`).

**Build-time reads (landing, Next.js):**

- `templates/` → `REPO_ROOT = path.resolve(__dirname, "..", "..")` then `templates/` ([`../../landing/lib/templates-loader.ts`](../../landing/lib/templates-loader.ts)).
- `.agents/skills/` → `REPO_ROOT = path.resolve(process.cwd(), "..")` then `.agents/skills` ([`../../landing/lib/skills-loader.ts`](../../landing/lib/skills-loader.ts)).
- `guidelines/`, `MODELS.md` → same `../` REPO_ROOT pattern ([`../../landing/lib/guidelines-loader.ts`](../../landing/lib/guidelines-loader.ts), [`../../landing/lib/models-loader.ts`](../../landing/lib/models-loader.ts)).

So landing reaches **up one directory** out of `landing/` into the monorepo root to read sibling source. After a split, `../` no longer points at core. This is the single change that breaks the most things.

### Options for where shared sources live

| Option | Mechanism | Core | Landing build | CLI runtime | Trade-offs |
|---|---|---|---|---|---|
| **A. Git submodule** | core repo added as a submodule under `landing/vendor/core` and (for runtime) shipped/linked alongside the binary | owner | reads `vendor/core/{templates,...}` | reads linked checkout (unchanged) | Submodules are notoriously fiddly in CI (detached HEAD, `--recurse-submodules`, version drift). Adds a pinned SHA to bump on every shared-source edit. Rejected as primary. |
| **B. Published npm package** | core publishes a `@alecs5am/ralphy-sources` package (just the data dirs + a tiny loader) on each release | owner + publisher | `import` the package, no `../` | binary could bundle it OR fetch it | Clean dependency edge; versioned; landing/docs `npm i` it. Cost: another publish step; runtime binary still needs the *files on disk* unless we embed (see option D). |
| **C. Build-time fetch (tarball/raw)** | landing + docs CI `curl` a pinned tarball of `templates/`+`.agents/skills`+`guidelines`+`MODELS.md` from a core release | owner | fetch into a temp dir, point loaders at it | unchanged (linked checkout) | No submodule pain, no publish ceremony. Cost: a fetch step + pin management; offline dev needs a fallback to a local core checkout. |
| **D. Embed into the binary** | a pre-`compile` step copies the shared set into an embeddable form (`Bun.embeddedFiles` / generated TS module) so the standalone binary carries templates/skills/guidelines/MODELS | owner | n/a (landing still needs them via A/B/C) | binary self-contained — **fixes the aspirational `templatesSource: "bundled"`** | Solves the *runtime* half permanently and removes the linked-checkout requirement for end users. Larger binary. Does nothing for landing/docs build-time. |
| **E. Published JSON artifact** | a CI step serializes the shared set into a single `sources.json` published as a release asset; both landing and the binary consume it | owner | fetch JSON | embed/fetch JSON | One artifact, easy to cache. Cost: lossy for binary template *files* (refs/prompt files) unless base64'd; another generator to keep fresh. |

### Recommendation

**Keep core as the single owner of the shared set, and combine D + B/C:**

1. **Runtime (the user-facing crux): embed the shared set into the binary (option D).** Add a `scripts/embed-sources.ts` step that runs before `bun build --compile` and emits a generated TS module (or uses `Bun` embedded files) containing `templates/`, `.agents/skills/`, `guidelines/`, `MODELS.md`, `AGENTS.md`, `docs/playbooks/`. Then a pure `curl | sh` / `npm i -g` install is genuinely self-contained — which is what `doctor`'s `templatesSource: "bundled"` already claims. The `root()`/linked-checkout path stays as the **dev override** (when `mode: "developer"`, read from disk so edits are live). This removes the hidden "you also need a checkout" requirement that the current binary install silently has.

2. **Build-time (landing + docs): consume a published sources package (option B), fall back to a sibling core checkout for local dev.** Replace the `path.resolve(process.cwd(), "..")` REPO_ROOT in the four landing loaders with: `process.env.RALPHY_CORE_DIR` → else the resolved `@alecs5am/ralphy-sources` package dir → else `../` (legacy sibling-checkout dev). One env var, one published dep, no submodule.

Why this split of mechanisms: the runtime and build-time halves have different constraints (the binary must be offline-self-contained; the Next.js build is online and can `npm i`), so forcing one mechanism on both (e.g. submodule everywhere) optimizes neither. Embedding fixes a real latent bug; a published sources package gives landing/docs a clean, versioned edge without `../` reaching into a repo that no longer exists.

**Avoid the submodule (option A)** as the primary mechanism — it pushes a pinned-SHA bump into every shared-source edit and is the most common cross-repo CI failure mode. It remains an acceptable *local-dev* fallback if maintainers prefer checkouts over `npm i`.

---

## 4. Git-history strategy per repo

Use `git filter-repo` (not the deprecated `filter-branch`, not `subtree split`) for repos that should keep authorship history of their carved-out paths; use a clean cut where history is noise.

| Repo | Strategy | Command shape | History kept |
|---|---|---|---|
| **core** | **In-place.** Core is the natural heir of this repo — fewest moves if core *stays* `alecs5am/ralphy`. Just `git rm -r` the carved-out dirs (`landing/`, `docs-mintlify/`, heavy assets) in one commit. | `git rm -r landing docs-mintlify; git commit` | Full history (it *is* this repo). The removed dirs remain reachable in old commits — fine. |
| **landing** | **`git filter-repo` path-keep.** Preserve landing's own commit history. | `git filter-repo --path landing/ --path public/ --path BRAND_DESIGN.md --path-rename landing/:` (run on a fresh clone) | History of `landing/`, `public/`, `BRAND_DESIGN.md` only, rebased to root. |
| **docs** | **`git filter-repo` path-keep.** | `git filter-repo --path docs-mintlify/ --path-rename docs-mintlify/:` | History of `docs-mintlify/` only. Note `.archive/` comes along — keep it. |
| **assets** | **Depends on §6 decision.** If merged into existing `ralphy-assets`: clean cut, no history transfer (heavy binaries + git-history is the worst combo). If a new repo: clean `git init`, no carved history — large media should not carry rewritten history. | `git init` + LFS/manifest, or push into `ralphy-assets` | None (clean). |

**Pre-flight for `filter-repo`:** always operate on a fresh `git clone --no-local` mirror (filter-repo refuses to run on a repo with a configured remote and existing reflogs unless `--force`). Tag the monorepo HEAD (`pre-split-2026-NN`) before any carve so every new repo can cite its origin commit.

---

## 5. Install-flow impact

The install surface must keep working unchanged from the user's side. What actually changes:

| Channel | File / mechanism | Changes if core stays `alecs5am/ralphy` | Changes if core moves to a new repo name |
|---|---|---|---|
| **curl installer** | [`../../install.sh`](../../install.sh) | None. `REPO="${RALPHY_REPO:-alecs5am/ralphy}"`, fetches `releases/latest`. | Bump the default `RALPHY_REPO` + the `raw.githubusercontent.com/.../install.sh` URL in docs. |
| **PowerShell installer** | `install.ps1` | None. | Same `RALPHY_REPO` bump. |
| **Homebrew tap** | `alecs5am/homebrew-tap` (external) → `brew install alecs5am/tap/ralphy` | None — tap formula points at GitHub Release asset URLs which the core repo still produces. | Formula `url`/`homepage` must point at the new repo's releases. |
| **npm** | [`../../npm/package.json`](../../npm/package.json) `@alecs5am/ralphy`; postinstall [`../../npm/scripts/install.js`](../../npm/scripts/install.js) downloads `releases/download/v${VERSION}/ralphy-${os}-${arch}` from `RALPHY_REPO` (default `alecs5am/ralphy`). | None. | Bump default `RALPHY_REPO` in `install.js`. |

**Hard requirement either way:** core keeps producing the **same release-asset names** (`ralphy-${os}-${arch}[.exe]` + `SHA256SUMS`) from `build-binaries.ts`, on a `v*` tag, via `release.yml`. The four downstream channels key off those exact asset names — do not rename them in the split.

**Recommendation: keep core at `alecs5am/ralphy`** (the current repo). It makes install a no-op change: every installer, the tap, and the npm postinstall already default to that repo, and the README curl one-liner stays valid. Move *landing* and *docs* out to new repos instead. This minimizes the §5/§7 blast radius.

**New risk to add to install-smoke:** once the binary embeds sources (§3 recommendation), `install-smoke.yml`'s `ralphy template list --json` step becomes a real assertion (today it `|| true`s because a pure binary has no templates). Tighten it post-embed.

---

## 6. Asset-cache impact

Today's asset wiring ([`../../cli/lib/assets-repo.ts`](../../cli/lib/assets-repo.ts), [`../../cli/commands/assets.ts`](../../cli/commands/assets.ts)):

- Manifest URL is hard-coded: `https://raw.githubusercontent.com/alecs5am/ralphy-assets/main/manifest.json`.
- `ralphy assets pull / pull-pool / install / list / clean / cache-info` fetch from that companion repo and cache under `workspace/.ralph/asset-cache/` (`assetCacheDir()` in [`../../cli/lib/paths.ts`](../../cli/lib/paths.ts)).
- `ralphy template use` auto-pulls required heavy assets; `ralphy template extract --lift-heavy` *writes* into a local checkout of `ralphy-assets/pool/` ([`../../cli/commands/template.ts`](../../cli/commands/template.ts)).
- `docs/assets-catalog.md` is generated from the live manifest (`ralphy assets catalog --write`).

**The `assets` target repo in this plan and the existing `ralphy-assets` companion are the same concern.** Recommendation: **do not create a new `assets` repo — keep `ralphy-assets` as the single asset home, and merge any heavy media currently inside the monorepo's `templates/<...>/` into `ralphy-assets/pool/`** via the existing `--lift-heavy` path. Rationale:

- The CLI already speaks the `ralphy-assets` manifest contract end-to-end; inventing a second asset repo means a second manifest, a second cache layout, and a config knob nobody wants.
- Heavy media + git history is the worst combo (§4); `ralphy-assets` already isolates that weight from core.
- The split's intent — "keep heavy media out of the thing users install" — is *already satisfied* by `ralphy-assets`. The only monorepo cleanup is lifting any large files still sitting under `templates/` into `ralphy-assets/pool/`.

**No changes needed** to the manifest URL, the cache dir, or the `ralphy assets *` verbs. `asset-cache/` stays gitignored under `workspace/`, untouched by the split. If maintainers *do* want a rename (e.g. `ralphy-assets` → `ralphy-pool`), that is a manifest-URL constant + redirect, tracked as an open question (§9).

---

## 7. CI split

Current state: there is **no `ci.yml`** — the issue's reference to it predates the actual layout. The real workflows are `.github/workflows/test.yml`, `release.yml`, `install-smoke.yml`. The "10 lint scripts" are the `lint:*` + `*:check` scripts in [`../../package.json`](../../package.json):

`lint:errors`, `lint:help-examples`, `lint:skills`, `lint:agents-md`, `lint:templates`, `lint:confirmation-shape`, `lint:motion-graphics`, `lint:gen-log`, `lint:docs-links:fast`, `cli:surface:check`, `docs:cli:check` (plus the umbrella `lint` script). `test.yml` today runs a subset: `lint:errors`, `lint:help-examples`, `cli:surface:check`, `docs:cli:check`, `lint:docs-links:fast`.

| Check | Source it validates | Target repo | Cross-repo? |
|---|---|---|---|
| `bun test` (unit/integration) | `cli/` | **core** | No |
| `lint:errors` | `cli/lib/errors/catalog.ts` | **core** | No |
| `lint:help-examples` | `cli/commands/*` `--help` | **core** | No |
| `lint:skills` | `.agents/skills/*` | **core** (owns skills) | Landing should re-run a read-only copy in its build to fail fast on a stale sources pin. |
| `lint:agents-md` | `AGENTS.md` routing table | **core** | No |
| `lint:templates` | `templates/*/template.yaml` | **core** (owns templates) | Landing build validates the same on its pinned copy. |
| `lint:confirmation-shape` | `prompts.json` in workspace fixtures | **core** | No |
| `lint:motion-graphics` | `prompts.json` | **core** | No |
| `lint:gen-log` | gen-log schema | **core** | No |
| `cli:surface:check` | `docs/cli-surface.generated.md` vs `cli/` | **core** | No |
| `docs:cli:check` | `docs-mintlify/reference/cli/*.mdx` vs `cli/` | **CROSS** — generator (`scripts/build-cli-docs.ts`) lives in core, output lives in **docs** | Yes — see below |
| `lint:docs-links:fast` | links in `docs/`, `docs-mintlify/`, root `*.md`, `roadmap/` | **split** — core runs it over its surface, docs runs it over `docs-mintlify/` | Partially |

**The one genuinely cross-repo check is `docs:cli:check`.** Today `scripts/build-cli-docs.ts` reads `cli/` and writes `docs-mintlify/reference/cli/*.mdx`; CI fails if they drift. After the split, core owns the generator and the source, docs owns the output. Options:

1. **Generate-and-PR (recommended):** a core CI job runs `bun run docs:cli` and, on diff, opens a PR against the `docs` repo (via `gh pr create` with a bot token). Docs CI then just lint-checks links. Keeps the source-of-truth edge one-directional (core → docs).
2. **Docs pulls core as a build dep** (the §3 sources package) and runs the generator itself in docs CI. Simpler edge, but couples docs CI to core's TS toolchain.

Recommend option 1: docs stays a pure-content repo; core pushes the generated reference downstream on release.

**Resulting per-repo CI:**

- **core** `test.yml`: `bun test` + all `lint:*` + `cli:surface:check` + `docs:cli` (generate + downstream PR). `release.yml`: `build:bin` (now with the embed-sources step) + GH Release. `install-smoke.yml`: unchanged, tightened (§5).
- **landing**: Next build + the four loaders against the pinned sources + a read-only `lint:skills`/`lint:templates` over the pinned copy + deploy.
- **docs**: Mintlify build/preview + `lint:docs-links` over `docs-mintlify/`.
- **assets** (`ralphy-assets`): manifest validation + SHA-256 regen (already exists in the companion).

---

## 8. Staged cutover sequence + rollback

Ordered low-risk → high-risk. Each stage is independently revertible. Do **not** carve core until everything that reads from it has a working non-`../` source path.

**Stage 0 — Prep (no carve).** Tag monorepo HEAD `pre-split`. Add the §3 indirection *first, in the monorepo*: (a) `scripts/embed-sources.ts` + wire into `build:bin`; (b) refactor the four landing loaders to the env-var → package → `../` fallback chain. Verify both old (`../`) and new paths work. **Rollback:** revert the two commits; nothing external changed.

**Stage 1 — docs out first (lowest coupling).** `filter-repo` `docs-mintlify/` into a new `ralphy-docs` repo. Wire docs CI (links only). Set up the core→docs generate-and-PR job (§7 option 1) but leave the in-monorepo `docs:cli:check` running in parallel until the cross-repo job is green twice. **Rollback:** the monorepo copy of `docs-mintlify/` is still present (we only *copied* history out); delete the new repo, drop the cross-repo job.

**Stage 2 — landing out next.** `filter-repo` `landing/` + `public/` + `BRAND_DESIGN.md` into `ralphy-landing`. Publish the §3 sources package from the monorepo first, point landing's loaders at it (or a sibling core checkout for local dev), verify a clean `next build`. **Rollback:** monorepo `landing/` still present; delete the new repo and the sources-package consumption commit.

**Stage 3 — assets consolidation.** Lift any heavy files still under `templates/<...>/` into `ralphy-assets/pool/` via `ralphy template extract --lift-heavy` (or a one-off migration script). Regenerate `manifest.json` + `docs/assets-catalog.md`. No new repo (per §6). **Rollback:** the lifted files are *copies* in `ralphy-assets`; restore the monorepo originals from `pre-split` tag and revert the manifest.

**Stage 4 — core cleanup (last, highest blast radius).** Now that nothing reads `landing/`/`docs-mintlify/` from the monorepo, `git rm -r landing docs-mintlify public BRAND_DESIGN.md package-lock.json` in core; switch `release.yml` to the embed-sources build; tighten `install-smoke.yml`. Keep core at `alecs5am/ralphy` so installers don't move (§5). **Rollback:** `git revert` the removal commit; the binaries and installers were untouched, so users see nothing.

**Global rollback note:** because stages 1–3 only *copy* paths out (no monorepo deletion until stage 4), the monorepo remains a fully working superset through stage 3. The point of no easy return is stage 4's `git rm`; gate it behind two green cross-repo CI runs of every dependent.

---

## 9. Open questions

- **Core repo identity.** Keep core as `alecs5am/ralphy` (recommended — zero install churn) or rename and accept bumping `RALPHY_REPO` defaults + tap + npm postinstall + docs URLs? Decide before stage 4.
- **`desktop/` placement.** Stays in core (it already builds independently and only spawns the binary), or carves into its own `ralphy-desktop` repo? It has the lowest coupling of anything, so either works — depends on release-cadence preference.
- **Shared-source mechanism per consumer.** Confirm the §3 recommendation (embed for binary runtime + published `@alecs5am/ralphy-sources` package for landing/docs build). Specifically: do we want a published npm package, or is build-time tarball fetch (option C) preferred to avoid another publish step?
- **`assets` repo vs `ralphy-assets`.** Confirm §6: merge into the existing `ralphy-assets` (recommended) rather than create a fourth repo. If a rename of the companion is wanted, that adds a manifest-URL migration + redirect.
- **Binary-embed scope.** Should the embed include `docs/playbooks/` and `AGENTS.md` (so the *agent* reads them from the binary's linked dir), or only the CLI-consumed set (`templates`/`skills`/`guidelines`/`MODELS.md`)? The agent currently reads playbooks from a checkout, not the binary — does the end-user flow assume Claude Code has the repo on disk regardless?
- **`docs:cli` cross-repo edge.** Confirm generate-and-PR (core → docs, option 1) over docs-pulls-core-as-dep (option 2). Needs a bot token with PR rights on the docs repo.
- **`out/` and `dist/`.** Both are gitignored build output; confirm neither is accidentally committed anywhere before the carve (a stray committed `out/` would bloat the landing `filter-repo`).
