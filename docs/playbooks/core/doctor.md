# Doctor & setup

## ralphy doctor (default check)

```bash
ralphy doctor
```

Returns JSON:

```json
{
  "ralphy": { "installed": true, "version": "1.0.0", "linked_project": "/path/to/ugc-cli" },
  "deps": { "bun": true, "ffmpeg": true },
  "keys": { "openrouter": true, "elevenlabs": false },
  "blockers": ["ELEVENLABS_API_KEY missing — voiceover stage will fail"],
  "warnings": []
}
```

Use cases:
- Session start (proactive — but only in response to work, not unsolicited).
- `setup` wizard as source of truth.
- CI / automation.
- Whenever user says "something's not working" — first thing.

## NO auto-launch

`core playbook` v2 **does NOT launch** Remotion Studio, the dashboard, or any background processes. AGENTS invariant.

`session-bootstrap` behavior:
1. Run `ralphy doctor`.
2. If blockers — walk the user through fixing each (set keys, install ffmpeg, link project).
3. When clean — say "ready" and stop.

If the user explicitly asks for preview / Studio:
> "Run `bun run dev` in the foreground in a separate window. Studio will open at http://localhost:3000."

I don't run it myself.

## Fresh-machine setup

User starting from zero, errors about missing deps / missing keys. **Tone:** the user may not be a developer. One step per message. Wait for confirm.

### Step 0 — Where are we
```bash
pwd && ls package.json CLAUDE.md MODELS.md AGENTS.md 2>/dev/null
```
Expect all 4 files. Otherwise ask the user to `cd` into the repo root.

### Step 1 — Node + bun
```bash
brew --version 2>&1 ; node --version 2>&1 ; bun --version 2>&1
```
- No brew → https://brew.sh
- No Node ≥20 → `brew install node@22`
- No bun → `brew install bun`

### Step 2 — Package install
```bash
bun install
ls -d node_modules >/dev/null 2>&1 && echo "ok" || echo "missing"
```

### Step 3 — ffmpeg
```bash
ffmpeg -version 2>&1 | head -1
```
- Missing → `brew install ffmpeg`

### Step 4 — Two keys in .env
```bash
ls .env 2>/dev/null && echo "exists" || echo "missing"
```

If missing — create:
```bash
ralphy setup
```

The setup wizard prompts **only** for `OPENROUTER_API_KEY` + `ELEVENLABS_API_KEY` (see AGENTS invariant). Each is pinged via API to verify.

#### 4a. OPENROUTER_API_KEY
1. https://openrouter.ai/keys → Create.
2. Wizard saves it + pings `https://openrouter.ai/api/v1/auth/key`.

#### 4b. ELEVENLABS_API_KEY
1. https://elevenlabs.io/app/settings/api-keys → Create.
2. Wizard pings `/v1/user`.

If the user already has `FAL_KEY` / `VERCEL_AI_GATEWAY_KEY` / `OPENAI_API_KEY` in `.env` — leave them. The setup wizard doesn't touch them. They're unused in v2 but don't break anything.

### Step 5 — Smoke
```bash
ralphy doctor
```
Should return `blockers: []`.

### Step 6 — Optional starter profile
```bash
ralphy profile import ralphy-showcase
```
Additive — pulls references and example projects from a real workspace. The repo's `templates/` already ships the canonical pack (soviet-nostalgic, ai-vegetables, talking-head-rant, before-after-product, talking-character) — no profile import needed for those.

> "Pulled starter pack: N references, M example projects.
> Try 'make me a vegetable video' for the cold-start template flow."

### Step 7 — Done

2-3 concrete first actions:
- "Make AI vegetables about <topic>" (template flow)
- "Make a talking-head about <X>" (template flow)
- "Take the style from <url> for <brand>" (research → scenarist flow)

## Common setup issues

| Symptom | Cause | Fix |
|---|---|---|
| `ralphy: command not found` | binary not in PATH | `export PATH="$HOME/.local/bin:$PATH"` |
| `Cannot find module` | `bun install` not run | `bun install` |
| `ffmpeg: command not found` | step 3 skipped | `brew install ffmpeg` |
| `OPENROUTER_API_KEY is undefined` | .env not loaded | confirm `.env` is in repo root |
| ping 401 on ElevenLabs | key copied with whitespace | regenerate key |
| ping 401 on OpenRouter | wrong scope or expired | regenerate key |

## What we DON'T do

- ❌ `bun run dev` or `bun run dashboard` in the background.
- ❌ `claude mcp add fal-ai` — stale instruction, MCP teardown in Sprint 2.
- ❌ Set FAL_KEY / VERCEL_AI_GATEWAY_KEY — not needed in v2.
- ❌ Re-run the setup wizard if it "silently hangs" — debug TTY (see troubleshooting).
