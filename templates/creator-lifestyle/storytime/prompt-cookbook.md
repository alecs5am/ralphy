# Storytime — prompt cookbook

The full set of prompt fragments, model directions, and recipe details for shipping a 60-180s storytime. Read alongside `TEMPLATE.md` (structure) and `hooks.md` (pre-hook patterns).

---

## 1. Master template — the 4-act story scaffold

Storytime fits a 4-act scaffold. Every successful storytime — Drew Afualo or otherwise — maps onto it. Use this as the planning grid before writing any VO.

```
ACT 1 — PRE-HOOK + SETUP (0-10s)
  beat 1.1   pre-hook line                  ~2s    talking-head, lean-in
  beat 1.2   setup (where, when, who)       ~6s    talking-head, light gesture
  beat 1.3   the turn ("…and that's when")  ~2s    talking-head, eyebrow lift
  >> INTERRUPT #1 (screenshot or b-roll)             frames 270-330

ACT 2 — RISING TENSION (10-40s)
  beat 2.1   first escalation                ~8s   talking-head
  >> INTERRUPT #2 (screenshot insert)                frames 540-600
  beat 2.2   second escalation               ~8s   talking-head
  >> INTERRUPT #3 (b-roll cutaway)                   frames 870-930
  beat 2.3   the moment it tipped            ~8s   talking-head, lean-in

ACT 3 — PEAK + REACTION (40-70s)
  beat 3.1   peak moment                     ~10s  talking-head, big gesture
  >> INTERRUPT #4 (zoom-shake or thought-bubble)     frames 1380-1440
  beat 3.2   immediate reaction              ~10s  talking-head, hand-to-face
  >> INTERRUPT #5 (screenshot of aftermath)          frames 1710-1770

ACT 4 — PAYOFF or CLIFFHANGER (70-90s)
  beat 4.1   the punchline OR cliffhanger    ~10s  talking-head, slow-down
  beat 4.2   outro reaction                  ~5s   talking-head, smirk / sigh
              caption "PART 2 ↗" (cliffhanger variant only)
```

**Cadence rule.** Sparse cadence = interrupt every 12-15s (~3-4 inserts in a 90s video). Busy cadence = interrupt every 5-8s (~6-8 inserts). Default sparse for dramatic / true-crime; busy for comedic / Gen-Z.

**90s vs 180s.** For 180s, repeat ACT 2 (rising-tension) once more — beats 2.4 / 2.5 / interrupts #6-7 — before ACT 3. Don't pad ACT 1 or ACT 4; pad only the tension spine.

---

## 2. Talking-head prompt vocabulary

The talking-head clips are the spine. Every clip is i2v from the same character keyframe so the narrator stays consistent.

### Character keyframe (gemini-3-pro-image-preview)

Generate one selfie keyframe and reuse it across every talking-head clip.

```
Photoreal selfie portrait of [archetype], front-facing camera angle slightly
below eye level (selfie tilt, ~10° up). Tight framing — head and shoulders
fill the 9:16 frame, slight breathing room above the head. Natural daylight
from a window off to one side, soft shadows. Eyes warm and engaged, looking
slightly off-camera (~5° from lens, conversational). Mouth relaxed,
beginning of a sentence. Background is a real domestic environment — [bedroom
with unmade bed / kitchen with morning light / car driver-seat / living room
sofa / hallway with art prints], slightly out of focus. No studio lighting,
no ring-light reflection in the eyes. Skin texture visible — not retouched.
Wardrobe casual, contemporary, [archetype-appropriate]. Phone-camera
aesthetic, modest sensor noise. 9:16, 1080×1920.
```

**Archetype slots:**
- **Gen-Z urban** — 19-23, oversized hoodie or tank, dorm or apartment.
- **Millennial professional** — 28-35, casual sweater or blouse, home office or kitchen.
- **Stay-at-home parent** — 30-40, casual layers, kitchen or living room with kid-stuff blurred.
- **Older confidant** — 40-55, fitted top, neutral home environment.

### Talking-head i2v prompts (kling-v3.0-pro)

For each beat, write a 2-3 sentence prompt that describes the *action* the narrator performs while talking. Kling will handle motion; we don't need exact lip-sync because VO is added separately and captions cover any drift.

**Lean-into-camera (pre-hook, peak moments):**
```
The narrator leans slightly toward the camera, eyes widening, eyebrows lift
as they begin to speak. Subtle head shake of disbelief. Conversational warmth
in the eyes. Background unchanged. Slow handheld micro-jitter. 5 seconds.
```

**Expressive-eyes (rising tension):**
```
The narrator continues speaking with animated facial expression — eyes
darting briefly aside as they recall a detail, then return to the lens.
Slight smirk forming. Hand enters frame at lower edge with a "wait for it"
gesture. Subtle shoulder shift. 5 seconds.
```

**Hand-to-face reaction (peak):**
```
The narrator's eyes go wide, mouth opens in disbelief, one hand rises to the
side of the face in a "I cannot believe this" gesture. Brief look-up at the
ceiling, then back to camera with a knowing look. 5 seconds.
```

**Slow-down (payoff / cliffhanger):**
```
The narrator's pacing slows visibly. They speak each word more deliberately,
maintaining direct eye contact with the camera. Tiny smirk at the end OR
mouth closes mid-thought (cliffhanger variant). 5 seconds.
```

**Tone modifiers — append to any of the above:**
- **Deadpan:** "Facial expression remains flat throughout, eyes do most of the work."
- **Dramatic:** "Larger gestures, more pronounced eyebrow movement, voice-implied intensity."
- **Comedic:** "Slight overacting in the reactions, brief eye-roll, exaggerated pauses."

---

## 3. Pattern-interrupt design

Pattern-interrupts are the retention engine. Without them, even a great story decays around 20s. The interrupt resets attention and visually reinforces the beat.

### Interrupt type 1 — Screenshot insert

**Purpose.** Shows the artifact the narrator is referencing — the text exchange, the email, the Reddit post, the news headline. Increases credibility of the story and gives the eye something to read while the ear listens.

**Generation prompt (gemini-3-pro-image-preview):**
```
A photorealistic [iPhone iMessage screenshot / Reddit post screenshot / email
client screenshot / news headline screenshot]. Tight crop showing only the
relevant text. Realistic UI chrome — accurate font, status bar, timestamp,
typical platform colors. Text content: "[exact text the narrator references]".
9:16 friendly aspect (or letterboxed against a soft blurred background).
1080×1920.
```

**Composition.** Hold for 1.5-2.5s. Cover 70-90% of the frame; talking-head can stay as a tiny PIP in the corner (~15% of width) or disappear entirely. Apply subtle drop-shadow and a 0.3s zoom-in (1.0 → 1.05) so it feels active, not static.

### Interrupt type 2 — B-roll cutaway

**Purpose.** Visually depict the moment the narrator just described — an environment beat, a prop close-up, a reenactment shot. Breaks the talking-head monotony.

**Generation prompt (kling-v3.0-pro, t2v or i2v):**
```
[Specific scene — "a hand pulling open a manila envelope on a wooden desk" /
"a cracked phone screen on a kitchen counter" / "an empty restaurant table
with two place settings, dim evening light"]. Handheld phone-camera
aesthetic, naturalistic light, slight focus shift. 5 seconds, 9:16, 1080×1920.
generate_audio: false.
```

**Composition.** Hold for 2-3s. Full-frame replacement of the talking-head. Cut on the narrator's word-emphasis; return on the next breath.

### Interrupt type 3 — Zoom-in shake

**Purpose.** Visual exclamation point at the peak. The same talking-head clip pushed in 1.0 → 1.4 with a 4-frame handheld shake at the apex.

**Composition.** No new asset needed. Apply in Remotion via `interpolate` on the `transform: scale()` and a small random `translate` offset on frames 1380-1392 (a 12-frame shake).

### Interrupt type 4 — Frozen-frame thought-bubble

**Purpose.** Stops time, surfaces what the narrator was thinking inside the moment. Most often used at "and that's when I realized…" beats.

**Composition.** Freeze the current talking-head frame, dim it 60%, overlay a hand-lettered thought caption (white stroke, slight rotation). Hold 1.5s. Resume.

---

## 4. Voiceover direction (ElevenLabs eleven_multilingual_v2)

Storytime VO lives or dies on emotional swing. Stable / monotone reads as flat; over-modulated reads as fake.

**Base settings:**
- `stability`: **0.35** — natural human-emotion energy. Default ElevenLabs stability is too flat for storytime.
- `similarity_boost`: 0.75
- `style`: 0.4-0.5 (lift to 0.6 for dramatic / true-crime)
- `use_speaker_boost`: true
- `model_id`: `eleven_multilingual_v2`

**Slicing strategy.** Generate one VO per beat, not one VO for the whole story. Reasons:
1. Each beat can have its own emotion — frustrated → resigned → shocked → relieved — without re-rolling the whole take.
2. Beat-level VO files are trivially re-cuttable in Remotion if a pattern-interrupt timing changes.
3. Failed gates re-run only the offending beat.

**SSML / inline directives.** ElevenLabs supports `[laugh]`, `[gasp]`, `[sigh]` inline cues. Use them sparingly at peaks — over-use sounds robotic. Pause cues (`...`, `—`) work better than literal `<break time="0.5s"/>`.

**Tonal map by act.**
- **ACT 1 (pre-hook + setup).** Slightly elevated, "you're not going to believe this" energy. Stability 0.30.
- **ACT 2 (rising tension).** Build intensity beat by beat. Stability 0.35 → 0.40.
- **ACT 3 (peak).** Highest emotion. Stability 0.30, style 0.55. Inline `[gasp]` or `[laugh]` at the apex.
- **ACT 4 (payoff / cliffhanger).** Slow down, lower volume, more intimate. Stability 0.45.

---

## 5. Captions

**Style default — HormoziCaptions.** Word-by-word, large bold sans, white text with a thick black stroke, single-word emphasis pops at peak moments. Reads as high-impact and fits the rising-tension energy.

**Alternate — TikTok-white-stroke.** Pure white, medium-weight sans, single thin black stroke, two-word groupings. Cleaner and lower-attention; fit for true-crime and family-drama where the captions shouldn't compete with the story.

**Generation.** Use OpenRouter `whisper-1` per VO beat to get word-level timestamps; aggregate the `Caption[]` array, feed to `<HormoziCaptions captions={...} />` or `<TikTokCaptions captions={...} />`.

**Hard rules:**
- Word-level timing is mandatory. Sentence-level captions kill engagement on muted playback.
- Caption text is the literal VO text — no paraphrasing, no abbreviation. The viewer is reading along.
- During screenshot inserts, dim or hide the captions if they overlap the screenshot text.
- Never auto-translate. If the brief is in Russian, keep captions in Russian.

---

## 6. Music

**Generation.** One ElevenLabs Music call. `force_instrumental: true`. Length = total video length + 2s tail.

**Mood by tone:**
- **Dramatic / true-crime:** "Tense ambient bed, pulsing low synth, soft string sustains, builds in intensity, no melody. 90 seconds."
- **Comedic:** "Light ukulele or muted upright bass, playful but not goofy, gentle rhythm, builds slightly. 90 seconds."
- **Deadpan / family-drama:** "Sparse piano notes, soft pad underneath, contemplative, no obvious build. 90 seconds."

**Mix:**
- Base bed at -18dB.
- Duck to **-12dB** during VO peaks (ACT 2 escalations and ACT 3 peak).
- **Lift +3dB** at the payoff frame (ACT 4 beat 4.1) for the resolved variant.
- For cliffhanger variant, hold music through the cut and let it ring 1.5s into the "PART 2 ↗" caption.
- Sting (optional) at the final frame for cliffhanger — single low piano note or reversed cymbal.

---

## 7. Eight common mistakes

1. **Pre-hook is too generic.** "So something happened" or "let me tell you a story." → Cut. Apply the hook checklist in `hooks.md` — specific noun, time anchor, implied stakes.
2. **No pattern interrupts.** A 90s talking-head with zero cutaways. Attention dies at 20s no matter how strong the story is.
3. **Payoff is weak or absent.** Story trails off, narrator says "anyway, that's it." → No payoff = no shares. Either land the punchline or break for part 2.
4. **No captions or sentence-level captions.** 85% of viewers watch muted. Sentence captions look lazy; word-level is non-negotiable.
5. **Tonal mismatch between VO and music.** Comedic VO over a tense thriller bed reads as confused. Lock the tone in the brief and apply it consistently to VO direction and music prompt.
6. **Beats don't escalate.** Each beat is roughly the same intensity. The viewer needs to feel the stakes rising; flat-line tension = scroll.
7. **Studio lighting on the talking-head.** Reads as a podcast clip pretending to be a selfie storytime. Front-camera + window light, not three-point + ring-light.
8. **Multiple narrators or location switches.** Storytime is single-character, single-setting. Cuts to a different setting break the "one person tells you a thing" intimacy that makes the format work.

---

## 8. Worked examples

### Example A — Dating fiasco (worst third date)

**Hook.** "I cannot believe this happened on a third date."

**Setup.** "Last Friday. Sushi place, the kind with the tablets where you order yourself. He insists on showing me his app. Fine."

**Escalation beats.**
1. He orders for both of us — only things he likes.
2. He calls the waitress over to "show her something" and it's a magic trick.
3. He pulls a coin from behind her ear. She does not laugh.
4. The bill comes. He asks me to Venmo my half "before tip is calculated."

**Peak.** "And then he asked if I could also Venmo him the convenience fee."

**Payoff.** "I did not Venmo him anything. I walked outside, ordered an Uber, and on the ride home he texted me asking why I 'left so suddenly.'"

**Pattern-interrupts.** (1) Screenshot of the iMessage at the peak — "can you also send the convenience fee 🙏" with the convenience-fee line. (2) B-roll of an empty restaurant table with two place settings, dim light. (3) Zoom-shake on the magic-trick beat. (4) Screenshot of the post-Uber follow-up text.

**Tone.** Comedic. Stability 0.35, style 0.55. Music: light ukulele, playful.

**Final beat.** Resolved payoff. Music lifts +3dB on the Uber line.

---

### Example B — Work drama (the coworker who quit)

**Hook.** "My coworker just quit in the most insane way I've ever witnessed."

**Setup.** "9 AM Monday meeting. She's been here eight years. She joins late on her phone, camera off."

**Escalation beats.**
1. She unmutes mid-presentation and says "I have an announcement."
2. She turns the camera on — she's at the airport.
3. She reads a 90-second resignation letter that names three specific people in the meeting.
4. The CEO is one of them. He's on the call.

**Peak.** "And then she said: 'My flight is in twenty minutes. Don't email me.' And left the call."

**Payoff cliffhanger.** "I cannot tell you what happened in the next ten minutes on that call. Part 2 will explain why I'm also looking for a job now."

**Pattern-interrupts.** (1) Screenshot of an "Out of Office: do not email" auto-reply. (2) B-roll of an empty office desk with a laptop closing on its own. (3) Frozen-frame thought-bubble at "the CEO is one of them" — caption "wait."

**Tone.** Deadpan. Stability 0.40, style 0.45. Music: sparse piano, contemplative.

**Final beat.** Cliffhanger. Caption "PART 2 ↗", music holds 1.5s past the cut.

---

### Example C — Parenting storytime (toddler and the toilet)

**Hook.** "I was today years old when I learned my two-year-old can lock a bathroom door from the inside."

**Setup.** "Tuesday morning. I'm making coffee. He's been quiet for ninety seconds, which is the most dangerous sound a parent can hear."

**Escalation beats.**
1. I find him in the bathroom with the door closed.
2. The door is locked.
3. I hear the toilet flush. Repeatedly.
4. I hear the words "uh oh" through the door, said with confidence.

**Peak.** "I broke down our bathroom door with a coat hanger and a butter knife. There was a Roomba in the toilet."

**Payoff.** "The Roomba did not survive. The toddler is fine. I now own a screwdriver."

**Pattern-interrupts.** (1) B-roll of a closed bathroom door from the outside. (2) Screenshot of a Roomba product page on Amazon — "out of stock." (3) Zoom-shake on "Roomba in the toilet."

**Tone.** Comedic / exhausted. Stability 0.35, style 0.50. Music: light ukulele, slightly resigned energy.

**Final beat.** Resolved payoff. Music holds, soft outro.

---

### Example D — High-school throwback (the prank)

**Hook.** "I have to tell you about the prank that got my entire senior class banned from prom."

**Setup.** "2014. Small high school in the midwest. The administration was famously humorless."

**Escalation beats.**
1. Someone — let's call them Steve — found out the principal's office key was the same as the music room.
2. Over spring break, six of us moved every single chair from the auditorium into the principal's office. Stacked floor to ceiling.
3. We did not get caught. The principal could not open his door for two days.
4. The administration announced "an internal investigation" at assembly.

**Peak.** "Steve confessed. Steve confessed *under no pressure*. Steve confessed because he wanted credit."

**Payoff cliffhanger.** "Twelve of us got banned from prom for a thing six of us did. I'm still angry. Part 2 is what we did at graduation."

**Pattern-interrupts.** (1) Screenshot of a fake school-assembly slide "internal investigation underway." (2) B-roll of a stack of folding chairs in a narrow office. (3) Frozen-frame thought-bubble on "Steve confessed" — caption "we did not ask him to."

**Tone.** Comedic / mock-aggrieved. Stability 0.35, style 0.55. Music: light ukulele.

**Final beat.** Cliffhanger. Caption "PART 2 ↗".

---

## 9. Quick checklist before render

- [ ] Pre-hook line passes the `hooks.md` checklist (specific noun, time anchor, implied stakes).
- [ ] Story has 3-5 escalating beats; each is more charged than the last.
- [ ] Pattern-interrupts placed every 8-15s (sparse) or 5-8s (busy).
- [ ] At least 3 interrupts in a 90s video; at least 6 in a 180s video.
- [ ] Final beat is a clear payoff or a deliberate cliffhanger — not a fade-out.
- [ ] Captions are word-level, in the original VO language.
- [ ] Music tone matches VO tone; ducks at VO peaks; lifts at payoff.
- [ ] One narrator, one setting, throughout.
- [ ] If a real named person is in the story, a reference photo is uploaded — otherwise the brief is rephrased to a generic narrator.
