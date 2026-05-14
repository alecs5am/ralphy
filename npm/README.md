# @alecs5am/ralphy

npm wrapper for [`ralphy`](https://github.com/alecs5am/ralphy) — open-source UGC video factory CLI.

## Install

```bash
npm install -g @alecs5am/ralphy
```

Works on macOS / Linux / Windows. `postinstall` downloads the right prebuilt binary from the matching [GitHub Release](https://github.com/alecs5am/ralphy/releases) and shims a launcher that forwards stdio.

After install:

```bash
ralphy --version
ralphy help
ralphy setup
```

## Versioning

This npm package version tracks the upstream `ralphy` binary 1:1. `npm i -g @alecs5am/ralphy@0.0.1` pulls `v0.0.1` binaries from the GitHub Release.

## Updating

```bash
npm update -g @alecs5am/ralphy
```

## Uninstall

```bash
npm uninstall -g @alecs5am/ralphy
```

## Why a wrapper?

The actual `ralphy` binary is a single statically linked file (~60–120 MB depending on platform) built with `bun build --compile`. The npm package is ~10 KB — it carries only the launcher and a postinstall script. This keeps `node_modules` small and lets a fresh `npm install` always pull a matching release without us having to publish six platform-specific subpackages.

If you'd rather not go through npm:
- macOS / Linux: `curl -fsSL https://raw.githubusercontent.com/alecs5am/ralphy/main/install.sh | sh`
- macOS Homebrew: `brew install alecs5am/tap/ralphy`
- Windows PowerShell: `irm https://raw.githubusercontent.com/alecs5am/ralphy/main/install.ps1 | iex`

## Publishing (maintainers)

```bash
cd npm
# bump version to match the latest ralphy release
jq --arg v "$NEW_VERSION" '.version = $v' package.json > package.json.tmp && mv package.json.tmp package.json
npm publish --access public
```

The `publishConfig.access` field is already set to `public` so the scoped package is published as a public package on the registry.
