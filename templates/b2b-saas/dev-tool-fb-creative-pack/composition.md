# composition — dev-tool-fb-creative-pack

There is no video composition. The deliverable is the **numbered PNG pack + `ads-copy.md`** itself. This file captures the site-grounding pre-flight, the 5-set matrix, and the true-parallel batch shape — the durable parts of the source project, generalized off the one-off brand.

## Slots

```
{{brand_name}}      — the brand / product name
{{site_url}}        — the live site to ground against (CSS + hero screenshot source)
{{palette}}         — brand HEX tokens pulled from the site CSS (NOT from memory):
                      CTA color, win-color (the "we win" highlight), ink, bg
{{hero_ref}}        — Playwright hero screenshot of the live site, passed as
                      --ref on EVERY gen for brand consistency
{{key_numbers}}     — the hard lander numbers (accuracy %, price, speed) that
                      anchor the punchy headlines
{{api_surface}}     — the DOCUMENTED API shape (curl / SDK / GUI). Code creatives
                      MUST show this, not an invented SDK
{{sets}}            — which of the 5 sets to run (default all 5)
{{creative_count}}  — total creatives (source: 32)
```

## The 5-set creative matrix (the scaffold)

```
Set A — REAL PEOPLE     photoreal testimonial / lifestyle / over-the-shoulder portraits.
                        Diverse personas. Anchors on a named human + a pull-quote.
Set B — GRAPHIC         typography posters, big-number heroes, strikethrough price
                        stacks, language grids. Pure layout + the {{key_numbers}}.
Set C — PROOF           data-viz: horizontal bar charts, before/after, dashboards,
                        code cards, API-flow diagrams.
Set D — MEME            wojak / drake / twitter-mock / slack-chat / distracted-bf
                        formats. In-group dev humor.
Set E — NICHE           audience-specific hooks (RAG-stack, weekend-ship, credits).
```

32 creatives across these 5 registers gives Ads-Manager room for ~8 ad-sets without internal duplication. "Different scenarios, same message" maps 1:1 onto this matrix.

## Pipeline (from scratch)

```
1. Discovery + site-grounding         (5-8 min)   ← the load-bearing pre-flight
   - bun run cli/index.ts             # load user-profile band -> tune intake
   - WebFetch {{site_url}}            # product, audience, key numbers
   - curl {{site_url}} | rg -o '#[0-9a-fA-F]{6}' | sort -u   -> {{palette}}
   - Playwright hero + full screenshot -> refs/hero.png ({{hero_ref}})
   - List the DOCUMENTED API surfaces (curl / SDK / GUI) -> {{api_surface}}
   (Per AGENTS.md #15 — dispatch the site-grounding sub-agent crawl.)

2. Intake (3 questions max)            (1 min)
   - which sets · real people via gen-or-ref · voice register

3. Brand-DNA lock                      (3 min)
   - brand-dna.md with the REAL {{palette}} hex values from step 1
   - palette, type, CTA color, win-color, tone — based on the actual site

4. Concept matrix                      (5 min)
   - Draft the 5-set scaffold; pick the specific {{creative_count}} concepts.

5. Prompt scaffold                     (10 min)
   - prompts/<slot>.txt per concept; each cites {{palette}} hex verbatim + ban negatives.
   - Code creatives use {{api_surface}} — curl if the SDK is unverified.

6. Generate                            (4-5 min, TRUE PARALLEL)
   - for slot in $SLOTS; do
        ralphy generate image --project <id> --slot $slot \
          --model openai/gpt-5.4-image-2 --size 1080x1350 \
          --ref {{hero_ref}} --prompt "$(cat prompts/$slot.txt)" & ; done
   - wait

7. Review + iterate                    (5 min)
   - Read all PNGs inline; re-roll only mis-rendered slots (not the whole batch).

8. Deliverable                         (5 min)
   - final/ with numbered prefix (01-a1-... .png)
   - ads-copy.md (primary text · headline · description · CTA × N)
   - README.md with concept-by-concept table + ad-set grouping
```

## Site-grounding (the $1.20 lesson)

Never sketch brand-DNA from memory. The source invented a deep-black + orange palette for a site that is actually white-bg + blue `#3B82F6` — v1 of 6 creatives had to be re-rendered. Turn 1 ALWAYS ends with: real hex from the CSS (`curl | rg -o '#[0-9a-fA-F]{6}'`), a Playwright hero screenshot, and a list of the documented API surfaces. All of that lands in `brand-dna.md` and `refs/` before any prompt is written.

## The hero-as-`--ref` rule (brand consistency at scale)

Pass `{{hero_ref}}` as `--ref` on EVERY gen. Across 30+ distinct concepts this is what holds the palette + type. Without it, each prompt re-interprets "blue CTA" slightly differently and the drift compounds into a pack that doesn't read as one brand.

## Verify the API before showing code (the silent-leak lesson)

Before rendering ANY code snippet, verify the named symbols exist on the site/docs. The source rendered `import {{brand_name}}` / `{{brand_name}}.parse(...)` in 5/32 creatives, but the brand only documents a REST `curl` API — the SDK was invented from a training prior. A `pip install` clicker hits nothing and bounces: a CTR-without-conversion leak AB-testing won't surface for a week. **Curl is the strictly-safe fallback** — it always exists for an HTTP API.

## True-parallel batching (the 9× lesson)

The `ralphy queue` daemon sat idle with 13 pending jobs (running:0). Hand-roll the parallel loop instead:

```bash
for slot in $SLOTS; do
  ralphy generate image --project <id> --slot "$slot" \
    --model openai/gpt-5.4-image-2 --size 1080x1350 \
    --ref refs/hero.png --prompt "$(cat prompts/$slot.txt)" &
done
wait
```

23 concurrent ran in 4.2 min wall-clock vs ~70 min serial. The "1 concurrent per key" memory for gpt-5.4-image-2 is stale — probe it with 2 cheap gens, don't architect a serial loop around it.

## Deliverable layout (source)

```
final/
├── 01-a1-pain-face.png … 32-e3-weekend-ship.png   (N PNGs, numbered)
├── README.md                                       (index + brand-DNA + ad-set grouping)
└── ads-copy.md                                     (N× primary text + headline + description + CTA)
```

`ads-copy.md` carries four blocks per creative ready to paste into Ads Manager: primary text (~125 chars before "See more"), headline (≤27 chars hard), description (≤27 chars), CTA button (from FB's enum). Number-first hooks; in-group dev language.
