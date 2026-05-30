# Skills vs. templates — the two-concept model

> Source of truth for how Ralphy distinguishes a **template** from a **skill**, and which one the agent reaches for on a given request. `AGENTS.md` invariant #10 points here. Read this before routing any "make a video" request and before recommending a template or a skill.

The model has two clean concepts with two different jobs. **Templates are the unit of reusable content know-how; skills are technical / operational capabilities and craft overlays.** When a user describes the *kind of content* they want, the agent matches it to the **template library**. Skills exist for the operations around that work (research, evaluation, install, postmortem, dev tooling) and for the HyperFrames render engine.

## Template — the universal unit of reusable content

A **template** captures "how to make a piece of content," organized by media **format**. The format is the primary axis: `video`, `image`, `carousel`, `fb-creative`, `motion-design`, `poster`, `sticker-pack`, and so on (the full map is in [`templates/FORMATS.md`](../templates/FORMATS.md), landed in issue 052 — "everything is a template").

- Inside each format, a **general** template is the format's baseline how-to (the beat structure, framing vocabulary, model stack, common failure modes for that format). A **style** template specializes a general one (`style_of: <general-slug>`) with one concrete aesthetic or one reproducible video.
- **This is what the agent matches to a content brief.** "Make an unboxing video," "make a poster for X," "make a 5-slide carousel," "make a set of FB ads" all resolve to a format (and, when the user points at a specific made video, to one style template under that format).
- Templates work two ways:
  - **Generalized (general + most style templates).** Reusable across any subject in the format. The template supplies the know-how; the user supplies the subject.
  - **Reproduction (a style template that froze one concrete video).** A user who saw a specific video and wants their own version with one or two swaps. Trigger is explicit and user-initiated: `@template:<slug>`, "remix this one," "make the exact same video but…," or names a slug.

Templates live under `templates/<category>/<slug>/` (repo, 5 persona categories) and `workspace/templates/<slug>/` (user-local). Slugs resolve via `ralphy template list / show / suggest / use` regardless of category folder; filter by format with `ralphy template list --format <f>` and `ralphy template suggest "<brief>" --format <f>`. Two `kind`s ship: `vibe-reference` (full production) and `vibe-style` (prompt cookbook).

## Skill — technical / operational capability or craft overlay

A **skill** is a technical or operational capability, not the content-routing default. Skills are referenced in Ralphy's system prompt (`AGENTS.md`) for technical use. They fall into a few groups:

- **Operational workflows** — `researcher`, `evaluator`, `install`, `postmortem`, `templater`. Each has a deterministic input → output contract and a backing `ralphy` verb.
- **Maintainer / dev tooling** — `dev-release`, `dev-tasks` (`namespace: maintainer`).
- **Render engine** — the HyperFrames skills (`hyperframes`, `hyperframes-cli`, `gsap`, `lottie`, `three`, `typegpu`, `waapi`, `tailwind`, `website-to-hyperframes`, …).
- **Craft overlays (content-niche, pending templatization).** The `ugc-*`, `poster`, `carousel`, `fb-creatives`, `analog-horror-psa`, `audio-explainer` skills still carry real craft text. They are being converted to format-organized templates in issue 058. Until then they remain as **supplementary craft overlays** — loaded on top of a template match to enrich a brief, not as the primary content route.

Skills live under `.agents/skills/<slug>/` (Claude Code slash commands). Slugs carry **no `ralphy-` prefix**; audience is marked by the `namespace` frontmatter field (`user` default, `maintainer` for the two `dev-*` skills).

## Contrast

| | Template | Skill |
|---|---|---|
| Job | Reusable content know-how, organized by format | Technical / operational capability or craft overlay |
| Answers | "How do I make this *kind* of content?" / "How do I reproduce *this* one?" | "How do I research / evaluate / install / render / publish?" |
| Content routing | **Primary** — the agent matches a brief to a format | Supplementary — overlay on a template match, or a non-content operation |
| Who initiates | Agent matches it to the brief (or user points at a specific style to remix) | Agent invokes it for the operation; user can slash-invoke |
| Lives in | `templates/<category>/<slug>/` | `.agents/skills/<slug>/` |
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

- [`templates/FORMATS.md`](../templates/FORMATS.md) — the media-format map (primary template axis).
- [`docs/skills-format.md`](skills-format.md) — how to author a SKILL.md.
- [`AGENTS.md`](../AGENTS.md) — invariant #10 + the routing table.
- [`docs/playbooks/intake.md`](playbooks/intake.md) — the cold-start template match.
- [`notes/issues/058-backfill-templates-from-recent-projects.md`](../notes/issues/058-backfill-templates-from-recent-projects.md) — content-niche skill → template conversion (pending).
