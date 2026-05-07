# Brand Story — TEMPLATE.md

> Longer-form cinematic brand narrative. The tonal opposite of fast-cut UGC.
> 30-60s default; 60-120s for hero films; 15-30s social cut-downs.
> 16:9 for website-hero / YouTube / investor decks; 9:16 vertical for LinkedIn / Reels social cuts.

---

## Why this template exists

Most templates in this pack chase a hook and a sale in 15 seconds. A brand story does the opposite job: it earns trust over a longer arc so the *next* fifteen-second ad lands.

It is the only template in the pack designed to be **watched intentionally** — not thumb-scrolled. That changes everything: pacing slows, voiceover gets sparser, and visual beauty must serve narrative purpose, not stop the scroll.

A good brand story makes one belief stick: *who you are, why you exist, what changes because of you.*

---

## Anchors (the things that always do work in this template)

1. **Founder voice or customer voice — not corporate voice.**
   The narration is a real human reflecting in their own language. No broadcast voice. No "leveraging synergies." If the founder speaks Russian, the founder speaks Russian.
2. **Mission made visible, not stated.**
   If the brand claims "community," show somebody choosing connection over profit. If it claims "craftsmanship," show the failed iteration that got discarded. Values are revealed through behavior, never through claims on a screen.
3. **Transformation arc.**
   Something must change between minute zero and minute one — a person, a problem, a possibility. Without change you have a slideshow.
4. **Authentic detail.**
   Coffee stains, worn tools, the weathered edge of an apron, the messy whiteboard. Imperfection is the credibility budget.
5. **End on emotion, not on logo.**
   The brand mark is a coda, not the climax. Emotional resonance must linger before branding appears.

---

## Variation axes

- **Narrative arc** — founder-led origin / customer transformation / mission manifesto / day-in-the-life / behind-the-scenes / milestone (anniversary, "10 years of") / community spotlight / future vision.
- **Emotional register** — inspirational, warm-nostalgic, bold-rebellious, calm-trustworthy, playful, serious-professional. Pick *one* and hold it.
- **Narration mode** — founder VO / customer testimony / poetic philosophical / sparse strategic / pure visual no-VO / dialogue-as-narrative.
- **Duration tier** — 30s social, 60s hero (default), 90-120s long-form film.
- **Industry framing** — tech-startup, artisan-food, sustainable-fashion, health-wellness, creative-agency, nonprofit, manufacturing, education. Each has its own visual code (see prompt-cookbook.md).

---

## Narrative arc (the structure that always holds)

A 60s brand story decomposes into seven beats. Adjust durations proportionally for 30s or 90s.

| # | Beat | Approx. duration | Job |
|---|---|---|---|
| 1 | **Hook** | 0-2s | Stop the scroll without revealing the brand. Sensory, intimate, specific. |
| 2 | **Setup / world** | 2-8s | Where are we? Who is this person? What does the world feel like? |
| 3 | **Inciting moment** | 8-15s | The problem, the realization, the friction that mattered. |
| 4 | **Emergence montage** | 15-30s | How the brand / approach / solution came to be. Hands, faces, small wins, iteration. |
| 5 | **Transformation** | 30-45s | What is different now? Show concrete change in authentic context. |
| 6 | **Closing reflection** | 45-55s | Return to the protagonist, now changed. Quiet realization, one final line. |
| 7 | **Brand signature** | 55-60s | Logo and tagline — understated, no hard sell. |

**Pacing rule.** Hold shots longer than your instinct says. Cinematic register rewards the held face, the breath, the silence-before-the-line. If you can cut a clip from 5s to 3s and still feel the moment, fine — but never machine-gun cuts. That fights the genre.

**Music shape.** One track, four phases: sparse → build → swell → resolve. The swell hits at the transformation beat. The resolve holds under the closing reflection. Cross-fade only if you genuinely need a second track (rare).

---

## Required inputs (reference-required gate)

This template **refuses generation without reference material.** At minimum:

- **Logo** — vector or high-res PNG, transparent background.
- **One founder / team / customer face** — photo of the actual human whose voice carries the story. AI-improvised faces in brand-story context read instantly as fake and collapse the whole arc.
- *Optional but recommended* — archive footage, product photo, environment shot (workshop, kitchen, office, factory floor), brand color palette, brand typography.

If the user has none of these, do not generate. Ask once, concretely, for the missing piece. The user can override with explicit "generate without reference, I understand the quality will be worse" and we log it as `stage: "no-ref-consent"` — but this template degrades harder than most when that override fires, because the whole genre depends on perceived authenticity.

---

## Voice guidance

- **Founder mode.** Conversational. Specific. Memories. "I remember the first time…" beats "Our company was founded in…". Record once, casually, then pick the take that breathes.
- **Customer mode.** Interview cadence. Mid-thought entry. Specific moment of change. ("It wasn't the first session. It was the seventh.")
- **No-VO mode.** Music and sound design carry the emotional spine. Hardest mode, often the strongest. Specify silence intentionally: "silent moment here for emotional weight."

Whatever mode you pick: cut the script in half before recording, and again before mixing. Brand stories die from over-narration.

---

## When NOT to use this template

- **You need conversion, fast.** Use `before-after-product` or any 15s UGC pattern. Brand story is trust-build, not click-through.
- **You don't have a real human to anchor it.** No founder photo, no team, no real customer? Either use a manifesto-style no-VO variant with brand-environment footage, or pick a different template.
- **You are selling a single SKU.** Brand stories are about brand, not product. A product film is a different genre.
- **The brand is less than 6 months old and has no story yet.** Forcing an "origin story" before there is one reads as performative. Use a future-vision arc instead, or wait.
- **The user wants TikTok-native energy.** Brand story can run on TikTok, but it requires a punchy opening cut-down (use the social-30s tier) and even then will under-perform native UGC formats on that platform. LinkedIn, YouTube, website hero, investor deck — that's the home turf.

---

## Output expectations

A finished brand story produces:

- **Master MP4** — 30-60s, 16:9 1920x1080 (or 9:16 1080x1920 for vertical social cut).
- **Social cut-down** — optional 15s vertical cut from the 60s master.
- **Captions** — `.srt` (minimal style burned-in for muted-autoplay surfaces).
- **Hero still** — single most powerful frame, exported full-res for thumbnails / press.
- **Audio stems** — VO, music, ambient — kept separate so the user can rebalance later without re-rendering.

Render via `ralphy render <project>`. Do not hand-roll ffmpeg.
