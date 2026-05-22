---
id: 10.01.01
status: doing
v1_0: yes
category: 10-cost-and-telemetry
topic: "10.01 `generations.jsonl` schema"
title: "Schema documented and committed"
---

# 10.01.01 — Schema documented and committed

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
