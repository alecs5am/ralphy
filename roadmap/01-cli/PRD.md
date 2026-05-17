# 01 — CLI — PRD

## Problem

The `ralphy` CLI is the only entry point to model calls, ffmpeg recipes, yt-dlp pulls, and project mutations (see `AGENTS.md` invariant #2). Today's surface works, but four problems compound:

1. **The repo-clone install gate is a wall for casual users.** Today's working flow assumes the user clones the repo, runs `bun install`, and works inside the tree. A user who doesn't know what GitHub is — and that's a large share of the addressable audience for a UGC video tool — bounces here. The CLI needs to live as a standalone binary that creates and manages projects under `~/.ralphy/`, with the repo clone reduced to a contributor-only path.
2. **Landing-to-CLI gap.** [`landing/components/Hero.tsx`](../../landing/components/Hero.tsx) makes four headline promises (trend-watch, style-clone, one-prompt render, iterate-from-numbers). The CLI can do all four, but only through 4-5 chained back-stage verbs (`research scrape-trends`, `ref pull` → `ref analyze` → `ref blueprint`, etc.). A new user types what the landing says and hits "unknown command". This is documented in [`docs/cli-ux-vision.md`](../../docs/cli-ux-vision.md) but the front-stage verbs (`trend`, `clone`, `make`, `iterate`, `mcp`, `skill install`) are not implemented.
3. **Verb-shape drift.** 27 commands in [`cli/commands/`](../../cli/commands/) accumulated organically. Flag names, output schemas, exit codes, and `--dry-run` semantics differ between verbs. An AI agent that has parsed one verb's output cannot assume the next verb behaves the same way.
4. **Help is shallow in the wrong places.** `ralphy --help` lists everything; `ralphy generate video --help` lists the right flags but doesn't show per-model parameter whitelists (you have to run `ralphy models show <id>` separately). Agents and humans both stumble.

The CLI is not broken — it's *uneven*, and the surface assumes a developer-flavored user. The work in this category is to make it uniformly comfortable for casual humans, power users, and AI agents alike.

## Users

| User | What they need | How they interact |
|---|---|---|
| **Human developer** (the primary persona — power-user shipping their own UGC) | Discoverability, sensible defaults, pretty output when asked, fast feedback on cost and dry-runs | `ralphy <verb>` directly, mostly with `-p` |
| **AI agent** (Claude / Cursor / Codex driving the pipeline via `AGENTS.md` routing) | Parseable JSON contract, deterministic exit codes, schema stability, NDJSON streams for long-running ops, `--help` walkers that load full flag lists | Spawned subprocess with `stdout` parsing, no TTY |
| **First-time user** (just ran `brew install ralphy` or `curl install.sh \| sh`) | Working `setup` wizard, a `doctor` that explains exactly what is missing, examples that match what they read on the landing — **never has to clone the repo** | `ralphy setup`, `ralphy new`, `ralphy doctor` |
| **Casual non-developer** (doesn't know git, opens an AI chat to set everything up) | A documented setup URL their agent can fetch and act on: install → keys → first project → first render, all from one markdown spec | Agent fetches `ralphy.dev/install.md`, runs the commands |

The "AI agent" persona is co-equal with the "human developer" persona — not subordinate. Decisions that help one at the expense of the other need to be justified.

## User stories

1. As a **first-time user**, I run `brew install ralphy` (or `curl install.sh | sh`), then `ralphy setup`. The wizard collects only what's truly required, validates each input, and ends with a `doctor` green light. I never touch git, never clone anything. I then run `ralphy new "<brief>"` and a project is created under `~/.ralphy/projects/<id>/`.
2. As a **casual user who chats with an AI agent**, I paste a URL like `https://ralphy.dev/install.md` and say "set this up for me". The agent fetches the markdown, runs the install + setup + first-skill-install steps, and I'm ready to type briefs.
3. As a **first-time user post-setup**, I can type a verb from the landing in any directory and have it work — the global config in `~/.ralphy/config.json` carries my keys, defaults, and active project hint.
4. As a **human developer**, I forget a flag and run `ralphy generate video --help`. I see every flag, with defaults, per-model whitelists for the constraining flags, and three working examples — not a wall of unsorted options.
5. As a **human developer**, I want one verb that takes me from a one-line brief to a finished mp4. I should not need to chain `project create` → `research add` → `generate` → `render` by hand.
6. As an **AI agent**, I parse `ralphy <verb>` output as JSON without a `--json` flag. The schema for every verb is documented and stable across patch versions.
7. As an **AI agent**, I track a long-running render or batch via an NDJSON event stream on stdout. Each event line is a complete JSON object I can act on as it arrives.
8. As an **AI agent**, I run `ralphy <verb> --dry-run` and get a structured plan (resolved request body + cost estimate + assets it will write) without spending API credits.
9. As an **AI agent**, I encounter an error. I read `{ error: { code, message, hint? } }` from stderr, get a stable `code` to switch on, and a `hint` I can show the user.
10. As a **human developer**, I want commands I haven't used in two months to feel familiar. `--help` examples should match the landing copy. Common flags (`--project`, `--slot`, `-p`, `--dry-run`) should mean the same thing everywhere.
11. As a **power user**, I install Ralphy's skill bundle into Claude / Cursor / Codex with one command, so my agent of choice routes through the playbooks immediately. On a fresh `ralphy setup`, a base skill is installed automatically so any agent on the machine already knows Ralphy's verbs.
12. As an **agent**, I expose `ralphy` as an MCP server (`ralphy mcp`) so I can call verbs as tools without subprocess wrangling.

## Success metrics

| Metric | Target at v1.0 | How we measure |
|---|---|---|
| Time from `curl install.sh` to first `ralphy --help` working | ≤ 60s on a clean macOS / Linux box | Manual timing; encoded in `09 — Distribution` smoke test |
| Time from `ralphy setup` start to a green `ralphy doctor` | ≤ 5 min, ignoring API-key paste latency | Manual timing |
| Time from first idea to first finished mp4 | ≤ 15 min, single video | Stopwatch against the cold-start templates in [`docs/use-cases.md`](../../docs/use-cases.md); cross-ref with [`docs/perf-targets.md`](../../docs/perf-targets.md) |
| Front-stage verbs landed | All 6 (`trend`, `clone`, `make`, `iterate`, `mcp`, `skill install`) `[x]` | Status markers in `SPEC.md` |
| Verbs with a stable JSON schema (documented, validated by tests) | 100% of front-stage + 100% of `generate / render / models / doctor / status / setup / template / project` | Schema files committed under `docs/cli-spec.md` + smoke tests in `11 — Testing` |
| `--help` per verb shows working examples that match the landing copy 1:1 | 100% of front-stage verbs | Grep-test in CI: each landing example string appears verbatim in some `--help` output |
| Unique error `code` values surfaced | < 30 (a manageable switch table for agents) | Audit before v1.0 |
| Agents complete a 5-video batch end-to-end without filesystem hacks | yes / no | Manual run; covered by `producer` playbook smoke |

## Non-goals

- **TUI / interactive dashboard as the primary surface.** The dashboard is retired (see [`CLAUDE.md`](../../CLAUDE.md): "`dashboard/` — retired in v2"). Chat is the TUI. → owned by retired work, not this category.
- **Renaming existing back-stage verbs.** Adoption pain isn't worth the polish. New front-stage verbs are *additions*, never replacements. → enforced by `docs/cli-ux-vision.md` constraint.
- **New model providers or media APIs.** Provider work lives in [`05 — Project Resources`](../05-project-resources/) and [`MODELS.md`](../../MODELS.md), not in CLI shape.
- **Web-based dashboard / monitoring UI.** Out of scope for v1.0 entirely.
- **Authentication / multi-user.** Single local user; v1.0 has no account system.
- **Telemetry collection beyond what the user opts into.** Owned by [`10 — Cost & Telemetry`](../10-cost-and-telemetry/).
- **The skill bundle itself.** What lives inside `.agents/skills/` is owned by [`03 — Skills`](../03-skills/). This category only owns the *installer* verb (`ralphy skill install`).

## v1.0 cut

**Must ship for v1.0** (gates the launch):

- `01.01` — Front-stage verbs (all 6 from `cli-ux-vision.md`)
- `01.02` — Output contract uniformity (JSON default, `-p`, NDJSON for long-running, stable error shape)
- `01.03` — Help system depth (per-verb examples that match the landing, model-aware flag whitelists in `generate video`)
- `01.04` — Setup, status, doctor (onboarding loop is bulletproof on a clean machine)
- `01.05` — Common flag vocabulary (`--project`, `--slot`, `--dry-run`, `--cwd`, `--quiet` semantically identical everywhere)
- `01.06` — Exit codes and error catalog (stable codes, documented hints)
- `01.09` — Standalone operation (no repo clone required; projects under `~/.ralphy/`; global config; bundled assets; agent-setup URL)
- `01.10` — `docs/cli-surface.md` — single-file enumeration of every verb + flag for review/Mintlify

**Post-launch** (nice but not blocking):

- `01.07` — MCP server polish beyond stdio (SSE transport, hosted-agent integration)
- `01.08` — Shell completion (zsh / fish / bash)
- `01.09` — `ralphy iterate` analytics readers beyond local CSV (TikTok Business API, Meta API)
- `01.10` — Verb-level telemetry surfacing (would belong in `10` anyway)
