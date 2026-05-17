# 01 — CLI — SPEC

> **Vision.** `ralphy` feels like a single coherent tool from the first verb to the hundredth. Humans navigate via `--help` + sensible defaults; AI agents drive via stable JSON + NDJSON streams. The landing copy matches working CLI examples 1:1.

## Scope

**In:**

- Front-stage verb implementation (`trend`, `clone`, `make`, `iterate`, `mcp`, `skill install`).
- Output contract normalization across all 27+ verbs (JSON default, `-p`, NDJSON for streams, stable error shape).
- Help-text depth (per-verb examples, model-aware flag whitelists).
- Setup / status / doctor lifecycle.
- Common flag vocabulary and exit-code catalog.
- MCP server stdio v1.

**Not in (cross-references):**

- New model providers → [`05`](../05-project-resources/).
- The skill bundle contents → [`03`](../03-skills/).
- Telemetry collection → [`10`](../10-cost-and-telemetry/).
- Install scripts, brew, npm wrapper → [`09`](../09-distribution-and-release/).
- Mintlify documentation pages for verbs → [`07`](../07-socials-and-docs/).

---

## 01.01 Front-stage verbs

The six verbs spec'd in [`docs/cli-ux-vision.md`](../../docs/cli-ux-vision.md) but not implemented. Each is a thin wrapper over existing primitives; no new providers or recipes.

### 01.01.01 `ralphy make` — brief → mp4 in one verb  [ ]
**v1.0:** yes

**Acceptance criteria:**
- `ralphy make "<one-line brief>"` creates a project, runs research (if a ref is supplied), generates assets, and renders an mp4. Exits 0 on success with `{ project_id, render_path, cost_usd, duration_s }` JSON.
- Accepts `--style <slug>`, `--ref <list>`, `--batch <n>`, `--budget <usd>`, `--dry-run`.
- `--dry-run` returns the resolved plan (template, scene count, estimated cost, models picked) without API calls.
- Emits NDJSON events: `plan-locked`, `prompts-locked`, `scene:N:start`, `scene:N:done`, `render-start`, `done` — matches the event names listed in `cli-ux-vision.md`.
- When `--batch n > 1`, spawns N parallel projects with shared template/style, respects ElevenLabs concurrency cap 3 (see [`docs/perf-targets.md`](../../docs/perf-targets.md)).
- Honors the reference-required gate from `AGENTS.md` invariant #3 — refuses when a named real entity is in the brief without a `--ref`.

**Notes:** routes to existing `project create` → `art-director` flow → `editor` flow → `render`. Implementation lives in `cli/commands/make.ts` (new); orchestration shared with `producer` playbook.

### 01.01.02 `ralphy trend` — niche / handle scanner  [ ]
**v1.0:** yes

**Acceptance criteria:**
- `ralphy trend "@handle"` or `ralphy trend --niche "<text>"` returns top-N clips with `{ url, views, velocity, format, hook }` per clip.
- `--platforms tiktok,reels,shorts`, `--window 14d`, `--top 20`, `--save-refs` flags work.
- `--save-refs` runs `ref pull` + `ref blueprint` on each clip and registers them under a deterministic slug.
- Pretty output (`-p`) shows a ranked table.
- Refuses gracefully when no auth / no API access — points the user at the right open question or stub.

**Notes:** wraps `research scrape-trends`; needs niche/handle filtering added to the back-stage verb. Open question Q-03.

### 01.01.03 `ralphy clone <url-or-ref>` — style lifter  [ ]
**v1.0:** yes

**Acceptance criteria:**
- `ralphy clone <tiktok-or-reels-url>` runs the full chain: `ref pull` → `ref analyze` → `ref blueprint` → `template create` and outputs the new template slug.
- Accepts already-registered ref slug as input — skips the pull step.
- `--strict-look` mirrors palette + grading + hook; `--prompt-only` skips music/voice extraction.
- `--as-template <id>` lets the user name the output; default is derived from source.
- Exits with `{ template_id, source_url, blueprint_path }` JSON.

**Notes:** thin wrapper over four existing back-stage verbs.

### 01.01.04 `ralphy iterate <project-id-or-campaign>` — analytics-driven remix  [ ]
**v1.0:** stretch

**Acceptance criteria:**
- `ralphy iterate <project-id> --source <csv-or-api>` reads view/CTR/watch-time data, ranks variants, archives losers (per `--retire <expr>`), and queues `--remix <n>` new variants from winners.
- CSV path works for v1.0. TikTok Business API / Meta API are stretch (post-launch).
- Outputs `{ retired: [...], remixed: [...], next_actions: [...] }`.

**Notes:** new module `cli/lib/iterate/`. Marked stretch because the loop is post-launch nice-to-have, but the verb shape and CSV reader should land for v1.0 to lock the contract.

### 01.01.05 `ralphy mcp` — Model Context Protocol server  [ ]
**v1.0:** yes

**Acceptance criteria:**
- `ralphy mcp` (default stdio transport) exposes every front-stage verb as an MCP tool (`ralphy_make`, `ralphy_trend`, `ralphy_clone`, `ralphy_iterate`, plus `ralphy_status` for ambient state).
- Passes `claude mcp add ralphy "ralphy mcp"` smoke test — Claude Code lists and invokes the tools.
- `--transport sse --port <p>` is wired but documented as v1.0 stretch.
- Tool schemas are auto-derived from each verb's TypeScript flag definitions (no hand-maintained duplicates).

**Notes:** new module `cli/lib/mcp/server.ts`. Uses `@modelcontextprotocol/sdk`. Reviewed against Q-02 (stdio vs. SSE scope).

### 01.01.06 `ralphy skill install` — drop skill bundle into chosen agent  [ ]
**v1.0:** yes

**Acceptance criteria:**
- `ralphy skill install` auto-detects installed agents (`~/.claude/`, `~/.cursor/`, `~/.codex/` or `AGENTS.md`) and installs the bundle into each user-scope skills dir.
- `--agent <id>` forces a specific agent; `--scope user|project` controls target; `--symlink` (default) vs. `--copy`.
- For Cursor / Codex (no native skills dir), creates a normalized adapter file (rules / `AGENTS.md` pointer) — adapter behavior documented per agent.
- Idempotent: re-running upgrades the link/copy without dupes.
- Uninstall: `ralphy skill uninstall [--agent <id>]`.

**Notes:** new module `cli/lib/skill/installer.ts`. Bundle contents owned by [`03 — Skills`](../03-skills/). Reviewed against Q-04 (cross-agent skill layout).

---

## 01.02 Output contract uniformity

Every verb behaves predictably for both humans and machines. The contract is documented in [`docs/cli-spec.md`](../../docs/cli-spec.md); this topic enforces it across the surface.

### 01.02.01 JSON-default stdout for every verb  [~]
**v1.0:** yes

**Acceptance criteria:**
- Every verb emits a single JSON object to stdout on success, even non-data verbs like `setup` (returns a summary).
- Schema is documented in `docs/cli-spec.md` per verb.
- `--json` flag is a no-op (already the default) — kept for explicitness in scripts.
- Audit: `bun run cli-audit-output` (new script in `scripts/`) parses every verb's stdout in a sample run and fails if any returns non-JSON without an explicit text-mode flag.

**Notes:** ~70% complete today; gaps are in `audio`, `video` (ffmpeg recipes — currently print human strings), `assets pull`, and `example pull`.

### 01.02.02 `-p` / `--pretty` for human-readable output  [~]
**v1.0:** yes

**Acceptance criteria:**
- Every verb supports `-p` / `--pretty` and produces colored, readable output (tables / panels / progress bars).
- Pretty output is documented as **never machine-parseable** — agents must use the default JSON.
- When stdout is a TTY *and* no `--json` is set, the verb may opt into pretty by default (a small handful — `doctor`, `status`, `models list`) — but documented per verb.

**Notes:** partial today; some verbs default to pretty on TTY, others always JSON. Need an audit + reconciliation pass.

### 01.02.03 NDJSON event stream for long-running verbs  [ ]
**v1.0:** yes

**Acceptance criteria:**
- Long-running verbs (`make`, `iterate`, `render`, `batch run`, `generate video`, `generate music`, `assets pull`) emit NDJSON events on stdout while running, with the final summary as the last line.
- Every event line is a complete JSON object with at minimum `{ ts, kind, ... }`.
- `--quiet` suppresses all events except the final summary.
- Event kinds per verb are documented in `docs/cli-spec.md`.

**Notes:** today only `render` emits structured progress. The rest print human strings or nothing.

### 01.02.04 Stable error shape on stderr  [ ]
**v1.0:** yes

**Acceptance criteria:**
- Every error exits non-zero and writes `{ error: { code, message, hint? } }` to stderr as a single JSON object.
- `code` values come from a closed catalog (see `01.06.01`).
- `hint` is a short, actionable sentence — never an apology or restatement of `message`.
- Crashes inside a verb (uncaught exceptions) still produce the structured error — wrapper catches at the command boundary.

### 01.02.05 `--dry-run` semantics standardized  [~]
**v1.0:** yes

**Acceptance criteria:**
- `--dry-run` exists on every verb that calls a paid API or mutates non-log workspace state.
- Output for `--dry-run` is JSON with at minimum `{ would_call: [...], cost_estimate_usd, would_write: [...] }`.
- Exit 0 if the dry-run "would have worked"; non-zero with the same error shape if validation would fail.
- Test: every verb with `--dry-run` proves it does not make a paid API call (parsed from `generations.jsonl` after run — must be empty for the project).

**Notes:** today `generate video` has it; `generate image`, `generate voiceover`, `generate music`, `make`, `iterate`, `render`, `batch run` do not.

---

## 01.03 Help system depth

Help is the agent's API documentation and the human's first reference. It has to be deep enough to act on without round-tripping to source.

### 01.03.01 `--help` walker shows full nested help  [x]
**v1.0:** yes

**Acceptance criteria:**
- `ralphy <resource> --help` lists actions; `ralphy <resource> <action> --help` lists flags. Walker handles arbitrary depth.
- Already implemented in commit `7241f37`.

**Notes:** landed. Keep an eye on regressions when adding new verbs.

### 01.03.02 Every front-stage verb's `--help` ends with an `Examples` block  [ ]
**v1.0:** yes

**Acceptance criteria:**
- Each of `make`, `trend`, `clone`, `iterate`, `mcp`, `skill install` has at least 3 examples in `--help`.
- Examples are **byte-identical** to a corresponding string in `landing/components/**` (grep test enforced in CI).
- Each example is runnable as-is on a freshly-set-up machine — no implicit dependencies on prior state.

**Notes:** the grep test is the enforcement; soft promises rot.

### 01.03.03 `generate video --help` shows per-model flag whitelists  [ ]
**v1.0:** yes

**Acceptance criteria:**
- When a user runs `ralphy generate video --help`, the output includes the per-model `supported_durations`, `supported_resolutions`, `supported_aspect_ratios`, `supported_frame_images` for each model in the registry, refreshed from the 24h-cached OpenRouter video catalog.
- Compact format: one table or grouped block per model.
- `--model <id>` filter: `ralphy generate video --help --model kwaivgi/kling-v3.0-pro` shows only that model's whitelist.

**Notes:** today the user has to run `ralphy models show <id>` separately. Inline it in `--help` so agents don't have to chain reads.

### 01.03.04 Cross-link to `MODELS.md` and `docs/agent-guide.md`  [ ]
**v1.0:** stretch

**Acceptance criteria:**
- Top-level `ralphy --help` footer references `MODELS.md` (for model selection) and `docs/agent-guide.md` (for the full spec).
- Resource-level `ralphy <resource> --help` footer references the relevant playbook in `docs/playbooks/`.

---

## 01.04 Setup, status, doctor

The onboarding loop and runtime health. A fresh machine must reach a green light without manual file edits.

### 01.04.01 `ralphy setup` non-interactive mode is bulletproof  [~]
**v1.0:** yes

**Acceptance criteria:**
- All flags from current help (`-y`, `--openrouter-key`, `--elevenlabs-key`, `--keys-from-env`, `--project-dir`, `--import-profile`, `--no-verify`, `--allow-unverified`) work in headless CI.
- Each invalid input produces a structured error with a `code` from the catalog.
- Output ends with a JSON summary: `{ keys_set: [...], project_dir, profile_imported, verification: "ok"|"skipped"|"failed" }`.

### 01.04.02 `ralphy setup` interactive wizard verifies each step  [~]
**v1.0:** yes

**Acceptance criteria:**
- TUI wizard validates each API key with a real call (cheap probe — image-list for OpenRouter, voice-list for ElevenLabs) before saving.
- On failure, shows the actual error and offers retry / skip / abort.
- Wizard never silently accepts an unverified key — `--allow-unverified` must be explicit.
- Ends with a `ralphy doctor` run inline.

### 01.04.03 `ralphy doctor` covers every required dep + key + project link  [~]
**v1.0:** yes

**Acceptance criteria:**
- Checks: `bun` present, `ffmpeg` present, `yt-dlp` present, `OPENROUTER_API_KEY` set + valid, `ELEVENLABS_API_KEY` set + valid, workspace dir writeable, project link present, asset cache reachable.
- Pretty output groups by category (env / keys / deps / project) with red/yellow/green per check.
- JSON output: `{ ok: bool, checks: [{ name, status, message, hint? }] }`.
- Exit 0 if all green, exit 1 if any red, exit 2 if any yellow only.
- Documented escape hatch for partial-config use cases.

### 01.04.04 `ralphy status` is the ambient-state summary  [~]
**v1.0:** yes

**Acceptance criteria:**
- Returns `{ project: { id, dir, last_activity_ts }, keys: { openrouter: bool, elevenlabs: bool }, daemon: { running, pid }, queue: { pending, in_flight } }`.
- Pretty mode highlights anomalies (no project linked, daemon down with jobs queued).
- Read-only — no side effects.

---

## 01.05 Common flag vocabulary

Reuse the same flag name + semantics everywhere it appears. Drift here breaks AI agents that learned the pattern.

### 01.05.01 `--project <id>` always identifies the target project  [~]
**v1.0:** yes

**Acceptance criteria:**
- Every verb that operates on a project accepts `--project <id>`.
- Same precedence everywhere: explicit `--project` > auto-detected from `cwd` > error.
- `--cwd <path>` is the auto-detection override; documented identically per verb.

### 01.05.02 `--slot <slug>` always identifies an asset slot  [~]
**v1.0:** yes

**Acceptance criteria:**
- Every `generate` subcommand and any verb that writes per-scene assets accepts `--slot`.
- Slot format `^[a-z0-9-]+$` enforced uniformly with the same error code.

### 01.05.03 `--quiet` suppresses progress + non-essential output  [ ]
**v1.0:** yes

**Acceptance criteria:**
- `--quiet` exists on every verb; only the final result (JSON object) goes to stdout, only errors go to stderr.
- Compatible with `-p` (pretty + quiet = colored final result, no spinners / streams).

### 01.05.04 `--cwd <path>` pins workspace root for every verb  [x]
**v1.0:** yes

**Acceptance criteria:**
- Already implemented.

---

## 01.06 Exit codes and error catalog

A closed set of error codes that AI agents can switch on. Hints are how the agent learns to recover.

### 01.06.01 Error code catalog committed and stable  [ ]
**v1.0:** yes

**Acceptance criteria:**
- `cli/lib/errors/catalog.ts` exports a typed enum of every `code` the CLI can emit; total < 30 distinct codes for v1.0.
- Each entry has `{ code, http_analog?, message_template, hint_template, related_docs }`.
- New errors must be added to the catalog before being thrown — tested by a `lint:errors` script that greps for thrown errors and verifies their code is in the catalog.
- `docs/cli-spec.md` includes the full catalog as a generated section.

### 01.06.02 Exit codes mapped to error code classes  [ ]
**v1.0:** yes

**Acceptance criteria:**
- `0` — success.
- `1` — generic runtime failure (an unmapped code; should approach zero occurrences by v1.0).
- `2` — user error (bad flag, missing file, invalid input).
- `3` — provider error (API down, rate limit, validation fail).
- `4` — environment error (missing dep, missing key).
- `5` — quality-gate refusal (score below threshold).
- Documented in `docs/cli-spec.md` and used consistently.

### 01.06.03 Hints point at the next concrete action  [ ]
**v1.0:** yes

**Acceptance criteria:**
- Every error's `hint` either names a verb to run, a file to edit, or a doc to read.
- No hint is a paraphrase of the message; reviewer pass before v1.0.

---

## 01.07 Streaming / progress (cross-cutting refinement)

This topic is the implementation backbone for `01.02.03` — broken out because it touches `cli/lib/` plumbing that several verbs share.

### 01.07.01 Shared NDJSON emitter in `cli/lib/`  [ ]
**v1.0:** yes

**Acceptance criteria:**
- Single emitter `cli/lib/stream/ndjson.ts` used by every long-running verb.
- Backpressure-safe (does not buffer unboundedly on slow stdout consumers).
- `--quiet` flag passed through suppresses all but the final event.
- Test: emits 10k events in <1s, never reorders.

### 01.07.02 Cancellation: SIGINT propagates cleanly  [ ]
**v1.0:** yes

**Acceptance criteria:**
- Ctrl-C during a long-running verb cancels in-flight API calls (where the provider supports it), emits a `cancelled` event, and exits 130.
- Partial state is preserved (append-only files honored) — no truncation.

---

## 01.09 Standalone operation & global config

The casual-user on-ramp. No repo clone, no `bun install`, no working-directory dependence.

### 01.09.01 `ralphy new "<brief>"` creates a project under `~/.ralphy/`  [ ]
**v1.0:** yes

**Acceptance criteria:**
- `ralphy new "<brief>"` (or `ralphy new --id <slug>` without brief) creates `~/.ralphy/projects/<id>/` with the canonical project shape (cross-link [`05.02`](../05-project-resources/SPEC.md)).
- No CWD dependence — the project lives in `~/.ralphy/projects/`, not in CWD.
- Output: `{ project_id, path, brief? }` JSON.
- Pretty mode prints "Project created at `~/.ralphy/projects/<id>` — `ralphy make` to continue".

### 01.09.02 Global config at `~/.ralphy/config.json` works from any directory  [ ]
**v1.0:** yes

**Acceptance criteria:**
- API keys (`openrouter`, `elevenlabs`), defaults (`default_template`, `budgets.*`), and `active_project_id` live in `~/.ralphy/config.json`.
- Every CLI invocation reads this file regardless of CWD.
- `ralphy config set <key> <value>` / `ralphy config get <key>` / `ralphy config list` manage it.
- API keys persisted with `0600` permissions; never logged.

### 01.09.03 Templates bundled in the binary, lazy-pulled if missing  [ ]
**v1.0:** yes

**Acceptance criteria:**
- The 42 built-in templates (`templates/`) are embedded in the binary at build time (markdown + yaml, ~5 MB).
- Custom templates (workspace overrides, user-authored) pull from the companion repo via `ralphy template install <slug>`.
- `ralphy template list` shows bundled + locally-installed templates with a `source: "bundled"|"installed"|"workspace"` field.
- A repo-clone install (developer mode) takes precedence over bundled on collision.

### 01.09.04 Remotion compositions bundled, materialized on render  [ ]
**v1.0:** yes

**Acceptance criteria:**
- `src/lib/` Remotion components are embedded in the binary as a tarball asset.
- On `ralphy render <id>`, the needed composition is materialized to `~/.ralphy/render-cache/<id>/` and Remotion runs against it.
- Cache is invalidated on `ralphy upgrade` (new version → new bundled compositions).
- A repo-clone install uses the on-disk `src/` directly (developer mode), detected via presence of `package.json`.

### 01.09.05 Agent-setup URL (`ralphy.dev/install.md`)  [ ]
**v1.0:** yes

**Acceptance criteria:**
- A stable URL `https://ralphy.dev/install.md` returns a clean markdown document with: install command (`brew install ralphy` / `curl install.sh | sh`), `ralphy setup` walkthrough, `ralphy new "<brief>"` first-project, link to skill install.
- AI agents that fetch this URL can execute every command in order and end at a green `ralphy doctor`.
- Tested with Claude Code, Cursor, ChatGPT, Gemini, Codex (manual run per release).
- Cross-link to documentation owners in [`07.02`](../07-socials-and-docs/SPEC.md).

### 01.09.06 Base skill auto-installed on `ralphy setup`  [ ]
**v1.0:** yes

**Acceptance criteria:**
- `ralphy setup` ends by detecting installed agents (Claude Code, Cursor, Copilot, Codex via `AGENTS.md` support) and offers to install the base skill bundle (cross-link [`03.02`](../03-skills/SPEC.md)).
- Default: yes, install. Opt-out via `--no-skill-install` or interactive "n".
- Idempotent — re-running setup re-uses the install.

### 01.09.07 `ralphy doctor` reports install mode  [ ]
**v1.0:** yes

**Acceptance criteria:**
- Doctor shows: `mode: "binary"|"developer"`, the resolved `~/.ralphy/` path, whether templates are bundled or repo-resolved, whether Remotion is bundled or repo-resolved.
- Helps users + agents understand the runtime environment in one read.

### 01.09.08 Migration from repo-clone workspace to standalone  [ ]
**v1.0:** stretch

**Acceptance criteria:**
- `ralphy workspace migrate-to-home` copies an existing repo-resident `workspace/` to `~/.ralphy/projects/` (additive).
- Idempotent; logs every move.

---

## 01.10 Single-file CLI surface enumeration

A reviewable inventory of every verb + flag, owned by this category but also surfaced in Mintlify (cross-link [`07.03`](../07-socials-and-docs/SPEC.md)).

### 01.10.01 `docs/cli-surface.md` lists every verb  [~]
**v1.0:** yes

**Acceptance criteria:**
- One document with: every verb (current + v1.0-planned), one-line description, full signature, status (`today`/`v1.0`/`post-v1.0`), category cross-ref.
- Organized by resource (`brand`, `persona`, `project`, …) and by front-stage verb (`make`, `trend`, `clone`, …).
- Regenerated from `cli/commands/` + roadmap SPECs by a script.
- Initial hand-curated version landed alongside this SPEC; auto-gen lands per [`07.03.01`](../07-socials-and-docs/SPEC.md).

### 01.10.02 Mintlify mirror page  [ ]
**v1.0:** yes

**Acceptance criteria:**
- `docs-mintlify/cli/surface.mdx` is generated from the same source and stays in sync.
- CI check fails if they diverge.

---

## 01.11 Post-launch (tracked here for visibility)

### 01.11.01 Shell completions (zsh / fish / bash)  [ ]
**v1.0:** no

**Acceptance criteria:**
- `ralphy completion <shell>` prints a completion script.
- `ralphy completion install <shell>` writes it into the user's rc file (or completion dir) idempotently.
- Completes verbs, resource names, project ids (from workspace registry), template slugs, model ids.

### 01.11.02 MCP SSE transport  [ ]
**v1.0:** no

**Acceptance criteria:**
- `ralphy mcp --transport sse --port <p>` serves the same tool registry over SSE.
- Auth: shared-secret header for v0; document the absence of OAuth.

### 01.11.03 `ralphy iterate` external analytics readers  [ ]
**v1.0:** no

**Acceptance criteria:**
- Adapters for TikTok Business API, Meta Insights API, YouTube Analytics API.
- Auth flow per adapter; tokens stored encrypted in `~/.ralphy/secrets/`.
