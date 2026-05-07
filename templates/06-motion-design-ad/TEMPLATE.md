# Motion Design Ad — Template

> Kinetic-typography / motion-graphics advertisement for software, SaaS, apps and tech products. UI is the hero; motion communicates the product faster than narration can. Built around a 2-second hook, beat-driven cuts, and an unambiguous CTA.

- Slug: `06-motion-design-ad`
- Kind: `vibe-style`
- Default aspect: 9:16 (also valid: 16:9 YouTube pre-roll, 1:1 LinkedIn / Meta feed)
- Default duration: 15-30s (typical clip count 3-6 at 5s each on kling-v3.0-pro)
- Reference-required: **yes** (brand logo + real UI screenshot or mockup)

---

## Why this template

Tech products are abstract. A talking head can't show "the dashboard updates in real-time" or "errors get auto-fixed inline" the way a 0.8s morph from broken-code-to-clean-code can. Motion design is the shortest path between "what does this product do" and "I get it."

Three things make a motion-design ad land:

1. **A 2-second hook that promises the benefit.** Viewers decide to skip in under two seconds; a slow fade-in is a defect, not an aesthetic.
2. **The actual UI on screen.** Stock animations and generic dashboards kill credibility. The brand-reference gate exists for this — see "Required inputs."
3. **Beat-driven pacing.** Cuts land on music hits. 1-1.5s beats for B2C, 1.5-2s for B2B / enterprise. If the cut doesn't sync to a hit, the eye reads it as sloppy.

Use this template for: SaaS launches, app feature showcases, AI/data product reveals, developer tool promos, B2B platform overviews, fintech / productivity launches.

Don't use it for: founder-talking-head pieces (that's `talking-head-founder`), product-in-hand demo (`before-after-product`), lifestyle/UGC narrative (`pov-transformation`).

---

## Anchors (constants — do not vary)

- **Hook lands by 0:02.** Visible motion + brand-tied visual cue in the first 2 seconds. No fade-from-black.
- **Brand color drives the system.** One primary brand color, 1-2 accents, one background. Eight colors on screen is a defect.
- **Cuts on beats.** Music BPM (120-140 typical) defines the cut grid. Off-beat cuts are a defect, not a style choice.
- **CTA in the final 2-3s.** One verb, button-shaped, high contrast, animated entrance (pulse / glow / scale).
- **Captions are typography, not subtitles.** Kinetic / Hormozi-impact, beat-synced, max 7-8 words per beat.
- **Real UI only.** No fake-dashboard screenshots. Reference-required gate refuses without uploaded brand assets.

---

## Variation axes (vary freely)

- **Hook type** — see `hooks.md`. Pick one (or chain two): data-viz explosion, UI morph, device-from-void, code-to-product, metric counter climb, glitch-to-clean, hand-interaction, neon-glow activation, isometric zoom, particle-burst-from-logo, split-screen feature stack, light-beam scan.
- **Visual style** — Dark Premium (enterprise SaaS), Clean Minimal (productivity / wellness), Abstract Data (AI / analytics / fintech), Isometric Tech (dev tools / infra), Gradient Brand (startups / lifestyle), Neon Cyber (gaming / crypto / music), Glassmorphism (Apple-adjacent SaaS), Bold Geometric (creative tools), Tech Noir (security), Futuristic Minimalist (cutting-edge / sleek).
- **Energy** — fast/edgy (0.8s beats, glitch transitions, bass hits) vs. premium/deliberate (1.5-2s beats, morph transitions, orchestral-electronic bed).
- **Duration / aspect** — 6-15s 9:16 (Reels, TikTok, Stories), 15-30s 16:9 (YouTube pre-roll, mid-roll), 20-30s 1:1 (LinkedIn, Meta feed).
- **VO presence** — music-only with text-on-screen (most common for motion-design) or single confident VO synced to beats. Music-only is the default; only add VO if the message can't be carried visually.

---

## Narrative arc (the four-section structure)

```
[0:00 - 0:02]  HOOK            Single visual + motion verb. Brand cue visible.
[0:02 - 0:14]  SHOWCASE        UI / feature / benefit demo. 3-5 beats. Real screens.
[0:14 - 0:18]  BENEFIT         One headline (≤8 words) + 2-3 supporting bullets, beat-synced.
[0:18 - 0:20]  CTA             Verb button + supporting line + logo. Pulse/glow on button.
```

(Timings shown for a 20s spot; scale proportionally for 6s, 15s, 30s, 60s.)

**Beat math.** If music is 128 BPM, beat = 0.469s. Cuts land on every 2nd or 4th beat (0.94s or 1.88s). For a 15s ad at 128 BPM, that's roughly 8-16 cut opportunities — pick the ones that match scene boundaries.

**Hook → showcase transition.** Use a morph or particle-dissolve, never a hard cut. The hook should feel like it *becomes* the product, not that the product replaces it.

**Showcase → benefit transition.** Dim the UI to 40-60% opacity, slide headline in from left over the dimmed UI. Don't cut to a clean text card — losing the product on screen breaks the through-line.

**Benefit → CTA transition.** Quick fade-out of supporting bullets, hold the headline for 0.3-0.5s, then CTA button enters with a scale/pulse. The pause is the punctuation.

---

## Required inputs

The reference-required gate (AGENTS.md hard rule #3) refuses generation without these. Upload to `workspace/projects/<id>/assets/uploaded/` and log via `ralphy project log-asset`.

**Mandatory:**
- **Brand logo** (PNG/SVG with transparency, ≥1024px on the long side).
- **At least one real UI capture or product mockup.** App screenshot, dashboard screencap, web product screenshot, or — for pre-launch — a Figma export / wireframe (log `stage: "wireframe-ref"`).
- **Brand color spec.** At minimum the primary hex; ideally primary + 1-2 accents. If absent, sample from the logo and confirm with the user before generation.

**Strongly recommended:**
- One-line product description ("AI-powered analytics dashboard for e-commerce teams").
- Target platform (TikTok / Reels / YouTube pre-roll / LinkedIn) — this picks aspect, duration, and pacing.
- Headline (≤8 words) and CTA verb ("Start Free", "Try Demo", "Download Now").
- 2-3 benefit bullets (≤4 words each).

**Optional:**
- Existing music style reference or BPM target.
- Font-family preference (otherwise we default to Inter / Montserrat).
- 1-2 competitor ads in the same genre as motion reference (vibe only — never copy literally).

If any mandatory input is missing, refuse with the specific ask. Do not generate UI from scratch on a branded product — the result reads as fake within one frame and burns the project.

---

## When NOT to use this template

- **No real UI exists and the user can't / won't supply a wireframe.** Switch to `pov-transformation` or `talking-head-founder` and tell the story without showing a fake screen.
- **The product is physical, not digital.** Use `before-after-product` — motion design on a physical CPG product reads as inauthentic.
- **The user wants a UGC / handheld feel.** This template is the opposite of UGC. Pick `pov-transformation` or `talking-head-founder`.
- **Duration target is >60s.** Motion-design fatigue sets in fast; for long-form explainer, mix in talking-head footage and use this template only for the cold-open and CTA bookends.
- **The brand has no defined color system and the user can't decide.** Resolve the brand-color question first (one round with the user) — don't guess. A motion-design ad with the wrong primary color is unsalvageable in post.

---

## Companion docs

- `hooks.md` — full hook library with motion verbs and sound cues.
- `prompt-cookbook.md` — master prompt template, motion vocabulary, color/typography systems, sound design, common mistakes, worked examples.
