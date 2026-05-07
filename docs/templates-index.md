# Templates index

Single-doc directory of every template shipped in `templates/` (repo) and `workspace/templates/` (user-local). Sorted by `kind`, then alphabetically.

> The authoritative discovery mechanism is `ralphy template list -p` — this index is a static snapshot for fast grep / agent context loading. If you suspect drift, run the CLI.

## `kind` field — what each one means

| `kind` | What it gives you | Run flow |
|---|---|---|
| `vibe-reference` | A specific UGC format with a complete Remotion stack: scenarios get written fresh per project against this vibe. Has a worked reference example, model stack with real costs, composition.md. End-to-end production-ready. | `ralphy template use <slug> --project <id>` then run scenarist → art-director → editor. |
| `vibe-style` | A prompt cookbook ported from the higgsfield-claude-skills pack. Strong on hooks, camera vocabulary, lighting setups, and ready-to-paste example prompts. Lighter than `vibe-reference` (no composition.md or worked-example walk-through), but covers a much broader catalog of visual styles and verticals. | Same `ralphy template use`, but expect art-director to author Remotion composition fresh — the cookbook accelerates prompt-writing, not Remotion structure. |

Mix freely. Use a `vibe-style` template when the user's brief leans on a visual style or vertical (cinematic, anime, real-estate, food); use a `vibe-reference` when the user wants a known proven UGC format (before/after, Soviet nostalgic, talking-head rant, AI vegetables).

## vibe-reference templates (4)

These are full-stack: scenario → composition → render. Ship with a worked reference example.

| Slug | Name | Ref required? | One-liner |
|---|---|---|---|
| `ai-vegetables` | AI Vegetables POV | no | Surrealist POV — anthropomorphic vegetable does a mundane human action. 12-18s. |
| `before-after-product` | Before / After Product | **yes** | 5s pain → 1s reveal → 9s demo. Most reliably converting UGC pattern. |
| `soviet-nostalgic` | Soviet Nostalgic TikTok Ad | no | Off-screen Russian narrator, two-era heritage story with mid-video music drop. |
| `talking-head-rant` | Talking Head Rant | no | Single-character monolog 15-22s, deadpan, optional hook-screenshot overlay. |

## vibe-style templates (15) — ported from higgsfield-claude-skills

These are prompt cookbooks. Each one has `template.json`, `TEMPLATE.md` (vibe doc), `hooks.md` (8-13 hooks), `prompt-cookbook.md` (master template + camera/lighting/sound vocab + worked examples).

### Creative styles (artistic look)

| Slug | Ref required? | One-liner |
|---|---|---|
| `01-cinematic` | no* | Blockbuster film-look. 12 hooks, 16-move camera vocabulary, 10 lighting setups, 8 color grades. |
| `02-3d-cgi` | no* | Pixar-stylized through photorealistic 3D. PBR / SSS / caustics / GI vocabulary. |
| `03-cartoon` | no* | 2D, cel-shaded, hand-drawn, watercolor, pixel, claymation. 9 animation principles cited by name. |
| `04-comic-to-video` | **yes** | Animate user-supplied comic panels / manga / webtoons. Reading-order-aware (LTR / RTL / vertical). |
| `05-fight-scenes` | no* | Cinematic fight choreography. Hook → exchanges → escalation → climax → resolution. |
| `08-anime-action` | no* | Cel-shaded 2D anime. Speed lines, impact frames, eye close-ups. 11-subgenre cheat sheet. |

\* `requiresUserReference: false` by default — but AGENTS.md hard rule #3 still kicks in when the brief names a real entity, real franchise, or real character.

### Commercial / marketing

| Slug | Ref required? | One-liner |
|---|---|---|
| `06-motion-design-ad` | **yes** | Kinetic-typography / motion-graphics SaaS ad. UI capture / logo required. |
| `07-ecommerce-ad` | **yes** | Conversion-first product ad. Hook → showcase → lifestyle → CTA. 10-category playbook. |
| `09-product-360` | **yes** | 8-15s photoreal product turntable. No VO by default — music + foley carry. |
| `11-social-hook` | no | TikTok scroll-stopper. The hook is the entire product. 13 hooks across 5 categories. |
| `12-brand-story` | **yes** | 30-60s cinematic brand narrative. Founder voice or transformation arc. |

### Industry / vertical

| Slug | Ref required? | One-liner |
|---|---|---|
| `10-music-video` | no | Beat-synced clips. Performance / Narrative / Visualizer modes. 10-genre matrix. |
| `13-fashion-lookbook` | **yes** | 15-30s editorial garment storytelling. Movement sells clothes. |
| `14-food-beverage` | **yes** | Appetite-trigger cinematography. ASMR sizzle, latte art, cocktail builds. |
| `15-real-estate` | **yes** | 20-60s property showcase. Bricks → aspiration. Photoreal flythrough / threshold reveal. |

## How to use this index as an agent

1. **Always run `ralphy template suggest "<user-utterance>"` first** — the suggester does tag-match ranking across all 21 templates and beats grepping this file.
2. If suggester returns no strong match (no result with score > N), fall back to scanning this index by category.
3. Read the matched template's `TEMPLATE.md` fully before authoring scenario / prompts. The reference-required gate is encoded in `template.json.requiresUserReference` and `referenceNotes` — refuse if user hasn't supplied a reference (AGENTS.md hard rule #3).
4. For `vibe-style` templates, use `prompt-cookbook.md` as the prompt-writing reference and `hooks.md` for the opening 0-2s.
5. **Do not invent new templates on the fly.** If nothing fits, go straight to scenarist (no template) — and after the project lands well, run `ralphy template create --from-project <id>` to extract the new pattern.

## Adding new templates

- New `vibe-reference`: usually via `ralphy template create --from-project <id>` after a successful project lands.
- New `vibe-style`: hand-written prompt cookbook that follows the 4-file structure (`template.json`, `TEMPLATE.md`, `hooks.md`, `prompt-cookbook.md`). Mirror an existing one (e.g. `01-cinematic` or `07-ecommerce-ad`) for shape.

Either way: register and verify with `ralphy template register <slug>` then `ralphy template list -p`.
