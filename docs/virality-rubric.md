# Virality rubric

Objective criteria for (a) ranking scraped TikToks and (b) scoring our own scenarios before render. Source: adapted from `dansugc/reelclaw` + `TheMattBerman/ugc-factory-skill` for the Russian UGC context.

Used automatically:
- `scoreTikTok()` in `cli/lib/score.ts` — over the JSON from a TikTok scraper (4.3).
- `scoreScenario()` in `cli/lib/score.ts` — over `scenario.json` before handoff to `/ralph-art-director`.
- `bun run ralph -- project score <id>` — gate inside `/ralph-scenarist`.

## Part 1. Engagement-ratio thresholds (for scraped videos)

Don't read absolute numbers — read **ratios**. A video with 10K views and 1500 likes (15%) is more viral than 1M views and 50K likes (5%).

### Like ratio (likes / views)

| Tier | Ratio | Meaning |
|---|---|---|
| good | ≥ 5% | Content lands |
| great | ≥ 10% | Strong response, worth studying |
| viral | ≥ 15% | Top decile, mandatory reference |

### Comment ratio (comments / views)

| Tier | Ratio | Meaning |
|---|---|---|
| good | ≥ 0.5% | Some discussion |
| great | ≥ 1% | Strong engagement |
| viral | ≥ 2% | Hook is provoking replies |

### Share ratio (shares / views)

| Tier | Ratio | Meaning |
|---|---|---|
| good | ≥ 0.3% | Useful/funny |
| great | ≥ 1% | Worth sending to a friend |
| viral | ≥ 3% | "I have to show this" |

### View tier (raw views)

| Tier | Views | Why |
|---|---|---|
| 1 | ≥ 10K | Cleared the algorithm |
| 2 | ≥ 100K | Strong algorithmic push |
| 3 | ≥ 1M | Truly viral |

### Combined score

`scoreTikTok()` sums tier values across the 4 metrics (max = 12) and returns:
- `viral` (≥9), `great` (≥6), `good` (≥3), `weak` (<3)

## Part 2. 7-dim self-check rubric (for our own scenarios)

After the scenarist writes a draft, run each dimension. If **any** is below tier=2 — iterate, don't hand off.

| Dimension | Tier 1 (minimum) | Tier 2 (good) | Tier 3 (excellent) |
|---|---|---|---|
| **hook_strength** | Hook in first 1–3s, clear topic | Pattern interrupt, emotion in the first line | Screen/image + hook text simultaneously |
| **emotional_impact** | One recognizable emotion | Emotion + a specific subject (not generic) | Strong emotion + cultural context |
| **pacing_flow** | No scenes >3s without a cut | Beats average 1–2s | Every scene moves the narrative |
| **text_readability** | Text in Green Zone, reads in 0.5s | + Contrast ≥4.5:1, ≤7 words per line | + Hierarchy (hook > support > CTA) |
| **scroll_stop_power** | Something catches the eye in frame 1 | A specific visual pattern interrupt | A unique frame that immediately raises "what is this" |
| **completion_likelihood** | Hook promises a payoff | Payoff in the first 7s + a new hook | Loop-friendly ending (re-watchable) |
| **shareability** | It's clear why anyone would share it | "I have to show this to [a specific kind of person]" | Sharing becomes a social signal |

## Part 3. The 15-second formula

Default UGC-shorts duration: **10–15 seconds**.

```
0:00 - 0:03   HOOK     (3s)   — first 3s carry 100% of the importance: text + image + emotion
0:03 - 0:13   DEMO     (10s)  — payoff, problem→solution, or narrative development
0:13 - 0:15   CTA/LOOP (2s)   — call to action or loop back to start
```

**Hard caps:**
- ≤ 15s total for shorts (unless it's a podcast clip or a story).
- 5–8 scenes on average (1.5–3s each).
- No more than one scene in a row >3s without a cut/transition.

## Part 4. Hook formulas

Each hook line should be ≤ 10 words and follow one of these structures:

| Structure | Example | When to use |
|---|---|---|
| `When [trigger]…` | "When the client writes 'a tiny tweak'" | Relatable pain |
| `POV: [situation]` | "POV: you're an ML engineer in 2026" | Identity |
| `Nobody tells [you]…` | "Nobody will tell you that…" | Gatekeep / inside |
| `Wish I'd known earlier` | "Wish I'd learned this at 22" | Regret/lesson |
| `Everyone thinks X but actually Y` | "Everyone thinks the dollar is strong…" | Skeptic frame |
| `[Shock number]` | "I made 12M in 9 months" | Visual shock |
| `Here's why [unexpected fact]` | "Here's why you can't keep up…" | Curiosity gap |

Detailed hook library with examples — `workspace/hooks/HOOK_LIBRARY.md` (see Sprint 2.2).

## Part 5. Caption / hashtags / music rules

### Captions
- Word-by-word pop-up for retention (use `HormoziCaptions` or `TikTokCaptions` from `src/lib/components/captions/`).
- Contrast: white text + black 3px outline OR a colored box with 95% opacity.
- All captions inside Green Zone Y 210→1480 (see `docs/green-zone.md`).
- ≤ 7 words per "card".

### Hashtags
- Description: 5–8 hashtags, always include `#fyp` (TikTok) or `#reels` (IG).
- Mix: 2–3 broad (`#ai`, `#productivity`) + 2–3 niche (`#aivideo`, `#promptengineering`) + 1–2 brand-related.

### Music
- Volume under VO: **0.6–0.8** ducked.
- Fade-in: **0.5s**, fade-out: **1s**.
- If a template references a trend track (`assets/trend-*.mp3`) — copy it, **don't generate** a replacement via Lyria2. Track recognizability is part of the algorithmic push.

## Part 6. Replicating winners

If a viral video shows up via `scoreTikTok()` ≥ 9 (tier "viral") — replicate the structure, not the content:

| What to copy | What to change |
|---|---|
| Hook emotion (recognition / shock / nostalgia) | Specific subject |
| Pacing (cuts/sec) | Scenes |
| Caption style | Text |
| Music genre / mood | Track (if not trend music) |
| Aspect / framing (close-up / wide) | Persona |

**Don't copy:** the hook text itself, the specific visual, the music (if recognizable) — that violates copyright and reads as a cheap copycat.

## Part 7. Hard fails — handoff gate

A scenario **does not pass** further if:

- [ ] Hook is NOT in the first 3 seconds.
- [ ] Total duration > 15s (or > what `scenario.duration` says).
- [ ] Any `text_overlay` is outside the Green Zone (`y < 210`, `y > 1480`, `x > 960`).
- [ ] Any scene > 3s without an internal cut.
- [ ] Hook text > 10 words or > 7 words per line.
- [ ] No `hook.primary` field in `scenario.json`.
- [ ] No `angle` set (one of 5 formats: testimonial / unboxing / problem-solution / comparison / demo).

These checks aren't LLM calls — they're structural. Implemented in `scoreScenario()` in `cli/lib/score.ts`.
