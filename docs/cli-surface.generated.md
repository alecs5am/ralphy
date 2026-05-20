# Ralphy CLI Surface (generated)

> DO NOT EDIT. Regenerate via `bun run cli:surface:build`.
> The hand-curated companion lives at `docs/cli-surface.md`.

Verbs registered: **34**

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

Create a new project under ~/.ralphy/projects/<id>/ with a canonical layout.
CWD-independent. Pass a brief to seed BRIEF.md or just --id <slug> for an empty
shell.

Arguments:
  brief        Brief — free-form text describing the video to make

Options:
  --id <slug>  Project id slug (default: derived from brief or YYMMDD-HHMMSS)
  -h, --help   display help for command

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

Lift the style of a public clip into a reusable template. Chains ref pull →
frames → analyze → blueprint → template create.

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

Setup wizard — API keys, profiles, dev services

Options:
  --status                  Print capability status as JSON and exit (no TUI)
  --link <path>             Link ralphy to a project directory (global config)
  --unlink                  Remove the global project link
  --non-interactive         Agent / CI mode: never prompt, never open a TUI,
                            emit a JSON summary (default: false)
  -y, --yes                 Alias for --non-interactive (default: false)
  --openrouter-key <key>    Set OPENROUTER_API_KEY (use `-` to read from stdin).
                            Implies --non-interactive
  --elevenlabs-key <key>    Set ELEVENLABS_API_KEY (use `-` to read from stdin).
                            Implies --non-interactive
  --keys-from-env           Pick up OPENROUTER_API_KEY / ELEVENLABS_API_KEY from
                            the current process env. Implies --non-interactive
                            (default: false)
  --project-dir <path>      Link ralphy to this project directory before
                            configuring keys. Implies --non-interactive
  --import-profile <names>  Comma-separated profile names to import (additive,
                            safe to re-run) (default: [])
  --no-verify               Skip API ping verification when saving keys
  --allow-unverified        When --verify is on (default) and a key fails to
                            verify, save it anyway and exit 0 (default: false)
  -h, --help                display help for command
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
                       openai/gpt-5.4-image-2 — premium typography & label
                       accuracy). Use --model google/gemini-3-pro-image-preview
                       when you need multi-ref character consistency.
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
                   each state
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
  -h, --help               display help for command

Commands:
  add [options] <argv...>  Enqueue a raw shell command as a job. Pass the
                           wrapped command after `--`. For ralphy generate jobs,
                           use `generate ... --queue` instead.
  list [options]           List jobs (default: most recent first, all states)
  show <id>                Show full details of one job
  cancel <id>              Cancel a pending or running job (SIGTERM if running)
  retry <id>               Re-queue a failed/cancelled/blocked job (resets
                           status to pending)
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

Render a project to MP4. Reads composition-props.json + manifest, runs `bunx
remotion render`, writes workspace/projects/<id>/render/final.mp4. Adds EBU R128
loudnorm with --loudnorm.

Arguments:
  project             Project ID

Options:
  --composition <id>  Composition id (default: from props or 'UGCVideo')
  --output <path>     Output mp4 path (default:
                      workspace/projects/<id>/render/final.mp4)
  --loudnorm          Apply EBU R128 loudnorm (-16 LUFS) post-render via ffmpeg
  --keep-symlink      Don't remove the public/project-<id> symlink after render
  --dry-run           Print the resolved render plan (composition, props path,
                      output); no remotion run (default: false)
  --summary           Collapse the dry-run plan to a per-stage rollup (default:
                      false)
  -h, --help          display help for command

Examples:
  ralphy render spring-001
  ralphy render proj-001 --loudnorm
  ralphy render proj-001 --output ./out.mp4
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
  pull [options] <url>                           Pull a video into workspace/references/<slug>/. Default: yt-dlp from URL. With --local: copy from local mp4 path (url arg becomes a label).
  frames [options] <slug>                        Sample JPEG frames from <slug>/source.mp4 → <slug>/frames/
  transcribe [options] <slug>                    Transcribe <slug>/source.mp3 → <slug>/transcript.json (Caption[]). Default backend: ElevenLabs Scribe v1.
  analyze [options] <slug>                       Run vision LLM over <slug>/frames/* → <slug>/analysis.json. Default prompt = UGC blueprint extractor.
  analyze-video [options] <slug-or-path-or-url>  Send the full mp4 to Gemini for precise shot-cut detection (better than `analyze` for fast-cut commercials). Arg can be a ref slug, a local file path, or an http(s) URL.
  audio-describe [options] <slug>                Send <slug>/source.mp3 to Gemini-audio → <slug>/audio-analysis.json (tone, music, VO style)
  blueprint <slug>                               Synthesize <slug>/blueprint.md from {meta + analysis + audio-analysis + transcript}
  paths <slug>                                   Print every research path for <slug> (helpful when scripting follow-ups)
  scrape-trends [options]                        Scrape TikTok hashtag pages via Playwright (Apify-compatible JSON shape) and rank with scoreTikTok()
  delete <id>                                    Delete a reference
  help [command]                                 display help for command

Examples:
  ralphy ref pull https://tiktok.com/@x/video/72939...
  ralphy ref analyze my-reference-slug
  ralphy ref blueprint my-reference-slug
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
  log-prompt [options] <id>  Append a user-prompt entry to project logs
  log-asset [options] <id>   Append a user-asset entry to project logs. With
                             --copy-from <src>, copies the file into
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
  verify [options] <id>      ffprobe every slot in asset-manifest.json + flag
                             divergences (missing file, wrong duration, wrong
                             dimensions, broken codec). Exit non-zero on any
                             red.
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
  -h, --help       display help for command

Commands:
  list [options]   List assets in a project
  clean [options]  Remove assets from a project
  help [command]   display help for command
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

### `ralphy dashboard`

```
____        __      __         
   / __ \____ _/ /___  / /_  __  __
  / /_/ / __ `/ / __ \/ __ \/ / / /
 / _, _/ /_/ / / /_/ / / / / /_/ / 
/_/ |_|\__,_/_/ .___/_/ /_/\__, /  
             /_/          /____/   
        UGC video pipeline · ralphy.dev

Usage: ralphy dashboard [options]

Start the dashboard web UI

Options:
  --port <port>  Port number (default: "4321")
  --open         Open in browser
  -h, --help     display help for command
```

### `ralphy profile`

```
____        __      __         
   / __ \____ _/ /___  / /_  __  __
  / /_/ / __ `/ / __ \/ __ \/ / / /
 / _, _/ /_/ / / /_/ / / / / /_/ / 
/_/ |_|\__,_/_/ .___/_/ /_/\__, /  
             /_/          /____/   
        UGC video pipeline · ralphy.dev

Usage: ralphy profile [options] [command]

Share workspace artifacts across users via committed profiles/

Options:
  -h, --help                   display help for command

Commands:
  export [options] <nickname>  Copy local workspace/ → profiles/<nickname>/ for
                               committing to the repo
  import [options] <nickname>  Copy profiles/<nickname>/ → local workspace/
                               (additive by default, merges registry + logs)
  list                         List all available profiles in profiles/
  show <nickname>              Print PROFILE.md for a given profile
  help [command]               display help for command
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
  clean                                           Wipe the local asset cache (workspace/.ralph/asset-cache)
  cache-info                                      Show the asset cache location and what's currently in it
  help [command]                                  display help for command

Examples:
  ralphy assets list
  ralphy assets list --kind <kind>
  ralphy assets pull <template-slug>
  ralphy assets install <project-id> <template-slug>
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
                             write face-bboxes.json. Output is consumed by the
                             <SmartReframe> Remotion component (used by
                             podcast-clip template) to follow the active speaker
                             with a virtual 9:16 camera, eliminating letterbox
                             bars on horizontal sources.
  add-music [options]        Mix a music bed over the video's existing audio
                             (SFX gets attenuated). Music auto-trims to video
                             length with a fade-out tail.
  concat [options]           Lossless concat of video segments (must share
                             codec/resolution)
  help [command]             display help for command
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
  -h, --help                    display help for command

Commands:
  start [options] <topic>       Create a research topic directory
                                (workspace/research/<slug>/)
  add-source [options] <url>    Pull a URL and run the full ref chain, linking
                                the result into a topic
  synthesize [options] <topic>  Cross-source LLM synthesis → report.md +
                                sources.json
  show <topic>                  Print the topic state (sources, question, last
                                synthesis)
  list                          List all research topics under
                                workspace/research/
  help [command]                display help for command
```
