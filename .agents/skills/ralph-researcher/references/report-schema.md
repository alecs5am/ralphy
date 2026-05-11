# Research report schema (v1.0)

The `ralphy research synthesize` pipeline writes two files to `workspace/research/<topic>/`:

- `report.md` — narrative document for humans + downstream chat consumers
- `sources.json` — machine contract for fixer / scenarist agents

`state.json` lives in the same dir and tracks bookkeeping (sources added, last synthesis, per-source status). `sources.json` is a snapshot of that state at synthesis time, plus the LLM-distilled `keyFindings` per source.

## `sources.json`

```ts
{
  topic: string,                    // slug, matches dir name
  question: string | null,          // research question passed to --question
  createdAt: string,                // ISO timestamp of topic creation
  lastSynthesizedAt: string | null, // ISO timestamp of latest synthesize run
  sources: Source[]
}

interface Source {
  id: string,                       // footnote id used in report.md — "1", "2", …
  url: string,                      // canonical URL passed to add-source
  refSlug: string,                  // slug under workspace/references/<refSlug>/
  title: string,                    // pulled from yt-dlp meta (or hostname fallback)
  addedAt: string,
  status: "pending" | "pulled" | "analyzed" | "failed",
  blueprintPath?: string,           // workspace/references/<refSlug>/blueprint.md
  keyFindings?: string[],           // 3–8 short bullets distilled by synthesize
  error?: string                    // present when status = "failed"
}
```

A `Source` with `status: "analyzed"` is safe to consume downstream. `pending` / `pulled` mean the ref chain is mid-flight. `failed` means `add-source` errored — `error` carries the message.

`keyFindings` is the most useful field for a scenarist agent: it is the LLM's distillation of *what is worth replicating* from that source. Where `blueprint.md` is the raw per-source dump, `keyFindings` is the post-synthesis takeaway.

## `report.md` structure

Synthesis prompt enforces this skeleton. Verify after each run; if any section is missing the model drifted and a re-run is warranted.

```md
# Research: <topic>

**Question:** <research question>
**Sources:** N · **Date:** YYYY-MM-DD

## Executive Summary
2–3 paragraphs answering the question directly.

## Key Findings
- Finding 1 [^1][^3]
- Finding 2 [^2]
- …

## Patterns Across Sources
Recurring hook structures, VO cadences, visual motifs, pacing tricks. Every claim cited.

## Actionable Recommendations
### For scenarist
- …
### For art-director
- …

## Open Questions
- …

## Sources
[^1]: <url> — <title>
[^2]: <url> — <title>
…
```

### Footnote citations

The synthesis prompt instructs the model to use `[^N]` markers tied to the `id` field in `sources.json`. A claim with no citation is a defect — re-run synthesis or flag it to the user.

### Per-source notes

The synthesis prompt does *not* produce a per-source Notes section in `report.md` — that would duplicate `blueprint.md` and bloat the file. The `keyFindings` array on each source in `sources.json` carries the per-source takeaway in compact form, and the original `blueprint.md` is always reachable at `workspace/references/<refSlug>/blueprint.md` if a reader needs the raw description.

## Per-source artifacts (read-only from the report's perspective)

These are written by the per-URL `ralphy ref` chain, not by `research synthesize`. The synthesis pass reads them as input:

| File | Source command | Used by synthesize |
|---|---|---|
| `workspace/references/<refSlug>/meta.info.json` | `ralphy ref pull` | yes — title, uploader, duration |
| `workspace/references/<refSlug>/source.mp4` | `ralphy ref pull` | indirectly (frames + audio derive from it) |
| `workspace/references/<refSlug>/source.mp3` | `ralphy ref pull` | indirectly (transcript + audio-describe) |
| `workspace/references/<refSlug>/frames/*.jpg` | `ralphy ref frames` | indirectly (analyze.json derives from frames) |
| `workspace/references/<refSlug>/transcript.json` | `ralphy ref transcribe` | yes — verbatim text |
| `workspace/references/<refSlug>/analysis.json` | `ralphy ref analyze` | yes — per-scene vision JSON |
| `workspace/references/<refSlug>/audio-analysis.json` | `ralphy ref audio-describe` | yes — tone / music / VO style |
| `workspace/references/<refSlug>/blueprint.md` | `ralphy ref blueprint` | yes — per-source narrative summary |

The synthesis step truncates each block before sending to the LLM (transcript ~4000 chars, analysis ~2500, audio ~1200, blueprint ~3000) to keep the prompt under context limits. If a source has unusually long material that needs full treatment, fall back to the per-source `ralphy ref blueprint` flow for that specific URL.
