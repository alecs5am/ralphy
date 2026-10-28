# Harness baseline, October 2026: speed, tokens and waste (#562)

**What this is.** The first measured baseline of how long the agent harness takes per production-contract phase, how many tokens and tool calls it spends, and where it wastes them. It is produced by `scripts/session-report.ts` from real Claude Code and Codex session transcripts on the maintainer machine. Paid-provider latency and price benchmarks are out of scope (separate issue).

**Privacy.** This document contains aggregate numbers and generic descriptions only. No prompt, message or file content from the transcripts is reproduced. Session ids are shortened, and workspace / project identifiers are redacted (`--redact`).

## TL;DR

- **Agent time is far above the perf targets.** Production sessions need a median of 35 min of agent time (target: 8 min cold-start, 20 min custom). Each stage runs about 2-3x the custom-brief budget: brief to scenario 12.5 min (budget 5), scenario to assets 27 min (budget 10), assets to mp4 9 min (budget 5). For the 3 sessions that rendered a project, the median is 1h25m per rendered project.
- **Tokens are mostly cache reads.** Cache reads are 727M of 747M total tokens (97%). The cost driver is context size multiplied by the number of turns, not output: output is 2.2M tokens (0.3%). A median model turn processes about 200k tokens of context (p75 455k). The render phase alone accounts for half of all cache reads (360M).
- **Six waste patterns, three dominant:**
  1. Large unbounded tool outputs: ~1.2M tokens.
  2. Repeated reads of the same large docs, mostly after context compaction: ~0.6M tokens, 157 extra reads.
  3. Codex sessions bypassing `ralphy generate image`: 120 host-native image generations, then 167 manual `ralphy project log-asset` calls to register them, which caused most of the verb usage errors.
- **The contract's back half is barely exercised.** Eval ran in 1 session (3 min). Repair, postmortem and content-mode never registered as phases.

## Corpus and how to reproduce

```bash
bun run session:report -- ~/.claude/projects/-Users-bakugod-Desktop-works-ralphy ~/.codex/sessions \
  --ralphy-only --redact --exclude <in-progress-session-id> --sessions
```

| | Main sessions | Subagent sessions | Notes |
|---|---|---|---|
| Claude Code | 6 | 15 | the in-progress session that produced this report was excluded |
| Codex | 15 | 5 | `--ralphy-only` kept 20 of 37 Codex transcripts; the other 17 were unrelated chats |
| **Total** | **21** | **20** | activity window 2026-10-17 to 2026-10-27 |

- **Human prompts:** 156.
- **Wall time:** the 21 main sessions spanned 325.7 h. Of that, 12.7 h was agent-active and 313 h was the user away or deciding. Subagents add 1.7 h of active time, which runs in parallel with their parents.
- **Tokens:**

  | Uncached input | Output | Cache read | Cache write |
  |---|---|---|---|
  | 9.0M | 2.2M | 727.2M | 9.1M |

- **Tool calls:** 3,104 calls, 134 of them failed (4.3%).
- **Cost:** Claude Code recorded $209.01 across its 6 main sessions. Codex records no cost.
- **Full corpus:** without `--ralphy-only` there are 58 sessions, 16.2 h agent-active, 3,780 tool calls and 16.4M uncached input tokens.

### Method (short)

- **Phase attribution** uses one table, `PHASE_RULES` in `scripts/lib/session-report/phases.ts`. A call is classified by the signal it carries:
  - which `ralphy <verb>` it ran: `generate *` is assets, `render` / `editor` / `video` are render, `ref` / `research` are research, `template suggest` / `project create` / `project plan` are intake, `eval` is eval, `project repair-plan` is repair, `unit` / `publish` are unit;
  - which skill it loaded (a weak signal);
  - which project artifact it wrote (`BRIEF.md`, `scenario.json`, `prompts.json`, `asset-manifest.json`, `index.html`, `eval.json`, `units/`);
  - or a repository development action (edits under `cli/`, `tests/`, `docs/`, `notes/`, `bun test`, `git commit`), which is dev.
- **Unclassified calls** take the nearest preceding classified call in the same turn, else the next one, else the previous turn's phase.
- **Dev turns:** in a turn that contains dev edits and no production action, a skill load counts as dev. Editing a skill is not running it.
- **Time** is the sum of gaps between consecutive transcript events, attributed to the phase of the later event. Gaps ending at a human prompt are user wait, and gaps over 30 min are idle. Neither counts as agent time, mirroring the perf-targets rule that user feedback iteration does not count.
- **Tokens** come from per-response usage, de-duplicated per response. Input means uncached input. For Codex, `input_tokens` minus `cached_input_tokens`.

## Per-phase table

Wall time is main-session agent time; the "subagent" column is active time spent in subagents. Tokens and calls include subagents.

| Phase | Sessions | Active | Model | Tool | Bg wait | Subagent | Input | Output | Cache read | Cache write | Calls | Failed |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| intake | 9 | 43m34s | 33m45s | 9m49s | 0s | 0s | 1.2M | 87k | 19.7M | 66k | 142 | 10 |
| content-mode | 0 | — | — | — | — | — | — | — | — | — | 0 | 0 |
| research | 9 | 1h13m | 54m55s | 17m12s | 1m02s | 2m41s | 1.8M | 160k | 60.7M | 347k | 330 | 21 |
| scenario | 3 | 14m50s | 13m29s | 1m21s | 0s | 0s | 236k | 49k | 12.4M | 320k | 46 | 2 |
| prompts | 7 | 1h04m | 46m24s | 13m33s | 4m40s | 0s | 1.7M | 126k | 20.3M | 51k | 155 | 13 |
| assets | 7 | 2h54m | 1h58m | 44m35s | 11m30s | 0s | 1.4M | 281k | 91.4M | 264k | 414 | 26 |
| render | 8 | 4h14m | 2h56m | 1h17m | 16s | 0s | 899k | 690k | 359.6M | 4.3M | 899 | 30 |
| eval | 1 | 3m00s | 1m26s | 1m34s | 0s | 0s | 132k | 3.6k | 899k | 0 | 8 | 0 |
| repair | 0 | — | — | — | — | — | — | — | — | — | 0 | 0 |
| unit | 4 | 27m47s | 26m37s | 52s | 17s | 0s | 21k | 124k | 26.8M | 1.5M | 76 | 3 |
| postmortem | 0 | — | — | — | — | — | — | — | — | — | 0 | 0 |
| dev | 14 | 1h28m | 1h09m | 15m39s | 3m14s | 39m14s | 1.2M | 334k | 107.6M | 536k | 585 | 27 |
| other | 22 | 20m03s | 15m41s | 4m21s | 0s | 1h01m | 419k | 298k | 27.7M | 1.7M | 449 | 2 |

Observations:

- **Render is the heaviest phase on every axis:**
  - 4h14m, 33% of agent time;
  - 899 calls, 29%;
  - 360M cache-read tokens, 49%.

  It is iterative HyperFrames composition work: edit `index.html`, snapshot, inspect, re-render. Each turn re-reads the whole growing context.
- **Model time dominates tool time** in every phase except eval: by 2-4x in most phases, and more in scenario and unit. The agent spends more wall time deciding than waiting for tools. Shorter skills and playbooks, and fewer turns, are the main levers.
- **The eval / repair / postmortem phases are close to absent.** One eval session (3 min), no repair plan, no postmortem. Contract phases 14-18 are not reached in practice.
- **No session registered content-mode.** That phase has no tool signature yet: `template suggest` folds it into intake.
- **Subagent time is mostly research or "other"** (web and browser work without a ralphy verb), plus Codex dev reviewers.

## Versus `docs/perf-targets.md`

### Stage budgets (single video)

Sessions are the main sessions with at least one production action, 11 in total. Medians cover only sessions that spent time in that stage. Per-session time includes iteration within a session; only time waiting on the user is excluded. It therefore overstates single-pass latency, but it is the time a user actually experiences.

| Stage | Sessions | Median | p75 | Cold-start budget | Custom budget | Sessions over custom budget |
|---|---|---|---|---|---|---|
| Brief → scenario | 10 | 12m33s | 18m23s | 1 min | 5 min | 8 |
| Scenario → assets ready | 8 | 26m52s | 35m24s | 3 min | 10 min | 8 |
| Assets → final mp4 | 7 | 8m55s | 47m53s | 4 min | 5 min | 4 |
| Total production time per session | 11 | 34m59s | 1h13m | 8 min | 20 min | 7 |
| Production time per rendered project | 3 | 1h25m | 1h38m | 8 min | 20 min | 3 |

- **Only 3 of 11 production sessions rendered a project.** The other 8 stopped at research, prompts, or assets. Some are research and planning sessions by design.
- **Every stage median is above the custom budget:** 2.5x, 2.7x, and 1.8x. The total is 1.75x the custom budget and 4.4x the cold-start budget.
- **Per rendered project, the median is over 4x the custom budget.** The one long Claude session that rendered 31 times spent 2h24m in render and 1h03m in prompts and assets.

### Per-call latency budgets

Single, successful, foreground or notified-background `ralphy` invocations. Dry-run, `--queue`, `--help` and failed calls are excluded.

| Call | n | Median | p95 | Max | Budget median | Budget p95 |
|---|---|---|---|---|---|---|
| `generate image` | 19 | 21s | 55s | 5m01s | 15s | 35s |
| `generate video` | 12 | 2m43s | 3m53s | 4m43s | 60s (Kling 5s) / 90s (Veo 3.1) | 120s / 180s |
| `render` | 18 | 49s | 2m13s | 2m15s | 30s (15 s video) | 90s |
| `generate voiceover` | 3 | 3s | 8s | 9s | 4s | 8s |

- **Image, video and render all miss their budgets at median and p95.** Voiceover is within budget.
- **The video runs used a model family with no budget row.** The dry-run outputs name Seedance 2.x, so the video comparison is indicative only.
- **The render budget assumes a 15 s output.** The rendered durations are not in the transcripts.
- **Bookkeeping verbs are instant.** `project log-asset` ran 117 times and `project log-prompt` 31 times, all at a median of 0s. They cost turns, not wall time.

## Waste list

| # | Detector | Occurrences | Sessions | Impact |
|---|---|---|---|---|
| 1 | Tool outputs over 20,000 chars | 257 | 34 | 8.66M chars ≈ 2.16M tokens; 132 had no output limit ≈ 1.17M tokens |
| 2 | Same file read 3+ times in a session | 58 file/session pairs | 10 | 157 extra reads ≈ 612k tokens; 109 repeated an already-read range |
| 3 | `ralphy` verb usage errors | 42 | 6 | 42 wasted calls (and turns) |
| 4 | Failed call retried with same / near-same args | 35 | 8 | 35 extra calls; 2m41s between failures and retries |
| 5 | Waits over 120 s on a background job | 7 | 3 | 23m23s idle |
| 6 | Skill loaded with no follow-up action in its domain | 13 | 9 | context spent on unused skill bodies |

### 1. Large tool outputs

- **Web search results (Codex):** 42 outputs, 1.3M chars. A further 16 outputs (457k chars) came from the hosted search service.
- **Whole-file `cat` of large docs (Codex, unbounded):**

  | File | Outputs | Chars |
  |---|---|---|
  | The Codex host's image-generation skill | 7 | 277k |
  | `MODELS.md` | 6 | 231k |
  | `docs/playbooks/art-director.md` | 5 | 199k |
  | `.agents/skills/researcher/SKILL.md` | 5 | 176k |
  | `docs/playbooks/editor.md` | 4 | 145k |
  | `docs/playbooks/scenarist.md` | 4 | 130k |
  | `.agents/skills/seedance-prompts/SKILL.md` | 3 | 100k |

  Codex caps a single output near 40k chars, so these whole-file reads land at the cap.
- **Unbounded `Read` of 51-68k-char HTML page versions:** 5 subagents in one session each read a full version of the same landing page.
- **`ralphy ref pull`:** two calls returned 28k and 48k chars.
- **Browser automation results** (`cua_repl`, `javascript_tool`) of 40-50k chars.

### 2. Repeated reads

- **Most re-reads follow context compaction.** 135 of the 157 extra reads happened in the 5 Codex sessions that hit compaction (2-6 compactions each). Re-reading after compaction is partly unavoidable. The cost scales with the size of what has to be re-read.
- **`MODELS.md`** (41k chars on disk) was read 35 times in total: median 28.7k chars per read, 1.12M chars ≈ 280k tokens overall. One session read it 11 times; 8 of those reads were different ranges, so the agent was paging through it.
- **Playbooks:** in one session `docs/playbooks/art-director.md` was read 9 times (2 distinct ranges) and `docs/playbooks/editor.md` 7 times, always the same range. In another, `docs/playbooks/scenarist.md` was read 5 times, always the same range.
- **Codex host image-generation skill:** read 6 and 4 times in two sessions.

### 3. `ralphy` verb usage errors (42)

| Error | Count |
|---|---|
| `project log-asset`: required `--source` missing | 13 |
| `E_INPUT_INVALID`: workspace slug passed where the Workspace id is expected ("workspace not found") | 8 |
| `E_INPUT_INVALID`: "more than one Workspace exists", scope missing | 4 |
| `E_INPUT_INVALID`: project conflicts with the immutable session scope (`project log-prompt` / `log-asset`) | 4 |
| `E_INPUT_INVALID`: destination missing (`--project` or `--workspace` required; `ref pull`, `generate video`) | 3 |
| `E_INPUT_INVALID`: project not found (project slug vs id) | 2 |
| `migrate`: required `--run-id` missing | 2 |
| Other single errors: `provider auth list` (unknown command), `project style-lock --show` (unknown option), `memory recall <arg>` (too many arguments), `activity list` without `--since`, `doctor` with no workspace, `ref pull --global` (legacy tree) | 6 |

- **Scope errors are the largest group:** 23 of 42 are `E_INPUT_INVALID` workspace / project scope errors.
- **Required-flag errors are the second group:** 19 are commander errors for flags agents did not know were required.

### 4. Failed and retried calls (35)

- **`project log-asset`** failed then retried 14 times. These overlap with the 13 `--source` usage errors.
- **`ref pull`:** 4 retries.
- **Ad-hoc `python3` scripts:** 3 retries.
- **Other retries:** `image fit` 2 and `provider auth` 2. Ten single retries: `render`, `doctor`, `project create`, `artifact`, `project style-lock`, `ref pull-site`, `voice exists`, a bare `ralphy` call, a browser batch, and an ad-hoc shell function.

The time between failure and retry is short (2m41s in total). The cost is turns: each retry re-sends the full context, and a median turn processes about 200k tokens.

### 5. Background waits (7, 23m23s)

- **`ralphy generate video` (4 gaps, 10m08s):** in one session the agent launched clips as background jobs and then sat idle for 129-175 s each time until the notification arrived, instead of submitting the clips together.
- **Other background jobs and subagents (3 gaps, 13m15s).**
- **No blocking `wait` / `sleep` over 120 s.** Codex `wait` calls stayed under the threshold.

### 6. Skills loaded without a follow-up action (13)

- **Affected skills:**
  - `good-writing`: 3
  - `humanizer`: 2
  - `social-copy`: 2
  - `evaluator`, `hyperframes-media`, `poster`, `scenarist`, `social-publish`, `website-to-hyperframes`: 1 each
- **"No follow-up" means no later verb run or artifact written in that skill's phase.**
- **These are upper bounds.** Writing skills can be applied to prose that stays in chat. The `social-copy` and `social-publish` loads ended without a Unit or publish action.

### Other findings (not a detector)

- **Codex sessions generate images outside `ralphy`.**
  - Across 7 Ralphy Codex sessions there were 120 host-native image generations and only 3 `ralphy generate image` calls. The other 32 `ralphy generate image` calls were in Claude sessions.
  - Those assets bypass the gen-log, cost rollup, auto-versioning and quality gates (AGENTS.md invariant #2).
  - They are then registered by hand. All 167 `ralphy project log-asset` calls in the corpus are in Codex sessions, and that verb produced 13 usage errors and 14 retries.
- **Harness bookkeeping is 7% of calls.** Claude Code desktop `update_plan` (158) and `wrap_up` (59) make up 217 of 3,104 calls. Their outputs are tiny, but each call is a turn.

## Ranked fixes

Ranked by estimated savings per session, highest first.

1. **Route Codex image generation through `ralphy`.**
   - **Problem:** 120 untracked generations, 167 manual `log-asset` calls, 13 usage errors and 14 retries.
   - **Fix:** state in AGENTS.md / the Codex skill entry points that host-native image tools are not allowed for Ralphy work. Alternatively, add an explicit import path, e.g. `ralphy generate image --import <file> --model <id>`, that records provenance and cost in one call.
2. **Make `project log-asset` forgiving.**
   - **Problem:** 13 errors and 14 retries.
   - **Fix:** default `--source` (e.g. `agent`), infer it from the file location, or print a copy-paste example in the error.
3. **Resolve workspace / project scope from slugs and give actionable hints.**
   - **Problem:** 23 errors.
   - **Fix:** accept a workspace or project slug wherever an id is accepted. When more than one workspace exists, list the ids in the error `hint`. When a project conflicts with the session scope, say which scope is active.
4. **Split `MODELS.md` into a compact index plus per-model sections, and point skills at `ralphy models show <id>`.**
   - **Problem:** 35 reads, about 280k tokens. One session paged through it 11 times.
5. **Trim the largest playbooks and SKILL.md bodies that get re-read after compaction.**
   - **Problem:** 135 of 157 extra reads happened after compaction.
   - **Targets:** the art-director, editor and scenarist playbooks; `hyperframes` 33k chars, `intake` 32k, `seedance-prompts` 28k, `humanizer` 28k.
   - **Fix:** keep the routing and checklist in the body, move reference material to `references/` loaded on demand, and let a skill state the minimal re-read set after compaction.
6. **Bound tool output by default.**
   - **Problem:** 132 unbounded large outputs, about 1.17M tokens.
   - **Fix:** compact default output for verbs that print over 20k chars (`ref pull`, `ref paths`). Skill guidance should prefer `sed -n` / `head` ranges or `rg` over whole-file `cat` for files over 20k chars, and a `limit` on `Read`.
7. **Submit independent video clips together.**
   - **Problem:** 10 min of idle waits in one session.
   - **Fix:** document a batch or queue pattern for `generate video` (`--queue` exists) in the art-director skill, so N clips run concurrently instead of one background job at a time.
8. **Refresh `docs/perf-targets.md` with measured values.**
   - **Fix:** add budget rows for the video model family actually used (Seedance 2.x). Express render budgets per output second. Record this baseline in its Validation section.
9. **Make the eval / repair tail reachable.**
   - **Problem:** eval ran in 1 of 11 production sessions, and repair and postmortem never ran.
   - **Fix:** surface `ralphy project status <id> --contract` after every render, so the agent sees that eval is the next required phase.

## Limitations

- **Phase attribution is heuristic.** About 15% of agent time lands in `other` or `dev` because no production signal was present: web research without a ralphy verb, browser work, setup.
- **Codex model and tool split is approximate.** Codex token records carry no response timestamps, so model time is the gap before each call starts.
- **Background completions are matched differently per harness.** Claude Code notifications name the launching call; Codex yielded `exec` cells are tracked through their `wait` calls.
- **The issue also mentions project `logs/` and gen-log input.** This baseline reads transcripts only. Command durations come from the transcripts. Provider latency and cost per call from `generations.jsonl` are not included.
- **Session-level stage times include in-session iteration.** A single-pass benchmark needs a scripted run, which belongs to the paid-provider benchmark issue.

## Follow-up candidates

- **Codex image generation through `ralphy`:** forbid host-native image tools in Ralphy work (AGENTS.md / Codex entry points), or add `ralphy generate image --import <file>` that registers a host-generated image with provenance in one call.
- **`project log-asset`:** default or infer `--source`, and print an example in the error.
- **Scope errors:** accept workspace and project slugs wherever ids are accepted. Errors list valid ids when scope is ambiguous and name the active session scope on conflict.
- **`MODELS.md`:** split into an index plus per-model sections, and teach skills to use `ralphy models show <id>` instead of reading the file.
- **Large skill bodies:** trim the art-director, editor and scenarist playbooks and the `hyperframes`, `intake`, `seedance-prompts` and `humanizer` SKILL.md bodies. Move reference material into on-demand `references/` and state a minimal post-compaction re-read set.
- **Default output size:** compact default output for `ref pull` and `ref paths`. Add guidance to bound reads of files over 20k chars.
- **`generate video`:** document the concurrent submission pattern (`--queue` plus one wait) in the art-director skill.
- **`docs/perf-targets.md`:** add Seedance 2.x budget rows and per-output-second render budgets, and record this baseline under Validation.
- **Eval:** surface `project status --contract` after `ralphy render` so eval is not skipped.
- **`session-report` coverage:** read project `logs/` and `generations.jsonl` to add provider latency and cost per call, and give content-mode a tool signature so the phase becomes measurable.
