# ralph CLI — Specification

## Philosophy

- **Resource-action pattern**: `ralph <resource> <action> [args] [flags]`
- **JSON-first**: default output is JSON (for Claude Code parsing). `--pretty` for humans.
- **Interactive fallback**: if a required flag is missing, drop into an interactive prompt (via `@clack/prompts`).
- **Idempotent**: re-running doesn't break what's already there.
- **Discoverable**: `ralph --help`, `ralph <resource> --help`, `ralph <resource> <action> --help`.

## Install and run

```bash
# Via package.json bin
npm run ralph -- project list

# Via npx (from the project root)
npx ralph project list

# Via bunx
bunx ralph project list

# Globally (if installed)
ralph project list
```

package.json:
```json
{
  "bin": {
    "ralph": "./cli/index.ts"
  },
  "scripts": {
    "ralph": "tsx cli/index.ts"
  }
}
```

## Global flags

| Flag | Short | Description |
|------|-------|-------------|
| `--pretty` | `-p` | Human-readable output instead of JSON |
| `--verbose` | `-v` | Verbose output (debug info) |
| `--quiet` | `-q` | Result only, no progress |
| `--dry-run` | | Show what would be done, don't execute |
| `--cwd <path>` | | Working directory (default: `.`) |
| `--no-interactive` | | Disable interactive prompts |

---

## Resources and commands

### `ralph init`

Initialize the workspace and config.

```bash
ralph init                           # Interactive setup
ralph init --defaults                # Everything default
ralph init --openrouter-key <key> --elevenlabs-key <key>
```

Creates:
- `workspace/` directories
- `workspace/.ralph/config.json` — CLI config
- `workspace/.ralph/registry.json` — entity registry
- `.env` if it doesn't exist

---

### `ralph config`

Configuration management.

```bash
ralph config list                           # Show all settings
ralph config get <key>                      # Get a value
ralph config set <key> <value>              # Set a value
ralph config set default.aspect-ratio 9:16
ralph config set default.fps 30
ralph config set default.platform tiktok
ralph config set default.voice <voice-id>
ralph config set api.openrouter-key <key>
ralph config set api.elevenlabs-key <key>
ralph config set render.concurrency 3
ralph config set render.quality production
```

---

### `ralph brand`

Brands — design systems extracted from sites or created manually.

```bash
# Create
ralph brand create --name "Acme Corp" --url https://acme.com
ralph brand create --name "Acme Corp" --from-tokens workspace/references/acme/design-tokens.json
ralph brand create --name "Acme Corp" \
  --primary "#FF5733" --secondary "#333" --accent "#00BFFF" \
  --font "Inter" --logo ./path/to/logo.svg

# Read
ralph brand list                            # All brands
ralph brand show <id>                       # Brand details
ralph brand show <id> --tokens              # Design tokens only

# Update
ralph brand update <id> --name "Acme Inc"
ralph brand update <id> --primary "#FF0000"
ralph brand update <id> --refresh           # Re-extract from the site

# Delete
ralph brand delete <id>
ralph brand delete <id> --with-references   # + remove workspace/references/
```

Storage: `workspace/.ralph/brands/{id}.json` + `workspace/references/{slug}/`

---

### `ralph persona`

Personas — reusable video profiles (voice, visual style, tone, archetype, shooting context). Full schema: `workspace/personas/SCHEMA.md`. Archetypes (vibe-anchor): `workspace/personas/ARCHETYPES.md`.

```bash
# Create — minimum
ralph persona create --name "Alex" \
  --voice elevenlabs:eleven_multilingual_v2/<voice-id> \
  --tone "friendly, casual" \
  --age 25-35 --gender female --language en

# Create — full (extended schema)
ralph persona create --name "Aleks IT 27" \
  --archetype it-remote \
  --voice elevenlabs:eleven_multilingual_v2/<voice-id> \
  --stability 0.55 --similarity 0.8 \
  --tone "deadpan, ironic" --language ru \
  --age 26-34 --gender M \
  --style "oversized t-shirt, dark colors" \
  --hair "medium dark, slight stubble" \
  --vibe "tired-cool, unbothered" \
  --energy "low-medium, deadpan" \
  --speaking-style "short sentences, technical jargon, pause after bombshell" \
  --credibility "5+ years dev experience, ships things" \
  --setting "home office with mechanical keyboard" \
  --wardrobe "black hoodie, no logos" \
  --props "MacBook, AirPods, mug"

# Read
ralph persona list                   # id | name | archetype | voice | tone | language
ralph persona show <id>              # full JSON
ralph persona show <id> -p           # pretty

# Update — same flags as create
ralph persona update <id> --tone "energetic, bold"
ralph persona update <id> --stability 0.7 --similarity 0.8

# Delete
ralph persona delete <id>
```

Archetypes (`--archetype`): `student-grind`, `it-remote`, `courier-driver`, `mom-blogger`, `gen-z-energy`, `startup-founder`, `marketer-perf`, `wfh-worker`.

Storage:
- Registry: `workspace/.ralph/registry.json` (under `personas`)
- Individual file: `workspace/.ralph/personas/{id}.json` (dual-write)

---

### `ralph ref`

External sources — sites for design extraction, social accounts for content analysis.

```bash
# Add reference
ralph ref add https://example.com --type design
ralph ref add https://example.com --type design --brand <brand-id>
ralph ref add https://instagram.com/username --type social
ralph ref add https://tiktok.com/@username --type social
ralph ref add ./local-video.mp4 --type media                    # Local file

# Process (run extraction/analysis)
ralph ref extract <id>                     # Run extraction
ralph ref extract <id> --pages 5           # How many pages to crawl (design)
ralph ref extract <id> --limit 10          # How many reels to download (social)
ralph ref extract <id> --force             # Overwrite existing extract

# Read
ralph ref list                             # All references
ralph ref list --type design               # Design references only
ralph ref list --type social               # Social accounts only
ralph ref list --brand <brand-id>          # References tied to a brand
ralph ref show <id>                        # Details + extraction status
ralph ref show <id> --blueprints           # Show blueprints (social)

# Attach to project
ralph ref attach <ref-id> --to <project-id>
ralph ref detach <ref-id> --from <project-id>

# Delete
ralph ref delete <id>
ralph ref delete <id> --with-data          # + remove downloaded files
```

Storage: `workspace/.ralph/refs/{id}.json` + `workspace/references/{slug}/`

---

### `ralph project`

Video projects — the main working unit.

```bash
# Create
ralph project create --name "Spring Ad" \
  --brand <brand-id> \
  --persona <persona-id> \
  --template <template-id> \
  --brief "30-second product testimonial for Widget X" \
  --platform tiktok \
  --aspect-ratio 9:16 \
  --duration 30

ralph project create --name "Quick Test"   # Minimal, the rest is interactive

# Create from brief (shortcut)
ralph project quick "Product testimonial for Widget X, 30 sec TikTok" \
  --brand <brand-id> --persona <persona-id>

# Read
ralph project list                         # All projects
ralph project list --status draft          # By status
ralph project list --brand <brand-id>      # By brand
ralph project list --batch <batch-id>      # By batch
ralph project show <id>                    # Full info
ralph project show <id> --scenario         # Scenario only
ralph project show <id> --assets           # Assets only
ralph project show <id> --status           # Pipeline-step status

# Update
ralph project update <id> --name "New Name"
ralph project update <id> --brand <brand-id>
ralph project update <id> --persona <persona-id>
ralph project update <id> --brief "Updated brief"

# Pipeline steps (run individual steps)
ralph project scenario <id>                # Generate scenario
ralph project prompts <id>                 # Generate prompts
ralph project assets <id>                  # Generate assets
ralph project assets <id> --type images    # Images only
ralph project assets <id> --type voice     # Voiceover only
ralph project render <id>                  # Render video
ralph project render <id> --quality draft  # Fast draft (low resolution)
ralph project render <id> --scene scene-01 # Render a single scene

# Full pipeline
ralph project run <id>                     # Whole pipeline from scenario to render
ralph project run <id> --from prompts      # Start from a specific step
ralph project run <id> --to assets         # Stop at a step

# Utilities
ralph project open <id>                    # Open in Remotion Studio
ralph project export <id> --output ./export/  # Export video + assets
ralph project clone <id> --name "Copy"     # Clone the project
ralph project reset <id> --step assets     # Reset a step (delete its results)

# Delete
ralph project delete <id>
ralph project delete <id> --keep-render    # Delete everything except the final video

# Project memory / logs (append-only JSONL in workspace/projects/{id}/logs/)
ralph project log <id>                     # last 50 generation entries
ralph project log <id> --type user-prompts
ralph project log <id> --type user-assets
ralph project log <id> --type all --limit 200
ralph project timeline <id>                # merged view: user prompts + assets + generations chronologically

# Manual log entries (the agent must log the brief + user-uploaded assets immediately)
ralph project log-prompt <id> --text "..." --stage brief
ralph project log-prompt <id> --text "..." --stage feedback --note "clip-03 too static"
ralph project log-asset <id> --kind photo --source /path/to/photo.png --purpose character-ref --note "Gleb front-facing"
ralph project log-asset <id> --kind ref-url --source https://example.com --purpose video-ref
```

Storage: `workspace/projects/{id}/` + entry in the registry

Logs: `workspace/projects/{id}/logs/{generations,user-prompts,user-assets}.jsonl` (append-only). For programmatic logging from scripts use `cli/lib/gen-log.ts` (`logGeneration`, `logUserAsset`, `logUserPrompt`, `loggedFetch`).

**Project statuses**: `draft` → `scenario` → `prompts` → `assets` → `rendering` → `done` → `exported`

---

### `ralph template`

Templates — reusable blueprints for videos. They live in two roots:
- **Repo-public:** `templates/<id>/` at the repo root — committed to git, shipped on every clone (the canonical pack: `ai-vegetables`, `before-after-product`, `soviet-nostalgic`, `talking-character`, `talking-head-rant`). Read-only via the CLI; edit by changing files in the repo.
- **User-local:** `workspace/templates/<id>/` — gitignored, per-machine. Use this for templates you don't want to commit, or to shadow a repo template with a local override (same id wins from workspace).

Both roots support two layouts:
- **Flat:** `<root>/<id>.json` — scenario-only, usually created from an existing project.
- **Dir (preferred):** `<root>/<id>/` with `template.json` + `TEMPLATE.md` (LLM-doc) + optional `reference-example.md` (concrete example from the source project) + `fragments.md` + `model-stack.md` + `composition.md`. The template is a vibe-reference; the scenario is written fresh through `scenarist playbook` rather than copied mechanically.

```bash
# Create flat template into workspace (warns if it shadows a repo template)
ralph template create --name "Product Testimonial" --from-project <id>
ralph template create --name "Before/After" --from-file ./my-template.json

# Register existing dir template (workspace or repo) in the local registry
ralph template register <id>

# Read (lists both repo and workspace; each row tagged with `source`)
ralph template list                      # all templates from both roots
ralph template suggest "<utterance>"      # ranked match by tags + metadata
ralph template show <id>                 # prints TEMPLATE.md for dir, JSON for flat
ralph template show <id> --path          # path only (repo or workspace, whichever wins)
ralph template show <id> --json          # template.json metadata (dir only)

# Scaffold new project from template (works with either source)
ralph template use <id> \
  --project <new-project-id> \
  --name "My Video" \
  --brief "One-line brief"
# → creates workspace/projects/<new-project-id>/ with:
#   - standard subdirectories (assets/, logs/, scripts/, render/)
#   - TEMPLATE_ORIGIN.md (pointer to the template with a reading list)
#   - BRIEF.md (if --brief was passed)
# Intentionally does NOT create scenario.json — the scenario is written fresh through scenarist playbook
# using TEMPLATE.md as a vibe-reference.

# Delete (workspace-only; refuses on repo templates)
ralph template delete <id>
```

**Canonical dir-template:** `soviet-nostalgic` (in `templates/entertainment-viral/soviet-nostalgic/`). An example of how to structure a dir-template with a full LLM-doc + prompt fragments + model stack + composition pattern.

Resolution order: workspace beats repo. Listing/suggest scans both and tags each row with `source: "workspace" | "repo"` so chat can tell users where the match came from.

---

### `ralph batch`

Batch operations — bulk video generation.

```bash
# Create
ralph batch create --name "Spring Campaign" \
  --template <template-id> \
  --variations ./variations.csv \
  --concurrency 3

ralph batch create --name "Daily Posts" \
  --template <template-id> \
  --variations ./variations.json \
  --brand <brand-id> \
  --persona <persona-id>

# Read
ralph batch list
ralph batch show <id>                      # Overview
ralph batch status <id>                    # Detailed status of every project
ralph batch status <id> --failed           # Failed only

# Run
ralph batch run <id>                       # Run the batch
ralph batch run <id> --from assets         # From a specific step
ralph batch run <id> --concurrency 5       # Override concurrency
ralph batch pause <id>                     # Pause
ralph batch resume <id>                    # Resume

# Recovery
ralph batch retry <id>                     # Re-run failed projects
ralph batch retry <id> --project <pid>     # Re-run a specific project
ralph batch retry <id> --from assets       # Re-run from a step

# Export
ralph batch export <id> --output ./renders/ # Collect all final videos in a folder
ralph batch report <id>                    # Report: how many done, errors, stats

# Delete
ralph batch delete <id>
ralph batch delete <id> --with-projects    # + delete every project in the batch
```

Storage: `workspace/batches/{id}/`

variations.csv format:
```csv
name,product,color,testimonial
"Ad 1","Widget A","#FF5733","Great product!"
"Ad 2","Widget B","#33FF57","Amazing quality!"
```

---

### `ralph asset`

Direct asset operations (not tied to the pipeline).

```bash
# Generate standalone assets
ralph asset image --prompt "..." --model flux-pro --output ./image.png
ralph asset image --prompt "..." --style "photorealistic, 4k" --aspect 9:16
ralph asset video --prompt "..." --duration 5 --output ./clip.mp4
ralph asset voice --text "Hello world" --voice <voice-id> --output ./voice.mp3
ralph asset voice --text "Hello world" --persona <persona-id>
ralph asset music --prompt "upbeat electronic" --duration 30 --output ./music.mp3
ralph asset caption --audio ./voice.mp3 --output ./captions.srt

# List project assets
ralph asset list --project <id>
ralph asset list --project <id> --type images
ralph asset list --project <id> --missing    # Which assets aren't generated yet

# Regenerate specific asset
ralph asset regen --project <id> --slot scene-01-bg-image
ralph asset regen --project <id> --slot scene-01-bg-image --prompt "new prompt..."

# Clean
ralph asset clean --project <id>             # Remove every asset in the project
ralph asset clean --project <id> --type videos  # One type only
```

---

### `ralph workspace`

Workspace management.

```bash
ralph workspace stats                       # Size, project count, asset count
ralph workspace clean                       # Remove everything in workspace
ralph workspace clean --renders             # Renders only
ralph workspace clean --assets              # Assets only (keep scenarios)
ralph workspace clean --stale               # Remove projects older than 30 days
ralph workspace clean --stale --days 7

ralph workspace doctor                      # Integrity check (broken links, etc.)
ralph workspace du                          # Disk usage by category
```

---

### `ralph component`

Manage the Remotion component library.

```bash
# List
ralph component list                        # All components in src/lib/components/
ralph component list --category captions    # By category

# Scaffold new component
ralph component create --name GlitchText --category text
ralph component create --name PolaroidLayout --category layouts
# → creates a file at src/lib/components/{category}/{Name}.tsx + a showcase entry

# List video-specific compositions
ralph component videos                     # src/videos/*
ralph component videos --clean <name>      # Remove a video composition
```

---

## Entity registry

`workspace/.ralph/registry.json`:

```json
{
  "brands": {
    "acme": {
      "id": "acme",
      "name": "Acme Corp",
      "url": "https://acme.com",
      "tokensPath": "workspace/references/acme/design-tokens.json",
      "createdAt": "2026-03-29T10:00:00Z"
    }
  },
  "personas": {
    "alex": {
      "id": "alex",
      "name": "Alex",
      "voice": "eleven_monolingual_v1:rachel",
      "tone": "friendly, casual",
      "language": "en",
      "createdAt": "2026-03-29T10:00:00Z"
    }
  },
  "refs": { ... },
  "projects": { ... },
  "templates": { ... },
  "batches": { ... }
}
```

Each entity also has its own JSON file under the matching directory for detailed data.

---

## Output

### JSON (default)

```bash
$ ralph project list
[
  {"id": "spring-001", "name": "Spring Ad", "status": "done", "brand": "acme", "createdAt": "2026-03-29T10:00:00Z"},
  {"id": "spring-002", "name": "Summer Ad", "status": "assets", "brand": "acme", "createdAt": "2026-03-29T11:00:00Z"}
]
```

### Pretty (--pretty)

```bash
$ ralph project list --pretty

  ID           Name         Status   Brand   Created
  spring-001   Spring Ad    done     acme    2h ago
  spring-002   Summer Ad    assets   acme    1h ago

  2 projects
```

---

## CLI tech stack

- **Runtime**: `tsx` (TypeScript without compilation)
- **Framework**: `citty` (light, tree-shakeable) or `commander`
- **Prompts**: `@clack/prompts` (nice interactive prompts)
- **Output**: `chalk` (colors), custom JSON/table formatter
- **Validation**: `zod` (reuse schemas from src/lib/types/)
- **File ops**: Node.js `fs/promises`

## CLI file layout

```
cli/
├── index.ts              # Entry point, command registration
├── commands/
│   ├── init.ts
│   ├── config.ts
│   ├── brand.ts
│   ├── persona.ts
│   ├── ref.ts
│   ├── project.ts
│   ├── template.ts
│   ├── batch.ts
│   ├── asset.ts
│   ├── workspace.ts
│   └── component.ts
├── lib/
│   ├── registry.ts       # Entity registry CRUD
│   ├── output.ts         # JSON/pretty formatter
│   ├── prompts.ts        # Interactive prompts
│   ├── config.ts         # Config read/write
│   └── ids.ts            # ID generation
└── types.ts              # CLI-specific types
```

---

## Claude Code integration

Skills call ralph for operations instead of touching files manually:

```bash
# Instead of mkdir + write JSON:
ralph project create --name "Test" --brief "..." --no-interactive

# Instead of parsing directories:
ralph project list --status draft

# Instead of reading JSON files:
ralph project show spring-001 --scenario
```

CLAUDE.md should include a section with ralph commands so Claude Code knows how to use the CLI.
