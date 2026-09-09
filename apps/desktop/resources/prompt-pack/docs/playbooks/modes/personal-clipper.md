# Mode quality playbook — `personal-clipper`

> Cut one long-form video / stream / podcast into a handful of short vertical clips — highlight / clip extraction (#436). Full flow: [`.agents/skills/personal-clipper/SKILL.md`](../../../.agents/skills/personal-clipper/SKILL.md). Route: `intake → editor → ralphy render`. Clip-cut primitive: `ralphy clip`.

## Creative objective

Surface the few self-contained moments in a long source that stand alone as a short. A good clip has a hook in the first ~2s, one complete thought, and a clean out — cut at the spoken word, framed 9:16. The win is QUALITY over COUNT: a handful of strong clips beats a padded set of forgettable ones.

## Required inputs

- A long-form source the user has the right to clip (VOD / stream export / talk / video podcast). URL → `ralphy ref pull`; a local file is fine.

## Reference requirements

No model-reference gate at intake — the source is the user's own footage. The reference-required gate (AGENTS #3) only fires if a later generated overlay introduces a named real entity / branded product through `ralphy generate image`.

## Prompt spine (pipeline discipline, not a text prompt)

The piece is orchestrated from `ralphy` primitives:
1. **Ingest** — `ralphy ref pull <url>` (yt-dlp behind the verb) or a local file.
2. **Transcribe** — `ralphy ref transcribe <slug>` → a word-level transcript.
3. **Select windows (agent craft)** — read the transcript, pick self-contained `[from, to)` windows from word-level `startMs`. Present them (timestamp + quoted line) and wait for go.
4. **Cut** — `ralphy clip <source> --from <ts> --to <ts> --vertical --project <id>` per window. Re-encoded for frame-accurate boundaries; output is append-only in `artifacts/videos/`.
5. **Caption** — `ralphy generate captions` per clip; snap timing to `startMs` (AGENTS #16).
6. **Render / bake** — `ralphy render <id>` (the only render path) for any composition step.
7. **Readiness** — `ralphy project scorecard <id>` (#427); `/evaluator` for a deeper hook pass.
8. **Distribute** — `ralphy unit create` + `ralphy unit package` (#423) per surviving clip.

## Model recommendations

- **Transcript:** ElevenLabs Scribe (`ralphy ref transcribe` / `ralphy generate captions`) — word-level. Verify against `MODELS.md`.
- **No image / video generation** is part of the core route — the media is cut from the source, not synthesized.

## Style / visual constraints

- 9:16 vertical (`--vertical` = 1080x1920 centre-crop); drop it when the subject lives at the frame edges (a centre crop would lose it).
- Cut on the spoken word — every `--from` / `--to` derives from the transcript, never hand-written.
- Captions punch with the speech; do not occlude the speaker (soft tint + text-shadow, not a heavy box).
- On-disk files English even when the spoken audio is another language.

## Common failure modes

- **Treating `ralphy clip` as a viral-moment detector** → it only executes the cut; the agent selects windows from the transcript.
- **Padding to a requested clip count with weak windows** → invoke the no-good-clips stop instead.
- **Hand-writing timestamps** → snap to transcript `startMs`.
- **Raw `ffmpeg` / `yt-dlp`** → every step is a `ralphy` verb (AGENTS #2).

## Evaluation criteria

`scoreVideo` gate (refuses, not warns). Beyond the gate: each clip stands alone, hooks in the first ~2s, captions track the transcript, the 9:16 frame keeps the subject. `ralphy project scorecard` for the ship/repair verdict.

## No good clips found (mandatory outcome)

If the transcript yields no self-contained, hook-bearing windows, STOP and tell the user plainly — do not force weak clips to hit a count. Offer the closest alternative (a `podcast-video` overlay edit, or a richer source). This is the failure the mode exists to prevent.

## Does NOT apply to:

- A long-form video built ON TOP of the audio (overlays / faceless explainer) → that is `podcast-video` (the `audio-explainer` skill).
- A generated talking-head short → `ugc-review` / `tutorial-ugc`.
- A single trim with no selection step → just call `ralphy clip` directly, no mode needed.
- A clip-pack from MANY sources / a content farm → producer batch mode.
