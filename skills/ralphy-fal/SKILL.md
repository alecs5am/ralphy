---
name: ralphy-fal
description: >-
  Generate media that code and existing footage cannot provide: images, video clips (text or image
  to video), voiceover, music, sound effects, transcription. Uses the fal hosted MCP server and,
  when needed, direct HTTP to ElevenLabs or OpenRouter. Covers model choice, cost shown first and
  the user's go, uploads, jobs, saving results, and model quirks. Triggers: "generate an image",
  "animate this frame", "make a clip", "add a voiceover", "make music", "which model", "how much
  will it cost", "сгенерируй картинку", "сгенерируй видео", "оживи кадр", "озвучь", "сделай
  музыку", "сколько стоит".
---

# ralphy-fal

Generation is the last resort, not the default. First: code (HyperFrames), the reference's own
sound, the user's footage, the library (`ralphy-library`), a host image tool when the agent has one. Pay
only for what is left.

## Connection

The plugin's `.mcp.json` adds the fal MCP server (`https://mcp.fal.ai/mcp`, bearer `FAL_KEY`). No
fal tools in your tool list: see `ralphy-setup` (key in the environment, or the OAuth relay).

Main tools: `recommend_model`, `search_models`, `get_model_schema`, `get_pricing`, `estimate_cost`,
`upload_file`, `verify_upload`, `run_model`, `submit_job`, `submit_jobs`, `wait_for_jobs`,
`cancel_job`, `check_account_status`.

## Every paid call

1. **Pick the model.** `recommend_model` with the task and hard requirements (9:16, duration,
   reference images, audio, language), or `search_models`. Read `get_model_schema` for the one you
   pick: durations, aspect ratios, reference slots, audio flags. Copy endpoint ids exactly; never
   guess one from memory. Known quirks: `references/video-prompts.md`, `references/image-prompts.md`.
2. **Price it.** `estimate_cost` with the exact input (or `get_pricing`). The server says pricing is
   optional; in Ralphy it is not. Tell the user the total in one line, e.g. "4 images x <model>
   ≈ $0.16, 2 clips x 5 s x <model> ≈ $1.12, total ≈ $1.28. Go?" Wait for the go. A go covers that
   batch only.
3. **Upload inputs.** Local file: `upload_file` with `prepare_upload: true`, `file_name`,
   `file_size`; then `curl --upload-file <file> "<upload_url>"` with the returned headers and no
   Authorization header; use `file_url` only after a 2xx (`verify_upload` when unsure). Keep the
   signed URL out of files and chat.
4. **Run.** Images: `run_model`. Video, music, long jobs: `submit_job` (or `submit_jobs` for up to 8
   variations) with a `submission_key` such as `<content-slug>-<slot>-<n>`, then `wait_for_jobs` with
   the original handles. Never call `run_model` or `submit_job` again to check a job: that starts a
   new paid job.
5. **Save.** Download every output into the Content's `media/` under a new name
   (`scene-03.png`, then `scene-03.v2.png`); never overwrite. Probe it (`ffprobe`): real duration,
   size, codec. Append to `notes.md`: endpoint, prompt, inputs, cost, request id.
6. **Show** the results; let the user choose before the composition uses one. Report the spend.

## Direct providers

Use them when fal has no fitting endpoint or the user's own voice library is needed. Load keys in the
same command and never print them: `set -a; . ~/.config/ralphy/keys.env; set +a`.

- ElevenLabs (`ELEVENLABS_API_KEY`, header `xi-api-key`): text to speech with the user's voices,
  Scribe speech to text with word timings (cheap, better than local whisper on names and Russian),
  music, sound effects. Endpoints and lessons: `references/audio.md`.
- OpenRouter (`OPENROUTER_API_KEY`, `https://openrouter.ai/api/v1/chat/completions`): a vision or
  audio model to describe a reference, check stresses in a Russian take, or read a contact sheet.

Same rule: price first, the user's go, save under new names, log in `notes.md`.

## Retry and restage

Retry a missed generation once with a concrete change. A second miss on the same axis means
restage: a different action, framing or model, or split the shot into 2-4 shorter ones the model
already handles. Tell the user what you changed before paying again. A rejected request (filter,
validation) is usually not billed; check the error before retrying.

## Do not

- No photoreal AI people or pets; the owner rejects realistic AI content.
- No text baked into generated images when the composition can set it (it misspells, and markdown
  `**` gets drawn).
- No edits of a file a running job reads; wait for the job.
