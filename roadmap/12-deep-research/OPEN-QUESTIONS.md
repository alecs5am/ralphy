# 12 — Deep Research — Open Questions

## Open

### Q-01 — Storage backend for the event store

SQLite (via `bun:sqlite`, single-file, Bun-native, zero deps) vs Postgres (AI-Q's choice, requires a running daemon). The own-engine directive and the Bun runtime preference both point to SQLite, but a long-running job that survives across machines (e.g. a server deployment of ralphy) wants something networked. **Likely SQLite for v1**, defer Postgres until a user actually asks. Decide at Stage 2.

### Q-02 — Graph / state-machine library

Hand-rolled TypeScript FSM (no dep, Bun-friendly, matches "own engine" directive) vs LangGraph (Python, ecosystem fit, would force a Python sidecar in the binary). **Hand-rolled is the strong default** — adding a Python runtime to the ralphy install for one piece of orchestration is the wrong trade. Decide at Stage 2 when the role boundaries are concrete.

### Q-03 — Headless browser

Playwright (already in deps via HyperFrames, heavy but reproducible) vs `puppeteer-core` against the user's existing Chrome (lighter install, less reproducible across machines). Decide at Stage 3 once we have a working DDG-HTML retriever and have signal on what % of niche queries actually need browser execution.

### Q-04 — Search backend fallback chain

DuckDuckGo HTML primary (Stage 1) — no key, but rate-limited and CAPTCHA-prone. SearXNG self-hostable as documented fallback. Escape hatch: document how users with a Tavily / Serper / Exa key can plug them in, but the default path must remain keyless per the own-engine directive. Open: do we ship a SearXNG `docker run` recipe in the install docs, or wait for the first user who hits DDG rate limits?

### Q-05 — Fate of the legacy `ralphy research <topic>` surface

Two paths: (a) deprecate at end of Stage 2 once the new CLI verbs reach feature parity, then delete in a follow-up; (b) evolve the existing skill into a thin client like AI-Q's SKILL.md, shrinking its body to a routing index plus `ralphy research submit`. **Probably (b)** — the existing `workspace/research/<topic>/` artifacts map naturally to the new source registry, and a hard deprecation breaks any user currently running the shallow workflow. Decide once Stage 2 lands.

## Resolved

### D-01 — Own engine, no paid keys (2026-05-24, user directive)

The verifier, retrievers, and job manager must operate with `OPENROUTER_API_KEY` + `ELEVENLABS_API_KEY` only. Allowed: `yt-dlp`, headless Playwright, public RSS / JSON endpoints, free search APIs without enterprise contracts (DuckDuckGo HTML, SearXNG self-hostable). Banned at MVP: Apify, RapidAPI, Bright Data, ScrapingBee, Tavily / Serper / Exa paid tiers. Rationale: matches AGENTS.md invariant #2 ("ralphy is the only entry-point") + removes per-query cost ceiling + sidesteps ToS surprises from third-party SaaS.

### D-02 — Hardest-first ordering: verifier before everything else (2026-05-25)

Stage 1 starts with the deterministic citation verifier and an append-only source registry, on top of a single-agent ReAct loop. Rationale: if the verifier doesn't hit ≥97% citation resolution on the eval set, no amount of orchestration around it adds quality — it amplifies hallucinations. The architecture survey at [`docs/research/deep-research-architecture-foundations.md`](../../docs/research/deep-research-architecture-foundations.md) §6 documents the same conclusion across NVIDIA AI-Q, Anthropic CitationAgent, and STORM.
