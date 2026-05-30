# dev-tool-fb-creative-pack

An N-creative (typically 30+) static Facebook / Meta / IG ad pack for a SaaS / dev-tool startup, built as a **5-set creative matrix**. The deliverable is the set of numbered PNGs + a copy bank — no video. Source: `workspace/projects/sotaocr-fb-001/` (32 creatives for an OCR/dev-tool, white-bg + blue shadcn brand, 5 sets across 8 ad-sets).

**Kind:** vibe-style (the recipe is the deliverable — there is no HyperFrames composition; the output is the PNG pack + `ads-copy.md`).
**Category:** b2b-saas (a dev-tool / SaaS startup driving cold FB/IG traffic).
**Format:** fb-creative.
**Aspect:** 4:5, 1080×1350 (also cut 1:1 / 9:16 from the same matrix if needed).
**Count:** 8-32 creatives (source: 32).
**Output:** numbered PNGs + `ads-copy.md` + `README.md` index.

## How to use

```bash
ralphy template use dev-tool-fb-creative-pack \
  --project <new-project-id> \
  --brief "<brand + site URL + key numbers + which sets>"
```

Then run the pipeline in `composition.md`. There is no render/compose stage — the creatives ARE the deliverable.

## Files

| File | What's in it |
|---|---|
| `composition.md` | The site-grounding pre-flight, the 5-set matrix, the true-parallel batch shape, the deliverable layout. Read this first. |
| `prompt-cookbook.md` | The per-set prompt formulas (testimonial portrait, strikethrough price stack, bar chart, code card, meme header) — all with `{{slots}}`. |
| `model-stack.md` | Model picks + cost ballpark + the concurrency-myth correction + what to avoid. |

## Heavy assets

No assets are committed here — every remix pulls its OWN brand's live-site palette + hero screenshot. That site-grounding step is the whole point of the format. If a brand's locked assets prove reusable across multiple packs, they live in `ralphy-assets/pool/<brand-slug>/`.

## Cost ballpark

**~$8.0** for a 32-pack (gpt-5.4-image-2 at $0.20/creative + a small site-grounding/probe reserve). **~$6.4** if site-grounded from turn 1 (32 × $0.20). The source spent $8.00 — $1.20 of that was a wrong-palette v1 burn (invented dark+orange DNA for a white+blue site) that the curl-the-CSS pre-flight eliminates. Budget `$0.20/creative × N + ~$0.40` for probes/re-rolls; add ~$2 for 1:1 + 9:16 cuts of the same matrix.

## Key rules (each cost money or time in the source project)

1. **Curl the site CSS + Playwright-screenshot the hero BEFORE drafting brand-DNA — never sketch palette from memory.** The source invented deep-black `#0A0A0F` + orange for a site that is actually white-bg + blue `#3B82F6`; v1 of 6 creatives ($1.20 + ~12 min) had to be re-rendered. Turn 1 ends with `curl <url> | rg -o '#[0-9a-fA-F]{6}'` + a hero screenshot. (AGENTS.md invariant #15 — dispatch the site-grounding crawl.)
2. **Pass the live-site hero screenshot as `--ref` on every gen.** Once `refs/hero.png` was passed via `--ref` on all 32 gens, palette + type drift across distinct concepts dropped to zero. Without it, each prompt re-interprets "blue CTA" slightly differently; at 32 concepts drift compounds.
3. **Verify every named API symbol against the site/docs BEFORE rendering code — or fall back to curl.** The source rendered `import sotaocr` / `sotaocr.parse(pdf)` in 5/32 creatives, but the brand only documents a REST `curl` API — the Python SDK was invented from a training prior ("dev tool → must ship a Python SDK"). The hero screenshot literally showed the real curl shape and was ignored. Curl is the strictly-safe fallback for code-creative when SDK existence is unverified.
4. **Test stale-looking concurrency memory before architecting around it.** Memory said `gpt-5.4-image-2` is capped at 1 concurrent. A 2× parallel probe ($0.40) disproved it; 9- and 23-parallel batches then ran with no 403/429. Probe with 2 cheap gens BEFORE designing a serial batch — believing the stale cap would have cost ~25 min on batch 2 alone.
5. **N-creative packs run in TRUE parallel via `for slot; do ralphy generate image ... & done; wait`.** The `ralphy queue` daemon was idle with 13 pending jobs (running:0). The hand-rolled `&`-parallel loop ran 23 concurrent in 4.2 min wall-clock vs ~70 min serial (~9× speedup).
6. **Marketing-punchy voice anchored on hard numbers beats generic dev-tool copy for cold traffic.** The headlines that landed all anchor a specific lander number ("$0.003 — 5× cheaper. 13 points more accurate."). Anchor on landing-page numbers in the first turn.
7. **The 5-set matrix (A real-people · B typography · C proof · D meme · E niche) is the right scaffold for 30+ packs.** It gives Ads-Manager room for 8 ad-sets without internal duplication. "Different scenarios, same message" maps 1:1 onto this matrix.
8. **Append-only auto-versioning rescues a killed v1 batch.** Re-rendered creatives preserved the dark-bg originals as `*.v1.png` automatically — recoverable as A/B reference. Never pass `--force-overwrite` on regen.

## Do not copy literally

The source brand (an OCR dev-tool), its white+blue palette, and its exact copy are one-off. Reuse the METHOD: site-grounding first, hero-as-`--ref` on every gen, the 5-set matrix, the per-set prompt formulas, verify-the-API-before-showing-code, true-parallel batching, number-first copy. Supply your own brand + URL + numbers.
