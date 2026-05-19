# category-classifier

LLM pass to pick one of the 5 segment-persona category folders for the new template. The `--category` flag overrides this — use it when the LLM gets it wrong, but the default behavior is automatic so the user doesn't have to know the taxonomy.

## The five categories (defined in `templates/CATEGORIES.md`)

| Category folder | Segment / persona | Examples |
|---|---|---|
| `b2b-saas/` | SaaS launches, dev tools, productivity apps, indie hacker content | Cluely launch, Granola intro, AI agent demos |
| `dtc-commerce/` | Consumer brands, beauty, fashion, gadgets — anything that ships in a box | Glitter cream review, Old Spice spots, Nothing HP1 |
| `creator-lifestyle/` | Personal-brand creators, day-in-the-life, deadpan/comedic 2-handers | Noski deadpan philosophy, americanbaron-style, vlog opens |
| `entertainment-viral/` | Brainrot, meme, KBO-caught-on-TV, found-footage horror, Italian brainrot characters | Brainrot history, KBO broadcast, occult mockumentary |
| `cinematic-narrative/` | Story-driven, hyper-motion, Tokyo-y2k, spiderverse, anime, multi-scene narratives | Flipper hypermotion, Tokyo Y2K, skater spiderverse, fruit drama, playdate pixel |

These are stable axes — segment (what kind of audience) × persona (what kind of voice). They've been validated by the existing 43-template roster in `templates/`.

## LLM classification pass

Input: brief snippet + scenario.json title/intent + a sample of 3–5 prompts from `prompts.json`.

Prompt skeleton (via `callLLM()`):

```
Classify this finished video project into ONE of five categories:

1. b2b-saas — SaaS launches, dev tools, productivity, indie content
2. dtc-commerce — consumer brand, packaged product, e-commerce
3. creator-lifestyle — personal-brand creators, day-in-the-life, deadpan/comedic 2-handers
4. entertainment-viral — brainrot, meme, broadcast-trends, found-footage horror, viral 1-2 shot
5. cinematic-narrative — story-driven, hyper-motion, anime/comic style, multi-scene narrative

Source project signals:
- Brief: <BRIEF.md or first scenario.json sentence>
- Beat count: <scene count> beats over <duration>s
- Sample prompts: <3–5 representative prompts>
- Voice/dialogue presence: <yes/no — based on prompts.json having voiceovers>

Return JSON:
{
  "category": "<one-of-five>",
  "confidence": 0.0..1.0,
  "reasoning": "one-sentence why",
  "second_choice": "<one-of-other-four>"
}

Default to cinematic-narrative when ambiguous (it's the broadest category).
```

Model: `google/gemini-2.5-flash` is sufficient. This is a low-stakes classification.

## What if the LLM is wrong?

- `--category` flag overrides. Always wins.
- The output JSON surfaces the LLM's `reasoning` and `second_choice` so the user can fast-correct: "this is dtc-commerce not entertainment-viral because it's a branded product not a meme."
- `ralphy template suggest` does NOT use the category folder for ranking — it uses tags + description + TEMPLATE.md preview. So a wrong category just means the file lives in a slightly unexpected folder; the template is still discoverable. Low-cost mistake.

## Ambiguous cases (how to handle)

| Scenario | Decision |
|---|---|
| Branded product video with viral aesthetic | The brand wins → `dtc-commerce` |
| Personal-brand creator selling a course (B2C SaaS-ish) | Persona wins → `creator-lifestyle` |
| Cinematic narrative for a brand launch | `cinematic-narrative` if the narrative is the headline, `dtc-commerce` if the product is the headline |
| Brainrot meme advertising a SaaS tool | `entertainment-viral` (the format dominates the message) |
| 2-hander dialogue selling B2B | `creator-lifestyle` (format = creator-lifestyle, distribution = LinkedIn) |

The principle: classify by the dominant FORMAT/PERSONA, not by the underlying business model. Two B2B SaaS launches with very different visual languages (one explainer-style, one viral skit) belong in different category folders so consumers find them by aesthetic, not by buyer.

## Why a single category, not multiple?

Templates are filesystem entities; one slug → one folder. Multi-category tagging is solved at the `template.json:tags` layer (the suggest ranker uses tags, not categories). Categories exist purely for human navigation when browsing `templates/` in a file explorer.
