# Interview / Dialog — prompt cookbook

Concrete recipes for generating a 30-90s synthetic two-person dialog. Mirror these and ralphy the rest.

---

## Master template (alternating-turn scaffold)

```
[2-shot establish, 0-3s]
  Both speakers visible (single frame OR split). First question / setup line from A.

[Turn 1 — Speaker A, 3-6s]
  Question or claim. Sets up the answer.

[Turn 2 — Speaker B, 5-12s]
  Answer. The substance / payoff for the turn.

[Optional reaction beat — Speaker A, 1-3s]
  "Hmm." "Really?" Brief laugh. Single-shot of A reacting.

[Turn 3 — Speaker A, 3-6s]
  Follow-up question or counter.

[Turn 4 — Speaker B, 5-12s]
  Deeper answer or pivot.

[Optional b-roll cutaway, 5-10s]
  When the topic gets visual: chart, product, screenshot. kling-v3.0-pro shot.
  Voiceover from B continues (or A narrates over).

[... continue alternating ...]

[Closing — 2-shot or single, last 5-10s]
  Punchline, takeaway, or shared laugh. Often back to 2-shot.
```

Keep each turn within the pacing rule below — long turns kill the back-and-forth rhythm that makes the format work.

---

## Two-character consistency

This is the hardest part of synthetic dialog. If Speaker A's face / hair / shirt drifts between cuts, the format breaks instantly. Recipe:

1. **Generate two character keyframes once, up front, with `gemini-3-pro-image-preview`.**
   - Keyframe A: Speaker A, neutral expression, mid-shot, the exact lighting and environment they'll appear in.
   - Keyframe B: Speaker B, neutral expression, mid-shot, same environment if podcast/peer; different but consistent environment if remote/split-screen.
2. **Use those keyframes as ref-image on every `wan-25` call.**
   - Speaker A turns → ref-image is Keyframe A.
   - Speaker B turns → ref-image is Keyframe B.
   - Never let the model "improvise" the face turn-to-turn. Always anchor.
3. **For 2-shots and split-screens:** generate a third keyframe (`gemini-3-pro` with both Keyframe A and Keyframe B as multi-ref) showing both speakers in frame. Use that as the ref for the 2-shot turn(s).
4. **Lock prompt vocabulary across turns.** Same descriptors for face / hair / clothing / lighting in every turn's prompt — copy-paste, don't paraphrase. Paraphrasing = drift.

`/ralph-art-director` will refuse to call `wan-25` for a turn without a ref-image once `requiresUserReference=false` archetype-keyframe path is initialized — this is the consistency gate.

---

## Turn-pacing rules

| Turn type | Duration | Notes |
|---|---|---|
| Question | 3-6s | Short. A pointed question pulls the viewer in; a long-winded one bleeds attention. |
| Answer | 5-12s | The substance. Don't go past 12s without a cut — even an answer this long should have a mid-cut to a B-shot or 2-shot. |
| Reaction | 1-3s | "Hmm." "Wait, what?" Short. These are texture, not content. Skip them on a 30s version. |
| 2-shot anchor | 2-3s | First 2-3s of the video, and again at the closing. Re-establishes the pairing. |
| B-roll cutaway | 5-10s | Mid-dialog only. Triggered when the topic mentions something visual. |

**Rule of thumb:** a 60s video has 6-8 turns. A 90s video has 8-12 turns + one b-roll. A 30s video has 3-4 turns and no b-roll.

---

## Camera language

Three modes — pick one per project, don't mix.

### single-camera-cuts

The most common, the most flexible. There is no real "two cameras" — `wan-25` generates each turn as a single-camera shot of the active speaker. At edit time, cut between A and B on the speech turn.

- Speaker A turn → A-shot, mid-frame, looking slightly off-camera (toward the imagined B).
- Speaker B turn → B-shot, mid-frame, looking the OTHER way (toward the imagined A).
- Eyelines must be opposite, or the cut reads wrong (both looking the same direction = "they're not talking to each other").
- 2-shot establish at the start uses the multi-ref keyframe.

### split-screen-static

Both speakers visible the entire time, side-by-side (vertical 9:16: stacked top/bottom is more readable than left/right). Lower-third caption indicates active speaker via color change.

- Both halves rendered separately as `wan-25` clips, composed side-by-side at edit time.
- Active-speaker half lights slightly brighter; inactive half dims by 10-15%.
- Caption color flips on speaker change. Speaker A = one color, Speaker B = another.
- No real cuts within turns — variation comes from facial expression.

### podcast-2-cam-setup

Sit-down environment (table, mics implied or explicit). Two cameras, one over each speaker's shoulder. Cut between them on speech turns. Most "real podcast" feeling.

- Each turn: shot is over the listening speaker's shoulder, looking at the talking speaker.
- 2-shot establish at the start uses a wider frame showing both at the table.
- B-roll cutaways fit naturally — "and look at this chart" → cut to chart, voice continues.

---

## Voice picks (TWO distinct voices)

Pick from the ElevenLabs voice library by listening — voice IDs in `MODELS.md` may be stale. The pairing rules:

1. **Gender or timbre contrast required.** Two similar voices = listener confusion = format death. Easiest: one male, one female. Next-easiest: one low-and-warm, one bright-and-energetic.
2. **Match voice to archetype.** Journalist = neutral, articulate, slight skepticism. CEO = confident, measured. Friend-A = warm, conversational. Expert = authoritative, slightly didactic. Don't pick a "pretty" voice that fights the role.
3. **Lock voice IDs in the project at start.** Don't swap mid-video, don't try a different voice per turn. Voice = identity in audio-first formats.
4. **Use `eleven_multilingual_v2`** for both — same model, two voice IDs. Keep stability / similarity / style settings consistent across both.

In `ralphy generate voiceover` calls, the project config pins:

```
speakerA.voiceId = <ElevenLabs voice ID 1>
speakerB.voiceId = <ElevenLabs voice ID 2>
```

Every line in the dialog script is tagged `A:` or `B:` and routed accordingly.

---

## Captions

- **Engine:** ElevenLabs Scribe v1, word-level timing.
- **Style:** lower-third, MinimalCaptions base, NOT Hormozi (this format is conversational, not punchy-yelly).
- **Speaker color-coding:** Speaker A = one color (e.g. soft cyan), Speaker B = another (e.g. warm amber). Color flips on speaker change — the eye knows who's "active" without reading the lower-third name.
- **Optional name tag** on lower-third: "A — [archetype role]" / "B — [archetype role]". Persistent for the full duration in expert-interview mode; flashes only on first appearance for peer-discussion.
- **No captions during reaction beats** under 2s — they look stuttery. Caption picks up on the next full turn.

---

## B-roll cutaways

Triggered when a turn references something visual. Examples: "look at this chart", "here's the product I'm talking about", "this is what the screen looked like."

- **Model:** `kwaivgi/kling-v3.0-pro` (5-10s clip, no audio — keep speaker VO underneath).
- **Placement:** mid-dialog only. Never as the first or last shot.
- **Length:** 5s default; up to 10s if the visual is genuinely complex (animated chart, product 360, screenshot walkthrough).
- **Audio underneath:** speaker B's VO continues over the cutaway. The cutaway IS the visual answer to a question; the audio is the verbal answer.
- **Cap one cutaway per video.** More than one and the format drifts toward "explainer with B-roll" — different template.

Example trigger: A asks "how much did this actually cost?" → B starts answering "well, last quarter we saw —" → cut to a kling-v3.0-pro shot of an animated bar chart for 6s → cut back to B finishing "...so about 30% lower than industry standard."

---

## Music

- **Engine:** ElevenLabs Music, single track for full duration.
- **Vibe:** ambient professional bed. "Podcast intro" / "documentary underscore" energy. NOT melodic, NOT memorable, NOT trending.
- **Volume:** -22dB nominal, ducked further (-28dB) during speech peaks via composition-time sidechain or static keyframes.
- **No drops, no swells.** The dialog carries the energy. Music is wallpaper.
- **One call only.** Don't generate a separate "before music" / "after music" — that's `before-after-product`, not this.

---

## AI disclosure

No on-screen AI-disclosure overlay — viewers consistently react negatively to visible AI labels and retention drops. C2PA provenance metadata is still emitted automatically by `ralphy render` with `genai: true` so the platform-side flag is honored without the visible-text penalty.

---

## 8 mistakes (refuse / fix at gate)

1. **Two voices that sound too similar.** Listener loses track of who's talking. Fix: re-pick with explicit timbre / gender contrast.
2. **Turns longer than 12s.** Rhythm dies. Fix: split with a reaction beat or a B-shot insert.
3. **No 2-shot anchor.** Cuts straight into single shots — the viewer never gets the pairing. Fix: 2-3s establish at the start (and ideally at close).
4. **Captions don't differentiate speakers.** Same color, same style. Fix: color-code by speaker.
5. **AI lipsync drift between turns.** Speaker A in turn 1 has slightly different mouth shape / hairline than turn 3. Fix: lock the keyframe ref-image and the prompt vocabulary across all turns.
6. **Eyelines wrong in single-camera-cuts mode.** Both speakers look the same direction → reads as "they're filming separately, not talking." Fix: A looks frame-right, B looks frame-left (or vice versa) — opposite eyelines.
7. **Music with melody / drops.** Pulls focus from dialog. Fix: regenerate with "ambient bed, no melody, no drops" prompt.

---

## 4 worked examples

### Example 1 — Journalist + CEO interview, 60s

- **Format mode:** expert-interview, single-camera-cuts.
- **Speakers:** A = 30s male journalist archetype (casual blazer, neutral office). B = 40s female CEO archetype (structured outfit, modern boardroom — composited via separate background).
- **Voices:** A = warm-baritone male; B = articulate-mid-female.
- **Turn count:** 5 turns + 2-shot establish + closing 2-shot.
- **Script outline:**
  - 0-3s: 2-shot. A: "I've got a CEO who's about to disagree with everyone. [B], how are you?"
  - 3-9s: A turn — pointed question on industry consensus.
  - 9-21s: B turn — measured contrarian answer.
  - 21-24s: A reaction — "Hm. Walk me through that."
  - 24-36s: B turn — deeper explanation with example.
  - 36-44s: A turn — pushback question.
  - 44-56s: B turn — confident close on the point.
  - 56-60s: 2-shot close, A: "There you have it."
- **Captions:** lower-third with role tags, color-coded.
- **Music:** ambient documentary bed, -22dB.

### Example 2 — Two friends discussing skincare routine, 45s

- **Format mode:** peer-discussion, split-screen-static (vertical: stacked).
- **Speakers:** A = late-20s woman, casual at home. B = early-30s woman, casual at home (different room, same lighting style for cohesion).
- **Voices:** A = bright-energetic female; B = lower-warm female.
- **Turn count:** 6 turns, no b-roll.
- **Script outline:**
  - 0-3s: Both halves visible. A (top): "Okay, your routine — go." B (bottom): "It's so simple I'm embarrassed."
  - 3-10s: B answers with the full routine.
  - 10-13s: A reaction — "Wait, that's it?"
  - 13-22s: A counters with her routine.
  - 22-32s: B's response — "Actually that step you're doing is undoing the rest."
  - 32-40s: A processing + asking the follow-up.
  - 40-45s: Both halves, shared laugh — close.
- **Captions:** lower-third color-coded; A = soft cyan, B = warm amber.
- **Music:** ambient lofi bed.

### Example 3 — Podcast-style finance discussion, 90s, with b-roll

- **Format mode:** podcast-style, podcast-2-cam-setup.
- **Speakers:** A = 40s male host archetype (sit-down, mic visible). B = 50s female finance expert (sit-down opposite, mic visible).
- **Voices:** A = neutral-radio male; B = authoritative-clear female.
- **Turn count:** 3 long turns + 1 b-roll cutaway + closing.
- **Script outline:**
  - 0-3s: 2-shot wide. A cold-open: "Three minutes, one question — what changed in 2026?"
  - 3-15s: B answers with the macro setup.
  - 15-25s: A follow-up — "And on the consumer side?"
  - 25-40s: B answers the consumer question, mentions a chart.
  - 40-50s: B-roll cutaway — animated bar chart from kling-v3.0-pro, B's VO continues over.
  - 50-60s: Cut back to B finishing the point.
  - 60-75s: A — last question, the prediction.
  - 75-87s: B — confident prediction with caveat.
  - 87-90s: 2-shot close.
- **Captions:** lower-third, role-tagged, color-coded.
- **Music:** ambient documentary bed, ducked hard during dialog.

### Example 4 — Split-screen "his vs her" reaction to a third source, 45s

- **Format mode:** split-screen-reaction (third source as picture-in-picture top inset).
- **Speakers:** A = 30s man, casual home. B = 30s woman, casual home (separate environment).
- **Voices:** A = warm-baritone male; B = bright-energetic female.
- **Third source:** a 5s clip the user provides (or a generic generated reference clip — kling, no audio) that loops or plays in a top inset for the first 8s.
- **Turn count:** 4 turns + opening reaction beat.
- **Script outline:**
  - 0-3s: Both halves visible + third source on top inset playing. Both watch silently for 1.5s, then —
  - 3-5s: A: "Wait — pause it." B: "Yeah, that's not right."
  - 5-15s: A's take on what the source got wrong.
  - 15-25s: B's counter — partly agrees, adds a nuance.
  - 25-35s: A — concedes the nuance, makes a sharper point.
  - 35-45s: B — closes with the takeaway. Both halves, brief shared smile / nod.
- **Captions:** lower-third, color-coded; third source has no captions (it's the bait).
- **Music:** ambient bed at -25dB (lower than usual because the third source has its own audio for the first 8s).
