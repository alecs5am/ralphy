# Farm mode — two-path architecture + node-graph pipeline design

> Design doc (filed 2026-07-05). Decomposed into tracked issues #496-#509 under
> `notes/issues/` — the issues own scope and status; this doc is the shared
> design reference they cite.

## Product thesis

Ralphy today is a playground: the user chats with a coding agent, iterates on a
workspace, and ships units one checkpoint at a time. That is the right shape for
*developing* a content format, but user attention scales O(N) with units
produced. The farm goal: make attention O(1) per format — the user calibrates a
workspace once (style lock, evaluators, composition, calendar), then a headless
runtime stamps units and gates itself.

Metric to maximize: `content quality x units produced / user attention`.

### The two-path model

1. **Training path (interactive).** In Claude Code / Codex / Gemini CLI the user
   and agent develop a workspace to a stable, reproducible format. High
   attention by design. The output of training is not "agent skill" — it is
   **workspace artifacts**: style lock, evaluator rubric, parametrized
   HyperFrames composition (data-driven engine + schedule.json, per the
   guide-video-kit pattern), prompt templates, calendar defaults, and a
   pipeline graph spec.
2. **Production path (headless).** The workspace exports as a template bundle
   (zip). The user deploys the farm on a server (docker), imports the bundle in
   an authenticated dashboard, presses start. The runtime executes the graph on
   schedule; the user's role shrinks to reviewing a queue and tuning the rubric.

**Export-readiness criterion:** a template is ready to leave the training path
when producing one more unit no longer requires creative code authoring — the
composition is a parametrized machine, prompts are templates with slots, and the
evaluator verdict correlates with the user's own accept/reject decisions.

### Trust ladder (per workspace)

- **L0** — everything is produced automatically, publish requires dashboard
  approval (review queue).
- **L1** — units above an eval-score threshold auto-publish; borderline goes to
  the queue.
- **L2** — full autopilot; the user reads a digest.

Level promotion is proposed by the system when rubric verdicts have tracked the
user's manual approvals for a configurable streak.

## Foundation decision: Vercel AI SDK

**Decision (owner, 2026-07-05):** the farm runtime's LLM layer is built on the
Vercel AI SDK (the open-source `ai` npm package) — provider adapters, tool
calling, `generateObject` structured output, agent loop primitives, and its
connector ecosystem. Custom implementation only where the SDK does not cover a
use case. Rationale: dense, well-maintained agent SDK; no reason to rebuild
provider plumbing.

**D-01 — invariant #1 carve-out for the AI SDK (decided 2026-07-06, #496):**
AGENTS.md invariant #1 bans Vercel. The ban's substance is *hosted* Vercel: no
`VERCEL_API_KEY`, no Vercel hosts (AI Gateway, Eve platform, Workflows) — that
ban stays fully intact, with no allowlist. The `ai` npm package is a local,
provider-agnostic library and does not phone Vercel, so it and its provider
adapter packages (e.g. `@openrouter/ai-sdk-provider`) are permitted as
dependencies — imported ONLY from the designated provider layer
`cli/lib/providers/ai-sdk.ts`, mirroring the `fal.ts` file-scoped allowlist.
Enforced by `tests/unit/agents-md-invariants.test.ts` (guard landed before the
dependency, so the allowlist is a recorded decision, not an accident; #499 adds
the dependency). Model traffic still flows through registered connectors only
(OpenRouter / fal / ElevenLabs keys).

**Rejected alternatives:**

- **Eve (vercel.com/eve)** — hosted platform on Vercel infra; conflicts with
  self-hosted positioning and invariant #1. Its shape (markdown instructions +
  skills + TS tools + schedules + HITL gates) independently validates ralphy's
  existing architecture. Supersedes part of [493-embed-eve-workflow-runtime.md](../../notes/issues/deprecated/493-embed-eve-workflow-runtime.md):
  the spike may still probe Eve's *session model* for ideas, but the foundation
  is the AI SDK, and nothing hosted-Vercel ships in production.
- **CrewAI / autogen-class frameworks (Python)** — wrong task shape. Template
  production is a deterministic pipeline with bounded LLM calls in nodes, not
  open-ended agent collaboration; crew-style autonomy reintroduces variance
  exactly where the export exists to guarantee reproducibility. Also splits the
  stack (schemas duplicated zod<->pydantic) — see the earlier Python-core
  discussion.
- **n8n / ComfyUI embedding** — we adopt the *mental model* (typed node graph),
  not the engines; the graph must execute ralphy verbs natively and live inside
  the workspace bundle.

## Graph spec, not visual editor (v1)

The pipeline is a declarative spec file in the bundle. Studio's run-graph
canvas (#490) already renders graphs read-only; the dashboard renders the spec
and its live run state. A drag-drop editor is explicitly out of scope for v1 —
the spec is edited in the training path (Claude Code), which keeps the
two-path split clean.

**D-03 — spec format: JSON storage, YAML accepted at import/lint (decided
2026-07-06, #498):** JSON is the storage format — the graph lives beside the
#478 linear workflows as `workflows/<name>.json` (schema:
`cli/lib/schemas/workflow.ts`, a linear workflow is a degenerate graph and
keeps parsing), matching the existing `workflow.json` convention and Studio's
native JSON parsing. YAML is accepted at import/lint time only (`ralphy
workflow lint` reads `.yaml`/`.yml` via the already-present `yaml` dependency
— no new package) because agents author it comfortably; a YAML file is an
authoring convenience, not a storage tier — `workflow list|show|status` and
the bundle read JSON. The bundle file is therefore `pipeline.json` (earlier
sketches said `pipeline.yaml`; an import step may down-convert an authored
YAML spec to JSON at bundle build). Validation at import is
`validateWorkflowGraph()` (`cli/lib/workflow-graph.ts`): DAG, edge
resolution, port typing, and the D-02 coverage matrix — a declared-unsupported
media param is a HARD import error (unlike the #497 warn-only generate path).

Executor placement builds on [492-workflow-app-api-orchestrator-boundary.md](../../notes/issues/492-workflow-app-api-orchestrator-boundary.md):
the workflow app owns runs and exposes the API; `.ralphy/` files stay the
durable state behind it.

## Node design

### Common node envelope

Every node, regardless of type, shares:

```yaml
id: research            # unique in graph
type: generate-object   # node type (taxonomy below)
in:                     # typed input ports — artifact refs or upstream node outputs
  sources: trend-watch.items
out: research-facts     # named typed output artifact
params: { ... }         # type-specific (below)
retry: { max: 2, backoff: exponential }
on_fail: halt | skip | route:<node-id>   # failure routing
budget: { max_usd: 0.40 }                # per-node spend cap, pre-flight estimated
cache: content-hash | none               # skip re-run when inputs unchanged
emit: true                               # events -> run journal -> dashboard
```

Ports are typed (`text`, `object:<schema>`, `image[]`, `video`, `audio`,
`source-item[]`, `unit`) and validated at graph load, so a mis-wired graph
fails at import, not mid-run.

### A. LLM nodes (Vercel AI SDK)

| Node | What | Key params |
|---|---|---|
| `generate-text` | single bounded completion | `model` (id), `provider` (openrouter default), `prompt` (file ref with `{{slot}}` interpolation), `system`, `temperature`, `max_tokens`, `fallback_models[]` |
| `generate-object` | completion with mandatory structured output | all of the above + `schema` (zod/JSON-schema file ref); retries on validation failure — this is the default for anything a downstream node consumes |
| `agent-loop` | bounded multi-step tool-calling loop (AI SDK agent primitives) | `model`, `tools[]` (whitelist of graph-exposed tools/connectors), `max_steps`, `stop_when` — the "orchestrator node" (e.g. Fable planning a batch, Opus running research synthesis) |
| `coding-agent` | headless external coding agent for genuinely creative code work | `binary` (`claude` / `codex` / `gemini`), `prompt_file`, `workdir`, `timeout`, `allowed_paths[]` |

`coding-agent` is the vendor-independence valve: the coding agent is a
pluggable node type, not the system's foundation. A mature template should
need it rarely or never (see export-readiness criterion); heavy `coding-agent`
usage in a production graph is a smell that the template left training too
early.

Model-per-node binding is the point: research on `anthropic/claude-opus-4-8`,
scripts on `anthropic/claude-fable-5`, cheap classification on a small model —
all routed via the OpenRouter key through the AI SDK's provider adapter.

**D-04 — callLLM() / AI-SDK boundary (decided 2026-07-06, #499):** the two LLM
paths coexist permanently, split by caller class. Every existing verb — and any
future verb-shaped feature (council, templater, style-lock enrich, social copy,
…) — stays on `callLLM()` (`cli/lib/providers/registry.ts`), which owns
connector selection, gen-log rows, and the single-completion call shape those
call sites need. Workflow-graph LLM nodes (`generate-text`, `generate-object`,
`agent-loop`) run on the AI SDK path instead: `cli/lib/providers/ai-sdk.ts`
(the D-01 allowlisted file) wraps `generateText` / `generateObject` /
`stopWhen(stepCountIs())` behind the same OpenRouter key, and
`cli/lib/workflow/executors/` binds the node types to it. There is NO migration
of `callLLM()` call sites — the SDK buys structured output, loop primitives,
and provider adapters for the graph's multi-step cases, not a rewrite of
working single-shot plumbing. `coding-agent` sits on neither path (headless
external binary, no SDK import). Both paths land rows in the same
generations.jsonl schema (model, tokens, cost_usd), so spend rollups stay
uniform.

### B. Media nodes — typed by I/O signature, not by model

Core insight (owner): **the same model exposes different capability surfaces
per provider.** OpenRouter covers maybe 40% of seedance-2.0's parameter surface;
fal.ai exposes ~100% (multi-ref @Image/@Video roles, last-frame, extension,
audio tracks). So nodes are typed by I/O signature; the (model, provider) pair
is a binding *inside* the node, and validation must know what each pair
supports.

Node taxonomy by signature:

| Node | Signature | Notes / key params |
|---|---|---|
| `t2i` | text -> image | `model`, `provider`, `aspect`, `n`, `seed`, `negative`; guideline slugs foldable into prompt |
| `i2i` | image + text -> image | edit / restyle / ref-guided; `refs[]` with role labels (style vs identity vs layout) |
| `t2v` | text -> video | `duration`, `aspect`, `audio: on/off` (Kling native audio vs banned-music rule) |
| `i2v` | image (+text) -> video | `first_frame` required, `last_frame` optional (rare-careful per seedance memory), `motion_prompt` |
| `r2v` | refs[] + text -> video | reference-guided (seedance @Image/@Video role system); fal-only surface today |
| `v2v` | video (+text) -> video | extend / restyle / multi-block continuation |
| `lipsync` | image + audio -> video | talking-head (HeyGen / fal avatar routes) |
| `tts` | text -> audio | `voice_id`, `stability`, `style`; ElevenLabs connector |
| `voice-design` | text -> voice_id + previews | preview set for human pick during training; frozen `voice_id` in production |
| `music` | text -> audio | ElevenLabs Music; ToS constraints (no artist names) enforced as a param-level lint |
| `sfx` | text -> audio | themed-per-video discipline |
| `transcribe` | audio/video -> word-level transcript | the scribe-first invariant as a node |
| `upscale` / `remove-bg` / `reframe` / `crunch` | image/video -> same | deterministic post-ops (some are ffmpeg-backed ralphy verbs, see C) |

Shared media-node params: `(model, provider)` binding resolved through the
existing connector registry (`resolveConnector(cap, provider)`); `refs[]`;
`seed`; append-only versioned output (`.vN` — invariant #14 holds inside the
farm); pre-flight cost estimate written to the run journal; per-node and
per-run budget caps.

**Provider capability matrix as data.** Extend the connector registry so each
`(model, capability, provider)` triple declares its supported parameter set
(fal's model-schema API can seed this; OpenRouter's surface is the floor).
Graph validation then *warns or fails at import* when a node uses a param its
chosen provider does not support, and names the provider that does — the
"OR covers 40%, fal covers 100%" problem becomes a typed, inspectable fact
instead of a mid-run surprise. This matrix is also what the dashboard's node
inspector renders.

**D-02 — capability-matrix source of truth (decided 2026-07-06, #497):**
hand-curated registry data is the source of truth. The matrix lives as a typed
const in `cli/lib/providers/coverage.ts` — per-(model, capability, provider)
entries with `supportedParams` / `unsupportedParams`, a `family` grouping for
cross-provider siblings, and a `source: "hand-curated" | "derived"` field —
mirroring the `MODEL_CONSTRAINTS` convention (#445): MODELS.md prose is the
human source of truth, the table is its machine mirror, and there is
intentionally NO auto-sync. Rationale: fal model schemas and the OR catalog
describe *shape*, not *semantics* — the OR catalog carries no param-level data
at all (whether `input_references` works per model is prose knowledge), and
fal's schema says `generate_audio` exists but not that seedance speech is
unvalidated — so an auto-derived matrix would be confidently wrong exactly
where it matters. Refresh path (documented, manual): when a provider surface
changes, update MODELS.md and the coverage table in the same change; fal model
schemas (`https://fal.ai/models/<id>/api`) and the OR catalog (`ralphy models
list`) are the reference material for that manual update. `source: "derived"`
is reserved for a future automated seeding pass that may ADD rows but never
overwrite a hand-curated one. Surfaced via `ralphy provider matrix
[--model <id>]` and the warn-only gate in `ralphy generate`; #498 consumes the
same data for hard-fail at graph import.

### C. Ralphy verb nodes

The farm executes ralphy, it never reimplements it — gates, append-only
semantics, logs, cost rollup, and the repair loop come free, and #492's rule
("the API is not a second media engine") is preserved.

| Node | Wraps |
|---|---|
| `ralphy-generate` | `ralphy generate <kind>` (when the step is better expressed as the verb than as a raw media node — keeps gen-log/manifest semantics) |
| `ralphy-render` | `ralphy render <project>` — the only render path |
| `ralphy-eval` | `ralphy workspace eval <project>` — the workspace rubric as a gate |
| `ralphy-repair` | repair-plan + bounded repair loop (#409/#473); free editor fixes auto-loop, paid regen routes to `approval` |
| `ralphy-unit` | unit formation (#069) |
| `ralphy-captions` | SRT generation (scribe-anchored) |
| `ralphy-social-copy` | platform captions + hashtags into `unit.json` |

### D. Ingestion / connector nodes

| Node | Backend | Key params |
|---|---|---|
| `web-scrape` | firecrawl | `urls[] / query`, `mode: scrape/crawl/search`, output normalized `source-item[]` |
| `actor` | apify | `actor_id` (X/Twitter scraper, TikTok trends, etc.), `input`, schedule |
| `rss` | native | `feeds[]`, since-cursor |
| `trend-watch` | composition of the above | `topics[]`, `schedule`, `dedup_window` — emits only the delta since last tick |
| `http` | native | generic escape hatch, allowlisted hosts only (invariant #1 discipline extends to the farm) |

All ingestion nodes emit a normalized `source-item` (url, title, text, ts,
source, engagement signals) so downstream nodes are source-agnostic.

### E. Publish nodes

| Node | Backend | Notes |
|---|---|---|
| `publish` | Postiz (preferred v1) | `targets[]` (youtube/tiktok/instagram/x), `account`, `schedule_at` (from calendar slot), metadata mapped from `unit.json` + social copy. Postiz solves 4x OAuth + queueing; own connectors only if it disappoints |
| `youtube-upload` | YouTube Data API direct | fallback / long-form specifics (chapters, thumbnails) |
| `x-post` | X API | text units (threads) don't need Postiz |
| `analytics-pull` | platform analytics APIs | closes the loop: per-unit retention/views -> performance postmortem -> `ralphy memory note --workspace`. The self-improving-farm differentiator |

**D-05 — Postiz integration depth: external-by-default, optionally bundled
(decided 2026-07-06, #501, coordinated with #506):** Postiz is an EXTERNAL
service the farm calls, not a hard runtime dependency. The connector
(`cli/lib/providers/postiz.ts`) is configured by `POSTIZ_BASE_URL` +
`POSTIZ_API_KEY`; because self-hosted Postiz has no canonical SaaS host, the
base URL is REQUIRED config (the connector reports unavailable with a clear
message when either var is unset). That makes the connector
deployment-agnostic by construction: the #506 docker-compose MAY bundle Postiz
as an OPTIONAL service — the compose file then points `POSTIZ_BASE_URL` at the
bundled container — and pointing at an already-running external instance is
the same single env var. Invariant-#1 consequence: with no fixed host to scan
for, the connector guard in `tests/unit/agents-md-invariants.test.ts` is
env-var-scoped only (both vars file-scoped to the connector). `x-post` runs
through Postiz too (an `x` integration); a direct X API connector and the
`youtube-upload` direct-API fallback are named follow-ups.

### F. Control-flow nodes

| Node | Behavior |
|---|---|
| `schedule` | cron trigger; graph entry point for production ticks |
| `calendar-slot` | picks the next free slot from the workspace `calendar.json`; the calendar is a first-class workspace entity (slots, unit-type mix, statuses idea->queued->produced->gated->scheduled->published) |
| `fan-out` | map a node subgraph over items (one research pass -> N unit branches); `concurrency` cap |
| `join` | barrier; only where a downstream step genuinely needs all branches |
| `switch` | route by a classifier/field value (e.g. content-mode of an idea) |
| `gate` | consumes an eval verdict; routes ship / repair / needs-human per threshold |
| `approval` | human-in-the-loop: pushes to the dashboard review queue and parks the run durably; trust-ladder level decides whether it auto-passes |
| `budget-guard` | halts the run/workspace when daily or per-run spend cap is hit; kill switch surface |
| `dedup` | persistent seen-store (don't make two videos about the same news item) |

### G. Data nodes

| Node | Behavior |
|---|---|
| `transform` | pure expression (jq / small JS) over artifacts; no I/O |
| `template-string` | prompt interpolation from upstream artifacts into a prompt file |
| `artifact-write` | persist an artifact into the project tree (append-only) |

## Template bundle (the zip)

```
bundle/
  manifest.yaml        # name, version, ralphy-version floor, required connector keys,
                       # required capabilities matrix (model+provider pairs), trust-ladder default
  pipeline.json        # the graph spec (JSON storage per D-03; YAML accepted at import/lint)
  prompts/             # slot-templated prompt files per node
  compositions/        # parametrized HyperFrames engines (+ schedule.json contract)
  evaluators/          # STYLE_LOCK.md, evaluators.json, metrics-benchmarks.json
  calendar.yaml        # default slots / unit-type mix
  refs/                # frozen style refs, cast masters, brand assets
```

`ralphy workspace export <ws>` produces it from a trained workspace;
`import` validates manifest against installed connectors/keys and the
capability matrix before accepting. Shipped as #502 — the concrete format
(manifest fields, export-readiness criteria, import validation semantics)
is documented in [`docs/workspace-bundle.md`](../workspace-bundle.md).

## Runtime & dashboard

- Runner: bun process (`ralphy farm start`), docker-compose one-command deploy.
  Durable run journal (resume after crash — the approval node depends on
  parking runs for hours/days).

**D-06 — executor placement: the standalone `ralphy farm` process (decided
2026-07-06, #503):** graph execution lives in the standalone, user-launched
`ralphy farm start` process (`cli/lib/farm/runner.ts`), NOT inside the
workflow-app API (#492) — the app/dashboard OBSERVES farm state (run.json,
run-events.jsonl, farm-state.json under `runs/<run-id>/`) and never executes
nodes, preserving #492's "the API is not a second media engine" rule.
Tick → Run compilation is in-process over the topological order (one tick =
one #480 Run with an append-only journal), not jobs.db compilation: the #481
queue executes argv-shaped CLI invocations through a detached worker, while
graph nodes are in-process `NodeExecutor` functions whose outputs feed
downstream in-ports — see the runner module header for the full rationale.
AGENTS.md invariant #5 is untouched by the daemon: `farm start` is explicit
user intent, foregrounded; the user backgrounds or dockerizes it (#506).
- Dashboard: evolved Studio behind auth — calendar view, review queue
  (approve/reject on top of existing annotations #488), run graph with live
  node states (#490 canvas), logs, spend stats, start/stop + trust-level
  controls, config patches (#491) as the safe settings surface.
- Control surface: the workflow-app API from #492 is the boundary; Claude Code
  (training path) and the farm runner (production path) both drive it.

## Pilot: tech-news workspace (fireship-style)

Best-case stress test: high frequency, short relevance window (forces real
automation), and one research pass fans out to four unit types — X thread,
short, long-form video, IG carousel (relates: [013-newsroom-carousel-format.md](../../notes/ideas/013-newsroom-carousel-format.md)).

Phasing:

1. Train `tech-news` workspace interactively to stable units of all four types
   (current path, nothing new to build).
2. `ralphy workspace export/import` + bundle format.
3. Thin runner: `ralphy farm start` executing `pipeline.yaml` on cron ticks,
   local machine first.
4. Studio -> authenticated dashboard (queue + calendar + start button).
5. Postiz publish connector; L0 -> L1 trust ladder.
6. `analytics-pull` -> performance postmortems -> workspace memory (phase 3 of
   the farm vision; the moat).

## Open decisions (blockers before promoting to issues)

1. **Invariant #1 carve-out** for the `ai` npm package — **decided** as D-01
   (see "Foundation decision" above; landed via #496, allowlisted path
   `cli/lib/providers/ai-sdk.ts`).
2. **Spec format** — **decided** as D-03 (see "Graph spec, not visual editor"
   above; landed via #498: JSON is the storage format, YAML accepted at
   import/lint time by `ralphy workflow lint`).
3. **Executor placement** — **decided** as D-06 (see "Runtime & dashboard"
   above; landed via #503: the standalone `ralphy farm` process executes,
   in-process over the topo order with a durable run journal; the workflow-app
   API (#492) observes state and never executes).
4. **Postiz integration depth** — **decided** as D-05 (see "E. Publish nodes"
   above; landed via #501: external-by-default via `POSTIZ_BASE_URL` +
   `POSTIZ_API_KEY`, the #506 compose file MAY bundle Postiz as an optional
   service pointing that same env var at the bundled container).
5. **Capability-matrix source of truth** — **decided** as D-02 (see
   "B. Media nodes" above; landed via #497, hand-curated typed const at
   `cli/lib/providers/coverage.ts`, manual refresh informed by fal model
   schemas + the OR catalog).
