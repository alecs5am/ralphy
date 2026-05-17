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

### 02.0L.01 Library structure  [ ]
**v1.0:** yes

**Acceptance criteria:**
- `docs/prompts/library/<situation>/<entry>.md` is the structure. Examples of `<situation>`: `hook-saas-3s`, `product-reveal-5s`, `selfie-rant-confession`, `before-after-physical-transform`, `text-on-screen-payoff`, `chart-animate-in-data`, `lower-third-credit-card`, `transition-jump-cut-stinger`, `outro-loop-back`, `vo-deadpan-irony`, `vo-hype-build`, `music-tension-uptempo`, `music-deadpan-bg`, `caption-pop-each-word`, `caption-block-2-words`, etc.
- Each entry has frontmatter: `goal` (one sentence), `applies_to` (kinds: image / video / vo / music / caption / transition / motion-graphic), `tags`, `models_known_good`, `models_known_bad`, `references[]` (URLs the situation was abstracted from).
- Body: 3 worked examples — `## Bad`, `## OK`, `## Ideal` — each a complete prompt + a paragraph explaining why.

### 02.0L.02 Library entries cover the v1.0 surface  [ ]
**v1.0:** yes

**Acceptance criteria:**
- At least 5 entries per situation family: hooks, scene-bodies, payoffs/CTAs, transitions, VO styles, music styles, caption styles, motion graphics.
- Total at v1.0: ≥ 50 library entries.
- Each TOP-5 template references library entries by slug.

### 02.0L.03 Agent reads library before generating  [ ]
**v1.0:** yes

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

### 02.01.01 Adapter module `cli/lib/providers/prompt-adapter/`  [ ]
**v1.0:** yes

**Acceptance criteria:**
- One file per model family: `kling.ts`, `veo.ts`, `luma.ts`, `pika.ts`, `runway.ts`, `sora.ts`, `openai-image.ts`, `gemini-image.ts`.
- Each exports `shape(promptInput: NormalizedPrompt): ProviderRequest`.
- `NormalizedPrompt` is our internal shape: `{ subject, action, setting, camera, lighting, style, dialogue?, motion?, refs?, duration_s? }`.
- `ProviderRequest` is what the provider's media.ts call expects.
- Pure functions; unit-tested with 5+ examples per model.

### 02.01.02 Kling adapter injects bracketed dialogue  [ ]
**v1.0:** yes

**Acceptance criteria:**
- When the model is `kwaivgi/kling-v3.0-pro` / `-std` / `-o1` and `dialogue` is set, the adapter formats as `[<Speaker>, <tone>]: "<line>"`.
- Tone defaults to `neutral` if persona doesn't specify.
- Output assembled in Kling's `Scene → Character → Shot → Motion → Dialogue → Progression` order.
- Documented in `docs/prompts/video/kling.md`.

### 02.01.03 Luma adapter appends reinforcer  [ ]
**v1.0:** yes

**Acceptance criteria:**
- When the model is `luma/ray-*`, the adapter appends a trailing reinforcer sentence that repeats the most important visual element.
- Reinforcer source: `NormalizedPrompt.subject` + first noun in `style`.
- Documented in `docs/prompts/video/luma.md`.

### 02.01.04 Veo adapter applies its 7-part skeleton  [ ]
**v1.0:** yes

**Acceptance criteria:**
- Order: `Shot framing & motion → Style → Lighting → Character → Location → Action → Dialogue`.
- Documented in `docs/prompts/video/veo.md`.

### 02.01.05 Runway / Pika / Sora adapters  [ ]
**v1.0:** yes

**Acceptance criteria:**
- Runway Gen-4: split into `subjectReference[] + styleReference[] + motion prose`; respect `temporalConsistency` flag.
- Pika: `subject + action + setting + style + camera`.
- Sora: short, physics-rich nouns; camera-as-perspective syntax ("bodycam perspective").
- Each documented in `docs/prompts/video/<model>.md`.

### 02.01.06 Image adapters (OpenAI gpt-5.4-image-2, Gemini nano-banana)  [~]
**v1.0:** yes

**Acceptance criteria:**
- Image adapter merges 9-mode cookbook (already in `docs/prompts/image/`) into the `NormalizedPrompt` flow.
- Multi-ref vs single-ref behavior matches `MODELS.md` (Gemini wins on multi-ref consistency).

---

## 02.02 Reference grammar (cref / sref / pref)

A three-slot ref grammar replaces flat `--ref`.

### 02.02.01 CLI flags `--cref`, `--sref`, `--pref`  [ ]
**v1.0:** yes

**Acceptance criteria:**
- `ralphy generate {image|video} --cref <character.png> --sref <style.png> --pref <product.png>`.
- All three accept URL / local path / data-URI.
- Each can be repeated (`--cref a.png --cref b.png` for multi-ref consistency).
- Legacy `--ref` is a passthrough — it still works but logs a deprecation hint and is documented as "use cref/sref/pref".

### 02.02.02 Provider layer routes refs to the right model slot  [ ]
**v1.0:** yes

**Acceptance criteria:**
- Runway: `--cref → subjectReference[]`, `--sref → styleReference[]`, `--pref → subjectReference[]` with `kind: product`.
- Gemini image: all merged into multi-ref input; order matters → cref first.
- Kling: first-frame / last-frame are still anchored via `--first-frame` / `--last-frame` (separate flags); cref/sref are hints inside the prompt formula.
- OpenAI image: refs appended to message in the multimodal call.
- Each routing rule documented in `docs/prompts/refs.md`.

### 02.02.03 "Super-original" master shots auto-passed  [ ]
**v1.0:** yes

**Acceptance criteria:**
- Project-level master shots (`master/character.png`, `master/style.png`, `master/product.png`) auto-populate cref/sref/pref on every gen unless explicitly overridden.
- Implements the [`feedback_super_original_refs`](../../.claude/projects/-Users-maximovchinnikov-github-ugc-cli/memory/feedback_super_original_refs.md) memory.

---

## 02.03 Cookbook expansion

Match the image cookbook's depth for the other three media kinds.

### 02.03.01 Video cookbook with ≥ 5 modes per model family  [ ]
**v1.0:** yes

**Acceptance criteria:**
- `docs/prompts/video/{kling,veo,luma,pika,runway,sora}.md` exists.
- Each file has ≥ 5 mode blocks (e.g., for Kling: selfie-talking-head, POV-walking, hyper-motion, hand-product-reveal, jump-cut-meme).
- Each mode has: ideal use case, formula example, "do not" pitfalls, sample prompts.

### 02.03.02 Voice cookbook  [ ]
**v1.0:** yes

**Acceptance criteria:**
- `docs/prompts/voice/` with modes: deadpan-rant, hype-hook, intimate-reveal, sarcastic-aside, calm-narration.
- ElevenLabs voice_settings (stability, similarity_boost, style) tuned per mode.
- Each mode has a 3-sentence sample VO + ElevenLabs param table.

### 02.03.03 Music cookbook  [ ]
**v1.0:** yes

**Acceptance criteria:**
- `docs/prompts/music/` with modes: tension-build, deadpan-bg, drop-and-cut, lofi-narrative, hyper-pop.
- ElevenLabs Music prompt skeleton + 5 example prompts per mode.

### 02.03.04 Cookbook is exported as agent-readable JSON  [ ]
**v1.0:** stretch

**Acceptance criteria:**
- `ralphy prompts modes --kind video --model kling` returns the cookbook entries as JSON.
- Agent can list modes and pick one without reading markdown.

---

## 02.04 Structured `scenes[]` in scenario.json

Scene as a struct, not prose. Borrowed from Argil's moments[].

### 02.04.01 Scenario schema  [ ]
**v1.0:** yes

**Acceptance criteria:**
- `scenario.json` schema: `{ project_id, brand_slug, persona_slug, target_duration_s, hook: SceneRef, body: SceneRef[], cta: SceneRef, scenes: { [id]: Scene } }`.
- `Scene` = `{ id, role: "hook"|"body"|"cta", vo_text, target_duration_s, camera, lighting?, gesture?, broll?, refs: { cref?, sref?, pref? } }`.
- Zod schema in `cli/lib/schemas/scenario.ts`; validated by `ralphy project validate`.

### 02.04.02 Scenarist playbook emits the new shape  [ ]
**v1.0:** yes

**Acceptance criteria:**
- `docs/playbooks/scenarist.md` updated with the schema as the output contract.
- Existing scenarios are migrated by `ralphy project migrate-scenario` (one-off verb, deprecates post-v1.0).

### 02.04.03 Gesture vocabulary committed  [ ]
**v1.0:** yes

**Acceptance criteria:**
- `cli/lib/schemas/gestures.ts` exports an enum: `["point", "nod", "laugh", "shrug", "lean-in", "hand-product-reveal", "eye-roll", "facepalm", "thumbs-up", "head-shake"]`.
- Scene `gesture` field constrained to this enum.
- Per-model adapter translates the gesture into the model's natural language ("a slow lean-in toward the camera" for Veo, "[Speaker, leaning in]:" for Kling).

---

## 02.05 `template.yaml` schema

Templates declare their requirements; `template use` validates before running.

### 02.05.01 `template.yaml` schema  [ ]
**v1.0:** yes

**Acceptance criteria:**
- Schema: `{ id, kind: "vibe-reference"|"vibe-style", category, requires: { brand?, persona?, refs?: { character?: int, style?: int, product?: int }, music_style?, voice_style? }, scenes: SceneTemplate[], estimated_cost_usd, estimated_duration_s, references: string[] }`.
- Zod schema in `cli/lib/schemas/template.ts`.

### 02.05.02 `ralphy template use <slug>` validates before scaffolding  [ ]
**v1.0:** yes

**Acceptance criteria:**
- Missing required input → error `E_TEMPLATE_INPUT_MISSING` with hint "supply via `--brand <slug>` or `ralphy brand create`".
- Documented in `docs/cli-spec.md`.

### 02.05.03 `ralphy template suggest "<utterance>"` matches by `requires` + `category`  [~]
**v1.0:** yes

**Acceptance criteria:**
- Today it does keyword rank; extend to also boost templates whose `requires` matches the project's existing brand/persona/refs.

### 02.05.04 Migration: every template in `templates/` has a `template.yaml`  [ ]
**v1.0:** yes

**Acceptance criteria:**
- One-time pass: 42 templates each get a hand-curated `template.yaml`.
- CI grep: every dir under `templates/<category>/` has a `template.yaml`.

---

## 02.06 TOP-5 template hardening

The five templates that gate v1.0 (per `templates/TOP.md`) need to be impeccable.

### 02.06.01 Each TOP-5 template has composition.md + reference example + tests  [ ]
**v1.0:** yes

**Acceptance criteria:**
- `composition.md` exists, current, and matches the actual scenes.
- A reference rendered mp4 exists at `templates/<cat>/<slug>/reference.mp4` (with cached cheap-resolution version).
- Golden render test wired in `11.02`.

### 02.06.02 Naming audit — creator-archetype where applicable  [ ]
**v1.0:** yes

**Acceptance criteria:**
- `templates/TOP.md` includes the rename map: e.g., `talking-head-rant → hormozi-talking-head` (if the archetype fits), `before-after → mr-beast-cold-open` (if it fits), etc.
- Old slugs are preserved as aliases (a `aliases:` field in `template.yaml`).

---

## 02.07 Landing template gallery

The discovery surface for new users.

### 02.07.01 Gallery page on landing  [ ]
**v1.0:** yes

**Acceptance criteria:**
- `landing/app/templates/page.tsx` (new route) lists every template with: name, category, one-line description, estimated cost, "try it" snippet.
- Data comes from `templates/*/template.yaml` at build time.
- Pretty grid, mobile-responsive, matches landing design tokens.

### 02.07.02 Per-template detail page  [ ]
**v1.0:** stretch

**Acceptance criteria:**
- `landing/app/templates/[slug]/page.tsx` shows: composition, reference render embed, `ralphy template use` snippet, link to GitHub source.

---

## 02.08 Hook / Body / CTA primitive

Typed script schema enables cheap A/B batch variation.

### 02.08.01 Schema field in Scene + Scenario  [ ]
**v1.0:** yes

**Acceptance criteria:**
- Scenario top-level: `hook: { scene_id, vo, duration_s }`, `cta: { scene_id, vo, duration_s }`, `body: SceneRef[]`.
- Validated at `ralphy project validate`.

### 02.08.02 `ralphy batch --vary hook --variants N`  [ ]
**v1.0:** yes

**Acceptance criteria:**
- Generates N scenarios that swap only the hook, keep body + CTA constant.
- Each variant renders to a separate project (`<base>-h1`, `<base>-h2`, …).
- Cost preview: `--dry-run` shows hook regen cost only (body assets are reused via symlink / hardlink).

### 02.08.03 `--vary cta` / `--vary persona`  [ ]
**v1.0:** stretch

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
