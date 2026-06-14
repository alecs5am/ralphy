---
name: social-copy
namespace: user
description: >-
  Fast, bulk social post COPY — a ready-to-paste description + a trending-hashtag set for a finished reel / image / carousel, shaped per platform (TikTok hook + 3-5 tags · Reels caption + 10-15 tags · Shorts ≤40-char title) in ONE pass. The last-mile of every published piece: source-grounded from the project's units / brief / the reference reel's on-screen text + caption (not a generic guess), in the niche's native voice (meme / brainrot register for the aura format, professional for a brand ad), in the TARGET-AUDIENCE language (chat language ≠ post language — offer EN + the audience language). Bulk mode runs across N units / a whole batch and emits one copy block per item. Persists into unit.json via `ralphy unit caption` (append-only). NOT video-subtitle SRT — that is `ralphy generate captions`.
  USE WHEN the user asks to "write a caption", "description + hashtags", "make a description", "captions for the batch", "post copy", "social copy", "what should I write under this reel", "give me hashtags", "caption this drop".
  TRIGGER (EN): "write a caption", "caption for this reel", "description and hashtags", "social copy", "post description", "captions for the batch", "trending hashtags for <niche>".
  See body for ALSO FIRE / DO NOT FIRE / HARD INVARIANTS.
---

# social-copy

The fast, batchable, on-voice social post copy layer — description + trending hashtags for a finished piece, shaped for TikTok / Reels / Shorts in one invocation. The skill DRAFTS; `ralphy unit caption` PERSISTS the copy into `unit.json`.

## ALSO FIRE

- The user just rendered / formed a unit and asks "and now? what do I write under it?" (any language).
- The user drops a niche + "give me trending hashtags" with no caption ask — still this skill (hashtag bank + format shaping).
- A batch of reels just finished and the user wants copy for all of them → bulk mode.

## DO NOT FIRE

- The user wants aligned-to-VO **subtitles / SRT burned into the video** — that is `ralphy generate captions` (a different surface). This skill is the social POST copy.
- The user wants the script / scenario itself — that is the scenarist playbook.
- The user wants to publish to the library — that is `templater` / `dev-publish-template`; caption is an input that path can carry.

## Hard invariants

1. **Target-audience language drives the copy, NOT the chat language.** Same rule as intake: if the audience is German, the post is German even if the user is chatting in English / Russian. Offer EN + the audience language. Pass `--language <lang>` to the verb.
2. **Source-ground every copy block.** Pull from the unit's `title` / `blurb` / `tags` / provenance, the project brief, and — when present — the reference reel's `meta.info.json` / transcript / on-screen text. Copy must describe the ACTUAL content, never a generic guess.
3. **Match the niche's native voice.** Meme / brainrot register for the aura format; professional for a brand ad. The niche is read from the matched #412 content-mode / the unit's tags / provenance, then carried into the draft.
4. **Hashtags come from the maintained bank, not invented.** The per-niche trending-tag bank lives at `cli/lib/social/hashtag-bank.ts` (niche spine + format tags + broad-reach, deduped + ordered). Trend tags rot — see the staleness note below.
5. **Append-only on the persisted caption.** `ralphy unit caption` never clobbers an existing caption: re-drafting requires `--force`, which archives the prior into `caption_versions`. AGENTS.md invariant #14.

## Platform shaping (one invocation, all three)

| Platform | Shape | Tags |
|---|---|---|
| **TikTok** | one punchy hook line (1 sentence, scroll-stopping) | 3-5 inline tags |
| **Reels** | a fuller caption (2-4 sentences, on-voice, soft CTA) | 10-15 tags |
| **Shorts** | a title, **≤ 40 chars** | tags optional |

The drafter writes the three copy bodies; the hashtag bank supplies the merged tag set (the verb caps it ~18, niche-first → format → broad-reach).

## The bulk-mode loop

For N units / a batch, do NOT hand-write each. Run once across all units:

```bash
ralphy unit caption <project> --bulk --language English
```

This drafts + writes one caption block per unit (skipping any that already have one unless `--force`). Single unit:

```bash
ralphy unit caption <project> <slug> --language English --niche aura
```

Useful flags: `--niche <hint>` (overrides the auto-detected register / tag spine), `--brief "<on-screen text / source caption>"` (extra grounding), `--force` (re-draft, archive prior).

## Source grounding

Before drafting, gather:
- The unit's `unit.json` — `title`, `blurb`, `tags`, `provenance` (style / template / recipes / assets).
- The project brief / `STORYBOARD.md` / `PRODUCTION_PLAN.md` if present.
- The reference reel's own caption + on-screen text (we store the source reel + its `meta.info.json` / transcript). The copy should echo the actual hook, not a generic line.

The verb folds the unit fields + `--brief` into the draft automatically; pass `--brief` when the strongest grounding (the source reel's caption / on-screen text) lives outside `unit.json`.

## The trending-hashtag bank + staleness

`cli/lib/social/hashtag-bank.ts` maps niche → curated tag spine (`aura`, `analog-horror`, `ps1-horror`, `tech-explainer`, `ugc-ad`, `unboxing`, `beauty`, `fitness`, `food`, `saas`, `general`) plus format tags (`reel` / `short` / `tiktok` / `carousel` / …) and a stable broad-reach set (`#fyp` etc.).

**Trend tags rot.** The bank stamps `LAST_REVIEWED`; the verb's JSON output reports `bank_stale: true` once it is older than 60 days. When stale (or for a hot niche), refresh BEFORE shipping:
- light path — run the `researcher` skill / a trend scrape on the niche + platform, read the current top tags, update the bucket in `hashtag-bank.ts`, bump `LAST_REVIEWED`.
- manual path — open the niche's top recent posts and copy the tags they rank under.

Broad-reach tags rarely rot; format + niche buckets drift on a ~monthly cadence.

## Worked example (one reel → TikTok / Reels / Shorts block)

A finished `aura-moment-001` unit (PS1-horror "aura" meme reel, format `video`, tags `["aura","ps1core","meme"]`), audience English:

```bash
ralphy unit caption aura-proj aura-moment-001 --language English
```

Drafts (niche auto-resolves to `aura`) and writes into `unit.json`:

```json
{
  "caption": {
    "platform": {
      "tiktok": "POV: your aura hits 999,999 and the room goes PS1",
      "reels": "When the aura is too strong the graphics downgrade to PS1. Caught it on camera before reality re-rendered. Watch till the end. Follow for more aura moments.",
      "shorts": "Aura: 999,999 (PS1 mode)"
    },
    "hashtags": ["#auramoment","#aura","#aurapoints","#ps1core","#brainrot","#meme","#sigma","#edit","#reels","#reelsinstagram","#instareels","#fyp","#foryou","#foryoupage","#viral","#trending"],
    "language": "English",
    "niche": "aura"
  }
}
```

To also offer the audience-language variant, re-run with `--language <lang> --force` (the EN block is archived into `caption_versions`).

## CLI cookbook

- Draft + persist one: `ralphy unit caption <project> <slug> [--language <lang>] [--niche <hint>] [--brief "<text>"]`
- Bulk across the project: `ralphy unit caption <project> --bulk [--language <lang>]`
- Re-draft (append-only): add `--force` (prior caption → `caption_versions`).
- Read it back: `ralphy unit show <project> <slug>` (the `caption` field).

Never write copy straight into `unit.json` by hand — the verb owns the write (logs the LLM draft to `generations.jsonl`, merges the bank, enforces append-only).
