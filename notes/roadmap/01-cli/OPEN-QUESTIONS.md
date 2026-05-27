# 01 — CLI — Open Questions & Decisions

## Open questions

### Q-01: `ralphy make` vs. `ralphy render` — relationship → D-01

### Q-02: MCP transport scope for v1.0 → D-03

### Q-03: Trend data source → D-04

### Q-04: Cross-agent skill install layout → D-05

### Q-05: `--dry-run` depth for multi-step verbs → D-06

### Q-06: Default verbosity on TTY → D-02

### Q-07: Error code stability across patch versions → D-07

---

## Decision log

### D-01: Drop `ralphy make`; keep `ralphy render` as the single mp4-emitting verb (2026-05-19)
**Was:** Q-01
**Decision:** No `ralphy make`. `render <project-id>` stays the one verb that produces an mp4. Going from a brief to a finished video is an agent + intake-playbook responsibility: the agent runs `project create`, then the art-director / editor chain, then `render`. The CLI never tries to be a "brief → mp4" one-shot.
**Why:** A separate `make` confuses both users and agents — there are now two ways to produce a video, with overlapping flags and unclear semantics. `render` is well-understood ("compose this project into mp4") and back-stage idempotency stays clean. The brief → project step is already covered by [`docs/playbooks/intake.md`](../../docs/playbooks/intake.md) (per-band depth) and `project create`, so collapsing them onto `render` doesn't lose capability.
**Consequences:**
- `01.01.01` (`ralphy make`) → cancelled, marked `[x] (cancelled — D-01)`.
- `01.01.05` MCP tool list drops `ralphy_make`; the front-stage MCP surface is `ralphy_trend`, `ralphy_clone`, `ralphy_iterate`, `ralphy_render`, `ralphy_status`.
- `01.02.03` NDJSON event list drops `make`; the long-running set is `iterate`, `render`, `batch run`, `generate video`, `generate music`, `assets pull`.
- `01.02.05` `--dry-run` coverage drops `make`.
- `01.03.02` `--help` examples list drops `make`.
- `docs/cli-ux-vision.md` "Front-stage verbs" section needs a follow-up edit to remove the `ralphy make` block; tracked as a doc-only follow-up (no new SPEC task).
- Landing copy that promises a "one verb to mp4" should be rephrased to "one agent flow to mp4" (tracked under category 07).

### D-07: Error codes are append-only after v1.0; renames forbidden (2026-05-19)
**Was:** Q-07
**Decision:** The error-code catalog from `01.06.01` becomes append-only at the v1.0 cut. Adding a new code is free; renaming an existing one is forbidden; removing a code is forbidden. Codes that become obsolete are marked `deprecated: true` in the catalog and continue to be emitted by the CLI for at least one major version, but documentation steers agents toward the new code. The CHANGELOG calls out each new code and each newly-deprecated code per release.
**Why:** Agents and scripts pattern-match on `error.code` as a public API surface — renaming silently breaks every downstream consumer (including our own playbooks). Versioned code sets (Option B) double the catalog and force agents to negotiate; free renaming (Option C) makes the structured-error contract not really a contract. Append-only is the cheapest discipline that keeps the contract intact.
**Consequences:**
- `01.06.01` acceptance criteria gain a "stability policy" bullet: codes are append-only post-v1.0; deprecations require a CHANGELOG entry naming the replacement code; the catalog file (`docs/error-codes.md`) is the source of truth.
- `01.06.02` (exit-code-to-class mapping) gets the same append-only rule — the class set is locked at v1.0.
- Pre-v1.0 (today, v0.x), renames are still allowed but each one needs a one-line CHANGELOG callout so the future v1.0 freeze starts from a clean baseline.

### D-06: `--dry-run` is full-plan by default; `--summary` collapses to per-stage totals (2026-05-19)
**Was:** Q-05
**Decision:** Multi-step verbs (`iterate`, `render`, `batch run`) emit a full unrolled plan in `--dry-run` mode by default — every model call resolved (model id, slot, prompt, estimated cost). Add `--summary` for a per-stage rollup that drops the per-call detail. Single-step verbs (`generate image`, `generate video`, `generate voiceover`, `generate music`) already produce a one-object plan and don't need `--summary`.
**Why:** An agent auditing a 20-scene batch needs the per-call view to catch silently-wrong slot bindings or duplicated prompts before a $20 burn; a human eyeballing the same plan gets value out of the rollup. Defaulting to the agent-useful view and offering an opt-in summary respects the "machine-friendly by default" pattern from `D-02` (TTY auto-detect already collapses obviously-long JSON visually).
**Consequences:**
- `01.02.05` acceptance criteria gain: `--dry-run` output JSON has shape `{ would_call: [...], cost_estimate_usd, would_write: [...] }` (full plan); `--summary` reduces `would_call` to `{ stage: { count, model_picks: {...}, est_usd } }` per stage and omits `would_write`.
- Single-step verbs may add `--summary` as a no-op accepted-but-ignored flag for shell-script consistency (cheap; avoids `unknown option` errors).
- Pretty rendering on TTY: full plan uses a per-stage collapsible table; `--summary` is a flat 5-7-line table.

### D-05: Per-agent skill-install adapter; v1.0 covers Claude / Cursor / Codex (2026-05-19)
**Was:** Q-04
**Decision:** `ralphy skill install` ships a per-agent adapter — each supported agent gets its native install path filled in. v1.0 priority list:
1. **Claude Code** — copies (default) or symlinks the skill bundle into `~/.claude/skills/<scope>/ralphy/` (user scope) or `./.claude/skills/ralphy/` (project scope). Also writes the routing pointer to `~/.claude/CLAUDE.md` or project `CLAUDE.md` (sentinel-bounded merge).
2. **Cursor** — writes `.cursor/rules/ralphy.mdc` with the playbook routing block + a one-line pointer to `<repo>/AGENTS.md`.
3. **Codex / generic** — drops or merges `AGENTS.md` at the repo root (Codex reads it natively; OpenAI Codex CLI and any "AGENTS.md-aware" agent benefit).

Every adapter, regardless of richness, also ensures the agent has a way to discover `<repo>/AGENTS.md` (either through native install or as a fallback pointer). Other agents (Continue, Aider, Cline, etc.) are post-launch — tracked under a new `01.11.04` post-launch entry, opened on demand.
**Why:** Claude is the primary target; Cursor + Codex cover the next two highest-share AI dev surfaces; pointing every other agent at `AGENTS.md` is a cheap fallback because we already treat `AGENTS.md` as the single source of routing truth. Hand-translating playbooks per agent (richer flavor of A) is real labor but scoped to a finite set; a universal-only stub (B) underuses Claude's native skills system.
**Consequences:**
- `01.01.06` acceptance updated: explicitly list Claude / Cursor / Codex as v1.0 must-have targets; explicitly defer Continue / Aider / Cline / Copilot rules / Windsurf to `01.11.04`.
- `01.01.06` `--agent <id>` allow-list: `claude`, `cursor`, `codex` for v1.0.
- A new task `01.11.04` lands in §01.11 (post-launch) tracking the wider adapter set.

### D-04: `ralphy trend` → post-launch; wait for external analytics adapters (2026-05-19)
**Was:** Q-03
**Decision:** `ralphy trend` does not ship in v1.0. The velocity signal needs real analytics (TikTok Business API, Meta API, or similar) — without it, the verb gives a misleading "trend score" derived from a single yt-dlp fetch. Better to delay than to ship a credibility-burning feature.
**Why:** A trend scanner with no genuine velocity is "search YouTube + show likes" — that's a worse version of a thing the user already has via the platform UI. Shipping a hollow `trend` would invite "this doesn't actually find trending content" reviews and waste docs / landing slots on a stub.
**Consequences:**
- `01.01.02` flipped from `v1.0: yes` to `v1.0: no`, with a pointer to `01.11.03` (`iterate external analytics readers`) — same adapter set unblocks both verbs.
- Landing copy / Hero should not promise `ralphy trend` in v1.0; revisit under category 07.
- The intake playbook's "URL drop" branch still works via existing `ref pull` / `ref analyze-video` chain (researcher role), which doesn't depend on velocity.

### D-03: `ralphy mcp` → post-launch; v1.0 ships without an MCP server (2026-05-19)
**Was:** Q-02
**Decision:** No `ralphy mcp` verb in v1.0. Agents drive Ralphy via the CLI surface (JSON output contract from `D-02`) plus the playbook routing in `AGENTS.md`. MCP server is deferred to a post-launch milestone alongside `01.11.02` (MCP SSE transport).
**Why:** The MCP server doubles the test surface (transport, schema generation, auth for SSE) and the CLI itself is already MCP-adjacent — agents that want tool-calling can invoke `ralphy <verb> --json` directly. Shipping MCP later, once the front-stage verb surface is locked, avoids re-spinning the MCP schemas every time a verb's flags drift.
**Consequences:**
- `01.01.05` flipped from `v1.0: yes` to `v1.0: no`. Acceptance criteria retained for the post-launch implementation.
- A new task `01.11.05` will track "MCP server (stdio)" as the canonical post-launch home; `01.11.02` stays as the SSE-transport-specific follow-up.
- No MCP-specific docs in the v1.0 Mintlify section; landing copy must not mention an MCP integration for v1.0.

### D-02: Pretty on TTY, JSON when piped or `--json`; universal (2026-05-19)
**Was:** Q-06
**Decision:** Auto-detect: when `process.stdout.isTTY` is true and no `--json` is set, every verb renders pretty (cli-table3 for arrays, colored key:value for objects, spinners for long ops). When stdout is piped, redirected, captured by an agent, or the user passes `--json`, every verb emits JSON. Applies to every verb — no closed "viewer" allow-list.
**Why:** Implemented in commits [`03ccf9a`](../../) (`cli: pretty UI rolled into legacy out()`) and [`bee7f59`](../../) (`cli: rich UI layer`). The auto-TTY route delivers a friendly first impression for humans without losing the machine contract — agents and pipes never allocate a TTY in practice, so the "agent gets pretty output by surprise" risk did not materialize across ~30 upgraded commands. A per-verb allow-list (Option C) would have left half the surface inconsistent.
**Consequences:**
- `01.02.01` (JSON-default stdout) acceptance reads: JSON is the default *off-TTY*; pretty is the default *on-TTY*; `--json` forces JSON unconditionally.
- `01.02.02` (`-p` / `--pretty`) flag stays as an explicit override (and a no-op on TTY) for users who want to force pretty inside a piped context.
- `01.06.x` error shape: pretty path uses `icons.fail + red message`; JSON path emits `{ error: { code, message, hint? } }`. Both already wired in [`cli/lib/output.ts`](../../cli/lib/output.ts) `err()`.

Format for entries:

```markdown
### D-NN: <title> (YYYY-MM-DD)
**Was:** Q-NN
**Decision:** <what we chose>
**Why:** <one or two reasons>
**Consequences:** <what SPEC tasks changed>
```
