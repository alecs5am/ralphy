# Skill for fast, bulk social captions + trending hashtags

> **Status:** todo
> **Filed:** 2026-06-13
> **Folder:** issues

## Context

Recurring need surfaced across the trafalgar collab (2026-06-13): after a reel
renders, the user asks for an English post description + trending hashtags
(the "aura moment" trend-style copy). Today the agent free-hands this
each time — inconsistent, slow, and not reusable across the 4+ reels in a
batch. The user asked for a way to generate descriptions fast and in bulk.
No skill currently covers social post COPY —
the existing caption/transcribe surface is video-subtitle SRT, a different
thing.

## What

A user-facing skill (e.g. `social-copy` / `caption`) that, given a finished
project / unit (or a quick brief), produces ready-to-paste social post copy:

- **Description / caption** in the target language, in the niche's native voice
  (meme/brainrot register for the aura format, etc.), with 1-3 length variants
  (punchy hook / standard / longer POV-style).
- **Trending hashtag set** — a mix of format tags (#auramoment #ps1core #fyp),
  niche tags, and broad-reach tags, deduped and ordered.
- **Platform shaping** — TikTok (one hook + 3-5 tags), Reels (caption + 10-15
  tags), Shorts (≤40-char title). One invocation, all three.
- **Bulk mode** — run across N units / a batch of reels and emit a copy block
  per item (the bulk / "many at once" requirement), so a whole batch gets captions in one go.
- **Source grounding** — pull from the project's units / brief / the reference
  reel's own on-screen text + caption (we already store the source reel and its
  `meta.info.json` / transcript) so the copy matches the actual content, not a
  generic guess.

## Why it matters

Caption + hashtags are the last-mile of every published reel and currently the
least systematized step. A skill makes it fast, consistent, on-voice, and
batchable — directly serving the content-farm cadence the collab is moving
toward. Trend tags also drive reach, so a curated, reusable tag bank per niche
is real distribution value.

## Notes

- Decide skill vs. CLI verb: a `ralphy unit caption <project> <slug>` verb could
  persist copy into `unit.json` (publishable metadata) — but the fast path the
  user wants reads more like a craft skill. Possibly both: skill drafts, verb
  persists.
- Hashtag freshness: trend tags go stale. Either a maintained per-niche tag bank
  in the repo, or a light research step (the researcher skill / trend scrape)
  feeding current tags. Avoid hardcoding a frozen list.
- Language: target-audience language drives the caption (chat language ≠ post
  language — same rule as intake). Offer EN + the audience language.
- Voice: should read from the matched niche/format (meme register for aura,
  professional for a brand ad). Tie into the niche skills / templates.
- Related: `dev-publish-template` (publish path could carry the caption),
  `researcher` (trend tag sourcing), `notes/ideas/005` (provider spec — unrelated
  but same content-farm direction).

## Scope / acceptance

- New skill dir `.agents/skills/<slug>/SKILL.md` (`namespace: user`) with the
  trigger phrases ("write a caption", "description + hashtags", "make a
  description", "captions for the batch"), the platform-shaping templates, the
  bulk-mode loop, and the source-grounding step.
- Documents a per-niche trending-hashtag bank (file or research-fed) with a
  staleness note.
- A worked example end-to-end (one reel → TikTok/Reels/Shorts copy block).
- If a persistence verb is included: `cli/commands/unit.ts` gains a `caption`
  subcommand writing into `unit.json`; smoke test asserts the field is written;
  `bun test` green; no Cyrillic on disk; CLI surface + docs regenerated
  (`cli:surface:check`, `docs:cli:check`).
- Skill registered/normalized per `/normalize-skills`; routing table row added in
  `AGENTS.md` ("publish copy / captions + hashtags" → this skill).
