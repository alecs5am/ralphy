# Listicle prompt cookbook

Concrete recipes for prompting, composing, and rendering a Top-N video. Read `TEMPLATE.md` first for vibe; this doc covers the *how*.

## Master template

The video has three sections, in order. Always.

```
[HOOK]                  0–2s    →  Promise + open loop on #1.
[ITEM BEAT × N]         2 → ~45s  →  Reverse countdown (default), 6–10s per item.
[#1 REVEAL]             last 8–10s →  Slightly longer beat, music lift.
[CTA / OUTRO]           last 2–4s →  Subscribe / comment / save.
```

For 5 items at ~50s total:
- Hook 2s
- Items #5, #4, #3, #2: 8s each (32s)
- Item #1: 10s (with music lift)
- CTA: 4s
- Total: ~48s. Pads to 50s comfortably.

Each item beat has the same internal shape:

```
0.0 – 0.4s    Cut in. Counter pops on screen ("3/5"). Item title slides in under counter.
0.4 – 6.0s    B-roll loop plays. VO delivers the 1-line reason.
6.0 – 8.0s    B-roll continues OR cuts to a 'punch' frame (close-up of the item, screenshot).
8.0s          Hard cut to next item.
```

The counter and item title stay on screen for the *entire* beat. They're the format's spine — never animate them off mid-beat.

## Counter-overlay design (Remotion component pattern)

The numbered counter is the most important visual element. Treat it like the brand logo of the format.

**Layout.**
- Position: top-center or top-left, with safe-area padding (96px from top, 64px from edge in 1080×1920).
- Size: counter font size 180-220px (the fraction "1/5" should be roughly 1/5 of the screen width).
- Item title: 80-100px, sits directly below the counter, max 2 lines, centered or left-aligned to match.

**Typography.**
- Counter: a heavy monospace or display font — Inter Black, Space Grotesk Bold, or a chunky display like Druk Wide. Monospace keeps "1/5" and "10/10" the same width, which matters when the counter morphs.
- Item title: same family, lighter weight (Medium or Regular), slightly smaller.

**Color.**
- White text + a dark drop-shadow (`rgba(0,0,0,0.4)`, blur 8px, offset y 4px) — works on any b-roll without a color card.
- Or: white text inside a small filled badge (rounded rectangle, 24px corner radius, 16px padding). Use the badge variant on visually busy b-roll (food, action shots).

**Animation.**
- Counter pop-in: scale from 1.2 → 1.0 with a spring (damping ~12, stiffness ~180), 200ms. Don't slide it in — pops are louder.
- On item change: morph the digit (cross-fade old digit → new digit), don't cut. The "/N" stays static.
- Don't animate the counter mid-beat. It sits still until the next cut.

**Remotion component sketch.**

```tsx
<AbsoluteFill>
  <Video src={staticFile(`scenes/scene-0${i}/clip.mp4`)} />
  <Sequence from={beatStart} durationInFrames={beatLen}>
    <CounterBadge current={i} total={N} />   {/* top-center, 200px monospace */}
    <ItemTitle text={item.title} />          {/* under counter, 90px, 2 lines max */}
    <ReasonCaption text={item.reason} />     {/* bottom 1/3, whisper-driven */}
  </Sequence>
</AbsoluteFill>
```

`CounterBadge` re-renders only on `current` change and uses `spring()` for the pop. `ItemTitle` cross-fades on item change (200ms). `ReasonCaption` is whisper-1-driven karaoke captions, NOT the same component as the title.

## Item-beat structure

Per item, four moves, in order:

1. **B-roll establishment** (0–2s of the beat). The keyframe-anchored loop introduces the item visually. If the item is "Notion-like note app", the b-roll is a UI mockup or hands typing on a laptop. If the item is "Reykjavik in winter", it's an aurora over a black-sand coast.
2. **Number stamp** (instant, on cut). Counter pops in. Item title appears.
3. **Reason VO** (2–6s of the beat). 1-line reason: *why this is on the list*. "Because it does X without you doing Y."
4. **Cut** (instant). To the next item, or to the #1 reveal.

The reason line is the only narrative work per beat. Keep it under 18 words. The b-roll, counter, and title carry the rest.

## Keyframe prompts (per item)

One Gemini-3-Pro keyframe per item. Each keyframe has the same composition pattern:

- Vertical 9:16, 1080×1920.
- The item's visual subject takes the center-2/3 vertically. Top 1/6 is empty (counter sits there). Bottom 1/3 is empty (captions sit there).
- Calm composition — minimal background clutter, soft depth-of-field.
- Color palette consistent across all items in one video (if niche=tech: cool blue/grey; if niche=food: warm yellow/orange; if niche=travel: niche-appropriate).

Sample keyframe prompt for "Notion (tech / AI tools listicle, item #3)":

```
Vertical 9:16 keyframe, 1080×1920. Macro shot of a modern laptop on a clean
desk, screen showing an abstract note-taking interface (no real logos),
warm desk lamp lighting, soft shallow depth-of-field, top sixth and bottom
third of frame intentionally empty / out of focus for text overlay, cool
blue-grey color palette, matte finish, photorealistic.
```

Then i2v with `kwaivgi/kling-v3.0-pro` on a 4-5s loop, prompt: "subtle camera drift left-to-right, soft hand movement on the laptop trackpad, ambient lighting steady, no zoom, no cuts." `generate_audio: false`.

## VO pacing rules

- **One item per ~7 seconds of speech.** ~17–20 words per item including connector ("Number three —").
- **Single take** across the whole video. Don't split into per-item clips. ElevenLabs renders cleanest with one continuous take.
- **Energetic-but-clear pace.** Faster than GRWM (chatty), slower than rant. Aim for ~165–180 wpm.
- **Pause for the counter pop.** Insert a `<break time="0.4s" />` SSML pause at every "Number {n} —" so the counter has time to land before the reason starts.
- **#1 gets a beat.** Insert a `<break time="0.7s" />` before "And number one —" and slow the delivery 10–15% on the reason. Music lifts here too.

Example VO transcript (5-item, ~50s):

```
Top five AI tools that will replace your job — and number one is already taking mine.
Number five — <break /> a writing assistant that reformats anything into a one-pager.
Number four — <break /> a calendar that books meetings before you finish reading the email.
Number three — <break /> a note app that summarizes a 30-minute meeting in three bullets.
Number two — <break /> an image model that ships a brand asset in eleven seconds.
And number one — <break time="0.7s" /> the one I actually use every day…
<reveal name>. It's free. Save this so you remember.
```

## Music

One track, full duration, with a small lift at #1.

**Default vibes by niche.**
- Tech / AI: minimal-electronic, steady 110–120 BPM, light synth pad, optional clock-tick percussion.
- Finance: confident piano + sparse strings, 90–100 BPM, building.
- Food: warm Lo-Fi or upbeat acoustic, 95–110 BPM.
- Travel: ambient or world-fusion, 80–95 BPM, with light flute / strings.
- Gaming: synthwave / electronic, 120–135 BPM.
- Productivity: minimal-electronic or calm piano, steady.

**ElevenLabs Music prompts.**

```
Steady-tempo minimal electronic instrumental, 115 BPM, light analog synth
pad and clock-tick percussion, no drops, builds slightly toward the end.
Vibe: focused tech roundup. Length: 50 seconds. No vocals.
```

For the #1 lift: don't render two tracks. One track that builds is cleaner. Mix-side: at the #1 cut, raise the music gain by +2 dB and let it run; drop it back -3 dB for the CTA.

**Building urgency vs steady tempo.** Building urgency = rising listicles ("worst to best", "I tested N"). Steady tempo = informational lists ("things you didn't know", "things to stop doing"). When in doubt, steady.

## 8 mistakes-with-fix

1. **Items too generic.** "Top 5 AI tools" with items "ChatGPT, Midjourney, Notion AI, Grammarly, Otter" — every viewer has seen this list ten times.
   **Fix.** Constrain the topic. "Top 5 free AI tools you didn't know exist." Items become surprising.

2. **Counter too small.** Counter sits as a 60px caption next to a giant b-roll. Viewer doesn't track progress.
   **Fix.** Counter is 180–220px, top-third, dominant. If it doesn't read on a phone at arm's length, it's too small.

3. **No payoff at #1.** All items get the same 8s, same energy. Viewer stuck the open loop and got the same beat as #5.
   **Fix.** #1 gets +2s, music lift, slower VO, slightly longer punch frame. The format owes the viewer a moment.

4. **Forward order without justification.** "Number 1 first" loses the open loop unless the hook explicitly teases #1 twice ("…and #1 is already taking mine — let's start there").
   **Fix.** Default to reverse. Use forward only if the topic is a *process* (steps 1→5), not a ranking.

5. **Items have no visual.** "5 mindset shifts" — there's nothing to b-roll. Result: stock-footage slop that doesn't anchor any item.
   **Fix.** Either swap to a more concrete topic, or commit to typography-only b-roll (animated quotes on solid color), and lean on the counter even harder.

6. **VO splits into N takes.** Per-item VO clips concatenated have audible joins.
   **Fix.** One ElevenLabs take, full transcript, with SSML breaks. Edit on b-roll cuts, not on audio cuts.

7. **Music has a drop.** A drop in the middle of a listicle competes with the counter for attention and pulls focus off the items.
   **Fix.** Pick a build, not a drop. Keep the lift small (+2 dB at #1), don't change tempo.

8. **CTA too long.** 8s of "subscribe, share, comment, save, follow" — viewer drops at second 50.
   **Fix.** One CTA line, 2–4s. "Save this for later." or "Comment which one you'd try." Pick one.

## 4 worked examples

### A. Tech AI tools (5 items, ~48s)

- **Hook.** "Top 5 AI tools that will replace your job — and #1 is already taking mine."
- **Items (reverse order).** #5 reformatter, #4 meeting-booker, #3 note summarizer, #2 brand-asset image gen, #1 the surprise pick (e.g. an autonomous coding agent).
- **Keyframes.** Laptop on desk (5), inbox UI mockup (4), meeting notes UI (3), brand-asset grid (2), code editor with diff (1). Cool blue-grey palette across all five.
- **Music.** Minimal electronic, 115 BPM, building.
- **CTA.** "Save this — I'll do part 2 with the runners-up."

### B. Healthy snacks under $5 (5 items, ~45s)

- **Hook.** "5 healthy snacks under $5 that taste better than they should."
- **Items.** #5 Greek yogurt + frozen berries, #4 hummus + carrot, #3 hard-boiled egg + everything bagel seasoning, #2 cottage cheese + honey + walnut, #1 banana + peanut butter + dark chocolate chips.
- **Keyframes.** Top-down shots, white wood surface, warm window light, each snack on a small ceramic plate, identical composition (centered). Top sixth + bottom third left empty.
- **VO.** Warm female voice, ~170 wpm.
- **Music.** Lo-Fi acoustic, 100 BPM, steady.
- **CTA.** "Save this — pick one for tomorrow."

### C. Productivity hacks (3 items, ~32s)

- **Hook.** "3 productivity hacks that actually work — and #1 took me a year to figure out."
- **Items.** #3 single-tab browsing, #2 the 25-minute focus block (no app, just a kitchen timer), #1 the "ask one question per meeting" rule.
- **Keyframes.** Single-tab browser shot (3), wooden desk with kitchen timer and notebook (2), portrait of a calm office at dawn with one chair empty (1). Warm minimal palette.
- **List size 3** because each item is a behavior, needs ~10s to land.
- **Music.** Calm piano, 85 BPM, light build.
- **CTA.** "Try one this week. Tell me which."

### D. Travel — European cities to visit in winter (5 items, ~55s)

- **Hook.** "5 European cities to visit in winter that nobody is talking about."
- **Items.** #5 Tallinn (Estonia), #4 Porto (Portugal), #3 Ljubljana (Slovenia), #2 Tromsø (Norway, lights), #1 Reykjavik (Iceland).
- **Keyframes.** Wide vertical shots, snow / fog / harbor lights, no people in foreground, color palette per city but unified by deep blue dusk tone.
- **VO.** Single take, calm tour-guide energy, ~160 wpm.
- **Music.** Ambient with light strings, 85 BPM, very small build at #1.
- **Reference-required gate.** None of these are branded entities, so the gate doesn't fire. (If item #1 were "Tokyo's Shibuya Crossing", it would — see `template.json` → `referenceNotes`.)
- **CTA.** "Save this for your winter trip planning."
