# Content modes — the production-intent routing layer

> The agent-facing reference for `content_mode`: a routing-vocabulary layer that sits **above** the media `format` taxonomy. Read this before matching a brief to a template. The machine-readable source of truth is [`cli/lib/content-modes.ts`](../cli/lib/content-modes.ts); this file explains the concepts and the per-mode routes. Introduced in issue #412.

## The one distinction that matters

Ralphy already has formats, templates, skills, guidelines, and Units. A short chat brief — "make a product shot," "cut my stream into clips," "design my amazon listing" — doesn't map cleanly onto any single one of those. A **content mode** is the missing top label: it captures the user's **production intent** and routes it to the right pipeline so a low-tech user never has to know whether their request is a template, a skill, a playbook, or a CLI verb.

The load-bearing line:

- **`content_mode` = production INTENT.** What the user is trying to produce, and how the agent should route it (role chain, required inputs, research depth, template lookup, quality gates, expected Unit). A mode answers *"what kind of job is this?"*
- **`format` = media CONTAINER.** What the deliverable ships as — `video | image | carousel | fb-creative | motion-design | poster | sticker-pack` (the taxonomy in [`cli/lib/schemas/template.ts`](../cli/lib/schemas/template.ts)). A format answers *"what file type is the output?"*

Modes are a **new layer ABOVE format**. They do not redefine the format taxonomy — every mode's `supportedFormats` is a subset of it. One mode can ship in more than one format (a `lifestyle-scene` can be an `image` or a short `video`), and one format hosts many modes (`image` hosts `product-shot`, `pinterest-pin`, `restyle`, `amazon-listing`, …).

## How modes relate to the rest of the model

The whole content model is a stack; the mode is the entry point.

| Concept | Question it answers | Axis | Source of truth |
|---|---|---|---|
| **content_mode** | "What kind of job is this, and how do I route it?" | production INTENT | [`cli/lib/content-modes.ts`](../cli/lib/content-modes.ts) |
| **format** | "What container does it ship as?" | media CONTAINER | [`cli/lib/schemas/template.ts`](../cli/lib/schemas/template.ts) |
| **template** | "How do I make this *kind* of content?" | reusable STRUCTURE + look | public library / workspace templates |
| **skill** | "What craft / operation do I overlay?" | technical / craft OVERLAY | [`.agents/skills/<slug>/`](../.agents/skills/) |
| **guideline** | "What prompt rules apply to this register?" | prompt-library RULES | [`guidelines/`](../guidelines/) |
| **Unit** | "What did the project ship?" | finished DELIVERABLE | `<project>/units/<slug>/unit.json` (#069) |

The flow reads top-to-bottom:

1. **Classify the mode.** The agent runs the fast deterministic pre-classifier (`classifyContentMode()`) on the brief and emits a `content_mode` **before** touching templates or skills. If the classifier flags `ambiguous`, the agent asks one disambiguating question instead of guessing.
2. **The mode picks the format + template lookup.** Each mode carries a `templateLookup` (a primary format + tag query). The agent runs `ralphy template suggest "<brief>" --format <f>` with that format to match a template.
3. **The mode tells the agent which skills / guidelines to overlay.** A mode's `guidelineOrStyleLock` names the guideline slugs that commonly apply (and whether a lock is *required*). Content-niche craft skills (`ugc-*`, `poster`, `carousel`, `fb-creatives`, `analog-horror-psa`, `audio-explainer`) layer on top of the template match.
4. **The mode drives the role chain + gates.** Each mode declares its `roleChain` (intake → … → editor/producer), its `defaultResearchDepth`, and its `qualityGates`. The agent runs that chain; the gates refuse (not warn) per AGENTS.md invariant #4.
5. **The mode shapes the Unit.** Each mode's `expectedUnitShape` says what the finished deliverable looks like (format + media count), which `ralphy unit` forms and `templater` / publish push to the library.

This composes with — it does not replace — the existing routing table in [`AGENTS.md`](../AGENTS.md) and the template/skill/Unit model in [`docs/skills-vs-templates.md`](skills-vs-templates.md). The mode is the bridge from a plain chat brief into that machinery.

## Supported vs unsupported modes (do NOT over-promise)

Every entry carries a `supported: boolean` and an `implementationUnit` (#413). A mode is **supported** iff it has a concrete implementation unit (a default route — a craft skill, a guideline-locked `generate` route, or the render engine) plus quality gates and a Unit shape. The full audit + the mode→unit mapping is [`docs/content-mode-coverage.md`](content-mode-coverage.md); the machine-readable flags live on the registry (`supported`, `implementationUnit`, `isModeSupported()`).

`classifyContentMode()` returns **all 22 modes**, and as of #526 every one is supported — there is currently no deferred-gap mode. The rule below still stands for any future mode added at `supported: false`:

> **Agent rule: never expose an UNSUPPORTED mode name to the user as a deliverable you will produce.** When a brief classifies to a `gap (deferred)` mode, either route to the closest SUPPORTED mode and say so, or tell the user it is not yet a first-class route and point at the recommended unit — then proceed only on explicit go. Promising a tuned pipeline that does not exist falls back to weak generic prompts; that is the failure #413 exists to prevent. Gate any "I'll make you a `<mode>`" promise on `isModeSupported(mode)`.

#417 reads the same `supported` flag to check guideline coverage only for first-class routes.

## The classifier

```ts
import { classifyContentMode } from "../cli/lib/content-modes.js";

const r = classifyContentMode("cut my stream into shorts");
// → { mode: "personal-clipper", confidence: 0.5, ambiguous: false, alternatives: [], scores: [...] }
```

`classifyContentMode(utterance)` is a **deterministic keyword/phrase pre-classifier — no LLM call**. It is the fast first pass the agent runs to emit a mode. It returns:

- `mode` — the best-scoring mode, or `null` when nothing scored.
- `confidence` — 0.0-1.0; saturates around two strong phrase hits.
- `ambiguous` — `true` when the agent should **ask the user** rather than proceed: nothing scored, the top score is below the confidence floor, or the top two modes tie.
- `alternatives` — runner-up modes (descending), so the disambiguating question can be concrete.
- `scores` — all non-zero scores, descending, for debugging / surfacing.

Multi-word keyword phrases ("creative matrix", "audio to video") score 2× a single token because they carry more intent. A vague brief ("make me something for my brand") scores nothing and comes back `ambiguous: true` — the signal to run intake's clarifying-question branch. The classifier is surfaced on every `ralphy template suggest` as a `content_mode` field in the JSON output, so an agent can read the pre-classification alongside the template ranking.

## The mode catalog

Quick-reference route table (intake → Unit). The columns mirror the per-mode fields in `cli/lib/content-modes.ts`.

| mode | formats | research | role chain | style lock (guidelines) | Unit shape |
|---|---|---|---|---|---|
| `product-shot` | image, poster | none | intake → art-director | yes (cgi-product-renders) | image 1-4 |
| `lifestyle-scene` | image, video | quick | intake → art-director | no (photoreal-studio-portraits) | image 1-6 |
| `closeup-product-with-person` | image, video | quick | intake → art-director | yes (photoreal-studio-portraits) | image 1-4 |
| `pinterest-pin` | image, poster | quick | intake → art-director | no (—) | image 1-3 |
| `hero-banner` | image, poster | quick | intake → art-director | no (—) | image 1-3 |
| `social-carousel` | carousel | quick | intake → art-director | yes (—) | carousel 5-10 |
| `ad-creative-pack` | fb-creative, image | deep | intake → researcher → art-director → producer | yes (—) | fb-creative 4+ |
| `virtual-model-tryout` | image, video | quick | intake → art-director | yes (photoreal-studio-portraits) | image 1-6 |
| `conceptual-product` | image, poster | quick | intake → art-director | no (—) | image 1-4 |
| `restyle` | image | none | intake → art-director | no (—) | image 1-4 |
| `ugc-review` | video | quick | intake → scenarist → art-director → editor | no (photoreal-studio-portraits) | video 1 |
| `tutorial-ugc` | video | quick | intake → scenarist → art-director → editor | no (—) | video 1 |
| `unboxing-ugc` | video | quick | intake → scenarist → art-director → editor | no (—) | video 1 |
| `tv-ad` | video | deep | intake → researcher → scenarist → art-director → editor → producer | yes (broadcast-realism-aspect, cinematic-90s-film, oldspice-absurd-spokesman) | video 1 |
| `cartoon-animation` | video, motion-design | quick | intake → scenarist → art-director → editor | yes (—) | video 1 |
| `motion-design` | motion-design, video | quick | intake → art-director → editor | no (—) | motion-design 1 |
| `typography-animation` | motion-design, video | none | intake → art-director → editor | no (—) | motion-design 1 |
| `podcast-video` | video | quick | intake → editor | no (—) | video 1 |
| `personal-clipper` | video | none | intake → editor | no (—) | video 1+ |
| `amazon-listing` | image, carousel | quick | intake → art-director | yes (cgi-product-renders) | image 5-9 |
| `infographic-animation` | motion-design, video | quick | intake → art-director → editor | no (—) | motion-design 1 |
| `seo-article` | article | deep | intake → researcher → scenarist | yes (geo-article) | article 1+ |

For the full per-mode payload — `requiredInputs`, `optionalInputs`, the `templateLookup` tag query, and the exact `qualityGates` — read the registry entry in [`cli/lib/content-modes.ts`](../cli/lib/content-modes.ts). It is intentionally the single machine-readable source so this table and the code never drift.

### Reading a route end-to-end (example: `ad-creative-pack`)

A brief like "make me a set of 32 Meta ads for acme.com" classifies to `ad-creative-pack`. Its registry entry then drives the whole job:

- **requiredInputs:** a brand site / reference + a hero/product reference — without them the agent asks before generating.
- **defaultResearchDepth: deep** — fires the site-grounding sub-agent (AGENTS.md invariant #15) before any prompt.
- **roleChain:** intake → researcher → art-director → producer (a batch, so the producer wraps it).
- **templateLookup:** format `fb-creative`, tags `fb-creative / meta-ads / performance / creative-matrix / ad-pack` → `ralphy template suggest "<brief>" --format fb-creative`; overlay the `fb-creatives` craft skill.
- **guidelineOrStyleLock: required** — the real palette + copy are locked from the crawl before the first creative.
- **qualityGates:** `scoreImage` on each creative.
- **expectedUnitShape:** an `fb-creative` Unit with N≥4 numbered creatives + a copy doc.

The mode is the contract; the playbooks execute it.

## See also

- [`cli/lib/content-modes.ts`](../cli/lib/content-modes.ts) — the registry + `classifyContentMode()` (machine-readable source of truth).
- [`AGENTS.md`](../AGENTS.md) — the routing table; the "Content modes" note points here.
- [`docs/skills-vs-templates.md`](skills-vs-templates.md) — template / skill / Unit model the mode composes with.
- [`cli/lib/schemas/template.ts`](../cli/lib/schemas/template.ts) — the format taxonomy modes route into.
- [`docs/playbooks/intake.md`](playbooks/intake.md) — the clarifying-question branch the agent runs when classification is ambiguous.
- [`guidelines/`](../guidelines/) — the prompt-library rules a mode's style-lock references.
