# 10 — Cost & Telemetry — SPEC

> **Vision.** `generations.jsonl` is the single source of truth, shaped to OTel GenAI. Costs come from OpenRouter, not pricing tables. Budgets refuse-not-warn. Local-first, optional export to any OTLP backend.

## Scope

**In:**

- `generations.jsonl` schema alignment with OTel GenAI semantic conventions
- Cost-from-OpenRouter primary path with local fallback
- Budget caps (daily, project) at provider layer
- `ralphy cost report` verb
- OTLP export verb (Langfuse / Phoenix / generic)
- Privacy posture statement

**Not in (cross-references):**

- Eval data (Verdict shape) → [`08`](../08-quality-and-evaluation/)
- `ralphy iterate` analytics readers → [`01.01.04`](../01-cli/SPEC.md), post-launch
- Workspace registry → [`05.01`](../05-project-resources/SPEC.md)
- Append-only invariant → [`05.03`](../05-project-resources/SPEC.md)

---

## 10.01 `generations.jsonl` schema

Align with OTel GenAI semantic conventions so we can export anywhere.

### 10.01.01 Schema documented and committed  [~]
**v1.0:** yes

**Acceptance criteria:**
- New file `cli/lib/schemas/generation.ts` with Zod for the JSONL line:
  ```
  {
    ts: string (ISO),
    span_id: string (uuid),
    trace_id: string (project-scoped),
    parent_span_id?: string,
    stage: "image" | "video" | "voiceover" | "music" | "captioning" | "eval" | ...,
    project_id: string,
    slot?: string,
    gen_ai: {
      operation_name: string,
      system: "openrouter" | "elevenlabs" | "local",
      request: { model: string, model_family?: string, ... },
      response: { model?: string, id?: string },
      usage: { input_tokens?, output_tokens?, total_tokens?, native_tokens?, cache_discount? },
    },
    cost: { usd: number, source: "openrouter" | "local-estimate", model_pricing_version?: string },
    duration_ms: number,
    output: { path?: string, version?: number, bytes?: number, sha256?: string },
    request_meta?: { prompt_hash, refs: [...], ... },
    eval?: { gate_passed: boolean, score: number, rubric: string },
    user_consent?: { kind: "no-ref" | "no-pool" | "eval-override", reason?: string },
  }
  ```
- Documented in `docs/gen-log-schema.md`.

### 10.01.02 Migration of existing logs  [ ]
**v1.0:** yes

**Acceptance criteria:**
- `ralphy workspace migrate-gen-log` rewrites historical gen-logs into the new shape (append-only — writes `generations.v2.jsonl` and leaves `generations.jsonl` intact).
- Idempotent.

### 10.01.03 Writers across the codebase use the schema  [ ]
**v1.0:** yes

**Acceptance criteria:**
- `cli/lib/log/append.ts` validates every write against the Zod schema before append.
- Failing validation throws (the caller should never write a malformed line).

---

## 10.02 Cost-from-OpenRouter

Authoritative numbers; local estimate only as fallback.

### 10.02.01 Post-call cost fetch  [ ]
**v1.0:** yes

**Acceptance criteria:**
- Every completed OpenRouter call gets its `id` recorded.
- After the call, a follow-up `GET /api/v1/generation?id=<id>` fetches `total_cost`.
- That number is written to `cost.usd` with `cost.source: "openrouter"`.
- If the fetch fails or times out (>5s), fall back to local estimate with `cost.source: "local-estimate"`.

### 10.02.02 Local-estimate fallback uses `MODELS.md` pricing  [~]
**v1.0:** yes

**Acceptance criteria:**
- Pricing table at `cli/lib/pricing/table.ts` derived from `MODELS.md`.
- `model_pricing_version` field tracks which version was used (e.g., `2026-05-08`).
- Documented as fallback only.

### 10.02.03 `--dry-run` cost estimate uses the same path  [ ]
**v1.0:** yes

**Acceptance criteria:**
- `ralphy generate ... --dry-run` returns the local estimate (since there's no id to fetch yet).
- Audit verifies estimates are within ±15% of actuals on a 50-call sample.

### 10.02.04 ElevenLabs cost  [ ]
**v1.0:** yes

**Acceptance criteria:**
- ElevenLabs API returns character usage; we map to USD via subscription tier in `cli/lib/pricing/elevenlabs.ts`.
- User configures their tier in `~/.ralphy/config.json`; default "starter".
- Documented limitations (subscription-based, not per-call).

---

## 10.03 Budget caps

Provider-layer enforcement.

### 10.03.01 Config layer  [ ]
**v1.0:** yes

**Acceptance criteria:**
- `ralphy config set budget.daily <usd>`, `budget.project <usd>`, `budget.session <usd>`.
- Persisted to `~/.ralphy/config.json` (daily, session) and `workspace/projects/<id>/budget.json` (project-scoped overlay).
- `ralphy config get budget` returns current caps.

### 10.03.02 Pre-call check in `cli/lib/providers/media.ts` and `llm.ts`  [ ]
**v1.0:** yes

**Acceptance criteria:**
- Every provider call queries the gen-log to compute current spend (cached in-memory per session).
- If adding the estimated cost would exceed a cap, refuse with `E_BUDGET_EXCEEDED`.
- Error message names the cap, current spend, projected.

### 10.03.03 Override flag  [ ]
**v1.0:** yes

**Acceptance criteria:**
- `--allow-over-budget` proceeds; logs `user_consent.kind: "budget-override"`.

### 10.03.04 Project-level budget enforced by `ralphy ship`  [ ]
**v1.0:** yes

**Acceptance criteria:**
- Ship pre-flight aggregates project cost from gen-log; refuses if over `budget.project`.

---

## 10.04 `ralphy cost report`

### 10.04.01 Verb shape  [ ]
**v1.0:** yes

**Acceptance criteria:**
- `ralphy cost report [--project <id>] [--since 7d] [--group-by template|brand|model|day]`.
- Output: `{ total_usd, by_group: [{ key, usd, count }], window }`.
- Pretty: bar chart in terminal (`-p`).
- < 200ms on a workspace with 100 projects.

### 10.04.02 `ralphy cost forecast` (stretch)  [ ]
**v1.0:** stretch

**Acceptance criteria:**
- `ralphy cost forecast --brief "<text>"` reads the user's history of cost-per-template and gives a forecast for a new brief.

---

## 10.05 OTLP export

Optional path to a self-hosted dashboard.

### 10.05.01 `ralphy export <backend> [--target <url>] [--since 7d]`  [ ]
**v1.0:** yes

**Acceptance criteria:**
- Backends: `langfuse`, `phoenix`, `otel` (generic OTLP HTTP).
- Reads `generations.jsonl`, transforms to OTLP traces / spans, posts.
- Idempotent — re-export of the same window is safe (uses `span_id` for dedup).
- No prompt/response bodies sent unless `--include-bodies` is set (and a warning printed).

### 10.05.02 Langfuse adapter  [ ]
**v1.0:** yes

**Acceptance criteria:**
- Span → Langfuse Observation mapping documented.
- Smoke test against a local Langfuse instance.

### 10.05.03 Phoenix adapter  [ ]
**v1.0:** stretch

**Acceptance criteria:**
- Span → Phoenix span mapping; smoke against local Phoenix.

### 10.05.04 Generic OTLP adapter  [ ]
**v1.0:** stretch

**Acceptance criteria:**
- Compliant OTLP/HTTP exporter; works with any conformant backend.

---

## 10.06 Privacy posture

Documented + observable.

### 10.06.01 "No phone home" verified  [ ]
**v1.0:** yes

**Acceptance criteria:**
- Audit: `grep -r 'fetch\|http' cli/lib/` returns only calls to OpenRouter, ElevenLabs, GitHub (for `ralphy assets`), and explicit user-set OTLP targets.
- Documented in `docs/privacy.md` and `README.md`.

### 10.06.02 `ralphy doctor` reports privacy state  [ ]
**v1.0:** yes

**Acceptance criteria:**
- Doctor includes a "Privacy" group: "No telemetry sent. Export disabled. Provider calls: OpenRouter, ElevenLabs."
- If a user has configured an export target, it's named.

### 10.06.03 Opt-in usage stats — documented, not built  [ ]
**v1.0:** yes

**Acceptance criteria:**
- `docs/privacy.md` includes a "What an opt-in path would look like" section so the future addition is unsurprising.

---

## 10.07 Post-launch

### 10.07.01 External analytics adapters  [ ]
**v1.0:** no

**Acceptance criteria:**
- TikTok Business API, Meta Insights, YouTube Analytics — each as a thin adapter.
- Auth per adapter.

### 10.07.02 `ralphy iterate` loop  [ ]
**v1.0:** no (owned by [`01.01.04`](../01-cli/SPEC.md))

### 10.07.03 Opt-in anonymous usage stats  [ ]
**v1.0:** no

**Acceptance criteria:**
- `ralphy config set telemetry.opt_in true` enables aggregated usage shipping to a documented endpoint.
- Documented data shape; documented retention.

### 10.07.04 Cost forecasting based on user history  [ ]
**v1.0:** no

**Acceptance criteria:**
- Predicts cost-per-template for a user based on their past renders; surfaces in `ralphy make --dry-run`.
