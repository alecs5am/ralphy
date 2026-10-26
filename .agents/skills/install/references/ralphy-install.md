# Ralphy install playbook

Install the standalone CLI and initialize a local Workspace. No source checkout is required.

## Check the environment

Check `command -v ralphy` and `command -v ffmpeg`. The standalone binary embeds its Bun runtime. Use `ralphy doctor` to identify external rendering prerequisites.

## Install or upgrade the CLI

Use one installation channel:

```bash
brew install alecs5am/tap/ralphy
# Cross-platform Node wrapper:
npm install -g @alecs5am/ralphy
# macOS / Linux standalone binary:
curl -fsSL https://raw.githubusercontent.com/alecs5am/ralphy/main/install.sh | sh
```

Confirm with `ralphy --version`. If it is older than the plugin's required CLI version, upgrade through the same channel before using the plugin's commands. Do not clone the repository as part of ordinary installation.

## Initialize a Workspace

In the user's chosen working directory, run:

```bash
ralphy setup --non-interactive
```

This creates `.ralphy/ralphy.db` and a default Workspace when none exists. For a fixed library location, use `ralphy --root /absolute/path/to/library setup --non-interactive`. Retain the returned `data_root` and `workspace_id` and pass them explicitly on subsequent commands:

```bash
ralphy --root <data_root> --workspace <workspace_id> new "A coffee shop poster"
```

Re-running setup preserves existing Workspaces and discovers an existing library above the working directory. With several Workspaces it returns a null `workspace_id`; run `ralphy --root <data_root> workspace list` and select one explicitly.

Existing legacy data requires migration. Never delete it or substitute an empty store to bypass that error. `setup --status` is read-only. `setup --link` remains a compatibility option for source developers.

## Configure provider credentials privately

Never ask the user to paste keys into chat. Keys exported before the CLI starts are accepted for that process; a project's `.env` file is not a credential source.

For persistence, pipe a key from a hidden terminal prompt or an existing shell variable into the scoped encrypted store:

```bash
ralphy --root <data_root> --workspace <workspace_id> provider auth set openrouter --stdin
```

Use the user's own terminal. Never put a literal key in the command, shell history, source files, or tool logs. Repeat with `elevenlabs` for voice and music, and `fal` if required. Encrypted persistence uses macOS Keychain; where that store is unavailable, use keys exported in the parent shell. `setup --keys-from-env` and credential values in setup arguments are deprecated and refused.

Workspace credentials are not inherited by Projects. After `new`, retain its immutable `id` (`prj_...`). For Project generation and auth, use `ralphy --root <data_root> --project <project_id> <command>` with the scope flags before the verb, and do not also pass `--workspace`. Check or store credentials in that same Project scope. Inherited shell credentials are available to both scopes.

Setup never saves or replaces credential values and never launches a preview server.

## Verify

```bash
ralphy --root <data_root> --workspace <workspace_id> provider auth status openrouter
ralphy --root <data_root> --workspace <workspace_id> provider list
ralphy --root <data_root> --workspace <workspace_id> doctor
```

Report which providers are configured. Configuration status does not prove API acceptance or successful generation. No paid generation is part of installation. Continue with the requested content workflow using the explicit root and Workspace; explain any missing provider the workflow requires.

GitHub Releases, Homebrew, and npm distribute the same CLI version.
