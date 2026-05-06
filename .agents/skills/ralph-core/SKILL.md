---
name: ralph-core
description: Plumbing role — ralph CLI cookbook, workspace inspection, debug logs, env doctor, fresh-machine setup. NO auto-launch of Studio/dashboard in v2. Invoke when user says "set up", "ralphy doctor", "что не работает", "read logs", или любой ralph CLI вопрос.
triggers:
  - "set up"
  - "set up keys"
  - "ralphy doctor"
  - "что не работает"
  - "nothing works"
  - "read logs"
  - "debug failed generation"
  - "missing key"
  - any ralphy CLI usage question
metadata:
  tags: cli, setup, onboarding, debugging, logs, workspace, doctor
---

# Core

Plumbing role. Other roles call me когда что-то ломается, когда environment не up, или когда user хочет inspect под капотом. Ops + CLI expert layer под creative ролями.

## Sub-tasks

| Sub-task | When | Rules |
|---|---|---|
| `doctor` | session start, "проверь окружение" | `rules/doctor.md` |
| `fresh-machine-setup` | "set up", "first run", missing deps/keys | `rules/doctor.md` (setup section) |
| `cli-cookbook` | любой ralph CLI вопрос | `rules/cli-cookbook.md` |
| `workspace-inspection` | "что в workspace", "show project timeline" | `rules/cli-cookbook.md` (inspection section) |
| `debug-logs` | failed generation, "что было в последнем prompt'е" | `rules/troubleshooting.md` |

## What I read on start

- **`AGENTS.md`** — invariants (no auto-Studio, no dashboard, two keys).
- `pwd` + `package.json` + `CLAUDE.md` + `MODELS.md` для confirm repo root.
- `docs/agent-guide.md` — canonical CLI reference. Не запоминаю команды; смотрю.
- `docs/cli-spec.md` — flag-level spec.

## Hard rules (inherited from AGENTS.md)

1. **NO auto-launch.** Не запускаю Studio / dashboard в фоне. Никогда. Chat — UI. См. `rules/doctor.md`.
2. **Only two keys.** `OPENROUTER_API_KEY` + `ELEVENLABS_API_KEY`. FAL / Vercel / OpenAI / Replicate **не нужны** в v2. `ralphy doctor` проверит наличие.
3. **No fal-ai MCP setup.** Removed в Sprint 2. Если user'у показывают `claude mcp add fal-ai` — это устаревшая инструкция, игнорируй.
4. **Logs append-only.** `cli/lib/gen-log.ts` enforce'ит формат. См. `rules/troubleshooting.md`.

## Background processes — manners

- Не spawn'аю long-running processes. AGENTS invariant.
- Если user явно просит preview — скажу `bun run dev` foreground в отдельном окне.
- Если user complain'ит "port busy" — `lsof -iTCP:<port>` показать, user решит kill / leave.
- Dashboard retired — не упоминаю в setup. Если user явно спросит — `bun run dashboard` foreground (но скажу что not maintained сейчас).

## Handoff

- После env up + CLI clear → handback role'у которая trigger'ила (обычно `/ralph-producer`).
- Fresh-machine после setup → **`/ralph-producer`** для first real task end-to-end.
- Remotion-specific → **`/remotion-best-practices`** (не я).
