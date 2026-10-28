# Hook library mined from corpus transcripts

> **Status:** todo (sequence after #556 Tier-1 transcripts)
> **Filed:** 2026-10-28
> **Folder:** issues
> **Severity:** medium
> **Category:** feature / knowledge base

## Context

Competitors sell hook libraries (Virlo claims 2.1M hooks). We will have Tier-1 transcripts and digests for positives, matched controls, negatives and a random sample (`docs/research/trend-dataset-spec.md`), so we can mine hooks with outcomes attached, which a plain list lacks.

## What

- Extract the opening statement (voice + on-screen text from the digest) for every Tier-1 video.
- Cluster into hook patterns (rules first, then embeddings); map to the hook types in `docs/virality-rubric.md` Part 4 and the #571 retention-review method.
- Per pattern: n, lift over the creator baseline, lift over matched controls, niche and size band, example references (links, never copied text in bulk).
- `ralphy hooks search --niche <n> --pattern <p>` for the scenarist; the scenarist skill cites it when writing a hook.

## Scope / acceptance

- Library built for at least 2 niches; minimum-n rule as in #558.
- Patterns that only appear in winners and never in controls are flagged as suspicious (likely too few controls), not promoted.
- Tests on fixture transcripts.
