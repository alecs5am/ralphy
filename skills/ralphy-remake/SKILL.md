---
name: ralphy-remake
description: >-
  Rework a copied video (v1) for an Account: apply its style lock, swap the subject, text, offer
  and call to action, add fixes taken from successful trend signals, and keep the proven timing
  skeleton (cuts, beats, shot lengths, hook, ending). Every state worth keeping is a saved version;
  the working render is compared against the copy and the reference. Triggers: "remake it for my
  account", "make it ours", "swap the product", "change the text / offer / CTA", "translate it", "new version", "переделай",
  "переделай под аккаунт", "адаптируй", "поменяй оффер", "сделай новую версию", "переведи".
---

# ralphy-remake

A lightly changed copy of a proven video is the most reliable way to make content that is not slop.
Change what the account needs and nothing else. Start from an approved v1 (`ralphy-reverse`); without one,
make it first.

## 1. Plan the changes

Read `account.md` (persona, `## Style`, rules), the reference's `breakdown.md` (KEEP / DO NOT ADD)
and the Content's `notes.md`. Write a CHANGE list into `notes.md` before editing:

| Layer | Usually changes | Stays |
|---|---|---|
| Timing skeleton | nothing | cuts, shot lengths, beat hits, hook timing, ending, loop |
| Subject | the product, the object, the topic | its framing, size and screen position |
| Text | the words, language | position, size, entry timing, emphasis pattern |
| Look | palette, type, caption look from the style lock | contrast, density, motion energy |
| Offer and CTA | the account's offer | where and when the reference closes |
| Sound | voiceover (new take), only if the words change | music, sound accents, levels |

Fixes from signals (`ralphy-trendwatch/references/signals-to-fixes.md`) go in one at a time, each
with its evidence, so the next stats can tell which change worked.

Show the CHANGE list to the user before building when it touches more than text and subject.

## 2. Build the version

Iterate on the working tree (it starts as the last saved version):

```bash
ralphy content save <id> -m "before <risky change>"   # before risky changes
ralphy render <id>                                     # overwrites render.mp4
ralphy content save <id> -m "v2: <account> style, <subject> swap, CTA"   # at every state worth keeping
ralphy content restore <id> vN                         # go back; the current state is saved first
```

Rules that cost the owner earlier rounds:

- New text keeps the old text's length and rhythm. A longer line breaks the timing; cut words, do
  not stretch shots. Russian runs longer than English: check every line fits.
- Style the text to the format. No default "AI type kit" (Cormorant or Playfair italic, gold
  hairline rules, gold letter-spaced small caps, em-dash attributions, words fading up one by one,
  Inter with a glow). Details and font coverage: `references/text-and-cta.md`.
- No photoreal AI people or pets. A swapped subject is code, the user's footage, or an authored
  non-photoreal image.
- A still image never stands alone: cutout parallax, beat-driven transitions and word-synced accents
  (`references/motion.md`). Plain Ken Burns read as weak.
- New voiceover: one continuous take, cut on word timings, stress-checked
  (`ralphy-fal/references/audio.md`).
- Generated media: cost first, the user's go (`ralphy-fal`).

## 3. Compare, three ways

Only the working tree has a render. Versions are code, so compare them in the panel: open the viewer
and use Compare to play Render, Current and any vN side by side with one shared play and seek.

```bash
ralphy tool compare refs/<slug>/source.mp4 videos/<nnn>-<slug>/render.mp4 --labels ref,remake
```

For a frame-level compare between two renders, clone the current render to the cache before
re-rendering, then compare it with the new `render.mp4` (the cache is scratch, safe to delete):

```bash
mkdir -p ~/.cache/ralphy/compare
cp -c videos/<nnn>-<slug>/render.mp4 ~/.cache/ralphy/compare/<nnn>-<slug>-copy.mp4
ralphy render <id>
ralphy tool compare ~/.cache/ralphy/compare/<nnn>-<slug>-copy.mp4 videos/<nnn>-<slug>/render.mp4 \
  --labels before,after
```

- Against the copy (v1 in the panel's Compare, or its render cloned to the cache): the skeleton
  survived. Cuts on the same frames, audio lag 0, the same median shot and still share.
- Against the reference: the energy survived. Not more static, not paler, text not smaller.
- Against the previous version: nothing regressed. A remake that "looks colourless now" is a
  regression even when it follows the style lock; ask the user which wins.

Report what changed, what stayed, and the sheet paths. When the user approves, the working tree's
`render.mp4` is what `ralphy-publish` posts; save that state as a version too
(`ralphy content save <id> -m "approved"`), then load `ralphy-publish`.

## Variants and series

Several offers or hooks for one copy: one saved version each (`v2`, `v3`, ...), same skeleton, and
`notes.md` lists what differs. A series: copy the approved remake's folder files into the next
Content (`ralphy content new`), change subject and text only.
