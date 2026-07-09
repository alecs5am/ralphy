# Mode-level quality playbooks (#417)

> One concise quality playbook per **supported content mode** (#412/#413) that has no register-level [`guidelines/`](../../../guidelines/) entry to lean on. These are the production-intent floor — what to ask for, which references are mandatory, the prompt spine, model picks, style constraints, the common failure modes, and how the output is judged — so the agent never improvises art direction for a first-class route.

## Why this home (and not `guidelines/`)

The [`guidelines/`](../../../guidelines/) gallery codifies **register / look** rules: how to prompt a *model family* to reliably hit a visual register (CGI product renders, photoreal portraits, broadcast realism). Each carries a `guideline.json` with `kind` + `models` + `patterns` and ships to the public `/library` gallery via `ralphy guideline list`.

A mode-level quality playbook is a different artifact: it spans **production intent** — creative objective, role chain, required inputs, evaluation criteria — and does not fit the `guideline.json` look/register schema. Forcing it into `guidelines/` would pollute the public register gallery with non-look entries. `docs/playbooks/` is exactly where role/mode instruction docs already live, so these compose as a `modes/` subdir. The [coverage lint](../../../scripts/lint-mode-guidelines.ts) accepts EITHER home: a mode is covered when it links an existing `guidelines/<slug>/` OR ships a `docs/playbooks/modes/<mode>.md` here.

## Relationship to the craft-overlay skills

Each playbook paraphrases the durable craft already carried in the matching `.agents/skills/<slug>/SKILL.md` (the `ugc-*`, `poster`, `carousel`, `fb-creatives`, `audio-explainer` overlays). The skill body stays the deep how-to with CLI cookbooks; this playbook is the tight quality floor the mode router and a low-tech user can read at a glance. When both exist, read the playbook first to set the bar, then the skill for the full recipe.

## The playbooks

| mode | playbook | backing skill |
|---|---|---|
| `pinterest-pin` | [pinterest-pin.md](pinterest-pin.md) | `/poster` |
| `hero-banner` | [hero-banner.md](hero-banner.md) | `/poster` |
| `social-carousel` | [social-carousel.md](social-carousel.md) | `/carousel` |
| `ad-creative-pack` | [ad-creative-pack.md](ad-creative-pack.md) | `/fb-creatives` + `/researcher` |
| `conceptual-product` | [conceptual-product.md](conceptual-product.md) | `/json-prompt-engine` |
| `product-shot` | [product-shot.md](product-shot.md) | cgi-product-renders guideline + `/json-prompt-engine` |
| `amazon-listing` | [amazon-listing.md](amazon-listing.md) | cgi-product-renders guideline + `/json-prompt-engine` |
| `lifestyle-scene` | [lifestyle-scene.md](lifestyle-scene.md) | photoreal-studio-portraits guideline + `/json-prompt-engine` |
| `closeup-product-with-person` | [closeup-product-with-person.md](closeup-product-with-person.md) | photoreal-studio-portraits guideline + `/json-prompt-engine` |
| `virtual-model-tryout` | [virtual-model-tryout.md](virtual-model-tryout.md) | photoreal-studio-portraits guideline + `/json-prompt-engine` |
| `restyle` | [restyle.md](restyle.md) | `/json-prompt-engine` |
| `ugc-review` | [ugc-review.md](ugc-review.md) | `/ugc-ad` + photoreal-studio-portraits guideline |
| `tutorial-ugc` | [tutorial-ugc.md](tutorial-ugc.md) | `/ugc-ad` |
| `unboxing-ugc` | [unboxing-ugc.md](unboxing-ugc.md) | `/ugc-unboxing` |
| `tv-ad` | [tv-ad.md](tv-ad.md) | `/ugc-rockstar` + `/researcher` + broadcast/cinematic/spokesman guidelines |
| `cartoon-animation` | [cartoon-animation.md](cartoon-animation.md) | `/ugc-toon-action` + `/seedance-prompts` |
| `motion-design` | [motion-design.md](motion-design.md) | `/hyperframes` + `/gsap` |
| `typography-animation` | [typography-animation.md](typography-animation.md) | `/hyperframes` + `/gsap` + `/waapi` |
| `podcast-video` | [podcast-video.md](podcast-video.md) | `/audio-explainer` |
| `infographic-animation` | [infographic-animation.md](infographic-animation.md) | `/hyperframes` + `/gsap` |
| `personal-clipper` | [personal-clipper.md](personal-clipper.md) | `ralphy clip` + `/evaluator` |
| `seo-article` | [seo-article.md](seo-article.md) | geo-article guideline + graph route (generate-object / generate-text) |

`product-shot`, `amazon-listing`, `seo-article`, `lifestyle-scene`, `closeup-product-with-person`, `virtual-model-tryout`, `ugc-review`, and `tv-ad` now carry BOTH a production playbook (above) AND their backing register guideline(s) (cgi-product-renders / geo-article / photoreal-studio-portraits / broadcast-realism-aspect / cinematic-90s-film / oldspice-absurd-spokesman) — the playbook is the production-intent floor, the guideline is the look floor; both apply. Every supported mode now ships a mode playbook. As of #526 all 22 modes are supported (`seo-article` added), so there is no deferred-gap mode left exempt from the coverage bar.

## Adjacent — multi-still deliverables

[`image-pack.md`](image-pack.md) is the workflow playbook for a SET of stills (App Store / Play Store screenshots, social image packs, ad-creative packs) — #429. It is not a content-mode entry of its own: it routes against the existing [`ad-creative-pack`](ad-creative-pack.md) mode + the `image-pack` project kind, and documents the scaffold → ref pack → `generate image --batch` → variant tournament → select → fidelity + rubric → Unit + `unit package` chain. Driven by `ralphy project image-pack <id>`.

## See also

- [`docs/content-mode-coverage.md`](../../content-mode-coverage.md) — the supported/gap matrix + the per-mode coverage column.
- [`cli/lib/content-modes.ts`](../../../cli/lib/content-modes.ts) — the machine-readable registry (`supported`, `implementationUnit`, `guidelineOrStyleLock`).
- [`guidelines/`](../../../guidelines/) — the register-level prompt library.
