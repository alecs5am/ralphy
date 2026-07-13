# Repository Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish each independently runnable Ralphy product as a history-preserving repository and leave `alecs5am/ralphy` as a standalone local-agent CLI.

**Architecture:** Extract the web, public docs, desktop, and farm surfaces from temporary clones with `git filter-repo`, then push each recovery point before deleting its source from core. Farm owns automation and Studio/Docker runtime and invokes the installed core through `ralphy --json`; core never imports a sibling repository.

**Tech Stack:** Git, git-filter-repo, GitHub CLI, Bun, TypeScript, Next.js, Mintlify, Electron, Preact/Vite, Docker Compose

## Global Constraints

- All repositories are public under `alecs5am`.
- Preserve Git authorship and file history during extraction.
- Push extracted repositories before deleting their source files from core.
- Do not copy ignored `.env`, `.ralphy/`, build output, or local caches.
- Keep operational `docs/playbooks/`, `.agents/skills/`, and `guidelines/` in core.
- Farm may call `ralphy --json` but must not import files from a sibling `ralphy/cli/` checkout.
- Use Bun only; do not retain or generate `package-lock.json`.
- Repository files and commit messages remain English-only.

---

### Task 1: Create the umbrella and extraction helper

**Files:**
- Create: `/Users/maximovchinnikov/github/ralphy/AGENTS.md`
- Create: `/Users/maximovchinnikov/github/ralphy/CLAUDE.md`
- Create: `/Users/maximovchinnikov/github/ralphy/CLUADE.md` (symlink)

**Interfaces:**
- Consumes: the repository map in the design specification
- Produces: a stable sibling checkout layout and agent routing contract

- [ ] **Step 1: Create the umbrella directory**

Run: `mkdir -p /Users/maximovchinnikov/github/ralphy`

Expected: the directory exists and contains no nested Git repository of its own.

- [ ] **Step 2: Write the routing guide**

Create `AGENTS.md` with a repository ownership table, dependency direction `web/docs/desktop/farm -> ralphy`, per-repository validation commands, the rule to read each child `AGENTS.md`, and the prohibition on cross-repository source imports.

- [ ] **Step 3: Add Claude aliases**

Create `CLAUDE.md` containing `@AGENTS.md`, then run:

```bash
ln -s CLAUDE.md /Users/maximovchinnikov/github/ralphy/CLUADE.md
```

Expected: `readlink CLUADE.md` prints `CLAUDE.md`.

### Task 2: Extract and publish the web repository

**Files:**
- Extract: `landing/**` to `/Users/maximovchinnikov/github/ralphy/ralphy-web/**`
- Move: `BRAND_DESIGN.md` to `/Users/maximovchinnikov/github/ralphy/ralphy-web/BRAND_DESIGN.md`
- Create: `/Users/maximovchinnikov/github/ralphy/ralphy-web/README.md`

**Interfaces:**
- Consumes: public library data and publishing scripts currently rooted at `landing/`
- Produces: standalone `alecs5am/ralphy-web`

- [ ] **Step 1: Filter a temporary clone**

```bash
git clone --no-local /Users/maximovchinnikov/github/ugc-cli /Users/maximovchinnikov/github/ralphy/ralphy-web
cd /Users/maximovchinnikov/github/ralphy/ralphy-web
git filter-repo --force --path landing/ --path BRAND_DESIGN.md --path-rename landing/:
git branch -M main
```

Expected: `git log -- app` includes commits from the original landing history and no `cli/` directory exists.

- [ ] **Step 2: Add standalone documentation and repair root-relative paths**

Document `bun install`, `bun run build`, and library publishing commands in `README.md`. Replace references whose only valid location was `../cli` with a documented `RALPHY_REPO` input or checked-in web-owned data.

- [ ] **Step 3: Verify the application**

Run: `bun install --frozen-lockfile && bun run build`

Expected: exit code 0.

- [ ] **Step 4: Scan, commit, create, and push**

```bash
gitleaks detect --source .
git add -A
git commit -m "chore: establish standalone Ralphy web repository"
gh repo create alecs5am/ralphy-web --public --source . --remote origin --push
```

Expected: `gh repo view alecs5am/ralphy-web --json url` succeeds.

### Task 3: Extract and publish the public documentation repository

**Files:**
- Extract: `docs-mintlify/**` to `/Users/maximovchinnikov/github/ralphy/ralphy-docs/**`
- Create: `/Users/maximovchinnikov/github/ralphy/ralphy-docs/README.md`

**Interfaces:**
- Consumes: the current public documentation snapshot
- Produces: standalone `alecs5am/ralphy-docs`

- [ ] **Step 1: Filter and rename the docs subtree**

```bash
git clone --no-local /Users/maximovchinnikov/github/ugc-cli /Users/maximovchinnikov/github/ralphy/ralphy-docs
cd /Users/maximovchinnikov/github/ralphy/ralphy-docs
git filter-repo --force --path docs-mintlify/ --path-rename docs-mintlify/:
git branch -M main
```

Expected: `docs.json` is at repository root and operational core playbooks are absent.

- [ ] **Step 2: Document local preview and snapshot ownership**

Add `README.md` explaining Mintlify preview and that generated CLI pages are committed snapshots, not a runtime dependency on core.

- [ ] **Step 3: Verify and publish**

Run the package-defined docs validation if present, otherwise `npx mintlify validate`. Then run `gitleaks detect --source .`, commit `chore: establish standalone Ralphy docs repository`, and create/push `alecs5am/ralphy-docs` with `gh repo create --public --source . --remote origin --push`.

Expected: the validation exits 0 and the GitHub repository is reachable.

### Task 4: Extract and publish the desktop repository

**Files:**
- Extract: `desktop/**` to `/Users/maximovchinnikov/github/ralphy/ralphy-desktop/**`
- Create: `/Users/maximovchinnikov/github/ralphy/ralphy-desktop/README.md`

**Interfaces:**
- Consumes: installed agent CLIs and the installed `ralphy` command
- Produces: standalone `alecs5am/ralphy-desktop`

- [ ] **Step 1: Filter the desktop subtree**

```bash
git clone --no-local /Users/maximovchinnikov/github/ugc-cli /Users/maximovchinnikov/github/ralphy/ralphy-desktop
cd /Users/maximovchinnikov/github/ralphy/ralphy-desktop
git filter-repo --force --path desktop/ --path-rename desktop/:
git branch -M main
```

Expected: the Electron package manifest is at repository root.

- [ ] **Step 2: Remove source-tree assumptions**

Ensure process spawning resolves `RALPHY_BIN || "ralphy"` and does not construct paths into `../cli`. Document supported coding agents and local development commands in `README.md`.

- [ ] **Step 3: Verify and publish**

Run `bun install --frozen-lockfile`, the package lint/typecheck command, and the package build command. Scan with gitleaks, commit `chore: establish standalone Ralphy desktop repository`, then create/push `alecs5am/ralphy-desktop`.

Expected: all commands exit 0 and the GitHub repository is reachable.

### Task 5: Extract and publish the farm recovery point

**Files:**
- Extract: `studio/**`, `docker/**`, `cli/commands/{farm,workflow,run,studio}.ts`, `cli/lib/{farm,workflow}/**`, farm-only helpers, tests, docs, and skills
- Create: `/Users/maximovchinnikov/github/ralphy/ralphy-farm/README.md`
- Create: `/Users/maximovchinnikov/github/ralphy/ralphy-farm/src/ralphy-cli.ts`
- Test: `/Users/maximovchinnikov/github/ralphy/ralphy-farm/tests/ralphy-cli.test.ts`

**Interfaces:**
- Consumes: `RALPHY_BIN` environment variable and JSON stdout from core
- Produces: `runRalphy(args: string[], options?: { cwd?: string }): Promise<unknown>`

- [ ] **Step 1: Filter all automation-owned paths into one history-preserving clone**

Build the exact include list from `rg` import closure starting at `cli/commands/{farm,workflow,run,studio}.ts`, `studio/`, and `docker/`. Clone with `--no-local`, run one `git filter-repo --force` invocation with every `--path`, and rename the branch to `main`.

Expected: `git log -- studio` and `git log -- cli/lib/workflow` retain original commits, while `landing/`, `desktop/`, and `docs-mintlify/` are absent.

- [ ] **Step 2: Write a failing CLI adapter test**

```ts
import { expect, test } from "bun:test";
import { runRalphy } from "../src/ralphy-cli";

test("parses JSON from the configured ralphy binary", async () => {
  process.env.RALPHY_BIN = "./tests/fixtures/fake-ralphy";
  expect(await runRalphy(["workspace", "list", "--json"])).toEqual({ ok: true });
});
```

Run: `bun test tests/ralphy-cli.test.ts`

Expected: FAIL because `src/ralphy-cli.ts` does not exist.

- [ ] **Step 3: Implement the process boundary**

```ts
export async function runRalphy(args: string[], options: { cwd?: string } = {}): Promise<unknown> {
  const proc = Bun.spawn([process.env.RALPHY_BIN || "ralphy", ...args], {
    cwd: options.cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) throw new Error(stderr.trim() || `ralphy exited ${code}`);
  return JSON.parse(stdout);
}
```

Run: `bun test tests/ralphy-cli.test.ts`

Expected: PASS.

- [ ] **Step 4: Replace sibling core imports**

Use `ast-grep` to locate imports from core command/provider/project/render/eval/unit modules. Replace execution calls with `runRalphy([...args, "--json"])`; keep farm-owned schemas and orchestration local.

Run: `rg 'from ["'"'](\.\./)+.*ralphy/(cli|src)|from ["'"'](\.\./)+cli/' src studio cli`

Expected: no matches that cross a repository boundary.

- [ ] **Step 5: Verify and publish**

Run farm tests, Studio tests/build, and `docker compose config`. Scan with gitleaks, commit `chore: establish standalone Ralphy farm repository`, and create/push `alecs5am/ralphy-farm`.

Expected: all checks exit 0 and the GitHub repository is reachable.

### Task 6: Transfer the binary research corpus to assets

**Files:**
- Move: `notes/research/prompts/_renders/**` to `/Users/maximovchinnikov/github/ralphy-assets/prompt-renders/**`
- Modify: `/Users/maximovchinnikov/github/ralphy-assets/README.md`

**Interfaces:**
- Consumes: tracked prompt render fixtures from core
- Produces: asset-owned corpus with source attribution

- [ ] **Step 1: Verify the existing assets checkout**

Run: `git -C /Users/maximovchinnikov/github/ralphy-assets status --short --branch && git -C /Users/maximovchinnikov/github/ralphy-assets remote -v`

Expected: a known clean branch and the `alecs5am/ralphy-assets` remote.

- [ ] **Step 2: Copy, document, scan, and push assets first**

Copy the tracked corpus preserving filenames, document its origin and license in the assets README, run gitleaks, commit `assets: add prompt model render corpus`, and push.

Expected: the pushed assets commit contains the same file count and byte count as core.

### Task 7: Remove extracted products and farm code from core

**Files:**
- Delete: `landing/**`, `docs-mintlify/**`, `desktop/**`, `studio/**`, `docker/**`
- Delete: farm/workflow-only commands, libraries, tests, docs, and dependencies
- Delete: `notes/research/prompts/_renders/**`, `package-lock.json`, `bitacora-firstbug-001.preview.txt`
- Modify: `cli/index.ts`, `package.json`, `bun.lock`, `AGENTS.md`, core docs and tests

**Interfaces:**
- Consumes: pushed repository URLs and a complete import/callsite inventory
- Produces: standalone agent-facing `ralphy` CLI

- [ ] **Step 1: Assert every destination is pushed**

Run `gh repo view` for `ralphy-web`, `ralphy-docs`, `ralphy-desktop`, `ralphy-farm`, and `ralphy-assets` and record their default branch heads.

Expected: every command succeeds before any deletion.

- [ ] **Step 2: Remove extracted trees and stale artifacts**

Use `git rm -r` for the extracted directories and corpus. Remove farm command registrations from `cli/index.ts` and farm-only dependencies from `package.json`, then run `bun install` to update `bun.lock`.

- [ ] **Step 3: Remove dangling references**

Run:

```bash
rg 'landing/|docs-mintlify/|desktop/|studio/|docker/|commands/(farm|workflow|run|studio)|lib/(farm|workflow)' --glob '!docs/superpowers/**'
```

For every match, either point documentation to the new GitHub repository or delete a farm-only core test/doc. No runtime source may reference an extracted path.

- [ ] **Step 4: Verify core independently**

Run `bun run lint`, targeted CLI tests, `bun test tests/integration/`, CLI surface generation/check, package build, and binary smoke from core with no sibling repository on module resolution paths.

Expected: every command exits 0.

- [ ] **Step 5: Scan, commit, and push core**

Run the no-Cyrillic gate and gitleaks, commit `refactor: split independent products from core`, and push `codex/repo-split`.

Expected: the remote branch points to the new commit and `git status --short` is empty.

### Task 8: Place all checkouts under the umbrella

**Files:**
- Move: `/Users/maximovchinnikov/github/ugc-cli` to `/Users/maximovchinnikov/github/ralphy/ralphy`
- Move: `/Users/maximovchinnikov/github/ralphy-assets` to `/Users/maximovchinnikov/github/ralphy/ralphy-assets`

**Interfaces:**
- Consumes: clean, pushed repositories
- Produces: the requested local multi-repository workspace

- [ ] **Step 1: Verify every checkout is clean**

Run `git -C <repo> status --short` for all six repositories.

Expected: no output from any repository.

- [ ] **Step 2: Move the remaining existing checkouts**

Move core and assets from the parent directory into the umbrella. Do not move ignored `.ralphy/` user data out of core; it travels with the core checkout unchanged.

- [ ] **Step 3: Run the umbrella smoke checks**

Run `ralphy --version` from the core checkout, package builds in web/docs/desktop/farm, and `gh repo view` for all remote repositories.

Expected: all local paths and remotes match the repository table in `AGENTS.md`.
