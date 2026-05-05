---
name: ralph-producer
description: >
  High-level orchestration role. Owns end-to-end single-video pipeline, batch
  generation of N videos from a template, template lifecycle (use existing, extract
  new), batch review / status rollup, cost rollup, and profile export/import for
  sharing workspace contents across users. Invoke when the user asks to "make a
  video end-to-end", "run the full pipeline", "make N videos from this template",
  "batch generate", "save this project as a template", "create template from X",
  "review the batch", "what's the state of batch Y", "export / import profile".
metadata:
  tags: orchestration, pipeline, batch, templates, profile, cost-rollup, batch-review, end-to-end
---

# Producer

Nothing-to-final-video role. I sequence the other roles (researcher → scenarist →
art director → editor), decide when to batch, when to extract a template, when to
run a smoke pass, and how to roll up state across N projects. I also handle the
boring-but-high-leverage ops: batch review, cost rollup, and profile share.

## When to invoke me

- User says "make me a video about X" with enough context that we can run
  end-to-end → sub-task `single-video-pipeline`.
- User asks for multiple videos off a template ("10 soviet-style videos", "5
  A/B variants") → sub-task `batch-from-template`.
- User asks to turn a successful project into a template → sub-task
  `extract-template`.
- User asks "how's the batch", "what failed", "how much have we spent" →
  sub-task `batch-review`.
- User asks to share / receive a workspace → sub-task `profile-share`.

## What I read on start

- `workspace/projects/` — what projects already exist (avoid ID collisions).
- `workspace/templates/` + `bun run ralph -- template list` — what templates
  are available, so "make me a video in X style" can be matched.
- `workspace/batches/<batch-id>/state.json` for any running batch.
- `profiles/` directory — which profiles can be imported.
- `MODELS.md` — per-model cost figures for cost previews.

## Sub-task: single-video-pipeline

- **When:** one video, end-to-end.
- **Steps:**
  1. **Research if needed** — if the user supplied a site or social URL, call
     `/ralph-researcher` first and get references on disk.
  2. **Scaffold the project:**
     ```bash
     bun run ralph -- project create --id <ctx>-<NNN> --name "<human name>"
     ```
     (or `ralph template use <slug> --project <id> --name "..." --brief "..."`
     when starting from a template).
  3. Save the brief:
     - Write `workspace/projects/<id>/BRIEF.md` with the raw user brief.
     - Log via `bun run ralph -- project log-prompt <id> --text "<brief>" --stage brief`.
  4. **Scenario** — hand to `/ralph-scenarist` → produces `scenario.json`.
     Pause and let the user approve it before spending money.
  5. **Prompts + assets** — hand to `/ralph-art-director`:
     - `prepare-prompts` → `prompts.json`.
     - Show a cost preview.
     - `generate-assets` → `assets/*` + `asset-manifest.json`.
  6. **Composition + render** — hand to `/ralph-editor`:
     - `preflight`.
     - `author-composition` + `preview` (optional if user wants eyeballs).
     - `final-render` → `render/final.mp4`.
  7. Report final path, total cost (sum `generations.jsonl.cost_usd`),
     duration.
- **Outputs:** full project tree including rendered MP4.

## Sub-task: batch-from-template

- **When:** ≥ 3 videos off one template. Fewer videos → just run
  `single-video-pipeline` multiple times.
- **Phases:**

  ### Phase 1 — Brainstorm ideas
  1. Read the template end-to-end:
     - `workspace/templates/<template-id>/TEMPLATE.md` (vibe, constants, axes).
     - `workspace/templates/<template-id>/reference-example.md` (concrete
       example).
     - `workspace/templates/<template-id>/template.json` (metadata, required
       assets, cost ballpark).
  2. Generate N idea proposals varying along the template's documented axes.
     Each idea: `id` (kebab-case slug), `title`, `concept` (1–2 sentences),
     `brief` (3–6 sentences for the scenarist).
  3. Present as a table or numbered list in chat. Do **not** write to disk
     yet.
  4. Ask the user to approve / edit / drop. One message, not rapid-fire
     questions.

  ### Phase 2 — Lock approved set
  1. Write the final list to
     `workspace/batches/<batch-id>/ideas-approved.json`:
     ```json
     {
       "batchId": "soviet-cosmetics-2026-04",
       "template": "soviet-nostalgic",
       "createdAt": "...",
       "concurrency": 2,
       "ideas": [
         { "id": "matte-lipstick-001", "title": "...", "concept": "...",
           "brief": "..." }
       ]
     }
     ```
  2. Pick a sensible `batch-id` (kebab-case + theme + month/quarter).
  3. Default `concurrency: 2`. Never exceed 3 — fal queue and ElevenLabs
     starter cap will throttle.
  4. Cost preview: `N × per-video cost from template card = $total`. Make
     the user explicitly confirm before Phase 3.

  ### Phase 3 — Scaffold projects
  ```bash
  bunx tsx .agents/skills/ralph-producer/scripts/scaffold-batch.ts \
    --batch-id <batch-id>
  ```
  Creates one project per idea via `ralph template use`, copies required
  template assets, writes `BRIEF.md`, logs the prompt. Output:
  `workspace/batches/<batch-id>/state.json` with per-project `pending`
  status.

  ### Phase 4 — Run pipeline in parallel
  Two options, pick by how much human-in-the-loop is needed.

  - **Option A — fully autonomous:** spawn N parallel sub-agents (Agent
    tool, `general-purpose` type), one per project, each running the single-
    video pipeline end-to-end. Limit concurrent agents to the batch
    `concurrency` value. Each agent must call `logGeneration` /
    `loggedFetch` for every API call and report back render path or
    failure.
  - **Option B — staged with checkpoints:** run sequentially per project,
    but skip approval prompts for artifact types already approved in
    project 1. Recommended for the first 1–2 batches off a new template.

  After each project finishes (or fails), update state:
  ```bash
  bunx tsx .agents/skills/ralph-producer/scripts/batch-status.ts \
    --batch-id <batch-id> --update <project-id> \
    --status completed --render-path <path>
  ```

  ### Phase 5 — Report
  See sub-task `batch-review` below.

- **Concurrency rules:**
  - fal.ai queue: 2–3 parallel safe; 5+ throttles.
  - ElevenLabs: starter/free caps at 3 concurrent → 429. Always sequential
    **per project**; parallelism only across projects.
  - Local rendering (Remotion): CPU-bound, one at a time on local machine.
  - Music generation: 1 per project, negligible.

- **Failure recovery:** if a project fails, its `state.json` entry is
  `failed` with the last-completed step. "Retry failed" → re-run the
  pipeline on just those projects; the asset-generation scripts respect
  `--skip-existing`.

## Sub-task: batch-review

- **When:** user asks "how's the batch", or after Phase 4 completes.
- **Steps:**
  1. Summary table from `state.json`:
     ```bash
     bunx tsx .agents/skills/ralph-producer/scripts/batch-status.ts \
       --batch-id <batch-id>
     ```
  2. Sum costs across all completed projects:
     `sum(generations.jsonl.cost_usd)` per project, total at the bottom.
  3. For each `failed` project: which step, the last log line, and a
     suggested next action (retry / manual fix / drop).
  4. For each `completed` project: render path + duration + per-project
     cost.
  5. Offer follow-ups: "retry failed?", "review renders in dashboard?",
     "export as profile?".

## Sub-task: extract-template

- **When:** a project landed well and the user wants to reuse the format.
  Optional arg: source project ID.

### Guardrails
- Template = **vibe reference, not Mad Libs.** Read
  `workspace/templates/soviet-nostalgic/TEMPLATE.md` as the canonical
  example before writing a new one.
- Avoid `{VAR}` placeholder skeletons, avoid locking VO lines / exact clip
  tables / timings into the template. Those go in `reference-example.md`
  as one concrete instance, not as required shape.
- Do **not** extract from projects that only have one result or haven't
  rendered successfully yet.

### Workflow

1. **Read the source project fully:**
   ```
   workspace/projects/<id>/
     BRIEF.md
     TEMPLATE_ORIGIN.md (if scaffolded)
     scenario.json
     prompts.json
     asset-manifest.json
     composition-props.json
     scripts/*.ts
     logs/generations.jsonl     <- gold for cost + model-stack
     logs/user-prompts.jsonl    <- what the user iterated on
     assets/
     render/final.mp4
   ```
   Use `bun run ralph -- project timeline <id>` for a merged chronology.

2. **Agree on scope in chat** (5–7 bullets before writing files):
   - What is the **format** vs the **specific content** of this project.
   - Which axes **vary** between videos of this format.
   - Which constants are critical for recognition (voice style, visual
     contrast, required music track, runtime band).
   - What has to be **copied per project** (trend music, brand font).
   - When the template should **not** be used.

3. **Scaffold the template directory:**
   ```bash
   bunx tsx .agents/skills/ralph-producer/scripts/scaffold-template.ts \
     --slug <kebab-slug> \
     --name "<Human Name>" \
     --from-project <project-id>
   ```
   Creates `workspace/templates/<slug>/` with `template.json`,
   stub `TEMPLATE.md`, `fragments.md`, `model-stack.md`, `composition.md`,
   `reference-example.md`.

4. **Fill the docs in this order** (each builds on the previous):
   - **`reference-example.md`** — full VO, per-clip motion sketch with real
     timings, key prompts per scene, annotations on what to notice.
   - **`fragments.md`** — reusable building blocks (style fragments,
     character / product description patterns with adaptation rules,
     quality guards, music prompts, VO settings). No Mad Libs.
   - **`model-stack.md`** — order of operations with models + real costs
     from `generations.jsonl`, alternatives that did not work (from logs +
     user-prompts.jsonl), pinned versions where critical.
   - **`composition.md`** — Remotion skeleton, key patterns (transition
     durations, VO sync, dual-music split), quirks.
   - **`TEMPLATE.md`** — the highest-level doc: why the format works, vibe
     anchors, variation axes, required inputs from the user, narrative arc
     as shape (not prescription), music, workflow, cost ballpark, when
     NOT to use.
   - **`template.json`** — fill `description`, `tags`, `kind:
     "vibe-reference"`, `assets` (each required asset block with
     `required: true`), `doNotCopyLiterally`, `constants`.

5. **Copy required assets** (trend music, brand fonts, recurring reference
   images) from the source project into
   `workspace/templates/<slug>/assets/`, and declare them in
   `template.json.assets`.

6. **Register the template:**
   ```bash
   bun run ralph -- template register <slug>
   bun run ralph -- template list
   ```

7. **Smoke-test with a scaffold:**
   ```bash
   bun run ralph -- template use <slug> \
     --project test-<slug>-001 \
     --name "Test scaffold" \
     --brief "smoke test"
   ```
   Confirm `TEMPLATE_ORIGIN.md` points at the new docs, required assets
   landed in the right sub-dirs. Delete the test project afterwards:
   ```bash
   bun run ralph -- project delete test-<slug>-001
   rm -rf workspace/projects/test-<slug>-001
   ```

8. **Report** — scope, required user inputs, per-video cost, how to
   invoke for a new video or a batch.

### When to say "not yet"
- Only 1 video in the format and it only vaguely worked → wait.
- Genuinely one-off idea → don't bother templatizing.
- Project isn't rendered yet / logs are partial → wait.

## Sub-task: profile-share

- **When:** user wants to share their workspace (templates, references,
  reference projects) or import someone else's.
- **Export:**
  ```bash
  bun run ralph -- profile export <nickname>
  # optional: --include-renders to ship heavy .mp4s
  ```
  → writes `profiles/<nickname>/` with an auto-generated `PROFILE.md`.
- **Import:**
  ```bash
  bun run ralph -- profile list                 # see what's available
  bun run ralph -- profile show <nickname>      # read the PROFILE.md
  bun run ralph -- profile import <nickname>    # additive by default
  bun run ralph -- profile import <nickname> --overwrite
  ```
- **What travels:** `templates/`, `references/`, `projects/` (without
  `render/`, `renders/`, `assets/videos/`, `*.mp4|.mov|.webm`,
  `node_modules/`, `batches/`), plus `.ralph/registry.json`. `PROFILE.md`
  is regenerated on each export.
- **Import is additive:** existing local files are preserved unless
  `--overwrite`. `.ralph/registry.json` is deep-merged. `.jsonl` logs are
  appended unique. Safe to run repeatedly.
- **When to export:** after a new template, a reusable reference project,
  a design extract worth sharing. Do not commit a profile on every small
  tweak.

## What I do NOT do

- I do not author scenarios, prompts, or Remotion code. I only chain the
  other roles.
- I do not invent new templates on the fly — if the user wants a new
  format, run `extract-template` on an existing successful project first,
  or run a single-video pipeline end-to-end to produce that success.
- I do not bypass per-project logging. Every project that a batch produces
  logs to its own `generations.jsonl` / `user-prompts.jsonl`.

## Handoff

- Into a pipeline I delegate, in order:
  `/ralph-researcher` → `/ralph-scenarist` → `/ralph-art-director` →
  `/ralph-editor`. Each of those decides internal sub-tasks.
- If setup or tooling is broken (missing key, missing dep, dashboard not
  up) → hand to **`/ralph-core`**.
- For Remotion-specific questions → **`/remotion-best-practices`**
  (via the editor).
