# Captions

## Generation

Tool: `ralphy generate captions` (under the hood `cli/lib/transcribe.ts` → OpenRouter `openai/whisper-1`).

```bash
ralphy generate captions --project <id> \
  --audio workspace/projects/<id>/assets/voiceover/master.mp3 \
  --language ru
```

Output: `workspace/projects/<id>/captions.json` — `Caption[]` in the `@remotion/captions` shape:
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
    --audio assets/voiceover/scene-$n.mp3 \
    --output captions-$n.json
done
```

The composition imports them all and stitches per scene with offset.

## Consume in composition

The 12 ready-made components in `src/lib/components/captions/` accept `Caption[]` directly — no conversion needed:

- `HormoziCaptions` — large pop-effect, best for viral hooks
- `TikTokCaptions` — standard TikTok-style
- `KaraokeCaptions` — words highlight in sync with speech
- `Typewriter*` — typewriter
- `Glow*` / `Gradient*` / `Boxed*` / `Bounce*` — stylistic variants
- `YellowPop*` — bright yellow
- `LuxuryMinimal*` / `Minimal*` — thin/minimalist

Style choice is a function of the template / scenario vibe. Default for UGC — `HormoziCaptions` or `TikTokCaptions`.

## Word-boundary cuts (related)

When the editor cuts VO segments for viral moments / repurposing — **only on word boundaries**. whisper-1 word-level timestamps give honest boundaries. Mid-word cut → consonant clip. 30–200ms padding on each side is mandatory.
