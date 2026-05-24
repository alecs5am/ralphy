# 12 — Deep Research — PRD

## Problem

The headline client scenario — *"port me a niche, find what's viral, tell me why, give me a base to generate content with ralphy"* — is currently unserved. The existing `ralphy research` surface (start / add-source / synthesize / show / list under `cli/lib/research-topic.ts`) is a shallow URL-aggregator with a single synthesis call. It has no discovery layer, no virality scoring, no cross-source verification, and emits a one-shot `report.md` that nothing downstream can query — `ralphy template suggest`, `ralphy new`, and the scenarist playbook cannot read it as a factbase.

Beyond capability gaps, the synthesis layer also hallucinates citations. The Rao, Wong & Callison-Burch audit (arXiv 2604.03173) measured 3–13% fabricated URLs even on frontier deep-research agents; without a deterministic verifier, ralphy will ship clients reports that cite sources that never existed. That is a reputation risk we cannot defer.

The full architecture survey lives in [`docs/research/deep-research-architecture-foundations.md`](../../docs/research/deep-research-architecture-foundations.md). Production deep-research systems converge on the NVIDIA AI-Q topology: async two-tier router (intent classifier → clarifier → shallow → deep), append-only event store, pluggable retrievers, deterministic post-hoc citation verifier. This category builds the same shape inside ralphy, with one hard constraint added by the user on 2026-05-24: **own engine, no paid keys**. Allowed: `yt-dlp`, headless Playwright (already in deps via HyperFrames), public RSS / JSON endpoints, free search APIs without enterprise contracts. Banned at MVP: Apify, RapidAPI, Bright Data, ScrapingBee, Tavily / Serper / Exa paid tiers.

## Users

| User | Need |
|---|---|
| **Maintainer (alecs5am)** | A research backend that lives inside the CLI, owns its own scraping, and never silently fabricates citations. |
| **AI agent driving a brief** | `ralphy research submit "<niche>"` returns a job-id; I can stream events, query state mid-flight, and read a cited report when it lands. |
| **Scenarist / art-director / intake playbook** | The research output is a structured factbase I can query — clusters, hooks, format patterns, virality scores — not a single markdown blob. |
| **Client running ralphy unattended** | The deep-research path completes on a niche scan in minutes, not minutes of frontier-model spend, with citation resolution above 97%. |

## User stories

1. As a **maintainer**, `ralphy research run "<query>"` returns a cited markdown answer with every citation resolved to an entry in the per-job source registry. Fabricated citations are flagged in the output, not silently dropped.
2. As an **agent**, I call `ralphy research submit "<query>"` and receive `{job_id, status}`; `status` / `stream` / `state` / `report` / `cancel` verbs mirror AI-Q semantics. A `SIGKILL` mid-job survives — `submit` again with the `job_id` resumes within 1 LLM turn.
3. As a **scenarist**, after a niche scan completes I get `workspace/research/<niche>/{feeds.jsonl, clusters.json, patterns.md, briefs/}`. `ralphy template suggest "<utterance>"` consumes these directly.
4. As a **client**, the shallow path (single-question lookup) returns p50 < 10s. The deep path (niche scan) completes inside a configurable wall-clock budget without burning a frontier model on every step — cheap models handle classification and per-page summarization, reasoning model handles plan + synthesis.
5. As an **OSS user**, I can run a deep research job without an Apify / Tavily / Exa key. `OPENROUTER_API_KEY` + `ELEVENLABS_API_KEY` (already required for ralphy) remain the only paid dependencies.

## Success metrics

| Metric | Target | How we measure |
|---|---|---|
| Citation resolution rate | ≥ 97% on a 20-query hand-picked eval set | Deterministic verifier on per-job source registry |
| Fabricated-URL detection | 100% of fabricated citations flagged in output | Same eval set, with planted fabrications |
| Shallow-path p50 latency | < 10s | `bun test` integration suite + production logs |
| Deep-path SIGKILL resume | resume within 1 LLM turn after `SIGKILL` | Integration test: kill mid-job, resubmit, assert continuation |
| Cost per shallow query | < $0.05 average | Gen-log rollup |
| External paid keys required | 0 beyond OpenRouter + ElevenLabs | Code audit |

## Scope

**In scope (this category):**

- The four-role topology: intent classifier → clarifier → shallow → deep, hand-rolled as a TypeScript DAG (no LangGraph dep).
- Async job manager: `submit / status / stream / report / state / cancel` verbs. Event store as append-only JSONL under `workspace/.ralph/research/<job-id>/`. SQLite (via `bun:sqlite`) for indexed lookup.
- Deterministic citation verifier: 5-level matcher (exact / truncation / prefix / child-path / query-subset). No LLM in the verifier itself.
- Append-only source registry with retrieved-text snapshots, keyed by URL.
- Pluggable retriever interface: `(text, source_url, retrieved_at, score)` contract. Web (DuckDuckGo HTML), `yt-dlp`, Reddit JSON, X-via-Nitter, headless Playwright for TikTok / Reels / Shorts public profiles.
- Niche-research overlay (Stage 4): virality scoring, format clustering, problem→solution per-cluster synthesis, structured output consumable by `ralphy template suggest`.

**Out of scope:**

- Paid-API retriever adapters (Tavily, Serper, Exa, Apify). Documented as an escape hatch for users who have keys; not bundled.
- A web UI / dashboard for browsing jobs. Chat (or `ralphy research show`) is the interface.
- DeepResearch Bench leaderboard chasing. A private 20–50 query eval set is enough.
- Re-architecting the legacy `ralphy research <topic>` surface in-place. We build the new shape next to it under `cli/lib/research/` and `cli/commands/research/`, then retire the legacy verbs at the end of Stage 2 once the new surface is at parity.

## Stage plan

Hardest-first ordering. If the verifier doesn't work, every downstream stage is fiction.

- **Stage 1 (this milestone) — citation verifier + source registry FIRST.** Single-agent ReAct loop on top of `cli/lib/providers/llm.ts → callLLM()`. Source registry = `workspace/.ralph/research/<job-id>/sources.jsonl`. Deterministic 5-level verifier. Retrievers: DuckDuckGo HTML + `yt-dlp`. New CLI verb: `ralphy research run "<query>"` (sync). **Acceptance: ≥97% citation resolution on 20 hand-picked queries.** Stop and fix before Stage 2 if missed.
- **Stage 2 — four-role split + async job manager.** Intent classifier (one fast-model call, 90s hard timeout). Clarifier (one round, defaults its own questions if user declines). Shallow path (`max_llm_turns: 10`, `max_tool_iterations: 5`, p50 < 10s). Deep path (planner + `max_loops: 2`, plan persisted). Event store JSONL. SSE stub via local Bun HTTP server. **Acceptance: deep checkpoints survive `SIGKILL` mid-job.**
- **Stage 3 — own-engine social retrievers.** Playwright for TikTok / Reels / Shorts (login-less, public profiles). `yt-dlp` rewired from `workspace/references/<refSlug>/` to the new registry. Reddit JSON, X via Nitter (with fallback documented). Discovery feeds: TikTok Creative Center scrape, YouTube trending RSS, Reddit top.json per sub.
- **Stage 4 — niche-research vibe-tune.** Virality scoring (`views / age_days` + engagement rate, platform-normalized). Pattern clustering (hooks / format / duration / audio repeats) via reasoning-model synthesis. Per-cluster problem→solution analysis. Structured `workspace/research/<niche>/` output. Optional 20–50 query private eval set.

## Decisions deferred

Live in [`OPEN-QUESTIONS.md`](OPEN-QUESTIONS.md). Snapshot: storage backend (SQLite vs Postgres — SQLite likely), graph lib (hand-rolled FSM vs LangGraph — hand-rolled per the own-engine directive), headless browser choice, search fallback chain, fate of the legacy `ralphy research <topic>` verbs.

## Cross-references

- Source idea: [`notes/ideas/006-deep-research-architecture.md`](../../notes/ideas/006-deep-research-architecture.md) — promoted into this category on 2026-05-25, deletion follows the convention in [`developing-ralphy.md`](../../docs/developing-ralphy.md#when-to-file-a-note-vs-add-a-spec-row).
- Architecture survey: [`docs/research/deep-research-architecture-foundations.md`](../../docs/research/deep-research-architecture-foundations.md).
- Prior critique of the shallow skill: [`docs/research/skill-activation.md`](../../docs/research/skill-activation.md).
- Consumes the provider layer at [`cli/lib/providers/llm.ts`](../../cli/lib/providers/llm.ts) and [`cli/lib/providers/media.ts`](../../cli/lib/providers/media.ts).
- Feeds [`02 — Prompts & Templates`](../02-prompts-and-templates/) (`ralphy template suggest`), [`04 — User Flow & Autonomy`](../04-user-flow-and-autonomy/) (intake playbook), and the scenarist playbook at [`docs/playbooks/scenarist.md`](../../docs/playbooks/scenarist.md).
