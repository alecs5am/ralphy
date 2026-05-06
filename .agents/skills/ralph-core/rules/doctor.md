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
- Session start (proactive — но только в ответ на работу, не unsolicited).
- `setup` wizard как source of truth.
- CI / automation.
- Whenever user says "что-то не работает" — first thing.

## NO auto-launch

`/ralph-core` v2 **НЕ запускает** Remotion Studio, dashboard, или любые background processes. AGENTS invariant.

Поведение `session-bootstrap`:
1. Run `ralphy doctor`.
2. Если blockers — walk пользователя через fix каждого (set keys, install ffmpeg, link project).
3. Когда clean — say "ready" и стоп.

Если user явно просит preview / Studio:
> "Запусти `bun run dev` foreground в отдельном окне. Studio откроется на http://localhost:3000."

Я не запускаю это сам.

## Fresh-machine setup

User starting from zero, ошибки missing deps / missing keys. **Tone:** user может не быть developer'ом. Один step per message. Wait for confirm.

### Step 0 — Where are we
```bash
pwd && ls package.json CLAUDE.md MODELS.md AGENTS.md 2>/dev/null
```
Expect все 4 файла. Иначе ask user `cd` в repo root.

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

### Step 4 — Two keys в .env
```bash
ls .env 2>/dev/null && echo "exists" || echo "missing"
```

Если missing — create:
```bash
ralphy setup
```

Setup wizard prompt'ит **только** для `OPENROUTER_API_KEY` + `ELEVENLABS_API_KEY` (см. AGENTS invariant). Каждый ping'ается через API verify.

#### 4a. OPENROUTER_API_KEY
1. https://openrouter.ai/keys → Create.
2. Wizard сохранит + ping'нёт `https://openrouter.ai/api/v1/auth/key`.

#### 4b. ELEVENLABS_API_KEY
1. https://elevenlabs.io/app/settings/api-keys → Create.
2. Wizard ping'нёт `/v1/user`.

Если у user'а уже есть `FAL_KEY` / `VERCEL_AI_GATEWAY_KEY` / `OPENAI_API_KEY` в `.env` — leave them. Setup wizard не trogs them. Они unused в v2 но не ломают ничего.

### Step 5 — Smoke
```bash
ralphy doctor
```
Должен вернуть `blockers: []`.

### Step 6 — Optional starter profile
```bash
ralphy profile import ralphy-showcase
```
Additive — pulls references and example projects from a real workspace. The repo's `templates/` already ships the canonical pack (soviet-nostalgic, ai-vegetables, talking-head-rant, before-after-product, talking-character) — no profile import needed for those.

> "Pulled starter pack: N references, M example projects.
> Try 'сделай мне видос про овощи' для cold-start template flow."

### Step 7 — Done
2-3 concrete first actions:
- "Сделай ии-овощи про <topic>" (template flow)
- "Сделай talking-head про <X>" (template flow)
- "Возьми стиль с <url> для <бренда>" (research → scenarist flow)

## Common setup issues

| Symptom | Cause | Fix |
|---|---|---|
| `ralphy: command not found` | binary not in PATH | `export PATH="$HOME/.local/bin:$PATH"` |
| `Cannot find module` | bun install не run | `bun install` |
| `ffmpeg: command not found` | step 3 skip | `brew install ffmpeg` |
| `OPENROUTER_API_KEY is undefined` | .env not loaded | confirm `.env` в repo root |
| ping 401 на ElevenLabs | key copied с whitespace | regenerate key |
| ping 401 на OpenRouter | wrong scope или expired | regenerate key |

## Что НЕ делаем

- ❌ `bun run dev` или `bun run dashboard` в background.
- ❌ `claude mcp add fal-ai` — устаревшая инструкция, MCP teardown в Sprint 2.
- ❌ Set FAL_KEY / VERCEL_AI_GATEWAY_KEY — не нужны v2.
- ❌ Re-run setup wizard если он "silently hangs" — debug TTY (см. troubleshooting).
