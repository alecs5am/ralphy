# Ralphy install playbook

**Read this when:** "install ralphy", "set this up from scratch", "fresh machine", "/ralphy-install", or when `which ralphy` returns nothing in a session that's about to use ralphy commands.

The very first playbook a new user hits. It gets the `ralphy` binary onto their machine, makes sure `bun` and `ffmpeg` are present (the few dependencies that the bundled binary doesn't ship), runs the interactive setup wizard for keys and profiles, and points ralphy at their checkout of `ugc-cli`.

After this playbook runs, the user can do `ralphy <anything>` from any directory. Then hand off to the [core playbook](core.md) for in-tree dev tasks.

## When to invoke me

- User says: "install ralphy", "set this up", "fresh machine", "nothing works", "/ralphy-install".
- `which ralphy` returns nothing.
- `ralphy status` errors with "Could not locate the ugc-cli project".

## Sub-tasks

### 1. `check-environment`

Run these once and report:

```bash
which bun || echo "MISSING: bun"
which ffmpeg || echo "MISSING: ffmpeg"
which ralphy || echo "MISSING: ralphy"
```

Decide the next step from the result:
- `bun` missing → run `curl -fsSL https://bun.sh/install | bash` (in current shell so the user keeps running). Source the shell rc afterward.
- `ffmpeg` missing → on macOS, `brew install ffmpeg`. On Linux, suggest the distro's package manager.
- `ralphy` missing → `install-ralphy`.

### 2. `install-ralphy`

Run the install script from the repo:

```bash
curl -fsSL https://raw.githubusercontent.com/aleksei-oleinik/ugc-cli/main/install.sh | sh
```

This:
- Detects OS / arch (darwin-arm64, darwin-x64, linux-x64, linux-arm64, windows-x64).
- Resolves the latest GitHub Release tag.
- Downloads the matching binary into `$HOME/.local/bin/ralphy`.
- Prints a PATH hint if `~/.local/bin` is not in `PATH`.

If the script reports "no published release" (the repo is fresh / private), fall back to:

```bash
git clone https://github.com/aleksei-oleinik/ugc-cli.git ~/code/ugc-cli
cd ~/code/ugc-cli
bun install
bun run build:bin -- --current
cp dist/binaries/ralphy-* ~/.local/bin/ralphy
chmod +x ~/.local/bin/ralphy
```

Confirm with `ralphy --version` and `which ralphy`.

### 3. `run-setup-wizard`

Once `ralphy` is in PATH:

```bash
ralphy setup
```

This is an interactive `@clack/prompts` wizard that:
- Auto-detects the project directory (walks up from cwd, then `~/.config/ralphy/config.json`, then `RALPHY_PROJECT_DIR`).
- Asks for the project path if it can't find one, and saves the link to the global config.
- Shows a status table of currently-set keys.
- Lets the user multi-select providers and prompts for each missing key, with a live API ping to verify.
- Offers to import any public profiles from `profiles/`.
- Optionally launches Remotion Studio + dashboard in the background.

The user drives the wizard interactively — don't try to run it non-interactively. If you need to script it (e.g. for CI), use the underlying flags: `ralphy setup --link <path>`, `ralphy setup --status`.

### 4. `verify`

After the wizard:

```bash
ralphy status -p
```

This prints which capabilities are enabled grouped by category. Report the result back to the user. If `image-fal`, `voiceover-elevenlabs`, and at least one `llm-*` are green, the core pipeline works.

Then suggest a concrete next step depending on what's enabled:
- All green → "Try `ralphy template list` to see what you can build."
- Missing keys → "Re-run `ralphy setup` to add the rest, or skip — degrades gracefully."

## Notes

- This playbook is non-destructive. The wizard never overwrites a key without asking, and `--overwrite` is required for profile imports that would replace files.
- For in-tree development on the project itself (running `bun run dev`, editing components, debugging the pipeline), hand off to [core playbook](core.md).
- The Vercel AI Gateway key (`VERCEL_AI_GATEWAY_KEY`) is the recommended LLM provider — one key unlocks Gemini, Claude, GPT, and embeddings via a unified gateway. OpenRouter and OpenAI are accepted fallbacks, picked automatically by `cli/lib/providers/llm.ts`.
- Why not a Homebrew tap yet: we ship via GitHub Releases first; brew tap comes later once the release cadence is stable.
