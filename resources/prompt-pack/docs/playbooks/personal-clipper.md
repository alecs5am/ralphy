# Personal clipper playbook

> Turn one long-form video / stream / podcast into a handful of short vertical clips. The agent reads the source's word-level transcript, picks the strongest self-contained windows, and cuts each into a 9:16 clip through the `ralphy clip` verb — then captions, renders, evaluates, and packages the survivors. This is the `personal-clipper` content mode (#436), a supported first-class route. NOT a magic "viral moment detector": the windows are an agent decision grounded in the transcript, and the verb only executes the cut.

## Sub-docs (read on demand)

| Doc | When to read it |
|---|---|
| [`docs/playbooks/modes/personal-clipper.md`](modes/personal-clipper.md) | The tight quality floor for the mode (creative objective, gates, negative scope) — read first to set the bar. |
| [`docs/playbooks/editor.md`](editor.md) | Composition / caption / render mechanics once a clip is cut. |
| [`docs/playbooks/editor/vo-sync.md`](editor/vo-sync.md) | Snapping cut boundaries + caption timing to word-level `startMs`. |
| [`docs/playbooks/researcher.md`](researcher.md) | Pulling the source video (`ref pull`) and frame/transcript tooling. |
| [`.agents/skills/audio-explainer/SKILL.md`](../../.agents/skills/audio-explainer/SKILL.md) | The adjacent long-form-OVERLAY mode; contrast with clip-EXTRACTION here. |

## When this mode fires

A brief that points at one long-form source and asks for short cuts: "cut my stream into shorts", "clip the best moments out of this podcast", "make 5 TikToks from this talk", "turn my 40-minute VOD into clips", "extract the highlights". The deterministic classifier (`classifyContentMode`) scores these to `personal-clipper`. It is a SUPPORTED route — promise it.

Contrast with the neighbours:
- **A long-form video built ON TOP of the audio** (overlays, faceless explainer) is `podcast-video` (the `audio-explainer` skill), not clip extraction.
- **A generated talking-head short** is `ugc-review` / `tutorial-ugc`, not a cut from an existing source.

## Source requirements + limits

- **Source:** a video the user owns or has the right to clip (a VOD, stream export, webinar, talk, long podcast with video). Pull a URL with `ralphy ref pull <url>`; a local file is fine too.
- **Minimum source length:** roughly > 3 min — below that, just trim with `ralphy clip` directly, there is nothing to "select".
- **Clip target duration:** 15-90s each (the short-form sweet spot). Default to ~30-60s.
- **Clip count:** only as many as the source actually supports. Do NOT pad to a requested number with weak windows (see the stop rule below).
- **Reference gate (AGENTS #3):** the source is the user's own footage — no model-reference gate fires. The gate only fires if a *generated* overlay later introduces a named real entity.

## The flow (one beat at a time, checkpoints between)

1. **Ingest the source.** `ralphy ref pull <url>` (yt-dlp behind the verb) or point at the local file. Never shell out to yt-dlp / ffmpeg directly (AGENTS #2).
2. **Transcribe.** `ralphy ref transcribe <slug> --language <lang>` → a word-level transcript (`transcript.json`). Confirm the language with the user first when non-English.
3. **Select highlight windows (the agent's craft).** Read the transcript. Pick self-contained windows: a complete thought with a hook in the first ~2s and a clean out. Each window is a `[from, to)` pair (word-level `startMs` → seconds). This is judgement grounded in the transcript text — NOT a detector the verb runs. Present the candidate windows (timestamp + the quoted line) and wait for the user's go before cutting.
4. **Cut each window.** `ralphy clip <source> --from <ts> --to <ts> --vertical --project <id>` per window. `--vertical` centre-crops to 9:16 (1080x1920); omit it to keep the source aspect. Output lands in `<project>/artifacts/videos/` (append-only, auto-versioned). Run the cuts in parallel — they are independent ffmpeg processes.
5. **Captions.** `ralphy generate captions` on each clip (Scribe word-level), then bake / overlay per the [editor playbook](editor.md). Snap caption timing to `startMs` (AGENTS #16) — never hand-write it.
6. **Render / bake.** `ralphy render <id>` is the only render path when a clip needs a HyperFrames composition (caption overlay, hook card). A bare crop+caption bake can stay an `artifacts/videos/` file promoted into a Unit.
7. **Evaluate readiness.** `ralphy project scorecard <id>` (#427) for the deterministic ship/repair verdict per clip; `/evaluator` for a deeper scroll-stop / hook pass. A failed gate refuses (AGENTS #4) — do not ship over it.
8. **Form + distribute Units.** `ralphy unit create <id> --slug <clip-slug> --format video --from "artifacts/videos/<clip>.mp4"` per surviving clip, then `ralphy unit package <id> <slug>` (#423) for the platform-spec'd distribution pack. `ralphy unit caption` for the post copy.

## The "no good clips found" outcome (mandatory)

If the transcript yields **no** self-contained, hook-bearing windows — a meandering stream with no quotable moments, an interview with no punchy beats, a source that is one long unbroken explanation — **STOP and tell the user**. Do NOT force weak clips to hit a count. The honest output is "I read the transcript and there are no clips here worth cutting; here is why" plus the closest alternative (e.g. "this reads better as a `podcast-video` overlay edit" or "give me a richer source"). A handful of strong clips beats a dozen forgettable ones — padding the count is the failure this mode exists to avoid.

## `ralphy clip` flag surface

```
ralphy clip <source> --from <ts> --to <ts> [--vertical] [--out <path>] [--project <id>]
```

| flag | meaning |
|---|---|
| `<source>` | Source video (absolute, or relative to cwd). |
| `--from <ts>` | Window start — seconds (`12.5`), `MM:SS` (`1:30`), or `HH:MM:SS` (`1:02:03`). |
| `--to <ts>` | Window end — same formats. Must be greater than `--from`. |
| `--vertical` | Centre-crop the clip to a 9:16 vertical frame (1080x1920). Off = keep source aspect. |
| `--out <path>` | Explicit output path. Optional when `--project` is set. |
| `--project <id>` | Logs the cut to the gen-log and resolves the default `--out` into `<project>/artifacts/videos/`. |
| `--force-overwrite` | Skip the `.v2` collision archive (default keeps prior versions). |
| `--note <note>` | Free-form note recorded in the gen-log row. |

The cut is re-encoded for frame-accurate boundaries, so a window chosen from a transcript lands on the spoken word rather than the nearest keyframe.

## Common failure modes

- **Treating `ralphy clip` as a detector** — it is not; the agent picks the windows from the transcript and calls the verb per window.
- **Hand-writing timestamps** — derive every `--from` / `--to` from the transcript's word-level `startMs`.
- **Padding to a requested clip count** — invoke the stop rule instead.
- **Raw `ffmpeg` / `yt-dlp`** — every step is a `ralphy` verb (AGENTS #2).
- **Vertical-cropping a clip whose subject lives at the frame edges** — a centre crop loses it; keep source aspect (drop `--vertical`) or reframe in the editor.
