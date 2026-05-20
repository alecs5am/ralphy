# 01 — CLI — SPEC

> **Vision.** `ralphy` feels like a single coherent tool from the first verb to the hundredth. Humans navigate via `--help` + sensible defaults; AI agents drive via stable JSON + NDJSON streams. The landing copy matches working CLI examples 1:1.

## Scope

**In:**

- Front-stage verb implementation (`trend`, `clone`, `iterate`, `mcp`, `skill install`). `ralphy make` was dropped per [D-01](OPEN-QUESTIONS.md#decision-log) — `render` stays the one mp4-producing verb; brief → project is the agent's job via [`intake.md`](../../docs/playbooks/intake.md).
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

### 01.01.01 `ralphy make` — brief → mp4 in one verb  [x] (cancelled — D-01)
**v1.0:** no

**Resolution (2026-05-19):** `ralphy make` was dropped per [D-01](OPEN-QUESTIONS.md#decision-log). The "brief → mp4" flow is now an agent responsibility: intake captures the brief, `project create` registers the project, the art-director / editor playbooks fill it, and `ralphy render <id>` produces the mp4. The `--batch` use case lands as part of `01.01.04` (`iterate`) and the producer playbook; the reference-required gate is enforced by the intake playbook + `01.04.x` invariants.

### 01.01.02 `ralphy trend` — niche / handle scanner  [ ]
**v1.0:** no — deferred per [D-04](OPEN-QUESTIONS.md#decision-log); blocked on `01.11.03` (external analytics readers).

**Acceptance criteria:** (post-launch)
- `ralphy trend "@handle"` or `ralphy trend --niche "<text>"` returns top-N clips with `{ url, views, velocity, format, hook }` per clip.
- `--platforms tiktok,reels,shorts`, `--window 14d`, `--top 20`, `--save-refs` flags work.
- `--save-refs` runs `ref pull` + `ref blueprint` on each clip and registers them under a deterministic slug.
- Pretty output (TTY-default per `01.02.01`) shows a ranked table.
- Refuses gracefully when no auth / no API access — points the user at the right open question or stub.
- Velocity is a real signal (analytics-API-backed), not a yt-dlp single-fetch placeholder.

**Notes:** wraps `research scrape-trends`; needs niche/handle filtering added to the back-stage verb. v1.0 substitute: users can still hand the agent a URL list and let the researcher playbook break each down via `ref pull` + `ref analyze-video`.

### 01.01.03 `ralphy clone <url-or-ref>` — style lifter  [x]
**v1.0:** yes

**Implementation:** [`cli/commands/clone.ts`](../../cli/commands/clone.ts), wraps `ref pull` → `ref frames` → `ref analyze` → (optional) `audio-describe` → `ref blueprint` → writes a vibe-style template under `workspace/templates/<id>/`. Exit JSON shape: `{ template_id, source_url, source_slug, blueprint_path, template_dir }`. Smoke tests: [`tests/integration/cli-clone.test.ts`](../../tests/integration/cli-clone.test.ts).

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
**v1.0:** no — deferred per [D-03](OPEN-QUESTIONS.md#decision-log). Tracked under `01.11.05` as the canonical post-launch home; SSE transport stays under `01.11.02`.

**Acceptance criteria:** (post-launch)
- `ralphy mcp` (default stdio transport) exposes every front-stage verb as an MCP tool (`ralphy_trend`, `ralphy_clone`, `ralphy_iterate`, `ralphy_render`, plus `ralphy_status` for ambient state). `ralphy_make` is intentionally absent (see [D-01](OPEN-QUESTIONS.md#decision-log)).
- Passes `claude mcp add ralphy "ralphy mcp"` smoke test — Claude Code lists and invokes the tools.
- `--transport sse --port <p>` is wired but documented as post-launch follow-up (`01.11.02`).
- Tool schemas are auto-derived from each verb's TypeScript flag definitions (no hand-maintained duplicates).

**Notes:** new module `cli/lib/mcp/server.ts`. Uses `@modelcontextprotocol/sdk`. v1.0 substitute: agents invoke Ralphy via the CLI's JSON output contract (per [D-02](OPEN-QUESTIONS.md#decision-log)); the routing in `AGENTS.md` directs them to the right verbs without an MCP server.

### 01.01.06 `ralphy skill install` — drop skill bundle into chosen agent  [x]
**v1.0:** yes — per [D-05](OPEN-QUESTIONS.md#decision-log) scope is Claude / Cursor / Codex. All other agents move to `01.11.04`.

**Implementation:** [`cli/lib/skill/installer.ts`](../../cli/lib/skill/installer.ts) (3 adapters + sentinel-bounded merge), [`cli/commands/skill.ts`](../../cli/commands/skill.ts) (CLI wrapper). Idempotent across re-runs (sentinel block content replaces, never duplicates). `--agent windsurf` returns `E_AGENT_UNSUPPORTED` with pointer to `01.11.04`. `uninstallSkill()` strips the sentinel block. Tests: [`tests/unit/skill-installer.test.ts`](../../tests/unit/skill-installer.test.ts) (12 unit), [`tests/integration/cli-skill.test.ts`](../../tests/integration/cli-skill.test.ts) (3 integration).

**Acceptance criteria:**
- `ralphy skill install` auto-detects installed agents and installs the bundle. v1.0 `--agent <id>` allow-list: `claude`, `cursor`, `codex` (any other value errors with `E_AGENT_UNSUPPORTED` + a pointer to `01.11.04`).
- **Claude adapter** — copies (default) or symlinks the bundle into `~/.claude/skills/ralphy/` (user scope) or `./.claude/skills/ralphy/` (project scope). Merges a Ralphy section into `~/.claude/CLAUDE.md` (user) or repo `CLAUDE.md` (project) inside `<!-- ralphy:start --> ... <!-- ralphy:end -->` sentinels so re-runs are idempotent.
- **Cursor adapter** — writes `.cursor/rules/ralphy.mdc` with the playbook routing block + one-line pointer to `<repo>/AGENTS.md` (sentinel-bounded; merge-safe).
- **Codex / generic adapter** — ensures `AGENTS.md` exists at the repo root (merges a Ralphy section under sentinels if a foreign `AGENTS.md` is present).
- `--scope user|project` controls Claude/Cursor target; Codex adapter is always project-scoped (`AGENTS.md` lives at repo root).
- `--symlink` (default for Claude when invoked from a repo checkout) vs. `--copy` (default for npm/brew binary installs without a source tree).
- Idempotent: re-running upgrades the link/copy without dupes; sentinel-bounded merges replace the inner content, never duplicate it.
- Uninstall: `ralphy skill uninstall [--agent <id>]` removes the link/copy + strips the sentinel block.

**Notes:** new module `cli/lib/skill/installer.ts`. Bundle contents owned by [`03 — Skills`](../03-skills/). Wider adapter set (Continue, Aider, Cline, GitHub Copilot rules, Windsurf, Zed) is tracked under `01.11.04`.

---

## 01.02 Output contract uniformity

Every verb behaves predictably for both humans and machines. The contract is documented in [`docs/cli-spec.md`](../../docs/cli-spec.md); this topic enforces it across the surface.

### 01.02.01 JSON-default stdout off-TTY; pretty-default on-TTY  [~]
**v1.0:** yes

**Acceptance criteria:**
- Every verb emits a single JSON object to stdout on success when `process.stdout.isTTY === false` (piped, redirected, or `--json` passed), even non-data verbs like `setup` (returns a summary).
- On TTY with no `--json`, every verb renders pretty (cli-table3 for arrays, colored key:value for objects, spinners for long ops) — universal, no per-verb allow-list. See [D-02](OPEN-QUESTIONS.md#decision-log).
- Schema is documented in `docs/cli-spec.md` per verb.
- `--json` forces JSON unconditionally (overrides TTY auto-detect — for users who want machine output inside an interactive shell).
- Audit: `bun run cli-audit-output` (new script in `scripts/`) parses every verb's stdout in a piped sample run and fails if any returns non-JSON without an explicit text-mode flag.

**Notes:** TTY-routing infrastructure landed in [`cli/lib/output.ts`](../../cli/lib/output.ts) + [`cli/lib/ui.ts`](../../cli/lib/ui.ts) (commits `bee7f59`, `03ccf9a`); remaining gaps are `audio`, `video` (ffmpeg recipes — currently print human strings), `assets pull`, and `example pull` — these still bypass `out()`.

### 01.02.02 `-p` / `--pretty` for human-readable output  [x]
**v1.0:** yes

**Acceptance criteria:**
- Every verb supports `-p` / `--pretty` and produces colored, readable output (tables / panels / progress bars).
- Pretty output is documented as **never machine-parseable** — agents must use `--json` or pipe to capture JSON.
- On TTY without `--json`, every verb defaults to pretty per [D-02](OPEN-QUESTIONS.md#decision-log). `-p` is a no-op on TTY and a force-pretty override when piped (rare, e.g. `ralphy status -p | tee status.txt`).

**Notes:** landed via commits `bee7f59` + `03ccf9a`. Spot-check passes for `out()`-based commands; the four ffmpeg-recipe commands listed in `01.02.01` notes are the remaining bypass and roll up under that task.

### 01.02.03 NDJSON event stream for long-running verbs  [x]
**v1.0:** yes

**Implementation:** [`cli/lib/stream/command.ts`](../../cli/lib/stream/command.ts) — `CommandStream` wraps `NdjsonEmitter` and routes by mode (NDJSON off-TTY / --json, single-summary on TTY). Wired into `render`, `generate video`, `generate music`, `assets install`. Event-kind catalog documented in [`docs/cli-spec.md`](../../docs/cli-spec.md) NDJSON streams section. `--quiet` suppresses every event except the final summary.

**Acceptance criteria:**
- Long-running verbs (`iterate`, `render`, `batch run`, `generate video`, `generate music`, `assets pull`) emit NDJSON events on stdout while running, with the final summary as the last line.
- Every event line is a complete JSON object with at minimum `{ ts, kind, ... }`.
- `--quiet` suppresses all events except the final summary.
- Event kinds per verb are documented in `docs/cli-spec.md`.

**Notes:** today only `render` emits structured progress. The rest print human strings or nothing.

### 01.02.04 Stable error shape on stderr  [x]
**v1.0:** yes

**Acceptance criteria:**
- Every error exits non-zero and writes `{ error: { code, message, hint? } }` to stderr as a single JSON object. **[x]** — `cli/lib/errors/format.ts` + legacy `err()` in `cli/lib/output.ts` both emit this shape off-TTY.
- `code` values come from a closed catalog (see `01.06.01`). **[x]** — `cli/lib/errors/catalog.ts` (25 codes, `<` 30 budget).
- `hint` is a short, actionable sentence — never an apology or restatement of `message`. **[x]** — enforced by `tests/unit/errors-catalog.test.ts`.
- Crashes inside a verb (uncaught exceptions) still produce the structured error — wrapper catches at the command boundary. **[x]** — `process.on("uncaughtException")` and `process.on("unhandledRejection")` wired in `cli/index.ts` route everything to `raiseError("E_INTERNAL", ...)` or `raiseError("E_CANCELLED")` for `CancelledError`.
- Migration sweep: ~70 of 106 legacy `err("...")` callsites migrated to typed `raiseError(code, ctx)` calls. Files fully migrated: project, persona, brand, ref, queue, batch, assets, config, models, template, video, render, generate (slot validation + project ensure + per-model validation). The remaining ~36 callsites in `audio`, `voice`, `profile`, `editor`, `research`, `setup`, `doctor`, `eval`, `daemon`, `whoami`, `example` still emit valid structured payloads via the `E_INTERNAL` fallback in `err()` and can be migrated as follow-up polish without breaking the v1.0 contract. Lint script `bun run lint:errors` catches drift.

### 01.02.05 `--dry-run` semantics standardized  [x]
**v1.0:** yes

**Implementation:** `--dry-run` + `--summary` flags landed on `generate image`, `generate video`, `generate voiceover`, `generate music`, `render`. Single-step verbs accept `--summary` as no-op (per D-06). `render --dry-run --summary` collapses to per-stage rollup. Coverage tests: [`tests/integration/cli-dryrun-coverage.test.ts`](../../tests/integration/cli-dryrun-coverage.test.ts) (6 cases) + existing [`cli-dryrun.test.ts`](../../tests/integration/cli-dryrun.test.ts).

**Acceptance criteria:**
- `--dry-run` exists on every verb that calls a paid API or mutates non-log workspace state.
- Default output is the **full unrolled plan**: JSON with `{ would_call: [...], cost_estimate_usd, would_write: [...] }`. Each `would_call` entry includes `{ stage, model_id, slot, prompt_hash, est_usd, latency_hint_s }`. See [D-06](OPEN-QUESTIONS.md#decision-log).
- `--summary` collapses `would_call` to a per-stage rollup `{ stage: { count, model_picks: {...}, est_usd } }` and omits `would_write`. Multi-step verbs (`iterate`, `render`, `batch run`) must support it; single-step verbs (`generate image|video|voiceover|music`) accept the flag as a no-op for shell-script consistency.
- Exit 0 if the dry-run "would have worked"; non-zero with the same error shape if validation would fail.
- Test: every verb with `--dry-run` proves it does not make a paid API call (parsed from `generations.jsonl` after run — must be empty for the project).

**Notes:** today `generate video` has it; `generate image`, `generate voiceover`, `generate music`, `iterate`, `render`, `batch run` do not. Pretty rendering on TTY uses a per-stage collapsible table for the full form, and a flat 5-7-line table for `--summary`.

---

## 01.03 Help system depth

Help is the agent's API documentation and the human's first reference. It has to be deep enough to act on without round-tripping to source.

### 01.03.01 `--help` walker shows full nested help  [x]
**v1.0:** yes

**Acceptance criteria:**
- `ralphy <resource> --help` lists actions; `ralphy <resource> <action> --help` lists flags. Walker handles arbitrary depth.
- Already implemented in commit `7241f37`.

**Notes:** landed. Keep an eye on regressions when adding new verbs.

### 01.03.02 Every front-stage verb's `--help` ends with an `Examples` block  [x]
**v1.0:** yes

**Implementation:** `Examples:` blocks added to `clone`, `render`, `new`, `skill install` via `addHelpText("after", ...)`. Landing grep test via [`scripts/lint-help-examples.ts`](../../scripts/lint-help-examples.ts) — extracts every `ralphy <...>` literal from `landing/`, classifies v1.0 vs post-launch, fails when a v1.0 example isn't found in the corresponding `--help`. Wired via `bun run lint:help-examples`. Tests: [`tests/unit/lint-help-examples.test.ts`](../../tests/unit/lint-help-examples.test.ts) (8 cases).

**Acceptance criteria:**
- Each of `trend`, `clone`, `iterate`, `mcp`, `skill install`, `render` has at least 3 examples in `--help`.
- Examples are **byte-identical** to a corresponding string in `landing/components/**` (grep test enforced in CI).
- Each example is runnable as-is on a freshly-set-up machine — no implicit dependencies on prior state.

**Notes:** the grep test is the enforcement; soft promises rot.

### 01.03.03 `generate video --help` shows per-model flag whitelists  [x]
**v1.0:** yes

**Implementation:** `addHelpText("after", ...)` on the `video` sub-command reads the cached OR catalog synchronously ([`cli/lib/or-catalog.ts → getOrCatalogSync()`](../../cli/lib/or-catalog.ts)) and prints per-model durations / resolutions / aspect_ratios / frame_images. `--model <id>` filter scans `process.argv` and narrows to a single row. Tests: [`tests/integration/cli-help-whitelist.test.ts`](../../tests/integration/cli-help-whitelist.test.ts) (2 cases).

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

### 01.05.03 `--quiet` suppresses progress + non-essential output  [x]
**v1.0:** yes

**Acceptance criteria:**
- `--quiet` exists on every verb; only the final result (JSON object) goes to stdout, only errors go to stderr. **[x]** — top-level `-q, --quiet` flag in `cli/index.ts` threads through `setQuiet()` in `cli/lib/ui.ts`; `ok/info/warn` and the `NdjsonEmitter` honor it.
- Compatible with `-p` (pretty + quiet = colored final result, no spinners / streams). **[x]** — quiet is orthogonal to the pretty/json mode.

**Notes:** Tested in `tests/unit/quiet-mode.test.ts` (5 cases) + `tests/integration/cli-quiet-flag.test.ts` (3 cases).

### 01.05.04 `--cwd <path>` pins workspace root for every verb  [x]
**v1.0:** yes

**Acceptance criteria:**
- Already implemented.

---

## 01.06 Exit codes and error catalog

A closed set of error codes that AI agents can switch on. Hints are how the agent learns to recover.

### 01.06.01 Error code catalog committed and stable  [x]
**v1.0:** yes

**Acceptance criteria:**
- `cli/lib/errors/catalog.ts` exports a typed enum of every `code` the CLI can emit; total < 30 distinct codes for v1.0. **[x]** — 25 codes across 6 classes (user / provider / env / gate / runtime / cancelled).
- Each entry has `{ code, http_analog?, message_template, hint_template, related_docs, deprecated?: boolean, replaced_by?: string }`. **[x]** — typed via `ErrorEntry` interface.
- New errors must be added to the catalog before being thrown — tested by a `lint:errors` script that greps for thrown errors and verifies their code is in the catalog. **[x]** — `scripts/lint-error-codes.ts`, wired via `bun run lint:errors`. Currently 0 violations across 76 scanned files.
- **Stability policy (per [D-07](OPEN-QUESTIONS.md#decision-log)):** the catalog becomes **append-only** at the v1.0 cut. Renames forbidden, removals forbidden. Deprecating a code requires flipping `deprecated: true`, naming the successor via `replaced_by`, and adding a CHANGELOG entry. Deprecated codes continue to be emitted by the CLI for at least one major version. Pre-v1.0, renames are still allowed but each one needs a one-line CHANGELOG callout so the freeze starts from a clean baseline.
- `docs/cli-spec.md` (or `docs/error-codes.md`) includes the full catalog as a generated section; the page is the public source of truth.

### 01.06.02 Exit codes mapped to error code classes  [x]
**v1.0:** yes

**Acceptance criteria:**
- `0` — success.
- `1` — generic runtime failure (an unmapped code; should approach zero occurrences by v1.0).
- `2` — user error (bad flag, missing file, invalid input).
- `3` — provider error (API down, rate limit, validation fail).
- `4` — environment error (missing dep, missing key).
- `5` — quality-gate refusal (score below threshold).
- `130` — cancelled by SIGINT.
- Documented in `docs/cli-spec.md` and used consistently. **[x]** — implemented via `classifyExitCode()` in `cli/lib/errors/catalog.ts`.
- **Stability policy:** the exit-code class set is locked at v1.0 (per [D-07](OPEN-QUESTIONS.md#decision-log)). Adding a new class requires a major-version bump.

### 01.06.03 Hints point at the next concrete action  [x]
**v1.0:** yes

**Acceptance criteria:**
- Every error's `hint` either names a verb to run, a file to edit, or a doc to read. **[x]** — every catalog entry's `hint` field references a concrete next action.
- No hint is a paraphrase of the message; reviewer pass before v1.0. **[x]** — enforced by `tests/unit/errors-catalog.test.ts` ("hints never restate the message verbatim").

---

## 01.07 Streaming / progress (cross-cutting refinement)

This topic is the implementation backbone for `01.02.03` — broken out because it touches `cli/lib/` plumbing that several verbs share.

### 01.07.01 Shared NDJSON emitter in `cli/lib/`  [x]
**v1.0:** yes

**Acceptance criteria:**
- Single emitter `cli/lib/stream/ndjson.ts` used by every long-running verb. **[x]** — `NdjsonEmitter` class with `event()` / `summary()` / `close()`.
- Backpressure-safe (does not buffer unboundedly on slow stdout consumers). **[x]** — delegates to `Writable.write()` and the stream's built-in queue; no custom buffer.
- `--quiet` flag passed through suppresses all but the final event. **[x]** — `quiet: true` constructor option.
- Test: emits 10k events in <1s, never reorders. **[x]** — `tests/unit/ndjson-emitter.test.ts` covers all four invariants (6 tests).
- Remaining: wire the emitter into `render`, `iterate`, `batch run`, `generate video`, `generate music`, `assets pull` (tracked under 01.02.03).

### 01.07.02 Cancellation: SIGINT propagates cleanly  [x]
**v1.0:** yes

**Implementation:** [`cli/lib/cancel.ts`](../../cli/lib/cancel.ts) — `CancellationToken` with `onCancel(listener)`, `throwIfCancelled()`. `installSigintHandler()` wires the global token to `SIGINT`; first hit flips the token, second hit hard-exits with 130. Top-level boundary in [`cli/index.ts`](../../cli/index.ts) catches `CancelledError` from `uncaughtException` / `unhandledRejection` and routes to `raiseError("E_CANCELLED")` → exit 130 via `classifyExitCode`. Tests: [`tests/unit/cancellation.test.ts`](../../tests/unit/cancellation.test.ts) (5 cases).

**Acceptance criteria:**
- Ctrl-C during a long-running verb cancels in-flight API calls (where the provider supports it), emits a `cancelled` event, and exits 130.
- Partial state is preserved (append-only files honored) — no truncation.

---

## 01.09 Standalone operation & global config

The casual-user on-ramp. No repo clone, no `bun install`, no working-directory dependence.

### 01.09.01 `ralphy new "<brief>"` creates a project under `~/.ralphy/`  [x]
**v1.0:** yes

**Implementation:** [`cli/commands/new.ts`](../../cli/commands/new.ts). CWD-independent — projects live at `$RALPHY_HOME/projects/<id>/` (defaults to `$HOME/.ralphy/projects/`). Auto-derives slug from brief, or accepts `--id <slug>`, or generates `YYMMDD-HHMMSS` when neither is provided. Refuses to overwrite existing project with `E_ALREADY_EXISTS`. Scaffolds canonical layout: `assets/`, `render/`, `logs/{generations,user-prompts,user-assets}.jsonl`, plus `BRIEF.md` when a brief is provided. Tests: [`tests/integration/cli-new.test.ts`](../../tests/integration/cli-new.test.ts) (4 cases).

**Acceptance criteria:**
- `ralphy new "<brief>"` (or `ralphy new --id <slug>` without brief) creates `~/.ralphy/projects/<id>/` with the canonical project shape (cross-link [`05.02`](../05-project-resources/SPEC.md)).
- No CWD dependence — the project lives in `~/.ralphy/projects/`, not in CWD.
- Output: `{ project_id, path, brief? }` JSON.
- Pretty mode prints "Project created at `~/.ralphy/projects/<id>` — `ralphy render <id>` to render once assets are in place".

### 01.09.02 Global config at `~/.ralphy/config.json` works from any directory  [x]
**v1.0:** yes

**Implementation:** [`cli/lib/global-config.ts`](../../cli/lib/global-config.ts) — `readGlobalConfig() / writeGlobalConfig() / configGet() / configSet() / configList()` with dot-path nesting. File written with `0600` perms (never logged) and parent dir created with `0700`. Tests: [`tests/unit/global-config.test.ts`](../../tests/unit/global-config.test.ts) (10 cases, including permissions assertion). The legacy workspace-scoped `workspace/.ralph/config.json` still loads via the older `cli/lib/config.ts` for dev mode; new flow goes through this module.

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

### 01.09.07 `ralphy doctor` reports install mode  [x]
**v1.0:** yes

**Implementation:** [`detectInstallMode()`](../../cli/commands/doctor.ts) walks up from the running file looking for the developer-mode marker triple (`package.json` + `cli/index.ts` + `templates/`). Returns `{ mode: "binary" | "developer", repoRoot }`. The `doctor` JSON report now includes `ralphy.mode`, `ralphy.home`, `ralphy.repoRoot`, `ralphy.templatesSource`, `ralphy.remotionSource`. Tests: [`tests/unit/doctor-install-mode.test.ts`](../../tests/unit/doctor-install-mode.test.ts) (3 cases).

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

### 01.10.01 `docs/cli-surface.md` lists every verb  [x]
**v1.0:** yes

**Implementation:** [`scripts/build-cli-surface.ts`](../../scripts/build-cli-surface.ts) parses `cli/index.ts` for every `program.addCommand(<verb>Cmd())` registration, runs `<verb> --help` against each, and writes a structured doc to [`docs/cli-surface.generated.md`](../../docs/cli-surface.generated.md). CI gate via `bun run cli:surface:check` (exits non-zero on drift). Hand-curated `docs/cli-surface.md` stays as the narrative companion. Generated doc covers 34 verbs across ~1017 lines. Tests: [`tests/unit/build-cli-surface.test.ts`](../../tests/unit/build-cli-surface.test.ts) (3 cases).

**Acceptance criteria:**
- One document with: every verb (current + v1.0-planned), one-line description, full signature, status (`today`/`v1.0`/`post-v1.0`), category cross-ref.
- Organized by resource (`brand`, `persona`, `project`, …) and by front-stage verb (`trend`, `clone`, `iterate`, `mcp`, `skill install`, `render`).
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
- Unblocks `01.01.02` (`ralphy trend`) — same adapter surface feeds both verbs.

### 01.11.04 `ralphy skill install` — wider adapter set  [ ]
**v1.0:** no

**Acceptance criteria:**
- Adapters land for Continue, Aider, Cline, GitHub Copilot custom instructions, Windsurf, Zed AI — one per release pass.
- `--agent <id>` allow-list expands without breaking the v1.0 `claude` / `cursor` / `codex` flags (no rename).
- Each new adapter mirrors the sentinel-bounded merge + idempotency rules from `01.01.06`.

**Notes:** scope decided in [D-05](OPEN-QUESTIONS.md#decision-log). Open a new sub-task per agent when demand surfaces.

### 01.11.05 `ralphy mcp` — stdio MCP server  [ ]
**v1.0:** no — full acceptance criteria live in `01.01.05`.

**Acceptance criteria:** (mirrors `01.01.05` for the post-launch implementation)
- See `01.01.05`. This entry exists to keep the v1.0 status board honest — when MCP lands, both rows flip together and `01.11.02` (SSE transport) opens for follow-up.

**Notes:** scope decided in [D-03](OPEN-QUESTIONS.md#decision-log).
