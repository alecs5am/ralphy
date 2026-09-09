# Bundled Local Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Package and launch the exact locally verified Ralphy core binary from Ralphy Desktop without any public release or production fallback.

**Architecture:** Electron main resolves one executable before constructing `RalphySession`: packaged builds require `Contents/Resources/bin/ralphy`, while development keeps the existing `RALPHY_BIN`/PATH behavior. The macOS packager validates, embeds, hashes, and smoke-runs the supplied local binary before signing the app.

**Tech Stack:** Electron, Node filesystem/crypto/child-process APIs, Vitest, existing macOS package script

## Global Constraints

- A packaged app launches only `Contents/Resources/bin/ralphy`.
- `RALPHY_BIN` remains an explicit development and test override.
- Production never falls back to a global CLI, scanner, or mock state.
- The renderer never receives an executable or filesystem path.
- Do not commit the compiled core binary.
- Use Bun and keep repository files and commit messages English-only.

---

### Task 1: Resolve the production executable fail-closed

**Files:**
- Create: `electron/ralphy/executable.ts`
- Modify: `electron/main.ts`
- Test: `tests/ralphy-executable.test.ts`

**Interfaces:**
- Consumes: `app.isPackaged`, `process.resourcesPath`, `process.env`
- Produces: `resolveRalphyExecutable(input): string | undefined`

- [ ] **Step 1: Write the failing resolver tests**

Cover these exact cases:

```ts
expect(resolveRalphyExecutable({
  isPackaged: true,
  resourcesPath: "/Applications/Ralphy Media.app/Contents/Resources",
  env: { RALPHY_BIN: "/tmp/dev-ralphy" },
})).toBe("/Applications/Ralphy Media.app/Contents/Resources/bin/ralphy");

expect(resolveRalphyExecutable({
  isPackaged: false,
  resourcesPath: "/unused",
  env: { RALPHY_BIN: "/tmp/dev-ralphy" },
})).toBe("/tmp/dev-ralphy");

expect(resolveRalphyExecutable({
  isPackaged: false,
  resourcesPath: "/unused",
  env: {},
})).toBeUndefined();
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `bun run test -- tests/ralphy-executable.test.ts`

Expected: module/function missing.

- [ ] **Step 3: Implement the pure resolver and wire main**

```ts
export function resolveRalphyExecutable(input: {
  isPackaged: boolean;
  resourcesPath: string;
  env: NodeJS.ProcessEnv;
}): string | undefined {
  if (input.isPackaged) return join(input.resourcesPath, "bin", "ralphy");
  return input.env.RALPHY_BIN || undefined;
}
```

Construct `RalphySession` with `{ bin }` only when the resolver returns a value. Do not expose the result through preload or renderer state.

- [ ] **Step 4: Verify and commit**

Run: `bun run test -- tests/ralphy-executable.test.ts tests/ralphy-client.test.ts tests/ralphy-session.test.ts && bun run typecheck`

```bash
git add electron/ralphy/executable.ts electron/main.ts tests/ralphy-executable.test.ts
git commit -m "feat(desktop): select bundled core runtime"
```

### Task 2: Embed, hash, and smoke the local core binary

**Files:**
- Create: `scripts/bundled-core.mjs`
- Modify: `scripts/package-mac.mjs`
- Modify: `package.json`
- Modify: `scripts/smoke-electron.mjs`
- Test: `tests/bundled-core.test.ts`

**Interfaces:**
- Consumes: required `RALPHY_CORE_BIN=/absolute/path/to/ralphy-darwin-arm64`
- Produces: `Contents/Resources/bin/ralphy` mode `0755` and `Contents/Resources/ralphy-core.json`

- [ ] **Step 1: Write the failing packaged artifact test**

Import `validateCoreSource(path)` and `sha256File(path)` from
`scripts/bundled-core.mjs`. Assert validation rejects a missing path,
directory, symlink, and non-executable file, accepts a regular executable
file, and the digest helper matches `createHash("sha256")` for a fixture.

- [ ] **Step 2: Run the test and confirm RED**

Run: `bun run test -- tests/bundled-core.test.ts`

Expected: module/helpers missing.

- [ ] **Step 3: Embed the exact binary before codesign**

Implement the two helpers with Node filesystem/crypto streams, then import
them from `scripts/package-mac.mjs`:

1. require absolute `process.env.RALPHY_CORE_BIN`;
2. validate it as a regular, non-symlink executable file;
3. run `[source, "--version"]` with `execFileSync` and require exit 0;
4. copy to `join(resources, "bin/ralphy")` and set mode `0755`;
5. compute SHA-256 with `sha256File`;
6. write mode-`0600` `ralphy-core.json` containing only `{ version, sha256 }`;
7. sign the app after both files exist.

Do not add a download, global fallback, or committed binary.

- [ ] **Step 4: Make smoke assert the packaged runtime**

When `RALPHY_PACKAGED_APP` is set, `scripts/smoke-electron.mjs` imports the
same helpers, verifies the embedded file, recomputes its SHA-256 against
`ralphy-core.json`, runs `--version`, then launches that app. The normal
development smoke remains unchanged.

Add `"smoke:packaged": "RALPHY_PACKAGED_APP='release/Ralphy Media.app' node scripts/smoke-electron.mjs"` to `package.json`.

- [ ] **Step 5: Verify and commit**

Run with the exact local core binary:

```bash
bun run test -- tests/bundled-core.test.ts
bun run typecheck
RALPHY_CORE_BIN=/Users/maximovchinnikov/github/ralphy/ralphy/.worktrees/sqlite-domain-store/dist/binaries/ralphy-darwin-arm64 bun run package:mac
bun run smoke:packaged
codesign --verify --deep --strict "release/Ralphy Media.app"
```

```bash
git add scripts/bundled-core.mjs scripts/package-mac.mjs scripts/smoke-electron.mjs package.json tests/bundled-core.test.ts
git commit -m "build(desktop): embed verified local core"
```
