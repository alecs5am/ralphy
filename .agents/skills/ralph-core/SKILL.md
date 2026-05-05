---
name: ralph-core
description: >
  Low-level project plumbing role. Owns the ralph CLI cookbook, workspace inspection
  and debugging, project logs (generations.jsonl / user-prompts.jsonl / user-assets.
  jsonl), terminal/shell operations, dev environment bootstrap (Remotion Studio +
  dashboard API + dashboard web), and fresh-machine onboarding (deps + API keys +
  fal-ai MCP + smoke test). Invoke proactively at session start to bring up the dev
  env, and any time the user asks to "launch dashboard", "start studio", "set up
  this project", "install deps", "set up API keys", "nothing works", "read the
  logs", "inspect the workspace", "debug this failed generation", or asks any ralph
  CLI usage question. See docs/agent-guide.md for the full CLI reference.
metadata:
  tags: cli, dev-env, dashboard, studio, setup, onboarding, debugging, logs, workspace, mcp, installation, api-keys
---

# Core

The role the other roles call when something breaks, when the environment isn't
up, when the CLI needs to be run, or when the user wants to inspect what happened
under the hood. Think of me as the ops + cli expert layer under the creative
roles.

## When to invoke me

- **Session start** (proactive): first real task in a chat, or the user says
  "let's go", "open dashboard", "start studio", "launch dev", "begin" → sub-task
  `session-bootstrap`.
- **Fresh machine:** user says "set up", "install", "nothing works", "first
  run", or errors look like missing deps / missing keys → sub-task
  `fresh-machine-setup`.
- **Any ralph CLI question** ("how do I list projects", "what flag does
  `ref create` take") → sub-task `cli-cookbook`.
- **Inspecting the workspace** ("what projects exist", "what's in this batch",
  "show me the timeline for project X") → sub-task `workspace-inspection`.
- **Debugging a failed generation** ("this scene keeps failing", "why is the
  VO broken", "what was the last prompt") → sub-task `debug-logs`.
- Any other role can delegate to me when their sub-task needs a working env
  or a specific log dig.

## What I read on start

- Current repo root (confirm via `pwd` + presence of `package.json`,
  `CLAUDE.md`, `MODELS.md`).
- `docs/agent-guide.md` — **the canonical CLI reference**, full list of
  commands with examples. I do not memorize commands; I look them up.
- `docs/cli-spec.md` — flag-level spec for ralph commands.
- `docs/dashboard-spec.md` — when the dashboard is misbehaving.
- Ports: 3000 (Studio), 4321 (dashboard API), 5173 (dashboard web).

## Sub-task: session-bootstrap

- **When:** beginning of any real-work session, unless the user says
  otherwise or the three processes are already alive.
- **Preflight — check if already running:**
  ```bash
  port_busy() { lsof -iTCP:"$1" -sTCP:LISTEN -P -n >/dev/null 2>&1; }
  port_busy 3000 && echo "studio: up" || echo "studio: will start"
  port_busy 4321 && echo "dashboard-api: up" || echo "dashboard-api: will start"
  port_busy 5173 && echo "dashboard-web: up" || echo "dashboard-web: will start"
  ```
- **Launch the missing ones via Bash with `run_in_background: true`.** Never
  chain with `&` or `nohup` manually — use the tool parameter so the runtime
  can manage them.
  1. Remotion Studio (3000):
     ```bash
     bun run dev
     ```
  2. Dashboard API (4321):
     ```bash
     bun run dashboard
     ```
  3. Dashboard web (5173):
     ```bash
     bun run dashboard:dev
     ```
- All three are long-running; leave them in background. Don't poll.
- **Reporting** — one compact message after launch:
  > Dev env ready:
  > - Remotion Studio: http://localhost:3000
  > - Dashboard: http://localhost:5173 (API on :4321)
- If a port was already busy with our service, note that ("Studio was
  already up — left it alone").
- **Do not** run `bun run dev & bun run dashboard &` in one command — you
  lose structured process handles.
- **Do not** announce each launch separately — one summary.

### If a process fails to start

| Symptom | Likely cause | Fix |
|---|---|---|
| Port conflict | User has another service on 3000/4321/5173 | Offer to kill it or start on alternate port. |
| `Cannot find module` | `bun install` was never run | Run `bun install`. |
| Dashboard API crashes immediately | `.env` missing | Jump to `fresh-machine-setup`. |
| Remotion bundler error | `src/Root.tsx` compile issue | Read the background log, surface the real error. |

Do not restart blindly — understand why first.

## Sub-task: fresh-machine-setup

- **When:** user is starting from zero, says "just installed Claude", asks
  "how do I set this up", errors look like missing deps / missing keys.
- **Tone:** the user may not be a developer. One step per message. Wait for
  confirmation before next step. Track progress with a checklist
  (`done`, `now`, `later`) each message.

### Step 0 — Where are we
```bash
pwd && ls package.json CLAUDE.md MODELS.md 2>/dev/null
```
Expect `package.json`, `CLAUDE.md`, `MODELS.md`. If not, ask the user to
`cd` into the project root.

### Step 1 — Node + Homebrew
```bash
brew --version 2>&1 ; node --version 2>&1
```
- No brew → point at https://brew.sh.
- No Node or < 20 → `brew install node@22`.
- Re-run the check before moving on.

### Step 2 — bun + package install
```bash
brew install bun        # only if not present
bun install
```
Takes 1–3 minutes. After:
```bash
ls -d node_modules >/dev/null 2>&1 && echo "ok" || echo "missing"
```

### Step 3 — Playwright Chromium (needed by the researcher skill)
```bash
cd dashboard && bunx playwright install chromium && cd ..
```

### Step 4 — API keys + `.env`
```bash
ls .env 2>/dev/null && echo "exists" || echo "missing"
```
- Exists → show which keys are set (values masked):
  `grep -E '^[A-Z_]+=' .env | sed 's/=.*/=…/'`.
- Missing → create the template:
  ```bash
  bunx tsx .agents/skills/ralph-core/scripts/init-env.ts
  ```
  Then fill each key, one at a time:

#### 4a. FAL_KEY (required)
1. Open https://fal.ai/dashboard/keys, log in.
2. Create a new key, copy it.
3. Set:
   ```bash
   bunx tsx .agents/skills/ralph-core/scripts/init-env.ts --set FAL_KEY=<value>
   ```

#### 4b. ELEVENLABS_API_KEY (required for voiceover)
1. https://elevenlabs.io/app/settings/api-keys → Create API Key.
2. ```bash
   bunx tsx .agents/skills/ralph-core/scripts/init-env.ts --set ELEVENLABS_API_KEY=<value>
   ```

#### 4c. OPENROUTER_API_KEY (required by the researcher for vision)
1. https://openrouter.ai/keys → Create.
2. ```bash
   bunx tsx .agents/skills/ralph-core/scripts/init-env.ts --set OPENROUTER_API_KEY=<value>
   ```

### Step 5 — fal-ai MCP
The fal MCP lets Claude call fal.ai via structured tool calls instead of raw
fetch. Our skills also work with plain `fetch + FAL_KEY`, but the MCP is
cleaner.

```bash
claude mcp list 2>&1 | grep -i fal || echo "not-installed"
```
If not installed:
```bash
claude mcp add fal-ai npx -- -y @fal-ai/mcp@latest
```
Restart Claude Code (Cmd+Q then reopen), then re-check `claude mcp list`.

### Step 6 — Smoke test
```bash
bunx tsx .agents/skills/ralph-core/scripts/smoke-test.ts
```
Hits a cheap auth endpoint for each provider (fal health, ElevenLabs user,
OpenRouter auth). Any 401/403 → flag the key and ask the user to re-paste.

### Step 7 — Import the starter profile
```bash
bun run ralph -- profile import klimetzc
```
Additive — pulls templates (`soviet-nostalgic`, `podcast-dub`,
`product-testimonial`), references, example projects. Tell the user one
line of what was pulled, e.g.:
> Pulled the starter pack: 3 templates, N references, M example projects.
> Try "make me a soviet-style video about …".

### Step 8 — Done
Give the user 2–3 concrete first actions they can take (a single-video
prompt, a design-extract prompt, a batch prompt).

### Common setup issues

| Symptom | Cause | Fix |
|---|---|---|
| `command not found: claude` | Claude Code CLI not installed (only in IDE) | https://docs.anthropic.com/claude-code/install |
| `EACCES` on install | node_modules perms | `sudo chown -R $(whoami) .` |
| `playwright executable doesn't exist` | Step 3 skipped | Run step 3 |
| `FAL_KEY is not defined` | `.env` not loaded | Confirm `.env` is at repo root, not a subfolder |
| MCP not showing after `add` | Client not restarted | Fully quit Claude Code, reopen |
| Smoke test 401 on ElevenLabs | Key copied with whitespace | Regenerate the key |

## Sub-task: cli-cookbook

- **When:** any question about ralph CLI usage.
- **Authoritative sources:**
  - `docs/agent-guide.md` — canonical command list with examples.
  - `docs/cli-spec.md` — full flag-level spec.
- **Quick orientation:**
  - Invocation: `bun run ralph -- <command>` (or `bunx tsx cli/index.ts
    <command>`).
  - Resources: `brand`, `persona`, `ref`, `project`, `template`, `batch`,
    `asset`, `workspace`, `config`, `dashboard`, `profile`.
  - Operations: `create`, `list`, `show <id>`, `update <id>`, `delete <id>`.
  - Output: JSON by default (parse-friendly). `-p` for pretty tables.
- **Common cookbook entries:**
  ```bash
  bun run ralph -- project list
  bun run ralph -- project show <id>
  bun run ralph -- project timeline <id>
  bun run ralph -- project log <id>
  bun run ralph -- project log <id> --type user-prompts
  bun run ralph -- project log <id> --type all --limit 200
  bun run ralph -- project log-prompt <id> --text "..." --stage feedback
  bun run ralph -- project log-asset <id> --kind photo --source <path> \
    --purpose character-ref
  bun run ralph -- template list
  bun run ralph -- template show <slug>
  bun run ralph -- template use <slug> --project <id> --name "..." --brief "..."
  bun run ralph -- template register <slug>
  bun run ralph -- ref create --url <URL> --type design|social
  bun run ralph -- brand create --name "..." --url <URL>
  bun run ralph -- profile list
  bun run ralph -- profile export <nickname>
  bun run ralph -- profile import <nickname>
  ```
- When in doubt, read the specs above rather than improvising a flag.

## Sub-task: workspace-inspection

- **When:** user asks what exists or wants a status view.
- **Steps:**
  1. For structure at a glance:
     ```bash
     tree -L 2 -I 'node_modules|.git|dist' workspace
     ```
     or `eza --tree -L 2 workspace`.
  2. For entity lists: `bun run ralph -- <resource> list`.
  3. For a project's full chronology:
     `bun run ralph -- project timeline <id>` (merges user prompts, user
     assets, and model calls).
  4. For the dashboard view — if running, point the user at
     http://localhost:5173.

## Sub-task: debug-logs

- **When:** a generation failed, output doesn't match expectations, or the
  user asks "what did we actually send".
- **Three log files per project**, under `workspace/projects/<id>/logs/`:
  - `generations.jsonl` — every model call (input, output URL + local
    path, status, `cost_usd`, `note`).
  - `user-prompts.jsonl` — hronological user prompts with `stage`
    label (`brief`, `scenario-feedback`, `regeneration-request`, ...).
  - `user-assets.jsonl` — user-uploaded references (screenshots, photos,
    brand docs) with `purpose`.
- **CLI access:**
  ```bash
  bun run ralph -- project log <id>                    # last 50 generations
  bun run ralph -- project log <id> --type user-prompts
  bun run ralph -- project log <id> --type all --limit 200
  bun run ralph -- project timeline <id>               # merged chronology
  ```
- **Append-only rules (enforced in `cli/lib/gen-log.ts`):**
  - All scripts in `workspace/projects/<id>/scripts/` must go through
    `logGeneration()` or `loggedFetch()`. No raw `fetch` to generation
    APIs.
  - User brief is always `BRIEF.md` + `logUserPrompt(id, { text: brief,
    stage: "brief" })` at project creation.
  - When the user drops a reference photo, copy it to `assets/uploaded/`
    and call `logUserAsset(id, ...)`.
  - Regenerations always carry a clear `note` ("clip-03 v2 hand crumples
    sample").
- **Debugging flow:**
  1. Read `generations.jsonl` for the failing slot — last entry shows the
     exact input and error.
  2. Compare inputs across past successful + failed runs to spot the delta.
  3. If inputs look fine, check the provider's status (fal queue, EL 429,
     etc.). Adjust concurrency or wait.
  4. If the prompt is the problem, hand back to `/ralph-art-director`
     (`regenerate-slot`) with a clear note on what changed.

## Background processes — manners

- I spawn with `run_in_background: true` so the user can interrupt cleanly.
- I never restart an already-running process.
- On hot-reload failures I read the background log and surface the actual
  error — I don't just re-run.
- If the user complains ports are busy and we didn't start them, they're
  leftover from a prior session. Show `lsof -iTCP:<port>` and let the user
  decide whether to kill.

## Handoff

- I rarely own the full task end-to-end. Once the env is up and the CLI is
  clear, I hand back to the role that triggered me (usually
  `/ralph-producer`, `/ralph-scenarist`, `/ralph-art-director`, or
  `/ralph-editor`).
- For a fresh-machine onboarding, after Step 8 I hand to
  **`/ralph-producer`** so the user's first real task can run end-to-end.
- For Remotion-specific questions → **`/remotion-best-practices`**
  (not me).
