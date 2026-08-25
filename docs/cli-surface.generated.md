# Ralphy CLI Surface (generated)

> DO NOT EDIT. Regenerate via `bun run cli:surface:build`.
> The hand-curated companion lives at `docs/cli-surface.md`.

Verbs registered: **59**

## Top-level verbs

### `ralphy version`

```
____        __      __
   / __ \____ _/ /___  / /_  __  __
  / /_/ / __ `/ / __ \/ __ \/ / / /
 / _, _/ /_/ / / /_/ / / / / /_/ /
/_/ |_|\__,_/_/ .___/_/ /_/\__, /
             /_/          /____/
        agent content runtime · ralphy.dev

Usage: ralphy version [options]

Print the ralphy version (same as -v / --version)

Options:
  -h, --help  display help for command
```

### `ralphy new`

```
____        __      __
   / __ \____ _/ /___  / /_  __  __
  / /_/ / __ `/ / __ \/ __ \/ / / /
 / _, _/ /_/ / / /_/ / / / / /_/ /
/_/ |_|\__,_/_/ .___/_/ /_/\__, /
             /_/          /____/
        agent content runtime · ralphy.dev

Usage: ralphy new [options] [brief...]

Create a new project under <workspace>/projects/<id>/ with a canonical layout.
Lightweight on-ramp — pass a brief to seed BRIEF.md or just --id <slug> for an
empty shell. Equivalent to `ralphy project create` but with positional brief +
auto-defaulted --name (issue #031).

Arguments:
  brief                   Brief — free-form text describing the video to make

Options:
  --id <slug>             Project id slug (default: derived from brief or
                          YYMMDD-HHMMSS)
  --name <name>           Display name (default: title-cased id)
  --brand <id>            Brand id (registry lookup)
  --persona <id>          Persona id (registry lookup)
  --template <id>         Template id
  --platform <platform>   Target platform (default: "tiktok")
  --aspect-ratio <ratio>  Aspect ratio (default: "9:16")
  --duration <seconds>    Target duration in seconds
  -h, --help              display help for command

Examples:
  ralphy new "Spring 2026 ad for Acme dental floss"
  ralphy new --id summer-launch-001
  ralphy new "office-set walkthrough" --id office-walk-001
```

### `ralphy clone`

```
____        __      __
   / __ \____ _/ /___  / /_  __  __
  / /_/ / __ `/ / __ \/ __ \/ / / /
 / _, _/ /_/ / / /_/ / / / / /_/ /
/_/ |_|\__,_/_/ .___/_/ /_/\__, /
             /_/          /____/
        agent content runtime · ralphy.dev

Usage: ralphy clone [options] <url-or-ref>

Lift the style of a public clip into a reusable vibe-style template. Chains ref
pull → frames → analyze → blueprint → template create.

Arguments:
  url-or-ref            Public source URL (TikTok / Reels / Shorts / X) OR a
                        registered ref slug

Options:
  --as-template <id>    Output template id (default: derived from source slug)
  --strict-look         Mirror palette + grading + hook in the blueprint
  --prompt-only         Skip music / voice extraction (faster; visual prompts
                        only)
  --analyze-model <id>  Vision model id for frame analysis (default
                        google/gemini-2.5-flash)
  -h, --help            display help for command

Examples:
  ralphy clone https://tiktok.com/@x/video/72939...
  ralphy clone https://www.instagram.com/reel/Cabc123 --as-template winter-vibe-002
  ralphy clone existing-ref-slug --strict-look --prompt-only
```

### `ralphy skill`

```
____        __      __
   / __ \____ _/ /___  / /_  __  __
  / /_/ / __ `/ / __ \/ __ \/ / / /
 / _, _/ /_/ / / /_/ / / / / /_/ /
/_/ |_|\__,_/_/ .___/_/ /_/\__, /
             /_/          /____/
        agent content runtime · ralphy.dev

Usage: ralphy skill [options] [command]

Manage Ralphy skill installs across AI agents

Options:
  -h, --help            display help for command

Commands:
  install [options]     Install the Ralphy skill bundle into the selected agent
                        (claude / cursor / codex)
  uninstall [options]   Remove the Ralphy skill bundle + sentinel block from the
                        selected agent
  new [options] <name>  Scaffold a new skill: .agents/skills/<name>/SKILL.md +
                        docs/playbooks/<name>.md
  help [command]        display help for command

Examples:
  ralphy skill install --agent claude
  ralphy skill install <pack>      # alias: pass --agent <pack> through to the installer
  ralphy skill uninstall --agent claude
```

### `ralphy setup`

```
____        __      __
   / __ \____ _/ /___  / /_  __  __
  / /_/ / __ `/ / __ \/ __ \/ / / /
 / _, _/ /_/ / / /_/ / / / / /_/ /
/_/ |_|\__,_/_/ .___/_/ /_/\__, /
             /_/          /____/
        agent content runtime · ralphy.dev

Usage: ralphy setup [options]

Setup wizard — API keys, dev services

Options:
  --status                Print capability status as JSON and exit (no TUI)
  --link <path>           Link ralphy to a project directory (global config)
  --unlink                Remove the global project link
  --non-interactive       Agent / CI mode: never prompt, never open a TUI, emit
                          a JSON summary (default: false)
  -y, --yes               Alias for --non-interactive (default: false)
  --openrouter-key <key>  Deprecated and refused; use provider auth set
                          openrouter --stdin
  --elevenlabs-key <key>  Deprecated and refused; use provider auth set
                          elevenlabs --stdin
  --keys-from-env         Deprecated and refused; project/inherited env is not a
                          credential source (default: false)
  --project-dir <path>    Link ralphy to this project directory before
                          configuring keys. Implies --non-interactive
  --no-verify             Skip API ping verification when saving keys
  --allow-unverified      When --verify is on (default) and a key fails to
                          verify, save it anyway and exit 0 (default: false)
  -h, --help              display help for command
```

### `ralphy status`

```
____        __      __
   / __ \____ _/ /___  / /_  __  __
  / /_/ / __ `/ / __ \/ __ \/ / / /
 / _, _/ /_/ / / /_/ / / / / /_/ /
/_/ |_|\__,_/_/ .___/_/ /_/\__, /
             /_/          /____/
        agent content runtime · ralphy.dev

Usage: ralphy status [options]

Show enabled capabilities + linked project

Options:
  -h, --help  display help for command
```

### `ralphy doctor`

```
____        __      __
   / __ \____ _/ /___  / /_  __  __
  / /_/ / __ `/ / __ \/ __ \/ / / /
 / _, _/ /_/ / / /_/ / / / / /_/ /
/_/ |_|\__,_/_/ .___/_/ /_/\__, /
             /_/          /____/
        agent content runtime · ralphy.dev

Usage: ralphy doctor [options]

Env health check — keys, dependencies, project link. JSON for scripts; -p for
human view.

Options:
  -h, --help  display help for command
```

### `ralphy generate`

```
____        __      __
   / __ \____ _/ /___  / /_  __  __
  / /_/ / __ `/ / __ \/ __ \/ / / /
 / _, _/ /_/ / / /_/ / / / / /_/ /
/_/ |_|\__,_/_/ .___/_/ /_/\__, /
             /_/          /____/
        agent content runtime · ralphy.dev

Usage: ralphy generate|gen [options] [command]

Generate a single asset (image / video / voiceover / music / captions). Logs
cost + path automatically.

Options:
  -h, --help             display help for command

Commands:
  image [options]        Generate one image via OpenRouter (default:
                         google/gemini-3-pro-image-preview — nano-banana-pro,
                         multi-ref consistency, ≥4 concurrent). Pass --model
                         openai/gpt-5.4-image-2 when label typography matters
                         more than ref consistency.
  image-batch [options]  Fan out N image gens from a directory of `*.txt` prompt
                         files (each file → one slot named by stem). Shares
                         --model / --ref / --size across the batch; respects
                         #007 per-endpoint concurrency. #024
  video [options]        Generate one video via OpenRouter (default:
                         kling-v3.0-pro)
  voiceover [options]    Generate voiceover via ElevenLabs (default:
                         eleven_multilingual_v2)
  music [options]        Generate music bed via ElevenLabs Music (instrumental
                         by default)
  sfx [options]          Generate a sound effect via ElevenLabs Sound Generation
                         (≤22s)
  captions [options]     Transcribe audio to Caption[] (≤25MB). Default backend:
                         ElevenLabs Scribe v1 (word-level).
  help [command]         display help for command
```

### `ralphy provider`

```
____        __      __
   / __ \____ _/ /___  / /_  __  __
  / /_/ / __ `/ / __ \/ __ \/ / / /
 / _, _/ /_/ / / /_/ / / / / /_/ /
/_/ |_|\__,_/_/ .___/_/ /_/\__, /
             /_/          /____/
        agent content runtime · ralphy.dev

Usage: ralphy provider [options] [command]

Inspect provider connectors and their capability matrix (image / video / voice /
music / sfx / text / transcribe).

Options:
  -h, --help           display help for command

Commands:
  list [options]       List registered provider connectors, their capabilities,
                       and whether each is configured (key present).
  auth                 Manage scoped provider credentials
  test [options] [id]  Report each connector's availability + config validity.
                       Offline by default (no network); --ping hits the
                       endpoint.
  matrix [options]     Per-(model, capability, provider) parameter-coverage
                       matrix (#497): which connector-input params each provider
                       actually honors for a model, notable unsupported ones,
                       and the provider that covers them. Hand-curated registry
                       data (decision D-02) — an unknown model has no entry (no
                       entry = no warning at generate time). Example: ralphy
                       provider matrix --model bytedance/seedance-2.0
  help [command]       display help for command
```

### `ralphy models`

```
____        __      __
   / __ \____ _/ /___  / /_  __  __
  / /_/ / __ `/ / __ \/ __ \/ / / /
 / _, _/ /_/ / / /_/ / / / / /_/ /
/_/ |_|\__,_/_/ .___/_/ /_/\__, /
             /_/          /____/
        agent content runtime · ralphy.dev

Usage: ralphy models [options] [command]

Inspect available OpenRouter video models and their per-model parameter
constraints

Options:
  -h, --help           display help for command

Commands:
  list [options]       List all OR video-generation models with their per-model
                       durations / resolutions / aspect-ratios / frame-anchor
                       support
  show [options] <id>  Show full per-model schema (description + params + price
                       estimate) for one model
  alias [shorthand]    Resolve a model shorthand (`kling`, `nano banana pro`,
                       `gpt image 2`, ...) to its canonical OpenRouter slug.
                       With no argument, prints the full alias map.
  recommend [options]  Recommend a model for a content mode from observed
                       generation telemetry (#424). Ranks the (model, mode,
                       task) outcome summary by ok-rate + eval signal; falls
                       back to the MODELS.md/registry default (and says the
                       basis is the default) when telemetry is thin. PURE log
                       reading — no provider calls. Use --chose <model> --reason
                       <why> to log a manual override against the recommendation
                       (auditable JSONL at .ralphy/model-overrides.jsonl).
  preflight [options]  Dry-check a planned generation call against known
                       per-model constraints the OR catalog does NOT carry (max
                       prompt chars, kling multiframe base64 bug, ref-count cap,
                       --audio support, ElevenLabs duration range) — #445. PURE:
                       no network, no provider calls, no spend. Returns { ok,
                       violations[], hints[], recommendedFallbacks[] }; ok=false
                       means a guaranteed provider 400.
  help [command]       display help for command
```

### `ralphy daemon`

```
____        __      __
   / __ \____ _/ /___  / /_  __  __
  / /_/ / __ `/ / __ \/ __ \/ / / /
 / _, _/ /_/ / / /_/ / / / / /_/ /
/_/ |_|\__,_/_/ .___/_/ /_/\__, /
             /_/          /____/
        agent content runtime · ralphy.dev

Usage: ralphy daemon [options] [command]

Manage the local job worker (background process that executes queued ralphy
jobs)

Options:
  -h, --help       display help for command

Commands:
  start [options]  Start the daemon as a detached background process
  stop             Send SIGTERM to the daemon and wait up to 7s for graceful
                   exit
  status           Report whether the daemon is running and how many jobs are in
                   each state. Exits 2 if pending jobs exist but no worker is
                   running.
  help [command]   display help for command
```

### `ralphy queue`

```
____        __      __
   / __ \____ _/ /___  / /_  __  __
  / /_/ / __ `/ / __ \/ __ \/ / / /
 / _, _/ /_/ / / /_/ / / / / /_/ /
/_/ |_|\__,_/_/ .___/_/ /_/\__, /
             /_/          /____/
        agent content runtime · ralphy.dev

Usage: ralphy queue [options] [command]

Manage the local job queue (add work, watch progress, cancel, retry)

Options:
  --auto-start             Spawn the daemon if it's not running before applying
                           the subcommand (default off) (default: false)
  -h, --help               display help for command

Commands:
  add [options] <argv...>  Enqueue a raw shell command as a job. Pass the
                           wrapped command after `--`. For ralphy generate jobs,
                           use `generate ... --queue` instead.
  list [options]           List jobs (default: most recent first, all states)
  show <id>                Show full details of one job
  cancel [options] [id]    Cancel a pending/running job by id, OR bulk-cancel by
                           --tag and/or --state. Status is flipped to
                           'cancelled' (rows are never deleted).
  retry [options] [id]     Re-queue a failed/cancelled/blocked job by id, OR
                           bulk-retry by --tag and/or --state. Resets status to
                           'pending' and bumps retry_count (logs are preserved).
  resume [options] <id>    Release one migration-held pending job after the
                           matching migration Run is ready
  logs [options] <id>      Print all captured stdout+stderr lines for one job
  watch [options] [id]     Live monitor: with <id>, tails one job's logs in real
                           time; without, renders an ANSI dashboard of all
                           active jobs (Ctrl-C to exit)
  help [command]           display help for command
```

### `ralphy render`

```
____        __      __
   / __ \____ _/ /___  / /_  __  __
  / /_/ / __ `/ / __ \/ __ \/ / / /
 / _, _/ /_/ / / /_/ / / / / /_/ /
/_/ |_|\__,_/_/ .___/_/ /_/\__, /
             /_/          /____/
        agent content runtime · ralphy.dev

Usage: ralphy render [options] <project>

Render a project to MP4. Engine: HyperFrames (HTML + GSAP). Writes
<project>/render/final.mp4. Adds EBU R128 loudnorm with --loudnorm. Also
auto-emits a compressed social sibling render/final-social.mp4 (CRF 20 default,
x264 faststart) so 'render → upload' is one command; pass --no-compress to skip
it.

Arguments:
  project                Project ID

Options:
  --composition <id>     Composition id (default: index.html)
  --output <path>        Output mp4 path (default: <project>/render/final.mp4)
  --from-clip <path>     Pure-clip deliverable mode: faststart-wrap (and
                         optionally loudnorm) an existing mp4 instead of running
                         the HyperFrames engine. Logs to the project's gen-log
                         so the single-entry-point invariant (AGENTS.md #2)
                         holds. #009
  --loudnorm             Apply EBU R128 loudnorm (-16 LUFS) post-render via
                         ffmpeg
  --fps <fps>            Frame rate (default 30)
  --quality <quality>    Quality preset: draft|standard|high (HyperFrames
                         engine) OR web|print|archive (post-render CRF 23|18|12)
  --grade <preset>       Color-grade preset post-render: tv-commercial-soft |
                         tv-commercial-strong | cinematic-teal-orange |
                         analog-horror
  --format <format>      Output format: mp4|webm|mov|png-sequence (default mp4)
  --resolution <preset>  Resolution preset:
                         portrait|landscape|square|1080p|4k|...
  --music-variants       After the base render, mix one variant per
                         <project>/artifacts/music/*.mp3 onto the final mp4.
                         Writes render/final.<music-basename>.mp4 per bed. #049
                         (default: false)
  --music-volume <n>     Music gain for --music-variants (default 0.18,
                         background bed under VO) (default: 0.18)
  --no-compress          Skip the auto social-compressed deliverable
                         (render/final-social.mp4)
  --social-crf <n>       x264 CRF for the auto social cut (default 20; raise for
                         smaller files, lower for cleaner grain) (default: 20)
  --workers <n>          Parallel capture workers (number or 'auto'). Lower to 1
                         for heavy compositions (many embedded videos / large
                         GSAP timelines) that hit 'Runtime.callFunctionOn timed
                         out' under the default auto fan-out.
  --force-overwrite      Disable append-only auto-archiving — overwrite
                         render/final.mp4 and render/final-social.mp4 in place
                         instead of archiving the prior copies to final.v{N}.mp4
                         / final-social.v{N}.mp4 (#118) (default: false)
  --no-fix-letterbox     Skip the post-render letterbox auto-crop. HyperFrames
                         bakes a solid black bar under <video> compositions; the
                         heal runs by default and is a no-op when the frame is
                         already clean.
  --dry-run              Print the resolved render plan; no engine run (default:
                         false)
  --summary              Collapse the dry-run plan to a per-stage rollup
                         (default: false)
  -h, --help             display help for command

Examples:
  ralphy render spring-001
  ralphy render proj-001 --loudnorm
  ralphy render proj-001 --output ./out.mp4
  ralphy render proj-001 --fps 60 --quality high
  ralphy render arena-rocker-001 --from-clip raw.mp4 --loudnorm
  ralphy render proj-001 --no-compress              # master only, skip final-social.mp4
  ralphy render proj-001 --social-crf 18            # higher-quality (larger) social cut

The social cut: every render also writes render/final-social.mp4 — an x264
faststart re-encode of the finalized master, sized for direct upload. Default
CRF is 20 (not 23) because grainy registers (PS1 / VHS) are high-entropy and
ring at higher CRFs; raise --social-crf for a smaller file at the cost of grain
fidelity, lower it for a larger, cleaner cut. The social cut inherits the
master's already-loudnormed audio (no double loudnorm) and never overwrites
render/final.mp4 (append-only).
```

### `ralphy hyperframes`

```
____        __      __
   / __ \____ _/ /___  / /_  __  __
  / /_/ / __ `/ / __ \/ __ \/ / / /
 / _, _/ /_/ / / /_/ / / / / /_/ /
/_/ |_|\__,_/_/ .___/_/ /_/\__, /
             /_/          /____/
        agent content runtime · ralphy.dev

Usage: ralphy hyperframes|hf [options] [command]

HyperFrames inner-loop verbs (lint / validate / snapshot / render / save-version
/ extract-frames / watch). Wraps `bunx hyperframes` so iterations log to
generations.jsonl. Issue #028.

Options:
  -h, --help                          display help for command

Commands:
  lint [options] <project>            Run the in-repo HyperFrames lint (issue
                                      #047). Exit 1 on errors, 0 on warnings
                                      only.
  validate <project>                  Run `bunx hyperframes validate` against
                                      the project and log the result.
  snapshot [options] <project>        Capture key-frame PNGs via `bunx
                                      hyperframes snapshot`. When --at is
                                      omitted, auto-picks one timestamp per
                                      scene from STORYBOARD.md / scenario.json.
  render [options] <project>          Render a project to MP4. Thin namespace
                                      wrapper over `ralphy render` that adds the
                                      --require-snapshot-review staleness gate
                                      and a hyperframes.render gen-log row.
  save-version <project>              Deprecated alias for composition revise
  extract-frames [options] <project>  Extract still frames from a
                                      rendered/source video for QA via ffmpeg.
                                      Standalone helper — issue #012 may later
                                      route through a broader `ralphy video
                                      frame` verb.
  watch <project>                     Live-preview the composition via `bunx
                                      hyperframes watch`. Runs foreground;
                                      Ctrl-C to stop.
  help [command]                      display help for command

Examples:
  ralphy hyperframes lint spring-001
  ralphy hyperframes validate spring-001
  ralphy hyperframes snapshot spring-001                # auto --at from STORYBOARD
  ralphy hyperframes snapshot spring-001 --at 0.5 1.8 3.2
  ralphy hyperframes save-version spring-001            # deprecated: composition revise
  ralphy hyperframes render spring-001 --require-snapshot-review
  ralphy hyperframes extract-frames spring-001 --in render/final.mp4 --at 1.0 5.0
  ralphy hyperframes watch spring-001
```

### `ralphy editor`

```
____        __      __
   / __ \____ _/ /___  / /_  __  __
  / /_/ / __ `/ / __ \/ __ \/ / / /
 / _, _/ /_/ / / /_/ / / / / /_/ /
/_/ |_|\__,_/_/ .___/_/ /_/\__, /
             /_/          /____/
        agent content runtime · ralphy.dev

Usage: ralphy editor [options] [command]

Editor-stage observability — preflight clip checks, trim-analysis, composition
QA.

Options:
  -h, --help                          display help for command

Commands:
  preflight [options] <projectId>     ffprobe every clip + music in
                                      <project>/artifacts/, surface durations /
                                      fps / codec / audio / aspect, run a
                                      music-gap check, and verify every scenario
                                      scene has a corresponding clip on disk.
                                      Exit 1 on red. Run BEFORE `ralphy render`.
  trim-analyze [options] <projectId>  Run gemini-3.1-pro-preview vision over
                                      every clip in artifacts/videos/, write
                                      per-clip JSON to
                                      artifacts/analysis/<clip>.json, and
                                      aggregate to
                                      artifacts/analysis/summary.json.
                                      Idempotent: clips with mtime <= prior
                                      summary row are skipped. Parallelism is
                                      capped (default 3) to respect the
                                      gemini-3.1-pro-preview concurrency floor.
  help [command]                      display help for command
```

### `ralphy compose`

```
____        __      __
   / __ \____ _/ /___  / /_  __  __
  / /_/ / __ `/ / __ \/ __ \/ / / /
 / _, _/ /_/ / / /_/ / / / / /_/ /
/_/ |_|\__,_/_/ .___/_/ /_/\__, /
             /_/          /____/
        agent content runtime · ralphy.dev

Usage: ralphy compose [options] <projectId>

Deprecated alias for composition build

Arguments:
  projectId                Project ID

Options:
  --profile <name>         Build profile (default: "default")
  --remove-segment <slot>  Legacy segment removal (default: [])
  --out <path>             Legacy output path
  --dry-run                Print the legacy render plan
  -h, --help               display help for command
```

### `ralphy voice`

```
____        __      __
   / __ \____ _/ /___  / /_  __  __
  / /_/ / __ `/ / __ \/ __ \/ / / /
 / _, _/ /_/ / / /_/ / / / / /_/ /
/_/ |_|\__,_/_/ .___/_/ /_/\__, /
             /_/          /____/
        agent content runtime · ralphy.dev

Usage: ralphy voice [options] [command]

ElevenLabs voice library inspection — pre-flight checks before VO batches.

Options:
  -h, --help        display help for command

Commands:
  exists <voiceId>  Pre-flight check that an ElevenLabs voice ID resolves.
                    Returns 200 + voice metadata if OK, exits 1 with a clear
                    error if 404. Run before any multi-clip VO batch.
  clone [options]   Clone a voice into your ElevenLabs library via Instant Voice
                    Cloning (/v1/voices/add). Optional pre-pass through
                    /v1/audio-isolation strips background music / noise (#030).
  design [options]  Design a brand-new voice from a text description (POST
                    /v1/text-to-voice/design). Writes ~3 preview mp3s; a human
                    picks one BY EAR, then `ralphy voice create` freezes it into
                    the library. The pick is deliberately human-only.
  create [options]  Freeze a designed preview into a permanent library voice
                    (POST /v1/text-to-voice). Takes the generated_voice_id
                    printed by `ralphy voice design`.
  list              List voices available on the user's ElevenLabs account
                    (custom clones + favorites).
  help [command]    display help for command
```

### `ralphy whoami`

```
____        __      __
   / __ \____ _/ /___  / /_  __  __
  / /_/ / __ `/ / __ \/ __ \/ / / /
 / _, _/ /_/ / / /_/ / / / / /_/ /
/_/ |_|\__,_/_/ .___/_/ /_/\__, /
             /_/          /____/
        agent content runtime · ralphy.dev

Usage: ralphy whoami [options]

Show the per-user profile (skill score 0-10, developer badge, signals,
recommendation for adaptive intake). On first call, auto-backfills from on-disk
projects.

Options:
  --backfill         Scan every workspace (.ralphy/workspaces/*/projects/*) and
                     recompute signals from on-disk state (renders, postmortems)
                     (default: false)
  --set-level <n>    Pin skill score to <n> (0-10). Overrides auto-assessment.
  --set-developer    Mark this user as a developer — unlocks raw CLI suggestions
                     + ship-fast default (default: false)
  --unset-developer  Remove the developer badge (default: false)
  --reset            Reset profile to defaults (preserves firstSeen) (default:
                     false)
  --bump-session     Increment sessions_count (called by ralphy index on first
                     invocation per day) (default: false)
  -h, --help         display help for command
```

### `ralphy init`

```
____        __      __
   / __ \____ _/ /___  / /_  __  __
  / /_/ / __ `/ / __ \/ __ \/ / / /
 / _, _/ /_/ / / /_/ / / / / /_/ /
/_/ |_|\__,_/_/ .___/_/ /_/\__, /
             /_/          /____/
        agent content runtime · ralphy.dev

Usage: ralphy init [options]

Initialize workspace and config

Options:
  --defaults  Use all defaults without prompts
  -h, --help  display help for command
```

### `ralphy config`

```
____        __      __
   / __ \____ _/ /___  / /_  __  __
  / /_/ / __ `/ / __ \/ __ \/ / / /
 / _, _/ /_/ / / /_/ / / / / /_/ /
/_/ |_|\__,_/_/ .___/_/ /_/\__, /
             /_/          /____/
        agent content runtime · ralphy.dev

Usage: ralphy config [options] [command]

Manage configuration

Options:
  -h, --help         display help for command

Commands:
  list               Show all settings
  get <key>          Get a config value
  set <key> <value>  Set a config value
  help [command]     display help for command
```

### `ralphy brand`

```
____        __      __
   / __ \____ _/ /___  / /_  __  __
  / /_/ / __ `/ / __ \/ __ \/ / / /
 / _, _/ /_/ / / /_/ / / / / /_/ /
/_/ |_|\__,_/_/ .___/_/ /_/\__, /
             /_/          /____/
        agent content runtime · ralphy.dev

Usage: ralphy brand [options] [command]

Manage brands (design systems)

Options:
  -h, --help             display help for command

Commands:
  create [options]       Create a new brand
  list                   List all brands
  show <id>              Show brand details
  update [options] <id>  Update a brand
  delete <id>            Delete a brand
  extract <svg>          Parse an SVG and report layer structure: compound
                         paths, fill-rule, interior polygons, overlay rects.
                         JSON output.
  help [command]         display help for command
```

### `ralphy persona`

```
____        __      __
   / __ \____ _/ /___  / /_  __  __
  / /_/ / __ `/ / __ \/ __ \/ / / /
 / _, _/ /_/ / / /_/ / / / / /_/ /
/_/ |_|\__,_/_/ .___/_/ /_/\__, /
             /_/          /____/
        agent content runtime · ralphy.dev

Usage: ralphy persona [options] [command]

Manage personas (voice + style)

Options:
  -h, --help             display help for command

Commands:
  create [options]       Create a new persona
  list                   List all personas
  show <id>              Show persona details
  update [options] <id>  Update a persona
  delete <id>            Delete a persona
  help [command]         display help for command
```

### `ralphy ref`

```
____        __      __
   / __ \____ _/ /___  / /_  __  __
  / /_/ / __ `/ / __ \/ __ \/ / / /
 / _, _/ /_/ / / /_/ / / / / /_/ /
/_/ |_|\__,_/_/ .___/_/ /_/\__, /
             /_/          /____/
        agent content runtime · ralphy.dev

Usage: ralphy ref [options] [command]

Manage references (websites, social media)

Options:
  -h, --help                                     display help for command

Commands:
  add [options] <url>                            Add a reference URL to the registry
  create [options] <url>                         Alias of `ref add` — preferred form in playbooks
  list [options]                                 List all references
  show <id>                                      Show reference details
  attach [options] <refId>                       Attach reference to a project
  pull [options] [urls...]                       Pull a video via yt-dlp (single URL, default), OR bulk-download images when --kind reference-image / --from-file is set (#048). Bulk mode dedupes by sha256 and writes into <project>/artifacts/refs/.
  pull-site [options] <url>                      Fan-out Playwright crawl of a brand site → screenshots + tokens.json + apis.md (AGENTS invariant #15). Run BEFORE drafting brand-DNA or any code-on-screen creative.
  frames [options] <slug>                        Sample JPEG frame Artifacts from a pulled video reference Artifact
  transcribe [options] <slug>                    Transcribe a pulled audio reference Artifact into a data Artifact
  analyze [options] <slug>                       Run vision LLM over <slug>/frames/* → <slug>/analysis.json. Default prompt = UGC blueprint extractor.
  analyze-video [options] <slug-or-path-or-url>  Send the full mp4 to Gemini for precise shot-cut detection (better than `analyze` for fast-cut commercials). Arg can be a ref slug, a local file path, or an http(s) URL.
  audio-describe [options] <slug>                Send <slug>/source.mp3 to Gemini-audio → <slug>/audio-analysis.json (tone, music, VO style)
  blueprint [options] <slug>                     Synthesize <slug>/blueprint.md from {meta + analysis + audio-analysis + transcript}
  rasterize [options] <file>                     Rasterize a vector reference (SVG) to a crisp PNG at the requested long-edge size. Preserves intrinsic aspect ratio. `--bg <hex>` adds a solid background (default: transparent).
  paths [options] <slug>                         Print every research path for <slug> (helpful when scripting follow-ups)
  scrape-trends [options]                        Scrape TikTok hashtag pages via Playwright (Apify-compatible JSON shape) and rank with scoreTikTok()
  check [options] <project-id>                   Run the reference-required gate classifier on <project-id>'s scenario.json. Reports whether a real-entity name (person / brand-product / IP) was detected and, if so, whether at least one ref is attached. Exit 5 (gate) when the gate fires AND no ref is attached.
  pack [options] <project-id>                    Build/update the project's reference pack — gathers + classifies refs from artifacts/refs/ (and workspace shared/refs/ + research-facts hints) into a typed, lockable ref-pack.json + REF_PACK.md. Append-only: a re-run merges by path. `--add` registers a ref manually; `--show` prints without rebuilding; `--mode` reports missing required ref types.
  lint [options] <project-id>                    Lint the project's reference pack — flags missing files, unsupported formats, tiny resolutions, duplicate hashes, suspicious temp paths, missing provenance, and (with --mode) required ref types absent for the mode. Deterministic, no model calls. `--contact-sheet` also renders the grouped-by-type montage.
  contact-sheet [options] <project-id>           Render a grouped-by-type contact sheet of the project's image refs to artifacts/refs/contact-sheet.png (one row per ref type). Uses the existing ffmpeg contact-sheet recipe; append-only (auto-versions an existing sheet). Video/audio refs are excluded.
  delete <id>                                    Delete a reference
  locate [options]                               Locate an object in an image — returns pixel bbox(es) via Gemini vision
  help [command]                                 display help for command

Examples:
  ralphy ref pull https://tiktok.com/@x/video/72939...
  ralphy ref pull https://a.com/x.png https://b.com/y.jpg --kind reference-image --project my-proj-001
  ralphy ref pull --from-file urls.txt --kind reference-image --project my-proj-001
  ralphy ref pull-site https://example.com --project my-proj-001
  ralphy ref analyze my-reference-slug
  ralphy ref blueprint my-reference-slug
  ralphy ref check my-project-001                  # gate classifier on scenario.json
  ralphy ref check --text "Old Spice style hero"   # gate classifier on a raw brief
  ralphy ref pack my-project-001                    # build/update the typed reference pack
  ralphy ref pack my-project-001 --show             # print the pack without rebuilding
  ralphy ref pack my-project-001 --add artifacts/refs/hero.png --type product --lock
  ralphy ref pack my-project-001 --mode product-shot  # report missing required ref types
  ralphy ref locate --image shot.jpg --object "label tab on the bottle" --top-k 3
```

### `ralphy project`

```
____        __      __
   / __ \____ _/ /___  / /_  __  __
  / /_/ / __ `/ / __ \/ __ \/ / / /
 / _, _/ /_/ / / /_/ / / / / /_/ /
/_/ |_|\__,_/_/ .___/_/ /_/\__, /
             /_/          /____/
        agent content runtime · ralphy.dev

Usage: ralphy project [options] [command]

Manage video projects

Options:
  -h, --help                    display help for command

Commands:
  create [options] [name]       Create a Project
  list [options]                List Projects in a Workspace
  show <id>                     Show a Project
  status <id>                   Show database-derived Project stages, bindings,
                                Iteration, and feedback
  repair-plan [options] <id>    Build a deterministic eval-to-repair plan
                                (#409). Reads eval.json (+
                                eval-deep-vision.json's what_to_redo when
                                present), classifies each finding by owner
                                (art-director / scenarist / editor), orders by
                                severity, and writes repair-plan.json +
                                REPAIR_PLAN.md (append-only, auto-versions).
                                Makes ZERO model calls — the fixer gates paid
                                regeneration on user approval (every item starts
                                approvalState=pending). JSON output.
  council [options] <id>        Convene a seven-role production council (#415).
                                --phase preflight reviews production-plan.json
                                BEFORE paid generation; --phase polish reviews
                                eval.json (+ eval-deep-vision.json) AFTER eval
                                and BEFORE Unit formation. Each role is a single
                                callLLM() pass (NO media generation, NO
                                browsing). Writes council-preflight.json /
                                council-polish.json + a readable .md
                                (append-only, auto-versions). The polish
                                verdict's prioritizedActions use the #409 repair
                                vocabulary so they feed `ralphy project
                                repair-plan`. JSON output. Use --no-llm for the
                                deterministic fixture (offline / abstaining
                                roles).
  plan [options] <id>           Draft a structured production plan + compiled
                                production contract from a brief (contract phase
                                7, #407/#418). Deterministic content-mode +
                                template match + cost estimate; callLLM()
                                enrichment for language/register/scene-count.
                                The compiled production-contract.json adds the
                                forward-looking execution contract — content
                                mode, support classification (the #413
                                unsupported-mode refusal with the closest
                                supported mode), required artifacts,
                                eval/council gates, and Unit shape (distinct
                                from the on-disk ledger `project status
                                --contract`). Writes PRODUCTION_PLAN.md +
                                production-plan.json + production-contract.json
                                (append-only, auto-versions). JSON output.
  style-lock [options] <id>     Scaffold/write the STYLE_LOCK.md benchmark/style
                                grounding artifact (contract phase 6, #408).
                                Deterministic scaffold (visual register / pacing
                                / hook / caption+audio / do-not-do / benchmark
                                refs / model implications) seeded from the
                                project's production-plan.json (content_mode,
                                template, register, guidelines), plus one
                                callLLM() jsonMode enrichment pass (skip with
                                --no-llm). Append-only — auto-versions to
                                STYLE_LOCK.v{N}.md, never overwrites. Use
                                --check [--mode <m>] to gate: exits non-zero
                                when the lock is missing for a covered content
                                mode. JSON output.
  update [options] <id>         Update Project metadata with optimistic
                                concurrency
  iterate [options] <id>        Start the next Project Iteration
  transfer [options] [id]       Journal and verify a Project bucket transfer
  delete [options] <id>         Delete a project
  log [options] <id>            Tail project logs (generations / user-prompts /
                                user-assets)
  timeline <id>                 Merged project timeline (user requests + assets
                                + generations) as pretty chronological log
  log-prompt [options] [id]     Append a user-prompt entry to project logs.
                                Accept project id positionally OR via --project
                                (#031).
  log-asset [options] [id]      Append a user-asset entry to project logs.
                                Accept project id positionally OR via --project
                                (#031). With --copy-from <src>, copies the file
                                into <project>/artifacts/refs/ first
                                (auto-detects disposable macOS NSIRD / /tmp
                                paths and rescues them before they evaporate).
                                Sanitizes U+202F NARROW NO-BREAK SPACE in
                                filenames.
  score [options] <id>          Run virality rubric over scenario.json (Hard
                                fails + warnings, no LLM)
  image-pack [options] <id>     Scaffold a first-class image-pack workflow
                                (#429): writes pack.json (slot roles +
                                composition classes per kind) + a batch-ready
                                prompts/pack.jsonl for `generate image --batch`
                                (#024), and creates artifacts/images/,
                                artifacts/refs/, selected/, prompts/, logs/.
                                Default slot sets per --kind: app-store /
                                play-store (hero → feature-callouts → lifestyle
                                → dimensions → comparison → usage → cta),
                                ad-creative (the fb-creatives A-E 5-set), social
                                (cover + N feed). --count tunes the repeatable
                                middle of the set. Append-only — a prior
                                pack.json auto-versions unless --force. --score
                                runs the deterministic eval rubric (role
                                coverage / aspect / selected-set cohesion)
                                instead of scaffolding. JSON output. Example:
                                ralphy project image-pack take-a-minute-001
                                --kind app-store --count 4
  scorecard [options] <id>      Release-readiness scorecard (#427).
                                Deterministic AGGREGATOR — INGESTS the persisted
                                gate reports (eval.json, fidelity.json,
                                council-polish.json, STYLE_LOCK.md,
                                distribution-pack.json) + the contract's
                                native-video-gated `polished` and merges them
                                into ONE mode-aware verdict (ship | repair |
                                needs-user-decision | blocked) with twelve
                                per-dimension readings. Re-runs no gate, makes
                                ZERO model calls, never mutates the project. A
                                missing source artifact makes that dimension
                                `na`. Writes scorecard.json (append-only,
                                auto-versions). JSON output. Example: ralphy
                                project scorecard spring-001 --mode ugc-review
  grade-plan <id>               Grade a production plan BEFORE it becomes the
                                contract for expensive work (#432).
                                Deterministic CRITIC — reads
                                production-plan.json and grades it against the
                                content-mode registry expectations (mode fit,
                                missing inputs, research grounding, style lock,
                                model stack, cost/ETA, gates, first checkpoint)
                                into ONE verdict (strong | weak | blocked).
                                BLOCKED when the plan lacks a required artifact
                                for its mode (a required ref type / input
                                missing, a lock-required mode with no style
                                lock, an empty stack, an
                                unsupported/unclassified mode). Makes ZERO model
                                calls. Writes plan-grade.json + PLAN_GRADE.md
                                (append-only, auto-versions). JSON output.
                                Example: ralphy project grade-plan spring-001
  approve [options] <id>        Record a spend approval into the project-local
                                spend ledger (#444). Sets a hard USD budget cap,
                                optionally the allowed content modes, an expiry,
                                and a user-facing reason. OPT-IN: with no
                                approval recorded, generation is unchanged; once
                                recorded, `ralphy generate` checks the active
                                approval BEFORE every paid call and hard-stops
                                when it would breach (expired / mode not allowed
                                / spent+estimated > cap). Append-only — a new
                                approval appends, never overwrites
                                (spend-ledger.json). JSON output. Example:
                                ralphy project approve spring-001 --cap 10
                                --modes ugc-review,unboxing-ugc --expiry 24h
                                --reason "approved batch run"
  budget <id>                   Show the project's spend ledger state (#444):
                                the active budget cap, actual spend (sum of
                                generations.jsonl cost_usd), remaining budget,
                                an over-budget flag, expiry status, and the full
                                append-only approval history. With no ledger,
                                reports hasLedger:false and the actual spend so
                                far (generation is unenforced). Makes ZERO model
                                calls, never mutates the project. JSON output.
                                Example: ralphy project budget spring-001
  transcribe [options] <id>     Transcribe an audio file → captions.json
                                (Caption[]). Default backend: ElevenLabs Scribe
                                v1 (word-level).
  clone [options] <id>          Clone a project
  move <id> <workspace>         Move a project into another workspace's
                                projects/ and update its registry entry.
                                Precondition: no background job (ralphy generate
                                / render) may be mid-flight on the project — its
                                file paths go stale on move.
  assets [options] <id>         ffprobe-truth every media file under
                                <project>/artifacts/ and emit a flat array.
                                Honors --kind video|image|audio.
  verify [options] <id>         ffprobe every slot in asset-manifest.json and
                                flag divergences from claimed duration /
                                dimensions / size (tolerance: 100ms on
                                duration). Exit non-zero on any red.
  thumbnail [options] <id>      Extract a single frame from a project video.
                                Default source: <project>/render/final.mp4.
  audio-stats [options] <id>    Loudness table (mean/peak dBFS + integrated LUFS
                                + true peak + LRA) for every audio file under
                                <project>/artifacts/.
  contact-sheet [options] <id>  Grid montage of images. --slots accepts a glob
                                over <project>/artifacts/images/ (e.g.
                                'zine-*'). Default cols=5.
  zip [options] <id>            Zip a project's deliverables into
                                <cwd>/<id>.zip. --selected = <project>/selected/
                                only. --all = everything except logs/cache.
  help [command]                display help for command
```

### `ralphy unit`

```
____        __      __
   / __ \____ _/ /___  / /_  __  __
  / /_/ / __ `/ / __ \/ __ \/ / / /
 / _, _/ /_/ / / /_/ / / / / /_/ /
/_/ |_|\__,_/_/ .___/_/ /_/\__, /
             /_/          /____/
        agent content runtime · ralphy.dev

Usage: ralphy unit [options] [command]

Manage immutable publishable Units and platform presentations

Options:
  -h, --help              display help for command

Commands:
  create [options]        Create a Unit identity and its first sealed revision
  list [options]          List Units in the explicit scope
  show [options] <id>     Show a Unit and one exact sealed revision graph
  revise [options] <id>   Append a sealed Unit revision
  select [options] <id>   Select one sealed Unit revision independently of
                          latest
  add [options] <id>      Append one exact item by creating a new sealed
                          revision
  caption [options] <id>  Append immutable platform caption history in a new
                          Unit revision
  preview [options] <id>  Resolve one platform preview from an exact Unit
                          revision
  help [command]          display help for command
```

### `ralphy blueprint`

```
____        __      __
   / __ \____ _/ /___  / /_  __  __
  / /_/ / __ `/ / __ \/ __ \/ / / /
 / _, _/ /_/ / / /_/ / / / / /_/ /
/_/ |_|\__,_/_/ .___/_/ /_/\__, /
             /_/          /____/
        agent content runtime · ralphy.dev

Usage: ralphy blueprint [options] [command]

Assemble / inspect a reproduction-grade Blueprint for a project's unit
(#074/#076)

Options:
  -h, --help                  display help for command

Commands:
  create [options] <project>  Capture a self-contained Blueprint for a unit into
                              units/<slug>/blueprint/ (append-only)
  list <project>              List units that have a captured blueprint/ + which
                              versions exist
  show [options] <project>    Print a unit's latest blueprint.json
  use [options] <unit-id>     Scaffold a ready-to-run project from a PUBLISHED
                              Blueprint (offline; #079)
  help [command]              display help for command

Examples:
  ralphy blueprint create choose-silenthill-001 --unit choose-silenthill
  ralphy blueprint list choose-silenthill-001
  ralphy blueprint show choose-silenthill-001 --unit choose-silenthill
  ralphy blueprint use choose-silenthill --project choose-silenthill-repro-001
```

### `ralphy library`

```
____        __      __
   / __ \____ _/ /___  / /_  __  __
  / /_/ / __ `/ / __ \/ __ \/ / / /
 / _, _/ /_/ / / /_/ / / / / /_/ /
/_/ |_|\__,_/_/ .___/_/ /_/\__, /
             /_/          /____/
        agent content runtime · ralphy.dev

Usage: ralphy library [options] [command]

Read the public content library (units, blocks, blueprints, formats) from the
static library.json on Bunny CDN (read-only)

Options:
  -h, --help      display help for command

Commands:
  units           Finished deliverables (Units)
  templates       Reusable template blocks
  recipes         Reusable recipe blocks
  assets          Reusable asset blocks
  blueprints      Per-unit reproduction blueprints
  formats         The media-format taxonomy (static)
  help [command]  display help for command

Examples:
  ralphy library units list
  ralphy library units show animated-fb-ad
  ralphy library templates list
  ralphy library recipes show noir-grade
  ralphy library blueprints list
  ralphy library blueprints show choose-magicschool
  ralphy library formats list

Source: static library.json on Bunny CDN (override the URL with RALPHY_LIBRARY_URL).
```

### `ralphy template`

```
____        __      __
   / __ \____ _/ /___  / /_  __  __
  / /_/ / __ `/ / __ \/ __ \/ / / /
 / _, _/ /_/ / / /_/ / / / / /_/ /
/_/ |_|\__,_/_/ .___/_/ /_/\__, /
             /_/          /____/
        agent content runtime · ralphy.dev

Usage: ralphy template [options] [command]

Manage scenario/video templates

Options:
  -h, --help                        display help for command

Commands:
  clone [options] <url-or-ref>      Lift the style of a public clip into a
                                    reusable vibe-style template. Chains ref
                                    pull → frames → analyze → blueprint →
                                    template create.
  create [options]                  Create a template (flat JSON) from a project
                                    or file
  register <id>                     Import an existing legacy workspace template
                                    into the domain store
  list [options]                    List all templates (public library templates
                                    + the active workspace's templates/)
  show [options] <id>               Show template — prints TEMPLATE.md (the
                                    prompt-cookbook) for dir templates, JSON for
                                    flat. `--meta` prints the structured
                                    manifest facets (#075) for dir templates.
  use [options] <id>                Create a new project scaffolded from a
                                    template
  extract [options] <project-id>    Promote a finished workspace project into a
                                    reusable user-local template at the active
                                    workspace's templates/<slug>/
                                    (.ralphy/workspaces/<ws>/templates/). Copies
                                    prompts/, scenario, composition variables,
                                    and refs; substitutes brand/persona/VO with
                                    {{slots}}; drafts a README from POSTMORTEM
                                    'Lessons learned'. To publish it to the
                                    public library, use the templater /
                                    dev-publish-template path.
  delete <id>                       Delete a workspace template (flat file or
                                    whole dir). Public library templates are
                                    read-only — they live in the published
                                    library.json (Bunny CDN), not on disk.
  suggest [options] <utterance...>  Rank templates for a user utterance. Hybrid:
                                    substring scorer first (fast, free); if
                                    top-1 score is below threshold (default
                                    0.7), fall through to an LLM-rerank pass
                                    that handles Russian / paraphrase /
                                    concept-level / typo queries. Returns top-N
                                    with reasoning when LLM fires.
  help [command]                    display help for command

Examples:
  ralphy template suggest "unboxing video for my skincare brand"
  ralphy template list --format video
  ralphy template use <slug> --project <id> --brief "<the swap>"
```

### `ralphy guideline`

```
____        __      __
   / __ \____ _/ /___  / /_  __  __
  / /_/ / __ `/ / __ \/ __ \/ / / /
 / _, _/ /_/ / / /_/ / / / / /_/ /
/_/ |_|\__,_/_/ .___/_/ /_/\__, /
             /_/          /____/
        agent content runtime · ralphy.dev

Usage: ralphy guideline [options] [command]

Prompt-library guidelines — LLM rules for writing model-specific prompts

Options:
  -h, --help             display help for command

Commands:
  list                   List every guideline shipped in the repo
  show [options] <slug>  Print guideline.md raw (pipe-friendly for LLM
                         consumers)
  use [options] <slug>   Resolve a guideline tag — prints the body + the agent
                         tag for the next prompt
  help [command]         display help for command
```

### `ralphy benchmark`

```
____        __      __
   / __ \____ _/ /___  / /_  __  __
  / /_/ / __ `/ / __ \/ __ \/ / / /
 / _, _/ /_/ / / /_/ / / / / /_/ /
/_/ |_|\__,_/_/ .___/_/ /_/\__, /
             /_/          /____/
        agent content runtime · ralphy.dev

Usage: ralphy benchmark [options] [command]

Golden benchmark sets — good/acceptable/bad examples per content mode

Options:
  -h, --help      display help for command

Commands:
  list            List every benchmark set shipped in the repo
  show <slug>     Print a benchmark set: its examples, labels, and pass/fail
                  features
  help [command]  display help for command
```

### `ralphy memory`

```
____        __      __
   / __ \____ _/ /___  / /_  __  __
  / /_/ / __ `/ / __ \/ __ \/ / / /
 / _, _/ /_/ / / /_/ / / / / /_/ /
/_/ |_|\__,_/_/ .___/_/ /_/\__, /
             /_/          /____/
        agent content runtime · ralphy.dev

Usage: ralphy memory [options] [command]

Tiered memory store — global .ralphy/memory/ + per-workspace memory/ (markdown
entries, append-only)

Options:
  -h, --help                      display help for command

Commands:
  note [options] <text>           Write an ACTIVE memory entry directly (an
                                  explicit user remark is its own consent)
  propose [options] <text>        Stage a candidate entry into proposed/
                                  (promoted via `ralphy memory approve`)
  list [options]                  List memory entries (default: active entries
                                  of BOTH tiers)
  show [options] <slug>           Print one entry (no tier flag: workspace tier
                                  first, then global)
  search [options] <query>        Case-insensitive substring scan over
                                  frontmatter + body across both tiers
  approve [options] [slug]        Promote a proposed/ entry to active (+ index
                                  line). MOVE, never copy-and-delete
  reject [options] <slug>         Move a proposed/ entry to rejected/ (MOVE —
                                  the file is never unlinked)
  retire [options] <slug>         Move an ACTIVE entry (all its versions) to
                                  archived/ and drop its index line. MOVE, never
                                  delete
  curate [options]                LLM health pass over active entries: stage
                                  overlap-merges into proposed/, flag missing
                                  negative scope + stale references. Never
                                  mutates active entries
  distill [options] <project-id>  Distill a project's postmortem (02-lessons.md,
                                  05-workflow-fixes.md) into memory PROPOSALS —
                                  review with `ralphy memory approve`
  recall [options]                Merged digest for intake context: global +
                                  workspace active entries (workspace wins on
                                  slug collision)
  help [command]                  display help for command

Layout:
  global tier     .ralphy/memory/                    cross-workspace lessons (model quirks, craft, tooling)
  workspace tier  .ralphy/workspaces/<ws>/memory/    client / universe facts (cast, style DNA, rejections)
  per tier        <slug>.md + MEMORY.md index + proposed/ staging + rejected/

Append-only: re-noting an existing slug writes <slug>.v2.md (then v3...) and the
index points at the newest version; pass --force-overwrite for in-place replace.
Current dirs: /Users/maximovchinnikov/github/ralphy/ralphy/.worktrees/sqlite-domain-store/.ralphy/memory
```

### `ralphy lessons`

```
____        __      __
   / __ \____ _/ /___  / /_  __  __
  / /_/ / __ `/ / __ \/ __ \/ / / /
 / _, _/ /_/ / / /_/ / / / / /_/ /
/_/ |_|\__,_/_/ .___/_/ /_/\__, /
             /_/          /____/
        agent content runtime · ralphy.dev

Usage: ralphy lessons [options] [command]

Route durable failure lessons (postmortem + eval + repair + council + gen-log)
to the right knowledge surface

Options:
  -h, --help                 display help for command

Commands:
  route [options] <project>  Classify a project's lessons into proposals
                             (memory|guideline|MODELS.md|content-mode|template|skill|cli-issue|drop).
                             Stages ONLY memory proposals into proposed/; every
                             other route is report-only
  help [command]             display help for command
```

### `ralphy session`

```
____        __      __
   / __ \____ _/ /___  / /_  __  __
  / /_/ / __ `/ / __ \/ __ \/ / / /
 / _, _/ /_/ / / /_/ / / / / /_/ /
/_/ |_|\__,_/_/ .___/_/ /_/\__, /
             /_/          /____/
        agent content runtime · ralphy.dev

Usage: ralphy session [options] [command]

Manage immutable Agent Sessions

Options:
  -h, --help       display help for command

Commands:
  start [options]  Start a new Agent Session for the explicit scope
  show <id>        Show an Agent Session
  list [options]   List Agent Sessions in the explicit scope
  end <id>         End an Agent Session with no active Run
  help [command]   display help for command
```

### `ralphy document`

```
____        __      __
   / __ \____ _/ /___  / /_  __  __
  / /_/ / __ `/ / __ \/ __ \/ / / /
 / _, _/ /_/ / / /_/ / / / / /_/ /
/_/ |_|\__,_/_/ .___/_/ /_/\__, /
             /_/          /____/
        agent content runtime · ralphy.dev

Usage: ralphy document [options] [command]

Manage immutable Documents

Options:
  -h, --help                    display help for command

Commands:
  create [options]              Create a workspace- or Project-scoped Document
  list [options]                List Documents in the explicit scope
  show [options] <id>           Show safe Document metadata without its body
  revisions [options] <id>      List immutable Document Revisions
  revise [options] <id>         Append a Document Revision
  search [options] <query>      Search current text Document heads
  bind [options] <revision-id>  Bind a Document Revision to a Project role
  help [command]                display help for command
```

### `ralphy activity`

```
____        __      __
   / __ \____ _/ /___  / /_  __  __
  / /_/ / __ `/ / __ \/ __ \/ / / /
 / _, _/ /_/ / / /_/ / / / / /_/ /
/_/ |_|\__,_/_/ .___/_/ /_/\__, /
             /_/          /____/
        agent content runtime · ralphy.dev

Usage: ralphy activity [options] [command]

Read the monotonic activity feed

Options:
  -h, --help      display help for command

Commands:
  list [options]  List activity after an exclusive sequence
  help [command]  display help for command
```

### `ralphy artifact`

```
____        __      __
   / __ \____ _/ /___  / /_  __  __
  / /_/ / __ `/ / __ \/ __ \/ / / /
 / _, _/ /_/ / / /_/ / / / / /_/ /
/_/ |_|\__,_/_/ .___/_/ /_/\__, /
             /_/          /____/
        agent content runtime · ralphy.dev

Usage: ralphy artifact [options] [command]

Manage immutable Artifacts

Options:
  -h, --help                     display help for command

Commands:
  create [options]               Create a workspace- or Project-scoped Artifact
  list [options]                 List Artifacts in the explicit scope
  show [options] <id>            Show safe Artifact metadata
  revisions [options] <id>       List immutable Artifact Revisions
  revise [options] <id>          Append an Artifact Revision using an existing
                                 Object
  promote [options] <id>         Select an Artifact Revision
  state [options] <revision-id>  Append a state-changing Artifact Revision
  usage [options] <revision-id>  List or add a safe Artifact usage
  help [command]                 display help for command
```

### `ralphy feedback`

```
____        __      __
   / __ \____ _/ /___  / /_  __  __
  / /_/ / __ `/ / __ \/ __ \/ / / /
 / _, _/ /_/ / / /_/ / / / / /_/ /
/_/ |_|\__,_/_/ .___/_/ /_/\__, /
             /_/          /____/
        agent content runtime · ralphy.dev

Usage: ralphy feedback [options] [command]

Manage Iteration feedback

Options:
  -h, --help              display help for command

Commands:
  add [options]           Add feedback to an Iteration
  list [options]          List Project feedback
  resolve [options] <id>  Resolve feedback
  help [command]          display help for command
```

### `ralphy composition`

```
____        __      __
   / __ \____ _/ /___  / /_  __  __
  / /_/ / __ `/ / __ \/ __ \/ / / /
 / _, _/ /_/ / / /_/ / / / / /_/ /
/_/ |_|\__,_/_/ .___/_/ /_/\__, /
             /_/          /____/
        agent content runtime · ralphy.dev

Usage: ralphy composition [options] [command]

Manage versioned Compositions and reproducible Builds

Options:
  -h, --help             display help for command

Commands:
  show <id>              Show revision history with nested Builds and outputs
  list [options]         List Compositions in a Project
  revise [options] <id>  Create a draft child and materialize its editable
                         checkout
  build [options] <id>   Snapshot, seal, and build one exact draft revision
  select [options] <id>  Select a sealed Composition revision
  help [command]         display help for command
```

### `ralphy batch`

```
____        __      __
   / __ \____ _/ /___  / /_  __  __
  / /_/ / __ `/ / __ \/ __ \/ / / /
 / _, _/ /_/ / / /_/ / / / / /_/ /
/_/ |_|\__,_/_/ .___/_/ /_/\__, /
             /_/          /____/
        agent content runtime · ralphy.dev

Usage: ralphy batch [options] [command]

Manage batch operations

Options:
  -h, --help                 display help for command

Commands:
  create [options]           Create a batch
  list                       List all batches
  show <id>                  Show batch details
  status <id>                Show batch status
  review <id>                Deterministic triage over a batch's member projects
                             (#410). Rolls up winners (ship-ready, #411),
                             failures (failed eval), a cost roll-up (sum of
                             per-project generations.jsonl cost_usd), style
                             drift (eval style.*/brief.* findings vs the shared
                             style lock), repeated model failures (the same
                             model/error recurring across ≥2 items), and
                             recommended repairs (the #409 owner buckets). Makes
                             ZERO model calls — pure aggregation over existing
                             artifacts. JSON output.
  tournament [options] <id>  Rank a batch's variant projects, pick a champion,
                             and preserve the losers with rationale (#421).
                             Model-assisted by default (scoreImage for still
                             variants, scoreVideo for clip variants); --manual
                             <scores.json> for the cheap no-model mode. Writes
                             tournament.json. NEVER deletes a losing variant
                             (append-only #14).
  delete [options] <id>      Delete a batch
  submit [options]           Submit a batch of jobs to the local daemon with
                             symbolic dependencies. Use this for the 'N
                             generations + 1 render' pattern.
  vary [options]             Create N project variants from a base project
                             differing on one axis (hook / body / cta /
                             persona). Use this for A/B testing the hook without
                             re-running the rest of the pipeline.
  help [command]             display help for command
```

### `ralphy asset`

```
____        __      __
   / __ \____ _/ /___  / /_  __  __
  / /_/ / __ `/ / __ \/ __ \/ / / /
 / _, _/ /_/ / / /_/ / / / / /_/ /
/_/ |_|\__,_/_/ .___/_/ /_/\__, /
             /_/          /____/
        agent content runtime · ralphy.dev

Usage: ralphy asset [options] [command]

Alias for `ralphy artifact`

Options:
  -h, --help                     display help for command

Commands:
  create [options]               Create a workspace- or Project-scoped Artifact
  list [options]                 List Artifacts in the explicit scope
  show [options] <id>            Show safe Artifact metadata
  revisions [options] <id>       List immutable Artifact Revisions
  revise [options] <id>          Append an Artifact Revision using an existing
                                 Object
  promote [options] <id>         Select an Artifact Revision
  state [options] <revision-id>  Append a state-changing Artifact Revision
  usage [options] <revision-id>  List or add a safe Artifact usage
  help [command]                 display help for command
```

### `ralphy workspace`

```
____        __      __
   / __ \____ _/ /___  / /_  __  __
  / /_/ / __ `/ / __ \/ __ \/ / / /
 / _, _/ /_/ / / /_/ / / / / /_/ /
/_/ |_|\__,_/_/ .___/_/ /_/\__, /
             /_/          /____/
        agent content runtime · ralphy.dev

Usage: ralphy workspace [options] [command]

Manage account workspaces: profile, channels, shared brand assets, projects, and
units

Options:
  -h, --help                     display help for command

Commands:
  create [options] <name>        Create a Workspace
  list [options]                 List Workspaces
  show <id>                      Show a Workspace
  use <slug>                     Deprecated: use explicit --workspace or start a
                                 Session
  update [options] <id>          Update Workspace metadata with optimistic
                                 concurrency
  account [options] <workspace>  List or upsert public social-account metadata
  eval [options] <project>       Score a project against its account workspace
                                 evaluator rubric
  roi <slug>                     Show realized generation spend and measured
                                 account performance
  stats [slug]                   Show project, unit, and shared-asset counts for
                                 an account workspace
  help [command]                 display help for command
```

### `ralphy calendar`

```
____        __      __
   / __ \____ _/ /___  / /_  __  __
  / /_/ / __ `/ / __ \/ __ \/ / / /
 / _, _/ /_/ / / /_/ / / / / /_/ /
/_/ |_|\__,_/_/ .___/_/ /_/\__, /
             /_/          /____/
        agent content runtime · ralphy.dev

Usage: ralphy calendar [options] [command]

Workspace content calendar (#504): recurring posting slots
(weekday/time/timezone, unit type, platforms) + dated entries with an idea →
queued → produced → gated → scheduled → published lifecycle. Stored at
<workspace>/calendar.json with an append-only calendar-events.jsonl history.

Options:
  -h, --help           display help for command

Commands:
  show [options] <ws>  Show a workspace's calendar: recurring slots + upcoming
                       entries (undated queued entries first, then dated ones
                       from now on; --all includes past entries). Example:
                       ralphy calendar show my-studio
  add [options] <ws>   Add a recurring slot (--weekday mon..sun --time HH:MM
                       --unit-type <format> [--platforms
                       youtube,tiktok,instagram,x,telegram] [--timezone <IANA>,
                       default: system] [--id <slot-id>]) OR a dated entry (--at
                       <ISO> --unit-type <format> [--platforms ...] [--slot
                       <slot-id>]). Examples: ralphy calendar add my-studio
                       --weekday mon --time 09:00 --unit-type ugc-review
                       --platforms tiktok,youtube | ralphy calendar add
                       my-studio --at 2026-07-13T09:00:00Z --unit-type
                       ugc-review
  fill [options] <ws>  Auto-fill: create QUEUED entries for every slot
                       occurrence in the next N weeks that is not already filled
                       (idempotent — a second run creates nothing). Example:
                       ralphy calendar fill my-studio --weeks 2
  help [command]       display help for command
```

### `ralphy campaign`

```
____        __      __
   / __ \____ _/ /___  / /_  __  __
  / /_/ / __ `/ / __ \/ __ \/ / / /
 / _, _/ /_/ / / /_/ / / / / /_/ /
/_/ |_|\__,_/_/ .___/_/ /_/\__, /
             /_/          /____/
        agent content runtime · ralphy.dev

Usage: ralphy campaign [options] [command]

Workspace-scoped topic campaign (#528): theses + a keyword/topic matrix mapped
to a planned unit inventory across formats + channels, with cross-linking + a
coverage ledger. Stored at <workspace>/campaigns/<id>/campaign.json.

Options:
  -h, --help                  display help for command

Commands:
  create [options] <ws> <id>  Scaffold a campaign from theses (+ optional
                              keyword seeds). Example: ralphy campaign create
                              my-studio agent-video --thesis "studio=ralphy is a
                              video studio for AI agents" --thesis
                              "earns=agent-made video earns money and views"
                              --head "ai video,agent content"
  list <ws>                   List a workspace's campaigns. Example: ralphy
                              campaign list my-studio
  show <id>                   Show a campaign's full manifest. Example: ralphy
                              campaign show agent-video
  plan [options] <id>         Run a bounded research + generate-object pass
                              proposing the keyword matrix + planned inventory
                              from the theses. PRINTS the proposal and STOPS —
                              pass --commit to write it (never auto-queues paid
                              work). --schedule proposes calendar slot
                              assignments across the items. Example: ralphy
                              campaign plan agent-video --commit --schedule
                              --weeks 8
  status <id>                 The coverage ledger: planned / produced /
                              published / indexed-hint (analytics-backed, honest
                              — never assumes indexing). Example: ralphy
                              campaign status agent-video
  roi <id>                    Cost/ROI report (#544): joins realized model spend
                              (gen-log) to measured performance (analytics #507)
                              per linked unit, aggregated by format / angle /
                              channel / thesis / platform, with
                              cost-per-1k-views + best/worst ROI cells. Units
                              with spend but no analytics yet are counted in
                              spend, excluded from ratios, flagged
                              pending-performance. Read-only, no model calls.
                              Example: ralphy campaign roi agent-video
  stamp <id> <cell> <unit>    Stamp a plan cell PRODUCED: link the unit that
                              satisfied it ("project/slug"), status → produced.
                              The campaign-next drain skips produced cells.
                              Example: ralphy campaign stamp agent-video cell-01
                              agent-video-001/hero-cut
  help [command]              display help for command
```

### `ralphy publish`

```
____        __      __
   / __ \____ _/ /___  / /_  __  __
  / /_/ / __ `/ / __ \/ __ \/ / / /
 / _, _/ /_/ / / /_/ / / / / /_/ /
/_/ |_|\__,_/_/ .___/_/ /_/\__, /
             /_/          /____/
        agent content runtime · ralphy.dev

Usage: ralphy publish [options] <presentation-id>

Submit one immutable Unit Presentation through Postiz

Arguments:
  presentation-id      Unit Presentation ID

Options:
  --account <id>       Social Account ID
  --key <key>          Stable idempotency key
  --at <iso>           Scheduled UTC instant
  --revised-from <id>  Earlier Publication lineage ID
  -h, --help           display help for command
```

### `ralphy publication`

```
____        __      __
   / __ \____ _/ /___  / /_  __  __
  / /_/ / __ `/ / __ \/ __ \/ / / /
 / _, _/ /_/ / / /_/ / / / / /_/ /
/_/ |_|\__,_/_/ .___/_/ /_/\__, /
             /_/          /____/
        agent content runtime · ralphy.dev

Usage: ralphy publication [options] [command]

Publish and reconcile immutable Unit presentations through fenced provider
operations

Options:
  -h, --help                            display help for command

Commands:
  list [options]
  publish [options] <presentation-id>
  lookup [options] <publication-id>
  cancel [options] <publication-id>
  reconcile [options] <publication-id>
  show <publication-id>
  refresh [options] <publication-id>
  help [command]                        display help for command
```

### `ralphy postiz`

```
____        __      __
   / __ \____ _/ /___  / /_  __  __
  / /_/ / __ `/ / __ \/ __ \/ / / /
 / _, _/ /_/ / / /_/ / / / / /_/ /
/_/ |_|\__,_/_/ .___/_/ /_/\__, /
             /_/          /____/
        agent content runtime · ralphy.dev

Usage: ralphy postiz [options] [command]

Connect and inspect the active workspace's Postiz publishing account

Options:
  -h, --help         display help for command

Commands:
  connect [options]  Import a scoped Postiz key from stdin and verify it
  status [options]   Verify the saved workspace connection and list public
                     account metadata (read-only)
  help [command]     display help for command
```

### `ralphy analytics`

```
____        __      __
   / __ \____ _/ /___  / /_  __  __
  / /_/ / __ `/ / __ \/ __ \/ / / /
 / _, _/ /_/ / / /_/ / / / / /_/ /
/_/ |_|\__,_/_/ .___/_/ /_/\__, /
             /_/          /____/
        agent content runtime · ralphy.dev

Usage: ralphy analytics [options] [command]

Query immutable Publication metric snapshots

Options:
  -h, --help                       display help for command

Commands:
  list [options] <publication-id>
  totals [options]
  roi [options]                    Return filter-first newest-per-Publication
                                   performance facts
  postmortem [options]             Return an evidence digest without scanning
                                   Unit files
  help [command]                   display help for command
```

### `ralphy migrate`

```
____        __      __
   / __ \____ _/ /___  / /_  __  __
  / /_/ / __ `/ / __ \/ __ \/ / / /
 / _, _/ /_/ / / /_/ / / / / /_/ /
/_/ |_|\__,_/_/ .___/_/ /_/\__, /
             /_/          /____/
        agent content runtime · ralphy.dev

Usage: ralphy migrate [options] [command]

Audit, stage, verify, and recover the SQLite domain-store migration

Options:
  -h, --help          display help for command

Commands:
  audit [options]
  run [options]
  resume [options]
  status [options]
  verify [options]
  cutover [options]
  recover [options]
  rollback [options]
  help [command]      display help for command
```

### `ralphy assets`

```
____        __      __
   / __ \____ _/ /___  / /_  __  __
  / /_/ / __ `/ / __ \/ __ \/ / / /
 / _, _/ /_/ / / /_/ / / / / /_/ /
/_/ |_|\__,_/_/ .___/_/ /_/\__, /
             /_/          /____/
        agent content runtime · ralphy.dev

Usage: ralphy assets [options] [command]

Pull / list / clean assets from the ralphy-assets companion repo

Options:
  -h, --help                                      display help for command

Commands:
  list [options]                                  List required + pool + example assets from the companion repo
  pull [options] <template-slug>                  Download all required assets for a template into the local cache
  pull-key [options] <manifest-key>               Download a single required asset by its manifest key
  install [options] <project-id> <template-slug>  Pull required assets for a template and copy them into a project's asset tree
  pull-pool [options] <ref>                       Download a single pool item by '<kind>/<slug>' (e.g. italian-brainrot-characters/tung-tung-tung-sahur)
  catalog [options]                               Print or regenerate docs/assets-catalog.md from the live manifest (single source of truth)
  unpack [options] <zip>                          Unpack a brand zip into <project>/brand/, flatten nested dirs into kebab-case filenames, drop __MACOSX/ and .DS_Store, suffix collisions with -N. Idempotent on re-run.
  clean                                           Wipe the local asset cache (.ralphy/cache/assets/)
  cache-info                                      Show the asset cache location and what's currently in it
  help [command]                                  display help for command

Examples:
  ralphy assets list
  ralphy assets list --kind <kind>
  ralphy assets pull <template-slug>
  ralphy assets install <project-id> <template-slug>
  ralphy assets unpack ./brand.zip --project my-proj-001
```

### `ralphy example`

```
____        __      __
   / __ \____ _/ /___  / /_  __  __
  / /_/ / __ `/ / __ \/ __ \/ / / /
 / _, _/ /_/ / / /_/ / / / / /_/ /
/_/ |_|\__,_/_/ .___/_/ /_/\__, /
             /_/          /____/
        agent content runtime · ralphy.dev

Usage: ralphy example [options] [command]

Pull / list complete reference projects from the companion repo

Options:
  -h, --help                   display help for command

Commands:
  list [options]               List available example projects
  pull [options] <example-id>  Download an example project tarball and extract
                               it into the active workspace's projects/<as>/
  help [command]               display help for command
```

### `ralphy audio`

```
____        __      __
   / __ \____ _/ /___  / /_  __  __
  / /_/ / __ `/ / __ \/ __ \/ / / /
 / _, _/ /_/ / / /_/ / / / / /_/ /
/_/ |_|\__,_/_/ .___/_/ /_/\__, /
             /_/          /____/
        agent content runtime · ralphy.dev

Usage: ralphy audio [options] [command]

FFmpeg audio recipes (loudnorm, sidechain duck, concat). All wrap
cli/lib/ffmpeg-recipes.ts.

Options:
  -h, --help           display help for command

Commands:
  loudnorm [options]   EBU R128 loudness normalization (TikTok / Reels target
                       -16 LUFS by default)
  sidechain [options]  Duck music under voice via sidechain compressor → single
                       mixed file
  mix-music [options]  Overlay a music bed onto a video at a fixed volume — no
                       ducking, no fades. Single-call surface for A/B preview
                       workflows.
  concat [options]     Lossless concat of audio segments via the concat demuxer
  help [command]       display help for command
```

### `ralphy video`

```
____        __      __
   / __ \____ _/ /___  / /_  __  __
  / /_/ / __ `/ / __ \/ __ \/ / / /
 / _, _/ /_/ / / /_/ / / / / /_/ /
/_/ |_|\__,_/_/ .___/_/ /_/\__, /
             /_/          /____/
        agent content runtime · ralphy.dev

Usage: ralphy video [options] [command]

FFmpeg video recipes (extract-segment, burn-subs, tonemap-hdr, concat). Wraps
cli/lib/ffmpeg-recipes.ts.

Options:
  -h, --help                 display help for command

Commands:
  extract-segment [options]  Cut a re-encoded segment between start/end seconds
                             (frame-accurate)
  frame [options] <clip>     Extract a single frame (i2v anchor / QA still /
                             poster). `--at` accepts a numeric seconds value or
                             the literal `last` (`-sseof -1`).
  extend [options] <clip>    Last-frame i2v continuation: extracts the last
                             frame of <clip> and runs a new generation anchored
                             on it. Records `input.extends: <clip>` lineage in
                             the gen-log.
  optimize [options]         Re-encode with x264 CRF + tune for noise/grain
                             content. Preserves visual content; shrinks 4-8x for
                             noisy footage.
  burn-subs [options]        Burn an .srt file into the video (call last in the
                             chain — MarginV=90 safe-zone)
  tonemap-hdr [options]      HDR HLG/PQ → Rec.709 SDR via zscale + tonemap
                             (default algo: hable)
  smart-crop [options]       Detect speaker face bboxes in a source video and
                             write face-bboxes.json. Output is consumed by
                             HyperFrames smart-reframe overlays (used by the
                             podcast-clip template) to follow the active speaker
                             with a virtual 9:16 camera, eliminating letterbox
                             bars on horizontal sources.
  add-music [options]        Mix a music bed over the video's existing audio
                             (SFX gets attenuated). Music auto-trims to video
                             length with a fade-out tail.
  vhs [options]              VHS post-process chain: chroma shift + sine drift +
                             film grain + vignette + slight desat/contrast.
  compress [options]         x264 CRF + faststart for social-shareable
                             deliverables. Default CRF 23 (`--social` is
                             implicit).
  grade [options]            Apply a named color-grade preset
                             (tv-commercial-soft|tv-commercial-strong|cinematic-teal-orange|analog-horror).
  concat [options]           Lossless concat of video segments (must share
                             codec/resolution)
  boomerang [options]        Boomerang / ping-pong loop: forward playback + the
                             clip reversed, concatenated into a seamless
                             back-and-forth loop (classic Instagram boomerang).
                             Drops audio (add a music bed in the compose/render
                             step). Output is ~2x the source length.
  help [command]             display help for command
```

### `ralphy clip`

```
____        __      __
   / __ \____ _/ /___  / /_  __  __
  / /_/ / __ `/ / __ \/ __ \/ / / /
 / _, _/ /_/ / / /_/ / / / / /_/ /
/_/ |_|\__,_/_/ .___/_/ /_/\__, /
             /_/          /____/
        agent content runtime · ralphy.dev

Usage: ralphy clip [options] <source>

Cut a [from, to) window out of a long-form video and (optionally) centre-crop it
to 9:16 vertical. The clip-cut primitive for the personal-clipper mode.
Highlight selection is the agent's job (read the `ralphy ref transcribe`
transcript, pick the windows); this verb only executes the cut.

Arguments:
  source             Source video (absolute path, or relative to cwd)

Options:
  --from <ts>        Window start — seconds (`12.5`), MM:SS (`1:30`), or
                     HH:MM:SS (`1:02:03`)
  --to <ts>          Window end — same formats as --from
  --vertical         Centre-crop the clip to a 9:16 vertical frame (1080x1920)
                     (default: false)
  --out <path>       Output path. Optional when --project is set — defaults to
                     <project>/artifacts/videos/<source>-clip-<from>-<to>.mp4.
  --project <id>     Project ID — logs the cut to the gen-log and resolves the
                     default --out.
  --force-overwrite  Skip the .v2 collision archive (default: false)
  --note <note>      Free-form note recorded in the gen-log row
  -h, --help         display help for command
```

### `ralphy image`

```
____        __      __
   / __ \____ _/ /___  / /_  __  __
  / /_/ / __ `/ / __ \/ __ \/ / / /
 / _, _/ /_/ / / /_/ / / / / /_/ /
/_/ |_|\__,_/_/ .___/_/ /_/\__, /
             /_/          /____/
        agent content runtime · ralphy.dev

Usage: ralphy image [options] [command]

Image post-processing recipes (cutout, fit, …). Wraps cli/lib/image/cutout.ts.

Options:
  -h, --help         display help for command

Commands:
  cutout [options]   Background removal for stickers / mascots. `--bg chroma`
                     uses ffmpeg `colorkey` (single-color match, fast). `--bg
                     flood` walks the canvas in headless Chromium from the four
                     corners and clears only the connected background —
                     preserves the die-cut outline + interior white islands (per
                     the free-air-vpn-stickerpack lessons; u2net cuts them off).
  fit [options]      Alpha-trim + scale. `--long N` sets the long-edge target
                     preserving aspect; `--trim-alpha` removes transparent
                     margins first (essential for stickers); `--telegram` is
                     shorthand for `--trim-alpha --long 512` (TG sticker spec).
  crunch [options]   Authentic PS1 / PlayStation-1 crunch: bilinear downscale
                     (kills high-poly/texture detail) → 16-bit rgb565
                     framebuffer (colour banding) → nearest-neighbour upscale
                     (crunchy aliased pixels). Removes the 'clean / cartoonish'
                     feel of a modern render so a generated still reads as a
                     real PS1 screenshot. `--scale` controls harshness (higher =
                     harsher).
  convert [options]  Format + resize + quality on a still (issue #103): PNG →
                     JPG, WebP → PNG, downscale-to-fit (`--max WxH`, never
                     upscales), metadata strip (`--strip` drops EXIF / C2PA /
                     colour profiles — the #021 anchor-prep recipe as a reusable
                     verb). Target format inferred from the --out extension.
                     ImageMagick one-invocation when installed, ffmpeg fallback
                     otherwise.
  help [command]     display help for command
```

### `ralphy banner`

```
____        __      __
   / __ \____ _/ /___  / /_  __  __
  / /_/ / __ `/ / __ \/ __ \/ / / /
 / _, _/ /_/ / / /_/ / / / / /_/ /
/_/ |_|\__,_/_/ .___/_/ /_/\__, /
             /_/          /____/
        agent content runtime · ralphy.dev

Usage: ralphy banner [options]

Print the Ralphy ASCII banner

Options:
  -h, --help  display help for command
```

### `ralphy eval`

```
____        __      __
   / __ \____ _/ /___  / /_  __  __
  / /_/ / __ `/ / __ \/ __ \/ / / /
 / _, _/ /_/ / / /_/ / / / / /_/ /
/_/ |_|\__,_/_/ .___/_/ /_/\__, /
             /_/          /____/
        agent content runtime · ralphy.dev

Usage: ralphy eval [options] [command]

Evaluate the quality of a rendered video

Options:
  -h, --help                    display help for command

Commands:
  video [options] <path>        Run the eval pipeline on a single mp4 and write
                                eval-report.md + eval.json. Defaults to the
                                native-video final gate (full-mp4 model pass)
                                when a model provider is configured; without one
                                it falls back to structure-only (not a ship
                                gate).
  prose [options] <file>        Run the deterministic AI-tell prose lint (#529)
                                over a text file: a rule pack (inflated
                                symbolism, superficial -ing analyses,
                                promotional language, vague attribution,
                                'delve'-class AI vocabulary, copula avoidance,
                                negative parallelisms, rule-of-three, false
                                ranges, em-dash overuse, persuasive-authority
                                tropes, signposting, chatbot artifacts, generic
                                conclusions) plus a paragraph-rhythm-uniformity
                                check. Each rule cites its source (Wikipedia
                                'Signs of AI writing'), carries a warn|fail
                                level, and emits a #409-vocabulary finding.
                                Makes ZERO model calls. Use --target captions to
                                route findings to the editor
                                (captions.ai-tell.*) instead of the scenarist
                                (structure.ai-tell.*). Example: ralphy eval
                                prose draft.md
  run [options] <project>       Run the quality flywheel (#484): orchestrate the
                                gates RELEVANT to a project (via gatesForContext
                                over mode/format/platform), cheap-deterministic
                                before model-graded, persist each gate's
                                existing report (eval.json / hook.json /
                                captions-gate.json / text-legibility.json /
                                fidelity.json / claims.json /
                                platform-spec.json), then call buildScorecard
                                for the final verdict. Advisory gates
                                (distribution-pack / council) are noted, never
                                run. Recommends `ralphy project repair-plan` on
                                a repair/blocked verdict — never spends or
                                repairs. --dry-run prints the plan and makes
                                ZERO model calls. Example: ralphy eval run
                                glitter-cream-001 --platform tiktok,reels
                                --dry-run
  fidelity [options] <project>  Run the product/brand fidelity gate (#422):
                                compare the project's generated stills against
                                the LOCKED product/brand refs +
                                research-facts.json (productFacts /
                                claimsToAvoid). Commercial modes only — a
                                non-commercial project returns a not-applicable
                                pass. Writes fidelity.json (append-only) and
                                prints the verdict + blocksShip. Example: ralphy
                                eval fidelity glitter-cream-001
  ocr [options] <project>       Run the text-legibility / OCR gate (#439): read
                                the baked copy in the project's stills + sampled
                                video frames and flag unreadable small text,
                                clipped copy, garbled text / typos, wrong
                                emphasis, and literal markdown artifacts.
                                Compares against expected copy when --expected
                                is given. Baked-text modes only — a text-free
                                mode returns a not-applicable pass. Writes
                                text-legibility.json (append-only). Example:
                                ralphy eval ocr glitter-cream-001 --expected
                                copy.txt
  hook [options] <project>      Run the first-frame hook gate (#440): extract
                                the FIRST FRAME + the ~1s preview from the
                                project's render and score the opener on subject
                                clarity, visual contrast, subject/product
                                visibility, text-hook legibility, curiosity gap,
                                and scroll-stop pull (mode-thresholded). Flags a
                                MISLEADING opener that over-promises. A
                                stills-only project returns a not-applicable
                                pass. Writes hook.json (append-only) and prints
                                the verdict + blocksShip + the 0-100 hook score
                                the variant tournament (#421) can weight.
                                Example: ralphy eval hook glitter-cream-001
  captions [options] <project>  Run the caption sync/readability gate (#441):
                                read the project's caption track + sampled
                                render frames and flag timing drift vs the
                                word-level startMs, captions on screen too
                                briefly to read, overcrowded windows (too many
                                words), captions overlapping a face/product/CTA,
                                and unsafe placement in the platform UI chrome.
                                ENRICHES (does not duplicate) the eval density
                                findings (captions.thin/dense/missing). A
                                project with no caption track returns a
                                not-applicable pass. Writes captions-gate.json
                                (append-only). Example: ralphy eval captions
                                choose-silenthill-001
  claims [options] <project>    Run the claims & policy gate (#442): extract the
                                factual claims in the project's commercial copy
                                (script VO/hook + prompts + on-screen OCR text +
                                captions + distribution/social copy) and
                                classify each against product facts +
                                mode/platform restrictions. Categories:
                                health-medical, financial-earnings,
                                performance-efficacy, warranty-guarantee,
                                pricing, platform-policy, testimonial,
                                prohibited-comparative. HIGH-RISK unsupported
                                claims (health/financial/absolute) BLOCK ship
                                unless proof is supplied (--proof or a
                                research-facts.json productFacts/proofPoints
                                entry). Commercial modes only — a non-commercial
                                project returns a not-applicable pass. Writes
                                claims.json (append-only). Example: ralphy eval
                                claims glitter-cream-001 --proof
                                substantiation.txt
  platform [options] <project>  Run the platform spec validator (#443): probe
                                the project's final media (render/final.mp4 +
                                artifacts/{images,videos}) and check each
                                against the declared target platforms — aspect
                                ratio, resolution, duration, file size, codecs,
                                safe areas, required metadata. Reports CONCRETE
                                fixes (e.g. 'H.264 required; got vp9 —
                                re-encode'). A hard spec violation (wrong aspect
                                / over-duration / unsupported codec /
                                over-filesize) blocks ship. Defaults --platform
                                to the project's distribution-pack platforms
                                when present. Writes platform-spec.json
                                (append-only). Example: ralphy eval platform
                                glitter-cream-001 --platform tiktok,reels
  calibrate [options]           Measure a binary eval JUDGE's agreement with
                                human labels (#483). Reads a calibration dataset
                                (human-labeled pass/fail examples for ONE gate)
                                and runs the gate's judge over each example,
                                then reports the confusion matrix +
                                TPR/TNR/precision/recall/accuracy + Cohen's
                                kappa + a promote-vs-advisory recommendation
                                (default bar kappa >= 0.6). Binary convention:
                                positive class = the gate should BLOCK (verdict
                                fail). Offline with --predictions (a {
                                exampleId: pass|fail } map → NO model calls, the
                                CI seam); without it the LIVE judge runs (paid,
                                honors --no-vision). Example: ralphy eval
                                calibrate --gate first-frame-hook --dataset
                                hooks.json --predictions preds.json
  metrics [options] <project>   Run the OPTIONAL specialized media metric
                                adapters (#485) and ENRICH the project's
                                eval.json under `metrics` (read → merge → write
                                back, append-only). Adapters degrade to `na` +
                                an actionable hint when their
                                tool/model/expected-input is missing — they
                                never crash and never change the eval verdict.
                                Initial adapters: tts-wer (speech
                                intelligibility = Word Error Rate of the
                                transcribed VO vs the expected script; needs
                                --expected + a transcribe provider) and
                                image-aesthetic (a pluggable seam, `na` until a
                                scorer is configured). --dry-run lists the
                                applicable adapters + availability + thresholds
                                with ZERO model calls. Example: ralphy eval
                                metrics glitter-cream-001 --adapter tts-wer
                                --expected script.txt --dry-run
  optimize-prompt [options]     EXPERIMENTAL (#486): improve a judge/generator
                                prompt against a #483 calibration dataset and
                                emit a REVIEWABLE proposal. Splits the dataset
                                into train/held-out (deterministic by id-hash),
                                evaluates the BASELINE prompt on held-out, asks
                                the LLM to improve it from the train-split
                                failures, evaluates the CANDIDATE on held-out,
                                then compares baseline-vs-candidate Cohen's
                                kappa. NEVER overwrites the source prompt /
                                templates / guidelines / MODELS.md — a `propose`
                                recommendation writes an append-only
                                `proposal-vN/` dir for a maintainer to apply by
                                hand. DSPy/MIPRO is the inspiration, not a hard
                                dep. Offline (the CI seam, NO model calls):
                                --baseline-predictions + --candidate-predictions
                                ({ exampleId: pass|fail } maps) + --candidate (a
                                candidate prompt file). --dry-run prints the
                                plan only. Example: ralphy eval optimize-prompt
                                --prompt judge.txt --dataset hooks.json
                                --baseline-predictions base.json
                                --candidate-predictions cand.json --candidate
                                cand.txt
  help [command]                display help for command
```

### `ralphy research`

```
____        __      __
   / __ \____ _/ /___  / /_  __  __
  / /_/ / __ `/ / __ \/ __ \/ / / /
 / _, _/ /_/ / / /_/ / / / / /_/ /
/_/ |_|\__,_/_/ .___/_/ /_/\__, /
             /_/          /____/
        agent content runtime · ralphy.dev

Usage: ralphy research [options] [command]

Topic-level research: aggregate multiple sources into a single report

Options:
  -h, --help                              display help for command

Commands:
  start [options] <topic>                 Create a research topic directory (workspace/research/<slug>/)
  add-source [options] <url>              Pull a URL and run the full ref chain, linking the result into a topic
  synthesize [options] <topic>            Cross-source LLM synthesis → report.md + sources.json
  show <topic>                            Print the topic state (sources, question, last synthesis)
  list                                    List all research topics under workspace/research/
  run [options] <query...>                Deep research: plan → fan-out search → fetch → summarize → cited report
  scrape-profile [options] <profile-url>  Distill one creator's style into a persisted Research Run and report Document
  help [command]                          display help for command
```

### `ralphy prompts`

```
____        __      __
   / __ \____ _/ /___  / /_  __  __
  / /_/ / __ `/ / __ \/ __ \/ / / /
 / _, _/ /_/ / / /_/ / / / / /_/ /
/_/ |_|\__,_/_/ .___/_/ /_/\__, /
             /_/          /____/
        agent content runtime · ralphy.dev

Usage: ralphy prompts [options] [command]

Prompt cookbook + library lookup (02.03 / 02.0L)

Options:
  -h, --help        display help for command

Commands:
  library           Library by goal/situation
  modes [options]   List cookbook mode files for video / voice / music
  install           Copy the AGENTS.md router and its playbooks into
                    <root>/.ralphy/prompts
  export [options]  Write the routing pack into a directory of your choosing
                    (for bundling)
  status            Report whether the routing pack is installed, and whether it
                    matches this CLI
  help [command]    display help for command
```

### `ralphy bridge`

```
____        __      __
   / __ \____ _/ /___  / /_  __  __
  / /_/ / __ `/ / __ \/ __ \/ / / /
 / _, _/ /_/ / / /_/ / / / / /_/ /
/_/ |_|\__,_/_/ .___/_/ /_/\__, /
             /_/          /____/
        agent content runtime · ralphy.dev

Usage: ralphy bridge [options]

Run the versioned desktop stdio bridge

Options:
  --stdio        serve newline-delimited JSON on stdin/stdout
  --root <path>  data root containing ralphy.db
  -h, --help     display help for command
```
