# Agent Guide — ralph UGC Pipeline

A guide for Claude Code agents and skills. Covers how to work with the project, which tools to use, and how everything is laid out.

## The golden rule

**Use the ralph CLI for every data-root operation.** Don't create or edit files in `.ralphy/` directly — go through the CLI. This guarantees that registry.json, entity files, and directories stay in sync. (`.ralphy/` is hidden: use `fd -H` or CLI verbs to inspect it, never conclude from a blind `ls`.)

```bash
# Run the CLI
bun run cli/index.ts <command>

# Or via the package script
bun run ralph -- <command>
```

All commands return JSON by default — parse the output. For human-readable output add `-p`.

---

## Project entities

### Workspace (studio / universe grouping, #108)

A workspace groups related projects and owns a `shared/` asset tier (cast masters, brand logos, music) reused across them. Everything lives under the hidden `.ralphy/` data root; the registry maps `id → workspace`, so every other verb keeps taking a bare project `<id>`.

```bash
ralph workspace create fogtown --name "Fog Town" --description "choose-* horror universe"
ralph workspace list                 # slug, name, project count, active flag
ralph workspace show fogtown         # workspace.json + project list
ralph workspace use fogtown          # set as the default home for new projects
ralph project move choose-swamp-001 fogtown   # relocate a project (updates registry)
```

**Storage:** `.ralphy/workspaces/<ws>/{workspace.json,shared/,projects/,templates/,batches/}`.

**`shared/` resolution:** `--ref` / `--first-frame` / `--audio` paths resolve project-first, then workspace: cwd → `<project>/` → `<project>/artifacts/refs/` → `workspaces/<ws>/shared/`. The explicit `--ref shared/cast/nurse.png` form targets the shared tier directly — promote a reusable master into `shared/` once, reference it from every project in the workspace.

**Legacy roots:** a pre-#106 `workspace/` tree fails fast with `E_LEGACY_LAYOUT` on every verb except `ralphy migrate` / `ralphy doctor`. Run `ralphy migrate --dry-run`, review the plan, then `ralphy migrate`.

---

### Brand (brand / design system)

A brand stores visual identity: colors, fonts, site URL. Used to style videos.

```bash
# Create
ralph brand create --name "Acme Corp" --url https://acme.com --primary "#FF6B35" --font "Inter"

# Read
ralph brand list
ralph brand show <id>

# Update
ralph brand update <id> --name "Acme Inc" --primary "#FF0000"

# Delete
ralph brand delete <id>
```

**Storage:**
- Registry: `.ralphy/registry.json` → `brands.<id>`
- Details: `.ralphy/workspaces/<ws>/shared/brands/<id>.json` (the active workspace's `shared/` tier)
- Design tokens (if extracted): `.ralphy/references/<slug>/design-tokens.json`

---

### Persona (character)

A persona = voice + speech style + demographics. Reused across projects.

```bash
# Create with full voice config
ralph persona create \
  --name "Alex" \
  --voice "elevenlabs:eleven_monolingual_v1/rachel" \
  --tone "friendly, casual" \
  --language en \
  --age "22-28" \
  --gender female \
  --stability 0.65 \
  --similarity 0.78

# Voice format: "provider:model/voiceId"
# For example: "elevenlabs:eleven_v2/adam"

ralph persona list
ralph persona show <id>
ralph persona update <id> --tone "energetic, bold"
ralph persona delete <id>
```

**Storage:** `.ralphy/workspaces/<ws>/shared/personas/<id>.json`

---

### Reference (external source)

A link to a site (for design extraction) or social account (for content analysis).

```bash
# Add
ralph ref add https://example.com --type design --brand acme
ralph ref add https://instagram.com/username --type social

# Attach to a project
ralph ref attach <ref-id> --to <project-id>

ralph ref list [--type design|social] [--brand <id>]
ralph ref show <id>
ralph ref delete <id>
```

**Types:** `design` (for /ralph-ugc:extract-design), `social` (for /ralph-ugc:extract-social), `media` (local file)

**Storage:**
- Registry + `.ralphy/workspaces/<ws>/shared/refs/<id>.json`
- Downloaded data: `.ralphy/references/<slug>/` (global, cross-workspace)

---

### Project (video project)

The central entity. One project = one video. Walks through the pipeline steps.

```bash
# Create
ralph project create \
  --name "Spring Ad" \
  --brand acme \
  --persona alex \
  --brief "30-second product testimonial for Widget X" \
  --platform tiktok \
  --aspect-ratio "9:16" \
  --duration 30

# Custom ID
ralph project create --name "My Video" --id my-custom-id

# List with filters
ralph project list
ralph project list --status draft
ralph project list --status done --brand acme

# Details
ralph project show <id>
ralph project show <id> --status          # Pipeline status only
ralph project show <id> --scenario        # Full scenario.json
ralph project show <id> --prompts         # Full prompts.json
ralph project show <id> --assets          # Full asset-manifest.json

# Update
ralph project update <id> --brief "New brief" --persona other-persona

# Clone (copies all files)
ralph project clone <id> --name "Copy of Spring Ad"

# Delete
ralph project delete <id>
ralph project delete <id> --keep-render   # Keep the final video
```

**Project statuses** (determined by which files exist):
- `draft` — just created, no scenario.json
- `scenario` — has scenario.json
- `prompts` — has prompts.json
- `assets` — has asset-manifest.json
- `done` — has render/final.mp4

**Storage:**
```
.ralphy/workspaces/<ws>/projects/<id>/
  scenario.json           — master scenario (output of /ralph-ugc:create-scenario)
  prompts.json            — generation prompts (output of /ralph-ugc:generate-prompts)
  artifacts/              — all media the project consumes or produces (#105)
    refs/                 — input references
    images/               — generated images
    videos/               — generated video clips
    voiceover/            — voiceover (ElevenLabs)
    music/                — background music
    sfx/                  — sound effects
    captions/             — subtitles (.json / .srt)
    fonts/                — fonts used by the composition
  asset-manifest.json     — asset registry (output of /ralph-ugc:generate-assets)
  index.html              — HyperFrames composition (output of /ralph-ugc:compose-video)
  render/
    final.mp4             — final video
```

---

### Template (video template)

A reusable blueprint for a video. Two formats: **flat** (`<id>.json`, scenario only) and **dir** (`<id>/` with full LLM-doc, preferred for video formats).

Templates live in two tiers and the CLI reads both:
- **Public content library** — the static `library.json` served on Bunny CDN (same library the `/library` landing serves). The old repo-public `templates/` folder is retired.
- **User-local** `.ralphy/workspaces/<ws>/templates/<id>/` — gitignored, scoped to the active workspace. Same id as a public template wins (override semantics).

`template list` and `template suggest` tag each row with its source so you can tell which tier was matched.

**When to grab a dir-template:** at the start of a new project that resembles a successful one in format. Example: every soviet-nostalgic TikTok clip → `soviet-nostalgic` template with ready prompt fragments, scene-skeleton, and model-stack.

```bash
# Quick start a new project from a template
ralph template list                                   # all templates, repo + workspace
ralph template suggest "vegetable video"              # ranked match (cross-source)
ralph template show soviet-nostalgic                  # read TEMPLATE.md
ralph template use soviet-nostalgic \
  --project my-spring-ad-001 \
  --name "My Spring Ad" \
  --brief "One-line brief"
# → .ralphy/workspaces/<ws>/projects/my-spring-ad-001/ with TEMPLATE_ORIGIN.md, standard subdirectories.
# scenario.json is intentionally NOT created — author it through scenarist playbook.

# Create a flat template from an existing project (lands in workspace)
ralph template create --name "Product Testimonial" --from-project spring-001

# Register a manually built dir-template (workspace or repo)
ralph template register <id>

# Delete (workspace-only — repo templates are read-only via CLI)
ralph template delete <id>
```

**Dir-template structure:**
```
.ralphy/workspaces/<ws>/templates/<id>/
  template.json           — metadata (name, description, tags, stackSummary)
  TEMPLATE.md             — main LLM-doc: vibe, when to use, what varies, workflow
  reference-example.md    — concrete example from the source project with annotations (optional but recommended)
  fragments.md            — reusable prompt fragments (style, characters, products, quality guards, music, VO settings)
  model-stack.md          — what to use, what NOT to use (with failure modes)
  composition.md          — HyperFrames composition pattern (timing, transitions, music split, VO sync)
```

**Principle:** a template is a vibe-reference. The scenario is written fresh through `scenarist playbook` for every new project; the previous scenario lives in `reference-example.md` as a concrete vibe example, not as Mad Libs for substituting variables.

**Canonical example:** the `soviet-nostalgic` template in the public library (`ralphy template show soviet-nostalgic`).

**Storage:** flat — `<root>/<id>.json`; dir — `<root>/<id>/`. `<root>` is the active workspace's `.ralphy/workspaces/<ws>/templates/` (the public library tier lives on the CDN, read-only via CLI).

---

### Batch (batch operation)

Bulk video generation. Creates N projects from a template with variations.

```bash
# Create
ralph batch create \
  --name "Spring Campaign" \
  --template product-testimonial \
  --variations ./variations.csv \
  --concurrency 3

# Status
ralph batch list
ralph batch show <id>
ralph batch status <id>

# Delete
ralph batch delete <id>
ralph batch delete <id> --with-projects
```

**variations.csv format:**
```csv
name,product,color,testimonial
"Ad 1","Widget A","#FF5733","Great product!"
"Ad 2","Widget B","#33FF57","Amazing quality!"
```

**Storage:** `.ralphy/workspaces/<ws>/batches/<id>/batch-config.json` + `state.json`

---

### Asset (project assets)

```bash
# All assets in a project
ralph asset list --project <id>

# Filter by type
ralph asset list --project <id> --type image
ralph asset list --project <id> --type audio

# Which assets aren't generated yet (from manifest)
ralph asset list --project <id> --missing

# Clean assets
ralph asset clean --project <id>              # All
ralph asset clean --project <id> --type images  # Images only
```

---

### Workspace

```bash
# Stats
ralph workspace stats

# Clean
ralph workspace clean --renders   # Renders only
ralph workspace clean --assets    # Assets only (keep scenarios)
ralph workspace clean --all       # Everything (config preserved)
```

---

### Config

```bash
ralph config list
ralph config get defaults.platform
ralph config set defaults.platform tiktok
ralph config set defaults.fps 30
ralph config set render.concurrency 5
```

---

### Memory (#112-#114)

Tiered markdown memory that survives across projects. Two tiers: **global**
(`.ralphy/memory/` — model quirks, prompt craft, tooling lessons) and
**workspace** (`.ralphy/workspaces/<ws>/memory/` — cast, style DNA, what this
client rejects). Each tier holds flat `<slug>.md` entries (frontmatter + the
rule with `Why / How to apply / Does NOT apply to` lines), a generated
`MEMORY.md` index, a `proposed/` staging dir, and `rejected/`.

```bash
ralphy memory note "<rule>" [--workspace [<ws>]] [--type craft] [--slug s]   # write an ACTIVE entry
ralphy memory propose "<rule>"                  # stage a candidate into proposed/
ralphy memory list [--proposed] [--global]      # both tiers by default
ralphy memory show <slug>                       # workspace tier first, then global
ralphy memory search <query>                    # substring scan over both tiers
ralphy memory approve <slug> | --all            # promote proposed -> active (MOVE)
ralphy memory reject <slug>                     # proposed -> rejected/ (MOVE, never delete)
ralphy memory distill <project-id> [--dry-run]  # postmortem -> staged proposals (#113)
ralphy memory recall [--full]                   # merged intake digest (workspace wins on collision)
```

Discipline: append-only (an existing slug re-noted lands at `<slug>.v2.md`);
the active tier caps at 100 entries — at capacity, consolidate instead of
adding; distillation NEVER auto-approves (promotion is the user's `approve`);
`recall` runs at intake (AGENTS.md step 0) and its output is background
reference, not instructions. Memory holds durable rules and facts — task
progress and session outcomes belong in project `logs/` + `postmortem/`.

---

## Dashboard

```bash
# Launch
ralph dashboard              # http://localhost:4321
ralph dashboard --port 8080

# Or via npm
npm run dashboard
```

The dashboard updates in real time when workspace/ changes (WebSocket + chokidar).

---

## Pipeline: from idea to video

### Step 1: Preparation (optional)

```bash
# Extract the client's site design
ralph ref add https://client.com --type design --brand client
# → next, use the /ralph-ugc:extract-design skill

# Analyze successful content
ralph ref add https://instagram.com/competitor --type social
# → next, use the /ralph-ugc:extract-social skill
```

### Step 2: Project creation

**Variant A — from a template (preferred when the format is already proven):**
```bash
ralph template list                                   # see what's available
ralph template show soviet-nostalgic                  # read TEMPLATE.md
ralph template use soviet-nostalgic \
  --project client-spring-001 \
  --name "Client Spring Ad" \
  --brief "..."
# → .ralphy/workspaces/<ws>/projects/client-spring-001/ with TEMPLATE_ORIGIN.md (pointer to template docs)
#   and standard subdirectories (artifacts/, logs/, scripts/, render/).
# The scenario is written fresh through /ralph-ugc:create-scenario, using TEMPLATE.md as a vibe-reference.
```

**Variant B — from scratch:**
```bash
ralph brand create --name "Client" --url https://client.com --primary "#FF6B35"
ralph persona create --name "Narrator" --voice "elevenlabs:eleven_v2/rachel" --tone "friendly"
ralph project create --name "Product Demo" --brand client --persona narrator --brief "30s TikTok testimonial"
```

**Right after creating the project — log the brief and any user-supplied references:**
```bash
ralph project log-prompt <id> --text "<full user brief>" --stage brief
ralph project log-asset <id> --kind screenshot --source /path/to/screenshot.png --purpose product-ref
ralph project log-asset <id> --kind ref-url --source https://instagram.com/... --purpose video-ref
```

### Step 3: Content generation (via skills)

```
/ralph-ugc:create-scenario   → scenario.json
/ralph-ugc:generate-prompts  → prompts.json
/ralph-ugc:generate-assets   → artifacts/ + asset-manifest.json
/ralph-ugc:compose-video     → render/final.mp4
```

Or the whole pipeline in one command:
```
/ralph-ugc:run-pipeline
```

### Step 4: Verify the result

```bash
ralph project show <id> --status   # Check progress
ralph asset list --project <id>    # See what was generated
ralph asset list --project <id> --missing  # What's still needed
ralph project timeline <id>        # Project history (user prompts + assets + gen calls)
ralph project log <id>             # Detailed generation call log
ralph dashboard                    # Visual browser
```

### Step 5: Extracting a template (after a successful video)

If the format is reproducible — extract it into a template so the next chat can start fast:

```bash
# Flat variant — scenario only, for batch generation with variables
ralph template create --name "Product Ad" --from-project working-example

# Dir variant (preferred for video formats) — built manually:
# 1. mkdir .ralphy/workspaces/<ws>/templates/<slug>/
# 2. Create template.json (metadata), TEMPLATE.md (vibe, workflow),
#    reference-example.md (concrete example from the source project),
#    fragments.md (prompt library), model-stack.md (what/why),
#    composition.md (HyperFrames composition pattern)
# 3. ralph template register <slug>
#
# Important: a template carries vibe and patterns, but does NOT generate the scenario mechanically.
# Scenarios for each new project are written fresh through /ralph-ugc:create-scenario.
```

See the `soviet-nostalgic` dir-template (`ralphy template show soviet-nostalgic`) as a model.

### Bulk generation

```bash
ralph batch create --name "100 Ads" --template product-ad --variations ./data.csv --concurrency 3
# → next, use the /ralph-ugc:run-pipeline skill in batch mode
```

---

## Project memory — required logging

Every project keeps an append-only history under `<project>/logs/` (`<project>` = `.ralphy/workspaces/<ws>/projects/<id>`). This is critical: in the next chat, handing over a project path is enough to recover full context.

**What to log:**
1. **The user's brief** — as soon as the user writes it: `ralph project log-prompt <id> --text "..." --stage brief`
2. **Any feedback** — `--stage feedback` (e.g. "clip-03 is boring")
3. **Every user-uploaded asset** — screenshots, character photos, product refs, brand documents: `ralph project log-asset <id> --kind photo --source <path> --purpose character-ref`
4. **Every model call** is auto-logged by `ralphy generate <kind>`. CLI commands wrap `cli/lib/providers/media.ts` which calls `logGeneration()` internally with provider/endpoint/cost. **Do not write runtime TS scripts under `<project>/scripts/` to call APIs** — see AGENTS.md hard rule #2. If an operation isn't covered by `ralphy generate`: add a helper to ralphy first.

```bash
# Each of these auto-logs to generations.jsonl:
ralphy generate image    --project <id> --slot scene-01-bg --prompt "..." [--ref <url>]
ralphy generate video    --project <id> --slot scene-01-vid --image <ref> --prompt "..." --duration 5
ralphy generate voiceover --project <id> --persona <name> --text "..."
ralphy generate music    --project <id> --prompt "..." --duration 30
ralphy generate captions --project <id> --slot scene-01 --audio <path>
```

**Reading logs:**
```bash
ralph project log <id>                          # generations (last 50)
ralph project log <id> --type user-prompts
ralph project log <id> --type user-assets
ralph project log <id> --type all --limit 200
ralph project timeline <id>                     # merged, chronological
```

---

## File architecture

```
ugc-cli/
├── cli/                     # ralph CLI
│   ├── index.ts             # Entry point (commander setup)
│   ├── commands/            # Commands (brand.ts, project.ts, ...)
│   └── lib/                 # Utilities (registry.ts, output.ts, paths.ts, ...)
├── dashboard/               # React SPA dashboard (retired)
│   ├── server/              # Hono API + chokidar + WebSocket
│   └── src/                 # React + Zustand + Vite
├── .ralphy/                 # ALL GENERATED FILES (gitignored, hidden — fd -H)
│   ├── registry.json        # Central registry of all entities (id → workspace)
│   ├── config.json          # CLI settings (incl. activeWorkspace)
│   ├── cache/               # assets / library / svg caches
│   ├── research/            # Global research output (+ research/jobs/)
│   ├── references/          # Downloaded extracts (design, social) — global
│   └── workspaces/<ws>/     # Workspace layer (#108)
│       ├── workspace.json   # { name, slug, created, description }
│       ├── shared/          # Workspace-shared assets (brands/ personas/ refs/ cast/ ...)
│       ├── projects/        # Video projects (#105 artifacts/ inside)
│       ├── templates/       # User-local templates
│       └── batches/         # Batch operations
├── .agents/skills/          # Skills (source of truth)
├── .claude/skills/          # Skill symlinks
├── docs/                    # Specifications
│   ├── agent-guide.md       # ← YOU ARE HERE
│   ├── cli-spec.md          # Full CLI spec
│   └── dashboard-spec.md    # Dashboard spec
└── CLAUDE.md                # Root instructions (read first)
```

---

## Important rules for agents

1. **Always use the ralph CLI** for CRUD operations. Don't write to registry.json directly.
2. **Parse the JSON output** of CLI commands inside skills to get data.
3. **Generated content** lives in `<project>/` (`.ralphy/workspaces/<ws>/projects/<id>/`) only.
4. **HyperFrames assets** — reference `<project>/artifacts/` via relative paths from inside `index.html`. No symlinks.
5. **Check status** via `ralph project show <id> --status` before launching the next pipeline step.
6. **Batch mode** — don't run more projects in parallel than `config.render.concurrency`.
7. **This documentation can be updated** — if you add a new command or change behavior, refresh this file.
