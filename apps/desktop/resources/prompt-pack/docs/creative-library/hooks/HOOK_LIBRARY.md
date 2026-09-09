# Hook library — UGC short-form (RU)

Source: adapted from `TheMattBerman/ugc-factory-skill/MODULE_A_CREATIVE_DIRECTOR.md`
+ `dansugc/reelclaw/references/virality.md` for a Russian audience.

Used automatically:
- `/ralph-scenarist` reads this file on `new-scenario` and `iterate-scenario`.
- `scenario.json` must have `hook.primary` (≤10 words) — `scoreScenario()` checks this.
- `scenario.json` must have `angle` ∈ {testimonial, unboxing, problem-solution, comparison, demo}.

## Part 1. The five formats (angles)

Each scenario picks one dominant format. It decides the structure
of the video body (what comes after the hook).

### `testimonial` — review / personal story
- **Structure:** Me → Problem → Found a solution → Result
- **Voice:** conversational, "me like you"
- **Best for:** SaaS, product ads, EdTech
- **Example hook RU:** "I spent 6 months trying X until I realized that..."

### `unboxing` — unboxing / first time
- **Structure:** What it is → I open it → I try it → Reaction
- **Voice:** sincere, reactive
- **Best for:** physical goods, beauty, food, tech accessories
- **Example hook RU:** "I ordered this thing off TikTok and I'll show you what I got"

### `problem-solution` — pain point → solution
- **Structure:** Pain → "know that feeling?" → Solution → Demo
- **Voice:** empathetic, then confident
- **Best for:** productivity tools, life hacks, life-improvement apps
- **Example hook RU:** "When you need to record a call but forgot everything"

### `comparison` — A vs B
- **Structure:** Used to do X → Now I do Y → The difference
- **Voice:** analytical, sober
- **Best for:** software comparisons, "old way vs new way" content
- **Example hook RU:** "Switched from Notion to Linear — here's what changed"

### `demo` — showing off capabilities
- **Structure:** Watch what I can do → steps → result
- **Voice:** confident, hosting
- **Best for:** AI products, dev tools, creative software
- **Example hook RU:** "In 15 seconds I'll turn an idea into a presentation"

## Part 2. Hook angle — four emotional angles

On top of the format you pick an angle — the emotion the first second triggers:

### `gatekeep` — secret / insider knowledge
- "Nobody will tell you that..."
- "Here's what they don't teach you in the X courses"
- "If only someone had told me this at 22..."
- **Trigger:** FOMO + curiosity

### `skeptic` — flipping a popular belief
- "Everyone thinks X but really it's Y"
- "I stopped doing X — and things got better"
- "All those courses are garbage, the truth is..."
- **Trigger:** counter-narrative, pattern break

### `fail` — public failure
- "I screwed up: tried X and here's what happened"
- "Don't do what I did in 2025"
- "Lost 200K trying to do X"
- **Trigger:** social proof through relatability

### `visual-shock` — a sharp visual anomaly
- A number on screen first ("12M in 9 months")
- An object that shouldn't be on screen
- A face in a wild emotion (but not cringe)
- **Trigger:** scroll-stop reflex

## Part 3. Hook formulas (RU, ≤ 10 words)

Different formulas fit different angles. A/B variant → `hook.variant_b`.

| Formula | Example A | Example B (for testing) |
|---|---|---|
| `When [trigger]…` | When the client writes "just a small fix" | When you need something urgent on the weekend |
| `POV: [situation]` | POV: you're an ML engineer in 2026 | POV: first day at a new company |
| `Nobody will tell you…` | Nobody will tell you why juniors don't grow | No one talks about the dark side of SaaS |
| `I wish I'd known…` | I wish I'd learned this at 22 | If only someone had said this sooner |
| `Everyone thinks X — but Y` | Everyone thinks the dollar is strong — but look at this number | Everyone thinks you need an internship — but... |
| `[Shock number]` | I made 12M in 9 months | 200K users in 30 days |
| `Here's why…` | Here's why you run out of time by end of day | Here's why everyone is switching to Linear |
| `I screwed up…` | I screwed up in the very first month | Lost the product because of this mistake |

## Part 4. Word budget — voice → text

Default: **2.5 words per second** for conversational Russian VO.

| Video length | Total VO words | Hook (3s) | Body (10s) | CTA (2s) |
|---|---|---|---|---|
| 10s short | ~25 | ≤10 | ~13 | ~5 |
| 15s short (default) | ~37 | ≤10 | ~22 | ~5 |
| 30s short | ~75 | ≤10 | ~55 | ~10 |
| 60s | ~150 | ≤10 | ~120 | ~20 |

VO text must not be longer than this budget — otherwise the TTS sounds unnaturally
fast or the scenario doesn't fit.

## Part 5. Banlist — words and phrases you MUST NOT use

These phrases give off "ad-speak" and kill trust:

- "game-changer" / "amazing" / "incredible" / "must-have"
- "astonishing" / "unbelievable" / "stunning" (when used without specifics)
- "very" / "extremely" / "maximally" (intensifiers)
- "buy now" / "today only" (corporate-direct)
- "our team" / "our specialists" (when an "ordinary person" is speaking)
- "unique" / "the only one" / "best on the market"
- "lifehack" if it isn't actually a lifehack but just a tip

Replace with specifics: instead of "stunning result" → "did it in 4 minutes
instead of an hour", instead of "amazing feature" → "I pressed X — Y happened".

## Part 6. Caption / hashtags / music — sanity defaults

- **Captions:** word-by-word pop via `HormoziCaptions` or `TikTokCaptions`
  (`src/lib/components/captions/`). ≤7 words per card. All in the Green Zone
  (see `docs/green-zone.md`).
- **Hashtags:** 5-8 of them. Mix: 2-3 broad (`#ai`, `#productivity`) +
  2-3 niche (`#promptengineering`, `#aiagents`) + 1-2 brand. Always
  `#fyp` (TikTok) or `#reels` (IG).
- **Music:** volume 0.6-0.8, fade-in 0.5s, fade-out 1s. If the template references
  trend music — copy the file, do **not** generate a replacement via Lyria2.

## Part 7. Replicating winners

If a viral video is found via `scoreTikTok()` ≥ 9 — replicate the
**structure**, not the content:

| What to copy | What to change |
|---|---|
| Hook angle (gatekeep / skeptic / fail / visual-shock) | The specific subject |
| Format (testimonial / unboxing / …) | Topic |
| Pacing (cuts/sec) | Scenes |
| Caption style | Text |
| Music genre/mood | Track |
| Aspect / framing | Persona |

Don't copy: the verbatim hook text, the specific visual, recognizable music,
compositional moves one-for-one. That reads as a cheap copycat and kills
the algorithm.
