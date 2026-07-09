# Content-mode coverage matrix (#413)

> The audit of which #412 content modes are **first-class supported routes** vs **deferred gaps**, and the mapping of each mode onto an existing implementation unit (a craft-overlay skill, a guideline-locked `ralphy generate` route, the HyperFrames render engine, or — for a gap — the unit we recommend authoring). This is the prerequisite for #417's guideline-coverage check, which only validates SUPPORTED modes.
>
> The machine-readable source of truth is the `supported` + `implementationUnit` fields on every entry in [`cli/lib/content-modes.ts`](../cli/lib/content-modes.ts). This doc explains the call per mode and classifies the existing skills against modes. The meta-test in [`tests/unit/mode-coverage.test.ts`](../tests/unit/mode-coverage.test.ts) parses this doc and asserts all 22 modes are listed, so the matrix can't silently drift from the registry.

## What "supported" means

A mode is **supported** iff it has all three:

1. a **default route** — a concrete implementation unit (`implementationUnit.kind !== "none"`);
2. **quality gates** — the mode's `qualityGates` (present for every mode);
3. an **output Unit shape** — the mode's `expectedUnitShape` (present for every mode).

Because gates + Unit shape exist for all 22 #412 modes, the load-bearing condition is the implementation unit. In code: `supported === (implementationUnit.kind !== "none")`, asserted in the mode-coverage test. `classifyContentMode()` still recognizes and returns every mode (the agent must be able to NAME the intent); `supported` gates only what the agent may PROMISE the user and what #417 checks. Consume it via `isModeSupported(mode)` / `supportedContentModes()` / `unsupportedContentModes()`.

**Do NOT author 20 brand-new heavy skills.** Modes are mapped onto units that ALREADY exist. Genuine gaps are marked `gap (deferred)` with the recommended unit — authoring those is #058 (content-niche → format-template conversion) territory, not this round.

## Implementation-unit kinds

| kind | what it is | examples |
|---|---|---|
| `skill` | a craft-overlay SKILL.md under `.agents/skills/` | `carousel`, `fb-creatives`, `ugc-ad`, `audio-explainer` |
| `guideline-route` | an art-director `ralphy generate image` route locked by an existing `guidelines/` slug + `json-prompt-engine` for the structured prompt | `product-shot` → `cgi-product-renders` |
| `render-engine` | the HyperFrames render engine + editor playbook authoring the format directly | `motion-design`, `typography-animation` |
| `none` | no concrete unit yet — a deferred gap | (none — all 22 modes are supported) |

## The matrix

Status legend: **supported** = first-class route the agent may promise; **gap (deferred)** = recognized intent with no first-class unit yet (route to the closest supported mode or say it is not yet a first-class route).

| mode | implementation unit | existing artifact (cited) | status | fixtures | notes |
|---|---|---|---|---|---|
| `product-shot` | guideline-route | `guidelines/cgi-product-renders` + `/json-prompt-engine` overlay → `ralphy generate image` | supported | route + plan (image) | Product realism is a known failure mode; the cgi-product-renders lock is required. |
| `lifestyle-scene` | guideline-route | `guidelines/photoreal-studio-portraits` (when people are in frame) + art-director image route | supported | route + plan (image) | Portrait guideline applies but is not blocking. |
| `closeup-product-with-person` | guideline-route | `guidelines/photoreal-studio-portraits` + art-director image route | supported | route + plan (image) | Hand/skin near the product is the realism failure point; lock required. |
| `pinterest-pin` | skill | `.agents/skills/poster` (baked-overlay-text still architecture) | supported | route + plan (image) | Poster skill covers the 2:3 baked-text pin; route at a 2:3 aspect. |
| `hero-banner` | skill | `.agents/skills/poster` (wordmark → hero → copy) | supported | route + plan (poster) | Poster skill covers the wide banner; brand DNA locks a style when named. |
| `social-carousel` | skill | `.agents/skills/carousel` (cover-first + dual-ref cohesion) | supported | route + plan (carousel) | Direct route; cover-first checkpoint per the skill. |
| `ad-creative-pack` | skill | `.agents/skills/fb-creatives` (5-set scaffold) + `/researcher` (deep crawl, AGENTS #15) | supported | route + plan (fb-creative) | Site-grounding locks the real palette + copy before any creative. |
| `virtual-model-tryout` | guideline-route | `guidelines/photoreal-studio-portraits` + `/json-prompt-engine` overlay → `ralphy generate image` ([modes/virtual-model-tryout.md](playbooks/modes/virtual-model-tryout.md)) | supported | route + plan (image) | Highest-hallucination-risk image mode; the photoreal lock + the mode playbook's try-on craft + product/model refs (#426) + fidelity gate (#422) apply. Real-person try-on gates on the reference-required gate (#3). |
| `conceptual-product` | guideline-route | `/json-prompt-engine` overlay → art-director image route | supported | route + plan (image) | Style is brief-driven; no mandatory lock. |
| `restyle` | guideline-route | `/json-prompt-engine` (target aesthetic) → `ralphy generate image` with source as `--ref` | supported | route + plan (image) | The target style IS the locked register (#408 covered set). |
| `ugc-review` | skill | `.agents/skills/ugc-ad` (shooting-script + creator-persona + problem-mirror hook) | supported | route + plan (video) | `photoreal-studio-portraits` benefits talking-head realism; not blocking. |
| `tutorial-ugc` | skill | `.agents/skills/ugc-ad` (UGC craft; step-by-step beat list specializes the scenario) | supported | route + plan (video) | A dedicated tutorial template is the #058 follow-up; ugc-ad carries the craft today. |
| `unboxing-ugc` | skill | `.agents/skills/ugc-unboxing` (reveal beats + first-impressions craft) | supported | route + plan (video) | Direct route. |
| `tv-ad` | skill | `.agents/skills/ugc-rockstar` + `/researcher`; guidelines `broadcast-realism-aspect` / `cinematic-90s-film` / `oldspice-absurd-spokesman` | supported | route + plan (video) | Broadcast register is a hard look-lock; pick the matching guideline. |
| `cartoon-animation` | skill | `.agents/skills/ugc-toon-action` + `/seedance-prompts` (t2v prompt craft) | supported | route + plan (video) | Animation style locked up front for character consistency. |
| `motion-design` | render-engine | `.agents/skills/hyperframes` + `/gsap` + editor playbook → `ralphy render` | supported | route + plan (motion-design) | The render engine authors the motion-design format directly. |
| `typography-animation` | render-engine | `.agents/skills/hyperframes` + `/gsap` + `/waapi` (per-char timelines) → `ralphy render` | supported | route + plan (motion-design) | Kinetic type authored directly in HyperFrames. |
| `podcast-video` | skill | `.agents/skills/audio-explainer` (yt-dlp → Scribe → claim segmentation → overlay planner → HyperFrames) | supported | route + plan (video) | Direct route. |
| `infographic-animation` | render-engine | `.agents/skills/hyperframes` + `/gsap` (data-in-motion: animated charts / counters / comparison overlays) → `ralphy render` | supported | route + plan (motion-design) | The render engine authors the animated infographic directly; factual claims require source-cited / user-provided data. |
| `personal-clipper` | render-engine | `ralphy ref transcribe` → agent-picked highlight windows → `ralphy clip --from --to [--vertical]` → `ralphy generate captions` → `ralphy render` ([modes/personal-clipper.md](playbooks/modes/personal-clipper.md)) | supported | route + plan (video) | Transcript-driven clip extraction (#436). `ralphy clip` only executes the cut — the agent selects windows from the `ref transcribe` transcript; a no-good-clips-found brief STOPS rather than forcing weak clips. |
| `amazon-listing` | guideline-route | `guidelines/cgi-product-renders` + `/json-prompt-engine` overlay → `ralphy project image-pack` + `ralphy generate image` ([modes/amazon-listing.md](playbooks/modes/amazon-listing.md)) | supported | route + plan (image) | Marketplace listing slot set (main + infographic + lifestyle); the cgi-product-renders lock + the image-pack scaffold (#429) + claim-safe copy (#442) + the text-legibility gate (#439) + product fidelity (#422) apply. |
| `seo-article` | guideline-route | `guidelines/geo-article` folded into the drafting prompt → graph route `research (generate-object) → outline/draft (generate-text) → text-quality gate → ralphy unit create --format article` ([modes/seo-article.md](playbooks/modes/seo-article.md)) | supported | route + plan (article) | First NON-media mode (#526): a long-form GEO-aware article. The geo-article lock + the deterministic text-quality gate (keyword coverage / structure / reading-level / length — `requiresTextQualityGate`, `cli/lib/eval/text-quality.ts`) apply; the classic slot is `scoreScenario`. Promo snippet reuses the social-copy path (#403). |

**Summary: 22 supported, 0 gaps.** As of #526 (`seo-article` added), all 22 modes are first-class routes.

## Quality-guidance coverage (#417)

Every SUPPORTED mode must carry mode-specific quality guidance — a linked register guideline OR a mode-level quality playbook — so the agent never improvises art direction, negative scope, or model picks for a first-class route. The [coverage lint](../scripts/lint-mode-guidelines.ts) (`bun run lint:mode-guidelines`, wired into CI) FAILS when a supported mode has neither. The two homes:

- **Linked register guideline** — the mode references an existing [`guidelines/<slug>/`](../guidelines/) via `implementationUnit.guidelines` / `guidelineOrStyleLock.guidelineSlugs`. The `guidelines/` gallery codifies a **look / register** (how to prompt a model family) and ships to the public `/library`.
- **Mode-level quality playbook** — a [`docs/playbooks/modes/<mode>.md`](playbooks/modes/) doc covering the production-intent floor (creative objective · required inputs · reference requirements · prompt spine · model recommendations · style/visual constraints · common failure modes · evaluation criteria · negative scope). This is the home for guidance that does NOT fit the `guideline.json` look schema. See [`docs/playbooks/modes/README.md`](playbooks/modes/README.md) for why the two homes are split.

| mode | quality guidance | home |
|---|---|---|
| `product-shot` | `cgi-product-renders` | guideline |
| `amazon-listing` | `cgi-product-renders` | guideline |
| `seo-article` | `geo-article` (+ [modes/seo-article.md](playbooks/modes/seo-article.md)) | guideline |
| `lifestyle-scene` | `photoreal-studio-portraits` | guideline |
| `closeup-product-with-person` | `photoreal-studio-portraits` | guideline |
| `virtual-model-tryout` | `photoreal-studio-portraits` | guideline |
| `ugc-review` | `photoreal-studio-portraits` | guideline |
| `tv-ad` | `broadcast-realism-aspect` / `cinematic-90s-film` / `oldspice-absurd-spokesman` | guideline |
| `pinterest-pin` | [modes/pinterest-pin.md](playbooks/modes/pinterest-pin.md) | playbook |
| `hero-banner` | [modes/hero-banner.md](playbooks/modes/hero-banner.md) | playbook |
| `social-carousel` | [modes/social-carousel.md](playbooks/modes/social-carousel.md) | playbook |
| `ad-creative-pack` | [modes/ad-creative-pack.md](playbooks/modes/ad-creative-pack.md) | playbook |
| `conceptual-product` | [modes/conceptual-product.md](playbooks/modes/conceptual-product.md) | playbook |
| `restyle` | [modes/restyle.md](playbooks/modes/restyle.md) | playbook |
| `tutorial-ugc` | [modes/tutorial-ugc.md](playbooks/modes/tutorial-ugc.md) | playbook |
| `unboxing-ugc` | [modes/unboxing-ugc.md](playbooks/modes/unboxing-ugc.md) | playbook |
| `cartoon-animation` | [modes/cartoon-animation.md](playbooks/modes/cartoon-animation.md) | playbook |
| `motion-design` | [modes/motion-design.md](playbooks/modes/motion-design.md) | playbook |
| `typography-animation` | [modes/typography-animation.md](playbooks/modes/typography-animation.md) | playbook |
| `podcast-video` | [modes/podcast-video.md](playbooks/modes/podcast-video.md) | playbook |
| `infographic-animation` | [modes/infographic-animation.md](playbooks/modes/infographic-animation.md) | playbook |
| `personal-clipper` | [modes/personal-clipper.md](playbooks/modes/personal-clipper.md) | playbook |

Every supported mode carries quality guidance; there are no deferred-gap modes left to exempt. The production plan (#407) lists the guidance it loaded for the chosen mode in its `guidelinesUsed[]` field (populated from `modeGuidelineCoverage()`).

## Skills classified against modes

Every user-facing skill is either **attached to a mode** (a content craft-overlay a mode's implementation unit names) or **technical / maintainer-only** (an operation around content, the render engine, or a dev workflow — never a content-routing default). This is the audit #413 asks for.

### User skills attached to a mode (content craft overlays)

| skill | attached mode(s) | role |
|---|---|---|
| `poster` | `pinterest-pin`, `hero-banner` | baked-text still architecture |
| `carousel` | `social-carousel` | multi-slide swipe-through deck |
| `fb-creatives` | `ad-creative-pack` | N≥4 static performance creatives |
| `ugc-ad` | `ugc-review`, `tutorial-ugc` | realistic UGC ad / talking-head craft |
| `ugc-unboxing` | `unboxing-ugc` | unboxing / first-impressions craft |
| `ugc-rockstar` | `tv-ad` | GTA-V / cinematic-crime aesthetic |
| `ugc-toon-action` | `cartoon-animation` | painterly / cartoon action animation |
| `audio-explainer` | `podcast-video` | audio-first long-form faceless explainer |
| `json-prompt-engine` | `product-shot`, `lifestyle-scene`, `closeup-product-with-person`, `conceptual-product`, `restyle` | structured image-prompt overlay on the art-director step |
| `seedance-prompts` | `cartoon-animation` (+ any seedance t2v/i2v job) | seedance prompt craft (art-director overlay) |
| `analog-horror-psa` | — (niche video format; no #412 mode yet) | niche craft overlay; a candidate for a future mode / #058 template |
| `ugc-model-swap` | — (remix-with-swap craft; NOT a content mode) | the specialist for swapping the on-camera person in a remix |

Notes:
- `researcher` is dual-purpose: it is a **technical operation** (URL research / competitor audit) AND is named by the `ad-creative-pack` / `tv-ad` units as the deep-crawl overlay. It is listed under technical/operational below; the modes reference it for the research half of their route.
- `hyperframes` / `gsap` / `waapi` are render-engine skills but back the `motion-design` / `typography-animation` units (kind `render-engine`). They are listed under the render engine below.
- `analog-horror-psa` and `ugc-model-swap` are real content craft overlays that do NOT map onto a #412 mode: PSA has no mode yet, and model-swap is a remix-with-swap craft (a usage pattern, not a production-intent mode). Both stay craft overlays; a future taxonomy round (#058) may add a mode for PSA.

### Technical / operational skills (not content-routing defaults)

| skill | kind | role |
|---|---|---|
| `researcher` | operation (user) | URL research / competitor breakdown; deep-crawl overlay for `ad-creative-pack` / `tv-ad` |
| `evaluator` | operation (user) | post-render QA / scoring a rendered mp4 |
| `install` | operation (user) | install ralphy on a fresh machine |
| `postmortem` | operation (user) | distil a session into a checked-in postmortem set |
| `templater` | operation (user) | extract + classify a finished project into the 5 library entities |
| `memory-review` | operation (user) | session-end memory review |
| `fixer` | operation (user) | repair / debug a stuck pipeline |
| `json-prompt-engine` | overlay (user) | also a content overlay (see above) — image-to-JSON-prompt |

### Render-engine skills (HyperFrames)

`hyperframes`, `hyperframes-cli`, `hyperframes-media`, `hyperframes-registry`, `gsap`, `lottie`, `animejs`, `css-animations`, `three`, `typegpu`, `waapi`, `tailwind`, `website-to-hyperframes`, `contribute-catalog`, `ralphy-remotion`, `remotion-to-hyperframes`. These author the composition layer. `hyperframes` / `gsap` / `waapi` back the `motion-design` / `typography-animation` modes directly; the rest are engine internals.

### Maintainer skills

`dev-issues`, `dev-loop`, `dev-publish-template`, `dev-release`, `dev-tasks`, `normalize-skills` (`namespace: maintainer`). Never content-routing.

## Do NOT promise unsupported modes (agent rule)

`classifyContentMode()` returns ALL 22 modes because the agent must be able to recognize the intent. As of #436 every mode is supported, so there is currently no deferred-gap mode to refuse — but the rule stands for any future mode added at `supported: false`: **the agent must NOT expose an unsupported mode name to the user as a deliverable it will produce.** When a brief classifies to a `gap (deferred)` mode:

- route to the **closest supported mode** when one fits, and say so, OR
- tell the user plainly it is **not yet a first-class route** and point at the recommended unit (the `recommendedUnit` field on the gap entry / the matrix above), then proceed only on explicit user go.

This is the same defect class as skipping a playbook read: promising a mode as if a tuned pipeline existed when none does would fall back to weak generic prompts and agent taste — the exact failure #413 exists to prevent. Programmatically, gate any "I'll make you a `<mode>`" promise on `isModeSupported(mode)`.

## See also

- [`cli/lib/content-modes.ts`](../cli/lib/content-modes.ts) — the registry + `supported` / `implementationUnit` + `isModeSupported()` (machine-readable source of truth).
- [`docs/content-modes.md`](content-modes.md) — the per-mode route reference (#412).
- [`docs/skills-vs-templates.md`](skills-vs-templates.md) — the template / skill / guideline / Unit model the matrix maps onto.
- [`tests/unit/mode-coverage.test.ts`](../tests/unit/mode-coverage.test.ts) — per-supported-mode fixtures + the matrix-completeness meta-test.
- [`notes/issues/done/413-mode-skill-backfill-and-validation.md`](../notes/issues/done/413-mode-skill-backfill-and-validation.md) — the issue this matrix delivers.
