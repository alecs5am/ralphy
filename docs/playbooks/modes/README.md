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
| `restyle` | [restyle.md](restyle.md) | `/json-prompt-engine` |
| `tutorial-ugc` | [tutorial-ugc.md](tutorial-ugc.md) | `/ugc-ad` |
| `unboxing-ugc` | [unboxing-ugc.md](unboxing-ugc.md) | `/ugc-unboxing` |
| `cartoon-animation` | [cartoon-animation.md](cartoon-animation.md) | `/ugc-toon-action` + `/seedance-prompts` |
| `motion-design` | [motion-design.md](motion-design.md) | `/hyperframes` + `/gsap` |
| `typography-animation` | [typography-animation.md](typography-animation.md) | `/hyperframes` + `/gsap` + `/waapi` |
| `podcast-video` | [podcast-video.md](podcast-video.md) | `/audio-explainer` |

The remaining supported modes are covered by a register guideline instead: `product-shot` (cgi-product-renders), `lifestyle-scene` / `closeup-product-with-person` / `ugc-review` (photoreal-studio-portraits), `tv-ad` (broadcast-realism-aspect / cinematic-90s-film / oldspice-absurd-spokesman). The 3 deferred-gap modes (`virtual-model-tryout`, `personal-clipper`, `amazon-listing`) are exempt from the coverage bar until they are promoted to supported (#058).

## See also

- [`docs/content-mode-coverage.md`](../../content-mode-coverage.md) — the supported/gap matrix + the per-mode coverage column.
- [`cli/lib/content-modes.ts`](../../../cli/lib/content-modes.ts) — the machine-readable registry (`supported`, `implementationUnit`, `guidelineOrStyleLock`).
- [`guidelines/`](../../../guidelines/) — the register-level prompt library.
