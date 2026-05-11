# Top-20 viral-2026 templates

Cross-category "what's actually moving the needle right now" playlist. Use this as the **agent test-drive set**: walking through these 20 covers all 5 categories and the dominant short-form patterns of 2026.

> Selection criteria: hook strength on TikTok / Reels / Shorts as of 2026-Q2, retention pattern stability, share-rate evidence, and conversion track record where the format is commerce-adjacent. Not "everything that works" — the **smallest set that exercises every viral pattern**.

| # | Slug | Category | Kind | Why it's on the list |
|---|---|---|---|---|
| 1 | [`pov-first-person`](creator-lifestyle/pov-first-person/) | creator-lifestyle | vibe-style | Highest share-rate format on TikTok. "POV: you just…" hook resolves audience identity in 1s. |
| 2 | [`grwm`](creator-lifestyle/grwm/) | creator-lifestyle | vibe-style | Dual-layer (visual + storytime) — native product placement leader, dominant beauty / fashion driver 2026. |
| 3 | [`storytime`](creator-lifestyle/storytime/) | creator-lifestyle | vibe-style | TikTok #1 retention pattern. Rising-tension narrative + pattern-interrupts hold 60-180s of dwell. |
| 4 | [`yap-talking-head`](b2b-saas/yap-talking-head/) | b2b-saas | vibe-style | Hormozi / Codie raw-energy single-idea education — the viral B2B pattern. No jump cuts, single thesis. |
| 5 | [`italian-brainrot`](entertainment-viral/italian-brainrot/) | entertainment-viral | vibe-style | Single-character AI-meme with Italian-gibberish VO. Most viral meme format of 2024-2025; 33-character canonical pool (Tralalero, Tung Sahur, Ballerina Cappuccina, etc.). |
| 5b | [`brainrot-ai-meme`](entertainment-viral/brainrot-ai-meme/) | entertainment-viral | vibe-style | Split-screen AI VO + Subway Surfers / Minecraft Parkour loop + screaming captions. The narration-over-gameplay variant. |
| 6 | [`photo-dump`](creator-lifestyle/photo-dump/) | creator-lifestyle | vibe-style | Carousel-as-video. Reels-dominant 2026, beat-snap photo cuts produce strong scroll-stop. |
| 7 | [`trending-sound-remix`](entertainment-viral/trending-sound-remix/) | entertainment-viral | vibe-style | Audio-first remix of a hyped sound. 24-48h post-window — pure trend surfing. |
| 8 | [`tier-list`](entertainment-viral/tier-list/) | entertainment-viral | vibe-style | S/A/B/C/D ranking grid. Debate-bait final pick drives comment volume. |
| 9 | [`listicle`](b2b-saas/listicle/) | b2b-saas | vibe-style | "Top N X" with big counter and #1 cliffhanger. Search-evergreen on YouTube Shorts. |
| 10 | [`tutorial-how-to`](b2b-saas/tutorial-how-to/) | b2b-saas | vibe-style | Hoyos-method 3-step search-first tutorial. YouTube Shorts king for evergreen reach. |
| 11 | [`before-after-product`](dtc-commerce/before-after-product/) | dtc-commerce | vibe-reference | Most reliably converting UGC pattern. 5s pain → 1s reveal → 9s demo — the conversion benchmark. |
| 12 | [`doctor-authority`](dtc-commerce/doctor-authority/) | dtc-commerce | vibe-style | Dominant nutra / supplement / skincare ad pattern. White-coat authority + mechanism explainer. |
| 13 | [`try-on`](dtc-commerce/try-on/) | dtc-commerce | vibe-style | Virtual try-on (apparel / glasses / makeup) — the AI commerce 2026 format. Mirror-flash multi-variant. |
| 14 | [`ai-avatar`](entertainment-viral/ai-avatar/) | entertainment-viral | vibe-style | Full synthetic talking-head — multilingual scaling, 175+ languages. The faceless-creator multiplier. |
| 15 | [`fit-check`](dtc-commerce/fit-check/) | dtc-commerce | vibe-style | Faster OOTD format. Beat-snap transitions, 1-3 looks per Reel — the apparel acquisition workhorse. |
| 16 | [`green-screen-explainer`](creator-lifestyle/green-screen-explainer/) | creator-lifestyle | vibe-style | Creator + backdrop (Reddit / news / chart / meme) with circle-annotations. The reaction-explainer base. |
| 17 | [`podcast-clip`](creator-lifestyle/podcast-clip/) | creator-lifestyle | vibe-reference | Long-form podcast → 15-60s viral cuts. The repurposing pattern that owns 2026 creator economy. |
| 18 | [`talking-head-rant`](creator-lifestyle/talking-head-rant/) | creator-lifestyle | vibe-reference | Deadpan 15-22s monolog with optional hook-screenshot overlay. Strong scroll-stop signal. |
| 19 | [`life-changing-testimonial`](dtc-commerce/life-changing-testimonial/) | dtc-commerce | vibe-style | Person-led peer testimony with specific outcome numbers. The proof-led conversion driver. |
| 20 | [`asmr-sensory`](entertainment-viral/asmr-sensory/) | entertainment-viral | vibe-style | Sound-forward content. Tapping / whispering / unboxing-sounds. Quiet-feed retention specialist. |

## Coverage check

By **category** (5):
- creator-lifestyle: 7 of 20 (1, 2, 3, 6, 16, 17, 18)
- entertainment-viral: 6 of 20 (5, 5b, 7, 8, 14, 20)
- dtc-commerce: 5 of 20 (11, 12, 13, 15, 19)
- b2b-saas: 3 of 20 (4, 9, 10)
- cinematic-narrative: 0 of 20 *(intentional — cinematic templates are aesthetic-first, not virality-first; test them per project, not in a viral-coverage matrix)*

> Slot **5** is split (5 + 5b) — the two brainrot formats are distinct enough (single-character vs. split-screen narration) that both belong in the test-drive set.

By **kind** (2):
- vibe-style: 16 of 20
- vibe-reference: 4 of 20 (11 before-after-product, 17 podcast-clip, 18 talking-head-rant — plus the vibe-style ones)

By **reference-required** gate:
- requires user reference: 8 of 20 (2, 11, 12, 13, 15, 16, 17, 19)
- no reference required: 12 of 20

## How to walk this list with an agent

1. **Pick a slug** from the table.
2. **Read the template doc**: `ralphy template show <slug>` (raw TEMPLATE.md, pipe-friendly).
3. **Scaffold a test project**: `ralphy template use <slug> --project test-<slug>-001 --brief "<one-line brief>"`.
4. **Run the playbook chain**: scenarist → art-director → editor (see `AGENTS.md` routing). Each agent reads the per-role playbook in `docs/playbooks/`.
5. **Render**: `ralphy render test-<slug>-001`.
6. **Evaluate**: run `ralph-evaluator` skill on the rendered mp4 — emits `eval.json` + `eval-report.md` per project.
7. **Log issues per slug** so the template can be hardened: update `template.json.tags` for resolution, fix `hooks.md` if hook-stop is weak, fix `prompt-cookbook.md` if asset gen drifts.

Goal of the walk-through: a verified, gated "production-ready" set of 20 templates that the agent can scaffold and ship end-to-end without surprises.
