# Captions

## Captions-first discipline (AGENTS.md invariant #16)

**If the composition has caption overlays, run `ralphy generate captions` on each scene VO BEFORE writing any HyperFrames / Remotion timing constant.** Then snap every constant — scene-in, scene-out, beat marker, music duck-point — to a word-level `startMs` from the resulting `captions.json`. Don't open `index.html` and start typing `data-start="2400"` from feel; that path costs 3–11 edit iterations per project (`venom-bodywash-001` at 1.0–1.4s off, `choose-your-guide-001` at 11 iterations) and the captions still drift.

For an aligned-to-VO cut as a whole (scene cuts gated by speech, not just caption overlays), use the stitched-VO scribe pattern in [`vo-sync.md`](./vo-sync.md) first — it produces one `transcript.json` that drives both the cut and the captions.

## Generation

Tool: `ralphy generate captions` (under the hood `cli/lib/transcribe.ts` → OpenRouter `openai/whisper-1`).

```bash
ralphy generate captions --project <id> \
  --audio .ralphy/workspaces/<ws>/projects/<id>/artifacts/voiceover/master.mp3 \
  --language ru
```

Output: `.ralphy/workspaces/<ws>/projects/<id>/captions.json` — `Caption[]`:
```ts
{ text: string; startMs: number; endMs: number; timestampMs: number; confidence: number }
```

Logged automatically: `provider: "openrouter"`, endpoint `openai/whisper-1`, cost ≈ $0.006 / audio-minute.

## Hard limits

- **≤25MB per file** (whisper-1 hard limit). Longer → re-encode mono 64kbps mp3 ahead of time or split into chunks.
- **Word-level timestamps only.** `timestamp_granularities[]=word` is already the default in `transcribe.ts`. Segment-level produces a ragged word-pop effect — we don't use it.
- **Language explicit** — `--language ru` for Russian. Auto-detect fails on short clips.

## Caching

**Don't re-run** if `captions.json` is fresher than the VO file (`mtime captions > mtime audio`). Check before invoking — every run costs $0.006/min + latency.

## Per-clip variant

Scenes with separate VOs → transcribe each one:

```bash
for n in 01 02 03; do
  ralphy generate captions --project <id> \
    --audio artifacts/voiceover/scene-$n.mp3 \
    --output captions-$n.json
done
```

The composition imports them all and stitches per scene with offset.

## Consume in composition

Install a caption-style block from the HyperFrames registry — `bunx hyperframes add <caption-slug> .ralphy/workspaces/<ws>/projects/<id>` — and point it at `captions.json`. Browse `bunx hyperframes catalog` for the full list (`kinetic-slam`, `karaoke-warm`, `matrix-decode`, `neon-accent`, etc.).

Style choice is a function of the template / scenario vibe. Default for UGC — a kinetic-slam or karaoke variant. See `.agents/skills/hyperframes/references/dynamic-techniques.md` for the caption-animation energy table.

## Word-boundary cuts (related)

When the editor cuts VO segments for viral moments / repurposing — **only on word boundaries**. whisper-1 word-level timestamps give honest boundaries. Mid-word cut → consonant clip. 30–200ms padding on each side is mandatory.
