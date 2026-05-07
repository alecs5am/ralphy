# Tier List — prompt cookbook

Concrete recipes for the gemini-3-pro item icons, the Remotion grid composition, the optional kling i2v hook intro, the ElevenLabs VO and music. Every recipe is opinion-as-content first, search-friendly second, controversy-engineered third.

> **The grid is built in Remotion, not generated.** This file describes the icons that go INTO the grid and the audio/VO that goes OVER it. The grid component itself lives in `src/lib/` and is composed with `<TierGrid />` + `<TierItem />` props. Don't ever try to i2v the whole tier list — it'll look mushy.

---

## Master prompt template (per-item icon)

The unit of generation is **one item icon** that drops into a slot. All icons in one tier list MUST share style — pick one and lock it across the batch.

```
[STYLE LOCK] Flat 2D illustration, bold outlines, single solid background color (#F5F5F0 off-white), 
centered subject, no shadows, square framing, no text, no logos.
[SUBJECT] {item-name} {item-descriptor}
[RENDER] 1024×1024, transparent or flat background, isolated subject occupying ~70% of frame.
[CONSISTENCY] Same illustration style as items: {prior-item-1}, {prior-item-2}.
```

Three style locks to choose from per tier list (pick ONE, never mix):

1. **Flat illustration** — `Flat 2D illustration, bold outlines, single solid pastel background, no shadows, no text.` Best for generic categories (foods, habits, abstract concepts).
2. **Photo cutout** — `Photographic studio shot, isolated on white background, soft top light, no props, no text overlay.` Best for products, branded packaging.
3. **Logo chip** — `Vector logo on a flat colored chip, bold sans-serif wordmark, geometric badge, single accent color.` Best for brands, apps, services where the user supplies the logo.

---

## Tier grid layout vocabulary (Remotion)

The Remotion `<TierGrid />` component owns these props. This is shared design language, not flexibility — deviating breaks legibility.

| Prop | Spec |
|---|---|
| Tier rows | 3, 4, or 5. Default 4 (S/A/B/C). Use 5 only for ≥8 items. |
| Tier colors | S=`#FF3B30` red · A=`#FF9500` orange · B=`#FFCC00` yellow · C=`#34C759` green · D=`#007AFF` blue |
| Tier label font | Bold sans (Inter Black or similar), 96pt, white text on colored row, left-aligned |
| Row height | 280px (1080×1920 canvas) |
| Item slot | 200×200px, 24px gap, max 6 items per row |
| Item icon | 180×180px inside slot, centered |
| Reason overlay | 56pt, white on semi-transparent black bar, appears 0.4s after item lands, holds 2.5s |
| Background | `#0A0A0A` near-black, subtle radial gradient, no decoration |
| Title card | 0-2s, "RANKING [X]" 120pt bold, full bleed, fades to 30% opacity behind grid |

## Item-pop animation pattern

The single most important micro-pattern in the format. Each item lands like this:

```
0.0s   item enters from off-screen-left at scale 1.4, opacity 0
0.0s   audio cue: short "whoosh" SFX (200ms), then "pop" SFX on impact
0.3s   item arrives at slot, spring overshoot to scale 1.1
0.4s   settles to scale 1.0, opacity 1
0.4s   destination tier row glows (white outer glow, opacity 0→0.6→0)
0.7s   row glow fades
0.4s   reason overlay slides up from bottom of slot
2.9s   reason overlay holds
3.4s   next item starts
```

Spring config: `{ damping: 12, stiffness: 180, mass: 1 }`. Springs that are too stiff feel mechanical; too loose feels uncertain. This config is tuned.

---

## VO pacing

One narrator throughout. Pacing is item-locked:

| Beat | Duration | VO content |
|---|---|---|
| Setup | 2s | Hook line (see `hooks.md`) |
| Per item | 3-5s | One-line opinion: "[item] is [tier] because [reason]." Keep under 12 words. |
| Pause before final | 0.5s | Beat of silence. Builds anticipation for the controversial pick. |
| Final pick | 5-7s | Setup + reveal + bait. "And I'm putting [item] in [tier]. Yeah, you heard me." |
| Outro | 2-3s | "Fight me in comments" / "What's your S-tier?" / "Tell me I'm wrong." |

**Tone.** Confident, declarative, slightly fast (1.05× default speed in ElevenLabs). Snarky tone uses dry deadpan; serious tone uses measured, not theatrical.

**ElevenLabs settings.**
- `stability: 0.4` — lets emotion vary across items.
- `similarity_boost: 0.75`
- `style: 0.35` for snarky, `0.15` for serious-analytical.
- `use_speaker_boost: true`.

---

## Music direction

One track. Single track is correct here — the grid IS the visual rhythm; layered music tracks fight the per-item beats.

**ElevenLabs Music prompt template:**

```
A {genre} instrumental beat, {bpm} BPM, steady rhythm with subtle build over 60 seconds. 
Starts minimal (kick + hi-hat + soft synth pad), gradually adds {layer-1} at 30s and {layer-2} at 50s, 
peaks at 55-60s. Confident, analytical mood. No vocals. Loop-friendly.
```

Genre / BPM presets:

- **Snarky / shitposty** → "lo-fi hip hop with crisp drums" at 90 BPM. Layer-1: bass arpeggio. Layer-2: filter sweep.
- **Serious / analytical** → "minimal electronic" at 110 BPM. Layer-1: sub bass. Layer-2: arpeggiated lead.
- **Earnest / fan-energy** → "uplifting synthwave" at 105 BPM. Layer-1: pad chord stabs. Layer-2: lead synth.
- **Chaotic** → "hyperpop instrumental" at 140 BPM. Layer-1: pitched 808s. Layer-2: glitchy cuts.

Music ducks -8dB when VO is active. Item-pop SFX punches through at full level (the audio cue must register).

---

## Common mistakes (8)

1. **Tier grid too cluttered.** >6 items per row OR >5 tiers OR text labels under each item kills legibility. Cap items per row at 6, use 4 tiers by default, never label items with text under the icon — the icon IS the label.
2. **Items too small to read on mobile.** If the icon is below 180px on the 1080×1920 canvas, viewers on a phone can't tell what it is. Test by viewing the render on a phone, not your laptop.
3. **Controversial pick that's not actually controversial.** "Pizza in A-tier" isn't a hot take. The final pick must genuinely upset a real fanbase — beloved fan favorite in D-tier, meme entry in S-tier, the obvious-best pick downgraded. If your test audience shrugs, the format failed.
4. **Mixed icon styles.** Some flat illustrations + some logo chips + some photos = Frankenstein grid. Lock one style across the whole list. Re-generate the outliers if needed.
5. **No audio cue on item pop.** Visually the item arrives but it feels weightless. The whoosh/pop SFX is what makes the format land. Don't skip.
6. **Cutting away from the grid.** The grid is the spine of the video — viewers want to see what's coming. Don't cut to B-roll between items, don't fade the grid out for a talking head, don't transition to a different scene. Hold the grid the whole time.
7. **Reasons that are essays.** The reason overlay is ≤12 words. "Because the gameplay loop is unmatched and the soundtrack hits" is too long. "Goated soundtrack." or "Combat is mid." — done.
8. **No final-pick pause.** Going straight from item 7 to item 8 (the controversial one) at the same cadence buries the moment. Insert a 0.5s pause + a music swell before the final pick.

---

## Worked example 1 — Anime power scaling tier list

**Brief.** "Rank top anime characters by raw power." 8 items, snarky tone, S/A/B/C tiers, 60s.

**Items + assignments (the controversial pick is in italics).**
- S: Saitama, Goku
- A: Naruto (Baryon), Tanjiro (Sun-Breathing)
- B: Luffy (Gear 5)
- C: *Sasuke (six paths)* ← controversial: fans put him S-tier
- C: Ichigo (final form)
- D: *Light Yagami* ← controversial meme entry: "he's just a guy with a notebook"

**Hook (pattern #2 from hooks.md).** "Anime power scaling tier list. This is gonna piss people off."

**Per-item VO examples.** "Saitama. S. He punched the universe." · "Sasuke goes in C. The plot carried him." · "Light Yagami in D. He's just a guy with a notebook."

**Icon prompt (per item).** Flat 2D illustration style lock. Each character: head-and-shoulders portrait, signature outfit visible, no background detail.

**Music.** Lo-fi hip hop, 90 BPM, snarky preset.

**Outro.** "Tell me Sasuke deserves better. Comments are open."

---

## Worked example 2 — Fast-food chains tier list

**Brief.** "Rank major US fast-food chains." 10 items, serious-analytical tone, S/A/B/C/D, 75s.

**Items + assignments.**
- S: In-N-Out, Chick-fil-A
- A: Five Guys, Popeyes
- B: McDonald's, Wendy's
- C: Burger King, Taco Bell
- D: *Subway* ← controversial: was once beloved, the downgrade is the hot take
- D: Quiznos (meme bonus entry)

**Hook (pattern #11).** "I ate at 10 chains this week. Tier list time."

**Reference policy.** User supplies brand logos. Style lock: logo chip on flat colored badge.

**Per-item VO examples.** "In-N-Out. S. Animal-style is a religion." · "McDonald's. B. The fries carry a bad burger." · "Subway. D. Bread can't be cake."

**Music.** Minimal electronic, 110 BPM, analytical preset.

**Outro.** "Subway D-tier. Yeah I said it."

---

## Worked example 3 — Dating apps tier list

**Brief.** "Rank dating apps by actual dating outcomes." 6 items, snarky tone, S/A/B/C, 45s.

**Items + assignments.**
- S: Hinge
- A: Bumble
- B: Tinder
- C: Match
- C: *Raya* ← controversial: "everyone wants this in S, it's actually mid"
- D: Plenty of Fish

**Hook (pattern #5).** "Dating apps tier list. Fight me."

**Reference policy.** User supplies app icons. Style lock: app icon as logo chip.

**Per-item VO examples.** "Hinge. S. Designed to be deleted, and it works." · "Tinder. B. It's a vibe-check, not a dating app." · "Raya. C. Pay $10 a month to match with people who don't reply."

**Music.** Lo-fi hip hop, 90 BPM, snarky preset.

**Outro.** "Raya in C. Come fight me."

---

## Worked example 4 — AI tools tier list

**Brief.** "Rank current AI tools for content creators." 8 items, serious-analytical tone, S/A/B/C, 60s. Search-evergreen play for the "AI tools 2026" query.

**Items + assignments.**
- S: Claude, gemini-3-pro
- A: Suno, ElevenLabs
- B: Runway, Pika
- C: *Midjourney* ← controversial: "still A in fan canon, but it's behind now"
- D: ChatGPT-3.5-era tools (any holdovers)

**Hook (pattern #8).** "Ranking every AI tool in 2026."

**Reference policy.** User supplies product logos.

**Per-item VO examples.** "Claude. S. Best at long-context reasoning, full stop." · "Midjourney. C. Hurts to say. The lead evaporated in 2025." · "ChatGPT-3.5. D. We've moved on."

**Music.** Minimal electronic, 110 BPM, analytical preset.

**Outro.** "Midjourney in C. Tell me I'm wrong."

---

## Quick checklist before render

- [ ] All item icons share ONE style lock (flat / photo / logo chip).
- [ ] Item icon size ≥ 180px on 1080×1920 canvas.
- [ ] Tier label ≥ 96pt, reason overlay ≥ 56pt.
- [ ] Audio cue (whoosh + pop) on every item drop.
- [ ] Tier row glow fires on item arrival.
- [ ] Controversial pick is genuinely controversial (test on a real fan).
- [ ] 0.5s pause + music swell before the final pick.
- [ ] Outro line invites comments explicitly.
- [ ] Title indexable for "[category] 2026" or "ranking [niche]" search.
- [ ] Grid never cuts away — held the entire video.
