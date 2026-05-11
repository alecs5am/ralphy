# Life-Changing Testimonial — prompt cookbook

Concrete prompts, vocabulary, settings, and worked examples. Use this when generating assets, not when writing the scenario (scenario lives in `TEMPLATE.md` + the scenarist playbook).

---

## Master template

```
0-3s   PAIN HOOK
       Speaker straight to camera, warm window light, medium-close-up.
       VO: "[hook from hooks.md] for [specific duration]."
       No product visible. No music swell yet — just bed at -22dB.

3-15s  PAIN DETAIL
       Same shot, slight lean-in. OR: brief 3-5s pain-state b-roll cutaway.
       VO: history of past attempts, sensory detail, specific consequences.
       Bed at -20dB.

15-25s DISCOVERY
       Back to speaker, micro-shift in expression (lighter, slightly hopeful).
       VO: "Then I found [PRODUCT NAME — once, only here]."
       Bed lifts to -18dB. Optional uplift cue.

25-50s OUTCOME
       Speaker, relief micro-expressions, occasional eye-contact-break (looking
       slightly off-camera, then back — reads as recall, not script).
       VO: specific number + specific duration + specific sensory detail.
       Bed at -18dB.

50-60s SOFT CTA
       Hold on speaker. Soft smile, slight nod.
       VO: "Honestly, you should try it." / "I tell everyone now."
       Bed fades to -22dB on the last 2s.
```

## Specificity discipline

The single most important rule of this format. Numbers > adjectives. Always.

| Vague (bad) | Specific (good) |
|---|---|
| "I lost a lot of weight" | "I lost 12 pounds in 9 weeks" |
| "It cleared up my skin" | "Six weeks in, the cysts on my jaw were gone" |
| "I felt better" | "I walked three miles last Saturday — first time in four years" |
| "My business took off" | "We went from 8 booked calls a week to 31" |
| "It really helped" | "I sleep through the night now — used to wake up at 3am every day" |
| "Bad skin" | "Pillowcase covered in flakes every morning" |
| "For a while" | "Three years" |

If the user's brief doesn't supply specifics, **ask for them** before generating. Don't invent numbers — fabricated numbers in a testimonial are an FTC and trust failure.

## Talking-head keyframe prompt vocabulary

For `gemini-3-pro-image-preview`. One canonical keyframe, reused across all talking-head clips for character consistency.

**Required terms:**
- `medium close-up, eye-level, 9:16 vertical`
- `warm window light from camera-left` (or right — pick one and keep it consistent)
- `soft natural skin texture, no airbrushing, slight imperfections visible`
- `eye contact with camera`
- `relaxed shoulders, slight forward lean`
- `everyday clothing — t-shirt / hoodie / casual sweater, single solid color`
- `realistic background — couch / kitchen / car / bedroom — slightly out of focus`

**Avoid:**
- `studio lighting` (reads as ad)
- `model-pretty` / `professional headshot` (kills peer-trust)
- `perfect skin` / `flawless` (uncanny + breaks the testimonial premise — the speaker just had a problem)
- `holding product` (product is not the visual hero in this format)
- `branded background` / `logo visible` (let the VO mention the brand, not the visual)

**Niche-specific overlay terms:**
- Skincare: `clear skin with subtle texture, no makeup or minimal makeup, soft daylight`
- Nutra: `mid-30s to mid-50s, slightly tired but warm, kitchen or living-room background`
- Fitness: `athletic wear, post-workout glow OR casual streetwear, gym or home-gym in background`
- Software: `home office, plant in background, casual button-up or hoodie, mid-20s to mid-40s`
- Education: `bookshelf or desk in background, casual sweater, mid-20s to mid-30s`

## Talking-head clip prompt vocabulary (i2v)

For `veo-3.1` (premium) or `kling-v3.0-pro` (budget). One clip per ~8s of talking-head. Lip-sync to the VO.

**Required motion terms:**
- `subtle natural micro-movements`
- `occasional small head tilt`
- `realistic blinking`
- `occasional eye-contact break — glance slightly off-camera, then back` (reads as recall, not script)
- `lean slightly into camera at emotional beats`
- `relief micro-expression at outcome beat — soft exhale, half-smile`

**Avoid:**
- `dramatic gestures` (reads as performance, not testimony)
- `wide arm movements` (breaks the medium-close-up frame)
- `pacing` / `walking` (testimonial is stationary)
- `looking directly into camera the entire time` (uncanny — real people break eye contact)

**Premium-vs-budget call.**
- Use `veo-3.1` when lip-sync fidelity is trust-critical (any niche where the speaker's mouth is visible in close-up the whole time, especially long talking-head segments). The lip-sync premium is what sells the realism.
- Drop to `kling-v3.0-pro` when cost matters more — niches that tolerate brief cutaways or stylized framing (fitness gym shots, software screen-record cutaways).

## VO direction (ElevenLabs)

```
model: eleven_multilingual_v2
voice: warm, conversational, mid-range — NOT a polished announcer voice
stability: 0.4          # warmth + slight variation
similarity_boost: 0.75
style: 0.0              # no exaggeration
use_speaker_boost: true
```

**Direction in the VO text itself:**
- Write as one continuous monologue, not as scripted bullet points.
- Include verbal hesitations sparingly: `"I... I tried everything."` — but don't overdo it; ElevenLabs renders ellipses as small pauses naturally.
- Avoid exclamation marks. The format is confiding, not exclamatory.
- One brand mention only. At the discovery beat. Never in the hook, never in the CTA.
- End on a soft fall, not a rise. The last line shouldn't sound like a pitch close.

**Read it back rule.** Before generating: read the VO out loud as if telling a friend. If it sounds like an ad, rewrite it.

## Captions

ElevenLabs Scribe v1 for word-level timestamps. Style depends on niche:

| Niche | Caption style | Why |
|---|---|---|
| Skincare | Minimal-bottom, white sans-serif, 1 line, no animation | Calm, trustworthy, doesn't compete with the face |
| Nutra | Minimal-bottom, white sans-serif, 1 line | Same — credibility-led, calm |
| Fitness | Hormozi-yellow word-level, mid-frame | High-energy retention, gym audience expects it |
| Software | Hormozi-yellow word-level, mid-frame | High-energy retention, productivity audience expects it |
| Education | Hormozi-yellow word-level, mid-frame | Same |
| Service | Minimal-bottom OR Hormozi — pick by audience age (older = minimal) | Audience-led |

**Always-on caption rules** (regardless of style):
- Word-level timing, not phrase-level. The viewer's eye locks to the highlighted word.
- Cap line length at 3-4 words for Hormozi, 6-8 for minimal.
- Position: lower third for minimal, mid-frame for Hormozi (so it doesn't fight the face).
- No ALL CAPS for the whole caption — only emphasis words in Hormozi style.

## Music

ElevenLabs Music. Single warm low-volume bed under the entire VO.

```
prompt: "warm acoustic bed, soft piano and light strings, mid-tempo, no drums,
         no melody hooks, ambient and supportive, [niche-mood-modifier]"
duration: matches video length (30-60s)
```

**Niche modifiers:**
- Skincare: `gentle, calming, dawn-like`
- Nutra: `warm, hopeful, slightly nostalgic`
- Fitness: `quietly determined, mid-energy, hopeful`
- Software: `confident, modern, light electronic textures`
- Education: `curious, light, optimistic`

**Mix levels (in composition):**
- Bed default: -20 dB.
- Push to -22 dB during the pain-detail segment (let the VO breathe).
- Lift to -18 dB at the discovery beat (emotional turn).
- Hold -18 dB through the outcome.
- Fade to -22 dB on the last 2s of the CTA.

**Optional uplift cue.** A single 1-2s music swell at the discovery moment (15-25s). Not a drop, not a beat — just a key/tone lift. Use sparingly; overuse breaks the testimonial-realness.

## B-roll cutaway (optional)

One brief 3-5s pain-state shot OR product hero shot. **Not a montage.** A montage breaks the testimonial premise.

**Pain-state b-roll examples:**
- Skincare: close-up of a flaky pillowcase OR mirror reflection of acne (NOT the speaker's mirror reflection — that breaks character continuity; use a generic shot)
- Nutra: close-up of hands struggling to open a jar OR feet at the bottom of stairs
- Fitness: tired exhale on the couch OR a cluttered fridge
- Software: cluttered inbox screen OR a calendar full of conflicts
- Education: closed laptop, untouched for hours

**Product hero b-roll** (when used): single 3-5s shot of the product on a real surface (kitchen counter, bathroom shelf, desk), warm light, NO logos in the frame except the product's own. Reference-required.

**Placement:** during the 3-15s pain-detail segment for pain-state cutaways, or during the 15-25s discovery beat for product cutaways. Never both — pick one.

## 8 mistakes to refuse

1. **Vague claims.** "I feel better" with no specifics. → Refuse, ask for numbers.
2. **No specific numbers.** "Lost a lot of weight" / "skin cleared up some". → Refuse, ask for the actual outcome metric.
3. **Salesy tone.** VO sounds like a pitch ("Don't miss out!"). → Rewrite as confiding monologue.
4. **Product becomes the visual hero.** Speaker holding the product up to camera, multiple product close-ups. → Cut to one mention, no product hero shot unless it's the optional brief b-roll.
5. **Music too loud.** Bed at -12 dB or louder competing with VO. → Drop to -18 to -22 dB.
6. **No captions.** 70%+ of TikTok views are sound-off. → Always caption.
7. **Hard CTA on a soft hook.** "I cried every day" opener paired with "Use code SAVE20 link in bio" close. → Match CTA strength to hook stakes.
8. **Fabricated outcomes.** Model invents "12 pounds in 9 weeks" because the brief just said "lost weight". → **Never.** Refuse and ask the user for the real number, or keep it qualitative.

## 4 worked examples

### Example 1 — Skincare / acne testimonial

**Brief.** Real product `ClearGlow Serum`. Speaker = woman, late 20s, professional but relatable. Outcome: cysts on jaw cleared in 6 weeks. Past failures: dermatologist's accutane recommendation, three different drugstore brands. Tone: heartfelt-emotional. CTA: soft.

**Hook.** #11 — "My dermatologist said I'd need accutane forever."
**VO outline:**
> "My dermatologist said I'd need accutane forever. I tried three drugstore brands, two prescription creams, an elimination diet — nothing touched the cysts on my jaw. I cancelled dates. I avoided cameras. Then a friend sent me ClearGlow Serum. Six weeks in, the cysts were gone. Like — actually gone. I cried the first morning I woke up to clear skin. Honestly, you should try it."

**Visual.** Speaker keyframe: late-20s woman, warm window light, kitchen background, no makeup, soft natural skin with subtle remaining texture (NOT flawless — she just had a problem). Captions: minimal-bottom white. Music: warm-bed gentle. B-roll: optional 4s shot of pillowcase with flakes during pain-detail segment.

### Example 2 — Nutra / joint pain testimonial

**Brief.** Real product `MoveWell Joint Complex`. Speaker = man, mid-50s, was a runner. Outcome: walks 3 miles daily after 12 years of pain. Past failures: cortisone shots, physical therapy, glucosamine. Tone: matter-of-fact-relieved. CTA: soft.

**Hook.** #7 — "Twelve years of knee pain. And then, six weeks ago…"
**VO outline:**
> "Twelve years of knee pain. I tried cortisone — wore off in three months. Physical therapy — helped a little. Glucosamine — nothing. I'd basically accepted that running was over for me. Then six weeks ago my brother handed me a bottle of MoveWell. I walked three miles last Saturday. Three miles. First time in four years. I'm not paid to say this — I just genuinely needed to share it. You should try it."

**Visual.** Speaker keyframe: mid-50s man, warm window light, living-room background, casual sweater, slightly tired but warm expression. Captions: minimal-bottom. Music: warm-bed hopeful. B-roll: optional 4s shot of feet at the bottom of stairs during pain-detail.

### Example 3 — Fitness / body recomp testimonial

**Brief.** Real program `LeanShift 12-Week`. Speaker = woman, mid-30s, mom of two. Outcome: 8 pounds lost, 12 weeks, specific routine (3x/week, 30 min). Past failures: home workouts, two gyms, Noom. Tone: hyped-grateful. CTA: hard.

**Hook.** #4 — "I almost gave up on getting my body back after my second kid."
**VO outline:**
> "I almost gave up on getting my body back after my second kid. I tried home workouts — gave up in two weeks. Joined two gyms — barely went. Did Noom for three months — nothing changed. LeanShift was the first thing where the routine actually fit my life. Three days a week, thirty minutes. Twelve weeks in, eight pounds down — and I can do a full pull-up for the first time in my life. Link in bio. You won't regret it."

**Visual.** Speaker keyframe: mid-30s woman, athletic wear, post-workout glow, home-gym background. Captions: Hormozi-yellow word-level mid-frame. Music: warm-bed quietly determined. B-roll: optional 4s split-screen before/after photos at the outcome beat (user-supplied).

### Example 4 — Software / saved my business testimonial

**Brief.** Real product `LeadFlow CRM`. Speaker = man, late 30s, agency owner. Outcome: from 8 booked calls/week to 31 in 9 weeks; saved 14 hours/week. Past failures: 3 other CRMs, a VA, manual spreadsheets. Tone: matter-of-fact-relieved. CTA: soft.

**Hook.** #4 — "I was about to shut my agency down."
**VO outline:**
> "I was about to shut my agency down. We were doing eight booked calls a week — couldn't break through. I tried three other CRMs, hired a VA, ran spreadsheets myself at midnight — nothing scaled. Switched to LeadFlow nine weeks ago. We're at thirty-one booked calls a week now. I got fourteen hours back. I'm sleeping again. I tell every founder I know about this one. Honestly — you should try it."

**Visual.** Speaker keyframe: late-30s man, home office, plant in background, hoodie. Captions: Hormozi-yellow word-level. Music: warm-bed confident. B-roll: optional 4s cluttered-calendar screen during pain-detail.

---

## Compliance note

Avoid medical claims that require regulatory backing. Keep claims experiential ("my joints feel better", "I sleep through the night now", "my skin cleared up") — not therapeutic ("cured my arthritis", "fixed my insomnia", "treated my acne"). When the brief asks for a therapeutic claim, soften it and flag the change to the user. Outcome numbers must come from the user's brief; never fabricate. When the speaker is presented as paid / sponsored / affiliate, do not use hook #8 ("I'm not paid to say this") — that's FTC fraud.
