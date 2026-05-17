# 10 — Cost & Telemetry — PRD

## Problem

The landing promises "iterate from numbers". The gen-log is the foundation but the loop isn't complete:

1. **`generations.jsonl` shape is informal.** Each line has cost + tokens + model + path, but field names drift slightly across providers. No alignment with the OpenTelemetry GenAI semantic conventions (`gen_ai.usage.input_tokens` etc.), which would buy us free export to Langfuse / Phoenix / OTel-aware backends.
2. **Cost is derived locally, not pulled from OpenRouter.** We compute cost from `MODELS.md` pricing tables. Pricing tables drift; the OpenRouter `/api/v1/generation` endpoint returns the authoritative `total_cost`. We should pull, not estimate (estimate as fallback only).
3. **No budget enforcement.** Today the agent reports cost retroactively. The user can't set "stop at $5 per project" or "stop at $50 per session" with hard enforcement.
4. **No cost rollup verb.** `ralphy project log` lists generations; there's no `ralphy cost report` that summarizes by project / brand / time window / model.
5. **External analytics integration is unbuilt.** TikTok / Meta / YT view-and-CTR data is the half of "iterate from numbers" that closes the loop. Cross-link [`01.08.03`](../01-cli/SPEC.md).
6. **No opt-in usage telemetry.** For a self-hosted OSS CLI this is the right default — but at v1.0 we should at least *have* a clear "we don't phone home" statement and a future opt-in path documented.

This category owns "where the numbers come from, how they're aggregated, where they can go".

## Users

| User | Need |
|---|---|
| **Cost-sensitive user** | Per-project, per-session, per-day budget caps. Refuse-not-warn when exceeded. |
| **Maintainer** | Cost rollup across projects to size template costs and tune defaults. |
| **Power user** | Export gen-log to a self-hosted Langfuse or Phoenix for a UI. |
| **Privacy-sensitive user** | Confidence that nothing leaves the box without consent. |
| **Future "iterate" user** | A loop that reads view/CTR from external sources, ranks variants, prompts remix. |

## User stories

1. As a **cost-sensitive user**, I run `ralphy config set budget.daily 10` and `ralphy config set budget.project 2`. After today's spend hits $10 OR a project exceeds $2, `ralphy generate` refuses with `E_BUDGET_EXCEEDED` until I bump the cap.
2. As a **maintainer**, I run `ralphy cost report --since 7d --group-by template` and see which templates cost what; helps me tune the defaults.
3. As a **power user**, I run `ralphy export langfuse --since 7d --target https://my-langfuse.local` and my recent gens land in my self-hosted Langfuse for the dashboard view.
4. As any **user**, I see `OPENROUTER_API_KEY` + `ELEVENLABS_API_KEY` in `ralphy doctor` and a "no telemetry sent" line, so I know the gen-log is local.
5. As an **agent**, I call `ralphy generate video --dry-run` and the cost estimate is within ±15% of the eventual actual (because we trust OpenRouter's pricing where we can).
6. As an **iterate user** (post-launch), I plug in TikTok analytics, and `ralphy iterate <campaign>` retires low-CTR variants and remixes from winners.

## Success metrics

| Metric | Target at v1.0 | How we measure |
|---|---|---|
| `generations.jsonl` fields aligned with OTel GenAI semantic conventions | 100% of fields aliased / renamed | Schema check |
| Cost pulled from OpenRouter (when call returns an id) | ≥ 95% of gens | Audit gen-log |
| Cost-estimate accuracy on `--dry-run` | ±15% of actual | Audit on 50 gens |
| Budget caps (daily, project) enforced | Yes | Smoke test |
| `ralphy cost report` runs in < 200ms on a workspace with 100 projects | Yes | Hyperfine |
| Export to Langfuse OTLP works | Yes | Smoke against self-hosted Langfuse |
| "We don't phone home" documented + verified | Yes | Doctor message + audit |

## Non-goals

- **A built-in dashboard UI.** Export to Langfuse or Phoenix; don't reinvent.
- **Default telemetry-on.** Even anonymized. Opt-in only, documented as post-launch.
- **A proxy-mode (Helicone-style).** Adds a hop and a failure mode for marginal benefit.
- **Cost-pricing maintained inside Ralphy.** Always prefer OpenRouter's number. Local pricing is fallback / estimate only.
- **External analytics scraping.** Adapters for TikTok Business API et al. are post-launch and use official APIs.

## v1.0 cut

**Must ship:**

- `10.01` — `generations.jsonl` schema aligned with OTel GenAI conventions
- `10.02` — Cost pulled from OpenRouter (with local fallback)
- `10.03` — Budget caps (daily + project) enforced at provider layer
- `10.04` — `ralphy cost report` verb
- `10.05` — `ralphy export langfuse | phoenix | otel` verb (write-only OTLP exporter)
- `10.06` — Privacy posture documented (no phone-home)

**Post-launch:**

- `10.07` — External analytics adapters (TikTok / Meta / YT)
- `10.08` — `ralphy iterate` analytics loop (cross-link [`01.01.04`](../01-cli/SPEC.md))
- `10.09` — Opt-in anonymous usage stats
- `10.10` — Cost forecasting on `ralphy make` based on history
