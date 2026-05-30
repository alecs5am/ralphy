# Claim segmentation prompt

This is the LLM prompt for step 5 of the workflow — grouping word-stream into claim blocks and chapters.

Default model: `anthropic/claude-sonnet-4-6` via OpenRouter (verify against `MODELS.md` at call time).

## System prompt

```
You are an editorial assistant for a long-form faceless explainer video.
Your job is to take a word-level transcript and segment it into editorially-
meaningful units: claim blocks (2-8 seconds each, target 4 seconds) and
chapters (60-180 seconds each).

You do NOT rewrite the transcript. You do NOT translate. You return strict
JSON only — no prose, no markdown fences.
```

## User prompt template

```
Source language: {source_language}
Topic gloss: {topic_gloss}
Audio tone (from describe pass): {audio_tone}
VO style: {vo_style}

Word-level transcript (Caption[]):
{captions_json}

Task:

1. Group consecutive words into "claim blocks". A claim block is the smallest
   editorially-meaningful unit — one assertion the speaker makes.
   Rules:
   - Duration: 2-8 seconds. Target 4 seconds. Bias toward 4s when boundaries
     are ambiguous.
   - Break boundaries (in priority order):
     a) Full-stop / question mark in punctuation.
     b) Pause > 350ms between words (read `end` of word N vs `start` of word N+1).
     c) Discourse markers in the source language ("so", "but", "and then",
        "the thing is", "now", "alright", "ok", "well", and equivalents).
     d) Topic shift (noun-overlap between adjacent sentences < 30%).
   - Never split a hyphenated noun, a quoted phrase, or a code snippet across
     two claim blocks.

2. Group consecutive claim blocks into chapters. A chapter is 60-180 seconds
   of thematically-coherent claims.
   Rules:
   - Break boundaries:
     a) Pause > 1.5 seconds anywhere in a claim block — likely a section break.
     b) Discourse meta-cue ("alright, let's talk about X", "the next thing",
        "moving on", and equivalents).
     c) Noun-overlap to previous chapter < 20%.
   - Each chapter gets a 3-5 word name in the source language, capturing the
     theme. The name will appear on a chapter-card overlay.

3. Output strict JSON, this exact shape (no other keys, no trailing comments):

[
  {
    "chapter": 1,
    "chapter_name": "string (3-5 words, source language)",
    "claims": [
      {
        "start": 0.0,
        "end": 4.2,
        "vo_text": "the verbatim transcript chunk"
      }
    ]
  }
]
```

## Validation rules (skill applies after the LLM returns)

- Total `end` of last claim must equal (or be within 1s of) the last word's `end` in `captions.json`. If not — flag as `segmenter-coverage-drift` and re-prompt.
- No overlapping claim blocks: `claim[N].end` ≤ `claim[N+1].start`.
- No claim shorter than 1.5s or longer than 10s (slight tolerance on the documented 2-8s window).
- Chapter names ≤ 6 words.
- If chapter count > 20 for a 17-min video, the segmenter is over-fragmenting — re-prompt with stricter chapter rules.
