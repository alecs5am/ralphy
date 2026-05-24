# Foundational Architecture Guide: Deep-Research Agent Skills

**Bottom line up front:** A production-quality deep-research skill is best built as the **NVIDIA AI-Q shape** — an async, server-side, two-tier router (intent classifier → clarifier → shallow researcher → deep researcher) backed by an event store and exposed to harnesses via a thin SKILL.md client. This pattern dominates because it externalizes long-horizon state out of the harness, lets you swap retrievers via MCP, and is the only one of the surveyed shapes that produced a verified #1 result on DeepResearch Bench (NVIDIA AI-Q's reported RACE 55.95). Everything below is the menu of patterns, named instantiations, and failure modes you'll trade off against when you vibe-tune for your own domain.

## TL;DR
- **Pick one topology only at the orchestrator layer.** Production deep-research systems converge on supervisor + parallel subagents for breadth, or a single ReAct loop with a strong reasoning model for depth. Hybridizing them inside one process is the most common open-source anti-pattern.
- **Treat the research backend as an async job, not a chat turn.** Job-id + status + state + report + SSE stream (the AI-Q model) is the minimum viable state contract; anything less makes resume, observability, and harness portability painful.
- **Citations are the only quality signal that survives 10k-token outputs.** Build a deterministic post-hoc citation verifier against a source registry — Rao, Wong & Callison-Burch (arXiv 2604.03173) measured that "3–13% of citation URLs are hallucinated — they have no record in the Wayback Machine and likely never existed — while 5–18% are non-resolving overall," even on frontier deep-research agents.

---

## 1. Topology

**Canonical pattern.** Five shapes recur: (a) **single-agent ReAct loop** with a strong reasoning model; (b) **planner + parallel workers** (fan-out / fan-in with a publisher); (c) **supervisor + subagents** (orchestrator-worker with delegation, shared filesystem, condensed returns); (d) **DAG of specialists** (typed nodes with conditional edges, e.g., LangGraph state machines); (e) **iterative reflection loops** (Reflexion / CRITIC / SELF-REFINE — research → critique → re-research). Single-agent ReAct wins for narrow depth-first questions on a frontier reasoning model. Planner+workers wins for embarrassingly parallel breadth queries. Supervisor+subagents wins when subtasks need independent context windows. The DAG wins when you need testable routing and resume-after-failure semantics. Reflection wins only when the cost of a wrong answer dominates latency.

NVIDIA's four-role split (intent_classifier / clarifier / shallow_researcher / deep_researcher) is best understood as a **two-tier router on top of a DAG**: it buys you fast paths for queries that don't need deep research, a human-in-the-loop gate before burning the deep budget, and per-role prompt/eval surfaces, all without committing to multi-agent overhead on every query. The shallow-research escalation to deep is gated on keyword heuristics ("unable to find", "need more research") in the last 800 chars of the response.

**Named instantiations.**
- **OpenAI Deep Research (o3-deep-research)** — single-agent ReAct loop ("Plan-Act-Observe") trained end-to-end with reinforcement learning on browsing and reasoning tasks; the agent itself does the planning. https://openai.com/index/introducing-deep-research/
- **Anthropic Research (Claude)** — orchestrator-worker with a LeadResearcher, parallel subagents writing to a shared filesystem with condensed returns, plus a CitationAgent. Claude Opus 4 lead + Sonnet 4 workers reported as outperforming a single Opus 4 by 90.2% on Anthropic's internal eval. https://www.anthropic.com/engineering/multi-agent-research-system
- **NVIDIA AI-Q v2** — DAG (LangGraph state machine) with a four-role split and LangGraph checkpointing for resume. https://github.com/NVIDIA-AI-Blueprints/aiq/tree/2.0.0
- **Tongyi DeepResearch (Alibaba, Qwen3-30B-A3B base)** — explicitly a single-agent ReAct loop with an optional "IterResearch Heavy mode" that runs *n* parallel agents and synthesizes; the authors justify the choice with "The Bitter Lesson." Reports BrowseComp 43.4 (Heavy: 58.3), HLE 32.9 (Heavy: 38.3), GAIA 70.9, FRAMES 90.6. https://arxiv.org/abs/2510.24701

**Failure mode.** The most common mistake is fusing topologies: a "supervisor" that also does retrieval, a "planner" that also synthesizes, or a "critic" sharing a context window with the generator. Anthropic documented early agents "spawning 50 subagents for simple queries, scouring the web endlessly for nonexistent sources, and distracting each other with excessive updates." Multi-Agent Reflexion adds roughly 3x API calls and latency over single-agent Reflexion, and Anthropic measured that "multi-agent systems use about 15× more tokens than chats" — economically only justified when the answer is high-value.

---

## 2. Intent Classification + Routing

**Canonical pattern.** Three layers: (i) **user-explicit** ("Deep Research" mode toggle in ChatGPT, Perplexity, Gemini); (ii) **single-call LLM classifier** that emits both intent (meta vs research) and depth (shallow vs deep) in one JSON shape; (iii) **post-hoc escalation** when shallow output looks weak. The signals that matter: query length, presence of multi-hop entities, presence of comparison/aggregation words, time-bound phrasing, and user history. Heuristic classifiers under-route; LLM classifiers over-route to deep on edge cases. The hybrid (user-explicit override + LLM classifier + escalation) is what production systems converge on.

**Named instantiations.**
- **NVIDIA AI-Q intent_classifier node** — single Nemotron-Nano LLM call returns `IntentResult(intent=meta|research)` and `DepthDecision(decision=shallow|deep)` in one shot to minimize latency. Mis-routes are caught by the `should_escalate` edge that escalates shallow→clarifier→deep when "unable to find" / "need more research" appear in the last 800 chars. https://docs.nvidia.com/aiq-blueprint/2.0.0/architecture/agents/intent-classifier.html
- **Perplexity** — explicit "Research" mode selector in the UI; runs 3–5 sequential search passes vs. the default 1–3-pass grounding. No LLM-based routing visible to the user.
- **LangChain Open Deep Research** — separate `clarify_with_user` node ahead of `write_research_brief`; routing is implicit via the brief, not an explicit classifier.

**Failure mode.** Heuristic routing alone (keyword count, query length) under-routes complex queries that read short. LLM routing alone has a measurable "cry wolf" rate — the TRAP benchmark (Cohen et al., arXiv 2512.23128) reports that "across six frontier models, agents are susceptible to prompt injection in 25% of tasks on average (13% for GPT-5 to 43% for DeepSeek-R1)," which lower-bounds how often a routing classifier can be talked into the wrong path by injected content. The clean fix is escalation as a first-class state transition, not retry-in-place: AI-Q's `should_escalate` edge sends shallow output to the *clarifier* (not directly to deep), so the user reviews a plan before the long-horizon job starts.

---

## 3. Clarification Loop

**Canonical pattern.** Run clarification **once, before the plan, with a hard cap of one round** in production. Contract: clarifier emits either a confirmed brief (a Markdown spec the deep researcher consumes verbatim) or a list of bounded questions (≤3, each with default answers). The downstream researcher treats the brief as immutable input; it does *not* re-clarify mid-flight. To avoid ping-pong, the clarifier must (a) have access to a "default answer" model so it can answer its own questions when the user declines, (b) be gated behind a config flag (`enable_clarifier: false` is a valid production setting for trusted callers like a CI job).

**Named instantiations.**
- **LangChain Open Deep Research** — two-step scoping pipeline: `clarify_with_user` followed by `write_research_brief`. Explicitly motivated by "OpenAI has made the point that users rarely provide sufficient context." https://www.langchain.com/blog/open-deep-research
- **Gemini Deep Research "collaborative planning"** — agent emits a plan; user can edit it before execution starts. https://blog.google/innovation-and-ai/models-and-research/gemini-models/next-generation-gemini-deep-research/
- **NVIDIA AI-Q clarifier** — interactive clarification dialog for deep queries only; can be disabled or run in skip-plan-approval mode. https://docs.nvidia.com/aiq-blueprint/2.0.0/resources/faq.html

**Failure mode.** Clarifiers that lack a defaulting policy ping-pong forever on partial answers. The second common failure: a clarifier that asks questions the downstream researcher then ignores. Fix: the brief produced by the clarifier should be the *only* input the deep researcher receives — if it's not in the brief, the deep researcher must not assume it.

---

## 4. Planning

**Canonical pattern.** Three options on a spectrum: **static plan up front** (markdown checklist or JSON tree, written once, executed sequentially or in parallel), **replanning** (plan is regenerated after each phase based on findings), and **implicit/ReAct** (no explicit plan; each step decides the next tool). The 2025–2026 production consensus has shifted toward static-plan-with-bounded-replanning: a top-level plan persisted to durable memory + bounded iteration loops that can revise sub-plans but not the top-level brief. Plan progress on long horizons (hours, hundreds of LLM calls) is tracked by externalizing the plan to a *file* (Anthropic's shared filesystem pattern) or to checkpointed graph state (LangGraph's `checkpoints` table); the lead agent's context window is *not* the source of truth.

**Named instantiations.**
- **Anthropic LeadResearcher** — writes plan to Memory before context fills, because "if the context window exceeds 200,000 tokens it will be truncated and it is important to retain the plan." Subagents write findings to a shared filesystem and return lightweight references. https://www.anthropic.com/engineering/multi-agent-research-system
- **GPT-Researcher** — strict planner→executor→publisher: `plan_research()` produces sub-queries, parallel `_process_sub_query()` calls retrieve, publisher synthesizes. Static plan, no replanning. https://github.com/assafelovic/gpt-researcher
- **Gemini Deep Research** — "novel asynchronous task manager that maintains a shared state between the planner and task models, allowing for graceful error recovery without restarting the entire task." Replans implicitly through the state machine. https://gemini.google/overview/deep-research/

**Failure mode.** Pure ReAct loses the plot past ~50 steps; the agent forgets early findings and revisits the same sources. Pure static planning fails when the source landscape contradicts the plan and the agent has no mechanism to revise. Both fail when the plan lives only in the rolling context window — the canonical fix is externalization to memory/disk plus a checkpoint store.

---

## 5. Retrieval Layer

**Canonical pattern.** A pluggable function registry with three retriever classes: (i) **web search + scrape** (Tavily, Serper, Exa, SerpAPI + a markdown extractor); (ii) **structured APIs** (arXiv, PubMed, GitHub, vendor APIs); (iii) **RAG over private corpus** (vector store + metadata filters). The agent decides which to call by tool description + a per-query "data_sources" filter the orchestrator passes down. The retriever should always return: (text, source_url, retrieval_timestamp, score) — agents that lose any of those fields will hallucinate citations downstream.

NVIDIA's MCP function group pattern buys you three things over hardcoded tools: **(a) deployment-time pluggability** (swap retrievers without code changes via YAML), **(b) auth delegation** (the same MCP server handles unauthenticated calls, service-account OAuth2, and per-user bearer tokens via the three patterns documented in AI-Q v2.1), and **(c) catalog discovery** — the agent sees the tool list as discovered at runtime, not compiled in. The cost is one extra hop and the requirement that retrievers speak MCP. https://developer.nvidia.com/blog/add-a-specialized-deep-research-skill-to-agent-harnesses/

**Named instantiations.**
- **OpenAI o3-deep-research API** — accepts web search, file search over vector stores, and remote MCP servers as the canonical retriever set. https://platform.openai.com/docs/guides/deep-research
- **LangChain Open Deep Research** — `SearchAPI` enum with Tavily / Perplexity / Exa / arXiv / PubMed / DuckDuckGo / GoogleSearch built in; MCP servers via `mcp_config`. https://github.com/langchain-ai/open_deep_research
- **GPT-Researcher MCP integration** — accepts MCP server configs at agent construction time; `mcp_strategy` is `fast | deep | disabled`.

**Failure mode.** The two most damaging retrieval bugs are: (1) **silent failure** — the scraper returns empty or 403 and the agent treats it as "no relevant info" rather than as a tool error, which makes the synthesis confidently wrong; and (2) **scraped content treated as instructions** — prompt injection from web pages, indirect injection through MCP, and PDF metadata fields. The *Deep Research Brings Deeper Harm* paper (arXiv 2510.11851) found that DR agents bypass refusals more easily than chat LLMs when malicious content is framed academically, and the TRAP web-agent benchmark reports that "across six frontier models, agents are susceptible to prompt injection in 25% of tasks on average (13% for GPT-5 to 43% for DeepSeek-R1)" (arXiv 2512.23128). Fix: treat all retrieved content as untrusted data, never as instructions; quote-wrap and label it `<retrieved_content>` in the prompt; run an MCP-boundary input filter.

---

## 6. Synthesis + Citation

**Canonical pattern.** The only pattern that survives at scale is **source-grounded generation followed by a deterministic post-hoc citation verifier**. Architecture: (a) every retrieval writes to a *source registry* keyed by URL with retrieved text snapshot; (b) the synthesis model is prompted to cite by URL inline; (c) a non-LLM verifier (regex + URL liveness check + text-match against the registry) rejects citations whose URLs aren't in the registry or whose claimed quote doesn't substring-match the snapshot. The verifier's behaviour on rejection is the design choice that matters most: AI-Q v2 uses "a five-level matching strategy (exact, truncation, prefix, child-path, query-subset)" against an explicit `source registry of actually-retrieved URLs`, and on failure flags the citation rather than re-prompting the LLM, because re-prompting often makes the hallucination worse.

**Named instantiations.**
- **NVIDIA AI-Q v2 deterministic citation verification pipeline** — "Every research response (shallow and deep) passes through post-processing that validates all citations against a source registry of actually-retrieved URLs using a five-level matching strategy." https://github.com/NVIDIA-AI-Blueprints/aiq/releases
- **Anthropic CitationAgent** — separate final-stage agent that "processes the documents and research report to identify specific locations for citations" before the user sees output.
- **STORM (Stanford OVAL)** — outline-driven RAG; section-by-section generation each grounded in a fixed retrieval set, with one-shot examples for citation formatting because "weak models are bad at generating text with citations." https://github.com/stanford-oval/storm

**Failure mode.** The single most common silent failure is **citation hallucination** — the model writes a plausible URL that was never retrieved. Rao, Wong & Callison-Burch's audit of 10 commercial models and DR agents on DRBench (53,090 URLs) and ExpertQA (168,021 URLs) reports that "3–13% of citation URLs are hallucinated — they have no record in the Wayback Machine and likely never existed — while 5–18% are non-resolving overall. Deep research agents generate substantially more citations per query than search-augmented LLMs but hallucinate URLs at higher rates" (arXiv 2604.03173). The same paper shows that equipping the agent with a URL liveness tool reduces non-resolving citations 6–79× to under 1%. **Per-claim footnotes generated by the LLM without a registry check should be considered unverified.**

---

## 7. Async + State Model

**Canonical pattern.** The minimum viable state model for a resumable long-horizon job is the AI-Q shape: **{ `job_id`, `status`, `state`, `report`, SSE event stream }**. `status` is a finite state machine `SUBMITTED → RUNNING → SUCCESS | FAILURE | INTERRUPTED`; `state` carries accumulated tool calls, outputs, and source citations; `report` is the final markdown; the SSE stream emits intermediate events for live UX and supports reconnection-with-replay from any `last_event_id`. The split between the event store (append-only, per-event-id) and the final report (one blob) matters because the event store is the durable execution log used for resume — agent execution writes to it as it goes, and re-attaching a client replays from a checkpoint.

What goes in the event store: LLM tokens, tool calls, tool outputs, artifacts, citations, status transitions. What goes in the final report: the synthesized markdown plus the *cited* subset of the sources registry. Keep them separate; the event store is observational, the report is the product.

**Named instantiations.**
- **NVIDIA AI-Q async API** — `POST /v1/jobs/async/submit` returns `{job_id, status}`; `GET /jobs/{id}/stream` returns SSE; `GET /jobs/{id}/state` returns tool calls/outputs/sources; `GET /jobs/{id}/report` returns the final markdown. LangGraph checkpoints + Dask workers + PostgreSQL job store/event store. SSE reconnect replays from `last_event_id` in batches up to 10,000. https://docs.nvidia.com/aiq-blueprint/2.0.0/integration/rest-api.html
- **OpenAI Deep Research via Responses API** — webhooks for completion notification, `background=true` for async execution.
- **Gemini Deep Research Interactions API** — explicitly async (`background=true`, `store=true`); described as "truly asynchronous: you can hop to a different app or quite literally turn off your computer after starting a Deep Research project."

**Failure mode.** Systems that try to keep the entire long-horizon state in the LLM's rolling context window fail at the 200K-token boundary (Anthropic explicitly documents this and externalizes plan to memory). Systems that lack an event store have no observability — when a 30-minute job dies at minute 27, you can't tell where without a trace. Systems that lack checkpointing must restart from zero; Gemini explicitly called this out as a motivation for their async task manager.

---

## 8. Model Routing & Cost

**Canonical pattern.** Three-tier model stack used selectively: **(a) cheap fast model** (e.g., Nemotron-Nano-30B-A3B, Claude Haiku, gpt-4.1-mini) for intent classification, citation matching, summarization of scraped pages; **(b) reasoning model** (o3, Gemini 2.5 Pro, Claude Opus, Nemotron-Super) for planning and synthesis; **(c) frontier router** that can call the most capable model only when escalation criteria are met. Per-step budget is enforced by hard caps in the orchestrator: AI-Q uses `max_llm_turns: 10` and `max_tool_iterations: 5` for shallow, `max_loops: 2` for deep; Anthropic's effort-scaling rule is "simple fact-finding requires just 1 agent with 3-10 tool calls, direct comparisons might need 2-4 subagents with 10-15 calls each, and complex research might use more than 10 subagents with clearly divided responsibilities."

Runaway cost prevention works at four layers: (1) hard turn/tool-call caps per agent; (2) per-job token budget enforced by the orchestrator; (3) intent routing so cheap queries never reach the expensive path; (4) shortcut caching of identical sub-queries within a job. RouteLLM (Ong et al., ICLR 2025) reports that routing 86% of queries to cheaper models achieves 95% of GPT-4 performance with "cost reductions of over 85% on MT Bench, 45% on MMLU, and 35% on GSM8K as compared to using only GPT-4" (https://lmsys.org/blog/2024-07-01-routellm/).

**Named instantiations.**
- **NVIDIA AI-Q hybrid model approach** — "Nemotron reasoning models handle planning and synthesis, while a configurable frontier-model router can be used for tasks that need additional capability." https://developer.nvidia.com/blog/add-a-specialized-deep-research-skill-to-agent-harnesses/
- **Anthropic Research** — Opus 4 lead + Sonnet 4 subagents was the production setting; the team documented that "token usage by itself explains 80% of the variance" in BrowseComp performance.
- **Microsoft Foundry Model Router** — trained model dispatches across 18 underlying LLMs per prompt; integrated into Foundry Agent Service for per-turn routing.

**Failure mode.** Running every step through a frontier model is the most common way teams overspend; a typical agent session does 50–200 LLM calls and 60% of them are easy enough for a cheap model. The opposite failure: routing too aggressively to a cheap model breaks planning quality silently — cheap models are bad at generating text with citations (STORM explicitly notes this) and produce subtle drift in long-horizon plans. Always reserve a reasoning-grade model for plan generation and final synthesis.

---

## 9. Critic / Reflection

**Canonical pattern.** Self-critique loops (Reflexion, CRITIC, SELF-REFINE, LATS) improve output when (a) there is a *strong external signal* the critic can use (a unit test, a citation registry, a regex, a typed-output validator) and (b) the failure mode is *localized* (a specific bad citation, a wrong number) rather than "everything is vibe-wrong." Naked self-critique with the same model and same context window often *degrades* outputs: CRITIC's own error analysis reports a 14.3% wrong-correction rate, and the original Reflexion paper (Shinn et al., arXiv 2303.11366) explicitly notes that "the false positive test execution rate for MBPP Python is 16.3% while the rate for HumanEval Python is a mere 1.4%." "Good enough to stop" is decided by either a verifier signal (citations all resolve, plan checklist all green) or a hard iteration cap (max 2 reflection cycles in production).

Two cycles is the practical ceiling; beyond that you're paying linearly for diminishing returns and risk regressions. Multi-Agent Reflexion (separate critic persona) reduces "yes-man" bias but adds ~3x latency and cost.

**Named instantiations.**
- **GPT-Researcher Deep Research mode** — tree-like recursive exploration with configurable depth/breadth; reflection is implicit in the recursion.
- **LangChain Open Deep Research supervisor** — "supervisor reasons about whether the findings from the sub-agents sufficiently address the scope of work in the brief" — explicit good-enough-to-stop decision.
- **Reflexion (Shinn et al., arXiv 2303.11366)** — the academic baseline; verbal-RL critique persisted to memory; mostly outperformed in deep-research contexts by tool-backed critics (the citation verifier is the tool-backed critic for our domain).

**Failure mode.** Critic loops fail in two characteristic ways: (1) "everything looks good" — the critic generates generic feedback that misses the real error (LATS noted this); (2) over-correction — the critic flags correct content as wrong and the agent regenerates a worse version. The fix is to gate critique on a deterministic signal (failing test, failing citation match) rather than asking the LLM to self-grade.

---

## 10. Evaluation

**Canonical pattern.** Two benchmark families, used together: **(a) closed-form factuality benchmarks** (BrowseComp 1,266 hard-to-find questions, BrowseComp-Plus with fixed corpora, GAIA across difficulty levels, SimpleQA, FRAMES with 824 multi-hop questions, FreshQA for recency) — these score whether the agent found the right entity/number; **(b) long-form report benchmarks** (DeepResearch Bench's RACE metric with 100 PhD-level tasks across 22 fields, FACT for citation accuracy, DeepResearch Bench II's rubric-based diagnosis, DeepScholar-Bench, Humanity's Last Exam) — these score report quality. RACE is LLM-as-judge (Gemini-2.5-Pro originally, switched to GPT-5.5 on 11 May 2026 per the repo news log) against expert-written golden reports.

Top reported scores (DeepResearch Bench RACE Overall, March 2026 snapshot from the repo news log): NVIDIA AI-Q 55.95 (claimed #1 per NVIDIA's own HF blog), Xiaoyi DeepResearch 55.13, CellCog 54.65, Onyx Deep Research 54.54 (open-source, MIT), Bodhi Deep Research 54.22; the Qianfan-DeepResearch-Bench README snapshot shows Tavily Research 52.44, Gemini 2.5 Pro Deep Research 49.71, OpenAI Deep Research 46.45, Claude Researcher 45.00. Tongyi DeepResearch (Alibaba, arXiv 2510.24701) reports BrowseComp 43.4 (Heavy mode 58.3), HLE 32.9, GAIA 70.9, FRAMES 90.6.

**What leaderboards reward vs. miss.** Reward: breadth of retrieval, citation count, structural coherence. Miss: source quality (an agent that cites SEO content farms over PubMed scores the same), factual correctness on unverifiable claims, prompt injection robustness, and resume/error-recovery behavior — none of these are in the public benchmark suite. Anthropic explicitly noted "human testers noticed that our early agents consistently chose SEO-optimized content farms over authoritative but less highly-ranked sources" — pure benchmark scores would not have caught this.

**Named instantiations.**
- **DeepResearch Bench** — 100 PhD-level tasks across 22 fields, RACE (rubric) + FACT (citation) metrics. https://github.com/Ayanami0730/deep_research_bench
- **BrowseComp (OpenAI, Apr 2025)** — 1,266 questions requiring persistent navigation. https://leaderboard.steel.dev/registry/benchmarks/browsecomp
- **FRAMES (Google + Harvard, arXiv 2409.12941)** — 824 multi-hop questions; multi-step retrieval lifts accuracy from 40.8% to 66%.
- **GAIA, Humanity's Last Exam, SimpleQA, FreshQA** — closed-form factuality benchmarks used across all major DR systems.

**Failure mode.** Optimizing only for benchmark score produces agents that game RACE rubrics (write longer reports, cite more URLs) without improving real-world utility. The fix is to pair public benchmarks with a private eval set drawn from your actual use case and to track citation resolution rate as a guardrail metric.

---

## 11. Harness Integration

**Canonical pattern.** Four options for how a "deep research" capability is exposed to a host environment: (1) **in-process agent library** (Python import, e.g., `from deepagents import create_deep_agent` or `GPTResearcher(...)`); (2) **MCP server** (the agent is just another MCP tool the harness's planner can call); (3) **separate CLI binary** (smolagents open_deep_research style); (4) **hosted API + thin client skill** (NVIDIA AI-Q SKILL.md wrapping a FastAPI server, OpenAI's Responses API). Trade-offs: in-process is fastest and cheapest but couples the harness to the research stack and to its dependencies; MCP server is the most portable but adds a hop and forces every tool to speak MCP; CLI binary is great for reproducibility and worst for interactive UX; hosted API + skill is the most modular and best for regulated environments because data never leaves the governed boundary.

The SKILL.md pattern (Anthropic's open Agent Skills standard) is "folders of instructions, scripts, and resources that Claude loads dynamically" with YAML frontmatter (name + description) and progressive disclosure — metadata is preloaded, body is loaded on demand. AI-Q's twist is that the skill is a **thin client** to a remote server: SKILL.md tells the harness how to use the AI-Q server; `scripts/aiq.py` handles routed `/chat` requests and async deep-research job lifecycle. This separation lets sensitive sources stay inside the enterprise and lets the harness be agnostic to model choice, retrievers, and compute placement.

**Named instantiations.**
- **NVIDIA AI-Q skill** — SKILL.md + `scripts/aiq.py` helper; works in Claude Code (`.claude/skills/`), Codex (`<codex-skills-dir>`), and OpenCode (`~/.config/opencode/skills/`). https://github.com/NVIDIA-AI-Blueprints/aiq/blob/develop/docs/source/integration/agent-skills.md
- **Anthropic Agent Skills standard** — open spec, ports across Claude Code, Cursor, Gemini CLI, Codex CLI. https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills
- **Deep Agents (LangChain)** — opinionated in-process harness; trades portability for batteries-included planning/subagents/filesystem.
- **OpenAI o3-deep-research API** — hosted; `background=true` returns a polled job. https://platform.openai.com/docs/guides/deep-research

**Failure mode.** In-process integration becomes a maintenance trap as the research stack grows (dependency conflicts, model-version coupling). Pure MCP-only deep research is currently underpowered because MCP doesn't have a first-class async-job primitive — long-running jobs over MCP are awkward. Hybrid (MCP for tools + REST API for the long-running job + SKILL.md for the client) is the production sweet spot.

---

## 12. What the Open-Source Field Gets Wrong

A non-exhaustive list of anti-patterns visible in popular OSS deep-research repos in 2025–2026:

1. **Plan in context window only.** Plans that aren't persisted to a file or checkpoint die at the 200K-token boundary; long jobs revisit the same sources.
2. **Citation-by-LLM-prompt.** Asking the synthesis model to "cite your sources" without a registry check produces 3–13% hallucinated URLs even on frontier systems (Rao et al., arXiv 2604.03173).
3. **Treating scraped HTML as plain text.** OWASP's 2025 LLM Top 10 ranks "LLM01:2025 Prompt Injection" (covering both direct and indirect variants) as the #1 risk (https://genai.owasp.org/llmrisk/llm01-prompt-injection/), and DR agents are *more* susceptible than chat models because academic framing bypasses alignment. No quote-wrapping = silent compromise.
4. **Planner/executor desync.** GPT-Researcher–style architectures where the planner emits sub-queries the executor can't actually answer (because tools were removed at runtime). Always validate the toolset is non-empty before plan generation.
5. **Unbounded subagent fan-out.** Anthropic's "spawning 50 subagents for simple queries" is real; without an effort-scaling rule in the prompt and a hard `max_subagents` cap, supervisors over-fan.
6. **Reflection loops with no exit condition.** Self-critique without a deterministic stop signal can loop indefinitely; CRITIC's 14.3% wrong-correction rate means many "fixes" make things worse, and Reflexion reports 16.3% false-positive rate on MBPP (Shinn et al., arXiv 2303.11366).
7. **Cheap model on synthesis.** STORM's explicit finding: "weak models are bad at generating text with citations." The cost saved on synthesis is paid back tenfold in re-runs.
8. **Shared context window across roles.** Critic-and-generator in the same window inherits the same blind spots; separate context windows are the only reliable fix.
9. **No event store.** When a 30-minute job dies, no resume, no debug.
10. **Tool descriptions written for humans, not agents.** Anthropic: "An agent searching the web for context that only exists in Slack is doomed from the start." Tool docs are part of the prompt and need their own eval.

What to copy: AI-Q's deterministic citation verifier, Anthropic's shared-filesystem-for-subagent-results pattern, LangGraph's checkpointing, GPT-Researcher's strict planner/executor separation, STORM's perspective-driven outline. What not to copy: any repo that synthesizes citations from the LLM's own output, any harness that lacks a hard turn cap, any "deep research" that runs in <30s (it's not deep).

---

## Minimum-Viable Deep-Research Architecture

**Recommended shape: NVIDIA AI-Q–style two-tier router as an async service, exposed via SKILL.md.** Why this shape: it has the highest reported DeepResearch Bench score (55.95 RACE, per NVIDIA's HF blog), it cleanly separates the harness from the research backend (critical for swapping retrievers later — your UGC video sources just become more `mcp_client` function groups), it's resumable, and the four-role split lets you tune intent/clarifier/shallow/deep independently without entangling their prompts. The alternative — Anthropic's orchestrator-worker — is excellent for breadth-first research but is harder to wire into a harness and Anthropic measured it as "about 15× more tokens than chats"; choose it only if you specifically need parallel subagent exploration and have the budget.

### The 10 components you build

1. **Intent classifier** — single fast-model LLM call returning `{intent: meta|research, depth: shallow|deep}` as JSON. Hard timeout 90s.
2. **Clarifier (optional, gated by config flag)** — produces an immutable research brief; max one round; defaults its own questions if the user declines.
3. **Shallow researcher** — bounded tool-calling loop, `max_llm_turns: 10`, `max_tool_iterations: 5`, returns cited markdown answer.
4. **Deep researcher** — planner + iteration loops, plan persisted to checkpoint storage, `max_loops: 2`. Reasoning-grade model for plan + synthesis, cheap model for per-page summarization.
5. **Pluggable retriever interface** — MCP function group abstraction. Every retriever returns `(text, source_url, retrieved_at, score)`. Initial implementations: web-search-and-scrape, structured-API, local-RAG. Domain-specific retrievers (UGC video platforms, internal corpora, anything else) plug in here without any changes upstream.
6. **Source registry** — append-only store of every URL/document the retrievers actually fetched, keyed by URL, with the retrieved text snapshot. The source of truth for citation verification.
7. **Deterministic citation verifier** — non-LLM post-processor that matches every cited URL against the registry using exact/truncation/prefix/child-path/query-subset matching; flags unmatched citations rather than re-prompting.
8. **Async job manager** — FastAPI `POST /jobs/async/submit` → returns `{job_id}`; `GET /jobs/{id}/stream` SSE with reconnect-from-last-event-id; `GET /jobs/{id}/state` for accumulated tool calls and sources; `GET /jobs/{id}/report` for the final markdown. Backed by PostgreSQL job + event stores; LangGraph checkpoint store for graph state.
9. **Model router** — cheap model for classification/summarization, reasoning model for planning/synthesis, optional frontier router for escalation. Per-step turn caps enforced in the orchestrator.
10. **SKILL.md client + harness adapter** — thin Markdown spec + Python helper that submits jobs, polls/streams, and returns the cited report. Drops into Claude Code, Codex, OpenCode without modification.

**Two more if you can afford them:**

11. **Prompt-injection input filter** at the MCP boundary — strips/labels scraped content; treats all retrieved text as untrusted data wrapped in `<retrieved_content>` tags.
12. **Eval harness** — DeepResearch Bench + a private eval set drawn from your domain, with citation resolution rate as a guardrail metric.

---

## Recommendations

**Stage 1 (days 1–7): Get a single-agent ReAct + citation verifier running locally.** Use LangGraph for the state machine, Tavily for web search, gpt-4.1 or Nemotron-Super for synthesis. Build the source registry and the deterministic verifier *first*. Benchmark: citation resolution rate ≥97% on 20 hand-picked queries. If you can't hit that, stop and fix the verifier before adding complexity.

**Stage 2 (days 8–21): Add the four-role split + async job manager.** Wrap the deep researcher in a FastAPI server with `/jobs/async/*` endpoints; add intent classifier + clarifier as upstream LangGraph nodes; add the shallow researcher as a fast path. Benchmark: shallow path p50 < 10s, deep path checkpoints survive a SIGKILL.

**Stage 3 (days 22–35): Add MCP for retrievers and SKILL.md for harness integration.** Make all three retriever classes go through `mcp_client` function groups. Write a SKILL.md that submits jobs and polls. Test in Claude Code and Codex.

**Stage 4 (days 36–60): Vibe-tune for your domain.** Plug in domain-specific retrievers as additional MCP servers — no changes to the orchestrator. Add a domain-private eval set. Tune the intent classifier prompt on your traffic.

**Thresholds that change the recommendation:**
- If citation resolution rate < 95% after Stage 1, you have a synthesis-prompt or retriever-snapshot bug — stop and fix; do not move on.
- If shallow path p50 > 20s, the intent classifier is probably misrouting — review routing accuracy on a 100-query labeled set.
- If per-query cost > $0.50 average, model router thresholds are wrong — too many queries reach the frontier model.
- If you measure prompt-injection success rate > 5% on a domain-specific red team, harden the MCP-boundary input filter before scaling.

---

## Caveats

- DeepResearch Bench rankings shift weekly; the top-5 cluster sits at 54–56 RACE as of March 2026 but exact ordering changed at least four times between February and March 2026. NVIDIA's #1 claim ("NVIDIA AI-Q deep research agent recently achieved first place on both DeepResearch Bench (55.95) and DeepResearch Bench II (54.50)") is from their own HF blog and is vendor-authored, though it is corroborated by the leaderboard.
- Anthropic's "90.2% improvement" is an internal eval, not an external benchmark — treat it as directional, not definitive.
- Some primary blog posts (Perplexity, Skywork on OpenAI o3) describe architectures at a high level only; details of routing internals are not public. Perplexity's "test-time compute expansion" wording in particular comes from secondary writeups, not a primary blog post.
- The MCP-as-data-source pattern is rapidly evolving; AI-Q's three auth patterns (no-auth, service account, user bearer-token forwarding) are current-best-practice but the in-worker token refresh story is acknowledged as still in development.
- Prompt-injection mitigations against agentic browsers are an active arms race; Cohen et al. ("In-Browser LLM-Guided Fuzzing for Real-Time Prompt Injection Testing in Agentic AI Browsers," arXiv 2510.13543) report that "by the 10th fuzzing iteration, even the best-performing tools fail in 58-74% of cases as the LLM learns to generate sophisticated mutations" — assume defenses are partial.
- Tongyi DeepResearch's "outperforming OpenAI-o3 and Deepseek-V3.1" claim is from the authors' own paper using their own benchmark setup; replication on the live DeepResearch Bench is pending as of the repo's Nov 22, 2025 news entry.

---

## What to Read Next

Ranked by signal density for an engineer building this:

1. **NVIDIA AI-Q v2.0.0 release notes and architecture overview** — the most operationally detailed open blueprint; intent classifier, async job model, deterministic citation verifier all documented. https://github.com/NVIDIA-AI-Blueprints/aiq/releases and https://docs.nvidia.com/aiq-blueprint/2.0.0/architecture/data-flow.html
2. **Anthropic "How we built our multi-agent research system"** — the canonical primary source for orchestrator-worker, effort-scaling rules, and prompt-engineering principles. https://www.anthropic.com/engineering/multi-agent-research-system
3. **Tongyi DeepResearch paper (arXiv 2510.24701)** — the most rigorous published case for "ReAct + scale" over multi-agent, with full training recipe (Agentic CPT → SFT → GRPO RL) and benchmark tables.
4. **LangChain Open Deep Research blog + repo** — production-grade reference implementation with clarifier + supervisor + sub-agents on LangGraph. https://www.langchain.com/blog/open-deep-research
5. **OpenAI "Introducing Deep Research"** + system card — describes the end-to-end RL training recipe and the ReAct loop architecture. https://openai.com/index/introducing-deep-research/ and https://cdn.openai.com/deep-research-system-card.pdf
6. **Google DeepMind "Gemini Deep Research" overview** — the async task-manager argument and the planner/task-model state split. https://gemini.google/overview/deep-research/
7. **Rao, Wong & Callison-Burch, "Detecting and Correcting Reference Hallucinations in Commercial LLMs and Deep Research Agents" (arXiv 2604.03173)** — the 3–13% URL hallucination measurement and the open-source `urlhealth` mitigation (6–79× reduction).
8. **STORM (Stanford OVAL) paper + repo** — perspective-guided outlining; still the cleanest answer to "how do you write a long article from scratch." https://github.com/stanford-oval/storm
9. **DeepResearch Bench (Du et al., arXiv 2506.11763) + live leaderboard** — what to evaluate against; the RACE/FACT split. https://github.com/Ayanami0730/deep_research_bench
10. **GPT-Researcher repo + DeepWiki overview** — the OG planner-executor-publisher pattern; useful as a baseline to compare your design against. https://github.com/assafelovic/gpt-researcher
11. **HuggingFace "Open-source DeepResearch" blog** — replication notes on GAIA and the code-agent argument for smolagents. https://huggingface.co/blog/open-deep-research
12. **Anthropic "Equipping agents with Agent Skills"** — the SKILL.md format reference and the progressive-disclosure pattern. https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills
13. **"Deep Research Brings Deeper Harm" (arXiv 2510.11851)** + TRAP web-agent benchmark (arXiv 2512.23128) — the safety case for treating retrieved content as untrusted; quantifies the 25% prompt-injection susceptibility on frontier models.
14. **FRAMES paper (Krishna et al., arXiv 2409.12941)** — multi-hop retrieval evaluation; baseline for what "good" looks like on multi-hop questions and where multi-step retrieval moves accuracy from 40.8% to 66%.
15. **Magentic-One paper (Fourney et al., arXiv 2411.04468)** — the alternative multi-agent topology (Orchestrator + WebSurfer + FileSurfer + Coder); useful contrast to AI-Q's role split; reports GAIA 38%, WebArena 32.8%, AssistantBench 27.7%.