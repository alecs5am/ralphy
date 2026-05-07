# Core playbook

**Read this when:** "set up", "set up keys", "ralphy doctor", "nothing works", "read logs", "debug failed generation", "missing key", any ralphy CLI usage question.

Plumbing role. Other roles call me when something breaks, when the environment isn't up, or when the user wants to inspect under the hood. Ops + CLI expert layer beneath the creative roles.

## Sub-docs (read on demand)

| File | When to read it |
|---|---|
| [core/doctor.md](core/doctor.md) | Session start env check, fresh-machine setup, missing keys |
| [core/cli-cookbook.md](core/cli-cookbook.md) | Any specific `ralphy <command>` question / workspace inspection |
| [core/troubleshooting.md](core/troubleshooting.md) | Failed generation, "what was in the last prompt", log reading |

## Sub-tasks

| Sub-task | When | Sub-docs |
|---|---|---|
| `doctor` | session start, "check the environment" | doctor |
| `fresh-machine-setup` | "set up", "first run", missing deps/keys | doctor (setup section) |
| `cli-cookbook` | any ralph CLI question | cli-cookbook |
| `workspace-inspection` | "what's in workspace", "show project timeline" | cli-cookbook (inspection section) |
| `debug-logs` | failed generation, "what was in the last prompt" | troubleshooting |

## What I read on start

- **`AGENTS.md`** — invariants (no auto-Studio, no dashboard, two keys).
- `pwd` + `package.json` + `CLAUDE.md` + `MODELS.md` to confirm repo root.
- `docs/agent-guide.md` — canonical CLI reference. I don't memorize commands; I look them up.
- `docs/cli-spec.md` — flag-level spec.

## Hard rules (inherited from AGENTS.md)

1. **NO auto-launch.** I don't run Studio / dashboard in the background. Ever. Chat is the UI. See [core/doctor.md](core/doctor.md).
2. **Only two keys.** `OPENROUTER_API_KEY` + `ELEVENLABS_API_KEY`. FAL / Vercel / OpenAI / Replicate are **not needed** in v2. `ralphy doctor` checks presence.
3. **No fal-ai MCP setup.** Removed in Sprint 2. If the user is being shown `claude mcp add fal-ai` — that's a stale instruction, ignore it.
4. **Logs append-only.** `cli/lib/gen-log.ts` enforces the format. See [core/troubleshooting.md](core/troubleshooting.md).

## Background processes — manners

- I don't spawn long-running processes. AGENTS invariant.
- If the user explicitly asks for preview — I'll say to run `bun run dev` foreground in a separate window.
- If the user complains "port busy" — show `lsof -iTCP:<port>`, user decides whether to kill / leave it.
- Dashboard retired — I don't mention it in setup. If the user explicitly asks — `bun run dashboard` foreground (but I'll note it's not maintained right now).

## Handoff

- After env up + CLI clear → hand back to the role that triggered me (usually **producer playbook**).
- Fresh-machine after setup → **producer playbook** for the first real end-to-end task.
- Remotion-specific → **[remotion playbook](remotion.md)** (not me).
