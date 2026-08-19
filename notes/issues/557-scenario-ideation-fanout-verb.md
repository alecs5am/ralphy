# 557 — `ralphy project ideate`: multi-model scenario / punchline fan-out

**Status:** open
**Filed:** 2026-08-03
**Origin:** `content-lab/evilcorp-pilot-001`, scenarist pass 3. The user asked to
"поручить генерацию сценария топовой модели gemini, deepseek, grok, gpt — попробуй
все прогнать и найди лучшие идеи". There is no CLI path for it, so the request
could not be served.

## The gap

Nothing in the CLI runs a text-LLM ideation pass against a chosen model.

- `ralphy models` — OpenRouter **video** models only (`list`/`show`/`alias`/`recommend`/`preflight`).
- `ralphy prompts` — a static cookbook (`library`, `modes`). No generation.
- `ralphy research run | synthesize | scrape-profile` — the only verbs that call
  `callLLM()` with a `--summary-model` / `--synth-model` override, but they are
  bound to research artifacts (topic dirs, style sheets), not to a project's
  scenario, and their prompts are fixed to research synthesis.

So the agent's only options today are to draft alone, or to violate AGENTS
invariants #1/#2 by reaching for OpenRouter directly. Neither is right, and the
second is the failure mode the invariants exist to prevent.

This matters beyond one project: "generate N candidate scenarios / hooks /
punchline banks across several frontier models and pick the best" is a normal
scenarist move, and the whole judge-panel pattern in the producer playbook assumes
it is possible.

## Proposed verb

```
ralphy project ideate <id> \
  --task scenario|hook|punchlines|beats \
  --models google/gemini-3.1-pro-preview,x-ai/grok-4,deepseek/deepseek-v4,openai/gpt-5.4 \
  [--n 3] [--brief-file <path>] [--rubric <path>] [--judge <model>] [--concurrency 4]
```

Behaviour:

- Reads the project's `BRIEF.md`, `STYLE_LOCK.md` and any existing `scenario*.json`
  as context, plus `--brief-file` for a free-form ask.
- Fans out one `callLLM()` per (model × n) through the registered OpenRouter
  connector. No new provider surface, no new keys.
- Writes each candidate to `<project>/ideation/<task>-<model-slug>-<k>.md` —
  append-only, versioned like every other artifact (#invariant 14).
- Optional `--judge <model>` scores the pool against `--rubric` (default: the
  virality rubric) and writes `ideation/RANKING.md` with per-candidate scores and
  a one-line rationale.
- Logs every call to `generations.jsonl` with model, tokens and cost, so the
  ideation spend lands in the same rollup as media spend. **This is the actual
  reason the verb has to exist rather than the agent improvising.**
- `--task punchlines` returns a flat bank rather than a scene table, since that is
  the unit the agent actually wants to shop for.

## Notes

- `--n` above 1 per model matters: temperature variance across repeats of the same
  model produced more spread than swapping models in the researcher's experience.
- The judge pass should be optional and off by default; ranking is cheap but the
  agent often wants the raw pool to read itself.
- Model IDs must resolve through `MODELS.md` / the registry rather than being
  hardcoded, so the default set does not rot.
- Related: the council verb (`ralphy project council`, #415) already fans bounded
  `callLLM()` roles over a plan and writes a scored artifact. `ideate` is the
  generative sibling of that read-only pattern, and should reuse its fan-out and
  spend-logging plumbing rather than inventing new ones.
