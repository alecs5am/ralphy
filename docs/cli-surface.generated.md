# Ralphy CLI Surface (generated)

> DO NOT EDIT. Regenerate via `bun run cli:surface:build`.
> The hand-curated companion lives at `docs/cli-surface.md`.

Verbs registered: **37**

## Top-level verbs

### `ralphy version`

```
____        __      __         
   / __ \____ _/ /___  / /_  __  __
  / /_/ / __ `/ / __ \/ __ \/ / / /
 / _, _/ /_/ / / /_/ / / / / /_/ / 
/_/ |_|\__,_/_/ .___/_/ /_/\__, /  
             /_/          /____/   
        UGC video pipeline · ralphy.dev

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
        UGC video pipeline · ralphy.dev

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
        UGC video pipeline · ralphy.dev

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
        UGC video pipeline · ralphy.dev

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
        UGC video pipeline · ralphy.dev

Usage: ralphy setup [options]

Setup wizard — API keys, dev services

Options:
  --status                Print capability status as JSON and exit (no TUI)
  --link <path>           Link ralphy to a project directory (global config)
  --unlink                Remove the global project link
  --non-interactive       Agent / CI mode: never prompt, never open a TUI, emit
                          a JSON summary (default: false)
  -y, --yes               Alias for --non-interactive (default: false)
  --openrouter-key <key>  Set OPENROUTER_API_KEY (use `-` to read from stdin).
                          Implies --non-interactive
  --elevenlabs-key <key>  Set ELEVENLABS_API_KEY (use `-` to read from stdin).
                          Implies --non-interactive
  --keys-from-env         Pick up OPENROUTER_API_KEY / ELEVENLABS_API_KEY from
                          the current process env. Implies --non-interactive
                          (default: false)
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
        UGC video pipeline · ralphy.dev

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
        UGC video pipeline · ralphy.dev

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
        UGC video pipeline · ralphy.dev

Usage: ralphy generate [options] [command]

Generate a single asset (image / video / voiceover / music / captions). Logs
cost + path automatically.

Options:
  -h, --help           display help for command

Commands:
  image [options]      Generate one image via OpenRouter (default:
                       google/gemini-3-pro-image-preview — nano-banana-pro,
                       multi-ref consistency, ≥4 concurrent). Pass --model
                       openai/gpt-5.4-image-2 when label typography matters more
                       than ref consistency.
  video [options]      Generate one video via OpenRouter (default:
                       kling-v3.0-pro)
  voiceover [options]  Generate voiceover via ElevenLabs (default:
                       eleven_multilingual_v2)
  music [options]      Generate music bed via ElevenLabs Music (instrumental by
                       default)
  sfx [options]        Generate a sound effect via ElevenLabs Sound Generation
                       (≤22s)
  captions [options]   Transcribe audio to Caption[] (≤25MB). Default backend:
                       ElevenLabs Scribe v1 (word-level).
  help [command]       display help for command
```

### `ralphy provider`

```
____        __      __         
   / __ \____ _/ /___  / /_  __  __
  / /_/ / __ `/ / __ \/ __ \/ / / /
 / _, _/ /_/ / / /_/ / / / / /_/ / 
/_/ |_|\__,_/_/ .___/_/ /_/\__, /  
             /_/          /____/   
        UGC video pipeline · ralphy.dev

Usage: ralphy provider [options] [command]

Inspect provider connectors and their capability matrix (image / video / voice /
music / sfx / text / transcribe).

Options:
  -h, --help      display help for command

Commands:
  list            List registered provider connectors, their capabilities, and
                  whether each is configured (key present).
  help [command]  display help for command
```

### `ralphy models`

```
____        __      __         
   / __ \____ _/ /___  / /_  __  __
  / /_/ / __ `/ / __ \/ __ \/ / / /
 / _, _/ /_/ / / /_/ / / / / /_/ / 
/_/ |_|\__,_/_/ .___/_/ /_/\__, /  
             /_/          /____/   
        UGC video pipeline · ralphy.dev

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
        UGC video pipeline · ralphy.dev

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
        UGC video pipeline · ralphy.dev

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
        UGC video pipeline · ralphy.dev

Usage: ralphy render [options] <project>

Render a project to MP4. Engine: HyperFrames (HTML + GSAP). Writes
workspace/projects/<id>/render/final.mp4. Adds EBU R128 loudnorm with
--loudnorm.

Arguments:
  project                Project ID

Options:
  --composition <id>     Composition id (default: index.html)
  --output <path>        Output mp4 path (default:
                         workspace/projects/<id>/render/final.mp4)
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
```

### `ralphy hyperframes`

```
____        __      __         
   / __ \____ _/ /___  / /_  __  __
  / /_/ / __ `/ / __ \/ __ \/ / / /
 / _, _/ /_/ / / /_/ / / / / /_/ / 
/_/ |_|\__,_/_/ .___/_/ /_/\__, /  
             /_/          /____/   
        UGC video pipeline · ralphy.dev

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
  save-version <project>              Copy current index.html →
                                      compositions/v<N>.html (numeric increment,
                                      never overwrites). Closes invariant #14
                                      gap for HTML (issue #004).
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
  ralphy hyperframes save-version spring-001            # → compositions/v1.html
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
        UGC video pipeline · ralphy.dev

Usage: ralphy editor [options] [command]

Editor-stage observability — preflight clip checks, trim-analysis, composition
QA.

Options:
  -h, --help                          display help for command

Commands:
  preflight [options] <projectId>     ffprobe every clip + music in
                                      workspace/projects/<id>/assets/, sum
                                      durations, flag missing slots from
                                      manifest, surface aspect/fps/codec
                                      mismatches. Exit 1 on red. Run before
                                      `ralphy render` to catch wrong-aspect
                                      leftovers from a model swap, encoder
                                      overshoot, missing scenes, etc.
  trim-analyze [options] <projectId>  Run gemini-3.1-pro vision over every clip
                                      in assets/videos/ and write per-clip trim
                                      analysis to
                                      logs/trim-analysis/<clip>.json. Returns
                                      strict JSON: { observed_duration_sec,
                                      dead_head_sec, dead_tail_sec,
                                      best_subwindow{start,end},
                                      trim_recommendation{max_trim_sec,
                                      trim_from}, beats[] }.
  help [command]                      display help for command
```

### `ralphy voice`

```
____        __      __         
   / __ \____ _/ /___  / /_  __  __
  / /_/ / __ `/ / __ \/ __ \/ / / /
 / _, _/ /_/ / / /_/ / / / / /_/ / 
/_/ |_|\__,_/_/ .___/_/ /_/\__, /  
             /_/          /____/   
        UGC video pipeline · ralphy.dev

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
        UGC video pipeline · ralphy.dev

Usage: ralphy whoami [options]

Show the per-user profile (skill score 0-10, developer badge, signals,
recommendation for adaptive intake). On first call, auto-backfills from
workspace/projects.

Options:
  --backfill         Scan workspace/projects/* and recompute signals from
                     on-disk state (renders, postmortems) (default: false)
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
        UGC video pipeline · ralphy.dev

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
        UGC video pipeline · ralphy.dev

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
        UGC video pipeline · ralphy.dev

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
        UGC video pipeline · ralphy.dev

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
        UGC video pipeline · ralphy.dev

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
  pull [options] [urls...]                       Pull a video via yt-dlp (single URL, default), OR bulk-download images when --kind reference-image / --from-file is set (#048). Bulk mode dedupes by sha256 and writes into <project>/refs/.
  frames [options] <slug>                        Sample JPEG frames from <slug>/source.mp4 → <slug>/frames/
  transcribe [options] <slug>                    Transcribe <slug>/source.mp3 → <slug>/transcript.json (Caption[]). Default backend: ElevenLabs Scribe v1.
  analyze [options] <slug>                       Run vision LLM over <slug>/frames/* → <slug>/analysis.json. Default prompt = UGC blueprint extractor.
  analyze-video [options] <slug-or-path-or-url>  Send the full mp4 to Gemini for precise shot-cut detection (better than `analyze` for fast-cut commercials). Arg can be a ref slug, a local file path, or an http(s) URL.
  audio-describe [options] <slug>                Send <slug>/source.mp3 to Gemini-audio → <slug>/audio-analysis.json (tone, music, VO style)
  blueprint <slug>                               Synthesize <slug>/blueprint.md from {meta + analysis + audio-analysis + transcript}
  rasterize [options] <file>                     Rasterize a vector reference (SVG) to a crisp PNG at the requested long-edge size. Preserves intrinsic aspect ratio. `--bg <hex>` adds a solid background (default: transparent).
  paths <slug>                                   Print every research path for <slug> (helpful when scripting follow-ups)
  scrape-trends [options]                        Scrape TikTok hashtag pages via Playwright (Apify-compatible JSON shape) and rank with scoreTikTok()
  check [options] <project-id>                   Run the reference-required gate classifier on <project-id>'s scenario.json. Reports whether a real-entity name (person / brand-product / IP) was detected and, if so, whether at least one ref is attached. Exit 5 (gate) when the gate fires AND no ref is attached.
  delete <id>                                    Delete a reference
  locate [options]                               Locate an object in an image — returns pixel bbox(es) via Gemini vision
  help [command]                                 display help for command

Examples:
  ralphy ref pull https://tiktok.com/@x/video/72939...
  ralphy ref pull https://a.com/x.png https://b.com/y.jpg --kind reference-image --project my-proj-001
  ralphy ref pull --from-file urls.txt --kind reference-image --project my-proj-001
  ralphy ref analyze my-reference-slug
  ralphy ref blueprint my-reference-slug
  ralphy ref check my-project-001                  # gate classifier on scenario.json
  ralphy ref check --text "Old Spice style hero"   # gate classifier on a raw brief
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
        UGC video pipeline · ralphy.dev

Usage: ralphy project [options] [command]

Manage video projects

Options:
  -h, --help                 display help for command

Commands:
  create [options]           Create a new project
  list [options]             List all projects
  show [options] <id>        Show project details
  update [options] <id>      Update project
  delete [options] <id>      Delete a project
  log [options] <id>         Tail project logs (generations / user-prompts /
                             user-assets)
  timeline <id>              Merged project timeline (user requests + assets +
                             generations) as pretty chronological log
  log-prompt [options] [id]  Append a user-prompt entry to project logs. Accept
                             project id positionally OR via --project (#031).
  log-asset [options] [id]   Append a user-asset entry to project logs. Accept
                             project id positionally OR via --project (#031).
                             With --copy-from <src>, copies the file into
                             <project>/refs/ first (auto-detects disposable
                             macOS NSIRD / /tmp paths and rescues them before
                             they evaporate). Sanitizes U+202F NARROW NO-BREAK
                             SPACE in filenames.
  score [options] <id>       Run virality rubric over scenario.json (Hard fails
                             + warnings, no LLM)
  transcribe [options] <id>  Transcribe an audio file → captions.json
                             (Caption[]). Default backend: ElevenLabs Scribe v1
                             (word-level).
  clone [options] <id>       Clone a project
  assets [options] <id>      ffprobe-truth every media file under
                             <project>/assets/ and emit a flat array. Honors
                             --kind video|image|audio.
  verify [options] <id>      ffprobe every slot in asset-manifest.json and flag
                             divergences from claimed duration / dimensions /
                             size (tolerance: 100ms on duration). Exit non-zero
                             on any red.
  help [command]             display help for command
```

### `ralphy template`

```
____        __      __         
   / __ \____ _/ /___  / /_  __  __
  / /_/ / __ `/ / __ \/ __ \/ / / /
 / _, _/ /_/ / / /_/ / / / / /_/ / 
/_/ |_|\__,_/_/ .___/_/ /_/\__, /  
             /_/          /____/   
        UGC video pipeline · ralphy.dev

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
  register <id>                     Register an existing dir template in the
                                    local registry (workspace or repo)
  list                              List all templates (both repo-public
                                    templates/ and local workspace/templates/)
  show [options] <id>               Show template — prints TEMPLATE.md for dir
                                    templates, JSON for flat
  use [options] <id>                Create a new project scaffolded from a
                                    template
  delete <id>                       Delete a workspace template (flat file or
                                    whole dir). Repo templates are read-only —
                                    edit templates/ in the repo directly.
  suggest [options] <utterance...>  Rank templates for a user utterance. Hybrid:
                                    substring scorer first (fast, free); if
                                    top-1 score is below threshold (default
                                    0.7), fall through to an LLM-rerank pass
                                    that handles Russian / paraphrase /
                                    concept-level / typo queries. Returns top-N
                                    with reasoning when LLM fires.
  help [command]                    display help for command
```

### `ralphy guideline`

```
____        __      __         
   / __ \____ _/ /___  / /_  __  __
  / /_/ / __ `/ / __ \/ __ \/ / / /
 / _, _/ /_/ / / /_/ / / / / /_/ / 
/_/ |_|\__,_/_/ .___/_/ /_/\__, /  
             /_/          /____/   
        UGC video pipeline · ralphy.dev

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

### `ralphy batch`

```
____        __      __         
   / __ \____ _/ /___  / /_  __  __
  / /_/ / __ `/ / __ \/ __ \/ / / /
 / _, _/ /_/ / / /_/ / / / / /_/ / 
/_/ |_|\__,_/_/ .___/_/ /_/\__, /  
             /_/          /____/   
        UGC video pipeline · ralphy.dev

Usage: ralphy batch [options] [command]

Manage batch operations

Options:
  -h, --help             display help for command

Commands:
  create [options]       Create a batch
  list                   List all batches
  show <id>              Show batch details
  status <id>            Show batch status
  delete [options] <id>  Delete a batch
  submit [options]       Submit a batch of jobs to the local daemon with
                         symbolic dependencies. Use this for the 'N generations
                         + 1 render' pattern.
  vary [options]         Create N project variants from a base project differing
                         on one axis (hook / body / cta / persona). Use this for
                         A/B testing the hook without re-running the rest of the
                         pipeline.
  help [command]         display help for command
```

### `ralphy asset`

```
____        __      __         
   / __ \____ _/ /___  / /_  __  __
  / /_/ / __ `/ / __ \/ __ \/ / / /
 / _, _/ /_/ / / /_/ / / / / /_/ / 
/_/ |_|\__,_/_/ .___/_/ /_/\__, /  
             /_/          /____/   
        UGC video pipeline · ralphy.dev

Usage: ralphy asset [options] [command]

Manage and generate assets

Options:
  -h, --help                 display help for command

Commands:
  list [options]             List assets in a project
  clean [options]            Remove assets from a project
  chromakey [options] <img>  Key out a background colour from a single image →
                             transparent PNG. Uses ffmpeg `colorkey`. Default
                             colour is 0x00b140 (greenscreen green); pass
                             `--despill` for a `colorhold` cleanup pass that
                             kills the green halo on anti-aliased edges.
  help [command]             display help for command
```

### `ralphy workspace`

```
____        __      __         
   / __ \____ _/ /___  / /_  __  __
  / /_/ / __ `/ / __ \/ __ \/ / / /
 / _, _/ /_/ / / /_/ / / / / /_/ / 
/_/ |_|\__,_/_/ .___/_/ /_/\__, /  
             /_/          /____/   
        UGC video pipeline · ralphy.dev

Usage: ralphy workspace [options] [command]

Manage workspace

Options:
  -h, --help       display help for command

Commands:
  stats            Show workspace statistics
  clean [options]  Clean workspace contents
  help [command]   display help for command
```

### `ralphy assets`

```
____        __      __         
   / __ \____ _/ /___  / /_  __  __
  / /_/ / __ `/ / __ \/ __ \/ / / /
 / _, _/ /_/ / / /_/ / / / / /_/ / 
/_/ |_|\__,_/_/ .___/_/ /_/\__, /  
             /_/          /____/   
        UGC video pipeline · ralphy.dev

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
  clean                                           Wipe the local asset cache (workspace/.ralph/asset-cache)
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
        UGC video pipeline · ralphy.dev

Usage: ralphy example [options] [command]

Pull / list complete reference projects from the companion repo

Options:
  -h, --help                   display help for command

Commands:
  list [options]               List available example projects
  pull [options] <example-id>  Download an example project tarball and extract
                               it into workspace/projects/<as>
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
        UGC video pipeline · ralphy.dev

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
        UGC video pipeline · ralphy.dev

Usage: ralphy video [options] [command]

FFmpeg video recipes (extract-segment, burn-subs, tonemap-hdr, concat). Wraps
cli/lib/ffmpeg-recipes.ts.

Options:
  -h, --help                 display help for command

Commands:
  extract-segment [options]  Cut a re-encoded segment between start/end seconds
                             (frame-accurate)
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
  help [command]             display help for command
```

### `ralphy image`

```
____        __      __         
   / __ \____ _/ /___  / /_  __  __
  / /_/ / __ `/ / __ \/ __ \/ / / /
 / _, _/ /_/ / / /_/ / / / / /_/ / 
/_/ |_|\__,_/_/ .___/_/ /_/\__, /  
             /_/          /____/   
        UGC video pipeline · ralphy.dev

Usage: ralphy image [options] [command]

Image post-processing recipes (cutout, fit, …). Wraps cli/lib/image/cutout.ts.

Options:
  -h, --help        display help for command

Commands:
  cutout [options]  Background removal for stickers / mascots. `--bg chroma`
                    uses ffmpeg `colorkey` (single-color match, fast). `--bg
                    flood` walks the canvas in headless Chromium from the four
                    corners and clears only the connected background — preserves
                    the die-cut outline + interior white islands (per the
                    free-air-vpn-stickerpack lessons; u2net cuts them off).
  fit [options]     Alpha-trim + scale. `--long N` sets the long-edge target
                    preserving aspect; `--trim-alpha` removes transparent
                    margins first (essential for stickers); `--telegram` is
                    shorthand for `--trim-alpha --long 512` (TG sticker spec).
  help [command]    display help for command
```

### `ralphy banner`

```
____        __      __         
   / __ \____ _/ /___  / /_  __  __
  / /_/ / __ `/ / __ \/ __ \/ / / /
 / _, _/ /_/ / / /_/ / / / / /_/ / 
/_/ |_|\__,_/_/ .___/_/ /_/\__, /  
             /_/          /____/   
        UGC video pipeline · ralphy.dev

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
        UGC video pipeline · ralphy.dev

Usage: ralphy eval [options] [command]

Evaluate the quality of a rendered video

Options:
  -h, --help              display help for command

Commands:
  video [options] <path>  Run the full eval pipeline on a single mp4 (structure
                          / audio / captions / vision) and write eval-report.md
                          + eval.json
  help [command]          display help for command
```

### `ralphy research`

```
____        __      __         
   / __ \____ _/ /___  / /_  __  __
  / /_/ / __ `/ / __ \/ __ \/ / / /
 / _, _/ /_/ / / /_/ / / / / /_/ / 
/_/ |_|\__,_/_/ .___/_/ /_/\__, /  
             /_/          /____/   
        UGC video pipeline · ralphy.dev

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
  scrape-profile [options] <profile-url>  Distill one creator's style: yt-dlp lists N recent videos, vision-analyzes each, writes a style-sheet.md
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
        UGC video pipeline · ralphy.dev

Usage: ralphy prompts [options] [command]

Prompt cookbook + library lookup (02.03 / 02.0L)

Options:
  -h, --help       display help for command

Commands:
  library          Library by goal/situation
  modes [options]  List cookbook mode files for video / voice / music
  help [command]   display help for command
```
