# Hooks — ai-avatar

12 opens an AI presenter can deliver in the first 0-3 seconds. Each one is tuned for lip-sync legibility — Kling Avatar v2 and veo-3.1-fast lock cleanly on consonant-forward, mid-tempo speech with at least one stressed syllable in the first second. Hooks designed for screaming, whispering, or rapid-fire delivery break lip-sync and read as fake. Pick the hook, then write the rest of the script around the tone it sets.

> **Reminder.** No hook works without a stable persona. Generate the keyframe once and reuse. If the avatar's eyes wander between scenes, the smartest hook in the world reads as deepfake. See `prompt-cookbook.md → "Avatar prompt design"`.

## 1. The "stop everything" gate

> "If you're a [niche], stop everything you're doing right now."

- **Setup.** Direct address. Avatar holds eye contact, slight head-tilt forward.
- **Why.** Pattern interrupt + niche call-out filters non-buyers in the first 1.5s. Algorithm reward: high completion rate from the right audience.
- **Ideal niche.** B2B SaaS, productivity tools, finance, e-commerce.
- **Lip-sync emphasis.** Stress on "stop" (hard plosive, lip-sync model loves it) and "right now" (consonant cluster). Avoid: "Hey guys" — too soft, mouth shape ambiguous.

## 2. The tested-N counter

> "I tested [N] [products / tools / hacks] so you don't have to."

- **Setup.** Avatar slightly amused, tone of authority. Optional: hold up a number with fingers (only if the avatar's hands stay in frame consistently — veo-3.1-fast sometimes loses hand stability, prefer no hand if generating < 3 episodes).
- **Why.** Promises a payoff (the winner) without revealing it. Open loop.
- **Ideal niche.** Product reviews, tool roundups, e-commerce affiliate.
- **Lip-sync emphasis.** Numbers are great for lip-sync — "twelve", "thirty", "a hundred" all have clean mouth shapes. Stress the number, then pause 200ms before "so you don't have to".

## 3. The contrarian reframe

> "Here's why your [common assumption] is actually wrong."

- **Setup.** Avatar leaning slightly back, calm authority. NOT confrontational — that reads as bait.
- **Why.** Curiosity gap + identity tension. Viewers can't help but check whether they hold the wrong assumption.
- **Ideal niche.** Education, finance, health-adjacent (NOT direct medical), career advice.
- **Lip-sync emphasis.** "Wrong" is a key word — round vowel + hard consonant ending. Stress it. The "actually" before it gives veo-3.1-fast enough lead-in to lock the mouth shape.

## 4. The saved-me-X claim

> "This [tool / hack / product] saved me [time / money] last month."

- **Setup.** Avatar cheerful, slightly surprised — "I can't believe this either". Soft smile.
- **Why.** Specific personal stake. The audience accepts the claim if the number is concrete (not "tons of money" — that reads as ad).
- **Ideal niche.** Productivity, finance, household, parenting.
- **Lip-sync emphasis.** Round numbers ("$300", "twelve hours") are clean. Avoid "$347.83" — too many syllables, lip-sync drifts. Stress the noun ("money", "time") not the verb.

## 5. The "three things I wish" hook

> "Three things I wish I knew about [X] before I started."

- **Setup.** Direct, slightly rueful tone — "let me save you the lessons I paid for".
- **Why.** Listicle promise + parasocial empathy. Listicle structure is what `tutorial-how-to` and `listicle` templates ride; combining it with a talking-head avatar keeps the parasocial bond.
- **Ideal niche.** Career, education, indie founder, gaming, fitness.
- **Lip-sync emphasis.** "Three things" — both "th" sounds are tongue-forward, lip-sync handles them well. Stress "wish" and the noun.

## 6. The data-bomb open

> "[N]% of [audience] don't realize [counterintuitive fact]."

- **Setup.** Slight forward lean. Confident, authoritative — but warm, not lecturing.
- **Why.** Statistic = perceived authority. Counterintuitive payoff opens a curiosity gap.
- **Ideal niche.** Education, B2B, finance, health-adjacent, news brief.
- **Lip-sync emphasis.** Percentages are tricky — "ninety-three percent" has a tongue-trip. Prefer round numbers: "Eighty percent". Stress the percentage and the noun, soften "don't realize".

## 7. The mistake-I-made open

> "The biggest mistake I made with [topic] last year was [specific error]."

- **Setup.** Slight head-shake, self-deprecating smile. The avatar appears to be sharing, not selling.
- **Why.** Vulnerability hook. Even synthetic, the structure earns trust because it costs the speaker something to admit.
- **Ideal niche.** Career, indie founder, finance, fitness, personal essay.
- **Lip-sync emphasis.** "Biggest mistake" — both stressed words have clean mouth shapes. The pause before "was" is where veo-3.1-fast likes to breathe; don't cram it.

## 8. The "what if" pivot

> "What if I told you [counterintuitive promise]?"

- **Setup.** Slight smirk, eyebrow raise. NOT cheesy — the avatar is genuinely confident.
- **Why.** Conditional framing lets the avatar deliver a bold claim without sounding like an ad.
- **Ideal niche.** AI tools, productivity, finance, e-commerce.
- **Lip-sync emphasis.** "What if" — the "wh" + short vowel is a clean shape. Avoid mumbling "if I told you" together; let veo-3.1-fast see each syllable. 220 BPM speech max.

## 9. The deadline / scarcity open

> "You have until [date / event] to [action]."

- **Setup.** Calm urgency. NOT panic — that reads as scam.
- **Why.** Time pressure works only if the deadline is real (regulatory change, sale ending, season). Don't fake it.
- **Ideal niche.** Finance, tax, e-commerce sales, product launches, regulatory/news.
- **Lip-sync emphasis.** Dates are tricky for AI VO ("December thirty-first" reads better than "12/31"). Stress the verb ("file", "buy", "switch").

## 10. The "imagine" build

> "Imagine [vivid future state]. Now imagine getting there in [short time]."

- **Setup.** Soft, almost story-time delivery. Avatar leans back slightly, eyes warm.
- **Why.** Visualization + compression — the "now imagine" pivot is where the offer lands.
- **Ideal niche.** Coaching, fitness, finance, productivity, AI tools.
- **Lip-sync emphasis.** "Imagine" has three clean syllables — veo-3.1-fast locks easily. Avoid soft / breathy delivery; ElevenLabs stability 0.40+ keeps the shape sharp.

## 11. The challenge / dare open

> "Try this for [N] days and tell me it doesn't work."

- **Setup.** Direct eye contact, slight smile. Confident, not aggressive.
- **Why.** Implicit guarantee. The phrasing assumes success and dares the viewer to disprove it.
- **Ideal niche.** Fitness, productivity, habits, cooking, language learning.
- **Lip-sync emphasis.** Numbers + "days" is clean. Stress "try this" and the duration. Don't rush — veo-3.1-fast needs ~200ms per syllable to lock cleanly.

## 12. The breaking-news brief

> "Big update on [topic] — here's what changed and what to do."

- **Setup.** News-anchor archetype. Neutral expression, slight forward lean. Lower-third style overlay (handled in Remotion).
- **Why.** Authority + utility. Best paired with the news-anchor archetype + minimal background.
- **Ideal niche.** Tech news, regulatory updates, finance, AI tools.
- **Lip-sync emphasis.** "Big update" — clean plosives. Pause 300ms before "here's what changed". News-brief cadence is slower than ad cadence; let the avatar breathe.

---

## Cross-hook lip-sync rules

- **Speech tempo.** Target 140-180 WPM. Below 120 reads as drugged. Above 200 breaks veo-3.1-fast lip-sync.
- **Avoid in opens.** Whispering, screaming, laughter mid-word, exclamations like "ooh!" or "oh my god!" — all break lip-sync visibly.
- **First-second priority.** The opening word should have a strong consonant onset (T, D, S, K, P, B). "Three", "Stop", "If", "What", "Big", "Try" — all clean. Avoid "Um", "Hey", "So" (too soft, mouth shape ambiguous, lip-sync drifts).
- **Pause discipline.** 200-300ms pauses between hook clauses help veo-3.1-fast reset mouth shape between phrases. Don't pack the hook with no breath room.
- **Stable head.** No nodding, no head-shaking, no looking off-camera in the first 3 seconds. veo-3.1-fast lip-syncs cleanly only when the head is stable.

## Hook + archetype quick map

| Hook | Best archetype |
|---|---|
| 1, 7 | friendly-creator, indie-founder |
| 2, 4 | gen-z-streetwear, gamer-reviewer |
| 3, 6 | expert-educator, corporate-presenter |
| 5 | indie-founder, lifestyle-coach |
| 8, 10 | lifestyle-coach, friendly-creator |
| 9, 12 | news-anchor, expert-educator |
| 11 | lifestyle-coach, gamer-reviewer |
