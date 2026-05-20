---
name: ralph-researcher
namespace: ralphy
description: >-
  Deep-research workflow for UGC reference material — turns one or more URLs / handles / trend queries into a single cited research report (report.md + sources.json) that a scenarist or art-director can act on. Aggregates the per-URL `ralphy ref` chain (yt-dlp pull → frames → transcript → vision → audio-describe → blueprint) and adds a cross-source LLM synthesis pass on top.
  USE WHEN the user drops a URL on TikTok / Reel / Shorts / YouTube / X / Reddit, mentions an `@handle` to audit, asks "how do they do X", asks "what's trending in <niche>", asks for a competitor breakdown, or wants a style report across multiple references.
  TRIGGER (EN): "research X", "analyze @handle", "break down this TikTok / Reel / Shorts", "how do they do this", "find how X is done", "what's trending in <niche>", "competitor audit", "extract style from <url>".
  TRIGGER (RU): "исследуй", "проанализируй", "разбери", "разбор", "посмотри как у", "стиль X", "в стиле X", "как они это сделали", "что сейчас в тренде", "конкурентный аудит", "разобрать <url>".
  See body for ALSO FIRE / DO NOT FIRE / HARD INVARIANTS.
---

## Trigger refinements

**ALSO FIRE** if the message contains a URL on tiktok / instagram / youtube / youtu.be / x / twitter / reddit / facebook AND asks anything analytical about it (in any language).

**DO NOT FIRE** for rendered-mp4 quality checks (that is `/ralph-evaluator`), for raw downloads-only (use `ralphy ref pull` directly), or once a scenario is already locked and the user wants prompts / assets (handback to scenarist / art-director).

## Hard invariants

- Never ask the user to "send the file" if the URL is on a social platform — WebFetch returns a JS shell on those, but `ralphy ref pull` (yt-dlp) gets the mp4.
- All LLM / vision calls route through `cli/lib/providers/llm.ts → callLLM()` via the CLI. Don't paste raw OpenRouter / yt-dlp code into ad-hoc scripts.

---

# ralph-researcher

You take open-ended reference material — URLs, handles, trend queries — and produce a single deep-research document with cited sources. The contract is: **the report is the handoff**. A scenarist reading `report.md` should not need to open the source URLs again to write the scenario.

## What this skill is not

- Not a quality checker for rendered mp4s. For "is this video good / find issues" use `/ralph-evaluator`.
- Not a one-off downloader. For "just give me the mp4 from this URL" use `ralphy ref pull <url>` directly.
- Not a scenario writer. The report ends in handoff — the scenarist consumes `sources.json` and writes from there.

## The workflow

Four CLI verbs cover the loop. Don't skip steps — the synthesis step depends on the per-source ref chain having run.

```bash
# 1. Start a topic (creates workspace/research/<slug>/state.json)
ralphy research start <topic-slug> --question "<the research question>"

# 2. Add each source (full ref chain: pull → frames → transcribe → analyze → audio-describe → blueprint)
ralphy research add-source <url> --topic <slug>

# 3. Cross-source LLM synthesis → report.md + sources.json
ralphy research synthesize <slug>

# 4. Inspect at any time
ralphy research show <slug>
ralphy research list
```

`add-source` is idempotent: if a URL was already pulled into `workspace/references/<refSlug>/`, the chain detects the existing artifacts and skips them. Re-running `synthesize` after adding more sources updates `report.md` in place.

Useful flags:
- `--meta-only` on `add-source` — only record the URL + yt-dlp metadata, skip the heavy chain (use when the source is text-only or you only need title / author).
- `--frames <n>` on `add-source` — cap sampled frames (default 12). Bump higher for long-form video.
- `--model <id>` on `synthesize` — override the synthesis model (default `google/gemini-2.5-flash`).

## How to read the report

Two files written to `workspace/research/<slug>/`:

- **`report.md`** — narrative deep-research doc. Sections: Executive Summary, Key Findings (with `[^N]` footnotes), Patterns Across Sources, Actionable Recommendations (split for scenarist / art-director), Open Questions, Sources. Show this one to the user.
- **`sources.json`** — machine contract for downstream skills. Each source has `id` (footnote), `url`, `title`, `refSlug` (pointing at raw artifacts in `workspace/references/<refSlug>/`), `blueprintPath`, and `keyFindings[]` (3–8 short bullets distilled by the synthesis step). Schema: `references/report-schema.md`.

The report cites every claim. If the model produces an uncited bullet, the synthesis is suspect — re-run with a different model or check that all sources reached `status: "analyzed"` via `ralphy research show`.

## When to keep the playbook in mind

`docs/playbooks/researcher.md` is the tool-deep-dive companion. Read it when:

- The source URL needs a non-standard pull (Playwright for JS-heavy landing pages, manual yt-dlp flags for region-locked content) — see `docs/playbooks/researcher/yt-dlp.md` and `site-extract.md`.
- The user asks for trend discovery, not a fixed source list — `discover-trends` sub-task uses `ralphy ref scrape-trends` to find hashtag candidates, then loops them through `add-source`.
- The user wants viral-moment extraction from a long-form video — that is a different sub-task with its own sub-doc (`viral-moments.md`); the topic-level synthesis here is not the right fit.

This skill is the workflow contract. The playbook is the tool encyclopedia. Don't duplicate; cross-reference.

## Workflow

1. **Confirm the question.** A topic without a research question produces a vague report. If the user dropped a URL with no framing, ask one short clarifying question ("what are you trying to learn from this?") before starting.
2. **`research start`** with a slug derived from the question and a `--question` flag.
3. **For each URL / handle:** `research add-source`. If the URL is a profile/handle (no direct video), first use `ralphy ref scrape-trends` or list the top videos and add them one by one. Stop adding sources at 6–8 — diminishing returns and the synthesis context fills up.
4. **`research synthesize`** once all sources reach `analyzed`. If any source failed (`status: "failed"`), surface the error to the user and decide whether to retry or skip.
5. **Show** the markdown report to the user. Surface the question, the Executive Summary, and 3–5 top findings inline. Point at the file path for the full read.
6. **Handoff:** the scenarist reads `sources.json` (specifically `keyFindings` per source) when writing the scenario. The art-director reads the `Patterns Across Sources` section when picking prompt seeds and model choices.

## When to fall back to the per-source `ref` chain

If the user only cares about **one source** (single TikTok, single Reel) and doesn't need a topic-level narrative, the per-source `ref` chain alone is enough — `ralphy ref pull <url>` then `ralphy ref blueprint <slug>` gives a single-source `blueprint.md`. Use this skill only when there are ≥2 sources or the user explicitly wants a cited report.

## Handoff to a fixer / scenarist agent

When the user says "now write the scenario" or similar, a downstream agent reads `sources.json` and `report.md`. The minimum it needs from you:

- Path to `report.md`
- Path to `sources.json`
- Topic slug (the dir name)
- Optional: which sources to weight more heavily (when one is a much stronger reference than the others)

Do not paraphrase the findings in chat — the report exists so chat doesn't have to.

## References

- `references/report-schema.md` — full schema of `sources.json` + section spec for `report.md`
- `docs/playbooks/researcher.md` — tool-deep-dive: yt-dlp flags, Playwright for JS-rendered sites, scrape-trends, viral-moments sub-task
- `cli/lib/research-topic.ts` — source-of-truth for the topic state machine
- `MODELS.md` — synthesis model defaults (`google/gemini-2.5-flash` via OpenRouter)
