# Deep-research architecture — own-engine, no-paid-keys

> **Status:** idea
> **Filed:** 2026-05-24
> **Folder:** ideas
> **Source research:** [`docs/research/deep-research-architecture-foundations.md`](../../docs/research/deep-research-architecture-foundations.md)
> **Prior critique:** [`docs/research/skill-activation.md`](../../docs/research/skill-activation.md)

## Context

Current `.agents/skills/ralphy-researcher/SKILL.md` is too shallow for the headline client scenario: *"port me a niche, find what's viral, tell me why, give me a base to generate content with ralphy."* It only accepts user-provided URLs, has no discovery layer, no virality scoring, no cross-source synthesis verification, and emits a one-shot `report.md` that nothing downstream can query (`ralphy template suggest` / `ralphy new` / the scenarist playbook cannot read it as a factbase).

We ran a Claude Deep Research pass on the foundations of deep-research agent skills (15+ primary sources, NVIDIA AI-Q v2.1 as baseline + comparisons against OpenAI Deep Research, Anthropic Research, Gemini Deep Research, GPT-Researcher, STORM, Tongyi DeepResearch, LangChain Open Deep Research). Output is filed at `docs/research/deep-research-architecture-foundations.md`. The canonical shape converges on **NVIDIA AI-Q topology**: async two-tier router (intent classifier → clarifier → shallow → deep) + event store + pluggable retrievers + deterministic citation verifier.

## What

Rebuild researcher as a production-grade deep-research engine that lives inside ralphy CLI and is reachable from skills:

1. **Topology** — AI-Q–style four roles (`intent-classifier` → `clarifier` → `shallow-researcher` → `deep-researcher`) as a hand-rolled DAG (no LangGraph dep — Bun-native, keeps the binary slim).
2. **Async job model** — `ralphy research submit "<q>"` returns `{job_id}`; `status / stream / report / state / cancel` verbs mirror AI-Q. Backed by SQLite + JSONL event store under `workspace/.ralph/research/<job-id>/`.
3. **Source registry + deterministic citation verifier** — append-only `sources.jsonl` keyed by URL with snapshot text; non-LLM 5-level matcher (exact / truncation / prefix / child-path / query-subset) flags unmatched citations rather than re-prompting.
4. **Pluggable retriever interface** — every retriever returns `(text, source_url, retrieved_at, score)`. Domain-specific retrievers (TikTok / Reels / Shorts / Reddit / X / YouTube / web) plug in via a registry, not by hardcoding into the orchestrator.
5. **Niche-research overlay** — Stage-4 layer on top: virality scoring, format clustering, "problem → solution" per-cluster synthesis, structured output that `ralphy template suggest` and intake can consume.

**Hard constraint (user directive 2026-05-24): own engine, no paid keys.** Allowed: `yt-dlp`, headless Playwright (already in deps via HyperFrames), public RSS / JSON endpoints, free search APIs without enterprise contracts (DuckDuckGo HTML, SearXNG self-hostable, Google Programmable Search free tier). **Banned at MVP:** Apify, RapidAPI, Bright Data, ScrapingBee, Tavily/Serper/Exa paid tiers.

## Why it matters

- **Client scenario is currently impossible.** The headline ask ("research niche, find viral formats, understand why, build a content base") cannot be served by the current researcher. This is a category-defining feature for ralphy positioning.
- **Citation honesty.** Rao et al. (arXiv 2604.03173) measured 3–13% hallucinated URLs even on frontier deep-research agents; without a deterministic verifier ralphy will ship clients reports with invented sources. Reputation risk.
- **Downstream leverage.** A structured factbase per niche (`workspace/research/<niche>/`) feeds `ralphy template suggest`, the intake playbook's clarifying questions, and the scenarist's hook bank. One investment, four consumers.
- **Strategic moat.** Own scraping engine = no per-query cost ceiling, no ToS surprises from a third-party SaaS, no key rotation pain for downstream users of ralphy. Matches the broader CLI philosophy ("ralphy is the only entry-point" — `AGENTS.md` invariant #2).

## Stage plan

Adapted from `docs/research/deep-research-architecture-foundations.md` §Recommendations + the own-engine constraint.

### Stage 1 — citation verifier + source registry FIRST (days 1–7)

Hardest-first ordering. If the verifier doesn't work, every downstream stage is fiction.

- Single-agent ReAct loop on top of existing `cli/lib/providers/llm.ts → callLLM()`.
- Source registry = `workspace/.ralph/research/<job-id>/sources.jsonl` (append-only, URL-keyed, snapshot text inline).
- Deterministic verifier (non-LLM TypeScript): regex URL extract → 5-level match → flag unmatched citations on output. No LLM re-prompt on rejection.
- Retrievers: DuckDuckGo HTML scraper (free, no key) + `yt-dlp` for video URLs (already in deps).
- New CLI verb: `ralphy research run "<query>"` (sync, single-shot, for verifier dev loop).
- **Acceptance: ≥97% citation resolution on 20 hand-picked queries.** If we miss, stop and fix before Stage 2.

### Stage 2 — four-role split + async job manager (days 8–21)

- New CLI surface: `ralphy research {submit | status | stream | report | state | cancel}`.
- Intent classifier: single fast-model call → `{intent: meta|research, depth: shallow|deep}` JSON. Hard 90s timeout.
- Clarifier: max 1 round, defaults own questions if user declines, emits an immutable brief.
- Shallow path: `max_llm_turns: 10`, `max_tool_iterations: 5`. **Acceptance: p50 < 10s.**
- Deep path: planner + `max_loops: 2`, plan persisted to `<job-id>/plan.md`.
- Event store: `<job-id>/events.jsonl` (LLM tokens, tool calls, status transitions). SSE stream stub via a local Bun HTTP server (only when `--stream` requested).
- **Acceptance: deep checkpoints survive `SIGKILL` mid-job — resume via `job_id` recovers within 1 LLM turn.**

### Stage 3 — own-engine social-platform retrievers (days 22–35)

- **Headless Playwright workers** for TikTok / Reels / Shorts (login-less, public profiles only). Reuse the HyperFrames preview Playwright install.
- **`yt-dlp`** for video pull + metadata + transcript (existing `ralphy ref` pipeline rewired to write into the new source registry instead of `workspace/references/<refSlug>/`).
- **Reddit JSON API** (public `/r/<sub>/top.json`, no key).
- **X via Nitter** (self-hostable instance — no key), document fallback when Nitter dies.
- **Discovery feeds**: TikTok Creative Center scrape, YouTube trending RSS, Reddit `top.json` per sub. All wired as "discovery" tools the deep planner can call to seed a niche scan.
- Every retriever speaks the same contract: `(text, source_url, retrieved_at, score)` → registry.

### Stage 4 — niche-research vibe-tune (days 36–60)

- Virality scoring: `views / age_days` + engagement rate + save-share ratio per-platform-normalized.
- Pattern clustering per niche (hook taxonomy / format / duration buckets / audio repeats) via reasoning-model synthesis over the registry.
- Per-cluster "problem → solution" analysis: what JTBD does the format serve, what makes it stick.
- Structured output: `workspace/research/<niche>/{feeds.jsonl, clusters.json, patterns.md, briefs/}` consumable by `ralphy template suggest` and the intake playbook.
- Optional: 20–50 query private eval set (hand-graded expected facts) — DeepResearch Bench is overkill for our niche.

## Decisions deferred

- **Storage backend.** SQLite (simple, file-based, Bun-native via `bun:sqlite`) vs Postgres (AI-Q's choice, heavy). Likely SQLite for v1.
- **Graph/state-machine lib.** LangGraph (Python, ecosystem fit) vs hand-rolled TypeScript FSM (no dep, Bun-friendly). Likely hand-rolled — keeps `ralphy` install slim, matches "own engine" directive.
- **Headless browser.** Playwright (already in deps via HyperFrames, heavy) vs `puppeteer-core` against the user's existing Chrome (lighter, less reproducible). Decide after Stage 1 verifier signal is green.
- **Search backend fallback chain.** DuckDuckGo HTML primary; SearXNG self-hostable as fallback; document escape hatch to Tavily/Serper for users who *do* have a key but the default path is keyless.
- **Fate of existing `.agents/skills/ralphy-researcher/`.** Deprecate at end of Stage 2 (new CLI verbs replace it) vs evolve into a thin client like AI-Q's SKILL.md. Probably the latter — the skill body shrinks to a routing index + `ralphy research submit` invocation.

## Notes

- Existing `workspace/references/<refSlug>/` artifacts (frames, transcripts, vision blueprints from `ralphy ref`) **map naturally to the new source registry** — Stage 3 migration is rewiring, not rewriting. No data loss, no breaking change to existing projects.
- `workspace/projects/<id>/logs/*.jsonl` (append-only) is already half of an event store — we extend the pattern, we don't invent it.
- The 12 anti-patterns enumerated in `deep-research-architecture-foundations.md` §12 ("What the OSS field gets wrong") are a CI checklist for the new code — should land as a `roadmap/todo/` task once this idea is promoted.
- Promotion: when this matures into a roadmap task, the natural category is a new `roadmap/12-deep-research/` folder (or a section under `03-skills/` if we keep it skill-scoped). Decide at promotion time.
