# Prompt cookbook — tutorial-how-to

How to translate a brief into prompts, step cards, VO, and a final composition. Read `TEMPLATE.md` and `hooks.md` first.

---

## Master prompt template (4-block scaffold)

Every tutorial scenario assembles from the same four blocks. Fill them in this order — never out of order, because the foreshadow depends on the payoff and the steps depend on the hook word.

```
BLOCK 1 — HOOK (0-2s)
  topic:           <one-line problem this solves>
  hook_category:   <free-cheap | secret-hidden | contrarian | urgency | list | niche-specific>
  hook_word:       <single power word, see hooks.md>
  hook_line:       <full hook, ≤ 7 words, spoken AND on-screen>
  on_screen_text:  <same hook word, large, top-third>
  visual:          <eye-contact medium OR hands-on-the-thing close-up>

BLOCK 2 — FORESHADOW (2-5s)
  payoff_preview:  <show final state for ~1s, do NOT explain>
  vo_line:         <≤ 5 words: "Here's how" / "Watch this" / "Three steps">
  on_screen_text:  <optional: a number — "3 steps" or "$4">

BLOCK 3 — STEPS (5-50s, three beats of ~15s each)
  step_1:
    transition_card: <named transition, e.g. "Let's get cooking">
    counter:         "1/3"
    action:          <ONE concrete demonstrable action>
    vo_line:         <explain WHILE doing, ≤ 15 words>
    visual_cuts:     <2-3 micro-cuts inside, 1-2s each>
  step_2: { same shape, transition_card e.g. "Now the magic", counter "2/3" }
  step_3: { same shape, transition_card e.g. "And finally", counter "3/3", cuts ~10% tighter }

BLOCK 4 — PAYOFF (50-60s)
  reveal:          <visible final state — first bite, click, number, before-after, reaction>
  vo_line:         <short, punchy. ≤ 8 words. Lands the foreshadow promise.>
  pacing:          <slow 15% on the final beat, hold reveal 1.5-2s>
  cta_card:        <optional last 1s overlay: "Try it. Tag me." / "Save this.">
```

Pass this to `/ralph-scenarist` as the brief — they'll expand it into `scenario.json` with per-scene durations, VO lines, and shot prompts.

---

## Step-card design vocabulary

The step card is the on-screen counter + label + transition wipe that anchors progress. This is what makes a 60s tutorial feel structured rather than rambling.

### Counter style

- **Position:** top-left corner, safe-area inset (~80px from top/left at 1080×1920).
- **Size:** large — ~140-180px tall. Visible at thumbnail scale.
- **Typography:** bold sans (Inter Black, Archivo Black, or similar). White on subtle dark scrim, OR colored to match the brand accent.
- **Format:** `1/3`, `2/3`, `3/3`. Use a slash, not "STEP 1" — Hoyos research shows the slashed counter reads faster.
- **Persistence:** visible the entire step duration, not only at the transition. The slot for the counter is reserved across all step beats.

### Step label

- **Position:** centered, lower-third (~75% down the frame).
- **Length:** ≤ 4 words. "Sear the bottom." / "Open Cost Explorer." / "Pat dry, then dot."
- **Animation:** word-by-word reveal in the first 0.4s of the beat, then static. Do not loop or wiggle the text — it competes with the demo.

### Named-transition wipe

- **Duration:** 0.4-0.6s. Long enough to register, short enough not to break pace.
- **Visual:** full-frame card with the transition phrase ("Let's get cooking" / "Now the magic" / "Here's the trick" / "And finally" / "Last move"). Bold typography, single solid color background that matches the music's energy.
- **SFX:** one short whoosh or pop, -6dB under VO bus. No tail.
- **Cadence pool:** keep a list of 5-10 named transitions per template instance. Don't reuse the same phrase twice in one video.

### Step transition examples (Hoyos / cooking-style)

- Step 1 → 2: "Now the fun part" / "Here's the trick" / "And then"
- Step 2 → 3: "Last move" / "Final boss" / "The closer"
- Step 3 → payoff: "Look at this" / "Now watch" / "And boom"

---

## Pacing rules (Hoyos retention discipline)

The 90% retention target is hit by enforcing these rules, not by hoping.

1. **No dead air. Ever.** The VO speaks across every beat or there is a clear visual punchline. Silence kills retention.
2. **Cut every 1-2s inside steps.** Use micro-cuts on the same action (wide → close → hands → result). The viewer's eye refreshes every 1.5s by default; don't let the brain notice the static frame.
3. **Foreshadow is at most 3s.** Longer = the open loop weakens. Show, name the promise, move.
4. **Step durations roughly equal.** Steps 1, 2, and 3 should each occupy 12-16s. Asymmetric steps signal a script that wasn't tightened.
5. **Step 3 is ~10% tighter than steps 1 and 2.** The eye accelerates near the payoff. Match it.
6. **Slow down 15% on the payoff.** This is the only place to breathe. Hold the result for 1.5-2s before any CTA.
7. **No filler words.** "Um", "like", "basically", "so", "kind of", "you know". The VO is scripted, not freestyle. If the live take has filler, redo or cut.
8. **Never recap.** "So just to summarize, we did step 1, step 2, step 3" — instant scroll. The payoff IS the recap.
9. **Hook word = first word out of mouth.** Not the third. Not after a pre-roll. First.
10. **Captions match VO frame-accurately.** Whisper-1 transcription is fine; don't paraphrase in the burned-in caption.

---

## Sound

### Voiceover

- **Voice:** ElevenLabs `eleven_multilingual_v2`, single voice across the whole video.
- **Tone presets:**
  - `energetic-hoyos` (default): warm, leaning forward, 165-185 wpm. ElevenLabs settings: stability 0.45, similarity 0.85, style 0.35.
  - `calm-explainer` (finance, productivity): even, measured, 135-155 wpm. stability 0.65, similarity 0.85, style 0.20.
  - `authoritative-expert` (AI, tech): firm, slightly slower, 145-160 wpm. stability 0.60, similarity 0.85, style 0.25.
- **Two takes:** record the hook + 3 steps as one take, then the payoff line as a second take. The payoff sits ~5% slower for the breathe-on-reveal beat.
- **Loudness:** -16 LUFS integrated, true peak -1 dBTP.

### Music

- **Source:** ElevenLabs Music, single bed for the whole video.
- **BPM:** 110-130. Below 110 reads sluggish; above 130 fights the VO.
- **Genre cue:** "upbeat instrumental tutorial bed, light percussion, no vocals, optimistic, no melodic vocal pads."
- **Duck:** -10dB under VO. -6dB during named-transition wipes (let the SFX punch).
- **Optional rising fill** at the step-3 → payoff transition (~48s). This tells the ear "here it comes."

### SFX

- **Transition whoosh** on each named-transition wipe. -6dB under VO.
- **Click / pop** when the step counter advances (0.1s). Subtle.
- **Reveal sting** at the start of the payoff (50s). One short bell or rising note. Optional.

---

## 8 mistakes-with-fix

1. **Hook is a question.**
   - Bad: "Want to save money on groceries?"
   - Fix: lead with a power word and a number. "$4 dinner. Watch."

2. **Foreshadow tells the steps.**
   - Bad: "I'm going to show you how to chop, sear, and plate this in three steps."
   - Fix: show the result for 1s, name the promise, move on. "$90 dinner for $4. Watch."

3. **Steps drift abstract.**
   - Bad (step 1): "Audit your subscriptions."
   - Fix: a concrete demonstrable action with a visual. "Open the Manage Subscriptions screen and tap Cancel on the top three."

4. **No named transitions.**
   - Bad: "Step 1, step 2, step 3" titles only.
   - Fix: pair the counter with a phrased transition card. "Let's get cooking" → 1/3. "Now the magic" → 2/3. "Last move" → 3/3.

5. **Step durations imbalanced.**
   - Bad: step 1 is 5s, step 2 is 25s, step 3 is 10s.
   - Fix: rebalance to ~15s each. If a step needs more, the topic is too complex for 60s.

6. **Payoff is a CTA.**
   - Bad: "Follow for more!" as the final beat.
   - Fix: the payoff is the visible result you promised. CTA is a 1s card AFTER the payoff if at all.

7. **Captions paraphrased.**
   - Bad: VO says "And that's a $4 dinner" but caption reads "Cheap dinner done."
   - Fix: caption matches VO word for word. Use whisper-1 transcription on the rendered VO, not your script.

8. **Trying to fit 5+ steps into 60s.**
   - Bad: 5 steps × 12s each = no room for hook, foreshadow, or payoff.
   - Fix: cut to 3. If you can't, switch to long-form or pick a narrower slice of the topic.

---

## Worked examples

### Example 1 — Cooking (Jenny Hoyos style)

```
BLOCK 1 — HOOK
  topic:           how to make a $90-tasting dinner for $4
  hook_category:   $1 / cheap-number
  hook_word:       $4
  hook_line:       "$4 dinner that tastes like $90."
  on_screen_text:  "$4"
  visual:          eye-contact medium, creator at kitchen counter, ingredients in foreground

BLOCK 2 — FORESHADOW (2-5s)
  payoff_preview:  1s shot of the finished plate, steam rising
  vo_line:         "Three steps. Here we go."
  on_screen_text:  "3 steps"

BLOCK 3 — STEPS
  step_1:
    transition_card: "Let's get cooking"
    counter:         "1/3"
    action:          buy the cheap cut, salt heavy, rest 10 min
    vo_line:         "Cheap cut. Salt heavy. Rest ten."
    visual_cuts:     [package shot → salt pour close-up → resting timer]
  step_2:
    transition_card: "Now the magic"
    counter:         "2/3"
    action:          screaming-hot pan, sear without moving
    vo_line:         "Pan screaming. Don't touch it for two minutes."
    visual_cuts:     [pan smoke → meat hits → side-on sear]
  step_3:
    transition_card: "Last move"
    counter:         "3/3"
    action:          butter-baste with thyme + garlic
    vo_line:         "Butter, thyme, garlic. Spoon it over."
    visual_cuts:     [butter melts → herb drops → baste close-up]

BLOCK 4 — PAYOFF (50-60s)
  reveal:          first-bite reaction, slow-mo cut into steak
  vo_line:         "And that's $4."
  cta_card:        "Save this."
```

### Example 2 — AI productivity hack

```
BLOCK 1 — HOOK
  topic:           ChatGPT system prompt that turns it into a research analyst
  hook_category:   stolen / borrowed
  hook_word:       Stole
  hook_line:       "Stole this prompt from a $400/hr consultant."
  on_screen_text:  "STOLE."
  visual:          hands-on-laptop close-up, ChatGPT screen visible

BLOCK 2 — FORESHADOW
  payoff_preview:  1s shot of a long structured ChatGPT answer with bullet points
  vo_line:         "It replaces an analyst. Three blocks."

BLOCK 3 — STEPS
  step_1:
    transition_card: "First block"
    counter:         "1/3"
    action:          paste the role + objective
    vo_line:         "Tell it WHO it is and WHAT to optimize for."
    visual_cuts:     [paste action → highlighted text → cursor blink]
  step_2:
    transition_card: "Now the trick"
    counter:         "2/3"
    action:          give it the constraints (length, format, sources)
    vo_line:         "Constraints kill rambling. Length, format, sources."
    visual_cuts:     [type constraints → enter key → typing dots]
  step_3:
    transition_card: "Last block"
    counter:         "3/3"
    action:          ask for the chain-of-reasoning at the end, not the start
    vo_line:         "Ask for reasoning AT THE END. Better answers."
    visual_cuts:     [add the line → submit → answer streams in]

BLOCK 4 — PAYOFF
  reveal:          full ChatGPT response scrolling, side-by-side with a "before" mediocre answer
  vo_line:         "Same model. Different output."
  cta_card:        "Steal it."
```

> Reference note: the on-screen ChatGPT UI should ideally come from a user-supplied screenshot. Without a reference, the model will hallucinate the UI. Treat as `requiresUserReference: true` for this specific instantiation if the screen is on-camera.

### Example 3 — Money-saving finance hack

```
BLOCK 1 — HOOK
  topic:           cancel three SaaS subscriptions in 90 seconds
  hook_category:   speed / urgency
  hook_word:       90 seconds
  hook_line:       "Cancel $200/mo in 90 seconds."
  on_screen_text:  "$200 / 90s"
  visual:          phone in hand, settings screen, top-down shot

BLOCK 2 — FORESHADOW
  payoff_preview:  1s shot of a dashboard total dropping
  vo_line:         "Same screen on iPhone and Android."

BLOCK 3 — STEPS
  step_1:
    transition_card: "Open this screen"
    counter:         "1/3"
    action:          Settings → Apple ID → Subscriptions
    vo_line:         "Settings. Your name. Subscriptions."
    visual_cuts:     [tap Settings → tap name → tap Subscriptions]
  step_2:
    transition_card: "The audit"
    counter:         "2/3"
    action:          read down the list, mark anything not used in 30 days
    vo_line:         "If you didn't open it this month, it's gone."
    visual_cuts:     [scroll list → highlight unused apps → finger taps]
  step_3:
    transition_card: "The cut"
    counter:         "3/3"
    action:          tap each, Cancel Subscription, confirm
    vo_line:         "Cancel. Confirm. Repeat."
    visual_cuts:     [tap → cancel button → confirm → green check]

BLOCK 4 — PAYOFF
  reveal:          before/after of the monthly total, "before $247 → after $43"
  vo_line:         "That's $204 saved. Per month."
  cta_card:        "Do this tonight."
```

### Example 4 — Beauty hack (under-eye fix)

```
BLOCK 1 — HOOK
  topic:           three-product fix for tired under-eye bags before a meeting
  hook_category:   speed / niche-specific
  hook_word:       30 seconds
  hook_line:       "Under-eye bags gone in 30 seconds."
  on_screen_text:  "30s."
  visual:          tight close-up of the eye area, soft natural light

BLOCK 2 — FORESHADOW
  payoff_preview:  half-face split — left side tired, right side smooth
  vo_line:         "Three products. That's it."

BLOCK 3 — STEPS
  step_1:
    transition_card: "Cool the area"
    counter:         "1/3"
    action:          press a chilled metal roller for 10 seconds
    vo_line:         "Cold metal. Ten seconds. Each side."
    visual_cuts:     [roller from fridge → press under-eye → close-up of skin]
  step_2:
    transition_card: "Color correct"
    counter:         "2/3"
    action:          dot peach corrector with ring finger
    vo_line:         "Peach corrector. Ring finger. Dot, don't drag."
    visual_cuts:     [product close-up → finger tap → blended texture]
  step_3:
    transition_card: "Set and go"
    counter:         "3/3"
    action:          press translucent powder with a damp sponge
    vo_line:         "Damp sponge, light powder. Press, don't sweep."
    visual_cuts:     [sponge press → powder dust → final close-up]

BLOCK 4 — PAYOFF
  reveal:          full-face shot, no transition cuts, smooth under-eye
  vo_line:         "And that's the meeting face."
  cta_card:        "Try it tomorrow."
```

> Reference note: if any product on screen is branded, supply a reference image. Generic-tube depictions are fine for unbranded demos but will read as off if the user names the product.

---

## Handing off to the pipeline

Once you've filled the 4-block scaffold:

1. `ralphy project create` with the topic, then write the scaffold to `workspace/projects/<id>/brief.md`.
2. Hand to `/ralph-scenarist` to expand into `scenario.json` (per-scene durations, VO lines, shot prompts).
3. `/ralph-art-director` generates keyframes, video clips, VO, and music per `template.json → stackSummary`.
4. `/ralph-editor` composes in Remotion using the step-card design vocabulary above.
5. `ralphy render <project>` to produce the MP4. Verify retention discipline (no dead air, balanced step durations, payoff held 1.5-2s) before publishing.
