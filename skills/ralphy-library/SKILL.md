---
name: ralphy-library
description: >-
  Find and reuse ready parts from Ralphy's hosted component library: motion components (HyperFrames
  effects, text animations, transitions), video blocks (whole scenes or sections) and prompts.
  Use it before writing an effect from scratch while copying or remaking a video. Triggers: "is
  there a component for this", "find an effect like this", "text animation", "transition", "a
  ready block", "a prompt for this look", "найди компонент", "есть готовый эффект", "из
  библиотеки", "готовый блок", "промпт из библиотеки".
---

# ralphy-library

The library is a parts bin, not a template system. The reference stays the source of structure and
timing; a library part saves you writing an effect the reference uses.

## Find

```bash
ralphy lib search "kinetic type slam" --json
ralphy lib search "glitch transition" --kind motion
ralphy lib search "ascii flower" --kind video
ralphy lib search "oil painting look" --kind prompt
```

Kinds: `motion` (a HyperFrames component: an effect, a text animation, a transition), `video` (a
block: a whole scene or section with its media), `prompt` (a generation prompt with its notes).
Each item has an id, name, category, summary and tags. Search with the words of the effect you see in
the reference ("letters pop with stagger", "highlight box sweeps over a word"), not the topic of the
video.

## Use

```bash
ralphy lib get <id> --json      # downloads into the cache and prints where the files are
```

- Read the part's files before using it: what it expects (selectors, fonts, durations, variables).
- Copy it into the Content folder: markup and script into `index.html` (or a local file it loads),
  media into `media/`. Never reference the cache path from the composition; the cache can be wiped.
- Retime it to the reference: the part's default durations and easings are a starting point; the
  copy's clock comes from `cuts.json` and `beats.json`.
- Restyle it to the account's style lock in a remake; keep it as close to the reference as possible
  in the copy.
- A prompt part still goes through `ralphy-fal`: cost first, the user's go.
- Note the library id in `notes.md` so the next version knows where the part came from.

## When the host is unreachable

`ralphy lib` returns a clear error, or the cached copy with its date. Build the effect yourself; do
not block the video on the library.
