# Skills vs. templates — the two-concept model

> Source of truth for how Ralphy distinguishes a **template** from a **skill**, and which one the agent reaches for on a given request. `AGENTS.md` invariant #10 points here. Read this before routing any "make a video" request and before recommending a template or a skill.

The model has two clean concepts with two different jobs. **Templates are the unit of reusable content know-how; skills are technical / operational capabilities and craft overlays.** When a user describes the *kind of content* they want, the agent matches it to the **template library**. Skills exist for the operations around that work (research, evaluation, install, postmortem, dev tooling) and for the HyperFrames render engine.

## Template — the universal unit of reusable content

A **template** captures "how to make a piece of content," organized by media **format**. The format is the primary axis: `video`, `image`, `carousel`, `fb-creative`, `motion-design`, `poster`, `sticker-pack`, and so on (the `--format` taxonomy is enumerated by `ralphy template suggest --help`; landed in issue 052 — "everything is a template").

- Inside each format, a **general** template is the format's baseline how-to (the beat structure, framing vocabulary, model stack, common failure modes for that format). A **style** template specializes a general one (`style_of: <general-slug>`) with one concrete aesthetic or one reproducible video.
- **This is what the agent matches to a content brief.** "Make an unboxing video," "make a poster for X," "make a 5-slide carousel," "make a set of FB ads" all resolve to a format (and, when the user points at a specific made video, to one style template under that format).
- Templates work two ways:
  - **Generalized (general + most style templates).** Reusable across any subject in the format. The template supplies the know-how; the user supplies the subject.
  - **Reproduction (a style template that froze one concrete video).** A user who saw a specific video and wants their own version with one or two swaps. Trigger is explicit and user-initiated: `@template:<slug>`, "remix this one," "make the exact same video but…," or names a slug.

Templates live in the **public content library** (a static `library.json` owned by [`ralphy-web`](https://github.com/alecs5am/ralphy-web), served on Bunny CDN, and read by `cli/lib/library/client.ts`) and in `.ralphy/workspaces/<ws>/templates/<slug>/` (user-local, the active workspace tier). The repo-public `templates/<category>/<slug>/` folder was retired in #084. Slugs resolve via `ralphy template list / show / suggest / use` across both tiers; filter by format with `ralphy template list --format <f>` and `ralphy template suggest "<brief>" --format <f>`. Two `kind`s ship: `vibe-reference` (full production) and `vibe-style` (prompt cookbook).

## Skill — technical / operational capability or craft overlay

A **skill** is a technical or operational capability, not the content-routing default. Skills are referenced in Ralphy's system prompt (`AGENTS.md`) for technical use. They fall into a few groups:

- **Operational workflows** — `researcher`, `evaluator`, `install`, `postmortem`, `templater`. Each has a deterministic input → output contract and a backing `ralphy` verb.
  - **`templater` = extract + classify (+ blueprint + de-dup), not push.** It reads a finished project's `units/*/unit.json` and decomposes the project into the five content entities — Unit + Template / Style / Recipe / Asset blocks. It applies the **recipe-vs-tag split (#082/#083)**: a candidate is a Recipe block ONLY if it carries an extractable artifact; otherwise it is a Unit tag. It matches each candidate against existing library blocks first and proposes new blocks only for genuine gaps. Its output is the classified entity bundle plus a per-unit Blueprint and the ordered publish runbook; it does **not** push to the library. Full rule: [`.agents/skills/templater/references/recipe-vs-tag.md`](../.agents/skills/templater/references/recipe-vs-tag.md).
  - **The #056 publisher in `ralphy-web` = the library writer.** The sibling repository's `scripts/publish-entity.ts` takes templater's classified entities and publishes Units, Blocks, and Blueprints to the committed library plus Bunny CDN. The maintainer one-shot is `dev-publish-template`.
  - **`ralphy unit` = how a project forms Units.** It copies curated `artifacts/` picks into `<project>/units/<slug>/` + `unit.json` with provenance attached (#069). This is the project-side mirror of the library Unit; templater reads it, publish pushes it. Unit formation is **phase 17** of the canonical [Unit lifecycle](playbooks/unit-lifecycle.md) — only form/publish a Unit whose render passed the native-video final gate (`ralphy project status <id> --contract` → `polished === true`, #411).
- **Maintainer / dev tooling** — `dev-issues`, `dev-loop`, `dev-publish-template`, `dev-release`, `dev-tasks`, `normalize-skills` (`namespace: maintainer`).
- **Render engine** — the HyperFrames skills (`hyperframes`, `hyperframes-cli`, `gsap`, `lottie`, `three`, `typegpu`, `waapi`, `tailwind`, `website-to-hyperframes`, …).
- **Craft overlays (content-niche, pending templatization).** The `ugc-*`, `poster`, `carousel`, `fb-creatives`, `analog-horror-psa`, `audio-explainer` skills still carry real craft text. They are being converted to format-organized templates in issue 058. Until then they remain as **supplementary craft overlays** — loaded on top of a template match to enrich a brief, not as the primary content route.

Skills live under `.agents/skills/<slug>/` (Claude Code slash commands). Slugs carry **no `ralphy-` prefix**; audience is marked by the `namespace` frontmatter field (`user` default, `maintainer` for maintainer-only workflows).

## The reproduction trio: Template (generic) → Unit → Blueprint (specific)

Three entities form one spine, from "how to make this *kind* of content" down to "how to reproduce *this exact* one." Read them as a chain, not as competitors:

- **Template (generic)** — a published library template (or `.ralphy/workspaces/<ws>/templates/<slug>/`): a prompt-cookbook + `{{slots}}` + the common model stack + common assets + a composition skeleton. It answers **"how do I make THIS KIND of content?"** It is the learn / discover / scaffold-from entity. `ralphy template show <slug>` surfaces its cookbook; `ralphy template use <slug> --project <id>` scaffolds a fresh project from it. This is the entity issue #075 formalizes as "Template."
- **Unit** — one finished deliverable in a Format (the #063 / #069 entity). A Unit is made *in the manner of* a Template but is a concrete, shipped piece.
- **Blueprint (specific, #074)** — the per-unit, reproduction-grade recipe for ONE Unit: verbatim prompts, scene table, composition skeleton + timing, hard asset files, model stack with params + cost, concrete ffmpeg/encode/overlay recipes. It answers **"how do I reproduce THIS EXACT one?"**

**Cardinality (the load-bearing line):**

- **Template (generic) 1 → N Units.** One Template fans out to many Units, each made in that content-type's manner.
- **Unit 1 → 1 Blueprint.** Each Unit has exactly one reproduction recipe (`Blueprint.unitId` = `Unit.id`).
- Therefore **Template 1 → N Blueprints** transitively (one per Unit it spawned), but a Template is never itself a reproduction recipe — it is the generalized cookbook, the Blueprint is the exact-copy recipe.

**What each carries:**

| Entity | Carries | Answers | Surface |
|---|---|---|---|
| Template (generic) | Prompt-cookbook, `{{slots}}`, common model stack, common assets, composition skeleton, craft rules + anti-patterns | "How do I make this *kind*?" | `templates/<cat>/<slug>/`; `ralphy template show / use` |
| Unit | The finished media + its provenance (1 Template + 1 Style + N Recipes + M Assets) | "What did this project ship?" | `units/<slug>/unit.json` (#069); library feed |
| Blueprint | Verbatim prompts, scene table, composition + timing, hard asset files, model stack + params + cost, raw recipes | "How do I reproduce *this exact* one?" | `Blueprint` type (#074); `ralphy blueprint` (#076) |

### Disambiguating the three-way "Template" overload

The word "Template" is used for three distinct things; keep them separate:

1. **Template ENTITY (generic)** — the repo cookbook artifact described above. The discover / scaffold-from entity. **This is what #075 formalizes.**
2. **Template BLOCK-KIND** — one of the #063 metadata blocks (`Block` with `kind: "template"` in the companion `ralphy-web` model): the per-unit, style-agnostic structure tag in a Unit's provenance. It points back at the generic Template's skeleton and is not replaced by the Blueprint.
3. **Blueprint (specific, #074)** — the per-unit reproduction recipe, above.

The resolution in one line: **Template (generic) answers "how to make this kind"; the Template block-kind labels one Unit's structure within its provenance; Blueprint answers "how to reproduce this exact one."** The generic Template and the Template block-kind are consistent (the block-kind names the structure the generic Template generalizes); the Blueprint layers the full reproduction payload on top of all four block-kinds without replacing any of them.

## Blueprint (per-unit reproduction recipe) vs the 4 blocks

A **Blueprint** (#074) is the per-unit, reproduction-grade recipe — the verbatim prompts, the scene table, the composition skeleton + timing, the hard asset files, the model stack with params + cost, and the concrete ffmpeg/encode/overlay recipes. Settled decisions:

- **Blueprint LAYERS on top of the four block kinds — it does NOT replace them.** Blocks (Template / Style / Recipe / Asset) stay the generic discovery vocabulary; a Blueprint references the unit's blocks (via the unit's provenance) and adds the full reproduction payload on top. Layering is the least-disruptive choice (107 blocks already live).
- **Cardinality: Unit 1→1 Blueprint; Template 1→N Units.** A Blueprint belongs to exactly one Unit (carries `unitId` = `Unit.id`); a Template generalizes across many Units (the generic side, expanded in #075 and in "The reproduction trio" above).
- The canonical web type lives in [`ralphy-web`](https://github.com/alecs5am/ralphy-web) with a CLI Zod mirror at [`cli/lib/schemas/blueprint.ts`](../cli/lib/schemas/blueprint.ts). The `ralphy blueprint` verb is #076.

## Contrast

| | Template | Skill |
|---|---|---|
| Job | Reusable content know-how, organized by format | Technical / operational capability or craft overlay |
| Answers | "How do I make this *kind* of content?" / "How do I reproduce *this* one?" | "How do I research / evaluate / install / render / publish?" |
| Content routing | **Primary** — the agent matches a brief to a format | Supplementary — overlay on a template match, or a non-content operation |
| Who initiates | Agent matches it to the brief (or user points at a specific style to remix) | Agent invokes it for the operation; user can slash-invoke |
| Lives in | public library (`library.json` on Bunny CDN) + `.ralphy/workspaces/<ws>/templates/<slug>/` | `.agents/skills/<slug>/` |
| Discovery | `ralphy template list / show / suggest / use` | Claude Code slash commands |

## Decision tree (every "make a video / image / content" request)

1. **Does the user explicitly point at a specific made video / image to clone?** (`@template:<slug>`, "remix this," "make the exact same one but swap X," names a slug.) → **Remix path.** Load that style template, run intake only to fill the swap, reproduce.
2. **Otherwise → match the brief to a format in the template library.** Identify the media format (video / poster / carousel / fb-creative / motion-design / …) and reach for the matching general (and style) template. Use `ralphy template suggest "<brief>" --format <f>` to surface candidates. If a content-niche **craft-overlay skill** covers the brief (e.g. `ugc-unboxing`, `poster`), load it as a supplementary overlay on top of the template match. If nothing matches → freeform via the scenarist.

## The remix flow (prompt-only, no new CLI verb)

Remix is a usage pattern, not a feature with its own command:

1. The user tags a template and states the swap: "remix `<slug>`, but replace the narrator with my brand mascot."
2. The agent loads the template (`ralphy template use <slug> --project <id> --brief "<swap>"`), keeps everything else from the source, and runs intake only on the deltas the swap introduces (e.g. the new entity may trip the reference-required gate).
3. **Frame-study the source BEFORE drafting any prompt.** Fetch the source mp4 with `ralphy ref pull <url-or-slug>`, then slice it at 0.1-0.2s through key beats via `ralphy ref frames <slug> --fps 5-10`. READ the resulting JPEGs to lock (a) realism register, (b) character eye/mouth/motion design, (c) cut pacing. Record the locked register as a project `guideline:` before generating. Frame-study costs ~$0 and ~2 min; skipping it costs $0.50-$3 per regen wave when the first prompt misses the register. See issue 017 for the realism-register axis, issue 047 for HyperFrames composition edge-cases, and intake.md's "Remix path" for the full step list.
4. Generation proceeds through the normal pipeline. The output is a near-copy of the source with the requested element swapped.

## Why the split matters

- The content unit is the **template, organized by format** — it scales across subjects and reproduces specific videos through the same surface. Steering a generic brief into a single hand-picked "closest" recipe was the old failure mode; the format library replaces it.
- Skills stay lean and technical: the operations around content (research, eval, install, postmortem, publish) plus the render engine. Encoding content niches as skills did not pan out — those become format templates (issue 058).
- The landing reflects this: the skills page is the technical / craft skill marketplace; the library is the format-organized collection of reusable + remixable content.

## See also

- [Library](https://www.alecs5am.com/library) / `ralphy template suggest --help` — the media-format map (primary template axis).
- [`docs/skills-format.md`](skills-format.md) — how to author a SKILL.md.
- [`AGENTS.md`](../AGENTS.md) — invariant #10 + the routing table.
- [`docs/playbooks/intake.md`](playbooks/intake.md) — the cold-start template match.
- [`notes/issues/deprecated/058-backfill-templates-from-recent-projects.md`](../notes/issues/deprecated/058-backfill-templates-from-recent-projects.md) — content-niche skill → template conversion (deprecated).
- [`ralphy-web`](https://github.com/alecs5am/ralphy-web) — canonical public-library types, data, publisher, and UI.
- [`cli/lib/schemas/unit.ts`](../cli/lib/schemas/unit.ts) + `ralphy unit` — how a project or workspace forms Units (#069). templater extracts/classifies these entities; the web publisher pushes them.
