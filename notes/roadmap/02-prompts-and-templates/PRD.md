# 02 — Prompts & Templates — PRD

## Problem

Ralphy's quality ceiling is the prompt cookbook. Today's surface:

- **Image cookbook**: 9 production-grade modes in `docs/prompts/image/` (product-shot, lifestyle-scene, closeup-with-person, etc.). Solid floor.
- **Video cookbook**: empty. Per-scene video prompts are improvised by the art-director agent on every gen, using the user's brief + the scenario. There's no model-specific scaffolding.
- **Voice cookbook**: empty. The art-director passes raw VO text to ElevenLabs and hopes for the best.
- **Music cookbook**: empty. Same.
- **Templates**: 42 templates in 5 categories — 38 `vibe-style` (prompt cookbooks) + 5 `vibe-reference` (full-stack reproduction kits). Good library but with three drift problems documented in `docs/template-audit-2026-05-11.md`.

Three concrete gaps:

1. **No prompt library organized by *goal / situation*.** What the agent actually reaches for in practice is "I need a hook for a B2B SaaS short — what does a great one look like?", "I need a 5-second product reveal — what's the prompt skeleton?", "I need a transition between scenes 2 and 3 — what works?". The agent should be able to read **ideal worked examples for each situation** and copy patterns. Today the cookbook is organized by media kind (image / video / voice / music) and within image by mode (product-shot / lifestyle-scene / etc.). That's a start, but the missing axis is *situation/goal* — which is the axis the art-director actually thinks in. This is now the primary axis; per-model formula is a secondary adaptation layer underneath.
2. **No structured scene primitive.** Argil's `moments[]` (transcript + avatarId + voiceId + gestureSlug + b-roll) and HeyGen's `template + variables[]` show the dominant industry pattern: scene = struct, not prose. Our `prompts.json` exists but is loosely typed; gestures, b-roll strategy, camera direction are inconsistent.
3. **Reference grammar is one-slot.** Midjourney v7 has `--cref` (character) / `--sref` (style) / `--oref` (subject), and Runway Gen-4 separates `subjectReference[]` from `styleReference[]`. Our `--ref` is a single flat list; the model doesn't know which to lock identity to vs which to mimic the look of.

Underneath the goal-organized library sits a model adaptation layer — Kling wants `Scene → Character → Shot → Motion → [Speaker, tone]: "Dialogue" → Progression`; Veo wants `Shot framing → Style → Lighting → Character → Location → Action → Dialogue`; Luma wants `Subject → Action → Details → Scene → Style → Camera → Reinforcer`; Runway Gen-4 wants `subjectReference[] + styleReference[] + temporalConsistency`. These per-model formulas matter, but they're **shapers**, not the primary cookbook axis ([sources: blog.fal.ai/kling-3-0-prompting-guide, deepmind.google/models/veo/prompt-guide, lumalabs.ai/learning-hub, help.runwayml.com Gen-4 guide]).

Templates have their own three problems:

4. **Template metadata is uneven.** Some templates have `composition.md` + reference example; some have a prompt cookbook; some are barely a stub. No `template.yaml` declaring required inputs (brand, persona, ref-count, voice-style) à la Replicate Cog.
5. **Discovery is internal-only.** `docs/templates-index.md` and `templates/CATEGORIES.md` work for grepping; the landing has no template gallery. ComfyUI's `comfy.org/templates` is the bar.
6. **Naming hides the value prop.** `talking-head-rant` is descriptive but generic. Submagic / Arcads found that named-creator archetypes ("Hormozi-style", "MrBeast-cold-open") read better and convert better. Some of our templates could rename.

## Users

| User | Need |
|---|---|
| **Art-director agent** | A model-specific prompt formula per call (image / video / VO / music). Auto-injection of bracketed dialogue for Kling, reinforcers for Luma. |
| **Scenarist agent** | A structured scene type with gesture, camera, b-roll fields — not free prose. |
| **Template author** | A `template.yaml` schema that declares required inputs and gets validated at install. |
| **Human end-user** | A browsable template gallery on the landing. One verb (`ralphy template try <slug>`) to demo one end-to-end. |
| **Producer agent** | A typed `hook | body | cta` script schema, so batch A/B variants are cheap (swap hooks, keep body). |

## User stories

1. As the **art-director**, I call `ralphy generate video --model kling-v3.0-pro --prompt "<my prose>"`. The provider layer reshapes my prose into Kling's formula (Scene → Character → Shot → Motion → bracketed dialogue → Progression) without my prompting code knowing the formula.
2. As the **art-director**, I pass `--cref <character.png> --sref <style.png> --pref <product.png>`. The provider knows that `--cref` locks identity and `--sref` locks look; both are passed as `subjectReference[]` / `styleReference[]` to Runway, and as ref-image inputs to other models with documented per-model semantics.
3. As the **scenarist**, my output `scenario.json` has `scenes[]` where each scene is `{ id, hook|body|cta, vo_text, camera, gesture?, broll?, target_duration_s }` — no prose blob.
4. As a **template author**, I write `template.yaml` declaring `{ kind, requires: { brand, persona, refs: { character: 1, style?: 1 } }, scenes: [...] }`. Running `ralphy template use <slug>` validates inputs before scaffolding.
5. As a **landing visitor**, I see a templates gallery, click "Hormozi-talking-head", see the storyboard + one rendered example + the exact `ralphy template use hormozi-talking-head` command to try it.
6. As a **producer agent**, I run `ralphy batch --vary hook --variants 5 --keep body,cta` and get 5 mp4s with different hooks, same body, same CTA — for A/B testing.
7. As a **first-time user**, I type `ralphy template try ai-vegetables --topic "<X>"` and have a finished mp4 in 8 min using sample assets, paying < $2.

## Success metrics

| Metric | Target at v1.0 | How we measure |
|---|---|---|
| Cookbook coverage | image (current) + video + VO + music — 4/4 with ≥ 5 modes each | File count in `docs/prompts/{image,video,voice,music}/` |
| Per-model prompt formula implemented | All v1.0 models in `MODELS.md` | Code: per-model adapter in `cli/lib/providers/media.ts` |
| Reference grammar | `--cref / --sref / --pref` adopted, single `--ref` deprecated with passthrough | CLI surface |
| Templates with `template.yaml` | 100% of `templates/` | Schema lint |
| Templates with end-to-end render in CI | TOP-5 from `templates/TOP.md` | Cross-link `11.02` |
| Landing template gallery | Live, clickable, runnable | Manual |
| Renamed templates with creator-archetype labels (where applicable) | ≥ 10 in `templates/TOP.md` | Naming audit |
| Scenario `scenes[]` typed (no prose blobs) | 100% of new scenarios | Schema validation |

## Non-goals

- **A prompt marketplace.** We don't build hosting / monetization. The community can fork.
- **A visual workflow editor (ComfyUI-style nodes).** Templates are markdown + YAML, not graphs.
- **Auto-translation of cookbooks.** English-only for v1.0; the cookbook is in English; the prompt is in whatever language the user writes.
- **A "perfect" virality prompt.** Quality lives in [`08`](../08-quality-and-evaluation/). This category provides structure; that one provides gates.
- **Provider-specific SDKs.** All providers route through `cli/lib/providers/`; the cookbook lives on top, not in.

## v1.0 cut

**Must ship:**

- `02.0L` — **Prompt library by goal/situation** (primary axis — ideal worked examples per situation)
- `02.01` — Per-model prompt adapter (Kling, Veo, Luma, Pika, Runway, Sora — formulas applied automatically as a shaping layer below the library)
- `02.02` — Three-slot reference grammar (`--cref`, `--sref`, `--pref`)
- `02.03` — Video / Voice / Music cookbooks (≥ 5 modes each, cross-cutting with the library)
- `02.04` — Structured `scenes[]` schema in `scenario.json`
- `02.05` — `template.yaml` schema + validation at `template use`
- `02.06` — TOP-5 templates with creator-archetype rename + composition.md + reference render
- `02.07` — Template gallery on landing (read-only, gen-from-CLI)
- `02.08` — `hook | body | cta` typed script primitive

**Post-launch:**

- `02.09` — Template export / import (portable bundle)
- `02.10` — Multi-language cookbook
- `02.11` — Visual template authoring assist
