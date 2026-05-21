# Blog article: ralphy-vs-higgsfield pricing math is invented

> **Status:** open — needs review pass before the article is linked anywhere external
> **Filed:** 2026-05-21
> **Folder:** issues
> **File:** `landing/content/blog/ralphy-vs-higgsfield.mdx`

## What's wrong

The "Worked example" section, the `<BarStats>`, and the `<PriceHero>` claim a
Ralphy reel costs **~$0.70-$0.74** in pass-through OpenRouter + ElevenLabs
charges. That number is fabricated. It came out of an early draft estimate
and was never reconciled against actual provider pricing.

Real Kling 3.0 pricing is approximately **$0.30 per second of output**. A
realistic vertical reel (2 scenes × 15s, or 6 scenes × 5s = 30s total) is
therefore **~$9 just for the video layer**, before image refs, voice, music,
and any regens.

So:

- `<PriceHero value="$0.74" unit="/reel" note="median across 4,800 renders" />`
  — invented number, invented sample size.
- `<BarStats>` line `<b>Ralphy</b> · cost per reel — $0.70` — same fabrication.
- `<PricingTable>` row "10 reels (~6 scenes each) → ~$7" — should be roughly
  **$90-$120** with real Kling 3.0 pricing.
- `<Callout title="What a reel actually costs">` "$0.40-$1.20 in pass-through"
  — wrong by an order of magnitude.

## Why this matters

The whole article's economic argument is "Ralphy is 2-6× cheaper than
Higgsfield". With real numbers Ralphy may actually be more expensive at low
volume (you're paying full Kling rates instead of Higgsfield's bulk-buy
credit math), and only catches up at high volume — if at all.

Plausibly the honest pitch is **not "cheaper", it's "transparent + auditable
+ no expiring credits"**. The article needs to be reframed so cost isn't the
headline differentiator.

## Action items

1. **Pull real provider pricing**:
   - Kling 3.0 via wavespeed / fal.ai (per-second, by resolution)
   - Seedance 2.0 per-second
   - Veo 3 per-second
   - gpt-image-2 per image (currently ~$0.04?)
   - ElevenLabs v3 voice per 1k chars
   - ElevenLabs Music per generation
2. **Compute the actual cost** for the canonical "6-scene 9:16 reel" example.
   Show the breakdown (5 image refs + 6 video segments + 30s VO + 30s music).
3. **Redo the Higgsfield credit math** with the real reel — how many credits
   does it cost on Plus vs Ultra? Is the 7-credits-per-Kling-3.0 estimate
   right? Verify against their pricing page.
4. **Update `<PricingTable>` rows** for 10/25/60/100 reels with realistic
   side-by-side numbers.
5. **Update `<BarStats>` and `<PriceHero>`** with the new cost-per-reel.
6. **Re-anchor the lede + StatRow** if cost-per-reel turns out not to favour
   Ralphy at low volumes. The real differentiator is probably the audit log,
   the credit-expiry trap, and the no-platform-fee structure — not raw $/reel.
7. **Re-read the Callouts** — "What a reel actually costs" needs concrete,
   honest numbers or it should be cut.

## Adjacent risk

The "4,800 renders" sample size claim in `<PriceHero>` is also invented. Any
such "we've shipped N reels" anchor needs to come from a real source (or be
removed). Right now it's a confidence-grab with no backing.

## Disposition

Article is currently published at `/blog/ralphy-vs-higgsfield`. It should
**not** be linked from external posts (X, LinkedIn, Discord) until this is
fixed. Internal landing nav linking to it is fine for now — most readers
won't audit the math, but anyone who does will find it shaky.
