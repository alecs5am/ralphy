# Dev-Tool FB Creative Pack (dev-tool-fb-creative-pack)

An N-creative (typically 30+) static Facebook / Meta / IG ad pack for a SaaS / dev-tool startup, built as a **5-set creative matrix** (A real-people · B graphic · C proof · D meme · E niche). The deliverable is the numbered PNGs + a copy bank — no video. Derived from `sotaocr-fb-001` (32 creatives for an OCR dev-tool, white-bg + blue shadcn brand).

- **Kind:** vibe-style — the recipe IS the deliverable. No HyperFrames composition; the output is the PNG pack + `ads-copy.md`.
- **Category:** b2b-saas (a dev-tool / SaaS startup driving cold traffic).
- **Format:** fb-creative. **Aspect:** 4:5, 1080×1350. **Count:** 8-32 creatives (source: 32).

## How to use

```bash
ralphy template use dev-tool-fb-creative-pack --project <new-project-id> --brief "<brand + site URL + key numbers + which sets>"
```

There is no render/compose stage — the creatives ARE the deliverable. Run the pipeline in `composition.md`.

## Required inputs (slots)

| Slot | Required | What |
|---|---|---|
| `brand_name` | yes | The brand / product name. |
| `site_url` | yes | The live site to ground against (CSS palette + hero screenshot source). |
| `palette` | yes | Brand HEX tokens pulled from the site CSS (not from memory). |
| `hero_ref` | yes | Playwright hero screenshot, passed as `--ref` on EVERY gen. |
| `key_numbers` | yes | The hard lander numbers (accuracy %, price, speed) that anchor the headlines. |
| `api_surface` | yes | The documented API shape (curl / SDK / GUI) — code creatives show what the site documents. |
| `sets` | no | Which of the 5 sets to run (default all 5). |
| `creative_count` | no | Total creatives (source: 32). |

## Files

| File | What's in it |
|---|---|
| `composition.md` | Site-grounding pre-flight, the 5-set matrix, the true-parallel batch shape, the deliverable layout. Read this first. |
| `prompt-cookbook.md` | Per-set prompt formulas (testimonial portrait, strikethrough price stack, bar chart, code card, meme header) — all with `{{slots}}`. |
| `model-stack.md` | Model picks, cost ballpark, the concurrency-myth correction, what to avoid. |

## Cost ballpark

**~$8.0** for a 32-pack (gpt-5.4-image-2 at $0.20/creative + a small site-grounding/probe reserve); **~$6.4** if site-grounded from turn 1. The source spent $8.00 — $1.20 was a wrong-palette v1 burn the curl-the-CSS pre-flight eliminates.

## Key rules (each cost money or time in the source project)

1. **Curl the site CSS + Playwright-screenshot the hero BEFORE drafting brand-DNA** (AGENTS.md #15). Invented palette cost a $1.20 v1 re-render.
2. **Pass the hero screenshot as `--ref` on every gen** — drift across 32 concepts → zero.
3. **Verify every named API symbol against the site/docs before rendering code — or fall back to curl.** 5/32 creatives showed an invented `import <brand>` SDK.
4. **Probe stale concurrency memory before architecting around it** — the 1-concurrent cap is a myth.
5. **Run TRUE parallel via `for slot; do ralphy generate image ... & done; wait`** (~9× vs serial; the queue daemon was idle).
6. **Marketing-punchy voice anchored on hard lander numbers beats generic dev-tool copy.**
7. **The 5-set matrix (A real-people · B typography · C proof · D meme · E niche) is the scaffold for 30+ packs.**
8. **Append-only auto-versioning rescues a killed v1 batch — never `--force-overwrite` on regen.**

## Do not copy literally

The source brand, its white+blue palette, and exact copy are one-off. Reuse the METHOD: site-grounding first, hero-as-`--ref`, the 5-set matrix, the per-set formulas, verify-the-API-before-code, true-parallel batching, number-first copy. Supply your own brand + URL + numbers.
