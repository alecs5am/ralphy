# Templates index

Single-doc directory of every template shipped in `templates/` (repo) and `workspace/templates/` (user-local).

**Two manifests** — read whichever fits the task:
- [`templates/CATEGORIES.md`](../templates/CATEGORIES.md) — full slug roster organized by segment-persona category (5 folders: `b2b-saas`, `dtc-commerce`, `creator-lifestyle`, `entertainment-viral`, `cinematic-narrative`). Use this for browsing / picking by audience.
- [`templates/TOP.md`](../templates/TOP.md) — Top-20 viral-2026 cross-category playlist. Use this when test-driving the pipeline or picking the highest-leverage formats.

> The authoritative discovery mechanism is `ralphy template list -p` — this index is a static snapshot for fast grep / agent context loading. If you suspect drift, run the CLI.

**Total: 42 repo templates** (5 vibe-reference + 37 vibe-style), physically organized into 5 segment-persona folders under `templates/`. The CLI resolves by slug regardless of category folder — `ralphy template use <slug>` still works as before, no slug change. Templates added 2026-05-07 cover the 20 trending short-form formats from the deep-research catalog plus 8 vertical / conversion-focused formats from direct user feedback (try-on, doctor-authority, life-changing-testimonial, active-lifestyle, podcast-clip, interview-dialog, cgi-hardware, cgi-architecture). Folder reshape: 2026-05-11.

## `kind` field — what each one means

| `kind` | What it gives you | Run flow |
|---|---|---|
| `vibe-reference` | A specific UGC format with a complete Remotion stack: scenarios get written fresh per project against this vibe. Has a worked reference example, model stack with real costs, composition.md. End-to-end production-ready. | `ralphy template use <slug> --project <id>` then run scenarist → art-director → editor. |
| `vibe-style` | A prompt cookbook ported from the higgsfield-claude-skills pack. Strong on hooks, camera vocabulary, lighting setups, and ready-to-paste example prompts. Lighter than `vibe-reference` (no composition.md or worked-example walk-through), but covers a much broader catalog of visual styles and verticals. | Same `ralphy template use`, but expect art-director to author Remotion composition fresh — the cookbook accelerates prompt-writing, not Remotion structure. |

Mix freely. Use a `vibe-style` template when the user's brief leans on a visual style or vertical (cinematic, anime, real-estate, food); use a `vibe-reference` when the user wants a known proven UGC format (before/after, Soviet nostalgic, talking-head rant, AI vegetables).

## vibe-reference (5)

Full-stack templates: scenario → composition → render. Ship with worked reference examples and complete pipeline tooling.

| Slug | Name | Ref required? | One-liner |
|---|---|---|---|
| `ai-vegetables` | AI Vegetables POV | no | Surrealist POV — anthropomorphic vegetable does a mundane human action. 12-18s. |
| `before-after-product` | Before / After Product | **yes** | 5s pain → 1s reveal → 9s demo. Most reliably converting UGC pattern. |
| `soviet-nostalgic` | Soviet Nostalgic TikTok Ad | no | Off-screen Russian narrator, two-era heritage story with mid-video music drop. |
| `talking-head-rant` | Talking Head Rant | no | Single-character monolog 15-22s, deadpan, optional hook-screenshot overlay. |
| `podcast-clip` | Podcast Clip | **yes** | Long-form podcast → 15-60s viral cuts. Title-banner + karaoke captions + smart-crop reframe. |

## vibe-style — prompt cookbooks (38)

Each has `template.json` + `TEMPLATE.md` + `hooks.md` + `prompt-cookbook.md`.

### Creative styles (artistic look)

| Slug | Ref required? | One-liner |
|---|---|---|
| `cinematic` | no* | Blockbuster film-look. 12 hooks, 16-move camera vocabulary, 10 lighting setups, 8 color grades. |
| `3d-cgi` | no* | Generic 3D / CGI catch-all (Pixar through photoreal). For specific verticals see `cgi-hardware` and `cgi-architecture`. |
| `cartoon` | no* | 2D, cel-shaded, hand-drawn, watercolor, pixel, claymation. 9 animation principles cited by name. |
| `comic-to-video` | **yes** | Animate user-supplied comic panels / manga / webtoons. Reading-order-aware (LTR / RTL / vertical). |
| `fight-scenes` | no* | Cinematic fight choreography. Hook → exchanges → escalation → climax → resolution. |
| `anime-action` | no* | Cel-shaded 2D anime. Speed lines, impact frames, eye close-ups. 11-subgenre cheat sheet. |
| `cgi-hardware` | **yes** | Premium gadget renders — Flipper / Teenage Engineering / Nothing Phone / Apple-keynote vibe. |
| `cgi-architecture` | no* | Archviz — rendered houses / interiors / conceptual builds. Distinct from `real-estate` (existing properties). |

\* `requiresUserReference: false` by default — but AGENTS.md hard rule #3 still kicks in when the brief names a real entity, real franchise, or real character.

### Commercial / marketing

| Slug | Ref required? | One-liner |
|---|---|---|
| `motion-design-ad` | **yes** | Kinetic-typography / motion-graphics SaaS ad. UI capture / logo required. |
| `ecommerce-ad` | **yes** | Conversion-first product ad. Generic 10-category playbook. |
| `product-360` | **yes** | 8-15s photoreal product turntable. No VO by default — music + foley carry. |
| `brand-story` | **yes** | 30-60s cinematic brand narrative. Founder voice or transformation arc. |
| `try-on` | **yes** | Virtual try-on (clothing / glasses / makeup / shoes / jewelry). Mirror-flash multi-variant 8-25s. |
| `before-after-product` | **yes** | (vibe-reference) Classic 5s pain → 1s reveal → 9s demo. Product-led. |
| `life-changing-testimonial` | **yes** | Person-led peer testimony. "This changed my life" with specific outcome numbers. |
| `doctor-authority` | **yes** | White-coat authority figure explains mechanism. The dominant nutra / supplement / skincare ad pattern. AI-disclosure overlay enforced. |
| `active-lifestyle` | **yes** | Person doing sport (cycling / padel / gym / yoga / running) with subtle product placement. Aspirational. |

### Hooks / engagement formats

| Slug | Ref required? | One-liner |
|---|---|---|
| `social-hook` | no | Generic TikTok scroll-stopper. 13 hooks across 5 categories. |
| `pov-first-person` | no | "POV: you just…" relatable scenarios. Highest share-rate format. 8-25s. |
| `grwm` | **yes**(branded) | Get Ready With Me — dual-layer (visual + storytime). Native product placement. 30-90s. |
| `storytime` | no | Selfie talking-head narrative with rising tension + pattern-interrupts. 60-180s. |
| `yap-talking-head` | no | Hormozi/Codie raw-energy single-idea education. 30-60s, no jump cuts. |
| `talking-head-rant` | no | (vibe-reference) Deadpan rant 15-22s with optional hook-screenshot overlay. |
| `green-screen-explainer` | **yes** | Creator + backdrop (Reddit / news / chart / meme) with circle-annotations. 15-45s. |
| `tutorial-how-to` | no | Hoyos-method 3-step search-first tutorial with power-word hook. 30-90s, YouTube Shorts king. |
| `listicle` | no | "Top N X" with big counter and #1 cliffhanger. Search-friendly evergreen. 30-60s. |
| `tier-list` | no | S/A/B/C/D ranking grid. Debate-bait with controversial final pick. 40-75s. |
| `faceless-voiceover` | no | AI / live VO over b-roll. Faceless YouTube channel base. 45-90s. |
| `brainrot-ai-meme` | **yes** | Split-screen AI VO + Subway Surfers / Minecraft Parkour gameplay loop + screaming captions. C2PA disclosure mandatory. |
| `ai-avatar` | no | Full synthetic talking-head (wan-25 / sync-lipsync). Multilingual scaling, 175+ languages. AI-disclosure overlay. |
| `interview-dialog` | no | Two-person dialog (expert+interviewer / split-screen / podcast-style). Two ElevenLabs voice IDs. |

### Industry / vertical

| Slug | Ref required? | One-liner |
|---|---|---|
| `music-video` | no | Beat-synced clips. Performance / Narrative / Visualizer modes. 10-genre matrix. |
| `fashion-lookbook` | **yes** | 15-30s editorial garment storytelling. Movement sells clothes. |
| `fit-check` | **yes** | Faster OOTD format 7-20s. Beat-snap transitions, 1-3 looks per Reel. |
| `food-beverage` | **yes** | Appetite-trigger cinematography. ASMR sizzle, latte art, cocktail builds. |
| `real-estate` | **yes** | 20-60s property showcase. Photoreal property tours of existing homes. |
| `ai-vegetables` | no | (vibe-reference) Surrealist POV — anthropomorphic vegetable. 12-18s. |
| `soviet-nostalgic` | no | (vibe-reference) Russian narrator two-era heritage story. |

### Sensory / atmospheric / audio-first

| Slug | Ref required? | One-liner |
|---|---|---|
| `asmr-sensory` | no | Sound-forward content. Tapping / whispering / cooking / unboxing-sounds. Music OFF default. 30-90s. |
| `photo-dump` | no | Carousel-as-video. 5-16 photos snap-cut to beat. Reels-dominant. 10-25s. |
| `trending-sound-remix` | **yes** | Audio-first remix of a hyped sound. User supplies trending audio. 7-25s, 24-48h post-window. |

## How to use this index as an agent

1. **Always run `ralphy template suggest "<user-utterance>"` first** — the suggester does tag-match ranking across all 44 templates and beats grepping this file.
2. If suggester returns no strong match (no result with score > N), fall back to scanning this index by category.
3. Read the matched template's `TEMPLATE.md` fully before authoring scenario / prompts. The reference-required gate is encoded in `template.json.requiresUserReference` and `referenceNotes` — refuse if user hasn't supplied a reference (AGENTS.md hard rule #3).
4. For `vibe-style` templates, use `prompt-cookbook.md` as the prompt-writing reference and `hooks.md` for the opening 0-2s.
5. **Do not invent new templates on the fly.** If nothing fits, go straight to scenarist (no template) — and after the project lands well, run `ralphy template create --from-project <id>` to extract the new pattern.

## Adding new templates

- New `vibe-reference`: usually via `ralphy template create --from-project <id>` after a successful project lands.
- New `vibe-style`: hand-written prompt cookbook that follows the 4-file structure (`template.json`, `TEMPLATE.md`, `hooks.md`, `prompt-cookbook.md`). Mirror an existing one (e.g. `cinematic` or `ecommerce-ad`) for shape.

Either way: register and verify with `ralphy template register <slug>` then `ralphy template list -p`.
