# Motion Design Ad — Prompt Cookbook

Operational reference for writing keyframe + i2v prompts that produce consistent, brand-aligned motion-design ads on our stack (gemini-3-pro keyframes → kling-v3.0-pro i2v → ElevenLabs music). Read alongside `TEMPLATE.md` and `hooks.md`.

---

## Master prompt template

Use this skeleton for every motion-design ad. Fill all sections — i2v models hallucinate when sections are vague.

```
[OPENING HOOK — 0:00 to 0:02]
Hook type: <one from hooks.md, e.g. "Data-Visualization Explosion">
Visual: <single primary element + brand cue, e.g. "metric '500K active users' centered on deep navy">
Motion: <specific verb + easing curve, e.g. "explode outward, power ease-out, 0.8s">
Color: <primary + accent + background, hex or named, e.g. "deep navy #001a33 base, electric cyan #00e5ff accent">
Sound: <element + timing, e.g. "whoosh on explosion at 0:00, three ascending chimes at 0:00.4 / 0:00.7 / 0:01.0">

[PRODUCT / FEATURE SHOWCASE — 0:02 to 0:14]
Setup: <device + framing, e.g. "isometric laptop at 45° angle, 50% of frame height">
Screen content: <real UI elements, brand colors, NOT generic placeholder>
Beats: <list each cut + duration, e.g.
  - 0:02-0:04 real-time graph populating, 0.8s
  - 0:04-0:06 heatmap spreading organically, 0.9s
  - 0:06-0:08 revenue counter climbing, 0.8s
  - 0:08-0:10 settings panel hover/tap, 0.7s>
Transitions: <morph / wipe / cut-on-beat — one consistent type, no mixing>
Camera: <static, slow orbit, parallax pull-back — one choice>

[BENEFIT — 0:14 to 0:18]
Headline: <≤8 words, brand voice, e.g. "See all your data in one place">
Headline animation: <entrance + duration, e.g. "scale-in from 0.6x to 1.0x, elastic ease-out, 1.2s">
Supporting bullets: <2-3, ≤4 words each, slide-in from right with 0.2s stagger>
UI behind: <dimmed to 40-60% opacity so text reads on top>

[CTA — 0:18 to 0:20]
CTA verb + button: <e.g. "Start Free Today" — bright cyan #00e5ff button, dark fill, glow bloom>
CTA animation: <pulse 1.2s loop, glow increase/decrease 8%>
Supporting line: <≤6 words, e.g. "No credit card required">
Logo: <bottom-center, with subtle aura glow>

[TECHNICAL]
Duration: <6 / 15 / 20 / 30 / 60s>
Aspect: <9:16 / 16:9 / 1:1>
FPS: 30 (default) or 60 if budget allows
Style tone: <one from Visual Style Library, e.g. "Dark Premium with Data Visualization">
Color grade: <e.g. "cool temperature, slight cyan shift, cinematic shadows">
Pacing: <beat duration, e.g. "1.2s beats synced to 128 BPM electronic backing">
```

**Why every section is required:** kling-v3.0-pro's motion is much more reliable when given (a) explicit motion verbs, (b) easing curves, and (c) per-beat timing. Vague prompts produce drifting, unmotivated motion that no amount of editing fixes.

---

## Motion vocabulary (use these exact phrases — Kling responds to them)

### Motion verbs (paired with the camera/object that's moving)

- *explode outward*, *radiate*, *cascade down*, *shoot out in rapid succession*
- *smoothly morph*, *deform along a bezier curve*, *transform between states*
- *float in from off-screen*, *materialize from black*, *fade in with opacity ramp*
- *pull back* (camera), *push in*, *orbit slowly*, *parallax across*
- *sweep across*, *trace the outline*, *scan top-to-bottom*
- *flicker*, *pixelate*, *distort*, *snap to clean state*
- *slide with stagger*, *fan out*, *cascade with 0.2s delay*
- *count up*, *climb rapidly with easing*, *snap to final value*
- *bloom*, *glow*, *pulse with 1.2s loop*

### Easing curves (specify always)

- **`power ease-out`** — snappy, premium feel; default for entrances and CTAs
- **`elastic ease-out`** — playful, eye-catching; best for headlines and key emphasis
- **`ease-in-out`** — smooth, neutral; default for loops and parallax
- **`linear`** — only for light beams, scans, and counters; everywhere else looks robotic
- **`bezier (0.65, 0, 0.35, 1)`** — when you need a specific custom curve (advanced)

Never write "smooth animation" without specifying which of these. The model will pick a default that's almost always wrong.

### Spatial / directional language

Kling parses spatial language reliably: "from the left", "at 45° isometric angle", "occupying 60% of frame height", "bottom-center", "stacked with 15px gap". Prefer these over "nicely composed" or "well-positioned" — those phrases get ignored.

---

## Visual Style Library (12 looks)

Pick **one** style per ad and stay in it. Mixing styles within a single 15s spot is a defect, not a creative choice.

| Style | Background | Text | Accents | Best for |
|---|---|---|---|---|
| **Dark Premium** | Deep navy / true black | Bright white | Single bold (gold, electric blue, teal) | Enterprise SaaS, finance |
| **Clean Minimal** | Pure white / light gray | Charcoal / true black | Soft brand muted | Productivity, wellness, healthcare |
| **Abstract Data** | Dark gradient | High-contrast | Neon cyan, magenta, lime | Analytics, AI, fintech |
| **Isometric Tech** | Mid-tone | Bold sans | Saturated blues, purples, oranges | Dev tools, infrastructure |
| **Gradient Brand** | Two-color flowing gradient | White w/ shadow | Tints of brand | Startups, lifestyle, trendy |
| **Neon Cyber** | Near-black / deep purple | High-contrast | Cyan + magenta, or pink + lime | Gaming, crypto, music |
| **Glassmorphism** | Soft-focus / blurred | High-contrast over glass | Subtle blends | Apple-adjacent SaaS, premium |
| **Neumorphism** | Soft single color | Slightly darker than bg | None / very subtle | Accessibility, gentle B2B |
| **Bold Geometric** | Solid / two-color split | High-contrast | Complementary pairs | Creative tools, design SaaS |
| **Tech Noir** | Dark + high contrast | Bright | Single bright (red, cyan) | Security, cybersecurity |
| **Soft & Welcoming** | Warm gradient (peach, cream) | Charcoal / brown | Coral, warm gold | Consumer / community apps |
| **Futuristic Minimalist** | Mid gray / soft dark | Bright single | Cyan or lime, thin lines | Cutting-edge, sleek |

---

## Color systems

**Rule of three.** One primary brand color, 1-2 accents, one background. Anything beyond five distinct hues on screen is a defect.

**Contrast checks.** Body text ≥4.5:1 against background; large headlines ≥3:1. CTA button must be the highest-contrast element in its frame.

**Accent for motion.** Use the accent color (not the primary) to guide the eye through transitions. Particle trails, glow blooms, and beam scans should all use the accent — this keeps the primary brand color "rare" and therefore visually loaded.

**Gradient discipline.** Subtle 2-color gradients feel premium. Aggressive 4-color gradients feel cheap. If using gradient, animate the gradient angle/position slowly (8-15s loop) — static gradients look flat.

---

## Typography system

- **Sans-serif only.** Inter, Montserrat, Futura, SF Pro, Söhne. Serifs read as editorial / publishing, not tech.
- **Two weights max:** bold (700-900) for headlines, regular (400-500) for body. Three weights = clutter.
- **Size hierarchy:** headlines 48-72pt, subheads 28-36pt, body 18-24pt at 1080p. For 9:16 vertical, multiply ×1.4.
- **Letter spacing:** headlines slightly tight (-0.5 to -1%), body normal (0%).
- **Line height:** headlines 1.1-1.2, body 1.5-1.6.
- **Safe margins:** 15-20px from frame edges; 20-30px on mobile (9:16).
- **Z-depth:** text always on top layer. Nothing animates over text mid-read.

### Text entrance animations (pick one per role, not per line)

| Animation | Duration | Easing | Best for |
|---|---|---|---|
| Fade in | 0.4-0.8s | ease-in-out | Body, supporting bullets |
| Slide in | 0.5-1.0s | power ease-out | Headlines, CTA |
| Scale (0.5x → 1.0x) | 0.6-1.0s | elastic ease-out | Key messages, big numbers |
| Typewriter | 0.05-0.1s/char | linear | Code snippets only |
| Rotate-in (90°-360°) | 0.7-1.2s | power ease-out | Playful brands, accent text |

Don't mix five entrance animations in one ad. Pick two: one for the headline, one for the bullets.

---

## Sound design

Motion design lives or dies on audio sync. Visual + sound within 50ms = cohesive. Lag = amateur.

### Sound palette (synth-only OR organic-only — never mix without reason)

| Layer | Element | Volume | Timing |
|---|---|---|---|
| **Music bed** | Electronic, 120-140 BPM | -10 to -6 dB | Starts 0.5-1s before visuals, fades 0.5-1s after |
| **Entrance** | Whoosh / chime / tone chord | -15 to -10 dB | Sync to motion start, ±50ms |
| **UI interaction** | Click, slide, pop, bubble | -18 to -12 dB | On contact / element appearance |
| **Transition** | Morph tone, glitch stutter, laser sweep, bass swell | -12 to -8 dB | Match transition duration |
| **Metric / data** | Counter beeps, ping, shimmer | -15 dB | Per increment / data point |
| **Bass drop** | Low-frequency hit | -6 dB | Only on key reveal / CTA / benefit |

### ElevenLabs Music prompt skeleton (for the music bed)

```
Style: <electronic / cinematic-electronic / synthwave / minimal techno / orchestral-electronic hybrid>
BPM: <120-140>
Energy: <building / steady / cinematic-rise>
Key moments:
  - 0:00-0:02 hook bed (sparse, building)
  - 0:02-0:14 main groove (full energy)
  - 0:14-0:18 dropout under benefit headline (sub + percussion only)
  - 0:18-0:20 reveal hit on CTA + outro tail
Mood: <confident / urgent / inspirational / edgy>
Instruments: <synth pad, sub bass, percussive ticks, granular textures, occasional orchestral hit>
Avoid: <vocals, distorted guitar, acoustic instruments> (unless brand demands)
```

Always request a "downtempo dropout" at the benefit section — clean dialogue/text against full-mix music is a classic motion-design defect.

---

## Common mistakes (refuse these in review)

1. **Too much text.** >8 words per element, >3 lines on screen, <1s read time per line. Cut.
2. **No 2-second hook.** Slow fade-from-black, logo card, or "establishing shot" — kill it.
3. **Tiny UI.** Device <40% of frame height, unreadable on mobile. Reframe.
4. **Eight colors.** Reduce to primary + 1-2 accents + 1 background.
5. **Decorative motion.** Spinning logos, bouncing icons "for fun" — every motion must communicate. Cut anything that doesn't.
6. **No sound or conflicting sound.** Always include music bed + sync UI sounds. Mix at -3 dB peak.
7. **Bad pacing.** Cuts every 0.5s = overwhelming; same scene 5s+ = boring. 1-1.5s beats B2C, 1.5-2s B2B.
8. **No CTA.** Final 2-3s must include verb-button + supporting line. "Learn more" is weak — pick a specific verb.
9. **Generic / fake UI.** AI-improvised dashboards read as fake. Refuse generation without real UI reference.
10. **Desktop-first design for mobile.** Test at 9:16 on a phone before rendering. Center 60% safe zone if 16:9.

---

## Worked examples (3 short)

### Example A — SaaS analytics dashboard, 15s 9:16 Reels

```
[HOOK — 0:00-0:02]
Hook type: Data-Visualization Explosion
Visual: metric "500K active users" centered, in white on deep navy #0a1929
Motion: number explodes outward, particle trails radiate, four secondary stats cascade
        in succession (engagement, retention, revenue, MRR). Power ease-out, 1.2s.
Color: navy base, electric cyan #00e5ff accent, gold #ffb400 highlights on the headline number
Sound: whoosh at 0:00.0; ascending chimes at 0:00.4 / 0:00.7 / 0:01.0 / 0:01.3

[SHOWCASE — 0:02-0:11]
Setup: particles re-gather into floating laptop at 45° isometric, 55% frame height
Screen content: actual brand dashboard (multi-ref keyframe with uploaded UI screenshot)
Beats:
  - 0:02-0:04 real-time line graph populates, points draw on, 0.8s, power ease-out
  - 0:04-0:06 heatmap spreads organically across users panel, 0.9s, ease-in-out
  - 0:06-0:08 revenue counter climbs $0 → $487K, 0.8s, elastic on final
  - 0:08-0:11 settings panel slides open, three controls activate in stagger, 0.7s each
Transitions: morph between feature highlights, 0.4s, bezier
Camera: subtle parallax pull-back (3% over 9s)

[BENEFIT — 0:11-0:14]
Headline: "All your data, one dashboard." (scale-in 0.6x → 1.0x, elastic ease-out, 1.2s)
Supporting: "Real-time", "Customizable", "Team-ready" (slide-in from right, 0.2s stagger)
UI behind: dim to 50% opacity

[CTA — 0:14-0:15]
CTA: "Start Free" — cyan button with glow bloom, pulse 1.2s loop
Supporting: "Join 50K+ teams"
Logo: bottom-center, subtle aura

[TECHNICAL]
Duration: 15s | Aspect: 9:16 (1080×1920) | FPS: 30
Style: Dark Premium with Data Visualization
Color grade: cool, slight cyan shift, cinematic shadows
Pacing: 1.0s beats synced to 128 BPM electronic backing
```

### Example B — Mobile consumer app, 12s 9:16 TikTok

```
[HOOK — 0:00-0:02]
Hook type: Hand Interaction
Visual: floating iPhone center, screen black, on Clean Minimal white background
Motion: hand enters from right, taps screen decisively, screen illuminates teal
        on contact. Hand: power ease-out 0.6s. Screen ignite: linear 0.2s.
Color: pure white #ffffff bg, brand teal #14b8a6 ignite
Sound: light tap (0.1s) at contact + soft chord on ignite

[SHOWCASE — 0:02-0:09]
Setup: phone full-frame at ~70% height, slight 5° tilt
Screen content: actual app home screen (multi-ref with uploaded screenshots)
Beats:
  - 0:02-0:04 hand swipes up, content feed reveals, cards slide-in stagger, 0.8s
  - 0:04-0:06 hand taps message bubble, conversation expands, 0.7s
  - 0:06-0:08 hand swipes left, discovery view reveals, search results cascade, 0.9s
  - 0:08-0:09 hand taps profile icon, profile circle scales in, 0.5s
Transitions: smooth wipe between app states, 0.4s
Camera: static with 3% parallax on hand

[BENEFIT — 0:09-0:11]
Headline: "Connect with what matters." (slide-in left, power ease-out 0.9s)
Supporting (3 stagger): "Share. Discover. Connect." (each word 0.4s apart)

[CTA — 0:11-0:12]
CTA: "Download Now" — teal button with pulse, App Store + Play badges fade in
Logo: top-center

[TECHNICAL]
Duration: 12s | Aspect: 9:16 | FPS: 30
Style: Clean Minimal with brand teal accent
Color grade: bright high-key, soft shadows, friendly
Pacing: 1.0s beats, 124 BPM upbeat electronic
```

### Example C — Dev tool promo, 20s 16:9 YouTube pre-roll

```
[HOOK — 0:00-0:02]
Hook type: Glitch-to-Clean
Visual: code editor with red error squiggles + flickering errors on dark red background
Motion: distortion / pixelation 0.8s, then SNAP to clean editor on deep navy
Color: dark red #4a1414 → deep navy #0a1929; brand syntax greens / cyans on resolution
Sound: glitch stutter (0.3s) → satisfying ding on snap

[SHOWCASE — 0:02-0:12]
Setup: code editor fills frame, isometric 30° tilt at 0:04
Screen content: real syntax (Python or TypeScript, sampled from user's repo)
Beats:
  - 0:02-0:04 syntax highlights glow in sequence, 0.5s each, 4 elements
  - 0:04-0:06 autocomplete popup appears, dev selects suggestion, 1.5s
  - 0:06-0:08 red error underline appears, morphs into helpful tooltip, 1.5s
  - 0:08-0:10 status bar at bottom: "Build: 0.4s | Tests: 42/42", numbers count in
  - 0:10-0:12 zoom to full editor view, all features visible at once
Transitions: morph between feature highlights, 0.5s
Camera: static; 3D tilt-in at 0:04 (ease-in-out, 0.8s)

[BENEFIT — 0:12-0:16]
Headline: "Code faster. Catch errors before they happen." (scale-in elastic 1.2s)
Supporting: "Instant suggestions", "Smart detection", "Performance insights" (fade 0.7s, stagger)

[SOCIAL PROOF — 0:16-0:18]
"Trusted by 10,000+ developers" (large number scales in)
"40% faster average dev cycle" (metric + icon)

[CTA — 0:18-0:20]
CTA: "Start Coding Free" — cyan button, glow + pulse
Supporting: "No credit card required"
Logo: bottom-center

[TECHNICAL]
Duration: 20s | Aspect: 16:9 (1920×1080) | FPS: 30
Style: Dark Premium with Technical precision
Color grade: cool tones, high contrast for code readability
Pacing: 1.2s beats, 132 BPM electronic with sub-bass on the snap
```

---

## Final-pass checklist (run before render)

- [ ] Hook lands by 0:02 with visible motion + brand cue
- [ ] Real UI / brand reference present in every frame where the product appears
- [ ] One visual style throughout (no mixing)
- [ ] ≤5 distinct hues on screen at any moment
- [ ] All cuts on music beats (BPM × beat-grid validated)
- [ ] Every text element ≤8 words, ≥1s on screen
- [ ] CTA verb-button + supporting line + logo in final 2-3s
- [ ] Captions kinetic/Hormozi-style, beat-synced
- [ ] Audio sync within 50ms of every motion start
- [ ] 4.5:1 text contrast, 3:1 large headline contrast
- [ ] If 16:9: critical content within center 60% safe zone
- [ ] If 9:16: tested at phone scale before render
- [ ] No decorative motion (every animation justifies itself)
- [ ] No fake / AI-improvised UI on a branded product
