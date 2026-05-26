# Ralphy Desktop — embedded Claude Code chat

> **Status:** exploring (base scaffold landed under `desktop/`)
> **Filed:** 2026-05-27
> **Folder:** ideas

## Context

Surfaced in conversation 2026-05-27. Reference is pencil.dev: an Electron app with
an in-app Claude Code chat that operates on the open project, so edits show up live.
We want the same shape for Ralphy — a desktop window where the user chats with a
Claude Code agent that drives `ralphy` over `workspace/projects/<id>/`, and the
storyboard / assets / render panel updates as the agent works.

The user's prior chat tooling was OpenRouter + Vercel AI SDK (a hand-rolled
tool-loop). Claude Code is a different shape: an agent harness, not a chat-completion
loop. We do not rebuild the loop — we embed Claude Code itself.

## What

Electron app. Renderer is a brand-styled chat + project panel (BRAND_DESIGN.md, same
tokens as `landing/`). Main process drives a Claude Code agent pointed at a Ralphy
project dir, streams agent events to the renderer over IPC, and gates paid/destructive
tools behind a permission prompt. A file watcher on the project dir pushes live updates
to the project panel.

The agent reuses Ralphy's existing on-disk context for free: pointing it at
`workspace/projects/<id>/` (cwd) with project setting sources loads `AGENTS.md`,
`CLAUDE.md`, and `.claude/skills/` — the whole playbook router works unchanged.

## The auth / billing reality (decided constraint)

The user's literal ask — "burn the same 5h/weekly interactive limits as my terminal
Claude Code" — is **not achievable**. Anthropic routes ALL programmatic driving (the
`@anthropic-ai/claude-agent-sdk` package AND headless `claude -p`) to a **separate
monthly Agent SDK credit pool**, never the 5h/weekly interactive bucket. There is no
public way to present as interactive Claude Code.

What IS achievable, and meets the real requirement (no extra API key, no pay-per-token
surprise, covered by the existing subscription): drive the agent with the user's
**subscription OAuth login**, not an API key. The Agent SDK credit is included in the
plan — Pro $20/mo, Max 5x $100/mo, Max 20x $200/mo — dollar-denominated, no rollover.

Chosen integration: **spawn the user's locally-installed `claude` binary** in headless
stream-json mode (`claude -p --output-format stream-json --input-format stream-json
--verbose`) rather than the npm Agent SDK. Rationale: it is byte-for-byte the same
Claude Code the user runs in their terminal — same version, same `~/.claude` config,
same MCP servers, and **already logged in via their subscription**, so no token dance.
Both paths land in the SDK credit pool; spawning the local binary is the closest to
"exactly my Claude Code" and needs the least onboarding. The npm Agent SDK stays as a
fallback for machines without a local `claude` install (then `claude setup-token` →
`CLAUDE_CODE_OAUTH_TOKEN`).

Trap to avoid: if `ANTHROPIC_API_KEY` is set in the environment it **silently wins**
over the subscription OAuth and bills pay-per-token. The auth resolver must detect this
and warn, never set the key implicitly.

## Pricing — the two-bucket model (recorded for product decisions)

Since 2026-06-15 a Claude subscription is split into two independent wallets that
never share a balance:

| Bucket 1 — Interactive | Bucket 2 — Agent SDK credit |
|---|---|
| claude.ai chat, Claude Code in **terminal / IDE / desktop / web** | Agent SDK, headless `claude -p`, GitHub Actions — **this is what Ralphy Desktop hits** |
| Limit: rolling 5-hour window + weekly caps | Limit: dollar-denominated monthly credit (Max 20x → $200/mo) |
| Measured in tokens / requests | Ticks down in USD at published API rates; no rollover |

Worked scenario (Max 20x, $200 plan):

1. Half a day in **terminal** Claude Code → 50% of the 5-hour window, ~1M tokens.
   All of that is Bucket 1. The dollar Agent SDK credit is untouched.
2. Open Ralphy Desktop and chat → each turn spawns `claude -p`, which lands in
   **Bucket 2**. It drains the $200/mo dollar credit and does **not** raise the
   5-hour interactive limit.
3. Exhaustion is independent: hitting the 5h cap in the terminal does not stop
   Ralphy Desktop (different wallet), and exhausting the $200 SDK credit does not
   stop the terminal. Past the $200 credit, Ralphy Desktop stops unless the user
   has separately enabled pay-as-you-go overage (needs an API billing method).

Cost levers: the spike's first message cost ~$0.24 because `cwd` was the repo root
(full `AGENTS.md` + `CLAUDE.md` in the system prompt). Scope `cwd` to the project
dir and lean on prompt caching (warm within 5 min) to drop per-turn cost sharply.

Caveat: this split is recent policy; that headless `claude -p` under a subscription
maps to the SDK credit (not the 5h bucket) is per Anthropic docs — worth one
empirical check on a real account before promising it to users.

## Why it matters

A desktop surface is the difference between "a CLI for developers" and "a product a
marketer opens and uses." It also lets non-CLI users hit the whole Ralphy pipeline
through chat. Getting the billing story honest up front avoids shipping a "free with
your plan" promise that turns into surprise API charges.

## Notes

- Scaffold lives in `desktop/`. Renderer runs standalone in a browser (`bun run dev`)
  with a mock IPC so the design is checkable without Electron or a `claude` install.
- Open question: bundle the renderer with the existing Next `landing/` design system,
  or keep the lean copied-token CSS in `desktop/src/styles/`? Started with copied tokens
  to keep Electron free of Next.
- Open question: do we ship Ralphy Desktop as a separate distributable, or fold it into
  the `ralphy` install flow (`ralphy desktop`)? Likely separate at first.
- Permission UX: paid verbs (`ralphy generate`, `ralphy render`) must surface a
  confirm-with-cost modal in the renderer (canUseTool / stream-json `can_use_tool`).
- Promote to a `roadmap/` task once the integration spike (real `claude` spawn +
  stream parse + one live `ralphy` call) is proven end-to-end.
