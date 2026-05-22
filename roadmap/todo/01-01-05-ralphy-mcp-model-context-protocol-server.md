---
id: 01.01.05
status: todo
v1_0: no
category: 01-cli
topic: "01.01 Front-stage verbs"
title: "ralphy mcp — Model Context Protocol server"
---

# 01.01.05 — `ralphy mcp` — Model Context Protocol server

**v1.0:** no — deferred per [D-03](../01-cli/OPEN-QUESTIONS.md#decision-log). Tracked under `01.11.05` as the canonical post-launch home; SSE transport stays under `01.11.02`.

**Acceptance criteria:** (post-launch)
- `ralphy mcp` (default stdio transport) exposes every front-stage verb as an MCP tool (`ralphy_trend`, `ralphy_clone`, `ralphy_iterate`, `ralphy_render`, plus `ralphy_status` for ambient state). `ralphy_make` is intentionally absent (see [D-01](../01-cli/OPEN-QUESTIONS.md#decision-log)).
- Passes `claude mcp add ralphy "ralphy mcp"` smoke test — Claude Code lists and invokes the tools.
- `--transport sse --port <p>` is wired but documented as post-launch follow-up (`01.11.02`).
- Tool schemas are auto-derived from each verb's TypeScript flag definitions (no hand-maintained duplicates).

**Notes:** new module `cli/lib/mcp/server.ts`. Uses `@modelcontextprotocol/sdk`. v1.0 substitute: agents invoke Ralphy via the CLI's JSON output contract (per [D-02](../01-cli/OPEN-QUESTIONS.md#decision-log)); the routing in `AGENTS.md` directs them to the right verbs without an MCP server.
