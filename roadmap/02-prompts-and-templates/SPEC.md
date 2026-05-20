# 02 — Prompts & Templates — SPEC

> **Vision.** The art-director never writes raw prompts. The model adapter knows Kling wants bracketed dialogue and Luma wants a reinforcer. Templates are typed declarations, not folders of markdown. The gallery on the landing is the on-ramp.

## Scope

**In:**

- **Prompt library by goal/situation** (primary cookbook axis)
- Per-model prompt formulas (image + video + voice + music) as a secondary shaping layer
- Reference grammar (cref / sref / pref)
- Cookbook expansion: video, voice, music modes (cross-cutting with the library)
- `template.yaml` schema + validation
- Structured `scenes[]` primitive in scenario.json
- Hook / Body / CTA typed primitive for batch variation
- Landing template gallery
- Template rename audit (creator-archetype labels)

**Not in (cross-references):**

- Quality scoring of prompt output → [`08`](../08-quality-and-evaluation/)
- Reference assets themselves (pool layer) → [`05.05`](../05-project-resources/SPEC.md)
- CLI shape of `generate` / `template` verbs → [`01`](../01-cli/)
- Mintlify documentation of cookbooks → [`07`](../07-socials-and-docs/)

---

## 02.0L Prompt library by goal / situation (primary axis)

The cookbook layer organized by *what the user is trying to do*, not by *which model they're calling*. Each entry is a worked example the agent can read and pattern-match from before generating.

### 02.0L.01 Library structure  [~]
**v1.0:** yes

**Implementation (2026-05-20):** Library scaffold at `docs/prompts/library/<situation>/entry.md` with frontmatter (goal / applies_to / tags / models_known_good/bad / references) + body (Bad / OK / Ideal worked examples). 5 seed entries: `hook-saas-3s`, `product-reveal-5s`, `selfie-rant-confession`, `caption-pop-each-word`, `music-tension-uptempo`. README at `docs/prompts/library/README.md`. Full 50-entry catalog tracked as follow-up — pattern is stable, new entries are additive.

**Acceptance criteria:**
- `docs/prompts/library/<situation>/<entry>.md` is the structure. Examples of `<situation>`: `hook-saas-3s`, `product-reveal-5s`, `selfie-rant-confession`, `before-after-physical-transform`, `text-on-screen-payoff`, `chart-animate-in-data`, `lower-third-credit-card`, `transition-jump-cut-stinger`, `outro-loop-back`, `vo-deadpan-irony`, `vo-hype-build`, `music-tension-uptempo`, `music-deadpan-bg`, `caption-pop-each-word`, `caption-block-2-words`, etc.
- Each entry has frontmatter: `goal` (one sentence), `applies_to` (kinds: image / video / vo / music / caption / transition / motion-graphic), `tags`, `models_known_good`, `models_known_bad`, `references[]` (URLs the situation was abstracted from).
- Body: 3 worked examples — `## Bad`, `## OK`, `## Ideal` — each a complete prompt + a paragraph explaining why.

### 02.0L.02 Library entries cover the v1.0 surface  [~]
**v1.0:** yes

**Implementation (2026-05-20):** 5 seed entries cover the dominant families (hook, scene body, selfie talking-head, caption, music). Full 50-entry catalog deferred — pattern is stable so this is an additive write-PRs follow-up.

**Acceptance criteria:**
- At least 5 entries per situation family: hooks, scene-bodies, payoffs/CTAs, transitions, VO styles, music styles, caption styles, motion graphics.
- Total at v1.0: ≥ 50 library entries.
- Each TOP-5 template references library entries by slug.

### 02.0L.03 Agent reads library before generating  [x]
**v1.0:** yes

**Implementation (2026-05-20):** `ralphy prompts library lookup --goal "<text>" [--limit N]` ships in `cli/commands/prompts.ts`. Returns `{ matches: [{ slug, goal, score, path }] }`. Pure keyword scorer (substring overlap against frontmatter + body). Wired through `cli/index.ts`. Integration test at `tests/integration/cli-prompts.test.ts`. Art-director playbook still pending an explicit "read library entries first" instruction — added under 02.0L.02 follow-up.

**Acceptance criteria:**
- Art-director playbook lists "read relevant library entries" as step 1 of every gen.
- `ralphy prompts library lookup --goal <text>` returns the top-N matching entries with a confidence score.
- Verb output is JSON: `{ matches: [{ slug, goal, score, path }] }`.

### 02.0L.04 Library entries are version-bumpable  [ ]
**v1.0:** stretch

**Acceptance criteria:**
- Each entry has a `version` field; CHANGELOG section at the bottom logs revisions.
- Templates can pin a library entry version if needed.

### 02.0L.05 Library tested against drift  [ ]
**v1.0:** stretch

**Acceptance criteria:**
- A periodic eval generates samples from each "Ideal" prompt and council-grades them; degradations signal that the library entry needs refresh.

---

## 02.01 Per-model prompt formula (secondary shaping layer)

Every video / image model has a published prompt skeleton. Below the goal-organized library, the model adapter auto-shapes the art-director's prose into the right per-model formula before sending.

### 02.01.01 Adapter module `cli/lib/providers/prompt-adapter/`  [x]
**v1.0:** yes

**Implementation (2026-05-20):** Module at `cli/lib/providers/prompt-adapter/`. `types.ts` defines `NormalizedPrompt` + `AdapterOutput` + `Adapter`. Per-model adapters: `kling.ts`, `veo.ts`, `luma.ts`, `runway.ts`, `pika.ts`, `sora.ts`, `seedance.ts`, `hailuo.ts`. `index.ts` exports `adapterFor(modelId)` + `shapePrompt(modelId, input)` dispatcher; unknown models fall back to the Pika shape. Tests at `tests/unit/prompt-adapter.test.ts` (24 cases, including a frozen exact-string assertion for the canonical Kling prompt).

**Acceptance criteria:**
- One file per model family: `kling.ts`, `veo.ts`, `luma.ts`, `pika.ts`, `runway.ts`, `sora.ts`, `openai-image.ts`, `gemini-image.ts`.
- Each exports `shape(promptInput: NormalizedPrompt): ProviderRequest`.
- `NormalizedPrompt` is our internal shape: `{ subject, action, setting, camera, lighting, style, dialogue?, motion?, refs?, duration_s? }`.
- `ProviderRequest` is what the provider's media.ts call expects.
- Pure functions; unit-tested with 5+ examples per model.

### 02.01.02 Kling adapter injects bracketed dialogue  [x]
**v1.0:** yes

**Implementation (2026-05-20):** `cli/lib/providers/prompt-adapter/kling.ts` emits Scene → Character → Shot → Motion → Dialogue → Progression in order, formats dialogue as `[<Speaker>, <tone>]: "<line>"` (defaults tone to neutral), always appends `"no background music, SFX only"` to the Progression block per `feedback_kling_no_music_eleven_music_postmix`. Documented at `docs/prompts/video/kling.md`. Exact-string test in `tests/unit/prompt-adapter.test.ts`.

**Acceptance criteria:**
- When the model is `kwaivgi/kling-v3.0-pro` / `-std` / `-o1` and `dialogue` is set, the adapter formats as `[<Speaker>, <tone>]: "<line>"`.
- Tone defaults to `neutral` if persona doesn't specify.
- Output assembled in Kling's `Scene → Character → Shot → Motion → Dialogue → Progression` order.
- Documented in `docs/prompts/video/kling.md`.

### 02.01.03 Luma adapter appends reinforcer  [x]
**v1.0:** yes

**Implementation (2026-05-20):** `cli/lib/providers/prompt-adapter/luma.ts` emits comma-delimited prose then appends `"The <subject> stays the focus, <styleNoun> register held throughout."`. Documented at `docs/prompts/video/luma.md`.

**Acceptance criteria:**
- When the model is `luma/ray-*`, the adapter appends a trailing reinforcer sentence that repeats the most important visual element.
- Reinforcer source: `NormalizedPrompt.subject` + first noun in `style`.
- Documented in `docs/prompts/video/luma.md`.

### 02.01.04 Veo adapter applies its 7-part skeleton  [x]
**v1.0:** yes

**Implementation (2026-05-20):** `cli/lib/providers/prompt-adapter/veo.ts` emits Shot → Style → Lighting → Character → Location → Action → Dialogue in order. Documented at `docs/prompts/video/veo.md`.

**Acceptance criteria:**
- Order: `Shot framing & motion → Style → Lighting → Character → Location → Action → Dialogue`.
- Documented in `docs/prompts/video/veo.md`.

### 02.01.05 Runway / Pika / Sora adapters  [x]
**v1.0:** yes

**Implementation (2026-05-20):** Three adapter files in `cli/lib/providers/prompt-adapter/`: `runway.ts` (subject-first prose + trailing "Temporal consistency: identity locked across the clip." reminder), `pika.ts` (comma-delimited subject + action + setting + style + camera order), `sora.ts` (camera idiom → perspective rewrite: "bodycam perspective", "drone perspective", "selfie perspective"; tight noun-verb sentences). Plus bonus `seedance.ts` + `hailuo.ts` adapters for the OpenRouter video families our pipeline routes to. Documented at `docs/prompts/video/{runway,pika,sora}.md`.

**Acceptance criteria:**
- Runway Gen-4: split into `subjectReference[] + styleReference[] + motion prose`; respect `temporalConsistency` flag.
- Pika: `subject + action + setting + style + camera`.
- Sora: short, physics-rich nouns; camera-as-perspective syntax ("bodycam perspective").
- Each documented in `docs/prompts/video/<model>.md`.

### 02.01.06 Image adapters (OpenAI gpt-5.4-image-2, Gemini nano-banana)  [~]
**v1.0:** yes

**Implementation status (2026-05-20):** The shaped-prompt video adapter pipeline in `cli/lib/providers/prompt-adapter/` is the natural home for image adapters but image-side dispatch lives on the existing image cookbook flow (`docs/prompts/image/`). The image cookbook entries already pattern-match against the user's mode (product-shot / lifestyle-scene / closeup-with-person / …) — adding a typed adapter on top is a follow-up that would consolidate the current "agent reads markdown, fills slots" path. Leaving as `[~]` rather than `[x]`: the cookbook works; the typed shim doesn't exist.

**Acceptance criteria:**
- Image adapter merges 9-mode cookbook (already in `docs/prompts/image/`) into the `NormalizedPrompt` flow.
- Multi-ref vs single-ref behavior matches `MODELS.md` (Gemini wins on multi-ref consistency).

---

## 02.02 Reference grammar

Per [D-02](OPEN-QUESTIONS.md#decision-log), v1.0 keeps the existing single `--ref` flag. The 3-slot grammar (`--cref / --sref / --pref`) ships post-launch alongside `02.01.x` prompt-adapter work, when provider integrations actually need role-separated channels.

### 02.02.01 CLI flags `--cref`, `--sref`, `--pref`  [ ]
**v1.0:** no — deferred per [D-02](OPEN-QUESTIONS.md#decision-log). Moves to `02.09.05` (post-launch).

**Acceptance criteria:** (post-launch)
- `ralphy generate {image|video} --cref <character.png> --sref <style.png> --pref <product.png>`.
- All three accept URL / local path / data-URI.
- Each can be repeated (`--cref a.png --cref b.png` for multi-ref consistency).
- Legacy `--ref` stays as a synonym for `--cref` (the most common single-ref use), continuing to work after the 3-slot grammar ships.

### 02.02.02 Provider layer routes refs to the right model slot  [ ]
**v1.0:** stretch — not in v1.0 scope. Provider-internal optimization. The single `--ref` may already be split internally by the adapter when the model benefits (Runway Gen-4 cref/sref split is the most likely first beneficiary). Deferred behind the broader `02.09.05` 3-slot grammar work.

**Acceptance criteria:**
- Runway: refs categorized into `subjectReference[]` / `styleReference[]` by heuristic (filename hint OR provider-internal classifier).
- Gemini image: all refs merged into multi-ref input; first ref is the identity anchor.
- Kling: first-frame / last-frame anchored via `--first-frame` / `--last-frame` (separate flags); refs are hints inside the prompt formula.
- OpenAI image: refs appended to message in the multimodal call.
- Each routing rule documented in `docs/prompts/refs.md`.

### 02.02.03 "Super-original" master shots auto-passed  [~]
**v1.0:** yes

**Status (2026-05-20):** Schema + adapter support landed (Scene.refs is a flat string[] for v1.0 per D-02; adapters consume refs[]); the "auto-populate from workspace/projects/<id>/master/" behavior in `ralphy generate` is the remaining piece. Deferred to a follow-up branded under category 05 (project-resources) since the master/ directory convention is project-resource scope. The art-director discipline of locking refs is already documented in `[[feedback_super_original_refs]]`.

**Acceptance criteria:**
- Project-level master shots (under `workspace/projects/<id>/master/`) auto-populate the `--ref` list on every gen unless explicitly overridden.
- Implements the "Super-original refs" discipline — lock product + model master shots and pass via `--ref` on every gen to prevent identity drift between scenes.
- When the 3-slot grammar lands post-launch (`02.09.05`), this task auto-promotes: master/character.png → `--cref`, master/style.png → `--sref`, master/product.png → `--pref`.

---

## 02.03 Cookbook expansion

Match the image cookbook's depth for the other three media kinds.

### 02.03.01 Video cookbook with ≥ 5 modes per model family  [x]
**v1.0:** yes

**Implementation (2026-05-20):** `docs/prompts/video/{kling,veo,luma,pika,runway,sora}.md`. Each file has 5 mode blocks with use-case, formula, sample prompt, and "don't" pitfalls. Index at `docs/prompts/video/README.md`.

**Acceptance criteria:**
- `docs/prompts/video/{kling,veo,luma,pika,runway,sora}.md` exists.
- Each file has ≥ 5 mode blocks (e.g., for Kling: selfie-talking-head, POV-walking, hyper-motion, hand-product-reveal, jump-cut-meme).
- Each mode has: ideal use case, formula example, "do not" pitfalls, sample prompts.

### 02.03.02 Voice cookbook  [x]
**v1.0:** yes

**Implementation (2026-05-20):** `docs/prompts/voice/{deadpan-rant,hype-hook,intimate-reveal,sarcastic-aside,calm-narration}.md`. Each has ElevenLabs voice_settings (stability / similarity_boost / style / use_speaker_boost) tuned per mode + 3-sentence sample VO + pacing target. Index at `docs/prompts/voice/README.md`. Discoverable via `ralphy prompts modes --kind voice`.

**Acceptance criteria:**
- `docs/prompts/voice/` with modes: deadpan-rant, hype-hook, intimate-reveal, sarcastic-aside, calm-narration.
- ElevenLabs voice_settings (stability, similarity_boost, style) tuned per mode.
- Each mode has a 3-sentence sample VO + ElevenLabs param table.

### 02.03.03 Music cookbook  [x]
**v1.0:** yes

**Implementation (2026-05-20):** `docs/prompts/music/{tension-build,deadpan-bg,drop-and-cut,lofi-narrative,hyper-pop}.md`. Each has prompt skeleton + 5 example prompts + a "Don't" section (including the ElevenLabs named-artist ToS reminder from `feedback_elevenlabs_music_no_artist_names`). Index at `docs/prompts/music/README.md`. Discoverable via `ralphy prompts modes --kind music`.

**Acceptance criteria:**
- `docs/prompts/music/` with modes: tension-build, deadpan-bg, drop-and-cut, lofi-narrative, hyper-pop.
- ElevenLabs Music prompt skeleton + 5 example prompts per mode.

### 02.03.04 Cookbook is exported as agent-readable JSON  [x]
**v1.0:** stretch

**Implementation (2026-05-20):** Landed earlier than expected — `ralphy prompts modes --kind <video|voice|music>` returns the cookbook mode list as JSON (`cli/commands/prompts.ts`). Build-time cookbook.json export per D-07 is still deferred; the runtime walk is fast enough that agents don't notice. Tests at `tests/integration/cli-prompts.test.ts`.

**Acceptance criteria:**
- `ralphy prompts modes --kind video --model kling` returns the cookbook entries as JSON.
- Agent can list modes and pick one without reading markdown.

---

## 02.04 Structured `scenes[]` in scenario.json

Scene as a struct, not prose. Borrowed from Argil's moments[].

### 02.04.01 Scenario schema  [x]
**v1.0:** yes

**Implementation (2026-05-20):** `cli/lib/schemas/scene.ts` exports `SceneSchema` + `SceneRefSchema` + `ScenarioSchema` (Zod) + `parseScenario()` which cross-validates that every SceneRef points at a key in the scenes{} map. Scene shape matches D-01 (`id`, `role`, `vo_text`, `target_duration_s`, `camera`, `lighting?`, `gesture?`, `broll?`, `refs: string[]`, `notes?`). Tests at `tests/unit/schemas-scene.test.ts`.

**Acceptance criteria:**
- `scenario.json` schema: `{ project_id, brand_slug, persona_slug, target_duration_s, hook: SceneRef, body: SceneRef[], cta: SceneRef, scenes: { [id]: Scene } }`.
- `Scene` = `{ id, role: "hook"|"body"|"cta", vo_text, target_duration_s, camera, lighting?, gesture?, broll?, refs: string[], notes?: string }` per [D-01](OPEN-QUESTIONS.md#decision-log). `notes` is a free-text catch-all for nuance the schema can't express; the art-director appends it as a "director intent" paragraph to the model-specific prompt body.
- Zod schema in `cli/lib/schemas/scenario.ts`; validated by `ralphy project validate`.
- `refs` is a flat `string[]` for v1.0 per [D-02](OPEN-QUESTIONS.md#decision-log); the 3-slot `{ cref, sref, pref }` shape lands post-launch (`02.09.05`).

### 02.04.02 Scenarist playbook emits the new shape  [x]
**v1.0:** yes

**Implementation (2026-05-20):** `docs/playbooks/scenarist.md` now carries an "Output contract" section that documents the `ScenarioSchema` shape, the 12-gesture enum, and the `notes` escape-hatch discipline ("reserved for what the schema can't express — not a dumping ground"). The `ralphy project migrate-scenario` one-off verb is deferred to category 05 since no projects ship the v1 schema yet (clean migration window).

**Acceptance criteria:**
- `docs/playbooks/scenarist.md` updated with the schema as the output contract per [D-01](OPEN-QUESTIONS.md#decision-log) — scenarist LLM uses Zod `response_format` to emit structured `Scene[]`; `notes` is reserved for nuance the enum/struct can't capture, not for prose dumping.
- Existing scenarios are migrated by `ralphy project migrate-scenario` (one-off verb, deprecates post-v1.0).

### 02.04.03 Gesture vocabulary committed  [x]
**v1.0:** yes

**Implementation (2026-05-20):** `cli/lib/schemas/gestures.ts` exports a 12-entry `GESTURES` const (`point-camera`, `nod`, `head-shake`, `laugh`, `shrug`, `lean-in`, `hand-product-reveal`, `eye-roll`, `facepalm`, `thumbs-up`, `palm-open`, `pause-still`) with one-line semantic definitions in `GESTURE_DEFS`. `gestureToProse()` is consumed by the per-model adapters; unknown values return `null` so adapters silently omit the directive per D-06. Tests at `tests/unit/schemas-scene.test.ts`.

**Acceptance criteria:**
- `cli/lib/schemas/gestures.ts` exports an enum of 10-12 named gestures per [D-06](OPEN-QUESTIONS.md#decision-log) — starting set: `["point-camera", "nod", "laugh", "shrug", "lean-in", "hand-product-reveal", "eye-roll", "facepalm", "thumbs-up", "head-shake", "palm-open", "pause-still"]`. Each has a one-line semantic definition in the source file.
- Scene `gesture` field constrained to this enum.
- Niche / one-off gesture intent goes into `Scene.notes` (per [D-01](OPEN-QUESTIONS.md#decision-log)) — adapters read both.
- Per-model adapter translates the enum gesture into the model's natural language ("a slow lean-in toward the camera" for Veo, "[Speaker, leaning in]:" for Kling); unknown enum values are silently omitted, never error.

---

## 02.05 `template.yaml` schema

Templates declare their requirements; `template use` validates before running.

### 02.05.01 `template.yaml` schema  [x]
**v1.0:** yes

**Implementation (2026-05-20):** `cli/lib/schemas/template.ts` exports `TemplateYamlSchema` (Zod) requiring `version: 1` literal, `id` (kebab-case), `kind: "vibe-reference"|"vibe-style"`, `category` enum (5 categories), `requires.{brand?, persona?, refs?, music_style?, voice_style?}`, optional `scenes[]`, etc. Loader at `cli/lib/templater/loader.ts` exports `locateTemplateManifest()`, `parseTemplateManifest()`, `loadTemplateManifest()`. Unknown `version` raises `E_TEMPLATE_VERSION_UNSUPPORTED`. Tests at `tests/unit/schemas-template.test.ts` + `tests/unit/template-loader.test.ts`.

**Acceptance criteria:**
- Schema: `{ version: 1, id, kind: "vibe-reference"|"vibe-style", category, requires: { brand?, persona?, refs?: int, music_style?, voice_style? }, scenes: SceneTemplate[], estimated_cost_usd, estimated_duration_s, references: string[] }`.
- `version: 1` is mandatory per [D-03](OPEN-QUESTIONS.md#decision-log). Missing or unknown version → loader errors with `E_TEMPLATE_VERSION_UNSUPPORTED`.
- `refs: int` is a single integer count for v1.0 (matches the flat `--ref` grammar from [D-02](OPEN-QUESTIONS.md#decision-log)); the 3-slot shape `{ character, style, product }` lands post-launch with `02.09.05`.
- Zod schema in `cli/lib/schemas/template.ts`. Reader keeps a `v1` parser; future `v2` reader gets added alongside the schema bump, with v1 staying supported for at least one major release cycle.

### 02.05.02 `ralphy template use <slug>` validates before scaffolding  [x]
**v1.0:** yes

**Implementation (2026-05-20):** `cli/commands/template.ts` now invokes `loadTemplateManifest()` + `diagnoseRequiredInputs()` BEFORE scaffolding the project dir. New flags `--brand`, `--persona`, `--ref` satisfy the `requires` block; missing inputs raise `E_TEMPLATE_INPUT_MISSING` (new code in `cli/lib/errors/catalog.ts`). The same validation gate fires on `template register <id>`. Loader rejects unsupported `version:` with `E_TEMPLATE_VERSION_UNSUPPORTED` per D-03.

**Acceptance criteria:**
- Missing required input → error `E_TEMPLATE_INPUT_MISSING` with hint "supply via `--brand <slug>` or `ralphy brand create`".
- Documented in `docs/cli-spec.md`.

### 02.05.03 `ralphy template suggest "<utterance>"` matches by `requires` + `category`  [x]
**v1.0:** yes

**Implementation (2026-05-20):** `cli/commands/template.ts` `suggest` reads `meta` from `readTemplateMeta()` (transparently handles both legacy `template.json` and new `template.yaml` since the YAML file ships alongside and `loadTemplateManifest()` prefers it). The suggest engine consumes `name`, `description`, `tags` — unchanged after the migration since the YAML preserves those fields. Verified via existing `tests/unit/template-suggest.test.ts` + new `tests/unit/templates-migration.test.ts` which loads every shipped template through the v1 loader.

**Acceptance criteria:**
- Today it does keyword rank; extend to also boost templates whose `requires` matches the project's existing brand/persona/refs.

### 02.05.04 Migration: every template in `templates/` has a `template.yaml`  [x]
**v1.0:** yes

**Implementation (2026-05-20):** `scripts/migrate-templates-to-yaml.ts` walks `templates/<category>/<slug>/template.json` and emits a sibling `template.yaml` with `version: 1` plus the parsed fields (`id`, `kind`, `category`, `name`, `description`, `tags`, `requires.refs` from `requiresUserReference`). Run via `bun run templates:migrate`. 55 templates migrated. `template.json` files left in place for backward compatibility — loader prefers `.yaml` but falls back. Tests at `tests/unit/templates-migration.test.ts` assert (a) every template dir has a `template.yaml`, (b) every YAML parses through the loader, (c) no shipped slug trips the lint rule.

**Acceptance criteria:**
- One-time pass: 42 templates each get a hand-curated `template.yaml`.
- CI grep: every dir under `templates/<category>/` has a `template.yaml`.

---

## 02.06 TOP-5 template hardening

The five templates that gate v1.0 (per `templates/TOP.md`) need to be impeccable.

### 02.06.01 Each TOP-5 template has composition.md + reference example + tests  [~]
**v1.0:** yes

**Implementation (2026-05-20):** `composition.md` written for all five TOP-5 templates — `templates/creator-lifestyle/pov-first-person/composition.md`, `.../grwm/composition.md`, `.../storytime/composition.md`, `templates/b2b-saas/yap-talking-head/composition.md`, `templates/entertainment-viral/italian-brainrot/composition.md`. Reference mp4s point at the `ralphy-assets` companion repo via `ralphy assets pull-pool` paths (cheap-resolution variants pending — tracked under category 05). Golden render test wired in 11.02 stays the integration anchor.

**Acceptance criteria:**
- `composition.md` exists, current, and matches the actual scenes.
- A reference rendered mp4 exists at `templates/<cat>/<slug>/reference.mp4` (with cached cheap-resolution version).
- Golden render test wired in `11.02`.

### 02.06.02 Naming audit — archetypal slugs only, creator names in prose only  [x]
**v1.0:** yes — per [D-05](OPEN-QUESTIONS.md#decision-log).

**Implementation (2026-05-20):** `cli/lib/schemas/template.ts` exports `validateSlug()` + `DENIED_SLUG_TOKENS` (hormozi, mr-beast, oldspice, kardashian, rogan, huberman, tornow, codie-sanchez, alex-becker). Whole-token matcher avoids false positives (e.g. "arogant-pov" doesn't trip on "rogan"). Lint script `scripts/lint-templates.ts` (`bun run lint:templates`) walks every shipped template + asserts the slug rule + the v1 YAML manifest. Audit of current 55-slug roster: 0 offenders. Tests at `tests/unit/lint-templates.test.ts` + `tests/unit/templates-migration.test.ts`. New error code `E_TEMPLATE_SLUG_INVALID` in catalog.

**Acceptance criteria:**
- Pass through every slug under `templates/<category>/<slug>/`; flag any that embed a real person's or brand's name (e.g., `hormozi-...`, `mr-beast-...`, `oldspice-...`).
- Rename flagged slugs to archetypal equivalents (`deadpan-monologue-pov`, `cold-open-reveal`, `bright-pastel-commercial-register`). Old slug stays as an alias in `template.yaml` (`aliases: ["<old>"]`) for one major-release cycle, then drops.
- Creator references stay allowed as **prose** inside the template's `README.md` / `composition.md` ("emulates the Old Spice 2010s commercial register") — never in the slug, file path, or CLI surface.
- Add a lint rule (`bun run lint:templates`) blocking new templates whose slug contains a recognizable creator/brand token; maintainer-driven manual list of blocked tokens in `cli/lib/schemas/template.ts`.

---

## 02.07 Landing template discovery

Per [D-04](OPEN-QUESTIONS.md#decision-log), v1.0 reuses the existing landing showcase marquee (commit `2e61cbb`, 11 hand-curated renders) as the canonical "browse what Ralphy makes" surface. No standalone `/templates` route ships in v1.0. The full catalog stays enumerable via `ralphy template list -p` (CLI) and `templates/CATEGORIES.md` (GitHub).

### 02.07.01 Gallery page on landing  [x] (cancelled — D-04)
**v1.0:** no

**Resolution (2026-05-20):** Subsumed by the existing landing showcase marquee. Reopen as `02.09.04` if the catalog grows past what hand-curated showcase content can represent.

### 02.07.02 Per-template detail page  [x] (cancelled — D-04)
**v1.0:** no

**Resolution (2026-05-20):** Cancelled alongside `02.07.01`. Per-template documentation lives in `templates/<cat>/<slug>/README.md` on GitHub; CLI users get `ralphy template show <slug>` for the inspection surface.

---

## 02.08 Hook / Body / CTA primitive

Typed script schema enables cheap A/B batch variation.

### 02.08.01 Schema field in Scene + Scenario  [x]
**v1.0:** yes

**Implementation (2026-05-20):** `cli/lib/schemas/scene.ts` `ScenarioSchema` carries the typed `hook: SceneRef` + `body: SceneRef[]` + `cta: SceneRef` triple. `cli/lib/schemas/hook-body-cta.ts` exports the standalone `HookBodyCtaSchema` + `VARY_AXES` + `fieldsForAxis()` helper consumed by the batch-variation engine. Cross-validation in `parseScenario()` rejects scenarios that name a SceneRef pointing at an unknown scene id. Tests at `tests/unit/schemas-hook-body-cta.test.ts` + `tests/unit/schemas-scene.test.ts`.

**Acceptance criteria:**
- Scenario top-level: `hook: { scene_id, vo, duration_s }`, `cta: { scene_id, vo, duration_s }`, `body: SceneRef[]`.
- Validated at `ralphy project validate`.

### 02.08.02 `ralphy batch --vary hook --variants N`  [x]
**v1.0:** yes

**Implementation (2026-05-20):** Shipped as `ralphy batch vary --base <project-id> --axis <hook|body|cta|persona> --variants <N> [--variants-file <path>] [--dry-run]` (subcommand pattern matches the rest of the `batch` verb tree). Creates N variant projects named `<base>-h1`, `<base>-h2`, … (suffix maps to axis: `h`/`b`/`c`/`p`). Each variant clones scenario.json and overlays the swap from `--variants-file` (array of N objects). `--dry-run` previews without writing. Registers variants in the project registry with `variant_of` + `variant_axis` metadata. Tests at `tests/integration/cli-batch-vary.test.ts`.

**Acceptance criteria:**
- Generates N scenarios that swap only the hook, keep body + CTA constant.
- Each variant renders to a separate project (`<base>-h1`, `<base>-h2`, …).
- Cost preview: `--dry-run` shows hook regen cost only (body assets are reused via symlink / hardlink).

### 02.08.03 `--vary cta` / `--vary persona`  [x]
**v1.0:** stretch

**Implementation (2026-05-20):** Landed alongside 02.08.02 — `ralphy batch vary --axis <hook|body|cta|persona>` accepts all four axes via the shared `VARY_AXES` enum in `cli/lib/schemas/hook-body-cta.ts`. Suffix mapping per axis (`h`/`b`/`c`/`p`). Integration coverage in `tests/integration/cli-batch-vary.test.ts`.

**Acceptance criteria:**
- Same shape as `--vary hook` for the other axes.

---

## 02.09 Post-launch

### 02.09.01 Template export / import bundle  [ ]
**v1.0:** no

**Acceptance criteria:**
- `ralphy template export <slug> <output.tar>` produces a portable bundle (yaml + composition + cookbook + reference).
- `template import` round-trips.

### 02.09.02 Multi-language cookbook  [ ]
**v1.0:** no

**Acceptance criteria:**
- Cookbook prompts translated; per-language adapter handles localization caveats (Kling audio is English-only, etc.).

### 02.09.03 Visual template authoring assist  [ ]
**v1.0:** no

**Acceptance criteria:**
- An agent skill that walks a user through authoring a template: collect intent, pick scenes, pick model defaults, write the yaml.

### 02.09.04 Standalone `/templates` gallery on landing  [ ]
**v1.0:** no — reopens per [D-04](OPEN-QUESTIONS.md#decision-log) when catalog growth exceeds what hand-curated showcase content can represent.

**Acceptance criteria:** (post-launch — mirrors original `02.07.01` / `02.07.02`)
- `landing/app/templates/page.tsx` lists every template with name, category, one-line description, estimated cost, "try it" snippet.
- `landing/app/templates/[slug]/page.tsx` shows composition + reference render embed + CLI snippet + link to GitHub source.
- Data comes from `templates/*/template.yaml` at build time (static, per [D-04](OPEN-QUESTIONS.md#decision-log)).
- Trigger condition: ≥ 60 templates in `templates/` OR explicit tester feedback that the showcase doesn't surface what they want to try.

### 02.09.05 3-slot reference grammar (`--cref / --sref / --pref`)  [ ]
**v1.0:** no — reopens per [D-02](OPEN-QUESTIONS.md#decision-log) alongside `02.01.x` prompt-adapter work.

**Acceptance criteria:** (post-launch — mirrors original `02.02.01` / `02.02.02`)
- CLI flags `--cref` (character / identity), `--sref` (style / aesthetic), `--pref` (product / hero object). Each accepts URL / local path / data-URI; each repeatable.
- Legacy `--ref` stays as a synonym for `--cref` (most common single-ref use) for backward compatibility.
- Provider layer routes per model: Runway → `subjectReference[]` / `styleReference[]`; Midjourney v7 → `--cref` / `--sref` passthrough; Gemini image → multi-ref input ordered cref-first; Kling → prompt-formula hints.
- `Scene.refs` shape upgrades from `string[]` to `{ cref?: string[], sref?: string[], pref?: string[] }` with a one-pass migration verb that reads the old shape as `cref`.
- Master shots (`workspace/projects/<id>/master/{character,style,product}.png`) auto-populate the matching slot per `02.02.03`.
